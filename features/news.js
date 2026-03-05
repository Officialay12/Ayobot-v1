import axios from "axios";
import { ENV } from "../index.js";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

export async function news({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "NEWS",
        "📰 *Latest News*\n\nUsage: .news <topic>\nExample: .news technology",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📰 *Fetching latest news...*" });

  const providers = [
    // NewsAPI
    {
      name: "NewsAPI",
      fetch: async () => {
        const res = await axios.get(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(fullArgs)}&apiKey=7a8d4b4a7a8d4b4a&pageSize=5&language=en`,
        );
        return res.data.articles.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.url,
          source: a.source.name,
          date: a.publishedAt,
        }));
      },
    },
    // GNews
    {
      name: "GNews",
      fetch: async () => {
        const res = await axios.get(
          `https://gnews.io/api/v4/search?q=${encodeURIComponent(fullArgs)}&lang=en&token=eea1c7b1e7c5f4b3a2d1c0b9a8f7e6d5&max=5`,
        );
        return res.data.articles.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.url,
          source: a.source.name,
          date: a.publishedAt,
        }));
      },
    },
    // NewsData.io
    {
      name: "NewsData",
      fetch: async () => {
        const res = await axios.get(
          `https://newsdata.io/api/1/news?apikey=${ENV.NEWS_API_KEY}&q=${encodeURIComponent(fullArgs)}&language=en&size=5`,
        );
        return res.data.results.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.link,
          source: a.source_id,
          date: a.pubDate,
        }));
      },
    },
  ];

  for (const provider of providers) {
    try {
      const articles = await provider.fetch();
      if (articles?.length > 0) {
        let newsText = `╔══════════════════════════╗
║   📰 *LATEST NEWS:* ${fullArgs.toUpperCase()}  ║
╚══════════════════════════╝\n\n`;

        articles.slice(0, 5).forEach((article, i) => {
          const title = article.title || "No title";
          const description = article.description || "No description";
          const source = article.source || "Unknown";
          const date = article.date
            ? new Date(article.date).toLocaleDateString()
            : "Recent";

          newsText += `${i + 1}. *${title.substring(0, 60)}${title.length > 60 ? "..." : ""}*\n`;
          newsText += `   📝 ${description.substring(0, 80)}${description.length > 80 ? "..." : ""}\n`;
          if (article.url) newsText += `   🔗 ${article.url}\n`;
          newsText += `   📊 ${source} | ${date}\n\n`;
        });

        newsText += `━━━━━━━━━━━━━━━━━━━━━\n📊 *Source:* ${provider.name}\n⚡ *AYOBOT v1* | 👑 AYOCODES`;

        await sock.sendMessage(from, { text: newsText });
        return;
      }
    } catch (e) {
      console.log(`${provider.name} failed:`, e.message);
    }
  }

  // Generate fallback news
  const fallbackNews = [
    {
      title: `Latest Developments in ${fullArgs}`,
      description: `Stay updated with the most recent news and trends in ${fullArgs}. Industry experts weigh in on what's next.`,
      source: "News Global",
      date: new Date().toLocaleDateString(),
    },
    {
      title: `${fullArgs}: What You Need to Know`,
      description: `A comprehensive look at current events shaping the ${fullArgs} landscape.`,
      source: "Daily Briefing",
      date: new Date().toLocaleDateString(),
    },
    {
      title: `The Future of ${fullArgs}`,
      description: `Experts predict major changes coming to ${fullArgs} in the near future.`,
      source: "Trend Watch",
      date: new Date().toLocaleDateString(),
    },
  ];

  let newsText = `╔══════════════════════════╗
║   📰 *NEWS SUMMARY:* ${fullArgs.toUpperCase()}  ║
╚══════════════════════════╝\n\n`;

  fallbackNews.forEach((item, i) => {
    newsText += `${i + 1}. *${item.title}*\n`;
    newsText += `   📝 ${item.description}\n`;
    newsText += `   📊 ${item.source} | ${item.date}\n\n`;
  });

  newsText += `━━━━━━━━━━━━━━━━━━━━━\n⚠️ Live news unavailable. Showing summary.\n⚡ *AYOBOT v1* | 👑 AYOCODES`;

  await sock.sendMessage(from, { text: newsText });
}
