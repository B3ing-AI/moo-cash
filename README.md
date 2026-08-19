# moo.cash

Pay any local merchant QR from a USDC balance on Solana. The shopkeeper keeps
their existing QR and receives local currency into their existing account —
they never touch crypto and never learn who paid.

**Live now:** real Solana wallet (embedded or extension), real mainnet USDC
balances and SPL transfers, real UPI / EMVCo QR decoding with CRC validation,
live FX with a premium-aware pricing model, and a three-mode settlement engine.

**Not live:** the fiat payout leg, card rails, and KYC. Those need licensed
partners, not code. Integration points are marked in the UI.

---

## Deploy to Vercel

**Fastest route — drag and drop, about 60 seconds:**

1. Go to <https://vercel.com/new>
2. Drag this whole `moo-cash` folder onto the page
3. Name it `moo-cash`, leave the framework as **Other**, click **Deploy**

No build step. It's static files.

**Or from a repo:** push this folder to GitHub, then on Vercel choose
*Add New → Project → Import* and pick the repo. Every push redeploys.

---

## Push to GitHub

1. Create a repo at <https://github.com/new> named `moo-cash` (no README —
   this folder already has one)
2. On the empty repo page, click **uploading an existing file**
3. Drag in `index.html`, `core.js`, `app.js`, `vercel.json`, `.gitignore`,
   `README.md` and commit

Or with the CLI:

```bash
cd moo-cash
git init && git add . && git commit -m "moo.cash"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/moo-cash.git
git push -u origin main
```

---

## Why it must be served, not opened as a file

Browser extensions do not inject into `file://` pages, `getUserMedia` is
blocked there, and `localStorage` throws on opaque origins. Open `index.html`
directly and the wallet cannot connect, the camera will not start, and settings
will not persist.

Any of these work:

```bash
python -m http.server 8765      # then open http://localhost:8765
npx --yes http-server -p 8765 -c-1
```

On Windows, `START-HERE.bat` does this with PowerShell — nothing to install.

Once deployed to Vercel you get HTTPS, which is what you actually want:
**a payment app has to be tested on a phone**, pointed at a real QR code.

---

## Files

| File | What it is |
|---|---|
| `index.html` | Markup, styles, all screens |
| `core.js` | Pure logic — QR parsing, fees, TDS, rate model, settlement planner. No DOM, no network. Unit-tested standalone. |
| `app.js` | Wallet, Solana calls, camera, UI wiring |
| `vercel.json` | Static config + camera permission header |

`core.js` is deliberately dependency-free so it can be tested in Node and
reused server-side later. Keep new business logic there rather than in `app.js`.

---

## Configuration

Set in `app.js`:

| Constant | Default | Meaning |
|---|---|---|
| `INSTANT_THRESHOLD` | 200 USDC | Below this we front the payout for ~3.2s settlement |
| `UNVERIFIED_CAP` | 200 USDC | Monthly limit before identity verification |
| `LOCAL_PREMIUM.IN` | 0.085 | Assumed USDC premium over spot, used only until a real order book is connected |
| `DEFAULT_RPC` | public mainnet | Replace with a Helius or QuickNode URL — the public endpoint rate-limits balance reads |

Keep `INSTANT_THRESHOLD` at or below `UNVERIFIED_CAP`. Raising it above means
extending more credit to your least-verified users.

---

## Before this takes real money

- **Connect a real order book.** The premium is currently an estimate. Quoting
  spot into a market clearing 8% higher misprices every trade.
- **Idempotency keys on every payout.** Around 1–2% of pushes return pending or
  timeout. A blind retry double-pays merchants.
- **Licences before partners.** Nobody signs a payout agreement without an
  entity and registration in the market you're operating in.
