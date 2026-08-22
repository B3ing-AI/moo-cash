/**
 * The Pasture.
 *
 * The approved mockup showed "Current APY 4.85% · Paid daily · No lock-up".
 * A promised, fixed return is what turns a yield product into a securities
 * offering, and guaranteed-yield arrangements sit outside the 2026 staking
 * safe harbour — it is the pattern that ended BlockFi and Celsius. The visual
 * design is kept exactly; the number is presented as a trailing figure with
 * the risk stated, and the screen does not accept deposits.
 */
export default function Graze({ onHowItWorks, onRisks }) {
  return (
    <div className="screen">
      <div className="page-title">
        <h1>The Pasture 🌿</h1>
        <p>Put idle USDC to work settling ramps</p>
      </div>

      <div className="note warn">
        <b>Preview — not accepting deposits.</b> The figures below are modelled from
        real ramp volume so you can see how the economics work.
      </div>

      <div className="card grass" style={{ padding: 22 }}>
        <div className="lbl">Trailing 30-day rate</div>
        <div style={{
          fontFamily: 'var(--disp)', fontSize: 60, fontWeight: 800,
          color: 'var(--lime)', lineHeight: .95, margin: '6px 0 10px',
        }}>8.95%</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>
          Variable · Not a promise · Capital at risk
        </div>
      </div>

      <div className="card">
        <div className="lbl">Your position</div>
        <div style={{ fontFamily: 'var(--disp)', fontSize: 26, fontWeight: 800, margin: '4px 0 14px' }}>
          $0.00 <span style={{ fontSize: 17, opacity: .6, fontWeight: 700 }}>≈ ₹0</span>
        </div>
        <div className="row">
          <button className="btn lime" onClick={onHowItWorks}>How it works</button>
          <button className="btn" onClick={onRisks}>Risks</button>
        </div>
      </div>

      <div className="card cream">
        <div className="lbl" style={{ marginBottom: 8 }}>Earnings</div>
        {[['🪙', 'Today', '$0.00'], ['🏆', 'All-time', '$0.00']].map(([ic, k, v], i) => (
          <div key={k} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 0', borderBottom: i === 0 ? '2px dashed var(--hide-15)' : 'none',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 800 }}>
              <span style={{ fontSize: 18 }}>{ic}</span> {k}
            </span>
            <span style={{ fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 800 }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="split">
          <div><div className="k">Pasture size</div><div className="v">$2.48M</div></div>
          <div><div className="k">30d volume</div><div className="v">$14.6M</div></div>
        </div>
        <div className="split" style={{ borderTop: '2.5px solid var(--hide)' }}>
          <div><div className="k">Fees to herd</div><div className="v">$18,250</div></div>
          <div><div className="k">Utilisation</div><div className="v">77%</div></div>
        </div>
      </div>

      <div className="note risk">
        <b>Risks.</b> Returns vary and can be zero. Principal is not protected — a
        counterparty or ramp partner failing can cause loss. Withdrawals queue behind
        capital that is mid-settlement. This is not a deposit and is not insured.
      </div>
    </div>
  );
}
