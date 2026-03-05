import {
  groupMetadataCache,
  groupSettings,
  isAdmin,
  saveGroupSettings,
} from "../../index.js";
import {
  formatGroupError,
  formatGroupInfo,
  formatGroupSuccess,
} from "../../utils/formatters.js";
import {
  getGroupMetadataCached,
  isBotGroupAdminCached,
  validateGroupCommand,
} from "../../utils/validators.js";

// ========== MUTE GROUP ==========
export async function mute({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(
      from,
      userJid,
      sock,
      "botAdmin",
    );
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    await sock.groupSettingUpdate(from, "announcement");

    const settings = groupSettings.get(from) || {};
    settings.muted = true;
    settings.mutedBy = userJid;
    settings.mutedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "MUTED",
        `🔇 *Group muted*\nOnly admins can now send messages.\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("MUTE FAILED", error.message),
    });
  }
}

// ========== UNMUTE GROUP ==========
export async function unmute({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(
      from,
      userJid,
      sock,
      "botAdmin",
    );
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    await sock.groupSettingUpdate(from, "not_announcement");

    const settings = groupSettings.get(from) || {};
    settings.muted = false;
    settings.unmutedBy = userJid;
    settings.unmutedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "UNMUTED",
        `🔊 *Group unmuted*\nAll members can now send messages.\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("UNMUTE FAILED", error.message),
    });
  }
}

// ========== TOGGLE ANTI-LINK ==========
export async function antiLink({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const current = groupSettings.get(from)?.antilink ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "ANTI-LINK",
          `Current: ${current}\n\n.antilink on\n.antilink off`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.antilink = action === "on";
    settings.antilinkUpdatedBy = userJid;
    settings.antilinkUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "ANTI-LINK",
        `🔗 Anti-link ${action === "on" ? "ENABLED" : "DISABLED"}\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not toggle anti-link."),
    });
  }
}

// ========== TOGGLE ANTI-SPAM ==========
export async function antiSpam({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const current = groupSettings.get(from)?.antispam ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "ANTI-SPAM",
          `Current: ${current}\n\n.antispam on\n.antispam off`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.antispam = action === "on";
    settings.antispamUpdatedBy = userJid;
    settings.antispamUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "ANTI-SPAM",
        `🚫 Anti-spam ${action === "on" ? "ENABLED" : "DISABLED"}\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not toggle anti-spam."),
    });
  }
}

// ========== TOGGLE WELCOME ==========
export async function welcomeToggle({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const current = groupSettings.get(from)?.welcome ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "WELCOME",
          `Current: ${current}\n\n.welcome on\n.welcome off`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.welcome = action === "on";
    settings.welcomeUpdatedBy = userJid;
    settings.welcomeUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "WELCOME",
        `👋 Welcome messages ${action === "on" ? "ENABLED" : "DISABLED"}\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not toggle welcome."),
    });
  }
}

// ========== SET WELCOME MESSAGE ==========
export async function setWelcome({ fullArgs, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    if (!fullArgs) {
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "SET WELCOME",
          "Usage: .setwelcome <message>\nVariables: @user, @group, @count\nExample: .setwelcome Welcome @user!",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.welcomeMessage = fullArgs;
    settings.welcomeUpdatedBy = userJid;
    settings.welcomeUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "WELCOME UPDATED",
        `👋 New welcome message:\n"${fullArgs}"`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not set welcome message."),
    });
  }
}

// ========== TOGGLE GOODBYE ==========
export async function goodbyeToggle({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const current = groupSettings.get(from)?.goodbye ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "GOODBYE",
          `Current: ${current}\n\n.goodbye on\n.goodbye off`,
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.goodbye = action === "on";
    settings.goodbyeUpdatedBy = userJid;
    settings.goodbyeUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "GOODBYE",
        `👋 Goodbye messages ${action === "on" ? "ENABLED" : "DISABLED"}\n👑 By: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not toggle goodbye."),
    });
  }
}

// ========== SET GOODBYE MESSAGE ==========
export async function setGoodbye({ fullArgs, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    if (!fullArgs) {
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "SET GOODBYE",
          "Usage: .setgoodbye <message>\nVariables: @user, @group\nExample: .setgoodbye Goodbye @user!",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.goodbyeMessage = fullArgs;
    settings.goodbyeUpdatedBy = userJid;
    settings.goodbyeUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "GOODBYE UPDATED",
        `👋 New goodbye message:\n"${fullArgs}"`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not set goodbye message."),
    });
  }
}

// ========== GROUP INFO ==========
export async function groupInfo({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return await sock.sendMessage(from, {
        text: formatGroupError(
          "GROUP ONLY",
          "This command only works in groups.",
        ),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return await sock.sendMessage(from, {
        text: formatGroupError("ERROR", "Could not fetch group information."),
      });
    }

    const totalMembers = metadata.participants.length;
    const admins = metadata.participants.filter((p) => p.admin).length;
    const superAdmins = metadata.participants.filter(
      (p) => p.admin === "superadmin",
    ).length;
    const creationDate = metadata.creation
      ? new Date(metadata.creation * 1000).toLocaleString()
      : "Unknown";

    const settings = groupSettings.get(from) || {};

    const infoMsg =
      `📛 *Group:* ${metadata.subject}\n` +
      `👥 *Members:* ${totalMembers}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⭐ *Admins:* ${admins} (${superAdmins} super)\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 *Restrict:* ${metadata.restrict ? "✅ Yes" : "❌ No"}\n` +
      `🔇 *Announce:* ${metadata.announce ? "✅ Yes" : "❌ No"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 *Owner:* ${metadata.owner?.split("@")[0] || "Unknown"}\n` +
      `📅 *Created:* ${creationDate}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Settings*\n` +
      `├─ 🔗 AntiLink: ${settings.antilink ? "✅" : "❌"}\n` +
      `├─ 🚫 AntiSpam: ${settings.antispam ? "✅" : "❌"}\n` +
      `├─ 👋 Welcome: ${settings.welcome ? "✅" : "❌"}\n` +
      `└─ 👋 Goodbye: ${settings.goodbye ? "✅" : "❌"}`;

    await sock.sendMessage(from, {
      text: formatGroupSuccess("GROUP INFORMATION", infoMsg),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not fetch group information."),
    });
  }
}

// ========== GROUP RULES ==========
export async function rules({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return await sock.sendMessage(from, {
        text: formatGroupError(
          "GROUP ONLY",
          "This command only works in groups.",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    const rules = settings.rules || "No rules have been set yet.";

    await sock.sendMessage(from, {
      text: formatGroupSuccess("GROUP RULES", `📜 *Rules*\n\n${rules}`),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not fetch rules."),
    });
  }
}

// ========== SET GROUP RULES ==========
export async function setRules({ fullArgs, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    if (!fullArgs) {
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "SET RULES",
          "Usage: .setrules <rules>\nExample: .setrules 1. Be respectful\n2. No spamming",
        ),
      });
    }

    const settings = groupSettings.get(from) || {};
    settings.rules = fullArgs;
    settings.rulesUpdatedBy = userJid;
    settings.rulesUpdatedAt = Date.now();
    groupSettings.set(from, settings);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "RULES UPDATED",
        `📜 New rules set.\n\n${fullArgs}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not set rules."),
    });
  }
}

// ========== GET GROUP LINK ==========
export async function link({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const botIsAdmin = await isBotGroupAdminCached(from, sock);
    let link;

    if (botIsAdmin) {
      const code = await sock.groupInviteCode(from);
      link = `https://chat.whatsapp.com/${code}`;
    } else {
      const metadata = await getGroupMetadataCached(from, sock);
      if (metadata?.inviteCode) {
        link = `https://chat.whatsapp.com/${metadata.inviteCode}`;
      } else {
        return await sock.sendMessage(from, {
          text: formatGroupError(
            "BOT NOT ADMIN",
            "I need to be an admin to get the group link.",
          ),
        });
      }
    }

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "GROUP LINK",
        `🔗 ${link}\n\n👑 Requested by: @${userJid.split("@")[0]}`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not get group link."),
    });
  }
}

// ========== REVOKE GROUP LINK ==========
export async function revoke({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(
      from,
      userJid,
      sock,
      "botAdmin",
    );
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    await sock.groupRevokeInvite(from);
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "LINK REVOKED",
        `🔄 Group link has been reset.\n👑 By: @${userJid.split("@")[0]}\n\nUse .link to get the new link.`,
      ),
      mentions: [userJid],
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not revoke link."),
    });
  }
}

// ========== TAG ALL ==========
export async function tagAll({ fullArgs, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const metadata = validation.metadata;
    const participants = metadata.participants.map((p) => p.id);
    const messageText = fullArgs || "📢 *Attention everyone!*";

    const tagMsg = `📢 *Group Announcement*\n\n${messageText}\n\n━━━━━━━━━━━━━━━━━━━━━\n👥 *Total:* ${participants.length} members\n👑 *By:* @${userJid.split("@")[0]}`;

    await sock.sendMessage(from, {
      text: tagMsg,
      mentions: participants,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not tag all members."),
    });
  }
}

// ========== HIDDEN TAG ==========
export async function hideTag({ fullArgs, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    const metadata = validation.metadata;
    const participants = metadata.participants.map((p) => p.id);

    await sock.sendMessage(from, {
      text: fullArgs || ".",
      mentions: participants,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not send hidden tag."),
    });
  }
}

// ========== DELETE MESSAGE ==========
export async function deleteMsg({ message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return await sock.sendMessage(from, {
        text: formatGroupError(
          "GROUP ONLY",
          "This command only works in groups.",
        ),
      });
    }

    const isGroupAdminUser = await isGroupAdminCached(from, userJid, sock);
    const isGlobalAdmin = isAdmin(userJid);

    if (!isGroupAdminUser && !isGlobalAdmin) {
      return await sock.sendMessage(from, {
        text: formatGroupError(
          "ADMIN ONLY",
          "Only group admins can delete messages.",
        ),
      });
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo;
    if (!quoted || !quoted.stanzaId) {
      return await sock.sendMessage(from, {
        text: formatGroupInfo(
          "DELETE",
          "Reply to a message with .delete to delete it.",
        ),
      });
    }

    const deleteKey = {
      remoteJid: from,
      fromMe: quoted.participant === sock.user.id,
      id: quoted.stanzaId,
      participant: quoted.participant,
    };

    await sock.sendMessage(from, { delete: deleteKey });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("DELETE FAILED", error.message),
    });
  }
}

// ========== LEAVE GROUP ==========
export async function leave({ from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return await sock.sendMessage(from, { text: validation.error });

    await sock.sendMessage(from, {
      text: `👋 *Goodbye everyone!*\n\nLeaving as requested by @${userJid.split("@")[0]}\n\nThanks for having me! 🤖`,
      mentions: [userJid],
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sock.groupLeave(from);
  } catch (error) {
    console.error("Leave error:", error);
  }
}

// ========== DEBUG GROUP ==========
export async function debug({ from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return await sock.sendMessage(from, {
        text: formatGroupError(
          "GROUP ONLY",
          "This command only works in groups.",
        ),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    const botJid = sock.user.id;
    const botParticipant = metadata?.participants.find((p) => p.id === botJid);
    const userParticipant = metadata?.participants.find(
      (p) => p.id === userJid,
    );
    const settings = groupSettings.get(from) || {};

    const debugMsg =
      `🔍 *Group Debug*\n\n` +
      `📛 *Group:* ${metadata?.subject || "Unknown"}\n` +
      `👥 *Members:* ${metadata?.participants.length || 0}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 *BOT*\n` +
      `├─ Admin: ${botParticipant?.admin ? "✅" : "❌"}\n` +
      `└─ Role: ${botParticipant?.admin || "Member"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *YOU*\n` +
      `├─ Admin: ${userParticipant?.admin ? "✅" : "❌"}\n` +
      `└─ Global Admin: ${isAdmin(userJid) ? "✅" : "❌"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Settings*\n` +
      `├─ AntiLink: ${settings.antilink ? "✅" : "❌"}\n` +
      `├─ AntiSpam: ${settings.antispam ? "✅" : "❌"}\n` +
      `├─ Welcome: ${settings.welcome ? "✅" : "❌"}\n` +
      `└─ Goodbye: ${settings.goodbye ? "✅" : "❌"}`;

    await sock.sendMessage(from, {
      text: formatGroupSuccess("DEBUG INFO", debugMsg),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatGroupError("DEBUG ERROR", error.message),
    });
  }
}
