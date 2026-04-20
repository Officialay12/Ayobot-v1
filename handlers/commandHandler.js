// handlers/commandHandler.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLER — DEFINITIVE PRODUCTION VERSION
//  Author: AYOCODES
//
//  ALL ROOT CAUSES FIXED:
//
//  1. ALLOWED_COMMANDS TDZ BUG (why every command said "Unknown"):
//     ESM `const` sits in Temporal Dead Zone until its line is evaluated.
//     registerAllCommands() was called BEFORE the `const ALLOWED_COMMANDS`
//     declaration, so rebuildAllowedCommands() always found an uninitialized
//     binding — the Set was NEVER filled. Fixed: `let ALLOWED_COMMANDS = new
//     Set()` declared at module top, BEFORE any function that touches it.
//
//  2. OWNER RECOGNITION IN GROUPS (why ".deactivate is for bot owner only"):
//     Baileys sets `message.key.fromMe = false` when the account owner sends
//     a message in a GROUP chat — only DMs from self have fromMe=true in most
//     multi-device setups. So the old `if (fromMe) return true` missed the
//     owner completely in groups.
//     Fixed: resolveIsOwner() now ALSO does a direct phone comparison between
//     cleanPhone (sender's digits) and ownerPhone (session.ownerPhone), which
//     works in both DM and group context regardless of fromMe.
//
//  3. activate/deactivate WRONGLY registered from basic.js:
//     These commands live in basic.js only if that file exports them. If
//     basic.js doesn't export `activate`/`deactivate`, fn(b,"activate") → null
//     → safeRegister rejects a null handler → commands never registered →
//     "Unknown Command". Fixed: activate/deactivate are registered with a
//     built-in inline handler that delegates to basic.js OR falls back to a
//     sensible default, ensuring they always register.
//
//  4. Per-module import timeout (10 s) — prevents one broken feature module
//     from stalling the entire bot startup.
//
//  5. No retry wrapper around command dispatch — commands run exactly once.
//     context.apiRetry() is available for handlers that call external APIs.
//
//  6. fullArgs is sanitized before handlers receive it.
//
//  7. Levenshtein suggestion cache runs on primaryCommands only.
// ════════════════════════════════════════════════════════════════════════════

import {
  bannedUsers,
  commandUsage,
  ENV,
  isAdmin,
  isAuthorized,
  isGroupActivated,
  activateGroup,
  deactivateGroup,
  hasGroupAdminPermission,
  refreshAdminStatus,
  isBotGroupAdmin,
  clearAdminCache,
  normalizePhone,
  delay,
  sendMsg,
  log,
} from "../index.js";

import fs from "fs";

// ============================================================================
//  COLOR LOGGER
// ============================================================================
const C = {
  reset:   "\x1b[0m",
  bright:  "\x1b[1m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  gray:    "\x1b[90m",
  dim:     "\x1b[2m",
};

const cmdLog = {
  ok:      (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err:     (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn:    (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info:    (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  cmd:     (m) => console.log(`${C.magenta}⚡${C.reset} ${m}`),
  debug:   (m) => !!ENV.DEBUG && console.log(`${C.gray}🔍${C.reset} ${m}`),
  success: (m) => console.log(`${C.green}✓${C.reset}  ${m}`),
  title:   (m) => console.log(`\n${C.blue}${C.bright}${m}${C.reset}\n`),
  div:     ()  => console.log(`${C.cyan}${"─".repeat(60)}${C.reset}`),
};

// ============================================================================
//  ENV VALIDATION
// ============================================================================
if (!ENV.PREFIX) {
  cmdLog.warn("PREFIX not set, using default: .");
  ENV.PREFIX = ".";
}

const OWNER_PHONE = ENV.ADMIN || ENV.OWNER_PHONE || ENV.OWNER_NUMBER || "";
if (!OWNER_PHONE) {
  cmdLog.warn("⚠️ No owner phone configured! Set ADMIN or OWNER_PHONE in .env");
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
    this.timer  = null;
  }

  startCleanup() {
    this.timer = setInterval(() => this._cleanup(), 60_000);
  }

  stopCleanup() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  isAllowed(id, cmd = null) {
    const now  = Date.now();
    const key  = cmd ? `${id}:${cmd}` : id;
    const hits = (this.map.get(key) || []).filter((t) => now - t < this.window);
    if (hits.length >= this.max) return false;
    hits.push(now);
    this.map.set(key, hits);
    return true;
  }

  _cleanup() {
    const now = Date.now();
    for (const [k, times] of this.map) {
      const fresh = times.filter((t) => now - t < this.window);
      if (!fresh.length) this.map.delete(k);
      else this.map.set(k, fresh);
    }
  }
}

const rateLimiter = new RateLimiter(
  parseInt(ENV.RATE_LIMIT_MAX)    || 15,
  parseInt(ENV.RATE_LIMIT_WINDOW) || 60_000,
);
rateLimiter.startCleanup();

// ============================================================================
//  COMMAND COOLDOWN
// ============================================================================
class CommandCooldown {
  constructor() {
    this.map      = new Map();
    this.defaults = new Map([
      ["play",      10_000],
      ["youtube",   10_000],
      ["download",   8_000],
      ["search",     5_000],
      ["broadcast", 30_000],
      ["globalbc",  60_000],
    ]);
    this.base = 3_000;
  }

  cooldownMs(cmd) { return this.defaults.get(cmd) || this.base; }

  isOnCooldown(uid, cmd) {
    const exp = this.map.get(`${uid}:${cmd}`);
    return exp ? Date.now() < exp : false;
  }

  set(uid, cmd) {
    const key = `${uid}:${cmd}`;
    const exp = Date.now() + this.cooldownMs(cmd);
    this.map.set(key, exp);
    setTimeout(() => { if (this.map.get(key) === exp) this.map.delete(key); }, this.cooldownMs(cmd));
  }
}

const cooldown = new CommandCooldown();

// ============================================================================
//  TRIVIA GLOBAL STATE
// ============================================================================
if (!global.activeTrivia) global.activeTrivia = new Map();

// ============================================================================
//  METRICS
// ============================================================================
const metrics = { totalCommands: 0, errors: 0, avgResponseTime: 0 };

// ============================================================================
//  HELPERS
// ============================================================================

/** Strip everything except digits from a JID/phone */
function normalizeJid(jid = "") {
  if (!jid || typeof jid !== "string") return "";
  return String(jid).split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

/** Sanitize a single arg string */
function sanitizeInput(input) {
  if (!input || typeof input !== "string") return "";
  return input.slice(0, 2000).replace(/[<>"'&]/g, "").trim();
}

/**
 * apiRetry — call this inside feature handlers when hitting external APIs.
 * Commands themselves are dispatched exactly once (no retry at handler level).
 */
export async function apiRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries - 1) throw err;
      await delay(Math.pow(2, i) * 1000);
    }
  }
}

/** Light periodic commandUsage map cleanup */
function cleanupOldData() {
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const now     = Date.now();
  for (const [user, cmds] of commandUsage) {
    for (const [cmd, data] of Object.entries(cmds)) {
      if (now - (data.timestamp || 0) > MAX_AGE) delete cmds[cmd];
    }
    if (!Object.keys(cmds).length) commandUsage.delete(user);
  }
}
setInterval(cleanupOldData, 60 * 60 * 1000);

// ============================================================================
//  MODULE LOADER  — 10 s per-module timeout so a broken feature can't
//  stall the entire bot startup
// ============================================================================
const MODULES = {};

function _normExportKey(name) {
  return typeof name === "string" ? name.toLowerCase() : "";
}

/**
 * Resolve a function from a loaded module by trying multiple export key names.
 * Checks both the module top-level and mod.default (object or function).
 */
function getFunctionFromModule(mod, ...keys) {
  if (!mod || typeof mod !== "object") return null;

  const tryIn = (target) => {
    if (!target || typeof target !== "object") return null;
    for (const key of keys) {
      const lk = _normExportKey(key);
      if (typeof target[key] === "function") return target[key];
      for (const [ek, ev] of Object.entries(target)) {
        if (typeof ev === "function" && _normExportKey(ek) === lk) return ev;
      }
    }
    return null;
  };

  return tryIn(mod) || tryIn(mod.default);
}

async function safeImport(moduleName, specifier) {
  try {
    const mod = await Promise.race([
      import(specifier),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("import timeout (10 s)")), 10_000),
      ),
    ]);

    const merged = {};
    // Named exports first
    for (const [k, v] of Object.entries(mod)) {
      if (k === "default") continue;
      if (typeof v === "function") merged[k] = v;
    }
    // default export (object or function)
    if (mod.default && typeof mod.default === "object") {
      for (const [k, v] of Object.entries(mod.default)) {
        if (typeof v === "function" && !merged[k]) merged[k] = v;
      }
    }
    if (typeof mod.default === "function") merged.default = mod.default;

    const count = Object.keys(merged).length;
    if (count === 0) cmdLog.warn(`${moduleName.padEnd(16)} ➜ loaded but 0 functions`);
    else             cmdLog.ok(`${moduleName.padEnd(16)} ➜ ${count} functions`);

    return { ...merged, __raw: mod };
  } catch (err) {
    cmdLog.err(`${moduleName.padEnd(16)} ➜ FAILED: ${err.message}`);
    return {};
  }
}

async function loadAllModules() {
  cmdLog.title("📦 LOADING COMMAND MODULES");
  cmdLog.div();

  const map = {
    basic:         "../commands/group/basic.js",
    admin:         "../commands/group/admin.js",
    viewonce:      "../commands/group/viewonce.js",
    groupCore:     "../commands/group/core.js",
    groupMod:      "../commands/group/moderation.js",
    groupSettings: "../commands/group/settings.js",
    automation:    "../commands/group/automation.js",
    downloader:    "../features/downloader.js",
    ai:            "../features/ai.js",
    calculator:    "../features/calculator.js",
    crypto:        "../features/crypto.js",
    dictionary:    "../features/dictionary.js",
    encryption:    "../features/encryption.js",
    games:         "../features/games.js",
    imageTools:    "../features/imageTools.js",
    jokes:         "../features/jokes.js",
    movies:        "../features/movies.js",
    music:         "../features/music.js",
    news:          "../features/news.js",
    notes:         "../features/notes.js",
    quotes:        "../features/quotes.js",
    reminder:      "../features/reminder.js",
    security:      "../features/security.js",
    stocks:        "../features/stocks.js",
    translation:   "../features/translation.js",
    tts:           "../features/tts.js",
    unitConverter: "../features/unitConverter.js",
  };

  for (const [name, spec] of Object.entries(map)) {
    MODULES[name] = await safeImport(name, spec);
  }

  const loaded = Object.values(MODULES).filter(
    (m) => Object.keys(m).some((k) => k !== "__raw" && typeof m[k] === "function"),
  ).length;

  cmdLog.div();
  cmdLog.success(`✅ Loaded ${loaded}/${Object.keys(map).length} modules`);
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

// ============================================================================
//  FIX 1 — ALLOWED_COMMANDS
//  Declared with `let` and initialized to an EMPTY Set() right here, BEFORE
//  any function that references it is called. This avoids the ESM Temporal
//  Dead Zone that caused every single command to return "Unknown Command".
// ============================================================================
let ALLOWED_COMMANDS = new Set();

function rebuildAllowedCommands() {
  ALLOWED_COMMANDS = new Set();
  for (const k of commands.keys()) ALLOWED_COMMANDS.add(k);
  cmdLog.success(`✅ ALLOWED_COMMANDS: ${ALLOWED_COMMANDS.size} entries`);
}

// ============================================================================
//  COMMAND META
// ============================================================================
class CommandMeta {
  constructor(primaryName, handler, opts = {}) {
    this.primaryName       = primaryName.toLowerCase();
    this.handler           = handler;
    this.category          = opts.category          || "general";
    this.description       = opts.description       || "";
    this.adminOnly         = opts.adminOnly         === true;
    this.groupOnly         = opts.groupOnly         === true;
    this.requireGroupAdmin = opts.requireGroupAdmin === true;
    this.requireBotAdmin   = opts.requireBotAdmin   === true;
    this.aliases           = (opts.aliases || []).map((a) => a.toLowerCase());
  }
}

export function registerCommand(primaryName, handler, opts = {}) {
  if (typeof handler !== "function") {
    cmdLog.err(`Cannot register "${primaryName}": handler is not a function`);
    return false;
  }
  const name    = primaryName.toLowerCase();
  const aliases = (opts.aliases || []).map((a) => a.toLowerCase());
  const meta    = new CommandMeta(name, handler, opts);

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

export function safeRegister(primaryName, handler, opts = {}) {
  if (typeof handler !== "function") return false;
  try { return registerCommand(primaryName, handler, opts); }
  catch (err) { cmdLog.err(`safeRegister("${primaryName}"): ${err.message}`); return false; }
}

/** Shorthand: resolve a function from a module by multiple candidate keys */
function fn(mod, ...keys) { return getFunctionFromModule(mod, ...keys); }

// ============================================================================
//  FIX 3 — BUILT-IN ACTIVATE / DEACTIVATE HANDLERS
//
//  These commands were registered from basic.js, but basic.js may not export
//  them. If fn(b,"activate") returns null, safeRegister silently skips them,
//  leaving ".activate" → "Unknown Command". The fix: always register a
//  built-in handler that either delegates to basic.js (if it exports the
//  function) or handles the logic directly using the index.js primitives.
// ============================================================================
function makeActivateHandler(action) {
  return async (ctx) => {
    const { from, sock, isAdmin: isOwner, session, sessionId } = ctx;

    if (!isOwner) {
      return sock.sendMessage(from, {
        text: `⛔ Only the *bot owner* can ${action} the bot in this group.`,
      });
    }

    const sid = sessionId || session?.id || "";

    if (action === "activate") {
      activateGroup(sid, from);
      return sock.sendMessage(from, {
        text: `✅ *AYOBOT Activated!*\n\nBot is now active in this group.\nType *${ENV.PREFIX}menu* to see all commands.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      });
    } else {
      deactivateGroup(sid, from);
      return sock.sendMessage(from, {
        text: `🔕 *AYOBOT Deactivated!*\n\nBot will no longer respond in this group.\nUse *${ENV.PREFIX}activate* to reactivate.\n\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_`,
      });
    }
  };
}

// ============================================================================
//  REGISTER ALL COMMANDS
//  rebuildAllowedCommands() is called at the VERY END, after every command
//  has been inserted into the `commands` Map.
// ============================================================================
export function registerAllCommands() {
  cmdLog.title("📝 REGISTERING ALL COMMANDS");
  cmdLog.div();

  let count = 0;
  const b   = MODULES.basic;

  /** Register a command from basic.js; warn + skip if export missing */
  const rb = (name, key, opts) => {
    const f = fn(b, key, name);
    if (!f) { cmdLog.warn(`basic.js missing "${key}" — skipping .${name}`); return; }
    if (safeRegister(name, f, opts)) count++;
  };

  // ── Core ──────────────────────────────────────────────────────────────────
  rb("menu",       "menu",        { category:"core",    aliases:["help","commands","h","cmd","cmds"] });
  rb("ping",       "ping",        { category:"core",    aliases:["pong","latency","ms","alive"] });
  rb("status",     "status",      { category:"core",    aliases:["me","whoami","myinfo"] });
  rb("creator",    "creator",     { category:"core",    aliases:["dev","owner","author","ayo"] });
  rb("github",     "creatorGit",  { category:"core",    aliases:["git","repo","source"] });
  rb("auto",       "auto",        { category:"core",    aliases:["autoreply","toggleauto"] });
  rb("connect",    "connectInfo", { category:"core",    aliases:["community","links"] });
  rb("prefix",     "prefixinfo",  { category:"core",    aliases:["preinfo","getprefix"] });
  rb("test",       "test",        { category:"debug",   aliases:["hello","hi","testbot"] });
  rb("start",      "start",       { category:"core",    aliases:["open","init","begin","connectdm","dmopen"] });

  // ── Info ──────────────────────────────────────────────────────────────────
  rb("time",       "time",        { category:"info",    aliases:["worldtime","timezone","clock"] });
  rb("weather",    "weather",     { category:"info",    aliases:["w","forecast","temp"] });

  // ── Web ───────────────────────────────────────────────────────────────────
  rb("ip",         "ip",          { category:"web",     aliases:["getip","iplookup","ipinfo"] });
  rb("myip",       "myip",        { category:"web",     aliases:["myipaddr","publicip","whatismyip"] });
  rb("whois",      "whois",       { category:"web",     aliases:["domain","domaininfo"] });
  rb("dns",        "dns",         { category:"web",     aliases:["dnslookup","nslookup","dig"] });
  rb("url",        "url",         { category:"web",     aliases:["urlinfo","urlcheck"] });
  rb("fetch",      "fetch",       { category:"web",     aliases:["geturl","curl","httpget"] });
  rb("scrape",     "scrape",      { category:"web",     aliases:["scraper","webscrape"] });
  rb("screenshot", "screenshot",  { category:"web",     aliases:["ss","capture","snap"] });
  rb("inspect",    "inspect",     { category:"web",     aliases:["pageinspect","analyze"] });
  rb("shorten",    "shorten",     { category:"web",     aliases:["short","tinyurl","bitly"] });

  // ── Media / Profile ───────────────────────────────────────────────────────
  rb("vv",         "viewOnce",    { category:"media",   aliases:["viewonce","reveal"] });
  rb("qr",         "qencode",     { category:"tools",   aliases:["qrcode","makeqr"] });
  rb("pdf",        "pdf",         { category:"tools",   aliases:["makepdf","createpdf"] });
  rb("getpp",      "getpp",       { category:"profile", aliases:["pp","profilepic","pfp"] });
  rb("getgpp",     "getgpp",      { category:"profile", groupOnly:true, aliases:["gpp","grouppic"] });
  rb("jarvis",     "jarvis",      { category:"ai",      aliases:["j"] });
  rb("waitlist",   "joinWaitlist",{ category:"misc",    aliases:["joinwait"] });
  rb("imgbb",      "imgbb",       { category:"media",   aliases:["upload","imageupload"] });

  // ── FIX 3: activate/deactivate — guaranteed registration via built-in
  //    handler; attempts to delegate to basic.js first, falls back to inline.
  {
    const activateFn   = fn(b, "activate")   || makeActivateHandler("activate");
    const deactivateFn = fn(b, "deactivate") || makeActivateHandler("deactivate");

    if (safeRegister("activate",   activateFn,   { category:"group", groupOnly:true })) count++;
    if (safeRegister("deactivate", deactivateFn, { category:"group", groupOnly:true })) count++;
  }

  rb("antilink",   "antilink",    { category:"group", groupOnly:true, aliases:["nolink","blocklinks"] });

  // ── ok / DM ───────────────────────────────────────────────────────────────
  {
    const okFn = fn(b, "ok", "viewOnceToDM", "dm", "tome");
    if (okFn) {
      if (safeRegister("ok", okFn, {
        category:"media",
        aliases:["dm","tome","senddm","push","privatemedia","savetodm","sendtome"],
      })) { count++; cmdLog.success("✅ .ok registered"); }
    } else {
      cmdLog.warn("⚠️ ok/dm function not found in basic.js");
    }
  }

  // ── TTS ───────────────────────────────────────────────────────────────────
  { const m = MODULES.tts;
    const f = fn(m,"tts","textToSpeech","speak");
    if (safeRegister("tts", f, { category:"media", aliases:["voice","say","speak"] })) count++; }

  // ── Games ─────────────────────────────────────────────────────────────────
  { const m = MODULES.games;
    if (safeRegister("rps",    fn(m,"rps","rockPaperScissors"),        { category:"games", aliases:["rockpaperscissors"] })) count++;
    if (safeRegister("dice",   fn(m,"dice","rollDice"),                 { category:"games", aliases:["roll","rolldice"] })) count++;
    if (safeRegister("flip",   fn(m,"coinFlip","flip"),                 { category:"games", aliases:["coin","coinflip"] })) count++;
    if (safeRegister("trivia", fn(m,"trivia"),                          { category:"games", aliases:["quiz"] })) count++; }

  // ── Fun ───────────────────────────────────────────────────────────────────
  { const m = MODULES.jokes;
    if (safeRegister("joke",   fn(m,"joke","getJoke","randomJoke"),     { category:"fun",   aliases:["laugh","funny"] })) count++;
    if (safeRegister("roast",  fn(m,"roast","burnUser"),                { category:"fun",   aliases:["burn","insult"] })) count++;
    if (safeRegister("pickup", fn(m,"pickupLine","pickupline","pickup"),{ category:"fun",   aliases:["flirt","pickupline"] })) count++; }

  { const m = MODULES.quotes;
    if (safeRegister("quote",  fn(m,"quote","getQuote","randomQuote","motivation"),
      { category:"fun", aliases:["motivation","inspire"] })) count++; }

  // ── Tools ─────────────────────────────────────────────────────────────────
  { const m = MODULES.calculator;
    if (safeRegister("calc",   fn(m,"calculate","calc","calculator"),   { category:"tools", aliases:["math","calculate"] })) count++; }

  { const m = MODULES.dictionary;
    if (safeRegister("dict",   fn(m,"dict","define","dictionary"),      { category:"info",  aliases:["define","meaning","word"] })) count++; }

  // ── Downloader ────────────────────────────────────────────────────────────
  { const m = MODULES.downloader;
    const dlKeys = Object.keys(m).filter((k) => k !== "__raw");
    if (!dlKeys.length) {
      cmdLog.warn("⚠️ downloader module empty — check ../features/downloader.js");
    } else {
      cmdLog.debug(`Downloader exports: ${dlKeys.join(", ")}`);
      if (safeRegister("youtube",   fn(m,"youtube","yt","ytdl","downloadYouTube"),       { category:"dl",    aliases:["yt","ytdl","ytinfo"] })) count++;
      if (safeRegister("tiktok",    fn(m,"tiktok","tt","downloadTikTok"),                { category:"dl",    aliases:["tt","tok","tiktokdl"] })) count++;
      if (safeRegister("spotify",   fn(m,"spotify","sp","downloadSpotify"),              { category:"dl",    aliases:["sp","spotifydl"] })) count++;
      if (safeRegister("instagram", fn(m,"instagram","ig","downloadInstagram"),          { category:"dl",    aliases:["ig","insta","igdl"] })) count++;
      if (safeRegister("facebook",  fn(m,"facebook","fb","downloadFacebook"),            { category:"dl",    aliases:["fb","fbdl"] })) count++;
      if (safeRegister("twitter",   fn(m,"twitter","x","downloadTwitter"),               { category:"dl",    aliases:["x","tweet","xdl"] })) count++;
      if (safeRegister("gif",       fn(m,"gif","giphy","searchGif","searchgif"),         { category:"dl",    aliases:["giphy","tenor","gifsearch"] })) count++;
      if (safeRegister("img",       fn(m,"image","img","searchImage","searchimage"),     { category:"dl",    aliases:["image","imgsearch","pics"] })) count++;
      if (safeRegister("pinterest", fn(m,"pinterest","pin","searchPinterest"),           { category:"dl",    aliases:["pin","pinsearch"] })) count++;
      if (safeRegister("dl",        fn(m,"download","dl","universalDownload"),           { category:"dl",    aliases:["download","get"] })) count++;
      if (safeRegister("play",      fn(m,"play","musicDownload","playMusic"),            { category:"music", aliases:["mp3","song","music"] })) count++;
    }
  }

  // ── Music (fallback + extra) ──────────────────────────────────────────────
  { const m = MODULES.music;
    if (!primaryCommands.has("play")) {
      if (safeRegister("play",      fn(m,"musicDownload","play","playMusic"),    { category:"music", aliases:["mp3","music","song"] })) count++;
    }
    if (safeRegister("lyrics",      fn(m,"musicLyrics","lyrics","getLyrics"),    { category:"music", aliases:["lyric","songlyrics"] })) count++;
    if (safeRegister("trending",    fn(m,"musicTrending","trending","charts"),   { category:"music", aliases:["chart","topsongs"] })) count++;
    if (safeRegister("musicsearch", fn(m,"musicSearch","search","findSong"),     { category:"music", aliases:["songsearch","findmusic"] })) count++; }

  // ── Image Tools ───────────────────────────────────────────────────────────
  { const m = MODULES.imageTools;
    if (safeRegister("sticker",  fn(m,"sticker","makeSticker","createSticker"),  { category:"media", aliases:["s","stk","makesticker"] })) count++;
    if (safeRegister("toimage",  fn(m,"toImage","stickerToImage"),               { category:"media", aliases:["toimg"] })) count++;
    if (safeRegister("tovideo",  fn(m,"toVideo","stickerToVideo"),               { category:"media", aliases:["tovid"] })) count++;
    if (safeRegister("togif",    fn(m,"toGif","makeGif"),                        { category:"media", aliases:["makegif"] })) count++;
    if (safeRegister("toaudio",  fn(m,"toAudio","extractAudio"),                 { category:"media", aliases:["tomp3","extractaudio"] })) count++;
    if (safeRegister("removebg", fn(m,"removeBg","removeBG","rmbg"),             { category:"media", aliases:["nobg","rmbg"] })) count++;
    if (safeRegister("meme",     fn(m,"meme","makeMeme"),                        { category:"media", aliases:["makememe"] })) count++; }

  // ── AI ────────────────────────────────────────────────────────────────────
  { const m = MODULES.ai;
    if (safeRegister("ayobot",    fn(m,"ai","chat","ayobot"),           { category:"ai", aliases:["chat","bae","aichat","askai"] })) count++;
    if (safeRegister("aiclear",   fn(m,"aiClear","clearChat"),          { category:"ai", aliases:["clearchat","resetai"] })) count++;
    if (safeRegister("summarize", fn(m,"summarize","summary"),          { category:"ai", aliases:["summary","tldr"] })) count++;
    if (safeRegister("grammar",   fn(m,"grammar","spellcheck"),         { category:"ai", aliases:["spellcheck","proofread"] })) count++; }

  // ── Bot Admin (owner-only) ────────────────────────────────────────────────
  { const m = MODULES.admin;
    if (safeRegister("mode",             fn(m,"mode","setMode","botMode"),               { category:"admin", adminOnly:true, aliases:["setmode","botmode"] })) count++;
    if (safeRegister("adduser",          fn(m,"addUser","adduser","authorize"),          { category:"admin", adminOnly:true, aliases:["auth","authorize"] })) count++;
    if (safeRegister("removeuser",       fn(m,"removeUser","removeuser","deauthorize"),  { category:"admin", adminOnly:true, aliases:["deauth"] })) count++;
    if (safeRegister("listusers",        fn(m,"listUsers","listusers","users"),          { category:"admin", adminOnly:true, aliases:["users","authlist"] })) count++;
    if (safeRegister("broadcast",        fn(m,"broadcast","bc"),                        { category:"admin", adminOnly:true, aliases:["bc","announce"] })) count++;
    if (safeRegister("globalbc",         fn(m,"globalBroadcast","globalbc","globalBc"), { category:"admin", adminOnly:true, aliases:["gbc"] })) count++;
    if (safeRegister("stats",            fn(m,"stats","botStats","botstats"),            { category:"admin", adminOnly:true, aliases:["botstats","usage"] })) count++;
    if (safeRegister("botstatus",        fn(m,"botStatus","botstatus","fullStatus"),     { category:"admin", adminOnly:true, aliases:["botinfo","fullstatus"] })) count++;
    if (safeRegister("superban",         fn(m,"superBan","superban","globalBan"),        { category:"admin", adminOnly:true, aliases:["globalban","permban"] })) count++;
    if (safeRegister("superunban",       fn(m,"unban","superUnBan","globalUnban"),       { category:"admin", adminOnly:true, aliases:["globalunban"] })) count++;
    if (safeRegister("listglobalbanned", fn(m,"listBanned","listbanned"),                { category:"admin", adminOnly:true, aliases:["globalbannedlist"] })) count++;
    if (safeRegister("clearbans",        fn(m,"clearBans","clearbans"),                  { category:"admin", adminOnly:true, aliases:["resetbans"] })) count++;
    if (safeRegister("restart",          fn(m,"restart","reboot"),                       { category:"admin", adminOnly:true, aliases:["reboot"] })) count++;
    if (safeRegister("shutdown",         fn(m,"shutdown","stop"),                        { category:"admin", adminOnly:true, aliases:["stop","botoff"] })) count++;
    if (safeRegister("eval",             fn(m,"adminEval","eval","exec"),                { category:"admin", adminOnly:true, aliases:["exec","code","run"] })) count++; }

  // ── Group Core ────────────────────────────────────────────────────────────
  { const m = MODULES.groupCore;
    if (safeRegister("kick",         fn(m,"kick","remove"),               { category:"group", groupOnly:true, requireGroupAdmin:true, requireBotAdmin:true, aliases:["remove","kickmember"] })) count++;
    if (safeRegister("add",          fn(m,"add","invite"),                { category:"group", groupOnly:true, requireGroupAdmin:true, requireBotAdmin:true, aliases:["invite","addmember"] })) count++;
    if (safeRegister("promote",      fn(m,"promote","makeAdmin"),         { category:"group", groupOnly:true, requireGroupAdmin:true, requireBotAdmin:true, aliases:["makeadmin"] })) count++;
    if (safeRegister("demote",       fn(m,"demote","unadmin"),            { category:"group", groupOnly:true, requireGroupAdmin:true, requireBotAdmin:true, aliases:["unadmin"] })) count++;
    if (safeRegister("admins",       fn(m,"admins","listAdmins"),         { category:"group", groupOnly:true, aliases:["listadmins","adminlist"] })) count++;
    if (safeRegister("tagall",       fn(m,"tagall","everyone"),           { category:"group", groupOnly:true, aliases:["everyone","all","mentionall"] })) count++;
    if (safeRegister("hidetag",      fn(m,"hidetag","htag"),              { category:"group", groupOnly:true, aliases:["htag","silent"] })) count++;
    if (safeRegister("testadmin",    fn(m,"testAdmin","testadmin"),       { category:"group", groupOnly:true, aliases:["admintest","checkadmin"] })) count++;
    if (safeRegister("refreshadmin", fn(m,"refreshAdmin","refreshadmin"), { category:"group", groupOnly:true, aliases:["refresh","clearcache"] })) count++; }

  // ── Group Moderation ──────────────────────────────────────────────────────
  { const m = MODULES.groupMod;
    if (safeRegister("warn",       fn(m,"warn"),                          { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["warning"] })) count++;
    if (safeRegister("warnings",   fn(m,"warnings"),                      { category:"group", groupOnly:true, aliases:["warnlist","mywarnings"] })) count++;
    if (safeRegister("clearwarns", fn(m,"clearWarns","clearwarns"),       { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["resetwarns"] })) count++;
    if (safeRegister("ban",        fn(m,"ban"),                           { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["block","banuser"] })) count++;
    if (safeRegister("unban",      fn(m,"unban"),                         { category:"group", groupOnly:true, aliases:["unblock"] })) count++;
    if (safeRegister("listbanned", fn(m,"listBanned","listbanned"),       { category:"group", groupOnly:true, aliases:["bannedlist"] })) count++; }

  // ── Group Settings ────────────────────────────────────────────────────────
  { const m = MODULES.groupSettings;
    if (safeRegister("mute",          fn(m,"mute"),                          { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["lockgroup","muteall"] })) count++;
    if (safeRegister("unmute",        fn(m,"unmute"),                        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["unlockgroup"] })) count++;
    if (safeRegister("lock",          fn(m,"lock"),                          { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["lockinfo"] })) count++;
    if (safeRegister("unlock",        fn(m,"unlock"),                        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["unlockinfo"] })) count++;
    if (safeRegister("antispam",      fn(m,"antiSpam","antispam"),           { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["nospam"] })) count++;
    if (safeRegister("welcome",       fn(m,"welcomeToggle","welcome"),        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["togglewelcome"] })) count++;
    if (safeRegister("setwelcome",    fn(m,"setWelcome","setwelcome"),        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["setwelcomemsg"] })) count++;
    if (safeRegister("goodbye",       fn(m,"goodbyeToggle","goodbye"),        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["togglegoodbye"] })) count++;
    if (safeRegister("setgoodbye",    fn(m,"setGoodbye","setgoodbye"),        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["setgoodbyemsg"] })) count++;
    if (safeRegister("groupinfo",     fn(m,"groupInfo","groupinfo"),          { category:"group", groupOnly:true, aliases:["ginfo","grouppanel"] })) count++;
    if (safeRegister("rules",         fn(m,"rules"),                         { category:"group", groupOnly:true, aliases:["grules","grouprules"] })) count++;
    if (safeRegister("setrules",      fn(m,"setRules","setrules"),            { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["setgrules"] })) count++;
    if (safeRegister("link",          fn(m,"link"),                          { category:"group", groupOnly:true, aliases:["grouplink","invitelink"] })) count++;
    if (safeRegister("revoke",        fn(m,"revoke"),                        { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["revokelink","resetlink"] })) count++;
    if (safeRegister("pin",           fn(m,"pin"),                           { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["pinmsg"] })) count++;
    if (safeRegister("unpin",         fn(m,"unpin"),                         { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["unpinmsg"] })) count++;
    if (safeRegister("delete",        fn(m,"deleteMsg","delete"),             { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["delmsg"] })) count++;
    if (safeRegister("settings",      fn(m,"settingsOverview","settings"),    { category:"group", groupOnly:true, aliases:["groupsettings"] })) count++;
    if (safeRegister("resetsettings", fn(m,"resetSettings","resetsettings"),  { category:"group", groupOnly:true, requireGroupAdmin:true, aliases:["resetgroupsettings"] })) count++;
    if (safeRegister("leave",         fn(m,"leave"),                         { category:"group", groupOnly:true, adminOnly:true, aliases:["botleave","exit"] })) count++;
    if (safeRegister("groupdebug",    fn(m,"debug"),                         { category:"group", groupOnly:true, aliases:["gdebug"] })) count++;
    if (safeRegister("participants",  fn(m,"showParticipants","participants"), { category:"group", groupOnly:true, aliases:["members","memberlist"] })) count++; }

  // ── Security ──────────────────────────────────────────────────────────────
  { const m = MODULES.encryption;
    if (safeRegister("encrypt",  fn(m,"encrypt"),                         { category:"security", aliases:["enc"] })) count++;
    if (safeRegister("decrypt",  fn(m,"decrypt"),                         { category:"security", aliases:["dec"] })) count++;
    if (safeRegister("hash",     fn(m,"hash"),                            { category:"security", aliases:["md5","sha256"] })) count++;
    if (safeRegister("password", fn(m,"password","genPass","passwordGen"),{ category:"security", aliases:["genpass","passgen"] })) count++; }

  { const m = MODULES.security;
    if (safeRegister("scan",     fn(m,"scan","urlScan","scanUrl"),         { category:"security", aliases:["urlscan","checksafe"] })) count++; }

  // ── Storage ───────────────────────────────────────────────────────────────
  { const m = MODULES.notes;
    if (safeRegister("note",    fn(m,"note","saveNote"),                   { category:"storage", aliases:["savenote","remember"] })) count++;
    if (safeRegister("getnote", fn(m,"getnote","getNote","recall"),        { category:"storage", aliases:["recall","readnote"] })) count++;
    if (safeRegister("notes",   fn(m,"notes","listNotes","mynotes"),       { category:"storage", aliases:["mynotes","listnotes"] })) count++;
    if (safeRegister("delnote", fn(m,"deleteKey","delnote","deleteNote","forget"),{ category:"storage", aliases:["forget","deletenote"] })) count++; }

  { const m = MODULES.reminder;
    if (safeRegister("remind",         fn(m,"reminder","remind","setReminder"), { category:"storage", aliases:["reminder","setreminder"] })) count++;
    if (safeRegister("reminders",      fn(m,"listReminders","reminders"),       { category:"storage", aliases:["myreminders"] })) count++;
    if (safeRegister("cancelreminder", fn(m,"cancelReminder","cancelreminder"), { category:"storage", aliases:["delreminder"] })) count++;
    if (safeRegister("snooze",         fn(m,"snooze"),                          { category:"storage", aliases:["snoozereminder"] })) count++; }

  // ── Translation / Units ───────────────────────────────────────────────────
  { const m = MODULES.translation;
    if (safeRegister("translate", fn(m,"translate"),   { category:"tools", aliases:["tr","tl"] })) count++;
    if (safeRegister("detect",    fn(m,"detect"),      { category:"tools", aliases:["langdetect"] })) count++;
    if (safeRegister("languages", fn(m,"languages"),   { category:"tools", aliases:["langs"] })) count++; }

  { const m = MODULES.unitConverter;
    if (safeRegister("convert",   fn(m,"convert"),     { category:"tools", aliases:["conv","cvt"] })) count++;
    if (safeRegister("units",     fn(m,"units"),       { category:"tools", aliases:["listunits"] })) count++; }

  // ── Market / Info ─────────────────────────────────────────────────────────
  { const m = MODULES.stocks;
    if (safeRegister("stock",     fn(m,"stock","stocks"),          { category:"info", aliases:["stocks","share"] })) count++; }

  { const m = MODULES.news;
    if (safeRegister("news",      fn(m,"news","getNews"),          { category:"info", aliases:["latestnews","headlines"] })) count++; }

  { const m = MODULES.movies;
    if (safeRegister("movie",     fn(m,"movie","movies"),          { category:"info", aliases:["movies","film"] })) count++;
    if (safeRegister("series",    fn(m,"series","tvshow"),         { category:"info", aliases:["tvshow"] })) count++; }

  { const m = MODULES.crypto;
    if (safeRegister("crypto",    fn(m,"crypto","getCrypto","coin"),{ category:"info", aliases:["coin","cryptoprice"] })) count++; }

  // ── Automation ────────────────────────────────────────────────────────────
  { const m = MODULES.automation;
    if (safeRegister("autoreply",   fn(m,"autoReply","autoreply"),    { category:"automation" })) count++;
    if (safeRegister("autosticker", fn(m,"autoSticker","autosticker"),{ category:"automation" })) count++; }

  // ── Summary ───────────────────────────────────────────────────────────────
  cmdLog.div();
  cmdLog.success(
    `✅ Registered ${count} commands | Primary: ${primaryCommands.size} | Total (with aliases): ${commands.size}`,
  );

  // Critical command audit
  const critical = ["menu","ping","ok","start","status","tts","joke","quote",
                    "play","img","gif","dl","twitter","youtube","eval","activate","deactivate"];
  const missing  = critical.filter((c) => !commands.has(c));
  if (missing.length) cmdLog.err(`❌ Missing critical: ${missing.join(", ")}`);
  else                cmdLog.success("✅ All critical commands present");

  console.log();

  // ── CRITICAL: rebuild AFTER every command is in the Map ──────────────────
  rebuildAllowedCommands();
}

// ── Call registerAllCommands() here — ALLOWED_COMMANDS is already a valid
//    empty Set() so rebuildAllowedCommands() can safely fill it. ─────────────
registerAllCommands();

// ============================================================================
//  LEVENSHTEIN FUZZY SUGGESTION — primaryCommands only + result cache
// ============================================================================
const _fuzzyCache = new Map();

function findSimilarCommands(input, maxDist = 2, limit = 3) {
  const q = input.toLowerCase();
  if (_fuzzyCache.has(q)) return _fuzzyCache.get(q);

  const res = Array.from(primaryCommands.keys())
    .map((cmd) => ({ cmd, d: levenshteinDistance(q, cmd) }))
    .filter((x) => x.d > 0 && x.d <= maxDist)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.cmd);

  _fuzzyCache.set(q, res);
  if (_fuzzyCache.size > 500) _fuzzyCache.clear();
  return res;
}

function levenshteinDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const mat = [];
  for (let i = 0; i <= b.length; i++) mat[i] = [i];
  for (let j = 0; j <= a.length; j++) mat[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      mat[i][j] = b[i-1] === a[j-1]
        ? mat[i-1][j-1]
        : Math.min(mat[i-1][j-1]+1, mat[i][j-1]+1, mat[i-1][j]+1);
    }
  }
  return mat[b.length][a.length];
}

// ============================================================================
//  BOT ADMIN RESOLVER
// ============================================================================
async function resolveEffectiveBotAdmin(sock, groupJid, ownerPhone) {
  const ownerJid = ownerPhone ? `${normalizePhone(ownerPhone)}@s.whatsapp.net` : null;
  let ok = await isBotGroupAdmin(sock, groupJid, ownerJid);
  if (!ok) ok = await isBotGroupAdmin(sock, groupJid, ownerJid, true);
  return ok;
}

// ============================================================================
//  ACTIVATION EXEMPT — work before group is activated
// ============================================================================
const ACTIVATION_EXEMPT = new Set([
  "activate","deactivate",
  "testadmin","refreshadmin","admintest","checkadmin","refresh","clearcache",
  "groupdebug","gdebug","groupdbg",
  "menu","help","ping","status","start","init","begin","connectdm","dmopen",
  "ok","dm","tome","senddm","push","privatemedia","savetodm","sendtome",
]);

// ============================================================================
//  FIX 2 — OWNER RESOLUTION
//
//  Whoever connected their WhatsApp to this bot IS the owner.
//  Three independent checks, any one returning true makes the sender owner:
//
//  A) message.key.fromMe  — works perfectly for DM self-messages. In groups,
//     Baileys sometimes still sets fromMe=true when you send from your own
//     number, but this is device/version dependent, so we can't rely on it
//     alone.
//
//  B) Direct phone digit comparison: strip cleanPhone (sender digits) and
//     ownerPhone (session.ownerPhone digits) and compare. This is the most
//     reliable check and works in ALL contexts — DM, group, multi-device.
//     If the digits match → owner.
//
//  C) isAdmin() from index.js which handles sessionId-based temp-ID mapping
//     for cases where Baileys assigns a temporary device JID.
// ============================================================================
function resolveIsOwner(message, sock, session, cleanPhone) {
  const fromMe     = !!message.key.fromMe;
  const ownerPhone = session?.ownerPhone || ENV.ADMIN || ENV.OWNER_PHONE || "";
  const sessionId  = session?.id || null;

  // Check A: fromMe flag (reliable in DM, sometimes in group)
  if (fromMe) return true;

  // Check B: exact digit match — most reliable, works everywhere
  if (ownerPhone && cleanPhone) {
    const ownerDigits = ownerPhone.replace(/[^0-9]/g, "");
    if (ownerDigits && cleanPhone === ownerDigits) return true;
  }

  // Check C: index.js isAdmin with temp-ID awareness
  if (ownerPhone && cleanPhone) {
    const userJidStr = `${cleanPhone}@s.whatsapp.net`;
    if (isAdmin(userJidStr, ownerPhone, sessionId)) return true;
  }

  return false;
}

// ============================================================================
//  MAIN COMMAND HANDLER
// ============================================================================
export async function handleCommand(message, sock) {
  const execId = Math.random().toString(36).slice(2, 8);

  try {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const fromMe  = !!message.key.fromMe;

    const session     = message._session   || null;
    const ownerPhone  = session?.ownerPhone || ENV.ADMIN || ENV.OWNER_PHONE || "";
    const sessionMode = session?.mode       || ENV.BOT_MODE || "public";
    const sessionId   = session?.id         || null;

    // ── Resolve sender ────────────────────────────────────────────────────
    let rawSender;
    if (isGroup) {
      rawSender = message.key.participant || from;
    } else if (fromMe) {
      const phone = (sock?.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      rawSender = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      rawSender = from;
    }

    const cleanPhone = normalizeJid(rawSender);
    const userJid    = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSender;
    if (!userJid || !cleanPhone) return;

    // ── Owner / auth ──────────────────────────────────────────────────────
    const isAdminUser      = resolveIsOwner(message, sock, session, cleanPhone);
    const isAuthorizedUser = isAdminUser ||
      isAuthorized(userJid, ownerPhone, sessionMode, sessionId);

    // ── Message text ──────────────────────────────────────────────────────
    const m       = message.message || {};
    const msgText =
      m.conversation              ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption     ||
      m.videoMessage?.caption     ||
      m.documentMessage?.caption  ||
      "";

    if (!msgText?.trim()) return;
    const trimmed = msgText.trim();

    // ── Trivia (non-prefix) ───────────────────────────────────────────────
    if (!trimmed.startsWith(ENV.PREFIX)) {
      if (global.activeTrivia?.has(from)) {
        const upper = trimmed.toUpperCase();
        if (["A","B","C","D"].includes(upper)) {
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

    // ── Parse ─────────────────────────────────────────────────────────────
    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const parts       = body.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    if (!commandName) return;

    // ── Unknown command gate ──────────────────────────────────────────────
    if (!ALLOWED_COMMANDS.has(commandName)) {
      const similar = findSimilarCommands(commandName, 2);
      let hint = "";
      if (similar.length > 0) {
        hint = `\n\nDid you mean: *${ENV.PREFIX}${similar[0]}*?`;
        if (similar.length > 1)
          hint += `\nOr: ${similar.slice(1,3).map((c) => `*${ENV.PREFIX}${c}*`).join(", ")}`;
      }
      await sock.sendMessage(from, {
        text: `❓ *Unknown Command:* ${ENV.PREFIX}${commandName}${hint}\n\nType *${ENV.PREFIX}menu* to see all commands!`,
      });
      return;
    }

    // ── Args (sanitized) ──────────────────────────────────────────────────
    const rawArgs  = parts.slice(1);
    const args     = rawArgs.map(sanitizeInput);
    const fullArgs = args.join(" ");

    // ── Banned ────────────────────────────────────────────────────────────
    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) return;

    // ── Group activation ──────────────────────────────────────────────────
    if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
      if (!ACTIVATION_EXEMPT.has(commandName)) return;
    }

    // ── Private mode ──────────────────────────────────────────────────────
    if (sessionMode === "private" && !isAdminUser) return;

    // ── Command meta ──────────────────────────────────────────────────────
    const meta = commands.get(commandName);
    if (!meta) return;

    const handler     = meta.handler;
    const primaryName = meta.isAlias ? meta.primaryName : (meta.primaryName || commandName);

    // ── Usage tracking ────────────────────────────────────────────────────
    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[primaryName] =
      (commandUsage.get(userJid)[primaryName] || 0) + 1;

    const stats = commandStats.get(primaryName) || {
      uses:0, errors:0, lastUsed:null, avgResponseTime:0, totalResponseTime:0,
    };
    stats.uses++;
    stats.lastUsed = Date.now();
    commandStats.set(primaryName, stats);
    if (session) session.commandCount = (session.commandCount || 0) + 1;

    // ── Rate limit (owner exempt) ─────────────────────────────────────────
    if (!isAdminUser && !rateLimiter.isAllowed(userJid, primaryName)) return;
    if (!isAdminUser && cooldown.isOnCooldown(userJid, primaryName)) return;

    // ── Permission gates ──────────────────────────────────────────────────
    if (meta.adminOnly && !isAdminUser) {
      return sock.sendMessage(from, {
        text: `⛔ *${ENV.PREFIX}${commandName}* is for the *bot owner* only.`,
      });
    }

    if (meta.groupOnly && !isGroup) {
      return sock.sendMessage(from, {
        text: `👥 *${ENV.PREFIX}${commandName}* only works inside a group.`,
      });
    }

    if (meta.requireGroupAdmin && isGroup) {
      const perm = await hasGroupAdminPermission(sock, message, session);
      if (!perm.allowed) return sock.sendMessage(from, { text: perm.reason });
    }

    if (meta.requireBotAdmin && isGroup) {
      const botOk = await resolveEffectiveBotAdmin(sock, from, ownerPhone);
      if (!botOk) {
        return sock.sendMessage(from, {
          text:
            `⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to use *${ENV.PREFIX}${commandName}*.\n\n` +
            `📌 *How to fix:*\n1. Make me a group admin, OR\n2. Make the bot owner a group admin\n3. Run *${ENV.PREFIX}refreshadmin*`,
        });
      }
    }

    // ── Execute ───────────────────────────────────────────────────────────
    cooldown.set(userJid, primaryName);
    cmdLog.cmd(`[${execId}] ${ENV.PREFIX}${commandName} → ${primaryName} | ${cleanPhone}${isGroup?" [G]":""}`);

    const ctx = {
      args,
      fullArgs,
      message,
      from,
      groupJid:      isGroup ? from : null,
      userJid,
      cleanPhone,
      isGroup,
      isDM:          !isGroup,
      fromMe,
      sock,
      isAdmin:       isAdminUser,
      isAuthorized:  isAuthorizedUser,
      commandName:   primaryName,
      invokedAs:     commandName,
      prefix:        ENV.PREFIX,
      session,
      sessionId,
      sessionMode,
      ownerPhone,
      ENV,
      setMode: async (m) => { if (session) session.mode = m; },
      apiRetry,
    };

    if (meta.category === "dl" || meta.category === "ai") {
      await sock.sendMessage(from, { text: "⏳ Processing... Please wait." });
    }

    const t0 = Date.now();

    try {
      await Promise.race([
        handler(ctx),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Command timeout (60 s)")), 60_000),
        ),
      ]);

      const ms = Date.now() - t0;
      stats.totalResponseTime += ms;
      stats.avgResponseTime    = stats.totalResponseTime / stats.uses;
      commandStats.set(primaryName, stats);
      metrics.totalCommands++;
      metrics.avgResponseTime = (metrics.avgResponseTime + ms) / 2;
      cmdLog.success(`[${execId}] ${primaryName} OK (${ms} ms)`);
    } catch (cmdErr) {
      stats.errors++;
      commandStats.set(primaryName, stats);
      metrics.errors++;
      cmdLog.err(`[${execId}] ${primaryName} error: ${cmdErr.message}`);
      const errMsg = cmdErr.message?.length > 100
        ? "❌ An error occurred while executing the command."
        : `❌ *Error:* ${sanitizeInput(cmdErr.message)}`;
      try { await sock.sendMessage(from, { text: errMsg }); } catch (_) {}
    }
  } catch (fatal) {
    cmdLog.err(`[${execId}] FATAL: ${fatal.message}`);
    try {
      await sock?.sendMessage(message?.key?.remoteJid, {
        text: "❌ A system error occurred. Please try again.",
      });
    } catch (_) {}
  }
}

// ============================================================================
//  BACKUP (hourly)
// ============================================================================
async function backupToFile(data, filename) {
  try { fs.writeFileSync(filename, JSON.stringify(data, null, 2)); }
  catch (e) { cmdLog.err(`Backup failed: ${e.message}`); }
}

setInterval(
  () => backupToFile(Array.from(bannedUsers.entries()), "bannedUsers.json"),
  60 * 60 * 1000,
);

// ============================================================================
//  EXPORTS
// ============================================================================
export function getCommandInfo(name) {
  const m = commands.get(name?.toLowerCase());
  if (!m) return null;
  return {
    name:              m.primaryName || name,
    category:          m.category,
    description:       m.description,
    adminOnly:         m.adminOnly,
    groupOnly:         m.groupOnly,
    requireGroupAdmin: m.requireGroupAdmin,
    requireBotAdmin:   m.requireBotAdmin,
    isAlias:           m.isAlias || false,
    aliases:           m.aliases || [],
  };
}

export function getCommandStats(name) {
  return commandStats.get(name?.toLowerCase()) || null;
}

export function getAllStats() {
  let totalUses = 0, totalErrors = 0;
  for (const s of commandStats.values()) {
    totalUses   += s.uses;
    totalErrors += s.errors;
  }
  return {
    totalCommands:  primaryCommands.size,
    totalAliases:   commands.size - primaryCommands.size,
    totalEntries:   commands.size,
    totalUses,
    totalErrors,
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
  _fuzzyCache.clear();
  for (const k of Object.keys(MODULES)) delete MODULES[k];
  await loadAllModules();
  registerAllCommands();
  cmdLog.success("✅ Commands reloaded");
}

export function shutdown() {
  rateLimiter.stopCleanup();
  cmdLog.success("Command handler shutdown complete");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

export { cooldown as commandCooldown, MODULES as modules, rateLimiter, metrics };
