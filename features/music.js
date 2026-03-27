// features/music.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  MUSIC MODULE — COMPLETE REWRITE WITH WORKING APIS
//  Author: AYOCODES
//
//  FIXES:
//  1. Dropped ytdl-core (dead — YouTube blocks it). Replaced with:
//     Piped API → Invidious pool → cobalt.tools → Deezer preview
//  2. Fixed JioSaavn: old api.php endpoint is broken. Now uses saavn.dev
//  3. Removed dead SoundCloud hardcoded OAuth token
//  4. cobalt.tools added as high-quality YT audio fallback (no key needed)
//  5. Better audio buffer validation & retry logic
//  6. All download, search and lyrics flows fully working
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import * as cheerio from "cheerio";
import { ENV } from "../index.js";
import { formatError, formatInfo } from "../utils/formatters.js";

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

// ─── Shared axios instance ───────────────────────────────────────────────────
const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

// ─── Invidious instance pool (public, no auth) ───────────────────────────────
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://invidious.fdn.fr",
  "https://iv.datura.network",
];

// ─── Piped instances (public, no auth) ───────────────────────────────────────
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.projectsegfau.lt",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// Parses "song - artist", "song– artist", "song by artist"
function parseQuery(input) {
  if (!input) return { title: "", artist: null };
  const q = input.trim();
  const byMatch = q.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
  const dashMatch = q.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch)
    return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() };
  return { title: q, artist: null };
}

// Download buffer with retries
async function downloadBuffer(url, timeoutMs = 60000) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 100 * 1024 * 1024,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
          Range: "bytes=0-",
        },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5000)
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
//  SEARCH SOURCES
// ════════════════════════════════════════════════════════════════════════════

// ─── Source 1: Piped API (YouTube frontend, no key, no rate-limits) ──────────
// Piped is an open-source YouTube frontend. Its API is free and public.
// Returns direct audio stream URLs extracted server-side.
async function searchPiped(query) {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`[music] Piped search: "${query}" @ ${instance}`);

      // Step 1: search for videos
      const searchRes = await http.get(
        `${instance}/search?q=${encodeURIComponent(query + " audio")}&filter=music_songs`,
        { timeout: 12000 },
      );

      const items = searchRes.data?.items || [];
      if (!items.length) continue;

      const video = items[0];
      const videoId = video.url?.replace("/watch?v=", "") || video.id;
      if (!videoId) continue;

      // Step 2: get streams
      const streamRes = await http.get(`${instance}/streams/${videoId}`, {
        timeout: 12000,
      });

      const streams = streamRes.data?.audioStreams || [];
      // Prefer highest bitrate audio-only stream
      const sorted = streams.sort(
        (a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0),
      );
      const best = sorted.find((s) => s.url) || sorted[0];

      if (!best?.url) continue;

      return {
        title: streamRes.data?.title || video.title || "Unknown",
        artist: streamRes.data?.uploader || video.uploaderName || "Unknown",
        album: null,
        duration: streamRes.data?.duration || video.duration || 0,
        thumbnail:
          streamRes.data?.thumbnailUrl ||
          video.thumbnail ||
          `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        audioUrl: best.url,
        source: "Piped (YouTube)",
        isPreview: false,
        videoId,
        year: null,
      };
    } catch (err) {
      console.log(`[music] Piped @ ${instance} failed: ${err.message}`);
    }
  }
  return null;
}

// ─── Source 2: Invidious (another YouTube frontend, no key) ──────────────────
async function searchInvidious(query) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`[music] Invidious search: "${query}" @ ${instance}`);

      const searchRes = await http.get(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,lengthSeconds`,
        { timeout: 12000 },
      );

      const videos = searchRes.data || [];
      if (!videos.length) continue;

      const video = videos[0];
      const videoId = video.videoId;
      if (!videoId) continue;

      // Get video streams
      const videoRes = await http.get(
        `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats,videoThumbnails`,
        { timeout: 12000 },
      );

      const formats = videoRes.data?.adaptiveFormats || [];
      // Audio-only formats: itag 140 (m4a 128k), 251 (webm opus), 250, 249
      const audioFormats = formats
        .filter((f) => f.type?.startsWith("audio/"))
        .sort(
          (a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0),
        );

      const best = audioFormats[0];
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
        source: "Invidious (YouTube)",
        isPreview: false,
        videoId,
        year: null,
      };
    } catch (err) {
      console.log(`[music] Invidious @ ${instance} failed: ${err.message}`);
    }
  }
  return null;
}

// ─── Source 3: cobalt.tools (free, no key, supports YT + more) ───────────────
// cobalt.tools is a free, open-source media downloader with no auth required.
async function searchCobalt(query) {
  try {
    console.log(`[music] cobalt.tools search: "${query}"`);

    // First, find the YouTube video ID via Piped search (lightweight)
    let videoId = null;
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await http.get(
          `${instance}/search?q=${encodeURIComponent(query + " song")}&filter=videos`,
          { timeout: 10000 },
        );
        const items = res.data?.items || [];
        if (items.length) {
          videoId = items[0].url?.replace("/watch?v=", "") || items[0].id;
          if (videoId) break;
        }
      } catch (_) {}
    }

    if (!videoId) throw new Error("No video ID found for cobalt");

    // Use cobalt.tools API to get audio-only download link
    const cobaltRes = await axios.post(
      "https://api.cobalt.tools/",
      {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        downloadMode: "audio",
        audioFormat: "mp3",
        audioBitrate: "128",
      },
      {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    const data = cobaltRes.data;
    if (!data?.url && !data?.audio) throw new Error("No URL from cobalt");

    const audioUrl = data.url || data.audio;

    // Resolve title from Piped
    let title = query;
    let artist = "Unknown";
    let duration = 0;
    let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    try {
      for (const inst of PIPED_INSTANCES) {
        const s = await http.get(`${inst}/streams/${videoId}`, {
          timeout: 8000,
        });
        if (s.data?.title) {
          title = s.data.title;
          artist = s.data.uploader || "Unknown";
          duration = s.data.duration || 0;
          thumbnail = s.data.thumbnailUrl || thumbnail;
          break;
        }
      }
    } catch (_) {}

    return {
      title,
      artist,
      album: null,
      duration,
      thumbnail,
      audioUrl,
      source: "cobalt.tools",
      isPreview: false,
      videoId,
      year: null,
    };
  } catch (err) {
    console.log(`[music] cobalt.tools failed: ${err.message}`);
    return null;
  }
}

// ─── Source 4: JioSaavn via saavn.dev (working open wrapper) ─────────────────
// saavn.dev is a well-maintained open-source wrapper for JioSaavn's internal API.
// The old api.php?__call= endpoint JioSaavn used to expose is now broken.
async function searchJioSaavn(query) {
  try {
    console.log(`[music] JioSaavn (saavn.dev) search: "${query}"`);

    const res = await http.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=1`,
      { timeout: 15000 },
    );

    const results = res.data?.data?.results;
    if (!results || !results.length) return null;

    const track = results[0];

    // saavn.dev returns downloadUrl as an array of quality options
    // Prefer highest quality: [12kbps, 48kbps, 96kbps, 160kbps, 320kbps]
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
    console.log(`[music] JioSaavn (saavn.dev) failed: ${err.message}`);
    return null;
  }
}

// ─── Source 5: Deezer (preview only — 30 seconds, always last resort) ────────
async function searchDeezer(query) {
  try {
    console.log(`[music] Deezer search: "${query}"`);
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
    console.log(`[music] Deezer failed: ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .play COMMAND — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC DOWNLOAD",
        `Usage: *${ENV.PREFIX}play <song name>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}play Wildflower Billie Eilish\n` +
          `• ${ENV.PREFIX}play Shape of You - Ed Sheeran\n` +
          `• ${ENV.PREFIX}play Lose Yourself by Eminem\n\n` +
          `💡 Include artist name for best results`,
      ),
    });
  }

  const query = fullArgs.trim();
  const { title: parsedTitle, artist: parsedArtist } = parseQuery(query);
  const searchQuery = parsedArtist ? `${parsedTitle} ${parsedArtist}` : query;

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${searchQuery}"\n⏳ _Please wait..._`,
  });

  let songInfo = null;

  // Try sources in order: Piped → Invidious → cobalt → JioSaavn → Deezer
  const sources = [
    { name: "Piped", fn: () => searchPiped(searchQuery) },
    { name: "Invidious", fn: () => searchInvidious(searchQuery) },
    { name: "cobalt.tools", fn: () => searchCobalt(searchQuery) },
    { name: "JioSaavn", fn: () => searchJioSaavn(searchQuery) },
    { name: "Deezer", fn: () => searchDeezer(searchQuery) },
  ];

  for (const source of sources) {
    try {
      console.log(`[play] Trying ${source.name}...`);
      songInfo = await source.fn();
      if (songInfo?.audioUrl) {
        console.log(`[play] ✓ Found on ${source.name}`);
        break;
      }
    } catch (err) {
      console.log(`[play] ${source.name} error: ${err.message}`);
    }
  }

  if (!songInfo?.audioUrl) {
    return sock.sendMessage(from, {
      text: formatError(
        "SONG NOT FOUND",
        `Could not find *"${query}"* on any music service.\n\n` +
          `💡 *Tips:*\n` +
          `• Add artist name: *${ENV.PREFIX}play ${query} - Artist Name*\n` +
          `• Check spelling\n` +
          `• Try: *${ENV.PREFIX}musicsearch ${parsedTitle}*\n\n` +
          `Example: *${ENV.PREFIX}play Wildflower Billie Eilish*`,
      ),
    });
  }

  // ── Send cover image with song info first ────────────────────────────────
  const durationStr = songInfo.duration > 0 ? fmtDur(songInfo.duration) : "N/A";

  const infoCaption =
    `🎵 *${songInfo.title}*\n` +
    `👤 *Artist:* ${songInfo.artist}\n` +
    (songInfo.album ? `💿 *Album:* ${songInfo.album}\n` : ``) +
    (durationStr !== "N/A" ? `⏱️ *Duration:* ${durationStr}\n` : ``) +
    (songInfo.year ? `📅 *Year:* ${songInfo.year}\n` : ``) +
    `📡 *Source:* ${songInfo.source}\n` +
    (songInfo.isPreview ? `⚠️ *Preview only (30s)*\n` : ``) +
    `\n⬇️ _Downloading audio..._`;

  if (songInfo.thumbnail) {
    try {
      await sock.sendMessage(from, {
        image: { url: songInfo.thumbnail },
        caption: infoCaption,
      });
    } catch (imgErr) {
      console.log(`[play] Thumbnail send failed: ${imgErr.message}`);
      await sock.sendMessage(from, { text: infoCaption });
    }
  } else {
    await sock.sendMessage(from, { text: infoCaption });
  }

  // ── Download audio buffer ─────────────────────────────────────────────────
  let audioBuffer = null;

  try {
    console.log(
      `[play] Downloading from: ${songInfo.audioUrl.substring(0, 80)}...`,
    );
    audioBuffer = await downloadBuffer(songInfo.audioUrl, 90000);
    console.log(`[play] Downloaded: ${fmtSize(audioBuffer.length)}`);
  } catch (dlErr) {
    console.log(`[play] Primary download failed: ${dlErr.message}`);

    // If Piped/Invidious URL expired, try cobalt as fallback
    if (songInfo.videoId && songInfo.source !== "cobalt.tools") {
      try {
        console.log(
          `[play] Trying cobalt.tools fallback for videoId ${songInfo.videoId}...`,
        );
        const cobaltRes = await axios.post(
          "https://api.cobalt.tools/",
          {
            url: `https://www.youtube.com/watch?v=${songInfo.videoId}`,
            downloadMode: "audio",
            audioFormat: "mp3",
            audioBitrate: "128",
          },
          {
            timeout: 20000,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          },
        );
        const fallbackUrl = cobaltRes.data?.url || cobaltRes.data?.audio;
        if (fallbackUrl) {
          audioBuffer = await downloadBuffer(fallbackUrl, 90000);
          console.log(
            `[play] cobalt fallback success: ${fmtSize(audioBuffer.length)}`,
          );
        }
      } catch (cobaltErr) {
        console.log(`[play] cobalt fallback failed: ${cobaltErr.message}`);
      }
    }
  }

  if (!audioBuffer || audioBuffer.length < 5000) {
    return sock.sendMessage(from, {
      text: formatError(
        "DOWNLOAD FAILED",
        `Could not download audio for *${songInfo.title}*.\n\n` +
          `The song was found but the audio file could not be downloaded.\n` +
          `Please try again later.\n\n` +
          `Try: *${ENV.PREFIX}play ${songInfo.title}*`,
      ),
    });
  }

  // ── Send audio ───────────────────────────────────────────────────────────
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
        (songInfo.isPreview ? `⚠️ _Preview only (30 seconds)_\n` : ``) +
        `\n${TAG}`,
    });
  } catch (sendErr) {
    console.error(`[play] Failed to send audio: ${sendErr.message}`);
    await sock.sendMessage(from, {
      text: formatError(
        "SEND FAILED",
        `Audio downloaded (${fmtSize(audioBuffer.length)}) but failed to send: ${sendErr.message}\n\nTry again in a moment.`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LYRICS SOURCES — AYOCODES
// ════════════════════════════════════════════════════════════════════════════

// Source 1: Genius
async function fetchGenius(title, artist) {
  try {
    const query = artist ? `${title} ${artist}` : title;
    const searchRes = await http.get(
      `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`,
      { timeout: 10000 },
    );

    const sections = searchRes.data?.response?.sections || [];
    const hits = sections
      .flatMap((s) => s.hits || [])
      .filter((h) => h.type === "song");
    if (!hits.length) throw new Error("No results");

    let hit = hits[0];
    if (artist) {
      const al = artist.toLowerCase();
      const match = hits.find(
        (h) =>
          h.result?.artist_names?.toLowerCase().includes(al) ||
          h.result?.primary_artist?.name?.toLowerCase().includes(al),
      );
      if (match) hit = match;
    }

    const songUrl = hit.result?.url;
    if (!songUrl) throw new Error("No URL");

    const pageRes = await http.get(songUrl, { timeout: 15000 });
    const $ = cheerio.load(pageRes.data);

    let lyrics = "";
    $('[data-lyrics-container="true"]').each((_, el) => {
      $(el).find("br").replaceWith("\n");
      lyrics += $(el).text() + "\n";
    });

    if (!lyrics.trim())
      lyrics = $(".lyrics").text() || $(".song_body-lyrics").text() || "";
    if (!lyrics.trim()) throw new Error("No lyrics extracted");

    lyrics = lyrics.replace(/\n{3,}/g, "\n\n").trim();
    return {
      lyrics,
      title: hit.result?.title || title,
      artist: hit.result?.artist_names || artist || "Unknown",
      source: "Genius",
    };
  } catch (err) {
    console.log(`[lyrics] Genius failed: ${err.message}`);
    return null;
  }
}

// Source 2: AZLyrics
async function fetchAZLyrics(title, artist) {
  try {
    const searchArtist = artist?.toLowerCase().replace(/[^a-z]/g, "") || "";
    const searchTitle = title.toLowerCase().replace(/[^a-z]/g, "");
    const url = artist
      ? `https://www.azlyrics.com/lyrics/${searchArtist}/${searchTitle}.html`
      : `https://www.azlyrics.com/lyrics/${searchTitle}.html`;

    const res = await http.get(url, { timeout: 15000 });
    const $ = cheerio.load(res.data);

    let lyrics = "";
    $("div.ringtone").remove();
    $("div.azlist").remove();

    // AZLyrics stores lyrics in an unstyled div between comments
    const allDivs = $("div.col-xs-12.col-lg-8.text-center > div");
    allDivs.each((_, el) => {
      const text = $(el).text().trim();
      // The lyrics div has no class/id — filter out the ones we know aren't lyrics
      if (!$(el).attr("class") && !$(el).attr("id") && text.length > 50) {
        lyrics += text + "\n\n";
      }
    });

    if (!lyrics.trim()) throw new Error("No lyrics found");

    lyrics = lyrics
      .replace(/<br>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .trim();
    return { lyrics, title, artist, source: "AZLyrics" };
  } catch (err) {
    console.log(`[lyrics] AZLyrics failed: ${err.message}`);
    return null;
  }
}

// Source 3: Lyrics.ovh
async function fetchLyricsOvh(title, artist) {
  try {
    if (!artist) throw new Error("Artist required");
    const res = await http.get(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { timeout: 10000 },
    );
    if (!res.data?.lyrics?.trim()) throw new Error("No lyrics");
    return {
      lyrics: res.data.lyrics.trim(),
      title,
      artist,
      source: "Lyrics.ovh",
    };
  } catch (err) {
    console.log(`[lyrics] Lyrics.ovh failed: ${err.message}`);
    return null;
  }
}

// Source 4: lrclib (open lyrics database, no auth)
async function fetchLrclib(title, artist) {
  try {
    const query = artist ? `${title} ${artist}` : title;
    const res = await http.get(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { timeout: 10000 },
    );
    const results = res.data || [];
    const track =
      results.find((r) => r.plainLyrics || r.syncedLyrics) || results[0];
    if (!track) throw new Error("No results");

    const lyrics =
      track.plainLyrics ||
      track.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]/g, "") ||
      "";
    if (!lyrics.trim()) throw new Error("No lyrics in result");

    return {
      lyrics: lyrics.trim(),
      title: track.trackName || title,
      artist: track.artistName || artist || "Unknown",
      source: "lrclib",
    };
  } catch (err) {
    console.log(`[lyrics] lrclib failed: ${err.message}`);
    return null;
  }
}

// Send lyrics with proper chunking
async function sendLyrics(sock, from, data) {
  let lyrics = data.lyrics
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const header =
    `🎵 *${data.title}*\n` +
    (data.artist ? `👤 *${data.artist}*\n` : ``) +
    `📡 _Source: ${data.source}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const footer = `\n\n━━━━━━━━━━━━━━━━━━━━━\n${TAG}`;
  const full = header + lyrics + footer;

  if (full.length <= 4000) {
    await sock.sendMessage(from, { text: full });
    return;
  }

  await sock.sendMessage(from, {
    text: header + `_Lyrics are long — sending in parts..._`,
  });

  const lines = lyrics.split("\n");
  let chunk = "";
  let part = 1;

  for (const line of lines) {
    if ((chunk + line + "\n").length > 3500) {
      await sock.sendMessage(from, {
        text: `📝 *Part ${part}:*\n\n${chunk.trim()}`,
      });
      chunk = line + "\n";
      part++;
      await new Promise((r) => setTimeout(r, 600));
    } else {
      chunk += line + "\n";
    }
  }

  if (chunk.trim()) {
    await sock.sendMessage(from, {
      text: `📝 *Part ${part}:*\n\n${chunk.trim()}\n\n${TAG}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  .lyrics COMMAND — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS",
        `Usage: *${ENV.PREFIX}lyrics <song>*\n` +
          `With artist: *${ENV.PREFIX}lyrics <song> - <artist>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}lyrics Wildflower Billie Eilish\n` +
          `• ${ENV.PREFIX}lyrics Shape of You - Ed Sheeran\n` +
          `• ${ENV.PREFIX}lyrics Lose Yourself by Eminem`,
      ),
    });
  }

  const { title, artist } = parseQuery(fullArgs.trim());

  const cleanTitle = title
    .replace(/\(official\s+(?:video|audio|lyrics|music\s+video)\)/gi, "")
    .replace(/\(lyrics?\s*video\)/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s+ft\..*$/i, "")
    .trim();

  await sock.sendMessage(from, {
    text:
      `🔍 *Searching lyrics for:*\n` +
      `🎵 "${cleanTitle}"` +
      (artist ? ` by *${artist}*` : ``) +
      `\n⏳ _Please wait..._`,
  });

  console.log(
    `[lyrics] Searching: title="${cleanTitle}" artist="${artist || "none"}"`,
  );

  // Try to resolve artist from Piped search if not provided
  let resolvedArtist = artist;
  if (!resolvedArtist) {
    try {
      const pResult = await searchPiped(cleanTitle);
      if (pResult?.artist) {
        resolvedArtist = pResult.artist;
        console.log(`[lyrics] Artist resolved from Piped: ${resolvedArtist}`);
      }
    } catch (_) {}
  }

  // Try all lyrics sources in order
  const sources = [
    { name: "Genius", fn: () => fetchGenius(cleanTitle, resolvedArtist) },
    { name: "lrclib", fn: () => fetchLrclib(cleanTitle, resolvedArtist) },
    {
      name: "Lyrics.ovh",
      fn: () => fetchLyricsOvh(cleanTitle, resolvedArtist),
    },
    { name: "AZLyrics", fn: () => fetchAZLyrics(cleanTitle, resolvedArtist) },
  ];

  for (const source of sources) {
    try {
      console.log(`[lyrics] Trying ${source.name}...`);
      const result = await Promise.race([
        source.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 15000),
        ),
      ]);

      if (result?.lyrics && result.lyrics.length > 30) {
        console.log(
          `[lyrics] ✓ Found via ${source.name}: ${result.lyrics.length} chars`,
        );
        await sendLyrics(sock, from, result);
        return;
      }
    } catch (err) {
      console.log(`[lyrics] ${source.name} failed: ${err.message}`);
    }
  }

  await sock.sendMessage(from, {
    text: formatInfo(
      "LYRICS NOT FOUND",
      `Could not find lyrics for *"${cleanTitle}"*` +
        (resolvedArtist ? ` by *${resolvedArtist}*` : ``) +
        `.\n\n` +
        `💡 *Try:*\n` +
        `• Add artist: *${ENV.PREFIX}lyrics ${cleanTitle} - Artist Name*\n` +
        `• Check spelling\n` +
        `• Use Genius: *${ENV.PREFIX}genius ${cleanTitle}*\n\n` +
        `Example: *${ENV.PREFIX}lyrics Wildflower - Billie Eilish*\n\n` +
        TAG,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  .genius COMMAND — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎤 GENIUS",
        `Usage: *${ENV.PREFIX}genius <song>*\n` +
          `Example: *${ENV.PREFIX}genius Wildflower Billie Eilish*`,
      ),
    });
  }

  const { title, artist } = parseQuery(fullArgs.trim());

  await sock.sendMessage(from, {
    text: `🔍 *Searching Genius for:* "${fullArgs}"...\n⏳ _Please wait..._`,
  });

  try {
    const result = await fetchGenius(title, artist);
    if (!result?.lyrics) throw new Error("No lyrics found");
    await sendLyrics(sock, from, result);
  } catch (err) {
    try {
      const result = await fetchGenius(fullArgs.trim(), null);
      if (result?.lyrics) {
        await sendLyrics(sock, from, result);
        return;
      }
    } catch (_) {}

    await sock.sendMessage(from, {
      text: formatError(
        "GENIUS FAILED",
        `Could not find lyrics for "${fullArgs}".\n\nTry: *${ENV.PREFIX}lyrics ${fullArgs}*`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TRENDING — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });

    const res = await http.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      {
        timeout: 10000,
      },
    );
    const tracks = res.data?.data;
    if (!tracks?.length) throw new Error("No trending data");

    let text =
      `╔══════════════════════════╗\n` +
      `║   🔥 *TRENDING NOW*      ║\n` +
      `╚══════════════════════════╝\n\n`;

    tracks.forEach((t, i) => {
      text += `${i + 1}. *${t.title}*\n   👤 ${t.artist.name} | ⏱️ ${fmtDur(t.duration)}\n\n`;
    });

    text += `💡 Use *${ENV.PREFIX}play <song>* to download\n\n${TAG}`;
    await sock.sendMessage(from, { text });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch trending: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SEARCH — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔍 MUSIC SEARCH",
        `Usage: *${ENV.PREFIX}musicsearch <query>*\n` +
          `Example: *${ENV.PREFIX}musicsearch Billie Eilish Wildflower*`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs}"...`,
  });

  try {
    // Try Piped first, then Invidious for search metadata
    let result = await searchPiped(fullArgs);
    if (!result) result = await searchInvidious(fullArgs);

    if (result) {
      const text =
        `╔══════════════════════════╗\n` +
        `║   🔍 *TOP RESULT*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `🎵 *${result.title}*\n` +
        `👤 ${result.artist}\n` +
        `⏱️ ${fmtDur(result.duration)}\n` +
        `📡 Source: ${result.source}\n\n` +
        `💡 *${ENV.PREFIX}play ${result.title}* to download\n\n` +
        TAG;

      await sock.sendMessage(from, { text });
      return;
    }
  } catch (_) {}

  await sock.sendMessage(from, {
    text: formatError("NO RESULTS", `No results found for "${fullArgs}".`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  RANDOM — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding a random song...*" });
    const res = await http.get(
      "https://api.deezer.com/chart/0/tracks?limit=50",
      {
        timeout: 10000,
      },
    );
    const tracks = res.data?.data;
    if (!tracks?.length) throw new Error("No data");
    const t = tracks[Math.floor(Math.random() * tracks.length)];
    await sock.sendMessage(from, {
      text:
        `🎲 *RANDOM SONG*\n\n` +
        `🎵 *${t.title}*\n` +
        `👤 *${t.artist.name}*\n` +
        `⏱️ ${fmtDur(t.duration)}\n\n` +
        `💡 *${ENV.PREFIX}play ${t.title}* to download\n\n` +
        TAG,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not get random song: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN ROUTER — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function music({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC HUB",
        `*Commands:*\n\n` +
          `🎵 *${ENV.PREFIX}play <song>* — Download audio\n` +
          `📝 *${ENV.PREFIX}lyrics <song>* — Get lyrics\n` +
          `📈 *${ENV.PREFIX}trending* — Top songs\n` +
          `🎲 *${ENV.PREFIX}random* — Random song\n` +
          `🔍 *${ENV.PREFIX}musicsearch <query>* — Search\n` +
          `🎤 *${ENV.PREFIX}genius <song>* — Genius lyrics\n\n` +
          `*Examples:*\n` +
          `• ${ENV.PREFIX}play Wildflower Billie Eilish\n` +
          `• ${ENV.PREFIX}lyrics Shape of You - Ed Sheeran\n\n` +
          TAG,
      ),
    });
  }

  const sub = fullArgs.trim().toLowerCase().split(/\s+/)[0];
  const rest = fullArgs.trim().replace(/^\S+\s*/, "");

  switch (sub) {
    case "trending":
    case "top":
      return musicTrending({ from, sock });
    case "random":
      return musicRandom({ from, sock });
    case "search":
      return musicSearch({ fullArgs: rest, from, sock });
    case "play":
    case "download":
      return musicDownload({ fullArgs: rest, from, sock });
    case "genius":
      return musicGenius({ fullArgs: rest, from, sock });
    default:
      return musicLyrics({ fullArgs, from, sock });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT — AYOCODES
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
