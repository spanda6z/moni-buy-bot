require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.monad.xyz');

const MONI = '0x0CC9B2e2AcD7BACfF79eb7dB48F5662B622E7777';
const POOL = '0x0198833561e4b64afa593cc3e90f446933ac2a9a';
const CHART_URL = 'https://www.geckoterminal.com/monad/pools/0x0198833561e4b64afa593cc3e90f446933ac2a9a';
const BUY_URL = 'https://www.monimonad.com/';
const TG_URL = 'https://t.me/MoniOnMonad'; // update if needed

const ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const contract = new ethers.Contract(MONI, ABI, provider);

let lastBlock = 0;
let price = 0.000015;
let mcap = 0;

// Pepe buy GIF (optional)
const BUY_GIF_PATH = path.join(__dirname, 'buy.mp4');

// Whale threshold in USD
const WHALE_USD = Number(process.env.WHALE_USD || 100);

async function getPrice() {
  try {
    const res = await fetch(
      'https://api.geckoterminal.com/api/v2/networks/monad/pools/0x0198833561e4b64afa593cc3e90f446933ac2a9a'
    );
    const json = await res.json();
    const attrs = json.data?.attributes;
    if (attrs) {
      price = parseFloat(attrs.base_token_price_usd) || price;
      mcap = parseFloat(attrs.fdv_usd) || parseFloat(attrs.market_cap_usd) || mcap;
    }
  } catch (e) {
    console.log('Price update failed');
  }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getFrogSpam(usd) {
  if (usd >= 500) return '🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸 ⚡ WHALE';
  if (usd >= 200) return '🐸🐸🐸🐸🐸🐸 ⚡ BIG BUY';
  if (usd >= WHALE_USD) return '🐸🐸🐸🐸 ⚡ WHALE ALERT';
  if (usd >= 50) return '🐸🐸🐸🐸';
  if (usd >= 20) return '🐸🐸🐸';
  return '🐸🐸';
}

async function sendBuyAlert(to, amount, usd, txHash) {
  const short = `${to.slice(0, 6)}...${to.slice(-4)}`;
  const frogs = getFrogSpam(usd);
  const isWhale = usd >= WHALE_USD;

  const caption = `
🆕 | $MONI BUY!${isWhale ? ' 🐋' : ''}
by @MONIBuyBot

🐸👍 🐸👍 🐸👍

🔷 MON ≈ $${usd.toFixed(2)}
🪙 MONI ${formatNumber(amount)} ([Tx](https://monadscan.com/tx/${txHash}))
🔎 Wallet: [${short}](https://monadscan.com/address/${to})
📈 MCap: $${formatNumber(mcap)}
📣 Socials: [𝗧𝗴](${TG_URL})

${frogs}
  `.trim();

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url('📊 Chart', CHART_URL),
      Markup.button.url('💲 Buy', BUY_URL),
    ],
  ]);

  if (fs.existsSync(BUY_GIF_PATH)) {
    await bot.telegram.sendAnimation(
      process.env.TELEGRAM_CHAT_ID,
      { source: BUY_GIF_PATH },
      {
        caption,
        parse_mode: 'Markdown',
        ...keyboard,
      }
    );
  } else {
    await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, caption, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...keyboard,
    });
  }
}

async function checkBuys() {
  try {
    const block = await provider.getBlockNumber();
    if (!lastBlock) lastBlock = block - 5;

    const filter = contract.filters.Transfer(POOL, null);
    const logs = await contract.queryFilter(filter, lastBlock + 1, block);

    for (const log of logs) {
      const to = log.args.to;
      const amount = Number(ethers.formatUnits(log.args.value, 18));
      const usd = amount * price;

      if (usd < Number(process.env.MIN_BUY_USD || 5)) continue;

      await sendBuyAlert(to, amount, usd, log.transactionHash);
    }

    lastBlock = block;
  } catch (err) {
    console.error('Check error:', err.message);
  }
}

async function start() {
  console.log('MONI Buy Bot started (Frog style + Whale alerts)');
  if (fs.existsSync(BUY_GIF_PATH)) {
    console.log('Pepe buy GIF found');
  }

  await getPrice();
  setInterval(getPrice, 60_000);
  setInterval(checkBuys, 8_000);

  bot.launch();
  console.log('Telegram bot online');
}

start();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
