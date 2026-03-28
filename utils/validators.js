// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Validators & Helpers — SIMPLIFIED
//  Author: AYOCODES
//
//  FIX: Removed duplicate admin functions — now all admin checks come from index.js
//  This file now ONLY contains non-admin helper functions
// ════════════════════════════════════════════════════════════════════════════

import {
  commandRateLimit,
  GROUP_META_TTL,
  groupMetadataCache,
  isAdmin,
  MAX_COMMANDS_PER_WINDOW,
  MAX_SIMILAR_MESSAGES,
  MAX_SPAM_MESSAGES,
  RATE_LIMIT_MESSAGES,
  RATE_LIMIT_WINDOW,
  SPAM_TIME_WINDOW,
  spamTracker,
  adminCache,
  normalizeToPhone,
  isBotGroupAdmin,
  isUserGroupAdmin,
} from "../index.js";

// Local constants only
const ADMIN_CACHE_TTL = 30000;

// ============================================================================
//  NORMALIZE PHONE NUMBER (wrapper for index.js normalizeToPhone)
// ============================================================================
export function normalizeNum(jid) {
  return normalizeToPhone(jid);
}

// ============================================================================
//  CONVERT TO JID
// ============================================================================
export function toJid(input) {
  const num = normalizeNum(input);
  return num ? `${num}@s.whatsapp.net` : null;
}

// ============================================================================
//  GET BOT NUMBER
// ============================================================================
export function getBotNumber(sock) {
  if (!sock?.user?.id) return null;
  return normalizeToPhone(sock.user.id);
}

// ============================================================================
//  RATE LIMITING
// ============================================================================
export function isRateLimited(userJid, isAdminUser) {
  if (!userJid || isAdminUser) return false;

  const now = Date.now();
  const key = `rate_${normalizeNum(userJid)}`;
  let hits = commandRateLimit.get(key) || [];

  hits = hits.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (hits.length >= MAX_COMMANDS_PER_WINDOW) return true;

  hits.push(now);
  commandRateLimit.set(key, hits);
  return false;
}

export function getRateLimitMessage() {
  return RATE_LIMIT_MESSAGES[
    Math.floor(Math.random() * RATE_LIMIT_MESSAGES.length)
  ];
}

// ============================================================================
//  SPAM DETECTION
// ============================================================================
export function isSpam(userJid, messageText, ownerPhone = "") {
  if (!userJid || isAdmin(userJid, ownerPhone)) return false;

  const now = Date.now();
  const key = `spam_${normalizeNum(userJid)}`;
  let data = spamTracker.get(key) || {
    messages: [],
    messageCount: 0,
    firstMessageTime: now,
    lastMessageTime: now,
  };

  data.messages = data.messages.filter((m) => now - m.time < SPAM_TIME_WINDOW);
  if (data.messages.length >= MAX_SPAM_MESSAGES) return true;

  const similarCount = data.messages.filter(
    (m) => m.text === messageText,
  ).length;
  if (similarCount >= MAX_SIMILAR_MESSAGES) return true;

  data.messages.push({ text: messageText || "", time: now });
  data.lastMessageTime = now;
  data.messageCount++;
  spamTracker.set(key, data);
  return false;
}

// ============================================================================
//  LINK DETECTION
// ============================================================================
export function containsLink(text) {
  if (!text || typeof text !== "string") return false;

  const patterns = [
    /https?:\/\/[^\s<>"']+/gi,
    /(?:www\.)[^\s<>"']+\.[^\s<>"']{2,}/gi,
    /\b(?:bit\.ly|tinyurl\.com|is\.gd|ow\.ly|goo\.gl|tiny\.cc|cutt\.ly|rebrand\.ly|shorturl\.at)\/\S+/gi,
    /(?:chat\.whatsapp\.com|wa\.me|call\.whatsapp\.com)\/\S+/gi,
    /t\.me\/\S+/gi,
    /discord\.gg\/\S+/gi,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(?:\/\S*)?\b/gi,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) return true;
  }

  return text.includes("://");
}

// ============================================================================
//  EXTRACT TEXT FROM MESSAGE
// ============================================================================
export function extractText(message) {
  if (!message?.message) return "";
  const msg = message.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    ""
  );
}

// ============================================================================
//  EXTRACT TARGET USER FROM COMMAND
// ============================================================================
export function extractTargetUser(args, message) {
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted && quoted.includes("@")) {
    const jid = toJid(quoted);
    if (jid) return { jid, phone: normalizeNum(jid), method: "reply" };
  }

  const mentions =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentions?.length > 0) {
    const jid = mentions[0];
    return { jid, phone: normalizeNum(jid), method: "mention" };
  }

  if (args?.length > 0) {
    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length >= 7) {
      return { jid: `${phone}@s.whatsapp.net`, phone, method: "arg" };
    }
  }

  return null;
}

// ============================================================================
//  ADMIN WRAPPERS (delegate to index.js)
// ============================================================================
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  forceRefresh = false,
  ownerPhone = "",
) {
  // Bot owner bypass
  if (ownerPhone && isAdmin(userJid, ownerPhone)) return true;

  // Use index.js function
  return await isUserGroupAdmin(sock, groupJid, userJid);
}

export async function isBotGroupAdminCached(
  groupJid,
  sock,
  forceRefresh = false,
) {
  return await isBotGroupAdmin(sock, groupJid, !forceRefresh);
}

export async function getGroupMetadataCached(
  groupJid,
  sock,
  forceRefresh = false,
) {
  if (!groupJid || !sock) return null;

  const now = Date.now();

  if (!forceRefresh) {
    const cached = groupMetadataCache.get(groupJid);
    if (cached && now - cached.timestamp < GROUP_META_TTL) {
      return cached.metadata;
    }
  }

  try {
    const metadata = await sock.groupMetadata(groupJid);
    if (metadata) {
      groupMetadataCache.set(groupJid, { metadata, timestamp: now });
    }
    return metadata || null;
  } catch (err) {
    console.error("[validators] getGroupMetadataCached error:", err.message);
    return groupMetadataCache.get(groupJid)?.metadata || null;
  }
}

// ============================================================================
//  BOT IN GROUP CHECK
// ============================================================================
export async function isBotInGroup(groupJid, sock) {
  if (!groupJid || !sock?.user?.id) return false;
  try {
    const botNumber = getBotNumber(sock);
    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata?.participants) return false;
    return metadata.participants.some((p) => normalizeNum(p.id) === botNumber);
  } catch (err) {
    console.error("[validators] isBotInGroup error:", err.message);
    return false;
  }
}

// ============================================================================
//  GROUP PARTICIPANT HELPERS
// ============================================================================
export async function getGroupParticipants(groupJid, sock) {
  if (!groupJid || !sock) return [];
  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    return metadata?.participants || [];
  } catch {
    return [];
  }
}

export async function getGroupAdmins(groupJid, sock) {
  if (!groupJid || !sock) return [];
  try {
    const participants = await getGroupParticipants(groupJid, sock);
    return participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    );
  } catch {
    return [];
  }
}

export async function getGroupOwner(groupJid, sock) {
  if (!groupJid || !sock) return null;
  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    return metadata?.owner || null;
  } catch {
    return null;
  }
}

export async function isGroupOwner(groupJid, userJid, sock) {
  if (!groupJid || !userJid) return false;
  try {
    const ownerJid = await getGroupOwner(groupJid, sock);
    if (!ownerJid) return false;
    return normalizeNum(userJid) === normalizeNum(ownerJid);
  } catch {
    return false;
  }
}

// ============================================================================
//  CACHE MANAGEMENT
// ============================================================================
export function clearAdminCache(groupJid, userJid) {
  if (groupJid && userJid) {
    adminCache.delete(`${groupJid}_${normalizeNum(userJid)}`);
  }
}

export function clearGroupCache(groupJid) {
  if (!groupJid) return;
  groupMetadataCache.delete(groupJid);
  for (const key of adminCache.keys()) {
    if (key.startsWith(`${groupJid}_`) || key === `botadmin_${groupJid}`) {
      adminCache.delete(key);
    }
  }
}

export async function refreshBotAdminStatus(groupJid, sock) {
  if (!groupJid || !sock) return false;
  clearGroupCache(groupJid);
  return isBotGroupAdminCached(groupJid, sock, true);
}

// ============================================================================
//  JID FORMAT VALIDATORS
// ============================================================================
export function isValidJid(jid) {
  if (!jid || typeof jid !== "string") return false;
  return jid.includes("@");
}

export function isGroupJid(jid) {
  return isValidJid(jid) && jid.endsWith("@g.us");
}

export function isUserJid(jid) {
  return isValidJid(jid) && jid.endsWith("@s.whatsapp.net");
}

// ============================================================================
//  VALIDATE GROUP COMMAND — single permission gate
// ============================================================================
export async function validateGroupCommand(
  groupJid,
  userJid,
  sock,
  requiredRole = "admin",
  ownerPhone = "",
) {
  try {
    if (!groupJid?.endsWith("@g.us")) {
      return {
        success: false,
        error: "❌ *Group Only*\nThis command only works in groups.",
      };
    }

    if (!userJid || !sock) {
      return {
        success: false,
        error: "❌ *Internal Error*\nMissing user or socket context.",
      };
    }

    const isGlobalAdmin = isAdmin(userJid, ownerPhone);

    if (requiredRole === "member") {
      return {
        success: true,
        metadata: await getGroupMetadataCached(groupJid, sock),
        userIsGlobalAdmin: isGlobalAdmin,
        userIsGroupAdmin: false,
      };
    }

    const isGroupAdminResult = await isUserGroupAdmin(sock, groupJid, userJid);

    if (!isGlobalAdmin && !isGroupAdminResult) {
      return {
        success: false,
        error: "❌ *Admin Only*\nOnly group admins can use this command.",
      };
    }

    if (requiredRole === "botAdmin") {
      const botIsAdmin = await isBotGroupAdmin(sock, groupJid, true);
      if (!botIsAdmin) {
        return {
          success: false,
          error:
            "❌ *Bot Not Admin*\nI need to be a group admin for this.\n" +
            "Promote me in group settings first.",
        };
      }
    }

    return {
      success: true,
      metadata: await getGroupMetadataCached(groupJid, sock),
      userIsGlobalAdmin: isGlobalAdmin,
      userIsGroupAdmin: isGroupAdminResult,
    };
  } catch (err) {
    console.error("[validators] validateGroupCommand error:", err.message);
    return {
      success: false,
      error: "❌ *Validation Error*\nCould not check permissions. Try again.",
    };
  }
}

// ============================================================================
//  DEBUG ADMIN CHECK
// ============================================================================
export async function debugAdminCheck(groupJid, sock) {
  if (!groupJid || !sock) return;

  console.log("\n🔍 ===== AYOBOT ADMIN DEBUG =====");

  const botRawJid = sock.user?.id || "UNKNOWN";
  const botNum = normalizeNum(botRawJid);
  console.log(`Raw bot JID : ${botRawJid}`);
  console.log(`Bot number  : ${botNum}`);

  try {
    const metadata = await sock.groupMetadata(groupJid);
    console.log(`\nGroup : ${metadata.subject}`);
    console.log(`Total participants : ${metadata.participants.length}\n`);

    console.log("Participant list:");
    metadata.participants.forEach((p, i) => {
      const pNum = normalizeNum(p.id);
      const isBot = pNum === botNum;
      console.log(
        `  ${i + 1}. ${p.id}  →  ${pNum}  (${p.admin || "member"})${isBot ? "  ← BOT ✅" : ""}`,
      );
    });

    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botNum,
    );

    console.log("\n--- RESULT ---");
    if (botParticipant) {
      const isAdm =
        botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin";
      console.log(`✅ Bot found in group`);
      console.log(`   Admin role : ${botParticipant.admin || "member"}`);
      console.log(`   Is admin   : ${isAdm}`);
    } else {
      console.log(`❌ Bot NOT found in participant list`);
    }
  } catch (e) {
    console.error(`Debug error: ${e.message}`);
  }

  console.log("=================================\n");
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  normalizeNum,
  toJid,
  getBotNumber,
  isRateLimited,
  getRateLimitMessage,
  isSpam,
  containsLink,
  extractText,
  extractTargetUser,
  isGroupAdminCached,
  isBotGroupAdminCached,
  getGroupMetadataCached,
  isUserGroupAdmin,
  isBotInGroup,
  getGroupParticipants,
  getGroupAdmins,
  getGroupOwner,
  isGroupOwner,
  clearAdminCache,
  clearGroupCache,
  refreshBotAdminStatus,
  isValidJid,
  isGroupJid,
  isUserJid,
  validateGroupCommand,
  debugAdminCheck,
};
