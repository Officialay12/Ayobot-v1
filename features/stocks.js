import axios from "axios";
import { ENV } from "../index.js";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

export async function stock({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo("STOCK", "Usage: .stock <symbol>\nExample: .stock AAPL"),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📈 *Fetching stock data...*" });

  const symbol = fullArgs.toUpperCase();

  try {
    // Try Alpha Vantage
    const res = await axios.get(`https://www.alphavantage.co/query`, {
      params: {
        function: "GLOBAL_QUOTE",
        symbol: symbol,
        apikey: ENV.ALPHA_VANTAGE_KEY,
      },
    });

    const quote = res.data["Global Quote"];

    if (quote && Object.keys(quote).length > 0) {
      const change = parseFloat(quote["09. change"]);
      const changePercent = quote["10. change percent"].replace("%", "");

      const stockData = {
        "📊 Symbol": symbol,
        "💵 Price": `$${parseFloat(quote["05. price"]).toFixed(2)}`,
        "📈 Change": `${change > 0 ? "+" : ""}${change.toFixed(2)} (${changePercent}%)`,
        "📉 Open": `$${parseFloat(quote["02. open"]).toFixed(2)}`,
        "📊 High": `$${parseFloat(quote["03. high"]).toFixed(2)}`,
        "📉 Low": `$${parseFloat(quote["04. low"]).toFixed(2)}`,
        "📊 Volume": parseInt(quote["06. volume"]).toLocaleString(),
        "📅 Previous Close": `$${parseFloat(quote["08. previous close"]).toFixed(2)}`,
      };

      await sock.sendMessage(from, {
        text: formatData("STOCK DATA", stockData),
      });
      return;
    }

    throw new Error("No data");
  } catch {
    // Try Yahoo Finance as fallback
    try {
      const res = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
      );
      const data = res.data.chart.result[0];
      const meta = data.meta;
      const price = meta.regularMarketPrice;
      const previousClose = meta.previousClose;
      const change = price - previousClose;
      const changePercent = (change / previousClose) * 100;

      const stockData = {
        "📊 Symbol": symbol,
        "💵 Price": `$${price.toFixed(2)}`,
        "📈 Change": `${change > 0 ? "+" : ""}${change.toFixed(2)} (${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%)`,
        "📊 Volume":
          data.indicators.quote[0].volume[0]?.toLocaleString() || "N/A",
        "📊 Market Cap": meta.marketCap
          ? `$${(meta.marketCap / 1e9).toFixed(2)}B`
          : "N/A",
      };

      await sock.sendMessage(from, {
        text: formatData("STOCK DATA", stockData),
      });
    } catch {
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          `Could not fetch data for symbol "${symbol}"`,
        ),
      });
    }
  }
}
