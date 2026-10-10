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

let solPrice = null;
let moinPrice = null;
let mcap = null;
let solPriceUpdatedAt = null;
let moinPriceUpdatedAt = null;
let marketDataSource = 'Not loaded yet';

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
  await ctx.reply(`✅ Telegram bot is online\nSolana RPC: ${activeRpcName}\nSOL price: ${formatUsd(solPrice)} (${ageLabel(solPriceUpdatedAt)})\n$moin price: ${formatTokenPrice(moinPrice)} (${ageLabel(moinPriceUpdatedAt)})\nMarket data source: ${marketDataSource}`);
});

bot.command('price', async (ctx) => {
  await ctx.reply(`📈 $moin price: ${formatTokenPrice(moinPrice)}\nMarket cap/FDV: ${mcap == null ? 'Unavailable' : '$' + formatNumber(mcap)}\nSOL price: ${formatUsd(solPrice)}\nUpdated: ${ageLabel(moinPriceUpdatedAt)}\nSource: ${marketDataSource}\n\nChart: ${CHART_URL}`);
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
  let selectedPair = null;

  // CoinGecko is the primary SOL/USD source. Never replace a valid price with
  // a missing, zero, malformed, or failed API response.
  try {
    const solRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (!solRes.ok) throw new Error(`CoinGecko HTTP ${solRes.status}`);
    const solJson = await solRes.json();
    const candidate = Number(solJson.solana && solJson.solana.usd);
    if (Number.isFinite(candidate) && candidate > 0) {
      solPrice = candidate;
      solPriceUpdatedAt = Date.now();
    } else {
      throw new Error('CoinGecko returned an invalid SOL/USD price');
    }
  } catch (e) {
    console.error('SOL price update failed:', e.message);
  }

  // Select a real Solana market where MOIN is the base token. The old code
  // blindly used pairs[0], which may be a different/illiquid market.
  try {
    const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MOIN_MINT}`);
    if (!dsRes.ok) throw new Error(`DexScreener HTTP ${dsRes.status}`);
    const dsJson = await dsRes.json();
    const pairs = Array.isArray(dsJson.pairs) ? dsJson.pairs : [];
    const validPairs = pairs.filter((pair) =>
      pair.chainId === 'solana' &&
      pair.baseToken && pair.baseToken.address === MOIN_MINT &&
      Number.isFinite(Number(pair.priceUsd)) && Number(pair.priceUsd) > 0
    );
    validPairs.sort((a, b) =>
      Number((b.liquidity && b.liquidity.usd) || 0) - Number((a.liquidity && a.liquidity.usd) || 0)
    );
    selectedPair = validPairs[0] || null;
    if (!selectedPair) throw new Error('No valid Solana pair with MOIN as the base token was returned');

    moinPrice = Number(selectedPair.priceUsd);
    moinPriceUpdatedAt = Date.now();
    const fdv = Number(selectedPair.fdv);
    const marketCap = Number(selectedPair.marketCap);
    mcap = Number.isFinite(fdv) && fdv > 0
      ? fdv
      : (Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null);
    marketDataSource = `DexScreener / ${selectedPair.dexId || 'Solana pair'}`;

    // If CoinGecko is unavailable, derive SOL/USD only when this pair is
    // quoted directly in SOL/WSOL and both price fields are valid.
    if (solPrice == null && /^(SOL|WSOL)$/i.test(String(selectedPair.quoteToken && selectedPair.quoteToken.symbol || ''))) {
      const nativePrice = Number(selectedPair.priceNative);
      const derivedSolPrice = moinPrice / nativePrice;
      if (Number.isFinite(derivedSolPrice) && derivedSolPrice > 0) {
        solPrice = derivedSolPrice;
        solPriceUpdatedAt = Date.now();
        console.log('Using SOL/USD derived from the selected MOIN/SOL pair');
      }
    }
    console.log(`Market prices updated: MOIN=$${formatTokenPrice(moinPrice)}, SOL=${formatUsd(solPrice)}, source=${marketDataSource}`);
  } catch (e) {
    console.error('MOIN price update failed:', e.message);
  }
}

function formatUsd(value) {
  return Number.isFinite(value) && value > 0 ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : 'Unavailable';
}

function formatTokenPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return 'Unavailable';
  return '$' + value.toLocaleString('en-US', { maximumSignificantDigits: 8, maximumFractionDigits: 12 });
}

function ageLabel(timestamp) {
  if (!timestamp) return 'not available yet';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'updated just now';
  if (seconds < 3600) return `updated ${Math.floor(seconds / 60)} min ago`;
  return `updated ${Math.floor(seconds / 3600)} hr ago`;
}

function formatNumber(n) {
  if (!Number.isFinite(n) || n <= 0) return 'Unavailable';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
async function getSolBalanceUsd(walletAddress) {
  try {
    const pubkey = new PublicKey(walletAddress);
    const balanceLamports = await connection.getBalance(pubkey);
    return solPrice == null ? 0 : (balanceLamports / LAMPORTS_PER_SOL) * solPrice;
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
  const usdSpent = solPrice == null ? 0 : solSpent * solPrice;
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
