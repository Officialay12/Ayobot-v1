// features/translation.js - AYOBOT v1 | Created by AYOCODES

import axios from "axios";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";
import { ENV } from "../index.js";

// ========== LANGUAGE MAP ==========
const LANGUAGES = {
  af: "Afrikaans",
  sq: "Albanian",
  am: "Amharic",
  ar: "Arabic",
  hy: "Armenian",
  az: "Azerbaijani",
  eu: "Basque",
  be: "Belarusian",
  bn: "Bengali",
  bs: "Bosnian",
  bg: "Bulgarian",
  ca: "Catalan",
  ceb: "Cebuano",
  ny: "Chichewa",
  zh: "Chinese",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  co: "Corsican",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  nl: "Dutch",
  en: "English",
  eo: "Esperanto",
  et: "Estonian",
  tl: "Filipino",
  fi: "Finnish",
  fr: "French",
  fy: "Frisian",
  gl: "Galician",
  ka: "Georgian",
  de: "German",
  el: "Greek",
  gu: "Gujarati",
  ht: "Haitian Creole",
  ha: "Hausa",
  haw: "Hawaiian",
  he: "Hebrew",
  hi: "Hindi",
  hmn: "Hmong",
  hu: "Hungarian",
  is: "Icelandic",
  ig: "Igbo",
  id: "Indonesian",
  ga: "Irish",
  it: "Italian",
  ja: "Japanese",
  jw: "Javanese",
  kn: "Kannada",
  kk: "Kazakh",
  km: "Khmer",
  rw: "Kinyarwanda",
  ko: "Korean",
  ku: "Kurdish",
  ky: "Kyrgyz",
  lo: "Lao",
  la: "Latin",
  lv: "Latvian",
  lt: "Lithuanian",
  lb: "Luxembourgish",
  mk: "Macedonian",
  mg: "Malagasy",
  ms: "Malay",
  ml: "Malayalam",
  mt: "Maltese",
  mi: "Maori",
  mr: "Marathi",
  mn: "Mongolian",
  my: "Myanmar",
  ne: "Nepali",
  no: "Norwegian",
  or: "Odia",
  ps: "Pashto",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  pa: "Punjabi",
  ro: "Romanian",
  ru: "Russian",
  sm: "Samoan",
  gd: "Scots Gaelic",
  sr: "Serbian",
  st: "Sesotho",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  so: "Somali",
  es: "Spanish",
  su: "Sundanese",
  sw: "Swahili",
  sv: "Swedish",
  tg: "Tajik",
  ta: "Tamil",
  tt: "Tatar",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  tk: "Turkmen",
  uk: "Ukrainian",
  ur: "Urdu",
  ug: "Uyghur",
  uz: "Uzbek",
  vi: "Vietnamese",
  cy: "Welsh",
  xh: "Xhosa",
  yi: "Yiddish",
  yo: "Yoruba",
  zu: "Zulu",
};

const LANGUAGE_ALIASES = {
  "chinese simplified": "zh-CN",
  "chinese traditional": "zh-TW",
  chinese: "zh",
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  japanese: "ja",
  korean: "ko",
  arabic: "ar",
  hindi: "hi",
  bengali: "bn",
  urdu: "ur",
  turkish: "tr",
  dutch: "nl",
  swedish: "sv",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  polish: "pl",
  czech: "cs",
  hungarian: "hu",
  greek: "el",
  hebrew: "he",
  thai: "th",
  vietnamese: "vi",
  indonesian: "id",
  malay: "ms",
  filipino: "tl",
  tagalog: "tl",
  yoruba: "yo",
  igbo: "ig",
  hausa: "ha",
  swahili: "sw",
  somali: "so",
  amharic: "am",
  afrikaans: "af",
};

// ========== HELPERS ==========
function getLanguageCode(lang) {
  if (!lang) return null;
  const lower = lang.toLowerCase().trim();
  // Direct code match (e.g. "en", "fr")
  if (LANGUAGES[lower]) return lower;
  // Alias match (e.g. "english", "french")
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  // Partial name match
  for (const [code, name] of Object.entries(LANGUAGES)) {
    if (
      name.toLowerCase() === lower ||
      name.toLowerCase().includes(lower) ||
      lower.includes(name.toLowerCase())
    ) {
      return code;
    }
  }
  return null;
}

function getLanguageName(code) {
  return LANGUAGES[code] || (code ? code.toUpperCase() : "Unknown");
}

// ========== PARSE INPUT ==========
// Supports all these formats:
//   .translate bonjour to english
//   .translate bonjour to en
//   .translate How are you? to French
//   .translate en bonjour           (legacy: code first)
// Returns { sourceText, targetCode, targetName } or null. — AYOCODES
function parseTranslateInput(fullArgs) {
  if (!fullArgs) return null;
  const input = fullArgs.trim();

  // ── Format 1: "<text> to <language>" ─────────────────────────────────────
  // Find the LAST occurrence of " to " so sentences like
  // "I want to go to Paris to French" work correctly. — AYOCODES
  const toIdx = input.toLowerCase().lastIndexOf(" to ");
  if (toIdx !== -1) {
    const sourceText = input.slice(0, toIdx).trim();
    const targetLang = input.slice(toIdx + 4).trim();
    if (sourceText && targetLang) {
      const targetCode = getLanguageCode(targetLang);
      if (targetCode) {
        return {
          sourceText,
          targetCode,
          targetName: getLanguageName(targetCode),
        };
      }
    }
  }

  // ── Format 2: "<langcode> <text>" (e.g. ".translate en bonjour") ──────────
  const parts = input.split(/\s+/);
  if (parts.length >= 2) {
    const maybeCode = parts[0];
    const maybeTarget = getLanguageCode(maybeCode);
    if (maybeTarget) {
      const sourceText = parts.slice(1).join(" ").trim();
      if (sourceText) {
        return {
          sourceText,
          targetCode: maybeTarget,
          targetName: getLanguageName(maybeTarget),
        };
      }
    }
  }

  return null;
}

// ========== TRANSLATION ENGINE 1: GROQ (Primary) ==========
async function translateWithGroq(text, targetCode, targetName) {
  const key = ENV.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!key) throw new Error("No GROQ_API_KEY");

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content:
            `You are a professional translator. Translate the user's text to ${targetName}. ` +
            `Return ONLY the translated text — no explanation, no quotes, no preamble. ` +
            `Preserve formatting, line breaks, and emojis exactly as given.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );

  const translated = res.data?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("Empty Groq response");
  return { text: translated, service: "Groq (Llama3-70b)" };
}

// ========== TRANSLATION ENGINE 2: GEMINI ==========
async function translateWithGemini(text, targetCode, targetName) {
  const key = ENV.GEMINI_KEY || process.env.GEMINI_KEY;
  if (!key) throw new Error("No GEMINI_KEY");

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
    {
      contents: [
        {
          parts: [
            {
              text:
                `Translate the following text to ${targetName}. ` +
                `Return ONLY the translated text, nothing else:\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    },
    { timeout: 15000 },
  );

  const translated =
    res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!translated) throw new Error("Empty Gemini response");
  return { text: translated, service: "Gemini Pro" };
}

// ========== TRANSLATION ENGINE 3: OPENROUTER ==========
async function translateWithOpenRouter(text, targetCode, targetName) {
  const key = ENV.OPENROUTER_KEY || process.env.OPENROUTER_KEY;
  if (!key) throw new Error("No OPENROUTER_KEY");

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "mistralai/mistral-7b-instruct:free",
      messages: [
        {
          role: "system",
          content: `Translate to ${targetName}. Return ONLY the translation, nothing else.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 2048,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ayobot.onrender.com",
        "X-Title": "AYOBOT",
      },
      timeout: 15000,
    },
  );

  const translated = res.data?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("Empty OpenRouter response");
  return { text: translated, service: "OpenRouter (Mistral-7B)" };
}

// ========== TRANSLATION ENGINE 4: GOOGLE TRANSLATE (free, no key needed) ==========
async function translateWithGoogle(text, targetCode) {
  const res = await axios.get(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(text)}`,
    {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    },
  );

  let translated = "";
  if (Array.isArray(res.data?.[0])) {
    for (const segment of res.data[0]) {
      if (Array.isArray(segment) && segment[0]) translated += segment[0];
    }
  }

  if (!translated) throw new Error("Empty Google response");

  const detectedCode = res.data?.[2] || null;
  return {
    text: translated,
    service: "Google Translate",
    detectedSource: detectedCode,
  };
}

// ========== TRANSLATION ENGINE 5: MYMEMORY ==========
async function translateWithMyMemory(text, targetCode, detectedSourceCode) {
  // BUG FIX: MyMemory rejects "auto" as source language — must use a real
  // ISO code. We use the detected source from Google if available, else
  // default to "en" as a safe fallback. — AYOCODES
  const sourceLang = detectedSourceCode || "en";
  const langpair = `${sourceLang}|${targetCode}`;

  const res = await axios.get(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`,
    { timeout: 10000 },
  );

  const translated = res.data?.responseData?.translatedText;
  if (!translated || translated === text) throw new Error("MyMemory failed");
  return { text: translated, service: "MyMemory" };
}

// ========== TRANSLATION ENGINE 6: LINGVA ==========
async function translateWithLingva(text, targetCode) {
  const res = await axios.get(
    `https://lingva.ml/api/v1/auto/${targetCode}/${encodeURIComponent(text)}`,
    { timeout: 10000 },
  );

  const translated = res.data?.translation;
  if (!translated) throw new Error("Lingva failed");
  return { text: translated, service: "Lingva" };
}

// ========== MAIN TRANSLATE COMMAND ==========
export async function translate({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "TRANSLATE",
        "🌐 *Universal Translator*\n\n" +
          "📌 *Usage:* .translate <text> to <language>\n\n" +
          "📋 *Examples:*\n" +
          "▰ .translate bonjour to english\n" +
          "▰ .translate Hello to Spanish\n" +
          "▰ .translate How are you? to French\n" +
          "▰ .translate Good morning to German\n" +
          "▰ .translate en bonjour\n\n" +
          `📚 *${Object.keys(LANGUAGES).length} languages supported*\n` +
          "Use .languages to see the full list",
      ),
    });
    return;
  }

  // ── Parse the input ───────────────────────────────────────────────────────
  const parsed = parseTranslateInput(fullArgs);

  if (!parsed) {
    return sock.sendMessage(from, {
      text: formatError(
        "FORMAT ERROR",
        "❌ Could not understand that format.\n\n" +
          "✅ *Try:* .translate bonjour to english\n" +
          "✅ *Or:*  .translate en bonjour",
      ),
    });
  }

  const { sourceText, targetCode, targetName } = parsed;

  await sock.sendMessage(from, {
    text: `🌐 *Translating to ${targetName}...*`,
  });

  // ── Try each engine in priority order ────────────────────────────────────
  // We run Google first in detection-only mode to get the source language
  // code, which MyMemory needs (it rejects "auto"). — AYOCODES
  let detectedSourceCode = null;
  try {
    const detectRes = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sourceText)}`,
      { timeout: 6000, headers: { "User-Agent": "Mozilla/5.0" } },
    );
    detectedSourceCode = detectRes.data?.[2] || null;
  } catch (_) {}

  const engines = [
    () => translateWithGroq(sourceText, targetCode, targetName),
    () => translateWithGemini(sourceText, targetCode, targetName),
    () => translateWithOpenRouter(sourceText, targetCode, targetName),
    () => translateWithGoogle(sourceText, targetCode),
    () => translateWithMyMemory(sourceText, targetCode, detectedSourceCode),
    () => translateWithLingva(sourceText, targetCode),
  ];

  let result = null;
  let lastError = "";

  for (const engine of engines) {
    try {
      result = await engine();
      if (result?.text && result.text.trim() !== sourceText.trim()) break;
      result = null; // Same text = translation didn't happen — try next
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!result?.text) {
    return sock.sendMessage(from, {
      text: formatError(
        "TRANSLATION FAILED",
        `❌ All translation services failed.\n\n` +
          `📝 *Original:* ${sourceText}\n` +
          `🌍 *Target:* ${targetName}\n\n` +
          `⚠️ *Last error:* ${lastError}\n\n` +
          `💡 Add GROQ_API_KEY or GEMINI_KEY to .env for best results.\n` +
          `Google Translate (no key needed) may be rate-limited.`,
      ),
    });
  }

  const sourceLangName = result.detectedSource
    ? getLanguageName(result.detectedSource)
    : "Auto-detected";

  await sock.sendMessage(from, {
    text:
      `🌐 *TRANSLATION*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔤 *Original (${sourceLangName}):* ${sourceText}\n` +
      `🌍 *${targetName}:* ${result.text}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔧 ${result.service} | ⏰ ${new Date().toLocaleTimeString()}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ========== LIST LANGUAGES ==========
export async function languages({ from, sock }) {
  const grouped = {};
  for (const [code, name] of Object.entries(LANGUAGES)) {
    const letter = name[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(`${code}: ${name}`);
  }

  let text = `📚 *Supported Languages*\n` + `━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const letter of Object.keys(grouped).sort()) {
    text += `*${letter}*\n`;
    text += grouped[letter].join("\n") + "\n\n";
  }

  text +=
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 ${Object.keys(LANGUAGES).length} languages | .translate <text> to <lang>\n` +
    `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

  await sock.sendMessage(from, { text });
}

// ========== DETECT LANGUAGE ==========
export async function detect({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "DETECT LANGUAGE",
        "🔍 *Detect the language of any text*\n\n" +
          "📌 *Usage:* .detect <text>\n" +
          "📋 *Example:* .detect Bonjour le monde",
      ),
    });
  }

  await sock.sendMessage(from, { text: "🔍 *Detecting language...*" });

  try {
    const groqKey = ENV.GROQ_API_KEY || process.env.GROQ_API_KEY;
    let detectedName = null;
    let detectedCode = null;
    let service = "";

    if (groqKey) {
      try {
        const res = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            model: "llama3-70b-8192",
            messages: [
              {
                role: "system",
                content:
                  "Detect the language of the given text. " +
                  'Respond with ONLY a JSON object: {"code": "<ISO 639-1 code>", "name": "<English language name>"}. ' +
                  "Nothing else.",
              },
              { role: "user", content: fullArgs },
            ],
            temperature: 0,
            max_tokens: 50,
          },
          {
            headers: {
              Authorization: `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },
            timeout: 10000,
          },
        );

        const raw = res.data?.choices?.[0]?.message?.content?.trim() || "";
        const jsonStr = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(jsonStr);
        detectedCode = parsed.code;
        detectedName = parsed.name;
        service = "Groq (Llama3-70b)";
      } catch (_) {}
    }

    if (!detectedCode) {
      const res = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(fullArgs)}`,
        { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } },
      );
      detectedCode = res.data?.[2] || null;
      detectedName = detectedCode ? getLanguageName(detectedCode) : null;
      service = "Google Translate";
    }

    if (!detectedCode || !detectedName) throw new Error("Detection failed");

    await sock.sendMessage(from, {
      text:
        `🔍 *Language Detected*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 *Text:* ${fullArgs.substring(0, 100)}${fullArgs.length > 100 ? "..." : ""}\n` +
        `🌍 *Language:* ${detectedName} (${detectedCode})\n` +
        `🔧 *Engine:* ${service}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 .translate <text> to <lang> | ⚡ _AYOCODES_`,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not detect language. Try again."),
    });
  }
}
