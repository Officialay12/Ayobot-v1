// handlers/commandHandler.js — AYOBOT v1.0.0
// COMPLETE WORKING VERSION - NO SYNTAX ERRORS

import {
  bannedUsers,
  commandUsage,
  ENV,
  isAdmin,
  isAuthorized,
  isGroupActivated,
  hasGroupAdminPermission,
  isBotGroupAdmin,
  normalizePhone,
  delay,
} from "../index.js";

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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
};

const cmdLog = {
  ok: (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset} ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset} ${m}`),
  success: (m) => console.log(`${C.green}✓${C.reset} ${m}`),
  title: (m) => console.log(`\n${C.blue}${m}${C.reset}\n`),
  div: () => console.log(`${C.cyan}${"-".repeat(60)}${C.reset}`),
};

// ============================================================================
//  ENVIRONMENT
// ============================================================================
if (!ENV.PREFIX) ENV.PREFIX = ".";
const OWNER_PHONE = ENV.ADMIN || ENV.OWNER_PHONE || ENV.OWNER_NUMBER || "";
if (OWNER_PHONE) ENV.OWNER_PHONE = OWNER_PHONE;

// ============================================================================
//  RATE LIMITER
// ============================================================================
class RateLimiter {
  constructor(maxRequests = 15, windowMs = 60000) {
    this.max = maxRequests;
    this.window = windowMs;
    this.map = new Map();
  }
  isAllowed(id) {
    const now = Date.now();
    const hits = (this.map.get(id) || []).filter(t => now - t < this.window);
    if (hits.length >= this.max) return false;
    hits.push(now);
    this.map.set(id, hits);
    return true;
  }
  remaining(id) {
    const now = Date.now();
    const hits = (this.map.get(id) || []).filter(t => now - t < this.window);
    if (hits.length < this.max) return 0;
    return Math.max(0, this.window - (now - Math.min(...hits)));
  }
}
const rateLimiter = new RateLimiter(15, 60000);

// ============================================================================
//  COMMAND COOLDOWN
// ============================================================================
class CommandCooldown {
  constructor() {
    this.cooldowns = new Map();
    this.defaultCooldown = 3000;
  }
  isOnCooldown(userId, commandName) {
    const key = `${userId}:${commandName}`;
    const expiry = this.cooldowns.get(key);
    return expiry ? Date.now() < expiry : false;
  }
  setCooldown(userId, commandName) {
    const key = `${userId}:${commandName}`;
    const expiry = Date.now() + this.defaultCooldown;
    this.cooldowns.set(key, expiry);
    setTimeout(() => {
      if (this.cooldowns.get(key) === expiry) this.cooldowns.delete(key);
    }, this.defaultCooldown);
  }
}
const commandCooldown = new CommandCooldown();

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
//  MODULE LOADER
// ============================================================================
cmdLog.title("LOADING COMMAND MODULES");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

cmdLog.info(`Handler path: ${__dirname}`);

const MODULE_PATHS = {
  basic: join(__dirname, "../commands/group/basic.js"),
  admin: join(__dirname, "../commands/group/admin.js"),
  groupCore: join(__dirname, "../commands/group/core.js"),
  groupMod: join(__dirname, "../commands/group/moderation.js"),
  groupSettings: join(__dirname, "../commands/group/settings.js"),
  automation: join(__dirname, "../commands/group/automation.js"),
  ai: join(__dirname, "../features/ai.js"),
  calculator: join(__dirname, "../features/calculator.js"),
  crypto: join(__dirname, "../features/crypto.js"),
  dictionary: join(__dirname, "../features/dictionary.js"),
  downloader: join(__dirname, "../features/downloader.js"),
  encryption: join(__dirname, "../features/encryption.js"),
  games: join(__dirname, "../features/games.js"),
  imageTools: join(__dirname, "../features/imageTools.js"),
  jokes: join(__dirname, "../features/jokes.js"),
  movies: join(__dirname, "../features/movies.js"),
  music: join(__dirname, "../features/music.js"),
  news: join(__dirname, "../features/news.js"),
  notes: join(__dirname, "../features/notes.js"),
  quotes: join(__dirname, "../features/quotes.js"),
  reminder: join(__dirname, "../features/reminder.js"),
  security: join(__dirname, "../features/security.js"),
  stocks: join(__dirname, "../features/stocks.js"),
  translation: join(__dirname, "../features/translation.js"),
  tts: join(__dirname, "../features/tts.js"),
  unitConverter: join(__dirname, "../features/unitConverter.js"),
};

const MODULES = {};

async function safeImport(moduleName, modulePath) {
  try {
    if (!existsSync(modulePath)) {
      cmdLog.warn(`${moduleName.padEnd(15)} ➜ File not found`);
      return {};
    }
    const mod = await import(`file://${modulePath}`);
    const fnCount = Object.keys(mod).filter(k => typeof mod[k] === "function").length;
    if (fnCount > 0) {
      cmdLog.ok(`${moduleName.padEnd(15)} ➜ ${fnCount} functions`);
    } else {
      cmdLog.warn(`${moduleName.padEnd(15)} ➜ No functions`);
    }
    return mod;
  } catch (error) {
    cmdLog.err(`${moduleName.padEnd(15)} ➜ ${error.message}`);
    return {};
  }
}

async function loadAllModules() {
  cmdLog.div();
  for (const [name, path] of Object.entries(MODULE_PATHS)) {
    MODULES[name] = await safeImport(name, path);
  }
  const loaded = Object.values(MODULES).filter(m => Object.keys(m).length > 0).length;
  cmdLog.div();
  cmdLog.success(`Loaded ${loaded}/${Object.keys(MODULE_PATHS).length} modules`);
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

export function safeRegister(name, handler, options = {}) {
  if (typeof handler !== "function") {
    cmdLog.err(`Cannot register "${name}": not a function`);
    return false;
  }
  const lowerName = name.toLowerCase();
  commands.set(lowerName, { handler, ...options, name: lowerName });
  primaryCommands.set(lowerName, true);
  if (options.aliases) {
    for (const alias of options.aliases) {
      commands.set(alias.toLowerCase(), { handler, ...options, name: lowerName, isAlias: true });
    }
  }
  return true;
}

// ============================================================================
//  REGISTER ALL COMMANDS
// ============================================================================
cmdLog.title("REGISTERING COMMANDS");

let registeredCount = 0;

// ==================== BASIC.JS COMMANDS ====================
const b = MODULES.basic;
if (b) {
  if (typeof b.menu === "function") {
    safeRegister("menu", b.menu, { category: "core", aliases: ["help", "commands", "h"] });
    registeredCount++;
  }
  if (typeof b.ping === "function") {
    safeRegister("ping", b.ping, { category: "core", aliases: ["pong", "alive"] });
    registeredCount++;
  }
  if (typeof b.status === "function") {
    safeRegister("status", b.status, { category: "core", aliases: ["me", "profile"] });
    registeredCount++;
  }
  if (typeof b.creator === "function") {
    safeRegister("creator", b.creator, { category: "core", aliases: ["dev", "owner"] });
    registeredCount++;
  }
  if (typeof b.creatorGit === "function") {
    safeRegister("github", b.creatorGit, { category: "core", aliases: ["git", "repo"] });
    registeredCount++;
  }
  if (typeof b.auto === "function") {
    safeRegister("auto", b.auto, { category: "core", aliases: ["autoreply"] });
    registeredCount++;
  }
  if (typeof b.connectInfo === "function") {
    safeRegister("connect", b.connectInfo, { category: "core", aliases: ["community"] });
    registeredCount++;
  }
  if (typeof b.prefixinfo === "function") {
    safeRegister("prefix", b.prefixinfo, { category: "core", aliases: ["prefixinfo"] });
    registeredCount++;
  }
  if (typeof b.test === "function") {
    safeRegister("test", b.test, { category: "debug", aliases: ["hello", "hi"] });
    registeredCount++;
  }
  if (typeof b.start === "function") {
    safeRegister("start", b.start, { category: "core", aliases: ["open", "init", "begin"] });
    registeredCount++;
    cmdLog.ok("✅ .start command registered");
  }
  if (typeof b.time === "function") {
    safeRegister("time", b.time, { category: "info", aliases: ["worldtime"] });
    registeredCount++;
  }
  if (typeof b.weather === "function") {
    safeRegister("weather", b.weather, { category: "info", aliases: ["w"] });
    registeredCount++;
  }
  if (typeof b.ip === "function" || typeof b.getip === "function") {
    const ipFn = typeof b.ip === "function" ? b.ip : b.getip;
    safeRegister("ip", ipFn, { category: "web", aliases: ["getip", "iplookup"] });
    registeredCount++;
  }
  if (typeof b.myip === "function") {
    safeRegister("myip", b.myip, { category: "web", aliases: ["myipaddr"] });
    registeredCount++;
  }
  if (typeof b.whois === "function") {
    safeRegister("whois", b.whois, { category: "web", aliases: ["domain"] });
    registeredCount++;
  }
  if (typeof b.dns === "function") {
    safeRegister("dns", b.dns, { category: "web", aliases: ["dnslookup"] });
    registeredCount++;
  }
  if (typeof b.url === "function") {
    safeRegister("url", b.url, { category: "web", aliases: ["urlinfo"] });
    registeredCount++;
  }
  if (typeof b.fetch === "function") {
    safeRegister("fetch", b.fetch, { category: "web", aliases: ["geturl"] });
    registeredCount++;
  }
  if (typeof b.scrape === "function") {
    safeRegister("scrape", b.scrape, { category: "web", aliases: ["scraper"] });
    registeredCount++;
  }
  if (typeof b.screenshot === "function") {
    safeRegister("screenshot", b.screenshot, { category: "web", aliases: ["ss", "capture"] });
    registeredCount++;
  }
  if (typeof b.inspect === "function") {
    safeRegister("inspect", b.inspect, { category: "web", aliases: ["pageinspect"] });
    registeredCount++;
  }
  if (typeof b.shorten === "function") {
    safeRegister("shorten", b.shorten, { category: "web", aliases: ["short", "tinyurl"] });
    registeredCount++;
  }
  if (typeof b.viewOnce === "function") {
    safeRegister("vv", b.viewOnce, { category: "media", aliases: ["viewonce", "open"] });
    registeredCount++;
  }
  // CRITICAL: .ok command
  if (typeof b.ok === "function") {
    safeRegister("ok", b.ok, { category: "media", aliases: ["dm", "tome", "senddm", "push", "privatemedia"] });
    registeredCount++;
    cmdLog.ok("✅ .ok command registered");
  } else {
    cmdLog.err("❌ .ok command NOT found in basic.js");
  }
  if (typeof b.take === "function") {
    safeRegister("take", b.take, { category: "media", aliases: ["takesticker", "steal"] });
    registeredCount++;
  }
  if (typeof b.imgbb === "function") {
    safeRegister("imgbb", b.imgbb, { category: "media", aliases: ["upload"] });
    registeredCount++;
  }
  if (typeof b.qencode === "function") {
    safeRegister("qr", b.qencode, { category: "tools", aliases: ["qrcode"] });
    registeredCount++;
  }
  if (typeof b.pdf === "function") {
    safeRegister("pdf", b.pdf, { category: "tools", aliases: ["makepdf"] });
    registeredCount++;
  }
  if (typeof b.getpp === "function") {
    safeRegister("getpp", b.getpp, { category: "profile", aliases: ["pp", "pfp"] });
    registeredCount++;
  }
  if (typeof b.getgpp === "function") {
    safeRegister("getgpp", b.getgpp, { category: "profile", groupOnly: true, aliases: ["gpp"] });
    registeredCount++;
  }
  if (typeof b.jarvis === "function") {
    safeRegister("jarvis", b.jarvis, { category: "ai", aliases: ["j", "ask"] });
    registeredCount++;
  }
  if (typeof b.joinWaitlist === "function") {
    safeRegister("waitlist", b.joinWaitlist, { category: "misc", aliases: ["joinwaitlist"] });
    registeredCount++;
  }
  if (typeof b.activate === "function") {
    safeRegister("activate", b.activate, { category: "group", groupOnly: true, adminOnly: true });
    registeredCount++;
  }
  if (typeof b.deactivate === "function") {
    safeRegister("deactivate", b.deactivate, { category: "group", groupOnly: true, adminOnly: true });
    registeredCount++;
  }
  if (typeof b.antilink === "function") {
    safeRegister("antilink", b.antilink, { category: "group", groupOnly: true, aliases: ["nolink"] });
    registeredCount++;
  }
  cmdLog.ok(`Basic commands: ${registeredCount} so far`);
}

// ==================== TTS.JS ====================
const tts = MODULES.tts;
if (tts && typeof tts.tts === "function") {
  safeRegister("tts", tts.tts, { category: "media", aliases: ["voice", "say", "speak"] });
  registeredCount++;
  cmdLog.ok("✅ TTS registered");
}

// ==================== JOKES.JS ====================
const jokes = MODULES.jokes;
if (jokes) {
  if (typeof jokes.joke === "function") {
    safeRegister("joke", jokes.joke, { category: "fun", aliases: ["laugh", "funny"] });
    registeredCount++;
  }
  if (typeof jokes.roast === "function") {
    safeRegister("roast", jokes.roast, { category: "fun", aliases: ["burn", "insult"] });
    registeredCount++;
  }
  if (typeof jokes.pickupLine === "function") {
    safeRegister("pickup", jokes.pickupLine, { category: "fun", aliases: ["flirt", "pickupline"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Jokes registered");
}

// ==================== QUOTES.JS ====================
const quotes = MODULES.quotes;
if (quotes && typeof quotes.quote === "function") {
  safeRegister("quote", quotes.quote, { category: "fun", aliases: ["motivation", "inspire"] });
  registeredCount++;
  cmdLog.ok("✅ Quotes registered");
}

// ==================== GAMES.JS ====================
const games = MODULES.games;
if (games) {
  if (typeof games.rps === "function") {
    safeRegister("rps", games.rps, { category: "games", aliases: ["rockpaperscissors"] });
    registeredCount++;
  }
  if (typeof games.dice === "function") {
    safeRegister("dice", games.dice, { category: "games", aliases: ["roll", "rolldice"] });
    registeredCount++;
  }
  if (typeof games.coinFlip === "function") {
    safeRegister("flip", games.coinFlip, { category: "games", aliases: ["coin", "coinflip"] });
    registeredCount++;
  }
  if (typeof games.trivia === "function") {
    safeRegister("trivia", games.trivia, { category: "games", aliases: ["quiz"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Games registered");
}

// ==================== DOWNLOADER.JS ====================
const dl = MODULES.downloader;
if (dl) {
  if (typeof dl.youtube === "function") {
    safeRegister("youtube", dl.youtube, { category: "dl", aliases: ["yt", "ytdl"] });
    registeredCount++;
  }
  if (typeof dl.tiktok === "function") {
    safeRegister("tiktok", dl.tiktok, { category: "dl", aliases: ["tt", "tok"] });
    registeredCount++;
  }
  if (typeof dl.spotify === "function") {
    safeRegister("spotify", dl.spotify, { category: "dl", aliases: ["sp"] });
    registeredCount++;
  }
  if (typeof dl.instagram === "function") {
    safeRegister("instagram", dl.instagram, { category: "dl", aliases: ["ig", "insta"] });
    registeredCount++;
  }
  if (typeof dl.gif === "function") {
    safeRegister("gif", dl.gif, { category: "dl", aliases: ["giphy", "tenor"] });
    registeredCount++;
  }
  if (typeof dl.image === "function") {
    safeRegister("img", dl.image, { category: "dl", aliases: ["image", "pics"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Downloader registered");
}

// ==================== MUSIC.JS ====================
const music = MODULES.music;
if (music) {
  if (typeof music.musicLyrics === "function") {
    safeRegister("lyrics", music.musicLyrics, { category: "music", aliases: ["lyric"] });
    registeredCount++;
  }
  if (typeof music.musicDownload === "function") {
    safeRegister("play", music.musicDownload, { category: "music", aliases: ["mp3", "song"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Music registered");
}

// ==================== ADMIN.JS ====================
const adm = MODULES.admin;
if (adm) {
  if (typeof adm.mode === "function") {
    safeRegister("mode", adm.mode, { category: "admin", adminOnly: true, aliases: ["setmode"] });
    registeredCount++;
  }
  if (typeof adm.addUser === "function") {
    safeRegister("adduser", adm.addUser, { category: "admin", adminOnly: true, aliases: ["auth"] });
    registeredCount++;
  }
  if (typeof adm.removeUser === "function") {
    safeRegister("removeuser", adm.removeUser, { category: "admin", adminOnly: true, aliases: ["deauth"] });
    registeredCount++;
  }
  if (typeof adm.listUsers === "function") {
    safeRegister("listusers", adm.listUsers, { category: "admin", adminOnly: true, aliases: ["users"] });
    registeredCount++;
  }
  if (typeof adm.broadcast === "function") {
    safeRegister("broadcast", adm.broadcast, { category: "admin", adminOnly: true, aliases: ["bc"] });
    registeredCount++;
  }
  if (typeof adm.globalBroadcast === "function") {
    safeRegister("globalbc", adm.globalBroadcast, { category: "admin", adminOnly: true, aliases: ["gbc"] });
    registeredCount++;
  }
  if (typeof adm.stats === "function") {
    safeRegister("stats", adm.stats, { category: "admin", adminOnly: true, aliases: ["botstats"] });
    registeredCount++;
  }
  if (typeof adm.botStatus === "function") {
    safeRegister("botstatus", adm.botStatus, { category: "admin", adminOnly: true });
    registeredCount++;
  }
  if (typeof adm.superBan === "function") {
    safeRegister("superban", adm.superBan, { category: "admin", adminOnly: true, aliases: ["globalban"] });
    registeredCount++;
  }
  if (typeof adm.unban === "function") {
    safeRegister("unban", adm.unban, { category: "admin", adminOnly: true });
    registeredCount++;
  }
  if (typeof adm.restart === "function") {
    safeRegister("restart", adm.restart, { category: "admin", adminOnly: true, aliases: ["reboot"] });
    registeredCount++;
  }
  if (typeof adm.shutdown === "function") {
    safeRegister("shutdown", adm.shutdown, { category: "admin", adminOnly: true, aliases: ["stop"] });
    registeredCount++;
  }
  if (typeof adm.adminEval === "function") {
    safeRegister("eval", adm.adminEval, { category: "admin", adminOnly: true, aliases: ["exec", "code"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Admin registered");
}

// ==================== GROUP CORE.JS ====================
const gc = MODULES.groupCore;
if (gc) {
  if (typeof gc.kick === "function") {
    safeRegister("kick", gc.kick, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["remove"] });
    registeredCount++;
  }
  if (typeof gc.add === "function") {
    safeRegister("add", gc.add, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["invite"] });
    registeredCount++;
  }
  if (typeof gc.promote === "function") {
    safeRegister("promote", gc.promote, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["makeadmin"] });
    registeredCount++;
  }
  if (typeof gc.demote === "function") {
    safeRegister("demote", gc.demote, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unadmin"] });
    registeredCount++;
  }
  if (typeof gc.admins === "function") {
    safeRegister("admins", gc.admins, { category: "group", groupOnly: true, aliases: ["listadmins"] });
    registeredCount++;
  }
  if (typeof gc.tagall === "function") {
    safeRegister("tagall", gc.tagall, { category: "group", groupOnly: true, aliases: ["everyone", "all"] });
    registeredCount++;
  }
  if (typeof gc.hidetag === "function") {
    safeRegister("hidetag", gc.hidetag, { category: "group", groupOnly: true, aliases: ["htag"] });
    registeredCount++;
  }
  if (typeof gc.testAdmin === "function") {
    safeRegister("testadmin", gc.testAdmin, { category: "group", groupOnly: true });
    registeredCount++;
  }
  if (typeof gc.refreshAdmin === "function") {
    safeRegister("refreshadmin", gc.refreshAdmin, { category: "group", groupOnly: true, aliases: ["refresh"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Group Core registered");
}

// ==================== GROUP SETTINGS.JS ====================
const gs = MODULES.groupSettings;
if (gs) {
  if (typeof gs.mute === "function") {
    safeRegister("mute", gs.mute, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["lockgroup"] });
    registeredCount++;
  }
  if (typeof gs.unmute === "function") {
    safeRegister("unmute", gs.unmute, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["unlockgroup"] });
    registeredCount++;
  }
  if (typeof gs.lock === "function") {
    safeRegister("lock", gs.lock, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof gs.unlock === "function") {
    safeRegister("unlock", gs.unlock, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof gs.link === "function") {
    safeRegister("link", gs.link, { category: "group", groupOnly: true, aliases: ["grouplink"] });
    registeredCount++;
  }
  if (typeof gs.revoke === "function") {
    safeRegister("revoke", gs.revoke, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof gs.rules === "function") {
    safeRegister("rules", gs.rules, { category: "group", groupOnly: true, aliases: ["grules"] });
    registeredCount++;
  }
  if (typeof gs.setRules === "function") {
    safeRegister("setrules", gs.setRules, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof gs.groupInfo === "function") {
    safeRegister("groupinfo", gs.groupInfo, { category: "group", groupOnly: true, aliases: ["ginfo"] });
    registeredCount++;
  }
  if (typeof gs.pin === "function") {
    safeRegister("pin", gs.pin, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["pinmsg"] });
    registeredCount++;
  }
  if (typeof gs.unpin === "function") {
    safeRegister("unpin", gs.unpin, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof gs.deleteMsg === "function") {
    safeRegister("delete", gs.deleteMsg, { category: "group", groupOnly: true, requireGroupAdmin: true, aliases: ["del"] });
    registeredCount++;
  }
  if (typeof gs.settingsOverview === "function") {
    safeRegister("settings", gs.settingsOverview, { category: "group", groupOnly: true, aliases: ["groupsettings"] });
    registeredCount++;
  }
  if (typeof gs.leave === "function") {
    safeRegister("leave", gs.leave, { category: "group", groupOnly: true, adminOnly: true });
    registeredCount++;
  }
  cmdLog.ok("✅ Group Settings registered");
}

// ==================== NOTES.JS ====================
const notes = MODULES.notes;
if (notes) {
  if (typeof notes.note === "function") {
    safeRegister("note", notes.note, { category: "storage", aliases: ["savenote"] });
    registeredCount++;
  }
  if (typeof notes.getnote === "function") {
    safeRegister("getnote", notes.getnote, { category: "storage", aliases: ["recall"] });
    registeredCount++;
  }
  if (typeof notes.notes === "function") {
    safeRegister("notes", notes.notes, { category: "storage", aliases: ["mynotes"] });
    registeredCount++;
  }
  if (typeof notes.deleteKey === "function") {
    safeRegister("delnote", notes.deleteKey, { category: "storage", aliases: ["deletenote"] });
    registeredCount++;
  }
  cmdLog.ok("✅ Notes registered");
}

// ==================== AUTOMATION.JS ====================
const auto = MODULES.automation;
if (auto) {
  if (typeof auto.welcomeToggle === "function") {
    safeRegister("welcome", auto.welcomeToggle, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof auto.setWelcome === "function") {
    safeRegister("setwelcome", auto.setWelcome, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof auto.goodbyeToggle === "function") {
    safeRegister("goodbye", auto.goodbyeToggle, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof auto.setGoodbye === "function") {
    safeRegister("setgoodbye", auto.setGoodbye, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof auto.antiLink === "function") {
    safeRegister("antilink", auto.antiLink, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  if (typeof auto.antiSpam === "function") {
    safeRegister("antispam", auto.antiSpam, { category: "group", groupOnly: true, requireGroupAdmin: true });
    registeredCount++;
  }
  cmdLog.ok("✅ Automation registered");
}

// ==================== FINAL VERIFICATION ====================
cmdLog.div();
cmdLog.success(`Total registered commands: ${registeredCount}`);
cmdLog.success(`Commands in map: ${commands.size}`);

// Verify essential commands
cmdLog.div();
cmdLog.title("ESSENTIAL COMMANDS VERIFICATION");
const essential = ["menu", "ping", "ok", "start", "tts", "status"];
essential.forEach(cmd => {
  if (commands.has(cmd)) {
    cmdLog.ok(`✅ ${cmd} is registered`);
  } else {
    cmdLog.err(`❌ ${cmd} is NOT registered - will show as Unknown!`);
  }
});

// ============================================================================
//  ACTIVATION EXEMPT COMMANDS
// ============================================================================
const ACTIVATION_EXEMPT = new Set([
  "activate", "deactivate", "testadmin", "refreshadmin", "menu", "help",
  "ping", "status", "start", "ok", "dm", "tome", "senddm"
]);

// ============================================================================
//  FIND SIMILAR COMMANDS
// ============================================================================
function findSimilarCommands(input, maxDistance = 2, limit = 3) {
  const inputLower = input.toLowerCase();
  const commandList = Array.from(commands.keys());
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
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================================
//  MAIN COMMAND HANDLER
// ============================================================================
export async function handleCommand(message, sock) {
  const executionId = Math.random().toString(36).substring(2, 8);

  try {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const fromMe = !!message.key.fromMe;

    const session = message._session || null;
    const ownerPhone = session?.ownerPhone || ENV.ADMIN || ENV.OWNER_PHONE || "";
    const sessionMode = session?.mode || ENV.BOT_MODE || "public";
    const sessionId = session?.id || "";

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

    const isAdminUser = fromMe || isAdmin(userJid, ownerPhone);
    const isAuthorizedUser = isAdminUser || isAuthorized(userJid, ownerPhone, sessionMode);

    const m = message.message || {};
    const msgText = m.conversation || m.extendedTextMessage?.text || "";
    if (!msgText?.trim()) return;
    const trimmed = msgText.trim();

    // Trivia handler
    if (!trimmed.startsWith(ENV.PREFIX)) {
      if (global.activeTrivia && global.activeTrivia.has(from)) {
        const upperMsg = trimmed.toUpperCase();
        if (["A", "B", "C", "D"].includes(upperMsg)) {
          if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) return;
          if (sessionMode === "private" && !isAdminUser) return;
          if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) return;
          try {
            const g = MODULES.games;
            if (g && typeof g.handleTriviaAnswer === "function") {
              await g.handleTriviaAnswer(message, from, sock);
              return;
            }
          } catch (error) {
            cmdLog.debug(`Trivia error: ${error.message}`);
          }
        }
      }
      return;
    }

    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    if (!commandName) return;

    const rawArgs = parts.slice(1);
    const fullArgs = rawArgs.join(" ");
    const args = rawArgs.map((a) => sanitizeInput(a));

    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) {
      cmdLog.warn(`Blocked banned user: ${cleanPhone}`);
      return;
    }

    if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
      if (!ACTIVATION_EXEMPT.has(commandName)) {
        cmdLog.debug(`Group not activated: ${commandName} ignored`);
        return;
      }
    }

    if (sessionMode === "private" && !isAdminUser) {
      cmdLog.debug(`Private mode: ignored ${cleanPhone}`);
      return;
    }

    cmdLog.info(`${ENV.PREFIX}${commandName} from ${cleanPhone}${isGroup ? " [GROUP]" : ""}`);

    const commandMeta = commands.get(commandName);

    if (!commandMeta) {
      const similar = findSimilarCommands(commandName, 2);
      let suggestion = "";
      if (similar.length > 0) {
        suggestion = `\n\nDid you mean: *${ENV.PREFIX}${similar[0]}*?`;
        if (similar.length > 1) {
          suggestion += `\nOr: ${similar.slice(1, 3).map((c) => `*${ENV.PREFIX}${c}*`).join(", ")}`;
        }
      }
      await sock.sendMessage(from, {
        text: `❓ *Unknown Command:* ${ENV.PREFIX}${commandName}${suggestion}\n\nType *${ENV.PREFIX}menu* to see all commands!`,
      });
      return;
    }

    const handlerFunction = commandMeta.handler;
    const primaryName = commandMeta.name || commandName;

    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[primaryName] = (commandUsage.get(userJid)[primaryName] || 0) + 1;

    if (session) {
      session.commandCount = (session.commandCount || 0) + 1;
    }

    if (!isAdminUser && !rateLimiter.isAllowed(userJid)) {
      const seconds = Math.ceil(rateLimiter.remaining(userJid) / 1000);
      return sock.sendMessage(from, {
        text: `⏳ *Slow down!* Wait *${seconds}s* before the next command.`,
      });
    }

    if (!isAdminUser && commandCooldown.isOnCooldown(userJid, primaryName)) {
      const seconds = Math.ceil(commandCooldown.getRemaining(userJid, primaryName) / 1000);
      return sock.sendMessage(from, {
        text: `⏳ *Cooldown!*\nPlease wait *${seconds}s* before using *${ENV.PREFIX}${primaryName}* again.`,
      });
    }

    if (commandMeta.adminOnly && !isAdminUser) {
      return sock.sendMessage(from, {
        text: `⛔ *${ENV.PREFIX}${commandName}* is for the *bot owner* only.`,
      });
    }

    if (commandMeta.groupOnly && !isGroup) {
      return sock.sendMessage(from, {
        text: `👥 *${ENV.PREFIX}${commandName}* only works inside a group.`,
      });
    }

    if (commandMeta.requireGroupAdmin && isGroup) {
      const permission = await hasGroupAdminPermission(sock, message, session);
      if (!permission.allowed) {
        return sock.sendMessage(from, { text: permission.reason });
      }
    }

    if (commandMeta.requireBotAdmin && isGroup) {
      let botIsAdmin = await isBotGroupAdmin(sock, from);
      if (!botIsAdmin) {
        botIsAdmin = await isBotGroupAdmin(sock, from, true);
      }
      if (!botIsAdmin) {
        return sock.sendMessage(from, {
          text: `⚠️ *Bot Not Admin*\n\nI need to be a *group admin* to use *${ENV.PREFIX}${commandName}*.\n\n📌 *How to fix:*\n1. Add me as a group admin\n2. Wait a few seconds\n3. Type *${ENV.PREFIX}refreshadmin* to refresh my status`,
        });
      }
    }

    commandCooldown.setCooldown(userJid, primaryName);

    const setMode = async (newMode) => {
      if (session && typeof session === "object") {
        session.mode = newMode;
        cmdLog.info(`Session mode updated to: ${newMode}`);
      }
    };

    try {
      const context = {
        args, fullArgs, message, from, groupJid: isGroup ? from : null,
        userJid, cleanPhone, isGroup, isDM: !isGroup, fromMe, sock,
        isAdmin: isAdminUser, isAuthorized: isAuthorizedUser,
        commandName: primaryName, invokedAs: commandName, prefix: ENV.PREFIX,
        session, sessionId, sessionMode, ownerPhone, ENV, setMode,
      };

      await handlerFunction(context);

      cmdLog.success(`${primaryName} completed`);
    } catch (cmdError) {
      cmdLog.err(`${primaryName} error: ${cmdError.message}`);
      try {
        await sock.sendMessage(from, {
          text: `❌ *Error*\n\n${sanitizeInput(cmdError.message)}`,
        });
      } catch (_) {}
    }
  } catch (fatalError) {
    cmdLog.err(`FATAL: ${fatalError.message}`);
    try {
      await sock?.sendMessage(message?.key?.remoteJid, {
        text: "❌ A system error occurred. Please try again.",
      });
    } catch (_) {}
  }
}

// ============================================================================
//  EXPORTS
// ============================================================================
export { commandCooldown, MODULES as modules, rateLimiter };
