// utils/validators.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Validators & Helpers — PERMANENT FIXED VERSION
//  Author: AYOCODES
//
//  CRITICAL FIX:
//    normalizeNum() — MUST strip device suffix (:N) BEFORE extracting digits
//
//    Example:
//      Input:  "2349159180375:5@s.whatsapp.net"
//      WRONG:  .replace(/[^0-9]/g, "") → "23491591803755" ❌
//      RIGHT:  .split("@")[0].split(":")[0].replace(/[^0-9]/g, "") → "2349159180375" ✅
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
//  NORMALIZE PHONE NUMBER — THE PERMANENT FIX
//
//  This function MUST strip the device suffix BEFORE removing digits.
//  The order of operations is CRITICAL:
//    1. Split on "@" to remove domain
//    2. Split on ":" to remove device suffix
//    3. Then remove all non-digits
// ============================================================================
export function normalizeNum(jid) {
  if (!jid) return "";
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || String(jid);
  }

  // CRITICAL: Strip device suffix BEFORE removing digits
  const withoutDomain = String(jid).split("@")[0];
  const withoutDeviceSuffix = withoutDomain.split(":")[0];
  const onlyDigits = withoutDeviceSuffix.replace(/[^0-9]/g, "");

  return onlyDigits;
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
//  CACHED GROUP ADMIN CHECK
// ============================================================================
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  forceRefresh = false,
  ownerPhone = "",
) {
  if (!groupJid || !userJid) return false;

  // Bot owner bypass
  if (isAdmin(userJid, ownerPhone)) return true;

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
//  CACHED BOT ADMIN CHECK — THE KEY FUNCTION FOR BOT ADMIN DETECTION
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
    // Get bot number using normalizeNum (which now strips device suffix correctly)
    const botNumber = normalizeNum(sock.user.id);
    console.log(`[validators] Checking bot admin for: ${botNumber}`);

    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata?.participants) {
      adminCache.set(cacheKey, { isAdmin: false, timestamp: now });
      return false;
    }

    // Find bot in participants using normalized numbers
    const botParticipant = metadata.participants.find(
      (p) => normalizeNum(p.id) === botNumber,
    );

    if (botParticipant) {
      console.log(`[validators] Found bot participant: admin=${botParticipant.admin}`);
    } else {
      console.log(`[validators] Bot not found in participants`);
    }

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
//  DIRECT GROUP ADMIN CHECK (no cache)
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
//  BOT IN GROUP CHECK
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
    if (key.startsWith(groupJid + "_") || key === `botadmin_${groupJid}`) {
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
//  VALIDATE GROUP COMMAND
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

    const isGroupAdminResult = await isGroupAdminCached(
      groupJid,
      userJid,
      sock,
      false,
      ownerPhone,
    );

    if (!isGlobalAdmin && !isGroupAdminResult) {
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
      userIsGroupAdmin: isGroupAdminResult,
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
//  DEBUG FUNCTION - Run this to see what's happening
// ============================================================================
export async function debugAdminCheck(groupJid, sock) {
  if (!groupJid || !sock) return;

  console.log("\n🔍 ===== ADMIN DEBUG =====");
  const botJid = sock.user?.id;
  console.log("Bot raw JID:", botJid);
  const botNum = normalizeNum(botJid);
  console.log("Bot normalized:", botNum);

  try {
    const metadata = await sock.groupMetadata(groupJid);
    console.log("Group:", metadata.subject);
    console.log("Participants:");
    metadata.participants.forEach(p => {
      const pNum = normalizeNum(p.id);
      const isBot = pNum === botNum;
      console.log(`  ${p.id} → ${pNum} (${p.admin || "member"}) ${isBot ? "← BOT" : ""}`);
    });

    const botParticipant = metadata.participants.find(p => normalizeNum(p.id) === botNum);
    if (botParticipant) {
      console.log(`\n✅ Bot found! Admin status: ${botParticipant.admin === "admin" || botParticipant.admin === "superadmin"}`);
    } else {
      console.log("\n❌ Bot NOT found in participants!");
    }
  } catch (e) {
    console.error("Debug error:", e.message);
  }
  console.log("=========================\n");
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
