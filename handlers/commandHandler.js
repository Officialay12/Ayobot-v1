// handlers/commandHandler.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER — COMPLETE PRODUCTION VERSION
//  Author: AYOCODES
//  Version: v1.0.0
//
//  ALL COMMANDS REGISTERED PROPERLY
//  ALL MODULES LOADED CORRECTLY
//  NO MISSING EXPORTS
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
  reset  : "\x1b[0m",
  bright : "\x1b[1m",
  red    : "\x1b[31m",
  green  : "\x1b[32m",
  yellow : "\x1b[33m",
  blue   : "\x1b[34m",
  magenta: "\x1b[35m",
  cyan   : "\x1b[36m",
  gray   : "\x1b[90m",
  dim    : "\x1b[2m",
};

const cmdLog = {
  ok     : (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err    : (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn   : (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info   : (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  cmd    : (m) => console.log(`${C.magenta}⚡${C.reset} ${m}`),
  debug  : (m) => !!ENV.DEBUG && console.log(`${C.gray}🔍${C.reset} ${m}`),
  success: (m) => console.log(`${C.green}✓${C.reset}  ${m}`),
  title  : (m) => console.log(`\n${C.blue}${C.bright}${m}${C.reset}\n`),
  div    : ()  => console.log(`${C.cyan}${"─".repeat(60)}${C.reset}`),
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
  cmdLog.warn("⚠️ No owner phone configured! Set ADMIN or OWNER_PHONE in environment");
} else {
  ENV.OWNER_PHONE = OWNER_PHONE;
  cmdLog.ok(`✅ Owner configured: ${OWNER_PHONE}`);
}

// ============================================================================
//  RATE LIMITER
// ============================================================================
class RateLimiter {
  constructor(maxRequests = 15, windowMs = 60_000) {
    this.max    = maxRequests;
    this.window = windowMs;
    this.map    = new Map();
    this.cleanupInterval = null;
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  isAllowed(id) {
    const now  = Date.now();
    const hits = (this.map.get(id) || []).filter((t) => now - t < this.window);
    if (hits.length >= this.max) return false;
    hits.push(now);
    this.map.set(id, hits);
    return true;
  }

  remaining(id) {
    const now  = Date.now();
    const hits = (this.map.get(id) || []).filter((t) => now - t < this.window);
    if (hits.length < this.max) return 0;
    return Math.max(0, this.window - (now - Math.min(...hits)));
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
  parseInt(ENV.RATE_LIMIT_MAX)    || 15,
  parseInt(ENV.RATE_LIMIT_WINDOW) || 60_000,
);
rateLimiter.startCleanup();

// ============================================================================
//  COMMAND COOLDOWN MANAGER
// ============================================================================
class CommandCooldown {
  constructor() {
    this.cooldowns       = new Map();
    this.defaultCooldown = 3_000;
    this.customCooldowns = new Map([
      ["play",      10_000],
      ["youtube",   10_000],
      ["download",   8_000],
      ["search",     5_000],
      ["broadcast", 30_000],
      ["globalbc",  60_000],
    ]);
  }

  getCooldown(commandName) {
    return this.customCooldowns.get(commandName) || this.defaultCooldown;
  }

  isOnCooldown(userId, commandName) {
    const expiry = this.cooldowns.get(`${userId}:${commandName}`);
    return expiry ? Date.now() < expiry : false;
  }

  setCooldown(userId, commandName) {
    const key      = `${userId}:${commandName}`;
    const duration = this.getCooldown(commandName);
    const expiry   = Date.now() + duration;
    this.cooldowns.set(key, expiry);
    setTimeout(() => {
      if (this.cooldowns.get(key) === expiry) this.cooldowns.delete(key);
    }, duration);
  }

  getRemaining(userId, commandName) {
    const expiry = this.cooldowns.get(`${userId}:${commandName}`);
    return expiry ? Math.max(0, expiry - Date.now()) : 0;
  }
}

const commandCooldown = new CommandCooldown();

// ============================================================================
//  TRIVIA STATE
// ============================================================================
if (!global.activeTrivia) global.activeTrivia = new Map();

// ============================================================================
//  HELPERS
// ============================================================================
function normalizeJid(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return String(jid).split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

function sanitizeInput(input) {
  if (!input || typeof input !== "string") return "";
  return input.slice(0, 2000).replace(/[<>]/g, "");
}

// ============================================================================
//  MODULE LOADER — CORRECT PATHS
// ============================================================================

const MODULES = {};

async function safeImport(moduleName, specifier) {
  try {
    const mod = await import(specifier);

    const defaultFns =
      mod.default && typeof mod.default === "object"
        ? Object.fromEntries(
            Object.entries(mod.default).filter(([, v]) => typeof v === "function"),
          )
        : {};

    const namedFns = Object.fromEntries(
      Object.entries(mod).filter(([k, v]) => k !== "default" && typeof v === "function"),
    );

    const merged = { ...defaultFns, ...namedFns, __raw: mod };
    const count  = Object.keys(merged).filter((k) => k !== "__raw").length;

    if (count === 0) {
      cmdLog.warn(`${moduleName.padEnd(16)} ➜ loaded but NO functions exported`);
    } else {
      cmdLog.ok(`${moduleName.padEnd(16)} ➜ ${count} functions`);
    }

    return merged;
  } catch (error) {
    cmdLog.err(`${moduleName.padEnd(16)} ➜ FAILED: ${error.message}`);
    return {};
  }
}

async function loadAllModules() {
  cmdLog.title("📦 LOADING COMMAND MODULES");
  cmdLog.div();

  const moduleMap = {
    // Group command modules
    basic        : "../commands/group/basic.js",
    admin        : "../commands/group/admin.js",
    viewonce     : "../commands/group/viewonce.js",
    groupCore    : "../commands/group/core.js",
    groupMod     : "../commands/group/moderation.js",
    groupSettings: "../commands/group/settings.js",
    automation   : "../commands/group/automation.js",

    // Feature modules
    downloader   : "../features/downloader.js",
    ai           : "../features/ai.js",
    calculator   : "../features/calculator.js",
    crypto       : "../features/crypto.js",
    dictionary   : "../features/dictionary.js",
    encryption   : "../features/encryption.js",
    games        : "../features/games.js",
    imageTools   : "../features/imageTools.js",
    jokes        : "../features/jokes.js",
    movies       : "../features/movies.js",
    music        : "../features/music.js",
    news         : "../features/news.js",
    notes        : "../features/notes.js",
    quotes       : "../features/quotes.js",
    reminder     : "../features/reminder.js",
    security     : "../features/security.js",
    stocks       : "../features/stocks.js",
    translation  : "../features/translation.js",
    tts          : "../features/tts.js",
    unitConverter: "../features/unitConverter.js",
  };

  for (const [name, specifier] of Object.entries(moduleMap)) {
    MODULES[name] = await safeImport(name, specifier);
  }

  const loaded = Object.values(MODULES).filter(
    (m) => Object.keys(m).some((k) => k !== "__raw" && typeof m[k] === "function"),
  ).length;

  cmdLog.div();
  cmdLog.success(`✅ Loaded ${loaded}/${Object.keys(moduleMap).length} modules`);
  console.log();
}

await loadAllModules();

// ============================================================================
//  COMMAND REGISTRY
// ============================================================================
export const commands        = new Map();
export const primaryCommands = new Map();
export const aliasMap        = new Map();
export const commandStats    = new Map();

class CommandMeta {
  constructor(primaryName, handler, options = {}) {
    this.primaryName       = primaryName.toLowerCase();
    this.handler           = handler;
    this.category          = options.category          || "general";
    this.description       = options.description       || "";
    this.adminOnly         = options.adminOnly         === true;
    this.groupOnly         = options.groupOnly         === true;
    this.requireGroupAdmin = options.requireGroupAdmin === true;
    this.requireBotAdmin   = options.requireBotAdmin   === true;
    this.aliases           = (options.aliases || []).map((a) => a.toLowerCase());
  }
}

export function registerCommand(primaryName, handler, options = {}) {
  if (typeof handler !== "function") {
    cmdLog.err(`Cannot register "${primaryName}": handler is not a function`);
    return false;
  }

  const name    = primaryName.toLowerCase();
  const aliases = (options.aliases || []).map((a) => a.toLowerCase());
  const meta    = new CommandMeta(name, handler, options);

  primaryCommands.set(name, meta);
  commands.set(name, meta);
  commandStats.set(name, { uses: 0, errors: 0, lastUsed: null, avgResponseTime: 0, totalResponseTime: 0 });

  for (const alias of aliases) {
    if (alias === name) continue;
    commands.set(alias, { ...meta, isAlias: true, aliasName: alias, primaryName: name, handler });
    aliasMap.set(alias, name);
  }

  return true;
}

export function safeRegister(primaryName, handler, options = {}) {
  if (typeof handler !== "function") return false;
  try {
    return registerCommand(primaryName, handler, options);
  } catch (error) {
    cmdLog.err(`safeRegister("${primaryName}") threw: ${error.message}`);
    return false;
  }
}

function fn(mod, ...keys) {
  for (const key of keys) {
    if (mod && typeof mod[key] === "function") return mod[key];
  }
  return null;
}

// ============================================================================
//  COMMAND REGISTRATION
// ============================================================================
export function registerAllCommands() {
  cmdLog.title("📝 REGISTERING ALL COMMANDS");
  cmdLog.div();

  let count = 0;

  // ── BASIC.JS ──────────────────────────────────────────────────────────────
  const b = MODULES.basic;

  const rb = (name, key, opts) => {
    const f = fn(b, key, name);
    if (!f) {
      cmdLog.warn(`basic.js missing "${key}" — skipping .${name}`);
      return;
    }
    if (safeRegister(name, f, opts)) count++;
  };

  rb("menu",       "menu",        { category: "core",    aliases: ["help", "commands", "h", "cmd", "cmds"] });
  rb("ping",       "ping",        { category: "core",    aliases: ["pong", "latency", "ms", "alive"] });
  rb("status",     "status",      { category: "core",    aliases: ["me", "whoami", "myinfo"] });
  rb("creator",    "creator",     { category: "core",    aliases: ["dev", "owner", "author", "ayo"] });
  rb("github",     "creatorGit",  { category: "core",    aliases: ["git", "repo", "source"] });
  rb("auto",       "auto",        { category: "core",    aliases: ["autoreply", "toggleauto"] });
  rb("connect",    "connectInfo", { category: "core",    aliases: ["community", "links"] });
  rb("prefix",     "prefixinfo",  { category: "core",    aliases: ["preinfo", "getprefix"] });
  rb("test",       "test",        { category: "debug",   aliases: ["hello", "hi", "testbot"] });
  rb("start",      "start",       { category: "core",    aliases: ["open", "init", "begin", "connectdm", "dmopen"] });
  rb("time",       "time",        { category: "info",    aliases: ["worldtime", "timezone", "clock"] });
  rb("weather",    "weather",     { category: "info",    aliases: ["w", "forecast", "temp"] });
  rb("ip",         "ip",          { category: "web",     aliases: ["getip", "iplookup", "ipinfo"] });
  rb("myip",       "myip",        { category: "web",     aliases: ["myipaddr", "publicip", "whatismyip"] });
  rb("whois",      "whois",       { category: "web",     aliases: ["domain", "domaininfo"] });
  rb("dns",        "dns",         { category: "web",     aliases: ["dnslookup", "nslookup", "dig"] });
  rb("url",        "url",         { category: "web",     aliases: ["urlinfo", "urlcheck"] });
  rb("fetch",      "fetch",       { category: "web",     aliases: ["geturl", "curl", "httpget"] });
  rb("scrape",     "scrape",      { category: "web",     aliases: ["scraper", "webscrape"] });
  rb("screenshot", "screenshot",  { category: "web",     aliases: ["ss", "capture", "snap"] });
  rb("inspect",    "inspect",     { category: "web",     aliases: ["pageinspect", "analyze"] });
  rb("shorten",    "shorten",     { category: "web",     aliases: ["short", "tinyurl", "bitly"] });
  rb("vv",         "viewOnce",    { category: "media",   aliases: ["viewonce", "reveal"] });
  rb("qr",         "qencode",     { category: "tools",   aliases: ["qrcode", "makeqr"] });
  rb("pdf",        "pdf",         { category: "tools",   aliases: ["makepdf", "createpdf"] });
  rb("getpp",      "getpp",       { category: "profile", aliases: ["pp", "profilepic", "pfp"] });
  rb("getgpp",     "getgpp",      { category: "profile", groupOnly: true, aliases: ["gpp", "grouppic"] });
  rb("jarvis",     "jarvis",      { category: "ai",      aliases: ["j"] });
  rb("waitlist",   "joinWaitlist",{ category: "misc",    aliases: ["joinwait"] });
  rb("imgbb",      "imgbb",       { category: "media",   aliases: ["upload", "imageupload"] });
  rb("activate",   "activate",    { category: "group",   groupOnly: true, adminOnly: true });
  rb("deactivate", "deactivate",  { category: "group",   groupOnly: true, adminOnly: true });
  rb("antilink",   "antilink",    { category: "group",   groupOnly: true, aliases: ["nolink", "blocklinks"] });

  // ✅ .ok from basic.js (now has proper functions)
  {
    const bMod = MODULES.basic;
    const okFn = fn(bMod, "ok", "viewOnceToDM", "dm", "tome");

    if (okFn) {
      if (safeRegister("ok", okFn, {
        category: "media",
        aliases : ["dm", "tome", "senddm", "push", "privatemedia", "savetodm", "sendtome"],
      })) {
        count++;
        cmdLog.success("✅ .ok registered → ok function");
      }
    } else {
      cmdLog.warn("⚠️ ok function not found in basic.js");
    }
  }

  // ── TTS.JS ────────────────────────────────────────────────────────────────
  {
    const m = MODULES.tts;
    const f = fn(m, "tts", "textToSpeech", "speak");
    if (safeRegister("tts", f, { category: "media", aliases: ["voice", "say", "speak"] })) count++;
  }

  // ── GAMES.JS ──────────────────────────────────────────────────────────────
  {
    const m = MODULES.games;
    if (safeRegister("rps",    fn(m, "rps", "rockPaperScissors"), { category: "games", aliases: ["rockpaperscissors"] })) count++;
    if (safeRegister("dice",   fn(m, "dice", "rollDice"),         { category: "games", aliases: ["roll", "rolldice"] })) count++;
    if (safeRegister("flip",   fn(m, "coinFlip", "flip"),         { category: "games", aliases: ["coin", "coinflip"] })) count++;
    if (safeRegister("trivia", fn(m, "trivia"),                   { category: "games", aliases: ["quiz"] })) count++;
  }

  // ── JOKES.JS ──────────────────────────────────────────────────────────────
  {
    const m = MODULES.jokes;
    if (safeRegister("joke",   fn(m, "joke", "getJoke", "randomJoke"),      { category: "fun", aliases: ["laugh", "funny"] })) count++;
    if (safeRegister("roast",  fn(m, "roast", "burnUser"),                  { category: "fun", aliases: ["burn", "insult"] })) count++;
    if (safeRegister("pickup", fn(m, "pickupLine", "pickupline", "pickup"), { category: "fun", aliases: ["flirt", "pickupline"] })) count++;
  }

  // ── QUOTES.JS ─────────────────────────────────────────────────────────────
  {
    const m = MODULES.quotes;
    if (safeRegister("quote", fn(m, "quote", "getQuote", "randomQuote", "motivation"), { category: "fun", aliases: ["motivation", "inspire"] })) count++;
  }

  // ── CALCULATOR.JS ─────────────────────────────────────────────────────────
  {
    const m = MODULES.calculator;
    if (safeRegister("calc", fn(m, "calculate", "calc", "calculator"), { category: "tools", aliases: ["math", "calculate"] })) count++;
  }

  // ── DICTIONARY.JS ─────────────────────────────────────────────────────────
  {
    const m = MODULES.dictionary;
    if (safeRegister("dict", fn(m, "dict", "define", "dictionary"), { category: "info", aliases: ["define", "meaning", "word"] })) count++;
  }

  // ── DOWNLOADER.JS (features folder) ───────────────────────────────────────
  {
    const m = MODULES.downloader;

    if (!m || Object.keys(m).filter((k) => k !== "__raw").length === 0) {
      cmdLog.warn("⚠️ Downloader module not loaded — check ../features/downloader.js");
    } else {
      cmdLog.debug(`Downloader exports: ${Object.keys(m).filter((k) => k !== "__raw").join(", ")}`);

      if (safeRegister("youtube",   fn(m, "youtube", "yt", "ytdl", "downloadYouTube"), { category: "dl", aliases: ["yt", "ytdl", "ytinfo"] })) count++;
      if (safeRegister("tiktok",    fn(m, "tiktok", "tt", "downloadTikTok"),           { category: "dl", aliases: ["tt", "tok", "tiktokdl"] })) count++;
      if (safeRegister("spotify",   fn(m, "spotify", "sp", "downloadSpotify"),         { category: "dl", aliases: ["sp", "spotifydl"] })) count++;
      if (safeRegister("instagram", fn(m, "instagram", "ig", "downloadInstagram"),     { category: "dl", aliases: ["ig", "insta", "igdl"] })) count++;
      if (safeRegister("facebook",  fn(m, "facebook", "fb", "downloadFacebook"),       { category: "dl", aliases: ["fb", "fbdl"] })) count++;
      if (safeRegister("twitter",   fn(m, "twitter", "x", "downloadTwitter"),          { category: "dl", aliases: ["x", "tweet", "xdl"] })) count++;
      if (safeRegister("gif",       fn(m, "gif", "giphy", "searchGif"),                { category: "dl", aliases: ["giphy", "tenor", "gifsearch"] })) count++;
      if (safeRegister("img",       fn(m, "image", "img", "searchImage"),              { category: "dl", aliases: ["image", "imgsearch", "pics"] })) count++;
      if (safeRegister("pinterest", fn(m, "pinterest", "pin", "searchPinterest"),      { category: "dl", aliases: ["pin", "pinsearch"] })) count++;
      if (safeRegister("dl",        fn(m, "download", "dl", "universalDownload"),      { category: "dl", aliases: ["download", "get"] })) count++;
      if (safeRegister("play",      fn(m, "play", "musicDownload"),                    { category: "music", aliases: ["mp3", "song", "music"] })) count++;
    }
  }

  // ── MUSIC.JS (fallback if downloader doesn't have play) ────────────────────
  {
    const m = MODULES.music;
    if (!primaryCommands.has("play")) {
      if (safeRegister("play", fn(m, "musicDownload", "play", "playMusic"), { category: "music", aliases: ["mp3", "music", "song"] })) count++;
    }
    if (safeRegister("lyrics",      fn(m, "musicLyrics", "lyrics", "getLyrics"),   { category: "music", aliases: ["lyric", "songlyrics"] })) count++;
    if (safeRegister("trending",    fn(m, "musicTrending", "trending", "charts"),  { category: "music", aliases: ["chart", "topsongs"] })) count++;
    if (safeRegister("musicsearch", fn(m, "musicSearch", "search", "findSong"),    { category: "music", aliases: ["songsearch", "findmusic"] })) count++;
  }

  // ── IMAGE TOOLS.JS ────────────────────────────────────────────────────────
  {
    const m = MODULES.imageTools;
    if (safeRegister("sticker",  fn(m, "sticker", "makeSticker", "createSticker"), { category: "media", aliases: ["s", "stk", "makesticker"] })) count++;
    if (safeRegister("toimage",  fn(m, "toImage", "stickerToImage"),               { category: "media", aliases: ["toimg"] })) count++;
    if (safeRegister("tovideo",  fn(m, "toVideo", "stickerToVideo"),               { category: "media", aliases: ["tovid"] })) count++;
    if (safeRegister("togif",    fn(m, "toGif", "makeGif"),                        { category: "media", aliases: ["makegif"] })) count++;
    if (safeRegister("toaudio",  fn(m, "toAudio", "extractAudio"),                 { category: "media", aliases: ["tomp3", "extractaudio"] })) count++;
    if (safeRegister("removebg", fn(m, "removeBg", "removeBG", "rmbg"),            { category: "media", aliases: ["nobg", "rmbg"] })) count++;
    if (safeRegister("meme",     fn(m, "meme", "makeMeme"),                        { category: "media", aliases: ["makememe"] })) count++;
  }

  // ── AI.JS ─────────────────────────────────────────────────────────────────
  {
    const m = MODULES.ai;
    if (safeRegister("ayobot",    fn(m, "ai", "chat", "ayobot"),  { category: "ai", aliases: ["chat", "bae", "aichat", "askai"] })) count++;
    if (safeRegister("aiclear",   fn(m, "aiClear", "clearChat"),  { category: "ai", aliases: ["clearchat", "resetai"] })) count++;
    if (safeRegister("summarize", fn(m, "summarize", "summary"),  { category: "ai", aliases: ["summary", "tldr"] })) count++;
    if (safeRegister("grammar",   fn(m, "grammar", "spellcheck"), { category: "ai", aliases: ["spellcheck", "proofread"] })) count++;
  }

  // ── ADMIN.JS ──────────────────────────────────────────────────────────────
  {
    const m = MODULES.admin;
    if (safeRegister("mode",             fn(m, "mode", "setMode", "botMode"),              { category: "admin", adminOnly: true, aliases: ["setmode", "botmode"] })) count++;
    if (safeRegister("adduser",          fn(m, "addUser", "adduser", "authorize"),         { category: "admin", adminOnly: true, aliases: ["auth", "authorize"] })) count++;
    if (safeRegister("removeuser",       fn(m, "removeUser", "removeuser", "deauthorize"), { category: "admin", adminOnly: true, aliases: ["deauth"] })) count++;
    if (safeRegister("listusers",        fn(m, "listUsers", "listusers", "users"),         { category: "admin", adminOnly: true, aliases: ["users", "authlist"] })) count++;
    if (safeRegister("broadcast",        fn(m, "broadcast", "bc"),                        { category: "admin", adminOnly: true, aliases: ["bc", "announce"] })) count++;
    if (safeRegister("globalbc",         fn(m, "globalBroadcast", "globalbc", "globalBc"), { category: "admin", adminOnly: true, aliases: ["gbc"] })) count++;
    if (safeRegister("stats",            fn(m, "stats", "botStats", "botstats"),           { category: "admin", adminOnly: true, aliases: ["botstats", "usage"] })) count++;
    if (safeRegister("botstatus",        fn(m, "botStatus", "botstatus", "fullStatus"),    { category: "admin", adminOnly: true, aliases: ["botinfo", "fullstatus"] })) count++;
    if (safeRegister("superban",         fn(m, "superBan", "superban", "globalBan"),       { category: "admin", adminOnly: true, aliases: ["globalban", "permban"] })) count++;
    if (safeRegister("superunban",       fn(m, "unban", "superUnBan", "globalUnban"),      { category: "admin", adminOnly: true, aliases: ["globalunban"] })) count++;
    if (safeRegister("listglobalbanned", fn(m, "listBanned", "listbanned"),                { category: "admin", adminOnly: true, aliases: ["globalbannedlist"] })) count++;
    if (safeRegister("clearbans",        fn(m, "clearBans", "clearbans"),                  { category: "admin", adminOnly: true, aliases: ["resetbans"] })) count++;
    if (safeRegister("restart",          fn(m, "restart", "reboot"),                       { category: "admin", adminOnly: true, aliases: ["reboot"] })) count++;
    if (safeRegister("shutdown",         fn(m, "shutdown", "stop"),                        { category: "admin", adminOnly: true, aliases: ["stop", "botoff"] })) count++;
    if (safeRegister("eval",             fn(m, "adminEval", "eval", "exec"),               { category: "admin", adminOnly: true, aliases: ["exec", "code", "run"] })) count++;
  }

  // ── GROUP CORE.JS ─────────────────────────────────────────────────────────
  {
    const m = MODULES.groupCore;
    if (safeRegister("kick",         fn(m, "kick", "remove"),        { category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["remove", "kickmember"] })) count++;
    if (safeRegister("add",          fn(m, "add", "invite"),         { category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["invite", "addmember"] })) count++;
    if (safeRegister("promote",      fn(m, "promote", "makeAdmin"),  { category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["makeadmin"] })) count++;
    if (safeRegister("demote",       fn(m, "demote", "unadmin"),     { category: "group", groupOnly: true, requireGroupAdmin: true, requireBotAdmin: true, aliases: ["unadmin"] })) count++;
    if (safeRegister("admins",       fn(m, "admins", "listAdmins"),  { category: "group", groupOnly: true, aliases: ["listadmins", "adminlist"] })) count++;
    if (safeRegister("tagall",       fn(m, "tagall", "everyone"),    { category: "group", groupOnly: true, aliases: ["everyone", "all", "mentionall"] })) count++;
    if (safeRegister("hidetag",      fn(m, "hidetag", "htag"),       { category: "group", groupOnly: true, aliases: ["htag", "silent"] })) count++;
    if (safeRegister("testadmin",    fn(m, "testAdmin", "testadmin"),{ category: "group", groupOnly: true, aliases: ["admintest", "checkadmin"] })) count++;
    if (safeRegister("refreshadmin", fn(m, "refreshAdmin", "refreshadmin"), { category: "group", groupOnly: true, aliases: ["refresh", "clearcache"] })) count++;
  }

  // ── GROUP MODERATION.JS ───────────────────────────────────────────────────
  {
    const m = MODULES.groupMod;
    if (safeRegister("warn",      fn(m, "warn"),                     { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["warning"] })) count++;
    if (safeRegister("warnings",  fn(m, "warnings"),                 { category: "group", groupOnly: true, aliases: ["warnlist", "mywarnings"] })) count++;
    if (safeRegister("clearwarns",fn(m, "clearWarns", "clearwarns"), { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["resetwarns"] })) count++;
    if (safeRegister("ban",       fn(m, "ban"),                      { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["block", "banuser"] })) count++;
    if (safeRegister("unban",     fn(m, "unban"),                    { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unblock"] })) count++;
    if (safeRegister("listbanned",fn(m, "listBanned", "listbanned"), { category: "group", groupOnly: true, aliases: ["bannedlist"] })) count++;
  }

  // ── GROUP SETTINGS.JS ─────────────────────────────────────────────────────
  {
    const m = MODULES.groupSettings;
    if (safeRegister("mute",          fn(m, "mute"),                         { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["lockgroup", "muteall"] })) count++;
    if (safeRegister("unmute",        fn(m, "unmute"),                       { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unlockgroup"] })) count++;
    if (safeRegister("lock",          fn(m, "lock"),                         { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["lockinfo"] })) count++;
    if (safeRegister("unlock",        fn(m, "unlock"),                       { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unlockinfo"] })) count++;
    if (safeRegister("antispam",      fn(m, "antiSpam", "antispam"),         { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["nospam"] })) count++;
    if (safeRegister("welcome",       fn(m, "welcomeToggle", "welcome"),     { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["togglewelcome"] })) count++;
    if (safeRegister("setwelcome",    fn(m, "setWelcome", "setwelcome"),     { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setwelcomemsg"] })) count++;
    if (safeRegister("goodbye",       fn(m, "goodbyeToggle", "goodbye"),     { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["togglegoodbye"] })) count++;
    if (safeRegister("setgoodbye",    fn(m, "setGoodbye", "setgoodbye"),     { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setgoodbyemsg"] })) count++;
    if (safeRegister("groupinfo",     fn(m, "groupInfo", "groupinfo"),       { category: "group", groupOnly: true, aliases: ["ginfo", "grouppanel"] })) count++;
    if (safeRegister("rules",         fn(m, "rules"),                        { category: "group", groupOnly: true, aliases: ["grules", "grouprules"] })) count++;
    if (safeRegister("setrules",      fn(m, "setRules", "setrules"),         { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["setgrules"] })) count++;
    if (safeRegister("link",          fn(m, "link"),                         { category: "group", groupOnly: true, aliases: ["grouplink", "invitelink"] })) count++;
    if (safeRegister("revoke",        fn(m, "revoke"),                       { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["revokelink", "resetlink"] })) count++;
    if (safeRegister("pin",           fn(m, "pin"),                          { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["pinmsg"] })) count++;
    if (safeRegister("unpin",         fn(m, "unpin"),                        { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unpinmsg"] })) count++;
    if (safeRegister("delete",        fn(m, "deleteMsg", "delete"),          { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["delmsg"] })) count++;
    if (safeRegister("settings",      fn(m, "settingsOverview", "settings"), { category: "group", groupOnly: true, aliases: ["groupsettings"] })) count++;
    if (safeRegister("resetsettings", fn(m, "resetSettings", "resetsettings"), { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["resetgroupsettings"] })) count++;
    if (safeRegister("leave",         fn(m, "leave"),                        { category: "group", groupOnly: true, adminOnly: true, aliases: ["botleave", "exit"] })) count++;
    if (safeRegister("groupdebug",    fn(m, "debug"),                        { category: "group", groupOnly: true, aliases: ["gdebug"] })) count++;
    if (safeRegister("participants",  fn(m, "showParticipants", "participants"), { category: "group", groupOnly: true, aliases: ["members", "memberlist"] })) count++;
  }

  // ── ENCRYPTION.JS ─────────────────────────────────────────────────────────
  {
    const m = MODULES.encryption;
    if (safeRegister("encrypt",  fn(m, "encrypt"),                                { category: "security", aliases: ["enc"] })) count++;
    if (safeRegister("decrypt",  fn(m, "decrypt"),                                { category: "security", aliases: ["dec"] })) count++;
    if (safeRegister("hash",     fn(m, "hash"),                                   { category: "security", aliases: ["md5", "sha256"] })) count++;
    if (safeRegister("password", fn(m, "password", "genPass", "passwordGen"),     { category: "security", aliases: ["genpass", "passgen"] })) count++;
  }

  // ── NOTES.JS ──────────────────────────────────────────────────────────────
  {
    const m = MODULES.notes;
    if (safeRegister("note",    fn(m, "note", "saveNote"),                           { category: "storage", aliases: ["savenote", "remember"] })) count++;
    if (safeRegister("getnote", fn(m, "getnote", "getNote", "recall"),               { category: "storage", aliases: ["recall", "readnote"] })) count++;
    if (safeRegister("notes",   fn(m, "notes", "listNotes", "mynotes"),              { category: "storage", aliases: ["mynotes", "listnotes"] })) count++;
    if (safeRegister("delnote", fn(m, "deleteKey", "delnote", "deleteNote", "forget"), { category: "storage", aliases: ["forget", "deletenote"] })) count++;
  }

  // ── REMINDER.JS ───────────────────────────────────────────────────────────
  {
    const m = MODULES.reminder;
    if (safeRegister("remind",         fn(m, "reminder", "remind", "setReminder"),  { category: "storage", aliases: ["reminder", "setreminder"] })) count++;
    if (safeRegister("reminders",      fn(m, "listReminders", "reminders"),         { category: "storage", aliases: ["myreminders"] })) count++;
    if (safeRegister("cancelreminder", fn(m, "cancelReminder", "cancelreminder"),   { category: "storage", aliases: ["delreminder"] })) count++;
    if (safeRegister("snooze",         fn(m, "snooze"),                             { category: "storage", aliases: ["snoozereminder"] })) count++;
  }

  // ── TRANSLATION.JS ────────────────────────────────────────────────────────
  {
    const m = MODULES.translation;
    if (safeRegister("translate", fn(m, "translate"), { category: "tools", aliases: ["tr", "tl"] })) count++;
    if (safeRegister("detect",    fn(m, "detect"),    { category: "tools", aliases: ["langdetect"] })) count++;
    if (safeRegister("languages", fn(m, "languages"), { category: "tools", aliases: ["langs"] })) count++;
  }

  // ── UNIT CONVERTER.JS ─────────────────────────────────────────────────────
  {
    const m = MODULES.unitConverter;
    if (safeRegister("convert", fn(m, "convert"), { category: "tools", aliases: ["conv", "cvt"] })) count++;
    if (safeRegister("units",   fn(m, "units"),   { category: "tools", aliases: ["listunits"] })) count++;
  }

  // ── SECURITY.JS ───────────────────────────────────────────────────────────
  {
    const m = MODULES.security;
    if (safeRegister("scan", fn(m, "scan", "urlScan", "scanUrl"), { category: "security", aliases: ["urlscan", "checksafe"] })) count++;
  }

  // ── STOCKS.JS ─────────────────────────────────────────────────────────────
  {
    const m = MODULES.stocks;
    if (safeRegister("stock", fn(m, "stock", "stocks"), { category: "info", aliases: ["stocks", "share"] })) count++;
  }

  // ── NEWS.JS ───────────────────────────────────────────────────────────────
  {
    const m = MODULES.news;
    if (safeRegister("news", fn(m, "news", "getNews"), { category: "info", aliases: ["latestnews", "headlines"] })) count++;
  }

  // ── MOVIES.JS ─────────────────────────────────────────────────────────────
  {
    const m = MODULES.movies;
    if (safeRegister("movie",  fn(m, "movie", "movies"), { category: "info", aliases: ["movies", "film"] })) count++;
    if (safeRegister("series", fn(m, "series", "tvshow"),{ category: "info", aliases: ["tvshow"] })) count++;
  }

  // ── CRYPTO.JS ─────────────────────────────────────────────────────────────
  {
    const m = MODULES.crypto;
    if (safeRegister("crypto", fn(m, "crypto", "getCrypto", "coin"), { category: "info", aliases: ["coin", "cryptoprice"] })) count++;
  }

  // ── AUTOMATION.JS ─────────────────────────────────────────────────────────
  {
    const m = MODULES.automation;
    if (safeRegister("autoreply",   fn(m, "autoReply", "autoreply"),     { category: "automation" })) count++;
    if (safeRegister("autosticker", fn(m, "autoSticker", "autosticker"), { category: "automation" })) count++;
  }

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  cmdLog.div();
  cmdLog.success(`✅ Registered ${count} commands | Primary: ${primaryCommands.size} | With aliases: ${commands.size}`);

  const critical = ["menu", "ping", "ok", "start", "status", "tts", "joke", "quote", "play", "img", "gif"];
  const missing  = critical.filter((c) => !commands.has(c));
  if (missing.length > 0) {
    cmdLog.err(`❌ Missing critical commands: ${missing.join(", ")}`);
  } else {
    cmdLog.success(`✅ All critical commands present: ${critical.join(", ")}`);
  }

  console.log();
}

registerAllCommands();

// ============================================================================
//  BOT-OWNER IS GROUP ADMIN — ENFORCEMENT
// ============================================================================
async function resolveEffectiveBotAdmin(sock, groupJid, ownerPhone) {
  const ownerJid = ownerPhone ? `${normalizePhone(ownerPhone)}@s.whatsapp.net` : null;
  let isAdminResult = await isBotGroupAdmin(sock, groupJid, ownerJid);
  if (!isAdminResult) {
    isAdminResult = await isBotGroupAdmin(sock, groupJid, ownerJid, true);
  }
  return isAdminResult;
}

// ============================================================================
//  ACTIVATION EXEMPT COMMANDS
// ============================================================================
const ACTIVATION_EXEMPT = new Set([
  "activate", "deactivate",
  "testadmin", "refreshadmin", "admintest", "checkadmin", "refresh", "clearcache",
  "groupdebug", "gdebug", "groupdbg",
  "menu", "help", "ping", "status", "start", "init", "begin", "connectdm", "dmopen",
  "ok", "dm", "tome", "senddm", "push", "privatemedia", "savetodm", "sendtome",
]);

// ============================================================================
//  MAIN COMMAND HANDLER
// ============================================================================
export async function handleCommand(message, sock) {
  const executionId = Math.random().toString(36).substring(2, 8);

  try {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const fromMe  = !!message.key.fromMe;

    const session     = message._session    || null;
    const ownerPhone  = session?.ownerPhone || ENV.ADMIN || ENV.OWNER_PHONE || "";
    const sessionMode = session?.mode       || ENV.BOT_MODE || "public";
    const sessionId   = session?.id         || "";

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
    const userJid    = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSenderJid;
    if (!userJid || !cleanPhone) return;

    const isAdminUser      = fromMe || isAdmin(userJid, ownerPhone);
    const isAuthorizedUser = isAdminUser || isAuthorized(userJid, ownerPhone, sessionMode);

    const m = message.message || {};
    const msgText =
      m.conversation               ||
      m.extendedTextMessage?.text  ||
      m.imageMessage?.caption      ||
      m.videoMessage?.caption      ||
      m.documentMessage?.caption   || "";

    if (!msgText?.trim()) return;
    const trimmed = msgText.trim();

    // Trivia handler
    if (!trimmed.startsWith(ENV.PREFIX)) {
      if (global.activeTrivia instanceof Map && global.activeTrivia.has(from)) {
        const upper = trimmed.toUpperCase();
        if (["A", "B", "C", "D"].includes(upper)) {
          if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) return;
          if (sessionMode === "private" && !isAdminUser) return;
          if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) return;
          try {
            const g = MODULES.games;
            if (typeof g?.handleTriviaAnswer === "function") {
              await g.handleTriviaAnswer(message, from, sock);
            }
          } catch (_) {}
        }
      }
      return;
    }

    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const parts       = body.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    if (!commandName) return;

    const rawArgs = parts.slice(1);
    const fullArgs = rawArgs.join(" ");
    const args     = rawArgs.map(sanitizeInput);

    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) return;

    if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
      if (!ACTIVATION_EXEMPT.has(commandName)) return;
    }

    if (sessionMode === "private" && !isAdminUser) return;

    const commandMeta = commands.get(commandName);

    if (!commandMeta) {
      const similar   = findSimilarCommands(commandName, 2);
      let suggestion  = "";
      if (similar.length > 0) {
        suggestion = `\n\nDid you mean: *${ENV.PREFIX}${similar[0]}*?`;
        if (similar.length > 1)
          suggestion += `\nOr: ${similar.slice(1, 3).map((c) => `*${ENV.PREFIX}${c}*`).join(", ")}`;
      }
      await sock.sendMessage(from, {
        text: `❓ *Unknown Command:* ${ENV.PREFIX}${commandName}${suggestion}\n\nType *${ENV.PREFIX}menu* to see all commands!`,
      });
      return;
    }

    const handlerFunction = commandMeta.handler;
    const primaryName     = commandMeta.isAlias ? commandMeta.primaryName : (commandMeta.primaryName || commandName);

    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[primaryName] = (commandUsage.get(userJid)[primaryName] || 0) + 1;

    const stats = commandStats.get(primaryName) || { uses: 0, errors: 0, lastUsed: null, avgResponseTime: 0, totalResponseTime: 0 };
    stats.uses++;
    stats.lastUsed = Date.now();
    commandStats.set(primaryName, stats);
    if (session) session.commandCount = (session.commandCount || 0) + 1;

    if (!isAdminUser && !rateLimiter.isAllowed(userJid)) {
      const seconds = Math.ceil(rateLimiter.remaining(userJid) / 1000);
      const msgs = [`⏳ *Slow down!* Wait *${seconds}s*.`, `🧘 *Take a breath!* Wait ${seconds}s.`, `⚡ *Rate limited!* Try again in ${seconds}s.`];
      return sock.sendMessage(from, { text: msgs[Math.floor(Math.random() * msgs.length)] });
    }

    if (!isAdminUser && commandCooldown.isOnCooldown(userJid, primaryName)) {
      const seconds = Math.ceil(commandCooldown.getRemaining(userJid, primaryName) / 1000);
      return sock.sendMessage(from, { text: `⏳ *Cooldown!* Wait *${seconds}s* before using *${ENV.PREFIX}${primaryName}* again.` });
    }

    if (commandMeta.adminOnly && !isAdminUser) {
      return sock.sendMessage(from, { text: `⛔ *${ENV.PREFIX}${commandName}* is for the *bot owner* only.` });
    }

    if (commandMeta.groupOnly && !isGroup) {
      return sock.sendMessage(from, { text: `👥 *${ENV.PREFIX}${commandName}* only works inside a group.` });
    }

    if (commandMeta.requireGroupAdmin && isGroup) {
      const permission = await hasGroupAdminPermission(sock, message, session);
      if (!permission.allowed) return sock.sendMessage(from, { text: permission.reason });
    }

    if (commandMeta.requireBotAdmin && isGroup) {
      const botIsAdmin = await resolveEffectiveBotAdmin(sock, from, ownerPhone);
      if (!botIsAdmin) {
        return sock.sendMessage(from, {
          text: `⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to use *${ENV.PREFIX}${commandName}*.\n\n📌 *How to fix:*\n1. Make me a group admin, OR\n2. Make the bot owner a group admin\n3. Run *${ENV.PREFIX}refreshadmin*`,
        });
      }
    }

    commandCooldown.setCooldown(userJid, primaryName);
    cmdLog.cmd(`[${executionId}] ${ENV.PREFIX}${commandName} → ${primaryName} | ${cleanPhone}${isGroup ? " [G]" : ""}`);

    const setMode = async (newMode) => {
      if (session && typeof session === "object") session.mode = newMode;
    };

    const context = {
      args, fullArgs, message, from,
      groupJid: isGroup ? from : null,
      userJid, cleanPhone, isGroup, isDM: !isGroup, fromMe, sock,
      isAdmin: isAdminUser,
      isAuthorized: isAuthorizedUser,
      commandName: primaryName,
      invokedAs: commandName,
      prefix: ENV.PREFIX,
      session, sessionId, sessionMode, ownerPhone, ENV, setMode,
    };

    const handlerStart = Date.now();

    try {
      await Promise.race([
        handlerFunction(context),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Command timeout (60s)")), 60_000)),
      ]);

      const ms = Date.now() - handlerStart;
      stats.totalResponseTime += ms;
      stats.avgResponseTime = stats.totalResponseTime / stats.uses;
      commandStats.set(primaryName, stats);
      cmdLog.success(`[${executionId}] ${primaryName} OK (${ms}ms)`);
    } catch (cmdError) {
      stats.errors++;
      commandStats.set(primaryName, stats);
      cmdLog.err(`[${executionId}] ${primaryName} error: ${cmdError.message}`);
      const errMsg = cmdError.message?.length > 100 ? "❌ An error occurred while executing the command." : `❌ *Error:* ${sanitizeInput(cmdError.message)}`;
      try { await sock.sendMessage(from, { text: errMsg }); } catch (_) {}
    }
  } catch (fatalError) {
    cmdLog.err(`[${executionId}] FATAL: ${fatalError.message}`);
    try {
      await sock?.sendMessage(message?.key?.remoteJid, { text: "❌ A system error occurred. Please try again." });
    } catch (_) {}
  }
}

// ============================================================================
//  UTILITY FUNCTIONS
// ============================================================================
function findSimilarCommands(input, maxDistance = 2, limit = 3) {
  const inputLower = input.toLowerCase();
  return Array.from(primaryCommands.keys())
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
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================================
//  EXPORTS
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

export function getAllStats() {
  let totalUses = 0, totalErrors = 0;
  for (const s of commandStats.values()) {
    totalUses += s.uses;
    totalErrors += s.errors;
  }
  return {
    totalCommands: primaryCommands.size,
    totalAliases: commands.size - primaryCommands.size,
    totalEntries: commands.size,
    totalUses, totalErrors,
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
  for (const key of Object.keys(MODULES)) delete MODULES[key];
  await loadAllModules();
  registerAllCommands();
  cmdLog.success("✅ Commands reloaded");
}

export function shutdown() {
  rateLimiter.stopCleanup();
  cmdLog.success("Command handler shutdown complete");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { commandCooldown, MODULES as modules, rateLimiter };
