# MONI Buy Bot (Monad) – Frog Style + Real Whale Detection

Telegram buy bot for **$MONI** on Monad.

**Whale definition**: Wallet that holds **more than $20,000** of $MONI (not just a big single buy).

## Sample

```
🆕 | $MONI BUY! 🐋
by @MONIBuyBot

🐸👍 🐸👍 🐸👍

🔷 ≈ $38.57
🪙 MONI 133,640 (Tx)
🔎 Wallet: 0xAb12...Cd34
💰 Holdings: $24.8K
📈 MCap: $280K
📣 Socials: 𝗧𝗴

🐸🐸🐸🐸🐸🐸 🐋 WHALE WALLET
```

## Setup

```bash
git clone https://github.com/spanda6z/moni-buy-bot.git
cd moni-buy-bot
npm install
cp .env.example .env
```

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=-100...
MIN_BUY_USD=5
WHALE_HOLDINGS_USD=20000
```

Optional: put Pepe video as `buy.mp4`

```bash
npm start
```

## Features
- Frog emoji style 🐸
- Real whale detection (wallet holdings ≥ $20k)
- Shows current holdings of the buyer
- Chart + Buy buttons
- Optional Pepe GIF
