// handlers/groupHandler.js - AYOBOT v1 | Created by AYOCODES

import { ENV, groupSettings, isAdmin as isBotAdmin } from "../index.js";
import { createLogger } from "../utils/logger.js";
import * as db from "../utils/database.js";

// groupSettings is imported directly from index.js so that
// .setwelcome / .setgoodbye (commands/group/settings.js) write to the
// exact same Map that this handler reads from. One source of truth. — AYOCODES

const logger = createLogger("group-handler");

const groupWarnings = new Map();
const commandCooldowns = new Map();
const userActivity = new Map();
const mutedGroups = new Map();
const bannedUsers = new Map();

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatSuccess(title, content) {
  return `✅ *${title}*\n\n${content}\n\n⚡ AYOBOT v1 | 👑 AYOCODES`;
}
function formatError(title, content) {
  return `❌ *${title}*\n\n${content}\n\n⚡ AYOBOT v1 | 👑 AYOCODES`;
}
function formatInfo(title, content) {
  return `📌 *${title}*\n\n${content}\n\n⚡ AYOBOT v1 | 👑 AYOCODES`;
}
function formatData(title, data) {
  let out = `📊 *${title}*\n\n`;
  for (const [k, v] of Object.entries(data)) out += `● ${k}: ${v}\n`;
  return out + `\n⚡ AYOBOT v1 | 👑 AYOCODES`;
}

// ─── Name resolution ──────────────────────────────────────────────────────────

async function resolveUserName(sock, jid, pushName) {
  if (pushName && pushName.trim() && pushName !== "undefined")
    return pushName.trim();
  try {
    const c = (sock.store?.contacts || {})[jid];
    if (c?.name?.trim()) return c.name.trim();
    if (c?.notify?.trim()) return c.notify.trim();
    if (c?.verifiedName?.trim()) return c.verifiedName.trim();
    const result = await Promise.race([
      sock.onWhatsApp(jid),
      new Promise((_, rej) => setTimeout(() => rej(new Error("t/o")), 3000)),
    ]).catch(() => null);
    if (Array.isArray(result) && result[0]?.notify)
      return result[0].notify.trim();
  } catch (_) {}
  return formatPhoneNumber(jid.replace(/@s\.whatsapp\.net|@c\.us/g, ""));
}

async function resolveGroupName(sock, groupJid) {
  try {
    const cached =
      sock.store?.groupMetadata?.[groupJid] ||
      sock.store?.chats?.get?.(groupJid);
    if (cached?.subject?.trim()) return cached.subject.trim();
    const meta = await Promise.race([
      sock.groupMetadata(groupJid),
      new Promise((_, rej) => setTimeout(() => rej(new Error("t/o")), 4000)),
    ]).catch(() => null);
    if (meta?.subject?.trim()) return meta.subject.trim();
  } catch (_) {}
  return "the group";
}

function formatPhoneNumber(raw) {
  const d = raw.replace(/\D/g, "");
  if (!d) return raw;
  const ccLen = d.startsWith("1") ? 1 : 3;
  const cc = "+" + d.slice(0, ccLen);
  const rest = d
    .slice(ccLen)
    .replace(/(\d{3})(?=\d)/g, "$1 ")
    .trim();
  return `${cc} ${rest}`;
}

// ─── Settings — shared Map from index.js ─────────────────────────────────────

function getDefaultSettings() {
  return {
    welcome: true,
    goodbye: true,
    antilink: false,
    antispam: false,
    rules: "",
    welcomeMessage: "",
    goodbyeMessage: "",
  };
}

async function getGroupSettings(groupJid) {
  let s = groupSettings.get(groupJid);
  if (!s) {
    try {
      s = (await db.getGroupSettings?.(groupJid)) || getDefaultSettings();
    } catch (_) {
      s = getDefaultSettings();
    }
    groupSettings.set(groupJid, s);
  }
  return s;
}

async function getGroupSetting(groupJid, key) {
  const s = await getGroupSettings(groupJid);
  return s[key] !== undefined ? s[key] : getDefaultSettings()[key];
}

async function setGroupSetting(groupJid, key, value) {
  const s = await getGroupSettings(groupJid);
  s[key] = value;
  groupSettings.set(groupJid, s);
  try {
    await db.saveGroupSettings?.(groupJid, s);
  } catch (_) {}
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function initializeGroupHandler() {
  try {
    const settings = await db.getAllGroupSettings?.();
    if (Array.isArray(settings)) {
      for (const s of settings) {
        if (s?.groupJid) groupSettings.set(s.groupJid, s);
      }
    }
    const warnings = await db.getAllWarnings?.();
    if (Array.isArray(warnings)) {
      for (const w of warnings) {
        if (w?.groupJid && w?.userJid)
          groupWarnings.set(`${w.groupJid}_${w.userJid}`, w);
      }
    }
    logger.info(
      `Group handler init: ${groupSettings.size} groups, ${groupWarnings.size} warnings`,
    );
  } catch (e) {
    logger.error("initializeGroupHandler:", e);
  }
}

// ─── Admin check ──────────────────────────────────────────────────────────────

export async function isGroupAdmin(groupJid, userJid, sock) {
  try {
    if (isBotAdmin(userJid)) return true;
    const meta = await sock.groupMetadata(groupJid);
    const p = meta.participants.find((p) => p.id === userJid);
    return p && (p.admin === "admin" || p.admin === "superadmin");
  } catch (_) {
    return false;
  }
}

// ─── WELCOME ──────────────────────────────────────────────────────────────────
// Image priority: ENV.WELCOME_IMAGE_URL → participant profile pic → text only

export async function handleGroupWelcome(
  participantJid,
  groupJid,
  sock,
  pushName,
) {
  try {
    const settings = await getGroupSettings(groupJid);
    if (settings.welcome === false) return;

    const [userName, groupName] = await Promise.all([
      resolveUserName(sock, participantJid, pushName),
      resolveGroupName(sock, groupJid),
    ]);

    let memberLine = "";
    try {
      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      if (meta?.participants?.length)
        memberLine = `\n👥 Members: ${meta.participants.length}`;
    } catch (_) {}

    // Use custom message if set via .setwelcome, else default
    let caption;
    if (settings.welcomeMessage?.trim()) {
      caption = settings.welcomeMessage
        .replace(/@user/gi, userName)
        .replace(/@group/gi, groupName)
        .replace(/@mention/gi, `@${participantJid.split("@")[0]}`);
    } else {
      caption =
        `👋 *Welcome, ${userName}!*\n\n` +
        `You just joined *${groupName}*.\n` +
        `We're glad to have you here! 🎉` +
        memberLine;
    }

    // 1. Try the configured welcome banner image
    if (ENV.WELCOME_IMAGE_URL) {
      try {
        await sock.sendMessage(groupJid, {
          image: { url: ENV.WELCOME_IMAGE_URL },
          caption,
          mentions: [participantJid],
        });
        logger.info(`Welcome (banner) → ${userName} in ${groupName}`);
        return;
      } catch (e) {
        logger.warn(`Welcome banner failed: ${e.message}`);
      }
    }

    // 2. Try participant's own profile picture
    let ppUrl = null;
    try {
      ppUrl = await Promise.race([
        sock.profilePictureUrl(participantJid, "image"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("t/o")), 3000)),
      ]);
    } catch (_) {}

    if (ppUrl) {
      try {
        await sock.sendMessage(groupJid, {
          image: { url: ppUrl },
          caption,
          mentions: [participantJid],
        });
        logger.info(`Welcome (pp) → ${userName} in ${groupName}`);
        return;
      } catch (_) {}
    }

    // 3. Plain text
    await sock.sendMessage(groupJid, {
      text: caption,
      mentions: [participantJid],
    });
    logger.info(`Welcome (text) → ${userName} in ${groupName}`);
  } catch (e) {
    logger.error("handleGroupWelcome:", e.message);
  }
}

// ─── GOODBYE ─────────────────────────────────────────────────────────────────

export async function handleGroupGoodbye(
  participantJid,
  groupJid,
  sock,
  pushName,
) {
  try {
    const settings = await getGroupSettings(groupJid);
    if (settings.goodbye === false) return;

    const [userName, groupName] = await Promise.all([
      resolveUserName(sock, participantJid, pushName),
      resolveGroupName(sock, groupJid),
    ]);

    let text;
    if (settings.goodbyeMessage?.trim()) {
      text = settings.goodbyeMessage
        .replace(/@user/gi, userName)
        .replace(/@group/gi, groupName)
        .replace(/@mention/gi, `@${participantJid.split("@")[0]}`);
    } else {
      text =
        `👋 *${userName} has left ${groupName}.*\n\n` +
        `We'll miss you! Come back anytime. 🙏`;
    }

    await sock.sendMessage(groupJid, { text, mentions: [participantJid] });
    logger.info(`Goodbye → ${userName} in ${groupName}`);
  } catch (e) {
    logger.error("handleGroupGoodbye:", e.message);
  }
}

// ─── MAIN PARTICIPANT EVENT HANDLER ──────────────────────────────────────────
// index.js loads this as: groupHandler = m.handleGroupParticipant
// and calls: await groupHandler(update, sock)

export async function handleGroupParticipant(update, sock) {
  try {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !participants?.length || !action) return;

    for (const participantJid of participants) {
      const pushName =
        sock.store?.contacts?.[participantJid]?.name ||
        sock.store?.contacts?.[participantJid]?.notify ||
        update.pushName ||
        null;

      if (action === "add" || action === "invite") {
        await handleGroupWelcome(participantJid, groupJid, sock, pushName);
      } else if (action === "remove" || action === "leave") {
        await handleGroupGoodbye(participantJid, groupJid, sock, pushName);
      }
    }
  } catch (e) {
    logger.error("handleGroupParticipant:", e.message);
  }
}

// ─── COMMAND HANDLER ─────────────────────────────────────────────────────────

export async function handleGroupCommand(
  command,
  args,
  message,
  from,
  userJid,
  sock,
) {
  try {
    if (isOnCooldown(userJid, command, 3)) {
      return formatInfo(
        "COOLDOWN",
        `Please wait ${getCooldownRemaining(userJid, command)}s.`,
      );
    }
    trackUserActivity(from, userJid);
    if (!(await isGroupAdmin(from, userJid, sock))) {
      return formatError(
        "PERMISSION DENIED",
        "Only group admins can use group commands.",
      );
    }
    setCooldown(userJid, command);

    switch (command.toLowerCase()) {
      case "kick":
        return await handleKick(args, from, userJid, sock);
      case "ban":
        return await handleBan(args, from, userJid, sock);
      case "unban":
        return await handleUnban(args, from);
      case "warn":
        return await handleWarn(args, from, userJid, sock);
      case "warnings":
        return await handleViewWarnings(args, from, userJid);
      case "clearwarns":
        return await handleClearWarnings(args, from);
      case "add":
        return await handleAdd(args, from, userJid, sock);
      case "promote":
        return await handlePromote(args, from, sock);
      case "demote":
        return await handleDemote(args, from, sock);
      case "mute":
        return await handleMute(from, userJid, sock);
      case "unmute":
        return await handleUnmute(from, sock);
      case "tagall":
        return await handleTagall(args, from, sock);
      case "hidetag":
        return await handleHidetag(args, from, sock);
      case "link":
        return await handleLink(from, sock);
      case "revoke":
        return await handleRevoke(from, sock);
      case "settings":
        return await handleGroupSettings(args, from);
      case "info":
        return await handleGroupInfo(from, sock);
      case "antilink":
        return await handleAntiLink(args, from);
      case "antispam":
        return await handleAntiSpam(args, from);
      case "rules":
        return await handleGroupRules(from);
      case "setrules":
        return await handleSetRules(args, from);
      case "report":
        return await handleReport(args, from, userJid, sock);
      default:
        return formatError("UNKNOWN COMMAND", `"${command}" not recognized.`);
    }
  } catch (e) {
    logger.error(`handleGroupCommand (${command}):`, e);
    return formatError("COMMAND FAILED", e.message);
  }
}

// ─── Command implementations ──────────────────────────────────────────────────

async function handleKick(args, from, userJid, sock) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("KICK", "Usage: .kick @user");
  try {
    await sock.groupParticipantsUpdate(from, [t], "remove");
    return formatSuccess(
      "KICKED",
      `👤 @${t.split("@")[0]}\n📝 ${args.slice(1).join(" ") || "No reason"}`,
    );
  } catch (e) {
    return formatError("KICK FAILED", e.message);
  }
}

async function handleBan(args, from, userJid, sock) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("BAN", "Usage: .ban @user [reason]");
  try {
    const reason = args.slice(1).join(" ") || "No reason";
    await sock.groupParticipantsUpdate(from, [t], "remove");
    bannedUsers.set(`${from}_${t}`, { by: userJid, reason, time: Date.now() });
    return formatSuccess("BANNED", `👤 @${t.split("@")[0]}\n📝 ${reason}`);
  } catch (e) {
    return formatError("BAN FAILED", e.message);
  }
}

async function handleUnban(args, from) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("UNBAN", "Usage: .unban @user");
  return bannedUsers.delete(`${from}_${t}`)
    ? formatSuccess("UNBANNED", `@${t.split("@")[0]} removed from ban list.`)
    : formatInfo("NOT BANNED", `@${t.split("@")[0]} is not banned.`);
}

async function handleWarn(args, from, userJid, sock) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("WARN", "Usage: .warn @user [reason]");
  const key = `${from}_${t}`;
  const w = groupWarnings.get(key) || { count: 0, reasons: [] };
  const reason = args.slice(1).join(" ") || "No reason";
  w.count++;
  w.reasons.push({ reason, time: Date.now(), by: userJid });
  groupWarnings.set(key, w);
  let response = `👤 @${t.split("@")[0]}\n📊 Warning ${w.count}/3\n📝 ${reason}`;
  if (w.count >= 3) {
    try {
      await sock.groupParticipantsUpdate(from, [t], "remove");
    } catch (_) {}
    response += `\n\n🚫 Auto-kicked for max warnings.`;
    groupWarnings.delete(key);
  }
  return formatSuccess("WARNING ISSUED", response);
}

async function handleViewWarnings(args, from, userJid) {
  const t = getTargetUser(args) || userJid;
  const w = getGroupWarnings(from, t);
  let r = `👤 @${t.split("@")[0]}\n📊 Warnings: ${w.count}\n\n`;
  if (w.reasons?.length) {
    w.reasons.forEach((x, i) => {
      r += `${i + 1}. ${x.reason} — ${new Date(x.time).toLocaleDateString()}\n`;
    });
  } else {
    r += "✅ No warnings.";
  }
  return formatInfo("WARNINGS", r);
}

async function handleClearWarnings(args, from) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("CLEAR WARNINGS", "Usage: .clearwarns @user");
  clearGroupWarnings(from, t);
  return formatSuccess("CLEARED", `Warnings cleared for @${t.split("@")[0]}.`);
}

async function handleAdd(args, from, userJid, sock) {
  const phone = args[0]?.replace(/\D/g, "");
  if (!phone || phone.length < 10)
    return formatInfo("ADD", "Usage: .add 2348123456789");
  try {
    await sock.groupParticipantsUpdate(
      from,
      [`${phone}@s.whatsapp.net`],
      "add",
    );
    return formatSuccess("ADDED", `${phone} added to the group.`);
  } catch (e) {
    return formatError("ADD FAILED", e.message);
  }
}

async function handlePromote(args, from, sock) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("PROMOTE", "Usage: .promote @user");
  try {
    await sock.groupParticipantsUpdate(from, [t], "promote");
    return formatSuccess(
      "PROMOTED",
      `@${t.split("@")[0]} is now a group admin.`,
    );
  } catch (e) {
    return formatError("PROMOTE FAILED", e.message);
  }
}

async function handleDemote(args, from, sock) {
  const t = getTargetUser(args);
  if (!t) return formatInfo("DEMOTE", "Usage: .demote @user");
  try {
    await sock.groupParticipantsUpdate(from, [t], "demote");
    return formatSuccess(
      "DEMOTED",
      `@${t.split("@")[0]} is no longer an admin.`,
    );
  } catch (e) {
    return formatError("DEMOTE FAILED", e.message);
  }
}

async function handleMute(from, userJid, sock) {
  try {
    await sock.groupSettingUpdate(from, "announcement");
    mutedGroups.set(from, { mutedAt: Date.now(), mutedBy: userJid });
    return formatSuccess("MUTED", "Only admins can send messages now.");
  } catch (e) {
    return formatError("MUTE FAILED", e.message);
  }
}

async function handleUnmute(from, sock) {
  try {
    await sock.groupSettingUpdate(from, "not_announcement");
    mutedGroups.delete(from);
    return formatSuccess("UNMUTED", "All members can send messages now.");
  } catch (e) {
    return formatError("UNMUTE FAILED", e.message);
  }
}

async function handleTagall(args, from, sock) {
  try {
    const meta = await sock.groupMetadata(from);
    const mentions = meta.participants.map((p) => p.id);
    await sock.sendMessage(from, {
      text: args.join(" ") || "📢 Attention everyone!",
      mentions,
    });
    return null;
  } catch (e) {
    return formatError("TAGALL FAILED", e.message);
  }
}

async function handleHidetag(args, from, sock) {
  try {
    const meta = await sock.groupMetadata(from);
    await sock.sendMessage(from, {
      text: args.join(" ") || ".",
      mentions: meta.participants.map((p) => p.id),
    });
    return null;
  } catch (e) {
    return formatError("HIDETAG FAILED", e.message);
  }
}

async function handleLink(from, sock) {
  try {
    const code = await sock.groupInviteCode(from);
    return formatSuccess("GROUP LINK", `https://chat.whatsapp.com/${code}`);
  } catch (e) {
    return formatError("LINK FAILED", e.message);
  }
}

async function handleRevoke(from, sock) {
  try {
    await sock.groupRevokeInvite(from);
    return formatSuccess(
      "LINK REVOKED",
      "Group link reset. Use .link for the new one.",
    );
  } catch (e) {
    return formatError("REVOKE FAILED", e.message);
  }
}

async function handleGroupSettings(args, from) {
  const s = args[0]?.toLowerCase();
  if (!s || s === "view") return showGroupSettings(from);
  switch (s) {
    case "welcome":
      return toggleSetting(from, "welcome", args[1]);
    case "goodbye":
      return toggleSetting(from, "goodbye", args[1]);
    case "antilink":
      return toggleSetting(from, "antilink", args[1]);
    case "antispam":
      return toggleSetting(from, "antispam", args[1]);
    default:
      return formatError("UNKNOWN SETTING", `"${s}" not recognized.`);
  }
}

async function toggleSetting(groupJid, key, action) {
  const enabled = action?.toLowerCase() === "on";
  await setGroupSetting(groupJid, key, enabled);
  return formatSuccess(
    key.toUpperCase(),
    enabled ? "ENABLED ✅" : "DISABLED 🔴",
  );
}

async function handleGroupInfo(from, sock) {
  try {
    const meta = await sock.groupMetadata(from);
    const s = await getGroupSettings(from);
    return formatData("GROUP INFO", {
      "👥 Name": meta.subject,
      "👑 Owner": `@${meta.owner?.split("@")[0] || "Unknown"}`,
      "👥 Members": meta.participants.length,
      "👮 Admins": meta.participants.filter((p) => p.admin).length,
      "🎉 Welcome": s.welcome ? "ON" : "OFF",
      "👋 Goodbye": s.goodbye ? "ON" : "OFF",
      "🔗 Anti-link": s.antilink ? "ON" : "OFF",
      "🚫 Anti-spam": s.antispam ? "ON" : "OFF",
      "💬 Welcome msg": s.welcomeMessage ? "CUSTOM" : "DEFAULT",
      "💬 Goodbye msg": s.goodbyeMessage ? "CUSTOM" : "DEFAULT",
    });
  } catch (e) {
    return formatError("INFO FAILED", e.message);
  }
}

async function handleAntiLink(args, from) {
  const a = args[0]?.toLowerCase();
  if (!["on", "off"].includes(a)) {
    const cur = (await getGroupSetting(from, "antilink")) ? "ON" : "OFF";
    return formatInfo("ANTI-LINK", `Current: ${cur}\nUsage: .antilink on/off`);
  }
  await setGroupSetting(from, "antilink", a === "on");
  return formatSuccess("ANTI-LINK", a === "on" ? "ENABLED ✅" : "DISABLED 🔴");
}

async function handleAntiSpam(args, from) {
  const a = args[0]?.toLowerCase();
  if (!["on", "off"].includes(a)) {
    const cur = (await getGroupSetting(from, "antispam")) ? "ON" : "OFF";
    return formatInfo("ANTI-SPAM", `Current: ${cur}\nUsage: .antispam on/off`);
  }
  await setGroupSetting(from, "antispam", a === "on");
  return formatSuccess("ANTI-SPAM", a === "on" ? "ENABLED ✅" : "DISABLED 🔴");
}

async function handleGroupRules(from) {
  const r =
    (await getGroupSetting(from, "rules")) ||
    "1. Be respectful\n2. No spam\n3. No advertising";
  return formatInfo("GROUP RULES", r);
}

async function handleSetRules(args, from) {
  const text = args.join(" ");
  if (!text) return formatInfo("SET RULES", "Usage: .setrules <rules text>");
  await setGroupSetting(from, "rules", text);
  return formatSuccess("RULES UPDATED", "Group rules updated.");
}

async function handleReport(args, from, userJid, sock) {
  const t = getTargetUser(args);
  if (!t || args.length < 2)
    return formatInfo("REPORT", "Usage: .report @user [reason]");
  const reason = args.slice(1).join(" ");
  try {
    const meta = await sock.groupMetadata(from);
    const admins = meta.participants.filter((p) => p.admin).map((p) => p.id);
    const msg = `🚨 *Report*\n\nGroup: ${meta.subject}\nReported: @${t.split("@")[0]}\nBy: @${userJid.split("@")[0]}\nReason: ${reason}`;
    for (const admin of admins) {
      await sock
        .sendMessage(admin, { text: msg, mentions: [t, userJid] })
        .catch(() => {});
    }
    return formatSuccess("REPORT SENT", "Admins have been notified.");
  } catch (e) {
    return formatError("REPORT FAILED", e.message);
  }
}

function showGroupSettings(groupJid) {
  const s = groupSettings.get(groupJid) || getDefaultSettings();
  return formatData("GROUP SETTINGS", {
    "🎉 Welcome": s.welcome ? "ON" : "OFF",
    "👋 Goodbye": s.goodbye ? "ON" : "OFF",
    "🔗 Anti-link": s.antilink ? "ON" : "OFF",
    "🚫 Anti-spam": s.antispam ? "ON" : "OFF",
    "📜 Rules": s.rules ? "SET" : "NOT SET",
    "💬 Welcome msg": s.welcomeMessage ? "CUSTOM" : "DEFAULT",
    "💬 Goodbye msg": s.goodbyeMessage ? "CUSTOM" : "DEFAULT",
  });
}

// ─── Rule checking ────────────────────────────────────────────────────────────

export async function checkGroupRules(message, from, userJid, sock) {
  if (!from.endsWith("@g.us")) return false;
  const s = await getGroupSettings(from);
  const text =
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    "";
  if (s.antilink && /(https?:\/\/[^\s]+)/gi.test(text)) {
    await handleRuleViolation("link", from, userJid, sock, message);
    return true;
  }
  if (s.antispam && (await isSpam(from, userJid))) {
    await handleRuleViolation("spam", from, userJid, sock, message);
    return true;
  }
  return false;
}

async function isSpam(groupJid, userJid) {
  const key = `${groupJid}_${userJid}`;
  const now = Date.now();
  let a = userActivity.get(key) || { messages: [] };
  a.messages = a.messages.filter((t) => now - t < 10000);
  a.messages.push(now);
  userActivity.set(key, a);
  return a.messages.length > 5;
}

async function handleRuleViolation(type, groupJid, userJid, sock, message) {
  const warn =
    type === "link"
      ? "🔗 *Links are not allowed here.*"
      : "🚫 *Please don't spam.*";
  try {
    await sock.sendMessage(groupJid, { delete: message.key });
    await sock.sendMessage(groupJid, {
      text: `${warn}\n\n👤 @${userJid.split("@")[0]}`,
      mentions: [userJid],
    });
  } catch (_) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTargetUser(args) {
  if (!args?.length) return null;
  if (args[0].includes("@")) return args[0];
  const phone = args[0].replace(/\D/g, "");
  if (phone.length >= 10) return `${phone}@s.whatsapp.net`;
  return null;
}

export function getGroupWarnings(groupJid, userJid) {
  return (
    groupWarnings.get(`${groupJid}_${userJid}`) || { count: 0, reasons: [] }
  );
}

export function clearGroupWarnings(groupJid, userJid) {
  groupWarnings.delete(`${groupJid}_${userJid}`);
}

function isOnCooldown(userJid, command, seconds) {
  const last = commandCooldowns.get(`${userJid}_${command}`);
  return last && Date.now() - last < seconds * 1000;
}

function getCooldownRemaining(userJid, command) {
  const last = commandCooldowns.get(`${userJid}_${command}`);
  return last ? Math.ceil(Math.max(0, 3000 - (Date.now() - last)) / 1000) : 0;
}

function setCooldown(userJid, command) {
  const key = `${userJid}_${command}`;
  commandCooldowns.set(key, Date.now());
  setTimeout(() => commandCooldowns.delete(key), 60000);
}

function trackUserActivity(groupJid, userJid) {
  const key = `${groupJid}_${userJid}`;
  const now = Date.now();
  const a = userActivity.get(key) || { commands: [], lastActive: now };
  a.lastActive = now;
  a.commands.push(now);
  userActivity.set(key, a);
}

// ─── Default export ───────────────────────────────────────────────────────────

export default {
  initializeGroupHandler,
  handleGroupCommand,
  handleGroupParticipant,
  handleGroupWelcome,
  handleGroupGoodbye,
  checkGroupRules,
  isGroupAdmin,
  getGroupWarnings,
  clearGroupWarnings,
};
