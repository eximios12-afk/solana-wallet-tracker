import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';

import { getDexPairForToken } from './services/dexscreenerService.js';
import {
  createHeliusWebhook,
  deleteHeliusWebhook,
  listHeliusWebhooks,
  updateHeliusWebhook,
} from './services/heliusService.js';
import { parseWebhookPayload } from './utils/buyParser.js';
import { ensureJsonFile, readJson, writeJson } from './utils/fileStore.js';
import { isTruthyAddress, normalizeAddress } from './utils/solana.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const walletsFile = path.join(dataDir, 'wallets.json');
const buysFile = path.join(dataDir, 'buys.json');
const configFile = path.join(dataDir, 'config.json');

ensureJsonFile(walletsFile, []);
ensureJsonFile(buysFile, []);
ensureJsonFile(configFile, { heliusWebhookId: process.env.HELIUS_WEBHOOK_ID || '' });

const PORT = Number(process.env.PORT || 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const HELIUS_TXN_STATUS = process.env.HELIUS_TXN_STATUS || 'all';
const MIN_SOL = Number(process.env.MIN_SOL || 0.01);
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 500);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'DELETE'],
  },
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  console.log('Health route hit');
  res.status(200).json({ ok: true });
});

app.post('/webhook', (req, res) => {
  console.log('Webhook route hit');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body));
  res.status(200).json({ received: true });
});

function getTrackedWallets() {
  return readJson(walletsFile, []);
}

function saveTrackedWallets(wallets) {
  writeJson(walletsFile, wallets);
}

function getBuyHistory() {
  return readJson(buysFile, []);
}

function saveBuyHistory(buys) {
  writeJson(buysFile, buys.slice(0, MAX_HISTORY));
}

function getConfig() {
  return readJson(configFile, { heliusWebhookId: process.env.HELIUS_WEBHOOK_ID || '' });
}

function saveConfig(config) {
  writeJson(configFile, config);
}

async function syncHeliusWebhook() {
  if (!HELIUS_API_KEY || !WEBHOOK_SECRET || !APP_BASE_URL) {
    return {
      ok: false,
      message: 'Set HELIUS_API_KEY, WEBHOOK_SECRET, and APP_BASE_URL before syncing the webhook.',
    };
  }

  const wallets = getTrackedWallets();
  const config = getConfig();
  const webhookUrl = `${APP_BASE_URL}/webhook`;

  if (!wallets.length) {
    if (config.heliusWebhookId) {
      try {
        await deleteHeliusWebhook({ apiKey: HELIUS_API_KEY, webhookId: config.heliusWebhookId });
      } catch (error) {
        console.error('Failed to delete Helius webhook:', error.response?.data || error.message);
      }
      saveConfig({ ...config, heliusWebhookId: '' });
    }

    return { ok: true, message: 'No wallets to track. Existing webhook removed if it existed.' };
  }

  try {
    if (config.heliusWebhookId) {
      const updated = await updateHeliusWebhook({
        apiKey: HELIUS_API_KEY,
        webhookId: config.heliusWebhookId,
        addresses: wallets,
        webhookUrl,
        secret: WEBHOOK_SECRET,
        txnStatus: HELIUS_TXN_STATUS,
      });
      return { ok: true, message: 'Helius webhook updated.', data: updated };
    }

    const created = await createHeliusWebhook({
      apiKey: HELIUS_API_KEY,
      addresses: wallets,
      webhookUrl,
      secret: WEBHOOK_SECRET,
      txnStatus: HELIUS_TXN_STATUS,
    });

    saveConfig({ ...config, heliusWebhookId: created?.webhookID || created?.webhookId || '' });
    return { ok: true, message: 'Helius webhook created.', data: created };
  } catch (error) {
    console.error('Helius webhook sync failed:', error.response?.data || error.message);
    return {
      ok: false,
      message: 'Helius webhook sync failed.',
      error: error.response?.data || error.message,
    };
  }
}

io.on('connection', (socket) => {
  socket.emit('bootstrap', {
    wallets: getTrackedWallets(),
    buys: getBuyHistory(),
    minSol: MIN_SOL,
    connectedAt: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'wallet-buy-live-tracker-backend',
    time: new Date().toISOString(),
  });
});

app.get('/api/wallets', (req, res) => {
  res.json({ wallets: getTrackedWallets() });
});

app.post('/api/wallets/add', async (req, res) => {
  const wallet = normalizeAddress(req.body?.wallet);
  if (!isTruthyAddress(wallet)) {
    return res.status(400).json({ error: 'Please enter a valid Solana wallet address.' });
  }

  const wallets = getTrackedWallets();
  if (wallets.includes(wallet)) {
    return res.status(200).json({ wallets, message: 'Wallet is already being tracked.' });
  }

  const nextWallets = [wallet, ...wallets];
  saveTrackedWallets(nextWallets);
  const syncResult = await syncHeliusWebhook();
  io.emit('wallets:updated', nextWallets);

  res.json({
    wallets: nextWallets,
    syncResult,
  });
});

app.post('/api/wallets/remove', async (req, res) => {
  const wallet = normalizeAddress(req.body?.wallet);
  const wallets = getTrackedWallets();
  const nextWallets = wallets.filter((item) => item !== wallet);

  saveTrackedWallets(nextWallets);
  const syncResult = await syncHeliusWebhook();
  io.emit('wallets:updated', nextWallets);

  res.json({
    wallets: nextWallets,
    syncResult,
  });
});

app.get('/api/buys/history', (req, res) => {
  const wallet = normalizeAddress(req.query?.wallet || '');
  const buys = getBuyHistory();
  const filtered = wallet ? buys.filter((buy) => buy.wallet === wallet) : buys;
  res.json({ buys: filtered });
});

app.get('/api/admin/helius-webhooks', async (req, res) => {
  if (!HELIUS_API_KEY) {
    return res.status(400).json({ error: 'Missing HELIUS_API_KEY' });
  }

  try {
    const data = await listHeliusWebhooks(HELIUS_API_KEY);
    return res.json(data);
  } catch (error) {
    console.error('Failed to list webhooks:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to list Helius webhooks.' });
  }
});

app.post('/api/admin/sync-webhook', async (req, res) => {
  const syncResult = await syncHeliusWebhook();
  res.json(syncResult);
});

app.post('/webhook', async (req, res) => {
  const incomingSecret = req.header('authorization') || req.header('x-webhook-secret') || '';
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook request.' });
  }

  try {
    const wallets = getTrackedWallets();
    const parsed = parseWebhookPayload(req.body, wallets, MIN_SOL);

    if (!parsed.length) {
      return res.json({ ok: true, buysAdded: 0 });
    }

    const enriched = await Promise.all(
      parsed.map(async (buy) => {
        const dex = await getDexPairForToken(buy.tokenAddress);
        return {
          ...buy,
          chartUrl: dex.chartUrl || buy.chartUrl,
          pairAddress: dex.pairAddress,
          dexId: dex.dexId,
          priceUsd: dex.priceUsd,
          liquidityUsd: dex.liquidityUsd,
        };
      })
    );

    const current = getBuyHistory();
    const existingIds = new Set(current.map((item) => item.id));
    const uniqueNewBuys = enriched.filter((item) => !existingIds.has(item.id));

    if (!uniqueNewBuys.length) {
      return res.json({ ok: true, buysAdded: 0, deduped: true });
    }

    const next = [...uniqueNewBuys.reverse(), ...current]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_HISTORY);

    saveBuyHistory(next);

    for (const buy of uniqueNewBuys) {
      io.emit('buy:new', buy);
    }

    return res.json({ ok: true, buysAdded: uniqueNewBuys.length, buys: uniqueNewBuys });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Client origin allowed: ${CLIENT_ORIGIN}`);
  if (!APP_BASE_URL) {
    console.log('APP_BASE_URL is not set yet. Helius webhook sync will not work until you set it.');
  }
});
