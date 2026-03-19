// features/reminder.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Reminder Module - ACCURATE TIME PARSING
//  Author: AYOCODES
//
//  Features:
//  • Accurate time parsing (1m = 60 seconds, not 1 hour)
//  • Multiple time formats (30s, 10m, 2h, 1d, 9am, 14:30, tomorrow 9am)
//  • Recurring reminders
//  • List, cancel, snooze
// ════════════════════════════════════════════════════════════════════════════

import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// ============================================================================
//  GLOBAL REMINDER STORE
// ============================================================================
// Structure: userJid -> Map of reminders
if (!global.reminders) {
  global.reminders = new Map();
  console.log("✅ [reminder.js] Created global reminders store");
}

// Reminder ID counter
let reminderIdCounter = 1;

// ============================================================================
//  TIME PARSING - FIXED AND ACCURATE
// ============================================================================

/**
 * Parse duration strings like "30s", "10m", "2h", "1d" into milliseconds
 * @param {string} str - Time string to parse
 * @returns {number|null} Milliseconds or null if invalid
 */
function parseDuration(str) {
  if (!str || typeof str !== "string") return null;

  const match = str.match(
    /^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i,
  );
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase()[0]; // s, m, h, d

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

/**
 * Parse time strings like "9am", "14:30", "2pm" into Date object for today
 * @param {string} str - Time string to parse
 * @returns {Date|null} Date object or null if invalid
 */
function parseTimeOfDay(str) {
  if (!str || typeof str !== "string") return null;

  const now = new Date();
  const result = new Date(now);

  // Match 9am, 9pm, 2am, 2pm, 12am, 12pm
  const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
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
  const militaryMatch = str.match(/^(\d{1,2}):(\d{2})$/);
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
 * Parse "tomorrow 9am", "next monday 10:30", etc.
 * @param {string} str - Time string to parse
 * @returns {Date|null} Date object or null if invalid
 */
function parseRelativeDate(str) {
  if (!str || typeof str !== "string") return null;

  const now = new Date();
  const lower = str.toLowerCase();
  let date = new Date(now);
  let timePart = "";

  // Extract time part if present
  const timeMatch = lower.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/);
  if (timeMatch) {
    timePart = timeMatch[1];
    // Remove time part from the string
    const rest = lower.replace(timePart, "").trim();

    // Parse the date part
    if (rest.includes("tomorrow")) {
      date.setDate(date.getDate() + 1);
    } else if (rest.includes("next")) {
      if (rest.includes("monday")) {
        const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilMonday);
      } else if (rest.includes("tuesday")) {
        const daysUntilTuesday = (9 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilTuesday);
      } else if (rest.includes("wednesday")) {
        const daysUntilWednesday = (10 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilWednesday);
      } else if (rest.includes("thursday")) {
        const daysUntilThursday = (11 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilThursday);
      } else if (rest.includes("friday")) {
        const daysUntilFriday = (12 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilFriday);
      } else if (rest.includes("saturday")) {
        const daysUntilSaturday = (13 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilSaturday);
      } else if (rest.includes("sunday")) {
        const daysUntilSunday = (7 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilSunday);
      }
    }

    // Parse the time part
    if (timePart) {
      const timeDate = parseTimeOfDay(timePart);
      if (timeDate) {
        date.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
      }
    }
  }

  return date > now ? date : null;
}

/**
 * Main time parser - tries all formats
 * @param {string} timeStr - Time string to parse
 * @returns {Object|null} { type: 'duration'|'absolute', ms: number, date: Date } or null
 */
export function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  // Try duration first (30s, 10m, 2h, 1d)
  const duration = parseDuration(timeStr);
  if (duration !== null) {
    return {
      type: "duration",
      ms: duration,
      date: new Date(Date.now() + duration),
    };
  }

  // Try time of day (9am, 14:30)
  const timeOfDay = parseTimeOfDay(timeStr);
  if (timeOfDay) {
    return {
      type: "absolute",
      ms: timeOfDay.getTime() - Date.now(),
      date: timeOfDay,
    };
  }

  // Try relative date (tomorrow 9am, next monday)
  const relative = parseRelativeDate(timeStr);
  if (relative) {
    return {
      type: "absolute",
      ms: relative.getTime() - Date.now(),
      date: relative,
    };
  }

  return null;
}

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================

function formatReminderTime(date) {
  const now = new Date();
  const diff = date - now;

  if (diff < 60000) return "in less than a minute";
  if (diff < 3600000) return `in ${Math.round(diff / 60000)} minutes`;
  if (diff < 86400000) return `in ${Math.round(diff / 3600000)} hours`;
  if (diff < 2592000000) return `in ${Math.round(diff / 86400000)} days`;

  return `on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
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
    // Parse: .remind <message> by <time> OR .remind <message> every <interval>
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
            "• tomorrow 9am\n" +
            "• next monday\n\n" +
            "📝 *Examples:*\n" +
            ".remind drink water by 30m\n" +
            ".remind meeting by 9am\n" +
            ".remind stand every 30m\n\n" +
            "📋 *Commands:*\n" +
            ".reminders — list all\n" +
            ".cancelreminder <#>\n" +
            ".snooze <time> — reply to reminder",
        ),
      });
    }

    // Parse command
    const lower = fullArgs.toLowerCase();
    let message,
      timeStr,
      isRecurring = false,
      interval = null;

    if (lower.includes(" by ")) {
      const parts = fullArgs.split(/ by /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
    } else if (lower.includes(" every ")) {
      const parts = fullArgs.split(/ every /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
      isRecurring = true;
    } else {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID FORMAT",
          'Use "by" for one-time or "every" for recurring.\n' +
            "Example: .remind drink water by 30m",
        ),
      });
    }

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
            `• 9pm, 2am, 14:30\n` +
            `• tomorrow 9am\n` +
            `• next monday`,
        ),
      });
    }

    // Validate duration
    if (parsed.ms < 10000) {
      // Less than 10 seconds
      return sock.sendMessage(from, {
        text: formatError("TOO SHORT", "Minimum reminder time is 10 seconds."),
      });
    }

    // For recurring reminders, interval must be duration
    if (isRecurring && parsed.type !== "duration") {
      return sock.sendMessage(from, {
        text: formatError(
          "INVALID INTERVAL",
          "Recurring reminders must use duration format (30m, 2h, 1d).",
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

    // Schedule the reminder
    scheduleReminder(reminder, sock);

    // Send confirmation
    const timeDisplay = formatDateTime(parsed.date);
    const recurrenceText = isRecurring ? ` (repeats every ${timeStr})` : "";

    await sock.sendMessage(from, {
      text: formatSuccess(
        "✅ REMINDER SET",
        `📝 *Message:* ${message}\n` +
          `⏰ *When:* ${timeDisplay}${recurrenceText}\n` +
          `🆔 *ID:* #${reminderId}\n\n` +
          `📋 Use .reminders to see all reminders`,
      ),
    });

    console.log(
      `✅ Reminder #${reminderId} set for ${userJid} at ${timeDisplay}`,
    );
  } catch (error) {
    console.error("Reminder error:", error);
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

  if (delay <= 0) {
    // Should have already triggered, trigger immediately
    setTimeout(() => triggerReminder(reminder, sock), 100);
    return;
  }

  setTimeout(() => triggerReminder(reminder, sock), delay);
  console.log(
    `⏰ Reminder #${reminder.id} scheduled in ${Math.round(delay / 1000)}s`,
  );
}

// ============================================================================
//  TRIGGER REMINDER
// ============================================================================
async function triggerReminder(reminder, sock) {
  try {
    if (!reminder.active) return;

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

    console.log(
      `🔔 Reminder #${reminder.id} triggered for ${reminder.userJid}`,
    );

    // Handle recurring reminders
    if (reminder.recurring && reminder.interval) {
      const newTriggerAt = Date.now() + reminder.interval;

      // Update the reminder
      reminder.triggerAt = newTriggerAt;

      // Schedule next occurrence
      scheduleReminder(reminder, sock);

      console.log(
        `🔄 Reminder #${reminder.id} rescheduled for ${new Date(newTriggerAt).toLocaleString()}`,
      );
    } else {
      // Mark as inactive
      reminder.active = false;

      // Remove from store
      const userReminders = global.reminders.get(reminder.userJid);
      if (userReminders) {
        userReminders.delete(reminder.id);
        if (userReminders.size === 0) {
          global.reminders.delete(reminder.userJid);
        }
      }
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
      const timeDisplay = formatReminderTime(new Date(r.triggerAt));
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
    console.error("List reminders error:", error);
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
    console.error("Cancel reminder error:", error);
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
      // Try to extract ID from quoted message
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
            ".snooze 1h\n" +
            ".snooze 30m",
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
        text: formatError(
          "NOT FOUND",
          `Reminder #${reminderId} not found or already completed.`,
        ),
      });
    }

    const reminder = userReminders.get(reminderId);
    const newTriggerAt = Date.now() + parsed;
    reminder.triggerAt = newTriggerAt;

    // Reschedule
    scheduleReminder(reminder, sock);

    await sock.sendMessage(from, {
      text: formatSuccess(
        "⏰ REMINDER SNOOZED",
        `Reminder #${reminderId} snoozed for ${timeStr}\n` +
          `New time: ${formatDateTime(new Date(newTriggerAt))}`,
      ),
    });
  } catch (error) {
    console.error("Snooze error:", error);
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
