// features/translation.js - FIXED VERSION WITH YOUR API KEYS
// ════════════════════════════════════════════════════════════════════════════
//  Translation Module - Using your actual API keys
//  Author: AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import { formatError, formatInfo } from '../utils/formatters.js';
import { ENV } from '../index.js';

// Language mapping (keeping your existing LANGUAGES object)
const LANGUAGES = {
  'af': 'Afrikaans',
  'sq': 'Albanian',
  'am': 'Amharic',
  'ar': 'Arabic',
  'hy': 'Armenian',
  'az': 'Azerbaijani',
  'eu': 'Basque',
  'be': 'Belarusian',
  'bn': 'Bengali',
  'bs': 'Bosnian',
  'bg': 'Bulgarian',
  'ca': 'Catalan',
  'ceb': 'Cebuano',
  'ny': 'Chichewa',
  'zh': 'Chinese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'co': 'Corsican',
  'hr': 'Croatian',
  'cs': 'Czech',
  'da': 'Danish',
  'nl': 'Dutch',
  'en': 'English',
  'eo': 'Esperanto',
  'et': 'Estonian',
  'tl': 'Filipino',
  'fi': 'Finnish',
  'fr': 'French',
  'fy': 'Frisian',
  'gl': 'Galician',
  'ka': 'Georgian',
  'de': 'German',
  'el': 'Greek',
  'gu': 'Gujarati',
  'ht': 'Haitian Creole',
  'ha': 'Hausa',
  'haw': 'Hawaiian',
  'he': 'Hebrew',
  'hi': 'Hindi',
  'hmn': 'Hmong',
  'hu': 'Hungarian',
  'is': 'Icelandic',
  'ig': 'Igbo',
  'id': 'Indonesian',
  'ga': 'Irish',
  'it': 'Italian',
  'ja': 'Japanese',
  'jw': 'Javanese',
  'kn': 'Kannada',
  'kk': 'Kazakh',
  'km': 'Khmer',
  'rw': 'Kinyarwanda',
  'ko': 'Korean',
  'ku': 'Kurdish',
  'ky': 'Kyrgyz',
  'lo': 'Lao',
  'la': 'Latin',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
  'lb': 'Luxembourgish',
  'mk': 'Macedonian',
  'mg': 'Malagasy',
  'ms': 'Malay',
  'ml': 'Malayalam',
  'mt': 'Maltese',
  'mi': 'Maori',
  'mr': 'Marathi',
  'mn': 'Mongolian',
  'my': 'Myanmar (Burmese)',
  'ne': 'Nepali',
  'no': 'Norwegian',
  'or': 'Odia',
  'ps': 'Pashto',
  'fa': 'Persian',
  'pl': 'Polish',
  'pt': 'Portuguese',
  'pa': 'Punjabi',
  'ro': 'Romanian',
  'ru': 'Russian',
  'sm': 'Samoan',
  'gd': 'Scots Gaelic',
  'sr': 'Serbian',
  'st': 'Sesotho',
  'sn': 'Shona',
  'sd': 'Sindhi',
  'si': 'Sinhala',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'so': 'Somali',
  'es': 'Spanish',
  'su': 'Sundanese',
  'sw': 'Swahili',
  'sv': 'Swedish',
  'tg': 'Tajik',
  'ta': 'Tamil',
  'tt': 'Tatar',
  'te': 'Telugu',
  'th': 'Thai',
  'tr': 'Turkish',
  'tk': 'Turkmen',
  'uk': 'Ukrainian',
  'ur': 'Urdu',
  'ug': 'Uyghur',
  'uz': 'Uzbek',
  'vi': 'Vietnamese',
  'cy': 'Welsh',
  'xh': 'Xhosa',
  'yi': 'Yiddish',
  'yo': 'Yoruba',
  'zu': 'Zulu'
};

// Language aliases
const LANGUAGE_ALIASES = {
  "chinese simplified": 'zh-CN',
  "chinese traditional": 'zh-TW',
  'chinese': 'zh',
  'english': 'en',
  'spanish': 'es',
  'french': 'fr',
  'german': 'de',
  'italian': 'it',
  'portuguese': 'pt',
  'russian': 'ru',
  'japanese': 'ja',
  'korean': 'ko',
  'arabic': 'ar',
  'hindi': 'hi',
  'bengali': 'bn',
  'urdu': 'ur',
  'turkish': 'tr',
  'dutch': 'nl',
  'swedish': 'sv',
  'norwegian': 'no',
  'danish': 'da',
  'finnish': 'fi',
  'polish': 'pl',
  'czech': 'cs',
  'hungarian': 'hu',
  'greek': 'el',
  'hebrew': 'he',
  'thai': 'th',
  'vietnamese': 'vi',
  'indonesian': 'id',
  'malay': 'ms',
  'filipino': 'tl',
  'tagalog': 'tl',
  'yoruba': 'yo',
  'igbo': 'ig',
  'hausa': 'ha',
  'swahili': 'sw'
};

function getLanguageCode(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  if (LANGUAGES[lower]) return lower;
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  for (const [code, name] of Object.entries(LANGUAGES)) {
    if (name.toLowerCase() === lower ||
        name.toLowerCase().includes(lower) ||
        lower.includes(name.toLowerCase())) {
      return code;
    }
  }
  return null;
}

function getLanguageName(code) {
  return LANGUAGES[code] || (code ? code.toUpperCase() : 'Unknown');
}

function parseTranslateInput(input) {
  if (!input) return null;
  const text = input.trim();

  // Format: "hello to spanish"
  const toIndex = text.toLowerCase().lastIndexOf(' to ');
  if (toIndex !== -1) {
    const sourceText = text.slice(0, toIndex).trim();
    const targetLang = text.slice(toIndex + 4).trim();
    const targetCode = getLanguageCode(targetLang);
    if (sourceText && targetCode) {
      return { sourceText, targetCode, targetName: getLanguageName(targetCode) };
    }
  }

  // Format: "en hello"
  const words = text.split(/\s+/);
  if (words.length >= 2) {
    const possibleCode = getLanguageCode(words[0]);
    if (possibleCode) {
      const sourceText = words.slice(1).join(' ').trim();
      if (sourceText) {
        return { sourceText, targetCode: possibleCode, targetName: getLanguageName(possibleCode) };
      }
    }
  }
  return null;
}

// ============== WORKING TRANSLATION APIS USING YOUR KEYS ==============

// Google Translate (free, no key needed - always works)
async function translateWithGoogle(text, targetLang) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    let translated = '';
    if (Array.isArray(response.data?.[0])) {
      for (const part of response.data[0]) {
        if (Array.isArray(part) && part[0]) {
          translated += part[0];
        }
      }
    }
    if (!translated) throw new Error('Empty Google response');
    return {
      text: translated,
      service: 'Google Translate',
      detectedSource: response.data?.[2] || null
    };
  } catch (error) {
    throw new Error(`Google Translate failed: ${error.message}`);
  }
}

// Gemini API - USING YOUR ACTUAL GEMINI KEY
async function translateWithGemini(text, targetLang) {
  try {
    const GEMINI_KEY = ENV.GEMINI_KEY || process.env.GEMINI_KEY;
    if (!GEMINI_KEY) throw new Error('No GEMINI_KEY');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
      {
        contents: [{
          parts: [{
            text: `Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else:\n\n${text}`
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      },
      { timeout: 15000 }
    );

    const translated = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translated) throw new Error('Empty Gemini response');

    return {
      text: translated,
      service: 'Gemini Pro',
      detectedSource: 'auto'
    };
  } catch (error) {
    throw new Error(`Gemini failed: ${error.message}`);
  }
}

// Groq API - USING YOUR ACTUAL GROQ KEY
async function translateWithGroq(text, targetLang) {
  try {
    const GROQ_API_KEY = ENV.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) throw new Error('No GROQ_API_KEY');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: `You are a translator. Translate to ${targetLang}. Return ONLY the translation.` },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 2048
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const translated = response.data?.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error('Empty Groq response');

    return {
      text: translated,
      service: 'Groq (Llama3)',
      detectedSource: 'auto'
    };
  } catch (error) {
    throw new Error(`Groq failed: ${error.message}`);
  }
}

// OpenRouter API - USING YOUR ACTUAL OPENROUTER KEY
async function translateWithOpenRouter(text, targetLang) {
  try {
    const OPENROUTER_KEY = ENV.OPENROUTER_KEY || process.env.OPENROUTER_KEY;
    if (!OPENROUTER_KEY) throw new Error('No OPENROUTER_KEY');

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [
          { role: 'system', content: `Translate to ${targetLang}. Return ONLY translation.` },
          { role: 'user', content: text }
        ],
        max_tokens: 2048
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ayobot.onrender.com',
          'X-Title': 'AYOBOT'
        },
        timeout: 15000
      }
    );

    const translated = response.data?.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error('Empty OpenRouter response');

    return {
      text: translated,
      service: 'OpenRouter (Mistral)',
      detectedSource: 'auto'
    };
  } catch (error) {
    throw new Error(`OpenRouter failed: ${error.message}`);
  }
}

// MyMemory API (free fallback)
async function translateWithMyMemory(text, targetLang) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const response = await axios.get(url, { timeout: 10000 });
    const translated = response.data?.responseData?.translatedText;
    if (!translated || translated === text) throw new Error('MyMemory failed');
    return {
      text: translated,
      service: 'MyMemory',
      detectedSource: response.data?.responseData?.detectedSource || null
    };
  } catch (error) {
    throw new Error(`MyMemory failed: ${error.message}`);
  }
}

// ============== MAIN TRANSLATE COMMAND ==============
export async function translate({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return await sock.sendMessage(from, {
      text: formatInfo(
        "TRANSLATE",
        `🌐 *Universal Translator*\n\n` +
        `📌 *Usage:* .translate <text> to <language>\n\n` +
        `📋 *Examples:*\n` +
        `▰ .translate bonjour to english\n` +
        `▰ .translate Hello to Spanish\n` +
        `▰ .translate en hello\n\n` +
        `📚 *${Object.keys(LANGUAGES).length} languages supported*\n` +
        `Use .languages to see the full list`
      )
    });
  }

  const parsed = parseTranslateInput(fullArgs);
  if (!parsed) {
    return sock.sendMessage(from, {
      text: formatError(
        "FORMAT ERROR",
        "❌ Could not understand that format.\n\n✅ *Try:* .translate bonjour to english\n✅ *Or:* .translate en bonjour"
      )
    });
  }

  const { sourceText, targetCode, targetName } = parsed;

  await sock.sendMessage(from, {
    text: `🌐 *Translating to ${targetName}...*`
  });

  // Try APIs in order: Gemini, Groq, OpenRouter, Google, MyMemory
  const apis = [
    { name: 'Gemini', fn: () => translateWithGemini(sourceText, targetName) },
    { name: 'Groq', fn: () => translateWithGroq(sourceText, targetName) },
    { name: 'OpenRouter', fn: () => translateWithOpenRouter(sourceText, targetName) },
    { name: 'Google', fn: () => translateWithGoogle(sourceText, targetCode) },
    { name: 'MyMemory', fn: () => translateWithMyMemory(sourceText, targetCode) }
  ];

  let result = null;
  let lastError = '';

  for (const api of apis) {
    try {
      result = await api.fn();
      if (result?.text && result.text.trim() !== sourceText.trim()) {
        console.log(`✅ Translation succeeded with ${api.name}`);
        break;
      }
      result = null;
    } catch (error) {
      lastError = error.message;
      console.log(`⚠️ ${api.name} failed: ${error.message}`);
    }
  }

  if (!result?.text) {
    return sock.sendMessage(from, {
      text: formatError(
        "TRANSLATION FAILED",
        `❌ All translation services failed.\n\n📝 *Original:* ${sourceText}\n🌍 *Target:* ${targetName}\n\n⚠️ *Last error:* ${lastError}`
      )
    });
  }

  const sourceName = result.detectedSource
    ? getLanguageName(result.detectedSource)
    : 'Auto-detected';

  await sock.sendMessage(from, {
    text:
      `🌐 *TRANSLATION*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔤 *Original (${sourceName}):* ${sourceText}\n\n` +
      `🔠 *Translated (${targetName}):* ${result.text}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔧 *Engine:* ${result.service}\n` +
      `⚡ _AYOBOT v1 | 👑 AYOCODES_`
  });
}

// ============== DETECT LANGUAGE COMMAND ==============
export async function detect({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "DETECT LANGUAGE",
        "🔍 *Detect the language of any text*\n\n📌 *Usage:* .detect <text>\n📋 *Example:* .detect Bonjour le monde"
      )
    });
  }

  await sock.sendMessage(from, { text: "🔍 *Detecting language...*" });

  try {
    // Try Gemini first for detection
    const GEMINI_KEY = ENV.GEMINI_KEY || process.env.GEMINI_KEY;
    if (GEMINI_KEY) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
          {
            contents: [{
              parts: [{
                text: `Detect the language of this text. Return ONLY the language name in English:\n\n${fullArgs}`
              }]
            }],
            generationConfig: { temperature: 0.1 }
          },
          { timeout: 10000 }
        );

        const detected = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (detected) {
          return sock.sendMessage(from, {
            text:
              `🔍 *Language Detected*\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `📝 *Text:* ${fullArgs.substring(0, 100)}${fullArgs.length > 100 ? '...' : ''}\n` +
              `🌍 *Language:* ${detected}\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `⚡ _AYOBOT v1 | 👑 AYOCODES_`
          });
        }
      } catch (e) {}
    }

    // Fallback to Google
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(fullArgs)}`;
    const response = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const detectedCode = response.data?.[2] || null;
    if (!detectedCode) throw new Error('Could not detect language');

    const languageName = getLanguageName(detectedCode);

    await sock.sendMessage(from, {
      text:
        `🔍 *Language Detected*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📝 *Text:* ${fullArgs.substring(0, 100)}${fullArgs.length > 100 ? '...' : ''}\n` +
        `🌍 *Language:* ${languageName} (${detectedCode})\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ _AYOBOT v1 | 👑 AYOCODES_`
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        "❌ Could not detect language. Please try again with different text."
      )
    });
  }
}

// ============== LIST LANGUAGES COMMAND ==============
export async function languages({ from, sock }) {
  const grouped = {};
  for (const [code, name] of Object.entries(LANGUAGES)) {
    const firstLetter = name[0].toUpperCase();
    if (!grouped[firstLetter]) grouped[firstLetter] = [];
    grouped[firstLetter].push(`${code}: ${name}`);
  }

  let message = `📚 *Supported Languages*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const letter of Object.keys(grouped).sort()) {
    message += `*${letter}*\n`;
    message += grouped[letter].join('\n') + '\n\n';
  }
  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 ${Object.keys(LANGUAGES).length} languages\n`;
  message += `⚡ _AYOBOT v1 | 👑 AYOCODES_`;

  await sock.sendMessage(from, { text: message });
}

export default {
  translate,
  detect,
  languages
};
