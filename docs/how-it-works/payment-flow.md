# The payment flow

## Amount first, QR second

The keypad comes before the scanner, and that ordering is load-bearing.

1. Ask the vendor for the bill amount. Do not ask for the QR yet.
2. Type it. Tap **Place Order**. This **locks the exchange rate**.
3. Now scan.

If you scanned first and priced afterwards, the rate could move between the
scan and the confirmation — and in a market where the stablecoin premium swings
several points in a week, that is not theoretical. Locking on order means the
number the user agreed to is the number they pay.

## What happens end to end

```
user taps pay
   │
   ├─ sign USDC transfer                 0.15s   (embedded wallet, no popup)
   ├─ submit, wait for 'confirmed'       0.60s   (not 'finalized' — see below)
   ├─ risk check: limit, float, VPA      0.05s   (in memory)
   ├─ push local currency to merchant    2.20s   ← the actual bottleneck
   └─ show confirmation                  0.20s
                                        ─────
                                         3.2s
```

UPI itself takes two to five seconds. This is comparable.

{% hint style="info" %}
**Solana is not the slow part.** It is 0.6 of 3.2 seconds. The bottleneck is the
bank API on the payout leg, which means optimising the chain side buys you
nothing. Latency belongs in the partner conversation as a hard requirement.
{% endhint %}

## The wallet choice is a latency decision

An external wallet like Phantom adds roughly three seconds of human approval —
the popup, the read, the click. That takes the flow to about six seconds, which
is visibly slower.

An embedded wallet signs without a popup. This is a large part of why apps in
this category log people in with an email rather than asking them to connect a
browser extension. It is not only an onboarding decision.

## Failure modes

The happy path is the easy part. These are the ones that hurt:

| Failure | Rough rate | Handling |
| --- | --- | --- |
| Payout timeout or pending | 1–2% | Idempotency key, then reconcile. **Never blind-retry** — you will double-pay merchants. |
| Invalid merchant VPA | ~0.5% | Validate before debiting the user; auto-refund if it fails after |
| Float runs dry | rare | Degrade to matched mode with an honest estimate |
| User's transfer fails after payout | <0.1% | Capped by the instant threshold; absorb as cost of goods |

The design principle underneath all of these: **at a shop counter, certainty
beats speed.** Three seconds with a definite outcome beats one second that
leaves the user unsure whether to pay again.
