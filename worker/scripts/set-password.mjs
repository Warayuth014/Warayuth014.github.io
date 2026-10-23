#!/usr/bin/env node
// Usage (run inside worker/):
//   node scripts/set-password.mjs [--local|--remote]            set the editor PIN (default --remote)
//   node scripts/set-password.mjs --reset-locks [--ip 1.2.3.4]  clear the lockout counters (--local|--remote too)
// The PIN is read from the NEW_PASSWORD environment variable, or typed at a prompt when it is unset.
// The PIN is never printed. Only the salted PBKDF2 hash goes to KV (key pw:hash); pw:ver is left alone
// (changing the PIN with this script does not log out an open session; use /password in the editor for that).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/auth.js';
import { globalKey, ipKey } from '../src/ratelimit.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const mode = flag('--local') ? '--local' : '--remote';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));

function kv(...sub) {
  if (!existsSync(wrangler)) {
    console.error('wrangler is not installed yet. Run "npm install" inside the worker folder first.');
    process.exit(1);
  }
  // No shell: the hash contains "$" characters that a shell would mangle.
  const r = spawnSync(process.execPath, [wrangler, 'kv', 'key', ...sub, '--binding=STATE', mode], { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function main() {
  if (flag('--reset-locks')) {
    kv('delete', globalKey(Date.now()));
    const i = args.indexOf('--ip');
    if (i !== -1) {
      const ip = args[i + 1];
      if (!ip || ip.startsWith('--')) throw new Error('--ip needs an address, e.g. --ip 203.0.113.7');
      kv('delete', ipKey(ip));
    }
    console.log('locks cleared');
    return;
  }

  let pin = process.env.NEW_PASSWORD;
  if (pin === undefined) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pin = await rl.question('New PIN (6-128 characters, shown while typing): ');
    rl.close();
  }
  if (typeof pin !== 'string' || pin.length < 6 || pin.length > 128) throw new Error('The PIN must be 6 to 128 characters.');
  kv('put', 'pw:hash', await hashPassword(pin));
  console.log(`password hash stored (${mode.slice(2)})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
