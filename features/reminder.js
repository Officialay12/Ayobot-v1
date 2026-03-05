import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

// Store reminders
const reminders = new Map();

// Check reminders every minute
setInterval(() => {
  const now = Date.now();
  for (const [userJid, userReminders] of reminders.entries()) {
    const active = userReminders.filter((r) => r.time <= now);
    const future = userReminders.filter((r) => r.time > now);

    reminders.set(userJid, future);

    // Send active reminders
    active.forEach((r) => {
      // This would need sock object - handled in main handler
      console.log(`Reminder for ${userJid}: ${r.message}`);
    });
  }
}, 60000);

export async function reminder({ fullArgs, from, userJid, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "REMINDER",
        "⏰ *Set a reminder*\n\nUsage: .remind <time> <message>\n\nExamples:\n.remind 10m Take a break\n.remind 1h Meeting\n.remind 2d Birthday\n\nTime formats: s (seconds), m (minutes), h (hours), d (days)",
      ),
    });
    return;
  }

  const parts = fullArgs.split(" ");
  const timeStr = parts[0];
  const message = parts.slice(1).join(" ") || "Reminder";

  // Parse time
  const match = timeStr.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return await sock.sendMessage(from, {
      text: formatError("INVALID TIME", "Use format: 10m, 1h, 2d, etc."),
    });
  }

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  let milliseconds = 0;
  switch (unit) {
    case "s":
      milliseconds = amount * 1000;
      break;
    case "m":
      milliseconds = amount * 60 * 1000;
      break;
    case "h":
      milliseconds = amount * 60 * 60 * 1000;
      break;
    case "d":
      milliseconds = amount * 24 * 60 * 60 * 1000;
      break;
  }

  const reminderTime = Date.now() + milliseconds;

  if (!reminders.has(userJid)) reminders.set(userJid, []);
  reminders.get(userJid).push({
    time: reminderTime,
    message: message,
    from: from,
  });

  const timeDisplay = `${amount}${unit}`;
  const reminderText = `⏰ *Reminder Set*\n\n📝 ${message}\n⏳ In: ${timeDisplay}\n🕒 At: ${new Date(reminderTime).toLocaleString()}`;

  await sock.sendMessage(from, {
    text: formatSuccess("REMINDER SET", reminderText),
  });

  // Set timeout for this specific reminder
  setTimeout(async () => {
    await sock.sendMessage(from, {
      text: formatInfo("⏰ REMINDER", `🔔 *${message}*`),
    });

    // Remove from array
    const userReminders = reminders.get(userJid) || [];
    reminders.set(
      userJid,
      userReminders.filter((r) => r.time !== reminderTime),
    );
  }, milliseconds);
}
