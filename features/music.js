// features/music.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE FIXED MUSIC MODULE
//  Author: AYOCODES
//
//  ✅ DOWNLOAD CHAIN (7 sources, tried in order):
//    1. JioSaavn  — full 320kbps tracks, no key needed (BEST)
//    2. Deezer    — 30-second preview, always available
//    3. Audius    — decentralized (stream bug fixed)
//    4. cobalt    — api.cobalt.tools (updated domain)
//    5. y2mate    — fixed API path (was pointing to fake domain)
//    6. yt1s      — fixed field name (.k not .d)
//    7. RapidAPI  — uses RAPIDAPI_KEY from .env
//
//  ✅ SEARCH CHAIN (5 sources):
//    JioSaavn → Deezer → Invidious (updated instances) → Jamendo → Audius
//
//  ✅ LYRICS (4 sources):
//    PopCat → Lyrist → Lyrics.ovh → Genius (scraped)
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import * as cheerio from "cheerio";
import { ENV } from "../index.js";
import {
  formatData,
  formatError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";

// ─── Invidious instances (updated — same list as downloader.js) ───────────────
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

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

const AYOBOT_TAG = `⚡ _AYOBOT v1 by AYOCODES_`;

// ─── Cache & Rate Limiting ────────────────────────────────────────────────────
const musicCache = new Map();
const apiRateLimit = new Map();

function checkApiRateLimit(name) {
  const now = Date.now();
  const recent = (apiRateLimit.get(name) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return false;
  recent.push(now);
  apiRateLimit.set(name, recent);
  return true;
}

// ─── Duration formatter ───────────────────────────────────────────────────────
function fmtDur(secs) {
  if (!secs || isNaN(parseInt(secs))) return "N/A";
  const total = parseInt(secs);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Format file size ─────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ─── Safe buffer download with retry ──────────────────────────────────────────
async function downloadBuffer(
  url,
  timeout = 60_000,
  maxSize = 80 * 1024 * 1024,
) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout,
        maxContentLength: maxSize,
        maxRedirects: 10,
        headers: {
          ...BROWSER_HEADERS,
          Accept: "*/*",
          Range: "bytes=0-",
        },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5000)
        throw new Error(`Buffer too small (${buf.length} bytes)`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(
        `[music] Download attempt ${attempt + 1} failed: ${err.message}`,
      );
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN ROUTER
// ════════════════════════════════════════════════════════════════════════════
export async function music({ fullArgs, from, sock }) {
  try {
    if (!fullArgs?.trim()) return showMusicHelp(from, sock);
    const sub = fullArgs.trim().toLowerCase().split(/\s+/)[0];
    switch (sub) {
      case "trending":
      case "top":
        return musicTrending({ from, sock });
      case "random":
        return musicRandom({ from, sock });
      case "artist":
        return musicArtist({
          fullArgs: fullArgs.replace(/^artist\s+/i, ""),
          from,
          sock,
        });
      case "album":
        return musicAlbum({
          fullArgs: fullArgs.replace(/^album\s+/i, ""),
          from,
          sock,
        });
      case "search":
        return musicSearch({
          fullArgs: fullArgs.replace(/^search\s+/i, ""),
          from,
          sock,
        });
      case "play":
      case "download":
        return musicDownload({
          fullArgs: fullArgs.replace(/^(play|download)\s+/i, ""),
          from,
          sock,
        });
      case "genius":
        return musicGenius({
          fullArgs: fullArgs.replace(/^genius\s+/i, ""),
          from,
          sock,
        });
      default:
        return musicLyrics({ fullArgs, from, sock });
    }
  } catch (err) {
    console.error("❌ Music error:", err);
    await sock.sendMessage(from, {
      text: formatError("MUSIC ERROR", err.message || "An error occurred."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MUSIC DOWNLOAD — COMPLETELY FIXED
//  Download chain: JioSaavn → Deezer → Audius → cobalt → y2mate → yt1s → RapidAPI
// ════════════════════════════════════════════════════════════════════════════
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 DOWNLOAD MUSIC",
        `Usage: ${ENV.PREFIX}play <song name or URL>\n\n` +
          `Examples:\n• ${ENV.PREFIX}play wildflower billie eilish\n• ${ENV.PREFIX}play Essence Wizkid\n` +
          `• ${ENV.PREFIX}play https://youtu.be/xxxxx\n\n` +
          `💡 Search first: ${ENV.PREFIX}musicsearch <query>`,
      ),
    });
  }

  const query = fullArgs.trim();
  await sock.sendMessage(from, { text: `🔍 *Searching for "${query}"...*` });

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 1: FIND SONG INFO
  //  Try each source until we have title, artist, and ideally a direct audio URL
  // ══════════════════════════════════════════════════════════════════════════
  let songInfo = null;

  // ── Source 1: JioSaavn (saavn.dev) — full tracks + metadata ──────────────
  try {
    const res = await axios.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=5`,
      { timeout: 10_000 },
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
        track.downloadUrl?.find((d) => d.quality === "96kbps")?.url ||
        track.downloadUrl?.[0]?.url;
      songInfo = {
        id: null,
        title: track.name,
        artist:
          track.artists?.primary?.map((a) => a.name).join(", ") || "Unknown",
        duration: track.duration,
        thumbnail: thumb,
        audioUrl, // direct MP3 — no conversion needed
        source: "JioSaavn",
        url: track.url,
      };
      console.log(
        `[music] JioSaavn found: ${songInfo.title} | audioUrl: ${!!audioUrl}`,
      );
    }
  } catch (err) {
    console.log(`[music] JioSaavn search failed: ${err.message}`);
  }

  // ── Source 2: Deezer (great metadata + 30s preview URL) ──────────────────
  if (!songInfo) {
    try {
      const res = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`,
        { timeout: 8_000 },
      );
      const t = res.data?.data?.[0];
      if (t) {
        songInfo = {
          id: null,
          title: t.title,
          artist: t.artist.name,
          duration: t.duration,
          thumbnail: t.album.cover_medium,
          preview: t.preview, // 30-second preview URL
          source: "Deezer",
          url: t.link,
        };
        console.log(`[music] Deezer found: ${songInfo.title}`);
      }
    } catch (err) {
      console.log(`[music] Deezer search failed: ${err.message}`);
    }
  }

  // ── Source 3: Updated Invidious instances ─────────────────────────────────
  if (!songInfo) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const res = await axios.get(
          `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
          { timeout: 7_000, headers: { Accept: "application/json" } },
        );
        const v = res.data?.[0];
        if (v?.videoId) {
          songInfo = {
            id: v.videoId,
            title: v.title,
            artist: v.author,
            duration: v.lengthSeconds,
            thumbnail:
              v.videoThumbnails?.find((t) => t.quality === "medium")?.url ||
              `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
            source: "YouTube",
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
          };
          console.log(
            `[music] Invidious (${instance}) found: ${songInfo.title}`,
          );
          break;
        }
      } catch (_) {}
    }
  }

  // ── Source 4: Deezer search again (if all above failed) ──────────────────
  if (!songInfo) {
    try {
      const res = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`,
        { timeout: 8_000 },
      );
      const t = res.data?.data?.[0];
      if (t) {
        songInfo = {
          id: null,
          title: t.title,
          artist: t.artist.name,
          duration: t.duration,
          thumbnail: t.album.cover_medium,
          preview: t.preview,
          source: "Deezer",
          url: t.link,
        };
      }
    } catch (_) {}
  }

  // ── Source 5: Jamendo (CC/indie music) ────────────────────────────────────
  if (!songInfo) {
    try {
      const res = await axios.get(
        `https://api.jamendo.com/v3.0/tracks/?client_id=3a7a4d3a&format=json&limit=1&search=${encodeURIComponent(query)}`,
        { timeout: 8_000 },
      );
      const t = res.data?.results?.[0];
      if (t) {
        songInfo = {
          id: t.id,
          title: t.name,
          artist: t.artist_name,
          duration: t.duration,
          thumbnail: t.image,
          audioUrl: t.audio, // full track direct URL
          source: "Jamendo",
          url: t.shareurl,
        };
        console.log(`[music] Jamendo found: ${songInfo.title}`);
      }
    } catch (err) {
      console.log(`[music] Jamendo search failed: ${err.message}`);
    }
  }

  if (!songInfo) {
    return sock.sendMessage(from, {
      text: formatError(
        "NOT FOUND",
        `Could not find "${query}" on any music service.\n\n` +
          `Tips:\n• Check spelling\n• Try: ${ENV.PREFIX}musicsearch ${query}\n• Try with artist: ${query} - Artist Name`,
      ),
    });
  }

  // Show info card while we download
  await sock.sendMessage(from, {
    text:
      `🎵 *Found:* ${songInfo.title}\n` +
      `👤 *Artist:* ${songInfo.artist}\n` +
      (songInfo.duration
        ? `⏱️ *Duration:* ${fmtDur(songInfo.duration)}\n`
        : "") +
      `📡 *Source:* ${songInfo.source}\n\n` +
      `⬇️ *Downloading audio...*\n` +
      AYOBOT_TAG,
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 2: DOWNLOAD AUDIO
  //  7-method chain. Each method is independent — failures don't block the next.
  // ══════════════════════════════════════════════════════════════════════════
  let audioBuffer = null;
  let usedApi = "";
  let isPreview = false;
  const failedApis = [];

  // ── Download Method 1: JioSaavn direct URL (if we have it) ───────────────
  if (!audioBuffer && songInfo.audioUrl) {
    try {
      console.log(`[music] M1 JioSaavn direct: ${songInfo.audioUrl}`);
      audioBuffer = await downloadBuffer(songInfo.audioUrl, 60_000);
      usedApi = `JioSaavn (${songInfo.source === "Jamendo" ? "Jamendo" : "JioSaavn"})`;
    } catch (err) {
      console.log(`[music] M1 direct URL failed: ${err.message}`);
      failedApis.push("Direct");
    }
  }

  // ── Download Method 2: JioSaavn search → download (when found via other source) ──
  if (!audioBuffer) {
    try {
      console.log(
        `[music] M2 JioSaavn search for: ${songInfo.title} ${songInfo.artist}`,
      );
      const res = await axios.get(
        `https://saavn.dev/api/search/songs?query=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&page=1&limit=3`,
        { timeout: 10_000 },
      );
      const tracks = res.data?.data?.results || [];
      // Pick best match
      const track =
        tracks.find((t) =>
          t.name
            ?.toLowerCase()
            .includes(songInfo.title.toLowerCase().split(" ")[0]),
        ) || tracks[0];

      const audioUrl =
        track?.downloadUrl?.find((d) => d.quality === "320kbps")?.url ||
        track?.downloadUrl?.find((d) => d.quality === "160kbps")?.url ||
        track?.downloadUrl?.[0]?.url;

      if (audioUrl) {
        audioBuffer = await downloadBuffer(audioUrl, 60_000);
        usedApi = "JioSaavn 320kbps";
        console.log(
          `[music] M2 JioSaavn success: ${fmtSize(audioBuffer.length)}`,
        );
      } else {
        throw new Error("No download URL in JioSaavn result");
      }
    } catch (err) {
      console.log(`[music] M2 JioSaavn search-download failed: ${err.message}`);
      failedApis.push("JioSaavn");
    }
  }

  // ── Download Method 3: Deezer 30-second preview ───────────────────────────
  if (!audioBuffer) {
    try {
      console.log(`[music] M3 Deezer preview`);
      // Use existing preview if available, otherwise search Deezer
      let previewUrl = songInfo.preview;
      if (!previewUrl) {
        const res = await axios.get(
          `https://api.deezer.com/search?q=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&limit=1`,
          { timeout: 8_000 },
        );
        previewUrl = res.data?.data?.[0]?.preview;
      }
      if (!previewUrl) throw new Error("No Deezer preview URL");
      audioBuffer = await downloadBuffer(previewUrl, 30_000);
      usedApi = "Deezer";
      isPreview = true;
      console.log(
        `[music] M3 Deezer preview success: ${fmtSize(audioBuffer.length)}`,
      );
    } catch (err) {
      console.log(`[music] M3 Deezer failed: ${err.message}`);
      failedApis.push("Deezer");
    }
  }

  // ── Download Method 4: Audius stream (FIXED — direct arraybuffer) ─────────
  if (!audioBuffer) {
    try {
      console.log(`[music] M4 Audius`);
      const searchRes = await axios.get(
        `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&limit=3`,
        { timeout: 8_000 },
      );
      const track = searchRes.data?.data?.[0];
      if (!track?.id) throw new Error("No Audius track found");

      // FIX: use responseType:'arraybuffer' directly on the stream endpoint
      // The /stream endpoint does a redirect to the actual CDN file
      const streamRes = await axios.get(
        `https://discoveryprovider.audius.co/v1/tracks/${track.id}/stream`,
        {
          responseType: "arraybuffer",
          timeout: 45_000,
          maxRedirects: 10,
          headers: { ...BROWSER_HEADERS, Accept: "audio/*,*/*" },
        },
      );
      const buf = Buffer.from(streamRes.data);
      if (buf.length < 5000) throw new Error("Audius stream too small");
      audioBuffer = buf;
      usedApi = "Audius";
      console.log(`[music] M4 Audius success: ${fmtSize(audioBuffer.length)}`);
    } catch (err) {
      console.log(`[music] M4 Audius failed: ${err.message}`);
      failedApis.push("Audius");
    }
  }

  // ── Download Method 5: cobalt.tools (YouTube audio) ──────────────────────
  if (!audioBuffer) {
    try {
      console.log(`[music] M5 cobalt.tools`);
      // Resolve YouTube video ID
      let videoId = songInfo.id;
      if (!videoId && songInfo.url?.includes("youtube")) {
        videoId = songInfo.url.split("v=")[1]?.split("&")[0];
      }
      if (!videoId) {
        // Search Invidious for YouTube ID
        for (const inst of INVIDIOUS_INSTANCES) {
          try {
            const r = await axios.get(
              `${inst}/api/v1/search?q=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&type=video`,
              { timeout: 7_000 },
            );
            if (r.data?.[0]?.videoId) {
              videoId = r.data[0].videoId;
              break;
            }
          } catch (_) {}
        }
      }
      if (!videoId) throw new Error("Could not resolve YouTube ID for cobalt");

      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const res = await axios.post(
        "https://api.cobalt.tools/api/json",
        {
          url: ytUrl,
          isAudioOnly: true,
          aFormat: "mp3",
          filenamePattern: "basic",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 20_000,
        },
      );
      if (!res.data?.url) throw new Error("cobalt returned no URL");
      audioBuffer = await downloadBuffer(res.data.url, 60_000);
      usedApi = "cobalt (YouTube)";
      console.log(`[music] M5 cobalt success: ${fmtSize(audioBuffer.length)}`);
    } catch (err) {
      console.log(`[music] M5 cobalt failed: ${err.message}`);
      failedApis.push("cobalt");
    }
  }

  // ── Download Method 6: y2mate.com (FIXED — correct domain & API path) ─────
  if (!audioBuffer) {
    try {
      console.log(`[music] M6 y2mate`);
      let videoId = songInfo.id;
      if (!videoId) {
        for (const inst of INVIDIOUS_INSTANCES) {
          try {
            const r = await axios.get(
              `${inst}/api/v1/search?q=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&type=video`,
              { timeout: 7_000 },
            );
            if (r.data?.[0]?.videoId) {
              videoId = r.data[0].videoId;
              break;
            }
          } catch (_) {}
        }
      }
      if (!videoId) throw new Error("No YouTube ID for y2mate");

      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Step 1: Analyze
      const analyzeRes = await axios.post(
        "https://www.y2mate.com/mates/analyzeV2/ajax",
        new URLSearchParams({
          k_query: ytUrl,
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
      const mp3Links = analyzeRes.data?.links?.mp3;
      if (!mp3Links) throw new Error("y2mate: no mp3 links in response");
      const firstKey = Object.keys(mp3Links)[0];
      const k = mp3Links[firstKey]?.k;
      if (!k) throw new Error("y2mate: no conversion key");

      // Step 2: Convert
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
      if (!convertRes.data?.dlink) throw new Error("y2mate: no download link");
      audioBuffer = await downloadBuffer(convertRes.data.dlink, 60_000);
      usedApi = "y2mate";
      console.log(`[music] M6 y2mate success: ${fmtSize(audioBuffer.length)}`);
    } catch (err) {
      console.log(`[music] M6 y2mate failed: ${err.message}`);
      failedApis.push("y2mate");
    }
  }

  // ── Download Method 7: yt1s.com (FIXED — correct field .k not .d) ────────
  if (!audioBuffer) {
    try {
      console.log(`[music] M7 yt1s`);
      let videoId = songInfo.id;
      if (!videoId) {
        for (const inst of INVIDIOUS_INSTANCES) {
          try {
            const r = await axios.get(
              `${inst}/api/v1/search?q=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&type=video`,
              { timeout: 7_000 },
            );
            if (r.data?.[0]?.videoId) {
              videoId = r.data[0].videoId;
              break;
            }
          } catch (_) {}
        }
      }
      if (!videoId) throw new Error("No YouTube ID for yt1s");

      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Step 1: Search
      const searchRes = await axios.post(
        "https://yt1s.com/api/ajaxSearch/index",
        new URLSearchParams({ q: ytUrl, vt: "home" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...BROWSER_HEADERS,
          },
          timeout: 15_000,
        },
      );
      const mp3Obj = searchRes.data?.links?.mp3;
      if (!mp3Obj) throw new Error("yt1s: no mp3 links");
      // FIX: get first quality key, use .k (conversion key) not .d
      const qualityKey = Object.keys(mp3Obj)[0];
      const k = mp3Obj[qualityKey]?.k;
      if (!k) throw new Error("yt1s: no conversion key (.k field missing)");

      // Step 2: Convert
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
      if (!convertRes.data?.dlink) throw new Error("yt1s: no download link");
      audioBuffer = await downloadBuffer(convertRes.data.dlink, 60_000);
      usedApi = "yt1s";
      console.log(`[music] M7 yt1s success: ${fmtSize(audioBuffer.length)}`);
    } catch (err) {
      console.log(`[music] M7 yt1s failed: ${err.message}`);
      failedApis.push("yt1s");
    }
  }

  // ── Download Method 8: RapidAPI YouTube MP3 (uses RAPIDAPI_KEY from .env) ─
  if (!audioBuffer && ENV.RAPIDAPI_KEY) {
    try {
      console.log(`[music] M8 RapidAPI`);
      let videoId = songInfo.id;
      if (!videoId) {
        for (const inst of INVIDIOUS_INSTANCES) {
          try {
            const r = await axios.get(
              `${inst}/api/v1/search?q=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}&type=video`,
              { timeout: 7_000 },
            );
            if (r.data?.[0]?.videoId) {
              videoId = r.data[0].videoId;
              break;
            }
          } catch (_) {}
        }
      }
      if (!videoId) throw new Error("No YouTube ID for RapidAPI");

      const res = await axios.get("https://youtube-mp36.p.rapidapi.com/dl", {
        params: { id: videoId },
        headers: {
          "X-RapidAPI-Key": ENV.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
        },
        timeout: 20_000,
      });
      if (!res.data?.link) throw new Error("RapidAPI: no download link");
      audioBuffer = await downloadBuffer(res.data.link, 60_000);
      usedApi = "RapidAPI";
      console.log(
        `[music] M8 RapidAPI success: ${fmtSize(audioBuffer.length)}`,
      );
    } catch (err) {
      console.log(`[music] M8 RapidAPI failed: ${err.message}`);
      failedApis.push("RapidAPI");
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 3: SEND RESULT
  // ══════════════════════════════════════════════════════════════════════════
  if (audioBuffer && audioBuffer.length > 5000) {
    // Send thumbnail
    if (songInfo.thumbnail) {
      try {
        await sock.sendMessage(from, {
          image: { url: songInfo.thumbnail },
          caption:
            `🎵 *${songInfo.title}*\n` +
            `👤 *${songInfo.artist}*\n` +
            (songInfo.duration ? `⏱️ ${fmtDur(songInfo.duration)}\n` : "") +
            (isPreview ? "⚠️ _30-second Deezer preview_\n" : "") +
            AYOBOT_TAG,
        });
      } catch (_) {}
    }

    // Send audio
    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: false,
    });

    await sock.sendMessage(from, {
      text:
        `${isPreview ? "⚠️ *Preview* (30 sec)\n" : "✅ *Downloaded!*\n"}` +
        `🎵 *${songInfo.title}* - ${songInfo.artist}\n` +
        `📦 ${fmtSize(audioBuffer.length)} | 🔧 ${usedApi}\n` +
        AYOBOT_TAG,
    });
  } else {
    // All downloads failed — send a link instead
    const listenUrl =
      songInfo.url ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(songInfo.title + " " + songInfo.artist)}`;

    await sock.sendMessage(from, {
      text:
        `🎵 *${songInfo.title}*\n` +
        `👤 ${songInfo.artist}\n\n` +
        `🔗 *Listen here:*\n${listenUrl}\n\n` +
        `⚠️ _Could not download — tried: ${failedApis.join(", ")}._\n` +
        `_Open the link above to listen._\n\n` +
        AYOBOT_TAG,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LYRICS — FIXED (4 sources)
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  try {
    if (!fullArgs?.trim()) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎵 MUSIC LYRICS",
          `Usage: ${ENV.PREFIX}lyrics <song name>\nWith artist: ${ENV.PREFIX}lyrics <song> - <artist>\n\n` +
            `Examples:\n• ${ENV.PREFIX}lyrics Shape of You\n• ${ENV.PREFIX}lyrics Perfect - Ed Sheeran`,
        ),
      });
    }

    let title = fullArgs.trim();
    let artist = null;
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      title = parts[0].trim();
      artist = parts.slice(1).join(" - ").trim();
    }

    await sock.sendMessage(from, {
      text: `🎵 *Searching lyrics for "${title}"${artist ? ` by ${artist}` : ""}...*`,
    });

    const cacheKey = `lyrics-${title.toLowerCase()}-${(artist || "").toLowerCase()}`;
    const cached = musicCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30 * 60_000) {
      return sendLyricsResponse(sock, from, cached.data, true);
    }

    const apis = [
      { name: "PopCat", fn: () => fetchFromPopCat(title, artist) },
      { name: "Lyrist", fn: () => fetchFromLyrist(title, artist) },
      { name: "LyricsOvh", fn: () => fetchFromLyricsOvh(title, artist) },
      { name: "Genius", fn: () => fetchFromGenius(title, artist) },
    ];

    for (const api of apis) {
      try {
        if (!checkApiRateLimit(api.name)) continue;
        const result = await Promise.race([
          api.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 8_000),
          ),
        ]);
        if (result?.lyrics) {
          musicCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return sendLyricsResponse(sock, from, result);
        }
      } catch (err) {
        console.log(`[music] Lyrics API ${api.name} failed: ${err.message}`);
      }
    }

    // Fallback: show song info without lyrics
    try {
      const info = await fetchSongInfo(title, artist);
      if (info) {
        return sock.sendMessage(from, {
          text: formatInfo(
            "🎵 SONG FOUND",
            `*${info.title}*\nArtist: ${info.artist}\nAlbum: ${info.album || "Unknown"}\n\n_Lyrics not found. Try: ${ENV.PREFIX}genius ${title}_`,
          ),
        });
      }
    } catch (_) {}

    await sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS NOT FOUND",
        `Could not find lyrics for "${title}"${artist ? ` by ${artist}` : ""}.\n\n` +
          `💡 Tips:\n• Include artist: ${ENV.PREFIX}lyrics ${title} - Artist Name\n• Try: ${ENV.PREFIX}genius ${title}`,
      ),
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("LYRICS ERROR", err.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TRENDING
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });

    // Try Deezer first
    try {
      const res = await axios.get(
        "https://api.deezer.com/chart/0/tracks?limit=10",
        { timeout: 8_000 },
      );
      if (res.data?.data?.length) {
        let text = "📈 *TRENDING SONGS (Deezer Global)*\n\n";
        res.data.data.forEach((t, i) => {
          text +=
            `${i + 1}. *${t.title}*\n` +
            `   👤 ${t.artist.name}\n` +
            `   💿 ${t.album.title}\n` +
            `   ⏱️ ${fmtDur(t.duration)}\n\n`;
        });
        text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
        return sock.sendMessage(from, {
          text: formatSuccess("🔥 TRENDING NOW", text),
        });
      }
    } catch (err) {
      console.log(`[music] Deezer trending failed: ${err.message}`);
    }

    // Fallback to Jamendo
    const res = await axios.get(
      `https://api.jamendo.com/v3.0/tracks/?client_id=3a7a4d3a&format=json&limit=10&order=popularity_total`,
      { timeout: 8_000 },
    );
    if (res.data?.results?.length) {
      let text = "📈 *TRENDING SONGS (Jamendo)*\n\n";
      res.data.results.forEach((t, i) => {
        text +=
          `${i + 1}. *${t.name}*\n` +
          `   👤 ${t.artist_name}\n` +
          `   💿 ${t.album_name || "Single"}\n` +
          `   ⏱️ ${fmtDur(t.duration)}\n\n`;
      });
      text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
      return sock.sendMessage(from, {
        text: formatSuccess("🔥 TRENDING NOW", text),
      });
    }

    throw new Error("No trending data from any source");
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch trending: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  RANDOM
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding random song...*" });

    // Deezer chart (50 songs, pick one random)
    try {
      const res = await axios.get(
        "https://api.deezer.com/chart/0/tracks?limit=50",
        { timeout: 8_000 },
      );
      if (res.data?.data?.length) {
        const t =
          res.data.data[Math.floor(Math.random() * res.data.data.length)];
        return sock.sendMessage(from, {
          text:
            formatData("🎲 RANDOM SONG (Deezer)", {
              "🎵 Title": t.title,
              "👤 Artist": t.artist.name,
              "💿 Album": t.album.title,
              "⏱️ Duration": fmtDur(t.duration),
            }) + `\n\n💡 Use ${ENV.PREFIX}play ${t.title} to download\n\n${AYOBOT_TAG}`,
        });
      }
    } catch (err) {
      console.log(`[music] Deezer random failed: ${err.message}`);
    }

    // Fallback to Jamendo
    const res = await axios.get(
      `https://api.jamendo.com/v3.0/tracks/?client_id=3a7a4d3a&format=json&limit=50`,
      { timeout: 8_000 },
    );
    if (res.data?.results?.length) {
      const t =
        res.data.results[Math.floor(Math.random() * res.data.results.length)];
      return sock.sendMessage(from, {
        text:
          formatData("🎲 RANDOM SONG (Jamendo)", {
            "🎵 Title": t.name,
            "👤 Artist": t.artist_name,
            "💿 Album": t.album_name || "Single",
            "⏱️ Duration": fmtDur(t.duration),
          }) + `\n\n💡 Use ${ENV.PREFIX}play ${t.name} to download\n\n${AYOBOT_TAG}`,
      });
    }

    throw new Error("No data from any source");
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch random song: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ARTIST
// ════════════════════════════════════════════════════════════════════════════
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "👤 ARTIST INFO",
        `Usage: ${ENV.PREFIX}artist <name>\nExample: ${ENV.PREFIX}artist Ed Sheeran`,
      ),
    });
  }

  try {
    await sock.sendMessage(from, {
      text: `👤 *Searching for artist: ${fullArgs}...*`,
    });

    // Deezer
    try {
      const searchRes = await axios.get(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(fullArgs)}&limit=1`,
        { timeout: 8_000 },
      );
      if (searchRes.data?.data?.length) {
        const artist = searchRes.data.data[0];
        const [tracksRes, albumsRes] = await Promise.allSettled([
          axios.get(`https://api.deezer.com/artist/${artist.id}/top?limit=5`, {
            timeout: 5_000,
          }),
          axios.get(
            `https://api.deezer.com/artist/${artist.id}/albums?limit=1`,
            { timeout: 5_000 },
          ),
        ]);

        let topTracks = "";
        if (
          tracksRes.status === "fulfilled" &&
          tracksRes.value.data?.data?.length
        ) {
          topTracks =
            "\n\n*🎵 Top Tracks:*\n" +
            tracksRes.value.data.data
              .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
              .join("\n");
        }

        return sock.sendMessage(from, {
          text:
            formatData("👤 ARTIST INFORMATION (Deezer)", {
              "👤 Name": artist.name,
              "👥 Fans": artist.nb_fan?.toLocaleString() || "N/A",
              "💿 Total Albums":
                albumsRes.status === "fulfilled"
                  ? albumsRes.value.data?.total || "N/A"
                  : "N/A",
              "🔗 Link": artist.link,
            }) +
            topTracks +
            `\n\n${AYOBOT_TAG}`,
        });
      }
    } catch (err) {
      console.log(`[music] Deezer artist failed: ${err.message}`);
    }

    // Fallback to Jamendo
    const jamendoRes = await axios.get(
      `https://api.jamendo.com/v3.0/artists/?client_id=3a7a4d3a&format=json&limit=1&namesearch=${encodeURIComponent(fullArgs)}`,
      { timeout: 8_000 },
    );
    if (jamendoRes.data?.results?.length) {
      const artist = jamendoRes.data.results[0];
      const tracksRes = await axios.get(
        `https://api.jamendo.com/v3.0/tracks/?client_id=3a7a4d3a&format=json&limit=5&artist_id=${artist.id}`,
        { timeout: 5_000 },
      );

      let topTracks = "";
      if (tracksRes.data?.results?.length) {
        topTracks =
          "\n\n*🎵 Top Tracks:*\n" +
          tracksRes.data.results
            .map((t, i) => `${i + 1}. ${t.name} (${fmtDur(t.duration)})`)
            .join("\n");
      }

      return sock.sendMessage(from, {
        text:
          formatData("👤 ARTIST INFORMATION (Jamendo)", {
            "👤 Name": artist.name,
            "🌍 Country": artist.artist_country || "N/A",
            "🎵 Tracks": artist.tracks || "N/A",
            "🔗 Link": artist.shareurl,
          }) +
          topTracks +
          `\n\n${AYOBOT_TAG}`,
      });
    }

    throw new Error("Artist not found on any service");
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find artist "${fullArgs}": ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ALBUM
// ════════════════════════════════════════════════════════════════════════════
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "💿 ALBUM INFO",
        `Usage: ${ENV.PREFIX}album <name>\nExample: ${ENV.PREFIX}album Divide`,
      ),
    });
  }

  try {
    await sock.sendMessage(from, {
      text: `💿 *Searching for album: ${fullArgs}...*`,
    });

    // Deezer
    try {
      const res = await axios.get(
        `https://api.deezer.com/search/album?q=${encodeURIComponent(fullArgs)}&limit=1`,
        { timeout: 8_000 },
      );
      if (res.data?.data?.length) {
        const album = res.data.data[0];
        const tracksRes = await axios.get(
          `https://api.deezer.com/album/${album.id}/tracks?limit=20`,
          { timeout: 5_000 },
        );

        let tracklist = "";
        if (tracksRes.data?.data?.length) {
          tracklist =
            "\n\n*📝 Tracklist:*\n" +
            tracksRes.data.data
              .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
              .join("\n");
          if (tracksRes.data.total > tracksRes.data.data.length) {
            tracklist += `\n_...and ${tracksRes.data.total - tracksRes.data.data.length} more_`;
          }
        }

        return sock.sendMessage(from, {
          text:
            formatData("💿 ALBUM INFORMATION (Deezer)", {
              "💿 Album": album.title,
              "👤 Artist": album.artist.name,
              "📅 Released": album.release_date || "N/A",
              "🎵 Tracks": album.nb_tracks || tracksRes.data?.total || "N/A",
              "🔗 Link": album.link,
            }) +
            tracklist +
            `\n\n${AYOBOT_TAG}`,
        });
      }
    } catch (err) {
      console.log(`[music] Deezer album failed: ${err.message}`);
    }

    // Fallback to Jamendo
    const jamendoRes = await axios.get(
      `https://api.jamendo.com/v3.0/albums/?client_id=3a7a4d3a&format=json&limit=1&namesearch=${encodeURIComponent(fullArgs)}`,
      { timeout: 8_000 },
    );
    if (jamendoRes.data?.results?.length) {
      const album = jamendoRes.data.results[0];
      const tracksRes = await axios.get(
        `https://api.jamendo.com/v3.0/albums/tracks/?client_id=3a7a4d3a&format=json&limit=20&album_id=${album.id}`,
        { timeout: 5_000 },
      );

      let tracklist = "";
      if (tracksRes.data?.results?.length) {
        tracklist =
          "\n\n*📝 Tracklist:*\n" +
          tracksRes.data.results
            .map((t, i) => `${i + 1}. ${t.name} (${fmtDur(t.duration)})`)
            .join("\n");
      }

      return sock.sendMessage(from, {
        text:
          formatData("💿 ALBUM INFORMATION (Jamendo)", {
            "💿 Album": album.name,
            "👤 Artist": album.artist_name,
            "📅 Released": album.releasedate || "N/A",
            "🎵 Tracks":
              album.tracks || tracksRes.data?.results?.length || "N/A",
            "🔗 Link": album.shareurl,
          }) +
          tracklist +
          `\n\n${AYOBOT_TAG}`,
      });
    }

    throw new Error("Album not found on any service");
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find album "${fullArgs}": ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════════════════════════════════════
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔍 MUSIC SEARCH",
        `Usage: ${ENV.PREFIX}musicsearch <query>\nExample: ${ENV.PREFIX}musicsearch Adele Hello`,
      ),
    });
  }

  try {
    await sock.sendMessage(from, {
      text: `🔍 *Searching for: ${fullArgs}...*`,
    });

    // Try JioSaavn first (full tracks)
    try {
      const res = await axios.get(
        `https://saavn.dev/api/search/songs?query=${encodeURIComponent(fullArgs)}&page=1&limit=8`,
        { timeout: 10_000 },
      );
      const results = res.data?.data?.results;
      if (results?.length) {
        let text = "🔍 *SEARCH RESULTS (JioSaavn)*\n\n";
        results.forEach((t, i) => {
          const artists =
            t.artists?.primary?.map((a) => a.name).join(", ") || "Unknown";
          text +=
            `${i + 1}. *${t.name}*\n` +
            `   👤 ${artists}\n` +
            `   💿 ${t.album?.name || "Single"}\n` +
            `   ⏱️ ${fmtDur(t.duration)}\n\n`;
        });
        text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
        return sock.sendMessage(from, {
          text: formatSuccess("🔍 MUSIC SEARCH", text),
        });
      }
    } catch (err) {
      console.log(`[music] JioSaavn search failed: ${err.message}`);
    }

    // Deezer fallback
    try {
      const res = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=8`,
        { timeout: 8_000 },
      );
      if (res.data?.data?.length) {
        let text = "🔍 *SEARCH RESULTS (Deezer)*\n\n";
        res.data.data.forEach((t, i) => {
          text +=
            `${i + 1}. *${t.title}*\n` +
            `   👤 ${t.artist.name}\n` +
            `   💿 ${t.album.title}\n` +
            `   ⏱️ ${fmtDur(t.duration)}\n\n`;
        });
        text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
        return sock.sendMessage(from, {
          text: formatSuccess("🔍 MUSIC SEARCH", text),
        });
      }
    } catch (err) {
      console.log(`[music] Deezer search failed: ${err.message}`);
    }

    // Jamendo fallback
    const jamendoRes = await axios.get(
      `https://api.jamendo.com/v3.0/tracks/?client_id=3a7a4d3a&format=json&limit=8&search=${encodeURIComponent(fullArgs)}`,
      { timeout: 8_000 },
    );
    if (jamendoRes.data?.results?.length) {
      let text = "🔍 *SEARCH RESULTS (Jamendo)*\n\n";
      jamendoRes.data.results.forEach((t, i) => {
        text +=
          `${i + 1}. *${t.name}*\n` +
          `   👤 ${t.artist_name}\n` +
          `   💿 ${t.album_name || "Single"}\n` +
          `   ⏱️ ${fmtDur(t.duration)}\n\n`;
      });
      text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
      return sock.sendMessage(from, {
        text: formatSuccess("🔍 MUSIC SEARCH", text),
      });
    }

    throw new Error("No results from any service");
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `No results for "${fullArgs}": ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GENIUS LYRICS
// ════════════════════════════════════════════════════════════════════════════
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎤 GENIUS LYRICS",
        `Usage: ${ENV.PREFIX}genius <song>\nExample: ${ENV.PREFIX}genius Lose Yourself`,
      ),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `🔍 *Searching Genius for: ${fullArgs}...*`,
    });
    const result = await fetchFromGenius(fullArgs);
    if (!result?.lyrics) throw new Error("No lyrics found on Genius");
    await sendLyricsResponse(sock, from, result);
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find lyrics on Genius for "${fullArgs}": ${err.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════════════
async function fetchSongInfo(title, artist) {
  try {
    const q = artist ? `${title} ${artist}` : title;
    const res = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`,
      { timeout: 5_000 },
    );
    const t = res.data?.data?.[0];
    if (!t) return null;
    return { title: t.title, artist: t.artist.name, album: t.album.title };
  } catch (_) {
    return null;
  }
}

async function fetchFromPopCat(title, artist) {
  const q = artist ? `${title} ${artist}` : title;
  const res = await axios.get(
    `https://api.popcat.xyz/lyrics?song=${encodeURIComponent(q)}`,
    { timeout: 8_000 },
  );
  if (!res.data?.lyrics) throw new Error("No lyrics from PopCat");
  return {
    lyrics: res.data.lyrics,
    title: res.data.title || title,
    artist: res.data.artist || artist || "Unknown",
    image: res.data.image,
    source: "PopCat",
  };
}

async function fetchFromLyrist(title, artist) {
  const q = artist ? `${title}/${artist}` : title;
  const res = await axios.get(
    `https://lyrist.vercel.app/api/${encodeURIComponent(q)}`,
    { timeout: 8_000 },
  );
  if (!res.data?.lyrics) throw new Error("No lyrics from Lyrist");
  return {
    lyrics: res.data.lyrics,
    title: res.data.title || title,
    artist: res.data.artist || artist || "Unknown",
    source: "Lyrist",
  };
}

async function fetchFromLyricsOvh(title, artist) {
  // Resolve artist from Deezer if not provided
  if (!artist) {
    try {
      const res = await axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(title)}&limit=1`,
        { timeout: 5_000 },
      );
      artist = res.data?.data?.[0]?.artist?.name || "unknown";
    } catch (_) {
      artist = "unknown";
    }
  }
  const res = await axios.get(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    { timeout: 8_000 },
  );
  if (!res.data?.lyrics) throw new Error("No lyrics from Lyrics.ovh");
  return { lyrics: res.data.lyrics, title, artist, source: "Lyrics.ovh" };
}

async function fetchFromGenius(title, artist) {
  const q = artist ? `${title} ${artist}` : title;
  const res = await axios.get(
    `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`,
    {
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    },
  );
  const hits = res.data?.response?.sections
    ?.flatMap((s) => s.hits)
    .filter((h) => h.type === "song");
  if (!hits?.length) throw new Error("No Genius results");

  let hit = hits[0];
  if (artist) {
    const match = hits.find((h) =>
      h.result.artist_names?.toLowerCase().includes(artist.toLowerCase()),
    );
    if (match) hit = match;
  }

  const page = await axios.get(hit.result.url, {
    timeout: 12_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const $ = cheerio.load(page.data);
  let lyrics =
    $('[data-lyrics-container="true"]').text() ||
    $(".lyrics").text() ||
    $(".song_body-lyrics").text();
  if (!lyrics?.trim())
    throw new Error("Genius: lyrics container not found on page");
  lyrics = lyrics.replace(/\[.*?\]/g, "").trim();
  return {
    lyrics,
    title: hit.result.title,
    artist: hit.result.artist_names,
    image: hit.result.song_art_image_url,
    url: hit.result.url,
    source: "Genius",
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  SEND LYRICS RESPONSE
// ════════════════════════════════════════════════════════════════════════════
async function sendLyricsResponse(sock, from, data, fromCache = false) {
  const { lyrics, title, artist, source, url } = data;

  let clean = lyrics
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;|&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (clean.length > 4000) {
    const cut = clean.lastIndexOf("\n", 3800);
    clean =
      clean.substring(0, cut > 3000 ? cut : 3800) +
      `\n\n_...[Lyrics truncated${url ? `. Full: ${url}` : ""}]_`;
  }

  await sock.sendMessage(from, {
    text:
      `🎵 *${title}*${artist ? ` by *${artist}*` : ""}\n` +
      `${source ? `📡 _Source: ${source}${fromCache ? " (cached)" : ""}_\n` : ""}` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      clean +
      `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
      AYOBOT_TAG,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  HELP
// ════════════════════════════════════════════════════════════════════════════
async function showMusicHelp(from, sock) {
  await sock.sendMessage(from, {
    text: formatInfo(
      "🎵 MUSIC HUB",
      `*Music Commands:*\n\n` +
      `🎵 *${ENV.PREFIX}play <song>* — Download & send audio\n` +
      `📝 *${ENV.PREFIX}lyrics <song>* — Get song lyrics\n` +
      `📝 *${ENV.PREFIX}lyrics <song> - <artist>* — Lyrics with artist\n` +
      `📈 *${ENV.PREFIX}trending* — Top 10 trending songs\n` +
      `🎲 *${ENV.PREFIX}random* — Random song info\n` +
      `🔍 *${ENV.PREFIX}musicsearch <query>* — Search songs\n` +
      `👤 *${ENV.PREFIX}artist <name>* — Artist info + top tracks\n` +
      `💿 *${ENV.PREFIX}album <name>* — Album + full tracklist\n` +
      `🎤 *${ENV.PREFIX}genius <song>* — Genius lyrics\n\n` +
      `*Examples:*\n` +
      `• ${ENV.PREFIX}play Essence Wizkid\n` +
      `• ${ENV.PREFIX}play wildflower billie eilish\n` +
      `• ${ENV.PREFIX}lyrics Perfect - Ed Sheeran\n` +
      `• ${ENV.PREFIX}musicsearch Drake God's Plan\n` +
      `• ${ENV.PREFIX}artist Burna Boy\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ AYOBOT v1 | 👑 Created by AYOCODES`,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default {
  music,
  musicLyrics,
  musicTrending,
  musicRandom,
  musicArtist,
  musicAlbum,
  musicSearch,
  musicDownload,
  musicGenius,
};
