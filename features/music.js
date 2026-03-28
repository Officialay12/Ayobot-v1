// features/music.js — AYOBOT v1.0.0 (COMPLETE FIX)
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
 */
function buildSearchQueries(raw) {
  const { title, artist } = parseQuery(raw);
  const candidates = artist
    ? [
        `${title} ${artist}`, // "Wildflower Billie Eilish" ← best for YT
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
          "Accept-Encoding": "identity",
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
//  SOURCE 1 — Piped
// ════════════════════════════════════════════════════════════════════════════
async function searchPiped(query) {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`[Piped] "${query}" @ ${instance}`);

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
        invidiousInstance: instance,
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
// ════════════════════════════════════════════════════════════════════════════
async function getCobaltAudioUrl(videoId) {
  const bodies = [
    {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      isAudioOnly: true,
      aFormat: "mp3",
    },
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
//  SOURCE 4 — JioSaavn via saavn.dev
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
//  SOURCE 5 — Deezer
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
//  MASTER SEARCH
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
//  AUDIO DOWNLOAD
// ════════════════════════════════════════════════════════════════════════════
async function fetchAudioBuffer(songInfo) {
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

  try {
    const buf = await downloadBuffer(songInfo.audioUrl, 90000);
    console.log(`[fetchAudio] Primary download OK: ${fmtSize(buf.length)}`);
    return buf;
  } catch (err) {
    console.log(`[fetchAudio] Primary download failed: ${err.message}`);
  }

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
//  .play COMMAND
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
//  .lyrics COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS SEARCH",
        `Usage: *${ENV.PREFIX}lyrics <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}lyrics Lose Yourself\n` +
          `• ${ENV.PREFIX}lyrics Shape of You\n` +
          `• ${ENV.PREFIX}lyrics Billie Eilish Wildflower`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching lyrics for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.lyrics.ovh/v1/${query.replace(/ /g, "%20")}`,
      { timeout: 10000 },
    );

    if (!response.data?.lyrics) {
      throw new Error("No lyrics found");
    }

    let lyrics = response.data.lyrics;
    if (lyrics.length > 4000) {
      lyrics = lyrics.substring(0, 3900) + "\n\n... (truncated)";
    }

    await sock.sendMessage(from, {
      text: `🎵 *${fullArgs.trim()}*\n\n${lyrics}\n\n${TAG}`,
    });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "LYRICS NOT FOUND",
        `Could not find lyrics for *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Try with artist name: *${ENV.PREFIX}lyrics Lose Yourself Eminem*\n` +
          `• Check spelling\n` +
          `• Try a different song`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .trending COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  await sock.sendMessage(from, {
    text: `🔍 *Fetching trending songs...*\n⏳ _Please wait..._`,
  });

  try {
    const response = await axios.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      { timeout: 10000 },
    );

    const tracks = response.data?.data || [];
    if (!tracks.length) {
      throw new Error("No trending songs found");
    }

    let message = "🔥 *TRENDING SONGS*\n\n";
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   🎵 ${track.album?.title || "Single"}\n\n`;
    });
    message += `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "TRENDING UNAVAILABLE",
        `Could not fetch trending songs.\n\n` +
          `Try: *${ENV.PREFIX}play* to search for specific songs instead.`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .random COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  await sock.sendMessage(from, {
    text: `🎲 *Finding a random song...*\n⏳ _Please wait..._`,
  });

  try {
    const randomId = Math.floor(Math.random() * 1000000) + 1;
    const response = await axios.get(
      `https://api.deezer.com/track/${randomId}`,
      { timeout: 10000 },
    );

    const track = response.data;
    if (!track?.id) {
      throw new Error("No random track found");
    }

    const message =
      `🎲 *RANDOM SONG*\n\n` +
      `🎵 *${track.title}*\n` +
      `👤 *Artist:* ${track.artist?.name || "Unknown"}\n` +
      `💿 *Album:* ${track.album?.title || "Single"}\n` +
      `⏱️ *Duration:* ${fmtDur(track.duration)}\n` +
      (track.preview ? `🎧 *Preview:* ${track.preview}\n` : "") +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    const popularSongs = [
      "Shape of You",
      "Blinding Lights",
      "Dance Monkey",
      "Someone You Loved",
      "Bad Guy",
    ];
    const randomSong =
      popularSongs[Math.floor(Math.random() * popularSongs.length)];

    return sock.sendMessage(from, {
      text: formatInfo(
        "RANDOM SONG SUGGESTION",
        `🎲 *Try this popular song:*\n\n` +
          `*${randomSong}*\n\n` +
          `Use *${ENV.PREFIX}play ${randomSong}* to download it!`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .artist COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎤 ARTIST INFO",
        `Usage: *${ENV.PREFIX}artist <artist name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}artist Eminem\n` +
          `• ${ENV.PREFIX}artist Billie Eilish\n` +
          `• ${ENV.PREFIX}artist Taylor Swift`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search/artist?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const artist = response.data?.data?.[0];
    if (!artist?.id) {
      throw new Error("Artist not found");
    }

    const artistDetails = await axios.get(
      `https://api.deezer.com/artist/${artist.id}`,
      { timeout: 10000 },
    );

    const details = artistDetails.data;
    const topTracks = await axios.get(
      `https://api.deezer.com/artist/${artist.id}/top?limit=5`,
      { timeout: 10000 },
    );

    let topTracksList = "";
    if (topTracks.data?.data?.length) {
      topTracksList = "\n🎵 *Top Tracks:*\n";
      topTracks.data.data.forEach((track, i) => {
        topTracksList += `${i + 1}. ${track.title}\n`;
      });
    }

    const message =
      `🎤 *ARTIST: ${details.name}*\n\n` +
      (details.nb_fan
        ? `👥 *Fans:* ${details.nb_fan.toLocaleString()}\n`
        : "") +
      (details.nb_album ? `💿 *Albums:* ${details.nb_album}\n` : "") +
      (details.radio
        ? `📻 *Radio:* ${details.radio ? "Available" : "N/A"}\n`
        : "") +
      topTracksList +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ARTIST NOT FOUND",
        `Could not find artist *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with full name\n` +
          `• Use *${ENV.PREFIX}play* to search for their songs instead`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .album COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "💿 ALBUM INFO",
        `Usage: *${ENV.PREFIX}album <album name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}album The Eminem Show\n` +
          `• ${ENV.PREFIX}album Happier Than Ever`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for album:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search/album?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const album = response.data?.data?.[0];
    if (!album?.id) {
      throw new Error("Album not found");
    }

    const albumDetails = await axios.get(
      `https://api.deezer.com/album/${album.id}`,
      { timeout: 10000 },
    );

    const details = albumDetails.data;
    let tracksList = "";
    if (details.tracks?.data?.length) {
      tracksList = "\n🎵 *Tracklist:*\n";
      details.tracks.data.forEach((track, i) => {
        tracksList += `${i + 1}. ${track.title} (${fmtDur(track.duration)})\n`;
      });
      if (details.tracks.data.length > 10) {
        tracksList += `\n_... and ${details.tracks.data.length - 10} more tracks_`;
      }
    }

    const message =
      `💿 *ALBUM: ${details.title}*\n\n` +
      `👤 *Artist:* ${details.artist?.name || "Unknown"}\n` +
      `📅 *Release:* ${details.release_date || "Unknown"}\n` +
      (details.nb_tracks ? `🎵 *Tracks:* ${details.nb_tracks}\n` : "") +
      (details.fans ? `👥 *Fans:* ${details.fans.toLocaleString()}\n` : "") +
      tracksList +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ALBUM NOT FOUND",
        `Could not find album *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with artist name: *${ENV.PREFIX}album Eminem Show*\n` +
          `• Use *${ENV.PREFIX}artist* to find an artist's albums`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .musicsearch COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC SEARCH",
        `Usage: *${ENV.PREFIX}musicsearch <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}musicsearch Lose Yourself\n` +
          `• ${ENV.PREFIX}musicsearch Shape of You\n\n` +
          `💡 Use *${ENV.PREFIX}play* to download the song!`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const response = await axios.get(
      `https://api.deezer.com/search?q=${query}&limit=5`,
      { timeout: 10000 },
    );

    const tracks = response.data?.data || [];
    if (!tracks.length) {
      throw new Error("No results found");
    }

    let message = `🔍 *SEARCH RESULTS FOR:* "${fullArgs.trim()}"\n\n`;
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   💿 ${track.album?.title || "Single"}\n`;
      message += `   ⏱️ ${fmtDur(track.duration)}\n`;
      message += `   🎧 ${track.preview ? "Preview available" : "No preview"}\n\n`;
    });
    message += `💡 *To download:* ${ENV.PREFIX}play ${fullArgs.trim()}\n\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "SEARCH FAILED",
        `Could not find songs matching *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Check spelling\n` +
          `• Try with artist name\n` +
          `• Use *${ENV.PREFIX}play* to search and download directly`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .genius COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 GENIUS LYRICS",
        `Usage: *${ENV.PREFIX}genius <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}genius Lose Yourself\n` +
          `• ${ENV.PREFIX}genius Shape of You\n\n` +
          `_Powered by Genius.com_`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching Genius for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const response = await axios.get(
      `https://api.genius.com/search?q=${encodeURIComponent(fullArgs.trim())}`,
      {
        headers: {
          Authorization: `Bearer ${ENV.GENIUS_API_KEY || ""}`,
        },
        timeout: 10000,
      },
    );

    const hit = response.data?.response?.hits?.[0];
    if (!hit?.result?.url) {
      throw new Error("No Genius page found");
    }

    const result = hit.result;
    const message =
      `🎵 *${result.title}*\n` +
      `👤 *Artist:* ${result.primary_artist?.name}\n\n` +
      `📖 *Full lyrics and annotations:*\n` +
      `${result.url}\n\n` +
      `${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "GENIUS NOT FOUND",
        `Could not find *"${fullArgs.trim()}"* on Genius\n\n` +
          `💡 Try: *${ENV.PREFIX}lyrics ${fullArgs.trim()}* for plain lyrics instead`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .music COMMAND (Menu)
// ════════════════════════════════════════════════════════════════════════════
export async function music({ from, sock }) {
  const message =
    `🎵 *AYOBOT MUSIC HUB*\n\n` +
    `📋 *Available Music Commands:*\n\n` +
    `🎵 *${ENV.PREFIX}play <song>* - Download and play music\n` +
    `📝 *${ENV.PREFIX}lyrics <song>* - Get song lyrics\n` +
    `🔥 *${ENV.PREFIX}trending* - View trending songs\n` +
    `🎲 *${ENV.PREFIX}random* - Random song suggestion\n` +
    `🎤 *${ENV.PREFIX}artist <name>* - Artist information\n` +
    `💿 *${ENV.PREFIX}album <name>* - Album information\n` +
    `🔍 *${ENV.PREFIX}musicsearch <song>* - Search for songs\n` +
    `📖 *${ENV.PREFIX}genius <song>* - Genius lyrics & annotations\n\n` +
    `💡 *Examples:*\n` +
    `• ${ENV.PREFIX}play Lose Yourself\n` +
    `• ${ENV.PREFIX}lyrics Shape of You\n` +
    `• ${ENV.PREFIX}artist Eminem\n\n` +
    `${TAG}`;

  await sock.sendMessage(from, { text: message });
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
  musicArtist,
  musicAlbum,
  musicGenius,
};
