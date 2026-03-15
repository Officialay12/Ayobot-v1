// commands/group/moderation.js - AYOBOT v1 | Created by AYOCODES

import {
  bannedUsers,
  ENV,
  groupMetadataCache,
  groupWarnings,
  saveBannedUsers,
  saveWarnings,
} from "../../index.js";

// ========== SAFE HELPERS ==========
// Strip device suffix (:56 etc) so numbers display cleanly. — AYOCODES
function safePhone(jid) {
  if (!jid) return "unknown";
  if (typeof jid === "object") jid = jid.id || jid.jid || String(jid);
  // FIX: split on ":" BEFORE splitting on "@" to strip device suffix
  return String(jid).split("@")[0].split(":")[0] || String(jid);
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

// Build clean JID from phone string. — AYOCODES
function phoneToJid(phone) {
  const digits = String(phone).replace(/[^0-9]/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

// Normalize a JID or phone to plain digits only. — AYOCODES
function normalizeNum(jid) {
  if (!jid) return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// Extract target JID from args (mention or raw phone). — AYOCODES
function extractTarget(args, message) {
  // Check for mentioned JIDs in message context
  const mentioned =
    message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentioned.length > 0) {
    const jid = safeJid(mentioned[0]);
    return { jid, phone: safePhone(jid) };
  }

  // Check quoted message participant
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) {
    const jid = safeJid(quoted);
    return { jid, phone: safePhone(jid) };
  }

  // Raw phone number in args
  if (args[0]) {
    const phone = args[0].replace(/[^0-9]/g, "");
    if (phone.length >= 7) {
      return { jid: `${phone}@s.whatsapp.net`, phone };
    }
  }

  return null;
}

// Check if a JID is a group admin. — AYOCODES
// FIX: normalize both sides with normalizeNum() to strip :56 device suffix
async function isGroupAdmin(groupJid, userJid, sock) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const userNum = normalizeNum(userJid);
    const participant = meta.participants?.find(
      (p) => normalizeNum(p.id) === userNum,
    );
    return (
      participant?.admin === "admin" || participant?.admin === "superadmin"
    );
  } catch (_) {
    return false;
  }
}

// Check if bot is admin in group. — AYOCODES
// FIX: normalize bot JID the same way to strip :52 device suffix
async function isBotAdmin(groupJid, sock) {
  try {
    const botNum = normalizeNum(sock.user?.id || "");
    const meta = await sock.groupMetadata(groupJid);
    const bot = meta.participants?.find((p) => normalizeNum(p.id) === botNum);
    return bot?.admin === "admin" || bot?.admin === "superadmin";
  } catch (_) {
    return false;
  }
}

// Warn progress bar visual. — AYOCODES
function warnBar(count, max) {
  const filled = Math.min(count, max);
  const empty = Math.max(0, max - filled);
  return "🟥".repeat(filled) + "⬜".repeat(empty);
}

// Formatters — inline so we don't depend on formatters.js existing. — AYOCODES
function fmtSuccess(title, body) {
  return `╔══════════════════════════╗\n║  ✅ *${title}*\n╚══════════════════════════╝\n\n${body}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;
}
function fmtError(title, body) {
  return `╔══════════════════════════╗\n║  ❌ *${title}*\n╚══════════════════════════╝\n\n${body}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;
}
function fmtInfo(title, body) {
  return `╔══════════════════════════╗\n║  ℹ️ *${title}*\n╚══════════════════════════╝\n\n${body}\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;
}

// ========== BAN ==========
export async function ban({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    const botAdmin = await isBotAdmin(from, sock);
    if (!botAdmin)
      return sock.sendMessage(from, {
        text: fmtError(
          "BOT NOT ADMIN",
          "I need to be a group admin to ban users.",
        ),
      });

    const target = extractTarget(args, message);
    if (!target)
      return sock.sendMessage(from, {
        text: fmtInfo(
          "BAN",
          "Usage: .ban @user [reason]\nReply to a message or mention a user.",
        ),
      });

    const targetJid = target.jid;
    const targetPhone = target.phone;

    // Safety checks — can't ban bot or owner. — AYOCODES
    const botNum = normalizeNum(sock.user?.id || "");
    if (normalizeNum(targetJid) === botNum)
      return sock.sendMessage(from, {
        text: fmtError("CANNOT BAN", "I cannot ban myself."),
      });

    const ownerPhone = String(ENV.ADMIN || "").replace(/[^0-9]/g, "");
    if (ownerPhone && normalizeNum(targetJid) === ownerPhone)
      return sock.sendMessage(from, {
        text: fmtError("CANNOT BAN", "Cannot ban the bot owner."),
      });

    const targetAdmin = await isGroupAdmin(from, targetJid, sock);
    if (targetAdmin)
      return sock.sendMessage(from, {
        text: fmtError(
          "CANNOT BAN ADMIN",
          "Cannot ban a group admin. Demote them first.",
        ),
      });

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";

    // Kick from group first. — AYOCODES
    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "remove");
    } catch (e) {
      return sock.sendMessage(from, {
        text: fmtError("KICK FAILED", `Could not remove user: ${e.message}`),
      });
    }

    // Record ban. — AYOCODES
    const banKey = `${from}_${targetJid}`;
    bannedUsers.set(banKey, {
      jid: targetJid,
      phone: targetPhone,
      bannedBy: userJid,
      bannedByPhone: safePhone(userJid),
      reason,
      time: Date.now(),
      group: from,
    });
    saveBannedUsers();
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: fmtSuccess(
        "USER BANNED",
        `🚫 *User:* @${targetPhone}\n` +
          `📝 *Reason:* ${reason}\n` +
          `👑 *By:* @${safePhone(userJid)}\n` +
          `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
          `_User has been removed and will be auto-kicked if they try to rejoin._`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Ban error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("BAN FAILED", error.message),
    });
  }
}

// ========== UNBAN ==========
export async function unban({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    if (!args.length)
      return sock.sendMessage(from, {
        text: fmtInfo(
          "UNBAN",
          "Usage: .unban <phone>\n" +
            "Example: .unban 2348123456789\n\n" +
            "💡 Use .listbanned to see banned users.",
        ),
      });

    // Parse the phone number from args. — AYOCODES
    const raw = args[0].replace(/[^0-9]/g, "");
    if (raw.length < 7)
      return sock.sendMessage(from, {
        text: fmtError(
          "INVALID NUMBER",
          "Provide a valid phone number.\nExample: .unban 2348123456789",
        ),
      });

    const targetJid = `${raw}@s.whatsapp.net`;

    // Search ban records for this group. — AYOCODES
    let banRecord = null;
    let foundKey = null;

    for (const [key, record] of bannedUsers.entries()) {
      if (!key.startsWith(`${from}_`)) continue;
      const recPhone = String(record.phone || "").replace(/[^0-9]/g, "");
      const recJid = String(record.jid || "");
      if (
        recPhone === raw ||
        recJid === targetJid ||
        key === `${from}_${targetJid}`
      ) {
        banRecord = record;
        foundKey = key;
        break;
      }
    }

    if (!banRecord)
      return sock.sendMessage(from, {
        text: fmtInfo(
          "NOT BANNED",
          `+${raw} is not banned in this group.\n\n` +
            `💡 Use .listbanned to see all bans.`,
        ),
      });

    bannedUsers.delete(foundKey);
    saveBannedUsers();

    await sock.sendMessage(from, {
      text: fmtSuccess(
        "USER UNBANNED",
        `✅ *User:* +${raw}\n` +
          `📝 *Was banned for:* ${banRecord.reason}\n` +
          `📅 *Banned on:* ${new Date(banRecord.time).toLocaleString()}\n` +
          `👑 *Unbanned by:* @${safePhone(userJid)}\n\n` +
          `_They can now rejoin the group._`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    console.error("Unban error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("UNBAN FAILED", error.message),
    });
  }
}

// ========== LIST BANNED ==========
export async function listBanned({ from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    // Only collect bans for THIS group. — AYOCODES
    const groupBans = [];
    for (const [key, value] of bannedUsers.entries()) {
      if (key.startsWith(`${from}_`)) groupBans.push(value);
    }

    if (!groupBans.length)
      return sock.sendMessage(from, {
        text: fmtInfo(
          "BANNED USERS",
          "✅ No users are currently banned from this group.",
        ),
      });

    groupBans.sort((a, b) => b.time - a.time);

    let text =
      `╔══════════════════════════════════════╗\n` +
      `║   🚫 *BANNED USERS* (${groupBans.length})           ║\n` +
      `╚══════════════════════════════════════╝\n\n`;

    groupBans.forEach((ban, i) => {
      const phone = ban.phone || safePhone(ban.jid);
      const date = new Date(ban.time).toLocaleDateString();
      text +=
        `${i + 1}. 👤 *+${phone}*\n` +
        `   📝 ${ban.reason}\n` +
        `   👑 By: +${ban.bannedByPhone || safePhone(ban.bannedBy)}\n` +
        `   📅 ${date}\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 Use .unban <phone> to unban someone\n`;
    text += `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text });
  } catch (error) {
    console.error("List banned error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("ERROR", "Could not fetch banned users."),
    });
  }
}

// ========== WARN ==========
export async function warn({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    const target = extractTarget(args, message);
    if (!target)
      return sock.sendMessage(from, {
        text: fmtInfo(
          "WARN",
          "Usage: .warn @user [reason]\nReply to a message or mention a user.",
        ),
      });

    const targetJid = target.jid;
    const targetPhone = target.phone;

    // Safety checks. — AYOCODES
    const ownerPhone = String(ENV.ADMIN || "").replace(/[^0-9]/g, "");
    if (ownerPhone && normalizeNum(targetJid) === ownerPhone)
      return sock.sendMessage(from, {
        text: fmtError("CANNOT WARN", "Cannot warn the bot owner."),
      });

    const targetAdmin = await isGroupAdmin(from, targetJid, sock);
    if (targetAdmin)
      return sock.sendMessage(from, {
        text: fmtError("CANNOT WARN", "Cannot warn a group admin."),
      });

    const reason =
      args.length > 1 ? args.slice(1).join(" ") : "No reason provided";
    const max = parseInt(ENV.MAX_WARNINGS) || 3;

    const warnKey = `${from}_${targetJid}`;
    const warns = groupWarnings.get(warnKey) || {
      count: 0,
      reasons: [],
      firstWarn: Date.now(),
      lastWarn: Date.now(),
    };

    warns.count++;
    warns.reasons.push({
      reason,
      time: Date.now(),
      warnedBy: safePhone(userJid),
    });
    warns.lastWarn = Date.now();
    if (warns.count === 1) warns.firstWarn = Date.now();
    groupWarnings.set(warnKey, warns);
    saveWarnings();

    const warnsLeft = Math.max(0, max - warns.count);
    const level =
      warns.count === 1
        ? "⚠️ FIRST"
        : warns.count === 2
          ? "⚠️ SECOND"
          : warns.count >= max
            ? "🚨 FINAL"
            : "⚠️ WARNING";
    const bar = warnBar(warns.count, max);

    let warnMsg =
      `╔══════════════════════════╗\n` +
      `║  ${level} WARNING  ║\n` +
      `╚══════════════════════════╝\n\n` +
      `👤 *User:* @${targetPhone}\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `${bar}\n` +
      `⚠️ *${warns.count}/${max} warnings*${warnsLeft > 0 ? ` — ${warnsLeft} left before removal` : ""}\n\n` +
      `👑 *Warned by:* @${safePhone(userJid)}\n` +
      `⏰ *Time:* ${new Date().toLocaleTimeString()}`;

    // Auto-kick at max. — AYOCODES
    if (warns.count >= max) {
      try {
        await sock.groupParticipantsUpdate(from, [targetJid], "remove");
        warnMsg +=
          `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `🚫 *AUTO-REMOVED* after ${max} warnings.`;
        groupWarnings.delete(warnKey);
        saveWarnings();
      } catch (kickErr) {
        warnMsg += `\n\n⚠️ *Could not auto-remove:* Bot needs admin rights.`;
      }
    }

    warnMsg += `\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text: warnMsg,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Warn error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("WARN FAILED", error.message),
    });
  }
}

// ========== VIEW WARNINGS ==========
export async function warnings({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    // Default: check the caller's own warnings. Allow checking others by mention/phone. — AYOCODES
    let targetJid = userJid;
    let targetPhone = safePhone(userJid);

    const mentioned = args[0] ? args[0].match(/@?(\d{7,15})/) : null;
    if (mentioned) {
      targetPhone = mentioned[1];
      targetJid = `${targetPhone}@s.whatsapp.net`;
    }

    const max = parseInt(ENV.MAX_WARNINGS) || 3;
    const warnKey = `${from}_${targetJid}`;
    const warns = groupWarnings.get(warnKey);

    if (!warns || warns.count === 0)
      return sock.sendMessage(from, {
        text: `✅ *@${targetPhone}* has no active warnings.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
        mentions: [targetJid],
      });

    const bar = warnBar(warns.count, max);

    let text =
      `╔══════════════════════════════════════╗\n` +
      `║        📋 *WARNING HISTORY*          ║\n` +
      `╚══════════════════════════════════════╝\n\n` +
      `👤 *User:* @${targetPhone}\n` +
      `${bar}\n` +
      `📊 *${warns.count}/${max} warnings*\n` +
      `📅 *First warn:* ${new Date(warns.firstWarn).toLocaleDateString()}\n` +
      `⏰ *Last warn:* ${new Date(warns.lastWarn).toLocaleString()}\n\n` +
      `📝 *History:*\n━━━━━━━━━━━━━━━━━━━━━\n`;

    warns.reasons.forEach((w, i) => {
      text +=
        `${i + 1}. *${w.reason}*\n` +
        `   👑 By: +${w.warnedBy}\n` +
        `   ⏰ ${new Date(w.time).toLocaleString()}\n\n`;
    });

    text += `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text, mentions: [targetJid] });
  } catch (error) {
    console.error("Warnings error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("ERROR", "Could not fetch warnings."),
    });
  }
}

// ========== CLEAR WARNINGS ==========
export async function clearWarns({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: fmtError("GROUP ONLY", "This command only works in groups."),
      });

    // No args = clear ALL warnings for THIS GROUP ONLY. — AYOCODES
    if (!args.length) {
      let cleared = 0;
      for (const key of [...groupWarnings.keys()]) {
        if (key.startsWith(`${from}_`)) {
          groupWarnings.delete(key);
          cleared++;
        }
      }
      saveWarnings();
      return sock.sendMessage(from, {
        text: fmtSuccess(
          "WARNINGS CLEARED",
          `✅ Cleared ${cleared} warning record${cleared !== 1 ? "s" : ""} from this group.`,
        ),
      });
    }

    // Clear for specific user. — AYOCODES
    const mentioned = args[0].match(/@?(\d{7,15})/);
    if (!mentioned)
      return sock.sendMessage(from, {
        text: fmtError(
          "INVALID USER",
          "Provide a phone number or mention.\nExample: .clearwarns 2348123456789",
        ),
      });

    const targetPhone = mentioned[1];
    const targetJid = `${targetPhone}@s.whatsapp.net`;
    const warnKey = `${from}_${targetJid}`;
    const had = groupWarnings.has(warnKey);

    if (had) {
      groupWarnings.delete(warnKey);
      saveWarnings();
    }

    await sock.sendMessage(from, {
      text: had
        ? fmtSuccess(
            "WARNINGS CLEARED",
            `✅ All warnings cleared for +${targetPhone}\n👑 *By:* @${safePhone(userJid)}`,
          )
        : fmtInfo("NO WARNINGS", `+${targetPhone} has no warnings to clear.`),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Clear warns error:", error.message);
    await sock.sendMessage(from, {
      text: fmtError("ERROR", "Could not clear warnings."),
    });
  }
}

// ========== DEFAULT EXPORT ==========
export default { ban, unban, listBanned, warn, warnings, clearWarns };
