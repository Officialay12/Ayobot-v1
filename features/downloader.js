// features/downloader.js - AYOBOT v1 | Created by AYOCODES
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "../index.js";
import { sendMsg } from "../utils/channelButton.js";
import { formatError, formatInfo } from "../utils/formatters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== CONSTANTS ==========
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT = 60000;
const API_TIMEOUT = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BRAND = "⚡ _AYOBOT v1 by AYOCODES_";

// ========== HELPERS ==========

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

function formatDuration(seconds) {
  const s = parseInt(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatNumber(num) {
  if (!num) return "N/A";
  const n = parseInt(num);
  if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

function formatSize(bytes) {
  if (!bytes) return "Unknown";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function downloadBuffer(url, timeout = DOWNLOAD_TIMEOUT) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    maxContentLength: MAX_FILE_SIZE,
    headers: { "User-Agent": USER_AGENT },
  });
  return Buffer.from(res.data);
}

async function tryApis(apiList, apiNames) {
  for (let i = 0; i < apiList.length; i++) {
    try {
      const result = await apiList[i]();
      if (result) return { result, source: apiNames[i] };
    } catch (e) {
      console.log(`[Downloader] ${apiNames[i]} failed: ${e.message}`);
    }
  }
  return null;
}

// ========== YOUTUBE SEARCH ==========
async function searchYouTube(query) {
  // Method 1: Scrape YouTube directly
  try {
    const res = await axios.get(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`,
      { headers: { "User-Agent": USER_AGENT }, timeout: API_TIMEOUT },
    );
    const dataMatch = res.data.match(/var ytInitialData = ({.+?});<\/script>/s);
    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);
      const videos =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
          ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
      if (videos) {
        for (const item of videos) {
          const vr = item?.videoRenderer;
          if (vr?.videoId) {
            const thumbnails = vr.thumbnail?.thumbnails || [];
            const thumbnail =
              thumbnails[thumbnails.length - 1]?.url ||
              `https://img.youtube.com/vi/${vr.videoId}/maxresdefault.jpg`;
            return {
              videoId: vr.videoId,
              title:
                vr.title?.runs?.[0]?.text || vr.title?.simpleText || "Unknown",
              url: `https://www.youtube.com/watch?v=${vr.videoId}`,
              duration: vr.lengthText?.simpleText || "Unknown",
              views: vr.viewCountText?.simpleText || "N/A",
              author:
                vr.ownerText?.runs?.[0]?.text ||
                vr.longBylineText?.runs?.[0]?.text ||
                "Unknown",
              thumbnail,
            };
          }
        }
      }
    }
    const vid = res.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const title = res.data.match(/"title":{"runs":\[{"text":"([^"]+)"}/);
    if (vid) {
      return {
        videoId: vid[1],
        title: title?.[1] || query,
        url: `https://www.youtube.com/watch?v=${vid[1]}`,
        duration: "Unknown",
        views: "N/A",
        author: "Unknown",
        thumbnail: `https://img.youtube.com/vi/${vid[1]}/maxresdefault.jpg`,
      };
    }
  } catch (e) {
    console.log("YT search method 1 failed:", e.message);
  }

  // Method 2: Invidious instances
  const instances = [
    "https://invidious.snopyta.org",
    "https://vid.puffyan.us",
    "https://invidious.tiekoetter.com",
    "https://y.com.sb",
    "https://invidious.nerdvpn.de",
  ];
  for (const base of instances) {
    try {
      const r = await axios.get(`${base}/api/v1/search`, {
        params: { q: query, type: "video" },
        timeout: 8000,
      });
      if (r.data?.[0]?.videoId) {
        const v = r.data[0];
        const thumbnail =
          v.videoThumbnails?.find((t) => t.quality === "maxresdefault")?.url ||
          v.videoThumbnails?.find((t) => t.quality === "medium")?.url ||
          `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
        return {
          videoId: v.videoId,
          title: v.title || query,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          duration: formatDuration(v.lengthSeconds),
          views: formatNumber(v.viewCount),
          author: v.author || "Unknown",
          thumbnail,
        };
      }
    } catch (_) {}
  }
  return null;
}

// ========== YOUTUBE AUDIO DOWNLOAD ==========
async function downloadYouTubeAudio(videoId, videoUrl) {
  const url = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;

  // Method 1: Cobalt
  try {
    const res = await axios.post(
      "https://co.wuk.sh/api/json",
      { url, isAudioOnly: true, aFormat: "mp3", filenamePattern: "basic" },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: API_TIMEOUT,
      },
    );
    if (res.data?.url) {
      const buf = await downloadBuffer(res.data.url);
      if (buf.length > 10000) return { buffer: buf };
    }
  } catch (e) {
    console.log("Audio M1 failed:", e.message);
  }

  // Method 2: yt1s
  try {
    const analyzeRes = await axios.post(
      "https://yt1s.com/api/ajaxSearch/index",
      new URLSearchParams({ q: url, vt: "home" }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: API_TIMEOUT,
      },
    );
    if (analyzeRes.data?.links?.mp3) {
      const keys = Object.keys(analyzeRes.data.links.mp3);
      const k = analyzeRes.data.links.mp3[keys[0]]?.k;
      if (k) {
        const convertRes = await axios.post(
          "https://yt1s.com/api/ajaxConvert/convert",
          new URLSearchParams({ vid: videoId, k }).toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: API_TIMEOUT,
          },
        );
        if (convertRes.data?.dlink) {
          const buf = await downloadBuffer(convertRes.data.dlink);
          if (buf.length > 10000) return { buffer: buf };
        }
      }
    }
  } catch (e) {
    console.log("Audio M2 failed:", e.message);
  }

  // Method 3: loader.to
  try {
    const res = await axios.get("https://loader.to/api/button/", {
      params: { url, f: "mp3" },
      timeout: API_TIMEOUT,
    });
    if (res.data?.id) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const prog = await axios.get(
          `https://loader.to/api/progress/?id=${res.data.id}`,
          { timeout: 8000 },
        );
        if (prog.data?.download_url) {
          const buf = await downloadBuffer(prog.data.download_url);
          if (buf.length > 10000) return { buffer: buf };
          break;
        }
      }
    }
  } catch (e) {
    console.log("Audio M3 failed:", e.message);
  }

  // Method 4: RapidAPI
  if (ENV.RAPIDAPI_KEY) {
    try {
      const res = await axios.get("https://youtube-mp36.p.rapidapi.com/dl", {
        params: { id: videoId },
        headers: {
          "X-RapidAPI-Key": ENV.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
        },
        timeout: API_TIMEOUT,
      });
      if (res.data?.link) {
        const buf = await downloadBuffer(res.data.link);
        if (buf.length > 10000) return { buffer: buf };
      }
    } catch (e) {
      console.log("Audio M4 failed:", e.message);
    }
  }

  // Method 5: ytmp3.cc
  try {
    const res = await axios.get(`https://ytmp3.cc/en/youtube-mp3/${videoId}/`, {
      headers: { "User-Agent": USER_AGENT },
      timeout: API_TIMEOUT,
    });
    const match = res.data?.match(/https:\/\/[^"]+\.mp3[^"]*/);
    if (match) {
      const buf = await downloadBuffer(match[0]);
      if (buf.length > 10000) return { buffer: buf };
    }
  } catch (e) {
    console.log("Audio M5 failed:", e.message);
  }

  return null;
}

// ========== PLAY ==========
export async function play({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 PLAY MUSIC",
        "Download and play any song from YouTube\n\n" +
          "Usage: .play <song name or YouTube URL>\n\n" +
          "Examples:\n" +
          ".play Shape of You\n" +
          ".play Lose Yourself Eminem\n" +
          ".play https://youtu.be/xxxxx",
      ),
    });
  }

  const query = fullArgs.trim();
  await sendMsg(sock, from, { text: `🔍 Searching for *${query}*...` });

  let video = null;
  if (query.includes("youtu")) {
    const id = extractVideoId(query);
    if (id)
      video = {
        videoId: id,
        title: "YouTube Video",
        url: query,
        author: "Unknown",
        duration: "Unknown",
        thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      };
  }
  if (!video) video = await searchYouTube(query);

  if (!video) {
    return sendMsg(sock, from, {
      text: formatError(
        "NOT FOUND",
        `No results for "${query}"\n\nTry a different spelling or add the artist name.`,
      ),
    });
  }

  if (video.thumbnail) {
    try {
      await sendMsg(sock, from, {
        image: { url: video.thumbnail },
        caption:
          `📀 *${video.title}*\n` +
          `🎤 ${video.author} | ⏱️ ${video.duration} | 👁️ ${video.views || "N/A"}\n\n` +
          `⬇️ Downloading audio...\n\n${BRAND}`,
      });
    } catch (_) {
      await sendMsg(sock, from, {
        text: `📀 *${video.title}*\n🎤 ${video.author} | ⏱️ ${video.duration}\n\n⬇️ Downloading audio...\n\n${BRAND}`,
      });
    }
  } else {
    await sendMsg(sock, from, {
      text: `📀 *${video.title}*\n🎤 ${video.author} | ⏱️ ${video.duration}\n\n⬇️ Downloading audio...\n\n${BRAND}`,
    });
  }

  const dl = await downloadYouTubeAudio(video.videoId, video.url);

  if (dl?.buffer) {
    try {
      await sendMsg(sock, from, {
        audio: dl.buffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sendMsg(sock, from, {
        text: `✅ *${video.title}*\n🎤 ${video.author} | ⏱️ ${video.duration} | 📦 ${formatSize(dl.buffer.length)}\n\n${BRAND}`,
      });
    } catch (_) {
      await sendMsg(sock, from, {
        text: formatInfo(
          "🔗 YOUTUBE LINK",
          `🎵 *${video.title}*\n\n🔗 ${video.url}\n\n⚠️ Audio send failed — open link to listen.`,
        ),
      });
    }
  } else {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 YOUTUBE LINK",
        `🎵 *${video.title}*\n\n🔗 ${video.url}\n\n💡 Could not download audio — open link to listen.`,
      ),
    });
  }
}

// ========== YOUTUBE INFO ==========
export async function youtube({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📺 YOUTUBE INFO",
        "Get full info about any YouTube video\n\nUsage: .yt <url>\nExample: .yt https://youtu.be/dQw4w9WgXcQ",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching video info..." });
  const videoId = extractVideoId(fullArgs.trim());
  if (!videoId)
    return sendMsg(sock, from, {
      text: formatError("INVALID URL", "Please provide a valid YouTube URL."),
    });

  const instances = [
    "https://invidious.snopyta.org",
    "https://vid.puffyan.us",
    "https://invidious.tiekoetter.com",
    "https://y.com.sb",
    "https://invidious.nerdvpn.de",
  ];
  let info = null;
  for (const base of instances) {
    try {
      const r = await axios.get(`${base}/api/v1/videos/${videoId}`, {
        timeout: 8000,
      });
      if (r.data?.title) {
        info = r.data;
        break;
      }
    } catch (_) {}
  }

  if (!info)
    return sendMsg(sock, from, {
      text: formatError(
        "ERROR",
        "Could not fetch video info. Try again later.",
      ),
    });

  const published = info.published
    ? new Date(info.published * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";
  let desc = info.description || "No description";
  if (desc.length > 200) desc = desc.slice(0, 200) + "...";

  const thumb =
    info.videoThumbnails?.find((t) => t.quality === "maxresdefault") ||
    info.videoThumbnails?.find((t) => t.quality === "hqdefault") ||
    info.videoThumbnails?.[0];

  if (thumb?.url) {
    try {
      await sendMsg(sock, from, {
        image: { url: thumb.url },
        caption: `📺 *${info.title}*\n🎤 ${info.author}`,
      });
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text:
      `📺 *${info.title}*\n` +
      `🎤 ${info.author}\n` +
      `⏱️ ${formatDuration(info.lengthSeconds)} | 👁️ ${formatNumber(info.viewCount)} | 👍 ${formatNumber(info.likeCount)}\n` +
      `📅 ${published} | 📂 ${info.genre || "N/A"}\n` +
      `🏷️ ${info.keywords?.slice(0, 4).join(", ") || "None"}\n\n` +
      `📝 ${desc}\n\n` +
      `🔗 https://youtu.be/${videoId}\n\n${BRAND}`,
  });
}

// ========== TIKTOK ==========
export async function tiktok({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📱 TIKTOK DOWNLOAD",
        "Download TikTok videos without watermark\n\nUsage: .tiktok <url>\nExample: .tiktok https://vm.tiktok.com/xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading TikTok video..." });
  const url = fullArgs.trim();

  const found = await tryApis(
    [
      async () => {
        const res = await axios.post(
          "https://www.tikwm.com/api/",
          new URLSearchParams({ url, hd: "1" }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
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
      async () => {
        const tokenRes = await axios.get("https://ssstik.io/en", {
          headers: { "User-Agent": USER_AGENT },
          timeout: 10000,
        });
        const tokenMatch = tokenRes.data?.match(/s_tt\s*=\s*["']([^"']+)["']/);
        const token = tokenMatch?.[1] || "undefined";
        const res = await axios.post(
          "https://ssstik.io/abc?url=dl",
          new URLSearchParams({ id: url, locale: "en", tt: token }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://ssstik.io/en",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const dlMatch = res.data?.match(/href="(https:\/\/tikcdn[^"]+)"/);
        if (!dlMatch) throw new Error("No URL");
        const thumbMatch = res.data?.match(/data-src="([^"]+)"/);
        return {
          videoUrl: dlMatch[1],
          author: "TikTok User",
          title: "TikTok Video",
          thumbnail: thumbMatch?.[1],
        };
      },
      async () => {
        const res = await axios.post(
          "https://musicaldown.com/download",
          new URLSearchParams({ link: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://musicaldown.com/",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const match = res.data?.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No mp4");
        return {
          videoUrl: match[1],
          author: "TikTok User",
          title: "TikTok Video",
        };
      },
      async () => {
        const res = await axios.post(
          "https://api.tikmate.app/api/lookup",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const token = res.data?.token;
        const id = res.data?.id;
        if (!token || !id) throw new Error("No token");
        const dlUrl = `https://tikmate.app/download/${token}/${id}.mp4`;
        return {
          videoUrl: dlUrl,
          author: "TikTok User",
          title: "TikTok Video",
        };
      },
    ],
    ["tikwm", "ssstik", "musicaldown", "tikmate"],
  );

  if (!found) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download TikTok video.\n\n💡 Make sure the video is public.",
      ),
    });
  }

  const { result } = found;

  if (result.thumbnail) {
    try {
      await sendMsg(sock, from, {
        image: { url: result.thumbnail },
        caption:
          `📱 *${result.title}*\n` +
          `👤 ${result.author}` +
          (result.duration ? ` | ⏱️ ${result.duration}` : "") +
          `\n\n⬇️ Downloading...\n\n${BRAND}`,
      });
    } catch (_) {}
  }

  try {
    const buf = await downloadBuffer(result.videoUrl);
    let caption = `📱 *${result.title}*\n👤 ${result.author}`;
    if (result.duration) caption += ` | ⏱️ ${result.duration}`;
    if (result.likes) caption += `\n❤️ ${result.likes}`;
    if (result.shares) caption += ` | 🔁 ${result.shares}`;
    if (result.music) caption += `\n🎵 ${result.music}`;
    caption += `\n📦 ${formatSize(buf.length)}\n\n${BRAND}`;
    await sendMsg(sock, from, { video: buf, caption });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `📱 *${result.title}*\n👤 ${result.author}\n\n🔗 ${result.videoUrl}`,
      ),
    });
  }
}

// ========== INSTAGRAM ==========
export async function instagram({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📸 INSTAGRAM DOWNLOAD",
        "Download Instagram posts, reels & stories\n\nUsage: .ig <url>\nExample: .ig https://www.instagram.com/p/xxxxx/",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Instagram media..." });
  const url = fullArgs.trim();

  const found = await tryApis(
    [
      async () => {
        const res = await axios.post(
          "https://instafinsta.com/wp-json/aio-dl/video-data/",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const media = res.data?.medias?.[0];
        if (!media?.url) throw new Error("No media");
        return {
          type: media.videoAvailable ? "video" : "image",
          url: media.url,
          thumbnail: res.data?.thumbnail,
        };
      },
      async () => {
        const page = await axios.get("https://saveig.app/en", {
          headers: { "User-Agent": USER_AGENT },
          timeout: 10000,
        });
        const tokenMatch = page.data?.match(/name="_token"\s+value="([^"]+)"/);
        const res = await axios.post(
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
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const vMatch = res.data?.data?.match(
          /href="(https?:\/\/[^"]+\.mp4[^"]*)"/,
        );
        if (vMatch) return { type: "video", url: vMatch[1] };
        const iMatch = res.data?.data?.match(
          /src="(https?:\/\/[^"]+\.(jpg|jpeg|png)[^"]*)"/,
        );
        if (iMatch) return { type: "image", url: iMatch[1] };
        throw new Error("No media");
      },
      async () => {
        const res = await axios.post(
          "https://igram.world/api/convert",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const item = res.data?.[0];
        if (!item?.url) throw new Error("No media");
        return {
          type: item.type === "video" ? "video" : "image",
          url: item.url,
        };
      },
      async () => {
        const res = await axios.post(
          "https://snapinsta.app/api",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        const imgMatch = res.data?.match(/src="(https?:\/\/[^"]+\.jpg[^"]*)"/);
        if (match) return { type: "video", url: match[1] };
        if (imgMatch) return { type: "image", url: imgMatch[1] };
        throw new Error("No media");
      },
    ],
    ["instafinsta", "saveig", "igram", "snapinsta"],
  );

  if (!found) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Instagram media.\n\n💡 Make sure the post is public.",
      ),
    });
  }

  const { result } = found;
  try {
    const buf = await downloadBuffer(result.url);
    const caption = `📸 *Instagram Media*\n📦 ${formatSize(buf.length)}\n\n${BRAND}`;
    if (result.type === "video") {
      await sendMsg(sock, from, { video: buf, caption });
    } else {
      await sendMsg(sock, from, { image: buf, caption });
    }
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 MEDIA LINK",
        `📸 *Instagram Media*\n\n🔗 ${result.url}`,
      ),
    });
  }
}

// ========== FACEBOOK ==========
export async function facebook({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "👤 FACEBOOK DOWNLOAD",
        "Download Facebook videos\n\nUsage: .fb <url>\nExample: .fb https://www.facebook.com/watch?v=xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Facebook video..." });
  const url = fullArgs.trim();

  const found = await tryApis(
    [
      async () => {
        const res = await axios.post(
          "https://co.wuk.sh/api/json",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            timeout: API_TIMEOUT,
          },
        );
        if (!res.data?.url) throw new Error("No URL");
        return { videoUrl: res.data.url };
      },
      async () => {
        const res = await axios.post(
          "https://fdown.net/download.php",
          new URLSearchParams({ URLz: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const hd = res.data?.match(/id="hdlink" href="([^"]+)"/);
        const sd = res.data?.match(/id="sdlink" href="([^"]+)"/);
        const link = hd?.[1] || sd?.[1];
        if (!link) throw new Error("No video");
        return { videoUrl: link };
      },
      async () => {
        const res = await axios.post(
          "https://getfvid.com/downloader",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1] };
      },
      async () => {
        const res = await axios.post(
          "https://fbdown.net/download.php",
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1] };
      },
    ],
    ["cobalt", "fdown", "getfvid", "fbdown"],
  );

  if (!found) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Facebook video.\n\n💡 Make sure the video is public.",
      ),
    });
  }

  try {
    const buf = await downloadBuffer(found.result.videoUrl);
    await sendMsg(sock, from, {
      video: buf,
      caption: `👤 *Facebook Video*\n📦 ${formatSize(buf.length)}\n\n${BRAND}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `👤 *Facebook Video*\n\n🔗 ${found.result.videoUrl}`,
      ),
    });
  }
}

// ========== TWITTER/X ==========
export async function twitter({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🐦 TWITTER/X DOWNLOAD",
        "Download Twitter/X videos\n\nUsage: .twitter <url>\nExample: .twitter https://twitter.com/user/status/xxxxx",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⬇️ Downloading Twitter/X media..." });
  const url = fullArgs.trim();

  const found = await tryApis(
    [
      async () => {
        const res = await axios.get("https://twitsave.com/info", {
          params: { url },
          headers: { "User-Agent": USER_AGENT },
          timeout: API_TIMEOUT,
        });
        const matches = [
          ...(res.data?.matchAll(/data-url="([^"]+\.mp4[^"]*)"/g) || []),
        ];
        if (!matches.length) throw new Error("No video");
        return { videoUrl: matches[0][1] };
      },
      async () => {
        const res = await axios.post(
          "https://co.wuk.sh/api/json",
          { url },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            timeout: API_TIMEOUT,
          },
        );
        if (!res.data?.url) throw new Error("No URL");
        return { videoUrl: res.data.url };
      },
      async () => {
        const res = await axios.get("https://getmytweet.com/", {
          params: { url },
          headers: { "User-Agent": USER_AGENT },
          timeout: API_TIMEOUT,
        });
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1] };
      },
      async () => {
        const res = await axios.post(
          "https://twittervideodownloader.com/download",
          new URLSearchParams({ tweet: url }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": USER_AGENT,
            },
            timeout: API_TIMEOUT,
          },
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
        if (!match) throw new Error("No video");
        return { videoUrl: match[1] };
      },
    ],
    ["twitsave", "cobalt", "getmytweet", "twittervideodownloader"],
  );

  if (!found) {
    return sendMsg(sock, from, {
      text: formatError(
        "FAILED",
        "Could not download Twitter/X media.\n\n💡 Make sure the tweet is public.",
      ),
    });
  }

  try {
    const buf = await downloadBuffer(found.result.videoUrl);
    await sendMsg(sock, from, {
      video: buf,
      caption: `🐦 *Twitter/X Video*\n📦 ${formatSize(buf.length)}\n\n${BRAND}`,
    });
  } catch (_) {
    await sendMsg(sock, from, {
      text: formatInfo(
        "🔗 VIDEO LINK",
        `🐦 *Twitter/X Video*\n\n🔗 ${found.result.videoUrl}`,
      ),
    });
  }
}

// ========== SPOTIFY ==========
export async function spotify({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎵 SPOTIFY",
        "Get Spotify track info + audio preview\n\nUsage: .spotify <url or track name>\n\nExamples:\n.spotify https://open.spotify.com/track/xxxxx\n.spotify Blinding Lights",
      ),
    });
  }

  await sendMsg(sock, from, { text: "⏳ Fetching Spotify data..." });
  const input = fullArgs.trim();
  let trackData = null;

  if (input.includes("spotify.com/track/")) {
    try {
      const embedRes = await axios.get(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(input)}`,
        { timeout: API_TIMEOUT },
      );
      if (embedRes.data) {
        trackData = {
          title: embedRes.data.title,
          artist: embedRes.data.author_name,
          thumbnail: embedRes.data.thumbnail_url,
          url: input,
          preview: null,
        };
      }
    } catch (_) {}
  }

  // JioSaavn search (free, no key needed)
  try {
    const searchRes = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(input)}&page=1&limit=1`,
      { timeout: API_TIMEOUT },
    );
    const song = searchRes.data?.data?.results?.[0];
    if (song) {
      const thumbnail =
        song.image?.find((i) => i.quality === "500x500")?.url ||
        song.image?.find((i) => i.quality === "150x150")?.url ||
        song.image?.[0]?.url;
      trackData = {
        title: song.name,
        artist:
          song.artists?.primary?.map((a) => a.name).join(", ") || "Unknown",
        album: song.album?.name || "Unknown",
        thumbnail,
        preview:
          song.downloadUrl?.find((d) => d.quality === "160kbps")?.url || null,
        duration: formatDuration(song.duration),
        url: song.url || input,
        year: song.year,
        language: song.language,
      };
    }
  } catch (_) {}

  if (!trackData) {
    return sendMsg(sock, from, {
      text: formatError("NOT FOUND", "Could not find that track."),
    });
  }

  if (trackData.thumbnail) {
    try {
      await sendMsg(sock, from, {
        image: { url: trackData.thumbnail },
        caption:
          `🎵 *${trackData.title}*\n` +
          `🎤 ${trackData.artist}` +
          (trackData.album ? ` | 💿 ${trackData.album}` : "") +
          (trackData.duration ? ` | ⏱️ ${trackData.duration}` : "") +
          (trackData.year ? `\n📅 ${trackData.year}` : "") +
          (trackData.language ? ` | 🌐 ${trackData.language}` : "") +
          `\n\n${BRAND}`,
      });
    } catch (_) {}
  }

  await sendMsg(sock, from, {
    text:
      `🎵 *${trackData.title}*\n` +
      `🎤 ${trackData.artist}` +
      (trackData.album ? ` | 💿 ${trackData.album}` : "") +
      (trackData.duration ? ` | ⏱️ ${trackData.duration}` : "") +
      (trackData.year ? `\n📅 ${trackData.year}` : "") +
      (trackData.language ? ` | 🌐 ${trackData.language}` : "") +
      `\n\n🔗 ${trackData.url}\n\n${BRAND}`,
  });

  if (trackData.preview) {
    try {
      const buf = await downloadBuffer(trackData.preview);
      await sendMsg(sock, from, {
        audio: buf,
        mimetype: "audio/mpeg",
        ptt: false,
      });
    } catch (_) {}
  }
}

// ========== PINTEREST ==========
export async function pinterest({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "📌 PINTEREST",
        "Search Pinterest for images\n\nUsage: .pinterest <search term>\nExample: .pinterest anime aesthetic",
      ),
    });
  }

  await sendMsg(sock, from, {
    text: `🔍 Searching Pinterest for "${fullArgs}"...`,
  });

  try {
    const res = await axios.get(
      "https://www.pinterest.com/resource/BaseSearchResource/get/",
      {
        params: {
          source_url: `/search/pins/?q=${encodeURIComponent(fullArgs)}`,
          data: JSON.stringify({
            options: { query: fullArgs, scope: "pins", page_size: 25 },
          }),
        },
        headers: {
          "User-Agent": USER_AGENT,
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: API_TIMEOUT,
      },
    );
    const pins = res.data?.resource_response?.data?.results;
    const valid = pins?.filter((p) => p.images?.["736x"]?.url);
    if (!valid?.length) throw new Error("No pins");
    const pin = valid[Math.floor(Math.random() * valid.length)];
    await sendMsg(sock, from, {
      image: { url: pin.images["736x"].url },
      caption: `📌 *${fullArgs}*\n\n${BRAND}`,
    });
  } catch (_) {
    try {
      const r1 = await axios.get(
        `https://duckduckgo.com/?q=${encodeURIComponent(fullArgs + " site:pinterest.com")}&iax=images&ia=images`,
        { headers: { "User-Agent": USER_AGENT }, timeout: 8000 },
      );
      const token = r1.data?.match(/vqd=([\d-]+)/)?.[1];
      if (!token) throw new Error("No token");
      const r2 = await axios.get(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(fullArgs)}&vqd=${token}`,
        {
          headers: {
            "User-Agent": USER_AGENT,
            Referer: "https://duckduckgo.com/",
          },
          timeout: 8000,
        },
      );
      const results = r2.data?.results;
      if (!results?.length) throw new Error("No results");
      const pick =
        results[Math.floor(Math.random() * Math.min(results.length, 10))];
      await sendMsg(sock, from, {
        image: { url: pick.image },
        caption: `📌 *${fullArgs}*\n\n${BRAND}`,
      });
    } catch (_) {
      await sendMsg(sock, from, {
        text: formatError(
          "NOT FOUND",
          "Could not find Pinterest images. Try a different search term.",
        ),
      });
    }
  }
}

// ========== IMAGE SEARCH ==========
export async function image({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🖼️ IMAGE SEARCH",
        "Search for any image\n\nUsage: .img <search term>\nExample: .img sunset landscape",
      ),
    });
  }

  await sendMsg(sock, from, {
    text: `🔍 Searching images for "${fullArgs}"...`,
  });

  let imageUrl = null;

  if (ENV.PIXABAY_KEY && !imageUrl) {
    try {
      const res = await axios.get("https://pixabay.com/api/", {
        params: {
          key: ENV.PIXABAY_KEY,
          q: fullArgs,
          per_page: 20,
          safesearch: true,
          image_type: "photo",
        },
        timeout: API_TIMEOUT,
      });
      const hits = res.data?.hits;
      if (hits?.length)
        imageUrl = hits[Math.floor(Math.random() * hits.length)].largeImageURL;
    } catch (e) {
      console.log("Pixabay failed:", e.message);
    }
  }

  if (ENV.UNSPLASH_KEY && !imageUrl) {
    try {
      const res = await axios.get("https://api.unsplash.com/search/photos", {
        params: { query: fullArgs, per_page: 20, orientation: "landscape" },
        headers: { Authorization: `Client-ID ${ENV.UNSPLASH_KEY}` },
        timeout: API_TIMEOUT,
      });
      const results = res.data?.results;
      if (results?.length)
        imageUrl =
          results[Math.floor(Math.random() * results.length)].urls.regular;
    } catch (e) {
      console.log("Unsplash failed:", e.message);
    }
  }

  if (!imageUrl) {
    try {
      const r1 = await axios.get(
        `https://duckduckgo.com/?q=${encodeURIComponent(fullArgs)}&iax=images&ia=images`,
        { headers: { "User-Agent": USER_AGENT }, timeout: 8000 },
      );
      const token = r1.data?.match(/vqd=([\d-]+)/)?.[1];
      if (token) {
        const r2 = await axios.get(
          `https://duckduckgo.com/i.js?q=${encodeURIComponent(fullArgs)}&vqd=${token}`,
          {
            headers: {
              "User-Agent": USER_AGENT,
              Referer: "https://duckduckgo.com/",
            },
            timeout: 8000,
          },
        );
        const results = r2.data?.results;
        if (results?.length) {
          imageUrl =
            results[Math.floor(Math.random() * Math.min(results.length, 15))]
              .image;
        }
      }
    } catch (e) {
      console.log("DDG failed:", e.message);
    }
  }

  if (!imageUrl) {
    return sendMsg(sock, from, {
      text: formatError("NOT FOUND", "Could not find images for that query."),
    });
  }

  await sendMsg(sock, from, {
    image: { url: imageUrl },
    caption: `🖼️ *${fullArgs}*\n\n${BRAND}`,
  });
}

// ========== GIF SEARCH ==========
export async function gif({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "🎞️ GIF SEARCH",
        "Search for animated GIFs\n\nUsage: .gif <search term>\nExample: .gif happy dance",
      ),
    });
  }

  await sendMsg(sock, from, { text: `🔍 Searching GIFs for "${fullArgs}"...` });

  let gifUrl = null;
  let gifTitle = null;

  if (ENV.GIPHY_KEY) {
    try {
      const res = await axios.get("https://api.giphy.com/v1/gifs/search", {
        params: { api_key: ENV.GIPHY_KEY, q: fullArgs, limit: 20, rating: "g" },
        timeout: API_TIMEOUT,
      });
      const data = res.data?.data;
      if (data?.length) {
        const randomGif = data[Math.floor(Math.random() * data.length)];
        gifUrl =
          randomGif.images?.original?.mp4 || randomGif.images?.original?.url;
        gifTitle = randomGif.title;
      }
    } catch (e) {
      console.log("Giphy failed:", e.message);
    }
  }

  // Tenor fallback
  if (!gifUrl && ENV.TENOR_KEY) {
    try {
      const res = await axios.get("https://tenor.googleapis.com/v2/search", {
        params: {
          q: fullArgs,
          key: ENV.TENOR_KEY,
          limit: 10,
          media_filter: "mp4",
        },
        timeout: API_TIMEOUT,
      });
      const results = res.data?.results;
      if (results?.length) {
        const pick = results[Math.floor(Math.random() * results.length)];
        gifUrl = pick.media_formats?.mp4?.url || pick.media_formats?.gif?.url;
        gifTitle = pick.title || fullArgs;
      }
    } catch (e) {
      console.log("Tenor failed:", e.message);
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

  const caption = `🎞️ *${fullArgs}*${gifTitle ? `\n📝 ${gifTitle}` : ""}\n\n${BRAND}`;

  try {
    if (gifUrl.endsWith(".gif")) {
      const buf = await downloadBuffer(gifUrl);
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

// ========== MASTER DOWNLOAD ROUTER ==========
export async function download({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return sendMsg(sock, from, {
      text: formatInfo(
        "⬇️ DOWNLOAD MEDIA",
        "Universal Media Downloader\n\n" +
          "Usage: .dl <url>\n\n" +
          "Supported:\n" +
          "▸ YouTube  → .play <song>\n" +
          "▸ TikTok   → .tiktok <url>\n" +
          "▸ Instagram → .ig <url>\n" +
          "▸ Facebook → .fb <url>\n" +
          "▸ Twitter/X → .twitter <url>\n" +
          "▸ Spotify  → .spotify <url>\n" +
          "▸ Pinterest → .pin <query>",
      ),
    });
  }

  let url = fullArgs.trim();
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
  if (url.includes("pinterest.com"))
    return pinterest({ fullArgs: url, from, sock });

  // Direct file download
  const extMatch = url.match(
    /\.(jpg|jpeg|png|gif|mp4|mp3|pdf|docx?|webp|avi|mov|mkv|wav|ogg|m4a|zip|rar)(\?.*)?$/i,
  );
  if (extMatch) {
    await sendMsg(sock, from, { text: "⬇️ Downloading file..." });
    try {
      const buf = await downloadBuffer(url);
      const ext = extMatch[1].toLowerCase();
      const size = formatSize(buf.length);
      const filename = url.split("/").pop()?.split("?")[0] || `file.${ext}`;

      if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
        await sendMsg(sock, from, {
          image: buf,
          caption: `🖼️ *Downloaded*\n📦 ${size}\n\n${BRAND}`,
        });
      } else if (["mp4", "avi", "mov", "mkv"].includes(ext)) {
        await sendMsg(sock, from, {
          video: buf,
          caption: `🎬 *Downloaded*\n📦 ${size}\n\n${BRAND}`,
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
          fileName: filename,
          caption: `📄 *${filename}*\n📦 ${size}\n\n${BRAND}`,
        });
      }
    } catch (e) {
      await sendMsg(sock, from, {
        text: formatError(
          "DOWNLOAD FAILED",
          `Could not download file.\n\n${e.message}`,
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
