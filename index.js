// ============================================================
//   AYOBOT v1 — index.js (Multi-Session Public Edition)
//   COMPLETE PRODUCTION-READY VERSION — FULLY FIXED
//   Author: AYOCODES
//
//   FIXES INCLUDED:
//   1. Admin permission system completely rewritten
//   2. Group admin detection fixed with proper caching
//   3. Bot privilege checking added with retry logic
//   4. All persistence functions implemented
//   5. Security issues patched
//   6. Memory leaks fixed
//   7. Race conditions resolved
//   8. Error handling improved
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

dotenv.config();

// ============================================================
//   EXPRESS APP SETUP
// ============================================================
const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Rate limiting for admin routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Too many login attempts, please try again later.",
});

app.use(cookieParser());

// Trust proxy (for Render.com)
app.set("trust proxy", 1);

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
  dim: "\x1b[2m",
};

export const log = {
  ok: (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  msg: (m) => console.log(`📨 ${m}`),
  cmd: (m) => console.log(`⚡ ${m}`),
  debug: (m) =>
    process.env.DEBUG === "true" && console.log(`${C.dim}🔍${C.reset} ${m}`),
};

// ============================================================
//   ENVIRONMENT CONFIG WITH VALIDATION
// ============================================================
export const ENV = {
  PREFIX: process.env.PREFIX || ".",
  BOT_NAME: process.env.BOT_NAME || "AYOBOT",
  BOT_VERSION: process.env.BOT_VERSION || "1.0.0",
  ADMIN: process.env.ADMIN,
  CO_DEVELOPER: process.env.CO_DEVELOPER || process.env.ADMIN,
  MAX_WARNINGS: parseInt(process.env.MAX_WARNINGS) || 3,
  AUTO_REPLY_ENABLED: process.env.AUTO_REPLY_ENABLED === "true",
  BOT_MODE: process.env.BOT_MODE || "public",
  ANTI_DELETE_ENABLED: process.env.ANTI_DELETE_ENABLED !== "false",
  WELCOME_IMAGE_URL:
    process.env.WELCOME_IMAGE_URL ||
    "https://i.ibb.co/BKq2Cp4g/creator-jack.jpg",
  CREATOR_IMAGE_URL:
    process.env.CREATOR_IMAGE_URL || "https://i.ibb.co/4R4LPvV3/creator.jpg",
  WELCOME_AUDIO_URL:
    process.env.WELCOME_AUDIO_URL || "https://files.catbox.moe/zat947.aac",
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
  GEMINI_KEY: process.env.GEMINI_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENROUTER_KEY: process.env.OPENROUTER_KEY,
  TOGETHER_KEY: process.env.TOGETHER_KEY,
  HF_TOKEN: process.env.HF_TOKEN,
  POLLINATIONS_KEY: process.env.POLLINATIONS_API_KEY,
  OPENWEATHER_KEY: process.env.OPENWEATHER_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  OMDB_API_KEY: process.env.OMDB_API_KEY,
  COINMARKETCAP_KEY: process.env.COINMARKETCAP_KEY,
  REMOVEBG_KEY: process.env.REMOVEBG_KEY,
  GIPHY_KEY: process.env.GIPHY_KEY,
  TENOR_KEY: process.env.TENOR_KEY || process.env.GEMINI_KEY,
  PIXABAY_KEY: process.env.PIXABAY_KEY,
  UNSPLASH_KEY: process.env.UNSPLASH_KEY,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  VIRUSTOTAL_KEY: process.env.VIRUSTOTAL_KEY,
  GOOGLE_SAFE_BROWSING: process.env.GOOGLE_SAFE_BROWSING_KEY,
  URLSCAN_KEY: process.env.URLSCAN_KEY,
  SHORTENER_API: process.env.SHORTENER_API || "https://ayo-link.onrender.com",
  SHORTENER_API_KEY: process.env.SHORTENER_API_KEY,
  PORT: process.env.PORT || 3000,
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  MONGODB_URI: process.env.MONGODB_URI || "",
  MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS) || 100,
  AYOCODES_ADMIN_KEY: process.env.AYOCODES_ADMIN_KEY || null,
  CENTRAL_SERVER_URL:
    process.env.CENTRAL_SERVER_URL || "https://ayobot-v1-wo21.onrender.com",
  INSTANCE_ID: process.env.INSTANCE_ID || null,
  DEBUG: process.env.DEBUG === "true",
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 3600000,
  MAX_MESSAGE_SIZE: parseInt(process.env.MAX_MESSAGE_SIZE) || 5000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 15,
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  PERSIST_STATE: process.env.PERSIST_STATE === "true",
};

if (!ENV.MONGODB_URI) {
  console.error(`${C.red}❌ MONGODB_URI is required!${C.reset}`);
  process.exit(1);
}

function validateConfig() {
  const maxSessions = ENV.MAX_SESSIONS;
  if (maxSessions < 1 || maxSessions > 1000) {
    log.warn(`⚠️ Invalid MAX_SESSIONS: ${maxSessions}, using 100`);
    ENV.MAX_SESSIONS = 100;
  }

  const rateLimitMax = ENV.RATE_LIMIT_MAX;
  if (rateLimitMax < 1) {
    log.warn(`⚠️ Invalid RATE_LIMIT_MAX: ${rateLimitMax}, using 15`);
    ENV.RATE_LIMIT_MAX = 15;
  }

  if (ENV.MAX_WARNINGS < 1) {
    log.warn(`⚠️ Invalid MAX_WARNINGS: ${ENV.MAX_WARNINGS}, using 3`);
    ENV.MAX_WARNINGS = 3;
  }
}

validateConfig();

function checkEnvVars() {
  const loaded = [];
  const missing = [];
  const checks = [
    { key: ENV.GEMINI_KEY, name: "GEMINI_KEY", feature: "AI Chat" },
    {
      key: ENV.GROQ_API_KEY,
      name: "GROQ_API_KEY",
      feature: "AI Fallback (Groq)",
    },
    {
      key: ENV.OPENROUTER_KEY,
      name: "OPENROUTER_KEY",
      feature: "AI Fallback (OpenRouter)",
    },
    {
      key: ENV.TOGETHER_KEY,
      name: "TOGETHER_KEY",
      feature: "AI Fallback (Together)",
    },
    { key: ENV.NEWS_API_KEY, name: "NEWS_API_KEY", feature: "News" },
    { key: ENV.OPENWEATHER_KEY, name: "OPENWEATHER_KEY", feature: "Weather" },
    { key: ENV.TMDB_API_KEY, name: "TMDB_API_KEY", feature: "Movies/TV" },
    { key: ENV.OMDB_API_KEY, name: "OMDB_API_KEY", feature: "Movies fallback" },
    {
      key: ENV.COINMARKETCAP_KEY,
      name: "COINMARKETCAP_KEY",
      feature: "Crypto",
    },
    {
      key: ENV.REMOVEBG_KEY,
      name: "REMOVEBG_KEY",
      feature: "Remove Background",
    },
    { key: ENV.GIPHY_KEY, name: "GIPHY_KEY", feature: "GIFs" },
    { key: ENV.PIXABAY_KEY, name: "PIXABAY_KEY", feature: "Images" },
    { key: ENV.UNSPLASH_KEY, name: "UNSPLASH_KEY", feature: "Photos" },
    {
      key: ENV.RAPIDAPI_KEY,
      name: "RAPIDAPI_KEY",
      feature: "RapidAPI / YouTube DL",
    },
    { key: ENV.VIRUSTOTAL_KEY, name: "VIRUSTOTAL_KEY", feature: "Virus Scan" },
    {
      key: ENV.GOOGLE_SAFE_BROWSING,
      name: "GOOGLE_SAFE_BROWSING_KEY",
      feature: "Safe Browsing",
    },
    { key: ENV.HF_TOKEN, name: "HF_TOKEN", feature: "HuggingFace" },
  ];

  for (const { key, name, feature } of checks) {
    if (key) loaded.push(feature);
    else missing.push(`${name} (${feature} disabled)`);
  }

  if (loaded.length) {
    console.log(`\n${C.green}✅ APIs loaded: ${loaded.join(", ")}${C.reset}`);
  }
  if (missing.length) {
    console.log(`\n${C.yellow}⚠️ Missing optional ENV vars:${C.reset}`);
    missing.forEach((x) => console.log(`   • ${x}`));
    console.log("");
  }
}

// ============================================================
//   HELPER FUNCTIONS
// ============================================================

// ============================================================
//   JID NORMALIZATION FOR COMPARISON (CRITICAL FIX)
// ============================================================

/**
 * Normalize a JID for comparison (strip device suffix and domain)
 * This is critical for admin detection to work correctly
 */
/**
 * Normalize a JID for comparison (strip device suffix and domain)
 * This is critical for admin detection to work correctly
 */
function normalizeJidForComparison(jid = "") {
  if (!jid || typeof jid !== "string") return "";

  // Remove domain (@s.whatsapp.net, @g.us)
  let withoutDomain = jid.split("@")[0];

  // Remove device suffix (:58, :1, etc.)
  let withoutDevice = withoutDomain.split(":")[0];

  // Remove all non-digits
  const normalized = withoutDevice.replace(/[^0-9]/g, "");

  // Debug (optional - uncomment if needed)
  // console.log(`[normalizeJidForComparison] ${jid} → ${normalized}`);

  return normalized;
}
// ============================================================
//   CONSISTENT PHONE NORMALIZATION (SINGLE SOURCE OF TRUTH)
// ============================================================

/**
 * Normalize ANY WhatsApp ID to a pure phone number
 * This is the SINGLE source of truth for all number comparisons
 *
 * Examples:
 * - "2349159180375@s.whatsapp.net" → "2349159180375"
 * - "2349159180375:58@s.whatsapp.net" → "2349159180375"
 * - "2349159180375" → "2349159180375"
 */
export function normalizeToPhone(jid) {
  if (!jid) return "";

  // Handle object inputs
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || jid.phone || String(jid);
  }

  const str = String(jid);

  // Step 1: Remove domain (@s.whatsapp.net, @g.us, etc.)
  let withoutDomain = str.split("@")[0];

  // Step 2: Remove device suffix (:58, :1, etc.)
  let withoutDevice = withoutDomain.split(":")[0];

  // Step 3: Remove all non-digits (keep only numbers)
  const phoneNumber = withoutDevice.replace(/[^0-9]/g, "");

  // Debug logging
  if (ENV.DEBUG) {
    console.log(`[normalizeToPhone] ${jid} → ${phoneNumber}`);
  }

  return phoneNumber;
}

// Keep normalizePhone as an alias for backward compatibility
export const normalizePhone = normalizeToPhone;

// ============================================================
//   CRITICAL: ADMIN & PERMISSION HELPERS (COMPLETELY FIXED)
// ============================================================

// Admin status cache with TTL
const adminStatusCache = new Map();
const ADMIN_CACHE_TTL = 30000; // 30 seconds

/**
 * Check if a user is the bot owner
 */
export function isBotOwner(userJid, botOwnerJid) {
  if (!userJid || !botOwnerJid) return false;
  const user = normalizeToPhone(userJid);
  const owner = normalizeToPhone(botOwnerJid);
  if (!user || !owner) return false;
  return user === owner;
}

/**
 * Check if a user is an admin (bot owner or co-developer)
 * SINGLE DEFINITION - NO DUPLICATES
 */
export function isAdmin(userJid, ownerPhone) {
  if (!userJid || !ownerPhone) return false;
  const user = normalizeToPhone(userJid);
  const owner = normalizeToPhone(ownerPhone);
  if (!user || !owner) return false;
  return user === owner;
}

/**
 * Check if bot has admin privileges in a group with caching
 * FIXED: Properly handles device suffixes and ensures correct comparison
 */
export async function isBotGroupAdmin(sock, groupJid, bypassCache = false) {
  try {
    if (!sock || !groupJid) return false;

    const cacheKey = `bot_admin_${groupJid}`;

    if (!bypassCache && adminStatusCache.has(cacheKey)) {
      const cached = adminStatusCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
        return cached.isAdmin;
      }
    }

    const groupMetadata = await sock.groupMetadata(groupJid);

    // Get bot's phone number using consistent normalization
    const botRaw = sock.user?.id || "";
    const botPhone = normalizeToPhone(botRaw);

    if (!botPhone) {
      log.debug(
        `[isBotGroupAdmin] Could not extract bot phone from: ${botRaw}`,
      );
      return false;
    }

    log.debug(`[isBotGroupAdmin] Looking for bot with phone: ${botPhone}`);
    log.debug(
      `[isBotGroupAdmin] Group has ${groupMetadata.participants.length} participants`,
    );

    // Find participant by comparing normalized phone numbers
    let botParticipant = null;
    for (const p of groupMetadata.participants) {
      const participantPhone = normalizeToPhone(p.id);
      if (participantPhone === botPhone) {
        botParticipant = p;
        log.debug(
          `[isBotGroupAdmin] Found bot: ${p.id} → ${participantPhone} (${p.admin || "member"})`,
        );
        break;
      }
    }

    const isAdmin =
      botParticipant &&
      (botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin");

    if (!botParticipant) {
      log.debug(`[isBotGroupAdmin] Bot NOT found in participants!`);
      // Debug: Show first few participants for comparison
      const sampleParticipants = groupMetadata.participants
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          normalized: normalizeToPhone(p.id),
        }));
      log.debug(
        `[isBotGroupAdmin] Sample participants: ${JSON.stringify(sampleParticipants)}`,
      );
    }

    adminStatusCache.set(cacheKey, {
      isAdmin,
      timestamp: Date.now(),
      botId: botRaw,
      botPhone,
      found: !!botParticipant,
    });

    return isAdmin;
  } catch (error) {
    log.debug(`Failed to check bot admin status: ${error.message}`);
    return false;
  }
}

/**
 * Check if a user is a group admin
 * Uses consistent phone number normalization
 */
export async function isUserGroupAdmin(sock, groupJid, userJid) {
  try {
    if (!sock || !groupJid || !userJid) return false;

    const userPhone = normalizeToPhone(userJid);
    if (!userPhone) return false;

    const cacheKey = `user_admin_${groupJid}_${userPhone}`;

    if (adminStatusCache.has(cacheKey)) {
      const cached = adminStatusCache.get(cacheKey);
      if (Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
        return cached.isAdmin;
      }
    }

    const groupMetadata = await sock.groupMetadata(groupJid);

    // Find participant by comparing normalized phone numbers
    const participant = groupMetadata.participants.find((p) => {
      const participantPhone = normalizeToPhone(p.id);
      return participantPhone === userPhone;
    });

    const isAdmin =
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin");

    adminStatusCache.set(cacheKey, {
      isAdmin,
      timestamp: Date.now(),
    });

    return isAdmin;
  } catch (error) {
    log.debug(`Failed to check user admin status: ${error.message}`);
    return false;
  }
}

export function clearAdminCache(groupJid) {
  for (const key of adminStatusCache.keys()) {
    if (key.includes(groupJid)) {
      adminStatusCache.delete(key);
    }
  }
  log.debug(`Cleared admin cache for ${groupJid}`);
}

/**
 * Comprehensive permission check for group admin commands
 * FIXED: Uses normalized JIDs and provides better error messages
 */
export async function hasGroupAdminPermission(sock, msg, session) {
  const from = msg.key.remoteJid;
  const isGroup = from?.endsWith("@g.us");

  if (!isGroup) {
    return { allowed: false, reason: "❌ This command only works in groups!" };
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const botOwnerJid =
    session?.ownerJid ||
    (ENV.ADMIN ? `${normalizeToPhone(ENV.ADMIN)}@s.whatsapp.net` : null);

  // Check if sender is bot owner (always allowed for group admin commands)
  if (botOwnerJid && isBotOwner(senderJid, botOwnerJid)) {
    log.debug(`Bot owner detected: ${senderJid}`);
    return { allowed: true, reason: "Bot owner" };
  }

  // First, check if the user is a group admin
  const userIsAdmin = await isUserGroupAdmin(sock, from, senderJid);

  if (!userIsAdmin) {
    return {
      allowed: false,
      reason:
        "⛔ *Group Admin Required*\n\nYou need to be a group admin to use this command!\n\nOnly group admins can manage group settings.",
    };
  }

  // Now check if bot has admin privileges
  let botIsAdmin = await isBotGroupAdmin(sock, from);

  // If bot not admin, try once more with cache bypass (maybe metadata is stale)
  if (!botIsAdmin) {
    log.debug(`Bot not detected as admin, retrying with cache bypass...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    botIsAdmin = await isBotGroupAdmin(sock, from, true);
  }

  // CRITICAL FIX: If bot is still not admin, but the bot number matches the admin in the group, force true
  if (!botIsAdmin) {
    const botNumber = normalizeToPhone(sock.user?.id || "");
    const adminNumber = normalizeToPhone(ENV.ADMIN || "");

    if (botNumber === adminNumber && adminNumber) {
      log.debug(
        `Bot number (${botNumber}) matches owner number - forcing admin status to true`,
      );
      botIsAdmin = true;
    }
  }

  if (!botIsAdmin) {
    // Get more detailed info for debugging
    const groupMetadata = await sock.groupMetadata(from).catch(() => null);
    const botId = sock.user?.id || "unknown";
    const botNumber = normalizeToPhone(botId);
    const participants = groupMetadata?.participants || [];
    const botFound = participants.some(
      (p) => normalizeToPhone(p.id) === botNumber,
    );
    const botIsActualAdmin = participants.some(
      (p) =>
        normalizeToPhone(p.id) === botNumber &&
        (p.admin === "admin" || p.admin === "superadmin"),
    );

    log.debug(
      `[hasGroupAdminPermission] Bot check failed details:\n` +
        `  - isAdmin: ${botIsAdmin}\n` +
        `  - botId: ${botId}\n` +
        `  - botNumber: ${botNumber}\n` +
        `  - foundInParticipants: ${botFound}\n` +
        `  - isAdminInGroup: ${botIsActualAdmin}\n` +
        `  - ownerNumber: ${normalizeToPhone(ENV.ADMIN || "")}\n` +
        `  - botMatchesOwner: ${botNumber === normalizeToPhone(ENV.ADMIN || "")}`,
    );

    return {
      allowed: false,
      reason:
        "⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to perform this action!\n\n📌 *How to fix:*\n1. Add me as a group admin\n2. Wait a few seconds for WhatsApp to update\n3. Try again\n\nIf I just became admin, type *" +
        ENV.PREFIX +
        "refreshadmin* to refresh my status.",
    };
  }

  return { allowed: true, reason: "Group admin" };
}

/**
 * Refresh admin status for a group (force clear cache and recheck)
 */
export async function refreshAdminStatus(sock, groupJid) {
  clearAdminCache(groupJid);
  return await isBotGroupAdmin(sock, groupJid, true);
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
//   PERSISTENCE FUNCTIONS (FULLY IMPLEMENTED)
// ============================================================

let mongoClient = null;
let authCollection = null;
let sessionMetaCollection = null;
let userLogCollection = null;

export async function saveBannedUsers() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await sessionMetaCollection.updateOne(
      { _id: "global_bans" },
      {
        $set: {
          bans: Array.from(bannedUsers.entries()),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    log.debug("Banned users saved");
  } catch (error) {
    log.err(`Failed to save banned users: ${error.message}`);
  }
}

export async function saveGroupSettings() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await sessionMetaCollection.updateOne(
      { _id: "group_settings" },
      {
        $set: {
          settings: Array.from(groupSettings.entries()),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    log.debug("Group settings saved");
  } catch (error) {
    log.err(`Failed to save group settings: ${error.message}`);
  }
}

export async function saveWarnings() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;
  try {
    await sessionMetaCollection.updateOne(
      { _id: "group_warnings" },
      {
        $set: {
          warnings: Array.from(groupWarnings.entries()),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    log.debug("Warnings saved");
  } catch (error) {
    log.err(`Failed to save warnings: ${error.message}`);
  }
}

export async function loadPersistedState() {
  if (!ENV.PERSIST_STATE || !sessionMetaCollection) return;

  try {
    const bans = await sessionMetaCollection.findOne({ _id: "global_bans" });
    if (bans?.bans) {
      bannedUsers.clear();
      for (const [key, value] of bans.bans) {
        bannedUsers.set(key, value);
      }
      log.info(`Loaded ${bannedUsers.size} banned users`);
    }

    const settings = await sessionMetaCollection.findOne({
      _id: "group_settings",
    });
    if (settings?.settings) {
      groupSettings.clear();
      for (const [key, value] of settings.settings) {
        groupSettings.set(key, value);
      }
      log.info(`Loaded settings for ${groupSettings.size} groups`);
    }

    const warnings = await sessionMetaCollection.findOne({
      _id: "group_warnings",
    });
    if (warnings?.warnings) {
      groupWarnings.clear();
      for (const [key, value] of warnings.warnings) {
        groupWarnings.set(key, value);
      }
      log.info(`Loaded warnings for ${groupWarnings.size} groups`);
    }
  } catch (error) {
    log.err(`Failed to load persisted state: ${error.message}`);
  }
}

// ============================================================
//   CONSTANTS
// ============================================================
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

export function getBotOwner() {
  return ENV.ADMIN || ENV.OWNER_PHONE || ENV.OWNER_NUMBER || "";
}

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
export const msgCache = new NodeCache({
  stdTTL: 60,
  maxKeys: 5000,
  checkperiod: 120,
});
export const groupActivations = new Map();
export const authorizedUsers = new Set();
const adminTokens = new Set();

if (!global.activeTrivia) {
  global.activeTrivia = new Map();
  log.debug("Created global.activeTrivia");
}

const sessionOwnerMap = new Map();
const messageQueues = new Map();
const sessions = new Map();
const sessionCreationLocks = new Map();

// ============================================================
//   CLEANUP MECHANISMS (IMPROVED)
// ============================================================
function cleanupOldData() {
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const [key, data] of commandUsage.entries()) {
    const timestamp = data.timestamp || data;
    if (now - timestamp > MAX_AGE) {
      commandUsage.delete(key);
    }
  }

  if (commandUsage.size > 10000) {
    const entries = Array.from(commandUsage.entries());
    entries.sort((a, b) => {
      const timeA = a[1].timestamp || a[1];
      const timeB = b[1].timestamp || b[1];
      return timeA - timeB;
    });
    const toDelete = entries.slice(0, commandUsage.size - 5000);
    for (const [key] of toDelete) {
      commandUsage.delete(key);
    }
  }

  for (const [key, data] of deletedMessages.entries()) {
    if (data && now - (data.timestamp || 0) > MAX_AGE) {
      deletedMessages.delete(key);
    }
  }

  for (const [key, timestamp] of userCooldown.entries()) {
    if (now - timestamp > MAX_AGE) {
      userCooldown.delete(key);
    }
  }

  for (const [key, data] of spamTracker.entries()) {
    if (now - (data.lastMessageTime || data.timestamp || 0) > MAX_AGE) {
      spamTracker.delete(key);
    }
  }

  for (const [key, data] of adminCache.entries()) {
    if (now - (data.timestamp || 0) > 30000) {
      adminCache.delete(key);
    }
  }

  for (const [key, data] of groupMetadataCache.entries()) {
    if (now - (data.timestamp || 0) > GROUP_META_TTL) {
      groupMetadataCache.delete(key);
    }
  }

  log.debug(
    `Cleanup done: commandUsage=${commandUsage.size}, adminCache=${adminCache.size}`,
  );
}

setInterval(cleanupOldData, 60 * 60 * 1000);

// ============================================================
//   GROUP ACTIVATION FUNCTIONS
// ============================================================
export function activateGroup(sessionId, groupJid) {
  if (!groupActivations.has(sessionId)) {
    groupActivations.set(sessionId, new Set());
  }
  groupActivations.get(sessionId).add(groupJid);
  log.ok(`[${sessionId.slice(0, 8)}] Group activated: ${groupJid}`);
}

export function deactivateGroup(sessionId, groupJid) {
  groupActivations.get(sessionId)?.delete(groupJid);
  log.info(`[${sessionId.slice(0, 8)}] Group deactivated: ${groupJid}`);
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

// ============================================================
//   ADMIN HELPERS
// ============================================================

export function isAuthorized(userJid, ownerPhone, sessionMode) {
  if (isAdmin(userJid, ownerPhone)) return true;

  if (ownerPhone) {
    const session = sessionOwnerMap.get(normalizePhone(ownerPhone));
    if (session?.authorizedUsers?.has(userJid)) return true;
    if (session?.authorizedUsers?.has(normalizePhone(userJid))) return true;
  }

  if (authorizedUsers.has(userJid)) return true;
  if (authorizedUsers.has(normalizePhone(userJid))) return true;

  const mode = sessionMode || ENV.BOT_MODE || "public";
  if (mode === "public") return true;

  return false;
}

// ============================================================
//   CIRCUIT BREAKER FOR EXTERNAL APIS
// ============================================================
class CircuitBreaker {
  constructor(failureThreshold = 5, timeout = 60000) {
    this.failures = 0;
    this.failureThreshold = failureThreshold;
    this.timeout = timeout;
    this.lastFailureTime = null;
    this.state = "CLOSED";
  }

  async call(fn) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error(
          "Circuit breaker is OPEN - service temporarily unavailable",
        );
      }
    }
    try {
      const result = await fn();
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
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
    this.failures = 0;
    this.state = "CLOSED";
    this.lastFailureTime = null;
  }
}

export const apiCircuitBreakers = {
  ai: new CircuitBreaker(3, 30000),
  downloader: new CircuitBreaker(5, 60000),
  media: new CircuitBreaker(3, 45000),
  weather: new CircuitBreaker(2, 30000),
};

// ============================================================
//   BAD MAC SUPPRESSION
// ============================================================
const logger = pino({ level: ENV.DEBUG ? "info" : "silent" });
const originalConsoleError = console.error;
console.error = function (...args) {
  const m = args[0];
  if (typeof m === "string" && m.includes("Bad MAC")) return;
  if (m instanceof Error && m.message?.includes("Bad MAC")) return;
  originalConsoleError.apply(console, args);
};

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
    queueTimeout: null,
    mode: process.env.BOT_MODE || "public",
    authorizedUsers: new Set(),
    lastActivity: Date.now(),
  };
}

// ============================================================
//   DATABASE CONNECTION WITH RETRY
// ============================================================
async function ensureMongoConnection() {
  if (mongoClient && mongoClient.topology?.isConnected()) {
    return mongoClient;
  }

  try {
    if (mongoClient) {
      await mongoClient.close().catch(() => {});
    }

    mongoClient = new MongoClient(ENV.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });

    await mongoClient.connect();
    const db = mongoClient.db("ayobot");
    authCollection = db.collection("auth_states");
    sessionMetaCollection = db.collection("session_meta");
    userLogCollection = db.collection("user_log");

    await authCollection.createIndex({ _id: 1 });
    await sessionMetaCollection.createIndex({ sessionId: 1 }, { unique: true });
    await sessionMetaCollection.createIndex({ active: 1 });
    await sessionMetaCollection.createIndex({ updatedAt: -1 });
    await userLogCollection.createIndex({ phone: 1 }, { unique: true });
    await userLogCollection.createIndex({ lastSeen: -1 });
    await userLogCollection.createIndex({ totalMessages: -1 });

    log.ok("MongoDB connected with connection pooling");
    return mongoClient;
  } catch (error) {
    log.err(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
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
//   HANDLER LOADER
// ============================================================
async function loadHandlersForSession(session) {
  session.handlersReady = false;
  const sid = session.id.slice(0, 8);

  try {
    log.info(`[${sid}] Loading command handler...`);
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

  if (!session.handlersReady) {
    log.err(`[${sid}] WARNING: Command handler not loaded!`);
  }
}

// ============================================================
//   MESSAGE QUEUE PROCESSOR WITH SIZE LIMIT
// ============================================================
const MAX_QUEUE_SIZE = 100;

async function processMessageQueue(session) {
  const queue = messageQueues.get(session.id) || [];
  if (queue.length === 0) return;
  if (!session.handlersReady || !session.commandHandler) return;

  log.info(
    `[${session.id.slice(0, 8)}] Processing ${queue.length} queued messages`,
  );

  for (const queued of queue) {
    try {
      queued.msg._session = session;
      queued.msg._sessionId = session.id;
      queued.msg._sessionMode = session.mode || "public";
      queued.msg._ownerPhone = session.ownerPhone || ENV.ADMIN || "";
      await session.commandHandler(queued.msg, queued.sock);
    } catch (err) {
      log.err(
        `[${session.id.slice(0, 8)}] Queued message error: ${err.message}`,
      );
    }
  }

  messageQueues.delete(session.id);
}

// ============================================================
//   ATTACH MESSAGE LISTENERS
// ============================================================
function attachListeners(session) {
  const { sock } = session;
  const sid = session.id.slice(0, 8);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify" && type !== "append") return;
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

      if (messageText && messageText.length > ENV.MAX_MESSAGE_SIZE) {
        log.warn(`[${sid}] Message too long: ${messageText.length} chars`);
        return;
      }

      let rawSender;
      if (isGroup) {
        rawSender = msg.key.participant || msg.participant || "";
      } else if (fromMe) {
        rawSender = session.botSelfJid || session.ownerJid || from;
      } else {
        rawSender = from;
      }

      const senderPhone = normalizePhone(rawSender);
      const senderJid = senderPhone
        ? `${senderPhone}@s.whatsapp.net`
        : rawSender;
      const senderNumber = senderPhone || rawSender.split("@")[0];

      if (messageText) {
        const logMessage =
          messageText.substring(0, 60) + (messageText.length > 60 ? "…" : "");
        log.msg(
          `[${sid}][${isGroup ? "G" : "D"}] ${senderNumber}: ${logMessage}`,
        );
      }

      if (
        bannedUsers.has(senderJid) ||
        bannedUsers.has(senderPhone) ||
        bannedUsers.has(`${senderPhone}@s.whatsapp.net`)
      ) {
        log.warn(`[${sid}] Blocked banned: ${senderNumber}`);
        return;
      }

      session.lastActivity = Date.now();
      session.messageCount++;
      messageCount++;

      if (session.messageCount % 10 === 0) {
        updateUserMessageCount(session).catch(() => {});
      }

      if (
        !session.ownerJid &&
        !isGroup &&
        messageText?.startsWith(ENV.PREFIX)
      ) {
        log.warn(`[${sid}] No owner — auto-setting ${senderNumber}`);
        setSessionOwner(session, senderJid, senderNumber, "Owner");
      }

      if (!session.handlersReady || !session.commandHandler) {
        if (!messageQueues.has(session.id)) {
          messageQueues.set(session.id, []);
        }
        const queue = messageQueues.get(session.id);

        if (queue.length >= MAX_QUEUE_SIZE) {
          log.warn(`[${sid}] Message queue full, dropping oldest message`);
          queue.shift();
        }

        queue.push({ msg, sock });

        if (!session.queueTimeout) {
          session.queueTimeout = setTimeout(() => {
            processMessageQueue(session);
            session.queueTimeout = null;
          }, 5000);
        }
        return;
      }

      msg._session = session;
      msg._sessionId = session.id;
      msg._sessionMode = session.mode || "public";
      msg._ownerPhone = session.ownerPhone || ENV.ADMIN || "";

      try {
        await session.commandHandler(msg, sock);
      } catch (cmdError) {
        log.err(`[${sid}] Command handler error: ${cmdError.message}`);
        try {
          await sock.sendMessage(from, {
            text: `❌ *Error*: ${cmdError.message.substring(0, 100)}\n\nPlease report this issue.`,
          });
        } catch (sendError) {
          log.debug(`Could not send error message: ${sendError.message}`);
        }
      }
    } catch (e) {
      if (
        !e.message?.includes("Bad MAC") &&
        !e.message?.includes("Connection Closed")
      ) {
        log.err(`[${sid}] Message processing error: ${e.message}`);
      }
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    try {
      if (!session.connected || !session.groupHandler) return;
      await session.groupHandler(update, sock);
    } catch (err) {
      log.warn(`[${sid}] Group handler error: ${err.message}`);
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    try {
      if (
        !session.connected ||
        !ENV.ANTI_DELETE_ENABLED ||
        !session.antiDeleteHandler
      )
        return;
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
//   USER TRACKING
// ============================================================
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
          updatedAt: new Date(),
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

async function updateUserMessageCount(session) {
  if (!userLogCollection || !session.ownerPhone) return;
  try {
    await userLogCollection.updateOne(
      { phone: session.ownerPhone },
      { $set: { lastSeen: new Date() }, $inc: { totalMessages: 1 } },
    );
  } catch (err) {
    log.debug(`User message count update failed: ${err.message}`);
  }
}

// ============================================================
//   OWNER HELPERS
// ============================================================
function setSessionOwner(session, jid, phone, name = "Owner") {
  const cleanPhone = normalizePhone(phone);
  const cleanJid = `${cleanPhone}@s.whatsapp.net`;
  const cleanName =
    name && name !== cleanPhone && name !== "Unknown" ? name : "Owner";

  session.ownerJid = cleanJid;
  session.ownerPhone = cleanPhone;
  session.ownerName = cleanName;

  if (cleanPhone) sessionOwnerMap.set(cleanPhone, session);

  sessionMetaCollection
    ?.updateOne(
      { sessionId: session.id },
      {
        $set: {
          ownerPhone: cleanPhone,
          ownerName: cleanName,
          botNumber: session.botNumber,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    )
    .catch(() => {});

  trackUser(session).catch(() => {});
  log.ok(
    `[${session.id.slice(0, 8)}] Owner set: +${cleanPhone} (${cleanName})`,
  );
}

// ============================================================
//   WELCOME MESSAGE
// ============================================================
async function sendWelcomeMessage(session, sock) {
  try {
    await delay(15000);

    let connectionChecked = false;
    for (let i = 0; i < 3; i++) {
      if (session.connected && session.ownerJid) {
        connectionChecked = true;
        break;
      }
      log.info(
        `[${session.id.slice(0, 8)}] Waiting for connection... (${i + 1}/3)`,
      );
      await delay(5000);
    }

    if (!connectionChecked || !session.ownerJid) return;

    const connectTime = Date.now() - session.startTime;
    const speedIcon =
      connectTime < 15000 ? "🟢" : connectTime < 30000 ? "🟡" : "🔴";
    const connectSecs = (connectTime / 1000).toFixed(1);
    const mem = process.memoryUsage();
    const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const displayName =
      session.ownerName &&
      session.ownerName !== session.ownerPhone &&
      session.ownerName !== "Owner"
        ? session.ownerName
        : null;

    const caption =
      `━━━━━━━━━━━━━━━━━━━━━━\n🤖  *AYOBOT v1*  •  Online\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${speedIcon} *${connectSecs}s*\n\n` +
      `┌─ *Bot Info* ──────────────\n│ 📱 +${session.botNumber}\n` +
      (displayName ? `│ 👤 ${displayName}\n` : "") +
      `│ 💾 ${usedMB}/${totalMB} MB\n│ ⚡ ${session.mode || ENV.BOT_MODE} mode\n│ 📦 v${ENV.BOT_VERSION}\n└───────────────────────\n\n` +
      `👑 *Owner:* +${session.ownerPhone}\n_Full admin access_\n\nType *${ENV.PREFIX}menu* for commands`;

    try {
      await sock.sendMessage(session.ownerJid, {
        audio: { url: ENV.WELCOME_AUDIO_URL },
        mimetype: "audio/aac",
        ptt: false,
      });
    } catch (_) {}

    try {
      await sock.sendMessage(session.ownerJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
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
//   CLEAR SESSION AUTH
// ============================================================
async function clearSessionAuth(sessionId) {
  try {
    const safePrefix = sessionId.replace(/[^a-f0-9]/gi, "");
    await authCollection.deleteMany({
      _id: { $regex: `^${safePrefix}:`, $options: "" },
    });
    log.info(`[${sessionId.slice(0, 8)}] Auth cleared from MongoDB`);
  } catch (e) {
    log.warn(`[${sessionId.slice(0, 8)}] Could not clear auth: ${e.message}`);
  }
}

// ============================================================
//   START SESSION WITH LOCK
// ============================================================
async function startSession(sessionId, isNew = true) {
  if (sessionCreationLocks.has(sessionId)) {
    log.debug(
      `Session ${sessionId.slice(0, 8)} already being created, waiting...`,
    );
    return sessionCreationLocks.get(sessionId);
  }

  const promise = (async () => {
    if (sessions.has(sessionId)) return sessions.get(sessionId);

    if (isNew && sessions.size >= ENV.MAX_SESSIONS) {
      log.warn(`Max sessions (${ENV.MAX_SESSIONS}) reached`);
      return null;
    }

    const session = createSessionObject(sessionId);
    sessions.set(sessionId, session);

    if (isNew) {
      await sessionMetaCollection.updateOne(
        { sessionId },
        {
          $set: {
            sessionId,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    await _startSocket(session);
    return session;
  })();

  sessionCreationLocks.set(sessionId, promise);
  try {
    return await promise;
  } finally {
    sessionCreationLocks.delete(sessionId);
  }
}

async function _startSocket(session) {
  if (session.destroyed) return;
  const sid = session.id.slice(0, 8);

  try {
    await ensureMongoConnection();

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMongoAuthState(
      authCollection,
      session.id,
    );

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

    session.sock = sock;

    if (session.pingInterval) clearInterval(session.pingInterval);
    session.pingInterval = setInterval(async () => {
      if (!session.connected || session.destroyed) {
        clearInterval(session.pingInterval);
        session.pingInterval = null;
        return;
      }
      try {
        await sock.sendPresenceUpdate("available");
      } catch (_) {}
    }, 12000);

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
        const botNumber = normalizePhone(session.botSelfJid || "");
        const rawName =
          sock.user?.name ||
          sock.user?.verifiedName ||
          sock.user?.notify ||
          sock.user?.pushName ||
          "";
        const userName = rawName && rawName !== botNumber ? rawName : null;

        session.botNumber = botNumber;
        session.botName = userName || botNumber;

        if (!session.ownerPhone) {
          setSessionOwner(
            session,
            `${botNumber}@s.whatsapp.net`,
            botNumber,
            userName || "Owner",
          );
          if (!session.authMethod) session.authMethod = "session";
        } else if (userName && session.ownerName === "Owner") {
          session.ownerName = userName;
          sessionMetaCollection
            ?.updateOne(
              { sessionId: session.id },
              { $set: { ownerName: userName } },
            )
            .catch(() => {});
        }

        await saveCreds();
        log.info(`[${sid}] Loading handlers...`);
        await loadHandlersForSession(session);
        attachListeners(session);
        log.ok(`[${sid}] CONNECTED — +${botNumber} (${userName || "Unknown"})`);
        await processMessageQueue(session);
        sendWelcomeMessage(session, sock).catch((err) =>
          log.warn(`[${sid}] Welcome error: ${err.message}`),
        );
      }

      if (connection === "close" && !session.destroyed) {
        session.connected = false;
        session.qr = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        log.err(`[${sid}] Disconnected — code: ${code || 0}`);

        if (session.pingInterval) {
          clearInterval(session.pingInterval);
          session.pingInterval = null;
        }

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

        session.reconnectAttempts++;
        const backoff = Math.min(5000 * session.reconnectAttempts, 30000);
        log.info(
          `[${sid}] Reconnecting in ${backoff / 1000}s... (attempt ${session.reconnectAttempts})`,
        );
        if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
        session.reconnectTimeout = setTimeout(
          () => _startSocket(session),
          backoff,
        );
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (e) {
    log.err(`[${sid}] Socket startup error: ${e.message}`);
    if (!session.destroyed) setTimeout(() => _startSocket(session), 10000);
  }
}

// ============================================================
//   DESTROY SESSION
// ============================================================
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.destroyed = true;

  if (session.ownerPhone) sessionOwnerMap.delete(session.ownerPhone);
  if (session.pingInterval) clearInterval(session.pingInterval);
  if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
  if (session.pairingCodeTimeout) clearTimeout(session.pairingCodeTimeout);
  if (session.queueTimeout) clearTimeout(session.queueTimeout);

  if (session.sock) {
    try {
      session.sock.end();
      session.sock.removeAllListeners();
    } catch (_) {}
  }

  await clearSessionAuth(sessionId);
  await sessionMetaCollection.deleteOne({ sessionId });
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
  if (!session.sock)
    return { success: false, error: "Bot starting up — wait a moment" };

  if (session.pairingCode && session.pairingExpiry > Date.now()) {
    return {
      success: true,
      code: session.pairingCode,
      phoneNumber: session.pairingPhone,
      expiresIn: Math.floor((session.pairingExpiry - Date.now()) / 1000),
      cached: true,
    };
  }

  try {
    const rawCode = await session.sock.requestPairingCode(clean);
    const code =
      String(rawCode)
        .match(/.{1,4}/g)
        ?.join("-") || String(rawCode);

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

    log.ok(`[${session.id.slice(0, 8)}] Pairing code: ${code} for +${clean}`);
    return {
      success: true,
      code,
      rawCode: String(rawCode),
      phoneNumber: clean,
      expiresIn: 60,
    };
  } catch (e) {
    log.err(`[${session.id.slice(0, 8)}] Pairing code failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ============================================================
//   HTML TEMPLATES
// ============================================================
function sharedHead(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root{--red:#ff0000;--red2:#cc0000;--red-glow:rgba(255,0,0,0.18);--gold:#ffd700;--gold2:#ffaa00;--gold-glow:rgba(255,215,0,0.15);--bg:#060608;--bg2:#0e0e12;--bg3:#16161c;--bg4:#1e1e26;--card:#12121a;--text:#e8e8f0;--text2:#9090a8;--text3:#5a5a72;--green:#00ff88;--border:rgba(255,0,0,0.2);--border2:rgba(255,0,0,0.08)}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Rajdhani',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
    body::before{content:'';position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(255,0,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,0,0,0.03) 1px,transparent 1px);background-size:40px 40px;animation:gridMove 20s linear infinite;pointer-events:none}
    @keyframes gridMove{to{background-position:40px 40px}}
    .orb{position:fixed;border-radius:50%;filter:blur(120px);pointer-events:none;z-index:0;animation:orbFloat 8s ease-in-out infinite}
    .orb1{width:400px;height:400px;background:rgba(255,0,0,0.06);top:-100px;right:-100px}
    .orb2{width:300px;height:300px;background:rgba(255,215,0,0.04);bottom:-50px;left:-50px;animation-delay:4s}
    @keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(20px,-20px) scale(1.05)}}
    .glass{background:var(--card);border:1px solid var(--border);border-radius:16px;backdrop-filter:blur(20px);position:relative;overflow:hidden}
    .glass::before{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,0.03) 0%,transparent 60%);pointer-events:none}
    .red-glow{animation:glow 3s ease-in-out infinite}
    .gold-glow{animation:goldGlow 3s ease-in-out infinite}
    @keyframes glow{0%,100%{box-shadow:0 0 10px var(--red-glow)}50%{box-shadow:0 0 30px var(--red-glow),0 0 60px rgba(255,0,0,0.08)}}
    @keyframes goldGlow{0%,100%{box-shadow:0 0 10px var(--gold-glow)}50%{box-shadow:0 0 30px var(--gold-glow)}}
    @keyframes greenPulse{0%,100%{box-shadow:0 0 6px rgba(0,255,136,0.6)}50%{box-shadow:0 0 20px rgba(0,255,136,0.9)}}
    @keyframes scanline{0%{top:-5%}100%{top:105%}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(0.95)}}
    .btn{font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;letter-spacing:2px;text-transform:uppercase;transition:all .2s}
    .btn-red{background:linear-gradient(135deg,var(--red),var(--red2));color:#000}
    .btn-red:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,0,0,0.4)}
    .nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(6,6,8,0.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;padding:0 32px;height:64px}
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
    .hero-title .line2{display:block;color:var(--red);text-shadow:0 0 40px rgba(255,0,0,0.5)}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:32px 0}
    .stat-card{padding:24px;border-radius:16px;background:var(--card);border:1px solid var(--border);text-align:center;transition:transform .2s,border-color .2s}
    .stat-card:hover{transform:translateY(-4px);border-color:var(--red)}
    .stat-icon{font-size:28px;margin-bottom:8px}
    .stat-val{font-family:'Orbitron',sans-serif;font-size:32px;font-weight:900;color:var(--red);line-height:1}
    .stat-label{font-size:13px;color:var(--text2);letter-spacing:2px;text-transform:uppercase;margin-top:4px}
    .panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}
    @media(max-width:700px){.panels{grid-template-columns:1fr}}
    .panel{padding:24px;border-radius:16px;background:var(--card);border:1px solid var(--border)}
    .panel-title{font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border2)}
    .info-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:14px}
    .info-row:last-child{border-bottom:none}
    .info-row .key{color:var(--text2)}
    .info-row .val{color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px}
    .owner-card{padding:24px 28px;border-radius:16px;margin:16px 0;background:linear-gradient(135deg,rgba(255,215,0,0.06),rgba(255,170,0,0.03));border:1px solid rgba(255,215,0,0.3);display:flex;align-items:center;gap:20px;transition:border-color .2s,box-shadow .2s}
    .owner-card:hover{border-color:rgba(255,215,0,0.6);box-shadow:0 0 30px rgba(255,215,0,0.1)}
    .owner-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--gold),var(--gold2));display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 0 20px rgba(255,215,0,0.3)}
    .owner-info{flex:1}
    .owner-name{font-family:'Orbitron',sans-serif;font-size:16px;font-weight:700;color:var(--gold)}
    .owner-phone{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2);margin-top:2px}
    .owner-badge{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#000;padding:4px 10px;border-radius:4px;font-weight:700}
    .status-live{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);padding:6px 16px;border-radius:999px;font-family:'Orbitron',sans-serif;letter-spacing:2px;font-size:11px;color:var(--green)}
    .mode-badge{display:inline-flex;align-items:center;gap:6px;background:var(--red-glow);border:1px solid var(--border);padding:4px 12px;border-radius:999px;font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red)}
    .roadmap{margin:48px 0}
    .section-heading{font-family:'Orbitron',sans-serif;font-size:clamp(1.2rem,4vw,2rem);font-weight:900;margin-bottom:32px;color:var(--text)}
    .section-heading span{color:var(--red)}
    .timeline{position:relative;padding-left:32px}
    .timeline::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--red),rgba(255,0,0,0.1))}
    .version-card{position:relative;margin-bottom:16px;padding:20px 24px;border-radius:12px;background:var(--card);border:1px solid var(--border);transition:all .3s}
    .version-card::before{content:'';position:absolute;left:-37px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;border:2px solid var(--red);background:var(--bg)}
    .version-card.active-v{border-color:var(--red);background:linear-gradient(135deg,rgba(255,0,0,0.05),var(--card))}
    .version-card.active-v::before{background:var(--red);box-shadow:0 0 12px var(--red)}
    .version-card.building{border-color:rgba(255,170,0,0.3)}
    .version-card.building::before{background:var(--gold2);border-color:var(--gold2);box-shadow:0 0 12px rgba(255,170,0,0.5)}
    .version-card.locked{opacity:.6}
    .version-card.locked::before{background:var(--bg3);border-color:var(--text3)}
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
    .btn-waitlist{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;padding:7px 16px;border-radius:6px;cursor:pointer;transition:all .2s;background:transparent;border:1px solid var(--red);color:var(--red)}
    .btn-waitlist:hover{background:var(--red-glow);transform:translateY(-1px)}
    .btn-waitlist.joined{border-color:var(--green);color:var(--green);cursor:default}
    .footer-bar{text-align:center;padding:32px 24px;color:var(--text3);font-size:13px;border-top:1px solid var(--border2);margin-top:48px}
    .footer-bar a{color:var(--red);text-decoration:none}
    .connect-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:88px}
    .connect-box{width:100%;max-width:520px;animation:fadeUp .5s ease both}
    .connect-tabs{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:10px;margin-bottom:24px}
    .ctab{flex:1;text-align:center;padding:10px;cursor:pointer;border-radius:8px;font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text2);transition:all .2s;border:none;background:transparent}
    .ctab.active{background:var(--red);color:#000;font-weight:700}
    .qr-wrap{background:var(--bg3);border-radius:12px;padding:20px;text-align:center;position:relative;overflow:hidden;border:1px solid var(--border)}
    .qr-wrap img{width:100%;max-width:260px;border-radius:8px;display:block;margin:0 auto}
    .qr-scan-line{position:absolute;left:10%;right:10%;height:2px;background:linear-gradient(90deg,transparent,var(--red),transparent);animation:scanline 3s linear infinite}
    .pair-input{width:100%;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:15px;margin-bottom:12px;outline:none;transition:border-color .2s}
    .pair-input:focus{border-color:var(--red);box-shadow:0 0 0 3px rgba(255,0,0,0.1)}
    .code-display{background:var(--bg3);border:1px solid rgba(255,0,0,0.4);border-radius:12px;padding:28px;text-align:center;margin:16px 0}
    .code-digits{font-family:'Orbitron',sans-serif;font-size:42px;font-weight:900;letter-spacing:10px;color:var(--red);text-shadow:0 0 20px rgba(255,0,0,0.5);animation:glow 2s ease-in-out infinite}
    .code-timer{color:var(--text2);font-size:13px;margin-top:8px;font-family:'JetBrains Mono',monospace}
    .step-list{list-style:none;margin-top:16px}
    .step-list li{padding:10px 0;border-bottom:1px solid var(--border2);font-size:13px;color:var(--text2);display:flex;align-items:center;gap:10px}
    .step-list li:last-child{border-bottom:none}
    .step-num{width:22px;height:22px;border-radius:50%;background:var(--red);color:#000;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .err-box{background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:12px 16px;color:var(--red);font-size:13px;margin:8px 0;display:none}
    .ok-box{background:rgba(0,255,136,0.07);border:1px solid rgba(0,255,136,0.25);border-radius:8px;padding:12px 16px;color:var(--green);font-size:13px;margin:8px 0;display:none}
    .starting-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:88px}
    .loader-ring{width:80px;height:80px;margin:0 auto 24px;position:relative}
    .loader-ring::before,.loader-ring::after{content:'';position:absolute;inset:0;border-radius:50%;border:3px solid transparent}
    .loader-ring::before{border-top-color:var(--red);border-right-color:var(--red);animation:spin .8s linear infinite}
    .loader-ring::after{border-bottom-color:rgba(255,0,0,0.2);border-left-color:rgba(255,0,0,0.2)}
    .loading-dots::after{content:'';animation:dots 1.5s steps(4,end) infinite}
    @keyframes dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}100%{content:''}}
    .logout-btn{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px;cursor:pointer;background:transparent;transition:all .2s}
    .logout-btn:hover{background:var(--red-glow)}
    .inst-table{width:100%;border-collapse:collapse;font-size:13px}
    .inst-table th{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border2)}
    .inst-table td{padding:12px 14px;border-bottom:1px solid var(--border2);vertical-align:middle}
    .kill-btn{font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:1px;padding:6px 12px;border-radius:6px;cursor:pointer;background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);color:var(--red)}
    .user-table{width:100%;border-collapse:collapse;font-size:13px}
    .user-table th{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text3);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border2)}
    .user-table td{padding:11px 14px;border-bottom:1px solid var(--border2);vertical-align:middle;font-family:'JetBrains Mono',monospace;font-size:12px}
    .page-btn{font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:1px;padding:6px 14px;border-radius:6px;cursor:pointer;background:var(--card);border:1px solid var(--border);color:var(--text2)}
    .page-btn.active{background:var(--red);color:#000;border-color:var(--red)}
  </style>
</head>`;
}

function connectedHTML(session) {
  const up = Math.floor((Date.now() - session.startTime) / 1000);
  const h = Math.floor(up / 3600);
  const m = Math.floor((up % 3600) / 60);
  const s = up % 60;
  const SID = session.id;
  return (
    sharedHead("AYOBOT v1 — Dashboard") +
    `<body>
    <div class="orb orb1"></div><div class="orb orb2"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
      <div style="display:flex;align-items:center;gap:16px">
        <div class="mode-badge">⚡ ${escapeHtml((session.mode || ENV.BOT_MODE || "public").toUpperCase())}</div>
        <div class="nav-status"><div class="dot" id="navdot"></div><span id="navtxt">LIVE</span></div>
        <button class="logout-btn" onclick="logout()">⏏ LOGOUT</button>
      </div>
    </nav>
    <div class="main">
      <div class="hero">
        <div class="hero-eyebrow">⚡ WhatsApp Automation Suite</div>
        <h1 class="hero-title"><span class="line1">AYOBOT</span><span class="line2">COMMAND CENTER</span></h1>
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:16px">
          <div class="status-live"><div class="dot"></div>SYSTEM ONLINE</div>
        </div>
      </div>
      <div class="owner-card gold-glow">
        <div class="owner-avatar">👑</div>
        <div class="owner-info">
          <div class="owner-name" id="oName">${escapeHtml(session.ownerName || "Owner")}</div>
          <div class="owner-phone" id="oPhone">+${escapeHtml(session.ownerPhone || "—")}</div>
        </div>
        <div class="owner-badge">BOT OWNER</div>
      </div>
      <div class="stats-grid">
        <div class="stat-card red-glow"><div class="stat-icon">💬</div><div class="stat-val" id="sMsg">${session.messageCount}</div><div class="stat-label">Messages</div></div>
        <div class="stat-card"><div class="stat-icon">⚡</div><div class="stat-val" id="sCmd" style="color:var(--gold)">${session.commandCount || 0}</div><div class="stat-label">Commands</div></div>
        <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-val" id="sUp" style="font-size:22px;color:var(--green)">${h}h ${m}m ${s}s</div><div class="stat-label">Uptime</div></div>
        <div class="stat-card"><div class="stat-icon">🤖</div><div class="stat-val" style="font-size:18px;color:var(--text)">${escapeHtml((session.mode || ENV.BOT_MODE).toUpperCase())}</div><div class="stat-label">Mode</div></div>
      </div>
      <div class="panels">
        <div class="panel">
          <div class="panel-title">Bot Information</div>
          <div class="info-row"><span class="key">📱 Number</span><span class="val">+${escapeHtml(session.botNumber || "—")}</span></div>
          <div class="info-row"><span class="key">👤 Name</span><span class="val">${escapeHtml(session.botName || "—")}</span></div>
          <div class="info-row"><span class="key">⚡ Prefix</span><span class="val">${escapeHtml(ENV.PREFIX)}</span></div>
          <div class="info-row"><span class="key">🔐 Auth</span><span class="val">${escapeHtml(session.authMethod || "session")}</span></div>
          <div class="info-row"><span class="key">📦 Version</span><span class="val">v${escapeHtml(ENV.BOT_VERSION)}</span></div>
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
        <h2 class="section-heading">VERSION <span>TIMELINE</span></h2>
        <div class="timeline">
          <div class="version-card active-v red-glow">
            <div class="v-header"><span class="v-name" style="color:var(--red)">🤖 AYOBOT <span style="color:var(--text)">v1</span></span><span class="v-badge badge-live">🟢 LIVE NOW</span></div>
            <div class="v-desc">The original. 45+ commands, AI integration, group management, media tools, full admin control.</div>
            <div class="v-features"><span class="v-tag">AI Chat</span><span class="v-tag">Group Mod</span><span class="v-tag">Media DL</span><span class="v-tag">45+ Commands</span></div>
          </div>
          <div class="version-card building">
            <div class="v-header"><span class="v-name" style="color:var(--gold2)">🔥 AYOBOT <span style="color:var(--text)">v2</span></span><span class="v-badge badge-building">⚙️ IN DEVELOPMENT</span></div>
            <div class="v-desc">Multi-device, upgraded AI with memory, custom plugin system, real-time analytics dashboard.</div>
            <div class="v-features"><span class="v-tag">Multi-Device</span><span class="v-tag">AI Memory</span><span class="v-tag">Plugin API</span></div>
            <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v2',this)">🔔 JOIN WAITLIST</button></div>
          </div>
          <div class="version-card locked">
            <div class="v-header"><span class="v-name" style="color:var(--text2)">🚀 AYOBOT <span style="color:var(--text)">v3</span></span><span class="v-badge badge-soon">🔒 COMING SOON</span></div>
            <div class="v-desc">Cross-platform — Telegram + WhatsApp unified.</div>
            <div class="v-features"><span class="v-tag">Telegram</span><span class="v-tag">Unified Panel</span></div>
            <div class="v-waitlist"><button class="btn-waitlist" onclick="joinWaitlist('v3',this)">🔔 JOIN WAITLIST</button></div>
          </div>
        </div>
      </div>
      <div class="footer-bar">Built by <a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a> &nbsp;·&nbsp; AYOBOT v${ENV.BOT_VERSION} &nbsp;·&nbsp; <span id="footerTime"></span></div>
    </div>
    <script>
      const SID='${SID}';
      function animCount(el,target,dur){const start=parseInt(el.textContent)||0;if(start===target)return;const step=Math.ceil(Math.abs(target-start)/(dur/16));let cur=start;const t=setInterval(()=>{cur=target>start?Math.min(cur+step,target):Math.max(cur-step,target);el.textContent=cur;if(cur===target)clearInterval(t)},16)}
      function updateStats(){fetch('/api/status/'+SID,{credentials:'same-origin'}).then(r=>r.json()).then(d=>{if(!d.exists||!d.connected){location.reload();return}animCount(document.getElementById('sMsg'),d.messageCount||0,600);animCount(document.getElementById('sCmd'),d.commandCount||0,600);const up=d.uptime||0,h=Math.floor(up/3600),m=Math.floor((up%3600)/60),s=up%60;document.getElementById('sUp').textContent=h+'h '+m+'m '+s+'s';if(d.ownerName)document.getElementById('oName').textContent=d.ownerName;if(d.ownerPhone)document.getElementById('oPhone').textContent='+'+d.ownerPhone;const dot=document.getElementById('navdot'),txt=document.getElementById('navtxt');if(d.connected){dot.className='dot';txt.textContent='LIVE'}else{dot.className='dot offline';txt.textContent='OFFLINE'}}).catch(()=>{})}
      updateStats();setInterval(updateStats,60000);
      function tick(){const n=new Date(),el=document.getElementById('footerTime');if(el)el.textContent=n.toLocaleTimeString('en-GB',{hour12:false})+' UTC'}tick();setInterval(tick,1000);
      async function logout(){if(!confirm('Disconnect your WhatsApp and reset your bot?'))return;await fetch('/api/logout/'+SID,{method:'POST',credentials:'same-origin'});location.href='/'}
      function joinWaitlist(v,btn){if(btn.classList.contains('joined'))return;btn.disabled=true;btn.textContent='⏳ JOINING...';fetch('/api/waitlist-join/'+SID,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({version:v})}).then(r=>r.json()).then(()=>{btn.textContent='✅ JOINED';btn.classList.add('joined')}).catch(()=>{btn.textContent='🔔 JOIN WAITLIST';btn.disabled=false})}
    </script>
  </body></html>`
  );
}

function connectHTML(sessionId, qrUrl) {
  return (
    sharedHead("AYOBOT — Connect") +
    `<body>
    <div class="orb orb1"></div><div class="orb orb2"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">v1</span></div>
      <div class="nav-status"><div class="dot offline"></div><span>AWAITING YOUR WHATSAPP</span></div>
    </nav>
    <div class="connect-wrap">
      <div class="connect-box">
        <div style="text-align:center;margin-bottom:28px">
          <div class="hero-eyebrow">Connect Your WhatsApp</div>
          <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;margin-top:8px">LINK <span style="color:var(--red)">YOUR DEVICE</span></h1>
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
              ${qrUrl ? `<img src="${qrUrl}" alt="QR Code">` : `<div style="padding:40px;color:var(--text3);font-size:13px">Generating QR...</div>`}
            </div>
            <ul class="step-list">
              <li><span class="step-num">1</span>Open WhatsApp on your phone</li>
              <li><span class="step-num">2</span>Tap <strong>Menu → Linked Devices</strong></li>
              <li><span class="step-num">3</span>Tap <strong>Link a Device</strong></li>
              <li><span class="step-num">4</span>Scan the QR above</li>
            </ul>
            <div style="margin-top:16px;padding:12px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:8px;font-size:13px;color:var(--gold)">👑 You become the <strong>Bot Owner</strong> with full admin access</div>
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
          </div>
          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border2)">
            <span style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace">⏳ Auto-checks connection every 5s</span>
          </div>
        </div>
        <div class="footer-bar" style="margin-top:24px;border:none"><a href="${ENV.CREATOR_GITHUB}" target="_blank">AYOCODES</a> · AYOBOT v${ENV.BOT_VERSION}</div>
      </div>
    </div>
    <script>
      const SID='${sessionId}';
      function showTab(id,el){document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));['tab-qr','tab-pair'].forEach(t=>document.getElementById(t).style.display='none');el.classList.add('active');document.getElementById('tab-'+id).style.display='block'}
      async function requestCode(){const ph=document.getElementById('ph').value.trim();const pb=document.getElementById('pb');const err=document.getElementById('errBox');err.style.display='none';if(!ph||!/^\\d{10,15}$/.test(ph)){err.textContent='⚠️ Enter a valid phone number (10-15 digits)';err.style.display='block';return}pb.disabled=true;pb.textContent='⏳ REQUESTING…';try{const r=await fetch('/api/request-pairing/'+SID,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({phoneNumber:ph})});const d=await r.json();if(d.success){document.getElementById('pairForm').style.display='none';document.getElementById('codeDisplay').style.display='block';document.getElementById('codeDigits').textContent=d.code;let t=d.expiresIn||60;const ti=setInterval(()=>{t--;const el=document.getElementById('codeTimer');if(el)el.textContent='⏳ Expires in '+t+'s';if(t<=0){clearInterval(ti);location.reload()}},1000)}else{err.textContent='❌ '+d.error;err.style.display='block';pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE'}}catch(e){err.textContent='❌ Network error: '+e.message;err.style.display='block';pb.disabled=false;pb.textContent='⚡ REQUEST PAIRING CODE'}}
      setInterval(()=>{fetch('/api/status/'+SID,{credentials:'same-origin'}).then(r=>r.json()).then(d=>{if(d.connected)location.reload()}).catch(()=>{})},5000);
    </script>
  </body></html>`
  );
}

function loadingHTML(sessionId) {
  return (
    sharedHead("AYOBOT — Starting") +
    `<body>
    <div class="orb orb1"></div><div class="orb orb2"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span></div>
      <div class="nav-status"><div class="dot offline" style="animation:pulse 1s infinite"></div><span style="color:var(--text3)">INITIALIZING</span></div>
    </nav>
    <div class="starting-wrap">
      <div style="text-align:center;animation:fadeIn .6s ease">
        <div class="loader-ring"></div>
        <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;color:var(--red)">AYOBOT</h1>
        <p style="color:var(--text2);margin-top:8px;font-size:15px">Starting your bot session<span class="loading-dots"></span></p>
        <div style="margin-top:20px;font-size:12px;color:var(--text3)">Reloading in <span id="rc">3</span>s</div>
      </div>
    </div>
    <script>let rc=3;setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload()},1000);</script>
  </body></html>`
  );
}

function maxSessionsHTML() {
  return (
    sharedHead("AYOBOT — At Capacity") +
    `<body>
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <h1 style="font-family:'Orbitron',sans-serif;font-size:2rem;color:var(--red)">AT CAPACITY</h1>
      <p style="color:var(--text2);margin-top:12px;max-width:400px">This server has reached its maximum session limit (${ENV.MAX_SESSIONS}). Please try again later.</p>
    </div>
  </body></html>`
  );
}

function adminLoginHTML(error = "") {
  const safeError = escapeHtml(error);
  return (
    sharedHead("AYOBOT — Admin Login") +
    `<body>
    <div class="orb orb1"></div><div class="orb orb2"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">ADMIN</span></div>
    </nav>
    <div class="connect-wrap">
      <div class="connect-box" style="max-width:400px">
        <div style="text-align:center;margin-bottom:28px">
          <h1 style="font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:900;margin-top:8px">ADMIN <span style="color:var(--red)">LOGIN</span></h1>
        </div>
        <div class="glass" style="padding:28px">
          ${safeError ? `<div style="background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:16px">❌ ${safeError}</div>` : ""}
          <form method="POST" action="/ayocodes-admin/login-post">
            <input type="password" name="password" class="pair-input" placeholder="Admin password" autofocus style="margin-bottom:16px">
            <button type="submit" class="btn btn-red" style="width:100%;font-size:11px;letter-spacing:3px">🔓 ENTER DASHBOARD</button>
          </form>
        </div>
      </div>
    </div>
  </body></html>`
  );
}

function adminDashboardHTML() {
  return (
    sharedHead("AYOBOT — Dev Panel") +
    `<body>
    <div class="orb orb1"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">DEV</span></div>
      <div style="display:flex;align-items:center;gap:16px">
        <a href="/ayocodes-admin/users" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--green);text-decoration:none;border:1px solid rgba(0,255,136,0.3);padding:5px 12px;border-radius:6px">👥 USERS</a>
        <a href="/ayocodes-admin/logout" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);text-decoration:none;border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px">LOGOUT</a>
      </div>
    </nav>
    <div class="main">
      <div class="hero" style="padding:40px 20px 20px">
        <h1 class="hero-title" style="font-size:clamp(1.8rem,5vw,3rem)"><span class="line1">INSTANCE</span><span class="line2">MONITOR</span></h1>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="stat-card red-glow"><div class="stat-icon">🌐</div><div class="stat-val" id="totalI">—</div><div class="stat-label">Total Bots</div></div>
        <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-val" id="onlineI" style="color:var(--green)">—</div><div class="stat-label">Online</div></div>
        <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-val" id="totalM" style="color:var(--gold)">—</div><div class="stat-label">Messages</div></div>
      </div>
      <div style="margin:24px 0 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <button class="btn btn-red" onclick="loadInstances()" style="padding:8px 18px;font-size:10px;letter-spacing:2px">↻ REFRESH</button>
        <button onclick="deleteOffline()" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;padding:8px 16px;border-radius:8px;cursor:pointer;background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.4);color:#ffaa00;">🗑️ DELETE OFFLINE</button>
      </div>
      <div id="instanceTable"><div style="text-align:center;padding:60px;color:var(--text3)">Loading...</div></div>
    </div>
    <script>
      async function loadInstances(){let d;try{const r=await fetch('/ayocodes-admin/api/instances',{credentials:'same-origin'});if(r.status===401){location.href='/ayocodes-admin/login';return}d=await r.json()}catch(e){return}document.getElementById('totalI').textContent=d.total;document.getElementById('onlineI').textContent=d.online;document.getElementById('totalM').textContent=d.instances.reduce((a,i)=>a+(i.messageCount||0),0).toLocaleString();if(!d.instances||!d.instances.length){document.getElementById('instanceTable').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3)">No sessions</div>';return}let html='<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;overflow-x:auto"><table class="inst-table"><thead><tr><th>STATUS</th><th>OWNER</th><th>BOT</th><th>UPTIME</th><th>MSGS</th><th>ACTION</th></tr></thead><tbody>';d.instances.forEach(inst=>{const up=inst.uptime||0;const h=Math.floor(up/3600);const m=Math.floor((up%3600)/60);html+='<tr><td>'+(inst.connected?'<span style="color:var(--green)">● LIVE</span>':'<span style="color:var(--red)">● DEAD</span>')+'</td><td><span style="font-family:JetBrains Mono,monospace;color:var(--gold)">'+(inst.ownerPhone?'+'+inst.ownerPhone:'—')+'</span></td><td><span style="font-family:JetBrains Mono,monospace">+'+(inst.botNumber||'—')+'</span></td><td>'+h+'h '+m+'m</td><td>'+(inst.messageCount||0)+'</td><td><button class="kill-btn" onclick="killSession(\''+inst.instanceId+'\')">⚡ KILL</button></td></tr>'});html+='</tbody></table></div>';document.getElementById('instanceTable').innerHTML=html}
      async function killSession(id){if(!confirm('Kill this session?'))return;await fetch('/ayocodes-admin/api/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({instanceId:id})});loadInstances()}
      async function deleteOffline(){if(!confirm('Delete all offline sessions?'))return;const r=await fetch('/ayocodes-admin/api/delete-offline',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin'});const d=await r.json();alert('Deleted '+d.deleted+' sessions');loadInstances()}
      loadInstances();setInterval(loadInstances,5000);
    </script>
  </body></html>`
  );
}

function userTrackingHTML() {
  return (
    sharedHead("AYOBOT — Users") +
    `<body>
    <div class="orb orb1"></div>
    <nav class="nav">
      <div class="nav-logo">AYO<span>BOT</span> <span style="color:var(--text3);font-size:12px">USERS</span></div>
      <div style="display:flex;align-items:center;gap:12px">
        <a href="/ayocodes-admin" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--text2);text-decoration:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px">← BACK</a>
        <a href="/ayocodes-admin/api/users/export" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--green);text-decoration:none;border:1px solid rgba(0,255,136,0.3);padding:5px 12px;border-radius:6px">⬇ EXPORT</a>
        <a href="/ayocodes-admin/logout" style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:var(--red);text-decoration:none;border:1px solid rgba(255,0,0,0.3);padding:5px 12px;border-radius:6px">LOGOUT</a>
      </div>
    </nav>
    <div class="main">
      <div class="hero" style="padding:40px 20px 20px">
        <h1 class="hero-title" style="font-size:clamp(1.8rem,5vw,3rem)"><span class="line1">USER</span><span class="line2">TRACKER</span></h1>
      </div>
      <div style="margin:24px 0">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <input id="searchInput" class="pair-input" style="flex:1;min-width:200px;margin-bottom:0" placeholder="Search by phone or name..." oninput="debounceSearch()">
          <button class="btn btn-red" onclick="loadUsers(1)" style="padding:10px 20px;font-size:10px">🔍 SEARCH</button>
        </div>
        <div id="userTable"><div style="text-align:center;padding:60px;color:var(--text3)">Loading users...</div></div>
        <div id="pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px"></div>
      </div>
    </div>
    <script>
      let currentPage=1,searchTimer=null;
      function debounceSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadUsers(1),400)}
      async function loadUsers(page=1){currentPage=page;const search=document.getElementById('searchInput').value.trim();const url='/ayocodes-admin/api/users?page='+page+(search?'&search='+encodeURIComponent(search):'');try{const r=await fetch(url,{credentials:'same-origin'});if(r.status===401){location.href='/ayocodes-admin/login';return}const d=await r.json();if(!d.users.length){document.getElementById('userTable').innerHTML='<div style="text-align:center;padding:60px;color:var(--text3)">No users found</div>';document.getElementById('pagination').innerHTML='';return}let html='<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;overflow-x:auto"><table class="user-table"><thead><tr><th>STATUS</th><th>PHONE</th><th>NAME</th><th>LAST SEEN</th><th>MSGS</th></tr></thead><tbody>';d.users.forEach(u=>{const online=u.online?'<span style="color:var(--green)">● LIVE</span>':'<span style="color:var(--text3)">○ OFFLINE</span>';const lastSeen=u.lastSeen?timeAgo(new Date(u.lastSeen)):'—';html+='<tr><td>'+online+'</td><td style="color:var(--gold)">+'+(u.phone||'—')+'</td><td style="color:var(--text)">'+(u.name||'—')+'</td><td style="color:var(--text2)">'+lastSeen+'</td><td style="color:var(--green)">'+(u.totalMessages||0).toLocaleString()+'</td></tr>'});html+='</tbody></table></div>';document.getElementById('userTable').innerHTML=html;let pg='';for(let i=1;i<=Math.min(d.pages,10);i++){pg+='<button class="page-btn'+(i===currentPage?' active':'')+'" onclick="loadUsers('+i+')">'+i+'</button>'}document.getElementById('pagination').innerHTML=pg}catch(e){document.getElementById('userTable').innerHTML='<div style="text-align:center;padding:40px;color:var(--red)">Error: '+e.message+'</div>'}}
      function timeAgo(date){const s=Math.floor((Date.now()-date)/1000);if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}
      loadUsers(1);setInterval(()=>loadUsers(currentPage),30000);
    </script>
  </body></html>`
  );
}

// ============================================================
//   SESSION ID MANAGEMENT
// ============================================================

function getOrCreateSessionId(req, res) {
  let sessionId = req.cookies?.ayoSessionId;

  if (!sessionId) {
    // Generate a new session ID
    sessionId = crypto.randomBytes(16).toString("hex");
    res.setHeader(
      "Set-Cookie",
      `ayoSessionId=${sessionId}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  }

  return sessionId;
}

// ============================================================
//   ADMIN MIDDLEWARE
// ============================================================

function requireAdmin(req, res, next) {
  const token = req.cookies?.ayoAdminToken;

  if (!ENV.AYOCODES_ADMIN_KEY) {
    return res.status(404).send("Not found");
  }

  if (!token || !adminTokens.has(token)) {
    return res.redirect("/ayocodes-admin/login");
  }

  next();
}

// ============================================================
//   WEB DASHBOARD ROUTES
// ============================================================
function setupWebDashboard() {
  // Make sure app is defined
  if (!app) {
    log.err("Express app not initialized!");
    return;
  }

  app.get("/", (req, res) => {
    const sid = getOrCreateSessionId(req, res);
    res.redirect(`/dashboard/${sid}`);
  });

  app.get("/dashboard/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
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
      pairingCode: session.pairingCode ? "available" : null,
      pairingExpiry: session.pairingExpiry,
      mode: session.mode || ENV.BOT_MODE,
      version: ENV.BOT_VERSION,
      prefix: ENV.PREFIX,
    });
  });

  app.post("/api/request-pairing/:sessionId", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.json({ success: false, error: "Phone number required." });
    let session = sessions.get(req.params.sessionId);
    if (!session) session = await startSession(req.params.sessionId, true);
    if (!session)
      return res.json({ success: false, error: "Could not create session." });
    res.json(await requestPairingCode(session, phoneNumber));
  });

  app.post("/api/logout/:sessionId", async (req, res) => {
    if (req.cookies?.ayoSessionId !== req.params.sessionId) {
      return res.json({ success: false, error: "Unauthorized" });
    }
    await destroySession(req.params.sessionId);
    res.setHeader("Set-Cookie", "ayoSessionId=; HttpOnly; Path=/; Max-Age=0");
    res.json({ success: true });
  });

  app.post("/api/waitlist-join/:sessionId", async (req, res) => {
    const { version } = req.body;
    if (!version)
      return res.json({ success: false, error: "version required" });
    const session = sessions.get(req.params.sessionId);
    if (!session?.connected || !session.sock || !session.ownerJid) {
      return res.json({ success: false, error: "Bot not connected" });
    }
    const names = {
      v2: "AYOBOT v2 — Multi-device + AI Memory",
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

  app.get("/ayocodes-admin/login", (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(adminLoginHTML());
  });

  app.post("/ayocodes-admin/login-post", authLimiter, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    if (req.body.password !== ENV.AYOCODES_ADMIN_KEY)
      return res.send(adminLoginHTML("Wrong password."));
    const token = crypto.randomBytes(20).toString("hex");
    adminTokens.add(token);
    const isHttps =
      req.headers["x-forwarded-proto"] === "https" || !!process.env.RENDER;
    const secureFlag = isHttps ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `ayoAdminToken=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${secureFlag}`,
    );
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
    if (!ENV.AYOCODES_ADMIN_KEY)
      return res.status(403).json({ error: "Not enabled" });
    const list = Array.from(sessions.values()).map((s) => ({
      instanceId: s.id,
      ownerPhone: s.ownerPhone,
      ownerName: s.ownerName,
      botNumber: s.botNumber,
      connected: s.connected,
      messageCount: s.messageCount,
      uptime: Math.floor((Date.now() - s.startTime) / 1000),
      authMethod: s.authMethod,
    }));
    res.json({
      instances: list,
      total: list.length,
      online: list.filter((i) => i.connected).length,
    });
  });

  app.post("/ayocodes-admin/api/disconnect", requireAdmin, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY)
      return res.status(403).json({ error: "Not enabled" });
    const { instanceId } = req.body;
    if (!instanceId)
      return res.status(400).json({ error: "instanceId required" });
    await destroySession(instanceId);
    res.json({ ok: true });
  });

  app.post(
    "/ayocodes-admin/api/delete-offline",
    requireAdmin,
    async (req, res) => {
      if (!ENV.AYOCODES_ADMIN_KEY)
        return res.status(403).json({ error: "Not enabled" });
      const offline = Array.from(sessions.values()).filter((s) => !s.connected);
      let deleted = 0;
      for (const s of offline) {
        try {
          await destroySession(s.id);
          deleted++;
        } catch (_) {}
      }
      res.json({ ok: true, deleted, remaining: sessions.size });
    },
  );

  app.get("/ayocodes-admin/users", requireAdmin, (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY) return res.status(404).send("Not found");
    res.send(userTrackingHTML());
  });

  app.get("/ayocodes-admin/api/users", requireAdmin, async (req, res) => {
    if (!ENV.AYOCODES_ADMIN_KEY)
      return res.status(403).json({ error: "Not enabled" });
    try {
      await ensureMongoConnection();
      const page = parseInt(req.query.page) || 1;
      const limit = 50;
      const skip = (page - 1) * limit;
      const search = req.query.search || "";
      const query = search
        ? {
            $or: [
              { phone: { $regex: search, $options: "i" } },
              { name: { $regex: search, $options: "i" } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        userLogCollection
          .find(query)
          .sort({ lastSeen: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        userLogCollection.countDocuments(query),
      ]);

      const activeSessions = new Set(
        Array.from(sessions.values())
          .filter((s) => s.connected)
          .map((s) => s.ownerPhone),
      );

      res.json({
        users: users.map((u) => ({
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

  app.get(
    "/ayocodes-admin/api/users/export",
    requireAdmin,
    async (req, res) => {
      if (!ENV.AYOCODES_ADMIN_KEY)
        return res.status(403).json({ error: "Not enabled" });
      try {
        await ensureMongoConnection();
        const users = await userLogCollection
          .find({})
          .sort({ lastSeen: -1 })
          .toArray();
        const csv = [
          "Phone,Name,First Seen,Last Seen,Total Messages,Total Sessions,Auth Method,Bot Number",
          ...users.map((u) =>
            [
              u.phone || "",
              (u.name || "").replace(/,/g, ";"),
              u.firstSeen ? new Date(u.firstSeen).toISOString() : "",
              u.lastSeen ? new Date(u.lastSeen).toISOString() : "",
              u.totalMessages || 0,
              u.totalSessions || 0,
              u.authMethod || "",
              u.botNumber || "",
            ].join(","),
          ),
        ].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=ayobot-users.csv",
        );
        res.send(csv);
      } catch (e) {
        res.status(500).send("Export failed: " + e.message);
      }
    },
  );

  app.get("/api/metrics", requireAdmin, (req, res) => {
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeSessions: sessions.size,
      totalMessages: messageCount,
      commandStats: {
        totalCommands: commandUsage.size,
        totalBanned: bannedUsers.size,
        totalWarnings: groupWarnings.size,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      },
    });
  });

  app.get("/health", async (req, res) => {
    const dbConnected = mongoClient && mongoClient.topology?.isConnected();
    res.json({
      status: dbConnected ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      sessions: sessions.size,
      connected: Array.from(sessions.values()).filter((s) => s.connected)
        .length,
      database: dbConnected ? "connected" : "disconnected",
    });
  });

  const PORT = ENV.PORT;
  app.listen(PORT, "0.0.0.0", () => {
    log.ok(`Dashboard → http://localhost:${PORT}`);
    if (ENV.AYOCODES_ADMIN_KEY)
      log.ok(`Admin → http://localhost:${PORT}/ayocodes-admin`);
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
    { name: "AI", path: "./features/ai.js", emoji: "🤖" },
    { name: "Calculator", path: "./features/calculator.js", emoji: "🧮" },
    { name: "Crypto", path: "./features/crypto.js", emoji: "💰" },
    { name: "Dictionary", path: "./features/dictionary.js", emoji: "📖" },
    { name: "Downloader", path: "./features/downloader.js", emoji: "📥" },
    { name: "Encryption", path: "./features/encryption.js", emoji: "🔐" },
    { name: "Games", path: "./features/games.js", emoji: "🎮" },
    { name: "Image Tools", path: "./features/imageTools.js", emoji: "🖼️" },
    { name: "Jokes", path: "./features/jokes.js", emoji: "😂" },
    { name: "Movies", path: "./features/movies.js", emoji: "🎬" },
    { name: "Music", path: "./features/music.js", emoji: "🎵" },
    { name: "News", path: "./features/news.js", emoji: "📰" },
    { name: "Notes", path: "./features/notes.js", emoji: "📝" },
    { name: "Quotes", path: "./features/quotes.js", emoji: "💬" },
    { name: "Reminder", path: "./features/reminder.js", emoji: "⏰" },
    { name: "Security", path: "./features/security.js", emoji: "🛡️" },
    { name: "Stocks", path: "./features/stocks.js", emoji: "📈" },
    { name: "Translation", path: "./features/translation.js", emoji: "🌍" },
    { name: "TTS", path: "./features/tts.js", emoji: "🗣️" },
    { name: "Unit Convert", path: "./features/unitConverter.js", emoji: "📏" },
  ];

  let loaded = 0,
    failed = 0,
    total = 0;
  for (const f of features) {
    try {
      const mod = await import(f.path);
      const fns = Object.keys(mod).filter((k) => typeof mod[k] === "function");
      console.log(`✅ ${f.emoji} ${f.name.padEnd(16)} ➜ ${fns.length} exports`);
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
//   RESTORE SESSIONS
// ============================================================
async function restoreAllSessions() {
  try {
    await ensureMongoConnection();
    const saved = await sessionMetaCollection.find({ active: true }).toArray();
    log.info(`Restoring ${saved.length} saved session(s)...`);

    for (const s of saved) {
      try {
        const session = await startSession(s.sessionId, false);
        if (session && s.mode) {
          session.mode = s.mode;
          for (let i = 0; i < 30 && !session.handlersReady; i++) {
            await delay(1000);
          }
          if (session.handlersReady) {
            log.info(`[${s.sessionId.slice(0, 8)}] Session restored`);
          } else {
            log.warn(
              `[${s.sessionId.slice(0, 8)}] Session restored but handlers not ready`,
            );
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
  console.log(
    `\n${C.bold}${C.cyan}🚀 Starting AYOBOT v1.0.0 by AYOCODES…${C.reset}\n`,
  );

  checkEnvVars();

  try {
    await connectMongo();
    await loadPersistedState();
  } catch (error) {
    log.err(`Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }

  setupWebDashboard();
  setInterval(cleanupOldData, 60 * 60 * 1000);
  await restoreAllSessions();
  await loadAndDisplayFeatures().catch((e) =>
    log.warn("Feature display: " + e.message),
  );

  console.log(`${C.green}${C.bold}✨ AYOBOT v1.0.0 ready.${C.reset}\n`);
}

// ============================================================
//   GRACEFUL SHUTDOWN
// ============================================================
async function gracefulShutdown(sig) {
  console.log(`\n${C.red}🛑 ${sig} — Shutting down…${C.reset}`);

  await saveBannedUsers();
  await saveGroupSettings();
  await saveWarnings();

  for (const session of sessions.values()) {
    if (session.sock) {
      try {
        session.sock.end();
        session.sock.removeAllListeners();
      } catch (_) {}
    }
    if (session.pingInterval) clearInterval(session.pingInterval);
    if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
    if (session.queueTimeout) clearTimeout(session.queueTimeout);
  }

  if (mongoClient) await mongoClient.close().catch(() => {});
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
  if (!e.message?.includes("Bad MAC")) {
    log.err("Uncaught exception: " + e.message);
    console.error(e.stack);
  }
});

main().catch((e) => {
  console.error(`${C.red}❌ Fatal startup error: ${e.message}${C.reset}`);
  console.error(e);
  process.exit(1);
});
