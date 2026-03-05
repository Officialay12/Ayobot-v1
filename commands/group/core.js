// commands/group/core.js - FIXED + COMPLETE
import { ENV, groupMetadataCache } from "../../index.js";
import {
  formatGroupError,
  formatGroupInfo,
  formatGroupSuccess,
} from "../../utils/formatters.js";
import {
  clearAdminCache,
  extractTargetUser,
  getGroupMetadataCached,
  isGroupAdminCached,
  validateGroupCommand,
} from "../../utils/validators.js";

// ========== SAFE HELPERS ==========
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

function safePhone(participant) {
  const jid = safeJid(participant);
  return jid.split("@")[0] || jid;
}

// ========== KICK MEMBER ==========
export async function kick({ args, message, from, userJid, sock }) {
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
          "KICK",
          "Usage: Reply to a message with .kick or type .kick @user",
        ),
      });
    }

    const targetJid = safeJid(target.jid || target);
    const targetPhone = target.phone || safePhone(targetJid);

    // Don't kick self
    if (targetJid === sock.user?.id) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT KICK BOT", "I cannot kick myself."),
      });
    }

    // Don't kick bot owner
    if (targetJid === `${ENV.ADMIN}@s.whatsapp.net`) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT KICK", "Cannot kick the bot owner."),
      });
    }

    // Don't kick admins
    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock);
    if (targetIsAdmin) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "CANNOT KICK ADMIN",
          "Cannot kick a group admin.",
        ),
      });
    }

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

    clearAdminCache(from, targetJid);
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "KICKED",
        `👢 *User:* @${targetPhone}\n👑 *By:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Kick error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("KICK FAILED", error.message),
    });
  }
}

// ========== ADD MEMBER ==========
export async function add({ args, from, userJid, sock }) {
  try {
    const validation = await validateGroupCommand(from, userJid, sock, "admin");
    if (!validation.success)
      return sock.sendMessage(from, { text: validation.error });

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "ADD",
          "Usage: .add <phone>\nExample: .add 2348123456789",
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

    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "add");
    } catch (addErr) {
      let errorMsg = "Could not add user.";
      const msg = addErr.message || "";
      if (msg.includes("403"))
        errorMsg =
          "❌ User has privacy settings blocking adds. Use .link instead.";
      else if (msg.includes("409"))
        errorMsg = "❌ User is already in the group.";
      else if (msg.includes("408"))
        errorMsg = "❌ Invite required. Use .link to share the group link.";
      else if (msg.includes("500"))
        errorMsg = "❌ User does not have WhatsApp or number is invalid.";
      else errorMsg = `❌ ${msg}`;

      return sock.sendMessage(from, {
        text: formatGroupError("ADD FAILED", errorMsg),
      });
    }

    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "ADDED",
        `➕ *User:* @${phone}\n👑 *By:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Add error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("ADD FAILED", error.message),
    });
  }
}

// ========== PROMOTE TO ADMIN ==========
export async function promote({ args, message, from, userJid, sock }) {
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
          "PROMOTE",
          "Usage: Reply with .promote or .promote @user",
        ),
      });
    }

    const targetJid = safeJid(target.jid || target);
    const targetPhone = target.phone || safePhone(targetJid);

    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock);
    if (targetIsAdmin) {
      return sock.sendMessage(from, {
        text: formatGroupInfo(
          "ALREADY ADMIN",
          `@${targetPhone} is already an admin.`,
        ),
        mentions: [targetJid],
      });
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "promote");
    } catch (promoteErr) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "PROMOTE FAILED",
          `Could not promote user: ${promoteErr.message}`,
        ),
      });
    }

    clearAdminCache(from, targetJid);
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "PROMOTED",
        `⭐ *User:* @${targetPhone}\n👑 *By:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Promote error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("PROMOTE FAILED", error.message),
    });
  }
}

// ========== DEMOTE FROM ADMIN ==========
export async function demote({ args, message, from, userJid, sock }) {
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
          "DEMOTE",
          "Usage: Reply with .demote or .demote @user",
        ),
      });
    }

    const targetJid = safeJid(target.jid || target);
    const targetPhone = target.phone || safePhone(targetJid);

    // Don't demote bot owner
    if (targetJid === `${ENV.ADMIN}@s.whatsapp.net`) {
      return sock.sendMessage(from, {
        text: formatGroupError("CANNOT DEMOTE", "Cannot demote the bot owner."),
      });
    }

    const targetIsAdmin = await isGroupAdminCached(from, targetJid, sock);
    if (!targetIsAdmin) {
      return sock.sendMessage(from, {
        text: formatGroupInfo("NOT ADMIN", `@${targetPhone} is not an admin.`),
        mentions: [targetJid],
      });
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetJid], "demote");
    } catch (demoteErr) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "DEMOTE FAILED",
          `Could not demote user: ${demoteErr.message}`,
        ),
      });
    }

    clearAdminCache(from, targetJid);
    groupMetadataCache.delete(from);

    await sock.sendMessage(from, {
      text: formatGroupSuccess(
        "DEMOTED",
        `⬇️ *User:* @${targetPhone}\n👑 *By:* @${safePhone(userJid)}`,
      ),
      mentions: [targetJid, userJid],
    });
  } catch (error) {
    console.error("Demote error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("DEMOTE FAILED", error.message),
    });
  }
}

// ========== LIST ADMINS ==========
export async function listAdmins({ from, sock }) {
  try {
    if (!from.endsWith("@g.us")) {
      return sock.sendMessage(from, {
        text: formatGroupError(
          "GROUP ONLY",
          "This command only works in groups.",
        ),
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: formatGroupError("ERROR", "Could not fetch group information."),
      });
    }

    const admins = metadata.participants?.filter((p) => p.admin) || [];

    if (!admins.length) {
      return sock.sendMessage(from, {
        text: formatGroupInfo("ADMINS", "No admins found in this group."),
      });
    }

    let adminList = `⭐ *Group Admins (${admins.length})*\n\n`;
    admins.forEach((admin, i) => {
      const type = admin.admin === "superadmin" ? "👑 Owner" : "🔰 Admin";
      const phone = safePhone(admin.id || admin);
      adminList += `${i + 1}. ${type}: @${phone}\n`;
    });

    await sock.sendMessage(from, {
      text: formatGroupSuccess("ADMIN LIST", adminList),
      mentions: admins.map((a) => safeJid(a.id || a)).filter(Boolean),
    });
  } catch (error) {
    console.error("List admins error:", error.message);
    await sock.sendMessage(from, {
      text: formatGroupError("ERROR", "Could not fetch admin list."),
    });
  }
}
