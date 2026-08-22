import { useState, useEffect, useCallback, useMemo } from 'react';
import MooCore from './core.js';
import { MARKETS, byCode, fmtLocal, fmtUsd } from './markets.js';
import { fetchRates, quoteMarket } from './rates.js';
import {
  store, vault, deviceSecret, createWallet, unlockWallet,
  detectProvider, diagnose, makeConnection, fetchBalances, DEFAULT_RPC,
} from './wallet.js';

import { Header, Nav, Sheet, Toast, Icon } from './components/ui.jsx';
import Flag from './components/Flag.jsx';
import CowLogo from './components/CowLogo.jsx';

import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import ScanPay from './screens/ScanPay.jsx';
import Graze from './screens/Graze.jsx';
import World from './screens/World.jsx';
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
    const useDevice = !pass;
    const secret = useDevice ? deviceSecret() : pass;
    const existing = vault();
    const kp = existing && existing.email === mail
      ? await unlockWallet(secret)
      : await createWallet(mail, secret);
    setKeypair(kp);
    setAddress(kp.publicKey.toBase58());
    setEmail(mail);
    setSheet(null);
    toast('Wallet ready 🐄');
    refresh(kp.publicKey.toBase58());
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
    toast('Signed out');
  };

  const connected = !!address;

  /* ── paying ── */
  const placeOrder = (localAmount, usdcNeeded) => {
    setOrder({ local: localAmount, usdc: usdcNeeded, rate: quote.sell || quote.market.fx });
    setSheet('order');
  };

  const handleScanned = (raw, amountHint) => {
    const parsed = MooCore.parseQR((raw || '').trim());
    setDecoded({ parsed, raw, amountHint });
    setSheet('decoded');
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
            quote={quote} usdc={usdc} sol={sol} connected={connected}
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
            quote={quote} usdc={usdc} connected={connected}
            onPlaceOrder={placeOrder}
            onScanned={handleScanned}
            onHelp={() => setSheet('howpay')}
            toast={toast}
          />
        )}

        {tab === 'graze' && (
          <Graze onHowItWorks={() => setSheet('pool')} onRisks={() => setSheet('pool')} />
        )}

        {tab === 'world' && (
          <World
            rates={rates} region={region}
            onPick={cc => { setRegion(cc); setTab('home'); toast(byCode(cc).name + ' selected'); }}
            onRate={() => setSheet('rate')}
          />
        )}

        {tab === 'settings' && (
          <Settings
            address={address} market={m} email={email} rpc={rpc === DEFAULT_RPC ? 'public' : 'custom'}
            hideBalances={hideBalances} setHideBalances={setHideBalances}
            notifications={notifications} setNotifications={setNotifications}
            onCopy={() => { navigator.clipboard?.writeText(address); toast('Address copied 🐄'); }}
            onChangeRegion={() => setTab('world')}
            onVerify={() => setSheet('limits')}
            onExport={() => setSheet('export')}
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
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sheets kept together so App stays readable.
   ══════════════════════════════════════════════════════════════ */
function Sheets({
  sheet, setSheet, toast, quote, market, address, keypair,
  decoded, order, plan, onSignInEmail, onConnectExtension, rpc, setRpc,
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
        <button className="btn ghost" style={{ marginTop: 6 }} onClick={onConnectExtension}>
          Connect a browser wallet instead
        </button>
      </Sheet>

      <Sheet open={sheet === 'receive'} onClose={close}
        title="Receive USDC" lede="On Solana. Near-instant, near-free.">
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

      <Sheet open={sheet === 'decoded'} onClose={close} title="QR decoded">
        {decoded && !decoded.parsed && (
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
        title="Export your key" lede="Anyone with this can spend your funds.">
        <div className="note stop">
          <b>Save it offline now.</b> If you lose your passphrase this is the only way back in.
          Never paste it into a website.
        </div>
        {keypair ? (
          <button className="btn lime" onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify([...keypair.secretKey]));
            toast('Copied — store it safely');
          }}>Copy secret key</button>
        ) : (
          <div className="note info">Only available for email wallets created on this device.</div>
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
