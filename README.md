# MONI Buy Bot (Monad)

Simple Telegram buy-notification bot for **$MONI** on Monad mainnet (Capricorn V3 pool).

Posts clean buy alerts with the Pepe “another one” GIF + Chart/Buy buttons.

## Token Info
- **Token**: `0x0CC9B2e2AcD7BACfF79eb7dB48F5662B622E7777`
- **Pool**: `0x0198833561e4b64afa593cc3e90f446933ac2a9a` (Capricorn V3 MONI/WMON)
- **Chain ID**: 143

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) → `/newbot` and copy the token.
2. Add the bot to your Telegram group and make it **admin**.
3. Get your group chat ID.

```bash
git clone https://github.com/spanda6z/moni-buy-bot.git
cd moni-buy-bot
npm install
cp .env.example .env
```

### Add the Pepe buy GIF
Place the Pepe video as `buy.mp4` in the same folder as `index.js`.

(You already have the video — just rename/copy it to `buy.mp4`)

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-100xxxxxxxxxx
RPC_URL=https://rpc.monad.xyz
MIN_BUY_USD=5
```

Run:

```bash
npm start
```

## Features
- Pepe “another one” GIF on every buy
- Clean card with amount, USD, buyer, Tx, MCap
- Inline buttons: 📈 Chart + 🛒 Buy
- Min buy filter
- Auto price + MCap from GeckoTerminal

## Notes
Public RPCs are rate-limited. For production use a private RPC.
