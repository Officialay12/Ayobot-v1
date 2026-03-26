// features/music.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE WORKING MUSIC MODULE
//  Author: AYOCODES
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

// ─── Invidious instances (working) ──────────────────────────────────────────
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
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

const AYOBOT_TAG = `⚡ _AYOBOT v1 by AYOCODES_`;

// ─── Cache ──────────────────────────────────────────────────────────────────
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

function fmtDur(secs) {
  if (!secs || isNaN(parseInt(secs))) return "N/A";
  const total = parseInt(secs);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function downloadBuffer(url, timeout = 60_000, maxSize = 80 * 1024 * 1024) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout,
        maxContentLength: maxSize,
        maxRedirects: 10,
        headers: { ...BROWSER_HEADERS, Accept: "*/*", Range: "bytes=0-" },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 5000) throw new Error(`Buffer too small (${buf.length} bytes)`);
      return buf;
    } catch (err) {
      lastErr = err;
      console.log(`[music] Download attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
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
      case "trending": case "top": return musicTrending({ from, sock });
      case "random": return musicRandom({ from, sock });
      case "artist": return musicArtist({ fullArgs: fullArgs.replace(/^artist\s+/i, ""), from, sock });
      case "album": return musicAlbum({ fullArgs: fullArgs.replace(/^album\s+/i, ""), from, sock });
      case "search": return musicSearch({ fullArgs: fullArgs.replace(/^search\s+/i, ""), from, sock });
      case "play": case "download": return musicDownload({ fullArgs: fullArgs.replace(/^(play|download)\s+/i, ""), from, sock });
      case "genius": return musicGenius({ fullArgs: fullArgs.replace(/^genius\s+/i, ""), from, sock });
      default: return musicLyrics({ fullArgs, from, sock });
    }
  } catch (err) {
    console.error("❌ Music error:", err);
    await sock.sendMessage(from, { text: formatError("MUSIC ERROR", err.message || "An error occurred.") });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MUSIC DOWNLOAD
// ════════════════════════════════════════════════════════════════════════════
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo("🎵 DOWNLOAD MUSIC",
        `Usage: ${ENV.PREFIX}play <song name or URL>\n\nExamples:\n• ${ENV.PREFIX}play wildflower billie eilish\n• ${ENV.PREFIX}play Essence Wizkid\n\n💡 Search first: ${ENV.PREFIX}musicsearch <query>`),
    });
  }

  const query = fullArgs.trim();
  await sock.sendMessage(from, { text: `🔍 *Searching for "${query}"...*` });

  let songInfo = null;

  // Try JioSaavn first
  try {
    const res = await axios.get(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=5`, { timeout: 10_000 });
    const track = res.data?.data?.results?.[0];
    if (track) {
      const audioUrl = track.downloadUrl?.find((d) => d.quality === "320kbps")?.url ||
                       track.downloadUrl?.find((d) => d.quality === "160kbps")?.url ||
                       track.downloadUrl?.[0]?.url;
      songInfo = {
        id: null,
        title: track.name,
        artist: track.artists?.primary?.map((a) => a.name).join(", ") || "Unknown",
        duration: track.duration,
        thumbnail: track.image?.find((i) => i.quality === "500x500")?.url || track.image?.[0]?.url,
        audioUrl,
        source: "JioSaavn",
        url: track.url,
      };
      console.log(`[music] JioSaavn found: ${songInfo.title}`);
    }
  } catch (err) {
    console.log(`[music] JioSaavn failed: ${err.message}`);
  }

  // Try Deezer
  if (!songInfo) {
    try {
      const res = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`, { timeout: 8_000 });
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
        console.log(`[music] Deezer found: ${songInfo.title}`);
      }
    } catch (err) {
      console.log(`[music] Deezer failed: ${err.message}`);
    }
  }

  // Try YouTube via Invidious
  if (!songInfo) {
    for (const instance of INVIDIOUS_INSTANCES) {
      try {
        const res = await axios.get(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 7_000 });
        const v = res.data?.[0];
        if (v?.videoId) {
          songInfo = {
            id: v.videoId,
            title: v.title,
            artist: v.author || "Unknown",
            duration: v.lengthSeconds,
            thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
            source: "YouTube",
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
          };
          console.log(`[music] YouTube found: ${songInfo.title}`);
          break;
        }
      } catch (_) {}
    }
  }

  if (!songInfo) {
    return sock.sendMessage(from, {
      text: formatError("NOT FOUND",
        `Could not find "${query}" on any music service.\n\n` +
        `Tips:\n• Check spelling\n• Try: ${ENV.PREFIX}musicsearch ${query}\n• Try with artist: ${query} - Artist Name`),
    });
  }

  await sock.sendMessage(from, {
    text: `🎵 *Found:* ${songInfo.title}\n👤 *Artist:* ${songInfo.artist}\n📡 *Source:* ${songInfo.source}\n\n⬇️ *Downloading...*`
  });

  let audioBuffer = null;
  let usedApi = "";
  let isPreview = false;

  // Try direct audio URL
  if (!audioBuffer && songInfo.audioUrl) {
    try {
      audioBuffer = await downloadBuffer(songInfo.audioUrl, 60_000);
      usedApi = "JioSaavn";
    } catch (err) {
      console.log(`[music] Direct URL failed: ${err.message}`);
    }
  }

  // Try Deezer preview
  if (!audioBuffer && songInfo.preview) {
    try {
      audioBuffer = await downloadBuffer(songInfo.preview, 30_000);
      usedApi = "Deezer Preview";
      isPreview = true;
    } catch (err) {
      console.log(`[music] Deezer preview failed: ${err.message}`);
    }
  }

  // Try YouTube download
  if (!audioBuffer && songInfo.id) {
    try {
      const ytUrl = `https://www.youtube.com/watch?v=${songInfo.id}`;
      const res = await axios.post("https://api.cobalt.tools/api/json", {
        url: ytUrl,
        isAudioOnly: true,
        aFormat: "mp3",
      }, {
        headers: { "Content-Type": "application/json" },
        timeout: 20_000,
      });
      if (res.data?.url) {
        audioBuffer = await downloadBuffer(res.data.url, 60_000);
        usedApi = "YouTube (cobalt)";
      }
    } catch (err) {
      console.log(`[music] YouTube download failed: ${err.message}`);
    }
  }

  if (audioBuffer && audioBuffer.length > 5000) {
    if (songInfo.thumbnail) {
      try {
        await sock.sendMessage(from, {
          image: { url: songInfo.thumbnail },
          caption: `🎵 *${songInfo.title}*\n👤 *${songInfo.artist}*\n${isPreview ? "⚠️ _Preview only_\n" : ""}${AYOBOT_TAG}`,
        });
      } catch (_) {}
    }

    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: false,
    });

    await sock.sendMessage(from, {
      text: `${isPreview ? "⚠️ *Preview* (30 sec)\n" : "✅ *Downloaded!*\n"}🎵 *${songInfo.title}* - ${songInfo.artist}\n📦 ${fmtSize(audioBuffer.length)} | 🔧 ${usedApi}\n${AYOBOT_TAG}`,
    });
  } else {
    await sock.sendMessage(from, {
      text: `🎵 *${songInfo.title}*\n👤 ${songInfo.artist}\n\n🔗 *Listen here:*\n${songInfo.url}\n\n⚠️ _Could not download audio. Try the link above._\n${AYOBOT_TAG}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LYRICS - IMPROVED
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  try {
    if (!fullArgs?.trim()) {
      return sock.sendMessage(from, {
        text: formatInfo("🎵 MUSIC LYRICS",
          `Usage: ${ENV.PREFIX}lyrics <song name>\nWith artist: ${ENV.PREFIX}lyrics <song> - <artist>\n\nExamples:\n• ${ENV.PREFIX}lyrics Shape of You\n• ${ENV.PREFIX}lyrics Japanese Denim - Daniel Caesar`),
      });
    }

    let title = fullArgs.trim();
    let artist = null;

    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      title = parts[0].trim();
      artist = parts.slice(1).join(" - ").trim();
    }

    if (!artist && title.toLowerCase().includes(" by ")) {
      const parts = title.split(/ by /i);
      title = parts[0].trim();
      artist = parts[1].trim();
    }

    // Clean title
    title = title.replace(/\(official\s+(?:video|audio|lyrics)\)/gi, "")
      .replace(/\(lyrics?\)/gi, "").replace(/\[.*?\]/g, "").trim();

    await sock.sendMessage(from, { text: `🎵 *Searching lyrics for "${title}"${artist ? ` by ${artist}` : ""}...*` });

    const cacheKey = `lyrics-${title.toLowerCase()}-${(artist || "").toLowerCase()}`;
    const cached = musicCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30 * 60_000) {
      return sendLyricsResponse(sock, from, cached.data, true);
    }

    const apis = [
      { name: "Genius", fn: () => fetchFromGenius(title, artist) },
      { name: "Lyrist", fn: () => fetchFromLyrist(title, artist) },
      { name: "LyricsOvh", fn: () => fetchFromLyricsOvh(title, artist) },
    ];

    for (const api of apis) {
      try {
        const result = await Promise.race([api.fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10_000))]);
        if (result?.lyrics && result.lyrics.length > 50) {
          musicCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return sendLyricsResponse(sock, from, result);
        }
      } catch (err) {
        console.log(`[music] ${api.name} failed: ${err.message}`);
      }
    }

    await sock.sendMessage(from, {
      text: formatInfo("🎵 LYRICS NOT FOUND",
        `Could not find lyrics for "${title}"${artist ? ` by ${artist}` : ""}.\n\n` +
        `💡 *Tips:*\n• Include artist: ${ENV.PREFIX}lyrics ${title} - Artist Name\n• Try: ${ENV.PREFIX}genius ${title}\n• Example: ${ENV.PREFIX}lyrics Japanese Denim - Daniel Caesar`),
    });
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("LYRICS ERROR", err.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  GENIUS LYRICS
// ════════════════════════════════════════════════════════════════════════════
export async function musicGenius({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo("🎤 GENIUS LYRICS", `Usage: ${ENV.PREFIX}genius <song>\nExample: ${ENV.PREFIX}genius Lose Yourself`),
    });
  }
  try {
    await sock.sendMessage(from, { text: `🔍 *Searching Genius for: ${fullArgs}...*` });
    const result = await fetchFromGenius(fullArgs);
    if (!result?.lyrics) throw new Error("No lyrics found");
    await sendLyricsResponse(sock, from, result);
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not find lyrics: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TRENDING
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });
    const res = await axios.get("https://api.deezer.com/chart/0/tracks?limit=10", { timeout: 8_000 });
    if (res.data?.data?.length) {
      let text = "📈 *TRENDING SONGS (Deezer Global)*\n\n";
      res.data.data.forEach((t, i) => {
        text += `${i + 1}. *${t.title}*\n   👤 ${t.artist.name}\n   ⏱️ ${fmtDur(t.duration)}\n\n`;
      });
      text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
      return sock.sendMessage(from, { text: formatSuccess("🔥 TRENDING NOW", text) });
    }
    throw new Error("No trending data");
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not fetch trending: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════════════════════════════════════
export async function musicSearch({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo("🔍 MUSIC SEARCH", `Usage: ${ENV.PREFIX}musicsearch <query>\nExample: ${ENV.PREFIX}musicsearch Adele Hello`),
    });
  }

  try {
    await sock.sendMessage(from, { text: `🔍 *Searching for: ${fullArgs}...*` });

    // Try JioSaavn
    try {
      const res = await axios.get(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(fullArgs)}&page=1&limit=8`, { timeout: 10_000 });
      const results = res.data?.data?.results;
      if (results?.length) {
        let text = "🔍 *SEARCH RESULTS (JioSaavn)*\n\n";
        results.forEach((t, i) => {
          const artists = t.artists?.primary?.map((a) => a.name).join(", ") || "Unknown";
          text += `${i + 1}. *${t.name}*\n   👤 ${artists}\n   ⏱️ ${fmtDur(t.duration)}\n\n`;
        });
        text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
        return sock.sendMessage(from, { text: formatSuccess("🔍 MUSIC SEARCH", text) });
      }
    } catch (err) {
      console.log(`[music] JioSaavn search failed: ${err.message}`);
    }

    // Try Deezer
    try {
      const res = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=8`, { timeout: 8_000 });
      if (res.data?.data?.length) {
        let text = "🔍 *SEARCH RESULTS (Deezer)*\n\n";
        res.data.data.forEach((t, i) => {
          text += `${i + 1}. *${t.title}*\n   👤 ${t.artist.name}\n   ⏱️ ${fmtDur(t.duration)}\n\n`;
        });
        text += `💡 Use ${ENV.PREFIX}play <song name> to download\n\n${AYOBOT_TAG}`;
        return sock.sendMessage(from, { text: formatSuccess("🔍 MUSIC SEARCH", text) });
      }
    } catch (err) {
      console.log(`[music] Deezer search failed: ${err.message}`);
    }

    throw new Error("No results");
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `No results for "${fullArgs}": ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  RANDOM
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding random song...*" });
    const res = await axios.get("https://api.deezer.com/chart/0/tracks?limit=50", { timeout: 8_000 });
    if (res.data?.data?.length) {
      const t = res.data.data[Math.floor(Math.random() * res.data.data.length)];
      return sock.sendMessage(from, {
        text: formatData("🎲 RANDOM SONG", {
          "🎵 Title": t.title,
          "👤 Artist": t.artist.name,
          "⏱️ Duration": fmtDur(t.duration),
        }) + `\n\n💡 Use ${ENV.PREFIX}play ${t.title} to download\n\n${AYOBOT_TAG}`,
      });
    }
    throw new Error("No data");
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not fetch random song: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ARTIST
// ════════════════════════════════════════════════════════════════════════════
export async function musicArtist({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, { text: formatInfo("👤 ARTIST INFO", `Usage: ${ENV.PREFIX}artist <name>`), });
  }
  try {
    await sock.sendMessage(from, { text: `👤 *Searching for artist: ${fullArgs}...*` });
    const searchRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(fullArgs)}&limit=1`, { timeout: 8_000 });
    if (searchRes.data?.data?.length) {
      const artist = searchRes.data.data[0];
      const tracksRes = await axios.get(`https://api.deezer.com/artist/${artist.id}/top?limit=5`, { timeout: 5_000 });
      let topTracks = "";
      if (tracksRes.data?.data?.length) {
        topTracks = "\n\n*🎵 Top Tracks:*\n" + tracksRes.data.data.map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`).join("\n");
      }
      return sock.sendMessage(from, {
        text: formatData("👤 ARTIST INFORMATION", {
          "👤 Name": artist.name,
          "👥 Fans": artist.nb_fan?.toLocaleString() || "N/A",
          "🔗 Link": artist.link,
        }) + topTracks + `\n\n${AYOBOT_TAG}`,
      });
    }
    throw new Error("Artist not found");
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not find artist: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ALBUM
// ════════════════════════════════════════════════════════════════════════════
export async function musicAlbum({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, { text: formatInfo("💿 ALBUM INFO", `Usage: ${ENV.PREFIX}album <name>`), });
  }
  try {
    await sock.sendMessage(from, { text: `💿 *Searching for album: ${fullArgs}...*` });
    const res = await axios.get(`https://api.deezer.com/search/album?q=${encodeURIComponent(fullArgs)}&limit=1`, { timeout: 8_000 });
    if (res.data?.data?.length) {
      const album = res.data.data[0];
      const tracksRes = await axios.get(`https://api.deezer.com/album/${album.id}/tracks?limit=20`, { timeout: 5_000 });
      let tracklist = "";
      if (tracksRes.data?.data?.length) {
        tracklist = "\n\n*📝 Tracklist:*\n" + tracksRes.data.data.map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`).join("\n");
      }
      return sock.sendMessage(from, {
        text: formatData("💿 ALBUM INFORMATION", {
          "💿 Album": album.title,
          "👤 Artist": album.artist.name,
          "📅 Released": album.release_date || "N/A",
          "🎵 Tracks": album.nb_tracks || "N/A",
        }) + tracklist + `\n\n${AYOBOT_TAG}`,
      });
    }
    throw new Error("Album not found");
  } catch (err) {
    await sock.sendMessage(from, { text: formatError("ERROR", `Could not find album: ${err.message}`) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════════════
async function fetchFromGenius(title, artist) {
  const q = artist ? `${title} ${artist}` : title;
  const res = await axios.get(`https://genius.com/api/search/multi?q=${encodeURIComponent(q)}`, {
    timeout: 12_000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  const hits = res.data?.response?.sections?.flatMap((s) => s.hits).filter((h) => h.type === "song");
  if (!hits?.length) throw new Error("No results");

  let hit = hits[0];
  if (artist) {
    const match = hits.find((h) => h.result.artist_names?.toLowerCase().includes(artist.toLowerCase()));
    if (match) hit = match;
  }

  const page = await axios.get(hit.result.url, {
    timeout: 12_000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const $ = cheerio.load(page.data);
  let lyrics = $('[data-lyrics-container="true"]').text() || $(".lyrics").text() || $(".song_body-lyrics").text();
  if (!lyrics?.trim()) throw new Error("No lyrics found");
  lyrics = lyrics.replace(/\[.*?\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { lyrics, title: hit.result.title, artist: hit.result.artist_names, source: "Genius" };
}

async function fetchFromLyrist(title, artist) {
  const q = artist ? `${title}/${artist}` : title;
  const res = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(q)}`, { timeout: 8_000 });
  if (!res.data?.lyrics) throw new Error("No lyrics");
  return { lyrics: res.data.lyrics, title: res.data.title || title, artist: res.data.artist || artist || "Unknown", source: "Lyrist" };
}

async function fetchFromLyricsOvh(title, artist) {
  if (!artist) {
    try {
      const res = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(title)}&limit=1`, { timeout: 5_000 });
      artist = res.data?.data?.[0]?.artist?.name || "unknown";
    } catch (_) { artist = "unknown"; }
  }
  const res = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 8_000 });
  if (!res.data?.lyrics) throw new Error("No lyrics");
  return { lyrics: res.data.lyrics, title, artist, source: "Lyrics.ovh" };
}

async function sendLyricsResponse(sock, from, data, fromCache = false) {
  let clean = data.lyrics.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#x27;|&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length > 4000) {
    const cut = clean.lastIndexOf("\n", 3800);
    clean = clean.substring(0, cut > 3000 ? cut : 3800) + `\n\n_...[Lyrics truncated]_`;
  }
  await sock.sendMessage(from, {
    text: `🎵 *${data.title}*${data.artist ? ` by *${data.artist}*` : ""}\n📡 _Source: ${data.source}${fromCache ? " (cached)" : ""}_\n━━━━━━━━━━━━━━━━━━━━━\n\n${clean}\n\n━━━━━━━━━━━━━━━━━━━━━\n${AYOBOT_TAG}`,
  });
}

async function showMusicHelp(from, sock) {
  await sock.sendMessage(from, {
    text: formatInfo("🎵 MUSIC HUB",
      `*Music Commands:*\n\n🎵 *${ENV.PREFIX}play <song>* — Download audio\n📝 *${ENV.PREFIX}lyrics <song>* — Get lyrics\n📈 *${ENV.PREFIX}trending* — Top songs\n🎲 *${ENV.PREFIX}random* — Random song\n🔍 *${ENV.PREFIX}musicsearch <query>* — Search\n👤 *${ENV.PREFIX}artist <name>* — Artist info\n💿 *${ENV.PREFIX}album <name>* — Album info\n🎤 *${ENV.PREFIX}genius <song>* — Genius lyrics\n\n*Examples:*\n• ${ENV.PREFIX}play wildflower billie eilish\n• ${ENV.PREFIX}lyrics Japanese Denim - Daniel Caesar\n\n⚡ AYOBOT v1 | 👑 AYOCODES`),
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
