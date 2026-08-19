# What needs a partner

Some things cannot be built by writing code, only by signing contracts. Being
direct about that early saves months.

| Capability | Why it needs a counterparty | Who |
| --- | --- | --- |
| **The sell leg** | Converting the user's USDC to local fiat is a regulated activity, and withholding tax is deducted here | A registered exchange or VASP in-market |
| **The payout leg** | Pushing fiat to a merchant's account needs membership of the local rail, via a sponsor bank | A local PSP per market |
| **Identity verification** | Regulated, with data-handling obligations | Sumsub, Onfido, Persona, or a local provider |
| **Holding user funds** | Custody, capital and safeguarding rules | A licensed custodian — or don't hold |
| **Paying returns on deposits** | Almost always a regulated investment product | Securities counsel first |

Every one of these gates on **entity plus licence** first. Nobody signs until
you have both.

## The asymmetry to watch

A card payment can be charged back for months. A crypto settlement is final in
seconds. Anyone bridging the two is short that difference and needs capital
reserved against it. This is what kills crypto payment companies, more often
than regulation does.

## Where the money rests decides the licence

For payment flows the licensing question is usually not *what* you move but
*where it pauses*.

* **Funds pool with you** before reaching the merchant → you are doing what a
  payment aggregator does. Expect authorisation plus a segregated escrow
  account at a regulated bank.
* **Funds never rest with you** → materially lighter, often the same user
  outcome in two steps instead of one.

`settlementFlow(cc, 'pooled' | 'direct')` models both so the trade-off is
explicit. The pooled version is the better experience and the harder licence.

{% hint style="danger" %}
Watch for the circular trap: sometimes the regulator who grants the licence is
the same body that has publicly opposed the activity. When that is true, the
plan is not "apply and wait" — it is "pick a different market".
{% endhint %}

## Never collect these

Passwords, full card numbers, government ID numbers. Bill-payment networks
route on issuer plus last four; a full card number adds compliance scope for no
functional gain. In production, card entry belongs inside the provider's own
iframe so the data never reaches your origin.

Hold that line even if a partner offers to accept the data.
