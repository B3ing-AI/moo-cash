/**
 * Social sign-in — the browser half of three REAL flows.
 *
 *   GOOGLE    Google Identity Services renders its own button; the callback
 *             hands us an ID token which the backend verifies against
 *             Google's JWKS before any session exists.
 *
 *   TELEGRAM  The official Login Widget (an iframe Telegram serves) calls
 *             onauth with signed fields; the backend recomputes the HMAC
 *             with the bot token. We never see or need the token here.
 *
 *   X         OAuth2 + PKCE as a public client: we generate the verifier,
 *             send the user to x.com/i/oauth2/authorize, and on return hand
 *             code + verifier to the backend, which does the exchange
 *             (X's token endpoint blocks browser CORS by design).
 *
 * Which of these appear in the UI is driven by GET /v1/auth/providers —
 * a provider with no credentials configured server-side simply isn't
 * offered. Nothing here pretends.
 */

import * as backend from './backend.js';

let providersCache = null;

export async function getProviders() {
  if (providersCache) return providersCache;
  providersCache = await backend.authProviders();
  return providersCache;
}

/* ── Google ── */

let gisLoaded = null;
function loadGis() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

/**
 * Render the real Google button into `container`. Resolves the session when
 * the user completes the flow (the promise stays pending until then).
 */
export async function mountGoogleButton(container, clientId, onSession, onError) {
  const google = await loadGis();
  google.accounts.id.initialize({
    client_id: clientId,
    callback: async (resp) => {
      try { onSession(await backend.loginGoogle(resp.credential)); }
      catch (e) { onError(e); }
    },
  });
  google.accounts.id.renderButton(container, {
    theme: 'outline', size: 'large', width: Math.min(360, container.clientWidth || 320),
    text: 'continue_with', shape: 'pill',
  });
}

/* ── Telegram ── */

/**
 * Mount the official widget. Telegram requires a GLOBAL callback name, so a
 * unique one is registered per mount and cleaned up after.
 */
export function mountTelegramWidget(container, botUsername, onSession, onError) {
  const cb = `__mooTgAuth_${Math.random().toString(36).slice(2)}`;
  window[cb] = async (user) => {
    try { onSession(await backend.loginTelegram(user)); }
    catch (e) { onError(e); }
    finally { delete window[cb]; }
  };
  const s = document.createElement('script');
  s.src = 'https://telegram.org/js/telegram-widget.js?22';
  s.async = true;
  s.setAttribute('data-telegram-login', botUsername);
  s.setAttribute('data-size', 'large');
  s.setAttribute('data-radius', '20');
  s.setAttribute('data-onauth', `${cb}(user)`);
  s.setAttribute('data-request-access', 'write');
  container.appendChild(s);
  return () => { delete window[cb]; };
}

/* ── X (PKCE) ── */

const X_AUTHZ = 'https://x.com/i/oauth2/authorize';
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function startXLogin(clientId) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${location.origin}/`;

  sessionStorage.setItem('moo.x.pkce', JSON.stringify({ verifier, state, redirectUri }));

  const u = new URL(X_AUTHZ);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'users.read tweet.read');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  location.assign(u.toString());
}

/**
 * Call once on app boot: if the URL carries an X redirect (?code&state) that
 * matches the PKCE we stashed, finish the sign-in and clean the URL.
 * Returns the session or null.
 */
export async function completeXLoginIfReturning() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  let stash = null;
  try { stash = JSON.parse(sessionStorage.getItem('moo.x.pkce') || 'null'); } catch { /* no */ }
  if (!stash || stash.state !== state) return null; // not ours, or a replay
  sessionStorage.removeItem('moo.x.pkce');

  const session = await backend.loginX({
    code, codeVerifier: stash.verifier, redirectUri: stash.redirectUri,
  });
  // Strip ?code&state so refreshes don't retry a burnt code.
  history.replaceState(null, '', location.pathname);
  return session;
}
