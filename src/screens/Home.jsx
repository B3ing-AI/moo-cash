import Flag from '../components/Flag';
import { fmtLocal, fmtUsd } from '../markets';

export default function Home({
  quote, usdc, sol, connected, hideBalances,
  onDeposit, onWithdraw, onIncrease, onRate, onConnect, rateSource,
}) {
  const m = quote.market;
  const shownUsdc = connected ? usdc : 1247.50;   // preview figure before sign-in
  const shownSol = connected ? sol : 0.0234;
  const localValue = shownUsdc * (quote.sell || m.fx);
  const premiumPct = quote.premiumPct;

  return (
    <div className="screen">
      {/* balance */}
      <div className="card grass">
        <div className="p2p" onClick={onRate} title="Where this price comes from">
          <div className="col">
            <span className="k buy">BUY</span>
            <span className="v">{fmtLocal(m, quote.buy || m.fx)}</span>
          </div>
          <div className="sep" />
          <div className="col">
            <span className="k sell">SELL</span>
            <span className="v">{fmtLocal(m, quote.sell || m.fx)}</span>
          </div>
          {premiumPct >= 1 && (
            <span className="prem">+{premiumPct.toFixed(1)}% prem</span>
          )}
        </div>

        <div className="lbl">USDC balance</div>
        <div className="balance">
          {hideBalances ? '$••••••' : `$${fmtUsd(shownUsdc)}`}
        </div>
        <div className="balance-sub">
          {hideBalances ? 'hidden' : `≈ ${fmtLocal(m, localValue)}`}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn butter" onClick={onDeposit}>↙ Deposit</button>
          <button className="btn pink" onClick={onWithdraw}>↗ Withdraw</button>
        </div>
      </div>

      {/* limits */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="inforow">
          <div>
            <div className="k">Your limits:</div>
            <div className="v" style={{ marginTop: 2 }}>200 USDC</div>
          </div>
          <button className="pillbtn butter" onClick={onIncrease}>Increase →</button>
        </div>
        <div className="split" style={{ borderTop: '2.5px solid var(--hide)' }}>
          <div>
            <div className="k">SOL for gas:</div>
            <div className="v">{shownSol.toFixed(4)}</div>
          </div>
          <div>
            <div className="k">Rate source:</div>
            <div className="v" style={{ fontSize: 17 }}>{rateSource || 'Fallback'}</div>
          </div>
        </div>
      </div>

      {!connected && (
        <div className="card cream" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Preview figures</div>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: .7, lineHeight: 1.5, marginBottom: 13 }}>
            Sign in to see your real balance and send USDC on Solana.
          </div>
          <button className="btn lime" onClick={onConnect}>Get started</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 2px 10px' }}>
        <Flag cc={m.cc} size={26} />
        <span style={{ fontSize: 13.5, fontWeight: 800, opacity: .75 }}>
          Paying out to {m.name} · {m.rail}
        </span>
      </div>
    </div>
  );
}
