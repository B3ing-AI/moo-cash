# What moo.cash is

moo.cash lets someone holding **USDC on Solana** pay a shopkeeper who has never
heard of crypto.

The shopkeeper keeps the QR code already taped to their counter. They receive
local currency into the account they already use. They learn nothing about the
person who paid. From their side it is an ordinary payment.

That is the entire product. Everything in these docs exists to make that one
interaction fast, correctly priced, and honest about what it is doing.

## What actually runs today

| Works | Modelled or stubbed |
| --- | --- |
| Solana wallet — embedded or browser extension | The fiat payout leg |
| Real mainnet USDC and SOL balances | Card rails |
| Real SPL transfers, simulated before signing | Identity verification |
| UPI and EMVCo QR decoding with CRC validation | The staking pool |
| Live FX with a premium-aware pricing model | |
| Three-mode settlement planner | |

The split matters. Decoding a QR is code. Moving rupees is a licence. These
docs are careful never to blur the two, and neither is the app — anything
modelled says so on screen.

## The shape of the problem

Nobody can convert crypto to local cash in a single hop. Something has to sell
the stablecoin and something has to push the fiat. Who performs each leg, and
**whether the money ever rests in your account**, determines which licences you
need and how fast the payment can feel.

Most of the interesting engineering here follows from that one constraint.

## Where to start

* Want it running? [Running it](getting-started/running-it.md)
* Want to understand the code? [Architecture](getting-started/architecture.md)
* Want to know why it's fast? [Settlement modes](how-it-works/settlement.md)
* Want to know what it would take to launch? [What needs a partner](going-live/partners.md)
