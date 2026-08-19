# Pricing and the premium

## A stablecoin does not trade at the forex rate

This is the single most important thing in these docs, and it is
counter-intuitive.

In a market with capital controls, dollar stablecoins trade **above** the
official exchange rate. Getting dollars out through official channels is hard,
and local demand structurally exceeds sell-side liquidity, so the local order
book clears higher.

In India through 2026 that premium ran **7–10%**, roughly double its usual 3–4%,
after enforcement action squeezed the supply of inbound stablecoin. At one point
USDT traded at ₹102.88 against a USD/INR spot of ₹94.65 — an 8.5% premium.

## Why this breaks a forex feed

Quote spot into a market clearing 8% higher and **every trade is mispriced by
8%** — against you when buying, against the user when selling. On a ₹10,000
payment that is over 7% of the trade, gone.

The premium is not a curiosity. It is the market.

## The rate model

`rateModel()` takes inputs in preference order:

1. **Your own order book** — the only rate you actually have to honour
2. **A local exchange or P2P quote** for the token
3. **Spot forex × an observed premium**, clearly labelled as an estimate

```js
MooCore.rateModel({ spot: 94.65, local: 102.88, spreadPct: 0.005 })
// { mid: 102.88, sell: 102.36, buy: 103.39,
//   premiumPct: 8.69, source: 'orderbook', unusual: true }
```

`unusual` flags a premium above 5%, which the UI surfaces rather than hides.
Where no local book is connected the source reads **Estimated**, not Forex, so
nobody mistakes a modelled number for a quote.

{% hint style="danger" %}
Connect a real book before taking real orders. An assumed premium is fine for a
demo and dangerous in production — if the market has moved and you quote a stale
8.5%, you eat the difference on every trade.
{% endhint %}

## What to charge

Your competition is **not** UPI, which is free. The person holding USDC cannot
pay a shopkeeper with it at all. They are choosing between you and the off-ramp
they use today:

| Their current option | All-in cost | Time | Risk |
| --- | --- | --- | --- |
| Exchange sell → bank → UPI | 1.55% | ~6h | low |
| P2P marketplace | 1.50% | ~1.5h | counterparty |
| Local OTC desk | 2.00% | ~2h | legal, settlement |

**1% all-in** is cheaper than every legal alternative, instant, and carries no
counterparty risk. That is a category difference, not a marginal edge.

## Show the rate, charge a visible fee

Publish a rate close to true market and add an explicit fee, rather than
burying margin in a wide spread.

A hidden spread always gets discovered. The day a user compares your rate to the
market and finds three points they did not know about, they are gone. A visible
1% they agreed to survives that comparison — and you can generally charge more
in total with a transparent fee than a concealed one.

It also removes a risk: if you are not trying to capture the premium, you are
not exposed to it.

## Where the margin actually is

Users compare the rate. They do not compare any of this:

* **A floor on small tickets.** A $0.15 minimum makes a $5 payment viable at 3%
  effective. Nobody paying $5 is comparison-shopping basis points, while the
  $2,000 transfer — where they do compare — still sees a clean 1%.
* **The merchant side.** They already pay 2%+ on cards. 0.6% is a discount.
* **Immediacy.** Instant from the float can cost more than wait-for-match.

## A word on withholding taxes

Where a jurisdiction levies a withholding tax on transfers, absorbing it
commercially does **not** remove the obligation to deduct, remit and file. Those
are different things, and conflating them is expensive. `quotePayment()` models
both modes so the unit economics are visible either way:

```js
MooCore.quotePayment(1000, 87.4, 0.004, 'IN', 'absorb')
// netRevenue: -0.068  ← negative. A 1% withholding against a 0.4% fee loses money.
// breakEvenFeeRate: 0.01
```
