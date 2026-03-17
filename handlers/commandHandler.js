// handlers/commandHandler.js - AYOBOT v1.5.0 MULTI-SESSION EDITION
// ════════════════════════════════════════════════════════════════════════════
//  Command Handler - COMPATIBLE with MongoDB multi-session
//  Author  : AYOCODES
//  Version : 1.5.0
// ════════════════════════════════════════════════════════════════════════════

import {
  bannedUsers,
  commandUsage,
  ENV,
  isAdmin,
  isAuthorized,
} from "../index.js";

import {
  formatError,
  formatGroupError,
  formatInfo,
} from "../utils/formatters.js";
import { isBotGroupAdminCached } from "../utils/validators.js";

// ════════════════════════════════════════════════════════════════════════════
//  LOGGING UTILITIES
// ════════════════════════════════════════════════════════════════════════════

const Colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
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
  success: (msg) => console.log(`${Colors.fg.green}✓${Colors.reset} ${msg}`),
  title: (msg) =>
    console.log(`\n${Colors.fg.blue}${Colors.bright}${msg}${Colors.reset}\n`),
  divider: () =>
    console.log(`${Colors.fg.cyan}${"─".repeat(60)}${Colors.reset}`),
};

// ════════════════════════════════════════════════════════════════════════════
//  RATE LIMITING SYSTEM
// ════════════════════════════════════════════════════════════════════════════

class RateLimiter {
  constructor(maxRequests = 15, windowMs = 60000) {
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

  getRemainingTime(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    if (userRequests.length === 0) return 0;
    const oldestRequest = Math.min(...userRequests);
    return Math.max(0, this.windowMs - (now - oldestRequest));
  }
}

const rateLimiter = new RateLimiter();

// ════════════════════════════════════════════════════════════════════════════
//  MODULE LOADING SYSTEM
// ════════════════════════════════════════════════════════════════════════════

log.title("📦 AYOBOT v1.5.0 - LOADING MODULES");

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

await loadAllModules();

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND REGISTRY
// ════════════════════════════════════════════════════════════════════════════

const commands = new Map();
const commandStats = new Map();
const commandMetadata = new Map();

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

  commands.set(cmdName, { handler, ...metadata });
  commandMetadata.set(cmdName, metadata);
  commandStats.set(cmdName, { uses: 0, errors: 0, avgTime: 0 });

  log.cmd(`Registered: ${name}`);
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND REGISTRATION - COMPLETE
// ════════════════════════════════════════════════════════════════════════════

log.title("📝 REGISTERING COMMANDS");

export function registerAllCommands() {
  log.divider();
  let totalCount = 0;

  // ── BASIC COMMANDS ─────────────────────────────────────────────────────
  if (modules.basic.loaded) {
    const b = modules.basic.exports;
    if (typeof b.menu === "function") {
      reg("menu", b.menu, {
        category: "core",
        description: "Show all commands",
        aliases: ["help", "commands", "h"],
      });
      totalCount += 4;
    }
    if (typeof b.ping === "function") {
      reg("ping", b.ping, {
        category: "core",
        description: "Check latency",
        aliases: ["pong", "latency"],
      });
      totalCount += 3;
    }
    if (typeof b.status === "function") {
      reg("status", b.status, {
        category: "core",
        description: "Your status",
        aliases: ["me", "profile"],
      });
      totalCount += 3;
    }
    if (typeof b.creator === "function") {
      reg("creator", b.creator, {
        category: "core",
        description: "Creator info",
        aliases: ["dev", "owner"],
      });
      totalCount += 3;
    }
    if (typeof b.creatorGit === "function") {
      reg("github", b.creatorGit, {
        category: "core",
        description: "GitHub",
        aliases: ["git"],
      });
      totalCount += 2;
    }
    if (typeof b.auto === "function") {
      reg("auto", b.auto, {
        category: "core",
        description: "Auto-reply",
        aliases: ["autoreply"],
      });
      totalCount += 2;
    }
    if (typeof b.weather === "function") {
      reg("weather", b.weather, {
        category: "info",
        description: "Weather",
        aliases: ["w", "forecast"],
      });
      totalCount += 3;
    }
    if (typeof b.connectInfo === "function") {
      reg("connect", b.connectInfo, {
        category: "core",
        description: "Community links",
        aliases: ["community"],
      });
      totalCount += 2;
    }
    if (typeof b.time === "function") {
      reg("time", b.time, {
        category: "info",
        description: "World time",
        aliases: ["worldtime"],
      });
      totalCount += 2;
    }
    if (typeof b.prefixinfo === "function") {
      reg("prefix", b.prefixinfo, {
        category: "core",
        description: "Prefix info",
        aliases: ["preinfo"],
      });
      totalCount += 2;
    }
    if (typeof b.getip === "function") {
      reg("ip", b.getip, {
        category: "web",
        description: "IP lookup",
        aliases: ["getip", "iplookup"],
      });
      totalCount += 3;
    }
    if (typeof b.myip === "function") {
      reg("myip", b.myip, { category: "web", description: "Your IP" });
      totalCount++;
    }
    if (typeof b.whois === "function") {
      reg("whois", b.whois, {
        category: "web",
        description: "WHOIS lookup",
        aliases: ["domain"],
      });
      totalCount += 2;
    }
    if (typeof b.dns === "function") {
      reg("dns", b.dns, {
        category: "web",
        description: "DNS lookup",
        aliases: ["dnslookup"],
      });
      totalCount += 2;
    }
    if (typeof b.jarvis === "function") {
      reg("jarvis", b.jarvis, {
        category: "ai",
        description: "Jarvis AI",
        aliases: ["j", "ask"],
      });
      totalCount += 3;
    }
    if (typeof b.jarvisVoice === "function") {
      reg("jarvisv", b.jarvisVoice, {
        category: "ai",
        description: "Jarvis voice",
        aliases: ["jv", "speak"],
      });
      totalCount += 3;
    }
    if (typeof b.test === "function") {
      reg("test", b.test, { category: "debug", description: "Test command" });
      totalCount++;
    }
    if (typeof b.shorten === "function") {
      reg("shorten", b.shorten, {
        category: "web",
        description: "Shorten URL",
        aliases: ["short", "tiny"],
      });
      totalCount += 3;
    }
    if (typeof b.viewOnce === "function") {
      reg("vv", b.viewOnce, {
        category: "media",
        description: "View once",
        aliases: ["viewonce", "open"],
      });
      totalCount += 3;
    }
    if (typeof b.joinWaitlist === "function") {
      reg("waitlist", b.joinWaitlist, {
        category: "misc",
        description: "Join waitlist",
        aliases: ["jointrend"],
      });
      totalCount += 2;
    }
    if (typeof b.scrape === "function") {
      reg("scrape", b.scrape, {
        category: "web",
        description: "Web scrape",
        aliases: ["scraper"],
      });
      totalCount += 2;
    }
    if (typeof b.url === "function") {
      reg("url", b.url, { category: "web", description: "URL info" });
      totalCount++;
    }
    if (typeof b.fetch === "function") {
      reg("fetch", b.fetch, { category: "web", description: "Fetch URL" });
      totalCount++;
    }
    if (typeof b.qencode === "function") {
      reg("qr", b.qencode, {
        category: "tools",
        description: "QR code",
        aliases: ["qrcode", "qencode"],
      });
      totalCount += 3;
    }
    if (typeof b.take === "function") {
      reg("take", b.take, {
        category: "media",
        description: "Take sticker",
        aliases: ["takesticker"],
      });
      totalCount += 2;
    }
    if (typeof b.screenshot === "function") {
      reg("screenshot", b.screenshot, {
        category: "web",
        description: "Screenshot",
        aliases: ["ss", "capture"],
      });
      totalCount += 3;
    }
    if (typeof b.inspect === "function") {
      reg("inspect", b.inspect, {
        category: "web",
        description: "Inspect page",
      });
      totalCount++;
    }
    if (typeof b.imgbb === "function") {
      reg("imgbb", b.imgbb, {
        category: "media",
        description: "Upload image",
        aliases: ["upload"],
      });
      totalCount += 2;
    }
    if (typeof b.pdf === "function") {
      reg("pdf", b.pdf, { category: "tools", description: "Make PDF" });
      totalCount++;
    }
    if (typeof b.getpp === "function") {
      reg("getpp", b.getpp, {
        category: "profile",
        description: "Profile pic",
        aliases: ["pp", "profilepic"],
      });
      totalCount += 3;
    }
    if (typeof b.getgpp === "function") {
      reg("getgpp", b.getgpp, {
        category: "profile",
        description: "Group pic",
        groupOnly: true,
        aliases: ["gpp"],
      });
      totalCount += 2;
    }
  }

  // ── AI COMMANDS ────────────────────────────────────────────────────────
  if (modules.ai.loaded) {
    const a = modules.ai.exports;

    // FIXED: Register "ayobot" as main command with proper aliases
    if (typeof a.ai === "function") {
      reg("ayobot", a.ai, {
        category: "ai",
        description: "Chat with AI",
        aliases: ["ai", "ask", "chat", "bot"], // Removed duplicate "ayobot"
      });
      totalCount += 4;
      console.log(`✅ Registered: .ayobot (aliases: .ai, .ask, .chat)`);
    }

    if (typeof a.aiClear === "function") {
      reg("aiclear", a.aiClear, {
        category: "ai",
        description: "Clear AI chat",
        aliases: ["clearchat", "resetai"],
      });
      totalCount += 3;
    }

    if (typeof a.summarize === "function") {
      reg("summarize", a.summarize, {
        category: "ai",
        description: "Summarize text",
        aliases: ["summary", "tldr", "sum"],
      });
      totalCount += 4;
    }

    if (typeof a.grammar === "function") {
      reg("grammar", a.grammar, {
        category: "ai",
        description: "Spell & grammar check",
        aliases: ["spell", "spellcheck"],
      });
      totalCount += 3;
    }
  }

  // ── CALCULATOR ─────────────────────────────────────────────────────────
  if (modules.calculator.loaded) {
    const c = modules.calculator.exports;
    if (typeof c.calculate === "function") {
      reg("calc", c.calculate, {
        category: "tools",
        description: "Calculator",
        aliases: ["math", "="],
      });
      totalCount += 3;
    }
  }

  // ── CRYPTO ─────────────────────────────────────────────────────────────
  if (modules.crypto.loaded) {
    const cr = modules.crypto.exports;
    if (typeof cr.crypto === "function") {
      reg("crypto", cr.crypto, {
        category: "info",
        description: "Crypto price",
        aliases: ["coin", "btc"],
      });
      totalCount += 3;
    }
    if (typeof cr.cryptoTop === "function") {
      reg("cryptotop", cr.cryptoTop, {
        category: "info",
        description: "Top crypto",
        aliases: ["top10"],
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
        description: "Dictionary",
        aliases: ["define", "meaning"],
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
        description: "YouTube",
        aliases: ["yt", "ytdl"],
      });
      totalCount += 3;
    }
    if (typeof dl.tiktok === "function") {
      reg("tiktok", dl.tiktok, {
        category: "downloader",
        description: "TikTok",
        aliases: ["tt", "tok"],
      });
      totalCount += 3;
    }
    if (typeof dl.spotify === "function") {
      reg("spotify", dl.spotify, {
        category: "downloader",
        description: "Spotify",
        aliases: ["sp"],
      });
      totalCount += 2;
    }
    if (typeof dl.play === "function") {
      reg("play", dl.play, {
        category: "downloader",
        description: "Play music",
        aliases: ["mp3"],
      });
      totalCount += 2;
    }
    if (typeof dl.instagram === "function") {
      reg("instagram", dl.instagram, {
        category: "downloader",
        description: "Instagram",
        aliases: ["ig", "insta"],
      });
      totalCount += 3;
    }
    if (typeof dl.facebook === "function") {
      reg("facebook", dl.facebook, {
        category: "downloader",
        description: "Facebook",
        aliases: ["fb"],
      });
      totalCount += 2;
    }
    if (typeof dl.twitter === "function") {
      reg("twitter", dl.twitter, {
        category: "downloader",
        description: "Twitter",
        aliases: ["x", "tweet"],
      });
      totalCount += 3;
    }
  }

  // ── ENCRYPTION ─────────────────────────────────────────────────────────
  if (modules.encryption.loaded) {
    const e = modules.encryption.exports;
    if (typeof e.encrypt === "function") {
      reg("encrypt", e.encrypt, {
        category: "security",
        description: "Encrypt text",
        aliases: ["enc"],
      });
      totalCount += 2;
    }
    if (typeof e.decrypt === "function") {
      reg("decrypt", e.decrypt, {
        category: "security",
        description: "Decrypt text",
        aliases: ["dec"],
      });
      totalCount += 2;
    }
    if (typeof e.hash === "function") {
      reg("hash", e.hash, {
        category: "security",
        description: "Hash text",
        aliases: ["md5"],
      });
      totalCount += 2;
    }
    if (typeof e.password === "function") {
      reg("password", e.password, {
        category: "security",
        description: "Gen password",
        aliases: ["genpass"],
      });
      totalCount += 2;
    }
  }

  // ── GAMES ──────────────────────────────────────────────────────────────
  if (modules.games.loaded) {
    const g = modules.games.exports;
    if (typeof g.rps === "function") {
      reg("rps", g.rps, {
        category: "games",
        description: "Rock paper scissors",
        aliases: ["rpsgame"],
      });
      totalCount += 2;
    }
    if (typeof g.dice === "function") {
      reg("dice", g.dice, {
        category: "games",
        description: "Roll dice",
        aliases: ["roll"],
      });
      totalCount += 2;
    }
    if (typeof g.coinFlip === "function") {
      reg("flip", g.coinFlip, {
        category: "games",
        description: "Flip coin",
        aliases: ["coin"],
      });
      totalCount += 2;
    }
    if (typeof g.trivia === "function") {
      reg("trivia", g.trivia, {
        category: "games",
        description: "Trivia",
        aliases: ["quiz"],
      });
      totalCount += 2;
    }
  }

  // ── IMAGE TOOLS ────────────────────────────────────────────────────────
  if (modules.imageTools.loaded) {
    const img = modules.imageTools.exports;
    if (typeof img.sticker === "function") {
      reg("sticker", img.sticker, {
        category: "media",
        description: "Make sticker",
        aliases: ["s", "stiker"],
      });
      totalCount += 3;
    }
    if (typeof img.toimage === "function") {
      reg("toimage", img.toimage, {
        category: "media",
        description: "To image",
        aliases: ["toimg"],
      });
      totalCount += 2;
    }
    if (typeof img.tovideo === "function") {
      reg("tovideo", img.tovideo, {
        category: "media",
        description: "To video",
        aliases: ["tovid"],
      });
      totalCount += 2;
    }
    if (typeof img.toaudio === "function") {
      reg("toaudio", img.toaudio, {
        category: "media",
        description: "To audio",
        aliases: ["tomp3"],
      });
      totalCount += 2;
    }
    if (typeof img.removebg === "function") {
      reg("removebg", img.removebg, {
        category: "media",
        description: "Remove BG",
        aliases: ["nobg", "rmbg"],
      });
      totalCount += 3;
    }
  }

  // ── JOKES ──────────────────────────────────────────────────────────────
  if (modules.jokes.loaded) {
    const j = modules.jokes.exports;
    if (typeof j.joke === "function") {
      reg("joke", j.joke, {
        category: "fun",
        description: "Tell joke",
        aliases: ["laugh", "funny"],
      });
      totalCount += 3;
    }
    if (typeof j.roast === "function") {
      reg("roast", j.roast, {
        category: "fun",
        description: "Roast someone",
        aliases: ["burn"],
      });
      totalCount += 2;
    }
    if (typeof j.pickupLine === "function") {
      reg("pickup", j.pickupLine, {
        category: "fun",
        description: "Pickup line",
        aliases: ["flirt"],
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
        description: "Movie info",
        aliases: ["film", "imdb"],
      });
      totalCount += 3;
    }
    if (typeof m.tv === "function") {
      reg("tv", m.tv, {
        category: "info",
        description: "TV series info",
        aliases: ["series", "show"],
      });
      totalCount += 3;
    }
  }

  // ── MUSIC ──────────────────────────────────────────────────────────────
  if (modules.music.loaded) {
    const mu = modules.music.exports;
    if (typeof mu.lyrics === "function") {
      reg("lyrics", mu.lyrics, {
        category: "music",
        description: "Get lyrics",
        aliases: ["lyric", "words"],
      });
      totalCount += 3;
    }
    if (typeof mu.trending === "function") {
      reg("trending", mu.trending, {
        category: "music",
        description: "Trending songs",
        aliases: ["chart"],
      });
      totalCount += 2;
    }
  }

  // ── NEWS ───────────────────────────────────────────────────────────────
  if (modules.news.loaded) {
    const n = modules.news.exports;
    if (typeof n.news === "function") {
      reg("news", n.news, {
        category: "info",
        description: "Latest news",
        aliases: ["headlines", "breaking"],
      });
      totalCount += 3;
    }
  }

  // ── NOTES ──────────────────────────────────────────────────────────────
  if (modules.notes.loaded) {
    const nt = modules.notes.exports;
    if (typeof nt.note === "function") {
      reg("note", nt.note, {
        category: "storage",
        description: "Save note",
        aliases: ["store"],
      });
      totalCount += 2;
    }
    if (typeof nt.getnote === "function") {
      reg("getnote", nt.getnote, {
        category: "storage",
        description: "Get note",
        aliases: ["recall"],
      });
      totalCount += 2;
    }
    if (typeof nt.notes === "function") {
      reg("notes", nt.notes, {
        category: "storage",
        description: "List notes",
        aliases: ["mynotes"],
      });
      totalCount += 2;
    }
    if (typeof nt.deleteKey === "function") {
      reg("delnote", nt.deleteKey, {
        category: "storage",
        description: "Delete note",
        aliases: ["forget"],
      });
      totalCount += 2;
    }
  }

  // ── QUOTES ─────────────────────────────────────────────────────────────
  if (modules.quotes.loaded) {
    const q = modules.quotes.exports;
    if (typeof q.quote === "function") {
      reg("quote", q.quote, {
        category: "fun",
        description: "Random quote",
        aliases: ["motivation", "inspire"],
      });
      totalCount += 3;
    }
  }

  // ── REMINDER ───────────────────────────────────────────────────────────
  if (modules.reminder.loaded) {
    const r = modules.reminder.exports;
    if (typeof r.reminder === "function") {
      reg("remind", r.reminder, {
        category: "storage",
        description: "Set reminder",
        aliases: ["reminder", "later"],
      });
      totalCount += 3;
    }
    if (typeof r.listReminders === "function") {
      reg("reminders", r.listReminders, {
        category: "storage",
        description: "List reminders",
        aliases: ["myreminders"],
      });
      totalCount += 2;
    }
    if (typeof r.cancelReminder === "function") {
      reg("cancelreminder", r.cancelReminder, {
        category: "storage",
        description: "Cancel reminder",
        aliases: ["delreminder"],
      });
      totalCount += 2;
    }
    if (typeof r.snooze === "function") {
      reg("snooze", r.snooze, {
        category: "storage",
        description: "Snooze reminder",
        aliases: ["snoozereminder"],
      });
      totalCount += 2;
    }
  }

  // ── SECURITY ───────────────────────────────────────────────────────────
  if (modules.security.loaded) {
    const sec = modules.security.exports;
    if (typeof sec.scan === "function") {
      reg("scan", sec.scan, {
        category: "security",
        description: "Scan URL",
        aliases: ["virustotal"],
      });
      totalCount += 2;
    }
  }

  // ── STOCKS ─────────────────────────────────────────────────────────────
  if (modules.stocks.loaded) {
    const s = modules.stocks.exports;
    if (typeof s.stock === "function") {
      reg("stock", s.stock, {
        category: "info",
        description: "Stock price",
        aliases: ["stocks", "share"],
      });
      totalCount += 3;
    }
  }

  // ── TRANSLATION ────────────────────────────────────────────────────────
  if (modules.translation.loaded) {
    const t = modules.translation.exports;
    if (typeof t.translate === "function") {
      reg("translate", t.translate, {
        category: "tools",
        description: "Translate text",
        aliases: ["tr", "tl"],
      });
      totalCount += 3;
    }
    if (typeof t.detect === "function") {
      reg("detect", t.detect, {
        category: "tools",
        description: "Detect language",
        aliases: ["langdetect"],
      });
      totalCount += 2;
    }
    if (typeof t.languages === "function") {
      reg("languages", t.languages, {
        category: "tools",
        description: "Supported languages",
        aliases: ["langs"],
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
        aliases: ["voice", "say"],
      });
      totalCount += 3;
    }
  }

  // ── UNIT CONVERTER ─────────────────────────────────────────────────────
  if (modules.unitConverter.loaded) {
    const uc = modules.unitConverter.exports;
    if (typeof uc.convert === "function") {
      reg("convert", uc.convert, {
        category: "tools",
        description: "Unit converter",
        aliases: ["conv", "uconvert"],
      });
      totalCount += 3;
    }
    if (typeof uc.units === "function") {
      reg("units", uc.units, {
        category: "tools",
        description: "Available units",
      });
      totalCount++;
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
        aliases: ["remove"],
      });
      totalCount += 2;
    }
    if (typeof gc.add === "function") {
      reg("add", gc.add, {
        category: "group",
        description: "Add member",
        groupOnly: true,
        adminOnly: true,
        aliases: ["invite"],
      });
      totalCount += 2;
    }
    if (typeof gc.promote === "function") {
      reg("promote", gc.promote, {
        category: "group",
        description: "Make admin",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        aliases: ["makeadmin"],
      });
      totalCount += 2;
    }
    if (typeof gc.demote === "function") {
      reg("demote", gc.demote, {
        category: "group",
        description: "Remove admin",
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        aliases: ["unadmin"],
      });
      totalCount += 2;
    }
    if (typeof gc.link === "function") {
      reg("link", gc.link, {
        category: "group",
        description: "Get group link",
        groupOnly: true,
        adminOnly: true,
        aliases: ["grouplink"],
      });
      totalCount += 2;
    }
    if (typeof gc.admins === "function") {
      reg("admins", gc.admins, {
        category: "group",
        description: "List admins",
        groupOnly: true,
        aliases: ["listadmins", "adminlist"],
      });
      totalCount += 3;
    }
    if (typeof gc.tagall === "function") {
      reg("tagall", gc.tagall, {
        category: "group",
        description: "Tag all members",
        groupOnly: true,
        adminOnly: true,
        aliases: ["everyone", "all"],
      });
      totalCount += 3;
    }
    if (typeof gc.hidetag === "function") {
      reg("hidetag", gc.hidetag, {
        category: "group",
        description: "Hidden tag",
        groupOnly: true,
        adminOnly: true,
        aliases: ["htag", "silent"],
      });
      totalCount += 3;
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
        aliases: ["block"],
      });
      totalCount += 2;
    }
    if (typeof gm.unban === "function") {
      reg("unban", gm.unban, {
        category: "group",
        description: "Unban member",
        groupOnly: true,
        adminOnly: true,
        aliases: ["unblock"],
      });
      totalCount += 2;
    }
    if (typeof gm.warn === "function") {
      reg("warn", gm.warn, {
        category: "group",
        description: "Warn member",
        groupOnly: true,
        adminOnly: true,
        aliases: ["warning"],
      });
      totalCount += 2;
    }
    if (typeof gm.warnings === "function") {
      reg("warnings", gm.warnings, {
        category: "group",
        description: "List warnings",
        groupOnly: true,
        aliases: ["warnlist"],
      });
      totalCount += 2;
    }
    if (typeof gm.clearWarns === "function") {
      reg("clearwarns", gm.clearWarns, {
        category: "group",
        description: "Clear warnings",
        groupOnly: true,
        adminOnly: true,
        aliases: ["resetwarns"],
      });
      totalCount += 2;
    }
  }

  // ── GROUP SETTINGS ─────────────────────────────────────────────────────
  if (modules.groupSettings.loaded) {
    const gs = modules.groupSettings.exports;
    if (typeof gs.mute === "function") {
      reg("mute", gs.mute, {
        category: "group",
        description: "Mute group",
        groupOnly: true,
        adminOnly: true,
        aliases: ["lock"],
      });
      totalCount += 2;
    }
    if (typeof gs.unmute === "function") {
      reg("unmute", gs.unmute, {
        category: "group",
        description: "Unmute group",
        groupOnly: true,
        adminOnly: true,
        aliases: ["unlock"],
      });
      totalCount += 2;
    }
    if (typeof gs.antilink === "function") {
      reg("antilink", gs.antilink, {
        category: "group",
        description: "Anti-link",
        groupOnly: true,
        adminOnly: true,
        aliases: ["antilink"],
      });
      totalCount += 2;
    }
    if (typeof gs.antispam === "function") {
      reg("antispam", gs.antispam, {
        category: "group",
        description: "Anti-spam",
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
    if (typeof gs.goodbye === "function") {
      reg("goodbye", gs.goodbye, {
        category: "group",
        description: "Goodbye message",
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
        aliases: ["auth", "allow"],
      });
      totalCount += 3;
    }
    if (typeof adm.removeUser === "function") {
      reg("removeuser", adm.removeUser, {
        category: "admin",
        description: "Remove from whitelist",
        adminOnly: true,
        aliases: ["deauth", "disallow"],
      });
      totalCount += 3;
    }
    if (typeof adm.listUsers === "function") {
      reg("listusers", adm.listUsers, {
        category: "admin",
        description: "List whitelisted users",
        adminOnly: true,
        aliases: ["users", "whitelist"],
      });
      totalCount += 3;
    }
    if (typeof adm.mode === "function") {
      reg("mode", adm.mode, {
        category: "admin",
        description: "Change bot mode",
        adminOnly: true,
        aliases: ["setmode", "botmode"],
      });
      totalCount += 3;
    }
    if (typeof adm.broadcast === "function") {
      reg("broadcast", adm.broadcast, {
        category: "admin",
        description: "Broadcast message",
        adminOnly: true,
        aliases: ["bc", "announce"],
      });
      totalCount += 3;
    }
    if (typeof adm.globalBroadcast === "function") {
      reg("globalbroadcast", adm.globalBroadcast, {
        category: "admin",
        description: "Global broadcast",
        adminOnly: true,
        aliases: ["gbc"],
      });
      totalCount += 2;
    }
    if (typeof adm.stats === "function") {
      reg("stats", adm.stats, {
        category: "admin",
        description: "Bot statistics",
        adminOnly: true,
        aliases: ["botstats"],
      });
      totalCount += 2;
    }
    if (typeof adm.restart === "function") {
      reg("restart", adm.restart, {
        category: "admin",
        description: "Restart bot",
        adminOnly: true,
        aliases: ["reboot"],
      });
      totalCount += 2;
    }
    if (typeof adm.shutdown === "function") {
      reg("shutdown", adm.shutdown, {
        category: "admin",
        description: "Shutdown bot",
        adminOnly: true,
        aliases: ["off"],
      });
      totalCount += 2;
    }
    if (typeof adm.eval === "function") {
      reg("eval", adm.eval, {
        category: "admin",
        description: "Execute code",
        adminOnly: true,
        aliases: ["exec", "run"],
      });
      totalCount += 3;
    }
  }

  log.divider();
  log.success(
    `Successfully registered ${commands.size} commands (${totalCount} total aliases)`,
  );
  console.log();
}

registerAllCommands();

// ════════════════════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
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
//  MAIN COMMAND HANDLER
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

    // ── Session context from message (injected by index.js) ─────────────
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
    const userLog = `${cleanPhone}${isGroup ? ` [GROUP]` : ""}`;
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
        text: `🔒 *PRIVATE MODE*\n\nThis bot is currently set to *private*.\nOnly the bot owner can use commands.\n\n⚡ _AYOBOT v1.5.0 by AYOCODES_`,
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
            `❌ I need group admin rights for *${ENV.PREFIX}${commandName}*.\n\nPlease promote me to admin first!`,
          ),
        });
      }
    }

    // ── Check if user is banned ─────────────────────────────────────────
    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) {
      log.warn(`BANNED USER: ${cleanPhone} tried ${cmdLog}`);
      return;
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
            `❌ *${ENV.PREFIX}${commandName}* encountered an error:\n\n${cmdError.message || "Unknown error"}\n\n_Please try again or contact support_`,
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
      await sock.sendMessage(message?.key?.remoteJid, {
        text: "❌ A fatal error occurred. Please try again.",
      });
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND METADATA & EXPORTS
// ════════════════════════════════════════════════════════════════════════════

export function getCommandMetadata(cmdName) {
  return commandMetadata.get(cmdName.toLowerCase()) || null;
}

export function getCommandsByCategory(category) {
  return Array.from(commands.values()).filter(
    (cmd) => cmd.category.toLowerCase() === category.toLowerCase(),
  );
}

export function getCommandStats(cmdName) {
  return (
    commandStats.get(cmdName.toLowerCase()) || {
      uses: 0,
      errors: 0,
      avgTime: 0,
    }
  );
}

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
