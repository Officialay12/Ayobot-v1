// features/music.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  MUSIC MODULE — COMPLETE REWRITE
//  Author: AYOCODES
//
//  FIXES:
//  1. .play  — sends cover image + info caption, then sends actual audio file
//  2. .lyrics — parses ALL separator formats, tries 4 APIs, never fails silently
//  3. RapidAPI YouTube used as fallback when JioSaavn misses
//  4. Artist auto-resolved from JioSaavn when not provided in lyrics query
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import * as cheerio from "cheerio";
import { ENV } from "../index.js";
import { formatError, formatInfo } from "../utils/formatters.js";

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

// ─── Shared axios instance ───────────────────────────────────────────────────
const http = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

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

// Parses "song - artist", "song– artist", "song-artist", "song by artist"
function parseQuery(input) {
  if (!input) return { title: "", artist: null };
  const q = input.trim();

  // "song by artist"
  const byMatch = q.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };

  // "song - artist" or "song– artist" or "song-artist" (with or without spaces)
  const dashMatch = q.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch)
    return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() };

  return { title: q, artist: null };
}

// Download buffer with 3 retries
async function downloadBuffer(url, timeoutMs = 50000) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 100 * 1024 * 1024,
        maxRedirects: 10,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "*/*",
        },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 10000)
        throw new Error(`Buffer too small: ${buf.length} bytes`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(
        `[music] Download attempt ${attempt}/3 failed: ${err.message}`,
      );
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════════════════
//  SEARCH SOURCES
// ════════════════════════════════════════════════════════════════════════════

// Source 1: JioSaavn — free, no key, full audio
async function searchJioSaavn(query) {
  try {
    const res = await http.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=5`,
      { timeout: 15000 },
    );
    const results = res.data?.data?.results;
    if (!results?.length) return null;

    const track = results[0];
    // Pick best quality audio URL available
    const audioUrl =
      track.downloadUrl?.find((d) => d.quality === "320kbps")?.url ||
      track.downloadUrl?.find((d) => d.quality === "160kbps")?.url ||
      track.downloadUrl?.find((d) => d.quality === "96kbps")?.url ||
      track.downloadUrl?.[track.downloadUrl.length - 1]?.url;

    if (!audioUrl) return null;

    return {
      title: track.name || "Unknown",
      artist:
        track.artists?.primary?.map((a) => a.name).join(", ") ||
        "Unknown Artist",
      album: track.album?.name || null,
      duration: track.duration || 0,
      thumbnail:
        track.image?.find((i) => i.quality === "500x500")?.url ||
        track.image?.find((i) => i.quality === "150x150")?.url ||
        track.image?.[0]?.url ||
        null,
      audioUrl,
      source: "JioSaavn",
      isPreview: false,
      year: track.year || null,
    };
  } catch (err) {
    console.log(`[music] JioSaavn failed: ${err.message}`);
    return null;
  }
}

// Source 2: Deezer — free, no key, 30s preview only
async function searchDeezer(query) {
  try {
    const res = await http.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`,
      { timeout: 10000 },
    );
    const track = res.data?.data?.[0];
    if (!track) return null;

    return {
      title: track.title || "Unknown",
      artist: track.artist?.name || "Unknown Artist",
      album: track.album?.title || null,
      duration: track.duration || 0,
      thumbnail:
        track.album?.cover_xl ||
        track.album?.cover_big ||
        track.album?.cover_medium ||
        null,
      audioUrl: track.preview || null,
      source: "Deezer",
      isPreview: true,
      year: null,
    };
  } catch (err) {
    console.log(`[music] Deezer failed: ${err.message}`);
    return null;
  }
}

// Source 3: YouTube via RapidAPI — search + download
async function searchYouTube(query) {
  if (!ENV.RAPIDAPI_KEY) {
    console.log("[music] No RAPIDAPI_KEY set, skipping YouTube");
    return null;
  }

  try {
    // Step 1: Search for the video
    const searchRes = await http.get(
      `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(
        query + " audio",
      )}&type=v&sort=r`,
      {
        timeout: 15000,
        headers: {
          "x-rapidapi-host": "youtube-search-and-download.p.rapidapi.com",
          "x-rapidapi-key": ENV.RAPIDAPI_KEY,
        },
      },
    );

    const video = searchRes.data?.contents?.[0]?.video;
    if (!video?.videoId) {
      console.log("[music] YouTube search returned no results");
      return null;
    }

    const videoId = video.videoId;
    const title = video.title || query;
    const channel = video.channelName || "YouTube";
    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Step 2: Get MP3 download link
    let audioUrl = null;

    // Try youtube-mp36 endpoint
    try {
      const mp3Res = await http.get(
        `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
        {
          timeout: 25000,
          headers: {
            "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
            "x-rapidapi-key": ENV.RAPIDAPI_KEY,
          },
        },
      );
      if (mp3Res.data?.status === "ok" && mp3Res.data?.link) {
        audioUrl = mp3Res.data.link;
        console.log(`[music] YouTube MP3 link obtained via youtube-mp36`);
      }
    } catch (e1) {
      console.log(`[music] youtube-mp36 failed: ${e1.message}`);
    }

    // Try alternative endpoint if first failed
    if (!audioUrl) {
      try {
        const altRes = await http.get(
          `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`,
          {
            timeout: 25000,
            headers: {
              "x-rapidapi-host":
                "ytstream-download-youtube-videos.p.rapidapi.com",
              "x-rapidapi-key": ENV.RAPIDAPI_KEY,
            },
          },
        );
        const formats = altRes.data?.formats;
        if (formats) {
          const audioFormat = Object.values(formats).find(
            (f) => f.mimeType?.includes("audio") && f.url,
          );
          if (audioFormat?.url) {
            audioUrl = audioFormat.url;
            console.log(`[music] YouTube audio URL obtained via ytstream`);
          }
        }
      } catch (e2) {
        console.log(`[music] ytstream failed: ${e2.message}`);
      }
    }

    return {
      title,
      artist: channel,
      album: null,
      duration: 0,
      thumbnail,
      audioUrl,
      source: "YouTube",
      isPreview: false,
      videoId,
      year: null,
    };
  } catch (err) {
    console.log(`[music] YouTube overall failed: ${err.message}`);
    return null;
  }
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
          `• ${ENV.PREFIX}play Essence Wizkid\n` +
          `• ${ENV.PREFIX}play Japanese Denim - Daniel Caesar\n` +
          `• ${ENV.PREFIX}play Shape of You Ed Sheeran\n\n` +
          `💡 Include artist name for best results`,
      ),
    });
  }

  const query = fullArgs.trim();
  const { title: parsedTitle, artist: parsedArtist } = parseQuery(query);

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${query}"\n⏳ _Please wait..._`,
  });

  let songInfo = null;

  // Try 1: JioSaavn with full query
  console.log(`[music] [play] Trying JioSaavn: "${query}"`);
  songInfo = await searchJioSaavn(query);

  // Try 2: JioSaavn with just the title (if artist was specified)
  if (!songInfo && parsedArtist) {
    console.log(
      `[music] [play] JioSaavn retry with title only: "${parsedTitle}"`,
    );
    songInfo = await searchJioSaavn(parsedTitle);
  }

  // Try 3: YouTube via RapidAPI
  if (!songInfo) {
    console.log(`[music] [play] Trying YouTube: "${query}"`);
    songInfo = await searchYouTube(query);
  }

  // Try 4: Deezer (preview only)
  if (!songInfo) {
    console.log(`[music] [play] Trying Deezer: "${query}"`);
    songInfo = await searchDeezer(query);
  }

  if (!songInfo) {
    return sock.sendMessage(from, {
      text: formatError(
        "SONG NOT FOUND",
        `Could not find *"${query}"* on any music service.\n\n` +
          `💡 *Tips:*\n` +
          `• Add artist name: *${ENV.PREFIX}play ${query} - Artist Name*\n` +
          `• Check spelling\n` +
          `• Try: *${ENV.PREFIX}musicsearch ${parsedTitle}*`,
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
    `📡 *Source:* ${songInfo.source}\n\n` +
    `⬇️ _Downloading audio..._`;

  if (songInfo.thumbnail) {
    try {
      await sock.sendMessage(from, {
        image: { url: songInfo.thumbnail },
        caption: infoCaption,
      });
    } catch (imgErr) {
      console.log(`[music] Thumbnail send failed: ${imgErr.message}`);
      await sock.sendMessage(from, { text: infoCaption });
    }
  } else {
    await sock.sendMessage(from, { text: infoCaption });
  }

  // ── Download and send audio ──────────────────────────────────────────────
  if (!songInfo.audioUrl) {
    return sock.sendMessage(from, {
      text:
        `⚠️ *Found the song but no audio download URL available*\n\n` +
        `🎵 *${songInfo.title}* — ${songInfo.artist}\n\n` +
        `Try: *${ENV.PREFIX}play ${songInfo.title} ${songInfo.artist}*\n\n` +
        TAG,
    });
  }

  let audioBuffer = null;

  // Primary download
  try {
    console.log(
      `[music] Downloading audio: ${songInfo.audioUrl.substring(0, 80)}`,
    );
    audioBuffer = await downloadBuffer(songInfo.audioUrl, 60000);
    console.log(
      `[music] Audio downloaded: ${fmtSize(audioBuffer.length)} from ${songInfo.source}`,
    );
  } catch (dlErr) {
    console.log(`[music] Primary download failed: ${dlErr.message}`);

    // Fallback: try YouTube if primary was not YouTube
    if (songInfo.source !== "YouTube") {
      console.log(`[music] Trying YouTube fallback download...`);
      const ytInfo = await searchYouTube(
        `${songInfo.title} ${songInfo.artist}`,
      );
      if (ytInfo?.audioUrl) {
        try {
          audioBuffer = await downloadBuffer(ytInfo.audioUrl, 60000);
          console.log(
            `[music] YouTube fallback success: ${fmtSize(audioBuffer.length)}`,
          );
        } catch (ytErr) {
          console.log(`[music] YouTube fallback also failed: ${ytErr.message}`);
        }
      }

      // Fallback 2: Deezer preview if still nothing
      if (!audioBuffer) {
        console.log(`[music] Trying Deezer preview fallback...`);
        const dz = await searchDeezer(`${songInfo.title} ${songInfo.artist}`);
        if (dz?.audioUrl) {
          try {
            audioBuffer = await downloadBuffer(dz.audioUrl, 30000);
            songInfo.isPreview = true;
            console.log(`[music] Deezer preview fallback success`);
          } catch (_) {}
        }
      }
    }
  }

  if (!audioBuffer || audioBuffer.length < 10000) {
    return sock.sendMessage(from, {
      text:
        `⚠️ *Could not download audio for this song*\n\n` +
        `🎵 *${songInfo.title}* — ${songInfo.artist}\n\n` +
        `The song was found but the audio file could not be downloaded.\n` +
        `Please try again in a moment.\n\n` +
        TAG,
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
    console.error(`[music] Failed to send audio: ${sendErr.message}`);
    await sock.sendMessage(from, {
      text: formatError(
        "SEND FAILED",
        `Audio downloaded (${fmtSize(audioBuffer.length)}) but failed to send: ${sendErr.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LYRICS SOURCES
// ════════════════════════════════════════════════════════════════════════════

// Source 1: Genius — most complete, scrapes the page
async function fetchGenius(title, artist) {
  const q = artist ? `${title} ${artist}` : title;

  const searchRes = await http.get(
    `https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`,
    {
      timeout: 12000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    },
  );

  const sections = searchRes.data?.response?.sections || [];
  const hits = sections
    .flatMap((s) => s.hits || [])
    .filter((h) => h.type === "song");

  if (!hits.length) throw new Error("No Genius search results");

  // Pick best hit — prefer one matching the artist
  let hit = hits[0];
  if (artist) {
    const artistLower = artist.toLowerCase();
    const match = hits.find(
      (h) =>
        h.result?.artist_names?.toLowerCase().includes(artistLower) ||
        h.result?.primary_artist?.name?.toLowerCase().includes(artistLower),
    );
    if (match) hit = match;
  }

  const songUrl = hit.result?.url;
  const songTitle = hit.result?.title || title;
  const songArtist = hit.result?.artist_names || artist || "Unknown";

  if (!songUrl) throw new Error("No song URL from Genius");

  // Scrape the lyrics page
  const pageRes = await http.get(songUrl, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const $ = cheerio.load(pageRes.data);
  let lyrics = "";

  // Genius uses data-lyrics-container attribute on lyric divs
  $('[data-lyrics-container="true"]').each((_, el) => {
    // Replace <br> tags with newlines
    $(el).find("br").replaceWith("\n");
    lyrics += $(el).text() + "\n";
  });

  // Fallback selectors for older Genius pages
  if (!lyrics.trim()) {
    lyrics = $(".lyrics").text() || $(".song_body-lyrics p").text() || "";
  }

  if (!lyrics.trim()) throw new Error("Could not extract lyrics from Genius");

  lyrics = lyrics.replace(/\n{3,}/g, "\n\n").trim();

  return { lyrics, title: songTitle, artist: songArtist, source: "Genius" };
}

// Source 2: lyrics.ovh — fast free API
async function fetchLyricsOvh(title, artist) {
  if (!artist) throw new Error("lyrics.ovh requires artist name");
  const res = await http.get(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    { timeout: 10000 },
  );
  if (!res.data?.lyrics?.trim()) throw new Error("No lyrics from lyrics.ovh");
  return {
    lyrics: res.data.lyrics.trim(),
    title,
    artist,
    source: "Lyrics.ovh",
  };
}

// Source 3: Lyrist — free Vercel API
async function fetchLyrist(title, artist) {
  const path = artist
    ? `${encodeURIComponent(title)}/${encodeURIComponent(artist)}`
    : encodeURIComponent(title);
  const res = await http.get(`https://lyrist.vercel.app/api/${path}`, {
    timeout: 10000,
  });
  if (!res.data?.lyrics?.trim()) throw new Error("No lyrics from Lyrist");
  return {
    lyrics: res.data.lyrics.trim(),
    title: res.data.title || title,
    artist: res.data.artist || artist || "Unknown",
    source: "Lyrist",
  };
}

// Source 4: ChartLyrics — XML API, last resort
async function fetchChartLyrics(title, artist) {
  if (!artist) throw new Error("ChartLyrics requires artist");
  const res = await http.get(
    `http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(title)}`,
    { timeout: 10000 },
  );
  const xml = res.data;
  if (typeof xml !== "string") throw new Error("Invalid ChartLyrics response");
  const lyricsMatch = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/);
  const lyrics = lyricsMatch?.[1]?.trim();
  if (!lyrics || lyrics.length < 20)
    throw new Error("No lyrics in ChartLyrics");
  const titleMatch = xml.match(/<LyricSong>([\s\S]*?)<\/LyricSong>/);
  const artistMatch = xml.match(/<LyricArtist>([\s\S]*?)<\/LyricArtist>/);
  return {
    lyrics,
    title: titleMatch?.[1] || title,
    artist: artistMatch?.[1] || artist,
    source: "ChartLyrics",
  };
}

// Send lyrics — splits into chunks if over 4000 chars
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

  // Send in chunks
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
//  .lyrics COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS",
        `Usage: *${ENV.PREFIX}lyrics <song>*\n` +
          `With artist: *${ENV.PREFIX}lyrics <song> - <artist>*\n\n` +
          `Examples:\n` +
          `• ${ENV.PREFIX}lyrics Shape of You\n` +
          `• ${ENV.PREFIX}lyrics Japanese Denim - Daniel Caesar\n` +
          `• ${ENV.PREFIX}lyrics Essence - Wizkid\n` +
          `• ${ENV.PREFIX}lyrics Lose Yourself by Eminem`,
      ),
    });
  }

  const { title, artist } = parseQuery(fullArgs.trim());

  // Clean title of common noise words
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

  console.log(`[lyrics] title="${cleanTitle}" artist="${artist || "none"}"`);

  // Auto-resolve artist from JioSaavn if none provided
  let resolvedArtist = artist;
  if (!resolvedArtist) {
    try {
      const saavnRes = await http.get(
        `https://saavn.dev/api/search/songs?query=${encodeURIComponent(cleanTitle)}&page=1&limit=1`,
        { timeout: 8000 },
      );
      const track = saavnRes.data?.data?.results?.[0];
      if (track?.artists?.primary?.[0]?.name) {
        resolvedArtist = track.artists.primary[0].name;
        console.log(
          `[lyrics] Artist resolved from JioSaavn: ${resolvedArtist}`,
        );
      }
    } catch (_) {
      // Try Deezer
      try {
        const dzRes = await http.get(
          `https://api.deezer.com/search?q=${encodeURIComponent(cleanTitle)}&limit=1`,
          { timeout: 6000 },
        );
        const track = dzRes.data?.data?.[0];
        if (track?.artist?.name) {
          resolvedArtist = track.artist.name;
          console.log(
            `[lyrics] Artist resolved from Deezer: ${resolvedArtist}`,
          );
        }
      } catch (_) {}
    }
  }

  // Try all sources in order, stop at first success
  const sources = [
    {
      name: "Genius",
      fn: () => fetchGenius(cleanTitle, resolvedArtist),
    },
    {
      name: "Lyrics.ovh",
      fn: () => fetchLyricsOvh(cleanTitle, resolvedArtist),
    },
    {
      name: "Lyrist",
      fn: () => fetchLyrist(cleanTitle, resolvedArtist),
    },
    {
      name: "ChartLyrics",
      fn: () => fetchChartLyrics(cleanTitle, resolvedArtist),
    },
    // Last resort — try Genius with the original raw query
    {
      name: "Genius (raw query)",
      fn: () => fetchGenius(fullArgs.trim(), null),
    },
  ];

  for (const source of sources) {
    try {
      console.log(`[lyrics] Trying ${source.name}...`);
      const result = await Promise.race([
        source.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 12000),
        ),
      ]);

      if (result?.lyrics && result.lyrics.length > 30) {
        console.log(
          `[lyrics] ✅ Found via ${source.name}: ${result.lyrics.length} chars`,
        );
        await sendLyrics(sock, from, result);
        return;
      }
    } catch (err) {
      console.log(`[lyrics] ${source.name} failed: ${err.message}`);
    }
  }

  // Nothing worked
  await sock.sendMessage(from, {
    text: formatInfo(
      "LYRICS NOT FOUND",
      `Could not find lyrics for *"${cleanTitle}"*` +
        (resolvedArtist ? ` by *${resolvedArtist}*` : ``) +
        `.\n\n` +
        `💡 *Try:*\n` +
        `• Add artist: *${ENV.PREFIX}lyrics ${cleanTitle} - Artist Name*\n` +
        `• Full title: *${ENV.PREFIX}lyrics ${fullArgs.trim()}*\n` +
        `• Genius: *${ENV.PREFIX}genius ${cleanTitle}*\n\n` +
        TAG,
    ),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  .genius COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎤 GENIUS",
        `Usage: *${ENV.PREFIX}genius <song>*\nExample: *${ENV.PREFIX}genius Lose Yourself*`,
      ),
    });
  }

  const { title, artist } = parseQuery(fullArgs.trim());

  await sock.sendMessage(from, {
    text: `🔍 *Searching Genius for:* "${fullArgs}"...\n⏳ _Please wait..._`,
  });

  try {
    const result = await fetchGenius(title, artist);
    if (!result?.lyrics) throw new Error("Empty lyrics");
    await sendLyrics(sock, from, result);
  } catch (err) {
    // One retry with full raw query
    try {
      const result = await fetchGenius(fullArgs.trim(), null);
      if (!result?.lyrics) throw new Error("Empty");
      await sendLyrics(sock, from, result);
    } catch (_) {
      await sock.sendMessage(from, {
        text: formatError(
          "GENIUS FAILED",
          `Could not find lyrics for "${fullArgs}".\n` +
            `Error: ${err.message}\n\n` +
            `Try: *${ENV.PREFIX}lyrics ${fullArgs}*`,
        ),
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TRENDING
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });
    const res = await http.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      { timeout: 10000 },
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
//  SEARCH
// ════════════════════════════════════════════════════════════════════════════
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🔍 MUSIC SEARCH",
        `Usage: *${ENV.PREFIX}musicsearch <query>*\nExample: *${ENV.PREFIX}musicsearch Adele Hello*`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for:* "${fullArgs}"...`,
  });

  // Try JioSaavn first
  try {
    const res = await http.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(fullArgs)}&page=1&limit=8`,
      { timeout: 12000 },
    );
    const results = res.data?.data?.results;
    if (results?.length) {
      let text =
        `╔══════════════════════════╗\n` +
        `║   🔍 *SEARCH RESULTS*    ║\n` +
        `╚══════════════════════════╝\n\n`;
      results.forEach((t, i) => {
        const artists =
          t.artists?.primary?.map((a) => a.name).join(", ") || "Unknown";
        text += `${i + 1}. *${t.name}*\n   👤 ${artists} | ⏱️ ${fmtDur(t.duration)}\n\n`;
      });
      text += `💡 Use *${ENV.PREFIX}play <song>* to download\n\n${TAG}`;
      return sock.sendMessage(from, { text });
    }
  } catch (_) {}

  // Deezer fallback
  try {
    const res = await http.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=8`,
      { timeout: 10000 },
    );
    if (res.data?.data?.length) {
      let text =
        `╔══════════════════════════╗\n` +
        `║   🔍 *SEARCH RESULTS*    ║\n` +
        `╚══════════════════════════╝\n\n`;
      res.data.data.forEach((t, i) => {
        text += `${i + 1}. *${t.title}*\n   👤 ${t.artist.name} | ⏱️ ${fmtDur(t.duration)}\n\n`;
      });
      text += `💡 Use *${ENV.PREFIX}play <song>* to download\n\n${TAG}`;
      return sock.sendMessage(from, { text });
    }
  } catch (_) {}

  await sock.sendMessage(from, {
    text: formatError("NO RESULTS", `No results found for "${fullArgs}".`),
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  RANDOM
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding a random song...*" });
    const res = await http.get(
      "https://api.deezer.com/chart/0/tracks?limit=50",
      { timeout: 10000 },
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
//  ARTIST
// ════════════════════════════════════════════════════════════════════════════
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo("👤 ARTIST", `Usage: *${ENV.PREFIX}artist <name>*`),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `👤 *Searching artist:* "${fullArgs}"...`,
    });
    const searchRes = await http.get(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 10000 },
    );
    const artist = searchRes.data?.data?.[0];
    if (!artist) throw new Error("Artist not found");

    const tracksRes = await http.get(
      `https://api.deezer.com/artist/${artist.id}/top?limit=5`,
      { timeout: 8000 },
    );
    let topTracks = "";
    if (tracksRes.data?.data?.length) {
      topTracks =
        "\n\n🎵 *Top Tracks:*\n" +
        tracksRes.data.data
          .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
          .join("\n");
    }

    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║   👤 *ARTIST INFO*       ║\n` +
        `╚══════════════════════════╝\n\n` +
        `🎤 *Name:* ${artist.name}\n` +
        `👥 *Fans:* ${artist.nb_fan?.toLocaleString() || "N/A"}\n` +
        `🔗 *Link:* ${artist.link}\n` +
        topTracks +
        `\n\n${TAG}`,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Artist not found: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ALBUM
// ════════════════════════════════════════════════════════════════════════════
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo("💿 ALBUM", `Usage: *${ENV.PREFIX}album <name>*`),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `💿 *Searching album:* "${fullArgs}"...`,
    });
    const res = await http.get(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 10000 },
    );
    const album = res.data?.data?.[0];
    if (!album) throw new Error("Album not found");

    const tracksRes = await http.get(
      `https://api.deezer.com/album/${album.id}/tracks?limit=20`,
      { timeout: 8000 },
    );
    let tracklist = "";
    if (tracksRes.data?.data?.length) {
      tracklist =
        "\n\n📝 *Tracklist:*\n" +
        tracksRes.data.data
          .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
          .join("\n");
    }

    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║   💿 *ALBUM INFO*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `💿 *Album:* ${album.title}\n` +
        `👤 *Artist:* ${album.artist?.name}\n` +
        `📅 *Released:* ${album.release_date || "N/A"}\n` +
        `🎵 *Tracks:* ${album.nb_tracks || "N/A"}\n` +
        tracklist +
        `\n\n${TAG}`,
    });
  } catch (err) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Album not found: ${err.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN ROUTER
// ════════════════════════════════════════════════════════════════════════════
export async function music({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 MUSIC HUB",
        `*Commands:*\n\n` +
          `🎵 *${ENV.PREFIX}play <song>* — Download audio\n` +
          `📝 *${ENV.PREFIX}lyrics <song>* — Get lyrics\n` +
          `📝 *${ENV.PREFIX}lyrics <song> - <artist>* — With artist\n` +
          `📈 *${ENV.PREFIX}trending* — Top songs\n` +
          `🎲 *${ENV.PREFIX}random* — Random song\n` +
          `🔍 *${ENV.PREFIX}musicsearch <query>* — Search\n` +
          `👤 *${ENV.PREFIX}artist <name>* — Artist info\n` +
          `💿 *${ENV.PREFIX}album <name>* — Album info\n` +
          `🎤 *${ENV.PREFIX}genius <song>* — Genius lyrics\n\n` +
          `*Examples:*\n` +
          `• ${ENV.PREFIX}play Essence Wizkid\n` +
          `• ${ENV.PREFIX}lyrics Japanese Denim - Daniel Caesar\n\n` +
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
    case "artist":
      return musicArtist({ fullArgs: rest, from, sock });
    case "album":
      return musicAlbum({ fullArgs: rest, from, sock });
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
