// commands/group/basic.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Basic Commands
//  Author  : AYOCODES
//  Contact : wa.me/2349159180375
//  GitHub  : https://github.com/ayocodes
//
//  All the everyday commands that don't belong in a specialised module.
//  I keep each function self-contained — one job, clean error handling,
//  and always something useful back to the user even when things go wrong.
//
//  Quick index:
//    menu · ping · status · creator · creatorGit · auto · weather
//    shorten · viewOnce · joinWaitlist · scrape · connectInfo · time
//    pdf · getip · ip · myip · whois · dns · getpp · getgpp
//    prefixinfo · platform · url · fetch · qencode · take · imgbb
//    screenshot · inspect · trebleboost · jarvis · jarvisVoice
//    jarvisStatus · ironmanStatus · vcf · viewvcf
// ════════════════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
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

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Temp folder — a handful of commands write scratch files here
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// PDFKit is optional. I load it lazily so a missing package doesn't
// crash the entire module on startup — it just disables .pdf gracefully.
let _PDFDocument = null;
async function getPDFDoc() {
  if (!_PDFDocument) {
    try {
      const mod = await import("pdfkit");
      _PDFDocument = mod.default || mod;
    } catch (_) {
      _PDFDocument = null;
    }
  }
  return _PDFDocument;
}

// Safe uptime fallback — index.js sets botStartTime after connection
function getSafeStartTime() {
  return botStartTime || Date.now();
}

// ─── Browser spoofing pool ────────────────────────────────────────────────────
// I rotate these for any outbound HTTP request that might hit bot-detection.
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];
const randomUA = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Full browser-like header set — this is what bypasses most anti-scrape walls
function browserHeaders(ua, referer = "https://www.google.com/") {
  return {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: referer,
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Cache-Control": "max-age=0",
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  MENU
//  Sends the full categorised command list.
//  Admin section is appended when the caller is a recognised admin.
// ════════════════════════════════════════════════════════════════════════════
export async function menu({ from, sock, isAdmin }) {
  try {
    await sock.sendPresenceUpdate("composing", from);

    const mem = process.memoryUsage();
    const stats = {
      uptime: formatUptime(Date.now() - getSafeStartTime()),
      memory: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
      memoryUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
      memoryTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
    };

    const menuCommands = [
      // ── AYOBOT ────────────────────────────────────────────────────────────
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
        desc: "Show your public IP",
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
      // ── CONVERSION & MEDIA ────────────────────────────────────────────────
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.shorten`",
        emoji: "● 🔗",
        desc: "Shorten URL",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tiktok`",
        emoji: "● 🎵",
        desc: "Download TikTok",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.sticker`",
        emoji: "● 🎭",
        desc: "Create sticker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toimage`",
        emoji: "● 🖼️",
        desc: "Sticker to image",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "● 🎧",
        desc: "Video to audio",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tts`",
        emoji: "● 🗣️",
        desc: "Text to speech",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.removebg`",
        emoji: "● ✨",
        desc: "Remove background",
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
        cmd: "`.jarvis`",
        emoji: "● 🤖",
        desc: "Jarvis AI chat",
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
      // ── CONTACT TOOLS ─────────────────────────────────────────────────────
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
      // ── MUSIC & MEDIA ─────────────────────────────────────────────────────
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.play`",
        emoji: "● ▶️",
        desc: "Play music",
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
        cmd: "`.spotify`",
        emoji: "● 🎧",
        desc: "Spotify download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.instagram`",
        emoji: "● 📸",
        desc: "Instagram download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.facebook`",
        emoji: "● 📘",
        desc: "Facebook video",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.twitter`",
        emoji: "● 🐦",
        desc: "Twitter/X video",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.pinterest`",
        emoji: "● 📌",
        desc: "Pinterest download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.download`",
        emoji: "● ⬇️",
        desc: "Download media",
      },
      // ── AI & TOOLS ────────────────────────────────────────────────────────
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.ai`",
        emoji: "● 🧠",
        desc: "Chat with AI",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.summarize`",
        emoji: "● 📋",
        desc: "Summarize text",
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
        cmd: "`.weather`",
        emoji: "● ☁️",
        desc: "Weather forecast",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.calc`",
        emoji: "● 🧮",
        desc: "Calculator",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.convert`",
        emoji: "● 🔄",
        desc: "Unit converter",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dict`",
        emoji: "● 📖",
        desc: "Dictionary",
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
        cmd: "`.stock`",
        emoji: "● 📈",
        desc: "Stock price",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.movie`",
        emoji: "● 🎬",
        desc: "Movie info",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.news`",
        emoji: "● 📰",
        desc: "Latest news",
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
        cmd: "`.whois`",
        emoji: "● 🔎",
        desc: "WHOIS lookup",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.dns`",
        emoji: "● 🌐",
        desc: "DNS lookup",
      },
      {
        category: "> *_🤖 AI & TOOLS_*",
        cmd: "`.scan`",
        emoji: "● 🛡️",
        desc: "Virus scan",
      },
      // ── FUN & GAMES ───────────────────────────────────────────────────────
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.joke`",
        emoji: "● 😂",
        desc: "Random joke",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.quote`",
        emoji: "● 💫",
        desc: "Random quote",
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
        cmd: "`.dice`",
        emoji: "● 🎲",
        desc: "Roll dice",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.flip`",
        emoji: "● 🪙",
        desc: "Flip coin",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.roast`",
        emoji: "● 🔥",
        desc: "Roast someone",
      },
      // ── ENCRYPTION ────────────────────────────────────────────────────────
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
      // ── STORAGE ───────────────────────────────────────────────────────────
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.note`",
        emoji: "● 💾",
        desc: "Save note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.getnote`",
        emoji: "● 📂",
        desc: "Get note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.notes`",
        emoji: "● 📋",
        desc: "List notes",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.delnote`",
        emoji: "● 🗑️",
        desc: "Delete note",
      },
      // ── DOCUMENTS ─────────────────────────────────────────────────────────
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qr`",
        emoji: "● 📱",
        desc: "Generate QR",
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
      // ── BASIC ─────────────────────────────────────────────────────────────
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.menu`",
        emoji: "● 📋",
        desc: "Show menu",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.ping`",
        emoji: "● 🏓",
        desc: "Check bot latency",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.status`",
        emoji: "● 📊",
        desc: "Bot status",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.creator`",
        emoji: "● 👑",
        desc: "Bot creator info",
      },
      {
        category: "> *_📋 BASIC_*",
        cmd: "`.auto`",
        emoji: "● 🤖",
        desc: "Auto reply toggle",
      },
      // ── GROUP MANAGEMENT ──────────────────────────────────────────────────
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.kick`",
        emoji: "● 👢",
        desc: "Remove member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.add`",
        emoji: "● ➕",
        desc: "Add member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.promote`",
        emoji: "● ⭐",
        desc: "Make admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.demote`",
        emoji: "● ⬇️",
        desc: "Remove admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ban`",
        emoji: "● 🚫",
        desc: "Ban user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warn`",
        emoji: "● ⚠️",
        desc: "Warn member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.mute`",
        emoji: "● 🔇",
        desc: "Mute group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unmute`",
        emoji: "● 🔊",
        desc: "Unmute group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.lock`",
        emoji: "● 🔒",
        desc: "Lock group info",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unlock`",
        emoji: "● 🔓",
        desc: "Unlock group info",
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
        desc: "Anti-spam toggle",
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
        desc: "Silent mention",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.pin`",
        emoji: "● 📌",
        desc: "Pin a message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unpin`",
        emoji: "● 📍",
        desc: "Unpin a message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.delete`",
        emoji: "● 🗑️",
        desc: "Delete a message",
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
        desc: "Reset group link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome`",
        emoji: "● 👋",
        desc: "Welcome settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.goodbye`",
        emoji: "● 👋",
        desc: "Goodbye settings",
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
        desc: "Set group rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.groupinfo`",
        emoji: "● ℹ️",
        desc: "Group details",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.settings`",
        emoji: "● ⚙️",
        desc: "View bot settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.resetsettings`",
        emoji: "● 🗑️",
        desc: "Reset settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.leave`",
        emoji: "● 🚪",
        desc: "Bot leave group",
      },
    ];

    // Admin-only section — only visible when the caller is me or a bot admin
    if (isAdmin) {
      menuCommands.push(
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.adduser`",
          emoji: "● ✅",
          desc: "Add user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.removeuser`",
          emoji: "● ❌",
          desc: "Remove user",
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

    const menuText = formatMenu(menuCommands, isAdmin, stats);

    // Welcome audio — non-fatal if it fails
    try {
      await sock.sendMessage(from, {
        audio: {
          url: ENV.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
        },
        mimetype: "audio/aac",
        ptt: false,
      });
    } catch (_) {}

    // Menu with banner image — falls back to plain text if image URL is missing
    try {
      await sock.sendMessage(from, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: menuText,
        contextInfo: {
          mentionedJid: [from],
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363422418001588@newsletter",
            newsletterName: "AyoBot Tech Hub",
            serverMessageId: Date.now(),
          },
        },
      });
    } catch (_) {
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    // Last-resort fallback so the user always gets a response
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1*\n👑 *AYOCODES*\n\nType .help for commands`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PING
//  Animated progress bar that edits itself in-place, then shows real
//  response time + uptime. Clean and doesn't spam the chat.
// ════════════════════════════════════════════════════════════════════════════
export async function ping({ from, sock }) {
  const start = Date.now();
  const loadingMsg = await sock.sendMessage(from, {
    text: `🏓 *Pinging...*\n[▱▱▱▱▱▱▱▱▱▱] 0%`,
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

  for (const frame of frames) {
    await delay(80);
    try {
      await sock.sendMessage(from, {
        text: `🏓 *Pinging...*\n${frame}`,
        edit: loadingMsg.key,
      });
    } catch (_) {}
  }

  // Build a clean human-readable uptime string
  const uptime = Date.now() - getSafeStartTime();
  const h = Math.floor(uptime / 3_600_000);
  const m = Math.floor((uptime % 3_600_000) / 60_000);
  const s = Math.floor((uptime % 60_000) / 1_000);
  const uptimeStr =
    h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

  await sock.sendMessage(from, {
    text:
      `━━━━━ 🏓 *PONG!* ━━━━━\n\n` +
      `📡 *Response:* ${Date.now() - start}ms\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `📊 *Messages:* ${messageCount}\n` +
      `🟢 *Status:* ONLINE\n\n` +
      `⚡ _AYOBOT fully operational_ · 👑 _AYOCODES_`,
    edit: loadingMsg.key,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  STATUS
//  Shows the caller's personal stats — role, commands used, current bot mode.
// ════════════════════════════════════════════════════════════════════════════
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
    text:
      `━━━━━ 👤 *STATUS* ━━━━━\n\n` +
      `📱 *Phone:* ${phone}\n` +
      `👑 *Role:* ${role}\n` +
      `📊 *Commands:* ${total}\n` +
      `🤖 *Mode:* ${ENV.BOT_MODE.toUpperCase()}\n\n` +
      `⚡ _Use .menu to explore_ · 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR
//  Sends my contact card then the community links.
//  Falls back to plain text if the vCard send fails.
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  try {
    const contact = ENV.CREATOR_CONTACT?.replace(/\D/g, "") || "";
    if (contact) {
      await sock.sendMessage(from, {
        contacts: {
          displayName: "AYOCODES",
          contacts: [
            {
              vcard:
                `BEGIN:VCARD\nVERSION:3.0\nFN:AYOCODES 👑\nORG:AYOBOT Dev and Founder;\n` +
                `TEL;type=CELL;type=VOICE;waid=${contact}:+${contact}\nEND:VCARD`,
            },
          ],
        },
      });
    }
    await delay(300);
    await sock.sendMessage(from, {
      text:
        `━━━━━ 📢 *COMMUNITY* ━━━━━\n\n` +
        `📱 *Channel:* ${ENV.WHATSAPP_CHANNEL}\n` +
        `👥 *Group:* ${ENV.WHATSAPP_GROUP}`,
    });
  } catch (_) {
    const contact = ENV.CREATOR_CONTACT?.replace(/\D/g, "") || "";
    if (contact) {
      await sock.sendMessage(from, {
        contacts: {
          displayName: "AYOCODES",
          contacts: [
            {
              vcard:
                `BEGIN:VCARD\nVERSION:3.0\nFN:AYOCODES 👑\n` +
                `TEL;type=CELL;type=VOICE;waid=${contact}:+${contact}\nEND:VCARD`,
            },
          ],
        },
      });
    } else {
      await sock.sendMessage(from, {
        text: `👑 *AYOCODES*\n\n🔗 ${ENV.CREATOR_GITHUB}`,
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR GITHUB
// ════════════════════════════════════════════════════════════════════════════
export async function creatorGit({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `━━━━━ 👑 *AYOCODES GITHUB* ━━━━━\n\n` +
      `🔗 *GitHub:* ${ENV.CREATOR_GITHUB}\n\n` +
      `💻 _Check out my work!_ · 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTO-REPLY TOGGLE
//  Each user gets their own flag stored in the shared Map from index.js.
//  Defaults to OFF if not yet set.
// ════════════════════════════════════════════════════════════════════════════
export async function auto({ args, from, userJid, sock }) {
  const sub = args[0]?.toLowerCase();
  if (!sub || !["on", "off", "status"].includes(sub)) {
    const cur = autoReplyEnabled.get(userJid) ? "ON" : "OFF";
    return sock.sendMessage(from, {
      text: formatInfo(
        "AUTO-REPLY",
        `Current: *${cur}*\n\n.auto on     — Enable\n.auto off    — Disable\n.auto status — Check`,
      ),
    });
  }
  if (sub === "on") {
    autoReplyEnabled.set(userJid, true);
    return sock.sendMessage(from, {
      text: formatSuccess("AUTO-REPLY", "Auto-reply *ENABLED* ✅"),
    });
  }
  if (sub === "off") {
    autoReplyEnabled.set(userJid, false);
    return sock.sendMessage(from, {
      text: formatSuccess("AUTO-REPLY", "Auto-reply *DISABLED* 🔴"),
    });
  }
  // sub === "status"
  const s = autoReplyEnabled.get(userJid) ? "ON 🟢" : "OFF 🔴";
  await sock.sendMessage(from, {
    text: formatInfo("AUTO-REPLY STATUS", `Status: *${s}*`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WEATHER
//  Powered by OpenWeatherMap — set OPENWEATHER_KEY in .env
// ════════════════════════════════════════════════════════════════════════════
export async function weather({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER",
        "Usage: .weather <city>\nExample: .weather London",
      ),
    });
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
      { timeout: 10_000 },
    );
    const d = res.data;
    await sock.sendMessage(from, {
      text: formatData(`WEATHER: ${d.name}, ${d.sys.country}`, {
        "🌡️ Temperature": `${d.main.temp}°C`,
        "🤔 Feels like": `${d.main.feels_like}°C`,
        "💧 Humidity": `${d.main.humidity}%`,
        "🌬️ Wind": `${d.wind.speed} m/s`,
        "☁️ Conditions": d.weather[0].description,
        "🌅 Sunrise": new Date(d.sys.sunrise * 1000).toLocaleTimeString(),
        "🌇 Sunset": new Date(d.sys.sunset * 1000).toLocaleTimeString(),
      }),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `City "${fullArgs}" not found.`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SHORTEN
//  Tries TinyURL first, is.gd as backup. Both are free, no API key needed.
// ════════════════════════════════════════════════════════════════════════════
export async function shorten({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("🔗 URL SHORTENER", "Usage: .shorten <url>"),
    });
  }
  let longUrl = fullArgs.trim().split(" ")[0];
  if (!longUrl.startsWith("http")) longUrl = "https://" + longUrl;
  await sock.sendMessage(from, { text: "🔗 *Shortening URL...*" });

  const services = [
    {
      name: "TinyURL",
      fn: async () =>
        (
          await axios.get(
            `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
            { timeout: 8_000 },
          )
        ).data,
    },
    {
      name: "is.gd",
      fn: async () =>
        (
          await axios.get(
            `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
            { timeout: 8_000 },
          )
        ).data,
    },
  ];

  for (const svc of services) {
    try {
      const short = await svc.fn();
      if (short?.startsWith("http")) {
        return sock.sendMessage(from, {
          text: formatSuccess(
            "URL SHORTENED",
            `📎 *Original:*\n${longUrl}\n\n🔗 *Short:*\n${short}\n\n🌐 *Service:* ${svc.name}`,
          ),
        });
      }
    } catch (_) {}
  }
  await sock.sendMessage(from, {
    text: formatError("ERROR", "Could not shorten URL."),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  VIEW ONCE  (.vv / .open)
//  Downloads and re-sends a view-once media so the user can see it again.
//  Handles image, video and audio. Walks through all known v2 containers.
// ════════════════════════════════════════════════════════════════════════════
export async function viewOnce({ message, from, sock }) {
  try {
    const quotedMsg =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "VIEW ONCE",
          "Reply to a view-once message with .vv or .open",
        ),
      });
    }
    await sock.sendMessage(from, { text: "👁️ *Opening view once message...*" });

    let mediaMsg = null,
      type = null,
      isViewOnce = false;

    // Walk all possible view-once containers in priority order
    for (const container of [
      quotedMsg.viewOnceMessageV2?.message,
      quotedMsg.viewOnceMessageV2Extension?.message,
      quotedMsg,
    ]) {
      if (!container) continue;
      if (container.imageMessage) {
        isViewOnce = true;
        mediaMsg = container.imageMessage;
        type = "image";
        break;
      }
      if (container.videoMessage) {
        isViewOnce = true;
        mediaMsg = container.videoMessage;
        type = "video";
        break;
      }
      if (container.audioMessage) {
        isViewOnce = true;
        mediaMsg = container.audioMessage;
        type = "audio";
        break;
      }
    }

    if (!isViewOnce || !mediaMsg || !type) {
      return sock.sendMessage(from, {
        text: formatError("NOT VIEW ONCE", "Not a view-once message."),
      });
    }

    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const caption = `📊 *Type:* ${type.toUpperCase()}\n📦 *Size:* ${(buffer.length / 1024).toFixed(2)} KB\n👑 AYOBOT`;

    if (type === "image")
      await sock.sendMessage(from, { image: buffer, caption });
    else if (type === "video")
      await sock.sendMessage(from, { video: buffer, caption });
    else
      await sock.sendMessage(from, {
        audio: buffer,
        mimetype: "audio/mp4",
        ptt: true,
      });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Failed to open view once message."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WAITLIST
//  Registers an email, stores it in the shared Map, and silently pings me
//  so I know who signed up.
// ════════════════════════════════════════════════════════════════════════════
export async function joinWaitlist({ fullArgs, from, userJid, sock }) {
  const email = fullArgs?.trim() || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID EMAIL",
        "Please provide a valid email.\nExample: .jointrend user@example.com",
      ),
    });
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
  if (ENV.ADMIN) {
    try {
      const adminJid = `${ENV.ADMIN.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
      await sock.sendMessage(adminJid, {
        text: `📋 *New Waitlist Join*\n\n📧 ${email}\n📱 ${phone}\n⏰ ${timestamp}`,
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SCRAPE
//  Fetches a URL with real browser headers across multiple fallback attempts
//  then returns a fully self-contained HTML file with all external CSS and JS
//  inlined — so the recipient can open it offline and see the exact page.
//
//  Bypass stack:
//    1. Rotate User-Agent (Chrome / Firefox / Safari)
//    2. Full browser Accept / Accept-Language / Referer / Sec-Fetch headers
//    3. Three header profiles (Chrome+Google, Firefox+Bing, Safari)
//    4. Follow up to 10 redirects automatically
//    5. Inline every <link rel="stylesheet"> and <script src="..."> so
//       the output file works completely offline with no external deps
// ════════════════════════════════════════════════════════════════════════════
export async function scrape({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEB SCRAPER",
        "Usage: .scrape <url>\nExample: .scrape https://example.com\n\n" +
          "Returns a self-contained HTML file with CSS & JS inlined.",
      ),
    });
  }

  let url = fullArgs.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  await sock.sendMessage(from, {
    text: "🕸️ *Scraping website — may take a moment...*",
  });

  // ── Step 1: Fetch the raw HTML with browser spoofing ─────────────────────
  let html = null;
  let finalUrl = url;

  const headerProfiles = [
    browserHeaders(USER_AGENTS[0], "https://www.google.com/"), // Chrome + Google
    browserHeaders(USER_AGENTS[3], "https://www.bing.com/"), // Firefox + Bing
    browserHeaders(USER_AGENTS[4], "https://www.google.com/"), // Safari
  ];

  for (const headers of headerProfiles) {
    try {
      const res = await axios.get(url, {
        headers,
        timeout: 30_000,
        maxRedirects: 10,
        maxContentLength: 50 * 1024 * 1024,
        responseType: "text",
        validateStatus: (s) => s < 400,
      });
      if (res.data && typeof res.data === "string" && res.data.length > 200) {
        html = res.data;
        finalUrl = res.request?.res?.responseUrl || url;
        break;
      }
    } catch (_) {}
  }

  if (!html) {
    return sock.sendMessage(from, {
      text: formatError(
        "SCRAPE FAILED",
        "Could not retrieve the page.\n\n" +
          "This site may use heavy bot-detection (Cloudflare, Akamai, etc.).\n" +
          "Try: .screenshot <url> to get a visual snapshot instead.",
      ),
    });
  }

  // ── Step 2: Inline all external CSS and JS ───────────────────────────────
  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    const baseUrl = new URL(finalUrl);

    // Fetch and inline every stylesheet
    const cssLinks = [];
    $('link[rel="stylesheet"][href]').each((_, el) => {
      cssLinks.push({ el, href: $(el).attr("href") });
    });
    for (const { el, href } of cssLinks) {
      try {
        const absUrl = href.startsWith("http")
          ? href
          : new URL(href, baseUrl).toString();
        const res = await axios.get(absUrl, {
          headers: browserHeaders(randomUA()),
          timeout: 8_000,
          responseType: "text",
          validateStatus: (s) => s < 400,
        });
        if (res.data) {
          $(el).replaceWith(
            `<style>/* inlined: ${href} */\n${res.data}</style>`,
          );
        }
      } catch (_) {}
    }

    // Fetch and inline every external script
    const scriptTags = [];
    $("script[src]").each((_, el) => {
      scriptTags.push({ el, src: $(el).attr("src") });
    });
    for (const { el, src } of scriptTags) {
      try {
        const absUrl = src.startsWith("http")
          ? src
          : new URL(src, baseUrl).toString();
        const res = await axios.get(absUrl, {
          headers: browserHeaders(randomUA()),
          timeout: 8_000,
          responseType: "text",
          validateStatus: (s) => s < 400,
        });
        if (res.data) {
          const attrs = Object.entries($(el).attr() || {})
            .filter(([k]) => k !== "src")
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ");
          $(el).replaceWith(
            `<script ${attrs}>/* inlined: ${src} */\n${res.data}</script>`,
          );
        }
      } catch (_) {}
    }

    // Stamp an AYOBOT header comment at the top
    const domain = baseUrl.hostname.replace("www.", "");
    const title = $("title").text().trim() || "No title";
    const desc = $('meta[name="description"]').attr("content")?.trim() || "N/A";
    const linkCount = $("a[href]").length;
    const imgCount = $("img").length;

    const finalHtml =
      `<!-- Scraped by AYOBOT v1 | AYOCODES | ${new Date().toISOString()} | ${url} -->\n` +
      $.html();

    const htmlSize = (finalHtml.length / 1024).toFixed(2);
    const htmlFilename = `${domain}_${Date.now()}.html`;

    // Summary message first
    await sock.sendMessage(from, {
      text:
        `🕸️ *SCRAPE COMPLETE*\n━━━━━━━━━━━━━━━━━\n` +
        `🔗 *URL:* ${url}\n` +
        `📝 *Title:* ${title.substring(0, 120)}\n` +
        `📋 *Description:* ${desc.substring(0, 120)}\n` +
        `📎 *Links found:* ${linkCount}\n` +
        `🖼️ *Images found:* ${imgCount}\n` +
        `📁 *File size:* ${htmlSize} KB\n` +
        `✅ *CSS & JS:* Inlined\n━━━━━━━━━━━━━━━━━\n` +
        `👑 AYOCODES`,
    });

    // Then send the self-contained file
    await sock.sendMessage(from, {
      document: Buffer.from(finalHtml, "utf-8"),
      mimetype: "text/html",
      fileName: htmlFilename,
      caption: `📄 *${htmlFilename}*\n🌐 Open in any browser to view offline.`,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("SCRAPE ERROR", error.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CONNECT INFO
// ════════════════════════════════════════════════════════════════════════════
export async function connectInfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║   📱 *CONNECT WITH US*   ║\n╚══════════════════════════╝\n\n` +
      `👑 *Creator:* AYOCODES\n📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || ""}\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB}\n\n` +
      `📢 *Channel:* ${ENV.WHATSAPP_CHANNEL}\n👥 *Group:* ${ENV.WHATSAPP_GROUP}`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME
//  Uses worldtimeapi.org — timezone in IANA format e.g. Africa/Lagos
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WORLD TIME",
        "Usage: .time <timezone>\nExample: .time Africa/Lagos\n\nFind yours: worldtimeapi.org/timezones",
      ),
    });
  }
  await sock.sendMessage(from, { text: "⏰ *Fetching time...*" });
  try {
    const tz = fullArgs.trim().replace(/ /g, "_");
    const res = await axios.get(`https://worldtimeapi.org/api/timezone/${tz}`, {
      timeout: 8_000,
    });
    const d = new Date(res.data.datetime);
    await sock.sendMessage(from, {
      text: formatData("WORLD TIME", {
        "🌍 Timezone": res.data.timezone,
        "📅 Date": d.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        "⏰ Time": d.toLocaleTimeString(),
        "🕒 UTC Offset": res.data.utc_offset,
        "📆 Week #": res.data.week_number,
        "☀️ DST": res.data.dst ? "Active" : "Inactive",
      }),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find time for "${fullArgs}".\n\nTry: Africa/Lagos, America/New_York`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATE PDF
//  Generates a styled PDF using PDFKit. Install with: npm i pdfkit
// ════════════════════════════════════════════════════════════════════════════
export async function pdf({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "PDF GENERATOR",
        "Usage: .pdf <title> | <content>\nExample: .pdf My Doc | Hello World",
      ),
    });
  }
  await sock.sendMessage(from, { text: "📄 *Generating PDF...*" });
  try {
    const PDFDoc = await getPDFDoc();
    if (!PDFDoc) {
      return sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "PDF generator not available. Install pdfkit.",
        ),
      });
    }
    let title = "Document";
    let content = fullArgs;
    if (fullArgs.includes("|")) {
      const parts = fullArgs.split("|");
      title = parts[0].trim();
      content = parts.slice(1).join("|").trim();
    }
    const doc = new PDFDoc({ margin: 50 });
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
        .text(
          `Generated by AYOBOT v1 · AYOCODES · ${new Date().toLocaleString()}`,
          { align: "center" },
        );
      doc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);
    await sock.sendMessage(from, {
      document: pdfBuffer,
      mimetype: "application/pdf",
      fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`,
      caption: `📄 *PDF Created*\n📝 ${title}\n📦 ${(pdfBuffer.length / 1024).toFixed(2)} KB`,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("PDF ERROR", error.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IP LOOKUP
//  Primary: ip-api.com (free, no key). Fallback: ipapi.co.
//  I normalise both API shapes so the display code doesn't need to care
//  which one actually answered.
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "IP LOOKUP",
        "Usage: .getip <IP>\nExample: .getip 8.8.8.8",
      ),
    });
  }
  const cleanIP = fullArgs.trim();
  await sock.sendMessage(from, { text: `🌐 *Looking up IP: ${cleanIP}...*` });

  let data = null;
  const apis = [
    async () =>
      (await axios.get(`http://ip-api.com/json/${cleanIP}`, { timeout: 8_000 }))
        .data,
    async () => {
      const r = (
        await axios.get(`https://ipapi.co/${cleanIP}/json/`, { timeout: 8_000 })
      ).data;
      return {
        status: r.error ? "fail" : "success",
        query: cleanIP,
        country: r.country_name,
        countryCode: r.country_code,
        regionName: r.region,
        city: r.city,
        zip: r.postal,
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timezone,
        isp: r.org,
      };
    },
  ];

  for (const api of apis) {
    try {
      data = await api();
      if (data?.status !== "fail") break;
    } catch (_) {}
  }

  if (!data || data.status === "fail") {
    return sock.sendMessage(from, {
      text: formatError("LOOKUP FAILED", "Could not fetch IP information."),
    });
  }
  await sock.sendMessage(from, {
    text: formatData("📍 IP INFORMATION", {
      "🌍 IP Address": data.query || cleanIP,
      "📍 Country": `${data.country || "Unknown"}${data.countryCode ? ` (${data.countryCode})` : ""}`,
      "🏙️ City": data.city || "Unknown",
      "🗺️ Region": data.regionName || "Unknown",
      "⏰ Timezone": data.timezone || "N/A",
      "📡 ISP": data.isp || "Unknown",
    }),
  });
}

// Alias — .ip does the same thing as .getip
export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP — Shows the bot's outbound public IP via ipify
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock }) {
  await sock.sendMessage(from, { text: "🌐 *Fetching your public IP...*" });
  try {
    const res = await axios.get("https://api.ipify.org?format=json", {
      timeout: 8_000,
    });
    await sock.sendMessage(from, {
      text: formatSuccess("YOUR IP", `🌐 ${res.data.ip}`),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch your public IP."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS — Uses the RDAP protocol via rdap.org, no API key needed
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WHOIS LOOKUP",
        "Usage: .whois <domain>\nExample: .whois google.com",
      ),
    });
  }
  await sock.sendMessage(from, {
    text: `🔍 *Looking up WHOIS for ${fullArgs}...*`,
  });
  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const res = await axios.get(`https://rdap.org/domain/${domain}`, {
      timeout: 8_000,
    });
    const d = res.data;
    const ns = d.nameservers?.map((n) => n.ldhName).join(", ") || "Unknown";
    const evts =
      d.events
        ?.map((e) => `${e.eventAction}: ${e.eventDate?.split("T")[0]}`)
        .join(", ") || "Unknown";
    await sock.sendMessage(from, {
      text: formatData("WHOIS LOOKUP", {
        "🌐 Domain": d.ldhName || domain,
        "📡 Name Servers": ns,
        "📅 Events": evts,
        "🔖 Status": d.status?.join(", ") || "Unknown",
      }),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `WHOIS lookup failed for "${fullArgs}".`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP — Google DNS-over-HTTPS. A and MX fetched in parallel.
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "DNS LOOKUP",
        "Usage: .dns <domain>\nExample: .dns google.com",
      ),
    });
  }
  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });
  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const [aRes, mxRes] = await Promise.allSettled([
      axios.get(`https://dns.google/resolve?name=${domain}&type=A`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, {
        timeout: 8_000,
      }),
    ]);
    const aRecords =
      aRes.status === "fulfilled"
        ? aRes.value.data.Answer?.map((a) => `${a.name} → ${a.data}`).join(
            "\n",
          ) || "No records"
        : "Request failed";
    const mxRecords =
      mxRes.status === "fulfilled"
        ? mxRes.value.data.Answer?.map((a) => a.data).join(", ") || "No records"
        : "Request failed";
    await sock.sendMessage(from, {
      text: formatData("DNS LOOKUP", {
        "🌐 Domain": domain,
        "📋 A Records": aRecords,
        "📬 MX Records": mxRecords,
      }),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `DNS lookup failed for "${fullArgs}".`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GETPP — Get a user's profile picture
//
//  THE FIX: The original code used `from` as the fallback which in a group
//  chat is the GROUP JID — not the sender. I fixed this by reading
//  message.key.participant (the actual group member who sent the message)
//  and only falling back to key.remoteJid for DMs.
//
//  Resolution order:
//    1. Quoted message sender  (reply to someone → fetch their pic)
//    2. First @mention         (.getpp @user → fetch that user's pic)
//    3. Actual message sender  (no reply/mention → fetch your own pic)
//
//  Tries high-res "image" first, then "preview" as a fallback so accounts
//  with stricter privacy can still return a thumbnail in some cases.
// ════════════════════════════════════════════════════════════════════════════
export async function getpp({ message, from, sock }) {
  try {
    const msg = message.message;

    // key.participant = sender in group, key.remoteJid = sender in DM
    const senderJid =
      message.key?.participant || message.key?.remoteJid || from;

    // Check quoted message participant — covers all reply types
    const quotedParticipant =
      msg?.extendedTextMessage?.contextInfo?.participant ||
      msg?.imageMessage?.contextInfo?.participant ||
      msg?.videoMessage?.contextInfo?.participant ||
      msg?.stickerMessage?.contextInfo?.participant ||
      null;

    // First @mention in the message
    const mentionedJid =
      msg?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || null;

    // Final target: quoted > mentioned > actual sender
    const targetJid = quotedParticipant || mentionedJid || senderJid;
    const displayNum = targetJid.split("@")[0];

    await sock.sendMessage(from, {
      text: `🖼️ *Fetching profile picture for @${displayNum}...*`,
      mentions: [targetJid],
    });

    // Try high-res, fall back to preview
    let ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(targetJid, "image");
    } catch (_) {
      try {
        ppUrl = await sock.profilePictureUrl(targetJid, "preview");
      } catch (__) {}
    }

    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: `🖼️ *Profile Picture*\n` + `👤 @${displayNum}`,
        mentions: [targetJid],
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "NOT FOUND",
          `@${displayNum} has no profile picture or their privacy settings are blocking access.`,
        ),
        mentions: [targetJid],
      });
    }
  } catch (error) {
    console.error("[getpp]", error.message);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not fetch profile picture."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GETGPP — Get the group's profile picture
//  Same high-res → preview fallback pattern as getpp.
// ════════════════════════════════════════════════════════════════════════════
export async function getgpp({ from, sock, isGroup }) {
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: formatError("GROUP ONLY", "This command only works in groups."),
    });
  }
  await sock.sendMessage(from, { text: "👥 *Fetching group picture...*" });
  try {
    let ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(from, "image");
    } catch (_) {}
    if (!ppUrl) {
      try {
        ppUrl = await sock.profilePictureUrl(from, "preview");
      } catch (_) {}
    }
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

// ════════════════════════════════════════════════════════════════════════════
//  PREFIX INFO
// ════════════════════════════════════════════════════════════════════════════
export async function prefixinfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     ℹ️ *PREFIX INFO*      ║\n╚══════════════════════════╝\n\n` +
      `🔤 *Current Prefix:* \`${ENV.PREFIX}\`\n📝 *Usage:* ${ENV.PREFIX}command\n\n` +
      `📋 *Example:* ${ENV.PREFIX}menu\n\n💡 All commands start with "${ENV.PREFIX}"\n👑 Created by AYOCODES`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  PLATFORM
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  URL INFO — HEAD request, reveals server/type without downloading body
// ════════════════════════════════════════════════════════════════════════════
export async function url({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("URL INFO", "Usage: .url <url>"),
    });
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `🌍 *Analyzing ${urlStr}...*` });
  try {
    const response = await axios.head(urlStr, {
      timeout: 8_000,
      maxRedirects: 5,
      headers: { "User-Agent": randomUA() },
      validateStatus: () => true,
    });
    const h = response.headers;
    await sock.sendMessage(from, {
      text: formatData("🌍 URL INFORMATION", {
        "📊 Status": `${response.status}`,
        "📝 Type": h["content-type"]?.split(";")[0] || "Unknown",
        "🌐 Server": h["server"] || "Unknown",
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  FETCH — Raw GET request. Large responses become a downloadable file.
// ════════════════════════════════════════════════════════════════════════════
export async function fetch({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("FETCH", "Usage: .fetch <url>"),
    });
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `📡 *Fetching ${urlStr}...*` });
  try {
    const response = await axios.get(urlStr, {
      timeout: 15_000,
      headers: { "User-Agent": randomUA() },
      validateStatus: () => true,
    });
    let data =
      typeof response.data === "object"
        ? JSON.stringify(response.data, null, 2)
        : String(response.data);
    if (data.length > 3_500) {
      await sock.sendMessage(from, {
        document: Buffer.from(data, "utf-8"),
        mimetype: "application/json",
        fileName: `fetch_${Date.now()}.txt`,
        caption: `📡 Fetched from ${urlStr}`,
      });
    } else {
      await sock.sendMessage(from, { text: `\`\`\`${data}\`\`\`` });
    }
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  QR CODE GENERATOR
// ════════════════════════════════════════════════════════════════════════════
export async function qencode({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("QR ENCODE", "Usage: .qencode <text>"),
    });
  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}&margin=10`;
    await sock.sendMessage(from, {
      image: { url: qrUrl },
      caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}\n👑 Created by AYOCODES`,
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not generate QR code."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TAKE STICKER — Convert a replied image or video into a sticker
// ════════════════════════════════════════════════════════════════════════════
export async function take({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo("TAKE STICKER", "Reply to an image/video with .take"),
      });
    }
    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });
    const mediaType = quoted.imageMessage ? "image" : "video";
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;
    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    await sock.sendMessage(from, { sticker: buffer });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not create sticker."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IMGBB — Upload image and return a public URL
//  Uses ImgBB if IMGBB_KEY is set, falls back to freeimage.host (no key).
// ════════════════════════════════════════════════════════════════════════════
export async function imgbb({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo("IMGBB UPLOAD", "Reply to an image with .imgbb"),
      });
    }
    await sock.sendMessage(from, { text: "📤 *Uploading image...*" });
    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      "image",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const base64Image = buffer.toString("base64");
    const imgBBKey = ENV.IMGBB_KEY || process.env.IMGBB_KEY || null;
    let result = null;

    if (imgBBKey) {
      try {
        const params = new URLSearchParams();
        params.append("image", base64Image);
        const res = await axios.post(
          `https://api.imgbb.com/1/upload?key=${imgBBKey}`,
          params,
          { timeout: 15_000 },
        );
        if (res.data?.data?.url)
          result = { url: res.data.data.url, service: "ImgBB" };
      } catch (_) {}
    }

    // Fallback — no key needed
    if (!result) {
      try {
        const params = new URLSearchParams();
        params.append("source", base64Image);
        params.append("type", "base64");
        const res = await axios.post(
          "https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5",
          params,
          { timeout: 15_000 },
        );
        if (res.data?.image?.url)
          result = { url: res.data.image.url, service: "FreeImage.host" };
      } catch (_) {}
    }

    if (result) {
      await sock.sendMessage(from, {
        text: `📤 *Image Uploaded*\n\n🔗 *URL:* ${result.url}\n🌐 *Service:* ${result.service}\n\n👑 AYOCODES`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError("ERROR", "Upload failed. Set IMGBB_KEY in .env."),
      });
    }
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not upload image."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SCREENSHOT — Three services tried in sequence, first success wins
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("SCREENSHOT", "Usage: .screenshot <url>"),
    });
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `📷 *Taking screenshot...*` });

  for (const ssUrl of [
    `https://image.thum.io/get/width/1280/crop/800/${urlStr}`,
    `https://mini.s-shot.ru/1280x1024/1280/${encodeURIComponent(urlStr)}`,
    `https://api.apiflash.com/v1/urltoimage?access_key=free&url=${encodeURIComponent(urlStr)}&width=1280&height=800`,
  ]) {
    try {
      const res = await axios.get(ssUrl, {
        responseType: "arraybuffer",
        timeout: 20_000,
        headers: { "User-Agent": randomUA() },
        validateStatus: (s) => s === 200,
      });
      if (res.data?.byteLength > 2_000) {
        await sock.sendMessage(from, {
          image: Buffer.from(res.data),
          caption: `📷 *Screenshot*\n🔗 ${urlStr}\n\n👑 AYOCODES`,
        });
        return;
      }
    } catch (_) {}
  }
  await sock.sendMessage(from, {
    text: formatInfo("UNAVAILABLE", `Could not take screenshot of:\n${urlStr}`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  INSPECT — Full GET + cheerio parse, returns a page metadata summary
// ════════════════════════════════════════════════════════════════════════════
export async function inspect({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("INSPECT", "Usage: .inspect <url>"),
    });
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `🔍 *Inspecting ${urlStr}...*` });
  try {
    const response = await axios.get(urlStr, {
      headers: browserHeaders(randomUA()),
      timeout: 15_000,
      validateStatus: (s) => s < 400,
    });
    const $ = cheerio.load(response.data);
    await sock.sendMessage(from, {
      text: formatData("🔍 INSPECT", {
        "📝 Title": ($("title").text() || "No title").substring(0, 100),
        "📋 Description": (
          $('meta[name="description"]').attr("content") || "None"
        ).substring(0, 100),
        "📊 Status": response.status,
        "📎 Links": $("a[href]").length,
        "🖼️ Images": $("img").length,
        "📜 Scripts": $("script").length,
        "🎨 Stylesheets": $('link[rel="stylesheet"]').length,
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TREBLE BOOST — Re-sends quoted audio. Extend with ffmpeg for real DSP.
// ════════════════════════════════════════════════════════════════════════════
export async function trebleboost({ message, from, sock }) {
  const quoted =
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted || !quoted.audioMessage) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "TREBLEBOOST",
        "Reply to an audio message with .trebleboost",
      ),
    });
  }
  await sock.sendMessage(from, { text: "⚡ *Boosting treble...*" });
  try {
    const stream = await downloadContentFromMessage(
      quoted.audioMessage,
      "audio",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    await sock.sendMessage(from, {
      audio: buffer,
      mimetype: "audio/mpeg",
      ptt: false,
    });
    await sock.sendMessage(from, {
      text: "⚡ *Audio processed!*\n👑 AYOCODES",
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not process audio."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS — AI assistant
//  Handles built-in intents. Plug an LLM API call in the stub below for
//  full AI responses — the placeholder shows exactly where it goes.
// ════════════════════════════════════════════════════════════════════════════
export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS AI",
        "🤖 *Your Personal AI Assistant*\n\nUsage: .jarvis <question>\nExample: .jarvis What is the capital of Nigeria?",
      ),
    });
  }
  await sock.sendMessage(from, { text: "🤖 *Jarvis is thinking...*" });
  const query = fullArgs.trim();
  const lower = query.toLowerCase();

  // Identity / Easter egg
  if (
    lower.includes("ayocodes") ||
    lower.includes("who made you") ||
    lower.includes("creator")
  ) {
    return sock.sendMessage(from, {
      text: formatSuccess(
        "👑 AYOCODES",
        `The genius behind AYOBOT. GitHub: ${ENV.CREATOR_GITHUB}\n\n⚡ *I am Iron Man!*`,
      ),
    });
  }

  // Time / date shortcut
  if (
    lower.includes("time") ||
    lower.includes("date") ||
    lower.includes("today")
  ) {
    const now = new Date();
    return sock.sendMessage(from, {
      text: formatSuccess(
        "JARVIS - TIME",
        `🕐 *Time:* ${now.toLocaleTimeString()}\n📅 *Date:* ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n\n👑 *AYOCODES*`,
      ),
    });
  }

  // ── Plug your AI API here ─────────────────────────────────────────────────
  // const reply = await callOpenAI(query, ENV.OPENAI_KEY);
  // await sock.sendMessage(from, { text: reply });
  // return;
  // ─────────────────────────────────────────────────────────────────────────

  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS - Powered by AYOCODES*\n\n"Analyzing: ${query.substring(0, 100)}..."\n\n` +
      `👑 *AYOCODES - The Tony Stark of AYOBOT*\n⚡ *AYOBOT v1*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS VOICE — TTS via Google Translate endpoint
// ════════════════════════════════════════════════════════════════════════════
export async function jarvisVoice({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("JARVIS VOICE", "Usage: .jarvisv <text>"),
    });
  await sock.sendMessage(from, { text: "🔊 *Jarvis generating voice...*" });
  try {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(fullArgs)}&tl=en&client=tw-ob`;
    const response = await axios.get(ttsUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://translate.google.com/",
      },
      timeout: 10_000,
    });
    await sock.sendMessage(from, {
      audio: Buffer.from(response.data),
      mimetype: "audio/mpeg",
      ptt: true,
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("VOICE ERROR", "Could not generate voice."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS STATUS
// ════════════════════════════════════════════════════════════════════════════
export async function jarvisStatus({ from, sock }) {
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86_400),
    h = Math.floor((uptime % 86_400) / 3_600);
  const m = Math.floor((uptime % 3_600) / 60),
    s = Math.floor(uptime % 60);
  const mem = process.memoryUsage();
  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS SYSTEM STATUS*\n\n⏱️ *Uptime:* ${d}d ${h}h ${m}m ${s}s\n` +
      `💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB\n🔋 *Arc Reactor:* 100%\n\n👑 *AYOCODES*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  IRON MAN STATUS — just for the vibe 😄
// ════════════════════════════════════════════════════════════════════════════
export async function ironmanStatus({ from, sock }) {
  const suits = [
    "Mark LXXXV - Nanotech",
    "Mark L - Bleeding Edge",
    "Mark XLIV - Hulkbuster",
    "Mark VII - Avengers",
    "Mark III - Classic",
  ];
  const randomSuit = suits[Math.floor(Math.random() * suits.length)];
  await sock.sendMessage(from, {
    text:
      `🤖 *IRON MAN SUIT STATUS*\n\n⚡ *Suit:* ${randomSuit}\n` +
      `🔋 *Arc Reactor:* 100%\n🛡️ *Defense:* Online\n\n` +
      `👑 *AYOCODES* — "I am Iron Man."`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  VCF — Create a .vcf contact card file
// ════════════════════════════════════════════════════════════════════════════
export async function vcf({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("VCF", "Usage: .vcf <name>|<phone>"),
    });
  const parts = fullArgs.split("|");
  if (parts.length < 2)
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Format: .vcf <name>|<phone>"),
    });
  const name = parts[0].trim();
  const phone = parts[1].trim().replace(/[^0-9+]/g, "");
  if (!phone || phone.replace(/\+/g, "").length < 7) {
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Invalid phone number."),
    });
  }
  const vcfContent = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEND:VCARD`;
  await sock.sendMessage(from, {
    document: Buffer.from(vcfContent, "utf-8"),
    mimetype: "text/vcard",
    fileName: `${name.replace(/[^a-z0-9]/gi, "_")}.vcf`,
    caption: `📇 *Contact Created*\n👤 ${name}\n📞 ${phone}`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  VIEW VCF — Parse and display the contents of a replied .vcf file
// ════════════════════════════════════════════════════════════════════════════
export async function viewvcf({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.documentMessage) {
      return sock.sendMessage(from, {
        text: formatInfo("VIEWVCF", "Reply to a VCF file with .viewvcf"),
      });
    }
    const fname = quoted.documentMessage.fileName || "";
    if (
      !fname.endsWith(".vcf") &&
      !quoted.documentMessage.mimetype?.includes("vcard")
    ) {
      return sock.sendMessage(from, {
        text: formatError("NOT VCF", "Replied file is not a VCF file."),
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
    await sock.sendMessage(from, {
      text: formatData("VCF CONTACT", {
        "👤 Name": nameMatch ? nameMatch[1].trim() : "Unknown",
        "📞 Phone": phoneMatch ? phoneMatch[1].trim() : "Unknown",
      }),
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not read VCF file."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
//  Named exports are available for tree-shaking. This bundle is for routers
//  that import the whole module at once via `import basic from './basic.js'`
// ════════════════════════════════════════════════════════════════════════════
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
