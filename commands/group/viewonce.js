// ════════════════════════════════════════════════════════════════════════════
//  commands/group/viewonce.js — AYOBOT v1.0.0
//  .ok — VIEW ONCE TO DM
//  Reactions: ⏳ processing | ✅ sent | ❌ not view-once | ⚠️ privacy | 🔴 error
//  Author: AYOCODES — github.com/Officialay12
// ════════════════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "@whiskeysockets/baileys";

// ════════════════════════════════════════════════════════════════════════════
//  REACTION HELPER
//  sendReaction is NOT a Baileys built-in — we define it here so this module
//  is fully self-contained and never crashes due to a missing global.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Send a reaction emoji to a message.
 * Falls back silently if the socket doesn't support it.
 */
async function sendReaction(sock, message, emoji) {
  try {
    const key = message?.key;
    if (!key?.remoteJid || !key?.id) return;

    await sock.sendMessage(key.remoteJid, {
      react: {
        text: emoji,
        key,
      },
    });
  } catch (err) {
    // Never let a failed reaction crash the main flow
    console.warn("[viewonce] sendReaction failed:", err?.message || err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  JID UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Normalize any JID to a clean personal @s.whatsapp.net JID.
 * Strips device suffix (e.g. 234xxx:5@s.whatsapp.net → 234xxx@s.whatsapp.net).
 * Returns null if the JID is a group or is invalid.
 */
function toPersonalJid(jid) {
  if (!jid || typeof jid !== "string") return null;
  if (jid.includes("@g.us")) return null;

  // Strip device suffix: number:device@server → number@server
  const cleaned = jid.replace(/:([^@]*)@/, "@");

  if (!cleaned.includes("@")) {
    return `${cleaned}@s.whatsapp.net`;
  }

  return cleaned;
}

/**
 * Resolve the real sender's personal JID regardless of whether the message
 * came from a group or a DM.
 *
 * Priority order:
 *  1. message.key.participant  (group sender, most reliable)
 *  2. message.participant      (some Baileys versions put it here)
 *  3. remoteJid                (DM — remoteJid IS the sender)
 *  4. userJid from handler     (fallback from command context)
 */
function getSenderPersonalJid(message, userJid) {
  const remoteJid  = message?.key?.remoteJid || "";
  const participant =
    message?.key?.participant ||
    message?.participant       ||
    "";

  // In a group chat the participant field is the real sender
  if (remoteJid.includes("@g.us")) {
    if (participant) return toPersonalJid(participant);
    // Group message with no participant — nothing we can do
    return null;
  }

  // In a DM the remoteJid is the sender (for incoming messages)
  const dmJid = toPersonalJid(remoteJid);
  if (dmJid) return dmJid;

  // Final fallback: userJid injected by the command handler
  if (userJid) return toPersonalJid(userJid);

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  MEDIA UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Stream and buffer media from a Baileys message media object.
 * Uses chunk accumulation to avoid repeated Buffer reallocation.
 *
 * @param {object} mediaMsg - Baileys imageMessage / videoMessage object
 * @param {"image"|"video"} type
 * @returns {Promise<Buffer>}
 */
async function downloadMedia(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Walk all known view-once envelope formats and return the first match.
 *
 * WhatsApp has evolved the view-once envelope across versions:
 *   - viewOnceMessageV2  (current, most common)
 *   - viewOnceMessage    (legacy)
 *   - imageMessage / videoMessage with viewOnce: true  (older clients)
 *
 * @param {object} quotedMsg
 * @returns {{ mediaMsg: object, type: "image"|"video" } | null}
 */
function extractViewOnceMedia(quotedMsg) {
  if (!quotedMsg || typeof quotedMsg !== "object") return null;

  const candidates = [
    // Current format
    { msg: quotedMsg?.viewOnceMessageV2?.message?.imageMessage, type: "image" },
    { msg: quotedMsg?.viewOnceMessageV2?.message?.videoMessage, type: "video" },
    // Legacy format
    { msg: quotedMsg?.viewOnceMessage?.message?.imageMessage,   type: "image" },
    { msg: quotedMsg?.viewOnceMessage?.message?.videoMessage,   type: "video" },
    // Older inline format
    {
      msg: quotedMsg?.imageMessage?.viewOnce === true
        ? quotedMsg.imageMessage
        : null,
      type: "image",
    },
    {
      msg: quotedMsg?.videoMessage?.viewOnce === true
        ? quotedMsg.videoMessage
        : null,
      type: "video",
    },
  ];

  for (const { msg, type } of candidates) {
    if (msg) return { mediaMsg: msg, type };
  }

  return null;
}

/**
 * Send media to a personal DM as a new view-once message.
 *
 * @param {object} sock     - Baileys socket
 * @param {string} senderJid
 * @param {Buffer} buffer
 * @param {"image"|"video"} type
 */
async function sendViewOnceToDM(sock, senderJid, buffer, type) {
  const dmJid = toPersonalJid(senderJid);

  if (!dmJid) {
    throw new Error(`Cannot resolve personal JID from: ${senderJid}`);
  }

  let payload;
  if (type === "image") {
    payload = {
      image: buffer,
      mimetype: "image/jpeg",
      viewOnce: true,
    };
  } else if (type === "video") {
    payload = {
      video: buffer,
      mimetype: "video/mp4",
      viewOnce: true,
    };
  } else {
    throw new Error(`Unsupported media type: ${type}`);
  }

  await sock.sendMessage(dmJid, payload);
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMMAND EXPORT
// ════════════════════════════════════════════════════════════════════════════

/**
 * .ok / .dm / .tome — forwards a quoted view-once media to your DM inbox.
 *
 * Usage  : Reply to a view-once image or video, then send .ok
 * Context: Works in both group chats and DMs
 *
 * @param {{ message: object, userJid: string, sock: object }} ctx
 */
export async function viewOnceToDM({ message, userJid, sock }) {
  // ── Immediately show processing indicator ──────────────────────────────
  await sendReaction(sock, message, "⏳");

  try {
    // ── 1. Resolve the real sender's personal JID ──────────────────────
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

    // ── 2. Extract the quoted message from any message type ────────────
    const msgContent = message?.message || {};
    const contextInfo =
      msgContent?.extendedTextMessage?.contextInfo ||
      msgContent?.imageMessage?.contextInfo        ||
      msgContent?.videoMessage?.contextInfo        ||
      msgContent?.buttonsResponseMessage?.contextInfo ||
      null;

    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
      // User didn't quote anything — react ❌ (no view-once to reveal)
      await sendReaction(sock, message, "❌");
      return;
    }

    // ── 3. Check quoted message is actually a view-once ────────────────
    const extracted = extractViewOnceMedia(quotedMsg);

    if (!extracted) {
      // Quoted message exists but is not view-once
      await sendReaction(sock, message, "❌");
      return;
    }

    const { mediaMsg, type } = extracted;

    // ── 4. Download the view-once media ────────────────────────────────
    let buffer;
    try {
      buffer = await downloadMedia(mediaMsg, type);
    } catch (downloadErr) {
      console.error("[.ok] Media download failed:", downloadErr?.message || downloadErr);
      await sendReaction(sock, message, "🔴");
      return;
    }

    if (!buffer || buffer.length < 1024) {
      // Buffer too small to be a real media file
      console.error("[.ok] Buffer too small or empty:", buffer?.length ?? 0, "bytes");
      await sendReaction(sock, message, "🔴");
      return;
    }

    // ── 5. Forward to sender's DM ──────────────────────────────────────
    try {
      await sendViewOnceToDM(sock, senderJid, buffer, type);
      await sendReaction(sock, message, "✅");
    } catch (sendErr) {
      console.error("[.ok] DM send failed:", sendErr?.message || sendErr);

      const msg = sendErr?.message || "";
      if (msg.includes("not-allowed") || msg.includes("privacy")) {
        // User's privacy settings block DMs from the bot
        await sendReaction(sock, message, "⚠️");
      } else {
        await sendReaction(sock, message, "🔴");
      }
    }

  } catch (fatalErr) {
    console.error("[.ok] Fatal error:", fatalErr?.message || fatalErr);
    await sendReaction(sock, message, "🔴");
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  NAMED ALIAS EXPORTS
//  The command handler looks for these names in the module, so each alias
//  must be individually exported — not just listed in the aliases array.
// ════════════════════════════════════════════════════════════════════════════

export const ok           = viewOnceToDM;
export const dm           = viewOnceToDM;
export const tome         = viewOnceToDM;
export const senddm       = viewOnceToDM;
export const push         = viewOnceToDM;
export const privatemedia = viewOnceToDM;
export const savetodm     = viewOnceToDM;
export const sendtome     = viewOnceToDM;

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
};
