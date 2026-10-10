# MONI Buy Bot (Monad) – Frog Style

Telegram buy bot for **$MONI** on Monad with frog emoji + whale alerts.

Style inspired by MajorBuyBot / popular Solana buy bots.

## Sample Notification

```
🆕 | $MONI BUY! 🐋
by @MONIBuyBot

🐸👍 🐸👍 🐸👍

🔷 MON ≈ $38.57
🪙 MONI 133,640 ([Tx](...))
🔎 Wallet: [0xAb12...Cd34](...)
📈 MCap: $280K
📣 Socials: 𝗧𝗴

🐸🐸🐸🐸 ⚡ WHALE ALERT
```

+ Chart & Buy buttons

## Setup

```bash
git clone https://github.com/spanda6z/moni-buy-bot.git
cd moni-buy-bot
npm install
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=-100...
MIN_BUY_USD=5
WHALE_USD=100
```

Optional: put the Pepe video as `buy.mp4` in the folder.

```bash
npm start
```

## Features
- Frog emoji style 🐸
- Whale alert when buy ≥ $WHALE_USD
- Bigger frog spam for larger buys
- MCap + Tx + Wallet links
- Chart + Buy buttons
- Optional Pepe GIF
