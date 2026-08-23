import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MooCore from './core.js';
import { MARKETS, byCode, fmtLocal, fmtUsd } from './markets.js';
import { fetchRates, quoteMarket } from './rates.js';
import {
  store, vault, deviceSecret, createWallet, unlockWallet, unlockVault, importWalletToVault,
  wrapSeedWithPin, unwrapSeedWithPin,
  detectProvider, diagnose, makeConnection, fetchBalances, DEFAULT_RPC,
} from './wallet.js';
import { importWallet as parseImport, toBase58, keypairFromServerSeed, mnemonicFromServerSeed } from './hd.js';

import * as backend from './backend.js';
import * as social from './social.js';
import { Header, Nav, Sheet, Toast, Icon } from './components/ui.jsx';
import Flag from './components/Flag.jsx';
import CowLogo from './components/CowLogo.jsx';

import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import ScanPay from './screens/ScanPay.jsx';
import Graze from './screens/Graze.jsx';
import World from './screens/World.jsx';
import Market from './screens/Market.jsx';
import Settings from './screens/Settings.jsx';

const INSTANT_THRESHOLD = 200;
const UNVERIFIED_CAP = 200;

export default function App() {
  /* ── persisted preferences ── */
  const [onboarded, setOnboarded] = useState(() => store.get('moo.onboarded') === '1');
  const [region, setRegion] = useState(() => store.get('moo.region', 'IN'));
  const [rpc, setRpc] = useState(() => store.get('moo.rpc', DEFAULT_RPC));
  const [hideBalances, setHideBalances] = useState(false);
  const [notifications, setNotifications] = useState(true);

  /* ── session ── */
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [rates, setRates] = useState(null);
  const [rateSource, setRateSource] = useState(null);

  const [keypair, setKeypair] = useState(null);
  const [provider, setProvider] = useState(null);
  const [address, setAddress] = useState(null);
  const [email, setEmail] = useState(() => vault()?.email || '');
  const [usdc, setUsdc] = useState(0);
  const [sol, setSol] = useState(0);

  const [decoded, setDecoded] = useState(null);
  const [order, setOrder] = useState(null);
  // Which corridor's order market is open (null = the World list).
  const [marketCur, setMarketCur] = useState(null);
  // Recovery material awaiting a PIN to unwrap (null = none pending).
  const [pinPending, setPinPending] = useState(null);

  /* ── backend (real settlement service) ── */
  const [bkSession, setBkSession] = useState(() => (backend.hasBackend() ? backend.session() : null));
  const [ledger, setLedger] = useState({ available: 0, held: 0 });
  const [mooQr, setMooQr] = useState(null);      // { compact, dataUrl, amount }
  const [mooOrder, setMooOrder] = useState(null); // real order result
  const [payBusy, setPayBusy] = useState(false);

  const refreshLedger = useCallback(async () => {
    if (!backend.hasBackend() || !backend.session()) return;
    try { setLedger(await backend.ledgerBalances()); } catch { /* backend offline */ }
  }, []);

  useEffect(() => { refreshLedger(); }, [refreshLedger, bkSession]);

  // On boot: finish an X OAuth redirect, OR auto-sign-in if we're running
  // INSIDE Telegram (a Mini App) — same identity, same recoverable wallet, so
  // opening moo.cash from the Telegram bot lands straight on your funds.
  useEffect(() => {
    if (!backend.hasBackend()) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (initData && !backend.session()) {
      try { window.Telegram.WebApp.ready?.(); } catch { /* not critical */ }
      backend.loginTelegramMiniApp(initData)
        .then(adoptBackendSession)
        .catch(e => toast(e.message || 'Telegram sign-in failed'));
      return;
    }
    social.completeXLoginIfReturning()
      .then(s => { if (s) adoptBackendSession(s); })
      .catch(e => toast(e.message || 'X sign-in failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = useCallback(msg => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
  }, []);

  /* ── rates ── */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetchRates();
      if (!alive) return;
      setRates(r.rates);
      setRateSource(r.source);
    };
    load();
    const id = setInterval(load, 120000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const quote = useMemo(() => quoteMarket(region, rates), [region, rates]);

  /* ── persistence ── */
  useEffect(() => { store.set('moo.region', region); }, [region]);
  useEffect(() => { store.set('moo.rpc', rpc); }, [rpc]);

  const connection = useMemo(() => makeConnection(rpc), [rpc]);

  const refresh = useCallback(async pk => {
    const key = pk || address;
    if (!key) return;
    const { PublicKey } = await import('@solana/web3.js');
    const b = await fetchBalances(connection, new PublicKey(key));
    setUsdc(b.usdc);
    setSol(b.sol);
    if (b.error) toast('Balance read failed — try a private RPC');
  }, [address, connection, toast]);

  /* ── sign in ── */
  const signInEmail = async (mail, pass) => {
    setEmail(mail);

    // With the backend up, the wallet is RECOVERABLE: it derives from the
    // server seed tied to this identity, so the same email reaches the same
    // wallet on every device. A passphrase forces the classic self-custody
    // path (local key, portable only via the phrase) instead.
    if (backend.hasBackend() && !pass) {
      try {
        const bk = await backend.openDemoSession(mail);
        setBkSession(bk);
        await resolveWallet(bk);
        setSheet(null);
        toast('Wallet ready 🐄');
        return;
      } catch (e) {
        toast(e.code === 'UNREACHABLE' ? 'Settlement service offline — using this device' : 'moo account unavailable');
        // fall through to a local wallet so the user is never locked out
      }
    }

    const secret = pass || deviceSecret();
    const existing = vault();
    const kp = existing && existing.email === mail
      ? await unlockWallet(secret)
      : await createWallet(mail, secret);
    setKeypair(kp);
    setAddress(kp.publicKey.toBase58());
    setSheet(null);
    toast('Wallet ready 🐄');
    refresh(kp.publicKey.toBase58());

    if (backend.hasBackend() && pass) {
      // Passphrase wallet still gets a settlement session for payments.
      try {
        setBkSession(await backend.openDemoSession(mail));
      } catch (e) {
        toast(e.code === 'UNREACHABLE' ? 'Settlement service offline' : 'moo account unavailable');
      }
    }
  };

  /**
   * Turn a server recovery seed into the live wallet and cache it locally.
   * This is what makes the SAME identity resolve to the SAME wallet on every
   * device (the gmgn.ai model): the seed is derived deterministically into a
   * real BIP39 mnemonic, so device A and device B rebuild the identical
   * address and reach the same funds.
   */
  const applyServerSeed = async (seedB64, mail) => {
    const seed = Uint8Array.from(atob(seedB64), c => c.charCodeAt(0));
    const kp = keypairFromServerSeed(seed);
    const mnemonic = mnemonicFromServerSeed(seed);
    await importWalletToVault(kp, mnemonic, mail, deviceSecret());
    setKeypair(kp);
    setAddress(kp.publicKey.toBase58());
    refresh(kp.publicKey.toBase58());
    return kp;
  };

  /**
   * A backend session exists (social or email). Resolve the recoverable
   * wallet from the server seed. If the user protected it with a PIN, the
   * seed comes back wrapped and we ask for the PIN before deriving.
   */
  const resolveWallet = async (bk) => {
    const mail = bk?.user?.email || email || 'wallet@moo.cash';
    setEmail(mail);
    try {
      const rec = await backend.walletRecovery();
      if (rec.pinSet) {
        // Wrapped — hold it and prompt. The wallet appears once unlocked.
        setPinPending({ ...rec, mail });
        setSheet('walletpin');
        return;
      }
      await applyServerSeed(rec.seed, mail);
    } catch {
      // Backend reachable but recovery failed — fall back to a device wallet
      // so the user is not locked out; still real, just not cross-device.
      try {
        const existing = vault();
        const kp = existing && existing.email === mail
          ? await unlockWallet(deviceSecret())
          : await createWallet(mail, deviceSecret());
        setKeypair(kp); setAddress(kp.publicKey.toBase58()); refresh(kp.publicKey.toBase58());
      } catch { /* session-only */ }
    }
  };

  const adoptBackendSession = async (bk) => {
    setBkSession(bk);
    await resolveWallet(bk);
    setSheet(null);
    toast('Signed in 🐄');
  };

  /** Finish a PIN-protected recovery once the user types the PIN. */
  const unlockWithPin = async (pin) => {
    if (!pinPending) return;
    const seedB64 = await unwrapSeedWithPin(pinPending.seed, pinPending.pinSalt, pin); // throws on wrong PIN
    await applyServerSeed(seedB64, pinPending.mail);
    setPinPending(null);
    setSheet(null);
    toast('Wallet unlocked 🐄');
  };

  /**
   * Turn on a PIN: fetch the raw seed, wrap it locally, and hand the server
   * only the wrapped blob. After this the backend can no longer reconstruct
   * the key on its own — recovery needs session + PIN (non-custodial 2-of-2).
   */
  const protectWithPin = async (pin) => {
    const rec = await backend.walletRecovery();
    if (rec.pinSet) throw new Error('A PIN is already set.');
    const { wrapped, salt } = await wrapSeedWithPin(rec.seed, pin);
    await backend.setWalletPin(wrapped, salt);
    setSheet(null);
    toast('PIN set — only you can recover this wallet now 🔒');
  };

  /** Import an existing wallet from a recovery phrase / key the user pastes. */
  const importWallet = async (raw) => {
    const { keypair, mnemonic, kind } = parseImport(raw); // throws with a human reason
    const mail = email || `${keypair.publicKey.toBase58().slice(0, 8).toLowerCase()}@imported.moo`;
    await importWalletToVault(keypair, mnemonic ?? null, mail, deviceSecret());
    setKeypair(keypair);
    setAddress(keypair.publicKey.toBase58());
    setEmail(mail);
    setSheet(null);
    toast(`Wallet imported (${kind}) 🐄`);
    refresh(keypair.publicKey.toBase58());
    if (backend.hasBackend()) {
      try { setBkSession(await backend.openDemoSession(mail)); } catch { /* offline */ }
    }
  };

  const connectExtension = async () => {
    const p = detectProvider();
    if (!p) { setSheet('diagnostics'); return; }
    try {
      const res = await p.connect();
      const pk = (res?.publicKey || p.publicKey).toString();
      setProvider(p);
      setAddress(pk);
      setSheet(null);
      toast('Wallet connected');
      refresh(pk);
    } catch (e) {
      if (/reject|declined|4001/i.test(e?.message || '')) toast('You declined the connection');
      else setSheet('diagnostics');
    }
  };

  const disconnect = () => {
    try { provider?.disconnect?.(); } catch { /* ignore */ }
    setKeypair(null); setProvider(null); setAddress(null);
    setUsdc(0); setSol(0);
    backend.clearSession(); setBkSession(null); setLedger({ available: 0, held: 0 });
    toast('Signed out');
  };

  const connected = !!address;

  /* ── paying ── */
  const placeOrder = (localAmount, usdcNeeded) => {
    setOrder({ local: localAmount, usdc: usdcNeeded, rate: quote.sell || quote.market.fx });
    setSheet('order');
  };

  const handleScanned = async (raw, amountHint) => {
    const trimmed = (raw || '').trim();

    // moocash:// codes are OUR invoices — verified server-side (HMAC), paid
    // through the real order lifecycle. Everything else keeps the client-side
    // decoder and its honest "needs a licensed rail" note.
    if (backend.isMooQr(trimmed) && backend.hasBackend()) {
      try {
        const moo = await backend.decodeQr(trimmed);
        setDecoded({ moo, raw: trimmed, amountHint });
      } catch (e) {
        setDecoded({ mooError: e.message, raw: trimmed });
      }
      setSheet('decoded');
      return;
    }

    const parsed = MooCore.parseQR(trimmed);
    setDecoded({ parsed, raw: trimmed, amountHint });
    setSheet('decoded');
  };

  /** Pay a decoded moocash invoice for real: hold → broadcast → settle. */
  const payMoo = async () => {
    if (!decoded?.moo || payBusy) return;
    const inv = decoded.moo;
    const fiatMinor = inv.openAmount
      ? Math.round((decoded.amountHint || 0) * 100)
      : Number(inv.fiatAmount.value);
    if (!fiatMinor || fiatMinor <= 0) { toast('Enter the amount on the keypad first'); return; }

    setPayBusy(true);
    try {
      const created = await backend.createOrder({ invoiceId: inv.invoiceId, fiatAmountMinor: fiatMinor });
      const final = ['SETTLED', 'TIMEOUT', 'CANCELLED', 'FAILED'].includes(created.status)
        ? created
        : await backend.waitForOrder(created.id);
      setMooOrder(final);
      setSheet('mooOrder');
      refreshLedger();
    } catch (e) {
      toast(e.message || 'Payment failed');
    } finally {
      setPayBusy(false);
    }
  };

  /** Mint a merchant QR so this account can BE paid. */
  const mintReceiveQr = async (localAmount) => {
    const mk = byCode(region);
    try {
      await backend.ensureMerchant({
        name: (email || 'moo user').split('@')[0],
        fiatCurrency: mk.cur,
        countryCode: mk.cc,
      });
      const minor = localAmount ? Math.round(localAmount * 100) : null;
      const out = await backend.mintQr({ fiatAmountMinor: minor, memo: null });
      const { default: QRCode } = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(out.compact, { margin: 1, width: 440 });
      setMooQr({ compact: out.compact, dataUrl, amount: localAmount, cur: mk.cur });
    } catch (e) {
      toast(e.message || 'Could not create QR');
    }
  };

  const plan = order
    ? MooCore.settlementPlan({
        amount: order.usdc,
        floatAvail: 5000,
        instantThreshold: INSTANT_THRESHOLD,
        dailyUsed: 0,
        dailyCap: UNVERIFIED_CAP,
        externalWallet: !!provider,
      })
    : null;

  /* ── onboarding gate ── */
  if (!onboarded) {
    return (
      <>
        <Onboarding
          region={region}
          setRegion={setRegion}
          onDone={() => { store.set('moo.onboarded', '1'); setOnboarded(true); }}
        />
        <Toast message={toastMsg} />
      </>
    );
  }

  const m = quote.market;

  return (
    <>
      <div className="app">
        <Header
          onMenu={() => setSheet('menu')}
          onReceive={() => setSheet('receive')}
          onHome={() => setTab('home')}
        />

        {tab === 'home' && (
          <Home
            quote={quote} usdc={bkSession ? ledger.available : usdc} sol={sol}
            connected={connected || !!bkSession}
            hideBalances={hideBalances} rateSource={rateSource}
            onDeposit={() => setSheet('deposit')}
            onWithdraw={() => setSheet('withdraw')}
            onIncrease={() => setSheet('limits')}
            onRate={() => setSheet('rate')}
            onConnect={() => setSheet('signin')}
          />
        )}

        {tab === 'pay' && (
          <ScanPay
            quote={quote} usdc={bkSession ? ledger.available : usdc}
            connected={connected || !!bkSession}
            onPlaceOrder={placeOrder}
            onScanned={handleScanned}
            onHelp={() => setSheet('howpay')}
            toast={toast}
          />
        )}

        {tab === 'graze' && (
          <Graze onHowItWorks={() => setSheet('pool')} onRisks={() => setSheet('pool')} />
        )}

        {tab === 'world' && (marketCur ? (
          <Market
            cc={marketCur} market={byCode(marketCur)}
            quote={quoteMarket(marketCur, rates)}
            bkSession={bkSession} email={email}
            onBack={() => setMarketCur(null)}
            onSignIn={() => setSheet('signin')}
            toast={toast}
          />
        ) : (
          <World
            rates={rates} region={region}
            onPick={cc => {
              // Picking a corridor selects it AND opens its order market.
              setRegion(cc);
              setMarketCur(cc);
              toast(byCode(cc).name + ' selected');
            }}
            onRate={() => setSheet('rate')}
          />
        ))}

        {tab === 'settings' && (
          <Settings
            address={address} market={m} email={email} rpc={rpc === DEFAULT_RPC ? 'public' : 'custom'}
            hideBalances={hideBalances} setHideBalances={setHideBalances}
            notifications={notifications} setNotifications={setNotifications}
            onCopy={() => { navigator.clipboard?.writeText(address); toast('Address copied 🐄'); }}
            onChangeRegion={() => setTab('world')}
            onVerify={() => setSheet('limits')}
            onExport={() => setSheet('export')}
            onProtectPin={() => setSheet('setpin')} bkSession={bkSession}
            onDisconnect={disconnect}
            onRpc={() => setSheet('rpc')}
          />
        )}
      </div>

      <Nav tab={tab} onTab={setTab} />
      <Toast message={toastMsg} />

      <Sheets
        sheet={sheet} setSheet={setSheet} toast={toast}
        quote={quote} market={m} address={address} keypair={keypair}
        decoded={decoded} order={order} plan={plan}
        onSignInEmail={signInEmail} onConnectExtension={connectExtension}
        rpc={rpc} setRpc={setRpc}
        bkSession={bkSession} region={region}
        mooQr={mooQr} setMooQr={setMooQr} onMintQr={mintReceiveQr}
        mooOrder={mooOrder} payBusy={payBusy} onPayMoo={payMoo}
        onSocialSession={adoptBackendSession} onImportWallet={importWallet}
        onUnlockPin={unlockWithPin} onProtectPin={protectWithPin} pinPending={!!pinPending}
      />
    </>
  );
}

/**
 * Export the wallet in all three ecosystem-standard formats. The recovery
 * phrase is only present for wallets created here (or imported FROM a phrase);
 * a wallet imported from a raw key has no phrase to show, and we say so
 * rather than inventing one.
 */
function ExportKeys({ keypair, toast }) {
  const [reveal, setReveal] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!reveal) return;
    (async () => {
      let mnemonic = null;
      try { mnemonic = (await unlockVault(deviceSecret())).mnemonic; } catch { /* v1 / imported */ }
      setData({
        mnemonic,
        base58: toBase58(keypair.secretKey),
        json: JSON.stringify([...keypair.secretKey]),
      });
    })();
  }, [reveal, keypair]);

  const copy = (text, label) => { navigator.clipboard?.writeText(text); toast(`${label} copied — store it safely`); };

  if (!reveal) {
    return <button className="btn dark" onClick={() => setReveal(true)}>Reveal my keys</button>;
  }
  if (!data) return <div className="note info">Decrypting…</div>;

  return (
    <>
      {data.mnemonic ? (
        <div className="field">
          <label>Recovery phrase (works in Phantom, Solflare, Backpack)</label>
          <div className="input mono" style={{ whiteSpace: 'normal', lineHeight: 1.7, userSelect: 'all' }}>{data.mnemonic}</div>
          <button className="btn lime" style={{ marginTop: 8 }} onClick={() => copy(data.mnemonic, 'Recovery phrase')}>Copy phrase</button>
        </div>
      ) : (
        <div className="note info">This wallet was imported from a raw key, so it has no recovery phrase.</div>
      )}
      <div className="field" style={{ marginTop: 12 }}>
        <label>Private key (base58 — Phantom import)</label>
        <button className="btn" onClick={() => copy(data.base58, 'Private key')}>Copy base58 key</button>
      </div>
      <div className="field">
        <label>Keypair JSON (solana-keygen)</label>
        <button className="btn ghost" onClick={() => copy(data.json, 'Keypair JSON')}>Copy JSON array</button>
      </div>
    </>
  );
}

/**
 * Social sign-in block. Reads GET /auth/providers and only renders a method
 * that the backend actually has credentials for — an unconfigured provider
 * simply doesn't appear, so nothing here is a dead button.
 */
function SocialSignIn({ onSession, onError }) {
  const [providers, setProviders] = useState(null);
  const googleRef = useRef(null);
  const tgRef = useRef(null);

  useEffect(() => {
    if (!backend.hasBackend()) { setProviders({}); return; }
    social.getProviders().then(setProviders).catch(() => setProviders({}));
  }, []);

  useEffect(() => {
    if (!providers) return;
    if (providers.google && googleRef.current) {
      social.mountGoogleButton(googleRef.current, providers.google.clientId, onSession,
        e => onError(e.message || 'Google sign-in failed')).catch(() => {});
    }
    if (providers.telegram && tgRef.current && !tgRef.current.childElementCount) {
      social.mountTelegramWidget(tgRef.current, providers.telegram.botUsername, onSession,
        e => onError(e.message || 'Telegram sign-in failed'));
    }
  }, [providers, onSession, onError]);

  if (!providers) return null;
  const any = providers.google || providers.telegram || providers.x;
  if (!any) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', opacity: .5 }}>
        <div style={{ flex: 1, height: 1, background: 'currentColor' }} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'currentColor' }} />
      </div>
      {providers.google && <div ref={googleRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} />}
      {providers.telegram && <div ref={tgRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} />}
      {providers.x && (
        <button className="btn dark" onClick={() => social.startXLogin(providers.x.clientId)}>
          𝕏&nbsp;&nbsp;Continue with X
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sheets kept together so App stays readable.
   ══════════════════════════════════════════════════════════════ */
function Sheets({
  sheet, setSheet, toast, quote, market, address, keypair,
  decoded, order, plan, onSignInEmail, onConnectExtension, rpc, setRpc,
  bkSession, region, mooQr, setMooQr, onMintQr, mooOrder, payBusy, onPayMoo,
  onSocialSession, onImportWallet, onUnlockPin, onProtectPin, pinPending,
}) {
  const close = () => setSheet(null);
  const [mail, setMail] = useState('');
  const [pass, setPass] = useState('');
  const [usePass, setUsePass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pasted, setPasted] = useState('');
  const [rpcDraft, setRpcDraft] = useState(rpc === DEFAULT_RPC ? '' : rpc);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(mail);
  const canSubmit = emailValid && (!usePass || pass.length >= 8);

  const submit = async () => {
    setBusy(true); setErr('');
    try { await onSignInEmail(mail, usePass ? pass : ''); }
    catch (e) { setErr(/decrypt|OperationError/i.test(e.message) ? 'Wrong passphrase.' : e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Sheet open={sheet === 'signin'} onClose={close}
        title="Continue with email"
        lede="We'll create a Solana wallet right here. No documents, no forms.">
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" inputMode="email" placeholder="you@gmail.com"
                 value={mail} onChange={e => { setMail(e.target.value); setErr(''); }} />
        </div>
        <div className="set-row" style={{ border: 'var(--bd)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--sh-sm)', marginBottom: 13, background: 'var(--white)' }}>
          <div>
            <div className="k" style={{ fontSize: 14 }}>Add a passphrase</div>
            <div className="s">Optional — lets you use this wallet elsewhere</div>
          </div>
          <button className={'toggle' + (usePass ? ' on' : '')} onClick={() => { setUsePass(!usePass); setPass(''); }}><i /></button>
        </div>
        {usePass && (
          <div className="field">
            <label>Passphrase</label>
            <input className="input" type="password" placeholder="At least 8 characters"
                   value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} />
          </div>
        )}
        {err && <div className="note stop">{err}</div>}
        <div className={'note ' + (usePass ? 'warn' : 'info')}>
          {usePass
            ? <><b>Portable, but nothing recovers it.</b> Forget the passphrase and the funds are gone. There is no reset link.</>
            : <><b>This device only.</b> The key is generated here and stays here — like staying signed in. Add a passphrase to move it elsewhere.</>}
        </div>
        <button className="btn butter" disabled={!canSubmit || busy} onClick={submit}>
          {busy ? <><span className="spinner" /> Working…</> : 'Create wallet'}
        </button>

        <SocialSignIn
          onSession={onSocialSession}
          onError={m => setErr(m)}
        />

        <button className="btn ghost" style={{ marginTop: 6 }} onClick={onConnectExtension}>
          Connect a browser wallet instead
        </button>
        <button className="btn ghost" style={{ marginTop: 2 }} onClick={() => setSheet('import')}>
          Import a recovery phrase or key
        </button>
      </Sheet>

      <Sheet open={sheet === 'import'} onClose={close}
        title="Import a wallet"
        lede="Paste a 12/24-word recovery phrase, a private key, or a keypair JSON.">
        <div className="field">
          <label>Recovery phrase or private key</label>
          <textarea className="input mono" rows={3} placeholder="word1 word2 word3 … / base58 key / [12,34,…]"
            value={pasted} onChange={e => { setPasted(e.target.value); setErr(''); }} />
        </div>
        {err && <div className="note stop">{err}</div>}
        <div className="note warn">
          <b>Only paste keys you own.</b> Whoever holds this phrase controls the funds.
          It's encrypted on this device and never sent to any server.
        </div>
        <button className="btn butter" disabled={busy || !pasted.trim()} onClick={async () => {
          setBusy(true); setErr('');
          try { await onImportWallet(pasted.trim()); setPasted(''); }
          catch (e) { setErr(e.message || 'Could not import that.'); }
          finally { setBusy(false); }
        }}>
          {busy ? <><span className="spinner" /> Importing…</> : 'Import wallet'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'walletpin'} onClose={pinPending ? undefined : close}
        title="Enter your wallet PIN"
        lede="This wallet is PIN-protected. Your PIN unwraps it on this device — we never see it.">
        <div className="field">
          <label>PIN</label>
          <input className="input" type="password" inputMode="numeric" placeholder="Your PIN"
            value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} />
        </div>
        {err && <div className="note stop">{err}</div>}
        <button className="btn butter" disabled={busy || pass.length < 4} onClick={async () => {
          setBusy(true); setErr('');
          try { await onUnlockPin(pass); setPass(''); }
          catch { setErr('Wrong PIN — try again.'); }
          finally { setBusy(false); }
        }}>
          {busy ? <><span className="spinner" /> Unlocking…</> : 'Unlock wallet'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'setpin'} onClose={close}
        title="Protect with a PIN"
        lede="Adds a PIN only you know. After this, even we can't recover your wallet without it — true self-custody, still usable on any device.">
        <div className="field">
          <label>Choose a PIN (min 4 digits)</label>
          <input className="input" type="password" inputMode="numeric" placeholder="New PIN"
            value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} />
        </div>
        {err && <div className="note stop">{err}</div>}
        <div className="note warn">
          <b>No PIN reset.</b> If you forget it, recover with your saved recovery
          phrase instead. Export it first from Settings if you haven't.
        </div>
        <button className="btn grass" disabled={busy || pass.length < 4} onClick={async () => {
          setBusy(true); setErr('');
          try { await onProtectPin(pass); setPass(''); }
          catch (e) { setErr(e.message || 'Could not set the PIN.'); }
          finally { setBusy(false); }
        }}>
          {busy ? <><span className="spinner" /> Setting…</> : 'Set PIN'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'receive'} onClose={close}
        title="Receive" lede={bkSession ? 'Get paid at your counter, or receive USDC on-chain.' : 'On Solana. Near-instant, near-free.'}>
        {bkSession && (
          <div className="card pale" style={{ boxShadow: 'var(--sh-sm)' }}>
            <div className="lbl">Payment QR — customers scan this</div>
            {mooQr ? (
              <>
                <div style={{ textAlign: 'center', margin: '10px 0' }}>
                  <img src={mooQr.dataUrl} alt="moo.cash payment QR"
                       style={{ width: 220, height: 220, borderRadius: 12, border: '2.5px solid var(--hide)' }} />
                </div>
                <div style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>
                  {mooQr.amount ? `${fmtLocal(byCode(region), mooQr.amount)} · fixed` : 'Open amount'}
                </div>
                <div className="row">
                  <button className="btn" onClick={() => { navigator.clipboard?.writeText(mooQr.compact); toast('Code copied 🐄'); }}>
                    Copy code
                  </button>
                  <button className="btn" onClick={() => setMooQr(null)}>New QR</button>
                </div>
              </>
            ) : (
              <MintQrForm onMint={onMintQr} market={byCode(region)} />
            )}
            <div className="note info" style={{ marginTop: 10 }}>
              Signed by the settlement service — a tampered copy is refused at scan time.
              Paying it moves real balance between moo accounts.
            </div>
          </div>
        )}
        <div className="card cream" style={{ textAlign: 'center', boxShadow: 'none' }}>
          <CowLogo size={64} />
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, wordBreak: 'break-all', marginTop: 12, lineHeight: 1.6 }}>
            {address || 'Sign in to see your address'}
          </div>
        </div>
        <div className="note stop">
          <b>Solana (SPL) USDC only.</b> Tokens sent on Ethereum, Base, Tron or any other
          chain are unrecoverable.
        </div>
        <button className="btn lime" disabled={!address}
                onClick={() => { navigator.clipboard?.writeText(address); toast('Address copied 🐄'); }}>
          Copy address
        </button>
      </Sheet>

      <Sheet open={sheet === 'rate'} onClose={close}
        title="Where this price comes from"
        lede="A stablecoin doesn't trade at the forex rate everywhere.">
        <div className="brk">
          {[
            ['Spot forex', fmtLocal(market, quote.spot || market.fx)],
            ['Local market', quote.premiumPct >= 0.5 ? fmtLocal(market, quote.mid) : 'at par with spot'],
            ['Premium over spot', quote.premiumPct != null ? `${quote.premiumPct > 0 ? '+' : ''}${quote.premiumPct.toFixed(2)}%` : '—'],
            ['You receive per USDC', fmtLocal(market, quote.sell || market.fx)],
            ['You pay per USDC', fmtLocal(market, quote.buy || market.fx)],
          ].map(([k, v]) => (
            <div className="brw" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
          ))}
        </div>
        {quote.premiumPct >= 5 ? (
          <div className="note info">
            <b>Why it sits above forex.</b> In markets with capital controls, dollar
            stablecoins trade at a premium because getting dollars out through official
            channels is hard and local demand outruns sell-side liquidity. India's ran
            roughly 7–10% through 2026. Quote spot here and you misprice by that whole
            margin — the premium <i>is</i> the market.
          </div>
        ) : (
          <div className="note info">Local pricing tracks spot closely here, so a forex reference is safe.</div>
        )}
        <div className="note warn">
          <b>This is modelled, not a quote.</b> Before taking real orders, price from an
          order book you can actually fill against.
        </div>
      </Sheet>

      <Sheet open={sheet === 'limits'} onClose={close}
        title="Raise your limits"
        lede="Pay with just an email up to the first tier. Above that, verification is required.">
        {[
          ['Tier 1', 'Email only. No documents.', '200', true],
          ['Tier 2', 'ID document and a selfie.', '5,000', false],
          ['Tier 3', 'Address and source of funds.', '50,000', false],
        ].map(([t, s, cap, cur]) => (
          <div className={'card ' + (cur ? 'pale' : 'cream')} key={t} style={{ boxShadow: 'var(--sh-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <b>{t}</b> {cur && <span className="chip ok">current</span>}
                <div style={{ fontSize: 13, fontWeight: 700, opacity: .65, marginTop: 3 }}>{s}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b style={{ fontSize: 17 }}>{cap}</b>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: .6 }}>USDC / month</div>
              </div>
            </div>
          </div>
        ))}
        <div className="note info">
          The merchant never sees your identity at any tier. Verification is between you
          and us, and only above the first tier — it isn't optional anywhere we operate.
        </div>
      </Sheet>

      <Sheet open={sheet === 'pool'} onClose={close}
        title="How grazing would work" lede="Modelled, not live.">
        {[
          ['1 · You stake', 'Your USDC joins a shared pool held by an on-chain program. You hold a pro-rata claim, tracked by share — not by a promised rate.'],
          ['2 · It does work', 'When someone cashes out to UPI or Bakong, the pool fronts the money so it settles instantly instead of waiting on bank rails.'],
          ['3 · Fees split', 'Each ramp pays a fee. A defined slice goes to the pool and is divided by share. Every fee event is visible on-chain.'],
        ].map(([k, v]) => (
          <div className="card pale" key={k} style={{ boxShadow: 'var(--sh-sm)' }}>
            <div className="lbl">{k}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.6 }}>{v}</div>
          </div>
        ))}
        <div className="note risk">
          <b>Why it isn't switched on.</b> Taking deposits and paying returns is a
          regulated activity nearly everywhere. Get securities advice before this holds
          one real dollar.
        </div>
      </Sheet>

      <Sheet open={sheet === 'howpay'} onClose={close}
        title="How paying works" lede="Amount first, QR second — and there's a reason for the order.">
        {[
          ['1 · Ask for the amount', 'Just the bill total. Don\'t ask for the QR yet.'],
          ['2 · Place the order', 'This locks your exchange rate before you commit. If the rate moved between scanning and paying you\'d get a nasty surprise — this removes that.'],
          ['3 · Now scan', 'Point at the vendor\'s existing QR. They get local currency in their bank and never touch crypto.'],
        ].map(([k, v]) => (
          <div className="card pale" key={k} style={{ boxShadow: 'var(--sh-sm)' }}>
            <div className="lbl">{k}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.6 }}>{v}</div>
          </div>
        ))}
      </Sheet>

      <Sheet open={sheet === 'order'} onClose={close} title="Order placed"
        lede={order ? `Rate locked at ${fmtLocal(market, order.rate)} per USDC.` : ''}>
        {order && plan && (
          <>
            <div className="brk">
              <div className="brw"><span className="k">Merchant gets</span><span className="v">{fmtLocal(market, order.local)}</span></div>
              <div className="brw"><span className="k">You pay</span><span className="v">{fmtUsd(order.usdc)} USDC</span></div>
              <div className="brw tot"><span>Settlement</span><span className="v">~{plan.etaText}</span></div>
            </div>
            <div className={'note ' + (plan.degraded ? 'warn' : 'info')}>
              {plan.mode === 'instant' && <><b>Instant.</b> We pay the merchant from our float now and settle with you behind the scenes.</>}
              {plan.mode === 'finality' && <><b>Full settlement.</b> Above {INSTANT_THRESHOLD} USDC we wait for the transfer to finalise before paying out.</>}
              {plan.mode === 'matched' && <><b>Matched.</b> {plan.note}</>}
              {plan.mode === 'blocked' && <><b>Blocked.</b> {plan.reason}</>}
            </div>
          </>
        )}
        <div className="note warn">
          <b>The payout leg isn't wired.</b> Decoding, pricing and settlement logic are
          real; moving local currency needs a licensed partner on the {market.rail} rail.
        </div>
        <button className="btn" onClick={close}>Close</button>
      </Sheet>

      <Sheet open={sheet === 'mooOrder'} onClose={close}
        title={mooOrder?.status === 'SETTLED' ? 'Paid 🐄' : 'Order ' + (mooOrder?.status || '').toLowerCase()}
        lede={mooOrder?.status === 'SETTLED' ? 'Settled through the real order lifecycle.' : ''}>
        {mooOrder && (
          <>
            <div className="brk">
              <div className="brw"><span className="k">Reference</span><span className="v">{mooOrder.reference}</span></div>
              <div className="brw"><span className="k">Merchant got</span>
                <span className="v">{fmtLocal(market, Number(mooOrder.fiatAmount.value) / 100)}</span></div>
              <div className="brw"><span className="k">You paid</span>
                <span className="v">{fmtUsd(Number(BigInt(mooOrder.cryptoAmount.value)) / 1e6)} USDC</span></div>
              <div className="brw"><span className="k">Fee</span>
                <span className="v">{fmtUsd((Number(BigInt(mooOrder.fees.platform.value)) + Number(BigInt(mooOrder.fees.staker.value)) + Number(BigInt(mooOrder.fees.merchantRebate.value))) / 1e6)} USDC</span></div>
              <div className="brw"><span className="k">Fill</span>
                <span className="v">{mooOrder.matchType === 'INTERNAL' ? 'instant (internal float)' : mooOrder.matchType || '—'}</span></div>
              <div className="brw tot"><span>Status</span>
                <span className="v">{mooOrder.status === 'SETTLED' ? '✅ SETTLED' : mooOrder.status}</span></div>
            </div>
            {mooOrder.settlement?.payoutRef && (
              <div className="note info">
                Payout ref <b>{mooOrder.settlement.payoutRef}</b> · adapter <b>{mooOrder.settlement.payoutAdapter}</b>.
                The fiat leg is the mock rail — a licensed PSP replaces exactly this one adapter.
              </div>
            )}
            {mooOrder.status === 'TIMEOUT' && (
              <div className="note warn">
                <b>No fill within 60s.</b> Your hold was released automatically — nothing left your balance.
              </div>
            )}
            {mooOrder.status === 'FAILED' && (
              <div className="note warn">
                <b>Declined — no P2P match found.</b> {mooOrder.failureReason ? `Reason: ${mooOrder.failureReason}. ` : ''}
                Your USDC was not taken.
              </div>
            )}
            {mooOrder.status === 'LOCKED' && (
              <div className="note stop">
                <b>Payment couldn’t be confirmed.</b> Your USDC is safely held while we
                reconcile{typeof mooOrder.lockRemainingMs === 'number' ? ` (auto-returns in ~${Math.ceil(mooOrder.lockRemainingMs / 3_600_000)}h)` : ''}.
                {mooOrder.ticket
                  ? <> A ticket is open — our team is reviewing it.</>
                  : <> If you don’t get your funds, raise a ticket and a human will resolve it.</>}
                {!mooOrder.ticket && (
                  <button className="btn dark" style={{ marginTop: 10 }}
                    onClick={async () => {
                      try { await backend.raiseTicket(mooOrder.id, 'Funds held — please reconcile'); toast('Ticket raised — funds frozen for review'); }
                      catch (e) { toast(e.message || 'Could not raise ticket'); }
                    }}>Raise a ticket</button>
                )}
              </div>
            )}
          </>
        )}
        <button className="btn" onClick={close}>Close</button>
      </Sheet>

      <Sheet open={sheet === 'decoded'} onClose={close} title="QR decoded">
        {decoded?.mooError && (
          <div className="note stop">
            <b>Refused.</b> {decoded.mooError} — a failed signature means the code was
            tampered with or did not come from this service. Do not pay it.
          </div>
        )}
        {decoded?.moo && (
          <>
            <div className="brk">
              <div className="brw"><span className="k">Scheme</span><span className="v">moo.cash 🐄</span></div>
              <div className="brw"><span className="k">Merchant</span><span className="v">{decoded.moo.merchantName}</span></div>
              <div className="brw"><span className="k">Signature</span><span className="v">✅ verified by server</span></div>
              <div className="brw"><span className="k">Amount</span>
                <span className="v">
                  {decoded.moo.openAmount
                    ? (decoded.amountHint ? fmtLocal(market, decoded.amountHint) + ' (from keypad)' : 'open — enter on keypad')
                    : fmtLocal(market, Number(decoded.moo.fiatAmount.value) / 100)}
                </span>
              </div>
            </div>
            <button className="btn lime" disabled={payBusy} onClick={onPayMoo}>
              {payBusy ? <><span className="spinner" /> Settling…</> : 'Pay now →'}
            </button>
            <div className="note info">
              Real settlement: your balance is held, the order broadcasts with a 60s TTL,
              and internal liquidity fills it instantly when it can.
            </div>
          </>
        )}
        {decoded && !decoded.parsed && !decoded.moo && !decoded.mooError && (
          <>
            <div className="note stop"><b>Not a payment code.</b> It didn't match a UPI link or an EMVCo payload.</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, wordBreak: 'break-all', opacity: .6 }}>
              {(decoded.raw || '').slice(0, 200)}
            </div>
          </>
        )}
        {decoded?.parsed && (
          <>
            {!decoded.parsed.valid && (
              <div className="note stop">
                <b>This code failed validation.</b> A failed CRC or malformed address means
                it is corrupt or tampered with. Do not pay it.
              </div>
            )}
            <div className="brk">
              {decoded.parsed.scheme === 'UPI' ? (
                <>
                  <div className="brw"><span className="k">Scheme</span><span className="v">UPI (India)</span></div>
                  <div className="brw"><span className="k">Payee</span><span className="v">{decoded.parsed.vpa}</span></div>
                  <div className="brw"><span className="k">Name</span><span className="v">{decoded.parsed.name || '—'}</span></div>
                  <div className="brw"><span className="k">Amount</span><span className="v">{decoded.parsed.amount != null ? `₹${decoded.parsed.amount}` : 'open'}</span></div>
                  <div className="brw"><span className="k">VPA format</span><span className="v">{decoded.parsed.valid ? '✅ valid' : '❌ malformed'}</span></div>
                </>
              ) : (
                <>
                  <div className="brw"><span className="k">Scheme</span><span className="v">EMVCo</span></div>
                  <div className="brw"><span className="k">Merchant</span><span className="v">{decoded.parsed.merchant || '—'}</span></div>
                  <div className="brw"><span className="k">Country</span><span className="v">{decoded.parsed.country || decoded.parsed.countryCode || '—'}</span></div>
                  <div className="brw"><span className="k">Currency</span><span className="v">{decoded.parsed.currency || '—'}</span></div>
                  <div className="brw"><span className="k">Amount</span><span className="v">{decoded.parsed.amount ?? 'open'}</span></div>
                  <div className="brw"><span className="k">CRC</span><span className="v">{decoded.parsed.crcOk ? `✅ ${decoded.parsed.crcGiven}` : '❌ failed'}</span></div>
                </>
              )}
            </div>
          </>
        )}
        <button className="btn" onClick={close}>Close</button>
      </Sheet>

      <Sheet open={sheet === 'deposit'} onClose={close}
        title="Add USDC" lede="Top up from any exchange or wallet on Solana.">
        <div className="card pale">
          <div className="lbl">✅ Works now — receive on-chain</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.6, marginBottom: 12 }}>
            Send USDC on Solana from an exchange or another wallet. In India people already
            buy USDC on FIU-registered exchanges with UPI — they just withdraw it here.
          </div>
          <button className="btn lime" onClick={() => setSheet('receive')}>Show my address</button>
        </div>
        <div className="note info">
          No card needed. The product is spending USDC you already hold — not buying it.
        </div>
      </Sheet>

      <Sheet open={sheet === 'withdraw'} onClose={close}
        title="Withdraw" lede="Cash out to a local account, or send on-chain.">
        <div className="note warn">
          <b>The payout leg needs a partner.</b> Converting to local currency and pushing it
          to a bank requires a licensed provider in each market. On-chain sends work today.
        </div>
        <button className="btn" onClick={() => setSheet('receive')}>Show my address</button>
      </Sheet>

      <Sheet open={sheet === 'export'} onClose={close}
        title="Export your wallet" lede="Anyone with any of these can spend your funds.">
        <div className="note stop">
          <b>Save it offline now.</b> Never paste it into a website. moo.cash will
          never ask for it.
        </div>
        {keypair ? (
          <ExportKeys keypair={keypair} toast={toast} />
        ) : (
          <div className="note info">Only available for wallets created or imported on this device.</div>
        )}
      </Sheet>

      <Sheet open={sheet === 'rpc'} onClose={close}
        title="Solana RPC"
        lede="The public endpoint is heavily rate-limited and often refuses browser reads. A free Helius or QuickNode key fixes it.">
        <div className="field">
          <label>RPC URL</label>
          <input className="input mono" placeholder="https://mainnet.helius-rpc.com/?api-key=…"
                 value={rpcDraft} onChange={e => setRpcDraft(e.target.value)} />
        </div>
        <button className="btn lime" onClick={() => {
          setRpc(rpcDraft.trim() || DEFAULT_RPC);
          toast('RPC saved');
          close();
        }}>Save</button>
      </Sheet>

      <Sheet open={sheet === 'diagnostics'} onClose={close}
        title="Wallet diagnostics" lede="What this page can and can't see.">
        <Diagnostics />
        <button className="btn" onClick={close}>Close</button>
      </Sheet>

      <Sheet open={sheet === 'menu'} onClose={close} title="moo.cash">
        <div className="note info">
          Pay any local merchant QR from a USDC balance on Solana. The shop keeps its
          existing QR, receives local currency, and never touches crypto.
        </div>
        <button className="btn" onClick={() => setSheet('rate')}>Where prices come from</button>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setSheet('pool')}>How grazing works</button>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setSheet('diagnostics')}>Wallet diagnostics</button>
      </Sheet>
    </>
  );
}

function Diagnostics() {
  const d = diagnose();
  const row = (k, v, good) => (
    <div className="brw" key={k}>
      <span className="k">{k}</span>
      <span className="v" style={{ color: good === undefined ? '' : good ? 'var(--ok)' : 'var(--stop)' }}>{v}</span>
    </div>
  );
  return (
    <>
      <div className="brk">
        {row('Page origin', d.isFile ? 'file:// (opened from disk)' : `${d.proto}//${d.host}`, !d.isFile)}
        {row('Secure context', d.secure ? 'yes' : 'no', d.secure)}
        {Object.entries(d.found).map(([k, v]) => row(k, v ? 'detected' : 'not found', v))}
      </div>
      {d.cause === 'file' && (
        <div className="note stop">
          <b>This is the problem.</b> Wallet extensions refuse to inject into
          <code> file://</code> pages, so your wallet cannot see this page even though it
          is installed. Serve the folder over http://localhost instead.
        </div>
      )}
      {d.cause === 'missing' && (
        <div className="note warn">
          <b>No wallet extension detected.</b> Install Phantom, Solflare or Backpack and
          reload. {d.mobile && 'On mobile, open this URL inside your wallet app\'s browser — extensions do not exist in mobile browsers.'}
        </div>
      )}
      {!d.cause && <div className="note info">✅ A wallet is injecting correctly.</div>}
    </>
  );
}

const DEFAULT_RPC_LOCAL = DEFAULT_RPC;


/* ── small form: amount for a merchant receive-QR ── */
function MintQrForm({ onMint, market }) {
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onMint(amt ? parseFloat(amt) : null); } finally { setBusy(false); }
  };
  return (
    <>
      <input
        className="input" inputMode="decimal" placeholder={`Amount in ${market.cur} (blank = open)`}
        value={amt}
        onChange={e => setAmt(e.target.value.replace(/[^0-9.]/g, ''))}
        style={{ marginBottom: 10 }}
      />
      <button className="btn butter" disabled={busy} onClick={go}>
        {busy ? <><span className="spinner" /> Signing…</> : 'Create payment QR'}
      </button>
    </>
  );
}
