# MONI Buy Bot (Monad)

Simple Telegram buy-notification bot for **$MONI** on Monad mainnet (Capricorn V3 pool).

Posts clean buy alerts similar to popular Solana buy bots (with Chart + Buy buttons).

## Token Info
- **Token**: `0x0CC9B2e2AcD7BACfF79eb7dB48F5662B622E7777`
- **Pool**: `0x0198833561e4b64afa593cc3e90f446933ac2a9a` (Capricorn V3 MONI/WMON)
- **Chain ID**: 143

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) → `/newbot` and copy the token.
2. Add the bot to your Telegram group and make it **admin**.
3. Get your group chat ID (easiest: add @RawDataBot or @userinfobot temporarily).

```bash
git clone https://github.com/spanda6z/moni-buy-bot.git
cd moni-buy-bot
npm install
cp .env.example .env
```

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
- Detects buys from the Capricorn V3 pool
- Shows amount of MONI + USD value
- Clean emoji style (❄️)
- Market Cap display
- Inline buttons: Chart + Buy
- Min buy filter
- Auto price + MCap updates from GeckoTerminal
- Links to MonadScan

## Deploy (optional)
You can run this on a free VPS, Railway, Render, or any Node host that stays online.

## Notes
Public RPCs are rate-limited. For production, use a private RPC (Alchemy, QuickNode, Ankr, etc.).
