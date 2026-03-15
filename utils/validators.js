// utils/validators.js - AYOBOT v1 | Created by AYOCODES
// Hardened against JID device suffixes, null inputs, cache poisoning,
// network failures, and all known WhatsApp Baileys edge cases. — AYOCODES

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

// ─── JID / Phone normalization ────────────────────────────────────────────────
// THE most important function in this file. Every WhatsApp JID comparison MUST
// go through this. Handles:
//   2349159180375:58@s.whatsapp.net  → 2349159180375
//   2349159180375@s.whatsapp.net     → 2349159180375
//   2349159180375                    → 2349159180375
//   +234 915 918 0375                → 2349159180375
//   null / undefined / object        → ""
// — AYOCODES
export function normalizeNum(jid) {
  if (!jid) return "";
  if (typeof jid === "object") jid = jid.id || jid.jid || String(jid);
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// Build a clean canonical JID from anything. — AYOCODES
export function toJid(raw) {
  const digits = normalizeNum(raw);
  return digits ? `${digits}@s.whatsapp.net` : null;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
export function isRateLimited(userJid, isAdminUser) {
  if (!userJid || isAdminUser) return false;
  const now = Date.now();
  const key = `rate_${normalizeNum(userJid)}`;
  let timestamps = commandRateLimit.get(key) || [];
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (timestamps.length >= MAX_COMMANDS_PER_WINDOW) return true;
  timestamps.push(now);
  commandRateLimit.set(key, timestamps);
  return false;
}

export function getRateLimitMessage() {
  return RATE_LIMIT_MESSAGES[
    Math.floor(Math.random() * RATE_LIMIT_MESSAGES.length)
  ];
}

// ─── Spam detection ───────────────────────────────────────────────────────────
export function isSpam(userJid, text) {
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
  const similar = data.messages.filter((m) => m.text === text).length;
  if (similar >= MAX_SIMILAR_MESSAGES) return true;
  data.messages.push({ text: text || "", time: now });
  data.lastMessageTime = now;
  data.messageCount++;
  spamTracker.set(key, data);
  return false;
}

// ─── Link detection ───────────────────────────────────────────────────────────
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
  for (const p of patterns) if (p.test(text)) return true;
  return text.includes("://");
}

// ─── Text extractor ───────────────────────────────────────────────────────────
export function extractText(message) {
  if (!message?.message) return "";
  const m = message.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

// ─── Target user extractor ────────────────────────────────────────────────────
export function extractTargetUser(args, message) {
  // 1. Quoted/replied-to message
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.participant ||
    message?.message?.extendedTextMessage?.contextInfo?.remoteJid;
  if (quoted && quoted.includes("@")) {
    const jid = toJid(quoted);
    if (jid) return { jid, phone: normalizeNum(jid), method: "reply" };
  }

  // 2. @mention in message
  const mentions =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentions?.length > 0) {
    const jid = mentions[0];
    return { jid, phone: normalizeNum(jid), method: "mention" };
  }

  // 3. Raw phone number in args
  if (args?.length > 0) {
    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length >= 7) {
      return { jid: `${phone}@s.whatsapp.net`, phone, method: "number" };
    }
  }

  return null;
}

// ─── Group admin check (with cache) ──────────────────────────────────────────
export async function isGroupAdminCached(groupJid, userJid, sock) {
  if (!groupJid || !userJid) return false;

  // Global owner always passes — check before any network call. — AYOCODES
  if (isAdmin(userJid)) return true;

  const cacheKey = `${groupJid}_${normalizeNum(userJid)}`;
  const cached = adminCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ADMIN_CACHE_TTL) {
    return cached.isAdmin;
  }

  try {
    const metadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (!metadata?.participants) return false;

    const userNum = normalizeNum(userJid);
    const participant = metadata.participants.find(
      (p) => normalizeNum(p.id) === userNum,
    );
    const result = !!(
      participant?.admin === "admin" || participant?.admin === "superadmin"
    );

    adminCache.set(cacheKey, { isAdmin: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error("isGroupAdminCached error:", err.message);
    return false;
  }
}

// ─── Bot admin check ──────────────────────────────────────────────────────────
export async function isBotGroupAdminCached(groupJid, sock) {
  if (!sock?.user?.id) return false;
  const botJid = `${normalizeNum(sock.user.id)}@s.whatsapp.net`;
  return isGroupAdminCached(groupJid, botJid, sock);
}

// ─── Group metadata cache ─────────────────────────────────────────────────────
export async function getGroupMetadataCached(groupJid, sock) {
  if (!groupJid || !sock) return null;
  const cached = groupMetadataCache.get(groupJid);
  if (cached && Date.now() - cached.timestamp < GROUP_META_TTL) {
    return cached.metadata;
  }
  try {
    const metadata = await sock.groupMetadata(groupJid);
    if (metadata) {
      groupMetadataCache.set(groupJid, { metadata, timestamp: Date.now() });
    }
    return metadata || null;
  } catch (err) {
    // Return stale cache rather than null if available. — AYOCODES
    if (cached?.metadata) return cached.metadata;
    return null;
  }
}

// ─── Cache invalidation ───────────────────────────────────────────────────────
export function clearAdminCache(groupJid, userJid) {
  if (groupJid && userJid) {
    adminCache.delete(`${groupJid}_${normalizeNum(userJid)}`);
  }
}

export function clearGroupCache(groupJid) {
  if (!groupJid) return;
  groupMetadataCache.delete(groupJid);
  for (const key of adminCache.keys()) {
    if (key.startsWith(`${groupJid}_`)) adminCache.delete(key);
  }
}

// ─── Main group command validator ─────────────────────────────────────────────
export async function validateGroupCommand(
  from,
  userJid,
  sock,
  requiredLevel = "admin",
) {
  try {
    if (!from?.endsWith("@g.us")) {
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

    const userIsGlobalAdmin = isAdmin(userJid);

    if (requiredLevel === "member") {
      const metadata = await getGroupMetadataCached(from, sock);
      return {
        success: true,
        metadata,
        userIsGlobalAdmin,
        userIsGroupAdmin: false,
      };
    }

    const userIsGroupAdmin = await isGroupAdminCached(from, userJid, sock);
    const userHasAdminRights = userIsGlobalAdmin || userIsGroupAdmin;

    if (!userHasAdminRights) {
      return {
        success: false,
        error: "❌ *Admin Only*\nOnly group admins can use this command.",
      };
    }

    if (requiredLevel === "botAdmin") {
      const botIsAdmin = await isBotGroupAdminCached(from, sock);
      if (!botIsAdmin) {
        return {
          success: false,
          error:
            "❌ *Bot Not Admin*\nI need to be a group admin for this.\n\nPromote me in group settings first.",
        };
      }
    }

    const metadata = await getGroupMetadataCached(from, sock);
    return { success: true, metadata, userIsGlobalAdmin, userIsGroupAdmin };
  } catch (err) {
    console.error("validateGroupCommand error:", err.message);
    return {
      success: false,
      error: "❌ *Validation Error*\nCould not check permissions. Try again.",
    };
  }
}
