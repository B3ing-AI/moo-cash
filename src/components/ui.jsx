import { useEffect } from 'react';
import CowLogo from './CowLogo';

/* ── icons ── */
export const Icon = {
  menu:    () => <svg viewBox="0 0 24 24" className="ico"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  back:    () => <svg viewBox="0 0 24 24" className="ico"><path d="M15 5l-7 7 7 7" /></svg>,
  close:   () => <svg viewBox="0 0 24 24" className="ico"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  help:    () => <svg viewBox="0 0 24 24" className="ico"><circle cx="12" cy="12" r="9" /><path d="M12 16.5v-4M12 8.2v.01" /></svg>,
  down:    () => <svg viewBox="0 0 24 24" className="ico"><path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 20h16" /></svg>,
  home:    () => <svg viewBox="0 0 24 24" className="ico"><path d="M4 10l8-6 8 6v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19z" /></svg>,
  graze:   () => <svg viewBox="0 0 24 24" className="ico"><path d="M5 20V13M12 20V7M19 20v-9M5 13c0-3 2-4 3.5-4M12 7c0-3 2-4 3.5-4" /></svg>,
  qr:      () => <svg viewBox="0 0 24 24" className="ico"><path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16M7.5 7.5h3v3h-3zM13.5 7.5h3v3h-3zM7.5 13.5h3v3h-3zM13.5 13.5h3v3h-3z" /></svg>,
  world:   () => <svg viewBox="0 0 24 24" className="ico"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5z" /></svg>,
  gear:    () => <svg viewBox="0 0 24 24" className="ico"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" /></svg>,
  del:     () => <svg viewBox="0 0 24 24" className="ico"><path d="M20 5H9l-6 7 6 7h11a1 1 0 001-1V6a1 1 0 00-1-1zM13 9.5l5 5M18 9.5l-5 5" /></svg>,
  check:   () => <svg viewBox="0 0 24 24" className="ico"><path d="M20 6L9 17l-5-5" /></svg>,
  camera:  () => <svg viewBox="0 0 24 24" className="ico"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  bell:    () => <svg viewBox="0 0 24 24" className="ico"><path d="M18 15V10a6 6 0 10-12 0v5l-2 3h16zM10 21h4" /></svg>,
};

/* ── header used on every in-app screen ── */
/** Deterministic pastel avatar from an address — cheap on-brand identicon. */
function addrColor(addr) {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
}

export function Header({ onMenu, onReceive, onHome, address, walletLabel, onWallet }) {
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;
  return (
    <header className="hdr">
      <button className="iconbtn" onClick={onMenu} aria-label="Menu"><Icon.menu /></button>
      <div className="brand" onClick={onHome}>
        <CowLogo size={38} />
        <span className="wordmark">moo.cash</span>
      </div>
      {short ? (
        // Connected-wallet chip, like the goat.cash header: label + address + avatar.
        <button className="wallet-chip" onClick={onWallet} title={address}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)',
            border: 'var(--bd)', borderRadius: 999, boxShadow: 'var(--sh-sm)', padding: '5px 6px 5px 12px',
            fontWeight: 800, fontSize: 13.5, cursor: 'pointer', maxWidth: 168 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
            {walletLabel ? `${walletLabel} ` : ''}{short}
          </span>
          <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, #fff6, transparent), ${addrColor(address)}`,
            border: '2px solid var(--hide)', flex: '0 0 auto' }} />
        </button>
      ) : (
        <button className="receive-btn" onClick={onReceive}>Receive ↓</button>
      )}
    </header>
  );
}

/* ── bottom nav ── */
const TABS = [
  { id: 'home',     label: 'Home',     icon: Icon.home },
  { id: 'graze',    label: 'Graze',    icon: Icon.graze },
  { id: 'pay',      label: 'Pay',      icon: Icon.qr, center: true },
  { id: 'world',    label: 'World',    icon: Icon.world },
  { id: 'settings', label: 'Settings', icon: Icon.gear },
];

export function Nav({ tab, onTab }) {
  return (
    <div className="navwrap">
      <nav className="nav">
        {TABS.map(t =>
          t.center ? (
            <button key={t.id} className="paybtn" onClick={() => onTab(t.id)} aria-label="Scan and pay">
              <t.icon />
            </button>
          ) : (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)}>
              <t.icon />
              {t.label}
            </button>
          )
        )}
      </nav>
    </div>
  );
}

/* ── bottom sheet ── */
export function Sheet({ open, onClose, title, lede, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = e => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="scrim" onClick={onClose} />
      <div className="panel">
        <div className="grab" />
        {title && <h3>{title}</h3>}
        {lede && <div className="lede">{lede}</div>}
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function Toggle({ on, onChange }) {
  return (
    <button
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    ><i /></button>
  );
}

export function Row({ k, s, children }) {
  return (
    <div className="set-row">
      <div><div className="k">{k}</div>{s && <div className="s">{s}</div>}</div>
      {children}
    </div>
  );
}
