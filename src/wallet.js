import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';

/* ── on-chain constants ── */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

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

export function deviceSecret() {
  let k = store.get('moo.dk', '');
  if (!k) { k = b64(crypto.getRandomValues(new Uint8Array(32))); store.set('moo.dk', k); }
  return k;
}

export function vault() {
  try { return JSON.parse(store.get('moo.vault', 'null')); } catch { return null; }
}

export async function createWallet(email, pass) {
  const kp = Keypair.generate();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, kp.secretKey);
  store.set('moo.vault', JSON.stringify({
    v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), email, pk: kp.publicKey.toBase58(),
  }));
  return kp;
}

export async function unlockWallet(pass) {
  const v = vault();
  if (!v) throw new Error('No wallet saved on this device.');
  const key = await deriveKey(pass, unb64(v.salt));
  const secret = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct));
  return Keypair.fromSecretKey(new Uint8Array(secret));
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
