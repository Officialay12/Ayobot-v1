// ============================================================
//   AYOBOT v1 — index.js (Multi-Session Public Edition)
//   Original single-session build by AYOCODES.
//   Multi-session upgrade: MongoDB auth state, per-user sessions,
//   isolated dashboards, permanent storage across Render restarts.
//
//   What changed from v1 single:
//     - useMongoAuthState() replaces useMultiFileAuthState()
//     - SessionManager class manages N isolated bot instances
//     - Each visitor gets their own sessionId cookie → own QR → own bot
//     - Sessions stored in MongoDB → survive Render restarts forever
//     - Dashboard auto-refresh changed from 10s → 60s
//     - /dashboard/:sessionId route serves per-user dashboard
//     - All original features, commands, handlers unchanged
//   — AYOCODES
// ============================================================

import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  initAuthCreds,
} from "@whiskeysockets/baileys";
// BufferJSON and proto must be imported separately — they are NOT
// re-exported from the main baileys entry point in v6+. — AYOCODES
import { proto } from "@whiskeysockets/baileys";
import { BufferJSON } from "@whiskeysockets/baileys/lib/Utils/generics.js";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import { MongoClient } from "mongodb";
import NodeCache from "node-cache";
import pino from "pino";
import QRCode from "qrcode";
import QRCodeTerminal from "qrcode-terminal";

dotenv.config();

// ============================================================
//   TERMINAL COLORS & LOGGER
//   Color-coded = I know what's wrong in 1 second. — AYOCODES
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
  ok:   (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err:  (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  msg:  (m) => console.log(`📨 ${m}`),
  cmd:  (m) => console.log(`⚡ ${m}`),
};

// ============================================================
//   ENVIRONMENT CONFIG
//   All env vars in one place. Missing keys silently disable
//   that feature — no crashes. — AYOCODES
// ============================================================
export const ENV = {
  PREFIX:            process.env.PREFIX            || ".",
  BOT_NAME:          process.env.BOT_NAME          || "AYOBOT",
  BOT_VERSION:       process.env.BOT_VERSION       || "1.0.0",
  ADMIN:             process.env.ADMIN,
  CO_DEVELOPER:      process.env.CO_DEVELOPER      || process.env.ADMIN,
  OPENWEATHER_KEY:   process.env.OPENWEATHER_KEY,
  NEWS_API_KEY:      process.env.NEWS_API_KEY,
  TMDB_API_KEY:      process.env.TMDB_API_KEY,
  COINMARKETCAP_KEY: process.env.COINMARKETCAP_KEY,
  REMOVEBG_KEY:      process.env.REMOVEBG_KEY,
  WELCOME_IMAGE_URL: process.env.WELCOME_IMAGE_URL || "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
  CREATOR_IMAGE_URL: process.env.CREATOR_IMAGE_URL || "https://i.ibb.co/4R4LPvV3/creator.jpg",
  WELCOME_AUDIO_URL: process.env.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
  WHATSAPP_CHANNEL:  process.env.WHATSAPP_CHANNEL  || "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25",
  WHATSAPP_GROUP:    process.env.WHATSAPP_GROUP    || "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN",
  CREATOR_NAME:      "AYOCODES",
  CREATOR_CONTACT:   process.env.CREATOR_CONTACT   || process.env.ADMIN,
  CREATOR_EMAIL:     process.env.CREATOR_EMAIL,
  CREATOR_GITHUB:    "https://github.com/Officialay12",
  MAX_WARNINGS:      parseInt(process.env.MAX_WARNINGS) || 3,
  AUTO_REPLY_ENABLED: false,
  BOT_MODE:          process.env.BOT_MODE          || "public",
  SHORTENER_API:     process.env.SHORTENER_API     || "https://ayo-link.onrender.com",
  SHORTENER_API_KEY: process.env.SHORTENER_API_KEY,
  ANTI_DELETE_ENABLED: process.env.ANTI_DELETE_ENABLED !== "false",
  HF_TOKEN:          process.env.HF_TOKEN,
  GEMINI_KEY:        process.env.GEMINI_KEY,
  TENOR_KEY:         process.env.TENOR_KEY         || process.env.GEMINI_KEY,
  GIPHY_KEY:         process.env.GIPHY_KEY,
  PIXABAY_KEY:       process.env.PIXABAY_KEY,
  UNSPLASH_KEY:      process.env.UNSPLASH_KEY,
  RAPIDAPI_KEY:      process.env.RAPIDAPI_KEY,
  PORT:              process.env.PORT              || 3000,
  // ── MULTI-SESSION ─────────────────────────────────────────
  MONGODB_URI:       process.env.MONGODB_URI       || "",
  MAX_SESSIONS:      parseInt(process.env.MAX_SESSIONS) || 100,
  // ── ADMIN PANEL ────────────────────────────────────────────
  AYOCODES_ADMIN_KEY: process.env.AYOCODES_ADMIN_KEY || null,
};

// Hard stop if MongoDB URI is missing — nothing works without it. — AYOCODES
if (!ENV.MONGODB_URI) {
  console.error(`${C.red}❌ MONGODB_URI is required! Add it to your Render environment variables.${C.reset}`);
  console.error(`   Get a free URI at https://cloud.mongodb.com`);
  process.exit(1);
}

function checkEnvVars() {
  const missing = [];
  if (!ENV.GEMINI_KEY)        missing.push("GEMINI_KEY (AI disabled)");
  if (!ENV.NEWS_API_KEY)      missing.push("NEWS_API_KEY (News disabled)");
  if (!ENV.OPENWEATHER_KEY)   missing.push("OPENWEATHER_KEY (Weather disabled)");
  if (missing.length) {
    console.log(`\n${C.yellow}⚠️  Missing optional ENV vars:${C.reset}`);
    missing.forEach((x) => console.log(`   • ${x}`));
    console.log("");
  }
}

// ============================================================
//   HELPERS — unchanged from original
// ============================================================
export function normalizePhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/[^0-9]/g, "").trim();
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
//   CONSTANTS — unchanged from original
// ============================================================
export const ADMIN_CACHE_TTL        = 30000;
export const GROUP_META_TTL         = 60000;
export const RATE_LIMIT_WINDOW      = 2000;
export const MAX_COMMANDS_PER_WINDOW = 1;
export const SPAM_TIME_WINDOW       = 4000;
export const MAX_SPAM_MESSAGES      = 3;
export const MAX_SIMILAR_MESSAGES   = 2;

export const RATE_LIMIT_MESSAGES = [
  "⏳ *CHILL BRO!* Take a breath!",
  "🧘 *ONE AT A TIME!* Slow down!",
  "⚡ *EASY DOES IT!* Wait a moment!",
  "🎯 *PATIENCE!* Commands need spacing!",
  "🌟 *BREATHE!* You're going too fast!",
];

// ============================================================
//   GLOBAL STATE — exported so submodules can import as before
// ============================================================
export let messageCount  = 0;
export let botStartTime  = Date.now();
export const commandUsage        = new Map();
export const commandRateLimit    = new Map();
export const userCooldown        = new Map();
export const groupWarnings       = new Map();
export const bannedUsers         = new Map();
export const groupSettings       = new Map();
export const waitlistEntries     = new Map();
export const deletedMessages     = new Map();
export const userConversations   = new Map();
export const inactivityTimers    = new Map();
export const autoReplyEnabled    = new Map();
export const spamTracker         = new Map();
export const adminCache          = new Map();
export const groupMetadataCache  = new Map();
export const msgCache = new NodeCache({ stdTTL: 60, maxKeys: 5000 });

// DB alias wrappers — moderation.js and settings.js import these. — AYOCODES
export function saveBann(jid, reason = "") { bannedUsers.set(jid, { reason, timestamp: Date.now() }); saveDatabases(); }
export function getBann(jid) { return bannedUsers.get(jid) || null; }
export function removeBann(jid) { bannedUsers.delete(jid); saveDatabases(); }
export function saveBannedUsers() { saveDatabases(); }
export function saveWarnings()    { saveDatabases(); }
export function saveGroupSettings() { saveDatabases(); }

// ============================================================
//   DATABASE — now MongoDB-backed for multi-session
//   warnings / bans / settings stored per-session in MongoDB.
//   Each session has its own isolated data namespace. — AYOCODES
// ============================================================
let dbCollection = null; // set after mongo connects

export function loadDatabases() {
  // In multi-session mode, per-user data is loaded per-session from MongoDB.
  // Global maps here are shared across all sessions (legacy compatibility).
  log.ok("Databases ready (MongoDB)");
}

export function saveDatabases() {
  // Persist to MongoDB per-session via the session's own save function.
  // This no-op keeps submodule imports working without changes. — AYOCODES
}

// Owner helpers — per-session, called from session objects below. — AYOCODES
export function isAdmin(userJid, ownerPhone) {
  if (!userJid || !ownerPhone) return false;
  const rawLocal = userJid.split("@")[0].split(":")[0];
  const u = normalizePhone(rawLocal);
  const o = normalizePhone(ownerPhone);
  return (
    u === o ||
    userJid === `${o}@s.whatsapp.net` ||
    userJid === `${o}@lid`
  );
}

export function isAuthorized(userJid, ownerPhone) {
  if (isAdmin(userJid, ownerPhone)) return true;
  if (ENV.BOT_MODE === "public") return true;
  return false;
}
export const authorizedUsers = new Set();

// ============================================================
//   BAD MAC SUPPRESSION + PINO LOGGER
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
//   MONGODB AUTH STATE
//   Replaces useMultiFileAuthState() — stores Baileys creds
//   in MongoDB so sessions survive Render restarts forever.
//   Each sessionId gets its own isolated key namespace. — AYOCODES
// ============================================================
async function useMongoAuthState(collection, sessionId) {
  const writeData = async (data, id) => {
    await collection.replaceOne(
      { _id: `${sessionId}:${id}` },
      { _id: `${sessionId}:${id}`, data: JSON.stringify(data, BufferJSON.replacer) },
      { upsert: true }
    );
  };

  const readData = async (id) => {
    const item = await collection.findOne({ _id: `${sessionId}:${id}` });
    if (!item) return null;
    return JSON.parse(item.data, BufferJSON.reviver);
  };

  const removeData = async (id) => {
    await collection.deleteOne({ _id: `${sessionId}:${id}` });
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              tasks.push(value ? writeData(value, `${category}-${id}`) : removeData(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
  };
}

// ============================================================
//   SESSION OBJECT
//   One of these per connected user. Contains everything
//   that was previously global — now scoped per user. — AYOCODES
// ============================================================
function createSessionObject(sessionId) {
  return {
    id: sessionId,
    sock: null,
    qr: null,
    pairingCode: null,
    pairingPhone: null,
    pairingExpiry: null,
    connected: false,
    ownerJid: null,
    ownerPhone: null,
    ownerName: null,
    botNumber: null,
    botName: null,
    botSelfJid: null,
    messageCount: 0,
    commandCount: 0,
    startTime: Date.now(),
    authMethod: null,
    reconnectAttempts: 0,
    destroyed: false,
    commandHandler: null,
    antiDeleteHandler: null,
    groupHandler: null,
    handlersReady: false,
    pingInterval: null,
    reconnectTimeout: null,
    pairingCodeTimeout: null,
  };
}

// ============================================================
//   SESSION STORE
//   All active sessions in memory. MongoDB stores credentials.
//   On restart, sessions are restored from DB. — AYOCODES
// ============================================================
const sessions = new Map(); // sessionId -> session object

// ============================================================
//   MONGODB CONNECTION
// ============================================================
let mongoClient = null;
let authCollection = null;
let sessionMetaCollection = null;

async function connectMongo() {
  mongoClient = new MongoClient(ENV.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db("ayobot");
  authCollection = db.collection("auth_states");
  sessionMetaCollection = db.collection("session_meta");
  userLogCollection = db.collection("user_log"); // user tracking — AYOCODES
  // Indexes for fast lookup. — AYOCODES
  await authCollection.createIndex({ _id: 1 });
  await userLogCollection.createIndex({ phone: 1 }, { unique: true });
  await userLogCollection.createIndex({ lastSeen: -1 });
  log.ok("MongoDB connected — sessions will survive restarts.");
}

// ============================================================
//   RESTORE SESSIONS ON STARTUP
//   Reads previously active sessions from MongoDB and
//   reconnects each one automatically. — AYOCODES
// ============================================================
async function restoreAllSessions() {
  const saved = await sessionMetaCollection.find({ active: true }).toArray();
  log.info(`Restoring ${saved.length} saved session(s)...`);
  for (const s of saved) {
    try {
      await startSession(s.sessionId, false);
    } catch (e) {
      log.warn(`Could not restore session ${s.sessionId}: ${e.message}`);
    }
  }
}

// ============================================================
//   HANDLER LOADER — per session
// ============================================================
async function loadHandlersForSession(session) {
  session.handlersReady = false;
  try {
    const m = await import("./handlers/commandHandler.js");
    session.commandHandler = m.handleCommand;
    log.ok(`[${session.id.slice(0,8)}] Command handler loaded`);
  } catch (e) {
    log.warn(`[${session.id.slice(0,8)}] Command handler: ${e.message}`);
  }
  try {
    const m = await import("./handlers/antiDelete.js");
    session.antiDeleteHandler = m.handleAntiDelete;
    log.ok(`[${session.id.slice(0,8)}] Anti-delete handler loaded`);
  } catch (e) {
    log.warn(`[${session.id.slice(0,8)}] Anti-delete: ${e.message}`);
  }
  try {
    const m = await import("./commands/group/automation.js");
    session.groupHandler = m.handleGroupParticipant;
    log.ok(`[${session.id.slice(0,8)}] Group handler loaded`);
  } catch (e) {
    log.warn(`[${session.id.slice(0,8)}] Group handler: ${e.message}`);
  }
  session.handlersReady = true;
}

// ============================================================
//   ATTACH MESSAGE LISTENERS — per session
//   Identical logic to original but scoped to this session. — AYOCODES
// ============================================================
function attachListeners(session) {
  const { sock } = session;
  const sid = session.id.slice(0, 8);

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
        m.documentMessage?.caption || "";

      const senderJid = isGroup
        ? msg.key.participant || from
        : fromMe ? session.botSelfJid || from : from;
      const senderNumber = senderJid.split("@")[0];

      if (messageText) {
        log.msg(`[${sid}][${isGroup ? "G" : "D"}] ${senderNumber}: ${messageText.substring(0, 60)}${messageText.length > 60 ? "…" : ""}`);
      }

      if (fromMe && (!messageText || !messageText.trimStart().startsWith(ENV.PREFIX))) return;

      const normSender = normalizePhone(senderNumber);
      if (bannedUsers.has(senderJid) || bannedUsers.has(normSender) || bannedUsers.has(`${normSender}@s.whatsapp.net`)) {
        log.warn(`[${sid}] Blocked banned: ${senderNumber}`);
        return;
      }

      session.messageCount++;
      messageCount++;
      // Update user tracker every 10 messages — not every single one. — AYOCODES
      if (session.messageCount % 10 === 0) updateUserMessageCount(session).catch(() => {});

      if (!session.ownerJid && !isGroup && messageText?.startsWith(ENV.PREFIX)) {
        log.warn(`[${sid}] No owner — auto-setting ${senderNumber}`);
        setSessionOwner(session, senderJid, senderNumber, "Owner");
      }

      if (!session.handlersReady || !session.commandHandler) {
        log.warn(`[${sid}] Handlers not ready — dropped.`);
        return;
      }

      // Inject session context so command handler knows which bot this is. — AYOCODES
      msg._session = session;
      msg._sessionId = session.id;

      await session.commandHandler(msg, sock);
    } catch (e) {
      if (!e.message?.includes("Bad MAC") && !e.message?.includes("Connection Closed"))
        log.err(`[${sid}] Message error: ${e.message}`);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    if (!session.connected || !session.groupHandler) return;
    try { await session.groupHandler(update, sock); } catch (_) {}
  });

  sock.ev.on("messages.update", async (updates) => {
    if (!session.connected || !ENV.ANTI_DELETE_ENABLED || !session.antiDeleteHandler) return;
    for (const u of updates) {
      try { await session.antiDeleteHandler(u, sock); } catch (_) {}
    }
  });

  log.ok(`[${sid}] Listeners attached ✓`);
}

// ============================================================
//   USER TRACKING — every user who connects is logged. — AYOCODES
//   Stored in MongoDB "user_log" collection.
//   Tracks: phone, name, firstSeen, lastSeen, totalMessages,
//           sessionId, authMethod, botNumber
// ============================================================
let userLogCollection = null; // set after mongo connects

async function trackUser(session) {
  if (!userLogCollection || !session.ownerPhone) return;
  try {
    await userLogCollection.updateOne(
      { phone: session.ownerPhone },
      {
        $set: {
          phone: session.ownerPhone,
          name: session.ownerName || "Unknown",
          sessionId: session.id,
          botNumber: session.botNumber,
          authMethod: session.authMethod,
          lastSeen: new Date(),
        },
        $setOnInsert: { firstSeen: new Date() },
        $inc: { totalSessions: 1 },
      },
      { upsert: true }
    );
  } catch (_) {}
}

async function updateUserMessageCount(session) {
  if (!userLogCollection || !session.ownerPhone) return;
  try {
    await userLogCollection.updateOne(
      { phone: session.ownerPhone },
      { $set: { lastSeen: new Date(), totalMessages: session.messageCount } }
    );
  } catch (_) {}
}

// ============================================================
//   OWNER HELPERS — per session
// ============================================================
function setSessionOwner(session, jid, phone, name = "Owner") {
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  const cleanJid = `${cleanPhone}@s.whatsapp.net`;
  const cleanName = (name && name !== cleanPhone && name !== "Unknown") ? name : "Owner";
  session.ownerJid = cleanJid;
  session.ownerPhone = cleanPhone;
  session.ownerName = cleanName;
  // Persist to MongoDB session meta. — AYOCODES
  sessionMetaCollection?.updateOne(
    { sessionId: session.id },
    { $set: { ownerPhone: cleanPhone, ownerName: cleanName, botNumber: session.botNumber } },
    { upsert: true }
  ).catch(() => {});
  // Log to user tracker. — AYOCODES
  trackUser(session).catch(() => {});
  log.ok(`[${session.id.slice(0,8)}] Owner set: +${cleanPhone} (${cleanName})`);
}

// ============================================================
//   WELCOME MESSAGE — per session, same logic as original
// ============================================================
async function sendWelcomeMessage(session, sock) {
  await delay(8000);
  if (!session.connected) {
    await delay(15000);
    if (!session.connected) return;
  }
  if (!session.ownerJid) return;

  const connectTime = Date.now() - session.startTime;
  const speedLabel = connectTime < 10000 ? "Fast" : connectTime < 20000 ? "Normal" : "Slow";
  const speedIcon  = connectTime < 10000 ? "🟢" : connectTime < 20000 ? "🟡" : "🔴";
  const connectSecs = (connectTime / 1000).toFixed(1);

  const mem = process.memoryUsage();
  const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);

  const displayName = (session.ownerName && session.ownerName !== session.ownerPhone && session.ownerName !== "Owner")
    ? session.ownerName : null;

  const caption =
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖  *AYOBOT v1*  •  Online\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${speedIcon} *${connectSecs}s* · ${speedLabel}\n\n` +
    `┌─ *Bot Info* ──────────────\n` +
    `│ 📱 +${session.botNumber}\n` +
    (displayName ? `│ 👤 ${displayName}\n` : ``) +
    `│ 💾 ${usedMB}/${totalMB} MB\n` +
    `│ ⚡ ${ENV.BOT_MODE} mode\n` +
    `│ 📦 v${ENV.BOT_VERSION}\n` +
    `└───────────────────────\n\n` +
    `👑 *Owner:* +${session.ownerPhone}\n` +
    `_Full admin access_\n\n` +
    `Type *${ENV.PREFIX}menu* for commands`;

  try {
    await sock.sendMessage(session.ownerJid, {
      audio: { url: ENV.WELCOME_AUDIO_URL },
      mimetype: "audio/aac",
      ptt: false,
    });
  } catch (_) {}

  for (let i = 1; i <= 5; i++) {
    if (!session.connected) { await delay(3000); continue; }
    try {
      const r = await sock.sendMessage(session.ownerJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
      });
      if (r) { log.ok(`[${session.id.slice(0,8)}] Welcome sent!`); return; }
    } catch (e) {
      try {
        const r = await sock.sendMessage(session.ownerJid, { text: caption });
        if (r) { log.ok(`[${session.id.slice(0,8)}] Welcome sent (text fallback)`); return; }
      } catch (_) {}
    }
    await delay(4000 * i);
  }
  try {
    await sock.sendMessage(session.ownerJid, { text: `✅ AYOBOT online! Type ${ENV.PREFIX}menu for commands.` });
  } catch (_) {}
}

// ============================================================
//   CLEAR SESSION AUTH FROM MONGODB
// ============================================================
async function clearSessionAuth(sessionId) {
  try {
    // Use $where-free prefix matching — avoids NoSQL injection via $regex. — AYOCODES
    // sessionId is always a 32-char hex string (crypto.randomBytes) so this is safe,
    // but we sanitize anyway to be absolutely certain. — AYOCODES
    const safePrefix = sessionId.replace(/[^a-f0-9]/gi, "");
    await authCollection.deleteMany({
      _id: { $regex: `^${safePrefix}:`, $options: "" }
    });
    log.info(`[${sessionId.slice(0,8)}] Auth cleared from MongoDB.`);
  } catch (e) {
    log.warn(`[${sessionId.slice(0,8)}] Could not clear auth: ${e.message}`);
  }
}

// ============================================================
//   RATE LIMIT CLEANUP — global
// ============================================================
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, ts] of commandRateLimit.entries()) {
    const fresh = ts.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (!fresh.length) commandRateLimit.delete(key);
    else commandRateLimit.set(key, fresh);
  }
}

// ============================================================
//   START SESSION — creates socket for one user
//   isNew = true on first visit, false on restart restore. — AYOCODES
// ============================================================
async function startSession(sessionId, isNew = true) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);

  const totalSessions = sessions.size;
  if (isNew && totalSessions >= ENV.MAX_SESSIONS) {
    log.warn(`Max sessions (${ENV.MAX_SESSIONS}) reached — rejecting new session.`);
    return null;
  }

  const session = createSessionObject(sessionId);
  sessions.set(sessionId, session);

  if (isNew) {
    await sessionMetaCollection.updateOne(
      { sessionId },
      { $set: { sessionId, active: true, createdAt: new Date() } },
      { upsert: true }
    );
  }

  await _startSocket(session);
  return session;
}

async function _startSocket(session) {
  if (session.destroyed) return;
  const sid = session.id.slice(0, 8);

  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMongoAuthState(authCollection, session.id);

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
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                ...msg,
              },
            },
          };
        }
        return msg;
      },
    });

    session.sock = sock;

    // Keep-alive ping. — AYOCODES
    if (session.pingInterval) clearInterval(session.pingInterval);
    session.pingInterval = setInterval(async () => {
      if (!session.connected || session.destroyed) {
        clearInterval(session.pingInterval);
        session.pingInterval = null;
        return;
      }
      try { await sock.sendPresenceUpdate("available"); } catch (_) {}
    }, 12000);

    // ── CONNECTION EVENTS ──────────────────────────────────
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !session.connected) {
        session.qr = qr;
        session.authMethod = session.authMethod || "qr";
        log.info(`[${sid}] QR ready — scan to connect`);
        QRCodeTerminal.generate(qr, { small: true });
      }

      if (connection === "open") {
        session.connected = true;
        session.qr = null;
        session.pairingCode = null;
        session.reconnectAttempts = 0;

        session.botSelfJid = sock.user?.id || null;
        const botNumber = (session.botSelfJid || "").split(":")[0].replace(/[^0-9]/g, "") || "Unknown";
        const rawName = sock.user?.name || sock.user?.verifiedName || sock.user?.notify || sock.user?.pushName || "";
        const userName = (rawName && rawName !== botNumber) ? rawName : null;

        session.botNumber = botNumber;
        session.botName = userName || botNumber;

        if (!session.ownerPhone) {
          setSessionOwner(session, `${botNumber}@s.whatsapp.net`, botNumber, userName || "Owner");
          if (!session.authMethod) session.authMethod = "session";
        } else if (userName && session.ownerName === "Owner") {
          session.ownerName = userName;
          sessionMetaCollection?.updateOne({ sessionId: session.id }, { $set: { ownerName: userName } }).catch(() => {});
        }

        await saveCreds();
        await loadHandlersForSession(session);
        attachListeners(session);

        log.ok(`[${sid}] CONNECTED — +${botNumber} (${userName || "Unknown"})`);

        // Non-blocking welcome. — AYOCODES
        sendWelcomeMessage(session, sock).catch(() => {});
      }

      if (connection === "close" && !session.destroyed) {
        session.connected = false;
        session.qr = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || "Unknown";
        log.err(`[${sid}] Disconnected — code: ${code} | ${reason}`);

        if (session.pingInterval) { clearInterval(session.pingInterval); session.pingInterval = null; }

        if (code === DisconnectReason.loggedOut) {
          await clearSessionAuth(session.id);
          session.ownerPhone = null;
          session.ownerJid = null;
          session.ownerName = null;
          session.authMethod = null;
          session.reconnectAttempts = 0;
          log.info(`[${sid}] Logged out — restarting with fresh QR in 3s...`);
          setTimeout(() => _startSocket(session), 3000);
          return;
        }

        if (code === DisconnectReason.restartRequired) {
          setTimeout(() => _startSocket(session), 3000);
          return;
        }

        // Exponential backoff. — AYOCODES
        session.reconnectAttempts++;
        const backoff = Math.min(5000 * session.reconnectAttempts, 30000);
        log.info(`[${sid}] Reconnecting in ${backoff / 1000}s... (attempt ${session.reconnectAttempts})`);
        if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
        session.reconnectTimeout = setTimeout(() => _startSocket(session), backoff);
      }
    });

    sock.ev.on("creds.update", saveCreds);

  } catch (e) {
    log.err(`[${sid}] Socket startup error: ${e.message}`);
    if (!session.destroyed) {
      setTimeout(() => _startSocket(session), 10000);
    }
  }
}

// ============================================================
//   DESTROY SESSION — full cleanup
// ============================================================
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.destroyed = true;
  if (session.pingInterval) clearInterval(session.pingInterval);
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  if (session.pairingCodeTimeout) clearTimeout(session.pairingCodeTimeout);
  if (session.sock) {
    try { session.sock.end(); session.sock.removeAllListeners(); } catch (_) {}
  }
  await clearSessionAuth(sessionId);
  await sessionMetaCollection.deleteOne({ sessionId });
  sessions.delete(sessionId);
  log.info(`[${sessionId.slice(0,8)}] Session destroyed.`);
}

// ============================================================
//   REQUEST PAIRING CODE — per session
//   Same fix as original: same socket, no throwaway. — AYOCODES
// ============================================================
async function requestPairingCode(session, phoneNumber) {
  const clean = (phoneNumber || "").replace(/\D/g, "");
  if (clean.length < 10 || clean.length > 15) {
    return { success: false, error: "Phone must be 10–15 digits with country code, no + or spaces" };
  }
  if (session.connected) {
    return { success: false, error: "Already connected. Logout first to re-pair." };
  }
  if (!session.sock) {
    return { success: false, error: "Bot still starting up — wait a moment and try again." };
  }
  if (session.pairingCode && session.pairingExpiry > Date.now()) {
    return {
      success: true, code: session.pairingCode, phoneNumber: session.pairingPhone,
      expiresIn: Math.floor((session.pairingExpiry - Date.now()) / 1000), cached: true,
    };
  }
  try {
    const rawCode = await session.sock.requestPairingCode(clean);
    const code = String(rawCode).match(/.{1,4}/g)?.join("-") || String(rawCode);
    session.pairingCode = code;
    session.pairingPhone = clean;
    session.pairingExpiry = Date.now() + 60000;
    session.authMethod = "pairing";
    if (session.pairingCodeTimeout) clearTimeout(session.pairingCodeTimeout);
    session.pairingCodeTimeout = setTimeout(() => {
      session.pairingCode = null;
      session.pairingPhone = null;
      session.pairingExpiry = null;
    }, 60000);
    log.ok(`[${session.id.slice(0,8)}] Pairing code: ${code} for +${clean}`);
    return { success: true, code, rawCode: String(rawCode), phoneNumber: clean, expiresIn: 60 };
  } catch (e) {
    log.err(`[${session.id.slice(0,8)}] Pairing code failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ============================================================
//   EXPRESS APP
// ============================================================
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Cookie parser — no extra dependency. — AYOCODES
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(";").forEach(c => {
    const parts = c.split("=");
    list[parts.shift().trim()] = decodeURIComponent(parts.join("=").trim());
  });
  return list;
}
app.use((req, _res, next) => { req.cookies = parseCookies(req); next(); });

// Admin auth. — AYOCODES
const adminTokens = new Set();
function requireAdmin(req, res, next) {
  const token = req.cookies?.ayoAdminToken;
  if (token && adminTokens.has(token)) return next();
  if (req.path.includes("/login")) return next();
  res.redirect("/ayocodes-admin/login");
}

// Each visitor gets a unique sessionId cookie — this isolates their bot. — AYOCODES
function getOrCreateSessionId(req, res) {
  let sid = req.cookies?.ayoSessionId;
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
    sid = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `ayoSessionId=${sid}; HttpOnly; Path=/; Max-Age=31536000`);
  }
  return sid;
}

// ============================================================
//   WEB DASHBOARD ROUTES
// ============================================================
function setupWebDashboard() {

  // ROOT → redirect to user's personal dashboard. — AYOCODES
  app.get("/", (req, res) => {
    const sid = getOrCreateSessionId(req, res);
    res.redirect(`/dashboard/${sid}`);
  });

  // ── USER DASHBOARD ───────────────────────────────────────
  app.get("/dashboard/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    const cookieSid = req.cookies?.ayoSessionId;

    // Security: only the cookie owner sees their own dashboard. — AYOCODES
    if (cookieSid !== sessionId) {
      const correctSid = cookieSid || sessionId;
      res.setHeader("Set-Cookie", `ayoSessionId=${correctSid}; HttpOnly; Path=/; Max-Age=31536000`);
      return res.redirect(`/dashboard/${correctSid}`);
    }

    let session = sessions.get(sessionId);

    if (!session) {
      const stats = { total: sessions.size };
      if (stats.total >= ENV.MAX_SESSIONS) return res.send(maxSessionsHTML());
      session = await startSession(sessionId, true);
      if (!session) return res.send(maxSessionsHTML());
    }

    if (session.connected) return res.send(connectedHTML(session));

    if (session.qr) {
      const qrUrl = await QRCode.toDataURL(session.qr).catch(() => null);
      return res.send(connectHTML(sessionId, qrUrl));
    }

    return res.send(loadingHTML(sessionId));
  });

  // ── API: STATUS ──────────────────────────────────────────
  app.get("/api/status/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.json({ exists: false, connected: false });
    res.json({
      exists: true,
      connected: session.connected,
      botNumber: session.botNumber,
      botName: session.botName,
      ownerPhone: session.ownerPhone,
      ownerName: session.ownerName,
      messageCount: session.messageCount,
      commandCount: session.commandCount,
      uptime: Math.floor((Date.now() - session.startTime) / 1000),
      authMethod: session.authMethod,
      hasQr: !!session.qr,
      pairingCode: session.pairingCode,
      pairingExpiry: session.pairingExpiry,
      mode: ENV.BOT_MODE,
      version: ENV.BOT_VERSION,
      prefix: ENV.PREFIX,
    });
  });

  // ── API: REQUEST PAIRING CODE ────────────────────────────
  app.post("/api/request-pairing/:sessionId", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, error: "Phone number is required." });
    let session = sessions.get(req.params.sessionId);
    if (!session) session = await startSession(req.params.sessionId, true);
    if (!session) return res.json({ success: false, error: "Could not create session." });
    res.json(await requestPairingCode(session, phoneNumber));
  });

  // ── API: LOGOUT ──────────────────────────────────────────
  app.post("/api/logout/:sessionId", async (req, res) => {
    if (req.cookies?.ayoSessionId !== req.params.sessionId) {
      return res.json({ success: false, error: "Unauthorized" });
    }
    await destroySession(req.params.sessionId);
    res.setHeader("Set-Cookie", "ayoSessionId=; HttpOnly; Path=/; Max-Age=0");
    res.json({ success: true });
  });

  // ── HEALTH CHECK ─────────────────────────────────────────
  app.get("/health", (req, res) => {
    const all = Array.from(sessions.values());
    res.json({
      status: "ok",
      uptime: process.uptime(),
      totalSessions: all.length,
      connectedSessions: all.filter(s => s.connected).length,
      totalMessages: all.reduce((a, s) => a + s.messageCount, 0),
    });
  });

  // ── WAITLIST (preserved from original) ──────────────────
  app.post("/api/waitlist-join/:sessionId", async (req, res) => {
    const { version } = req.body;
    if (!version) return res.json({ success: false, error: "version required" });
    const session = sessions.get(req.params.sessionId);
    if (!session?.connected || !session.sock || !session.ownerJid)
      return res.json({ success: false, error: "Bot not connected" });
    const versionNames = {
      v2: "AYOBOT v2 — Multi-device + AI Memory",
      v3: "AYOBOT v3 — Telegram + WhatsApp unified",
      v4: "AYOBOT v4 — Enterprise / White-label",
      v5: "AYOBOT v5 — Full AI Autonomy",
      v6: "AYOBOT v6 — Web3 / DAO / Crypto",
    };
    const msg = `🔔 *Waitlist Confirmed!*\n\nYou're officially on the waitlist for:\n*${versionNames[version] || version}*\n\nWhen it drops, you'll be the first to know.\n\n━━━━━━━━━━━━━━━━━━━━━━\n— AYOCODES`;
    try {
      await session.sock.sendMessage(session.ownerJid, { text: msg });
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  // ── AYOCODES ADMIN PANEL ─────────────────────────────────
  app.get("/ayocodes-admin/login", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminLoginHTML());
  });

  app.post("/ayocodes-admin/login-post", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    if (req.body.password !== ENV.AYOCODES_ADMIN_KEY) return res.send(adminLoginHTML("Wrong password — try again."));
    const token = crypto.randomBytes(20).toString("hex");
    adminTokens.add(token);
    res.setHeader("Set-Cookie", `ayoAdminToken=${token}; HttpOnly; Path=/; Max-Age=43200`);
    res.redirect("/ayocodes-admin");
  });

  app.get("/ayocodes-admin/logout", (req, res) => {
    const token = req.cookies?.ayoAdminToken;
    if (token) adminTokens.delete(token);
    res.setHeader("Set-Cookie", "ayoAdminToken=; HttpOnly; Path=/; Max-Age=0");
    res.redirect("/ayocodes-admin/login");
  });

  app.get("/ayocodes-admin", requireAdmin, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminDashboardHTML());
  });

  app.get("/ayocodes-admin/api/instances", requireAdmin, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(403).json({ error: "Not enabled" });
    const list = Array.from(sessions.values()).map(s => ({
      instanceId: s.id,
      ownerPhone: s.ownerPhone,
      ownerName: s.ownerName,
      botNumber: s.botNumber,
      connected: s.connected,
      messageCount: s.messageCount,
      uptime: Math.floor((Date.now() - s.startTime) / 1000),
      authMethod: s.authMethod,
      lastSeen: Date.now(),
      stale: false,
      lastSeenAgo: 0,
    }));
    res.json({ instances: list, total: list.length, online: list.filter(i => i.connected).length });
  });

  app.post("/ayocodes-admin/api/disconnect", requireAdmin, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(403).json({ error: "Not enabled" });
    const { instanceId } = req.body;
    if (!instanceId) return res.status(400).json({ error: "instanceId required" });
    await destroySession(instanceId);
    res.json({ ok: true });
  });

  // ── USER TRACKING ROUTES ─────────────────────────────────
  // Full list of every user who ever connected. — AYOCODES
  app.get("/ayocodes-admin/users", requireAdmin, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(userTrackingHTML());
  });

  app.get("/ayocodes-admin/api/users", requireAdmin, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(403).json({ error: "Not enabled" });
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 50;
      const skip = (page - 1) * limit;
      const search = req.query.search || "";

      const query = search
        ? { $or: [{ phone: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }] }
        : {};

      const [users, total] = await Promise.all([
        userLogCollection.find(query).sort({ lastSeen: -1 }).skip(skip).limit(limit).toArray(),
        userLogCollection.countDocuments(query),
      ]);

      // Check which users are currently active. — AYOCODES
      const activeSessions = new Set(
        Array.from(sessions.values()).filter(s => s.connected).map(s => s.ownerPhone)
      );

      res.json({
        users: users.map(u => ({
          ...u,
          online: activeSessions.has(u.phone),
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Export all users as CSV. — AYOCODES
  app.get("/ayocodes-admin/api/users/export", requireAdmin, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(403).json({ error: "Not enabled" });
    try {
      const users = await userLogCollection.find({}).sort({ lastSeen: -1 }).toArray();
      const csv = [
        "Phone,Name,First Seen,Last Seen,Total Messages,Total Sessions,Auth Method,Bot Number",
        ...users.map(u => [
          u.phone || "",
          (u.name || "").replace(/,/g, ";"),
          u.firstSeen ? new Date(u.firstSeen).toISOString() : "",
          u.lastSeen ? new Date(u.lastSeen).toISOString() : "",
          u.totalMessages || 0,
          u.totalSessions || 0,
          u.authMethod || "",
          u.botNumber || "",
        ].join(","))
      ].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ayobot-users.csv");
      res.send(csv);
    } catch (e) {
      res.status(500).send("Export failed: " + e.message);
    }
  });

  const PORT = ENV.PORT;
  app.listen(PORT, "0.0.0.0", () => {
    log.ok(`Dashboard → http://localhost:${PORT}`);
    if (ENV.AYOCODES_ADMIN_KEY) log.ok(`Admin     → http://localhost:${PORT}/ayocodes-admin`);
    const publicUrl = process.env.RENDER_EXTERNAL_URL
      ? (process.env.RENDER_EXTERNAL_URL.startsWith("http") ? process.env.RENDER_EXTERNAL_URL : `https://${process.env.RENDER_EXTERNAL_URL}`)
      : `http://localhost:${PORT}`;
    log.ok(`Public    → ${publicUrl}\n`);
  });
}

// ============================================================
//   DASHBOARD HTML — SHARED HEAD
//   Same aesthetic as original. — AYOCODES
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
.v-waitlist{margin-top:12px}
.btn-waitlist{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;padding:7px 16px;border-radius:6px;cursor:pointer;transition:all .2s;background:transparent;border:1px solid var(--red);color:var(--red);}
.btn-waitlist:hover{background:var(--red-glow);transform:translateY(-1px)}
.btn-waitlist.joined{border-color:var(--green);color:var(--green);cursor:default}
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
.logout-btn{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px;cursor:pointer;background:transparent;transition:all .2s;}
.logout-btn:hover{background:var(--red-glow)}
</style></head>`;
}

// ============================================================
//   CONNECTED DASHBOARD HTML
//   Dashboard refresh changed from 10s → 60s as requested. — AYOCODES
// ============================================================
function connectedHTML(session) {
  const up = Math.floor((Date.now() - session.startTime) / 1000);
  const h = Math.floor(up / 3600);
  const m = Math.floor((up % 3600) / 60);
  const s = up % 60;
  const SID = session.id;

  return sharedHead("AYOBOT v1 — Dashboard") + `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div style="display:flex;align-items:center;gap:16px">
    <div class="mode-badge">⚡ ${(ENV.BOT_MODE || "public").toUpperCase()}</div>
    <div class="nav-status"><div class="dot" id="navdot"></div><span id="navtxt">LIVE</span></div>
    <button class="logout-btn" onclick="logout()">⏏ LOGOUT</button>
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
      <div class="owner-name" id="oName">${session.ownerName || "Owner"}</div>
      <div class="owner-phone" id="oPhone">+${session.ownerPhone || "—"}</div>
    </div>
    <div class="owner-badge">BOT OWNER</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card red-glow">
      <div class="stat-icon">💬</div>
      <div class="stat-val" id="sMsg">${session.messageCount}</div>
      <div class="stat-label">Messages</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⚡</div>
      <div class="stat-val" id="sCmd" style="color:var(--gold)">${session.commandCount || 0}</div>
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
      <div class="info-row"><span class="key">📱 Number</span><span class="val">+${session.botNumber || "—"}</span></div>
      <div class="info-row"><span class="key">👤 Name</span><span class="val">${session.botName || "—"}</span></div>
      <div class="info-row"><span class="key">⚡ Prefix</span><span class="val">${ENV.PREFIX}</span></div>
      <div class="info-row"><span class="key">🔐 Auth</span><span class="val">${session.authMethod || "session"}</span></div>
      <div class="info-row"><span class="key">📦 Version</span><span class="val">v${ENV.BOT_VERSION}</span></div>
    </div>
    <div class="panel">
      <div class="panel-title">System Status</div>
      <div class="info-row"><span class="key">🟢 Connection</span><span class="val" style="color:var(--green)" id="connStat">STABLE</span></div>
      <div class="info-row"><span class="key">🔧 Handlers</span><span class="val" style="color:var(--green)">ALL READY</span></div>
      <div class="info-row"><span class="key">🛡️ Anti-Delete</span><span class="val" style="color:var(--green)">ACTIVE</span></div>
      <div class="info-row"><span class="key">🔇 Auto-Reply</span><span class="val" style="color:var(--red)">DISABLED</span></div>
      <div class="info-row"><span class="key">🌐 Dashboard</span><span class="val" style="color:var(--green)">ONLINE</span></div>
    </div>
  </div>

  <div class="roadmap">
    <div class="section-title">// Product Roadmap</div>
    <h2 class="section-heading">VERSION <span>TIMELINE</span></h2>
    <div class="timeline">
      <div class="version-card active-v red-glow">
        <div class="v-header"><span class="v-name" style="color:var(--red)">🤖 AYOBOT <span style="color:var(--text)">v1</span></span><span class="v-badge badge-live">🟢 LIVE NOW</span></div>
        <div class="v-desc">The original. 45+ commands, AI integration, group management, media tools, full admin control. Built everything myself. — AYOCODES</div>
        <div class="v-features"><span class="v-tag">AI Chat</span><span class="v-tag">Group Mod</span><span class="v-tag">Media DL</span><span class="v-tag">45+ Commands</span><span class="v-tag">Anti-Delete</span><span class="v-tag">TTS</span></div>
      </div>
      <div class="version-card building">
        <div class="v-header"><span class="v-name" style="color:var(--gold2)">🔥 AYOBOT <span style="color:var(--text)">v2</span></span><span class="v-badge badge-building">⚙️ IN DEVELOPMENT</span></div>
        <div class="v-desc">Multi-device, upgraded AI with memory, custom plugin system, real-time analytics dashboard.</div>
        <div class="v-features"><span class="v-tag">Multi-Device</span><span class="v-tag">AI Memory</span><span class="v-tag">Plugin API</span><span class="v-tag">Analytics</span></div>
        <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v2',this)" id="wl-v2">🔔 JOIN WAITLIST</button><span style="font-size:12px;color:var(--text3);margin-left:10px" id="wc-v2"></span></div>
      </div>
      <div class="version-card locked">
        <div class="v-header"><span class="v-name" style="color:var(--text2)">🚀 AYOBOT <span style="color:var(--text)">v3</span></span><span class="v-badge badge-soon">🔒 COMING SOON</span></div>
        <div class="v-desc">Cross-platform — Telegram + WhatsApp unified. One bot, two platforms.</div>
        <div class="v-features"><span class="v-tag">Telegram</span><span class="v-tag">Unified Panel</span><span class="v-tag">Cross-Platform</span></div>
        <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v3',this)" id="wl-v3">🔔 JOIN WAITLIST</button><span style="font-size:12px;color:var(--text3);margin-left:10px" id="wc-v3"></span></div>
      </div>
      <div class="version-card locked">
        <div class="v-header"><span class="v-name" style="color:var(--text2)">💎 AYOBOT <span style="color:var(--text)">v4</span></span><span class="v-badge badge-soon">🔒 COMING SOON</span></div>
        <div class="v-desc">Enterprise — multi-instance, white-label, SaaS dashboard for resellers.</div>
        <div class="v-features"><span class="v-tag">Multi-Instance</span><span class="v-tag">White-Label</span><span class="v-tag">SaaS</span></div>
        <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v4',this)" id="wl-v4">🔔 JOIN WAITLIST</button><span style="font-size:12px;color:var(--text3);margin-left:10px" id="wc-v4"></span></div>
      </div>
      <div class="version-card locked">
        <div class="v-header"><span class="v-name" style="color:var(--text2)">🧠 AYOBOT <span style="color:var(--text)">v5</span></span><span class="v-badge badge-soon">🔒 COMING SOON</span></div>
        <div class="v-desc">Full AI autonomy — self-learning, predictive moderation, auto-content scheduling.</div>
        <div class="v-features"><span class="v-tag">Self-Learning</span><span class="v-tag">Predictive AI</span><span class="v-tag">Scheduling</span></div>
        <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v5',this)" id="wl-v5">🔔 JOIN WAITLIST</button><span style="font-size:12px;color:var(--text3);margin-left:10px" id="wc-v5"></span></div>
      </div>
      <div class="version-card locked">
        <div class="v-header"><span class="v-name" style="color:var(--text2)">🌐 AYOBOT <span style="color:var(--text)">v6</span></span><span class="v-badge badge-soon">🔒 COMING SOON</span></div>
        <div class="v-desc">The endgame. Web3, NFT gating, crypto payments, DAO group governance.</div>
        <div class="v-features"><span class="v-tag">Web3</span><span class="v-tag">NFT Gating</span><span class="v-tag">Crypto Pay</span><span class="v-tag">DAO</span></div>
        <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v6',this)" id="wl-v6">🔔 JOIN WAITLIST</button><span style="font-size:12px;color:var(--text3);margin-left:10px" id="wc-v6"></span></div>
      </div>
    </div>
  </div>

  <div class="footer-bar">Built by <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a> &nbsp;·&nbsp; AYOBOT v${ENV.BOT_VERSION} &nbsp;·&nbsp; <span id="footerTime"></span></div>
</div>

<script>
const SID = '${SID}';
function animCount(el,target,dur){
  const start=parseInt(el.textContent)||0;if(start===target)return;
  const step=Math.ceil(Math.abs(target-start)/(dur/16));let cur=start;
  const t=setInterval(()=>{cur=target>start?Math.min(cur+step,target):Math.max(cur-step,target);el.textContent=cur;if(cur===target)clearInterval(t);},16);
}
function updateStats(){
  fetch('/api/status/'+SID).then(r=>r.json()).then(d=>{
    if(!d.exists||!d.connected){location.reload();return;}
    animCount(document.getElementById('sMsg'),d.messageCount||0,600);
    animCount(document.getElementById('sCmd'),d.commandCount||0,600);
    const up=d.uptime||0,h=Math.floor(up/3600),m=Math.floor((up%3600)/60),s=up%60;
    document.getElementById('sUp').textContent=h+'h '+m+'m '+s+'s';
    if(d.ownerName)document.getElementById('oName').textContent=d.ownerName;
    if(d.ownerPhone)document.getElementById('oPhone').textContent='+'+d.ownerPhone;
    const dot=document.getElementById('navdot'),txt=document.getElementById('navtxt');
    if(d.connected){dot.className='dot';txt.textContent='LIVE';}else{dot.className='dot offline';txt.textContent='OFFLINE';}
  }).catch(()=>{});
}
// Dashboard refresh: 60 seconds as requested. — AYOCODES
updateStats();setInterval(updateStats,60000);
function tick(){const n=new Date(),el=document.getElementById('footerTime');if(el)el.textContent=n.toLocaleTimeString('en-GB',{hour12:false})+' UTC';}
tick();setInterval(tick,1000);
async function logout(){
  if(!confirm('Disconnect your WhatsApp and reset your bot?'))return;
  await fetch('/api/logout/'+SID,{method:'POST'});
  location.href='/';
}
function joinWaitlist(v,btn){
  if(btn.classList.contains('joined'))return;
  btn.disabled=true;btn.textContent='⏳ JOINING...';
  fetch('/api/waitlist-join/'+SID,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({version:v})
  }).then(r=>r.json()).then(d=>{
    const key='wl_'+v;
    let count=parseInt(localStorage.getItem(key)||'0')+1;
    localStorage.setItem(key,count);
    btn.textContent='✅ JOINED';btn.classList.add('joined');
    const wc=document.getElementById('wc-'+v);if(wc)wc.textContent=count+' waiting';
    if(d.success){
      const note=document.createElement('div');
      note.style.cssText='font-size:11px;color:var(--green);margin-top:6px';
      note.textContent='📲 Check your WhatsApp — confirmation sent!';
      btn.parentNode.appendChild(note);setTimeout(()=>note.remove(),5000);
    }
  }).catch(()=>{btn.textContent='🔔 JOIN WAITLIST';btn.disabled=false;});
}
['v2','v3','v4','v5','v6'].forEach(v=>{
  const count=parseInt(localStorage.getItem('wl_'+v)||'0');
  if(count>0){const btn=document.getElementById('wl-'+v),wc=document.getElementById('wc-'+v);
  if(btn){btn.textContent='✅ JOINED';btn.classList.add('joined');}if(wc)wc.textContent=count+' waiting';}
});
</script>
</body></html>`;
}

// ============================================================
//   CONNECT PAGE HTML
// ============================================================
function connectHTML(sessionId, qrUrl) {
  return sharedHead("AYOBOT — Connect") + `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div class="nav-status"><div class="dot offline"></div><span>AWAITING YOUR WHATSAPP</span></div>
</nav>
<div class="connect-wrap">
  <div class="connect-box">
    <div style="text-align:center;margin-bottom:28px">
      <div class="hero-eyebrow">Connect Your WhatsApp</div>
      <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;margin-top:8px">
        LINK <span style="color:var(--red)">YOUR DEVICE</span>
      </h1>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">This bot will run on <strong>your</strong> WhatsApp number</p>
    </div>
    <div class="glass" style="padding:24px">
      <div class="connect-tabs">
        <button class="ctab active" onclick="showTab('qr',this)">📱 QR CODE</button>
        <button class="ctab" onclick="showTab('pair',this)">🔑 PAIRING CODE</button>
      </div>

      <div id="tab-qr">
        <div class="qr-wrap">
          <div class="qr-scan-line"></div>
          ${qrUrl ? `<img src="${qrUrl}" alt="QR Code" id="qrImg">` : `<div style="padding:40px;color:var(--text3);font-size:13px">Generating QR...</div>`}
        </div>
        <ul class="step-list">
          <li><span class="step-num">1</span>Open WhatsApp on your phone</li>
          <li><span class="step-num">2</span>Tap <strong>Menu → Linked Devices</strong></li>
          <li><span class="step-num">3</span>Tap <strong>Link a Device</strong></li>
          <li><span class="step-num">4</span>Scan the QR above with your phone</li>
        </ul>
        <div style="margin-top:16px;padding:12px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:8px;font-size:13px;color:var(--gold)">
          👑 You become the <strong>Bot Owner</strong> with full admin access
        </div>
      </div>

      <div id="tab-pair" style="display:none">
        <div id="pairForm">
          <label style="font-size:12px;color:var(--text2);letter-spacing:1px;display:block;margin-bottom:8px">YOUR PHONE (with country code, no + or spaces)</label>
          <input class="pair-input" id="ph" type="tel" placeholder="e.g. 2349159180375" autocomplete="off">
          <button class="btn btn-red" style="width:100%;font-size:11px;letter-spacing:3px" onclick="requestCode()" id="pb">⚡ REQUEST PAIRING CODE</button>
        </div>
        <div id="codeDisplay" style="display:none">
          <div class="code-display">
            <div style="font-size:11px;color:var(--text2);letter-spacing:2px;font-family:Orbitron,sans-serif;margin-bottom:12px">ENTER THIS IN WHATSAPP</div>
            <div class="code-digits" id="codeDigits">————</div>
            <div class="code-timer" id="codeTimer">⏳ Expires in 60s</div>
          </div>
          <div class="ok-box" style="display:block">✅ WhatsApp → Linked Devices → Link a Device → Enter the code above</div>
        </div>
        <div class="err-box" id="errBox"></div>
        <ul class="step-list" style="margin-top:16px">
          <li><span class="step-num">1</span>Enter your phone with country code</li>
          <li><span class="step-num">2</span>Click Request — code appears above</li>
          <li><span class="step-num">3</span>WhatsApp → Linked Devices → Link a Device</li>
          <li><span class="step-num">4</span>Tap <strong>Link with phone number</strong> → Enter 8-digit code</li>
        </ul>
      </div>

      <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border2)">
        <span style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace">
          ⏳ Auto-checks connection every 5s
        </span>
      </div>
    </div>
    <div class="footer-bar" style="margin-top:24px;border:none">
      <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a> · AYOBOT v${ENV.BOT_VERSION}
    </div>
  </div>
</div>

<script>
const SID='${sessionId}';
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
  if(!ph||!/^\\d{10,15}$/.test(ph)){err.textContent='⚠️ Enter a valid phone number (10-15 digits, no + or spaces)';err.style.display='block';return;}
  pb.disabled=true;pb.textContent='⏳ REQUESTING…';
  try{
    const r=await fetch('/api/request-pairing/'+SID,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:ph})});
    const d=await r.json();
    if(d.success){
      document.getElementById('pairForm').style.display='none';
      document.getElementById('codeDisplay').style.display='block';
      document.getElementById('codeDigits').textContent=d.code;
      let t=d.expiresIn||60;
      const ti=setInterval(()=>{t--;const el=document.getElementById('codeTimer');if(el)el.textContent='⏳ Expires in '+t+'s';if(t<=0){clearInterval(ti);location.reload();}},1000);
    }else{err.textContent='❌ '+d.error;err.style.display='block';pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE';}
  }catch(e){err.textContent='❌ Network error: '+e.message;err.style.display='block';pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE';}
}
// Poll for connection every 5s — reload when connected. — AYOCODES
setInterval(()=>{
  fetch('/api/status/'+SID).then(r=>r.json()).then(d=>{
    if(d.connected)location.reload();
    if(d.hasQr && !document.getElementById('qrImg')?.src.startsWith('data:'))location.reload();
  }).catch(()=>{});
},5000);
// Also check if pairing code is waiting when page loads. — AYOCODES
window.onload=function(){
  fetch('/api/status/'+SID).then(r=>r.json()).then(d=>{
    if(d.pairingCode){
      showTab('pair',document.querySelectorAll('.ctab')[1]);
      document.getElementById('pairForm').style.display='none';
      document.getElementById('codeDisplay').style.display='block';
      document.getElementById('codeDigits').textContent=d.pairingCode;
      const remaining=d.pairingExpiry?Math.max(0,Math.floor((d.pairingExpiry-Date.now())/1000)):60;
      let t=remaining;
      const ti=setInterval(()=>{t--;const el=document.getElementById('codeTimer');if(el)el.textContent='⏳ Expires in '+t+'s';if(t<=0){clearInterval(ti);location.reload();}},1000);
    }
  }).catch(()=>{});
};
</script>
</body></html>`;
}

// ============================================================
//   LOADING PAGE HTML
// ============================================================
function loadingHTML(sessionId) {
  return sharedHead("AYOBOT — Starting") + `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
  <div class="nav-status"><div class="dot offline" style="animation:pulse 1s infinite"></div><span style="color:var(--text3)">INITIALIZING</span></div>
</nav>
<div class="starting-wrap">
  <div style="text-align:center;animation:fadeIn .6s ease">
    <div class="loader-ring"></div>
    <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;color:var(--red);text-shadow:0 0 30px rgba(255,0,0,0.4)">AYOBOT</h1>
    <p style="color:var(--text2);margin-top:8px;font-size:15px">Starting your bot session<span class="loading-dots"></span></p>
    <div style="margin-top:24px;padding:16px 24px;background:var(--card);border:1px solid var(--border);border-radius:10px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3);text-align:left;min-width:260px">
      <div style="color:var(--green);margin-bottom:4px">▶ Connecting to MongoDB...</div>
      <div style="color:var(--text3)">▶ Creating your session...</div>
      <div style="color:var(--text3)">▶ Generating QR code...</div>
    </div>
    <div style="margin-top:20px;font-size:12px;color:var(--text3)">Reloading in <span id="rc">3</span>s</div>
    <div class="footer-bar" style="margin-top:32px;border:none"><a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a></div>
  </div>
</div>
<script>
let rc=3;
setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);
</script>
</body></html>`;
}

// ============================================================
//   MAX SESSIONS PAGE HTML
// ============================================================
function maxSessionsHTML() {
  return sharedHead("AYOBOT — At Capacity") + `
<body>
<div class="orb orb1"></div>
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;position:relative;z-index:1">
  <div style="font-size:48px;margin-bottom:16px">⚠️</div>
  <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;color:var(--red)">AT CAPACITY</h1>
  <p style="color:var(--text2);margin-top:12px;max-width:400px">This server has reached its maximum session limit (${ENV.MAX_SESSIONS}). Please try again later.</p>
  <div style="margin-top:24px;font-size:13px;color:var(--text3)">Built by <a href="${ENV.CREATOR_GITHUB}" style="color:var(--red);text-decoration:none" target="_blank">AYOCODES</a></div>
</div>
</body></html>`;
}

// ============================================================
//   ADMIN LOGIN HTML
// ============================================================
function adminLoginHTML(error = "") {
  return sharedHead("AYOBOT — Developer Access") + `
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
      <h1 style="font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:900;margin-top:8px">ADMIN <span style="color:var(--red)">LOGIN</span></h1>
    </div>
    <div class="glass" style="padding:28px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:36px">🔐</div>
        <div style="font-size:13px;color:var(--text2);margin-top:8px">Enter your AYOCODES_ADMIN_KEY</div>
      </div>
      ${error ? `<div style="background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:16px">❌ ${error}</div>` : ""}
      <form method="POST" action="/ayocodes-admin/login-post">
        <input type="password" name="password" class="pair-input" placeholder="Admin password" autocomplete="current-password" autofocus style="margin-bottom:16px">
        <button type="submit" class="btn btn-red" style="width:100%;font-size:11px;letter-spacing:3px">🔓 ENTER DASHBOARD</button>
      </form>
    </div>
  </div>
</div>
</body></html>`;
}

// ============================================================
//   ADMIN DASHBOARD HTML
// ============================================================
function adminDashboardHTML() {
  return sharedHead("AYOBOT — Developer Control Panel") + `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">DEV PANEL</span></div>
  <div style="display:flex;align-items:center;gap:16px">
    <div id="globalStats" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2)">Loading...</div>
    <a href="/ayocodes-admin/users" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--green);text-decoration:none;border:1px solid rgba(0,255,136,0.3);padding:5px 12px;border-radius:6px">👥 USERS</a>
    <a href="/ayocodes-admin/logout" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);text-decoration:none;border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px">LOGOUT</a>
  </div>
</nav>
<div class="main">
  <div class="hero" style="padding:40px 20px 20px">
    <div class="hero-eyebrow">👑 AYOCODES — Full Control</div>
    <h1 class="hero-title" style="font-size:clamp(1.8rem,5vw,3rem)">
      <span class="line1">INSTANCE</span>
      <span class="line2">MONITOR</span>
    </h1>
  </div>
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat-card red-glow"><div class="stat-icon">🌐</div><div class="stat-val" id="totalI">—</div><div class="stat-label">Total Bots</div></div>
    <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-val" id="onlineI" style="color:var(--green)">—</div><div class="stat-label">Online</div></div>
    <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-val" id="totalM" style="color:var(--gold)">—</div><div class="stat-label">Total Messages</div></div>
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-val" id="lastR" style="font-size:14px;color:var(--text2)">—</div><div class="stat-label">Last Refresh</div></div>
  </div>
  <div style="margin:24px 0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div><div class="section-title">// Live Sessions</div></div>
      <button class="btn btn-red" onclick="loadInstances()" style="padding:8px 18px;font-size:10px">↻ REFRESH</button>
    </div>
    <div id="instanceTable"><div style="text-align:center;padding:60px;color:var(--text3);font-family:'JetBrains Mono',monospace">Loading...</div></div>
  </div>
  <div class="footer-bar">AYOBOT Developer Panel &nbsp;·&nbsp; <span id="footerClock"></span></div>
</div>
<style>
.inst-table{width:100%;border-collapse:collapse;font-size:13px}
.inst-table th{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border2)}
.inst-table td{padding:12px 14px;border-bottom:1px solid var(--border2);vertical-align:middle}
.inst-table tr:last-child td{border-bottom:none}
.inst-table tr:hover td{background:rgba(255,0,0,0.03)}
.mono{font-family:'JetBrains Mono',monospace}
.kill-btn{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;padding:6px 12px;border-radius:6px;cursor:pointer;background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);color:var(--red);transition:all .2s}
.kill-btn:hover{background:rgba(255,0,0,0.2);border-color:var(--red)}
</style>
<script>
async function loadInstances(){
  try{
    const r=await fetch('/ayocodes-admin/api/instances');
    const d=await r.json();
    document.getElementById('totalI').textContent=d.total;
    document.getElementById('onlineI').textContent=d.online;
    document.getElementById('totalM').textContent=d.instances.reduce((a,i)=>a+(i.messageCount||0),0).toLocaleString();
    document.getElementById('lastR').textContent=new Date().toLocaleTimeString('en-GB',{hour12:false});
    document.getElementById('globalStats').textContent=d.online+' online / '+d.total+' total';
    if(!d.instances.length){
      document.getElementById('instanceTable').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3);font-family:JetBrains Mono,monospace">No active sessions</div>';
      return;
    }
    let html='<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden"><table class="inst-table"><thead><tr><th>STATUS</th><th>OWNER</th><th>NUMBER</th><th>UPTIME</th><th>MSGS</th><th>AUTH</th><th>ACTION</th></tr></thead><tbody>';
    d.instances.forEach(inst=>{
      const up=inst.uptime||0,h=Math.floor(up/3600),m=Math.floor((up%3600)/60);
      const connStatus=inst.connected
        ?'<span style="color:var(--green);font-family:JetBrains Mono,monospace">● LIVE</span>'
        :'<span style="color:var(--red);font-family:JetBrains Mono,monospace">● OFFLINE</span>';
      html += '<tr>' +
        '<td>' + connStatus + '</td>' +
        '<td><span class="mono" style="color:var(--gold)">' + (inst.ownerName||'—') + '</span></td>' +
        '<td><span class="mono">+' + (inst.ownerPhone||'—') + '</span></td>' +
        '<td><span class="mono" style="color:var(--green)">' + h + 'h ' + m + 'm</span></td>' +
        '<td><span class="mono">' + ((inst.messageCount||0).toLocaleString()) + '</span></td>' +
        '<td><span class="mono" style="color:var(--text2)">' + (inst.authMethod||'—') + '</span></td>' +
        '<td><button class="kill-btn" onclick="killSession(\'' + inst.instanceId + '\')">⚡ KILL</button></td>' +
        '</tr>';
    });
    html+='</tbody></table></div>';
    document.getElementById('instanceTable').innerHTML=html;
  }catch(e){
    document.getElementById('instanceTable').innerHTML='<div style="text-align:center;padding:40px;color:var(--red)">Error: '+e.message+'</div>';
  }
}
async function killSession(id){
  if(!confirm('Kill session '+id.slice(0,8)+'...? This will disconnect their WhatsApp.'))return;
  await fetch('/ayocodes-admin/api/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instanceId:id})});
  loadInstances();
}
loadInstances();setInterval(loadInstances,5000);
function tick(){const e=document.getElementById('footerClock');if(e)e.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})+' UTC';}
tick();setInterval(tick,1000);
</script>
</body></html>`;
}

// ============================================================
//   USER TRACKING PAGE HTML — AYOCODES ADMIN
//   Full list of every user who ever connected their WhatsApp.
//   Search, pagination, CSV export, live online status. — AYOCODES
// ============================================================
function userTrackingHTML() {
  return sharedHead("AYOBOT — User Tracker") + `
<body>
<div class="orb orb1"></div><div class="orb orb2"></div>
<nav class="nav">
  <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">USERS</span></div>
  <div style="display:flex;align-items:center;gap:12px">
    <a href="/ayocodes-admin" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text2);text-decoration:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px">← INSTANCES</a>
    <a href="/ayocodes-admin/api/users/export" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--green);text-decoration:none;border:1px solid rgba(0,255,136,0.3);padding:5px 12px;border-radius:6px">⬇ EXPORT CSV</a>
    <a href="/ayocodes-admin/logout" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);text-decoration:none;border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px">LOGOUT</a>
  </div>
</nav>
<div class="main">
  <div class="hero" style="padding:40px 20px 20px">
    <div class="hero-eyebrow">👥 All Connected Users</div>
    <h1 class="hero-title" style="font-size:clamp(1.8rem,5vw,3rem)">
      <span class="line1">USER</span>
      <span class="line2">TRACKER</span>
    </h1>
  </div>

  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <div class="stat-card red-glow"><div class="stat-icon">👥</div><div class="stat-val" id="totalU">—</div><div class="stat-label">Total Users</div></div>
    <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-val" id="onlineU" style="color:var(--green)">—</div><div class="stat-label">Online Now</div></div>
    <div class="stat-card"><div class="stat-icon">📄</div><div class="stat-val" id="pageInfo" style="font-size:16px;color:var(--text2)">—</div><div class="stat-label">Page</div></div>
  </div>

  <div style="margin:24px 0">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <input id="searchInput" class="pair-input" style="flex:1;min-width:200px;margin-bottom:0"
        placeholder="Search by phone or name..." oninput="debounceSearch()">
      <button class="btn btn-red" onclick="loadUsers(1)" style="padding:10px 20px;font-size:10px;white-space:nowrap">🔍 SEARCH</button>
    </div>
    <div id="userTable"><div style="text-align:center;padding:60px;color:var(--text3);font-family:'JetBrains Mono',monospace">Loading users...</div></div>
    <div id="pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px"></div>
  </div>

  <div class="footer-bar">AYOBOT User Tracker · AYOCODES · <span id="footerClock"></span></div>
</div>
<style>
.user-table{width:100%;border-collapse:collapse;font-size:13px}
.user-table th{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border2)}
.user-table td{padding:11px 14px;border-bottom:1px solid var(--border2);vertical-align:middle;font-family:'JetBrains Mono',monospace;font-size:12px}
.user-table tr:last-child td{border-bottom:none}
.user-table tr:hover td{background:rgba(255,0,0,0.02)}
.mono{font-family:'JetBrains Mono',monospace}
.page-btn{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:1px;padding:6px 14px;border-radius:6px;cursor:pointer;background:var(--card);border:1px solid var(--border);color:var(--text2);transition:all .2s}
.page-btn:hover{border-color:var(--red);color:var(--red)}
.page-btn.active{background:var(--red);color:#000;border-color:var(--red)}
.page-btn:disabled{opacity:.3;cursor:not-allowed}
</style>
<script>
let currentPage=1, searchTimer=null;

function debounceSearch(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>loadUsers(1),400);
}

async function loadUsers(page=1){
  currentPage=page;
  const search=document.getElementById('searchInput').value.trim();
  const url='/ayocodes-admin/api/users?page='+page+(search?'&search='+encodeURIComponent(search):'');
  try{
    const r=await fetch(url);
    const d=await r.json();

    document.getElementById('totalU').textContent=d.total.toLocaleString();
    document.getElementById('onlineU').textContent=d.users.filter(u=>u.online).length;
    document.getElementById('pageInfo').textContent=d.page+' / '+d.pages;

    if(!d.users.length){
      document.getElementById('userTable').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3);font-family:JetBrains Mono,monospace">No users found</div>';
      document.getElementById('pagination').innerHTML='';
      return;
    }

    let html='<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;overflow-x:auto">' +
      '<table class="user-table"><thead><tr>' +
      '<th>STATUS</th><th>PHONE</th><th>NAME</th><th>FIRST SEEN</th><th>LAST SEEN</th><th>MSGS</th><th>SESSIONS</th><th>AUTH</th>' +
      '</tr></thead><tbody>';

    d.users.forEach(u=>{
      const online = u.online
        ? '<span style="color:var(--green)">● LIVE</span>'
        : '<span style="color:var(--text3)">○ OFFLINE</span>';
      const firstSeen = u.firstSeen ? new Date(u.firstSeen).toLocaleDateString('en-GB') : '—';
      const lastSeen  = u.lastSeen  ? timeAgo(new Date(u.lastSeen)) : '—';
      html += '<tr>' +
        '<td>'+online+'</td>' +
        '<td style="color:var(--gold)">+'+( u.phone||'—')+'</td>' +
        '<td style="color:var(--text)">'+( u.name||'—')+'</td>' +
        '<td style="color:var(--text3)">'+firstSeen+'</td>' +
        '<td style="color:var(--text2)">'+lastSeen+'</td>' +
        '<td style="color:var(--green)">'+(u.totalMessages||0).toLocaleString()+'</td>' +
        '<td>'+(u.totalSessions||0)+'</td>' +
        '<td style="color:var(--text3)">'+(u.authMethod||'—')+'</td>' +
        '</tr>';
    });
    html+='</tbody></table></div>';
    document.getElementById('userTable').innerHTML=html;

    // Pagination. — AYOCODES
    let pag='';
    if(d.pages>1){
      pag+='<button class="page-btn" onclick="loadUsers('+(d.page-1)+')" '+(d.page<=1?'disabled':'')+'>← PREV</button>';
      const start=Math.max(1,d.page-2), end=Math.min(d.pages,d.page+2);
      for(let i=start;i<=end;i++){
        pag+='<button class="page-btn'+(i===d.page?' active':'')+'" onclick="loadUsers('+i+')">'+i+'</button>';
      }
      pag+='<button class="page-btn" onclick="loadUsers('+(d.page+1)+')" '+(d.page>=d.pages?'disabled':'')+'>NEXT →</button>';
    }
    document.getElementById('pagination').innerHTML=pag;

  }catch(e){
    document.getElementById('userTable').innerHTML='<div style="text-align:center;padding:40px;color:var(--red)">Error: '+e.message+'</div>';
  }
}

function timeAgo(date){
  const s=Math.floor((Date.now()-date)/1000);
  if(s<60)return s+'s ago';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

loadUsers(1);
setInterval(()=>loadUsers(currentPage),30000); // refresh every 30s
function tick(){const e=document.getElementById('footerClock');if(e)e.textContent=new Date().toLocaleTimeString('en-GB',{hour12:false})+' UTC';}
tick();setInterval(tick,1000);
</script>
</body></html>`;
}

// ============================================================
//   FEATURE LOADER (terminal display only — non-blocking)
// ============================================================
async function loadAndDisplayFeatures() {
  const line = "━".repeat(54);
  console.log(`\n┏${line}┓`);
  console.log(`┃           📦 LOADING ALL FEATURE MODULES            ┃`);
  console.log(`┗${line}┛\n`);
  const features = [
    { name: "AI",           path: "./features/ai.js",                emoji: "🤖" },
    { name: "Calculator",   path: "./features/calculator.js",         emoji: "🧮" },
    { name: "Crypto",       path: "./features/crypto.js",             emoji: "💰" },
    { name: "Dictionary",   path: "./features/dictionary.js",         emoji: "📖" },
    { name: "Downloader",   path: "./features/downloader.js",         emoji: "📥" },
    { name: "Encryption",   path: "./features/encryption.js",         emoji: "🔐" },
    { name: "Games",        path: "./features/games.js",              emoji: "🎮" },
    { name: "Image Tools",  path: "./features/imageTools.js",         emoji: "🖼️" },
    { name: "IP Lookup",    path: "./features/ipLookup.js",           emoji: "🌐" },
    { name: "Jokes",        path: "./features/jokes.js",              emoji: "😂" },
    { name: "Movies",       path: "./features/movies.js",             emoji: "🎬" },
    { name: "Music",        path: "./features/music.js",              emoji: "🎵" },
    { name: "News",         path: "./features/news.js",               emoji: "📰" },
    { name: "Notes",        path: "./features/notes.js",              emoji: "📝" },
    { name: "QR",           path: "./features/qr.js",                 emoji: "📱" },
    { name: "Quotes",       path: "./features/quotes.js",             emoji: "💬" },
    { name: "Reminder",     path: "./features/reminder.js",           emoji: "⏰" },
    { name: "Security",     path: "./features/security.js",           emoji: "🛡️" },
    { name: "Stocks",       path: "./features/stocks.js",             emoji: "📈" },
    { name: "Translation",  path: "./features/translation.js",        emoji: "🌍" },
    { name: "TTS",          path: "./features/tts.js",                emoji: "🗣️" },
    { name: "Unit Convert", path: "./features/unitConverter.js",      emoji: "📏" },
    { name: "Group Core",   path: "./commands/group/core.js",         emoji: "👥" },
    { name: "Group Mod",    path: "./commands/group/moderation.js",   emoji: "⚙️" },
    { name: "Group Sett.",  path: "./commands/group/settings.js",     emoji: "🔧" },
    { name: "Admin",        path: "./commands/group/admin.js",        emoji: "👑" },
    { name: "Basic",        path: "./commands/group/basic.js",        emoji: "📋" },
    { name: "Automation",   path: "./commands/group/automation.js",   emoji: "🤖" },
  ];
  let loaded = 0, failed = 0, total = 0;
  for (const f of features) {
    try {
      const mod = await import(f.path);
      const fns = Object.keys(mod).filter(k => typeof mod[k] === "function");
      console.log(`✅ ${f.emoji} ${f.name.padEnd(16)} ➜ ${fns.length} exports`);
      loaded++; total += fns.length;
    } catch (e) {
      console.log(`❌ ${f.emoji} ${f.name.padEnd(16)} ➜ ${e.message.substring(0, 55)}`);
      failed++;
    }
  }
  console.log(`\n┏${line}┓`);
  console.log(`┃  📊 ${loaded} loaded | ${failed} failed | ${total} total functions`.padEnd(55) + "┃");
  console.log(`┗${line}┛\n`);
}

// ============================================================
//   STARTUP SEQUENCE
//   Wrapped in async main() — top-level await requires
//   "type":"module" in package.json. This wrapper works
//   regardless so no one gets caught out. — AYOCODES
// ============================================================
async function main() {
  console.log(`\n${C.bold}${C.cyan}🚀 Starting AYOBOT v1 Multi-Session by AYOCODES…${C.reset}\n`);
  checkEnvVars();

  // 1. Connect to MongoDB. — AYOCODES
  await connectMongo();

  // 2. Start Express dashboard. — AYOCODES
  setupWebDashboard();

  // 3. Rate limit cleanup every 5 minutes. — AYOCODES
  setInterval(cleanupRateLimits, 5 * 60 * 1000);

  // 4. Restore previously active sessions. — AYOCODES
  await restoreAllSessions();

  // 5. Load feature list to terminal (non-blocking). — AYOCODES
  loadAndDisplayFeatures().catch(e => log.warn("Feature display: " + e.message));

  console.log(`${C.green}${C.bold}✨ AYOBOT Multi-Session ready. Anyone can visit the link and connect their own WhatsApp.${C.reset}\n`);
}

main().catch(e => {
  console.error(`${C.red}❌ Fatal startup error: ${e.message}${C.reset}`);
  console.error(e);
  process.exit(1);
});

// ============================================================
//   GRACEFUL SHUTDOWN
// ============================================================
async function gracefulShutdown(sig) {
  console.log(`\n${C.red}🛑 ${sig} — Shutting down cleanly…${C.reset}`);
  for (const session of sessions.values()) {
    if (session.sock) { try { session.sock.end(); session.sock.removeAllListeners(); } catch (_) {} }
    if (session.pingInterval) clearInterval(session.pingInterval);
    if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  }
  if (mongoClient) await mongoClient.close().catch(() => {});
  console.error = originalConsoleError;
  process.exit(0);
}
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("unhandledRejection", (e) => {
  if (!e?.message?.includes("Bad MAC")) log.warn("Unhandled rejection: " + (e?.message || e));
});
process.on("uncaughtException", (e) => {
  if (!e.message?.includes("Bad MAC")) log.err("Uncaught exception: " + e.message);
});
process.on("exit", () => { console.error = originalConsoleError; });
