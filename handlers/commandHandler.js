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
//
//  NEW ADDITIONS:
//  8. .ok command registered - Send view-once media to DM with reactions
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
//  COMMAND REGISTRATION — COMPLETE FIXED VERSION
//  Only registers commands that actually exist in loaded modules
// ============================================================================

export function registerAllCommands() {
  if (!!ENV.DEBUG) {
    cmdLog.title("📝 REGISTERING ALL COMMANDS");
    cmdLog.div();
  }

  let registeredCount = 0;
  let failedModules = [];

  // ==================== BASIC.JS ====================
  const b = MODULES.basic;
  if (b && Object.keys(b).length > 0) {
    const basicCommands = [
      { fn: b.menu, name: "menu", category: "core", aliases: ["help", "commands", "h", "cmd", "cmds"] },
      { fn: b.ping, name: "ping", category: "core", aliases: ["pong", "latency", "ms", "uptime", "alive"] },
      { fn: b.status, name: "status", category: "core", aliases: ["me", "profile", "whoami", "myinfo"] },
      { fn: b.creator, name: "creator", category: "core", aliases: ["dev", "owner", "author", "ayo"] },
      { fn: b.creatorGit, name: "github", category: "core", aliases: ["git", "repo", "source"] },
      { fn: b.auto, name: "auto", category: "core", aliases: ["autoreply", "toggleauto"] },
      { fn: b.connectInfo, name: "connect", category: "core", aliases: ["community", "links"] },
      { fn: b.prefixinfo, name: "prefix", category: "core", aliases: ["preinfo", "getprefix"] },
      { fn: b.test, name: "test", category: "debug", aliases: ["hello", "hi", "testbot"] },
      { fn: b.start, name: "start", category: "core", aliases: ["open", "init", "begin", "connectdm", "dmopen"] },
      { fn: b.time, name: "time", category: "info", aliases: ["worldtime", "timezone", "clock"] },
      { fn: b.weather, name: "weather", category: "info", aliases: ["w", "forecast", "temp"] },
      { fn: b.getip || b.ip, name: "ip", category: "web", aliases: ["getip", "iplookup", "ipinfo"] },
      { fn: b.myip, name: "myip", category: "web", aliases: ["myipaddr", "publicip", "whatismyip"] },
      { fn: b.whois, name: "whois", category: "web", aliases: ["domain", "domaininfo"] },
      { fn: b.dns, name: "dns", category: "web", aliases: ["dnslookup", "nslookup", "dig"] },
      { fn: b.url, name: "url", category: "web", aliases: ["urlinfo", "urlcheck"] },
      { fn: b.fetch, name: "fetch", category: "web", aliases: ["geturl", "curl", "httpget"] },
      { fn: b.scrape, name: "scrape", category: "web", aliases: ["scraper", "webscrape"] },
      { fn: b.screenshot, name: "screenshot", category: "web", aliases: ["ss", "capture", "snap"] },
      { fn: b.inspect, name: "inspect", category: "web", aliases: ["pageinspect", "analyze"] },
      { fn: b.shorten, name: "shorten", category: "web", aliases: ["short", "tinyurl", "bitly"] },
      { fn: b.viewOnce, name: "vv", category: "media", aliases: ["viewonce", "open", "reveal"] },
      { fn: b.viewOnceToDM || b.ok, name: "ok", category: "media", aliases: ["dm", "tome", "senddm", "push", "privatemedia"] },
      { fn: b.take, name: "take", category: "media", aliases: ["takesticker", "steal", "savesticker"] },
      { fn: b.imgbb, name: "imgbb", category: "media", aliases: ["upload", "imageupload"] },
      { fn: b.qencode, name: "qr", category: "tools", aliases: ["qrcode", "makeqr"] },
      { fn: b.pdf, name: "pdf", category: "tools", aliases: ["makepdf", "createpdf"] },
      { fn: b.getpp, name: "getpp", category: "profile", aliases: ["pp", "profilepic", "pfp"] },
      { fn: b.getgpp, name: "getgpp", category: "profile", groupOnly: true, aliases: ["gpp", "grouppic"] },
      { fn: b.jarvis, name: "jarvis", category: "ai", aliases: ["j", "ask", "query"] },
      { fn: b.joinWaitlist, name: "waitlist", category: "misc", aliases: ["jointrend", "joinnext"] },
      { fn: b.activate, name: "activate", category: "group", groupOnly: true, adminOnly: true },
      { fn: b.deactivate, name: "deactivate", category: "group", groupOnly: true, adminOnly: true },
      { fn: b.antilink, name: "antilink", category: "group", groupOnly: true, aliases: ["nolink", "blocklinks"] },
    ];

    for (const cmd of basicCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          description: cmd.description || `${cmd.name} command`,
          aliases: cmd.aliases || [],
          groupOnly: cmd.groupOnly || false,
          adminOnly: cmd.adminOnly || false,
        });
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Basic: loaded ${basicCommands.filter(c => c.fn).length} commands`);
  } else {
    cmdLog.err("❌ BASIC module failed to load - critical!");
    failedModules.push("basic");
  }

  // ==================== DOWNLOADER.JS ====================
  const dl = MODULES.downloader;
  if (dl && Object.keys(dl).length > 0) {
    const dlCommands = [
      { fn: dl.youtube, name: "youtube", category: "dl", aliases: ["yt", "ytdl", "ytmp3"] },
      { fn: dl.tiktok, name: "tiktok", category: "dl", aliases: ["tt", "tok", "tiktokdl"] },
      { fn: dl.spotify, name: "spotify", category: "dl", aliases: ["sp", "spotifydl"] },
      { fn: dl.instagram, name: "instagram", category: "dl", aliases: ["ig", "insta", "igdl"] },
      { fn: dl.facebook, name: "facebook", category: "dl", aliases: ["fb", "fbdl", "fbvideo"] },
      { fn: dl.twitter, name: "twitter", category: "dl", aliases: ["x", "tweet", "xdl"] },
      { fn: dl.gif, name: "gif", category: "dl", aliases: ["giphy", "tenor", "gifsearch"] },
      { fn: dl.image, name: "img", category: "dl", aliases: ["image", "imgsearch", "pics"] },
      { fn: dl.pinterest, name: "pinterest", category: "dl", aliases: ["pin", "pinsearch"] },
      { fn: dl.download, name: "dl", category: "dl", aliases: ["download", "get"] },
      { fn: dl.play, name: "play", category: "dl", aliases: ["mp3", "music", "song"] },
    ];

    let loaded = 0;
    for (const cmd of dlCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          description: `${cmd.name} downloader`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Downloader: loaded ${loaded} commands`);
  } else {
    cmdLog.warn("⚠️ DOWNLOADER module not loaded");
    failedModules.push("downloader");
  }

  // ==================== MUSIC.JS ====================
  const music = MODULES.music;
  if (music && Object.keys(music).length > 0) {
    const musicCommands = [
      { fn: music.musicLyrics, name: "lyrics", category: "music", aliases: ["lyric", "songlyrics"] },
      { fn: music.musicTrending, name: "trending", category: "music", aliases: ["chart", "topsongs"] },
      { fn: music.musicRandom, name: "random", category: "music", aliases: ["randomsong"] },
      { fn: music.musicSearch, name: "musicsearch", category: "music", aliases: ["songsearch", "findmusic"] },
      { fn: music.musicDownload, name: "play", category: "music", aliases: ["mp3", "music", "song"] },
      { fn: music.musicArtist, name: "artist", category: "music", aliases: ["artistinfo", "singer"] },
      { fn: music.musicAlbum, name: "album", category: "music", aliases: ["albuminfo"] },
      { fn: music.music, name: "music", category: "music", aliases: ["musichub"] },
    ];

    let loaded = 0;
    for (const cmd of musicCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Music: loaded ${loaded} commands`);
  } else {
    cmdLog.warn("⚠️ MUSIC module not loaded");
    failedModules.push("music");
  }

  // ==================== ADMIN.JS ====================
  const adm = MODULES.admin;
  if (adm && Object.keys(adm).length > 0) {
    const adminCommands = [
      { fn: adm.mode, name: "mode", category: "admin", adminOnly: true, aliases: ["setmode", "botmode"] },
      { fn: adm.addUser, name: "adduser", category: "admin", adminOnly: true, aliases: ["auth", "authorize"] },
      { fn: adm.removeUser, name: "removeuser", category: "admin", adminOnly: true, aliases: ["deauth", "unauthorize"] },
      { fn: adm.listUsers, name: "listusers", category: "admin", adminOnly: true, aliases: ["users", "authlist"] },
      { fn: adm.broadcast, name: "broadcast", category: "admin", adminOnly: true, aliases: ["bc", "announce"] },
      { fn: adm.globalBroadcast, name: "globalbc", category: "admin", adminOnly: true, aliases: ["gbc", "globalbroadcast"] },
      { fn: adm.stats, name: "stats", category: "admin", adminOnly: true, aliases: ["botstats", "usage"] },
      { fn: adm.botStatus, name: "botstatus", category: "admin", adminOnly: true, aliases: ["botinfo", "fullstatus"] },
      { fn: adm.superBan, name: "superban", category: "admin", adminOnly: true, aliases: ["globalban", "permban"] },
      { fn: adm.unban, name: "superunban", category: "admin", adminOnly: true, aliases: ["globalunban"] },
      { fn: adm.listBanned, name: "listglobalbanned", category: "admin", adminOnly: true, aliases: ["globalbannedlist"] },
      { fn: adm.clearBans, name: "clearbans", category: "admin", adminOnly: true, aliases: ["resetbans"] },
      { fn: adm.restart, name: "restart", category: "admin", adminOnly: true, aliases: ["reboot", "restartbot"] },
      { fn: adm.shutdown, name: "shutdown", category: "admin", adminOnly: true, aliases: ["stop", "botoff"] },
      { fn: adm.adminEval, name: "eval", category: "admin", adminOnly: true, aliases: ["exec", "code", "run"] },
    ];

    let loaded = 0;
    for (const cmd of adminCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          adminOnly: cmd.adminOnly,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Admin: loaded ${loaded} commands`);
  } else {
    cmdLog.warn("⚠️ ADMIN module not loaded");
    failedModules.push("admin");
  }

  // ==================== GROUP CORE.JS ====================
  const gc = MODULES.groupCore;
  if (gc && Object.keys(gc).length > 0) {
    const groupCoreCommands = [
      { fn: gc.kick, name: "kick", category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["remove", "kickmember"] },
      { fn: gc.add, name: "add", category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["invite", "addmember"] },
      { fn: gc.promote, name: "promote", category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["makeadmin"] },
      { fn: gc.demote, name: "demote", category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["unadmin"] },
      { fn: gc.admins, name: "admins", category: "group", groupOnly: true, aliases: ["listadmins", "adminlist"] },
      { fn: gc.tagall, name: "tagall", category: "group", groupOnly: true, aliases: ["everyone", "all", "mentionall"] },
      { fn: gc.hidetag, name: "hidetag", category: "group", groupOnly: true, aliases: ["htag", "silent", "silentping"] },
      { fn: gc.testAdmin, name: "testadmin", category: "group", groupOnly: true, aliases: ["admintest", "checkadmin"] },
      { fn: gc.refreshAdmin, name: "refreshadmin", category: "group", groupOnly: true, aliases: ["refresh", "clearcache"] },
    ];

    let loaded = 0;
    for (const cmd of groupCoreCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          groupOnly: cmd.groupOnly,
          requireGroupAdmin: cmd.requireGroupAdmin || false,
          requireBotAdmin: cmd.requireBotAdmin || false,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Group Core: loaded ${loaded} commands`);
  }

  // ==================== GROUP MODERATION.JS ====================
  const gm = MODULES.groupMod;
  if (gm && Object.keys(gm).length > 0) {
    const groupModCommands = [
      { fn: gm.warn, name: "warn", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["warning", "warnuser"] },
      { fn: gm.warnings, name: "warnings", category: "group", groupOnly: true, aliases: ["warnlist", "mywarnings"] },
      { fn: gm.clearWarns, name: "clearwarns", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["resetwarns", "clearwarnings"] },
      { fn: gm.ban, name: "ban", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["block", "banuser"] },
      { fn: gm.unban, name: "unban", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unblock", "unbanuser"] },
      { fn: gm.listBanned, name: "listbanned", category: "group", groupOnly: true, aliases: ["bannedlist"] },
    ];

    let loaded = 0;
    for (const cmd of groupModCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          groupOnly: cmd.groupOnly,
          requireGroupAdmin: cmd.requireGroupAdmin || false,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Group Moderation: loaded ${loaded} commands`);
  }

  // ==================== GROUP SETTINGS.JS ====================
  const gs = MODULES.groupSettings;
  if (gs && Object.keys(gs).length > 0) {
    const groupSettingsCommands = [
      { fn: gs.mute || gs.muteGroup, name: "mute", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["lockgroup", "muteall"] },
      { fn: gs.unmute || gs.unmuteGroup, name: "unmute", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unlockgroup", "unmuteall"] },
      { fn: gs.lock || gs.lockGroup, name: "lock", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["lockinfo"] },
      { fn: gs.unlock || gs.unlockGroup, name: "unlock", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unlockinfo"] },
      { fn: gs.antiLink, name: "antilink", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["nolink", "blocklinks"] },
      { fn: gs.antiSpam, name: "antispam", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["nospam", "blockspam"] },
      { fn: gs.welcomeToggle, name: "welcome", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["togglewelcome"] },
      { fn: gs.setWelcome, name: "setwelcome", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setwelcomemsg"] },
      { fn: gs.goodbyeToggle, name: "goodbye", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["togglegoodbye"] },
      { fn: gs.setGoodbye, name: "setgoodbye", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setgoodbyemsg"] },
      { fn: gs.groupInfo, name: "groupinfo", category: "group", groupOnly: true, aliases: ["ginfo", "grouppanel"] },
      { fn: gs.rules, name: "rules", category: "group", groupOnly: true, aliases: ["grules", "grouprules"] },
      { fn: gs.setRules, name: "setrules", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setgrules"] },
      { fn: gs.link, name: "link", category: "group", groupOnly: true, aliases: ["grouplink", "invitelink"] },
      { fn: gs.revoke, name: "revoke", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["revokelink", "resetlink"] },
      { fn: gs.pin, name: "pin", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["pinmsg"] },
      { fn: gs.unpin, name: "unpin", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unpinmsg"] },
      { fn: gs.deleteMsg, name: "delete", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["delmsg", "deletemessage"] },
      { fn: gs.settingsOverview, name: "settings", category: "group", groupOnly: true, aliases: ["groupsettings"] },
      { fn: gs.resetSettings, name: "resetsettings", category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["resetgroupsettings"] },
      { fn: gs.leave, name: "leave", category: "group", groupOnly: true, adminOnly: true, aliases: ["botleave", "exit"] },
      { fn: gs.debug, name: "groupdebug", category: "group", groupOnly: true, aliases: ["gdebug", "groupdbg"] },
      { fn: gs.showParticipants, name: "participants", category: "group", groupOnly: true, aliases: ["members", "memberlist"] },
    ];

    let loaded = 0;
    for (const cmd of groupSettingsCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          groupOnly: cmd.groupOnly,
          requireGroupAdmin: cmd.requireGroupAdmin || false,
          adminOnly: cmd.adminOnly || false,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Group Settings: loaded ${loaded} commands`);
  }

  // ==================== AI.JS ====================
  const ai = MODULES.ai;
  if (ai && Object.keys(ai).length > 0) {
    const aiCommands = [
      { fn: ai.ai, name: "ayobot", category: "ai", aliases: ["chat", "bae", "aichat", "askai"] },
      { fn: ai.aiClear, name: "aiclear", category: "ai", aliases: ["clearchat", "resetai"] },
      { fn: ai.summarize, name: "summarize", category: "ai", aliases: ["summary", "tldr"] },
      { fn: ai.grammar, name: "grammar", category: "ai", aliases: ["spellcheck", "proofread"] },
    ];

    let loaded = 0;
    for (const cmd of aiCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ AI: loaded ${loaded} commands`);
  }

  // ==================== IMAGE TOOLS.JS ====================
  const imgTools = MODULES.imageTools;
  if (imgTools && Object.keys(imgTools).length > 0) {
    const imgCommands = [
      { fn: imgTools.sticker, name: "sticker", category: "media", aliases: ["s", "stk", "makesticker"] },
      { fn: imgTools.toImage, name: "toimage", category: "media", aliases: ["toimg", "stickertoimage"] },
      { fn: imgTools.toVideo, name: "tovideo", category: "media", aliases: ["tovid", "stickertovideo"] },
      { fn: imgTools.toGif, name: "togif", category: "media", aliases: ["makegif", "videotogif"] },
      { fn: imgTools.toAudio, name: "toaudio", category: "media", aliases: ["tomp3", "extractaudio"] },
      { fn: imgTools.removeBg, name: "removebg", category: "media", aliases: ["nobg", "rmbg", "bgremove"] },
      { fn: imgTools.meme, name: "meme", category: "media", aliases: ["makememe", "memegen"] },
    ];

    let loaded = 0;
    for (const cmd of imgCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: cmd.category,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Image Tools: loaded ${loaded} commands`);
  }

  // ==================== JOKES.JS ====================
  const jokes = MODULES.jokes;
  if (jokes) {
    if (jokes.joke) safeRegister("joke", jokes.joke, { category: "fun", aliases: ["laugh", "funny"] });
    if (jokes.roast) safeRegister("roast", jokes.roast, { category: "fun", aliases: ["burn", "insult"] });
    if (jokes.pickupLine) safeRegister("pickup", jokes.pickupLine, { category: "fun", aliases: ["flirt", "pickupline"] });
    cmdLog.ok(`✅ Jokes: loaded`);
  }

  // ==================== GAMES.JS ====================
  const games = MODULES.games;
  if (games) {
    if (games.rps) safeRegister("rps", games.rps, { category: "games", aliases: ["rockpaperscissors"] });
    if (games.dice) safeRegister("dice", games.dice, { category: "games", aliases: ["roll", "rolldice"] });
    if (games.coinFlip) safeRegister("flip", games.coinFlip, { category: "games", aliases: ["coin", "coinflip"] });
    if (games.trivia) safeRegister("trivia", games.trivia, { category: "games", aliases: ["quiz"] });
    cmdLog.ok(`✅ Games: loaded`);
  }

  // ==================== QUOTES.JS ====================
  const quotes = MODULES.quotes;
  if (quotes?.quote) {
    safeRegister("quote", quotes.quote, { category: "fun", aliases: ["motivation", "inspire"] });
    cmdLog.ok(`✅ Quotes: loaded`);
  }

  // ==================== TTS.JS ====================
  const tts = MODULES.tts;
  if (tts?.tts) {
    safeRegister("tts", tts.tts, { category: "media", aliases: ["voice", "say", "speak"] });
    cmdLog.ok(`✅ TTS: loaded`);
  }

  // ==================== CALCULATOR.JS ====================
  const calc = MODULES.calculator;
  if (calc?.calculate) {
    safeRegister("calc", calc.calculate, { category: "tools", aliases: ["math", "calculate"] });
    cmdLog.ok(`✅ Calculator: loaded`);
  }

  // ==================== DICTIONARY.JS ====================
  const dict = MODULES.dictionary;
  if (dict?.dict) {
    safeRegister("dict", dict.dict, { category: "info", aliases: ["define", "meaning", "word"] });
    cmdLog.ok(`✅ Dictionary: loaded`);
  }

  // ==================== NEWS.JS ====================
  const news = MODULES.news;
  if (news?.news) {
    safeRegister("news", news.news, { category: "info", aliases: ["headlines", "latestnews"] });
    cmdLog.ok(`✅ News: loaded`);
  }

  // ==================== MOVIES.JS ====================
  const movies = MODULES.movies;
  if (movies) {
    if (movies.movie) safeRegister("movie", movies.movie, { category: "info", aliases: ["film", "imdb"] });
    if (movies.tv) safeRegister("tv", movies.tv, { category: "info", aliases: ["series", "show"] });
    cmdLog.ok(`✅ Movies: loaded`);
  }

  // ==================== CRYPTO.JS ====================
  const crypto = MODULES.crypto;
  if (crypto) {
    if (crypto.crypto) safeRegister("crypto", crypto.crypto, { category: "info", aliases: ["coin", "btc", "eth"] });
    if (crypto.cryptoTop) safeRegister("cryptotop", crypto.cryptoTop, { category: "info", aliases: ["top10", "topcrypto"] });
    cmdLog.ok(`✅ Crypto: loaded`);
  }

  // ==================== ENCRYPTION.JS ====================
  const enc = MODULES.encryption;
  if (enc) {
    if (enc.encrypt) safeRegister("encrypt", enc.encrypt, { category: "security", aliases: ["enc", "lock"] });
    if (enc.decrypt) safeRegister("decrypt", enc.decrypt, { category: "security", aliases: ["dec", "unlock"] });
    if (enc.hash) safeRegister("hash", enc.hash, { category: "security", aliases: ["md5", "sha256"] });
    if (enc.password) safeRegister("password", enc.password, { category: "security", aliases: ["genpass", "passgen"] });
    cmdLog.ok(`✅ Encryption: loaded`);
  }

  // ==================== NOTES.JS ====================
  const notes = MODULES.notes;
  if (notes) {
    if (notes.note) safeRegister("note", notes.note, { category: "storage", aliases: ["savenote", "remember"] });
    if (notes.getnote) safeRegister("getnote", notes.getnote, { category: "storage", aliases: ["recall", "readnote"] });
    if (notes.notes) safeRegister("notes", notes.notes, { category: "storage", aliases: ["mynotes", "listnotes"] });
    if (notes.deleteKey) safeRegister("delnote", notes.deleteKey, { category: "storage", aliases: ["forget", "deletenote"] });
    cmdLog.ok(`✅ Notes: loaded`);
  }

  // ==================== REMINDER.JS ====================
  const reminder = MODULES.reminder;
  if (reminder) {
    if (reminder.reminder) safeRegister("remind", reminder.reminder, { category: "storage", aliases: ["reminder", "setreminder"] });
    if (reminder.listReminders) safeRegister("reminders", reminder.listReminders, { category: "storage", aliases: ["myreminders"] });
    if (reminder.cancelReminder) safeRegister("cancelreminder", reminder.cancelReminder, { category: "storage", aliases: ["delreminder"] });
    if (reminder.snooze) safeRegister("snooze", reminder.snooze, { category: "storage", aliases: ["snoozereminder"] });
    cmdLog.ok(`✅ Reminder: loaded`);
  }

  // ==================== TRANSLATION.JS ====================
  const trans = MODULES.translation;
  if (trans) {
    if (trans.translate) safeRegister("translate", trans.translate, { category: "tools", aliases: ["tr", "tl"] });
    if (trans.detect) safeRegister("detect", trans.detect, { category: "tools", aliases: ["langdetect"] });
    if (trans.languages) safeRegister("languages", trans.languages, { category: "tools", aliases: ["langs"] });
    cmdLog.ok(`✅ Translation: loaded`);
  }

  // ==================== UNIT CONVERTER.JS ====================
  const uc = MODULES.unitConverter;
  if (uc) {
    if (uc.convert) safeRegister("convert", uc.convert, { category: "tools", aliases: ["conv", "cvt"] });
    if (uc.units) safeRegister("units", uc.units, { category: "tools", aliases: ["listunits"] });
    cmdLog.ok(`✅ Unit Converter: loaded`);
  }

  // ==================== SECURITY.JS ====================
  const sec = MODULES.security;
  if (sec?.scan) {
    safeRegister("scan", sec.scan, { category: "security", aliases: ["urlscan", "checksafe"] });
    cmdLog.ok(`✅ Security: loaded`);
  }

  // ==================== STOCKS.JS ====================
  const stocks = MODULES.stocks;
  if (stocks?.stock) {
    safeRegister("stock", stocks.stock, { category: "info", aliases: ["stocks", "share"] });
    cmdLog.ok(`✅ Stocks: loaded`);
  }

  // ==================== AUTOMATION.JS ====================
  const auto = MODULES.automation;
  if (auto) {
    if (auto.autoReply) safeRegister("autoreply", auto.autoReply, { category: "automation" });
    if (auto.autoSticker) safeRegister("autosticker", auto.autoSticker, { category: "automation" });
    cmdLog.ok(`✅ Automation: loaded`);
  }

  // ==================== FINAL SUMMARY ====================
  cmdLog.div();

  if (failedModules.length > 0) {
    cmdLog.warn(`⚠️ Failed to load modules: ${failedModules.join(", ")}`);
    cmdLog.warn(`⚠️ Some commands may be unavailable. Check file paths and syntax errors.`);
  }

  cmdLog.success(`✅ Registered ${registeredCount} commands total`);
  cmdLog.success(`📊 Primary commands: ${primaryCommands.size} | Aliases: ${commands.size - primaryCommands.size}`);

  if (!!ENV.DEBUG) {
    console.log();
    cmdLog.info("📋 Available command categories:");
    const categories = new Set();
    for (const [, meta] of primaryCommands) {
      categories.add(meta.category);
    }
    for (const cat of Array.from(categories).sort()) {
      const count = Array.from(primaryCommands.values()).filter(m => m.category === cat).length;
      console.log(`   • ${cat}: ${count} commands`);
    }
    console.log();
  }
}

// Call the registration function
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
   "start",
  "init",
  "begin",
  "connectdm",
  "dmopen",
  "ok",
  "dm",
  "tome",
  "senddm",
  "privatemedia",
  "savetodm",
  "sendtome",
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
