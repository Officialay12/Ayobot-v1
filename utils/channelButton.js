// utils/channelButton.js - AYOBOT v1 | Created by AYOCODES
// Central sendMsg utility — injects "View Channel" button on every outgoing message

import axios from "axios";

// ========== NEWSLETTER CONSTANTS ==========
export const NEWSLETTER_JID = "120363422418001588@newsletter";
export const NEWSLETTER_NAME = "AyoBot Tech Hub";
export const CHANNEL_LINK =
  "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25";

// Message types that do NOT support contextInfo — skip button for these
const NO_BUTTON_TYPES = ["audio", "sticker", "ptt"];

// ========== INJECT CHANNEL BUTTON ==========
function injectChannelButton(content) {
  const isSkip = NO_BUTTON_TYPES.some((t) => content[t] !== undefined);
  if (isSkip) return content;

  return {
    ...content,
    contextInfo: {
      ...(content.contextInfo || {}),
      forwardingScore: 0,
      isForwarded: false,
      forwardedNewsletterMessageInfo: {
        newsletterJid: NEWSLETTER_JID,
        newsletterName: NEWSLETTER_NAME,
        serverMessageId: -1,
      },
    },
  };
}

// ========== SEND MESSAGE HELPER ==========
// Used by ALL feature files — auto-injects View Channel button
export async function sendMsg(sock, jid, content, opts = {}) {
  try {
    const patched = injectChannelButton(content);
    return await sock.sendMessage(jid, patched, { ...opts });
  } catch (error) {
    console.error("❌ sendMsg error:", error.message);
    try {
      return await sock.sendMessage(jid, content, { ...opts });
    } catch (e2) {
      console.error("❌ sendMsg fallback failed:", e2.message);
      return null;
    }
  }
}

// ========== withChannelButton ==========
export function withChannelButton(content) {
  return injectChannelButton(content);
}

// ========== safeSend ==========
export async function safeSend(sock, jid, content, opts = {}) {
  return sendMsg(sock, jid, content, opts);
}

// ========== getThumb ==========
// Fetches a thumbnail buffer from a URL — used by multiple feature files
export async function getThumb(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return Buffer.from(res.data);
  } catch (_) {
    return null;
  }
}

// ========== getBuffer ==========
// General purpose buffer downloader — used by media feature files
export async function getBuffer(url, timeout = 60000) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    maxContentLength: 100 * 1024 * 1024,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  return Buffer.from(res.data);
}

// ========== fetchJson ==========
// General purpose JSON fetcher
export async function fetchJson(url, opts = {}) {
  const res = await axios.get(url, { timeout: 15000, ...opts });
  return res.data;
}

// ========== isUrl ==========
export function isUrl(text) {
  try {
    new URL(text);
    return true;
  } catch (_) {
    return false;
  }
}

// ========== sleep ==========
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== formatSize ==========
export function formatSize(bytes) {
  if (!bytes) return "Unknown";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ========== formatDuration ==========
export function formatDuration(seconds) {
  const s = parseInt(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ========== formatNumber ==========
export function formatNumber(num) {
  if (!num) return "N/A";
  const n = parseInt(num);
  if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

// ========== getRandom ==========
export function getRandom(array) {
  if (!array || !array.length) return null;
  return array[Math.floor(Math.random() * array.length)];
}

// ========== truncate ==========
export function truncate(text, maxLength = 300) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ========== extractText ==========
// Pulls plain text from a WhatsApp message object
export function extractText(message) {
  const msg = message?.message;
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

// ========== getQuotedMessage ==========
export function getQuotedMessage(message) {
  return (
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage || null
  );
}

// ========== getMentions ==========
export function getMentions(message) {
  return message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

// ========== buildMention ==========
export function buildMention(jid) {
  return `@${jid.split("@")[0]}`;
}

// ========== BRAND / WATERMARK ==========
export const BRAND = "⚡ _AYOBOT v1 by AYOCODES_";
export const WATERMARK = "\n\n⚡ _AYOBOT v1 by AYOCODES_";
