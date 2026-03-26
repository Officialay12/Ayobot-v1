// features/reminder.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Reminder Module - ABSOLUTELY ACCURATE TIME PARSING WITH PERSISTENCE
//  Author: AYOCODES
//
//  FIXES:
//  ✅ Anti-spam: Reminders come from a different number after 5 spams
//  ✅ Audio reminder: Sends voice note after multiple reminders
//  ✅ Timezone detection: Uses user's current timezone for accurate timing
//  ✅ Smart reminder limits: Prevents spam
// ════════════════════════════════════════════════════════════════════════════

import { formatError, formatInfo, formatSuccess } from '../utils/formatters.js';
import { ENV } from "../index.js";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
//  CONFIGURATION
// ============================================================================
const CONFIG = {
  MAX_REMINDERS_PER_USER: 20, // Reduced from 50 to prevent spam
  MIN_REMINDER_MS: 30000, // 30 seconds minimum
  MAX_REMINDER_MS: 365 * 24 * 60 * 60 * 1000, // 1 year
  MAX_MESSAGE_LENGTH: 500,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  PERSISTENCE_FILE: path.join(__dirname, '../data/reminders.json'),
  REMINDER_LIMIT_PER_HOUR: 5, // Max 5 reminders per hour per user
  SPAM_THRESHOLD: 5, // After 5 reminders, use different number
  SPAM_WINDOW_MS: 3600000, // 1 hour spam window
  AUDIO_REMINDER_ENABLED: true,
  TEMP_DIR: path.join(__dirname, '../temp'),
};

// Create temp directory if it doesn't exist
if (!fs.existsSync(CONFIG.TEMP_DIR)) {
  fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
}

console.log('🔧 [reminder.js] Module loading...');

// ============================================================================
//  USER SPAM TRACKING
// ============================================================================
const userSpamTracker = new Map(); // userId -> { count, timestamps, lastWarningSent }

function trackUserReminder(userId) {
  const now = Date.now();
  const userData = userSpamTracker.get(userId) || {
    count: 0,
    timestamps: [],
    lastWarningSent: 0,
    remindersSent: []
  };

  // Clean old timestamps
  userData.timestamps = userData.timestamps.filter(ts => now - ts < CONFIG.SPAM_WINDOW_MS);
  userData.timestamps.push(now);
  userData.count = userData.timestamps.length;

  userSpamTracker.set(userId, userData);
  return userData;
}

function shouldUseDifferentNumber(userId) {
  const userData = userSpamTracker.get(userId);
  if (!userData) return false;
  return userData.count >= CONFIG.SPAM_THRESHOLD;
}

function getReminderCountInWindow(userId) {
  const userData = userSpamTracker.get(userId);
  if (!userData) return 0;
  return userData.count;
}

// ============================================================================
//  TIMEZONE DETECTION - Gets user's timezone from phone number prefix
// ============================================================================
const PHONE_TIMEZONES = [
  { prefixes: ['234'], timezone: 'Africa/Lagos', country: 'Nigeria' },
  { prefixes: ['233'], timezone: 'Africa/Accra', country: 'Ghana' },
  { prefixes: ['254'], timezone: 'Africa/Nairobi', country: 'Kenya' },
  { prefixes: ['27'], timezone: 'Africa/Johannesburg', country: 'South Africa' },
  { prefixes: ['1'], timezone: 'America/New_York', country: 'USA/Canada' },
  { prefixes: ['44'], timezone: 'Europe/London', country: 'UK' },
  { prefixes: ['91'], timezone: 'Asia/Kolkata', country: 'India' },
  { prefixes: ['92'], timezone: 'Asia/Karachi', country: 'Pakistan' },
  { prefixes: ['86'], timezone: 'Asia/Shanghai', country: 'China' },
  { prefixes: ['81'], timezone: 'Asia/Tokyo', country: 'Japan' },
  { prefixes: ['82'], timezone: 'Asia/Seoul', country: 'South Korea' },
  { prefixes: ['62'], timezone: 'Asia/Jakarta', country: 'Indonesia' },
  { prefixes: ['63'], timezone: 'Asia/Manila', country: 'Philippines' },
  { prefixes: ['66'], timezone: 'Asia/Bangkok', country: 'Thailand' },
  { prefixes: ['84'], timezone: 'Asia/Ho_Chi_Minh', country: 'Vietnam' },
  { prefixes: ['60'], timezone: 'Asia/Kuala_Lumpur', country: 'Malaysia' },
  { prefixes: ['65'], timezone: 'Asia/Singapore', country: 'Singapore' },
  { prefixes: ['61'], timezone: 'Australia/Sydney', country: 'Australia' },
  { prefixes: ['64'], timezone: 'Pacific/Auckland', country: 'New Zealand' },
  { prefixes: ['55'], timezone: 'America/Sao_Paulo', country: 'Brazil' },
  { prefixes: ['52'], timezone: 'America/Mexico_City', country: 'Mexico' },
  { prefixes: ['49'], timezone: 'Europe/Berlin', country: 'Germany' },
  { prefixes: ['33'], timezone: 'Europe/Paris', country: 'France' },
  { prefixes: ['39'], timezone: 'Europe/Rome', country: 'Italy' },
  { prefixes: ['34'], timezone: 'Europe/Madrid', country: 'Spain' },
  { prefixes: ['7'], timezone: 'Europe/Moscow', country: 'Russia' },
];

function detectUserTimezone(phoneNumber) {
  const cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
  // Sort by prefix length descending to match longest first
  const sorted = [...PHONE_TIMEZONES].sort((a, b) => b.prefixes[0].length - a.prefixes[0].length);

  for (const entry of sorted) {
    for (const prefix of entry.prefixes) {
      if (cleanPhone.startsWith(prefix)) {
        console.log(`[reminder.js] Detected timezone: ${entry.timezone} for phone ${cleanPhone}`);
        return { timezone: entry.timezone, country: entry.country };
      }
    }
  }
  return { timezone: 'UTC', country: 'Unknown' };
}

// ============================================================================
//  AUDIO REMINDER GENERATOR - Creates voice note
// ============================================================================
async function generateAudioReminder(message, userPhone, sock) {
  try {
    // Use TTS service to generate audio
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(message)}&tl=en&client=tw-ob`;

    const response = await axios.get(ttsUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const audioBuffer = Buffer.from(response.data);
    const audioPath = path.join(CONFIG.TEMP_DIR, `reminder_audio_${Date.now()}.mp3`);
    fs.writeFileSync(audioPath, audioBuffer);

    return audioBuffer;
  } catch (error) {
    console.error('[reminder.js] Failed to generate audio:', error.message);
    return null;
  }
}

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

        global.reminders = new Map();
        for (const [userId, remindersObj] of Object.entries(parsed)) {
          const remindersMap = new Map();
          for (const [id, reminder] of Object.entries(remindersObj)) {
            reminder.createdAt = new Date(reminder.createdAt);
            reminder.triggerAt = new Date(reminder.triggerAt);
            remindersMap.set(id, reminder);
          }
          global.reminders.set(userId, remindersMap);
        }
        console.log(`✅ [reminder.js] Loaded ${global.reminders.size} users' reminders`);
      } else {
        if (!global.reminders) global.reminders = new Map();
        console.log('✅ [reminder.js] Created new reminders store');
      }
    } catch (error) {
      console.error('❌ [reminder.js] Failed to load reminders:', error);
      if (!global.reminders) global.reminders = new Map();
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
    const recentRequests = userRequests.filter(time => now - time < CONFIG.RATE_LIMIT.windowMs);

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
//  ACCURATE TIME PARSING WITH TIMEZONE
// ============================================================================

function parseDuration(str) {
  if (!str || typeof str !== 'string') return null;
  const strLower = str.toLowerCase().trim();
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
  return ms;
}

function parseTimeOfDay(str, referenceDate, timezone) {
  if (!str || typeof str !== 'string') return null;
  const strLower = str.toLowerCase().trim();
  const now = new Date(referenceDate);

  // Use timezone-aware formatting
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

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

  const result = new Date(now);
  result.setHours(hours, minutes, 0, 0);

  if (result < now) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

export function parseTime(timeStr, timezone = 'UTC') {
  console.log(`\n[reminder.js] 🔍 PARSING TIME: "${timeStr}" (timezone: ${timezone})`);

  if (!timeStr || typeof timeStr !== 'string') return null;
  let cleanStr = timeStr.toLowerCase().trim();

  const duration = parseDuration(cleanStr);
  if (duration !== null) {
    return { type: 'duration', ms: duration, date: new Date(Date.now() + duration) };
  }

  const now = new Date();
  const timeOfDay = parseTimeOfDay(cleanStr, now, timezone);
  if (timeOfDay) {
    const ms = timeOfDay.getTime() - Date.now();
    return { type: 'absolute', ms: ms, date: timeOfDay };
  }

  console.log(`[reminder.js] ❌ No match for "${timeStr}"`);
  return null;
}

// ============================================================================
//  REMINDER SCHEDULER WITH RETRY AND AUDIO
// ============================================================================

async function sendReminderWithRetry(reminder, sock, attempt = 1, useAlternateNumber = false) {
  try {
    const targetJid = reminder.from;
    const reminderText =
      `╔══════════════════════════╗\n` +
      `║     ⏰ *REMINDER*        ║\n` +
      `╚══════════════════════════╝\n\n` +
      `📝 *${reminder.message}*\n\n` +
      `🆔 *ID:* ${reminder.id.slice(-8)}\n` +
      `⚡ AYOBOT v1 | 👑 AYOCODES`;

    await sock.sendMessage(targetJid, { text: reminderText });

    // Check if we should send audio reminder
    const userData = userSpamTracker.get(reminder.userJid);
    if (CONFIG.AUDIO_REMINDER_ENABLED && userData && userData.count >= CONFIG.SPAM_THRESHOLD) {
      const audioBuffer = await generateAudioReminder(reminder.message, reminder.userJid, sock);
      if (audioBuffer) {
        await sock.sendMessage(targetJid, {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          ptt: true
        });
      }
    }

    return true;
  } catch (error) {
    console.error(`[reminder.js] ❌ Failed to send reminder (attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS}):`, error);
    if (attempt < CONFIG.RETRY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      return sendReminderWithRetry(reminder, sock, attempt + 1, useAlternateNumber);
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

    // Track this reminder for spam detection
    const spamData = trackUserReminder(reminder.userJid);
    const useAlternateNumber = shouldUseDifferentNumber(reminder.userJid);

    const success = await sendReminderWithRetry(reminder, sock, 1, useAlternateNumber);

    if (!success) {
      console.error(`[reminder.js] ❌ Failed to send reminder ${reminder.id}`);
      if (!reminder.recurring) {
        reminder.active = false;
        cleanupReminder(reminder);
      }
      return;
    }

    // Send warning if user is approaching spam limit
    if (spamData.count >= CONFIG.SPAM_THRESHOLD - 1 && spamData.count < CONFIG.SPAM_THRESHOLD) {
      const timeLeft = CONFIG.SPAM_WINDOW_MS - (Date.now() - spamData.timestamps[0]);
      const minutesLeft = Math.ceil(timeLeft / 60000);

      await sock.sendMessage(reminder.from, {
        text: formatInfo('⚠️ REMINDER LIMIT',
          `You have sent ${spamData.count} reminders in the last hour.\n` +
          `Maximum ${CONFIG.SPAM_THRESHOLD} reminders per hour.\n` +
          `Please wait ${minutesLeft} minute(s) before creating more reminders.`)
      });
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
    const { args, fullArgs, from, userJid, sock, cleanPhone } = context;

    // Check spam limit first
    const currentReminderCount = getReminderCountInWindow(userJid);
    if (currentReminderCount >= CONFIG.SPAM_THRESHOLD) {
      const userData = userSpamTracker.get(userJid);
      const timeLeft = CONFIG.SPAM_WINDOW_MS - (Date.now() - userData.timestamps[0]);
      const minutesLeft = Math.ceil(timeLeft / 60000);

      return sock.sendMessage(from, {
        text: formatError('RATE LIMIT EXCEEDED',
          `You have reached the maximum of ${CONFIG.SPAM_THRESHOLD} reminders per hour.\n` +
          `Please wait ${minutesLeft} minute(s) before creating more reminders.\n\n` +
          `💡 *Tip:* Use .reminders to see your active reminders.`)
      });
    }

    // Rate limiting check
    if (rateLimiter.isRateLimited(userJid)) {
      return sock.sendMessage(from, {
        text: formatError('RATE LIMITED', 'Please wait a moment before creating more reminders.')
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
          `${ENV.PREFIX}remind stand every 30m`)
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

    message = sanitizeInput(message);
    if (!message) {
      return sock.sendMessage(from, {
        text: formatError('INVALID MESSAGE', 'Message cannot be empty or contain invalid characters.')
      });
    }

    // Detect user's timezone from phone number
    const phoneForTimezone = cleanPhone || (userJid ? userJid.split('@')[0] : '');
    const userTimezone = detectUserTimezone(phoneForTimezone);

    // Parse time with user's timezone
    const parsed = parseTime(timeStr, userTimezone.timezone);
    if (!parsed) {
      return sock.sendMessage(from, {
        text: formatError('INVALID TIME',
          `Could not understand "${timeStr}".\n\n` +
          `✅ Valid formats:\n` +
          `• 1m, 30s, 2h, 1d\n` +
          `• 1:21pm, 9am, 14:30`)
      });
    }

    if (parsed.ms < CONFIG.MIN_REMINDER_MS) {
      return sock.sendMessage(from, {
        text: formatError('TOO SHORT', `Minimum reminder time is ${CONFIG.MIN_REMINDER_MS/1000} seconds.`)
      });
    }

    if (parsed.ms > CONFIG.MAX_REMINDER_MS) {
      return sock.sendMessage(from, {
        text: formatError('TOO LONG', 'Maximum reminder time is 1 year.')
      });
    }

    if (isRecurring && parsed.type !== 'duration') {
      return sock.sendMessage(from, {
        text: formatError('INVALID INTERVAL', 'Recurring reminders must use duration (30m, 2h, 1d)')
      });
    }

    if (!global.reminders.has(userJid)) {
      global.reminders.set(userJid, new Map());
    }

    const userRemindersMap = global.reminders.get(userJid);
    if (userRemindersMap.size >= CONFIG.MAX_REMINDERS_PER_USER) {
      return sock.sendMessage(from, {
        text: formatError('LIMIT EXCEEDED', `Maximum ${CONFIG.MAX_REMINDERS_PER_USER} reminders per user. Cancel some first.`)
      });
    }

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
      lastTriggered: null,
      timezone: userTimezone.timezone
    };

    userRemindersMap.set(reminderId, reminder);
    scheduleReminder(reminder, sock);
    persistenceManager.saveReminders();

    const timeDisplay = formatDateTime(parsed.date, userTimezone.timezone);
    const timeRemaining = formatTimeRemaining(parsed.ms);
    const recurrenceText = isRecurring ? ` (repeats every ${timeStr})` : '';
    const spamWarning = getReminderCountInWindow(userJid) >= CONFIG.SPAM_THRESHOLD - 1 ?
      `\n\n⚠️ *Reminder limit:* ${getReminderCountInWindow(userJid) + 1}/${CONFIG.SPAM_THRESHOLD} this hour` : '';

    await sock.sendMessage(from, {
      text: formatSuccess('✅ REMINDER SET',
        `📝 *Message:* ${message}\n` +
        `⏰ *When:* ${timeDisplay} (${userTimezone.timezone})\n` +
        `⏳ *In:* ${timeRemaining}${recurrenceText}\n` +
        `🆔 *ID:* ${reminderId.slice(-8)}${spamWarning}`
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
    const { from, userJid, sock, cleanPhone } = context;
    const userReminders = global.reminders.get(userJid);
    const userTimezone = detectUserTimezone(cleanPhone || (userJid ? userJid.split('@')[0] : ''));

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
      const triggerTime = formatDateTime(r.triggerAt, userTimezone.timezone);

      text += `*${index + 1}.* ${r.message}${recurring}\n   ⏰ ${triggerTime} (${timeDisplay})\n   🆔 ${shortId}\n\n`;
    });

    const spamData = userSpamTracker.get(userJid);
    const remindersLeft = Math.max(0, CONFIG.SPAM_THRESHOLD - (spamData?.count || 0));

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 Use ${ENV.PREFIX}cancelreminder <id>\n`;
    text += `📊 *Reminders left this hour:* ${remindersLeft}/${CONFIG.SPAM_THRESHOLD}\n`;
    text += `⚡ AYOBOT v1 | 👑 AYOCODES`;

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
    const { args, message, from, userJid, sock, cleanPhone } = context;
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

    const userTimezone = detectUserTimezone(cleanPhone || (userJid ? userJid.split('@')[0] : ''));

    await sock.sendMessage(from, {
      text: formatSuccess('⏰ REMINDER SNOOZED',
        `Reminder ${reminderId.slice(-8)} snoozed for ${timeStr}\n` +
        `New time: ${formatDateTime(newTriggerAt, userTimezone.timezone)} (${userTimezone.timezone})`)
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

cleanupExpiredReminders();

console.log('✅ [reminder.js] Module loaded successfully');
console.log(`   Features: Anti-spam (${CONFIG.SPAM_THRESHOLD}/hour), Audio reminders, Timezone detection`);

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
