# Core API

Everything in `MooCore` is pure — no DOM, no network. Importable in Node:

```js
const MooCore = require('./core.js');
```

## QR parsing

```js
parseQR(raw)      // tries UPI, then EMVCo. null if neither
parseUPI(raw)     // { scheme, vpa, name, amount, currency, mcc, valid }
parseEMV(raw)     // { scheme, merchant, countryCode, currency, amount, crcOk, valid }
crc16(str)        // CRC-16/CCITT-FALSE over UTF-8 bytes
tlv(str)          // raw tag-length-value map
```

## Pricing

```js
rateModel({ spot, local, spreadPct, assumedPremium })
// → { mid, sell, buy, premiumPct, source, unusual, spreadPct }

quotePayment(localAmount, fx, feeRate, country, tdsMode)
// → { base, fee, tds, userPays, netRevenue, marginPct, breakEvenFeeRate }

quoteOfframp(usdc, fx, spread, country, tdsMode)
// → { gross, spread, receives, netRevenue }
```

`tdsMode` is `'absorb'` or `'pass'`, deciding who carries a withholding tax.

## Settlement

```js
settlementPlan({ amount, floatAvail, instantThreshold,
                 dailyUsed, dailyCap, externalWallet })
// → { mode, steps, etaMs, etaText, exposure, degraded, note, comparable }

exposureModel(monthlyVolume, avgTicket, instantShare)
// → { txPerDay, expectedInFlight, windowSeconds }
```

`mode` is `instant`, `finality`, `matched` or `blocked`. `comparable` is true
when the ETA is within UPI's own 2–5 second range.

## Compliance

```js
complianceFor(cc)   // { tds, badges, headline, rules, modes, blocked }
tdsRateFor(cc)      // withholding rate, 0 where none applies
modesFor(cc)        // which product modes that market allows
settlementFlow(cc, 'pooled' | 'direct')   // licensing hops
```

Everything regulatory keys off the selected market, so a user paying in one
country never sees another's tax regime.

## Values and validation

```js
isValidSolanaAddress(a)      // base58 decoding to exactly 32 bytes
toBaseUnits('1.5', 6)        // 1500000n — string maths, no float drift
fromBaseUnits(1500000n, 6)   // '1.5'
keypadPush(cur, key, maxDp)  // safe amount entry
validateCardBill(last4, issuer, amount, balance, fx)
```

`toBaseUnits` returns `null` rather than rounding when the input is more precise
than the mint allows. Callers must handle that.

## Testing it

```bash
node -e "
const C = require('./core.js');
console.assert(C.crc16('123456789') === '29B1', 'CRC broken');
console.assert(C.toBaseUnits('0.3', 6) === 300000n, 'float drift');
console.log('ok');
"
```

Those two assertions are worth keeping permanently. The first catches a CRC
implemented over the wrong encoding; the second catches float arithmetic
sneaking into money handling.
