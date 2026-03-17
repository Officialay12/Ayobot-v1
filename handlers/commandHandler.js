// handlers/commandHandler.js - AYOBOT v1.5.0 ENHANCED EDITION
// ════════════════════════════════════════════════════════════════════════════
//  Command Handler - Complete System with ALL Features
//  Author  : AYOCODES
//  Version : 1.5.0 ENHANCED
//  Features: 60+ command registration, full permission system, session management
// ════════════════════════════════════════════════════════════════════════════

import {
  commandUsage,
  deletedMessages,
  ENV,
  isAdmin,
  isAuthorized,
  messageCount,
  sessionManager,
  userRateLimits,
} from "../index.js";

import { isBotGroupAdminCached } from "../utils/validators.js";
import {
  formatError,
  formatGroupError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";

// ════════════════════════════════════════════════════════════════════════════
//  LOGGING UTILITIES - ENHANCED
// ════════════════════════════════════════════════════════════════════════════
const Colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
  },
};

const log = {
  ok: (msg) => console.log(`${Colors.fg.green}✅${Colors.reset} ${msg}`),
  err: (msg) => console.log(`${Colors.fg.red}❌${Colors.reset} ${msg}`),
  warn: (msg) => console.log(`${Colors.fg.yellow}⚠️${Colors.reset} ${msg}`),
  info: (msg) => console.log(`${Colors.fg.cyan}ℹ️${Colors.reset} ${msg}`),
  cmd: (msg) => console.log(`${Colors.fg.magenta}⚡${Colors.reset} ${msg}`),
  success: (msg) =>
    console.log(`${Colors.fg.green}${Colors.bright}✓${Colors.reset} ${msg}`),
  title: (msg) =>
    console.log(`\n${Colors.fg.blue}${Colors.bright}${msg}${Colors.reset}\n`),
  divider: () =>
    console.log(`${Colors.fg.cyan}${"─".repeat(60)}${Colors.reset}`),
};

// ════════════════════════════════════════════════════════════════════════════
//  RATE LIMITING SYSTEM
// ════════════════════════════════════════════════════════════════════════════
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(userId) {
    const now = Date.now();
    if (!this.requests.has(userId)) {
      this.requests.set(userId, []);
    }

    const userRequests = this.requests.get(userId);
    const recentRequests = userRequests.filter(
      (time) => now - time < this.windowMs,
    );
    this.requests.set(userId, recentRequests);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    return true;
  }

  getRemaining(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    const recentRequests = userRequests.filter(
      (time) => now - time < this.windowMs,
    );
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  getRemainingTime(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    if (userRequests.length === 0) return 0;
    const oldestRequest = Math.min(...userRequests);
    return Math.max(0, this.windowMs - (now - oldestRequest));
  }
}

const rateLimiter = new RateLimiter(15, 60000); // 15 requests per minute

// ════════════════════════════════════════════════════════════════════════════
//  MODULE LOADING SYSTEM - ENHANCED WITH DEPENDENCY TRACKING
// ════════════════════════════════════════════════════════════════════════════
log.title("📦 AYOBOT v1.5.0 - MODULE LOADING SYSTEM");

const modules = {
  admin: { loaded: false, path: "../commands/group/admin.js", exports: {} },
  basic: { loaded: false, path: "../commands/group/basic.js", exports: {} },
  ai: { loaded: false, path: "../features/ai.js", exports: {} },
  calculator: { loaded: false, path: "../features/calculator.js", exports: {} },
  crypto: { loaded: false, path: "../features/crypto.js", exports: {} },
  dictionary: { loaded: false, path: "../features/dictionary.js", exports: {} },
  downloader: { loaded: false, path: "../features/downloader.js", exports: {} },
  encryption: { loaded: false, path: "../features/encryption.js", exports: {} },
  games: { loaded: false, path: "../features/games.js", exports: {} },
  imageTools: { loaded: false, path: "../features/imageTools.js", exports: {} },
  jokes: { loaded: false, path: "../features/jokes.js", exports: {} },
  movies: { loaded: false, path: "../features/movies.js", exports: {} },
  music: { loaded: false, path: "../features/music.js", exports: {} },
  news: { loaded: false, path: "../features/news.js", exports: {} },
  notes: { loaded: false, path: "../features/notes.js", exports: {} },
  quotes: { loaded: false, path: "../features/quotes.js", exports: {} },
  reminder: { loaded: false, path: "../features/reminder.js", exports: {} },
  security: { loaded: false, path: "../features/security.js", exports: {} },
  stocks: { loaded: false, path: "../features/stocks.js", exports: {} },
  translation: {
    loaded: false,
    path: "../features/translation.js",
    exports: {},
  },
  tts: { loaded: false, path: "../features/tts.js", exports: {} },
  unitConverter: {
    loaded: false,
    path: "../features/unitConverter.js",
    exports: {},
  },
  groupCore: { loaded: false, path: "../commands/group/core.js", exports: {} },
  groupModeration: {
    loaded: false,
    path: "../commands/group/moderation.js",
    exports: {},
  },
  groupSettings: {
    loaded: false,
    path: "../commands/group/settings.js",
    exports: {},
  },
};

async function loadModule(key) {
  const mod = modules[key];
  try {
    const imported = await import(mod.path);
    mod.exports = imported;
    mod.loaded = true;
    log.ok(`${key} module loaded`);
    return true;
  } catch (error) {
    log.warn(`${key} module failed: ${error.message.substring(0, 60)}`);
    mod.loaded = false;
    return false;
  }
}

async function loadAllModules() {
  log.divider();
  const moduleKeys = Object.keys(modules);
  const results = await Promise.allSettled(
    moduleKeys.map((key) => loadModule(key)),
  );

  const loaded = results.filter(
    (r) => r.status === "fulfilled" && r.value,
  ).length;
  log.divider();
  log.success(`Loaded ${loaded}/${moduleKeys.length} modules`);
  console.log();
}

// Load all modules on startup
await loadAllModules();

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND REGISTRY SYSTEM - ADVANCED
// ════════════════════════════════════════════════════════════════════════════
const commands = new Map();
const commandStats = new Map();
const commandMetadata = new Map();

/**
 * Register a command with metadata and options
 * @param {string} name - Command name
 * @param {Function} handler - Command handler function
 * @param {Object} options - Command options
 */
function reg(name, handler, options = {}) {
  if (typeof handler !== "function") {
    log.warn(`Cannot register ${name}: not a function`);
    return false;
  }

  const cmdName = name.toLowerCase();
  const metadata = {
    name: cmdName,
    handler,
    category: options.category || "general",
    description: options.description || "No description",
    usage: options.usage || "",
    adminOnly: options.adminOnly === true,
    groupOnly: options.groupOnly === true,
    requireBotAdmin: options.requireBotAdmin === true,
    cooldown: options.cooldown || 0,
    enabled: options.enabled !== false,
    aliases: options.aliases || [],
    createdAt: new Date(),
  };

  commands.set(cmdName, {
    handler,
    ...metadata,
  });

  commandMetadata.set(cmdName, metadata);
  commandStats.set(cmdName, { uses: 0, errors: 0, avgTime: 0 });

  log.cmd(`Registered: ${name}`);
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND REGISTRATION - COMPLETE SYSTEM
// ════════════════════════════════════════════════════════════════════════════
log.title("📝 COMMAND REGISTRATION SYSTEM");

export function registerAllCommands() {
  log.divider();
  let totalCount = 0;

  // ── BASIC COMMANDS ─────────────────────────────────────────────────────
  if (modules.basic.loaded) {
    const b = modules.basic.exports;
    if (typeof b.menu === "function") {
      reg("menu", b.menu, {
        category: "core",
        description: "Display all available commands",
        aliases: ["help", "commands", "cmds", "h"],
      });
      totalCount += 4;
    }
    if (typeof b.ping === "function") {
      reg("ping", b.ping, {
        category: "core",
        description: "Check bot response time",
        aliases: ["pong", "latency", "speed"],
      });
      totalCount += 4;
    }
    if (typeof b.status === "function") {
      reg("status", b.status, {
        category: "core",
        description: "View your user status",
        aliases: ["me", "profile", "whoami"],
      });
      totalCount += 4;
    }
    if (typeof b.creator === "function") {
      reg("creator", b.creator, {
        category: "core",
        description: "Get creator contact info",
        aliases: ["maker", "dev", "owner"],
      });
      totalCount += 4;
    }
    if (typeof b.creatorGit === "function") {
      reg("creatorsgit", b.creatorGit, {
        category: "core",
        description: "View creator GitHub",
        aliases: ["github", "git"],
      });
      totalCount += 3;
    }
    if (typeof b.auto === "function") {
      reg("auto", b.auto, {
        category: "core",
        description: "Toggle auto-reply",
        aliases: ["autoreply", "chatbot"],
      });
      totalCount += 3;
    }
    if (typeof b.weather === "function") {
      reg("weather", b.weather, {
        category: "info",
        description: "Get weather information",
        aliases: ["w", "forecast"],
      });
      totalCount += 3;
    }
    if (typeof b.connectInfo === "function") {
      reg("connect", b.connectInfo, {
        category: "core",
        description: "Get community links",
        aliases: ["connectinfo"],
      });
      totalCount += 2;
    }
    if (typeof b.time === "function") {
      reg("time", b.time, {
        category: "info",
        description: "Get world time",
        aliases: ["worldtime"],
      });
      totalCount += 2;
    }
    if (typeof b.prefixinfo === "function") {
      reg("prefixinfo", b.prefixinfo, {
        category: "core",
        description: "Show prefix info",
        aliases: ["preinfo"],
      });
      totalCount += 2;
    }
    if (typeof b.getip === "function") {
      reg("getip", b.getip, {
        category: "web",
        description: "Lookup IP address",
        aliases: ["ip", "iplookup"],
      });
      totalCount += 3;
    }
    if (typeof b.myip === "function") {
      reg("myip", b.myip, {
        category: "web",
        description: "Get your public IP",
      });
      totalCount++;
    }
    if (typeof b.whois === "function") {
      reg("whois", b.whois, {
        category: "web",
        description: "WHOIS domain lookup",
        aliases: ["domain"],
      });
      totalCount += 2;
    }
    if (typeof b.dns === "function") {
      reg("dns", b.dns, {
        category: "web",
        description: "DNS records lookup",
        aliases: ["dnslookup"],
      });
      totalCount += 2;
    }
    if (typeof b.jarvis === "function") {
      reg("jarvis", b.jarvis, {
        category: "ai",
        description: "Jarvis AI assistant",
        aliases: ["j", "ask"],
      });
      totalCount += 3;
    }
    if (typeof b.test === "function") {
      reg("test", b.test, {
        category: "debug",
        description: "Test bot functionality",
      });
      totalCount++;
    }
    if (typeof b.shorten === "function") {
      reg("shorten", b.shorten, {
        category: "web",
        description: "Shorten URL",
        aliases: ["short"],
      });
      totalCount += 2;
    }
    if (typeof b.viewOnce === "function") {
      reg("vv", b.viewOnce, {
        category: "media",
        description: "View once messages",
        aliases: ["viewonce"],
      });
      totalCount += 2;
    }
    if (typeof b.joinWaitlist === "function") {
      reg("jointrend", b.joinWaitlist, {
        category: "misc",
        description: "Join waitlist",
        aliases: ["waitlist"],
      });
      totalCount += 2;
    }
    if (typeof b.scrape === "function") {
      reg("scrape", b.scrape, {
        category: "web",
        description: "Advanced web scraping",
      });
      totalCount++;
    }
    if (typeof b.url === "function") {
      reg("url", b.url, {
        category: "web",
        description: "Get URL information",
      });
      totalCount++;
    }
    if (typeof b.fetch === "function") {
      reg("fetch", b.fetch, {
        category: "web",
        description: "Fetch web content",
      });
      totalCount++;
    }
    if (typeof b.qencode === "function") {
      reg("qencode", b.qencode, {
        category: "tools",
        description: "Encode QR code",
        aliases: ["qr"],
      });
      totalCount += 2;
    }
    if (typeof b.take === "function") {
      reg("take", b.take, {
        category: "media",
        description: "Take sticker from image",
      });
      totalCount++;
    }
    if (typeof b.screenshot === "function") {
      reg("screenshot", b.screenshot, {
        category: "web",
        description: "Take website screenshot",
        aliases: ["ss"],
      });
      totalCount += 2;
    }
    if (typeof b.inspect === "function") {
      reg("inspect", b.inspect, {
        category: "web",
        description: "Inspect webpage",
      });
      totalCount++;
    }
    if (typeof b.imgbb === "function") {
      reg("imgbb", b.imgbb, {
        category: "media",
        description: "Upload image to ImgBB",
      });
      totalCount++;
    }
    if (typeof b.pdf === "function") {
      reg("pdf", b.pdf, {
        category: "tools",
        description: "Generate PDF document",
      });
      totalCount++;
    }
    if (typeof b.getpp === "function") {
      reg("getpp", b.getpp, {
        category: "profile",
        description: "Get profile picture",
      });
      totalCount++;
    }
    if (typeof b.getgpp === "function") {
      reg("getgpp", b.getgpp, {
        category: "profile",
        description: "Get group picture",
        groupOnly: true,
      });
      totalCount++;
    }
  }

  // ── AI COMMANDS ────────────────────────────────────────────────────────
  if (modules.ai.loaded) {
    const a = modules.ai.exports;
    if (typeof a.ai === "function") {
      reg("ai", a.ai, {
        category: "ai",
        description: "Chat with AI",
        aliases: ["ayobot"],
      });
      totalCount += 2;
    }
    if (typeof a.summarize === "function") {
      reg("summarize", a.summarize, {
        category: "ai",
        description: "Summarize text",
        aliases: ["summary"],
      });
      totalCount += 2;
    }
    if (typeof a.grammar === "function") {
      reg("grammar", a.grammar, {
        category: "ai",
        description: "Check grammar",
        aliases: ["spellcheck"],
      });
      totalCount += 2;
    }
  }

  // ── CALCULATOR ─────────────────────────────────────────────────────────
  if (modules.calculator.loaded) {
    const c = modules.calculator.exports;
    if (typeof c.calculate === "function") {
      reg("calc", c.calculate, {
        category: "tools",
        description: "Calculator",
        aliases: ["calculate", "math", "="],
      });
      totalCount += 4;
    }
  }

  // ── CRYPTO ─────────────────────────────────────────────────────────────
  if (modules.crypto.loaded) {
    const cr = modules.crypto.exports;
    if (typeof cr.crypto === "function") {
      reg("crypto", cr.crypto, {
        category: "info",
        description: "Crypto prices",
        aliases: ["coin"],
      });
      totalCount += 2;
    }
  }

  // ── DICTIONARY ─────────────────────────────────────────────────────────
  if (modules.dictionary.loaded) {
    const d = modules.dictionary.exports;
    if (typeof d.dict === "function") {
      reg("dict", d.dict, {
        category: "info",
        description: "Dictionary lookup",
        aliases: ["dictionary", "define"],
      });
      totalCount += 3;
    }
  }

  // ── DOWNLOADER ─────────────────────────────────────────────────────────
  if (modules.downloader.loaded) {
    const dl = modules.downloader.exports;
    if (typeof dl.youtube === "function") {
      reg("youtube", dl.youtube, {
        category: "downloader",
        description: "Download YouTube video",
        aliases: ["yt"],
      });
      totalCount += 2;
    }
    if (typeof dl.tiktok === "function") {
      reg("tiktok", dl.tiktok, {
        category: "downloader",
        description: "Download TikTok video",
        aliases: ["tt"],
      });
      totalCount += 2;
    }
    if (typeof dl.spotify === "function") {
      reg("spotify", dl.spotify, {
        category: "downloader",
        description: "Get Spotify track",
      });
      totalCount++;
    }
  }

  // ── ENCRYPTION ─────────────────────────────────────────────────────────
  if (modules.encryption.loaded) {
    const e = modules.encryption.exports;
    if (typeof e.encrypt === "function") {
      reg("encrypt", e.encrypt, {
        category: "security",
        description: "Encrypt text",
      });
      totalCount++;
    }
    if (typeof e.decrypt === "function") {
      reg("decrypt", e.decrypt, {
        category: "security",
        description: "Decrypt text",
      });
      totalCount++;
    }
    if (typeof e.hash === "function") {
      reg("hash", e.hash, {
        category: "security",
        description: "Hash text",
      });
      totalCount++;
    }
    if (typeof e.password === "function") {
      reg("password", e.password, {
        category: "security",
        description: "Generate password",
      });
      totalCount++;
    }
  }

  // ── GAMES ──────────────────────────────────────────────────────────────
  if (modules.games.loaded) {
    const g = modules.games.exports;
    if (typeof g.rps === "function") {
      reg("rps", g.rps, {
        category: "games",
        description: "Rock paper scissors",
      });
      totalCount++;
    }
    if (typeof g.dice === "function") {
      reg("dice", g.dice, {
        category: "games",
        description: "Roll dice",
      });
      totalCount++;
    }
    if (typeof g.coinFlip === "function") {
      reg("flip", g.coinFlip, {
        category: "games",
        description: "Flip coin",
      });
      totalCount++;
    }
  }

  // ── IMAGE TOOLS ────────────────────────────────────────────────────────
  if (modules.imageTools.loaded) {
    const img = modules.imageTools.exports;
    if (typeof img.sticker === "function") {
      reg("sticker", img.sticker, {
        category: "media",
        description: "Make sticker",
        aliases: ["s"],
      });
      totalCount += 2;
    }
    if (typeof img.toimage === "function") {
      reg("toimage", img.toimage, {
        category: "media",
        description: "Convert to image",
      });
      totalCount++;
    }
    if (typeof img.tovideo === "function") {
      reg("tovideo", img.tovideo, {
        category: "media",
        description: "Convert to video",
      });
      totalCount++;
    }
    if (typeof img.toaudio === "function") {
      reg("toaudio", img.toaudio, {
        category: "media",
        description: "Convert to audio",
      });
      totalCount++;
    }
    if (typeof img.removebg === "function") {
      reg("removebg", img.removebg, {
        category: "media",
        description: "Remove background",
      });
      totalCount++;
    }
  }

  // ── JOKES ──────────────────────────────────────────────────────────────
  if (modules.jokes.loaded) {
    const j = modules.jokes.exports;
    if (typeof j.joke === "function") {
      reg("joke", j.joke, {
        category: "fun",
        description: "Tell joke",
        aliases: ["laugh"],
      });
      totalCount += 2;
    }
  }

  // ── MOVIES ─────────────────────────────────────────────────────────────
  if (modules.movies.loaded) {
    const m = modules.movies.exports;
    if (typeof m.movie === "function") {
      reg("movie", m.movie, {
        category: "info",
        description: "Get movie info",
      });
      totalCount++;
    }
  }

  // ── MUSIC ──────────────────────────────────────────────────────────────
  if (modules.music.loaded) {
    const mu = modules.music.exports;
    if (typeof mu.play === "function") {
      reg("play", mu.play, {
        category: "music",
        description: "Play song",
      });
      totalCount++;
    }
    if (typeof mu.lyrics === "function") {
      reg("lyrics", mu.lyrics, {
        category: "music",
        description: "Get lyrics",
      });
      totalCount++;
    }
  }

  // ── NEWS ───────────────────────────────────────────────────────────────
  if (modules.news.loaded) {
    const n = modules.news.exports;
    if (typeof n.news === "function") {
      reg("news", n.news, {
        category: "info",
        description: "Get news",
      });
      totalCount++;
    }
  }

  // ── NOTES ──────────────────────────────────────────────────────────────
  if (modules.notes.loaded) {
    const nt = modules.notes.exports;
    if (typeof nt.note === "function") {
      reg("note", nt.note, {
        category: "storage",
        description: "Save note",
      });
      totalCount++;
    }
    if (typeof nt.getnote === "function") {
      reg("getnote", nt.getnote, {
        category: "storage",
        description: "Get note",
      });
      totalCount++;
    }
    if (typeof nt.notes === "function") {
      reg("notes", nt.notes, {
        category: "storage",
        description: "List notes",
      });
      totalCount++;
    }
  }

  // ── QUOTES ─────────────────────────────────────────────────────────────
  if (modules.quotes.loaded) {
    const q = modules.quotes.exports;
    if (typeof q.quote === "function") {
      reg("quote", q.quote, {
        category: "fun",
        description: "Get quote",
        aliases: ["motivation"],
      });
      totalCount += 2;
    }
  }

  // ── REMINDER ───────────────────────────────────────────────────────────
  if (modules.reminder.loaded) {
    const r = modules.reminder.exports;
    if (typeof r.reminder === "function") {
      reg("remind", r.reminder, {
        category: "storage",
        description: "Set reminder",
        aliases: ["reminder"],
      });
      totalCount += 2;
    }
  }

  // ── SECURITY ───────────────────────────────────────────────────────────
  if (modules.security.loaded) {
    const sec = modules.security.exports;
    if (typeof sec.security === "function") {
      reg("security", sec.security, {
        category: "security",
        description: "Security tools",
      });
      totalCount++;
    }
  }

  // ── STOCKS ─────────────────────────────────────────────────────────────
  if (modules.stocks.loaded) {
    const s = modules.stocks.exports;
    if (typeof s.stock === "function") {
      reg("stock", s.stock, {
        category: "info",
        description: "Stock prices",
      });
      totalCount++;
    }
  }

  // ── TRANSLATION ────────────────────────────────────────────────────────
  if (modules.translation.loaded) {
    const t = modules.translation.exports;
    if (typeof t.translate === "function") {
      reg("translate", t.translate, {
        category: "tools",
        description: "Translate text",
        aliases: ["tr"],
      });
      totalCount += 2;
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────
  if (modules.tts.loaded) {
    const tt = modules.tts.exports;
    if (typeof tt.tts === "function") {
      reg("tts", tt.tts, {
        category: "media",
        description: "Text to speech",
        aliases: ["voice"],
      });
      totalCount += 2;
    }
  }

  // ── UNIT CONVERTER ─────────────────────────────────────────────────────
  if (modules.unitConverter.loaded) {
    const uc = modules.unitConverter.exports;
    if (typeof uc.convert === "function") {
      reg("convert", uc.convert, {
        category: "tools",
        description: "Unit converter",
        aliases: ["conv"],
      });
      totalCount += 2;
    }
  }

  // ── GROUP CORE ─────────────────────────────────────────────────────────
  if (modules.groupCore.loaded) {
    const gc = modules.groupCore.exports;
    if (typeof gc.kick === "function") {
      reg("kick", gc.kick, {
        category: "group",
        description: "Kick member",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      totalCount++;
    }
    if (typeof gc.add === "function") {
      reg("add", gc.add, {
        category: "group",
        description: "Add member",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof gc.promote === "function") {
      reg("promote", gc.promote, {
        category: "group",
        description: "Make admin",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      totalCount++;
    }
    if (typeof gc.demote === "function") {
      reg("demote", gc.demote, {
        category: "group",
        description: "Remove admin",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      totalCount++;
    }
    if (typeof gc.link === "function") {
      reg("link", gc.link, {
        category: "group",
        description: "Get group link",
        groupOnly: true,
      });
      totalCount++;
    }
    if (typeof gc.admins === "function") {
      reg("admins", gc.admins, {
        category: "group",
        description: "List admins",
        groupOnly: true,
      });
      totalCount++;
    }
    if (typeof gc.tagall === "function") {
      reg("tagall", gc.tagall, {
        category: "group",
        description: "Tag all members",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof gc.hidetag === "function") {
      reg("hidetag", gc.hidetag, {
        category: "group",
        description: "Hidden tag",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
  }

  // ── GROUP MODERATION ───────────────────────────────────────────────────
  if (modules.groupModeration.loaded) {
    const gm = modules.groupModeration.exports;
    if (typeof gm.ban === "function") {
      reg("ban", gm.ban, {
        category: "group",
        description: "Ban member",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      totalCount++;
    }
    if (typeof gm.warn === "function") {
      reg("warn", gm.warn, {
        category: "group",
        description: "Warn member",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof gm.mute === "function") {
      reg("mute", gm.mute, {
        category: "group",
        description: "Mute group",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
  }

  // ── GROUP SETTINGS ─────────────────────────────────────────────────────
  if (modules.groupSettings.loaded) {
    const gs = modules.groupSettings.exports;
    if (typeof gs.antilink === "function") {
      reg("antilink", gs.antilink, {
        category: "group",
        description: "Anti-link mode",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof gs.welcome === "function") {
      reg("welcome", gs.welcome, {
        category: "group",
        description: "Welcome message",
        groupOnly: true,
        adminOnly: true,
      });
      totalCount++;
    }
  }

  // ── ADMIN COMMANDS ─────────────────────────────────────────────────────
  if (modules.admin.loaded) {
    const adm = modules.admin.exports;
    if (typeof adm.addUser === "function") {
      reg("adduser", adm.addUser, {
        category: "admin",
        description: "Whitelist user",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.removeUser === "function") {
      reg("removeuser", adm.removeUser, {
        category: "admin",
        description: "Remove from whitelist",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.listUsers === "function") {
      reg("listusers", adm.listUsers, {
        category: "admin",
        description: "List whitelisted users",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.mode === "function") {
      reg("mode", adm.mode, {
        category: "admin",
        description: "Change bot mode",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.broadcast === "function") {
      reg("broadcast", adm.broadcast, {
        category: "admin",
        description: "Broadcast message",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.stats === "function") {
      reg("stats", adm.stats, {
        category: "admin",
        description: "Bot statistics",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.restart === "function") {
      reg("restart", adm.restart, {
        category: "admin",
        description: "Restart bot",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.shutdown === "function") {
      reg("shutdown", adm.shutdown, {
        category: "admin",
        description: "Shutdown bot",
        adminOnly: true,
      });
      totalCount++;
    }
    if (typeof adm.eval === "function") {
      reg("eval", adm.eval, {
        category: "admin",
        description: "Execute code",
        adminOnly: true,
      });
      totalCount++;
    }
  }

  log.divider();
  log.success(`Successfully registered ${commands.size} commands`);
  console.log();
}

registerAllCommands();

// ════════════════════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS - UTILITIES
// ════════════════════════════════════════════════════════════════════════════

function safeJid(jid) {
  if (!jid) return "";
  if (typeof jid === "object") {
    if (jid.user && jid.server) return `${jid.user}@${jid.server}`;
    if (jid._serialized) return jid._serialized;
    if (jid.id) return jid.id;
    return "";
  }
  return String(jid).trim();
}

function safePhone(jid) {
  const cleanJid = safeJid(jid);
  const phone = cleanJid.split("@")[0].split(":")[0];
  return phone.replace(/[^0-9]/g, "");
}

function parseCommandArguments(text) {
  const args = text.split(/\s+/);
  const cmd = args.shift()?.toLowerCase() || "";
  return {
    command: cmd,
    args: args,
    fullArgs: args.join(" "),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMMAND HANDLER - FULLY FEATURED
// ════════════════════════════════════════════════════════════════════════════
export async function handleCommand(message, sock) {
  const handleStartTime = Date.now();

  try {
    // ── Basic message extraction ─────────────────────────────────────────
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const isDM = from.endsWith("@s.whatsapp.net") || from.endsWith("@lid");
    const fromMe = !!message.key.fromMe;

    // ── Session context ──────────────────────────────────────────────────
    const session = message._session || null;
    const ownerPhone =
      message._ownerPhone ||
      session?.ownerPhone ||
      ENV.CREATOR_CONTACT ||
      "2349159180375";
    const sessionMode =
      message._sessionMode || session?.mode || ENV.BOT_MODE || "public";
    const sessionId = message._sessionId || session?.id || "";

    // ── Resolve sender ───────────────────────────────────────────────────
    let rawSenderJid;
    if (isGroup) {
      rawSenderJid = message.key.participant || from;
    } else if (fromMe) {
      const phone = (sock?.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      rawSenderJid = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      rawSenderJid = from;
    }

    const cleanPhone = safePhone(rawSenderJid);
    const userJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSenderJid;
    if (!userJid || !cleanPhone) return;

    // ── Permission flags ────────────────────────────────────────────────
    const isAdminUser = fromMe || isAdmin(userJid, ownerPhone);
    const isAuthorizedUser =
      isAdminUser || isAuthorized(userJid, ownerPhone, sessionMode);

    // ── Extract message text ────────────────────────────────────────────
    const m = message.message || {};
    const msgText =
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      "";

    if (!msgText || !msgText.trim()) return;

    const trimmed = msgText.trim();
    if (!trimmed.startsWith(ENV.PREFIX)) return;

    // ── Parse command ───────────────────────────────────────────────────
    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const {
      command: commandName,
      args,
      fullArgs,
    } = parseCommandArguments(body);
    if (!commandName) return;

    // ── LOGGING ─────────────────────────────────────────────────────────
    const cmdLog = `${ENV.PREFIX}${commandName}`;
    const userLog = `${cleanPhone}${isGroup ? ` [GROUP: ${from}]` : ""}`;
    log.info(`${cmdLog} from ${userLog}`);

    // ── Find command ────────────────────────────────────────────────────
    const command = commands.get(commandName);
    if (!command) {
      log.warn(`Unknown command: ${commandName}`);
      await sock.sendMessage(from, {
        text: formatInfo(
          "UNKNOWN COMMAND",
          `❓ *${ENV.PREFIX}${commandName}* is not a recognized command.\n\n` +
            `Type *${ENV.PREFIX}menu* to see all available commands!`,
        ),
      });
      return;
    }

    // ── Track command usage ─────────────────────────────────────────────
    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    const userCmds = commandUsage.get(userJid);
    userCmds[commandName] = (userCmds[commandName] || 0) + 1;

    const stats = commandStats.get(commandName) || {
      uses: 0,
      errors: 0,
      avgTime: 0,
    };
    stats.uses++;
    commandStats.set(commandName, stats);

    // ── PRIVATE MODE CHECK ──────────────────────────────────────────────
    if (sessionMode === "private" && !isAdminUser) {
      log.warn(`PRIVATE MODE: ${cleanPhone} blocked`);
      return sock.sendMessage(from, {
        text:
          `🔒 *PRIVATE MODE*\n\n` +
          `This bot is currently set to *private*.\n` +
          `Only the bot owner can use commands.\n\n` +
          `⚡ _AYOBOT v1.5.0 by AYOCODES_`,
      });
    }

    // ── RATE LIMITING ───────────────────────────────────────────────────
    if (!isAdminUser && !rateLimiter.isAllowed(userJid)) {
      const remaining = rateLimiter.getRemainingTime(userJid);
      const seconds = Math.ceil(remaining / 1000);
      log.warn(`RATE LIMIT: ${cleanPhone}`);
      return sock.sendMessage(from, {
        text: formatError(
          "RATE LIMITED",
          `⏱️ You're sending too many commands!\n\nPlease wait *${seconds}s* before trying again.`,
        ),
      });
    }

    // ── Admin-only check ────────────────────────────────────────────────
    if (command.adminOnly && !isAdminUser) {
      log.warn(`ADMIN ONLY: ${cleanPhone} tried ${cmdLog}`);
      return sock.sendMessage(from, {
        text: formatError(
          "ACCESS DENIED",
          "⛔ This command is for the *bot owner* only.",
        ),
      });
    }

    // ── Group-only check ────────────────────────────────────────────────
    if (command.groupOnly && !isGroup) {
      log.warn(`GROUP ONLY: ${cleanPhone} tried ${cmdLog}`);
      return sock.sendMessage(from, {
        text: formatError(
          "GROUP ONLY",
          `👥 *${ENV.PREFIX}${commandName}* only works in groups.`,
        ),
      });
    }

    // ── Bot admin requirement check ─────────────────────────────────────
    if (command.requireBotAdmin && isGroup) {
      let botIsAdmin = false;
      try {
        botIsAdmin = await isBotGroupAdminCached(from, sock);
      } catch (_) {}
      if (!botIsAdmin) {
        log.warn(`BOT NOT ADMIN: ${cmdLog}`);
        return sock.sendMessage(from, {
          text: formatGroupError(
            "BOT NOT ADMIN",
            `❌ I need group admin rights for *${ENV.PREFIX}${commandName}*.\n\n` +
              `Please promote me to admin first!`,
          ),
        });
      }
    }

    // ── Command execution ───────────────────────────────────────────────
    try {
      const execStartTime = Date.now();
      log.cmd(`Executing: ${cmdLog}`);

      // Pass complete context
      const context = {
        args,
        fullArgs,
        message,
        from,
        groupJid: isGroup ? from : null,
        userJid,
        cleanPhone,
        isGroup,
        isDM,
        fromMe,
        sock,
        isAdmin: isAdminUser,
        isAuthorized: isAuthorizedUser,
        commandName,
        prefix: ENV.PREFIX,
        session,
        sessionId,
        sessionMode,
        ownerPhone,
      };

      await command.handler(context);

      const execTime = Date.now() - execStartTime;
      const prevAvg = stats.avgTime || 0;
      stats.avgTime = (prevAvg + execTime) / 2;
      commandStats.set(commandName, stats);

      log.success(`${cmdLog} completed (${execTime}ms)`);
    } catch (cmdError) {
      const stats = commandStats.get(commandName) || {
        uses: 0,
        errors: 0,
        avgTime: 0,
      };
      stats.errors++;
      commandStats.set(commandName, stats);

      log.err(`${cmdLog} error: ${cmdError.message.substring(0, 80)}`);

      try {
        await sock.sendMessage(from, {
          text: formatError(
            "COMMAND ERROR",
            `❌ *${ENV.PREFIX}${commandName}* encountered an error:\n\n` +
              `${cmdError.message || "Unknown error"}\n\n` +
              `_Please try again or contact support_`,
          ),
        });
      } catch (_) {}
    }

    // ── Final logging ───────────────────────────────────────────────────
    const totalTime = Date.now() - handleStartTime;
    if (totalTime > 2000) {
      log.warn(`Slow command ${cmdLog}: ${totalTime}ms`);
    }
  } catch (fatalError) {
    log.err(`FATAL: ${fatalError.message}`);
    try {
      await sock.sendMessage(from, {
        text: "❌ A fatal error occurred. Please try again.",
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND METADATA & EXPORTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get command metadata
 * @param {string} cmdName
 * @returns {Object|null}
 */
export function getCommandMetadata(cmdName) {
  return commandMetadata.get(cmdName.toLowerCase()) || null;
}

/**
 * Get all commands by category
 * @param {string} category
 * @returns {Array}
 */
export function getCommandsByCategory(category) {
  return Array.from(commands.values()).filter(
    (cmd) => cmd.category.toLowerCase() === category.toLowerCase(),
  );
}

/**
 * Get command statistics
 * @param {string} cmdName
 * @returns {Object}
 */
export function getCommandStats(cmdName) {
  return (
    commandStats.get(cmdName.toLowerCase()) || {
      uses: 0,
      errors: 0,
      avgTime: 0,
    }
  );
}

/**
 * Get all statistics
 * @returns {Object}
 */
export function getAllStats() {
  return {
    totalCommands: commands.size,
    commandStats: Object.fromEntries(commandStats),
    totalUsage: Array.from(commandStats.values()).reduce(
      (sum, s) => sum + s.uses,
      0,
    ),
    totalErrors: Array.from(commandStats.values()).reduce(
      (sum, s) => sum + s.errors,
      0,
    ),
  };
}

/**
 * Reload commands
 */
export async function reloadCommands() {
  log.title("🔄 RELOADING COMMANDS");
  commands.clear();
  commandStats.clear();
  commandMetadata.clear();
  await loadAllModules();
  registerAllCommands();
  log.success("Commands reloaded");
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════════════════════
export { commands, commandStats, modules };
