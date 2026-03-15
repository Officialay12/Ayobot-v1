import axios from "axios";
import { ENV } from "../index.js";
import { formatError, formatInfo } from "../utils/formatters.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.substring(0, max).trimEnd() + "..." : str;
}

function formatDate(dateStr) {
  if (!dateStr) return "Recent";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Recent";
  }
}

function buildNewsMessage(articles, query, providerName) {
  const header = `📰 *${query.toUpperCase()} — LATEST NEWS*\n${"─".repeat(30)}\n\n`;

  const body = articles
    .slice(0, 5)
    .map((article, i) => {
      const title = truncate(article.title, 70);
      const desc = truncate(article.description, 100);
      const source = article.source || "Unknown";
      const date = formatDate(article.date);

      let entry = `*${i + 1}. ${title}*\n`;
      if (desc) entry += `   📝 ${desc}\n`;
      entry += `   📊 ${source}  •  ${date}\n`;
      if (article.url) entry += `   🔗 ${article.url}\n`;
      return entry;
    })
    .join("\n");

  const footer = `${"─".repeat(30)}\n⚡ Via ${providerName} • AYOBOT v1 by AYOCODES 👑`;

  return header + body + footer;
}

// ── Providers ──────────────────────────────────────────────────────────────

function getProviders(query) {
  return [
    {
      name: "NewsData.io",
      fetch: async () => {
        const res = await axios.get("https://newsdata.io/api/1/news", {
          params: {
            apikey: ENV.NEWSDATA_API_KEY,
            q: query,
            language: "en",
            size: 5,
          },
          timeout: 8000,
        });

        if (!res.data?.results?.length) return [];

        return res.data.results.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.link,
          source: a.source_id,
          date: a.pubDate,
        }));
      },
    },
    {
      name: "GNews",
      fetch: async () => {
        const res = await axios.get("https://gnews.io/api/v4/search", {
          params: {
            q: query,
            lang: "en",
            token: ENV.GNEWS_API_KEY,
            max: 5,
          },
          timeout: 8000,
        });

        if (!res.data?.articles?.length) return [];

        return res.data.articles.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.url,
          source: a.source?.name,
          date: a.publishedAt,
        }));
      },
    },
    {
      name: "NewsAPI",
      fetch: async () => {
        const res = await axios.get("https://newsapi.org/v2/everything", {
          params: {
            q: query,
            apiKey: ENV.NEWSAPI_KEY,
            pageSize: 5,
            language: "en",
            sortBy: "publishedAt",
          },
          timeout: 8000,
        });

        if (!res.data?.articles?.length) return [];

        // NewsAPI returns removed articles as "[Removed]"
        return res.data.articles
          .filter((a) => a.title !== "[Removed]")
          .map((a) => ({
            title: a.title,
            description: a.description,
            url: a.url,
            source: a.source?.name,
            date: a.publishedAt,
          }));
      },
    },
  ];
}

// ── Main Handler ───────────────────────────────────────────────────────────

export async function news({ fullArgs, from, sock }) {
  // ── No input guard ───────────────────────────────────────────
  if (!fullArgs?.trim()) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "📰 NEWS",
        "Usage: .news <topic>\n\nExamples:\n  .news AI\n  .news Nigeria\n  .news crypto\n\nGet the latest headlines on anything fr 🔥",
      ),
    });
    return;
  }

  const query = fullArgs.trim();

  await sock.sendMessage(from, {
    text: `🔍 Hunting down the latest on *"${query}"*...`,
  });

  // ── Try each provider in order ───────────────────────────────
  const providers = getProviders(query);

  for (const provider of providers) {
    try {
      const articles = await provider.fetch();

      if (articles?.length > 0) {
        await sock.sendMessage(from, {
          text: buildNewsMessage(articles, query, provider.name),
        });
        return;
      }

      console.log(`[news] ${provider.name} returned no articles.`);
    } catch (err) {
      const status = err.response?.status;
      const reason =
        status === 401
          ? "Invalid API key"
          : status === 429
            ? "Rate limited"
            : status === 426
              ? "Plan upgrade required"
              : err.code === "ECONNABORTED"
                ? "Timeout"
                : err.message;

      console.warn(`[news] ${provider.name} failed — ${reason}`);
    }
  }

  // ── All providers failed ─────────────────────────────────────
  await sock.sendMessage(from, {
    text: formatError(
      "NEWS UNAVAILABLE",
      `Couldn't pull live news for *"${query}"* right now.\n\nMight be an API key issue or all sources are down.\nTry again in a bit or check your .env keys 🔑`,
    ),
  });
}
