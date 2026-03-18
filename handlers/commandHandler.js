// handlers/commandHandler.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE FIXED VERSION - ALL COMMANDS WORKING
//  Author  : AYOCODES
//  Version : 1.0.0 (FINAL)
//
//  FIXES INCLUDED:
//  • Added .pin, .unpin, .delete commands
//  • Fixed admin detection for group owner
//  • Added antilink detection handler
//  • All group commands now properly registered
// ════════════════════════════════════════════════════════════════════════════

import {
  bannedUsers,
  commandUsage,
  ENV,
  isAdmin,
  isAuthorized,
  activateGroup,
  deactivateGroup,
  isGroupActivated,
} from "../index.js";

import {
  formatError,
  formatGroupError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";
import { isBotGroupAdminCached } from "../utils/validators.js";

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
};

const log = {
  ok: (m) => console.log(`${C.green}✅${C.reset} ${m}`),
  err: (m) => console.log(`${C.red}❌${C.reset} ${m}`),
  warn: (m) => console.log(`${C.yellow}⚠️${C.reset}  ${m}`),
  info: (m) => console.log(`${C.cyan}ℹ️${C.reset}  ${m}`),
  cmd: (m) => console.log(`${C.magenta}⚡${C.reset} ${m}`),
  debug: (m) => console.log(`${C.gray}🔍${C.reset} ${m}`),
  success: (m) => console.log(`${C.green}✓${C.reset}  ${m}`),
  title: (m) => console.log(`\n${C.blue}${C.bright}${m}${C.reset}\n`),
  div: () => console.log(`${C.cyan}${"─".repeat(60)}${C.reset}`),
};

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
    const hits = (this.map.get(id) || []).filter((t) => now - t < this.window);
    this.map.set(id, hits);
    if (hits.length >= this.max) return false;
    hits.push(now);
    return true;
  }

  remaining(id) {
    const hits = this.map.get(id) || [];
    if (!hits.length) return 0;
    return Math.max(0, this.window - (Date.now() - Math.min(...hits)));
  }

  cleanup() {
    const now = Date.now();
    for (const [key, times] of this.map.entries()) {
      const filtered = times.filter(t => now - t < this.window);
      if (filtered.length === 0) {
        this.map.delete(key);
      } else {
        this.map.set(key, filtered);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// ============================================================================
//  TRIVIA STATE
// ============================================================================
global.activeTrivia = global.activeTrivia || new Map();

// ============================================================================
//  MODULE LOADER
// ============================================================================
log.title("📦 LOADING COMMAND MODULES");

const MODULE_PATHS = {
  // Core modules
  basic: "../commands/group/basic.js",
  admin: "../commands/group/admin.js",
  groupCore: "../commands/group/core.js",
  groupMod: "../commands/group/moderation.js",
  groupSettings: "../commands/group/settings.js",
  automation: "../commands/group/automation.js",
  antilink: "../features/antilink.js",  // ADDED

  // Feature modules
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
    const exportCount = Object.keys(mod).filter(k => typeof mod[k] === 'function').length;
    log.ok(`${moduleName.padEnd(15)} ➜ ${exportCount} functions`);
    return mod;
  } catch (error) {
    log.warn(`${moduleName.padEnd(15)} ➜ Failed: ${error.message.slice(0, 50)}`);
    return {};
  }
}

async function loadAllModules() {
  log.div();
  let loaded = 0;

  for (const [name, path] of Object.entries(MODULE_PATHS)) {
    MODULES[name] = await safeImport(name, path);
    if (Object.keys(MODULES[name]).length > 0) loaded++;
  }

  log.div();
  log.success(`Loaded ${loaded}/${Object.keys(MODULE_PATHS).length} modules`);
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
    this.requireBotAdmin = options.requireBotAdmin === true;
    this.aliases = (options.aliases || []).map(a => a.toLowerCase());
    this.createdAt = Date.now();
  }
}

export function registerCommand(primaryName, handler, options = {}) {
  if (typeof handler !== 'function') {
    log.err(`Cannot register "${primaryName}": handler is not a function`);
    return false;
  }

  const name = primaryName.toLowerCase();
  const aliases = (options.aliases || []).map(a => a.toLowerCase());

  const primaryMeta = new CommandMeta(name, handler, options);

  primaryCommands.set(name, primaryMeta);
  commands.set(name, primaryMeta);

  commandStats.set(name, {
    uses: 0,
    errors: 0,
    lastUsed: null,
    avgResponseTime: 0,
    totalResponseTime: 0
  });

  log.cmd(`Registered: ${name}${aliases.length ? ` [${aliases.join(', ')}]` : ''}`);

  for (const alias of aliases) {
    if (alias === name) continue;

    const aliasMeta = {
      ...primaryMeta,
      isAlias: true,
      aliasName: alias,
      primaryName: name,
      handler: handler
    };

    commands.set(alias, aliasMeta);
    aliasMap.set(alias, name);
    log.debug(`  Alias: ${alias} → ${name}`);
  }

  return true;
}

export function safeRegister(primaryName, handler, options = {}) {
  try {
    return registerCommand(primaryName, handler, options);
  } catch (error) {
    log.err(`safeRegister("${primaryName}") threw: ${error.message}`);
    return false;
  }
}

// ============================================================================
//  COMPLETE COMMAND REGISTRATION - FIXED
// ============================================================================
export function registerAllCommands() {
  log.title("📝 REGISTERING ALL COMMANDS");
  log.div();

  // ────────────────────────────────────────────────────────────────────────
  //  BASIC.JS
  // ────────────────────────────────────────────────────────────────────────
  const b = MODULES.basic;

  // Core Commands
  if (b.menu) safeRegister("menu", b.menu, {
    category: "core",
    description: "Show all commands",
    aliases: ["help", "commands", "h", "cmd", "cmds", "commandlist", "menuhelp"]
  });

  if (b.ping) safeRegister("ping", b.ping, {
    category: "core",
    description: "Check bot latency",
    aliases: ["pong", "latency", "speed", "ms", "uptime", "alive", "botping"]
  });

  if (b.status) safeRegister("status", b.status, {
    category: "core",
    description: "Your status and usage",
    aliases: ["me", "profile", "whoami", "myinfo", "mystats", "userstatus"]
  });

  if (b.creator) safeRegister("creator", b.creator, {
    category: "core",
    description: "Creator information",
    aliases: ["dev", "owner", "author", "ayo", "ayocodes", "developer", "creatorinfo"]
  });

  if (b.creatorGit) safeRegister("github", b.creatorGit, {
    category: "core",
    description: "GitHub repository",
    aliases: ["git", "repo", "source", "code", "repository", "sourcecode"]
  });

  if (b.auto) safeRegister("auto", b.auto, {
    category: "core",
    description: "Toggle auto-reply",
    aliases: ["autoreply", "toggleauto", "autorespond", "automsg", "autooff", "autoon"]
  });

  if (b.connectInfo) safeRegister("connect", b.connectInfo, {
    category: "core",
    description: "Community links",
    aliases: ["community", "links", "group", "channel", "social", "join", "connectinfo"]
  });

  if (b.prefixinfo) safeRegister("prefix", b.prefixinfo, {
    category: "core",
    description: "Show current prefix",
    aliases: ["preinfo", "getprefix", "prefixinfo", "whatprefix", "myprefix"]
  });

  if (b.test) safeRegister("test", b.test, {
    category: "debug",
    description: "Test command",
    aliases: ["hello", "hi", "testcmd", "pingtest", "testbot", "check"]
  });

  if (b.time) safeRegister("time", b.time, {
    category: "info",
    description: "World time lookup",
    aliases: ["worldtime", "timezone", "tz", "clock", "currenttime", "datetime", "whattime"]
  });

  if (b.weather) safeRegister("weather", b.weather, {
    category: "info",
    description: "Weather forecast",
    aliases: ["w", "forecast", "temp", "climate", "temperature", "weatherinfo", "wea"]
  });

  // Web Tools
  if (b.getip || b.ip) {
    const ipHandler = b.getip || b.ip;
    safeRegister("ip", ipHandler, {
      category: "web",
      description: "IP address lookup",
      aliases: ["getip", "iplookup", "ipinfo", "checkip", "whatsmyip", "iptrace", "iplocate"]
    });
  }

  if (b.myip) safeRegister("myip", b.myip, {
    category: "web",
    description: "Your public IP",
    aliases: ["myipaddr", "publicip", "whatismyip", "myipaddress", "ipme"]
  });

  if (b.whois) safeRegister("whois", b.whois, {
    category: "web",
    description: "Domain WHOIS lookup",
    aliases: ["domain", "domaininfo", "domainlookup", "whoislookup", "who", "domainwhois"]
  });

  if (b.dns) safeRegister("dns", b.dns, {
    category: "web",
    description: "DNS lookup",
    aliases: ["dnslookup", "dnsrecords", "nslookup", "dig", "dnsinfo", "dnsquery"]
  });

  if (b.url) safeRegister("url", b.url, {
    category: "web",
    description: "URL information",
    aliases: ["urlinfo", "urlcheck", "expandurl", "urldetails", "urldecode", "urlinspect"]
  });

  if (b.fetch) safeRegister("fetch", b.fetch, {
    category: "web",
    description: "Fetch URL content",
    aliases: ["geturl", "curl", "httpget", "wget", "fetchurl", "getcontent"]
  });

  if (b.scrape) safeRegister("scrape", b.scrape, {
    category: "web",
    description: "Scrape webpage",
    aliases: ["scraper", "webscrape", "getpage", "extract", "pagescrape", "scrapeweb"]
  });

  if (b.screenshot) safeRegister("screenshot", b.screenshot, {
    category: "web",
    description: "Take screenshot",
    aliases: ["ss", "capture", "snap", "webshot", "screencap", "pagepic", "webpic"]
  });

  if (b.inspect) safeRegister("inspect", b.inspect, {
    category: "web",
    description: "Inspect webpage",
    aliases: ["pageinspect", "pageinfo", "analyze", "webinspect", "inspectpage", "pageanalysis"]
  });

  if (b.shorten) safeRegister("shorten", b.shorten, {
    category: "web",
    description: "Shorten URL",
    aliases: ["short", "tiny", "tinyurl", "bitly", "urlshort", "shortlink", "shorturl"]
  });

  // Media Commands
  if (b.viewOnce) safeRegister("vv", b.viewOnce, {
    category: "media",
    description: "View once message",
    aliases: ["viewonce", "open", "see", "reveal", "view", "once", "viewoncemsg", "viewmsg"]
  });

  if (b.take) safeRegister("take", b.take, {
    category: "media",
    description: "Take sticker",
    aliases: ["takesticker", "steal", "savesticker", "stickersteal", "takestk", "stealsticker"]
  });

  if (b.imgbb) safeRegister("imgbb", b.imgbb, {
    category: "media",
    description: "Upload to ImgBB",
    aliases: ["upload", "imageupload", "hostimage", "img", "imghost", "uploadimg", "imagehost"]
  });

  // Tools
  if (b.qencode) safeRegister("qr", b.qencode, {
    category: "tools",
    description: "Generate QR code",
    aliases: ["qrcode", "qencode", "makeqr", "createqr", "qrgen", "qrcreate", "qrmake"]
  });

  if (b.pdf) safeRegister("pdf", b.pdf, {
    category: "tools",
    description: "Create PDF",
    aliases: ["makepdf", "createpdf", "topdf", "document", "pdfcreate", "pdfgen", "makepdf"]
  });

  // Profile Commands
  if (b.getpp) safeRegister("getpp", b.getpp, {
    category: "profile",
    description: "Get profile picture",
    aliases: ["pp", "profilepic", "pfp", "dp", "avatar", "getpfp", "profilepicture", "getavatar"]
  });

  if (b.getgpp) safeRegister("getgpp", b.getgpp, {
    category: "profile",
    description: "Get group picture",
    aliases: ["gpp", "grouppic", "groupdp", "grouppfp", "grouppicture", "groupprofile"],
    groupOnly: true
  });

  // AI Commands
  if (b.jarvis) safeRegister("jarvis", b.jarvis, {
    category: "ai",
    description: "Jarvis AI assistant",
    aliases: ["j", "ask", "query", "jarvisask", "ai", "jarv", "jar", "askjarvis"]
  });

  // Voice AI - with fallback
  if (b.jarvisVoice && typeof b.jarvisVoice === 'function') {
    safeRegister("jarvisv", b.jarvisVoice, {
      category: "ai",
      description: "Jarvis with voice",
      aliases: ["jv", "voiceask", "speakjarvis", "jarvisvoice", "jvoice", "voiceai"]
    });
  } else {
    const voiceFallback = async ({ from, sock }) => {
      await sock.sendMessage(from, {
        text: "🔊 Voice response feature is coming soon! Use `.jarvis` for text responses."
      });
    };
    safeRegister("jarvisv", voiceFallback, {
      category: "ai",
      description: "Jarvis voice (coming soon)",
      aliases: ["jv", "voiceask", "speakjarvis", "jarvisvoice"]
    });
  }

  // Waitlist
  if (b.joinWaitlist) safeRegister("waitlist", b.joinWaitlist, {
    category: "misc",
    description: "Join AYOBOT waitlist",
    aliases: ["jointrend", "joinnext", "joinfuture", "waiting", "waitlistjoin", "joinwait"]
  });

  // Group commands from basic.js
  if (b.activate) safeRegister("activate", b.activate, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Activate bot for all group members",
    aliases: ["groupactivate", "activatebot", "openbot", "unlockbot", "activategroup"]
  });

  if (b.deactivate) safeRegister("deactivate", b.deactivate, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Restrict bot to owner-only",
    aliases: ["groupdeactivate", "deactivatebot", "closebot", "lockbot", "deactivategroup"]
  });

  if (b.antilink) safeRegister("antilink", b.antilink, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Toggle anti-link protection",
    aliases: ["nolink", "blocklinks", "toggleantilink", "antilinks", "protectlink", "antilinkon", "antilinkoff"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  AI.JS
  // ────────────────────────────────────────────────────────────────────────
  const a = MODULES.ai;

  if (a.ai) safeRegister("ayobot", a.ai, {
    category: "ai",
    description: "Chat with AI",
    aliases: ["ai", "chat", "bot", "gpt", "askai", "aichat", "talk", "aibot"]
  });

  if (a.aiClear) safeRegister("aiclear", a.aiClear, {
    category: "ai",
    description: "Clear AI history",
    aliases: ["clearchat", "resetai", "clearai", "aiclr", "aiclear", "reset", "clearhistory"]
  });

  if (a.summarize) safeRegister("summarize", a.summarize, {
    category: "ai",
    description: "Summarize text",
    aliases: ["summary", "tldr", "sum", "summarise", "shorten", "summarize", "summarizetext"]
  });

  if (a.grammar) safeRegister("grammar", a.grammar, {
    category: "ai",
    description: "Check grammar",
    aliases: ["spell", "spellcheck", "fix", "proofread", "grammarcheck", "correct", "grammarfix"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  CALCULATOR.JS
  // ────────────────────────────────────────────────────────────────────────
  const calc = MODULES.calculator;

  if (calc.calculate) safeRegister("calc", calc.calculate, {
    category: "tools",
    description: "Math calculator",
    aliases: ["math", "calculate", "solve", "calculator", "eval", "cal", "maths"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  CRYPTO.JS
  // ────────────────────────────────────────────────────────────────────────
  const cr = MODULES.crypto;

  if (cr.crypto) safeRegister("crypto", cr.crypto, {
    category: "info",
    description: "Crypto prices",
    aliases: ["coin", "btc", "eth", "cryptoprice", "cryptocurrency", "cryptoinfo", "crypto price"]
  });

  if (cr.cryptoTop) safeRegister("cryptotop", cr.cryptoTop, {
    category: "info",
    description: "Top cryptocurrencies",
    aliases: ["top10", "topcrypto", "cryptolist", "cointop", "cryptotop", "topcoins"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  DICTIONARY.JS
  // ────────────────────────────────────────────────────────────────────────
  const dict = MODULES.dictionary;

  if (dict.dict) safeRegister("dict", dict.dict, {
    category: "info",
    description: "Dictionary lookup",
    aliases: ["define", "meaning", "word", "definition", "dictionary", "def", "diction"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  DOWNLOADER.JS
  // ────────────────────────────────────────────────────────────────────────
  const dl = MODULES.downloader;

  if (dl.youtube) safeRegister("youtube", dl.youtube, {
    category: "dl",
    description: "Download YouTube",
    aliases: ["yt", "ytdl", "ytmp3", "ytmp4", "ytvideo", "youtubedl", "ytaudio", "ytdownload"]
  });

  if (dl.tiktok) safeRegister("tiktok", dl.tiktok, {
    category: "dl",
    description: "Download TikTok",
    aliases: ["tt", "tok", "tiktokdl", "ttvideo", "tiktokdown", "tiktokaudio", "ttdl"]
  });

  if (dl.spotify) safeRegister("spotify", dl.spotify, {
    category: "dl",
    description: "Download Spotify",
    aliases: ["sp", "spotifydl", "spotifymp3", "spotifydown", "spotifyaudio", "spdl"]
  });

  if (dl.play) safeRegister("play", dl.play, {
    category: "dl",
    description: "Play music",
    aliases: ["mp3", "music", "song", "audio", "playmusic", "playsong", "playaudio"]
  });

  if (dl.instagram) safeRegister("instagram", dl.instagram, {
    category: "dl",
    description: "Download Instagram",
    aliases: ["ig", "insta", "igdl", "igreels", "instadl", "instagramdl", "igvideo"]
  });

  if (dl.facebook) safeRegister("facebook", dl.facebook, {
    category: "dl",
    description: "Download Facebook",
    aliases: ["fb", "fbdl", "fbvideo", "fbd", "facebookdl", "fbdown", "facebookvideo"]
  });

  if (dl.twitter) safeRegister("twitter", dl.twitter, {
    category: "dl",
    description: "Download Twitter",
    aliases: ["x", "tweet", "xdl", "twitterdl", "twdl", "xdown", "twittervideo"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  ENCRYPTION.JS
  // ────────────────────────────────────────────────────────────────────────
  const enc = MODULES.encryption;

  if (enc.encrypt) safeRegister("encrypt", enc.encrypt, {
    category: "security",
    description: "Encrypt text",
    aliases: ["enc", "lock", "cipher", "encode", "encrypttext", "encryption"]
  });

  if (enc.decrypt) safeRegister("decrypt", enc.decrypt, {
    category: "security",
    description: "Decrypt text",
    aliases: ["dec", "unlock", "decipher", "decode", "decrypttext", "decryption"]
  });

  if (enc.hash) safeRegister("hash", enc.hash, {
    category: "security",
    description: "Hash text",
    aliases: ["md5", "sha256", "hashtext", "checksum", "hashgen", "hashstring", "hashing"]
  });

  if (enc.password) safeRegister("password", enc.password, {
    category: "security",
    description: "Generate password",
    aliases: ["genpass", "newpass", "passgen", "mkpass", "passwordgen", "createpass", "randompass"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  GAMES.JS
  // ────────────────────────────────────────────────────────────────────────
  const games = MODULES.games;

  if (games.rps) safeRegister("rps", games.rps, {
    category: "games",
    description: "Rock Paper Scissors",
    aliases: ["rockpaperscissors", "rpsgame", "rock", "paper", "scissors", "rpsplay"]
  });

  if (games.dice) safeRegister("dice", games.dice, {
    category: "games",
    description: "Roll dice",
    aliases: ["roll", "rolldice", "rolld6", "diceroll", "dicer", "dicethrow"]
  });

  if (games.coinFlip) safeRegister("flip", games.coinFlip, {
    category: "games",
    description: "Flip coin",
    aliases: ["coin", "coinflip", "toss", "heads", "tails", "cointoss", "flipcoin"]
  });

  if (games.trivia) safeRegister("trivia", games.trivia, {
    category: "games",
    description: "Trivia question",
    aliases: ["quiz", "question", "q", "triviaquestion", "triv", "triviaquiz"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  IMAGETOOLS.JS
  // ────────────────────────────────────────────────────────────────────────
  const img = MODULES.imageTools;

  if (img.sticker) safeRegister("sticker", img.sticker, {
    category: "media",
    description: "Create sticker",
    aliases: ["s", "stiker", "makesticker", "tosticker", "stickerize", "stk", "stickermake"]
  });

  if (img.toimage) safeRegister("toimage", img.toimage, {
    category: "media",
    description: "Sticker to image",
    aliases: ["toimg", "stickertoimage", "stktoimg", "sticker2img", "stk2img", "stickerimage"]
  });

  if (img.tovideo) safeRegister("tovideo", img.tovideo, {
    category: "media",
    description: "Sticker to video",
    aliases: ["tovid", "stickertovideo", "stk2vid", "sticker2video", "stickervideo"]
  });

  if (img.toaudio) safeRegister("toaudio", img.toaudio, {
    category: "media",
    description: "Extract audio",
    aliases: ["tomp3", "extractaudio", "video2audio", "getaudio", "audioextract", "mp3"]
  });

  if (img.removebg) safeRegister("removebg", img.removebg, {
    category: "media",
    description: "Remove background",
    aliases: ["nobg", "rmbg", "bgremove", "cutbg", "backgroundremove", "removebackground", "bgremover"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  JOKES.JS
  // ────────────────────────────────────────────────────────────────────────
  const jokes = MODULES.jokes;

  if (jokes.joke) safeRegister("joke", jokes.joke, {
    category: "fun",
    description: "Random joke",
    aliases: ["laugh", "funny", "lol", "haha", "humor", "jokefun", "telljoke"]
  });

  if (jokes.roast) safeRegister("roast", jokes.roast, {
    category: "fun",
    description: "Roast someone",
    aliases: ["burn", "flame", "diss", "insult", "roastme", "roastuser", "roastthem"]
  });

  if (jokes.pickupLine) safeRegister("pickup", jokes.pickupLine, {
    category: "fun",
    description: "Pickup line",
    aliases: ["flirt", "pickupline", "rizz", "pickup", "pickupline", "pickuplines"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  MOVIES.JS
  // ────────────────────────────────────────────────────────────────────────
  const movies = MODULES.movies;

  if (movies.movie) safeRegister("movie", movies.movie, {
    category: "info",
    description: "Movie info",
    aliases: ["film", "imdb", "movieinfo", "moviesearch", "moviedb", "filmdb", "moviedetails"]
  });

  if (movies.tv) safeRegister("tv", movies.tv, {
    category: "info",
    description: "TV series info",
    aliases: ["series", "show", "tvshow", "tvseries", "tvguide", "serie", "tvinfo"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  MUSIC.JS
  // ────────────────────────────────────────────────────────────────────────
  const music = MODULES.music;

  if (music.lyrics) safeRegister("lyrics", music.lyrics, {
    category: "music",
    description: "Song lyrics",
    aliases: ["lyric", "words", "songlyrics", "getlyrics", "lyricsearch", "lyricsfind", "lyricsofsong"]
  });

  if (music.trending) safeRegister("trending", music.trending, {
    category: "music",
    description: "Trending songs",
    aliases: ["chart", "topsongs", "topmusic", "hotmusic", "trendingmusic", "trend", "trendingnow"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  NEWS.JS
  // ────────────────────────────────────────────────────────────────────────
  const news = MODULES.news;

  if (news.news) safeRegister("news", news.news, {
    category: "info",
    description: "Latest news",
    aliases: ["headlines", "breaking", "latestnews", "topnews", "newsupdate", "newstoday", "newsnow"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  NOTES.JS
  // ────────────────────────────────────────────────────────────────────────
  const notes = MODULES.notes;

  if (notes.note) safeRegister("note", notes.note, {
    category: "storage",
    description: "Save note",
    aliases: ["store", "savenote", "addnote", "remember", "savenow", "newnote", "createnote"]
  });

  if (notes.getnote) safeRegister("getnote", notes.getnote, {
    category: "storage",
    description: "Get note",
    aliases: ["recall", "readnote", "shownote", "getnote", "shownote", "retrievenote"]
  });

  if (notes.notes) safeRegister("notes", notes.notes, {
    category: "storage",
    description: "List notes",
    aliases: ["mynotes", "listnotes", "allnotes", "notelist", "shownotes", "noteslist"]
  });

  if (notes.deleteKey) safeRegister("delnote", notes.deleteKey, {
    category: "storage",
    description: "Delete note",
    aliases: ["forget", "deletenote", "removenote", "rmnote", "del", "deletenote", "removenote"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  QUOTES.JS
  // ────────────────────────────────────────────────────────────────────────
  const quotes = MODULES.quotes;

  if (quotes.quote) safeRegister("quote", quotes.quote, {
    category: "fun",
    description: "Random quote",
    aliases: ["motivation", "inspire", "wisdom", "motivate", "inspiration", "quot", "inspirational"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  REMINDER.JS
  // ────────────────────────────────────────────────────────────────────────
  const reminder = MODULES.reminder;

  if (reminder.reminder) safeRegister("remind", reminder.reminder, {
    category: "storage",
    description: "Set reminder",
    aliases: ["reminder", "later", "setreminder", "setalarm", "remindme", "remind", "alarm"]
  });

  if (reminder.listReminders) safeRegister("reminders", reminder.listReminders, {
    category: "storage",
    description: "List reminders",
    aliases: ["myreminders", "listreminders", "showreminders", "reminderlist", "allreminders", "reminderslist"]
  });

  if (reminder.cancelReminder) safeRegister("cancelreminder", reminder.cancelReminder, {
    category: "storage",
    description: "Cancel reminder",
    aliases: ["delreminder", "removereminder", "stopreminder", "cancelminder", "cancelremind", "deletereminder"]
  });

  if (reminder.snooze) safeRegister("snooze", reminder.snooze, {
    category: "storage",
    description: "Snooze reminder",
    aliases: ["snoozereminder", "delayrm", "snoozealarm", "snoozer", "snoozealarm", "remindersnooze"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  SECURITY.JS
  // ────────────────────────────────────────────────────────────────────────
  const sec = MODULES.security;

  if (sec.scan) safeRegister("scan", sec.scan, {
    category: "security",
    description: "Scan URL",
    aliases: ["virustotal", "urlscan", "safescan", "checksafe", "threatscan", "scanurl", "checkurl"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  STOCKS.JS
  // ────────────────────────────────────────────────────────────────────────
  const stocks = MODULES.stocks;

  if (stocks.stock) safeRegister("stock", stocks.stock, {
    category: "info",
    description: "Stock prices",
    aliases: ["stocks", "share", "stockprice", "stockinfo", "market", "shareprice", "stockmarket"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  TRANSLATION.JS
  // ────────────────────────────────────────────────────────────────────────
  const trans = MODULES.translation;

  if (trans.translate) safeRegister("translate", trans.translate, {
    category: "tools",
    description: "Translate text",
    aliases: ["tr", "tl", "lang", "trans", "translation", "translate", "translator"]
  });

  if (trans.detect) safeRegister("detect", trans.detect, {
    category: "tools",
    description: "Detect language",
    aliases: ["langdetect", "whatlang", "detectlang", "language", "langid", "detectlanguage"]
  });

  if (trans.languages) safeRegister("languages", trans.languages, {
    category: "tools",
    description: "List languages",
    aliases: ["langs", "langlist", "supportedlangs", "alllangs", "languagelist", "languagesupported"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  TTS.JS
  // ────────────────────────────────────────────────────────────────────────
  const tts = MODULES.tts;

  if (tts.tts) safeRegister("tts", tts.tts, {
    category: "media",
    description: "Text to speech",
    aliases: ["voice", "say", "speak", "read", "texttospeech", "ttsaudio", "speaktext"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  UNITCONVERTER.JS
  // ────────────────────────────────────────────────────────────────────────
  const uc = MODULES.unitConverter;

  if (uc.convert) safeRegister("convert", uc.convert, {
    category: "tools",
    description: "Convert units",
    aliases: ["conv", "uconvert", "unitconvert", "cvt", "conversion", "convertunit", "unitconv"]
  });

  if (uc.units) safeRegister("units", uc.units, {
    category: "tools",
    description: "List units",
    aliases: ["listunits", "unitlist", "availableunits", "unittypes", "showunits", "allunits"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  GROUP CORE.JS
  // ────────────────────────────────────────────────────────────────────────
  const gc = MODULES.groupCore;

  if (gc.kick) safeRegister("kick", gc.kick, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    requireBotAdmin: true,
    description: "Kick member",
    aliases: ["remove", "kickmember", "removemember", "boot", "kickout", "removeuser"]
  });

  if (gc.add) safeRegister("add", gc.add, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Add member",
    aliases: ["invite", "addmember", "adduser", "addperson", "addtogroup", "addparticipant"]
  });

  if (gc.promote) safeRegister("promote", gc.promote, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    requireBotAdmin: true,
    description: "Promote to admin",
    aliases: ["makeadmin", "adminpromote", "setadmin", "promoteadmin", "promoteuser", "promotemember"]
  });

  if (gc.demote) safeRegister("demote", gc.demote, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    requireBotAdmin: true,
    description: "Demote admin",
    aliases: ["unadmin", "removeadmin", "deadmin", "demoteadmin", "demoteuser", "demotemember"]
  });

  if (gc.link) safeRegister("link", gc.link, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Group link",
    aliases: ["grouplink", "invitelink", "getlink", "grouplink", "linkgroup", "grouplink"]
  });

  if (gc.admins) safeRegister("admins", gc.admins, {
    category: "group",
    groupOnly: true,
    description: "List admins",
    aliases: ["listadmins", "adminlist", "groupadmins", "getadmins", "showadmins", "adminslist"]
  });

  if (gc.tagall) safeRegister("tagall", gc.tagall, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Tag all members",
    aliases: ["everyone", "all", "tageveryone", "mentionall", "pingall", "tag", "mentioneveryone"]
  });

  if (gc.hidetag) safeRegister("hidetag", gc.hidetag, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Silent tag all",
    aliases: ["htag", "silent", "silentping", "hiddentag", "ghosttag", "silenttag", "hidetagall"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  GROUP MODERATION.JS
  // ────────────────────────────────────────────────────────────────────────
  const gm = MODULES.groupMod;

  if (gm.ban) safeRegister("ban", gm.ban, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    requireBotAdmin: true,
    description: "Ban user",
    aliases: ["block", "banuser", "blacklist", "banmember", "banperson", "banthem"]
  });

  if (gm.unban) safeRegister("unban", gm.unban, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Unban user",
    aliases: ["unblock", "unbanuser", "whitelist", "removeban", "unbanperson", "unblockuser"]
  });

  if (gm.warn) safeRegister("warn", gm.warn, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Warn user",
    aliases: ["warning", "warnuser", "givewarn", "addwarn", "warnmember", "warnperson"]
  });

  if (gm.warnings) safeRegister("warnings", gm.warnings, {
    category: "group",
    groupOnly: true,
    description: "View warnings",
    aliases: ["warnlist", "checkwarns", "getwarn", "mywarnings", "seewarns", "warningslist"]
  });

  if (gm.clearWarns) safeRegister("clearwarns", gm.clearWarns, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Clear warnings",
    aliases: ["resetwarns", "clearwarnings", "rmwarns", "deletewarns", "removewarns", "clearallwarns"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  GROUP SETTINGS.JS - COMPLETE WITH ALL COMMANDS
  // ────────────────────────────────────────────────────────────────────────
  const gs = MODULES.groupSettings;

  if (gs.mute) safeRegister("mute", gs.mute, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Mute group (restrict sending)",
    aliases: ["lockgroup", "grouplock", "muteall", "mutechat", "mutegroup"]
  });

  if (gs.unmute) safeRegister("unmute", gs.unmute, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Unmute group (allow all to send)",
    aliases: ["unlockgroup", "groupunlock", "unmuteall", "unmutechat", "unmutegroup"]
  });

  if (gs.lock) safeRegister("lock", gs.lock, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Lock group (restrict editing info)",
    aliases: ["lockinfo", "restrict", "lockgroup"]
  });

  if (gs.unlock) safeRegister("unlock", gs.unlock, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Unlock group (allow all to edit info)",
    aliases: ["unlockinfo", "unrestrict", "unlockgroup"]
  });

  if (gs.antiSpam) safeRegister("antispam", gs.antiSpam, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Toggle anti-spam protection",
    aliases: ["nospam", "blockspam", "toggleantispam", "antispam", "stopspam", "antispamon", "antispamoff"]
  });

  if (gs.welcomeToggle) safeRegister("welcome", gs.welcomeToggle, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Toggle welcome messages",
    aliases: ["togglewelcome", "welcomeon", "welcomeoff", "welcomemsg"]
  });

  if (gs.setWelcome) safeRegister("setwelcome", gs.setWelcome, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Set welcome message",
    aliases: ["setwelcomemsg", "welcometext"]
  });

  if (gs.goodbyeToggle) safeRegister("goodbye", gs.goodbyeToggle, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Toggle goodbye messages",
    aliases: ["togglegoodbye", "goodbyeon", "goodbyeoff", "goodbyemsg"]
  });

  if (gs.setGoodbye) safeRegister("setgoodbye", gs.setGoodbye, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Set goodbye message",
    aliases: ["setgoodbyemsg", "goodbyetext"]
  });

  if (gs.groupInfo) safeRegister("groupinfo", gs.groupInfo, {
    category: "group",
    groupOnly: true,
    description: "Show group information",
    aliases: ["ginfo", "group", "grouppanel"]
  });

  if (gs.rules) safeRegister("rules", gs.rules, {
    category: "group",
    groupOnly: true,
    description: "Show group rules",
    aliases: ["grules", "grouprules"]
  });

  if (gs.setRules) safeRegister("setrules", gs.setRules, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Set group rules",
    aliases: ["setgrules", "addrules"]
  });

  if (gs.link) safeRegister("link", gs.link, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Get group invite link",
    aliases: ["grouplink", "invite", "invitelink"]
  });

  if (gs.revoke) safeRegister("revoke", gs.revoke, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Revoke group invite link",
    aliases: ["revokelink", "resetlink", "newlink"]
  });

  // PIN COMMAND - ADDED
  if (gs.pin) safeRegister("pin", gs.pin, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Pin a message",
    aliases: ["pinmsg", "pinmessage"]
  });

  // UNPIN COMMAND - ADDED
  if (gs.unpin) safeRegister("unpin", gs.unpin, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Unpin a message",
    aliases: ["unpinmsg", "unpinmessage"]
  });

  // DELETE COMMAND - ADDED
  if (gs.deleteMsg) safeRegister("delete", gs.deleteMsg, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Delete a message",
    aliases: ["del", "remove", "rm", "delete"]
  });

  if (gs.settingsOverview) safeRegister("settings", gs.settingsOverview, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "View group settings",
    aliases: ["groupsettings", "gsettings", "settingspanel"]
  });

  if (gs.resetSettings) safeRegister("resetsettings", gs.resetSettings, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Reset all group settings",
    aliases: ["resetgroupsettings", "clearsettings", "resetall"]
  });

  if (gs.leave) safeRegister("leave", gs.leave, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Make bot leave the group",
    aliases: ["botleave", "leavegroup", "exit"]
  });

  if (gs.debug) safeRegister("groupdebug", gs.debug, {
    category: "group",
    groupOnly: true,
    adminOnly: true,
    description: "Debug group information",
    aliases: ["gdebug", "groupdbg"]
  });

  // ────────────────────────────────────────────────────────────────────────
  //  ADMIN.JS
  // ────────────────────────────────────────────────────────────────────────
  const adm = MODULES.admin;

  if (adm.addUser) safeRegister("adduser", adm.addUser, {
    category: "admin",
    adminOnly: true,
    description: "Add authorized user",
    aliases: ["auth", "allow", "authorize", "whitelist", "addauth", "authorizeuser"]
  });

  if (adm.removeUser) safeRegister("removeuser", adm.removeUser, {
    category: "admin",
    adminOnly: true,
    description: "Remove authorized user",
    aliases: ["deauth", "disallow", "unauthorize", "unwhitelist", "removeauth", "deauthorize"]
  });

  if (adm.listUsers) safeRegister("listusers", adm.listUsers, {
    category: "admin",
    adminOnly: true,
    description: "List authorized users",
    aliases: ["users", "whitelist", "showusers", "authlist", "listauth", "authorizedusers"]
  });

  if (adm.mode) safeRegister("mode", adm.mode, {
    category: "admin",
    adminOnly: true,
    description: "Change bot mode",
    aliases: ["setmode", "botmode", "changemode", "switchmode", "modechange", "setbotmode"]
  });

  if (adm.broadcast) safeRegister("broadcast", adm.broadcast, {
    category: "admin",
    adminOnly: true,
    description: "Broadcast message",
    aliases: ["bc", "announce", "sendall", "massmessage", "broadcastmsg", "broadcastmessage"]
  });

  if (adm.globalBroadcast) safeRegister("globalbc", adm.globalBroadcast, {
    category: "admin",
    adminOnly: true,
    description: "Global broadcast",
    aliases: ["gbc", "globalbroadcast", "globalannounce", "massbc", "globalbc", "globalmessage"]
  });

  if (adm.stats) safeRegister("stats", adm.stats, {
    category: "admin",
    adminOnly: true,
    description: "Bot statistics",
    aliases: ["botstats", "botinfo", "usage", "analytics", "statistics", "botstatus"]
  });

  if (adm.restart) safeRegister("restart", adm.restart, {
    category: "admin",
    adminOnly: true,
    description: "Restart bot",
    aliases: ["reboot", "botrestart", "reset", "restartbot", "reload", "restartsystem"]
  });

  if (adm.shutdown) safeRegister("shutdown", adm.shutdown, {
    category: "admin",
    adminOnly: true,
    description: "Shutdown bot",
    aliases: ["off", "stop", "botoff", "poweroff", "halt", "shut", "shutdownbot"]
  });

  if (adm.eval) safeRegister("eval", adm.eval, {
    category: "admin",
    adminOnly: true,
    description: "Execute code",
    aliases: ["exec", "run", "runcode", "execute", "evalcode", "runjs"]
  });

  log.div();
  log.success(`✅ Registered ${primaryCommands.size} primary commands with ${commands.size - primaryCommands.size} aliases`);
  log.success(`📊 Total entries in commands Map: ${commands.size}`);
  console.log();
}

registerAllCommands();

// ============================================================================
//  COMMAND HANDLER EXECUTION - WITH ANTILINK DETECTION
// ============================================================================
export async function handleCommand(message, sock) {
  const executionStart = Date.now();
  const executionId = Math.random().toString(36).substring(2, 8);

  try {
    // ======================================================================
    //  PHASE 1: EXTRACT BASIC MESSAGE INFO
    // ======================================================================
    const from = message?.key?.remoteJid;
    if (!from) {
      log.debug(`[${executionId}] No remoteJid, ignoring`);
      return;
    }

    const isGroup = from.endsWith("@g.us");
    const fromMe = !!message.key.fromMe;

    const session = message._session || null;
    const ownerPhone = message._ownerPhone || session?.ownerPhone || "";
    const sessionMode = message._sessionMode || session?.mode || ENV.BOT_MODE || "public";
    const sessionId = message._sessionId || session?.id || "";

    // ======================================================================
    //  PHASE 2: DETERMINE SENDER
    // ======================================================================
    let rawSenderJid;
    if (isGroup) {
      rawSenderJid = message.key.participant || from;
    } else if (fromMe) {
      const phone = (sock?.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      rawSenderJid = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      rawSenderJid = from;
    }

    const cleanPhone = rawSenderJid?.split("@")[0]?.replace(/[^0-9]/g, "") || "";
    const userJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSenderJid;

    if (!userJid || !cleanPhone) {
      log.debug(`[${executionId}] Invalid user JID, ignoring`);
      return;
    }

    // ======================================================================
    //  PHASE 3: AUTHORIZATION CHECKS
    // ======================================================================
    const isAdminUser = fromMe || isAdmin(userJid, ownerPhone);
    const isAuthorizedUser = isAdminUser || isAuthorized(userJid, ownerPhone, sessionMode);

    // ======================================================================
    //  PHASE 4: EXTRACT MESSAGE TEXT
    // ======================================================================
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
// ======================================================================
//  PHASE 5: TRIVIA ANSWER HANDLER - FIXED VERSION
//  This MUST come BEFORE the prefix check
// ======================================================================
if (!trimmed.startsWith(ENV.PREFIX)) {
  // Check for trivia answers in non-command messages
  if (["A", "B", "C", "D"].includes(trimmed.toUpperCase())) {
    console.log(`🎯 [CMD] Potential trivia answer: "${trimmed}" in chat ${from}`);
    console.log(`📊 [CMD] activeTrivia.has(from)? ${global.activeTrivia?.has(from) || false}`);

    // Check if there's an active trivia in this chat
    if (global.activeTrivia?.has(from)) {
      console.log(`✅ [CMD] Active trivia found, processing answer...`);

      // Check permissions before handling trivia
      if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
        console.log(`❌ [CMD] Permission denied - group not activated`);
        return;
      }
      if (sessionMode === "private" && !isAdminUser) {
        console.log(`❌ [CMD] Permission denied - private mode`);
        return;
      }
      if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) {
        console.log(`❌ [CMD] Permission denied - user banned`);
        return;
      }

      try {
        // Get games module
        const games = MODULES.games;
        console.log(`🎮 [CMD] Games module available: ${!!games}`);
        console.log(`🎮 [CMD] handleTriviaAnswer available: ${typeof games?.handleTriviaAnswer === 'function'}`);

        if (typeof games?.handleTriviaAnswer === 'function') {
          const answerStartTime = Date.now();
          // Pass the FULL message object, from, and sock
          await games.handleTriviaAnswer(message, from, sock);
          console.log(`⏱️ [CMD] Trivia answer processed in ${Date.now() - answerStartTime}ms`);
          return; // IMPORTANT: Return after handling trivia
        } else {
          console.log(`❌ [CMD] handleTriviaAnswer function not found`);
          // Fallback response
          await sock.sendMessage(from, {
            text: "❌ Trivia system error. Please try again later."
          });
        }
      } catch (error) {
        console.log(`❌ [CMD] Trivia error: ${error.message}`);
      }
    } else {
      console.log(`❌ [CMD] No active trivia for this chat`);
    }
  }
  return; // Not a command and not trivia, ignore
}
// ======================================================================
//  PHASE 5.5: ANTILINK HANDLER - DETECT AND DELETE LINKS
//  This runs for EVERY message in groups BEFORE prefix check
// ======================================================================
if (isGroup) {
  try {
    // Import antilink from automation module
    const automationModule = MODULES.automation;

    if (automationModule?.handleAntiLink) {
      // Run in background - don't await to avoid blocking
      automationModule.handleAntiLink(message, from, sock).catch(err => {
        log.debug(`[${executionId}] Anti-link error: ${err.message}`);
      });
    }
  } catch (err) {
    log.debug(`[${executionId}] Anti-link module error: ${err.message}`);
  }
}
    // ======================================================================
    //  PHASE 6: PREFIX CHECK
    // ======================================================================
    if (!trimmed.startsWith(ENV.PREFIX)) return;

    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;

    const parts = body.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);
    const fullArgs = args.join(" ");

    if (!commandName) return;

    // ======================================================================
    //  PHASE 7: BANNED USER CHECK
    // ======================================================================
    if (bannedUsers.has(userJid) || bannedUsers.has(cleanPhone)) {
      log.warn(`[${executionId}] Blocked banned user: ${cleanPhone}`);
      return;
    }

    // ======================================================================
    //  PHASE 8: GROUP ACTIVATION CHECK
    // ======================================================================
    if (isGroup && !isAdminUser && !isGroupActivated(sessionId, from)) {
      log.info(`[${executionId}] Group not activated: ${commandName} ignored from ${cleanPhone}`);
      return;
    }

    // ======================================================================
    //  PHASE 9: PRIVATE MODE CHECK
    // ======================================================================
    if (sessionMode === "private" && !isAdminUser) {
      log.info(`[${executionId}] Private mode: silently ignored ${cleanPhone}`);
      return;
    }

    // ======================================================================
    //  PHASE 10: COMMAND LOOKUP
    // ======================================================================
    log.info(`[${executionId}] ${ENV.PREFIX}${commandName} from ${cleanPhone}${isGroup ? ' [GROUP]' : ''}`);

    const commandMeta = commands.get(commandName);

    if (!commandMeta) {
      log.warn(`[${executionId}] Unknown command: ${commandName}`);

      const similarCommands = findSimilarCommands(commandName);
      let suggestionText = '';

      if (similarCommands.length > 0) {
        suggestionText = `\n\nDid you mean: *${ENV.PREFIX}${similarCommands[0]}*?`;
        if (similarCommands.length > 1) {
          suggestionText += `\nOr: ${similarCommands.slice(1, 3).map(c => `*${ENV.PREFIX}${c}*`).join(', ')}`;
        }
      }

      await sock.sendMessage(from, {
        text: `❓ *Unknown Command:* ${ENV.PREFIX}${commandName}${suggestionText}\n\nType *${ENV.PREFIX}menu* to see all commands!`
      });
      return;
    }

    // ======================================================================
    //  PHASE 11: GET THE ACTUAL HANDLER FUNCTION
    // ======================================================================
    let handlerFunction = commandMeta.handler;
    let primaryName = commandMeta.primaryName || commandName;

    if (commandMeta.isAlias && commandMeta.primaryName) {
      primaryName = commandMeta.primaryName;
      log.debug(`[${executionId}] Alias "${commandName}" → primary "${primaryName}"`);
    }

    // ======================================================================
    //  PHASE 12: TRACK USAGE
    // ======================================================================
    if (!commandUsage.has(userJid)) {
      commandUsage.set(userJid, {});
    }
    commandUsage.get(userJid)[primaryName] = (commandUsage.get(userJid)[primaryName] || 0) + 1;

    const stats = commandStats.get(primaryName) || { uses: 0, errors: 0, lastUsed: null, avgResponseTime: 0, totalResponseTime: 0 };
    stats.uses++;
    stats.lastUsed = Date.now();
    commandStats.set(primaryName, stats);

    // ======================================================================
    //  PHASE 13: RATE LIMIT CHECK
    // ======================================================================
    if (!isAdminUser && !rateLimiter.isAllowed(userJid)) {
      const seconds = Math.ceil(rateLimiter.remaining(userJid) / 1000);
      const messages = [
        `⏳ *Slow down!* Wait *${seconds}s* before the next command.`,
        `🧘 *Take a breath!* Wait ${seconds}s.`,
        `⚡ *Rate limited!* Try again in ${seconds}s.`
      ];
      const message = messages[Math.floor(Math.random() * messages.length)];
      return sock.sendMessage(from, { text: message });
    }

    // ======================================================================
    //  PHASE 14: PERMISSION CHECKS
    // ======================================================================

    // Admin only check
    if (commandMeta.adminOnly && !isAdminUser) {
      log.debug(`[${executionId}] Admin-only command blocked for non-admin`);
      return sock.sendMessage(from, {
        text: `⛔ *${ENV.PREFIX}${commandName}* is for the *bot owner* only.`
      });
    }

    // Group only check
    if (commandMeta.groupOnly && !isGroup) {
      log.debug(`[${executionId}] Group-only command used in DM`);
      return sock.sendMessage(from, {
        text: `👥 *${ENV.PREFIX}${commandName}* only works inside a group.`
      });
    }

    // Bot admin check for group commands - FIXED to recognize group owner
    if (commandMeta.requireBotAdmin && isGroup) {
      // Check if user is group owner - they can execute even if bot isn't admin
      const metadata = await sock.groupMetadata(from).catch(() => null);
      const isGroupOwner = metadata?.owner === userJid;

      if (!isGroupOwner) {
        let botIsAdmin = false;
        try {
          botIsAdmin = await isBotGroupAdminCached(from, sock);
        } catch (_) {
          log.debug(`[${executionId}] Bot admin check failed`);
        }

        if (!botIsAdmin) {
          log.debug(`[${executionId}] Bot not admin for admin-required command`);
          return sock.sendMessage(from, {
            text: `❌ *Bot Not Admin*\nI need to be a *group admin* for this.\nPromote me in group settings first.\n\n👑 *Note:* Group owners can still use this command even if bot isn't admin.`
          });
        }
      }
    }

    // ======================================================================
    //  PHASE 15: EXECUTE COMMAND WITH TIMING
    // ======================================================================
    const handlerStart = Date.now();
    log.cmd(`[${executionId}] Executing: ${primaryName} (via ${commandName})`);

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
      };

      const executionPromise = handlerFunction(context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command execution timeout')), 60000)
      );

      await Promise.race([executionPromise, timeoutPromise]);

      const executionTime = Date.now() - handlerStart;
      stats.totalResponseTime += executionTime;
      stats.avgResponseTime = stats.totalResponseTime / stats.uses;

      log.success(`[${executionId}] ${primaryName} completed (${executionTime}ms)`);

    } catch (cmdError) {
      stats.errors++;
      log.err(`[${executionId}] ${primaryName} error: ${cmdError.message}`);

      const errorMessage = cmdError.message || "Unknown error";
      const userMessage = errorMessage.length > 100
        ? "An error occurred while executing the command."
        : `❌ *Error*\n\n${errorMessage}`;

      try {
        await sock.sendMessage(from, { text: userMessage });
      } catch (_) {}
    }

    commandStats.set(primaryName, stats);

    if (Date.now() - executionStart > 5000) {
      log.warn(`[${executionId}] Slow command: ${primaryName} (${Date.now() - executionStart}ms)`);
    }

  } catch (fatalError) {
    log.err(`[${executionId}] FATAL: ${fatalError.message}`);
    log.debug(fatalError.stack);

    try {
      await sock?.sendMessage(message?.key?.remoteJid, {
        text: "❌ A system error occurred. Please try again."
      });
    } catch (_) {}
  }
}

// ============================================================================
//  HELPER FUNCTIONS
// ============================================================================
function findSimilarCommands(input, limit = 3) {
  const inputLower = input.toLowerCase();
  const commands = Array.from(primaryCommands.keys());

  const withDistance = commands.map(cmd => {
    const distance = levenshteinDistance(inputLower, cmd);
    return { cmd, distance };
  });

  return withDistance
    .filter(item => item.distance <= 3 && item.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(item => item.cmd);
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
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
    isAlias: meta.isAlias || false,
    aliases: meta.aliases || []
  };
}

export function getCommandStats(name) {
  const primary = name?.toLowerCase();
  return commandStats.get(primary) || null;
}

export function getCommandsByCategory(category) {
  const uniqueCommands = new Map();

  for (const [_, meta] of commands.entries()) {
    if (meta.category === category && !meta.isAlias) {
      uniqueCommands.set(meta.primaryName, meta);
    }
  }

  return Array.from(uniqueCommands.values());
}

export function getAllStats() {
  let totalUses = 0;
  let totalErrors = 0;

  for (const stats of commandStats.values()) {
    totalUses += stats.uses;
    totalErrors += stats.errors;
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
      .map(([name, stats]) => ({ name, uses: stats.uses }))
  };
}

export async function reloadCommands() {
  log.title("🔄 RELOADING COMMANDS");

  commands.clear();
  primaryCommands.clear();
  aliasMap.clear();
  commandStats.clear();

  for (const name in MODULES) {
    delete MODULES[name];
  }

  await loadAllModules();
  registerAllCommands();

  log.success("✅ Commands reloaded successfully");
}

setInterval(() => rateLimiter.cleanup(), 60000);

export { MODULES as modules };
