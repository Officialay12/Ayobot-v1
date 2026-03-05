// utils/formatters.js - AYOBOT v1 | Created by AYOCODES
import { ENV } from "../index.js";

// ========== CONSTANTS ==========
const CHANNEL_URL =
  process.env.WHATSAPP_CHANNEL ||
  ENV?.WHATSAPP_CHANNEL ||
  "https://whatsapp.com/channel/0029Vb78B9VDzgTDPktNpn25";

// Subtle watermark — only thing added to every response
const WATERMARK = `\n\n⚡ _AYOBOT v1 by AYOCODES_`;

// ========== CORE FORMATTERS ==========
// No titles, no emoji headers, no boxes, no dividers
// Just the content + watermark

export function formatSuccess(title, content) {
  return `${content}${WATERMARK}`;
}

export function formatError(title, content) {
  return `${content}${WATERMARK}`;
}

export function formatInfo(title, content) {
  return `${content}${WATERMARK}`;
}

export function formatData(title, data) {
  let formatted = "";
  for (const [key, value] of Object.entries(data)) {
    formatted += `▸ ${key}: ${value}\n`;
  }
  return `${formatted.trim()}${WATERMARK}`;
}

// ========== GROUP FORMATTERS ==========
export function formatGroupSuccess(title, content) {
  return `${content}${WATERMARK}`;
}

export function formatGroupError(title, content) {
  return `${content}${WATERMARK}`;
}

export function formatGroupInfo(title, content) {
  return `${content}${WATERMARK}`;
}

// ========== UTILITY ==========
export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ========== MENU — keeps full fancy design ==========
export function formatMenu(commands, isAdmin, stats) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  let menu = `╔════════════════════════════════════╗
║          🚀 *AYOBOT v1*            ║
╠════════════════════════════════════╣
║  📅 ${dateStr}  🕒 ${timeStr.padEnd(15)}║
║  ⚡ Uptime: ${stats.uptime.padEnd(24)}║
║  👤 Mode: ${isAdmin ? "ADMIN " : "USER".padEnd(26)}║
║  💾 RAM: ${stats.memory}% (${stats.memoryUsed}MB)              ║
╚════════════════════════════════════╝\n\n`;

  const categories = {};
  commands.forEach((cmd) => {
    if (!categories[cmd.category]) categories[cmd.category] = [];
    categories[cmd.category].push(cmd);
  });

  const categoryOrder = [
    "🔰 AYOBOT",
    "🎬 CONVERSION & MEDIA",
    "📞 CONTACT TOOLS",
    "🎵 MUSIC & MEDIA",
    "🤖 AI & TOOLS",
    "🎮 FUN & GAMES",
    "🔐 ENCRYPTION",
    "💾 STORAGE",
    "📄 DOCUMENTS",
    "👥 GROUP",
    "👑 ADMIN",
  ];

  const sortedCategories = Object.keys(categories).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  sortedCategories.forEach((category) => {
    menu += `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n`;
    menu += `        ${category}\n`;
    menu += `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n\n`;
    categories[category].forEach((cmd) => {
      menu += `${cmd.emoji}  .${cmd.cmd.replace(".", "").padEnd(15)}  ${cmd.desc}\n`;
    });
    menu += `\n`;
  });

  menu += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  menu += `⚡ *Version:* 1.0.0 | 👑 *AYOCODES* | 📞 ${ENV.CREATOR_CONTACT}\n`;
  menu += `📢 *Channel:* ${CHANNEL_URL}`;

  return menu;
}

// ========== COMMAND LIST ==========
export function formatCommandList(commands, category) {
  let output = "";
  commands.forEach((cmd, index) => {
    output += `${(index + 1).toString().padStart(2, "0")}. ${cmd.emoji} .${cmd.cmd.replace(".", "").padEnd(15)} - ${cmd.desc}\n`;
  });
  return `${output.trim()}${WATERMARK}`;
}

// ========== COMMAND HELP ==========
export function formatCommandHelp(command, description, usage, example) {
  return `*${command}*\n\n${description}\n\nUsage: ${usage}\nExample: ${example}${WATERMARK}`;
}

// ========== STATS CARD ==========
export function formatStatsCard(stats) {
  return (
    `*${ENV.BOT_NAME}* v${ENV.BOT_VERSION} | ${ENV.BOT_MODE.toUpperCase()} mode\n` +
    `Uptime: ${stats.uptime}\n` +
    `RAM: ${stats.memoryUsed}MB / ${stats.memoryTotal}MB\n` +
    `Messages: ${stats.messageCount}\n` +
    `Time: ${new Date().toLocaleString()}` +
    WATERMARK
  );
}

// ========== CATEGORY VIEW ==========
export function formatCategoryView(category, commands) {
  let output = `▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n        ${category}\n▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n\n`;
  commands.forEach((cmd) => {
    output += `${cmd.emoji}  .${cmd.cmd.replace(".", "").padEnd(15)}  ${cmd.desc}\n`;
  });
  return `${output.trim()}${WATERMARK}`;
}

// ========== STANDALONE WATERMARK ==========
export function channelFooter() {
  return WATERMARK;
}

export { WATERMARK, CHANNEL_URL };
