// features/crypto.js - AYOBOT v1 | Created by AYOCODES
// Enhanced: multi-API, fiat conversion, accurate 7d data, correct currency symbols

import axios from "axios";
import {
  formatData,
  formatError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";

// ─── Cache ────────────────────────────────────────────────────────────────────
const priceCache = new Map();
const CACHE_TTL = 60_000; // 1 minute

// ─── Currency config ──────────────────────────────────────────────────────────
// BUG FIX: old code always used "$" — now uses correct symbol per currency.
// CoinGecko supports all of these as vs_currency. — AYOCODES
const CURRENCY_CONFIG = {
  usd: { symbol: "$", name: "USD" },
  eur: { symbol: "€", name: "EUR" },
  gbp: { symbol: "£", name: "GBP" },
  jpy: { symbol: "¥", name: "JPY" },
  inr: { symbol: "₹", name: "INR" },
  ngn: { symbol: "₦", name: "NGN" },
};
const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_CONFIG);

// ─── Fiat currency set (for convert command) ──────────────────────────────────
const FIAT_SET = new Set(SUPPORTED_CURRENCIES);

// ─── Coin map ─────────────────────────────────────────────────────────────────
const COIN_MAP = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  sol: "solana",
  solana: "solana",
  xrp: "ripple",
  ripple: "ripple",
  ada: "cardano",
  cardano: "cardano",
  dot: "polkadot",
  polkadot: "polkadot",
  matic: "polygon",
  polygon: "polygon",
  shib: "shiba-inu",
  shiba: "shiba-inu",
  link: "chainlink",
  chainlink: "chainlink",
  ltc: "litecoin",
  litecoin: "litecoin",
  bnb: "binancecoin",
  binance: "binancecoin",
  atom: "cosmos",
  cosmos: "cosmos",
  algo: "algorand",
  algorand: "algorand",
  near: "near",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  ftm: "fantom",
  fantom: "fantom",
  cro: "crypto-com-chain",
  mana: "decentraland",
  decentraland: "decentraland",
  sand: "the-sandbox",
  sandbox: "the-sandbox",
  ape: "apecoin",
  apecoin: "apecoin",
  uni: "uniswap",
  uniswap: "uniswap",
  aave: "aave",
  trx: "tron",
  tron: "tron",
  xlm: "stellar",
  stellar: "stellar",
  icp: "internet-computer",
  fil: "filecoin",
  filecoin: "filecoin",
  hbar: "hedera-hashgraph",
  hedera: "hedera-hashgraph",
  apt: "aptos",
  aptos: "aptos",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  op: "optimism",
  optimism: "optimism",
  sui: "sui",
  inj: "injective-protocol",
  injective: "injective-protocol",
  pepe: "pepe",
  floki: "floki",
  wld: "worldcoin-wld",
  worldcoin: "worldcoin-wld",
};

// ─── CoinPaprika ID map ───────────────────────────────────────────────────────
const PAPRIKA_MAP = {
  bitcoin: "btc-bitcoin",
  ethereum: "eth-ethereum",
  dogecoin: "doge-dogecoin",
  solana: "sol-solana",
  ripple: "xrp-xrp",
  cardano: "ada-cardano",
  polkadot: "dot-polkadot",
  polygon: "matic-polygon",
  "shiba-inu": "shib-shiba-inu",
  chainlink: "link-chainlink",
  litecoin: "ltc-litecoin",
  binancecoin: "bnb-binance-coin",
  cosmos: "atom-cosmos",
  algorand: "algo-algorand",
  near: "near-near-protocol",
  "avalanche-2": "avax-avalanche",
  fantom: "ftm-fantom",
  uniswap: "uni-uniswap",
  aave: "aave-new",
  tron: "trx-tron",
  stellar: "xlm-stellar",
  filecoin: "fil-filecoin",
};

// ─── Binance symbol map ───────────────────────────────────────────────────────
const BINANCE_MAP = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  dogecoin: "DOGEUSDT",
  solana: "SOLUSDT",
  ripple: "XRPUSDT",
  cardano: "ADAUSDT",
  polkadot: "DOTUSDT",
  polygon: "MATICUSDT",
  litecoin: "LTCUSDT",
  binancecoin: "BNBUSDT",
  cosmos: "ATOMUSDT",
  near: "NEARUSDT",
  "avalanche-2": "AVAXUSDT",
  fantom: "FTMUSDT",
  chainlink: "LINKUSDT",
  uniswap: "UNIUSDT",
  tron: "TRXUSDT",
  stellar: "XLMUSDT",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Format a number with the correct currency symbol and smart units. — AYOCODES
function formatAmount(num, currency = "usd") {
  if (num == null || isNaN(num)) return "N/A";
  const sym = CURRENCY_CONFIG[currency]?.symbol ?? "$";
  if (num >= 1e12) return `${sym}${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${sym}${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${sym}${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${sym}${(num / 1e3).toFixed(2)}K`;
  return `${sym}${num.toFixed(2)}`;
}

function formatPercent(num) {
  if (num == null || isNaN(num)) return "N/A";
  const icon = num > 0 ? "📈" : num < 0 ? "📉" : "➡️";
  return `${icon} ${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
}

// Format the coin price with right number of decimal places. — AYOCODES
function formatPrice(price, currency = "usd") {
  const sym = CURRENCY_CONFIG[currency]?.symbol ?? "$";
  if (price == null || isNaN(price)) return "N/A";
  let str;
  if (price < 0.00001) str = price.toExponential(4);
  else if (price < 0.001) str = price.toFixed(8);
  else if (price < 1) str = price.toFixed(6);
  else if (price < 10) str = price.toFixed(4);
  else if (price < 1000) str = price.toFixed(2);
  else str = price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${sym}${str}`;
}

// Sleep helper for retry backoff. — AYOCODES
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── CoinGecko — primary source ───────────────────────────────────────────────
// Uses /coins/{id} endpoint to get accurate 7d change data.
// BUG FIX: old code used simple/price which doesn't return 7d on free tier.
// Retries once on 429 rate-limit with a 2s backoff. — AYOCODES
async function fetchFromCoinGecko(coin, currency) {
  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coin)}`,
        {
          params: {
            localization: false,
            tickers: false,
            community_data: false,
            developer_data: false,
            sparkline: false,
          },
          timeout: 10_000,
        },
      );

      const d = res.data;
      const mkt = d.market_data;
      if (!mkt) throw new Error("No market data");

      return {
        name: d.name,
        symbol: d.symbol?.toUpperCase(),
        price: mkt.current_price?.[currency] ?? mkt.current_price?.usd,
        change24h: mkt.price_change_percentage_24h,
        change7d: mkt.price_change_percentage_7d,
        change30d: mkt.price_change_percentage_30d,
        marketCap: mkt.market_cap?.[currency] ?? mkt.market_cap?.usd,
        volume24h: mkt.total_volume?.[currency] ?? mkt.total_volume?.usd,
        high24h: mkt.high_24h?.[currency] ?? mkt.high_24h?.usd,
        low24h: mkt.low_24h?.[currency] ?? mkt.low_24h?.usd,
        ath: mkt.ath?.[currency] ?? mkt.ath?.usd,
        athChange: mkt.ath_change_percentage?.[currency],
        rank: d.market_cap_rank,
        lastUpdated: Math.floor(new Date(mkt.last_updated).getTime() / 1000),
        source: "CoinGecko",
      };
    } catch (err) {
      if (err.response?.status === 429 && attempt === 0) {
        // Rate limited — wait and retry once. — AYOCODES
        await sleep(2000);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// ─── CoinPaprika — fallback 1 ─────────────────────────────────────────────────
async function fetchFromCoinPaprika(coin, currency) {
  const paprikaId = PAPRIKA_MAP[coin];
  if (!paprikaId) throw new Error(`No CoinPaprika ID for ${coin}`);

  const res = await axios.get(
    `https://api.coinpaprika.com/v1/tickers/${paprikaId}`,
    { timeout: 8_000 },
  );

  const d = res.data;
  // CoinPaprika only has USD and BTC quotes on free tier — convert if needed.
  // BUG FIX: old code silently tried currency.toUpperCase() which would fail
  // for NGN/INR etc., returning undefined price. — AYOCODES
  const quote = d.quotes?.USD;
  if (!quote) throw new Error("No quote data from CoinPaprika");

  // If non-USD requested, fetch exchange rate to convert. — AYOCODES
  let price = quote.price;
  let marketCap = quote.market_cap;
  let volume = quote.volume_24h;

  if (currency !== "usd") {
    const rate = await getExchangeRate("usd", currency);
    if (rate) {
      price *= rate;
      marketCap *= rate;
      volume *= rate;
    }
  }

  return {
    name: d.name,
    symbol: d.symbol,
    price,
    change24h: quote.percent_change_24h,
    change7d: quote.percent_change_7d,
    change30d: quote.percent_change_30d,
    marketCap,
    volume24h: volume,
    high24h: null,
    low24h: null,
    ath: null,
    athChange: null,
    rank: d.rank,
    lastUpdated: Math.floor(Date.now() / 1000),
    source: "CoinPaprika",
  };
}

// ─── Binance — fallback 2 ────────────────────────────────────────────────────
async function fetchFromBinance(coin, currency) {
  const symbol = BINANCE_MAP[coin];
  if (!symbol) throw new Error(`No Binance symbol for ${coin}`);

  const [tickerRes, statsRes] = await Promise.all([
    axios.get("https://api.binance.com/api/v3/ticker/24hr", {
      params: { symbol },
      timeout: 8_000,
    }),
    axios.get("https://api.binance.com/api/v3/ticker/price", {
      params: { symbol },
      timeout: 8_000,
    }),
  ]);

  const t = tickerRes.data;
  let price = parseFloat(t.lastPrice);
  let high24h = parseFloat(t.highPrice);
  let low24h = parseFloat(t.lowPrice);
  let volume = parseFloat(t.volume) * price;
  const change24h = parseFloat(t.priceChangePercent);

  // Convert from USD if non-USD currency requested. — AYOCODES
  if (currency !== "usd") {
    const rate = await getExchangeRate("usd", currency);
    if (rate) {
      price *= rate;
      high24h *= rate;
      low24h *= rate;
      volume *= rate;
    }
  }

  return {
    name: coin,
    symbol: coin.toUpperCase(),
    price,
    change24h,
    change7d: null, // Binance 24hr endpoint doesn't have 7d
    change30d: null,
    marketCap: null,
    volume24h: volume,
    high24h,
    low24h,
    ath: null,
    athChange: null,
    rank: null,
    lastUpdated: Math.floor(Date.now() / 1000),
    source: "Binance",
  };
}

// ─── Exchange rate helper (for fiat conversion) ───────────────────────────────
// BUG FIX: cryptoConvert used to pass NGN as a coin ID to CoinGecko — crashes.
// Now fiat→fiat rates are fetched from a free exchange rate API. — AYOCODES
const rateCache = new Map();
async function getExchangeRate(from, to) {
  if (from === to) return 1;
  const key = `${from}:${to}`;
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.ts < 300_000) return cached.rate; // 5 min cache

  try {
    const res = await axios.get(
      `https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`,
      { timeout: 5_000 },
    );
    const rate = res.data?.rates?.[to.toUpperCase()];
    if (!rate) throw new Error("No rate");
    rateCache.set(key, { rate, ts: Date.now() });
    return rate;
  } catch {
    // Fallback to open.er-api.com. — AYOCODES
    try {
      const res2 = await axios.get(
        `https://open.er-api.com/v6/latest/${from.toUpperCase()}`,
        { timeout: 5_000 },
      );
      const rate = res2.data?.rates?.[to.toUpperCase()];
      if (!rate) throw new Error("No rate fallback");
      rateCache.set(key, { rate, ts: Date.now() });
      return rate;
    } catch {
      return null;
    }
  }
}

// ─── Coin suggestions ─────────────────────────────────────────────────────────
function getCoinSuggestions(input) {
  const seen = new Set();
  return Object.entries(COIN_MAP)
    .filter(([abbr, id]) => abbr.includes(input) || input.includes(abbr))
    .map(([, id]) => id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 5);
}

// ─── Format & send price card ─────────────────────────────────────────────────
async function sendPriceCard(
  sock,
  from,
  data,
  coin,
  currency,
  fromCache = false,
) {
  const sym = CURRENCY_CONFIG[currency]?.symbol ?? "$";
  const cur = currency.toUpperCase();

  const fields = {
    "💎 Coin": `${data.name ?? coin} (${data.symbol ?? coin.toUpperCase()})`,
    "💵 Price": formatPrice(data.price, currency),
    "📊 24h Change": formatPercent(data.change24h),
    "📈 7d Change":
      data.change7d != null ? formatPercent(data.change7d) : "N/A",
    "📅 30d Change":
      data.change30d != null ? formatPercent(data.change30d) : "N/A",
    "🔺 24h High":
      data.high24h != null ? formatPrice(data.high24h, currency) : "N/A",
    "🔻 24h Low":
      data.low24h != null ? formatPrice(data.low24h, currency) : "N/A",
    "💰 Market Cap":
      data.marketCap != null ? formatAmount(data.marketCap, currency) : "N/A",
    "📦 Volume (24h)":
      data.volume24h != null ? formatAmount(data.volume24h, currency) : "N/A",
    "🏆 ATH": data.ath != null ? formatPrice(data.ath, currency) : "N/A",
    "📉 ATH Change":
      data.athChange != null ? formatPercent(data.athChange) : "N/A",
    "🏅 Rank": data.rank != null ? `#${data.rank}` : "N/A",
    "🔧 Source": data.source,
    "⏰ Updated": new Date(data.lastUpdated * 1000).toLocaleTimeString(),
  };

  if (fromCache) fields["⚡ Cache"] = "Served from cache (< 1 min)";

  await sock.sendMessage(from, {
    text: formatData(`💰 CRYPTO PRICE — ${cur}`, fields),
  });
}

// ─── Main .crypto command ─────────────────────────────────────────────────────
export async function crypto({ fullArgs, from, sock }) {
  try {
    const args = (fullArgs ?? "").toLowerCase().trim().split(/\s+/);
    let coin = args[0] ?? "";
    let currency = "usd";

    if (!coin || coin === "help") {
      return showHelp(from, sock);
    }

    if (args.length > 1 && SUPPORTED_CURRENCIES.includes(args[1])) {
      currency = args[1];
    }

    const mappedCoin = COIN_MAP[coin] ?? coin;

    await sock.sendMessage(from, {
      text: `💰 *Fetching ${mappedCoin.toUpperCase()} data...*`,
    });

    // Serve from cache if fresh. — AYOCODES
    const cacheKey = `price:${mappedCoin}:${currency}`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return sendPriceCard(sock, from, cached.data, mappedCoin, currency, true);
    }

    let data = null;
    const errors = [];

    for (const [label, fn] of [
      ["CoinGecko", () => fetchFromCoinGecko(mappedCoin, currency)],
      ["CoinPaprika", () => fetchFromCoinPaprika(mappedCoin, currency)],
      ["Binance", () => fetchFromBinance(mappedCoin, currency)],
    ]) {
      try {
        data = await fn();
        if (data?.price != null) break;
        data = null;
      } catch (e) {
        errors.push(`${label}: ${e.message}`);
      }
    }

    if (!data) {
      const suggestions = getCoinSuggestions(coin);
      const hint = suggestions.length
        ? `\n\n💡 *Did you mean:* ${suggestions.join(", ")}?`
        : "";
      console.error("❌ Crypto fetch failed:", errors);
      return sock.sendMessage(from, {
        text: formatError(
          "CRYPTO ERROR",
          `Could not fetch data for *"${coin}"*.${hint}\n\n` +
            `Type *.crypto help* for supported coins.\n\n` +
            `⚠️ Errors:\n${errors.join("\n")}`,
        ),
      });
    }

    // Cache it. — AYOCODES
    priceCache.set(cacheKey, { data, ts: Date.now() });
    return sendPriceCard(sock, from, data, mappedCoin, currency);
  } catch (err) {
    console.error("❌ crypto cmd error:", err);
    return sock.sendMessage(from, {
      text: formatError("CRYPTO ERROR", err.message),
    });
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
async function showHelp(from, sock) {
  const seen = new Set();
  const popularCoins = Object.entries(COIN_MAP)
    .filter(([, id]) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 20)
    .map(([abbr, id]) => `• ${abbr} → ${id}`)
    .join("\n");

  await sock.sendMessage(from, {
    text: formatInfo(
      "💰 CRYPTO HELP",
      "*Usage:* .crypto <coin> [currency]\n\n" +
        "*Examples:*\n" +
        "• .crypto bitcoin\n" +
        "• .crypto eth eur\n" +
        "• .crypto doge ngn\n" +
        "• .crypto sol gbp\n\n" +
        "*Supported Currencies:*\n" +
        "• USD ($) · EUR (€) · GBP (£) · JPY (¥) · INR (₹) · NGN (₦)\n\n" +
        "*Other Commands:*\n" +
        "• .cryptotop — Top 10 by market cap\n" +
        "• .cryptochart <coin> — TradingView chart link\n" +
        "• .cryptoconvert <amount> <from> <to> — Convert\n\n" +
        "*Popular Coins:*\n" +
        popularCoins,
    ),
  });
}

// ─── Top 10 ───────────────────────────────────────────────────────────────────
export async function cryptoTop({ from, sock }) {
  try {
    await sock.sendMessage(from, {
      text: "📊 *Fetching top 10 cryptocurrencies...*",
    });

    const res = await axios.get(
      "https://api.coingecko.com/api/v3/coins/markets",
      {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 10,
          page: 1,
          sparkline: false,
          price_change_percentage: "24h,7d",
        },
        timeout: 10_000,
      },
    );

    let msg =
      `╔══════════════════════════════╗\n` +
      `║  🏆 TOP 10 CRYPTOCURRENCIES  ║\n` +
      `╚══════════════════════════════╝\n\n`;

    res.data.forEach((coin, i) => {
      const rank = String(i + 1).padStart(2, " ");
      const ch24 = coin.price_change_percentage_24h ?? 0;
      const ch7d = coin.price_change_percentage_7d_in_currency ?? null;
      const icon24 = ch24 > 0 ? "📈" : ch24 < 0 ? "📉" : "➡️";
      const icon7d =
        ch7d != null ? (ch7d > 0 ? "📈" : ch7d < 0 ? "📉" : "➡️") : "";

      msg += `*${rank}. ${coin.symbol.toUpperCase()}* — ${coin.name}\n`;
      msg += `   💵 $${coin.current_price.toLocaleString()}\n`;
      msg += `   ${icon24} 24h: ${ch24 > 0 ? "+" : ""}${ch24.toFixed(2)}%`;
      if (ch7d != null)
        msg += `  ${icon7d} 7d: ${ch7d > 0 ? "+" : ""}${ch7d.toFixed(2)}%`;
      msg += `\n   💰 MCap: $${(coin.market_cap / 1e9).toFixed(2)}B\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text: msg });
  } catch (err) {
    console.error("❌ cryptoTop error:", err);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch top coins.\n${err.message}`),
    });
  }
}

// ─── Chart link ───────────────────────────────────────────────────────────────
export async function cryptoChart({ fullArgs, from, sock }) {
  const coin = fullArgs?.toLowerCase().trim();
  if (!coin) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "📈 CRYPTO CHART",
        "Usage: .cryptochart <coin>\nExample: .cryptochart bitcoin",
      ),
    });
  }

  const mappedCoin = COIN_MAP[coin] ?? coin;

  const TV_MAP = {
    bitcoin: "BTCUSD",
    ethereum: "ETHUSD",
    dogecoin: "DOGEUSD",
    solana: "SOLUSD",
    ripple: "XRPUSD",
    cardano: "ADAUSD",
    polkadot: "DOTUSD",
    polygon: "MATICUSD",
    litecoin: "LTCUSD",
    binancecoin: "BNBUSD",
    cosmos: "ATOMUSD",
    "avalanche-2": "AVAXUSD",
    fantom: "FTMUSD",
    chainlink: "LINKUSD",
    uniswap: "UNIUSD",
    tron: "TRXUSD",
    stellar: "XLMUSD",
  };

  const tvSymbol = TV_MAP[mappedCoin];
  const chartUrl = tvSymbol
    ? `https://www.tradingview.com/symbols/${tvSymbol}/`
    : `https://www.coingecko.com/en/coins/${mappedCoin}`;

  await sock.sendMessage(from, {
    text: formatSuccess(
      "📈 CHART LINK",
      `*${mappedCoin.toUpperCase()} Live Chart*\n\n` +
        `🔗 ${chartUrl}\n\n` +
        `_Open the link for live candles & indicators_\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    ),
  });
}

// ─── Convert ──────────────────────────────────────────────────────────────────
// BUG FIX: old code passed fiat like "ngn" to CoinGecko as a coin ID —
// now detects fiat vs crypto and handles each case properly. — AYOCODES
export async function cryptoConvert({ fullArgs, from, sock }) {
  const args = (fullArgs ?? "").toLowerCase().trim().split(/\s+/);

  if (args.length < 3 || !args[0]) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔄 CRYPTO CONVERT",
        "Usage: .cryptoconvert <amount> <from> <to>\n\n" +
          "*Examples:*\n" +
          "• .cryptoconvert 1 bitcoin usd\n" +
          "• .cryptoconvert 0.5 eth btc\n" +
          "• .cryptoconvert 50000 ngn bitcoin\n" +
          "• .cryptoconvert 100 usd eth\n\n" +
          "Supports all crypto coins and USD/EUR/GBP/JPY/INR/NGN",
      ),
    });
  }

  const amount = parseFloat(args[0]);
  const fromRaw = args[1];
  const toRaw = args[2];

  if (isNaN(amount) || amount <= 0) {
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Please enter a valid positive amount."),
    });
  }

  const fromIsFiat = FIAT_SET.has(fromRaw);
  const toIsFiat = FIAT_SET.has(toRaw);
  const fromMapped = COIN_MAP[fromRaw] ?? fromRaw;
  const toMapped = COIN_MAP[toRaw] ?? toRaw;

  await sock.sendMessage(from, {
    text: `🔄 *Converting ${amount} ${fromRaw.toUpperCase()} → ${toRaw.toUpperCase()}...*`,
  });

  try {
    let resultAmount;
    let rateLabel;

    if (fromIsFiat && toIsFiat) {
      // ── Fiat → Fiat ──────────────────────────────────────────────────────
      const rate = await getExchangeRate(fromRaw, toRaw);
      if (!rate) throw new Error("Could not get exchange rate");
      resultAmount = amount * rate;
      rateLabel = `1 ${fromRaw.toUpperCase()} = ${rate.toFixed(4)} ${toRaw.toUpperCase()}`;
    } else if (!fromIsFiat && toIsFiat) {
      // ── Crypto → Fiat ─────────────────────────────────────────────────────
      const data = await fetchFromCoinGecko(fromMapped, toRaw)
        .catch(() => fetchFromCoinPaprika(fromMapped, toRaw))
        .catch(() => fetchFromBinance(fromMapped, toRaw));
      if (!data?.price)
        throw new Error(`Could not fetch price for ${fromMapped}`);
      resultAmount = amount * data.price;
      rateLabel = `1 ${fromMapped.toUpperCase()} = ${formatPrice(data.price, toRaw)}`;
    } else if (fromIsFiat && !toIsFiat) {
      // ── Fiat → Crypto ─────────────────────────────────────────────────────
      const data = await fetchFromCoinGecko(toMapped, fromRaw)
        .catch(() => fetchFromCoinPaprika(toMapped, fromRaw))
        .catch(() => fetchFromBinance(toMapped, fromRaw));
      if (!data?.price)
        throw new Error(`Could not fetch price for ${toMapped}`);
      resultAmount = amount / data.price;
      rateLabel = `1 ${toMapped.toUpperCase()} = ${formatPrice(data.price, fromRaw)}`;
    } else {
      // ── Crypto → Crypto ───────────────────────────────────────────────────
      const [fromData, toData] = await Promise.all([
        fetchFromCoinGecko(fromMapped, "usd")
          .catch(() => fetchFromCoinPaprika(fromMapped, "usd"))
          .catch(() => fetchFromBinance(fromMapped, "usd")),
        fetchFromCoinGecko(toMapped, "usd")
          .catch(() => fetchFromCoinPaprika(toMapped, "usd"))
          .catch(() => fetchFromBinance(toMapped, "usd")),
      ]);
      if (!fromData?.price)
        throw new Error(`Could not fetch price for ${fromMapped}`);
      if (!toData?.price)
        throw new Error(`Could not fetch price for ${toMapped}`);
      const usdValue = amount * fromData.price;
      resultAmount = usdValue / toData.price;
      rateLabel = `1 ${fromMapped.toUpperCase()} = ${(fromData.price / toData.price).toFixed(8)} ${toMapped.toUpperCase()}`;
    }

    const fromSym = fromIsFiat ? (CURRENCY_CONFIG[fromRaw]?.symbol ?? "") : "";
    const toSym = toIsFiat ? (CURRENCY_CONFIG[toRaw]?.symbol ?? "") : "";

    const fields = {
      "🔄 From": `${fromSym}${amount} ${fromRaw.toUpperCase()}`,
      "✅ Result": `${toSym}${resultAmount.toFixed(toIsFiat ? 2 : 8)} ${toRaw.toUpperCase()}`,
      "💱 Rate": rateLabel,
      "⏰ Time": new Date().toLocaleTimeString(),
    };

    await sock.sendMessage(from, {
      text: formatData("🔄 CONVERSION RESULT", fields),
    });
  } catch (err) {
    console.error("❌ cryptoConvert error:", err);
    await sock.sendMessage(from, {
      text: formatError(
        "CONVERSION ERROR",
        `${err.message}\n\n` +
          `💡 Check the coin names and try again.\n` +
          `Example: .cryptoconvert 1 bitcoin usd`,
      ),
    });
  }
}
