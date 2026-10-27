#!/usr/bin/env node
/**
 * Makes the ADMIN_ACCESS_CODE_HASH value for Admin Mode.
 *
 *   node scripts/admin-code-hash.mjs
 *
 * Type the administrator code when asked (it isn't shown), then paste the printed line into your
 * hosting provider's environment variables (Vercel → Project → Settings → Environment Variables)
 * as ADMIN_ACCESS_CODE_HASH. Never commit the code or put it in a file. Same format as
 * lib/admin/code.ts (scrypt, a fresh random salt each time).
 */
import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const r = 8;
const p = 1;

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (text) => (text.includes(question) ? write?.(text) : undefined);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const code = await ask("Administrator code (hidden): ");
if (code.length < 6) {
  console.error("That's shorter than 6 characters. Nothing was made.");
  process.exit(1);
}
const salt = randomBytes(16);
scrypt(code, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
  if (error) throw error;
  console.log(`\nADMIN_ACCESS_CODE_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}\n`);
});
