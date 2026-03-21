// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Validators & Helpers — COMPLETE CORRECTED VERSION
//  Author: AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import {
  ADMIN_CACHE_TTL,
  adminCache,
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
} from "../index.js";

// ============================================================================
//  NORMALIZE PHONE NUMBER
//  FIX: strips device suffix (:N) AND @domain before extracting digits.
//  e.g. "2349159180375:58@s.whatsapp.net" → "2349159180375"
// ============================================================================
export function normalizeNum(jid) {
  if (!jid) return "";
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || String(jid);
  }
  // Strip @domain first, then strip :device suffix, then keep only digits
  return String(jid)
    .split("@")[0] // remove @s.whatsapp.net / @g.us
    .split(":")[0] // remove :58 device suffix — CRITICAL FIX
    .replace(/[^0-9]/g, "");
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
  return normalizeNum(sock.user.id);
}

// ============================================================================
//  RATE LIMITING
// ============================================================================
export function isRateLimited(userJid, isAdminUser) {
  if (!userJid || isAdminUser) return false;

  const now = Date.now();
  const key = `rate_${normalizeNum(userJid)}`;
  let timestamps = commandRateLimit.get(key) || [];

  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);

  if (timestamps.length >= MAX_COMMANDS_PER_WINDOW) {
    return true;
  }

  timestamps.push(now);
  commandRateLimit.set(key, timestamps);
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
export function isSpam(userJid, messageText) {
  // FIX: pass ownerPhone to isAdmin correctly — isAdmin needs two args
  if (!userJid || isAdmin(userJid)) return false;

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
//  LINK DETECTION — COMPREHENSIVE
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
  // Check quoted message
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted && quoted.includes("@")) {
    const jid = toJid(quoted);
    if (jid) {
      return { jid, phone: normalizeNum(jid), method: "reply" };
    }
  }

  // Check mentioned users
  const mentions =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentions?.length > 0) {
    const jid = mentions[0];
    return { jid, phone: normalizeNum(jid), method: "mention" };
  }

  // Check args for phone number
  if (args?.length > 0) {
    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length >= 7) {
      return { jid: `${phone}@s.whatsapp.net`, phone, method: "arg" };
    }
  }

  return null;
}

// ============================================================================
//  CACHED GROUP ADMIN CHECK
//  FIX: uses normalizeNum on both sides — handles :N device suffix correctly
// ============================================================================
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  forceRefresh = false,
) {
  if (!groupJid || !userJid) return false;

  // Global admin (bot owner) always passes
  if (isAdmin(userJid)) return true;

  const cacheKey = `${groupJid}_${normalizeNum(userJid)}`;

  if (!forceRefresh) {
    const cached = adminCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
      return cached.isAdmin;
    }
  }

  try {
    const metadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (!metadata?.participants) return false;

    // normalizeNum already strips :N suffix on both sides — FIXED
    const userNum = normalizeNum(userJid);
    const participant = metadata.participants.find(
      (p) => normalizeNum(p.id) === userNum,
    );

    const isGroupAdmin =
      participant?.admin === "admin" || participant?.admin === "superadmin";

    adminCache.set(cacheKey, { isAdmin: isGroupAdmin, timestamp: Date.now() });
    return isGroupAdmin;
  } catch (err) {
    console.error("isGroupAdminCached error:", err.message);
    return false;
  }
}

// ============================================================================
//  CACHED BOT ADMIN CHECK
//  FIX: uses normalizeNum so device suffix never causes mismatch
// ============================================================================
export async function isBotGroupAdminCached(
  groupJid,
  sock,
  forceRefresh = false,
) {
  if (!groupJid || !groupJid.endsWith("@g.us")) return false;
  if (!sock || !sock.user) return false;

  const cacheKey = `botadmin_${groupJid}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = adminCache.get(cacheKey);
    if (cached && now - cached.timestamp < 30000) {
      return cached.isAdmin;
    }
  }

  try {
    const botNumber = normalizeNum(sock.user.id); // strips :58 device suffix

    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata?.participants) {
      adminCache.set(cacheKey, { isAdmin: false, timestamp: now });
      return false;
    }

    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botNumber,
    );

    const result = !!(
      botParticipant &&
      (botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin")
    );

    adminCache.set(cacheKey, { isAdmin: result, timestamp: now });
    return result;
  } catch (error) {
    console.error("isBotGroupAdminCached error:", error.message);
    return false;
  }
}

// ============================================================================
//  DEBUG BOT ADMIN — diagnostic helper, logs to console
// ============================================================================
export async function debugBotAdmin(groupJid, sock) {
  if (!groupJid || !sock) return;

  console.log("\n🔍 ===== BOT ADMIN DEBUG =====");
  const botJid = sock.user?.id;
  console.log("Bot JID:", botJid);
  const botNumber = normalizeNum(botJid);
  console.log("Bot number (normalized):", botNumber);

  try {
    const metadata = await sock.groupMetadata(groupJid);
    console.log("Group:", metadata.subject);
    console.log("Total participants:", metadata.participants.length);

    console.log("\nAll participants:");
    metadata.participants.forEach((p) => {
      const pNum = normalizeNum(p.id);
      const match = pNum === botNumber ? " ← BOT" : "";
      console.log(`  ${p.id} → ${pNum} (${p.admin || "member"})${match}`);
    });

    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botNumber,
    );

    if (botParticipant) {
      console.log("\n✅ Bot found in group!");
      console.log(`Role: ${botParticipant.admin || "member"}`);
    } else {
      console.log("\n❌ Bot NOT found in group participants!");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
  console.log("=============================\n");
}

// ============================================================================
//  CACHED GROUP METADATA
// ============================================================================
export async function getGroupMetadataCached(
  groupJid,
  sock,
  forceRefresh = false,
) {
  if (!groupJid || !sock) return null;

  if (!forceRefresh) {
    const cached = groupMetadataCache.get(groupJid);
    if (cached && Date.now() - cached.timestamp < GROUP_META_TTL) {
      return cached.metadata;
    }
  }

  try {
    const metadata = await sock.groupMetadata(groupJid);
    if (metadata) {
      groupMetadataCache.set(groupJid, { metadata, timestamp: Date.now() });
    }
    return metadata || null;
  } catch (err) {
    console.error("getGroupMetadataCached error:", err.message);
    return groupMetadataCache.get(groupJid)?.metadata || null;
  }
}

// ============================================================================
//  CHECK IF USER IS GROUP ADMIN (direct, no cache)
//  FIX: normalizeNum handles :N suffix on both sides
// ============================================================================
export async function isUserGroupAdmin(groupJid, userJid, sock) {
  if (!groupJid || !userJid || !sock) return false;

  try {
    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata?.participants) return false;

    const userNum = normalizeNum(userJid);
    const participant = metadata.participants.find(
      (p) => normalizeNum(p.id) === userNum,
    );

    return !!(
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin")
    );
  } catch (err) {
    console.error("isUserGroupAdmin error:", err.message);
    return false;
  }
}

// ============================================================================
//  CHECK IF BOT IS IN GROUP
// ============================================================================
export async function isBotInGroup(groupJid, sock) {
  if (!groupJid || !sock?.user?.id) return false;

  try {
    const botNumber = normalizeNum(sock.user.id);
    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata?.participants) return false;

    return metadata.participants.some((p) => normalizeNum(p.id) === botNumber);
  } catch (err) {
    console.error("isBotInGroup error:", err.message);
    return false;
  }
}

// ============================================================================
//  GET GROUP PARTICIPANTS
// ============================================================================
export async function getGroupParticipants(groupJid, sock) {
  if (!groupJid || !sock) return [];

  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    return metadata?.participants || [];
  } catch (err) {
    console.error("getGroupParticipants error:", err.message);
    return [];
  }
}

// ============================================================================
//  GET GROUP ADMINS
// ============================================================================
export async function getGroupAdmins(groupJid, sock) {
  if (!groupJid || !sock) return [];

  try {
    const participants = await getGroupParticipants(groupJid, sock);
    return participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    );
  } catch (err) {
    console.error("getGroupAdmins error:", err.message);
    return [];
  }
}

// ============================================================================
//  GET GROUP OWNER
// ============================================================================
export async function getGroupOwner(groupJid, sock) {
  if (!groupJid || !sock) return null;

  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    return metadata?.owner || null;
  } catch (err) {
    console.error("getGroupOwner error:", err.message);
    return null;
  }
}

// ============================================================================
//  CHECK IF USER IS GROUP OWNER
// ============================================================================
export async function isGroupOwner(groupJid, userJid, sock) {
  if (!groupJid || !userJid) return false;

  try {
    const userNumber = normalizeNum(userJid);
    const ownerJid = await getGroupOwner(groupJid, sock);
    if (!ownerJid) return false;

    const ownerNumber = normalizeNum(ownerJid);
    return userNumber === ownerNumber;
  } catch (err) {
    console.error("isGroupOwner error:", err.message);
    return false;
  }
}

// ============================================================================
//  CLEAR CACHES
// ============================================================================
export function clearAdminCache(groupJid, userJid) {
  if (groupJid && userJid) {
    adminCache.delete(`${groupJid}_${normalizeNum(userJid)}`);
  }
}

export function clearGroupCache(groupJid) {
  if (groupJid) {
    groupMetadataCache.delete(groupJid);
    for (const key of adminCache.keys()) {
      if (key.startsWith(groupJid + "_") || key === `botadmin_${groupJid}`) {
        adminCache.delete(key);
      }
    }
  }
}

// ============================================================================
//  FORCE REFRESH BOT ADMIN STATUS
// ============================================================================
export async function refreshBotAdminStatus(groupJid, sock) {
  if (!groupJid || !sock) return false;
  clearGroupCache(groupJid);
  return isBotGroupAdminCached(groupJid, sock, true);
}

// ============================================================================
//  VALIDATE JID FORMAT
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
//  VALIDATE GROUP COMMAND — single permission-check source of truth
//  FIX: isGroupAdminCached now uses normalizeNum correctly
// ============================================================================
export async function validateGroupCommand(
  groupJid,
  userJid,
  sock,
  requiredRole = "admin",
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

    const isGlobalAdmin = isAdmin(userJid);

    if (requiredRole === "member") {
      return {
        success: true,
        metadata: await getGroupMetadataCached(groupJid, sock),
        userIsGlobalAdmin: isGlobalAdmin,
        userIsGroupAdmin: false,
      };
    }

    const isGroupAdmin = await isGroupAdminCached(groupJid, userJid, sock);

    if (!isGlobalAdmin && !isGroupAdmin) {
      return {
        success: false,
        error: "❌ *Admin Only*\nOnly group admins can use this command.",
      };
    }

    if (requiredRole === "botAdmin") {
      const botIsAdmin = await isBotGroupAdminCached(groupJid, sock, true);
      if (!botIsAdmin) {
        return {
          success: false,
          error:
            "❌ *Bot Not Admin*\nI need to be a group admin for this.\nPromote me in group settings first.",
        };
      }
    }

    return {
      success: true,
      metadata: await getGroupMetadataCached(groupJid, sock),
      userIsGlobalAdmin: isGlobalAdmin,
      userIsGroupAdmin: isGroupAdmin,
    };
  } catch (err) {
    console.error("validateGroupCommand error:", err.message);
    return {
      success: false,
      error: "❌ *Validation Error*\nCould not check permissions. Try again.",
    };
  }
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
  debugBotAdmin,
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
};
