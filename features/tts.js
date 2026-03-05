// features/tts.js - COMPLETE TEXT TO SPEECH MODULE
// Uses gtts for reliable TTS functionality

import gtts from "gtts";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Voice mapping for different languages
const VOICE_MAP = {
  // English variants
  en: "en",
  english: "en",
  us: "en",
  uk: "en",
  au: "en",

  // European languages
  fr: "fr",
  french: "fr",
  es: "es",
  spanish: "es",
  de: "de",
  german: "de",
  it: "it",
  italian: "it",
  pt: "pt",
  portuguese: "pt",
  nl: "nl",
  dutch: "nl",
  ru: "ru",
  russian: "ru",

  // Asian languages
  ja: "ja",
  japanese: "ja",
  ko: "ko",
  korean: "ko",
  zh: "zh-cn",
  chinese: "zh-cn",
  hi: "hi",
  hindi: "hi",
  ar: "ar",
  arabic: "ar",

  // Default
  default: "en",
};

/**
 * Main TTS command - converts text to speech
 * Usage: .tts <text>
 */
export async function tts({ fullArgs, from, sock }) {
  try {
    // Check if text is provided
    if (!fullArgs || fullArgs.trim().length === 0) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🔊 TEXT TO SPEECH",
          "*Usage:* .tts <text>\n" +
            "*Example:* .tts Hello world\n\n" +
            "*Options:*\n" +
            "• .tts <lang> <text> - Specify language\n" +
            "• .tts voices - List available languages\n\n" +
            "*Examples:*\n" +
            "• .tts fr Bonjour le monde\n" +
            "• .tts es Hola mundo\n" +
            "• .tts voices",
        ),
      });
      return;
    }

    // Show voices list
    if (fullArgs.toLowerCase() === "voices") {
      const voicesList = `╔══════════════════════════╗
║   🎤 *AVAILABLE VOICES*  ║
╚══════════════════════════╝

*English:* en (default)
*French:* fr
*Spanish:* es
*German:* de
*Italian:* it
*Portuguese:* pt
*Dutch:* nl
*Russian:* ru
*Japanese:* ja
*Korean:* ko
*Chinese:* zh-cn
*Hindi:* hi
*Arabic:* ar

*Usage:* .tts <lang> <text>
*Example:* .tts fr Bonjour le monde

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 *AYOCODES*`;

      await sock.sendMessage(from, { text: voicesList });
      return;
    }

    // Show typing indicator
    await sock.sendPresenceUpdate("composing", from);

    // Parse language and text
    let lang = "en";
    let text = fullArgs;

    const parts = fullArgs.split(" ");
    const firstPart = parts[0].toLowerCase();

    if (VOICE_MAP[firstPart]) {
      lang = VOICE_MAP[firstPart];
      text = parts.slice(1).join(" ");

      if (!text || text.trim().length === 0) {
        await sock.sendMessage(from, {
          text: formatError(
            "TTS ERROR",
            `Please provide text after the language code.\nExample: .tts ${firstPart} Hello world`,
          ),
        });
        return;
      }
    }

    await sock.sendMessage(from, {
      text: `🔊 *Generating speech...*\n🌐 Language: ${lang}\n📝 Text: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
    });

    // Generate speech using gtts
    const audioBuffer = await generateSpeech(text, lang);

    // Send as audio
    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: false, // Set to true for voice note
      caption: `🔊 *Text to Speech*\n🌐 ${lang}\n📝 ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`,
    });

    console.log(`✅ TTS generated: "${text.substring(0, 30)}..." in ${lang}`);
  } catch (error) {
    console.error("❌ TTS error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "TTS ERROR",
        `Could not generate speech: ${error.message}\n\nPlease try again with different text.`,
      ),
    });
  }
}

/**
 * Generate speech from text using gtts
 * @param {string} text - Text to convert to speech
 * @param {string} lang - Language code
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function generateSpeech(text, lang = "en") {
  return new Promise((resolve, reject) => {
    try {
      // Create unique filename
      const filename = path.join(
        TEMP_DIR,
        `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`,
      );

      // Initialize gtts
      const speech = new gtts(text, lang);

      // Save audio file
      speech.save(filename, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Read the file
        fs.readFile(filename, (readErr, data) => {
          // Clean up temp file
          fs.unlink(filename, () => {});

          if (readErr) {
            reject(readErr);
          } else {
            resolve(data);
          }
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * TTS with voice note option (ptt = true)
 * Usage: .ttsvoice <text>
 */
export async function ttsVoice({ fullArgs, from, sock }) {
  try {
    if (!fullArgs || fullArgs.trim().length === 0) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🔊 VOICE NOTE",
          "*Usage:* .ttsvoice <text>\n*Example:* .ttsvoice Hello, this is a voice note",
        ),
      });
      return;
    }

    await sock.sendPresenceUpdate("composing", from);
    await sock.sendMessage(from, { text: "🔊 *Generating voice note...*" });

    const audioBuffer = await generateSpeech(fullArgs, "en");

    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: true, // Send as voice note
    });
  } catch (error) {
    console.error("❌ Voice note error:", error);
    await sock.sendMessage(from, {
      text: formatError("VOICE NOTE ERROR", error.message),
    });
  }
}

/**
 * Batch TTS - convert multiple texts
 * Usage: .ttsbatch <text1> | <text2> | <text3>
 */
export async function ttsBatch({ fullArgs, from, sock }) {
  try {
    if (!fullArgs || !fullArgs.includes("|")) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "🔊 BATCH TTS",
          "*Usage:* .ttsbatch <text1> | <text2> | <text3>\n" +
            "*Example:* .ttsbatch Hello | How are you? | Goodbye",
        ),
      });
      return;
    }

    const texts = fullArgs
      .split("|")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (texts.length === 0) {
      throw new Error("No valid text provided");
    }

    await sock.sendMessage(from, {
      text: `🔊 *Generating ${texts.length} audio files...*`,
    });

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      await sock.sendPresenceUpdate("composing", from);

      const audioBuffer = await generateSpeech(text, "en");

      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
        caption: `🔊 *Part ${i + 1}/${texts.length}*\n📝 ${text}`,
      });

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error("❌ Batch TTS error:", error);
    await sock.sendMessage(from, {
      text: formatError("BATCH TTS ERROR", error.message),
    });
  }
}

/**
 * Test TTS functionality
 */
export async function testTTS() {
  try {
    const testText = "Hello, this is a test of the text to speech system.";
    const audioBuffer = await generateSpeech(testText, "en");

    return {
      success: true,
      message: "TTS test passed",
      bufferSize: audioBuffer.length,
    };
  } catch (error) {
    return {
      success: false,
      message: `TTS test failed: ${error.message}`,
    };
  }
}

export default {
  tts,
  ttsVoice,
  ttsBatch,
  testTTS,
};
