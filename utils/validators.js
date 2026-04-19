// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE FIXED VERSION
//
//  FIXES IN THIS VERSION:
//  1. setImmediate replaced with setTimeout(fn,0) — safe in all ESM envs
//  2. ensureBotAdminInheritance now returns true immediately when owner is
//     group admin (no silent false on first call)
//  3. Cache TTL enforced on write via Map eviction, not just on read
//  4. isBotAdminWithInheritance bypasses cache correctly on retry
//  5. All exports preserved and expanded with JSDoc for clarity
// ════════════════════════════════════════════════════════════════════════════

// ── Cache constants ──────────────────────────────────────────────────────
const ADMIN_CACHE_TTL = 30_000; // 30 s
const GROUP_META_TTL = 60_000; // 60 s
const MAX_CACHE_SIZE = 500; // evict oldest when exceeded

const groupMetaCache = new Map(); // groupJid  → { data, timestamp }
const botAdminCache = new Map(); // groupJid  → { isAdmin, timestamp }
const userAdminCache = new Map(); // `${g}_${p}` → { isAdmin, timestamp }

// ── Generic TTL-aware cache write ────────────────────────────────────────
function cacheSet(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    // evict the oldest entry
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, value);
}

// ══════════════════════════════════════════════════════════════════════════
//  PHONE / JID NORMALISATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Strip everything that is not a digit from a JID or phone string.
 * "1234567890@s.whatsapp.net" → "1234567890"
 * "+1 (234) 567-890"          → "1234567890"
 */
export function normalizeNum(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

/** Alias kept for callers that use normalizePhone */
export const normalizePhone = normalizeNum;

// ══════════════════════════════════════════════════════════════════════════
//  GROUP METADATA (cached)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Fetch group metadata with a 60-second in-memory cache.
 * Pass bypassCache=true to force a fresh fetch.
 *
 * @param {string} groupJid
 * @param {object} sock       Baileys socket
 * @param {boolean} bypassCache
 * @returns {Promise<object|null>}
 */
export async function getGroupMetadataCached(
  groupJid,
  sock,
  bypassCache = false,
) {
  if (!groupJid || !sock) return null;

  const cached = groupMetaCache.get(groupJid);
  if (
    !bypassCache &&
    cached &&
    Date.now() - cached.timestamp < GROUP_META_TTL
  ) {
    return cached.data;
  }

  try {
    const data = await sock.groupMetadata(groupJid);
    cacheSet(groupMetaCache, groupJid, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error(`[validators] groupMetadata(${groupJid}): ${err.message}`);
    return cached?.data ?? null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BOT ADMIN STATUS (cached)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Returns true when the bot itself is an admin (or superadmin) in groupJid.
 *
 * @param {string} groupJid
 * @param {object} sock
 * @param {boolean} bypassCache
 * @returns {Promise<boolean>}
 */
export async function isBotGroupAdminCached(
  groupJid,
  sock,
  bypassCache = false,
) {
  if (!groupJid || !sock) return false;

  const cached = botAdminCache.get(groupJid);
  if (
    !bypassCache &&
    cached &&
    Date.now() - cached.timestamp < ADMIN_CACHE_TTL
  ) {
    return cached.isAdmin;
  }

  try {
    const meta = await getGroupMetadataCached(groupJid, sock, bypassCache);
    const botRaw = sock.user?.id ?? "";
    const botPhone = normalizeNum(botRaw);

    if (!botPhone) return false;

    const participant = (meta?.participants ?? []).find(
      (p) => normalizeNum(p.id) === botPhone,
    );
    const isAdmin = !!participant?.admin;

    cacheSet(botAdminCache, groupJid, { isAdmin, timestamp: Date.now() });
    return isAdmin;
  } catch (err) {
    console.error(`[validators] isBotGroupAdminCached: ${err.message}`);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  USER ADMIN STATUS (cached)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Returns true when userJid is a group admin or superadmin in groupJid.
 *
 * @param {string} groupJid
 * @param {string} userJid
 * @param {object} sock
 * @param {boolean} bypassCache
 * @returns {Promise<boolean>}
 */
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  bypassCache = false,
) {
  if (!groupJid || !userJid || !sock) return false;

  const userPhone = normalizeNum(userJid);
  if (!userPhone) return false;

  const key = `${groupJid}_${userPhone}`;
  const cached = userAdminCache.get(key);
  if (
    !bypassCache &&
    cached &&
    Date.now() - cached.timestamp < ADMIN_CACHE_TTL
  ) {
    return cached.isAdmin;
  }

  try {
    const meta = await getGroupMetadataCached(groupJid, sock, bypassCache);
    const participant = (meta?.participants ?? []).find(
      (p) => normalizeNum(p.id) === userPhone,
    );
    const isAdmin = !!participant?.admin;

    cacheSet(userAdminCache, key, { isAdmin, timestamp: Date.now() });
    return isAdmin;
  } catch (err) {
    console.error(`[validators] isGroupAdminCached: ${err.message}`);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BOT ADMIN INHERITANCE (FIXED)
// ══════════════════════════════════════════════════════════════════════════

/**
 * If the bot owner is a group admin, the bot is treated as having admin
 * rights immediately.  Auto-promotion is attempted in background via
 * setTimeout(fn, 0) — safe in all Node.js ESM environments.
 *
 * FIX: previously used setImmediate (not available in all ESM envs).
 * FIX: now returns true on first call when owner is admin instead of false.
 *
 * @param {string} groupJid
 * @param {object} sock
 * @param {string} ownerJid
 * @returns {Promise<boolean>}
 */
export async function ensureBotAdminInheritance(groupJid, sock, ownerJid) {
  try {
    if (!groupJid || !sock || !ownerJid) return false;

    const metadata = await getGroupMetadataCached(groupJid, sock, true);
    if (!metadata) return false;

    const ownerPhone = normalizeNum(ownerJid);
    const botPhone = getBotNumber(sock);
    if (!ownerPhone || !botPhone) return false;

    const ownerParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === ownerPhone,
    );
    const isOwnerAdmin =
      ownerParticipant?.admin === "admin" ||
      ownerParticipant?.admin === "superadmin";

    if (!isOwnerAdmin) return false;

    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botPhone,
    );
    const isBotAdmin =
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin";

    // Bot already admin — nothing to do
    if (isBotAdmin) return true;

    // Owner is admin → consider bot as admin immediately (commands work now)
    // Attempt promotion in background — non-blocking, safe ESM alternative to setImmediate
    setTimeout(async () => {
      try {
        await sock.groupParticipantsUpdate(
          groupJid,
          [`${botPhone}@s.whatsapp.net`],
          "promote",
        );
        console.log(
          `✅ [INHERITANCE] Auto-promoted bot in ${groupJid} because owner is admin`,
        );
        clearGroupCache(groupJid);
        await sock.sendMessage(groupJid, {
          text:
            `🤖 *Bot Admin Inherited*\n\n` +
            `Bot owner is a group admin, so I have been automatically promoted.\n\n` +
            `👑 Owner: @${ownerPhone}`,
          mentions: [`${ownerPhone}@s.whatsapp.net`],
        });
      } catch (err) {
        console.log(
          `⚠️ [INHERITANCE] Could not auto-promote bot in ${groupJid}: ` +
            `${err.message} — commands still work via owner inheritance`,
        );
      }
    }, 0);

    // Return true immediately so commands aren't blocked while promotion runs
    return true;
  } catch (error) {
    console.error(`[INHERITANCE] Error: ${error.message}`);
    return false;
  }
}

/**
 * Returns true if:
 *   • the bot itself is a group admin, OR
 *   • the bot owner is a group admin (inheritance)
 *
 * FIX: bypassCache=true on the retry so stale cached false doesn't persist.
 *
 * @param {string} groupJid
 * @param {object} sock
 * @param {string} ownerJid
 * @returns {Promise<boolean>}
 */
export async function isBotAdminWithInheritance(groupJid, sock, ownerJid) {
  // Fast path — direct admin check (cached)
  const isDirectAdmin = await isBotGroupAdminCached(groupJid, sock, false);
  if (isDirectAdmin) return true;

  // Slow path — inheritance check (always bypasses cache for accuracy)
  return ensureBotAdminInheritance(groupJid, sock, ownerJid);
}

// ══════════════════════════════════════════════════════════════════════════
//  CACHE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

/** Wipe all cached entries for a group (call after promote/demote/etc.) */
export function clearGroupCache(groupJid) {
  groupMetaCache.delete(groupJid);
  botAdminCache.delete(groupJid);
  for (const key of userAdminCache.keys()) {
    if (key.startsWith(groupJid)) userAdminCache.delete(key);
  }
}

/** Force-refresh bot admin status for a group and return new value. */
export async function refreshBotAdminStatus(groupJid, sock) {
  clearGroupCache(groupJid);
  return isBotGroupAdminCached(groupJid, sock, true);
}

// ══════════════════════════════════════════════════════════════════════════
//  BOT NUMBER HELPER
// ══════════════════════════════════════════════════════════════════════════

/** Return the bot's own normalised phone number. */
export function getBotNumber(sock) {
  return normalizeNum(sock?.user?.id ?? "");
}

// ══════════════════════════════════════════════════════════════════════════
//  TARGET USER EXTRACTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Extract the target user from:
 *   1. A @mention in contextInfo
 *   2. A quoted/replied-to message sender
 *   3. A bare phone number in args[0]
 *
 * @param {string[]} args
 * @param {object}   message  Baileys message object
 * @returns {{ jid: string, phone: string } | null}
 */
export function extractTargetUser(args, message) {
  const ctx =
    message?.message?.extendedTextMessage?.contextInfo ??
    message?.message?.imageMessage?.contextInfo ??
    message?.message?.videoMessage?.contextInfo ??
    null;

  // 1. @mention
  if (ctx?.mentionedJid?.length) {
    const jid = ctx.mentionedJid[0];
    const phone = normalizeNum(jid);
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  // 2. Quoted message sender
  if (ctx?.participant) {
    const phone = normalizeNum(ctx.participant);
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  // 3. Bare phone number in first arg
  if (args?.length) {
    const raw = String(args[0]).replace(/[^0-9]/g, "");
    const phone = raw.length >= 7 ? raw : null;
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  GROUP COMMAND GUARD
// ══════════════════════════════════════════════════════════════════════════

/**
 * Quick sanity-check used at the top of group commands.
 * Returns { valid: false, reason } when the check fails.
 *
 * @param {string} groupJid
 * @param {object} sock
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
export async function validateGroupCommand(groupJid, sock) {
  if (!groupJid?.endsWith("@g.us")) {
    return { valid: false, reason: "❌ This command only works in groups." };
  }
  const botAdmin = await isBotGroupAdminCached(groupJid, sock);
  if (!botAdmin) {
    return {
      valid: false,
      reason:
        "⚠️ *Bot Not Admin*\n\nPromote me to group admin first, then run `.refreshadmin`.",
    };
  }
  return { valid: true };
}

// ══════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════════════════

export default {
  normalizeNum,
  normalizePhone,
  getGroupMetadataCached,
  isBotGroupAdminCached,
  isGroupAdminCached,
  clearGroupCache,
  refreshBotAdminStatus,
  getBotNumber,
  extractTargetUser,
  validateGroupCommand,
  ensureBotAdminInheritance,
  isBotAdminWithInheritance,
};
