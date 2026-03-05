// index.js - AYOBOT v1 | Created by AYOCODES
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import dotenv from "dotenv";

import fs from "fs";
import NodeCache from "node-cache";
import path from "path";
import pino from "pino";
import QRCode from "qrcode-terminal";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== ENVIRONMENT VARIABLES ==========
export const ENV = {
  PREFIX: process.env.PREFIX || ".",
  BOT_NAME: process.env.BOT_NAME || "AYOBOT",
  BOT_VERSION: process.env.BOT_VERSION || "1.0.0",
  ADMIN: process.env.ADMIN,
  CO_DEVELOPER: process.env.CO_DEVELOPER || process.env.ADMIN,
  OPENWEATHER_KEY: process.env.OPENWEATHER_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  COINMARKETCAP_KEY: process.env.COINMARKETCAP_KEY,
  REMOVEBG_KEY: process.env.REMOVEBG_KEY,
  WELCOME_IMAGE_URL:
    process.env.WELCOME_IMAGE_URL ||
    "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
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
  AUTO_REPLY_ENABLED: process.env.AUTO_REPLY_ENABLED === "true",
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
};

// ========== HELPERS ==========
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== SEND MESSAGE HELPER ==========
export async function sendMsg(sock, jid, content, opts = {}) {
  try {
    return await sock.sendMessage(jid, content, { ...opts });
  } catch (error) {
    console.error("❌ Error sending message:", error.message);
    return null;
  }
}

// ========== CONSTANTS ==========
export const ADMIN_CACHE_TTL = 30000;
export const GROUP_META_TTL = 60000;
export const RATE_LIMIT_WINDOW = 2000;
export const MAX_COMMANDS_PER_WINDOW = 1;
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

// ========== NORMALIZE PHONE NUMBER ==========
function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/[^0-9]/g, "")
    .trim();
}

// ========== GLOBAL STATE ==========
export let messageCount = 0;
export let botStartTime = Date.now();
export const commandUsage = new Map();
export const commandRateLimit = new Map();
export const userCooldown = new Map();
export const groupWarnings = new Map();
export const bannedUsers = new Map();
export const groupSettings = new Map();

// Build authorized set from normalized numbers
const _adminPhone = normalizePhone(process.env.ADMIN);
const _codevPhone = normalizePhone(process.env.CO_DEVELOPER);

export const authorizedUsers = new Set(
  [
    _adminPhone ? `${_adminPhone}@s.whatsapp.net` : null,
    _adminPhone || null,
    _codevPhone ? `${_codevPhone}@s.whatsapp.net` : null,
    _codevPhone || null,
    _adminPhone ? `${_adminPhone}@lid` : null,
    _codevPhone ? `${_codevPhone}@lid` : null,
    "223175560437838@lid",
    "223175560437838",
    "223175560437838@s.whatsapp.net",
  ].filter(Boolean),
);

export const waitlistEntries = new Map();
export const deletedMessages = new Map();
export const userConversations = new Map();
export const inactivityTimers = new Map();
export const autoReplyEnabled = new Map();
export const spamTracker = new Map();
export const adminCache = new Map();
export const groupMetadataCache = new Map();
export const msgCache = new NodeCache({ stdTTL: 60 });

// ========== ADMIN / AUTH CHECKS ==========
export function isAdmin(userJid) {
  if (!userJid) return false;
  const phone = normalizePhone(userJid.split("@")[0]);
  const adminPhone = normalizePhone(ENV.ADMIN);
  const codevPhone = normalizePhone(ENV.CO_DEVELOPER);

  const adminNumbers = new Set(
    [
      adminPhone,
      adminPhone ? `${adminPhone}@s.whatsapp.net` : null,
      adminPhone ? `${adminPhone}@lid` : null,
      codevPhone,
      codevPhone ? `${codevPhone}@s.whatsapp.net` : null,
      codevPhone ? `${codevPhone}@lid` : null,
      "223175560437838",
      "223175560437838@s.whatsapp.net",
      "223175560437838@lid",
    ].filter(Boolean),
  );

  return adminNumbers.has(userJid) || adminNumbers.has(phone);
}

export function isAuthorized(userJid) {
  if (isAdmin(userJid)) return true;
  if (ENV.BOT_MODE === "public") return true;
  const phone = normalizePhone(userJid.split("@")[0]);
  return authorizedUsers.has(userJid) || authorizedUsers.has(phone);
}

// ========== DATABASE ==========
const DB_PATH = path.join(__dirname, "database");

export function loadDatabases() {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
  const files = {
    warnings: groupWarnings,
    bans: bannedUsers,
    settings: groupSettings,
  };
  for (const [name, map] of Object.entries(files)) {
    try {
      const fp = path.join(DB_PATH, `${name}.json`);
      if (fs.existsSync(fp)) {
        const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
        Object.entries(parsed).forEach(([k, v]) => map.set(k, v));
      }
    } catch (_) {}
  }
  console.log("✅ Databases loaded");
}

export function saveDatabases() {
  const files = {
    warnings: groupWarnings,
    bans: bannedUsers,
    settings: groupSettings,
  };
  for (const [name, map] of Object.entries(files)) {
    try {
      if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
      fs.writeFileSync(
        path.join(DB_PATH, `${name}.json`),
        JSON.stringify(Object.fromEntries(map), null, 2),
      );
    } catch (_) {}
  }
}

export const saveBannedUsers = saveDatabases;
export const saveWarnings = saveDatabases;
export const saveGroupSettings = saveDatabases;

// ========== LOGGER (fully silent) ==========
const logger = pino({ level: "silent" });

// Suppress the Bad MAC errors by overriding console.error temporarily
const originalConsoleError = console.error;
console.error = function (...args) {
  if (args[0] && typeof args[0] === "string" && args[0].includes("Bad MAC")) {
    return; // Suppress Bad MAC errors
  }
  if (
    args[0] &&
    args[0] instanceof Error &&
    args[0].message &&
    args[0].message.includes("Bad MAC")
  ) {
    return; // Suppress Bad MAC error objects
  }
  originalConsoleError.apply(console, args);
};

// ========== CONNECTION STATE ==========
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

// Handler references
let commandHandler = null;
let antiDeleteHandler = null;
let groupHandler = null;

// ========== CLEANUP ==========
function cleanup() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  connectionInProgress = false;
}

function clearSession() {
  try {
    if (fs.existsSync("auth_info")) {
      fs.rmSync("auth_info", { recursive: true, force: true });
      console.log("🗑️  Session cleared.");
    }
  } catch (e) {
    console.log("⚠️  Could not clear session:", e.message);
  }
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, timestamps] of commandRateLimit.entries()) {
    const filtered = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (!filtered.length) commandRateLimit.delete(key);
    else commandRateLimit.set(key, filtered);
  }
}

// ========== LOAD FEATURE MODULES ==========
async function loadAndDisplayFeatures() {
  console.log("\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
  console.log("┃           📦 LOADING ALL FEATURE MODULES            ┃");
  console.log("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n");

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

  let loaded = 0;
  let failed = 0;
  let totalFunctions = 0;

  for (const feature of features) {
    try {
      const mod = await import(feature.path);
      const count = Object.keys(mod).length;
      const names = Object.keys(mod)
        .filter((k) => typeof mod[k] === "function")
        .slice(0, 5)
        .join(", ");
      console.log(
        `✅ ${feature.emoji} ${feature.name.padEnd(18)} ➜ ${count} exports${
          names ? ` [${names}${count > 5 ? "..." : ""}]` : ""
        }`,
      );
      loaded++;
      totalFunctions += count;
    } catch (e) {
      console.log(
        `❌ ${feature.emoji} ${feature.name.padEnd(18)} ➜ ${e.message.substring(0, 55)}`,
      );
      failed++;
    }
  }

  console.log("\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
  console.log(
    `┃  📊 ${loaded} loaded | ${failed} failed | ${totalFunctions} total functions`.padEnd(
      56,
    ) + "┃",
  );
  console.log("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n");
}

// ========== LOAD HANDLERS ==========
async function loadAllHandlers() {
  try {
    const m = await import("./handlers/commandHandler.js");
    commandHandler = m.handleCommand;
    console.log("✅ Command handler loaded");
  } catch (e) {
    console.log("⚠️  Command handler error:", e.message);
  }

  try {
    const m = await import("./handlers/antiDelete.js");
    antiDeleteHandler = m.handleAntiDelete;
    console.log("✅ Anti-delete handler loaded");
  } catch (e) {
    console.log("⚠️  Anti-delete handler error:", e.message);
  }

  try {
    const m = await import("./commands/group/automation.js");
    groupHandler = m.handleGroupParticipant;
    console.log("✅ Group handler loaded");
  } catch (e) {
    console.log("⚠️  Group handler error:", e.message);
  }
}

// ========== SEND WELCOME MESSAGE ==========
async function sendWelcomeMessage(sock, botNumber, userName, connectTime) {
  await delay(8000);

  if (!ENV.ADMIN) return;

  const adminJid = `${normalizePhone(ENV.ADMIN)}@s.whatsapp.net`;
  const mem = process.memoryUsage();
  const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
  const speedLabel =
    connectTime < 10000
      ? "🟢 Fast"
      : connectTime < 20000
        ? "🟡 Normal"
        : "🔴 Slow";

  const caption =
    `╔══════════════════════════╗\n` +
    `║   🚀 *AYOBOT ONLINE* ✅  ║\n` +
    `╚══════════════════════════╝\n\n` +
    `📱 *Number:* ${botNumber}\n` +
    `👤 *Name:* ${userName}\n` +
    `✅ *Connected:* ${connectTime}ms (${speedLabel})\n` +
    `💾 *RAM:* ${usedMB}/${totalMB}MB\n` +
    `🤖 *Mode:* ${ENV.BOT_MODE}\n` +
    `👑 *Creator:* ${ENV.CREATOR_NAME}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 Type *${ENV.PREFIX}menu* for all commands`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!isConnected) {
      await delay(5000);
      continue;
    }
    try {
      await sendMsg(sock, adminJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
      });
      console.log("✅ Welcome message sent to admin");
      return;
    } catch (e) {
      console.log(`⚠️  Welcome attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) await delay(5000 * attempt);
    }
  }

  try {
    if (isConnected) {
      await sendMsg(sock, adminJid, { text: caption });
      console.log("✅ Welcome message sent (text fallback)");
    }
  } catch (_) {}
}

// ========== START BOT ==========
async function startBot() {
  try {
    if (isConnected) {
      console.log("✅ Already connected.");
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
    if (connectionInProgress) return;

    connectionInProgress = true;
    connectionStartTime = Date.now();
    connectionClosed = false;
    connectionStable = false;

    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    🚀 AYOBOT v1.0.0                      ║
╠══════════════════════════════════════════════════════════╣
║  👑 Creator: AYOCODES                                     ║
║  🤖 Mode: ${(ENV.BOT_MODE || "public").toUpperCase().padEnd(45)}║
║  ⚡ Status: CONNECTING...                                 ║
╚══════════════════════════════════════════════════════════╝
    `);

    const authPath = path.join(__dirname, "auth_info");
    const credsPath = path.join(authPath, "creds.json");
    hasValidSession = fs.existsSync(credsPath);

    console.log(
      hasValidSession
        ? "📁 Existing session found. Connecting...\n"
        : "🔄 No session found. QR will appear...\n",
    );

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📱 Using WA v${version.join(".")} (latest: ${isLatest})`);

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
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      patchMessageBeforeSending: (msg) => {
        const requiresPatch = !!(
          msg.buttonsMessage ||
          msg.templateMessage ||
          msg.listMessage
        );
        if (requiresPatch) {
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

    // ── KEEPALIVE PING ─────────────────────────────────────
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

    // ========== CONNECTION HANDLER ==========
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !hasValidSession && !qrGenerated && !isConnected) {
        qrGenerated = true;
        console.log("\n" + "═".repeat(52));
        console.log(
          "📱 Scan this QR in WhatsApp → Linked Devices → Link a Device",
        );
        console.log("═".repeat(52));
        QRCode.generate(qr, { small: true });
        console.log("\n⏳ Waiting for scan...\n");
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

        await delay(1500);

        const userName =
          sock.user?.name ||
          sock.user?.verifiedName ||
          sock.user?.notify ||
          sock.user?.id?.split(":")[0] ||
          "Unknown";

        const botNumber = sock.user?.id?.split(":")[0] || "Unknown";
        const speedLabel =
          connectTime < 10000
            ? "🟢 Fast"
            : connectTime < 20000
              ? "🟡 Normal"
              : "🔴 Slow";

        console.log("\n" + "═".repeat(52));
        console.log(`✅ CONNECTED in ${connectTime}ms`);
        console.log("═".repeat(52));
        console.log(`📱 Number : ${botNumber}`);
        console.log(`👤 Name   : ${userName}`);
        console.log(`⚡ Speed  : ${speedLabel}`);
        console.log("═".repeat(52) + "\n");

        await saveCreds();

        await loadAllHandlers();

        loadAndDisplayFeatures()
          .then(() => {
            console.log("✨ Bot is fully running. Press Ctrl+C to stop.\n");
          })
          .catch((e) => {
            console.log("⚠️  Feature display error:", e.message);
          });

        sendWelcomeMessage(sock, botNumber, userName, connectTime);
      }

      if (connection === "close" && !connectionClosed) {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason =
          lastDisconnect?.error?.message ||
          lastDisconnect?.error?.output?.payload?.error ||
          "Unknown reason";

        isConnected = false;
        connectionStable = false;

        console.log(`\n❌ Disconnected. Code: ${statusCode} | ${reason}`);

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("🔴 Logged out. Clearing session...");
          clearSession();
          hasValidSession = false;
          qrGenerated = false;
          connectionInProgress = false;
          authFailures = 0;
          console.log("🔄 Restarting for new QR in 3s...\n");
          setTimeout(startBot, 3000);
          return;
        }

        if ([401, 403, 405].includes(statusCode)) {
          authFailures++;
          console.log(`⚠️  Auth failure #${authFailures} (code ${statusCode})`);
          if (authFailures >= MAX_AUTH_FAILURES) {
            console.log("🗑️  Too many auth failures — clearing session...");
            clearSession();
            hasValidSession = false;
            qrGenerated = false;
            authFailures = 0;
            connectionInProgress = false;
            console.log("🔄 Restarting for fresh QR in 5s...\n");
            setTimeout(startBot, 5000);
            return;
          }
        }

        if (statusCode === DisconnectReason.restartRequired) {
          console.log("🔄 Restart required. Reconnecting in 3s...");
          connectionInProgress = false;
          setTimeout(startBot, 3000);
          return;
        }

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delayMs = Math.min(5000 * reconnectAttempts, 30000);
          console.log(
            `⏳ Reconnecting in ${delayMs / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          connectionInProgress = false;
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(startBot, delayMs);
        } else {
          console.log(
            "❌ Max reconnection attempts reached. Please restart manually.",
          );
          process.exit(1);
        }
      }
    });

    // ========== MESSAGE HANDLER ==========
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (!isConnected || type !== "notify") return;

      try {
        const msg = messages[0];
        if (!msg?.message) return;

        const from = msg.key.remoteJid;
        if (!from) return;
        if (from === "status@broadcast") return;

        const isGroup = from.endsWith("@g.us");

        if (msg.key.fromMe) {
          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";
          if (!text.trim().startsWith(ENV.PREFIX)) return;
        }

        const msgId = msg.key.id;
        if (msgCache.has(msgId)) return;
        msgCache.set(msgId, true);

        messageCount++;

        const senderJid = isGroup
          ? msg.key.participant || from
          : msg.key.fromMe
            ? `${normalizePhone(sock.user?.id?.split(":")[0] || "")}@s.whatsapp.net`
            : from;

        if (bannedUsers.has(senderJid)) return;

        if (commandHandler) {
          await commandHandler(msg, sock);
        }
      } catch (error) {
        // Suppress Bad MAC errors in message handler too
        if (!error.message?.includes("Bad MAC")) {
          console.error("❌ Message handler error:", error.message);
        }
      }
    });

    // ========== GROUP PARTICIPANT UPDATES ==========
    sock.ev.on("group-participants.update", async (update) => {
      if (!isConnected || !groupHandler) return;
      try {
        await groupHandler(update, sock);
      } catch (e) {
        if (!e.message?.includes("Bad MAC")) {
          console.error("❌ Group handler error:", e.message);
        }
      }
    });

    // ========== ANTI-DELETE ==========
    sock.ev.on("messages.update", async (updates) => {
      if (!isConnected || !ENV.ANTI_DELETE_ENABLED || !antiDeleteHandler)
        return;
      for (const update of updates) {
        try {
          await antiDeleteHandler(update, sock);
        } catch (_) {}
      }
    });

    // ========== SAVE CREDS ON CHANGE ==========
    sock.ev.on("creds.update", saveCreds);

    connectionInProgress = false;
  } catch (error) {
    console.error("❌ Fatal error in startBot:", error.message);
    cleanup();
    isConnected = false;
    console.log("🔄 Retrying in 10s...");
    setTimeout(startBot, 10000);
  }
}

// ========== STARTUP ==========
console.log("🚀 Starting AYOBOT...\n");

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  connectionClosed = true;
  cleanup();
  saveDatabases();
  if (currentSock) {
    try {
      currentSock.end();
      currentSock.removeAllListeners();
    } catch (_) {}
  }
  // Restore console.error
  console.error = originalConsoleError;
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received. Shutting down...");
  connectionClosed = true;
  cleanup();
  saveDatabases();
  if (currentSock) {
    try {
      currentSock.end();
      currentSock.removeAllListeners();
    } catch (_) {}
  }
  // Restore console.error
  console.error = originalConsoleError;
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  if (!error?.message?.includes("Bad MAC")) {
    console.error("⚠️  Unhandled Rejection:", error?.message || error);
  }
});

process.on("uncaughtException", (error) => {
  if (!error.message?.includes("Bad MAC")) {
    console.error("❌ Uncaught Exception:", error.message);
  }
  saveDatabases();
});

// Restore console.error on normal exit
process.on("exit", () => {
  console.error = originalConsoleError;
});

startBot();
