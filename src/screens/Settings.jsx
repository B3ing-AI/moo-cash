import Flag from '../components/Flag';
import { Row, Toggle } from '../components/ui';

const short = a => (a ? a.slice(0, 6) + '...' + a.slice(-4) : '—');

export default function Settings({
  address, market, email, hideBalances, setHideBalances,
  notifications, setNotifications, rpc,
  onCopy, onChangeRegion, onVerify, onExport, onDisconnect, onRpc,
}) {
  return (
    <div className="screen">
      <div className="page-title"><h1>Settings ⚙️</h1></div>

      <div className="set-card">
        <Row k="Wallet address" s={short(address)}>
          <button className="pillbtn lime" onClick={onCopy} disabled={!address}>Copy</button>
        </Row>

        <div className="set-row">
          <div>
            <div className="k">Payout region</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Flag cc={market.cc} size={22} />
              <span style={{ fontSize: 13, fontWeight: 700, opacity: .7 }}>
                {market.name} · {market.rail}
              </span>
            </div>
          </div>
          <button className="pillbtn butter" onClick={onChangeRegion}>Change →</button>
        </div>

        <Row k="Notifications" s="Payment alerts">
          <Toggle on={notifications} onChange={setNotifications} />
        </Row>

        <Row k="KYC / Limits" s="200 USDC · Unverified">
          <button className="pillbtn butter" onClick={onVerify}>Verify →</button>
        </Row>

        <Row k="Export private key" s="Encrypted backup">
          <button className="pillbtn pink" onClick={onExport} disabled={!address}>Export</button>
        </Row>

        <Row k="Disconnect" s="Clear session">
          <button className="pillbtn white" onClick={onDisconnect}>Log out</button>
        </Row>
      </div>

      <div className="set-card">
        <Row k="Hide balances" s="Mask amounts on screen">
          <Toggle on={hideBalances} onChange={setHideBalances} />
        </Row>
        <Row k="Solana RPC" s={rpc}>
          <button className="pillbtn white" onClick={onRpc}>Change</button>
        </Row>
      </div>

      <div className="card cream">
        <div className="lbl">What the shop sees</div>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          Nothing about you. They receive an ordinary local-currency credit into the
          account they already use, exactly as if a neighbour had paid them.
        </div>
        <div className="lbl" style={{ marginTop: 14 }}>What we need</div>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
          An email, up to <b>200 USDC</b> a month. Above that, identity verification is
          required — that part isn't optional anywhere we operate, and any service telling
          you otherwise is one enforcement action away from disappearing with your balance.
        </div>
      </div>

      <div className="fine" style={{ marginBottom: 8 }}>
        {email ? `Signed in as ${email}` : 'Not signed in'}
      </div>
      <div className="card cream" style={{ textAlign: 'center', boxShadow: 'var(--sh-sm)' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          moo.cash v2.0 · Non-custodial · Solana Mainnet
        </div>
      </div>
    </div>
  );
}
