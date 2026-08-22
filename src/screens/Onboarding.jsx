import { useState } from 'react';
import CowLogo from '../components/CowLogo';
import Flag from '../components/Flag';
import { Icon } from '../components/ui';
import { payable, REGION_LABEL, STATUS_LABEL } from '../markets';

/** Screen 1 — the green hero. */
function Hero({ onContinue, onConnect }) {
  return (
    <section className="ob-screen">
      <div className="ob-hero">
        <div className="ob-trust">
          <span className="chip">No signup</span>
          <span className="chip">Shop never sees you</span>
          <span className="chip">19 countries</span>
        </div>

        <div className="ob-mascot"><CowLogo size="100%" /></div>

        <h1 className="ob-title">
          Scan. Pay.
          <span className="lime">Legendairy.</span>
        </h1>
        <p className="ob-sub">
          Scan any local QR code and pay instantly in USDC. Merchants get local cash.
        </p>
      </div>

      <div className="ob-actions">
        <button className="btn butter" onClick={onContinue}>✉️&nbsp; Continue with email</button>
        <button className="btn" onClick={onConnect}>Connect existing wallet</button>
        <div className="fine">Non-custodial. Your key never leaves your device.</div>
      </div>
    </section>
  );
}

/** Screen 2 — where the merchant gets paid. */
function Region({ selected, onSelect, onContinue }) {
  const rows = payable();
  const groups = ['asia', 'africa', 'latam'];
  return (
    <section className="ob-screen" style={{ background: 'var(--milk)', padding: '30px 20px 26px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ fontSize: 30 }}>Where do we pay out?</h1>
        <p style={{ fontSize: 14.5, fontWeight: 700, opacity: .68, margin: '6px 0 18px' }}>
          Pick where your merchant gets local cash.
        </p>

        <div className="region-list" style={{ flex: 1, overflowY: 'auto' }}>
          {groups.map(g => {
            const inGroup = rows.filter(m => m.region === g);
            if (!inGroup.length) return null;
            return (
              <div key={g}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .5, margin: '14px 2px 8px' }}>
                  {REGION_LABEL[g]}
                </div>
                {inGroup.map(m => (
                  <div
                    key={m.cc}
                    className={'region' + (selected === m.cc ? ' on' : '')}
                    onClick={() => onSelect(m.cc)}
                  >
                    <Flag cc={m.cc} size={42} />
                    <div className="mid">
                      <div className="n">{m.name}</div>
                      <div className="c">{m.sym} · {m.cur} · {m.rail}</div>
                    </div>
                    <div className="radio">{selected === m.cc && <Icon.check />}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ paddingTop: 16 }}>
          <button className="btn dark" onClick={onContinue}>Continue →</button>
          <div className="fine">
            By continuing, you agree to our{' '}
            <a href="https://www.p2p.lol/tnc" target="_blank" rel="noopener noreferrer"
               style={{ fontWeight: 800, textDecoration: 'underline' }}>Terms &amp; Conditions</a>.
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Onboarding({ region, setRegion, onDone, onConnectWallet, onEmail }) {
  const [step, setStep] = useState('hero');
  return (
    <div className="onboard">
      {step === 'hero'
        ? <Hero onContinue={() => setStep('region')} onConnect={() => setStep('region')} />
        : <Region selected={region} onSelect={setRegion} onContinue={onDone} />}
    </div>
  );
}
