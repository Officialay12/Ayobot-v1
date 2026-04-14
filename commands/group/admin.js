// commands/group/admin.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Admin Commands — PRODUCTION REWRITE
//  Author: AYOCODES
//
//  FIXES IN THIS FILE:
//
//  1. mode() — CRITICAL CRASH FIX
//     Old code had a dynamic `import("../../index.js")` inside mode() to
//     get sessionMetaCollection. This caused a MODULE_NOT_FOUND crash at
//     runtime because dynamic re-importing ESM modules with side effects
//     is unreliable. Fixed by only using the setMode() helper from context
//     and the session object directly. — AYOCODES
//
//  2. All functions — isAdmin guard uses context.isAdmin (set by
//     commandHandler) so they never run for non-owners regardless of how
//     the command was invoked. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import {
  ENV,
  authorizedUsers,
  bannedUsers,
  botStartTime,
  commandUsage,
  messageCount,
  saveBannedUsers,
  saveGroupSettings,
  saveWarnings,
} from "../../index.js";
import {
  formatError,
  formatInfo,
  formatSuccess,
  formatUptime,
} from "../../utils/formatters.js";

// ============================================================================
//  ADD USER — AYOCODES
// ============================================================================
export async function addUser({
  fullArgs,
  from,
  userJid,
  sock,
  isAdmin,
  session,
}) {
  if (!isAdmin) return;

  const ph = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!ph || ph.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.\nExample: .adduser 2348123456789",
      ),
    });
  }

  const jid = `${ph}@s.whatsapp.net`;
  authorizedUsers.add(jid);
  authorizedUsers.add(ph);
  if (session?.authorizedUsers) {
    session.authorizedUsers.add(jid);
    session.authorizedUsers.add(ph);
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER AUTHORIZED",
      `✅ *${ph}* can now use the bot in private mode.`,
    ),
  });

  try {
    await sock.sendMessage(jid, {
      text:
        `🎉 *Access Granted!*\n\n` +
        `You have been authorized to use *AYOBOT*!\n\n` +
        `Type *${ENV.PREFIX}menu* to explore all features.\n\n` +
        `👑 AYOCODES`,
    });
  } catch (_) {}
}

// ============================================================================
//  REMOVE USER — AYOCODES
// ============================================================================
export async function removeUser({ fullArgs, from, sock, isAdmin, session }) {
  if (!isAdmin) return;

  const ph = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!ph || ph.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.\nExample: .removeuser 2348123456789",
      ),
    });
  }

  const jid = `${ph}@s.whatsapp.net`;
  authorizedUsers.delete(jid);
  authorizedUsers.delete(ph);
  if (session?.authorizedUsers) {
    session.authorizedUsers.delete(jid);
    session.authorizedUsers.delete(ph);
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER REMOVED",
      `✅ *${ph}* has been removed from authorized users.`,
    ),
  });
}

// ============================================================================
//  LIST USERS — AYOCODES
// ============================================================================
export async function listUsers({ from, sock, isAdmin }) {
  if (!isAdmin) return;

  let list = "";
  let count = 0;
  for (const u of authorizedUsers) {
    if (u.includes("@")) {
      list += `▰ ${u.split("@")[0]}\n`;
      count++;
    }
  }

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║   📋 *AUTHORIZED USERS*  ║\n` +
      `╚══════════════════════════╝\n\n` +
      (list || "▰ No authorized users yet") +
      `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 *Total:* ${count}\n` +
      `👑 AYOCODES`,
  });
}

// ============================================================================
//  MODE — AYOCODES
//  FIX: Removed dynamic import of index.js which caused runtime crashes.
//  Uses setMode() helper from context (set by commandHandler) + direct
//  session object mutation as the reliable fallback. — AYOCODES
// ============================================================================
export async function mode({
  fullArgs,
  from,
  sock,
  isAdmin,
  setMode,
  sessionMode,
  session,
}) {
  if (!isAdmin) return;

  const newMode = fullArgs?.trim().toLowerCase();
  const current = sessionMode || session?.mode || ENV.BOT_MODE || "public";

  if (newMode !== "public" && newMode !== "private") {
    return sock.sendMessage(from, {
      text: formatInfo(
        "BOT MODE",
        `Current: *${current.toUpperCase()}*\n\n` +
          `Usage:\n` +
          `${ENV.PREFIX}mode public  — Anyone can use the bot\n` +
          `${ENV.PREFIX}mode private — Only you can use the bot`,
      ),
    });
  }

  // FIX: Use injected setMode helper — no dynamic imports needed — AYOCODES
  if (typeof setMode === "function") {
    await setMode(newMode);
  } else if (session) {
    session.mode = newMode;
  }

  const modeEmoji = newMode === "private" ? "🔒" : "🌐";
  const modeDesc =
    newMode === "private"
      ? "Only *you* can use commands now."
      : "Everyone can use the bot now.";

  await sock.sendMessage(from, {
    text:
      `${modeEmoji} *MODE UPDATED*\n\n` +
      `Bot is now in *${newMode.toUpperCase()}* mode.\n\n` +
      `${modeDesc}\n\n` +
      `👑 AYOCODES`,
  });
}

// ============================================================================
//  BROADCAST — AYOCODES
// ============================================================================
export async function broadcast({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "BROADCAST",
        `Usage: ${ENV.PREFIX}broadcast <message>\nSends to all authorized users.`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: "📢 *Broadcasting to authorized users...*",
  });

  let sent = 0;
  let failed = 0;
  const targets = new Set();

  for (const u of authorizedUsers) {
    const jid = u.includes("@") ? u : `${u}@s.whatsapp.net`;
    if (jid.includes("@s.whatsapp.net")) targets.add(jid);
  }

  const msg =
    `╔══════════════════════════╗\n` +
    `║     📢 *ADMIN BROADCAST*  ║\n` +
    `╚══════════════════════════╝\n\n` +
    `${fullArgs}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 *From:* @${userJid.split("@")[0]}\n` +
    `⏰ *Time:* ${new Date().toLocaleString()}\n` +
    `👑 AYOBOT v1 | Created by AYOCODES`;

  for (const target of targets) {
    try {
      await sock.sendMessage(target, { text: msg, mentions: [userJid] });
      sent++;
      await new Promise((r) => setTimeout(r, 600));
    } catch (_) {
      failed++;
    }
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "BROADCAST DONE",
      `✅ *Sent:* ${sent}\n❌ *Failed:* ${failed}\n👥 *Total targets:* ${targets.size}`,
    ),
  });
}

// ============================================================================
//  GLOBAL BROADCAST — AYOCODES
// ============================================================================
export async function globalBroadcast({
  fullArgs,
  from,
  userJid,
  sock,
  isAdmin,
}) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "GLOBAL BROADCAST",
        `Usage: ${ENV.PREFIX}globalbc <message>\nSends to ALL groups the bot is in.`,
      ),
    });
  }

  await sock.sendMessage(from, { text: "🌍 *Fetching all groups...*" });

  let sent = 0;
  let failed = 0;

  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups);

    await sock.sendMessage(from, {
      text: `🌍 *Found ${list.length} groups. Broadcasting now...*`,
    });

    const msg =
      `╔══════════════════════════╗\n` +
      `║   🌍 *GLOBAL ANNOUNCEMENT* ║\n` +
      `╚══════════════════════════╝\n\n` +
      `${fullArgs}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📢 *From:* @${userJid.split("@")[0]}\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}\n` +
      `👑 AYOBOT v1 | Created by AYOCODES`;

    for (const group of list) {
      try {
        await sock.sendMessage(group.id, { text: msg, mentions: [userJid] });
        sent++;
        if (sent % 10 === 0) {
          await sock.sendMessage(from, {
            text: `📊 *Progress:* ${sent}/${list.length} groups done...`,
          });
        }
        await new Promise((r) => setTimeout(r, 1200));
      } catch (_) {
        failed++;
      }
    }

    await sock.sendMessage(from, {
      text: formatSuccess(
        "GLOBAL BROADCAST DONE",
        `🌍 *Total groups:* ${list.length}\n✅ *Sent:* ${sent}\n❌ *Failed:* ${failed}`,
      ),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("BROADCAST FAILED", err.message),
    });
  }
}

// ============================================================================
//  STATS — AYOCODES
// ============================================================================
export async function stats({ from, userJid, sock, isAdmin, session }) {
  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: formatError("ACCESS DENIED", "This command is for admins only."),
    });
  }

  const mem = process.memoryUsage();
  const current = session?.mode || ENV.BOT_MODE || "public";
  let groupCount = 0;

  try {
    const groups = await sock.groupFetchAllParticipating();
    groupCount = Object.keys(groups).length;
  } catch (_) {}

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║      📊 *BOT STATS*       ║\n` +
      `╚══════════════════════════╝\n\n` +
      `⏱️ *Uptime:* ${formatUptime(Date.now() - botStartTime)}\n` +
      `📨 *Messages Processed:* ${messageCount}\n` +
      `⚡ *Unique Users:* ${commandUsage.size}\n` +
      `👤 *Authorized:* ${authorizedUsers.size}\n` +
      `🚫 *Banned:* ${bannedUsers.size}\n` +
      `👥 *Groups:* ${groupCount}\n` +
      `🤖 *Mode:* ${current.toUpperCase()}\n` +
      `💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB\n` +
      `⚡ *CPU Time:* ${(process.cpuUsage().user / 1_000_000).toFixed(2)}s\n` +
      `🔧 *Node.js:* ${process.version}\n` +
      `🤖 *Platform:* ${process.platform}\n` +
      `📦 *PID:* ${process.pid}\n\n` +
      `🔋 *Arc Reactor:* ██████████ 100%\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 *Admin:* @${userJid.split("@")[0]}\n` +
      `⚡ AYOBOT v1 | Created by AYOCODES`,
    mentions: [userJid],
  });
}

// ============================================================================
//  SUPER BAN — AYOCODES
// ============================================================================
export async function superBan({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "SUPER BAN",
        `Usage: ${ENV.PREFIX}superban <phone> [reason]\nExample: ${ENV.PREFIX}superban 2348123456789 Spamming`,
      ),
    });
  }

  const parts = fullArgs.trim().split(/\s+/);
  const ph = parts[0].replace(/[^0-9]/g, "");
  const reason = parts.slice(1).join(" ") || "Banned by admin";

  if (!ph || ph.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.",
      ),
    });
  }

  if (ph === userJid.split("@")[0] || ph === ENV.ADMIN) {
    return sock.sendMessage(from, {
      text: formatError("INVALID ACTION", "You cannot ban the bot owner."),
    });
  }

  const jid = `${ph}@s.whatsapp.net`;

  if (bannedUsers.has(jid)) {
    return sock.sendMessage(from, {
      text: formatInfo("ALREADY BANNED", `*${ph}* is already banned.`),
    });
  }

  authorizedUsers.delete(jid);
  authorizedUsers.delete(ph);
  bannedUsers.set(jid, {
    bannedBy: userJid,
    time: Date.now(),
    reason,
    phone: ph,
  });
  saveBannedUsers();

  try {
    await sock.sendMessage(jid, {
      text:
        `╔══════════════════════════╗\n` +
        `║        🚫 *BANNED*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `You have been banned from using *AYOBOT*.\n\n` +
        `📝 *Reason:* ${reason}\n` +
        `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Contact the bot admin to appeal.\n` +
        `👑 AYOCODES`,
    });
  } catch (_) {}

  await sock.sendMessage(from, {
    text: formatSuccess(
      "SUPER BAN EXECUTED",
      `🚫 *${ph}* has been banned.\n📝 *Reason:* ${reason}`,
    ),
  });
}

// ============================================================================
//  UNBAN — AYOCODES
// ============================================================================
export async function unban({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  const ph = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!ph || ph.length < 10) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "UNBAN",
        `Usage: ${ENV.PREFIX}unban <phone>\nExample: ${ENV.PREFIX}unban 2348123456789`,
      ),
    });
  }

  const jid = `${ph}@s.whatsapp.net`;
  let removed = false;

  if (bannedUsers.has(jid)) {
    bannedUsers.delete(jid);
    removed = true;
  }

  for (const key of bannedUsers.keys()) {
    if (key.includes(ph)) {
      bannedUsers.delete(key);
      removed = true;
    }
  }

  if (removed) {
    saveBannedUsers();
    await sock.sendMessage(from, {
      text: formatSuccess("USER UNBANNED", `✅ *${ph}* has been unbanned.`),
    });
  } else {
    await sock.sendMessage(from, {
      text: formatInfo("NOT FOUND", `*${ph}* is not in the ban list.`),
    });
  }
}

// ============================================================================
//  LIST BANNED — AYOCODES
// ============================================================================
export async function listBanned({ from, sock, isAdmin }) {
  if (!isAdmin) return;

  if (bannedUsers.size === 0) {
    return sock.sendMessage(from, {
      text: formatInfo("BANNED USERS", "✅ No users are currently banned."),
    });
  }

  let text =
    `╔══════════════════════════╗\n` +
    `║   🚫 *BANNED USERS*      ║\n` +
    `╚══════════════════════════╝\n\n`;
  let index = 1;

  for (const [jid, data] of bannedUsers.entries()) {
    const ph = jid.split("@")[0];
    const when = data.time ? new Date(data.time).toLocaleString() : "Unknown";
    const by = data.bannedBy?.split("@")[0] || "Unknown";
    text +=
      `*${index}.* 📱 ${ph}\n` +
      `   📝 *Reason:* ${data.reason || "No reason given"}\n` +
      `   👑 *By:* ${by}\n` +
      `   ⏰ *When:* ${when}\n\n`;
    index++;
  }

  text +=
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Total banned:* ${bannedUsers.size}\n` +
    `👑 AYOCODES`;

  if (text.length > 4000) {
    const chunks = text.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      await sock.sendMessage(from, { text: chunk });
      await new Promise((r) => setTimeout(r, 300));
    }
  } else {
    await sock.sendMessage(from, { text });
  }
}

// ============================================================================
//  CLEAR BANS — AYOCODES
// ============================================================================
export async function clearBans({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  const count = bannedUsers.size;
  if (count === 0) {
    return sock.sendMessage(from, {
      text: formatInfo("BANS CLEARED", "There are no banned users to clear."),
    });
  }

  bannedUsers.clear();
  saveBannedUsers();

  await sock.sendMessage(from, {
    text: formatSuccess(
      "BANS CLEARED",
      `✅ Cleared *${count}* banned users.\n\n👑 @${userJid.split("@")[0]}`,
    ),
    mentions: [userJid],
  });
}

// ============================================================================
//  RESTART — AYOCODES
// ============================================================================
export async function restart({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║      🔄 *RESTARTING*      ║\n` +
      `╚══════════════════════════╝\n\n` +
      `🔄 *Bot is restarting...*\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}\n` +
      `👑 *By:* @${userJid.split("@")[0]}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ Will be back online in seconds.\n` +
      `👑 AYOCODES`,
    mentions: [userJid],
  });

  try {
    saveWarnings();
  } catch (_) {}
  try {
    saveBannedUsers();
  } catch (_) {}
  try {
    saveGroupSettings();
  } catch (_) {}

  await new Promise((r) => setTimeout(r, 2000));
  process.exit(0);
}

// ============================================================================
//  SHUTDOWN — AYOCODES
// ============================================================================
export async function shutdown({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║      ⛔ *SHUTTING DOWN*    ║\n` +
      `╚══════════════════════════╝\n\n` +
      `🛑 *Bot is shutting down...*\n` +
      `⏰ *Time:* ${new Date().toLocaleString()}\n` +
      `👑 *By:* @${userJid.split("@")[0]}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ *Manual restart required.*\n` +
      `👑 AYOCODES`,
    mentions: [userJid],
  });

  try {
    saveWarnings();
  } catch (_) {}
  try {
    saveBannedUsers();
  } catch (_) {}
  try {
    saveGroupSettings();
  } catch (_) {}

  await new Promise((r) => setTimeout(r, 2000));
  process.exit(1);
}

// ============================================================================
//  BOT STATUS — AYOCODES
// ============================================================================
export async function botStatus({ from, userJid, sock, isAdmin, session }) {
  if (!isAdmin) return;

  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const mode = session?.mode || ENV.BOT_MODE || "public";
  let groupCount = 0;

  try {
    const groups = await sock.groupFetchAllParticipating();
    groupCount = Object.keys(groups).length;
  } catch (_) {}

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║      📊 *BOT STATUS*      ║\n` +
      `╚══════════════════════════╝\n\n` +
      `⏱️ *Uptime:* ${d}d ${h}h ${m}m ${s}s\n` +
      `📨 *Messages:* ${messageCount}\n` +
      `⚡ *Unique Users:* ${commandUsage.size}\n` +
      `👤 *Authorized:* ${authorizedUsers.size}\n` +
      `🚫 *Banned:* ${bannedUsers.size}\n` +
      `👥 *Groups:* ${groupCount}\n` +
      `🤖 *Mode:* ${mode.toUpperCase()}\n` +
      `💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB\n` +
      `⚡ *CPU Time:* ${(process.cpuUsage().user / 1_000_000).toFixed(2)}s\n` +
      `🔧 *Node.js:* ${process.version}\n` +
      `🤖 *Platform:* ${process.platform}\n` +
      `📦 *PID:* ${process.pid}\n\n` +
      `🔋 *Arc Reactor:* ██████████ 100%\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 *Admin:* @${userJid.split("@")[0]}\n` +
      `⚡ AYOBOT v1 | Created by AYOCODES`,
    mentions: [userJid],
  });
}

// ============================================================================
//  ADMIN EVAL — AYOCODES
// ============================================================================
export async function adminEval({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "EVAL",
        `Usage: ${ENV.PREFIX}eval <code>\n⚠️ *Dangerous — admin only!*`,
      ),
    });
  }

  await sock.sendMessage(from, { text: "⚡ *Executing...*" });

  try {
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction("sock", "ENV", "from", fullArgs);
    const result = await fn(sock, ENV, from);
    const output =
      typeof result === "object"
        ? JSON.stringify(result, null, 2)
        : String(result ?? "undefined");

    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║     ⚡ *EVAL RESULT*      ║\n` +
        `╚══════════════════════════╝\n\n` +
        `\`\`\`js\n${output.substring(0, 3500)}${output.length > 3500 ? "\n\n... (truncated)" : ""}\n\`\`\``,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║     ❌ *EVAL ERROR*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `\`\`\`\n${err.message}\n\`\`\``,
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT — AYOCODES
// ============================================================================
export default {
  addUser,
  removeUser,
  listUsers,
  mode,
  broadcast,
  globalBroadcast,
  stats,
  superBan,
  unban,
  listBanned,
  clearBans,
  restart,
  shutdown,
  botStatus,
  adminEval,
};
