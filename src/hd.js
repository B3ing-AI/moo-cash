/**
 * HD wallet derivation — REAL, Phantom-compatible.
 *
 * The contract that makes import/export honest: the 12 words shown at
 * creation, typed into Phantom, Solflare, or Backpack, produce the SAME
 * address. That pins the whole stack to the ecosystem standard:
 *
 *   BIP39   mnemonic  → 64-byte seed        (@scure/bip39, audited)
 *   SLIP-0010 ed25519 → m/44'/501'/0'/0'    (implemented below)
 *   Keypair.fromSeed(32-byte derived key)   (@solana/web3.js)
 *
 * SLIP-0010 for ed25519 is deliberately tiny — hardened derivation only,
 * one HMAC-SHA512 per path segment — so it is implemented here against
 * @noble/hashes rather than pulling a package that drags node polyfills
 * into the browser bundle. It is verified by a differential test
 * (scripts/test-hd.mjs) against an independent implementation.
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { hkdf } from '@noble/hashes/hkdf';
import { entropyToMnemonic, generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { Keypair } from '@solana/web3.js';

export const SOLANA_PATH = "m/44'/501'/0'/0'";
const HARDENED = 0x80000000;

const te = new TextEncoder();

/** SLIP-0010 master key for ed25519. */
function master(seed) {
  const I = hmac(sha512, te.encode('ed25519 seed'), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** SLIP-0010 hardened child. ed25519 supports ONLY hardened derivation. */
function child({ key, chainCode }, index) {
  const data = new Uint8Array(1 + 32 + 4);
  data.set(key, 1); // data[0] stays 0x00
  new DataView(data.buffer).setUint32(33, (index + HARDENED) >>> 0, false);
  const I = hmac(sha512, chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** Derive the 32-byte ed25519 seed for a path like m/44'/501'/0'/0'. */
export function deriveSeed(seed64, path = SOLANA_PATH) {
  const segs = path.split('/');
  if (segs[0] !== 'm') throw new Error(`path must start with m: ${path}`);
  let node = master(seed64);
  for (const s of segs.slice(1)) {
    if (!s.endsWith("'")) throw new Error(`ed25519 requires hardened segments: ${s}`);
    node = child(node, parseInt(s.slice(0, -1), 10));
  }
  return node.key;
}

/** New wallet: 12 real BIP39 words + the keypair they deterministically produce. */
export function createHdWallet() {
  const mnemonic = generateMnemonic(wordlist, 128); // 12 words
  return { mnemonic, keypair: keypairFromMnemonic(mnemonic) };
}

/**
 * DETERMINISTIC recovery: server seed → the user's 12-word mnemonic.
 *
 * This is the heart of "log in with Telegram (or Google, X, email) on any
 * device and reach the same funds", the gmgn.ai model. The server holds a
 * random 32-byte seed per identity and releases it only to a verified
 * session; this turns that seed into a real BIP39 phrase the same way every
 * time, so the wallet is reconstructed identically everywhere — and the
 * phrase still restores in Phantom.
 *
 * HKDF-SHA256 domain-separates the wallet entropy from the raw seed, so the
 * stored seed is never itself a key and the derivation is versioned by the
 * `info` string (bump it and every wallet moves — so it is frozen).
 */
export function mnemonicFromServerSeed(seedBytes) {
  const seed = seedBytes instanceof Uint8Array ? seedBytes : new Uint8Array(seedBytes);
  if (seed.length < 16) throw new Error('server seed must be at least 16 bytes');
  const entropy = hkdf(sha256, seed, new Uint8Array(0), te.encode('moo.cash/sol-wallet/v1'), 16);
  return entropyToMnemonic(entropy, wordlist); // 12 words, deterministic
}

/** The keypair a server seed yields — one call site's convenience. */
export function keypairFromServerSeed(seedBytes) {
  return keypairFromMnemonic(mnemonicFromServerSeed(seedBytes));
}

export function keypairFromMnemonic(mnemonic, path = SOLANA_PATH) {
  const words = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  if (!validateMnemonic(words, wordlist)) {
    throw new Error('Not a valid recovery phrase — check the words and their order.');
  }
  return Keypair.fromSeed(deriveSeed(mnemonicToSeedSync(words), path));
}

/* ── base58, for Phantom's "export private key" string format ── */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = Object.fromEntries([...B58].map((c, i) => [c, BigInt(i)]));

export function toBase58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

export function fromBase58(s) {
  let n = 0n;
  for (const c of s) {
    const v = B58_MAP[c];
    if (v === undefined) throw new Error(`invalid base58 character: ${c}`);
    n = n * 58n + v;
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== '1') break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

/**
 * Import anything a user might paste:
 *   - 12/24 recovery words           (Phantom/Solflare/Backpack export)
 *   - base58 secret key              (Phantom "export private key")
 *   - JSON array of 64 bytes         (solana-keygen / our old export)
 * Returns { keypair, kind, mnemonic? } or throws with a human reason.
 */
export function importWallet(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('Paste your recovery phrase or private key first.');

  // JSON byte array
  if (s.startsWith('[')) {
    let arr;
    try { arr = JSON.parse(s); } catch { throw new Error('That JSON did not parse.'); }
    if (!Array.isArray(arr) || (arr.length !== 64 && arr.length !== 32)) {
      throw new Error(`Expected 64 (or 32) bytes, got ${Array.isArray(arr) ? arr.length : 'not an array'}.`);
    }
    const bytes = new Uint8Array(arr);
    const keypair = arr.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
    return { keypair, kind: 'json' };
  }

  // Recovery words
  const words = s.toLowerCase().split(/\s+/);
  if (words.length >= 12 && words.every(w => /^[a-z]+$/.test(w))) {
    const mnemonic = words.join(' ');
    return { keypair: keypairFromMnemonic(mnemonic), kind: 'mnemonic', mnemonic };
  }

  // base58 secret key (64 bytes → 87-88 chars typically)
  if (/^[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(s)) {
    const bytes = fromBase58(s);
    if (bytes.length !== 64 && bytes.length !== 32) {
      throw new Error(`Decoded ${bytes.length} bytes — a Solana private key is 64 (or a 32-byte seed).`);
    }
    const keypair = bytes.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
    return { keypair, kind: 'base58' };
  }

  throw new Error('Unrecognised format. Paste 12/24 words, a base58 key, or a JSON byte array.');
}
