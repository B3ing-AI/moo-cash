# Settlement modes

To feel as fast as UPI, the merchant is paid from our own float **before** the
user's USDC is final. Solana reaches `confirmed` in about 0.6 seconds and
`finalized` in about 13. In that window we are extending credit.

That is a real risk, so it is capped rather than assumed away.

## Three modes

| Mode | When | Time | Credit extended |
| --- | --- | --- | --- |
| **Instant** | under the threshold, float available | ~3.2s | the payment amount |
| **Full settlement** | over the threshold | ~16s | none |
| **Matched** | float is low | ~2 min | none |

`settlementPlan()` picks one and returns the steps, an ETA, and the exposure.
The UI shows the mode *before* the user commits, so nobody is surprised.

## Why the exposure is acceptable

At $1,000,000/month with a $12 average ticket:

```
83,333 transactions/month  →  2,778/day
expected value sitting in the 13-second window  ≈  $10
```

Ten dollars. Across the entire business, at any moment. That is not a risk, it
is a rounding error — and it buys every customer a three-second checkout.

It scales linearly, so re-run the number as volume grows. `exposureModel()`
does this:

```js
MooCore.exposureModel(1_000_000, 12, 1)
// { txPerDay: 2778, expectedInFlight: 10.03, windowSeconds: 13 }
```

## Why there's a threshold anyway

Expected exposure is an average. A single large payment is not. Above the
threshold the app waits for finality — thirteen extra seconds is a fair price
for not fronting a large sum on an unconfirmed transfer.

A **$200 threshold covers about 98.5% of payments by count**, so almost nobody
experiences the slow path.

{% hint style="warning" %}
Keep `INSTANT_THRESHOLD` at or below `UNVERIFIED_CAP`. If the instant threshold
is higher, you are extending more credit to your **least verified** users, which
is exactly backwards. At the current defaults both are 200 USDC, so unverified
users are always on the instant path and the finality path only becomes
reachable after verification.
{% endhint %}

## Degrading honestly

When the float cannot cover a payment, the app does not fail and does not
pretend. It says it will match a counterparty first and quotes minutes, not
seconds.

```js
{ mode: 'matched', degraded: true, etaText: 'about 2 minutes',
  note: "Not enough local currency on hand right now, so we'll match you
         with a counterparty first." }
```

A slow payment is recoverable. A failed one at a till counter, with a queue
behind you, is not. The home screen carries a capacity gauge that turns red
before this happens, so it is rarely a surprise.

## Float sizing

This is the number people get wrong, usually by a factor of sixty.

A settlement buffer is not an inventory position. If it rebalances hourly, it
turns over many times a day:

| Rebalance interval | Float needed at $1M/month |
| --- | --- |
| 15 minutes | ~$2,100 |
| **1 hour** | **~$8,300** |
| 4 hours | ~$33,000 |

Not $500,000. Hourly is usually the sweet spot — faster rebalancing means less
capital but more transaction cost.

Holding a large reserve to earn yield on it means carrying market risk on the
whole balance. Holding a small one means you are exposed to nothing. Take the
small one.
