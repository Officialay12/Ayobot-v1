// commands/group/automation.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Automation Module — FIXED & COMPLETE
//  Author: AYOCODES
//
//  FIXES:
//    • isUserAdmin() now uses normalizeNum() to strip :N device suffix
//      before comparing JIDs. Old code: p.id === userJid — always false
//      when participant JID contains device suffix like :8 — AYOCODES
//    • Warning key format unified: ${groupJid}:${senderJid} across all
//      antilink code paths — no more mismatched warning counts
//
//  Features:
//    • Ultimate antilink — detects ALL link formats
//    • Immediate message deletion + warning system (3 strikes → kick)
//    • Welcome messages on join
//    • Goodbye messages on leave
//    • Auto-kick banned users on rejoin
// ════════════════════════════════════════════════════════════════════════════

import {
  ENV,
  groupSettings,
  bannedUsers,
  groupWarnings,
  saveGroupSettings,
  saveWarnings,
} from "../../index.js";
import {
  getGroupMetadataCached,
  normalizeNum,
} from "../../utils/validators.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../../temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let _gtts = null;
async function getGtts() {
  if (!_gtts) {
    try {
      const mod = await import("gtts");
      _gtts = mod.default || mod;
    } catch (_) {}
  }
  return _gtts;
}

// Safe JID extraction
function safeJid(jid) {
  if (!jid) return "";
  if (typeof jid === "string") return jid;
  if (typeof jid === "object" && (jid.id || jid.jid || jid.participant)) {
    return jid.id || jid.jid || jid.participant || String(jid);
  }
  return String(jid);
}

// Strips @domain AND :N device suffix — AYOCODES
function safePhone(jid) {
  return normalizeNum(safeJid(jid));
}

// ============================================================================
//  ULTIMATE LINK DETECTION PATTERNS
// ============================================================================
const LINK_PATTERNS = [
  /https?:\/\/[^\s<>"']+/gi,
  /www\.[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+(:[0-9]+)?(\/[^\s<>"']*)?/gi,
  /bit\.ly\/[a-zA-Z0-9_-]+/gi,
  /tinyurl\.com\/[a-zA-Z0-9_-]+/gi,
  /ow\.ly\/[a-zA-Z0-9_-]+/gi,
  /is\.gd\/[a-zA-Z0-9_-]+/gi,
  /buff\.ly\/[a-zA-Z0-9_-]+/gi,
  /adf\.ly\/[a-zA-Z0-9_-]+/gi,
  /shorte\.st\/[a-zA-Z0-9_-]+/gi,
  /goo\.gl\/[a-zA-Z0-9_-]+/gi,
  /tiny\.cc\/[a-zA-Z0-9_-]+/gi,
  /cutt\.ly\/[a-zA-Z0-9_-]+/gi,
  /rebrand\.ly\/[a-zA-Z0-9_-]+/gi,
  /shorturl\.at\/[a-zA-Z0-9_-]+/gi,
  /t\.co\/[a-zA-Z0-9_-]+/gi,
  /lnkd\.in\/[a-zA-Z0-9_-]+/gi,
  /rb\.gy\/[a-zA-Z0-9_-]+/gi,
  /s\.id\/[a-zA-Z0-9_-]+/gi,
  /aka\.ms\/[a-zA-Z0-9_-]+/gi,
  /youtu\.be\/[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/gi,
  /instagram\.com\/p\/[a-zA-Z0-9_-]+\/?/gi,
  /instagram\.com\/reel\/[a-zA-Z0-9_-]+\/?/gi,
  /twitter\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /x\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/[0-9]+/gi,
  /facebook\.com\/[a-zA-Z0-9_.-]+\/posts\/[0-9]+/gi,
  /fb\.watch\/[a-zA-Z0-9_-]+/gi,
  /wa\.me\/[0-9]+/gi,
  /chat\.whatsapp\.com\/[a-zA-Z0-9_]+/gi,
  /whatsapp\.com\/channel\/[0-9A-Za-z_-]+/gi,
  /t\.me\/[a-zA-Z0-9_]+/gi,
  /telegram\.me\/[a-zA-Z0-9_]+/gi,
  /discord\.gg\/[a-zA-Z0-9_]+/gi,
  /discord\.com\/invite\/[a-zA-Z0-9_]+/gi,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(:\d+)?(\/[^\s<>"']*)?/gi,
  /drive\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
  /docs\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
  /mega\.nz\/[#!][a-zA-Z0-9_-]+/gi,
  /dropbox\.com\/s\/[a-zA-Z0-9_-]+/gi,
  /spotify\.com\/track\/[a-zA-Z0-9]+/gi,
  /spotify\.com\/playlist\/[a-zA-Z0-9]+/gi,
  /soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/gi,
  // Domains without protocol (catch-all)
  /\b[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+\b(\/[^\s<>"']*)?/gi,
];

const ALLOWED_DOMAINS = [
  "wikipedia.org",
  "github.com",
  "stackoverflow.com",
  "npmjs.com",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "spotify.com",
  "deezer.com",
  "soundcloud.com",
  "ayocodes.com",
];

const MAX_ANTILINK_WARNINGS = 3;

// ============================================================================
//  LINK DETECTION
// ============================================================================
export function containsLink(text) {
  if (!text || typeof text !== "string") return false;

  for (const pattern of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }

  // Fallback: word-level domain detection
  const words = text.split(/\s+/);
  for (const word of words) {
    if (
      word.includes(".") &&
      !word.includes(" ") &&
      word.length > 4 &&
      word.length < 100
    ) {
      if (word.match(/\.[a-zA-Z]{2,}([\/\?]|$)/)) return true;
    }
  }

  return false;
}

// ============================================================================
//  ALLOWED DOMAIN CHECK
// ============================================================================
export function isAllowedDomain(url) {
  try {
    let domain = url.toLowerCase();
    domain = domain
      .replace(/^(https?:\/\/)?(www\.)?/, "")
      .split("/")[0]
      .split(":")[0];
    for (const allowed of ALLOWED_DOMAINS) {
      if (domain === allowed || domain.endsWith("." + allowed)) return true;
    }
  } catch (_) {}
  return false;
}

// ============================================================================
//  IS USER ADMIN — FIXED
//  OLD: p.id === userJid  → always false when :N device suffix present
//  NEW: normalizeNum() strips :N before comparing — AYOCODES
// ============================================================================
async function isUserAdmin(sock, groupJid, userJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const userNum = normalizeNum(userJid);
    return groupMetadata.participants.some(
      (p) =>
        normalizeNum(p.id) === userNum &&
        (p.admin === "admin" || p.admin === "superadmin"),
    );
  } catch {
    return false;
  }
}

// ============================================================================
//  MAIN ANTILINK HANDLER
// ============================================================================
export async function handleAntiLink(message, groupJid, sock) {
  try {
    if (!groupJid.endsWith("@g.us")) return false;

    const settings = groupSettings.get(groupJid) || {};
    if (!settings.antilink) return false;

    const msgObj = message.message || {};
    const text =
      msgObj.conversation ||
      msgObj.extendedTextMessage?.text ||
      msgObj.imageMessage?.caption ||
      msgObj.videoMessage?.caption ||
      msgObj.documentMessage?.caption ||
      "";

    if (!text) return false;
    if (!containsLink(text)) return false;

    const senderJid = message.key?.participant || groupJid;
    const senderNumber = safePhone(senderJid);

    // Admins are exempt
    const admin = await isUserAdmin(sock, groupJid, senderJid);
    if (admin) {
      console.log(`👑 Admin ${senderNumber} posted link — allowed`);
      return false;
    }

    if (isAllowedDomain(text)) {
      console.log(`✅ Allowed domain from ${senderNumber}`);
      return false;
    }

    console.log(`🚫 Link detected from ${senderNumber} in ${groupJid}`);

    // Delete the message
    let deleted = false;
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
      deleted = true;
      console.log("✅ Message deleted");
    } catch (deleteError) {
      console.log(`⚠️ Could not delete: ${deleteError.message}`);
    }

    // Track warnings — consistent key format across ALL antilink code — AYOCODES
    const warnKey = `${groupJid}:${senderJid}`;
    const userWarnings = groupWarnings.get(warnKey) || 0;
    const newWarnings = userWarnings + 1;
    groupWarnings.set(warnKey, newWarnings);
    saveWarnings();

    const warningsLeft = MAX_ANTILINK_WARNINGS - newWarnings;

    if (newWarnings >= MAX_ANTILINK_WARNINGS) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
        await sock.sendMessage(groupJid, {
          text:
            `🚫 *@${senderNumber} has been removed for posting links after ${MAX_ANTILINK_WARNINGS} warnings.*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n⚠️ Links are strictly prohibited in this group.\n\n` +
            `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
          mentions: [senderJid],
        });
        groupWarnings.delete(warnKey);
        saveWarnings();
        console.log(
          `👢 User ${senderNumber} kicked after ${MAX_ANTILINK_WARNINGS} warnings`,
        );
      } catch (kickError) {
        await sock.sendMessage(groupJid, {
          text:
            `⚠️ *WARNING ${newWarnings}/${MAX_ANTILINK_WARNINGS}* — @${senderNumber} No links allowed!\n` +
            `❌ Failed to kick (bot not admin)\n\n` +
            `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
          mentions: [senderJid],
        });
      }
    } else {
      await sock.sendMessage(groupJid, {
        text:
          `╔══════════════════════════╗\n` +
          `║   🚫 *NO LINKS ALLOWED*  ║\n` +
          `╚══════════════════════════╝\n\n` +
          `👤 *User:* @${senderNumber}\n` +
          `⚠️ *Warning:* ${newWarnings}/${MAX_ANTILINK_WARNINGS}\n` +
          `💢 *Action:* Message deleted ${deleted ? "✅" : "❌"}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ ${warningsLeft} more warning(s) and you'll be removed.\n\n` +
          `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
        mentions: [senderJid],
      });
      console.log(
        `⚠️ Warning ${newWarnings}/${MAX_ANTILINK_WARNINGS} sent to ${senderNumber}`,
      );
    }

    return true;
  } catch (error) {
    console.error("❌ Anti-link error:", error.message);
    return false;
  }
}

// ============================================================================
//  MAIN GROUP PARTICIPANT HANDLER
// ============================================================================
export async function handleGroupParticipant(update, sock) {
  const { id: groupJid, participants, action } = update;
  if (!groupJid || !participants || !Array.isArray(participants)) return;

  for (const participant of participants) {
    try {
      const participantJid = safeJid(participant);
      if (!participantJid) continue;

      if (action === "add") {
        await handleGroupJoin(groupJid, participantJid, sock);
      } else if (action === "remove") {
        await handleGroupLeave(groupJid, participantJid, sock);
      }
    } catch (err) {
      console.error("❌ Participant update error:", err.message);
    }
  }
}

// ============================================================================
//  HANDLE GROUP JOIN
// ============================================================================
async function handleGroupJoin(groupJid, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    const banKey = `${groupJid}_${participantJid}`;

    // Auto-kick banned users on rejoin
    if (bannedUsers.has(banKey)) {
      try {
        await sock.groupParticipantsUpdate(
          groupJid,
          [participantJid],
          "remove",
        );
        console.log("🚫 Auto-kicked banned user", participantJid);
      } catch (_) {}
      return;
    }

    if (settings.welcome) {
      await sendWelcomeMessage(groupJid, participantJid, sock, settings);
    }

    if (settings.voiceWelcome) {
      await sendVoiceWelcome(groupJid, participantJid, sock, settings);
    }
  } catch (err) {
    console.error("❌ Join handler error:", err.message);
  }
}

// ============================================================================
//  SEND WELCOME MESSAGE
// ============================================================================
async function sendWelcomeMessage(groupJid, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupJid, sock);
    } catch (_) {}

    const groupName = metadata?.subject || "the group";
    const userPhone = safePhone(participantJid);
    const memberCount = metadata?.participants?.length || 0;

    let welcomeText =
      settings.welcomeMessage ||
      `Welcome to *${groupName}*! 🎉\n\nHey @${userPhone}! Welcome to the group! You are member #${memberCount}.`;

    welcomeText = welcomeText
      .replace(/@user/gi, `@${userPhone}`)
      .replace(/@group/gi, groupName)
      .replace(/@count/gi, memberCount.toString())
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption =
      `👋 *Welcome to ${groupName}* 👋\n\n${welcomeText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    try {
      await sock.sendMessage(groupJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
        mentions: [participantJid],
      });
    } catch (_) {
      await sock.sendMessage(groupJid, {
        text: caption,
        mentions: [participantJid],
      });
    }

    console.log(`👋 Welcome sent to ${userPhone} in ${groupJid}`);
  } catch (err) {
    console.error("❌ Welcome message error:", err.message);
  }
}

// ============================================================================
//  SEND VOICE WELCOME (optional)
// ============================================================================
async function sendVoiceWelcome(groupJid, participantJid, sock, settings) {
  try {
    const gtts = await getGtts();
    if (!gtts) return;

    const userPhone = safePhone(participantJid);
    const speech = new gtts(
      `Welcome to the group, ${userPhone}! We are happy to have you here.`,
      "en",
    );
    const filePath = path.join(TEMP_DIR, `welcome_${Date.now()}.mp3`);

    await new Promise((resolve, reject) => {
      speech.save(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const audioBuffer = fs.readFileSync(filePath);
    await sock.sendMessage(groupJid, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: true,
      mentions: [participantJid],
    });

    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  } catch (err) {
    console.error("❌ Voice welcome error:", err.message);
  }
}

// ============================================================================
//  HANDLE GROUP LEAVE
// ============================================================================
async function handleGroupLeave(groupJid, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    if (settings.goodbye) {
      await sendGoodbyeMessage(groupJid, participantJid, sock, settings);
    }
  } catch (err) {
    console.error("❌ Leave handler error:", err.message);
  }
}

// ============================================================================
//  SEND GOODBYE MESSAGE
// ============================================================================
async function sendGoodbyeMessage(groupJid, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupJid, sock);
    } catch (_) {}

    const groupName = metadata?.subject || "the group";
    const userPhone = safePhone(participantJid);

    let goodbyeText =
      settings.goodbyeMessage ||
      `Goodbye, @${userPhone}! 👋\nWe'll miss you in *${groupName}*. Hope to see you again!`;

    goodbyeText = goodbyeText
      .replace(/@user/gi, `@${userPhone}`)
      .replace(/@group/gi, groupName)
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption =
      `👋 *Goodbye from ${groupName}* 👋\n\n${goodbyeText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    try {
      await sock.sendMessage(groupJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
        mentions: [participantJid],
      });
    } catch (_) {
      await sock.sendMessage(groupJid, {
        text: caption,
        mentions: [participantJid],
      });
    }

    console.log(`👋 Goodbye sent for ${userPhone} in ${groupJid}`);
  } catch (err) {
    console.error("❌ Goodbye message error:", err.message);
  }
}

// ============================================================================
//  BACKWARD-COMPAT WRAPPERS
// ============================================================================
export async function checkMessageViolation() {
  return false;
}

export async function handleRuleViolation(
  type,
  groupJid,
  senderJid,
  sock,
  message,
) {
  if (type === "link") return handleAntiLink(message, groupJid, sock);
  return false;
}

// ============================================================================
//  SETTINGS HELPERS
// ============================================================================
export async function setWelcome(groupJid, enabled, message = null) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.welcome = enabled;
    if (message) settings.welcomeMessage = message;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (_) {
    return false;
  }
}

export async function setGoodbye(groupJid, enabled, message = null) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.goodbye = enabled;
    if (message) settings.goodbyeMessage = message;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (_) {
    return false;
  }
}

export async function setAntiLink(groupJid, enabled) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.antilink = enabled;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (_) {
    return false;
  }
}

export async function setAntiSpam(groupJid, enabled) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.antispam = enabled;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (_) {
    return false;
  }
}

export function getGroupSettings(groupJid) {
  return groupSettings.get(groupJid) || {};
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  handleGroupParticipant,
  handleAntiLink,
  containsLink,
  isAllowedDomain,
  checkMessageViolation,
  handleRuleViolation,
  setWelcome,
  setGoodbye,
  setAntiLink,
  setAntiSpam,
  getGroupSettings,
};
