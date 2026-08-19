# Wallets

Two ways in, and the default is deliberate.

## Email — embedded wallet

Enter an email. A real ed25519 keypair is generated in the browser, encrypted,
and stored locally. No documents, no forms, no extension.

* **PBKDF2-SHA256**, 250,000 iterations → **AES-GCM 256**
* The encryption key comes from a random 32-byte device secret by default
* Only ciphertext, salt and IV are persisted — never the secret key

By default there is **no passphrase**. The wallet is bound to that browser
profile, which is the same security posture as staying signed in to any app.
An optional passphrase makes it portable to another device, with an honest
warning attached: nothing recovers it if you forget it.

{% hint style="warning" %}
This is a burner-grade wallet. Browser-stored keys with no server-side recovery
are fine for testing with small amounts. Before real users, put an
embedded-wallet provider behind it — Privy, Web3Auth, Turnkey or Dynamic — which
give you key sharding and social recovery. That is what makes "log in with
email" safe rather than "lose your laptop, lose your money".
{% endhint %}

## Browser extension

Phantom, Solflare and Backpack are detected and supported. The trade-off is
latency: the approval popup adds roughly three seconds, taking a payment from
about 3.2 seconds to about six. Noticeable at a counter.

## Sending

Transfers use **TransferChecked**, not plain Transfer. TransferChecked verifies
the mint and decimals on-chain, so a wrong-mint or wrong-decimals bug fails
rather than moving the wrong amount.

The recipient's associated token account is created with the **idempotent**
instruction, so a race between two payments cannot fail the second one.

Every transfer is **simulated before signing**. Simulation failures surface the
program logs rather than a generic error, and nothing is sent.

## Guardrails

* Per-transaction cap, 25 USDC by default
* Address validated as base58 decoding to exactly 32 bytes
* Balance and SOL-for-fees checked before enabling the button
* A typed **SEND** confirmation on mainnet
* Amounts converted through string maths, never floats:

```js
MooCore.toBaseUnits('0.3', 6)   // 300000n — no drift
MooCore.toBaseUnits('0.0000001', 6)   // null — too precise for the mint
```
