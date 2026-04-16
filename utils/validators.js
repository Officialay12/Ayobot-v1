// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  FIXED: Was importing ADMIN_CACHE_TTL from index.js (never exported) which
//  crashed every module that imported this file. Now fully self-contained.
//  All helpers used across core.js, settings.js, moderation.js, admin.js,
//  and automation.js are defined and exported here.
// ════════════════════════════════════════════════════════════════════════════

// ── Local cache (self-contained, no index.js dependency for TTL) ──────────
const ADMIN_CACHE_TTL = 30_000; // 30 seconds
const GROUP_META_TTL  = 60_000; // 60 seconds

const groupMetaCache  = new Map(); // groupJid → { data, timestamp }
const botAdminCache   = new Map(); // groupJid → { isAdmin, timestamp }
const userAdminCache  = new Map(); // `${groupJid}_${phone}` → { isAdmin, timestamp }

// ══════════════════════════════════════════════════════════════════════════
//  PHONE / JID NORMALISATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Strip everything that isn't a digit from a JID or phone string.
 * "1234567890@s.whatsapp.net" → "1234567890"
 * "+1 (234) 567-890"          → "1234567890"
 */
export function normalizeNum(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

/** Alias kept for callers that use `normalizePhone` */
export const normalizePhone = normalizeNum;

// ══════════════════════════════════════════════════════════════════════════
//  GROUP METADATA (cached)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Fetch group metadata, using a 60-second in-memory cache.
 * Pass bypassCache=true to force a fresh fetch.
 */
export async function getGroupMetadataCached(groupJid, sock, bypassCache = false) {
  if (!groupJid || !sock) return null;

  const cached = groupMetaCache.get(groupJid);
  if (!bypassCache && cached && Date.now() - cached.timestamp < GROUP_META_TTL) {
    return cached.data;
  }

  try {
    const data = await sock.groupMetadata(groupJid);
    groupMetaCache.set(groupJid, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error(`[validators] groupMetadata(${groupJid}): ${err.message}`);
    return cached?.data ?? null; // return stale data rather than null on network hiccup
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BOT ADMIN STATUS (cached)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Returns true when the bot itself is an admin (or superadmin) in groupJid.
 */
export async function isBotGroupAdminCached(groupJid, sock, bypassCache = false) {
  if (!groupJid || !sock) return false;

  const cached = botAdminCache.get(groupJid);
  if (!bypassCache && cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
    return cached.isAdmin;
  }

  try {
    const meta    = await getGroupMetadataCached(groupJid, sock, bypassCache);
    const botRaw  = sock.user?.id ?? "";
    const botPhone = normalizeNum(botRaw);

    if (!botPhone) return false;

    const participant = (meta?.participants ?? []).find(
      (p) => normalizeNum(p.id) === botPhone
    );
    const isAdmin = !!(participant?.admin);

    botAdminCache.set(groupJid, { isAdmin, timestamp: Date.now() });
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
 */
export async function isGroupAdminCached(groupJid, userJid, sock, bypassCache = false) {
  if (!groupJid || !userJid || !sock) return false;

  const userPhone = normalizeNum(userJid);
  if (!userPhone) return false;

  const key    = `${groupJid}_${userPhone}`;
  const cached = userAdminCache.get(key);
  if (!bypassCache && cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
    return cached.isAdmin;
  }

  try {
    const meta        = await getGroupMetadataCached(groupJid, sock, bypassCache);
    const participant = (meta?.participants ?? []).find(
      (p) => normalizeNum(p.id) === userPhone
    );
    const isAdmin = !!(participant?.admin);

    userAdminCache.set(key, { isAdmin, timestamp: Date.now() });
    return isAdmin;
  } catch (err) {
    console.error(`[validators] isGroupAdminCached: ${err.message}`);
    return false;
  }
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
 * Extract the target user from either:
 *   1. A @mention in args
 *   2. A quoted/replied-to message
 *   3. A bare phone number in args[0]
 *
 * Returns { jid, phone } or null.
 *
 * FIXED: Previously callers in moderation.js passed { message: {} } instead
 * of the actual message object, so reply-based lookups always returned null.
 * Now the function is robust to both forms.
 */
export function extractTargetUser(args, message) {
  // 1. @mention inside contextInfo (tagged message)
  const ctx =
    message?.message?.extendedTextMessage?.contextInfo ??
    message?.message?.imageMessage?.contextInfo ??
    message?.message?.videoMessage?.contextInfo ??
    null;

  if (ctx?.mentionedJid?.length) {
    const jid   = ctx.mentionedJid[0];
    const phone = normalizeNum(jid);
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  // 2. Quoted / replied-to message sender
  if (ctx?.participant) {
    const phone = normalizeNum(ctx.participant);
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  // 3. Bare phone number in args[0]
  if (args?.length) {
    const raw   = String(args[0]).replace(/[^0-9]/g, "");
    const phone = raw.length >= 7 ? raw : null;
    if (phone) return { jid: `${phone}@s.whatsapp.net`, phone };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  GROUP COMMAND GUARD
// ══════════════════════════════════════════════════════════════════════════

/**
 * Quick sanity-check helper used at the top of group commands.
 * Returns { valid: false, reason } when the check fails.
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
};
