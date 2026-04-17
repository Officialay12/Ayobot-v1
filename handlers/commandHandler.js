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
//  COMMAND REGISTRATION — COMPLETE REWRITE
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
      { fn: b.viewOnceToDM || b.ok, name: "ok", category: "media", aliases: ["dm", "tome", "senddm", "push"] },
      { fn: b.take, name: "take", category: "media", aliases: ["takesticker", "steal"] },
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
      { fn: dl.youtube, name: "youtube", aliases: ["yt", "ytdl", "ytmp3"] },
      { fn: dl.tiktok, name: "tiktok", aliases: ["tt", "tok", "tiktokdl"] },
      { fn: dl.spotify, name: "spotify", aliases: ["sp", "spotifydl"] },
      { fn: dl.instagram, name: "instagram", aliases: ["ig", "insta", "igdl"] },
      { fn: dl.facebook, name: "facebook", aliases: ["fb", "fbdl", "fbvideo"] },
      { fn: dl.twitter, name: "twitter", aliases: ["x", "tweet", "xdl"] },
      { fn: dl.gif, name: "gif", aliases: ["giphy", "tenor", "gifsearch"] },
      { fn: dl.image, name: "img", aliases: ["image", "imgsearch", "pics"] },
      { fn: dl.pinterest, name: "pinterest", aliases: ["pin", "pinsearch"] },
      { fn: dl.download, name: "dl", aliases: ["download", "get"] },
    ];

    let loaded = 0;
    for (const cmd of dlCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "dl",
          description: `${cmd.name} downloader`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Downloader: loaded ${loaded} commands (gif, img, play, etc.)`);
  } else {
    cmdLog.warn("⚠️ DOWNLOADER module not loaded - .gif, .img, .play unavailable");
    failedModules.push("downloader");
  }

  // ==================== MUSIC.JS ====================
  const music = MODULES.music;
  if (music && Object.keys(music).length > 0) {
    const musicCommands = [
      { fn: music.musicLyrics, name: "lyrics", aliases: ["lyric", "songlyrics"] },
      { fn: music.musicTrending, name: "trending", aliases: ["chart", "topsongs"] },
      { fn: music.musicRandom, name: "random", aliases: ["randomsong"] },
      { fn: music.musicSearch, name: "musicsearch", aliases: ["songsearch", "findmusic"] },
      { fn: music.musicDownload, name: "play", aliases: ["mp3", "music", "song"] },
      { fn: music.musicArtist, name: "artist", aliases: ["artistinfo", "singer"] },
      { fn: music.musicAlbum, name: "album", aliases: ["albuminfo"] },
      { fn: music.music, name: "music", aliases: ["musichub"] },
    ];

    let loaded = 0;
    for (const cmd of musicCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "music",
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Music: loaded ${loaded} commands`);
  } else {
    cmdLog.warn("⚠️ MUSIC module not loaded - .play, .lyrics unavailable");
    failedModules.push("music");
  }

  // ==================== ADMIN.JS ====================
  const adm = MODULES.admin;
  if (adm && Object.keys(adm).length > 0) {
    const adminCommands = [
      { fn: adm.mode, name: "mode", aliases: ["setmode", "botmode"] },
      { fn: adm.addUser, name: "adduser", aliases: ["auth", "authorize"] },
      { fn: adm.removeUser, name: "removeuser", aliases: ["deauth", "unauthorize"] },
      { fn: adm.listUsers, name: "listusers", aliases: ["users", "authlist"] },
      { fn: adm.broadcast, name: "broadcast", aliases: ["bc", "announce"] },
      { fn: adm.globalBroadcast, name: "globalbc", aliases: ["gbc", "globalbroadcast"] },
      { fn: adm.stats, name: "stats", aliases: ["botstats", "usage"] },
      { fn: adm.botStatus, name: "botstatus", aliases: ["botinfo", "fullstatus"] },
      { fn: adm.superBan, name: "superban", aliases: ["globalban", "permban"] },
      { fn: adm.unban, name: "superunban", aliases: ["globalunban"] },
      { fn: adm.listBanned, name: "listglobalbanned", aliases: ["globalbannedlist"] },
      { fn: adm.clearBans, name: "clearbans", aliases: ["resetbans"] },
      { fn: adm.restart, name: "restart", aliases: ["reboot", "restartbot"] },
      { fn: adm.shutdown, name: "shutdown", aliases: ["stop", "botoff"] },
      { fn: adm.adminEval, name: "eval", aliases: ["exec", "code", "run"] },
    ];

    let loaded = 0;
    for (const cmd of adminCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "admin",
          adminOnly: true,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Admin: loaded ${loaded} commands (including .mode)`);
  } else {
    cmdLog.warn("⚠️ ADMIN module not loaded - .mode command unavailable");
    failedModules.push("admin");
  }

  // ==================== GROUP CORE.JS ====================
  const gc = MODULES.groupCore;
  if (gc && Object.keys(gc).length > 0) {
    const groupCommands = [
      { fn: gc.kick, name: "kick", aliases: ["remove", "kickmember"], requireGroupAdmin: true, requireBotAdmin: true },
      { fn: gc.add, name: "add", aliases: ["invite", "addmember"], requireGroupAdmin: true, requireBotAdmin: true },
      { fn: gc.promote, name: "promote", aliases: ["makeadmin"], requireGroupAdmin: true, requireBotAdmin: true },
      { fn: gc.demote, name: "demote", aliases: ["unadmin"], requireGroupAdmin: true, requireBotAdmin: true },
      { fn: gc.admins, name: "admins", aliases: ["listadmins", "adminlist"] },
      { fn: gc.tagall, name: "tagall", aliases: ["everyone", "all", "mentionall"] },
      { fn: gc.hidetag, name: "hidetag", aliases: ["htag", "silent", "silentping"] },
    ];

    let loaded = 0;
    for (const cmd of groupCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "group",
          groupOnly: true,
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
    const modCommands = [
      { fn: gm.warn, name: "warn", aliases: ["warning", "warnuser"], requireGroupAdmin: true },
      { fn: gm.warnings, name: "warnings", aliases: ["warnlist", "mywarnings"] },
      { fn: gm.clearWarns, name: "clearwarns", aliases: ["resetwarns", "clearwarnings"], requireGroupAdmin: true },
      { fn: gm.ban, name: "ban", aliases: ["block", "banuser"], requireGroupAdmin: true },
      { fn: gm.unban, name: "unban", aliases: ["unblock", "unbanuser"], requireGroupAdmin: true },
      { fn: gm.listBanned, name: "listbanned", aliases: ["bannedlist"] },
    ];

    let loaded = 0;
    for (const cmd of modCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "group",
          groupOnly: true,
          requireGroupAdmin: cmd.requireGroupAdmin || false,
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Group Mod: loaded ${loaded} commands`);
  }

  // ==================== GROUP SETTINGS.JS ====================
  const gs = MODULES.groupSettings;
  if (gs && Object.keys(gs).length > 0) {
    const settingsCommands = [
      { fn: gs.mute || gs.muteGroup, name: "mute", aliases: ["lockgroup", "muteall"], requireGroupAdmin: true },
      { fn: gs.unmute || gs.unmuteGroup, name: "unmute", aliases: ["unlockgroup", "unmuteall"], requireGroupAdmin: true },
      { fn: gs.lock || gs.lockGroup, name: "lock", aliases: ["lockinfo"], requireGroupAdmin: true },
      { fn: gs.unlock || gs.unlockGroup, name: "unlock", aliases: ["unlockinfo"], requireGroupAdmin: true },
      { fn: gs.link || gs.getLink, name: "link", aliases: ["grouplink", "invitelink"] },
      { fn: gs.revoke || gs.revokeLink, name: "revoke", aliases: ["revokelink", "resetlink"], requireGroupAdmin: true },
      { fn: gs.rules || gs.getRules, name: "rules", aliases: ["grules", "grouprules"] },
      { fn: gs.setRules || gs.setGroupRules, name: "setrules", aliases: ["setgrules"], requireGroupAdmin: true },
      { fn: gs.groupInfo || gs.getGroupInfo, name: "groupinfo", aliases: ["ginfo", "grouppanel"] },
      { fn: gs.settingsOverview || gs.getSettings, name: "settings", aliases: ["groupsettings"] },
      { fn: gs.welcomeToggle || gs.toggleWelcome, name: "welcome", aliases: ["togglewelcome"], requireGroupAdmin: true },
      { fn: gs.goodbyeToggle || gs.toggleGoodbye, name: "goodbye", aliases: ["togglegoodbye"], requireGroupAdmin: true },
      { fn: gs.deleteMsg || gs.deleteMessage, name: "delete", aliases: ["delmsg", "deletemessage"], requireGroupAdmin: true },
      { fn: gs.pin || gs.pinMessage, name: "pin", aliases: ["pinmsg"], requireGroupAdmin: true },
      { fn: gs.unpin || gs.unpinMessage, name: "unpin", aliases: ["unpinmsg"], requireGroupAdmin: true },
      { fn: gs.leave || gs.leaveGroup, name: "leave", aliases: ["botleave", "exit"], adminOnly: true },
      { fn: gs.resetSettings || gs.resetGroupSettings, name: "resetsettings", aliases: ["resetgroupsettings"], requireGroupAdmin: true },
    ];

    let loaded = 0;
    for (const cmd of settingsCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "group",
          groupOnly: true,
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
      { fn: ai.ai, name: "ayobot", aliases: ["chat", "bae", "aichat"] },
      { fn: ai.aiClear, name: "aiclear", aliases: ["clearchat", "resetai"] },
      { fn: ai.summarize, name: "summarize", aliases: ["summary", "baesum"] },
      { fn: ai.grammar, name: "grammar", aliases: ["spellcheck", "proofread"] },
    ];

    let loaded = 0;
    for (const cmd of aiCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "ai",
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
      { fn: imgTools.sticker, name: "sticker", aliases: ["s", "stk", "makesticker"] },
      { fn: imgTools.toImage, name: "toimage", aliases: ["toimg", "stickertoimage"] },
      { fn: imgTools.toVideo, name: "tovideo", aliases: ["tovid", "stickertovideo"] },
      { fn: imgTools.toGif, name: "togif", aliases: ["makegif", "videotogif"] },
      { fn: imgTools.toAudio, name: "toaudio", aliases: ["tomp3", "extractaudio"] },
      { fn: imgTools.removeBg, name: "removebg", aliases: ["nobg", "rmbg", "bgremove"] },
      { fn: imgTools.meme, name: "meme", aliases: ["makememe", "memegen"] },
    ];

    let loaded = 0;
    for (const cmd of imgCommands) {
      if (cmd.fn && typeof cmd.fn === "function") {
        safeRegister(cmd.name, cmd.fn, {
          category: "media",
          description: `${cmd.name} command`,
          aliases: cmd.aliases,
        });
        loaded++;
        registeredCount++;
      }
    }
    cmdLog.ok(`✅ Image Tools: loaded ${loaded} commands`);
  }

  // ==================== FUN/GAMES MODULES ====================

  // Jokes
  const jokes = MODULES.jokes;
  if (jokes) {
    if (jokes.joke) safeRegister("joke", jokes.joke, { category: "fun", aliases: ["laugh", "funny"] });
    if (jokes.roast) safeRegister("roast", jokes.roast, { category: "fun", aliases: ["burn", "insult"] });
    if (jokes.pickupLine) safeRegister("pickup", jokes.pickupLine, { category: "fun", aliases: ["flirt", "pickupline"] });
    cmdLog.ok(`✅ Jokes: loaded`);
  }

  // Games
  const games = MODULES.games;
  if (games) {
    if (games.rps) safeRegister("rps", games.rps, { category: "games", aliases: ["rockpaperscissors"] });
    if (games.dice) safeRegister("dice", games.dice, { category: "games", aliases: ["roll", "rolldice"] });
    if (games.coinFlip) safeRegister("flip", games.coinFlip, { category: "games", aliases: ["coin", "coinflip"] });
    if (games.trivia) safeRegister("trivia", games.trivia, { category: "games", aliases: ["quiz"] });
    cmdLog.ok(`✅ Games: loaded`);
  }

  // Quotes
  const quotes = MODULES.quotes;
  if (quotes?.quote) {
    safeRegister("quote", quotes.quote, { category: "fun", aliases: ["motivation", "inspire"] });
    cmdLog.ok(`✅ Quotes: loaded`);
  }

  // ==================== UTILITY MODULES ====================

  // TTS
  const tts = MODULES.tts;
  if (tts?.tts) {
    safeRegister("tts", tts.tts, { category: "media", aliases: ["voice", "say", "speak"] });
    cmdLog.ok(`✅ TTS: loaded`);
  }

  // Calculator
  const calc = MODULES.calculator;
  if (calc?.calculate) {
    safeRegister("calc", calc.calculate, { category: "tools", aliases: ["math", "calculate"] });
    cmdLog.ok(`✅ Calculator: loaded`);
  }

  // Dictionary
  const dict = MODULES.dictionary;
  if (dict?.dict) {
    safeRegister("dict", dict.dict, { category: "info", aliases: ["define", "meaning", "word"] });
    cmdLog.ok(`✅ Dictionary: loaded`);
  }

  // News
  const news = MODULES.news;
  if (news?.news) {
    safeRegister("news", news.news, { category: "info", aliases: ["headlines", "latestnews"] });
    cmdLog.ok(`✅ News: loaded`);
  }

  // Movies
  const movies = MODULES.movies;
  if (movies?.movie) {
    safeRegister("movie", movies.movie, { category: "info", aliases: ["film", "imdb"] });
    if (movies.tv) safeRegister("tv", movies.tv, { category: "info", aliases: ["series", "show"] });
    cmdLog.ok(`✅ Movies: loaded`);
  }

  // Crypto
  const crypto = MODULES.crypto;
  if (crypto?.crypto) {
    safeRegister("crypto", crypto.crypto, { category: "info", aliases: ["coin", "btc", "eth"] });
    if (crypto.cryptoTop) safeRegister("cryptotop", crypto.cryptoTop, { category: "info", aliases: ["top10", "topcrypto"] });
    cmdLog.ok(`✅ Crypto: loaded`);
  }

  // Encryption
  const enc = MODULES.encryption;
  if (enc) {
    if (enc.encrypt) safeRegister("encrypt", enc.encrypt, { category: "security", aliases: ["enc", "lock"] });
    if (enc.decrypt) safeRegister("decrypt", enc.decrypt, { category: "security", aliases: ["dec", "unlock"] });
    if (enc.hash) safeRegister("hash", enc.hash, { category: "security", aliases: ["md5", "sha256"] });
    if (enc.password) safeRegister("password", enc.password, { category: "security", aliases: ["genpass", "passgen"] });
    cmdLog.ok(`✅ Encryption: loaded`);
  }

  // Notes
  const notes = MODULES.notes;
  if (notes) {
    if (notes.note) safeRegister("note", notes.note, { category: "storage", aliases: ["savenote", "remember"] });
    if (notes.getnote) safeRegister("getnote", notes.getnote, { category: "storage", aliases: ["recall", "readnote"] });
    if (notes.notes) safeRegister("notes", notes.notes, { category: "storage", aliases: ["mynotes", "listnotes"] });
    if (notes.deleteKey) safeRegister("delnote", notes.deleteKey, { category: "storage", aliases: ["forget", "deletenote"] });
    cmdLog.ok(`✅ Notes: loaded`);
  }

  // Reminder
  const reminder = MODULES.reminder;
  if (reminder) {
    if (reminder.reminder) safeRegister("remind", reminder.reminder, { category: "storage", aliases: ["reminder", "setreminder"] });
    if (reminder.listReminders) safeRegister("reminders", reminder.listReminders, { category: "storage", aliases: ["myreminders"] });
    if (reminder.cancelReminder) safeRegister("cancelreminder", reminder.cancelReminder, { category: "storage", aliases: ["delreminder"] });
    if (reminder.snooze) safeRegister("snooze", reminder.snooze, { category: "storage", aliases: ["snoozereminder"] });
    cmdLog.ok(`✅ Reminder: loaded`);
  }

  // Translation
  const trans = MODULES.translation;
  if (trans) {
    if (trans.translate) safeRegister("translate", trans.translate, { category: "tools", aliases: ["tr", "tl"] });
    if (trans.detect) safeRegister("detect", trans.detect, { category: "tools", aliases: ["langdetect"] });
    if (trans.languages) safeRegister("languages", trans.languages, { category: "tools", aliases: ["langs"] });
    cmdLog.ok(`✅ Translation: loaded`);
  }

  // Unit Converter
  const uc = MODULES.unitConverter;
  if (uc) {
    if (uc.convert) safeRegister("convert", uc.convert, { category: "tools", aliases: ["conv", "cvt"] });
    if (uc.units) safeRegister("units", uc.units, { category: "tools", aliases: ["listunits"] });
    cmdLog.ok(`✅ Unit Converter: loaded`);
  }

  // Security
  const sec = MODULES.security;
  if (sec?.scan) {
    safeRegister("scan", sec.scan, { category: "security", aliases: ["urlscan", "checksafe"] });
    cmdLog.ok(`✅ Security: loaded`);
  }

  // Stocks
  const stocks = MODULES.stocks;
  if (stocks?.stock) {
    safeRegister("stock", stocks.stock, { category: "info", aliases: ["stocks", "share"] });
    cmdLog.ok(`✅ Stocks: loaded`);
  }

  // Automation
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
  // NEW: .ok command and aliases exempt from activation requirement
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
