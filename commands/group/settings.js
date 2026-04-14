// commands/group/settings.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Settings Module — FIXED
//  Author: AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import {
  groupSettings,
  isAdmin as isGlobalAdmin,
  saveGroupSettings,
} from "../../index.js";

import {
  clearGroupCache,
  getGroupMetadataCached,
  isBotGroupAdminCached,
  isGroupAdminCached,
  normalizeNum,
  validateGroupCommand,
  refreshBotAdminStatus,
  getBotNumber,
} from "../../utils/validators.js";

// ============================================================================
//  HELPERS
// ============================================================================

function fmt(emoji, title, body) {
  return (
    `${emoji} *${title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${body.trim()}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`
  );
}

function phone(jid) {
  return normalizeNum(jid);
}

async function checkGroupAdmin(from, userJid, sock, isAdmin) {
  if (isAdmin) return true;
  try {
    return await isGroupAdminCached(from, userJid, sock, true);
  } catch (_) {
    return false;
  }
}

function getReplyContext(message) {
  const msg = message?.message;
  return (
    (msg &&
      (msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        msg.videoMessage?.contextInfo ||
        msg.audioMessage?.contextInfo ||
        msg.documentMessage?.contextInfo ||
        msg.stickerMessage?.contextInfo)) ||
    null
  );
}

// ============================================================================
//  MUTE GROUP
// ============================================================================
export async function mute({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to mute the group.\nPlease promote me first!",
        ),
      });
    }

    await sock.groupSettingUpdate(from, "announcement");

    const settings = groupSettings.get(from) || {};
    settings.muted = true;
    settings.mutedBy = userJid;
    settings.mutedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GROUP MUTED",
        `🔇 Only admins can now send messages.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "MUTE FAILED", error.message),
    });
  }
}

// ============================================================================
//  UNMUTE GROUP
// ============================================================================
export async function unmute({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to unmute the group.\nPlease promote me first!",
        ),
      });
    }

    await sock.groupSettingUpdate(from, "not_announcement");

    const settings = groupSettings.get(from) || {};
    settings.muted = false;
    settings.unmutedBy = userJid;
    settings.unmutedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GROUP UNMUTED",
        `🔊 All members can now send messages.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "UNMUTE FAILED", error.message),
    });
  }
}

// ============================================================================
//  LOCK GROUP
// ============================================================================
export async function lock({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to lock the group.\nPlease promote me first!",
        ),
      });
    }

    await sock.groupSettingUpdate(from, "locked");

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GROUP LOCKED",
        `🔒 Group info editing is now restricted to admins only.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "LOCK FAILED", error.message),
    });
  }
}

// ============================================================================
//  SHOW PARTICIPANTS (diagnostic)
// ============================================================================
export async function showParticipants({ from, sock }) {
  try {
    const metadata = await sock.groupMetadata(from);
    let msg = "*Group Participants*\n\n";

    metadata.participants.forEach((p, i) => {
      const rawJid = p.id;
      const normalized = normalizeNum(rawJid);
      msg += `${i + 1}. Raw: ${rawJid}\n   Normalized: +${normalized}\n   Admin: ${p.admin || "No"}\n\n`;
    });

    await sock.sendMessage(from, { text: msg });
  } catch (error) {
    await sock.sendMessage(from, { text: `Error: ${error.message}` });
  }
}

// ============================================================================
//  UNLOCK GROUP
// ============================================================================
export async function unlock({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to unlock the group.\nPlease promote me first!",
        ),
      });
    }

    await sock.groupSettingUpdate(from, "unlocked");

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GROUP UNLOCKED",
        `🔓 All members can now edit group info.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "UNLOCK FAILED", error.message),
    });
  }
}

// ============================================================================
//  ANTI-LINK TOGGLE
// ============================================================================
export async function antiLink({ args, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const sub = args[0]?.toLowerCase();

    if (!sub || !["on", "off"].includes(sub)) {
      const status = groupSettings.get(from)?.antilink ? "ON ✅" : "OFF ❌";
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "ANTI-LINK",
          `Current: *${status}*\n\n.antilink on  — Enable\n.antilink off — Disable\n\n` +
            `⚠️ Links will be auto-deleted and users warned.\n` +
            `After 3 warnings, they will be kicked.`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.antilink = sub === "on";
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "ANTI-LINK",
        `🔗 Anti-link ${sub === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not toggle anti-link."),
    });
  }
}

// ============================================================================
//  ANTI-SPAM TOGGLE
// ============================================================================
export async function antiSpam({ args, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const sub = args[0]?.toLowerCase();

    if (!sub || !["on", "off"].includes(sub)) {
      const status = groupSettings.get(from)?.antispam ? "ON ✅" : "OFF ❌";
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "ANTI-SPAM",
          `Current: *${status}*\n\n.antispam on  — Enable\n.antispam off — Disable`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.antispam = sub === "on";
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "ANTI-SPAM",
        `🚫 Anti-spam ${sub === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not toggle anti-spam."),
    });
  }
}

// ============================================================================
//  WELCOME TOGGLE
// ============================================================================
export async function welcomeToggle({ args, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const sub = args[0]?.toLowerCase();

    if (!sub || !["on", "off"].includes(sub)) {
      const status = groupSettings.get(from)?.welcome ? "ON ✅" : "OFF ❌";
      const welcomeMsg =
        groupSettings.get(from)?.welcomeMessage ||
        "Welcome @user to @group! 🎉";
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "WELCOME",
          `Current: *${status}*\nMessage: "${welcomeMsg}"\n\n.welcome on/off\n.setwelcome <msg>\n\nVars: @user @group @count @date @time`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.welcome = sub === "on";
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "WELCOME",
        `👋 Welcome messages ${sub === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not toggle welcome."),
    });
  }
}

// ============================================================================
//  SET WELCOME MESSAGE
// ============================================================================
export async function setWelcome({ fullArgs, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    if (!fullArgs) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "SET WELCOME",
          "📌 *Usage:* .setwelcome <message>\n\n" +
            "📋 *Variables:* @user @group @count @date @time\n\n" +
            "📋 *Example:*\n.setwelcome Hey @user! Welcome to @group 🎉",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.welcomeMessage = fullArgs;
    settings.welcome = true;
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "WELCOME SET",
        `👋 Welcome message saved & *enabled*.\n\n📝 Preview:\n"${fullArgs.substring(0, 150)}${fullArgs.length > 150 ? "..." : ""}"\n\n💡 Disable anytime: .welcome off`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not set welcome message."),
    });
  }
}

// ============================================================================
//  GOODBYE TOGGLE
// ============================================================================
export async function goodbyeToggle({ args, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const sub = args[0]?.toLowerCase();

    if (!sub || !["on", "off"].includes(sub)) {
      const status = groupSettings.get(from)?.goodbye ? "ON ✅" : "OFF ❌";
      const goodbyeMsg =
        groupSettings.get(from)?.goodbyeMessage || "Goodbye @user 👋";
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "GOODBYE",
          `Current: *${status}*\nMessage: "${goodbyeMsg}"\n\n.goodbye on/off\n.setgoodbye <msg>\n\nVars: @user @group @date @time`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.goodbye = sub === "on";
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GOODBYE",
        `👋 Goodbye messages ${sub === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not toggle goodbye."),
    });
  }
}

// ============================================================================
//  SET GOODBYE MESSAGE
// ============================================================================
export async function setGoodbye({ fullArgs, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    if (!fullArgs) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "SET GOODBYE",
          "📌 *Usage:* .setgoodbye <message>\n\n" +
            "📋 *Variables:* @user @group @date @time\n\n" +
            "📋 *Example:*\n.setgoodbye Goodbye @user 👋 We'll miss you!",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.goodbyeMessage = fullArgs;
    settings.goodbye = true;
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GOODBYE SET",
        `👋 Goodbye message saved & *enabled*.\n\n📝 Preview:\n"${fullArgs.substring(0, 150)}${fullArgs.length > 150 ? "..." : ""}"\n\n💡 Disable anytime: .goodbye off`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not set goodbye message."),
    });
  }
}

// ============================================================================
//  GROUP INFO
// ============================================================================
export async function groupInfo({ from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock, true);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "Could not fetch group info."),
      });
    }

    const totalMembers = metadata.participants.length;
    const adminCount = metadata.participants.filter((p) => p.admin).length;
    const superAdminCount = metadata.participants.filter(
      (p) => p.admin === "superadmin",
    ).length;
    const created = metadata.creation
      ? new Date(metadata.creation * 1000).toLocaleString()
      : "Unknown";
    const settings = groupSettings.get(from) || {};

    const info =
      `📛 *Group:* ${metadata.subject}\n` +
      `🆔 *ID:* ${from.split("@")[0]}\n` +
      `👥 *Members:* ${totalMembers}\n` +
      `⭐ *Admins:* ${adminCount} (${superAdminCount} super)\n` +
      `👑 *Owner:* ${phone(metadata.owner) || "Unknown"}\n` +
      `📅 *Created:* ${created}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Settings*\n` +
      `├─ 🔗 AntiLink: ${settings.antilink ? "✅ ON" : "❌ OFF"}\n` +
      `├─ 🚫 AntiSpam: ${settings.antispam ? "✅ ON" : "❌ OFF"}\n` +
      `├─ 👋 Welcome:  ${settings.welcome ? "✅ ON" : "❌ OFF"}\n` +
      `└─ 👋 Goodbye:  ${settings.goodbye ? "✅ ON" : "❌ OFF"}`;

    await sock.sendMessage(from, { text: fmt("✅", "GROUP INFO", info) });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not fetch group info."),
    });
  }
}

// ============================================================================
//  RULES
// ============================================================================
export async function rules({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const groupRules =
      (groupSettings.get(from) || {}).rules ||
      "No rules set.\n\nAdmins: .setrules <rules>";

    await sock.sendMessage(from, {
      text: fmt("ℹ️", "GROUP RULES", `📜\n\n${groupRules}`),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not fetch rules."),
    });
  }
}

// ============================================================================
//  SET RULES
// ============================================================================
export async function setRules({ fullArgs, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    if (!fullArgs) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "SET RULES",
          "Usage: .setrules <rules>\n\nExample:\n.setrules 1. Be respectful\n2. No spam",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.rules = fullArgs;
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt("✅", "RULES UPDATED", `📜\n\n${fullArgs}`),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not set rules."),
    });
  }
}

// ============================================================================
//  GROUP LINK
// ============================================================================
export async function link({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    let inviteCode = null;

    if (await isBotGroupAdminCached(from, sock, true)) {
      try {
        const code = await sock.groupInviteCode(from);
        if (code) inviteCode = `https://chat.whatsapp.com/${code}`;
      } catch (_) {}
    }

    if (!inviteCode) {
      const metadata = await getGroupMetadataCached(from, sock, true);
      if (metadata?.inviteCode) {
        inviteCode = `https://chat.whatsapp.com/${metadata.inviteCode}`;
      }
    }

    if (!inviteCode) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "LINK UNAVAILABLE",
          "Could not get the group link.\nMake sure I'm promoted to admin.",
        ),
      });
    }

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "GROUP LINK",
        `🔗 ${inviteCode}\n\n📣 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not get group link."),
    });
  }
}

// ============================================================================
//  REVOKE LINK
// ============================================================================
export async function revoke({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to revoke the link.\nPlease promote me first!",
        ),
      });
    }

    await sock.groupRevokeInvite(from);
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "LINK REVOKED",
        `🔄 Invite link has been reset.\n👑 By: @${phone(userJid)}\n\n💡 Use .link to get the new link.`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not revoke link."),
    });
  }
}

// ============================================================================
//  PIN MESSAGE
// ============================================================================
export async function pin({ message, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to pin messages.\nPlease promote me first!",
        ),
      });
    }

    const quoted = getReplyContext(message);
    if (!quoted?.stanzaId) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "PIN",
          "Reply to a message with *.pin* to pin it in the group.",
        ),
      });
    }

    const key = {
      remoteJid: from,
      fromMe:
        !!quoted.participant &&
        phone(quoted.participant) === getBotNumber(sock),
      id: quoted.stanzaId,
    };
    if (quoted.participant) key.participant = quoted.participant;

    await sock.sendMessage(from, {
      pin: { key, type: 1, time: 7 * 24 * 60 * 60 },
    });

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "MESSAGE PINNED",
        `📌 Message pinned for 7 days.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt(
        "❌",
        "PIN FAILED",
        error.message +
          "\n\nMake sure I am a group admin and the message exists.",
      ),
    });
  }
}

// ============================================================================
//  UNPIN MESSAGE
// ============================================================================
export async function unpin({ message, from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "❌ I need to be a *group admin* to unpin messages.\nPlease promote me first!",
        ),
      });
    }

    const quoted = getReplyContext(message);
    if (!quoted?.stanzaId) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "UNPIN",
          "Reply to a pinned message with *.unpin* to remove the pin.",
        ),
      });
    }

    const key = {
      remoteJid: from,
      fromMe:
        !!quoted.participant &&
        phone(quoted.participant) === getBotNumber(sock),
      id: quoted.stanzaId,
    };
    if (quoted.participant) key.participant = quoted.participant;

    await sock.sendMessage(from, { pin: { key, type: 0, time: 0 } });

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "MESSAGE UNPINNED",
        `📌 Message unpinned.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt(
        "❌",
        "UNPIN FAILED",
        error.message +
          "\n\nMake sure I am a group admin and the message is pinned.",
      ),
    });
  }
}

// ============================================================================
//  DELETE MESSAGE
// ============================================================================
export async function deleteMsg({ message, from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    const quoted = getReplyContext(message);
    if (!quoted?.stanzaId) {
      return sock.sendMessage(from, {
        text: fmt(
          "ℹ️",
          "DELETE",
          "Reply to a message with .delete to remove it.",
        ),
      });
    }

    const key = {
      remoteJid: from,
      fromMe:
        !!quoted.participant &&
        phone(quoted.participant) === getBotNumber(sock),
      id: quoted.stanzaId,
      participant: quoted.participant,
    };

    await sock.sendMessage(from, { delete: key });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "DELETE FAILED", error.message),
    });
  }
}

// ============================================================================
//  SETTINGS OVERVIEW
// ============================================================================
export async function settingsOverview({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const settings = groupSettings.get(from) || {};
    const metadata = await getGroupMetadataCached(from, sock, true);

    const overview =
      `📛 *Group:* ${metadata?.subject || "Unknown"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔇 *Mute:*     ${settings.muted ? "✅ ON " : "❌ OFF"}\n` +
      `🔗 *AntiLink:* ${settings.antilink ? "✅ ON " : "❌ OFF"}\n` +
      `🚫 *AntiSpam:* ${settings.antispam ? "✅ ON " : "❌ OFF"}\n` +
      `👋 *Welcome:*  ${settings.welcome ? "✅ ON " : "❌ OFF"}\n` +
      `   └─ "${settings.welcomeMessage ? settings.welcomeMessage.substring(0, 60) + (settings.welcomeMessage.length > 60 ? "…" : "") : "_Not set_"}"\n` +
      `👋 *Goodbye:*  ${settings.goodbye ? "✅ ON " : "❌ OFF"}\n` +
      `   └─ "${settings.goodbyeMessage ? settings.goodbyeMessage.substring(0, 60) + (settings.goodbyeMessage.length > 60 ? "…" : "") : "_Not set_"}"\n` +
      `📜 *Rules:*    ${settings.rules ? "✅ Set" : "❌ Not set"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 Use .groupinfo for full group & member details.`;

    await sock.sendMessage(from, { text: fmt("ℹ️", "BOT SETTINGS", overview) });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not fetch settings."),
    });
  }
}

// ============================================================================
//  RESET SETTINGS
// ============================================================================
export async function resetSettings({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt(
          "❌",
          "ERROR",
          "⛔ Only *group admins* can use this command.",
        ),
      });
    }

    groupSettings.set(from, {});
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "SETTINGS RESET",
        `🗑️ All bot settings for this group have been cleared.\n\n` +
          `AntiLink: ❌ OFF\nAntiSpam: ❌ OFF\nWelcome:  ❌ OFF\nGoodbye:  ❌ OFF\nRules:    cleared\n\n` +
          `👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "ERROR", "Could not reset settings."),
    });
  }
}

// ============================================================================
//  LEAVE GROUP
// ============================================================================
export async function leave({ from, userJid, sock, isAdmin }) {
  try {
    const isUserAdmin = await checkGroupAdmin(from, userJid, sock, isAdmin);
    if (!isUserAdmin) {
      return sock.sendMessage(from, {
        text: fmt("❌", "ERROR", "⛔ Only *group admins* can make me leave."),
      });
    }

    await sock.sendMessage(from, {
      text:
        `👋 *Goodbye everyone!*\n\n` +
        `Leaving as requested by @${phone(userJid)} 🤖\n\n` +
        `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      mentions: [userJid],
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sock.groupLeave(from);
  } catch (error) {
    console.error("leave error:", error.message);
  }
}

// ============================================================================
//  TEST ADMIN
// ============================================================================
export async function testAdmin({ from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const botNumber = getBotNumber(sock);
    const botAdmin = await isBotGroupAdminCached(from, sock, true);
    const userAdmin = await isGroupAdminCached(from, userJid, sock);
    const globalAdmin = isAdmin;

    const metadata = await getGroupMetadataCached(from, sock, true);
    const botParticipant = metadata?.participants?.find(
      (p) => phone(p.id) === botNumber,
    );

    const info =
      `🔍 *ADMIN DIAGNOSTIC*\n\n` +
      `🤖 *Bot Information*\n` +
      `├─ Number: +${botNumber}\n` +
      `├─ Admin:  ${botAdmin ? "✅ YES" : "❌ NO"}\n` +
      `└─ Role:   ${botParticipant?.admin || "Member"}\n\n` +
      `👤 *Your Information*\n` +
      `├─ Number: @${phone(userJid)}\n` +
      `├─ Group Admin:  ${userAdmin ? "✅ YES" : "❌ NO"}\n` +
      `└─ Global Admin: ${globalAdmin ? "✅ YES" : "❌ NO"}\n\n` +
      `👥 *Group Information*\n` +
      `├─ Name: ${metadata?.subject || "Unknown"}\n` +
      `├─ Members: ${metadata?.participants?.length || 0}\n` +
      `└─ Owner: @${phone(metadata?.owner) || "Unknown"}\n\n` +
      `💡 If bot shows ❌ NO after being promoted:\n` +
      `1. Use .refreshadmin to clear cache\n` +
      `2. Wait 10 seconds and try again\n` +
      `3. Demote and promote the bot again`;

    await sock.sendMessage(from, {
      text: fmt("✅", "DIAGNOSTIC", info),
      mentions: [userJid, metadata?.owner].filter(Boolean),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "TEST FAILED", error.message),
    });
  }
}

// ============================================================================
//  REFRESH ADMIN CACHE
// ============================================================================
export async function refreshAdmin({ from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    clearGroupCache(from);
    const botAdmin = await refreshBotAdminStatus(from, sock);

    await sock.sendMessage(from, {
      text: fmt(
        "✅",
        "CACHE REFRESHED",
        `🔄 Admin cache cleared for this group.\n` +
          `Bot admin status: ${botAdmin ? "✅ YES" : "❌ NO"}\n\n` +
          `If still ❌ NO, please demote and promote the bot again.`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "REFRESH FAILED", error.message),
    });
  }
}

// ============================================================================
//  DEBUG
// ============================================================================
export async function debug({ from, userJid, sock, isAdmin }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: fmt("❌", "GROUP ONLY", "This command only works in groups."),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock, true);
    const botNumber = getBotNumber(sock);
    const userNumber = phone(userJid);

    const botParticipant = metadata?.participants?.find(
      (p) => phone(p.id) === botNumber,
    );
    const userParticipant = metadata?.participants?.find(
      (p) => phone(p.id) === userNumber,
    );

    const settings = groupSettings.get(from) || {};

    const debugInfo =
      `📛 *Group:* ${metadata?.subject || "Unknown"}\n` +
      `👥 *Members:* ${metadata?.participants?.length || 0}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 *BOT (+${botNumber})*\n` +
      `├─ Admin:  ${botParticipant?.admin ? "✅ Yes" : "❌ No"}\n` +
      `└─ Role:   ${botParticipant?.admin || "Member"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *YOU (+${userNumber})*\n` +
      `├─ Group Admin:  ${userParticipant?.admin ? "✅ Yes" : "❌ No"}\n` +
      `├─ Global owner: ${isAdmin ? "✅ Yes" : "❌ No"}\n` +
      `└─ Raw JID:      ${userJid}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Bot Settings*\n` +
      `├─ 🔗 AntiLink: ${settings.antilink ? "✅" : "❌"}\n` +
      `├─ 🚫 AntiSpam: ${settings.antispam ? "✅" : "❌"}\n` +
      `├─ 👋 Welcome:  ${settings.welcome ? "✅" : "❌"}\n` +
      `└─ 👋 Goodbye:  ${settings.goodbye ? "✅" : "❌"}`;

    await sock.sendMessage(from, { text: fmt("✅", "DEBUG", debugInfo) });
  } catch (error) {
    await sock.sendMessage(from, {
      text: fmt("❌", "DEBUG ERROR", error.message),
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT
//  FIX: showParticipants was missing from the default export object
// ============================================================================
export default {
  mute,
  unmute,
  lock,
  unlock,
  antiLink,
  antiSpam,
  welcomeToggle,
  setWelcome,
  goodbyeToggle,
  setGoodbye,
  groupInfo,
  rules,
  setRules,
  link,
  revoke,
  pin,
  unpin,
  deleteMsg,
  settingsOverview,
  resetSettings,
  leave,
  testAdmin,
  refreshAdmin,
  debug,
  showParticipants,
};
