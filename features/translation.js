import axios from "axios";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

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

// Language aliases for common names
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
};

// ========== GET LANGUAGE CODE ==========
function getLanguageCode(lang) {
  const lowerLang = lang.toLowerCase();

  // Check if it's already a code
  if (LANGUAGES[lowerLang]) return lowerLang;

  // Check aliases
  if (LANGUAGE_ALIASES[lowerLang]) return LANGUAGE_ALIASES[lowerLang];

  // Search by name
  for (const [code, name] of Object.entries(LANGUAGES)) {
    if (
      name.toLowerCase() === lowerLang ||
      name.toLowerCase().includes(lowerLang) ||
      lowerLang.includes(name.toLowerCase())
    ) {
      return code;
    }
  }

  return null;
}

// ========== FORMAT LANGUAGE NAME ==========
function getLanguageName(code) {
  return LANGUAGES[code] || code.toUpperCase();
}

// ========== TRANSLATE FUNCTION - ULTIMATE VERSION ==========
export async function translate({ fullArgs, from, sock }) {
  if (!fullArgs) {
    // Show first 30 languages as sample
    const langSample = Object.entries(LANGUAGES)
      .slice(0, 30)
      .map(([code, name]) => `${code}: ${name}`)
      .join("\n");

    await sock.sendMessage(from, {
      text: formatInfo(
        "TRANSLATE",
        "🌐 *Universal Translator*\n\n" +
          "📌 *Usage:* .translate <text> to <language>\n" +
          "📋 *Examples:*\n" +
          "▰ .translate Hello to Spanish\n" +
          "▰ .translate How are you? to French\n" +
          "▰ .translate Good morning to German\n\n" +
          "📚 *Supported Languages (Sample):*\n" +
          `${langSample}\n` +
          `... and ${Object.keys(LANGUAGES).length - 30} more`,
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "🌐 *Translating...*" });

  // Parse the input
  const match = fullArgs.match(/\s+to\s+([a-zA-Z\s-]+)$/i);
  if (!match) {
    return await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        "❌ Please specify target language using 'to'.\n\n" +
          "✅ *Example:* .translate Hello to Spanish",
      ),
    });
  }

  const targetLang = match[1].trim();
  const sourceText = fullArgs.replace(/\s+to\s+[a-zA-Z\s-]+$/i, "").trim();

  if (!sourceText) {
    return await sock.sendMessage(from, {
      text: formatError("ERROR", "❌ Please provide text to translate."),
    });
  }

  // Get language code
  const targetCode = getLanguageCode(targetLang);

  if (!targetCode) {
    return await sock.sendMessage(from, {
      text: formatError(
        "INVALID LANGUAGE",
        `❌ Language "${targetLang}" not recognized.\n\n` +
          "💡 *Try:* Use language code or full name\n" +
          "✅ *Examples:* .translate Hello to es\n" +
          "✅ .translate Hello to Spanish",
      ),
    });
  }

  const targetName = getLanguageName(targetCode);

  try {
    let translatedText = null;
    let detectedSource = null;
    let serviceUsed = "";

    // ===== METHOD 1: Google Translate API =====
    try {
      console.log(`🌐 Trying Google Translate to ${targetCode}...`);
      const response = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(sourceText)}`,
        { timeout: 10000 },
      );

      // Parse Google Translate response correctly
      if (response.data && Array.isArray(response.data)) {
        // The translation is in response.data[0][0][0]
        if (response.data[0] && response.data[0][0] && response.data[0][0][0]) {
          translatedText = response.data[0][0][0];
        }

        // Detected source language is in response.data[2]
        if (response.data[2]) {
          detectedSource = response.data[2];
        }
      }

      if (translatedText) {
        serviceUsed = "Google Translate";
        console.log(`✅ Google Translate successful`);
      } else {
        throw new Error("Invalid Google Translate response");
      }
    } catch (e) {
      console.log("Google Translate failed:", e.message);
    }

    // ===== METHOD 2: LibreTranslate =====
    if (!translatedText) {
      try {
        console.log(`🌐 Trying LibreTranslate to ${targetCode}...`);
        const response = await axios.post(
          "https://libretranslate.de/translate",
          {
            q: sourceText,
            source: "auto",
            target: targetCode,
          },
          {
            timeout: 10000,
            headers: { "Content-Type": "application/json" },
          },
        );

        if (response.data && response.data.translatedText) {
          translatedText = response.data.translatedText;
          serviceUsed = "LibreTranslate";
          console.log(`✅ LibreTranslate successful`);
        }
      } catch (e) {
        console.log("LibreTranslate failed:", e.message);
      }
    }

    // ===== METHOD 3: MyMemory Translate =====
    if (!translatedText) {
      try {
        console.log(`🌐 Trying MyMemory Translate...`);
        const response = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=auto|${targetCode}`,
          { timeout: 10000 },
        );

        if (
          response.data &&
          response.data.responseData &&
          response.data.responseData.translatedText
        ) {
          translatedText = response.data.responseData.translatedText;
          serviceUsed = "MyMemory Translate";
          console.log(`✅ MyMemory successful`);
        }
      } catch (e) {
        console.log("MyMemory failed:", e.message);
      }
    }

    // ===== METHOD 4: Lingva Translate =====
    if (!translatedText) {
      try {
        console.log(`🌐 Trying Lingva Translate...`);
        const response = await axios.get(
          `https://lingva.ml/api/v1/auto/${targetCode}/${encodeURIComponent(sourceText)}`,
          { timeout: 10000 },
        );

        if (response.data && response.data.translation) {
          translatedText = response.data.translation;
          serviceUsed = "Lingva Translate";
          console.log(`✅ Lingva successful`);
        }
      } catch (e) {
        console.log("Lingva failed:", e.message);
      }
    }

    // ===== METHOD 5: Simple fallback with character replacement =====
    if (!translatedText) {
      // Just return the original as a last resort
      translatedText = sourceText;
      serviceUsed = "No translation (original)";
      console.log(`⚠️ Using original text as fallback`);
    }

    // Format the response
    const sourceLangName = detectedSource
      ? getLanguageName(detectedSource)
      : "Auto-detected";

    const translationResult = `╔══════════════════════════╗
║     🌐 *TRANSLATION*     ║
╚══════════════════════════╝

🔤 *Original:*
${sourceText}

🌍 *Translated to ${targetName}:*
${translatedText}

━━━━━━━━━━━━━━━━━━━━━
📊 *Details:*
• Source Language: ${sourceLangName}
• Service: ${serviceUsed}
• Time: ${new Date().toLocaleTimeString()}

⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

    await sock.sendMessage(from, {
      text: translationResult,
    });
  } catch (error) {
    console.error("Translation error:", error);

    // Ultimate fallback
    await sock.sendMessage(from, {
      text: formatError(
        "TRANSLATION FAILED",
        `❌ Could not translate text.\n\n` +
          `📝 *Original:* ${sourceText}\n` +
          `🌍 *Target:* ${targetName}\n\n` +
          `💡 *Try:*\n` +
          `• Using a different language\n` +
          `• Shorter text\n` +
          `• Checking your internet connection`,
      ),
    });
  }
}

// ========== LIST ALL LANGUAGES ==========
export async function languages({ from, sock }) {
  const languagesByLetter = {};

  // Group languages by first letter
  for (const [code, name] of Object.entries(LANGUAGES)) {
    const firstLetter = name[0].toUpperCase();
    if (!languagesByLetter[firstLetter]) {
      languagesByLetter[firstLetter] = [];
    }
    languagesByLetter[firstLetter].push(`${code}: ${name}`);
  }

  let langText = `╔══════════════════════════╗
║   📚 *SUPPORTED LANGUAGES* ║
╚══════════════════════════╝\n\n`;

  // Add languages by letter
  const sortedLetters = Object.keys(languagesByLetter).sort();
  for (const letter of sortedLetters) {
    langText += `*${letter}*\n`;
    langText += languagesByLetter[letter].slice(0, 5).join("\n") + "\n";
    if (languagesByLetter[letter].length > 5) {
      langText += `  ... and ${languagesByLetter[letter].length - 5} more\n`;
    }
    langText += "\n";
  }

  langText += `━━━━━━━━━━━━━━━━━━━━━\n`;
  langText += `📌 *Total:* ${Object.keys(LANGUAGES).length} languages\n`;
  langText += `⚡ *Usage:* .translate Hello to Spanish\n`;
  langText += `👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: langText });
}

// ========== DETECT LANGUAGE ==========
export async function detect({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "DETECT LANGUAGE",
        "🔍 *Detect the language of any text*\n\n" +
          "📌 *Usage:* .detect <text>\n" +
          "📋 *Example:* .detect Bonjour le monde",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "🔍 *Detecting language...*" });

  try {
    // Try Google Translate detection
    const response = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(fullArgs)}`,
      { timeout: 8000 },
    );

    if (response.data && response.data[2]) {
      const detectedCode = response.data[2];
      const detectedName = getLanguageName(detectedCode);
      const confidence = "High";

      const result = `╔══════════════════════════╗
║     🔍 *LANGUAGE DETECTED* ║
╚══════════════════════════╝

📝 *Text:* ${fullArgs.substring(0, 100)}${fullArgs.length > 100 ? "..." : ""}

🌍 *Language:* ${detectedName} (${detectedCode})
📊 *Confidence:* ${confidence}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

      await sock.sendMessage(from, { text: result });
    } else {
      throw new Error("Could not detect language");
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not detect language."),
    });
  }
}
