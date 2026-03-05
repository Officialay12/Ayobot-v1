// commands/group/basic.js - ULTRA COMPLETE + ALL FIXED + PRODUCTION READY
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import {
  autoReplyEnabled,
  botStartTime,
  commandUsage,
  delay,
  ENV,
  messageCount,
  waitlistEntries,
} from "../../index.js";
import {
  formatData,
  formatError,
  formatInfo,
  formatMenu,
  formatSuccess,
  formatUptime,
} from "../../utils/formatters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure temp directory exists
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ========== MENU COMMAND ==========
export async function menu({ from, sock, isAdmin }) {
  try {
    await sock.sendPresenceUpdate("composing", from);

    const memory = process.memoryUsage();
    const memoryUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const memoryTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);
    const memoryPercent = ((memory.heapUsed / memory.heapTotal) * 100).toFixed(
      1,
    );

    const stats = {
      uptime: formatUptime(Date.now() - botStartTime),
      memory: memoryPercent,
      memoryUsed,
      memoryTotal,
    };

    const commands = [
      // ===== AYOBOT =====
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.getip`",
        emoji: "● 🌐",
        desc: "Get IP address",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.getpp`",
        emoji: "● 🖼️",
        desc: "Get profile picture",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.getgpp`",
        emoji: "● 👥",
        desc: "Get group profile pic",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.prefixinfo`",
        emoji: "● ℹ️",
        desc: "Show current prefix",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.platform`",
        emoji: "● 📱",
        desc: "Show bot platform",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.myip`",
        emoji: "● 🌐",
        desc: "Show your IP",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.mypp`",
        emoji: "● 🖼️",
        desc: "Show your profile pic",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.gpp`",
        emoji: "● 👥",
        desc: "Get group pic",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.preinfo`",
        emoji: "● ℹ️",
        desc: "Prefix information",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.kitchen`",
        emoji: "● 📱",
        desc: "Kitchen settings",
      },

      // ===== CONVERSION & MEDIA =====
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.shorten`",
        emoji: "● 🔗",
        desc: "Shorten URL",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.short`",
        emoji: "● 🔗",
        desc: "Short URL maker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tiny`",
        emoji: "● 🔗",
        desc: "Tiny URL creator",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.url`",
        emoji: "● 🌍",
        desc: "URL info",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.fetch`",
        emoji: "● 📡",
        desc: "Fetch website data",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.qencode`",
        emoji: "● 📱",
        desc: "Encode to QR",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.take`",
        emoji: "● 🎨",
        desc: "Take screenshot",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.imgbb`",
        emoji: "● 📸",
        desc: "Upload to ImgBB",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tiktok`",
        emoji: "● 🎵",
        desc: "Download TikTok",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tt`",
        emoji: "● 🎵",
        desc: "TikTok no watermark",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.save`",
        emoji: "● 💾",
        desc: "Save to storage",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.screenshot`",
        emoji: "● 📷",
        desc: "Take webpage screenshot",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.inspect`",
        emoji: "● 🔍",
        desc: "Inspect element",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toimage`",
        emoji: "● 🖼️",
        desc: "Convert to image",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toimg`",
        emoji: "● 🖼️",
        desc: "Sticker to image",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tosticker`",
        emoji: "● 🎭",
        desc: "Image to sticker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.s`",
        emoji: "● 🎭",
        desc: "Quick sticker maker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.sticker`",
        emoji: "● 🎭",
        desc: "Create sticker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "● 🎧",
        desc: "Video to audio",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tovoice`",
        emoji: "● 🔊",
        desc: "Convert to voice",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tts`",
        emoji: "● 🗣️",
        desc: "Text to speech",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.speak`",
        emoji: "● 🗣️",
        desc: "Make bot speak",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.voices`",
        emoji: "● 🗣️",
        desc: "List TTS voices",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.trebleboost`",
        emoji: "● ⚡",
        desc: "Boost audio treble",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jarvis`",
        emoji: "● 🤖",
        desc: "Jarvis AI chat",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.j`",
        emoji: "● 🤖",
        desc: "Quick Jarvis",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.ask`",
        emoji: "● 🤖",
        desc: "Ask Jarvis",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jarvisv`",
        emoji: "● 🔊",
        desc: "Jarvis voice",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jv`",
        emoji: "● 🔊",
        desc: "Jarvis voice quick",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jarvisstatus`",
        emoji: "● 📊",
        desc: "Jarvis status",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jstatus`",
        emoji: "● 📊",
        desc: "Jarvis stats",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.jstats`",
        emoji: "● 📊",
        desc: "Jarvis statistics",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.ironman`",
        emoji: "● 🦾",
        desc: "Ironman AI",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.suit`",
        emoji: "● 🦿",
        desc: "Ironman suit mode",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.stark`",
        emoji: "● 🦾",
        desc: "Tony Stark AI",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.iron`",
        emoji: "● 🦾",
        desc: "Ironman quick",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.togif`",
        emoji: "● 🎞️",
        desc: "Video to GIF",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tovideo`",
        emoji: "● 🎬",
        desc: "GIF to video",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tovid`",
        emoji: "● 🎬",
        desc: "Convert to video",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.removebg`",
        emoji: "● ✨",
        desc: "Remove background",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.nobg`",
        emoji: "● ✨",
        desc: "Background remover",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.meme`",
        emoji: "● 😂",
        desc: "Create meme",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.gif`",
        emoji: "● 🎞️",
        desc: "Search GIFs",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.giphy`",
        emoji: "● 🎞️",
        desc: "GIPHY search",
      },

      // ===== CONTACT TOOLS =====
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.vcf`",
        emoji: "● 📇",
        desc: "Create contact card",
      },
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.viewvcf`",
        emoji: "● 👁️",
        desc: "View VCF file",
      },
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.vv`",
        emoji: "● 🔓",
        desc: "View VCF quick",
      },
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.open`",
        emoji: "● 🔓",
        desc: "Open contact",
      },
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.arise`",
        emoji: "● 🔓",
        desc: "Arise contact tool",
      },

      // ===== MUSIC & MEDIA =====
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.play`",
        emoji: "● ▶️",
        desc: "Play music",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.music`",
        emoji: "● 🎵",
        desc: "Download music",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.song`",
        emoji: "● 🎵",
        desc: "Get song",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.yt`",
        emoji: "● 📺",
        desc: "YouTube search",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.youtube`",
        emoji: "● 📺",
        desc: "YouTube download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.ytsearch`",
        emoji: "● 🔍",
        desc: "Search YouTube",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.yts`",
        emoji: "● 🔍",
        desc: "YouTube search quick",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.ytdownload`",
        emoji: "● ⬇️",
        desc: "Download YouTube",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.ytdl`",
        emoji: "● ⬇️",
        desc: "YouTube downloader",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.spotify`",
        emoji: "● 🎧",
        desc: "Spotify download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.sp`",
        emoji: "● 🎧",
        desc: "Spotify quick",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.lyrics`",
        emoji: "● 📝",
        desc: "Get song lyrics",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.trending`",
        emoji: "● 📈",
        desc: "Trending music",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.artist`",
        emoji: "● 👤",
        desc: "Artist info",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.album`",
        emoji: "● 💿",
        desc: "Album info",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.search`",
        emoji: "● 🔍",
        desc: "Search anything",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.genius`",
        emoji: "● 🎤",
        desc: "Genius lyrics",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.instagram`",
        emoji: "● 📸",
        desc: "Instagram download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.ig`",
        emoji: "● 📸",
        desc: "Instagram reel",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.facebook`",
        emoji: "● 📘",
        desc: "Facebook video",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.fb`",
        emoji: "● 📘",
        desc: "FB downloader",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.twitter`",
        emoji: "● 🐦",
        desc: "Twitter/X video",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.x`",
        emoji: "● 🐦",
        desc: "X video download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.pinterest`",
        emoji: "● 📌",
        desc: "Pinterest download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.pin`",
        emoji: "● 📌",
        desc: "Pin downloader",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.img`",
        emoji: "● 🖼️",
        desc: "Image search",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.image`",
        emoji: "● 🖼️",
        desc: "Get images",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.download`",
        emoji: "● ⬇️",
        desc: "Download media",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.dl`",
        emoji: "● ⬇️",
        desc: "Quick download",
      },

      // ===== AI & TOOLS =====
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.ai`",
        emoji: "● 🧠",
        desc: "Chat with AI",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.aiclear`",
        emoji: "● 🧹",
        desc: "Clear AI history",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.aiexport`",
        emoji: "● 📤",
        desc: "Export AI chat",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.summarize`",
        emoji: "● 📋",
        desc: "Summarize text",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.simpler`",
        emoji: "● 📋",
        desc: "Simplify text",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.grammar`",
        emoji: "● ✅",
        desc: "Fix grammar",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.translate`",
        emoji: "● 🌍",
        desc: "Translate text",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.tr`",
        emoji: "● 🌍",
        desc: "Quick translate",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.tl`",
        emoji: "● 🌍",
        desc: "Translate language",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.lang`",
        emoji: "● 🌍",
        desc: "Change language",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.languages`",
        emoji: "● 📚",
        desc: "List languages",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.langs`",
        emoji: "● 📚",
        desc: "Available langs",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.detect`",
        emoji: "● 🔍",
        desc: "Detect language",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.langdetect`",
        emoji: "● 🔍",
        desc: "Language detect",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.weather`",
        emoji: "● ☁️",
        desc: "Weather forecast",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.w`",
        emoji: "● ☁️",
        desc: "Quick weather",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.forecast`",
        emoji: "● ☁️",
        desc: "Weather details",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.calc`",
        emoji: "● 🧮",
        desc: "Calculator",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.calculate`",
        emoji: "● 🧮",
        desc: "Math calculate",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.math`",
        emoji: "● 🧮",
        desc: "Math solver",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.convert`",
        emoji: "● 🔄",
        desc: "Unit converter",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.conv`",
        emoji: "● 🔄",
        desc: "Quick convert",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.uconvert`",
        emoji: "● 🔄",
        desc: "Unit convert",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.units`",
        emoji: "● 📏",
        desc: "Unit list",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.allunits`",
        emoji: "● 📚",
        desc: "All units",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dict`",
        emoji: "● 📖",
        desc: "Dictionary",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dictionary`",
        emoji: "● 📖",
        desc: "Word meaning",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.define`",
        emoji: "● 📖",
        desc: "Define word",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.crypto`",
        emoji: "● 💰",
        desc: "Crypto price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.btc`",
        emoji: "● ₿",
        desc: "Bitcoin price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.eth`",
        emoji: "● Ξ",
        desc: "Ethereum price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.doge`",
        emoji: "● Ð",
        desc: "Dogecoin price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.cryptotop`",
        emoji: "● 📈",
        desc: "Top crypto",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.cryptochart`",
        emoji: "● 📊",
        desc: "Crypto chart",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.cryptoconvert`",
        emoji: "● 🔄",
        desc: "Convert crypto",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.stock`",
        emoji: "● 📈",
        desc: "Stock price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.stocks`",
        emoji: "● 📈",
        desc: "Stock market",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.movie`",
        emoji: "● 🎬",
        desc: "Movie info",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.film`",
        emoji: "● 🎬",
        desc: "Film details",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.imdb`",
        emoji: "● 🎬",
        desc: "IMDB rating",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.tv`",
        emoji: "● 📺",
        desc: "TV show info",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.series`",
        emoji: "● 📺",
        desc: "Series details",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.show`",
        emoji: "● 📺",
        desc: "Show info",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.recommend`",
        emoji: "● 👍",
        desc: "Recommendations",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.rec`",
        emoji: "● 👍",
        desc: "Quick rec",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.suggest`",
        emoji: "● 👍",
        desc: "Suggestions",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.news`",
        emoji: "● 📰",
        desc: "Latest news",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.headlines`",
        emoji: "● 📰",
        desc: "News headlines",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.breaking`",
        emoji: "● 📰",
        desc: "Breaking news",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.time`",
        emoji: "● 🌐",
        desc: "World time",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.ip`",
        emoji: "● 🔍",
        desc: "IP lookup",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.iplookup`",
        emoji: "● 🔍",
        desc: "IP details",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.whois`",
        emoji: "● 🔎",
        desc: "WHOIS lookup",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.domain`",
        emoji: "● 🔎",
        desc: "Domain info",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dns`",
        emoji: "● 🌐",
        desc: "DNS lookup",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dnslookup`",
        emoji: "● 🌐",
        desc: "DNS details",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.scan`",
        emoji: "● 🛡️",
        desc: "Port scan",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.virustotal`",
        emoji: "● 🛡️",
        desc: "Virus scan",
      },

      // ===== FUN & GAMES =====
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.joke`",
        emoji: "● 😂",
        desc: "Random joke",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.laugh`",
        emoji: "● 😂",
        desc: "Funny joke",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.quote`",
        emoji: "● 💫",
        desc: "Random quote",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.motivation`",
        emoji: "● 💫",
        desc: "Motivation quote",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.inspire`",
        emoji: "● 💫",
        desc: "Inspire me",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.trivia`",
        emoji: "● ❓",
        desc: "Trivia question",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.rps`",
        emoji: "● ✂️",
        desc: "Rock paper scissors",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.rockpaperscissors`",
        emoji: "● ✂️",
        desc: "Play RPS",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.dice`",
        emoji: "● 🎲",
        desc: "Roll dice",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.roll`",
        emoji: "● 🎲",
        desc: "Random number",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.flip`",
        emoji: "● 🪙",
        desc: "Flip coin",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.coin`",
        emoji: "● 🪙",
        desc: "Coin toss",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.roast`",
        emoji: "● 🔥",
        desc: "Roast someone",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.burn`",
        emoji: "● 🔥",
        desc: "Burn message",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.pickup`",
        emoji: "● 💘",
        desc: "Pickup line",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.pickupline`",
        emoji: "● 💘",
        desc: "Flirty line",
      },

      // ===== ENCRYPTION =====
      {
        category: "> *_🔐 ENCRYPTION_*",
        cmd: "`.encrypt`",
        emoji: "● 🔒",
        desc: "Encrypt text",
      },
      {
        category: "> *_🔐 ENCRYPTION_*",
        cmd: "`.decrypt`",
        emoji: "● 🔓",
        desc: "Decrypt text",
      },
      {
        category: "> *_🔐 ENCRYPTION_*",
        cmd: "`.hash`",
        emoji: "● #️⃣",
        desc: "Generate hash",
      },
      {
        category: "> *_🔐 ENCRYPTION_*",
        cmd: "`.password`",
        emoji: "● 🔑",
        desc: "Generate password",
      },

      // ===== STORAGE =====
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.save`",
        emoji: "● 💾",
        desc: "Save note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.store`",
        emoji: "● 💾",
        desc: "Store data",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.get`",
        emoji: "● 📂",
        desc: "Get saved",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.recall`",
        emoji: "● 📂",
        desc: "Recall note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.list`",
        emoji: "● 📋",
        desc: "List saved",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.keys`",
        emoji: "● 📋",
        desc: "List keys",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.delkey`",
        emoji: "● 🗑️",
        desc: "Delete key",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.forget`",
        emoji: "● 🗑️",
        desc: "Delete note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.clear`",
        emoji: "● 🧹",
        desc: "Clear storage",
      },

      // ===== DOCUMENTS =====
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qr`",
        emoji: "● 📱",
        desc: "Generate QR",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qrcode`",
        emoji: "● 📱",
        desc: "Create QR code",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.pdf`",
        emoji: "● 📄",
        desc: "Make PDF",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.scrape`",
        emoji: "● 🕸️",
        desc: "Web scrape",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.tweek`",
        emoji: "● 🕸️",
        desc: "Tweek tools",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.connect`",
        emoji: "● 🔌",
        desc: "Connect service",
      },

      // ===== BASIC =====
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.menu`",
        emoji: "● 📋",
        desc: "Show menu",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.help`",
        emoji: "● ℹ️",
        desc: "Get help",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.commands`",
        emoji: "● 📋",
        desc: "All commands",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.cmds`",
        emoji: "● 📋",
        desc: "Command list",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.ping`",
        emoji: "● 🏓",
        desc: "Check bot",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.latency`",
        emoji: "● ⏱️",
        desc: "Bot speed",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.status`",
        emoji: "● 📊",
        desc: "Bot status",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.me`",
        emoji: "● 👤",
        desc: "Your profile",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.profile`",
        emoji: "● 👤",
        desc: "View profile",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.creator`",
        emoji: "● 👑",
        desc: "Bot creator",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.maker`",
        emoji: "● 👑",
        desc: "About maker",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.dev`",
        emoji: "● 👑",
        desc: "Developer info",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.creatorsgit`",
        emoji: "● 🐙",
        desc: "Creator's GitHub",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.auto`",
        emoji: "● 🤖",
        desc: "Auto mode",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.autoreply`",
        emoji: "● 🤖",
        desc: "Auto reply",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.chatbot`",
        emoji: "● 🤖",
        desc: "Chatbot mode",
      },

      // ===== GROUP =====
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.kick`",
        emoji: "● 👢",
        desc: "Remove member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.remove`",
        emoji: "● 👢",
        desc: "Kick user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.add`",
        emoji: "● ➕",
        desc: "Add member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.invite`",
        emoji: "● ➕",
        desc: "Invite link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.promote`",
        emoji: "● ⭐",
        desc: "Make admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.makeadmin`",
        emoji: "● ⭐",
        desc: "Promote to admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.demote`",
        emoji: "● ⬇️",
        desc: "Remove admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unadmin`",
        emoji: "● ⬇️",
        desc: "Demote admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ban`",
        emoji: "● 🚫",
        desc: "Ban user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unban`",
        emoji: "● ✅",
        desc: "Unban user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warn`",
        emoji: "● ⚠️",
        desc: "Warn member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warnings`",
        emoji: "● 📜",
        desc: "Check warns",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.clearwarns`",
        emoji: "● 🧹",
        desc: "Clear warnings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.mute`",
        emoji: "● 🔇",
        desc: "Mute user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unmute`",
        emoji: "● 🔊",
        desc: "Unmute user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antilink`",
        emoji: "● 🚫",
        desc: "Block links",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antispam`",
        emoji: "● 🛡️",
        desc: "Stop spam",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.tagall`",
        emoji: "● 📢",
        desc: "Mention all",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.hidetag`",
        emoji: "● 👻",
        desc: "Tag secretly",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.link`",
        emoji: "● 🔗",
        desc: "Group link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.revoke`",
        emoji: "● 🔄",
        desc: "Reset link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.delete`",
        emoji: "● 🗑️",
        desc: "Delete message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome`",
        emoji: "● 👋",
        desc: "Welcome settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.setwelcome`",
        emoji: "● ✏️",
        desc: "Set welcome msg",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.goodbye`",
        emoji: "● 👋",
        desc: "Goodbye settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.setgoodbye`",
        emoji: "● ✏️",
        desc: "Set goodbye msg",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.rules`",
        emoji: "● 📜",
        desc: "Group rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.setrules`",
        emoji: "● ✏️",
        desc: "Set rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.groupinfo`",
        emoji: "● ℹ️",
        desc: "Group details",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ginfo`",
        emoji: "● ℹ️",
        desc: "Quick group info",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.listadmins`",
        emoji: "● 👑",
        desc: "List admins",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.admins`",
        emoji: "● 👑",
        desc: "Show admins",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.listbanned`",
        emoji: "● 📋",
        desc: "Banned users",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.leave`",
        emoji: "● 🚪",
        desc: "Bot leave group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.debuggroup`",
        emoji: "● 🔍",
        desc: "Debug group",
      },
    ];

    // Add admin commands
    if (isAdmin) {
      commands.push(
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.adduser`",
          emoji: "● ✅",
          desc: "Add user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.auth`",
          emoji: "● ✅",
          desc: "Authorize user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.removeuser`",
          emoji: "● ❌",
          desc: "Remove user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.deauth`",
          emoji: "● ❌",
          desc: "Deauthorize",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.listusers`",
          emoji: "● 📋",
          desc: "All users",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.mode`",
          emoji: "● ⚙️",
          desc: "Change mode",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.broadcast`",
          emoji: "● 📢",
          desc: "Broadcast msg",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.globalbroadcast`",
          emoji: "● 🌍",
          desc: "Global message",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.stats`",
          emoji: "● 📊",
          desc: "Bot stats",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.botstatus`",
          emoji: "● 🤖",
          desc: "Bot health",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.superban`",
          emoji: "● 🔨",
          desc: "Global ban",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.unban`",
          emoji: "● ✅",
          desc: "Global unban",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.listbanned`",
          emoji: "● 📋",
          desc: "Banned list",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.clearbans`",
          emoji: "● 🧹",
          desc: "Clear bans",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.restart`",
          emoji: "● 🔄",
          desc: "Restart bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.shutdown`",
          emoji: "● ⛔",
          desc: "Stop bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.eval`",
          emoji: "● ⚡",
          desc: "Execute code",
        },
      );
    }

    const menuText = formatMenu(commands, isAdmin, stats);

    // ── STEP 1: Send menu audio first ──────────────────────
    try {
      await sock.sendMessage(from, {
        audio: {
          url: ENV.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
        },
        mimetype: "audio/aac",
        ptt: false,
      });
    } catch (_) {
      // Audio failed silently — menu still sends below
    }

    // ── STEP 2: Send menu image + text ─────────────────────
    try {
      await sock.sendMessage(from, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: menuText,
        contextInfo: {
          mentionedJid: [from],
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "0029Vb78B9VDzgTDPktNpn25@newsletter",
            newsletterName: "AyoBot Tech Hub",
            serverMessageId: Date.now(),
          },
        },
      });
      console.log("✅ Menu with image sent");
    } catch (e) {
      console.log("⚠️ Menu image failed, sending text only");
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    console.error("Menu error:", error);
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1*\n👑 *AYOCODES*\n\nType .help for commands`,
    });
  }
}

// ========== PING WITH ANIMATION ==========
export async function ping({ from, sock }) {
  const start = Date.now();

  const loadingMsg = await sock.sendMessage(from, {
    text: `🏓 *Pinging...* \n[▱▱▱▱▱▱▱▱▱▱] 0%`,
  });

  const frames = [
    "[▰▱▱▱▱▱▱▱▱▱] 10%",
    "[▰▰▱▱▱▱▱▱▱▱] 20%",
    "[▰▰▰▱▱▱▱▱▱▱] 30%",
    "[▰▰▰▰▱▱▱▱▱▱] 40%",
    "[▰▰▰▰▰▱▱▱▱▱] 50%",
    "[▰▰▰▰▰▰▱▱▱▱] 60%",
    "[▰▰▰▰▰▰▰▱▱▱] 70%",
    "[▰▰▰▰▰▰▰▰▱▱] 80%",
    "[▰▰▰▰▰▰▰▰▰▱] 90%",
    "[▰▰▰▰▰▰▰▰▰▰] 100%",
  ];

  for (let i = 0; i < frames.length; i++) {
    await delay(80);
    try {
      await sock.sendMessage(from, {
        text: `🏓 *Pinging...* \n${frames[i]}`,
        edit: loadingMsg.key,
      });
    } catch (_) {}
  }

  const responseTime = Date.now() - start;
  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║        🏓 *PONG!*         ║\n╚══════════════════════════╝\n\n📡 *Response:* ${responseTime}ms\n⏱️ *Uptime:* ${formatUptime(Date.now() - botStartTime)}\n📊 *Messages:* ${messageCount}\n🤖 *Status:* ONLINE 🟢\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *AYOBOT is fully operational!*\n👑 Created by AYOCODES`,
    edit: loadingMsg.key,
  });
}

// ========== STATUS ==========
export async function status({
  from,
  userJid,
  isAdmin: isAdminUser,
  isAuthorized: isAuthorizedUser,
  sock,
}) {
  const phone = userJid.split("@")[0];
  const usage = commandUsage.get(userJid) || {};
  const total = Object.values(usage).reduce((a, b) => a + b, 0);

  let role = "USER";
  if (isAdminUser) role = "ADMIN 👑";
  else if (isAuthorizedUser) role = "AUTHORIZED ✓";

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║        👤 *STATUS*        ║\n╚══════════════════════════╝\n\n📱 *Phone:* ${phone}\n👑 *Role:* ${role}\n📊 *Commands:* ${total}\n🤖 *Bot Mode:* ${ENV.BOT_MODE.toUpperCase()}\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *Use .menu to explore*\n👑 Created by AYOCODES`,
  });
}

// ========== CREATOR INFO WITH IMAGE ==========
// FIXED: uses destructured { from, sock, isAdmin }
export async function creator({ from, sock, isAdmin: isAdminUser }) {
  try {
    const creatorText =
      `╔══════════════════════════╗\n` +
      `║   👑 *AYOCODES* 👑       ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📛 *Name:* AYOCODES\n` +
      `📞 *Phone:* ${ENV.CREATOR_CONTACT || "N/A"}\n` +
      `🔗 *GitHub:* ${ENV.CREATOR_GITHUB}\n` +
      `💻 *Website:* ${ENV.CREATOR_GITHUB}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📢 *COMMUNITY*\n` +
      `📱 Channel: ${ENV.WHATSAPP_CHANNEL}\n` +
      `👥 Group: ${ENV.WHATSAPP_GROUP}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📞 wa.me/${ENV.CREATOR_CONTACT || ""}\n` +
      `${isAdminUser ? "👑 ADMIN ACCESS GRANTED\n" : ""}` +
      `\n⚡ *AYOBOT v1* | Created by AYOCODES`;

    await sock.sendMessage(from, {
      image: { url: ENV.CREATOR_IMAGE_URL },
      caption: creatorText,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "0029Vb78B9VDzgTDPktNpn25@newsletter",
          newsletterName: "AyoBot Tech Hub",
          serverMessageId: Date.now(),
        },
      },
    });
    console.log("✅ Creator info sent with image");
  } catch (error) {
    console.error("❌ Creator error:", error.message);
    await sock.sendMessage(from, {
      text: `👑 *AYOCODES*\n\n📞 ${ENV.CREATOR_CONTACT || "N/A"}\n📧 ${ENV.CREATOR_EMAIL || "N/A"}\n🔗 ${ENV.CREATOR_GITHUB}`,
    });
  }
}

// ========== CREATOR GITHUB ==========
export async function creatorGit({ from, sock }) {
  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║   👑 *AYOCODES GITHUB*   ║\n╚══════════════════════════╝\n\n📛 *Creator:* AYOCODES\n🔗 *GitHub:* ${ENV.CREATOR_GITHUB}\n📁 *Repositories:* 120+ Projects\n⭐ *Stars:* 100+ Total\n👥 *Followers:* 500+ Dev Community\n\n📊 *Top Projects:*\n▰ AYOBOT - WhatsApp Bot (2k+ ⭐)\n▰ AyoLink - URL Shortener (500+ ⭐)\n▰ Web Scraper Pro (300+ ⭐)\n▰ PDF Generator (250+ ⭐)\n\n━━━━━━━━━━━━━━━━━━━━━\n💻 *Check out my work on GitHub!*\n👑 *AYOBOT v1* | Created by AYOCODES`,
  });
}

// ========== AUTO-REPLY TOGGLE ==========
export async function auto({ args, from, userJid, sock }) {
  const sub = args[0]?.toLowerCase();

  if (!sub || !["on", "off", "status"].includes(sub)) {
    const cur = autoReplyEnabled.get(userJid) ? "ON" : "OFF";
    await sock.sendMessage(from, {
      text: formatInfo(
        "AUTO-REPLY",
        `Current: *${cur}*\n\n.auto on  - Enable conversations\n.auto off - Disable\n.auto status - Check status`,
      ),
    });
    return;
  }

  if (sub === "on") {
    autoReplyEnabled.set(userJid, true);
    try {
      const autoReplyMod = await import("../../handlers/autoReply.js");
      const handler = autoReplyMod.default || autoReplyMod;
      if (typeof handler.resetConversation === "function")
        handler.resetConversation(userJid);
      if (typeof handler.sendEnableGreeting === "function") {
        await handler.sendEnableGreeting(sock, from, userJid);
      } else {
        await sock.sendMessage(from, {
          text: formatSuccess("AUTO-REPLY", "Auto-reply has been *ENABLED*."),
        });
      }
    } catch (_) {
      await sock.sendMessage(from, {
        text: formatSuccess("AUTO-REPLY", "Auto-reply has been *ENABLED*."),
      });
    }
  } else if (sub === "off") {
    autoReplyEnabled.set(userJid, false);
    try {
      const autoReplyMod = await import("../../handlers/autoReply.js");
      const handler = autoReplyMod.default || autoReplyMod;
      if (typeof handler.resetConversation === "function")
        handler.resetConversation(userJid);
    } catch (_) {}
    await sock.sendMessage(from, {
      text: formatSuccess("AUTO-REPLY", "Auto-reply has been *DISABLED*."),
    });
  } else {
    const s = autoReplyEnabled.get(userJid) ? "ON 🟢" : "OFF 🔴";
    await sock.sendMessage(from, {
      text: formatInfo("AUTO-REPLY STATUS", `Status: *${s}*`),
    });
  }
}

// ========== WEATHER ==========
export async function weather({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER",
        "Usage: .weather <city>\nExample: .weather London",
      ),
    });
    return;
  }

  if (!ENV.OPENWEATHER_KEY) {
    return sock.sendMessage(from, {
      text: formatError("CONFIG ERROR", "OPENWEATHER_KEY not set in .env"),
    });
  }

  await sock.sendMessage(from, { text: "🌤️ *Fetching weather data...*" });

  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(fullArgs)}&appid=${ENV.OPENWEATHER_KEY}&units=metric`,
      { timeout: 10000 },
    );
    const d = res.data;
    const weatherData = {
      "🌡️ Temperature": `${d.main.temp}°C`,
      "🤔 Feels like": `${d.main.feels_like}°C`,
      "📊 Min/Max": `${d.main.temp_min}°C / ${d.main.temp_max}°C`,
      "💧 Humidity": `${d.main.humidity}%`,
      "🌬️ Wind": `${d.wind.speed} m/s`,
      "☁️ Conditions": d.weather[0].description,
      "🌅 Sunrise": new Date(d.sys.sunrise * 1000).toLocaleTimeString(),
      "🌇 Sunset": new Date(d.sys.sunset * 1000).toLocaleTimeString(),
    };
    await sock.sendMessage(from, {
      text: formatData(`WEATHER: ${d.name}, ${d.sys.country}`, weatherData),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `City "${fullArgs}" not found or API error.`),
    });
  }
}

// ========== URL SHORTENER ==========
export async function shorten({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🔗 URL SHORTENER",
        "Usage: .shorten <url>\nExample: .shorten https://example.com",
      ),
    });
    return;
  }

  let longUrl = fullArgs.trim().split(" ")[0];
  if (!longUrl.startsWith("http")) longUrl = "https://" + longUrl;

  await sock.sendMessage(from, { text: "🔗 *Shortening URL...*" });

  const services = [
    {
      name: "TinyURL",
      shorten: async () => {
        const res = await axios.get(
          `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
          { timeout: 8000 },
        );
        return res.data;
      },
    },
    {
      name: "is.gd",
      shorten: async () => {
        const res = await axios.get(
          `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
          { timeout: 8000 },
        );
        return res.data;
      },
    },
  ];

  for (const service of services) {
    try {
      const shortUrl = await service.shorten();
      if (shortUrl && shortUrl.startsWith("http")) {
        await sock.sendMessage(from, {
          text: formatSuccess(
            "URL SHORTENED",
            `📎 *Original:*\n${longUrl}\n\n🔗 *Short URL:*\n${shortUrl}\n\n🌐 *Service:* ${service.name}`,
          ),
        });
        return;
      }
    } catch (_) {}
  }

  await sock.sendMessage(from, {
    text: formatError("ERROR", "Could not shorten URL. Try again later."),
  });
}

// ========== VIEW ONCE ==========
export async function viewOnce({ message, from, sock }) {
  try {
    const quotedMsg =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "VIEW ONCE",
          "Reply to a view-once message with:\n.vv or .open or .arise",
        ),
      });
      return;
    }

    await sock.sendMessage(from, { text: "👁️ *Opening view once message...*" });

    let mediaMsg = null;
    let type = null;
    let isViewOnce = false;

    // Check all known view-once container formats
    const containers = [
      quotedMsg.viewOnceMessageV2?.message,
      quotedMsg.viewOnceMessageV2Extension?.message,
      quotedMsg,
    ];

    for (const container of containers) {
      if (!container) continue;
      if (container.imageMessage) {
        const img = container.imageMessage;
        if (img.viewOnce !== false || container !== quotedMsg) {
          isViewOnce = true;
          mediaMsg = img;
          type = "image";
          break;
        }
      }
      if (container.videoMessage) {
        const vid = container.videoMessage;
        if (vid.viewOnce !== false || container !== quotedMsg) {
          isViewOnce = true;
          mediaMsg = vid;
          type = "video";
          break;
        }
      }
      if (container.audioMessage) {
        const aud = container.audioMessage;
        if (aud.viewOnce !== false || container !== quotedMsg) {
          isViewOnce = true;
          mediaMsg = aud;
          type = "audio";
          break;
        }
      }
    }

    if (!isViewOnce || !mediaMsg || !type) {
      return sock.sendMessage(from, {
        text: formatError(
          "NOT VIEW ONCE",
          "The replied message is not a view-once message.",
        ),
      });
    }

    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const fileSize = (buffer.length / 1024).toFixed(2);
    const caption = `━━━━━━━━━━━━━━━━━━━━━\n📊 *Type:* ${type.toUpperCase()}\n📦 *Size:* ${fileSize} KB\n👑 AYOBOT`;

    if (type === "image")
      await sock.sendMessage(from, { image: buffer, caption });
    else if (type === "video")
      await sock.sendMessage(from, { video: buffer, caption });
    else if (type === "audio") {
      await sock.sendMessage(from, {
        audio: buffer,
        mimetype: "audio/mp4",
        ptt: true,
      });
      await sock.sendMessage(from, { text: caption });
    }
  } catch (error) {
    console.error("View once error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Failed to open view once message."),
    });
  }
}

// ========== WAITLIST ==========
export async function joinWaitlist({ fullArgs, from, userJid, sock }) {
  const email = fullArgs.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    await sock.sendMessage(from, {
      text: formatError(
        "INVALID EMAIL",
        "Please provide a valid email.\n\nExample: .jointrend user@example.com",
      ),
    });
    return;
  }

  const phone = userJid.split("@")[0];
  const timestamp = new Date().toLocaleString();
  waitlistEntries.set(phone, { email, timestamp, userJid });

  await sock.sendMessage(from, {
    text: formatSuccess(
      "WAITLIST JOINED",
      `📧 *Email:* ${email}\n📱 *Phone:* ${phone}\n⏰ *Time:* ${timestamp}`,
    ),
  });

  // Only notify admin if ADMIN env is set
  if (ENV.ADMIN) {
    try {
      const adminPhone = ENV.ADMIN.replace(/[^0-9]/g, "");
      const adminJid = `${adminPhone}@s.whatsapp.net`;
      await sock.sendMessage(adminJid, {
        text: `📋 *New Waitlist Join*\n\n📧 ${email}\n📱 ${phone}\n⏰ ${timestamp}`,
        mentions: [userJid],
      });
    } catch (_) {}
  }
}

// ========== WEB SCRAPER ==========
export async function scrape({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "WEB SCRAPER",
        "🌐 *Extract complete website source code*\n\n📌 *Usage:* .scrape <url>\n📋 *Example:* .scrape https://example.com\n\n✨ *Returns:* HTML + CSS + JS files",
      ),
    });
    return;
  }

  let url = fullArgs.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  await sock.sendMessage(from, {
    text: "🕸️ *Fetching website data...*\n⏳ This may take a moment...",
  });

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  ];

  let html = null;
  for (const ua of userAgents) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": ua,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
        decompress: true,
      });
      html = response.data;
      break;
    } catch (_) {}
  }

  if (!html) {
    return sock.sendMessage(from, {
      text: formatError(
        "SCRAPE ERROR",
        "❌ Could not scrape the website.\n\n💡 The site may block automated requests.",
      ),
    });
  }

  try {
    if (typeof html !== "string") html = String(html);
    const $ = cheerio.load(html);
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    const timestamp = Date.now();

    const title = $("title").text() || "No title";
    const metaDesc =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "No description";
    const metaKeywords =
      $('meta[name="keywords"]').attr("content") || "No keywords";
    const charset = $("meta[charset]").attr("charset") || "UTF-8";

    const links = [];
    $("a[href]").each((i, el) => {
      const href = $(el).attr("href");
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        try {
          links.push(href.startsWith("http") ? href : new URL(href, url).href);
        } catch (_) {}
      }
    });

    // Extract & download CSS
    const cssFiles = [];
    const cssUrls = new Set();
    $('link[rel="stylesheet"]').each((i, el) => {
      let href = $(el).attr("href");
      if (href && !href.startsWith("data:")) {
        try {
          cssUrls.add(href.startsWith("http") ? href : new URL(href, url).href);
        } catch (_) {}
      }
    });
    $("style").each((i, el) => {
      const css = $(el).html();
      if (css && css.length > 50)
        cssFiles.push({
          name: `inline_style_${i + 1}.css`,
          content: css,
          type: "inline",
        });
    });
    for (const cssUrl of Array.from(cssUrls).slice(0, 10)) {
      try {
        const r = await axios.get(cssUrl, {
          timeout: 8000,
          headers: { "User-Agent": userAgents[0] },
        });
        let n = cssUrl.split("/").pop() || `style_${cssFiles.length + 1}.css`;
        if (!n.includes(".")) n += ".css";
        cssFiles.push({
          name: n,
          content: r.data,
          url: cssUrl,
          type: "external",
        });
      } catch (_) {}
    }

    // Extract & download JS
    const jsFiles = [];
    const jsUrls = new Set();
    $("script[src]").each((i, el) => {
      let src = $(el).attr("src");
      if (src && !src.startsWith("data:")) {
        try {
          jsUrls.add(src.startsWith("http") ? src : new URL(src, url).href);
        } catch (_) {}
      }
    });
    $("script:not([src])").each((i, el) => {
      const js = $(el).html();
      if (js && js.length > 50)
        jsFiles.push({
          name: `inline_script_${i + 1}.js`,
          content: js,
          type: "inline",
        });
    });
    for (const jsUrl of Array.from(jsUrls).slice(0, 10)) {
      try {
        const r = await axios.get(jsUrl, {
          timeout: 8000,
          headers: { "User-Agent": userAgents[0] },
        });
        let n = jsUrl.split("/").pop() || `script_${jsFiles.length + 1}.js`;
        if (!n.includes(".")) n += ".js";
        jsFiles.push({
          name: n,
          content: r.data,
          url: jsUrl,
          type: "external",
        });
      } catch (_) {}
    }

    const elementCount = $("*").length;
    const imageCount = $("img").length;
    const scriptCount = $("script").length;
    const styleCount = $('style, link[rel="stylesheet"]').length;
    const prettyHtml = $.html();
    const htmlSize = (prettyHtml.length / 1024).toFixed(2);
    const htmlFilename = `${domain}_source_${timestamp}.html`;
    const previewLines = prettyHtml
      .split("\n")
      .slice(0, 30)
      .join("\n")
      .substring(0, 1500);

    await sock.sendMessage(from, {
      text: `╔════════════════════════════════════════╗\n║     📄 *COMPLETE WEBSITE DATA*     ║\n╚════════════════════════════════════════╝\n\n🔗 *URL:* ${url}\n📝 *Title:* ${title.substring(0, 100)}\n📋 *Description:* ${metaDesc.substring(0, 100)}\n🌐 *Charset:* ${charset}\n\n📊 *STATISTICS:*\n📁 *HTML Elements:* ${elementCount}\n🔗 *Links:* ${links.length}\n🖼️ *Images:* ${imageCount}\n📜 *Scripts:* ${scriptCount}\n🎨 *Styles:* ${styleCount}\n\n📁 *FILES:*\n📄 HTML: ${htmlFilename} (${htmlSize} KB)\n🎨 CSS: ${cssFiles.length} file(s)\n📜 JS: ${jsFiles.length} file(s)\n\n\`\`\`${previewLines}\`\`\``,
    });

    // Send HTML
    await sock.sendMessage(from, {
      document: Buffer.from(prettyHtml, "utf-8"),
      mimetype: "text/html",
      fileName: htmlFilename,
      caption: `📄 *HTML Source*\n📁 ${htmlFilename}\n📦 ${htmlSize} KB`,
    });

    // Send CSS files
    for (const css of cssFiles.slice(0, 10)) {
      await delay(1000);
      await sock.sendMessage(from, {
        document: Buffer.from(String(css.content), "utf-8"),
        mimetype: "text/css",
        fileName: css.name,
        caption: `🎨 *CSS* | ${css.name} | ${(String(css.content).length / 1024).toFixed(2)} KB`,
      });
    }

    // Send JS files
    for (const js of jsFiles.slice(0, 10)) {
      await delay(1000);
      await sock.sendMessage(from, {
        document: Buffer.from(String(js.content), "utf-8"),
        mimetype: "application/javascript",
        fileName: js.name,
        caption: `📜 *JS* | ${js.name} | ${(String(js.content).length / 1024).toFixed(2)} KB`,
      });
    }

    // Send links sample
    if (links.length > 0) {
      const linksSample = links
        .slice(0, 20)
        .map((l, i) => `${i + 1}. ${l.substring(0, 80)}`)
        .join("\n");
      await sock.sendMessage(from, {
        text: `🔗 *First 20 Links:*\n\n${linksSample}\n\n📊 Total: ${links.length} links`,
      });
    }

    await sock.sendMessage(from, {
      text: `✅ *SCRAPE COMPLETE*\n\n📄 HTML: ${htmlSize} KB\n🎨 CSS: ${cssFiles.length} files\n📜 JS: ${jsFiles.length} files\n🔗 Links: ${links.length}\n\n👑 Created by AYOCODES`,
    });
  } catch (error) {
    console.error("❌ Scrape processing error:", error.message);
    try {
      await sock.sendMessage(from, {
        document: Buffer.from(String(html), "utf-8"),
        mimetype: "text/html",
        fileName: `fallback_${Date.now()}.html`,
        caption: "📄 *Raw HTML (fallback)*",
      });
    } catch (_) {
      await sock.sendMessage(from, {
        text: formatError(
          "SCRAPE ERROR",
          `Processing failed: ${error.message}`,
        ),
      });
    }
  }
}

// ========== CONNECT INFO ==========
export async function connectInfo({ from, sock }) {
  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║   📱 *CONNECT WITH US*   ║\n╚══════════════════════════╝\n\n👑 *Creator:* AYOCODES\n📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || ""}\n📧 *Email:* ${ENV.CREATOR_EMAIL || "N/A"}\n💻 *GitHub:* ${ENV.CREATOR_GITHUB}\n\n📢 *Channel*\n${ENV.WHATSAPP_CHANNEL}\n\n👥 *Group*\n${ENV.WHATSAPP_GROUP}\n\n━━━━━━━━━━━━━━━━━━━━━\n🤖 *Commands:* .menu\n⚡ *Version:* ${ENV.BOT_VERSION}`,
  });
}

// ========== WORLD TIME ==========
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "WORLD TIME",
        "Usage: .time <timezone>\nExample: .time Africa/Lagos\nExample: .time America/New_York",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "⏰ *Fetching time...*" });

  try {
    const tzQuery = fullArgs.trim().replace(/ /g, "_");
    const res = await axios.get(
      `https://worldtimeapi.org/api/timezone/${tzQuery}`,
      { timeout: 8000 },
    );
    const date = new Date(res.data.datetime);

    await sock.sendMessage(from, {
      text: formatData("WORLD TIME", {
        "🌍 Timezone": res.data.timezone,
        "📅 Date": date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        "⏰ Time": date.toLocaleTimeString(),
        "🕒 UTC Offset": res.data.utc_offset,
      }),
    });
  } catch (_) {
    // Fallback: try city-based lookup
    try {
      const fallback = await axios.get(
        `https://worldtimeapi.org/api/timezone`,
        { timeout: 8000 },
      );
      const zones = fallback.data;
      const match = zones.find((z) =>
        z.toLowerCase().includes(fullArgs.toLowerCase().replace(/ /g, "_")),
      );
      if (match) {
        const r2 = await axios.get(
          `https://worldtimeapi.org/api/timezone/${match}`,
          { timeout: 8000 },
        );
        const d2 = new Date(r2.data.datetime);
        await sock.sendMessage(from, {
          text: formatData("WORLD TIME", {
            "🌍 Timezone": r2.data.timezone,
            "📅 Date": d2.toLocaleDateString(),
            "⏰ Time": d2.toLocaleTimeString(),
          }),
        });
      } else {
        throw new Error("Not found");
      }
    } catch (_) {
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          `Could not find time for "${fullArgs}".\n\nTry: Africa/Lagos, America/New_York, Europe/London`,
        ),
      });
    }
  }
}

// ========== CREATE PDF ==========
export async function pdf({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "PDF GENERATOR",
        "Usage: .pdf <title> | <content>\nExample: .pdf My Doc | Hello World",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📄 *Generating PDF...*" });

  try {
    let title = "Document";
    let content = fullArgs;

    if (fullArgs.includes("|")) {
      const parts = fullArgs.split("|");
      title = parts[0].trim();
      content = parts.slice(1).join("|").trim();
    }

    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    await new Promise((resolve) => {
      doc.on("end", resolve);
      doc.fontSize(22).font("Helvetica-Bold").text(title, { align: "center" });
      doc.moveDown(1.5);
      doc.fontSize(12).font("Helvetica").text(content, { lineGap: 4 });
      doc.moveDown(2);
      doc
        .fontSize(10)
        .fillColor("gray")
        .text(`Generated by AYOBOT | ${new Date().toLocaleString()}`, {
          align: "center",
        });
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    await sock.sendMessage(from, {
      document: pdfBuffer,
      mimetype: "application/pdf",
      fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`,
      caption: `📄 *PDF Created*\n📝 Title: ${title}\n📦 Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("PDF ERROR", error.message),
    });
  }
}

// ========== IP LOOKUP ==========
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "IP LOOKUP",
        "Usage: .getip <IP address>\nExample: .getip 8.8.8.8",
      ),
    });
    return;
  }

  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const cleanIP = fullArgs.trim();

  if (!ipRegex.test(cleanIP)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID IP",
        "Please provide a valid IPv4 address.\nExample: 8.8.8.8",
      ),
    });
  }

  await sock.sendMessage(from, { text: `🌐 *Looking up IP: ${cleanIP}...*` });

  const apis = [
    async () => {
      const res = await axios.get(`http://ip-api.com/json/${cleanIP}`, {
        timeout: 8000,
        params: {
          fields:
            "status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,as,query",
        },
      });
      return res.data;
    },
    async () => {
      const res = await axios.get(`https://ipapi.co/${cleanIP}/json/`, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      return {
        status: "success",
        query: cleanIP,
        country: res.data.country_name,
        countryCode: res.data.country_code,
        regionName: res.data.region,
        city: res.data.city,
        zip: res.data.postal,
        lat: res.data.latitude,
        lon: res.data.longitude,
        timezone: res.data.timezone,
        isp: res.data.org,
        as: res.data.asn,
      };
    },
    async () => {
      const res = await axios.get(`https://ipinfo.io/${cleanIP}/json`, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const [lat, lon] = (res.data.loc || "0,0").split(",");
      return {
        status: "success",
        query: cleanIP,
        country: res.data.country,
        regionName: res.data.region,
        city: res.data.city,
        zip: res.data.postal,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        timezone: res.data.timezone,
        isp: res.data.org,
      };
    },
  ];

  let data = null;
  let usedApi = "";
  for (let i = 0; i < apis.length; i++) {
    try {
      data = await apis[i]();
      if (data && data.status !== "fail") {
        usedApi = ["ip-api.com", "ipapi.co", "ipinfo.io"][i];
        break;
      }
    } catch (_) {}
  }

  if (!data || data.status === "fail") {
    return sock.sendMessage(from, {
      text: formatError(
        "LOOKUP FAILED",
        "Could not fetch information for this IP address.",
      ),
    });
  }

  const ipData = {
    "🌍 IP Address": data.query || cleanIP,
    "📍 Country": `${data.country || "Unknown"} ${data.countryCode ? `(${data.countryCode})` : ""}`,
    "🏙️ City": data.city || "Unknown",
    "🗺️ Region": data.regionName || "Unknown",
    "📮 Postal Code": data.zip || "N/A",
    "🧭 Coordinates": data.lat && data.lon ? `${data.lat}, ${data.lon}` : "N/A",
    "⏰ Timezone": data.timezone || "N/A",
    "📡 ISP": data.isp || "Unknown",
    "🔗 ASN": data.as || "N/A",
    "🔍 Source": usedApi,
  };

  let responseText = formatData("📍 IP INFORMATION", ipData);
  if (data.lat && data.lon)
    responseText += `\n\n🗺️ *Maps:*\nhttps://www.google.com/maps?q=${data.lat},${data.lon}`;
  await sock.sendMessage(from, { text: responseText });
}

// Alias for .ip and .iplookup
export const ip = getip;

// ========== MY IP ==========
export async function myip({ from, sock }) {
  await sock.sendMessage(from, { text: "🌐 *Fetching your public IP...*" });
  try {
    const res = await axios.get("https://api.ipify.org?format=json", {
      timeout: 8000,
    });
    const ipAddr = res.data.ip;
    try {
      const ipRes = await axios.get(`http://ip-api.com/json/${ipAddr}`, {
        timeout: 8000,
      });
      const d = ipRes.data;
      if (d.status === "success") {
        await sock.sendMessage(from, {
          text: formatData("YOUR PUBLIC IP", {
            "🌍 Your IP": d.query,
            "📍 Location": `${d.city}, ${d.country}`,
            "📡 ISP": d.isp,
            "🗺️ Region": d.regionName,
          }),
        });
        return;
      }
    } catch (_) {}
    await sock.sendMessage(from, {
      text: formatSuccess("YOUR IP", `🌐 ${ipAddr}`),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch your public IP."),
    });
  }
}

// ========== WHOIS ==========
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "WHOIS LOOKUP",
        "Usage: .whois <domain>\nExample: .whois google.com",
      ),
    });
    return;
  }

  await sock.sendMessage(from, {
    text: `🔍 *Looking up WHOIS for ${fullArgs}...*`,
  });

  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const res = await axios.get(`https://api.whoisjsonapi.com/v1/${domain}`, {
      timeout: 10000,
      headers: { Authorization: `Bearer free` },
    });
    const d = res.data;
    await sock.sendMessage(from, {
      text: formatData("WHOIS LOOKUP", {
        "🌐 Domain": d.domain_name || domain,
        "📝 Registrar": d.registrar || "Unknown",
        "📅 Created": d.creation_date || "Unknown",
        "📅 Expires": d.expiration_date || "Unknown",
        "📅 Updated": d.updated_date || "Unknown",
        "📡 Name Servers": Array.isArray(d.name_servers)
          ? d.name_servers.slice(0, 3).join(", ")
          : d.name_servers || "Unknown",
        "🌍 Country": d.registrant_country || "Unknown",
      }),
    });
  } catch (_) {
    // Fallback: rdap.org
    try {
      const domain = fullArgs
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*/, "");
      const res = await axios.get(`https://rdap.org/domain/${domain}`, {
        timeout: 8000,
      });
      const d = res.data;
      const ns = d.nameservers?.map((n) => n.ldhName).join(", ") || "Unknown";
      await sock.sendMessage(from, {
        text: formatData("WHOIS LOOKUP", {
          "🌐 Domain": d.ldhName || domain,
          "📡 Name Servers": ns,
          "📅 Events":
            d.events
              ?.map((e) => `${e.eventAction}: ${e.eventDate?.split("T")[0]}`)
              .join(", ") || "Unknown",
        }),
      });
    } catch (e) {
      await sock.sendMessage(from, {
        text: formatError("ERROR", `WHOIS lookup failed for "${fullArgs}".`),
      });
    }
  }
}

// ========== DNS LOOKUP ==========
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "DNS LOOKUP",
        "Usage: .dns <domain>\nExample: .dns google.com",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });

  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const res = await axios.get(
      `https://dns.google/resolve?name=${domain}&type=A`,
      { timeout: 8000 },
    );
    const d = res.data;
    const answers =
      d.Answer?.map((a) => `${a.name} → ${a.data} (TTL: ${a.TTL}s)`).join(
        "\n",
      ) || "No records found";

    await sock.sendMessage(from, {
      text: formatData("DNS LOOKUP", {
        "🌐 Domain": domain,
        "📊 Status": d.Status === 0 ? "OK" : `Error ${d.Status}`,
        "📋 A Records": answers,
      }),
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `DNS lookup failed for "${fullArgs}".`),
    });
  }
}

// ========== GETPP ==========
export async function getpp({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.participant;
    const mentioned =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const targetJid = quoted || mentioned || from;

    await sock.sendMessage(from, { text: "🖼️ *Fetching profile picture...*" });

    const ppUrl = await sock
      .profilePictureUrl(targetJid, "image")
      .catch(() => null);

    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: `🖼️ *Profile Picture*\n👤 @${targetJid.split("@")[0]}`,
        mentions: [targetJid],
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "NOT FOUND",
          "User has no profile picture or has privacy settings enabled.",
        ),
      });
    }
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch profile picture."),
    });
  }
}

// ========== GETGPP ==========
export async function getgpp({ from, sock, isGroup }) {
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: formatError("GROUP ONLY", "This command only works in groups."),
    });
  }

  await sock.sendMessage(from, { text: "👥 *Fetching group picture...*" });

  try {
    const ppUrl = await sock.profilePictureUrl(from, "image").catch(() => null);
    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: "👥 *Group Profile Picture*",
      });
    } else {
      await sock.sendMessage(from, {
        text: formatInfo("NOT FOUND", "This group has no profile picture."),
      });
    }
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch group picture."),
    });
  }
}

// ========== PREFIXINFO ==========
export async function prefixinfo({ from, sock }) {
  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║     ℹ️ *PREFIX INFO*      ║\n╚══════════════════════════╝\n\n🔤 *Current Prefix:* \`${ENV.PREFIX}\`\n📝 *Usage:* ${ENV.PREFIX}command\n\n📋 *Example:* ${ENV.PREFIX}menu\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 All commands start with "${ENV.PREFIX}"\n👑 Created by AYOCODES`,
  });
}

// ========== PLATFORM ==========
export async function platform({ from, sock }) {
  await sock.sendMessage(from, {
    text: formatData("PLATFORM INFO", {
      "🤖 Bot Name": ENV.BOT_NAME,
      "📊 Version": ENV.BOT_VERSION,
      "⚙️ Node": process.version,
      "💻 Platform": process.platform,
      "🖥️ Arch": process.arch,
      "⏰ Uptime": formatUptime(process.uptime() * 1000),
      "💾 Memory": `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    }),
  });
}

// ========== URL INFO ==========
export async function url({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "URL INFO",
        "Usage: .url <url>\nExample: .url https://example.com",
      ),
    });
    return;
  }

  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;

  await sock.sendMessage(from, { text: `🌍 *Analyzing ${urlStr}...*` });

  try {
    let response;
    try {
      response = await axios.head(urlStr, {
        timeout: 8000,
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true,
      });
    } catch (_) {
      response = await axios.get(urlStr, {
        timeout: 8000,
        maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0" },
        maxContentLength: 5 * 1024 * 1024,
        validateStatus: () => true,
      });
    }

    const headers = response.headers;
    const finalUrl = response.request?.res?.responseUrl || urlStr;
    let size = "Unknown";
    if (headers["content-length"]) {
      const bytes = parseInt(headers["content-length"]);
      size =
        bytes > 1024 * 1024
          ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(bytes / 1024).toFixed(2)} KB`;
    }

    await sock.sendMessage(from, {
      text: formatData("🌍 URL INFORMATION", {
        "🔗 URL":
          finalUrl.length > 60 ? finalUrl.substring(0, 57) + "..." : finalUrl,
        "📊 Status": `${response.status} ${response.statusText || ""}`.trim(),
        "📦 Size": size,
        "📝 Type": headers["content-type"]?.split(";")[0] || "Unknown",
        "📅 Last Modified": headers["last-modified"] || "Not provided",
        "🌐 Server": headers["server"] || "Unknown",
        "🔧 Powered By": headers["x-powered-by"] || "Unknown",
        "🕒 Cache Control": headers["cache-control"] || "Unknown",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not fetch URL info.\n\n💡 Error: ${error.message}`,
      ),
    });
  }
}

// ========== FETCH ==========
export async function fetch({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "FETCH",
        "Usage: .fetch <url>\nExample: .fetch https://api.github.com",
      ),
    });
    return;
  }

  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;

  await sock.sendMessage(from, {
    text: `📡 *Fetching data from ${urlStr}...*`,
  });

  try {
    const response = await axios.get(urlStr, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
      },
      validateStatus: () => true,
    });

    let data = response.data;
    const contentType = response.headers["content-type"] || "";
    let formattedData;
    let isJSON = false;

    if (typeof data === "object") {
      formattedData = JSON.stringify(data, null, 2);
      isJSON = true;
    } else {
      formattedData = String(data);
    }

    const size = (formattedData.length / 1024).toFixed(2);
    const fileExt = isJSON ? "json" : "txt";

    if (formattedData.length > 3500) {
      const preview =
        formattedData.substring(0, 500) +
        "\n\n... [Full data in attached file] ...";
      await sock.sendMessage(from, {
        text: formatInfo(
          "FETCH PREVIEW",
          `📡 *URL:* ${urlStr}\n📦 *Size:* ${size} KB\n📝 *Type:* ${contentType.split(";")[0] || "Unknown"}\n\n\`\`\`${preview}\`\`\``,
        ),
      });
      await sock.sendMessage(from, {
        document: Buffer.from(formattedData, "utf-8"),
        mimetype: isJSON ? "application/json" : "text/plain",
        fileName: `fetch_${Date.now()}.${fileExt}`,
        caption: `📡 *Fetched Data* | ${urlStr} | ${size} KB`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatSuccess(
          "FETCHED DATA",
          `📡 *URL:* ${urlStr}\n📦 *Size:* ${size} KB\n\n\`\`\`${formattedData}\`\`\``,
        ),
      });
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not fetch data.\n\n💡 Error: ${error.message}`,
      ),
    });
  }
}

// ========== QR ENCODE ==========
export async function qencode({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "QR ENCODE",
        "Usage: .qencode <text>\nExample: .qencode https://github.com",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });

  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}&margin=10`;
    await sock.sendMessage(from, {
      image: { url: qrUrl },
      caption: `📱 *QR Code Generated*\n\n📝 *Content:* ${fullArgs.substring(0, 100)}${fullArgs.length > 100 ? "..." : ""}\n━━━━━━━━━━━━━━━━━━━━━\n👑 Created by AYOCODES`,
    });
  } catch (_) {
    try {
      const fallback = `https://chart.googleapis.com/chart?chs=500x500&cht=qr&chl=${encodeURIComponent(fullArgs)}`;
      await sock.sendMessage(from, {
        image: { url: fallback },
        caption: `📱 *QR Code*\n\n📝 ${fullArgs}`,
      });
    } catch (_) {
      await sock.sendMessage(from, {
        text: formatError("ERROR", "Could not generate QR code."),
      });
    }
  }
}

// ========== TAKE STICKER ==========
export async function take({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "TAKE STICKER",
          "Reply to an image/video with .take to create a sticker.",
        ),
      });
      return;
    }

    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });

    const mediaType = quoted.imageMessage ? "image" : "video";
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;

    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    if (mediaType === "image") {
      try {
        // Try sharp for best quality
        const { default: sharp } = await import("sharp");
        const stickerBuffer = await sharp(buffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
        await sock.sendMessage(from, { sticker: stickerBuffer });
      } catch (_) {
        // Fallback: send raw image as sticker attempt
        await sock.sendMessage(from, { sticker: buffer });
      }
    } else {
      await sock.sendMessage(from, {
        document: buffer,
        mimetype: "video/mp4",
        fileName: "sticker_video.mp4",
        caption:
          "🎥 *Video sticker source*\n(Use a sticker maker app to convert)",
      });
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not create sticker."),
    });
  }
}

// ========== IMGBB UPLOAD ==========
export async function imgbb({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "IMGBB UPLOAD",
          "Reply to an image with .imgbb to upload it and get a public URL.",
        ),
      });
      return;
    }

    await sock.sendMessage(from, { text: "📤 *Uploading image...*" });

    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      "image",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const base64Image = buffer.toString("base64");

    // Service 1: ImgBB (uses URLSearchParams — no FormData needed)
    const tryImgBB = async () => {
      const params = new URLSearchParams();
      params.append("image", base64Image);
      const apiKey =
        process.env.IMGBB_KEY || "5a5e6f5e6f5e6f5e6f5e6f5e6f5e6f5e";
      const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        params,
        { timeout: 15000 },
      );
      if (response.data?.data?.url)
        return {
          url: response.data.data.url,
          deleteUrl: response.data.data.delete_url,
          service: "ImgBB",
        };
      throw new Error("ImgBB upload failed");
    };

    // Service 2: Imgpile free API
    const tryImgpile = async () => {
      const params = new URLSearchParams();
      params.append("source", base64Image);
      params.append("type", "base64");
      const response = await axios.post(
        "https://imgpile.com/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5",
        params,
        { timeout: 15000 },
      );
      if (response.data?.image?.url)
        return { url: response.data.image.url, service: "Imgpile" };
      throw new Error("Imgpile failed");
    };

    let result = null;
    for (const uploader of [tryImgBB, tryImgpile]) {
      try {
        result = await uploader();
        if (result) break;
      } catch (_) {}
    }

    if (result) {
      await sock.sendMessage(from, {
        text: `╔══════════════════════════╗\n║     📤 *IMAGE UPLOADED*   ║\n╚══════════════════════════╝\n\n🔗 *URL:* ${result.url}\n📦 *Size:* ${(buffer.length / 1024).toFixed(2)} KB\n🌐 *Service:* ${result.service}\n${result.deleteUrl ? `🗑️ *Delete:* ${result.deleteUrl}` : ""}\n\n⚡ *AYOBOT v1* | 👑 Created by AYOCODES`,
      });
    } else {
      throw new Error("All upload services failed");
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not upload image. Try again later."),
    });
  }
}

// ========== SCREENSHOT ==========
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "SCREENSHOT",
        "Usage: .screenshot <url>\nExample: .screenshot https://example.com",
      ),
    });
    return;
  }

  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;

  await sock.sendMessage(from, {
    text: `📷 *Taking screenshot of ${urlStr}...*`,
  });

  // Try multiple free screenshot APIs
  const screenshotUrls = [
    `https://image.thum.io/get/width/1280/crop/800/${urlStr}`,
    `https://mini.s-shot.ru/1280x1024/1280/${encodeURIComponent(urlStr)}`,
    `https://api.apiflash.com/v1/urltoimage?access_key=free&url=${encodeURIComponent(urlStr)}&width=1280&height=720`,
  ];

  for (const ssUrl of screenshotUrls) {
    try {
      const test = await axios.get(ssUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (test.status === 200 && test.data && test.data.byteLength > 1000) {
        await sock.sendMessage(from, {
          image: Buffer.from(test.data),
          caption: `📷 *Screenshot*\n🔗 ${urlStr}\n\n⚡ *AYOBOT v1* | 👑 Created by AYOCODES`,
        });
        return;
      }
    } catch (_) {}
  }

  await sock.sendMessage(from, {
    text: formatInfo(
      "SCREENSHOT UNAVAILABLE",
      `❌ Could not take screenshot of:\n${urlStr}\n\n💡 The site may block screenshot services.`,
    ),
  });
}

// ========== INSPECT ==========
export async function inspect({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "INSPECT",
        "Usage: .inspect <url>\nExample: .inspect https://example.com",
      ),
    });
    return;
  }

  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;

  await sock.sendMessage(from, { text: `🔍 *Inspecting ${urlStr}...*` });

  try {
    const response = await axios.get(urlStr, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);
    const finalUrl = response.request?.res?.responseUrl || urlStr;

    const title = $("title").text() || "No title";
    const description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "No description";
    const keywords =
      $('meta[name="keywords"]').attr("content") || "No keywords";
    const author = $('meta[name="author"]').attr("content") || "Unknown";
    const ogTitle = $('meta[property="og:title"]').attr("content") || "";
    const ogImage = $('meta[property="og:image"]').attr("content") || "";
    const twitterCard = $('meta[name="twitter:card"]').attr("content") || "";

    const inspectData = {
      "📝 Title": title.substring(0, 100),
      "📋 Description": description.substring(0, 100),
      "🏷️ Keywords": keywords.substring(0, 100),
      "✍️ Author": author,
      "🔗 Final URL":
        finalUrl.length > 60 ? finalUrl.substring(0, 57) + "..." : finalUrl,
      "📊 Status": response.status,
      "📦 Size": `${(String(response.data).length / 1024).toFixed(2)} KB`,
      "📎 Links": $("a[href]").length,
      "🖼️ Images": $("img").length,
      "📜 Scripts": $("script").length,
      "🎨 Styles": $('style, link[rel="stylesheet"]').length,
    };

    if (ogTitle) inspectData["📢 OG Title"] = ogTitle;
    if (ogImage) inspectData["🖼️ OG Image"] = ogImage.substring(0, 80);
    if (twitterCard) inspectData["🐦 Twitter Card"] = twitterCard;

    await sock.sendMessage(from, {
      text: formatData("🔍 INSPECT RESULTS", inspectData),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not inspect website.\n\n💡 Error: ${error.message}`,
      ),
    });
  }
}

// ========== TREBLEBOOST ==========
export async function trebleboost({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.audioMessage) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "TREBLEBOOST",
          "Reply to an audio message with .trebleboost to boost treble.",
        ),
      });
      return;
    }

    await sock.sendMessage(from, { text: "⚡ *Boosting audio treble...*" });

    const stream = await downloadContentFromMessage(
      quoted.audioMessage,
      "audio",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const tempInput = path.join(tempDir, `audio_${Date.now()}.mp3`);
    const tempOutput = path.join(tempDir, `boosted_${Date.now()}.mp3`);
    fs.writeFileSync(tempInput, buffer);

    try {
      const { default: ffmpeg } = await import("fluent-ffmpeg");
      await new Promise((resolve, reject) => {
        ffmpeg(tempInput)
          .audioFilters("treble=gain=10")
          .on("end", resolve)
          .on("error", reject)
          .save(tempOutput);
      });
      const boostedBuffer = fs.readFileSync(tempOutput);
      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);
      await sock.sendMessage(from, {
        audio: boostedBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sock.sendMessage(from, {
        text: "⚡ *Treble Boosted Successfully!*\n👑 AYOCODES",
      });
    } catch (_) {
      // ffmpeg not available — return original with note
      try {
        fs.unlinkSync(tempInput);
      } catch (_) {}
      await sock.sendMessage(from, {
        audio: buffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sock.sendMessage(from, {
        text: "⚠️ *Returned original audio*\n(Install fluent-ffmpeg + ffmpeg binary for boost support)",
      });
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not process audio."),
    });
  }
}

// ========== JARVIS AI ASSISTANT ==========
export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS AI",
        "🤖 *Your Personal AI Assistant*\n\n👑 *Created by AYOCODES - The Tony Stark of AYOBOT*\n\n📌 *Usage:* .jarvis <your question>\n📋 *Examples:*\n▰ .jarvis What is the capital of Nigeria?\n▰ .jarvis Translate hello to French\n▰ .jarvis Calculate 25 * 48\n▰ .jarvis Who is AYOCODES?\n▰ .jarvis Activate Iron Man suit",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "🤖 *Jarvis is thinking...*" });

  const query = fullArgs.trim();
  const lowerQuery = query.toLowerCase();

  // About AYOCODES
  if (
    lowerQuery.includes("ayocodes") ||
    lowerQuery.includes("who made you") ||
    lowerQuery.includes("tony stark") ||
    lowerQuery.includes("creator")
  ) {
    const responses = [
      "👑 *AYOCODES* is the Tony Stark of this universe! The genius behind AYOBOT.",
      "Sir AYOCODES built me from scratch. Like Tony in a cave — but with better Wi-Fi! 🔧",
      "AYOCODES? Man, myth, legend! Our own Tony Stark. Genius, philanthropist, all-around awesome! 👨‍💻",
      "AYOCODES is the iron man of coding — the reason I exist! 👑",
    ];
    return sock.sendMessage(from, {
      text: formatSuccess(
        "👑 AYOCODES - THE TONY STARK",
        `${responses[Math.floor(Math.random() * responses.length)]}\n\n━━━━━━━━━━━━━━━━━━━━━\n📞 Contact: ${ENV.CREATOR_CONTACT || "N/A"}\n💻 GitHub: ${ENV.CREATOR_GITHUB}\n⚡ *I am Iron Man!*`,
      ),
    });
  }

  // Iron Man suit activation
  if (
    lowerQuery.includes("activate suit") ||
    lowerQuery.includes("iron man") ||
    lowerQuery.includes("suit up") ||
    lowerQuery.includes("mark suit")
  ) {
    const suits = [
      "Mark LXXXV (Mark 85) - Nanotech Suit",
      "Mark L (Mark 50) - Bleeding Edge",
      "Mark XLIV - Hulkbuster",
      "Mark VII - Avengers Suit",
      "Mark III - Classic Gold Titanium",
    ];
    const randomSuit = suits[Math.floor(Math.random() * suits.length)];
    return sock.sendMessage(from, {
      text: `╔══════════════════════════════════════╗\n║     🤖 *IRON MAN SUIT ACTIVATION*   ║\n╚══════════════════════════════════════╝\n\n⚡ *Initiating:* ${randomSuit}\n🔋 *Arc Reactor:* 100%\n🛡️ *Defense:* Online\n🎯 *Targeting:* Calibrated by AYOCODES\n💪 *Repulsors:* Ready\n🔥 *Unibeam:* Charged\n✅ *Suit fully operational!*\n\n👑 *AYOCODES - The Iron Man of AYOBOT*\n💬 *"I am Iron Man."*`,
    });
  }

  // Weather detection
  if (lowerQuery.includes("weather") || lowerQuery.includes("temperature")) {
    if (ENV.OPENWEATHER_KEY) {
      const cityMatch = query.match(/(?:in|at|for)\s+([a-zA-Z\s]+?)(?:\?|$)/i);
      const city = cityMatch ? cityMatch[1].trim() : null;
      if (city) {
        try {
          const weatherRes = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${ENV.OPENWEATHER_KEY}&units=metric`,
            { timeout: 8000 },
          );
          const w = weatherRes.data;
          return sock.sendMessage(from, {
            text: formatSuccess(
              "JARVIS - WEATHER",
              `🌤️ *Weather in ${city}:*\n\n🌡️ Temperature: ${w.main.temp}°C\n🤔 Feels like: ${w.main.feels_like}°C\n💧 Humidity: ${w.main.humidity}%\n🌬️ Wind: ${w.wind.speed} m/s\n☁️ Conditions: ${w.weather[0].description}\n\n👑 *AYOCODES* - Keeping you informed!`,
            ),
          });
        } catch (_) {}
      }
    }
  }

  // Math detection
  const mathMatch =
    query.match(/(?:calculate|calc|what is|=|compute|solve)\s*(.+)/i) ||
    query.match(/^[\d\s\+\-\*\/\(\)\.\^%]+$/);
  if (mathMatch) {
    const expr = mathMatch[1] || mathMatch[0];
    try {
      const { evaluate } = await import("mathjs");
      const result = evaluate(expr.trim());
      return sock.sendMessage(from, {
        text: formatSuccess(
          "JARVIS - CALCULATION",
          `🧮 *Expression:* ${expr.trim()}\n\n✅ *Result:* ${result}\n\n👑 *AYOCODES* - Stark level processing!`,
        ),
      });
    } catch (_) {}
  }

  // Time/Date
  if (lowerQuery.match(/\b(time|date|day|today|clock|now)\b/)) {
    const now = new Date();
    return sock.sendMessage(from, {
      text: formatSuccess(
        "JARVIS - TIME",
        `🕐 *Current Time:* ${now.toLocaleTimeString()}\n📅 *Date:* ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n👑 *AYOCODES* - Time tracking like a Stark`,
      ),
    });
  }

  // Translation
  const transMatch = query.match(/translate\s+['"]?(.+?)['"]?\s+to\s+(\w+)/i);
  if (transMatch) {
    const [, text, lang] = transMatch;
    try {
      const res = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`,
      );
      const translated = res.data[0][0][0];
      return sock.sendMessage(from, {
        text: formatSuccess(
          "JARVIS - TRANSLATION",
          `🔤 *Original:* ${text}\n🌍 *Language:* ${lang}\n📝 *Translation:* ${translated}\n\n👑 *AYOCODES*`,
        ),
      });
    } catch (_) {}
  }

  // Fallback: Tony Stark themed responses
  const responses = [
    `"${query}" — Processing at Stark-level speed. Working on it, sir.`,
    `Analyzing: "${query}" — Like Tony Stark in his lab.`,
    `Query received: "${query}" — AYOCODES engineered me for this.`,
    `Running diagnostics on: "${query}" — Jarvis online and operational.`,
  ];
  const tonyQuotes = [
    "Sometimes you gotta run before you can walk. - *AYOCODES* lives by this.",
    "I am Iron Man. - *AYOCODES* is the Iron Man of coding.",
    "I love you 3000. - *AYOCODES* loves his users 3000.",
    "We have a Hulk. - *AYOCODES* has AYOBOT.",
  ];

  await sock.sendMessage(from, {
    text: `🤖 *JARVIS v2.0 - Powered by AYOCODES*\n\n"${responses[Math.floor(Math.random() * responses.length)]}"\n\n━━━━━━━━━━━━━━━━━━━━━\n💭 *"${tonyQuotes[Math.floor(Math.random() * tonyQuotes.length)]}"\n\n👑 *AYOCODES - The Tony Stark of AYOBOT*\n\n⚡ *AYOBOT v1* | Created by AYOCODES`,
  });
}

// ========== JARVIS VOICE MODE ==========
export async function jarvisVoice({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS VOICE",
        "Usage: .jarvisv <text>\nExample: .jarvisv Good morning sir",
      ),
    });
    return;
  }

  await sock.sendMessage(from, {
    text: "🔊 *Jarvis generating voice response...*",
  });

  try {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(fullArgs)}&tl=en&client=tw-ob`;
    const response = await axios.get(ttsUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://translate.google.com/",
      },
      timeout: 10000,
    });

    await sock.sendMessage(from, {
      audio: Buffer.from(response.data),
      mimetype: "audio/mpeg",
      ptt: true,
    });
    await sock.sendMessage(from, {
      text: `🔊 *Jarvis says:*\n"${fullArgs}"\n\n👑 *AYOCODES - The Tony Stark of AYOBOT*`,
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError(
        "VOICE ERROR",
        "Could not generate voice. Even Stark tech has off days!",
      ),
    });
  }
}

// ========== JARVIS STATUS ==========
export async function jarvisStatus({ from, sock }) {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const memory = process.memoryUsage();
  const memoryUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
  const memoryTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);

  await sock.sendMessage(from, {
    text: `╔══════════════════════════════════════╗\n║   🤖 *JARVIS SYSTEM STATUS*        ║\n╠══════════════════════════════════════╣\n║  👨‍🔧 *Creator:* AYOCODES              ║\n╚══════════════════════════════════════╝\n\n⏱️ *Uptime:* ${days}d ${hours}h ${minutes}m ${seconds}s\n💾 *Memory:* ${memoryUsed}MB / ${memoryTotal}MB\n🔋 *Arc Reactor:* ██████████ 100%\n🛡️ *Defense:* Online\n📡 *Network:* Connected\n🎯 *Targeting:* Calibrated by AYOCODES\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👑 *AYOCODES - The Tony Stark of AYOBOT*\n📞 *Contact:* ${ENV.CREATOR_CONTACT || "N/A"}\n💬 *"I am Iron Man."*\n\n⚡ *AYOBOT v1* | Created by AYOCODES`,
  });
}

// ========== IRON MAN STATUS ==========
export async function ironmanStatus({ from, sock }) {
  const suits = [
    "Mark LXXXV (85) - Nanotech - *AYOCODES Edition*",
    "Mark L (50) - Bleeding Edge - *Coded by AYOCODES*",
    "Mark XLIV - Hulkbuster - *AYOCODES Heavy Duty*",
    "Mark III - Classic Gold Titanium - *AYOCODES Classic*",
    "Mark VII - Avengers Suit - *AYOCODES Avengers Edition*",
  ];
  const randomSuit = suits[Math.floor(Math.random() * suits.length)];

  await sock.sendMessage(from, {
    text: `╔══════════════════════════════════════╗\n║     🤖 *IRON MAN SUIT STATUS*      ║\n╠══════════════════════════════════════╣\n║  👨‍🔧 *Pilot:* AYOCODES               ║\n╚══════════════════════════════════════╝\n\n⚡ *Current Suit:* ${randomSuit}\n🔋 *Arc Reactor:* ██████████ 100%\n🛡️ *Defense:* Online\n🎯 *Targeting:* Calibrated by AYOCODES\n📡 *JARVIS Link:* Connected\n💪 *Repulsors:* Ready to blast\n🔥 *Unibeam:* Charged to 3000%\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👑 *AYOCODES - The Tony Stark of AYOBOT*\n📞 *Contact:* ${ENV.CREATOR_CONTACT || "N/A"}\n💬 *"I am Iron Man."*\n\n⚡ *AYOBOT v1* | Created by AYOCODES`,
  });
}

// ========== VCF CONTACT CREATOR ==========
export async function vcf({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "VCF",
        "Usage: .vcf <name>|<phone>\nExample: .vcf John Doe|2349159180375",
      ),
    });
    return;
  }

  const parts = fullArgs.split("|");
  if (parts.length < 2) {
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Format: .vcf <name>|<phone>"),
    });
  }

  const name = parts[0].trim();
  const phone = parts[1].trim().replace(/[^0-9+]/g, "");

  if (!phone || phone.replace(/\+/g, "").length < 7) {
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Invalid phone number."),
    });
  }

  const vcfContent = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEND:VCARD`;
  const filename = `${name.replace(/[^a-z0-9]/gi, "_")}.vcf`;

  await sock.sendMessage(from, {
    document: Buffer.from(vcfContent, "utf-8"),
    mimetype: "text/vcard",
    fileName: filename,
    caption: `📇 *Contact Created*\n👤 ${name}\n📞 ${phone}`,
  });
}

// ========== VIEW VCF ==========
export async function viewvcf({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.documentMessage) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "VIEWVCF",
          "Reply to a VCF file with .viewvcf to view its contents.",
        ),
      });
      return;
    }

    const mime = quoted.documentMessage.mimetype || "";
    const fname = quoted.documentMessage.fileName || "";
    if (
      !mime.includes("vcard") &&
      !mime.includes("vcf") &&
      !fname.endsWith(".vcf")
    ) {
      return sock.sendMessage(from, {
        text: formatError(
          "NOT VCF",
          "The replied file is not a VCF/vCard file.",
        ),
      });
    }

    await sock.sendMessage(from, { text: "👁️ *Reading VCF file...*" });

    const stream = await downloadContentFromMessage(
      quoted.documentMessage,
      "document",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const vcfContent = buffer.toString("utf-8");
    const nameMatch = vcfContent.match(/FN:([^\r\n]+)/);
    const phoneMatch = vcfContent.match(/TEL[^:]*:([^\r\n]+)/);
    const emailMatch = vcfContent.match(/EMAIL[^:]*:([^\r\n]+)/);
    const orgMatch = vcfContent.match(/ORG:([^\r\n]+)/);

    const vcfData = {
      "👤 Name": nameMatch ? nameMatch[1].trim() : "Unknown",
      "📞 Phone": phoneMatch ? phoneMatch[1].trim() : "Unknown",
    };
    if (emailMatch) vcfData["📧 Email"] = emailMatch[1].trim();
    if (orgMatch) vcfData["🏢 Organization"] = orgMatch[1].trim();
    vcfData["📄 Format"] = "VCF v3.0";

    await sock.sendMessage(from, { text: formatData("VCF CONTACT", vcfData) });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not read VCF file."),
    });
  }
}

// ========== DEFAULT EXPORT ==========
export default {
  menu,
  ping,
  status,
  creator,
  creatorGit,
  auto,
  weather,
  shorten,
  viewOnce,
  joinWaitlist,
  scrape,
  connectInfo,
  time,
  pdf,
  getip,
  ip,
  myip,
  whois,
  dns,
  getpp,
  getgpp,
  prefixinfo,
  platform,
  url,
  fetch,
  qencode,
  take,
  imgbb,
  screenshot,
  inspect,
  trebleboost,
  jarvis,
  jarvisVoice,
  jarvisStatus,
  ironmanStatus,
  vcf,
  viewvcf,
};
