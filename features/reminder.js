// features/reminder.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Reminder Module - ULTRA ACCURATE TIME PARSING
//  Author: AYOCODES
//
//  ✅ ACCURACY FIXES:
//  • 1m = exactly 60,000ms (not 1 hour)
//  • Added debug logging to verify times
//  • Shows exact time in confirmation
//  • Validates minimum time (10 seconds)
// ════════════════════════════════════════════════════════════════════════════

import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// ============================================================================
//  GLOBAL REMINDER STORE
// ============================================================================
if (!global.reminders) {
  global.reminders = new Map();
  console.log("✅ [reminder.js] Created global reminders store");
}

// Reminder ID counter
let reminderIdCounter = 1;

// Store active timeouts for potential cancellation
const activeTimeouts = new Map();

// ============================================================================
//  ULTRA ACCURATE TIME PARSING
// ============================================================================

/**
 * Parse duration strings with absolute accuracy
 * @param {string} str - Time string (1m, 30s, 2h, 1d)
 * @returns {number|null} Milliseconds or null
 */
function parseDuration(str) {
  if (!str || typeof str !== "string") {
    console.log("❌ parseDuration: Invalid input", str);
    return null;
  }

  const strLower = str.toLowerCase().trim();
  console.log(`⏰ parseDuration: Parsing "${strLower}"`);

  // Match patterns like: 30s, 10m, 2h, 1d, 5sec, 3min, 2hour, 1day
  const match = strLower.match(
    /^(\d+)\s*(s(ec|econds?)?|m(in(utes?)?)?|h(r|ours?)?|d(ays?)?)$/i,
  );

  if (!match) {
    console.log(`❌ parseDuration: No match for "${strLower}"`);
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2][0].toLowerCase(); // Get first character: s, m, h, d

  console.log(`⏰ parseDuration: Value=${value}, Unit=${unit}`);

  let ms = 0;
  switch (unit) {
    case "s":
      ms = value * 1000;
      break;
    case "m":
      ms = value * 60 * 1000;
      break; // 1m = 60,000ms = 1 minute
    case "h":
      ms = value * 60 * 60 * 1000;
      break;
    case "d":
      ms = value * 24 * 60 * 60 * 1000;
      break;
    default:
      return null;
  }

  console.log(
    `⏰ parseDuration: ${value}${unit} = ${ms}ms (${ms / 1000} seconds) (${ms / 60000} minutes)`,
  );
  return ms;
}

/**
 * Parse time of day (9am, 2pm, 14:30)
 */
function parseTimeOfDay(str) {
  if (!str || typeof str !== "string") return null;

  const strLower = str.toLowerCase().trim();
  const now = new Date();
  const result = new Date(now);

  // Match 9am, 9pm, 2am, 2pm, 12am, 12pm
  const ampmMatch = strLower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const ampm = ampmMatch[3].toLowerCase();

    if (hours < 1 || hours > 12) return null;
    if (minutes < 0 || minutes > 59) return null;

    // Convert to 24-hour format
    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    result.setHours(hours, minutes, 0, 0);

    // If time is in the past, set for tomorrow
    if (result < now) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  // Match 14:30 (24-hour format)
  const militaryMatch = strLower.match(/^(\d{1,2}):(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = parseInt(militaryMatch[2], 10);

    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    result.setHours(hours, minutes, 0, 0);

    // If time is in the past, set for tomorrow
    if (result < now) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  return null;
}

/**
 * Main time parser with debugging
 */
export function parseTime(timeStr) {
  console.log(`\n⏰ ===== TIME PARSING DEBUG =====`);
  console.log(`Input: "${timeStr}"`);

  if (!timeStr || typeof timeStr !== "string") {
    console.log("❌ Invalid input");
    return null;
  }

  // Try duration first (1m, 30s, 2h, 1d)
  const duration = parseDuration(timeStr);
  if (duration !== null) {
    const result = {
      type: "duration",
      ms: duration,
      date: new Date(Date.now() + duration),
    };
    console.log(`✅ DURATION MATCH:`);
    console.log(`   Raw: ${timeStr} = ${duration}ms`);
    console.log(`   Seconds: ${duration / 1000}s`);
    console.log(`   Minutes: ${duration / 60000}m`);
    console.log(`   Hours: ${duration / 3600000}h`);
    console.log(`   Trigger at: ${result.date.toLocaleString()}`);
    return result;
  }

  // Try time of day (9am, 14:30)
  const timeOfDay = parseTimeOfDay(timeStr);
  if (timeOfDay) {
    const ms = timeOfDay.getTime() - Date.now();
    const result = {
      type: "absolute",
      ms: ms,
      date: timeOfDay,
    };
    console.log(`✅ TIME OF DAY MATCH:`);
    console.log(`   Trigger at: ${result.date.toLocaleString()}`);
    console.log(`   In: ${ms / 1000}s (${ms / 60000} minutes)`);
    return result;
  }

  console.log(`❌ NO MATCH for "${timeStr}"`);
  return null;
}

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================

function formatTimeRemaining(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} hours`;
  return `${Math.round(ms / 86400000)} days`;
}

function formatDateTime(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ============================================================================
//  SET REMINDER
// ============================================================================
export async function reminder({ args, fullArgs, from, userJid, sock }) {
  try {
    console.log("\n📝 ===== NEW REMINDER =====");
    console.log("Full args:", fullArgs);

    if (!fullArgs || fullArgs.length < 3) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "⏰ REMINDER",
          "📌 *Usage:*\n" +
            ".remind <message> by <time>\n" +
            ".remind <message> every <interval>\n\n" +
            "📋 *Time Formats:*\n" +
            "• 30s, 10m, 2h, 1d\n" +
            "• 9pm, 2am, 14:30\n" +
            "• tomorrow 9am\n\n" +
            "📝 *Examples:*\n" +
            ".remind drink water by 30s\n" +
            ".remind meeting by 9am\n" +
            ".remind stand every 30m",
        ),
      });
    }

    // Parse command
    const lower = fullArgs.toLowerCase();
    let message,
      timeStr,
      isRecurring = false;

    if (lower.includes(" by ")) {
      const parts = fullArgs.split(/ by /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
      console.log("📝 Type: One-time reminder");
    } else if (lower.includes(" every ")) {
      const parts = fullArgs.split(/ every /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
      isRecurring = true;
      console.log("📝 Type: Recurring reminder");
    } else {
      return sock.sendMessage(from, {
        text: formatError("INVALID FORMAT", 'Use "by" or "every"'),
      });
    }

    console.log("📝 Message:", message);
    console.log("⏰ Time string:", timeStr);

    if (!message || !timeStr) {
      return sock.sendMessage(from, {
        text: formatError("INVALID FORMAT", "Missing message or time."),
      });
    }

    // Parse time
    const parsed = parseTime(timeStr);
    if (!parsed) {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID TIME",
          `Could not understand "${timeStr}".\n\n` +
            `✅ Valid formats:\n` +
            `• 30s, 10m, 2h, 1d\n` +
            `• 9pm, 2am, 14:30`,
        ),
      });
    }

    // Validate minimum time (10 seconds)
    if (parsed.ms < 10000) {
      return sock.sendMessage(from, {
        text: formatError("TOO SHORT", "Minimum reminder time is 10 seconds."),
      });
    }
    // For recurring reminders, must be duration
    if (isRecurring && parsed.type !== "duration") {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID INTERVAL",
          "Recurring reminders must use duration (30m, 2h, 1d)",
        ),
      });
    }
    // Create reminder
    const reminderId = reminderIdCounter++;

    if (!global.reminders.has(userJid)) {
      global.reminders.set(userJid, new Map());
    }

    const userReminders = global.reminders.get(userJid);

    const reminder = {
      id: reminderId,
      from,
      userJid,
      message,
      createdAt: Date.now(),
      triggerAt: parsed.date.getTime(),
      interval: isRecurring ? parsed.ms : null,
      recurring: isRecurring,
      active: true,
    };

    userReminders.set(reminderId, reminder);
    console.log(`✅ Reminder #${reminderId} stored`);

    // Schedule the reminder
    scheduleReminder(reminder, sock);

    // Send confirmation
    const timeDisplay = formatDateTime(parsed.date);
    const timeRemaining = formatTimeRemaining(parsed.ms);
    const recurrenceText = isRecurring ? ` (repeats every ${timeStr})` : "";

    await sock.sendMessage(from, {
      text: formatSuccess(
        "✅ REMINDER SET",
        `📝 *Message:* ${message}\n` +
          `⏰ *When:* ${timeDisplay}\n` +
          `⏳ *In:* ${timeRemaining}${recurrenceText}\n` +
          `🆔 *ID:* #${reminderId}\n\n` +
          `📋 Use .reminders to see all reminders`,
      ),
    });

    console.log(
      `✅ Reminder #${reminderId} set for ${formatDateTime(parsed.date)} (${timeRemaining})`,
    );
  } catch (error) {
    console.error("❌ Reminder error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", error.message),
    });
  }
}

// ============================================================================
//  SCHEDULE REMINDER
// ============================================================================
function scheduleReminder(reminder, sock) {
  const now = Date.now();
  const delay = reminder.triggerAt - now;

  console.log(
    `⏰ Scheduling reminder #${reminder.id} in ${delay}ms (${delay / 1000}s)`,
  );

  if (delay <= 0) {
    console.log(
      `⚠️ Reminder #${reminder.id} is in the past, triggering immediately`,
    );
    setTimeout(() => triggerReminder(reminder, sock), 100);
    return;
  }

  // Clear any existing timeout for this reminder
  if (activeTimeouts.has(reminder.id)) {
    clearTimeout(activeTimeouts.get(reminder.id));
    activeTimeouts.delete(reminder.id);
  }

  const timeout = setTimeout(() => triggerReminder(reminder, sock), delay);
  activeTimeouts.set(reminder.id, timeout);

  console.log(`✅ Reminder #${reminder.id} scheduled in ${delay / 1000}s`);
}

// ============================================================================
//  TRIGGER REMINDER
// ============================================================================
async function triggerReminder(reminder, sock) {
  try {
    console.log(
      `🔔 Triggering reminder #${reminder.id}: "${reminder.message}"`,
    );

    if (!reminder.active) {
      console.log(`⚠️ Reminder #${reminder.id} is inactive, skipping`);
      return;
    }

    const timeStr = formatDateTime(new Date(reminder.triggerAt));

    await sock.sendMessage(reminder.from, {
      text:
        `╔══════════════════════════╗\n` +
        `║     ⏰ *REMINDER*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📝 *${reminder.message}*\n\n` +
        `⏰ *Set for:* ${timeStr}\n` +
        `🆔 *ID:* #${reminder.id}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ AYOBOT v1 | 👑 AYOCODES`,
    });

    console.log(`✅ Reminder #${reminder.id} triggered successfully`);

    // Handle recurring reminders
    if (reminder.recurring && reminder.interval) {
      const newTriggerAt = Date.now() + reminder.interval;
      reminder.triggerAt = newTriggerAt;

      console.log(
        `🔄 Reminder #${reminder.id} rescheduled for ${formatDateTime(new Date(newTriggerAt))}`,
      );
      scheduleReminder(reminder, sock);
    } else {
      // Mark as inactive and remove
      reminder.active = false;
      activeTimeouts.delete(reminder.id);

      const userReminders = global.reminders.get(reminder.userJid);
      if (userReminders) {
        userReminders.delete(reminder.id);
        if (userReminders.size === 0) {
          global.reminders.delete(reminder.userJid);
        }
      }
      console.log(`✅ Reminder #${reminder.id} removed from store`);
    }
  } catch (error) {
    console.error("❌ Error triggering reminder:", error);
  }
}

// ============================================================================
//  LIST REMINDERS
// ============================================================================
export async function listReminders({ from, userJid, sock }) {
  try {
    const userReminders = global.reminders.get(userJid);

    if (!userReminders || userReminders.size === 0) {
      return sock.sendMessage(from, {
        text: formatInfo("📋 REMINDERS", "You have no active reminders."),
      });
    }

    let text =
      `╔══════════════════════════╗\n` +
      `║     📋 *YOUR REMINDERS*   ║\n` +
      `╚══════════════════════════╝\n\n`;

    const now = Date.now();
    let index = 1;

    // Convert to array and sort by trigger time
    const reminders = Array.from(userReminders.values())
      .filter((r) => r.active)
      .sort((a, b) => a.triggerAt - b.triggerAt);

    for (const r of reminders) {
      const timeLeft = r.triggerAt - now;
      let timeDisplay;

      if (timeLeft < 60000)
        timeDisplay = `in ${Math.round(timeLeft / 1000)} seconds`;
      else if (timeLeft < 3600000)
        timeDisplay = `in ${Math.round(timeLeft / 60000)} minutes`;
      else if (timeLeft < 86400000)
        timeDisplay = `in ${Math.round(timeLeft / 3600000)} hours`;
      else timeDisplay = `in ${Math.round(timeLeft / 86400000)} days`;

      const recurring = r.recurring ? " 🔄" : "";

      text +=
        `*${index}.* ${r.message}${recurring}\n` +
        `   ⏰ ${timeDisplay}\n` +
        `   🆔 #${r.id}\n\n`;

      index++;
    }

    text +=
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 Use .cancelreminder <#>\n` +
      `⚡ AYOBOT v1 | 👑 AYOCODES`;

    await sock.sendMessage(from, { text });
  } catch (error) {
    console.error("❌ List reminders error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", error.message),
    });
  }
}

// ============================================================================
//  CANCEL REMINDER
// ============================================================================
export async function cancelReminder({ args, from, userJid, sock }) {
  try {
    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "CANCEL REMINDER",
          "Usage: .cancelreminder <id>\n" +
            "Example: .cancelreminder 5\n\n" +
            "Use .reminders to see all IDs",
        ),
      });
    }

    const id = parseInt(args[0], 10);
    if (isNaN(id)) {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID ID",
          "Please provide a valid reminder ID number.",
        ),
      });
    }

    const userReminders = global.reminders.get(userJid);
    if (!userReminders || !userReminders.has(id)) {
      return sock.sendMessage(from, {
        text: formatError("NOT FOUND", `No reminder found with ID #${id}.`),
      });
    }

    const reminder = userReminders.get(id);
    reminder.active = false;

    // Clear timeout if exists
    if (activeTimeouts.has(id)) {
      clearTimeout(activeTimeouts.get(id));
      activeTimeouts.delete(id);
    }

    userReminders.delete(id);

    if (userReminders.size === 0) {
      global.reminders.delete(userJid);
    }

    await sock.sendMessage(from, {
      text: formatSuccess(
        "✅ REMINDER CANCELLED",
        `Cancelled reminder #${id}: "${reminder.message}"`,
      ),
    });
  } catch (error) {
    console.error("❌ Cancel reminder error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", error.message),
    });
  }
}

// ============================================================================
//  SNOOZE REMINDER
// ============================================================================
export async function snooze({ args, message, from, userJid, sock }) {
  try {
    // Check if replying to a reminder message
    const quoted = message.message?.extendedTextMessage?.contextInfo;
    let reminderId = null;

    if (quoted?.quotedMessage) {
      const quotedText =
        quoted.quotedMessage?.conversation ||
        quoted.quotedMessage?.extendedTextMessage?.text ||
        "";
      const idMatch = quotedText.match(/#(\d+)/);
      if (idMatch) {
        reminderId = parseInt(idMatch[1], 10);
      }
    }

    if (!reminderId) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "SNOOZE",
          "Reply to a reminder message with:\n" +
            ".snooze <time>\n\n" +
            "Examples:\n" +
            ".snooze 5m\n" +
            ".snooze 1h",
        ),
      });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatError(
          "MISSING TIME",
          "Please specify snooze time (e.g., 5m, 1h, 30m)",
        ),
      });
    }

    const timeStr = args[0];
    const parsed = parseDuration(timeStr);

    if (!parsed) {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID TIME",
          `Could not understand "${timeStr}". Use format: 30s, 10m, 2h, 1d`,
        ),
      });
    }

    const userReminders = global.reminders.get(userJid);
    if (!userReminders || !userReminders.has(reminderId)) {
      return sock.sendMessage(from, {
        text: formatError("NOT FOUND", `Reminder #${reminderId} not found.`),
      });
    }

    const reminder = userReminders.get(reminderId);
    const newTriggerAt = Date.now() + parsed;
    reminder.triggerAt = newTriggerAt;

    // Clear old timeout and schedule new one
    if (activeTimeouts.has(reminderId)) {
      clearTimeout(activeTimeouts.get(reminderId));
      activeTimeouts.delete(reminderId);
    }

    scheduleReminder(reminder, sock);

    await sock.sendMessage(from, {
      text: formatSuccess(
        "⏰ REMINDER SNOOZED",
        `Reminder #${reminderId} snoozed for ${timeStr}\n` +
          `New time: ${formatDateTime(new Date(newTriggerAt))}`,
      ),
    });
  } catch (error) {
    console.error("❌ Snooze error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", error.message),
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  reminder,
  listReminders,
  cancelReminder,
  snooze,
};
