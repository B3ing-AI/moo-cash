import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Flag from '../components/Flag';
import * as backend from '../backend.js';

/**
 * The corridor order market — what opens when you pick a region on World.
 *
 * Concept (not design) follows p2p.me: the price is the LOCAL market
 * premium in motion, not the forex rate. The backend moves the mid with
 * demand and supply — every fill pushes the seller rate down, quiet lets it
 * recover — and this screen lets you stand in the book: place a sell that
 * fires automatically when the rate you want arrives.
 */

/** JPY/KRW/VND are 0dp; everything else 2dp — mirrors the backend. */
const minorDigits = cur => (['JPY', 'KRW', 'VND'].includes(cur) ? 0 : 2);

/** "108.20" major → "10820" minor, by string shifting (no float rounding). */
function majorToMinorString(s, digits) {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(String(s).trim());
  if (!m) return null;
  const frac = (m[2] || '').padEnd(digits, '0');
  if (frac.length > digits) {
    // more precision than the currency has — keep it, the API accepts 8dp
    return `${m[1]}${frac.slice(0, digits)}.${frac.slice(digits)}`;
  }
  const joined = `${m[1]}${frac}`.replace(/^0+(?=\d)/, '');
  return joined || '0';
}

function Sparkline({ ticks, digits }) {
  if (!ticks || ticks.length < 2) {
    return <div style={{ fontSize: 12, opacity: .45, padding: '14px 0' }}>Collecting price history…</div>;
  }
  const vals = ticks.map(t => Number(t.midRateScaled) / 1e8 / 10 ** digits);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 320, H = 64;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 6 - ((v - min) / span) * (H - 12)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 64, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={up ? 'var(--grass)' : '#c0392b'} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Market({ cc, market, quote, bkSession, email, onBack, onSignIn, toast }) {
  const cur = market.cur;
  const digits = minorDigits(cur);

  const [mkt, setMkt] = useState(null);
  const [live, setLive] = useState(false);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState('');
  const [rateStr, setRateStr] = useState('');
  const [handle, setHandle] = useState(email ? `${email.split('@')[0]}@upi` : '');
  const rateTouched = useRef(false);

  const load = useCallback(async () => {
    try {
      const m = await backend.getMarket(cur);
      setMkt(m); setLive(true);
      if (!rateTouched.current) {
        // Prefill the target a touch ABOVE the current sell — a limit order
        // at the live rate would just fill instantly, which is a market order.
        const sell = Number(m.sellRateScaled) / 1e8 / 10 ** digits;
        setRateStr((sell * 1.003).toFixed(digits));
      }
    } catch { setLive(false); }
    if (backend.hasBackend() && backend.session()) {
      try { setOrders((await backend.listLimitOrders()).orders); } catch { /* offline */ }
    }
  }, [cur, digits]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // Live numbers, falling back to the client-side estimate when offline.
  const view = useMemo(() => {
    if (mkt) {
      return {
        mid: Number(mkt.midRateScaled) / 1e8 / 10 ** digits,
        sell: Number(mkt.sellRateScaled) / 1e8 / 10 ** digits,
        buy: Number(mkt.buyRateScaled) / 1e8 / 10 ** digits,
        dyn: mkt.dynamicBps,
        pressure: mkt.pressureBps,
        depth: Number(mkt.openInterest) / 1e6,
        src: mkt.fxSource,
      };
    }
    const mid = quote?.mid || market.fx * (1 + (market.premium || 0));
    return { mid, sell: mid * 0.995, buy: mid * 1.005, dyn: null, pressure: null, depth: null, src: 'estimate' };
  }, [mkt, quote, market, digits]);

  const fmt = v => `${market.sym}${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

  const myOpen = orders.filter(o => o.fiatCurrency === cur && o.status === 'OPEN');
  const myDone = orders.filter(o => o.fiatCurrency === cur && o.status !== 'OPEN').slice(0, 5);

  const place = async () => {
    const usdc = parseFloat(amount);
    if (!usdc || usdc <= 0) { toast('Enter a USDC amount'); return; }
    const minorRate = majorToMinorString(rateStr, digits);
    if (!minorRate) { toast('Enter a valid target rate'); return; }
    if (!handle || handle.length < 3) { toast('Enter a payout handle'); return; }
    setBusy(true);
    try {
      await backend.placeLimitOrder({
        fiatCurrency: cur,
        amountCrypto: String(Math.round(usdc * 1e6)),
        limitRate: minorRate,
        payoutHandle: handle,
        expiresInHours: 24,
      });
      toast('Order standing in the book 🐄');
      setAmount('');
      rateTouched.current = false;
      await load();
    } catch (e) {
      toast(e.message || 'Could not place order');
    } finally { setBusy(false); }
  };

  const cancel = async id => {
    try {
      await backend.cancelLimitOrder(id);
      toast('Order cancelled — funds released');
      await load();
    } catch (e) { toast(e.message || 'Could not cancel'); }
  };

  const statusChip = s =>
    s === 'OPEN' ? <span className="chip ok" style={{ fontSize: 10 }}>standing</span>
    : s === 'FILLED' ? <span className="chip lime" style={{ fontSize: 10 }}>filled ✓</span>
    : <span className="chip warn" style={{ fontSize: 10 }}>{s.toLowerCase()}</span>;

  return (
    <div className="screen">
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn ghost sm" onClick={onBack} style={{ padding: '6px 10px' }}>←</button>
        <Flag cc={cc} size={34} />
        <div>
          <h1 style={{ margin: 0 }}>{market.name} market</h1>
          <p style={{ margin: 0 }}>{market.rail} · USDC/{cur}</p>
        </div>
      </div>

      {/* ── the two prices ── */}
      <div className="card">
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: 'var(--grass-lt)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .6 }}>
              Sell USDC · you get
            </div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 800, marginTop: 3 }}>{fmt(view.sell)}</div>
          </div>
          <div style={{ flex: 1, background: 'var(--butter, #fdf3d0)', borderRadius: 14, padding: '12px 14px', opacity: .75 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .6 }}>
              Buy USDC · you pay
            </div>
            <div style={{ fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 800, marginTop: 3 }}>{fmt(view.buy)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, opacity: .65 }}>mid {fmt(view.mid)}</span>
          {view.dyn !== null && (
            <span className={`chip ${view.dyn >= 0 ? 'ok' : 'warn'}`} style={{ fontSize: 10.5 }}>
              {view.dyn >= 0 ? '▲' : '▼'} {(Math.abs(view.dyn) / 100).toFixed(2)}% demand
            </span>
          )}
          {view.pressure > 0 && (
            <span className="chip warn" style={{ fontSize: 10.5 }}>heavy selling</span>
          )}
          <span style={{ fontSize: 11, opacity: .45, marginLeft: 'auto' }}>
            {live ? `live · ${view.src}` : 'estimate — backend offline'}
          </span>
        </div>

        <Sparkline ticks={mkt?.ticks} digits={digits} />
        {view.depth !== null && view.depth > 0 && (
          <div style={{ fontSize: 11.5, opacity: .55 }}>
            {view.depth.toLocaleString()} USDC standing in the book
          </div>
        )}
      </div>

      {/* ── place a standing order ── */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .5, marginBottom: 10 }}>
          Name your price
        </div>
        <p style={{ fontSize: 13, opacity: .7, marginTop: 0 }}>
          Set the rate you want. Your USDC is held; the moment the market pays
          that much, it converts and the {market.rail} payout fires on its own.
        </p>

        {!bkSession ? (
          <button className="btn lime" onClick={onSignIn}>Sign in to place orders</button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Amount (USDC)</label>
                <input className="input" inputMode="decimal" placeholder="50"
                  value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Target rate ({market.sym}/USDC)</label>
                <input className="input" inputMode="decimal"
                  value={rateStr}
                  onChange={e => { rateTouched.current = true; setRateStr(e.target.value); }} />
              </div>
            </div>
            <div className="field">
              <label>Payout to ({market.rail})</label>
              <input className="input" placeholder="you@upi"
                value={handle} onChange={e => setHandle(e.target.value)} />
            </div>
            {rateStr && view.sell > 0 && parseFloat(rateStr) <= view.sell && (
              <div className="note info" style={{ marginBottom: 10 }}>
                Target is at or below the live rate — this will fill on the next tick.
              </div>
            )}
            <button className="btn grass" disabled={busy || !live} onClick={place}>
              {busy ? 'Placing…' : `Place standing order${amount ? ` · ${amount} USDC` : ''}`}
            </button>
            {!live && <div style={{ fontSize: 11.5, opacity: .5, marginTop: 8 }}>Orders need the backend running.</div>}
          </>
        )}
      </div>

      {/* ── my orders ── */}
      {(myOpen.length > 0 || myDone.length > 0) && (
        <div className="card" style={{ padding: '6px 16px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .5, padding: '10px 0 4px' }}>
            My orders
          </div>
          {[...myOpen, ...myDone].map(o => (
            <div className="listrow" key={o.id}>
              <div className="mid">
                <div className="t">{Number(o.amountCrypto.value) / 1e6} USDC @ {market.sym}{(Number(o.limitRateScaled) / 1e8 / 10 ** digits).toFixed(digits)}</div>
                <div className="s">
                  {o.status === 'FILLED' ? `paid to ${o.payoutHandle}` : `→ ${o.payoutHandle}`}
                </div>
              </div>
              <div className="r" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {statusChip(o.status)}
                {o.status === 'OPEN' && (
                  <button className="btn ghost sm" style={{ padding: '5px 9px', fontSize: 12 }}
                    onClick={() => cancel(o.id)}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="note info">
        <b>How this price is made.</b> The mid tracks the local premium market and
        moves with flow — every sell pushes it down a touch, quiet hours let it
        drift back. The gap between mid and your rate is the house spread
        ({mkt ? (mkt.sellSpreadBps / 100).toFixed(2) : '0.50'}%), which covers
        restocking the reserve. p2p.me pays peers ~2% for the same job.
      </div>
    </div>
  );
}
