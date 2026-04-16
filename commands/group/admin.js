// commands/group/admin.js — AYOBOT v1.0.0
// Admin Commands — PRODUCTION REWRITE WITH ENHANCED EVAL
// Author: AYOCODES
//
// ENHANCEMENTS:
//   • adminEval — Full async/await support with console.log capture
//   • adminEval — Execution time tracking
//   • adminEval — Proper error stack traces
//   • adminEval — Formatted code blocks
//   • adminEval — Auto-detects Promise resolution
//   • adminEval — Truncates large outputs safely
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
  fmt,
} from "../../utils/formatters.js";
import { normalizePhone } from "../../utils/validators.js";

// ============================================================================
// HELPER: Capture console.log output
// ============================================================================
function captureConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  const logs = [];

  console.log = (...args) => {
    logs.push({ type: 'log', content: args.map(a => String(a)).join(' ') });
    originalLog.apply(console, args);
  };

  console.error = (...args) => {
    logs.push({ type: 'error', content: args.map(a => String(a)).join(' ') });
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    logs.push({ type: 'warn', content: args.map(a => String(a)).join(' ') });
    originalWarn.apply(console, args);
  };

  console.info = (...args) => {
    logs.push({ type: 'info', content: args.map(a => String(a)).join(' ') });
    originalInfo.apply(console, args);
  };

  console.debug = (...args) => {
    logs.push({ type: 'debug', content: args.map(a => String(a)).join(' ') });
    originalDebug.apply(console, args);
  };

  return {
    logs,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      console.debug = originalDebug;
    }
  };
}

// ============================================================================
// HELPER: Safe stringify with circular reference handling
// ============================================================================
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }
    if (value instanceof Promise) {
      return '[Promise]';
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack?.split('\n')
      };
    }
    return value;
  }, indent);
}

// ============================================================================
// HELPER: Format eval output
// ============================================================================
function formatEvalResult(result, logs, executionTime, code) {
  const maxLength = 3000;
  let output = '';

  // Add console logs if any
  if (logs && logs.length > 0) {
    output += `📟 *Console Output:*\n`;
    logs.slice(0, 20).forEach(log => {
      const content = log.content.substring(0, 200);
      output += `[${log.type}] ${content}\n`;
    });
    if (logs.length > 20) {
      output += `... and ${logs.length - 20} more log entries\n`;
    }
    output += `\n`;
  }

  // Add result
  if (result !== undefined) {
    const type = result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result;
    output += `📤 *Result:* (${type})\n`;

    let resultStr;
    if (typeof result === 'object') {
      resultStr = safeStringify(result, 2);
    } else if (typeof result === 'string') {
      resultStr = result;
    } else {
      resultStr = String(result);
    }

    if (resultStr.length > maxLength) {
      resultStr = resultStr.substring(0, maxLength) + `\n\n... (truncated, total ${resultStr.length} chars)`;
    }

    output += `\`\`\`${resultStr}\`\`\`\n`;
  } else {
    output += `📤 *Result:* \`undefined\`\n`;
  }

  return output;
}

// ============================================================================
// ADD USER
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
      text: fmt(
        "🎉",
        "ACCESS GRANTED",
        `You have been authorized to use *AYOBOT*!\n\nType *${ENV.PREFIX}menu* to explore all features.`,
      ),
    });
  } catch (_) {}
}

// ============================================================================
// REMOVE USER
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
// LIST USERS
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
    text: fmt(
      "📋",
      "AUTHORIZED USERS",
      (list || "▰ No authorized users yet") +
        `\n\n━━━━━━━━━━━━━━━━━━━━━\n👥 *Total:* ${count}`,
    ),
  });
}

// ============================================================================
// MODE — FIXED: No dynamic import
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
        `Current: *${current.toUpperCase()}*\n\nUsage:\n${ENV.PREFIX}mode public  — Anyone can use the bot\n${ENV.PREFIX}mode private — Only you can use the bot`,
      ),
    });
  }

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
    text: fmt(
      modeEmoji,
      "MODE UPDATED",
      `Bot is now in *${newMode.toUpperCase()}* mode.\n\n${modeDesc}`,
    ),
  });
}

// ============================================================================
// BROADCAST
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

  const msg = fmt(
    "📢",
    "ADMIN BROADCAST",
    `${fullArgs}\n\n━━━━━━━━━━━━━━━━━━━━━\n📢 *From:* @${normalizePhone(userJid)}\n⏰ *Time:* ${new Date().toLocaleString()}`,
  );

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
// GLOBAL BROADCAST
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

    const msg = fmt(
      "🌍",
      "GLOBAL ANNOUNCEMENT",
      `${fullArgs}\n\n━━━━━━━━━━━━━━━━━━━━━\n📢 *From:* @${normalizePhone(userJid)}\n⏰ *Time:* ${new Date().toLocaleString()}`,
    );

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
// STATS
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
    text: fmt(
      "📊",
      "BOT STATS",
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
        `🔋 *Arc Reactor:* ██████████ 100%`,
    ),
    mentions: [userJid],
  });
}

// ============================================================================
// SUPER BAN
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

  const adminPhone = normalizePhone(ENV.ADMIN || "");
  if (ph === normalizePhone(userJid) || (adminPhone && ph === adminPhone)) {
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
      text: fmt(
        "🚫",
        "BANNED",
        `You have been banned from using *AYOBOT*.\n\n📝 *Reason:* ${reason}\n⏰ *Time:* ${new Date().toLocaleString()}\n\nContact the bot admin to appeal.`,
      ),
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
// UNBAN
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
// LIST BANNED
// ============================================================================

export async function listBanned({ from, sock, isAdmin }) {
  if (!isAdmin) return;

  if (bannedUsers.size === 0) {
    return sock.sendMessage(from, {
      text: formatInfo("BANNED USERS", "✅ No users are currently banned."),
    });
  }

  let text = `╔══════════════════════════╗\n║   🚫 *BANNED USERS*      ║\n╚══════════════════════════╝\n\n`;
  let index = 1;

  for (const [jid, data] of bannedUsers.entries()) {
    const ph = jid.split("@")[0];
    const when = data.time ? new Date(data.time).toLocaleString() : "Unknown";
    const by = data.bannedBy?.split("@")[0] || "Unknown";
    text += `*${index}.* 📱 ${ph}\n   📝 *Reason:* ${data.reason || "No reason given"}\n   👑 *By:* ${by}\n   ⏰ *When:* ${when}\n\n`;
    index++;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n📊 *Total banned:* ${bannedUsers.size}\n👑 AYOCODES`;

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
// CLEAR BANS
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
      `✅ Cleared *${count}* banned users.\n\n👑 @${normalizePhone(userJid)}`,
    ),
    mentions: [userJid],
  });
}

// ============================================================================
// RESTART
// ============================================================================

export async function restart({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text: fmt(
      "🔄",
      "RESTARTING",
      `🔄 *Bot is restarting...*\n⏰ *Time:* ${new Date().toLocaleString()}\n👑 *By:* @${normalizePhone(userJid)}\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ Will be back online in seconds.`,
    ),
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
// SHUTDOWN
// ============================================================================

export async function shutdown({ from, userJid, sock, isAdmin }) {
  if (!isAdmin) return;

  await sock.sendMessage(from, {
    text: fmt(
      "⛔",
      "SHUTTING DOWN",
      `🛑 *Bot is shutting down...*\n⏰ *Time:* ${new Date().toLocaleString()}\n👑 *By:* @${normalizePhone(userJid)}\n\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *Manual restart required.*`,
    ),
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
// BOT STATUS
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
    text: fmt(
      "📊",
      "BOT STATUS",
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
        `🔋 *Arc Reactor:* ██████████ 100%`,
    ),
    mentions: [userJid],
  });
}

// ============================================================================
// ADMIN EVAL — ENHANCED VERSION WITH FULL ASYNC/AWAIT & CONSOLE CAPTURE
// ============================================================================

export async function adminEval({ fullArgs, from, sock, isAdmin, message, userJid }) {
  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: formatError("ACCESS DENIED", "This command is for bot admins only."),
    });
  }

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "⚡ EVAL",
        `*Execute JavaScript code*\n\n` +
        `📌 *Usage:* ${ENV.PREFIX}eval <code>\n\n` +
        `📋 *Available variables:*\n` +
        `• \`sock\` - WhatsApp socket connection\n` +
        `• \`ENV\` - Environment variables\n` +
        `• \`from\` - Current chat JID\n` +
        `• \`userJid\` - Your JID\n` +
        `• \`message\` - Full message object\n` +
        `• \`require\` - Node.js require function\n\n` +
        `💡 *Examples:*\n` +
        `${ENV.PREFIX}eval 2 + 2\n` +
        `${ENV.PREFIX}eval await sock.sendMessage(from, { text: "Hello!" })\n` +
        `${ENV.PREFIX}eval Object.keys(sock)\n\n` +
        `⚠️ *Dangerous — admin only!*`
      ),
    });
  }

  // Send initial processing message
  const processingMsg = await sock.sendMessage(from, {
    text: "⚡ *Executing eval...*\n⏳ _Please wait..._"
  });

  const startTime = Date.now();
  let code = fullArgs.trim();

  // Clean code if wrapped in backticks
  code = code.replace(/^```(?:js|javascript)?\n?/, '').replace(/\n?```$/, '');

  // Setup console capture
  const consoleCapture = captureConsole();

  try {
    // Create async function with all available context
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

    // Prepare context variables
    const context = {
      sock,
      ENV,
      from,
      userJid,
      message,
      require,
      process,
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      Date,
      Math,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      WeakMap,
      WeakSet,
    };

    // Create the function with context variables as parameters
    const paramNames = Object.keys(context);
    const paramValues = Object.values(context);

    // Build the function body
    const fnBody = `
      try {
        ${code.includes('await') || code.includes('return') ? code : `return (${code})`}
      } catch (e) {
        throw e;
      }
    `;

    const fn = new AsyncFunction(...paramNames, fnBody);

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Eval execution timeout (30 seconds)')), 30000);
    });

    const evalPromise = fn(...paramValues);
    const result = await Promise.race([evalPromise, timeoutPromise]);

    const executionTime = Date.now() - startTime;

    // Restore console
    consoleCapture.restore();

    // Format the output
    const output = formatEvalResult(result, consoleCapture.logs, executionTime, code);

    // Prepare the response
    const response = `╔══════════════════════════╗\n` +
      `║     ⚡ *EVAL RESULT*     ║\n` +
      `╚══════════════════════════╝\n\n` +
      `⏱️ *Execution Time:* ${executionTime}ms\n` +
      `📥 *Input:*\n\`\`\`js\n${code.substring(0, 500)}${code.length > 500 ? '...' : ''}\n\`\`\`\n\n` +
      output +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👑 *AYOBOT v1.0.0* | Admin Eval`;

    // Edit the processing message or send new if too long
    try {
      if (response.length <= 4000) {
        await sock.sendMessage(from, {
          text: response,
          edit: processingMsg.key
        });
      } else {
        // If too long, send as document
        const fullOutput = `// AYOBOT EVAL OUTPUT\n// Execution Time: ${executionTime}ms\n// Date: ${new Date().toISOString()}\n\n// === INPUT ===\n${code}\n\n// === CONSOLE OUTPUT ===\n${consoleCapture.logs.map(l => `[${l.type}] ${l.content}`).join('\n')}\n\n// === RESULT ===\n${safeStringify(result, 2)}`;

        await sock.sendMessage(from, {
          document: Buffer.from(fullOutput, 'utf-8'),
          mimetype: 'text/plain',
          fileName: `eval_${Date.now()}.txt`,
          caption: `⚡ *Eval Complete*\n⏱️ Execution Time: ${executionTime}ms\n📦 Output saved as file`
        });
      }
    } catch (err) {
      // Fallback if edit fails
      await sock.sendMessage(from, { text: response.substring(0, 4000) });
    }

  } catch (error) {
    const executionTime = Date.now() - startTime;

    // Restore console
    consoleCapture.restore();

    // Format error with stack trace
    const errorOutput = `❌ *EVAL ERROR*\n` +
      `⏱️ *Time:* ${executionTime}ms\n\n` +
      `📥 *Input:*\n\`\`\`js\n${code.substring(0, 300)}${code.length > 300 ? '...' : ''}\n\`\`\`\n\n` +
      `💥 *Error:*\n\`\`\`\n${error.name}: ${error.message}\n\`\`\`\n\n` +
      `📚 *Stack Trace:*\n\`\`\`\n${(error.stack || 'No stack trace').substring(0, 1500)}\n\`\`\``;

    try {
      await sock.sendMessage(from, {
        text: errorOutput,
        edit: processingMsg.key
      });
    } catch (_) {
      await sock.sendMessage(from, { text: errorOutput.substring(0, 4000) });
    }
  }
}

// Alias for eval
export const evalCode = adminEval;
export const execute = adminEval;

// ============================================================================
// DEFAULT EXPORT
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
  evalCode,
  execute,
};
