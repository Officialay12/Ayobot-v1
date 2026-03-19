// utils/validators.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Validators & Helpers - FIXED BOT ADMIN DETECTION
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
// ============================================================================
export function normalizeNum(jid) {
  if (!jid) return "";
  if (typeof jid === "object") {
    jid = jid.id || jid.jid || String(jid);
  }
  return String(jid)
    .split("@")[0]
    .split(":")[0]
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
  if (!userJid || isAdmin(userJid)) return false;

  const now = Date.now();
  const key = `spam_${normalizeNum(userJid)}`;
  let data = spamTracker.get(key) || {
    messages: [],
    messageCount: 0,
    firstMessageTime: now,
    lastMessageTime: now,
  };

  // Clean old messages
  data.messages = data.messages.filter((m) => now - m.time < SPAM_TIME_WINDOW);

  // Check message count in time window
  if (data.messages.length >= MAX_SPAM_MESSAGES) {
    return true;
  }

  // Check for similar messages (copy-paste spam)
  const similarCount = data.messages.filter(
    (m) => m.text === messageText,
  ).length;
  if (similarCount >= MAX_SIMILAR_MESSAGES) {
    return true;
  }

  // Update data
  data.messages.push({ text: messageText || "", time: now });
  data.lastMessageTime = now;
  data.messageCount++;
  spamTracker.set(key, data);

  return false;
}

// ============================================================================
//  LINK DETECTION - COMPREHENSIVE
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
//  CACHED GROUP ADMIN CHECK - FIXED
// ============================================================================
export async function isGroupAdminCached(
  groupJid,
  userJid,
  sock,
  forceRefresh = false,
) {
  if (!groupJid || !userJid) return false;

  // Global admin check
  if (isAdmin(userJid)) return true;

  const cacheKey = `${groupJid}_${normalizeNum(userJid)}`;

  // Check cache if not forcing refresh
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
    const participant = metadata.participants.find((p) => {
      const participantNum = normalizeNum(p.id);
      return participantNum === userNum;
    });

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
//  CACHED BOT ADMIN CHECK - ULTRA FIXED (ONLY VERSION)
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

  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cached = adminCache.get(cacheKey);
    if (cached && now - cached.timestamp < 30000) {
      return cached.isAdmin;
    }
  }

  try {
    // Get bot's JID in multiple formats
    const botJid = sock.user.id;
    console.log("🔍 Raw bot JID:", botJid);

    // Extract just the phone number part (remove : and @ suffixes)
    const botNumber = botJid
      .split(":")[0]
      .split("@")[0]
      .replace(/[^0-9]/g, "");
    console.log("🔍 Clean bot number:", botNumber);

    // Get group metadata
    const metadata = await sock.groupMetadata(groupJid);
    if (!metadata || !metadata.participants) {
      adminCache.set(cacheKey, { isAdmin: false, timestamp: now });
      return false;
    }

    // Debug: Log all participants to see what we're comparing against
    console.log("🔍 Group participants:");
    metadata.participants.forEach((p) => {
      const pNum = p.id.split("@")[0].replace(/[^0-9]/g, "");
      console.log(`  - ${p.id} → ${pNum} (${p.admin || "member"})`);
    });

    // Find bot in participants - COMPARE ONLY THE NUMBERS
    const botParticipant = metadata.participants.find((p) => {
      const participantNum = p.id.split("@")[0].replace(/[^0-9]/g, "");
      return participantNum === botNumber;
    });

    const isAdmin = !!(
      botParticipant &&
      (botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin")
    );

    console.log(`🔍 Bot admin status: ${isAdmin ? "✅ YES" : "❌ NO"}`);
    if (botParticipant) {
      console.log(`🔍 Bot role in group: ${botParticipant.admin || "member"}`);
    }

    adminCache.set(cacheKey, { isAdmin, timestamp: now });
    return isAdmin;
  } catch (error) {
    console.error("❌ Error checking bot admin status:", error.message);
    return false;
  }
}

// ============================================================================
//  DEBUG BOT ADMIN - Helper function
// ============================================================================
export async function debugBotAdmin(groupJid, sock) {
  if (!groupJid || !sock) return;

  console.log("\n🔍 ===== BOT ADMIN DEBUG =====");

  const botJid = sock.user?.id;
  console.log("Bot JID:", botJid);

  const botNumber = botJid
    ?.split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "");
  console.log("Bot number:", botNumber);

  try {
    const metadata = await sock.groupMetadata(groupJid);
    console.log("Group:", metadata.subject);
    console.log("Total participants:", metadata.participants.length);

    console.log("\nAll participants:");
    metadata.participants.forEach((p) => {
      const pNum = p.id.split("@")[0].replace(/[^0-9]/g, "");
      const match = pNum === botNumber ? " ← BOT" : "";
      console.log(`  ${p.id} → ${pNum} (${p.admin || "member"})${match}`);
    });

    const botParticipant = metadata.participants.find((p) => {
      const pNum = p.id.split("@")[0].replace(/[^0-9]/g, "");
      return pNum === botNumber;
    });

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
    return groupMetadataCache.get(groupJid)?.metadata || null;
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
    // Also clear related admin cache entries
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

  // Clear cache for this group
  clearGroupCache(groupJid);

  // Re-check with fresh data
  return isBotGroupAdminCached(groupJid, sock, true);
}

// ============================================================================
//  VALIDATE GROUP COMMAND - FIXED
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

    // If only member role required
    if (requiredRole === "member") {
      return {
        success: true,
        metadata: await getGroupMetadataCached(groupJid, sock),
        userIsGlobalAdmin: isGlobalAdmin,
        userIsGroupAdmin: false,
      };
    }

    // Check group admin status
    const isGroupAdmin = await isGroupAdminCached(groupJid, userJid, sock);

    if (!isGlobalAdmin && !isGroupAdmin) {
      return {
        success: false,
        error: "❌ *Admin Only*\nOnly group admins can use this command.",
      };
    }

    // Check bot admin if required
    if (requiredRole === "botAdmin") {
      const botIsAdmin = await isBotGroupAdminCached(groupJid, sock, true); // Force refresh
      if (!botIsAdmin) {
        return {
          success: false,
          error:
            "❌ *Bot No