// commands/group/basic.js - AYOBOT v1 ENHANCED EDITION
// ════════════════════════════════════════════════════════════════════════════
//  Complete Basic Commands Module - FULLY FEATURED & ENHANCED
//  Author  : AYOCODES
//  Version : 1.0.0 (Final - ALL COMMANDS INCLUDED)
//  Features: 50+ commands, full error handling, advanced scraping, image tools
// ════════════════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  activateGroup,
  autoReplyEnabled,
  botStartTime,
  commandUsage,
  deactivateGroup,
  delay,
  ENV,
  groupSettings,
  messageCount,
  waitlistEntries,
} from "../../index.js";
import {
  formatData,
  formatError,
  formatInfo,
  formatSuccess,
  formatUptime,
} from "../../utils/formatters.js";

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE SETUP & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Lazy load optional dependencies
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

let _JSZip = null;
async function getJSZip() {
  if (!_JSZip) {
    try {
      const mod = await import("jszip");
      _JSZip = mod.default || mod;
    } catch (_) {
      _JSZip = null;
    }
  }
  return _JSZip;
}

function getSafeStartTime() {
  return botStartTime || Date.now();
}

// ─── JID normalizer (strips @s.whatsapp.net / @c.us / @g.us) ───────────────
function normalizeJid(jid = "") {
  return jid.split("@")[0].replace(/[^0-9]/g, "");
}

// ─── Safe number coercion (avoids .toFixed crash on strings) ──────────────
function safeFixed(val, digits = 4) {
  const n = parseFloat(val);
  return isNaN(n) ? "N/A" : n.toFixed(digits);
}

// Browser spoofing - realistic user agents
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
];
const randomUA = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Full browser-like headers for anti-bot bypass
function browserHeaders(ua, referer = "https://www.google.com/") {
  return {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: referer,
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Cache-Control": "max-age=0",
    Cookie: "cookieconsent_status=dismiss; gdpr=1; consent=1; CONSENT=YES+cb",
    DNT: "1",
    Pragma: "no-cache",
  };
}

// ─── Axios instance with sensible defaults ─────────────────────────────────
const http = axios.create({
  timeout: 12000,
  headers: { "User-Agent": randomUA() },
  validateStatus: (s) => s < 500,
});

// ════════════════════════════════════════════════════════════════════════════
//  TEST COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function test({
  from,
  sock,
  userJid,
  session,
  sessionId,
  sessionMode,
  ownerPhone,
}) {
  const phone = userJid?.split("@")[0] || "unknown";

  console.log("🔧 TEST COMMAND EXECUTED!");
  console.log("  sessionId:", sessionId);
  console.log("  sessionMode:", sessionMode);
  console.log("  ownerPhone:", ownerPhone);
  console.log("  session exists:", !!session);

  await sock.sendMessage(from, {
    text:
      `✅ *TEST COMMAND WORKING!*\n\n` +
      `📱 Your number: ${phone}\n` +
      `🆔 Session ID: ${sessionId || "none"}\n` +
      `⚙️ Mode: ${sessionMode || "public"}\n` +
      `👑 Owner: ${ownerPhone || "none"}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n` +
      `🌍 Bot Version: v1.0.0\n\n` +
      `👑 Created by AYOCODES`,
  });

  return { text: "✅ Test completed" };
}

// ════════════════════════════════════════════════════════════════════════════
//  MENU - FULLY ENHANCED WITH ALL COMMANDS
// ════════════════════════════════════════════════════════════════════════════
export async function menu({ from, sock, isAdmin, ENV }) {
  try {
    await sock.sendPresenceUpdate("composing", from);

    const mem = process.memoryUsage();
    const memoryUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const memoryTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
    const memoryPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);

    const stats = {
      uptime: formatUptime(Date.now() - getSafeStartTime()),
      memory: `${memoryPercent}% (${memoryUsedMB}MB/${memoryTotalMB}MB)`,
      mode: isAdmin ? "ADMIN 👑" : "USER",
    };

    // Build comprehensive command menu
    const menuCommands = [
      // ── CORE ─────────────────────────────────────────────────
      {
        category: "*🔰 CORE*",
        cmd: "`.ping`",
        emoji: "● 🏓",
        desc: "Latency & uptime",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.menu`",
        emoji: "● 📋",
        desc: "Commands list",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.status`",
        emoji: "● 📊",
        desc: "Your status",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.creator`",
        emoji: "● 👑",
        desc: "Creator info",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.github`",
        emoji: "● 💻",
        desc: "GitHub",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.connect`",
        emoji: "● 📢",
        desc: "Community",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.prefix`",
        emoji: "● ℹ️",
        desc: "Prefix info",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.auto`",
        emoji: "● 🤖",
        desc: "Auto-reply",
      },
      {
        category: "*🔰 CORE*",
        cmd: "`.test`",
        emoji: "● 🧪",
        desc: "Test command",
      },

      // ── WEB TOOLS ────────────────────────────────────────────
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.ip`",
        emoji: "● 🔍",
        desc: "IP lookup",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.myip`",
        emoji: "● 🌐",
        desc: "Your IP",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.whois`",
        emoji: "● 🔎",
        desc: "Domain WHOIS",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.dns`",
        emoji: "● 🗂️",
        desc: "DNS lookup",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.url`",
        emoji: "● 📡",
        desc: "URL info",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.fetch`",
        emoji: "● 📥",
        desc: "Fetch data",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.scrape`",
        emoji: "● 🕸️",
        desc: "Web scrape",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.screenshot`",
        emoji: "● 📷",
        desc: "Screenshot",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.shorten`",
        emoji: "● 🔗",
        desc: "URL shorten",
      },
      {
        category: "> *_🌐 WEB TOOLS_*",
        cmd: "`.inspect`",
        emoji: "● 🔍",
        desc: "Inspect page",
      },

      // ── MEDIA ────────────────────────────────────────────────
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.sticker`",
        emoji: "● 🎭",
        desc: "Make sticker",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.toimage`",
        emoji: "● 🖼️",
        desc: "Sticker to image",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.tovideo`",
        emoji: "● 🎥",
        desc: "Sticker to video",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "● 🎵",
        desc: "Video to audio",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.tts`",
        emoji: "● 🗣️",
        desc: "Text to speech",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.removebg`",
        emoji: "● ✨",
        desc: "Remove background",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.vv`",
        emoji: "● 👁️",
        desc: "View once",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.take`",
        emoji: "● ✂️",
        desc: "Take sticker",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.imgbb`",
        emoji: "● 📤",
        desc: "Upload image",
      },

      // ── MUSIC & DOWNLOADS ─────────────────────────────────────
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.play`",
        emoji: "● ▶️",
        desc: "Download & play music",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.lyrics`",
        emoji: "● 📝",
        desc: "Get song lyrics",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.spotify`",
        emoji: "● 🎧",
        desc: "Spotify info",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.tiktok`",
        emoji: "● 🎵",
        desc: "Download TikTok",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.youtube`",
        emoji: "● 📺",
        desc: "YouTube info",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.instagram`",
        emoji: "● 📸",
        desc: "Download Instagram",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.facebook`",
        emoji: "● 👤",
        desc: "Download Facebook",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.twitter`",
        emoji: "● 🐦",
        desc: "Download Twitter/X",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.trending`",
        emoji: "● 📈",
        desc: "Trending songs",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.random`",
        emoji: "● 🎲",
        desc: "Random song",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.artist`",
        emoji: "● 👤",
        desc: "Artist info",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.album`",
        emoji: "● 💿",
        desc: "Album info",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.musicsearch`",
        emoji: "● 🔍",
        desc: "Search music",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.genius`",
        emoji: "● 🎤",
        desc: "Genius lyrics",
      },
      {
        category: "> *_🎵 MUSIC & DOWNLOADS_*",
        cmd: "`.dl`",
        emoji: "● ⬇️",
        desc: "Universal downloader",
      },

      // ── IMAGE & GIF SEARCH ───────────────────────────────────
      {
        category: "> *_🖼️ IMAGE & GIF_*",
        cmd: "`.img`",
        emoji: "● 🖼️",
        desc: "Search images",
      },
      {
        category: "> *_🖼️ IMAGE & GIF_*",
        cmd: "`.gif`",
        emoji: "● 🎞️",
        desc: "Search GIFs",
      },
      {
        category: "> *_🖼️ IMAGE & GIF_*",
        cmd: "`.pin`",
        emoji: "● 📌",
        desc: "Pinterest search",
      },

      // ── AI ───────────────────────────────────────────────────
      {
        category: "> *_🤖 AI_*",
        cmd: "`.ayobot`",
        emoji: "● 🧠",
        desc: "Chat with AI",
      },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.jarvis`",
        emoji: "● 🤖",
        desc: "Jarvis AI",
      },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.jarvisv`",
        emoji: "● 🔊",
        desc: "Jarvis voice",
      },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.summarize`",
        emoji: "● 📋",
        desc: "Summarize text",
      },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.grammar`",
        emoji: "● ✍️",
        desc: "Check grammar",
      },

      // ── INFO ─────────────────────────────────────────────────
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.weather`",
        emoji: "● ☁️",
        desc: "Weather forecast",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.time`",
        emoji: "● ⏰",
        desc: "World time",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.news`",
        emoji: "● 📰",
        desc: "Latest news",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.movie`",
        emoji: "● 🎬",
        desc: "Movie info",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.crypto`",
        emoji: "● 💰",
        desc: "Crypto prices",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.stock`",
        emoji: "● 📈",
        desc: "Stock prices",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.dict`",
        emoji: "● 📖",
        desc: "Dictionary",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.translate`",
        emoji: "● 🌍",
        desc: "Translate text",
      },

      // ── FUN ──────────────────────────────────────────────────
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.joke`",
        emoji: "● 😂",
        desc: "Random joke",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.quote`",
        emoji: "● 💫",
        desc: "Inspirational quote",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.trivia`",
        emoji: "● ❓",
        desc: "Trivia question",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.dice`",
        emoji: "● 🎲",
        desc: "Roll dice",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.flip`",
        emoji: "● 🪙",
        desc: "Flip coin",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.rps`",
        emoji: "● ✊",
        desc: "Rock paper scissors",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.roast`",
        emoji: "● 🔥",
        desc: "Roast someone",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.pickup`",
        emoji: "● 💘",
        desc: "Pickup line",
      },

      // ── ENCRYPTION ───────────────────────────────────────────
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
        desc: "Hash text",
      },
      {
        category: "> *_🔐 ENCRYPTION_*",
        cmd: "`.password`",
        emoji: "● 🔑",
        desc: "Generate password",
      },

      // ── STORAGE & UTILITIES ─────────────────────────────────
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
        emoji: "● 🗂️",
        desc: "List notes",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.delnote`",
        emoji: "● 🗑️",
        desc: "Delete note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.remind`",
        emoji: "● ⏰",
        desc: "Set reminder",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.reminders`",
        emoji: "● 📋",
        desc: "List reminders",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.cancelreminder`",
        emoji: "● ❌",
        desc: "Cancel reminder",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.snooze`",
        emoji: "● 💤",
        desc: "Snooze reminder",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.calc`",
        emoji: "● 🧮",
        desc: "Calculator",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.convert`",
        emoji: "● ⚖️",
        desc: "Unit converter",
      },

      // ── DOCUMENTS ────────────────────────────────────────────
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qr`",
        emoji: "● 📱",
        desc: "Generate QR code",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qencode`",
        emoji: "● 📱",
        desc: "QR encode",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.pdf`",
        emoji: "● 📄",
        desc: "Create PDF",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.vcf`",
        emoji: "● 📇",
        desc: "Create vCard",
      },

      // ── PROFILE ──────────────────────────────────────────────
      {
        category: "> *_👤 PROFILE_*",
        cmd: "`.getpp`",
        emoji: "● 🖼️",
        desc: "Get profile pic",
      },
      {
        category: "> *_👤 PROFILE_*",
        cmd: "`.getgpp`",
        emoji: "● 👥",
        desc: "Get group pic",
      },

      // ── GROUP MANAGEMENT ─────────────────────────────────────
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.kick`",
        emoji: "● 👢",
        desc: "Kick member",
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
        emoji: "● 🔽",
        desc: "Remove admin",
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
        desc: "Lock group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unlock`",
        emoji: "● 🔓",
        desc: "Unlock group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antilink`",
        emoji: "● 🚫",
        desc: "Anti-link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antispam`",
        emoji: "● 🛡️",
        desc: "Anti-spam",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warn`",
        emoji: "● ⚠️",
        desc: "Warn user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warnings`",
        emoji: "● 📊",
        desc: "View warnings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ban`",
        emoji: "● 🔨",
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
        cmd: "`.tagall`",
        emoji: "● 📢",
        desc: "Tag all",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.hidetag`",
        emoji: "● 👻",
        desc: "Hidden tag",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome`",
        emoji: "● 👋",
        desc: "Toggle welcome",
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
        desc: "Toggle goodbye",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.setgoodbye`",
        emoji: "● ✏️",
        desc: "Set goodbye msg",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.link`",
        emoji: "● 🔗",
        desc: "Group invite link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.revoke`",
        emoji: "● 🔄",
        desc: "Revoke group link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.admins`",
        emoji: "● 👑",
        desc: "List admins",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.groupinfo`",
        emoji: "● ℹ️",
        desc: "Group information",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.rules`",
        emoji: "● 📜",
        desc: "Show rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.setrules`",
        emoji: "● ✏️",
        desc: "Set group rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.pin`",
        emoji: "● 📌",
        desc: "Pin message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unpin`",
        emoji: "● ❌",
        desc: "Unpin message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.delete`",
        emoji: "● 🗑️",
        desc: "Delete message",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.settings`",
        emoji: "● 📜",
        desc: "View group settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.resetsettings`",
        emoji: "● 🔄",
        desc: "Reset group settings",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.leave`",
        emoji: "● 👋",
        desc: "Bot leave group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.activate`",
        emoji: "● ✅",
        desc: "Activate bot in group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.deactivate`",
        emoji: "● ❌",
        desc: "Deactivate bot in group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.groupdebug`",
        emoji: "● 🐛",
        desc: "Debug group info",
      },

      // ── ADMIN ─────────────────────────────────────────────────
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.mode`",
        emoji: "● ⚙️",
        desc: "Change bot mode",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.adduser`",
        emoji: "● ✅",
        desc: "Add authorized user",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.removeuser`",
        emoji: "● ❌",
        desc: "Remove authorized user",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.listusers`",
        emoji: "● 📋",
        desc: "List authorized users",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.broadcast`",
        emoji: "● 📢",
        desc: "Broadcast to users",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.globalbc`",
        emoji: "● 🌍",
        desc: "Broadcast to groups",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.stats`",
        emoji: "● 📊",
        desc: "Bot statistics",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.botstatus`",
        emoji: "● 📈",
        desc: "Detailed status",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.superban`",
        emoji: "● 🔨",
        desc: "Permanently ban user",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.unban`",
        emoji: "● ✅",
        desc: "Unban user",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.listbanned`",
        emoji: "● 📋",
        desc: "List banned users",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.clearbans`",
        emoji: "● 🧹",
        desc: "Clear all bans",
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
        desc: "Shutdown bot",
      },
      {
        category: "> *_👑 ADMIN_*",
        cmd: "`.eval`",
        emoji: "● ⚡",
        desc: "Execute code",
      },

      // ── WAITLIST ──────────────────────────────────────────────
      {
        category: "> *_📋 WAITLIST_*",
        cmd: "`.waitlist`",
        emoji: "● 📝",
        desc: "Join waitlist",
      },
      {
        category: "> *_📋 WAITLIST_*",
        cmd: "`.waitlistview`",
        emoji: "● 👁️",
        desc: "View waitlist (admin)",
      },

      // ── SECURITY ──────────────────────────────────────────────
      {
        category: "> *_🛡️ SECURITY_*",
        cmd: "`.scan`",
        emoji: "● 🔍",
        desc: "Scan URL for threats",
      },
    ];

    // Build the formatted menu text
    let menuText = `╔════════════════════════════════════════════╗\n`;
    menuText += `║     ⚡ *AYOBOT v1.0.0* ⚡    ║\n`;
    menuText += `╚════════════════════════════════════════════╝\n\n`;
    menuText += `├ ⏱️ Uptime: ${stats.uptime}\n`;
    menuText += `├ 💾 Memory: ${stats.memory}\n`;
    menuText += `├ 👤 Mode: ${stats.mode}\n`;
    menuText += `└ 📨 Messages: ${messageCount || 0}\n\n`;

    let currentCategory = "";
    for (const cmd of menuCommands) {
      if (cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        menuText += `\n${currentCategory}\n`;
      }
      menuText += `${cmd.emoji} ${cmd.cmd} — ${cmd.desc}\n`;
    }

    // Add footer
    menuText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    menuText += `⚡ _Total Commands: ${menuCommands.length}_\n`;
    menuText += `👑 _Created by AYOCODES_`;

    // Send with image
    try {
      await sock.sendMessage(from, {
        image: {
          url:
            ENV?.WELCOME_IMAGE_URL ||
            "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
        },
        caption: menuText,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: "120363422418001588@newsletter",
            newsletterName: "AyoBot Tech Hub",
            serverMessageId: Date.now(),
          },
        },
      });
    } catch (error) {
      console.warn("[MENU] Image failed, sending text:", error.message);
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    console.error("[MENU ERROR]", error.message);
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1.0.0*\n👑 *AYOCODES*\nwa.me/2349159180375\n\nType ${ENV.PREFIX}help for commands`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PING - ENHANCED WITH STATS
// ════════════════════════════════════════════════════════════════════════════
export async function ping({ from, sock }) {
  const start = Date.now();

  await sock.sendMessage(from, { text: `🏓 *Pinging...*` });
  await delay(500);

  const uptime = Date.now() - getSafeStartTime();
  const h = Math.floor(uptime / 3_600_000);
  const min = Math.floor((uptime % 3_600_000) / 60_000);
  const s = Math.floor((uptime % 60_000) / 1_000);
  const uptimeStr =
    h > 0 ? `${h}h ${min}m ${s}s` : min > 0 ? `${min}m ${s}s` : `${s}s`;

  const responseMs = Date.now() - start;
  const speedIcon =
    responseMs < 300
      ? "🟢 EXCELLENT"
      : responseMs < 800
        ? "🟡 GOOD"
        : "🔴 SLOW";

  const mem = process.memoryUsage();
  const memMB = (mem.heapUsed / 1024 / 1024).toFixed(2);

  await sock.sendMessage(from, {
    text:
      `━━━━━ 🏓 *PONG!* ━━━━━\n\n` +
      `${speedIcon} *Response:* ${responseMs}ms\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `📊 *Messages:* ${messageCount || 0}\n` +
      `💾 *Memory:* ${memMB}MB\n` +
      `🟢 *Status:* ONLINE\n` +
      `🤖 *Version:* 1.0.0\n` +
      `👑 *AYOBOT v1* \n`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  STATUS - ENHANCED USER INFO
// ════════════════════════════════════════════════════════════════════════════
export async function status({
  from,
  userJid,
  isAdmin: isAdminUser,
  isAuthorized: isAuthorizedUser,
  sock,
  sessionMode,
}) {
  const phone = userJid.split("@")[0];
  const usage = commandUsage.get(userJid) || {};
  const total = Object.values(usage).reduce((a, b) => a + b, 0);
  const topCmd = Object.entries(usage).sort((a, b) => b[1] - a[1])[0];

  let role = "👤 REGULAR USER";
  if (isAdminUser) role = "👑 BOT OWNER (ADMIN)";
  else if (isAuthorizedUser) role = "✅ AUTHORIZED USER";

  await sock.sendMessage(from, {
    text:
      `━━━━━ 👤 *YOUR STATUS* ━━━━━\n\n` +
      `📱 *Phone:* ${phone}\n` +
      `🏆 *Role:* ${role}\n` +
      `📊 *Commands Used:* ${total}\n` +
      `⭐ *Top Command:* ${topCmd ? `${topCmd[0]} (${topCmd[1]}x)` : "None"}\n` +
      `🤖 *Bot Mode:* ${(sessionMode || ENV.BOT_MODE || "public").toUpperCase()}\n` +
      `🌍 *Server Time:* ${new Date().toLocaleString()}\n\n` +
      `⚡ _Use ${ENV.PREFIX}menu to see all commands_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR - ENHANCED CONTACT & VCARD
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  const contact = String(ENV.CREATOR_CONTACT || "").replace(/\D/g, "");
  const defaultContact = "2349159180375";
  const finalContact = contact || defaultContact;

  try {
    const vcardContent =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:AYOCODES 👑\n` +
      `N:AYOCODES;;;;\n` +
      `ORG:AYOBOT Development\n` +
      `TITLE:Creator & Developer\n` +
      `TEL;type=CELL;type=VOICE;waid=${finalContact}:+${finalContact}\n` +
      `URL:${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n` +
      `NOTE:Creator of AYOBOT v1.0.0 WhatsApp Bot\n` +
      `REV:${new Date().toISOString()}\n` +
      `END:VCARD`;

    await sock.sendMessage(from, {
      document: Buffer.from(vcardContent, "utf-8"),
      mimetype: "text/vcard",
      fileName: "AYOCODES.vcf",
      caption: "👑 *AYOCODES - Creator of AYOBOT*\n_Tap to save contact_",
    });
  } catch (error) {
    try {
      await sock.sendMessage(from, {
        contacts: {
          displayName: "AYOCODES 👑",
          contacts: [
            {
              vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:AYOCODES 👑\nTEL;waid=${finalContact}:+${finalContact}\nEND:VCARD`,
            },
          ],
        },
      });
    } catch (_) {
      await sock.sendMessage(from, {
        text: `👑 *AYOCODES*\n📞 wa.me/${finalContact}`,
      });
    }
  }

  await delay(800);

  const group =
    ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN";

  await sock.sendMessage(from, {
    text:
      `━ 📢 *JOIN THE COMMUNITY* ━\n\n` +
      `👥 *WhatsApp Group:*\n${group}\n\n` +
      `⚡ *AYOBOT v1.0.0* 👑\n`,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: "120363422418001588@newsletter",
        newsletterName: "AyoBot Tech Hub",
        serverMessageId: Date.now(),
      },
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR GITHUB
// ════════════════════════════════════════════════════════════════════════════
export async function creatorGit({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `━━━━━ 👑 *AYOCODES GITHUB* ━━━━━\n\n` +
      `🔗 *GitHub Profile:*\n${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n\n` +
      `💻 _Check out my projects!_\n\n` +
      `🤖 *Featured Project:* AYOBOT v1.0.0\n` +
      `👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTO-REPLY TOGGLE
// ════════════════════════════════════════════════════════════════════════════
export async function auto({ args, from, userJid, sock }) {
  const sub = args[0]?.toLowerCase();
  if (!sub || !["on", "off", "status"].includes(sub)) {
    const cur = autoReplyEnabled.get(userJid) ? "ON" : "OFF";
    return sock.sendMessage(from, {
      text: formatInfo(
        "AUTO-REPLY SETTINGS",
        `Current Status: *${cur}*\n\n` +
          `${ENV.PREFIX}auto on — Enable auto-reply\n` +
          `${ENV.PREFIX}auto off — Disable auto-reply\n` +
          `${ENV.PREFIX}auto status — Check status`,
      ),
    });
  }
  if (sub === "on") {
    autoReplyEnabled.set(userJid, true);
    return sock.sendMessage(from, {
      text: formatSuccess(
        "AUTO-REPLY",
        "Auto-reply has been *ENABLED* ✅\n\nYou will receive automatic responses",
      ),
    });
  }
  if (sub === "off") {
    autoReplyEnabled.set(userJid, false);
    return sock.sendMessage(from, {
      text: formatSuccess(
        "AUTO-REPLY",
        "Auto-reply has been *DISABLED* 🔴\n\nYou won't receive automatic responses",
      ),
    });
  }
  const s = autoReplyEnabled.get(userJid) ? "ENABLED 🟢" : "DISABLED 🔴";
  await sock.sendMessage(from, {
    text: formatInfo("AUTO-REPLY STATUS", `Current Status: *${s}*`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WEATHER - ENHANCED WITH MORE DETAILS
// ════════════════════════════════════════════════════════════════════════════
export async function weather({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER LOOKUP",
        `Get real-time weather information\n\n` +
          `Usage: ${ENV.PREFIX}weather <city>\n\n` +
          `Examples:\n` +
          `${ENV.PREFIX}weather Lagos\n` +
          `${ENV.PREFIX}weather New York\n` +
          `${ENV.PREFIX}weather Tokyo`,
      ),
    });
  }
  if (!ENV.OPENWEATHER_KEY) {
    return sock.sendMessage(from, {
      text: formatError(
        "CONFIG ERROR",
        "OPENWEATHER_KEY is not configured in environment variables.",
      ),
    });
  }
  await sock.sendMessage(from, { text: "🌤️ *Fetching weather data...*" });
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(fullArgs)}&appid=${ENV.OPENWEATHER_KEY}&units=metric`,
      { timeout: 10_000 },
    );
    const d = res.data;
    const windDirs = [
      "N",
      "NNE",
      "NE",
      "ENE",
      "E",
      "ESE",
      "SE",
      "SSE",
      "S",
      "SSW",
      "SW",
      "WSW",
      "W",
      "WNW",
      "NW",
      "NNW",
    ];
    const windDir = windDirs[Math.round((d.wind?.deg || 0) / 22.5) % 16];
    const humBars = Math.round(d.main.humidity / 10);
    const humBar = "█".repeat(humBars) + "░".repeat(10 - humBars);
    const condId = d.weather[0]?.id || 800;
    const condEmoji =
      condId >= 800
        ? "☀️"
        : condId >= 700
          ? "🌫️"
          : condId >= 600
            ? "❄️"
            : condId >= 500
              ? "🌧️"
              : condId >= 300
                ? "🌦️"
                : condId >= 200
                  ? "⛈️"
                  : "🌤️";

    const visibility = d.visibility
      ? `${(d.visibility / 1000).toFixed(1)} km`
      : "N/A";
    const pressure = d.main.pressure ? `${d.main.pressure} hPa` : "N/A";

    await sock.sendMessage(from, {
      text:
        `${condEmoji} *WEATHER: ${d.name}, ${d.sys.country}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🌡️ *Temperature:* ${d.main.temp}°C\n` +
        `🤔 *Feels Like:* ${d.main.feels_like}°C\n` +
        `📊 *Min/Max:* ${d.main.temp_min}°C / ${d.main.temp_max}°C\n` +
        `💧 *Humidity:* ${d.main.humidity}% [${humBar}]\n` +
        `🌬️ *Wind:* ${d.wind.speed} m/s ${windDir}\n` +
        `👁️ *Visibility:* ${visibility}\n` +
        `⛅ *Clouds:* ${d.clouds?.all || 0}%\n` +
        `🔷 *Pressure:* ${pressure}\n` +
        `📝 *Conditions:* ${d.weather[0].description}\n` +
        `🌅 *Sunrise:* ${new Date(d.sys.sunrise * 1000).toLocaleTimeString()}\n` +
        `🌇 *Sunset:* ${new Date(d.sys.sunset * 1000).toLocaleTimeString()}\n\n` +
        `👑 _AYOCODES_`,
    });
  } catch (err) {
    const msg =
      err.response?.status === 404
        ? `City "${fullArgs}" not found. Check the spelling.`
        : `Weather fetch failed: ${err.message}`;
    await sock.sendMessage(from, { text: formatError("ERROR", msg) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SHORTEN - WITH MULTIPLE SERVICES
// ════════════════════════════════════════════════════════════════════════════
export async function shorten({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "URL SHORTENER",
        `Shorten long URLs\n\nUsage: ${ENV.PREFIX}shorten <url>\n\nExample: ${ENV.PREFIX}shorten https://example.com/very/long/url`,
      ),
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
    {
      name: "v.gd",
      fn: async () =>
        (
          await axios.get(
            `https://v.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
            { timeout: 8_000 },
          )
        ).data,
    },
    {
      name: "clck.ru",
      fn: async () =>
        (
          await axios.get(
            `https://clck.ru/--?url=${encodeURIComponent(longUrl)}`,
            { timeout: 8_000 },
          )
        ).data,
    },
  ];

  for (const svc of services) {
    try {
      const short = (await svc.fn())?.trim();
      if (short?.startsWith("http")) {
        return sock.sendMessage(from, {
          text: formatSuccess(
            "URL SHORTENED",
            `📎 *Original:*\n${longUrl}\n\n` +
              `🔗 *Shortened:*\n${short}\n\n` +
              `📊 *Service:* ${svc.name}\n` +
              `💡 *Saved:* ${longUrl.length - short.length} characters`,
          ),
        });
      }
    } catch (_) {}
  }
  await sock.sendMessage(from, {
    text: formatError(
      "ERROR",
      "All shortener services failed. Please try again later.",
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  VIEW ONCE
// ════════════════════════════════════════════════════════════════════════════
export async function viewOnce({ message, from, sock }) {
  try {
    const quotedMsg =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "VIEW ONCE",
          `View disappearing/view once messages\n\n` +
            `Reply to a view-once message with: ${ENV.PREFIX}vv`,
        ),
      });
    }
    await sock.sendMessage(from, { text: "👁️ *Opening view once message...*" });

    let mediaMsg = null,
      type = null;

    for (const container of [
      quotedMsg.viewOnceMessageV2?.message,
      quotedMsg.viewOnceMessageV2Extension?.message,
      quotedMsg,
    ]) {
      if (!container) continue;
      if (container.imageMessage) {
        mediaMsg = container.imageMessage;
        type = "image";
        break;
      }
      if (container.videoMessage) {
        mediaMsg = container.videoMessage;
        type = "video";
        break;
      }
      if (container.audioMessage) {
        mediaMsg = container.audioMessage;
        type = "audio";
        break;
      }
    }

    if (!mediaMsg || !type) {
      return sock.sendMessage(from, {
        text: formatError("NOT VIEW ONCE", "This is not a view-once message."),
      });
    }

    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const caption = `📊 *Type:* ${type.toUpperCase()}\n📦 *Size:* ${(buffer.length / 1024).toFixed(2)} KB\n✅ *Saved Successfully*\n👑 AYOBOT`;

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
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not open view once message: ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WAITLIST / JOIN TREND
// ════════════════════════════════════════════════════════════════════════════
export async function joinWaitlist({ fullArgs, from, userJid, sock, message }) {
  const email = fullArgs?.trim() || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID EMAIL",
        `Provide a valid email address.\n\nExample: ${ENV.PREFIX}jointrend user@example.com`,
      ),
    });
  }

  const phone = userJid.split("@")[0];
  const timestamp = new Date().toLocaleString();

  let pushname = "Unknown";
  try {
    if (message?.pushName) pushname = message.pushName;
    else if (message?.verifiedBizName) pushname = message.verifiedBizName;
    else if (message?.notify) pushname = message.notify;
  } catch (_) {}

  const userInfo = {
    email,
    phone,
    timestamp,
    userJid,
    name: pushname,
    platform: "WhatsApp",
  };
  waitlistEntries.set(phone, userInfo);

  await sock.sendMessage(from, {
    text: formatSuccess(
      "✅ WAITLIST JOINED",
      `📧 *Email:* ${email}\n` +
        `📱 *Phone:* +${phone}\n` +
        `⏰ *Time:* ${timestamp}\n\n` +
        `You've been added to our waitlist! You'll be notified when new versions launch.`,
    ),
  });

  try {
    const adminNumber = "2349159180375";
    const adminJid = `${adminNumber}@s.whatsapp.net`;

    const adminMessage =
      `╔══════════════════════════╗\n` +
      `║   📋 *NEW WAITLIST ENTRY* ║\n` +
      `╚══════════════════════════╝\n\n` +
      `👤 *Name:* ${pushname}\n` +
      `📧 *Email:* ${email}\n` +
      `📱 *Phone:* +${phone}\n` +
      `🆔 *JID:* ${userJid}\n` +
      `⏰ *Time:* ${timestamp}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *Total Waitlist:* ${waitlistEntries.size}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ *AYOBOT v1* | 👑 AYOCODES`;

    await sock.sendMessage(adminJid, {
      text: adminMessage,
      mentions: [userJid],
    });
  } catch (adminErr) {
    console.error("❌ Failed to send waitlist to admin:", adminErr.message);
    try {
      const adminJid = `2349159180375@s.whatsapp.net`;
      const vcard =
        `BEGIN:VCARD\nVERSION:3.0\nFN:${pushname || phone}\n` +
        `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}\n` +
        `EMAIL:${email}\nNOTE:Joined waitlist at ${timestamp}\nEND:VCARD`;

      await sock.sendMessage(adminJid, {
        document: Buffer.from(vcard, "utf-8"),
        mimetype: "text/vcard",
        fileName: `waitlist_${phone}.vcf`,
        caption: `📋 *New Waitlist Entry*\n👤 ${pushname || phone}\n📧 ${email}\n📱 +${phone}\n⏰ ${timestamp}`,
      });
    } catch (_) {}
  }

  if (ENV.ADMIN && ENV.ADMIN !== "2349159180375") {
    try {
      const adminJid = `${ENV.ADMIN.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
      await sock.sendMessage(adminJid, {
        text: `📋 *New Waitlist Entry*\n\n📧 Email: ${email}\n📱 Phone: +${phone}\n⏰ Time: ${timestamp}`,
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SCRAPE - ADVANCED WEB SCRAPING
// ════════════════════════════════════════════════════════════════════════════
export async function scrape({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEB SCRAPER",
        `Advanced website scraping\n\n` +
          `Usage: ${ENV.PREFIX}scrape <url>\n\n` +
          `Example: ${ENV.PREFIX}scrape https://example.com\n\n` +
          `📦 Returns:\n` +
          `• Self-contained HTML (CSS+JS+images inlined)\n` +
          `• Extracted CSS file\n` +
          `• Extracted JavaScript file\n` +
          `• ZIP archive with all files`,
      ),
    });
  }

  let url = fullArgs.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  await sock.sendMessage(from, {
    text: "🕸️ *Scraping website...*\n_This may take 15-30 seconds for complex sites_",
  });

  let html = null;
  let finalUrl = url;
  let fetchMethod = "unknown";

  const headerProfiles = [
    {
      label: "Chrome/Windows",
      headers: browserHeaders(USER_AGENTS[0], "https://www.google.com/"),
    },
    {
      label: "Firefox/Windows",
      headers: browserHeaders(USER_AGENTS[3], "https://www.bing.com/"),
    },
    {
      label: "Safari/Mac",
      headers: browserHeaders(USER_AGENTS[4], "https://www.google.com/"),
    },
    {
      label: "Chrome/Android",
      headers: browserHeaders(USER_AGENTS[6], "https://www.google.com/"),
    },
    {
      label: "Safari/iPhone",
      headers: browserHeaders(USER_AGENTS[5], "https://www.google.com/"),
    },
  ];

  for (const profile of headerProfiles) {
    if (html) break;
    try {
      const res = await axios.get(url, {
        headers: profile.headers,
        timeout: 25_000,
        maxRedirects: 15,
        maxContentLength: 50 * 1024 * 1024,
        responseType: "text",
        validateStatus: (s) => s < 500,
      });
      if (res.data && typeof res.data === "string" && res.data.length > 500) {
        if (
          res.data.includes("cf-browser-verification") ||
          res.data.includes("challenges.cloudflare.com")
        ) {
          await sock.sendMessage(from, {
            text: formatError(
              "CLOUDFLARE PROTECTED",
              `This site uses Cloudflare bot protection.\n\nTry: ${ENV.PREFIX}screenshot ${url}`,
            ),
          });
          return;
        }
        html = res.data;
        finalUrl = res.request?.res?.responseUrl || url;
        fetchMethod = profile.label;
        break;
      }
    } catch (_) {}
  }

  // Fallback 1: Google Cache
  if (!html) {
    try {
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      const res = await axios.get(cacheUrl, {
        headers: browserHeaders(USER_AGENTS[0]),
        timeout: 20_000,
        maxRedirects: 5,
        responseType: "text",
        validateStatus: (s) => s < 500,
      });
      if (res.data?.length > 500) {
        html = res.data;
        fetchMethod = "Google Cache";
      }
    } catch (_) {}
  }

  // Fallback 2: Wayback Machine
  if (!html) {
    try {
      const waRes = await axios.get(
        `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
        { timeout: 10_000 },
      );
      const snapUrl = waRes.data?.archived_snapshots?.closest?.url;
      if (snapUrl) {
        const res = await axios.get(snapUrl, {
          headers: browserHeaders(USER_AGENTS[0]),
          timeout: 20_000,
          responseType: "text",
          validateStatus: (s) => s < 500,
        });
        if (res.data?.length > 500) {
          html = res.data;
          fetchMethod = "Wayback Machine";
        }
      }
    } catch (_) {}
  }

  if (!html) {
    return sock.sendMessage(from, {
      text: formatError(
        "SCRAPE FAILED",
        `Could not retrieve this page after trying multiple methods.\n\n` +
          `*Possible reasons:*\n` +
          `• Heavy JavaScript rendering (React/Vue/Angular)\n` +
          `• Aggressive bot detection\n` +
          `• Requires login\n\n` +
          `Try: ${ENV.PREFIX}screenshot ${url}`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `✅ *Page fetched via ${fetchMethod}*\n⚙️ _Processing and inlining assets..._`,
  });

  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    let baseUrl;
    try {
      baseUrl = new URL(finalUrl);
    } catch (_) {
      baseUrl = new URL(url);
    }
    const domain = baseUrl.hostname.replace("www.", "");

    const fetchAsset = async (assetUrl, type = "text") => {
      try {
        const res = await axios.get(assetUrl, {
          headers: browserHeaders(randomUA()),
          timeout: 10_000,
          responseType: type,
          validateStatus: (s) => s < 400,
        });
        return res.data;
      } catch (_) {
        return null;
      }
    };

    const toAbs = (href) => {
      if (!href || href.startsWith("data:") || href.startsWith("blob:"))
        return href;
      try {
        return href.startsWith("http")
          ? href
          : new URL(href, baseUrl).toString();
      } catch (_) {
        return href;
      }
    };

    let extractedCSS = `/* AYOBOT Scraper — Extracted CSS from ${url} */\n\n`;
    const cssLinks = [];
    $('link[rel="stylesheet"][href]').each((_, el) =>
      cssLinks.push({ el, href: $(el).attr("href") }),
    );
    for (const { el, href } of cssLinks) {
      const absUrl = toAbs(href);
      if (!absUrl) continue;
      const data = await fetchAsset(absUrl, "text");
      if (data) {
        extractedCSS += `/* Source: ${href} */\n${data}\n\n`;
        $(el).replaceWith(`<style>/* inlined: ${href} */\n${data}</style>`);
      }
    }
    $("style").each((_, el) => {
      extractedCSS += `/* Inline style */\n${$(el).html()}\n\n`;
    });

    let extractedJS = `/* AYOBOT Scraper — Extracted JS from ${url} */\n\n`;
    const scriptTags = [];
    $("script[src]").each((_, el) =>
      scriptTags.push({ el, src: $(el).attr("src") }),
    );
    for (const { el, src } of scriptTags) {
      const absUrl = toAbs(src);
      if (!absUrl) continue;
      const data = await fetchAsset(absUrl, "text");
      if (data) {
        extractedJS += `/* Source: ${src} */\n${data}\n\n`;
        const attrs = Object.entries($(el).attr() || {})
          .filter(([k]) => k !== "src")
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ");
        $(el).replaceWith(
          `<script ${attrs}>/* inlined: ${src} */\n${data}</script>`,
        );
      }
    }
    $("script:not([src])").each((_, el) => {
      const content = $(el).html();
      if (content?.trim()) extractedJS += `/* Inline script */\n${content}\n\n`;
    });

    let imgCount = 0;
    const imgTags = [];
    $("img[src]").each((_, el) => {
      if (imgCount++ < 20) imgTags.push({ el, src: $(el).attr("src") });
    });
    for (const { el, src } of imgTags) {
      if (src.startsWith("data:")) continue;
      const absUrl = toAbs(src);
      if (!absUrl) continue;
      try {
        const res = await axios.get(absUrl, {
          headers: browserHeaders(randomUA()),
          timeout: 8_000,
          responseType: "arraybuffer",
          validateStatus: (s) => s < 400,
        });
        if (res.data) {
          const mime =
            res.headers["content-type"]?.split(";")[0] || "image/jpeg";
          const b64 = Buffer.from(res.data).toString("base64");
          $(el).attr("src", `data:${mime};base64,${b64}`);
        }
      } catch (_) {}
    }

    const title = $("title").text().trim() || "No title";
    const desc = $('meta[name="description"]').attr("content")?.trim() || "N/A";
    const linkCount = $("a[href]").length;
    const totalImgs = $("img").length;

    const stamp = `\n<!-- ═══════════════════════════════════════════\n     Scraped by AYOBOT v1.0.0 | AYOCODES\n     Source: ${url}\n     Fetched via: ${fetchMethod}\n     Date: ${new Date().toISOString()}\n═══════════════════════════════════════════ -->\n`;

    const finalHtml = stamp + $.html();
    const domain2 = domain.replace(/[^a-z0-9]/gi, "_");
    const ts = Date.now();
    const htmlBuf = Buffer.from(finalHtml, "utf-8");
    const cssBuf = Buffer.from(extractedCSS, "utf-8");
    const jsBuf = Buffer.from(extractedJS, "utf-8");

    await sock.sendMessage(from, {
      text:
        `🕸️ *SCRAPE COMPLETE*\n━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 *URL:* ${url}\n` +
        `📝 *Title:* ${title.substring(0, 100)}\n` +
        `📋 *Description:* ${desc.substring(0, 100)}\n` +
        `📎 *Links:* ${linkCount} | 🖼️ *Images:* ${totalImgs}\n` +
        `📥 *Fetch Method:* ${fetchMethod}\n` +
        `📁 *HTML Size:* ${(htmlBuf.length / 1024).toFixed(1)} KB\n` +
        `🎨 *CSS Size:* ${(cssBuf.length / 1024).toFixed(1)} KB\n` +
        `⚙️ *JS Size:* ${(jsBuf.length / 1024).toFixed(1)} KB\n` +
        `✅ *Assets Inlined:* CSS, JS, Images\n━━━━━━━━━━━━━━━━━━━━━━━\n`,
    });

    await sock.sendMessage(from, {
      document: htmlBuf,
      mimetype: "text/html",
      fileName: `${domain2}_${ts}_full.html`,
      caption: `📄 *Full Page HTML*\n_CSS+JS+Images inlined • Works offline_`,
    });
    await delay(500);

    if (cssBuf.length > 100) {
      await sock.sendMessage(from, {
        document: cssBuf,
        mimetype: "text/css",
        fileName: `${domain2}_${ts}_styles.css`,
        caption: `🎨 *Extracted CSS* — all stylesheets combined`,
      });
      await delay(300);
    }

    if (jsBuf.length > 100) {
      await sock.sendMessage(from, {
        document: jsBuf,
        mimetype: "application/javascript",
        fileName: `${domain2}_${ts}_scripts.js`,
        caption: `⚙️ *Extracted JavaScript* — all scripts combined`,
      });
      await delay(300);
    }

    const JSZip = await getJSZip();
    if (JSZip) {
      try {
        const zip = new JSZip();
        zip.file(`${domain2}_full.html`, htmlBuf);
        zip.file(`${domain2}_styles.css`, cssBuf);
        zip.file(`${domain2}_scripts.js`, jsBuf);
        zip.file(`${domain2}_original.html`, Buffer.from(html, "utf-8"));
        zip.file(
          "README.txt",
          `AYOBOT Web Scraper Archive\nSource: ${url}\nFetched: ${new Date().toISOString()}\nMethod: ${fetchMethod}\n\nFiles:\n  ${domain2}_full.html — Complete page (offline)\n  ${domain2}_styles.css — All CSS\n  ${domain2}_scripts.js — All JavaScript\n  ${domain2}_original.html — Original HTML\n\ngithub.com/Officialay12\n`,
        );
        const zipBuf = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        await sock.sendMessage(from, {
          document: zipBuf,
          mimetype: "application/zip",
          fileName: `${domain2}_${ts}_scrape.zip`,
          caption: `📦 *ZIP Archive* — all files packed`,
        });
      } catch (zipErr) {
        console.warn("ZIP creation failed:", zipErr.message);
      }
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("PROCESSING ERROR", error.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CONNECT INFO
// ════════════════════════════════════════════════════════════════════════════
export async function connectInfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔═══════════════════════════════════╗\n` +
      `║   📱 *CONNECT WITH THE CREATOR*  ║\n` +
      `╚═══════════════════════════════════╝\n\n` +
      `👑 *Creator:* AYOCODES\n` +
      `📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || "2349159180375"}\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n\n` +
      `📢 *Community Channels:*\n` +
      `🔗 Channel: ${ENV.WHATSAPP_CHANNEL || "https://whatsapp.com/channel/"}\n` +
      `👥 Group: ${ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/"}\n\n` +
      `⚡ *AYOBOT v1.0.0*\n` +
      `🤖 *Full-Featured WhatsApp Bot*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME - FIXED & ACCURATE WITH MULTIPLE API FALLBACKS
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "⏰ WORLD TIME",
        `Get current time in any city or timezone\n\n` +
          `📌 *Usage:* ${ENV.PREFIX}time <city or timezone>\n\n` +
          `📋 *Examples:*\n` +
          `${ENV.PREFIX}time Lagos\n` +
          `${ENV.PREFIX}time New York\n` +
          `${ENV.PREFIX}time London\n` +
          `${ENV.PREFIX}time Tokyo\n` +
          `${ENV.PREFIX}time Africa/Lagos\n` +
          `${ENV.PREFIX}time America/New_York\n\n` +
          `🌍 *Popular timezones:* Africa/Lagos, America/New_York, Europe/London, Asia/Tokyo`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `⏰ *Fetching time for "${fullArgs}"...*`,
  });

  let timeData = null;
  let errorMessages = [];
  const query = fullArgs.trim();

  // API 1: WorldTimeAPI
  try {
    const tz = query.replace(/ /g, "_");
    const res = await axios.get(`https://worldtimeapi.org/api/timezone/${tz}`, {
      timeout: 5000,
    });
    if (res.data) {
      timeData = {
        timezone: res.data.timezone,
        datetime: res.data.datetime,
        utc_offset: res.data.utc_offset,
        day_of_week: res.data.day_of_week,
        week_number: res.data.week_number,
        dst: res.data.dst,
        source: "WorldTimeAPI",
      };
    }
  } catch (err) {
    errorMessages.push(`WorldTimeAPI: ${err.message}`);
  }

  // API 2: TimeAPI.io
  if (!timeData) {
    try {
      const res = await axios.get(
        `https://www.timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(query)}`,
        { timeout: 5000 },
      );
      if (res.data) {
        const dateTime = new Date(res.data.dateTime);
        timeData = {
          timezone: res.data.timeZone,
          datetime: dateTime.toISOString(),
          utc_offset: res.data.utcOffset,
          day_of_week: dateTime.getDay(),
          week_number: Math.ceil(dateTime.getDate() / 7),
          dst: false,
          source: "TimeAPI.io",
        };
      }
    } catch (err) {
      errorMessages.push(`TimeAPI: ${err.message}`);
    }
  }

  // API 3: TimeZoneDB (optional key)
  if (!timeData && ENV.TIMEZONEDB_KEY) {
    try {
      const res = await axios.get(
        `http://api.timezonedb.com/v2.1/get-time-zone?key=${ENV.TIMEZONEDB_KEY}&format=json&by=zone&zone=${encodeURIComponent(query)}`,
        { timeout: 5000 },
      );
      if (res.data && res.data.status === "OK") {
        const dateTime = new Date(res.data.timestamp * 1000);
        timeData = {
          timezone: res.data.zoneName,
          datetime: dateTime.toISOString(),
          utc_offset: res.data.gmtOffset / 3600,
          day_of_week: dateTime.getDay(),
          week_number: Math.ceil(dateTime.getDate() / 7),
          dst: res.data.dst === "1",
          source: "TimeZoneDB",
        };
      }
    } catch (err) {
      errorMessages.push(`TimeZoneDB: ${err.message}`);
    }
  }

  // API 4: Geocoding + TimeAPI (city names)
  if (!timeData) {
    try {
      const geoRes = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`,
        { timeout: 5000 },
      );
      if (geoRes.data?.results?.[0]) {
        const { latitude, longitude, name, country } = geoRes.data.results[0];
        const timeRes = await axios.get(
          `https://timeapi.io/api/Time/current/coordinate?latitude=${latitude}&longitude=${longitude}`,
          { timeout: 5000 },
        );
        if (timeRes.data) {
          const dateTime = new Date(timeRes.data.dateTime);
          timeData = {
            timezone: `${name}, ${country}`,
            datetime: dateTime.toISOString(),
            utc_offset: timeRes.data.utcOffset,
            day_of_week: dateTime.getDay(),
            week_number: Math.ceil(dateTime.getDate() / 7),
            dst: false,
            source: "Geo + TimeAPI",
          };
        }
      }
    } catch (err) {
      errorMessages.push(`GeoAPI: ${err.message}`);
    }
  }

  // API 5: AbstractAPI Timezone (optional key)
  if (!timeData && ENV.ABSTRACTAPI_KEY) {
    try {
      const res = await axios.get(
        `https://timezone.abstractapi.com/v1/current_time/?api_key=${ENV.ABSTRACTAPI_KEY}&location=${encodeURIComponent(query)}`,
        { timeout: 5000 },
      );
      if (res.data) {
        const dateTime = new Date(res.data.datetime);
        timeData = {
          timezone: res.data.timezone_name,
          datetime: res.data.datetime,
          utc_offset: res.data.gmt_offset,
          day_of_week: dateTime.getDay(),
          week_number: Math.ceil(dateTime.getDate() / 7),
          dst: false,
          source: "AbstractAPI",
        };
      }
    } catch (err) {
      errorMessages.push(`AbstractAPI: ${err.message}`);
    }
  }

  // API 6: JS Intl fallback (last resort)
  if (!timeData) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: query,
        hour12: true,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
        timeZoneName: "long",
      });
      const now = new Date();
      const parts = formatter.formatToParts(now);
      let dateStr = "",
        timeStr = "",
        tzName = query;
      parts.forEach((part) => {
        if (part.type === "weekday") dateStr += part.value + ", ";
        else if (part.type === "month") dateStr += part.value + " ";
        else if (part.type === "day") dateStr += part.value + ", ";
        else if (part.type === "year") dateStr += part.value;
        else if (["hour", "minute", "second", "dayPeriod"].includes(part.type))
          timeStr += part.value + " ";
        else if (part.type === "timeZoneName") tzName = part.value;
      });
      const utcOffset = -now.getTimezoneOffset() / 60;
      timeData = {
        timezone: tzName,
        datetime: now.toISOString(),
        utc_offset: utcOffset > 0 ? `+${utcOffset}` : `${utcOffset}`,
        day_of_week: now.getDay(),
        week_number: Math.ceil(now.getDate() / 7),
        dst: false,
        source: "Intl (System)",
        customDate: dateStr,
        customTime: timeStr.trim(),
      };
    } catch (err) {
      errorMessages.push(`Intl: ${err.message}`);
    }
  }

  if (!timeData) {
    const commonTimezones = [
      "Africa/Lagos",
      "Africa/Nairobi",
      "Africa/Cairo",
      "America/New_York",
      "America/Chicago",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Dubai",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];
    const suggestions = commonTimezones
      .filter((tz) => tz.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3);
    let suggestionText = "";
    if (suggestions.length > 0) {
      suggestionText = `\n\n💡 *Did you mean:*\n${suggestions.map((tz) => `• ${tz}`).join("\n")}`;
    }
    return sock.sendMessage(from, {
      text: formatError(
        "TIME LOOKUP FAILED",
        `Could not find time for "${query}".${suggestionText}\n\n` +
          `📋 *Try one of these:*\n• Africa/Lagos\n• America/New_York\n• Europe/London\n• Asia/Tokyo`,
      ),
    });
  }

  try {
    const d = new Date(timeData.datetime);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const dayPct = Math.round((totalMinutes / 1440) * 100);
    const dayBars = Math.round(dayPct / 10);
    const dayBar = "█".repeat(dayBars) + "░".repeat(10 - dayBars);

    let utcOffset = timeData.utc_offset;
    if (typeof utcOffset === "number") {
      utcOffset = utcOffset > 0 ? `+${utcOffset}` : `${utcOffset}`;
    }

    const timezoneName = timeData.timezone || query;
    const formattedDate =
      timeData.customDate ||
      d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    const formattedTime =
      timeData.customTime ||
      d.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayName = days[d.getDay()];

    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║     ⏰ *WORLD TIME*      ║\n` +
        `╚══════════════════════════╝\n\n` +
        `🌍 *Timezone:* ${timezoneName}\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time:* ${formattedTime}\n` +
        `📆 *Day:* ${dayName}\n` +
        `🕒 *UTC Offset:* ${utcOffset}\n` +
        `📊 *Day Progress:* ${dayPct}% ${dayBar}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 *Source:* ${timeData.source}\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  } catch (formatErr) {
    await sock.sendMessage(from, {
      text: formatData("⏱️ WORLD TIME", {
        "🌍 Timezone": timeData.timezone || query,
        "📅 DateTime": new Date(timeData.datetime).toLocaleString(),
        "🕒 UTC Offset": timeData.utc_offset,
        "🔧 Source": timeData.source,
      }),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PDF GENERATOR
// ════════════════════════════════════════════════════════════════════════════
export async function pdf({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "PDF GENERATOR",
        `Create styled PDF documents\n\n` +
          `Usage: ${ENV.PREFIX}pdf <title> | <content>\n\n` +
          `Example:\n` +
          `${ENV.PREFIX}pdf My Document | This is the content of my PDF file`,
      ),
    });
  }
  await sock.sendMessage(from, { text: "📄 *Generating PDF document...*" });
  try {
    const PDFDoc = await getPDFDoc();
    if (!PDFDoc) {
      return sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "PDF generator not available.\n\nRun: npm install pdfkit",
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
    const doc = new PDFDoc({ margin: 60, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);

      // Header
      doc.rect(0, 0, doc.page.width, 60).fill("#1a1a2e");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("AYOBOT v1.0.0 — Document Generator", 60, 18, { align: "left" });
      doc
        .fillColor("#aaaaaa")
        .font("Helvetica")
        .fontSize(9)
        .text(new Date().toLocaleDateString(), 0, 30, {
          align: "right",
          width: doc.page.width - 60,
        });

      // Title
      doc.moveDown(2);
      doc
        .fillColor("#1a1a2e")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(title, { align: "center" });
      doc.moveDown(0.5);
      doc
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .stroke("#cccccc");

      // Content
      doc.moveDown(1);
      doc
        .fillColor("#333333")
        .font("Helvetica")
        .fontSize(12)
        .text(content, { lineGap: 6, paragraphGap: 8 });

      // Footer
      doc.moveDown(2);
      const footerY = doc.page.height - 50;
      doc
        .moveTo(60, footerY)
        .lineTo(doc.page.width - 60, footerY)
        .stroke("#cccccc");
      doc
        .fillColor("#999999")
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Generated by AYOBOT v1.0.0 • AYOCODES • ${new Date().toLocaleString()}`,
          60,
          footerY + 10,
          { align: "center" },
        );

      doc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);
    await sock.sendMessage(from, {
      document: pdfBuffer,
      mimetype: "application/pdf",
      fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`,
      caption: `📄 *PDF Created*\n📝 ${title}\n📦 ${(pdfBuffer.length / 1024).toFixed(2)} KB\n👑 AYOCODES`,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("PDF ERROR", error.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IP LOOKUP - ENHANCED WITH 6 REAL-TIME APIs + SAFE TYPE HANDLING
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "📍 IP LOOKUP",
        `Get detailed information about any IP address\n\n` +
          `📌 *Usage:* ${ENV.PREFIX}ip <IP_ADDRESS>\n\n` +
          `📋 *Examples:*\n` +
          `${ENV.PREFIX}ip 8.8.8.8\n` +
          `${ENV.PREFIX}ip 1.1.1.1\n` +
          `${ENV.PREFIX}ip 208.67.222.222`,
      ),
    });
  }

  const cleanIP = fullArgs.trim();

  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$/;

  if (!ipRegex.test(cleanIP)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID IP",
        `"${cleanIP}" is not a valid IP address.`,
      ),
    });
  }

  await sock.sendMessage(from, { text: `🌐 *Looking up IP: ${cleanIP}...*` });

  let data = null;
  let errors = [];

  // ── API 1: ip-api.com (HTTPS endpoint, most reliable free tier) ──────────
  try {
    const res = await axios.get(
      `https://pro.ip-api.com/json/${cleanIP}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting&key=${ENV.IPAPI_KEY || ""}`,
      { timeout: 8000 },
    );
    // Fallback to free endpoint if no key or key error
    if (!res.data || res.data.status !== "success") {
      const free = await axios.get(
        `http://ip-api.com/json/${cleanIP}?fields=66846719`,
        { timeout: 8000 },
      );
      if (free.data?.status === "success") {
        data = {
          query: free.data.query,
          country: free.data.country,
          countryCode: free.data.countryCode,
          region: free.data.regionName || free.data.region,
          city: free.data.city,
          zip: free.data.zip,
          lat: free.data.lat,
          lon: free.data.lon,
          timezone: free.data.timezone,
          isp: free.data.isp,
          org: free.data.org,
          as: free.data.as,
          mobile: free.data.mobile || false,
          proxy: free.data.proxy || false,
          hosting: free.data.hosting || false,
          source: "ip-api.com",
        };
      }
    } else {
      data = {
        query: res.data.query,
        country: res.data.country,
        countryCode: res.data.countryCode,
        region: res.data.regionName || res.data.region,
        city: res.data.city,
        zip: res.data.zip,
        lat: res.data.lat,
        lon: res.data.lon,
        timezone: res.data.timezone,
        isp: res.data.isp,
        org: res.data.org,
        as: res.data.as,
        mobile: res.data.mobile || false,
        proxy: res.data.proxy || false,
        hosting: res.data.hosting || false,
        source: "ip-api.com (pro)",
      };
    }
  } catch (err) {
    errors.push(`ip-api: ${err.message}`);
  }

  // ── API 2: ipwho.is (free, no key required, HTTPS) ───────────────────────
  if (!data) {
    try {
      const res = await axios.get(`https://ipwho.is/${cleanIP}`, {
        timeout: 8000,
      });
      if (res.data?.success) {
        data = {
          query: cleanIP,
          country: res.data.country,
          countryCode: res.data.country_code,
          region: res.data.region,
          city: res.data.city,
          zip: res.data.postal,
          lat: res.data.latitude,
          lon: res.data.longitude,
          timezone: res.data.timezone?.id,
          isp: res.data.connection?.isp || res.data.connection?.org,
          org: res.data.connection?.org,
          as: res.data.connection?.asn ? `AS${res.data.connection.asn}` : null,
          mobile: false,
          proxy: res.data.security?.proxy || false,
          hosting: res.data.security?.hosting || false,
          source: "ipwho.is",
        };
      }
    } catch (err) {
      errors.push(`ipwho.is: ${err.message}`);
    }
  }

  // ── API 3: ipapi.co (free 1000/day) ─────────────────────────────────────
  if (!data) {
    try {
      const res = await axios.get(`https://ipapi.co/${cleanIP}/json/`, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.data.error) {
        data = {
          query: cleanIP,
          country: res.data.country_name,
          countryCode: res.data.country_code,
          region: res.data.region,
          city: res.data.city,
          zip: res.data.postal,
          lat: res.data.latitude,
          lon: res.data.longitude,
          timezone: res.data.timezone,
          isp: res.data.org,
          org: res.data.org,
          as: res.data.asn,
          mobile: false,
          proxy: false,
          hosting: false,
          source: "ipapi.co",
        };
      }
    } catch (err) {
      errors.push(`ipapi.co: ${err.message}`);
    }
  }

  // ── API 4: freeipapi.com (free, no key, HTTPS) ───────────────────────────
  if (!data) {
    try {
      const res = await axios.get(`https://freeipapi.com/api/json/${cleanIP}`, {
        timeout: 8000,
      });
      if (res.data?.ipVersion) {
        data = {
          query: cleanIP,
          country: res.data.countryName,
          countryCode: res.data.countryCode,
          region: res.data.regionName,
          city: res.data.cityName,
          zip: res.data.zipCode,
          lat: res.data.latitude,
          lon: res.data.longitude,
          timezone: res.data.timeZone,
          isp: res.data.isp || "Unknown",
          org: res.data.isp,
          as: null,
          mobile: false,
          proxy: false,
          hosting: false,
          source: "freeipapi.com",
        };
      }
    } catch (err) {
      errors.push(`freeipapi: ${err.message}`);
    }
  }

  // ── API 5: ipinfo.io (free 50k/month, optional token) ───────────────────
  if (!data) {
    try {
      const tokenParam = ENV.IPINFO_TOKEN ? `?token=${ENV.IPINFO_TOKEN}` : "";
      const res = await axios.get(
        `https://ipinfo.io/${cleanIP}/json${tokenParam}`,
        { timeout: 8000 },
      );
      if (res.data && !res.data.error) {
        const loc = res.data.loc ? res.data.loc.split(",") : [null, null];
        data = {
          query: res.data.ip,
          country: res.data.country,
          countryCode: res.data.country,
          region: res.data.region,
          city: res.data.city,
          zip: res.data.postal,
          lat: loc[0],
          lon: loc[1],
          timezone: res.data.timezone,
          isp: res.data.org,
          org: res.data.org,
          as: null,
          mobile: false,
          proxy: false,
          hosting: false,
          source: "ipinfo.io",
        };
      }
    } catch (err) {
      errors.push(`ipinfo: ${err.message}`);
    }
  }

  // ── API 6: ip-address.de (European free API) ─────────────────────────────
  if (!data) {
    try {
      const res = await axios.get(
        `https://api.ip-address.de/api/v1/ip/${cleanIP}`,
        { timeout: 8000, headers: { Accept: "application/json" } },
      );
      if (res.data && res.data.country) {
        data = {
          query: cleanIP,
          country: res.data.country,
          countryCode: res.data.countryCode,
          region: res.data.region,
          city: res.data.city,
          zip: res.data.postalCode,
          lat: res.data.latitude,
          lon: res.data.longitude,
          timezone: res.data.timezone,
          isp: res.data.isp,
          org: res.data.org,
          as: res.data.asn ? `AS${res.data.asn}` : null,
          mobile: false,
          proxy: false,
          hosting: false,
          source: "ip-address.de",
        };
      }
    } catch (err) {
      errors.push(`ip-address.de: ${err.message}`);
    }
  }

  if (!data) {
    return sock.sendMessage(from, {
      text: formatError(
        "LOOKUP FAILED",
        `Could not fetch information for IP: ${cleanIP}\n\n` +
          `🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}\n\n` +
          `💡 Try again later or verify the IP is public (not a private/localhost IP).`,
      ),
    });
  }

  // ── Safe coordinate display ──────────────────────────────────────────────
  const coordStr =
    data.lat && data.lon
      ? `${safeFixed(data.lat)}, ${safeFixed(data.lon)}`
      : "N/A";

  const mapUrl =
    data.lat && data.lon
      ? `https://www.google.com/maps?q=${data.lat},${data.lon}`
      : null;

  let asn = data.as || "N/A";
  if (asn && asn !== "N/A" && !asn.startsWith("AS") && /^\d+$/.test(asn)) {
    asn = `AS${asn}`;
  }

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║     📍 *IP INFO*         ║\n` +
      `╚══════════════════════════╝\n\n` +
      `🌐 *IP:* ${data.query || cleanIP}\n` +
      `📍 *Country:* ${data.country || "Unknown"} (${data.countryCode || "?"})\n` +
      `🏙️ *City:* ${data.city || "Unknown"}\n` +
      `🗺️ *Region:* ${data.region || "Unknown"}\n` +
      `📮 *Postal:* ${data.zip || "N/A"}\n` +
      `🧭 *Coordinates:* ${coordStr}\n` +
      `⏰ *Timezone:* ${data.timezone || "N/A"}\n` +
      `📡 *ISP:* ${data.isp || "Unknown"}\n` +
      `🏢 *Organization:* ${data.org || "N/A"}\n` +
      `🔗 *ASN:* ${asn}\n` +
      `📱 *Mobile:* ${data.mobile ? "✅ Yes" : "❌ No"}\n` +
      `🛡️ *Proxy/VPN:* ${data.proxy ? "✅ Yes" : "❌ No"}\n` +
      `🏠 *Hosting:* ${data.hosting ? "✅ Yes" : "❌ No"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔧 *Source:* ${data.source}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });

  if (mapUrl) {
    await sock.sendMessage(from, {
      text: `🗺️ *View on Google Maps:*\n${mapUrl}`,
    });
  }
}

export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP - ENHANCED WITH MULTIPLE SERVICES
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock }) {
  await sock.sendMessage(from, {
    text: "🌐 *Fetching your public IP address...*",
  });

  let ipData = null;
  let errors = [];

  const ipServices = [
    {
      url: "https://api.ipify.org?format=json",
      parser: (d) => (typeof d === "object" ? d.ip : d.trim()),
    },
    { url: "https://api4.my-ip.io/ip.json", parser: (d) => d.ip },
    { url: "https://ip4.seeip.org/json", parser: (d) => d.ip },
    {
      url: "https://ipecho.net/plain",
      parser: (d) => (typeof d === "string" ? d.trim() : null),
    },
    {
      url: "https://checkip.amazonaws.com/",
      parser: (d) => (typeof d === "string" ? d.trim() : null),
    },
  ];

  for (const service of ipServices) {
    try {
      const res = await axios.get(service.url, {
        timeout: 6000,
        headers: { Accept: "application/json,text/plain,*/*" },
      });
      const ip = service.parser(res.data);
      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        ipData = ip;
        break;
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (!ipData) {
    return sock.sendMessage(from, {
      text: formatError(
        "IP FETCH FAILED",
        `Could not fetch your public IP.\n\n🔧 *Errors:*\n${errors.join("\n")}`,
      ),
    });
  }

  // Get location for the server IP
  let locationInfo = null;
  try {
    const infoRes = await axios.get(`https://ipwho.is/${ipData}`, {
      timeout: 8000,
    });
    if (infoRes.data?.success) {
      locationInfo = {
        country: infoRes.data.country,
        countryCode: infoRes.data.country_code,
        city: infoRes.data.city,
        regionName: infoRes.data.region,
        isp: infoRes.data.connection?.isp || infoRes.data.connection?.org,
        org: infoRes.data.connection?.org,
        as: infoRes.data.connection?.asn
          ? `AS${infoRes.data.connection.asn}`
          : "N/A",
        timezone: infoRes.data.timezone?.id,
        lat: infoRes.data.latitude,
        lon: infoRes.data.longitude,
      };
    }
  } catch (_) {
    // Fallback to ip-api.com
    try {
      const infoRes = await axios.get(
        `http://ip-api.com/json/${ipData}?fields=status,country,countryCode,regionName,city,isp,org,as,lat,lon,timezone`,
        { timeout: 8000 },
      );
      if (infoRes.data?.status === "success") locationInfo = infoRes.data;
    } catch (_) {}
  }

  let response =
    `╔══════════════════════════╗\n` +
    `║     🌐 *YOUR PUBLIC IP*   ║\n` +
    `╚══════════════════════════╝\n\n` +
    `📍 *IP Address:* ${ipData}\n`;

  if (locationInfo) {
    response +=
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 *Location Info:*\n` +
      `• Country: ${locationInfo.country} (${locationInfo.countryCode})\n` +
      `• City: ${locationInfo.city || locationInfo.cityName || "Unknown"}\n` +
      `• Region: ${locationInfo.regionName || "Unknown"}\n` +
      `• ISP: ${locationInfo.isp || "Unknown"}\n` +
      `• Organization: ${locationInfo.org || "N/A"}\n` +
      `• ASN: ${locationInfo.as || "N/A"}\n` +
      `• Timezone: ${locationInfo.timezone || "N/A"}\n`;

    if (locationInfo.lat && locationInfo.lon) {
      response +=
        `• Coordinates: ${safeFixed(locationInfo.lat)}, ${safeFixed(locationInfo.lon)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🗺️ https://www.google.com/maps?q=${locationInfo.lat},${locationInfo.lon}\n`;
    }
  }

  response +=
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Note:* This shows your SERVER's IP, not your personal location.\n` +
    `📱 Bot runs on a cloud server — the IP belongs to the datacenter.\n\n` +
    `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

  await sock.sendMessage(from, { text: response });
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS - ENHANCED WITH MULTIPLE RELIABLE APIS
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔍 WHOIS LOOKUP",
        `Get domain registration information\n\n` +
          `📌 *Usage:* ${ENV.PREFIX}whois <domain>\n\n` +
          `📋 *Examples:*\n` +
          `${ENV.PREFIX}whois google.com\n` +
          `${ENV.PREFIX}whois github.com`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *WHOIS lookup for ${fullArgs}...*`,
  });

  const domain = fullArgs
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*/, "");

  const domainRegex =
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID DOMAIN",
        `"${domain}" is not a valid domain name.`,
      ),
    });
  }

  let whoisData = null;
  let errors = [];

  // ── API 1: RDAP (IANA registry — most authoritative) ─────────────────────
  try {
    const res = await axios.get(`https://rdap.org/domain/${domain}`, {
      timeout: 10000,
    });
    if (res.data) {
      const d = res.data;
      const ns =
        d.nameservers
          ?.map((n) => n.ldhName?.toLowerCase())
          .filter(Boolean)
          .join(", ") || "Unknown";
      const status = d.status?.join(", ") || "Unknown";
      const evtMap = {};
      (d.events || []).forEach((e) => {
        evtMap[e.eventAction] = e.eventDate?.split("T")[0];
      });
      const registrar =
        d.entities
          ?.find((e) => e.roles?.includes("registrar"))
          ?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] || "Unknown";
      whoisData = {
        domain: d.ldhName || domain,
        registrar,
        status,
        nameservers: ns,
        created: evtMap["registration"] || evtMap["created"] || "Unknown",
        updated: evtMap["last changed"] || evtMap["changed"] || "Unknown",
        expires: evtMap["expiration"] || "Unknown",
        source: "RDAP (IANA)",
      };
    }
  } catch (err) {
    errors.push(`RDAP: ${err.message}`);
  }

  // ── API 2: who-dat.as93.net (free scrape-based WHOIS) ────────────────────
  if (!whoisData) {
    try {
      const res = await axios.get(`https://who-dat.as93.net/${domain}`, {
        timeout: 10000,
        headers: { Accept: "application/json" },
      });
      if (res.data?.domain) {
        const d = res.data.domain;
        const r = res.data.registrar;
        whoisData = {
          domain: d.id || domain,
          registrar: r?.name || "Unknown",
          status: Array.isArray(d.status)
            ? d.status.join(", ")
            : d.status || "Unknown",
          nameservers: Array.isArray(d.name_servers)
            ? d.name_servers.join(", ")
            : "Unknown",
          created: d.created_date?.split("T")[0] || "Unknown",
          updated: d.updated_date?.split("T")[0] || "Unknown",
          expires: d.expiration_date?.split("T")[0] || "Unknown",
          source: "who-dat.as93.net",
        };
      }
    } catch (err) {
      errors.push(`who-dat: ${err.message}`);
    }
  }

  // ── API 3: whoisjson.com ─────────────────────────────────────────────────
  if (!whoisData) {
    try {
      const res = await axios.get(
        `https://whoisjson.com/api/v1/whois?domain=${domain}`,
        {
          timeout: 10000,
          headers: { Accept: "application/json" },
        },
      );
      if (res.data?.data) {
        const d = res.data.data;
        whoisData = {
          domain: d.domain_name || domain,
          registrar: d.registrar || "Unknown",
          status: Array.isArray(d.status)
            ? d.status.join(", ")
            : d.status || "Unknown",
          nameservers: Array.isArray(d.name_servers)
            ? d.name_servers.join(", ")
            : d.name_servers || "Unknown",
          created: d.creation_date ? d.creation_date.split("T")[0] : "Unknown",
          updated: d.updated_date ? d.updated_date.split("T")[0] : "Unknown",
          expires: d.expiration_date
            ? d.expiration_date.split("T")[0]
            : "Unknown",
          source: "whoisjson.com",
        };
      }
    } catch (err) {
      errors.push(`whoisjson: ${err.message}`);
    }
  }

  // ── API 4: whoisxmlapi.com (optional key) ─────────────────────────────────
  if (!whoisData && ENV.WHOISXML_API_KEY) {
    try {
      const res = await axios.get(
        `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${ENV.WHOISXML_API_KEY}&domainName=${domain}&outputFormat=JSON`,
        { timeout: 10000 },
      );
      if (res.data?.WhoisRecord) {
        const d = res.data.WhoisRecord;
        whoisData = {
          domain: d.domainName || domain,
          registrar: d.registrarName || "Unknown",
          status: d.status || "Unknown",
          nameservers: d.nameServers?.hostNames?.join(", ") || "Unknown",
          created: d.createdDate ? d.createdDate.split("T")[0] : "Unknown",
          updated: d.updatedDate ? d.updatedDate.split("T")[0] : "Unknown",
          expires: d.expiresDate ? d.expiresDate.split("T")[0] : "Unknown",
          source: "whoisxmlapi.com",
        };
      }
    } catch (err) {
      errors.push(`whoisxmlapi: ${err.message}`);
    }
  }

  if (!whoisData) {
    return sock.sendMessage(from, {
      text: formatError(
        "WHOIS FAILED",
        `Could not fetch WHOIS information for "${domain}".\n\n` +
          `🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}\n\n` +
          `💡 Domain may be invalid or registry is temporarily down.`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║     🔍 *WHOIS INFO*      ║\n` +
      `╚══════════════════════════╝\n\n` +
      `🌐 *Domain:* ${whoisData.domain}\n` +
      `🏢 *Registrar:* ${whoisData.registrar}\n` +
      `📋 *Status:* ${whoisData.status}\n` +
      `📡 *Nameservers:* ${whoisData.nameservers}\n` +
      `📅 *Created:* ${whoisData.created}\n` +
      `🔄 *Updated:* ${whoisData.updated}\n` +
      `⏰ *Expires:* ${whoisData.expires}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔧 *Source:* ${whoisData.source}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP - ENHANCED WITH RELIABLE APIs
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔍 DNS LOOKUP",
        `Get DNS records for a domain\n\n` +
          `📌 *Usage:* ${ENV.PREFIX}dns <domain>\n\n` +
          `📋 *Example:* ${ENV.PREFIX}dns google.com`,
      ),
    });
  }

  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });

  const domain = fullArgs
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*/, "");

  const domainRegex =
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID DOMAIN",
        `"${domain}" is not a valid domain name.`,
      ),
    });
  }

  let records = { A: [], AAAA: [], MX: [], NS: [], TXT: [], CNAME: [] };
  let errors = [];
  let usedSource = "";

  // ── Primary: Google DNS-over-HTTPS ────────────────────────────────────────
  const recordTypes = ["A", "AAAA", "MX", "NS", "TXT", "CNAME"];
  let googleSuccess = false;

  for (const type of recordTypes) {
    try {
      const res = await axios.get(
        `https://dns.google/resolve?name=${domain}&type=${type}`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        // Map DNS type numbers back to record types
        const typeMap = {
          1: "A",
          28: "AAAA",
          15: "MX",
          2: "NS",
          16: "TXT",
          5: "CNAME",
        };
        const typeNum = { A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16, CNAME: 5 }[
          type
        ];
        records[type] = res.data.Answer.filter(
          (ans) => ans.type === typeNum,
        ).map((ans) => {
          // Strip trailing dot from NS/CNAME/MX records
          let val = ans.data || "";
          if (["NS", "CNAME", "MX"].includes(type))
            val = val.replace(/\.$/, "");
          return val;
        });
        if (records[type].length > 0) googleSuccess = true;
      }
    } catch (err) {
      errors.push(`Google DNS (${type}): ${err.message}`);
    }
  }
  if (googleSuccess) usedSource = "Google DNS-over-HTTPS";

  // ── Fallback: Cloudflare DNS-over-HTTPS ──────────────────────────────────
  if (!googleSuccess || records.A.length === 0) {
    try {
      const res = await axios.get(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        const cfA = res.data.Answer.filter((a) => a.type === 1).map(
          (a) => a.data,
        );
        if (cfA.length > 0 && records.A.length === 0) {
          records.A = cfA;
          usedSource = usedSource || "Cloudflare DoH";
        }
      }
    } catch (err) {
      errors.push(`Cloudflare DNS: ${err.message}`);
    }
  }

  // ── Fallback: DoH public resolver (dns.cloudflare.com) for MX ────────────
  if (records.MX.length === 0) {
    try {
      const res = await axios.get(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        records.MX = res.data.Answer.filter((a) => a.type === 15).map((a) =>
          a.data.replace(/\.$/, ""),
        );
      }
    } catch (_) {}
  }

  // ── Fallback: doh.pub (Chinese public resolver — global) ─────────────────
  if (records.A.length === 0 && records.NS.length === 0) {
    try {
      const res = await axios.get(
        `https://doh.pub/dns-query?name=${domain}&type=A`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        records.A = res.data.Answer.filter((a) => a.type === 1).map(
          (a) => a.data,
        );
        usedSource = usedSource || "doh.pub";
      }
    } catch (err) {
      errors.push(`doh.pub: ${err.message}`);
    }
  }

  const formatRecords = (type, limit = 5) => {
    if (!records[type] || records[type].length === 0) return "_(none)_";
    const list = records[type].slice(0, limit);
    if (records[type].length > limit)
      list.push(`...+${records[type].length - limit} more`);
    return list.join("\n");
  };

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║     🔍 *DNS RECORDS*     ║\n` +
      `╚══════════════════════════╝\n\n` +
      `🌐 *Domain:* ${domain}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *A Records (IPv4):*\n${formatRecords("A")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *AAAA Records (IPv6):*\n${formatRecords("AAAA")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *MX Records (Mail):*\n${formatRecords("MX")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *NS Records (Nameservers):*\n${formatRecords("NS")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *TXT Records:*\n${formatRecords("TXT", 3)}\n` +
      (records.CNAME.length > 0
        ? `━━━━━━━━━━━━━━━━━━━━━\n📋 *CNAME:*\n${formatRecords("CNAME")}\n`
        : "") +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔧 *Source:* ${usedSource || "Multiple DoH resolvers"}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  GET PROFILE PICTURE
// ════════════════════════════════════════════════════════════════════════════
export async function getpp({ message, from, sock }) {
  try {
    const msg = message.message;
    const senderJid =
      message.key?.participant || message.key?.remoteJid || from;
    const quotedParticipant =
      msg?.extendedTextMessage?.contextInfo?.participant || null;
    const mentionedJid =
      msg?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || null;
    const targetJid = quotedParticipant || mentionedJid || senderJid;
    const displayNum = targetJid.split("@")[0];

    await sock.sendMessage(from, {
      text: `🖼️ *Fetching profile picture for @${displayNum}...*`,
      mentions: [targetJid],
    });

    let ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(targetJid, "image");
    } catch (_) {
      try {
        ppUrl = await sock.profilePictureUrl(targetJid, "preview");
      } catch (_) {}
    }

    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: `🖼️ *Profile Picture*\n👤 @${displayNum}\n⏰ ${new Date().toLocaleString()}`,
        mentions: [targetJid],
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "NOT FOUND",
          `@${displayNum} has no profile picture or privacy blocks access.`,
        ),
        mentions: [targetJid],
      });
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not fetch profile picture: ${error.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GET GROUP PROFILE PICTURE
// ════════════════════════════════════════════════════════════════════════════
export async function getgpp({ from, sock, isGroup }) {
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: formatError("GROUP ONLY", "This command only works in groups."),
    });
  }
  await sock.sendMessage(from, {
    text: "👥 *Fetching group profile picture...*",
  });
  try {
    let ppUrl = null;
    try {
      ppUrl = await sock.profilePictureUrl(from, "image");
    } catch (_) {
      try {
        ppUrl = await sock.profilePictureUrl(from, "preview");
      } catch (_) {}
    }
    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption:
          "👥 *Group Profile Picture*\n⏰ " + new Date().toLocaleString(),
      });
    } else {
      await sock.sendMessage(from, {
        text: formatInfo("NOT FOUND", "This group has no profile picture."),
      });
    }
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not fetch group picture: ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PREFIX INFO
// ════════════════════════════════════════════════════════════════════════════
export async function prefixinfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔═══════════════════════════════════╗\n` +
      `║       ℹ️ *PREFIX INFORMATION*    ║\n` +
      `╚═══════════════════════════════════╝\n\n` +
      `🔤 *Current Prefix:* \`${ENV.PREFIX}\`\n` +
      `📝 *Usage Format:* ${ENV.PREFIX}<command> [arguments]\n\n` +
      `📋 *Example Commands:*\n` +
      `${ENV.PREFIX}menu — Show all commands\n` +
      `${ENV.PREFIX}ping — Check bot latency\n` +
      `${ENV.PREFIX}weather Lagos — Get weather\n\n` +
      `💡 All commands must start with "${ENV.PREFIX}"\n` +
      `👑 Created by AYOCODES`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS - AI ASSISTANT
// ════════════════════════════════════════════════════════════════════════════
export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS AI ASSISTANT",
        `Your personal AI assistant\n\n` +
          `Usage: ${ENV.PREFIX}jarvis <question>\n\n` +
          `Example: ${ENV.PREFIX}jarvis How to make coffee?`,
      ),
    });
  }
  await sock.sendMessage(from, {
    text: "🤖 *Jarvis is processing your query...*",
  });
  const query = fullArgs.trim();

  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS - Powered by AYOCODES*\n\n` +
      `"Analyzing: ${query.substring(0, 100)}..."\n\n` +
      `💡 _For full AI conversation use:_ ${ENV.PREFIX}ai ${query.substring(0, 50)}\n\n` +
      `👑 *Iron Man's JARVIS Mode Active*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  URL INFO
// ════════════════════════════════════════════════════════════════════════════
export async function url({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("URL INFO", `Usage: ${ENV.PREFIX}url <url>`),
    });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `🌍 *Analyzing ${urlStr}...*` });
  try {
    const response = await axios.head(urlStr, {
      timeout: 10_000,
      maxRedirects: 10,
      headers: { "User-Agent": randomUA() },
      validateStatus: () => true,
    });
    const h = response.headers;
    const statusEmoji =
      response.status < 300 ? "🟢" : response.status < 400 ? "🟡" : "🔴";
    await sock.sendMessage(from, {
      text: formatData("🌍 URL INFORMATION", {
        [`${statusEmoji} Status`]: `${response.status} ${response.statusText || ""}`,
        "📝 Content-Type": h["content-type"]?.split(";")[0] || "Unknown",
        "🌐 Server": h["server"] || "Unknown",
        "📦 Content-Length": h["content-length"]
          ? `${(parseInt(h["content-length"]) / 1024).toFixed(1)} KB`
          : "Unknown",
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
        "🔄 Cache-Control": h["cache-control"] || "Not set",
        "🛡️ X-Frame-Options": h["x-frame-options"] || "Not set",
        "⚡ X-Powered-By": h["x-powered-by"] || "Hidden",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  FETCH
// ════════════════════════════════════════════════════════════════════════════
export async function fetch({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("FETCH", `Usage: ${ENV.PREFIX}fetch <url>`),
    });
  }
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
//  QR CODE ENCODER
// ════════════════════════════════════════════════════════════════════════════
export async function qencode({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("QR CODE ENCODER", `Usage: ${ENV.PREFIX}qencode <text>`),
    });
  }
  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });
  try {
    // Primary: qrserver.com (free, reliable, no key)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}&margin=10&color=1a1a2e&bgcolor=ffffff&format=png`;
    const res = await axios.get(qrUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
    });
    if (res.data && res.data.byteLength > 100) {
      await sock.sendMessage(from, {
        image: Buffer.from(res.data),
        caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}\n👑 Created by AYOCODES`,
      });
    } else {
      // Fallback: send as URL
      await sock.sendMessage(from, {
        image: { url: qrUrl },
        caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}\n👑 Created by AYOCODES`,
      });
    }
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not generate QR code: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TAKE STICKER
// ════════════════════════════════════════════════════════════════════════════
export async function take({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "TAKE STICKER",
          `Reply to an image/video with ${ENV.PREFIX}take`,
        ),
      });
    }
    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });
    const mediaType = quoted.imageMessage ? "image" : "video";
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;
    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    await sock.sendMessage(from, { sticker: buffer });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not create sticker: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SCREENSHOT - ENHANCED WITH WORKING FREE SERVICES
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "📷 SCREENSHOT",
        `Take a screenshot of any website\n\n` +
          `📌 *Usage:* ${ENV.PREFIX}screenshot <url>\n\n` +
          `📋 *Examples:*\n` +
          `${ENV.PREFIX}screenshot https://google.com\n` +
          `${ENV.PREFIX}screenshot github.com`,
      ),
    });
  }

  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;

  try {
    new URL(urlStr);
  } catch (_) {
    return sock.sendMessage(from, {
      text: formatError("INVALID URL", `"${fullArgs}" is not a valid URL.`),
    });
  }

  await sock.sendMessage(from, {
    text: `📷 *Taking screenshot of*\n${urlStr}\n\n⏳ _This may take 10-20 seconds..._`,
  });

  const urlEncoded = encodeURIComponent(urlStr);
  let screenshotBuffer = null;
  let usedService = "";
  let errors = [];

  // ── SERVICE 1: Thum.io (free, no key, most reliable) ─────────────────────
  try {
    const res = await axios.get(
      `https://image.thum.io/get/width/1280/crop/800/noanimate/${urlStr}`,
      {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: { "User-Agent": randomUA() },
      },
    );
    if (res.data && res.data.byteLength > 5000 && res.status === 200) {
      screenshotBuffer = Buffer.from(res.data);
      usedService = "Thum.io";
    }
  } catch (err) {
    errors.push(`Thum.io: ${err.message}`);
  }

  // ── SERVICE 2: Microlink.io (free tier, no key) ───────────────────────────
  if (!screenshotBuffer) {
    try {
      const res = await axios.get(
        `https://api.microlink.io/?url=${urlEncoded}&screenshot=true&meta=false&waitFor=2000`,
        { timeout: 20000 },
      );
      if (res.data?.data?.screenshot?.url) {
        const imgRes = await axios.get(res.data.data.screenshot.url, {
          responseType: "arraybuffer",
          timeout: 15000,
        });
        if (imgRes.data?.byteLength > 5000) {
          screenshotBuffer = Buffer.from(imgRes.data);
          usedService = "Microlink.io";
        }
      }
    } catch (err) {
      errors.push(`Microlink: ${err.message}`);
    }
  }

  // ── SERVICE 3: s-shot.ru (free, European) ────────────────────────────────
  if (!screenshotBuffer) {
    try {
      const res = await axios.get(
        `https://mini.s-shot.ru/1280x800/JPEG/1280/Z100/?${urlStr}`,
        { responseType: "arraybuffer", timeout: 20000 },
      );
      if (res.data?.byteLength > 5000) {
        screenshotBuffer = Buffer.from(res.data);
        usedService = "s-shot.ru";
      }
    } catch (err) {
      errors.push(`s-shot: ${err.message}`);
    }
  }

  // ── SERVICE 4: ScreenshotLayer (if key available) ─────────────────────────
  if (!screenshotBuffer && ENV.SCREENSHOTLAYER_KEY) {
    try {
      const res = await axios.get(
        `http://api.screenshotlayer.com/api/capture?access_key=${ENV.SCREENSHOTLAYER_KEY}&url=${urlEncoded}&viewport=1280x800&width=1280`,
        { responseType: "arraybuffer", timeout: 20000 },
      );
      if (res.data?.byteLength > 5000) {
        screenshotBuffer = Buffer.from(res.data);
        usedService = "ScreenshotLayer";
      }
    } catch (err) {
      errors.push(`ScreenshotLayer: ${err.message}`);
    }
  }

  // ── SERVICE 5: ScreenshotMachine (if key available) ───────────────────────
  if (!screenshotBuffer && ENV.SCREENSHOTMACHINE_KEY) {
    try {
      const res = await axios.get(
        `http://api.screenshotmachine.com/?key=${ENV.SCREENSHOTMACHINE_KEY}&url=${urlEncoded}&dimension=1280x800&format=jpg`,
        { responseType: "arraybuffer", timeout: 20000 },
      );
      if (res.data?.byteLength > 5000) {
        screenshotBuffer = Buffer.from(res.data);
        usedService = "ScreenshotMachine";
      }
    } catch (err) {
      errors.push(`ScreenshotMachine: ${err.message}`);
    }
  }

  // ── SERVICE 6: urlbox.io (if key available) ────────────────────────────────
  if (!screenshotBuffer && ENV.URLBOX_KEY) {
    try {
      const res = await axios.get(
        `https://api.urlbox.io/v1/${ENV.URLBOX_KEY}/png?url=${urlEncoded}&width=1280&height=800&full_page=false`,
        { responseType: "arraybuffer", timeout: 20000 },
      );
      if (res.data?.byteLength > 5000) {
        screenshotBuffer = Buffer.from(res.data);
        usedService = "urlbox.io";
      }
    } catch (err) {
      errors.push(`urlbox: ${err.message}`);
    }
  }

  // ── Final fallback: fetch page title and return info ──────────────────────
  if (!screenshotBuffer) {
    let pageTitle = urlStr;
    try {
      const htmlRes = await axios.get(urlStr, {
        timeout: 10000,
        headers: { "User-Agent": randomUA() },
        maxContentLength: 200000,
      });
      const titleMatch = htmlRes.data?.match(/<title[^>]*>(.*?)<\/title>/is);
      if (titleMatch)
        pageTitle = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
    } catch (_) {}

    return sock.sendMessage(from, {
      text: formatInfo(
        "SCREENSHOT UNAVAILABLE",
        `Could not take screenshot of:\n${urlStr}\n\n` +
          `📝 *Page Title:* ${pageTitle.substring(0, 200)}\n\n` +
          `🔧 *Errors:* ${errors.slice(0, 2).join(" | ")}\n\n` +
          `💡 *Try instead:*\n` +
          `• ${ENV.PREFIX}scrape ${urlStr} — get full HTML\n` +
          `• ${ENV.PREFIX}fetch ${urlStr} — get source`,
      ),
    });
  }

  // ── Get page title for caption ────────────────────────────────────────────
  let pageTitle = urlStr;
  try {
    const headRes = await axios.get(urlStr, {
      timeout: 6000,
      maxContentLength: 100000,
      headers: { "User-Agent": randomUA() },
    });
    const titleMatch = headRes.data?.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) pageTitle = titleMatch[1].trim().substring(0, 100);
  } catch (_) {}

  const sizeKB = (screenshotBuffer.byteLength / 1024).toFixed(1);

  await sock.sendMessage(from, {
    image: screenshotBuffer,
    caption:
      `📷 *Screenshot*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔗 *URL:* ${urlStr}\n` +
      `📝 *Title:* ${pageTitle}\n` +
      `📦 *Size:* ${sizeKB} KB\n` +
      `🔧 *Service:* ${usedService}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  INSPECT PAGE
// ════════════════════════════════════════════════════════════════════════════
export async function inspect({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("INSPECT PAGE", `Usage: ${ENV.PREFIX}inspect <url>`),
    });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, { text: `🔍 *Inspecting ${urlStr}...*` });
  try {
    const response = await axios.get(urlStr, {
      headers: browserHeaders(randomUA()),
      timeout: 15_000,
      maxContentLength: 5 * 1024 * 1024,
      validateStatus: (s) => s < 500,
    });
    const $ = cheerio.load(response.data);
    const techs = [];
    const body = response.data.toLowerCase();
    if (body.includes("react")) techs.push("React");
    if (body.includes("vue.js") || body.includes("__vue")) techs.push("Vue.js");
    if (body.includes("angular")) techs.push("Angular");
    if (body.includes("wp-content")) techs.push("WordPress");
    if (body.includes("shopify")) techs.push("Shopify");
    if (body.includes("next.js") || body.includes("__next"))
      techs.push("Next.js");
    if (body.includes("nuxt")) techs.push("Nuxt.js");
    if (body.includes("jquery")) techs.push("jQuery");
    if (response.headers["x-powered-by"])
      techs.push(response.headers["x-powered-by"]);
    if (response.headers["x-generator"])
      techs.push(response.headers["x-generator"]);

    const robotsMeta = $('meta[name="robots"]').attr("content") || "Not set";
    const ogTitle = $('meta[property="og:title"]').attr("content") || "None";
    const canonical = $('link[rel="canonical"]').attr("href") || "None";

    await sock.sendMessage(from, {
      text: formatData("🔍 PAGE INSPECTION", {
        "📝 Title": ($("title").text() || "No title").substring(0, 100),
        "📋 Description": (
          $('meta[name="description"]').attr("content") || "None"
        ).substring(0, 100),
        "📊 Status": `${response.status} ${response.statusText || ""}`,
        "📎 Links": `${$("a[href]").length}`,
        "🖼️ Images": `${$("img").length}`,
        "📜 Scripts": `${$("script").length}`,
        "🎨 Stylesheets": `${$('link[rel="stylesheet"]').length}`,
        "🤖 Robots": robotsMeta,
        "🔗 Canonical": canonical.substring(0, 80),
        "📣 OG Title": ogTitle.substring(0, 80),
        "⚙️ Tech Stack": techs.length ? techs.join(", ") : "Unknown",
        "🌐 Server": response.headers["server"] || "Unknown",
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IMGBB - IMAGE UPLOAD
// ════════════════════════════════════════════════════════════════════════════
export async function imgbb({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "IMGBB UPLOAD",
          `Reply to an image with ${ENV.PREFIX}imgbb`,
        ),
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
        text: `📤 *Image Uploaded*\n\n🔗 *URL:* ${result.url}\n🛠️ *Service:* ${result.service}`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "Upload failed. Set IMGBB_KEY in environment variables.",
        ),
      });
    }
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not upload image: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTIVATE GROUP
// ════════════════════════════════════════════════════════════════════════════
export async function activate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: "❌ This command only works in groups.",
    });
  }
  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: "⛔ Only the bot owner can activate the bot in this group.",
    });
  }
  activateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `✅ *GROUP ACTIVATED!*\n\nEveryone can now use bot commands in this group.\n\nTo restrict back to owner-only: *${ENV.PREFIX}deactivate*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DEACTIVATE GROUP
// ════════════════════════════════════════════════════════════════════════════
export async function deactivate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: "❌ This command only works in groups.",
    });
  }
  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: "⛔ Only the bot owner can deactivate the bot in this group.",
    });
  }
  deactivateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `🔒 *GROUP DEACTIVATED!*\n\nOnly the bot owner can use commands in this group now.\n\nTo open to everyone: *${ENV.PREFIX}activate*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ANTILINK - DETECT, DELETE & WARN
//  FIXED: JID normalization so admin check never fails on format mismatch
// ════════════════════════════════════════════════════════════════════════════
export async function antilink({
  args,
  message,
  from,
  sock,
  isAdmin,
  isGroup,
  userJid,
}) {
  // ── PART 1: COMMAND TOGGLE (.antilink on/off/status) ────────────────────
  if (args && args.length > 0) {
    if (!isGroup) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: "⛔ Only group admins can use this command.",
      });
    }

    const sub = args[0]?.toLowerCase();
    let currentSetting = groupSettings.get(from) || {};

    if (!sub || !["on", "off", "status"].includes(sub)) {
      const status = currentSetting.antilink ? "ON ✅" : "OFF ❌";
      return sock.sendMessage(from, {
        text:
          `╔══════════════════════════╗\n` +
          `║     🔗 *ANTI-LINK*       ║\n` +
          `╚══════════════════════════╝\n\n` +
          `Current Status: *${status}*\n\n` +
          `📌 *Commands:*\n` +
          `${ENV.PREFIX}antilink on  — Enable protection\n` +
          `${ENV.PREFIX}antilink off — Disable protection\n` +
          `${ENV.PREFIX}antilink status — Check status\n\n` +
          `⚠️ When enabled, ALL links will be:\n` +
          `• Automatically deleted\n` +
          `• User warned\n` +
          `• Auto-kick after 3 warnings\n\n` +
          `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      });
    }

    if (sub === "on") {
      currentSetting.antilink = true;
      groupSettings.set(from, currentSetting);
      return sock.sendMessage(from, {
        text:
          `✅ *Anti-Link ENABLED*\n\n` +
          `🔗 All links will now be:\n` +
          `• 🗑️ Deleted immediately\n` +
          `• ⚠️ Users warned\n` +
          `• 👢 Auto-kick after 3 warnings\n\n` +
          `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      });
    }

    if (sub === "off") {
      currentSetting.antilink = false;
      groupSettings.set(from, currentSetting);
      return sock.sendMessage(from, {
        text: `🔴 *Anti-Link DISABLED*\n\nLinks are now allowed.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      });
    }

    const status = currentSetting.antilink ? "ENABLED ✅" : "DISABLED ❌";
    return sock.sendMessage(from, {
      text: `🔗 *Anti-Link Status:* ${status}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  // ── PART 2: LINK DETECTION (runs on every group message) ─────────────────
  if (!isGroup) return;

  const settings = groupSettings.get(from) || {};
  if (!settings.antilink) return;

  const msgObj = message?.message || {};
  const text =
    msgObj.conversation ||
    msgObj.extendedTextMessage?.text ||
    msgObj.imageMessage?.caption ||
    msgObj.videoMessage?.caption ||
    msgObj.documentMessage?.caption ||
    "";

  if (!text) return;

  // ── Comprehensive link detection patterns ─────────────────────────────────
  const LINK_PATTERNS = [
    /https?:\/\/[^\s<>"']+/gi,
    /www\.[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+(:[0-9]+)?(\/[^\s<>"']*)?/gi,
    /bit\.ly\/[a-zA-Z0-9_-]+/gi,
    /tinyurl\.com\/[a-zA-Z0-9_-]+/gi,
    /ow\.ly\/[a-zA-Z0-9_-]+/gi,
    /is\.gd\/[a-zA-Z0-9_-]+/gi,
    /buff\.ly\/[a-zA-Z0-9_-]+/gi,
    /t\.co\/[a-zA-Z0-9_-]+/gi,
    /lnkd\.in\/[a-zA-Z0-9_-]+/gi,
    /cutt\.ly\/[a-zA-Z0-9_-]+/gi,
    /rebrand\.ly\/[a-zA-Z0-9_-]+/gi,
    /youtu\.be\/[a-zA-Z0-9_-]+/gi,
    /wa\.me\/[0-9]+/gi,
    /chat\.whatsapp\.com\/[a-zA-Z0-9_]+/gi,
    /t\.me\/[a-zA-Z0-9_]+/gi,
    /discord\.gg\/[a-zA-Z0-9_]+/gi,
    /drive\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
    /docs\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
    /mega\.nz\/[#!][a-zA-Z0-9_-]+/gi,
    /fb\.watch\/[a-zA-Z0-9_-]+/gi,
  ];

  const containsLink = (txt) => {
    for (const pattern of LINK_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(txt)) return true;
    }
    return false;
  };

  if (!containsLink(text)) return;

  const senderJid = message.key?.participant || from;
  const senderNumber = normalizeJid(senderJid);

  // ── FIX: Normalize JIDs before comparing so @s.whatsapp.net vs @c.us never mismatches ──
  const isUserAdmin = async (jid) => {
    try {
      const groupMetadata = await sock.groupMetadata(from);
      const normalized = normalizeJid(jid);
      return groupMetadata.participants.some(
        (p) =>
          normalizeJid(p.id) === normalized &&
          (p.admin === "admin" || p.admin === "superadmin"),
      );
    } catch {
      return false;
    }
  };

  // Skip if sender is admin
  if (await isUserAdmin(senderJid)) {
    console.log(`👑 Admin ${senderNumber} posted link — allowed`);
    return;
  }

  console.log(`🚫 Link detected from ${senderNumber}`);

  // Delete the message
  let deleted = false;
  try {
    await sock.sendMessage(from, { delete: message.key });
    deleted = true;
  } catch (deleteError) {
    console.log(`⚠️ Could not delete: ${deleteError.message}`);
  }

  // Warning tracking
  const warnKey = `${from}:${senderJid}`;
  const MAX_WARNINGS = 3;

  if (!global._antilinkWarnings) global._antilinkWarnings = new Map();
  const warningsMap =
    global.groupWarnings || global.groupWarningsMap || global._antilinkWarnings;

  const userWarnings = warningsMap.get(warnKey) || 0;
  const newWarnings = userWarnings + 1;
  warningsMap.set(warnKey, newWarnings);

  const warningsLeft = MAX_WARNINGS - newWarnings;

  if (newWarnings >= MAX_WARNINGS) {
    try {
      await sock.groupParticipantsUpdate(from, [senderJid], "remove");
      warningsMap.delete(warnKey);
      await sock.sendMessage(from, {
        text:
          `╔══════════════════════════╗\n` +
          `║   🚫 *USER REMOVED*      ║\n` +
          `╚══════════════════════════╝\n\n` +
          `@${senderNumber} has been removed for posting links after ${MAX_WARNINGS} warnings.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ Links are strictly prohibited in this group.\n` +
          `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
        mentions: [senderJid],
      });
    } catch (kickError) {
      await sock.sendMessage(from, {
        text:
          `⚠️ *WARNING ${newWarnings}/${MAX_WARNINGS}*\n\n` +
          `@${senderNumber} No links allowed!\n` +
          `❌ Could not auto-kick (ensure bot is admin)\n\n` +
          `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
        mentions: [senderJid],
      });
    }
  } else {
    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║   🚫 *NO LINKS ALLOWED*  ║\n` +
        `╚══════════════════════════╝\n\n` +
        `👤 *User:* @${senderNumber}\n` +
        `⚠️ *Warning:* ${newWarnings}/${MAX_WARNINGS}\n` +
        `💢 *Action:* Message deleted ${deleted ? "✅" : "❌"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ ${warningsLeft} more warning(s) before auto-removal.\n\n` +
        `⚡ *AYOBOT Security* | 👑 AYOCODES`,
      mentions: [senderJid],
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT - ALL COMMANDS
// ════════════════════════════════════════════════════════════════════════════
export default {
  menu,
  ping,
  status,
  creator,
  creatorGit,
  auto,
  weather,
  time,
  shorten,
  viewOnce,
  joinWaitlist,
  scrape,
  connectInfo,
  prefixinfo,
  getip,
  ip,
  myip,
  whois,
  dns,
  getpp,
  getgpp,
  jarvis,
  url,
  fetch,
  qencode,
  take,
  screenshot,
  inspect,
  imgbb,
  pdf,
  test,
  activate,
  deactivate,
  antilink,
};
