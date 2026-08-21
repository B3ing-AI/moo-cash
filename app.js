/* ══════════════════════════════════════════════════════════════
   moo.cash — app layer (real Solana, real QR, real FX)
   ══════════════════════════════════════════════════════════════ */
'use strict';
const C = MooCore;
const W3 = window.solanaWeb3;
const $ = id => document.getElementById(id);

/* ── on-chain constants ── */
const USDC_MINT   = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEC    = 6;
const TOKEN_PROG  = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROG    = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYS_PROG    = '11111111111111111111111111111111';
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

/* ── state ── */
let conn = null, pubkey = null, provider = null;
let usdc = 0, sol = 0;

/* localStorage throws a SecurityError on opaque origins (file:// among
   them). Reading it unguarded killed the whole script before any UI
   rendered — which looked exactly like "the wallet won't connect". */
const store = {
  get(k, d){ try{ const v=localStorage.getItem(k); return v===null?d:v }catch(e){ return d } },
  set(k, v){ try{ localStorage.setItem(k, v); return true }catch(e){ return false } }
};
let RPC = store.get('moo.rpc', DEFAULT_RPC);
let CAP = parseFloat(store.get('moo.cap', '25')) || 25;
let HIDE = false, SIM = true;
let SEL = 'IN', TDS_MODE = 'absorb';
let FX = {}, LOCAL = {}, fxSource = null, fxAt = 0;
let pendingTx = null;

/* ── nav / chrome ── */
function go(id){document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));
  document.querySelectorAll('.nav button[data-s]').forEach(b=>b.classList.toggle('on',b.dataset.s===id));
  if(id!=='s-pay') stopCam();
  window.scrollTo(0,0)}
function op(id){$(id).classList.add('on');document.body.style.overflow='hidden'}
function cl(id){$(id).classList.remove('on');document.body.style.overflow=''}
function dgo(id){cl('drawer');go(id)}
function tt(m){const t=$('toast');t.textContent=m;t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(t._x);t._x=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(18px)'},2600)}
function tog(id){const t=$(id);t.classList.toggle('on');
  if(id==='tHide'){HIDE=t.classList.contains('on');renderBal()}
  if(id==='tSim'){SIM=t.classList.contains('on')}}
const fmt=(v,d=2)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const short=a=>a?a.slice(0,4)+'…'+a.slice(-4):'—';

/* ══════════ markets ══════════ */
const MK=[
 {n:'India',cc:'IN',cur:'INR',sym:'₹',fx:87.4,reg:'asia',r:'UPI',s:'restricted',tds:1,
  w:'Legal but heavily taxed. FIU-IND registration is mandatory, 1% TDS applies to every VDA transfer and gains are taxed at 30% with no loss set-off. UPI works for on-ramp at FIU-registered platforms, though PhonePe, GPay and Paytm may block exchange payments.'},
 {n:'Cambodia',cc:'KH',cur:'KHR',sym:'៛',fx:4035,reg:'asia',r:'KHQR · Bakong',s:'live',isNew:1,
  w:'Heavily dollarised, and Prakas B7-024-735 recognises fully-backed stablecoins as a permitted asset class. Best-fit market.'},
 {n:'Indonesia',cc:'ID',cur:'IDR',sym:'Rp ',fx:16250,reg:'asia',r:'QRIS',s:'live',w:'Huge QRIS merchant base; supervision moved to the OJK.'},
 {n:'Philippines',cc:'PH',cur:'PHP',sym:'₱',fx:58.4,reg:'asia',r:'QR Ph',s:'live',alpha:1,w:'BSP-licensed VASP regime and enormous remittance flow.'},
 {n:'Vietnam',cc:'VN',cur:'VND',sym:'₫',fx:26100,reg:'asia',r:'VietQR',s:'pilot',isNew:1,w:'High grassroots adoption; framework still being finalised.'},
 {n:'Singapore',cc:'SG',cur:'SGD',sym:'S$',fx:1.29,reg:'asia',r:'PayNow',s:'live',isNew:1,w:'Clear MAS stablecoin framework. Sensible place to domicile.'},
 {n:'Malaysia',cc:'MY',cur:'MYR',sym:'RM',fx:4.21,reg:'asia',r:'DuitNow',s:'live',isNew:1,w:'Securities Commission licenses digital asset exchanges.'},
 {n:'Thailand',cc:'TH',cur:'THB',sym:'฿',fx:36.2,reg:'asia',r:'PromptPay',s:'tourist',isNew:1,
  w:'Crypto payment to merchants is banned. The only legal route is the TouristDigiPay sandbox — foreign visitors, licensed operator, baht to the merchant. Not available to Thai residents.'},
 {n:'China',cc:'CN',cur:'CNY',sym:'¥',fx:7.1,reg:'asia',r:'—',s:'blocked',
  w:'The February 2026 PBOC circular bans all virtual-currency business, extends it to stablecoins, and explicitly prohibits overseas entities from serving people inside China.'},
 {n:'Nigeria',cc:'NG',cur:'NGN',sym:'₦',fx:1580,reg:'africa',r:'NQR · NIP',s:'live',alpha:1,w:'Stablecoins are ~40% of the crypto market; second globally for adoption.'},
 {n:'Kenya',cc:'KE',cur:'KES',sym:'KSh ',fx:129.2,reg:'africa',r:'M-Pesa',s:'live',isNew:1,w:'Fifth globally for stablecoin use. Integrate mobile money, not QR.'},
 {n:'Ghana',cc:'GH',cur:'GHS',sym:'₵',fx:15.4,reg:'africa',r:'MTN MoMo',s:'live',isNew:1,w:'The VASP Act created VARO — among the clearest frameworks in Africa.'},
 {n:'South Africa',cc:'ZA',cur:'ZAR',sym:'R',fx:17.8,reg:'africa',r:'PayShap',s:'live',isNew:1,w:'FSCA licenses crypto asset service providers.'},
 {n:'Tanzania',cc:'TZ',cur:'TZS',sym:'TSh ',fx:2490,reg:'africa',r:'Airtel Money',s:'pilot',isNew:1,w:'Growing mobile money base, framework emerging.'},
 {n:'Brazil',cc:'BR',cur:'BRL',sym:'R$',fx:5.42,reg:'latam',r:'PIX',s:'live',w:'PIX is universal and the central bank is comparatively tolerant.'},
 {n:'Argentina',cc:'AR',cur:'ARS',sym:'$',fx:1465,reg:'latam',r:'Transferencias 3.0',s:'live',w:'Inflation makes dollar stablecoins a real savings product.'},
 {n:'Venezuela',cc:'VE',cur:'VES',sym:'Bs',fx:238,reg:'latam',r:'Pago Móvil',s:'live',w:'Deep organic stablecoin usage.'},
 {n:'Colombia',cc:'CO',cur:'COP',sym:'$',fx:3920,reg:'latam',r:'Bre-B',s:'live',alpha:1,w:'Bre-B is the new instant rail.'},
 {n:'Ecuador',cc:'EC',cur:'USD',sym:'$',fx:1,reg:'latam',r:'Bank transfer',s:'live',alpha:1,label:'Ecuador USD',w:'Dollarised — no FX step at all.'},
 {n:'Peru',cc:'PE',cur:'PEN',sym:'S/',fx:3.52,reg:'latam',r:'Yape · Plin',s:'live',alpha:1,w:'Yape and Plin dominate consumer payments.'}
];
const SB={live:['ok','Live'],pilot:['warn','Pilot'],tourist:['warn','Tourists only'],restricted:['warn','Restricted'],blocked:['stop','Not available']};
const mkBy=cc=>MK.find(m=>m.cc===cc);
const rate=m=>FX[m.cur]||m.fx;

/* ══════════ FX ══════════ */
async function loadFX(){
  const sources=[
    {name:'Coinbase', url:'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
     pick:j=>{const r=j&&j.data&&j.data.rates;if(!r)return null;const o={};
       for(const k in r){const v=parseFloat(r[k]);if(isFinite(v)&&v>0)o[k]=v}return Object.keys(o).length?o:null}},
    {name:'exchangerate-api', url:'https://open.er-api.com/v6/latest/USD',
     pick:j=>j&&j.result==='success'&&j.rates?j.rates:null}
  ];
  for(const s of sources){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),7000);
      const r=await fetch(s.url,{signal:ctl.signal}); clearTimeout(t);
      if(!r.ok) continue;
      const got=s.pick(await r.json());
      if(got){FX=got;fxSource=s.name;fxAt=Date.now();renderFX();renderBal();return}
    }catch(e){/* try next */}
  }
  fxSource=null;renderFX();
}
/* Observed 2026 premium of USDT/USDC over USD/INR on Indian P2P books.
   Used only as a labelled estimate when no local order-book quote is
   available — never presented as a real quote. */
const LOCAL_PREMIUM = { IN: 0.085 };

function rateInfo(){
  const m=mkBy(SEL);
  const spot = FX[m.cur] || m.fx;
  const local = LOCAL[m.cur] || null;                 // order-book quote, if we have one
  return C.rateModel({ spot, local,
    spreadPct: 0.005,
    assumedPremium: local ? 0 : (LOCAL_PREMIUM[m.cc] || 0) });
}
function renderFX(){
  const m=mkBy(SEL), r=rateInfo();
  if(!r){
    if($('p2pBuyVal')) $('p2pBuyVal').textContent='—';
    if($('p2pSellVal')) $('p2pSellVal').textContent='—';
    if($('sellChip')) $('sellChip').textContent='Sell price: —';
    if($('p2pConnectPreview')) $('p2pConnectPreview').textContent='Live P2P: —';
    return;
  }

  const showPrem = r.premiumPct != null && Math.abs(r.premiumPct) >= 1;
  const buyTxt = m.sym + fmt(r.buy, r.buy>100?2:2);
  const sellTxt = m.sym + fmt(r.sell, r.sell>100?2:2);

  /* In-house P2P rates update */
  if($('p2pBuyVal')) $('p2pBuyVal').textContent = buyTxt;
  if($('p2pSellVal')) $('p2pSellVal').textContent = sellTxt;
  if($('p2pPremBadge')) $('p2pPremBadge').textContent = showPrem ? `+${r.premiumPct.toFixed(1)}% Prem` : 'P2P Rates';
  if($('p2pConnectPreview')) $('p2pConnectPreview').textContent = `Live P2P: Buy ${buyTxt} · Sell ${sellTxt}`;

  if($('sellChip')){
    $('sellChip').innerHTML = 'Sell price: '+sellTxt + (showPrem?`<span class="prem">+${r.premiumPct.toFixed(1)}%</span>`:'');
  }

  $('fxV').textContent = {orderbook:'Order book', estimated:'Estimated', forex:'Forex'}[r.source];
  $('fxSrc').textContent = r.source==='estimated'
    ? 'spot + assumed premium'
    : (fxSource ? fxSource+' · '+new Date(fxAt).toLocaleTimeString() : 'offline — fallback');
  $('fxSrc').style.color = r.source==='estimated' ? 'var(--warn)' : (fxSource?'':'var(--stop)');
  renderRateSheet(r,m);
}
function renderRateSheet(r,m){
  const rows=[
    ['Spot forex (USD/'+m.cur+')', r.spot?m.sym+fmt(r.spot,2):'—'],
    ['Local '+m.cur+' market for USDC', r.source==='orderbook'?m.sym+fmt(r.mid,2):'not connected'],
    ['Premium over spot', r.premiumPct==null?'—':(r.premiumPct>0?'+':'')+r.premiumPct.toFixed(2)+'%'],
    ['Our spread', (r.spreadPct*100).toFixed(1)+'%'],
    ['You receive per USDC', m.sym+fmt(r.sell,2)],
    ['You pay per USDC', m.sym+fmt(r.buy,2)]
  ];
  $('rateBody').innerHTML=
    `<div class="brk">${rows.map(x=>`<div class="brw"><span class="k">${x[0]}</span><span class="v">${x[1]}</span></div>`).join('')}</div>`
  + (r.source==='estimated'
      ? `<div class="note warn"><b>This is an estimate, not a quote.</b> We're applying an assumed
         ${(LOCAL_PREMIUM[m.cc]*100).toFixed(1)}% premium to the forex rate because no local order book is
         connected. Before taking real orders you must price from a book you can actually fill against.</div>`
      : '')
  + (r.unusual
      ? `<div class="note info"><b>Why it's above the forex rate.</b> In markets with capital controls,
         dollar stablecoins trade at a premium because getting dollars out through official channels is hard
         and local demand runs ahead of sell-side liquidity. Through 2026 India's premium ran roughly 7–10%,
         about double its usual level, after enforcement action squeezed supply.<br><br>
         Quote spot here and you misprice by that whole margin — against you when buying, against the user
         when selling. The premium <i>is</i> the market.</div>`
      : `<div class="note info">Local pricing tracks spot closely here, so a forex reference is safe.</div>`);
}

/* ══════════ wallet ══════════ */
function detect(){
  if(window.phantom&&window.phantom.solana) return window.phantom.solana;
  if(window.solflare&&window.solflare.isSolflare) return window.solflare;
  if(window.backpack) return window.backpack;
  if(window.solana) return window.solana;
  return null;
}

/* ── diagnostics ──
   Browser extensions do NOT inject into file:// pages. Opening the
   HTML straight from disk therefore looks identical to "no wallet
   installed", which sends people off to reinstall Phantom they
   already have. Tell them what's actually wrong.                  */
function diagnose(){
  const proto=location.protocol;
  const host=location.hostname;
  const isFile = proto==='file:';
  const isLocal = host==='localhost'||host==='127.0.0.1'||host==='[::1]';
  /* Don't trust isSecureContext alone — http://localhost IS a secure
     context per spec, but some engines report it as false. */
  const secure = window.isSecureContext===true || proto==='https:' || isLocal;
  const found={
    Phantom:  !!(window.phantom&&window.phantom.solana),
    Solflare: !!(window.solflare),
    Backpack: !!(window.backpack),
    'window.solana': !!window.solana
  };
  const any=Object.values(found).some(Boolean);
  let cause=null, fix=null;
  if(isFile && !any){
    cause='The page is open as a file, not a website.';
    fix='file';
  }else if(!any && !secure){
    cause='This page is not a secure context, so extensions stay out.';
    fix='serve';
  }else if(!any){
    cause='No Solana wallet extension is injecting into this page.';
    fix='install';
  }
  return {proto,host,isFile,isLocal,secure,found,any,cause,fix,
    mobile:/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)};
}
function renderDiag(){
  const d=diagnose();
  const row=(k,v,good)=>`<div class="brw"><span class="k">${k}</span><span class="v" style="color:${good===undefined?'':good?'var(--ok)':'var(--stop)'}">${v}</span></div>`;
  let html=`<div class="brk">
    ${row('Page origin', d.isFile?'file:// (opened from disk)':d.proto+'//'+(d.host||''), !d.isFile)}
    ${row('Secure context', d.secure?'yes':'no', d.secure)}
    ${Object.entries(d.found).map(([k,v])=>row(k, v?'detected':'not found', v)).join('')}
  </div>`;

  if(d.fix==='file'){
    html+=`<div class="note stop"><b>This is the problem.</b> Browser wallet extensions refuse to inject into
      <code>file://</code> pages for security reasons. Phantom is probably installed and working fine — it simply
      cannot see this page. The camera scanner is blocked for the same reason.</div>
      <div class="note info"><b>Fix in one click.</b> In the same folder as this file there's a launcher:<br>
      · Windows — double-click <b>start-moocash.bat</b><br>
      · Mac — double-click <b>start-moocash.command</b><br>
      It serves the folder at <code>http://localhost:8765</code> and opens it. Wallets and camera both work there.</div>
      <div class="note warn"><b>Or do it by hand.</b> Open a terminal in this folder and run:
      <div class="code" style="margin-top:8px">python -m http.server 8765</div>
      then visit <code>http://localhost:8765/moo-cash-live.html</code></div>`;
  }else if(d.fix==='serve'){
    html+=`<div class="note stop"><b>Not a secure context.</b> Wallets and camera need <code>https://</code> or
      <code>localhost</code>. Serve the folder locally and reopen from <code>http://localhost:8765</code>.</div>`;
  }else if(d.fix==='install'){
    html+=`<div class="note warn"><b>No wallet extension detected.</b> Install
      <b>Phantom</b> (phantom.app), <b>Solflare</b> or <b>Backpack</b>, then reload this page.
      ${d.mobile?'<br><br>On mobile, open this URL inside your wallet app\'s built-in browser — extensions do not exist on mobile browsers.':''}</div>`;
  }else{
    html+=`<div class="note info">✅ A wallet is injecting correctly. If Connect still does nothing, unlock the
      wallet, then check whether it has this site blocked under its Connected Sites / Trusted Apps list.</div>`;
  }
  html+=`<button class="btn" style="margin-top:6px" onclick="cl('sh-diag')">Close</button>`;
  $('diagBody').innerHTML=html;
}
async function connect(){
  provider=detect();
  if(!provider){
    const d=diagnose();
    renderDiag(); op('sh-diag');
    tt(d.isFile?'Opened as a file — wallets can\'t connect':'No wallet detected');
    return;
  }
  const b=$('connBtn');b.innerHTML='<span class="sp w"></span> Connecting…';b.disabled=true;
  try{
    const res=await provider.connect();
    const pk=res&&res.publicKey?res.publicKey:provider.publicKey;
    if(!pk) throw new Error('Wallet returned no public key');
    pubkey=new W3.PublicKey(pk.toString());
    conn=new W3.Connection(RPC,'confirmed');
    onConnected(null);
  }catch(e){
    const msg=String(e&&e.message||e);
    if(/user rejected|declined|4001/i.test(msg)) tt('You declined the connection');
    else if(/locked/i.test(msg)) tt('Wallet is locked — unlock it and retry');
    else { renderDiag(); op('sh-diag'); tt('Connect failed: '+msg.slice(0,60)) }
  }finally{ b.innerHTML='Connect wallet';b.disabled=false }
}
function disconnect(){
  try{provider&&provider.disconnect&&provider.disconnect()}catch(e){}
  pubkey=null;conn=null;
  $('connectCard').style.display='';$('walletCard').style.display='none';
  $('dAddr').textContent='not connected';
  cl('drawer');tt('Disconnected');
}
function copyAddr(){
  if(!pubkey){tt('Not connected');return}
  navigator.clipboard.writeText(pubkey.toBase58()).then(()=>tt('Address copied 🐄'),()=>tt('Copy failed'));
}

/* ── ATA derivation ── */
function ataFor(owner,mint){
  return W3.PublicKey.findProgramAddressSync(
    [owner.toBytes(), new W3.PublicKey(TOKEN_PROG).toBytes(), new W3.PublicKey(mint).toBytes()],
    new W3.PublicKey(ATA_PROG)
  )[0];
}

async function refresh(){
  if(!conn||!pubkey) return;
  try{
    sol=(await conn.getBalance(pubkey))/1e9;
    $('solBal').textContent=sol.toFixed(4);
    $('solWarn').textContent = sol<0.001 ? '⚠ too low to send' : 'ok for fees';
    $('solWarn').style.color = sol<0.001 ? 'var(--stop)' : '';
  }catch(e){ $('solBal').textContent='?';$('solWarn').textContent='RPC error' }
  try{
    const r=await conn.getParsedTokenAccountsByOwner(pubkey,{mint:new W3.PublicKey(USDC_MINT)});
    usdc = r.value.length ? Number(r.value[0].account.data.parsed.info.tokenAmount.uiAmount||0) : 0;
    renderBal();
  }catch(e){
    usdc=0;renderBal();
    tt('Balance read failed — try a private RPC in Settings');
  }
  loadTxs();
}
function renderBal(){
  if(HIDE){$('bW').textContent='•••';$('bC').textContent='••';$('bLocal').textContent='USDC · hidden';return}
  const w=Math.floor(usdc),c=Math.round((usdc-w)*100).toString().padStart(2,'0');
  $('bW').textContent=w.toLocaleString();$('bC').textContent=c;
  const m=mkBy(SEL), r=rateInfo();
  const px=r?r.sell:rate(m);
  $('bLocal').textContent='≈ '+m.sym+Math.round(usdc*px).toLocaleString();
}
async function loadTxs(){
  const box=$('txs');
  try{
    const sigs=await conn.getSignaturesForAddress(pubkey,{limit:8});
    if(!sigs.length){box.innerHTML='<div class="fine" style="padding:18px 0">No transactions yet.</div>';return}
    box.innerHTML=sigs.map(s=>{
      const when=s.blockTime?new Date(s.blockTime*1000).toLocaleDateString():'pending';
      const bad=!!s.err;
      return `<div class="li"><div class="av" style="background:${bad?'var(--stop-bg)':'var(--grass-lt)'}">${bad?'✕':'◎'}</div>
        <div class="mid"><div class="t">${bad?'Failed':'Confirmed'}</div><div class="s">${when} · slot ${s.slot.toLocaleString()}</div></div>
        <div class="r"><a class="u" style="color:var(--grass-d);text-decoration:underline"
          href="https://solscan.io/tx/${s.signature}" target="_blank" rel="noopener">${s.signature.slice(0,6)}…</a></div></div>`;
    }).join('');
  }catch(e){ box.innerHTML='<div class="fine" style="padding:18px 0">Could not load history — RPC limit.</div>' }
}

/* ══════════ send ══════════ */
function valTo(){
  const v=$('sendTo').value.trim(),el=$('sendTo'),err=$('toErr');
  if(!v){el.classList.remove('err');err.style.display='none';return quoteSend()}
  const okAddr=C.isValidSolanaAddress(v);
  el.classList.toggle('err',!okAddr);
  err.style.display=okAddr?'none':'';
  err.textContent=okAddr?'':'Not a valid Solana address.';
  quoteSend();
}
function valAmt(){ quoteSend() }
function quoteSend(){
  const to=$('sendTo').value.trim(), amtS=$('sendAmt').value.trim();
  const units=C.toBaseUnits(amtS,USDC_DEC);
  const amt=units!==null?Number(units)/1e6:NaN;
  const rows=[];
  let blocked=null;
  if(units===null) blocked='Amount must be a number with at most 6 decimals.';
  else if(amt<=0) blocked='Enter an amount above zero.';
  else if(amt>usdc) blocked='More than your balance ('+fmt(usdc)+' USDC).';
  else if(amt>CAP) blocked='Above your '+CAP+' USDC send cap. Raise it in Settings if you mean it.';
  else if(!C.isValidSolanaAddress(to)) blocked='Enter a valid recipient address.';
  else if(sol<0.001) blocked='Not enough SOL for the network fee.';

  rows.push(['Amount', (isFinite(amt)?fmt(amt):'—')+' USDC']);
  rows.push(['To', to?short(to):'—']);
  rows.push(['Network fee','~0.000005 SOL']);
  rows.push(['Send cap',CAP+' USDC']);
  $('sendBrk').innerHTML=rows.map(r=>`<div class="brw"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`).join('')
    + (blocked?`<div class="brw neg"><span class="k">Blocked</span><span class="v">${blocked}</span></div>`:'');
  $('sendBtn').disabled=!!blocked;
  return !blocked;
}
async function doSend(){
  if(!quoteSend()) return;
  const to=$('sendTo').value.trim();
  const units=C.toBaseUnits($('sendAmt').value.trim(),USDC_DEC);
  const b=$('sendBtn');b.innerHTML='<span class="sp"></span> Building…';b.disabled=true;
  $('simOut').innerHTML='';
  try{
    const mint=new W3.PublicKey(USDC_MINT);
    const toPk=new W3.PublicKey(to);
    const src=ataFor(pubkey,USDC_MINT), dst=ataFor(toPk,USDC_MINT);
    const tx=new W3.Transaction();

    /* create recipient ATA if missing (idempotent instruction, payer = sender) */
    const dstInfo=await conn.getAccountInfo(dst);
    if(!dstInfo){
      tx.add(new W3.TransactionInstruction({
        keys:[{pubkey:pubkey,isSigner:true,isWritable:true},{pubkey:dst,isSigner:false,isWritable:true},
              {pubkey:toPk,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},
              {pubkey:new W3.PublicKey(SYS_PROG),isSigner:false,isWritable:false},
              {pubkey:new W3.PublicKey(TOKEN_PROG),isSigner:false,isWritable:false}],
        programId:new W3.PublicKey(ATA_PROG), data:new Uint8Array([1])   // CreateIdempotent
      }));
    }
    /* TransferChecked — safer than Transfer: the mint + decimals are verified on-chain */
    const data=new Uint8Array(10); data[0]=12;
    new DataView(data.buffer).setBigUint64(1,BigInt(units),true); data[9]=USDC_DEC;
    tx.add(new W3.TransactionInstruction({
      keys:[{pubkey:src,isSigner:false,isWritable:true},{pubkey:mint,isSigner:false,isWritable:false},
            {pubkey:dst,isSigner:false,isWritable:true},{pubkey:pubkey,isSigner:true,isWritable:false}],
      programId:new W3.PublicKey(TOKEN_PROG), data
    }));

    const {blockhash,lastValidBlockHeight}=await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash=blockhash; tx.feePayer=pubkey;

    if(SIM){
      b.innerHTML='<span class="sp"></span> Simulating…';
      const sim=await conn.simulateTransaction(tx);
      if(sim.value.err){
        $('simOut').innerHTML=`<div class="note stop"><b>Simulation failed — nothing was sent.</b><div class="code" style="margin-top:8px">${
          escapeHtml(JSON.stringify(sim.value.err))+'\n\n'+escapeHtml((sim.value.logs||[]).slice(-8).join('\n'))}</div></div>`;
        b.innerHTML='Review &amp; send';b.disabled=false;return;
      }
      $('simOut').innerHTML='<div class="note info">✅ Simulation passed — the transaction should succeed.</div>';
    }
    pendingTx={tx,lastValidBlockHeight,to,units,newAta:!dstInfo};
    $('confBrk').innerHTML=[
      ['Sending', fmt(Number(units)/1e6)+' USDC'],
      ['To', to],
      ['Creates token account', !dstInfo?'yes (~0.002 SOL rent)':'no'],
      ['Network', 'Solana mainnet-beta']
    ].map(r=>`<div class="brw"><span class="k">${r[0]}</span><span class="v" style="word-break:break-all">${r[1]}</span></div>`).join('');
    $('confWord').value='';valConf();
    cl('sh-send');op('sh-confirm');
  }catch(e){
    $('simOut').innerHTML=`<div class="note stop"><b>Could not build transaction.</b><br>${escapeHtml(e.message||String(e))}</div>`;
  }finally{ b.innerHTML='Review &amp; send';b.disabled=false }
}
function valConf(){ $('confBtn').disabled = $('confWord').value.trim().toUpperCase()!=='SEND' }
async function reallySend(){
  if(!pendingTx) return;
  const b=$('confBtn');b.innerHTML='<span class="sp w"></span> Awaiting wallet…';b.disabled=true;
  try{
    let sig;
    if(provider.signAndSendTransaction){
      sig=(await provider.signAndSendTransaction(pendingTx.tx)).signature;
    }else{
      const signed=await provider.signTransaction(pendingTx.tx);
      sig=await conn.sendRawTransaction(signed.serialize());
    }
    b.innerHTML='<span class="sp w"></span> Confirming…';
    await conn.confirmTransaction({signature:sig,blockhash:pendingTx.tx.recentBlockhash,
      lastValidBlockHeight:pendingTx.lastValidBlockHeight},'confirmed');
    cl('sh-confirm');
    $('qrBody').innerHTML=`<div class="ok"><div class="rg"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <h2>Sent</h2><div class="p">${fmt(Number(pendingTx.units)/1e6)} USDC confirmed on Solana</div>
      <div class="brk" style="text-align:left"><div class="brw"><span class="k">Signature</span>
        <span class="v" style="font-family:ui-monospace,monospace;font-size:11px;word-break:break-all">${sig}</span></div></div>
      <a class="btn lime" href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener" style="text-decoration:none">View on Solscan ↗</a>
      <button class="btn ghost" style="margin-top:6px" onclick="cl('sh-qr')">Close</button></div>`;
    op('sh-qr');
    pendingTx=null;refresh();
  }catch(e){
    tt('Send failed: '+(e.message||e).slice(0,80));
    b.innerHTML='Send it';b.disabled=false;
  }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ══════════════════════════════════════════════════════════
   FLAGS — drawn, not emoji.

   Windows has no glyphs for regional-indicator flag sequences, so
   a flag sequence renders as its two letters (IN, KH) on most of our
   users' machines. Inline SVG looks the same everywhere, and
   it works offline. viewBox 0 0 60 40, cropped to a circle.
   ══════════════════════════════════════════════════════════ */
const FLAGS={
 IN:'<rect width="60" height="13.3" fill="#FF9933"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.7" width="60" height="13.3" fill="#138808"/><circle cx="30" cy="20" r="5.2" fill="none" stroke="#000088" stroke-width="1.3"/><circle cx="30" cy="20" r="1" fill="#000088"/>',
 KH:'<rect width="60" height="40" fill="#032EA1"/><rect y="10" width="60" height="20" fill="#E00025"/><path d="M24 25h12v2.5H24zM26.5 17h7v8h-7zM30 12.5l4.5 4.5h-9z" fill="#fff"/>',
 ID:'<rect width="60" height="20" fill="#CE1126"/><rect y="20" width="60" height="20" fill="#fff"/>',
 PH:'<rect width="60" height="20" fill="#0038A8"/><rect y="20" width="60" height="20" fill="#CE1126"/><path d="M0 0l26 20L0 40z" fill="#fff"/><circle cx="8.5" cy="20" r="4.2" fill="#FCD116"/>',
 VN:'<rect width="60" height="40" fill="#DA251D"/><path d="M30 9.5l3.9 12h12.6l-10.2 7.4 3.9 12L30 33.5l-10.2 7.4 3.9-12-10.2-7.4h12.6z" fill="#FFFF00"/>',
 SG:'<rect width="60" height="20" fill="#ED2939"/><rect y="20" width="60" height="20" fill="#fff"/><circle cx="14" cy="10" r="7" fill="#fff"/><circle cx="17.5" cy="10" r="6" fill="#ED2939"/>',
 MY:'<rect width="60" height="40" fill="#fff"/><rect width="60" height="5.7" fill="#CC0001"/><rect y="11.4" width="60" height="5.7" fill="#CC0001"/><rect y="22.8" width="60" height="5.7" fill="#CC0001"/><rect y="34.2" width="60" height="5.7" fill="#CC0001"/><rect width="30" height="22.8" fill="#010066"/><circle cx="12.5" cy="11" r="6" fill="#FFCC00"/><circle cx="15.5" cy="11" r="5" fill="#010066"/>',
 TH:'<rect width="60" height="40" fill="#A51931"/><rect y="6.7" width="60" height="26.6" fill="#F4F5F8"/><rect y="13.3" width="60" height="13.4" fill="#2D2A4A"/>',
 CN:'<rect width="60" height="40" fill="#DE2910"/><path d="M12 6.5l2.4 7.4h7.8l-6.3 4.6 2.4 7.4L12 21.3l-6.3 4.6 2.4-7.4-6.3-4.6h7.8z" fill="#FFDE00"/>',
 NG:'<rect width="20" height="40" fill="#008751"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#008751"/>',
 KE:'<rect width="60" height="40" fill="#fff"/><rect width="60" height="11" fill="#000"/><rect y="14" width="60" height="12" fill="#BB0000"/><rect y="29" width="60" height="11" fill="#006600"/><ellipse cx="30" cy="20" rx="5.5" ry="11" fill="#BB0000" stroke="#fff" stroke-width="1.6"/>',
 GH:'<rect width="60" height="13.3" fill="#CE1126"/><rect y="13.3" width="60" height="13.4" fill="#FCD116"/><rect y="26.7" width="60" height="13.3" fill="#006B3F"/><path d="M30 14.5l2.2 6.6h7l-5.6 4.1 2.1 6.6-5.7-4-5.7 4 2.1-6.6-5.6-4.1h7z" fill="#000"/>',
 ZA:'<rect width="60" height="20" fill="#002395"/><rect y="20" width="60" height="20" fill="#DE3831"/><path d="M0 0l30 20L0 40z" fill="#007A4D"/><path d="M0 6.5l20.5 13.5L0 33.5z" fill="#fff"/><path d="M0 12l12 8L0 28z" fill="#FFB612"/>',
 TZ:'<rect width="60" height="40" fill="#1EB53A"/><path d="M60 4v36H14z" fill="#00A3DD"/><path d="M0 40L60 0h-9L0 34z" fill="#FCD116"/><path d="M0 34L51 0h-8L0 28z" fill="#000"/>',
 BR:'<rect width="60" height="40" fill="#009C3B"/><path d="M30 5l24 15-24 15L6 20z" fill="#FFDF00"/><circle cx="30" cy="20" r="8.5" fill="#002776"/>',
 AR:'<rect width="60" height="13.3" fill="#74ACDF"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.7" width="60" height="13.3" fill="#74ACDF"/><circle cx="30" cy="20" r="4.2" fill="#F6B40E"/>',
 VE:'<rect width="60" height="13.3" fill="#FFCC00"/><rect y="13.3" width="60" height="13.4" fill="#00247D"/><rect y="26.7" width="60" height="13.3" fill="#CF142B"/>',
 CO:'<rect width="60" height="20" fill="#FCD116"/><rect y="20" width="60" height="10" fill="#003893"/><rect y="30" width="60" height="10" fill="#CE1126"/>',
 EC:'<rect width="60" height="20" fill="#FFDD00"/><rect y="20" width="60" height="10" fill="#034EA2"/><rect y="30" width="60" height="10" fill="#ED1C24"/>',
 PE:'<rect width="20" height="40" fill="#D91023"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#D91023"/>'
};
function flag(cc, size){
  const s = size || 38;
  return `<span class="flagwrap" style="width:${s}px;height:${s}px">`
       + `<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`
       + (FLAGS[cc] || '<rect width="60" height="40" fill="#D9D2C0"/>')
       + `</svg></span>`;
}

/* ══════════════════════════════════════════════════════════
   ONBOARDING — login → choose payout region → app

   The privacy model, stated plainly so nobody wires it up wrong:
   below UNVERIFIED_CAP you transact with an email and nothing else,
   and the merchant only ever sees an ordinary local-currency credit.
   Above the cap, verification is required. That is what "anonymous"
   honestly means here — no signup friction and a counterparty who
   can't identify you — not exemption from AML obligations.
   ══════════════════════════════════════════════════════════ */
const UNVERIFIED_CAP = 200;                      // USDC/month before KYC

function obNext(){
  $('obLogin').classList.remove('on');
  $('obRegion').classList.add('on');
  drawRegions();
  window.scrollTo(0,0);
}
/* One clean list, no status chrome. Every market here is one we pay out
   in — the operating detail that differs per country lives on the
   country sheet and in Settings, where it's actionable rather than
   decorative. */
function drawRegions(){
  const rows=MK.filter(m=>m.s!=='blocked');
  $('regionList').innerHTML=rows.map(m=>{
    const sel=m.cc===SEL;
    return `<div class="rgrow ${sel?'sel':''}" onclick="pickRegion('${m.cc}')">
      ${flag(m.cc,42)}
      <div class="mid"><div class="n">${m.n}</div>
        <div class="c">${m.sym.trim()} · ${m.cur} · ${m.r}</div></div>
      <div class="rd">${sel?'<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>':''}</div></div>`;
  }).join('');
}
function pickRegion(cc){
  const m=mkBy(cc); if(!m||m.s==='blocked') return;
  SEL=cc; drawRegions();
}
function obFinish(){
  setMk(SEL);
  store.set('moo.onboarded','1');
  store.set('moo.region',SEL);
  $('onboard').classList.remove('on');
  document.body.style.overflow='';
  tt(mkBy(SEL).f+' Paying out in '+mkBy(SEL).cur);
}
function obReset(){
  store.set('moo.onboarded','');
  $('onboard').classList.add('on');
  $('obRegion').classList.remove('on');
  $('obLogin').classList.add('on');
}

/* ══════════════════════════════════════════════════════════
   EMBEDDED WALLET — email + passphrase
   A real ed25519 keypair generated in-browser, encrypted with
   PBKDF2-SHA256 (250k) → AES-GCM. Nothing leaves the device.
   Production wants Privy / Web3Auth / Turnkey for real recovery.
   ══════════════════════════════════════════════════════════ */
let localKeypair=null, emMode='create';
const enc=new TextEncoder(), dec=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

async function deriveKey(pass,salt){
  const base=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},
    base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptSecret(secretBytes,pass){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(pass,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,secretBytes);
  return {v:1,salt:b64(salt),iv:b64(iv),ct:b64(ct)};
}
async function decryptSecret(blob,pass){
  const key=await deriveKey(pass,unb64(blob.salt));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},key,unb64(blob.ct));
  return new Uint8Array(pt);
}
function deviceSecret(){
  let k = store.get('moo.dk','');
  if(!k){ k = b64(crypto.getRandomValues(new Uint8Array(32))); store.set('moo.dk',k) }
  return k;
}
function emVault(){ try{ return JSON.parse(store.get('moo.vault','null')) }catch(e){ return null } }

function emToggleMode(){
  emMode = emMode==='create' ? 'unlock' : 'create';
  const c=emMode==='create';
  $('emTitle').textContent   = c?'Continue with email':'Welcome back';
  $('emLede').textContent    = c?'We\'ll create a Solana wallet right here. No documents, no forms.'
                                :'Sign back into the wallet saved on this device.';
  $('emPassLbl').textContent = c?'Choose a passphrase':'Passphrase';
  $('emConfirmWrap').style.display = c?'':'none';
  $('emBtn').textContent     = c?'Create wallet':'Continue';
  $('emSwitch').textContent  = c?'I already have one on this device':'Create a new wallet instead';
  /* never carry a passphrase or a stale error across a mode switch */
  $('emPass').value=''; $('emPass2').value=''; emSubmitErr=null;
  emVal();
}
/* A failed submit (e.g. wrong passphrase) must survive the emVal()
   re-render that runs in emSubmit's finally block — otherwise the
   error flashes and vanishes and the user learns nothing. */
let emSubmitErr=null;
function emShowErr(msg){ emSubmitErr=msg; emVal() }
function emVal(){
  const email=$('emEmail').value.trim(), p1=$('emPass').value, p2=$('emPass2').value;
  const okEmail=/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
  const wantPass = usePassphrase();
  let err=null;
  if(email&&!okEmail) err='That doesn\'t look like an email address.';
  else if(wantPass&&p1&&p1.length<8) err='Passphrase needs at least 8 characters.';
  else if(wantPass&&emMode==='create'&&p2&&p1!==p2) err='The two passphrases don\'t match.';
  const show = err || emSubmitErr;
  $('emErr').innerHTML=show?`<div class="note stop" style="margin-bottom:12px">${show}</div>`:'';
  const ready = okEmail && (!wantPass || (p1.length>=8 && (emMode==='unlock'||p1===p2)));
  $('emBtn').disabled=!ready;
  return ready;
}
function usePassphrase(){ const t=$('tPass'); return !!(t && t.classList.contains('on')) }
function togglePass(){
  const t=$('tPass'); t.classList.toggle('on');
  const on=t.classList.contains('on');
  $('passFields').style.display = on?'':'none';
  $('emPass').value=''; $('emPass2').value=''; emSubmitErr=null;
  $('emNote').innerHTML = on
    ? `<div class="note warn"><b>Portable, but nothing recovers it.</b> Your passphrase encrypts the key,
       so you can restore this wallet on another device — and if you forget it the funds are gone. No reset link.</div>`
    : `<div class="note info"><b>This device only.</b> Your key is generated here and stays here. Anyone who can
       open this browser profile can use the wallet, exactly like staying signed in. Add a passphrase to move
       it to another device.</div>`;
  emVal();
}
/* typing anywhere clears a stale submit error */
['emEmail','emPass','emPass2'].forEach(id=>{
  const el=$(id); if(el) el.addEventListener('input',()=>{ if(emSubmitErr){emSubmitErr=null;emVal()} });
});
async function emSubmit(){
  if(!emVal()) return;
  const email=$('emEmail').value.trim();
  const pass = usePassphrase() ? $('emPass').value : deviceSecret();
  const b=$('emBtn'), label=b.textContent;
  b.innerHTML='<span class="sp"></span> Working…'; b.disabled=true;
  try{
    let kp;
    if(emMode==='create'){
      kp=W3.Keypair.generate();
      const blob=await encryptSecret(kp.secretKey,pass);
      blob.email=email; blob.pk=kp.publicKey.toBase58();
      if(!store.set('moo.vault',JSON.stringify(blob)))
        tt('Heads up — this browser blocks storage, so the wallet won\'t persist.');
    }else{
      const v=emVault();
      if(!v){ throw new Error('No wallet saved on this device. Create one instead.') }
      if(v.email && v.email!==email){ throw new Error('That email doesn\'t match the wallet saved here.') }
      const secret=await decryptSecret(v,pass);           // throws if wrong passphrase
      kp=W3.Keypair.fromSecretKey(secret);
    }
    localKeypair=kp;
    provider={
      isLocal:true, publicKey:kp.publicKey,
      signAndSendTransaction:async(tx)=>{
        tx.sign(kp);
        const sig=await conn.sendRawTransaction(tx.serialize());
        return {signature:sig};
      }
    };
    pubkey=kp.publicKey;
    conn=new W3.Connection(RPC,'confirmed');
    cl('sh-email'); onConnected(email);
    tt(emMode==='create'?'Wallet created 🐄':'Unlocked 🐄');
    /* don't leave the passphrase sitting in the DOM */
    $('emPass').value=''; $('emPass2').value=''; emSubmitErr=null;
  }catch(e){
    const m=String(e&&e.message||e);
    emSubmitErr = /operation-specific reason|decrypt|OperationError/i.test(m)
      ? 'Wrong passphrase.' : escapeHtml(m);
  }finally{ b.textContent=label; emVal() }
}
function onConnected(email){
  $('connectCard').style.display='none';
  $('walletCard').style.display='';
  const addr=pubkey.toBase58();
  $('dAddr').textContent=short(addr);
  $('greetAddr').textContent=short(addr);
  $('recvAddr').textContent=addr;
  $('dEmail').textContent=email||(provider&&provider.isLocal?'this device':'external wallet');
  drawQR($('qrRecv'),addr);
  refresh();
}
function exportKey(){
  if(!localKeypair){tt('Only for email wallets');return}
  const b58=[...localKeypair.secretKey];
  $('ctyBody').innerHTML=`<h3>Export your key</h3>
    <div class="lede">Anyone with this can spend your funds. Never paste it into a website or share it.</div>
    <div class="note stop"><b>Save it somewhere offline right now.</b> If you lose your passphrase this is the only way back in.</div>
    <div class="code">[${b58.join(',')}]</div>
    <button class="btn lime" style="margin-top:12px" onclick="navigator.clipboard.writeText('[${b58.join(',')}]').then(()=>tt('Copied — store it safely'))">Copy secret key</button>`;
  op('sh-cty');
}

/* ══════════ camera + QR ══════════ */
let camStream=null, camRAF=null;
async function toggleCam(){ camStream?stopCam():startCam() }
async function startCam(){
  const v=$('vid'),cv=$('cvs');
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    v.srcObject=camStream; await v.play();
    $('camIdle').style.display='none'; $('camBtn').textContent='Stop camera';
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    const tick=()=>{
      if(!camStream) return;
      if(v.readyState===v.HAVE_ENOUGH_DATA){
        cv.width=v.videoWidth; cv.height=v.videoHeight;
        ctx.drawImage(v,0,0,cv.width,cv.height);
        const img=ctx.getImageData(0,0,cv.width,cv.height);
        const code=window.jsQR?jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'}):null;
        if(code&&code.data){ stopCam(); handleQR(code.data); return }
      }
      camRAF=requestAnimationFrame(tick);
    };
    tick();
  }catch(e){
    $('camIdle').style.display='';
    $('camIdle').innerHTML='Camera unavailable.<br><span style="opacity:.75;font-size:12px">'+escapeHtml(e.message||'')+
      '<br>Camera needs HTTPS or localhost. Use “Paste code” instead.</span>';
    tt('Camera blocked — use Paste code');
  }
}
function stopCam(){
  if(camRAF) cancelAnimationFrame(camRAF), camRAF=null;
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}
  const v=$('vid'); if(v) v.srcObject=null;
  const i=$('camIdle'); if(i) i.style.display='';
  const b=$('camBtn'); if(b) b.textContent='Start camera';
}
function handleQR(raw){
  cl('sh-paste');
  const p=C.parseQR((raw||'').trim());
  if(!p){
    $('qrBody').innerHTML=`<h3>Not a payment code</h3>
      <div class="lede">Didn't match a UPI link or an EMVCo payload.</div>
      <div class="code">${escapeHtml((raw||'').slice(0,300))||'(empty)'}</div>
      <button class="btn" style="margin-top:14px" onclick="cl('sh-qr')">Close</button>`;
    op('sh-qr');return;
  }
  lastMerchant = p.scheme==='UPI' ? (p.name||p.vpa) : (p.merchant||'Merchant');
  const isUPI=p.scheme==='UPI';
  const cc=isUPI?'IN':(p.countryCode||null);
  const m=cc?mkBy(cc):null;
  const bad = isUPI ? !p.valid : !p.valid;
  const cur = p.currency || (m?m.cur:null);
  const fxr = m?rate(m):null;

  let rows=[];
  if(isUPI){
    rows=[['Scheme','UPI (India)'],['Payee VPA',p.vpa],['Name',p.name||'—'],
          ['Amount',p.amount!=null?'₹'+fmt(p.amount):'open — you choose'],
          ['MCC',p.mcc||'—'],['VPA format',p.valid?'✅ valid':'❌ malformed']];
  }else{
    rows=[['Scheme','EMVCo '+(p.static?'(static)':'(dynamic)')],['Merchant',p.merchant||'—'],
          ['City',p.city||'—'],['Country',(p.country||p.countryCode||'—')+(p.rail?' · '+p.rail:'')],
          ['Currency',cur||'—'],['Amount',p.amount!=null?fmt(p.amount):'open — you choose'],
          ['CRC',p.crcOk?'✅ valid ('+p.crcGiven+')':'❌ FAILED — do not pay']];
  }

  /* if an order was placed, the amount is already locked */
  let quote='';
  if(order){
    quote=`<div class="orderchip">🔒 Order locked — you pay ${fmt(order.usdc)} USDC (${order.sym}${fmt(order.fiat, order.rate>100?0:2)})</div>`;
    if(p.amount!=null && Math.abs(p.amount-order.fiat)>0.01){
      quote+=`<div class="note warn"><b>Amount mismatch.</b> This QR asks for ${p.currency||''}${fmt(p.amount)},
        but your order was for ${order.sym}${fmt(order.fiat)}. Go back and re-enter to match.</div>`;
    }
  }
  if(!order && p.amount!=null && fxr){
    const q=C.quotePayment(p.amount,fxr,0.004,cc,TDS_MODE);
    if(q){
      const cmp=C.complianceFor(cc);
      quote=`<div class="brk"><div class="brw"><span class="k">Rate</span><span class="v">1 USDC = ${m.sym}${fmt(fxr,fxr>100?0:2)}</span></div>
        <div class="brw"><span class="k">Goods value</span><span class="v">${fmt(q.base)} USDC</span></div>
        <div class="brw"><span class="k">Fee (0.4%)</span><span class="v">${fmt(q.fee,4)} USDC</span></div>
        ${cmp.tds?`<div class="brw"><span class="k">${cmp.tdsLabel}${q.absorbed?' — we absorb':''}</span><span class="v">${fmt(q.tds,4)} USDC</span></div>`:''}
        <div class="brw tot"><span>You pay</span><span class="v">${fmt(q.userPays)} USDC</span></div></div>`;
    }
  }

  /* settlement plan for this payment */
  let payBlock='';
  if(!bad && order){
    const plan=planFor(order.usdc);
    if(plan.mode==='blocked'){
      payBlock=`<div class="note stop">${escapeHtml(plan.reason)}</div>`;
    }else{
      const [cls,label]=MODE_LABEL[plan.mode];
      payBlock=`<div class="card ${plan.degraded?'cream':'pale'}" style="box-shadow:var(--sh-sm)">
        <span class="modebadge ${cls}">${label} · ~${plan.etaText}</span>
        <div style="font-size:12.5px;font-weight:700;line-height:1.5;opacity:.75">${
          plan.degraded ? 'Our float is low, so this one gets matched first.'
          : plan.mode==='finality' ? 'Above '+INSTANT_THRESHOLD+' USDC we wait for full settlement.'
          : 'Paid from our float now, settled with you behind the scenes.'}</div></div>
      <button class="btn lime" onclick="payNow()">Pay ${fmt(order.usdc)} USDC</button>`;
    }
  }
  $('qrBody').innerHTML=`<h3>${bad?'⚠️ ':''}${isUPI?(p.name||p.vpa):(p.merchant||'Merchant')}</h3>
    <div class="lede">Decoded from a real payment code.</div>
    ${bad?'<div class="note stop"><b>This code failed validation.</b> A failed CRC or malformed VPA means it is corrupt or tampered with. Do not pay it.</div>':''}
    <div class="brk">${rows.map(r=>`<div class="brw"><span class="k">${r[0]}</span><span class="v" style="word-break:break-all">${escapeHtml(String(r[1]))}</span></div>`).join('')}</div>
    ${quote}
    ${m&&m.s!=='live'?`<div class="note warn"><b>${m.n} — ${SB[m.s][1]}.</b> ${m.w}</div>`:''}
    ${payBlock}
    <div class="note info"><b>The payout leg isn't wired.</b> Decoding and settlement logic are real; actually
      moving rupees needs a licensed partner on the ${m?m.r:'local'} rail.</div>
    <button class="btn ghost" onclick="cl('sh-qr')">Close</button>`;
  op('sh-qr');
}

/* ══════════════════════════════════════════════════════════
   KEYPAD PAY — amount first, then scan
   ══════════════════════════════════════════════════════════ */
let padVal='', padUnit='fiat', order=null, payMode='scan', lastMerchant='';

$('pad').innerHTML=['1','2','3','4','5','6','7','8','9','.','0','back']
  .map(k=>k==='back'
    ? `<button class="back" onclick="padKey('back')" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M20 5H9l-6 7 6 7h11a1 1 0 001-1V6a1 1 0 00-1-1zM13 9.5l5 5M18 9.5l-5 5"/></svg></button>`
    : `<button onclick="padKey('${k}')">${k}</button>`).join('');

function padKey(k){
  const m=mkBy(SEL);
  padVal=C.keypadPush(padVal,k, padUnit==='fiat' ? (m.fx>100?0:2) : 6);
  renderPad();
}
function padMax(){
  const m=mkBy(SEL);
  if(!usdc){tt('No USDC balance yet');return}
  padVal = padUnit==='fiat'
    ? String(Math.floor(usdc*rate(m)))
    : String(Math.floor(usdc*1e6)/1e6);
  renderPad();
}
function flipUnit(){
  const m=mkBy(SEL), r=rate(m), n=parseFloat(padVal||'0');
  if(n>0) padVal = padUnit==='fiat' ? String(Math.round(n/r*1e6)/1e6) : String(Math.round(n*r));
  padUnit = padUnit==='fiat'?'usdc':'fiat';
  renderPad();
}
function renderPad(){
  const m=mkBy(SEL), r=rate(m), n=parseFloat(padVal||'0')||0;
  const isFiat=padUnit==='fiat';
  $('payAmtBig').querySelector('.cur').textContent = isFiat ? m.sym.trim() : '$';
  $('payAmtTxt').textContent = padVal===''?'0':padVal;
  $('payAmtBig').classList.toggle('zero', n<=0);
  $('payAlt').textContent = isFiat
    ? '≈ '+(r?(n/r).toFixed(2):'0')+' USDC'
    : '≈ '+m.sym+Math.round(n*r).toLocaleString();

  const usdcAmt = isFiat ? (r? n/r : 0) : n;
  const overBal = pubkey && usdcAmt>usdc;
  $('placeBtn').disabled = !(n>0) || overBal;
  $('placeBtn').textContent = overBal ? 'Not enough USDC' : 'Place Order →';

  /* country-scoped quote — TDS only appears where it applies */
  if(n>0){
    const comp=C.complianceFor(SEL);
    const q=C.quotePayment(isFiat?n:n*r, r, 0.004, SEL, TDS_MODE);
    if(q){
      $('payQuote').innerHTML=`<div class="brk" style="margin-top:14px">
        <div class="brw"><span class="k">Rate</span><span class="v">1 USDC = ${m.sym}${fmt(r,r>100?0:2)}</span></div>
        <div class="brw"><span class="k">Fee (0.4%)</span><span class="v">${fmt(q.fee,4)} USDC</span></div>
        ${comp.tds?`<div class="brw"><span class="k">${comp.tdsLabel}${q.absorbed?' — we absorb':''}</span><span class="v">${fmt(q.tds,4)} USDC</span></div>`:''}
        <div class="brw tot"><span>You pay</span><span class="v">${fmt(q.userPays)} USDC</span></div></div>`;
    }
  } else $('payQuote').innerHTML='';
}
function placeOrder(){
  const m=mkBy(SEL), r=rate(m), n=parseFloat(padVal||'0')||0;
  if(!(n>0)) return;
  const fiat = padUnit==='fiat' ? n : n*r;
  const q=C.quotePayment(fiat,r,0.004,SEL,TDS_MODE);
  order={fiat,usdc:q.userPays,rate:r,cur:m.cur,sym:m.sym,at:Date.now(),cc:SEL};
  $('payKeypad').style.display='none';
  $('payScan').style.display='';
  $('scanFor').innerHTML=`<b>Order placed — ${m.sym}${fmt(fiat, r>100?0:2)}</b> · rate locked at 1 USDC = ${m.sym}${fmt(r,r>100?0:2)}<br>
    You'll pay ${fmt(order.usdc)} USDC. Now scan the vendor's QR.`;
  tt('Rate locked — now scan');
}
function cancelOrder(){
  stopCam(); order=null;
  $('payScan').style.display='none';
  $('payKeypad').style.display='';
}

/* ── pay mode (India gets card bill) ── */
function setPayMode(mode){
  payMode=mode;
  const scan=mode==='scan';
  $('pm1').classList.toggle('on',scan); $('pm2').classList.toggle('on',!scan);
  $('payKeypad').style.display = scan?'':'none';
  $('payScan').style.display='none';
  $('payCard').style.display = scan?'none':'';
  $('payTitle').textContent = scan?'Scan & Pay':'Card bill';
  if(!scan) ccQuote(); else cancelOrder();
}
function syncPayModes(){
  const modes=C.modesFor(SEL);
  const showTabs=modes.length>1;
  $('payModes').style.display = showTabs?'':'none';
  if(!showTabs && payMode!=='scan') setPayMode('scan');
  const m=mkBy(SEL);
  $('hintTxt').textContent = `Ask the vendor for the bill amount only. Don't ask for a QR yet.`;
  $('camCap').textContent = `Now scan the ${m.r==='—'?'':m.r.split(' · ')[0]+' '}QR`;
  padVal=''; renderPad();
}

/* ── card bill (India only) ── */
function ccQuote(){
  const m=mkBy(SEL), r=rate(m);
  const v=C.validateCardBill($('ccLast4').value,$('ccIssuer').value,$('ccAmt').value,pubkey?usdc:null,r);
  const comp=C.complianceFor(SEL);
  if(!v.usdcNeeded){ $('ccOut').innerHTML = v.errors.length
      ? `<div class="note warn">${v.errors.map(escapeHtml).join('<br>')}</div>` : '';
    $('ccBtn').disabled=true; return }
  const q=C.quotePayment(parseFloat($('ccAmt').value)||0, r, 0.004, SEL, TDS_MODE);
  $('ccOut').innerHTML=`<div class="brk">
    <div class="brw"><span class="k">Bill</span><span class="v">${m.sym}${fmt(parseFloat($('ccAmt').value)||0)}</span></div>
    <div class="brw"><span class="k">Rate</span><span class="v">1 USDC = ${m.sym}${fmt(r,2)}</span></div>
    <div class="brw"><span class="k">Fee (0.4%)</span><span class="v">${fmt(q.fee,4)} USDC</span></div>
    ${comp.tds?`<div class="brw"><span class="k">${comp.tdsLabel}${q.absorbed?' — we absorb':''}</span><span class="v">${fmt(q.tds,4)} USDC</span></div>`:''}
    <div class="brw tot"><span>You pay</span><span class="v">${fmt(q.userPays)} USDC</span></div></div>
    ${v.errors.length?`<div class="note warn">${v.errors.map(escapeHtml).join('<br>')}</div>`:''}
    <div class="note info">Routed over <b>BBPS</b>, the NPCI bill-payment network. Your issuer receives rupees and never sees crypto.</div>
    <div class="note stop"><b>Expect scrutiny on this one.</b> Paying down credit with crypto proceeds is a recognised
      money-laundering pattern, so a licensed biller will apply tighter limits and source-of-funds checks than a normal merchant payment.</div>`;
  $('ccBtn').disabled=!v.ok;
}
function payCardBill(){
  const v=C.validateCardBill($('ccLast4').value,$('ccIssuer').value,$('ccAmt').value,pubkey?usdc:null,rate(mkBy(SEL)));
  if(!v.ok){tt(v.errors[0]);return}
  $('qrBody').innerHTML=`<h3>Not wired up</h3>
    <div class="lede">The maths and validation are real. The payout isn't.</div>
    <div class="brk">
      <div class="brw"><span class="k">Issuer</span><span class="v">${escapeHtml($('ccIssuer').value)}</span></div>
      <div class="brw"><span class="k">Card</span><span class="v">•••• ${escapeHtml($('ccLast4').value)}</span></div>
      <div class="brw"><span class="k">USDC needed</span><span class="v">${fmt(v.usdcNeeded)}</span></div></div>
    <div class="note warn">Paying a real card bill needs a <b>BBPS biller agent</b> licence or an agreement with one,
      plus the same FIU-registered sell leg as any other rupee payout.</div>
    <button class="btn" onclick="cl('sh-qr')">Close</button>`;
  op('sh-qr');
}

/* ══════════════════════════════════════════════════════════
   SETTLEMENT — instant / finality / matched
   ══════════════════════════════════════════════════════════ */
const INSTANT_THRESHOLD = 200;        // USDC
let FLOAT_AVAIL = 5000;               // demo: local-currency float on hand
let dailyUsed = 0;

function planFor(amountUsdc){
  return C.settlementPlan({
    amount: amountUsdc,
    floatAvail: FLOAT_AVAIL,
    instantThreshold: INSTANT_THRESHOLD,
    dailyUsed: dailyUsed,
    dailyCap: UNVERIFIED_CAP,
    externalWallet: !!(provider && !provider.isLocal)
  });
}
const MODE_LABEL = {
  instant:  ['instant','Instant'],
  finality: ['finality','Full settlement'],
  matched:  ['matched','Matched — slower']
};
function settleHead(plan, merchant, amountUsdc, localTxt){
  const [cls,label]=MODE_LABEL[plan.mode]||['instant','Paying'];
  return `<span class="modebadge ${cls}">${label} · ~${plan.etaText}</span>
    <h3>${escapeHtml(merchant||'Merchant')}</h3>
    <div class="lede" style="margin-bottom:12px">${localTxt} · ${fmt(amountUsdc)} USDC</div>
    ${plan.note?`<div class="note ${plan.degraded?'warn':'info'}">${plan.note}</div>`:''}`;
}
function drawSteps(plan, idx){
  $('settleSteps').innerHTML = plan.steps.map((s,i)=>{
    const state = i<idx?'done' : i===idx?'active' : '';
    const mark  = i<idx ? '✓' : (i===idx ? '<span class="spin"></span>' : i+1);
    const last  = i===plan.steps.length-1;
    return `<div class="stp ${state}">
      <div class="dot">${mark}${last?'':'<span class="rail"></span>'}</div>
      <div class="mid"><div class="lb">${s.label}</div>${s.note?`<div class="nt">${s.note}</div>`:''}</div>
      <div class="ms">${s.ms<1000?s.ms+'ms':(s.ms/1000).toFixed(1)+'s'}</div></div>`;
  }).join('');
}

/* Demo speed: real timings are in the plan, but nobody wants to watch a
   two-minute matching step tick by in a prototype. Compress long waits
   while keeping the ordering and the honest labels intact. */
const demoMs = ms => Math.min(ms, 1800);

async function runSettlement(plan, merchant, amountUsdc, localTxt, sym){
  $('settleHead').innerHTML = settleHead(plan, merchant, amountUsdc, localTxt);
  $('settleFoot').innerHTML = '';
  drawSteps(plan, 0);
  op('sh-settle');

  for(let i=0;i<plan.steps.length;i++){
    drawSteps(plan, i);
    await new Promise(r=>setTimeout(r, demoMs(plan.steps[i].ms)));
  }
  drawSteps(plan, plan.steps.length);

  /* float is consumed by the payout, released when we rebalance */
  FLOAT_AVAIL = Math.max(0, FLOAT_AVAIL - amountUsdc);
  dailyUsed += amountUsdc;
  renderFloat();

  $('settleFoot').innerHTML = `
    <div class="ok" style="padding:4px 0 0">
      <div class="rg" style="width:70px;height:70px;margin-bottom:12px">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" stroke-width="3.2"
          stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
      <h2 style="font-size:23px">Paid</h2>
      <div class="p">${escapeHtml(merchant||'Merchant')} received ${localTxt}</div>
    </div>
    <div class="brk" style="text-align:left">
      <div class="brw"><span class="k">You paid</span><span class="v">${fmt(amountUsdc)} USDC</span></div>
      <div class="brw"><span class="k">Settlement</span><span class="v">${MODE_LABEL[plan.mode][1]}</span></div>
      <div class="brw"><span class="k">Took</span><span class="v">~${plan.etaText}</span></div>
      ${plan.exposure?`<div class="brw"><span class="k">We fronted</span><span class="v">${fmt(plan.exposure)} USDC</span></div>`:''}
    </div>
    <button class="btn lime" onclick="cl('sh-settle');cancelOrder();go('s-home')">Done</button>`;
  order=null;
}

function payNow(){
  if(!order){tt('No order');return}
  const plan=planFor(order.usdc);
  if(plan.mode==='blocked'){tt(plan.reason);return}
  cl('sh-qr');
  runSettlement(plan, lastMerchant, order.usdc,
    order.sym+fmt(order.fiat, order.rate>100?0:2), order.sym);
}
function renderFloat(){
  const pct = Math.max(0, Math.min(100, FLOAT_AVAIL/5000*100));
  const low = pct < 25;
  const el=$('floatFill'); if(el){ el.style.width=pct+'%'; el.className = low?'low':'' }
  const t=$('floatTxt'); if(t){
    t.textContent = low ? 'Running low — larger payments may be matched instead'
                        : 'Instant payments available';
    t.style.color = low ? 'var(--stop)' : '';
  }
  const v=$('floatVal'); if(v) v.textContent = '$'+fmt(FLOAT_AVAIL,0);
}
function drawFloatSheet(){
  const m=mkBy(SEL);
  const rows=[
    ['instant','Under '+INSTANT_THRESHOLD+' USDC','~3.2 seconds',
     'We pay the merchant from our own float immediately, then settle with you behind the scenes. Covers about 98% of everyday payments.'],
    ['finality','Over '+INSTANT_THRESHOLD+' USDC','~16 seconds',
     'We wait for the transfer to fully settle on Solana before paying out. Larger amounts aren\'t worth fronting.'],
    ['matched','When our float is low','a couple of minutes',
     'We match you with someone going the other way first. Slower, and we say so rather than pretending otherwise.']
  ];
  $('floatBody').innerHTML = rows.map(r=>
    `<div class="card ${r[0]==='instant'?'pale':'cream'}" style="box-shadow:var(--sh-sm)">
      <span class="modebadge ${r[0]}" style="margin-bottom:8px">${r[1]} · ${r[2]}</span>
      <div style="font-size:13px;font-weight:700;line-height:1.55">${r[3]}</div></div>`).join('')
    + `<div class="note info"><b>Why we front it at all.</b> Waiting for full settlement on every payment
       would make you stand at the counter for 16 seconds. Below the threshold the amount we're briefly
       exposed to is small enough to be worth the speed — at typical ticket sizes it's a few dollars
       across the whole business at any moment.</div>`;
}

/* sample codes */
const T=(t,v)=>t+String(new TextEncoder().encode(v).length).padStart(2,'0')+v;
const seal=b=>{const s=b+'6304';return s+C.crc16(s)};
const SAMPLES=[
  {n:'Sharma Tea Stall',d:'UPI · India · ₹340',
   q:'upi://pay?pa=sharmatea@paytm&pn=Sharma%20Tea%20Stall&am=340.00&cu=INR&tn=Chai&mc=5812'},
  {n:'Noodle House',d:'KHQR · Cambodia · ៛17,500',
   q:seal(T('00','01')+T('01','12')+T('29',T('00','khqr@devb')+T('01','ACC0012345'))+T('52','5812')+T('53','116')+T('54','17500')+T('58','KH')+T('59','Noodle House')+T('60','Phnom Penh'))},
  {n:'Warung Ibu Sri',d:'QRIS · Indonesia · Rp82,000',
   q:seal(T('00','01')+T('01','12')+T('26',T('00','ID.CO.QRIS.WWW')+T('01','9360091100012345'))+T('52','5411')+T('53','360')+T('54','82000')+T('58','ID')+T('59','Warung Ibu Sri')+T('60','Denpasar'))},
  {n:'Cafe Amazon',d:'PromptPay · Thailand · ฿85',
   q:seal(T('00','01')+T('01','12')+T('29',T('00','A000000677010111')+T('01','0066000000000'))+T('52','5812')+T('53','764')+T('54','85.00')+T('58','TH')+T('59','Cafe Amazon')+T('60','Bangkok'))},
  {n:'Tampered code',d:'CRC deliberately broken — should be rejected',
   q:seal(T('00','01')+T('01','12')+T('29',T('00','khqr@devb')+T('01','ACC0012345'))+T('53','116')+T('54','9999')+T('58','KH')+T('59','Bad Actor')).slice(0,-4)+'0000'}
];
$('samples').innerHTML=SAMPLES.map((s,i)=>`<div class="li" style="cursor:pointer" onclick="handleQR(SAMPLES[${i}].q)">
  <div class="av" style="background:var(--grass-pale)">▦</div>
  <div class="mid"><div class="t">${s.n}</div><div class="s">${s.d}</div></div>
  <div class="r"><div class="u">›</div></div></div>`).join('');

/* ══════════ India TDS model ══════════ */
function setTdsMode(m){TDS_MODE=m;$('tm1').classList.toggle('on',m==='absorb');$('tm2').classList.toggle('on',m==='pass');drawTDS()}
function drawTDS(){
  const amt=parseFloat($('tdsAmt').value)||0;
  const feeR=(parseFloat($('tdsFee').value)||0)/100;
  const m=mkBy('IN'), fxr=rate(m);
  const q=C.quotePayment(amt,fxr,feeR,'IN',TDS_MODE);
  if(!q){$('tdsOut').innerHTML='';$('tdsVerdict').innerHTML='';return}
  $('tdsOut').innerHTML=`<div class="brk">
    <div class="brw"><span class="k">Rate</span><span class="v">1 USDC = ₹${fmt(fxr,2)}</span></div>
    <div class="brw"><span class="k">Goods value</span><span class="v">${fmt(q.base,4)} USDC</span></div>
    <div class="brw"><span class="k">Your fee (${(feeR*100).toFixed(2)}%)</span><span class="v">+${fmt(q.fee,4)}</span></div>
    <div class="brw"><span class="k">TDS 1% (s.194S)</span><span class="v">−${fmt(q.tds,4)}</span></div>
    <div class="brw tot"><span>User pays</span><span class="v">${fmt(q.userPays,4)} USDC</span></div>
    <div class="brw ${q.netRevenue<0?'neg':'pos'}"><span class="k">Your net per txn</span>
      <span class="v">${q.netRevenue<0?'−':'+'}${fmt(Math.abs(q.netRevenue),4)} USDC (${q.marginPct.toFixed(3)}%)</span></div></div>`;

  const losing=q.netRevenue<0;
  const need=(q.breakEvenFeeRate*100).toFixed(2);
  const per10k=q.netRevenue*10000/ (q.base||1);
  $('tdsVerdict').innerHTML = TDS_MODE==='absorb'
    ? `<div class="note ${losing?'stop':'info'}"><b>${losing?'You lose money on every India transaction.':'This fee rate covers the TDS.'}</b><br>
       Absorbing a 1% withholding on a ${(feeR*100).toFixed(2)}% fee means you net
       <b>${q.marginPct.toFixed(3)}%</b> per payment. ${losing
         ? `On ₹10,00,000 of monthly volume that is roughly <b>${fmt(Math.abs(per10k*1),2)} USDC</b> of loss per ₹10,000 processed —
            the more you grow, the more you lose. Break-even needs a fee of at least <b>${need}%</b>, which is ~${(q.breakEvenFeeRate/0.004).toFixed(0)}× your current rate
            and far above what users will pay for a payment app.`
         : 'Watch it though — the whole of your margin above 1% is what you keep.'}</div>
       <div class="note warn"><b>Absorbing is a commercial choice, not a legal one.</b> TDS is a withholding obligation under s.194S:
       you must still deduct it and deposit it with the Income Tax Department, file quarterly returns and issue certificates.
       Paying it yourself does not remove the duty — you need a TAN and the filing machinery either way.</div>`
    : `<div class="note info"><b>User pays the TDS.</b> You keep your full ${(feeR*100).toFixed(2)}% fee, and the user sees a 1% line on every payment.
       Honest, and the only version with viable unit economics — but it makes you visibly more expensive than a plain UPI payment, which is free.</div>`;
}

/* ══════════ settlement architecture ══════════ */
let ARCH='pooled';
function setArch(a){ARCH=a;$('ar1').classList.toggle('on',a==='pooled');$('ar2').classList.toggle('on',a==='direct');drawFlow()}
function drawFlow(){
  const f=C.settlementFlow('IN',ARCH);
  if(!f){$('flowOut').innerHTML='';return}
  $('flowOut').innerHTML=f.hops.map((h,i)=>{
    const tone=h.blocker?'stop':h.needs?'warn':'pale';
    const bg=h.blocker?'var(--stop-bg)':h.needs?'var(--warn-bg)':'var(--grass-lt)';
    return `<div class="card ${tone==='pale'?'pale':''}" style="box-shadow:var(--sh-sm);${h.blocker?'border-left:7px solid var(--live)':''}">
      <div style="display:flex;gap:11px;align-items:flex-start">
        <div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2.5px solid var(--hide);
          display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:13px;flex:none">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--disp);font-size:15.5px;font-weight:800">${h.step}</div>
          <div style="font-size:12px;opacity:.6;font-weight:700;margin-top:1px">${h.actor}</div>
          ${h.needs?`<div class="chip ${h.blocker?'stop':'warn'}" style="margin-top:8px;white-space:normal;text-align:left;line-height:1.4">${h.needs}</div>`:''}
          <div style="font-size:12.5px;font-weight:700;line-height:1.55;margin-top:8px;opacity:.85">${h.note}</div>
          ${h.tds?'<div class="chip warn" style="margin-top:7px">← 1% TDS lands here</div>':''}
          ${h.ux?`<div class="chip pink" style="margin-top:7px;white-space:normal;text-align:left;line-height:1.4">UX cost: ${h.ux}</div>`:''}
        </div></div></div>`;
  }).join('');

  $('archVerdict').innerHTML = ARCH==='pooled'
    ? `<div class="note stop"><b>This is the version you described — and it needs an RBI Payment Aggregator licence.</b><br>
       The moment INR pools in your account before reaching the shopkeeper, you are doing by definition what a PA does:
       collecting from customers and settling to merchants. That means RBI authorisation plus an escrow account with a
       scheduled commercial bank.<br><br>
       The catch is who grants it. RBI is the authority — and RBI's stated position is that crypto should not be used for
       payments and that banks should stay away from crypto businesses. You would be asking the regulator for permission
       to do the precise thing it has said shouldn't happen.</div>`
    : `<div class="note warn"><b>Legally much safer, but it isn't one tap.</b><br>
       Nothing pools at your entity, so you are not a Payment Aggregator. The user sells USDC on a registered venue,
       INR arrives in their own bank, and they pay the shopkeeper with ordinary UPI.<br><br>
       You become the app that makes those two steps fast and pleasant rather than the entity moving the money —
       a thinner business, but one you can actually operate today.</div>`;
}

/* ══════════ India requirements ══════════ */
const REQ=[
  {t:'Crypto is not a payment instrument',s:'Stablecoins are unregulated as a means of payment. FIU registration covers AML — it does not make USDC valid for buying goods. The RBI Governor has said crypto should not be used for payments.',k:'blocker'},
  {t:'RBI Payment Aggregator licence',s:'Required the moment you pool INR and settle to merchants. Granted by the same regulator that opposes crypto payments.',k:'blocker'},
  {t:'FIU-IND registration',s:'Mandatory for the sell leg. You become a PMLA Reporting Entity — 49 platforms hold it, including 4 offshore.',k:'blocker'},
  {t:'Sponsor bank for UPI',s:'NPCI access runs through a sponsor bank. RBI has told banks to avoid crypto businesses, so this is the hardest door.',k:'blocker'},
  {t:'PAN + Aadhaar KYC',s:'Full KYC before any INR movement. Cannot be deferred.',k:'blocker'},
  {t:'TAN + TDS machinery',s:'1% withheld on every VDA transfer under s.194S, deposited and filed quarterly.',k:'blocker'},
  {t:'Two-factor auth',s:'RBI Authentication Directions require dynamic 2FA from April 2026.',k:'req'},
  {t:'Push-only deposits',s:'NPCI removed recipient-initiated collect requests in Oct 2025. Everything must be user-initiated.',k:'req'},
  {t:'Regulators disagree',s:'The Economic Survey and SEBI have leaned toward a stablecoin framework; RBI leans toward prohibition. Until that resolves, the rules can move under you.',k:'note'},
  {t:'App-level blocking',s:'PhonePe, GPay and Paytm may block payments to crypto platforms on their own fraud models, even where legal.',k:'note'}
];
$('indiaReq').innerHTML=REQ.map(r=>`<div class="li">
  <div class="av" style="background:${r.k==='blocker'?'var(--stop-bg)':r.k==='req'?'var(--warn-bg)':'var(--grass-lt)'}">${r.k==='blocker'?'!':r.k==='req'?'•':'i'}</div>
  <div class="mid"><div class="t">${r.t}</div><div class="s" style="white-space:normal">${r.s}</div></div></div>`).join('');

/* ══════════ partners ══════════ */
const PARTNERS=[
  {t:'The sell leg',s:'Someone licensed must convert the user\'s USDC into local fiat. In India that means an FIU-registered VASP, and the 1% TDS is withheld at this point.',who:'CoinDCX · ZebPay · CoinSwitch · Mudrex (all FIU-registered)'},
  {t:'The payout leg',s:'Someone must push fiat to the shopkeeper\'s existing QR. On UPI that needs a sponsor bank under NPCI — and an RBI Payment Aggregator licence if the money pools with you first.',who:'A sponsor bank + PSP, per market'},
  {t:'KYC / AML',s:'PAN and Aadhaar verification, sanctions and PEP screening, ongoing monitoring. Required before you onboard anyone.',who:'Signzy · HyperVerge (India) · Sumsub · Persona'}
];
$('partnerList').innerHTML=PARTNERS.map(p=>`<div class="card cream" style="box-shadow:var(--sh-sm)">
  <div class="lbl">${p.t}</div>
  <div style="font-size:13px;font-weight:700;line-height:1.55;margin-bottom:9px">${p.s}</div>
  <div class="chip">${p.who}</div></div>`).join('');

/* ══════════ coverage + currency ══════════ */
function ctyRow(m){
  return `<div class="cty ${m.s==='blocked'?'off':''}" onclick="ctyInfo('${m.cc}')">
    ${flag(m.cc,34)}<div class="mid"><div class="n">${m.n}</div><div class="rail">${m.r} · ${m.cur}</div></div>
    <span class="ch" style="opacity:.35;font-size:16px">›</span></div>`}
$('ctyAsia').innerHTML=MK.filter(m=>m.reg==='asia').map(ctyRow).join('');
$('ctyAfr').innerHTML=MK.filter(m=>m.reg==='africa').map(ctyRow).join('');
$('ctyLat').innerHTML=MK.filter(m=>m.reg==='latam').map(ctyRow).join('');
$('wLive').textContent=MK.filter(m=>m.s==='live').length;
$('wRails').textContent=new Set(MK.filter(m=>m.r!=='—').flatMap(m=>m.r.split(' · '))).size;
function ctyInfo(cc){const m=mkBy(cc),[cls,txt]=SB[m.s];
  $('ctyBody').innerHTML=`<div style="display:flex;align-items:center;gap:11px;margin-bottom:4px">${flag(m.cc,40)}<h3 style="margin:0">${m.n}</h3></div>
    <div style="margin:9px 0 15px;display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${cls}">${txt}</span><span class="chip">${m.r}</span><span class="chip">${m.cur}</span></div>
    <div class="note ${m.s==='blocked'?'stop':m.s==='live'?'info':'warn'}">${m.w}</div>
    ${m.cc==='IN'?'<button class="btn butter" style="margin-bottom:8px" onclick="cl(\'sh-cty\');go(\'s-india\')">India detail →</button>':''}
    ${m.s==='blocked'?'':`<button class="btn lime" onclick="setMk('${m.cc}');cl('sh-cty')">Use ${m.cur}</button>`}`;
  op('sh-cty')}

function curRow(m){
  const dis=m.s==='blocked', sel=m.cc===SEL;
  return `<div class="crow ${sel?'sel':''} ${dis?'dis':''}" ${dis?'onclick="tt(\'Not available\')"':`onclick="setMk('${m.cc}')"`}>
    ${flag(m.cc,38)}<div class="mid"><div class="cc">${m.label||m.cur}</div>
    <div class="nn">${m.cc} · ${m.n} · ${m.r}</div></div>
    <div class="rd">${sel?'<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>':''}</div></div>`}
function drawCur(){
  const q=($('curQ').value||'').toLowerCase().trim();
  const hit=m=>!q||[m.cur,m.n,m.cc,m.r,m.label||''].join(' ').toLowerCase().includes(q);
  const grp=(t,rg)=>{const rows=MK.filter(m=>m.reg===rg&&hit(m));
    return rows.length?`<div class="cgrp">${t}</div>`+rows.map(curRow).join(''):''};
  $('curList').innerHTML=grp('Asia','asia')+grp('Africa','africa')+grp('Latin America','latam')
    ||'<div class="fine" style="padding:22px 0">No match.</div>';
}
function setMk(cc){const m=mkBy(cc);if(!m||m.s==='blocked')return;
  SEL=cc; applyCompliance(); cl('sh-cur'); tt(m.n+' · '+m.cur+' selected')}

/* ══════════ country-scoped compliance ══════════
   Everything regulatory keys off the selected market. Someone paying
   in Cambodia should never see a word about India's TDS.            */
/* Single owner of "make the whole UI match SEL". Every path that changes
   the market — the picker, onboarding, and the boot restore — goes through
   here, so none of them can update half the screen and leave the rest stale. */
function applyCompliance(){
  const m=mkBy(SEL), comp=C.complianceFor(SEL);

  /* labels that follow the selected market */
  $('setCur').textContent = m.label||m.cur;
  $('ctyChip').innerHTML = flag(m.cc,16)+'<span>'+m.n+' · '+(m.r==='—'?m.cur:m.r.split(' · ')[0])+'</span>';
  $('capTxt').textContent = UNVERIFIED_CAP+' USDC';
  $('limitNum').textContent = UNVERIFIED_CAP;
  const ind=mkBy('IN');
  $('indiaIcon').innerHTML = flag('IN',30);
  $('indiaTitle').innerHTML = flag('IN',26)+' <span style="vertical-align:middle">'+ind.n+'</span>';
  renderBal(); renderFX(); drawCur();

  syncPayModes();

  /* settings row: India-only compliance entry */
  const ir=$('rowIndia'); if(ir) ir.style.display = SEL==='IN' ? '' : 'none';
  const nav=document.querySelector('[data-s="s-india"]'); if(nav) nav.style.display = SEL==='IN'?'':'none';

  /* home badges */
  $('cmpBadges').innerHTML = comp.badges.map(b=>
    `<span class="chip ${/TDS|Blocked|Tourists/.test(b)?'warn':'ok'}">${b}</span>`).join('');

  /* market card on home */
  $('cmpCard').innerHTML = comp.headline
    ? `<div class="lbl" style="display:flex;align-items:center;gap:8px">${flag(m.cc,22)}<span>${m.n} · ${m.r}</span></div>
       <div style="font-size:13px;font-weight:700;line-height:1.55">${comp.headline}</div>
       ${comp.rules.length?`<div style="margin-top:10px;display:flex;flex-direction:column;gap:5px">${
         comp.rules.map(r=>`<div style="font-size:12px;font-weight:700;opacity:.75;display:flex;gap:7px">
           <span style="opacity:.5">·</span><span>${r}</span></div>`).join('')}</div>`:''}`
    : '';
  $('cmpCard').style.display = comp.headline ? '' : 'none';

  /* help sheet gets the same, scoped */
  $('helpCompliance').innerHTML = comp.headline
    ? `<div class="note ${comp.blocked?'stop':comp.tds?'warn':'info'}"><b>${m.n}.</b> ${comp.headline}</div>` : '';

  /* card-bill issuer list */
  const iss=(C.ISSUERS[SEL]||[]);
  $('ccIssuer').innerHTML='<option value="">Select issuer…</option>'+iss.map(i=>`<option>${i}</option>`).join('');
}

/* ══════════ settings ══════════ */
function saveRpc(){
  const v=$('rpcIn').value.trim()||DEFAULT_RPC;
  $('rpcOut').innerHTML='<div class="note info"><span class="sp"></span> Testing…</div>';
  const c=new W3.Connection(v,'confirmed');
  c.getLatestBlockhash('confirmed').then(()=>{
    RPC=v;store.set('moo.rpc',v);
    if(pubkey) conn=new W3.Connection(RPC,'confirmed');
    $('setRpc').textContent=v===DEFAULT_RPC?'public':new URL(v).hostname;
    $('rpcOut').innerHTML='<div class="note info">✅ RPC responded. Saved.</div>';
    refresh();
  }).catch(e=>{ $('rpcOut').innerHTML='<div class="note stop">❌ '+escapeHtml(e.message||'No response')+'</div>' });
}
function saveCap(){
  const v=parseFloat($('capIn').value);
  if(!isFinite(v)||v<=0){tt('Enter a positive number');return}
  CAP=v;store.set('moo.cap',String(v));
  $('setCap').textContent=v+' USDC';cl('sh-cap');quoteSend();
  tt(v>100?'Cap raised to '+v+' — be careful':'Cap set to '+v+' USDC');
}

/* ══════════ QR draw (receive) ══════════ */
function drawQR(el,text){
  if(!el) return;
  /* visual placeholder derived from the address — not a scannable code */
  const n=25,c=document.createElement('canvas');c.width=c.height=n*8;
  const x=c.getContext&&c.getContext('2d'); if(!x){el.textContent='▦';return}
  x.fillStyle='#FFFDF6';x.fillRect(0,0,n*8,n*8);x.fillStyle='#1C1A17';
  let s=0;for(let i=0;i<text.length;i++)s=(s*31+text.charCodeAt(i))>>>0;
  const r=()=>((s=(s*1103515245+12345)&2147483647)/2147483647);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){if((i<7&&j<7)||(i<7&&j>n-8)||(i>n-8&&j<7))continue;if(r()>.52)x.fillRect(i*8,j*8,8,8)}
  const eye=(a,b)=>{x.fillRect(a,b,56,56);x.fillStyle='#FFFDF6';x.fillRect(a+8,b+8,40,40);x.fillStyle='#1C1A17';x.fillRect(a+16,b+16,24,24)};
  eye(0,0);eye((n-7)*8,0);eye(0,(n-7)*8);
  c.style.cssText='width:100%;height:100%;image-rendering:pixelated;border:2.5px solid #1C1A17;border-radius:14px';
  el.innerHTML='';el.appendChild(c);
  const cap=document.createElement('div');
  cap.className='fine';cap.style.marginTop='6px';cap.textContent='Illustrative — copy the address below to receive.';
  el.parentNode.insertBefore(cap,el.nextSibling);
}

/* ══════════ boot ══════════ */
$('setRpc').textContent = RPC===DEFAULT_RPC?'public':(()=>{try{return new URL(RPC).hostname}catch(e){return 'custom'}})();
$('setCap').textContent = CAP+' USDC';
$('capIn').value=CAP; $('rpcIn').value=RPC===DEFAULT_RPC?'':RPC;

/* surface the file:// problem immediately, before they even click */
(function(){
  const d=diagnose();
  if(d.any) return;
  const box=$('noWallet'); box.style.display='';
  box.innerHTML = d.isFile
    ? `<div class="note stop" style="margin-bottom:0;text-align:left"><b>Opened as a file — wallets can't connect.</b>
       Extensions don't inject into <code>file://</code> pages, so Phantom can't see this even if it's installed.
       Double-click <b>start-moocash.bat</b> (Windows) or <b>start-moocash.command</b> (Mac) in this folder,
       then use the <code>localhost</code> address it opens.
       <button class="btn sm" style="margin-top:10px" onclick="renderDiag();op('sh-diag')">Run diagnostics</button></div>`
    : `<div class="note warn" style="margin-bottom:0;text-align:left">No Solana wallet detected. Install
       <b>Phantom</b>, <b>Solflare</b> or <b>Backpack</b> and reload.
       <button class="btn sm" style="margin-top:10px" onclick="renderDiag();op('sh-diag')">Run diagnostics</button></div>`;
})();
/* if an email wallet already exists on this device, default to unlock */
(function(){
  const v=emVault();
  if(!v) return;
  emMode='create'; emToggleMode();          // flips to 'unlock' and relabels
  if(v.email) $('emEmail').value=v.email;
})();

/* returning users skip onboarding */
(function(){
  const done=store.get('moo.onboarded','')==='1';
  const saved=store.get('moo.region','');
  if(saved && mkBy(saved)) SEL=saved;
  if(done){ $('onboard').classList.remove('on') }
  else { document.body.style.overflow='hidden'; drawRegions() }
})();

drawCur(); drawTDS(); drawFlow(); applyCompliance(); renderPad(); renderFloat(); drawFloatSheet(); renderFX(); loadFX();
setInterval(loadFX, 120000);
