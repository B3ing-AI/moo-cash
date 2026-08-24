/**
 * EVM multichain support — connect any injected wallet and read balances on
 * Ethereum, Polygon and BNB Chain. Pure client-side: no backend, no libraries.
 *
 * "Connect a wallet directly" for the EVM world means EIP-1193: MetaMask,
 * Robinhood Wallet, Coinbase Wallet, Rabby, Trust — they all inject a provider
 * at `window.ethereum` (or into `window.ethereum.providers` when several are
 * installed). We connect via `eth_requestAccounts` and then read balances for
 * the SAME address across all chains using public RPCs, so the user sees their
 * ETH, Polygon and BNB holdings at once — not just whatever chain the wallet
 * happens to be on.
 */

/**
 * Chains we read. RPCs are BROWSER-USABLE (CORS-enabled, keyless) and each has
 * fallbacks — verified from the deployed origin. The obvious public endpoints
 * do NOT work from a browser: eth.llamarpc.com blocks CORS, polygon-rpc.com is
 * dead ("API key disabled"), so those are deliberately not here. Stablecoin
 * decimals differ per chain (BSC = 18, the rest 6). Swap in a paid RPC
 * (Alchemy/Infura) for production reliability.
 */
export const EVM_CHAINS = {
  ethereum: {
    key: 'ethereum', name: 'Ethereum', chainId: 1, symbol: 'ETH',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://rpc.mevblocker.io'],
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    ],
  },
  polygon: {
    key: 'polygon', name: 'Polygon', chainId: 137, symbol: 'POL',
    rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192cE70d8cC03d5c3359', decimals: 6 },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    ],
  },
  bnb: {
    key: 'bnb', name: 'BNB Chain', chainId: 56, symbol: 'BNB',
    rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org'],
    tokens: [
      { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580D', decimals: 18 },
      { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    ],
  },
  base: {
    key: 'base', name: 'Base', chainId: 8453, symbol: 'ETH',
    rpcs: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'],
    tokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    ],
  },
};

/* ── provider detection ── */

/** Best-effort human name for an injected provider from its feature flags. */
export function providerName(p) {
  if (!p) return 'Wallet';
  if (p.isRobinhood || p.isRobinhoodWallet) return 'Robinhood';
  if (p.isCoinbaseWallet || p.isCoinbaseBrowser) return 'Coinbase Wallet';
  if (p.isRabby) return 'Rabby';
  if (p.isTrust || p.isTrustWallet) return 'Trust Wallet';
  if (p.isBraveWallet) return 'Brave Wallet';
  if (p.isPhantom) return 'Phantom';
  if (p.isMetaMask) return 'MetaMask';
  return 'Injected wallet';
}

/**
 * All injected EVM providers. Handles the multi-wallet case where extensions
 * expose an array at `window.ethereum.providers`.
 */
export function detectEvmProviders() {
  if (typeof window === 'undefined') return [];
  const eth = window.ethereum;
  if (!eth) return [];
  const list = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
  return list.map((p) => ({ provider: p, name: providerName(p) }));
}

export const hasEvmWallet = () => detectEvmProviders().length > 0;

/** Connect a provider (defaults to the first injected). Returns the address. */
export async function connectEvm(provider) {
  const p = provider || detectEvmProviders()[0]?.provider;
  if (!p) throw new Error('No EVM wallet found. Install MetaMask, Robinhood, or another wallet.');
  const accounts = await p.request({ method: 'eth_requestAccounts' });
  const address = accounts && accounts[0];
  if (!address) throw new Error('No account returned by the wallet.');
  return { address, name: providerName(p), provider: p };
}

/* ── balance reading (raw JSON-RPC, no libs) ── */

let rpcId = 0;
async function rpcOnce(url, method, params, timeoutMs = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: ctl.signal,
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    return j.result;
  } finally {
    clearTimeout(t);
  }
}

/** Try each RPC in turn; a dead/CORS-blocked endpoint falls through to the next. */
async function rpc(chain, method, params) {
  let lastErr;
  for (const url of chain.rpcs) {
    try { return await rpcOnce(url, method, params); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all RPCs failed');
}

/** hex wei string → human number with `decimals` places. */
export function formatUnits(hex, decimals) {
  if (hex == null) return 0;
  let v;
  try { v = BigInt(hex); } catch { return 0; }
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  // keep 6 significant fractional digits for display
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6);
  return parseFloat(`${whole}.${fracStr}`);
}

/** balanceOf(address) calldata: selector 0x70a08231 + 32-byte padded address. */
export function erc20BalanceOfData(address) {
  const addr = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return '0x70a08231' + addr;
}

async function nativeBalance(chain, address) {
  const hex = await rpc(chain, 'eth_getBalance', [address, 'latest']);
  return formatUnits(hex, 18);
}

async function tokenBalance(chain, token, address) {
  const hex = await rpc(chain, 'eth_call', [
    { to: token.address, data: erc20BalanceOfData(address) },
    'latest',
  ]);
  return formatUnits(hex, token.decimals);
}

/**
 * Read one chain's balances for an address: native coin + each stablecoin.
 * Never throws — a rate-limited RPC yields nulls, not a crash.
 */
export async function readChainBalances(chainKey, address) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) throw new Error(`unknown chain ${chainKey}`);
  const out = { chain: chain.key, name: chain.name, symbol: chain.symbol, native: null, tokens: {} };
  try { out.native = await nativeBalance(chain, address); } catch { /* rate limited */ }
  await Promise.all(
    chain.tokens.map(async (t) => {
      try { out.tokens[t.symbol] = await tokenBalance(chain, t, address); }
      catch { out.tokens[t.symbol] = null; }
    }),
  );
  return out;
}

/** Read every supported EVM chain for an address, in parallel. */
export async function readAllEvmBalances(address) {
  return Promise.all(Object.keys(EVM_CHAINS).map((k) => readChainBalances(k, address)));
}
