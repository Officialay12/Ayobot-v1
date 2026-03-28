// handlers/commandHandler.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Command Handler — COMPLETE FIXED VERSION WITH PROPER ADMIN DETECTION
//  Author: AYOCODES
//
//  CRITICAL FIXES:
//  1. Group admin detection now correctly identifies group admins using the
//     proper hasGroupAdminPermission function from index.js
//  2. Added proper bot owner vs group admin distinction
//  3. Fixed admin permission cascade logic
//  4. Added refreshadmin command to fix stale admin cache
//  5. All permission checks now use the centralized admin functions
//  6. Fixed module loading with detailed error reporting
//  7. Added multi-name fallback for all commands
// ════════════════════════════════════════════════════════════════════════════

import {
  bannedUsers,
  commandUsage,
  ENV,
  isAdmin,
  isAuthorized,
  isGroupActivated,
  hasGroupAdminPermission,
  refreshAdminStatus,
  isBotGroupAdmin,
  clearAdminCache,
  normalizePhone,
  delay,
  sendMsg,
  log,
} from "../index.js";

// ============================================================================
//  COLOR LOGGER
// ============================================================================
const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
};

const cmdLog = {
  ok: (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  cmd: (m) => console.log(`${C.magenta}⚡${C.reset} ${m}`),
  debug: (m) => !!ENV.DEBUG && console.log(`${C.gray}🔍${C.reset} ${m}`),
  success: (m) => console.log(`${C.green}✓${C.reset}  ${m}`),
  title: (m) => console.log(`\n${C.blue}${C.bright}${m}${C.reset}\n`),
  div: () => console.log(`${C.cyan}${"─".repeat(60)}${C.reset}`),
};

// ============================================================================
//  ENVIRONMENT VALIDATION
// ============================================================================
if (!ENV.PREFIX) {
  cmdLog.warn("PREFIX not set, using default: .");
  ENV.PREFIX = ".";
}

const OWNER_PHONE = ENV.ADMIN || ENV.OWNER_PHONE || ENV.OWNER_NUMBER || "";
if (!OWNER_PHONE) {
  cmdLog.warn(
    "⚠️ No owner phone configured! Set ADMIN or OWNER_PHONE in environment",
  );
} else {
  ENV.OWNER_PHONE = OWNER_PHONE;
  cmdLog.ok(`Owner configured: ${OWNER_PHONE}`);
}

// ============================================================================
//  RATE LIMITER
// ============================================================================
class RateLimiter {
  constructor(maxRequests = 15, windowMs = 60000) {
    this.max = maxRequests;
    this.window = windowMs;
    this.map = new Map();
    this.cleanupInterval = null;
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  isAllowed(id) {
    const now = Date.now();
    const hits = (this.map.get(id) || []).filter((t) => now - t < this.window);
    if (hits.length >= this.max) return false;
    hits.push(now);
    this.map.set(id, hits);
    return true;
  }

  remaining(id) {
    const now = Date.now();
    const hits = (this.map.get(id) || []).filter((t) => now - t < this.window);
    if (hits.length < this.max) return 0;
    const oldest = Math.min(...hits);
    return Math.max(0, this.window - (now - oldest));
  }

  cleanup() {
    const now = Date.now();
    for (const [key, times] of this.map.entries()) {
      const filtered = times.filter((t) => now - t < this.window);
      if (!filtered.length) this.map.delete(key);
      else this.map.set(key, filtered);
    }
  }
}

const rateLimiter = new RateLimiter(
  parseInt(ENV.RATE_LIMIT_MAX) || 15,
  parseInt(ENV.RATE_LIMIT_WINDOW) || 60000,
);
rateLimiter.startCleanup();

// ============================================================================
//  COMMAND COOLDOWN MANAGER
// ============================================================================
class CommandCooldown {
  constructor() {
    this.cooldowns = new Map();
    this.defaultCooldown = 3000;
    this.customCooldowns = new Map([
      ["play", 10000],
      ["youtube", 10000],
      ["download", 8000],
      ["search", 5000],
      ["broadcast", 30000],
      ["globalbc", 60000],
    ]);
  }

  getCooldown(commandName) {
    return this.customCooldowns.get(commandName) || this.defaultCooldown;
  }

  isOnCooldown(userId, commandName) {
    const key = `${userId}:${commandName}`;
    const expiry = this.cooldowns.get(key);
    if (!expiry) return false;
    return Date.now() < expiry;
  }

  setCooldown(userId, commandName) {
    const key = `${userId}:${commandName}`;
    const duration = this.getCooldown(commandName);
    const expiry = Date.now() + duration;
    this.cooldowns.set(key, expiry);
    setTimeout(() => {
      if (this.cooldowns.get(key) === expiry) {
        this.cooldowns.delete(key);
      }
    }, duration);
  }

  getRemaining(userId, commandName) {
    const key = `${userId}:${commandName}`;
    const expiry = this.cooldowns.get(key);
    if (!expiry) return 0;
    return Math.max(0, expiry - Date.now());
  }
}

const commandCooldown = new CommandCooldown();

// ============================================================================
//  TRIVIA STATE
// ============================================================================
if (!global.activeTrivia) {
  global.activeTrivia = new Map();
}

// ============================================================================
//  HELPERS
// ============================================================================
function normalizeJid(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

function sanitizeInput(input) {
  if (!input || typeof input !== "string") return "";
  return input.slice(0, 2000).replace(/[<>]/g, "");
}

// ============================================================================
//  MODULE LOADER WITH ENHANCED ERROR REPORTING
// ============================================================================
cmdLog.title("📦 LOADING COMMAND MODULES");

const MODULE_PATHS = {
  basic: "../commands/group/basic.js",
  admin: "../commands/group/admin.js",
  groupCore: "../commands/group/core.js",
  groupMod: "../commands/group/moderation.js",
  groupSettings: "../commands/group/settings.js",
  automation: "../commands/group/automation.js",
  ai: "../features/ai.js",
  calculator: "../features/calculator.js",
  crypto: "../features/crypto.js",
  dictionary: "../features/dictionary.js",
  downloader: "../features/downloader.js",
  encryption: "../features/encryption.js",
  games: "../features/games.js",
  imageTools: "../features/imageTools.js",
  jokes: "../features/jokes.js",
  movies: "../features/movies.js",
  music: "../features/music.js",
  news: "../features/news.js",
  notes: "../features/notes.js",
  quotes: "../features/quotes.js",
  reminder: "../features/reminder.js",
  security: "../features/security.js",
  stocks: "../features/stocks.js",
  translation: "../features/translation.js",
  tts: "../features/tts.js",
  unitConverter: "../features/unitConverter.js",
};

const MODULES = {};

async function safeImport(moduleName, modulePath) {
  try {
    const mod = await import(modulePath);
    const exportKeys = Object.keys(mod);
    const functionKeys = exportKeys.filter((k) => typeof mod[k] === "function");
    const defaultExport = mod.default;
    const defaultKeys =
      defaultExport && typeof defaultExport === "object"
        ? Object.keys(defaultExport).filter(
            (k) => typeof defaultExport[k] === "function",
          )
        : [];

    if (functionKeys.length === 0 && defaultKeys.length === 0) {
      cmdLog.err(
        `⚠️ ${moduleName.padEnd(15)} ➜ LOADED BUT HAS NO FUNCTIONS — check exports!`,
      );
    } else if (!!ENV.DEBUG) {
      cmdLog.ok(
        `${moduleName.padEnd(15)} ➜ ${functionKeys.length} named exports`,
      );
      if (defaultKeys.length)
        cmdLog.debug(`   └─ Default: ${defaultKeys.join(", ")}`);
    } else {
      cmdLog.ok(`${moduleName.padEnd(15)} ➜ Loaded`);
    }

    return {
      ...mod,
      __default: defaultExport,
      __hasDefault: !!defaultExport && typeof defaultExport === "object",
      __exportKeys: exportKeys,
    };
  } catch (error) {
    cmdLog.err(`❌ FAILED TO LOAD MODULE: ${moduleName}`);
    cmdLog.err(`   Path : ${modulePath}`);
    cmdLog.err(`   Error: ${error.message}`);
    if (error.stack) {
      const lines = error.stack.split("\n").slice(0, 5);
      lines.forEach((l) => cmdLog.err(`   ${l}`));
    }
    return {};
  }
}

async function loadAllModules() {
  cmdLog.div();

  const entries = Object.entries(MODULE_PATHS);
  const results = await Promise.all(
    entries.map(([, path]) =>
      safeImport(path.split("/").pop().replace(".js", ""), path),
    ),
  );
  entries.forEach(([name], i) => (MODULES[name] = results[i]));

  const loaded = Object.values(MODULES).filter(
    (m) => Object.keys(m).length > 0,
  ).length;

  cmdLog.div();
  cmdLog.success(`Loaded ${loaded}/${entries.length} modules`);

  // Critical module check with detailed error reporting
  const criticalModules = {
    groupSettings: [
      "mute",
      "unmute",
      "link",
      "rules",
      "groupInfo",
      "settingsOverview",
    ],
    groupCore: ["kick", "add", "promote", "demote"],
    admin: ["mode", "broadcast", "stats"],
  };

  for (const [modName, fns] of Object.entries(criticalModules)) {
    const mod = MODULES[modName] || {};
    const missing = fns.filter(
      (fn) =>
        !mod[fn] &&
        !mod[fn.charAt(0).toUpperCase() + fn.slice(1)] &&
        !mod.__default?.[fn],
    );
    if (missing.length > 0) {
      cmdLog.err(
        `⚠️  CRITICAL MODULE "${modName}" IS MISSING EXPORTS: ${missing.join(", ")}`,
      );
      cmdLog.err(
        `    → Check ${MODULE_PATHS[modName]} for syntax errors or bad imports`,
      );
      const exportedKeys = Object.keys(mod).filter((k) => !k.startsWith("__"));
      cmdLog.warn(
        `    → Actual exports: [${exportedKeys.join(", ") || "NONE"}]`,
      );
    }
  }

  console.log();
  return MODULES;
}

await loadAllModules();

// ============================================================================
//  COMMAND REGISTRY
// ============================================================================
export const commands = new Map();
export const primaryCommands = new Map();
export const aliasMap = new Map();
export const commandStats = new Map();

class CommandMeta {
  constructor(primaryName, handler, options = {}) {
    this.primaryName = primaryName.toLowerCase();
    this.handler = handler;
    this.category = options.category || "general";
    this.description = options.description || "";
    this.adminOnly = options.adminOnly === true;
    this.groupOnly = options.groupOnly === true;
    this.requireGroupAdmin = options.requireGroupAdmin === true;
    this.requireBotAdmin = options.requireBotAdmin === true;
    this.aliases = (options.aliases || []).map((a) => a.toLowerCase());
    this.createdAt = Date.now();
  }
}

export function registerCommand(primaryName, handler, options = {}) {
  if (typeof handler !== "function") {
    cmdLog.err(`Cannot register "${primaryName}": handler is not a function`);
    return false;
  }

  const name = primaryName.toLowerCase();
  const aliases = (options.aliases || []).map((a) => a.toLowerCase());
  const meta = new CommandMeta(name, handler, options);

  primaryCommands.set(name, meta);
  commands.set(name, meta);
  commandStats.set(name, {
    uses: 0,
    errors: 0,
    lastUsed: null,
    avgResponseTime: 0,
    totalResponseTime: 0,
  });

  if (!!ENV.DEBUG) {
    cmdLog.cmd(
      `Registered: ${name}${aliases.length ? ` [${aliases.join(", ")}]` : ""}`,
    );
  }

  for (const alias of aliases) {
    if (alias === name) continue;
    const aliasMeta = {
      ...meta,
      isAlias: true,
      aliasName: alias,
      primaryName: name,
      handler,
    };
    commands.set(alias, aliasMeta);
    aliasMap.set(alias, name);
  }

  return true;
}

export function safeRegister(primaryName, handler, options = {}) {
  try {
    return registerCommand(primaryName, handler, options);
  } catch (error) {
    cmdLog.err(`safeRegister("${primaryName}") failed: ${error.message}`);
    return false;
  }
}

function getModuleFunction(module, functionName, fallbackName = null) {
  if (module[functionName] && typeof module[functionName] === "function") {
    return module[functionName];
  }
  if (
    module.__default &&
    module.__default[functionName] &&
    typeof module.__default[functionName] === "function"
  ) {
    return module.__default[functionName];
  }
  if (
    fallbackName &&
    module[fallbackName] &&
    typeof module[fallbackName] === "function"
  ) {
    return module[fallbackName];
  }
  return null;
}

// ============================================================================
//  COMMAND REGISTRATION — COMPLETE
// ============================================================================
export function registerAllCommands() {
  if (!!ENV.DEBUG) {
    cmdLog.title("📝 REGISTERING ALL COMMANDS");
    cmdLog.div();
  }

  // ==================== BASIC.JS ====================
  const b = MODULES.basic;

  if (b.menu)
    safeRegister("menu", b.menu, {
      category: "core",
      description: "Show all commands",
      aliases: [
        "help",
        "commands",
        "h",
        "cmd",
        "cmds",
        "commandlist",
        "menuhelp",
      ],
    });

  if (b.ping)
    safeRegister("ping", b.ping, {
      category: "core",
      description: "Check bot latency",
      aliases: ["pong", "latency", "speed", "ms", "uptime", "alive", "botping"],
    });

  if (b.status)
    safeRegister("status", b.status, {
      category: "core",
      description: "Your status and usage",
      aliases: ["me", "profile", "whoami", "myinfo", "mystats", "userstatus"],
    });

  if (b.creator)
    safeRegister("creator", b.creator, {
      category: "core",
      description: "Creator information",
      aliases: [
        "dev",
        "owner",
        "author",
        "ayo",
        "ayocodes",
        "developer",
        "creatorinfo",
      ],
    });

  if (b.creatorGit)
    safeRegister("github", b.creatorGit, {
      category: "core",
      description: "GitHub repository",
      aliases: ["git", "repo", "source", "code", "repository", "sourcecode"],
    });

  if (b.auto)
    safeRegister("auto", b.auto, {
      category: "core",
      description: "Toggle auto-reply",
      aliases: ["autoreply", "toggleauto", "autorespond", "automsg"],
    });

  if (b.connectInfo)
    safeRegister("connect", b.connectInfo, {
      category: "core",
      description: "Community links",
      aliases: ["community", "links", "social", "connectinfo"],
    });

  if (b.prefixinfo)
    safeRegister("prefix", b.prefixinfo, {
      category: "core",
      description: "Show current prefix",
      aliases: ["preinfo", "getprefix", "prefixinfo", "whatprefix", "myprefix"],
    });

  if (b.test)
    safeRegister("test", b.test, {
      category: "debug",
      description: "Test command",
      aliases: ["hello", "hi", "testcmd", "pingtest", "testbot", "check"],
    });

  if (b.time)
    safeRegister("time", b.time, {
      category: "info",
      description: "World time lookup",
      aliases: [
        "worldtime",
        "timezone",
        "tz",
        "clock",
        "currenttime",
        "datetime",
        "whattime",
      ],
    });

  if (b.weather)
    safeRegister("weather", b.weather, {
      category: "info",
      description: "Weather forecast",
      aliases: [
        "w",
        "forecast",
        "temp",
        "climate",
        "temperature",
        "weatherinfo",
        "wea",
      ],
    });

  if (b.getip || b.ip) {
    const ipHandler = b.getip || b.ip;
    safeRegister("ip", ipHandler, {
      category: "web",
      description: "IP address lookup",
      aliases: [
        "getip",
        "iplookup",
        "ipinfo",
        "checkip",
        "iptrace",
        "iplocate",
      ],
    });
  }

  if (b.myip)
    safeRegister("myip", b.myip, {
      category: "web",
      description: "Your public IP",
      aliases: ["myipaddr", "publicip", "whatismyip", "myipaddress", "ipme"],
    });

  if (b.whois)
    safeRegister("whois", b.whois, {
      category: "web",
      description: "Domain WHOIS lookup",
      aliases: [
        "domain",
        "domaininfo",
        "domainlookup",
        "whoislookup",
        "domainwhois",
      ],
    });

  if (b.dns)
    safeRegister("dns", b.dns, {
      category: "web",
      description: "DNS lookup",
      aliases: [
        "dnslookup",
        "dnsrecords",
        "nslookup",
        "dig",
        "dnsinfo",
        "dnsquery",
      ],
    });

  if (b.url)
    safeRegister("url", b.url, {
      category: "web",
      description: "URL information",
      aliases: ["urlinfo", "urlcheck", "expandurl", "urldetails", "urlinspect"],
    });

  if (b.fetch)
    safeRegister("fetch", b.fetch, {
      category: "web",
      description: "Fetch URL content",
      aliases: ["geturl", "curl", "httpget", "wget", "fetchurl", "getcontent"],
    });

  if (b.scrape)
    safeRegister("scrape", b.scrape, {
      category: "web",
      description: "Scrape webpage",
      aliases: [
        "scraper",
        "webscrape",
        "getpage",
        "extract",
        "pagescrape",
        "scrapeweb",
      ],
    });

  if (b.screenshot)
    safeRegister("screenshot", b.screenshot, {
      category: "web",
      description: "Take screenshot",
      aliases: [
        "ss",
        "capture",
        "snap",
        "webshot",
        "screencap",
        "pagepic",
        "webpic",
      ],
    });

  if (b.inspect)
    safeRegister("inspect", b.inspect, {
      category: "web",
      description: "Inspect webpage",
      aliases: [
        "pageinspect",
        "pageinfo",
        "analyze",
        "webinspect",
        "inspectpage",
      ],
    });

  if (b.shorten)
    safeRegister("shorten", b.shorten, {
      category: "web",
      description: "Shorten URL",
      aliases: [
        "short",
        "tiny",
        "tinyurl",
        "bitly",
        "urlshort",
        "shortlink",
        "shorturl",
      ],
    });

  if (b.viewOnce)
    safeRegister("vv", b.viewOnce, {
      category: "media",
      description: "View once message",
      aliases: [
        "viewonce",
        "open",
        "arise",
        "reveal",
        "view",
        "once",
        "viewoncemsg",
      ],
    });

  if (b.take)
    safeRegister("take", b.take, {
      category: "media",
      description: "Take sticker",
      aliases: [
        "takesticker",
        "steal",
        "savesticker",
        "stickersteal",
        "takestk",
      ],
    });

  if (b.imgbb)
    safeRegister("imgbb", b.imgbb, {
      category: "media",
      description: "Upload to ImgBB",
      aliases: [
        "upload",
        "imageupload",
        "hostimage",
        "img",
        "imghost",
        "uploadimg",
      ],
    });

  if (b.qencode)
    safeRegister("qr", b.qencode, {
      category: "tools",
      description: "Generate QR code",
      aliases: ["qrcode", "qencode", "makeqr", "createqr", "qrgen", "qrcreate"],
    });

  if (b.pdf)
    safeRegister("pdf", b.pdf, {
      category: "tools",
      description: "Create PDF",
      aliases: [
        "makepdf",
        "createpdf",
        "topdf",
        "document",
        "pdfcreate",
        "pdfgen",
      ],
    });

  if (b.getpp)
    safeRegister("getpp", b.getpp, {
      category: "profile",
      description: "Get profile picture",
      aliases: [
        "pp",
        "profilepic",
        "pfp",
        "dp",
        "avatar",
        "getpfp",
        "profilepicture",
      ],
    });

  if (b.getgpp)
    safeRegister("getgpp", b.getgpp, {
      category: "profile",
      groupOnly: true,
      description: "Get group picture",
      aliases: [
        "gpp",
        "grouppic",
        "groupdp",
        "grouppfp",
        "grouppicture",
        "groupprofile",
      ],
    });

  if (b.jarvis)
    safeRegister("jarvis", b.jarvis, {
      category: "ai",
      description: "Jarvis AI assistant",
      aliases: [
        "j",
        "ask",
        "query",
        "jarvisask",
        "ai",
        "jarv",
        "jar",
        "askjarvis",
      ],
    });

  if (b.joinWaitlist)
    safeRegister("waitlist", b.joinWaitlist, {
      category: "misc",
      description: "Join AYOBOT waitlist",
      aliases: [
        "jointrend",
        "joinnext",
        "joinfuture",
        "waiting",
        "waitlistjoin",
      ],
    });

  if (b.activate)
    safeRegister("activate", b.activate, {
      category: "group",
      groupOnly: true,
      adminOnly: true,
      description: "Activate bot in group (bot owner only)",
      aliases: [
        "groupactivate",
        "activatebot",
        "openbot",
        "unlockbot",
        "activategroup",
      ],
    });

  if (b.deactivate)
    safeRegister("deactivate", b.deactivate, {
      category: "group",
      groupOnly: true,
      adminOnly: true,
      description: "Restrict bot to owner-only (bot owner only)",
      aliases: ["groupdeactivate", "deactivatebot", "closebot", "lockbot"],
    });

  if (b.antilink)
    safeRegister("antilink", b.antilink, {
      category: "group",
      groupOnly: true,
      description: "Toggle anti-link protection",
      aliases: [
        "nolink",
        "blocklinks",
        "toggleantilink",
        "antilinks",
        "protectlink",
      ],
    });

  // ==================== AI.JS ====================
  const a = MODULES.ai;

  if (a.ai)
    safeRegister("ayobot", a.ai, {
      category: "ai",
      description: "Chat with AI",
      aliases: ["chat", "bot", "bae", "askai", "aichat", "talk", "aibot"],
    });

  if (a.aiClear)
    safeRegister("aiclear", a.aiClear, {
      category: "ai",
      description: "Clear AI history",
      aliases: [
        "clearchat",
        "resetai",
        "clearai",
        "ayobotclr",
        "reset",
        "clearhistory",
      ],
    });

  if (a.summarize)
    safeRegister("summarize", a.summarize, {
      category: "ai",
      description: "Summarize text",
      aliases: ["summary", "tldr", "sum", "summarise", "summarizetext"],
    });

  if (a.grammar)
    safeRegister("grammar", a.grammar, {
      category: "ai",
      description: "Check grammar",
      aliases: [
        "spell",
        "spellcheck",
        "fix",
        "proofread",
        "grammarcheck",
        "correct",
      ],
    });

  // ==================== CALCULATOR.JS ====================
  const calc = MODULES.calculator;

  if (calc.calculate)
    safeRegister("calc", calc.calculate, {
      category: "tools",
      description: "Math calculator",
      aliases: ["math", "calculate", "solve", "calculator", "cal", "maths"],
    });

  // ==================== CRYPTO.JS ====================
  const cr = MODULES.crypto;

  if (cr.crypto)
    safeRegister("crypto", cr.crypto, {
      category: "info",
      description: "Crypto prices",
      aliases: [
        "coin",
        "btc",
        "eth",
        "cryptoprice",
        "cryptocurrency",
        "cryptoinfo",
      ],
    });

  if (cr.cryptoTop)
    safeRegister("cryptotop", cr.cryptoTop, {
      category: "info",
      description: "Top cryptocurrencies",
      aliases: ["top10", "topcrypto", "cryptolist", "cointop", "topcoins"],
    });

  // ==================== DICTIONARY.JS ====================
  const dict = MODULES.dictionary;

  if (dict.dict)
    safeRegister("dict", dict.dict, {
      category: "info",
      description: "Dictionary lookup",
      aliases: [
        "define",
        "meaning",
        "word",
        "definition",
        "dictionary",
        "def",
        "diction",
      ],
    });

  // ==================== DOWNLOADER.JS ====================
  const dl = MODULES.downloader;

  if (dl.youtube)
    safeRegister("youtube", dl.youtube, {
      category: "dl",
      description: "Download YouTube",
      aliases: [
        "yt",
        "ytdl",
        "ytmp3",
        "ytmp4",
        "ytvideo",
        "youtubedl",
        "ytaudio",
      ],
    });

  if (dl.tiktok)
    safeRegister("tiktok", dl.tiktok, {
      category: "dl",
      description: "Download TikTok",
      aliases: ["tt", "tok", "tiktokdl", "ttvideo", "tiktokdown", "ttdl"],
    });

  if (dl.spotify)
    safeRegister("spotify", dl.spotify, {
      category: "dl",
      description: "Download Spotify",
      aliases: ["sp", "spotifydl", "spotifymp3", "spotifydown", "spdl"],
    });

  if (dl.instagram)
    safeRegister("instagram", dl.instagram, {
      category: "dl",
      description: "Download Instagram",
      aliases: ["ig", "insta", "igdl", "igreels", "instadl", "instagramdl"],
    });

  if (dl.facebook)
    safeRegister("facebook", dl.facebook, {
      category: "dl",
      description: "Download Facebook",
      aliases: ["fb", "fbdl", "fbvideo", "fbd", "facebookdl", "fbdown"],
    });

  if (dl.twitter)
    safeRegister("twitter", dl.twitter, {
      category: "dl",
      description: "Download Twitter/X",
      aliases: ["x", "tweet", "xdl", "twitterdl", "twdl", "xdown"],
    });

  if (dl.gif)
    safeRegister("gif", dl.gif, {
      category: "dl",
      description: "Search animated GIFs",
      aliases: ["giphy", "tenor", "gifsearch", "animated"],
    });

  if (dl.image)
    safeRegister("img", dl.image, {
      category: "dl",
      description: "Search for images",
      aliases: ["image", "imgsearch", "pics", "photos", "picture"],
    });

  if (dl.pinterest)
    safeRegister("pinterest", dl.pinterest, {
      category: "dl",
      description: "Search Pinterest images",
      aliases: ["pins", "pinsearch", "pinterestsearch"],
    });

  if (dl.download)
    safeRegister("dl", dl.download, {
      category: "dl",
      description: "Universal media downloader",
      aliases: ["download", "get", "dlfile"],
    });

  // ==================== ENCRYPTION.JS ====================
  const enc = MODULES.encryption;

  if (enc.encrypt)
    safeRegister("encrypt", enc.encrypt, {
      category: "security",
      description: "Encrypt text",
      aliases: ["enc", "lock", "cipher", "encode", "encrypttext"],
    });

  if (enc.decrypt)
    safeRegister("decrypt", enc.decrypt, {
      category: "security",
      description: "Decrypt text",
      aliases: ["dec", "unlock", "decipher", "decode", "decrypttext"],
    });

  if (enc.hash)
    safeRegister("hash", enc.hash, {
      category: "security",
      description: "Hash text",
      aliases: ["md5", "sha256", "hashtext", "checksum", "hashgen"],
    });

  if (enc.password)
    safeRegister("password", enc.password, {
      category: "security",
      description: "Generate password",
      aliases: ["genpass", "newpass", "passgen", "mkpass", "passwordgen"],
    });

  // ==================== GAMES.JS ====================
  const games = MODULES.games;

  if (games.rps)
    safeRegister("rps", games.rps, {
      category: "games",
      description: "Rock Paper Scissors",
      aliases: ["rockpaperscissors", "rpsgame", "rock", "paper", "scissors"],
    });

  if (games.dice)
    safeRegister("dice", games.dice, {
      category: "games",
      description: "Roll dice",
      aliases: ["roll", "rolldice", "rolld6", "diceroll", "dicer"],
    });

  if (games.coinFlip)
    safeRegister("flip", games.coinFlip, {
      category: "games",
      description: "Flip coin",
      aliases: ["coin", "coinflip", "toss", "heads", "tails", "cointoss"],
    });

  if (games.trivia)
    safeRegister("trivia", games.trivia, {
      category: "games",
      description: "Trivia question",
      aliases: ["quiz", "question", "q", "triviaquestion", "triv"],
    });

  // ==================== IMAGETOOLS.JS ====================
  const imgT = MODULES.imageTools;

  if (imgT.sticker)
    safeRegister("sticker", imgT.sticker, {
      category: "media",
      description: "Create sticker from image/video",
      aliases: ["s", "stiker", "makesticker", "tosticker", "stickerize", "stk"],
    });

  if (imgT.toImage)
    safeRegister("toimage", imgT.toImage, {
      category: "media",
      description: "Convert sticker to image",
      aliases: ["toimg", "stickertoimage", "stktoimg", "sticker2img"],
    });

  if (imgT.toVideo)
    safeRegister("tovideo", imgT.toVideo, {
      category: "media",
      description: "Convert animated sticker to video",
      aliases: ["tovid", "stickertovideo", "stk2vid", "sticker2video"],
    });

  if (imgT.toGif)
    safeRegister("togif", imgT.toGif, {
      category: "media",
      description: "Convert video to GIF",
      aliases: ["makegif", "videotogif", "togiphy", "gifmaker"],
    });

  if (imgT.toAudio)
    safeRegister("toaudio", imgT.toAudio, {
      category: "media",
      description: "Extract audio from video",
      aliases: [
        "tomp3",
        "extractaudio",
        "video2audio",
        "getaudio",
        "audioextract",
      ],
    });

  if (imgT.removeBg)
    safeRegister("removebg", imgT.removeBg, {
      category: "media",
      description: "Remove image background",
      aliases: [
        "nobg",
        "rmbg",
        "bgremove",
        "cutbg",
        "backgroundremove",
        "removebackground",
      ],
    });

  if (imgT.meme)
    safeRegister("meme", imgT.meme, {
      category: "media",
      description: "Create meme from image",
      aliases: ["makememe", "memegen", "imagememe", "creatememe"],
    });

  // ==================== JOKES.JS ====================
  const jokes = MODULES.jokes;

  if (jokes.joke)
    safeRegister("joke", jokes.joke, {
      category: "fun",
      description: "Random joke",
      aliases: ["laugh", "funny", "lol", "haha", "humor", "jokefun"],
    });

  if (jokes.roast)
    safeRegister("roast", jokes.roast, {
      category: "fun",
      description: "Roast someone",
      aliases: ["burn", "flame", "diss", "insult", "roastme"],
    });

  if (jokes.pickupLine)
    safeRegister("pickup", jokes.pickupLine, {
      category: "fun",
      description: "Pickup line",
      aliases: ["flirt", "pickupline", "rizz", "pickuplines"],
    });

  // ==================== MOVIES.JS ====================
  const movies = MODULES.movies;

  if (movies.movie)
    safeRegister("movie", movies.movie, {
      category: "info",
      description: "Movie info",
      aliases: ["film", "imdb", "movieinfo", "moviesearch", "moviedb"],
    });

  if (movies.tv)
    safeRegister("tv", movies.tv, {
      category: "info",
      description: "TV series info",
      aliases: ["series", "show", "tvshow", "tvseries", "tvguide"],
    });

  // ==================== MUSIC.JS ====================
  const music = MODULES.music;

  const lyricsFn = getModuleFunction(music, "musicLyrics", "lyrics");
  if (lyricsFn)
    safeRegister("lyrics", lyricsFn, {
      category: "music",
      description: "Song lyrics",
      aliases: ["lyric", "words", "songlyrics", "getlyrics", "lyricsearch"],
    });

  const trendingFn = getModuleFunction(music, "musicTrending", "trending");
  if (trendingFn)
    safeRegister("trending", trendingFn, {
      category: "music",
      description: "Trending songs",
      aliases: ["chart", "topsongs", "topmusic", "hotmusic", "trendingmusic"],
    });

  const randomFn = getModuleFunction(music, "musicRandom", "random");
  if (randomFn)
    safeRegister("random", randomFn, {
      category: "music",
      description: "Random song",
      aliases: ["randomsong", "randomtrack", "randommusic"],
    });

  const artistFn = getModuleFunction(music, "musicArtist", "artist");
  if (artistFn)
    safeRegister("artist", artistFn, {
      category: "music",
      description: "Artist information",
      aliases: ["artistinfo", "singer", "musician"],
    });

  const albumFn = getModuleFunction(music, "musicAlbum", "album");
  if (albumFn)
    safeRegister("album", albumFn, {
      category: "music",
      description: "Album information",
      aliases: ["albuminfo", "record", "cd"],
    });

  const searchFn = getModuleFunction(music, "musicSearch", "search");
  if (searchFn)
    safeRegister("musicsearch", searchFn, {
      category: "music",
      description: "Search for music",
      aliases: [
        "songsearch",
        "findmusic",
        "searchsong",
        "searchtrack",
        "musics",
      ],
    });

  const playFn = getModuleFunction(music, "musicDownload", "play");
  if (playFn)
    safeRegister("play", playFn, {
      category: "music",
      description: "Download and play music",
      aliases: [
        "mp3",
        "music",
        "song",
        "audio",
        "playmusic",
        "playsong",
        "playmp3",
      ],
    });

  const geniusFn = getModuleFunction(music, "musicGenius", "genius");
  if (geniusFn)
    safeRegister("genius", geniusFn, {
      category: "music",
      description: "Genius lyrics",
      aliases: ["geniuslyrics", "geniussong", "geniustrack"],
    });

  const musicFn = getModuleFunction(music, "music", null);
  if (musicFn)
    safeRegister("music", musicFn, {
      category: "music",
      description: "Music hub",
      aliases: ["musichub", "musicmenu"],
    });

  // ==================== NEWS.JS ====================
  const news = MODULES.news;

  if (news.news)
    safeRegister("news", news.news, {
      category: "info",
      description: "Latest news",
      aliases: ["headlines", "breaking", "latestnews", "topnews", "newsupdate"],
    });

  // ==================== NOTES.JS ====================
  const notes = MODULES.notes;

  if (notes.note)
    safeRegister("note", notes.note, {
      category: "storage",
      description: "Save note",
      aliases: ["store", "savenote", "addnote", "remember", "newnote"],
    });

  if (notes.getnote)
    safeRegister("getnote", notes.getnote, {
      category: "storage",
      description: "Get note",
      aliases: ["recall", "readnote", "shownote", "retrievenote"],
    });

  if (notes.notes)
    safeRegister("notes", notes.notes, {
      category: "storage",
      description: "List notes",
      aliases: ["mynotes", "listnotes", "allnotes", "notelist", "shownotes"],
    });

  if (notes.deleteKey)
    safeRegister("delnote", notes.deleteKey, {
      category: "storage",
      description: "Delete note",
      aliases: ["forget", "deletenote", "removenote", "rmnote"],
    });

  // ==================== QUOTES.JS ====================
  const quotes = MODULES.quotes;

  if (quotes.quote)
    safeRegister("quote", quotes.quote, {
      category: "fun",
      description: "Random quote",
      aliases: ["motivation", "inspire", "wisdom", "motivate", "inspiration"],
    });

  // ==================== REMINDER.JS ====================
  const reminder = MODULES.reminder;

  const remindFn = getModuleFunction(reminder, "reminder", null);
  if (remindFn)
    safeRegister("remind", remindFn, {
      category: "storage",
      description: "Set reminder",
      aliases: [
        "reminder",
        "later",
        "setreminder",
        "setalarm",
        "remindme",
        "alarm",
      ],
    });

  const listRemindersFn = getModuleFunction(reminder, "listReminders", null);
  if (listRemindersFn)
    safeRegister("reminders", listRemindersFn, {
      category: "storage",
      description: "List reminders",
      aliases: [
        "myreminders",
        "listreminders",
        "showreminders",
        "reminderlist",
      ],
    });

  const cancelReminderFn = getModuleFunction(reminder, "cancelReminder", null);
  if (cancelReminderFn)
    safeRegister("cancelreminder", cancelReminderFn, {
      category: "storage",
      description: "Cancel reminder",
      aliases: [
        "delreminder",
        "removereminder",
        "stopreminder",
        "deletereminder",
      ],
    });

  const snoozeFn = getModuleFunction(reminder, "snooze", null);
  if (snoozeFn)
    safeRegister("snooze", snoozeFn, {
      category: "storage",
      description: "Snooze reminder",
      aliases: ["snoozereminder", "delayrm", "snoozealarm"],
    });

  // ==================== SECURITY.JS ====================
  const sec = MODULES.security;

  if (sec.scan)
    safeRegister("scan", sec.scan, {
      category: "security",
      description: "Scan URL",
      aliases: [
        "virustotal",
        "urlscan",
        "safescan",
        "checksafe",
        "threatscan",
        "checkurl",
      ],
    });

  // ==================== STOCKS.JS ====================
  const stocks = MODULES.stocks;

  if (stocks.stock)
    safeRegister("stock", stocks.stock, {
      category: "info",
      description: "Stock prices",
      aliases: ["stocks", "share", "stockprice", "stockinfo", "market"],
    });

  // ==================== TRANSLATION.JS ====================
  const trans = MODULES.translation;

  if (trans.translate)
    safeRegister("translate", trans.translate, {
      category: "tools",
      description: "Translate text",
      aliases: ["tr", "tl", "lang", "trans", "translation", "translator"],
    });

  if (trans.detect)
    safeRegister("detect", trans.detect, {
      category: "tools",
      description: "Detect language",
      aliases: ["langdetect", "whatlang", "detectlang", "language", "langid"],
    });

  if (trans.languages)
    safeRegister("languages", trans.languages, {
      category: "tools",
      description: "List languages",
      aliases: ["langs", "langlist", "supportedlangs", "alllangs"],
    });

  // ==================== TTS.JS ====================
  const tts = MODULES.tts;

  if (tts.tts)
    safeRegister("tts", tts.tts, {
      category: "media",
      description: "Text to speech",
      aliases: ["voice", "say", "speak", "read", "texttospeech", "speaktext"],
    });

  // ==================== UNITCONVERTER.JS ====================
  const uc = MODULES.unitConverter;

  if (uc.convert)
    safeRegister("convert", uc.convert, {
      category: "tools",
      description: "Convert units",
      aliases: ["conv", "uconvert", "unitconvert", "cvt", "conversion"],
    });

  if (uc.units)
    safeRegister("units", uc.units, {
      category: "tools",
      description: "List units",
      aliases: ["listunits", "unitlist", "availableunits", "showunits"],
    });

  // ==================== GROUP CORE.JS ====================
  const gc = MODULES.groupCore;

  if (gc.kick)
    safeRegister("kick", gc.kick, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Kick member",
      aliases: ["remove", "kickmember", "removemember", "boot", "kickout"],
    });

  if (gc.add)
    safeRegister("add", gc.add, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Add member",
      aliases: [
        "invite",
        "addmember",
        "addperson",
        "addtogroup",
        "addparticipant",
      ],
    });

  if (gc.promote)
    safeRegister("promote", gc.promote, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Promote to admin",
      aliases: ["makeadmin", "adminpromote", "setadmin", "promoteadmin"],
    });

  if (gc.demote)
    safeRegister("demote", gc.demote, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Demote admin",
      aliases: ["unadmin", "removeadmin", "deadmin", "demoteadmin"],
    });

  if (gc.admins)
    safeRegister("admins", gc.admins, {
      category: "group",
      groupOnly: true,
      description: "List admins",
      aliases: [
        "listadmins",
        "adminlist",
        "groupadmins",
        "getadmins",
        "showadmins",
      ],
    });

  if (gc.tagall)
    safeRegister("tagall", gc.tagall, {
      category: "group",
      groupOnly: true,
      description: "Tag all members",
      aliases: [
        "everyone",
        "all",
        "tageveryone",
        "mentionall",
        "pingall",
        "tag",
      ],
    });

  if (gc.hidetag)
    safeRegister("hidetag", gc.hidetag, {
      category: "group",
      groupOnly: true,
      description: "Silent tag all",
      aliases: [
        "htag",
        "silent",
        "silentping",
        "hiddentag",
        "ghosttag",
        "silenttag",
      ],
    });

  // ==================== GROUP MODERATION.JS ====================
  const gm = MODULES.groupMod;

  if (gm.ban)
    safeRegister("ban", gm.ban, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Ban user from group",
      aliases: ["block", "banuser", "blacklist", "banmember"],
    });

  if (gm.unban)
    safeRegister("unban", gm.unban, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Unban user from group",
      aliases: ["unblock", "unbanuser", "whitelist", "removeban"],
    });

  if (gm.warn)
    safeRegister("warn", gm.warn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Warn user",
      aliases: ["warning", "warnuser", "givewarn", "addwarn", "warnmember"],
    });

  if (gm.warnings)
    safeRegister("warnings", gm.warnings, {
      category: "group",
      groupOnly: true,
      description: "View warnings",
      aliases: ["warnlist", "checkwarns", "getwarn", "mywarnings", "seewarns"],
    });

  if (gm.clearWarns)
    safeRegister("clearwarns", gm.clearWarns, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Clear warnings",
      aliases: ["resetwarns", "clearwarnings", "rmwarns", "deletewarns"],
    });

  if (gm.listBanned)
    safeRegister("listbanned", gm.listBanned, {
      category: "group",
      groupOnly: true,
      description: "List banned users in group",
      aliases: ["bannedlist", "getbanned", "showbanned"],
    });

  // ==================== GROUP SETTINGS.JS ====================
  const gs = MODULES.groupSettings;

  // Multi-name fallback for each command
  const muteFn = gs.mute || gs.muteGroup || gs.groupMute || gs.__default?.mute;
  if (muteFn)
    safeRegister("mute", muteFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Mute group",
      aliases: ["lockgroup", "grouplock", "muteall", "mutechat", "mutegroup"],
    });

  const unmuteFn =
    gs.unmute || gs.unmuteGroup || gs.groupUnmute || gs.__default?.unmute;
  if (unmuteFn)
    safeRegister("unmute", unmuteFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Unmute group",
      aliases: ["unlockgroup", "groupunlock", "unmuteall", "unmutechat"],
    });

  const lockFn = gs.lock || gs.lockGroup || gs.groupLock || gs.__default?.lock;
  if (lockFn)
    safeRegister("lock", lockFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Lock group info editing",
      aliases: ["lockinfo", "restrict"],
    });

  const unlockFn =
    gs.unlock || gs.unlockGroup || gs.groupUnlock || gs.__default?.unlock;
  if (unlockFn)
    safeRegister("unlock", unlockFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Unlock group info editing",
      aliases: ["unlockinfo", "unrestrict"],
    });

  const antiSpamFn = gs.antiSpam || gs.toggleAntiSpam || gs.__default?.antiSpam;
  if (antiSpamFn)
    safeRegister("antispam", antiSpamFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Toggle anti-spam",
      aliases: ["nospam", "blockspam", "toggleantispam", "stopspam"],
    });

  const welcomeToggleFn =
    gs.welcomeToggle || gs.toggleWelcome || gs.__default?.welcomeToggle;
  if (welcomeToggleFn)
    safeRegister("welcome", welcomeToggleFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Toggle welcome messages",
      aliases: ["togglewelcome", "welcomeon", "welcomeoff"],
    });

  const setWelcomeFn =
    gs.setWelcome || gs.setWelcomeMessage || gs.__default?.setWelcome;
  if (setWelcomeFn)
    safeRegister("setwelcome", setWelcomeFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Set welcome message",
      aliases: ["setwelcomemsg", "welcometext"],
    });

  const goodbyeToggleFn =
    gs.goodbyeToggle || gs.toggleGoodbye || gs.__default?.goodbyeToggle;
  if (goodbyeToggleFn)
    safeRegister("goodbye", goodbyeToggleFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Toggle goodbye messages",
      aliases: ["togglegoodbye", "goodbyeon", "goodbyeoff"],
    });

  const setGoodbyeFn =
    gs.setGoodbye || gs.setGoodbyeMessage || gs.__default?.setGoodbye;
  if (setGoodbyeFn)
    safeRegister("setgoodbye", setGoodbyeFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Set goodbye message",
      aliases: ["setgoodbyemsg", "goodbyetext"],
    });

  const groupInfoFn =
    gs.groupInfo || gs.getGroupInfo || gs.__default?.groupInfo;
  if (groupInfoFn)
    safeRegister("groupinfo", groupInfoFn, {
      category: "group",
      groupOnly: true,
      description: "Show group information",
      aliases: ["ginfo", "group", "grouppanel"],
    });

  const rulesFn = gs.rules || gs.getRules || gs.__default?.rules;
  if (rulesFn)
    safeRegister("rules", rulesFn, {
      category: "group",
      groupOnly: true,
      description: "Show group rules",
      aliases: ["grules", "grouprules"],
    });

  const setRulesFn = gs.setRules || gs.setGroupRules || gs.__default?.setRules;
  if (setRulesFn)
    safeRegister("setrules", setRulesFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Set group rules",
      aliases: ["setgrules", "addrules"],
    });

  const linkFn = gs.link || gs.getLink || gs.getGroupLink || gs.__default?.link;
  if (linkFn)
    safeRegister("link", linkFn, {
      category: "group",
      groupOnly: true,
      description: "Get group invite link",
      aliases: ["grouplink", "invitelink"],
    });

  const revokeFn = gs.revoke || gs.revokeLink || gs.__default?.revoke;
  if (revokeFn)
    safeRegister("revoke", revokeFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Revoke group invite link",
      aliases: ["revokelink", "resetlink", "newlink"],
    });

  const pinFn = gs.pin || gs.pinMessage || gs.__default?.pin;
  if (pinFn)
    safeRegister("pin", pinFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Pin a message",
      aliases: ["pinmsg", "pinmessage"],
    });

  const unpinFn = gs.unpin || gs.unpinMessage || gs.__default?.unpin;
  if (unpinFn)
    safeRegister("unpin", unpinFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      requireBotAdmin: true,
      description: "Unpin a message",
      aliases: ["unpinmsg", "unpinmessage"],
    });

  const deleteMsgFn =
    gs.deleteMsg || gs.deleteMessage || gs.__default?.deleteMsg;
  if (deleteMsgFn)
    safeRegister("delete", deleteMsgFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Delete a message",
      aliases: ["delmsg", "deletemessage", "rmmsg"],
    });

  const settingsOverviewFn =
    gs.settingsOverview || gs.getSettings || gs.__default?.settingsOverview;
  if (settingsOverviewFn)
    safeRegister("settings", settingsOverviewFn, {
      category: "group",
      groupOnly: true,
      description: "View group settings",
      aliases: ["groupsettings", "gsettings", "settingspanel"],
    });

  const resetSettingsFn =
    gs.resetSettings || gs.resetGroupSettings || gs.__default?.resetSettings;
  if (resetSettingsFn)
    safeRegister("resetsettings", resetSettingsFn, {
      category: "group",
      groupOnly: true,
      requireGroupAdmin: true,
      description: "Reset all group settings",
      aliases: ["resetgroupsettings", "clearsettings", "resetall"],
    });

  const leaveFn = gs.leave || gs.leaveGroup || gs.__default?.leave;
  if (leaveFn)
    safeRegister("leave", leaveFn, {
      category: "group",
      groupOnly: true,
      adminOnly: true,
      description: "Make bot leave the group",
      aliases: ["botleave", "leavegroup", "exit"],
    });

  const debugFn = gs.debug || gs.groupDebug || gs.__default?.debug;
  if (debugFn)
    safeRegister("groupdebug", debugFn, {
      category: "group",
      groupOnly: true,
      description: "Debug group information",
      aliases: ["gdebug", "groupdbg"],
    });

  const testAdminFn = gs.testAdmin || gs.checkAdmin || gs.__default?.testAdmin;
  if (testAdminFn)
    safeRegister("testadmin", testAdminFn, {
      category: "group",
      groupOnly: true,
      description: "Test admin status",
      aliases: ["admintest", "checkadmin"],
    });

  const refreshAdminFn =
    gs.refreshAdmin || gs.clearAdminCache || gs.__default?.refreshAdmin;
  if (refreshAdminFn)
    safeRegister("refreshadmin", refreshAdminFn, {
      category: "group",
      groupOnly: true,
      description: "Refresh admin cache",
      aliases: ["refresh", "clearcache"],
    });

  // ==================== ADMIN.JS ====================
  const adm = MODULES.admin;

  if (adm.addUser)
    safeRegister("adduser", adm.addUser, {
      category: "admin",
      adminOnly: true,
      description: "Add authorized user",
      aliases: ["auth", "allow", "authorize", "addauth"],
    });

  if (adm.removeUser)
    safeRegister("removeuser", adm.removeUser, {
      category: "admin",
      adminOnly: true,
      description: "Remove authorized user",
      aliases: ["deauth", "disallow", "unauthorize", "removeauth"],
    });

  if (adm.listUsers)
    safeRegister("listusers", adm.listUsers, {
      category: "admin",
      adminOnly: true,
      description: "List authorized users",
      aliases: ["users", "showusers", "authlist", "listauth"],
    });

  // Multi-name fallback for mode command
  const modeFn =
    adm.mode ||
    adm.setMode ||
    adm.botMode ||
    adm.changeMode ||
    adm.__default?.mode;
  if (modeFn)
    safeRegister("mode", modeFn, {
      category: "admin",
      adminOnly: true,
      description: "Change bot mode",
      aliases: ["setmode", "botmode", "changemode", "switchmode"],
    });
  else
    cmdLog.err('⚠️  admin.js: no "mode" / "setMode" / "botMode" export found!');

  const broadcastFn =
    adm.broadcast || adm.sendBroadcast || adm.__default?.broadcast;
  if (broadcastFn)
    safeRegister("broadcast", broadcastFn, {
      category: "admin",
      adminOnly: true,
      description: "Broadcast message",
      aliases: ["bc", "announce", "sendall", "massmessage"],
    });

  const globalBroadcastFn =
    adm.globalBroadcast ||
    adm.sendGlobalBroadcast ||
    adm.__default?.globalBroadcast;
  if (globalBroadcastFn)
    safeRegister("globalbc", globalBroadcastFn, {
      category: "admin",
      adminOnly: true,
      description: "Global broadcast",
      aliases: ["gbc", "globalbroadcast", "globalannounce", "massbc"],
    });

  const statsFn = adm.stats || adm.getStats || adm.__default?.stats;
  if (statsFn)
    safeRegister("stats", statsFn, {
      category: "admin",
      adminOnly: true,
      description: "Bot statistics",
      aliases: ["botstats", "usage", "analytics", "statistics"],
    });

  if (adm.botStatus)
    safeRegister("botstatus", adm.botStatus, {
      category: "admin",
      adminOnly: true,
      description: "Detailed bot status",
      aliases: ["botinfo", "fullstatus", "statusinfo"],
    });

  if (adm.superBan)
    safeRegister("superban", adm.superBan, {
      category: "admin",
      adminOnly: true,
      description: "Permanently ban user globally",
      aliases: ["globalban", "permban", "hardban"],
    });

  if (adm.unban)
    safeRegister("superunban", adm.unban, {
      category: "admin",
      adminOnly: true,
      description: "Remove global ban",
      aliases: ["globalunban", "permunban", "hardunban"],
    });

  if (adm.listBanned)
    safeRegister("listglobalbanned", adm.listBanned, {
      category: "admin",
      adminOnly: true,
      description: "List globally banned users",
      aliases: ["globalbannedlist", "getglobalbanned"],
    });

  if (adm.clearBans)
    safeRegister("clearbans", adm.clearBans, {
      category: "admin",
      adminOnly: true,
      description: "Clear all global bans",
      aliases: ["resetbans", "removeallbans", "deletebans"],
    });

  if (adm.restart)
    safeRegister("restart", adm.restart, {
      category: "admin",
      adminOnly: true,
      description: "Restart bot",
      aliases: ["reboot", "botrestart", "restartbot", "reload"],
    });

  if (adm.shutdown)
    safeRegister("shutdown", adm.shutdown, {
      category: "admin",
      adminOnly: true,
      description: "Shutdown bot",
      aliases: ["off", "stop", "botoff", "poweroff", "halt"],
    });

  if (adm.adminEval)
    safeRegister("eval", adm.adminEval, {
      category: "admin",
      adminOnly: true,
      description: "Execute code",
      aliases: ["evalcode"],
    });

  if (!!ENV.DEBUG) {
    cmdLog.div();
    cmdLog.success(
      `✅ Registered ${primaryCommands.size} primary commands with ${
        commands.size - primaryCommands.size
      } aliases`,
    );
    cmdLog.success(`📊 Total entries in commands Map: ${commands.size}`);
    console.log();
  } else {
    cmdLog.success(`✅ Loaded ${primaryCommands.size} commands`);
  }
}

registerAllCommands();

// ============================================================================
//  ACTIVATION EXEMPT COMMANDS
// ============================================================================
const ACTIVATION_EXEMPT = new Set([
  "activate",
  "groupactivate",
  "activatebot",
  "openbot",
  "unlockbot",
  "activategroup",
  "deactivate",
  "groupdeactivate",
  "deactivatebot",
  "closebot",
  "lockbot",
  "testadmin",
  "admintest",
  "checkadmin",
  "refreshadmin",
  "refresh",
  "clearcache",
  "groupdebug",
  "gdebug",
  "groupdbg",
  "menu",
  "help",
  "ping",
  "status",
]);

// ============================================================================
//  MAIN COMMAND HANDLER — COMPLETELY FIXED
// ============================================================================
export async function handleCommand(message, sock) {
  const executionStart = Date.now();
  const executionId = Math.random().toString(36).substring(2, 8);

  try {
    // ── PHASE 1: Basic message info ─────────────────────────────────────────
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const fromMe = !!message.key.fromMe;

    const session = message._session || null;
    const ownerPhone =
      session?.ownerPhone || ENV.ADMIN || ENV.OWNER_PHONE || "";
    const sessionMode = session?.mode || ENV.BOT_MODE || "public";
    const sessionId = session?.id || "";

    // ── PHASE 2: Determine sender JID ────────────────────────────────────────
    let rawSenderJid;
    if (isGroup) {
      rawSenderJid = message.key.participant || from;
    } else if (fromMe) {
      const phone = (sock?.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      rawSenderJid = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      rawSenderJid = from;
    }

    const cleanPhone = normalizeJid(rawSenderJid);
    const userJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSenderJid;

    if (!userJid || !cleanPhone) return;

    // ── PHASE 3: Authorization ───────────────────────────────────────────────
    const isAdminUser = fromMe || isAdmin(userJid, ownerPhone);
    const isAuthorizedUser =
      isAdminUser || isAuthorized(userJid, ownerPhone, sessionMode);

    // ── PHASE 4: Extract message text ────────────────────────────────────────
    const m = message.message || {};
    const msgText =
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      "";

    if (!msgText?.trim()) return;
    const trimmed = msgText.trim();

    // ── PHASE 5: TRIVIA HANDLER (before prefix check) ────────────────────────
    if (!trimmed.startsWith(ENV.PREFIX)) {
      if (global.activeTrivia instanceof Map && global.activeTrivia.has(from)) {
        const upperMsg = trimmed.toUpperCase();
        if (["A", "B", "C", "D"].includes(upperMsg)) {
          if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from))
            return;
          if (sessionMode === "private" && !isAdminUser) return;
          if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) return;

          try {
            const g = MODULES.games;
            if (g && typeof g.handleTriviaAnswer === "function") {
              await g.handleTriviaAnswer(message, from, sock);
              return;
            }
          } catch (error) {
            cmdLog.debug(`[${executionId}] Trivia error: ${error.message}`);
          }
        }
      }
      return;
    }

    // ── PHASE 6: Prefix & command parsing ────────────────────────────────────
    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    if (!commandName) return;

    const rawArgs = parts.slice(1);
    const fullArgs = rawArgs.join(" ");
    const args = rawArgs.map((a) => sanitizeInput(a));

    // ── PHASE 7: Banned user check ───────────────────────────────────────────
    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) {
      cmdLog.warn(`[${executionId}] Blocked banned user: ${cleanPhone}`);
      return;
    }

    // ── PHASE 8: Group activation gate ──────────────────────────────────────
    if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
      if (!ACTIVATION_EXEMPT.has(commandName)) {
        cmdLog.debug(
          `[${executionId}] Group not activated: ${commandName} ignored`,
        );
        return;
      }
    }

    // ── PHASE 9: Private mode check ──────────────────────────────────────────
    if (sessionMode === "private" && !isAdminUser) {
      cmdLog.debug(
        `[${executionId}] Private mode: silently ignored ${cleanPhone}`,
      );
      return;
    }

    // ── PHASE 10: Command lookup ─────────────────────────────────────────────
    cmdLog.info(
      `[${executionId}] ${ENV.PREFIX}${commandName} from ${cleanPhone}${isGroup ? " [GROUP]" : ""}`,
    );

    const commandMeta = commands.get(commandName);

    if (!commandMeta) {
      const similar = findSimilarCommands(commandName, 2);
      let suggestion = "";
      if (similar.length > 0) {
        suggestion = `\n\nDid you mean: *${ENV.PREFIX}${similar[0]}*?`;
        if (similar.length > 1)
          suggestion += `\nOr: ${similar
            .slice(1, 3)
            .map((c) => `*${ENV.PREFIX}${c}*`)
            .join(", ")}`;
      }
      await sock.sendMessage(from, {
        text: `❓ *Unknown Command:* ${ENV.PREFIX}${commandName}${suggestion}\n\nType *${ENV.PREFIX}menu* to see all commands!`,
      });
      return;
    }

    // ── PHASE 11: Resolve handler & primary name ─────────────────────────────
    const handlerFunction = commandMeta.handler;
    const primaryName = commandMeta.isAlias
      ? commandMeta.primaryName
      : commandMeta.primaryName || commandName;

    // ── PHASE 12: Track usage ─────────────────────────────────────────────────
    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[primaryName] =
      (commandUsage.get(userJid)[primaryName] || 0) + 1;

    const stats = commandStats.get(primaryName) || {
      uses: 0,
      errors: 0,
      lastUsed: null,
      avgResponseTime: 0,
      totalResponseTime: 0,
    };
    stats.uses++;
    stats.lastUsed = Date.now();
    commandStats.set(primaryName, stats);

    if (session) {
      session.commandCount = (session.commandCount || 0) + 1;
    }

    // ── PHASE 13: Rate limit ──────────────────────────────────────────────────
    if (!isAdminUser && !rateLimiter.isAllowed(userJid)) {
      const seconds = Math.ceil(rateLimiter.remaining(userJid) / 1000);
      const messages = [
        `⏳ *Slow down!* Wait *${seconds}s* before the next command.`,
        `🧘 *Take a breath!* Wait ${seconds}s.`,
        `⚡ *Rate limited!* Try again in ${seconds}s.`,
      ];
      return sock.sendMessage(from, {
        text: messages[Math.floor(Math.random() * messages.length)],
      });
    }

    // ── PHASE 14: Command cooldown ────────────────────────────────────────────
    if (!isAdminUser && commandCooldown.isOnCooldown(userJid, primaryName)) {
      const seconds = Math.ceil(
        commandCooldown.getRemaining(userJid, primaryName) / 1000,
      );
      return sock.sendMessage(from, {
        text: `⏳ *Cooldown!*\nPlease wait *${seconds}s* before using *${ENV.PREFIX}${primaryName}* again.`,
      });
    }

    // ── PHASE 15: Permission checks using centralized functions ───────────────

    // 15a: Bot-owner-only commands
    if (commandMeta.adminOnly && !isAdminUser) {
      return sock.sendMessage(from, {
        text: `⛔ *${ENV.PREFIX}${commandName}* is for the *bot owner* only.`,
      });
    }

    // 15b: Group-only commands
    if (commandMeta.groupOnly && !isGroup) {
      return sock.sendMessage(from, {
        text: `👥 *${ENV.PREFIX}${commandName}* only works inside a group.`,
      });
    }

    // 15c: Commands requiring group admin privileges (CRITICAL FIX)
    if (commandMeta.requireGroupAdmin && isGroup) {
      const permission = await hasGroupAdminPermission(sock, message, session);

      if (!permission.allowed) {
        return sock.sendMessage(from, { text: permission.reason });
      }
    }

    // 15d: Commands requiring the BOT to be a group admin
    if (commandMeta.requireBotAdmin && isGroup) {
      let botIsAdmin = await isBotGroupAdmin(sock, from);

      if (!botIsAdmin) {
        // Try one more time with cache bypass
        botIsAdmin = await isBotGroupAdmin(sock, from, true);
      }

      if (!botIsAdmin) {
        return sock.sendMessage(from, {
          text: `⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to use *${ENV.PREFIX}${commandName}*.\n\n📌 *How to fix:*\n1. Add me as a group admin\n2. Wait a few seconds\n3. Type *${ENV.PREFIX}refreshadmin* to refresh my status`,
        });
      }
    }

    // ── PHASE 16: Execute command ─────────────────────────────────────────────
    commandCooldown.setCooldown(userJid, primaryName);
    const handlerStart = Date.now();
    cmdLog.cmd(
      `[${executionId}] Executing: ${primaryName} (via ${commandName})`,
    );

    const setMode = async (newMode) => {
      if (session && typeof session === "object") {
        session.mode = newMode;
        cmdLog.info(`[${executionId}] Session mode updated to: ${newMode}`);
      }
    };

    try {
      const context = {
        args,
        fullArgs,
        message,
        from,
        groupJid: isGroup ? from : null,
        userJid,
        cleanPhone,
        isGroup,
        isDM: !isGroup,
        fromMe,
        sock,
        isAdmin: isAdminUser,
        isAuthorized: isAuthorizedUser,
        commandName: primaryName,
        invokedAs: commandName,
        prefix: ENV.PREFIX,
        session,
        sessionId,
        sessionMode,
        ownerPhone,
        ENV,
        setMode,
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Command execution timeout")), 60000),
      );

      await Promise.race([handlerFunction(context), timeoutPromise]);

      const executionTime = Date.now() - handlerStart;
      stats.totalResponseTime += executionTime;
      stats.avgResponseTime = stats.totalResponseTime / stats.uses;
      commandStats.set(primaryName, stats);
      cmdLog.success(
        `[${executionId}] ${primaryName} completed (${executionTime}ms)`,
      );
    } catch (cmdError) {
      stats.errors++;
      commandStats.set(primaryName, stats);
      cmdLog.err(`[${executionId}] ${primaryName} error: ${cmdError.message}`);

      const errMsg =
        cmdError.message?.length > 100
          ? "❌ An error occurred while executing the command."
          : `❌ *Error*\n\n${sanitizeInput(cmdError.message)}`;

      try {
        await sock.sendMessage(from, { text: errMsg });
      } catch (_) {}
    }

    if (Date.now() - executionStart > 5000) {
      cmdLog.warn(
        `[${executionId}] Slow command: ${primaryName} (${Date.now() - executionStart}ms)`,
      );
    }
  } catch (fatalError) {
    cmdLog.err(`[${executionId}] FATAL: ${fatalError.message}`);
    try {
      await sock?.sendMessage(message?.key?.remoteJid, {
        text: "❌ A system error occurred. Please try again.",
      });
    } catch (_) {}
  }
}

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================

function findSimilarCommands(input, maxDistance = 2, limit = 3) {
  const inputLower = input.toLowerCase();
  const commandList = Array.from(primaryCommands.keys());

  return commandList
    .map((cmd) => ({ cmd, distance: levenshteinDistance(inputLower, cmd) }))
    .filter((item) => item.distance <= maxDistance && item.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.cmd);
}

function levenshteinDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================================
//  UTILITY EXPORTS
// ============================================================================

export function getCommandInfo(name) {
  const meta = commands.get(name?.toLowerCase());
  if (!meta) return null;
  return {
    name: meta.primaryName || name,
    category: meta.category,
    description: meta.description,
    adminOnly: meta.adminOnly,
    groupOnly: meta.groupOnly,
    requireGroupAdmin: meta.requireGroupAdmin,
    requireBotAdmin: meta.requireBotAdmin,
    isAlias: meta.isAlias || false,
    aliases: meta.aliases || [],
  };
}

export function getCommandStats(name) {
  return commandStats.get(name?.toLowerCase()) || null;
}

export function getCommandsByCategory(category) {
  const unique = new Map();
  for (const [, meta] of commands.entries()) {
    if (meta.category === category && !meta.isAlias) {
      unique.set(meta.primaryName, meta);
    }
  }
  return Array.from(unique.values());
}

export function getAllStats() {
  let totalUses = 0;
  let totalErrors = 0;
  for (const s of commandStats.values()) {
    totalUses += s.uses;
    totalErrors += s.errors;
  }
  return {
    totalCommands: primaryCommands.size,
    totalAliases: commands.size - primaryCommands.size,
    totalEntries: commands.size,
    totalUses,
    totalErrors,
    uniqueCommands: primaryCommands.size,
    topCommands: Array.from(commandStats.entries())
      .sort((a, b) => b[1].uses - a[1].uses)
      .slice(0, 5)
      .map(([name, s]) => ({ name, uses: s.uses })),
  };
}

export async function reloadCommands() {
  cmdLog.title("🔄 RELOADING COMMANDS");
  commands.clear();
  primaryCommands.clear();
  aliasMap.clear();
  commandStats.clear();
  for (const name of Object.keys(MODULES)) delete MODULES[name];
  await loadAllModules();
  registerAllCommands();
  cmdLog.success("✅ Commands reloaded successfully");
}

// ============================================================================
//  GRACEFUL SHUTDOWN
// ============================================================================
export function shutdown() {
  rateLimiter.stopCleanup();
  cmdLog.success("Command handler shutdown complete");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { commandCooldown, MODULES as modules, rateLimiter };
