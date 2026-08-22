/* ══════════════════════════════════════════════════════════════
   moo.cash — core engine
   Pure, dependency-free logic: QR parsing, fees and tax, the rate
   model, and the settlement planner. No DOM, no network — so it
   unit-tests in milliseconds and can move server-side unchanged.
   ══════════════════════════════════════════════════════════════ */
'use strict';


/* ─────────────── CRC-16/CCITT-FALSE ───────────────
   EMVCo QR uses this for the tag-63 checksum.
   poly 0x1021, init 0xFFFF, no reflect, no final xor.       */
function crc16(str) {
  /* Must run over UTF-8 BYTES, not UTF-16 code units: real KHQR and
     QRIS payloads carry non-ASCII merchant names, and charCodeAt
     would silently produce the wrong checksum for those. */
  const bytes = new TextEncoder().encode(str);
  let crc = 0xFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/* ─────────────── UPI deep link ───────────────
   upi://pay?pa=vpa@bank&pn=Name&am=100.00&cu=INR&tn=note&mc=5411
   Spec: NPCI UPI Linking Specification.                      */
const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

function parseUPI(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^upi:\/\//i.test(s)) return null;
  const qi = s.indexOf('?');
  if (qi === -1) return null;
  const q = new URLSearchParams(s.slice(qi + 1));
  const vpa = q.get('pa');
  if (!vpa) return null;
  const amt = q.get('am');
  const out = {
    scheme: 'UPI',
    vpa: vpa,
    name: q.get('pn') || null,
    amount: amt != null && amt !== '' ? Number(amt) : null,
    currency: q.get('cu') || 'INR',
    note: q.get('tn') || null,
    mcc: q.get('mc') || null,
    ref: q.get('tr') || null,
    valid: VPA_RE.test(vpa),
    country: 'IN'
  };
  if (out.amount != null && !isFinite(out.amount)) out.amount = null;
  return out;
}

/* ─────────────── EMVCo merchant QR ───────────────
   TLV: 2-char tag, 2-digit length, value.
   Used by KHQR (KH), QRIS (ID), PromptPay (TH), QR Ph, PIX…   */
function tlv(s) {
  const out = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.substr(i, 2);
    const lenStr = s.substr(i + 2, 2);
    if (!/^\d{2}$/.test(lenStr)) break;
    const len = parseInt(lenStr, 10);
    if (i + 4 + len > s.length) break;
    out[tag] = s.substr(i + 4, len);
    i += 4 + len;
  }
  return out;
}

const EMV_COUNTRY = {
  KH: { name: 'Cambodia',    rail: 'KHQR'      },
  TH: { name: 'Thailand',    rail: 'PromptPay' },
  ID: { name: 'Indonesia',   rail: 'QRIS'      },
  PH: { name: 'Philippines', rail: 'QR Ph'     },
  IN: { name: 'India',       rail: 'BharatQR'  },
  SG: { name: 'Singapore',   rail: 'PayNow'    },
  MY: { name: 'Malaysia',    rail: 'DuitNow'   },
  VN: { name: 'Vietnam',     rail: 'VietQR'    },
  BR: { name: 'Brazil',      rail: 'PIX'       }
};
/* ISO-4217 numeric → alpha, for the currencies we handle */
const CUR_NUM = { '116':'KHR','764':'THB','360':'IDR','608':'PHP','356':'INR','702':'SGD',
                  '458':'MYR','704':'VND','986':'BRL','840':'USD','404':'KES','936':'GHS',
                  '566':'NGN','710':'ZAR','834':'TZS' };

function parseEMV(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 8) return null;
  const t = tlv(s);
  /* tag 00 = payload format indicator, always "01" for EMVCo */
  if (t['00'] !== '01') return null;

  /* CRC: tag 63, computed over everything up to and including "6304" */
  let crcOk = false, given = null;
  const ci = s.lastIndexOf('6304');
  if (ci !== -1) {
    given = s.substr(ci + 4, 4).toUpperCase();
    crcOk = crc16(s.slice(0, ci + 4)) === given;
  }

  /* merchant account info lives in tags 26–51; grab the first populated one */
  let acct = null, acctTag = null;
  for (let n = 26; n <= 51; n++) {
    const k = String(n).padStart(2, '0');
    if (t[k]) { acct = tlv(t[k]); acctTag = k; break; }
  }

  const cc = (t['58'] || '').toUpperCase();
  const curNum = t['53'] || null;
  const amt = t['54'];

  return {
    scheme: 'EMVCO',
    static: t['01'] === '11',            // 11 = static, 12 = dynamic
    merchant: t['59'] || null,
    city: t['60'] || null,
    countryCode: cc || null,
    country: EMV_COUNTRY[cc] ? EMV_COUNTRY[cc].name : null,
    rail: EMV_COUNTRY[cc] ? EMV_COUNTRY[cc].rail : null,
    currency: curNum ? (CUR_NUM[curNum] || curNum) : null,
    amount: amt != null && amt !== '' && isFinite(Number(amt)) ? Number(amt) : null,
    mcc: t['52'] || null,
    acctTag: acctTag,
    acct: acct,
    crcGiven: given,
    crcOk: crcOk,
    /* EMVCo mandates tag 58 (country) and a merchant account tag.
       Requiring both stops a malformed TLV chain from looking valid
       just because the CRC happened to match. */
    valid: crcOk && !!cc && !!acct && !!(t['59'] || t['60'])
  };
}

/** Try UPI first, then EMVCo. Returns null if neither. */
function parseQR(raw) {
  return parseUPI(raw) || parseEMV(raw);
}

/* ─────────────── fees, TDS, quoting ───────────────
   India levies 1% TDS (Income-Tax Act s.194S) on the transfer of a
   virtual digital asset. It is a WITHHOLDING obligation — whoever
   absorbs it commercially, it must still be deducted and remitted.  */
const TDS_RATE = 0.01;
const TDS_COUNTRIES = { IN: TDS_RATE };
/* keypad helper: append a digit/dot to an amount string, safely */
function keypadPush(cur, key, maxDp) {
  const dp = maxDp === undefined ? 2 : maxDp;
  let s = String(cur == null ? '' : cur);
  if (key === 'back') return s.length <= 1 ? '' : s.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') return s.includes('.') ? s : (s === '' ? '0.' : s + '.');
  if (!/^\d$/.test(key)) return s;
  if (s === '0') s = '';                       // no leading zeros
  const next = s + key;
  const parts = next.split('.');
  if (parts[1] && parts[1].length > dp) return s;   // cap decimals
  if (parts[0].replace(/^0+/, '').length > 12) return s;  // sane ceiling
  return next;
}

/**
 * Quote a merchant payment.
 * @param {number} localAmount  amount in local currency
 * @param {number} fx           local units per 1 USDC
 * @param {number} feeRate      platform fee, e.g. 0.004
 * @param {string} country      ISO-2, drives TDS
 * @param {'absorb'|'pass'} tdsMode  who eats the TDS
 */
function quotePayment(localAmount, fx, feeRate, country, tdsMode) {
  const amt = Number(localAmount) || 0;
  const rate = Number(fx) || 0;
  if (amt <= 0 || rate <= 0) return null;

  const base = amt / rate;                 // USDC value of the goods
  const fee  = base * feeRate;             // our revenue
  const tdsRate = TDS_COUNTRIES[country] || 0;
  const tds  = base * tdsRate;             // statutory withholding

  const absorbed = tdsMode === 'absorb' && tdsRate > 0;
  const userPays = absorbed ? base + fee : base + fee + tds;
  const netRevenue = absorbed ? fee - tds : fee;

  return {
    base:  round6(base),
    fee:   round6(fee),
    tds:   round6(tds),
    tdsRate: tdsRate,
    absorbed: absorbed,
    userPays: round6(userPays),
    netRevenue: round6(netRevenue),
    /** fee rate that would break even while absorbing TDS */
    breakEvenFeeRate: tdsRate,
    marginPct: base > 0 ? round6((netRevenue / base) * 100) : 0
  };
}

function round6(v) { return Math.round(v * 1e6) / 1e6; }

/** Off-ramp quote: USDC → local currency, minus desk spread. */
function quoteOfframp(usdc, fx, spread, country, tdsMode) {
  const a = Number(usdc) || 0, rate = Number(fx) || 0;
  if (a <= 0 || rate <= 0) return null;
  const tdsRate = TDS_COUNTRIES[country] || 0;
  const tds = a * tdsRate;
  const absorbed = tdsMode === 'absorb' && tdsRate > 0;
  const sold = absorbed ? a : a - tds;
  const gross = sold * rate;
  const spreadAmt = gross * spread;
  return {
    gross: Math.round(gross * 100) / 100,
    spread: Math.round(spreadAmt * 100) / 100,
    tds: round6(tds),
    absorbed: absorbed,
    receives: Math.round((gross - spreadAmt) * 100) / 100,
    netRevenue: round6(spreadAmt / rate - (absorbed ? tds : 0))
  };
}

/* ─────────────── settlement flow ───────────────
   The product is: user holds USDC, scans the shopkeeper's EXISTING
   QR, shopkeeper receives local fiat in their bank. The shopkeeper
   changes nothing and never touches crypto.

   Nobody can do that in one hop. Something must sell the crypto and
   something must push the fiat. Who does each leg — and whether the
   money ever POOLS in your account — decides which licence you need.

   architecture:
     'pooled' → you hold fiat and pay the merchant out of it.
                In India that is Payment Aggregator activity.
     'direct' → a licensed venue sells and the fiat reaches the
                merchant without resting with you.                 */

const FLOWS = {
  IN: {
    country: 'India', rail: 'UPI', cur: 'INR',
    pooled: [
      { step:'User signs USDC transfer',      actor:'User wallet',        needs:null,
        note:'Non-custodial. Fine.' },
      { step:'USDC sold for INR',             actor:'FIU-registered VASP', needs:'FIU-IND registration (PMLA reporting entity)',
        note:'This is a VDA transfer — 1% TDS under s.194S bites here.', tds:true },
      { step:'INR pools in your account',     actor:'You',                 needs:'RBI Payment Aggregator authorisation + escrow with a scheduled commercial bank',
        note:'Pooling customer funds and settling to merchants IS the definition of a PA.', blocker:true },
      { step:'INR pushed to merchant VPA',    actor:'Sponsor bank / PSP',  needs:'NPCI membership via a sponsor bank',
        note:'The merchant just sees a normal UPI credit.' }
    ],
    direct: [
      { step:'User signs USDC transfer',      actor:'User wallet',        needs:null,
        note:'Non-custodial. Fine.' },
      { step:'USDC sold for INR',             actor:'FIU-registered VASP', needs:'FIU-IND registration',
        note:'1% TDS under s.194S applies here.', tds:true },
      { step:'INR lands in the USER\'s bank', actor:'VASP payout',         needs:'VASP\'s existing bank rails',
        note:'No pooling at your entity — this is what keeps you out of PA territory.' },
      { step:'User pays merchant on UPI',     actor:'User\'s own bank app',needs:null,
        note:'An ordinary UPI payment. Legally unremarkable.', ux:'Breaks the one-tap experience — two steps, and settlement lag.' }
    ]
  }
};

/** Return the modelled hops for a country + architecture. */
function settlementFlow(country, architecture) {
  const f = FLOWS[country];
  if (!f) return null;
  return { meta: f, hops: f[architecture] || f.direct };
}

/* ─────────────── the sell price ───────────────
   A stablecoin does NOT trade at the forex rate in a capital-controlled
   market. Indian P2P books price USDT/USDC well above USD/INR because
   getting dollars out through official channels is hard and local demand
   structurally exceeds sell-side liquidity. Through 2026 that premium ran
   7-10%, roughly double the usual 3-4%, after enforcement action squeezed
   supply.

   So a forex feed is the wrong input. Quoting spot in a market clearing
   8% higher means every trade is mispriced by 8% — against you if you're
   buying the USDC, against the user if you're selling it.

   Preference order:
     1. your own order book        — the only rate you actually have to honour
     2. a local INR exchange/P2P quote for the token
     3. spot forex x an observed premium, clearly labelled as an estimate  */

function rateModel(opts) {
  const o = opts || {};
  const spot = Number(o.spot) || null;             // forex, e.g. USD/INR
  const local = Number(o.local) || null;           // token price in local fiat
  const spreadPct = o.spreadPct == null ? 0.005 : Number(o.spreadPct);
  const assumedPremium = o.assumedPremium == null ? 0 : Number(o.assumedPremium);

  let mid, source;
  if (local)      { mid = local;                        source = 'orderbook'; }
  else if (spot)  { mid = spot * (1 + assumedPremium);  source = assumedPremium ? 'estimated' : 'forex'; }
  else return null;

  const premium = (local && spot) ? (local / spot - 1) : (assumedPremium || null);
  return {
    mid:      round6(mid),
    spot:     spot,
    sell:     round6(mid * (1 - spreadPct)),   // what a user receives per USDC
    buy:      round6(mid * (1 + spreadPct)),   // what a user pays per USDC
    premium:  premium == null ? null : round6(premium),
    premiumPct: premium == null ? null : round6(premium * 100),
    spreadPct: spreadPct,
    source:   source,
    /* a premium this large is a market signal, not a glitch — surface it */
    unusual:  premium != null && Math.abs(premium) > 0.05
  };
}

/* ─────────────── settlement planning ───────────────
   To feel as fast as UPI we pay the merchant from our own float BEFORE
   the user's USDC is final. Confirmed is ~0.6s, finalised ~13s; in that
   window we are extending credit.

   At realistic ticket sizes the expected exposure in that window is a
   few dollars, so it is worth taking — but only under a cap, and only
   when there is float to pay from. Above the cap we wait for finality.
   With no float we fall back to matching a counterparty, which is slow
   and must be shown honestly rather than dressed up as instant.

   Design rule for a shop counter: certainty beats speed. Never show a
   fast state we might have to retract.                                */

const TIMING = {
  sign:        150,     // embedded wallet, no popup (external adds ~3000)
  signExternal:3000,
  confirmed:   600,     // Solana optimistic confirmation
  finality:   13000,    // ~31 confirmations
  risk:         50,
  payout:     2200,     // UPI push via PSP — the real bottleneck
  done:        200,
  matching:  120000     // find a counterparty when float is dry
};

function settlementPlan(opts) {
  const o = opts || {};
  const amount    = Number(o.amount) || 0;
  const floatAvail= o.floatAvail == null ? Infinity : Number(o.floatAvail);
  const threshold = o.instantThreshold == null ? 200 : Number(o.instantThreshold);
  const dailyUsed = Number(o.dailyUsed) || 0;
  const dailyCap  = o.dailyCap == null ? Infinity : Number(o.dailyCap);
  const external  = !!o.externalWallet;

  if (amount <= 0) return { mode:'blocked', reason:'Enter an amount above zero.' };
  if (dailyUsed + amount > dailyCap) {
    return { mode:'blocked',
      reason:'This would take you over your '+dailyCap+' USDC limit. Verify to raise it.' };
  }

  const signMs = external ? TIMING.signExternal : TIMING.sign;
  const step = (k,label,ms,note) => ({ key:k, label:label, ms:ms, note:note||null });

  let mode, steps, exposure = 0, note;
  if (amount > floatAvail) {
    mode = 'matched';
    note = 'Not enough local currency on hand right now, so we\'ll match you with a counterparty first.';
    steps = [
      step('sign','Approving payment',signMs),
      step('confirm','Confirming on Solana',TIMING.confirmed),
      step('match','Finding a counterparty',TIMING.matching,'This is the slow part'),
      step('payout','Paying the merchant',TIMING.payout),
      step('done','Done',TIMING.done)
    ];
  } else if (amount <= threshold) {
    mode = 'instant';
    exposure = amount;                       // credit extended until finality
    steps = [
      step('sign','Approving payment',signMs),
      step('confirm','Confirming on Solana',TIMING.confirmed),
      step('risk','Checking limits',TIMING.risk),
      step('payout','Paying the merchant',TIMING.payout,'We front this from our float'),
      step('done','Done',TIMING.done)
    ];
  } else {
    mode = 'finality';
    note = 'Above '+threshold+' USDC we wait for full settlement before paying out. Adds about 13 seconds.';
    steps = [
      step('sign','Approving payment',signMs),
      step('confirm','Confirming on Solana',TIMING.confirmed),
      step('final','Waiting for final settlement',TIMING.finality,'Larger amount — we don\'t front this'),
      step('payout','Paying the merchant',TIMING.payout),
      step('done','Done',TIMING.done)
    ];
  }

  const etaMs = steps.reduce((a,s) => a + s.ms, 0);
  return {
    mode: mode,
    steps: steps,
    etaMs: etaMs,
    etaText: etaMs < 5000 ? (etaMs/1000).toFixed(1)+' seconds'
           : etaMs < 60000 ? Math.round(etaMs/1000)+' seconds'
           : 'about '+Math.round(etaMs/60000)+' minute'+(etaMs>=120000?'s':''),
    exposure: exposure,
    degraded: mode === 'matched',
    note: note || null,
    comparable: etaMs <= 5000        // UPI itself is 2-5s
  };
}

/** Expected credit at risk across a day of instant payments. */
function exposureModel(monthlyVolume, avgTicket, instantShare, finalityMs) {
  const vol = Number(monthlyVolume)||0, avg = Number(avgTicket)||1;
  const fMs = finalityMs == null ? TIMING.finality : finalityMs;
  const txPerDay = (vol/avg)/30;
  const activeSeconds = 12*3600;
  const inFlight = (txPerDay/activeSeconds) * (fMs/1000) * (Number(instantShare)||1);
  return {
    txPerDay: Math.round(txPerDay),
    expectedInFlight: round6(inFlight * avg),
    windowSeconds: fMs/1000
  };
}

/* ─────────────── country-scoped compliance ───────────────
   Only ever surface the rules that apply to the market the user is
   actually in. Showing India's TDS to someone paying in Cambodia is
   noise at best and misleading at worst.                          */
const COMPLIANCE = {
  IN: {
    tds: 0.01, tdsLabel: 'TDS 1% (s.194S)',
    badges: ['1% TDS', 'FIU-IND', '30% gains tax'],
    headline: 'Crypto is legal to hold and trade, but the RBI has said it should not be used for payments.',
    rules: [
      'FIU-IND registration required for the sell leg',
      'PAN + Aadhaar KYC before any INR movement',
      '1% TDS withheld on every VDA transfer',
      'Pooling INR before the merchant triggers RBI Payment Aggregator licensing'
    ],
    modes: ['scan', 'card']            // India also gets card-bill payment
  },
  KH: {
    tds: 0, badges: ['NBC recognised', 'Dollarised'],
    headline: 'Prakas B7-024-735 recognises fully-backed stablecoins. KHQR is one national standard.',
    rules: ['Operate under the NBC FinTech sandbox', 'Bakong membership for KHQR settlement'],
    modes: ['scan']
  },
  TH: {
    tds: 0, badges: ['Tourists only', 'Sandbox'],
    headline: 'Paying merchants in crypto is banned. TouristDigiPay is the only legal route, and only for visitors.',
    rules: ['Licensed digital asset operator required', 'BOT-regulated e-money partner', 'Cannot serve Thai residents'],
    modes: ['scan']
  },
  ID: { tds:0, badges:['OJK supervised'], headline:'QRIS is universal and supervision sits with the OJK.',
        rules:['Register with the OJK','QRIS acquirer partnership'], modes:['scan'] },
  PH: { tds:0, badges:['BSP VASP'], headline:'BSP-licensed VASP regime with large remittance flow.',
        rules:['BSP VASP licence','InstaPay / QR Ph membership'], modes:['scan'] },
  NG: { tds:0, badges:['High adoption'], headline:'Stablecoins are roughly 40% of the crypto market here.',
        rules:['SEC Nigeria registration','Bank partner for NIP transfers'], modes:['scan'] },
  KE: { tds:0, badges:['Mobile money'], headline:'Settlement is M-Pesa, not QR — you integrate mobile money.',
        rules:['CBK engagement','M-Pesa paybill/till integration via Safaricom'], modes:['scan'] },
  GH: { tds:0, badges:['VASP Act'], headline:'The VASP Act created VARO as a dedicated licensing regulator.',
        rules:['VARO licence','MTN MoMo integration'], modes:['scan'] },
  BR: { tds:0, badges:['PIX'], headline:'PIX is universal and the central bank is comparatively tolerant.',
        rules:['BCB payment institution authorisation','PIX participant via a bank'], modes:['scan'] },
  CN: { tds:0, badges:['Blocked'], blocked:true,
        headline:'All virtual-currency business is prohibited, including by offshore entities serving users in China.',
        rules:['No compliant route exists'], modes:[] }
};
function complianceFor(cc){
  return COMPLIANCE[cc] || { tds:0, badges:[], headline:null, rules:[], modes:['scan'] };
}
function tdsRateFor(cc){ return complianceFor(cc).tds || 0; }
function modesFor(cc){ return complianceFor(cc).modes || ['scan']; }

/* ─────────────── card bill payment ───────────────
   We deliberately never take a full card number. Routing a bill
   payment is done by the biller network from the last four digits
   plus the issuer, so collecting a full PAN would add PCI scope for
   no functional gain.                                              */
const ISSUERS = {
  IN: ['HDFC Bank','ICICI Bank','SBI Card','Axis Bank','Kotak','Amex India','IndusInd','RBL Bank','Yes Bank','IDFC First']
};
function validateCardBill(last4, issuer, amount, balanceUsdc, fx) {
  const errs = [];
  if (!/^\d{4}$/.test(String(last4 || ''))) errs.push('Enter the last 4 digits of the card.');
  if (!issuer) errs.push('Choose the card issuer.');
  const amt = Number(amount);
  if (!isFinite(amt) || amt <= 0) errs.push('Enter a bill amount above zero.');
  const usdcNeeded = (isFinite(amt) && fx > 0) ? amt / fx : null;
  if (usdcNeeded != null && balanceUsdc != null && usdcNeeded > balanceUsdc)
    errs.push('Not enough USDC — you need ' + usdcNeeded.toFixed(2) + '.');
  return { ok: errs.length === 0, errors: errs, usdcNeeded: usdcNeeded == null ? null : round6(usdcNeeded) };
}

/* ─────────────── base58 (address validation) ─────────────── */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function isValidSolanaAddress(a) {
  if (typeof a !== 'string') return false;
  if (a.length < 32 || a.length > 44) return false;
  for (const ch of a) if (B58.indexOf(ch) === -1) return false;
  return b58decode(a).length === 32;
}
function b58decode(s) {
  if (typeof s !== 'string' || s.length === 0) return [];
  const bytes = [];                       // must start empty, not [0]
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v === -1) return [];
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  /* each leading '1' is one leading zero byte */
  for (let k = 0; k < s.length && s[k] === '1'; k++) bytes.push(0);
  return bytes.reverse();
}

/* ─────────────── amount formatting ─────────────── */
function toBaseUnits(amount, decimals) {
  /* string maths — avoids float drift on token amounts */
  const s = String(amount);
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) return null;              // too precise for the mint
  const joined = (i || '0') + f.padEnd(decimals, '0');
  const trimmed = joined.replace(/^0+(?=\d)/, '');
  try { return BigInt(trimmed); } catch (e) { return null; }
}
function fromBaseUnits(units, decimals) {
  const s = BigInt(units).toString().padStart(decimals + 1, '0');
  const i = s.slice(0, -decimals) || '0';
  const f = decimals ? s.slice(-decimals) : '';
  return f ? (i + '.' + f).replace(/\.?0+$/, '') || '0' : i;
}

const MooCore = {
  crc16, parseUPI, parseEMV, parseQR, tlv,
  quotePayment, quoteOfframp, settlementFlow, keypadPush, rateModel,
  settlementPlan, exposureModel, TIMING,
  complianceFor, tdsRateFor, modesFor, validateCardBill,
  isValidSolanaAddress, b58decode,
  toBaseUnits, fromBaseUnits,
  TDS_RATE, EMV_COUNTRY, CUR_NUM, FLOWS, COMPLIANCE, ISSUERS
};

export default MooCore;
export {
  crc16, parseUPI, parseEMV, parseQR, tlv,
  quotePayment, quoteOfframp, settlementFlow, keypadPush, rateModel,
  settlementPlan, exposureModel, complianceFor, tdsRateFor, modesFor,
  validateCardBill, isValidSolanaAddress, toBaseUnits, fromBaseUnits,
};
