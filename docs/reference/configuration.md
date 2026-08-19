# Configuration

Constants live at the top of `app.js`.

| Constant | Default | Meaning |
| --- | --- | --- |
| `INSTANT_THRESHOLD` | `200` | USDC below which the payout is fronted for ~3.2s settlement |
| `UNVERIFIED_CAP` | `200` | Monthly USDC limit before identity verification |
| `FLOAT_AVAIL` | `5000` | Local-currency float on hand (demo value) |
| `LOCAL_PREMIUM.IN` | `0.085` | Assumed stablecoin premium over spot, used only until a real order book is connected |
| `DEFAULT_RPC` | public mainnet | Replace with Helius or QuickNode |
| `CAP` | `25` | Per-transaction send cap, user-editable in Settings |

## Constraints between them

**`INSTANT_THRESHOLD` ≤ `UNVERIFIED_CAP`.** Above it you extend more credit to
less-verified users. At the defaults they are equal, which means unverified
users are always on the instant path and the finality path only opens up after
verification.

**`LOCAL_PREMIUM` is a placeholder.** It exists so the app does not quote spot
into a premium market. Replace it with a live book before real orders — see
[Pricing](../how-it-works/pricing.md).

## Timings

`MooCore.TIMING` holds the latency model used to build settlement plans:

```js
{ sign: 150, signExternal: 3000, confirmed: 600, finality: 13000,
  risk: 50, payout: 2200, done: 200, matching: 120000 }
```

`payout` is the one to measure against a real PSP. It dominates the total, and
it is the number to put in front of a partner as a requirement.

## Storage keys

| Key | Contents |
| --- | --- |
| `moo.vault` | Encrypted keypair: salt, IV, ciphertext, public key |
| `moo.dk` | 32-byte device secret, when no passphrase is set |
| `moo.region` | Selected payout market |
| `moo.onboarded` | Skips the login and region screens |
| `moo.rpc`, `moo.cap` | User settings |

All access goes through the `store` wrapper, which swallows the `SecurityError`
thrown on opaque origins.
