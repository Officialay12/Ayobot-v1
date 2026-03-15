// handlers/commandHandler.js — AYOBOT v1 | Created by AYOCODES

import {
  autoReplyEnabled,
  commandUsage,
  deletedMessages,
  ENV,
  groupSettings,
  isAdmin,
  isAuthorized,
  normalizePhone,
  userConversations,
  userCooldown,
} from "../index.js";

import {
  containsLink,
  extractText,
  getRateLimitMessage,
  isBotGroupAdminCached,
  isRateLimited,
  isSpam,
} from "../utils/validators.js";

import {
  formatError,
  formatGroupError,
  formatInfo,
} from "../utils/formatters.js";
import { handleRuleViolation } from "./ruleHandler.js";

// ========== TERMINAL HELPERS ==========
const log = {
  ok: (m) => console.log(`✅ ${m}`),
  err: (m) => console.log(`❌ ${m}`),
  warn: (m) => console.log(`⚠️  ${m}`),
  info: (m) => console.log(`ℹ️  ${m}`),
  cmd: (m) => console.log(`⚡ ${m}`),
};

// ========== IMPORT ALL MODULES ==========
console.log("\n📦 LOADING ALL MODULES...");

let admin = {};
try {
  const mod = await import("../commands/group/admin.js");
  admin = mod;
  log.ok("Admin module loaded");
} catch (e) {
  log.warn(`Admin module not loaded: ${e.message.substring(0, 80)}`);
}

let basic = {};
try {
  const mod = await import("../commands/group/basic.js");
  basic = mod;
  log.ok("Basic module loaded");
} catch (e) {
  log.warn(`Basic module not loaded: ${e.message.substring(0, 80)}`);
}

let ai = {};
try {
  const mod = await import("../features/ai.js");
  ai = mod;
  log.ok("AI module loaded");
} catch (e) {
  log.warn(`AI module not loaded: ${e.message.substring(0, 80)}`);
}

let calculator = {};
try {
  const mod = await import("../features/calculator.js");
  calculator = mod;
  log.ok("Calculator module loaded");
} catch (e) {
  log.warn(`Calculator module not loaded: ${e.message.substring(0, 80)}`);
}

let crypto = {};
try {
  const mod = await import("../features/crypto.js");
  crypto = mod;
  log.ok("Crypto module loaded");
} catch (e) {
  log.warn(`Crypto module not loaded: ${e.message.substring(0, 80)}`);
}

let dictionary = {};
try {
  const mod = await import("../features/dictionary.js");
  dictionary = mod;
  log.ok("Dictionary module loaded");
} catch (e) {
  log.warn(`Dictionary module not loaded: ${e.message.substring(0, 80)}`);
}

let downloader = {};
try {
  const mod = await import("../features/downloader.js");
  downloader = mod;
  log.ok("Downloader module loaded");
} catch (e) {
  log.warn(`Downloader module not loaded: ${e.message.substring(0, 80)}`);
}

let encryption = {};
try {
  const mod = await import("../features/encryption.js");
  encryption = mod;
  log.ok("Encryption module loaded");
} catch (e) {
  log.warn(`Encryption module not loaded: ${e.message.substring(0, 80)}`);
}

let games = {};
try {
  const mod = await import("../features/games.js");
  games = mod;
  log.ok("Games module loaded");
} catch (e) {
  log.warn(`Games module not loaded: ${e.message.substring(0, 80)}`);
}

let imageTools = {};
try {
  const mod = await import("../features/imageTools.js");
  imageTools = mod;
  log.ok("ImageTools module loaded");
} catch (e) {
  log.warn(`ImageTools module not loaded: ${e.message.substring(0, 80)}`);
}

let ipLookup = {};
try {
  const mod = await import("../features/ipLookup.js");
  ipLookup = mod;
  log.ok("IPLookup module loaded");
} catch (e) {
  log.warn(`IPLookup module not loaded: ${e.message.substring(0, 80)}`);
}

let jokes = {};
try {
  const mod = await import("../features/jokes.js");
  jokes = mod;
  log.ok("Jokes module loaded");
} catch (e) {
  log.warn(`Jokes module not loaded: ${e.message.substring(0, 80)}`);
}

let movies = {};
try {
  const mod = await import("../features/movies.js");
  movies = mod;
  log.ok("Movies module loaded");
} catch (e) {
  log.warn(`Movies module not loaded: ${e.message.substring(0, 80)}`);
}

let music = {};
try {
  const mod = await import("../features/music.js");
  music = mod;
  log.ok("Music module loaded");
} catch (e) {
  log.warn(`Music module not loaded: ${e.message.substring(0, 80)}`);
}

let news = {};
try {
  const mod = await import("../features/news.js");
  news = mod;
  log.ok("News module loaded");
} catch (e) {
  log.warn(`News module not loaded: ${e.message.substring(0, 80)}`);
}

let notes = {};
try {
  const mod = await import("../features/notes.js");
  notes = mod;
  log.ok("Notes module loaded");
} catch (e) {
  log.warn(`Notes module not loaded: ${e.message.substring(0, 80)}`);
}

let qr = {};
try {
  const mod = await import("../features/qr.js");
  qr = mod;
  log.ok("QR module loaded");
} catch (e) {
  log.warn(`QR module not loaded: ${e.message.substring(0, 80)}`);
}

let quotes = {};
try {
  const mod = await import("../features/quotes.js");
  quotes = mod;
  log.ok("Quotes module loaded");
} catch (e) {
  log.warn(`Quotes module not loaded: ${e.message.substring(0, 80)}`);
}

let reminder = {};
try {
  const mod = await import("../features/reminder.js");
  reminder = mod;
  log.ok("Reminder module loaded");
} catch (e) {
  log.warn(`Reminder module not loaded: ${e.message.substring(0, 80)}`);
}

let security = {};
try {
  const mod = await import("../features/security.js");
  security = mod;
  log.ok("Security module loaded");
} catch (e) {
  log.warn(`Security module not loaded: ${e.message.substring(0, 80)}`);
}

let stocks = {};
try {
  const mod = await import("../features/stocks.js");
  stocks = mod;
  log.ok("Stocks module loaded");
} catch (e) {
  log.warn(`Stocks module not loaded: ${e.message.substring(0, 80)}`);
}

let translation = {};
try {
  const mod = await import("../features/translation.js");
  translation = mod;
  log.ok("Translation module loaded");
} catch (e) {
  log.warn(`Translation module not loaded: ${e.message.substring(0, 80)}`);
}

let tts = {};
try {
  const mod = await import("../features/tts.js");
  tts = mod;
  log.ok("TTS module loaded");
} catch (e) {
  log.warn(`TTS module not loaded: ${e.message.substring(0, 80)}`);
}

let unitConverter = {};
try {
  const mod = await import("../features/unitConverter.js");
  unitConverter = mod;
  log.ok("UnitConverter module loaded");
} catch (e) {
  log.warn(`UnitConverter module not loaded: ${e.message.substring(0, 80)}`);
}

let group = { core: null, moderation: null, settings: null };
try {
  group.core = await import("../commands/group/core.js");
  log.ok("Group Core module loaded");
} catch (e) {
  log.warn(`Group Core not loaded: ${e.message.substring(0, 80)}`);
}
try {
  group.moderation = await import("../commands/group/moderation.js");
  log.ok("Group Moderation module loaded");
} catch (e) {
  log.warn(`Group Moderation not loaded: ${e.message.substring(0, 80)}`);
}
try {
  group.settings = await import("../commands/group/settings.js");
  log.ok("Group Settings module loaded");
} catch (e) {
  log.warn(`Group Settings not loaded: ${e.message.substring(0, 80)}`);
}

let autoReplyHandler = {
  handleReply: async () => false,
  init: () => {},
  isUserActive: () => false,
};
try {
  const ar = await import("./autoReply.js");
  autoReplyHandler = ar.default || ar;
  if (typeof autoReplyHandler.init === "function") autoReplyHandler.init();
  log.ok("Auto-reply handler loaded");
} catch (_) {
  log.warn("Auto-reply handler not loaded");
}

// ========== COMMAND REGISTRY ==========
const commands = new Map();
const commandStats = new Map();

function reg(name, handler, options = {}) {
  if (typeof handler !== "function") return;
  commands.set(name.toLowerCase(), {
    handler,
    name: name.toLowerCase(),
    ...options,
  });
}

function dlFallback() {
  return async ({ fullArgs, from, sock }) => {
    const url = fullArgs || "";
    if (!url)
      return sock.sendMessage(from, {
        text: "⬇️ *DOWNLOAD*\n\nUsage: .dl <url>\n\n⚡ AYOBOT v1 | 👑 AYOCODES",
      });
    const clean = url.startsWith("http") ? url : "https://" + url;
    return sock.sendMessage(from, {
      text: `⚠️ Downloader unavailable.\nTry: .tiktok ${clean}\n\n⚡ AYOBOT v1 | 👑 AYOCODES`,
    });
  };
}

// ========== REGISTER ALL COMMANDS ==========
export function registerAllCommands() {
  console.log("\n📝 REGISTERING ALL COMMANDS...");
  let count = 0;

  // ── BASIC ────────────────────────────────────────────────
  if (typeof basic.menu === "function") {
    reg("menu", basic.menu);
    reg("help", basic.menu);
    reg("commands", basic.menu);
    reg("cmds", basic.menu);
    reg("start", basic.menu);
    count += 5;
  }
  if (typeof basic.ping === "function") {
    reg("ping", basic.ping);
    reg("pong", basic.ping);
    reg("latency", basic.ping);
    reg("speed", basic.ping);
    count += 4;
  }
  if (typeof basic.status === "function") {
    reg("status", basic.status);
    reg("me", basic.status);
    reg("profile", basic.status);
    reg("whoami", basic.status);
    count += 4;
  }
  if (typeof basic.creator === "function") {
    reg("creator", basic.creator);
    reg("maker", basic.creator);
    reg("dev", basic.creator);
    reg("owner", basic.creator);
    count += 4;
  }
  if (typeof basic.creatorGit === "function") {
    reg("creatorsgit", basic.creatorGit);
    reg("github", basic.creatorGit);
    reg("git", basic.creatorGit);
    count += 3;
  }
  if (typeof basic.auto === "function") {
    reg("auto", basic.auto);
    reg("autoreply", basic.auto);
    reg("chatbot", basic.auto);
    count += 3;
  }
  if (typeof basic.weather === "function") {
    reg("weather", basic.weather);
    reg("w", basic.weather);
    reg("forecast", basic.weather);
    reg("temp", basic.weather);
    count += 4;
  }
  if (typeof basic.shorten === "function") {
    reg("shorten", basic.shorten);
    reg("short", basic.shorten);
    reg("tiny", basic.shorten);
    count += 3;
  }
  if (typeof basic.scrape === "function") {
    reg("scrape", basic.scrape);
    reg("tweek", basic.scrape);
    count += 2;
  }
  if (typeof basic.connectInfo === "function") {
    reg("connect", basic.connectInfo);
    reg("connectinfo", basic.connectInfo);
    count += 2;
  }
  if (typeof basic.time === "function") {
    reg("time", basic.time);
    reg("worldtime", basic.time);
    count += 2;
  }
  if (typeof basic.pdf === "function") {
    reg("pdf", basic.pdf);
    count += 1;
  }
  if (typeof basic.viewOnce === "function") {
    reg("open", basic.viewOnce);
    reg("vv", basic.viewOnce);
    reg("arise", basic.viewOnce);
    count += 3;
  }
  if (typeof basic.joinWaitlist === "function") {
    reg("jointrend", basic.joinWaitlist);
    reg("waitlist", basic.joinWaitlist);
    count += 2;
  }
  if (typeof basic.getpp === "function") {
    reg("getpp", basic.getpp);
    reg("mypp", basic.getpp);
    reg("pp", basic.getpp);
    count += 3;
  }
  if (typeof basic.getgpp === "function") {
    reg("getgpp", basic.getgpp);
    reg("gpp", basic.getgpp);
    count += 2;
  }
  if (typeof basic.prefixinfo === "function") {
    reg("prefixinfo", basic.prefixinfo);
    reg("preinfo", basic.prefixinfo);
    count += 2;
  }
  if (typeof basic.platform === "function") {
    reg("platform", basic.platform);
    reg("kitchen", basic.platform);
    count += 2;
  }
  if (typeof basic.url === "function") {
    reg("url", basic.url);
    count += 1;
  }
  if (typeof basic.fetch === "function") {
    reg("fetch", basic.fetch);
    count += 1;
  }
  if (typeof basic.qencode === "function") {
    reg("qencode", basic.qencode);
    count += 1;
  }
  if (typeof basic.take === "function") {
    reg("take", basic.take);
    count += 1;
  }
  if (typeof basic.imgbb === "function") {
    reg("imgbb", basic.imgbb);
    count += 1;
  }
  if (typeof basic.screenshot === "function") {
    reg("screenshot", basic.screenshot);
    reg("ss", basic.screenshot);
    count += 2;
  }
  if (typeof basic.inspect === "function") {
    reg("inspect", basic.inspect);
    count += 1;
  }
  if (typeof basic.trebleboost === "function") {
    reg("trebleboost", basic.trebleboost);
    count += 1;
  }
  if (typeof basic.vcf === "function") {
    reg("vcf", basic.vcf);
    count += 1;
  }
  if (typeof basic.viewvcf === "function") {
    reg("viewvcf", basic.viewvcf);
    count += 1;
  }
  if (typeof basic.getip === "function") {
    reg("getip", basic.getip);
    count += 1;
  }
  if (typeof basic.myip === "function") {
    reg("myip", basic.myip);
    count += 1;
  }
  if (typeof basic.whois === "function") {
    reg("whois", basic.whois);
    reg("domain", basic.whois);
    count += 2;
  }
  if (typeof basic.dns === "function") {
    reg("dns", basic.dns);
    reg("dnslookup", basic.dns);
    count += 2;
  }
  if (typeof basic.ip === "function") {
    reg("ip", basic.ip);
    reg("iplookup", basic.ip);
    count += 2;
  }
  if (typeof basic.jarvis === "function") {
    reg("jarvis", basic.jarvis);
    reg("j", basic.jarvis);
    reg("ask", basic.jarvis);
    count += 3;
  }
  if (typeof basic.jarvisVoice === "function") {
    reg("jarvisv", basic.jarvisVoice);
    reg("jv", basic.jarvisVoice);
    reg("speak", basic.jarvisVoice);
    count += 3;
  }
  if (typeof basic.jarvisStatus === "function") {
    reg("jarvisstatus", basic.jarvisStatus);
    reg("jstatus", basic.jarvisStatus);
    reg("jstats", basic.jarvisStatus);
    count += 3;
  }
  if (typeof basic.ironmanStatus === "function") {
    reg("ironman", basic.ironmanStatus);
    reg("suit", basic.ironmanStatus);
    reg("stark", basic.ironmanStatus);
    reg("iron", basic.ironmanStatus);
    count += 4;
  }

  // ── AI ───────────────────────────────────────────────────
  if (typeof ai.ai === "function") {
    reg("ai", ai.ai);
    reg("ayobot", ai.ai);
    count += 2;
  }
  if (typeof ai.aiClear === "function") {
    reg("aiclear", ai.aiClear);
    reg("clearchat", ai.aiClear);
    count += 2;
  }
  if (typeof ai.aiExport === "function") {
    reg("aiexport", ai.aiExport);
    count += 1;
  }
  if (typeof ai.aiStat === "function") {
    reg("aistat", ai.aiStat);
    reg("aistats", ai.aiStat);
    count += 2;
  }
  if (typeof ai.summarize === "function") {
    reg("summarize", ai.summarize);
    reg("summary", ai.summarize);
    reg("simpler", ai.summarize);
    reg("tldr", ai.summarize);
    count += 4;
  }
  if (typeof ai.grammar === "function") {
    reg("grammar", ai.grammar);
    reg("spellcheck", ai.grammar);
    count += 2;
  }
  if (typeof ai.translate === "function") {
    reg("translate", translation.translate);
    reg("tr", translation.translate);
    reg("tl", translation.translate);
    reg("lang", translation.translate);
    count += 4;
  }

  // ── CALCULATOR ───────────────────────────────────────────
  if (typeof calculator.calculate === "function") {
    reg("calc", calculator.calculate);
    reg("calculate", calculator.calculate);
    reg("math", calculator.calculate);
    reg("=", calculator.calculate);
    count += 4;
  }

  // ── CRYPTO ───────────────────────────────────────────────
  if (typeof crypto.crypto === "function") {
    reg("crypto", crypto.crypto);
    reg("coin", crypto.crypto);
    reg("btc", (ctx) => crypto.crypto({ ...ctx, fullArgs: "bitcoin" }));
    reg("eth", (ctx) => crypto.crypto({ ...ctx, fullArgs: "ethereum" }));
    reg("doge", (ctx) => crypto.crypto({ ...ctx, fullArgs: "dogecoin" }));
    reg("bnb", (ctx) => crypto.crypto({ ...ctx, fullArgs: "binancecoin" }));
    count += 6;
  }
  if (typeof crypto.cryptoTop === "function") {
    reg("cryptotop", crypto.cryptoTop);
    reg("top10", crypto.cryptoTop);
    count += 2;
  }
  if (typeof crypto.cryptoChart === "function") {
    reg("cryptochart", crypto.cryptoChart);
    count += 1;
  }
  if (typeof crypto.cryptoConvert === "function") {
    reg("cryptoconvert", crypto.cryptoConvert);
    count += 1;
  }

  // ── DICTIONARY ───────────────────────────────────────────
  if (typeof dictionary.dict === "function") {
    reg("dict", dictionary.dict);
    reg("dictionary", dictionary.dict);
    reg("define", dictionary.dict);
    reg("meaning", dictionary.dict);
    count += 4;
  }

  // ── DOWNLOADER ───────────────────────────────────────────
  const dlMap = [
    { fn: downloader.play, aliases: ["play", "music", "mp3"] },
    { fn: downloader.tiktok, aliases: ["tiktok", "tt", "tok"] },
    { fn: downloader.instagram, aliases: ["instagram", "ig", "insta"] },
    { fn: downloader.facebook, aliases: ["facebook", "fb"] },
    { fn: downloader.twitter, aliases: ["twitter", "x", "tweet"] },
    { fn: downloader.spotify, aliases: ["spotify", "sp"] },
    { fn: downloader.pinterest, aliases: ["pinterest", "pin"] },
    { fn: downloader.image, aliases: ["image", "img"] },
    { fn: downloader.gif, aliases: ["gif", "giphy"] },
    { fn: downloader.download, aliases: ["download", "dl", "save"] },
    { fn: downloader.youtube, aliases: ["youtube", "yt", "ytinfo"] },
  ];
  for (const { fn, aliases } of dlMap) {
    const h = typeof fn === "function" ? fn : dlFallback();
    for (const a of aliases) {
      reg(a, h);
      count++;
    }
  }

  // ── ENCRYPTION ───────────────────────────────────────────
  if (typeof encryption.encrypt === "function") {
    reg("encrypt", encryption.encrypt);
    reg("enc", encryption.encrypt);
    count += 2;
  }
  if (typeof encryption.decrypt === "function") {
    reg("decrypt", encryption.decrypt);
    reg("dec", encryption.decrypt);
    count += 2;
  }
  if (typeof encryption.hash === "function") {
    reg("hash", encryption.hash);
    reg("md5", encryption.hash);
    count += 2;
  }
  if (typeof encryption.password === "function") {
    reg("password", encryption.password);
    reg("genpass", encryption.password);
    reg("passgen", encryption.password);
    count += 3;
  }

  // ── GAMES ────────────────────────────────────────────────
  if (typeof games.rps === "function") {
    reg("rps", games.rps);
    reg("rockpaperscissors", games.rps);
    count += 2;
  }
  if (typeof games.dice === "function") {
    reg("dice", games.dice);
    reg("roll", games.dice);
    count += 2;
  }
  if (typeof games.coinFlip === "function") {
    reg("flip", games.coinFlip);
    count += 1;
  }
  if (typeof games.trivia === "function") {
    reg("trivia", games.trivia);
    reg("quiz", games.trivia);
    count += 2;
  }

  // ── IMAGE TOOLS ──────────────────────────────────────────
  if (typeof imageTools.sticker === "function") {
    reg("sticker", imageTools.sticker);
    reg("s", imageTools.sticker);
    reg("stick", imageTools.sticker);
    count += 3;
  }
  if (typeof imageTools.toImage === "function") {
    reg("toimage", imageTools.toImage);
    reg("toimg", imageTools.toImage);
    count += 2;
  }
  if (typeof imageTools.toVideo === "function") {
    reg("tovideo", imageTools.toVideo);
    reg("tovid", imageTools.toVideo);
    count += 2;
  }
  if (typeof imageTools.toGif === "function") {
    reg("togif", imageTools.toGif);
    count += 1;
  }
  if (typeof imageTools.toAudio === "function") {
    reg("toaudio", imageTools.toAudio);
    reg("tomp3", imageTools.toAudio);
    count += 2;
  }
  if (typeof imageTools.removeBg === "function") {
    reg("removebg", imageTools.removeBg);
    reg("nobg", imageTools.removeBg);
    reg("rmbg", imageTools.removeBg);
    count += 3;
  }
  if (typeof imageTools.meme === "function") {
    reg("meme", imageTools.meme);
    count += 1;
  }

  // ── IP LOOKUP (fallback only — basic.js registers primary) ─
  if (typeof ipLookup.ip === "function" && !commands.has("ip")) {
    reg("ipinfo", ipLookup.ip);
    count += 1;
  }
  if (typeof ipLookup.whois === "function" && !commands.has("whois")) {
    reg("whois", ipLookup.whois);
    count += 1;
  }
  if (typeof ipLookup.myip === "function" && !commands.has("myip")) {
    reg("myip", ipLookup.myip);
    count += 1;
  }
  if (typeof ipLookup.dns === "function" && !commands.has("dns")) {
    reg("dns", ipLookup.dns);
    count += 1;
  }

  // ── JOKES ────────────────────────────────────────────────
  if (typeof jokes.joke === "function") {
    reg("joke", jokes.joke);
    reg("laugh", jokes.joke);
    reg("funny", jokes.joke);
    count += 3;
  }
  if (typeof jokes.roast === "function") {
    reg("roast", jokes.roast);
    reg("burn", jokes.roast);
    count += 2;
  }
  if (typeof jokes.pickupLine === "function") {
    reg("pickup", jokes.pickupLine);
    reg("pickupline", jokes.pickupLine);
    reg("flirt", jokes.pickupLine);
    count += 3;
  }

  // ── MOVIES ───────────────────────────────────────────────
  if (typeof movies.movie === "function") {
    reg("movie", movies.movie);
    reg("film", movies.movie);
    reg("imdb", movies.movie);
    reg("movies", movies.movie);
    count += 4;
  }
  if (typeof movies.tv === "function") {
    reg("tv", movies.tv);
    reg("series", movies.tv);
    reg("show", movies.tv);
    count += 3;
  }
  if (typeof movies.recommend === "function") {
    reg("recommend", movies.recommend);
    reg("rec", movies.recommend);
    reg("suggest", movies.recommend);
    count += 3;
  }

  // ── MUSIC ────────────────────────────────────────────────
  if (typeof music.musicLyrics === "function") {
    reg("lyrics", music.musicLyrics);
    reg("lyric", music.musicLyrics);
    reg("words", music.musicLyrics);
    count += 3;
  }
  if (typeof music.musicTrending === "function") {
    reg("trending", music.musicTrending);
    reg("chart", music.musicTrending);
    count += 2;
  }
  if (typeof music.musicArtist === "function") {
    reg("artist", music.musicArtist);
    count += 1;
  }
  if (typeof music.musicAlbum === "function") {
    reg("album", music.musicAlbum);
    count += 1;
  }
  if (typeof music.musicSearch === "function") {
    reg("musicsearch", music.musicSearch);
    reg("findsong", music.musicSearch);
    count += 2;
  }
  if (typeof music.musicGenius === "function") {
    reg("genius", music.musicGenius);
    count += 1;
  }

  // ── NEWS ─────────────────────────────────────────────────
  if (typeof news.news === "function") {
    reg("news", news.news);
    reg("headlines", news.news);
    reg("breaking", news.news);
    reg("update", news.news);
    count += 4;
  }

  // ── NOTES ────────────────────────────────────────────────
  if (typeof notes.save === "function") {
    reg("note", notes.save);
    reg("store", notes.save);
    count += 2;
  }
  if (typeof notes.get === "function") {
    reg("getnote", notes.get);
    reg("recall", notes.get);
    count += 2;
  }
  if (typeof notes.list === "function") {
    reg("notes", notes.list);
    reg("keys", notes.list);
    count += 2;
  }
  if (typeof notes.deleteKey === "function") {
    reg("delnote", notes.deleteKey);
    reg("forget", notes.deleteKey);
    count += 2;
  }
  if (typeof notes.clearAll === "function") {
    reg("clearnotes", notes.clearAll);
    count += 1;
  }

  // ── QR ───────────────────────────────────────────────────
  if (typeof qr.qr === "function") {
    reg("qr", qr.qr);
    reg("qrcode", qr.qr);
    count += 2;
  }

  // ── QUOTES ───────────────────────────────────────────────
  if (typeof quotes.quote === "function") {
    reg("quote", quotes.quote);
    reg("motivation", quotes.quote);
    reg("inspire", quotes.quote);
    reg("wisdom", quotes.quote);
    count += 4;
  }

  // ── REMINDER ─────────────────────────────────────────────
  if (typeof reminder.reminder === "function") {
    reg("remind", reminder.reminder);
    reg("reminder", reminder.reminder);
    reg("later", reminder.reminder);
    reg("alarm", reminder.reminder);
    count += 4;
  }

  // ── SECURITY ─────────────────────────────────────────────
  if (typeof security.scan === "function") {
    reg("scan", security.scan);
    reg("virustotal", security.scan);
    reg("checksafe", security.scan);
    count += 3;
  }

  // ── STOCKS ───────────────────────────────────────────────
  if (typeof stocks.stock === "function") {
    reg("stock", stocks.stock);
    reg("stocks", stocks.stock);
    reg("share", stocks.stock);
    count += 3;
  }

  // ── TRANSLATION (fallback) ────────────────────────────────
  if (
    typeof translation.translate === "function" &&
    !commands.has("translate")
  ) {
    reg("translate", translation.translate);
    reg("tr", translation.translate);
    reg("tl", translation.translate);
    reg("lang", translation.translate);
    count += 4;
  }
  if (typeof translation.languages === "function") {
    reg("languages", translation.languages);
    reg("langs", translation.languages);
    count += 2;
  }
  if (typeof translation.detect === "function") {
    reg("detect", translation.detect);
    reg("langdetect", translation.detect);
    count += 2;
  }

  // ── TTS ──────────────────────────────────────────────────
  if (typeof tts.tts === "function") {
    reg("tts", tts.tts);
    reg("voice", tts.tts);
    reg("say", tts.tts);
    count += 3;
  }
  if (typeof tts.ttsVoice === "function") {
    reg("voices", tts.ttsVoice);
    count += 1;
  }

  // ── UNIT CONVERTER ───────────────────────────────────────
  if (typeof unitConverter.convert === "function") {
    reg("convert", unitConverter.convert);
    reg("conv", unitConverter.convert);
    reg("uconvert", unitConverter.convert);
    count += 3;
  }
  if (typeof unitConverter.units === "function") {
    reg("units", unitConverter.units);
    count += 1;
  }
  if (typeof unitConverter.allunits === "function") {
    reg("allunits", unitConverter.allunits);
    count += 1;
  }

  // ── GROUP CORE ───────────────────────────────────────────
  if (group?.core) {
    const gc = group.core;
    if (typeof gc.kick === "function") {
      reg("kick", gc.kick, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      reg("remove", gc.kick, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      count += 2;
    }
    if (typeof gc.add === "function") {
      reg("add", gc.add, { groupOnly: true, adminOnly: true });
      reg("invite", gc.add, { groupOnly: true, adminOnly: true });
      count += 2;
    }
    if (typeof gc.promote === "function") {
      reg("promote", gc.promote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      reg("makeadmin", gc.promote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      count += 2;
    }
    if (typeof gc.demote === "function") {
      reg("demote", gc.demote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      reg("unadmin", gc.demote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      count += 2;
    }
    if (typeof gc.listAdmins === "function") {
      reg("listadmins", gc.listAdmins, { groupOnly: true });
      reg("admins", gc.listAdmins, { groupOnly: true });
      reg("admin", gc.listAdmins, { groupOnly: true });
      count += 3;
    }
  }

  // ── GROUP MODERATION ─────────────────────────────────────
  if (group?.moderation) {
    const gm = group.moderation;
    if (typeof gm.ban === "function") {
      reg("ban", gm.ban, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
      });
      count += 1;
    }
    if (typeof gm.unban === "function") {
      reg("unban", gm.unban, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gm.listBanned === "function") {
      reg("listbanned", gm.listBanned, { groupOnly: true, adminOnly: true });
      reg("bans", gm.listBanned, { groupOnly: true, adminOnly: true });
      count += 2;
    }
    if (typeof gm.warn === "function") {
      reg("warn", gm.warn, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gm.warnings === "function") {
      reg("warnings", gm.warnings, { groupOnly: true });
      reg("warnlist", gm.warnings, { groupOnly: true });
      count += 2;
    }
    if (typeof gm.clearWarns === "function") {
      reg("clearwarns", gm.clearWarns, { groupOnly: true, adminOnly: true });
      reg("resetwarns", gm.clearWarns, { groupOnly: true, adminOnly: true });
      count += 2;
    }
  }

  // ── GROUP SETTINGS ───────────────────────────────────────
  if (group?.settings) {
    const gs = group.settings;
    if (typeof gs.mute === "function") {
      reg("mute", gs.mute, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.unmute === "function") {
      reg("unmute", gs.unmute, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    // NEW: lock / unlock — restrict group-info edits to admins only. — AYOCODES
    if (typeof gs.lock === "function") {
      reg("lock", gs.lock, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.unlock === "function") {
      reg("unlock", gs.unlock, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.antiLink === "function") {
      reg("antilink", gs.antiLink, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.antiSpam === "function") {
      reg("antispam", gs.antiSpam, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.welcomeToggle === "function") {
      reg("welcome", gs.welcomeToggle, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.setWelcome === "function") {
      reg("setwelcome", gs.setWelcome, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.goodbyeToggle === "function") {
      reg("goodbye", gs.goodbyeToggle, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.setGoodbye === "function") {
      reg("setgoodbye", gs.setGoodbye, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.groupInfo === "function") {
      reg("groupinfo", gs.groupInfo, { groupOnly: true });
      reg("ginfo", gs.groupInfo, { groupOnly: true });
      reg("gstats", gs.groupInfo, { groupOnly: true });
      count += 3;
    }
    if (typeof gs.rules === "function") {
      reg("rules", gs.rules, { groupOnly: true });
      reg("grouprules", gs.rules, { groupOnly: true });
      count += 2;
    }
    if (typeof gs.setRules === "function") {
      reg("setrules", gs.setRules, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.link === "function") {
      reg("link", gs.link, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.revoke === "function") {
      reg("revoke", gs.revoke, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.tagAll === "function") {
      reg("tagall", gs.tagAll, { groupOnly: true, adminOnly: true });
      reg("everyone", gs.tagAll, { groupOnly: true, adminOnly: true });
      reg("all", gs.tagAll, { groupOnly: true, adminOnly: true });
      count += 3;
    }
    if (typeof gs.hideTag === "function") {
      reg("hidetag", gs.hideTag, { groupOnly: true, adminOnly: true });
      reg("htag", gs.hideTag, { groupOnly: true, adminOnly: true });
      count += 2;
    }
    // NEW: pin / unpin — pin messages in the group. Bot must be admin. — AYOCODES
    if (typeof gs.pin === "function") {
      reg("pin", gs.pin, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.unpin === "function") {
      reg("unpin", gs.unpin, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.deleteMsg === "function") {
      reg("delete", gs.deleteMsg, { groupOnly: true, adminOnly: true });
      reg("del", gs.deleteMsg, { groupOnly: true, adminOnly: true });
      count += 2;
    }
    // NEW: settings overview & reset. — AYOCODES
    if (typeof gs.settingsOverview === "function") {
      reg("settings", gs.settingsOverview, { groupOnly: true });
      reg("gsettings", gs.settingsOverview, { groupOnly: true });
      count += 2;
    }
    if (typeof gs.resetSettings === "function") {
      reg("resetsettings", gs.resetSettings, {
        groupOnly: true,
        adminOnly: true,
      });
      reg("clearsettings", gs.resetSettings, {
        groupOnly: true,
        adminOnly: true,
      });
      count += 2;
    }
    if (typeof gs.leave === "function") {
      reg("leave", gs.leave, { groupOnly: true, adminOnly: true });
      count += 1;
    }
    if (typeof gs.debug === "function") {
      reg("debuggroup", gs.debug, { groupOnly: true, adminOnly: true });
      count += 1;
    }
  }

  // ── ADMIN ────────────────────────────────────────────────
  if (admin) {
    if (typeof admin.addUser === "function") {
      reg("adduser", admin.addUser, { adminOnly: true });
      reg("auth", admin.addUser, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.removeUser === "function") {
      reg("removeuser", admin.removeUser, { adminOnly: true });
      reg("deauth", admin.removeUser, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.listUsers === "function") {
      reg("listusers", admin.listUsers, { adminOnly: true });
      reg("users", admin.listUsers, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.mode === "function") {
      reg("mode", admin.mode, { adminOnly: true });
      reg("setmode", admin.mode, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.broadcast === "function") {
      reg("broadcast", admin.broadcast, { adminOnly: true });
      reg("bc", admin.broadcast, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.globalBroadcast === "function") {
      reg("globalbroadcast", admin.globalBroadcast, { adminOnly: true });
      reg("gbc", admin.globalBroadcast, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.stats === "function") {
      reg("stats", admin.stats, { adminOnly: true });
      reg("botstats", admin.stats, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.superBan === "function") {
      reg("superban", admin.superBan, { adminOnly: true });
      count += 1;
    }
    if (typeof admin.clearBans === "function") {
      reg("clearbans", admin.clearBans, { adminOnly: true });
      count += 1;
    }
    if (typeof admin.restart === "function") {
      reg("restart", admin.restart, { adminOnly: true });
      reg("reboot", admin.restart, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.shutdown === "function") {
      reg("shutdown", admin.shutdown, { adminOnly: true });
      reg("off", admin.shutdown, { adminOnly: true });
      count += 2;
    }
    if (typeof admin.botStatus === "function") {
      reg("botstatus", admin.botStatus, { adminOnly: true });
      count += 1;
    }
    if (typeof admin.adminEval === "function") {
      reg("eval", admin.adminEval, { adminOnly: true });
      reg("exec", admin.adminEval, { adminOnly: true });
      count += 2;
    }
  }

  log.ok(`Registered ${commands.size} commands (${count} attempts)`);
}

registerAllCommands();

// ========== HELPERS ==========
function safeJid(jid) {
  if (!jid) return "";
  if (typeof jid === "object") {
    if (jid.user && jid.server) return `${jid.user}@${jid.server}`;
    if (jid._serialized) return jid._serialized;
    if (jid.id) return jid.id;
    if (jid.jid) return jid.jid;
    return "";
  }
  return String(jid);
}

// Strip device suffix (:56, :52) then get just the number part. — AYOCODES
function safePhone(jid) {
  return safeJid(jid).split("@")[0].split(":")[0] || "";
}

function storeDeletedMessage(id, text) {
  if (deletedMessages.size >= 2000)
    deletedMessages.delete(deletedMessages.keys().next().value);
  deletedMessages.set(id, text);
  setTimeout(() => deletedMessages.delete(id), 3_600_000);
}

// ========== MAIN COMMAND HANDLER ==========
export async function handleCommand(message, sock) {
  try {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const isDM = from.endsWith("@s.whatsapp.net") || from.endsWith("@lid");
    const fromMe = !!message.key.fromMe;

    // ── Resolve sender JID ──────────────────────────────────
    // In groups, sender is key.participant (includes device suffix like :56).
    // In DMs, fromMe = owner sending from their own phone.
    // We strip the :XX device suffix before any comparison. — AYOCODES
    let rawSenderJid;
    if (isGroup) {
      rawSenderJid = message.key.participant || from;
    } else if (fromMe) {
      // Owner sending from their phone — build clean JID from socket user
      const phone = (sock?.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      rawSenderJid = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      rawSenderJid = from;
    }

    // Normalize: strip device suffix so "2349159180375:56@s.whatsapp.net"
    // becomes "2349159180375@s.whatsapp.net" for all admin checks. — AYOCODES
    const cleanPhone = safePhone(rawSenderJid);
    const userJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawSenderJid;
    if (!userJid) return;

    // ── Permission flags ────────────────────────────────────
    // fromMe = this message was sent by the bot owner from their own phone.
    // The owner is ALWAYS admin — no JID comparison needed for fromMe messages.
    // This is the definitive fix for "owner blocked in groups". — AYOCODES
    const isAdminUser = fromMe || isAdmin(userJid);
    const isAuthorizedUser = isAdminUser || isAuthorized(userJid);

    // ── Extract message text ────────────────────────────────
    const m = message.message || {};
    const msgText =
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.buttonsResponseMessage?.selectedButtonId ||
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.templateButtonReplyMessage?.selectedId ||
      "";

    if (!msgText || !msgText.trim()) return;
    const trimmed = msgText.trim();

    // ── Non-command messages ────────────────────────────────
    // Not a command prefix → skip entirely. Auto-reply is disabled. — AYOCODES
    if (!trimmed.startsWith(ENV.PREFIX)) return;

    // ── fromMe command guard ────────────────────────────────
    // Owner sending .command from their own phone (fromMe = true).
    // We allow this — owner should be able to use all commands
    // from their own device. Just skip if it's not a command. — AYOCODES

    // ── Log ─────────────────────────────────────────────────
    const tag = isAdminUser
      ? "👑ADMIN"
      : isAuthorizedUser
        ? "✅USER"
        : "👤PUBLIC";
    const loc = isGroup ? "GROUP" : "DM";
    log.cmd(`[${tag}][${loc}] ${trimmed.substring(0, 60)} ← ${cleanPhone}`);

    // ── Parse command ────────────────────────────────────────
    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;
    const parts = body.split(/\s+/);
    const commandName = parts.shift()?.toLowerCase()?.trim();
    if (!commandName) return;
    const args = parts;
    const fullArgs = parts.join(" ");

    // ── Store for anti-delete ────────────────────────────────
    if (message.key?.id) storeDeletedMessage(message.key.id, trimmed);

    // ── Track usage ──────────────────────────────────────────
    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[commandName] =
      (commandUsage.get(userJid)[commandName] || 0) + 1;
    commandStats.set(commandName, (commandStats.get(commandName) || 0) + 1);

    // ── Find command ─────────────────────────────────────────
    const command = commands.get(commandName);
    if (!command) {
      log.info(`Unknown command: ${ENV.PREFIX}${commandName}`);
      await sock.sendMessage(from, {
        text: formatInfo(
          "UNKNOWN COMMAND",
          `❓ *.${commandName}* not found.\n\nType *${ENV.PREFIX}menu* to see all commands!`,
        ),
      });
      return;
    }

    // ── Permission checks ────────────────────────────────────
    if (command.adminOnly && !isAdminUser) {
      return sock.sendMessage(from, {
        text: formatError(
          "ACCESS DENIED",
          "⛔ This command is for the *bot owner* only.",
        ),
      });
    }

    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(from, {
        text: formatError(
          "GROUP ONLY",
          `👥 *.${commandName}* only works in groups.`,
        ),
      });
    }

    if (command.requireBotAdmin && isGroup) {
      let botIsAdmin = false;
      try {
        botIsAdmin = await isBotGroupAdminCached(from, sock);
      } catch (_) {}
      if (!botIsAdmin) {
        return sock.sendMessage(from, {
          text: formatGroupError(
            "BOT NOT ADMIN",
            `❌ I need group admin rights for *.${commandName}*. Please promote me first!`,
          ),
        });
      }
    }

    // ── Execute ──────────────────────────────────────────────
    try {
      await command.handler({
        args,
        fullArgs,
        message,
        from,
        groupJid: isGroup ? from : null,
        userJid,
        isGroup,
        isDM,
        sock,
        isAdmin: isAdminUser,
        isAuthorized: isAuthorizedUser,
        commandName,
        prefix: ENV.PREFIX,
      });
      log.ok(`Done: ${ENV.PREFIX}${commandName} ← ${cleanPhone}`);
    } catch (cmdError) {
      log.err(`Error in ${ENV.PREFIX}${commandName}: ${cmdError.message}`);
      try {
        await sock.sendMessage(from, {
          text: formatError(
            "COMMAND ERROR",
            `❌ *.${commandName}* failed:\n${cmdError.message || "Unknown error"}`,
          ),
        });
      } catch (_) {}
    }
  } catch (error) {
    log.err("handleCommand fatal: " + error.message);
  }
}

export { commands, commandStats };
