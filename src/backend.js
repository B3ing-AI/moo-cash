/**
 * moo.cash backend client.
 *
 * The rest of this app is client-only: embedded Solana wallet, client-side QR
 * decode, simulated settlement. This module is the bridge to the real
 * settlement service (moo-cash-backend) — the thing the order sheet used to
 * mean by "the payout leg isn't wired".
 *
 * ── When is a backend used? ────────────────────────────────────────────────
 *
 * Resolution order for the API base URL:
 *   1. localStorage 'moo.api'   (user-settable, survives deploys)
 *   2. VITE_API_URL             (build-time, for a hosted pairing)
 *   3. http://localhost:4000    (only when the app itself runs on localhost —
 *                                the local one-command product)
 *   4. none → every feature in this file quietly disables and the app behaves
 *      exactly as before. The deployed Vercel site without a configured
 *      backend loses nothing.
 *
 * ── Money discipline ───────────────────────────────────────────────────────
 *
 * All amounts crossing this boundary are integer minor-unit STRINGS
 * ("25000" = ₹250.00). Never parseFloat an amount from the API — JSON numbers
 * lose precision past 2^53 and the backend refuses them anyway.
 */

import { store } from './wallet.js';

const SESSION_KEY = 'moo.session';

export function apiUrl() {
  const saved = store.get('moo.api');
  if (saved === 'off') return null;                    // explicit opt-out
  if (saved) return saved.replace(/\/$/, '');
  const env = import.meta.env?.VITE_API_URL;
  if (env) return String(env).replace(/\/$/, '');
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    return 'http://localhost:4000';
  }
  return null;
}

export const hasBackend = () => apiUrl() !== null;

/* ── session ── */

export function session() {
  try {
    const raw = store.get(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s) {
  store.set(SESSION_KEY, JSON.stringify(s));
  return s;
}

/** Store a session returned by a social sign-in endpoint. */
export function adoptSession(out) {
  return saveSession({
    accessToken: out.accessToken,
    refreshToken: out.refreshToken,
    user: out.user,
    demo: !!out.demo,
    provider: out.provider || 'email',
  });
}

/** Which sign-in methods this backend actually offers. Public. */
export async function authProviders() {
  return call('GET', '/auth/providers', undefined, { auth: false });
}

export async function loginGoogle(idToken) {
  return adoptSession(await call('POST', '/auth/google', { idToken }, { auth: false }));
}

export async function loginTelegram(tgUser) {
  return adoptSession(await call('POST', '/auth/telegram', tgUser, { auth: false }));
}

export async function loginX({ code, codeVerifier, redirectUri }) {
  return adoptSession(await call('POST', '/auth/x', { code, codeVerifier, redirectUri }, { auth: false }));
}

/** Telegram Mini App auto-login from signed initData. */
export async function loginTelegramMiniApp(initData) {
  return adoptSession(await call('POST', '/auth/telegram/miniapp', { initData }, { auth: false }));
}

/* ── recoverable embedded wallet ── */

/**
 * Fetch the server-held wallet seed for the signed-in identity. Same identity
 * → same seed → same wallet on every device (the gmgn.ai model). When a PIN
 * is set, `seed` is a wrapped blob to be unwrapped locally with the PIN.
 */
export async function walletRecovery() {
  return call('GET', '/wallet/recovery');
}

/** Turn on a PIN: send the locally-wrapped seed + its salt. */
export async function setWalletPin(wrappedSeed, pinSalt) {
  return call('POST', '/wallet/recovery/pin', { wrappedSeed, pinSalt });
}

export function clearSession() {
  store.set(SESSION_KEY, '');
}

/* ── fetch wrapper ── */

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(method, path, body, { auth = true, idempotent = false } = {}) {
  const base = apiUrl();
  if (!base) throw new ApiError('NO_BACKEND', 'No backend configured', 0);

  const headers = { 'Content-Type': 'application/json' };
  const s = session();
  if (auth && s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  // Retries are the normal path on mobile data; the key makes them safe.
  if (idempotent) headers['Idempotency-Key'] = crypto.randomUUID();

  let res;
  try {
    res = await fetch(`${base}/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('UNREACHABLE', 'Backend unreachable — is the local product running?', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* 204s etc. */ }

  if (!res.ok) {
    throw new ApiError(data?.code || 'ERROR', data?.message || `HTTP ${res.status}`, res.status);
  }
  return data;
}

/* ── auth ── */

/**
 * Email-only session. DEV/DEMO: the backend only honours this when it runs
 * with ALLOW_SIMULATED_DEPOSITS=true (never in production). The account
 * arrives funded with demo USDC so a payment can actually happen.
 */
export async function openDemoSession(email) {
  const out = await call('POST', '/auth/demo-session', { email }, { auth: false });
  return saveSession({
    accessToken: out.accessToken,
    refreshToken: out.refreshToken,
    user: out.user,
    demo: !!out.demo,
  });
}

/* ── wallet ── */

export async function ledgerBalances() {
  const out = await call('GET', '/wallet/balances');
  const usdc = (out.balances || []).find(b => b.assetSymbol === 'USDC');
  if (!usdc) return { available: 0, held: 0 };
  const scale = 10 ** usdc.available.decimals;
  return {
    // Display-only floats; the API keeps the exact strings.
    available: Number(BigInt(usdc.available.value)) / scale,
    held: Number(BigInt(usdc.held.value)) / scale,
    raw: usdc,
  };
}

/* ── merchant / receive ── */

/**
 * Make sure this account can receive: merchant mode on + a profile matching
 * the chosen region. Idempotent — safe to call before every QR mint.
 */
export async function ensureMerchant({ name, fiatCurrency, countryCode }) {
  const me = await call('GET', '/users/me');
  if (!me.merchantMode) {
    await call('PATCH', '/users/me', { merchantMode: true, merchantPayoutPreference: 'mock' });
  }
  await call('PUT', '/merchants/me', {
    displayName: name,
    fiatCurrency,
    countryCode,
    payoutRail: 'mock',
    payoutHandle: `${me.email.split('@')[0]}@moo-demo`,
  });
}

/** Mint a signed moocash:// QR. Omit fiatAmount for an open-amount code. */
export async function mintQr({ fiatAmountMinor, memo }) {
  const body = {};
  if (fiatAmountMinor) body.fiatAmount = String(fiatAmountMinor);
  if (memo) body.memo = memo;
  const out = await call('POST', '/merchants/me/qr', body, { idempotent: true });
  return out; // { payload, compact, invoiceId }
}

/* ── paying ── */

export const isMooQr = raw => typeof raw === 'string' && raw.trim().startsWith('moocash://pay?');

/** Verify a scanned moocash QR with the server. Bad signature = hard stop. */
export async function decodeQr(raw) {
  return call('POST', '/merchants/qr/decode', { raw: raw.trim() }, { auth: false });
}

/**
 * Create the order. The backend quotes, locks the rate, holds the funds,
 * broadcasts with a 60s TTL and — when internal liquidity can fill it —
 * settles before this promise even resolves.
 */
export async function createOrder({ invoiceId, fiatAmountMinor }) {
  return call(
    'POST',
    '/orders',
    { invoiceId, fiatAmount: String(fiatAmountMinor), assetSymbol: 'USDC', chain: 'MOCK' },
    { idempotent: true },
  );
}

export async function getOrder(id) {
  return call('GET', `/orders/${id}`);
}

/**
 * Follow an order to a terminal state. The instant path settles inside the
 * create call itself, so this usually returns immediately; polling covers the
 * peer-book path. (Socket.IO is the production answer; polling keeps the
 * frontend dependency-free.)
 */
/** Raise a support ticket on a LOCKED order (ambiguous payout, funds held). */
export async function raiseTicket(orderId, message) {
  return call('POST', `/orders/${orderId}/ticket`, { message: message || '' });
}

export async function waitForOrder(id, { timeoutMs = 65_000, intervalMs = 900 } = {}) {
  // LOCKED is terminal for the wait: the payment couldn't be confirmed and the
  // funds are held for reconciliation — stop polling and show the state.
  const terminal = new Set(['SETTLED', 'TIMEOUT', 'CANCELLED', 'FAILED', 'LOCKED']);
  const deadline = Date.now() + timeoutMs;
  let last = await getOrder(id);
  while (!terminal.has(last.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    last = await getOrder(id);
  }
  return last;
}

/* ── the corridor order market ── */

/**
 * Live rates for one corridor: moving mid, seller rate, buyer rate, the
 * demand/supply displacement in bps, and the tick history for the sparkline.
 * Public — works before sign-in.
 */
export async function getMarket(cur) {
  return call('GET', `/market/${cur}`, undefined, { auth: false });
}

/**
 * Place a standing sell: "convert `amountCrypto` USDC to fiat when the rate
 * I get reaches `limitRate`". Funds are held immediately; the engine pays
 * the stored handle when the price crosses.
 */
export async function placeLimitOrder({ fiatCurrency, amountCrypto, limitRate, payoutHandle, expiresInHours = 24 }) {
  return call('POST', '/limit-orders', {
    fiatCurrency,
    amountCrypto: String(amountCrypto),
    limitRate: String(limitRate),
    payoutRail: 'mock',
    payoutHandle,
    expiresInHours,
  }, { idempotent: true });
}

export async function listLimitOrders() {
  return call('GET', '/limit-orders');
}

export async function cancelLimitOrder(id) {
  return call('DELETE', `/limit-orders/${id}`);
}

export { ApiError };
