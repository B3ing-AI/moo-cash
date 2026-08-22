import MooCore from './core.js';
import { byCode } from './markets.js';

/**
 * Live price feed.
 *
 * A stablecoin does not trade at the forex rate in a capital-controlled
 * market — India's USDT/USDC premium ran 7–10% through 2026. Quoting spot
 * into a market clearing 8% higher misprices every single trade, so the
 * premium is applied on top of whatever forex we fetch, and the UI is
 * explicit that this is an estimate until a real order book is connected.
 */
const SOURCES = [
  {
    name: 'Coinbase',
    url: 'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
    pick: j => {
      const r = j?.data?.rates;
      if (!r) return null;
      const out = {};
      for (const k in r) { const v = parseFloat(r[k]); if (isFinite(v) && v > 0) out[k] = v; }
      return Object.keys(out).length ? out : null;
    },
  },
  {
    name: 'exchangerate-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick: j => (j?.result === 'success' && j.rates) || null,
  },
];

export async function fetchRates(timeoutMs = 7000) {
  for (const s of SOURCES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(s.url, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const picked = s.pick(await res.json());
      if (picked) return { rates: picked, source: s.name, at: Date.now() };
    } catch { /* try the next source */ }
  }
  return { rates: null, source: null, at: 0 };
}

/**
 * Quote a market. `spot` is the forex rate; the local order-book price is
 * modelled as spot × (1 + premium) until a real book is wired in.
 */
export function quoteMarket(cc, rates, spreadPct = 0.005) {
  const m = byCode(cc);
  const spot = rates?.[m.cur] ?? m.fx;
  const local = m.premium ? spot * (1 + m.premium) : null;
  const model = MooCore.rateModel({
    spot,
    local,
    spreadPct,
    assumedPremium: local ? 0 : 0,
  });
  return { market: m, spot, ...model, estimated: !!m.premium };
}
