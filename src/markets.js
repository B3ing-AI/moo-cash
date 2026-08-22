/**
 * The markets we can pay out in, and what each one costs.
 *
 * `fx` is local currency per 1 USDC and is a fallback only — the live rate
 * comes from the price feed. `premium` is the observed spread of the local
 * stablecoin market over spot forex, which in capital-controlled markets is
 * substantial and is the whole reason a forex feed alone misprices trades.
 */
export const MARKETS = [
  { cc: 'IN', name: 'India',        cur: 'INR', sym: '₹',    fx: 94.20,  premium: 0.085, rail: 'UPI',                 region: 'asia',   status: 'live' },
  { cc: 'KH', name: 'Cambodia',     cur: 'KHR', sym: '៛',    fx: 4035,   premium: 0,     rail: 'KHQR · Bakong',       region: 'asia',   status: 'live' },
  { cc: 'ID', name: 'Indonesia',    cur: 'IDR', sym: 'Rp',   fx: 15920,  premium: 0.011, rail: 'QRIS',                region: 'asia',   status: 'live' },
  { cc: 'PH', name: 'Philippines',  cur: 'PHP', sym: '₱',    fx: 58.40,  premium: 0.028, rail: 'QR Ph',               region: 'asia',   status: 'live' },
  { cc: 'VN', name: 'Vietnam',      cur: 'VND', sym: '₫',    fx: 26100,  premium: 0.015, rail: 'VietQR',              region: 'asia',   status: 'pilot' },
  { cc: 'SG', name: 'Singapore',    cur: 'SGD', sym: 'S$',   fx: 1.29,   premium: 0,     rail: 'PayNow',              region: 'asia',   status: 'live' },
  { cc: 'MY', name: 'Malaysia',     cur: 'MYR', sym: 'RM',   fx: 4.21,   premium: 0,     rail: 'DuitNow',             region: 'asia',   status: 'live' },
  { cc: 'TH', name: 'Thailand',     cur: 'THB', sym: '฿',    fx: 36.20,  premium: 0,     rail: 'PromptPay',           region: 'asia',   status: 'tourist' },
  { cc: 'CN', name: 'China',        cur: 'CNY', sym: '¥',    fx: 7.10,   premium: 0,     rail: '—',                   region: 'asia',   status: 'blocked' },
  { cc: 'NG', name: 'Nigeria',      cur: 'NGN', sym: '₦',    fx: 1580,   premium: 0.04,  rail: 'NQR · NIP',           region: 'africa', status: 'live' },
  { cc: 'KE', name: 'Kenya',        cur: 'KES', sym: 'KSh',  fx: 129.2,  premium: 0.02,  rail: 'M-Pesa',              region: 'africa', status: 'live' },
  { cc: 'GH', name: 'Ghana',        cur: 'GHS', sym: '₵',    fx: 15.40,  premium: 0.03,  rail: 'MTN MoMo',            region: 'africa', status: 'live' },
  { cc: 'ZA', name: 'South Africa', cur: 'ZAR', sym: 'R',    fx: 17.80,  premium: 0,     rail: 'PayShap',             region: 'africa', status: 'live' },
  { cc: 'TZ', name: 'Tanzania',     cur: 'TZS', sym: 'TSh',  fx: 2490,   premium: 0.02,  rail: 'Airtel Money',        region: 'africa', status: 'pilot' },
  { cc: 'BR', name: 'Brazil',       cur: 'BRL', sym: 'R$',   fx: 5.72,   premium: 0.032, rail: 'Pix',                 region: 'latam',  status: 'live' },
  { cc: 'AR', name: 'Argentina',    cur: 'ARS', sym: '$',    fx: 1465,   premium: 0.08,  rail: 'Transferencias 3.0',  region: 'latam',  status: 'live' },
  { cc: 'VE', name: 'Venezuela',    cur: 'VES', sym: 'Bs',   fx: 238,    premium: 0.09,  rail: 'Pago Móvil',          region: 'latam',  status: 'live' },
  { cc: 'CO', name: 'Colombia',     cur: 'COP', sym: '$',    fx: 3920,   premium: 0.02,  rail: 'Bre-B',               region: 'latam',  status: 'live' },
  { cc: 'EC', name: 'Ecuador',      cur: 'USD', sym: '$',    fx: 1,      premium: 0,     rail: 'Bank transfer',       region: 'latam',  status: 'live' },
  { cc: 'PE', name: 'Peru',         cur: 'PEN', sym: 'S/',   fx: 3.52,   premium: 0.01,  rail: 'Yape · Plin',         region: 'latam',  status: 'live' },
];

export const byCode = cc => MARKETS.find(m => m.cc === cc) || MARKETS[0];
export const payable = () => MARKETS.filter(m => m.status !== 'blocked');

/** The five corridors shown on the World screen, in the gallery's order. */
export const FEATURED = ['IN', 'BR', 'KH', 'ID', 'PH'];

export const REGION_LABEL = { asia: 'Asia', africa: 'Africa', latam: 'Latin America' };

export const STATUS_LABEL = {
  live: null,                 // nothing to say — this is the normal case
  pilot: 'Pilot',
  tourist: 'Tourists only',
  blocked: 'Not available',
};

/** Format a local-currency amount the way each market expects. */
export function fmtLocal(m, value) {
  const decimals = m.fx > 100 ? 0 : 2;
  return m.sym + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const fmtUsd = (v, d = 2) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
