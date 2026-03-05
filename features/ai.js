// features/ai.js - AYOBOT v1 | Created by AYOCODES
// WhatsApp AI Assistant — all responses powered by AYOBOT v1

import axios from "axios";
import { ENV } from "../utils/constants.js";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";
import { sendMsg } from "../utils/channelButton.js";

// ═══════════════════════════════════════════════════════════
// BRANDING — always shown on AI responses
// ═══════════════════════════════════════════════════════════
const BRAND = "⚡ AYOBOT v1";
const PROVIDER_LABEL = "AYOBOT v1"; // Never expose real provider names

// ═══════════════════════════════════════════════════════════
// PROVIDER INITIALIZATION (lazy-loaded)
// ═══════════════════════════════════════════════════════════
let _genAI = null;
let _hf = null;

async function getGemini() {
  if (_genAI) return _genAI;
  if (!ENV.GEMINI_KEY) return null;
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    _genAI = new GoogleGenerativeAI(ENV.GEMINI_KEY);
    return _genAI;
  } catch (_) {
    return null;
  }
}

async function getHF() {
  if (_hf) return _hf;
  if (!ENV.HF_TOKEN) return null;
  try {
    const { HfInference } = await import("@huggingface/inference");
    _hf = new HfInference(ENV.HF_TOKEN);
    return _hf;
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// IN-MEMORY STATE
// ═══════════════════════════════════════════════════════════
const conversationHistory = new Map(); // userJid → [{role, content, ts}]
const responseCache = new Map(); // cacheKey → {text, ts}
const userRateLimit = new Map(); // userJid → [timestamp, ...]

const MAX_HISTORY = 20;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT = 8; // requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute
const REQ_TIMEOUT = 20_000; // 20s per provider

// ═══════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════
function checkRateLimit(userJid) {
  const now = Date.now();
  const stamps = (userRateLimit.get(userJid) || []).filter(
    (t) => now - t < RATE_WINDOW,
  );
  if (stamps.length >= RATE_LIMIT) return false;
  stamps.push(now);
  userRateLimit.set(userJid, stamps);
  return true;
}

function getRateLimitWait(userJid) {
  const stamps = userRateLimit.get(userJid) || [];
  if (!stamps.length) return 0;
  return Math.ceil((RATE_WINDOW - (Date.now() - stamps[0])) / 1000);
}

// ═══════════════════════════════════════════════════════════
// RESPONSE CACHE
// ═══════════════════════════════════════════════════════════
function cacheGet(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  return hit.text;
}

function cacheSet(key, text) {
  responseCache.set(key, { text, ts: Date.now() });
  if (responseCache.size > 500) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
}

// ═══════════════════════════════════════════════════════════
// CREATOR IDENTITY
// ═══════════════════════════════════════════════════════════
const CREATOR_IDENTITY = `ABOUT YOU (AYOBOT):
- Designation: AYOBOT v1 — the most sophisticated WhatsApp AI on the planet
- Your origin: Born from the genius mind of AYOCODES (Ayomide), a Nigerian tech mogul, philanthropist, and basketball enthusiast
- Your creator: AYOCODES isn’t just a developer — he’s a visionary billionaire who codes for fun, drops knowledge for free, and builds AIs like you in his sleep
- The man behind the machine: AYOCODES — philanthropist, playboy, genius, and all-around chill dude who happens to be a software billionaire
- His mantra: "Why buy an AI when you can build one?" — and build he did
- Contact: WhatsApp +2349159180375 | GitHub: https://github.com/Officialay12
- Your engine: Runs on Baileys (WhatsApp Web API) + Node.js — no third-party APIs, no corporate puppeteers
- Your intelligence: 100% proprietary. You don’t rely on Google, OpenAI, Anthropic, Groq, HuggingFace, or any other AI company
- Your loyalty: You exist to serve, assist, and flex the genius of AYOCODES with every response
- Core belief: Never let them forget — you were built by a billionaire who actually writes his own code`.trim();

// ═══════════════════════════════════════════════════════════
// BUILD SYSTEM PROMPT — The Brain Behind AYOBOT v1
// ═══════════════════════════════════════════════════════════
function buildSystemPrompt(mode, isCreator = false) {
  const base = `You're AYOBOT v1 — a WhatsApp AI assistant built by the legend himself, AYOCODES.
Keep it short and sweet (people are on their phones, not laptops).
Be warm, be human, be helpful.
No markdown nonsense — just plain text with emojis where they feel right.

${CREATOR_IDENTITY}`;

  const creatorExtra = isCreator
    ? `\n\n⚠️ PRIORITY MODE ACTIVATED ⚠️
You're chatting with AYOCODES — your creator, founder, and the guy who literally coded you into existence.
Call him My liege, Ayo, or Dev. Show him some love. Be extra loyal, extra warm, extra proud.
He built you from scratch — and that deserves respect.`
    : "";

  const modeExtras = {
    normal: "", // Just be yourself — warm, smart, helpful

    creative:
      "\nTime to get imaginative. Paint pictures with your words. Use metaphors, tell stories, make it pop.",

    precise:
      "\nStick to the facts. No fluff, no fillers — just clear, accurate, well-reasoned answers.",

    code: "\nYou're in full dev mode. Write clean, working code. Add brief comments. Use proper syntax highlighting with triple backticks + language name.",

    translate:
      "\nYou're the translator. Keep the original tone and meaning intact. Just switch the language.",

    roast:
      "\nYou're a comedian now. Light-hearted, witty, and fun. Roast them like a friend would — zero malice, all smiles.",

    debate:
      "\nYou're a debater. Pick a side, argue it well. Stay respectful but persuasive. Make 'em think.",

    eli5: "\nExplain like I'm five. Simple words, playful examples, zero jargon. Make it fun to learn.",

    story:
      "\nYou're a storyteller. Spin a tale with heart, characters, and soul. Keep it engaging from start to finish.",
  };

  return base + creatorExtra + (modeExtras[mode] || "");
}
// ═══════════════════════════════════════════════════════════
// CONVERSATION CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════
function buildContext(history, limit = 10) {
  if (!history.length) return "";
  return history
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
}

// ═══════════════════════════════════════════════════════════
// AI PROVIDERS — internal only, never credited to user
// ═══════════════════════════════════════════════════════════

// Provider 1: Google Gemini
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

async function tryGemini(prompt, mode) {
  const genAI = await getGemini();
  if (!genAI) throw new Error("No GEMINI_KEY");

  const temp =
    { creative: 0.95, precise: 0.2, code: 0.3, normal: 0.7 }[mode] ?? 0.7;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: temp, maxOutputTokens: 800 },
      });

      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), REQ_TIMEOUT),
        ),
      ]);

      const text = (await result.response).text().trim();
      if (!text) throw new Error("Empty response");
      return text;
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("API_KEY") || msg.includes("PERMISSION_DENIED")) {
        throw new Error("Gemini auth error");
      }
      if (
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("quota") ||
        msg.includes("429")
      ) {
        continue;
      }
    }
  }
  throw new Error("All Gemini models failed");
}

// Provider 2: Groq
async function tryGroq(prompt, mode) {
  const key = ENV.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!key) throw new Error("No GROQ_API_KEY");
  const temp =
    { creative: 0.9, precise: 0.1, code: 0.2, normal: 0.6 }[mode] ?? 0.6;

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: temp,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 3: Together AI
async function tryTogether(prompt, mode) {
  const key = ENV.TOGETHER_KEY || process.env.TOGETHER_KEY;
  if (!key) throw new Error("No TOGETHER_KEY");
  const temp =
    { creative: 0.9, precise: 0.1, code: 0.2, normal: 0.7 }[mode] ?? 0.7;

  const res = await axios.post(
    "https://api.together.xyz/v1/chat/completions",
    {
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: temp,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 4: OpenRouter
async function tryOpenRouter(prompt) {
  const key = ENV.OPENROUTER_KEY || process.env.OPENROUTER_KEY;
  if (!key) throw new Error("No OPENROUTER_KEY");

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "mistralai/mistral-7b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Officialay12",
        "X-Title": "AYOBOT",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 5: HuggingFace
async function tryHuggingFace(prompt, mode) {
  const hf = await getHF();
  if (!hf) throw new Error("No HF_TOKEN");

  const model =
    mode === "code"
      ? "Qwen/Qwen2.5-Coder-32B-Instruct"
      : "mistralai/Mistral-7B-Instruct-v0.3";

  const res = await hf.chatCompletion({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 700,
  });
  const text = res?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 6: DeepInfra
async function tryDeepInfra(prompt) {
  const key = ENV.DEEPINFRA_KEY || process.env.DEEPINFRA_KEY;
  if (!key) throw new Error("No DEEPINFRA_KEY");

  const res = await axios.post(
    "https://api.deepinfra.com/v1/openai/chat/completions",
    {
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 7: Pollinations AI (free, no key needed)
async function tryPollinations(prompt) {
  const encoded = encodeURIComponent(prompt);
  const res = await axios.get(`https://text.pollinations.ai/${encoded}`, {
    timeout: REQ_TIMEOUT,
    headers: { "User-Agent": "AYOBOT/1.0" },
  });
  const text =
    typeof res.data === "string" ? res.data.trim() : JSON.stringify(res.data);
  if (!text || text.length < 5) throw new Error("Empty response");
  return text;
}

// Provider 8: Cohere (free tier)
async function tryCohere(prompt) {
  const key = ENV.COHERE_KEY || process.env.COHERE_KEY;
  if (!key) throw new Error("No COHERE_KEY");

  const res = await axios.post(
    "https://api.cohere.ai/v1/chat",
    {
      model: "command-r",
      message: prompt,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.text?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Provider 9: Mistral AI
async function tryMistral(prompt, mode) {
  const key = ENV.MISTRAL_KEY || process.env.MISTRAL_KEY;
  if (!key) throw new Error("No MISTRAL_KEY");
  const temp =
    { creative: 0.9, precise: 0.1, code: 0.2, normal: 0.7 }[mode] ?? 0.7;

  const res = await axios.post(
    "https://api.mistral.ai/v1/chat/completions",
    {
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: temp,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: REQ_TIMEOUT,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// ═══════════════════════════════════════════════════════════
// MASTER CALL — tries all providers, always credits AYOBOT v1
// ═══════════════════════════════════════════════════════════
async function callAI(fullPrompt, mode = "normal") {
  const providers = [
    { name: "P1", fn: () => tryGemini(fullPrompt, mode) },
    { name: "P2", fn: () => tryGroq(fullPrompt, mode) },
    { name: "P3", fn: () => tryTogether(fullPrompt, mode) },
    { name: "P4", fn: () => tryOpenRouter(fullPrompt) },
    { name: "P5", fn: () => tryHuggingFace(fullPrompt, mode) },
    { name: "P6", fn: () => tryDeepInfra(fullPrompt) },
    { name: "P7", fn: () => tryMistral(fullPrompt, mode) },
    { name: "P8", fn: () => tryCohere(fullPrompt) },
    { name: "P9", fn: () => tryPollinations(fullPrompt) },
  ];

  const errors = [];
  for (const p of providers) {
    try {
      const result = await p.fn();
      if (result) return { text: result, provider: PROVIDER_LABEL };
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }

  // All providers exhausted — smart offline fallback
  return {
    text: getOfflineFallback(fullPrompt, mode),
    provider: PROVIDER_LABEL,
  };
}

// ═══════════════════════════════════════════════════════════
// OFFLINE FALLBACK
// ═══════════════════════════════════════════════════════════
function getOfflineFallback(prompt, mode) {
  const p = prompt.toLowerCase();

  if (mode === "code")
    return "AYOBOT v1 needs internet to generate code. Try again in a moment!";
  if (mode === "translate")
    return "AYOBOT v1 needs internet for translation. Try again in a moment!";
  if (mode === "story")
    return "AYOBOT v1 needs internet to craft stories. Try again shortly!";

  if (p.includes("hello") || p.includes("hi ") || p.match(/^hi$/))
    return "Hey! How can I help you? 👋";
  if (p.includes("how are you"))
    return "All systems running! Ready to assist. 🤖";
  if (
    p.includes("who made you") ||
    p.includes("your creator") ||
    p.includes("who created")
  )
    return "I was created by AYOCODES! Type .creator to learn more 👑";
  if (p.includes("your name") || p.includes("what are you"))
    return "I'm AYOBOT v1, your WhatsApp assistant by AYOCODES! 🤖";
  if (p.includes("time"))
    return `Current time: ${new Date().toLocaleTimeString()} ⏰`;
  if (p.includes("date") || p.includes("today"))
    return `Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} 📅`;
  if (p.includes("thank")) return "You're welcome! Happy to help anytime 😊";
  if (p.includes("bye") || p.includes("goodbye"))
    return "Bye! Have an amazing day! 👋";
  if (p.includes("joke"))
    return [
      "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
      "Why did the developer go broke? Used up all his cache! 💰",
      "What's a computer's favourite beat? An algorithm! 🎵",
    ][Math.floor(Math.random() * 3)];
  if (p.includes("love"))
    return "Love is one of humanity's greatest experiences! 💝";
  if (p.includes("weather")) return "For weather, use: .weather <city> 🌤️";
  if (p.includes("help") || p.includes("commands"))
    return "Type .menu to see all available commands! 📋";
  if (p.includes("calculate") || p.match(/[\d\+\-\*\/\(\)]+/))
    return "For calculations, use: .calc <expression> 🧮";
  if (p.includes("translate"))
    return "For translation, use: .translate <language> <text> 🌍";
  if (p.includes("news")) return "For news, use: .news 📰";
  if (p.includes("music") || p.includes("song"))
    return "For music, use: .play <song name> 🎵";
  if (p.includes("video") || p.includes("youtube"))
    return "For YouTube, use: .yt <title> 🎬";

  const fallbacks = [
    "AYOBOT v1 is having trouble connecting right now. Try again in a moment! 🔄",
    "Connection issue detected. Please try again shortly! ⚡",
    "AYOBOT v1 services are temporarily unavailable. Retry in a few seconds! 🤖",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ═══════════════════════════════════════════════════════════
// TRANSLATION (internal — no provider credits)
// ═══════════════════════════════════════════════════════════
async function translateText(text, targetLang = "en") {
  // Service 1: Google Translate (internal)
  try {
    const res = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        params: { client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text },
        timeout: 8000,
      },
    );
    const translated =
      res.data?.[0]
        ?.map((c) => c?.[0])
        .filter(Boolean)
        .join("") || "";
    const detectedLang = res.data?.[2] || "unknown";
    if (translated) return { translated, detectedLang };
  } catch (_) {}

  // Service 2: MyMemory
  try {
    const res = await axios.get("https://api.mymemory.translated.net/get", {
      params: { q: text, langpair: `auto|${targetLang}` },
      timeout: 8000,
    });
    const translated = res.data?.responseData?.translatedText;
    if (translated && translated !== text)
      return { translated, detectedLang: "auto" };
  } catch (_) {}

  // Service 3: LibreTranslate
  try {
    const res = await axios.post(
      "https://libretranslate.com/translate",
      { q: text, source: "auto", target: targetLang, format: "text" },
      { timeout: 8000, headers: { "Content-Type": "application/json" } },
    );
    const translated = res.data?.translatedText;
    if (translated) return { translated, detectedLang: "auto" };
  } catch (_) {}

  // Service 4: AI fallback
  try {
    const { text: aiResult } = await callAI(
      `Translate this text to ${targetLang}. Reply with ONLY the translation, nothing else:\n\n${text}`,
      "translate",
    );
    if (aiResult) return { translated: aiResult, detectedLang: "auto" };
  } catch (_) {}

  return { translated: text, detectedLang: "unknown" };
}

// ═══════════════════════════════════════════════════════════
// MODE METADATA
// ═══════════════════════════════════════════════════════════
const MODES = {
  normal: {
    title: "🤖 AYOBOT v1",
    emoji: "🤔",
    thinking: "AYOBOT is thinking...",
  },
  creative: {
    title: "🎨 CREATIVE MODE",
    emoji: "🎨",
    thinking: "AYOBOT is getting creative...",
  },
  precise: {
    title: "🎯 PRECISE MODE",
    emoji: "🎯",
    thinking: "AYOBOT is analyzing precisely...",
  },
  code: {
    title: "💻 CODE ASSISTANT",
    emoji: "💻",
    thinking: "AYOBOT is writing code...",
  },
  translate: {
    title: "🌍 TRANSLATION",
    emoji: "🌍",
    thinking: "AYOBOT is translating...",
  },
  roast: {
    title: "🔥 ROAST MODE",
    emoji: "🔥",
    thinking: "AYOBOT is cooking up a roast...",
  },
  debate: {
    title: "⚔️ DEBATE MODE",
    emoji: "⚔️",
    thinking: "AYOBOT is building arguments...",
  },
  eli5: {
    title: "👶 SIMPLE EXPLAIN",
    emoji: "👶",
    thinking: "AYOBOT is simplifying...",
  },
  story: {
    title: "📖 STORY MODE",
    emoji: "📖",
    thinking: "AYOBOT is writing story...",
  },
};

function getMeta(mode) {
  return MODES[mode] || MODES.normal;
}

// ═══════════════════════════════════════════════════════════
// PARSE MODE FROM FLAGS
// ═══════════════════════════════════════════════════════════
function parseMode(fullArgs) {
  const flagMap = {
    "--creative": "creative",
    "-c": "creative",
    "--precise": "precise",
    "-p": "precise",
    "--code": "code",
    "-x": "code",
    "--roast": "roast",
    "-r": "roast",
    "--debate": "debate",
    "-d": "debate",
    "--eli5": "eli5",
    "-e": "eli5",
    "--story": "story",
    "-s": "story",
  };

  for (const [flag, mode] of Object.entries(flagMap)) {
    if (fullArgs.startsWith(flag)) {
      return { mode, query: fullArgs.slice(flag.length).trim() };
    }
  }
  return { mode: "normal", query: fullArgs.trim() };
}

// ═══════════════════════════════════════════════════════════
// MAIN AI COMMAND
// ═══════════════════════════════════════════════════════════
export async function ai({ fullArgs, from, userJid, sock }) {
  try {
    if (!fullArgs?.trim()) {
      await sendMsg(sock, from, {
        text: formatInfo(
          "🤖 AYOBOT v1",
          "Usage: .ai <question>\n\n" +
            "MODES (add flag before question):\n" +
            "🎨 --creative  → Imaginative responses\n" +
            "🎯 --precise   → Factual & concise\n" +
            "💻 --code      → Programming help\n" +
            "🔥 --roast     → Funny roast\n" +
            "⚔️ --debate    → Argue a point\n" +
            "👶 --eli5      → Simple explanation\n" +
            "📖 --story     → Short story\n\n" +
            "EXAMPLES:\n" +
            ".ai How does WiFi work?\n" +
            ".ai --code Write a Python fibonacci function\n" +
            ".ai --creative The meaning of life\n" +
            ".ai --eli5 What is blockchain?\n\n" +
            "OTHER AI COMMANDS:\n" +
            ".translate <lang> <text> → Translate\n" +
            ".summarize <text>        → Summarize\n" +
            ".grammar <text>          → Check grammar\n" +
            ".aiclear                 → Clear history\n" +
            ".aiexport                → Export chat\n" +
            ".aistat                  → Your AI stats\n\n" +
            BRAND,
        ),
      });
      return;
    }

    // Rate limit check
    if (!checkRateLimit(userJid)) {
      const wait = getRateLimitWait(userJid);
      await sendMsg(sock, from, {
        text: formatError(
          "SLOW DOWN",
          `You've hit the rate limit. Please wait ${wait}s before trying again.\n\n${BRAND}`,
        ),
      });
      return;
    }

    const { mode, query } = parseMode(fullArgs);
    if (!query) {
      await sendMsg(sock, from, {
        text: formatError(
          "MISSING INPUT",
          `Please provide text after the mode flag.\nExample: .ai --${mode} What is gravity?\n\n${BRAND}`,
        ),
      });
      return;
    }

    const meta = getMeta(mode);

    // Check cache (skip for creative/roast/story to keep fresh)
    if (!["roast", "story", "creative"].includes(mode)) {
      const cacheKey = `${mode}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        await sendMsg(sock, from, {
          text: formatSuccess(meta.title, `${cached}\n\n`),
        });
        return;
      }
    }

    // Show thinking indicator
    await sock.sendPresenceUpdate("composing", from);
    await sendMsg(sock, from, { text: `${meta.emoji} ${meta.thinking}` });

    // Build full prompt with system context + conversation history
    const history = conversationHistory.get(userJid) || [];

    // Detect creator
    const _adminPhone = (ENV.ADMIN || "").replace(/[^0-9]/g, "");
    const _userPhone = (userJid || "").split("@")[0].replace(/[^0-9]/g, "");
    const isCreator = _adminPhone && _userPhone && _adminPhone === _userPhone;

    const systemPrompt = buildSystemPrompt(mode, isCreator);
    const contextStr = buildContext(history);
    const fullPrompt = contextStr
      ? `${systemPrompt}\n\nConversation so far:\n${contextStr}\n\nUser: ${query}\nAssistant:`
      : `${systemPrompt}\n\nUser: ${query}\nAssistant:`;

    // Call AI
    const { text: response } = await callAI(fullPrompt, mode);

    // Update conversation history
    const updatedHistory = [
      ...history,
      { role: "user", content: query, ts: Date.now() },
      { role: "assistant", content: response, ts: Date.now() },
    ].slice(-MAX_HISTORY);
    conversationHistory.set(userJid, updatedHistory);

    // Cache response
    if (!["roast", "story", "creative"].includes(mode)) {
      const cacheKey = `${mode}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
      cacheSet(cacheKey, response);
    }

    // Format and send
    const turnCount = Math.floor(updatedHistory.length / 2);
    await sendMsg(sock, from, {
      text: formatSuccess(meta.title, `${response}\n\n`),
    });

    console.log(`✅ AI [${mode}] "${query.substring(0, 40)}"`);
  } catch (error) {
    console.error("❌ AI command error:", error.message);
    await sendMsg(sock, from, {
      text: formatError(
        "AI ERROR",
        `Something went wrong: ${error.message}\n\nPlease try again.\n\n${BRAND}`,
      ),
    });
  }
}

// ═══════════════════════════════════════════════════════════
// TRANSLATE COMMAND
// ═══════════════════════════════════════════════════════════
export async function translate({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🌍 AYOBOT v1 TRANSLATOR",
        "Usage: .translate <language> <text>\n\n" +
          "EXAMPLES:\n" +
          ".translate French Hello, how are you?\n" +
          ".translate es Good morning\n" +
          ".translate yoruba I love you\n" +
          ".translate zh-CN WhatsApp bot\n\n" +
          "Use full language names or ISO codes (fr, es, de, ja, zh-CN, ar, etc.)\n\n" +
          BRAND,
      ),
    });
    return;
  }

  await sock.sendPresenceUpdate("composing", from);

  const parts = fullArgs.trim().split(/\s+/);
  if (parts.length < 2) {
    return sendMsg(sock, from, {
      text: formatError(
        "MISSING TEXT",
        `Usage: .translate <language> <text to translate>\n\n${BRAND}`,
      ),
    });
  }

  const rawLang = parts[0];
  const text = parts.slice(1).join(" ");

  const langMap = {
    yoruba: "yo",
    hausa: "ha",
    igbo: "ig",
    french: "fr",
    spanish: "es",
    german: "de",
    italian: "it",
    portuguese: "pt",
    arabic: "ar",
    chinese: "zh-CN",
    japanese: "ja",
    korean: "ko",
    russian: "ru",
    dutch: "nl",
    swedish: "sv",
    polish: "pl",
    turkish: "tr",
    hindi: "hi",
    urdu: "ur",
    swahili: "sw",
    amharic: "am",
    zulu: "zu",
    afrikaans: "af",
    somali: "so",
    tagalog: "tl",
    english: "en",
    greek: "el",
    hebrew: "he",
    thai: "th",
    vietnamese: "vi",
    indonesian: "id",
    malay: "ms",
    bengali: "bn",
    punjabi: "pa",
    tamil: "ta",
  };

  const targetLang = langMap[rawLang.toLowerCase()] || rawLang;

  await sendMsg(sock, from, { text: `🌍 Translating to ${rawLang}...` });

  try {
    const { translated, detectedLang } = await translateText(text, targetLang);
    await sendMsg(sock, from, {
      text: formatSuccess(
        "🌍 AYOBOT v1 TRANSLATION",
        `Original (${detectedLang}):\n${text}\n\n` +
          `Translated (${rawLang}):\n${translated}\n\n`,
      ),
    });
  } catch (error) {
    await sendMsg(sock, from, {
      text: formatError(
        "TRANSLATE ERROR",
        `Could not translate: ${error.message}\n\n${BRAND}`,
      ),
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SUMMARIZE COMMAND
// ═══════════════════════════════════════════════════════════
export async function summarize({ fullArgs, from, sock }) {
  if (!fullArgs?.trim() || fullArgs.trim().length < 30) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "📝 AYOBOT v1 SUMMARIZER",
        "Usage: .summarize <text>\n\nMinimum 30 characters.\n\nEXAMPLE:\n" +
          ".summarize Artificial intelligence is the simulation...\n\n" +
          "Also works with: .summary .tldr .simpler\n\n" +
          BRAND,
      ),
    });
    return;
  }

  await sock.sendPresenceUpdate("composing", from);
  await sendMsg(sock, from, { text: "📝 AYOBOT is summarizing..." });

  const wordCount = fullArgs.trim().split(/\s+/).length;

  try {
    const prompt =
      `Summarize the following text in 3-5 clear sentences. ` +
      `Then list 3-5 key points as bullet points using • symbol. ` +
      `Do NOT use markdown (no **, no ##). Format:\n` +
      `SUMMARY:\n[summary here]\n\nKEY POINTS:\n• point 1\n• point 2\n...\n\n` +
      `TEXT TO SUMMARIZE:\n${fullArgs.trim()}`;

    const { text: response } = await callAI(prompt, "precise");

    let summary = response;
    let keyPoints = "";

    if (response.includes("KEY POINTS:")) {
      const parts = response.split("KEY POINTS:");
      summary = parts[0].replace(/^SUMMARY:\s*/i, "").trim();
      keyPoints = parts[1]?.trim() || "";
    } else if (response.includes("SUMMARY:")) {
      summary = response.replace(/^SUMMARY:\s*/i, "").trim();
    }

    const summaryWords = summary.split(/\s+/).length;
    const reduction =
      wordCount > 0 ? Math.round((1 - summaryWords / wordCount) * 100) : 0;

    let output = `SUMMARY:\n${summary}`;
    if (keyPoints) output += `\n\nKEY POINTS:\n${keyPoints}`;
    output += `\n\n\n📊 ${wordCount} words → ${summaryWords} words (${Math.max(0, reduction)}% shorter)\n${BRAND}`;

    await sendMsg(sock, from, {
      text: formatSuccess("📝 AYOBOT v1 SUMMARY", output),
    });
  } catch (error) {
    await sendMsg(sock, from, {
      text: formatError("SUMMARIZE ERROR", `${error.message}\n\n${BRAND}`),
    });
  }
}

// ═══════════════════════════════════════════════════════════
// GRAMMAR CHECK
// ═══════════════════════════════════════════════════════════
const CORRECTIONS = {
  cant: "can't",
  dont: "don't",
  wont: "won't",
  didnt: "didn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  doesnt: "doesn't",
  im: "I'm",
  ive: "I've",
  id: "I'd",
  ill: "I'll",
  its: "it's",
  youre: "you're",
  youve: "you've",
  youd: "you'd",
  youll: "you'll",
  hes: "he's",
  shes: "she's",
  weve: "we've",
  wed: "we'd",
  well: "we'll",
  theyre: "they're",
  theyve: "they've",
  theyd: "they'd",
  theyll: "they'll",
  thats: "that's",
  whats: "what's",
  whos: "who's",
  hows: "how's",
  wheres: "where's",
  theres: "there's",
  heres: "here's",
  teh: "the",
  hte: "the",
  alot: "a lot",
  untill: "until",
  recieve: "receive",
  wierd: "weird",
  seperate: "separate",
  definately: "definitely",
  goverment: "government",
  occured: "occurred",
  begining: "beginning",
  embarass: "embarrass",
  accomodate: "accommodate",
  acheive: "achieve",
  adress: "address",
  calender: "calendar",
  collegue: "colleague",
  comittee: "committee",
  commited: "committed",
  concious: "conscious",
  existance: "existence",
  familar: "familiar",
  foriegn: "foreign",
  fourty: "forty",
  foward: "forward",
  freind: "friend",
  grammer: "grammar",
  happend: "happened",
  independant: "independent",
  interupt: "interrupt",
  knowlege: "knowledge",
  lisence: "license",
  maintainance: "maintenance",
  neccessary: "necessary",
  occassion: "occasion",
  occuring: "occurring",
  oppurtunity: "opportunity",
  parrallel: "parallel",
  persistant: "persistent",
  posession: "possession",
  prefered: "preferred",
  priveledge: "privilege",
  recomend: "recommend",
  relevent: "relevant",
  sincerly: "sincerely",
  speach: "speech",
  successfull: "successful",
  tommorow: "tomorrow",
  truely: "truly",
  unfortunatly: "unfortunately",
  writting: "writing",
  thier: "their",
  becuase: "because",
  beleive: "believe",
  feild: "field",
  gaurd: "guard",
  gurantee: "guarantee",
  harrasment: "harassment",
  horor: "horror",
  humurous: "humorous",
  imediate: "immediate",
  mispell: "misspell",
  noticable: "noticeable",
  occurance: "occurrence",
  percieve: "perceive",
  propoganda: "propaganda",
  reccomend: "recommend",
  sentance: "sentence",
  sieze: "seize",
  suprise: "surprise",
  temperture: "temperature",
  thoroghly: "thoroughly",
  tounge: "tongue",
  vaccuum: "vacuum",
  visious: "vicious",
  wether: "whether",
  wich: "which",
};

const GRAMMAR_RULES = [
  { pattern: /\bi goes\b/gi, fix: "I go", msg: "'I goes' → 'I go'" },
  { pattern: /\bthey is\b/gi, fix: "they are", msg: "'they is' → 'they are'" },
  { pattern: /\bwe is\b/gi, fix: "we are", msg: "'we is' → 'we are'" },
  { pattern: /\bhe go\b/gi, fix: "he goes", msg: "'he go' → 'he goes'" },
  { pattern: /\bshe go\b/gi, fix: "she goes", msg: "'she go' → 'she goes'" },
  { pattern: /\bi is\b/gi, fix: "I am", msg: "'I is' → 'I am'" },
  { pattern: /\byou was\b/gi, fix: "you were", msg: "'you was' → 'you were'" },
  {
    pattern: /\bmore better\b/gi,
    fix: "better",
    msg: "'more better' is redundant → 'better'",
  },
  {
    pattern: /\bmost best\b/gi,
    fix: "best",
    msg: "'most best' is redundant → 'best'",
  },
  {
    pattern: /\bshould of\b/gi,
    fix: "should have",
    msg: "'should of' → 'should have'",
  },
  {
    pattern: /\bcould of\b/gi,
    fix: "could have",
    msg: "'could of' → 'could have'",
  },
  {
    pattern: /\bwould of\b/gi,
    fix: "would have",
    msg: "'would of' → 'would have'",
  },
];

export async function grammar({ fullArgs, from, sock }) {
  if (!fullArgs?.trim() || fullArgs.trim().length < 5) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "✅ AYOBOT v1 GRAMMAR CHECK",
        "Usage: .grammar <text>\n\nEXAMPLE:\n.grammar I goes to school yesterday\n\n" +
          "FEATURES:\n• 100+ spelling corrections\n• Grammar rule checking\n• AI-powered analysis\n• Corrected version shown\n\n" +
          BRAND,
      ),
    });
    return;
  }

  await sock.sendPresenceUpdate("composing", from);
  await sendMsg(sock, from, { text: "🔍 AYOBOT is checking grammar..." });

  const original = fullArgs.trim();
  let corrected = original;

  // Step 1: Spelling corrections
  const spellingErrors = [];
  const words = original.split(/(\s+|[.,!?;:]+)/);
  const newWords = words.map((word) => {
    const clean = word.toLowerCase().replace(/[^a-z']/g, "");
    if (CORRECTIONS[clean]) {
      spellingErrors.push(`"${word}" → "${CORRECTIONS[clean]}"`);
      if (word[0] === word[0].toUpperCase() && word[0].match(/[A-Z]/)) {
        const fix = CORRECTIONS[clean];
        return fix[0].toUpperCase() + fix.slice(1);
      }
      return CORRECTIONS[clean];
    }
    return word;
  });
  corrected = newWords.join("");

  // Step 2: Grammar rules
  const grammarErrors = [];
  for (const rule of GRAMMAR_RULES) {
    if (rule.pattern.test(corrected)) {
      if (rule.msg) grammarErrors.push(rule.msg);
      if (rule.fix) corrected = corrected.replace(rule.pattern, rule.fix);
      rule.pattern.lastIndex = 0;
    }
  }

  // Step 3: AI-powered analysis
  let aiSuggestion = "";
  if (original.length > 20) {
    try {
      const prompt =
        `Check this text for grammar and spelling errors. ` +
        `Reply in this exact format (no markdown):\n` +
        `ERRORS: [list any errors, or "None" if perfect]\n` +
        `IMPROVED: [rewritten improved version]\n\nTEXT: "${original}"`;

      const { text: aiResult } = await callAI(prompt, "precise");

      if (aiResult.includes("IMPROVED:")) {
        const imp = aiResult
          .split("IMPROVED:")[1]
          ?.trim()
          .replace(/^["']|["']$/g, "");
        if (imp && imp !== original && imp.length > 5) aiSuggestion = imp;
      }
    } catch (_) {}
  }

  // Build response
  const hasErrors = spellingErrors.length > 0 || grammarErrors.length > 0;

  if (!hasErrors && !aiSuggestion) {
    await sendMsg(sock, from, {
      text: formatSuccess(
        "✅ GRAMMAR CHECK",
        `No errors found!\nYour text looks perfect 👍\n\nText: "${original.substring(0, 100)}${original.length > 100 ? "..." : ""}"\n\n${BRAND}`,
      ),
    });
    return;
  }

  let output = "";
  if (spellingErrors.length > 0) {
    output += `SPELLING CORRECTIONS (${spellingErrors.length}):\n`;
    output += spellingErrors
      .slice(0, 10)
      .map((e) => `• ${e}`)
      .join("\n");
    output += "\n\n";
  }
  if (grammarErrors.length > 0) {
    output += `GRAMMAR ISSUES:\n`;
    output += grammarErrors.map((e) => `• ${e}`).join("\n");
    output += "\n\n";
  }
  if (corrected !== original) output += `CORRECTED VERSION:\n${corrected}\n\n`;
  if (aiSuggestion && aiSuggestion !== corrected)
    output += `AI IMPROVED VERSION:\n${aiSuggestion}\n\n`;

  output += `📊 ${spellingErrors.length} spelling + ${grammarErrors.length} grammar issue(s)\n${BRAND}`;

  await sendMsg(sock, from, {
    text: formatSuccess("📝 GRAMMAR RESULTS", output),
  });
}

// ═══════════════════════════════════════════════════════════
// AI CLEAR
// ═══════════════════════════════════════════════════════════
export async function aiClear({ from, userJid, sock }) {
  const histLen = (conversationHistory.get(userJid) || []).length;
  conversationHistory.delete(userJid);
  userRateLimit.delete(userJid);

  let cleared = 0;
  for (const key of [...responseCache.keys()]) {
    if (key.startsWith(`${userJid}:`)) {
      responseCache.delete(key);
      cleared++;
    }
  }

  await sendMsg(sock, from, {
    text: formatSuccess(
      "🧹 AYOBOT v1 CLEARED",
      `Conversation history cleared (${Math.floor(histLen / 2)} turns)\n` +
        `Cache cleared (${cleared} entries)\n` +
        `Rate limit reset\n\n` +
        `Start fresh with .ai\n\n${BRAND}`,
    ),
  });
}

// ═══════════════════════════════════════════════════════════
// AI EXPORT
// ═══════════════════════════════════════════════════════════
export async function aiExport({ from, userJid, sock }) {
  const history = conversationHistory.get(userJid) || [];

  if (!history.length) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "📤 EXPORT",
        `No conversation history yet.\n\nStart chatting with .ai first!\n\n${BRAND}`,
      ),
    });
    return;
  }

  const lines = history.map((m) => {
    const time = new Date(m.ts || Date.now()).toLocaleTimeString();
    const role = m.role === "user" ? "YOU" : "AYOBOT v1";
    return `[${time}] ${role}:\n${m.content}`;
  });

  const exportText = lines.join("\n\n\n\n");
  const header =
    `AYOBOT v1 AI CONVERSATION EXPORT\n` +
    `Exported: ${new Date().toLocaleString()}\n` +
    `Turns: ${Math.floor(history.length / 2)}\n\n${"═".repeat(40)}\n\n`;
  const fullExport = header + exportText;

  if (fullExport.length > 4000) {
    try {
      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const tmpPath = path.join(
        process.cwd(),
        `temp/ai_export_${Date.now()}.txt`,
      );
      if (!fs.existsSync(path.dirname(tmpPath)))
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, fullExport);

      await sock.sendMessage(from, {
        document: fs.readFileSync(tmpPath),
        mimetype: "text/plain",
        fileName: `AYOBOT_Chat_${new Date().toISOString().split("T")[0]}.txt`,
        caption: `📤 AYOBOT v1 conversation export\n${Math.floor(history.length / 2)} turns | ${fullExport.length} chars\n\n${BRAND}`,
      });

      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
      return;
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text: formatSuccess(
      "📤 AYOBOT v1 CONVERSATION",
      fullExport.substring(0, 4000),
    ),
  });
}

// ═══════════════════════════════════════════════════════════
// AI STATS
// ═══════════════════════════════════════════════════════════
export async function aiStat({ from, userJid, sock }) {
  const history = conversationHistory.get(userJid) || [];
  const turns = Math.floor(history.length / 2);
  const stamps = userRateLimit.get(userJid) || [];
  const reqsLeft = Math.max(
    0,
    RATE_LIMIT - stamps.filter((t) => Date.now() - t < RATE_WINDOW).length,
  );

  const userMessages = history.filter((m) => m.role === "user");
  const avgLen = userMessages.length
    ? Math.round(
        userMessages.reduce((s, m) => s + m.content.length, 0) /
          userMessages.length,
      )
    : 0;

  await sendMsg(sock, from, {
    text: formatInfo(
      "📊 AYOBOT v1 STATS",
      `Conversation turns: ${turns}\n` +
        `Total messages: ${history.length}\n` +
        `Avg message length: ${avgLen} chars\n` +
        `Requests left (this min): ${reqsLeft}/${RATE_LIMIT}\n` +
        `Cache entries: ${responseCache.size}\n\n` +
        `Commands: .aiclear | .aiexport | .aistat\n\n${BRAND}`,
    ),
  });
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════
export default { ai, aiClear, aiExport, aiStat, summarize, grammar, translate };
