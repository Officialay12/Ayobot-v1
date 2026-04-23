// @ts-nocheck
// ════════════════════════════════════════════════════════════════════════════
//  commands/group/downloader.js — AYOBOT v2.0.0
//  Author  : AYOCODES
//  Fixed   : All APIs updated | Context shape fixed | httpsAgent hoisted
//            | tryApis wired up | TikTok URL parse hardened | Spotify honest
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import https from "https";            // ✅ top-level import — not dynamic per-call
import { ENV } from "../../index.js";
import { sendMsg } from "../../index.js";
import { formatError, formatInfo } from "../../utils/formatters.js";

// ════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

// ✅ Single shared agent — not re-created inside retry loops
const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

const WORKING_INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://yewtu.be",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://inv.riverside.rocks",
  "https://invidious.slipfox.xyz",
];

// ════════════════════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ════════════════════════════════════════════════════════════════════════════

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const BROWSER_HEADERS = () => ({
  "User-Agent": getRandomUserAgent(),
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="124", "Google Chrome";v="124"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
});

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function formatDuration(secs) {
  const s = parseInt(secs) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function formatNumber(n) {
  if (!n) return "N/A";
  const v = parseInt(n);
  if (isNaN(v)) return "N/A";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Download a URL to a Buffer with retries.
 * Uses the shared HTTPS_AGENT — no per-call agent creation.
 */
async function downloadBuffer(url, timeoutMs = 120_000, retries = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 200_000_000,
        maxRedirects: 10,
        headers: {
          "User-Agent": getRandomUserAgent(),
          Accept: "*/*",
          "Accept-Encoding": "identity",
          Range: "bytes=0-",
          Referer: (() => {
            try { return new URL(url).origin; } catch { return url; }
          })(),
        },
        httpsAgent: HTTPS_AGENT,  // ✅ shared instance
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5_000) throw new Error(`Buffer too small: ${buf.length} bytes`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(`[Download] Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

/**
 * Try a list of API functions in order, returning the first that succeeds.
 * Each fn must return an object with at least one of: videoUrl | audioUrl | url
 *
 * ✅ Previously defined but never called — now used by all downloaders.
 *
 * @param {{ name: string, fn: () => Promise<object> }[]} apis
 * @returns {Promise<{ result: object, source: string } | null>}
 */
async function tryApis(apis) {
  for (const { name, fn } of apis) {
    try {
      const result = await fn();
      const hasMedia = result?.videoUrl || result?.audioUrl || result?.url;
      if (hasMedia) {
        console.log(`[Downloader] ✅ ${name} succeeded`);
        return { result, source: name };
      }
      console.log(`[Downloader] ⚠️ ${name} returned no media URL`);
    } catch (err) {
      console.log(`[Downloader] ❌ ${name} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  YOUTUBE
// ════════════════════════════════════════════════════════════════════════════

async function searchYouTube(query) {
  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/search`, {
        params: { q: query, type: "video", page: 1 },
        timeout: 10_000,
        headers: { Accept: "application/json", "User-Agent": getRandomUserAgent() },
      });
      const first = res.data?.[0];
      if (!first?.videoId) continue;

      const thumbs = first.videoThumbnails || [];
      const thumb  =
        thumbs.find((t) => t.quality === "maxresdefault")?.url ||
        thumbs.find((t) => t.quality === "high")?.url          ||
        `https://img.youtube.com/vi/${first.videoId}/hqdefault.jpg`;

      return {
        videoId  : first.videoId,
        title    : first.title || query,
        url      : `https://www.youtube.com/watch?v=${first.videoId}`,
        duration : formatDuration(first.lengthSeconds),
        views    : formatNumber(first.viewCount),
        author   : first.author || "Unknown",
        thumbnail: thumb,
      };
    } catch (_) {}
  }
  return null;
}

async function downloadYouTubeAudio(videoId, videoUrl) {
  const url = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;

  return tryApis([
    {
      name: "y2mate.nu",
      fn: async () => {
        const analyzeRes = await axios.post(
          "https://www.y2mate.nu/api/analyze",
          new URLSearchParams({ q: url, vt: "home" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Origin: "https://www.y2mate.nu",
              Referer: "https://www.y2mate.nu/",
            },
            timeout: 15_000,
          },
        );
        const mp3Key = analyzeRes.data?.links?.mp3?.["128kbps"]?.k;
        if (!mp3Key) throw new Error("No MP3 key");

        const convertRes = await axios.post(
          "https://www.y2mate.nu/api/convert",
          new URLSearchParams({ vid: videoId, k: mp3Key }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
            },
            timeout: 20_000,
          },
        );
        if (!convertRes.data?.dlink) throw new Error("No download link");
        const buf = await downloadBuffer(convertRes.data.dlink, 120_000);
        return { audioUrl: convertRes.data.dlink, buffer: buf };
      },
    },
    {
      name: "Invidious adaptive",
      fn: async () => {
        for (const instance of WORKING_INVIDIOUS_INSTANCES) {
          try {
            const videoRes = await axios.get(
              `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
              { timeout: 10_000, headers: { "User-Agent": getRandomUserAgent() } },
            );
            const formats = (videoRes.data?.adaptiveFormats || [])
              .filter((f) => f.type?.startsWith("audio/") && f.url)
              .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
            const best = formats[0];
            if (!best?.url) continue;
            const buf = await downloadBuffer(best.url, 120_000);
            if (buf.length > 10_000) return { audioUrl: best.url, buffer: buf };
          } catch (_) {}
        }
        throw new Error("All Invidious instances failed");
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//  TIKTOK
// ════════════════════════════════════════════════════════════════════════════

async function fetchTikTok(url) {
  return tryApis([
    {
      name: "tikwm",
      fn: async () => {
        const res = await axios.post(
          "https://tikwm.com/api/",
          new URLSearchParams({ url, hd: "1" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
            },
            timeout: 15_000,
          },
        );
        const d = res.data?.data;
        if (!d?.play) throw new Error("No play URL");
        return { videoUrl: d.hdplay || d.play, title: d.title || "TikTok", author: d.author?.nickname || "User" };
      },
    },
    {
      name: "snaptik",
      fn: async () => {
        const res = await axios.post(
          "https://snaptik.app/action.php",
          new URLSearchParams({ url, lang: "en" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://snaptik.app/",
            },
            timeout: 15_000,
          },
        );
        const match = res.data?.match(/href="(https:\/\/cdn[^"]+\.mp4)"/);
        if (!match) throw new Error("No video link in response");
        return { videoUrl: match[1], title: "TikTok Video", author: "User" };
      },
    },
    {
      name: "tikmate",
      fn: async () => {
        // ✅ Hardened URL parse — validate before splitting
        const videoIdMatch = url.match(/\/video\/(\d+)/);
        if (!videoIdMatch) throw new Error("Cannot extract TikTok video ID from URL");
        const videoId = videoIdMatch[1];

        const res = await axios.get(`https://tikmate.cc/en/${videoId}`, {
          headers: BROWSER_HEADERS(),
          timeout: 15_000,
        });
        const match = res.data?.match(/<source src="([^"]+\.mp4)"/);
        if (!match) throw new Error("No source tag found");
        return { videoUrl: match[1], title: "TikTok Video", author: "User" };
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//  INSTAGRAM
// ════════════════════════════════════════════════════════════════════════════

async function fetchInstagram(url) {
  return tryApis([
    {
      name: "saveig",
      fn: async () => {
        const res = await axios.post(
          "https://saveig.app/api/ajaxSearch",
          new URLSearchParams({ q: url, t: "media", lang: "en" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://saveig.app/en",
              "X-Requested-With": "XMLHttpRequest",
            },
            timeout: 15_000,
          },
        );
        const html = res.data?.data;
        const videoMatch = html?.match(/<video[^>]*><source src="([^"]+\.mp4[^"]*)"/);
        const imgMatch   = html?.match(/<img[^>]*src="([^"]+\.(jpg|jpeg|png))"/);
        if (videoMatch) return { url: videoMatch[1], type: "video" };
        if (imgMatch)   return { url: imgMatch[1],   type: "image" };
        throw new Error("No media in response HTML");
      },
    },
    {
      name: "instasave",
      fn: async () => {
        const res = await axios.post(
          "https://instasave.io/action.php",
          new URLSearchParams({ url, action: "get" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://instasave.io/",
            },
            timeout: 15_000,
          },
        );
        if (res.data?.video_url) return { url: res.data.video_url, type: "video" };
        if (res.data?.image_url) return { url: res.data.image_url, type: "image" };
        throw new Error("No media URLs in response");
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//  FACEBOOK
// ════════════════════════════════════════════════════════════════════════════

async function fetchFacebook(url) {
  return tryApis([
    {
      name: "fdown",
      fn: async () => {
        const res = await axios.post(
          "https://fdown.net/download.php",
          new URLSearchParams({ URLz: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://fdown.net/",
            },
            timeout: 15_000,
          },
        );
        const hdMatch = res.data?.match(/id="hdlink"\s+href="([^"]+)"/);
        const sdMatch = res.data?.match(/id="sdlink"\s+href="([^"]+)"/);
        const videoUrl = hdMatch?.[1] || sdMatch?.[1];
        if (!videoUrl) throw new Error("No HD/SD link in response");
        return { videoUrl };
      },
    },
    {
      name: "getfvid",
      fn: async () => {
        const res = await axios.post(
          "https://getfvid.com/downloader",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://getfvid.com/",
            },
            timeout: 15_000,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No mp4 link in response");
        return { videoUrl: match[1] };
      },
    },
    {
      name: "fbdown",
      fn: async () => {
        const res = await axios.post(
          "https://fbdown.net/download.php",
          new URLSearchParams({ URLz: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS(),
              Referer: "https://fbdown.net/",
            },
            timeout: 15_000,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No mp4 link in response");
        return { videoUrl: match[1] };
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//  TWITTER / X
// ════════════════════════════════════════════════════════════════════════════

async function fetchTwitter(url) {
  return tryApis([
    {
      name: "fxtwitter",
      fn: async () => {
        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        if (!tweetId) throw new Error("No tweet ID in URL");

        const res = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
          headers: { Accept: "application/json", "User-Agent": getRandomUserAgent() },
          timeout: 15_000,
        });
        const variants = res.data?.tweet?.media?.videos?.[0]?.variants || [];
        const mp4s = variants
          .filter((v) => v.content_type === "video/mp4" || v.url?.includes(".mp4"))
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (!mp4s[0]?.url) throw new Error("No MP4 variant found");
        return { videoUrl: mp4s[0].url };
      },
    },
    {
      name: "twitsave",
      fn: async () => {
        const res = await axios.get("https://twitsave.com/info", {
          params: { url },
          headers: BROWSER_HEADERS(),
          timeout: 15_000,
        });
        const matches = [...(res.data?.matchAll(/data-url="([^"]+\.mp4[^"]*)"/g) || [])];
        if (!matches.length) throw new Error("No data-url MP4 found");
        return { videoUrl: matches[0][1] };
      },
    },
  ]);
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMANDS
//  All commands destructure from the full handler context object:
//  { args, fullArgs, message, from, sock, userJid, isAdmin, ... }
// ════════════════════════════════════════════════════════════════════════════

// ── PLAY (YouTube Audio) ──────────────────────────────────────────────────
export async function play({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 PLAY MUSIC",
        "Download any song from YouTube\n\nUsage: .play <song name or YouTube URL>\n\nExamples:\n.play Shape of You\n.play https://youtu.be/abc123",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching for *${query}*...` });

  // Allow direct YouTube URL bypass
  let videoInfo = null;
  if (query.includes("youtu")) {
    const id = extractVideoId(query);
    if (id) {
      videoInfo = {
        videoId  : id,
        title    : "YouTube Video",
        url      : query,
        author   : "Unknown",
        duration : "Unknown",
        thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      };
    }
  }

  if (!videoInfo) videoInfo = await searchYouTube(query);

  if (!videoInfo) {
    return sendMsg(sock, from, {
      text: formatError("NOT FOUND", `No YouTube results for "${query}"\n\nTry a different search term.`),
    });
  }

  const infoCaption = `📀 *${videoInfo.title}*\n🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration}\n\n⬇️ Downloading audio...\n\n${TAG}`;
  try {
    await sendMsg(sock, from, { image: { url: videoInfo.thumbnail }, caption: infoCaption });
  } catch (_) {
    await sendMsg(sock, from, { text: infoCaption });
  }

  const audioResult = await downloadYouTubeAudio(videoInfo.videoId, videoInfo.url);

  if (audioResult?.result?.buffer) {
    const buf = audioResult.result.buffer;
    try {
      await sendMsg(sock, from, { audio: buf, mimetype: "audio/mpeg", ptt: false });
      await sendMsg(sock, from, {
        text: `✅ *${videoInfo.title}*\n🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration} | 📦 ${formatSize(buf.length)}\n\n${TAG}`,
      });
    } catch (_) {
      await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}`) });
    }
  } else {
    await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}`) });
  }
}

// ── YOUTUBE INFO ──────────────────────────────────────────────────────────
export async function youtube({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo("📺 YOUTUBE", "Get YouTube video info\n\nUsage: .yt <url>"),
    });
  }

  const videoId = extractVideoId(query);
  if (!videoId) {
    return sendMsg(sock, from, {
      text: formatError("INVALID URL", "Please provide a valid YouTube URL."),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching video info..." });

  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
        timeout: 8_000,
        headers: { "User-Agent": getRandomUserAgent() },
      });
      if (res.data?.title) {
        const d = res.data;
        await sendMsg(sock, from, {
          text: `📺 *${d.title}*\n🎤 ${d.author}\n⏱️ ${formatDuration(d.lengthSeconds)} | 👁️ ${formatNumber(d.viewCount)}\n🔗 https://youtu.be/${videoId}\n\n${TAG}`,
        });
        return;
      }
    } catch (_) {}
  }

  await sendMsg(sock, from, { text: formatError("ERROR", "Could not fetch video info.") });
}

// ── TIKTOK ───────────────────────────────────────────────────────────────
export async function tiktok({ fullArgs, from, sock }) {
  const url = fullArgs?.trim();

  if (!url) {
    return sendMsg(sock, from, {
      text: formatInfo("📱 TIKTOK", "Download TikTok videos without watermark\n\nUsage: .tiktok <url>"),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading TikTok video..." });

  const fetched = await fetchTikTok(url);

  if (!fetched) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download TikTok video.\n\nUse the direct share URL from the TikTok app."),
    });
  }

  const { result: info, source } = fetched;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120_000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `📱 *TikTok*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `📱 TikTok\n\n🔗 ${info.videoUrl}`) });
  }
}

// ── INSTAGRAM ─────────────────────────────────────────────────────────────
export async function instagram({ fullArgs, from, sock }) {
  const url = fullArgs?.trim();

  if (!url) {
    return sendMsg(sock, from, {
      text: formatInfo("📸 INSTAGRAM", "Download Instagram posts/reels\n\nUsage: .ig <url>"),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Instagram media..." });

  const fetched = await fetchInstagram(url);

  if (!fetched) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Instagram media.\n\nMake sure the URL is from a public post."),
    });
  }

  const { result: info, source } = fetched;
  try {
    const buf = await downloadBuffer(info.url, 120_000);
    const caption = `📸 *Instagram*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`;
    if (info.type === "video") {
      await sendMsg(sock, from, { video: buf, caption });
    } else {
      await sendMsg(sock, from, { image: buf, caption });
    }
  } catch (_) {
    await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `📸 Instagram\n\n🔗 ${info.url}`) });
  }
}

// ── FACEBOOK ──────────────────────────────────────────────────────────────
export async function facebook({ fullArgs, from, sock }) {
  const url = fullArgs?.trim();

  if (!url) {
    return sendMsg(sock, from, {
      text: formatInfo("👤 FACEBOOK", "Download Facebook videos\n\nUsage: .fb <url>"),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Facebook video..." });

  const fetched = await fetchFacebook(url);

  if (!fetched) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Facebook video.\n\nUse the share link directly from the video."),
    });
  }

  const { result: info, source } = fetched;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120_000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `👤 *Facebook*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `👤 Facebook\n\n🔗 ${info.videoUrl}`) });
  }
}

// ── TWITTER / X ───────────────────────────────────────────────────────────
export async function twitter({ fullArgs, from, sock }) {
  const url = fullArgs?.trim();

  if (!url) {
    return sendMsg(sock, from, {
      text: formatInfo("🐦 TWITTER/X", "Download Twitter/X videos\n\nUsage: .twitter <url>"),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Twitter/X video..." });

  const fetched = await fetchTwitter(url);

  if (!fetched) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Twitter/X video.\n\nMake sure the tweet contains a video."),
    });
  }

  const { result: info, source } = fetched;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120_000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `🐦 *Twitter/X*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, { text: formatInfo("🔗 LINK", `🐦 Twitter/X\n\n🔗 ${info.videoUrl}`) });
  }
}

// ── SPOTIFY ───────────────────────────────────────────────────────────────
// ✅ Honest about the source: uses JioSaavn for audio (not Spotify's API).
//    Spotify's API doesn't allow audio downloads — this is the best available.
export async function spotify({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo("🎵 SPOTIFY", "Search and download a track\n\nUsage: .spotify <song name>\n\n⚠️ Note: Audio sourced from JioSaavn (best legal match)."),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Searching for track..." });

  try {
    const res = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=1`,
      { timeout: 15_000, headers: { "User-Agent": getRandomUserAgent() } },
    );
    const track = res.data?.data?.results?.[0];
    if (!track) throw new Error("No results");

    const downloadUrls = track.downloadUrl || [];
    const audioUrl =
      downloadUrls.find((d) => d.quality === "320kbps")?.url ||
      downloadUrls.find((d) => d.quality === "160kbps")?.url ||
      downloadUrls[downloadUrls.length - 1]?.url;

    const thumb = track.image?.find((i) => i.quality === "500x500")?.url || track.image?.[0]?.url;
    const artists = track.artists?.primary?.map((a) => a.name).join(", ") || "Unknown";
    const caption = `🎵 *${track.name}*\n🎤 ${artists}\n💿 ${track.album?.name || "Unknown"}\n⏱️ ${formatDuration(track.duration)}\n⚠️ _Audio via JioSaavn_\n\n${TAG}`;

    if (thumb) {
      try { await sendMsg(sock, from, { image: { url: thumb }, caption }); }
      catch (_) { await sendMsg(sock, from, { text: caption }); }
    } else {
      await sendMsg(sock, from, { text: caption });
    }

    if (audioUrl) {
      const buf = await downloadBuffer(audioUrl, 120_000);
      await sendMsg(sock, from, { audio: buf, mimetype: "audio/mpeg", ptt: false });
    } else {
      await sendMsg(sock, from, { text: "⚠️ Audio not available for this track." });
    }
  } catch (_) {
    await sendMsg(sock, from, { text: formatError("NOT FOUND", "Could not find that track. Try a different name.") });
  }
}

// ── PINTEREST ─────────────────────────────────────────────────────────────
export async function pinterest({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo("📌 PINTEREST", "Search Pinterest for images\n\nUsage: .pin <search term>"),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching Pinterest for "${query}"...` });

  // Method 1: Pinterest API
  try {
    const res = await axios.get("https://www.pinterest.com/resource/BaseSearchResource/get/", {
      params: {
        source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
        data: JSON.stringify({ options: { query, scope: "pins", page_size: 25 } }),
      },
      headers: { ...BROWSER_HEADERS(), "X-Requested-With": "XMLHttpRequest" },
      timeout: 15_000,
    });
    const pins = res.data?.resource_response?.data?.results?.filter((p) => p.images?.["736x"]?.url);
    if (pins?.length) {
      const pin = pins[Math.floor(Math.random() * pins.length)];
      await sendMsg(sock, from, { image: { url: pin.images["736x"].url }, caption: `📌 *${query}*\n\n${TAG}` });
      return;
    }
  } catch (_) {}

  // Method 2: DuckDuckGo image fallback
  try {
    const tokenRes = await axios.get(
      `https://duckduckgo.com/?q=${encodeURIComponent(query + " site:pinterest.com")}&iax=images&ia=images`,
      { headers: BROWSER_HEADERS(), timeout: 8_000 },
    );
    const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
    if (token) {
      const imgRes = await axios.get(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
        { headers: { ...BROWSER_HEADERS(), Referer: "https://duckduckgo.com/" }, timeout: 8_000 },
      );
      const images = imgRes.data?.results;
      if (images?.length) {
        const img = images[Math.floor(Math.random() * Math.min(images.length, 10))];
        await sendMsg(sock, from, { image: { url: img.image }, caption: `📌 *${query}*\n\n${TAG}` });
        return;
      }
    }
  } catch (_) {}

  await sendMsg(sock, from, { text: formatError("NOT FOUND", "No images found. Try a different search term.") });
}

// ── IMAGE SEARCH ──────────────────────────────────────────────────────────
// Renamed internally to imageSearch to avoid collision with WhatsApp's
// imageMessage property name — still exported as `image` for the command map.
export async function imageSearch({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo("🖼️ IMAGE", "Search for any image\n\nUsage: .img <search term>"),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching images for "${query}"...` });

  if (ENV.PIXABAY_KEY) {
    try {
      const res = await axios.get("https://pixabay.com/api/", {
        params: { key: ENV.PIXABAY_KEY, q: query, per_page: 20, safesearch: true, image_type: "photo" },
        timeout: 15_000,
      });
      const hits = res.data?.hits;
      if (hits?.length) {
        const img = hits[Math.floor(Math.random() * hits.length)].largeImageURL;
        await sendMsg(sock, from, { image: { url: img }, caption: `🖼️ *${query}*\n\n${TAG}` });
        return;
      }
    } catch (_) {}
  }

  try {
    const tokenRes = await axios.get(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers: BROWSER_HEADERS(), timeout: 8_000 },
    );
    const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
    if (token) {
      const imgRes = await axios.get(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
        { headers: { ...BROWSER_HEADERS(), Referer: "https://duckduckgo.com/" }, timeout: 8_000 },
      );
      const images = imgRes.data?.results;
      if (images?.length) {
        const img = images[Math.floor(Math.random() * Math.min(images.length, 15))].image;
        await sendMsg(sock, from, { image: { url: img }, caption: `🖼️ *${query}*\n\n${TAG}` });
        return;
      }
    }
  } catch (_) {}

  await sendMsg(sock, from, { text: formatError("NOT FOUND", "No images found for that query.") });
}

// Export `image` as alias pointing to the renamed function
export { imageSearch as image };

// ── GIF SEARCH ────────────────────────────────────────────────────────────
export async function gif({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo("🎞️ GIF", "Search for animated GIFs\n\nUsage: .gif <search term>"),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching GIFs for "${query}"...` });

  if (ENV.GIPHY_KEY) {
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
        params: { api_key: ENV.GIPHY_KEY, q: query, limit: 20, rating: "g" },
        timeout: 15_000,
      });
      const results = res.data?.data;
      if (results?.length) {
        const item   = results[Math.floor(Math.random() * results.length)];
        const gifUrl = item.images?.original?.mp4 || item.images?.original?.url;
        await sendMsg(sock, from, { video: { url: gifUrl }, caption: `🎞️ *${query}*\n\n${TAG}`, gifPlayback: true });
        return;
      }
    } catch (_) {}
  }

  if (ENV.TENOR_KEY) {
    try {
      const res = await axios.get("https://tenor.googleapis.com/v2/search", {
        params: { q: query, key: ENV.TENOR_KEY, limit: 10, media_filter: "mp4" },
        timeout: 15_000,
      });
      const results = res.data?.results;
      if (results?.length) {
        const item   = results[Math.floor(Math.random() * results.length)];
        const gifUrl = item.media_formats?.mp4?.url || item.media_formats?.gif?.url;
        await sendMsg(sock, from, { video: { url: gifUrl }, caption: `🎞️ *${query}*\n\n${TAG}`, gifPlayback: true });
        return;
      }
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text: formatError("NOT FOUND", "No GIFs found.\n\nSet GIPHY_KEY or TENOR_KEY in your environment to enable GIF search."),
  });
}

// ── UNIVERSAL DOWNLOAD ────────────────────────────────────────────────────
export async function download({ fullArgs, from, sock }) {
  const query = fullArgs?.trim();

  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "⬇️ DOWNLOAD",
        "Universal Media Downloader — paste any supported URL\n\nSupported platforms:\n• YouTube → .play\n• TikTok  → .tiktok\n• Instagram → .ig\n• Facebook → .fb\n• Twitter/X → .twitter\n• Spotify → .spotify",
      ),
    });
  }

  let url = query;
  if (!url.startsWith("http")) url = "https://" + url;

  const ctx = { fullArgs: url, from, sock };

  if (url.includes("youtube.com") || url.includes("youtu.be")) return play(ctx);
  if (url.includes("tiktok.com"))                               return tiktok(ctx);
  if (url.includes("instagram.com"))                            return instagram(ctx);
  if (url.includes("facebook.com") || url.includes("fb.watch")) return facebook(ctx);
  if (url.includes("twitter.com")  || url.includes("x.com"))   return twitter(ctx);
  if (url.includes("spotify.com"))                              return spotify(ctx);

  await sendMsg(sock, from, {
    text: formatError(
      "UNSUPPORTED URL",
      "That URL is not supported.\n\nUse a specific command instead:\n.tiktok | .ig | .fb | .twitter | .play | .spotify",
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════════════════════

export default {
  play,
  youtube,
  tiktok,
  instagram,
  facebook,
  twitter,
  spotify,
  pinterest,
  image: imageSearch,   // export under the command-map name
  gif,
  download,
};
