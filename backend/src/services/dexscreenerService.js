import axios from 'axios';
import { buildDexscreenerFallbackUrl } from '../utils/solana.js';

const client = axios.create({
  timeout: 10000,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'wallet-buy-live-tracker/1.0',
  },
});

export async function getDexPairForToken(tokenAddress) {
  const fallbackUrl = buildDexscreenerFallbackUrl(tokenAddress);

  try {
    const response = await client.get(`https://api.dexscreener.com/token-pairs/v1/solana/${tokenAddress}`);
    const pairs = Array.isArray(response.data) ? response.data : [];
    const bestPair = pairs
      .filter((pair) => pair?.chainId === 'solana')
      .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];

    return {
      chartUrl: bestPair?.url || fallbackUrl,
      pairAddress: bestPair?.pairAddress || null,
      dexId: bestPair?.dexId || null,
      priceUsd: bestPair?.priceUsd || null,
      liquidityUsd: bestPair?.liquidity?.usd || null,
    };
  } catch (error) {
    console.error('Dexscreener lookup failed:', error.response?.data || error.message);
    return {
      chartUrl: fallbackUrl,
      pairAddress: null,
      dexId: null,
      priceUsd: null,
      liquidityUsd: null,
    };
  }
}
