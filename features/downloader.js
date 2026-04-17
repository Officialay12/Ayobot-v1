// @ts-nocheck
// ════════════════════════════════════════════════════════════════════════════
//  commands/group/downloader.js — AYOBOT v2.0.0
//  Author  : AYOCODES
//  Fixed   : All APIs updated and working - Enhanced bypass capabilities
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import { ENV } from "../../index.js";
import { sendMsg } from "../../index.js";
import { formatError, formatInfo } from "../../utils/formatters.js";

// ════════════════════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ════════════════════════════════════════════════════════════════════════════

const TAG = `⚡ _AYOBOT v2_ | 👑 _AYOCODES_`;

// Rotating User Agents for bypass
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

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
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function downloadBuffer(url, timeoutMs = 120000, retries = 5) {
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
          Referer: new URL(url).origin,
        },
        httpsAgent: new (await import("https")).Agent({ rejectUnauthorized: false }),
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5000)
        throw new Error(`Buffer too small: ${buf.length} bytes`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(`[Download] Attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries)
        await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

async function tryApis(fns, labels) {
  for (let i = 0; i < fns.length; i++) {
    try {
      const result = await fns[i]();
      if (result && (result.videoUrl || result.url || result.audioUrl)) {
        console.log(`[Downloader] ✅ ${labels[i]} succeeded`);
        return { result, source: labels[i] };
      }
    } catch (err) {
      console.log(`[Downloader] ❌ ${labels[i]} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  YOUTUBE SEARCH & DOWNLOAD (ENHANCED)
// ════════════════════════════════════════════════════════════════════════════

const WORKING_INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://yewtu.be",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://inv.riverside.rocks",
  "https://invidious.slipfox.xyz",
];

async function searchYouTube(query) {
  // Method 1: Invidious API
  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/search`, {
        params: { q: query, type: "video", page: 1 },
        timeout: 10000,
        headers: { Accept: "application/json", "User-Agent": getRandomUserAgent() },
      });
      const first = res.data?.[0];
      if (first?.videoId) {
        const thumbs = first.videoThumbnails || [];
        const thumb =
          thumbs.find((t) => t.quality === "maxresdefault")?.url ||
          thumbs.find((t) => t.quality === "high")?.url ||
          `https://img.youtube.com/vi/${first.videoId}/hqdefault.jpg`;
        return {
          videoId: first.videoId,
          title: first.title || query,
          url: `https://www.youtube.com/watch?v=${first.videoId}`,
          duration: formatDuration(first.lengthSeconds),
          views: formatNumber(first.viewCount),
          author: first.author || "Unknown",
          thumbnail: thumb,
        };
      }
    } catch (_) {}
  }
  return null;
}

async function downloadYouTubeAudio(videoId, videoUrl) {
  const url = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;

  // Method 1: y2mate.nu
  try {
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
        timeout: 15000,
      },
    );
    const mp3Key = analyzeRes.data?.links?.mp3?.["128kbps"]?.k;
    if (mp3Key) {
      const convertRes = await axios.post(
        "https://www.y2mate.nu/api/convert",
        new URLSearchParams({ vid: videoId, k: mp3Key }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...BROWSER_HEADERS(),
          },
          timeout: 20000,
        },
      );
      if (convertRes.data?.dlink) {
        const buf = await downloadBuffer(convertRes.data.dlink, 120000);
        if (buf.length > 10000) return { buffer: buf, source: "y2mate.nu" };
      }
    }
  } catch (err) {
    console.log("Audio y2mate failed:", err.message);
  }

  // Method 2: Invidious adaptive audio
  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      const videoRes = await axios.get(
        `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
        { timeout: 10000, headers: { "User-Agent": getRandomUserAgent() } },
      );
      const formats = (videoRes.data?.adaptiveFormats || [])
        .filter((f) => f.type?.startsWith("audio/") && f.url)
        .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
      const best = formats[0];
      if (best?.url) {
        const buf = await downloadBuffer(best.url, 120000);
        if (buf.length > 10000) return { buffer: buf, source: "Invidious" };
      }
    } catch (_) {}
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  ENHANCED TIKTOK (MULTIPLE APIS)
// ════════════════════════════════════════════════════════════════════════════

async function downloadTikTok(url) {
  const apis = [
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
            timeout: 15000,
          },
        );
        const d = res.data?.data;
        if (!d?.play) throw new Error("No URL");
        return {
          videoUrl: d.hdplay || d.play,
          title: d.title || "TikTok",
          author: d.author?.nickname || "User",
          music: d.music,
        };
      },
    },
    {
      name: "tikmate",
      fn: async () => {
        const res = await axios.get(`https://tikmate.cc/en/${url.split("/video/")[1]?.split("?")[0]}`, {
          headers: BROWSER_HEADERS(),
          timeout: 15000,
        });
        const match = res.data?.match(/<source src="([^"]+\.mp4)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1], title: "TikTok Video", author: "User" };
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
            timeout: 15000,
          },
        );
        const match = res.data?.match(/href="(https:\/\/cdn[^"]+\.mp4)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1], title: "TikTok Video", author: "User" };
      },
    },
  ];

  for (const api of apis) {
    try {
      const result = await api.fn();
      if (result?.videoUrl) {
        console.log(`[TikTok] ✅ ${api.name} succeeded`);
        return { result, source: api.name };
      }
    } catch (err) {
      console.log(`[TikTok] ❌ ${api.name} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  ENHANCED INSTAGRAM
// ════════════════════════════════════════════════════════════════════════════

async function downloadInstagram(url) {
  const apis = [
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
            timeout: 15000,
          },
        );
        const html = res.data?.data;
        const videoMatch = html?.match(/<video[^>]*><source src="([^"]+\.mp4[^"]*)"/);
        const imgMatch = html?.match(/<img[^>]*src="([^"]+\.(jpg|jpeg|png))"/);
        if (videoMatch) return { url: videoMatch[1], type: "video" };
        if (imgMatch) return { url: imgMatch[1], type: "image" };
        throw new Error("No media");
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
            timeout: 15000,
          },
        );
        const data = res.data;
        if (data?.video_url) return { url: data.video_url, type: "video" };
        if (data?.image_url) return { url: data.image_url, type: "image" };
        throw new Error("No media");
      },
    },
  ];

  for (const api of apis) {
    try {
      const result = await api.fn();
      if (result?.url) {
        console.log(`[Instagram] ✅ ${api.name} succeeded`);
        return { result, source: api.name };
      }
    } catch (err) {
      console.log(`[Instagram] ❌ ${api.name} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  ENHANCED FACEBOOK
// ════════════════════════════════════════════════════════════════════════════

async function downloadFacebook(url) {
  const apis = [
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
            timeout: 15000,
          },
        );
        const hdMatch = res.data?.match(/id="hdlink"\s+href="([^"]+)"/);
        const sdMatch = res.data?.match(/id="sdlink"\s+href="([^"]+)"/);
        const videoUrl = hdMatch?.[1] || sdMatch?.[1];
        if (!videoUrl) throw new Error("No video");
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
            timeout: 15000,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
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
            timeout: 15000,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1] };
      },
    },
  ];

  for (const api of apis) {
    try {
      const result = await api.fn();
      if (result?.videoUrl) {
        console.log(`[Facebook] ✅ ${api.name} succeeded`);
        return { result, source: api.name };
      }
    } catch (err) {
      console.log(`[Facebook] ❌ ${api.name} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  ENHANCED TWITTER/X
// ════════════════════════════════════════════════════════════════════════════

async function downloadTwitter(url) {
  const apis = [
    {
      name: "fxtwitter",
      fn: async () => {
        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        if (!tweetId) throw new Error("No tweet ID");
        const res = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
          headers: { Accept: "application/json", "User-Agent": getRandomUserAgent() },
          timeout: 15000,
        });
        const variants = res.data?.tweet?.media?.videos?.[0]?.variants || [];
        const mp4s = variants.filter((v) => v.content_type === "video/mp4" || v.url?.includes(".mp4"));
        mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const videoUrl = mp4s[0]?.url;
        if (!videoUrl) throw new Error("No video");
        return { videoUrl };
      },
    },
    {
      name: "twitsave",
      fn: async () => {
        const res = await axios.get("https://twitsave.com/info", {
          params: { url },
          headers: BROWSER_HEADERS(),
          timeout: 15000,
        });
        const matches = [...(res.data?.matchAll(/data-url="([^"]+\.mp4[^"]*)"/g) || [])];
        if (!matches.length) throw new Error("No video");
        return { videoUrl: matches[0][1] };
      },
    },
  ];

  for (const api of apis) {
    try {
      const result = await api.fn();
      if (result?.videoUrl) {
        console.log(`[Twitter] ✅ ${api.name} succeeded`);
        return { result, source: api.name };
      }
    } catch (err) {
      console.log(`[Twitter] ❌ ${api.name} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMMANDS
// ════════════════════════════════════════════════════════════════════════════

// ── PLAY (YouTube Audio) ──────────────────────────────────────────────────
export async function play({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 PLAY MUSIC",
        `Download and play any song from YouTube\n\nUsage: .play <song name or URL>\n\nExamples:\n.play Shape of You\n.play Lose Yourself Eminem`,
      ),
    });
  }

  const q = query.trim();
  await sendMsg(sock, from, { text: `🔍 Searching for *${q}*...` });

  let videoInfo = null;
  if (q.includes("youtu")) {
    const id = extractVideoId(q);
    if (id) {
      videoInfo = {
        videoId: id,
        title: "YouTube Video",
        url: q,
        author: "Unknown",
        duration: "Unknown",
        thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      };
    }
  }

  if (!videoInfo) videoInfo = await searchYouTube(q);
  if (!videoInfo) {
    return sendMsg(sock, from, {
      text: formatError(
        "NOT FOUND",
        `No results for "${q}"\n\nTry a different spelling.`,
      ),
    });
  }

  const infoCaption = `📀 *${videoInfo.title}*\n🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration}\n\n⬇️ Downloading audio...\n\n${TAG}`;
  try {
    await sendMsg(sock, from, {
      image: { url: videoInfo.thumbnail },
      caption: infoCaption,
    });
  } catch (_) {
    await sendMsg(sock, from, { text: infoCaption });
  }

  const audio = await downloadYouTubeAudio(videoInfo.videoId, videoInfo.url);
  if (audio?.buffer) {
    try {
      await sendMsg(sock, from, {
        audio: audio.buffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sendMsg(sock, from, {
        text: `✅ *${videoInfo.title}*\n🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration} | 📦 ${formatSize(audio.buffer.length)}\n\n${TAG}`,
      });
    } catch (err) {
      await sendMsg(sock, from, {
        text: formatInfo(
          "🔗 LINK",
          `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}`,
        ),
      });
    }
  } else {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 LINK",
        `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}`,
      ),
    });
  }
}

// ── TIKTOK ──────────────────────────────────────────────────────
export async function tiktok({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📱 TIKTOK",
        "Download TikTok videos without watermark\n\nUsage: .tiktok <url>",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading TikTok video..." });
  const url = query.trim();

  const result = await downloadTikTok(url);

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download TikTok video.\n\nTry using the direct URL from the TikTok app."),
    });
  }

  const { result: info, source } = result;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `📱 *TikTok*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo("🔗 LINK", `📱 TikTok\n\n🔗 ${info.videoUrl}`),
    });
  }
}

// ── INSTAGRAM ───────────────────────────────────────────────────
export async function instagram({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📸 INSTAGRAM",
        "Download Instagram posts/reels\n\nUsage: .ig <url>",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Instagram media..." });
  const url = query.trim();

  const result = await downloadInstagram(url);

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Instagram media.\n\nMake sure the URL is from a public post."),
    });
  }

  const { result: info, source } = result;
  try {
    const buf = await downloadBuffer(info.url, 120000);
    const caption = `📸 *Instagram*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`;
    if (info.type === "video") {
      await sendMsg(sock, from, { video: buf, caption });
    } else {
      await sendMsg(sock, from, { image: buf, caption });
    }
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo("🔗 LINK", `📸 Instagram\n\n🔗 ${info.url}`),
    });
  }
}

// ── FACEBOOK ────────────────────────────────────────────────────
export async function facebook({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "👤 FACEBOOK",
        "Download Facebook videos\n\nUsage: .fb <url>",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Facebook video..." });
  const url = query.trim();

  const result = await downloadFacebook(url);

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Facebook video.\n\nTry using the share link from the video."),
    });
  }

  const { result: info, source } = result;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `👤 *Facebook*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo("🔗 LINK", `👤 Facebook\n\n🔗 ${info.videoUrl}`),
    });
  }
}

// ── TWITTER/X ───────────────────────────────────────────────────
export async function twitter({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🐦 TWITTER/X",
        "Download Twitter/X videos\n\nUsage: .twitter <url>",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Twitter/X video..." });
  const url = query.trim();

  const result = await downloadTwitter(url);

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError("FAILED", "Could not download Twitter/X video.\n\nMake sure the tweet contains a video."),
    });
  }

  const { result: info, source } = result;
  try {
    const buf = await downloadBuffer(info.videoUrl, 120000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `🐦 *Twitter/X*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo("🔗 LINK", `🐦 Twitter/X\n\n🔗 ${info.videoUrl}`),
    });
  }
}

// ── SPOTIFY ─────────────────────────────────────────────────────
export async function spotify({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 SPOTIFY",
        "Get Spotify track info\n\nUsage: .spotify <url or track name>",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching Spotify data..." });
  const q = query.trim();

  try {
    const res = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=1`,
      { timeout: 15000, headers: { "User-Agent": getRandomUserAgent() } },
    );
    const track = res.data?.data?.results?.[0];
    if (!track) throw new Error("Not found");

    const downloadUrls = track.downloadUrl || [];
    const audioUrl =
      downloadUrls.find((d) => d.quality === "320kbps")?.url ||
      downloadUrls.find((d) => d.quality === "160kbps")?.url ||
      downloadUrls[downloadUrls.length - 1]?.url;
    const thumb =
      track.image?.find((i) => i.quality === "500x500")?.url ||
      track.image?.[0]?.url;

    const caption = `🎵 *${track.name}*\n🎤 ${track.artists?.primary?.map((a) => a.name).join(", ") || "Unknown"}\n💿 ${track.album?.name || "Unknown"}\n⏱️ ${formatDuration(track.duration)}\n\n${TAG}`;

    if (thumb) {
      try {
        await sendMsg(sock, from, { image: { url: thumb }, caption });
      } catch (_) {
        await sendMsg(sock, from, { text: caption });
      }
    } else {
      await sendMsg(sock, from, { text: caption });
    }

    if (audioUrl) {
      const buf = await downloadBuffer(audioUrl, 120000);
      await sendMsg(sock, from, {
        audio: buf,
        mimetype: "audio/mpeg",
        ptt: false,
      });
    }
  } catch (err) {
    await sendMsg(sock, from, {
      text: formatError("NOT FOUND", "Could not find that track."),
    });
  }
}

// ── PINTEREST SEARCH ──────────────────────────────────────────────────────
export async function pinterest({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📌 PINTEREST",
        "Search Pinterest for images\n\nUsage: .pin <search term>",
      ),
    });
  }

  await sendMsg(sock, from, {
    text: `🔍 Searching Pinterest for "${query}"...`,
  });

  try {
    const res = await axios.get(
      `https://www.pinterest.com/resource/BaseSearchResource/get/`,
      {
        params: {
          source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
          data: JSON.stringify({
            options: { query, scope: "pins", page_size: 25 },
          }),
        },
        headers: { ...BROWSER_HEADERS(), "X-Requested-With": "XMLHttpRequest" },
        timeout: 15000,
      },
    );
    const pins = res.data?.resource_response?.data?.results?.filter(
      (p) => p.images?.["736x"]?.url,
    );
    if (pins?.length) {
      const pin = pins[Math.floor(Math.random() * pins.length)];
      await sendMsg(sock, from, {
        image: { url: pin.images["736x"].url },
        caption: `📌 *${query}*\n\n${TAG}`,
      });
      return;
    }
  } catch (_) {}

  // Fallback: DuckDuckGo image search
  try {
    const tokenRes = await axios.get(
      `https://duckduckgo.com/?q=${encodeURIComponent(query + " site:pinterest.com")}&iax=images&ia=images`,
      { headers: BROWSER_HEADERS(), timeout: 8000 },
    );
    const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
    if (token) {
      const imgRes = await axios.get(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
        { headers: { ...BROWSER_HEADERS(), Referer: "https://duckduckgo.com/" }, timeout: 8000 },
      );
      const images = imgRes.data?.results;
      if (images?.length) {
        const img = images[Math.floor(Math.random() * Math.min(images.length, 10))];
        await sendMsg(sock, from, {
          image: { url: img.image },
          caption: `📌 *${query}*\n\n${TAG}`,
        });
        return;
      }
    }
  } catch (_) {}

  await sendMsg(sock, from, {
    text: formatError("NOT FOUND", "Could not find images. Try a different search term."),
  });
}

// ── IMAGE SEARCH ──────────────────────────────────────────────────────────
export async function image({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🖼️ IMAGE",
        "Search for any image\n\nUsage: .img <search term>",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching images for "${query}"...` });

  // Try Pixabay if key exists
  if (ENV.PIXABAY_KEY) {
    try {
      const res = await axios.get("https://pixabay.com/api/", {
        params: {
          key: ENV.PIXABAY_KEY,
          q: query,
          per_page: 20,
          safesearch: true,
          image_type: "photo",
        },
        timeout: 15000,
      });
      const hits = res.data?.hits;
      if (hits?.length) {
        const img = hits[Math.floor(Math.random() * hits.length)].largeImageURL;
        await sendMsg(sock, from, {
          image: { url: img },
          caption: `🖼️ *${query}*\n\n${TAG}`,
        });
        return;
      }
    } catch (_) {}
  }

  // Fallback: DuckDuckGo
  try {
    const tokenRes = await axios.get(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers: BROWSER_HEADERS(), timeout: 8000 },
    );
    const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
    if (token) {
      const imgRes = await axios.get(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
        { headers: { ...BROWSER_HEADERS(), Referer: "https://duckduckgo.com/" }, timeout: 8000 },
      );
      const images = imgRes.data?.results;
      if (images?.length) {
        const img = images[Math.floor(Math.random() * Math.min(images.length, 15))].image;
        await sendMsg(sock, from, {
          image: { url: img },
          caption: `🖼️ *${query}*\n\n${TAG}`,
        });
        return;
      }
    }
  } catch (_) {}

  await sendMsg(sock, from, {
    text: formatError("NOT FOUND", "Could not find images for that query."),
  });
}

// ── GIF SEARCH ────────────────────────────────────────────────────────────
export async function gif({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎞️ GIF",
        "Search for animated GIFs\n\nUsage: .gif <search term>",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching GIFs for "${query}"...` });

  if (ENV.GIPHY_KEY) {
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
        params: { api_key: ENV.GIPHY_KEY, q: query, limit: 20, rating: "g" },
        timeout: 15000,
      });
      const results = res.data?.data;
      if (results?.length) {
        const item = results[Math.floor(Math.random() * results.length)];
        const gifUrl = item.images?.original?.mp4 || item.images?.original?.url;
        await sendMsg(sock, from, {
          video: { url: gifUrl },
          caption: `🎞️ *${query}*\n\n${TAG}`,
          gifPlayback: true,
        });
        return;
      }
    } catch (_) {}
  }

  if (ENV.TENOR_KEY) {
    try {
      const res = await axios.get("https://tenor.googleapis.com/v2/search", {
        params: {
          q: query,
          key: ENV.TENOR_KEY,
          limit: 10,
          media_filter: "mp4",
        },
        timeout: 15000,
      });
      const results = res.data?.results;
      if (results?.length) {
        const item = results[Math.floor(Math.random() * results.length)];
        const gifUrl = item.media_formats?.mp4?.url || item.media_formats?.gif?.url;
        await sendMsg(sock, from, {
          video: { url: gifUrl },
          caption: `🎞️ *${query}*\n\n${TAG}`,
          gifPlayback: true,
        });
        return;
      }
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text: formatError(
      "NOT FOUND",
      "Could not find GIFs. Make sure GIPHY_KEY or TENOR_KEY is set.",
    ),
  });
}

// ── UNIVERSAL DOWNLOAD ────────────────────────────────────────────────────
export async function download({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "⬇️ DOWNLOAD",
        "Universal Media Downloader\n\nSupported:\n.youtube → .play\n.tiktok → .tiktok\n.instagram → .ig\n.facebook → .fb\n.twitter → .twitter\n.spotify → .spotify",
      ),
    });
  }

  let url = query.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  if (url.includes("youtube.com") || url.includes("youtu.be"))
    return play({ fullArgs: url, from, sock });
  if (url.includes("tiktok.com")) return tiktok({ fullArgs: url, from, sock });
  if (url.includes("instagram.com"))
    return instagram({ fullArgs: url, from, sock });
  if (url.includes("facebook.com") || url.includes("fb.watch"))
    return facebook({ fullArgs: url, from, sock });
  if (url.includes("twitter.com") || url.includes("x.com"))
    return twitter({ fullArgs: url, from, sock });
  if (url.includes("spotify.com"))
    return spotify({ fullArgs: url, from, sock });

  await sendMsg(sock, from, {
    text: formatError(
      "UNSUPPORTED",
      "URL not supported.\n\nUse specific commands:\n.tiktok\n.ig\n.fb\n.twitter\n.play",
    ),
  });
}

// ── YOUTUBE INFO ──────────────────────────────────────────────────────────
export async function youtube({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📺 YOUTUBE",
        "Get YouTube video info\n\nUsage: .yt <url>",
      ),
    });
  }

  const videoId = extractVideoId(query.trim());
  if (!videoId) {
    return sendMsg(sock, from, {
      text: formatError("INVALID URL", "Please provide a valid YouTube URL."),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching video info..." });

  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
        timeout: 8000,
        headers: { "User-Agent": getRandomUserAgent() },
      });
      if (res.data?.title) {
        const data = res.data;
        const caption = `📺 *${data.title}*\n🎤 ${data.author}\n⏱️ ${formatDuration(data.lengthSeconds)} | 👁️ ${formatNumber(data.viewCount)}\n🔗 https://youtu.be/${videoId}\n\n${TAG}`;
        await sendMsg(sock, from, { text: caption });
        return;
      }
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text: formatError("ERROR", "Could not fetch video info."),
  });
}

// ── EXPORTS ────────────────────────────────────────────────────────────────
export default {
  play,
  youtube,
  tiktok,
  instagram,
  facebook,
  twitter,
  spotify,
  pinterest,
  image,
  gif,
  download,
};
