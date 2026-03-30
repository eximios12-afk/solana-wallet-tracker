import {
  buildDexscreenerFallbackUrl,
  isLikelySpamToken,
  lamportsToSol,
  normalizeAddress,
  normalizeAddressLower,
} from './solana.js';

function sumSolSpent(nativeTransfers = [], trackedWalletLower) {
  return nativeTransfers.reduce((total, transfer) => {
    const fromUser = normalizeAddressLower(transfer?.fromUserAccount || transfer?.fromUser || transfer?.fromAddress);
    const fromOwner = normalizeAddressLower(transfer?.fromTokenAccountOwner);
    const isFromTracked = fromUser === trackedWalletLower || fromOwner === trackedWalletLower;
    if (!isFromTracked) return total;
    return total + lamportsToSol(transfer?.amount || transfer?.nativeAmount || 0);
  }, 0);
}

function pickReceivedToken(tokenTransfers = [], trackedWalletLower) {
  const incoming = tokenTransfers.filter((transfer) => {
    const toUser = normalizeAddressLower(transfer?.toUserAccount || transfer?.toUser || transfer?.toAddress);
    const toOwner = normalizeAddressLower(transfer?.toTokenAccountOwner);
    const fromUser = normalizeAddressLower(transfer?.fromUserAccount || transfer?.fromUser || transfer?.fromAddress);
    const mint = normalizeAddress(transfer?.mint || transfer?.tokenAddress);
    const amount = Number(transfer?.tokenAmount || transfer?.amount || transfer?.rawTokenAmount?.tokenAmount || 0);

    if (!mint || amount <= 0) return false;
    if (toUser !== trackedWalletLower && toOwner !== trackedWalletLower) return false;
    if (fromUser === trackedWalletLower) return false;
    return true;
  });

  if (!incoming.length) return null;

  return incoming.sort((a, b) => {
    const amountA = Number(a?.tokenAmount || a?.amount || a?.rawTokenAmount?.tokenAmount || 0);
    const amountB = Number(b?.tokenAmount || b?.amount || b?.rawTokenAmount?.tokenAmount || 0);
    return amountB - amountA;
  })[0];
}

function hasSwapSignal(tx) {
  const type = String(tx?.type || tx?.transactionType || '').toUpperCase();
  if (type.includes('SWAP') || type.includes('BUY')) return true;

  const events = tx?.events || {};
  if (events?.swap) return true;

  const source = String(tx?.source || '').toLowerCase();
  return ['raydium', 'jupiter', 'orca', 'meteora', 'pump', 'lifinity'].some((word) => source.includes(word));
}

function buildBuyRecord({ tx, trackedWallet, minSol }) {
  const trackedWalletLower = normalizeAddressLower(trackedWallet);
  const nativeTransfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];
  const tokenTransfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
  const solSpent = sumSolSpent(nativeTransfers, trackedWalletLower);
  const received = pickReceivedToken(tokenTransfers, trackedWalletLower);

  if (!hasSwapSignal(tx)) return null;
  if (!received) return null;
  if (solSpent < minSol) return null;

  const symbol = String(received?.symbol || received?.tokenSymbol || '').trim();
  const name = String(received?.name || received?.tokenName || symbol || 'Unknown Token').trim();
  if (isLikelySpamToken(symbol, name)) return null;

  const tokenAddress = normalizeAddress(received?.mint || received?.tokenAddress);
  if (!tokenAddress) return null;

  const tokenAmount = Number(received?.tokenAmount || received?.amount || received?.rawTokenAmount?.tokenAmount || 0);
  const signature = tx?.signature || tx?.transaction?.signatures?.[0] || tx?.id || null;
  const timestampSeconds = tx?.timestamp || tx?.blockTime || Math.floor(Date.now() / 1000);

  return {
    id: `${signature}:${trackedWalletLower}:${tokenAddress}`,
    signature,
    wallet: trackedWallet,
    tokenAddress,
    tokenName: name,
    tokenSymbol: symbol || 'UNKNOWN',
    tokenAmount,
    solSpent,
    chartUrl: buildDexscreenerFallbackUrl(tokenAddress),
    source: tx?.source || tx?.feePayer || 'unknown',
    slot: tx?.slot || null,
    timestamp: new Date(timestampSeconds * 1000).toISOString(),
    rawType: tx?.type || tx?.transactionType || 'UNKNOWN',
  };
}

export function parseWebhookPayload(payload, trackedWallets, minSol) {
  const txs = Array.isArray(payload) ? payload : [payload];
  const addresses = Array.isArray(trackedWallets) ? trackedWallets : [];
  const buys = [];

  for (const tx of txs) {
    for (const wallet of addresses) {
      const buy = buildBuyRecord({ tx, trackedWallet: wallet, minSol });
      if (buy) buys.push(buy);
    }
  }

  const deduped = new Map();
  for (const buy of buys) {
    deduped.set(buy.id, buy);
  }

  return Array.from(deduped.values());
}
