// ============================================================
//   AYOBOT v1 — index.js (Multi-Session Public Edition)
//   COMPLETE PRODUCTION-READY VERSION — ALL BUGS FIXED
//   Author: AYOCODES
//
//   FIXES IN THIS VERSION:
//   1.  mongoClient.topology?.isConnected() replaced with db ping — v5+ safe
//   2.  isAdmin() partial-match removed — exact match only, no false positives
//   3.  setSessionOwner called BEFORE loadHandlersForSession — race fixed
//   4.  autoMapOwnerTempId short-circuits once ownerConfirmed=true
//   5.  sessionCreationLocks cleared correctly in ALL exit paths (try/finally)
//   6.  adminStatusCache has size cap + periodic eviction — no memory leak
//   7.  sendWelcomeMessage uses event-driven pattern, not busy-wait polling
//   8.  clearSessionAuth uses exact sessionId prefix match — no injection risk
//   9.  Admin token set persisted to MongoDB — survives server restarts
//   10. saveBannedUsers / saveGroupSettings backup interval guarded by flag
//   11. All original features fully preserved
//   12. Admin dashboard fully functional — all routes implemented
//   13. WebSocket path correctly parsed and matched
//   14. Admin stats cards show correct numeric values (not icons)
//   15. /ayocodes-admin/analytics route implemented
//   16. Kill button XSS safe — sessionId sanitized before HTML interpolation
//   17. gracefulShutdown guards persistence calls with PERSIST_STATE flag
//   18. requireAdmin consistent across all admin routes
//   19. Admin dashboard auto-refresh clears on page unload
//   20. All API endpoints return correct JSON shapes
// ============================================================
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  proto,
} from "@whiskeysockets/baileys";
import { BufferJSON } from "@whiskeysockets/baileys/lib/Utils/generics.js";
import bodyParser from "body-parser";
import compression from "compression";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { MongoClient } from "mongodb";
import NodeCache from "node-cache";
import os from "os";
import pino from "pino";
import QRCode from "qrcode";
import QRCodeTerminal from "qrcode-terminal";
import { WebSocketServer } from "ws";
import http from "http";
import fs from "fs";

dotenv.config();

const originalConsoleError = console.error;
const logger = pino({
  level: process.env.DEBUG === "true" ? "debug" : "silent",
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ============================================================
//   EXPRESS APP SETUP WITH WEB SOCKET
// ============================================================
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ noServer: true });

// FIX: Handle upgrade manually so WebSocket only handles /ws path
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

app.use(
  helmet({
    contentSecurityPolicy:    false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
});

app.use(cookieParser());
app.set("trust proxy", 1);

// ============================================================
//   WEB SOCKET CONNECTION FOR REAL-TIME UPDATES
// ============================================================
const wsClients = new Map();

wss.on("connection", (ws, req) => {
  const url       = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId) {
    wsClients.set(sessionId, ws);
    ws.on("close", () => wsClients.delete(sessionId));
    ws.on("error", () => wsClients.delete(sessionId));
  } else {
    ws.close();
  }
});

function broadcastToSession(sessionId, data) {
  const client = wsClients.get(sessionId);
  if (client && client.readyState === 1) {
    try { client.send(JSON.stringify(data)); } catch (_) {}
  }
}

// ============================================================
//   TERMINAL COLORS & LOGGER
// ============================================================
const C = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

export const log = {
  ok:    (m) => console.log(`${new Date().toISOString()} ${C.green}✅${C.reset} ${m}`),
  err:   (m) => console.log(`${new Date().toISOString()} ${C.red}❌${C.reset} ${m}`),
  warn:  (m) => console.log(`${new Date().toISOString()} ${C.yellow}⚠️${C.reset}  ${m}`),
  info:  (m) => console.log(`${new Date().toISOString()} ${C.cyan}ℹ️${C.reset}  ${m}`),
  msg:   (m) => console.log(`${new Date().toISOString()} 📨 ${m}`),
  cmd:   (m) => console.log(`${new Date().toISOString()} ⚡ ${m}`),
  debug: (m) =>
    process.env.DEBUG === "true" &&
    console.log(`${new Date().toISOString()} ${C.dim}🔍${C.reset} ${m}`),
};

// ============================================================
//   ENVIRONMENT CONFIG WITH VALIDATION
// ============================================================
export const ENV = {
  PREFIX:               process.env.PREFIX               || ".",
  BOT_NAME:             process.env.BOT_NAME             || "AYOBOT",
  BOT_VERSION:          process.env.BOT_VERSION          || "1.0.0",
  ADMIN:                process.env.ADMIN                || "",
  CO_DEVELOPER:         process.env.CO_DEVELOPER         || process.env.ADMIN,
  MAX_WARNINGS:         parseInt(process.env.MAX_WARNINGS) || 3,
  AUTO_REPLY_ENABLED:   process.env.AUTO_REPLY_ENABLED   === "true",
  BOT_MODE:             process.env.BOT_MODE             || "public",
  ANTI_DELETE_ENABLED:  process.env.ANTI_DELETE_ENABLED  !== "false",
  WELCOME_IMAGE_URL:    process.env.WELCOME_IMAGE_URL    || "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
  CREATOR_IMAGE_URL:    process.env.CREATOR_IMAGE_URL    || "https://i.ibb.co/4R4LPvV3/creator.jpg",
  WELCOME_AUDIO_URL:    process.env.WELCOME_AUDIO_URL    || "https://files.catbox.moe/zat947.aac",
  WHATSAPP_CHANNEL:     process.env.WHATSAPP_CHANNEL     || "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25",
  WHATSAPP_GROUP:       process.env.WHATSAPP_GROUP       || "https://chat.whatsapp.com/JHt5bvX4DMg87f0RHsDfMN",
  CREATOR_NAME:         "AYOCODES",
  CREATOR_CONTACT:      process.env.CREATOR_CONTACT      || process.env.ADMIN,
  CREATOR_EMAIL:        process.env.CREATOR_EMAIL,
  CREATOR_GITHUB:       "https://github.com/Officialay12",
  GEMINI_KEY:           process.env.GEMINI_KEY,
  GROQ_API_KEY:         process.env.GROQ_API_KEY,
  OPENROUTER_KEY:       process.env.OPENROUTER_KEY,
  TOGETHER_KEY:         process.env.TOGETHER_KEY,
  HF_TOKEN:             process.env.HF_TOKEN,
  POLLINATIONS_KEY:     process.env.POLLINATIONS_API_KEY,
  OPENWEATHER_KEY:      process.env.OPENWEATHER_KEY,
  NEWS_API_KEY:         process.env.NEWS_API_KEY,
  TMDB_API_KEY:         process.env.TMDB_API_KEY,
  OMDB_API_KEY:         process.env.OMDB_API_KEY,
  COINMARKETCAP_KEY:    process.env.COINMARKETCAP_KEY,
  REMOVEBG_KEY:         process.env.REMOVEBG_KEY,
  GIPHY_KEY:            process.env.GIPHY_KEY,
  TENOR_KEY:            process.env.TENOR_KEY            || process.env.GEMINI_KEY,
  PIXABAY_KEY:          process.env.PIXABAY_KEY,
  UNSPLASH_KEY:         process.env.UNSPLASH_KEY,
  RAPIDAPI_KEY:         process.env.RAPIDAPI_KEY,
  VIRUSTOTAL_KEY:       process.env.VIRUSTOTAL_KEY,
  GOOGLE_SAFE_BROWSING: process.env.GOOGLE_SAFE_BROWSING_KEY,
  URLSCAN_KEY:          process.env.URLSCAN_KEY,
  SHORTENER_API:        process.env.SHORTENER_API        || "https://ayo-link.onrender.com",
  SHORTENER_API_KEY:    process.env.SHORTENER_API_KEY,
  PORT:                 process.env.PORT                 || 3000,
  RENDER_API_KEY:       process.env.RENDER_API_KEY,
  MONGODB_URI:          process.env.MONGODB_URI          || "",
  MAX_SESSIONS:         parseInt(process.env.MAX_SESSIONS) || 100,
  AYOCODES_ADMIN_KEY:   process.env.AYOCODES_ADMIN_KEY   || null,
  CENTRAL_SERVER_URL:   process.env.CENTRAL_SERVER_URL   || "https://ayobot-v1-wo21.onrender.com",
  INSTANCE_ID:          process.env.INSTANCE_ID          || null,
  DEBUG:                process.env.DEBUG                === "true",
  SESSION_TIMEOUT:      parseInt(process.env.SESSION_TIMEOUT)    || 3600000,
  MAX_MESSAGE_SIZE:     parseInt(process.env.MAX_MESSAGE_SIZE)   || 5000,
  RATE_LIMIT_MAX:       parseInt(process.env.RATE_LIMIT_MAX)     || 15,
  RATE_LIMIT_WINDOW:    parseInt(process.env.RATE_LIMIT_WINDOW)  || 60000,
  PERSIST_STATE:        process.env.PERSIST_STATE        === "true",
  DASHBOARD_THEME:      process.env.DASHBOARD_THEME      || "dark",
};

if (!ENV.MONGODB_URI) {
  console.error(`${C.red}❌ MONGODB_URI is required!${C.reset}`);
  process.exit(1);
}

function validateConfig() {
  if (ENV.MAX_SESSIONS < 1 || ENV.MAX_SESSIONS > 1000) {
    log.warn(`Invalid MAX_SESSIONS: ${ENV.MAX_SESSIONS}, using 100`);
    ENV.MAX_SESSIONS = 100;
  }
  if (ENV.RATE_LIMIT_MAX < 1) {
    log.warn(`Invalid RATE_LIMIT_MAX: ${ENV.RATE_LIMIT_MAX}, using 15`);
    ENV.RATE_LIMIT_MAX = 15;
  }
  if (ENV.MAX_WARNINGS < 1) {
    log.warn(`Invalid MAX_WARNINGS: ${ENV.MAX_WARNINGS}, using 3`);
    ENV.MAX_WARNINGS = 3;
  }
}
validateConfig();

function checkEnvVars() {
  const loaded  = [];
  const missing = [];
  const checks  = [
    { key: ENV.GEMINI_KEY,           name: "GEMINI_KEY",            feature: "AI Chat" },
    { key: ENV.GROQ_API_KEY,         name: "GROQ_API_KEY",          feature: "AI Fallback (Groq)" },
    { key: ENV.OPENROUTER_KEY,       name: "OPENROUTER_KEY",        feature: "AI Fallback (OpenRouter)" },
    { key: ENV.TOGETHER_KEY,         name: "TOGETHER_KEY",          feature: "AI Fallback (Together)" },
    { key: ENV.NEWS_API_KEY,         name: "NEWS_API_KEY",          feature: "News" },
    { key: ENV.OPENWEATHER_KEY,      name: "OPENWEATHER_KEY",       feature: "Weather" },
    { key: ENV.TMDB_API_KEY,         name: "TMDB_API_KEY",          feature: "Movies/TV" },
    { key: ENV.OMDB_API_KEY,         name: "OMDB_API_KEY",          feature: "Movies fallback" },
    { key: ENV.COINMARKETCAP_KEY,    name: "COINMARKETCAP_KEY",     feature: "Crypto" },
    { key: ENV.REMOVEBG_KEY,         name: "REMOVEBG_KEY",          feature: "Remove Background" },
    { key: ENV.GIPHY_KEY,            name: "GIPHY_KEY",             feature: "GIFs" },
    { key: ENV.PIXABAY_KEY,          name: "PIXABAY_KEY",           feature: "Images" },
    { key: ENV.UNSPLASH_KEY,         name: "UNSPLASH_KEY",          feature: "Photos" },
    { key: ENV.RAPIDAPI_KEY,         name: "RAPIDAPI_KEY",          feature: "RapidAPI / YouTube DL" },
    { key: ENV.VIRUSTOTAL_KEY,       name: "VIRUSTOTAL_KEY",        feature: "Virus Scan" },
    { key: ENV.GOOGLE_SAFE_BROWSING, name: "GOOGLE_SAFE_BROWSING_KEY", feature: "Safe Browsing" },
    { key: ENV.HF_TOKEN,             name: "HF_TOKEN",              feature: "HuggingFace" },
  ];

  for (const { key, name, feature } of checks) {
    if (key) loaded.push(feature);
    else     missing.push(`${name} (${feature} disabled)`);
  }

  if (loaded.length)  console.log(`\n${C.green}✅ APIs loaded: ${loaded.join(", ")}${C.reset}`);
  if (missing.length) {
    console.log(`\n${C.yellow}⚠️ Missing optional ENV vars:${C.reset}`);
    missing.forEach((x) => console.log(`   • ${x}`));
    console.log("");
  }
}

// ============================================================
//   PER-SESSION TEMP ID MAPPING
// ============================================================
const sessionTempIdMaps = new Map();

function getSessionTempMap(sessionId) {
  if (!sessionTempIdMaps.has(sessionId)) {
    sessionTempIdMaps.set(sessionId, new Map());
  }
  return sessionTempIdMaps.get(sessionId);
}

export function registerTempIdMapping(sessionId, tempId, realPhone) {
  const cleanTemp = _bareNormalize(tempId);
  const cleanReal = _bareNormalize(realPhone);
  if (!cleanTemp || !cleanReal || cleanTemp === cleanReal) return false;

  if (
    cleanTemp.length >= 10 &&
    cleanTemp.length <= 13 &&
    !cleanTemp.startsWith("2231")
  ) {
    log.debug(`[TempMapping] ${cleanTemp} looks like a real number, skipping`);
    return false;
  }

  const map = getSessionTempMap(sessionId);
  map.set(cleanTemp, cleanReal);
  log.ok(`[TempMapping][${sessionId.slice(0, 8)}] Mapped: ${cleanTemp} → ${cleanReal}`);
  return true;
}

export function getRealPhoneFromJid(jid, sessionId = null) {
  const cleanJid = _bareNormalize(jid);

  if (sessionId) {
    const map = getSessionTempMap(sessionId);
    if (map.has(cleanJid)) return map.get(cleanJid);
    for (const [tempId, realNum] of map.entries()) {
      if (cleanJid.includes(tempId) || tempId.includes(cleanJid)) return realNum;
    }
  }

  return cleanJid;
}

// FIX: Short-circuit immediately when ownerConfirmed — no mapping needed
export function autoMapOwnerTempId(sessionId, senderJid, ownerPhone) {
  if (!senderJid || !ownerPhone || !sessionId) return false;

  const senderClean = _bareNormalize(senderJid);
  const ownerClean  = _bareNormalize(ownerPhone);

  if (!senderClean || !ownerClean)  return false;
  if (senderClean === ownerClean)   return false;

  const isTempId =
    senderClean.startsWith("2231") ||
    senderClean.length > 13 ||
    senderClean.length < 10;

  if (isTempId) {
    const map = getSessionTempMap(sessionId);
    if (!map.has(senderClean)) {
      log.info(`[AutoMap][${sessionId.slice(0, 8)}] Temp ID: ${senderClean} → owner: ${ownerClean}`);
      return registerTempIdMapping(sessionId, senderClean, ownerClean);
    }
  }

  return false;
}

export function clearSessionTempMaps(sessionId) {
  sessionTempIdMaps.delete(sessionId);
}

// ============================================================
//   CORE NORMALIZATION
// ============================================================
function _bareNormalize(jid = "") {
  if (!jid) return "";
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || jid.phone || String(jid);
  }
  const str           = String(jid);
  const withoutDomain = str.split("@")[0];
  const withoutDevice = withoutDomain.split(":")[0];
  return withoutDevice.replace(/[^0-9]/g, "");
}

export function normalizeToPhone(jid, sessionId = null) {
  if (!jid) return "";
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || jid.phone || String(jid);
  }

  const str       = String(jid);
  let phoneNumber = _bareNormalize(str);

  if (sessionId) {
    const map = getSessionTempMap(sessionId);
    if (map.has(phoneNumber)) return map.get(phoneNumber);
  }

  if (
    phoneNumber.length > 13 ||
    phoneNumber.length < 9  ||
    phoneNumber.startsWith("0") ||
    phoneNumber.startsWith("2231")
  ) {
    const nigerianMatch = str.match(/234[0-9]{10}/);
    if (nigerianMatch) {
      phoneNumber = nigerianMatch[0];
    } else {
      const matches = str.match(/\d{9,13}/g);
      if (matches) {
        for (const match of matches) {
          if (
            match.length >= 10 &&
            match.length <= 13 &&
            !match.startsWith("0") &&
            !match.startsWith("2231")
          ) {
            phoneNumber = match;
            break;
          }
        }
      }
    }
  }

  if (
    phoneNumber.length > 13 ||
    phoneNumber.length < 10 ||
    phoneNumber.startsWith("2231")
  ) {
    const patterns = [
      /234[0-9]{10}/,
      /[0-9]{13}/,
      /[0-9]{12}/,
      /[0-9]{11}/,
      /[0-9]{10}/,
    ];
    for (const pattern of patterns) {
      const match = str.match(pattern);
      if (match && !match[0].startsWith("2231") && match[0].length >= 10) {
        phoneNumber = match[0];
        break;
      }
    }
  }

  if (ENV.DEBUG) log.debug(`[normalizeToPhone] ${jid} → ${phoneNumber}`);
  return phoneNumber;
}

export const normalizePhone = normalizeToPhone;

// ============================================================
//   ADMIN & PERMISSION HELPERS
// ============================================================
const adminStatusCache = new Map();
const ADMIN_CACHE_TTL  = 30000;
const ADMIN_CACHE_MAX  = 2000;
let   globalBotNumber  = null;

// Periodic cache eviction — runs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of adminStatusCache.entries()) {
    if (now - val.timestamp > ADMIN_CACHE_TTL) adminStatusCache.delete(key);
  }
  if (adminStatusCache.size > ADMIN_CACHE_MAX) {
    const overage = adminStatusCache.size - ADMIN_CACHE_MAX;
    let   deleted = 0;
    for (const key of adminStatusCache.keys()) {
      if (deleted >= overage) break;
      adminStatusCache.delete(key);
      deleted++;
    }
  }
}, 5 * 60 * 1000);

export function setGlobalBotNumber(number) {
  globalBotNumber = number;
  log.info(`🤖 Global bot number set: ${globalBotNumber}`);
}

export function getGlobalBotNumber() {
  return globalBotNumber;
}

export function isBotOwner(userJid, botOwnerJid, sessionId = null) {
  if (!userJid || !botOwnerJid) return false;

  const user  = sessionId ? getRealPhoneFromJid(userJid, sessionId) : _bareNormalize(userJid);
  const owner = _bareNormalize(botOwnerJid);

  if (!user || !owner) return false;
  if (ENV.DEBUG) log.debug(`[isBotOwner] user=${user} owner=${owner}`);

  return user === owner;
}

// FIX: exact match only — removed partial-match (includes) that caused false positives
export function isAdmin(userJid, ownerPhone, sessionId = null) {
  if (!userJid || !ownerPhone) return false;

  const user  = sessionId
    ? getRealPhoneFromJid(userJid, sessionId)
    : _bareNormalize(userJid);
  const owner = _bareNormalize(ownerPhone);

  if (!user || !owner) return false;

  if (ENV.DEBUG) {
    log.debug(`[isAdmin] user=${user} owner=${owner} session=${sessionId?.slice(0, 8)}`);
  }

  if (user === owner) {
    log.debug("[isAdmin] ✅ Exact match");
    return true;
  }

  log.debug("[isAdmin] ❌ No match");
  return false;
}

export async function isBotGroupAdmin(
  sock,
  groupJid,
  botOwnerJid  = null,
  bypassCache  = false,
  sessionId    = null,
) {
  try {
    if (!sock || !groupJid) return false;

    const cacheKey = `bot_admin_${groupJid}`;

    if (!bypassCache && adminStatusCache.has(cacheKey)) {
      const cached = adminStatusCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ADMIN_CACHE_TTL) return cached.isAdmin;
    }

    const botRaw   = sock.user?.id || "";
    const botPhone = _bareNormalize(botRaw);
    if (!botPhone) return false;
    if (!globalBotNumber) setGlobalBotNumber(botPhone);

    const groupMetadata = await sock.groupMetadata(groupJid);
    if (!groupMetadata?.participants) return false;

    let botParticipant = null;
    for (const p of groupMetadata.participants) {
      if (_bareNormalize(p.id) === botPhone) { botParticipant = p; break; }
    }

    const botIsLiteralAdmin =
      botParticipant &&
      (botParticipant.admin === "admin" || botParticipant.admin === "superadmin");

    if (botIsLiteralAdmin) {
      adminStatusCache.set(cacheKey, { isAdmin: true, timestamp: Date.now(), reason: "literal_admin" });
      return true;
    }

    if (botOwnerJid) {
      const ownerPhone = sessionId
        ? getRealPhoneFromJid(botOwnerJid, sessionId)
        : _bareNormalize(botOwnerJid);

      if (ownerPhone) {
        let ownerParticipant = null;
        for (const p of groupMetadata.participants) {
          if (_bareNormalize(p.id) === ownerPhone) { ownerParticipant = p; break; }
        }

        const ownerIsGroupAdmin =
          ownerParticipant &&
          (ownerParticipant.admin === "admin" || ownerParticipant.admin === "superadmin");

        if (ownerIsGroupAdmin) {
          adminStatusCache.set(cacheKey, { isAdmin: true, timestamp: Date.now(), reason: "owner_is_group_admin" });
          return true;
        }
      }
    }

    adminStatusCache.set(cacheKey, { isAdmin: false, timestamp: Date.now(), reason: "not_admin" });
    return false;
  } catch (error) {
    log.warn(`[isBotGroupAdmin] Error: ${error.message}`);
    return false;
  }
}

export async function isUserGroupAdmin(
  sock,
  groupJid,
  userJid,
  botOwnerJid = null,
  sessionId   = null,
) {
  try {
    if (!sock || !groupJid || !userJid) return false;

    const userPhone = sessionId
      ? getRealPhoneFromJid(userJid, sessionId)
      : _bareNormalize(userJid);
    if (!userPhone) return false;

    const cacheKey = `user_admin_${groupJid}_${userPhone}`;
    if (adminStatusCache.has(cacheKey)) {
      const cached = adminStatusCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ADMIN_CACHE_TTL) return cached.isAdmin;
    }

    if (botOwnerJid) {
      const ownerPhone = sessionId
        ? getRealPhoneFromJid(botOwnerJid, sessionId)
        : _bareNormalize(botOwnerJid);
      if (ownerPhone && userPhone === ownerPhone) {
        adminStatusCache.set(cacheKey, { isAdmin: true, timestamp: Date.now(), reason: "is_bot_owner" });
        return true;
      }
    }

    const groupMetadata = await sock.groupMetadata(groupJid);
    if (!groupMetadata?.participants) return false;

    let participant = null;
    for (const p of groupMetadata.participants) {
      if (_bareNormalize(p.id) === userPhone) { participant = p; break; }
    }

    const isAdminResult =
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin");

    adminStatusCache.set(cacheKey, {
      isAdmin: !!isAdminResult,
      timestamp: Date.now(),
      reason: "group_check",
    });
    return !!isAdminResult;
  } catch (error) {
    log.warn(`[isUserGroupAdmin] Error: ${error.message}`);
    return false;
  }
}

export function clearAdminCache(groupJid) {
  for (const key of adminStatusCache.keys()) {
    if (key.includes(groupJid)) adminStatusCache.delete(key);
  }
}

export async function refreshAdminStatus(sock, groupJid, botOwnerJid = null, sessionId = null) {
  clearAdminCache(groupJid);
  return isBotGroupAdmin(sock, groupJid, botOwnerJid, true, sessionId);
}

export async function hasGroupAdminPermission(sock, msg, session) {
  const from    = msg.key.remoteJid;
  const isGroup = from?.endsWith("@g.us");

  if (!isGroup) {
    return { allowed: false, reason: "❌ This command only works in groups!" };
  }

  const senderJid   = msg.key.participant || msg.key.remoteJid;
  const sessionId   = session?.id         || null;
  const botOwnerJid = session?.ownerJid   || null;

  if (botOwnerJid && isBotOwner(senderJid, botOwnerJid, sessionId)) {
    return { allowed: true, reason: "Bot owner" };
  }

  const userIsAdmin = await isUserGroupAdmin(sock, from, senderJid, botOwnerJid, sessionId);
  if (!userIsAdmin) {
    return {
      allowed: false,
      reason: "⛔ *Group Admin Required*\n\nYou need to be a group admin to use this command!",
    };
  }

  const botHasAdmin = await isBotGroupAdmin(sock, from, botOwnerJid, false, sessionId);
  if (!botHasAdmin) {
    const retried = await isBotGroupAdmin(sock, from, botOwnerJid, true, sessionId);
    if (!retried) {
      return {
        allowed: false,
        reason:
          "⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to perform this action!\n\n💡 *How to fix:*\n1. Make me a group admin, OR\n2. Make the bot owner a group admin\n3. Run .refreshadmin",
      };
    }
  }

  return { allowed: true, reason: "Group admin" };
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendMsg(sock, jid, content, options = {}) {
  try {
    if (!sock || !jid) return null;

    let messageOptions = {};
    if (typeof content === "string")   messageOptions = { text: content };
    else if (content.text)             messageOptions = { text: content.text };
    else if (content.image)            messageOptions = { image: content.image, caption: content.caption || "" };
    else if (content.video)            messageOptions = { video: content.video, caption: content.caption || "" };
    else if (content.audio)            messageOptions = { audio: content.audio, mimetype: "audio/mpeg" };
    else                               messageOptions = content;

    return await sock.sendMessage(jid, { ...messageOptions, ...options });
  } catch (error) {
    log.debug(`[sendMsg] Error: ${error.message}`);
    return null;
  }
}

export const getTime = () => {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
};

export const formatNumber = (num) => {
  if (!num) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export const escapeHtml = (text) => {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// FIX: Safe session ID for JS interpolation — hex only
function safeSessionId(sid) {
  return String(sid).replace(/[^a-f0-9]/gi, "").slice(0, 64);
}

// ============================================================
//   CIRCUIT BREAKER
// ============================================================
class CircuitBreaker {
  constructor(failureThreshold = 5, timeout = 60000) {
    this.failures         = 0;
    this.failureThreshold = failureThreshold;
    this.timeout          = timeout;
    this.lastFailureTime  = null;
    this.state            = "CLOSED";
  }

  async call(fn) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Circuit breaker is OPEN - service temporarily unavailable");
      }
    }
    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        this.state    = "CLOSED";
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.failureThreshold) this.state = "OPEN";
      throw error;
    }
  }

  reset() {
    this.failures        = 0;
    this.state           = "CLOSED";
    this.lastFailureTime = null;
  }
}

export const apiCircuitBreakers = {
  ai:         new CircuitBreaker(3, 30000),
  downloader: new CircuitBreaker(5, 60000),
  media:      new CircuitBreaker(3, 45000),
  weather:    new CircuitBreaker(2, 30000),
};

// ============================================================
//   PERSISTENCE FUNCTIONS
// ============================================================
let mongoClient            = null;
let authCollection         = null;
let sessionMetaCollection  = null;
let userLogCollection      = null;
let commandStatsCollection = null;
let adminTokenCollection   = null;

const mongoCircuitBreaker = new CircuitBreaker(5, 60000);

export async function saveBannedUsers() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await mongoCircuitBreaker.call(async () => {
      await sessionMetaCollection.updateOne(
        { _id: "global_bans" },
        { $set: { bans: Array.from(bannedUsers.entries()), updatedAt: new Date() } },
        { upsert: true },
      );
    });
    log.debug("Banned users saved");
  } catch (error) {
    log.err(`Failed to save banned users: ${error.message}`);
  }
}

export async function saveGroupSettings() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await mongoCircuitBreaker.call(async () => {
      await sessionMetaCollection.updateOne(
        { _id: "group_settings" },
        { $set: { settings: Array.from(groupSettings.entries()), updatedAt: new Date() } },
        { upsert: true },
      );
    });
    log.debug("Group settings saved");
  } catch (error) {
    log.err(`Failed to save group settings: ${error.message}`);
  }
}

export async function saveWarnings() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await mongoCircuitBreaker.call(async () => {
      await sessionMetaCollection.updateOne(
        { _id: "group_warnings" },
        { $set: { warnings: Array.from(groupWarnings.entries()), updatedAt: new Date() } },
        { upsert: true },
      );
    });
    log.debug("Warnings saved");
  } catch (error) {
    log.err(`Failed to save warnings: ${error.message}`);
  }
}

export async function saveCommandStats() {
  if (!ENV.PERSIST_STATE || !commandStatsCollection) return;
  try {
    await mongoCircuitBreaker.call(async () => {
      await commandStatsCollection.updateOne(
        { _id: "command_stats" },
        { $set: { stats: Array.from(commandUsage.entries()), updatedAt: new Date() } },
        { upsert: true },
      );
    });
  } catch (error) {
    log.debug(`Failed to save command stats: ${error.message}`);
  }
}

export async function loadPersistedState() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    const bans = await mongoCircuitBreaker.call(async () =>
      sessionMetaCollection.findOne({ _id: "global_bans" }),
    );
    if (bans?.bans) {
      bannedUsers.clear();
      for (const [key, value] of bans.bans) bannedUsers.set(key, value);
      log.info(`Loaded ${bannedUsers.size} banned users`);
    }

    const settings = await mongoCircuitBreaker.call(async () =>
      sessionMetaCollection.findOne({ _id: "group_settings" }),
    );
    if (settings?.settings) {
      groupSettings.clear();
      for (const [key, value] of settings.settings) groupSettings.set(key, value);
      log.info(`Loaded settings for ${groupSettings.size} groups`);
    }

    const warnings = await mongoCircuitBreaker.call(async () =>
      sessionMetaCollection.findOne({ _id: "group_warnings" }),
    );
    if (warnings?.warnings) {
      groupWarnings.clear();
      for (const [key, value] of warnings.warnings) groupWarnings.set(key, value);
      log.info(`Loaded warnings for ${groupWarnings.size} groups`);
    }
  } catch (error) {
    log.err(`Failed to load persisted state: ${error.message}`);
  }
}

// ============================================================
//   CONSTANTS
// ============================================================
export const GROUP_META_TTL          = 60000;
export const RATE_LIMIT_WINDOW       = 2000;
export const MAX_COMMANDS_PER_WINDOW = 1;
export const SPAM_TIME_WINDOW        = 4000;
export const MAX_SPAM_MESSAGES       = 3;
export const MAX_SIMILAR_MESSAGES    = 2;
export const RATE_LIMIT_MESSAGES     = [
  "⏳ *CHILL BRO!* Take a breath!",
  "🧘 *ONE AT A TIME!* Slow down!",
  "⚡ *EASY DOES IT!* Wait a moment!",
  "🎯 *PATIENCE!* Commands need spacing!",
  "🌟 *BREATHE!* You're going too fast!",
];

export function getBotOwner() {
  return ENV.ADMIN || ENV.OWNER_PHONE || ENV.OWNER_NUMBER || "";
}

// ============================================================
//   GLOBAL STATE
// ============================================================
export let messageCount        = 0;
export let botStartTime        = Date.now();
export const commandUsage      = new Map();
export const commandRateLimit  = new Map();
export const userCooldown      = new Map();
export const groupWarnings     = new Map();
export const bannedUsers       = new Map();
export const groupSettings     = new Map();
export const waitlistEntries   = new Map();
export const deletedMessages   = new Map();
export const userConversations = new Map();
export const inactivityTimers  = new Map();
export const autoReplyEnabled  = new Map();
export const spamTracker       = new Map();
export const adminCache        = new Map();
export const groupMetadataCache = new Map();
export const msgCache          = new NodeCache({ stdTTL: 60, maxKeys: 5000, checkperiod: 120 });
export const groupActivations  = new Map();
export const authorizedUsers   = new Set();
export const commandStats      = new Map();

if (!global.activeTrivia) global.activeTrivia = new Map();

const adminTokens          = new Set(); // in-memory fast lookup
const sessionOwnerMap      = new Map();
const messageQueues        = new Map();
const sessions             = new Map();
const sessionCreationLocks = new Map();
const socketStartingFlags  = new Set();

// ============================================================
//   CLEANUP MECHANISMS
// ============================================================
function cleanupOldData() {
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const now     = Date.now();

  for (const [key, data] of commandUsage.entries()) {
    const timestamp = data.timestamp || data;
    if (now - timestamp > MAX_AGE) commandUsage.delete(key);
  }
  if (commandUsage.size > 10000) {
    const entries = Array.from(commandUsage.entries()).sort(
      (a, b) => (a[1].timestamp || a[1]) - (b[1].timestamp || b[1]),
    );
    for (const [key] of entries.slice(0, commandUsage.size - 5000)) commandUsage.delete(key);
  }
  for (const [key, data] of deletedMessages.entries()) {
    if (data && now - (data.timestamp || 0) > MAX_AGE) deletedMessages.delete(key);
  }
  for (const [key, timestamp] of userCooldown.entries()) {
    if (now - timestamp > MAX_AGE) userCooldown.delete(key);
  }
  for (const [key, data] of spamTracker.entries()) {
    if (now - (data.lastMessageTime || data.timestamp || 0) > MAX_AGE) spamTracker.delete(key);
  }
  for (const [key, data] of adminCache.entries()) {
    if (now - (data.timestamp || 0) > 30000) adminCache.delete(key);
  }
  for (const [key, data] of groupMetadataCache.entries()) {
    if (now - (data.timestamp || 0) > GROUP_META_TTL) groupMetadataCache.delete(key);
  }
  if (global.gc) global.gc();
}

setInterval(cleanupOldData, 60 * 60 * 1000);

// ============================================================
//   LOCAL BACKUPS — only runs when PERSIST_STATE=true
// ============================================================
async function backupToLocalFile(data, filename) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    log.debug(`Backup saved: ${filename}`);
  } catch (error) {
    log.err(`Backup failed: ${error.message}`);
  }
}

// FIX: guarded by PERSIST_STATE flag
if (ENV.PERSIST_STATE) {
  setInterval(async () => {
    await backupToLocalFile(Array.from(bannedUsers.entries()),   "bannedUsers_backup.json");
    await backupToLocalFile(Array.from(groupSettings.entries()), "groupSettings_backup.json");
    await backupToLocalFile(Array.from(groupWarnings.entries()), "groupWarnings_backup.json");
    await backupToLocalFile(Array.from(commandUsage.entries()),  "commandUsage_backup.json");
  }, 60 * 60 * 1000);
}

// ============================================================
//   GROUP ACTIVATION FUNCTIONS
// ============================================================
export function activateGroup(sessionId, groupJid) {
  if (!groupActivations.has(sessionId)) groupActivations.set(sessionId, new Set());
  groupActivations.get(sessionId).add(groupJid);
}

export function deactivateGroup(sessionId, groupJid) {
  groupActivations.get(sessionId)?.delete(groupJid);
}

export function isGroupActivated(sessionId, groupJid) {
  return groupActivations.get(sessionId)?.has(groupJid) === true;
}

export function saveBann(jid, reason = "") {
  bannedUsers.set(jid, { reason, timestamp: Date.now() });
  saveBannedUsers();
}

export function getBann(jid) {
  return bannedUsers.get(jid) || null;
}

export function removeBann(jid) {
  bannedUsers.delete(jid);
  saveBannedUsers();
}

export function isAuthorized(userJid, ownerPhone, sessionMode, sessionId = null) {
  if (isAdmin(userJid, ownerPhone, sessionId)) return true;
  if (ownerPhone) {
    const session = sessionOwnerMap.get(_bareNormalize(ownerPhone));
    if (session?.authorizedUsers?.has(userJid))                 return true;
    if (session?.authorizedUsers?.has(_bareNormalize(userJid))) return true;
  }
  if (authorizedUsers.has(userJid))                return true;
  if (authorizedUsers.has(_bareNormalize(userJid))) return true;
  const mode = sessionMode || ENV.BOT_MODE || "public";
  if (mode === "public") return true;
  return false;
}

// ============================================================
//   MONGODB AUTH STATE
// ============================================================
async function useMongoAuthState(collection, sessionId) {
  const writeData = async (data, id) => {
    try {
      await collection.replaceOne(
        { _id: `${sessionId}:${id}` },
        {
          _id: `${sessionId}:${id}`,
          data: JSON.stringify(data, BufferJSON.replacer),
          updatedAt: new Date(),
        },
        { upsert: true },
      );
    } catch (error) {
      log.err(`MongoDB write error for ${id}: ${error.message}`);
      throw error;
    }
  };

  const readData = async (id) => {
    try {
      const item = await collection.findOne({ _id: `${sessionId}:${id}` });
      if (!item) return null;
      return JSON.parse(item.data, BufferJSON.reviver);
    } catch (error) {
      log.err(`MongoDB read error for ${id}: ${error.message}`);
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      await collection.deleteOne({ _id: `${sessionId}:${id}` });
    } catch (error) {
      log.err(`MongoDB delete error for ${id}: ${error.message}`);
    }
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              tasks.push(
                value
                  ? writeData(value, `${category}-${id}`)
                  : removeData(`${category}-${id}`),
              );
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
// ============================================================
function createSessionObject(sessionId) {
  return {
    id:                  sessionId,
    sock:                null,
    qr:                  null,
    pairingCode:         null,
    pairingPhone:        null,
    pairingExpiry:       null,
    connected:           false,
    ownerJid:            null,
    ownerPhone:          null,
    ownerName:           null,
    botNumber:           null,
    botName:             null,
    botSelfJid:          null,
    messageCount:        0,
    commandCount:        0,
    startTime:           Date.now(),
    authMethod:          null,
    reconnectAttempts:   0,
    destroyed:           false,
    commandHandler:      null,
    antiDeleteHandler:   null,
    groupHandler:        null,
    handlersReady:       false,
    pingInterval:        null,
    reconnectTimeout:    null,
    pairingCodeTimeout:  null,
    queueTimeout:        null,
    mode:                process.env.BOT_MODE || "public",
    authorizedUsers:     new Set(),
    lastActivity:        Date.now(),
    ownerConfirmed:      false,
    listenersAttached:   false,
    _ownerReadyResolve:  null,
    ownerReadyPromise:   null,
  };
}

// ============================================================
//   DATABASE CONNECTION — MongoDB v5+ safe (ping-based check)
// ============================================================
async function ensureMongoConnection() {
  if (mongoClient) {
    try {
      await mongoClient.db("admin").command({ ping: 1 });
      return mongoClient;
    } catch (_) {
      try { await mongoClient.close(); } catch (__) {}
      mongoClient = null;
    }
  }

  mongoClient = new MongoClient(ENV.MONGODB_URI, {
    maxPoolSize:              10,
    minPoolSize:              2,
    maxIdleTimeMS:            60000,
    connectTimeoutMS:         10000,
    socketTimeoutMS:          45000,
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS:     10000,
  });

  await mongoClient.connect();
  const db = mongoClient.db("ayobot");

  authCollection         = db.collection("auth_states");
  sessionMetaCollection  = db.collection("session_meta");
  userLogCollection      = db.collection("user_log");
  commandStatsCollection = db.collection("command_stats");
  adminTokenCollection   = db.collection("admin_tokens");

  await authCollection.createIndex({ _id: 1 });
 await sessionMetaCollection.createIndex({ sessionId: 1 }, { unique: true, sparse: true }).catch(async (err) => {
  if (err.codeName === 'IndexOptionsConflict' || err.code === 85) {
    await sessionMetaCollection.dropIndex('sessionId_1').catch(() => {});
    await sessionMetaCollection.createIndex({ sessionId: 1 }, { unique: true, sparse: true });
  } else {
    throw err;
  }
});
  await sessionMetaCollection.createIndex({ active: 1 });
  await sessionMetaCollection.createIndex({ updatedAt: -1 });
  await userLogCollection.createIndex({ phone: 1 }, { unique: true });
  await userLogCollection.createIndex({ lastSeen: -1 });
  await userLogCollection.createIndex({ totalMessages: -1 });
  await commandStatsCollection.createIndex({ _id: 1 });
  await adminTokenCollection.createIndex({ token: 1 }, { unique: true });
  await adminTokenCollection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 43200 });

  // Load persisted admin tokens into in-memory set
  try {
    const stored = await adminTokenCollection.find({}).toArray();
    for (const doc of stored) adminTokens.add(doc.token);
    log.ok(`Loaded ${stored.length} persisted admin token(s)`);
  } catch (_) {}

  log.ok("MongoDB connected with connection pooling");
  return mongoClient;
}

async function connectMongo() {
  try {
    await ensureMongoConnection();
    return true;
  } catch (error) {
    log.err(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
//   ADMIN TOKEN HELPERS — persisted across restarts
// ============================================================
async function addAdminToken(token) {
  adminTokens.add(token);
  try {
    await adminTokenCollection?.insertOne({ token, createdAt: new Date() });
  } catch (_) {}
}

async function removeAdminToken(token) {
  adminTokens.delete(token);
  try {
    await adminTokenCollection?.deleteOne({ token });
  } catch (_) {}
}

// ============================================================
//   HANDLER LOADER
// ============================================================
async function loadHandlersForSession(session) {
  session.handlersReady = false;
  const sid = session.id.slice(0, 8);

  try {
    const commandModule = await import("./handlers/commandHandler.js");
    if (commandModule?.handleCommand) {
      session.commandHandler = commandModule.handleCommand;
      log.ok(`[${sid}] Command handler loaded`);
    } else {
      throw new Error("handleCommand not found in module");
    }
  } catch (e) {
    log.err(`[${sid}] Command handler import failed: ${e.message}`);
    session.commandHandler = null;
  }

  try {
    const antiDeleteModule = await import("./handlers/antiDelete.js");
    if (antiDeleteModule?.handleAntiDelete) {
      session.antiDeleteHandler = antiDeleteModule.handleAntiDelete;
      log.ok(`[${sid}] Anti-delete handler loaded`);
    }
  } catch (e) {
    log.warn(`[${sid}] Anti-delete handler not available: ${e.message}`);
    session.antiDeleteHandler = null;
  }

  try {
    const groupModule = await import("./commands/group/automation.js");
    if (groupModule?.handleGroupParticipant) {
      session.groupHandler = groupModule.handleGroupParticipant;
      log.ok(`[${sid}] Group handler loaded`);
    }
  } catch (e) {
    log.warn(`[${sid}] Group handler not available: ${e.message}`);
    session.groupHandler = null;
  }

  session.handlersReady = !!session.commandHandler;
  log.ok(`[${sid}] Handlers ready: ${session.handlersReady ? "YES" : "NO"}`);
}

// ============================================================
//   MESSAGE QUEUE PROCESSOR
// ============================================================
const MAX_QUEUE_SIZE = 100;

async function processMessageQueue(session) {
  const queue = messageQueues.get(session.id) || [];
  if (queue.length === 0) return;
  if (!session.handlersReady || !session.commandHandler) return;

  for (const queued of queue) {
    try {
      queued.msg._session     = session;
      queued.msg._sessionId   = session.id;
      queued.msg._sessionMode = session.mode || "public";
      queued.msg._ownerPhone  = session.ownerPhone || "";
      await session.commandHandler(queued.msg, queued.sock);
    } catch (err) {
      log.err(`[${session.id.slice(0, 8)}] Queued message error: ${err.message}`);
    }
  }

  messageQueues.delete(session.id);
}

// ============================================================
//   USER TRACKING
// ============================================================
async function trackUser(session) {
  if (!userLogCollection || !session.ownerPhone) return;
  try {
    await userLogCollection.updateOne(
      { phone: session.ownerPhone },
      {
        $set: {
          phone:      session.ownerPhone,
          name:       session.ownerName || "Unknown",
          sessionId:  session.id,
          botNumber:  session.botNumber,
          authMethod: session.authMethod,
          lastSeen:   new Date(),
          updatedAt:  new Date(),
        },
        $setOnInsert: { firstSeen: new Date(), createdAt: new Date() },
        $inc: { totalSessions: 1 },
      },
      { upsert: true },
    );
  } catch (err) {
    log.warn(`[${session.id.slice(0, 8)}] Track user error: ${err.message}`);
  }
}

// ============================================================
//   SET SESSION OWNER
// ============================================================
function setSessionOwner(session, jid, phone, name = "Owner") {
  const cleanPhone = _bareNormalize(phone || jid);
  if (!cleanPhone) return;

  const cleanJid  = `${cleanPhone}@s.whatsapp.net`;
  const cleanName = name && name !== cleanPhone && name !== "Unknown" ? name : "Owner";

  session.ownerJid       = cleanJid;
  session.ownerPhone     = cleanPhone;
  session.ownerName      = cleanName;
  session.ownerConfirmed = true;

  if (cleanPhone) sessionOwnerMap.set(cleanPhone, session);

  // FIX: resolve the welcome-message promise so sendWelcomeMessage unblocks
  if (session._ownerReadyResolve) {
    session._ownerReadyResolve();
    session._ownerReadyResolve = null;
  }

  sessionMetaCollection
    ?.updateOne(
      { sessionId: session.id },
      {
        $set: {
          ownerPhone: cleanPhone,
          ownerName:  cleanName,
          botNumber:  session.botNumber,
          updatedAt:  new Date(),
        },
      },
      { upsert: true },
    )
    .catch(() => {});

  trackUser(session).catch(() => {});
  log.ok(`[${session.id.slice(0, 8)}] Owner confirmed: +${cleanPhone} (${cleanName})`);

  broadcastToSession(session.id, {
    type:  "owner_updated",
    owner: { phone: cleanPhone, name: cleanName },
  });
}

// ============================================================
//   MIGRATION: CLEAR POLLUTED OWNER DATA
// ============================================================
let migrationRun = false;

async function runOwnerMigration() {
  if (migrationRun) return;
  migrationRun = true;

  try {
    await ensureMongoConnection();

    const sessionsWithOwner = await sessionMetaCollection
      .find({ ownerPhone: { $exists: true, $ne: null, $ne: "" } })
      .toArray();

    let cleanedCount = 0;

    for (const sessionDoc of sessionsWithOwner) {
      const storedOwner   = _bareNormalize(sessionDoc.ownerPhone);
      const deployerPhone = _bareNormalize(ENV.ADMIN);
      const activeSession = sessions.get(sessionDoc.sessionId);

      if (!activeSession || !activeSession.connected) {
        await sessionMetaCollection.updateOne(
          { sessionId: sessionDoc.sessionId },
          { $unset: { ownerPhone: "", ownerName: "" } },
        );
        cleanedCount++;
        log.info(`[Migration] Cleared owner for disconnected session: ${sessionDoc.sessionId.slice(0, 8)}`);
      } else if (storedOwner !== deployerPhone && activeSession.ownerPhone !== storedOwner) {
        await sessionMetaCollection.updateOne(
          { sessionId: sessionDoc.sessionId },
          { $unset: { ownerPhone: "", ownerName: "" } },
        );
        cleanedCount++;
        log.info(`[Migration] Cleared mismatched owner: ${sessionDoc.sessionId.slice(0, 8)}`);
      }
    }

    if (cleanedCount > 0) {
      log.ok(`[Migration] Cleaned owner data from ${cleanedCount} polluted session(s)`);
    } else {
      log.info("[Migration] No polluted owner data found");
    }
  } catch (error) {
    log.warn(`[Migration] Error: ${error.message}`);
  }
}

// ============================================================
//   ATTACH MESSAGE LISTENERS — idempotent via listenersAttached flag
// ============================================================
function attachListeners(session) {
  const { sock } = session;
  const sid      = session.id.slice(0, 8);

  if (session.listenersAttached) {
    log.warn(`[${sid}] Listeners already attached, skipping`);
    return;
  }
  session.listenersAttached = true;

  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupJid, participants, action } = update;

      if (
        action === "add" &&
        session.botSelfJid &&
        participants.includes(session.botSelfJid)
      ) {
        log.info(`[${sid}] Bot added to group: ${groupJid}`);
        setTimeout(async () => {
          try {
            const { ensureBotAdminInheritance } = await import("./utils/validators.js");
            await ensureBotAdminInheritance(groupJid, sock, session.ownerJid);
          } catch (err) {
            log.warn(`[${sid}] Inheritance failed: ${err.message}`);
          }
        }, 5000);
      }

      if (session.groupHandler) await session.groupHandler(update, sock);
    } catch (err) {
      log.warn(`[${sid}] Group handler error: ${err.message}`);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify" && type !== "append") return;
      const msg = messages[0];
      if (!msg?.message) return;
      if (msg.key.remoteJid === "status@broadcast") return;

      const from = msg.key.remoteJid;
      if (!from) return;

      const isGroup = from.endsWith("@g.us");
      const fromMe  = !!msg.key.fromMe;
      const m       = msg.message;

      const messageText =
        m.conversation                    ||
        m.extendedTextMessage?.text       ||
        m.imageMessage?.caption           ||
        m.videoMessage?.caption           ||
        m.documentMessage?.caption        ||
        "";

      if (messageText && messageText.length > ENV.MAX_MESSAGE_SIZE) return;

      let rawSender;
      if (isGroup) {
        rawSender = msg.key.participant || msg.participant || "";
      } else if (fromMe) {
        rawSender = session.botSelfJid || from;
      } else {
        rawSender = from;
      }

      // FIX: only run temp-ID mapping when owner is NOT yet confirmed
      if (!session.ownerConfirmed && session.ownerPhone && rawSender && !session.destroyed) {
        autoMapOwnerTempId(session.id, rawSender, session.ownerPhone);
      }

      const senderPhone  = normalizeToPhone(rawSender, session.id);
      const senderJid    = senderPhone ? `${senderPhone}@s.whatsapp.net` : rawSender;
      const senderNumber = senderPhone || rawSender.split("@")[0];

      if (messageText) {
        const logMessage = messageText.substring(0, 60) + (messageText.length > 60 ? "…" : "");
        log.msg(`[${sid}][${isGroup ? "G" : "D"}] ${senderNumber}: ${logMessage}`);
      }

      if (
        bannedUsers.has(senderJid)  ||
        bannedUsers.has(senderPhone) ||
        bannedUsers.has(`${senderPhone}@s.whatsapp.net`)
      ) {
        return;
      }

      session.lastActivity = Date.now();
      session.messageCount++;
      messageCount++;

      // Auto-detect owner from first DM with a prefix command
      if (
        !session.ownerConfirmed &&
        !isGroup &&
        !fromMe &&
        messageText?.startsWith(ENV.PREFIX)
      ) {
        setSessionOwner(session, senderJid, senderPhone, "Owner");
      }

      if (!session.handlersReady || !session.commandHandler) {
        if (!messageQueues.has(session.id)) messageQueues.set(session.id, []);
        const queue = messageQueues.get(session.id);
        if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
        queue.push({ msg, sock });
        if (!session.queueTimeout) {
          session.queueTimeout = setTimeout(() => {
            processMessageQueue(session);
            session.queueTimeout = null;
          }, 5000);
        }
        return;
      }

      msg._session     = session;
      msg._sessionId   = session.id;
      msg._sessionMode = session.mode || "public";
      msg._ownerPhone  = session.ownerPhone || "";

      try {
        await session.commandHandler(msg, sock);
      } catch (cmdError) {
        log.err(`[${sid}] Command handler error: ${cmdError.message}`);
        try {
          await sock.sendMessage(from, {
            text: `❌ *Error*: ${cmdError.message.substring(0, 100)}`,
          });
        } catch (_) {}
      }
    } catch (e) {
      if (!e.message?.includes("Bad MAC") && !e.message?.includes("Connection Closed")) {
        log.err(`[${sid}] Message processing error: ${e.message}`);
      }
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    try {
      if (!session.connected || !ENV.ANTI_DELETE_ENABLED || !session.antiDeleteHandler) return;
      for (const u of updates) {
        try {
          await session.antiDeleteHandler(u, sock);
        } catch (err) {
          log.warn(`[${sid}] Anti-delete error: ${err.message}`);
        }
      }
    } catch (err) {
      log.warn(`[${sid}] Messages.update error: ${err.message}`);
    }
  });

  log.ok(`[${sid}] Listeners attached`);
}

// ============================================================
//   WELCOME MESSAGE — event-driven, no busy-wait polling
// ============================================================
async function sendWelcomeMessage(session, sock) {
  try {
    if (!session.ownerConfirmed) {
      await Promise.race([
        session.ownerReadyPromise,
        delay(60_000),
      ]);
    }

    if (!session.ownerConfirmed || !session.ownerJid) {
      log.warn(`[${session.id.slice(0, 8)}] Welcome skipped — no confirmed owner after 60s`);
      return;
    }

    if (!session.connected) {
      await delay(5000);
      if (!session.connected) return;
    }

    const connectTime = Date.now() - session.startTime;
    const speedIcon   = connectTime < 15000 ? "🟢" : connectTime < 30000 ? "🟡" : "🔴";
    const connectSecs = (connectTime / 1000).toFixed(1);
    const mem         = process.memoryUsage();
    const usedMB      = (mem.heapUsed  / 1024 / 1024).toFixed(1);
    const totalMB     = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const displayName =
      session.ownerName &&
      session.ownerName !== session.ownerPhone &&
      session.ownerName !== "Owner"
        ? session.ownerName
        : null;

    const caption =
      `━━━━━━━━━━━━━━━━━━━━━━\n🤖  *AYOBOT v1*  •  Online\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${speedIcon} *${connectSecs}s*\n\n┌─ *Bot Info* ──────────────\n│ 📱 +${session.botNumber}\n` +
      `${displayName ? `│ 👤 ${displayName}\n` : ""}│ 💾 ${usedMB}/${totalMB} MB\n│ ⚡ ${session.mode || ENV.BOT_MODE} mode\n│ 📦 v${ENV.BOT_VERSION}\n└───────────────────────\n\n` +
      `👑 *Owner:* +${session.ownerPhone}\n_Full admin access_\n\nType *${ENV.PREFIX}menu* for commands`;

    try {
      await sock.sendMessage(session.ownerJid, {
        audio:    { url: ENV.WELCOME_AUDIO_URL },
        mimetype: "audio/aac",
        ptt:      false,
      });
    } catch (_) {}

    try {
      await sock.sendMessage(session.ownerJid, {
        image:   { url: ENV.WELCOME_IMAGE_URL },
        caption,
      });
    } catch (_) {
      await sock.sendMessage(session.ownerJid, { text: caption });
    }
  } catch (error) {
    log.err(`[${session.id.slice(0, 8)}] Welcome error: ${error.message}`);
  }
}

// ============================================================
//   CLEAR SESSION AUTH — safe prefix match, no injection risk
// ============================================================
async function clearSessionAuth(sessionId) {
  try {
    // FIX: Validate sessionId is hex-only before using in regex
    const safePrefix = String(sessionId).replace(/[^a-f0-9]/gi, "").slice(0, 64);
    if (!safePrefix) return;
    // Use anchored regex — only matches exact prefix at start of _id
    await authCollection.deleteMany({
      _id: { $regex: `^${safePrefix}:`, $options: "" },
    });
    log.info(`[${sessionId.slice(0, 8)}] Auth cleared from MongoDB`);
  } catch (e) {
    log.warn(`[${sessionId.slice(0, 8)}] Could not clear auth: ${e.message}`);
  }
}

// ============================================================
//   START SESSION WITH LOCK — lock cleared in ALL exit paths
// ============================================================
async function startSession(sessionId, isNew = true) {
  if (sessionCreationLocks.has(sessionId)) {
    return sessionCreationLocks.get(sessionId);
  }

  let resolveLock;
  const lockPromise = new Promise((res) => { resolveLock = res; });
  sessionCreationLocks.set(sessionId, lockPromise);

  try {
    if (sessions.has(sessionId)) {
      resolveLock(sessions.get(sessionId));
      return sessions.get(sessionId);
    }

    if (isNew && sessions.size >= ENV.MAX_SESSIONS) {
      log.warn(`Max sessions (${ENV.MAX_SESSIONS}) reached`);
      resolveLock(null);
      return null;
    }

    const session = createSessionObject(sessionId);

    // Set up owner-ready promise BEFORE anything async runs
    session.ownerReadyPromise = new Promise((res) => {
      session._ownerReadyResolve = res;
    });

    sessions.set(sessionId, session);

    if (isNew) {
      await sessionMetaCollection.updateOne(
        { sessionId },
        {
          $set: {
            sessionId,
            active:    true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    await _startSocket(session);
    resolveLock(session);
    return session;
  } catch (err) {
    resolveLock(null);
    log.err(`startSession(${sessionId.slice(0, 8)}) failed: ${err.message}`);
    return null;
  } finally {
    // FIX: always clear the lock regardless of outcome
    sessionCreationLocks.delete(sessionId);
  }
}

// ============================================================
//   _startSocket
// ============================================================
async function _startSocket(session) {
  if (session.destroyed) return;

  const sid = session.id.slice(0, 8);

  if (socketStartingFlags.has(session.id)) {
    log.warn(`[${sid}] Socket already starting, skipping duplicate call`);
    return;
  }
  socketStartingFlags.add(session.id);

  // Tear down previous sock fully
  if (session.sock) {
    try {
      session.sock.removeAllListeners();
      session.sock.end();
    } catch (_) {}
    session.sock = null;
  }

  // Reset listener guard for fresh sock instance
  session.listenersAttached = false;

  try {
    await ensureMongoConnection();

    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMongoAuthState(authCollection, session.id);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal:              false,
      logger,
      browser:                        Browsers.ubuntu("Chrome"),
      syncFullHistory:                false,
      fireInitQueries:                false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect:            false,
      connectTimeoutMs:               60000,
      defaultQueryTimeoutMs:          30000,
      keepAliveIntervalMs:            25000,
      maxMsgRetryCount:               3,
      retryRequestDelayMs:            500,
      emitOwnEvents:                  true,
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

    session.sock = sock;
    socketStartingFlags.delete(session.id);

    if (session.pingInterval) {
      clearInterval(session.pingInterval);
      session.pingInterval = null;
    }

    session.pingInterval = setInterval(async () => {
      if (!session.connected || session.destroyed) {
        clearInterval(session.pingInterval);
        session.pingInterval = null;
        return;
      }
      try {
        await sock.sendPresenceUpdate("available");
      } catch (_) {}
    }, 30000);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !session.connected) {
        session.qr         = qr;
        session.authMethod = session.authMethod || "qr";
        log.info(`[${sid}] QR ready — scan to connect`);
        QRCodeTerminal.generate(qr, { small: true });
        try {
          const qrUrl = await QRCode.toDataURL(qr);
          broadcastToSession(session.id, { type: "qr_updated", qr: qrUrl });
        } catch (_) {}
      }

      if (connection === "open") {
        session.connected         = true;
        session.qr                = null;
        session.pairingCode       = null;
        session.reconnectAttempts = 0;

        session.botSelfJid = sock.user?.id || null;
        const botNumber    = _bareNormalize(session.botSelfJid || "");
        const rawName      =
          sock.user?.name         ||
          sock.user?.verifiedName ||
          sock.user?.notify       ||
          sock.user?.pushName     ||
          "";
        const userName = rawName && rawName !== botNumber ? rawName : null;

        session.botNumber = botNumber;
        session.botName   = userName || botNumber;

        if (!globalBotNumber) setGlobalBotNumber(botNumber);

        // FIX: set owner FIRST (synchronous) before async handler loading
        if (!session.ownerConfirmed) {
          const adminPhone = ENV.ADMIN ? _bareNormalize(ENV.ADMIN) : "";

          if (session.pairingPhone) {
            const pp = _bareNormalize(session.pairingPhone);
            setSessionOwner(session, `${pp}@s.whatsapp.net`, pp, userName || "Owner");
            log.ok(`[${sid}] Owner set from pairing phone: +${pp}`);
          } else if (adminPhone && botNumber === adminPhone) {
            setSessionOwner(session, `${adminPhone}@s.whatsapp.net`, adminPhone, userName || "Owner");
            log.ok(`[${sid}] Deployer session detected — owner: +${adminPhone}`);
          } else {
            log.info(`[${sid}] Owner not yet known — awaiting first DM command`);
          }
        } else if (userName && session.ownerName === "Owner") {
          session.ownerName = userName;
          sessionMetaCollection
            ?.updateOne({ sessionId: session.id }, { $set: { ownerName: userName } })
            .catch(() => {});
        }

        await saveCreds();
        await loadHandlersForSession(session);
        attachListeners(session);

        log.ok(`[${sid}] CONNECTED — +${botNumber} (${userName || "Unknown"})`);
        await processMessageQueue(session);

        broadcastToSession(session.id, {
          type:    "connected",
          botNumber,
          botName: session.botName,
        });

        sendWelcomeMessage(session, sock).catch((err) =>
          log.warn(`[${sid}] Welcome error: ${err.message}`),
        );
      }

      if (connection === "close" && !session.destroyed) {
        session.connected = false;
        session.qr        = null;

        if (session.pingInterval) {
          clearInterval(session.pingInterval);
          session.pingInterval = null;
        }

        const statusCode   = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "";
        log.err(`[${sid}] Disconnected — code: ${statusCode || 0} msg: ${errorMessage}`);

        broadcastToSession(session.id, { type: "disconnected", code: statusCode });

        const isConflict =
          errorMessage.includes("conflict") ||
          errorMessage.includes("replaced") ||
          statusCode === 440;

        if (isConflict) {
          const conflictDelay = 15000 + Math.floor(Math.random() * 5000);
          log.warn(`[${sid}] conflict/replaced — waiting ${conflictDelay}ms before reconnect`);
          session.reconnectAttempts = 0;
          if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
          session.reconnectTimeout = setTimeout(() => _startSocket(session), conflictDelay);
          return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
          await clearSessionAuth(session.id);
          session.ownerPhone     = null;
          session.ownerJid       = null;
          session.ownerName      = null;
          session.authMethod     = null;
          session.ownerConfirmed = false;
          session.reconnectAttempts = 0;
          clearSessionTempMaps(session.id);

          // Re-create owner-ready promise for fresh connection
          session.ownerReadyPromise = new Promise((res) => {
            session._ownerReadyResolve = res;
          });

          if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
          const jitter = Math.floor(Math.random() * 2000);
          session.reconnectTimeout = setTimeout(() => _startSocket(session), 3000 + jitter);
          return;
        }

        if (statusCode === DisconnectReason.restartRequired) {
          if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
          const jitter = Math.floor(Math.random() * 2000);
          session.reconnectTimeout = setTimeout(() => _startSocket(session), 3000 + jitter);
          return;
        }

        session.reconnectAttempts++;
        const baseDelay = Math.min(5000 * session.reconnectAttempts, 60000);
        const jitter    = Math.floor(Math.random() * 3000);
        const backoff   = baseDelay + jitter;
        log.info(`[${sid}] Reconnecting in ${backoff}ms (attempt ${session.reconnectAttempts})`);

        if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
        session.reconnectTimeout = setTimeout(() => _startSocket(session), backoff);
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (e) {
    socketStartingFlags.delete(session.id);
    log.err(`[${sid}] Socket startup error: ${e.message}`);
    if (!session.destroyed) {
      const jitter = Math.floor(Math.random() * 3000);
      setTimeout(() => _startSocket(session), 10000 + jitter);
    }
  }
}

// ============================================================
//   DESTROY SESSION
// ============================================================
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.destroyed = true;
  socketStartingFlags.delete(sessionId);

  if (session.ownerPhone) sessionOwnerMap.delete(session.ownerPhone);
  if (session.pingInterval)       clearInterval(session.pingInterval);
  if (session.reconnectTimeout)   clearTimeout(session.reconnectTimeout);
  if (session.pairingCodeTimeout) clearTimeout(session.pairingCodeTimeout);
  if (session.queueTimeout)       clearTimeout(session.queueTimeout);

  // Resolve pending ownerReadyPromise so sendWelcomeMessage doesn't hang
  if (session._ownerReadyResolve) {
    session._ownerReadyResolve();
    session._ownerReadyResolve = null;
  }

  if (session.sock) {
    try {
      session.sock.removeAllListeners();
      session.sock.end();
    } catch (_) {}
  }

  await clearSessionAuth(sessionId);
  await sessionMetaCollection?.deleteOne({ sessionId }).catch(() => {});
  clearSessionTempMaps(sessionId);
  sessions.delete(sessionId);
  groupActivations.delete(sessionId);
  messageQueues.delete(sessionId);

  log.info(`[${sessionId.slice(0, 8)}] Session destroyed`);
}

// ============================================================
//   REQUEST PAIRING CODE
// ============================================================
async function requestPairingCode(session, phoneNumber) {
  const clean = (phoneNumber || "").replace(/\D/g, "");
  if (clean.length < 10 || clean.length > 15)
    return { success: false, error: "Phone must be 10–15 digits" };
  if (session.connected) return { success: false, error: "Already connected" };
  if (!session.sock)     return { success: false, error: "Bot starting up — wait a moment" };

  if (session.pairingCode && session.pairingExpiry > Date.now()) {
    return {
      success:     true,
      code:        session.pairingCode,
      phoneNumber: session.pairingPhone,
      expiresIn:   Math.floor((session.pairingExpiry - Date.now()) / 1000),
      cached:      true,
    };
  }

  try {
    const rawCode = await session.sock.requestPairingCode(clean);
    const code    = String(rawCode).match(/.{1,4}/g)?.join("-") || String(rawCode);

    session.pairingCode   = code;
    session.pairingPhone  = clean;
    session.pairingExpiry = Date.now() + 60000;
    session.authMethod    = "pairing";

    if (session.pairingCodeTimeout) clearTimeout(session.pairingCodeTimeout);
    session.pairingCodeTimeout = setTimeout(() => {
      session.pairingCode   = null;
      session.pairingExpiry = null;
    }, 60000);

    log.ok(`[${session.id.slice(0, 8)}] Pairing code: ${code} for +${clean}`);
    return { success: true, code, rawCode: String(rawCode), phoneNumber: clean, expiresIn: 60 };
  } catch (e) {
    log.err(`[${session.id.slice(0, 8)}] Pairing code failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ============================================================
//   HTML HELPERS
// ============================================================
const SHARED_CSS = (theme) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  ${theme === "dark" ? `
  body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 100%); color: #e8e8f0; min-height: 100vh; overflow-x: hidden; }
  .glass { background: rgba(20,20,30,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; }
  .card { background: rgba(20,20,30,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; transition: all 0.3s ease; }
  .card:hover { transform: translateY(-2px); border-color: rgba(255,51,102,0.3); box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
  input, select { color: #e8e8f0 !important; }
  ` : `
  body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); color: #1a1a2e; min-height: 100vh; overflow-x: hidden; }
  .glass { background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(0,0,0,0.08); border-radius: 20px; }
  .card { background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); border: 1px solid rgba(0,0,0,0.05); border-radius: 20px; transition: all 0.3s ease; }
  .card:hover { transform: translateY(-2px); border-color: rgba(255,51,102,0.3); box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
  `}
  .gradient-border { position: relative; background: ${theme === "dark" ? "rgba(15,15,25,0.9)" : "rgba(255,255,255,0.9)"}; border-radius: 20px; }
  .gradient-border::before { content:''; position:absolute; inset:0; border-radius:20px; padding:1px; background:linear-gradient(135deg,#ff3366,#ff6b3d,#ffb347); mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
  .gradient-text { background: linear-gradient(135deg,#ff3366,#ff6b3d,#ffb347); -webkit-background-clip:text; background-clip:text; color:transparent; background-size:200% 200%; animation:gradientShift 3s ease infinite; }
  @keyframes gradientShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
  .btn-primary { background:linear-gradient(135deg,#ff3366,#ff6b3d); border:none; padding:12px 28px; border-radius:12px; font-weight:600; font-size:14px; cursor:pointer; transition:all 0.3s ease; color:white; }
  .btn-primary:hover { transform:translateY(-2px); box-shadow:0 5px 20px rgba(255,51,102,0.4); }
  .btn-secondary { background:${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; border:1px solid ${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}; padding:10px 24px; border-radius:12px; font-weight:500; cursor:pointer; transition:all 0.3s ease; color:${theme === "dark" ? "#e8e8f0" : "#1a1a2e"}; }
  .btn-secondary:hover { background:${theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}; border-color:rgba(255,51,102,0.5); }
  .btn-danger { background:linear-gradient(135deg,#dc2626,#b91c1c); border:none; padding:8px 16px; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.3s ease; color:white; }
  .status-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500; }
  .status-online { background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .status-offline { background:rgba(107,114,128,0.15); color:#9ca3af; border:1px solid rgba(107,114,128,0.3); }
  .data-table { width:100%; border-collapse:collapse; }
  .data-table th { text-align:left; padding:16px; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; border-bottom:1px solid ${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; }
  .data-table td { padding:16px; font-size:14px; border-bottom:1px solid ${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; vertical-align: middle; }
  .navbar { position:fixed; top:0; left:0; right:0; background:${theme === "dark" ? "rgba(10,10,15,0.95)" : "rgba(255,255,255,0.95)"}; backdrop-filter:blur(20px); border-bottom:1px solid ${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; z-index:1000; padding:0 32px; height:70px; display:flex; align-items:center; justify-content:space-between; }
  .logo { font-size:24px; font-weight:800; background:linear-gradient(135deg,#ff3366,#ff6b3d); -webkit-background-clip:text; background-clip:text; color:transparent; }
  @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  .animate-fade-in { animation:fadeInUp 0.6s ease forwards; }
  ::-webkit-scrollbar { width:8px; height:8px; }
  ::-webkit-scrollbar-track { background:${theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; border-radius:10px; }
  ::-webkit-scrollbar-thumb { background:rgba(255,51,102,0.5); border-radius:10px; }
  .spinner { width:40px; height:40px; border:3px solid rgba(255,51,102,0.2); border-top-color:#ff3366; border-radius:50%; animation:spin 0.8s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
  .qr-container { background:white; padding:20px; border-radius:20px; display:inline-block; }
  .qr-container img { width:200px; height:200px; }
  .toast { position:fixed; bottom:20px; right:20px; background:${theme === "dark" ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)"}; backdrop-filter:blur(10px); padding:12px 20px; border-radius:12px; border-left:3px solid #ff3366; z-index:1100; animation:slideIn 0.3s ease; color:${theme === "dark" ? "#e8e8f0" : "#1a1a2e"}; }
  @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
  .stat-card { padding:24px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:8px; }
  .stat-icon { font-size:28px; margin-bottom:4px; }
  .stat-value { font-size:32px; font-weight:800; line-height:1; }
  .stat-label { font-size:12px; color:#9ca3af; margin-top:4px; }
  a { color: inherit; text-decoration: none; }
  a:hover { color: #ff3366; }
  @media (max-width:768px) { .navbar{padding:0 16px;} .data-table th,.data-table td{padding:12px 8px;font-size:12px;} }
`;

function sharedHead(title) {
  const theme = ENV.DASHBOARD_THEME;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>${SHARED_CSS(theme)}</style>
</head>`;
}

// ============================================================
//   CONNECTED DASHBOARD HTML
// ============================================================
function connectedHTML(session) {
  const up  = Math.floor((Date.now() - session.startTime) / 1000);
  const h   = Math.floor(up / 3600);
  const m   = Math.floor((up % 3600) / 60);
  const s   = up % 60;
  const SID = safeSessionId(session.id);
  const mem = process.memoryUsage();

  return (
    sharedHead("AYOBOT — Dashboard") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:14px;color:#6b7280;">v${escapeHtml(ENV.BOT_VERSION)}</span></div>
    <div style="display:flex;align-items:center;gap:16px;">
      <span class="status-badge status-online"><i class="fas fa-circle" style="font-size:8px;animation:pulse 1.5s infinite;"></i> LIVE</span>
      <button class="btn-secondary" onclick="logout()" style="padding:8px 16px;"><i class="fas fa-sign-out-alt"></i> Logout</button>
    </div>
  </nav>
  <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}</style>
  <main style="padding-top:90px;padding-bottom:40px;max-width:1400px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div class="animate-fade-in" style="text-align:center;margin-bottom:40px;">
      <div style="font-size:14px;color:#ff3366;letter-spacing:2px;margin-bottom:12px;">⚡ WHATSAPP AUTOMATION SUITE</div>
      <h1 style="font-size:clamp(2rem,5vw,3rem);font-weight:800;margin-bottom:16px;"><span class="gradient-text">COMMAND CENTER</span></h1>
      <p style="color:#9ca3af;">Manage your WhatsApp bot from anywhere</p>
    </div>

    <!-- Owner Card -->
    <div class="card gradient-border" style="padding:24px;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,#ff3366,#ff6b3d);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas fa-crown" style="font-size:24px;color:white;"></i>
        </div>
        <div>
          <div style="font-weight:700;font-size:18px;" id="ownerName">${escapeHtml(session.ownerName || "Owner")}</div>
          <div style="font-size:13px;color:#9ca3af;font-family:monospace;" id="ownerPhone">${session.ownerPhone ? `+${escapeHtml(session.ownerPhone)}` : "Pending first message…"}</div>
        </div>
      </div>
      <div class="status-badge status-online"><i class="fas fa-shield-alt"></i> BOT OWNER</div>
    </div>

    <!-- Stats Grid — FIX: stat-value is text, not an icon -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin-bottom:32px;">
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ff3366;"><i class="fas fa-comments"></i></div>
        <div class="stat-value" id="statMsg">${session.messageCount}</div>
        <div class="stat-label">Total Messages</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ff6b3d;"><i class="fas fa-terminal"></i></div>
        <div class="stat-value" id="statCmd">${session.commandCount || 0}</div>
        <div class="stat-label">Commands Run</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ffb347;"><i class="fas fa-clock"></i></div>
        <div class="stat-value" id="statUptime" style="font-size:22px;">${h}h ${m}m ${s}s</div>
        <div class="stat-label">Uptime</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#22c55e;"><i class="fas fa-globe"></i></div>
        <div class="stat-value" style="font-size:18px;">${escapeHtml((session.mode || ENV.BOT_MODE).toUpperCase())}</div>
        <div class="stat-label">Bot Mode</div>
      </div>
    </div>

    <!-- Charts -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px;margin-bottom:32px;">
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-chart-bar" style="color:#ff3366;"></i> Command Usage</h3>
        <canvas id="commandChart" height="200"></canvas>
        <div id="noCommandData" style="display:none;text-align:center;padding:40px;color:#9ca3af;">No command data yet</div>
      </div>
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-memory" style="color:#ff6b3d;"></i> Memory Usage</h3>
        <canvas id="resourceChart" height="200"></canvas>
        <div style="text-align:center;margin-top:12px;font-size:13px;color:#9ca3af;" id="memLabel">${(mem.heapUsed/1024/1024).toFixed(1)} MB used of ${(mem.heapTotal/1024/1024).toFixed(1)} MB</div>
      </div>
    </div>

    <!-- Info Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:32px;">
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;display:flex;align-items:center;gap:8px;"><i class="fas fa-robot" style="color:#ff3366;"></i> Bot Information</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">📱 Number</span><span style="font-family:monospace;" id="botNumber">+${escapeHtml(session.botNumber || "—")}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">👤 Name</span><span id="botName">${escapeHtml(session.botName || "—")}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">⚡ Prefix</span><span style="font-family:monospace;">${escapeHtml(ENV.PREFIX)}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">🔐 Auth</span><span id="authMethod">${escapeHtml(session.authMethod || "session")}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">📦 Version</span><span>v${escapeHtml(ENV.BOT_VERSION)}</span></div>
        </div>
      </div>
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;display:flex;align-items:center;gap:8px;"><i class="fas fa-heart-pulse" style="color:#ff6b3d;"></i> System Status</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">🟢 Connection</span><span style="color:#22c55e;font-weight:600;">STABLE</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">🔧 Handlers</span><span style="color:${session.handlersReady ? '#22c55e' : '#ef4444'};font-weight:600;">${session.handlersReady ? "READY" : "LOADING"}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">🛡️ Anti-Delete</span><span style="color:${ENV.ANTI_DELETE_ENABLED ? '#22c55e' : '#9ca3af'};font-weight:600;">${ENV.ANTI_DELETE_ENABLED ? "ACTIVE" : "OFF"}</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">💾 Memory</span><span id="memoryUsage">${(mem.heapUsed/1024/1024).toFixed(1)} MB</span></div>
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="color:#9ca3af;">🕒 Started</span><span style="font-size:12px;">${new Date(session.startTime).toLocaleTimeString()}</span></div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="card" style="padding:24px;margin-bottom:32px;">
      <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-bolt" style="color:#ffb347;"></i> Quick Actions</h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="window.open('https://wa.me/${escapeHtml(session.botNumber || "")}','_blank')"><i class="fab fa-whatsapp"></i> Chat with Bot</button>
        <button class="btn-secondary" onclick="copyCmd('${escapeHtml(ENV.PREFIX)}menu')"><i class="fas fa-copy"></i> Copy Menu Cmd</button>
        <button class="btn-secondary" onclick="fetchStats()"><i class="fas fa-sync-alt"></i> Refresh Stats</button>
      </div>
    </div>
  </main>

  <script>
    const SID = '${SID}';
    let ws = null, commandChart = null, resourceChart = null, statsInterval = null, memInterval = null;

    // WebSocket
    function connectWS() {
      try {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + location.host + '/ws?sessionId=' + SID);
        ws.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.type === 'connected') { showToast('Bot reconnected!', 'success'); setTimeout(() => location.reload(), 1000); }
            else if (d.type === 'disconnected') showToast('Bot disconnected! Reconnecting…', 'error');
            else if (d.type === 'owner_updated') {
              if (d.owner?.phone) document.getElementById('ownerPhone').textContent = '+' + d.owner.phone;
              if (d.owner?.name)  document.getElementById('ownerName').textContent  = d.owner.name;
            }
          } catch(_) {}
        };
        ws.onclose = () => setTimeout(connectWS, 3000);
        ws.onerror = () => {};
      } catch(_) {}
    }

    function showToast(msg, type) {
      const el = document.createElement('div');
      el.className = 'toast';
      const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
      el.innerHTML = '<i class="fas fa-' + icon + '" style="margin-right:8px;color:' + (type==='success'?'#22c55e':'#ef4444') + ';"></i>' + msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }

    function copyCmd(cmd) {
      navigator.clipboard?.writeText(cmd).then(() => showToast('Copied: ' + cmd, 'success')).catch(() => showToast('Copy failed', 'error'));
    }

    async function logout() {
      if (!confirm('Disconnect your WhatsApp session and reset bot?')) return;
      try {
        await fetch('/api/logout/' + SID, { method: 'POST', credentials: 'same-origin' });
        location.href = '/';
      } catch(e) { showToast('Logout failed: ' + e.message, 'error'); }
    }

    async function fetchStats() {
      try {
        const res = await fetch('/api/status/' + SID, { credentials: 'same-origin' });
        if (!res.ok) return;
        const d = await res.json();
        if (!d.exists || !d.connected) { location.reload(); return; }
        document.getElementById('statMsg').textContent = (d.messageCount || 0).toLocaleString();
        document.getElementById('statCmd').textContent = (d.commandCount || 0).toLocaleString();
        const up = d.uptime || 0;
        document.getElementById('statUptime').textContent = Math.floor(up/3600)+'h '+Math.floor((up%3600)/60)+'m '+(up%60)+'s';
        if (d.ownerName)  document.getElementById('ownerName').textContent  = d.ownerName;
        if (d.ownerPhone) document.getElementById('ownerPhone').textContent = '+' + d.ownerPhone;
        if (d.botNumber)  document.getElementById('botNumber').textContent  = '+' + d.botNumber;
        if (d.botName)    document.getElementById('botName').textContent    = d.botName;
        if (d.authMethod) document.getElementById('authMethod').textContent = d.authMethod;
      } catch(_) {}
    }

    async function initCharts() {
      try {
        const isDark = ${JSON.stringify(ENV.DASHBOARD_THEME === "dark")};
        const textColor = isDark ? '#9ca3af' : '#6b7280';

        // Command chart
        const res = await fetch('/api/command-stats/' + SID, { credentials: 'same-origin' });
        const stats = await res.json();
        const ctx1 = document.getElementById('commandChart').getContext('2d');
        if (stats.topCommands && stats.topCommands.length > 0) {
          commandChart = new Chart(ctx1, {
            type: 'bar',
            data: {
              labels: stats.topCommands.map(c => c.name),
              datasets: [{ label: 'Uses', data: stats.topCommands.map(c => c.uses), backgroundColor: 'rgba(255,51,102,0.8)', borderColor: '#ff3366', borderWidth: 1, borderRadius: 6 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor }, beginAtZero: true } } }
          });
        } else {
          document.getElementById('commandChart').style.display = 'none';
          document.getElementById('noCommandData').style.display = 'block';
        }

        // Memory doughnut
        const memRes = await fetch('/api/memory/' + SID, { credentials: 'same-origin' });
        const mem = await memRes.json();
        const ctx2 = document.getElementById('resourceChart').getContext('2d');
        resourceChart = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: ['Used (MB)', 'Free (MB)'],
            datasets: [{ data: [mem.used, mem.free], backgroundColor: ['#ff3366', '#22c55e'], borderWidth: 0 }]
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor } } }, cutout: '70%' }
        });
        document.getElementById('memLabel').textContent = mem.used + ' MB used of ' + mem.total + ' MB';
      } catch(e) { console.warn('Chart init error:', e); }
    }

    async function updateMemory() {
      try {
        const res = await fetch('/api/memory/' + SID, { credentials: 'same-origin' });
        const d = await res.json();
        document.getElementById('memoryUsage').textContent = d.used + ' MB';
        document.getElementById('memLabel').textContent = d.used + ' MB used of ' + d.total + ' MB';
        if (resourceChart) {
          resourceChart.data.datasets[0].data = [d.used, d.free];
          resourceChart.update('none');
        }
      } catch(_) {}
    }

    // Init
    connectWS();
    fetchStats();
    initCharts();
    statsInterval = setInterval(fetchStats, 30000);
    memInterval   = setInterval(updateMemory, 10000);

    // FIX: clear intervals on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(statsInterval);
      clearInterval(memInterval);
      if (ws) ws.close();
    });
  </script>
</body></html>`
  );
}

// ============================================================
//   CONNECT HTML (QR / Pairing)
// ============================================================
function connectHTML(sessionId, qrUrl) {
  const SID = safeSessionId(sessionId);
  return (
    sharedHead("AYOBOT — Connect") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:14px;color:#6b7280;">v${escapeHtml(ENV.BOT_VERSION)}</span></div>
    <div class="status-badge status-offline"><i class="fas fa-circle" style="font-size:8px;"></i> AWAITING CONNECTION</div>
  </nav>
  <main style="padding-top:90px;padding-bottom:40px;max-width:600px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div class="animate-fade-in" style="text-align:center;margin-bottom:40px;">
      <div style="font-size:14px;color:#ff3366;letter-spacing:2px;margin-bottom:12px;">CONNECT YOUR DEVICE</div>
      <h1 style="font-size:clamp(1.8rem,5vw,2.5rem);font-weight:800;"><span class="gradient-text">LINK WHATSAPP</span></h1>
      <p style="color:#9ca3af;margin-top:12px;">Scan QR code or use pairing code to connect</p>
    </div>
    <div class="card" style="padding:32px;">
      <div style="display:flex;gap:8px;margin-bottom:32px;background:rgba(128,128,128,0.1);border-radius:12px;padding:4px;">
        <button onclick="showTab('qr')" id="tabQrBtn" style="flex:1;padding:12px;border:none;background:#ff3366;color:white;border-radius:8px;font-weight:600;cursor:pointer;transition:all 0.2s;">📱 QR Code</button>
        <button onclick="showTab('pair')" id="tabPairBtn" style="flex:1;padding:12px;border:none;background:transparent;color:#9ca3af;border-radius:8px;font-weight:600;cursor:pointer;transition:all 0.2s;">🔑 Pairing Code</button>
      </div>
      <div id="qrTab" style="text-align:center;">
        <div class="qr-container" style="margin-bottom:24px;">
          ${qrUrl ? `<img src="${qrUrl}" alt="QR Code" style="width:220px;height:220px;">` : `<div style="width:220px;height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(128,128,128,0.1);border-radius:12px;"><div class="spinner"></div><p style="color:#9ca3af;font-size:14px;">Generating QR...</p></div>`}
        </div>
        <div style="text-align:left;margin-top:24px;background:rgba(255,255,255,0.03);padding:20px;border-radius:12px;">
          <h4 style="margin-bottom:16px;font-size:14px;font-weight:600;">How to scan:</h4>
          <div style="color:#9ca3af;line-height:2;font-size:14px;">
            <div>1. Open WhatsApp on your phone</div>
            <div>2. Tap <strong>Menu → Linked Devices</strong></div>
            <div>3. Tap <strong>Link a Device</strong></div>
            <div>4. Point camera at the QR code</div>
          </div>
        </div>
      </div>
      <div id="pairTab" style="display:none;">
        <div id="pairForm">
          <label style="display:block;margin-bottom:8px;font-size:14px;color:#9ca3af;">Phone number with country code (no + or spaces)</label>
          <input type="tel" id="phoneInput" placeholder="e.g., 2349159180375" style="width:100%;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:12px;font-size:16px;margin-bottom:16px;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#ff3366'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
          <button onclick="requestPairingCode()" class="btn-primary" style="width:100%;" id="pairBtn">Get Pairing Code</button>
        </div>
        <div id="codeDisplay" style="display:none;text-align:center;">
          <div style="background:rgba(255,51,102,0.08);border:1px solid rgba(255,51,102,0.2);padding:32px;border-radius:20px;margin:16px 0;">
            <div style="font-size:11px;color:#9ca3af;letter-spacing:2px;margin-bottom:12px;">YOUR PAIRING CODE</div>
            <div style="font-size:52px;font-weight:800;letter-spacing:10px;color:#ff3366;font-family:monospace;" id="codeDigits">——</div>
            <div style="margin-top:16px;color:#9ca3af;font-size:13px;" id="codeTimer">Expires in 60s</div>
          </div>
          <p style="color:#9ca3af;font-size:13px;">Enter this code in WhatsApp → Menu → Linked Devices → Link a Device</p>
          <button onclick="resetPairForm()" class="btn-secondary" style="margin-top:16px;">Try Again</button>
        </div>
        <div id="pairError" style="color:#ef4444;margin-top:16px;padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;display:none;font-size:14px;"></div>
      </div>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:20px;">QR code refreshes automatically every 30 seconds</p>
  </main>
  <script>
    const SID = '${SID}';
    let countdown = null;

    function showTab(tab) {
      const qr = document.getElementById('qrTab'), pair = document.getElementById('pairTab');
      const qrBtn = document.getElementById('tabQrBtn'), pairBtn = document.getElementById('tabPairBtn');
      if (tab === 'qr') {
        qr.style.display = 'block'; pair.style.display = 'none';
        qrBtn.style.background = '#ff3366'; qrBtn.style.color = 'white';
        pairBtn.style.background = 'transparent'; pairBtn.style.color = '#9ca3af';
      } else {
        qr.style.display = 'none'; pair.style.display = 'block';
        qrBtn.style.background = 'transparent'; qrBtn.style.color = '#9ca3af';
        pairBtn.style.background = '#ff3366'; pairBtn.style.color = 'white';
      }
    }

    function resetPairForm() {
      document.getElementById('pairForm').style.display = 'block';
      document.getElementById('codeDisplay').style.display = 'none';
      document.getElementById('pairError').style.display = 'none';
      document.getElementById('phoneInput').value = '';
      const btn = document.getElementById('pairBtn');
      btn.disabled = false; btn.textContent = 'Get Pairing Code';
      if (countdown) clearInterval(countdown);
    }

    async function requestPairingCode() {
      const phone = document.getElementById('phoneInput').value.replace(/\\D/g,'');
      const errEl = document.getElementById('pairError');
      errEl.style.display = 'none';
      if (!phone || phone.length < 10 || phone.length > 15) {
        errEl.textContent = 'Enter a valid phone number (10–15 digits, with country code)';
        errEl.style.display = 'block'; return;
      }
      const btn = document.getElementById('pairBtn');
      btn.disabled = true; btn.textContent = 'Requesting…';
      try {
        const res = await fetch('/api/request-pairing/' + SID, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById('pairForm').style.display = 'none';
          document.getElementById('codeDisplay').style.display = 'block';
          document.getElementById('codeDigits').textContent = data.code;
          let t = data.expiresIn || 60;
          const timerEl = document.getElementById('codeTimer');
          if (countdown) clearInterval(countdown);
          countdown = setInterval(() => {
            t--;
            if (timerEl) timerEl.textContent = 'Expires in ' + t + 's';
            if (t <= 0) { clearInterval(countdown); setTimeout(() => location.reload(), 500); }
          }, 1000);
        } else {
          errEl.textContent = data.error || 'Failed to get pairing code. Please try again.';
          errEl.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Get Pairing Code';
        }
      } catch(e) {
        errEl.textContent = 'Network error: ' + e.message;
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Get Pairing Code';
      }
    }

    // Poll for connection every 4s
    let pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/status/' + SID, { credentials: 'same-origin' });
        const d = await res.json();
        if (d.connected) { clearInterval(pollInterval); location.reload(); }
      } catch(_) {}
    }, 4000);

    window.addEventListener('beforeunload', () => { clearInterval(pollInterval); if (countdown) clearInterval(countdown); });
  </script>
</body></html>`
  );
}

// ============================================================
//   LOADING / MAX SESSIONS HTML
// ============================================================
function loadingHTML(sessionId) {
  const SID = safeSessionId(sessionId);
  return (
    sharedHead("AYOBOT — Starting") +
    `<body>
  <nav class="navbar"><div class="logo">AYOBOT</div></nav>
  <main style="padding-top:90px;text-align:center;padding:120px 24px;">
    <div class="spinner" style="margin:0 auto 32px;"></div>
    <h2 style="font-size:24px;font-weight:700;margin-bottom:12px;">Starting your bot…</h2>
    <p style="color:#9ca3af;">This will only take a moment</p>
    <p style="color:#6b7280;margin-top:32px;font-size:14px;">Redirecting in <span id="countdown">5</span>s</p>
  </main>
  <script>
    let count = 5;
    const timer = setInterval(() => {
      count--;
      const el = document.getElementById('countdown');
      if (el) el.textContent = count;
      if (count <= 0) { clearInterval(timer); location.reload(); }
    }, 1000);
  </script>
</body></html>`
  );
}

function maxSessionsHTML() {
  return (
    sharedHead("AYOBOT — At Capacity") +
    `<body>
  <main style="padding:120px 24px;text-align:center;">
    <i class="fas fa-exclamation-triangle" style="font-size:64px;color:#ffb347;margin-bottom:24px;display:block;"></i>
    <h1 style="font-size:32px;margin-bottom:16px;">Server at Capacity</h1>
    <p style="color:#9ca3af;max-width:400px;margin:0 auto;">Maximum session limit (${ENV.MAX_SESSIONS}) reached. Please try again later or contact the admin.</p>
    <button onclick="location.reload()" class="btn-secondary" style="margin-top:32px;"><i class="fas fa-sync-alt"></i> Try Again</button>
  </main>
</body></html>`
  );
}

// ============================================================
//   ADMIN LOGIN HTML
// ============================================================
function adminLoginHTML(error = "") {
  const theme    = ENV.DASHBOARD_THEME;
  const inputBg  = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const inputBdr = theme === "dark" ? "rgba(255,255,255,0.1)"  : "rgba(0,0,0,0.1)";
  return (
    sharedHead("AYOBOT — Admin Login") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:12px;color:#ff3366;font-weight:400;">ADMIN</span></div>
  </nav>
  <main style="padding-top:120px;padding-bottom:40px;max-width:400px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div class="animate-fade-in">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#ff3366,#ff6b3d);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <i class="fas fa-lock" style="font-size:28px;color:white;"></i>
        </div>
        <h2 style="font-size:24px;font-weight:700;">Admin Access</h2>
        <p style="color:#9ca3af;margin-top:8px;font-size:14px;">Enter your admin password to continue</p>
      </div>
      <div class="card gradient-border" style="padding:32px;">
        ${error ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:12px 16px;border-radius:10px;margin-bottom:24px;color:#ef4444;font-size:14px;"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(error)}</div>` : ""}
        <form method="POST" action="/ayocodes-admin/login-post" autocomplete="off">
          <label style="display:block;margin-bottom:8px;font-size:13px;color:#9ca3af;font-weight:500;">PASSWORD</label>
          <input type="password" name="password" placeholder="Enter admin password" autofocus
            style="width:100%;padding:14px 16px;background:${inputBg};border:1px solid ${inputBdr};border-radius:12px;font-size:15px;margin-bottom:20px;outline:none;transition:border-color 0.2s;"
            onfocus="this.style.borderColor='#ff3366'" onblur="this.style.borderColor='${inputBdr}'">
          <button type="submit" class="btn-primary" style="width:100%;padding:14px;">
            <i class="fas fa-sign-in-alt"></i> Login to Dashboard
          </button>
        </form>
      </div>
    </div>
  </main>
</body></html>`
  );
}

// ============================================================
//   ADMIN DASHBOARD HTML — FULLY FIXED
//   FIX: stat values are numeric, not icons; all routes exist;
//        kill button uses data attribute (no XSS); interval cleared on unload
// ============================================================
function adminDashboardHTML() {
  const theme   = ENV.DASHBOARD_THEME;
  const textClr = theme === "dark" ? "#e8e8f0" : "#1a1a2e";
  return (
    sharedHead("AYOBOT — Admin Panel") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:12px;color:#ff3366;font-weight:400;">DEV PANEL</span></div>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <a href="/ayocodes-admin/users" style="color:#9ca3af;font-size:14px;display:flex;align-items:center;gap:6px;"><i class="fas fa-users"></i> Users</a>
      <a href="/ayocodes-admin/analytics" style="color:#9ca3af;font-size:14px;display:flex;align-items:center;gap:6px;"><i class="fas fa-chart-line"></i> Analytics</a>
      <button onclick="logoutAdmin()" class="btn-secondary" style="padding:8px 16px;font-size:13px;"><i class="fas fa-sign-out-alt"></i> Logout</button>
    </div>
  </nav>

  <main style="padding-top:90px;padding-bottom:40px;max-width:1400px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div style="margin-bottom:32px;">
      <h1 style="font-size:28px;font-weight:800;"><span class="gradient-text">Bot Instances</span></h1>
      <p style="color:#9ca3af;margin-top:4px;">Monitor and manage all active bot sessions</p>
    </div>

    <!-- FIX: stat cards use .stat-value div for numbers, not icons -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin-bottom:32px;">
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ff3366;"><i class="fas fa-robot"></i></div>
        <div class="stat-value" id="totalInstances">—</div>
        <div class="stat-label">Total Instances</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#22c55e;"><i class="fas fa-circle-dot"></i></div>
        <div class="stat-value" id="onlineInstances">—</div>
        <div class="stat-label">Online</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ffb347;"><i class="fas fa-comments"></i></div>
        <div class="stat-value" id="totalMessages">—</div>
        <div class="stat-label">Total Messages</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="color:#ff6b3d;"><i class="fas fa-terminal"></i></div>
        <div class="stat-value" id="totalCommands">—</div>
        <div class="stat-label">Total Commands</div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;align-items:center;">
      <button onclick="refreshInstances()" class="btn-secondary" id="refreshBtn"><i class="fas fa-sync-alt"></i> Refresh</button>
      <button onclick="deleteOffline()" class="btn-danger"><i class="fas fa-trash"></i> Delete Offline</button>
      <button onclick="exportData()" class="btn-secondary"><i class="fas fa-download"></i> Export JSON</button>
      <span id="lastRefreshed" style="color:#6b7280;font-size:12px;margin-left:auto;"></span>
    </div>

    <!-- Instances Table -->
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Owner Phone</th>
            <th>Bot Number</th>
            <th>Uptime</th>
            <th>Messages</th>
            <th>Commands</th>
            <th>Auth</th>
            <th style="text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody id="instancesTableBody">
          <tr><td colspan="8" style="text-align:center;padding:60px;">
            <div class="spinner" style="margin:0 auto 16px;"></div>
            <div style="color:#9ca3af;font-size:14px;">Loading instances…</div>
          </td></tr>
        </tbody>
      </table>
    </div>
  </main>

  <script>
    let refreshInterval = null;
    let instancesCache = [];

    async function refreshInstances() {
      const btn = document.getElementById('refreshBtn');
      btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing…';
      try {
        const res = await fetch('/ayocodes-admin/api/instances', { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) { location.href = '/ayocodes-admin/login'; return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        instancesCache = data.instances || [];

        // Update stat cards
        document.getElementById('totalInstances').textContent = (data.total || 0).toLocaleString();
        document.getElementById('onlineInstances').textContent = (data.online || 0).toLocaleString();
        const totalMsg = instancesCache.reduce((s, i) => s + (i.messageCount || 0), 0);
        const totalCmd = instancesCache.reduce((s, i) => s + (i.commandCount || 0), 0);
        document.getElementById('totalMessages').textContent = totalMsg.toLocaleString();
        document.getElementById('totalCommands').textContent = totalCmd.toLocaleString();

        renderTable(instancesCache);
        document.getElementById('lastRefreshed').textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch(e) {
        showAdminToast('Refresh failed: ' + e.message, 'error');
      } finally {
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
      }
    }

    function renderTable(instances) {
      const tbody = document.getElementById('instancesTableBody');
      if (!instances || instances.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:60px;color:#9ca3af;">No active instances found</td></tr>';
        return;
      }
      tbody.innerHTML = instances.map(inst => {
        const up = inst.uptime || 0;
        const h  = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
        const statusClass = inst.connected ? 'status-online' : 'status-offline';
        const statusText  = inst.connected ? 'LIVE' : 'OFFLINE';
        const statusIcon  = inst.connected ? 'fa-circle' : 'fa-circle';
        // FIX: use data-id attribute for kill button — no XSS via inline interpolation
        const instanceIdAttr = encodeURIComponent(inst.instanceId || '');
        return \`<tr>
          <td><span class="status-badge \${statusClass}"><i class="fas \${statusIcon}" style="font-size:8px;"></i> \${statusText}</span></td>
          <td><span style="font-family:monospace;color:#ffb347;">\${inst.ownerPhone ? '+' + inst.ownerPhone : '<span style="color:#6b7280;">—</span>'}</span></td>
          <td><span style="font-family:monospace;">\${inst.botNumber ? '+' + inst.botNumber : '<span style="color:#6b7280;">—</span>'}</span></td>
          <td>\${h}h \${m}m</td>
          <td>\${(inst.messageCount||0).toLocaleString()}</td>
          <td>\${(inst.commandCount||0).toLocaleString()}</td>
          <td><span style="font-size:11px;background:rgba(128,128,128,0.15);padding:4px 10px;border-radius:6px;">\${inst.authMethod || 'session'}</span></td>
          <td style="text-align:right;"><button class="btn-danger" data-id="\${instanceIdAttr}" onclick="killInstance(this)" style="padding:6px 14px;font-size:11px;"><i class="fas fa-skull"></i> Kill</button></td>
        </tr>\`;
      }).join('');
    }

    async function killInstance(btn) {
      const instanceId = decodeURIComponent(btn.getAttribute('data-id') || '');
      if (!instanceId) return;
      if (!confirm('Disconnect and delete this session permanently?')) return;
      btn.disabled = true; btn.textContent = 'Killing…';
      try {
        const res = await fetch('/ayocodes-admin/api/disconnect', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceId })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showAdminToast('Session killed successfully', 'success');
        await refreshInstances();
      } catch(e) {
        showAdminToast('Kill failed: ' + e.message, 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-skull"></i> Kill';
      }
    }

    async function deleteOffline() {
      if (!confirm('Delete ALL offline sessions? This cannot be undone.')) return;
      try {
        const res = await fetch('/ayocodes-admin/api/delete-offline', { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        showAdminToast('Deleted ' + data.deleted + ' offline session(s)', 'success');
        await refreshInstances();
      } catch(e) { showAdminToast('Failed: ' + e.message, 'error'); }
    }

    function exportData() { window.open('/ayocodes-admin/api/export-all', '_blank'); }

    async function logoutAdmin() {
      clearInterval(refreshInterval);
      location.href = '/ayocodes-admin/logout';
    }

    function showAdminToast(msg, type) {
      const el = document.createElement('div');
      el.className = 'toast';
      const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
      const color = type === 'success' ? '#22c55e' : '#ef4444';
      el.innerHTML = '<i class="fas fa-' + icon + '" style="color:' + color + ';margin-right:8px;"></i>' + msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }

    // FIX: clear interval on unload to prevent ghost requests
    refreshInstances();
    refreshInterval = setInterval(refreshInstances, 15000);
    window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
  </script>
</body></html>`
  );
}

// ============================================================
//   ADMIN ANALYTICS HTML — NEW: was missing, caused 404
// ============================================================
function adminAnalyticsHTML() {
  return (
    sharedHead("AYOBOT — Analytics") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:12px;color:#ff3366;font-weight:400;">ANALYTICS</span></div>
    <div style="display:flex;align-items:center;gap:16px;">
      <a href="/ayocodes-admin" style="color:#9ca3af;font-size:14px;"><i class="fas fa-arrow-left"></i> Back</a>
      <button onclick="location.href='/ayocodes-admin/logout'" class="btn-secondary" style="padding:8px 16px;font-size:13px;"><i class="fas fa-sign-out-alt"></i> Logout</button>
    </div>
  </nav>
  <main style="padding-top:90px;padding-bottom:40px;max-width:1400px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div style="margin-bottom:32px;">
      <h1 style="font-size:28px;font-weight:800;"><span class="gradient-text">Analytics</span></h1>
      <p style="color:#9ca3af;margin-top:4px;">System-wide metrics and performance data</p>
    </div>

    <!-- System Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:32px;" id="systemCards">
      <div class="card stat-card"><div class="stat-icon" style="color:#ff3366;"><i class="fas fa-server"></i></div><div class="stat-value" id="sysUptime">—</div><div class="stat-label">Server Uptime (s)</div></div>
      <div class="card stat-card"><div class="stat-icon" style="color:#ff6b3d;"><i class="fas fa-memory"></i></div><div class="stat-value" id="sysMemUsed">—</div><div class="stat-label">Heap Used (MB)</div></div>
      <div class="card stat-card"><div class="stat-icon" style="color:#ffb347;"><i class="fas fa-microchip"></i></div><div class="stat-value" id="sysCpu">—</div><div class="stat-label">CPU Cores</div></div>
      <div class="card stat-card"><div class="stat-icon" style="color:#22c55e;"><i class="fas fa-database"></i></div><div class="stat-value" id="sysNode">—</div><div class="stat-label">Node Version</div></div>
    </div>

    <!-- Charts Row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px;margin-bottom:32px;">
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-chart-area" style="color:#ff3366;"></i> Memory Usage Over Time</h3>
        <canvas id="memTimeline" height="200"></canvas>
      </div>
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-chart-bar" style="color:#ff6b3d;"></i> Session Distribution</h3>
        <canvas id="sessionDist" height="200"></canvas>
      </div>
    </div>

    <!-- Metrics Table -->
    <div class="card" style="padding:24px;">
      <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;"><i class="fas fa-list" style="color:#ffb347;"></i> Detailed Metrics</h3>
      <div id="metricsBody" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div style="color:#9ca3af;text-align:center;padding:40px;">Loading metrics…</div>
      </div>
    </div>
  </main>

  <script>
    let memHistory = [];
    let memChart = null, sessChart = null;
    const isDark = ${JSON.stringify(ENV.DASHBOARD_THEME === "dark")};
    const textColor = isDark ? '#9ca3af' : '#6b7280';

    async function loadMetrics() {
      try {
        const res = await fetch('/api/metrics', { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) { location.href = '/ayocodes-admin/login'; return; }
        const d = await res.json();

        document.getElementById('sysUptime').textContent  = Math.floor(d.uptime || 0).toLocaleString();
        document.getElementById('sysMemUsed').textContent = ((d.memory?.heapUsed || 0) / 1024 / 1024).toFixed(1);
        document.getElementById('sysCpu').textContent     = d.system?.cpuCount || '—';
        document.getElementById('sysNode').textContent    = (d.system?.nodeVersion || '—').replace('v','');

        // Accumulate memory history for timeline
        const usedMB = ((d.memory?.heapUsed || 0) / 1024 / 1024);
        const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        memHistory.push({ t: now, v: parseFloat(usedMB.toFixed(1)) });
        if (memHistory.length > 20) memHistory.shift();

        if (!memChart) {
          const ctx = document.getElementById('memTimeline').getContext('2d');
          memChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: memHistory.map(p => p.t),
              datasets: [{ label: 'Heap MB', data: memHistory.map(p => p.v), borderColor: '#ff3366', backgroundColor: 'rgba(255,51,102,0.1)', fill: true, tension: 0.4, pointRadius: 3 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor, maxTicksLimit: 8 } }, y: { ticks: { color: textColor }, beginAtZero: false } } }
          });
        } else {
          memChart.data.labels = memHistory.map(p => p.t);
          memChart.data.datasets[0].data = memHistory.map(p => p.v);
          memChart.update('none');
        }

        // Session distribution chart
        const online = d.activeSessions ? Math.min(d.activeSessions, 50) : 0;
        const offline = Math.max(0, (d.activeSessions || 0) - online);
        if (!sessChart) {
          const ctx2 = document.getElementById('sessionDist').getContext('2d');
          sessChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
              labels: ['Online', 'Offline'],
              datasets: [{ data: [online, offline], backgroundColor: ['#22c55e', '#6b7280'], borderWidth: 0 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor } } }, cutout: '65%' }
          });
        }

        // Detailed metrics grid
        const entries = [
          ['Total Sessions', d.activeSessions ?? '—'],
          ['Total Messages', (d.totalMessages || 0).toLocaleString()],
          ['Commands Tracked', d.commandStats?.totalCommands ?? '—'],
          ['Banned Users', d.commandStats?.totalBanned ?? '—'],
          ['Groups w/ Warnings', d.commandStats?.totalWarnings ?? '—'],
          ['OS Platform', d.system?.platform ?? '—'],
          ['Total RAM', d.system?.totalMemory ? ((d.system.totalMemory)/1024/1024/1024).toFixed(1) + ' GB' : '—'],
          ['Free RAM', d.system?.freeMemory  ? ((d.system.freeMemory)/1024/1024/1024).toFixed(1)  + ' GB' : '—'],
        ];
        document.getElementById('metricsBody').innerHTML = entries.map(([k,v]) =>
          '<div style="background:rgba(128,128,128,0.05);padding:16px;border-radius:12px;"><div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">' + k + '</div><div style="font-size:20px;font-weight:700;">' + v + '</div></div>'
        ).join('');
      } catch(e) { console.warn('Metrics error:', e); }
    }

    loadMetrics();
    const interval = setInterval(loadMetrics, 10000);
    window.addEventListener('beforeunload', () => clearInterval(interval));
  </script>
</body></html>`
  );
}

// ============================================================
//   USER TRACKING HTML
// ============================================================
function userTrackingHTML() {
  return (
    sharedHead("AYOBOT — User Tracking") +
    `<body>
  <nav class="navbar">
    <div class="logo">AYOBOT <span style="font-size:12px;color:#ff3366;font-weight:400;">USERS</span></div>
    <div style="display:flex;align-items:center;gap:16px;">
      <a href="/ayocodes-admin" style="color:#9ca3af;font-size:14px;"><i class="fas fa-arrow-left"></i> Back</a>
      <button onclick="location.href='/ayocodes-admin/logout'" class="btn-secondary" style="padding:8px 16px;font-size:13px;"><i class="fas fa-sign-out-alt"></i> Logout</button>
    </div>
  </nav>
  <main style="padding-top:90px;padding-bottom:40px;max-width:1200px;margin:0 auto;padding-left:24px;padding-right:24px;">
    <div style="margin-bottom:24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <h2 style="font-size:22px;font-weight:700;flex:1;">Registered Users</h2>
      <input type="text" id="searchInput" placeholder="Search phone or name…" style="padding:10px 16px;background:rgba(128,128,128,0.1);border:1px solid rgba(128,128,128,0.2);border-radius:10px;font-size:14px;width:250px;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#ff3366'" onblur="this.style.borderColor='rgba(128,128,128,0.2)'">
      <span id="userCount" style="color:#9ca3af;font-size:13px;"></span>
    </div>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Phone</th>
            <th>Name</th>
            <th>Last Seen</th>
            <th>Messages</th>
            <th>Sessions</th>
            <th>Auth</th>
          </tr>
        </thead>
        <tbody id="usersTableBody">
          <tr><td colspan="7" style="text-align:center;padding:60px;">
            <div class="spinner" style="margin:0 auto 16px;"></div>
            <div style="color:#9ca3af;font-size:14px;">Loading users…</div>
          </td></tr>
        </tbody>
      </table>
    </div>
    <div id="pagination" style="display:flex;justify-content:center;gap:8px;margin-top:24px;flex-wrap:wrap;"></div>
  </main>
  <script>
    let currentPage = 1, searchTimeout, refreshInterval;

    async function loadUsers(page) {
      currentPage = page || 1;
      const search = document.getElementById('searchInput')?.value.trim() || '';
      try {
        const url = '/ayocodes-admin/api/users?page=' + currentPage + (search ? '&search=' + encodeURIComponent(search) : '');
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) { location.href = '/ayocodes-admin/login'; return; }
        const data = await res.json();

        document.getElementById('userCount').textContent = data.total + ' user(s) found';

        const tbody = document.getElementById('usersTableBody');
        if (!data.users || data.users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:60px;color:#9ca3af;">No users found</td></tr>';
          document.getElementById('pagination').innerHTML = '';
          return;
        }

        tbody.innerHTML = data.users.map(u => {
          const ls  = u.lastSeen ? new Date(u.lastSeen).toLocaleString() : 'Never';
          const sc  = u.online ? 'status-online' : 'status-offline';
          const st  = u.online ? 'ONLINE' : 'OFFLINE';
          return '<tr>' +
            '<td><span class="status-badge ' + sc + '"><i class="fas fa-circle" style="font-size:8px;"></i> ' + st + '</span></td>' +
            '<td><span style="font-family:monospace;color:#ffb347;">+' + (u.phone || '—') + '</span></td>' +
            '<td>' + (u.name || '—') + '</td>' +
            '<td style="font-size:12px;color:#9ca3af;">' + ls + '</td>' +
            '<td>' + (u.totalMessages || 0).toLocaleString() + '</td>' +
            '<td>' + (u.totalSessions || 0) + '</td>' +
            '<td><span style="font-size:11px;background:rgba(128,128,128,0.15);padding:4px 10px;border-radius:6px;">' + (u.authMethod || '—') + '</span></td>' +
          '</tr>';
        }).join('');

        // Pagination
        const pages = Math.ceil((data.total || 0) / 50);
        const maxPages = Math.min(pages, 10);
        let pHtml = '';
        for (let i = 1; i <= maxPages; i++) {
          const active = i === currentPage ? 'style="background:#ff3366;border-color:#ff3366;color:white;"' : '';
          pHtml += '<button onclick="loadUsers(' + i + ')" class="btn-secondary" style="padding:8px 14px;font-size:13px;" ' + active + '>' + i + '</button>';
        }
        if (pages > 10) pHtml += '<span style="color:#9ca3af;padding:8px;">…' + pages + ' pages</span>';
        document.getElementById('pagination').innerHTML = pHtml;
      } catch(e) { console.warn('User load error:', e); }
    }

    document.getElementById('searchInput').addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadUsers(1), 400);
    });

    loadUsers(1);
    refreshInterval = setInterval(() => loadUsers(currentPage), 30000);
    window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
  </script>
</body></html>`
  );
}

// ============================================================
//   SESSION ID MANAGEMENT
// ============================================================
function getOrCreateSessionId(req, res) {
  let sessionId = req.cookies?.ayoSessionId;
  if (!sessionId || !/^[a-f0-9]{32}$/.test(sessionId)) {
    sessionId = crypto.randomBytes(16).toString("hex");
    res.setHeader(
      "Set-Cookie",
      `ayoSessionId=${sessionId}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  }
  return sessionId;
}

// ============================================================
//   ADMIN MIDDLEWARE — consistent across all routes
// ============================================================
function requireAdmin(req, res, next) {
  if (!ENV.AYOCODES_ADMIN_KEY) {
    return res.status(404).send("Not found");
  }
  const token = req.cookies?.ayoAdminToken;
  if (!token || !adminTokens.has(token)) {
    // API routes return JSON, page routes redirect
    if (req.path.includes("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/ayocodes-admin/login");
  }
  next();
}

// ============================================================
//   WEB DASHBOARD ROUTES
// ============================================================
function setupWebDashboard() {
  // Main redirect
  app.get("/", (req, res) => {
    const sid = getOrCreateSessionId(req, res);
    res.redirect(`/dashboard/${sid}`);
  });

  // Per-session dashboard
  app.get("/dashboard/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    // Validate sessionId format
    if (!/^[a-f0-9]{32}$/.test(sessionId)) {
      return res.redirect("/");
    }

    const cookieSid = req.cookies?.ayoSessionId;

    if (cookieSid !== sessionId) {
      const correctSid = cookieSid || sessionId;
      res.setHeader(
        "Set-Cookie",
        `ayoSessionId=${correctSid}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`,
      );
      return res.redirect(`/dashboard/${correctSid}`);
    }

    let session = sessions.get(sessionId);
    if (!session) {
      if (sessions.size >= ENV.MAX_SESSIONS) return res.send(maxSessionsHTML());
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

  // Session status API
  app.get("/api/status/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.json({ exists: false, connected: false });
    res.json({
      exists:         true,
      connected:      session.connected,
      botNumber:      session.botNumber,
      botName:        session.botName,
      ownerPhone:     session.ownerPhone,
      ownerName:      session.ownerName,
      ownerConfirmed: session.ownerConfirmed,
      messageCount:   session.messageCount,
      commandCount:   session.commandCount,
      uptime:         Math.floor((Date.now() - session.startTime) / 1000),
      authMethod:     session.authMethod,
      hasQr:          !!session.qr,
      mode:           session.mode || ENV.BOT_MODE,
      version:        ENV.BOT_VERSION,
      prefix:         ENV.PREFIX,
    });
  });

  // Command stats API
  app.get("/api/command-stats/:sessionId", (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.json({ topCommands: [] });
    const stats = Array.from(commandStats.entries())
      .sort((a, b) => (b[1]?.uses || 0) - (a[1]?.uses || 0))
      .slice(0, 8)
      .map(([name, s]) => ({ name, uses: s?.uses || 0 }));
    res.json({ topCommands: stats });
  });

  // Memory API
  app.get("/api/memory/:sessionId", (req, res) => {
    const mem   = process.memoryUsage();
    const used  = parseFloat((mem.heapUsed  / 1024 / 1024).toFixed(1));
    const total = parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1));
    const free  = parseFloat((total - used).toFixed(1));
    res.json({ used, free, total });
  });

  // Request pairing code
  app.post("/api/request-pairing/:sessionId", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.json({ success: false, error: "Phone number required." });
    let session = sessions.get(req.params.sessionId);
    if (!session) session = await startSession(req.params.sessionId, true);
    if (!session) return res.json({ success: false, error: "Could not create session." });
    res.json(await requestPairingCode(session, phoneNumber));
  });

  // Logout
  app.post("/api/logout/:sessionId", async (req, res) => {
    if (req.cookies?.ayoSessionId !== req.params.sessionId) {
      return res.json({ success: false, error: "Unauthorized" });
    }
    await destroySession(req.params.sessionId);
    res.setHeader("Set-Cookie", "ayoSessionId=; HttpOnly; Path=/; Max-Age=0");
    res.json({ success: true });
  });

  // Waitlist
  app.post("/api/waitlist-join/:sessionId", async (req, res) => {
    const { version } = req.body;
    if (!version) return res.json({ success: false, error: "version required" });
    const session = sessions.get(req.params.sessionId);
    if (!session?.connected || !session.sock || !session.ownerJid) {
      return res.json({ success: false, error: "Bot not connected" });
    }
    const names = {
      v2: "AYOBOT v2 — More dope features + stability",
      v3: "AYOBOT v3 — Telegram + WhatsApp",
    };
    try {
      await session.sock.sendMessage(session.ownerJid, {
        text: `🔔 *Waitlist Confirmed!*\n\nYou're on the waitlist for:\n*${names[version] || version}*\n\n— AYOCODES`,
      });
      res.json({ success: true });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  // ── Admin routes ───────────────────────────────────────────

  app.get("/ayocodes-admin/login", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminLoginHTML());
  });

  app.post("/ayocodes-admin/login-post", authLimiter, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    if (req.body.password !== ENV.AYOCODES_ADMIN_KEY) {
      return res.send(adminLoginHTML("Incorrect password. Please try again."));
    }
    const token    = crypto.randomBytes(24).toString("hex");
    await addAdminToken(token);
    const isHttps  = req.headers["x-forwarded-proto"] === "https" || !!process.env.RENDER;
    const secure   = isHttps ? "; Secure" : "";
    res.setHeader("Set-Cookie", `ayoAdminToken=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${secure}`);
    res.redirect("/ayocodes-admin");
  });

  app.get("/ayocodes-admin/logout", async (req, res) => {
    const token = req.cookies?.ayoAdminToken;
    if (token) await removeAdminToken(token);
    res.setHeader("Set-Cookie", "ayoAdminToken=; HttpOnly; Path=/; Max-Age=0");
    res.redirect("/ayocodes-admin/login");
  });

  // Admin dashboard root
  app.get("/ayocodes-admin", requireAdmin, (req, res) => {
    res.send(adminDashboardHTML());
  });

  // FIX: /ayocodes-admin/analytics route was missing — implemented
  app.get("/ayocodes-admin/analytics", requireAdmin, (req, res) => {
    res.send(adminAnalyticsHTML());
  });

  // Admin users page
  app.get("/ayocodes-admin/users", requireAdmin, (req, res) => {
    res.send(userTrackingHTML());
  });

  // Admin API — instances list (FIX: returns correct numeric values)
  app.get("/ayocodes-admin/api/instances", requireAdmin, (req, res) => {
    const list = Array.from(sessions.values()).map((s) => ({
      instanceId:     s.id,
      ownerPhone:     s.ownerPhone    || null,
      ownerName:      s.ownerName     || null,
      botNumber:      s.botNumber     || null,
      connected:      s.connected,
      messageCount:   s.messageCount  || 0,
      commandCount:   s.commandCount  || 0,
      uptime:         Math.floor((Date.now() - s.startTime) / 1000),
      authMethod:     s.authMethod    || null,
      ownerConfirmed: s.ownerConfirmed,
      mode:           s.mode          || ENV.BOT_MODE,
    }));
    res.json({
      instances: list,
      total:     list.length,
      online:    list.filter((i) => i.connected).length,
    });
  });

  // Admin API — disconnect instance
  app.post("/ayocodes-admin/api/disconnect", requireAdmin, async (req, res) => {
    const { instanceId } = req.body;
    if (!instanceId) return res.status(400).json({ error: "instanceId required" });
    // FIX: sanitize instanceId before use
    const safeId = String(instanceId).replace(/[^a-f0-9]/gi, "").slice(0, 64);
    if (!safeId) return res.status(400).json({ error: "Invalid instanceId" });
    await destroySession(safeId).catch(() => {});
    res.json({ ok: true, instanceId: safeId });
  });

  // Admin API — delete all offline sessions
  app.post("/ayocodes-admin/api/delete-offline", requireAdmin, async (req, res) => {
    const offline = Array.from(sessions.values()).filter((s) => !s.connected);
    let deleted = 0;
    for (const s of offline) {
      try { await destroySession(s.id); deleted++; } catch (_) {}
    }
    res.json({ ok: true, deleted, remaining: sessions.size });
  });

  // Admin API — users list with pagination + search
  app.get("/ayocodes-admin/api/users", requireAdmin, async (req, res) => {
    try {
      await ensureMongoConnection();
      const page   = Math.max(1, parseInt(req.query.page) || 1);
      const limit  = 50;
      const skip   = (page - 1) * limit;
      const search = (req.query.search || "").trim();
      const query  = search
        ? { $or: [
            { phone: { $regex: search, $options: "i" } },
            { name:  { $regex: search, $options: "i" } },
          ] }
        : {};

      const [users, total] = await Promise.all([
        userLogCollection.find(query).sort({ lastSeen: -1 }).skip(skip).limit(limit).toArray(),
        userLogCollection.countDocuments(query),
      ]);

      const activeSessions = new Set(
        Array.from(sessions.values()).filter((s) => s.connected).map((s) => s.ownerPhone).filter(Boolean),
      );

      res.json({
        users: users.map((u) => ({
          phone:         u.phone        || null,
          name:          u.name         || null,
          lastSeen:      u.lastSeen     || null,
          totalMessages: u.totalMessages || 0,
          totalSessions: u.totalSessions || 0,
          authMethod:    u.authMethod   || null,
          online:        activeSessions.has(u.phone),
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    } catch (e) {
      log.err(`Admin users API error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // Admin API — export all data
  app.get("/ayocodes-admin/api/export-all", requireAdmin, async (req, res) => {
    try {
      await ensureMongoConnection();
      const users         = await userLogCollection.find({}).sort({ lastSeen: -1 }).limit(1000).toArray();
      const sessions_data = Array.from(sessions.values()).map((s) => ({
        id:           s.id,
        ownerPhone:   s.ownerPhone   || null,
        ownerName:    s.ownerName    || null,
        botNumber:    s.botNumber    || null,
        connected:    s.connected,
        messageCount: s.messageCount || 0,
        commandCount: s.commandCount || 0,
        authMethod:   s.authMethod   || null,
        mode:         s.mode         || ENV.BOT_MODE,
        uptime:       Math.floor((Date.now() - s.startTime) / 1000),
      }));

      const exportData = {
        exportedAt:     new Date().toISOString(),
        botVersion:     ENV.BOT_VERSION,
        totalUsers:     users.length,
        totalSessions:  sessions.size,
        onlineSessions: sessions_data.filter((s) => s.connected).length,
        users,
        sessions:       sessions_data,
        commandStats:   Array.from(commandStats.entries()).map(([name, s]) => ({ name, ...s })),
      };

      const filename = `ayobot-export-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metrics endpoint — admin protected
  app.get("/api/metrics", requireAdmin, (req, res) => {
    res.json({
      uptime:         process.uptime(),
      memory:         process.memoryUsage(),
      activeSessions: sessions.size,
      totalMessages:  messageCount,
      commandStats: {
        totalCommands: commandUsage.size,
        totalBanned:   bannedUsers.size,
        totalWarnings: groupWarnings.size,
      },
      system: {
        nodeVersion: process.version,
        platform:    process.platform,
        cpuCount:    os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory:  os.freemem(),
      },
    });
  });

  // Health check — public
  app.get("/health", async (req, res) => {
    let dbConnected = false;
    try {
      await mongoClient?.db("admin").command({ ping: 1 });
      dbConnected = true;
    } catch (_) {}

    res.json({
      status:    dbConnected ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime:    process.uptime(),
      sessions:  sessions.size,
      connected: Array.from(sessions.values()).filter((s) => s.connected).length,
      database:  dbConnected ? "connected" : "disconnected",
      version:   ENV.BOT_VERSION,
    });
  });

  // Start HTTP server
  const PORT = ENV.PORT;
  server.listen(PORT, "0.0.0.0", () => {
    log.ok(`Dashboard → http://localhost:${PORT}`);
    if (ENV.AYOCODES_ADMIN_KEY) log.ok(`Admin → http://localhost:${PORT}/ayocodes-admin`);
    const publicUrl = process.env.RENDER_EXTERNAL_URL
      ? process.env.RENDER_EXTERNAL_URL.startsWith("http")
        ? process.env.RENDER_EXTERNAL_URL
        : `https://${process.env.RENDER_EXTERNAL_URL}`
      : `http://localhost:${PORT}`;
    log.ok(`Public → ${publicUrl}\n`);
  });
}

// ============================================================
//   FEATURE LOADER
// ============================================================
async function loadAndDisplayFeatures() {
  const line = "━".repeat(54);
  console.log(`\n┏${line}┓`);
  console.log(`┃           📦 LOADING ALL FEATURE MODULES            ┃`);
  console.log(`┗${line}┛\n`);

  const features = [
    { name: "AI",           path: "./features/ai.js",            emoji: "🤖" },
    { name: "Calculator",   path: "./features/calculator.js",     emoji: "🧮" },
    { name: "Crypto",       path: "./features/crypto.js",         emoji: "💰" },
    { name: "Dictionary",   path: "./features/dictionary.js",     emoji: "📖" },
    { name: "Downloader",   path: "./features/downloader.js",     emoji: "📥" },
    { name: "Encryption",   path: "./features/encryption.js",     emoji: "🔐" },
    { name: "Games",        path: "./features/games.js",          emoji: "🎮" },
    { name: "Image Tools",  path: "./features/imageTools.js",     emoji: "🖼️" },
    { name: "Jokes",        path: "./features/jokes.js",          emoji: "😂" },
    { name: "Movies",       path: "./features/movies.js",         emoji: "🎬" },
    { name: "Music",        path: "./features/music.js",          emoji: "🎵" },
    { name: "News",         path: "./features/news.js",           emoji: "📰" },
    { name: "Notes",        path: "./features/notes.js",          emoji: "📝" },
    { name: "Quotes",       path: "./features/quotes.js",         emoji: "💬" },
    { name: "Reminder",     path: "./features/reminder.js",       emoji: "⏰" },
    { name: "Security",     path: "./features/security.js",       emoji: "🛡️" },
    { name: "Stocks",       path: "./features/stocks.js",         emoji: "📈" },
    { name: "Translation",  path: "./features/translation.js",    emoji: "🌍" },
    { name: "TTS",          path: "./features/tts.js",            emoji: "🗣️" },
    { name: "Unit Convert", path: "./features/unitConverter.js",  emoji: "📏" },
  ];

  let loaded = 0, failed = 0, total = 0;
  for (const f of features) {
    try {
      const mod  = await import(f.path);
      const fns  = Object.keys(mod).filter((k) => typeof mod[k] === "function");
      console.log(`✅ ${f.emoji} ${f.name.padEnd(16)} ➜ ${fns.length} exports`);
      loaded++;
      total += fns.length;
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
//   RESTORE SESSIONS
// ============================================================
async function restoreAllSessions() {
  try {
    await ensureMongoConnection();
    await runOwnerMigration();

    const saved = await sessionMetaCollection.find({ active: true }).toArray();
    log.info(`Restoring ${saved.length} saved session(s)...`);

    for (const s of saved) {
      try {
        const session = await startSession(s.sessionId, false);
        if (session) {
          if (s.mode) session.mode = s.mode;

          const deployerPhone    = _bareNormalize(ENV.ADMIN);
          const storedOwnerPhone = _bareNormalize(s.ownerPhone);

          if (storedOwnerPhone && deployerPhone && storedOwnerPhone === deployerPhone) {
            if (!session.ownerConfirmed) {
              session.ownerJid       = `${storedOwnerPhone}@s.whatsapp.net`;
              session.ownerPhone     = storedOwnerPhone;
              session.ownerName      = s.ownerName || "Owner";
              session.ownerConfirmed = true;
              sessionOwnerMap.set(storedOwnerPhone, session);

              if (session._ownerReadyResolve) {
                session._ownerReadyResolve();
                session._ownerReadyResolve = null;
              }

              log.info(`[${s.sessionId.slice(0, 8)}] Owner restored (deployer): +${storedOwnerPhone}`);
            }
          } else if (storedOwnerPhone) {
            await sessionMetaCollection.updateOne(
              { sessionId: s.sessionId },
              { $unset: { ownerPhone: "", ownerName: "" } },
            ).catch(() => {});
            log.info(`[${s.sessionId.slice(0, 8)}] Cleared polluted owner data (was +${storedOwnerPhone})`);
          } else {
            log.info(`[${s.sessionId.slice(0, 8)}] No owner data — awaiting first DM command`);
          }

          // Wait up to 30s for handlers to be ready
          for (let i = 0; i < 30 && !session.handlersReady; i++) await delay(1000);
          if (session.handlersReady) {
            log.info(`[${s.sessionId.slice(0, 8)}] Session restored successfully`);
          }
        }
      } catch (e) {
        log.warn(`Could not restore session ${s.sessionId}: ${e.message}`);
      }
    }
  } catch (error) {
    log.err(`Failed to restore sessions: ${error.message}`);
  }
}

// ============================================================
//   STARTUP SEQUENCE
// ============================================================
async function main() {
  console.log(`\n${C.bold}${C.cyan}🚀 Starting AYOBOT v${ENV.BOT_VERSION} by AYOCODES…${C.reset}\n`);
  checkEnvVars();

  try {
    await connectMongo();
    await loadPersistedState();
  } catch (error) {
    log.err(`Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }

  setupWebDashboard();

  // FIX: only schedule commandStats save when PERSIST_STATE=true
  if (ENV.PERSIST_STATE) {
    setInterval(() => saveCommandStats(), 5 * 60 * 1000);
  }

  await restoreAllSessions();
  await loadAndDisplayFeatures().catch((e) => log.warn("Feature display: " + e.message));

  console.log(`${C.green}${C.bold}✨ AYOBOT v${ENV.BOT_VERSION} ready.${C.reset}\n`);
}

// ============================================================
//   GRACEFUL SHUTDOWN — FIX: persistence guarded by PERSIST_STATE
// ============================================================
async function gracefulShutdown(sig) {
  console.log(`\n${C.red}🛑 ${sig} — Shutting down gracefully…${C.reset}`);

  // FIX: only save state if PERSIST_STATE is enabled
  if (ENV.PERSIST_STATE) {
    await saveBannedUsers().catch(() => {});
    await saveGroupSettings().catch(() => {});
    await saveWarnings().catch(() => {});
    await saveCommandStats().catch(() => {});
  }

  for (const session of sessions.values()) {
    // Resolve any pending owner-ready promises
    if (session._ownerReadyResolve) {
      session._ownerReadyResolve();
      session._ownerReadyResolve = null;
    }
    if (session.sock) {
      try { session.sock.removeAllListeners(); session.sock.end(); } catch (_) {}
    }
    if (session.pingInterval)     clearInterval(session.pingInterval);
    if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
    if (session.queueTimeout)     clearTimeout(session.queueTimeout);
  }

  // Close WebSocket server
  try { wss.close(); } catch (_) {}

  if (mongoClient) {
    await mongoClient.close().catch(() => {});
  }

  console.error = originalConsoleError;
  console.log(`${C.green}✅ Shutdown complete${C.reset}`);
  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || String(reason);
  if (!msg.includes("Bad MAC") && !msg.includes("Connection Closed")) {
    log.warn("Unhandled rejection: " + msg);
  }
});

process.on("uncaughtException", (e) => {
  if (!e.message?.includes("Bad MAC")) {
    log.err("Uncaught exception: " + e.message);
    console.error(e.stack);
  }
});

main().catch((e) => {
  console.error(`${C.red}❌ Fatal startup error: ${e.message}${C.reset}`);
  console.error(e.stack);
  process.exit(1);
});
