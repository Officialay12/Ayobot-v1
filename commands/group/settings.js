// commands/group/settings.js - AYOBOT v1 | Created by AYOCODES
// All group configuration commands. Uses validateGroupCommand() from validators.js
// as the single source of truth for permission checks. — AYOCODES

import { groupSettings, isAdmin, saveGroupSettings } from "../../index.js";

import {
  clearGroupCache,
  getGroupMetadataCached,
  isBotGroupAdminCached,
  normalizeNum,
  validateGroupCommand,
} from "../../utils/validators.js";

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(icon, title, body) {
  return `${icon} *${title}*\n━━━━━━━━━━━━━━━━━━━━━\n${body}\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;
}
const gSuccess = (t, b) => fmt("✅", t, b);
const gError = (t, b) => fmt("❌", t, b);
const gInfo = (t, b) => fmt("ℹ️", t, b);

function phone(jid) {
  return normalizeNum(jid);
}

// ─── Extract reply context from any message type ──────────────────────────────
// Baileys stores contextInfo in different places depending on message type.
// We try all known locations so .tagall, .pin, .delete work on any reply. — AYOCODES
function getReplyContext(message) {
  const msg = message?.message;
  if (!msg) return null;
  return (
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.audioMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    msg.stickerMessage?.contextInfo ||
    msg.buttonsResponseMessage?.contextInfo ||
    null
  );
}

// Build a forwardable key+message object from contextInfo. — AYOCODES
function buildQuotedMsg(from, ctx, sock) {
  if (!ctx?.stanzaId || !ctx?.quotedMessage) return null;
  return {
    key: {
      remoteJid: from,
      fromMe: normalizeNum(ctx.participant) === normalizeNum(sock.user?.id),
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: ctx.quotedMessage,
  };
}

// ─── MUTE ─────────────────────────────────────────────────────────────────────
export async function mute({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    await sock.groupSettingUpdate(from, "announcement");

    const s = groupSettings.get(from) || {};
    s.muted = true;
    s.mutedBy = userJid;
    s.mutedAt = Date.now();
    groupSettings.set(from, s);
    saveGroupSettings();
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: gSuccess(
        "GROUP MUTED",
        `🔇 Only admins can now send messages.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, { text: gError("MUTE FAILED", err.message) });
  }
}

// ─── UNMUTE ───────────────────────────────────────────────────────────────────
export async function unmute({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    await sock.groupSettingUpdate(from, "not_announcement");

    const s = groupSettings.get(from) || {};
    s.muted = false;
    s.unmutedBy = userJid;
    s.unmutedAt = Date.now();
    groupSettings.set(from, s);
    saveGroupSettings();
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: gSuccess(
        "GROUP UNMUTED",
        `🔊 All members can now send messages.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("UNMUTE FAILED", err.message),
    });
  }
}

// ─── FIXED: LOCK (restrict group-info edits to admins only) ─────────────────────────
export async function lock({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    // FIXED: Correct Baileys value for restricting group info edits
    await sock.groupSettingUpdate(from, "locked");

    await sock.sendMessage(from, {
      text: gSuccess(
        "GROUP LOCKED",
        `🔒 Group info editing (name, icon, description) is now restricted to admins only.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, { text: gError("LOCK FAILED", err.message) });
  }
}

// ─── FIXED: UNLOCK (allow all members to edit group info) ────────────────────────────
export async function unlock({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    // FIXED: Correct Baileys value for allowing all members to edit group info
    await sock.groupSettingUpdate(from, "unlocked");

    await sock.sendMessage(from, {
      text: gSuccess(
        "GROUP UNLOCKED",
        `🔓 All members can now edit group info.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("UNLOCK FAILED", err.message),
    });
  }
}

// ─── ANTI-LINK ────────────────────────────────────────────────────────────────
export async function antiLink({ args, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const cur = groupSettings.get(from)?.antilink ? "ON ✅" : "OFF ❌";
      return sock.sendMessage(from, {
        text: gInfo(
          "ANTI-LINK",
          `Current: *${cur}*\n\n.antilink on  — Enable\n.antilink off — Disable`,
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.antilink = action === "on";
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "ANTI-LINK",
        `🔗 Anti-link ${action === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not toggle anti-link."),
    });
  }
}

// ─── ANTI-SPAM ────────────────────────────────────────────────────────────────
export async function antiSpam({ args, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const cur = groupSettings.get(from)?.antispam ? "ON ✅" : "OFF ❌";
      return sock.sendMessage(from, {
        text: gInfo(
          "ANTI-SPAM",
          `Current: *${cur}*\n\n.antispam on  — Enable\n.antispam off — Disable`,
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.antispam = action === "on";
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "ANTI-SPAM",
        `🚫 Anti-spam ${action === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not toggle anti-spam."),
    });
  }
}

// ─── WELCOME TOGGLE ───────────────────────────────────────────────────────────
export async function welcomeToggle({ args, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const cur = groupSettings.get(from)?.welcome ? "ON ✅" : "OFF ❌";
      const msg = groupSettings.get(from)?.welcomeMessage || "Default";
      return sock.sendMessage(from, {
        text: gInfo(
          "WELCOME",
          `Current: *${cur}*\n📝 Message: ${msg}\n\n.welcome on/off\n.setwelcome <msg>\n\nVars: @user @group @count @date @time`,
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.welcome = action === "on";
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "WELCOME",
        `👋 Welcome ${action === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not toggle welcome."),
    });
  }
}

// ─── SET WELCOME MESSAGE ──────────────────────────────────────────────────────
export async function setWelcome({ fullArgs, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    if (!fullArgs) {
      return sock.sendMessage(from, {
        text: gInfo(
          "SET WELCOME",
          "📌 *Usage:* .setwelcome <message>\n\n" +
            "📋 *Variables:*\n@user @group @count @date @time\n\n" +
            "📋 *Example:*\n.setwelcome Hey @user! Welcome to @group 🎉",
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.welcomeMessage = fullArgs;
    s.welcome = true;
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "WELCOME SET",
        `👋 Welcome message saved & *enabled*.\n\n` +
          `📝 Preview:\n"${fullArgs.substring(0, 150)}${fullArgs.length > 150 ? "..." : ""}"\n\n` +
          `💡 Disable anytime: .welcome off`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not set welcome message."),
    });
  }
}

// ─── GOODBYE TOGGLE ───────────────────────────────────────────────────────────
export async function goodbyeToggle({ args, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const action = args[0]?.toLowerCase();
    if (!action || !["on", "off"].includes(action)) {
      const cur = groupSettings.get(from)?.goodbye ? "ON ✅" : "OFF ❌";
      const msg = groupSettings.get(from)?.goodbyeMessage || "Default";
      return sock.sendMessage(from, {
        text: gInfo(
          "GOODBYE",
          `Current: *${cur}*\n📝 Message: ${msg}\n\n.goodbye on/off\n.setgoodbye <msg>\n\nVars: @user @group @date @time`,
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.goodbye = action === "on";
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "GOODBYE",
        `👋 Goodbye ${action === "on" ? "*ENABLED* ✅" : "*DISABLED* ❌"}\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not toggle goodbye."),
    });
  }
}

// ─── SET GOODBYE MESSAGE ──────────────────────────────────────────────────────
export async function setGoodbye({ fullArgs, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    if (!fullArgs) {
      return sock.sendMessage(from, {
        text: gInfo(
          "SET GOODBYE",
          "📌 *Usage:* .setgoodbye <message>\n\n" +
            "📋 *Variables:*\n@user @group @date @time\n\n" +
            "📋 *Example:*\n.setgoodbye Goodbye @user 👋 We'll miss you!",
        ),
      });
    }

    const s = groupSettings.get(from) || {};
    s.goodbyeMessage = fullArgs;
    s.goodbye = true;
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "GOODBYE SET",
        `👋 Goodbye message saved & *enabled*.\n\n` +
          `📝 Preview:\n"${fullArgs.substring(0, 150)}${fullArgs.length > 150 ? "..." : ""}"\n\n` +
          `💡 Disable anytime: .goodbye off`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not set goodbye message."),
    });
  }
}

// ─── GROUP INFO ───────────────────────────────────────────────────────────────
export async function groupInfo({ from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: gError("GROUP ONLY", "This command only works in groups."),
      });

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata)
      return sock.sendMessage(from, {
        text: gError("ERROR", "Could not fetch group info."),
      });

    const total = metadata.participants.length;
    const admins = metadata.participants.filter((p) => p.admin).length;
    const superAdm = metadata.participants.filter(
      (p) => p.admin === "superadmin",
    ).length;
    const created = metadata.creation
      ? new Date(metadata.creation * 1000).toLocaleString()
      : "Unknown";
    const s = groupSettings.get(from) || {};

    const body =
      `📛 *Group:* ${metadata.subject}\n` +
      `🆔 *ID:* ${from.split("@")[0]}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 *Members:* ${total}\n` +
      `⭐ *Admins:* ${admins} (${superAdm} super)\n` +
      `👑 *Owner:* ${phone(metadata.owner) || "Unknown"}\n` +
      `📅 *Created:* ${created}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 *Edit-Info Restrict:* ${metadata.restrict ? "✅ Admins only" : "❌ All members"}\n` +
      `🔇 *Announce (Muted):* ${metadata.announce ? "✅ Yes" : "❌ No"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Bot Settings*\n` +
      `├─ 🔗 AntiLink: ${s.antilink ? "✅ ON" : "❌ OFF"}\n` +
      `├─ 🚫 AntiSpam: ${s.antispam ? "✅ ON" : "❌ OFF"}\n` +
      `├─ 👋 Welcome:  ${s.welcome ? "✅ ON" : "❌ OFF"}\n` +
      `└─ 👋 Goodbye:  ${s.goodbye ? "✅ ON" : "❌ OFF"}`;

    await sock.sendMessage(from, { text: gSuccess("GROUP INFO", body) });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not fetch group info."),
    });
  }
}

// ─── GROUP RULES ──────────────────────────────────────────────────────────────
export async function rules({ from, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: gError("GROUP ONLY", "This command only works in groups."),
      });

    const s = groupSettings.get(from) || {};
    const text = s.rules || "No rules set.\n\nAdmins: .setrules <rules>";
    await sock.sendMessage(from, {
      text: gInfo("GROUP RULES", `📜\n\n${text}`),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not fetch rules."),
    });
  }
}

// ─── SET RULES ────────────────────────────────────────────────────────────────
export async function setRules({ fullArgs, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    if (!fullArgs)
      return sock.sendMessage(from, {
        text: gInfo(
          "SET RULES",
          "Usage: .setrules <rules>\n\nExample:\n.setrules 1. Be respectful\n2. No spam",
        ),
      });

    const s = groupSettings.get(from) || {};
    s.rules = fullArgs;
    groupSettings.set(from, s);
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess("RULES UPDATED", `📜\n\n${fullArgs}`),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not set rules."),
    });
  }
}

// ─── GROUP LINK ───────────────────────────────────────────────────────────────
export async function link({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    let groupLink = null;

    // Try fetching invite code (requires bot admin). — AYOCODES
    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (botAdmin) {
      try {
        const code = await sock.groupInviteCode(from);
        if (code) groupLink = `https://chat.whatsapp.com/${code}`;
      } catch (_) {}
    }

    // Fallback to metadata inviteCode if available. — AYOCODES
    if (!groupLink) {
      const meta = v.metadata || (await getGroupMetadataCached(from, sock));
      if (meta?.inviteCode)
        groupLink = `https://chat.whatsapp.com/${meta.inviteCode}`;
    }

    if (!groupLink)
      return sock.sendMessage(from, {
        text: gError(
          "LINK UNAVAILABLE",
          "Could not get the group link.\nMake sure I'm promoted to admin.",
        ),
      });

    await sock.sendMessage(from, {
      text: gSuccess(
        "GROUP LINK",
        `🔗 ${groupLink}\n\n👑 Requested by: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not get group link."),
    });
  }
}

// ─── REVOKE LINK ──────────────────────────────────────────────────────────────
export async function revoke({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    await sock.groupRevokeInvite(from);
    clearGroupCache(from);

    await sock.sendMessage(from, {
      text: gSuccess(
        "LINK REVOKED",
        `🔄 Invite link has been reset.\n👑 By: @${phone(userJid)}\n\n💡 Use .link to get the new link.`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not revoke link."),
    });
  }
}

// ─── TAG ALL ──────────────────────────────────────────────────────────────────
// Usage:
//   .tagall                → tag everyone
//   .tagall admins         → tag only admins
//   .tagall members        → tag only non-admins
//   .tagall <message>      → tag everyone with a custom announcement
//   (reply) .tagall        → forwards the replied-to message, then tags
//   (reply) .tagall admins → forwards replied message, then tags admins only
// — AYOCODES
export async function tagAll({ args, fullArgs, message, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    if (!v.metadata)
      return sock.sendMessage(from, {
        text: gError("ERROR", "Could not fetch group members."),
      });

    const allParticipants = v.metadata.participants;

    // ── Determine filter target ──────────────────────────────────────────────
    const sub = args[0]?.toLowerCase();
    let targets, targetLabel, customMsg;

    if (sub === "admins") {
      targets = allParticipants
        .filter((p) => p.admin)
        .map((p) => p.id)
        .filter(Boolean);
      targetLabel = `👑 Admins tagged: *${targets.length}*`;
      customMsg = args.slice(1).join(" ") || null;
    } else if (sub === "members") {
      targets = allParticipants
        .filter((p) => !p.admin)
        .map((p) => p.id)
        .filter(Boolean);
      targetLabel = `👥 Members tagged: *${targets.length}*`;
      customMsg = args.slice(1).join(" ") || null;
    } else {
      targets = allParticipants.map((p) => p.id).filter(Boolean);
      targetLabel = `👥 Everyone tagged: *${targets.length}*`;
      customMsg = fullArgs || null;
    }

    if (targets.length === 0)
      return sock.sendMessage(from, {
        text: gError("TAG ALL", "No matching members found."),
      });

    // ── If this is a reply, forward the quoted message first ─────────────────
    const ctx = getReplyContext(message);
    const quotedMsg = buildQuotedMsg(from, ctx, sock);

    if (quotedMsg) {
      try {
        await sock.sendMessage(from, {
          forward: quotedMsg,
          mentions: targets,
        });
      } catch (_) {
        // Some exotic message types can't be forwarded — skip silently. — AYOCODES
      }
    }

    // ── Send the tag announcement ────────────────────────────────────────────
    const announcement =
      `📢 *Announcement*\n\n` +
      `${customMsg ? `${customMsg}\n\n` : ""}` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${targetLabel}\n` +
      `📣 By: @${phone(userJid)}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text: announcement,
      mentions: targets,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not tag members."),
    });
  }
}

// ─── HIDDEN TAG ───────────────────────────────────────────────────────────────
// Silently pings everyone with an invisible message.
// If used as a reply, the quoted message is forwarded first. — AYOCODES
export async function hideTag({ fullArgs, message, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    if (!v.metadata)
      return sock.sendMessage(from, {
        text: gError("ERROR", "Could not fetch group members."),
      });

    const participants = v.metadata.participants
      .map((p) => p.id)
      .filter(Boolean);

    // Forward quoted message if this is a reply. — AYOCODES
    const ctx = getReplyContext(message);
    const quotedMsg = buildQuotedMsg(from, ctx, sock);

    if (quotedMsg) {
      try {
        await sock.sendMessage(from, {
          forward: quotedMsg,
          mentions: participants,
        });
      } catch (_) {}
    }

    // Send invisible tag. — AYOCODES
    await sock.sendMessage(from, {
      text: fullArgs || "\u200b", // zero-width space = invisible text
      mentions: participants,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not send hidden tag."),
    });
  }
}

// ─── FIXED: PIN MESSAGE ──────────────────────────────────────────────────────────────
// Reply to any message with .pin to pin it in the group. Bot must be admin. — AYOCODES
export async function pin({ message, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const ctx = getReplyContext(message);
    if (!ctx?.stanzaId) {
      return sock.sendMessage(from, {
        text: gInfo(
          "PIN",
          "Reply to a message with *.pin* to pin it in the group.",
        ),
      });
    }

    // FIXED: Proper Baileys pin API syntax
    const key = {
      remoteJid: from,
      fromMe: ctx.participant
        ? normalizeNum(ctx.participant) === normalizeNum(sock.user?.id)
        : false,
      id: ctx.stanzaId,
    };

    // Add participant only if it exists (for messages not sent by bot)
    if (ctx.participant) {
      key.participant = ctx.participant;
    }

    await sock.sendMessage(from, {
      pin: {
        key: key,
        type: 1, // 1 = pin
        time: 604800, // 7 days in seconds
      },
    });

    await sock.sendMessage(from, {
      text: gSuccess(
        "MESSAGE PINNED",
        `📌 Message pinned for 7 days.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    console.error("Pin error:", err);
    await sock.sendMessage(from, {
      text: gError(
        "PIN FAILED",
        `${err.message}\n\nMake sure I am a group admin and the message exists.`,
      ),
    });
  }
}

// ─── FIXED: UNPIN MESSAGE ────────────────────────────────────────────────────────────
// Reply to a pinned message with .unpin to remove the pin. — AYOCODES
export async function unpin({ message, from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "botAdmin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const ctx = getReplyContext(message);
    if (!ctx?.stanzaId) {
      return sock.sendMessage(from, {
        text: gInfo(
          "UNPIN",
          "Reply to a pinned message with *.unpin* to remove the pin.",
        ),
      });
    }

    // FIXED: Proper Baileys unpin syntax
    const key = {
      remoteJid: from,
      fromMe: ctx.participant
        ? normalizeNum(ctx.participant) === normalizeNum(sock.user?.id)
        : false,
      id: ctx.stanzaId,
    };

    // Add participant only if it exists
    if (ctx.participant) {
      key.participant = ctx.participant;
    }

    await sock.sendMessage(from, {
      pin: {
        key: key,
        type: 0, // 0 = unpin
        time: 0,
      },
    });

    await sock.sendMessage(from, {
      text: gSuccess(
        "MESSAGE UNPINNED",
        `📌 Message unpinned.\n👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    console.error("Unpin error:", err);
    await sock.sendMessage(from, {
      text: gError(
        "UNPIN FAILED",
        `${err.message}\n\nMake sure I am a group admin and the message is pinned.`,
      ),
    });
  }
}

// ─── DELETE MESSAGE ───────────────────────────────────────────────────────────
export async function deleteMsg({ message, from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: gError("GROUP ONLY", "This command only works in groups."),
      });

    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    const ctx = getReplyContext(message);
    if (!ctx?.stanzaId)
      return sock.sendMessage(from, {
        text: gInfo("DELETE", "Reply to a message with .delete to remove it."),
      });

    const key = {
      remoteJid: from,
      fromMe: ctx.participant
        ? normalizeNum(ctx.participant) === normalizeNum(sock.user?.id)
        : false,
      id: ctx.stanzaId,
      participant: ctx.participant,
    };

    await sock.sendMessage(from, {
      delete: key,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("DELETE FAILED", err.message),
    });
  }
}

// ─── SETTINGS OVERVIEW ───────────────────────────────────────────────────────
// Prints a full dashboard of all current bot settings for this group. — AYOCODES
export async function settingsOverview({ from, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: gError("GROUP ONLY", "This command only works in groups."),
      });

    const s = groupSettings.get(from) || {};
    const metadata = await getGroupMetadataCached(from, sock);
    const name = metadata?.subject || "This Group";

    const on = (val) => (val ? "✅ ON " : "❌ OFF");
    const msg = (val) =>
      val
        ? `"${String(val).substring(0, 60)}${String(val).length > 60 ? "…" : ""}"`
        : "_Not set_";

    const body =
      `📛 *${name}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔇 *Mute:*     ${on(s.muted)}\n` +
      `🔗 *AntiLink:* ${on(s.antilink)}\n` +
      `🚫 *AntiSpam:* ${on(s.antispam)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👋 *Welcome:*  ${on(s.welcome)}\n` +
      `   └─ Msg: ${msg(s.welcomeMessage)}\n` +
      `👋 *Goodbye:*  ${on(s.goodbye)}\n` +
      `   └─ Msg: ${msg(s.goodbyeMessage)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📜 *Rules:*    ${s.rules ? "✅ Set" : "❌ Not set"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 Use .groupinfo for full group & member details.`;

    await sock.sendMessage(from, { text: gInfo("BOT SETTINGS", body) });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not fetch settings."),
    });
  }
}

// ─── RESET SETTINGS ───────────────────────────────────────────────────────────
// Clears all bot settings for the group back to factory defaults. — AYOCODES
export async function resetSettings({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    groupSettings.set(from, {});
    saveGroupSettings();

    await sock.sendMessage(from, {
      text: gSuccess(
        "SETTINGS RESET",
        `🗑️ All bot settings for this group have been cleared.\n\n` +
          `AntiLink: ❌ OFF\n` +
          `AntiSpam: ❌ OFF\n` +
          `Welcome:  ❌ OFF\n` +
          `Goodbye:  ❌ OFF\n` +
          `Rules:    cleared\n\n` +
          `👑 By: @${phone(userJid)}`,
      ),
      mentions: [userJid],
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: gError("ERROR", "Could not reset settings."),
    });
  }
}

// ─── LEAVE GROUP ──────────────────────────────────────────────────────────────
export async function leave({ from, userJid, sock }) {
  try {
    const v = await validateGroupCommand(from, userJid, sock, "admin");
    if (!v.success) return sock.sendMessage(from, { text: v.error });

    await sock.sendMessage(from, {
      text: `👋 *Goodbye everyone!*\n\nLeaving as requested by @${phone(userJid)} 🤖\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      mentions: [userJid],
    });
    await new Promise((r) => setTimeout(r, 2000));
    await sock.groupLeave(from);
  } catch (err) {
    console.error("leave error:", err.message);
  }
}

// ─── DEBUG ────────────────────────────────────────────────────────────────────
export async function debug({ from, userJid, sock }) {
  try {
    if (!from.endsWith("@g.us"))
      return sock.sendMessage(from, {
        text: gError("GROUP ONLY", "This command only works in groups."),
      });

    const metadata = await getGroupMetadataCached(from, sock);
    const botNum = normalizeNum(sock.user?.id || "");
    const userNum = normalizeNum(userJid);
    const botPart = metadata?.participants?.find(
      (p) => normalizeNum(p.id) === botNum,
    );
    const userPart = metadata?.participants?.find(
      (p) => normalizeNum(p.id) === userNum,
    );
    const s = groupSettings.get(from) || {};

    const body =
      `📛 *Group:* ${metadata?.subject || "Unknown"}\n` +
      `👥 *Members:* ${metadata?.participants?.length || 0}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 *BOT (${botNum})*\n` +
      `├─ Admin: ${botPart?.admin ? "✅ Yes" : "❌ No"}\n` +
      `└─ Role:  ${botPart?.admin || "Member"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *YOU (${userNum})*\n` +
      `├─ Group admin:  ${userPart?.admin ? "✅ Yes" : "❌ No"}\n` +
      `├─ Global owner: ${isAdmin(userJid) ? "✅ Yes" : "❌ No"}\n` +
      `└─ Raw JID:      ${userJid}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚙️ *Settings*\n` +
      `├─ AntiLink: ${s.antilink ? "✅" : "❌"}\n` +
      `├─ AntiSpam: ${s.antispam ? "✅" : "❌"}\n` +
      `├─ Welcome:  ${s.welcome ? "✅" : "❌"}\n` +
      `└─ Goodbye:  ${s.goodbye ? "✅" : "❌"}`;

    await sock.sendMessage(from, { text: gSuccess("DEBUG", body) });
  } catch (err) {
    await sock.sendMessage(from, { text: gError("DEBUG ERROR", err.message) });
  }
}
