// commands/group/admin.js - COMPLETE FIXED VERSION
import path from "path";
import { fileURLToPath } from "url";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== ADD USER (AUTHORIZE) ==========
export async function addUser({ fullArgs, from, userJid, sock, isAdmin }) {
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

  const targetJid = `${phone}@s.whatsapp.net`;
  authorizedUsers.add(targetJid);
  authorizedUsers.add(phone);

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER AUTHORIZED",
      `✅ *${phone}* can now use the bot in private mode.`,
    ),
  });

  try {
    await sock.sendMessage(targetJid, {
      text: formatSuccess(
        "ACCESS GRANTED",
        `🎉 You have been authorized to use *AYOBOT*!\n\nType *.menu* to explore all features.\n\n👑 AYOCODES`,
      ),
    });
  } catch (_) {}
}

// ========== REMOVE USER ==========
export async function removeUser({ fullArgs, from, sock, isAdmin }) {
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

  const targetJid = `${phone}@s.whatsapp.net`;
  authorizedUsers.delete(targetJid);
  authorizedUsers.delete(phone);

  await sock.sendMessage(from, {
    text: formatSuccess(
      "USER REMOVED",
      `❌ *${phone}* has been removed from authorized users.`,
    ),
  });
}

// ========== LIST USERS ==========
export async function listUsers({ from, sock, isAdmin }) {
  if (!isAdmin) return;

  let userList = "";
  let count = 0;

  for (const user of authorizedUsers) {
    if (user.includes("@")) {
      const phone = user.split("@")[0];
      userList += `▰ ${phone}\n`;
      count++;
    }
  }

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗
║   📋 *AUTHORIZED USERS*  ║
╚══════════════════════════╝

${userList || "▰ No authorized users yet"}

━━━━━━━━━━━━━━━━━━━━━
👥 *Total:* ${count}
👑 Created by AYOCODES`,
  });
}

// ========== CHANGE BOT MODE ==========
export async function mode({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  const newMode = fullArgs?.trim().toLowerCase();

  if (newMode !== "public" && newMode !== "private") {
    return sock.sendMessage(from, {
      text: formatInfo(
        "BOT MODE",
        `Current: *${ENV.BOT_MODE.toUpperCase()}*\n\nUsage:\n.mode public\n.mode private`,
      ),
    });
  }

  ENV.BOT_MODE = newMode;
  await sock.sendMessage(from, {
    text: formatSuccess(
      "MODE UPDATED",
      `Bot is now in *${newMode.toUpperCase()}* mode.`,
    ),
  });
}

// ========== BROADCAST ==========
export async function broadcast({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "BROADCAST",
        "Usage: .broadcast <message>\nSends to all authorized users.",
      ),
    });
  }

  await sock.sendMessage(from, {
    text: "📢 *Broadcasting to authorized users...*",
  });

  let sent = 0;
  let failed = 0;
  const uniqueUsers = new Set();

  for (const user of authorizedUsers) {
    const jid = user.includes("@") ? user : `${user}@s.whatsapp.net`;
    if (jid.includes("@s.whatsapp.net")) uniqueUsers.add(jid);
  }

  const broadcastMsg = `╔══════════════════════════╗
║     📢 *ADMIN BROADCAST*  ║
╚══════════════════════════╝

${fullArgs}

━━━━━━━━━━━━━━━━━━━━━
📢 *From:* @${userJid.split("@")[0]}
⏰ *Time:* ${new Date().toLocaleString()}
👑 AYOBOT v1 | Created by AYOCODES`;

  for (const targetJid of uniqueUsers) {
    try {
      await sock.sendMessage(targetJid, {
        text: broadcastMsg,
        mentions: [userJid],
      });
      sent++;
      await new Promise((r) => setTimeout(r, 600));
    } catch (_) {
      failed++;
    }
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "BROADCAST DONE",
      `✅ Sent: ${sent}\n❌ Failed: ${failed}\n👥 Total targets: ${uniqueUsers.size}`,
    ),
  });
}

// ========== GLOBAL BROADCAST ==========
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
        "Usage: .globalbroadcast <message>\nSends to ALL groups the bot is in.",
      ),
    });
  }

  await sock.sendMessage(from, {
    text: "🌍 *Fetching all groups...*",
  });

  let groupsSent = 0;
  let groupsFailed = 0;

  try {
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);

    await sock.sendMessage(from, {
      text: `🌍 Found *${groupList.length}* groups. Broadcasting now...`,
    });

    const broadcastMsg = `╔══════════════════════════╗
║   🌍 *GLOBAL ANNOUNCEMENT* ║
╚══════════════════════════╝

${fullArgs}

━━━━━━━━━━━━━━━━━━━━━
📢 *From:* @${userJid.split("@")[0]}
⏰ *Time:* ${new Date().toLocaleString()}
👑 AYOBOT v1 | Created by AYOCODES`;

    for (const group of groupList) {
      try {
        await sock.sendMessage(group.id, {
          text: broadcastMsg,
          mentions: [userJid],
        });
        groupsSent++;
        // Progress update every 10 groups
        if (groupsSent % 10 === 0) {
          await sock.sendMessage(from, {
            text: `📊 Progress: ${groupsSent}/${groupList.length} groups done...`,
          });
        }
        await new Promise((r) => setTimeout(r, 1200)); // Avoid spam ban
      } catch (_) {
        groupsFailed++;
      }
    }

    await sock.sendMessage(from, {
      text: formatSuccess(
        "GLOBAL BROADCAST DONE",
        `🌍 Total groups: ${groupList.length}\n✅ Success: ${groupsSent}\n❌ Failed: ${groupsFailed}`,
      ),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("BROADCAST FAILED", error.message),
    });
  }
}

// ========== STATS ==========
// ✅ FIX: Added userJid to destructured params (was missing, caused crash)
export async function stats({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: formatError("ACCESS DENIED", "This command is for admins only."),
    });
  }

  const mem = process.memoryUsage();
  let groupCount = 0;
  try {
    const groups = await sock.groupFetchAllParticipating();
    groupCount = Object.keys(groups).length;
  } catch (_) {}

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗
║      📊 *BOT STATS*       ║
╚══════════════════════════╝

⏱️ *Uptime:* ${formatUptime(Date.now() - botStartTime)}
📨 *Messages Processed:* ${messageCount}
👥 *Unique Users:* ${commandUsage.size}
👤 *Authorized Users:* ${authorizedUsers.size}
🚫 *Banned Users:* ${bannedUsers.size}
👥 *Groups:* ${groupCount}
💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB
⚡ *CPU Time:* ${(process.cpuUsage().user / 1000000).toFixed(2)}s
🔧 *Node.js:* ${process.version}
🤖 *Platform:* ${process.platform}
📦 *PID:* ${process.pid}

━━━━━━━━━━━━━━━━━━━━━
👑 *Admin:* @${userJid.split("@")[0]}
⚡ *AYOBOT v1* | Created by AYOCODES`,
    mentions: [userJid],
  });
}

// ========== SUPER BAN ==========
export async function superBan({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "SUPER BAN",
        "Usage: .superban <phone> [reason]\nExample: .superban 2348123456789 Spamming",
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

  // Protect yourself from banning you
  if (phone === userJid.split("@")[0] || phone === ENV.ADMIN) {
    return sock.sendMessage(from, {
      text: formatError("INVALID ACTION", "You cannot ban the bot owner."),
    });
  }

  const targetJid = `${phone}@s.whatsapp.net`;

  if (bannedUsers.has(targetJid)) {
    return sock.sendMessage(from, {
      text: formatInfo("ALREADY BANNED", `*${phone}* is already banned.`),
    });
  }

  // Remove from authorized if present
  authorizedUsers.delete(targetJid);
  authorizedUsers.delete(phone);

  bannedUsers.set(targetJid, {
    bannedBy: userJid,
    time: Date.now(),
    reason,
    phone,
  });
  saveBannedUsers();

  try {
    await sock.sendMessage(targetJid, {
      text: `╔══════════════════════════╗
║        🚫 *BANNED*        ║
╚══════════════════════════╝

You have been banned from using *AYOBOT*.

📝 *Reason:* ${reason}
⏰ *Time:* ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━
Contact the bot admin to appeal.
👑 AYOCODES`,
    });
  } catch (_) {}

  await sock.sendMessage(from, {
    text: formatSuccess(
      "SUPER BAN EXECUTED",
      `🚫 *Banned:* ${phone}\n📝 *Reason:* ${reason}`,
    ),
  });
}

// ========== GLOBAL UNBAN ==========
export async function unban({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  const phone = fullArgs?.trim().replace(/[^0-9]/g, "") || "";
  if (!phone || phone.length < 10) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "UNBAN",
        "Usage: .unban <phone>\nExample: .unban 2348123456789",
      ),
    });
  }

  const targetJid = `${phone}@s.whatsapp.net`;
  let unbanned = false;

  if (bannedUsers.has(targetJid)) {
    bannedUsers.delete(targetJid);
    unbanned = true;
  }

  // Also check any partial matches
  for (const key of bannedUsers.keys()) {
    if (key.includes(phone)) {
      bannedUsers.delete(key);
      unbanned = true;
    }
  }

  if (unbanned) {
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

// ========== LIST BANNED ==========
export async function listBanned({ from, sock, isAdmin }) {
  if (!isAdmin) return;

  if (bannedUsers.size === 0) {
    return sock.sendMessage(from, {
      text: formatInfo("BANNED USERS", "✅ No users are currently banned."),
    });
  }

  let bannedList = `╔══════════════════════════╗
║   🚫 *BANNED USERS*      ║
╚══════════════════════════╝\n\n`;

  let index = 1;
  for (const [jid, data] of bannedUsers.entries()) {
    const phone = jid.split("@")[0];
    const date = data.time ? new Date(data.time).toLocaleString() : "Unknown";
    bannedList += `*${index}.* 📱 ${phone}\n`;
    bannedList += `   📝 *Reason:* ${data.reason || "No reason given"}\n`;
    bannedList += `   👑 *By:* ${data.bannedBy?.split("@")[0] || "Unknown"}\n`;
    bannedList += `   ⏰ *When:* ${date}\n\n`;
    index++;
  }

  bannedList += `━━━━━━━━━━━━━━━━━━━━━\n📊 *Total banned:* ${bannedUsers.size}\n👑 AYOCODES`;

  // Split into chunks to avoid WhatsApp message size limits
  if (bannedList.length > 4000) {
    const chunks = bannedList.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      await sock.sendMessage(from, { text: chunk });
      await new Promise((r) => setTimeout(r, 300));
    }
  } else {
    await sock.sendMessage(from, { text: bannedList });
  }
}

// ========== CLEAR ALL BANS ==========
export async function clearBans({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  const banCount = bannedUsers.size;
  if (banCount === 0) {
    return sock.sendMessage(from, {
      text: formatInfo("NO BANS", "There are no banned users to clear."),
    });
  }

  bannedUsers.clear();
  saveBannedUsers();

  await sock.sendMessage(from, {
    text: formatSuccess(
      "BANS CLEARED",
      `✅ Removed *${banCount}* banned users.\n\n👑 @${userJid.split("@")[0]}`,
    ),
    mentions: [userJid],
  });
}

// ========== RESTART BOT ==========
export async function restart({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗
║      🔄 *RESTARTING*      ║
╚══════════════════════════╝

🔄 *Bot is restarting...*
⏰ *Time:* ${new Date().toLocaleString()}
👑 *By:* @${userJid.split("@")[0]}

━━━━━━━━━━━━━━━━━━━━━
⚡ Will be back online in seconds.
👑 AYOCODES`,
    mentions: [userJid],
  });

  // Save all data before exit
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

// ========== SHUTDOWN BOT ==========
export async function shutdown({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗
║      ⛔ *SHUTTING DOWN*    ║
╚══════════════════════════╝

🛑 *Bot is shutting down...*
⏰ *Time:* ${new Date().toLocaleString()}
👑 *By:* @${userJid.split("@")[0]}

━━━━━━━━━━━━━━━━━━━━━
⚠️ *Manual restart required.*
👑 AYOCODES`,
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

// ========== BOT STATUS ==========
// ✅ FIX: Added userJid to destructured params (was missing, caused crash)
export async function botStatus({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  let groupCount = 0;
  try {
    const groups = await sock.groupFetchAllParticipating();
    groupCount = Object.keys(groups).length;
  } catch (_) {}

  await sock.sendMessage(from, {
    text: `╔══════════════════════════╗
║     📊 *BOT STATUS*       ║
╚══════════════════════════╝

⏱️ *Uptime:* ${days}d ${hours}h ${minutes}m ${seconds}s
📨 *Messages:* ${messageCount}
👥 *Unique Users:* ${commandUsage.size}
👤 *Authorized:* ${authorizedUsers.size}
🚫 *Banned:* ${bannedUsers.size}
👥 *Groups:* ${groupCount}
💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB
⚡ *CPU Time:* ${(process.cpuUsage().user / 1000000).toFixed(2)}s
🔧 *Node.js:* ${process.version}
🤖 *Platform:* ${process.platform}
📦 *PID:* ${process.pid}
🔋 *Arc Reactor:* ██████████ 100%

━━━━━━━━━━━━━━━━━━━━━
👑 *Admin:* @${userJid.split("@")[0]}
⚡ *AYOBOT v1* | Created by AYOCODES`,
    mentions: [userJid],
  });
}

// ========== EVAL ==========
export async function adminEval({ fullArgs, from, sock, isAdmin }) {
  if (!isAdmin) return;

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "EVAL",
        "Usage: .eval <code>\n⚠️ *Dangerous — admin only!*",
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

    const resultStr =
      typeof result === "object"
        ? JSON.stringify(result, null, 2)
        : String(result ?? "undefined");

    await sock.sendMessage(from, {
      text: `╔══════════════════════════╗
║     ⚡ *EVAL RESULT*      ║
╚══════════════════════════╝

\`\`\`js
${resultStr.substring(0, 3500)}${resultStr.length > 3500 ? "\n\n... (truncated)" : ""}
\`\`\``,
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: `╔══════════════════════════╗
║     ❌ *EVAL ERROR*       ║
╚══════════════════════════╝

\`\`\`
${error.message}
\`\`\``,
    });
  }
}
