// commands/group/moderation.js - FIXED + COMPLETE
import {
  bannedUsers,
  ENV,
  groupMetadataCache,
  groupWarnings,
  saveBannedUsers,
  saveWarnings,
} from "../../index.js";
import {
  formatGroupError,
  formatGroupInfo,
  formatGroupSuccess,
} from "../../utils/formatters.js";
import {
  clearAdminCache,
  extractTargetUser,
  isGroupAdminCached,
  validateGroupCommand,
} from "../../utils/validators.js";

// ========== SAFE HELPERS ==========
function safePhone(jid) {
  if (!jid) return "unknown";
  if (typeof jid === "object") jid = jid.id || jid.jid || String(jid);
  return String(jid).split("@")[0] || String(jid);
}

function safeJid(participant) {
  if (!participant) return "";
  if (typeof participant === "string") return participant;
  if (typeof participant === "object")
    return (
      participant.id ||
      participant.jid ||
      participant.participant ||
      String(participant)
    );
  return String(participant);
}

// ========== BAN MEMBER ==========
export async function ban({ args, message, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(
      from,
      userJid,
      sock,
      "botAdmin",
    );
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    const target = extractTargetUser(args, message);
    if (!target) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "BAN",
          "Usage: .ban @user [reason]\nExample: .ban @user Spamming",
        ),
      });
    }

    const targetJid = safeJid(target.jid || target);
    const targetPhone = safePhone(targetJid);

    // Don't ban self
    if (targetJid === sock.user?.id) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT BAN BOT", "I cannot ban myself."),
      });
    }

    // Don't ban admins
    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock);
    if (targetIsAdmin) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT BAN ADMIN", "Cannot ban a group admin."),
      });
    }

    // Don't ban the bot owner
    if (targetJid === `${ENV.ADMIN}@s.whatsapp.net`) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT BAN ADMIN", "Cannot ban the bot owner."),
      });
    }

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";

    // Kick from group
    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "remove");
    } catch (kickErr) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "KICK FAILED",
          `Could not remove user: ${kickErr.message}`,
        ),
      });
    }

    // Record ban
    const banKey = `${from}_${targetJid}`;
    bannedUsers.set(banKey, {
      jid: targetJid,
      phone: targetPhone,
      bannedBy: userJid,
      reason,
      time: Date.now(),
      group: from,
    });
    saveBannedUsers();

    clearAdminCache(from, targetJid);
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "BANNED",
        `🚫 *User:* @${targetPhone}\n` +
          `📝 *Reason:* ${reason}\n` +
          `👑 *By:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Ban error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("BAN FAILED", error.message),
    });
  }
}

// ========== UNBAN MEMBER ==========
export async function unban({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "UNBAN",
          "Usage: .unban <phone>\nExample: .unban 2348123456789",
        ),
      });
    }

    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length < 10) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "INVALID NUMBER",
          "Please provide a valid phone number.",
        ),
      });
    }

    const targetJid = `${phone}@s.whatsapp.net`;
    const banKey = `${from}_${targetJid}`;
    const banRecord = bannedUsers.get(banKey);

    if (!banRecord) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "NOT BANNED",
          `@${phone} is not banned in this group.`,
        ),
        mentions: [targetJid],
      });
    }

    bannedUsers.delete(banKey);
    saveBannedUsers();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "UNBANNED",
        `✅ *User:* @${phone}\n` +
          `📝 *Was banned for:* ${banRecord.reason}\n` +
          `👑 *Unbanned by:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Unban error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("UNBAN FAILED", error.message),
    });
  }
}

// ========== LIST BANNED ==========
export async function listBanned({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    const groupBans = [];
    for (const [key, value] of bannedUsers.entries()) {
      if (key.startsWith(`${from}_`)) groupBans.push(value);
    }

    if (!groupBans.length) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "BANNED USERS",
          "No users are currently banned from this group.",
        ),
      });
    }

    let banList = `📋 *Banned Users (${groupBans.length})*\n\n`;
    groupBans.forEach((ban, i) => {
      const date = new Date(ban.time).toLocaleString();
      banList +=
        `${i + 1}. 👤 @${ban.phone || safePhone(ban.jid)}\n` +
        `   📝 *Reason:* ${ban.reason}\n` +
        `   👑 *By:* @${safePhone(ban.bannedBy)}\n` +
        `   ⏰ *Date:* ${date}\n\n`;
    });

    const mentions = [
      ...groupBans.map((b) => b.jid).filter(Boolean),
      ...groupBans.map((b) => b.bannedBy).filter(Boolean),
    ];

    await sock.sendMessage(from, {
      text: formatGroupSuccess("BAN LIST", banList),
      mentions,
    });
  } catch (error) {
    console.error("List banned error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not fetch banned users."),
    });
  }
}

// ========== WARN MEMBER ==========
export async function warn({ args, message, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    const target = extractTargetUser(args, message);
    if (!target) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "WARN",
          "Usage: .warn @user [reason]\nExample: .warn @user Spamming",
        ),
      });
    }

    const targetJid = safeJid(target.jid || target);
    const targetPhone = target.phone || safePhone(targetJid);

    // Don't warn admin/owner
    if (targetJid === `${ENV.ADMIN}@s.whatsapp.net`) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT WARN", "Cannot warn the bot owner."),
      });
    }

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";

    const warnKey = `${from}_${targetJid}`;
    const warns = groupWarnings.get(warnKey) || {
      count: 0,
      reasons: [],
      firstWarn: Date.now(),
      lastWarn: Date.now(),
    };

    warns.count++;
    warns.reasons.push({ reason, time: Date.now(), warnedBy: userJid });
    warns.lastWarn = Date.now();
    groupWarnings.set(warnKey, warns);
    saveWarnings();

    const warningsLeft = Math.max(0, ENV.MAX_WARNINGS - warns.count);
    const warningLevel =
      warns.count === 1
        ? "FIRST"
        : warns.count === 2
          ? "SECOND"
          : warns.count >= ENV.MAX_WARNINGS
            ? "FINAL"
            : "WARNING";

    let warnMsg =
      `⚠️ *${warningLevel} WARNING*\n\n` +
      `👤 *User:* @${targetPhone}\n` +
      `📝 *Reason:* ${reason}\n` +
      `⚠️ *Warnings:* ${warns.count}/${ENV.MAX_WARNINGS}\n` +
      `⏳ *Remaining:* ${warningsLeft}\n` +
      `👑 *By:* @${safePhone(userJid)}`;

    // Auto-kick on max warnings
    if (warns.count >= ENV.MAX_WARNINGS) {
      try {
        await sock.groupParticipantsUpdate(from, [targetJid], "remove");
        warnMsg += `\n\n🚫 *Auto-removed for reaching ${ENV.MAX_WARNINGS} warnings.*`;
        groupWarnings.delete(warnKey);
        saveWarnings();
        clearAdminCache(from, targetJid);
      } catch (_) {
        warnMsg += `\n\n⚠️ *Could not auto-remove user.*`;
      }
    }

    await sock.sendMessage(from, {
      text: formatGroupSuccess("WARNING ISSUED", warnMsg),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Warn error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("WARN FAILED", error.message),
    });
  }
}

// ========== VIEW WARNINGS ==========
export async function warnings({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    let targetJid = userJid;
    let targetPhone = safePhone(userJid);

    if (args.length > 0) {
      // Support @mention or plain number
      const raw = args[0].replace(/[^0-9]/g, "");
      if (raw.length >= 10) {
        targetJid = `${raw}@s.whatsapp.net`;
        targetPhone = raw;
      }
    }

    const warnKey = `${from}_${targetJid}`;
    const warns = groupWarnings.get(warnKey);

    if (!warns || warns.count === 0) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "WARNINGS",
          `✅ @${targetPhone} has no warnings.`,
        ),
        mentions: [targetJid],
      });
    }

    let warnText =
      `👤 *User:* @${targetPhone}\n` +
      `📊 *Total:* ${warns.count}/${ENV.MAX_WARNINGS}\n` +
      `📅 *First:* ${new Date(warns.firstWarn).toLocaleDateString()}\n` +
      `⏰ *Last:* ${new Date(warns.lastWarn).toLocaleString()}\n\n` +
      `📝 *History:*\n`;

    warns.reasons.forEach((w, i) => {
      warnText +=
        `${i + 1}. *${w.reason}*\n` +
        `   ⏰ ${new Date(w.time).toLocaleString()}\n` +
        `   👑 By: @${safePhone(w.warnedBy)}\n\n`;
    });

    const mentions = [
      targetJid,
      ...warns.reasons.map((w) => w.warnedBy).filter(Boolean),
    ];

    await sock.sendMessage(from, {
      text: formatGroupSuccess("WARNING HISTORY", warnText),
      mentions,
    });
  } catch (error) {
    console.error("Warnings error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not fetch warnings."),
    });
  }
}

// ========== CLEAR WARNINGS ==========
export async function clearWarns({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    let targetJid = userJid;
    let targetPhone = safePhone(userJid);

    if (args.length > 0) {
      const raw = args[0].replace(/[^0-9]/g, "");
      if (raw.length >= 10) {
        targetJid = `${raw}@s.whatsapp.net`;
        targetPhone = raw;
      }
    }

    const warnKey = `${from}_${targetJid}`;
    const hadWarnings = groupWarnings.has(warnKey);
    groupWarnings.delete(warnKey);
    if (hadWarnings) saveWarnings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        hadWarnings ? "WARNINGS CLEARED" : "NO WARNINGS",
        hadWarnings
          ? `✅ All warnings cleared for @${targetPhone}`
          : `ℹ️ @${targetPhone} had no warnings to clear`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Clear warns error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not clear warnings."),
    });
  }
}
