import { useState, useRef, useEffect } from 'react';
import MooCore from '../core.js';
import { Icon } from '../components/ui';
import { fmtLocal, fmtUsd } from '../markets';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

export default function ScanPay({ quote, usdc, connected, onPlaceOrder, onScanned, onHelp, toast }) {
  const m = quote.market;
  const rate = quote.sell || m.fx;
  const [amount, setAmount] = useState('');
  const [paste, setPaste] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);

  const value = parseFloat(amount || '0') || 0;
  const usdcNeeded = rate > 0 ? value / rate : 0;
  const overBalance = connected && usdcNeeded > usdc;

  const press = k => setAmount(a => MooCore.keypadPush(a, k, m.fx > 100 ? 0 : 2));

  /* ── camera ── */
  const stopCam = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  useEffect(() => () => stopCam(), []);

  const startCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);

      const { default: jsQR } = await import('jsqr');
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!streamRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
          canvasRef.current.width = v.videoWidth;
          canvasRef.current.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) { stopCam(); onScanned(code.data, value); return; }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      toast('Camera blocked — needs HTTPS. Use Paste code.');
      setScanning(false);
    }
  };

  return (
    <div className="screen">
      <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ flex: 1 }}>Scan &amp; Pay</h1>
        <button className="iconbtn" onClick={onHelp} aria-label="How paying works"><Icon.help /></button>
      </div>

      <div className="hint" onClick={onHelp}>
        <Icon.bell />
        <span style={{ flex: 1 }}>Ask the vendor for the bill amount first.</span>
      </div>

      <div style={{ margin: '24px 0 20px' }}>
        <div className={'amount-big' + (value <= 0 ? ' zero' : '')}>
          {m.sym}{amount === '' ? '0' : amount}
        </div>
        <div className="amount-conv">
          ≈ {fmtUsd(usdcNeeded)} USDC at {fmtLocal(m, rate)}
        </div>
      </div>

      <div className="pad">
        {KEYS.map(k => (
          <button
            key={k}
            className={k === 'back' ? 'back' : ''}
            onClick={() => press(k)}
            aria-label={k === 'back' ? 'Delete' : k}
          >
            {k === 'back' ? <Icon.del /> : k}
          </button>
        ))}
      </div>

      <div className="row" style={{ margin: '12px 0 14px' }}>
        <button className="btn" onClick={() => setAmount('')}>Clear</button>
        <button
          className="btn"
          onClick={() => connected && usdc > 0
            ? setAmount(String(Math.floor(usdc * rate)))
            : toast('Sign in to use your balance')}
        >Max</button>
      </div>

      <button
        className="btn dark"
        disabled={value <= 0 || overBalance}
        onClick={() => onPlaceOrder(value, usdcNeeded)}
      >
        {overBalance ? 'Not enough USDC' : 'Place Order →'}
      </button>

      <div style={{ marginTop: 11 }}>
        <button className="btn" onClick={scanning ? stopCam : startCam}>
          <Icon.camera /> {scanning ? 'Stop camera' : 'Scan QR'}
        </button>
      </div>

      <div className="reader" style={{ marginTop: 14, display: scanning ? 'block' : 'none' }}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="frame">
          <div className="corner c1" /><div className="corner c2" />
          <div className="corner c3" /><div className="corner c4" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 11 }}>
        <input
          className="input" placeholder="…or paste a payment code"
          value={paste} onChange={e => setPaste(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          className="btn" style={{ flex: 'none', width: 'auto', padding: '0 18px' }}
          disabled={!paste.trim()}
          onClick={() => { onScanned(paste, value); setPaste(''); }}
        >Go</button>
      </div>

      <div className="note info" style={{ marginTop: 14 }}>
        Real decoder — it parses <b>moocash://</b> invoices (server-verified signature),
        genuine <b>upi://pay</b> links and EMVCo payloads (KHQR, QRIS, PromptPay, QR Ph, PIX),
        checks the CRC, and refuses tampered codes.
      </div>
    </div>
  );
}
