# Architecture

Three files, and the split is deliberate.

```
moo-cash/
├── index.html    markup, styles, every screen
├── core.js       pure logic — no DOM, no network
└── app.js        wallet, Solana, camera, UI wiring
```

## Why core.js is separate

`core.js` contains everything that can be decided without a browser: QR
parsing, fee and tax maths, the rate model, the settlement planner, base58
validation, token unit conversion.

It has **no DOM access and no network calls**. That buys three things:

* It runs in Node, so it can be unit-tested in milliseconds without a headless
  browser. Most bugs die here.
* It can move server-side later without modification. When you build a real
  backend, the quoting and settlement rules come with you.
* It forces a clean boundary. If a rule lives in `app.js` it is probably in the
  wrong place.

It is written as a UMD module, so the same file works as `module.exports` under
Node and as a global in the browser:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MooCore = factory();
}(typeof self !== 'undefined' ? self : this, function () { /* … */ }));
```

## Single-file builds

For distribution the three files can be inlined into one HTML file that runs
from anywhere. The build script replaces two markers:

```bash
node build-single-file.js \
  --template index.html --core core.js --app app.js --out product.html
```

{% hint style="warning" %}
The build uses **function replacers**, not string replacers. JavaScript's
`String.replace` interprets `$&`, `$'` and `` $` `` in the replacement, and this
codebase is full of `$('id')` and `${...}`. A string replacer silently corrupts
the output. This bit us once during testing.
{% endhint %}

After inlining, the script also verifies that every `onclick` handler resolves
to a defined function and every referenced element id exists in the markup.
Those checks cost nothing and catch the class of bug that only appears when a
user clicks something you forgot to rename.

## Testing layers

| Layer | What it catches | Speed |
| --- | --- | --- |
| `core.js` unit tests | parsing, maths, rules | milliseconds |
| build checks | dangling handlers and ids | instant |
| jsdom page tests | rendering, state, cross-feature | seconds |

The habit that matters more than any of them: when an assertion fails, work out
whether the **app** is wrong or the **test** is wrong. Both happen constantly.
Resolve it against an independent source — a canonical check vector, a hand
calculation — never by loosening the assertion until it passes.
