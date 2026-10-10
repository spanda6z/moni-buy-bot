require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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
let lastBuy = null;
let latestTransactionSignature = null;
let buyMonitorInitialized = false;
const seenBuySignatures = new Set();

const WHALE_SOL_USD = Number(process.env.WHALE_SOL_USD || 30000);
const DEFAULT_MIN_BUY_USD = Number(process.env.MIN_BUY_USD || 1);
const SETTINGS_FILE = path.join(__dirname, 'bot-settings.json');
const ADMIN_TELEGRAM_IDS = new Set(
  String(process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
);
let botSettings = { minBuyUsd: DEFAULT_MIN_BUY_USD, buyMediaType: null, buyMediaUrl: null };
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const savedMinimum = Number(saved.minBuyUsd);
    botSettings = {
      minBuyUsd: Number.isFinite(savedMinimum) && savedMinimum >= 0 ? savedMinimum : DEFAULT_MIN_BUY_USD,
      buyMediaType: ['photo', 'video'].includes(saved.buyMediaType) ? saved.buyMediaType : null,
      buyMediaUrl: typeof saved.buyMediaUrl === 'string' && saved.buyMediaUrl.trim() ? saved.buyMediaUrl.trim() : null,
    };
  }
} catch (err) {
  console.error('Could not load bot settings:', err.message);
}

function saveBotSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(botSettings, null, 2));
}

function isAdmin(ctx) {
  return ADMIN_TELEGRAM_IDS.has(String(ctx.from && ctx.from.id));
}

async function requireAdmin(ctx) {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only. Configure your Telegram numeric user ID in Railway as ADMIN_TELEGRAM_IDS.');
    return false;
  }
  return true;
}

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
  const adminCommands = isAdmin(ctx)
    ? '\nAdmin: /setminbuy <USD> — set minimum buy alert threshold\n/setbuyimage <URL> — set buy-alert image\n/setbuyvideo <URL> — set buy-alert video\n/clearbuymedia — remove buy-alert media'
    : '';
  await ctx.reply('Commands:\n/start — Start the bot\n/help — Show this help\n/ping — Check whether the bot responds\n/status — Check service status\n/price — Show the latest cached $moin and SOL prices\n/lastbuy — Show the latest detected MOIN purchase' + adminCommands);
});

bot.command('setminbuy', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const amount = Number((ctx.message.text || '').split(/\s+/)[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    await ctx.reply('Usage: /setminbuy <USD>\nExample: /setminbuy 5');
    return;
  }
  botSettings.minBuyUsd = amount;
  saveBotSettings();
  await ctx.reply(`✅ Minimum buy threshold set to ${amount}. Buy alerts below this USD amount will be ignored.`);
});

bot.command('setbuyimage', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const url = (ctx.message.text || '').trim().split(/\s+/).slice(1).join(' ');
  if (!/^https?:\/\//i.test(url)) {
    await ctx.reply('Usage: /setbuyimage <https://image-url>');
    return;
  }
  botSettings.buyMediaType = 'photo';
  botSettings.buyMediaUrl = url;
  saveBotSettings();
  await ctx.reply('✅ Buy-alert image saved.');
});

bot.command('setbuyvideo', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const url = (ctx.message.text || '').trim().split(/\s+/).slice(1).join(' ');
  if (!/^https?:\/\//i.test(url)) {
    await ctx.reply('Usage: /setbuyvideo <https://video-url>');
    return;
  }
  botSettings.buyMediaType = 'video';
  botSettings.buyMediaUrl = url;
  saveBotSettings();
  await ctx.reply('✅ Buy-alert video saved.');
});

bot.command('clearbuymedia', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  botSettings.buyMediaType = null;
  botSettings.buyMediaUrl = null;
  saveBotSettings();
  await ctx.reply('✅ Buy-alert media cleared.');
});

bot.command('ping', async (ctx) => {
  await ctx.reply('🏓 Pong! Telegram bot is responding.');
});

bot.command('status', async (ctx) => {
  await ctx.reply(`✅ Telegram bot is online\nSolana RPC: ${activeRpcName}\nSOL price: ${formatUsd(solPrice)} (${ageLabel(solPriceUpdatedAt)})\n$moin price: ${formatTokenPrice(moinPrice)} (${ageLabel(moinPriceUpdatedAt)})\nMarket data source: ${marketDataSource}`);
});

bot.command('lastbuy', async (ctx) => {
  if (!lastBuy) {
    await ctx.reply('No purchase has been detected yet. Buy monitoring requires a valid HELIUS_API_KEY in Railway.');
    return;
  }
  await ctx.reply(formatLastBuy(lastBuy), {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard([[Markup.button.url('🔎 View transaction', `https://solscan.io/tx/${lastBuy.signature}`), Markup.button.url('📊 Chart', CHART_URL)]]),
  });
});
bot.command('lastpurchase', async (ctx) => {
  if (!lastBuy) {
    await ctx.reply('No purchase has been detected yet. Buy monitoring requires a valid HELIUS_API_KEY in Railway.');
    return;
  }
  await ctx.reply(formatLastBuy(lastBuy), {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard([[Markup.button.url('🔎 View transaction', `https://solscan.io/tx/${lastBuy.signature}`), Markup.button.url('📊 Chart', CHART_URL)]]),
  });
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

  // Fallback SOL/USD source: use a liquid wrapped-SOL stablecoin market if CoinGecko fails.
  if (solPrice == null) {
    try {
      const solRes = await fetch('https://api.dexscreener.com/token-pairs/v1/solana/So11111111111111111111111111111111111111112', { timeout: 12000 });
      if (!solRes.ok) throw new Error(`DexScreener SOL HTTP ${solRes.status}`);
      const solJson = await solRes.json();
      const solPairs = Array.isArray(solJson) ? solJson : (Array.isArray(solJson.pairs) ? solJson.pairs : []);
      const stableQuotes = solPairs.filter((pair) =>
        pair.chainId === 'solana' && pair.baseToken && pair.baseToken.address === 'So11111111111111111111111111111111111111112' &&
        pair.quoteToken && /^(USDC|USDT)$/i.test(String(pair.quoteToken.symbol || '')) &&
        Number.isFinite(Number(pair.priceUsd)) && Number(pair.priceUsd) > 0
      ).sort((a, b) => Number((b.liquidity && b.liquidity.usd) || 0) - Number((a.liquidity && a.liquidity.usd) || 0));
      if (stableQuotes[0]) {
        solPrice = Number(stableQuotes[0].priceUsd);
        solPriceUpdatedAt = Date.now();
        console.log(`SOL/USD fallback loaded from DexScreener (${stableQuotes[0].dexId || 'Solana pair'})`);
      } else {
        console.error('SOL fallback failed: no SOL/stablecoin pair with a valid USD price');
      }
    } catch (e) {
      console.error('SOL fallback failed:', e.message);
    }
  }

  // Select a real Solana market where MOIN is the base token. The old code
  // blindly used pairs[0], which may be a different/illiquid market.
  try {
    const dsRes = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${MOIN_MINT}`, { timeout: 12000 });
    if (!dsRes.ok) throw new Error(`DexScreener MOIN HTTP ${dsRes.status}`);
    const dsJson = await dsRes.json();
    const pairs = Array.isArray(dsJson) ? dsJson : (Array.isArray(dsJson.pairs) ? dsJson.pairs : []);
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
    console.log(`Market prices updated: MOIN=${formatTokenPrice(moinPrice)}, SOL=${formatUsd(solPrice)}, source=${marketDataSource}`);
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
  if (usdSpent < botSettings.minBuyUsd) return;
  const isWhale = solBalanceUsd >= WHALE_SOL_USD;
  const safeBuyer = buyer || 'Unknown wallet';
  const short = safeBuyer.length > 12 ? safeBuyer.slice(0, 4) + '...' + safeBuyer.slice(-4) : safeBuyer;
  const emojis = getEmojiSpam(isWhale, usdSpent);

  const caption = `
${isWhale ? '🐳' : '🆕'} | $moin BUY!${isWhale ? ' 🐋' : ''}
by @MajorBuyBot

🎩🎩🎩🎩🎩🎩🎩🎩🎩🎩🎩

🔷 SOL ${solSpent.toFixed(4)} ($${usdSpent.toFixed(2)})
🪙 moin ${formatNumber(tokensReceived)} ([Tx](https://solscan.io/tx/${txSignature}))
🔎 Wallet: [${short}](https://solscan.io/account/${safeBuyer})
📈 MCap: $${formatNumber(mcap)}
📣 Socials: [𝗧𝗴](${TG_URL})

💵 Wallet Balance: $${formatNumber(solBalanceUsd)}

${emojis}
  `.trim();

  const keyboard = Markup.inlineKeyboard([[
    Markup.button.url('📊 Chart', CHART_URL),
    Markup.button.url('💲 Buy', BUY_URL),
  ]]);

  lastBuy = {
    buyer: safeBuyer,
    solSpent,
    usdSpent,
    tokensReceived,
    signature: txSignature,
    timestamp: Date.now(),
  };
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const options = {
    caption,
    parse_mode: 'Markdown',
    ...keyboard,
  };
  if (botSettings.buyMediaType === 'photo' && botSettings.buyMediaUrl) {
    await bot.telegram.sendPhoto(chatId, botSettings.buyMediaUrl, options);
  } else if (botSettings.buyMediaType === 'video' && botSettings.buyMediaUrl) {
    await bot.telegram.sendVideo(chatId, botSettings.buyMediaUrl, options);
  } else {
    await bot.telegram.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...keyboard,
    });
  }
}

function formatLastBuy(buy) {
  const buyer = buy.buyer || 'Unknown wallet';
  const short = buyer.length > 12 ? buyer.slice(0, 4) + '...' + buyer.slice(-4) : buyer;
  return `🆕 *Latest $MOIN purchase*

💵 Amount: ${formatNumber(buy.usdSpent)}
🔷 SOL spent: ${Number(buy.solSpent || 0).toFixed(4)}
🪙 MOIN received: ${formatNumber(Number(buy.tokensReceived || 0))}
👛 Wallet: [${short}](https://solscan.io/account/${buyer})
🕒 Time: ${new Date(buy.timestamp || Date.now()).toISOString()}
🔎 [Transaction](https://solscan.io/tx/${buy.signature})

📈 [Chart](${CHART_URL})`;
}

async function checkBuys() {
  if (!HELIUS_API_KEY) {
    console.warn('Buy monitoring disabled: set HELIUS_API_KEY to enable enhanced Solana transaction monitoring.');
    return;
  }
  try {
    const url = `https://api.helius.xyz/v0/addresses/${MOIN_MINT}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`Helius transaction feed HTTP ${res.status}`);
    const txs = await res.json();
    if (!Array.isArray(txs)) throw new Error('Helius returned an unexpected transaction response');

    if (!buyMonitorInitialized) {
      latestTransactionSignature = txs[0]?.signature || null;
      buyMonitorInitialized = true;
      // Seed the latest purchase from recent history without spamming old alerts.
      for (const tx of txs) {
        const buy = parseMoinBuy(tx);
        if (buy) {
          lastBuy = buy;
          break;
        }
      }
      console.log(`Buy monitor initialized; latest purchase ${lastBuy ? 'found' : 'not found'} in recent history`);
      return;
    }

    const fresh = [];
    for (const tx of txs) {
      if (tx.signature === latestTransactionSignature) break;
      if (tx.signature && !seenBuySignatures.has(tx.signature)) fresh.push(tx);
    }
    if (txs[0]?.signature) latestTransactionSignature = txs[0].signature;

    for (const tx of fresh.reverse()) {
      if (!tx.signature || seenBuySignatures.has(tx.signature)) continue;
      seenBuySignatures.add(tx.signature);
      const buy = parseMoinBuy(tx);
      if (!buy) continue;
      lastBuy = buy;
      if (buy.usdSpent >= botSettings.minBuyUsd) {
        await sendBuyAlert({
          buyer: buy.buyer,
          solSpent: buy.solSpent,
          tokensReceived: buy.tokensReceived,
          txSignature: buy.signature,
          solBalanceUsd: await getSolBalanceUsd(buy.buyer),
        });
        console.log(`Buy alert sent: ${buy.usdSpent.toFixed(2)} in transaction ${buy.signature}`);
      }
    }
    if (seenBuySignatures.size > 1000) seenBuySignatures.clear();
  } catch (err) {
    console.error('Buy monitoring error:', err.message);
  }
}

function parseMoinBuy(tx) {
  if (!tx || !tx.signature || tx.transactionError) return null;
  const transfers = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
  const incoming = transfers.filter((t) => t.mint === MOIN_MINT && Number(t.tokenAmount) > 0 && t.toUserAccount);
  if (!incoming.length) return null;

  const nativeTransfers = Array.isArray(tx.nativeTransfers) ? tx.nativeTransfers : [];
  const candidates = incoming.map((tokenTransfer) => {
    const buyer = tokenTransfer.toUserAccount;
    const solOutLamports = nativeTransfers
      .filter((t) => t.fromUserAccount === buyer && Number(t.amount) > 0)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { buyer, tokensReceived: Number(tokenTransfer.tokenAmount), solSpent: solOutLamports / LAMPORTS_PER_SOL };
  }).sort((a, b) => b.tokensReceived - a.tokensReceived);

  const candidate = candidates[0];
  if (!candidate || candidate.solSpent <= 0) return null;
  const usdSpent = solPrice == null ? 0 : candidate.solSpent * solPrice;
  return { ...candidate, usdSpent, signature: tx.signature, timestamp: Number(tx.timestamp || 0) * 1000 || Date.now() };
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

  // Start market-data refresh independently of Telegram polling. This ensures
  // prices still load while Telegram polling is recovering from a transient conflict.
  updatePrices().catch((err) => console.error('Initial price update failed:', err.message));
  setInterval(() => updatePrices().catch((err) => console.error('Price update failed:', err.message)), 60_000);
  // Poll Helius enhanced transactions for real MOIN token transfers and buy alerts.
  checkBuys().catch((err) => console.error('Initial buy monitor error:', err.message));
  setInterval(() => checkBuys().catch((err) => console.error('Buy monitor error:', err.message)), 15_000);

  // Railway can briefly overlap old/new containers during deployment. Retry a
  // Telegram polling conflict instead of crashing into a restart loop.
  while (true) {
    try {
      await bot.launch();
      console.log('Telegram bot online - ready for Railway. Commands: /start /help /ping /status /price');
      break;
    } catch (err) {
      const description = err.response?.description || err.message;
      console.error('Telegram bot failed to launch:', description);
      if (/Conflict: terminated by other getUpdates request/i.test(description)) {
        console.warn('Telegram polling conflict detected; retrying in 15 seconds. Ensure no other copy uses this bot token.');
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        continue;
      }
      process.exit(1);
    }
  }
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
