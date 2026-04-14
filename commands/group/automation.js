// commands/group/automation.js — AYOBOT v1.0.0
// Group Automation Module — COMPLETE FIXED VERSION
// Author: AYOCODES

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
  isBotGroupAdminCached,
} from "../../utils/validators.js";
import { fmt, warnBar } from "../../utils/formatters.js";
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

// ============================================================================
// PHONE NORMALIZATION HELPER
// ============================================================================

function safePhone(jid) {
  return normalizeNum(jid);
}

// ============================================================================
// LINK DETECTION PATTERNS
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
  /goo\.gl\/[a-zA-Z0-9_-]+/gi,
  /tiny\.cc\/[a-zA-Z0-9_-]+/gi,
  /cutt\.ly\/[a-zA-Z0-9_-]+/gi,
  /rebrand\.ly\/[a-zA-Z0-9_-]+/gi,
  /shorturl\.at\/[a-zA-Z0-9_-]+/gi,
  /t\.co\/[a-zA-Z0-9_-]+/gi,
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
];

const MAX_ANTILINK_WARNINGS = 3;

// ============================================================================
// LINK DETECTION
// ============================================================================

export function containsLink(text) {
  if (!text || typeof text !== "string") return false;

  for (const pattern of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }

  const words = text.split(/\s+/);
  for (const word of words) {
    if (
      word.includes(".") &&
      !word.includes(" ") &&
      word.length > 4 &&
      word.length < 100 &&
      word.match(/\.[a-zA-Z]{2,}([\/\?]|$)/)
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// ALLOWED DOMAINS (empty by default)
// ============================================================================

const ALLOWED_DOMAINS = [];

export function isAllowedDomain(text) {
  if (!ALLOWED_DOMAINS.length) return false;
  try {
    const urlMatch =
      text.match(/https?:\/\/([^\s\/]+)/i) ||
      text.match(/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    if (!urlMatch) return false;
    const domain = urlMatch[1].toLowerCase().replace(/^www\./, "");
    return ALLOWED_DOMAINS.some(
      (allowed) => domain === allowed || domain.endsWith("." + allowed),
    );
  } catch (_) {
    return false;
  }
}

// ============================================================================
// IS USER ADMIN (PHONE-BASED)
// ============================================================================

async function isUserAdmin(sock, groupJid, userJid, ownerPhone = "") {
  // Global admin (bot owner) always passes
  const userPhone = safePhone(userJid);
  const ownerPhoneNorm = safePhone(ownerPhone);
  const globalAdmin = safePhone(ENV.ADMIN || "");

  if (ownerPhoneNorm && userPhone === ownerPhoneNorm) return true;
  if (globalAdmin && userPhone === globalAdmin) return true;

  try {
    const groupMetadata = await getGroupMetadataCached(groupJid, sock);
    if (!groupMetadata?.participants) return false;

    const participant = groupMetadata.participants.find(
      (p) => safePhone(p.id) === userPhone,
    );

    return (
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin")
    );
  } catch (error) {
    console.error("[automation] isUserAdmin error:", error.message);
    return false;
  }
}

// ============================================================================
// MAIN ANTILINK HANDLER
// ============================================================================

export async function handleAntiLink(message, groupJid, sock, ownerPhone = "") {
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

    const rawSender = message.key?.participant || groupJid;
    const senderPhone = safePhone(rawSender);
    const senderJid = `${senderPhone}@s.whatsapp.net`;

    const admin = await isUserAdmin(sock, groupJid, senderJid, ownerPhone);
    if (admin) {
      console.log(`👑 Admin/Owner ${senderPhone} posted link — allowed`);
      return false;
    }

    if (isAllowedDomain(text)) {
      console.log(`✅ Allowed domain from ${senderPhone}`);
      return false;
    }

    console.log(`🚫 Link detected from ${senderPhone} in ${groupJid}`);

    // Delete the message
    let deleted = false;
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
      deleted = true;
      console.log("✅ Message deleted");
    } catch (deleteError) {
      console.log(`⚠️ Could not delete: ${deleteError.message}`);
    }

    // Track warnings
    const warnKey = `${groupJid}:${senderJid}`;
    const userWarn = groupWarnings.get(warnKey) || 0;
    const newWarn = userWarn + 1;
    groupWarnings.set(warnKey, newWarn);
    saveWarnings();

    const warningsLeft = MAX_ANTILINK_WARNINGS - newWarn;

    if (newWarn >= MAX_ANTILINK_WARNINGS) {
      try {
        const botIsAdmin = await isBotGroupAdminCached(groupJid, sock);
        if (botIsAdmin) {
          await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
          await sock.sendMessage(groupJid, {
            text: fmt(
              "🚫",
              "AUTO-REMOVED",
              `@${senderPhone} has been removed for posting links after ${MAX_ANTILINK_WARNINGS} warnings.\n\n⚠️ Links are strictly prohibited in this group.`,
            ),
            mentions: [senderJid],
          });
          groupWarnings.delete(warnKey);
          saveWarnings();
          console.log(
            `👢 User ${senderPhone} kicked after ${MAX_ANTILINK_WARNINGS} warnings`,
          );
        } else {
          await sock.sendMessage(groupJid, {
            text: fmt(
              "⚠️",
              "WARNING LIMIT REACHED",
              `@${senderPhone} has reached ${MAX_ANTILINK_WARNINGS} warnings but I cannot remove them (not admin).`,
            ),
            mentions: [senderJid],
          });
        }
      } catch (kickError) {
        await sock.sendMessage(groupJid, {
          text: fmt(
            "⚠️",
            "WARNING LIMIT REACHED",
            `@${senderPhone} has reached ${MAX_ANTILINK_WARNINGS} warnings but removal failed: ${kickError.message}`,
          ),
          mentions: [senderJid],
        });
      }
    } else {
      await sock.sendMessage(groupJid, {
        text: fmt(
          "🚫",
          "NO LINKS ALLOWED",
          `👤 User: @${senderPhone}\n⚠️ Warning: ${newWarn}/${MAX_ANTILINK_WARNINGS}\n💢 Action: Message deleted ${deleted ? "✅" : "❌"}\n\n${warnBar(newWarn, MAX_ANTILINK_WARNINGS)}\n\n⚠️ ${warningsLeft} more warning(s) before removal.`,
        ),
        mentions: [senderJid],
      });
      console.log(
        `⚠️ Warning ${newWarn}/${MAX_ANTILINK_WARNINGS} sent to ${senderPhone}`,
      );
    }

    return true;
  } catch (error) {
    console.error("❌ Anti-link error:", error.message);
    return false;
  }
}

// ============================================================================
// GROUP PARTICIPANT HANDLER
// ============================================================================

export async function handleGroupParticipant(update, sock) {
  const { id: groupJid, participants, action } = update;
  if (!groupJid || !participants || !Array.isArray(participants)) return;

  for (const participant of participants) {
    try {
      const participantJid =
        typeof participant === "string"
          ? participant
          : participant.id || participant;
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
// GROUP JOIN
// ============================================================================

async function handleGroupJoin(groupJid, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    const participantPhone = safePhone(participantJid);
    const banKey = `${groupJid}_${participantJid}`;

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
      await sendVoiceWelcome(groupJid, participantJid, sock);
    }
  } catch (err) {
    console.error("❌ Join handler error:", err.message);
  }
}

// ============================================================================
// SEND WELCOME MESSAGE
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

    const caption = fmt(
      "👋",
      `WELCOME TO ${groupName.toUpperCase()}`,
      welcomeText,
    );

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
// VOICE WELCOME
// ============================================================================

async function sendVoiceWelcome(groupJid, participantJid, sock) {
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
// GROUP LEAVE
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
// SEND GOODBYE MESSAGE
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
      `Goodbye, @${userPhone}! 👋\nWe'll miss you in *${groupName}*.`;

    goodbyeText = goodbyeText
      .replace(/@user/gi, `@${userPhone}`)
      .replace(/@group/gi, groupName)
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption = fmt(
      "👋",
      `GOODBYE FROM ${groupName.toUpperCase()}`,
      goodbyeText,
    );

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
// SETTINGS HELPERS
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
// BACKWARD-COMPAT WRAPPERS
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
  ownerPhone = "",
) {
  if (type === "link")
    return handleAntiLink(message, groupJid, sock, ownerPhone);
  return false;
}

// ============================================================================
// DEFAULT EXPORT
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
