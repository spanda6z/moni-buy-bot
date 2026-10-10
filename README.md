# MONI Buy Bot (Monad)

Telegram buy bot for **$MONI** on Monad.

**Whale rule**: Any wallet that buys $MONI and already holds **more than 25,000,000 MONI** is announced as a 🐋 WHALE.

## Sample

```
🆕 | $MONI BUY! 🐋
by @MONIBuyBot

🐸👍 🐸👍 🐸👍

🔷 ≈ $38.57
🪙 MONI 133,640 (Tx)
🔎 Wallet: 0xAb12...Cd34
💰 Holdings: 28.4M MONI
📈 MCap: $14.2K
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

Edit `.env` with your bot token + chat ID, then:

```bash
npm start
```

Optional: put the Pepe video as `buy.mp4`
