import axios from "axios";
import { formatSuccess } from "../utils/formatters.js";

export async function quote({ from, sock }) {
  await sock.sendMessage(from, {
    text: "💭 *Fetching inspirational quote...*",
  });

  const apis = [
    async () => {
      const res = await axios.get("https://zenquotes.io/api/random");
      return { q: res.data[0].q, a: res.data[0].a };
    },
    async () => {
      const res = await axios.get("https://api.quotable.io/random");
      return { q: res.data.content, a: res.data.author };
    },
    async () => {
      const res = await axios.get("https://type.fit/api/quotes");
      const quotes = res.data;
      const random = quotes[Math.floor(Math.random() * quotes.length)];
      return { q: random.text, a: random.author || "Unknown" };
    },
    async () => {
      const res = await axios.get("https://api.adviceslip.com/advice");
      return { q: res.data.slip.advice, a: "Advice" };
    },
  ];

  for (const api of apis) {
    try {
      const quote = await api();
      if (quote) {
        const quoteText = `╔══════════════════════════╗
║        💭 *QUOTE*         ║
╚══════════════════════════╝

"${quote.q}"

— *${quote.a}*

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

        await sock.sendMessage(from, { text: quoteText });
        return;
      }
    } catch (e) {}
  }

  // Fallback quotes
  const fallbackQuotes = [
    {
      q: "The only way to do great work is to love what you do.",
      a: "Steve Jobs",
    },
    {
      q: "Life is what happens when you're busy making other plans.",
      a: "John Lennon",
    },
    {
      q: "The future belongs to those who believe in the beauty of their dreams.",
      a: "Eleanor Roosevelt",
    },
    {
      q: "It does not matter how slowly you go as long as you do not stop.",
      a: "Confucius",
    },
    {
      q: "Everything you've ever wanted is on the other side of fear.",
      a: "George Addair",
    },
  ];

  const random =
    fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];

  await sock.sendMessage(from, {
    text: formatSuccess("QUOTE", `"${random.q}"\n\n— *${random.a}*`),
  });
}
