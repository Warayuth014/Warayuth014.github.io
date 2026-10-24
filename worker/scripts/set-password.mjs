#!/usr/bin/env node
// Usage (run inside worker/); add --local to work on the local dev store, default is the real one (--remote):
//   node scripts/set-password.mjs               set the editor PIN
//   node scripts/set-password.mjs --revoke      log out every open session (new pw:ver)
//   node scripts/set-password.mjs --reset-locks clear all login lockouts (new locks:epoch)
// The PIN is read from the NEW_PASSWORD environment variable, or typed at a prompt when it is unset.
// The PIN is never printed. Only the salted PBKDF2 hash goes to KV (key pw:hash). Setting a PIN does not
// log anyone out; combine it with --revoke for that.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/auth.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const mode = flag('--local') ? '--local' : '--remote';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));

function kvPut(key, value) {
  if (!existsSync(wrangler)) {
    console.error('wrangler is not installed yet. Run "npm install" inside the worker folder first.');
    process.exit(1);
  }
  // No shell: the hash contains "$" characters that a shell would mangle. stdout is dropped so the
  // stored value is not echoed; wrangler's errors still show (stderr).
  const r = spawnSync(process.execPath, [wrangler, 'kv', 'key', 'put', key, value, '--binding=STATE', mode], { cwd, stdio: ['inherit', 'ignore', 'inherit'] });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function main() {
  if (flag('--reset-locks')) {
    // The Worker hands this marker to the LoginGuard, which clears its counters when it changes.
    kvPut('locks:epoch', String(Date.now()));
    console.log(`locks cleared (${mode.slice(2)})`);
    return;
  }
  if (flag('--revoke')) {
    kvPut('pw:ver', String(Date.now())); // any change of pw:ver invalidates every signed session
    console.log(`all sessions revoked (${mode.slice(2)})`);
    return;
  }

  let pin = process.env.NEW_PASSWORD;
  if (pin === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pin = await rl.question('New PIN (6-128 characters, shown while typing): ');
    rl.close();
  }
  if (typeof pin !== 'string' || pin.length < 6 || pin.length > 128) throw new Error('The PIN must be 6 to 128 characters.');
  kvPut('pw:hash', await hashPassword(pin));
  console.log(`password hash stored (${mode.slice(2)})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
