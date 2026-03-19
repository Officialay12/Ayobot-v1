// commands/group/moderation.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Moderation Module - FIXED with proper admin detection
//  Author: AYOCODES
//
//  Commands: ban, unban, listbanned, warn, warnings, clearwarns
// ════════════════════════════════════════════════════════════════════════════

import {
  bannedUsers,
  ENV,
  groupWarnings,
  saveBannedUsers,
  saveWarnings,
  isAdmin,
} from "../../index.js";

import {
  normalizeNum,
  isGroupAdminCached,
  isBotGroupAdminCached,
  getGroupMetadataCached,
  extractTargetUser,
  toJid,
} from "../../utils/validators.js";

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================

function fmt(emoji, title, body) {
  return `${emoji} *${title}*\n━━━━━━━━━━━━━━━━━━━━━\n${body}\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;
}

function phone(jid) {
  return normalizeNum(jid);
}

function warnBar(current, max) {
  const filled = Math.min(current, max);
  const empty = Math.max(0, max - filled);
  return "🟥".repeat(filled) + "⬜".repeat(empty);
}

// ============================================================================
//  BAN USER
// ============================================================================
export async function ban({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    // Check if user is admin
    const isUserAdmin = await isGroupAdminCached(from, userJid, sock, true);
    if (!isUserAdmin && !isAdmin(userJid)) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    // Check if bot is admin
    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to ban users.\nPlease promote me first!",
        ),
      });
    }

    // Get target user
    const target = extractTargetUser(args, message);
    if (!target) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "BAN",
          "📌 *Usage:* .ban @user [reason]\n" +
            "📌 Or reply to a user's message with .ban\n\n" +
            "Example: .ban @1234567890 Spamming",
        ),
      });
    }

    const targetJid = target.jid;
    const targetPhone = target.phone;

    // Cannot ban self
    if (targetJid === userJid) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "You cannot ban yourself."),
      });
    }

    // Cannot ban bot
    if (targetJid === sock.user?.id) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "You cannot ban me!"),
      });
    }

    // Check if target is admin
    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock, true);
    if (targetIsAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "Cannot ban a group admin. Demote them first.",
        ),
      });
    }

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";

    // Remove from group
    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "remove");
    } catch (kickError) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "KICK FAILED",
          `Could not remove user: ${kickError.message}`,
        ),
      });
    }

    // Add to banned list
    const banKey = `${from}_${targetJid}`;
    bannedUsers.set(banKey, {
      jid: targetJid,
      phone: targetPhone,
      bannedBy: userJid,
      bannedByPhone: phone(userJid),
      reason,
      time: Date.now(),
      group: from,
    });
    saveBannedUsers();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "USER BANNED",
        `🚫 *User:* @${targetPhone}\n` +
          `📝 *Reason:* ${reason}\n` +
          `👑 *By:* @${phone(userJid)}\n` +
          `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
          `_User has been removed and will be auto-kicked if they try to rejoin._`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Ban error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "BAN FAILED", error.message),
    });
  }
}

// ============================================================================
//  UNBAN USER
// ============================================================================
export async function unban({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    // Check if user is admin
    const isUserAdmin = await isGroupAdminCached(from, userJid, sock, true);
    if (!isUserAdmin && !isAdmin(userJid)) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "UNBAN",
          "📌 *Usage:* .unban <phone>\n" +
            "Example: .unban 2348123456789\n\n" +
            "💡 Use .listbanned to see banned users.",
        ),
      });
    }

    const targetPhone = args[0].replace(/[^0-9]/g, "");
    if (targetPhone.length < 7) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "INVALID NUMBER",
          "Provide a valid phone number.\nExample: .unban 2348123456789",
        ),
      });
    }

    // Find ban record
    let foundBan = null;
    let banKey = null;

    for (const [key, ban] of bannedUsers.entries()) {
      if (!key.startsWith(`${from}_`)) continue;

      const banPhone = String(ban.phone || "").replace(/[^0-9]/g, "");
      if (
        banPhone === targetPhone ||
        key === `${from}_${targetPhone}@s.whatsapp.net`
      ) {
        foundBan = ban;
        banKey = key;
        break;
      }
    }

    if (!foundBan) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "NOT BANNED",
          `+${targetPhone} is not banned in this group.\n\n` +
            `💡 Use .listbanned to see all bans.`,
        ),
      });
    }

    // Remove from banned list
    bannedUsers.delete(banKey);
    saveBannedUsers();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "USER UNBANNED",
        `✅ *User:* +${targetPhone}\n` +
          `📝 *Was banned for:* ${foundBan.reason}\n` +
          `📅 *Banned on:* ${new Date(foundBan.time).toLocaleString()}\n` +
          `👑 *Unbanned by:* @${phone(userJid)}\n\n` +
          `_They can now rejoin the group._`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    console.error("Unban error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "UNBAN FAILED", error.message),
    });
  }
}

// ============================================================================
//  LIST BANNED USERS
// ============================================================================
export async function listBanned({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const groupBans = [];
    for (const [key, ban] of bannedUsers.entries()) {
      if (key.startsWith(`${from}_`)) {
        groupBans.push(ban);
      }
    }

    if (!groupBans.length) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "BANNED USERS",
          "✅ No users are currently banned from this group.",
        ),
      });
    }

    // Sort by most recent first
    groupBans.sort((a, b) => b.time - a.time);

    let list = `╔══════════════════════════════════════╗\n`;
    list += `║   🚫 *BANNED USERS* (${groupBans.length})           ║\n`;
    list += `╚══════════════════════════════════════╝\n\n`;

    groupBans.forEach((ban, i) => {
      const banPhone = ban.phone || phone(ban.jid);
      const banDate = new Date(ban.time).toLocaleDateString();
      list += `${i + 1}. 👤 *+${banPhone}*\n`;
      list += `   📝 ${ban.reason}\n`;
      list += `   👑 By: +${ban.bannedByPhone || phone(ban.bannedBy)}\n`;
      list += `   📅 ${banDate}\n\n`;
    });

    list += `━━━━━━━━━━━━━━━━━━━━━\n`;
    list += `💡 Use .unban <phone> to unban someone\n`;
    list += `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text: list });
  } catch (error) {
    console.error("List banned error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not fetch banned users."),
    });
  }
}

// ============================================================================
//  WARN USER
// ============================================================================
export async function warn({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    // Check if user is admin
    const isUserAdmin = await isGroupAdminCached(from, userJid, sock, true);
    if (!isUserAdmin && !isAdmin(userJid)) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    // Get target user
    const target = extractTargetUser(args, message);
    if (!target) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "WARN",
          "📌 *Usage:* .warn @user [reason]\n" +
            "📌 Or reply to a user's message with .warn",
        ),
      });
    }

    const targetJid = target.jid;
    const targetPhone = target.phone;

    // Cannot warn self
    if (targetJid === userJid) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "You cannot warn yourself."),
      });
    }

    // Check if target is admin
    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock, true);
    if (targetIsAdmin) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "Cannot warn a group admin."),
      });
    }

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";
    const maxWarnings = parseInt(ENV.MAX_WARNINGS) || 3;

    // Get or create warning record
    const warnKey = `${from}_${targetJid}`;
    let warning = groupWarnings.get(warnKey) || {
      count: 0,
      reasons: [],
      firstWarn: Date.now(),
      lastWarn: Date.now(),
    };

    warning.count++;
    warning.reasons.push({
      reason,
      time: Date.now(),
      warnedBy: phone(userJid),
    });
    warning.lastWarn = Date.now();

    if (warning.count === 1) {
      warning.firstWarn = Date.now();
    }

    groupWarnings.set(warnKey, warning);
    saveWarnings();

    const remaining = Math.max(0, maxWarnings - warning.count);
    const warnLevel =
      warning.count === 1
        ? "⚠️ FIRST"
        : warning.count === 2
          ? "⚠️ SECOND"
          : warning.count >= maxWarnings
            ? "🚨 FINAL"
            : "⚠️ WARNING";

    let response = fmt(
      warning.count >= maxWarnings ? "🚨" : "⚠️",
      warnLevel,
      `👤 *User:* @${targetPhone}\n` +
        `📝 *Reason:* ${reason}\n\n` +
        `${warnBar(warning.count, maxWarnings)}\n` +
        `⚠️ *${warning.count}/${maxWarnings} warnings*` +
        (remaining > 0 ? ` — ${remaining} left before removal` : "") +
        `\n\n👑 *Warned by:* @${phone(userJid)}\n` +
        `⏰ *Time:* ${new Date().toLocaleTimeString()}`,
    );

    // Auto-kick if max warnings reached
    if (warning.count >= maxWarnings) {
      try {
        const botAdmin = await isBotGroupAdminCached(from, sock, true);
        if (botAdmin) {
          await sock.groupParticipantsUpdate(from, [targetJid], "remove");
          response += `\n\n━━━━━━━━━━━━━━━━━━━━━\n🚫 *AUTO-REMOVED* after ${maxWarnings} warnings.`;
          groupWarnings.delete(warnKey);
          saveWarnings();
        } else {
          response += `\n\n⚠️ *Could not auto-remove:* Bot needs admin rights.`;
        }
      } catch (kickError) {
        response += `\n\n⚠️ *Could not auto-remove:* ${kickError.message}`;
      }
    }

    await sock.sendMessage(from, {
      text: response,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Warn error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "WARN FAILED", error.message),
    });
  }
}

// ============================================================================
//  VIEW WARNINGS
// ============================================================================
export async function warnings({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    // Determine whose warnings to show
    let targetJid = userJid;
    let targetPhone = phone(userJid);

    if (args.length > 0) {
      const target = extractTargetUser(args, { message: {} });
      if (target) {
        targetJid = target.jid;
        targetPhone = target.phone;
      } else {
        // Try to parse as phone number
        const possiblePhone = args[0].replace(/[^0-9]/g, "");
        if (possiblePhone.length >= 7) {
          targetJid = `${possiblePhone}@s.whatsapp.net`;
          targetPhone = possiblePhone;
        }
      }
    }

    const maxWarnings = parseInt(ENV.MAX_WARNINGS) || 3;
    const warnKey = `${from}_${targetJid}`;
    const warning = groupWarnings.get(warnKey);

    if (!warning || warning.count === 0) {
      return sock.sendMessage(from, {
        text: `✅ *@${targetPhone}* has no active warnings.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
        mentions: [targetJid],
      });
    }

    let history = `╔══════════════════════════════════════╗\n`;
    history += `║        📋 *WARNING HISTORY*          ║\n`;
    history += `╚══════════════════════════════════════╝\n\n`;
    history += `👤 *User:* @${targetPhone}\n`;
    history += `${warnBar(warning.count, maxWarnings)}\n`;
    history += `📊 *${warning.count}/${maxWarnings} warnings*\n`;
    history += `📅 *First warn:* ${new Date(warning.firstWarn).toLocaleDateString()}\n`;
    history += `⏰ *Last warn:* ${new Date(warning.lastWarn).toLocaleString()}\n\n`;
    history += `📝 *History:*\n━━━━━━━━━━━━━━━━━━━━━\n`;

    warning.reasons.forEach((w, i) => {
      history += `${i + 1}. *${w.reason}*\n`;
      history += `   👑 By: +${w.warnedBy}\n`;
      history += `   ⏰ ${new Date(w.time).toLocaleString()}\n\n`;
    });

    history += `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text: history,
      mentions: [targetJid],
    });
  } catch (error) {
    console.error("Warnings error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not fetch warnings."),
    });
  }
}

// ============================================================================
//  CLEAR WARNINGS
// ============================================================================
export async function clearWarns({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    // Check if user is admin
    const isUserAdmin = await isGroupAdminCached(from, userJid, sock, true);
    if (!isUserAdmin && !isAdmin(userJid)) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    // If no args, clear all warnings in group
    if (!args.length) {
      let count = 0;
      for (const key of groupWarnings.keys()) {
        if (key.startsWith(`${from}_`)) {
          groupWarnings.delete(key);
          count++;
        }
      }
      saveWarnings();

      return sock.sendMessage(from, {
        text: fmt(
          "✅",
          "WARNINGS CLEARED",
          `✅ Cleared ${count} warning record${count !== 1 ? "s" : ""} from this group.`,
        ),
      });
    }

    // Clear warnings for specific user
    const target = extractTargetUser(args, { message: {} });
    if (!target) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "INVALID USER",
          "Provide a phone number or mention.\n" +
            "Example: .clearwarns 2348123456789",
        ),
      });
    }

    const targetJid = target.jid;
    const targetPhone = target.phone;
    const warnKey = `${from}_${targetJid}`;

    const hadWarnings = groupWarnings.has(warnKey);
    if (hadWarnings) {
      groupWarnings.delete(warnKey);
      saveWarnings();
    }

    await sock.sendMessage(from, {
      text: hadWarnings
        ? fmt(
            "✅",
            "WARNINGS CLEARED",
            `✅ All warnings cleared for +${targetPhone}\n` +
              `👑 *By:* @${phone(userJid)}`,
          )
        : fmt("ℹ️", "NO WARNINGS", `+${targetPhone} has no warnings to clear.`),
      mentions: hadWarnings ? [userJid] : [targetJid, userJid],
    });
  } catch (error) {
    console.error("Clear warns error:", error);
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not clear warnings."),
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  ban,
  unban,
  listBanned,
  warn,
  warnings,
  clearWarns,
};
