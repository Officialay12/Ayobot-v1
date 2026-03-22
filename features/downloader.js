// @ts-nocheck
// ════════════════════════════════════════════════════════════════════════════
//  commands/group/downloader.js — AYOBOT v1.0.0
//  Author  : AYOCODES
//  Enhanced: All APIs updated, bugs fixed, robust fallbacks
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import "path";
import "url";
import { ENV } from "../index.js";
import { sendMsg } from "../utils/channelButton.js";
import { formatError, formatInfo } from "../utils/formatters.js";

// ════════════════════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Extract YouTube video ID from any YouTube URL format */
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

/** Format seconds → H:MM:SS or M:SS */
function formatDuration(secs) {
  const s = parseInt(secs) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Format large numbers → K/M/B */
function formatNumber(n) {
  if (!n) return "N/A";
  const v = parseInt(n);
  if (isNaN(v)) return "N/A";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

/** Format byte size → KB/MB */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Download URL to Buffer with retry logic */
async function downloadBuffer(url, timeoutMs = 60_000, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 150_000_000, // 150 MB max
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate, br",
        },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 100)
        throw new Error("Buffer too small (likely an error response)");
      return buf;
    } catch (err) {
      lastErr = err;
      if (attempt < retries)
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Try a list of async API functions in order.
 * Returns { result, source } on first success, or null.
 */
async function tryApis(fns, labels) {
  for (let i = 0; i < fns.length; i++) {
    try {
      const result = await fns[i]();
      if (result) {
        console.log(`[Downloader] ✅ ${labels[i]} succeeded`);
        return { result, source: labels[i] };
      }
    } catch (err) {
      console.log(`[Downloader] ❌ ${labels[i]} failed: ${err.message}`);
    }
  }
  return null;
}

/** Standard browser-like request headers */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

const AYOBOT_TAG = "⚡ _AYOBOT v1 by AYOCODES_";

// ════════════════════════════════════════════════════════════════════════════
//  YOUTUBE SEARCH
//  Updated Invidious instances + improved ytInitialData parsing
// ════════════════════════════════════════════════════════════════════════════

/** Currently active Invidious instances (updated list) */
const INVIDIOUS_INSTANCES = [
  "https://invidious.privacydev.net",
  "https://inv.nadeko.net",
  "https://invidious.lunar.icu",
  "https://invidious.perennialte.ch",
  "https://inv.tux.pizza",
  "https://invidious.flokinet.to",
  "https://yt.artemislena.eu",
  "https://invidious.protokolla.fi",
];

async function searchYouTube(query) {
  // ── Method 1: Direct YouTube scrape (ytInitialData) ───────────────────────
  try {
    const res = await axios.get(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`,
      {
        headers: {
          ...BROWSER_HEADERS,
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15_000,
      },
    );

    // Try full ytInitialData parse
    const dataMatch = res.data.match(
      /var ytInitialData\s*=\s*(\{.+?\});<\/script>/s,
    );
    if (dataMatch) {
      try {
        const ytData = JSON.parse(dataMatch[1]);
        const items =
          ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
        if (items) {
          for (const item of items) {
            const vr = item?.videoRenderer;
            if (vr?.videoId) {
              const thumbs = vr.thumbnail?.thumbnails || [];
              const thumb =
                thumbs[thumbs.length - 1]?.url ||
                `https://img.youtube.com/vi/${vr.videoId}/maxresdefault.jpg`;
              return {
                videoId: vr.videoId,
                title:
                  vr.title?.runs?.[0]?.text || vr.title?.simpleText || query,
                url: `https://www.youtube.com/watch?v=${vr.videoId}`,
                duration: vr.lengthText?.simpleText || "Unknown",
                views: vr.viewCountText?.simpleText || "N/A",
                author:
                  vr.ownerText?.runs?.[0]?.text ||
                  vr.longBylineText?.runs?.[0]?.text ||
                  "Unknown",
                thumbnail: thumb,
              };
            }
          }
        }
      } catch (_) {}
    }

    // Fallback regex inside the YT page
    const vidMatch = res.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const titleMatch = res.data.match(
      /"title":\{"runs":\[\{"text":"([^"]+)"\}/,
    );
    const authorMatch = res.data.match(
      /"ownerText":\{"runs":\[\{"text":"([^"]+)"\}/,
    );
    if (vidMatch) {
      return {
        videoId: vidMatch[1],
        title: titleMatch?.[1] || query,
        url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
        duration: "Unknown",
        views: "N/A",
        author: authorMatch?.[1] || "Unknown",
        thumbnail: `https://img.youtube.com/vi/${vidMatch[1]}/maxresdefault.jpg`,
      };
    }
  } catch (err) {
    console.log("YT direct scrape failed:", err.message);
  }

  // ── Method 2: Invidious API (iterate until one works) ────────────────────
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/search`, {
        params: { q: query, type: "video", page: 1 },
        timeout: 8_000,
        headers: { Accept: "application/json" },
      });
      const first = res.data?.[0];
      if (first?.videoId) {
        const thumbs = first.videoThumbnails || [];
        const thumb =
          thumbs.find((t) => t.quality === "maxresdefault")?.url ||
          thumbs.find((t) => t.quality === "high")?.url ||
          thumbs.find((t) => t.quality === "medium")?.url ||
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

  // ── Method 3: YouTube oEmbed (minimal metadata, last resort) ─────────────
  try {
    // Search via YouTube suggest API to get a video ID
    const suggestRes = await axios.get(
      `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&q=${encodeURIComponent(query)}&ds=yt&callback=cb`,
      { timeout: 8_000 },
    );
    // Can't get video ID from suggests, but it proves connectivity
  } catch (_) {}

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  YOUTUBE AUDIO DOWNLOAD
//  Updated cobalt domain + working alternatives
// ════════════════════════════════════════════════════════════════════════════

async function downloadYouTubeAudio(videoId, videoUrl) {
  const url = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;

  // ── M1: api.cobalt.tools (updated domain from co.wuk.sh) ─────────────────
  try {
    const res = await axios.post(
      "https://api.cobalt.tools/api/json",
      {
        url,
        isAudioOnly: true,
        aFormat: "mp3",
        filenamePattern: "basic",
        isNoTTWatermark: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20_000,
      },
    );
    if (res.data?.url) {
      const buf = await downloadBuffer(res.data.url, 60_000);
      if (buf.length > 10_000) return { buffer: buf, source: "cobalt" };
    }
  } catch (err) {
    console.log("Audio M1 (cobalt) failed:", err.message);
  }

  // ── M2: tomp3.cc (reliable, no scraping required) ─────────────────────────
  try {
    const res = await axios.get(
      `https://tomp3.cc/api/widget/mp3?v=${videoId}`,
      {
        timeout: 20_000,
        headers: { Accept: "application/json", ...BROWSER_HEADERS },
      },
    );
    if (res.data?.url) {
      const buf = await downloadBuffer(res.data.url, 60_000);
      if (buf.length > 10_000) return { buffer: buf, source: "tomp3.cc" };
    }
  } catch (err) {
    console.log("Audio M2 (tomp3) failed:", err.message);
  }

  // ── M3: y2mate.is (form-based, reliable) ─────────────────────────────────
  try {
    const analyzeRes = await axios.post(
      "https://www.y2mate.com/mates/analyzeV2/ajax",
      new URLSearchParams({
        k_query: url,
        k_page: "home",
        hl: "en",
        q_auto: "0",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...BROWSER_HEADERS,
          Origin: "https://www.y2mate.com",
          Referer: "https://www.y2mate.com/",
        },
        timeout: 15_000,
      },
    );
    const links = analyzeRes.data?.links?.mp3;
    if (links) {
      const key = Object.keys(links)[0];
      const k = links[key]?.k;
      if (k) {
        const convertRes = await axios.post(
          "https://www.y2mate.com/mates/convertV2/index",
          new URLSearchParams({ vid: videoId, k }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
              Origin: "https://www.y2mate.com",
              Referer: "https://www.y2mate.com/",
            },
            timeout: 20_000,
          },
        );
        if (convertRes.data?.dlink) {
          const buf = await downloadBuffer(convertRes.data.dlink, 60_000);
          if (buf.length > 10_000) return { buffer: buf, source: "y2mate" };
        }
      }
    }
  } catch (err) {
    console.log("Audio M3 (y2mate) failed:", err.message);
  }

  // ── M4: yt1s.com (fallback, form-based) ────────────────────────────────────
  try {
    const searchRes = await axios.post(
      "https://yt1s.com/api/ajaxSearch/index",
      new URLSearchParams({ q: url, vt: "home" }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...BROWSER_HEADERS,
        },
        timeout: 15_000,
      },
    );
    if (searchRes.data?.links?.mp3) {
      const mp3Keys = Object.keys(searchRes.data.links.mp3);
      const k = searchRes.data.links.mp3[mp3Keys[0]]?.k;
      if (k) {
        const convertRes = await axios.post(
          "https://yt1s.com/api/ajaxConvert/convert",
          new URLSearchParams({ vid: videoId, k }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 20_000,
          },
        );
        if (convertRes.data?.dlink) {
          const buf = await downloadBuffer(convertRes.data.dlink, 60_000);
          if (buf.length > 10_000) return { buffer: buf, source: "yt1s" };
        }
      }
    }
  } catch (err) {
    console.log("Audio M4 (yt1s) failed:", err.message);
  }

  // ── M5: loader.to with polling ────────────────────────────────────────────
  try {
    const initRes = await axios.get("https://loader.to/api/button/", {
      params: { url, f: "mp3" },
      timeout: 15_000,
    });
    if (initRes.data?.id) {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 3_000));
        const pollRes = await axios.get(
          `https://loader.to/api/progress/?id=${initRes.data.id}`,
          { timeout: 8_000 },
        );
        if (pollRes.data?.download_url) {
          const buf = await downloadBuffer(pollRes.data.download_url, 60_000);
          if (buf.length > 10_000) return { buffer: buf, source: "loader.to" };
          break;
        }
      }
    }
  } catch (err) {
    console.log("Audio M5 (loader.to) failed:", err.message);
  }

  // ── M6: RapidAPI YouTube MP3 (optional env key) ───────────────────────────
  if (ENV.RAPIDAPI_KEY) {
    try {
      const res = await axios.get("https://youtube-mp36.p.rapidapi.com/dl", {
        params: { id: videoId },
        headers: {
          "X-RapidAPI-Key": ENV.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
        },
        timeout: 15_000,
      });
      if (res.data?.link) {
        const buf = await downloadBuffer(res.data.link, 60_000);
        if (buf.length > 10_000) return { buffer: buf, source: "rapidapi" };
      }
    } catch (err) {
      console.log("Audio M6 (rapidapi) failed:", err.message);
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORTED COMMANDS
// ════════════════════════════════════════════════════════════════════════════

// ── PLAY (YouTube Audio) ──────────────────────────────────────────────────
export async function play({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 PLAY MUSIC",
        `Download and play any song from YouTube\n\nUsage: .play <song name or YouTube URL>\n\nExamples:\n.play Shape of You\n.play Lose Yourself Eminem\n.play https://youtu.be/xxxxx`,
      ),
    });
  }

  const q = query.trim();
  await sendMsg(sock, from, { text: `🔍 Searching for *${q}*...` });

  // Resolve video info
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
        `No results for "${q}"\n\nTry a different spelling or add the artist name.`,
      ),
    });
  }

  // Show song info + thumbnail
  const infoCaption =
    `📀 *${videoInfo.title}*\n` +
    `🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration} | 👁️ ${videoInfo.views || "N/A"}\n\n` +
    `⬇️ Downloading audio...\n\n${AYOBOT_TAG}`;

  try {
    await sendMsg(sock, from, {
      image: { url: videoInfo.thumbnail },
      caption: infoCaption,
    });
  } catch (_) {
    await sendMsg(sock, from, { text: infoCaption });
  }

  // Download audio
  const audio = await downloadYouTubeAudio(videoInfo.videoId, videoInfo.url);

  if (audio?.buffer) {
    try {
      await sendMsg(sock, from, {
        audio: audio.buffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sendMsg(sock, from, {
        text:
          `✅ *${videoInfo.title}*\n` +
          `🎤 ${videoInfo.author} | ⏱️ ${videoInfo.duration} | ` +
          `📦 ${formatSize(audio.buffer.length)} | 🔧 ${audio.source}\n\n` +
          AYOBOT_TAG,
      });
    } catch (err) {
      await sendMsg(sock, from, {
        text: formatInfo(
          "🔗 YOUTUBE LINK",
          `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}\n\n⚠️ Audio send failed — open link to listen.`,
        ),
      });
    }
  } else {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 YOUTUBE LINK",
        `🎵 *${videoInfo.title}*\n\n🔗 ${videoInfo.url}\n\n💡 Could not download audio — open link to listen.`,
      ),
    });
  }
}

// ── YOUTUBE (Video Info) ──────────────────────────────────────────────────
export async function youtube({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📺 YOUTUBE INFO",
        "Get full info about any YouTube video\n\nUsage: .yt <url>\nExample: .yt https://youtu.be/dQw4w9WgXcQ",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching video info..." });

  const videoId = extractVideoId(query.trim());
  if (!videoId) {
    return sendMsg(sock, from, {
      text: formatError("INVALID URL", "Please provide a valid YouTube URL."),
    });
  }

  // Try Invidious instances for video metadata
  let videoData = null;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
        timeout: 8_000,
        headers: { Accept: "application/json" },
      });
      if (res.data?.title) {
        videoData = res.data;
        break;
      }
    } catch (_) {}
  }

  // Fallback: YouTube oEmbed for basic info
  if (!videoData) {
    try {
      const res = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 8_000 },
      );
      if (res.data?.title) {
        videoData = {
          title: res.data.title,
          author: res.data.author_name,
          videoThumbnails: [
            { quality: "default", url: res.data.thumbnail_url },
          ],
          lengthSeconds: 0,
          viewCount: 0,
          likeCount: 0,
          description: "No description available via this source.",
          keywords: [],
          genre: "N/A",
          published: null,
        };
      }
    } catch (_) {}
  }

  if (!videoData) {
    return sendMsg(sock, from, {
      text: formatError(
        "ERROR",
        "Could not fetch video info. Try again later.",
      ),
    });
  }

  const published = videoData.published
    ? new Date(videoData.published * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  let description = videoData.description || "No description";
  if (description.length > 250) description = description.slice(0, 250) + "...";

  const thumb =
    videoData.videoThumbnails?.find((t) => t.quality === "maxresdefault") ||
    videoData.videoThumbnails?.find((t) => t.quality === "hqdefault") ||
    videoData.videoThumbnails?.[0];

  if (thumb?.url) {
    try {
      await sendMsg(sock, from, {
        image: { url: thumb.url },
        caption: `📺 *${videoData.title}*\n🎤 ${videoData.author}`,
      });
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text:
      `📺 *${videoData.title}*\n` +
      `🎤 ${videoData.author}\n` +
      `⏱️ ${formatDuration(videoData.lengthSeconds)} | 👁️ ${formatNumber(videoData.viewCount)} | 👍 ${formatNumber(videoData.likeCount)}\n` +
      `📅 ${published} | 📂 ${videoData.genre || "N/A"}\n` +
      `🏷️ ${videoData.keywords?.slice(0, 5).join(", ") || "None"}\n\n` +
      `📝 ${description}\n\n` +
      `🔗 https://youtu.be/${videoId}\n\n` +
      AYOBOT_TAG,
  });
}

// ── TIKTOK ────────────────────────────────────────────────────────────────
export async function tiktok({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📱 TIKTOK DOWNLOAD",
        "Download TikTok videos without watermark\n\nUsage: .tiktok <url>\nExample: .tiktok https://vm.tiktok.com/xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading TikTok video..." });
  const url = query.trim();

  const result = await tryApis(
    [
      // ── API 1: tikwm.com (best — full metadata, HD, no watermark) ──────
      async () => {
        const res = await axios.post(
          "https://www.tikwm.com/api/",
          new URLSearchParams({ url, hd: "1" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const d = res.data?.data;
        if (!d?.play) throw new Error("No play URL");
        return {
          videoUrl: d.hdplay || d.play,
          author: d.author?.nickname || "TikTok User",
          title: d.title || "TikTok Video",
          likes: formatNumber(d.digg_count),
          shares: formatNumber(d.share_count),
          thumbnail: d.cover || d.origin_cover,
          duration: d.duration ? formatDuration(d.duration) : "Unknown",
          music: d.music_info?.title,
        };
      },
      // ── API 2: snaptik.app (scrape-based fallback) ───────────────────
      async () => {
        const pageRes = await axios.get("https://snaptik.app/", {
          headers: BROWSER_HEADERS,
          timeout: 10_000,
        });
        const tokenMatch = pageRes.data?.match(
          /name="token"\s+value="([^"]+)"/,
        );
        if (!tokenMatch) throw new Error("No token");
        const dlRes = await axios.post(
          "https://snaptik.app/abc2.php",
          new URLSearchParams({ url, token: tokenMatch[1] }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://snaptik.app/",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        // Extract MP4 link from response HTML/JSON
        const mp4Match =
          dlRes.data?.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/) ||
          dlRes.data?.match(/"url":"(https:[^"]+\.mp4[^"]*)"/);
        if (!mp4Match) throw new Error("No mp4");
        const videoUrl = mp4Match[1].replace(/\\u0026/g, "&");
        return {
          videoUrl,
          author: "TikTok User",
          title: "TikTok Video",
          thumbnail: null,
        };
      },
      // ── API 3: tikcdn.io (alternative CDN approach) ───────────────────
      async () => {
        const res = await axios.get(
          `https://api.tikcdn.io/ssstik/${encodeURIComponent(url)}`,
          {
            headers: { Accept: "application/json", ...BROWSER_HEADERS },
            timeout: 15_000,
          },
        );
        if (!res.data?.video) throw new Error("No video");
        return {
          videoUrl: res.data.video,
          author: res.data.author?.name || "TikTok User",
          title: res.data.title || "TikTok Video",
          thumbnail: res.data.cover || null,
          duration: res.data.duration
            ? formatDuration(res.data.duration)
            : "Unknown",
        };
      },
      // ── API 4: ssstik.io (token-based) ────────────────────────────────
      async () => {
        const homeRes = await axios.get("https://ssstik.io/en", {
          headers: BROWSER_HEADERS,
          timeout: 10_000,
        });
        const ttMatch = homeRes.data?.match(/s_tt\s*=\s*["']([^"']+)["']/);
        const tt = ttMatch?.[1] || "undefined";
        const dlRes = await axios.post(
          "https://ssstik.io/abc?url=dl",
          new URLSearchParams({ id: url, locale: "en", tt }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://ssstik.io/en",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const linkMatch = dlRes.data?.match(/href="(https:\/\/tikcdn[^"]+)"/);
        if (!linkMatch) throw new Error("No URL");
        const thumbMatch = dlRes.data?.match(/data-src="([^"]+)"/);
        return {
          videoUrl: linkMatch[1],
          author: "TikTok User",
          title: "TikTok Video",
          thumbnail: thumbMatch?.[1],
        };
      },
      // ── API 5: musicaldown.com ─────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://musicaldown.com/download",
          new URLSearchParams({ link: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://musicaldown.com/",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4Match = res.data?.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
        if (!mp4Match) throw new Error("No mp4");
        return {
          videoUrl: mp4Match[1],
          author: "TikTok User",
          title: "TikTok Video",
        };
      },
    ],
    ["tikwm", "snaptik", "tikcdn", "ssstik", "musicaldown"],
  );

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download TikTok video.\n\n💡 Make sure the video is public.",
      ),
    });
  }

  const { result: info, source } = result;

  if (info.thumbnail) {
    try {
      await sendMsg(sock, from, {
        image: { url: info.thumbnail },
        caption:
          `📱 *${info.title}*\n👤 ${info.author}` +
          (info.duration ? ` | ⏱️ ${info.duration}` : "") +
          `\n\n⬇️ Downloading...\n\n${AYOBOT_TAG}`,
      });
    } catch (_) {}
  }

  try {
    const buf = await downloadBuffer(info.videoUrl, 60_000);
    let caption = `📱 *${info.title}*\n👤 ${info.author}`;
    if (info.duration) caption += ` | ⏱️ ${info.duration}`;
    if (info.likes) caption += `\n❤️ ${info.likes}`;
    if (info.shares) caption += ` | 🔁 ${info.shares}`;
    if (info.music) caption += `\n🎵 ${info.music}`;
    caption += `\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${AYOBOT_TAG}`;

    await sendMsg(sock, from, { video: buf, caption });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `📱 *${info.title}*\n👤 ${info.author}\n\n🔗 ${info.videoUrl}`,
      ),
    });
  }
}

// ── INSTAGRAM ────────────────────────────────────────────────────────────
export async function instagram({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📸 INSTAGRAM DOWNLOAD",
        "Download Instagram posts, reels & stories\n\nUsage: .ig <url>\nExample: .ig https://www.instagram.com/p/xxxxx/",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Instagram media..." });
  const url = query.trim();

  const result = await tryApis(
    [
      // ── API 1: igram.world (JSON API) ─────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://igram.world/api/convert",
          { url },
          {
            headers: { "Content-Type": "application/json", ...BROWSER_HEADERS },
            timeout: 15_000,
          },
        );
        const item = res.data?.[0] || res.data?.data?.[0];
        if (!item?.url) throw new Error("No media");
        return {
          type: item.type === "video" ? "video" : "image",
          url: item.url,
          thumbnail: item.thumbnail || null,
        };
      },
      // ── API 2: instasave.org ──────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://instasave.org/wp-json/instasave/v1/download",
          { url },
          {
            headers: { "Content-Type": "application/json", ...BROWSER_HEADERS },
            timeout: 15_000,
          },
        );
        const media = res.data?.data?.medias?.[0];
        if (!media?.url) throw new Error("No media");
        return {
          type: media.type === "video" ? "video" : "image",
          url: media.url,
          thumbnail: res.data?.data?.thumbnail || null,
        };
      },
      // ── API 3: reelsaver.net ───────────────────────────────────────────
      async () => {
        const pageRes = await axios.get("https://reelsaver.net/", {
          headers: BROWSER_HEADERS,
          timeout: 10_000,
        });
        const tokenMatch = pageRes.data?.match(
          /name="_token"\s+value="([^"]+)"/,
        );
        if (!tokenMatch) throw new Error("No CSRF token");
        const dlRes = await axios.post(
          "https://reelsaver.net/download",
          new URLSearchParams({ _token: tokenMatch[1], url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://reelsaver.net/",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = dlRes.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        const img = dlRes.data?.match(/src="(https?:\/\/[^"]+\.jpg[^"]*)"/);
        if (mp4) return { type: "video", url: mp4[1] };
        if (img) return { type: "image", url: img[1] };
        throw new Error("No media");
      },
      // ── API 4: saveig.app ─────────────────────────────────────────────
      async () => {
        const pageRes = await axios.get("https://saveig.app/en", {
          headers: BROWSER_HEADERS,
          timeout: 10_000,
        });
        const tokenMatch = pageRes.data?.match(
          /name="_token"\s+value="([^"]+)"/,
        );
        const dlRes = await axios.post(
          "https://saveig.app/api/ajaxSearch",
          new URLSearchParams({
            q: url,
            t: "media",
            lang: "en",
            _token: tokenMatch?.[1] || "",
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://saveig.app/en",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = dlRes.data?.data?.match(
          /href="(https?:\/\/[^"]+\.mp4[^"]*)"/,
        );
        const img = dlRes.data?.data?.match(
          /src="(https?:\/\/[^"]+\.(jpg|jpeg|png)[^"]*)"/,
        );
        if (mp4) return { type: "video", url: mp4[1] };
        if (img) return { type: "image", url: img[1] };
        throw new Error("No media");
      },
      // ── API 5: snapinsta.app ──────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://snapinsta.app/api",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        const img = res.data?.match(/src="(https?:\/\/[^"]+\.jpg[^"]*)"/);
        if (mp4) return { type: "video", url: mp4[1] };
        if (img) return { type: "image", url: img[1] };
        throw new Error("No media");
      },
    ],
    [
      "igram.world",
      "instasave.org",
      "reelsaver.net",
      "saveig.app",
      "snapinsta.app",
    ],
  );

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Instagram media.\n\n💡 Make sure the post is public.",
      ),
    });
  }

  const { result: info, source } = result;

  try {
    const buf = await downloadBuffer(info.url, 60_000);
    const caption = `📸 *Instagram Media*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${AYOBOT_TAG}`;
    if (info.type === "video") {
      await sendMsg(sock, from, { video: buf, caption });
    } else {
      await sendMsg(sock, from, { image: buf, caption });
    }
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 MEDIA LINK",
        `📸 *Instagram Media*\n\n🔗 ${info.url}`,
      ),
    });
  }
}

// ── FACEBOOK ─────────────────────────────────────────────────────────────
export async function facebook({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "👤 FACEBOOK DOWNLOAD",
        "Download Facebook videos\n\nUsage: .fb <url>\nExample: .fb https://www.facebook.com/watch?v=xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Facebook video..." });
  const url = query.trim();

  const result = await tryApis(
    [
      // ── API 1: api.cobalt.tools (updated domain) ──────────────────────
      async () => {
        const res = await axios.post(
          "https://api.cobalt.tools/api/json",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            timeout: 15_000,
          },
        );
        if (!res.data?.url) throw new Error("No URL");
        return { videoUrl: res.data.url };
      },
      // ── API 2: fdown.net ──────────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://fdown.net/download.php",
          new URLSearchParams({ URLz: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const hdMatch = res.data?.match(/id="hdlink"\s+href="([^"]+)"/);
        const sdMatch = res.data?.match(/id="sdlink"\s+href="([^"]+)"/);
        const videoUrl = hdMatch?.[1] || sdMatch?.[1];
        if (!videoUrl) throw new Error("No video");
        return { videoUrl };
      },
      // ── API 3: getfvid.com ────────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://getfvid.com/downloader",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!mp4) throw new Error("No video");
        return { videoUrl: mp4[1] };
      },
      // ── API 4: fbdown.net ─────────────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://fbdown.net/download.php",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!mp4) throw new Error("No video");
        return { videoUrl: mp4[1] };
      },
    ],
    ["cobalt.tools", "fdown.net", "getfvid.com", "fbdown.net"],
  );

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Facebook video.\n\n💡 Make sure the video is public.",
      ),
    });
  }

  const { result: info, source } = result;

  try {
    const buf = await downloadBuffer(info.videoUrl, 90_000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `👤 *Facebook Video*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${AYOBOT_TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `👤 *Facebook Video*\n\n🔗 ${info.videoUrl}`,
      ),
    });
  }
}

// ── TWITTER / X ───────────────────────────────────────────────────────────
export async function twitter({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🐦 TWITTER/X DOWNLOAD",
        "Download Twitter/X videos\n\nUsage: .twitter <url>\nExample: .twitter https://twitter.com/user/status/xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Twitter/X media..." });
  const url = query.trim();

  const result = await tryApis(
    [
      // ── API 1: fxtwitter JSON API (most reliable — no scraping needed) ──
      async () => {
        // Convert twitter.com/x.com URL to fxtwitter API format
        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        if (!tweetId) throw new Error("No tweet ID");
        const res = await axios.get(
          `https://api.fxtwitter.com/status/${tweetId}`,
          { headers: { Accept: "application/json" }, timeout: 15_000 },
        );
        // Find highest quality video variant
        const variants = res.data?.tweet?.media?.videos?.[0]?.variants || [];
        const mp4s = variants.filter(
          (v) => v.content_type === "video/mp4" || v.url?.includes(".mp4"),
        );
        mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const videoUrl = mp4s[0]?.url;
        if (!videoUrl) throw new Error("No video in tweet");
        return { videoUrl };
      },
      // ── API 2: vxtwitter (alternative JSON endpoint) ──────────────────
      async () => {
        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        if (!tweetId) throw new Error("No tweet ID");
        const fixedUrl = url.replace(/(twitter|x)\.com/, "vxtwitter.com");
        const res = await axios.get(fixedUrl, {
          headers: { Accept: "application/json", ...BROWSER_HEADERS },
          timeout: 15_000,
        });
        // vxtwitter redirects to OGP page; extract video URL
        const mp4 = res.data?.match(/content="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!mp4) throw new Error("No video");
        return { videoUrl: mp4[1] };
      },
      // ── API 3: twitsave.com (scrape-based) ───────────────────────────
      async () => {
        const res = await axios.get("https://twitsave.com/info", {
          params: { url },
          headers: BROWSER_HEADERS,
          timeout: 15_000,
        });
        const matches = [
          ...(res.data?.matchAll(/data-url="([^"]+\.mp4[^"]*)"/g) || []),
        ];
        if (!matches.length) throw new Error("No video");
        return { videoUrl: matches[0][1] };
      },
      // ── API 4: api.cobalt.tools ───────────────────────────────────────
      async () => {
        const res = await axios.post(
          "https://api.cobalt.tools/api/json",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            timeout: 15_000,
          },
        );
        if (!res.data?.url) throw new Error("No URL");
        return { videoUrl: res.data.url };
      },
      // ── API 5: twittervideodownloader.com ────────────────────────────
      async () => {
        const res = await axios.post(
          "https://twittervideodownloader.com/download",
          new URLSearchParams({ tweet: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              ...BROWSER_HEADERS,
            },
            timeout: 15_000,
          },
        );
        const mp4 = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!mp4) throw new Error("No video");
        return { videoUrl: mp4[1] };
      },
    ],
    [
      "fxtwitter",
      "vxtwitter",
      "twitsave",
      "cobalt.tools",
      "twittervideodownloader",
    ],
  );

  if (!result) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Twitter/X media.\n\n💡 Make sure the tweet is public.",
      ),
    });
  }

  const { result: info, source } = result;

  try {
    const buf = await downloadBuffer(info.videoUrl, 90_000);
    await sendMsg(sock, from, {
      video: buf,
      caption: `🐦 *Twitter/X Video*\n📦 ${formatSize(buf.length)} | 🔧 ${source}\n\n${AYOBOT_TAG}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `🐦 *Twitter/X Video*\n\n🔗 ${info.videoUrl}`,
      ),
    });
  }
}

// ── SPOTIFY ──────────────────────────────────────────────────────────────
export async function spotify({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 SPOTIFY",
        "Get Spotify track info + audio preview\n\nUsage: .spotify <url or track name>\n\nExamples:\n.spotify https://open.spotify.com/track/xxxxx\n.spotify Blinding Lights",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching Spotify data..." });
  const q = query.trim();
  let trackInfo = null;

  // ── Source 1: JioSaavn API (best audio + metadata) ────────────────────
  try {
    const res = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&page=1&limit=1`,
      { timeout: 15_000 },
    );
    const track = res.data?.data?.results?.[0];
    if (track) {
      const thumb =
        track.image?.find((i) => i.quality === "500x500")?.url ||
        track.image?.find((i) => i.quality === "150x150")?.url ||
        track.image?.[0]?.url;
      const audioUrl =
        track.downloadUrl?.find((d) => d.quality === "320kbps")?.url ||
        track.downloadUrl?.find((d) => d.quality === "160kbps")?.url ||
        track.downloadUrl?.[0]?.url;
      trackInfo = {
        title: track.name,
        artist:
          track.artists?.primary?.map((a) => a.name).join(", ") || "Unknown",
        album: track.album?.name || "Unknown",
        thumbnail: thumb,
        audioUrl,
        duration: formatDuration(track.duration),
        url: track.url || q,
        year: track.year,
        language: track.language,
        source: "JioSaavn",
      };
    }
  } catch (err) {
    console.log("Saavn failed:", err.message);
  }

  // ── Source 2: Spotify oEmbed metadata (if URL given) ──────────────────
  if (!trackInfo && q.includes("spotify.com/track/")) {
    try {
      const res = await axios.get(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(q)}`,
        { timeout: 15_000 },
      );
      if (res.data) {
        trackInfo = {
          title: res.data.title,
          artist: res.data.author_name,
          album: "Unknown",
          thumbnail: res.data.thumbnail_url,
          audioUrl: null,
          duration: "Unknown",
          url: q,
          source: "Spotify oEmbed",
        };
      }
    } catch (err) {
      console.log("Spotify oEmbed failed:", err.message);
    }
  }

  if (!trackInfo) {
    return sendMsg(sock, from, {
      text: formatError("NOT FOUND", "Could not find that track."),
    });
  }

  // Send thumbnail
  if (trackInfo.thumbnail) {
    try {
      const caption =
        `🎵 *${trackInfo.title}*\n` +
        `🎤 ${trackInfo.artist}` +
        (trackInfo.album ? ` | 💿 ${trackInfo.album}` : "") +
        (trackInfo.duration ? ` | ⏱️ ${trackInfo.duration}` : "") +
        (trackInfo.year ? `\n📅 ${trackInfo.year}` : "") +
        (trackInfo.language ? ` | 🌐 ${trackInfo.language}` : "") +
        `\n\n${AYOBOT_TAG}`;
      await sendMsg(sock, from, {
        image: { url: trackInfo.thumbnail },
        caption,
      });
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text:
      `🎵 *${trackInfo.title}*\n` +
      `🎤 ${trackInfo.artist}` +
      (trackInfo.album ? ` | 💿 ${trackInfo.album}` : "") +
      (trackInfo.duration ? ` | ⏱️ ${trackInfo.duration}` : "") +
      (trackInfo.year ? `\n📅 ${trackInfo.year}` : "") +
      (trackInfo.language ? ` | 🌐 ${trackInfo.language}` : "") +
      `\n\n🔗 ${trackInfo.url}\n🔧 ${trackInfo.source}\n\n${AYOBOT_TAG}`,
  });

  // Send audio if available
  if (trackInfo.audioUrl) {
    try {
      const buf = await downloadBuffer(trackInfo.audioUrl, 60_000);
      await sendMsg(sock, from, {
        audio: buf,
        mimetype: "audio/mpeg",
        ptt: false,
      });
    } catch (err) {
      console.log("Spotify audio send failed:", err.message);
    }
  }
}

// ── PINTEREST ─────────────────────────────────────────────────────────────
export async function pinterest({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📌 PINTEREST",
        "Search Pinterest for images\n\nUsage: .pinterest <search term>\nExample: .pinterest anime aesthetic",
      ),
    });
  }

  await sendMsg(sock, from, {
    text: `🔍 Searching Pinterest for "${query}"...`,
  });

  // ── Method 1: Pinterest BaseSearchResource API ────────────────────────
  try {
    const res = await axios.get(
      "https://www.pinterest.com/resource/BaseSearchResource/get/",
      {
        params: {
          source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
          data: JSON.stringify({
            options: { query, scope: "pins", page_size: 25 },
          }),
        },
        headers: { ...BROWSER_HEADERS, "X-Requested-With": "XMLHttpRequest" },
        timeout: 15_000,
      },
    );
    const results = res.data?.resource_response?.data?.results;
    const pins = results?.filter((p) => p.images?.["736x"]?.url);
    if (pins?.length) {
      const pin = pins[Math.floor(Math.random() * pins.length)];
      return sendMsg(sock, from, {
        image: { url: pin.images["736x"].url },
        caption: `📌 *${query}*\n\n${AYOBOT_TAG}`,
      });
    }
  } catch (_) {}

  // ── Method 2: DuckDuckGo image search fallback ────────────────────────
  try {
    const tokenRes = await axios.get(
      `https://duckduckgo.com/?q=${encodeURIComponent(query + " site:pinterest.com")}&iax=images&ia=images`,
      { headers: BROWSER_HEADERS, timeout: 8_000 },
    );
    const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
    if (!token) throw new Error("No DDG token");

    const imgRes = await axios.get(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
      {
        headers: { ...BROWSER_HEADERS, Referer: "https://duckduckgo.com/" },
        timeout: 8_000,
      },
    );
    const images = imgRes.data?.results;
    if (images?.length) {
      const img =
        images[Math.floor(Math.random() * Math.min(images.length, 10))];
      return sendMsg(sock, from, {
        image: { url: img.image },
        caption: `📌 *${query}*\n\n${AYOBOT_TAG}`,
      });
    }
  } catch (_) {}

  await sendMsg(sock, from, {
    text: formatError(
      "NOT FOUND",
      "Could not find Pinterest images. Try a different search term.",
    ),
  });
}

// ── IMAGE SEARCH ─────────────────────────────────────────────────────────
export async function image({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🖼️ IMAGE SEARCH",
        "Search for any image\n\nUsage: .img <search term>\nExample: .img sunset landscape",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching images for "${query}"...` });
  let imageUrl = null;
  let source = "";

  // ── Source 1: Pixabay (if key set) ────────────────────────────────────
  if (ENV.PIXABAY_KEY && !imageUrl) {
    try {
      const res = await axios.get("https://pixabay.com/api/", {
        params: {
          key: ENV.PIXABAY_KEY,
          q: query,
          per_page: 20,
          safesearch: true,
          image_type: "photo",
        },
        timeout: 15_000,
      });
      const hits = res.data?.hits;
      if (hits?.length) {
        imageUrl = hits[Math.floor(Math.random() * hits.length)].largeImageURL;
        source = "Pixabay";
      }
    } catch (err) {
      console.log("Pixabay failed:", err.message);
    }
  }

  // ── Source 2: Unsplash (if key set) ───────────────────────────────────
  if (ENV.UNSPLASH_KEY && !imageUrl) {
    try {
      const res = await axios.get("https://api.unsplash.com/search/photos", {
        params: { query, per_page: 20, orientation: "landscape" },
        headers: { Authorization: `Client-ID ${ENV.UNSPLASH_KEY}` },
        timeout: 15_000,
      });
      const results = res.data?.results;
      if (results?.length) {
        imageUrl =
          results[Math.floor(Math.random() * results.length)].urls.regular;
        source = "Unsplash";
      }
    } catch (err) {
      console.log("Unsplash failed:", err.message);
    }
  }

  // ── Source 3: DuckDuckGo Images (free, no key) ────────────────────────
  if (!imageUrl) {
    try {
      const tokenRes = await axios.get(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
        { headers: BROWSER_HEADERS, timeout: 8_000 },
      );
      const token = tokenRes.data?.match(/vqd=([\d-]+)/)?.[1];
      if (token) {
        const imgRes = await axios.get(
          `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${token}`,
          {
            headers: { ...BROWSER_HEADERS, Referer: "https://duckduckgo.com/" },
            timeout: 8_000,
          },
        );
        const results = imgRes.data?.results;
        if (results?.length) {
          imageUrl =
            results[Math.floor(Math.random() * Math.min(results.length, 15))]
              .image;
          source = "DuckDuckGo";
        }
      }
    } catch (err) {
      console.log("DDG failed:", err.message);
    }
  }

  if (!imageUrl) {
    return sendMsg(sock, from, {
      text: formatError("NOT FOUND", "Could not find images for that query."),
    });
  }

  await sendMsg(sock, from, {
    image: { url: imageUrl },
    caption: `🖼️ *${query}*\n🔧 ${source}\n\n${AYOBOT_TAG}`,
  });
}

// ── GIF SEARCH ────────────────────────────────────────────────────────────
// FIX: Variable shadowing bug — `t` (Buffer) shadowed the `query` string
export async function gif({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎞️ GIF SEARCH",
        "Search for animated GIFs\n\nUsage: .gif <search term>\nExample: .gif happy dance",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching GIFs for "${query}"...` });

  let gifUrl = null;
  let gifTitle = null;

  // ── Source 1: GIPHY (if key set) ──────────────────────────────────────
  if (ENV.GIPHY_KEY) {
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
        params: { api_key: ENV.GIPHY_KEY, q: query, limit: 20, rating: "g" },
        timeout: 15_000,
      });
      const results = res.data?.data;
      if (results?.length) {
        const item = results[Math.floor(Math.random() * results.length)];
        gifUrl = item.images?.original?.mp4 || item.images?.original?.url;
        gifTitle = item.title;
      }
    } catch (err) {
      console.log("Giphy failed:", err.message);
    }
  }

  // ── Source 2: Tenor (if key set) ─────────────────────────────────────
  if (!gifUrl && ENV.TENOR_KEY) {
    try {
      const res = await axios.get("https://tenor.googleapis.com/v2/search", {
        params: {
          q: query,
          key: ENV.TENOR_KEY,
          limit: 10,
          media_filter: "mp4",
        },
        timeout: 15_000,
      });
      const results = res.data?.results;
      if (results?.length) {
        const item = results[Math.floor(Math.random() * results.length)];
        gifUrl = item.media_formats?.mp4?.url || item.media_formats?.gif?.url;
        gifTitle = item.title || query;
      }
    } catch (err) {
      console.log("Tenor failed:", err.message);
    }
  }

  if (!gifUrl) {
    return sendMsg(sock, from, {
      text: formatError(
        "NOT FOUND",
        "Could not find GIFs.\n\nMake sure GIPHY_KEY or TENOR_KEY is set in your .env",
      ),
    });
  }

  try {
    // ✅ FIX: Use `query` (the search term) in caption, NOT the buffer variable
    const caption =
      `🎞️ *${query}*` +
      (gifTitle ? `\n📝 ${gifTitle}` : "") +
      `\n\n${AYOBOT_TAG}`;

    if (gifUrl.endsWith(".gif")) {
      const buf = await downloadBuffer(gifUrl, 30_000);
      await sendMsg(sock, from, { video: buf, caption, gifPlayback: true });
    } else {
      await sendMsg(sock, from, {
        video: { url: gifUrl },
        caption,
        gifPlayback: true,
      });
    }
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatError("SEND FAILED", "Found GIF but could not send it."),
    });
  }
}

// ── UNIVERSAL DOWNLOAD ────────────────────────────────────────────────────
export async function download({ fullArgs: query, from, sock }) {
  if (!query) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "⬇️ DOWNLOAD MEDIA",
        "Universal Media Downloader\n\nUsage: .dl <url>\n\nSupported:\n▸ YouTube  → .play <song>\n▸ TikTok   → .tiktok <url>\n▸ Instagram → .ig <url>\n▸ Facebook → .fb <url>\n▸ Twitter/X → .twitter <url>\n▸ Spotify  → .spotify <url>\n▸ Pinterest → .pin <query>",
      ),
    });
  }

  let url = query.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  // Route by platform
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
  if (url.includes("pinterest.com"))
    return pinterest({ fullArgs: url, from, sock });

  // ── Direct file URL (image/video/audio/doc) ────────────────────────────
  const extMatch = url.match(
    /\.(jpg|jpeg|png|gif|mp4|mp3|pdf|docx?|webp|avi|mov|mkv|wav|ogg|m4a|zip|rar)(\?.*)?$/i,
  );
  if (extMatch) {
    await sendMsg(sock, from, { text: "⬇️ Downloading file..." });
    try {
      const buf = await downloadBuffer(url, 90_000);
      const ext = extMatch[1].toLowerCase();
      const sizeStr = formatSize(buf.length);
      const fileName = url.split("/").pop()?.split("?")[0] || `file.${ext}`;

      if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
        await sendMsg(sock, from, {
          image: buf,
          caption: `🖼️ *Downloaded*\n📦 ${sizeStr}\n\n${AYOBOT_TAG}`,
        });
      } else if (["mp4", "avi", "mov", "mkv"].includes(ext)) {
        await sendMsg(sock, from, {
          video: buf,
          caption: `🎬 *Downloaded*\n📦 ${sizeStr}\n\n${AYOBOT_TAG}`,
        });
      } else if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
        await sendMsg(sock, from, {
          audio: buf,
          mimetype: `audio/${ext === "mp3" ? "mpeg" : ext}`,
          ptt: false,
        });
      } else {
        await sendMsg(sock, from, {
          document: buf,
          fileName,
          caption: `📄 *${fileName}*\n📦 ${sizeStr}\n\n${AYOBOT_TAG}`,
        });
      }
    } catch (err) {
      await sendMsg(sock, from, {
        text: formatError(
          "DOWNLOAD FAILED",
          `Could not download file.\n\n${err.message}`,
        ),
      });
    }
    return;
  }

  await sendMsg(sock, from, {
    text: formatError(
      "UNSUPPORTED URL",
      "This URL is not supported.\n\nUse specific commands:\n.tiktok <url>\n.ig <url>\n.fb <url>\n.twitter <url>\n.play <song>",
    ),
  });
}
