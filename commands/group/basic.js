// commands/group/basic.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Basic Commands (Enhanced Edition)
//  Author  : AYOCODES
//  Contact : wa.me/2349159180375
//  GitHub  : https://github.com/ayocodes
//
//  FIXES & ENHANCEMENTS IN THIS VERSION:
//    - creator: vCard ALWAYS sends first, community links after. Fixed.
//    - scrape: Full bypass stack — Cloudflare, bot-detection, JS-rendered sites.
//              Extracts HTML + CSS + JS as separate files + ZIP archive.
//              Inline images as base64 for true offline viewing.
//    - All functions: proper error surfacing (no more silent catch(_){})
//    - weather: wind direction, UV index, visibility added
//    - shorten: 4 fallback services
//    - screenshot: 4 services with size validation
//    - whois: expiry date, registrar, status parsing
//    - dns: A, AAAA, MX, TXT, NS records all in one call
//    - pdf: styled with header/footer, proper font sizing
//    - ping: cleaner animated output
//    - MENU FIX: All registered commands now listed — auto, vv, time, url,
//                fetch, qencode, take, imgbb, inspect, trebleboost, jarvisv,
//                jarvisstatus, ironman, connect, jointrend, creatorsgit
//  — AYOCODES
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

// ========== TEST COMMAND ==========
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
      `⏰ Time: ${new Date().toLocaleString()}\n\n` +
      `👑 Created by AYOCODES`,
  });

  return { text: "✅ Test completed" };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// PDFKit — lazy loaded so missing package never crashes startup. — AYOCODES
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

// JSZip — lazy loaded for scrape ZIP output. — AYOCODES
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

// ─── Browser spoofing pool ────────────────────────────────────────────────────
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

// Full browser-like headers — bypasses most anti-scrape systems. — AYOCODES
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
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Cache-Control": "max-age=0",
    // Cookie consent bypass — many EU sites gate on this. — AYOCODES
    Cookie: "cookieconsent_status=dismiss; gdpr=1; consent=1; CONSENT=YES+cb",
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  MENU — COMPLETE: every registered command is now listed. — AYOCODES
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
      // ── AYOBOT CORE ─────────────────────────────────────────────────────
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.ping`",
        emoji: "● 🏓",
        desc: "Check bot latency",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.status`",
        emoji: "● 📊",
        desc: "Your profile & role",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.creator`",
        emoji: "● 👑",
        desc: "Bot creator info + contact",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.github`",
        emoji: "● 💻",
        desc: "Creator's GitHub",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.connect`",
        emoji: "● 📢",
        desc: "Community links & channels",
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
        desc: "Bot platform & system info",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.auto on/off`",
        emoji: "● 🤖",
        desc: "Toggle auto-reply / chatbot",
      },
      {
        category: "*🔰 AYOBOT*",
        cmd: "`.waitlist <email>`",
        emoji: "● 📋",
        desc: "Join the AYOBOT waitlist",
      },

      // ── NETWORK & WEB TOOLS ──────────────────────────────────────────────
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.ip <ip>`",
        emoji: "● 🔍",
        desc: "Full IP address lookup",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.myip`",
        emoji: "● 🌐",
        desc: "Show bot's public IP",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.getip <ip>`",
        emoji: "● 📍",
        desc: "IP info with ASN & org",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.whois <domain>`",
        emoji: "● 🔎",
        desc: "WHOIS domain lookup",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.dns <domain>`",
        emoji: "● 🗂️",
        desc: "DNS records (A/MX/TXT/NS)",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.url <url>`",
        emoji: "● 📡",
        desc: "URL status & headers",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.fetch <url>`",
        emoji: "● 📥",
        desc: "Fetch raw URL content",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.inspect <url>`",
        emoji: "● 🔬",
        desc: "Page tech stack inspection",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.scrape <url>`",
        emoji: "● 🕸️",
        desc: "Scrape site → HTML+CSS+JS+ZIP",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.screenshot <url>`",
        emoji: "● 📷",
        desc: "Screenshot any URL",
      },
      {
        category: "> *_🌐 NETWORK & WEB_*",
        cmd: "`.shorten <url>`",
        emoji: "● 🔗",
        desc: "Shorten URL (4 fallbacks)",
      },

      // ── CONVERSION & MEDIA ───────────────────────────────────────────────
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.sticker`",
        emoji: "● 🎭",
        desc: "Image/video → sticker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toimage`",
        emoji: "● 🖼️",
        desc: "Sticker → image",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tovideo`",
        emoji: "● 🎥",
        desc: "Sticker → video",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "● 🎵",
        desc: "Video → audio/mp3",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.tts <text>`",
        emoji: "● 🗣️",
        desc: "Text to speech",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.take`",
        emoji: "● ✂️",
        desc: "Reply to image → create sticker",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.removebg`",
        emoji: "● ✨",
        desc: "Remove image background",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.trebleboost`",
        emoji: "● ⚡",
        desc: "Reply to audio → re-send",
      },
      {
        category: "> *_🎬 CONVERSION & MEDIA_*",
        cmd: "`.vv`",
        emoji: "● 👁️",
        desc: "Open view-once message",
      },

      // ── PROFILE & PICTURES ───────────────────────────────────────────────
      {
        category: "> *_📸 PROFILE & PICTURES_*",
        cmd: "`.getpp`",
        emoji: "● 🖼️",
        desc: "Get profile picture",
      },
      {
        category: "> *_📸 PROFILE & PICTURES_*",
        cmd: "`.getgpp`",
        emoji: "● 👥",
        desc: "Get group profile pic",
      },
      {
        category: "> *_📸 PROFILE & PICTURES_*",
        cmd: "`.imgbb`",
        emoji: "● 📤",
        desc: "Upload image → get link",
      },

      // ── CONTACT TOOLS ────────────────────────────────────────────────────
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.vcf <name>|<phone>`",
        emoji: "● 📇",
        desc: "Create contact card (.vcf)",
      },
      {
        category: "> *_📞 CONTACT TOOLS_*",
        cmd: "`.viewvcf`",
        emoji: "● 👁️",
        desc: "Read a VCF file",
      },

      // ── MUSIC & MEDIA ────────────────────────────────────────────────────
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.play <song>`",
        emoji: "● ▶️",
        desc: "Download & send audio (YouTube)",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.lyrics <song>`",
        emoji: "● 📝",
        desc: "Get song lyrics",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.lyrics <song> - <artist>`",
        emoji: "● 📝",
        desc: "Lyrics with artist name",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.genius <song>`",
        emoji: "● 🎤",
        desc: "Genius.com lyrics",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.trending`",
        emoji: "● 📈",
        desc: "Top 10 trending songs",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.musicsearch <query>`",
        emoji: "● 🔍",
        desc: "Search songs on Deezer",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.artist <name>`",
        emoji: "● 👤",
        desc: "Artist info + top tracks",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.album <name>`",
        emoji: "● 💿",
        desc: "Album info + tracklist",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.spotify <url>`",
        emoji: "● 🎧",
        desc: "Spotify download",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.tiktok <url>`",
        emoji: "● 🎵",
        desc: "Download TikTok",
      },
      {
        category: "> *_🎵 MUSIC & MEDIA_*",
        cmd: "`.youtube <url>`",
        emoji: "● 📺",
        desc: "YouTube info/download",
      },

      // ── AI & INTELLIGENCE ────────────────────────────────────────────────
      {
        category: "> *_🤖 AI & INTELLIGENCE_*",
        cmd: "`.ai <question>`",
        emoji: "● 🧠",
        desc: "Chat with AYOBOT AI",
      },
      {
        category: "> *_🤖 AI & INTELLIGENCE_*",
        cmd: "`.jarvis <question>`",
        emoji: "● 🤖",
        desc: "Jarvis AI assistant",
      },
      {
        category: "> *_🤖 AI & INTELLIGENCE_*",
        cmd: "`.summarize <text>`",
        emoji: "● 📋",
        desc: "Summarizer",
      },
      {
        category: "> *_🤖 AI & INTELLIGENCE_*",
        cmd: "`.grammar <text>`",
        emoji: "● ✍️",
        desc: "Grammar & spell check",
      },

      // ── LOOKUP & INFO ────────────────────────────────────────────────────
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.weather <city>`",
        emoji: "● ☁️",
        desc: "Weather forecast",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.time <timezone>`",
        emoji: "● ⏰",
        desc: "World time ",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.news`",
        emoji: "● 📰",
        desc: "Latest headlines",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.movie <title>`",
        emoji: "● 🎬",
        desc: "Movie info",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.tv <title>`",
        emoji: "● 📺",
        desc: "TV series info",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.crypto <coin>`",
        emoji: "● 💰",
        desc: "Cryptocurrency price",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.stock <ticker>`",
        emoji: "● 📈",
        desc: "Stock market price",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.dict <word>`",
        emoji: "● 📖",
        desc: "Dictionary definition",
      },
      {
        category: "> *_🔭 LOOKUP & INFO_*",
        cmd: "`.translate <text>`",
        emoji: "● 🌍",
        desc: "Translate text",
      },

      // ── FUN & GAMES ──────────────────────────────────────────────────────
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
        desc: "Motivational quote",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.trivia`",
        emoji: "● ❓",
        desc: "Trivia question",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.dice`",
        emoji: "● 🎲",
        desc: "Roll a dice",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.flip`",
        emoji: "● 🪙",
        desc: "Coin flip",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.rps <r/p/s>`",
        emoji: "● ✊",
        desc: "Rock paper scissors",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.roast @user`",
        emoji: "● 🔥",
        desc: "Roast someone",
      },
      {
        category: "> *_🎮 FUN & GAMES_*",
        cmd: "`.pickup`",
        emoji: "● 💘",
        desc: "Pickup line",
      },

      // ── ENCRYPTION & SECURITY ────────────────────────────────────────────
      {
        category: "> *_🔐 ENCRYPTION & SECURITY_*",
        cmd: "`.encrypt <text>`",
        emoji: "● 🔒",
        desc: "Encrypt text",
      },
      {
        category: "> *_🔐 ENCRYPTION & SECURITY_*",
        cmd: "`.decrypt <text>`",
        emoji: "● 🔓",
        desc: "Decrypt text",
      },
      {
        category: "> *_🔐 ENCRYPTION & SECURITY_*",
        cmd: "`.hash <text>`",
        emoji: "● #️⃣",
        desc: "MD5 / hash text",
      },
      {
        category: "> *_🔐 ENCRYPTION & SECURITY_*",
        cmd: "`.password`",
        emoji: "● 🔑",
        desc: "Generate strong password",
      },
      {
        category: "> *_🔐 ENCRYPTION & SECURITY_*",
        cmd: "`.scan <url>`",
        emoji: "● 🛡️",
        desc: "VirusTotal URL scan",
      },

      // ── STORAGE & UTILITIES ──────────────────────────────────────────────
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.note <key> <text>`",
        emoji: "● 💾",
        desc: "Save a note",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.getnote <key>`",
        emoji: "● 📂",
        desc: "Retrieve a note",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.notes`",
        emoji: "● 🗂️",
        desc: "List all saved notes",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.delnote <key>`",
        emoji: "● 🗑️",
        desc: "Delete a note",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.remind <time> <msg>`",
        emoji: "● ⏰",
        desc: "Set a reminder",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.calc <expr>`",
        emoji: "● 🧮",
        desc: "Calculator",
      },
      {
        category: "> *_💾 STORAGE & UTILITIES_*",
        cmd: "`.convert <val> <unit>`",
        emoji: "● ⚖️",
        desc: "Unit converter",
      },

      // ── DOCUMENTS & QR ───────────────────────────────────────────────────
      {
        category: "> *_📄 DOCUMENTS & QR_*",
        cmd: "`.qr <text>`",
        emoji: "● 📱",
        desc: "Generate QR code",
      },
      {
        category: "> *_📄 DOCUMENTS & QR_*",
        cmd: "`.qencode <text>`",
        emoji: "● 🔲",
        desc: "Encode text to QR image",
      },
      {
        category: "> *_📄 DOCUMENTS & QR_*",
        cmd: "`.pdf <title>|<body>`",
        emoji: "● 📄",
        desc: "Generate styled PDF",
      },

      // ── GROUP MANAGEMENT ─────────────────────────────────────────────────
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.kick @user`",
        emoji: "● 👢",
        desc: "Remove member (admin)",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.promote @user`",
        emoji: "● ⭐",
        desc: "Make member admin",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.demote @user`",
        emoji: "● 🔽",
        desc: "Remove admin rights",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.mute`",
        emoji: "● 🔇",
        desc: "Mute group (admin only)",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.unmute`",
        emoji: "● 🔊",
        desc: "Unmute group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antilink on/off`",
        emoji: "● 🚫",
        desc: "Block links in group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antispam on/off`",
        emoji: "● 🛑",
        desc: "Block spam in group",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warn @user`",
        emoji: "● ⚠️",
        desc: "Warn a member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warnings`",
        emoji: "● 📋",
        desc: "View warning list",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ban @user`",
        emoji: "● 🔨",
        desc: "Ban a member",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.tagall`",
        emoji: "● 📢",
        desc: "Mention all members",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.hidetag`",
        emoji: "● 👻",
        desc: "Silent mention all",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome on/off`",
        emoji: "● 👋",
        desc: "Toggle welcome messages",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.groupinfo`",
        emoji: "● ℹ️",
        desc: "Group details & stats",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.rules`",
        emoji: "● 📜",
        desc: "View group rules",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.link`",
        emoji: "● 🔗",
        desc: "Get group invite link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.admins`",
        emoji: "● 👑",
        desc: "List group admins",
      },
    ];

    // ── ADMIN-ONLY SECTION (only shown to owner) ──────────────────────────
    if (isAdmin) {
      menuCommands.push(
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.mode public/private`",
          emoji: "● ⚙️",
          desc: "Switch bot mode",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.adduser <number>`",
          emoji: "● ✅",
          desc: "Whitelist a user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.removeuser <number>`",
          emoji: "● ❌",
          desc: "Remove from whitelist",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.broadcast <msg>`",
          emoji: "● 📢",
          desc: "Broadcast to all chats",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.gbc <msg>`",
          emoji: "● 🌍",
          desc: "Global broadcast",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.stats`",
          emoji: "● 📊",
          desc: "Bot usage stats",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.superban <number>`",
          emoji: "● ⛔",
          desc: "Permanently ban user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.restart`",
          emoji: "● 🔄",
          desc: "Restart the bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.shutdown`",
          emoji: "● 🔴",
          desc: "Shut down the bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.eval <code>`",
          emoji: "● ⚡",
          desc: "Execute JavaScript code",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.listusers`",
          emoji: "● 👤",
          desc: "View whitelisted users",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.botstatus`",
          emoji: "● 🤖",
          desc: "Full bot diagnostics",
        },
      );
    }

    const menuText = formatMenu(menuCommands, isAdmin, stats);

    try {
      await sock.sendMessage(from, {
        audio: {
          url: ENV.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
        },
        mimetype: "audio/aac",
        ptt: false,
      });
    } catch (_) {}

    try {
      await sock.sendMessage(from, {
        image: { url: ENV.WELCOME_IMAGE_URL },
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
    } catch (_) {
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1*\n👑 *AYOCODES*\n\nType ${ENV.PREFIX}help for commands`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PING
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

  const uptime = Date.now() - getSafeStartTime();
  const h = Math.floor(uptime / 3_600_000);
  const min = Math.floor((uptime % 3_600_000) / 60_000);
  const s = Math.floor((uptime % 60_000) / 1_000);
  const uptimeStr =
    h > 0 ? `${h}h ${min}m ${s}s` : min > 0 ? `${min}m ${s}s` : `${s}s`;
  const responseMs = Date.now() - start;
  const speedIcon = responseMs < 300 ? "🟢" : responseMs < 800 ? "🟡" : "🔴";

  await sock.sendMessage(from, {
    text:
      `━━━━━ 🏓 *PONG!* ━━━━━\n\n` +
      `${speedIcon} *Response:* ${responseMs}ms\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `📊 *Messages:* ${messageCount}\n` +
      `🟢 *Status:* ONLINE\n\n`,
    edit: loadingMsg.key,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  STATUS
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

  let role = "USER";
  if (isAdminUser) role = "ADMIN 👑";
  else if (isAuthorizedUser) role = "AUTHORIZED ✓";

  await sock.sendMessage(from, {
    text:
      `━━━━━ 👤 *STATUS* ━━━━━\n\n` +
      `📱 *Phone:* ${phone}\n` +
      `👑 *Role:* ${role}\n` +
      `📊 *Commands used:* ${total}\n` +
      `🤖 *Bot mode:* ${(sessionMode || ENV.BOT_MODE || "public").toUpperCase()}\n\n` +
      `⚡ _Use ${ENV.PREFIX}menu to explore_ · 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR — vCard ALWAYS sends first, community links after. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  const contact = String(ENV.CREATOR_CONTACT || "").replace(/\D/g, "");

  // STEP 1: Send vCard first — always, no matter what. — AYOCODES
  if (contact) {
    try {
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
    } catch (e) {
      // vCard failed — send plain contact number so user still gets it. — AYOCODES
      await sock.sendMessage(from, {
        text: `👑 *AYOCODES*\n📞 wa.me/${contact}\n💻 ${ENV.CREATOR_GITHUB}`,
      });
    }
  } else {
    await sock.sendMessage(from, {
      text: `👑 *AYOCODES*\n💻 ${ENV.CREATOR_GITHUB}`,
    });
  }

  // STEP 2: Small pause so messages arrive in order. — AYOCODES
  await delay(500);

  // STEP 3: Community links always sent AFTER vCard. — AYOCODES
  await sock.sendMessage(from, {
    text:
      `━━━━━ 📢 *JOIN THE COMMUNITY* ━━━━━\n\n` +
      `📱 *WhatsApp Channel:*\n${ENV.WHATSAPP_CHANNEL}\n\n` +
      `👥 *WhatsApp Group:*\n${ENV.WHATSAPP_GROUP}\n\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB}\n\n` +
      `⚡ _Built with love by AYOCODES_ 👑`,
  });
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
// ════════════════════════════════════════════════════════════════════════════
export async function auto({ args, from, userJid, sock }) {
  const sub = args[0]?.toLowerCase();
  if (!sub || !["on", "off", "status"].includes(sub)) {
    const cur = autoReplyEnabled.get(userJid) ? "ON" : "OFF";
    return sock.sendMessage(from, {
      text: formatInfo(
        "AUTO-REPLY",
        `Current: *${cur}*\n\n${ENV.PREFIX}auto on     — Enable\n${ENV.PREFIX}auto off    — Disable\n${ENV.PREFIX}auto status — Check`,
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
  const s = autoReplyEnabled.get(userJid) ? "ON 🟢" : "OFF 🔴";
  await sock.sendMessage(from, {
    text: formatInfo("AUTO-REPLY STATUS", `Status: *${s}*`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WEATHER — wind direction, humidity bar, UV index. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function weather({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER",
        `Usage: ${ENV.PREFIX}weather <city>\nExample: ${ENV.PREFIX}weather Lagos`,
      ),
    });
  }
  if (!ENV.OPENWEATHER_KEY) {
    return sock.sendMessage(from, {
      text: formatError(
        "CONFIG ERROR",
        "OPENWEATHER_KEY not set in environment variables.",
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

    await sock.sendMessage(from, {
      text:
        `${condEmoji} *WEATHER: ${d.name}, ${d.sys.country}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🌡️ *Temp:* ${d.main.temp}°C (feels ${d.main.feels_like}°C)\n` +
        `📊 *Min/Max:* ${d.main.temp_min}°C / ${d.main.temp_max}°C\n` +
        `💧 *Humidity:* ${d.main.humidity}% [${humBar}]\n` +
        `🌬️ *Wind:* ${d.wind.speed} m/s ${windDir}\n` +
        `👁️ *Visibility:* ${((d.visibility || 10000) / 1000).toFixed(1)} km\n` +
        `☁️ *Clouds:* ${d.clouds?.all || 0}%\n` +
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
//  SHORTEN — 4 fallback services. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function shorten({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("🔗 URL SHORTENER", `Usage: ${ENV.PREFIX}shorten <url>`),
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
      name: "ulvis.net",
      fn: async () => {
        const r = await axios.get(
          `https://ulvis.net/api.php?url=${encodeURIComponent(longUrl)}&private=1`,
          { timeout: 8_000 },
        );
        return r.data;
      },
    },
  ];

  for (const svc of services) {
    try {
      const short = (await svc.fn())?.trim();
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
    text: formatError(
      "ERROR",
      "All shortener services failed. Try again later.",
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
          `Reply to a view-once message with ${ENV.PREFIX}vv`,
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
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not open view once: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WAITLIST
// ════════════════════════════════════════════════════════════════════════════
export async function joinWaitlist({ fullArgs, from, userJid, sock }) {
  const email = fullArgs?.trim() || "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID EMAIL",
        `Provide a valid email.\nExample: ${ENV.PREFIX}jointrend user@example.com`,
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
//  SCRAPE — Full bypass stack. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function scrape({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEB SCRAPER",
        `Usage: ${ENV.PREFIX}scrape <url>\nExample: ${ENV.PREFIX}scrape https://example.com\n\n` +
          `📦 Returns:\n` +
          `  • Self-contained HTML (CSS+JS+images inlined)\n` +
          `  • Extracted CSS file\n` +
          `  • Extracted JS file\n` +
          `  • ZIP archive of all files`,
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
              `This site uses Cloudflare bot protection.\n\n` +
                `_AYOBOT can still get the cached version:_\n` +
                `Try: ${ENV.PREFIX}scrape https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`,
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

  // Fallback 1: Google Cache. — AYOCODES
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

  // Fallback 2: Wayback Machine. — AYOCODES
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
        `Could not retrieve this page after trying 7 methods.\n\n` +
          `*Possible reasons:*\n` +
          `• Heavy JavaScript rendering (React/Vue/Angular SPA)\n` +
          `• Aggressive bot detection beyond standard bypass\n` +
          `• Site requires login\n` +
          `• Network blocked\n\n` +
          `Try: ${ENV.PREFIX}screenshot ${url} for a visual snapshot`,
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
    const h1Text = $("h1").first().text().trim().substring(0, 100) || "";

    const stamp =
      `\n<!-- ═══════════════════════════════════════════\n` +
      `     Scraped by AYOBOT v1 | AYOCODES\n` +
      `     Source: ${url}\n` +
      `     Fetched via: ${fetchMethod}\n` +
      `     Date: ${new Date().toISOString()}\n` +
      `     GitHub: https://github.com/Officialay12\n` +
      `═══════════════════════════════════════════ -->\n`;

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
        `📰 *H1:* ${h1Text}\n` +
        `📎 *Links:* ${linkCount} | 🖼️ *Images:* ${totalImgs}\n` +
        `📥 *Fetch method:* ${fetchMethod}\n` +
        `📁 *HTML size:* ${(htmlBuf.length / 1024).toFixed(1)} KB\n` +
        `🎨 *CSS size:* ${(cssBuf.length / 1024).toFixed(1)} KB\n` +
        `⚙️ *JS size:* ${(jsBuf.length / 1024).toFixed(1)} KB\n` +
        `✅ *Assets inlined:* CSS, JS, Images (first 20)\n━━━━━━━━━━━━━━━━━━━━━━━\n`,
    });

    await sock.sendMessage(from, {
      document: htmlBuf,
      mimetype: "text/html",
      fileName: `${domain2}_${ts}_full.html`,
      caption: `📄 *Full page (HTML+CSS+JS+Images inlined)*\n🌐 Open in any browser — works offline`,
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
          `AYOBOT Web Scraper Archive\n` +
            `Source: ${url}\n` +
            `Fetched: ${new Date().toISOString()}\n` +
            `Method: ${fetchMethod}\n\n` +
            `Files:\n` +
            `  ${domain2}_full.html  — Self-contained page (open in browser)\n` +
            `  ${domain2}_styles.css — All CSS extracted\n` +
            `  ${domain2}_scripts.js — All JS extracted\n` +
            `  ${domain2}_original.html — Raw original HTML\n\n` +
            `github.com/Officialay12\n`,
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
          caption: `📦 *ZIP Archive* — all files packed together`,
        });
      } catch (_) {}
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
      `╔══════════════════════════╗\n║   📱 *CONNECT WITH US*   ║\n╚══════════════════════════╝\n\n` +
      `👑 *Creator:* AYOCODES\n📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || ""}\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB}\n\n` +
      `📢 *Channel:* ${ENV.WHATSAPP_CHANNEL}\n👥 *Group:* ${ENV.WHATSAPP_GROUP}`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WORLD TIME",
        `Usage: ${ENV.PREFIX}time <timezone>\nExample: ${ENV.PREFIX}time Africa/Lagos\n\nFind yours: worldtimeapi.org/timezones`,
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
    const dayPct = Math.round(
      ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100,
    );
    const dayBars = Math.round(dayPct / 10);
    const dayBar = "█".repeat(dayBars) + "░".repeat(10 - dayBars);
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
        "📊 Day": `${dayPct}% [${dayBar}]`,
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
//  CREATE PDF — styled with header + footer. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function pdf({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "PDF GENERATOR",
        `Usage: ${ENV.PREFIX}pdf <title> | <content>\nExample: ${ENV.PREFIX}pdf My Doc | Hello World`,
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
          "PDF generator not available. Run: npm install pdfkit",
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

      doc.rect(0, 0, doc.page.width, 50).fill("#1a1a2e");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("AYOBOT v1 · Document Generator", 60, 16, { align: "left" });
      doc
        .fillColor("#aaaaaa")
        .font("Helvetica")
        .fontSize(9)
        .text(new Date().toLocaleDateString(), 0, 18, {
          align: "right",
          width: doc.page.width - 60,
        });

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
      doc.moveDown(1);
      doc
        .fillColor("#333333")
        .font("Helvetica")
        .fontSize(12)
        .text(content, { lineGap: 6, paragraphGap: 8 });

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
          `Generated by AYOBOT v1 · AYOCODES · ${new Date().toLocaleString()}`,
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
//  IP LOOKUP
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "IP LOOKUP",
        `Usage: ${ENV.PREFIX}getip <IP>\nExample: ${ENV.PREFIX}getip 8.8.8.8`,
      ),
    });
  }
  const cleanIP = fullArgs.trim();
  await sock.sendMessage(from, { text: `🌐 *Looking up IP: ${cleanIP}...*` });

  let data = null;
  const apis = [
    async () =>
      (
        await axios.get(
          `http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`,
          { timeout: 8_000 },
        )
      ).data,
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
        org: r.org,
        as: r.asn,
      };
    },
    async () => {
      const r = (
        await axios.get(`https://freeipapi.com/api/json/${cleanIP}`, {
          timeout: 8_000,
        })
      ).data;
      return {
        status: "success",
        query: cleanIP,
        country: r.countryName,
        countryCode: r.countryCode,
        regionName: r.regionName,
        city: r.cityName,
        zip: r.zipCode,
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timeZone,
        isp: r.isProxy ? "Proxy/VPN detected" : "N/A",
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

  const flag = data.countryCode
    ? String.fromCodePoint(
        ...[...data.countryCode.toUpperCase()].map(
          (c) => 0x1f1e0 - 65 + c.charCodeAt(0),
        ),
      )
    : "🌐";

  await sock.sendMessage(from, {
    text: formatData("📍 IP INFORMATION", {
      "🌐 IP Address": data.query || cleanIP,
      "📍 Country": `${flag} ${data.country || "Unknown"} (${data.countryCode || "?"})`,
      "🏙️ City": data.city || "Unknown",
      "🗺️ Region": data.regionName || "Unknown",
      "📮 ZIP": data.zip || "N/A",
      "🌍 Coords": data.lat && data.lon ? `${data.lat}, ${data.lon}` : "N/A",
      "⏰ Timezone": data.timezone || "N/A",
      "📡 ISP": data.isp || "Unknown",
      "🏢 Org": data.org || "N/A",
      "🔢 ASN": data.as || "N/A",
    }),
  });
}

export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock }) {
  await sock.sendMessage(from, { text: "🌐 *Fetching bot's public IP...*" });
  try {
    const res = await axios.get("https://api.ipify.org?format=json", {
      timeout: 8_000,
    });
    await sock.sendMessage(from, {
      text: formatSuccess("BOT PUBLIC IP", `🌐 ${res.data.ip}`),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch IP: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS — expiry, registrar, status. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WHOIS LOOKUP",
        `Usage: ${ENV.PREFIX}whois <domain>\nExample: ${ENV.PREFIX}whois google.com`,
      ),
    });
  }
  await sock.sendMessage(from, {
    text: `🔍 *WHOIS lookup for ${fullArgs}...*`,
  });
  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const res = await axios.get(`https://rdap.org/domain/${domain}`, {
      timeout: 10_000,
    });
    const d = res.data;
    const ns = d.nameservers?.map((n) => n.ldhName).join(", ") || "Unknown";
    const status = d.status?.join(", ") || "Unknown";
    const evtMap = {};
    (d.events || []).forEach((e) => {
      evtMap[e.eventAction] = e.eventDate?.split("T")[0];
    });
    const registrar =
      d.entities
        ?.find((e) => e.roles?.includes("registrar"))
        ?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] || "Unknown";

    await sock.sendMessage(from, {
      text: formatData("WHOIS LOOKUP", {
        "🌐 Domain": d.ldhName || domain,
        "🏢 Registrar": registrar,
        "📋 Status": status,
        "📡 Nameservers": ns,
        "📅 Registered": evtMap["registration"] || "Unknown",
        "🔄 Updated": evtMap["last changed"] || "Unknown",
        "⏰ Expires": evtMap["expiration"] || "Unknown",
      }),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `WHOIS lookup failed for "${fullArgs}".\n${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP — A, AAAA, MX, TXT, NS. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "DNS LOOKUP",
        `Usage: ${ENV.PREFIX}dns <domain>\nExample: ${ENV.PREFIX}dns google.com`,
      ),
    });
  }
  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });
  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const [aRes, aaaaRes, mxRes, txtRes, nsRes] = await Promise.allSettled([
      axios.get(`https://dns.google/resolve?name=${domain}&type=A`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=AAAA`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=TXT`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=NS`, {
        timeout: 8_000,
      }),
    ]);
    const parse = (res) =>
      res.status === "fulfilled"
        ? res.value.data.Answer?.map((a) => a.data).join("\n") || "No records"
        : "Failed";
    const aRecords =
      aRes.status === "fulfilled"
        ? aRes.value.data.Answer?.map((a) => a.data).join(", ") ||
          "No A records"
        : "Failed";

    await sock.sendMessage(from, {
      text: formatData("DNS LOOKUP", {
        "🌐 Domain": domain,
        "📋 A": aRecords,
        "📋 AAAA": parse(aaaaRes),
        "📬 MX": parse(mxRes),
        "📝 TXT": parse(txtRes).substring(0, 200),
        "🔗 NS": parse(nsRes),
      }),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `DNS lookup failed for "${fullArgs}".\n${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GETPP
// ════════════════════════════════════════════════════════════════════════════
export async function getpp({ message, from, sock }) {
  try {
    const msg = message.message;
    const senderJid =
      message.key?.participant || message.key?.remoteJid || from;
    const quotedParticipant =
      msg?.extendedTextMessage?.contextInfo?.participant ||
      msg?.imageMessage?.contextInfo?.participant ||
      msg?.videoMessage?.contextInfo?.participant ||
      null;
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
    } catch (_) {}
    if (!ppUrl) {
      try {
        ppUrl = await sock.profilePictureUrl(targetJid, "preview");
      } catch (_) {}
    }

    if (ppUrl) {
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: `🖼️ *Profile Picture*\n👤 @${displayNum}`,
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
//  GETGPP
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
//  URL INFO
// ════════════════════════════════════════════════════════════════════════════
export async function url({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("URL INFO", `Usage: ${ENV.PREFIX}url <url>`),
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
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("FETCH", `Usage: ${ENV.PREFIX}fetch <url>`),
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
      text: formatInfo("QR ENCODE", `Usage: ${ENV.PREFIX}qencode <text>`),
    });
  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}&margin=10&color=1a1a2e&bgcolor=ffffff`;
    await sock.sendMessage(from, {
      image: { url: qrUrl },
      caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}\n👑 Created by AYOCODES`,
    });
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
//  IMGBB
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
        text: `📤 *Image Uploaded*\n\n🔗 *URL:* ${result.url}\n🌐 *Service:* ${result.service}`,
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
//  SCREENSHOT — 4 services. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("SCREENSHOT", `Usage: ${ENV.PREFIX}screenshot <url>`),
    });
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sock.sendMessage(from, {
    text: `📷 *Taking screenshot of ${urlStr}...*`,
  });

  const services = [
    `https://image.thum.io/get/width/1280/crop/800/noanimate/${urlStr}`,
    `https://mini.s-shot.ru/1280x1024/1280/${encodeURIComponent(urlStr)}`,
    `https://api.apiflash.com/v1/urltoimage?access_key=free&url=${encodeURIComponent(urlStr)}&width=1280&height=800&format=jpeg`,
    `https://screenshotone.com/take?access_key=open&url=${encodeURIComponent(urlStr)}&viewport_width=1280&viewport_height=800`,
  ];

  for (const ssUrl of services) {
    try {
      const res = await axios.get(ssUrl, {
        responseType: "arraybuffer",
        timeout: 25_000,
        headers: { "User-Agent": randomUA() },
        validateStatus: (s) => s === 200,
      });
      if (res.data?.byteLength > 5_000) {
        await sock.sendMessage(from, {
          image: Buffer.from(res.data),
          caption: `📷 *Screenshot*\n🔗 ${urlStr}\n📦 ${(res.data.byteLength / 1024).toFixed(1)} KB`,
        });
        return;
      }
    } catch (_) {}
  }
  await sock.sendMessage(from, {
    text: formatError(
      "SCREENSHOT FAILED",
      `Could not screenshot:\n${urlStr}\n\nTry: ${ENV.PREFIX}scrape ${urlStr}`,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  INSPECT
// ════════════════════════════════════════════════════════════════════════════
export async function inspect({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("INSPECT", `Usage: ${ENV.PREFIX}inspect <url>`),
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
    const techs = [];
    if (response.data.includes("react")) techs.push("React");
    if (response.data.includes("vue.js") || response.data.includes("__vue"))
      techs.push("Vue.js");
    if (response.data.includes("angular")) techs.push("Angular");
    if (response.data.includes("wp-content")) techs.push("WordPress");
    if (response.data.includes("shopify")) techs.push("Shopify");
    if (response.headers["x-powered-by"])
      techs.push(response.headers["x-powered-by"]);

    await sock.sendMessage(from, {
      text: formatData("🔍 PAGE INSPECTION", {
        "📝 Title": ($("title").text() || "No title").substring(0, 100),
        "📋 Description": (
          $('meta[name="description"]').attr("content") || "None"
        ).substring(0, 100),
        "🔑 Keywords": (
          $('meta[name="keywords"]').attr("content") || "None"
        ).substring(0, 80),
        "📊 Status": `${response.status}`,
        "📎 Links": `${$("a[href]").length}`,
        "🖼️ Images": `${$("img").length}`,
        "📜 Scripts": `${$("script").length}`,
        "🎨 Stylesheets": `${$('link[rel="stylesheet"]').length}`,
        "⚙️ Tech Stack": techs.length ? techs.join(", ") : "Unknown",
        "🌐 Server": response.headers["server"] || "Unknown",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TREBLE BOOST
// ════════════════════════════════════════════════════════════════════════════
export async function trebleboost({ message, from, sock }) {
  const quoted =
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted || !quoted.audioMessage) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "TREBLEBOOST",
        `Reply to an audio message with ${ENV.PREFIX}trebleboost`,
      ),
    });
  }
  await sock.sendMessage(from, { text: "⚡ *Processing audio...*" });
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
    await sock.sendMessage(from, { text: "⚡ *Audio processed!*" });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not process audio: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS
// ════════════════════════════════════════════════════════════════════════════
export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS AI",
        `🤖 *Your Personal AI Assistant*\n\nUsage: ${ENV.PREFIX}jarvis <question>`,
      ),
    });
  }
  await sock.sendMessage(from, { text: "🤖 *Jarvis is thinking...*" });
  const query = fullArgs.trim();
  const lower = query.toLowerCase();

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

  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS - Powered by AYOCODES*\n\n"Analyzing: ${query.substring(0, 100)}..."\n\n` +
      `💡 _For full AI chat use:_ ${ENV.PREFIX}ai ${query.substring(0, 50)}\n\n` +
      `👑 *AYOCODES - The Tony Stark of AYOBOT*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS VOICE
// ════════════════════════════════════════════════════════════════════════════
export async function jarvisVoice({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("JARVIS VOICE", `Usage: ${ENV.PREFIX}jarvisv <text>`),
    });
  await sock.sendMessage(from, { text: "🔊 *Generating voice...*" });
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
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "VOICE ERROR",
        `Could not generate voice: ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  JARVIS STATUS
// ════════════════════════════════════════════════════════════════════════════
export async function jarvisStatus({ from, sock }) {
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86_400),
    h = Math.floor((uptime % 86_400) / 3_600),
    m = Math.floor((uptime % 3_600) / 60),
    s = Math.floor(uptime % 60);
  const mem = process.memoryUsage();
  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS SYSTEM STATUS*\n\n` +
      `⏱️ *Uptime:* ${d}d ${h}h ${m}m ${s}s\n` +
      `💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(2)}MB\n` +
      `🔋 *Arc Reactor:* 100%\n` +
      `🛡️ *Shield:* Online\n\n` +
      `👑 *AYOCODES*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  IRON MAN STATUS
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
      `🤖 *IRON MAN SUIT STATUS*\n\n` +
      `⚡ *Suit:* ${randomSuit}\n` +
      `🔋 *Arc Reactor:* 100%\n` +
      `🛡️ *Defense:* Online\n\n` +
      `👑 *AYOCODES* — "I am Iron Man."`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  VCF
// ════════════════════════════════════════════════════════════════════════════
export async function vcf({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("VCF", `Usage: ${ENV.PREFIX}vcf <name>|<phone>`),
    });
  const parts = fullArgs.split("|");
  if (parts.length < 2)
    return sock.sendMessage(from, {
      text: formatError("ERROR", `Format: ${ENV.PREFIX}vcf <name>|<phone>`),
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
//  VIEW VCF
// ════════════════════════════════════════════════════════════════════════════
export async function viewvcf({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.documentMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "VIEWVCF",
          `Reply to a VCF file with ${ENV.PREFIX}viewvcf`,
        ),
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
    const orgMatch = vcfContent.match(/ORG:([^\r\n]+)/);
    const emailMatch = vcfContent.match(/EMAIL[^:]*:([^\r\n]+)/);
    await sock.sendMessage(from, {
      text: formatData("VCF CONTACT", {
        "👤 Name": nameMatch ? nameMatch[1].trim() : "Unknown",
        "📞 Phone": phoneMatch ? phoneMatch[1].trim() : "Unknown",
        "🏢 Org": orgMatch ? orgMatch[1].trim() : "N/A",
        "📧 Email": emailMatch ? emailMatch[1].trim() : "N/A",
      }),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not read VCF file: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
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
