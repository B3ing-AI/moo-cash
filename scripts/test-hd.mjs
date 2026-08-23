/**
 * Proof that import/export is REAL, not decorative:
 *
 *   1. DIFFERENTIAL — our SLIP-0010 ed25519 derivation must byte-match an
 *      independent implementation (ed25519-hd-key, the library the Solana
 *      ecosystem's own tooling uses) across 50 random seeds and paths.
 *   2. SLIP-0010 SPEC VECTOR — the published test vector for ed25519.
 *   3. ROUND TRIPS — words → keypair → export → import → same address,
 *      for every supported paste format (words, base58, JSON array).
 *
 * Run: npx vite-node scripts/test-hd.mjs   (vite resolves the src imports)
 */
import { randomBytes } from 'node:crypto';
import { derivePath } from 'ed25519-hd-key';
import {
  deriveSeed, createHdWallet, keypairFromMnemonic, importWallet,
  toBase58, fromBase58, SOLANA_PATH,
} from '../src/hd.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { failures++; console.error(`FAIL  ${name} ${detail}`); }
  else console.log(`ok    ${name}`);
};
const hex = (u8) => Buffer.from(u8).toString('hex');

// ── 1. differential vs ed25519-hd-key ─────────────────────────────────────
{
  let all = true;
  for (let i = 0; i < 50; i++) {
    const seed = randomBytes(64);
    const depth = 1 + (i % 4);
    const path = 'm/' + Array.from({ length: depth }, () => `${Math.floor(Math.random() * 1000)}'`).join('/');
    const ours = hex(deriveSeed(new Uint8Array(seed), path));
    const theirs = hex(derivePath(path, seed.toString('hex')).key);
    if (ours !== theirs) { all = false; console.error(`  mismatch at ${path}`); break; }
  }
  check('differential: 50 random seeds × paths match ed25519-hd-key', all);

  const seed = randomBytes(64);
  const ours = hex(deriveSeed(new Uint8Array(seed), SOLANA_PATH));
  const theirs = hex(derivePath(SOLANA_PATH, seed.toString('hex')).key);
  check(`differential: the Solana path ${SOLANA_PATH}`, ours === theirs);
}

// ── 2. SLIP-0010 published ed25519 test vector 1 ─────────────────────────
{
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const k = hex(deriveSeed(new Uint8Array(seed), "m/0'"));
  check(
    'SLIP-0010 spec vector m/0\'',
    k === '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3',
    `got ${k}`,
  );
}

// ── 3. round trips through every import format ────────────────────────────
{
  const { mnemonic, keypair } = createHdWallet();
  check('creation yields 12 words', mnemonic.split(' ').length === 12);

  const again = keypairFromMnemonic(mnemonic);
  check('same words → same address', again.publicKey.equals(keypair.publicKey));

  const viaWords = importWallet(`  ${mnemonic.toUpperCase()}  `); // sloppy paste
  check('import: words (case/space-insensitive)', viaWords.keypair.publicKey.equals(keypair.publicKey));

  const b58 = toBase58(keypair.secretKey);
  const viaB58 = importWallet(b58);
  check('import: base58 secret key', viaB58.keypair.publicKey.equals(keypair.publicKey));
  check('base58 round-trip bytes', hex(fromBase58(b58)) === hex(keypair.secretKey));

  const viaJson = importWallet(JSON.stringify([...keypair.secretKey]));
  check('import: JSON 64-byte array', viaJson.keypair.publicKey.equals(keypair.publicKey));

  for (const [bad, why] of [
    ['abandon abandon abandon', 'too few words'],
    ['abandon '.repeat(11) + 'zzzzz', 'bad word'],
    ['[1,2,3]', 'wrong byte count'],
    ['', 'empty'],
    ['ThisIsNotAKey!!!', 'garbage'],
  ]) {
    let threw = false;
    try { importWallet(bad); } catch { threw = true; }
    check(`rejects: ${why}`, threw);
  }
}

console.log(failures === 0 ? '\nHD WALLET: ALL CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
