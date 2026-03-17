// commands/group/basic.js - AYOBOT v1 ENHANCED EDITION
// ════════════════════════════════════════════════════════════════════════════
//  Complete Basic Commands Module - FULLY FEATURED & ENHANCED
//  Author  : AYOCODES
//  Version : 1.0.0 (Enhanced)
//  Features: 50+ commands, full error handling, advanced scraping, image tools
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
      `🌍 Bot Version: v1.5.0\n\n` +
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
        desc: "To image",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.tovideo`",
        emoji: "● 🎥",
        desc: "To video",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "● 🎵",
        desc: "To audio",
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
        desc: "Remove BG",
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

      // ── MUSIC ────────────────────────────────────────────────
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.play`",
        emoji: "● ▶️",
        desc: "Play song",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.lyrics`",
        emoji: "● 📝",
        desc: "Lyrics",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.spotify`",
        emoji: "● 🎧",
        desc: "Spotify",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.tiktok`",
        emoji: "● 🎵",
        desc: "TikTok",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.youtube`",
        emoji: "● 📺",
        desc: "YouTube",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.trending`",
        emoji: "● 📈",
        desc: "Trending",
      },

      // ── AI ───────────────────────────────────────────────────
      { category: "> *_🤖 AI_*", cmd: "`.ai`", emoji: "● 🧠", desc: "Chat AI" },
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
        desc: "Spell check",
      },

      // ── INFO ─────────────────────────────────────────────────
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.weather`",
        emoji: "● ☁️",
        desc: "Weather",
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
        desc: "News",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.movie`",
        emoji: "● 🎬",
        desc: "Movies",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.crypto`",
        emoji: "● 💰",
        desc: "Crypto",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.stock`",
        emoji: "● 📈",
        desc: "Stocks",
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
        desc: "Translate",
      },

      // ── FUN ──────────────────────────────────────────────────
      { category: "> *_🎮 FUN_*", cmd: "`.joke`", emoji: "● 😂", desc: "Joke" },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.quote`",
        emoji: "● 💫",
        desc: "Quote",
      },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.trivia`",
        emoji: "● ❓",
        desc: "Trivia",
      },
      { category: "> *_🎮 FUN_*", cmd: "`.dice`", emoji: "● 🎲", desc: "Dice" },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.flip`",
        emoji: "● 🪙",
        desc: "Coin flip",
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
        desc: "Roast",
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
        desc: "Gen password",
      },

      // ── STORAGE ──────────────────────────────────────────────
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
        cmd: "`.remind`",
        emoji: "● ⏰",
        desc: "Reminder",
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
        desc: "Unit convert",
      },

      // ── DOCUMENTS ────────────────────────────────────────────
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.qr`",
        emoji: "● 📱",
        desc: "QR code",
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
        desc: "Make PDF",
      },
      {
        category: "> *_📄 DOCUMENTS_*",
        cmd: "`.vcf`",
        emoji: "● 📇",
        desc: "Create VCF",
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
        desc: "Group pic",
      },

      // ── GROUP ────────────────────────────────────────────────
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.kick`",
        emoji: "● 👢",
        desc: "Kick user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.add`",
        emoji: "● ➕",
        desc: "Add user",
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
        cmd: "`.antilink`",
        emoji: "● 🚫",
        desc: "Anti-link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.warn`",
        emoji: "● ⚠️",
        desc: "Warn user",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.ban`",
        emoji: "● 🔨",
        desc: "Ban user",
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
        desc: "Hide tag",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome`",
        emoji: "● 👋",
        desc: "Welcome msg",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.link`",
        emoji: "● 🔗",
        desc: "Group link",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.admins`",
        emoji: "● 👑",
        desc: "List admins",
      },
    ];

    // Add admin commands
    if (isAdmin) {
      menuCommands.push(
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.mode`",
          emoji: "● ⚙️",
          desc: "Set bot mode",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.adduser`",
          emoji: "● ✅",
          desc: "Whitelist user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.removeuser`",
          emoji: "● ❌",
          desc: "Remove user",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.listusers`",
          emoji: "● 👤",
          desc: "List users",
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
          cmd: "`.restart`",
          emoji: "● 🔄",
          desc: "Restart bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.shutdown`",
          emoji: "● 🔴",
          desc: "Shutdown bot",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.eval`",
          emoji: "● ⚡",
          desc: "Eval code",
        },
      );
    }

    // Build the formatted menu text
    let menuText = `╔════════════════════════════════════════════╗\n`;
    menuText += `║     ⚡ *AYOBOT v1.0.0 COMMAND MENU* ⚡    ║\n`;
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
    edit: loadingMsg.key,
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
    console.log(`[creator] ✅ vCard sent to ${from}`);
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

  const channel =
    ENV.WHATSAPP_CHANNEL ||
    "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25";
  const group =
    ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN";
  const github = ENV.CREATOR_GITHUB || "https://github.com/Officialay12";

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
//  AUTO-REPLY TOGGLE - ENHANCED
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
            `📎 *Original:*\n${longUrl}\n\n` +
              `🔗 *Shortened:*\n${short}\n\n` +
              `📊 *Saved:* ${longUrl.length - short.length} characters`,
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
//  VIEW ONCE - VIEW DISAPPEARING MESSAGES
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
export async function joinWaitlist({ fullArgs, from, userJid, sock }) {
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
  waitlistEntries.set(phone, { email, timestamp, userJid });
  await sock.sendMessage(from, {
    text: formatSuccess(
      "WAITLIST JOINED",
      `✅ *Email:* ${email}\n📱 *Phone:* ${phone}\n⏰ *Time:* ${timestamp}\n\nYou've been added to our waitlist!`,
    ),
  });
  if (ENV.ADMIN) {
    try {
      const adminJid = `${ENV.ADMIN.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
      await sock.sendMessage(adminJid, {
        text: `📋 *New Waitlist Entry*\n\n📧 Email: ${email}\n📱 Phone: ${phone}\n⏰ Time: ${timestamp}`,
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
        `Advanced website scraping with Cloudflare bypass\n\n` +
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
              `This site uses Cloudflare bot protection.\n\nTry: ${ENV.PREFIX}scrape https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`,
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
        `Could not retrieve this page after trying 7 methods.\n\n` +
          `*Possible reasons:*\n` +
          `• Heavy JavaScript rendering (React/Vue/Angular)\n` +
          `• Aggressive bot detection\n` +
          `• Requires login\n` +
          `• Network blocked\n\n` +
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

    const stamp = `\n<!-- ═══════════════════════════════════════════\n     Scraped by AYOBOT v1.5.0 | AYOCODES\n     Source: ${url}\n     Fetched via: ${fetchMethod}\n     Date: ${new Date().toISOString()}\n═══════════════════════════════════════════ -->\n`;

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
//  CONNECT INFO - ENHANCED
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
      `⚡ *AYOBOT v1.5.0*\n` +
      `🤖 *Full-Featured WhatsApp Bot*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME - ENHANCED
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WORLD TIME LOOKUP",
        `Get current time in any timezone\n\n` +
          `Usage: ${ENV.PREFIX}time <timezone>\n\n` +
          `Examples:\n` +
          `${ENV.PREFIX}time Africa/Lagos\n` +
          `${ENV.PREFIX}time America/New_York\n` +
          `${ENV.PREFIX}time Asia/Tokyo\n\n` +
          `_Find timezones at: worldtimeapi.org/timezones_`,
      ),
    });
  }
  await sock.sendMessage(from, { text: "⏰ *Fetching world time...*" });
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
      text: formatData("⏱️ WORLD TIME", {
        "🌍 Timezone": res.data.timezone,
        "📅 Date": d.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        "⏰ Time": d.toLocaleTimeString("en-US", { hour12: true }),
        "🕒 UTC Offset": res.data.utc_offset,
        "📆 Week Number": res.data.week_number,
        "☀️ Daylight": res.data.dst ? "Active (DST)" : "Inactive (Standard)",
        "📊 Day Progress": `${dayPct}% [${dayBar}]`,
      }),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find timezone "${fullArgs}".\n\nTry: Africa/Lagos, America/New_York`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PDF GENERATOR - ENHANCED WITH STYLING
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
        .text("AYOBOT v1.5.0 — Document Generator", 60, 18, { align: "left" });
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
          `Generated by AYOBOT v1.5.0 • AYOCODES • ${new Date().toLocaleString()}`,
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
//  IP LOOKUP - ENHANCED
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "IP ADDRESS LOOKUP",
        `Get detailed information about an IP address\n\n` +
          `Usage: ${ENV.PREFIX}ip <IP_ADDRESS>\n\n` +
          `Examples:\n` +
          `${ENV.PREFIX}ip 8.8.8.8\n` +
          `${ENV.PREFIX}ip 1.1.1.1\n` +
          `${ENV.PREFIX}ip 208.67.222.222`,
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
          `http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting`,
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
        country: r.country_name || "Unknown",
        countryCode: r.country_code || "XX",
        regionName: r.region || "Unknown",
        city: r.city || "Unknown",
        zip: r.postal || "N/A",
        lat: r.latitude || null,
        lon: r.longitude || null,
        timezone: r.timezone || "Unknown",
        isp: r.org || "Unknown",
        org: r.org || "Unknown",
        as: r.asn || "N/A",
        mobile: r.is_mobile === true,
        proxy: r.is_proxy === true,
        hosting: r.is_hosting === true,
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

  const mapUrl =
    data.lat && data.lon
      ? `https://www.google.com/maps?q=${data.lat},${data.lon}`
      : null;

  await sock.sendMessage(from, {
    text: formatData("📍 IP INFORMATION", {
      "🌐 IP Address": data.query || cleanIP,
      "📍 Country": `${data.country || "Unknown"} (${data.countryCode || "?"})`,
      "🏙️ City": data.city || "Unknown",
      "🗺️ Region": data.regionName || "Unknown",
      "📮 Postal Code": data.zip || "N/A",
      "🧭 Coordinates":
        data.lat && data.lon
          ? `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`
          : "N/A",
      "⏰ Timezone": data.timezone || "N/A",
      "📡 ISP": data.isp || "Unknown",
      "🏢 Organization": data.org || "N/A",
      "🔗 ASN": data.as || "N/A",
      "📱 Mobile Network": data.mobile ? "✅ Yes" : "❌ No",
      "🖥️ Proxy/VPN": data.proxy ? "✅ Yes" : "❌ No",
      "🏠 Hosting": data.hosting ? "✅ Yes" : "❌ No",
    }),
  });

  if (mapUrl) {
    await sock.sendMessage(from, {
      text: `🗺️ *View on Google Maps:*\n${mapUrl}`,
    });
  }
}

export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP - GET YOUR PUBLIC IP
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock }) {
  await sock.sendMessage(from, {
    text: "🌐 *Fetching your public IP address...*",
  });
  try {
    const res = await axios.get("https://api.ipify.org?format=json", {
      timeout: 8_000,
    });
    const ipData = res.data.ip;

    // Get additional info about this IP
    try {
      const infoRes = await axios.get(`http://ip-api.com/json/${ipData}`, {
        timeout: 8_000,
      });
      if (infoRes.data.status === "success") {
        const info = infoRes.data;
        await sock.sendMessage(from, {
          text: formatData("🌐 YOUR PUBLIC IP", {
            "📍 IP Address": ipData,
            "🌍 Country": `${info.country || "Unknown"} (${info.countryCode || "?"})`,
            "🏙️ City": info.city || "Unknown",
            "🗺️ Region": info.regionName || "Unknown",
            "📡 ISP": info.isp || "Unknown",
            "⏰ Timezone": info.timezone || "Unknown",
            "🧭 Coordinates": `${info.lat}, ${info.lon}`,
          }),
        });
        return;
      }
    } catch (_) {}

    // Fallback
    await sock.sendMessage(from, {
      text: formatSuccess("YOUR PUBLIC IP", `🌐 ${ipData}`),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch IP: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS - DOMAIN REGISTRATION INFO
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WHOIS LOOKUP",
        `Get domain registration information\n\n` +
          `Usage: ${ENV.PREFIX}whois <domain>\n\n` +
          `Examples:\n` +
          `${ENV.PREFIX}whois google.com\n` +
          `${ENV.PREFIX}whois github.com`,
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
      text: formatData("🔍 WHOIS INFORMATION", {
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
      text: formatError("ERROR", `WHOIS lookup failed for "${fullArgs}".`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP - GET DNS RECORDS
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "DNS LOOKUP",
        `Get DNS records for a domain\n\n` +
          `Usage: ${ENV.PREFIX}dns <domain>\n\n` +
          `Example: ${ENV.PREFIX}dns google.com`,
      ),
    });
  }
  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });
  try {
    const domain = fullArgs
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*/, "");
    const [aRes, mxRes, nsRes] = await Promise.allSettled([
      axios.get(`https://dns.google/resolve?name=${domain}&type=A`, {
        timeout: 8_000,
      }),
      axios.get(`https://dns.google/resolve?name=${domain}&type=MX`, {
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

    await sock.sendMessage(from, {
      text: formatData("🔍 DNS LOOKUP", {
        "🌐 Domain": domain,
        "📋 A Records": parse(aRes),
        "📬 MX Records": parse(mxRes),
        "🔗 NS Records": parse(nsRes),
      }),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `DNS lookup failed for "${fullArgs}".`),
    });
  }
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
//  URL INFO - GET URL DETAILS
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
//  FETCH - FETCH AND DISPLAY WEB CONTENT
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
//  SCREENSHOT - MULTIPLE SERVICES
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("SCREENSHOT", `Usage: ${ENV.PREFIX}screenshot <url>`),
    });
  }
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
//  INSPECT PAGE - ANALYZE WEBSITE
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
};
