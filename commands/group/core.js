// commands/group/core.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Core Commands — PRODUCTION REWRITE
//  Author: AYOCODES
//
//  THE ONE TRUE FIX APPLIED EVERYWHERE IN THIS FILE:
//
//  isUserAdmin() now accepts the isAdmin flag from context.
//  If isAdmin = true (bot owner), the function returns true immediately
//  without touching the participant list at all.
//  If isAdmin = false, the participant list check runs with normalizeNum()
//  correctly stripping the :N device suffix before comparing. — AYOCODES
//
//  Commands: kick, add, promote, demote, admins, tagall, hidetag
// ════════════════════════════════════════════════════════════════════════════

import {
  isBotGroupAdminCached,
  getGroupMetadataCached,
  normalizeNum,
} from "../../utils/validators.js";
import { formatError, formatInfo } from "../../utils/formatters.js";

// ============================================================================
//  HELPERS — AYOCODES
// ============================================================================

// Strips @domain AND :N device suffix — AYOCODES
function phone(jid) {
  if (!jid) return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

// ============================================================================
//  IS USER ADMIN — FIXED + isAdmin bypass — AYOCODES
//  If isAdmin flag (from context) is true → bot owner → return true immediately
//  Otherwise check participant list with normalizeNum() for :N suffix stripping
// ============================================================================
async function isUserAdmin(sock, groupJid, userJid, isAdminFlag = false) {
  // FIX: Bot owner bypass — AYOCODES
  if (isAdminFlag) return true;

  try {
    const metadata = await sock.groupMetadata(groupJid);
    const userNum  = normalizeNum(userJid);
    return metadata.participants.some(
      (p) =>
        normalizeNum(p.id) === userNum &&
        (p.admin === "admin" || p.admin === "superadmin"),
    );
  } catch {
    return false;
  }
}

// ============================================================================
//  KICK MEMBER — AYOCODES
// ============================================================================
export async function kick({ args, message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, { text: "❌ This command only works in groups." });
    }

    // FIX: isAdmin passed so bot owner bypasses participant check — AYOCODES
    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: "❌ I need to be a *group admin* to kick members.\nPlease promote me first!",
      });
    }

    let targetJid = null;
    const ctx     = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant)             targetJid = ctx.participant;
    if (!targetJid && ctx?.mentionedJid?.length) targetJid = ctx.mentionedJid[0];
    if (!targetJid && args.length > 0) {
      const num = args[0].replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = `${num}@s.whatsapp.net`;
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("KICK",
          "📌 *Usage:* .kick @user\n" +
          "📌 Or reply to a user's message with .kick\n\n" +
          "Example: .kick @1234567890"),
      });
    }

    if (normalizeNum(targetJid) === normalizeNum(userJid)) {
      return sock.sendMessage(from, { text: "❌ You cannot kick yourself." });
    }
    if (normalizeNum(targetJid) === normalizeNum(sock.user?.id)) {
      return sock.sendMessage(from, { text: "❌ You cannot kick me!" });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "remove");

    await sock.sendMessage(from, {
      text:
        `✅ *User kicked*\n` +
        `👤 @${phone(targetJid)}\n` +
        `👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
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

    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatInfo("ADD", "📌 *Usage:* .add <phone>\nExample: .add 2348123456789"),
      });
    }

    // FIX: renamed to targetPhone to avoid shadowing the outer phone() helper — AYOCODES
    const targetPhone = args[0].replace(/[^0-9]/g, "");
    if (!targetPhone || targetPhone.length < 10) {
      return sock.sendMessage(from, {
        text: "❌ Please provide a valid phone number (min 10 digits).",
      });
    }

    const targetJid = `${targetPhone}@s.whatsapp.net`;
    await sock.groupParticipantsUpdate(from, [targetJid], "add");

    await sock.sendMessage(from, {
      text:
        `✅ *User added*\n` +
        `👤 @${targetPhone}\n` +
        `👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
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

    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: "❌ I need to be a *group admin* to promote members.\nPlease promote me first!",
      });
    }

    let targetJid = null;
    const ctx     = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant)             targetJid = ctx.participant;
    if (!targetJid && ctx?.mentionedJid?.length) targetJid = ctx.mentionedJid[0];
    if (!targetJid && args.length > 0) {
      const num = args[0].replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = `${num}@s.whatsapp.net`;
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("PROMOTE",
          "📌 *Usage:* .promote @user\n" +
          "📌 Or reply to a user's message with .promote"),
      });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "promote");

    await sock.sendMessage(from, {
      text:
        `⭐ *User promoted to admin*\n` +
        `👤 @${phone(targetJid)}\n` +
        `👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
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

    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: "❌ I need to be a *group admin* to demote members.\nPlease promote me first!",
      });
    }

    let targetJid = null;
    const ctx     = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant)             targetJid = ctx.participant;
    if (!targetJid && ctx?.mentionedJid?.length) targetJid = ctx.mentionedJid[0];
    if (!targetJid && args.length > 0) {
      const num = args[0].replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = `${num}@s.whatsapp.net`;
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo("DEMOTE",
          "📌 *Usage:* .demote @user\n" +
          "📌 Or reply to a user's message with .demote"),
      });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], "demote");

    await sock.sendMessage(from, {
      text:
        `⬇️ *User demoted from admin*\n` +
        `👤 @${phone(targetJid)}\n` +
        `👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid],
    });
  } catch (error) {
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

    await sock.sendMessage(from, { text, mentions: adminList.map((a) => a.id) });
  } catch (error) {
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

    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group members." });
    }

    const participants = metadata.participants;
    let mentions       = [];
    let mentionText    = "";
    const sub          = args[0]?.toLowerCase();

    if (sub === "admins") {
      mentions    = participants.filter((p) => p.admin).map((p) => p.id);
      mentionText = `👑 *Admins tagged:* ${mentions.length}`;
    } else if (sub === "members") {
      mentions    = participants.filter((p) => !p.admin).map((p) => p.id);
      mentionText = `👥 *Members tagged:* ${mentions.length}`;
    } else {
      mentions    = participants.map((p) => p.id);
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
              remoteJid:   from,
              fromMe:      normalizeNum(ctx.participant) === normalizeNum(sock.user?.id),
              id:          ctx.stanzaId,
              participant: ctx.participant,
            },
            message: ctx.quotedMessage,
          },
          mentions,
        });
      } catch (_) {}
    }

    const output =
      `📢 *Announcement*\n\n${messageText ? messageText + "\n\n" : ""}` +
      `${mentionText}\n` +
      `📣 By: @${phone(userJid)}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, { text: output, mentions });
  } catch (error) {
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

    const admin = await isUserAdmin(sock, from, userJid, isAdmin);
    if (!admin) {
      return sock.sendMessage(from, { text: "⛔ Only group admins can use this command." });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, { text: "❌ Could not fetch group members." });
    }

    const mentions = metadata.participants.map((p) => p.id);

    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage && ctx?.stanzaId) {
      try {
        await sock.sendMessage(from, {
          forward: {
            key: {
              remoteJid:   from,
              fromMe:      normalizeNum(ctx.participant) === normalizeNum(sock.user?.id),
              id:          ctx.stanzaId,
              participant: ctx.participant,
            },
            message: ctx.quotedMessage,
          },
          mentions,
        });
      } catch (_) {}
    }

    await sock.sendMessage(from, {
      text:     fullArgs || "​",
      mentions,
    });
  } catch (error) {
    await sock.sendMessage(from, { text: formatError("ERROR", "Could not send hidden tag.") });
  }
}

// ============================================================================
//  DEFAULT EXPORT — AYOCODES
// ============================================================================
export default { kick, add, promote, demote, admins, tagall, hidetag };
