// utils/validators.js - FIXED RATE LIMITING (NO SPAM)
import {
  commandRateLimit,
  spamTracker,
  isAdmin,
  RATE_LIMIT_WINDOW,
  MAX_COMMANDS_PER_WINDOW,
  RATE_LIMIT_MESSAGES,
  SPAM_TIME_WINDOW,
  MAX_SPAM_MESSAGES,
  MAX_SIMILAR_MESSAGES,
  adminCache,
  ADMIN_CACHE_TTL,
  groupMetadataCache,
  GROUP_META_TTL,
} from "../index.js";

// ========== IMPROVED RATE LIMITING ==========
export function isRateLimited(userJid, isAdminUser) {
  // Admins never get rate limited
  if (isAdminUser) return false;

  const now = Date.now();
  const key = `rate_${userJid}`;

  // Get user's command timestamps
  let userTimestamps = commandRateLimit.get(key) || [];

  // Remove timestamps older than the rate limit window
  userTimestamps = userTimestamps.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW,
  );

  // Check if user has exceeded the limit
  if (userTimestamps.length >= MAX_COMMANDS_PER_WINDOW) {
    return true;
  }

  // Add current timestamp
  userTimestamps.push(now);
  commandRateLimit.set(key, userTimestamps);

  return false;
}

export function getRateLimitMessage() {
  // Return a random rate limit message
  return RATE_LIMIT_MESSAGES[
    Math.floor(Math.random() * RATE_LIMIT_MESSAGES.length)
  ];
}

// ========== IMPROVED SPAM DETECTION ==========
export function isSpam(userJid, text) {
  // Don't check admins
  if (isAdmin(userJid)) return false;

  const now = Date.now();
  const spamKey = `spam_${userJid}`;
  const messageKey = `msg_${userJid}`;

  // Get or initialize spam tracker
  let spamData = spamTracker.get(spamKey) || {
    messageCount: 0,
    firstMessageTime: now,
    lastMessageTime: now,
    messages: [],
  };

  // Clean old messages
  spamData.messages = spamData.messages.filter(
    (m) => now - m.time < SPAM_TIME_WINDOW,
  );

  // Check for too many messages
  if (spamData.messages.length >= MAX_SPAM_MESSAGES) {
    return true;
  }

  // Check for similar messages (spam)
  const similarMessages = spamData.messages.filter(
    (m) => m.text === text,
  ).length;

  if (similarMessages >= MAX_SIMILAR_MESSAGES) {
    return true;
  }

  // Add this message
  spamData.messages.push({ text, time: now });
  spamData.lastMessageTime = now;
  spamData.messageCount++;

  // Update tracker
  spamTracker.set(spamKey, spamData);

  return false;
}

// ========== REST OF YOUR EXISTING FUNCTIONS (unchanged) ==========
export function containsLink(text) {
  if (!text || typeof text !== "string") return false;

  const urlPatterns = [
    /https?:\/\/[^\s<>"']+/gi,
    /(?:www\.)[^\s<>"']+\.[^\s<>"']{2,}/gi,
    /\b[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?\b/gi,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(?:\/[^\s<>"']*)?\b/gi,
    /\b(?:bit\.ly|tinyurl\.com|is\.gd|cli\.gs|ow\.ly|goo\.gl|tiny\.cc|cutt\.ly|rebrand\.ly)\/[^\s<>"']*/gi,
    /(?:chat\.whatsapp\.com|wa\.me|call\.whatsapp\.com)\/[^\s<>"']+/gi,
    /t\.me\/[^\s<>"']+/gi,
    /discord\.gg\/[^\s<>"']+/gi,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  ];

  for (const pattern of urlPatterns) {
    if (pattern.test(text)) return true;
  }
  if (text.includes("://")) return true;
  return false;
}

export function extractText(message) {
  if (!message.message) return "";
  return (
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    message.message.imageMessage?.caption ||
    message.message.videoMessage?.caption ||
    ""
  );
}

export function extractTargetUser(args, message) {
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) {
    return { jid: quoted, phone: quoted.split("@")[0], method: "reply" };
  }

  const mentions =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentions?.length > 0) {
    return {
      jid: mentions[0],
      phone: mentions[0].split("@")[0],
      method: "mention",
    };
  }

  if (args?.length > 0) {
    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length >= 10) {
      return { jid: `${phone}@s.whatsapp.net`, phone, method: "number" };
    }
  }
  return null;
}

export async function isGroupAdminCached(groupJid, userJid, sock) {
  const cacheKey = `${groupJid}_${userJid}`;
  const cached = adminCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL)
    return cached.isAdmin;

  try {
    if (isAdmin(userJid)) {
      adminCache.set(cacheKey, { isAdmin: true, timestamp: Date.now() });
      return true;
    }
    const metadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (!metadata) return false;
    const participant = metadata.participants.find((p) => p.id === userJid);
    const isAdminUser = !!(
      participant?.admin === "admin" || participant?.admin === "superadmin"
    );
    adminCache.set(cacheKey, { isAdmin: isAdminUser, timestamp: Date.now() });
    return isAdminUser;
  } catch (error) {
    return false;
  }
}

export async function isBotGroupAdminCached(groupJid, sock) {
  const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
  return await isGroupAdminCached(groupJid, botId, sock);
}

export async function getGroupMetadataCached(groupJid, sock) {
  const cached = groupMetadataCache.get(groupJid);
  if (cached && Date.now() - cached.timestamp < GROUP_META_TTL)
    return cached.metadata;
  try {
    const metadata = await sock.groupMetadata(groupJid);
    groupMetadataCache.set(groupJid, { metadata, timestamp: Date.now() });
    return metadata;
  } catch (error) {
    return null;
  }
}

export function clearAdminCache(groupJid, userJid) {
  adminCache.delete(`${groupJid}_${userJid}`);
}

export async function validateGroupCommand(
  from,
  userJid,
  sock,
  requiredLevel = "admin",
) {
  try {
    if (!from.endsWith("@g.us")) {
      return {
        success: false,
        error: "❌ *Group Only Command*\nThis command only works in groups.",
      };
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return {
        success: false,
        error: "❌ *Group Error*\nCould not fetch group information.",
      };
    }

    const userIsGlobalAdmin = isAdmin(userJid);
    const userIsGroupAdmin = await isGroupAdminCached(from, userJid, sock);

    // Check if user has admin rights
    const userHasAdminRights = userIsGlobalAdmin || userIsGroupAdmin;

    if (requiredLevel === "admin" && !userHasAdminRights) {
      return {
        success: false,
        error: "❌ *Admin Only*\nOnly group admins can use this command.",
      };
    }

    // For commands requiring bot admin
    if (requiredLevel === "botAdmin") {
      if (!userHasAdminRights) {
        return {
          success: false,
          error: "❌ *Admin Only*\nOnly group admins can use this command.",
        };
      }

      const botIsAdmin = await isBotGroupAdminCached(from, sock);
      if (!botIsAdmin) {
        return {
          success: false,
          error:
            "❌ *Bot Not Admin*\nI need to be a group admin to perform this action.\n\nPlease make me an admin first.",
        };
      }
    }

    return {
      success: true,
      metadata,
      userIsGlobalAdmin,
      userIsGroupAdmin,
    };
  } catch (error) {
    console.error("Validation error:", error);
    return {
      success: false,
      error: "❌ *Validation Error*\nCould not validate permissions.",
    };
  }
}
