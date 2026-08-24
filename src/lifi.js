/**
 * Cross-chain deposit/withdraw via LI.FI — the goat.cash model (goat uses NEAR
 * Intents; we use LI.FI, which is browser-usable and covers Solana + every EVM
 * chain including Base, Polygon, BNB, Arbitrum, Robinhood Chain and
 * Hyperliquid). Verified reachable + returning real quotes from the deployed
 * origin.
 *
 * Honesty about scope:
 *   - QUOTES are fully real. `getQuote` calls LI.FI and returns the actual
 *     output amount, route, gas and fees. Nothing here is faked.
 *   - EXECUTION for an EVM source is real: LI.FI returns a `transactionRequest`
 *     that the connected EVM wallet signs and broadcasts (`executeEvmQuote`).
 *   - EXECUTION for a Solana source needs the connected Solana wallet to sign a
 *     returned transaction; that path is marked and left for the wallet
 *     integration rather than pretended to work.
 */

const BASE = 'https://li.quest/v1';

/** Curated chains for the pickers, with LI.FI ids. `SOL` is LI.FI's Solana key. */
export const BRIDGE_CHAINS = [
  { key: 'SOL', id: 'SOL', name: 'Solana', kind: 'SVM', symbol: 'SOL' },
  { key: 'base', id: 8453, name: 'Base', kind: 'EVM', symbol: 'ETH' },
  { key: 'eth', id: 1, name: 'Ethereum', kind: 'EVM', symbol: 'ETH' },
  { key: 'polygon', id: 137, name: 'Polygon', kind: 'EVM', symbol: 'POL' },
  { key: 'bnb', id: 56, name: 'BNB Chain', kind: 'EVM', symbol: 'BNB' },
  { key: 'arbitrum', id: 42161, name: 'Arbitrum', kind: 'EVM', symbol: 'ETH' },
  { key: 'optimism', id: 10, name: 'Optimism', kind: 'EVM', symbol: 'ETH' },
  { key: 'avalanche', id: 43114, name: 'Avalanche', kind: 'EVM', symbol: 'AVAX' },
];

export const chainById = (id) => BRIDGE_CHAINS.find((c) => String(c.id) === String(id));

async function api(path, params) {
  const url = params ? `${BASE}${path}?${new URLSearchParams(params)}` : `${BASE}${path}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || `LI.FI ${r.status}`);
  return j;
}

/**
 * A real cross-chain (or same-chain) quote. Amounts are token minor units as
 * strings. `fromToken`/`toToken` accept a symbol ("USDC") or a token address.
 * Returns a normalized shape plus the raw route for execution.
 */
export async function getQuote({ fromChain, toChain, fromToken = 'USDC', toToken = 'USDC', fromAmount, fromAddress, toAddress, slippage = 0.02 }) {
  const j = await api('/quote', {
    fromChain: String(fromChain),
    toChain: String(toChain),
    fromToken,
    toToken,
    fromAmount: String(fromAmount),
    fromAddress,
    ...(toAddress ? { toAddress } : {}),
    slippage: String(slippage),
  });
  const est = j.estimate || {};
  const outDec = j.action?.toToken?.decimals ?? 6;
  const inDec = j.action?.fromToken?.decimals ?? 6;
  const toAmount = Number(est.toAmount || 0) / 10 ** outDec;
  const toAmountMin = Number(est.toAmountMin || est.toAmount || 0) / 10 ** outDec;
  const fromAmt = Number(est.fromAmount || fromAmount) / 10 ** inDec;
  return {
    tool: j.tool,
    toAmount,
    toAmountMin,
    rate: fromAmt ? toAmount / fromAmt : 0,
    gasUSD: Number(est.gasCosts?.reduce((s, g) => s + Number(g.amountUSD || 0), 0) || 0),
    feeUSD: Number(est.feeCosts?.reduce((s, f) => s + Number(f.amountUSD || 0), 0) || 0),
    durationSec: est.executionDuration || null,
    toToken: j.action?.toToken?.symbol || toToken,
    fromToken: j.action?.fromToken?.symbol || fromToken,
    transactionRequest: j.transactionRequest || null, // present for EVM source
    raw: j,
  };
}

/** Token list for a chain (for a token picker), best-effort. */
export async function getTokens(chainId) {
  try {
    const j = await api('/tokens', { chains: String(chainId) });
    const list = j.tokens?.[String(chainId)] || [];
    return list.slice(0, 40).map((t) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals, name: t.name }));
  } catch { return []; }
}

/**
 * Execute an EVM-source quote: switch the wallet to the source chain, then send
 * the transactionRequest LI.FI produced. Returns the tx hash. The bridge then
 * delivers to the destination chain automatically (poll status via getStatus).
 */
export async function executeEvmQuote(quote, provider, fromChainId) {
  const tx = quote.transactionRequest;
  if (!tx) throw new Error('This route has no EVM transaction to sign (Solana source needs the Solana wallet).');
  // Ensure the wallet is on the source chain.
  const hexChain = '0x' + Number(fromChainId).toString(16);
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain }] });
  } catch (e) {
    // 4902 = chain not added; surface a clear message rather than a raw code.
    if (e?.code === 4902) throw new Error('Add this network to your wallet first, then retry.');
  }
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value || '0x0',
      ...(tx.gasLimit ? { gas: tx.gasLimit } : {}),
    }],
  });
  return hash;
}

/** Poll LI.FI for cross-chain delivery status. */
export async function getStatus({ txHash, fromChain, toChain, tool }) {
  const j = await api('/status', { txHash, fromChain: String(fromChain), toChain: String(toChain), ...(tool ? { bridge: tool } : {}) });
  return { status: j.status, substatus: j.substatus, receivingTxHash: j.receiving?.txHash || null };
}
