// ============================================================
//   AYOBOT v1 — index.js
//   Built from scratch by AYOCODES. Every line. Don't @ me.
// ============================================================

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import NodeCache from "node-cache";
import path from "path";
import pino from "pino";
import QRCode from "qrcode";
import QRCodeTerminal from "qrcode-terminal";
import { fileURLToPath } from "url";
import { exec } from "child_process";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
//   TERMINAL COLORS & LOGGER
// ============================================================
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

export const log = {
  ok: (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  msg: (m) => console.log(`📨 ${m}`),
  cmd: (m) => console.log(`⚡ ${m}`),
};

// ============================================================
//   EXPRESS DASHBOARD SETUP
// ============================================================
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let currentQR = null;
let botStatus = {
  connected: false,
  startTime: Date.now(),
  botNumber: null,
  botName: null,
  messageCount: 0,
  commandCount: 0,
  mode: process.env.BOT_MODE || "public",
  uptime: 0,
  authMethod: null,
  ownerSet: false,
};

// ============================================================
//   WAITLIST STORE — server-side so resets don't lose data
// ============================================================
const waitlistStore = new Map(); // version → Set of phones

// ============================================================
//   PAIRING STATE MACHINE
// ============================================================
const pairingState = {
  pending: false,
  phoneNumber: null,
  code: null,
  rawCode: null,
  expiresAt: null,
  error: null,
};

function resetPairingState() {
  Object.assign(pairingState, {
    pending: false,
    phoneNumber: null,
    code: null,
    rawCode: null,
    expiresAt: null,
    error: null,
  });
}

function getPairingStatus() {
  if (
    pairingState.pending &&
    pairingState.code &&
    pairingState.expiresAt > Date.now()
  ) {
    return {
      hasCode: true,
      code: pairingState.code,
      phoneNumber: pairingState.phoneNumber,
      expiresIn: Math.max(
        0,
        Math.floor((pairingState.expiresAt - Date.now()) / 1000),
      ),
    };
  }
  return { hasCode: false };
}

// ============================================================
//   OWNER SYSTEM
// ============================================================
let botOwnerJid = null;
let botOwnerPhone = null;
let botOwnerName = null;
export let botSelfJid = null;

export function setBotOwner(jid, phone, name = "Unknown") {
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  const cleanJid = `${cleanPhone}@s.whatsapp.net`;
  botOwnerJid = cleanJid;
  botOwnerPhone = cleanPhone;
  botOwnerName =
    name && name !== cleanPhone && name !== "Unknown"
      ? name
      : botOwnerName && botOwnerName !== cleanPhone
        ? botOwnerName
        : "Owner";
  botStatus.ownerSet = true;
  botStatus.botNumber = cleanPhone;
  botStatus.botName = botOwnerName;
  console.log(
    `\n${C.yellow}👑 BOT OWNER SET: ${cleanPhone} (${botOwnerName}) → ${cleanJid}${C.reset}\n`,
  );
  saveBotOwner();
}

export function getBotOwner() {
  return { jid: botOwnerJid, phone: botOwnerPhone, name: botOwnerName };
}

export function resetBotOwner() {
  botOwnerJid = botOwnerPhone = botOwnerName = null;
  botStatus.ownerSet = false;
  try {
    if (fs.existsSync(OWNER_DB_PATH)) fs.unlinkSync(OWNER_DB_PATH);
  } catch (_) {}
  log.info("Bot owner reset — will be set on next connection.");
}

export function isAdmin(userJid) {
  if (!userJid) return false;
  const ownerPhone = normalizePhone(botOwnerPhone || ENV?.ADMIN || "");
  if (!ownerPhone) return false;
  const u = normalizePhone(String(userJid).split("@")[0].split(":")[0]);
  return (
    u === ownerPhone ||
    userJid === botOwnerJid ||
    userJid === `${ownerPhone}@s.whatsapp.net` ||
    userJid === `${ownerPhone}@lid` ||
    normalizePhone(botOwnerJid) === u
  );
}

export function isAuthorized(userJid) {
  if (isAdmin(userJid)) return true;
  if (authorizedUsers.has(userJid)) return true;
  if (ENV.BOT_MODE === "public") return true;
  return false;
}
export const authorizedUsers = new Set();

// ============================================================
//   ENVIRONMENT CONFIG
// ============================================================
export const ENV = {
  PREFIX: process.env.PREFIX || ".",
  BOT_NAME: process.env.BOT_NAME || "AYOBOT",
  BOT_VERSION: process.env.BOT_VERSION || "1.0.0",
  ADMIN: process.env.ADMIN,
  CO_DEVELOPER: process.env.CO_DEVELOPER || process.env.ADMIN,
  OPENWEATHER_KEY: process.env.OPENWEATHER_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
  GNEWS_API_KEY: process.env.GNEWS_API_KEY,
  NEWSAPI_KEY: process.env.NEWSAPI_KEY,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  COINMARKETCAP_KEY: process.env.COINMARKETCAP_KEY,
  REMOVEBG_KEY: process.env.REMOVEBG_KEY,
  VIRUSTOTAL_KEY: process.env.VIRUSTOTAL_KEY,
  GOOGLE_SAFE_BROWSING_KEY: process.env.GOOGLE_SAFE_BROWSING_KEY,
  URLSCAN_KEY: process.env.URLSCAN_KEY,
  WELCOME_IMAGE_URL:
    process.env.WELCOME_IMAGE_URL ||
    "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
  WELCOME_AUDIO_URL:
    process.env.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
  CREATOR_IMAGE_URL:
    process.env.CREATOR_IMAGE_URL || "https://i.ibb.co/4R4LPvV3/creator.jpg",
  WHATSAPP_CHANNEL:
    process.env.WHATSAPP_CHANNEL ||
    "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25",
  WHATSAPP_GROUP:
    process.env.WHATSAPP_GROUP ||
    "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN",
  CREATOR_NAME: "AYOCODES",
  CREATOR_CONTACT: process.env.CREATOR_CONTACT || process.env.ADMIN,
  CREATOR_EMAIL: process.env.CREATOR_EMAIL,
  CREATOR_GITHUB: "https://github.com/Officialay12",
  MAX_WARNINGS: parseInt(process.env.MAX_WARNINGS) || 3,
  AUTO_REPLY_ENABLED: false,
  BOT_MODE: process.env.BOT_MODE || "public",
  SHORTENER_API: process.env.SHORTENER_API || "https://ayo-link.onrender.com",
  SHORTENER_API_KEY: process.env.SHORTENER_API_KEY,
  ANTI_DELETE_ENABLED: process.env.ANTI_DELETE_ENABLED !== "false",
  HF_TOKEN: process.env.HF_TOKEN,
  GEMINI_KEY: process.env.GEMINI_KEY,
  TENOR_KEY: process.env.TENOR_KEY || process.env.GEMINI_KEY,
  GIPHY_KEY: process.env.GIPHY_KEY,
  PIXABAY_KEY: process.env.PIXABAY_KEY,
  UNSPLASH_KEY: process.env.UNSPLASH_KEY,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  PORT: process.env.PORT || 3000,
  AYOCODES_ADMIN_KEY: process.env.AYOCODES_ADMIN_KEY || null,
  CENTRAL_SERVER_URL:
    process.env.CENTRAL_SERVER_URL || "https://your-render-url.onrender.com",
  INSTANCE_ID: process.env.INSTANCE_ID || null,
};

function checkEnvVars() {
  const missing = [];
  if (!ENV.GEMINI_KEY) missing.push("GEMINI_KEY (AI disabled)");
  if (
    !ENV.NEWS_API_KEY &&
    !ENV.NEWSDATA_API_KEY &&
    !ENV.GNEWS_API_KEY &&
    !ENV.NEWSAPI_KEY
  )
    missing.push(
      "NEWS API KEYS (set NEWSDATA_API_KEY, GNEWS_API_KEY, or NEWSAPI_KEY)",
    );
  if (!ENV.OPENWEATHER_KEY) missing.push("OPENWEATHER_KEY (Weather disabled)");
  if (missing.length) {
    console.log(`\n${C.yellow}⚠️  Missing optional ENV vars:${C.reset}`);
    missing.forEach((x) => console.log(`   • ${x}`));
    console.log("");
  }
}

// ── ffmpeg check — required for reminder voice notes — AYOCODES
function checkFfmpeg() {
  exec("ffmpeg -version", (err) => {
    if (err) {
      log.warn("ffmpeg not found — reminder voice notes will be skipped.");
      log.warn(
        "Install: sudo apt install ffmpeg  (Linux) | brew install ffmpeg  (Mac)",
      );
    } else {
      log.ok("ffmpeg detected — reminder voice notes enabled ✅");
    }
  });
}

// ============================================================
//   HELPERS
// ============================================================
export function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/[^0-9]/g, "")
    .trim();
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendMsg(sock, jid, content, opts = {}) {
  try {
    return await sock.sendMessage(jid, content, opts);
  } catch (e) {
    log.err("sendMsg failed: " + e.message);
    return null;
  }
}

// ============================================================
//   CONSTANTS
// ============================================================
export const ADMIN_CACHE_TTL = 30000;
export const GROUP_META_TTL = 60000;
export const RATE_LIMIT_WINDOW = 2000;
export const MAX_COMMANDS_PER_WINDOW = 3;
export const SPAM_TIME_WINDOW = 4000;
export const MAX_SPAM_MESSAGES = 3;
export const MAX_SIMILAR_MESSAGES = 2;

export const RATE_LIMIT_MESSAGES = [
  "⏳ *CHILL BRO!* Take a breath!",
  "🧘 *ONE AT A TIME!* Slow down!",
  "⚡ *EASY DOES IT!* Wait a moment!",
  "🎯 *PATIENCE!* Commands need spacing!",
  "🌟 *BREATHE!* You're going too fast!",
];

// ============================================================
//   GLOBAL STATE
// ============================================================
export let messageCount = 0;
export let botStartTime = Date.now();
export const commandUsage = new Map();
export const commandRateLimit = new Map();
export const userCooldown = new Map();
export const groupWarnings = new Map();
export const bannedUsers = new Map();
export const groupSettings = new Map();
export const waitlistEntries = new Map();
export const deletedMessages = new Map();
export const userConversations = new Map();
export const inactivityTimers = new Map();
export const autoReplyEnabled = new Map();
export const spamTracker = new Map();
export const adminCache = new Map();
export const groupMetadataCache = new Map();

export const msgCache = new NodeCache({ stdTTL: 60, maxKeys: 5000 });

export function saveBann(jid, reason = "") {
  bannedUsers.set(jid, { reason, timestamp: Date.now() });
  saveDatabases();
}
export function getBann(jid) {
  return bannedUsers.get(jid) || null;
}
export function removeBann(jid) {
  bannedUsers.delete(jid);
  saveDatabases();
}
export function saveBannedUsers() {
  saveDatabases();
}
export function saveWarnings() {
  saveDatabases();
}
export function saveGroupSettings() {
  saveDatabases();
}

// ============================================================
//   DATABASE
// ============================================================
const DB_PATH = path.join(__dirname, "database");
const DATA_PATH = path.join(__dirname, "data");
const OWNER_DB_PATH = path.join(DB_PATH, "bot_owner.json");

export function loadDatabases() {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });

  for (const [name, map] of Object.entries({
    warnings: groupWarnings,
    bans: bannedUsers,
    settings: groupSettings,
  })) {
    try {
      const fp = path.join(DB_PATH, `${name}.json`);
      if (fs.existsSync(fp)) {
        const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
        Object.entries(parsed).forEach(([k, v]) => map.set(k, v));
      }
    } catch (_) {}
  }
  loadBotOwner();
  log.ok("Databases loaded");
}

export function saveDatabases() {
  for (const [name, map] of Object.entries({
    warnings: groupWarnings,
    bans: bannedUsers,
    settings: groupSettings,
  })) {
    try {
      if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
      fs.writeFileSync(
        path.join(DB_PATH, `${name}.json`),
        JSON.stringify(Object.fromEntries(map), null, 2),
      );
    } catch (_) {}
  }
}

export function loadBotOwner() {
  try {
    if (fs.existsSync(OWNER_DB_PATH)) {
      const d = JSON.parse(fs.readFileSync(OWNER_DB_PATH, "utf8"));
      const cleanPhone = String(d.phone || "").replace(/[^0-9]/g, "");
      const cleanJid = `${cleanPhone}@s.whatsapp.net`;
      botOwnerJid = cleanJid;
      botOwnerPhone = cleanPhone;
      const storedName = d.name || "";
      botOwnerName =
        storedName && storedName !== cleanPhone ? storedName : "Owner";
      botStatus.ownerSet = true;
      botStatus.botNumber = cleanPhone;
      botStatus.botName = botOwnerName;
      log.ok(`Loaded owner: ${botOwnerPhone} (${botOwnerName})`);
    }
  } catch (_) {
    log.warn("No saved owner found — will be set on first connect.");
  }
}

export function saveBotOwner() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
    fs.writeFileSync(
      OWNER_DB_PATH,
      JSON.stringify(
        {
          jid: botOwnerJid,
          phone: botOwnerPhone,
          name: botOwnerName,
          timestamp: Date.now(),
        },
        null,
        2,
      ),
    );
    log.ok(`Owner saved: ${botOwnerPhone}`);
  } catch (e) {
    log.warn("Could not save owner: " + e.message);
  }
}

// ============================================================
//   PINO LOGGER + BAD MAC SUPPRESSION
// ============================================================
const logger = pino({ level: "silent" });
const originalConsoleError = console.error;
console.error = function (...args) {
  const m = args[0];
  if (typeof m === "string" && m.includes("Bad MAC")) return;
  if (m instanceof Error && m.message?.includes("Bad MAC")) return;
  originalConsoleError.apply(console, args);
};

// ============================================================
//   CONNECTION STATE
// ============================================================
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let qrGenerated = false;
let connectionInProgress = false;
let hasValidSession = false;
let connectionStartTime = 0;
let currentSock = null;
let reconnectTimeout = null;
let isConnected = false;
let connectionClosed = false;
let connectionStable = false;
let authFailures = 0;
const MAX_AUTH_FAILURES = 3;
let pingInterval = null;
let rateLimitCleanupInterval = null;
let pairingCodeTimeout = null;

let commandHandler = null;
let antiDeleteHandler = null;
let groupHandler = null;
let handlersReady = false;

// ============================================================
//   CENTRAL MONITORING STATE
// ============================================================
export const connectedInstances = new Map();
let heartbeatInterval = null;
const adminSessionTokens = new Set();

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc)
    rc.split(";").forEach((c) => {
      const parts = c.split("=");
      list[parts.shift().trim()] = decodeURIComponent(parts.join("=").trim());
    });
  return list;
}

function cookieMiddleware(req, _res, next) {
  req.cookies = parseCookies(req);
  next();
}

function requireAdminAuth(req, res, next) {
  const token = req.cookies?.ayoAdminToken;
  if (token && adminSessionTokens.has(token)) return next();
  if (
    req.path === "/ayocodes-admin/login" ||
    req.path === "/ayocodes-admin/login-post"
  )
    return next();
  res.redirect("/ayocodes-admin/login");
}

// ============================================================
//   CLEANUP
// ============================================================
function cleanup() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  if (pairingCodeTimeout) {
    clearTimeout(pairingCodeTimeout);
    pairingCodeTimeout = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ============================================================
//   OUTBOUND HEARTBEAT
// ============================================================
function startHeartbeat() {
  if (!ENV.CENTRAL_SERVER_URL) return;
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  const sendPing = async () => {
    try {
      const instanceId =
        ENV.INSTANCE_ID || botOwnerPhone || `instance-${Date.now()}`;
      const payload = {
        instanceId,
        ownerPhone: botOwnerPhone || null,
        ownerName: botOwnerName || null,
        botNumber: botStatus.botNumber || null,
        connected: isConnected,
        uptime: Math.floor((Date.now() - botStatus.startTime) / 1000),
        messageCount: botStatus.messageCount || 0,
        commandCount: botStatus.commandCount || 0,
        version: ENV.BOT_VERSION,
        mode: ENV.BOT_MODE,
        url: process.env.RENDER_EXTERNAL_URL
          ? `https://${process.env.RENDER_EXTERNAL_URL}`
          : null,
        timestamp: Date.now(),
      };
      await fetch(`${ENV.CENTRAL_SERVER_URL}/api/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {}
  };

  sendPing();
  heartbeatInterval = setInterval(sendPing, 30000);
}

function clearSession() {
  try {
    if (fs.existsSync("auth_info")) {
      fs.rmSync("auth_info", { recursive: true, force: true });
      log.info("Session cleared.");
    }
  } catch (e) {
    log.warn("Could not clear session: " + e.message);
  }
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, ts] of commandRateLimit.entries()) {
    const fresh = ts.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (!fresh.length) commandRateLimit.delete(key);
    else commandRateLimit.set(key, fresh);
  }
}

// ============================================================
//   PAIRING CODE
// ============================================================
async function requestPairingCode(phoneNumber) {
  const cleanNumber = (phoneNumber || "").replace(/\D/g, "");
  if (cleanNumber.length < 10 || cleanNumber.length > 15)
    return {
      success: false,
      error:
        "Phone number must be 10–15 digits (include country code, no + or spaces)",
    };
  if (isConnected)
    return {
      success: false,
      error: "Bot is already connected. Disconnect first to re-pair.",
    };
  if (!currentSock)
    return {
      success: false,
      error: "Bot is still starting up. Wait a moment and try again.",
    };
  if (pairingState.pending && pairingState.expiresAt > Date.now())
    return {
      success: true,
      code: pairingState.code,
      rawCode: pairingState.rawCode,
      phoneNumber: pairingState.phoneNumber,
      expiresIn: Math.max(
        0,
        Math.floor((pairingState.expiresAt - Date.now()) / 1000),
      ),
      cached: true,
    };

  log.info(`Requesting pairing code for: +${cleanNumber}`);
  try {
    const rawCode = await currentSock.requestPairingCode(cleanNumber);
    const code =
      String(rawCode)
        .match(/.{1,4}/g)
        ?.join("-") || String(rawCode);
    Object.assign(pairingState, {
      pending: true,
      phoneNumber: cleanNumber,
      code,
      rawCode: String(rawCode),
      expiresAt: Date.now() + 60000,
      error: null,
    });
    if (pairingCodeTimeout) clearTimeout(pairingCodeTimeout);
    pairingCodeTimeout = setTimeout(() => {
      resetPairingState();
      log.warn("Pairing code expired — request a new one.");
    }, 60000);
    botStatus.authMethod = "pairing";
    log.ok(`Pairing code ready: ${code} for +${cleanNumber}`);
    return {
      success: true,
      code,
      rawCode: String(rawCode),
      phoneNumber: cleanNumber,
      expiresIn: 60,
    };
  } catch (e) {
    pairingState.error = e.message;
    log.err("Pairing code failed: " + e.message);
    return { success: false, error: e.message };
  }
}

// ============================================================
//   FEATURE MODULE LOADER
// ============================================================
async function loadAndDisplayFeatures() {
  const line = "━".repeat(54);
  console.log(`\n┏${line}┓`);
  console.log(`┃           📦 LOADING ALL FEATURE MODULES            ┃`);
  console.log(`┗${line}┛\n`);

  const features = [
    { name: "AI", path: "./features/ai.js", emoji: "🤖" },
    { name: "Calculator", path: "./features/calculator.js", emoji: "🧮" },
    { name: "Crypto", path: "./features/crypto.js", emoji: "💰" },
    { name: "Dictionary", path: "./features/dictionary.js", emoji: "📖" },
    { name: "Downloader", path: "./features/downloader.js", emoji: "📥" },
    { name: "Encryption", path: "./features/encryption.js", emoji: "🔐" },
    { name: "Games", path: "./features/games.js", emoji: "🎮" },
    { name: "Image Tools", path: "./features/imageTools.js", emoji: "🖼️" },
    { name: "IP Lookup", path: "./features/ipLookup.js", emoji: "🌐" },
    { name: "Jokes", path: "./features/jokes.js", emoji: "😂" },
    { name: "Movies", path: "./features/movies.js", emoji: "🎬" },
    { name: "Music", path: "./features/music.js", emoji: "🎵" },
    { name: "News", path: "./features/news.js", emoji: "📰" },
    { name: "Notes", path: "./features/notes.js", emoji: "📝" },
    { name: "QR", path: "./features/qr.js", emoji: "📱" },
    { name: "Quotes", path: "./features/quotes.js", emoji: "💬" },
    { name: "Reminder", path: "./features/reminder.js", emoji: "⏰" },
    { name: "Security", path: "./features/security.js", emoji: "🛡️" },
    { name: "Stocks", path: "./features/stocks.js", emoji: "📈" },
    { name: "Translation", path: "./features/translation.js", emoji: "🌍" },
    { name: "TTS", path: "./features/tts.js", emoji: "🗣️" },
    {
      name: "Unit Converter",
      path: "./features/unitConverter.js",
      emoji: "📏",
    },
    { name: "Group Core", path: "./commands/group/core.js", emoji: "👥" },
    { name: "Group Mod", path: "./commands/group/moderation.js", emoji: "⚙️" },
    {
      name: "Group Settings",
      path: "./commands/group/settings.js",
      emoji: "🔧",
    },
    { name: "Admin", path: "./commands/group/admin.js", emoji: "👑" },
    { name: "Basic", path: "./commands/group/basic.js", emoji: "📋" },
    { name: "Automation", path: "./commands/group/automation.js", emoji: "🤖" },
  ];

  let loaded = 0,
    failed = 0,
    total = 0;
  for (const f of features) {
    try {
      const mod = await import(f.path);
      const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
      const prev = fns.slice(0, 5).join(", ");
      console.log(
        `✅ ${f.emoji} ${f.name.padEnd(16)} ➜ ${fns.length} exports [${prev}${fns.length > 5 ? "…" : ""}]`,
      );
      loaded++;
      total += fns.length;
    } catch (e) {
      console.log(
        `❌ ${f.emoji} ${f.name.padEnd(16)} ➜ ${e.message.substring(0, 55)}`,
      );
      failed++;
    }
  }

  console.log(`\n┏${line}┓`);
  console.log(
    `┃  📊 ${loaded} loaded | ${failed} failed | ${total} total functions`.padEnd(
      55,
    ) + "┃",
  );
  console.log(`┗${line}┛\n`);
}

// ============================================================
//   HANDLER LOADER
// ============================================================
async function loadAllHandlers() {
  handlersReady = false;
  try {
    const m = await import("./handlers/commandHandler.js");
    commandHandler = m.handleCommand;
    log.ok("Command handler loaded");
  } catch (e) {
    log.warn("Command handler error: " + e.message);
  }

  try {
    const m = await import("./handlers/antiDelete.js");
    antiDeleteHandler = m.handleAntiDelete;
    log.ok("Anti-delete handler loaded");
  } catch (e) {
    log.warn("Anti-delete handler error: " + e.message);
  }

  try {
    const m = await import("./commands/group/automation.js");
    groupHandler = m.handleGroupParticipant;
    log.ok("Group handler loaded");
  } catch (e) {
    log.warn("Group handler error: " + e.message);
  }

  handlersReady = true;
  log.ok("All handlers ready — bot is now responding.");
}

// ============================================================
//   REMINDER SCHEDULER LOADER — AYOCODES
// ============================================================
async function loadReminderScheduler(sock) {
  try {
    const { startReminderScheduler } = await import("./features/reminder.js");
    startReminderScheduler(sock);
    log.ok("Reminder scheduler started ✅");
  } catch (e) {
    log.warn("Reminder scheduler not started: " + e.message);
  }
}

// ============================================================
//   WELCOME MESSAGE — fixed with proper stabilization wait
// ============================================================
async function sendWelcomeMessage(sock, botNumber, userName, connectTime) {
  // Wait longer for connection to fully stabilize — AYOCODES
  await delay(15000);

  // Active wait loop — up to 30 more seconds — AYOCODES
  let waited = 0;
  while (!isConnected && waited < 30000) {
    await delay(2000);
    waited += 2000;
  }

  if (!isConnected) {
    log.warn("Connection never stabilized — skipping welcome.");
    return;
  }

  if (!botOwnerJid) loadBotOwner();
  if (!botOwnerJid) {
    log.warn("Skipping welcome — owner not set.");
    return;
  }

  log.info(`Sending welcome → ${botOwnerJid} (${botOwnerPhone})`);

  const speedLabel =
    connectTime < 10000 ? "Fast" : connectTime < 20000 ? "Normal" : "Slow";
  const speedIcon =
    connectTime < 10000 ? "🟢" : connectTime < 20000 ? "🟡" : "🔴";
  const connectSecs = (connectTime / 1000).toFixed(1);
  const mem = process.memoryUsage();
  const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
  const displayName =
    botOwnerName && botOwnerName !== botOwnerPhone && botOwnerName !== "Owner"
      ? botOwnerName
      : null;

  const caption =
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖  *AYOBOT v1*  •  Online\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${speedIcon} *${connectSecs}s* · ${speedLabel}\n\n` +
    `┌─ *Bot Info* ──────────────\n` +
    `│ 📱 +${botNumber}\n` +
    (displayName ? `│ 👤 ${displayName}\n` : ``) +
    `│ 💾 ${usedMB}/${totalMB} MB\n` +
    `│ ⚡ ${ENV.BOT_MODE} mode\n` +
    `│ 📦 v${ENV.BOT_VERSION}\n` +
    `└───────────────────────\n\n` +
    `👑 *Owner:* +${botOwnerPhone}\n` +
    `_Full admin access_\n\n` +
    `Type *${ENV.PREFIX}menu* for commands`;

  // Audio — non-blocking, failure is fine — AYOCODES
  try {
    await sock.sendMessage(botOwnerJid, {
      audio: { url: ENV.WELCOME_AUDIO_URL },
      mimetype: "audio/aac",
      ptt: false,
    });
    log.ok("Welcome audio sent.");
  } catch (_) {
    log.warn("Welcome audio skipped — not critical.");
  }

  // Retry loop with connection recheck + exponential backoff — AYOCODES
  for (let i = 1; i <= 5; i++) {
    if (!isConnected) {
      log.warn(`Welcome attempt ${i} — not connected, waiting 5s...`);
      await delay(5000);
      if (!isConnected) continue;
    }

    try {
      log.info(`Welcome attempt ${i}/5…`);
      const r = await sock.sendMessage(botOwnerJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
      });
      if (r?.key?.id) {
        log.ok(`Welcome sent! ✅ (attempt ${i})`);
        return;
      }
    } catch (imgErr) {
      log.warn(`Attempt ${i} image failed: ${imgErr.message}`);
      // Immediately try plain text fallback — AYOCODES
      try {
        const r = await sock.sendMessage(botOwnerJid, { text: caption });
        if (r?.key?.id) {
          log.ok(`Welcome sent (text fallback)! ✅ (attempt ${i})`);
          return;
        }
      } catch (txtErr) {
        log.warn(`Attempt ${i} text also failed: ${txtErr.message}`);
      }
    }

    const backoff = Math.min(5000 * i, 20000);
    log.info(`Waiting ${backoff / 1000}s before attempt ${i + 1}…`);
    await delay(backoff);
  }

  // Absolute last resort — AYOCODES
  try {
    await sock.sendMessage(botOwnerJid, {
      text: `✅ *AYOBOT v1 is online!*\n\nType *${ENV.PREFIX}menu* for commands 🔥`,
    });
    log.ok("Minimal welcome sent.");
  } catch (e) {
    log.err("All welcome attempts failed: " + e.message);
  }
}

// ============================================================
//   WEB DASHBOARD — SHARED HEAD
// ============================================================
function sharedHead(title) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{
  --red:#ff0000;--red2:#cc0000;--red3:#ff3333;--red-glow:rgba(255,0,0,0.18);
  --gold:#ffd700;--gold2:#ffaa00;--gold-glow:rgba(255,215,0,0.15);
  --bg:#060608;--bg2:#0e0e12;--bg3:#16161c;--bg4:#1e1e26;
  --card:#12121a;--card2:#1a1a24;
  --text:#e8e8f0;--text2:#9090a8;--text3:#5a5a72;
  --green:#00ff88;--green-glow:rgba(0,255,136,0.15);
  --border:rgba(255,0,0,0.2);--border2:rgba(255,0,0,0.08);
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Rajdhani',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;}
body::before{content:'';position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(255,0,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,0,0.03) 1px,transparent 1px);background-size:40px 40px;animation:gridMove 20s linear infinite;pointer-events:none;}
@keyframes gridMove{to{background-position:40px 40px}}
.orb{position:fixed;border-radius:50%;filter:blur(120px);pointer-events:none;z-index:0;animation:orbFloat 8s ease-in-out infinite}
.orb1{width:400px;height:400px;background:rgba(255,0,0,0.06);top:-100px;right:-100px;}
.orb2{width:300px;height:300px;background:rgba(255,215,0,0.04);bottom:-50px;left:-50px;animation-delay:4s}
@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(20px,-20px) scale(1.05)}}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--red2);border-radius:2px}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(0.95)}}
@keyframes glow{0%,100%{box-shadow:0 0 10px var(--red-glow)}50%{box-shadow:0 0 30px var(--red-glow),0 0 60px rgba(255,0,0,0.08)}}
@keyframes goldGlow{0%,100%{box-shadow:0 0 10px var(--gold-glow)}50%{box-shadow:0 0 30px var(--gold-glow)}}
@keyframes greenPulse{0%,100%{box-shadow:0 0 6px rgba(0,255,136,0.6)}50%{box-shadow:0 0 20px rgba(0,255,136,0.9)}}
@keyframes scanline{0%{top:-5%}100%{top:105%}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glitch{0%,100%{clip-path:none;transform:none}2%{clip-path:polygon(0 10%,100% 10%,100% 15%,0 15%);transform:translate(-3px,0)}4%{clip-path:none;transform:none}96%{clip-path:polygon(0 60%,100% 60%,100% 65%,0 65%);transform:translate(3px,0)}98%{clip-path:none;transform:none}}
@keyframes dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}100%{content:''}}
.glass{background:var(--card);border:1px solid var(--border);border-radius:16px;backdrop-filter:blur(20px);position:relative;overflow:hidden;}
.glass::before{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,0.03) 0%,transparent 60%);pointer-events:none;}
.red-glow{animation:glow 3s ease-in-out infinite}
.gold-glow{animation:goldGlow 3s ease-in-out infinite}
.btn{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;letter-spacing:2px;text-transform:uppercase;transition:all .2s;position:relative;overflow:hidden;}
.btn-red{background:linear-gradient(135deg,var(--red),var(--red2));color:#000}
.btn-red:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,0,0,0.4)}
.btn-red:disabled{opacity:.5;cursor:not-allowed;transform:none}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(6,6,8,0.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;padding:0 32px;height:64px;}
.nav-logo{font-family:'Orbitron',sans-serif;font-weight:900;font-size:18px;color:var(--red);letter-spacing:3px}
.nav-logo span{color:var(--gold)}
.nav-status{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text2)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:greenPulse 2s ease-in-out infinite}
.dot.offline{background:var(--red);animation:pulse 2s infinite}
.main{padding-top:80px;padding-bottom:60px;max-width:1200px;margin:0 auto;padding-left:24px;padding-right:24px;position:relative;z-index:1}
.hero{text-align:center;padding:60px 20px 40px}
.hero-eyebrow{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--red);letter-spacing:4px;text-transform:uppercase;margin-bottom:16px;animation:fadeUp .6s ease both}
.hero-title{font-family:'Orbitron',sans-serif;font-size:clamp(2.5rem,8vw,5rem);font-weight:900;line-height:1;margin-bottom:16px;animation:fadeUp .6s .1s ease both}
.hero-title .line1{display:block;color:var(--text)}
.hero-title .line2{display:block;color:var(--red);text-shadow:0 0 40px rgba(255,0,0,0.5);animation:glitch 10s 2s infinite}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:32px 0}
.stat-card{padding:24px;border-radius:16px;background:var(--card);border:1px solid var(--border);text-align:center;transition:transform .2s,border-color .2s;}
.stat-card:hover{transform:translateY(-4px);border-color:var(--red)}
.stat-icon{font-size:28px;margin-bottom:8px}
.stat-val{font-family:'Orbitron',sans-serif;font-size:32px;font-weight:900;color:var(--red);line-height:1}
.stat-label{font-size:13px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-top:4px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}
@media(max-width:700px){.panels{grid-template-columns:1fr}}
.panel{padding:24px;border-radius:16px;background:var(--card);border:1px solid var(--border);}
.panel-title{font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border2)}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:14px}
.info-row:last-child{border-bottom:none}
.info-row .key{color:var(--text2)}
.info-row .val{color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px}
.owner-card{padding:24px 28px;border-radius:16px;margin:16px 0;background:linear-gradient(135deg,rgba(255,215,0,0.06),rgba(255,170,0,0.03));border:1px solid rgba(255,215,0,0.3);display:flex;align-items:center;gap:20px;transition:border-color .2s,box-shadow .2s;}
.owner-card:hover{border-color:rgba(255,215,0,0.6);box-shadow:0 0 30px rgba(255,215,0,0.1)}
.owner-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold2));display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 0 20px rgba(255,215,0,0.3);}
.owner-info{flex:1}
.owner-name{font-family:'Orbitron',sans-serif;font-size:16px;font-weight:700;color:var(--gold)}
.owner-phone{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2);margin-top:2px}
.owner-badge{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#000;padding:4px 10px;border-radius:4px;font-weight:700}
.status-live{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);padding:6px 16px;border-radius:999px;font-family:'Orbitron',sans-serif;letter-spacing:2px;font-size:11px;color:var(--green);}
.mode-badge{display:inline-flex;align-items:center;gap:6px;background:var(--red-glow);border:1px solid var(--border);padding:4px 12px;border-radius:999px;font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);}
.roadmap{margin:48px 0}
.section-title{font-family:'Orbitron',sans-serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;}
.section-heading{font-family:'Orbitron',sans-serif;font-size:clamp(1.2rem,4vw,2rem);font-weight:900;margin-bottom:32px;color:var(--text)}
.section-heading span{color:var(--red)}
.timeline{position:relative;padding-left:32px}
.timeline::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--red),rgba(255,0,0,0.1))}
.version-card{position:relative;margin-bottom:16px;padding:20px 24px;border-radius:12px;background:var(--card);border:1px solid var(--border);transition:all .3s;}
.version-card::before{content:'';position:absolute;left:-37px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;border:2px solid var(--red);background:var(--bg);}
.version-card.active-v{border-color:var(--red);background:linear-gradient(135deg,rgba(255,0,0,0.05),var(--card))}
.version-card.active-v::before{background:var(--red);box-shadow:0 0 12px var(--red)}
.version-card.building{border-color:rgba(255,170,0,0.3)}
.version-card.building::before{background:var(--gold2);border-color:var(--gold2);box-shadow:0 0 12px rgba(255,170,0,0.5)}
.version-card.locked{opacity:.6}
.version-card.locked::before{background:var(--bg3);border-color:var(--text3)}
.version-card:hover:not(.active-v){transform:translateX(4px);border-color:rgba(255,0,0,0.4)}
.v-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.v-name{font-family:'Orbitron',sans-serif;font-weight:900;font-size:15px}
.v-badge{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;padding:3px 10px;border-radius:4px;font-weight:700}
.badge-live{background:rgba(0,255,136,0.15);color:var(--green);border:1px solid rgba(0,255,136,0.3)}
.badge-building{background:rgba(255,170,0,0.15);color:var(--gold2);border:1px solid rgba(255,170,0,0.3)}
.badge-soon{background:rgba(90,90,114,0.3);color:var(--text3);border:1px solid rgba(90,90,114,0.3)}
.v-desc{font-size:13px;color:var(--text2);line-height:1.5}
.v-features{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.v-tag{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg4);color:var(--text3);font-family:'JetBrains Mono',monospace}
.v-waitlist{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.btn-waitlist{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;padding:7px 16px;border-radius:6px;cursor:pointer;transition:all .2s;background:transparent;border:1px solid var(--red);color:var(--red);}
.btn-waitlist:hover:not(:disabled){background:var(--red-glow);transform:translateY(-1px)}
.btn-waitlist:disabled{cursor:not-allowed;opacity:.7}
.btn-waitlist.joined{border-color:var(--green);color:var(--green)}
.btn-waitlist-reset{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;padding:5px 10px;border-radius:6px;cursor:pointer;transition:all .2s;background:transparent;border:1px solid rgba(90,90,114,0.5);color:var(--text3);display:none;}
.btn-waitlist-reset:hover{border-color:var(--red);color:var(--red)}
.btn-waitlist-reset.visible{display:inline-flex;align-items:center;gap:4px}
.wl-count{font-size:12px;color:var(--text3)}
.footer-bar{text-align:center;padding:32px 24px;color:var(--text3);font-size:13px;border-top:1px solid var(--border2);margin-top:48px;}
.footer-bar a{color:var(--red);text-decoration:none}
.connect-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:88px}
.connect-box{width:100%;max-width:520px;animation:fadeUp .5s ease both}
.connect-tabs{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:10px;margin-bottom:24px}
.ctab{flex:1;text-align:center;padding:10px;cursor:pointer;border-radius:8px;font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text2);transition:all .2s;border:none;background:transparent}
.ctab.active{background:var(--red);color:#000;font-weight:700}
.qr-wrap{background:var(--bg3);border-radius:12px;padding:20px;text-align:center;position:relative;overflow:hidden;border:1px solid var(--border)}
.qr-wrap img{width:100%;max-width:260px;border-radius:8px;display:block;margin:0 auto}
.qr-scan-line{position:absolute;left:10%;right:10%;height:2px;background:linear-gradient(90deg,transparent,var(--red),transparent);animation:scanline 3s linear infinite;}
.pair-input{width:100%;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:15px;margin-bottom:12px;outline:none;transition:border-color .2s;}
.pair-input:focus{border-color:var(--red);box-shadow:0 0 0 3px rgba(255,0,0,0.1)}
.code-display{background:var(--bg3);border:1px solid rgba(255,0,0,0.4);border-radius:12px;padding:28px;text-align:center;margin:16px 0;}
.code-digits{font-family:'Orbitron',sans-serif;font-size:42px;font-weight:900;letter-spacing:10px;color:var(--red);text-shadow:0 0 20px rgba(255,0,0,0.5);animation:glow 2s ease-in-out infinite;}
.code-timer{color:var(--text2);font-size:13px;margin-top:8px;font-family:'JetBrains Mono',monospace}
.step-list{list-style:none;margin-top:16px}
.step-list li{padding:10px 0;border-bottom:1px solid var(--border2);font-size:13px;color:var(--text2);display:flex;align-items:center;gap:10px;}
.step-list li:last-child{border-bottom:none}
.step-num{width:22px;height:22px;border-radius:50%;background:var(--red);color:#000;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.err-box{background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:12px 16px;color:var(--red);font-size:13px;margin:8px 0;display:none}
.ok-box{background:rgba(0,255,136,0.07);border:1px solid rgba(0,255,136,0.25);border-radius:8px;padding:12px 16px;color:var(--green);font-size:13px;margin:8px 0;display:none}
.starting-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:88px}
.loader-ring{width:80px;height:80px;margin:0 auto 24px;position:relative}
.loader-ring::before,.loader-ring::after{content:'';position:absolute;inset:0;border-radius:50%;border:3px solid transparent}
.loader-ring::before{border-top-color:var(--red);border-right-color:var(--red);animation:spin .8s linear infinite}
.loader-ring::after{border-bottom-color:rgba(255,0,0,0.2);border-left-color:rgba(255,0,0,0.2)}
.loading-dots::after{content:'';animation:dots 1.5s steps(4,end) infinite}
</style></head>`;
}

// ============================================================
//   CONNECTED DASHBOARD HTML
// ============================================================
function connectedHTML() {
  const up = botStatus.uptime;
  const h = Math.floor(up / 3600);
  const m = Math.floor((up % 3600) / 60);
  const s = up % 60;

  // Build server-side waitlist counts for each version — AYOCODES
  const wlCounts = {};
  ["v2", "v3", "v4", "v5", "v6"].forEach((v) => {
    wlCounts[v] = waitlistStore.has(v) ? waitlistStore.get(v).size : 0;
  });

  return (
    sharedHead("AYOBOT v1 — Dashboard") +
    `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div style="display:flex;align-items:center;gap:16px">
    <div class="mode-badge">⚡ ${(ENV.BOT_MODE || "public").toUpperCase()}</div>
    <div class="nav-status"><div class="dot" id="navdot"></div><span id="navtxt">LIVE</span></div>
  </div>
</nav>
<div class="main">
  <div class="hero">
    <div class="hero-eyebrow">⚡ WhatsApp Automation Suite</div>
    <h1 class="hero-title">
      <span class="line1">AYOBOT</span>
      <span class="line2">COMMAND CENTER</span>
    </h1>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:16px;animation:fadeUp .6s .3s ease both">
      <div class="status-live"><div class="dot"></div>SYSTEM ONLINE</div>
    </div>
  </div>

  <div class="owner-card gold-glow">
    <div class="owner-avatar">👑</div>
    <div class="owner-info">
      <div class="owner-name" id="oName">${botOwnerName || "Owner"}</div>
      <div class="owner-phone" id="oPhone">+${botOwnerPhone || "—"}</div>
    </div>
    <div class="owner-badge">BOT OWNER</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card red-glow">
      <div class="stat-icon">💬</div>
      <div class="stat-val" id="sMsg">${botStatus.messageCount}</div>
      <div class="stat-label">Messages</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⚡</div>
      <div class="stat-val" id="sCmd" style="color:var(--gold)">${botStatus.commandCount || 0}</div>
      <div class="stat-label">Commands</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⏱️</div>
      <div class="stat-val" id="sUp" style="font-size:22px;color:var(--green)">${h}h ${m}m ${s}s</div>
      <div class="stat-label">Uptime</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🤖</div>
      <div class="stat-val" style="font-size:18px;color:var(--text)">${ENV.BOT_MODE.toUpperCase()}</div>
      <div class="stat-label">Mode</div>
    </div>
  </div>

  <div class="panels">
    <div class="panel">
      <div class="panel-title">Bot Information</div>
      <div class="info-row"><span class="key">📱 Number</span><span class="val">${botStatus.botNumber || "—"}</span></div>
      <div class="info-row"><span class="key">👤 Name</span><span class="val">${botStatus.botName || "—"}</span></div>
      <div class="info-row"><span class="key">⚡ Prefix</span><span class="val">${ENV.PREFIX}</span></div>
      <div class="info-row"><span class="key">🔐 Auth</span><span class="val">${botStatus.authMethod || "session"}</span></div>
      <div class="info-row"><span class="key">📦 Version</span><span class="val">v${ENV.BOT_VERSION}</span></div>
    </div>
    <div class="panel">
      <div class="panel-title">System Status</div>
      <div class="info-row"><span class="key">🟢 Connection</span><span class="val" style="color:var(--green)" id="connStat">STABLE</span></div>
      <div class="info-row"><span class="key">🔧 Handlers</span><span class="val" style="color:var(--green)">ALL READY</span></div>
      <div class="info-row"><span class="key">🛡️ Anti-Delete</span><span class="val" style="color:var(--green)">ACTIVE</span></div>
      <div class="info-row"><span class="key">⏰ Reminders</span><span class="val" style="color:var(--green)">ACTIVE</span></div>
      <div class="info-row"><span class="key">🌐 Dashboard</span><span class="val" style="color:var(--green)">ONLINE</span></div>
    </div>
  </div>

  <div class="roadmap">
    <div class="section-title">// Product Roadmap</div>
    <h2 class="section-heading">VERSION <span>TIMELINE</span></h2>
    <div class="timeline">

      <div class="version-card active-v red-glow">
        <div class="v-header">
          <span class="v-name" style="color:var(--red)">🤖 AYOBOT <span style="color:var(--text)">v1</span></span>
          <span class="v-badge badge-live">🟢 LIVE NOW</span>
        </div>
        <div class="v-desc">The original. 45+ commands, AI integration, group management, media tools, full admin control. Built everything myself. — AYOCODES</div>
        <div class="v-features">
          <span class="v-tag">AI Chat</span><span class="v-tag">Group Mod</span><span class="v-tag">Media DL</span>
          <span class="v-tag">45+ Commands</span><span class="v-tag">Anti-Delete</span><span class="v-tag">Reminders</span><span class="v-tag">TTS</span>
        </div>
      </div>

      ${["v2", "v3", "v4", "v5", "v6"]
        .map((v, i) => {
          const info = [
            {
              label: "🔥 AYOBOT",
              cls: "building",
              badge: "badge-building",
              badgeText: "⚙️ IN DEVELOPMENT",
              desc: "Multi-device, upgraded AI with memory, custom plugin system, real-time analytics dashboard.",
              tags: ["Multi-Device", "AI Memory", "Plugin API", "Analytics"],
            },
            {
              label: "🚀 AYOBOT",
              cls: "locked",
              badge: "badge-soon",
              badgeText: "🔒 COMING SOON",
              desc: "Cross-platform — Telegram + WhatsApp unified. One bot, two platforms.",
              tags: ["Telegram", "Unified Panel", "Cross-Platform"],
            },
            {
              label: "💎 AYOBOT",
              cls: "locked",
              badge: "badge-soon",
              badgeText: "🔒 COMING SOON",
              desc: "Enterprise — multi-instance, white-label, SaaS dashboard for resellers.",
              tags: ["Multi-Instance", "White-Label", "SaaS"],
            },
            {
              label: "🧠 AYOBOT",
              cls: "locked",
              badge: "badge-soon",
              badgeText: "🔒 COMING SOON",
              desc: "Full AI autonomy — self-learning, predictive moderation, auto-content scheduling.",
              tags: ["Self-Learning", "Predictive AI", "Scheduling"],
            },
            {
              label: "🌐 AYOBOT",
              cls: "locked",
              badge: "badge-soon",
              badgeText: "🔒 COMING SOON",
              desc: "The endgame. Web3, NFT gating, crypto payments, DAO group governance.",
              tags: ["Web3", "NFT Gating", "Crypto Pay", "DAO"],
            },
          ][i];
          const count = wlCounts[v] || 0;
          return `
      <div class="version-card ${info.cls}">
        <div class="v-header">
          <span class="v-name" style="color:${info.cls === "building" ? "var(--gold2)" : "var(--text2)"}">
            ${info.label} <span style="color:var(--text)">${v.toUpperCase()}</span>
          </span>
          <span class="v-badge ${info.badge}">${info.badgeText}</span>
        </div>
        <div class="v-desc">${info.desc}</div>
        <div class="v-features">${info.tags.map((t) => `<span class="v-tag">${t}</span>`).join("")}</div>
        <div class="v-waitlist">
          <button class="btn-waitlist${count > 0 ? " joined" : ""}" id="wl-${v}"
            onclick="joinWaitlist('${v}',this)"
            ${count > 0 ? "disabled" : ""}>
            ${count > 0 ? "✅ JOINED" : "🔔 JOIN WAITLIST"}
          </button>
          <button class="btn-waitlist-reset${count > 0 ? " visible" : ""}" id="rst-${v}"
            onclick="resetWaitlist('${v}',this)"
            title="Leave waitlist">↩ LEAVE</button>
          <span class="wl-count" id="wc-${v}">${count > 0 ? count + " on waitlist" : ""}</span>
        </div>
      </div>`;
        })
        .join("")}

    </div>
  </div>

  <div class="footer-bar">
    Built by <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a>
    &nbsp;·&nbsp; AYOBOT v${ENV.BOT_VERSION} &nbsp;·&nbsp;
    <span id="footerTime"></span>
  </div>
</div>

<script>
// ── Stats refresh ──────────────────────────────────────────
function animCount(el,target,dur){
  const start=parseInt(el.textContent)||0;if(start===target)return;
  const step=Math.ceil(Math.abs(target-start)/(dur/16));let cur=start;
  const t=setInterval(()=>{
    cur=target>start?Math.min(cur+step,target):Math.max(cur-step,target);
    el.textContent=cur;if(cur===target)clearInterval(t);
  },16);
}
function updateStats(){
  fetch('/api/status').then(r=>r.json()).then(d=>{
    animCount(document.getElementById('sMsg'),d.messageCount||0,600);
    animCount(document.getElementById('sCmd'),d.commandCount||0,600);
    const up=d.uptime||0,h=Math.floor(up/3600),m=Math.floor((up%3600)/60),s=up%60;
    document.getElementById('sUp').textContent=h+'h '+m+'m '+s+'s';
    if(d.owner){
      if(d.owner.name)document.getElementById('oName').textContent=d.owner.name;
      if(d.owner.phone)document.getElementById('oPhone').textContent='+'+d.owner.phone;
    }
    const dot=document.getElementById('navdot'),txt=document.getElementById('navtxt');
    if(d.connected){dot.className='dot';txt.textContent='LIVE';}
    else{dot.className='dot offline';txt.textContent='OFFLINE';}
  }).catch(()=>{});
}
updateStats();
setInterval(updateStats,60000);

// ── Clock ──────────────────────────────────────────────────
function tick(){
  const n=new Date(),el=document.getElementById('footerTime');
  if(el)el.textContent=n.toLocaleTimeString('en-GB',{hour12:false})+' UTC';
}
tick();setInterval(tick,1000);

// ── Waitlist — join ────────────────────────────────────────
async function joinWaitlist(v, btn){
  if(btn.disabled) return;
  btn.disabled=true;
  btn.textContent='⏳ JOINING...';

  try{
    const r=await fetch('/api/waitlist-join',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({version:v})
    });
    const d=await r.json();

    if(d.success){
      btn.textContent='✅ JOINED';
      btn.classList.add('joined');
      const rst=document.getElementById('rst-'+v);
      if(rst)rst.classList.add('visible');
      const wc=document.getElementById('wc-'+v);
      if(wc)wc.textContent=d.count+' on waitlist';
      showToast('🔔 You\'re on the waitlist for '+v.toUpperCase()+'!');
    } else {
      btn.textContent='🔔 JOIN WAITLIST';
      btn.disabled=false;
      showToast('❌ '+(d.error||'Failed to join'),true);
    }
  }catch(e){
    btn.textContent='🔔 JOIN WAITLIST';
    btn.disabled=false;
    showToast('❌ Network error',true);
  }
}

// ── Waitlist — leave / reset — AYOCODES ───────────────────
async function resetWaitlist(v, rstBtn){
  rstBtn.textContent='⏳ LEAVING...';
  rstBtn.disabled=true;

  try{
    const r=await fetch('/api/waitlist-leave',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({version:v})
    });
    const d=await r.json();

    // Reset join button
    const btn=document.getElementById('wl-'+v);
    if(btn){
      btn.textContent='🔔 JOIN WAITLIST';
      btn.classList.remove('joined');
      btn.disabled=false;
    }
    // Hide reset button
    rstBtn.classList.remove('visible');
    rstBtn.textContent='↩ LEAVE';
    rstBtn.disabled=false;
    // Update count
    const wc=document.getElementById('wc-'+v);
    if(wc)wc.textContent=d.count>0?d.count+' on waitlist':'';
    showToast('✅ Left the '+v.toUpperCase()+' waitlist.');
  }catch(e){
    rstBtn.textContent='↩ LEAVE';
    rstBtn.disabled=false;
    showToast('❌ Network error',true);
  }
}

// ── Toast notification ─────────────────────────────────────
function showToast(msg,isErr=false){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText=
    'position:fixed;bottom:24px;right:24px;z-index:999;'+
    'background:'+(isErr?'rgba(255,0,0,0.15)':'rgba(0,255,136,0.1)')+';'+
    'border:1px solid '+(isErr?'rgba(255,0,0,0.4)':'rgba(0,255,136,0.3)')+';'+
    'color:'+(isErr?'var(--red)':'var(--green)')+';'+
    'padding:12px 20px;border-radius:10px;font-family:Orbitron,sans-serif;'+
    'font-size:12px;letter-spacing:1px;transition:opacity .4s;max-width:280px';
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3500);
}

// ── Load live waitlist counts on page open — AYOCODES ─────
(async()=>{
  try{
    const r=await fetch('/api/waitlist-counts');
    const d=await r.json();
    Object.entries(d).forEach(([v,count])=>{
      const wc=document.getElementById('wc-'+v);
      if(wc)wc.textContent=count>0?count+' on waitlist':'';
    });
  }catch(_){}
})();
</script>
</body></html>`
  );
}

// ============================================================
//   CONNECT PAGE HTML
// ============================================================
function connectHTML(qrUrl) {
  return (
    sharedHead("AYOBOT — Connect") +
    `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div class="nav-status"><div class="dot offline"></div><span>AWAITING CONNECTION</span></div>
</nav>
<div class="connect-wrap">
  <div class="connect-box">
    <div style="text-align:center;margin-bottom:28px">
      <div class="hero-eyebrow">Connect Your WhatsApp</div>
      <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;margin-top:8px">
        LINK <span style="color:var(--red)">DEVICE</span>
      </h1>
    </div>
    <div class="glass" style="padding:24px">
      <div class="connect-tabs">
        <button class="ctab active" onclick="showTab('qr',this)">📱 QR CODE</button>
        <button class="ctab" onclick="showTab('pair',this)">🔑 PAIRING CODE</button>
      </div>
      <div id="tab-qr">
        <div class="qr-wrap"><div class="qr-scan-line"></div><img src="${qrUrl}" alt="QR Code"></div>
        <ul class="step-list">
          <li><span class="step-num">1</span>Open WhatsApp on your phone</li>
          <li><span class="step-num">2</span>Tap <strong>Menu → Linked Devices</strong></li>
          <li><span class="step-num">3</span>Tap <strong>Link a Device</strong></li>
          <li><span class="step-num">4</span>Scan the QR above</li>
        </ul>
        <div style="margin-top:16px;padding:12px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:8px;font-size:13px;color:var(--gold)">
          👑 Scanner becomes <strong>BOT OWNER</strong> with full admin access
        </div>
      </div>
      <div id="tab-pair" style="display:none">
        <div id="pairForm">
          <label style="font-size:12px;color:var(--text2);letter-spacing:1px;display:block;margin-bottom:8px">
            PHONE NUMBER (with country code, no + or spaces)
          </label>
          <input class="pair-input" id="ph" type="tel" placeholder="e.g. 2349159180375" autocomplete="off">
          <button class="btn btn-red" style="width:100%;font-size:11px;letter-spacing:3px" onclick="requestCode()" id="pb">
            ⚡ REQUEST PAIRING CODE
          </button>
        </div>
        <div id="codeDisplay" style="display:none">
          <div class="code-display">
            <div style="font-size:11px;color:var(--text2);letter-spacing:2px;font-family:Orbitron,sans-serif;margin-bottom:12px">
              ENTER THIS IN WHATSAPP
            </div>
            <div class="code-digits" id="codeDigits">————</div>
            <div class="code-timer" id="codeTimer">⏳ Expires in 60s</div>
          </div>
          <div class="ok-box" id="okBox" style="display:block">
            ✅ Go to WhatsApp → Linked Devices → Link a Device → Enter the code above
          </div>
        </div>
        <div class="err-box" id="errBox"></div>
        <ul class="step-list" style="margin-top:16px">
          <li><span class="step-num">1</span>Enter phone with country code</li>
          <li><span class="step-num">2</span>Click Request — code appears above</li>
          <li><span class="step-num">3</span>WhatsApp → Linked Devices → Link a Device</li>
          <li><span class="step-num">4</span>Tap <strong>Link with phone number</strong> → Enter the 8-digit code</li>
        </ul>
      </div>
      <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border2)">
        <span style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace">
          ⏳ Auto-refreshes when connected · <span id="rc">60</span>s
        </span>
      </div>
    </div>
    <div class="footer-bar" style="margin-top:24px;border:none">
      <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a> · AYOBOT v${ENV.BOT_VERSION}
    </div>
  </div>
</div>
<script>
function showTab(id,el){
  document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));
  ['tab-qr','tab-pair'].forEach(t=>document.getElementById(t).style.display='none');
  el.classList.add('active');
  document.getElementById('tab-'+id).style.display='block';
}
async function requestCode(){
  const ph=document.getElementById('ph').value.trim();
  const pb=document.getElementById('pb');
  const err=document.getElementById('errBox');
  err.style.display='none';
  if(!ph||!/^\\d{10,15}$/.test(ph)){
    err.textContent='⚠️ Enter a valid phone number (10-15 digits, no + or spaces)';
    err.style.display='block';return;
  }
  pb.disabled=true;pb.textContent='⏳ REQUESTING…';
  try{
    const r=await fetch('/api/request-pairing',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phoneNumber:ph})
    });
    const d=await r.json();
    if(d.success){
      document.getElementById('pairForm').style.display='none';
      document.getElementById('codeDisplay').style.display='block';
      document.getElementById('codeDigits').textContent=d.code;
      startCodeTimer(d.expiresIn||60);
    }else{
      err.textContent='❌ '+d.error;err.style.display='block';
      pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE';
    }
  }catch(e){
    err.textContent='❌ Network error: '+e.message;err.style.display='block';
    pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE';
  }
}
function startCodeTimer(seconds){
  let t=seconds;
  const el=document.getElementById('codeTimer');
  const tick=setInterval(()=>{
    t--;if(el)el.textContent='⏳ Expires in '+t+'s';
    if(t<=0){clearInterval(tick);location.reload();}
  },1000);
}
function pollConnection(){
  setInterval(()=>{
    fetch('/api/status').then(r=>r.json()).then(d=>{
      if(d.connected)location.reload();
    }).catch(()=>{});
  },60000);
}
pollConnection();
window.onload=function(){
  fetch('/api/pairing-status').then(r=>r.json()).then(d=>{
    if(d.hasCode){
      showTab('pair',document.querySelectorAll('.ctab')[1]);
      document.getElementById('pairForm').style.display='none';
      document.getElementById('codeDisplay').style.display='block';
      document.getElementById('codeDigits').textContent=d.code;
      startCodeTimer(d.expiresIn||60);
    }
  }).catch(()=>{});
  let rc=60;
  setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);
};
</script>
</body></html>`
  );
}

// ============================================================
//   STARTING PAGE HTML
// ============================================================
function startingHTML() {
  return (
    sharedHead("AYOBOT — Starting") +
    `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div class="nav-status">
    <div class="dot offline" style="animation:pulse 1s infinite"></div>
    <span style="color:var(--text3)">INITIALIZING</span>
  </div>
</nav>
<div class="starting-wrap">
  <div style="text-align:center;animation:fadeIn .6s ease">
    <div class="loader-ring"></div>
    <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;color:var(--red);text-shadow:0 0 30px rgba(255,0,0,0.4)">
      AYOBOT
    </h1>
    <p style="color:var(--text2);margin-top:8px;font-size:15px">
      System initializing<span class="loading-dots"></span>
    </p>
    <div style="margin-top:24px;padding:16px 24px;background:var(--card);border:1px solid var(--border);border-radius:10px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3);text-align:left;min-width:260px">
      <div style="color:var(--green);margin-bottom:4px">▶ Loading modules...</div>
      <div style="color:var(--text3)">▶ Connecting to WhatsApp...</div>
      <div style="color:var(--text3)">▶ Starting dashboard...</div>
    </div>
    <div style="margin-top:20px;font-size:12px;color:var(--text3)">
      Reloading in <span id="rc">60</span>s
    </div>
    <div class="footer-bar" style="margin-top:32px;border:none">
      <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a>
    </div>
  </div>
</div>
<script>
  let rc=60;
  setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);
</script>
</body></html>`
  );
}

// ============================================================
//   ADMIN LOGIN PAGE HTML
// ============================================================
function adminLoginHTML(error = "") {
  return (
    sharedHead("AYOBOT — Developer Access") +
    `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">ADMIN</span></div>
  <div class="nav-status"><div class="dot offline"></div><span style="color:var(--text3)">RESTRICTED</span></div>
</nav>
<div class="connect-wrap">
  <div class="connect-box" style="max-width:400px">
    <div style="text-align:center;margin-bottom:28px">
      <div class="hero-eyebrow">Developer Access Only</div>
      <h1 style="font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:900;margin-top:8px">
        ADMIN <span style="color:var(--red)">LOGIN</span>
      </h1>
    </div>
    <div class="glass" style="padding:28px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:36px">🔐</div>
        <div style="font-size:13px;color:var(--text2);margin-top:8px">Enter your AYOCODES_ADMIN_KEY</div>
      </div>
      ${error ? `<div style="background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:16px">❌ ${error}</div>` : ""}
      <form method="POST" action="/ayocodes-admin/login-post">
        <input type="password" name="password" class="pair-input" placeholder="Admin password"
          autocomplete="current-password" autofocus style="margin-bottom:16px">
        <button type="submit" class="btn btn-red" style="width:100%;font-size:11px;letter-spacing:3px">
          🔓 ENTER DASHBOARD
        </button>
      </form>
      <div style="margin-top:20px;text-align:center;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">
        Unauthorized access is logged and blocked.
      </div>
    </div>
  </div>
</div>
</body></html>`
  );
}

// ============================================================
//   ADMIN DASHBOARD HTML
// ============================================================
function adminDashboardHTML() {
  return (
    sharedHead("AYOBOT — Developer Control Panel") +
    `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">DEV PANEL</span></div>
  <div style="display:flex;align-items:center;gap:16px">
    <div id="globalStats" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2)">Loading...</div>
    <a href="/ayocodes-admin/logout" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);text-decoration:none;border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px">LOGOUT</a>
  </div>
</nav>
<div class="main">
  <div class="hero" style="padding:40px 20px 20px">
    <div class="hero-eyebrow">👑 AYOCODES — Full Control</div>
    <h1 class="hero-title" style="font-size:clamp(1.8rem,5vw,3rem)">
      <span class="line1">INSTANCE</span><span class="line2">MONITOR</span>
    </h1>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat-card red-glow"><div class="stat-icon">🌐</div><div class="stat-val" id="totalInstances">—</div><div class="stat-label">Total Bots</div></div>
    <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-val" id="onlineInstances" style="color:var(--green)">—</div><div class="stat-label">Online</div></div>
    <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-val" id="totalMessages" style="color:var(--gold)">—</div><div class="stat-label">Total Messages</div></div>
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-val" id="lastRefresh" style="font-size:14px;color:var(--text2)">—</div><div class="stat-label">Last Refresh</div></div>
  </div>
  <div style="margin:24px 0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <div class="section-title">// Live Instances</div>
        <div style="font-size:13px;color:var(--text2)">Refreshes every 60s. Stale = no ping for 60s.</div>
      </div>
      <button class="btn btn-red" onclick="loadInstances()" style="padding:8px 18px;font-size:10px">↻ REFRESH</button>
    </div>
    <div id="instanceTable">
      <div style="text-align:center;padding:60px;color:var(--text3);font-family:'JetBrains Mono',monospace">Loading instances...</div>
    </div>
  </div>
  <div class="footer-bar">
    AYOBOT Developer Panel &nbsp;·&nbsp; Only AYOCODES sees this &nbsp;·&nbsp; <span id="footerClock"></span>
  </div>
</div>
<div id="modalOverlay" style="display:none;min-height:100vh;background:rgba(0,0,0,0.7);position:absolute;top:0;left:0;right:0;z-index:200;align-items:flex-start;justify-content:center;padding-top:120px">
  <div style="background:var(--card);border:1px solid rgba(255,0,0,0.4);border-radius:16px;padding:32px;max-width:440px;width:90%;text-align:center">
    <div style="font-size:36px;margin-bottom:12px">⚠️</div>
    <h2 style="font-family:'Orbitron',sans-serif;font-size:16px;color:var(--red);margin-bottom:8px">CONFIRM DISCONNECT</h2>
    <p id="modalText" style="color:var(--text2);font-size:13px;margin-bottom:24px">This will wipe the session and force reconnect.</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button class="btn" style="background:var(--bg3);color:var(--text2);border:1px solid var(--border)" onclick="closeModal()">CANCEL</button>
      <button class="btn btn-red" id="modalConfirm">DISCONNECT</button>
    </div>
  </div>
</div>
<style>
.inst-table{width:100%;border-collapse:collapse;font-size:13px}
.inst-table th{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border2)}
.inst-table td{padding:12px 14px;border-bottom:1px solid var(--border2);vertical-align:middle}
.inst-table tr:last-child td{border-bottom:none}
.inst-table tr:hover td{background:rgba(255,0,0,0.03)}
.online-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.25);color:var(--green);padding:3px 10px;border-radius:999px;font-size:11px;font-family:'Orbitron',sans-serif;letter-spacing:1px}
.offline-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,0,0,0.08);border:1px solid rgba(255,0,0,0.2);color:var(--red);padding:3px 10px;border-radius:999px;font-size:11px;font-family:'Orbitron',sans-serif;letter-spacing:1px}
.btn-disconnect{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;padding:6px 12px;border-radius:6px;cursor:pointer;background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);color:var(--red);transition:all .2s}
.btn-disconnect:hover{background:rgba(255,0,0,0.2);border-color:var(--red)}
.btn-disconnect:disabled{opacity:.4;cursor:not-allowed}
.mono{font-family:'JetBrains Mono',monospace}
</style>
<script>
let pendingDisconnect=null;
function closeModal(){document.getElementById('modalOverlay').style.display='none';pendingDisconnect=null;}
function confirmDisconnect(instanceId,instanceUrl,ownerPhone){
  pendingDisconnect={instanceId,instanceUrl};
  document.getElementById('modalText').textContent='Disconnect '+ownerPhone+' ('+instanceId+')? Their session will be wiped and the bot will restart.';
  document.getElementById('modalConfirm').onclick=executeDisconnect;
  document.getElementById('modalOverlay').style.display='flex';
}
async function executeDisconnect(){
  if(!pendingDisconnect)return;
  const{instanceId,instanceUrl}=pendingDisconnect;
  const btn=document.getElementById('modalConfirm');
  btn.disabled=true;btn.textContent='DISCONNECTING...';
  try{
    const r=await fetch('/ayocodes-admin/api/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instanceId,instanceUrl})});
    const d=await r.json();closeModal();
    if(d.ok){showAdminToast('✅ Disconnected '+instanceId);loadInstances();}
    else{showAdminToast('❌ Failed: '+(d.error||'Unknown error'),true);}
  }catch(e){showAdminToast('❌ Network error: '+e.message,true);closeModal();}
}
function showAdminToast(msg,isErr=false){
  const t=document.createElement('div');t.textContent=msg;
  t.style.cssText='position:fixed;bottom:24px;right:24px;z-index:999;background:'+(isErr?'rgba(255,0,0,0.15)':'rgba(0,255,136,0.1)')+';border:1px solid '+(isErr?'rgba(255,0,0,0.4)':'rgba(0,255,136,0.3)')+';color:'+(isErr?'var(--red)':'var(--green)')+';padding:12px 20px;border-radius:10px;font-family:Orbitron,sans-serif;font-size:12px;letter-spacing:1px;transition:opacity .4s';
  document.body.appendChild(t);setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3500);
}
function fmtUptime(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h+'h '+m+'m '+sec+'s';}
function fmtAgo(s){if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';return Math.floor(s/3600)+'h ago';}
async function loadInstances(){
  try{
    const r=await fetch('/ayocodes-admin/api/instances');
    const d=await r.json();
    document.getElementById('totalInstances').textContent=d.total;
    document.getElementById('onlineInstances').textContent=d.online;
    document.getElementById('totalMessages').textContent=d.instances.reduce((acc,i)=>acc+(i.messageCount||0),0).toLocaleString();
    document.getElementById('lastRefresh').textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});
    document.getElementById('globalStats').textContent=d.online+' online / '+d.total+' total';
    if(!d.instances.length){
      document.getElementById('instanceTable').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3);font-family:JetBrains Mono,monospace">No instances have pinged in yet.<br><span style="font-size:11px">Instances appear here once they connect and send a heartbeat.</span></div>';
      return;
    }
    let html='<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden"><table class="inst-table"><thead><tr><th>STATUS</th><th>OWNER</th><th>NUMBER</th><th>UPTIME</th><th>MSGS</th><th>VERSION</th><th>LAST PING</th><th>ACTION</th></tr></thead><tbody>';
    d.instances.forEach(inst=>{
      const statusBadge=inst.stale
        ?'<span class="offline-badge"><span style="width:6px;height:6px;border-radius:50%;background:var(--red);display:inline-block"></span>OFFLINE</span>'
        :'<span class="online-badge"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;animation:greenPulse 2s ease-in-out infinite"></span>LIVE</span>';
      const dashLink=inst.url?'<a href="'+inst.url+'" target="_blank" style="color:var(--text3);font-size:10px;margin-left:6px;font-family:JetBrains Mono,monospace">↗ open</a>':'';
      html+='<tr><td>'+statusBadge+'</td><td><span class="mono" style="color:var(--gold)">'+(inst.ownerName||'—')+'</span></td><td><span class="mono">+'+(inst.ownerPhone||inst.botNumber||'—')+'</span>'+dashLink+'</td><td><span class="mono" style="color:var(--green)">'+(inst.uptime?fmtUptime(inst.uptime):'—')+'</span></td><td><span class="mono">'+(inst.messageCount||0).toLocaleString()+'</span></td><td><span class="mono" style="color:var(--text2)">v'+(inst.version||'?')+'</span></td><td><span class="mono" style="color:var(--text3)">'+fmtAgo(inst.lastSeenAgo)+'</span></td><td><button class="btn-disconnect"'+(inst.stale?' disabled title="Already offline"':'')+' onclick="confirmDisconnect('+JSON.stringify(inst.instanceId)+','+JSON.stringify(inst.url||'')+','+JSON.stringify('+'+(inst.ownerPhone||inst.instanceId))+')">'+(inst.stale?'OFFLINE':'⚡ DISCONNECT')+'</button></td></tr>';
    });
    html+='</tbody></table></div>';
    document.getElementById('instanceTable').innerHTML=html;
  }catch(e){
    document.getElementById('instanceTable').innerHTML='<div style="text-align:center;padding:40px;color:var(--red)">Failed to load instances: '+e.message+'</div>';
  }
}
loadInstances();
setInterval(loadInstances,60000);
function tick(){const e=document.getElementById('footerClock');if(e)e.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})+' UTC';}
tick();setInterval(tick,1000);
</script>
</body></html>`
  );
}

// ============================================================
//   WEB DASHBOARD — API ROUTES
// ============================================================
function setupWebDashboard() {
  app.use(cookieMiddleware);

  app.get("/", (req, res) => {
    botStatus.uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
    if (botStatus.connected) return res.send(connectedHTML());
    if (currentQR)
      return QRCode.toDataURL(currentQR, (err, url) =>
        err ? res.send("QR error") : res.send(connectHTML(url)),
      );
    res.send(startingHTML());
  });

  app.post("/api/request-pairing", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.json({ success: false, error: "Phone number is required." });
    res.json(await requestPairingCode(phoneNumber));
  });

  app.get("/api/pairing-status", (req, res) => {
    res.json(getPairingStatus());
  });

  app.get("/api/status", (req, res) => {
    botStatus.uptime = Math.floor((Date.now() - botStatus.startTime) / 1000);
    res.json({
      ...botStatus,
      version: ENV.BOT_VERSION,
      owner: {
        set: botStatus.ownerSet,
        phone: botOwnerPhone,
        name: botOwnerName,
      },
    });
  });

  app.get("/health", (req, res) =>
    res.json({
      status: "ok",
      uptime: process.uptime(),
      connected: botStatus.connected,
    }),
  );

  app.get("/test", (req, res) =>
    res.json({
      connected: isConnected,
      botSelfJid,
      botOwnerJid,
      botOwnerPhone,
      messageCount,
      commandCount: botStatus.commandCount,
      handlersReady,
      pairingState: {
        ...pairingState,
        expiresAt: pairingState.expiresAt
          ? new Date(pairingState.expiresAt).toISOString()
          : null,
      },
      handlers: {
        commandHandler: !!commandHandler,
        antiDeleteHandler: !!antiDeleteHandler,
        groupHandler: !!groupHandler,
      },
    }),
  );

  // ── Waitlist counts (public) — AYOCODES ──────────────────
  app.get("/api/waitlist-counts", (req, res) => {
    const counts = {};
    ["v2", "v3", "v4", "v5", "v6"].forEach((v) => {
      counts[v] = waitlistStore.has(v) ? waitlistStore.get(v).size : 0;
    });
    res.json(counts);
  });

  // ── Waitlist join — AYOCODES ──────────────────────────────
  app.post("/api/waitlist-join", async (req, res) => {
    const { version } = req.body;
    if (!version)
      return res.json({ success: false, error: "version required" });

    const validVersions = ["v2", "v3", "v4", "v5", "v6"];
    if (!validVersions.includes(version))
      return res.json({ success: false, error: "Invalid version" });

    // Use IP as identifier so counts are real — AYOCODES
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (!waitlistStore.has(version)) waitlistStore.set(version, new Set());
    waitlistStore.get(version).add(ip);
    const count = waitlistStore.get(version).size;

    // Send WhatsApp DM if bot is connected — AYOCODES
    if (isConnected && currentSock && botOwnerJid) {
      const versionNames = {
        v2: "AYOBOT v2 — Multi-device + AI Memory",
        v3: "AYOBOT v3 — Telegram + WhatsApp unified",
        v4: "AYOBOT v4 — Enterprise / White-label",
        v5: "AYOBOT v5 — Full AI Autonomy",
        v6: "AYOBOT v6 — Web3 / DAO / Crypto",
      };
      try {
        await currentSock.sendMessage(botOwnerJid, {
          text:
            `🔔 *Waitlist Confirmed!*\n\n` +
            `You're officially on the waitlist for:\n*${versionNames[version]}*\n\n` +
            `When it drops, you'll be the first to know. Stay tuned 👀\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n— AYOCODES`,
        });
      } catch (_) {}
    }

    res.json({ success: true, count });
  });

  // ── Waitlist leave — AYOCODES ─────────────────────────────
  app.post("/api/waitlist-leave", (req, res) => {
    const { version } = req.body;
    if (!version)
      return res.json({ success: false, error: "version required" });

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (waitlistStore.has(version)) {
      waitlistStore.get(version).delete(ip);
    }
    const count = waitlistStore.has(version)
      ? waitlistStore.get(version).size
      : 0;
    res.json({ success: true, count });
  });

  app.post("/api/heartbeat", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY)
      return res.status(403).json({ error: "Central monitoring not enabled" });
    const d = req.body;
    if (!d?.instanceId)
      return res.status(400).json({ error: "instanceId required" });
    connectedInstances.set(d.instanceId, { ...d, lastSeen: Date.now() });
    res.json({ ok: true });
  });

  app.post("/api/force-disconnect", (req, res) => {
    const key = req.headers["x-admin-key"] || req.body?.adminKey;
    if (!ENV.AYOCODES_ADMIN_KEY || key !== ENV.AYOCODES_ADMIN_KEY)
      return res.status(401).json({ error: "Unauthorized" });
    log.warn("Force-disconnect triggered by developer.");
    res.json({ ok: true, message: "Disconnecting..." });
    setTimeout(() => {
      clearSession();
      resetBotOwner();
      if (currentSock) {
        try {
          connectionClosed = true;
          currentSock.end();
          currentSock.removeAllListeners();
        } catch (_) {}
        currentSock = null;
      }
      isConnected = botStatus.connected = false;
      setTimeout(startBot, 2000);
    }, 500);
  });

  app.get("/ayocodes-admin/login", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminLoginHTML());
  });

  app.post("/ayocodes-admin/login-post", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    const { password } = req.body;
    if (password !== ENV.AYOCODES_ADMIN_KEY)
      return res.send(adminLoginHTML("Wrong password — try again."));
    const token = makeToken();
    adminSessionTokens.add(token);
    res.setHeader(
      "Set-Cookie",
      `ayoAdminToken=${token}; HttpOnly; Path=/; Max-Age=43200`,
    );
    res.redirect("/ayocodes-admin");
  });

  app.get("/ayocodes-admin/logout", (req, res) => {
    const token = req.cookies?.ayoAdminToken;
    if (token) adminSessionTokens.delete(token);
    res.setHeader("Set-Cookie", "ayoAdminToken=; HttpOnly; Path=/; Max-Age=0");
    res.redirect("/ayocodes-admin/login");
  });

  app.get("/ayocodes-admin", requireAdminAuth, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminDashboardHTML());
  });

  app.get("/ayocodes-admin/api/instances", requireAdminAuth, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY)
      return res.status(403).json({ error: "Not enabled" });
    const now = Date.now();
    const list = Array.from(connectedInstances.values()).map((inst) => ({
      ...inst,
      stale: now - inst.lastSeen > 60000,
      lastSeenAgo: Math.floor((now - inst.lastSeen) / 1000),
    }));
    list.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? 1 : -1;
      return b.lastSeen - a.lastSeen;
    });
    res.json({
      instances: list,
      total: list.length,
      online: list.filter((i) => !i.stale).length,
    });
  });

  app.post(
    "/ayocodes-admin/api/disconnect",
    requireAdminAuth,
    async (req, res) => {
      if (!ENV.AYOCODES_ADMIN_KEY)
        return res.status(403).json({ error: "Not enabled" });
      const { instanceId, instanceUrl } = req.body;
      if (!instanceId)
        return res.status(400).json({ error: "instanceId required" });
      const myId = ENV.INSTANCE_ID || botOwnerPhone;
      if (instanceId === myId || !instanceUrl) {
        log.warn(`Admin disconnect: local instance (${instanceId})`);
        connectedInstances.delete(instanceId);
        res.json({ ok: true, local: true });
        setTimeout(() => {
          clearSession();
          resetBotOwner();
          if (currentSock) {
            try {
              connectionClosed = true;
              currentSock.end();
              currentSock.removeAllListeners();
            } catch (_) {}
            currentSock = null;
          }
          isConnected = botStatus.connected = false;
          setTimeout(startBot, 2000);
        }, 500);
        return;
      }
      try {
        const resp = await fetch(`${instanceUrl}/api/force-disconnect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": ENV.AYOCODES_ADMIN_KEY,
          },
          body: JSON.stringify({ adminKey: ENV.AYOCODES_ADMIN_KEY }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await resp.json();
        connectedInstances.delete(instanceId);
        log.warn(
          `Admin disconnect sent to ${instanceUrl}: ${JSON.stringify(data)}`,
        );
        res.json({ ok: true, remote: true, response: data });
      } catch (e) {
        log.err("Remote disconnect failed: " + e.message);
        res.status(500).json({ ok: false, error: e.message });
      }
    },
  );

  const PORT = ENV.PORT;
  app.listen(PORT, "0.0.0.0", () => {
    log.ok(`Dashboard → http://localhost:${PORT}`);
    if (ENV.AYOCODES_ADMIN_KEY)
      log.ok(`Admin panel → http://localhost:${PORT}/ayocodes-admin`);
    log.ok(
      `Public    → https://${process.env.RENDER_EXTERNAL_URL || "localhost:" + PORT}\n`,
    );
  });
}

// ============================================================
//   MESSAGE LISTENERS
// ============================================================
function attachMessageListeners(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    try {
      const msg = messages[0];
      if (!msg?.message) return;
      if (msg.key.remoteJid === "status@broadcast") return;
      const from = msg.key.remoteJid;
      if (!from) return;

      const isGroup = from.endsWith("@g.us");
      const fromMe = !!msg.key.fromMe;
      const m = msg.message;
      const messageText =
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        "";

      if (fromMe) {
        if (!messageText.trimStart().startsWith(ENV.PREFIX)) return;
      }

      const senderJid = isGroup ? msg.key.participant || from : from;
      const senderNumber = senderJid.split("@")[0].split(":")[0];

      if (messageText) {
        log.msg(
          `[${isGroup ? "GROUP" : "DM"}] From: ${senderNumber} — ` +
            `${messageText.substring(0, 60)}${messageText.length > 60 ? "…" : ""}`,
        );
      }

      const normSender = normalizePhone(senderNumber);
      const isBanned =
        bannedUsers.has(senderJid) ||
        bannedUsers.has(normSender) ||
        bannedUsers.has(`${normSender}@s.whatsapp.net`) ||
        (isGroup && (() => bannedUsers.has(`${from}_${normSender}`))());
      if (isBanned) {
        log.warn(`Blocked banned user: ${senderNumber}`);
        return;
      }

      messageCount++;
      botStatus.messageCount = messageCount;

      if (!botOwnerJid && !isGroup && messageText?.startsWith(ENV.PREFIX)) {
        log.warn(`No owner in DB — auto-setting ${senderNumber} as owner.`);
        setBotOwner(senderJid, senderNumber, "Owner");
      }

      if (!handlersReady || !commandHandler) {
        log.warn("Handlers not ready — message dropped.");
        return;
      }

      await commandHandler(msg, sock);
    } catch (e) {
      if (
        !e.message?.includes("Bad MAC") &&
        !e.message?.includes("Connection Closed")
      )
        log.err("Message handler error: " + e.message);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    if (!isConnected || !groupHandler) return;
    try {
      await groupHandler(update, sock);
    } catch (e) {
      if (!e.message?.includes("Bad MAC"))
        log.err("Group handler error: " + e.message);
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    if (!isConnected || !ENV.ANTI_DELETE_ENABLED || !antiDeleteHandler) return;
    for (const u of updates) {
      try {
        await antiDeleteHandler(u, sock);
      } catch (_) {}
    }
  });

  log.ok("Message listeners attached ✓");
}

// ============================================================
//   START BOT
// ============================================================
async function startBot() {
  try {
    if (isConnected) {
      log.ok("Already connected.");
      return;
    }
    if (connectionInProgress) {
      log.info("Connection in progress…");
      return;
    }

    if (currentSock) {
      try {
        connectionClosed = true;
        currentSock.end();
        currentSock.removeAllListeners();
      } catch (_) {}
      currentSock = null;
    }
    cleanup();

    connectionInProgress = true;
    connectionStartTime = Date.now();
    connectionClosed = false;
    connectionStable = false;

    console.log(`\n${C.cyan}╔${"═".repeat(58)}╗
║${C.bold}                    🚀 AYOBOT v1.0.0                      ${C.reset}${C.cyan}║
╠${"═".repeat(58)}╣
║  👑 Creator: AYOCODES${" ".repeat(35)}║
║  🤖 Mode: ${(ENV.BOT_MODE || "public").toUpperCase().padEnd(48)}║
║  ⚡ Status: CONNECTING...${" ".repeat(33)}║
╚${"═".repeat(58)}╝${C.reset}\n`);

    const credsPath = path.join(__dirname, "auth_info", "creds.json");
    hasValidSession = fs.existsSync(credsPath);
    log.info(
      hasValidSession
        ? "Existing session — reconnecting…"
        : "No session — QR/Pairing available on dashboard.",
    );

    const { version, isLatest } = await fetchLatestBaileysVersion();
    log.info(`WA v${version.join(".")} (latest: ${isLatest})`);

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      fireInitQueries: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 8000,
      maxMsgRetryCount: 3,
      retryRequestDelayMs: 500,
      emitOwnEvents: true,
      shouldIgnoreJid: (j) => isJidBroadcast(j),
      patchMessageBeforeSending: (msg) => {
        if (msg.buttonsMessage || msg.templateMessage || msg.listMessage) {
          msg = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...msg,
              },
            },
          };
        }
        return msg;
      },
    });

    currentSock = sock;
    loadDatabases();

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(async () => {
      if (!isConnected || connectionClosed) {
        clearInterval(pingInterval);
        pingInterval = null;
        return;
      }
      try {
        await sock.sendPresenceUpdate("available");
      } catch (_) {}
    }, 12000);
    setTimeout(async () => {
      try {
        await sock.sendPresenceUpdate("available");
      } catch (_) {}
    }, 2000);

    if (rateLimitCleanupInterval) clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = setInterval(cleanupRateLimits, 5 * 60 * 1000);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !hasValidSession && !qrGenerated && !isConnected) {
        qrGenerated = true;
        currentQR = qr;
        botStatus.authMethod = botStatus.authMethod || "qr";
        console.log("\n" + "═".repeat(52));
        log.info("Scan QR: WhatsApp → Linked Devices → Link a Device");
        console.log("═".repeat(52));
        QRCodeTerminal.generate(qr, { small: true });
        console.log(
          `\n${C.yellow}👑 Scanner becomes the BOT OWNER!${C.reset}\n`,
        );
      }

      if (connection === "open") {
        const connectTime = Date.now() - connectionStartTime;
        isConnected = true;
        connectionInProgress = false;
        reconnectAttempts = 0;
        authFailures = 0;
        qrGenerated = false;
        hasValidSession = true;
        connectionStable = true;
        currentQR = null;
        resetPairingState();

        await delay(1000);

        botSelfJid = sock.user?.id || null;
        const botNumber =
          (botSelfJid || "").split(":")[0].replace(/[^0-9]/g, "") || "Unknown";
        const rawName =
          sock.user?.name ||
          sock.user?.verifiedName ||
          sock.user?.notify ||
          sock.user?.pushName ||
          "";
        const userName = rawName && rawName !== botNumber ? rawName : null;

        if (!botOwnerJid) {
          loadBotOwner();
          if (!botOwnerJid && botNumber && botNumber !== "Unknown") {
            log.info("No owner in DB — setting connected account as owner.");
            setBotOwner(
              `${botNumber}@s.whatsapp.net`,
              botNumber,
              userName || "Owner",
            );
            if (!botStatus.authMethod) botStatus.authMethod = "session";
          }
        } else if (userName && botOwnerName === "Owner") {
          botOwnerName = userName;
          botStatus.botName = userName;
          saveBotOwner();
        }

        botStatus.connected = true;
        botStatus.botNumber = botNumber;
        botStatus.botName = userName || botOwnerName || botNumber;
        botStatus.messageCount = messageCount;

        const speed =
          connectTime < 10000
            ? "🟢 Fast"
            : connectTime < 20000
              ? "🟡 Normal"
              : "🔴 Slow";
        console.log("\n" + "═".repeat(52));
        log.ok(`CONNECTED in ${connectTime}ms`);
        console.log("═".repeat(52));
        console.log(`📱 Bot Number  : ${botNumber}`);
        console.log(`👤 Bot Name    : ${userName}`);
        console.log(`⚡ Speed       : ${speed}`);
        console.log(`🔐 Auth Method : ${botStatus.authMethod || "unknown"}`);
        console.log(`🤖 Bot JID     : ${botSelfJid}`);
        console.log(
          `👑 Owner       : ${botOwnerName || "Not set"} (${botOwnerPhone || "?"})`,
        );
        console.log("═".repeat(52) + "\n");

        await saveCreds();
        await loadAllHandlers();
        attachMessageListeners(sock);

        // ── Start reminder scheduler — AYOCODES
        await loadReminderScheduler(sock);

        loadAndDisplayFeatures()
          .then(() => {
            console.log("═".repeat(52));
            console.log("🧪 SELF-TEST:");
            console.log(`   ⚡ Prefix         : "${ENV.PREFIX}"`);
            console.log(`   🤖 Bot JID        : ${botSelfJid}`);
            console.log(`   👑 Owner JID      : ${botOwnerJid || "NOT SET"}`);
            console.log(`   👑 Owner Phone    : ${botOwnerPhone || "NOT SET"}`);
            console.log(
              `   🤖 Cmd Handler    : ${commandHandler ? "✅" : "❌"}`,
            );
            console.log(
              `   🗑️  AntiDel       : ${antiDeleteHandler ? "✅" : "❌"}`,
            );
            console.log(`   👥 Group Handler  : ${groupHandler ? "✅" : "❌"}`);
            console.log(`   ⏰ Reminders      : ✅`);
            console.log(`   📨 Listening      : ✅`);
            console.log("═".repeat(52));
            console.log(
              `${C.green}${C.bold}✨ AYOBOT fully running. Ctrl+C to stop.${C.reset}\n`,
            );
          })
          .catch((e) => log.warn("Feature display error: " + e.message));

        sendWelcomeMessage(sock, botNumber, userName, connectTime);
        startHeartbeat();
      }

      if (connection === "close" && !connectionClosed) {
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || "Unknown";
        isConnected = connectionStable = botStatus.connected = false;
        log.err(`Disconnected. Code: ${code} | ${reason}`);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        if (code === DisconnectReason.loggedOut) {
          clearSession();
          hasValidSession = false;
          qrGenerated = false;
          connectionInProgress = false;
          authFailures = 0;
          resetBotOwner();
          botStatus.authMethod = null;
          log.info("Logged out — restarting for fresh QR in 3s…");
          return setTimeout(startBot, 3000);
        }

        if ([401, 403, 405].includes(code)) {
          if (++authFailures >= MAX_AUTH_FAILURES) {
            clearSession();
            hasValidSession = false;
            qrGenerated = false;
            authFailures = 0;
            connectionInProgress = false;
            resetBotOwner();
            botStatus.authMethod = null;
            return setTimeout(startBot, 5000);
          }
        }

        if (code === DisconnectReason.restartRequired) {
          connectionInProgress = false;
          return setTimeout(startBot, 3000);
        }

        connectionInProgress = false;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delayMs = Math.min(5000 * ++reconnectAttempts, 30000);
          log.info(
            `Reconnecting in ${delayMs / 1000}s… (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(startBot, delayMs);
        } else {
          log.err("Max reconnect attempts reached — waiting 5 minutes.");
          reconnectAttempts = 0;
          reconnectTimeout = setTimeout(
            () => {
              log.info("Retrying…");
              startBot();
            },
            5 * 60 * 1000,
          );
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (error) {
    log.err("Fatal startBot error: " + error.message);
    connectionInProgress = isConnected = botStatus.connected = false;
    log.info("Retrying in 10s…");
    setTimeout(startBot, 10000);
  }
}

// ============================================================
//   STARTUP SEQUENCE
// ============================================================
console.log(
  `\n${C.bold}${C.cyan}🚀 Starting AYOBOT v1 by AYOCODES…${C.reset}\n`,
);
checkEnvVars();
checkFfmpeg();
setupWebDashboard();

function gracefulShutdown(sig) {
  console.log(`\n${C.red}🛑 ${sig} — Shutting down cleanly…${C.reset}`);
  connectionClosed = true;
  cleanup();
  saveDatabases();
  if (currentSock) {
    try {
      currentSock.end();
      currentSock.removeAllListeners();
    } catch (_) {}
  }
  console.error = originalConsoleError;
  process.exit(0);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("unhandledRejection", (e) => {
  if (!e?.message?.includes("Bad MAC"))
    log.warn("Unhandled rejection: " + (e?.message || e));
});
process.on("uncaughtException", (e) => {
  if (!e.message?.includes("Bad MAC"))
    log.err("Uncaught exception: " + e.message);
  saveDatabases();
});
process.on("exit", () => {
  console.error = originalConsoleError;
});

startBot();
