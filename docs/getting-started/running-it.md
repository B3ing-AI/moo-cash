# Running it

## It has to be served

Opening `index.html` from disk does not work, and the failure is confusing
rather than obvious. Three separate things break on a `file://` origin:

* **Wallet extensions do not inject.** Phantom is installed and working, but it
  cannot see the page. To the app this is indistinguishable from "no wallet
  installed", which sends people off to reinstall software they already have.
* **`getUserMedia` is blocked**, so the camera scanner never starts.
* **`localStorage` throws a `SecurityError`** on opaque origins. An unguarded
  read at the top of a script kills the entire file before any UI renders.

That last one is worth internalising. The app guards every storage access
through a small wrapper for exactly this reason:

```js
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : v }
             catch(e){ return d } },
  set(k, v){ try { localStorage.setItem(k, v); return true }
             catch(e){ return false } }
};
```

## Windows

Double-click **`START-HERE.bat`**. It serves the folder on
`http://localhost:8765` using PowerShell, which is already installed on every
Windows machine — nothing to download. Python and Node are tried as fallbacks
if script execution is blocked by policy.

## macOS and Linux

```bash
cd moo-cash
python3 -m http.server 8765
```

Then open `http://localhost:8765`.

## Checking it worked

The app diagnoses its own environment on load. If a wallet cannot connect it
tells you which of three things is actually wrong — opened as a file, no
extension installed, or an extension present but blocked — rather than showing
a generic error. There is a diagnostics panel showing page origin, secure
context, and which wallet objects it can see.

{% hint style="info" %}
`http://localhost` counts as a secure context per spec, but some engines report
`isSecureContext` as `false`. The app treats `https:` and `localhost` as secure
explicitly rather than trusting the flag.
{% endhint %}

## Test it on a phone

A payment app lives on a phone. You cannot meaningfully test scan-and-pay on a
desktop. Deploy it (see [Deploying](deploying.md)), open the URL on your phone,
and point the camera at a real QR code in a shop. That is the test that tells
you whether the flow works.
