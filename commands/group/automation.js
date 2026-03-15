// commands/group/automation.js - AYOBOT v1 | Created by AYOCODES

import {
  ENV,
  groupSettings,
  bannedUsers,
  groupWarnings,
  saveGroupSettings,
  saveBannedUsers,
  saveWarnings,
} from "../../index.js";

import {
  formatSuccess,
  formatError,
  formatInfo,
} from "../../utils/formatters.js";

import {
  containsLink,
  isSpam,
  getGroupMetadataCached,
} from "../../utils/validators.js";

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../../temp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ========== SAFE JID HELPERS ==========
// Baileys sometimes gives participant as object or string — handle both. — AYOCODES
function safeJid(participant) {
  if (!participant) return "";
  if (typeof participant === "string") return participant;
  if (typeof participant === "object") {
    return (
      participant.id ||
      participant.jid ||
      participant.participant ||
      String(participant)
    );
  }
  return String(participant);
}

function safePhone(participant) {
  const jid = safeJid(participant);
  return jid.split("@")[0].split(":")[0] || jid;
}

// Lazy gtts loader — missing package won't kill the module. — AYOCODES
let _gtts = null;
async function getGtts() {
  if (!_gtts) {
    try {
      const m = await import("gtts");
      _gtts = m.default || m;
    } catch (_) {}
  }
  return _gtts;
}

// ========== HANDLE GROUP PARTICIPANT UPDATES ==========
export async function handleGroupParticipant(update, sock) {
  const { id, participants, action } = update;
  if (!id || !participants || !Array.isArray(participants)) return;

  for (const participant of participants) {
    try {
      const participantJid = safeJid(participant);
      if (!participantJid) continue;
      if (action === "add") await handleGroupJoin(id, participantJid, sock);
      else if (action === "remove")
        await handleGroupLeave(id, participantJid, sock);
    } catch (error) {
      console.error("❌ Participant update error:", error.message);
    }
  }
}

// ========== HANDLE NEW MEMBER JOIN ==========
async function handleGroupJoin(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};

    // Auto-kick banned users. — AYOCODES
    const banKey = `${groupId}_${participantJid}`;
    if (bannedUsers.has(banKey)) {
      try {
        await sock.groupParticipantsUpdate(groupId, [participantJid], "remove");
        console.log(`🚫 Auto-kicked banned user ${participantJid}`);
      } catch (_) {}
      return;
    }

    // Welcome message — with image if set. — AYOCODES
    if (settings.welcome) {
      await sendWelcomeMessage(groupId, participantJid, sock, settings);
    }

    // Voice welcome (optional). — AYOCODES
    if (settings.voiceWelcome) {
      await sendVoiceWelcome(groupId, participantJid, sock, settings);
    }
  } catch (error) {
    console.error("❌ Join handler error:", error.message);
  }
}

// ========== SEND WELCOME MESSAGE ==========
// Always sends with the welcome image. Custom message is the caption. — AYOCODES
async function sendWelcomeMessage(groupId, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupId, sock);
    } catch (_) {}

    const groupName = metadata?.subject || "the group";
    const participant = safePhone(participantJid);
    const memberCount = metadata?.participants?.length || 0;

    // Build the message text — replace placeholders. — AYOCODES
    let welcomeText =
      settings.welcomeMessage ||
      `Welcome to *${groupName}*, @${participant}! 🎉\nYou are member #${memberCount}.`;

    welcomeText = welcomeText
      .replace(/@user/gi, `@${participant}`)
      .replace(/@group/gi, groupName)
      .replace(/@count/gi, memberCount.toString())
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption =
      `👋 *Welcome to ${groupName}!*\n\n` +
      `${welcomeText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    // Always try image first — fallback to text if URL fails. — AYOCODES
    try {
      await sock.sendMessage(groupId, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
        mentions: [participantJid],
      });
    } catch (_) {
      await sock.sendMessage(groupId, {
        text: caption,
        mentions: [participantJid],
      });
    }

    console.log(`👋 Welcome sent to ${participant} in ${groupId}`);
  } catch (error) {
    console.error("❌ Welcome message error:", error.message);
  }
}

// ========== SEND VOICE WELCOME ==========
async function sendVoiceWelcome(groupId, participantJid, sock, settings) {
  try {
    const Gtts = await getGtts();
    if (!Gtts) return; // gtts not installed — skip silently

    const participant = safePhone(participantJid);
    const text = `Welcome to the group, ${participant}! We are happy to have you here.`;
    const speech = new Gtts(text, "en");
    const outputFile = path.join(TEMP_DIR, `welcome_${Date.now()}.mp3`);

    await new Promise((resolve, reject) => {
      speech.save(outputFile, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const audioBuffer = fs.readFileSync(outputFile);
    await sock.sendMessage(groupId, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: true,
      mentions: [participantJid],
    });

    try {
      fs.unlinkSync(outputFile);
    } catch (_) {}
  } catch (error) {
    console.error("❌ Voice welcome error:", error.message);
  }
}

// ========== HANDLE MEMBER LEAVE / KICK ==========
async function handleGroupLeave(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};
    if (settings.goodbye) {
      await sendGoodbyeMessage(groupId, participantJid, sock, settings);
    }
  } catch (error) {
    console.error("❌ Leave handler error:", error.message);
  }
}

// ========== SEND GOODBYE MESSAGE ==========
// Sends with welcome image (serves as the group image banner). — AYOCODES
async function sendGoodbyeMessage(groupId, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupId, sock);
    } catch (_) {}

    const groupName = metadata?.subject || "the group";
    const participant = safePhone(participantJid);

    let goodbyeText =
      settings.goodbyeMessage ||
      `Goodbye, @${participant}! 👋\nWe'll miss you in *${groupName}*.`;

    goodbyeText = goodbyeText
      .replace(/@user/gi, `@${participant}`)
      .replace(/@group/gi, groupName)
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption =
      `👋 *Goodbye from ${groupName}!*\n\n` +
      `${goodbyeText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    // Try image first, fallback to text. — AYOCODES
    try {
      await sock.sendMessage(groupId, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption,
        mentions: [participantJid],
      });
    } catch (_) {
      await sock.sendMessage(groupId, {
        text: caption,
        mentions: [participantJid],
      });
    }

    console.log(`👋 Goodbye sent for ${participant} in ${groupId}`);
  } catch (error) {
    console.error("❌ Goodbye message error:", error.message);
  }
}

// ========== CHECK MESSAGE VIOLATIONS ==========
// Called from commandHandler for every group message. — AYOCODES
export async function checkMessageViolation(message, from, userJid, sock) {
  try {
    const settings = groupSettings.get(from) || {};
    const msgText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      "";

    if (!msgText) return false;

    if (settings.antilink && containsLink(msgText)) {
      await handleViolation("link", from, userJid, sock, message);
      return true;
    }

    if (settings.antispam && isSpam(userJid, msgText)) {
      await handleViolation("spam", from, userJid, sock, message);
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Violation check error:", error.message);
    return false;
  }
}

// ========== HANDLE RULE VIOLATIONS ==========
// Exported as handleRuleViolation so ruleHandler.js and commandHandler.js
// can import it directly. — AYOCODES
export async function handleRuleViolation(
  type,
  groupJid,
  userJid,
  sock,
  message,
) {
  return handleViolation(type, groupJid, userJid, sock, message);
}

async function handleViolation(type, groupJid, userJid, sock, message) {
  // Never punish the bot owner. — AYOCODES
  if (!userJid) return;
  const ownerPhone = ENV.ADMIN?.replace(/[^0-9]/g, "") || "";
  if (ownerPhone && userJid.includes(ownerPhone)) return;

  const warnings = {
    link: {
      title: "🔗 LINKS NOT ALLOWED",
      message: "No promotional links or URLs allowed in this group.",
    },
    spam: {
      title: "🚫 SPAM DETECTED",
      message: "Please do not spam. Slow down your message rate.",
    },
  };
  const warning = warnings[type] || {
    title: "⚠️ RULE VIOLATION",
    message: "Please follow the group rules.",
  };

  try {
    // Delete the violating message. — AYOCODES
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
    } catch (_) {}

    // Update warning count. — AYOCODES
    const key = `${groupJid}_${userJid}`;
    const warns = groupWarnings.get(key) || {
      count: 0,
      reasons: [],
      firstOffense: Date.now(),
      lastOffense: Date.now(),
    };
    warns.count++;
    warns.reasons.push({
      reason: type,
      time: Date.now(),
      message: (message.message?.conversation || "").substring(0, 100),
    });
    warns.lastOffense = Date.now();
    groupWarnings.set(key, warns);
    saveWarnings();

    const warningsLeft = ENV.MAX_WARNINGS - warns.count;
    const level =
      warns.count === 1
        ? "FIRST"
        : warns.count === 2
          ? "SECOND"
          : warns.count >= ENV.MAX_WARNINGS
            ? "FINAL"
            : "WARNING";

    await sock.sendMessage(groupJid, {
      text:
        `╔══════════════════════════╗\n` +
        `║  ⚠️ *${level} WARNING* ⚠️  ║\n` +
        `╚══════════════════════════╝\n\n` +
        `${warning.title}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${warning.message}\n\n` +
        `👤 *Offender:* @${safePhone(userJid)}\n` +
        `📊 *Violation:* ${type.toUpperCase()}\n` +
        `⚠️ *Warnings:* ${warns.count}/${ENV.MAX_WARNINGS}\n` +
        `⏳ *Remaining:* ${warningsLeft}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ *AYOBOT Security* | 👑 AYOCODES`,
      mentions: [userJid],
    });

    // Auto-kick on max warnings. — AYOCODES
    if (warns.count >= ENV.MAX_WARNINGS) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");
        await sock.sendMessage(groupJid, {
          text:
            `╔══════════════════════════╗\n` +
            `║   🚫 *USER REMOVED* 🚫   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `@${safePhone(userJid)} has been removed after ${ENV.MAX_WARNINGS} violations.\n\n` +
            `⚡ *AYOBOT Security* | 👑 AYOCODES`,
          mentions: [userJid],
        });
        groupWarnings.delete(key);
        saveWarnings();
      } catch (kickError) {
        console.error("❌ Auto-kick failed:", kickError.message);
      }
    }
  } catch (error) {
    console.error("❌ Violation handling failed:", error.message);
  }
}

// ========== SETTINGS HELPERS ==========
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

export default {
  handleGroupParticipant,
  checkMessageViolation,
  handleRuleViolation,
  setWelcome,
  setGoodbye,
  setAntiLink,
  setAntiSpam,
  getGroupSettings,
};
