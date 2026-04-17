// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE WORKING VERSION with BOT ADMIN INHERITANCE
//
//  NEW FEATURE: If bot owner is a group admin, bot will automatically
//  inherit admin rights (or attempt to promote itself)
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
    return cached?.data ?? null;
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
//  BOT ADMIN INHERITANCE (NEW FEATURE)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if bot owner is a group admin, and if so, ensure bot has admin rights.
 * If bot is not admin but owner is, this function will attempt to promote the bot.
 *
 * NOTE: This requires the bot to already have admin rights to promote itself.
 * If the bot is not admin, a manual promotion is needed first time.
 */
export async function ensureBotAdminInheritance(groupJid, sock, ownerJid) {
  try {
    if (!groupJid || !sock || !ownerJid) return false;

    const metadata = await getGroupMetadataCached(groupJid, sock, true);
    if (!metadata) return false;

    const ownerPhone = normalizeNum(ownerJid);
    const botPhone = getBotNumber(sock);

    if (!ownerPhone || !botPhone) return false;

    // Check if owner is group admin
    const ownerParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === ownerPhone
    );

    const isOwnerAdmin = ownerParticipant &&
      (ownerParticipant.admin === "admin" || ownerParticipant.admin === "superadmin");

    if (!isOwnerAdmin) return false;

    // Check if bot is already admin
    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botPhone
    );

    const isBotAdmin = botParticipant &&
      (botParticipant.admin === "admin" || botParticipant.admin === "superadmin");

    if (isBotAdmin) return true;

    // If owner is admin but bot is not, try to promote bot
    if (isOwnerAdmin && !isBotAdmin) {
      try {
        // Note: This only works if bot already has admin rights
        // If not, manual promotion is needed first time
        await sock.groupParticipantsUpdate(groupJid, [`${botPhone}@s.whatsapp.net`], "promote");
        console.log(`✅ [INHERITANCE] Auto-promoted bot in ${groupJid} because owner is admin`);
        clearGroupCache(groupJid);

        // Send notification to group
        await sock.sendMessage(groupJid, {
          text: `🤖 *Bot Admin Inherited*\n\nBot owner is a group admin, so I have been automatically promoted to admin.\n\n👑 Owner: @${ownerPhone}`,
          mentions: [`${ownerPhone}@s.whatsapp.net`]
        });
        return true;
      } catch (err) {
        console.log(`⚠️ [INHERITANCE] Could not auto-promote bot in ${groupJid}: ${err.message}`);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error(`[INHERITANCE] Error: ${error.message}`);
    return false;
  }
}

/**
 * Get bot admin status with inheritance check
 * This is the MAIN function to use - it checks both direct admin and inheritance
 */
export async function isBotAdminWithInheritance(groupJid, sock, ownerJid) {
  // First check if bot is directly admin
  const isDirectAdmin = await isBotGroupAdminCached(groupJid, sock, true);

  if (isDirectAdmin) {
    return true;
  }

  // If not direct admin, check if owner is admin and try inheritance
  const inherited = await ensureBotAdminInheritance(groupJid, sock, ownerJid);

  return inherited;
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
