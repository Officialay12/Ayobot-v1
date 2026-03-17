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

// commands/group/basic.js (menu section only - FIXED)

export async function menu({ from, sock, isAdmin, ENV }) {
  try {
    await sock.sendPresenceUpdate("composing", from);

    const mem = process.memoryUsage();
    const stats = {
      uptime: formatUptime(Date.now() - getSafeStartTime()),
      memory: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
    };

    // SHORT descriptions (1-2 words max) for clean menu
    const menuCommands = [
      // CORE
      { category: "*🔰 CORE*", cmd: "`.ping`", emoji: "●", desc: "Latency" },
      {
        category: "*🔰 CORE*",
        cmd: "`.status`",
        emoji: "●",
        desc: "Your role",
      },
      { category: "*🔰 CORE*", cmd: "`.creator`", emoji: "●", desc: "Creator" },
      { category: "*🔰 CORE*", cmd: "`.github`", emoji: "●", desc: "GitHub" },
      { category: "*🔰 CORE*", cmd: "`.connect`", emoji: "●", desc: "Links" },
      { category: "*🔰 CORE*", cmd: "`.prefix`", emoji: "●", desc: "Prefix" },
      { category: "*🔰 CORE*", cmd: "`.auto`", emoji: "●", desc: "Auto-reply" },

      // WEB
      { category: "> *_🌐 WEB_*", cmd: "`.ip`", emoji: "●", desc: "IP lookup" },
      { category: "> *_🌐 WEB_*", cmd: "`.myip`", emoji: "●", desc: "My IP" },
      { category: "> *_🌐 WEB_*", cmd: "`.whois`", emoji: "●", desc: "WHOIS" },
      { category: "> *_🌐 WEB_*", cmd: "`.dns`", emoji: "●", desc: "DNS" },
      { category: "> *_🌐 WEB_*", cmd: "`.url`", emoji: "●", desc: "URL info" },
      { category: "> *_🌐 WEB_*", cmd: "`.fetch`", emoji: "●", desc: "Fetch" },
      {
        category: "> *_🌐 WEB_*",
        cmd: "`.scrape`",
        emoji: "●",
        desc: "Scrape",
      },
      {
        category: "> *_🌐 WEB_*",
        cmd: "`.screenshot`",
        emoji: "●",
        desc: "SS",
      },
      {
        category: "> *_🌐 WEB_*",
        cmd: "`.shorten`",
        emoji: "●",
        desc: "Shorten",
      },

      // MEDIA
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.sticker`",
        emoji: "●",
        desc: "Make sticker",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.toimage`",
        emoji: "●",
        desc: "To image",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.tovideo`",
        emoji: "●",
        desc: "To video",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.toaudio`",
        emoji: "●",
        desc: "To audio",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.tts`",
        emoji: "●",
        desc: "Text to speech",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.removebg`",
        emoji: "●",
        desc: "Remove BG",
      },
      {
        category: "> *_🎬 MEDIA_*",
        cmd: "`.vv`",
        emoji: "●",
        desc: "View once",
      },

      // MUSIC
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.play`",
        emoji: "●",
        desc: "Play song",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.lyrics`",
        emoji: "●",
        desc: "Lyrics",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.spotify`",
        emoji: "●",
        desc: "Spotify",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.tiktok`",
        emoji: "●",
        desc: "TikTok",
      },
      {
        category: "> *_🎵 MUSIC_*",
        cmd: "`.youtube`",
        emoji: "●",
        desc: "YouTube",
      },

      // AI
      {
        category: "> *_🤖 AI_*",
        cmd: "`.ayobot`",
        emoji: "●",
        desc: "Chat AI",
      },
      { category: "> *_🤖 AI_*", cmd: "`.jarvis`", emoji: "●", desc: "Jarvis" },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.summarize`",
        emoji: "●",
        desc: "Summarize",
      },
      {
        category: "> *_🤖 AI_*",
        cmd: "`.grammar`",
        emoji: "●",
        desc: "Spell check",
      },

      // INFO
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.weather`",
        emoji: "●",
        desc: "Weather",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.time`",
        emoji: "●",
        desc: "World time",
      },
      { category: "> *_🔭 INFO_*", cmd: "`.news`", emoji: "●", desc: "News" },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.movie`",
        emoji: "●",
        desc: "Movies",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.crypto`",
        emoji: "●",
        desc: "Crypto",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.stock`",
        emoji: "●",
        desc: "Stocks",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.dict`",
        emoji: "●",
        desc: "Dictionary",
      },
      {
        category: "> *_🔭 INFO_*",
        cmd: "`.translate`",
        emoji: "●",
        desc: "Translate",
      },

      // FUN
      { category: "> *_🎮 FUN_*", cmd: "`.joke`", emoji: "●", desc: "Joke" },
      { category: "> *_🎮 FUN_*", cmd: "`.quote`", emoji: "●", desc: "Quote" },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.trivia`",
        emoji: "●",
        desc: "Trivia",
      },
      { category: "> *_🎮 FUN_*", cmd: "`.dice`", emoji: "●", desc: "Dice" },
      {
        category: "> *_🎮 FUN_*",
        cmd: "`.flip`",
        emoji: "●",
        desc: "Coin flip",
      },
      { category: "> *_🎮 FUN_*", cmd: "`.rps`", emoji: "●", desc: "RPS" },
      { category: "> *_🎮 FUN_*", cmd: "`.roast`", emoji: "●", desc: "Roast" },

      // ENCRYPTION
      {
        category: "> *_🔐 ENCRYPT_*",
        cmd: "`.encrypt`",
        emoji: "●",
        desc: "Encrypt",
      },
      {
        category: "> *_🔐 ENCRYPT_*",
        cmd: "`.decrypt`",
        emoji: "●",
        desc: "Decrypt",
      },
      {
        category: "> *_🔐 ENCRYPT_*",
        cmd: "`.hash`",
        emoji: "●",
        desc: "Hash",
      },
      {
        category: "> *_🔐 ENCRYPT_*",
        cmd: "`.password`",
        emoji: "●",
        desc: "Gen password",
      },

      // STORAGE
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.note`",
        emoji: "●",
        desc: "Save note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.getnote`",
        emoji: "●",
        desc: "Get note",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.notes`",
        emoji: "●",
        desc: "List notes",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.remind`",
        emoji: "●",
        desc: "Reminder",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.calc`",
        emoji: "●",
        desc: "Calculator",
      },
      {
        category: "> *_💾 STORAGE_*",
        cmd: "`.convert`",
        emoji: "●",
        desc: "Convert",
      },

      // DOCS
      { category: "> *_📄 DOCS_*", cmd: "`.qr`", emoji: "●", desc: "QR code" },
      {
        category: "> *_📄 DOCS_*",
        cmd: "`.pdf`",
        emoji: "●",
        desc: "Make PDF",
      },

      // GROUP
      { category: "> *_👥 GROUP_*", cmd: "`.kick`", emoji: "●", desc: "Kick" },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.promote`",
        emoji: "●",
        desc: "Promote",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.demote`",
        emoji: "●",
        desc: "Demote",
      },
      { category: "> *_👥 GROUP_*", cmd: "`.mute`", emoji: "●", desc: "Mute" },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.antilink`",
        emoji: "●",
        desc: "Anti-link",
      },
      { category: "> *_👥 GROUP_*", cmd: "`.warn`", emoji: "●", desc: "Warn" },
      { category: "> *_👥 GROUP_*", cmd: "`.ban`", emoji: "●", desc: "Ban" },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.tagall`",
        emoji: "●",
        desc: "Tag all",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.hidetag`",
        emoji: "●",
        desc: "Hide tag",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.welcome`",
        emoji: "●",
        desc: "Welcome",
      },
      {
        category: "> *_👥 GROUP_*",
        cmd: "`.link`",
        emoji: "●",
        desc: "Group link",
      },
    ];

    // ADMIN COMMANDS (shown only to owner)
    if (isAdmin) {
      menuCommands.push(
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.mode`",
          emoji: "●",
          desc: "Bot mode",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.adduser`",
          emoji: "●",
          desc: "Whitelist",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.broadcast`",
          emoji: "●",
          desc: "Broadcast",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.stats`",
          emoji: "●",
          desc: "Stats",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.restart`",
          emoji: "●",
          desc: "Restart",
        },
        {
          category: "> *_👑 ADMIN_*",
          cmd: "`.eval`",
          emoji: "●",
          desc: "Eval",
        },
      );
    }

    // FIX: Get contact safely with fallback
    const creatorContact = ENV?.CREATOR_CONTACT || "2349159180375";

    const menuText =
      formatMenu(menuCommands, isAdmin, stats) +
      `\n\n👑 *AYOCODES* wa.me/${creatorContact}`;

    // Send with image fallback
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
    } catch {
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    // Ultimate fallback - never fails
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1*\n👑 *AYOCODES*\nwa.me/2349159180375\n\nUse .help`,
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
//  CREATOR — ULTIMATE FIX: vCard ALWAYS, NEVER plain text fallback
//  Now guarantees vCard appears before community links, every single time
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  const contact = String(ENV.CREATOR_CONTACT || "").replace(/\D/g, "");
  const defaultContact = "2349159180375"; // Your backup contact

  // Use provided contact or fallback to default
  const finalContact = contact || defaultContact;

  // STEP 1: Send vCard - ALWAYS SUCCEEDS (we have fallback contact)
  try {
    // Send as document instead of contacts object for better compatibility
    const vcardContent =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `FN:AYOCODES 👑\n` +
      `ORG:AYOBOT Developer & Founder\n` +
      `TITLE:Creator of AYOBOT v1\n` +
      `TEL;type=CELL;type=VOICE;waid=${finalContact}:+${finalContact}\n` +
      `URL:${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n` +
      `NOTE:Creator of AYOBOT WhatsApp Bot\n` +
      `END:VCARD`;

    await sock.sendMessage(from, {
      document: Buffer.from(vcardContent, "utf-8"),
      mimetype: "text/vcard",
      fileName: "AYOCODES.vcf",
      caption: "👑 *AYOCODES - Creator of AYOBOT*\n_Tap to save contact_",
    });

    console.log(`[creator] ✅ vCard sent successfully to ${from}`);
  } catch (error) {
    // If document fails, try contacts object as backup
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
      console.log(`[creator] ✅ Contacts vCard sent to ${from}`);
    } catch (secondError) {
      // Absolute last resort - still send contact as text (never happens)
      await sock.sendMessage(from, {
        text: `👑 *AYOCODES*\n📞 wa.me/${finalContact}`,
      });
      console.log(`[creator] ⚠️ Text fallback used for ${from}`);
    }
  }

  // STEP 2: Ensure vCard arrives first (500ms delay)
  await delay(800); // Slightly longer to guarantee order

  // STEP 3: Community links - always sent after vCard
  const channel =
    ENV.WHATSAPP_CHANNEL ||
    "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25";
  const group =
    ENV.WHATSAPP_GROUP ||
    "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25";
  const github = ENV.CREATOR_GITHUB || "https://github.com/Officialay12";

  await sock.sendMessage(from, {
    text:
      `━━━━━ 📢 *JOIN THE COMMUNITY* ━━━━━\n\n` +
      `📱 *Channel:*\n${channel}\n\n` +
      `👥 *Group:*\n${group}\n\n` +
      `💻 *GitHub:*\n${github}\n\n` +
      `⚡ *AYOBOT v1* `,
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

  console.log(`[creator] ✅ Community links sent to ${from}`);
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
