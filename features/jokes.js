import axios from "axios";
import { formatSuccess } from "../utils/formatters.js";

// ========== JOKE ==========
export async function joke({ from, sock }) {
  await sock.sendMessage(from, { text: "😂 *Finding a funny joke...*" });

  const apis = [
    async () => {
      const res = await axios.get(
        "https://v2.jokeapi.dev/joke/Any?type=twopart",
      );
      return { setup: res.data.setup, punchline: res.data.delivery };
    },
    async () => {
      const res = await axios.get(
        "https://official-joke-api.appspot.com/random_joke",
      );
      return { setup: res.data.setup, punchline: res.data.punchline };
    },
    async () => {
      const res = await axios.get(
        "https://geek-jokes.sameerkumar.website/api?format=json",
      );
      return { setup: "Joke:", punchline: res.data.joke };
    },
  ];

  for (const api of apis) {
    try {
      const joke = await api();
      if (joke) {
        const jokeText = `╔══════════════════════════╗
║        😂 *JOKE*          ║
╚══════════════════════════╝

❓ ${joke.setup}

😂 ${joke.punchline}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Written by AYOCODES`;

        await sock.sendMessage(from, { text: jokeText });
        return;
      }
    } catch (e) {}
  }

  // Fallback
  const fallbackJokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "What do you call a fake noodle? An impasta!",
    "Why did the scarecrow win an award? He was outstanding in his field!",
    "How does a penguin build its house? Igloos it together!",
    "Why don't eggs tell jokes? They'd crack each other up!",
  ];

  await sock.sendMessage(from, {
    text: formatSuccess(
      "JOKE",
      fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)],
    ),
  });
}

// ========== ROAST ==========
export async function roast({ fullArgs, from, sock }) {
  const roasts = [
    "You're not stupid; you just have bad luck thinking.",
    "You're proof that evolution can go in reverse.",
    "You bring everyone a lot of joy, when you leave.",
    "I'd agree with you, but then we'd both be wrong.",
    "You're like a cloud. When you disappear, it's a beautiful day.",
    "Your secrets are always safe with you. You never remember them.",
    "You're not funny, but your life is a joke.",
    "You have the perfect face for radio.",
    "You're not dumb. You just have bad luck at thinking.",
    "If I wanted to hear from an idiot, I'd watch your TikToks.",
    "You're a gray sprinkle on a rainbow donut.",
    "Your brain is like a web browser - 15 tabs open and all of them are frozen.",
    "You're the reason they put instructions on shampoo bottles.",
    "If laughter is medicine, your face is curing world hunger.",
  ];

  const roast = roasts[Math.floor(Math.random() * roasts.length)];
  let mention = "";
  let mentions = [];

  if (fullArgs) {
    const phone = fullArgs.replace(/[^0-9]/g, "");
    if (phone.length >= 10) {
      mention = `@${phone}`;
      mentions = [`${phone}@s.whatsapp.net`];
    }
  }

  const roastText = `╔══════════════════════════╗
║        🔥 *ROAST*         ║
╚══════════════════════════╝

${mention ? `${mention}\n\n` : ""}"${roast}"

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Written by AYOCODES`;

  await sock.sendMessage(from, {
    text: roastText,
    mentions,
  });
}

// ========== PICKUP LINE ==========
export async function pickupLine({ from, sock }) {
  const lines = [
    "Are you a magician? Because whenever I look at you, everyone else disappears.",
    "Do you have a map? I keep getting lost in your eyes.",
    "Is your name Google? Because you have everything I'm searching for.",
    "Are you made of copper and tellurium? Because you're Cu-Te.",
    "Do you believe in love at first sight, or should I walk by again?",
    "If you were a vegetable, you'd be a cute-cumber.",
    "Are you a parking ticket? Because you've got FINE written all over you.",
    "Is your dad a baker? Because you're a cutie pie.",
    "Do you have a Band-Aid? Because I just scraped my knee falling for you.",
    "Are you Wi-Fi? Because I'm feeling a connection.",
    "Are you a campfire? Because you're hot and I want to be near you.",
    "Is your name Ariel? Because we mermaid for each other.",
    "Are you a time traveler? Because I see you in my future.",
    "Do you have a name, or can I call you mine?",
  ];

  const line = lines[Math.floor(Math.random() * lines.length)];

  const pickupText = `╔══════════════════════════╗
║        💘 *PICKUP LINE*    ║
╚══════════════════════════╝

"${line}"

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Written by AYOCODES`;

  await sock.sendMessage(from, { text: pickupText });
}
