import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMINDERS_FILE = path.join(__dirname, "../data/reminders.json");

// ── Persistence ────────────────────────────────────────────────────────────

function loadReminders() {
  try {
    if (!fs.existsSync(REMINDERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(REMINDERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveReminders(data) {
  try {
    const dir = path.dirname(REMINDERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[reminders] Save failed:", err.message);
  }
}

// ── Time Parser ────────────────────────────────────────────────────────────
// Supports: 10m, 2h, 1d, 2am, 9pm, 14:30, 3:45pm, "by 2am", "in 30 minutes"

function parseTime(timeStr) {
  const now = new Date();
  const raw = timeStr
    .trim()
    .toLowerCase()
    .replace(/^(by|in)\s+/, "");

  // Relative: 10m, 2h, 30s, 1d
  const relShort = raw.match(/^(\d+)([smhd])$/);
  if (relShort) {
    const amount = parseInt(relShort[1]);
    const unit = relShort[2];
    const ms =
      unit === "s"
        ? amount * 1000
        : unit === "m"
          ? amount * 60 * 1000
          : unit === "h"
            ? amount * 60 * 60 * 1000
            : unit === "d"
              ? amount * 24 * 60 * 60 * 1000
              : 0;
    return ms ? new Date(now.getTime() + ms) : null;
  }

  // Relative: "30 minutes", "2 hours", "1 day"
  const relLong = raw.match(
    /^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days)$/,
  );
  if (relLong) {
    const amount = parseInt(relLong[1]);
    const unit = relLong[2];
    const ms = unit.startsWith("s")
      ? amount * 1000
      : unit.startsWith("m")
        ? amount * 60 * 1000
        : unit.startsWith("h")
          ? amount * 60 * 60 * 1000
          : unit.startsWith("d")
            ? amount * 24 * 60 * 60 * 1000
            : 0;
    return ms ? new Date(now.getTime() + ms) : null;
  }

  // Absolute: 2am, 9pm, 11:30pm, 14:00
  const absTime = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (absTime) {
    let hours = parseInt(absTime[1]);
    const minutes = parseInt(absTime[2] || "0");
    const meridiem = absTime[3];

    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }

  return null;
}

function humanReadable(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second${s !== 1 ? "s" : ""}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m !== 1 ? "s" : ""}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""}`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? "s" : ""}`;
}

// ── Voice Note via Google TTS + ffmpeg ────────────────────────────────────

async function generateVoiceNote(text) {
  try {
    const encoded = encodeURIComponent(text.substring(0, 200));
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=tw-ob`;

    const res = await axios.get(ttsUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const mp3Path = path.join(dataDir, `reminder_${Date.now()}.mp3`);
    const opusPath = mp3Path.replace(".mp3", ".ogg");

    fs.writeFileSync(mp3Path, res.data);
    await execAsync(`ffmpeg -y -i "${mp3Path}" -c:a libopus "${opusPath}"`);
    fs.unlinkSync(mp3Path); // cleanup mp3

    return opusPath;
  } catch (err) {
    console.warn("[voice] Generation failed:", err.message);
    return null;
  }
}

// ── Fire Reminder ─────────────────────────────────────────────────────────

const SPAM_MESSAGES = (message) => [
  `⏰ *WAKE UP!* ⏰\n\nYou told me to remind you bout this:\n\n*"${message}"*\n\nDon't sleep on it fam, let's go! 🔥`,
  `🚨 *YO! STILL YOU!* 🚨\n\n*"${message}"*\n\nBro get up and handle your business fr fr 💪`,
  `😤 *Ping #3 and I'm not stopping...*\n\n*"${message}"*\n\nYou set this for a reason. MOVE. ⚡`,
  `👀 *I see you ignoring me...*\n\n*"${message}"*\n\nFourth ping. Last friendly one. 😤🔔`,
  `✅ *FINAL PING — No more after this*\n\n*"${message}"*\n\nThat's 5 reminders bestie. From here it's on YOU chief 👑\n\n— AYOBOT v1 by AYOCODES`,
];

async function fireReminder(reminder, sock) {
  const { from, message, id } = reminder;

  console.log(`[reminders] 🔔 Firing: "${message}" → ${from}`);

  // ── 5 spam messages with 4s gap ──────────────────────────────
  const spams = SPAM_MESSAGES(message);
  for (let i = 0; i < spams.length; i++) {
    try {
      await sock.sendMessage(from, { text: spams[i] });
      if (i < spams.length - 1) {
        await new Promise((res) => setTimeout(res, 4000));
      }
    } catch (err) {
      console.error(`[reminders] Spam #${i + 1} failed:`, err.message);
    }
  }

  // ── Voice note ───────────────────────────────────────────────
  try {
    const voiceText = `Yo! This is your reminder. You said: ${message}. Time to handle it. Let's go!`;
    const voicePath = await generateVoiceNote(voiceText);

    if (voicePath && fs.existsSync(voicePath)) {
      await sock.sendMessage(from, {
        audio: fs.readFileSync(voicePath),
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      });
      fs.unlinkSync(voicePath);
    }
  } catch (err) {
    console.warn("[reminders] Voice note failed:", err.message);
  }

  // ── Remove fired reminder from store ─────────────────────────
  const store = loadReminders();
  for (const jid in store) {
    store[jid] = store[jid].filter((r) => r.id !== id);
    if (!store[jid].length) delete store[jid];
  }
  saveReminders(store);
}

// ── Scheduler (call once on bot start) ───────────────────────────────────

export function startReminderScheduler(sock) {
  console.log("[reminders] ✅ Scheduler started");

  setInterval(() => {
    const now = Date.now();
    const store = loadReminders();

    for (const jid in store) {
      for (const reminder of store[jid]) {
        if (now >= reminder.fireAt) {
          fireReminder(reminder, sock);
        }
      }
    }
  }, 15 * 1000); // check every 15 seconds
}

// ── .remind command ───────────────────────────────────────────────────────

export async function reminder({ fullArgs, from, userJid, sock }) {
  if (!fullArgs?.trim()) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "⏰ REMINDER",
        "Set a reminder and I'll spam you when it's time + drop a voice note 🔥\n\n" +
          "*Usage:*\n" +
          ".remind <message> by <time>\n\n" +
          "*Examples:*\n" +
          "  .remind take meds by 8pm\n" +
          "  .remind gym by 6:30am\n" +
          "  .remind call mum by 2h\n" +
          "  .remind drink water by 30m\n\n" +
          "*Time formats:*\n" +
          "  30s • 10m • 2h • 1d\n" +
          "  8pm • 14:30 • 6:30am",
      ),
    });
    return;
  }

  // ── Split on " by " ──────────────────────────────────────────
  const byIndex = fullArgs.toLowerCase().lastIndexOf(" by ");

  if (byIndex === -1) {
    await sock.sendMessage(from, {
      text: formatError(
        "INVALID FORMAT",
        'Missing "by" keyword fam 😅\n\nTry: .remind take meds by 9pm',
      ),
    });
    return;
  }

  const message = fullArgs.substring(0, byIndex).trim();
  const timeStr = fullArgs.substring(byIndex + 4).trim();

  if (!message) {
    await sock.sendMessage(from, {
      text: formatError(
        "NO MESSAGE",
        "What should I remind you about? 🤔\nExample: .remind study by 8pm",
      ),
    });
    return;
  }

  if (!timeStr) {
    await sock.sendMessage(from, {
      text: formatError(
        "NO TIME",
        "When should I remind you? ⏰\nExample: .remind study by 8pm",
      ),
    });
    return;
  }

  const fireAt = parseTime(timeStr);

  if (!fireAt) {
    await sock.sendMessage(from, {
      text: formatError(
        "BAD TIME",
        `Couldn't read *"${timeStr}"* as a time 😕\n\nValid formats:\n  • 9pm / 2am\n  • 14:30 / 6:30am\n  • 30m / 2h / 1d`,
      ),
    });
    return;
  }

  // ── Build & save reminder ────────────────────────────────────
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newReminder = {
    id,
    from,
    message,
    fireAt: fireAt.getTime(),
    createdAt: Date.now(),
  };

  const store = loadReminders();
  if (!store[userJid]) store[userJid] = [];
  store[userJid].push(newReminder);
  saveReminders(store);

  // ── Also set a live setTimeout as backup ────────────────────
  const msUntilFire = fireAt.getTime() - Date.now();
  setTimeout(() => fireReminder(newReminder, sock), msUntilFire);

  // ── Confirm message ──────────────────────────────────────────
  const timeLabel = fireAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const dateLabel = fireAt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const inLabel = humanReadable(msUntilFire);

  await sock.sendMessage(from, {
    text: formatSuccess(
      "⏰ REMINDER SET 🔥",
      `📝 *${message}*\n\n` +
        `🕒 Fires at: *${timeLabel}* on *${dateLabel}*\n` +
        `⏳ That's in: *${inLabel}*\n\n` +
        `I'll spam you 5 times + drop a voice note. You won't miss it fr 😤🔔`,
    ),
  });
}

// ── .reminders — list active ──────────────────────────────────────────────

export async function listReminders({ from, userJid, sock }) {
  const store = loadReminders();
  const userReminders = store[userJid] || [];

  if (!userReminders.length) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "📋 REMINDERS",
        "No active reminders rn.\n\nSet one with: .remind <message> by <time>",
      ),
    });
    return;
  }

  const list = userReminders
    .sort((a, b) => a.fireAt - b.fireAt)
    .map((r, i) => {
      const t = new Date(r.fireAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const inMs = r.fireAt - Date.now();
      const inLabel = inMs > 0 ? `in ${humanReadable(inMs)}` : "firing soon";
      return `${i + 1}. *${r.message}*\n   ⏰ ${t} (${inLabel})`;
    })
    .join("\n\n");

  await sock.sendMessage(from, {
    text: formatSuccess(`📋 YOUR REMINDERS (${userReminders.length})`, list),
  });
}

// ── .cancelreminder — cancel by number ───────────────────────────────────

export async function cancelReminder({ fullArgs, from, userJid, sock }) {
  const store = loadReminders();
  const userReminders = (store[userJid] || []).sort(
    (a, b) => a.fireAt - b.fireAt,
  );

  if (!fullArgs?.trim() || isNaN(parseInt(fullArgs.trim()))) {
    await sock.sendMessage(from, {
      text: formatError(
        "INVALID",
        "Use .reminders to see your list then:\n.cancelreminder <number>",
      ),
    });
    return;
  }

  const index = parseInt(fullArgs.trim()) - 1;

  if (index < 0 || index >= userReminders.length) {
    await sock.sendMessage(from, {
      text: formatError(
        "NOT FOUND",
        `No reminder at position ${index + 1}.\nYou have ${userReminders.length} active reminder${userReminders.length !== 1 ? "s" : ""}.`,
      ),
    });
    return;
  }

  const removed = userReminders[index];
  store[userJid] = userReminders.filter((r) => r.id !== removed.id);
  if (!store[userJid].length) delete store[userJid];
  saveReminders(store);

  await sock.sendMessage(from, {
    text: formatSuccess(
      "🗑️ REMINDER CANCELLED",
      `*"${removed.message}"* has been removed. Gone fr 💨`,
    ),
  });
}
