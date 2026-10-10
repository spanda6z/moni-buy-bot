require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fetch = require('node-fetch');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(telegramToken || '000000000:INVALID_TOKEN');
const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');

const MOIN_MINT = '8DXqVUopcdviLvujTcpwEqkKzB43Arp6E1axzsEE5Btq';
const CHART_URL = `https://dexscreener.com/solana/${MOIN_MINT}`;
const BUY_URL = `https://pump.fun/coin/${MOIN_MINT}`;
const TG_URL = 'https://t.me/moincoinfun';

let lastSignature = null;
let solPrice = 150;
let moinPrice = 0.0003;
let mcap = 300000;

const WHALE_SOL_USD = Number(process.env.WHALE_SOL_USD || 30000);
const MIN_BUY_USD = Number(process.env.MIN_BUY_USD || 1);

async function updatePrices() {
  try {
    const solRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const solJson = await solRes.json();
    solPrice = solJson.solana?.usd || solPrice;

    const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MOIN_MINT}`);
    const dsJson = await dsRes.json();
    const pair = dsJson.pairs?.[0];
    if (pair) {
      moinPrice = parseFloat(pair.priceUsd) || moinPrice;
      mcap = parseFloat(pair.fdv) || parseFloat(pair.marketCap) || mcap;
    }
  } catch (e) {
    console.log('Price update failed:', e.message);
  }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function getSolBalanceUsd(walletAddress) {
  try {
    const pubkey = new PublicKey(walletAddress);
    const balanceLamports = await connection.getBalance(pubkey);
    return (balanceLamports / LAMPORTS_PER_SOL) * solPrice;
  } catch {
    return 0;
  }
}

function getEmojiSpam(isWhale, usdBuy) {
  if (isWhale) return '🐳🐳🐳🐳🐳🐳🐳🐳 🐋 WHALE';
  if (usdBuy >= 100) return '🐸🐸🐸🐸🐸🐸 ⚡ BIG BUY';
  if (usdBuy >= 30) return '🐸🐸🐸🐸';
  return '🐸🐸';
}

async function sendBuyAlert({ buyer, solSpent, tokensReceived, txSignature, solBalanceUsd }) {
  const usdSpent = solSpent * solPrice;
  const isWhale = solBalanceUsd >= WHALE_SOL_USD;
  const short = buyer.slice(0, 4) + '...' + buyer.slice(-4);
  const emojis = getEmojiSpam(isWhale, usdSpent);

  const caption = `
${isWhale ? '🐳' : '🆕'} | $moin BUY!${isWhale ? ' 🐋' : ''}
by @MajorBuyBot

🎩🎩🎩🎩🎩🎩🎩🎩🎩🎩🎩

🔷 SOL ${solSpent.toFixed(4)} ($${usdSpent.toFixed(2)})
🪙 moin ${formatNumber(tokensReceived)} ([Tx](https://solscan.io/tx/${txSignature}))
🔎 Wallet: [${short}](https://solscan.io/account/${buyer})
📈 MCap: $${formatNumber(mcap)}
📣 Socials: [𝗧𝗴](${TG_URL})

💵 Wallet Balance: $${formatNumber(solBalanceUsd)}

${emojis}
  `.trim();

  const keyboard = Markup.inlineKeyboard([[
    Markup.button.url('📊 Chart', CHART_URL),
    Markup.button.url('💲 Buy', BUY_URL),
  ]]);

  await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, caption, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...keyboard,
  });
}

async function checkBuys() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MOIN_MINT}`);
    const json = await res.json();
    const pair = json.pairs?.[0];
    if (!pair || !pair.txns) return;
    // DexScreener's token endpoint does not provide a complete transaction feed.
    // Use a Solana transaction provider/webhook to implement real buy detection.
  } catch (err) {
    console.error('Check error:', err.message);
  }
}

async function start() {
  console.log('Solana $moin Buy Bot starting');
  console.log(`Whale rule: wallet SOL balance ≥ $${WHALE_SOL_USD}`);

  if (!telegramToken || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Set both in your hosting provider environment variables.');
    process.exit(1);
  }

  try {
    await bot.telegram.getMe();
  } catch (err) {
    console.error('Telegram authentication failed. TELEGRAM_BOT_TOKEN is invalid or revoked.');
    console.error('Create/check the token with @BotFather, update TELEGRAM_BOT_TOKEN in Railway Variables, then redeploy.');
    console.error('Telegram API response:', err.response?.description || err.message);
    process.exit(1);
  }

  await updatePrices();
  setInterval(updatePrices, 60_000);
  setInterval(checkBuys, 15_000);

  try {
    await bot.launch();
    console.log('Telegram bot online - ready for Railway');
  } catch (err) {
    console.error('Telegram bot failed to launch:', err.response?.description || err.message);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
