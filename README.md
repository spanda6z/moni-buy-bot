# Solana $moin Buy Bot (Railway Ready)

Buy notification bot for **$moin** on Solana.

**Whale rule**: If the buyer’s wallet has **more than $30,000** in SOL balance → announce as 🐋 WHALE (even if the buy is only $1).

## Features
- Style matching MajorBuyBot
- Shows SOL spent + USD
- Token amount + Tx link
- Wallet SOL balance in USD
- Whale detection based on SOL balance
- Chart + Buy buttons
- Ready for Railway

## Deploy on Railway

1. Go to [railway.app](https://railway.app) and create a new project
2. Deploy from GitHub → select this repo (`spanda6z/moni-buy-bot`)
3. Add these environment variables:

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=-100xxxxxxxxxx
SOLANA_RPC=https://api.mainnet-beta.solana.com
MIN_BUY_USD=1
WHALE_SOL_USD=30000
```

4. Deploy

## Local run

```bash
git clone https://github.com/spanda6z/moni-buy-bot.git
cd moni-buy-bot
npm install
cp .env.example .env
# edit .env
npm start
```

## Important Note

Public Solana RPCs are limited. For reliable real-time buy detection we recommend adding a free Helius API key later (webhooks are the best method).

The current structure is ready — we can upgrade the detection part in one step when you have a Helius key.

Token: `8DXqVUopcdviLvujTcpwEqkKzB43Arp6E1axzsEE5Btq`
