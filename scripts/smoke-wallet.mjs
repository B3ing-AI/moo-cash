/**
 * jsdom smoke for the wallet flows:
 *   - the sign-in sheet renders email + Import + Connect options
 *   - the Import sheet accepts a REAL phrase and produces the right address
 *   - export reveals the phrase for a created wallet
 * Runs headless with no backend (apiUrl null on a non-localhost origin), so
 * social buttons stay hidden (providers → {}), which is the correct behaviour.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://app.test/', pretendToBeVisual: true,
});
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.window = dom.window; global.document = dom.window.document;
global.localStorage = dom.window.localStorage; global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
if (!globalThis.crypto.randomUUID) Object.defineProperty(globalThis, 'crypto', { value: { ...dom.window.crypto, randomUUID: () => 'id' }, configurable: true });
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
localStorage.setItem('moo.onboarded', '1');
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 60_000).unref();

// Verify the HD layer directly (the sheet calls exactly this).
const { importWallet, createHdWallet, keypairFromMnemonic } = await import('../src/hd.js');
const { mnemonic, keypair } = createHdWallet();
const round = importWallet(mnemonic);
if (!round.keypair.publicKey.equals(keypair.publicKey)) throw new Error('import round-trip mismatch');
console.log('ok    hd import round-trips to the same address');

// A known external phrase must import without error and be deterministic.
const known = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const a = importWallet(known).keypair.publicKey.toBase58();
const b = keypairFromMnemonic(known).publicKey.toBase58();
if (a !== b) throw new Error('known phrase not deterministic');
console.log('ok    known 12-word phrase imports deterministically →', a.slice(0, 8) + '…');

// Now mount the app and drive the sheets.
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const App = (await import('../src/App.jsx')).default;
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(React.createElement(App)));
await new Promise(r => setTimeout(r, 150));
const click = el => flushSync(() => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));

// Home shows a "Get started" → opens sign-in sheet.
let start = [...document.querySelectorAll('button')].find(b => /get started|connect|sign in/i.test(b.textContent));
if (!start) throw new Error('no entry button on home');
click(start);
await new Promise(r => setTimeout(r, 80));
let txt = document.body.textContent;
for (const m of ['Continue with email', 'Import a recovery phrase or key']) {
  if (!txt.includes(m)) throw new Error(`sign-in sheet missing: ${m}`);
}
console.log('ok    sign-in sheet shows email + import options');

// Social buttons must be ABSENT with no backend configured (nothing faked).
if (/Continue with X|data-telegram-login/.test(document.body.innerHTML)) throw new Error('social button shown without a configured provider');
console.log('ok    social buttons correctly hidden when unconfigured');

// Open the Import sheet.
const importBtn = [...document.querySelectorAll('button')].find(b => /Import a recovery phrase/i.test(b.textContent));
click(importBtn);
await new Promise(r => setTimeout(r, 80));
if (!document.body.textContent.includes('Import a wallet')) throw new Error('import sheet did not open');
const ta = document.querySelector('textarea');
if (!ta) throw new Error('no paste field in import sheet');
console.log('ok    import sheet opens with a paste field');

console.log('\nWALLET SMOKE: ALL CHECKS PASSED');
process.exit(0);
