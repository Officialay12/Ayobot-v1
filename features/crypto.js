// features/crypto.js - COMPLETE CRYPTOCURRENCY MODULE
// Multi-API support with real-time prices, charts, and market data

import axios from "axios";
import { ENV } from "../index.js";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

// Cache for crypto data to reduce API calls
const priceCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Popular coin mappings
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
  crypto: "crypto-com-chain",
  mana: "decentraland",
  decentraland: "decentraland",
  sand: "the-sandbox",
  sandbox: "the-sandbox",
  ape: "apecoin",
  apecoin: "apecoin",
};

// Supported currencies
const SUPPORTED_CURRENCIES = ["usd", "eur", "gbp", "jpy", "inr", "ngn"];

/**
 * Main crypto price command
 * Usage: .crypto <coin> [currency]
 * Example: .crypto bitcoin
 * Example: .crypto eth eur
 */
export async function crypto({ fullArgs, from, sock }) {
  try {
    // Parse arguments
    const args = fullArgs?.toLowerCase().split(/\s+/) || [];
    let coin = args[0] || "";
    let currency = "usd";

    // Check if second argument is a currency
    if (args.length > 1 && SUPPORTED_CURRENCIES.includes(args[1])) {
      currency = args[1];
    }

    // Check for help command
    if (coin === "help" || !coin) {
      await showHelp(from, sock);
      return;
    }

    // Map common abbreviations
    const mappedCoin = COIN_MAP[coin] || coin;

    await sock.sendMessage(from, {
      text: `💰 *Fetching ${mappedCoin.toUpperCase()} data...*`,
    });

    // Check cache first
    const cacheKey = `${mappedCoin}:${currency}`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      await sendPriceResponse(
        sock,
        from,
        cached.data,
        mappedCoin,
        currency,
        true,
      );
      return;
    }

    // Try multiple APIs in sequence
    let data = null;
    let errors = [];

    // Try CoinGecko first (best)
    try {
      data = await fetchFromCoinGecko(mappedCoin, currency);
    } catch (error) {
      errors.push(`CoinGecko: ${error.message}`);
    }

    // Try CoinPaprika second
    if (!data) {
      try {
        data = await fetchFromCoinPaprika(mappedCoin, currency);
      } catch (error) {
        errors.push(`CoinPaprika: ${error.message}`);
      }
    }

    // Try Binance third (for major coins)
    if (!data) {
      try {
        data = await fetchFromBinance(mappedCoin, currency);
      } catch (error) {
        errors.push(`Binance: ${error.message}`);
      }
    }

    if (!data) {
      // Show suggestions for similar coins
      const suggestions = await getCoinSuggestions(coin);
      const suggestionText =
        suggestions.length > 0
          ? `\n\n*Did you mean:* ${suggestions.join(", ")}?`
          : "";

      await sock.sendMessage(from, {
        text: formatError(
          "CRYPTO ERROR",
          `Could not fetch data for "${coin}".${suggestionText}\n\nTry: .crypto help for supported coins.`,
        ),
      });
      console.log("❌ Crypto errors:", errors);
      return;
    }

    // Cache the data
    priceCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    // Send response
    await sendPriceResponse(sock, from, data, mappedCoin, currency);
  } catch (error) {
    console.error("❌ Crypto error:", error);
    await sock.sendMessage(from, {
      text: formatError("CRYPTO ERROR", error.message),
    });
  }
}

/**
 * Show help information
 */
async function showHelp(from, sock) {
  const popularCoins = Object.entries(COIN_MAP)
    .slice(0, 15)
    .map(([abbr, name]) => `• ${abbr} → ${name}`)
    .join("\n");

  await sock.sendMessage(from, {
    text: formatInfo(
      "💰 CRYPTO PRICES",
      "*Usage:* .crypto <coin> [currency]\n" +
        "*Examples:*\n" +
        "• .crypto bitcoin\n" +
        "• .crypto eth eur\n" +
        "• .crypto doge gbp\n\n" +
        "*Supported Currencies:*\n" +
        "• USD, EUR, GBP, JPY, INR, NGN\n\n" +
        "*Popular Coins:*\n" +
        `${popularCoins}\n\n` +
        "*Commands:*\n" +
        "• .crypto list - Show all coins\n" +
        "• .crypto top - Show top 10 coins\n" +
        "• .crypto chart <coin> - Get price chart",
    ),
  });
}

/**
 * Fetch from CoinGecko API
 */
async function fetchFromCoinGecko(coin, currency) {
  const response = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price`,
    {
      params: {
        ids: coin,
        vs_currencies: currency,
        include_24hr_change: true,
        include_7d_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
        include_last_updated_at: true,
      },
      timeout: 5000,
    },
  );

  const data = response.data[coin];
  if (!data) throw new Error("Coin not found");

  return {
    price: data[currency],
    change24h: data[`${currency}_24h_change`],
    change7d: data[`${currency}_7d_change`],
    marketCap: data[`${currency}_market_cap`],
    volume24h: data[`${currency}_24h_vol`],
    lastUpdated: data.last_updated_at,
    source: "CoinGecko",
  };
}

/**
 * Fetch from CoinPaprika API
 */
async function fetchFromCoinPaprika(coin, currency) {
  // Map to CoinPaprika IDs
  const paprikaMap = {
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
  };

  const paprikaId = paprikaMap[coin] || `${coin}-${coin}`;

  const response = await axios.get(
    `https://api.coinpaprika.com/v1/tickers/${paprikaId}`,
    { timeout: 5000 },
  );

  const data = response.data;
  const quote = data.quotes[currency.toUpperCase()] || data.quotes.USD;

  return {
    price: quote.price,
    change24h: quote.percent_change_24h,
    change7d: quote.percent_change_7d,
    marketCap: quote.market_cap,
    volume24h: quote.volume_24h,
    lastUpdated: Date.now() / 1000,
    source: "CoinPaprika",
  };
}

/**
 * Fetch from Binance API (for major coins)
 */
async function fetchFromBinance(coin, currency) {
  // Binance uses different symbols
  const binanceMap = {
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
  };

  const symbol = binanceMap[coin];
  if (!symbol) throw new Error("Coin not supported on Binance");

  const response = await axios.get(
    `https://api.binance.com/api/v3/ticker/24hr`,
    {
      params: { symbol },
      timeout: 5000,
    },
  );

  const data = response.data;
  const price = parseFloat(data.lastPrice);
  const change24h = parseFloat(data.priceChangePercent);
  const volume = parseFloat(data.volume) * price;

  return {
    price,
    change24h,
    change7d: null,
    marketCap: null, // Binance doesn't provide market cap
    volume24h: volume,
    lastUpdated: Date.now() / 1000,
    source: "Binance",
  };
}

/**
 * Get coin suggestions for similar names
 */
async function getCoinSuggestions(input) {
  const allCoins = Object.keys(COIN_MAP);
  const suggestions = allCoins
    .filter((coin) => coin.includes(input) || input.includes(coin))
    .slice(0, 5);

  return suggestions.map((s) => COIN_MAP[s]);
}

/**
 * Send formatted price response
 */
async function sendPriceResponse(
  sock,
  from,
  data,
  coin,
  currency,
  cached = false,
) {
  const formatNumber = (num) => {
    if (!num && num !== 0) return "N/A";
    if (num > 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num > 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num > 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num > 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return num.toFixed?.(2) || num;
  };

  const formatPercent = (num) => {
    if (!num && num !== 0) return "N/A";
    const sign = num > 0 ? "📈" : num < 0 ? "📉" : "➡️";
    return `${sign} ${num.toFixed(2)}%`;
  };

  const price = data.price;
  const change24h = data.change24h;
  const change7d = data.change7d;
  const marketCap = data.marketCap;
  const volume24h = data.volume24h;
  const source = data.source;

  // Format price with proper decimal places
  let priceFormatted;
  if (price < 0.0001) {
    priceFormatted = price.toExponential(4);
  } else if (price < 1) {
    priceFormatted = price.toFixed(6);
  } else if (price < 1000) {
    priceFormatted = price.toFixed(2);
  } else {
    priceFormatted = price.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  const cryptoData = {
    "💎 Coin": coin.toUpperCase(),
    "💵 Price": `${currency.toUpperCase()} ${priceFormatted}`,
    "📊 24h Change": formatPercent(change24h),
    "📈 7d Change": change7d ? formatPercent(change7d) : "N/A",
    "💰 Market Cap": marketCap ? formatNumber(marketCap) : "N/A",
    "📦 Volume (24h)": volume24h ? formatNumber(volume24h) : "N/A",
    "🔄 Source": source,
    "⏰ Updated": new Date(data.lastUpdated * 1000).toLocaleTimeString(),
  };

  // Add cache indicator
  if (cached) {
    cryptoData["⚡"] = "Cached (1 min)";
  }

  await sock.sendMessage(from, {
    text: formatData("💰 CRYPTO PRICE", cryptoData),
  });
}

/**
 * Get top cryptocurrencies by market cap
 * Usage: .crypto top
 */
export async function cryptoTop({ from, sock }) {
  try {
    await sock.sendMessage(from, {
      text: "📊 *Fetching top cryptocurrencies...*",
    });

    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets`,
      {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 10,
          page: 1,
          sparkline: false,
        },
        timeout: 5000,
      },
    );

    const coins = response.data;
    let topList = "🏆 *TOP 10 CRYPTOCURRENCIES*\n\n";

    coins.forEach((coin, index) => {
      const rank = (index + 1).toString().padStart(2, " ");
      const change = coin.price_change_percentage_24h;
      const changeSymbol = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";

      topList += `${rank}. ${coin.symbol.toUpperCase()} - ${coin.name}\n`;
      topList += `   💵 $${coin.current_price.toLocaleString()}\n`;
      topList += `   ${changeSymbol} ${change.toFixed(2)}%\n`;
      topList += `   💰 Market Cap: $${(coin.market_cap / 1e9).toFixed(2)}B\n\n`;
    });

    await sock.sendMessage(from, {
      text: formatSuccess("📊 MARKET OVERVIEW", topList),
    });
  } catch (error) {
    console.error("❌ Crypto top error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch top cryptocurrencies."),
    });
  }
}

/**
 * Get crypto chart URL
 * Usage: .crypto chart <coin>
 */
export async function cryptoChart({ fullArgs, from, sock }) {
  const coin = fullArgs?.toLowerCase().trim();

  if (!coin) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "📈 CRYPTO CHART",
        "Usage: .crypto chart <coin>\nExample: .crypto chart bitcoin",
      ),
    });
    return;
  }

  const mappedCoin = COIN_MAP[coin] || coin;

  // Chart URLs from TradingView
  const chartUrls = {
    bitcoin: "https://www.tradingview.com/symbols/BTCUSD/",
    ethereum: "https://www.tradingview.com/symbols/ETHUSD/",
    dogecoin: "https://www.tradingview.com/symbols/DOGEUSD/",
    solana: "https://www.tradingview.com/symbols/SOLUSD/",
    ripple: "https://www.tradingview.com/symbols/XRPUSD/",
    cardano: "https://www.tradingview.com/symbols/ADAUSD/",
    polkadot: "https://www.tradingview.com/symbols/DOTUSD/",
    polygon: "https://www.tradingview.com/symbols/MATICUSD/",
    litecoin: "https://www.tradingview.com/symbols/LTCUSD/",
    binancecoin: "https://www.tradingview.com/symbols/BNBUSD/",
  };

  const chartUrl =
    chartUrls[mappedCoin] || `https://www.coingecko.com/en/coins/${mappedCoin}`;

  await sock.sendMessage(from, {
    text: formatSuccess(
      "📈 CHART LINK",
      `*${mappedCoin.toUpperCase()} Chart*\n\n🔗 ${chartUrl}\n\n_Click the link to view live chart_`,
    ),
  });
}

/**
 * Convert between cryptocurrencies
 * Usage: .crypto convert <amount> <from> <to>
 */
export async function cryptoConvert({ fullArgs, from, sock }) {
  const args = fullArgs?.toLowerCase().split(/\s+/) || [];

  if (args.length < 3) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🔄 CRYPTO CONVERT",
        "Usage: .crypto convert <amount> <from> <to>\n" +
          "Example: .crypto convert 1 bitcoin usd\n" +
          "Example: .crypto convert 1000 ngn bitcoin",
      ),
    });
    return;
  }

  const amount = parseFloat(args[0]);
  const fromCoin = args[1];
  const toCoin = args[2];

  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Please enter a valid amount."),
    });
    return;
  }

  await sock.sendMessage(from, {
    text: `🔄 *Converting ${amount} ${fromCoin.toUpperCase()} to ${toCoin.toUpperCase()}...*`,
  });

  try {
    // Get price for fromCoin in USD first
    const fromMapped = COIN_MAP[fromCoin] || fromCoin;
    const toMapped = COIN_MAP[toCoin] || toCoin;

    // Fetch both prices
    const [fromData, toData] = await Promise.all([
      fetchFromCoinGecko(fromMapped, "usd").catch(() => null),
      fetchFromCoinGecko(toMapped, "usd").catch(() => null),
    ]);

    if (!fromData || !toData) {
      throw new Error("Could not fetch prices");
    }

    const fromPrice = fromData.price;
    const toPrice = toData.price;

    // Convert
    const valueInUSD = amount * fromPrice;
    const convertedAmount = valueInUSD / toPrice;

    const result = {
      "🔄 From": `${amount} ${fromMapped.toUpperCase()}`,
      "💵 USD Value": `$${valueInUSD.toFixed(2)}`,
      "🔄 To": `${convertedAmount.toFixed(6)} ${toMapped.toUpperCase()}`,
      "💰 Rate": `1 ${fromMapped.toUpperCase()} = ${(fromPrice / toPrice).toFixed(6)} ${toMapped.toUpperCase()}`,
    };

    await sock.sendMessage(from, {
      text: formatData("🔄 CONVERSION RESULT", result),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        "Could not perform conversion. Please check the coin names.",
      ),
    });
  }
}

// Export all functions
export default {
  crypto,
  cryptoTop,
  cryptoChart,
  cryptoConvert,
};
