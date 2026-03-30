export function normalizeAddress(value = '') {
  return String(value).trim();
}

export function normalizeAddressLower(value = '') {
  return normalizeAddress(value).toLowerCase();
}

export function lamportsToSol(lamports = 0) {
  return Number(lamports || 0) / 1_000_000_000;
}

export function isTruthyAddress(value) {
  return typeof value === 'string' && value.trim().length >= 32;
}

export function isLikelySpamToken(symbol = '', name = '') {
  const haystack = `${symbol} ${name}`.toLowerCase();
  const spamWords = ['claim', 'visit', 'airdrop', 'free', 'scam'];
  return spamWords.some((word) => haystack.includes(word));
}

export function buildDexscreenerFallbackUrl(tokenAddress) {
  return `https://dexscreener.com/solana/${tokenAddress}`;
}

export function formatNumber(value, maximumFractionDigits = 6) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number(value));
}
