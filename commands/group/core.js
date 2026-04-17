// commands/group/core.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Core Commands — FULLY FIXED with TEMP ID support
//  Author: AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import {
  getGroupMetadataCached,
  normalizeNum,
  isBotGroupAdminCached,
  isGroupAdminCached,
} from "../../utils/validators.js";

import {
  formatError,
  formatInfo,
  formatSuccess,
} from "../../utils/formatters.js";

import { ENV } from "../../index.js";

// ============================================================================
//  HELPERS
// ============================================================================

function phone(jid) {
  if (!jid) return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

async function isUserAdmin(sock, groupJid, userJid, isAdminFlag = false) {
  if (isAdminFlag === true) return true;

  try {
    return await isGroupAdminCached(groupJid, userJid, sock);
  } catch (error) {
    console.error(`[core.js] Error checking admin:`, error.message);
    return false;
  }
}

async function isBotAdmin(sock, groupJid) {
  try {
    return await isBotGroupAdminCached(groupJid, sock, true);
  } catch (error) {
    console.error(`[core.js] Error checking bot admin:`, error.message);
    return false;
  }
}

function getTargetJid(message, args) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;

  if (ctx?.participant) return ctx.participant;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];

  if (args.length > 0) {
    const num = args[0].replace(/[^0-9]/g, "");
    if (num.length >= 10) return `${num}@s.whatsapp.net`;
  }

  return null;
}

// ============================================================================
//  KICK MEMBER
// ============================================================================
export async function kick({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "You need to be a group admin or bot owner to use this command."),
      });
    }

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN",
        "I need to be a *group admin* to kick members.\n\n" +
        "1. Open Group Info → Participants\n" +
        "2. Find the bot and tap 'Make Group Admin'\n" +
        `3. Run ${ENV.PREFIX}refreshadmin`),
      });
    }

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("KICK", "📌 *Usage:* .kick @user\n📌 Or reply to a user's message with .kick"),
      });
    }

    const targetNum = phone(targetJid);
    const userNum = phone(userJid);
    const botNum = phone(sock.user?.id);

    if (targetNum === userNum) {
      return sock.sendMessage(from, { text: "❌ You cannot kick yourself." });
    }
    if (targetNum === botNum) {
      return sock.sendMessage(from, { text: "❌ You cannot kick me!" });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "remove");

    await sock.sendMessage(from, {
      text: formatSuccess("✅ MEMBER KICKED", `👤 *User:* @${targetNum}\n👑 *By:* @${userNum}`),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Kick error:", error);
    await sock.sendMessage(from, {
      text: formatError("KICK FAILED", error.message),
    });
  }
}

// ============================================================================
//  ADD MEMBER
// ============================================================================
export async function add({ args, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command."),
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
      text: formatSuccess("✅ MEMBER ADDED", `👤 *User:* @${targetPhone}\n👑 *By:* @${phone(userJid)}`),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Add error:", error);
    await sock.sendMessage(from, {
      text: formatError("ADD FAILED", error.message),
    });
  }
}

// ============================================================================
//  PROMOTE TO ADMIN
// ============================================================================
export async function promote({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command."),
      });
    }

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN", "I need to be a *group admin* to promote members."),
      });
    }

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("PROMOTE", "📌 *Usage:* .promote @user\n📌 Or reply to a user's message with .promote"),
      });
    }

    const targetNum = phone(targetJid);
    const botNum = phone(sock.user?.id);

    if (targetNum === botNum) {
      return sock.sendMessage(from, { text: "❌ I cannot promote myself." });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "promote");

    await sock.sendMessage(from, {
      text: formatSuccess("⭐ USER PROMOTED", `👤 *User:* @${targetNum}\n👑 *By:* @${phone(userJid)}\n🎉 *New admin!*`),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Promote error:", error);
    await sock.sendMessage(from, {
      text: formatError("PROMOTE FAILED", error.message),
    });
  }
}

// ============================================================================
//  DEMOTE FROM ADMIN
// ============================================================================
export async function demote({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command."),
      });
    }

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("BOT NOT ADMIN", "I need to be a *group admin* to demote members."),
      });
    }

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("DEMOTE", "📌 *Usage:* .demote @user\n📌 Or reply to a user's message with .demote"),
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
      text: formatSuccess("⬇️ USER DEMOTED", `👤 *User:* @${targetNum}\n👑 *By:* @${userNum}`),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Demote error:", error);
    await sock.sendMessage(from, {
      text: formatError("DEMOTE FAILED", error.message),
    });
  }
}

// ============================================================================
//  LIST ADMINS
// ============================================================================
export async function admins({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group info." });
    }

    const adminList = metadata.participants.filter((p) => p.admin === "admin" || p.admin === "superadmin");

    if (adminList.length === 0) {
      return sock.sendMessage(from, { text: "👑 *No admins found*" });
    }

    let text =
      `╔══════════════════════════╗\n` +
      `║   👑 *GROUP ADMINS*      ║\n` +
      `╚══════════════════════════╝\n\n`;

    adminList.forEach((admin, i) => {
      const role = admin.admin === "superadmin" ? "👑 Owner" : "⭐ Admin";
      text += `${i + 1}. @${phone(admin.id)} — ${role}\n`;
    });

    text +=
      `\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 *Total:* ${adminList.length} admin${adminList.length !== 1 ? "s" : ""}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text,
      mentions: adminList.map((a) => a.id),
    });
  } catch (error) {
    console.error("Admins error:", error);
    await sock.sendMessage(from, { text: formatError("ERROR", error.message) });
  }
}

// ============================================================================
//  TAG ALL
// ============================================================================
export async function tagall({ args, fullArgs, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command."),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: "❌ Could not fetch group members.",
      });
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

    const output =
      `📢 *Announcement*\n\n` +
      `${messageText ? messageText + "\n\n" : ""}` +
      `${mentionText}\n` +
      `📣 By: @${phone(userJid)}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text: output, mentions });
  } catch (error) {
    console.error("Tagall error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not tag members."),
    });
  }
}

// ============================================================================
//  HIDE TAG
// ============================================================================
export async function hidetag({ fullArgs, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: "❌ This command only works in groups.",
      });
    }

    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!userIsAdmin) {
      return sock.sendMessage(from, {
        text: formatError("PERMISSION DENIED", "Only group admins or bot owner can use this command."),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: "❌ Could not fetch group members.",
      });
    }

    const mentions = metadata.participants.map((p) => p.id);
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
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not send hidden tag."),
    });
  }
}

// ============================================================================
//  TEST ADMIN — Diagnostic command
// ============================================================================
export async function testAdmin({ from, sock, userJid, isAdmin, isGroup }) {
  try {
    if (!isGroup) {
      return sock.sendMessage(from, {
        text: formatError("GROUP ONLY", "This command only works in groups."),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock, true);
    const userIsAdmin = await isUserAdmin(sock, from, userJid, isAdmin);
    const botIsGroupAdmin = await isBotAdmin(sock, from);
    const botNum = phone(sock.user?.id);
    const userNum = phone(userJid);
    const owner = metadata?.participants?.find((p) => p.admin === "superadmin");
    const ownerNum = owner ? phone(owner.id) : "Unknown";

    let text =
      `╔══════════════════════════╗\n` +
      `║     🔍 *ADMIN DIAGNOSTIC*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `*Bot Information*\n` +
      `- *Number:* +${botNum}\n` +
      `- *Admin:* ${botIsGroupAdmin ? "✅ YES" : "❌ NO"}\n\n` +
      `*Your Information*\n` +
      `- *Number:* +${userNum}\n` +
      `- *Group Admin:* ${userIsAdmin ? "✅ YES" : "❌ NO"}\n` +
      `- *Bot Owner:* ${isAdmin ? "✅ YES" : "❌ NO"}\n\n` +
      `*Group Information*\n` +
      `- *Name:* ${metadata?.subject || "Unknown"}\n` +
      `- *Members:* ${metadata?.participants?.length || 0}\n` +
      `- *Owner:* +${ownerNum}\n`;

    if (!botIsGroupAdmin) {
      text +=
        `\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *Fix Bot Admin:*\n` +
        `1. Open group info → Participants\n` +
        `2. Find +${botNum}\n` +
        `3. Tap "Make Group Admin"\n` +
        `4. Run ${ENV.PREFIX}refreshadmin\n`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n⚡ AYOBOT v1 | 👑 AYOCODES`;

    await sock.sendMessage(from, { text });
  } catch (error) {
    console.error("TestAdmin error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not run diagnostic: ${error.message}`),
    });
  }
}

// ============================================================================
//  REFRESH ADMIN CACHE
// ============================================================================
export async function refreshAdmin({ from, sock, isGroup }) {
  try {
    if (!isGroup) {
      return sock.sendMessage(from, {
        text: formatError("GROUP ONLY", "This command only works in groups."),
      });
    }

    await getGroupMetadataCached(from, sock, true);

    await sock.sendMessage(from, {
      text: formatSuccess("✅ ADMIN CACHE REFRESHED",
        "Admin status cache has been cleared.\n\n" +
        "If you recently made the bot a group admin,\n" +
        "the new status should now be detected.\n\n" +
        `Run ${ENV.PREFIX}testadmin to verify.`),
    });
  } catch (error) {
    console.error("RefreshAdmin error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not refresh cache: ${error.message}`),
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT
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
  refreshAdmin,
};
