import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';

/* ── on-chain constants ── */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
// api.mainnet-beta.solana.com returns HTTP 403 to browser origins, so the
// embedded wallet could never read its balance from it. publicnode's Solana
// RPC is CORS-enabled and keyless — verified from the deployed origin.
export const DEFAULT_RPC = 'https://solana-rpc.publicnode.com';

/**
 * localStorage throws a SecurityError on opaque origins (file:// among them).
 * Reading it unguarded takes the whole app down before anything renders, so
 * every access goes through here.
 */
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ── associated token account ── */
export function ataFor(owner, mint = USDC_MINT) {
  return PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBytes(), new PublicKey(TOKEN_PROGRAM).toBytes(), new PublicKey(mint).toBytes()],
    new PublicKey(ATA_PROGRAM),
  )[0];
}

/**
 * TransferChecked rather than Transfer: the mint and decimals are verified
 * on-chain, so a wrong-mint or wrong-decimals bug fails instead of quietly
 * moving the wrong amount.
 */
function transferCheckedIx(source, mint, dest, owner, units, decimals) {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, BigInt(units), true);
  data[9] = decimals;
  return new TransactionInstruction({
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    programId: new PublicKey(TOKEN_PROGRAM),
    data,
  });
}

/** Idempotent, so a race between two payments can't fail the second one. */
function createAtaIx(payer, ata, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
    ],
    programId: new PublicKey(ATA_PROGRAM),
    data: new Uint8Array([1]),
  });
}

export function makeConnection(rpc = DEFAULT_RPC) {
  return new Connection(rpc, 'confirmed');
}

export async function fetchBalances(conn, pubkey) {
  const out = { sol: 0, usdc: 0, error: null };
  try {
    out.sol = (await conn.getBalance(pubkey)) / 1e9;
  } catch (e) { out.error = e.message; }
  try {
    const r = await conn.getParsedTokenAccountsByOwner(pubkey, { mint: new PublicKey(USDC_MINT) });
    out.usdc = r.value.length ? Number(r.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0) : 0;
  } catch (e) { out.error = out.error || e.message; }
  return out;
}

export async function fetchSignatures(conn, pubkey, limit = 8) {
  try { return await conn.getSignaturesForAddress(pubkey, { limit }); }
  catch { return []; }
}

/** Build, simulate, then hand back a transaction ready to sign. */
export async function buildTransfer(conn, from, to, units) {
  const mint = new PublicKey(USDC_MINT);
  const toPk = new PublicKey(to);
  const src = ataFor(from);
  const dst = ataFor(toPk);
  const tx = new Transaction();

  const dstInfo = await conn.getAccountInfo(dst);
  if (!dstInfo) tx.add(createAtaIx(from, dst, toPk, mint));
  tx.add(transferCheckedIx(src, mint, dst, from, units, USDC_DECIMALS));

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = from;

  const sim = await conn.simulateTransaction(tx);
  return { tx, lastValidBlockHeight, createsAta: !dstInfo, simError: sim.value.err, simLogs: sim.value.logs || [] };
}

/* ══════════════════════════════════════════════════════════════
   Embedded wallet — a real keypair generated in the browser and
   encrypted at rest with PBKDF2-SHA256 → AES-GCM.

   By default the encryption key is a random device secret, so signing
   in needs only an email. An optional passphrase makes the wallet
   portable to another device, with the obvious trade-off that nothing
   can recover it. Production should sit behind a provider that does
   key-sharding and social recovery.
   ══════════════════════════════════════════════════════════════ */
const enc = new TextEncoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/**
 * PIN-wrap the recoverable server seed so the backend can't reconstruct the
 * key alone (non-custodial 2-of-2). Reuses the same PBKDF2→AES-GCM as the
 * vault; a wrong PIN fails the GCM tag on unwrap rather than silently
 * producing a junk wallet.
 */
export async function wrapSeedWithPin(seedB64, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, unb64(seedB64));
  // wrapped blob = iv || ciphertext, base64 — the salt travels alongside.
  const blob = new Uint8Array(iv.length + ct.byteLength);
  blob.set(iv, 0); blob.set(new Uint8Array(ct), iv.length);
  return { wrapped: b64(blob), salt: b64(salt) };
}

export async function unwrapSeedWithPin(wrappedB64, saltB64, pin) {
  const blob = unb64(wrappedB64);
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const key = await deriveKey(pin, unb64(saltB64));
  const seed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct); // throws on wrong PIN
  return b64(new Uint8Array(seed));
}

export function deviceSecret() {
  let k = store.get('moo.dk', '');
  if (!k) { k = b64(crypto.getRandomValues(new Uint8Array(32))); store.set('moo.dk', k); }
  return k;
}

export function vault() {
  try { return JSON.parse(store.get('moo.vault', 'null')); } catch { return null; }
}

/**
 * v2 vault: the ciphertext is JSON { sk: [64 bytes], mnemonic } so the
 * recovery phrase is exportable later — encrypted with the same key as the
 * secret, never stored in the clear. v1 vaults (raw 64-byte ciphertext,
 * no mnemonic) still unlock; they simply have no phrase to show.
 */
async function sealVault(kp, mnemonic, email, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const payload = enc.encode(JSON.stringify({ sk: [...kp.secretKey], mnemonic: mnemonic || null }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  store.set('moo.vault', JSON.stringify({
    v: 2, salt: b64(salt), iv: b64(iv), ct: b64(ct), email, pk: kp.publicKey.toBase58(),
    hasMnemonic: !!mnemonic,
  }));
}

export async function createWallet(email, pass) {
  // Real BIP39 words + Phantom-compatible derivation (m/44'/501'/0'/0') —
  // the phrase shown at export restores this exact address anywhere.
  const { createHdWallet } = await import('./hd.js');
  const { mnemonic, keypair } = createHdWallet();
  await sealVault(keypair, mnemonic, email, pass);
  return keypair;
}

/** Import an external wallet (words / base58 / JSON) into the local vault. */
export async function importWalletToVault(kp, mnemonic, email, pass) {
  await sealVault(kp, mnemonic, email, pass);
  return kp;
}

/** Unlock, returning the phrase too (null for v1 vaults and raw-key imports). */
export async function unlockVault(pass) {
  const v = vault();
  if (!v) throw new Error('No wallet saved on this device.');
  const key = await deriveKey(pass, unb64(v.salt));
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct)),
  );
  if (v.v >= 2) {
    const { sk, mnemonic } = JSON.parse(new TextDecoder().decode(plain));
    return { keypair: Keypair.fromSecretKey(new Uint8Array(sk)), mnemonic: mnemonic || null };
  }
  return { keypair: Keypair.fromSecretKey(plain), mnemonic: null };
}

export async function unlockWallet(pass) {
  return (await unlockVault(pass)).keypair;
}

/** Detect an injected browser wallet. */
export function detectProvider() {
  if (typeof window === 'undefined') return null;
  if (window.phantom?.solana) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.backpack) return window.backpack;
  if (window.solana) return window.solana;
  return null;
}

/**
 * Wallet extensions do not inject into file:// pages, getUserMedia is
 * blocked there, and storage throws. Diagnose precisely rather than
 * reporting a generic "no wallet found", which sends people off to
 * reinstall software they already have.
 */
export function diagnose() {
  if (typeof window === 'undefined') return { ok: false, cause: 'server' };
  const proto = window.location.protocol;
  const host = window.location.hostname;
  const isFile = proto === 'file:';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const secure = window.isSecureContext === true || proto === 'https:' || isLocal;
  const found = {
    Phantom: !!window.phantom?.solana,
    Solflare: !!window.solflare,
    Backpack: !!window.backpack,
    'window.solana': !!window.solana,
  };
  const any = Object.values(found).some(Boolean);
  let cause = null;
  if (isFile && !any) cause = 'file';
  else if (!any && !secure) cause = 'insecure';
  else if (!any) cause = 'missing';
  return { proto, host, isFile, secure, found, any, cause,
    mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) };
}
