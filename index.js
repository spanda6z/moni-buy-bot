require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fetch = require('node-fetch');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(telegramToken || '000000000:INVALID_TOKEN');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const SOLANA_RPC = process.env.SOLANA_RPC || HELIUS_RPC || PUBLIC_RPC;
let connection = new Connection(SOLANA_RPC, 'confirmed');
let activeRpcName = SOLANA_RPC === HELIUS_RPC ? 'Helius' : (SOLANA_RPC === PUBLIC_RPC ? 'Public Solana RPC' : 'Custom SOLANA_RPC');

const MOIN_MINT = '8DXqVUopcdviLvujTcpwEqkKzB43Arp6E1axzsEE5Btq';
const CHART_URL = `https://dexscreener.com/solana/${MOIN_MINT}`;
const BUY_URL = `https://pump.fun/coin/${MOIN_MINT}`;
const TG_URL = 'https://t.me/moincoinfun';

let solPrice = 150;
let moinPrice = 0.0003;
let mcap = 300000;

const WHALE_SOL_USD = Number(process.env.WHALE_SOL_USD || 30000);
const MIN_BUY_USD = Number(process.env.MIN_BUY_USD || 1);

bot.start(async (ctx) => {
  await ctx.reply(
    '🐸 Welcome to the $moin Buy Bot!\n\nI am online. Use /status to check the bot, /price to view the latest available price, or /help for commands.',
    Markup.inlineKeyboard([[
      Markup.button.url('📊 Chart', CHART_URL),
      Markup.button.url('💲 Buy $moin', BUY_URL),
    ]])
  );
});

bot.help(async (ctx) => {
  await ctx.reply('Commands:\n/start — Start the bot\n/help — Show this help\n/ping — Check whether the bot responds\n/status — Check service status\n/price — Show the latest cached $moin and SOL prices');
});

bot.command('ping', async (ctx) => {
  await ctx.reply('🏓 Pong! Telegram bot is responding.');
});

bot.command('status', async (ctx) => {
  await ctx.reply(`✅ Telegram bot is online\nSolana RPC: ${activeRpcName}\nSOL price cache: $${solPrice}\n$moin price cache: $${moinPrice}`);
});

bot.command('price', async (ctx) => {
  await ctx.reply(`📈 $moin price: $${moinPrice}\nMarket cap/FDV: $${formatNumber(mcap)}\nSOL price: $${solPrice}\n\nChart: ${CHART_URL}`);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text || '';
  if (!text.startsWith('/')) {
    await ctx.reply('I am online. Send /help to see available commands.');
  }
});

bot.catch((err) => {
  console.error('Telegram update handler error:', err.message);
});

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
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
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
    // Actual on-chain buy detection still needs a transaction feed or Helius webhook.
  } catch (err) {
    console.error('Check error:', err.message);
  }
}

async function start() {
  console.log('Solana $moin Buy Bot starting');
  console.log(`Whale rule: wallet SOL balance ≥ $${WHALE_SOL_USD}`);
  console.log(`Solana RPC provider: ${activeRpcName}`);

  if (!telegramToken || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Set both in Railway Variables.');
    process.exit(1);
  }

  try {
    const me = await bot.telegram.getMe();
    console.log(`Telegram authenticated as @${me.username}`);
  } catch (err) {
    console.error('Telegram authentication failed:', err.response?.description || err.message);
    process.exit(1);
  }

  try {
    await connection.getLatestBlockhash('confirmed');
    console.log('Solana RPC connection successful');
  } catch (err) {
    console.error(`${activeRpcName} RPC failed:`, err.message);
    const canFallback = activeRpcName === 'Helius' && !process.env.SOLANA_RPC;
    if (!canFallback) {
      console.error('Check your RPC URL/API key and provider quota, then redeploy.');
      process.exit(1);
    }

    console.warn('Helius may be rate-limited or out of quota. Trying public Solana RPC as a fallback...');
    connection = new Connection(PUBLIC_RPC, 'confirmed');
    activeRpcName = 'Public Solana RPC fallback';
    try {
      await connection.getLatestBlockhash('confirmed');
      console.log('Public Solana RPC fallback connected successfully');
    } catch (fallbackErr) {
      console.error('Public RPC fallback also failed:', fallbackErr.message);
      process.exit(1);
    }
  }

  try {
    await bot.launch();
    console.log('Telegram bot online - ready for Railway. Commands: /start /help /ping /status /price');
  } catch (err) {
    console.error('Telegram bot failed to launch:', err.response?.description || err.message);
    process.exit(1);
  }

  // Refresh market data after Telegram polling is running so a slow price API
  // cannot prevent the bot from starting or responding to Telegram messages.
  updatePrices().catch((err) => console.error('Initial price update failed:', err.message));
  setInterval(() => updatePrices().catch((err) => console.error('Price update failed:', err.message)), 60_000);
  setInterval(checkBuys, 15_000);
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
