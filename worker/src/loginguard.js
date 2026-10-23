// Durable Object (SQLite-backed, one instance) that owns the login attempt counters.
// Every attempt is serialised through this object and RESERVED (counted) before the slow password
// check runs, so parallel guesses cannot all see "count 0": at most 5 checks per IP per 15 minutes
// and at most 51 per hour overall ever reach the password check. A correct password releases its
// reservation, so successes cost nothing.
//   POST /attempt {ip, now, epoch} -> {locked:false} | {locked:true, retryAfter}
//   POST /release {ip, now}        -> {}
// `epoch` comes from KV `locks:epoch`; when it changes, all counters are cleared (owner reset).
export const IP_LIMIT = 5;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const GLOBAL_LIMIT = 50;
const HOUR_MS = 60 * 60 * 1000;
const SWEEP_MS = 15 * 60 * 1000;

const secondsUntil = (ms, now) => Math.max(1, Math.ceil((ms - now) / 1000));

export class LoginGuard {
  constructor(state) {
    this.storage = state.storage;
    this.queue = Promise.resolve();
  }

  /** run one operation at a time, in arrival order (does not depend on input-gate behaviour) */
  serial(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    const body = await request.json();
    const result = await this.serial(() => (pathname === '/release' ? this.release(body) : this.attempt(body)));
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  }

  async syncEpoch(epoch, now) {
    const stored = (await this.storage.get('epoch')) ?? '';
    if (stored !== epoch) {
      await this.storage.deleteAll();
      await this.storage.put('epoch', epoch);
    }
    const swept = (await this.storage.get('swept')) ?? 0;
    if (now - swept > SWEEP_MS) { // drop expired per-IP windows so storage stays small
      const all = await this.storage.list({ prefix: 'ip:' });
      const dead = [...all].filter(([, v]) => v.reset <= now).map(([k]) => k);
      if (dead.length) await this.storage.delete(dead);
      await this.storage.put('swept', now);
    }
  }

  async attempt({ ip, now, epoch = '' }) {
    await this.syncEpoch(epoch, now);
    const key = `ip:${ip}`;
    const cur = await this.storage.get(key);
    const live = cur && cur.reset > now;
    if (live && cur.count >= IP_LIMIT) return { locked: true, retryAfter: secondsUntil(cur.reset, now) };

    const hour = Math.floor(now / HOUR_MS);
    const g = await this.storage.get('global');
    const gCount = g && g.hour === hour ? g.count : 0;
    if (gCount > GLOBAL_LIMIT) return { locked: true, retryAfter: secondsUntil((hour + 1) * HOUR_MS, now) };

    await this.storage.put(key, { count: (live ? cur.count : 0) + 1, reset: live ? cur.reset : now + IP_WINDOW_MS });
    await this.storage.put('global', { hour, count: gCount + 1 });
    return { locked: false };
  }

  async release({ ip, now }) {
    const key = `ip:${ip}`;
    const cur = await this.storage.get(key);
    if (cur && cur.reset > now) {
      if (cur.count <= 1) await this.storage.delete(key);
      else await this.storage.put(key, { ...cur, count: cur.count - 1 });
    }
    const g = await this.storage.get('global');
    if (g && g.hour === Math.floor(now / HOUR_MS) && g.count > 0) await this.storage.put('global', { ...g, count: g.count - 1 });
    return {};
  }
}
