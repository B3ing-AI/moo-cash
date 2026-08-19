# Reading a QR code

Two formats cover every market the app supports. Both are decoded and validated
for real — a tampered code is rejected, not paid.

## UPI deep links (India)

```
upi://pay?pa=merchant@bank&pn=Merchant%20Name&am=340.00&cu=INR&mc=5812
```

Straightforward query-string parsing, plus a check that the payee address is
well formed:

```js
const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;
```

An amount is optional. A code without one means the merchant expects you to
enter it.

## EMVCo (everywhere else)

KHQR, QRIS, PromptPay, QR Ph and PIX all share the EMVCo merchant QR format:
tag-length-value triples, where the tag and length are two characters each.

```
00 02 01          payload format indicator
52 04 5812        merchant category code
53 03 116         currency (ISO-4217 numeric → KHR)
54 05 17500       amount
58 02 KH          country
59 12 Noodle House
63 04 A1B2        CRC
```

## The CRC, and a bug worth knowing about

Tag 63 is a CRC-16/CCITT-FALSE over everything up to and including `6304`. It is
what makes a tampered code detectable.

The implementation must run over **UTF-8 bytes**, not UTF-16 code units:

```js
const bytes = new TextEncoder().encode(str);   // not str.charCodeAt(i)
```

For ASCII payloads the two are identical, so a wrong implementation passes every
simple test. It fails silently on real QRIS and KHQR codes, which routinely
carry non-ASCII merchant names. This exact bug shipped and was caught only by
testing against the canonical check vector:

```js
crc16('123456789') === '29B1'   // CRC-16/CCITT-FALSE
```

If you touch this code, keep that assertion.

## Validity is stricter than the checksum

A CRC can match on a malformed TLV chain by coincidence. Validity therefore
requires the country tag, a merchant account tag, and a name or city:

```js
valid: crcOk && !!cc && !!acct && !!(t['59'] || t['60'])
```

The sample set in the app includes a deliberately corrupted code so the
rejection path stays tested. Keep it there.
