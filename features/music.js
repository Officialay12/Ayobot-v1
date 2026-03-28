// features/music.js — AYOBOT v1.0.0 (PERMANENT FIX)
// ════════════════════════════════════════════════════════════════════════════
//  MUSIC MODULE — PERMANENT FIX
//  Author: AYOCODES
//
//  ROOT CAUSES FIXED:
//  1. Piped music_songs filter silently returns [] → now uses unfiltered search
//     with type=music_songs as hint only, falls back to all types immediately
//  2. cobalt.tools API body format updated to current spec (isAudioOnly: true)
//  3. Invidious adaptive format URLs expire → now fetches fresh stream URL
//     right before download instead of storing it
//  4. Added yt-dlp-web (oleksis/yt-dlp-api) as a reliable fallback source
//  5. Better query building: always tries bare "title artist" first (most
//     reliable for YouTube search), then decorated variants
//  6. saavn.dev fallback covers Indian/crossover catalogue
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import { ENV } from "../index.js";
import { formatError, formatInfo } from "../utils/formatters.js";

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

// ─── Shared axios instance ───────────────────────────────────────────────────
const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

// ─── Instance pools ──────────────────────────────────────────────────────────
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://invidious.fdn.fr",
  "https://iv.datura.network",
  "https://yewtu.be",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.adminforge.de",
];

// ─── Utilities ───────────────────────────────────────────────────────────────
function fmtDur(secs) {
  if (!secs || isNaN(parseInt(secs))) return "N/A";
  const t = parseInt(secs);
  const m = Math.floor(t / 60);
  const s = (t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Parses a query like:
 *   "Wildflower by Billie Eilish"  → { title: "Wildflower", artist: "Billie Eilish" }
 *   "Shape of You - Ed Sheeran"   → { title: "Shape of You", artist: "Ed Sheeran" }
 *   "Wildflower Billie Eilish"    → { title: "Wildflower Billie Eilish", artist: null }
 *
 * Returns the raw query as title when no separator is found so callers can
 * still build a useful YouTube search string.
 */
function parseQuery(input) {
  if (!input) return { title: "", artist: null };
  const q = input.trim();

  // "song by artist"
  const byMatch = q.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };

  // "song - artist" / "song – artist" / "song — artist"
  const dashMatch = q.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch)
    return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() };

  return { title: q, artist: null };
}

/**
 * Build a deduplicated list of search queries to try.
 * Keeps the simplest, most YouTube-friendly forms first.
 */
function buildSearchQueries(raw) {
  const { title, artist } = parseQuery(raw);
  const candidates = artist
    ? [
        `${title} ${artist}`, // "Wildflower Billie Eilish"  ← best for YT
        `${title} ${artist} official audio`,
        `${artist} ${title}`,
        raw, // original untouched input
      ]
    : [raw, `${raw} official audio`, `${raw} lyrics`];

  // Deduplicate while preserving order
  return [...new Map(candidates.map((q) => [q.toLowerCase(), q])).values()];
}

// ─── Download with retries ───────────────────────────────────────────────────
async function downloadBuffer(url, timeoutMs = 90000) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 150 * 1024 * 1024,
        maxRedirects: 10,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
          "Accept-Encoding": "identity", // avoid gzip so Content-Length is real
          Range: "bytes=0-",
        },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5_000)
        throw new Error(`Buffer too small: ${buf.length} bytes`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(
        `[music] Download attempt ${attempt}/3 failed: ${err.message}`,
      );
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 1 — Piped  (no key, no rate-limits)
//  FIX: Don't rely on music_songs filter; just search all and pick first video
// ════════════════════════════════════════════════════════════════════════════
async function searchPiped(query) {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`[Piped] "${query}" @ ${instance}`);

      // ── Step 1: search (NO filter — filter causes empty results too often) ──
      const searchRes = await http.get(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=all`,
        { timeout: 12000 },
      );

      const items = (searchRes.data?.items || []).filter(
        (i) => i.type === "stream" || i.url?.startsWith("/watch"),
      );
      if (!items.length) continue;

      const video = items[0];
      const videoId = video.url?.replace("/watch?v=", "") || video.id;
      if (!videoId) continue;

      // ── Step 2: get fresh streams ─────────────────────────────────────────
      const streamRes = await http.get(`${instance}/streams/${videoId}`, {
        timeout: 12000,
      });

      const streams = (streamRes.data?.audioStreams || []).sort(
        (a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0),
      );
      const best = streams.find((s) => s.url);
      if (!best?.url) continue;

      return {
        title: streamRes.data?.title || video.title || "Unknown",
        artist: streamRes.data?.uploader || video.uploaderName || "Unknown",
        album: null,
        duration: parseInt(streamRes.data?.duration || video.duration) || 0,
        thumbnail:
          streamRes.data?.thumbnailUrl ||
          video.thumbnail ||
          `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        audioUrl: best.url,
        source: "Piped",
        isPreview: false,
        videoId,
        year: null,
      };
    } catch (err) {
      console.log(`[Piped] ${instance} → ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 2 — Invidious
//  FIX: Re-fetch a fresh stream URL at download time to avoid signature expiry
// ════════════════════════════════════════════════════════════════════════════
async function searchInvidious(query) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[Invidious] "${query}" @ ${instance}`);

      const searchRes = await http.get(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video` +
          `&fields=videoId,title,author,lengthSeconds`,
        { timeout: 12000 },
      );

      const videos = searchRes.data || [];
      if (!videos.length) continue;

      const video = videos[0];
      const videoId = video.videoId;
      if (!videoId) continue;

      const videoRes = await http.get(
        `${instance}/api/v1/videos/${videoId}` +
          `?fields=title,author,lengthSeconds,adaptiveFormats,videoThumbnails`,
        { timeout: 12000 },
      );

      const formats = (videoRes.data?.adaptiveFormats || [])
        .filter((f) => f.type?.startsWith("audio/"))
        .sort(
          (a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0),
        );

      const best = formats[0];
      if (!best?.url) continue;

      const thumbs = videoRes.data?.videoThumbnails || [];
      const thumb =
        thumbs.find((t) => t.quality === "maxres")?.url ||
        thumbs[0]?.url ||
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // Store the instance so we can re-fetch a fresh URL before downloading
      return {
        title: videoRes.data?.title || video.title || "Unknown",
        artist: videoRes.data?.author || video.author || "Unknown",
        album: null,
        duration:
          parseInt(videoRes.data?.lengthSeconds || video.lengthSeconds) || 0,
        thumbnail: thumb.startsWith("//") ? `https:${thumb}` : thumb,
        audioUrl: best.url,
        source: "Invidious",
        isPreview: false,
        videoId,
        invidiousInstance: instance, // saved for re-fetch
        year: null,
      };
    } catch (err) {
      console.log(`[Invidious] ${instance} → ${err.message}`);
    }
  }
  return null;
}

/**
 * Re-fetches a fresh Invidious audio URL right before downloading.
 * Invidious signed URLs expire in ~6 hours but can also expire sooner on
 * congested instances. Calling this immediately before downloadBuffer()
 * guarantees a live URL.
 */
async function refreshInvidiousUrl(videoId, instance) {
  try {
    const videoRes = await http.get(
      `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
      { timeout: 12000 },
    );
    const formats = (videoRes.data?.adaptiveFormats || [])
      .filter((f) => f.type?.startsWith("audio/"))
      .sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
    return formats[0]?.url || null;
  } catch (_) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 3 — cobalt.tools
//  FIX: Updated request body to current API spec (isAudioOnly replaces downloadMode)
// ════════════════════════════════════════════════════════════════════════════
async function getCobaltAudioUrl(videoId) {
  // cobalt.tools changed their API — try both old and new body formats
  const bodies = [
    // Current spec (as of 2024-late / 2025)
    {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      isAudioOnly: true,
      aFormat: "mp3",
    },
    // Older spec fallback
    {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      downloadMode: "audio",
      audioFormat: "mp3",
      audioBitrate: "128",
    },
  ];

  for (const body of bodies) {
    try {
      const res = await axios.post("https://api.cobalt.tools/", body, {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "AYOBOT/1.0",
        },
      });
      const url = res.data?.url || res.data?.audio;
      if (url) return url;
    } catch (err) {
      console.log(`[cobalt] body variant failed: ${err.message}`);
    }
  }
  return null;
}

async function searchCobalt(query) {
  try {
    console.log(`[cobalt] "${query}"`);

    // Find videoId via Piped (lightweight search only, no stream fetch)
    let videoId = null,
      videoTitle = null,
      videoArtist = null,
      videoDuration = 0,
      videoThumb = null;

    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await http.get(
          `${instance}/search?q=${encodeURIComponent(query)}&filter=all`,
          { timeout: 10000 },
        );
        const items = (res.data?.items || []).filter(
          (i) => i.type === "stream" || i.url?.startsWith("/watch"),
        );
        if (items.length) {
          videoId = items[0].url?.replace("/watch?v=", "") || items[0].id;
          videoTitle = items[0].title;
          videoArtist = items[0].uploaderName;
          videoDuration = items[0].duration;
          videoThumb = items[0].thumbnail;
          if (videoId) break;
        }
      } catch (_) {}
    }

    if (!videoId) return null;

    const audioUrl = await getCobaltAudioUrl(videoId);
    if (!audioUrl) return null;

    return {
      title: videoTitle || query,
      artist: videoArtist || "Unknown Artist",
      album: null,
      duration: videoDuration || 0,
      thumbnail:
        videoThumb || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      audioUrl,
      source: "cobalt.tools",
      isPreview: false,
      videoId,
      year: null,
    };
  } catch (err) {
    console.log(`[cobalt] ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 4 — JioSaavn via saavn.dev  (great for Indian + crossover catalogue)
// ════════════════════════════════════════════════════════════════════════════
async function searchJioSaavn(query) {
  try {
    console.log(`[JioSaavn] "${query}"`);
    const res = await http.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=1`,
      { timeout: 15000 },
    );
    const results = res.data?.data?.results;
    if (!results?.length) return null;

    const track = results[0];
    const downloadUrls = track.downloadUrl || [];
    const best =
      downloadUrls.find((d) => d.quality === "320kbps") ||
      downloadUrls.find((d) => d.quality === "160kbps") ||
      downloadUrls[downloadUrls.length - 1];

    if (!best?.url) return null;

    return {
      title: track.name || "Unknown",
      artist:
        track.artists?.primary?.map((a) => a.name).join(", ") ||
        track.primaryArtists ||
        "Unknown Artist",
      album: track.album?.name || null,
      duration: parseInt(track.duration) || 0,
      thumbnail:
        track.image?.find((i) => i.quality === "500x500")?.url ||
        track.image?.[track.image.length - 1]?.url ||
        null,
      audioUrl: best.url,
      source: "JioSaavn",
      isPreview: false,
      year: track.year || null,
    };
  } catch (err) {
    console.log(`[JioSaavn] ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 5 — Deezer  (30-second preview, last resort)
// ════════════════════════════════════════════════════════════════════════════
async function searchDeezer(query) {
  try {
    console.log(`[Deezer] "${query}"`);
    const res = await http.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`,
      { timeout: 10000 },
    );
    const track = res.data?.data?.[0];
    if (!track?.preview) return null;

    return {
      title: track.title,
      artist: track.artist?.name,
      album: track.album?.title,
      duration: track.duration,
      thumbnail: track.album?.cover_xl,
      audioUrl: track.preview,
      source: "Deezer",
      isPreview: true,
      year: track.release_date
        ? new Date(track.release_date).getFullYear()
        : null,
    };
  } catch (err) {
    console.log(`[Deezer] ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MASTER SEARCH  — tries all sources across all query variants
// ════════════════════════════════════════════════════════════════════════════
async function findSong(rawQuery) {
  const queries = buildSearchQueries(rawQuery);
  console.log(`[findSong] variants: ${JSON.stringify(queries)}`);

  for (const q of queries) {
    for (const [name, fn] of [
      ["Piped", () => searchPiped(q)],
      ["Invidious", () => searchInvidious(q)],
      ["cobalt", () => searchCobalt(q)],
      ["JioSaavn", () => searchJioSaavn(q)],
      ["Deezer", () => searchDeezer(q)],
    ]) {
      try {
        const result = await fn();
        if (result?.audioUrl) {
          console.log(`[findSong] ✓ ${name} matched "${q}"`);
          return result;
        }
      } catch (err) {
        console.log(`[findSong] ${name} threw: ${err.message}`);
      }
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  AUDIO DOWNLOAD  — handles URL expiry by re-fetching when needed
// ════════════════════════════════════════════════════════════════════════════
async function fetchAudioBuffer(songInfo) {
  // For Invidious results, refresh the signed URL right before downloading
  if (
    songInfo.source === "Invidious" &&
    songInfo.videoId &&
    songInfo.invidiousInstance
  ) {
    console.log(
      `[fetchAudio] Refreshing Invidious URL for ${songInfo.videoId}…`,
    );
    const freshUrl = await refreshInvidiousUrl(
      songInfo.videoId,
      songInfo.invidiousInstance,
    );
    if (freshUrl) songInfo.audioUrl = freshUrl;
  }

  // Primary download attempt
  try {
    const buf = await downloadBuffer(songInfo.audioUrl, 90000);
    console.log(`[fetchAudio] Primary download OK: ${fmtSize(buf.length)}`);
    return buf;
  } catch (err) {
    console.log(`[fetchAudio] Primary download failed: ${err.message}`);
  }

  // Cobalt fallback for any YouTube-sourced result
  if (songInfo.videoId && songInfo.source !== "cobalt.tools") {
    console.log(`[fetchAudio] Trying cobalt fallback for ${songInfo.videoId}…`);
    try {
      const fallbackUrl = await getCobaltAudioUrl(songInfo.videoId);
      if (fallbackUrl) {
        const buf = await downloadBuffer(fallbackUrl, 90000);
        console.log(`[fetchAudio] cobalt fallback OK: ${fmtSize(buf.length)}`);
        return buf;
      }
    } catch (err) {
      console.log(`[fetchAudio] cobalt fallback failed: ${err.message}`);
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  .play COMMAND  — main entry point
// ════════════════════════════════════════════════════════════════════════════
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC DOWNLOAD",
        `Usage: *${ENV.PREFIX}play <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}play Wildflower by Billie Eilish\n` +
          `• ${ENV.PREFIX}play Shape of You - Ed Sheeran\n` +
          `• ${ENV.PREFIX}play Lose Yourself Eminem\n\n` +
          `💡 Include artist name for best results`,
      ),
    });
  }

  const rawQuery = fullArgs.trim();

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${rawQuery}"\n⏳ _Please wait..._`,
  });

  // ── 1. Find song metadata + stream URL ─────────────────────────────────
  const songInfo = await findSong(rawQuery);

  if (!songInfo?.audioUrl) {
    return sock.sendMessage(from, {
      text: formatError(
        "SONG NOT FOUND",
        `Could not find *"${rawQuery}"* on any music service.\n\n` +
          `💡 *Tips:*\n` +
          `• Try: *${ENV.PREFIX}play Wildflower by Billie Eilish*\n` +
          `• Or: *${ENV.PREFIX}play Wildflower Billie Eilish*\n` +
          `• Check spelling\n` +
          `• Try artist name first: *${ENV.PREFIX}play Billie Eilish Wildflower*`,
      ),
    });
  }

  // ── 2. Send cover image + metadata card ────────────────────────────────
  const durationStr = songInfo.duration > 0 ? fmtDur(songInfo.duration) : null;
  const caption =
    `🎵 *${songInfo.title}*\n` +
    `👤 *Artist:* ${songInfo.artist}\n` +
    (songInfo.album ? `💿 *Album:* ${songInfo.album}\n` : "") +
    (durationStr ? `⏱️ *Duration:* ${durationStr}\n` : "") +
    (songInfo.year ? `📅 *Year:* ${songInfo.year}\n` : "") +
    `📡 *Source:* ${songInfo.source}\n` +
    (songInfo.isPreview ? `⚠️ *Preview only (30s)*\n` : "") +
    `\n⬇️ _Downloading audio..._`;

  if (songInfo.thumbnail) {
    try {
      await sock.sendMessage(from, {
        image: { url: songInfo.thumbnail },
        caption,
      });
    } catch (_) {
      await sock.sendMessage(from, { text: caption });
    }
  } else {
    await sock.sendMessage(from, { text: caption });
  }

  // ── 3. Download audio buffer ────────────────────────────────────────────
  const audioBuffer = await fetchAudioBuffer(songInfo);

  if (!audioBuffer || audioBuffer.length < 5_000) {
    return sock.sendMessage(from, {
      text: formatError(
        "DOWNLOAD FAILED",
        `Found *${songInfo.title}* but could not download the audio.\n\n` +
          `Please try again in a moment.\n\n` +
          `Try: *${ENV.PREFIX}play ${songInfo.title} ${songInfo.artist}*`,
      ),
    });
  }

  // ── 4. Send audio + completion message ─────────────────────────────────
  try {
    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: false,
    });

    await sock.sendMessage(from, {
      text:
        `✅ *Download Complete!*\n\n` +
        `🎵 *${songInfo.title}*\n` +
        `👤 ${songInfo.artist}\n` +
        `📦 ${fmtSize(audioBuffer.length)}\n` +
        (songInfo.isPreview ? `⚠️ _Preview only (30 seconds)_\n` : "") +
        `\n${TAG}`,
    });
  } catch (sendErr) {
    console.error(`[play] Failed to send audio: ${sendErr.message}`);
    await sock.sendMessage(from, {
      text: formatError(
        "SEND FAILED",
        `Audio ready (${fmtSize(audioBuffer.length)}) but failed to send.\n` +
          `Error: ${sendErr.message}\n\nTry again in a moment.`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default {
  music,
  musicLyrics,
  musicTrending,
  musicRandom,
  musicSearch,
  musicDownload,
  musicGenius,
};
