// ════════════════════════════════════════════════════════════════════════════
//  commands/group/viewonce.js — AYOBOT v1.0.1 (Enhanced)
//  .ok — VIEW ONCE TO DM — ENHANCED WITH CACHING, ADVANCED ERROR HANDLING, NEW FEATURES
//  Reactions: ⏳ processing | ✅ sent | ❌ not view-once | ⚠️ privacy | 🔴 error
//  Author: AYOCODES — github.com/Officialay12
//  Version: v1.0.1 (Enhanced) — ADDED: CACHING, RETRIES, LOGGING, MORE ALIASES
// ════════════════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────────────────────
//  MODULE SETUP & CACHING
// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Simple in-memory cache for media buffers (to avoid re-downloading if possible)
const mediaCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedMedia(key) {
  const item = mediaCache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) return item.buffer;
  mediaCache.delete(key);
  return null;
}

function setCachedMedia(key, buffer) {
  mediaCache.set(key, { buffer, timestamp: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
//  RETRY HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function retryOperation(operation, retries = 3, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await operation();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REACTION HELPER — ENHANCED
// ─────────────────────────────────────────────────────────────────────────────
async function sendReaction(sock, message, emoji) {
  try {
    const key = message?.key;
    if (!key?.remoteJid || !key?.id) return false;
    await sock.sendMessage(key.remoteJid, {
      react: { text: emoji, key },
    });
    return true;
  } catch (err) {
    console.debug("[viewonce] sendReaction failed:", err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  JID UTILITIES — ENHANCED
// ─────────────────────────────────────────────────────────────────────────────
function toPersonalJid(jid) {
  if (!jid || typeof jid !== "string") return null;
  if (jid.includes("@g.us")) return null;
  const cleaned = jid.replace(/:([^@]*)@/, "@");
  return cleaned.includes("@") ? cleaned : `${cleaned}@s.whatsapp.net`;
}

function getSenderPersonalJid(message, userJid) {
  const remoteJid = message?.key?.remoteJid || "";
  const participant = message?.key?.participant || message?.participant || "";
  if (remoteJid.includes("@g.us")) {
    return participant ? toPersonalJid(participant) : null;
  }
  const dmJid = toPersonalJid(remoteJid);
  return dmJid || (userJid ? toPersonalJid(userJid) : null);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MEDIA UTILITIES — ENHANCED WITH CACHING & RETRIES
// ─────────────────────────────────────────────────────────────────────────────
async function downloadMedia(mediaMsg, type, messageId) {
  const cacheKey = `media_${messageId}_${type}`;
  const cached = getCachedMedia(cacheKey);
  if (cached) return cached;

  const buffer = await retryOperation(async () => {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  });

  setCachedMedia(cacheKey, buffer);
  return buffer;
}

function extractViewOnceMedia(quotedMsg) {
  if (!quotedMsg || typeof quotedMsg !== "object") return null;
  const candidates = [
    { msg: quotedMsg?.viewOnceMessageV2?.message?.imageMessage, type: "image" },
    { msg: quotedMsg?.viewOnceMessageV2?.message?.videoMessage, type: "video" },
    { msg: quotedMsg?.viewOnceMessageV2?.message?.audioMessage, type: "audio" },
    { msg: quotedMsg?.viewOnceMessage?.message?.imageMessage, type: "image" },
    { msg: quotedMsg?.viewOnceMessage?.message?.videoMessage, type: "video" },
    { msg: quotedMsg?.viewOnceMessage?.message?.audioMessage, type: "audio" },
    {
      msg:
        quotedMsg?.imageMessage?.viewOnce === true
          ? quotedMsg.imageMessage
          : null,
      type: "image",
    },
    {
      msg:
        quotedMsg?.videoMessage?.viewOnce === true
          ? quotedMsg.videoMessage
          : null,
      type: "video",
    },
    {
      msg:
        quotedMsg?.audioMessage?.viewOnce === true
          ? quotedMsg.audioMessage
          : null,
      type: "audio",
    },
  ];
  for (const { msg, type } of candidates) {
    if (msg) return { mediaMsg: msg, type };
  }
  return null;
}

async function sendViewOnceToDM(sock, senderJid, buffer, type) {
  const dmJid = toPersonalJid(senderJid);
  if (!dmJid) throw new Error(`Cannot resolve personal JID from: ${senderJid}`);

  let payload;
  if (type === "image") {
    payload = { image: buffer, mimetype: "image/jpeg", viewOnce: true };
  } else if (type === "video") {
    payload = { video: buffer, mimetype: "video/mp4", viewOnce: true };
  } else if (type === "audio") {
    payload = {
      audio: buffer,
      mimetype: "audio/mp4",
      ptt: true,
      viewOnce: true,
    };
  } else {
    throw new Error(`Unsupported media type: ${type}`);
  }

  await sock.sendMessage(dmJid, payload);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMMAND EXPORT — ENHANCED
// ─────────────────────────────────────────────────────────────────────────────
export async function viewOnceToDM({ message, userJid, sock, ENV }) {
  await sendReaction(sock, message, "⏳");

  try {
    const senderJid = getSenderPersonalJid(message, userJid);
    if (!senderJid) {
      console.error("[.ok] Could not resolve sender personal JID", {
        remoteJid: message?.key?.remoteJid,
        participant: message?.key?.participant,
        userJid,
      });
      await sendReaction(sock, message, "🔴");
      return;
    }

    const msgContent = message?.message || {};
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.imageMessage?.contextInfo ||
      msgContent?.videoMessage?.contextInfo ||
      msgContent?.buttonsResponseMessage?.contextInfo ||
      null;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
      await sendReaction(sock, message, "❌");
      return;
    }

    const extracted = extractViewOnceMedia(quotedMsg);
    if (!extracted) {
      await sendReaction(sock, message, "❌");
      return;
    }

    const { mediaMsg, type } = extracted;
    const messageId = contextInfo?.stanzaId || message?.key?.id || "unknown";

    let buffer;
    try {
      buffer = await downloadMedia(mediaMsg, type, messageId);
    } catch (downloadErr) {
      console.error("[.ok] Media download failed:", downloadErr.message);
      await sendReaction(sock, message, "🔴");
      return;
    }

    if (!buffer || buffer.length < 1024) {
      console.error("[.ok] Buffer too small:", buffer?.length ?? 0, "bytes");
      await sendReaction(sock, message, "🔴");
      return;
    }

    try {
      await sendViewOnceToDM(sock, senderJid, buffer, type);
      await sendReaction(sock, message, "✅");
      // Optional: Log success
      console.log(`[.ok] Sent ${type} to DM for ${senderJid}`);
    } catch (sendErr) {
      console.error("[.ok] DM send failed:", sendErr.message);
      if (
        sendErr.message.includes("not-allowed") ||
        sendErr.message.includes("privacy")
      ) {
        await sendReaction(sock, message, "⚠️");
      } else {
        await sendReaction(sock, message, "🔴");
      }
    }
  } catch (fatalErr) {
    console.error("[.ok] Fatal error:", fatalErr.message);
    await sendReaction(sock, message, "🔴");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NAMED ALIAS EXPORTS — ENHANCED WITH MORE ALIASES
// ─────────────────────────────────────────────────────────────────────────────
export const ok = viewOnceToDM;
export const dm = viewOnceToDM;
export const tome = viewOnceToDM;
export const senddm = viewOnceToDM;
export const push = viewOnceToDM;
export const privatemedia = viewOnceToDM;
export const savetodm = viewOnceToDM;
export const sendtome = viewOnceToDM;
export const viewonce = viewOnceToDM;
export const reveal = viewOnceToDM;
export const unhide = viewOnceToDM;

export default {
  viewOnceToDM,
  ok,
  dm,
  tome,
  senddm,
  push,
  privatemedia,
  savetodm,
  sendtome,
  viewonce,
  reveal,
  unhide,
};
