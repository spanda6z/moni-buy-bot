require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { ethers } = require('ethers');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.monad.xyz');

const MONI = '0x0CC9B2e2AcD7BACfF79eb7dB48F5662B622E7777';
const POOL = '0x0198833561e4b64afa593cc3e90f446933ac2a9a';
const CHART_URL = 'https://www.geckoterminal.com/monad/pools/0x0198833561e4b64afa593cc3e90f446933ac2a9a';
const BUY_URL = 'https://www.monimonad.com/'; // or your preferred swap link

const ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const contract = new ethers.Contract(MONI, ABI, provider);

let lastBlock = 0;
let price = 0.000015;
let mcap = 0;

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
    console.log('Price update failed, using last known');
  }
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

      const emojiCount = Math.min(Math.floor(usd / 10) + 1, 8);
      const emojis = '❄️'.repeat(emojiCount);
      const short = `${to.slice(0, 6)}...${to.slice(-4)}`;

      // Clean card style message
      const msg = `
${emojis} **NEW BUY** ${emojis}

**$MONI** buy

${emojis}

💰 **${formatNumber(amount)} MONI**
💵 ≈ $${usd.toFixed(2)}

👤 [${short}](https://monadscan.com/address/${to})
🔗 [Tx](https://monadscan.com/tx/${log.transactionHash})
📊 MCap $${formatNumber(mcap)}

❄️ Yeti climbing the mountain!
      `.trim();

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.url('📈 Chart', CHART_URL),
          Markup.button.url('🛒 Buy', BUY_URL),
        ],
      ]);

      await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...keyboard,
      });
    }

    lastBlock = block;
  } catch (err) {
    console.error('Check error:', err.message);
  }
}

async function start() {
  console.log('MONI Buy Bot started on Monad...');
  await getPrice();
  setInterval(getPrice, 60_000);
  setInterval(checkBuys, 8_000);

  bot.launch();
  console.log('Telegram bot online');
}

start();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
