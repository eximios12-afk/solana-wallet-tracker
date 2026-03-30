# Solana Wallet Buy Live Tracker

A two-part web app that tracks Solana wallets and shows only live buy activity.

## What is included

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + Vite
- **Webhook sync**: Creates or updates a Helius enhanced webhook automatically
- **Buy parsing**: Tries to infer buys by checking that the tracked wallet spent SOL and received SPL tokens in a swap-like transaction
- **Chart links**: Uses Dexscreener pair lookup, with a fallback chart URL based on token address

## Folder structure

```text
solana-wallet-buy-live-tracker/
  backend/
  frontend/
  README.md
```

## 1) Backend setup

```bash
cd backend
cp .env.example .env
npm install
```

Edit `.env` and set:

- `HELIUS_API_KEY`
- `WEBHOOK_SECRET`
- `APP_BASE_URL` → your public backend URL, for example `https://your-app.onrender.com`
- `CLIENT_ORIGIN` → your frontend URL, for example `http://localhost:5173`

Run backend:

```bash
npm run dev
```

## 2) Frontend setup

```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## 3) How webhook syncing works

When you add or remove a wallet from the UI, the backend tries to:

1. create a Helius webhook if one does not exist yet
2. update the same Helius webhook if it already exists
3. delete the webhook if there are no wallets left

The webhook ID is saved locally in:

```text
backend/src/data/config.json
```

## 4) Local development note

Helius webhooks need a **public HTTPS URL**. For local testing, expose your backend with something like:

- ngrok
- Cloudflare Tunnel
- a deployed Render/Railway backend

Then set `APP_BASE_URL` to that public backend URL.

## 5) Production deployment flow

### Backend

Deploy the `backend` folder to Render or Railway.

Set environment variables from `.env.example`.

### Frontend

Deploy the `frontend` folder to Vercel, Netlify, or Render static hosting.

Set:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
```

Also update backend `CLIENT_ORIGIN` to your frontend domain.

## 6) API routes

### Backend routes

- `GET /api/health`
- `GET /api/wallets`
- `POST /api/wallets/add`
- `POST /api/wallets/remove`
- `GET /api/buys/history`
- `POST /api/admin/sync-webhook`
- `GET /api/admin/helius-webhooks`
- `POST /webhook`

### Request examples

Add wallet:

```bash
curl -X POST http://localhost:3000/api/wallets/add \
  -H "Content-Type: application/json" \
  -d '{"wallet":"YOUR_SOLANA_WALLET"}'
```

Remove wallet:

```bash
curl -X POST http://localhost:3000/api/wallets/remove \
  -H "Content-Type: application/json" \
  -d '{"wallet":"YOUR_SOLANA_WALLET"}'
```

## 7) Important limitations

- "Buy" detection is heuristic. Some complex swaps can still need custom logic depending on the DEX/router path.
- Helius payload shapes can vary by transaction source and event detail.
- Dexscreener may not have a pair yet for very new tokens.
- This starter keeps history in JSON files for simplicity. For production, switch to a database.

## 8) Recommended next improvements

- add user login
- store history in Postgres / Supabase
- add sound alerts in UI
- add signature links to Solscan
- add PnL / wallet summary cards
- add multi-user tracking accounts
