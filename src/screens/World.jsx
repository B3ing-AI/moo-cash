import Flag from '../components/Flag';
import { MARKETS, FEATURED, byCode, fmtLocal, REGION_LABEL, STATUS_LABEL } from '../markets';
import { quoteMarket } from '../rates';

export default function World({ rates, region, onPick, onRate }) {
  const current = byCode(region);

  const corridor = cc => {
    const q = quoteMarket(cc, rates);
    const m = q.market;
    const prem = q.premiumPct;
    return (
      <div className="listrow" key={cc} onClick={() => onPick(cc)}>
        <Flag cc={cc} size={34} />
        <div className="mid">
          <div className="t">{m.name} · {m.rail}</div>
        </div>
        <div className="r">
          <div className="v">{fmtLocal(m, q.mid || m.fx)}</div>
          {prem >= 0.5
            ? <div className="chip ok" style={{ fontSize: 10.5, padding: '2px 7px', marginTop: 3 }}>+{prem.toFixed(1)}% prem</div>
            : <div style={{ fontSize: 11, fontWeight: 700, opacity: .55, marginTop: 3 }}>at par</div>}
        </div>
      </div>
    );
  };

  const others = MARKETS.filter(m => !FEATURED.includes(m.cc) && m.status !== 'blocked');

  return (
    <div className="screen">
      <div className="page-title">
        <h1>Grazing Grounds 🌍</h1>
        <p>Live P2P rates by corridor</p>
      </div>

      <div className="card" style={{ padding: '6px 16px' }}>
        {FEATURED.map(corridor)}
      </div>

      <div className="card pale">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: .7 }}>Currently paying out to:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
              <Flag cc={current.cc} size={28} />
              <span style={{ fontFamily: 'var(--disp)', fontSize: 19, fontWeight: 800 }}>
                {current.name} · {current.rail}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .5, margin: '20px 2px 10px' }}>
        All markets
      </div>

      {['asia', 'africa', 'latam'].map(g => {
        const inGroup = others.filter(m => m.region === g);
        if (!inGroup.length) return null;
        return (
          <div className="card" key={g} style={{ padding: '6px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', opacity: .5, paddingTop: 8 }}>
              {REGION_LABEL[g]}
            </div>
            {inGroup.map(m => (
              <div className="listrow" key={m.cc} onClick={() => onPick(m.cc)}>
                <Flag cc={m.cc} size={30} />
                <div className="mid">
                  <div className="t">{m.name}</div>
                  <div className="s">{m.rail} · {m.cur}</div>
                </div>
                <div className="r">
                  {STATUS_LABEL[m.status]
                    ? <span className="chip warn" style={{ fontSize: 10 }}>{STATUS_LABEL[m.status]}</span>
                    : <span style={{ opacity: .3, fontSize: 16 }}>›</span>}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="note info" onClick={onRate} style={{ cursor: 'pointer' }}>
        <b>Why rates sit above the forex price.</b> In markets with capital controls,
        dollar stablecoins trade at a premium because getting dollars out through official
        channels is hard and local demand outruns sell-side liquidity. Tap for detail.
      </div>
    </div>
  );
}
