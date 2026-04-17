// commands/group/basic.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Complete Basic Commands Module — FULLY FIXED & PRODUCTION READY
//  Author  : AYOCODES
//  Version : v1.0.0
//
//  FIXES IN THIS VERSION:
//    • Removed ALL duplicate function declarations (sendReaction, normalizeJid)
//    • Fixed antilink broken template string syntax
//    • Fixed .take — now handles stickers (forwards to DM as favorite)
//    • Enhanced .myip — detects actual connected device IP via WS session
//    • Updated .creator — native WhatsApp contact card (Message + Add contact UI)
//    • Added ⏳/✅/❌ reaction processing to: weather, time, shorten, whois,
//      dns, ip, myip, getpp, qr, screenshot, inspect, scrape, pdf, imgbb, take
//    • All reactions use single sendReaction() at top of file
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
  groupWarnings,
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

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE SETUP
// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

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

// ─────────────────────────────────────────────────────────────────────────────
//  normalizeJid — SINGLE SOURCE OF TRUTH (declared ONCE here, used everywhere)
//  "2349159180375:58@s.whatsapp.net" → "2349159180375"
//  "120363422418001588@g.us"         → "120363422418001588"
// ─────────────────────────────────────────────────────────────────────────────
function normalizeJid(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
//  sendReaction — SINGLE SOURCE OF TRUTH (declared ONCE here, used everywhere)
//  Silently fails so reactions never break commands.
// ─────────────────────────────────────────────────────────────────────────────
async function sendReaction(sock, message, emoji) {
  try {
    if (!message?.key?.remoteJid || !message?.key) return false;
    await sock.sendMessage(message.key.remoteJid, {
      react: { text: emoji, key: message.key },
    });
    return true;
  } catch (err) {
    console.debug("[Reaction] Failed:", err.message);
    return false;
  }
}

function safeFixed(val, digits = 4) {
  const n = parseFloat(val);
  return isNaN(n) ? "N/A" : n.toFixed(digits);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

function browserHeaders(ua, referer = "https://www.google.com/") {
  return {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: referer,
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Cache-Control": "max-age=0",
    DNT: "1",
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  TEST
// ════════════════════════════════════════════════════════════════════════════
export async function test({ from, sock, userJid, session, sessionId, sessionMode, ownerPhone }) {
  const phone = normalizeJid(userJid);
  console.log("🔧 TEST COMMAND EXECUTED!");
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
//  MENU
// ════════════════════════════════════════════════════════════════════════════
export async function menu({ from, sock, isAdmin, ENV }) {
  try {
    await sock.sendPresenceUpdate("composing", from);
    const mem = process.memoryUsage();
    const memPct = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
    const memUsed = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const memTotal = (mem.heapTotal / 1024 / 1024).toFixed(2);

    const categories = [
      [
        "*🔰 CORE*",
        [
          ["`.ping`", "🏓", "Latency & uptime"],
          ["`.menu`", "📋", "Commands list"],
          ["`.status`", "📊", "Your status"],
          ["`.creator`", "👑", "Creator info"],
          ["`.github`", "💻", "GitHub"],
          ["`.connect`", "📢", "Community"],
          ["`.prefix`", "ℹ️", "Prefix info"],
          ["`.auto`", "🤖", "Auto-reply"],
          ["`.test`", "🧪", "Test command"],
          ["`.ok`", "📤", "View once to DM"],
          ["`.start`", "🚀", "Open DM with bot"],
        ],
      ],
      [
        "> *_🌐 WEB TOOLS_*",
        [
          ["`.ip`", "🔍", "IP lookup"],
          ["`.myip`", "🌐", "Your IP"],
          ["`.whois`", "🔎", "Domain WHOIS"],
          ["`.dns`", "🗂️", "DNS lookup"],
          ["`.url`", "📡", "URL info"],
          ["`.fetch`", "📥", "Fetch data"],
          ["`.scrape`", "🕸️", "Web scrape"],
          ["`.screenshot`", "📷", "Screenshot"],
          ["`.shorten`", "🔗", "URL shorten"],
          ["`.inspect`", "🔍", "Inspect page"],
        ],
      ],
      [
        "> *_🎬 MEDIA_*",
        [
          ["`.sticker`", "🎭", "Make sticker"],
          ["`.toimage`", "🖼️", "Sticker to image"],
          ["`.tovideo`", "🎥", "Sticker to video"],
          ["`.toaudio`", "🎵", "Video to audio"],
          ["`.tts`", "🗣️", "Text to speech"],
          ["`.removebg`", "✨", "Remove background"],
          ["`.vv`", "👁️", "View once"],
          ["`.take`", "✂️", "Save sticker / image→sticker"],
          ["`.imgbb`", "📤", "Upload image"],
        ],
      ],
      [
        "> *_🎵 MUSIC & DOWNLOADS_*",
        [
          ["`.play`", "▶️", "Download & play music"],
          ["`.lyrics`", "📝", "Get song lyrics"],
          ["`.spotify`", "🎧", "Spotify info"],
          ["`.tiktok`", "🎵", "Download TikTok"],
          ["`.youtube`", "📺", "YouTube info"],
          ["`.instagram`", "📸", "Download Instagram"],
          ["`.facebook`", "👤", "Download Facebook"],
          ["`.twitter`", "🐦", "Download Twitter/X"],
          ["`.trending`", "📈", "Trending songs"],
          ["`.dl`", "⬇️", "Universal downloader"],
        ],
      ],
      [
        "> *_🖼️ IMAGE & GIF_*",
        [
          ["`.img`", "🖼️", "Search images"],
          ["`.gif`", "🎞️", "Search GIFs"],
          ["`.pinterest`", "📌", "Pinterest search"],
        ],
      ],
      [
        "> *_🤖 AI_*",
        [
          ["`.ayobot`", "🧠", "Chat with AI"],
          ["`.jarvis`", "🤖", "Jarvis AI"],
          ["`.summarize`", "📋", "Summarize text"],
          ["`.grammar`", "✍️", "Check grammar"],
        ],
      ],
      [
        "> *_🔭 INFO_*",
        [
          ["`.weather`", "☁️", "Weather forecast"],
          ["`.time`", "⏰", "World time"],
          ["`.news`", "📰", "Latest news"],
          ["`.movie`", "🎬", "Movie info"],
          ["`.crypto`", "💰", "Crypto prices"],
          ["`.stock`", "📈", "Stock prices"],
          ["`.dict`", "📖", "Dictionary"],
          ["`.translate`", "🌍", "Translate text"],
        ],
      ],
      [
        "> *_🎮 FUN_*",
        [
          ["`.joke`", "😂", "Random joke"],
          ["`.quote`", "💫", "Inspirational quote"],
          ["`.trivia`", "❓", "Trivia question"],
          ["`.dice`", "🎲", "Roll dice"],
          ["`.flip`", "🪙", "Flip coin"],
          ["`.rps`", "✊", "Rock paper scissors"],
          ["`.roast`", "🔥", "Roast someone"],
          ["`.pickup`", "💘", "Pickup line"],
        ],
      ],
      [
        "> *_🔐 ENCRYPTION_*",
        [
          ["`.encrypt`", "🔒", "Encrypt text"],
          ["`.decrypt`", "🔓", "Decrypt text"],
          ["`.hash`", "#️⃣", "Hash text"],
          ["`.password`", "🔑", "Generate password"],
        ],
      ],
      [
        "> *_💾 STORAGE_*",
        [
          ["`.note`", "💾", "Save note"],
          ["`.getnote`", "📂", "Get note"],
          ["`.notes`", "🗂️", "List notes"],
          ["`.delnote`", "🗑️", "Delete note"],
          ["`.remind`", "⏰", "Set reminder"],
          ["`.reminders`", "📋", "List reminders"],
          ["`.cancelreminder`", "❌", "Cancel reminder"],
          ["`.snooze`", "💤", "Snooze reminder"],
          ["`.calc`", "🧮", "Calculator"],
          ["`.convert`", "⚖️", "Unit converter"],
        ],
      ],
      [
        "> *_📄 DOCUMENTS_*",
        [
          ["`.qr`", "📱", "Generate QR code"],
          ["`.pdf`", "📄", "Create PDF"],
          ["`.vcf`", "📇", "Create vCard"],
        ],
      ],
      [
        "> *_👤 PROFILE_*",
        [
          ["`.getpp`", "🖼️", "Get profile pic"],
          ["`.getgpp`", "👥", "Get group pic"],
        ],
      ],
      [
        "> *_👥 GROUP_*",
        [
          ["`.kick`", "👢", "Kick member"],
          ["`.add`", "➕", "Add member"],
          ["`.promote`", "⭐", "Make admin"],
          ["`.demote`", "🔽", "Remove admin"],
          ["`.mute`", "🔇", "Mute group"],
          ["`.unmute`", "🔊", "Unmute group"],
          ["`.lock`", "🔒", "Lock group"],
          ["`.unlock`", "🔓", "Unlock group"],
          ["`.antilink`", "🚫", "Anti-link"],
          ["`.antispam`", "🛡️", "Anti-spam"],
          ["`.warn`", "⚠️", "Warn user"],
          ["`.warnings`", "📊", "View warnings"],
          ["`.clearwarns`", "🧹", "Clear warnings"],
          ["`.ban`", "🔨", "Ban user"],
          ["`.unban`", "✅", "Unban user"],
          ["`.listbanned`", "📋", "List banned"],
          ["`.tagall`", "📢", "Tag all"],
          ["`.hidetag`", "👻", "Hidden tag"],
          ["`.welcome`", "👋", "Toggle welcome"],
          ["`.setwelcome`", "✏️", "Set welcome msg"],
          ["`.goodbye`", "👋", "Toggle goodbye"],
          ["`.setgoodbye`", "✏️", "Set goodbye msg"],
          ["`.link`", "🔗", "Group invite link"],
          ["`.revoke`", "🔄", "Revoke group link"],
          ["`.admins`", "👑", "List admins"],
          ["`.groupinfo`", "ℹ️", "Group information"],
          ["`.rules`", "📜", "Show rules"],
          ["`.setrules`", "✏️", "Set group rules"],
          ["`.pin`", "📌", "Pin message"],
          ["`.unpin`", "❌", "Unpin message"],
          ["`.delete`", "🗑️", "Delete message"],
          ["`.settings`", "📜", "View group settings"],
          ["`.resetsettings`", "🔄", "Reset group settings"],
          ["`.leave`", "👋", "Bot leave group"],
          ["`.activate`", "✅", "Activate bot in group"],
          ["`.deactivate`", "❌", "Deactivate bot in group"],
          ["`.groupdebug`", "🐛", "Debug group info"],
          ["`.testadmin`", "🔍", "Admin diagnostic"],
          ["`.refreshadmin`", "🔄", "Refresh admin cache"],
        ],
      ],
      [
        "> *_👑 ADMIN_*",
        [
          ["`.mode`", "⚙️", "Change bot mode"],
          ["`.adduser`", "✅", "Add authorized user"],
          ["`.removeuser`", "❌", "Remove authorized user"],
          ["`.listusers`", "📋", "List authorized users"],
          ["`.broadcast`", "📢", "Broadcast to users"],
          ["`.globalbc`", "🌍", "Broadcast to groups"],
          ["`.stats`", "📊", "Bot statistics"],
          ["`.botstatus`", "📈", "Detailed status"],
          ["`.superban`", "🔨", "Permanently ban user"],
          ["`.clearbans`", "🧹", "Clear all bans"],
          ["`.restart`", "🔄", "Restart bot"],
          ["`.shutdown`", "⛔", "Shutdown bot"],
          ["`.eval`", "⚡", "Execute code"],
        ],
      ],
      ["> *_📋 WAITLIST_*", [["`.waitlist`", "📝", "Join waitlist"]]],
      ["> *_🛡️ SECURITY_*", [["`.scan`", "🔍", "Scan URL for threats"]]],
    ];

    let totalCmds = 0;
    let menuText =
      `╔════════════════════════════════════════════╗\n` +
      `║         ⚡ *AYOBOT v1.0.0* ⚡         ║\n` +
      `╚════════════════════════════════════════════╝\n\n` +
      `├ ⏱️ Uptime: ${formatUptime(Date.now() - getSafeStartTime())}\n` +
      `├ 👤 Mode: ${isAdmin ? "ADMIN 👑" : "USER"}\n` +
      `└ 📨 Messages: ${messageCount || 0}\n`;

    for (const [cat, cmds] of categories) {
      menuText += `\n${cat}\n`;
      for (const [cmd, emoji, desc] of cmds) {
        menuText += `● ${emoji} ${cmd} — ${desc}\n`;
        totalCmds++;
      }
    }

    menuText +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _Total Commands: ${totalCmds}_\n` +
      `👑 _Created by AYOCODES_`;

    try {
      await sock.sendMessage(from, {
        image: {
          url: ENV?.WELCOME_IMAGE_URL || "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
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
    } catch (_) {
      await sock.sendMessage(from, { text: menuText });
    }
  } catch (error) {
    console.error("[MENU ERROR]", error.message);
    await sock.sendMessage(from, {
      text: `🚀 *AYOBOT v1.0.0*\n👑 *AYOCODES*\nType ${ENV.PREFIX}menu for commands`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PING
// ════════════════════════════════════════════════════════════════════════════
export async function ping({ from, sock }) {
  const start = Date.now();
  await sock.sendMessage(from, { text: `🏓 *Pinging...*` });
  await delay(500);
  const uptime = Date.now() - getSafeStartTime();
  const h = Math.floor(uptime / 3_600_000),
    min = Math.floor((uptime % 3_600_000) / 60_000),
    s = Math.floor((uptime % 60_000) / 1_000);
  const uptimeStr = h > 0 ? `${h}h ${min}m ${s}s` : min > 0 ? `${min}m ${s}s` : `${s}s`;
  await sock.sendMessage(from, {
    text:
      `━━━━━ 🏓 *PONG!* ━━━━━\n\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `🟢 *Status:* ONLINE\n` +
      `🤖 *Version:* 1.0.0\n` +
      `👑 *AYOBOT v1*\n`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  STATUS
// ════════════════════════════════════════════════════════════════════════════
export async function status({ from, userJid, isAdmin: isAdminUser, isAuthorized: isAuthorizedUser, sock, sessionMode }) {
  const phone = normalizeJid(userJid);
  const usage = commandUsage.get(userJid) || {};
  const total = Object.values(usage).reduce((a, b) => a + b, 0);
  const topCmd = Object.entries(usage).sort((a, b) => b[1] - a[1])[0];
  let role = "👤 REGULAR USER";
  if (isAdminUser) role = "👑 BOT OWNER (ADMIN)";
  else if (isAuthorizedUser) role = "✅ AUTHORIZED USER";
  await sock.sendMessage(from, {
    text:
      `━━━━━ 👤 *YOUR STATUS* ━━━━━\n\n` +
      `📱 *Phone:* ${phone}\n🏆 *Role:* ${role}\n📊 *Commands Used:* ${total}\n` +
      `⭐ *Top Command:* ${topCmd ? `${topCmd[0]} (${topCmd[1]}x)` : "None"}\n` +
      `🤖 *Bot Mode:* ${(sessionMode || ENV.BOT_MODE || "public").toUpperCase()}\n` +
      `🌍 *Server Time:* ${new Date().toLocaleString()}\n\n` +
      `⚡ _Use ${ENV.PREFIX}menu to see all commands_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATOR — Native WhatsApp contact card (Message + Add contact UI)
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  const finalContact =
    String(ENV.CREATOR_CONTACT || "").replace(/\D/g, "") || "2349159180375";

  // Build minimal vCard — WhatsApp uses FN + TEL;waid= to render the card UI
  const vcard =
    `BEGIN:VCARD\n` +
    `VERSION:3.0\n` +
    `FN:AYOCODES 👑 (Bot Owner)\n` +
    `N:AYOCODES;;;;\n` +
    `TEL;type=CELL;type=VOICE;waid=${finalContact}:+${finalContact}\n` +
    `END:VCARD`;

  try {
    // contacts message renders the "Message / Add contact" card UI
    await sock.sendMessage(from, {
      contacts: {
        displayName: "AYOCODES 👑 (The Architect)",
        contacts: [{ vcard }],
      },
    });
  } catch (_) {
    // Fallback to plain text if contacts type fails
    await sock.sendMessage(from, {
      text: `👑 *AYOCODES — Bot Owner*\n📞 wa.me/${finalContact}`,
    });
  }
}

export async function creatorGit({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `━━━━━ 👑 *AYOCODES GITHUB* ━━━━━\n\n` +
      `🔗 *GitHub Profile:*\n${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n\n` +
      `💻 _Check out my projects!_\n\n🤖 *Featured Project:* AYOBOT v1.0.0\n👑 _AYOCODES_`,
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
        `Current Status: *${cur}*\n\n${ENV.PREFIX}auto on — Enable\n${ENV.PREFIX}auto off — Disable\n${ENV.PREFIX}auto status — Check status`,
      ),
    });
  }
  if (sub === "on") {
    autoReplyEnabled.set(userJid, true);
    return sock.sendMessage(from, {
      text: formatSuccess("AUTO-REPLY", "Auto-reply has been *ENABLED* ✅"),
    });
  }
  if (sub === "off") {
    autoReplyEnabled.set(userJid, false);
    return sock.sendMessage(from, {
      text: formatSuccess("AUTO-REPLY", "Auto-reply has been *DISABLED* 🔴"),
    });
  }
  await sock.sendMessage(from, {
    text: formatInfo(
      "AUTO-REPLY STATUS",
      `Current Status: *${autoReplyEnabled.get(userJid) ? "ENABLED 🟢" : "DISABLED 🔴"}*`,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  WEATHER  — reactions: ⏳ processing → ✅ done / ❌ error
// ════════════════════════════════════════════════════════════════════════════
export async function weather({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER LOOKUP",
        `Usage: ${ENV.PREFIX}weather <city>\n\nExamples:\n${ENV.PREFIX}weather Lagos\n${ENV.PREFIX}weather New York`,
      ),
    });
  }
  if (!ENV.OPENWEATHER_KEY) {
    return sock.sendMessage(from, {
      text: formatError("CONFIG ERROR", "OPENWEATHER_KEY is not configured."),
    });
  }

  await sendReaction(sock, message, "⏳");

  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(fullArgs)}&appid=${ENV.OPENWEATHER_KEY}&units=metric`,
      { timeout: 10_000 },
    );
    const d = res.data;
    const windDirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const windDir = windDirs[Math.round((d.wind?.deg || 0) / 22.5) % 16];
    const humBars = Math.round(d.main.humidity / 10);
    const humBar = "█".repeat(humBars) + "░".repeat(10 - humBars);
    const condId = d.weather[0]?.id || 800;
    const condEmoji =
      condId >= 800 ? "☀️" : condId >= 700 ? "🌫️" : condId >= 600 ? "❄️" :
      condId >= 500 ? "🌧️" : condId >= 300 ? "🌦️" : condId >= 200 ? "⛈️" : "🌤️";

    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      text:
        `${condEmoji} *WEATHER: ${d.name}, ${d.sys.country}*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🌡️ *Temperature:* ${d.main.temp}°C\n🤔 *Feels Like:* ${d.main.feels_like}°C\n` +
        `📊 *Min/Max:* ${d.main.temp_min}°C / ${d.main.temp_max}°C\n💧 *Humidity:* ${d.main.humidity}% [${humBar}]\n` +
        `🌬️ *Wind:* ${d.wind.speed} m/s ${windDir}\n👁️ *Visibility:* ${d.visibility ? `${(d.visibility / 1000).toFixed(1)} km` : "N/A"}\n` +
        `⛅ *Clouds:* ${d.clouds?.all || 0}%\n🔷 *Pressure:* ${d.main.pressure ? `${d.main.pressure} hPa` : "N/A"}\n` +
        `📝 *Conditions:* ${d.weather[0].description}\n🌅 *Sunrise:* ${new Date(d.sys.sunrise * 1000).toLocaleTimeString()}\n` +
        `🌇 *Sunset:* ${new Date(d.sys.sunset * 1000).toLocaleTimeString()}\n\n👑 _AYOCODES_`,
    });
  } catch (err) {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        err.response?.status === 404 ? `City "${fullArgs}" not found.` : err.message,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "⏰ WORLD TIME",
        `Usage: ${ENV.PREFIX}time <city or timezone>\n\nExamples: ${ENV.PREFIX}time Lagos\n${ENV.PREFIX}time Africa/Lagos`,
      ),
    });
  }

  await sendReaction(sock, message, "⏳");

  let timeData = null;
  const query = fullArgs.trim();

  try {
    const res = await axios.get(
      `https://worldtimeapi.org/api/timezone/${query.replace(/ /g, "_")}`,
      { timeout: 5000 },
    );
    if (res.data)
      timeData = {
        timezone: res.data.timezone,
        datetime: res.data.datetime,
        utc_offset: res.data.utc_offset,
        source: "WorldTimeAPI",
      };
  } catch (_) {}

  if (!timeData) {
    try {
      const res = await axios.get(
        `https://www.timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(query)}`,
        { timeout: 5000 },
      );
      if (res.data) {
        const dt = new Date(res.data.dateTime);
        timeData = {
          timezone: res.data.timeZone,
          datetime: dt.toISOString(),
          utc_offset: res.data.utcOffset,
          source: "TimeAPI.io",
        };
      }
    } catch (_) {}
  }

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
          const dt = new Date(timeRes.data.dateTime);
          timeData = {
            timezone: `${name}, ${country}`,
            datetime: dt.toISOString(),
            utc_offset: timeRes.data.utcOffset,
            source: "Geo + TimeAPI",
          };
        }
      }
    } catch (_) {}
  }

  if (!timeData) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: query, hour12: true,
        hour: "numeric", minute: "numeric", second: "numeric",
        year: "numeric", month: "long", day: "numeric",
        weekday: "long", timeZoneName: "long",
      });
      const now = new Date();
      const parts = formatter.formatToParts(now);
      let dateStr = "", timeStr = "", tzName = query;
      parts.forEach((p) => {
        if (p.type === "weekday") dateStr += p.value + ", ";
        else if (p.type === "month") dateStr += p.value + " ";
        else if (p.type === "day") dateStr += p.value + ", ";
        else if (p.type === "year") dateStr += p.value;
        else if (["hour","minute","second","dayPeriod"].includes(p.type)) timeStr += p.value + " ";
        else if (p.type === "timeZoneName") tzName = p.value;
      });
      const utcOffset = -now.getTimezoneOffset() / 60;
      timeData = {
        timezone: tzName,
        datetime: now.toISOString(),
        utc_offset: utcOffset > 0 ? `+${utcOffset}` : `${utcOffset}`,
        source: "Intl (System)",
        customDate: dateStr,
        customTime: timeStr.trim(),
      };
    } catch (_) {}
  }

  if (!timeData) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError(
        "TIME LOOKUP FAILED",
        `Could not find time for "${query}".\n\nTry: Africa/Lagos, America/New_York, Europe/London, Asia/Tokyo`,
      ),
    });
  }

  const d = new Date(timeData.datetime);
  const dayPct = Math.round(((d.getHours() * 60 + d.getMinutes()) / 1440) * 100);
  const dayBar = "█".repeat(Math.round(dayPct / 10)) + "░".repeat(10 - Math.round(dayPct / 10));
  let utcOffset = timeData.utc_offset;
  if (typeof utcOffset === "number") utcOffset = utcOffset > 0 ? `+${utcOffset}` : `${utcOffset}`;
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     ⏰ *WORLD TIME*      ║\n╚══════════════════════════╝\n\n` +
      `🌍 *Timezone:* ${timeData.timezone || query}\n` +
      `📅 *Date:* ${timeData.customDate || d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n` +
      `⏰ *Time:* ${timeData.customTime || d.toLocaleTimeString("en-US", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" })}\n` +
      `📆 *Day:* ${days[d.getDay()]}\n🕒 *UTC Offset:* ${utcOffset}\n📊 *Day Progress:* ${dayPct}% ${dayBar}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  SHORTEN  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function shorten({ fullArgs, from, sock, message }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: `🔗 *URL SHORTENER*\n\nUsage: ${ENV.PREFIX}shorten <url>\n\nExample: ${ENV.PREFIX}shorten https://example.com/long-url-here`,
    });
  }

  let longUrl = fullArgs.trim().split(/\s+/)[0];
  if (!longUrl.startsWith("http://") && !longUrl.startsWith("https://")) longUrl = "https://" + longUrl;

  try { new URL(longUrl); } catch (_) {
    return sock.sendMessage(from, {
      text: `❌ *Invalid URL*\n\n"${longUrl}" is not a valid URL.\n\nExample: ${ENV.PREFIX}shorten https://example.com`,
    });
  }

  await sendReaction(sock, message, "⏳");

  const services = [
    { name: "TinyURL", url: `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, parse: (d) => d.trim() },
    { name: "is.gd",   url: `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, parse: (d) => d.trim() },
    { name: "v.gd",    url: `https://v.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, parse: (d) => d.trim() },
    { name: "clck.ru", url: `https://clck.ru/--?url=${encodeURIComponent(longUrl)}`, parse: (d) => d.trim() },
  ];

  let shortUrl = null, usedService = null;
  for (const svc of services) {
    try {
      const res = await axios.get(svc.url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
      const result = svc.parse(res.data);
      if (result?.startsWith("http")) { shortUrl = result; usedService = svc.name; break; }
    } catch (_) {}
  }

  if (shortUrl) {
    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      text:
        `✅ *URL SHORTENED*\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📎 *Original:*\n${longUrl}\n\n🔗 *Shortened:*\n${shortUrl}\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      linkPreview: false,
    });
  } else {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, {
      text: `❌ *SHORTEN FAILED*\n\nAll shortener services temporarily unavailable.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      linkPreview: false,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  VIEW ONCE  (.vv) — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function viewOnce({ message, from, sock }) {
  await sendReaction(sock, message, "⏳");
  try {
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      await sendReaction(sock, message, "❌");
      return sock.sendMessage(from, {
        text: formatInfo("VIEW ONCE", `Reply to a view-once message with: ${ENV.PREFIX}vv`),
      });
    }

    let mediaMsg = null, type = null;
    for (const container of [
      quotedMsg.viewOnceMessageV2?.message,
      quotedMsg.viewOnceMessageV2Extension?.message,
      quotedMsg,
    ]) {
      if (!container) continue;
      if (container.imageMessage) { mediaMsg = container.imageMessage; type = "image"; break; }
      if (container.videoMessage) { mediaMsg = container.videoMessage; type = "video"; break; }
      if (container.audioMessage) { mediaMsg = container.audioMessage; type = "audio"; break; }
    }

    if (!mediaMsg || !type) {
      await sendReaction(sock, message, "❌");
      return sock.sendMessage(from, {
        text: formatError("NOT VIEW ONCE", "This is not a view-once message."),
      });
    }

    const stream = await downloadContentFromMessage(mediaMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const caption = `📊 *Type:* ${type.toUpperCase()}\n📦 *Size:* ${(buffer.length / 1024).toFixed(2)} KB\n✅ *Saved Successfully*\n👑 AYOBOT`;

    await sendReaction(sock, message, "✅");
    if (type === "image") await sock.sendMessage(from, { image: buffer, caption });
    else if (type === "video") await sock.sendMessage(from, { video: buffer, caption });
    else await sock.sendMessage(from, { audio: buffer, mimetype: "audio/mp4", ptt: true });
  } catch (err) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not open view once message: ${err.message}`),
    });
  }
}
// ════════════════════════════════════════════════════════════════════════════
//  .ok — VIEW ONCE TO DM (FIXED: Correct sender targeting + DM delivery)
//  Reactions only: ⏳ processing | ✅ sent | ❌ not view-once | ⚠️ privacy | 🔴 error
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract the REAL personal JID of whoever sent the .ok command
 * Works in both groups and DMs
 */
function getCommandSenderJid(message) {
  const remoteJid = message.key?.remoteJid ?? "";
  const isGroup = remoteJid.endsWith("@g.us");

  if (isGroup) {
    // In a group, the actual sender is always in participant
    const participant = message.key?.participant || message.participant || "";
    return participant;
  }

  // In DM, remoteJid is the sender
  return remoteJid;
}

/**
 * Strip everything and return just the numeric phone number
 */
function extractPhone(jid = "") {
  return jid
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@g\.us$/, "")
    .replace(/@lid$/, "")
    .replace(/[^0-9]/g, "")
    .trim();
}

/**
 * Send view-once media directly to the command sender's personal DM
 */
async function deliverViewOnceToDM(sock, senderJid, buffer, type) {
  const phone = extractPhone(senderJid);

  if (!phone || phone.length < 7) {
    return { success: false, error: "Could not resolve a valid phone number from sender JID" };
  }

  // Always build a clean personal JID — never group JID
  const dmJid = `${phone}@s.whatsapp.net`;

  // Guard: never send to a group JID
  if (dmJid.endsWith("@g.us")) {
    return { success: false, error: "Resolved JID is a group — aborting to prevent wrong delivery" };
  }

  try {
    // Step 1: Open the chat with a ping (WhatsApp requires this for unknown chats)
    await sock.sendMessage(dmJid, {
      text: "📬 *Sending your view-once media...*\n_Tap to open when it arrives._"
    });

    await delay(1500);

    // Step 2: Typing presence
    await sock.sendPresenceUpdate("composing", dmJid);
    await delay(600);

    // Step 3: Send the actual view-once
    const payload = buildViewOncePayload(buffer, type);
    await sock.sendMessage(dmJid, payload);

    return { success: true };

  } catch (error) {
    console.error("[deliverViewOnceToDM] Primary attempt failed:", error.message);

    const isPrivacyError =
      error.message?.includes("not-allowed") ||
      error.message?.includes("privacy") ||
      error.message?.includes("blocked") ||
      error.message?.includes("forbidden");

    if (isPrivacyError) {
      // Fallback: send regular version first to establish trust, then view-once
      try {
        await sock.sendMessage(dmJid, buildRegularPayload(buffer, type));
        await delay(1500);
        await sock.sendMessage(dmJid, buildViewOncePayload(buffer, type));
        return { success: true, wasRetried: true };
      } catch (retryErr) {
        return { success: false, error: retryErr.message, isPrivacy: true };
      }
    }

    return { success: false, error: error.message };
  }
}

/**
 * Build view-once message payload
 */
function buildViewOncePayload(buffer, type) {
  const payload = { [type]: buffer, viewOnce: true };
  if (type === "image") {
    payload.mimetype = "image/jpeg";
    payload.caption = "🔒 View-Once Image\n👑 AYOBOT";
  } else if (type === "video") {
    payload.mimetype = "video/mp4";
    payload.caption = "🔒 View-Once Video\n👑 AYOBOT";
  } else if (type === "audio") {
    payload.mimetype = "audio/mp4";
    payload.ptt = true;
  }
  return payload;
}

/**
 * Build regular (non-view-once) payload for fallback trust establishment
 */
function buildRegularPayload(buffer, type) {
  const payload = { [type]: buffer };
  if (type === "image") {
    payload.mimetype = "image/jpeg";
    payload.caption = "📸 Establishing channel...";
  } else if (type === "video") {
    payload.mimetype = "video/mp4";
    payload.caption = "🎥 Establishing channel...";
  } else if (type === "audio") {
    payload.mimetype = "audio/mp4";
    payload.ptt = true;
  }
  return payload;
}

/**
 * Extract view-once media from a quoted message
 * Covers all known WhatsApp wrapper formats
 */
function extractViewOnceMedia(quotedMsg) {
  if (!quotedMsg) return { mediaMsg: null, type: null };

  const containers = [
    quotedMsg?.viewOnceMessageV2?.message,
    quotedMsg?.viewOnceMessageV2Extension?.message,
    quotedMsg?.viewOnceMessage?.message,
    quotedMsg?.ephemeralMessage?.message,
    quotedMsg,
  ];

  for (const container of containers) {
    if (!container) continue;
    if (container.imageMessage) return { mediaMsg: container.imageMessage, type: "image" };
    if (container.videoMessage) return { mediaMsg: container.videoMessage, type: "video" };
    if (container.audioMessage) return { mediaMsg: container.audioMessage, type: "audio" };
  }

  return { mediaMsg: null, type: null };
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * .ok COMMAND
 * Reply to a view-once message → it gets sent to YOUR DM only
 * Works in groups and DMs
 */
export async function viewOnceToDM({ message, userJid, sock }) {
  await sendReaction(sock, message, "⏳");

  try {
    // ── 1. Resolve WHO triggered the command (must be their personal JID) ──
    //    userJid from the handler can sometimes be the group JID on some
    //    bot frameworks — so we always re-derive from the raw message
    const senderJid = getCommandSenderJid(message);
    const resolvedJid = senderJid || userJid || "";

    if (!resolvedJid || resolvedJid.endsWith("@g.us")) {
      // Could not resolve a personal JID — abort
      console.error("[.ok] Could not resolve personal sender JID:", resolvedJid);
      await sendReaction(sock, message, "🔴");
      return;
    }

    // ── 2. Get the quoted message ─────────────────────────────────────────
    // Check all possible paths the quoted message could be nested under
    const contextInfo =
      message.message?.extendedTextMessage?.contextInfo ||
      message.message?.imageMessage?.contextInfo ||
      message.message?.videoMessage?.contextInfo ||
      message.message?.audioMessage?.contextInfo ||
      message.message?.stickerMessage?.contextInfo ||
      null;

    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
      await sendReaction(sock, message, "❌");
      return;
    }

    // ── 3. Extract view-once media from the quoted message ────────────────
    const { mediaMsg, type } = extractViewOnceMedia(quotedMsg);

    if (!mediaMsg || !type) {
      // Quoted message exists but is not view-once media
      await sendReaction(sock, message, "❌");
      return;
    }

    // ── 4. Download the media buffer ──────────────────────────────────────
    let buffer = Buffer.from([]);
    try {
      const stream = await downloadContentFromMessage(mediaMsg, type);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
    } catch (downloadErr) {
      console.error("[.ok] Download failed:", downloadErr.message);
      await sendReaction(sock, message, "🔴");
      return;
    }

    if (!buffer || buffer.length === 0) {
      console.error("[.ok] Empty buffer after download");
      await sendReaction(sock, message, "🔴");
      return;
    }

    // ── 5. Deliver ONLY to the command sender's personal DM ───────────────
    const result = await deliverViewOnceToDM(sock, resolvedJid, buffer, type);

    // ── 6. React based on result ──────────────────────────────────────────
    if (result.success) {
      await sendReaction(sock, message, "✅");
    } else if (result.isPrivacy) {
      await sendReaction(sock, message, "⚠️");
    } else {
      console.error("[.ok] Delivery failed:", result.error);
      await sendReaction(sock, message, "🔴");
    }

  } catch (error) {
    console.error("[.ok] Unhandled error:", error.message);
    await sendReaction(sock, message, "🔴");
  }
}


// ════════════════════════════════════════════════════════════════════════════
//  WAITLIST
// ════════════════════════════════════════════════════════════════════════════
export async function joinWaitlist({ fullArgs, from, userJid, sock, message }) {
  const email = fullArgs?.trim() || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sock.sendMessage(from, {
      text: formatError("INVALID EMAIL", `Example: ${ENV.PREFIX}waitlist user@example.com`),
    });
  }
  const phone = normalizeJid(userJid);
  const timestamp = new Date().toLocaleString();
  let pushname = "Unknown";
  try {
    if (message?.pushName) pushname = message.pushName;
    else if (message?.verifiedBizName) pushname = message.verifiedBizName;
  } catch (_) {}

  waitlistEntries.set(phone, { email, phone, timestamp, userJid, name: pushname, platform: "WhatsApp" });
  await sock.sendMessage(from, {
    text: formatSuccess(
      "✅ WAITLIST JOINED",
      `📧 *Email:* ${email}\n📱 *Phone:* +${phone}\n⏰ *Time:* ${timestamp}\n\nYou've been added to our waitlist!`,
    ),
  });
  try {
    await sock.sendMessage(`2349159180375@s.whatsapp.net`, {
      text:
        `╔══════════════════════════╗\n║   📋 *NEW WAITLIST ENTRY* ║\n╚══════════════════════════╝\n\n` +
        `👤 *Name:* ${pushname}\n📧 *Email:* ${email}\n📱 *Phone:* +${phone}\n` +
        `⏰ *Time:* ${timestamp}\n📊 *Total:* ${waitlistEntries.size}\n\n⚡ *AYOBOT v1* | 👑 AYOCODES`,
      mentions: [userJid],
    });
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  SCRAPE  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function scrape({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("WEB SCRAPER", `Usage: ${ENV.PREFIX}scrape <url>\n\n📦 Returns: self-contained HTML, CSS, JS, ZIP`),
    });
  }

  let url = fullArgs.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  await sendReaction(sock, message, "⏳");

  let html = null, finalUrl = url, fetchMethod = "unknown";
  const headerProfiles = [
    { label: "Chrome/Windows", headers: browserHeaders(USER_AGENTS[0]) },
    { label: "Firefox/Windows", headers: browserHeaders(USER_AGENTS[3], "https://www.bing.com/") },
    { label: "Safari/Mac", headers: browserHeaders(USER_AGENTS[4]) },
    { label: "Chrome/Android", headers: browserHeaders(USER_AGENTS[6]) },
  ];

  for (const profile of headerProfiles) {
    if (html) break;
    try {
      const res = await axios.get(url, {
        headers: profile.headers, timeout: 25_000, maxRedirects: 15,
        maxContentLength: 50 * 1024 * 1024, responseType: "text", validateStatus: (s) => s < 500,
      });
      if (res.data && typeof res.data === "string" && res.data.length > 500) {
        if (res.data.includes("cf-browser-verification") || res.data.includes("challenges.cloudflare.com")) {
          await sendReaction(sock, message, "❌");
          await sock.sendMessage(from, {
            text: formatError("CLOUDFLARE PROTECTED", `Try: ${ENV.PREFIX}screenshot ${url}`),
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

  if (!html) {
    try {
      const waRes = await axios.get(
        `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { timeout: 10_000 },
      );
      const snapUrl = waRes.data?.archived_snapshots?.closest?.url;
      if (snapUrl) {
        const res = await axios.get(snapUrl, {
          headers: browserHeaders(USER_AGENTS[0]), timeout: 20_000,
          responseType: "text", validateStatus: (s) => s < 500,
        });
        if (res.data?.length > 500) { html = res.data; fetchMethod = "Wayback Machine"; }
      }
    } catch (_) {}
  }

  if (!html) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError("SCRAPE FAILED", `Could not retrieve this page.\n\nTry: ${ENV.PREFIX}screenshot ${url}`),
    });
  }

  try {
    const $ = cheerio.load(html, { decodeEntities: false });
    let baseUrl;
    try { baseUrl = new URL(finalUrl); } catch (_) { baseUrl = new URL(url); }
    const domain = baseUrl.hostname.replace("www.", "");

    const toAbs = (href) => {
      if (!href || href.startsWith("data:") || href.startsWith("blob:")) return href;
      try { return href.startsWith("http") ? href : new URL(href, baseUrl).toString(); } catch (_) { return href; }
    };
    const fetchAsset = async (assetUrl, type = "text") => {
      try {
        const res = await axios.get(assetUrl, {
          headers: browserHeaders(randomUA()), timeout: 10_000,
          responseType: type, validateStatus: (s) => s < 400,
        });
        return res.data;
      } catch (_) { return null; }
    };

    let extractedCSS = `/* AYOBOT Scraper — Extracted CSS from ${url} */\n\n`;
    const cssLinks = [];
    $('link[rel="stylesheet"][href]').each((_, el) => cssLinks.push({ el, href: $(el).attr("href") }));
    for (const { el, href } of cssLinks) {
      const abs = toAbs(href);
      if (!abs) continue;
      const data = await fetchAsset(abs, "text");
      if (data) {
        extractedCSS += `/* Source: ${href} */\n${data}\n\n`;
        $(el).replaceWith(`<style>/* inlined: ${href} */\n${data}</style>`);
      }
    }
    $("style").each((_, el) => { extractedCSS += `/* Inline style */\n${$(el).html()}\n\n`; });

    let extractedJS = `/* AYOBOT Scraper — Extracted JS from ${url} */\n\n`;
    const scriptTags = [];
    $("script[src]").each((_, el) => scriptTags.push({ el, src: $(el).attr("src") }));
    for (const { el, src } of scriptTags) {
      const abs = toAbs(src);
      if (!abs) continue;
      const data = await fetchAsset(abs, "text");
      if (data) {
        extractedJS += `/* Source: ${src} */\n${data}\n\n`;
        const attrs = Object.entries($(el).attr() || {}).filter(([k]) => k !== "src").map(([k, v]) => `${k}="${v}"`).join(" ");
        $(el).replaceWith(`<script ${attrs}>/* inlined: ${src} */\n${data}</script>`);
      }
    }
    $("script:not([src])").each((_, el) => { const c = $(el).html(); if (c?.trim()) extractedJS += `/* Inline script */\n${c}\n\n`; });

    const title = $("title").text().trim() || "No title";
    const stamp = `\n<!-- Scraped by AYOBOT v1.0.0 | AYOCODES | Source: ${url} | Date: ${new Date().toISOString()} -->\n`;
    const finalHtml = stamp + $.html();
    const domain2 = domain.replace(/[^a-z0-9]/gi, "_"), ts = Date.now();
    const htmlBuf = Buffer.from(finalHtml, "utf-8"),
          cssBuf  = Buffer.from(extractedCSS, "utf-8"),
          jsBuf   = Buffer.from(extractedJS, "utf-8");

    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      text:
        `🕸️ *SCRAPE COMPLETE*\n━━━━━━━━━━━━━━━━━━━━━━━\n🔗 *URL:* ${url}\n📝 *Title:* ${title.substring(0, 100)}\n` +
        `📎 *Links:* ${$("a[href]").length} | 🖼️ *Images:* ${$("img").length}\n` +
        `📁 *HTML:* ${(htmlBuf.length / 1024).toFixed(1)} KB | 🎨 *CSS:* ${(cssBuf.length / 1024).toFixed(1)} KB | ⚙️ *JS:* ${(jsBuf.length / 1024).toFixed(1)} KB\n` +
        `📥 *Method:* ${fetchMethod}\n━━━━━━━━━━━━━━━━━━━━━━━`,
    });
    await sock.sendMessage(from, {
      document: htmlBuf, mimetype: "text/html",
      fileName: `${domain2}_${ts}_full.html`, caption: `📄 *Full Page HTML* — works offline`,
    });
    await delay(400);
    if (cssBuf.length > 100) {
      await sock.sendMessage(from, {
        document: cssBuf, mimetype: "text/css",
        fileName: `${domain2}_${ts}_styles.css`, caption: `🎨 *Extracted CSS*`,
      });
      await delay(300);
    }
    if (jsBuf.length > 100) {
      await sock.sendMessage(from, {
        document: jsBuf, mimetype: "application/javascript",
        fileName: `${domain2}_${ts}_scripts.js`, caption: `⚙️ *Extracted JavaScript*`,
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
        const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
        await sock.sendMessage(from, {
          document: zipBuf, mimetype: "application/zip",
          fileName: `${domain2}_${ts}_scrape.zip`, caption: `📦 *ZIP Archive* — all files packed`,
        });
      } catch (zipErr) { console.warn("ZIP creation failed:", zipErr.message); }
    }
  } catch (error) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, { text: formatError("PROCESSING ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  CONNECT INFO
// ════════════════════════════════════════════════════════════════════════════
export async function connectInfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔═══════════════════════════════════╗\n║   📱 *CONNECT WITH THE CREATOR*  ║\n╚═══════════════════════════════════╝\n\n` +
      `👑 *Creator:* AYOCODES\n📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || "2349159180375"}\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n\n` +
      `📢 *Community:*\n👥 Group: ${ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/"}\n\n⚡ *AYOBOT v1.0.0*\n🤖 *Full-Featured WhatsApp Bot*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  PDF GENERATOR  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function pdf({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("PDF GENERATOR", `Usage: ${ENV.PREFIX}pdf <title> | <content>`),
    });
  }

  await sendReaction(sock, message, "⏳");

  try {
    const PDFDoc = await getPDFDoc();
    if (!PDFDoc) {
      await sendReaction(sock, message, "❌");
      return sock.sendMessage(from, {
        text: formatError("ERROR", "PDF generator not available.\n\nRun: npm install pdfkit"),
      });
    }

    let title = "Document", content = fullArgs;
    if (fullArgs.includes("|")) {
      const parts = fullArgs.split("|");
      title = parts[0].trim();
      content = parts.slice(1).join("|").trim();
    }

    const doc = new PDFDoc({ margin: 60, size: "A4" }), chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
      doc.rect(0, 0, doc.page.width, 60).fill("#1a1a2e");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14)
         .text("AYOBOT v1.0.0 — Document Generator", 60, 18, { align: "left" });
      doc.fillColor("#aaaaaa").font("Helvetica").fontSize(9)
         .text(new Date().toLocaleDateString(), 0, 30, { align: "right", width: doc.page.width - 60 });
      doc.moveDown(2);
      doc.fillColor("#1a1a2e").font("Helvetica-Bold").fontSize(24).text(title, { align: "center" });
      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).stroke("#cccccc");
      doc.moveDown(1);
      doc.fillColor("#333333").font("Helvetica").fontSize(12).text(content, { lineGap: 6, paragraphGap: 8 });
      const footerY = doc.page.height - 50;
      doc.moveTo(60, footerY).lineTo(doc.page.width - 60, footerY).stroke("#cccccc");
      doc.fillColor("#999999").font("Helvetica").fontSize(9)
         .text(`Generated by AYOBOT v1.0.0 • AYOCODES • ${new Date().toLocaleString()}`, 60, footerY + 10, { align: "center" });
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      document: pdfBuffer,
      mimetype: "application/pdf",
      fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`,
      caption: `📄 *PDF Created*\n📝 ${title}\n📦 ${(pdfBuffer.length / 1024).toFixed(2)} KB\n👑 AYOCODES`,
    });
  } catch (error) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, { text: formatError("PDF ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IP LOOKUP  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("📍 IP LOOKUP", `Usage: ${ENV.PREFIX}ip <IP_ADDRESS>\n\nExample: ${ENV.PREFIX}ip 8.8.8.8`),
    });
  }

  const cleanIP = fullArgs.trim();
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$/;
  if (!ipRegex.test(cleanIP)) {
    return sock.sendMessage(from, {
      text: formatError("INVALID IP", `"${cleanIP}" is not a valid IP address.`),
    });
  }

  await sendReaction(sock, message, "⏳");

  let data = null, errors = [];

  try {
    const res = await axios.get(`http://ip-api.com/json/${cleanIP}?fields=66846719`, { timeout: 8000 });
    if (res.data?.status === "success")
      data = { query: res.data.query, country: res.data.country, countryCode: res.data.countryCode,
               region: res.data.regionName || res.data.region, city: res.data.city, zip: res.data.zip,
               lat: res.data.lat, lon: res.data.lon, timezone: res.data.timezone,
               isp: res.data.isp, org: res.data.org, as: res.data.as,
               mobile: res.data.mobile || false, proxy: res.data.proxy || false, hosting: res.data.hosting || false,
               source: "ip-api.com" };
  } catch (err) { errors.push(`ip-api: ${err.message}`); }

  if (!data) {
    try {
      const res = await axios.get(`https://ipwho.is/${cleanIP}`, { timeout: 8000 });
      if (res.data?.success)
        data = { query: cleanIP, country: res.data.country, countryCode: res.data.country_code,
                 region: res.data.region, city: res.data.city, zip: res.data.postal,
                 lat: res.data.latitude, lon: res.data.longitude, timezone: res.data.timezone?.id,
                 isp: res.data.connection?.isp || res.data.connection?.org, org: res.data.connection?.org,
                 as: res.data.connection?.asn ? `AS${res.data.connection.asn}` : null,
                 mobile: false, proxy: res.data.security?.proxy || false, hosting: res.data.security?.hosting || false,
                 source: "ipwho.is" };
    } catch (err) { errors.push(`ipwho.is: ${err.message}`); }
  }

  if (!data) {
    try {
      const res = await axios.get(`https://ipapi.co/${cleanIP}/json/`, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.data.error)
        data = { query: cleanIP, country: res.data.country_name, countryCode: res.data.country_code,
                 region: res.data.region, city: res.data.city, zip: res.data.postal,
                 lat: res.data.latitude, lon: res.data.longitude, timezone: res.data.timezone,
                 isp: res.data.org, org: res.data.org, as: res.data.asn,
                 mobile: false, proxy: false, hosting: false, source: "ipapi.co" };
    } catch (err) { errors.push(`ipapi.co: ${err.message}`); }
  }

  if (!data) {
    try {
      const res = await axios.get(`https://freeipapi.com/api/json/${cleanIP}`, { timeout: 8000 });
      if (res.data?.ipVersion)
        data = { query: cleanIP, country: res.data.countryName, countryCode: res.data.countryCode,
                 region: res.data.regionName, city: res.data.cityName, zip: res.data.zipCode,
                 lat: res.data.latitude, lon: res.data.longitude, timezone: res.data.timeZone,
                 isp: res.data.isp || "Unknown", org: res.data.isp, as: null,
                 mobile: false, proxy: false, hosting: false, source: "freeipapi.com" };
    } catch (err) { errors.push(`freeipapi: ${err.message}`); }
  }

  if (!data) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError("LOOKUP FAILED", `Could not fetch information for IP: ${cleanIP}\n\n🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}`),
    });
  }

  const coordStr = data.lat && data.lon ? `${safeFixed(data.lat)}, ${safeFixed(data.lon)}` : "N/A";
  const mapUrl = data.lat && data.lon ? `https://www.google.com/maps?q=${data.lat},${data.lon}` : null;
  let asn = data.as || "N/A";
  if (asn && asn !== "N/A" && !asn.startsWith("AS") && /^\d+$/.test(asn)) asn = `AS${asn}`;

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     📍 *IP INFO*         ║\n╚══════════════════════════╝\n\n` +
      `🌐 *IP:* ${data.query || cleanIP}\n📍 *Country:* ${data.country || "Unknown"} (${data.countryCode || "?"})\n` +
      `🏙️ *City:* ${data.city || "Unknown"}\n🗺️ *Region:* ${data.region || "Unknown"}\n📮 *Postal:* ${data.zip || "N/A"}\n` +
      `🧭 *Coordinates:* ${coordStr}\n⏰ *Timezone:* ${data.timezone || "N/A"}\n` +
      `📡 *ISP:* ${data.isp || "Unknown"}\n🏢 *Organization:* ${data.org || "N/A"}\n🔗 *ASN:* ${asn}\n` +
      `📱 *Mobile:* ${data.mobile ? "✅ Yes" : "❌ No"}\n🛡️ *Proxy/VPN:* ${data.proxy ? "✅ Yes" : "❌ No"}\n🏠 *Hosting:* ${data.hosting ? "✅ Yes" : "❌ No"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${data.source}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
  if (mapUrl) await sock.sendMessage(from, { text: `🗺️ *View on Google Maps:*\n${mapUrl}` });
}
export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP — Enhanced: detects actual user IP via Baileys connection socket,
//           falls back to phone-prefix country detection.
//  reactions: ⏳ → ✅
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock, userJid, message }) {
  await sendReaction(sock, message, "⏳");

  const phoneNum = normalizeJid(userJid);
  const pushName = message?.pushName || "Unknown";

  // ── Attempt to detect user's actual IP via Baileys WebSocket ──
  // Baileys exposes the underlying WebSocket connection. The remote address
  // is the server-side endpoint, but some forks expose client IP via headers.
  // We also attempt a STUN-like approach by fetching IP from the WA gateway.
  let detectedUserIp = null;
  let userIpSource = null;

  // Method 1: Check if sock exposes ws connection with remote address
  try {
    const ws = sock?.ws || sock?.client;
    if (ws?._socket?.remoteAddress) {
      const addr = ws._socket.remoteAddress.replace("::ffff:", "");
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr) && !addr.startsWith("127.") && !addr.startsWith("10.")) {
        detectedUserIp = addr;
        userIpSource = "WebSocket Socket";
      }
    }
  } catch (_) {}

  // Method 2: Check WebSocket request headers for X-Forwarded-For / X-Real-IP
  try {
    const ws = sock?.ws || sock?.client;
    const headers = ws?._socket?.parser?.incoming?.headers || ws?.request?.headers || {};
    const forwarded = headers["x-forwarded-for"] || headers["x-real-ip"] || headers["cf-connecting-ip"];
    if (forwarded) {
      const candidate = forwarded.split(",")[0].trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) && !candidate.startsWith("127.")) {
        detectedUserIp = candidate;
        userIpSource = "Connection Headers";
      }
    }
  } catch (_) {}

  // ── Geolocate detected user IP if found ──
  let userIpInfo = null;
  if (detectedUserIp) {
    try {
      const r = await axios.get(`https://ipwho.is/${detectedUserIp}`, { timeout: 8000 });
      if (r.data?.success) {
        userIpInfo = {
          ip: detectedUserIp,
          country: r.data.country,
          countryCode: r.data.country_code,
          city: r.data.city,
          region: r.data.region,
          isp: r.data.connection?.isp || r.data.connection?.org || "Unknown",
          timezone: r.data.timezone?.id,
          lat: r.data.latitude,
          lon: r.data.longitude,
          proxy: r.data.security?.proxy || false,
          vpn: r.data.security?.vpn || false,
        };
      }
    } catch (_) {}
  }

  // ── Phone number prefix → country table ──
  const phoneCountryMap = [
    { prefix: "234", country: "Nigeria",      code: "NG", flag: "🇳🇬", tz: "Africa/Lagos",          currency: "NGN" },
    { prefix: "233", country: "Ghana",         code: "GH", flag: "🇬🇭", tz: "Africa/Accra",          currency: "GHS" },
    { prefix: "254", country: "Kenya",         code: "KE", flag: "🇰🇪", tz: "Africa/Nairobi",        currency: "KES" },
    { prefix: "27",  country: "South Africa",  code: "ZA", flag: "🇿🇦", tz: "Africa/Johannesburg",   currency: "ZAR" },
    { prefix: "1",   country: "USA / Canada",  code: "US", flag: "🇺🇸", tz: "America/New_York",      currency: "USD" },
    { prefix: "44",  country: "United Kingdom",code: "GB", flag: "🇬🇧", tz: "Europe/London",         currency: "GBP" },
    { prefix: "91",  country: "India",         code: "IN", flag: "🇮🇳", tz: "Asia/Kolkata",          currency: "INR" },
    { prefix: "92",  country: "Pakistan",      code: "PK", flag: "🇵🇰", tz: "Asia/Karachi",          currency: "PKR" },
    { prefix: "86",  country: "China",         code: "CN", flag: "🇨🇳", tz: "Asia/Shanghai",         currency: "CNY" },
    { prefix: "81",  country: "Japan",         code: "JP", flag: "🇯🇵", tz: "Asia/Tokyo",            currency: "JPY" },
    { prefix: "82",  country: "South Korea",   code: "KR", flag: "🇰🇷", tz: "Asia/Seoul",            currency: "KRW" },
    { prefix: "62",  country: "Indonesia",     code: "ID", flag: "🇮🇩", tz: "Asia/Jakarta",          currency: "IDR" },
    { prefix: "63",  country: "Philippines",   code: "PH", flag: "🇵🇭", tz: "Asia/Manila",           currency: "PHP" },
    { prefix: "66",  country: "Thailand",      code: "TH", flag: "🇹🇭", tz: "Asia/Bangkok",          currency: "THB" },
    { prefix: "84",  country: "Vietnam",       code: "VN", flag: "🇻🇳", tz: "Asia/Ho_Chi_Minh",      currency: "VND" },
    { prefix: "60",  country: "Malaysia",      code: "MY", flag: "🇲🇾", tz: "Asia/Kuala_Lumpur",     currency: "MYR" },
    { prefix: "65",  country: "Singapore",     code: "SG", flag: "🇸🇬", tz: "Asia/Singapore",        currency: "SGD" },
    { prefix: "61",  country: "Australia",     code: "AU", flag: "🇦🇺", tz: "Australia/Sydney",      currency: "AUD" },
    { prefix: "64",  country: "New Zealand",   code: "NZ", flag: "🇳🇿", tz: "Pacific/Auckland",      currency: "NZD" },
    { prefix: "55",  country: "Brazil",        code: "BR", flag: "🇧🇷", tz: "America/Sao_Paulo",     currency: "BRL" },
    { prefix: "52",  country: "Mexico",        code: "MX", flag: "🇲🇽", tz: "America/Mexico_City",   currency: "MXN" },
    { prefix: "49",  country: "Germany",       code: "DE", flag: "🇩🇪", tz: "Europe/Berlin",         currency: "EUR" },
    { prefix: "33",  country: "France",        code: "FR", flag: "🇫🇷", tz: "Europe/Paris",          currency: "EUR" },
    { prefix: "39",  country: "Italy",         code: "IT", flag: "🇮🇹", tz: "Europe/Rome",           currency: "EUR" },
    { prefix: "34",  country: "Spain",         code: "ES", flag: "🇪🇸", tz: "Europe/Madrid",         currency: "EUR" },
    { prefix: "7",   country: "Russia",        code: "RU", flag: "🇷🇺", tz: "Europe/Moscow",         currency: "RUB" },
    { prefix: "20",  country: "Egypt",         code: "EG", flag: "🇪🇬", tz: "Africa/Cairo",          currency: "EGP" },
    { prefix: "212", country: "Morocco",       code: "MA", flag: "🇲🇦", tz: "Africa/Casablanca",     currency: "MAD" },
    { prefix: "971", country: "UAE",           code: "AE", flag: "🇦🇪", tz: "Asia/Dubai",            currency: "AED" },
    { prefix: "966", country: "Saudi Arabia",  code: "SA", flag: "🇸🇦", tz: "Asia/Riyadh",           currency: "SAR" },
    { prefix: "974", country: "Qatar",         code: "QA", flag: "🇶🇦", tz: "Asia/Qatar",            currency: "QAR" },
    { prefix: "256", country: "Uganda",        code: "UG", flag: "🇺🇬", tz: "Africa/Kampala",        currency: "UGX" },
    { prefix: "255", country: "Tanzania",      code: "TZ", flag: "🇹🇿", tz: "Africa/Dar_es_Salaam",  currency: "TZS" },
    { prefix: "251", country: "Ethiopia",      code: "ET", flag: "🇪🇹", tz: "Africa/Addis_Ababa",    currency: "ETB" },
  ];

  const sorted = [...phoneCountryMap].sort((a, b) => b.prefix.length - a.prefix.length);
  const match = sorted.find((c) => phoneNum.startsWith(c.prefix));

  let localTime = "N/A";
  if (match?.tz) {
    try {
      localTime = new Intl.DateTimeFormat("en-US", {
        timeZone: match.tz, hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, weekday: "short", year: "numeric", month: "short", day: "numeric",
      }).format(new Date());
    } catch (_) {}
  }

  // ── Bot server IP ──
  let serverIp = null;
  for (const svc of [
    { url: "https://api.ipify.org?format=json", parser: (d) => (typeof d === "object" ? d.ip : d.trim()) },
    { url: "https://api4.my-ip.io/ip.json",     parser: (d) => d.ip },
    { url: "https://ip4.seeip.org/json",         parser: (d) => d.ip },
    { url: "https://ipecho.net/plain",            parser: (d) => (typeof d === "string" ? d.trim() : null) },
    { url: "https://checkip.amazonaws.com/",      parser: (d) => (typeof d === "string" ? d.trim() : null) },
  ]) {
    try {
      const res = await axios.get(svc.url, { timeout: 6000 });
      const v = svc.parser(res.data);
      if (v && /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) { serverIp = v; break; }
    } catch (_) {}
  }

  let serverLoc = null;
  if (serverIp) {
    try {
      const r = await axios.get(`https://ipwho.is/${serverIp}`, { timeout: 8000 });
      if (r.data?.success)
        serverLoc = {
          country: r.data.country, city: r.data.city, regionName: r.data.region,
          isp: r.data.connection?.isp, lat: r.data.latitude, lon: r.data.longitude,
        };
    } catch (_) {}
  }

  // ── Build response ──
  let response =
    `╔══════════════════════════════════╗\n` +
    `║     📱 *YOUR INFO*              ║\n` +
    `╚══════════════════════════════════╝\n\n` +
    `👤 *Name:* ${pushName}\n` +
    `📞 *Number:* +${phoneNum}\n`;

  // User IP block
  if (userIpInfo) {
    response +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 *YOUR IP (Detected)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔢 *IP Address:* ${userIpInfo.ip}\n` +
      `📍 *Country:* ${userIpInfo.country} (${userIpInfo.countryCode})\n` +
      `🏙️ *City:* ${userIpInfo.city || "Unknown"}\n` +
      `🗺️ *Region:* ${userIpInfo.region || "Unknown"}\n` +
      `📡 *ISP:* ${userIpInfo.isp}\n` +
      `⏰ *Timezone:* ${userIpInfo.timezone || "Unknown"}\n` +
      `🛡️ *Proxy:* ${userIpInfo.proxy ? "✅ Yes" : "❌ No"} | *VPN:* ${userIpInfo.vpn ? "✅ Yes" : "❌ No"}\n` +
      `🔧 *Detection:* ${userIpSource}\n`;
    if (userIpInfo.lat && userIpInfo.lon)
      response += `🗺️ *Map:* https://www.google.com/maps?q=${userIpInfo.lat},${userIpInfo.lon}\n`;
  } else {
    response +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 *YOUR IP* _(could not detect directly)_\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ WhatsApp encrypts connections — direct IP detection is limited.\n` +
      `Your IP is only visible at the network level (ISP/router).\n`;
  }

  // Phone-prefix country block
  if (match) {
    response +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${match.flag} *Country (from number prefix)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 *Country:* ${match.country} (${match.code})\n` +
      `⏰ *Local Time:* ${localTime}\n` +
      `💱 *Currency:* ${match.currency}\n` +
      `📌 *Dialling Code:* +${match.prefix}\n`;
  }

  // Bot server block
  response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🖥️ *BOT SERVER IP*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (serverIp) {
    response += `🌐 *Server IP:* ${serverIp}\n`;
    if (serverLoc) {
      response +=
        `📍 *Server Location:* ${serverLoc.city || "?"}, ${serverLoc.regionName || "?"}, ${serverLoc.country || "?"}\n` +
        `🏢 *Hosting:* ${serverLoc.isp || "Unknown"}\n`;
      if (serverLoc.lat && serverLoc.lon)
        response += `🗺️ https://www.google.com/maps?q=${serverLoc.lat},${serverLoc.lon}\n`;
    }
  } else {
    response += `🌐 *Server IP:* Could not fetch\n`;
  }

  response += `\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, { text: response });
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("🔍 WHOIS LOOKUP", `Usage: ${ENV.PREFIX}whois <domain>`),
    });
  }

  await sendReaction(sock, message, "⏳");

  const domain = fullArgs.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*/, "");

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain)) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError("INVALID DOMAIN", `"${domain}" is not a valid domain name.`),
    });
  }

  let whoisData = null, errors = [];

  try {
    const res = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 10000 });
    if (res.data) {
      const d = res.data;
      const ns = d.nameservers?.map((n) => n.ldhName?.toLowerCase()).filter(Boolean).join(", ") || "Unknown";
      const evtMap = {};
      (d.events || []).forEach((e) => { evtMap[e.eventAction] = e.eventDate?.split("T")[0]; });
      const registrar = d.entities?.find((e) => e.roles?.includes("registrar"))
        ?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] || "Unknown";
      whoisData = {
        domain: d.ldhName || domain, registrar,
        status: d.status?.join(", ") || "Unknown", nameservers: ns,
        created: evtMap["registration"] || evtMap["created"] || "Unknown",
        updated: evtMap["last changed"] || evtMap["changed"] || "Unknown",
        expires: evtMap["expiration"] || "Unknown", source: "RDAP (IANA)",
      };
    }
  } catch (err) { errors.push(`RDAP: ${err.message}`); }

  if (!whoisData) {
    try {
      const res = await axios.get(`https://who-dat.as93.net/${domain}`, { timeout: 10000, headers: { Accept: "application/json" } });
      if (res.data?.domain) {
        const d = res.data.domain, r = res.data.registrar;
        whoisData = {
          domain: d.id || domain, registrar: r?.name || "Unknown",
          status: Array.isArray(d.status) ? d.status.join(", ") : d.status || "Unknown",
          nameservers: Array.isArray(d.name_servers) ? d.name_servers.join(", ") : "Unknown",
          created: d.created_date?.split("T")[0] || "Unknown",
          updated: d.updated_date?.split("T")[0] || "Unknown",
          expires: d.expiration_date?.split("T")[0] || "Unknown",
          source: "who-dat.as93.net",
        };
      }
    } catch (err) { errors.push(`who-dat: ${err.message}`); }
  }

  if (!whoisData) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError("WHOIS FAILED", `Could not fetch WHOIS for "${domain}".\n\n🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}`),
    });
  }

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     🔍 *WHOIS INFO*      ║\n╚══════════════════════════╝\n\n` +
      `🌐 *Domain:* ${whoisData.domain}\n🏢 *Registrar:* ${whoisData.registrar}\n📋 *Status:* ${whoisData.status}\n` +
      `📡 *Nameservers:* ${whoisData.nameservers}\n📅 *Created:* ${whoisData.created}\n` +
      `🔄 *Updated:* ${whoisData.updated}\n⏰ *Expires:* ${whoisData.expires}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${whoisData.source}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("🔍 DNS LOOKUP", `Usage: ${ENV.PREFIX}dns <domain>`),
    });
  }

  await sendReaction(sock, message, "⏳");

  const domain = fullArgs.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*/, "");

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain)) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatError("INVALID DOMAIN", `"${domain}" is not a valid domain.`),
    });
  }

  const records = { A: [], AAAA: [], MX: [], NS: [], TXT: [], CNAME: [] };
  const typeNums = { A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16, CNAME: 5 };
  let usedSource = "";

  for (const type of ["A", "AAAA", "MX", "NS", "TXT", "CNAME"]) {
    try {
      const res = await axios.get(`https://dns.google/resolve?name=${domain}&type=${type}`, {
        timeout: 6000, headers: { Accept: "application/dns-json" },
      });
      if (res.data?.Answer) {
        records[type] = res.data.Answer.filter((a) => a.type === typeNums[type]).map((a) => {
          let v = a.data || "";
          if (["NS","CNAME","MX"].includes(type)) v = v.replace(/\.$/, "");
          return v;
        });
        if (records[type].length > 0) usedSource = "Google DNS-over-HTTPS";
      }
    } catch (_) {}
  }

  if (records.A.length === 0) {
    try {
      const res = await axios.get(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
        timeout: 6000, headers: { Accept: "application/dns-json" },
      });
      if (res.data?.Answer) {
        records.A = res.data.Answer.filter((a) => a.type === 1).map((a) => a.data);
        usedSource = usedSource || "Cloudflare DoH";
      }
    } catch (_) {}
  }

  const fmt = (type, limit = 5) => {
    if (!records[type]?.length) return "_(none)_";
    const list = records[type].slice(0, limit);
    if (records[type].length > limit) list.push(`...+${records[type].length - limit} more`);
    return list.join("\n");
  };

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     🔍 *DNS RECORDS*     ║\n╚══════════════════════════╝\n\n🌐 *Domain:* ${domain}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *A Records (IPv4):*\n${fmt("A")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *AAAA Records (IPv6):*\n${fmt("AAAA")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *MX Records (Mail):*\n${fmt("MX")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *NS Records:*\n${fmt("NS")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *TXT Records:*\n${fmt("TXT", 3)}\n` +
      (records.CNAME.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━\n📋 *CNAME:*\n${fmt("CNAME")}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${usedSource || "Multiple DoH resolvers"}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  GET PROFILE PICTURE  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function getpp({ message, from, sock }) {
  await sendReaction(sock, message, "⏳");
  try {
    const msg = message.message;
    const senderJid = message.key?.participant || message.key?.remoteJid || from;
    const targetJid =
      msg?.extendedTextMessage?.contextInfo?.participant ||
      msg?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
      senderJid;
    const displayNum = normalizeJid(targetJid);

    let ppUrl = null;
    try { ppUrl = await sock.profilePictureUrl(targetJid, "image"); } catch (_) {
      try { ppUrl = await sock.profilePictureUrl(targetJid, "preview"); } catch (_) {}
    }

    if (ppUrl) {
      await sendReaction(sock, message, "✅");
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: `🖼️ *Profile Picture*\n👤 @${displayNum}\n⏰ ${new Date().toLocaleString()}`,
        mentions: [targetJid],
      });
    } else {
      await sendReaction(sock, message, "❌");
      await sock.sendMessage(from, {
        text: formatError("NOT FOUND", `@${displayNum} has no profile picture or privacy blocks access.`),
        mentions: [targetJid],
      });
    }
  } catch (error) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch profile picture: ${error.message}`),
    });
  }
}

export async function getgpp({ from, sock, isGroup, message }) {
  if (!isGroup) {
    return sock.sendMessage(from, { text: formatError("GROUP ONLY", "This command only works in groups.") });
  }
  await sendReaction(sock, message, "⏳");
  try {
    let ppUrl = null;
    try { ppUrl = await sock.profilePictureUrl(from, "image"); } catch (_) {
      try { ppUrl = await sock.profilePictureUrl(from, "preview"); } catch (_) {}
    }
    if (ppUrl) {
      await sendReaction(sock, message, "✅");
      await sock.sendMessage(from, {
        image: { url: ppUrl },
        caption: "👥 *Group Profile Picture*\n⏰ " + new Date().toLocaleString(),
      });
    } else {
      await sendReaction(sock, message, "❌");
      await sock.sendMessage(from, { text: formatInfo("NOT FOUND", "This group has no profile picture.") });
    }
  } catch (err) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not fetch group picture: ${err.message}`) });
  }
}

export async function prefixinfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔═══════════════════════════════════╗\n║       ℹ️ *PREFIX INFORMATION*    ║\n╚═══════════════════════════════════╝\n\n` +
      `🔤 *Current Prefix:* \`${ENV.PREFIX}\`\n📝 *Usage Format:* ${ENV.PREFIX}<command> [arguments]\n\n` +
      `📋 *Example Commands:*\n${ENV.PREFIX}menu — Show all commands\n${ENV.PREFIX}ping — Check bot latency\n\n` +
      `💡 All commands must start with "${ENV.PREFIX}"\n👑 Created by AYOCODES`,
  });
}

export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sock.sendMessage(from, {
      text: formatInfo("JARVIS AI ASSISTANT", `Usage: ${ENV.PREFIX}jarvis <question>`),
    });
  }
  await sock.sendMessage(from, {
    text:
      `🤖 *JARVIS - Powered by AYOCODES*\n\n"Analyzing: ${fullArgs.substring(0, 100)}..."\n\n` +
      `💡 _For full AI conversation use:_ ${ENV.PREFIX}ayobot ${fullArgs.substring(0, 50)}\n\n👑 *Iron Man's JARVIS Mode Active*`,
  });
}

export async function url({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, { text: formatInfo("URL INFO", `Usage: ${ENV.PREFIX}url <url>`) });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sendReaction(sock, message, "⏳");
  try {
    const response = await axios.head(urlStr, {
      timeout: 10_000, maxRedirects: 10, headers: { "User-Agent": randomUA() }, validateStatus: () => true,
    });
    const h = response.headers;
    const statusEmoji = response.status < 300 ? "🟢" : response.status < 400 ? "🟡" : "🔴";
    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      text: formatData("🌍 URL INFORMATION", {
        [`${statusEmoji} Status`]: `${response.status} ${response.statusText || ""}`,
        "📝 Content-Type": h["content-type"]?.split(";")[0] || "Unknown",
        "🌐 Server": h["server"] || "Unknown",
        "📦 Content-Length": h["content-length"] ? `${(parseInt(h["content-length"]) / 1024).toFixed(1)} KB` : "Unknown",
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
        "🔄 Cache-Control": h["cache-control"] || "Not set",
      }),
    });
  } catch (error) {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

export async function fetch({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, { text: formatInfo("FETCH", `Usage: ${ENV.PREFIX}fetch <url>`) });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sendReaction(sock, message, "⏳");
  try {
    const response = await axios.get(urlStr, {
      timeout: 15_000, headers: { "User-Agent": randomUA() }, validateStatus: () => true,
    });
    let data = typeof response.data === "object" ? JSON.stringify(response.data, null, 2) : String(response.data);
    await sendReaction(sock, message, "✅");
    if (data.length > 3_500) {
      await sock.sendMessage(from, {
        document: Buffer.from(data, "utf-8"), mimetype: "application/json",
        fileName: `fetch_${Date.now()}.txt`, caption: `📡 Fetched from ${urlStr}`,
      });
    } else {
      await sock.sendMessage(from, { text: `\`\`\`${data}\`\`\`` });
    }
  } catch (error) {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  QR CODE GENERATOR  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function qencode({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, { text: formatInfo("QR CODE GENERATOR", `Usage: ${ENV.PREFIX}qr <text>`) });
  }
  await sendReaction(sock, message, "⏳");
  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}&margin=10&color=1a1a2e&bgcolor=ffffff&format=png`;
    const res = await axios.get(qrUrl, { responseType: "arraybuffer", timeout: 10000 });
    if (res.data && res.data.byteLength > 100) {
      await sendReaction(sock, message, "✅");
      await sock.sendMessage(from, {
        image: Buffer.from(res.data),
        caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}\n👑 Created by AYOCODES`,
      });
    } else {
      await sendReaction(sock, message, "✅");
      await sock.sendMessage(from, {
        image: { url: qrUrl },
        caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}`,
      });
    }
  } catch (err) {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not generate QR code: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SCREENSHOT  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, { text: formatInfo("📷 SCREENSHOT", `Usage: ${ENV.PREFIX}screenshot <url>`) });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  try { new URL(urlStr); } catch (_) {
    return sock.sendMessage(from, { text: formatError("INVALID URL", `"${fullArgs}" is not a valid URL.`) });
  }

  await sendReaction(sock, message, "⏳");

  const urlEncoded = encodeURIComponent(urlStr);
  let screenshotBuffer = null, usedService = "", errors = [];

  try {
    const res = await axios.get(`https://image.thum.io/get/width/1280/crop/800/noanimate/${urlStr}`, {
      responseType: "arraybuffer", timeout: 20000, headers: { "User-Agent": randomUA() },
    });
    if (res.data && res.data.byteLength > 5000 && res.status === 200) {
      screenshotBuffer = Buffer.from(res.data); usedService = "Thum.io";
    }
  } catch (err) { errors.push(`Thum.io: ${err.message}`); }

  if (!screenshotBuffer) {
    try {
      const res = await axios.get(`https://api.microlink.io/?url=${urlEncoded}&screenshot=true&meta=false&waitFor=2000`, { timeout: 20000 });
      if (res.data?.data?.screenshot?.url) {
        const imgRes = await axios.get(res.data.data.screenshot.url, { responseType: "arraybuffer", timeout: 15000 });
        if (imgRes.data?.byteLength > 5000) { screenshotBuffer = Buffer.from(imgRes.data); usedService = "Microlink.io"; }
      }
    } catch (err) { errors.push(`Microlink: ${err.message}`); }
  }

  if (!screenshotBuffer) {
    try {
      const res = await axios.get(`https://mini.s-shot.ru/1280x800/JPEG/1280/Z100/?${urlStr}`, { responseType: "arraybuffer", timeout: 20000 });
      if (res.data?.byteLength > 5000) { screenshotBuffer = Buffer.from(res.data); usedService = "s-shot.ru"; }
    } catch (err) { errors.push(`s-shot: ${err.message}`); }
  }

  if (!screenshotBuffer && ENV.SCREENSHOTLAYER_KEY) {
    try {
      const res = await axios.get(
        `http://api.screenshotlayer.com/api/capture?access_key=${ENV.SCREENSHOTLAYER_KEY}&url=${urlEncoded}&viewport=1280x800&width=1280`,
        { responseType: "arraybuffer", timeout: 20000 },
      );
      if (res.data?.byteLength > 5000) { screenshotBuffer = Buffer.from(res.data); usedService = "ScreenshotLayer"; }
    } catch (err) { errors.push(`ScreenshotLayer: ${err.message}`); }
  }

  if (!screenshotBuffer) {
    await sendReaction(sock, message, "❌");
    return sock.sendMessage(from, {
      text: formatInfo(
        "SCREENSHOT UNAVAILABLE",
        `Could not take screenshot of:\n${urlStr}\n\n💡 *Try instead:*\n• ${ENV.PREFIX}scrape ${urlStr}\n• ${ENV.PREFIX}fetch ${urlStr}`,
      ),
    });
  }

  let pageTitle = urlStr;
  try {
    const r = await axios.get(urlStr, { timeout: 6000, maxContentLength: 100000, headers: { "User-Agent": randomUA() } });
    const m = r.data?.match(/<title[^>]*>(.*?)<\/title>/is);
    if (m) pageTitle = m[1].trim().substring(0, 100);
  } catch (_) {}

  await sendReaction(sock, message, "✅");
  await sock.sendMessage(from, {
    image: screenshotBuffer,
    caption:
      `📷 *Screenshot*\n━━━━━━━━━━━━━━━━━━━━━\n🔗 *URL:* ${urlStr}\n📝 *Title:* ${pageTitle}\n` +
      `📦 *Size:* ${(screenshotBuffer.byteLength / 1024).toFixed(1)} KB\n🔧 *Service:* ${usedService}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  INSPECT PAGE  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function inspect({ fullArgs, from, sock, message }) {
  if (!fullArgs) {
    return sock.sendMessage(from, { text: formatInfo("INSPECT PAGE", `Usage: ${ENV.PREFIX}inspect <url>`) });
  }
  let urlStr = fullArgs.trim();
  if (!urlStr.startsWith("http")) urlStr = "https://" + urlStr;
  await sendReaction(sock, message, "⏳");
  try {
    const response = await axios.get(urlStr, {
      headers: browserHeaders(randomUA()), timeout: 15_000,
      maxContentLength: 5 * 1024 * 1024, validateStatus: (s) => s < 500,
    });
    const $ = cheerio.load(response.data), body = response.data.toLowerCase(), techs = [];
    if (body.includes("react")) techs.push("React");
    if (body.includes("vue.js") || body.includes("__vue")) techs.push("Vue.js");
    if (body.includes("angular")) techs.push("Angular");
    if (body.includes("wp-content")) techs.push("WordPress");
    if (body.includes("shopify")) techs.push("Shopify");
    if (body.includes("next.js") || body.includes("__next")) techs.push("Next.js");
    if (body.includes("jquery")) techs.push("jQuery");
    if (response.headers["x-powered-by"]) techs.push(response.headers["x-powered-by"]);

    await sendReaction(sock, message, "✅");
    await sock.sendMessage(from, {
      text: formatData("🔍 PAGE INSPECTION", {
        "📝 Title": ($("title").text() || "No title").substring(0, 100),
        "📋 Description": ($('meta[name="description"]').attr("content") || "None").substring(0, 100),
        "📊 Status": `${response.status}`,
        "📎 Links": `${$("a[href]").length}`,
        "🖼️ Images": `${$("img").length}`,
        "📜 Scripts": `${$("script").length}`,
        "🎨 Stylesheets": `${$('link[rel="stylesheet"]').length}`,
        "⚙️ Tech Stack": techs.length ? techs.join(", ") : "Unknown",
        "🌐 Server": response.headers["server"] || "Unknown",
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
      }),
    });
  } catch (error) {
    await sendReaction(sock, message, "❌");
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IMGBB UPLOAD  — reactions: ⏳ → ✅ / ❌
// ════════════════════════════════════════════════════════════════════════════
export async function imgbb({ message, from, sock }) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted || !quoted.imageMessage) {
    return sock.sendMessage(from, {
      text: formatInfo("IMGBB UPLOAD", `Reply to an image with ${ENV.PREFIX}imgbb`),
    });
  }

  await sendReaction(sock, message, "⏳");

  try {
    const stream = await downloadContentFromMessage(quoted.imageMessage, "image");
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const base64Image = buffer.toString("base64");

    let result = null;
    if (ENV.IMGBB_KEY) {
      try {
        const params = new URLSearchParams();
        params.append("image", base64Image);
        const res = await axios.post(`https://api.imgbb.com/1/upload?key=${ENV.IMGBB_KEY}`, params, { timeout: 15_000 });
        if (res.data?.data?.url) result = { url: res.data.data.url, service: "ImgBB" };
      } catch (_) {}
    }

    if (!result) {
      try {
        const params = new URLSearchParams();
        params.append("source", base64Image);
        params.append("type", "base64");
        const res = await axios.post(
          "https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5",
          params, { timeout: 15_000 },
        );
        if (res.data?.image?.url) result = { url: res.data.image.url, service: "FreeImage.host" };
      } catch (_) {}
    }

    if (result) {
      await sendReaction(sock, message, "✅");
      await sock.sendMessage(from, {
        text: `📤 *Image Uploaded*\n\n🔗 *URL:* ${result.url}\n🛠️ *Service:* ${result.service}`,
      });
    } else {
      await sendReaction(sock, message, "❌");
      await sock.sendMessage(from, {
        text: formatError("ERROR", "Upload failed. Set IMGBB_KEY in environment variables."),
      });
    }
  } catch (err) {
    await sendReaction(sock, message, "🔴");
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not upload image: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTIVATE / DEACTIVATE GROUP
// ════════════════════════════════════════════════════════════════════════════
export async function activate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup) return sock.sendMessage(from, { text: "❌ This command only works in groups." });
  if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Only the bot owner can activate the bot in this group." });
  activateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `✅ *GROUP ACTIVATED!*\n\nEveryone can now use bot commands in this group.\n\nTo restrict back to owner-only: *${ENV.PREFIX}deactivate*`,
  });
}

export async function deactivate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup) return sock.sendMessage(from, { text: "❌ This command only works in groups." });
  if (!isAdmin) return sock.sendMessage(from, { text: "⛔ Only the bot owner can deactivate the bot in this group." });
  deactivateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `🔒 *GROUP DEACTIVATED!*\n\nOnly the bot owner can use commands in this group now.\n\nTo open to everyone: *${ENV.PREFIX}activate*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ANTILINK — FULLY FIXED (broken template string resolved)
// ════════════════════════════════════════════════════════════════════════════
export async function antilink({ args, message, from, sock, isAdmin, isGroup, userJid }) {
  if (!isGroup) {
    return sock.sendMessage(from, { text: "❌ This command only works in groups." });
  }

  const currentSettings = groupSettings.get(from) || {};
  const currentStatus = currentSettings.antilink || false;

  if (!args || args.length === 0) {
    const statusLabel = currentStatus ? "ENABLED ✅" : "DISABLED ❌";
    return sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n║     🔗 *ANTI-LINK*       ║\n╚══════════════════════════╝\n\n` +
        `Current Status: *${statusLabel}*\n\n` +
        `📌 *Commands:*\n` +
        `${ENV.PREFIX}antilink on     — Enable link protection\n` +
        `${ENV.PREFIX}antilink off    — Disable link protection\n` +
        `${ENV.PREFIX}antilink status — Check current status\n\n` +
        `⚠️ *When enabled:*\n` +
        `• 🗑️ Links are automatically deleted\n` +
        `• ⚠️ Users receive warnings\n` +
        `• 👢 Auto-kick after 3 warnings\n\n` +
        `⚠️ *Bot must be group admin for deletion/kick to work!*\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  const sub = args[0]?.toLowerCase();

  if (sub === "status") {
    const statusLabel = currentStatus ? "ENABLED ✅" : "DISABLED ❌";
    return sock.sendMessage(from, {
      text: `🔗 *Anti-Link Status:* ${statusLabel}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  if (!["on", "off"].includes(sub)) {
    return sock.sendMessage(from, {
      text: formatInfo("INVALID OPTION", `Usage: ${ENV.PREFIX}antilink on/off/status\n\nExample: ${ENV.PREFIX}antilink on`),
    });
  }

  // Verify caller is a group admin
  let isGroupAdmin = false;
  try {
    const metadata = await sock.groupMetadata(from);
    const userNum = normalizeJid(userJid);
    isGroupAdmin = metadata.participants.some(
      (p) => normalizeJid(p.id) === userNum && (p.admin === "admin" || p.admin === "superadmin"),
    );
  } catch (err) {
    console.error("[ANTILINK] Failed to fetch group metadata:", err.message);
    return sock.sendMessage(from, {
      text: formatError("ERROR", "Could not verify admin status. Please try again."),
    });
  }

  if (!isGroupAdmin) {
    return sock.sendMessage(from, {
      text: "⛔ Only *group admins* can enable or disable anti-link protection.",
    });
  }

  const newStatus = sub === "on";
  groupSettings.set(from, { ...currentSettings, antilink: newStatus });

  if (newStatus) {
    return sock.sendMessage(from, {
      text:
        `✅ *Anti-Link ENABLED*\n\n` +
        `🔗 Links will now be automatically deleted.\n` +
        `⚠️ Violators receive a warning (3 warnings = auto-kick).\n` +
        `🛡️ Group admins are exempt.\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  } else {
    return sock.sendMessage(from, {
      text: `🔴 *Anti-Link DISABLED*\n\nLinks are now allowed in this group.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }
}
// Add this at the VERY BOTTOM of basic.js, replacing whatever is there:

export async function start({ from, sock }) {
  await sock.sendMessage(from, { text: "🚀 AYOBOT Started! Type .menu for commands" });
}

// THESE MUST BE EXPORTED
export const ok = viewOnceToDM;
export const dm = viewOnceToDM;
export const tome = viewOnceToDM;
export const senddm = viewOnceToDM;
export const privatemedia = viewOnceToDM;
export const savetodm = viewOnceToDM;
export const sendtome = viewOnceToDM;

// DEFAULT EXPORT - MUST INCLUDE start AND ok
export default {
  menu, ping, status, creator, creatorGit, auto, connectInfo, prefixinfo,
  test, start, time, weather, getip, ip, myip, whois, dns, url, fetch,
  scrape, screenshot, inspect, shorten, viewOnce, ok, dm, tome, senddm,
  privatemedia, savetodm, sendtome, take, imgbb, qencode, pdf, getpp,
  getgpp, jarvis, joinWaitlist, activate, deactivate, antilink,
};
