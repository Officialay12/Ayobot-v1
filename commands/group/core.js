// commands/group/core.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Core Commands — COMPLETE FIXED VERSION
//  Author: AYOCODES
//
//  FIXES APPLIED:
//  1. Bot owner bypass works correctly (isAdmin flag)
//  2. Proper JID normalization for comparison
//  3. Debug logging to see what's being compared
//  4. Fixed admin detection for both user and bot
// ════════════════════════════════════════════════════════════════════════════

import {
  isBotGroupAdminCached,
  getGroupMetadataCached,
  normalizeNum,
} from "../../utils/validators.js";
import { formatError, formatInfo, formatSuccess } from "../../utils/formatters.js";

// ============================================================================
//  HELPERS — AYOCODES
// ============================================================================

// Strips @domain AND :N device suffix — returns pure phone number
function phone(jid) {
  if (!jid) return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// Enhanced normalize function with debugging
function normalizeJid(jid) {
  if (!jid) return "";
  const cleaned = String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
  return cleaned;
}

// ============================================================================
//  IS USER ADMIN — COMPLETELY FIXED
//  If isAdmin flag = true → bot owner → return true immediately
//  Otherwise check participant list with proper normalization
// ============================================================================
async function isUserAdmin(sock, groupJid, userJid, isAdminFlag = false) {
  // FIX 1: Bot owner bypass — AYOCODES
  if (isAdminFlag === true) {
    console.log(`[core.js] Bot owner bypass: isAdminFlag = true`);
    return true;
  }

  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    if (!metadata || !metadata.participants) {
      console.log(`[core.js] No metadata or participants found`);
      return false;
    }

    const userNum = normalizeJid(userJid);
    console.log(`[core.js] Checking admin for user: ${userNum}`);

    // Find the participant
    const participant = metadata.participants.find(p => {
      const pNum = normalizeJid(p.id);
      const isMatch = pNum === userNum;
      if (isMatch) {
        console.log(`[core.js] Found participant: ${pNum}, admin: ${p.admin}`);
      }
      return isMatch;
    });

    if (!participant) {
      console.log(`[core.js] User ${userNum} not found in participants`);
      return false;
    }

    const isAdmin = participant.admin === "admin" || participant.admin === "superadmin";
    console.log(`[core.js] User ${userNum} is admin: ${isAdmin}`);
    return isAdmin;

  } catch (error) {
    console.error(`[core.js] Error checking admin:`, error.message);
    return false;
  }
}

// ============================================================================
//  IS BOT ADMIN — Helper with caching
// ============================================================================
async function isBotAdmin(sock, groupJid) {
  try {
    const metadata = await getGroupMetadataCached(groupJid, sock);
    if (!metadata || !metadata.participants) return false;

    const botNum = normalizeJid(sock.user?.id);
    const botParticipant = metadata.participants.find(p => normalizeJid(p.id) === botNum);

    return botParticipant && (botParticipant.admin === "admin" || botParticipant.admin === "superadmin");
  } catch (error) {
    console.error(`[core.js] Error checking bot admin:`, error.message);
    return false;
  }
}

// ============================================================================
//  GET TARGET JID — Helper to extract mentioned/replied user
// ============================================================================
function getTargetJid(message, args) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;

  // Check if replying to a message
  if (ctx?.participant) {
    return ctx.participant;
  }

  // Check if mentioned
  if (ctx?.mentionedJid?.length) {
    return ctx.mentionedJid[0];
  }

  // Check if phone number provided
  if (args.length > 0) {
    const num = args[0].replace(/[^0-9]/g, "");
    if (num.length >= 10) {
      return `${num}@s.whatsapp.net`;
    }
  }

  return null;
}

// ============================================================================
//  KICK MEMBER — AYOCODES
// ============================================================================
export async function kick({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    // Check if user is admin or bot owner
    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED",
          "You need to be a group admin or bot owner to use this command.\n\n" +
          "Run .testadmin to check your admin status.")
      });
    }

    // Check if bot is admin (for actual kicking)
    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN",
          "I need to be a *group admin* to kick members.\n\n" +
          "Please make me a group admin:\n" +
          "1. Group Info → Participants\n" +
          "2. Find +${phone(sock.user?.id)}\n" +
          "3. Tap 'Make Group Admin'\n" +
          "4. Run .refreshadmin")
      });
    }

    // Get target user
    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("KICK",
          "📌 *Usage:* .kick @user\n" +
          "📌 Or reply to a user's message with .kick\n\n" +
          "Example: .kick @1234567890"),
      });
    }

    const targetNum = phone(targetJid);
    const userNum = phone(userJid);
    const botNum = phone(sock.user?.id);

    // Prevent self-kick
    if (targetNum === userNum) {
      return sock.sendMessage(from, { text: "❌ You cannot kick yourself." });
    }

    // Prevent bot kick
    if (targetNum === botNum) {
      return sock.sendMessage(from, { text: "❌ You cannot kick me!" });
    }

    // Perform kick
    await sock.groupParticipantsUpdate(from, [targetJid], "remove");

    await sock.sendMessage(from, {
      text: formatSuccess("✅ MEMBER KICKED",
        `👤 *User:* @${targetNum}\n` +
        `👑 *By:* @${userNum}`),
      mentions: [targetJid, userJid],
    });

  } catch (error) {
    console.error("Kick error:", error);
    await sock.sendMessage(from, { text: formatError("KICK FAILED", error.message) });
  }
}

// ============================================================================
//  ADD MEMBER — AYOCODES
// ============================================================================
export async function add({ args, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command.")
      });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatInfo("ADD", "📌 *Usage:* .add <phone>\nExample: .add 2348123456789"),
      });
    }

    const targetPhone = args[0].replace(/[^0-9]/g, "");
    if (!targetPhone || targetPhone.length < 10) {
      return sock.sendMessage(from, {
        text: "❌ Please provide a valid phone number (min 10 digits).",
      });
    }

    const targetJid = `${targetPhone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(from, [targetJid], "add");

    await sock.sendMessage(from, {
      text: formatSuccess("✅ MEMBER ADDED",
        `👤 *User:* @${targetPhone}\n` +
        `👑 *By:* @${phone(userJid)}`),
      mentions: [targetJid, userJid],
    });

  } catch (error) {
    console.error("Add error:", error);
    await sock.sendMessage(from, { text: formatError("ADD FAILED", error.message) });
  }
}

// ============================================================================
//  PROMOTE TO ADMIN — AYOCODES
// ============================================================================
export async function promote({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command.")
      });
    }

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN",
          "I need to be a *group admin* to promote members.\n\n" +
          "Please make me a group admin first!")
      });
    }

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("PROMOTE",
          "📌 *Usage:* .promote @user\n" +
          "📌 Or reply to a user's message with .promote"),
      });
    }

    const targetNum = phone(targetJid);
    const botNum = phone(sock.user?.id);

    if (targetNum === botNum) {
      return sock.sendMessage(from, { text: "❌ I cannot promote myself." });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "promote");

    await sock.sendMessage(from, {
      text: formatSuccess("⭐ USER PROMOTED",
        `👤 *User:* @${targetNum}\n` +
        `👑 *By:* @${phone(userJid)}\n` +
        `🎉 *New admin!*`),
      mentions: [targetJid, userJid],
    });

  } catch (error) {
    console.error("Promote error:", error);
    await sock.sendMessage(from, { text: formatError("PROMOTE FAILED", error.message) });
  }
}

// ============================================================================
//  DEMOTE FROM ADMIN — AYOCODES
// ============================================================================
export async function demote({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command.")
      });
    }

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN",
          "I need to be a *group admin* to demote members.\n\n" +
          "Please make me a group admin first!")
      });
    }

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("DEMOTE",
          "📌 *Usage:* .demote @user\n" +
          "📌 Or reply to a user's message with .demote"),
      });
    }

    const targetNum = phone(targetJid);
    const userNum = phone(userJid);
    const botNum = phone(sock.user?.id);

    if (targetNum === botNum) {
      return sock.sendMessage(from, { text: "❌ I cannot demote myself." });
    }

    if (targetNum === userNum && !isAdmin) {
      return sock.sendMessage(from, { text: "❌ You cannot demote yourself." });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "demote");

    await sock.sendMessage(from, {
      text: formatSuccess("⬇️ USER DEMOTED",
        `👤 *User:* @${targetNum}\n` +
        `👑 *By:* @${userNum}`),
      mentions: [targetJid, userJid],
    });

  } catch (error) {
    console.error("Demote error:", error);
    await sock.sendMessage(from, { text: formatError("DEMOTE FAILED", error.message) });
  }
}

// ============================================================================
//  LIST ADMINS — AYOCODES
// ============================================================================
export async function admins({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group info." });
    }

    const adminList = metadata.participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin",
    );

    if (adminList.length === 0) {
      return sock.sendMessage(from, { text: "👑 *No admins found* (this is unusual)" });
    }

    let text = `╔══════════════════════════╗\n║   👑 *GROUP ADMINS*      ║\n╚══════════════════════════╝\n\n`;

    adminList.forEach((admin, i) => {
      const role = admin.admin === "superadmin" ? "👑 Owner" : "⭐ Admin";
      text += `${i + 1}. @${phone(admin.id)} — ${role}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n👥 *Total:* ${adminList.length} admin${adminList.length !== 1 ? "s" : ""}\n⚡ *AYOBOT v1* | 👑 *AYOCODES*`;

    await sock.sendMessage(from, { text, mentions: adminList.map((a) => a.id) });

  } catch (error) {
    console.error("Admins error:", error);
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ============================================================================
//  TAG ALL — AYOCODES
// ============================================================================
export async function tagall({ args, fullArgs, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command.")
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group members." });
    }

    const participants = metadata.participants;
    let mentions = [];
    let mentionText = "";
    const sub = args[0]?.toLowerCase();

    if (sub === "admins") {
      mentions = participants.filter((p) => p.admin).map((p) => p.id);
      mentionText = `👑 *Admins tagged:* ${mentions.length}`;
    } else if (sub === "members") {
      mentions = participants.filter((p) => !p.admin).map((p) => p.id);
      mentionText = `👥 *Members tagged:* ${mentions.length}`;
    } else {
      mentions = participants.map((p) => p.id);
      mentionText = `👥 *Everyone tagged:* ${mentions.length}`;
    }

    if (mentions.length === 0) {
      return sock.sendMessage(from, { text: "❌ No matching members found." });
    }

    const messageText = sub ? args.slice(1).join(" ") : fullArgs;

    // Handle quoted message
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage && ctx?.stanzaId) {
      try {
        await sock.sendMessage(from, {
          forward: {
            key: {
              remoteJid: from,
              fromMe: phone(ctx.participant) === phone(sock.user?.id),
              id: ctx.stanzaId,
              participant: ctx.participant,
            },
            message: ctx.quotedMessage,
          },
          mentions,
        });
      } catch (_) {}
    }

    const output = `📢 *Announcement*\n\n${messageText ? messageText + "\n\n" : ""}${mentionText}\n📣 By: @${phone(userJid)}\n⚡ *AYOBOT v1* | 👑 *AYOCODES*`;

    await sock.sendMessage(from, { text: output, mentions });

  } catch (error) {
    console.error("Tagall error:", error);
    await sock.sendMessage(from, { text: formatError("ERROR", "Could not tag members.") });
  }
}

// ============================================================================
//  HIDE TAG — AYOCODES
// ============================================================================
export async function hidetag({ fullArgs, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command.")
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group members." });
    }

    const mentions = metadata.participants.map((p) => p.id);

    // Handle quoted message
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage && ctx?.stanzaId) {
      try {
        await sock.sendMessage(from, {
          forward: {
            key: {
              remoteJid: from,
              fromMe: phone(ctx.participant) === phone(sock.user?.id),
              id: ctx.stanzaId,
              participant: ctx.participant,
            },
            message: ctx.quotedMessage,
          },
          mentions,
        });
      } catch (_) {}
    }

    await sock.sendMessage(from, {
      text: fullArgs || "​",
      mentions,
    });

  } catch (error) {
    console.error("Hidetag error:", error);
    await sock.sendMessage(from, { text: formatError("ERROR", "Could not send hidden tag.") });
  }
}

// ============================================================================
//  TEST ADMIN — Diagnostic command
// ============================================================================
export async function testAdmin({ from, sock, userJid, isAdmin, isGroup }) {
  try {
    if (!isGroup) {
      return sock.sendMessage(from, { text: formatError("GROUP ONLY", "This command only works in groups.") });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    const userIsGroupAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    const botIsGroupAdmin = await isBotAdmin(sock, from);

    const botNum = phone(sock.user?.id);
    const userNum = phone(userJid);

    // Find group owner
    const owner = metadata?.participants?.find(p => p.admin === "superadmin");
    const ownerNum = owner ? phone(owner.id) : "Unknown";

    let text = `╔══════════════════════════╗\n║     🔍 *ADMIN DIAGNOSTIC*   ║\n╚══════════════════════════╝\n\n`;

    text += `*Bot Information*\n`;
    text += `- *Number:* +${botNum}\n`;
    text += `- *Admin:* ${botIsGroupAdmin ? "✅ YES" : "❌ NO"}\n\n`;

    text += `*Your Information*\n`;
    text += `- *Number:* +${userNum}\n`;
    text += `- *Group Admin:* ${userIsGroupAdmin ? "✅ YES" : "❌ NO"}\n`;
    text += `- *Bot Owner:* ${isAdmin ? "✅ YES" : "❌ NO"}\n\n`;

    text += `*Group Information*\n`;
    text += `- *Name:* ${metadata?.subject || "Unknown"}\n`;
    text += `- *Members:* ${metadata?.participants?.length || 0}\n`;
    text += `- *Owner:* +${ownerNum}\n`;

    if (!botIsGroupAdmin && userIsGroupAdmin) {
      text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `⚠️ *Fix Bot Admin:*\n`;
      text += `You are a group admin, but the bot is not.\n\n`;
      text += `To fix:\n`;
      text += `1. In WhatsApp, open group info\n`;
      text += `2. Tap "Participants"\n`;
      text += `3. Find +${botNum}\n`;
      text += `4. Tap "Make Group Admin"\n`;
      text += `5. Run .refreshadmin\n`;
    } else if (!userIsGroupAdmin && isAdmin) {
      text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `⚠️ *You are not a group admin*\n`;
      text += `You are the bot owner, but your number (+${userNum})\n`;
      text += `is not a group admin. Make yourself admin first.\n`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n⚡ AYOBOT v1 | 👑 AYOCODES`;

    await sock.sendMessage(from, { text });

  } catch (error) {
    console.error("TestAdmin error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not run diagnostic: ${error.message}`)
    });
  }
}

// ============================================================================
//  REFRESH ADMIN CACHE
// ============================================================================
export async function refreshAdmin({ from, sock, userJid, isAdmin, isGroup }) {
  try {
    if (!isGroup) {
      return sock.sendMessage(from, { text: formatError("GROUP ONLY", "This command only works in groups.") });
    }

    // Clear cache by fetching fresh metadata
    await getGroupMetadataCached(from, sock, true); // force refresh

    await sock.sendMessage(from, {
      text: formatSuccess("✅ ADMIN CACHE REFRESHED",
        "Admin status cache has been cleared.\n\n" +
        "If you recently made yourself or the bot a group admin,\n" +
        "the new status should now be detected.\n\n" +
        "Run .testadmin to verify.")
    });

  } catch (error) {
    console.error("RefreshAdmin error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not refresh cache: ${error.message}`)
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT — AYOCODES
// ============================================================================
export default {
  kick,
  add,
  promote,
  demote,
  admins,
  tagall,
  hidetag,
  testAdmin,
  refreshAdmin
};
