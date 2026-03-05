// commands/group/automation.js - FIXED + COMPLETE
import {
  ENV,
  groupSettings,
  bannedUsers,
  groupWarnings,
  groupMetadataCache,
  adminCache,
} from "../../index.js";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatGroupSuccess,
} from "../../utils/formatters.js";
import {
  getGroupMetadataCached,
  isGroupAdminCached,
  containsLink,
  isSpam,
} from "../../utils/validators.js";
import {
  saveGroupSettings,
  saveBannedUsers,
  saveWarnings,
} from "../../utils/database.js";
import gtts from "gtts";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ========== SAFE JID HELPER ==========
// Fixes: "participantJid.split is not a function"
// Baileys sometimes sends participant as object, string, or array item
function safeJid(participant) {
  if (!participant) return "";
  // Already a plain string
  if (typeof participant === "string") return participant;
  // Object with id field (Baileys participant object)
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
  return jid.split("@")[0] || jid;
}

// ========== HANDLE GROUP PARTICIPANT UPDATES ==========
export async function handleGroupParticipant(update, sock) {
  const { id, participants, action } = update;

  if (!id || !participants || !Array.isArray(participants)) return;

  for (const participant of participants) {
    try {
      const participantJid = safeJid(participant);
      if (!participantJid) continue;

      if (action === "add") {
        await handleGroupJoin(id, participantJid, sock);
      } else if (action === "remove") {
        await handleGroupLeave(id, participantJid, sock);
      }
    } catch (error) {
      console.error("❌ Participant update error:", error.message);
    }
  }
}

// ========== HANDLE NEW MEMBER JOIN ==========
async function handleGroupJoin(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};

    // Auto-kick banned users
    const banKey = `${groupId}_${participantJid}`;
    if (bannedUsers.has(banKey)) {
      try {
        await sock.groupParticipantsUpdate(groupId, [participantJid], "remove");
        console.log(`🚫 Auto-kicked banned user ${participantJid}`);
      } catch (_) {}
      return;
    }

    // Welcome message
    if (settings.welcome) {
      await sendWelcomeMessage(groupId, participantJid, sock, settings);
    }

    // Voice welcome
    if (settings.voiceWelcome) {
      await sendVoiceWelcome(groupId, participantJid, sock, settings);
    }

    // Notify admin (only if ADMIN is set)
    if (ENV.ADMIN) {
      try {
        const adminJid = `${ENV.ADMIN}@s.whatsapp.net`;
        await sock.sendMessage(adminJid, {
          text:
            `👋 *New Member Joined*\n\n` +
            `👤 @${safePhone(participantJid)}\n` +
            `👥 Group: ${groupId}`,
          mentions: [participantJid],
        });
      } catch (_) {}
    }
  } catch (error) {
    console.error("❌ Join handler error:", error.message);
  }
}

// ========== SEND WELCOME MESSAGE ==========
async function sendWelcomeMessage(groupId, participantJid, sock, settings) {
  try {
    const metadata = await getGroupMetadataCached(groupId, sock);
    if (!metadata) return;

    const groupName = metadata.subject || "the group";
    const participant = safePhone(participantJid);
    const memberCount = metadata.participants?.length || 0;

    let welcomeMsg = settings.welcomeMessage || "Welcome @user to @group! 🎉";

    welcomeMsg = welcomeMsg
      .replace(/@user/g, `@${participant}`)
      .replace(/@group/g, groupName)
      .replace(/@count/g, memberCount.toString())
      .replace(/@time/g, new Date().toLocaleTimeString())
      .replace(/@date/g, new Date().toLocaleDateString());

    // Try with image first, fallback to text
    try {
      await sock.sendMessage(groupId, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: `👋 *Welcome to ${groupName}!*\n\n${welcomeMsg}`,
        mentions: [participantJid],
      });
    } catch (_) {
      await sock.sendMessage(groupId, {
        text: `👋 *Welcome to ${groupName}!*\n\n${welcomeMsg}`,
        mentions: [participantJid],
      });
    }

    console.log(`👋 Welcome sent to ${participant}`);
  } catch (error) {
    console.error("❌ Welcome message error:", error.message);
  }
}

// ========== SEND VOICE WELCOME ==========
async function sendVoiceWelcome(groupId, participantJid, sock, settings) {
  try {
    const participant = safePhone(participantJid);
    const text = `Welcome to the group, ${participant}! We're happy to have you here.`;
    const speech = new gtts(text, "en");
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

// ========== HANDLE MEMBER LEAVE ==========
async function handleGroupLeave(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};

    // Goodbye message
    if (settings.goodbye) {
      await sendGoodbyeMessage(groupId, participantJid, sock, settings);
    }

    // Notify admin (only if ADMIN is set)
    if (ENV.ADMIN) {
      try {
        const adminJid = `${ENV.ADMIN}@s.whatsapp.net`;
        await sock.sendMessage(adminJid, {
          text:
            `👋 *Member Left*\n\n` +
            `👤 @${safePhone(participantJid)}\n` +
            `👥 Group: ${groupId}`,
          mentions: [participantJid],
        });
      } catch (_) {}
    }
  } catch (error) {
    console.error("❌ Goodbye error:", error.message);
  }
}

// ========== SEND GOODBYE MESSAGE ==========
async function sendGoodbyeMessage(groupId, participantJid, sock, settings) {
  try {
    const metadata = await getGroupMetadataCached(groupId, sock);
    if (!metadata) return;

    const groupName = metadata.subject || "the group";
    const participant = safePhone(participantJid);

    let goodbyeMsg =
      settings.goodbyeMessage || "Goodbye @user 👋 We'll miss you!";
    goodbyeMsg = goodbyeMsg
      .replace(/@user/g, `@${participant}`)
      .replace(/@group/g, groupName)
      .replace(/@time/g, new Date().toLocaleTimeString())
      .replace(/@date/g, new Date().toLocaleDateString());

    await sock.sendMessage(groupId, {
      text: `👋 *Goodbye!*\n\n${goodbyeMsg}`,
      mentions: [participantJid],
    });

    console.log(`👋 Goodbye sent for ${participant}`);
  } catch (error) {
    console.error("❌ Goodbye message error:", error.message);
  }
}

// ========== CHECK MESSAGE VIOLATIONS ==========
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

    // Anti-link
    if (settings.antilink && containsLink(msgText)) {
      await handleViolation("link", from, userJid, sock, message);
      return true;
    }

    // Anti-spam
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

// ========== HANDLE VIOLATIONS ==========
async function handleViolation(type, groupJid, userJid, sock, message) {
  // Never punish admin
  if (!userJid || userJid === `${ENV.ADMIN}@s.whatsapp.net`) return;

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
    // Delete the violating message
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
    } catch (_) {}

    // Update warning count
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
    const warningLevel =
      warns.count === 1
        ? "FIRST"
        : warns.count === 2
          ? "SECOND"
          : warns.count >= ENV.MAX_WARNINGS - 1
            ? "FINAL"
            : "WARNING";

    await sock.sendMessage(groupJid, {
      text:
        `╔══════════════════════════╗\n` +
        `║  ⚠️ *${warningLevel} WARNING* ⚠️  ║\n` +
        `╚══════════════════════════╝\n\n` +
        `${warning.title}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${warning.message}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Offender:* @${safePhone(userJid)}\n` +
        `📊 *Violation:* ${type.toUpperCase()}\n` +
        `⚠️ *Warnings:* ${warns.count}/${ENV.MAX_WARNINGS}\n` +
        `⏳ *Remaining:* ${warningsLeft}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ *AYOBOT Security* | 👑 AYOCODES`,
      mentions: [userJid],
    });

    // Auto-kick on max warnings
    if (warns.count >= ENV.MAX_WARNINGS) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");

        await sock.sendMessage(groupJid, {
          text:
            `╔══════════════════════════╗\n` +
            `║   🚫 *USER REMOVED* 🚫   ║\n` +
            `╚══════════════════════════╝\n\n` +
            `@${safePhone(userJid)} has been removed.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 *Reason:* Reached ${ENV.MAX_WARNINGS} violations\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
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
  setWelcome,
  setGoodbye,
  setAntiLink,
  setAntiSpam,
  getGroupSettings,
};
