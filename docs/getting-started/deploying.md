# Deploying

There is no build step. It is three static files plus a config.

## Vercel — drag and drop

1. Go to [vercel.com/new](https://vercel.com/new)
2. Drag the `moo-cash` folder onto the page
3. Name it `moo-cash`, leave framework as **Other**, click **Deploy**

About sixty seconds. You get HTTPS, which is what makes wallets and the camera
work everywhere.

## Vercel — from a repo

Push `moo-cash` to GitHub, then on Vercel choose **Add New → Project → Import**
and pick the repository. Every push redeploys.

```bash
cd moo-cash
git init && git add . && git commit -m "moo.cash"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/moo-cash.git
git push -u origin main
```

## What `vercel.json` does

```json
{
  "cleanUrls": true,
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Permissions-Policy", "value": "camera=(self)" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Content-Type-Options", "value": "nosniff" }
    ]
  }]
}
```

The `Permissions-Policy` header is the one that matters: without it some
browsers refuse `getUserMedia` even on HTTPS, and the scanner silently fails.

## Before a real launch

Replace the Solana RPC. The public mainnet endpoint is heavily rate-limited and
frequently refuses browser balance reads, which looks like an app bug and isn't.
A free Helius or QuickNode key fixes it — set it in Settings or change
`DEFAULT_RPC` in `app.js`.
