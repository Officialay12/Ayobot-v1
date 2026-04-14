// utils/validators.js — AYOBOT v1.0.0
// COMPLETE REWRITE — Uses phone numbers ONLY for identification
// Author: AYOCODES

import { ENV } from "../index.js";

// ============================================================================
// PHONE NORMALIZATION — STRIP EVERYTHING EXCEPT DIGITS
// ============================================================================

/**
 * Convert any JID/ID to raw phone number (digits only)
 * Input: "2348123456789@s.whatsapp.net", "2348123456789:1@c.us", "2348123456789"
 * Output: "2348123456789"
 */
export function normalizePhone(input) {
  if (!input || typeof input !== "string") return "";

  // Extract digits only
  const digits = input.replace(/[^0-9]/g, "");

  // Handle country codes: ensure at least 10 digits
  if (digits.length >= 10) return digits;
  if (digits.length === 0) return "";

  // If too short, try to extract from original
  const match = input.match(/\d{10,15}/);
  return match ? match[0] : digits;
}

// Aliases for backward compatibility
export const normalizeNum = normalizePhone;
export const phoneNumber = normalizePhone;

// ============================================================================
// JID CONSTRUCTION
// ============================================================================

export function toJid(phone) {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  return `${clean}@s.whatsapp.net`;
}

export function isGroupJid(jid) {
  return jid && typeof jid === "string" && jid.endsWith("@g.us");
}

export function isBroadcastJid(jid) {
  return jid && typeof jid === "string" && jid.endsWith("@broadcast");
}

// ============================================================================
// ADMIN CACHE (TTL 30 seconds)
// ============================================================================

const ADMIN_CACHE_TTL = 30000; // 30 seconds
const adminCache = new Map();

function getCacheKey(groupJid, userPhone) {
  const groupNorm = normalizePhone(groupJid);
  return `admin:${groupNorm}:${userPhone}`;
}

function setCached(groupJid, userPhone, isAdmin) {
  const key = getCacheKey(groupJid, userPhone);
  adminCache.set(key, {
    isAdmin,
    timestamp: Date.now(),
  });
}

function getCached(groupJid, userPhone) {
  const key = getCacheKey(groupJid, userPhone);
  const cached = adminCache.get(key);
  if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
    return cached.isAdmin;
  }
  return null;
}

export function clearAdminCache(groupJid) {
  const groupNorm = normalizePhone(groupJid);
  for (const key of adminCache.keys()) {
    if (key.startsWith(`admin:${groupNorm}:`)) {
      adminCache.delete(key);
    }
  }
}

// ============================================================================
// GROUP METADATA CACHE
// ============================================================================

const GROUP_META_TTL = 60000; // 60 seconds
const groupMetadataCache = new Map();

export async function getGroupMetadataCached(groupJid, sock, force = false) {
  const groupNorm = normalizePhone(groupJid);
  const cached = groupMetadataCache.get(groupNorm);

  if (!force && cached && Date.now() - cached.timestamp < GROUP_META_TTL) {
    return cached.metadata;
  }

  try {
    const metadata = await sock.groupMetadata(groupJid);
    groupMetadataCache.set(groupNorm, {
      metadata,
      timestamp: Date.now(),
    });
    return metadata;
  } catch (error) {
    console.error(`[validators] Failed to get group metadata:`, error.message);
    return cached?.metadata || null;
  }
}

export function clearGroupCache(groupJid) {
  const groupNorm = normalizePhone(groupJid);
  groupMetadataCache.delete(groupNorm);
  clearAdminCache(groupJid);
}

// ============================================================================
// CORE ADMIN CHECK — BY PHONE NUMBER ONLY
// ============================================================================

/**
 * Check if a user is a group admin
 * @param {string} groupJid - Group JID
 * @param {string} userJid - User JID or phone number
 * @param {object} sock - WhatsApp socket
 * @param {boolean} bypassCache - Force fresh fetch
 * @returns {Promise<boolean>}
 */
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  bypassCache = false,
) {
  const groupNorm = normalizePhone(groupJid);
  const userPhone = normalizePhone(userJid);

  if (!groupNorm || !userPhone) return false;

  // Check cache first
  if (!bypassCache) {
    const cached = getCached(groupNorm, userPhone);
    if (cached !== null) return cached;
  }

  try {
    const metadata = await getGroupMetadataCached(groupJid, sock, bypassCache);
    if (!metadata || !metadata.participants) return false;

    // Find participant by phone number (not JID)
    const participant = metadata.participants.find((p) => {
      const participantPhone = normalizePhone(p.id);
      return participantPhone === userPhone;
    });

    const isAdmin =
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin");

    // Cache the result
    setCached(groupNorm, userPhone, isAdmin);

    return isAdmin;
  } catch (error) {
    console.error(`[validators] isGroupAdminCached error:`, error.message);
    return false;
  }
}

// ============================================================================
// BOT ADMIN CHECK — BY PHONE NUMBER ONLY
// ============================================================================

/**
 * Check if the bot is a group admin
 * @param {string} groupJid - Group JID
 * @param {object} sock - WhatsApp socket
 * @param {boolean} bypassCache - Force fresh fetch
 * @returns {Promise<boolean>}
 */
export async function isBotGroupAdminCached(
  groupJid,
  sock,
  bypassCache = false,
) {
  const botRaw = sock.user?.id;
  if (!botRaw) return false;

  const botPhone = normalizePhone(botRaw);
  if (!botPhone) return false;

  const groupNorm = normalizePhone(groupJid);
  const cacheKey = `bot_admin:${groupNorm}`;

  if (!bypassCache) {
    const cached = adminCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
      return cached.isAdmin;
    }
  }

  try {
    const metadata = await getGroupMetadataCached(groupJid, sock, bypassCache);
    if (!metadata || !metadata.participants) return false;

    const botParticipant = metadata.participants.find((p) => {
      const participantPhone = normalizePhone(p.id);
      return participantPhone === botPhone;
    });

    const isAdmin =
      botParticipant &&
      (botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin");

    adminCache.set(cacheKey, {
      isAdmin,
      timestamp: Date.now(),
    });

    return isAdmin;
  } catch (error) {
    console.error(`[validators] isBotGroupAdminCached error:`, error.message);
    return false;
  }
}

// ============================================================================
// REFRESH BOT ADMIN STATUS
// ============================================================================

export async function refreshBotAdminStatus(groupJid, sock) {
  clearAdminCache(groupJid);
  const cacheKey = `bot_admin:${normalizePhone(groupJid)}`;
  adminCache.delete(cacheKey);
  return await isBotGroupAdminCached(groupJid, sock, true);
}

// ============================================================================
// GET BOT PHONE NUMBER
// ============================================================================

export function getBotNumber(sock) {
  const botRaw = sock.user?.id;
  if (!botRaw) return "";
  return normalizePhone(botRaw);
}

// ============================================================================
// EXTRACT TARGET USER FROM COMMAND
// ============================================================================

/**
 * Extract target user JID/phone from command args or replied message
 * @param {Array} args - Command arguments
 * @param {object} message - Message object
 * @returns {object|null} - { jid, phone }
 */
export function extractTargetUser(args, message) {
  // First check: replied message context
  const msgObj = message?.message || {};
  const contextInfo =
    msgObj.extendedTextMessage?.contextInfo ||
    msgObj.imageMessage?.contextInfo ||
    msgObj.videoMessage?.contextInfo ||
    msgObj.documentMessage?.contextInfo;

  if (contextInfo) {
    // Check participant (the person who sent the quoted message)
    if (contextInfo.participant) {
      const phone = normalizePhone(contextInfo.participant);
      return { jid: `${phone}@s.whatsapp.net`, phone };
    }

    // Check mentioned JIDs
    if (contextInfo.mentionedJid && contextInfo.mentionedJid.length > 0) {
      const phone = normalizePhone(contextInfo.mentionedJid[0]);
      return { jid: `${phone}@s.whatsapp.net`, phone };
    }
  }

  // Second check: parse args for @mention or phone number
  if (args && args.length > 0) {
    const firstArg = args[0];

    // Check for @mention format
    const mentionMatch = firstArg.match(/@(\d+)/);
    if (mentionMatch) {
      const phone = mentionMatch[1];
      return { jid: `${phone}@s.whatsapp.net`, phone };
    }

    // Check for plain phone number
    const phoneMatch = firstArg.match(/\d{10,15}/);
    if (phoneMatch) {
      const phone = phoneMatch[0];
      return { jid: `${phone}@s.whatsapp.net`, phone };
    }
  }

  return null;
}

// ============================================================================
// VALIDATE GROUP COMMAND PERMISSIONS
// ============================================================================

export async function validateGroupCommand(
  sock,
  msg,
  session,
  requireBotAdmin = true,
) {
  const from = msg.key.remoteJid;
  const isGroup = from?.endsWith("@g.us");

  if (!isGroup) {
    return {
      allowed: false,
      reason: "❌ This command only works in groups!",
    };
  }

  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderPhone = normalizePhone(senderJid);
  const ownerPhone = normalizePhone(session?.ownerPhone || ENV.ADMIN || "");

  // Bot owner always has permission
  if (ownerPhone && senderPhone === ownerPhone) {
    return { allowed: true, reason: "Bot owner" };
  }

  // Check if user is group admin
  const userIsAdmin = await isGroupAdminCached(from, senderJid, sock);

  if (!userIsAdmin) {
    return {
      allowed: false,
      reason:
        "⛔ *Group Admin Required*\n\nYou need to be a group admin to use this command!",
    };
  }

  // Check if bot is group admin (if required)
  if (requireBotAdmin) {
    const botIsAdmin = await isBotGroupAdminCached(from, sock);

    if (!botIsAdmin) {
      return {
        allowed: false,
        reason:
          "⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to perform this action!\n\n1. Add me as group admin\n2. Wait a few seconds\n3. Type .refreshadmin",
      };
    }
  }

  return { allowed: true, reason: "Group admin" };
}
