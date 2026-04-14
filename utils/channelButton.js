// utils/channelButton.js — AYOBOT v1.0.0
// Message sending utilities with button support

import { ENV } from "../index.js";

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

export async function sendMsg(sock, jid, content, options = {}) {
  try {
    if (!sock || !jid) return null;

    let messageOptions = {};

    if (typeof content === "string") {
      messageOptions = { text: content };
    } else if (content.text) {
      messageOptions = { text: content.text };
    } else if (content.image) {
      messageOptions = {
        image: content.image,
        caption: content.caption || "",
        ...(content.mentions && { mentions: content.mentions }),
      };
    } else if (content.video) {
      messageOptions = {
        video: content.video,
        caption: content.caption || "",
        ...(content.mentions && { mentions: content.mentions }),
      };
    } else if (content.audio) {
      messageOptions = {
        audio: content.audio,
        mimetype: content.mimetype || "audio/mpeg",
        ptt: content.ptt || false,
      };
    } else if (content.document) {
      messageOptions = {
        document: content.document,
        fileName: content.fileName || "file",
        caption: content.caption || "",
        mimetype: content.mimetype || "application/octet-stream",
      };
    } else if (content.sticker) {
      messageOptions = { sticker: content.sticker };
    } else {
      messageOptions = content;
    }

    const result = await sock.sendMessage(jid, {
      ...messageOptions,
      ...options,
    });
    return result;
  } catch (error) {
    console.error(`[sendMsg] Error: ${error.message}`);
    return null;
  }
}

export async function sendReply(sock, msg, content, options = {}) {
  const from = msg.key?.remoteJid;
  if (!from) return null;

  const replyOptions = {
    ...options,
    quoted: msg,
  };

  return sendMsg(sock, from, content, replyOptions);
}

export async function sendTyping(sock, jid) {
  try {
    await sock.sendPresenceUpdate("composing", jid);
  } catch (error) {
    // Ignore typing errors
  }
}

export async function sendRecording(sock, jid) {
  try {
    await sock.sendPresenceUpdate("recording", jid);
  } catch (error) {
    // Ignore recording errors
  }
}

export async function sendPaused(sock, jid) {
  try {
    await sock.sendPresenceUpdate("paused", jid);
  } catch (error) {
    // Ignore paused errors
  }
}

export function createButtonMessage(title, buttons, footer = TAG) {
  return {
    text: title,
    footer: footer,
    buttons: buttons.map((btn, i) => ({
      buttonId: btn.id || `btn_${i}`,
      buttonText: { displayText: btn.text },
      type: 1,
    })),
    headerType: 1,
  };
}

export function createListMessage(title, sections, footer = TAG) {
  return {
    text: title,
    footer: footer,
    title: title,
    buttonText: "Select Option",
    sections: sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({
        title: row.title,
        description: row.description || "",
        rowId: row.id,
      })),
    })),
  };
}

export default {
  sendMsg,
  sendReply,
  sendTyping,
  sendRecording,
  sendPaused,
  createButtonMessage,
  createListMessage,
};
