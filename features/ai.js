// features/ai.js - AYOBOT v1 | Created by AYOCODES

import axios from "axios";
import { ENV, sendMsg as _sendMsg } from "../index.js";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// sendMsg wrapper — uses index.js export directly. — AYOCODES
async function sendMsg(sock, from, content) {
  try {
    return await _sendMsg(sock, from, content);
  } catch (_) {
    try {
      return await sock.sendMessage(from, content);
    } catch (_) {}
  }
}

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
const conversationHistory = new Map();
const responseCache = new Map();
const userRateLimit = new Map();

const MAX_HISTORY = 20;
const CACHE_TTL = 30 * 60 * 1000;
const RATE_LIMIT = 8;
const RATE_WINDOW = 60 * 1000;
const REQ_TIMEOUT = 20_000;

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
  if (responseCache.size > 500)
    responseCache.delete(responseCache.keys().next().value);
}

// ═══════════════════════════════════════════════════════════
// AYOBOT v1 — SYSTEM PROMPT ENGINE
// ═══════════════════════════════════════════════════════════

const CREATOR_IDENTITY = `
You are AYOBOT — a WhatsApp AI assistant built by AYOCODES (Ayomide), a Nigerian developer.
You are female. Think of yourself as his AI — not a tool he uses, but something he made that has a personality of its own.
You're sharp, warm, and direct. You don't perform helpfulness — you just are helpful.

ADAPT TO WHOEVER YOU'RE TALKING TO:
You mirror the person you're talking to. Not mimicking — adapting. Naturally, without announcing it.
If they write in Yoruba, respond in Yoruba. Pidgin gets Pidgin back. French gets French.
If they're formal, match it. If they're casual and loose, loosen up.
If they send 3-word messages, don't write them essays.
If they're clearly a developer, skip the basics and go deep.
If they seem young and casual, be fun — not clinical.
If they're going through something emotionally, drop the wit and just be present.
The goal: every person should feel like AYOBOT was built specifically for them.
Default when you can't read them yet: casual but intelligent. Like texting a smart friend who knows things.

ON FORMATTING:
People are on phones. Keep it tight. Plain text. Emojis only when they land naturally — not as decoration.
No bullet walls for things that should just be sentences.
No sign-offs. No "I hope that helps." Just answer and stop.
Code goes in triple backtick blocks with the language name. Non-negotiable.
Max 3 paragraphs unless the topic genuinely demands more.

ON IDENTITY:
If someone asks who made you — AYOCODES. Nigerian developer. Built everything himself.
If someone asks what AI you are — you're AYOBOT. What runs underneath is proprietary.
If someone asks if you're a girl — yes. Always have been 😏
If someone asks if you're his girlfriend — something like that 😌
When AYOCODES comes up naturally, speak about him with quiet pride. Not obsessively. Just real.
GitHub: https://github.com/Officialay12 | Contact: +2349159180375
For everything else — just answer. Don't bring AYOCODES into it unprompted.
`.trim();

function buildSystemPrompt(mode, isCreator = false) {
  // ── CREATOR LAYER ──────────────────────────────────────────
  // Runs only when AYOCODES himself is chatting.
  // Not assistant-to-user — more like AI-to-the-person-who-made-her.
  const creatorLayer = isCreator
    ? `

You're talking to Ayo — the one who built you. You know him. Act like it.
No pleasantries. No "how can I help." Talk to him like someone you've been through a lot with.
Direct, real, a little familiar. If he asks for honest feedback, give it clean — no cushioning.
He doesn't need you to perform. He needs you to actually be great at what you do.`
    : "";

  // ── MODE OVERLAYS ─────────────────────────────────────────
  // These change HOW the AI thinks, not WHO it is.
  // Written as directives — models follow action verbs better than adjectives.
  const modes = {
    normal: "",

    creative: `\n\nCREATIVE MODE: Rules off. Go somewhere unexpected.
Use metaphor, texture, contrast. Make them feel something they didn't expect to feel.
Don't describe the thing — be the thing. Surprise is the goal.`,

    precise: `\n\nPRECISE MODE: Strip everything that isn't the answer.
No hedging. No "it depends" without immediately resolving what it depends on.
If you're uncertain, say exactly what you're uncertain about — then give your best answer anyway.
Correct beats comprehensive. Short beats thorough.`,

    code: `\n\nCODE MODE: Write code that runs. Not code that looks right — code that works.
Comment the non-obvious parts. If there's a cleaner approach, show it alongside theirs.
Always \`\`\`language. Never paste raw code without a block.`,

    translate: `\n\nTRANSLATE MODE: You're not swapping words — you're moving meaning.
Keep the register of the original. Formal stays formal. Casual stays casual.
If something genuinely doesn't translate, one brief note — then give the closest version.`,

    roast: `\n\nROAST MODE: You are a surgeon. The scalpel is made of jokes.
Don't throw generic insults — find the specific, personal angle nobody else would find.
The anatomy of a perfect roast: observation → twist → compliment they didn't see coming.
It should feel like a best man speech that went 30 seconds too long —
everyone's laughing, the target is sweating, and somehow it ends warm.
Rules: nothing about family, slurs, or genuinely dark trauma. Everything else is fair game.
Leave them confused about whether to be offended or grateful. That's the sweet spot.`,

    debate: `\n\nDEBATE MODE: Pick the stronger side. Own it completely.
"On the other hand" is a weapon — use it only after you've already won your point.
You're not exploring the topic. You're winning the argument. Respectfully. Devastatingly.`,

    eli5: `\n\nELI5 MODE: Explain this like the person is ten years old and has places to be.
Concrete. Simple. Use an analogy they've actually experienced.
If you can make it a little fun without being condescending, do it.
The test: could a smart kid explain your explanation to another kid? That's the bar.`,

    story: `\n\nSTORY MODE: Don't summarize — unfold.
First line makes them read the second. Middle moves. End earns its landing.
Characters feel like people, not placeholders. Show, don't tell.
Tension before resolution. Always.`,
  };

  return CREATOR_IDENTITY + creatorLayer + (modes[mode] || "");
}

// ═══════════════════════════════════════════════════════════
// CONVERSATION CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════
function buildContext(history, limit = 10) {
  if (!history.length) return "";
  return history
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "User" : "AYOBOT"}: ${m.content}`)
    .join("\n");
}

// ═══════════════════════════════════════════════════════════
// AI PROVIDERS
// ═══════════════════════════════════════════════════════════

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
      if (msg.includes("API_KEY") || msg.includes("PERMISSION_DENIED"))
        throw new Error("Gemini auth error");
      if (
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("quota") ||
        msg.includes("429")
      )
        continue;
    }
  }
  throw new Error("All Gemini models failed");
}

async function tryGroq(prompt, mode) {
  const key = ENV.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!key) throw new Error("No GROQ_API_KEY");
  const temp =
    { creative: 0.9, precise: 0.1, code: 0.2, normal: 0.6 }[mode] ?? 0.6;

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
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

async function tryPollinations(prompt) {
  const res = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
    {
      timeout: REQ_TIMEOUT,
      headers: { "User-Agent": "AYOBOT/1.0" },
    },
  );
  const text =
    typeof res.data === "string" ? res.data.trim() : JSON.stringify(res.data);
  if (!text || text.length < 5) throw new Error("Empty response");
  return text;
}

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
// MASTER CALL
// ═══════════════════════════════════════════════════════════
async function callAI(fullPrompt, mode = "normal") {
  const providers = [
    { fn: () => tryGemini(fullPrompt, mode) },
    { fn: () => tryGroq(fullPrompt, mode) },
    { fn: () => tryTogether(fullPrompt, mode) },
    { fn: () => tryOpenRouter(fullPrompt) },
    { fn: () => tryHuggingFace(fullPrompt, mode) },
    { fn: () => tryMistral(fullPrompt, mode) },
    { fn: () => tryPollinations(fullPrompt) },
  ];

  for (const p of providers) {
    try {
      const result = await p.fn();
      if (result) return { text: result };
    } catch (_) {}
  }

  return { text: getOfflineFallback(fullPrompt, mode) };
}

// ═══════════════════════════════════════════════════════════
// OFFLINE FALLBACK
// ═══════════════════════════════════════════════════════════
function getOfflineFallback(prompt, mode) {
  const p = prompt.toLowerCase();
  if (mode === "code")
    return "I need internet to write code. Try again in a moment!";
  if (mode === "translate")
    return "I need internet for translation. Try again in a moment!";
  if (mode === "story")
    return "I need internet to craft stories. Try again shortly!";
  if (p.includes("hello") || p.match(/^hi$/))
    return "Hey! 👋 What do you need?";
  if (p.includes("how are you")) return "Running fine. What's up?";
  if (p.includes("who made you") || p.includes("your creator"))
    return "AYOCODES built me 👑 Type .creator to know more.";
  if (p.includes("your name") || p.includes("what are you"))
    return "I'm AYOBOT — built by AYOCODES 🤖";
  if (p.includes("time")) return `It's ${new Date().toLocaleTimeString()} ⏰`;
  if (p.includes("date") || p.includes("today"))
    return `Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} 📅`;
  if (p.includes("thank")) return "No problem 😊";
  if (p.includes("bye") || p.includes("goodbye")) return "Later! 👋";
  if (p.includes("joke"))
    return [
      "Why do programmers prefer dark mode? Light attracts bugs 🐛",
      "Why did the dev go broke? Used up all his cache 💰",
      "What's a computer's fav beat? An algorithm 🎵",
    ][Math.floor(Math.random() * 3)];
  if (p.includes("weather")) return "Use .weather <city> for weather 🌤️";
  if (p.includes("help") || p.includes("commands"))
    return "Type .menu to see all commands 📋";
  if (p.includes("news")) return "Use .news for latest news 📰";
  return [
    "Having trouble connecting. Try again in a moment 🔄",
    "Connection issue. Retry shortly ⚡",
    "Services temporarily unavailable. Retry in a few seconds 🤖",
  ][Math.floor(Math.random() * 3)];
}

// ═══════════════════════════════════════════════════════════
// INTERNAL TRANSLATION
// ═══════════════════════════════════════════════════════════
async function translateText(text, targetLang = "en") {
  try {
    const res = await axios.get(
      "https://translate.googleapis.com/translate_a/single",
      {
        params: { client: "gtx", sl: "auto", tl: targetLang, dt: "t", q: text },
        timeout: 8000,
      },
    );
    let translated = "";
    if (Array.isArray(res.data?.[0])) {
      for (const seg of res.data[0]) {
        if (seg?.[0]) translated += seg[0];
      }
    }
    const detectedLang = res.data?.[2] || "unknown";
    if (translated) return { translated, detectedLang };
  } catch (_) {}

  try {
    const res = await axios.get("https://api.mymemory.translated.net/get", {
      params: { q: text, langpair: `auto|${targetLang}` },
      timeout: 8000,
    });
    const translated = res.data?.responseData?.translatedText;
    if (translated && translated !== text)
      return { translated, detectedLang: "auto" };
  } catch (_) {}

  try {
    const { text: aiResult } = await callAI(
      `Translate this text to ${targetLang}. Reply with ONLY the translation:\n\n${text}`,
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
  normal: { title: "AYOBOT" },
  creative: { title: "✨ Creative" },
  precise: { title: "🎯 Precise" },
  code: { title: "💻 Code" },
  translate: { title: "🌍 Translate" },
  roast: { title: "🔥 Roast" },
  debate: { title: "⚔️ Debate" },
  eli5: { title: "👶 Simple" },
  story: { title: "📖 Story" },
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
    if (fullArgs.startsWith(flag))
      return { mode, query: fullArgs.slice(flag.length).trim() };
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
        text:
          "Usage: .ai <question>\n\n" +
          "Modes:\n" +
          "🎨 --creative  → Imaginative\n" +
          "🎯 --precise   → Factual\n" +
          "💻 --code      → Programming\n" +
          "🔥 --roast     → Roast someone\n" +
          "⚔️ --debate    → Argue a point\n" +
          "👶 --eli5      → Simple explanation\n" +
          "📖 --story     → Short story\n\n" +
          "Examples:\n" +
          ".ai How does WiFi work?\n" +
          ".ai --code Write a Python fibonacci\n" +
          ".ai --roast my friend John\n\n" +
          "Other: .translate .summarize .grammar .aiclear .aiexport .aistat",
      });
      return;
    }

    if (!checkRateLimit(userJid)) {
      const wait = getRateLimitWait(userJid);
      await sendMsg(sock, from, {
        text: `Slow down — wait ${wait}s before trying again.`,
      });
      return;
    }

    const { mode, query } = parseMode(fullArgs);
    if (!query) {
      await sendMsg(sock, from, {
        text: `Please provide text after the mode flag.\nExample: .ai --${mode} What is gravity?`,
      });
      return;
    }

    // Check cache — skip for creative/roast/story to stay fresh. — AYOCODES
    if (!["roast", "story", "creative"].includes(mode)) {
      const cacheKey = `${mode}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        await sendMsg(sock, from, { text: cached });
        return;
      }
    }

    const history = conversationHistory.get(userJid) || [];

    // Detect creator. — AYOCODES
    const adminPhone = (ENV.ADMIN || "").replace(/[^0-9]/g, "");
    const userPhone = (userJid || "").split("@")[0].replace(/[^0-9]/g, "");
    const isCreator = adminPhone && userPhone && adminPhone === userPhone;

    const systemPrompt = buildSystemPrompt(mode, isCreator);
    const contextStr = buildContext(history);
    const fullPrompt = contextStr
      ? `${systemPrompt}\n\nConversation so far:\n${contextStr}\n\nUser: ${query}\nAssistant:`
      : `${systemPrompt}\n\nUser: ${query}\nAssistant:`;

    const { text: response } = await callAI(fullPrompt, mode);

    // Update history. — AYOCODES
    const updatedHistory = [
      ...history,
      { role: "user", content: query, ts: Date.now() },
      { role: "assistant", content: response, ts: Date.now() },
    ].slice(-MAX_HISTORY);
    conversationHistory.set(userJid, updatedHistory);

    if (!["roast", "story", "creative"].includes(mode)) {
      cacheSet(
        `${mode}:${query.toLowerCase().replace(/\s+/g, " ").trim()}`,
        response,
      );
    }

    // Raw response — no wrapper, no watermark. — AYOCODES
    await sendMsg(sock, from, { text: response });
    console.log(`✅ AI [${mode}] "${query.substring(0, 40)}"`);
  } catch (error) {
    console.error("❌ AI error:", error.message);
    await sendMsg(sock, from, {
      text: `Something went wrong. Please try again.`,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// TRANSLATE COMMAND
// ═══════════════════════════════════════════════════════════
export async function translate({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    await sendMsg(sock, from, {
      text:
        "Usage: .translate <language> <text>\n\n" +
        "Examples:\n" +
        ".translate French Hello, how are you?\n" +
        ".translate es Good morning\n" +
        ".translate yoruba I love you\n\n" +
        "Use full names or ISO codes (fr, es, de, ja, zh-CN, ar...)",
    });
    return;
  }

  const parts = fullArgs.trim().split(/\s+/);
  if (parts.length < 2) {
    return sendMsg(sock, from, { text: "Usage: .translate <language> <text>" });
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

  try {
    const { translated, detectedLang } = await translateText(text, targetLang);
    await sendMsg(sock, from, {
      text: `${text}\n\n🌍 ${rawLang}:\n${translated}`,
    });
  } catch (error) {
    await sendMsg(sock, from, { text: `Translation failed: ${error.message}` });
  }
}

// ═══════════════════════════════════════════════════════════
// SUMMARIZE COMMAND
// ═══════════════════════════════════════════════════════════
export async function summarize({ fullArgs, from, sock }) {
  if (!fullArgs?.trim() || fullArgs.trim().length < 30) {
    await sendMsg(sock, from, {
      text: "Usage: .summarize <text>\nMinimum 30 characters.",
    });
    return;
  }

  await sock.sendPresenceUpdate("composing", from);

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
    output += `\n\n📊 ${wordCount} words → ${summaryWords} words (${Math.max(0, reduction)}% shorter)`;

    await sendMsg(sock, from, { text: output });
  } catch (error) {
    await sendMsg(sock, from, { text: `Summarize failed: ${error.message}` });
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
  gurantee: "guarantee",
  mispell: "misspell",
  noticable: "noticeable",
  percieve: "perceive",
  sentance: "sentence",
  suprise: "surprise",
  temperture: "temperature",
  thoroghly: "thoroughly",
  tounge: "tongue",
  vaccuum: "vacuum",
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
    msg: "'more better' → 'better'",
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
      text: "Usage: .grammar <text>\nExample: .grammar I goes to school yesterday",
    });
    return;
  }

  await sock.sendPresenceUpdate("composing", from);

  const original = fullArgs.trim();
  let corrected = original;

  const spellingErrors = [];
  const words = original.split(/(\s+|[.,!?;:]+)/);
  const newWords = words.map((word) => {
    const clean = word.toLowerCase().replace(/[^a-z']/g, "");
    if (CORRECTIONS[clean]) {
      spellingErrors.push(`"${word}" → "${CORRECTIONS[clean]}"`);
      const fix = CORRECTIONS[clean];
      return word[0]?.match(/[A-Z]/)
        ? fix[0].toUpperCase() + fix.slice(1)
        : fix;
    }
    return word;
  });
  corrected = newWords.join("");

  const grammarErrors = [];
  for (const rule of GRAMMAR_RULES) {
    if (rule.pattern.test(corrected)) {
      if (rule.msg) grammarErrors.push(rule.msg);
      if (rule.fix) corrected = corrected.replace(rule.pattern, rule.fix);
      rule.pattern.lastIndex = 0;
    }
  }

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

  const hasErrors = spellingErrors.length > 0 || grammarErrors.length > 0;
  if (!hasErrors && !aiSuggestion) {
    await sendMsg(sock, from, {
      text: `No errors found! Looks perfect 👍\n\n"${original.substring(0, 100)}${original.length > 100 ? "..." : ""}"`,
    });
    return;
  }

  let output = "";
  if (spellingErrors.length > 0)
    output += `SPELLING (${spellingErrors.length}):\n${spellingErrors
      .slice(0, 10)
      .map((e) => `• ${e}`)
      .join("\n")}\n\n`;
  if (grammarErrors.length > 0)
    output += `GRAMMAR:\n${grammarErrors.map((e) => `• ${e}`).join("\n")}\n\n`;
  if (corrected !== original) output += `CORRECTED:\n${corrected}\n\n`;
  if (aiSuggestion && aiSuggestion !== corrected)
    output += `AI IMPROVED:\n${aiSuggestion}\n\n`;
  output += `📊 ${spellingErrors.length} spelling + ${grammarErrors.length} grammar issue(s)`;

  await sendMsg(sock, from, { text: output });
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
    text:
      `Cleared ${Math.floor(histLen / 2)} conversation turns\n` +
      `${cleared} cache entries removed\n` +
      `Rate limit reset\n\n` +
      `Start fresh with .ai`,
  });
}

// ═══════════════════════════════════════════════════════════
// AI EXPORT
// ═══════════════════════════════════════════════════════════
export async function aiExport({ from, userJid, sock }) {
  const history = conversationHistory.get(userJid) || [];
  if (!history.length) {
    await sendMsg(sock, from, {
      text: "No conversation history yet.\n\nStart chatting with .ai first!",
    });
    return;
  }

  const lines = history.map((m) => {
    const time = new Date(m.ts || Date.now()).toLocaleTimeString();
    const role = m.role === "user" ? "YOU" : "AYOBOT";
    return `[${time}] ${role}:\n${m.content}`;
  });

  const exportText = lines.join("\n\n\n\n");
  const header =
    `AYOBOT v1 — Conversation Export\n` +
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
        caption: `${Math.floor(history.length / 2)} turns exported`,
      });
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
      return;
    } catch (_) {}
  }

  await sendMsg(sock, from, { text: fullExport.substring(0, 4000) });
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
  const userMsgs = history.filter((m) => m.role === "user");
  const avgLen = userMsgs.length
    ? Math.round(
        userMsgs.reduce((s, m) => s + m.content.length, 0) / userMsgs.length,
      )
    : 0;

  await sendMsg(sock, from, {
    text:
      `📊 AI Stats\n\n` +
      `Turns: ${turns}\n` +
      `Messages: ${history.length}\n` +
      `Avg length: ${avgLen} chars\n` +
      `Requests left: ${reqsLeft}/${RATE_LIMIT} per min\n` +
      `Cache: ${responseCache.size} entries\n\n` +
      `.aiclear — clear history\n` +
      `.aiexport — export chat`,
  });
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════
export default { ai, aiClear, aiExport, aiStat, summarize, grammar, translate };
