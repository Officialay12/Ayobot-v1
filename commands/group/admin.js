// commands/group/admin.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Admin Commands (Clean Rewrite)
//  Author  : AYOCODES
//  Contact : wa.me/2349159180375
//
//  FIXES IN THIS VERSION:
//    - mode(): Now changes PER-SESSION mode via setMode() helper
//      instead of mutating the global ENV.BOT_MODE which affected everyone.
//    - addUser/removeUser: Now uses per-session authorizedUsers set
//      in addition to the global one for backwards compatibility.
//    - All functions: clean, no obfuscation, proper error messages.
//  — AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import {
  ENV,
  authorizedUsers,
  bannedUsers,
  botStartTime,
  commandUsage,
  messageCount,
} from "../../index.js";
import {
  saveBannedUsers,
  saveGroupSettings,
  saveWarnings,
} from "../../utils/database.js";
import {
  formatError,
  formatInfo,
  formatSuccess,
  formatUptime,
} from "../../utils/formatters.js";

// ════════════════════════════════════════════════════════════════════════════
//  ADD USER — Whitelist a user so they can use the bot in private mode
// ════════════════════════════════════════════════════════════════════════════
export async function addUser({
  fullArgs,
  from,
  userJid,
  sock,
  isAdmin,
  session,
}) {
  if (!isAdmin) return;

  const phone = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!phone || phone.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.\nExample: .adduser 2348123456789",
      ),
    });
  }

  const jid = `${phone}@s.whatsapp.net`;

  // Add to global set (backwards compat) + per-session set. — AYOCODES
  authorizedUsers.add(jid);
  authorizedUsers.add(phone);
  if (session?.authorizedUsers) {
    session.authorizedUsers.add(jid);
    session.authorizedUsers.add(phone);
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER AUTHORIZED",
      `✅ *${phone}* can now use the bot in private mode.`,
    ),
  });

  // Notify the newly authorized user. — AYOCODES
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

// ════════════════════════════════════════════════════════════════════════════
//  REMOVE USER — Remove from whitelist
// ════════════════════════════════════════════════════════════════════════════
export async function removeUser({ fullArgs, from, sock, isAdmin, session }) {
  if (!isAdmin) return;

  const phone = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!phone || phone.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.\nExample: .removeuser 2348123456789",
      ),
    });
  }

  const jid = `${phone}@s.whatsapp.net`;

  authorizedUsers.delete(jid);
  authorizedUsers.delete(phone);
  if (session?.authorizedUsers) {
    session.authorizedUsers.delete(jid);
    session.authorizedUsers.delete(phone);
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER REMOVED",
      `✅ *${phone}* has been removed from authorized users.`,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  LIST USERS — Show all authorized users
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  MODE — THE FIX
//  Old code: ENV.BOT_MODE = newMode → changed global, affected ALL sessions.
//  New code: setMode(newMode) → changes only THIS user's session. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
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

  // Use the setMode helper injected by commandHandler.js — AYOCODES
  // This updates session.mode AND persists to MongoDB.
  if (typeof setMode === "function") {
    await setMode(newMode);
  } else if (session) {
    // Fallback: directly set on session object if setMode not available. — AYOCODES
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

// ════════════════════════════════════════════════════════════════════════════
//  BROADCAST — Send message to all authorized users
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  GLOBAL BROADCAST — Send to ALL groups the bot is in
// ════════════════════════════════════════════════════════════════════════════
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
        `Usage: ${ENV.PREFIX}globalbroadcast <message>\nSends to ALL groups the bot is in.`,
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
        // Progress update every 10 groups. — AYOCODES
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

// ════════════════════════════════════════════════════════════════════════════
//  STATS — Full bot statistics
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  SUPER BAN — Permanently ban a user from using the bot
// ════════════════════════════════════════════════════════════════════════════
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
  const phone = parts[0].replace(/[^0-9]/g, "");
  const reason = parts.slice(1).join(" ") || "Banned by admin";

  if (!phone || phone.length < 10) {
    return sock.sendMessage(from, {
      text: formatError(
        "INVALID NUMBER",
        "Please provide a valid phone number.",
      ),
    });
  }

  // Prevent banning self. — AYOCODES
  if (phone === userJid.split("@")[0] || phone === ENV.ADMIN) {
    return sock.sendMessage(from, {
      text: formatError("INVALID ACTION", "You cannot ban the bot owner."),
    });
  }

  const jid = `${phone}@s.whatsapp.net`;

  if (bannedUsers.has(jid)) {
    return sock.sendMessage(from, {
      text: formatInfo("ALREADY BANNED", `*${phone}* is already banned.`),
    });
  }

  authorizedUsers.delete(jid);
  authorizedUsers.delete(phone);
  bannedUsers.set(jid, {
    bannedBy: userJid,
    time: Date.now(),
    reason,
    phone,
  });
  saveBannedUsers();

  // Notify the banned user. — AYOCODES
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
      `🚫 *${phone}* has been banned.\n📝 *Reason:* ${reason}`,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  UNBAN — Remove a user from the ban list
// ════════════════════════════════════════════════════════════════════════════
export async function unban({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  const phone = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!phone || phone.length < 10) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "UNBAN",
        `Usage: ${ENV.PREFIX}unban <phone>\nExample: ${ENV.PREFIX}unban 2348123456789`,
      ),
    });
  }

  const jid = `${phone}@s.whatsapp.net`;
  let removed = false;

  if (bannedUsers.has(jid)) {
    bannedUsers.delete(jid);
    removed = true;
  }

  // Also check partial matches. — AYOCODES
  for (const key of bannedUsers.keys()) {
    if (key.includes(phone)) {
      bannedUsers.delete(key);
      removed = true;
    }
  }

  if (removed) {
    saveBannedUsers();
    await sock.sendMessage(from, {
      text: formatSuccess("USER UNBANNED", `✅ *${phone}* has been unbanned.`),
    });
  } else {
    await sock.sendMessage(from, {
      text: formatInfo("NOT FOUND", `*${phone}* is not in the ban list.`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LIST BANNED — Show all banned users
// ════════════════════════════════════════════════════════════════════════════
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
    const phone = jid.split("@")[0];
    const when = data.time ? new Date(data.time).toLocaleString() : "Unknown";
    const byPhone = data.bannedBy?.split("@")[0] || "Unknown";
    text +=
      `*${index}.* 📱 ${phone}\n` +
      `   📝 *Reason:* ${data.reason || "No reason given"}\n` +
      `   👑 *By:* ${byPhone}\n` +
      `   ⏰ *When:* ${when}\n\n`;
    index++;
  }

  text +=
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Total banned:* ${bannedUsers.size}\n` +
    `👑 AYOCODES`;

  // Split long messages. — AYOCODES
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

// ════════════════════════════════════════════════════════════════════════════
//  CLEAR BANS — Remove all bans
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  RESTART — Graceful restart
// ════════════════════════════════════════════════════════════════════════════
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

  // Save everything before exit. — AYOCODES
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

// ════════════════════════════════════════════════════════════════════════════
//  SHUTDOWN — Stop the bot completely
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  BOT STATUS — Detailed system status
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN EVAL — Execute code (dangerous, admin only)
// ════════════════════════════════════════════════════════════════════════════
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
    const fn = new AsyncFunction("sock", "ENV", fullArgs);
    const result = await fn(sock, ENV);
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
