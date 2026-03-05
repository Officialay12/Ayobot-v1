// handlers/commandHandler.js - AYOBOT v1 | Created by AYOCODES
import {
  autoReplyEnabled,
  commandUsage,
  deletedMessages,
  ENV,
  groupSettings,
  isAdmin,
  isAuthorized,
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

import * as group from "../commands/group/index.js";
console.log("✅ group imported:", Object.keys(group));
if (group.core) console.log("✅ group.core:", Object.keys(group.core));

import {
  formatError,
  formatGroupError,
  formatInfo,
} from "../utils/formatters.js";
import { handleRuleViolation } from "./ruleHandler.js";

// ========== FEATURE MODULE IMPORTS ==========
let admin = {},
  basic = {},
  ai = {},
  calculator = {},
  crypto = {},
  dictionary = {},
  downloader = {},
  encryption = {},
  games = {},
  imageTools = {},
  ipLookup = {},
  jokes = {},
  movies = {},
  music = {},
  news = {},
  notes = {},
  qr = {},
  quotes = {},
  reminder = {},
  security = {},
  stocks = {},
  translation = {},
  tts = {},
  unitConverter = {},
  tools = {},
  entertainment = {},
  media = {},
  utils = {};

const moduleLoad = async (name, modulePath, target) => {
  try {
    const mod = await import(modulePath);
    Object.assign(target, mod);
    console.log(`✅ ${name} module loaded`);
    return true;
  } catch (e) {
    console.log(`⚠️ ${name} module not loaded: ${e.message.substring(0, 80)}`);
    return false;
  }
};

await moduleLoad("Admin", "../commands/group/admin.js", admin);
await moduleLoad("Basic", "../commands/group/basic.js", basic);
await moduleLoad("AI", "../features/ai.js", ai);
await moduleLoad("Calculator", "../features/calculator.js", calculator);
await moduleLoad("Crypto", "../features/crypto.js", crypto);
await moduleLoad("Dictionary", "../features/dictionary.js", dictionary);
await moduleLoad("Downloader", "../features/downloader.js", downloader);
await moduleLoad("Encryption", "../features/encryption.js", encryption);
await moduleLoad("Games", "../features/games.js", games);
await moduleLoad("ImageTools", "../features/imageTools.js", imageTools);
await moduleLoad("IPLookup", "../features/ipLookup.js", ipLookup);
await moduleLoad("Jokes", "../features/jokes.js", jokes);
await moduleLoad("Movies", "../features/movies.js", movies);
await moduleLoad("Music", "../features/music.js", music);
await moduleLoad("News", "../features/news.js", news);
await moduleLoad("Notes", "../features/notes.js", notes);
await moduleLoad("QR", "../features/qr.js", qr);
await moduleLoad("Quotes", "../features/quotes.js", quotes);
await moduleLoad("Reminder", "../features/reminder.js", reminder);
await moduleLoad("Security", "../features/security.js", security);
await moduleLoad("Stocks", "../features/stocks.js", stocks);
await moduleLoad("Translation", "../features/translation.js", translation);
await moduleLoad("TTS", "../features/tts.js", tts);
await moduleLoad(
  "UnitConverter",
  "../features/unitConverter.js",
  unitConverter,
);
await moduleLoad("Tools", "../features/tools.js", tools);
await moduleLoad(
  "Entertainment",
  "../features/entertainment.js",
  entertainment,
);
await moduleLoad("Media", "../features/media.js", media);
await moduleLoad("Utils", "../features/utils.js", utils);

// ========== AUTO-REPLY HANDLER ==========
let autoReplyHandler = {
  handleReply: async () => false,
  init: () => {},
  isUserActive: () => false,
  sendEnableGreeting: async () => {},
  resetConversation: () => {},
};

try {
  const autoReply = await import("./autoReply.js");
  autoReplyHandler = autoReply.default || autoReply;
  if (typeof autoReplyHandler.init === "function") {
    autoReplyHandler.init();
  }
} catch (e) {
  console.log("⚠️ Auto-reply handler not loaded:", e.message);
}

// ========== COMMAND REGISTRY ==========
const commands = new Map();
const commandStats = new Map();

function registerCommand(name, handler, options = {}) {
  if (typeof handler !== "function") return;
  const key = name.toLowerCase();
  commands.set(key, { handler, name: key, ...options });
}

function reg(name, handler, options = {}) {
  registerCommand(name, handler, options);
}

// ========== DOWNLOADER FALLBACK ==========
// Used when the downloader module fails to load so .dl always works
function makeDownloadFallback(specificUrl) {
  return async ({ fullArgs, from, sock }) => {
    if (!fullArgs) {
      return sock.sendMessage(from, {
        text:
          "⬇️ *DOWNLOAD MEDIA*\n\n" +
          "Usage: .dl <url>\n\n" +
          "Supported platforms:\n" +
          ".play <song>     → YouTube audio\n" +
          ".tiktok <url>    → TikTok video\n" +
          ".ig <url>        → Instagram\n" +
          ".fb <url>        → Facebook\n" +
          ".twitter <url>   → Twitter/X\n" +
          ".spotify <url>   → Spotify\n\n" +
          "⚡ AYOBOT v1 | 👑 AYOCODES",
      });
    }
    let url = (specificUrl || fullArgs).trim();
    if (!url.startsWith("http")) url = "https://" + url;
    return sock.sendMessage(from, {
      text:
        `⚠️ Downloader module unavailable.\n\n` +
        `Try specific commands:\n` +
        `.tiktok ${url}\n` +
        `.ig ${url}\n` +
        `.fb ${url}\n` +
        `.twitter ${url}\n` +
        `.play <song name>\n\n` +
        `⚡ AYOBOT v1 | 👑 AYOCODES`,
    });
  };
}

// ========== REGISTER ALL COMMANDS ==========
export function registerAllCommands() {
  // ── BASIC ──────────────────────────────────────────────
  if (typeof basic.menu === "function") {
    reg("menu", basic.menu, { desc: "", category: "basic" });
    reg("help", basic.menu, { desc: "", category: "basic" });
    reg("commands", basic.menu, { desc: "", category: "basic" });
    reg("cmds", basic.menu, { desc: "", category: "basic" });
    reg("start", basic.menu, { desc: "", category: "basic" });
  }

  if (typeof basic.ping === "function") {
    reg("ping", basic.ping, { desc: "", category: "basic" });
    reg("pong", basic.ping, { desc: "", category: "basic" });
    reg("latency", basic.ping, { desc: "", category: "basic" });
    reg("speed", basic.ping, { desc: "", category: "basic" });
  }

  if (typeof basic.status === "function") {
    reg("status", basic.status, { desc: "", category: "basic" });
    reg("me", basic.status, { desc: "", category: "basic" });
    reg("profile", basic.status, { desc: "", category: "basic" });
    reg("whoami", basic.status, { desc: "", category: "basic" });
  }

  if (typeof basic.creator === "function") {
    reg("creator", basic.creator, { desc: "", category: "basic" });
    reg("maker", basic.creator, { desc: "", category: "basic" });
    reg("dev", basic.creator, { desc: "", category: "basic" });
    reg("owner", basic.creator, { desc: "", category: "basic" });
  }

  if (typeof basic.creatorGit === "function") {
    reg("creatorsgit", basic.creatorGit, { desc: "", category: "basic" });
    reg("github", basic.creatorGit, { desc: "", category: "basic" });
    reg("git", basic.creatorGit, { desc: "", category: "basic" });
  }

  if (typeof basic.auto === "function") {
    reg("auto", basic.auto, { desc: "", category: "basic" });
    reg("autoreply", basic.auto, { desc: "", category: "basic" });
    reg("chatbot", basic.auto, { desc: "", category: "basic" });
  }

  if (typeof basic.weather === "function") {
    reg("weather", basic.weather, { desc: "", category: "basic" });
    reg("w", basic.weather, { desc: "", category: "basic" });
    reg("forecast", basic.weather, { desc: "", category: "basic" });
    reg("temp", basic.weather, { desc: "", category: "basic" });
  }

  if (typeof basic.shorten === "function") {
    reg("shorten", basic.shorten, { desc: "", category: "basic" });
    reg("short", basic.shorten, { desc: "", category: "basic" });
    reg("tiny", basic.shorten, { desc: "", category: "basic" });
  }

  if (typeof basic.scrape === "function") {
    reg("scrape", basic.scrape, { desc: "", category: "basic" });
    reg("tweek", basic.scrape, { desc: "", category: "basic" });
  }

  if (typeof basic.connectInfo === "function") {
    reg("connect", basic.connectInfo, { desc: "", category: "basic" });
    reg("connectinfo", basic.connectInfo, { desc: "", category: "basic" });
  }

  if (typeof basic.time === "function") {
    reg("time", basic.time, { desc: "", category: "basic" });
    reg("worldtime", basic.time, { desc: "", category: "basic" });
  }

  if (typeof basic.pdf === "function") {
    reg("pdf", basic.pdf, { desc: "", category: "basic" });
  }

  if (typeof basic.viewOnce === "function") {
    reg("open", basic.viewOnce, { desc: "", category: "basic" });
    reg("vv", basic.viewOnce, { desc: "", category: "basic" });
    reg("arise", basic.viewOnce, { desc: "", category: "basic" });
  }

  if (typeof basic.joinWaitlist === "function") {
    reg("jointrend", basic.joinWaitlist, { desc: "", category: "basic" });
    reg("waitlist", basic.joinWaitlist, { desc: "", category: "basic" });
  }

  if (typeof basic.getpp === "function") {
    reg("getpp", basic.getpp, { desc: "", category: "basic" });
    reg("mypp", basic.getpp, { desc: "", category: "basic" });
    reg("pp", basic.getpp, { desc: "", category: "basic" });
  }

  if (typeof basic.getgpp === "function") {
    reg("getgpp", basic.getgpp, { desc: "", category: "basic" });
    reg("gpp", basic.getgpp, { desc: "", category: "basic" });
  }

  if (typeof basic.prefixinfo === "function") {
    reg("prefixinfo", basic.prefixinfo, { desc: "", category: "basic" });
    reg("preinfo", basic.prefixinfo, { desc: "", category: "basic" });
  }

  if (typeof basic.platform === "function") {
    reg("platform", basic.platform, { desc: "", category: "basic" });
    reg("kitchen", basic.platform, { desc: "", category: "basic" });
  }

  if (typeof basic.url === "function") {
    reg("url", basic.url, { desc: "", category: "basic" });
  }

  if (typeof basic.fetch === "function") {
    reg("fetch", basic.fetch, { desc: "", category: "basic" });
  }

  if (typeof basic.qencode === "function") {
    reg("qencode", basic.qencode, { desc: "", category: "basic" });
  }

  if (typeof basic.take === "function") {
    reg("take", basic.take, { desc: "", category: "basic" });
  }

  if (typeof basic.imgbb === "function") {
    reg("imgbb", basic.imgbb, { desc: "", category: "basic" });
  }

  if (typeof basic.screenshot === "function") {
    reg("screenshot", basic.screenshot, { desc: "", category: "basic" });
    reg("ss", basic.screenshot, { desc: "", category: "basic" });
  }

  if (typeof basic.inspect === "function") {
    reg("inspect", basic.inspect, { desc: "", category: "basic" });
  }

  if (typeof basic.trebleboost === "function") {
    reg("trebleboost", basic.trebleboost, { desc: "", category: "basic" });
  }

  if (typeof basic.vcf === "function") {
    reg("vcf", basic.vcf, { desc: "", category: "basic" });
  }

  if (typeof basic.viewvcf === "function") {
    reg("viewvcf", basic.viewvcf, { desc: "", category: "basic" });
  }

  // IP / DNS
  if (typeof basic.getip === "function") {
    reg("getip", basic.getip, { desc: "", category: "tools" });
  }
  if (typeof basic.myip === "function") {
    reg("myip", basic.myip, { desc: "", category: "tools" });
  }
  if (typeof basic.whois === "function") {
    reg("whois", basic.whois, { desc: "", category: "tools" });
    reg("domain", basic.whois, { desc: "", category: "tools" });
  }
  if (typeof basic.dns === "function") {
    reg("dns", basic.dns, { desc: "", category: "tools" });
    reg("dnslookup", basic.dns, { desc: "", category: "tools" });
  }
  if (typeof basic.ip === "function") {
    reg("ip", basic.ip, { desc: "", category: "tools" });
    reg("iplookup", basic.ip, { desc: "", category: "tools" });
  }

  // JARVIS / IRON MAN
  if (typeof basic.jarvis === "function") {
    reg("jarvis", basic.jarvis, { desc: "", category: "ai" });
    reg("j", basic.jarvis, { desc: "", category: "ai" });
    reg("ask", basic.jarvis, { desc: "", category: "ai" });
  }

  if (typeof basic.jarvisVoice === "function") {
    reg("jarvisv", basic.jarvisVoice, { desc: "", category: "ai" });
    reg("jv", basic.jarvisVoice, { desc: "", category: "ai" });
    reg("speak", basic.jarvisVoice, { desc: "", category: "ai" });
  }

  if (typeof basic.jarvisStatus === "function") {
    reg("jarvisstatus", basic.jarvisStatus, { desc: "", category: "ai" });
    reg("jstatus", basic.jarvisStatus, { desc: "", category: "ai" });
    reg("jstats", basic.jarvisStatus, { desc: "", category: "ai" });
  }

  if (typeof basic.ironmanStatus === "function") {
    reg("ironman", basic.ironmanStatus, { desc: "", category: "fun" });
    reg("suit", basic.ironmanStatus, { desc: "", category: "fun" });
    reg("stark", basic.ironmanStatus, { desc: "", category: "fun" });
    reg("iron", basic.ironmanStatus, { desc: "", category: "fun" });
  }

  // ── AI ─────────────────────────────────────────────────
  if (typeof ai.ai === "function") {
    reg("ai", ai.ai, { desc: "", category: "ai" });
    reg("ayobot", ai.ai, { desc: "", category: "ai" });
  }

  if (typeof ai.aiClear === "function") {
    reg("aiclear", ai.aiClear, { desc: "", category: "ai" });
    reg("clearchat", ai.aiClear, { desc: "", category: "ai" });
  }

  if (typeof ai.aiExport === "function") {
    reg("aiexport", ai.aiExport, { desc: "", category: "ai" });
  }

  if (typeof ai.aiStat === "function") {
    reg("aistat", ai.aiStat, { desc: "", category: "ai" });
    reg("aistats", ai.aiStat, { desc: "", category: "ai" });
  }

  if (typeof ai.summarize === "function") {
    reg("summarize", ai.summarize, { desc: "", category: "ai" });
    reg("summary", ai.summarize, { desc: "", category: "ai" });
    reg("simpler", ai.summarize, { desc: "", category: "ai" });
    reg("tldr", ai.summarize, { desc: "", category: "ai" });
  }

  if (typeof ai.grammar === "function") {
    reg("grammar", ai.grammar, { desc: "", category: "ai" });
    reg("spellcheck", ai.grammar, { desc: "", category: "ai" });
  }

  if (typeof ai.translate === "function") {
    reg("translate", ai.translate, { desc: "", category: "ai" });
    reg("tr", ai.translate, { desc: "", category: "ai" });
    reg("tl", ai.translate, { desc: "", category: "ai" });
    reg("lang", ai.translate, { desc: "", category: "ai" });
  }

  // ── CALCULATOR ─────────────────────────────────────────
  if (typeof calculator.calculate === "function") {
    reg("calc", calculator.calculate, { desc: "", category: "tools" });
    reg("calculate", calculator.calculate, { desc: "", category: "tools" });
    reg("math", calculator.calculate, { desc: "", category: "tools" });
    reg("=", calculator.calculate, { desc: "", category: "tools" });
  }

  // ── CRYPTO ─────────────────────────────────────────────
  if (typeof crypto.crypto === "function") {
    reg("crypto", crypto.crypto, { desc: "", category: "finance" });
    reg("coin", crypto.crypto, { desc: "", category: "finance" });
    reg("btc", (ctx) => crypto.crypto({ ...ctx, fullArgs: "bitcoin" }), {
      desc: "",
      category: "finance",
    });
    reg("eth", (ctx) => crypto.crypto({ ...ctx, fullArgs: "ethereum" }), {
      desc: "",
      category: "finance",
    });
    reg("doge", (ctx) => crypto.crypto({ ...ctx, fullArgs: "dogecoin" }), {
      desc: "",
      category: "finance",
    });
    reg("bnb", (ctx) => crypto.crypto({ ...ctx, fullArgs: "binancecoin" }), {
      desc: "",
      category: "finance",
    });
  }

  if (typeof crypto.cryptoTop === "function") {
    reg("cryptotop", crypto.cryptoTop, { desc: "", category: "finance" });
    reg("top10", crypto.cryptoTop, { desc: "", category: "finance" });
  }

  if (typeof crypto.cryptoChart === "function") {
    reg("cryptochart", crypto.cryptoChart, { desc: "", category: "finance" });
  }

  if (typeof crypto.cryptoConvert === "function") {
    reg("cryptoconvert", crypto.cryptoConvert, {
      desc: "",
      category: "finance",
    });
  }

  // ── DICTIONARY ─────────────────────────────────────────
  if (typeof dictionary.dict === "function") {
    reg("dict", dictionary.dict, { desc: "", category: "tools" });
    reg("dictionary", dictionary.dict, { desc: "", category: "tools" });
    reg("define", dictionary.dict, { desc: "", category: "tools" });
    reg("meaning", dictionary.dict, { desc: "", category: "tools" });
  }

  // ── DOWNLOADER ─────────────────────────────────────────
  // Each alias has its own fallback so they ALWAYS register
  if (typeof downloader.play === "function") {
    reg("play", downloader.play, { desc: "", category: "media" });
    reg("music", downloader.play, { desc: "", category: "media" });
    reg("mp3", downloader.play, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("play", fb, { desc: "", category: "media" });
    reg("music", fb, { desc: "", category: "media" });
    reg("mp3", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.youtube === "function") {
    reg("yt", downloader.youtube, { desc: "", category: "media" });
    reg("youtube", downloader.youtube, { desc: "", category: "media" });
    reg("ytinfo", downloader.youtube, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("yt", fb, { desc: "", category: "media" });
    reg("youtube", fb, { desc: "", category: "media" });
    reg("ytinfo", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.tiktok === "function") {
    reg("tiktok", downloader.tiktok, { desc: "", category: "media" });
    reg("tt", downloader.tiktok, { desc: "", category: "media" });
    reg("tok", downloader.tiktok, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("tiktok", fb, { desc: "", category: "media" });
    reg("tt", fb, { desc: "", category: "media" });
    reg("tok", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.instagram === "function") {
    reg("instagram", downloader.instagram, { desc: "", category: "media" });
    reg("ig", downloader.instagram, { desc: "", category: "media" });
    reg("insta", downloader.instagram, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("instagram", fb, { desc: "", category: "media" });
    reg("ig", fb, { desc: "", category: "media" });
    reg("insta", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.facebook === "function") {
    reg("facebook", downloader.facebook, { desc: "", category: "media" });
    reg("fb", downloader.facebook, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("facebook", fb, { desc: "", category: "media" });
    reg("fb", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.twitter === "function") {
    reg("twitter", downloader.twitter, { desc: "", category: "media" });
    reg("x", downloader.twitter, { desc: "", category: "media" });
    reg("tweet", downloader.twitter, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("twitter", fb, { desc: "", category: "media" });
    reg("x", fb, { desc: "", category: "media" });
    reg("tweet", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.spotify === "function") {
    reg("spotify", downloader.spotify, { desc: "", category: "media" });
    reg("sp", downloader.spotify, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("spotify", fb, { desc: "", category: "media" });
    reg("sp", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.pinterest === "function") {
    reg("pinterest", downloader.pinterest, { desc: "", category: "media" });
    reg("pin", downloader.pinterest, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("pinterest", fb, { desc: "", category: "media" });
    reg("pin", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.image === "function") {
    reg("img", downloader.image, { desc: "", category: "media" });
    reg("image", downloader.image, { desc: "", category: "media" });
    reg("photo", downloader.image, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("img", fb, { desc: "", category: "media" });
    reg("image", fb, { desc: "", category: "media" });
    reg("photo", fb, { desc: "", category: "media" });
  }

  if (typeof downloader.gif === "function") {
    reg("gif", downloader.gif, { desc: "", category: "media" });
    reg("giphy", downloader.gif, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("gif", fb, { desc: "", category: "media" });
    reg("giphy", fb, { desc: "", category: "media" });
  }

  // ── DOWNLOAD / DL / SAVE — always register with fallback ──
  if (typeof downloader.download === "function") {
    reg("download", downloader.download, { desc: "", category: "media" });
    reg("dl", downloader.download, { desc: "", category: "media" });
    reg("save", downloader.download, { desc: "", category: "media" });
  } else {
    const fb = makeDownloadFallback();
    reg("download", fb, { desc: "", category: "media" });
    reg("dl", fb, { desc: "", category: "media" });
    reg("save", fb, { desc: "", category: "media" });
  }

  // ── ENCRYPTION ─────────────────────────────────────────
  if (typeof encryption.encrypt === "function") {
    reg("encrypt", encryption.encrypt, { desc: "", category: "tools" });
    reg("enc", encryption.encrypt, { desc: "", category: "tools" });
  }

  if (typeof encryption.decrypt === "function") {
    reg("decrypt", encryption.decrypt, { desc: "", category: "tools" });
    reg("dec", encryption.decrypt, { desc: "", category: "tools" });
  }

  if (typeof encryption.hash === "function") {
    reg("hash", encryption.hash, { desc: "", category: "tools" });
    reg("md5", encryption.hash, { desc: "", category: "tools" });
  }

  if (typeof encryption.password === "function") {
    reg("password", encryption.password, { desc: "", category: "tools" });
    reg("genpass", encryption.password, { desc: "", category: "tools" });
    reg("passgen", encryption.password, { desc: "", category: "tools" });
  }

  // ── GAMES ──────────────────────────────────────────────
  if (typeof games.rps === "function") {
    reg("rps", games.rps, { desc: "", category: "games" });
    reg("rockpaperscissors", games.rps, { desc: "", category: "games" });
  }

  if (typeof games.dice === "function") {
    reg("dice", games.dice, { desc: "", category: "games" });
    reg("roll", games.dice, { desc: "", category: "games" });
  }

  if (typeof games.coinFlip === "function") {
    reg("flip", games.coinFlip, { desc: "", category: "games" });
  }

  if (typeof games.trivia === "function") {
    reg("trivia", games.trivia, { desc: "", category: "games" });
    reg("quiz", games.trivia, { desc: "", category: "games" });
  }

  // ── IMAGE TOOLS ────────────────────────────────────────
  if (typeof imageTools.sticker === "function") {
    reg("sticker", imageTools.sticker, { desc: "", category: "media" });
    reg("s", imageTools.sticker, { desc: "", category: "media" });
    reg("stick", imageTools.sticker, { desc: "", category: "media" });
  }

  if (typeof imageTools.toImage === "function") {
    reg("toimage", imageTools.toImage, { desc: "", category: "media" });
    reg("toimg", imageTools.toImage, { desc: "", category: "media" });
  }

  if (typeof imageTools.toVideo === "function") {
    reg("tovideo", imageTools.toVideo, { desc: "", category: "media" });
    reg("tovid", imageTools.toVideo, { desc: "", category: "media" });
  }

  if (typeof imageTools.toGif === "function") {
    reg("togif", imageTools.toGif, { desc: "", category: "media" });
  }

  if (typeof imageTools.toAudio === "function") {
    reg("toaudio", imageTools.toAudio, { desc: "", category: "media" });
    reg("tomp3", imageTools.toAudio, { desc: "", category: "media" });
  }

  if (typeof imageTools.removeBg === "function") {
    reg("removebg", imageTools.removeBg, { desc: "", category: "media" });
    reg("nobg", imageTools.removeBg, { desc: "", category: "media" });
    reg("rmbg", imageTools.removeBg, { desc: "", category: "media" });
  }

  if (typeof imageTools.meme === "function") {
    reg("meme", imageTools.meme, { desc: "", category: "fun" });
  }

  // ── IP LOOKUP (fallback if basic didn't provide) ────────
  if (typeof ipLookup.ip === "function" && !commands.has("ipinfo")) {
    reg("ipinfo", ipLookup.ip, { desc: "", category: "tools" });
  }
  if (typeof ipLookup.whois === "function" && !commands.has("whois")) {
    reg("whois", ipLookup.whois, { desc: "", category: "tools" });
  }
  if (typeof ipLookup.myip === "function" && !commands.has("myip")) {
    reg("myip", ipLookup.myip, { desc: "", category: "tools" });
  }
  if (typeof ipLookup.dns === "function" && !commands.has("dns")) {
    reg("dns", ipLookup.dns, { desc: "", category: "tools" });
  }

  // ── JOKES ──────────────────────────────────────────────
  if (typeof jokes.joke === "function") {
    reg("joke", jokes.joke, { desc: "", category: "fun" });
    reg("laugh", jokes.joke, { desc: "", category: "fun" });
    reg("funny", jokes.joke, { desc: "", category: "fun" });
  }

  if (typeof jokes.roast === "function") {
    reg("roast", jokes.roast, { desc: "", category: "fun" });
    reg("burn", jokes.roast, { desc: "", category: "fun" });
  }

  if (typeof jokes.pickupLine === "function") {
    reg("pickup", jokes.pickupLine, { desc: "", category: "fun" });
    reg("pickupline", jokes.pickupLine, { desc: "", category: "fun" });
    reg("flirt", jokes.pickupLine, { desc: "", category: "fun" });
  }

  // ── MOVIES ─────────────────────────────────────────────
  if (typeof movies.movie === "function") {
    reg("movie", movies.movie, { desc: "", category: "entertainment" });
    reg("film", movies.movie, { desc: "", category: "entertainment" });
    reg("imdb", movies.movie, { desc: "", category: "entertainment" });
    reg("movies", movies.movie, { desc: "", category: "entertainment" });
  }

  if (typeof movies.tv === "function") {
    reg("tv", movies.tv, { desc: "", category: "entertainment" });
    reg("series", movies.tv, { desc: "", category: "entertainment" });
    reg("show", movies.tv, { desc: "", category: "entertainment" });
  }

  if (typeof movies.recommend === "function") {
    reg("recommend", movies.recommend, { desc: "", category: "entertainment" });
    reg("rec", movies.recommend, { desc: "", category: "entertainment" });
    reg("suggest", movies.recommend, { desc: "", category: "entertainment" });
  }

  // ── MUSIC ──────────────────────────────────────────────
  if (typeof music.musicLyrics === "function") {
    reg("lyrics", music.musicLyrics, { desc: "", category: "music" });
    reg("lyric", music.musicLyrics, { desc: "", category: "music" });
    reg("words", music.musicLyrics, { desc: "", category: "music" });
  }

  if (typeof music.musicTrending === "function") {
    reg("trending", music.musicTrending, { desc: "", category: "music" });
    reg("chart", music.musicTrending, { desc: "", category: "music" });
  }

  if (typeof music.musicArtist === "function") {
    reg("artist", music.musicArtist, { desc: "", category: "music" });
  }

  if (typeof music.musicAlbum === "function") {
    reg("album", music.musicAlbum, { desc: "", category: "music" });
  }

  if (typeof music.musicSearch === "function") {
    reg("musicsearch", music.musicSearch, { desc: "", category: "music" });
    reg("findsong", music.musicSearch, { desc: "", category: "music" });
  }

  if (typeof music.musicGenius === "function") {
    reg("genius", music.musicGenius, { desc: "", category: "music" });
  }

  // ── NEWS ───────────────────────────────────────────────
  if (typeof news.news === "function") {
    reg("news", news.news, { desc: "", category: "info" });
    reg("headlines", news.news, { desc: "", category: "info" });
    reg("breaking", news.news, { desc: "", category: "info" });
    reg("update", news.news, { desc: "", category: "info" });
  }

  // ── NOTES ──────────────────────────────────────────────
  if (typeof notes.save === "function") {
    reg("note", notes.save, { desc: "", category: "tools" });
    reg("store", notes.save, { desc: "", category: "tools" });
  }

  if (typeof notes.get === "function") {
    reg("getnote", notes.get, { desc: "", category: "tools" });
    reg("recall", notes.get, { desc: "", category: "tools" });
  }

  if (typeof notes.list === "function") {
    reg("notes", notes.list, { desc: "", category: "tools" });
    reg("keys", notes.list, { desc: "", category: "tools" });
  }

  if (typeof notes.deleteKey === "function") {
    reg("delnote", notes.deleteKey, { desc: "", category: "tools" });
    reg("forget", notes.deleteKey, { desc: "", category: "tools" });
  }

  if (typeof notes.clearAll === "function") {
    reg("clearnotes", notes.clearAll, { desc: "", category: "tools" });
  }

  // ── QR ─────────────────────────────────────────────────
  if (typeof qr.qr === "function") {
    reg("qr", qr.qr, { desc: "", category: "tools" });
    reg("qrcode", qr.qr, { desc: "", category: "tools" });
  }

  // ── QUOTES ─────────────────────────────────────────────
  if (typeof quotes.quote === "function") {
    reg("quote", quotes.quote, { desc: "", category: "fun" });
    reg("motivation", quotes.quote, { desc: "", category: "fun" });
    reg("inspire", quotes.quote, { desc: "", category: "fun" });
    reg("wisdom", quotes.quote, { desc: "", category: "fun" });
  }

  // ── REMINDER ───────────────────────────────────────────
  if (typeof reminder.reminder === "function") {
    reg("remind", reminder.reminder, { desc: "", category: "tools" });
    reg("reminder", reminder.reminder, { desc: "", category: "tools" });
    reg("later", reminder.reminder, { desc: "", category: "tools" });
    reg("alarm", reminder.reminder, { desc: "", category: "tools" });
  }

  // ── SECURITY ───────────────────────────────────────────
  if (typeof security.scan === "function") {
    reg("scan", security.scan, { desc: "", category: "tools" });
    reg("virustotal", security.scan, { desc: "", category: "tools" });
    reg("checksafe", security.scan, { desc: "", category: "tools" });
  }

  // ── STOCKS ─────────────────────────────────────────────
  if (typeof stocks.stock === "function") {
    reg("stock", stocks.stock, { desc: "", category: "finance" });
    reg("stocks", stocks.stock, { desc: "", category: "finance" });
    reg("share", stocks.stock, { desc: "", category: "finance" });
  }

  // ── TRANSLATION (fallback if ai.translate didn't cover) ─
  if (
    typeof translation.translate === "function" &&
    !commands.has("translate")
  ) {
    reg("translate", translation.translate, { desc: "", category: "tools" });
    reg("tr", translation.translate, { desc: "", category: "tools" });
    reg("tl", translation.translate, { desc: "", category: "tools" });
    reg("lang", translation.translate, { desc: "", category: "tools" });
  }

  if (typeof translation.languages === "function") {
    reg("languages", translation.languages, { desc: "", category: "tools" });
    reg("langs", translation.languages, { desc: "", category: "tools" });
  }

  if (typeof translation.detect === "function") {
    reg("detect", translation.detect, { desc: "", category: "tools" });
    reg("langdetect", translation.detect, { desc: "", category: "tools" });
  }

  // ── TTS ────────────────────────────────────────────────
  if (typeof tts.tts === "function") {
    reg("tts", tts.tts, { desc: "", category: "tools" });
    reg("voice", tts.tts, { desc: "", category: "tools" });
    reg("say", tts.tts, { desc: "", category: "tools" });
  }

  if (typeof tts.ttsVoice === "function") {
    reg("voices", tts.ttsVoice, { desc: "", category: "tools" });
  }

  // ── UNIT CONVERTER ─────────────────────────────────────
  if (typeof unitConverter.convert === "function") {
    reg("convert", unitConverter.convert, { desc: "", category: "tools" });
    reg("conv", unitConverter.convert, { desc: "", category: "tools" });
    reg("uconvert", unitConverter.convert, { desc: "", category: "tools" });
  }

  if (typeof unitConverter.units === "function") {
    reg("units", unitConverter.units, { desc: "", category: "tools" });
  }

  if (typeof unitConverter.allunits === "function") {
    reg("allunits", unitConverter.allunits, { desc: "", category: "tools" });
  }

  // ── GROUP CORE ─────────────────────────────────────────
  if (group?.core) {
    if (typeof group.core.kick === "function") {
      reg("kick", group.core.kick, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
      reg("remove", group.core.kick, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.core.add === "function") {
      reg("add", group.core.add, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("invite", group.core.add, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.core.promote === "function") {
      reg("promote", group.core.promote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
      reg("makeadmin", group.core.promote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.core.demote === "function") {
      reg("demote", group.core.demote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
      reg("unadmin", group.core.demote, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.core.listAdmins === "function") {
      reg("listadmins", group.core.listAdmins, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
      reg("admins", group.core.listAdmins, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
      reg("admin", group.core.listAdmins, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
    }
  }

  // ── GROUP MODERATION ───────────────────────────────────
  if (group?.moderation) {
    if (typeof group.moderation.ban === "function") {
      reg("ban", group.moderation.ban, {
        groupOnly: true,
        adminOnly: true,
        requireBotAdmin: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.moderation.unban === "function") {
      reg("unban", group.moderation.unban, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.moderation.listBanned === "function") {
      reg("listbanned", group.moderation.listBanned, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("bans", group.moderation.listBanned, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.moderation.warn === "function") {
      reg("warn", group.moderation.warn, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.moderation.warnings === "function") {
      reg("warnings", group.moderation.warnings, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
      reg("warnlist", group.moderation.warnings, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof group.moderation.clearWarns === "function") {
      reg("clearwarns", group.moderation.clearWarns, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("resetwarns", group.moderation.clearWarns, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
  }

  // ── GROUP SETTINGS ─────────────────────────────────────
  if (group?.settings) {
    const gs = group.settings;
    if (typeof gs.mute === "function")
      reg("mute", gs.mute, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.unmute === "function")
      reg("unmute", gs.unmute, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.antiLink === "function")
      reg("antilink", gs.antiLink, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.antiSpam === "function")
      reg("antispam", gs.antiSpam, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.welcomeToggle === "function")
      reg("welcome", gs.welcomeToggle, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.setWelcome === "function")
      reg("setwelcome", gs.setWelcome, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.goodbyeToggle === "function")
      reg("goodbye", gs.goodbyeToggle, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.setGoodbye === "function")
      reg("setgoodbye", gs.setGoodbye, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.groupInfo === "function") {
      reg("groupinfo", gs.groupInfo, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
      reg("ginfo", gs.groupInfo, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
      reg("gstats", gs.groupInfo, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof gs.rules === "function") {
      reg("rules", gs.rules, { groupOnly: true, desc: "", category: "group" });
      reg("grouprules", gs.rules, {
        groupOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof gs.setRules === "function")
      reg("setrules", gs.setRules, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.link === "function")
      reg("link", gs.link, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.revoke === "function")
      reg("revoke", gs.revoke, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.tagAll === "function") {
      reg("tagall", gs.tagAll, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("everyone", gs.tagAll, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("all", gs.tagAll, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof gs.hideTag === "function") {
      reg("hidetag", gs.hideTag, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("htag", gs.hideTag, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof gs.deleteMsg === "function") {
      reg("delete", gs.deleteMsg, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
      reg("del", gs.deleteMsg, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    }
    if (typeof gs.leave === "function")
      reg("leave", gs.leave, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
    if (typeof gs.debug === "function")
      reg("debuggroup", gs.debug, {
        groupOnly: true,
        adminOnly: true,
        desc: "",
        category: "group",
      });
  }

  // ── ADMIN (BOT OWNER) ──────────────────────────────────
  if (admin) {
    if (typeof admin.addUser === "function") {
      reg("adduser", admin.addUser, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("auth", admin.addUser, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.removeUser === "function") {
      reg("removeuser", admin.removeUser, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("deauth", admin.removeUser, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.listUsers === "function") {
      reg("listusers", admin.listUsers, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("users", admin.listUsers, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.mode === "function") {
      reg("mode", admin.mode, { adminOnly: true, desc: "", category: "admin" });
      reg("setmode", admin.mode, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.broadcast === "function") {
      reg("broadcast", admin.broadcast, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("bc", admin.broadcast, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.globalBroadcast === "function") {
      reg("globalbroadcast", admin.globalBroadcast, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("gbc", admin.globalBroadcast, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.stats === "function") {
      reg("stats", admin.stats, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("botstats", admin.stats, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.superBan === "function") {
      reg("superban", admin.superBan, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.clearBans === "function") {
      reg("clearbans", admin.clearBans, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.restart === "function") {
      reg("restart", admin.restart, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("reboot", admin.restart, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.shutdown === "function") {
      reg("shutdown", admin.shutdown, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("off", admin.shutdown, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.botStatus === "function") {
      reg("botstatus", admin.botStatus, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
    if (typeof admin.adminEval === "function") {
      reg("eval", admin.adminEval, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
      reg("exec", admin.adminEval, {
        adminOnly: true,
        desc: "",
        category: "admin",
      });
    }
  }
}

// Register all commands
registerAllCommands();
console.log(`✅ Registered ${commands.size} commands`);

// ========== SAFE HELPERS ==========
function safeJid(jid) {
  if (!jid) return "";
  if (typeof jid === "object") return jid.id || jid.jid || String(jid);
  return String(jid);
}

function safePhone(jid) {
  return safeJid(jid).split("@")[0] || "";
}

// ========== MAIN COMMAND HANDLER ==========
export async function handleCommand(message, sock) {
  try {
    const from = message?.key?.remoteJid;
    if (!from) return;

    const isGroup = from.endsWith("@g.us");
    const isDM = from.endsWith("@s.whatsapp.net");
    const fromMe = !!message.key.fromMe;

    // Resolve real sender JID
    let userJid;
    if (isGroup) {
      userJid = safeJid(message.key.participant || from);
    } else if (fromMe) {
      const raw = sock?.user?.id || "";
      const phone = raw.split(":")[0].replace(/[^0-9]/g, "");
      userJid = phone ? `${phone}@s.whatsapp.net` : from;
    } else {
      userJid = from;
    }

    if (!userJid) return;

    const isAdminUser = isAdmin(userJid);
    const isAuthorizedUser = isAuthorized(userJid);

    // Where to send replies
    const replyTo = fromMe && isDM ? userJid : from;

    // Extract text
    const msgText = extractText(message);
    if (!msgText || msgText.trim() === "") return;
    const trimmed = msgText.trim();

    // Logging
    const tag = isAdminUser
      ? "👑 ADMIN"
      : isAuthorizedUser
        ? "✅ USER"
        : "👤 PUBLIC";
    const loc = isGroup ? "GROUP" : "DM";
    console.log(
      `📥 [${tag}][${loc}] ${safePhone(userJid)}: "${trimmed.substring(0, 60)}"`,
    );

    // Bot mode gate
    if (ENV.BOT_MODE === "private" && !isAdminUser && !isAuthorizedUser) {
      return sock.sendMessage(replyTo, {
        text: formatError(
          "ACCESS DENIED",
          `🔒 Bot is in *PRIVATE MODE*.\n\nContact: ${ENV.CREATOR_CONTACT || "admin"}`,
        ),
      });
    }

    // Rate limit
    if (!isAdminUser && isRateLimited(userJid, false)) {
      return sock.sendMessage(replyTo, {
        text: formatInfo("⏳ SLOW DOWN", getRateLimitMessage()),
      });
    }

    // Store for anti-delete
    if (message.key?.id) {
      deletedMessages.set(message.key.id, trimmed);
      setTimeout(() => deletedMessages.delete(message.key.id), 3600000);
    }

    // Group rule enforcement
    if (isGroup && !isAdminUser) {
      const settings = groupSettings.get(from) || {};
      if (settings.antilink && containsLink(trimmed)) {
        try {
          await handleRuleViolation("link", from, userJid, sock, message);
        } catch (_) {}
        return;
      }
      if (settings.antispam && isSpam(userJid, trimmed)) {
        try {
          await handleRuleViolation("spam", from, userJid, sock, message);
        } catch (_) {}
        return;
      }
    }

    // Non-command messages → auto-reply
    if (!trimmed.startsWith(ENV.PREFIX)) {
      const autoEnabled =
        autoReplyEnabled.get(userJid) ||
        autoReplyEnabled.get(from) ||
        ENV.AUTO_REPLY_ENABLED ||
        false;

      if (autoEnabled && typeof autoReplyHandler?.handleReply === "function") {
        const ctxInfo = message.message?.extendedTextMessage?.contextInfo || {};
        const quotedParticipant =
          ctxInfo.participant || ctxInfo.remoteJid || "";
        const botPhone = sock.user?.id?.split(":")[0] || "";
        const isReplyToBot = botPhone && quotedParticipant.includes(botPhone);
        const isActive = userConversations.has(userJid);
        const shouldAutoReply = isDM ? autoEnabled : isReplyToBot || isActive;

        if (shouldAutoReply) {
          const cooldownKey = `ar_${userJid}`;
          if (Date.now() - (userCooldown.get(cooldownKey) || 0) >= 3000) {
            try {
              const replied = await autoReplyHandler.handleReply(
                trimmed,
                userJid,
                isAdminUser,
                sock,
                replyTo,
                message,
              );
              if (replied) {
                userCooldown.set(cooldownKey, Date.now());
                if (isDM) userConversations.set(userJid, true);
              }
            } catch (e) {
              console.error("Auto-reply error:", e.message);
            }
          }
        }
      }
      return;
    }

    // Parse command
    const body = trimmed.slice(ENV.PREFIX.length).trim();
    if (!body) return;
    const parts = body.split(/ +/);
    const commandName = parts.shift()?.toLowerCase()?.trim();
    if (!commandName) return;
    const args = parts;
    const fullArgs = parts.join(" ");

    console.log(
      `⚡ [${loc}] ${ENV.PREFIX}${commandName}${fullArgs ? ` "${fullArgs.substring(0, 40)}"` : ""} | ${safePhone(userJid)}`,
    );

    // Track usage
    if (!commandUsage.has(userJid)) commandUsage.set(userJid, {});
    commandUsage.get(userJid)[commandName] =
      (commandUsage.get(userJid)[commandName] || 0) + 1;
    commandStats.set(commandName, (commandStats.get(commandName) || 0) + 1);

    // Find command
    const command = commands.get(commandName);
    if (!command) {
      console.log(`❓ Unknown command: ${ENV.PREFIX}${commandName}`);
      await sock.sendMessage(replyTo, {
        text: formatInfo(
          "UNKNOWN COMMAND",
          `❓ *.${commandName}* not found.\n\nType *.menu* to see all commands!`,
        ),
      });
      return;
    }

    // Permission checks
    if (command.adminOnly && !isAdminUser) {
      return sock.sendMessage(replyTo, {
        text: formatError(
          "ACCESS DENIED",
          "⛔ This command is for the *bot owner* only.",
        ),
      });
    }

    if (command.groupOnly && !isGroup) {
      return sock.sendMessage(replyTo, {
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
        return sock.sendMessage(replyTo, {
          text: formatGroupError(
            "BOT NOT ADMIN",
            `❌ I need group admin rights to run *.${commandName}*. Please promote me first!`,
          ),
        });
      }
    }

    // Execute
    try {
      await command.handler({
        args,
        fullArgs,
        message,
        from: replyTo,
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
      console.log(`✅ Done: ${ENV.PREFIX}${commandName}`);
    } catch (cmdError) {
      console.error(
        `❌ Error in ${ENV.PREFIX}${commandName}:`,
        cmdError.message,
      );
      try {
        await sock.sendMessage(replyTo, {
          text: formatError(
            "COMMAND ERROR",
            `❌ *.${commandName}* failed:\n${cmdError.message || "Unknown error"}`,
          ),
        });
      } catch (_) {}
    }
  } catch (error) {
    console.error("❌ handleCommand fatal:", error.message);
    try {
      const replyTarget = message?.key?.remoteJid;
      if (replyTarget)
        await sock.sendMessage(replyTarget, {
          text: formatError(
            "SYSTEM ERROR",
            error.message || "Unexpected error.",
          ),
        });
    } catch (_) {}
  }
}

// ── EXPORTS ───────────────────────────────────────────────
export { commands, commandStats };
