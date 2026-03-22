// commands/group/basic.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Complete Basic Commands Module — FULLY FIXED & PRODUCTION READY
//  Author  : AYOCODES
//  Version : v1.0.0
//
//  ALL FIXES APPLIED:
//    • normalizeJid() — strips :N device suffix BEFORE removing non-digits.
//      "2349159180375:58@s.whatsapp.net" → "2349159180375" ✅ CORRECT
//    • antilink — isGroup check moved OUTSIDE the args block.
//      Old code: isGroup check was INSIDE `if (args && args.length > 0)`,
//      so calling `.antilink` with no args in a group hit the dead `return`
//      at the bottom and gave NO response at all. Now fixed. — AYOCODES
//    • antilink toggle — checks actual group admin status via normalizeJid(),
//      NOT just isAdmin (bot owner only check). — AYOCODES
//    • antilink no-args — now shows current on/off status + helpful note.
//    • antilink Part 2 (link detection) runs ONLY in automation.js.
//      Do NOT add link detection back here — causes duplicate warnings.
//    • groupWarnings key format: ${from}:${senderJid} — matches automation.js.
//    • getip — all 4 fallback APIs included.
//    • screenshot — all 4 screenshot services included.
//    • scrape — CSS style inlining $(el).replaceWith() restored.
//    • weather condEmoji — full 7-branch coverage restored.
//    • menu — clean nested-array structure, accurate total count.
//    • default export — every exported function included.
//
//  ⚠️  IMPORTANT — BOT MUST BE GROUP ADMIN:
//    For antilink deletion, kick, promote, demote, mute/unmute, lock/unlock
//    to work, the bot number (+2349159180375) MUST be made a group admin.
//    Go to: WhatsApp → Group Info → Participants → tap bot → Make Admin.
//    Without admin status the bot CANNOT delete messages or remove members.
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
//  normalizeJid — FIXED
//  Strips :N device suffix BEFORE stripping non-digits.
//  "2349159180375:58@s.whatsapp.net" → "2349159180375"  ✅
//  "223175560437838@s.whatsapp.net"  → "223175560437838" ✅
// ─────────────────────────────────────────────────────────────────────────────
function normalizeJid(jid = "") {
  return String(jid)
    .split("@")[0] // drop @s.whatsapp.net / @g.us
    .split(":")[0] // drop :58 device suffix  ← THE FIX
    .replace(/[^0-9]/g, ""); // digits only
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
const randomUA = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

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
    DNT: "1",
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  TEST
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
          ["`.take`", "✂️", "Take sticker"],
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
      `├ 💾 Memory: ${memPct}% (${memUsed}MB/${memTotal}MB)\n` +
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
  const uptimeStr =
    h > 0 ? `${h}h ${min}m ${s}s` : min > 0 ? `${min}m ${s}s` : `${s}s`;
  const responseMs = Date.now() - start;
  const speedIcon =
    responseMs < 300
      ? "🟢 EXCELLENT"
      : responseMs < 800
        ? "🟡 GOOD"
        : "🔴 SLOW";
  const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  await sock.sendMessage(from, {
    text:
      `━━━━━ 🏓 *PONG!* ━━━━━\n\n` +
      `${speedIcon} *Response:* ${responseMs}ms\n` +
      `⏱️ *Uptime:* ${uptimeStr}\n` +
      `📊 *Messages:* ${messageCount || 0}\n` +
      `💾 *Memory:* ${memMB}MB\n` +
      `🟢 *Status:* ONLINE\n` +
      `🤖 *Version:* 1.0.0\n` +
      `👑 *AYOBOT v1*\n`,
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
//  CREATOR
// ════════════════════════════════════════════════════════════════════════════
export async function creator({ from, sock }) {
  const finalContact =
    String(ENV.CREATOR_CONTACT || "").replace(/\D/g, "") || "2349159180375";
  try {
    const vcardContent =
      `BEGIN:VCARD\nVERSION:3.0\nFN:AYOCODES 👑\nN:AYOCODES;;;;\n` +
      `ORG:AYOBOT Development\nTITLE:Creator & Developer\n` +
      `TEL;type=CELL;type=VOICE;waid=${finalContact}:+${finalContact}\n` +
      `URL:${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n` +
      `NOTE:Creator of AYOBOT v1.0.0 WhatsApp Bot\nREV:${new Date().toISOString()}\nEND:VCARD`;
    await sock.sendMessage(from, {
      document: Buffer.from(vcardContent, "utf-8"),
      mimetype: "text/vcard",
      fileName: "AYOCODES.vcf",
      caption: "👑 *AYOCODES - Creator of AYOBOT*\n_Tap to save contact_",
    });
  } catch (_) {
    await sock.sendMessage(from, {
      text: `👑 *AYOCODES*\n📞 wa.me/${finalContact}`,
    });
  }
  await delay(800);
  await sock.sendMessage(from, {
    text: `━ 📢 *JOIN THE COMMUNITY* ━\n\n👥 *WhatsApp Group:*\n${ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN"}\n\n⚡ *AYOBOT v1.0.0* 👑\n`,
  });
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
//  WEATHER
// ════════════════════════════════════════════════════════════════════════════
export async function weather({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEATHER LOOKUP",
        `Usage: ${ENV.PREFIX}weather <city>\n\nExamples:\n${ENV.PREFIX}weather Lagos\n${ENV.PREFIX}weather New York`,
      ),
    });
  if (!ENV.OPENWEATHER_KEY)
    return sock.sendMessage(from, {
      text: formatError("CONFIG ERROR", "OPENWEATHER_KEY is not configured."),
    });
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
        `${condEmoji} *WEATHER: ${d.name}, ${d.sys.country}*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🌡️ *Temperature:* ${d.main.temp}°C\n🤔 *Feels Like:* ${d.main.feels_like}°C\n` +
        `📊 *Min/Max:* ${d.main.temp_min}°C / ${d.main.temp_max}°C\n💧 *Humidity:* ${d.main.humidity}% [${humBar}]\n` +
        `🌬️ *Wind:* ${d.wind.speed} m/s ${windDir}\n👁️ *Visibility:* ${d.visibility ? `${(d.visibility / 1000).toFixed(1)} km` : "N/A"}\n` +
        `⛅ *Clouds:* ${d.clouds?.all || 0}%\n🔷 *Pressure:* ${d.main.pressure ? `${d.main.pressure} hPa` : "N/A"}\n` +
        `📝 *Conditions:* ${d.weather[0].description}\n🌅 *Sunrise:* ${new Date(d.sys.sunrise * 1000).toLocaleTimeString()}\n` +
        `🌇 *Sunset:* ${new Date(d.sys.sunset * 1000).toLocaleTimeString()}\n\n👑 _AYOCODES_`,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        err.response?.status === 404
          ? `City "${fullArgs}" not found.`
          : err.message,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  WORLD TIME
// ════════════════════════════════════════════════════════════════════════════
export async function time({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "⏰ WORLD TIME",
        `Usage: ${ENV.PREFIX}time <city or timezone>\n\nExamples: ${ENV.PREFIX}time Lagos\n${ENV.PREFIX}time Africa/Lagos`,
      ),
    });
  await sock.sendMessage(from, {
    text: `⏰ *Fetching time for "${fullArgs}"...*`,
  });
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
      parts.forEach((p) => {
        if (p.type === "weekday") dateStr += p.value + ", ";
        else if (p.type === "month") dateStr += p.value + " ";
        else if (p.type === "day") dateStr += p.value + ", ";
        else if (p.type === "year") dateStr += p.value;
        else if (["hour", "minute", "second", "dayPeriod"].includes(p.type))
          timeStr += p.value + " ";
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
  if (!timeData)
    return sock.sendMessage(from, {
      text: formatError(
        "TIME LOOKUP FAILED",
        `Could not find time for "${query}".\n\nTry: Africa/Lagos, America/New_York, Europe/London, Asia/Tokyo`,
      ),
    });
  const d = new Date(timeData.datetime);
  const dayPct = Math.round(
    ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100,
  );
  const dayBar =
    "█".repeat(Math.round(dayPct / 10)) +
    "░".repeat(10 - Math.round(dayPct / 10));
  let utcOffset = timeData.utc_offset;
  if (typeof utcOffset === "number")
    utcOffset = utcOffset > 0 ? `+${utcOffset}` : `${utcOffset}`;
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     ⏰ *WORLD TIME*      ║\n╚══════════════════════════╝\n\n` +
      `🌍 *Timezone:* ${timeData.timezone || query}\n` +
      `📅 *Date:* ${timeData.customDate || d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n` +
      `⏰ *Time:* ${timeData.customTime || d.toLocaleTimeString("en-US", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" })}\n` +
      `📆 *Day:* ${days[d.getDay()]}\n🕒 *UTC Offset:* ${utcOffset}\n📊 *Day Progress:* ${dayPct}% ${dayBar}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${timeData.source}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  SHORTEN
// ════════════════════════════════════════════════════════════════════════════
export async function shorten({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("URL SHORTENER", `Usage: ${ENV.PREFIX}shorten <url>`),
    });
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
      if (short?.startsWith("http"))
        return sock.sendMessage(from, {
          text: formatSuccess(
            "URL SHORTENED",
            `📎 *Original:*\n${longUrl}\n\n🔗 *Shortened:*\n${short}\n\n📊 *Service:* ${svc.name}`,
          ),
        });
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
    if (!quotedMsg)
      return sock.sendMessage(from, {
        text: formatInfo(
          "VIEW ONCE",
          `Reply to a view-once message with: ${ENV.PREFIX}vv`,
        ),
      });
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
    if (!mediaMsg || !type)
      return sock.sendMessage(from, {
        text: formatError("NOT VIEW ONCE", "This is not a view-once message."),
      });
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
//  WAITLIST
// ════════════════════════════════════════════════════════════════════════════
export async function joinWaitlist({ fullArgs, from, userJid, sock, message }) {
  const email = fullArgs?.trim() || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID EMAIL",
        `Example: ${ENV.PREFIX}waitlist user@example.com`,
      ),
    });
  const phone = userJid.split("@")[0],
    timestamp = new Date().toLocaleString();
  let pushname = "Unknown";
  try {
    if (message?.pushName) pushname = message.pushName;
    else if (message?.verifiedBizName) pushname = message.verifiedBizName;
  } catch (_) {}
  waitlistEntries.set(phone, {
    email,
    phone,
    timestamp,
    userJid,
    name: pushname,
    platform: "WhatsApp",
  });
  await sock.sendMessage(from, {
    text: formatSuccess(
      "✅ WAITLIST JOINED",
      `📧 *Email:* ${email}\n📱 *Phone:* +${phone}\n⏰ *Time:* ${timestamp}\n\nYou've been added to our waitlist!`,
    ),
  });
  try {
    await sock.sendMessage(`2349159180375@s.whatsapp.net`, {
      text: `╔══════════════════════════╗\n║   📋 *NEW WAITLIST ENTRY* ║\n╚══════════════════════════╝\n\n👤 *Name:* ${pushname}\n📧 *Email:* ${email}\n📱 *Phone:* +${phone}\n⏰ *Time:* ${timestamp}\n📊 *Total:* ${waitlistEntries.size}\n\n⚡ *AYOBOT v1* | 👑 AYOCODES`,
      mentions: [userJid],
    });
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  SCRAPE
// ════════════════════════════════════════════════════════════════════════════
export async function scrape({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "WEB SCRAPER",
        `Usage: ${ENV.PREFIX}scrape <url>\n\n📦 Returns: self-contained HTML, CSS, JS, ZIP`,
      ),
    });
  let url = fullArgs.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  await sock.sendMessage(from, {
    text: "🕸️ *Scraping website...*\n_This may take 15-30 seconds_",
  });
  let html = null,
    finalUrl = url,
    fetchMethod = "unknown";
  const headerProfiles = [
    { label: "Chrome/Windows", headers: browserHeaders(USER_AGENTS[0]) },
    {
      label: "Firefox/Windows",
      headers: browserHeaders(USER_AGENTS[3], "https://www.bing.com/"),
    },
    { label: "Safari/Mac", headers: browserHeaders(USER_AGENTS[4]) },
    { label: "Chrome/Android", headers: browserHeaders(USER_AGENTS[6]) },
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
              `Try: ${ENV.PREFIX}screenshot ${url}`,
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
  if (!html)
    return sock.sendMessage(from, {
      text: formatError(
        "SCRAPE FAILED",
        `Could not retrieve this page.\n\nTry: ${ENV.PREFIX}screenshot ${url}`,
      ),
    });
  await sock.sendMessage(from, {
    text: `✅ *Page fetched via ${fetchMethod}*\n⚙️ _Processing..._`,
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

    let extractedCSS = `/* AYOBOT Scraper — Extracted CSS from ${url} */\n\n`;
    const cssLinks = [];
    $('link[rel="stylesheet"][href]').each((_, el) =>
      cssLinks.push({ el, href: $(el).attr("href") }),
    );
    for (const { el, href } of cssLinks) {
      const abs = toAbs(href);
      if (!abs) continue;
      const data = await fetchAsset(abs, "text");
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
      const abs = toAbs(src);
      if (!abs) continue;
      const data = await fetchAsset(abs, "text");
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
      const c = $(el).html();
      if (c?.trim()) extractedJS += `/* Inline script */\n${c}\n\n`;
    });

    const title = $("title").text().trim() || "No title";
    const stamp = `\n<!-- Scraped by AYOBOT v1.0.0 | AYOCODES | Source: ${url} | Date: ${new Date().toISOString()} -->\n`;
    const finalHtml = stamp + $.html();
    const domain2 = domain.replace(/[^a-z0-9]/gi, "_"),
      ts = Date.now();
    const htmlBuf = Buffer.from(finalHtml, "utf-8"),
      cssBuf = Buffer.from(extractedCSS, "utf-8"),
      jsBuf = Buffer.from(extractedJS, "utf-8");

    await sock.sendMessage(from, {
      text: `🕸️ *SCRAPE COMPLETE*\n━━━━━━━━━━━━━━━━━━━━━━━\n🔗 *URL:* ${url}\n📝 *Title:* ${title.substring(0, 100)}\n📎 *Links:* ${$("a[href]").length} | 🖼️ *Images:* ${$("img").length}\n📁 *HTML:* ${(htmlBuf.length / 1024).toFixed(1)} KB | 🎨 *CSS:* ${(cssBuf.length / 1024).toFixed(1)} KB | ⚙️ *JS:* ${(jsBuf.length / 1024).toFixed(1)} KB\n📥 *Method:* ${fetchMethod}\n━━━━━━━━━━━━━━━━━━━━━━━`,
    });
    await sock.sendMessage(from, {
      document: htmlBuf,
      mimetype: "text/html",
      fileName: `${domain2}_${ts}_full.html`,
      caption: `📄 *Full Page HTML* — works offline`,
    });
    await delay(400);
    if (cssBuf.length > 100) {
      await sock.sendMessage(from, {
        document: cssBuf,
        mimetype: "text/css",
        fileName: `${domain2}_${ts}_styles.css`,
        caption: `🎨 *Extracted CSS*`,
      });
      await delay(300);
    }
    if (jsBuf.length > 100) {
      await sock.sendMessage(from, {
        document: jsBuf,
        mimetype: "application/javascript",
        fileName: `${domain2}_${ts}_scripts.js`,
        caption: `⚙️ *Extracted JavaScript*`,
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
      `╔═══════════════════════════════════╗\n║   📱 *CONNECT WITH THE CREATOR*  ║\n╚═══════════════════════════════════╝\n\n` +
      `👑 *Creator:* AYOCODES\n📞 *WhatsApp:* wa.me/${ENV.CREATOR_CONTACT || "2349159180375"}\n` +
      `💻 *GitHub:* ${ENV.CREATOR_GITHUB || "https://github.com/Officialay12"}\n\n` +
      `📢 *Community:*\n👥 Group: ${ENV.WHATSAPP_GROUP || "https://chat.whatsapp.com/"}\n\n⚡ *AYOBOT v1.0.0*\n🤖 *Full-Featured WhatsApp Bot*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  PDF GENERATOR
// ════════════════════════════════════════════════════════════════════════════
export async function pdf({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "PDF GENERATOR",
        `Usage: ${ENV.PREFIX}pdf <title> | <content>`,
      ),
    });
  await sock.sendMessage(from, { text: "📄 *Generating PDF document...*" });
  try {
    const PDFDoc = await getPDFDoc();
    if (!PDFDoc)
      return sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "PDF generator not available.\n\nRun: npm install pdfkit",
        ),
      });
    let title = "Document",
      content = fullArgs;
    if (fullArgs.includes("|")) {
      const parts = fullArgs.split("|");
      title = parts[0].trim();
      content = parts.slice(1).join("|").trim();
    }
    const doc = new PDFDoc({ margin: 60, size: "A4" }),
      chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    await new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
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
//  IP LOOKUP — all 4 fallback APIs
// ════════════════════════════════════════════════════════════════════════════
export async function getip({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "📍 IP LOOKUP",
        `Usage: ${ENV.PREFIX}ip <IP_ADDRESS>\n\nExample: ${ENV.PREFIX}ip 8.8.8.8`,
      ),
    });
  const cleanIP = fullArgs.trim();
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$/;
  if (!ipRegex.test(cleanIP))
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID IP",
        `"${cleanIP}" is not a valid IP address.`,
      ),
    });
  await sock.sendMessage(from, { text: `🌐 *Looking up IP: ${cleanIP}...*` });
  let data = null,
    errors = [];
  try {
    const res = await axios.get(
      `http://ip-api.com/json/${cleanIP}?fields=66846719`,
      { timeout: 8000 },
    );
    if (res.data?.status === "success")
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
        source: "ip-api.com",
      };
  } catch (err) {
    errors.push(`ip-api: ${err.message}`);
  }
  if (!data) {
    try {
      const res = await axios.get(`https://ipwho.is/${cleanIP}`, {
        timeout: 8000,
      });
      if (res.data?.success)
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
    } catch (err) {
      errors.push(`ipwho.is: ${err.message}`);
    }
  }
  if (!data) {
    try {
      const res = await axios.get(`https://ipapi.co/${cleanIP}/json/`, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.data.error)
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
    } catch (err) {
      errors.push(`ipapi.co: ${err.message}`);
    }
  }
  if (!data) {
    try {
      const res = await axios.get(`https://freeipapi.com/api/json/${cleanIP}`, {
        timeout: 8000,
      });
      if (res.data?.ipVersion)
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
    } catch (err) {
      errors.push(`freeipapi: ${err.message}`);
    }
  }
  if (!data)
    return sock.sendMessage(from, {
      text: formatError(
        "LOOKUP FAILED",
        `Could not fetch information for IP: ${cleanIP}\n\n🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}`,
      ),
    });
  const coordStr =
    data.lat && data.lon
      ? `${safeFixed(data.lat)}, ${safeFixed(data.lon)}`
      : "N/A";
  const mapUrl =
    data.lat && data.lon
      ? `https://www.google.com/maps?q=${data.lat},${data.lon}`
      : null;
  let asn = data.as || "N/A";
  if (asn && asn !== "N/A" && !asn.startsWith("AS") && /^\d+$/.test(asn))
    asn = `AS${asn}`;
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     📍 *IP INFO*         ║\n╚══════════════════════════╝\n\n` +
      `🌐 *IP:* ${data.query || cleanIP}\n📍 *Country:* ${data.country || "Unknown"} (${data.countryCode || "?"})\n🏙️ *City:* ${data.city || "Unknown"}\n` +
      `🗺️ *Region:* ${data.region || "Unknown"}\n📮 *Postal:* ${data.zip || "N/A"}\n🧭 *Coordinates:* ${coordStr}\n⏰ *Timezone:* ${data.timezone || "N/A"}\n` +
      `📡 *ISP:* ${data.isp || "Unknown"}\n🏢 *Organization:* ${data.org || "N/A"}\n🔗 *ASN:* ${asn}\n` +
      `📱 *Mobile:* ${data.mobile ? "✅ Yes" : "❌ No"}\n🛡️ *Proxy/VPN:* ${data.proxy ? "✅ Yes" : "❌ No"}\n🏠 *Hosting:* ${data.hosting ? "✅ Yes" : "❌ No"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${data.source}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
  if (mapUrl)
    await sock.sendMessage(from, {
      text: `🗺️ *View on Google Maps:*\n${mapUrl}`,
    });
}
export const ip = getip;

// ════════════════════════════════════════════════════════════════════════════
//  MY IP
// ════════════════════════════════════════════════════════════════════════════
export async function myip({ from, sock, userJid, message }) {
  await sock.sendMessage(from, {
    text: "🌐 *Fetching IP & location info...*\n_Getting your number info + server IP..._",
  });

  // ── PART 1: Phone number → country/region from number prefix ─────────────
  // WhatsApp does not expose the user's real IP — that is a platform limitation.
  // However we can accurately determine the user's country and carrier from
  // their phone number prefix using the numverify / opencnam / phone-validation
  // APIs, or our own prefix table as a reliable offline fallback. — AYOCODES

  const rawJid = userJid || from;
  const phoneNum = normalizeJid(rawJid); // e.g. "2349159180375"
  const pushName = message?.pushName || "Unknown";

  // Phone number prefix → country mapping (covers all major calling codes)
  const phoneCountryMap = [
    // Africa
    {
      prefix: "234",
      country: "Nigeria",
      code: "NG",
      flag: "🇳🇬",
      tz: "Africa/Lagos",
      currency: "NGN",
    },
    {
      prefix: "233",
      country: "Ghana",
      code: "GH",
      flag: "🇬🇭",
      tz: "Africa/Accra",
      currency: "GHS",
    },
    {
      prefix: "254",
      country: "Kenya",
      code: "KE",
      flag: "🇰🇪",
      tz: "Africa/Nairobi",
      currency: "KES",
    },
    {
      prefix: "27",
      country: "South Africa",
      code: "ZA",
      flag: "🇿🇦",
      tz: "Africa/Johannesburg",
      currency: "ZAR",
    },
    {
      prefix: "256",
      country: "Uganda",
      code: "UG",
      flag: "🇺🇬",
      tz: "Africa/Kampala",
      currency: "UGX",
    },
    {
      prefix: "255",
      country: "Tanzania",
      code: "TZ",
      flag: "🇹🇿",
      tz: "Africa/Dar_es_Salaam",
      currency: "TZS",
    },
    {
      prefix: "260",
      country: "Zambia",
      code: "ZM",
      flag: "🇿🇲",
      tz: "Africa/Lusaka",
      currency: "ZMW",
    },
    {
      prefix: "263",
      country: "Zimbabwe",
      code: "ZW",
      flag: "🇿🇼",
      tz: "Africa/Harare",
      currency: "ZWL",
    },
    {
      prefix: "237",
      country: "Cameroon",
      code: "CM",
      flag: "🇨🇲",
      tz: "Africa/Douala",
      currency: "XAF",
    },
    {
      prefix: "225",
      country: "Ivory Coast",
      code: "CI",
      flag: "🇨🇮",
      tz: "Africa/Abidjan",
      currency: "XOF",
    },
    {
      prefix: "221",
      country: "Senegal",
      code: "SN",
      flag: "🇸🇳",
      tz: "Africa/Dakar",
      currency: "XOF",
    },
    {
      prefix: "212",
      country: "Morocco",
      code: "MA",
      flag: "🇲🇦",
      tz: "Africa/Casablanca",
      currency: "MAD",
    },
    {
      prefix: "20",
      country: "Egypt",
      code: "EG",
      flag: "🇪🇬",
      tz: "Africa/Cairo",
      currency: "EGP",
    },
    {
      prefix: "251",
      country: "Ethiopia",
      code: "ET",
      flag: "🇪🇹",
      tz: "Africa/Addis_Ababa",
      currency: "ETB",
    },
    {
      prefix: "223",
      country: "Mali",
      code: "ML",
      flag: "🇲🇱",
      tz: "Africa/Bamako",
      currency: "XOF",
    },
    {
      prefix: "229",
      country: "Benin",
      code: "BJ",
      flag: "🇧🇯",
      tz: "Africa/Porto-Novo",
      currency: "XOF",
    },
    {
      prefix: "228",
      country: "Togo",
      code: "TG",
      flag: "🇹🇬",
      tz: "Africa/Lome",
      currency: "XOF",
    },
    {
      prefix: "226",
      country: "Burkina Faso",
      code: "BF",
      flag: "🇧🇫",
      tz: "Africa/Ouagadougou",
      currency: "XOF",
    },
    {
      prefix: "227",
      country: "Niger",
      code: "NE",
      flag: "🇳🇪",
      tz: "Africa/Niamey",
      currency: "XOF",
    },
    {
      prefix: "242",
      country: "Congo",
      code: "CG",
      flag: "🇨🇬",
      tz: "Africa/Brazzaville",
      currency: "XAF",
    },
    {
      prefix: "243",
      country: "DR Congo",
      code: "CD",
      flag: "🇨🇩",
      tz: "Africa/Kinshasa",
      currency: "CDF",
    },
    {
      prefix: "250",
      country: "Rwanda",
      code: "RW",
      flag: "🇷🇼",
      tz: "Africa/Kigali",
      currency: "RWF",
    },
    {
      prefix: "257",
      country: "Burundi",
      code: "BI",
      flag: "🇧🇮",
      tz: "Africa/Bujumbura",
      currency: "BIF",
    },
    {
      prefix: "258",
      country: "Mozambique",
      code: "MZ",
      flag: "🇲🇿",
      tz: "Africa/Maputo",
      currency: "MZN",
    },
    {
      prefix: "261",
      country: "Madagascar",
      code: "MG",
      flag: "🇲🇬",
      tz: "Indian/Antananarivo",
      currency: "MGA",
    },
    {
      prefix: "264",
      country: "Namibia",
      code: "NA",
      flag: "🇳🇦",
      tz: "Africa/Windhoek",
      currency: "NAD",
    },
    {
      prefix: "265",
      country: "Malawi",
      code: "MW",
      flag: "🇲🇼",
      tz: "Africa/Blantyre",
      currency: "MWK",
    },
    {
      prefix: "266",
      country: "Lesotho",
      code: "LS",
      flag: "🇱🇸",
      tz: "Africa/Maseru",
      currency: "LSL",
    },
    {
      prefix: "267",
      country: "Botswana",
      code: "BW",
      flag: "🇧🇼",
      tz: "Africa/Gaborone",
      currency: "BWP",
    },
    {
      prefix: "268",
      country: "Eswatini",
      code: "SZ",
      flag: "🇸🇿",
      tz: "Africa/Mbabane",
      currency: "SZL",
    },
    {
      prefix: "249",
      country: "Sudan",
      code: "SD",
      flag: "🇸🇩",
      tz: "Africa/Khartoum",
      currency: "SDG",
    },
    {
      prefix: "218",
      country: "Libya",
      code: "LY",
      flag: "🇱🇾",
      tz: "Africa/Tripoli",
      currency: "LYD",
    },
    {
      prefix: "216",
      country: "Tunisia",
      code: "TN",
      flag: "🇹🇳",
      tz: "Africa/Tunis",
      currency: "TND",
    },
    {
      prefix: "213",
      country: "Algeria",
      code: "DZ",
      flag: "🇩🇿",
      tz: "Africa/Algiers",
      currency: "DZD",
    },
    // Americas
    {
      prefix: "1",
      country: "USA / Canada",
      code: "US",
      flag: "🇺🇸",
      tz: "America/New_York",
      currency: "USD",
    },
    {
      prefix: "55",
      country: "Brazil",
      code: "BR",
      flag: "🇧🇷",
      tz: "America/Sao_Paulo",
      currency: "BRL",
    },
    {
      prefix: "52",
      country: "Mexico",
      code: "MX",
      flag: "🇲🇽",
      tz: "America/Mexico_City",
      currency: "MXN",
    },
    {
      prefix: "54",
      country: "Argentina",
      code: "AR",
      flag: "🇦🇷",
      tz: "America/Argentina/Buenos_Aires",
      currency: "ARS",
    },
    {
      prefix: "57",
      country: "Colombia",
      code: "CO",
      flag: "🇨🇴",
      tz: "America/Bogota",
      currency: "COP",
    },
    {
      prefix: "51",
      country: "Peru",
      code: "PE",
      flag: "🇵🇪",
      tz: "America/Lima",
      currency: "PEN",
    },
    {
      prefix: "56",
      country: "Chile",
      code: "CL",
      flag: "🇨🇱",
      tz: "America/Santiago",
      currency: "CLP",
    },
    {
      prefix: "58",
      country: "Venezuela",
      code: "VE",
      flag: "🇻🇪",
      tz: "America/Caracas",
      currency: "VES",
    },
    {
      prefix: "593",
      country: "Ecuador",
      code: "EC",
      flag: "🇪🇨",
      tz: "America/Guayaquil",
      currency: "USD",
    },
    {
      prefix: "591",
      country: "Bolivia",
      code: "BO",
      flag: "🇧🇴",
      tz: "America/La_Paz",
      currency: "BOB",
    },
    {
      prefix: "595",
      country: "Paraguay",
      code: "PY",
      flag: "🇵🇾",
      tz: "America/Asuncion",
      currency: "PYG",
    },
    {
      prefix: "598",
      country: "Uruguay",
      code: "UY",
      flag: "🇺🇾",
      tz: "America/Montevideo",
      currency: "UYU",
    },
    // Europe
    {
      prefix: "44",
      country: "United Kingdom",
      code: "GB",
      flag: "🇬🇧",
      tz: "Europe/London",
      currency: "GBP",
    },
    {
      prefix: "49",
      country: "Germany",
      code: "DE",
      flag: "🇩🇪",
      tz: "Europe/Berlin",
      currency: "EUR",
    },
    {
      prefix: "33",
      country: "France",
      code: "FR",
      flag: "🇫🇷",
      tz: "Europe/Paris",
      currency: "EUR",
    },
    {
      prefix: "39",
      country: "Italy",
      code: "IT",
      flag: "🇮🇹",
      tz: "Europe/Rome",
      currency: "EUR",
    },
    {
      prefix: "34",
      country: "Spain",
      code: "ES",
      flag: "🇪🇸",
      tz: "Europe/Madrid",
      currency: "EUR",
    },
    {
      prefix: "31",
      country: "Netherlands",
      code: "NL",
      flag: "🇳🇱",
      tz: "Europe/Amsterdam",
      currency: "EUR",
    },
    {
      prefix: "32",
      country: "Belgium",
      code: "BE",
      flag: "🇧🇪",
      tz: "Europe/Brussels",
      currency: "EUR",
    },
    {
      prefix: "41",
      country: "Switzerland",
      code: "CH",
      flag: "🇨🇭",
      tz: "Europe/Zurich",
      currency: "CHF",
    },
    {
      prefix: "43",
      country: "Austria",
      code: "AT",
      flag: "🇦🇹",
      tz: "Europe/Vienna",
      currency: "EUR",
    },
    {
      prefix: "351",
      country: "Portugal",
      code: "PT",
      flag: "🇵🇹",
      tz: "Europe/Lisbon",
      currency: "EUR",
    },
    {
      prefix: "48",
      country: "Poland",
      code: "PL",
      flag: "🇵🇱",
      tz: "Europe/Warsaw",
      currency: "PLN",
    },
    {
      prefix: "46",
      country: "Sweden",
      code: "SE",
      flag: "🇸🇪",
      tz: "Europe/Stockholm",
      currency: "SEK",
    },
    {
      prefix: "47",
      country: "Norway",
      code: "NO",
      flag: "🇳🇴",
      tz: "Europe/Oslo",
      currency: "NOK",
    },
    {
      prefix: "45",
      country: "Denmark",
      code: "DK",
      flag: "🇩🇰",
      tz: "Europe/Copenhagen",
      currency: "DKK",
    },
    {
      prefix: "358",
      country: "Finland",
      code: "FI",
      flag: "🇫🇮",
      tz: "Europe/Helsinki",
      currency: "EUR",
    },
    {
      prefix: "7",
      country: "Russia",
      code: "RU",
      flag: "🇷🇺",
      tz: "Europe/Moscow",
      currency: "RUB",
    },
    {
      prefix: "380",
      country: "Ukraine",
      code: "UA",
      flag: "🇺🇦",
      tz: "Europe/Kyiv",
      currency: "UAH",
    },
    {
      prefix: "40",
      country: "Romania",
      code: "RO",
      flag: "🇷🇴",
      tz: "Europe/Bucharest",
      currency: "RON",
    },
    {
      prefix: "36",
      country: "Hungary",
      code: "HU",
      flag: "🇭🇺",
      tz: "Europe/Budapest",
      currency: "HUF",
    },
    {
      prefix: "420",
      country: "Czech Republic",
      code: "CZ",
      flag: "🇨🇿",
      tz: "Europe/Prague",
      currency: "CZK",
    },
    {
      prefix: "30",
      country: "Greece",
      code: "GR",
      flag: "🇬🇷",
      tz: "Europe/Athens",
      currency: "EUR",
    },
    // Asia
    {
      prefix: "91",
      country: "India",
      code: "IN",
      flag: "🇮🇳",
      tz: "Asia/Kolkata",
      currency: "INR",
    },
    {
      prefix: "92",
      country: "Pakistan",
      code: "PK",
      flag: "🇵🇰",
      tz: "Asia/Karachi",
      currency: "PKR",
    },
    {
      prefix: "880",
      country: "Bangladesh",
      code: "BD",
      flag: "🇧🇩",
      tz: "Asia/Dhaka",
      currency: "BDT",
    },
    {
      prefix: "86",
      country: "China",
      code: "CN",
      flag: "🇨🇳",
      tz: "Asia/Shanghai",
      currency: "CNY",
    },
    {
      prefix: "81",
      country: "Japan",
      code: "JP",
      flag: "🇯🇵",
      tz: "Asia/Tokyo",
      currency: "JPY",
    },
    {
      prefix: "82",
      country: "South Korea",
      code: "KR",
      flag: "🇰🇷",
      tz: "Asia/Seoul",
      currency: "KRW",
    },
    {
      prefix: "62",
      country: "Indonesia",
      code: "ID",
      flag: "🇮🇩",
      tz: "Asia/Jakarta",
      currency: "IDR",
    },
    {
      prefix: "63",
      country: "Philippines",
      code: "PH",
      flag: "🇵🇭",
      tz: "Asia/Manila",
      currency: "PHP",
    },
    {
      prefix: "66",
      country: "Thailand",
      code: "TH",
      flag: "🇹🇭",
      tz: "Asia/Bangkok",
      currency: "THB",
    },
    {
      prefix: "84",
      country: "Vietnam",
      code: "VN",
      flag: "🇻🇳",
      tz: "Asia/Ho_Chi_Minh",
      currency: "VND",
    },
    {
      prefix: "60",
      country: "Malaysia",
      code: "MY",
      flag: "🇲🇾",
      tz: "Asia/Kuala_Lumpur",
      currency: "MYR",
    },
    {
      prefix: "65",
      country: "Singapore",
      code: "SG",
      flag: "🇸🇬",
      tz: "Asia/Singapore",
      currency: "SGD",
    },
    {
      prefix: "971",
      country: "UAE",
      code: "AE",
      flag: "🇦🇪",
      tz: "Asia/Dubai",
      currency: "AED",
    },
    {
      prefix: "966",
      country: "Saudi Arabia",
      code: "SA",
      flag: "🇸🇦",
      tz: "Asia/Riyadh",
      currency: "SAR",
    },
    {
      prefix: "964",
      country: "Iraq",
      code: "IQ",
      flag: "🇮🇶",
      tz: "Asia/Baghdad",
      currency: "IQD",
    },
    {
      prefix: "98",
      country: "Iran",
      code: "IR",
      flag: "🇮🇷",
      tz: "Asia/Tehran",
      currency: "IRR",
    },
    {
      prefix: "90",
      country: "Turkey",
      code: "TR",
      flag: "🇹🇷",
      tz: "Europe/Istanbul",
      currency: "TRY",
    },
    {
      prefix: "972",
      country: "Israel",
      code: "IL",
      flag: "🇮🇱",
      tz: "Asia/Jerusalem",
      currency: "ILS",
    },
    {
      prefix: "961",
      country: "Lebanon",
      code: "LB",
      flag: "🇱🇧",
      tz: "Asia/Beirut",
      currency: "LBP",
    },
    {
      prefix: "962",
      country: "Jordan",
      code: "JO",
      flag: "🇯🇴",
      tz: "Asia/Amman",
      currency: "JOD",
    },
    {
      prefix: "974",
      country: "Qatar",
      code: "QA",
      flag: "🇶🇦",
      tz: "Asia/Qatar",
      currency: "QAR",
    },
    {
      prefix: "965",
      country: "Kuwait",
      code: "KW",
      flag: "🇰🇼",
      tz: "Asia/Kuwait",
      currency: "KWD",
    },
    {
      prefix: "968",
      country: "Oman",
      code: "OM",
      flag: "🇴🇲",
      tz: "Asia/Muscat",
      currency: "OMR",
    },
    {
      prefix: "973",
      country: "Bahrain",
      code: "BH",
      flag: "🇧🇭",
      tz: "Asia/Bahrain",
      currency: "BHD",
    },
    {
      prefix: "967",
      country: "Yemen",
      code: "YE",
      flag: "🇾🇪",
      tz: "Asia/Aden",
      currency: "YER",
    },
    {
      prefix: "94",
      country: "Sri Lanka",
      code: "LK",
      flag: "🇱🇰",
      tz: "Asia/Colombo",
      currency: "LKR",
    },
    {
      prefix: "977",
      country: "Nepal",
      code: "NP",
      flag: "🇳🇵",
      tz: "Asia/Kathmandu",
      currency: "NPR",
    },
    {
      prefix: "95",
      country: "Myanmar",
      code: "MM",
      flag: "🇲🇲",
      tz: "Asia/Rangoon",
      currency: "MMK",
    },
    {
      prefix: "855",
      country: "Cambodia",
      code: "KH",
      flag: "🇰🇭",
      tz: "Asia/Phnom_Penh",
      currency: "KHR",
    },
    {
      prefix: "856",
      country: "Laos",
      code: "LA",
      flag: "🇱🇦",
      tz: "Asia/Vientiane",
      currency: "LAK",
    },
    // Oceania
    {
      prefix: "61",
      country: "Australia",
      code: "AU",
      flag: "🇦🇺",
      tz: "Australia/Sydney",
      currency: "AUD",
    },
    {
      prefix: "64",
      country: "New Zealand",
      code: "NZ",
      flag: "🇳🇿",
      tz: "Pacific/Auckland",
      currency: "NZD",
    },
  ];

  // Match longest prefix first for accuracy (e.g. "234" before "23")
  const sorted = [...phoneCountryMap].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  const match = sorted.find((c) => phoneNum.startsWith(c.prefix));

  // Get local time for detected country
  let localTime = "N/A";
  if (match?.tz) {
    try {
      localTime = new Intl.DateTimeFormat("en-US", {
        timeZone: match.tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date());
    } catch (_) {}
  }

  // Try to get extra phone number info from numverify-style API
  let carrierInfo = null;
  try {
    const res = await axios.get(
      `https://phonevalidation.abstractapi.com/v1/?api_key=&phone=${phoneNum}`,
      { timeout: 5000 },
    );
    if (res.data?.country?.name) {
      carrierInfo = {
        carrier: res.data.carrier || null,
        lineType: res.data.type || null,
      };
    }
  } catch (_) {}

  // ── PART 2: Server IP lookup ──────────────────────────────────────────────
  let serverIp = null;
  for (const svc of [
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
  ]) {
    try {
      const res = await axios.get(svc.url, { timeout: 6000 });
      const v = svc.parser(res.data);
      if (v && /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
        serverIp = v;
        break;
      }
    } catch (_) {}
  }

  let serverLoc = null;
  if (serverIp) {
    try {
      const r = await axios.get(`https://ipwho.is/${serverIp}`, {
        timeout: 8000,
      });
      if (r.data?.success)
        serverLoc = {
          country: r.data.country,
          countryCode: r.data.country_code,
          city: r.data.city,
          regionName: r.data.region,
          isp: r.data.connection?.isp || r.data.connection?.org,
          org: r.data.connection?.org,
          as: r.data.connection?.asn ? `AS${r.data.connection.asn}` : "N/A",
          lat: r.data.latitude,
          lon: r.data.longitude,
        };
    } catch (_) {
      try {
        const r = await axios.get(
          `http://ip-api.com/json/${serverIp}?fields=status,country,countryCode,regionName,city,isp,org,as,lat,lon`,
          { timeout: 8000 },
        );
        if (r.data?.status === "success") serverLoc = r.data;
      } catch (_) {}
    }
  }

  // ── BUILD RESPONSE ────────────────────────────────────────────────────────
  let response =
    `╔══════════════════════════════════╗\n` +
    `║     📱 *YOUR NUMBER INFO*        ║\n` +
    `╚══════════════════════════════════╝\n\n` +
    `👤 *Name:* ${pushName}\n` +
    `📞 *Number:* +${phoneNum}\n`;

  if (match) {
    response +=
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${match.flag} *Country:* ${match.country} (${match.code})\n` +
      `⏰ *Local Time:* ${localTime}\n` +
      `💱 *Currency:* ${match.currency}\n` +
      `🌍 *Timezone:* ${match.tz}\n`;
    if (carrierInfo?.carrier)
      response += `📡 *Carrier:* ${carrierInfo.carrier}\n`;
    if (carrierInfo?.lineType)
      response += `📶 *Line Type:* ${carrierInfo.lineType}\n`;
    response += `📌 *Dialling Code:* +${match.prefix}\n`;
  } else {
    response += `\n🌍 *Country:* Could not determine from number prefix\n`;
  }

  response += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  response += `🖥️ *BOT SERVER IP* _(not your IP)_\n`;
  response += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (serverIp) {
    response += `🌐 *Server IP:* ${serverIp}\n`;
    if (serverLoc) {
      response +=
        `📍 *Server Location:* ${serverLoc.city || "?"}, ${serverLoc.regionName || serverLoc.region || "?"}, ${serverLoc.country || "?"}\n` +
        `🏢 *Hosting:* ${serverLoc.isp || serverLoc.org || "Unknown"}\n` +
        `🔗 *ASN:* ${serverLoc.as || "N/A"}\n`;
      if (serverLoc.lat && serverLoc.lon)
        response += `🗺️ https://www.google.com/maps?q=${serverLoc.lat},${serverLoc.lon}\n`;
    }
  } else {
    response += `🌐 *Server IP:* Could not fetch\n`;
  }

  response +=
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ *Note:* WhatsApp does not expose users' real IP addresses.\n` +
    `The country above is detected from your *phone number prefix* (+${match?.prefix || phoneNum.substring(0, 3)}).\n` +
    `The server IP is where the bot is hosted, NOT your location.\n\n` +
    `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

  await sock.sendMessage(from, { text: response });
}

// ════════════════════════════════════════════════════════════════════════════
//  WHOIS
// ════════════════════════════════════════════════════════════════════════════
export async function whois({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("🔍 WHOIS LOOKUP", `Usage: ${ENV.PREFIX}whois <domain>`),
    });
  await sock.sendMessage(from, {
    text: `🔍 *WHOIS lookup for ${fullArgs}...*`,
  });
  const domain = fullArgs
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain))
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID DOMAIN",
        `"${domain}" is not a valid domain name.`,
      ),
    });
  let whoisData = null,
    errors = [];
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
        status: d.status?.join(", ") || "Unknown",
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
  if (!whoisData) {
    try {
      const res = await axios.get(`https://who-dat.as93.net/${domain}`, {
        timeout: 10000,
        headers: { Accept: "application/json" },
      });
      if (res.data?.domain) {
        const d = res.data.domain,
          r = res.data.registrar;
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
  if (!whoisData)
    return sock.sendMessage(from, {
      text: formatError(
        "WHOIS FAILED",
        `Could not fetch WHOIS for "${domain}".\n\n🔧 *Errors:*\n${errors.slice(0, 3).join("\n")}`,
      ),
    });
  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗\n║     🔍 *WHOIS INFO*      ║\n╚══════════════════════════╝\n\n🌐 *Domain:* ${whoisData.domain}\n🏢 *Registrar:* ${whoisData.registrar}\n📋 *Status:* ${whoisData.status}\n📡 *Nameservers:* ${whoisData.nameservers}\n📅 *Created:* ${whoisData.created}\n🔄 *Updated:* ${whoisData.updated}\n⏰ *Expires:* ${whoisData.expires}\n━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${whoisData.source}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DNS LOOKUP
// ════════════════════════════════════════════════════════════════════════════
export async function dns({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("🔍 DNS LOOKUP", `Usage: ${ENV.PREFIX}dns <domain>`),
    });
  await sock.sendMessage(from, { text: `🌐 *DNS lookup for ${fullArgs}...*` });
  const domain = fullArgs
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/.test(domain))
    return sock.sendMessage(from, {
      text: formatError("INVALID DOMAIN", `"${domain}" is not a valid domain.`),
    });
  const records = { A: [], AAAA: [], MX: [], NS: [], TXT: [], CNAME: [] };
  const typeNums = { A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16, CNAME: 5 };
  let usedSource = "";
  for (const type of ["A", "AAAA", "MX", "NS", "TXT", "CNAME"]) {
    try {
      const res = await axios.get(
        `https://dns.google/resolve?name=${domain}&type=${type}`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        records[type] = res.data.Answer.filter(
          (a) => a.type === typeNums[type],
        ).map((a) => {
          let v = a.data || "";
          if (["NS", "CNAME", "MX"].includes(type)) v = v.replace(/\.$/, "");
          return v;
        });
        if (records[type].length > 0) usedSource = "Google DNS-over-HTTPS";
      }
    } catch (_) {}
  }
  if (records.A.length === 0) {
    try {
      const res = await axios.get(
        `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`,
        { timeout: 6000, headers: { Accept: "application/dns-json" } },
      );
      if (res.data?.Answer) {
        records.A = res.data.Answer.filter((a) => a.type === 1).map(
          (a) => a.data,
        );
        usedSource = usedSource || "Cloudflare DoH";
      }
    } catch (_) {}
  }
  const fmt = (type, limit = 5) => {
    if (!records[type]?.length) return "_(none)_";
    const list = records[type].slice(0, limit);
    if (records[type].length > limit)
      list.push(`...+${records[type].length - limit} more`);
    return list.join("\n");
  };
  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n║     🔍 *DNS RECORDS*     ║\n╚══════════════════════════╝\n\n🌐 *Domain:* ${domain}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *A Records (IPv4):*\n${fmt("A")}\n━━━━━━━━━━━━━━━━━━━━━\n📋 *AAAA Records (IPv6):*\n${fmt("AAAA")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *MX Records (Mail):*\n${fmt("MX")}\n━━━━━━━━━━━━━━━━━━━━━\n📋 *NS Records:*\n${fmt("NS")}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n📋 *TXT Records:*\n${fmt("TXT", 3)}\n` +
      (records.CNAME.length > 0
        ? `━━━━━━━━━━━━━━━━━━━━━\n📋 *CNAME:*\n${fmt("CNAME")}\n`
        : "") +
      `━━━━━━━━━━━━━━━━━━━━━\n🔧 *Source:* ${usedSource || "Multiple DoH resolvers"}\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
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
    const targetJid =
      msg?.extendedTextMessage?.contextInfo?.participant ||
      msg?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
      senderJid;
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

export async function getgpp({ from, sock, isGroup }) {
  if (!isGroup)
    return sock.sendMessage(from, {
      text: formatError("GROUP ONLY", "This command only works in groups."),
    });
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

export async function prefixinfo({ from, sock }) {
  await sock.sendMessage(from, {
    text:
      `╔═══════════════════════════════════╗\n║       ℹ️ *PREFIX INFORMATION*    ║\n╚═══════════════════════════════════╝\n\n` +
      `🔤 *Current Prefix:* \`${ENV.PREFIX}\`\n📝 *Usage Format:* ${ENV.PREFIX}<command> [arguments]\n\n` +
      `📋 *Example Commands:*\n${ENV.PREFIX}menu — Show all commands\n${ENV.PREFIX}ping — Check bot latency\n\n💡 All commands must start with "${ENV.PREFIX}"\n👑 Created by AYOCODES`,
  });
}

export async function jarvis({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo(
        "JARVIS AI ASSISTANT",
        `Usage: ${ENV.PREFIX}jarvis <question>`,
      ),
    });
  await sock.sendMessage(from, {
    text: "🤖 *Jarvis is processing your query...*",
  });
  await sock.sendMessage(from, {
    text: `🤖 *JARVIS - Powered by AYOCODES*\n\n"Analyzing: ${fullArgs.substring(0, 100)}..."\n\n💡 _For full AI conversation use:_ ${ENV.PREFIX}ayobot ${fullArgs.substring(0, 50)}\n\n👑 *Iron Man's JARVIS Mode Active*`,
  });
}

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
      timeout: 10_000,
      maxRedirects: 10,
      headers: { "User-Agent": randomUA() },
      validateStatus: () => true,
    });
    const h = response.headers,
      statusEmoji =
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

export async function qencode({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("QR CODE GENERATOR", `Usage: ${ENV.PREFIX}qr <text>`),
    });
  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });
  try {
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
      await sock.sendMessage(from, {
        image: { url: qrUrl },
        caption: `📱 *QR Code Generated*\n📝 ${fullArgs.substring(0, 100)}`,
      });
    }
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not generate QR code: ${err.message}`),
    });
  }
}

export async function take({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage))
      return sock.sendMessage(from, {
        text: formatInfo(
          "TAKE STICKER",
          `Reply to an image/video with ${ENV.PREFIX}take`,
        ),
      });
    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });
    const mediaType = quoted.imageMessage ? "image" : "video";
    const stream = await downloadContentFromMessage(
      quoted.imageMessage || quoted.videoMessage,
      mediaType,
    );
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
//  SCREENSHOT — all 4 services
// ════════════════════════════════════════════════════════════════════════════
export async function screenshot({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("📷 SCREENSHOT", `Usage: ${ENV.PREFIX}screenshot <url>`),
    });
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
  let screenshotBuffer = null,
    usedService = "",
    errors = [];
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
  if (!screenshotBuffer) {
    let pageTitle = urlStr;
    try {
      const r = await axios.get(urlStr, {
        timeout: 10000,
        headers: { "User-Agent": randomUA() },
        maxContentLength: 200000,
      });
      const m = r.data?.match(/<title[^>]*>(.*?)<\/title>/is);
      if (m) pageTitle = m[1].trim();
    } catch (_) {}
    return sock.sendMessage(from, {
      text: formatInfo(
        "SCREENSHOT UNAVAILABLE",
        `Could not take screenshot of:\n${urlStr}\n\n📝 *Page Title:* ${pageTitle.substring(0, 200)}\n\n💡 *Try instead:*\n• ${ENV.PREFIX}scrape ${urlStr}\n• ${ENV.PREFIX}fetch ${urlStr}`,
      ),
    });
  }
  let pageTitle = urlStr;
  try {
    const r = await axios.get(urlStr, {
      timeout: 6000,
      maxContentLength: 100000,
      headers: { "User-Agent": randomUA() },
    });
    const m = r.data?.match(/<title[^>]*>(.*?)<\/title>/is);
    if (m) pageTitle = m[1].trim().substring(0, 100);
  } catch (_) {}
  await sock.sendMessage(from, {
    image: screenshotBuffer,
    caption: `📷 *Screenshot*\n━━━━━━━━━━━━━━━━━━━━━\n🔗 *URL:* ${urlStr}\n📝 *Title:* ${pageTitle}\n📦 *Size:* ${(screenshotBuffer.byteLength / 1024).toFixed(1)} KB\n🔧 *Service:* ${usedService}\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

export async function inspect({ fullArgs, from, sock }) {
  if (!fullArgs)
    return sock.sendMessage(from, {
      text: formatInfo("INSPECT PAGE", `Usage: ${ENV.PREFIX}inspect <url>`),
    });
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
    const $ = cheerio.load(response.data),
      body = response.data.toLowerCase(),
      techs = [];
    if (body.includes("react")) techs.push("React");
    if (body.includes("vue.js") || body.includes("__vue")) techs.push("Vue.js");
    if (body.includes("angular")) techs.push("Angular");
    if (body.includes("wp-content")) techs.push("WordPress");
    if (body.includes("shopify")) techs.push("Shopify");
    if (body.includes("next.js") || body.includes("__next"))
      techs.push("Next.js");
    if (body.includes("jquery")) techs.push("jQuery");
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
        "🔒 HTTPS": urlStr.startsWith("https") ? "Yes ✅" : "No ❌",
      }),
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

export async function imgbb({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted || !quoted.imageMessage)
      return sock.sendMessage(from, {
        text: formatInfo(
          "IMGBB UPLOAD",
          `Reply to an image with ${ENV.PREFIX}imgbb`,
        ),
      });
    await sock.sendMessage(from, { text: "📤 *Uploading image...*" });
    const stream = await downloadContentFromMessage(
      quoted.imageMessage,
      "image",
    );
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    const base64Image = buffer.toString("base64");
    let result = null;
    if (ENV.IMGBB_KEY) {
      try {
        const params = new URLSearchParams();
        params.append("image", base64Image);
        const res = await axios.post(
          `https://api.imgbb.com/1/upload?key=${ENV.IMGBB_KEY}`,
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
//  ACTIVATE / DEACTIVATE GROUP
// ════════════════════════════════════════════════════════════════════════════
export async function activate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup)
    return sock.sendMessage(from, {
      text: "❌ This command only works in groups.",
    });
  if (!isAdmin)
    return sock.sendMessage(from, {
      text: "⛔ Only the bot owner can activate the bot in this group.",
    });
  activateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `✅ *GROUP ACTIVATED!*\n\nEveryone can now use bot commands in this group.\n\nTo restrict back to owner-only: *${ENV.PREFIX}deactivate*`,
  });
}

export async function deactivate({ from, sock, isAdmin, isGroup, sessionId }) {
  if (!isGroup)
    return sock.sendMessage(from, {
      text: "❌ This command only works in groups.",
    });
  if (!isAdmin)
    return sock.sendMessage(from, {
      text: "⛔ Only the bot owner can deactivate the bot in this group.",
    });
  deactivateGroup(sessionId, from);
  await sock.sendMessage(from, {
    text: `🔒 *GROUP DEACTIVATED!*\n\nOnly the bot owner can use commands in this group now.\n\nTo open to everyone: *${ENV.PREFIX}activate*`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  ANTILINK — FULLY FIXED
//
//  ROOT CAUSE OF SILENT FAILURE:
//    The old code had the `if (!isGroup)` check INSIDE the `if (args.length > 0)`
//    block. This meant that when a user typed `.antilink` with NO args in a group,
//    the code skipped the args block entirely and hit the dead `return` at the
//    bottom — producing zero response. Fixed by checking isGroup FIRST. — AYOCODES
//
//  ADMIN FIX:
//    Now checks real group admin status via normalizeJid() comparison.
//    Before, only the bot owner (isAdmin) could toggle it. — AYOCODES
//
//  LINK DETECTION:
//    Runs ONLY in automation.js → handleAntiLink().
//    This function handles ONLY the toggle command + status display.
//
//  ⚠️  BOT MUST BE GROUP ADMIN:
//    Antilink can only DELETE messages and KICK members if the bot is a
//    group admin. Make the bot admin in WhatsApp group settings.
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
  // ── STEP 1: Group-only gate — checked FIRST, before anything else ─────────
  if (!isGroup) {
    return sock.sendMessage(from, {
      text: "❌ This command only works in groups.",
    });
  }

  const currentSetting = groupSettings.get(from) || {};

  // ── STEP 2: No args → show current status ────────────────────────────────
  if (!args || args.length === 0) {
    const statusLabel = currentSetting.antilink ? "ENABLED ✅" : "DISABLED ❌";
    return sock.sendMessage(from, {
      text:
        `🔗 *Anti-Link Status:* ${statusLabel}\n\n` +
        `📌 *Toggle with:*\n` +
        `${ENV.PREFIX}antilink on     — Enable\n` +
        `${ENV.PREFIX}antilink off    — Disable\n` +
        `${ENV.PREFIX}antilink status — Check status\n\n` +
        `⚠️ *The bot must be a group admin for link deletion and auto-kick to work.*\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  // ── STEP 3: Has args → verify caller is group admin ──────────────────────
  // FIX: Check actual GROUP admin status, NOT just isAdmin (bot owner). — AYOCODES
  let isGroupAdmin = false;
  try {
    const metadata = await sock.groupMetadata(from);
    const userNum = normalizeJid(userJid); // e.g. "223175560437838"
    isGroupAdmin = metadata.participants.some(
      (p) =>
        normalizeJid(p.id) === userNum &&
        (p.admin === "admin" || p.admin === "superadmin"),
    );
  } catch (_) {}

  if (!isGroupAdmin && !isAdmin) {
    return sock.sendMessage(from, {
      text: "⛔ Only *group admins* can toggle antilink.",
    });
  }

  const sub = args[0]?.toLowerCase();

  // Unknown subcommand → show help
  if (!sub || !["on", "off", "status"].includes(sub)) {
    const statusLabel = currentSetting.antilink ? "ON ✅" : "OFF ❌";
    return sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n║     🔗 *ANTI-LINK*       ║\n╚══════════════════════════╝\n\n` +
        `Current Status: *${statusLabel}*\n\n📌 *Commands:*\n` +
        `${ENV.PREFIX}antilink on     — Enable protection\n` +
        `${ENV.PREFIX}antilink off    — Disable protection\n` +
        `${ENV.PREFIX}antilink status — Check status\n\n` +
        `⚠️ When enabled, ALL links will be:\n• 🗑️ Automatically deleted\n• ⚠️ User warned\n• 👢 Auto-kick after 3 warnings\n\n` +
        `⚠️ *Bot must be group admin for deletion/kick to work!*\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  if (sub === "on") {
    currentSetting.antilink = true;
    groupSettings.set(from, currentSetting);
    return sock.sendMessage(from, {
      text:
        `✅ *Anti-Link ENABLED*\n\n🔗 All links will now be:\n• 🗑️ Deleted immediately\n• ⚠️ Users warned\n• 👢 Auto-kick after 3 warnings\n\n` +
        `⚠️ *Make sure the bot is a group admin for this to work!*\n\nGo to: Group Info → Participants → Bot → Make Admin\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  if (sub === "off") {
    currentSetting.antilink = false;
    groupSettings.set(from, currentSetting);
    return sock.sendMessage(from, {
      text: `🔴 *Anti-Link DISABLED*\n\nLinks are now allowed in this group.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
    });
  }

  // sub === "status"
  const statusLabel = currentSetting.antilink ? "ENABLED ✅" : "DISABLED ❌";
  return sock.sendMessage(from, {
    text: `🔗 *Anti-Link Status:* ${statusLabel}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT — ALL COMMANDS
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
  pdf,
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
  test,
  activate,
  deactivate,
  antilink,
};
