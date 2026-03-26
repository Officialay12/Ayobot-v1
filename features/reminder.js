// features/reminder.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Reminder Module - ABSOLUTELY ACCURATE TIME PARSING WITH PERSISTENCE
//  Author: AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import { formatError, formatInfo, formatSuccess } from '../utils/formatters.js';
import { ENV } from "../index.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
//  CONFIGURATION
// ============================================================================
const CONFIG = {
  MAX_REMINDERS_PER_USER: 50,
  MIN_REMINDER_MS: 10000, // 10 seconds
  MAX_REMINDER_MS: 365 * 24 * 60 * 60 * 1000, // 1 year
  MAX_MESSAGE_LENGTH: 500,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  PERSISTENCE_FILE: path.join(__dirname, '../data/reminders.json'),
  RATE_LIMIT: {
    maxPerMinute: 10,
    windowMs: 60000
  }
};

console.log('🔧 [reminder.js] Module loading...');

// ============================================================================
//  PERSISTENCE MANAGER
// ============================================================================
class PersistenceManager {
  constructor() {
    this.dataDir = path.dirname(CONFIG.PERSISTENCE_FILE);
    this.ensureDataDirectory();
    this.loadReminders();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadReminders() {
    try {
      if (fs.existsSync(CONFIG.PERSISTENCE_FILE)) {
        const data = fs.readFileSync(CONFIG.PERSISTENCE_FILE, 'utf8');
        const parsed = JSON.parse(data);

        // Convert plain objects back to Maps
        global.reminders = new Map();
        for (const [userId, remindersObj] of Object.entries(parsed)) {
          const remindersMap = new Map();
          for (const [id, reminder] of Object.entries(remindersObj)) {
            // Restore Date objects
            reminder.createdAt = new Date(reminder.createdAt);
            reminder.triggerAt = new Date(reminder.triggerAt);
            remindersMap.set(id, reminder);
          }
          global.reminders.set(userId, remindersMap);
        }

        console.log(`✅ [reminder.js] Loaded ${global.reminders.size} users' reminders`);
      } else {
        if (!global.reminders) {
          global.reminders = new Map();
        }
        console.log('✅ [reminder.js] Created new reminders store');
      }
    } catch (error) {
      console.error('❌ [reminder.js] Failed to load reminders:', error);
      if (!global.reminders) {
        global.reminders = new Map();
      }
    }
  }

  saveReminders() {
    try {
      const data = {};
      if (global.reminders) {
        for (const [userId, remindersMap] of global.reminders.entries()) {
          data[userId] = Object.fromEntries(remindersMap);
        }
      }
      fs.writeFileSync(CONFIG.PERSISTENCE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ [reminder.js] Failed to save reminders:', error);
    }
  }
}

// ============================================================================
//  RATE LIMITER
// ============================================================================
class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  isRateLimited(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    const recentRequests = userRequests.filter(
      time => now - time < CONFIG.RATE_LIMIT.windowMs
    );

    if (recentRequests.length >= CONFIG.RATE_LIMIT.maxPerMinute) {
      return true;
    }

    recentRequests.push(now);
    this.requests.set(userId, recentRequests);
    return false;
  }
}

// ============================================================================
//  GLOBAL STORES
// ============================================================================
const persistenceManager = new PersistenceManager();
const rateLimiter = new RateLimiter();
const activeTimeouts = new Map();

// Auto-save every 5 minutes
setInterval(() => {
  persistenceManager.saveReminders();
  console.log('💾 [reminder.js] Auto-saved reminders');
}, 5 * 60 * 1000);

// Save on process exit
process.on('beforeExit', () => {
  persistenceManager.saveReminders();
});

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================

function sanitizeInput(str) {
  if (!str || typeof str !== 'string') return '';
  let cleaned = str.replace(/[<>]/g, '');
  cleaned = cleaned.substring(0, CONFIG.MAX_MESSAGE_LENGTH);
  return cleaned.trim();
}

function formatTimeRemaining(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} hours`;
  return `${Math.round(ms / 86400000)} days`;
}

function formatDateTime(date, timezone = 'UTC') {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
}

function generateReminderId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
//  ACCURATE TIME PARSING
// ============================================================================

function parseDuration(str) {
  if (!str || typeof str !== 'string') return null;

  const strLower = str.toLowerCase().trim();
  console.log(`[reminder.js] Parsing duration: "${strLower}"`);

  const match = strLower.match(/^(\d+)\s*(s(ec|econds?)?|m(in|inutes?)?|h(r|ours?)?|d(ays?)?)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2][0].toLowerCase();

  let ms = 0;
  switch (unit) {
    case 's': ms = value * 1000; break;
    case 'm': ms = value * 60 * 1000; break;
    case 'h': ms = value * 60 * 60 * 1000; break;
    case 'd': ms = value * 24 * 60 * 60 * 1000; break;
    default: return null;
  }

  if (ms > CONFIG.MAX_REMINDER_MS) return null;

  console.log(`[reminder.js] ✅ Duration: ${value}${unit} = ${ms}ms`);
  return ms;
}

function parseTimeOfDay(str, referenceDate = new Date()) {
  if (!str || typeof str !== 'string') return null;

  const strLower = str.toLowerCase().trim();
  const now = new Date(referenceDate);
  const result = new Date(now);

  const timeMatch = strLower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const ampm = timeMatch[3];

  if (hours < 1 || hours > 12) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (ampm) {
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  } else {
    if (hours <= 12) {
      const testDate = new Date(now);
      testDate.setHours(hours, minutes, 0, 0);
      if (testDate < now) {
        testDate.setDate(testDate.getDate() + 1);
      }
      return testDate;
    }
  }

  result.setHours(hours, minutes, 0, 0);

  if (result < now) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

function parseRelativeDate(str, referenceDate = new Date()) {
  if (!str || typeof str !== 'string') return null;

  const strLower = str.toLowerCase().trim();
  const now = new Date(referenceDate);
  const result = new Date(now);

  if (strLower.includes('tomorrow')) {
    result.setDate(result.getDate() + 1);

    const timeMatch = strLower.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/);
    if (timeMatch) {
      const timeDate = parseTimeOfDay(timeMatch[1], result);
      if (timeDate) {
        result.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
      }
    } else {
      result.setHours(9, 0, 0, 0);
    }
    return result;
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (strLower.includes(`next ${days[i]}`)) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      result.setDate(result.getDate() + daysToAdd);

      const timeMatch = strLower.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/);
      if (timeMatch) {
        const timeDate = parseTimeOfDay(timeMatch[1], result);
        if (timeDate) {
          result.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
        }
      } else {
        result.setHours(9, 0, 0, 0);
      }
      return result;
    }
  }

  return null;
}

export function parseTime(timeStr, referenceDate = new Date()) {
  console.log(`\n[reminder.js] 🔍 PARSING TIME: "${timeStr}"`);

  if (!timeStr || typeof timeStr !== 'string') return null;

  let cleanStr = timeStr.toLowerCase().trim();

  const duration = parseDuration(cleanStr);
  if (duration !== null) {
    const result = {
      type: 'duration',
      ms: duration,
      date: new Date(Date.now() + duration)
    };
    console.log(`[reminder.js] ✅ Duration: in ${duration/60000} minutes`);
    return result;
  }

  const timeOfDay = parseTimeOfDay(cleanStr, referenceDate);
  if (timeOfDay) {
    const ms = timeOfDay.getTime() - Date.now();
    console.log(`[reminder.js] ✅ Time of day: in ${ms/60000} minutes`);
    return {
      type: 'absolute',
      ms: ms,
      date: timeOfDay
    };
  }

  const relative = parseRelativeDate(cleanStr, referenceDate);
  if (relative) {
    const ms = relative.getTime() - Date.now();
    console.log(`[reminder.js] ✅ Relative date: in ${ms/60000} minutes`);
    return {
      type: 'absolute',
      ms: ms,
      date: relative
    };
  }

  console.log(`[reminder.js] ❌ No match for "${timeStr}"`);
  return null;
}

// ============================================================================
//  REMINDER SCHEDULER WITH RETRY
// ============================================================================

async function sendReminderWithRetry(reminder, sock, attempt = 1) {
  try {
    await sock.sendMessage(reminder.from, {
      text:
        `╔══════════════════════════╗\n` +
        `║     ⏰ *REMINDER*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📝 *${reminder.message}*\n\n` +
        `🆔 *ID:* ${reminder.id.slice(-8)}\n` +
        `⚡ ${ENV.PREFIX}AYOBOT v1 | 👑 AYOCODES`
    });
    return true;
  } catch (error) {
    console.error(`[reminder.js] ❌ Failed to send reminder (attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS}):`, error);

    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      return sendReminderWithRetry(reminder, sock, attempt + 1);
    }
    return false;
  }
}

function scheduleReminder(reminder, sock) {
  const now = Date.now();
  const delay = reminder.triggerAt.getTime() - now;

  if (delay <= 0) {
    setTimeout(() => triggerReminder(reminder, sock), 100);
    return;
  }

  if (activeTimeouts.has(reminder.id)) {
    clearTimeout(activeTimeouts.get(reminder.id));
    activeTimeouts.delete(reminder.id);
  }

  const timeout = setTimeout(() => triggerReminder(reminder, sock), delay);
  activeTimeouts.set(reminder.id, timeout);
  console.log(`[reminder.js] ⏰ Scheduled reminder ${reminder.id} in ${delay/1000}s`);
}

async function triggerReminder(reminder, sock) {
  try {
    if (!reminder.active) return;

    console.log(`[reminder.js] 🔔 Triggering reminder ${reminder.id}: ${reminder.message}`);
    const success = await sendReminderWithRetry(reminder, sock);

    if (!success) {
      console.error(`[reminder.js] ❌ Failed to send reminder ${reminder.id} after ${CONFIG.RETRY_ATTEMPTS} attempts`);
      if (!reminder.recurring) {
        reminder.active = false;
        cleanupReminder(reminder);
      }
      return;
    }

    if (reminder.recurring && reminder.interval) {
      reminder.triggerAt = new Date(Date.now() + reminder.interval);
      reminder.lastTriggered = new Date();
      scheduleReminder(reminder, sock);
      persistenceManager.saveReminders();
      console.log(`[reminder.js] 🔄 Rescheduled recurring reminder ${reminder.id}`);
    } else {
      reminder.active = false;
      cleanupReminder(reminder);
    }
  } catch (error) {
    console.error('[reminder.js] ❌ Error triggering reminder:', error);
  }
}

function cleanupReminder(reminder) {
  activeTimeouts.delete(reminder.id);

  const userReminders = global.reminders.get(reminder.userJid);
  if (userReminders) {
    userReminders.delete(reminder.id);
    if (userReminders.size === 0) {
      global.reminders.delete(reminder.userJid);
    }
  }

  persistenceManager.saveReminders();
  console.log(`[reminder.js] 🧹 Cleaned up reminder ${reminder.id}`);
}

// ============================================================================
//  MAIN REMINDER FUNCTION
// ============================================================================

export async function reminder(context) {
  try {
    console.log('\n[reminder.js] 📝 NEW REMINDER');
    console.log('[reminder.js] Context:', {
      hasArgs: !!context.args,
      hasFullArgs: !!context.fullArgs,
      from: context.from,
      userJid: context.userJid
    });

    const { args, fullArgs, from, userJid, sock, isAdmin } = context;

    // Rate limiting check
    if (rateLimiter.isRateLimited(userJid)) {
      return sock.sendMessage(from, {
        text: formatError('RATE LIMITED',
          'Please wait a moment before creating more reminders.')
      });
    }

    if (!fullArgs || fullArgs.length < 3) {
      return sock.sendMessage(from, {
        text: formatInfo('⏰ REMINDER',
          `📌 *Usage:*\n` +
          `${ENV.PREFIX}remind <message> by <time>\n` +
          `${ENV.PREFIX}remind <message> every <interval>\n\n` +
          `📋 *Time Formats:*\n` +
          `• 30s, 10m, 2h, 1d\n` +
          `• 1:21pm, 9am, 14:30\n` +
          `• tomorrow 9am\n` +
          `• next monday\n\n` +
          `📝 *Examples:*\n` +
          `${ENV.PREFIX}remind drink water by 1m\n` +
          `${ENV.PREFIX}remind meeting by 1:21pm\n` +
          `${ENV.PREFIX}remind stand every 30m`
        )
      });
    }

    // Parse command
    const lower = fullArgs.toLowerCase();
    let message, timeStr, isRecurring = false;

    if (lower.includes(' by ')) {
      const parts = fullArgs.split(/ by /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
    } else if (lower.includes(' every ')) {
      const parts = fullArgs.split(/ every /i);
      message = parts[0].trim();
      timeStr = parts[1].trim();
      isRecurring = true;
    } else {
      return sock.sendMessage(from, {
        text: formatError('INVALID FORMAT', 'Use "by" or "every"')
      });
    }

    if (!message || !timeStr) {
      return sock.sendMessage(from, {
        text: formatError('INVALID FORMAT', 'Missing message or time.')
      });
    }

    // Sanitize message
    message = sanitizeInput(message);
    if (!message) {
      return sock.sendMessage(from, {
        text: formatError('INVALID MESSAGE', 'Message cannot be empty or contain invalid characters.')
      });
    }

    // Parse time
    const parsed = parseTime(timeStr);
    if (!parsed) {
      return sock.sendMessage(from, {
        text: formatError('INVALID TIME',
          `Could not understand "${timeStr}".\n\n` +
          `✅ Valid formats:\n` +
          `• 1m, 30s, 2h, 1d\n` +
          `• 1:21pm, 9am, 14:30`
        )
      });
    }

    // Validate minimum time
    if (parsed.ms < CONFIG.MIN_REMINDER_MS) {
      return sock.sendMessage(from, {
        text: formatError('TOO SHORT', `Minimum reminder time is ${CONFIG.MIN_REMINDER_MS/1000} seconds.`)
      });
    }

    // Validate maximum time
    if (parsed.ms > CONFIG.MAX_REMINDER_MS) {
      return sock.sendMessage(from, {
        text: formatError('TOO LONG', 'Maximum reminder time is 1 year.')
      });
    }

    // For recurring reminders, must be duration
    if (isRecurring && parsed.type !== 'duration') {
      return sock.sendMessage(from, {
        text: formatError('INVALID INTERVAL',
          'Recurring reminders must use duration (30m, 2h, 1d)')
      });
    }

    // Check user reminder limit
    if (!global.reminders.has(userJid)) {
      global.reminders.set(userJid, new Map());
    }

    const userRemindersMap = global.reminders.get(userJid);
    const currentCount = userRemindersMap.size;
    if (currentCount >= CONFIG.MAX_REMINDERS_PER_USER) {
      return sock.sendMessage(from, {
        text: formatError('LIMIT EXCEEDED',
          `Maximum ${CONFIG.MAX_REMINDERS_PER_USER} reminders per user. Cancel some first.`)
      });
    }

    // Create reminder
    const reminderId = generateReminderId();

    const reminder = {
      id: reminderId,
      from,
      userJid,
      message,
      createdAt: new Date(),
      triggerAt: parsed.date,
      interval: isRecurring ? parsed.ms : null,
      recurring: isRecurring,
      active: true,
      lastTriggered: null
    };

    userRemindersMap.set(reminderId, reminder);

    // Schedule the reminder
    scheduleReminder(reminder, sock);

    // Save to persistence
    persistenceManager.saveReminders();

    // Send confirmation
    const timeDisplay = formatDateTime(parsed.date);
    const timeRemaining = formatTimeRemaining(parsed.ms);
    const recurrenceText = isRecurring ? ` (repeats every ${timeStr})` : '';

    await sock.sendMessage(from, {
      text: formatSuccess('✅ REMINDER SET',
        `📝 *Message:* ${message}\n` +
        `⏰ *When:* ${timeDisplay}\n` +
        `⏳ *In:* ${timeRemaining}${recurrenceText}\n` +
        `🆔 *ID:* ${reminderId.slice(-8)}`
      )
    });

    console.log(`[reminder.js] ✅ Reminder created: ${reminderId}`);

  } catch (error) {
    console.error('[reminder.js] ❌ Reminder error:', error);
    try {
      await context.sock.sendMessage(context.from, {
        text: formatError('ERROR', error.message)
      });
    } catch (_) {}
  }
}

// ============================================================================
//  LIST REMINDERS
// ============================================================================

export async function listReminders(context) {
  try {
    const { from, userJid, sock } = context;
    const userReminders = global.reminders.get(userJid);

    if (!userReminders || userReminders.size === 0) {
      return sock.sendMessage(from, {
        text: formatInfo('📋 REMINDERS', 'You have no active reminders.')
      });
    }

    let text = `╔══════════════════════════╗\n║     📋 *YOUR REMINDERS*   ║\n╚══════════════════════════╝\n\n`;

    const now = Date.now();
    const reminders = Array.from(userReminders.values())
      .filter(r => r.active)
      .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());

    reminders.forEach((r, index) => {
      const timeLeft = r.triggerAt.getTime() - now;
      let timeDisplay;

      if (timeLeft < 60000) timeDisplay = `in ${Math.round(timeLeft / 1000)} seconds`;
      else if (timeLeft < 3600000) timeDisplay = `in ${Math.round(timeLeft / 60000)} minutes`;
      else if (timeLeft < 86400000) timeDisplay = `in ${Math.round(timeLeft / 3600000)} hours`;
      else timeDisplay = `in ${Math.round(timeLeft / 86400000)} days`;

      const recurring = r.recurring ? ' 🔄' : '';
      const shortId = r.id.slice(-8);

      text += `*${index + 1}.* ${r.message}${recurring}\n   ⏰ ${timeDisplay}\n   🆔 ${shortId}\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n💡 Use ${ENV.PREFIX}cancelreminder <id>\n⚡ AYOBOT v1 | 👑 AYOCODES`;

    await sock.sendMessage(from, { text });

  } catch (error) {
    console.error('[reminder.js] ❌ List reminders error:', error);
    await context.sock.sendMessage(context.from, {
      text: formatError('ERROR', error.message)
    });
  }
}

// ============================================================================
//  CANCEL REMINDER
// ============================================================================

export async function cancelReminder(context) {
  try {
    const { args, from, userJid, sock } = context;

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatInfo('CANCEL REMINDER',
          `Usage: ${ENV.PREFIX}cancelreminder <id>\nExample: ${ENV.PREFIX}cancelreminder 5\n` +
          'You can use full ID or last 8 characters')
      });
    }

    const inputId = args[0];
    const userReminders = global.reminders.get(userJid);

    if (!userReminders || userReminders.size === 0) {
      return sock.sendMessage(from, {
        text: formatError('NOT FOUND', 'You have no active reminders.')
      });
    }

    let reminder = null;
    let reminderId = null;

    for (const [id, rem] of userReminders.entries()) {
      if (id === inputId || id.endsWith(inputId)) {
        reminder = rem;
        reminderId = id;
        break;
      }
    }

    if (!reminder) {
      return sock.sendMessage(from, {
        text: formatError('NOT FOUND', `No reminder found with ID "${inputId}".`)
      });
    }

    reminder.active = false;

    if (activeTimeouts.has(reminderId)) {
      clearTimeout(activeTimeouts.get(reminderId));
      activeTimeouts.delete(reminderId);
    }

    userReminders.delete(reminderId);

    if (userReminders.size === 0) {
      global.reminders.delete(userJid);
    }

    persistenceManager.saveReminders();

    await sock.sendMessage(from, {
      text: formatSuccess('✅ REMINDER CANCELLED',
        `Cancelled reminder ${reminderId.slice(-8)}: "${reminder.message}"`)
    });

  } catch (error) {
    console.error('[reminder.js] ❌ Cancel reminder error:', error);
    await context.sock.sendMessage(context.from, {
      text: formatError('ERROR', error.message)
    });
  }
}

// ============================================================================
//  SNOOZE REMINDER
// ============================================================================

export async function snooze(context) {
  try {
    const { args, message, from, userJid, sock } = context;
    const quoted = message.message?.extendedTextMessage?.contextInfo;
    let reminderId = null;

    if (quoted?.quotedMessage) {
      const quotedText = quoted.quotedMessage?.conversation ||
                         quoted.quotedMessage?.extendedTextMessage?.text || '';
      const idMatch = quotedText.match(/🆔 \*ID:\* ([a-zA-Z0-9-]+)/);
      if (idMatch) reminderId = idMatch[1];
    }

    if (!reminderId) {
      return sock.sendMessage(from, {
        text: formatInfo('SNOOZE',
          `Reply to a reminder message with:\n${ENV.PREFIX}snooze <time>\n\nExamples:\n${ENV.PREFIX}snooze 5m`)
      });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatError('MISSING TIME', `Please specify snooze time (e.g., ${ENV.PREFIX}snooze 5m)`)
      });
    }

    const timeStr = args[0];
    const parsed = parseDuration(timeStr);

    if (!parsed) {
      return sock.sendMessage(from, {
        text: formatError('INVALID TIME', 'Use format: 30s, 10m, 2h, 1d')
      });
    }

    const userReminders = global.reminders.get(userJid);
    if (!userReminders || !userReminders.has(reminderId)) {
      return sock.sendMessage(from, {
        text: formatError('NOT FOUND', `Reminder not found.`)
      });
    }

    const reminder = userReminders.get(reminderId);
    const newTriggerAt = new Date(Date.now() + parsed);
    reminder.triggerAt = newTriggerAt;

    if (activeTimeouts.has(reminderId)) {
      clearTimeout(activeTimeouts.get(reminderId));
      activeTimeouts.delete(reminderId);
    }

    scheduleReminder(reminder, sock);
    persistenceManager.saveReminders();

    await sock.sendMessage(from, {
      text: formatSuccess('⏰ REMINDER SNOOZED',
        `Reminder ${reminderId.slice(-8)} snoozed for ${timeStr}\n` +
        `New time: ${formatDateTime(newTriggerAt)}`)
    });

  } catch (error) {
    console.error('[reminder.js] ❌ Snooze error:', error);
    await context.sock.sendMessage(context.from, {
      text: formatError('ERROR', error.message)
    });
  }
}

// ============================================================================
//  CLEANUP EXPIRED REMINDERS ON STARTUP
// ============================================================================

function cleanupExpiredReminders() {
  const now = new Date();
  let cleaned = 0;

  if (global.reminders) {
    for (const [userId, reminders] of global.reminders.entries()) {
      for (const [id, reminder] of reminders.entries()) {
        if (reminder.triggerAt < now && !reminder.recurring) {
          reminders.delete(id);
          cleaned++;
        }
      }
      if (reminders.size === 0) {
        global.reminders.delete(userId);
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[reminder.js] 🧹 Cleaned up ${cleaned} expired reminders`);
    persistenceManager.saveReminders();
  }
}

// Run cleanup on startup
cleanupExpiredReminders();

console.log('✅ [reminder.js] Module loaded successfully');
console.log(`   Exports: reminder, listReminders, cancelReminder, snooze, parseTime`);

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================

export default {
  reminder,
  listReminders,
  cancelReminder,
  snooze,
  parseTime
};
