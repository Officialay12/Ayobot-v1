// features/music.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Music Module (Fixed Download Edition)
//  Author  : AYOCODES
//
//  FIXES IN THIS VERSION:
//    - musicDownload/play: Actually downloads audio via multiple free APIs
//      (ytdl-api.vercel.app, yt-dlp-api, cobalt.tools, etc.)
//    - Sends the audio file directly to WhatsApp as PTT/audio
//    - Falls back gracefully through 5 different download services
//    - Lyrics: unchanged + still works with 4 fallback APIs
//    - musicLyrics: LOCAL_LYRICS removed (copyright) — all fetched live
//  — AYOCODES
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import * as cheerio from "cheerio";
import {
  formatData,
  formatError,
  formatInfo,
  formatSuccess,
} from "../utils/formatters.js";

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

// ─── Helper: format duration ──────────────────────────────────────────────────
function fmtDur(secs) {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
        await musicTrending({ from, sock });
        break;
      case "random":
        await musicRandom({ from, sock });
        break;
      case "artist":
        await musicArtist({
          fullArgs: fullArgs.replace(/^artist\s+/i, ""),
          from,
          sock,
        });
        break;
      case "album":
        await musicAlbum({
          fullArgs: fullArgs.replace(/^album\s+/i, ""),
          from,
          sock,
        });
        break;
      case "search":
        await musicSearch({
          fullArgs: fullArgs.replace(/^search\s+/i, ""),
          from,
          sock,
        });
        break;
      case "play":
      case "download":
        await musicDownload({
          fullArgs: fullArgs.replace(/^(play|download)\s+/i, ""),
          from,
          sock,
        });
        break;
      case "genius":
        await musicGenius({
          fullArgs: fullArgs.replace(/^genius\s+/i, ""),
          from,
          sock,
        });
        break;
      default:
        await musicLyrics({ fullArgs, from, sock });
    }
  } catch (e) {
    console.error("❌ Music error:", e);
    await sock.sendMessage(from, {
      text: formatError("MUSIC ERROR", e.message || "An error occurred."),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MUSIC DOWNLOAD — THE FIX
//  Tries 5 free APIs in sequence. First one that returns audio data wins.
//  Sends the audio directly to WhatsApp as an audio message. — AYOCODES
//
//  Download services tried (in order):
//    1. ytdl-api (Vercel free) — most reliable
//    2. yt-dlp REST API (Render hosted open source)
//    3. cobalt.tools — open source, no key needed
//    4. yt-search + ytdl-core API mirror
//    5. Fallback: send YouTube link + preview if all fail
// ════════════════════════════════════════════════════════════════════════════
export async function musicDownload({ fullArgs, from, sock }) {
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: formatInfo(
        "🎵 DOWNLOAD MUSIC",
        `Usage: .play <song name or YouTube URL>\n\n` +
          `Examples:\n• .play wildflower billie eilish\n• .play https://youtu.be/xxxxx\n\n` +
          `💡 First search with .search <query> then .play <song name>`,
      ),
    });
  }

  await sock.sendMessage(from, { text: `🔍 *Searching for "${fullArgs}"...*` });

  // ── Step 1: Find the YouTube video ID ────────────────────────────────────
  let videoId = null;
  let videoTitle = fullArgs;
  let videoArtist = "";
  let videoDuration = "";
  let videoThumb = null;

  // If a YouTube URL was passed, extract ID directly. — AYOCODES
  const ytUrlMatch = fullArgs.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytUrlMatch) {
    videoId = ytUrlMatch[1];
  } else {
    // Search YouTube via multiple free search APIs. — AYOCODES
    const searchApis = [
      async () => {
        const res = await axios.get(
          `https://yt.lemnoslife.com/noKey/search?part=snippet&q=${encodeURIComponent(fullArgs)}&type=video&maxResults=1`,
          { timeout: 8_000 },
        );
        const item = res.data?.items?.[0];
        if (!item) throw new Error("no results");
        return {
          id: item.id?.videoId,
          title: item.snippet?.title,
          channel: item.snippet?.channelTitle,
          thumb: item.snippet?.thumbnails?.high?.url,
        };
      },
      async () => {
        // YouTube search via RapidAPI — reliable with your key. — AYOCODES
        const { ENV } = await import("../../index.js");
        if (!ENV.RAPIDAPI_KEY) throw new Error("no rapidapi key");
        const res = await axios.get(
          `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(fullArgs)}&type=v&sort=r&next=`,
          {
            timeout: 8_000,
            headers: {
              "X-RapidAPI-Key": ENV.RAPIDAPI_KEY,
              "X-RapidAPI-Host": "youtube-search-and-download.p.rapidapi.com",
            },
          },
        );
        const item = res.data?.contents?.[0]?.video;
        if (!item?.videoId) throw new Error("no rapidapi results");
        return {
          id: item.videoId,
          title: item.title,
          channel: item.channelName,
          duration: item.lengthText,
          thumb: item.thumbnails?.[0]?.url,
        };
      },
      async () => {
        // Invidious public instance — no API key needed. — AYOCODES
        const res = await axios.get(
          `https://invidious.slipfox.xyz/api/v1/search?q=${encodeURIComponent(fullArgs)}&type=video`,
          { timeout: 8_000 },
        );
        const item = res.data?.[0];
        if (!item) throw new Error("no results");
        return {
          id: item.videoId,
          title: item.title,
          channel: item.author,
          duration: item.lengthSeconds,
          thumb: item.videoThumbnails?.[0]?.url,
        };
      },
      async () => {
        // Deezer search as last resort for title/artist. — AYOCODES
        const res = await axios.get(
          `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=1`,
          { timeout: 5_000 },
        );
        const item = res.data?.data?.[0];
        if (!item) throw new Error("no results");
        // Search YouTube with artist+title for better match. — AYOCODES
        const query = `${item.title} ${item.artist.name} official audio`;
        const res2 = await axios.get(
          `https://invidious.slipfox.xyz/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
          { timeout: 8_000 },
        );
        const v = res2.data?.[0];
        if (!v) throw new Error("no yt results");
        return {
          id: v.videoId,
          title: item.title,
          channel: item.artist.name,
          duration: item.duration,
          thumb: item.album?.cover_big,
        };
      },
    ];

    for (const api of searchApis) {
      try {
        const result = await api();
        if (result?.id) {
          videoId = result.id;
          videoTitle = result.title || fullArgs;
          videoArtist = result.channel || "";
          videoDuration = result.duration ? fmtDur(result.duration) : "";
          videoThumb = result.thumb;
          break;
        }
      } catch (_) {}
    }
  }

  if (!videoId) {
    return sock.sendMessage(from, {
      text: formatError(
        "NOT FOUND",
        `Could not find "${fullArgs}" on YouTube.\n\nTips:\n• Check spelling\n• Add artist name: .play ${fullArgs} - Artist\n• Try: .search ${fullArgs}`,
      ),
    });
  }

  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Send info card while downloading. — AYOCODES
  const infoMsg = await sock.sendMessage(from, {
    text:
      `🎵 *Found:* ${videoTitle}\n` +
      `${videoArtist ? `👤 ${videoArtist}\n` : ""}` +
      `${videoDuration ? `⏱️ ${videoDuration}\n` : ""}` +
      `🔗 ${ytUrl}\n\n` +
      `⬇️ *Downloading audio...*\n` +
      `_⚡ AYOBOT v1 by AYOCODES_`,
  });

  // ── Step 2: Download audio via free APIs ─────────────────────────────────
  // Each API returns a direct MP3/audio URL or a buffer. — AYOCODES
  const downloadApis = [
    // API 1: y2mate-like via zylalabs (free tier). — AYOCODES
    async () => {
      const res = await axios.get(
        `https://yt-mp3-api.vercel.app/api/download?url=${encodeURIComponent(ytUrl)}`,
        { timeout: 30_000, responseType: "arraybuffer" },
      );
      if (res.data?.byteLength > 10_000) return Buffer.from(res.data);
      throw new Error("empty response");
    },

    // API 2: Cobalt — open source, no key, supports YouTube MP3. — AYOCODES
    async () => {
      const res = await axios.post(
        "https://api.cobalt.tools/api/json",
        {
          url: ytUrl,
          vCodec: "mp3",
          aFormat: "mp3",
          isAudioOnly: true,
          disableMetadata: false,
        },
        {
          timeout: 30_000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );
      if (!res.data?.url) throw new Error("no url from cobalt");
      // Download the actual file. — AYOCODES
      const file = await axios.get(res.data.url, {
        timeout: 60_000,
        responseType: "arraybuffer",
      });
      if (file.data?.byteLength > 10_000) return Buffer.from(file.data);
      throw new Error("empty cobalt file");
    },

    // API 3: zotube API — free. — AYOCODES
    async () => {
      const res = await axios.get(
        `https://zotube.onrender.com/download?url=${encodeURIComponent(ytUrl)}&format=mp3`,
        { timeout: 30_000, responseType: "arraybuffer" },
      );
      if (res.data?.byteLength > 10_000) return Buffer.from(res.data);
      throw new Error("empty zotube");
    },

    // API 4: yt-dlp-api (community hosted). — AYOCODES
    async () => {
      const res = await axios.get(
        `https://yt-dlp-api.up.railway.app/audio?url=${encodeURIComponent(ytUrl)}`,
        { timeout: 45_000, responseType: "arraybuffer" },
      );
      if (res.data?.byteLength > 10_000) return Buffer.from(res.data);
      throw new Error("empty yt-dlp-api");
    },

    // API 5: y2mate alternate. — AYOCODES
    async () => {
      // Step 1: Get download link. — AYOCODES
      const step1 = await axios.post(
        "https://www.y2mate.com/mates/analyzeV2/ajax",
        new URLSearchParams({
          k_query: ytUrl,
          k_page: "mp3",
          hl: "en",
          q_auto: "0",
        }),
        {
          timeout: 15_000,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      const links = step1.data?.links?.mp3;
      if (!links) throw new Error("no y2mate links");
      const key = Object.keys(links)[0];
      const vid = step1.data?.vid;
      if (!key || !vid) throw new Error("no key/vid");

      // Step 2: Convert. — AYOCODES
      const step2 = await axios.post(
        "https://www.y2mate.com/mates/convertV2/index",
        new URLSearchParams({ vid, k: links[key].k }),
        {
          timeout: 30_000,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      const dlUrl = step2.data?.dlink;
      if (!dlUrl) throw new Error("no y2mate dlink");
      const file = await axios.get(dlUrl, {
        timeout: 60_000,
        responseType: "arraybuffer",
      });
      if (file.data?.byteLength > 10_000) return Buffer.from(file.data);
      throw new Error("empty y2mate file");
    },

    // API 6: Invidious audio stream (last resort, sends as URL). — AYOCODES
    async () => {
      const res = await axios.get(
        `https://invidious.slipfox.xyz/api/v1/videos/${videoId}`,
        { timeout: 10_000 },
      );
      const formats = res.data?.adaptiveFormats || [];
      const audio = formats.find(
        (f) => f.type?.includes("audio/") && !f.type?.includes("video/"),
      );
      if (!audio?.url) throw new Error("no invidious audio");
      const file = await axios.get(audio.url, {
        timeout: 60_000,
        responseType: "arraybuffer",
      });
      if (file.data?.byteLength > 10_000) return Buffer.from(file.data);
      throw new Error("empty invidious audio");
    },
  ];

  let audioBuffer = null;
  let usedApi = "";

  for (let i = 0; i < downloadApis.length; i++) {
    try {
      console.log(
        `🎵 [music] Trying download API ${i + 1}/${downloadApis.length}...`,
      );
      audioBuffer = await downloadApis[i]();
      usedApi = `API ${i + 1}`;
      if (audioBuffer) break;
    } catch (e) {
      console.log(`⚠️ [music] Download API ${i + 1} failed: ${e.message}`);
    }
  }

  // ── Step 3: Send result ───────────────────────────────────────────────────
  if (audioBuffer && audioBuffer.byteLength > 10_000) {
    const sizeMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`✅ [music] Downloaded ${sizeMB}MB via ${usedApi}`);

    // Send thumbnail first if available. — AYOCODES
    if (videoThumb) {
      try {
        await sock.sendMessage(from, {
          image: { url: videoThumb },
          caption: `🎵 *${videoTitle}*\n${videoArtist ? `👤 ${videoArtist}\n` : ""}${videoDuration ? `⏱️ ${videoDuration}\n` : ""}\n⚡ _AYOBOT v1 by AYOCODES_`,
        });
      } catch (_) {}
    }

    // Send the audio file. — AYOCODES
    await sock.sendMessage(
      from,
      {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
      },
      { quoted: infoMsg },
    );

    await sock.sendMessage(from, {
      text: `✅ *Downloaded!*\n🎵 ${videoTitle}\n📦 ${sizeMB} MB\n⚡ _AYOBOT v1 by AYOCODES_`,
    });
  } else {
    // All APIs failed — send the YouTube link as fallback. — AYOCODES
    await sock.sendMessage(
      from,
      {
        text:
          `🎵 *${videoTitle}*\n` +
          `${videoArtist ? `👤 ${videoArtist}\n` : ""}` +
          `\n🔗 *YouTube Link:*\n${ytUrl}\n\n` +
          `💡 _All download servers are currently busy. Open the link to listen._\n` +
          `⚡ _AYOBOT v1 by AYOCODES_`,
      },
      { quoted: infoMsg },
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LYRICS — 4 API fallbacks. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function musicLyrics({ fullArgs, from, sock }) {
  try {
    if (!fullArgs?.trim()) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎵 MUSIC LYRICS",
          `Usage: .lyrics <song name>\nWith artist: .lyrics <song> - <artist>\n\nExamples:\n• .lyrics Shape of You\n• .lyrics Perfect - Ed Sheeran`,
        ),
      });
    }

    let title = fullArgs.trim();
    let artist = null;
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      title = parts[0].trim();
      artist = parts[1].trim();
    }

    await sock.sendMessage(from, {
      text: `🎵 *Searching lyrics for "${title}"${artist ? ` by ${artist}` : ""}...*`,
    });

    // Check cache. — AYOCODES
    const cacheKey = `lyrics-${title.toLowerCase()}-${artist || ""}`;
    const cached = musicCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return sendLyricsResponse(sock, from, cached.data, true);
    }

    // Try all 4 APIs. — AYOCODES
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
      } catch (e) {
        console.log(`Lyrics API ${api.name} failed: ${e.message}`);
      }
    }

    // Last resort: at least get song info from Deezer. — AYOCODES
    try {
      const info = await fetchSongInfo(title, artist);
      if (info) {
        return sock.sendMessage(from, {
          text: formatInfo(
            "🎵 SONG FOUND",
            `*${info.title}*\nArtist: ${info.artist}\nAlbum: ${info.album || "Unknown"}\nYear: ${info.year || "Unknown"}\n\n_Lyrics not found but here's the song info._\n\nTry: .play ${title} to download it`,
          ),
        });
      }
    } catch (_) {}

    await sock.sendMessage(from, {
      text: formatInfo(
        "🎵 LYRICS NOT FOUND",
        `Could not find lyrics for "${title}"${artist ? ` by ${artist}` : ""}.\n\n💡 Tips:\n• Include artist: .lyrics ${title} - Artist Name\n• Check spelling\n• Try: .genius ${title}`,
      ),
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError("LYRICS ERROR", e.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TRENDING
// ════════════════════════════════════════════════════════════════════════════
export async function musicTrending({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "📊 *Fetching trending music...*" });

    const res = await axios.get(
      "https://api.deezer.com/chart/0/tracks?limit=10",
      { timeout: 8_000 },
    );
    if (!res.data?.data?.length) throw new Error("No trending data");

    let text = "📈 *TRENDING SONGS*\n\n";
    res.data.data.forEach((track, i) => {
      text +=
        `${i + 1}. *${track.title}*\n` +
        `   👤 ${track.artist.name}\n` +
        `   💿 ${track.album.title}\n` +
        `   ⏱️ ${fmtDur(track.duration)}\n` +
        `   🔥 Rank: ${track.rank?.toLocaleString() || "N/A"}\n` +
        (track.preview ? `   🎧 Preview: ${track.preview}\n` : "") +
        `\n`;
    });
    text += `\n💡 Use .play <song name> to download any song`;
    await sock.sendMessage(from, {
      text: formatSuccess("🔥 TRENDING NOW", text),
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch trending: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  RANDOM
// ════════════════════════════════════════════════════════════════════════════
export async function musicRandom({ from, sock }) {
  try {
    await sock.sendMessage(from, { text: "🎲 *Finding random song...*" });
    const res = await axios.get(
      "https://api.deezer.com/chart/0/tracks?limit=50",
      { timeout: 5_000 },
    );
    if (!res.data?.data?.length) throw new Error("No data");
    const track =
      res.data.data[Math.floor(Math.random() * res.data.data.length)];
    const info = {
      "🎵 Title": track.title,
      "👤 Artist": track.artist.name,
      "💿 Album": track.album.title,
      "⏱️ Duration": fmtDur(track.duration),
      "🔥 Rank": track.rank?.toLocaleString() || "N/A",
    };
    if (track.preview) info["🎧 Preview"] = track.preview;
    await sock.sendMessage(from, {
      text:
        formatData("🎲 RANDOM SONG", info) +
        `\n\n💡 Use .play ${track.title} to download`,
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not fetch random song: ${e.message}`),
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
        "Usage: .artist <name>\nExample: .artist Ed Sheeran",
      ),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `👤 *Searching for artist: ${fullArgs}...*`,
    });
    const search = await axios.get(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 8_000 },
    );
    if (!search.data?.data?.length) throw new Error("Artist not found");

    const artist = search.data.data[0];
    const [tracks, albums] = await Promise.allSettled([
      axios.get(`https://api.deezer.com/artist/${artist.id}/top?limit=5`, {
        timeout: 5_000,
      }),
      axios.get(`https://api.deezer.com/artist/${artist.id}/albums?limit=1`, {
        timeout: 5_000,
      }),
    ]);

    let topTracks = "";
    if (tracks.status === "fulfilled" && tracks.value.data?.data?.length) {
      topTracks =
        "\n\n*🎵 Top Tracks:*\n" +
        tracks.value.data.data
          .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
          .join("\n");
    }

    await sock.sendMessage(from, {
      text:
        formatData("👤 ARTIST INFORMATION", {
          "👤 Name": artist.name,
          "👥 Fans": artist.nb_fan?.toLocaleString() || "N/A",
          "💿 Total Albums":
            albums.status === "fulfilled"
              ? albums.value.data?.total || "N/A"
              : "N/A",
          "🔗 Link": artist.link,
        }) + topTracks,
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find artist "${fullArgs}": ${e.message}`,
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
        "Usage: .album <name>\nExample: .album Divide",
      ),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `💿 *Searching for album: ${fullArgs}...*`,
    });
    const res = await axios.get(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(fullArgs)}&limit=1`,
      { timeout: 8_000 },
    );
    if (!res.data?.data?.length) throw new Error("Album not found");

    const album = res.data.data[0];
    const tracks = await axios.get(
      `https://api.deezer.com/album/${album.id}/tracks?limit=20`,
      { timeout: 5_000 },
    );

    let tracklist = "";
    if (tracks.data?.data?.length) {
      tracklist =
        "\n\n*📝 Tracklist:*\n" +
        tracks.data.data
          .map((t, i) => `${i + 1}. ${t.title} (${fmtDur(t.duration)})`)
          .join("\n");
      if (tracks.data.total > tracks.data.data.length) {
        tracklist += `\n... and ${tracks.data.total - tracks.data.data.length} more`;
      }
    }

    await sock.sendMessage(from, {
      text:
        formatData("💿 ALBUM INFORMATION", {
          "💿 Album": album.title,
          "👤 Artist": album.artist.name,
          "📅 Released": album.release_date || "N/A",
          "🎵 Tracks": album.nb_tracks || tracks.data?.total || "N/A",
          "🔗 Link": album.link,
        }) + tracklist,
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find album "${fullArgs}": ${e.message}`,
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
        "Usage: .search <query>\nExample: .search Adele Hello",
      ),
    });
  }
  try {
    await sock.sendMessage(from, {
      text: `🔍 *Searching for: ${fullArgs}...*`,
    });
    const res = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(fullArgs)}&limit=8`,
      { timeout: 8_000 },
    );
    if (!res.data?.data?.length) throw new Error("No results");

    let text = "🔍 *SEARCH RESULTS*\n\n";
    res.data.data.forEach((t, i) => {
      text +=
        `${i + 1}. *${t.title}*\n` +
        `   👤 ${t.artist.name}\n` +
        `   💿 ${t.album.title}\n` +
        `   ⏱️ ${fmtDur(t.duration)}\n\n`;
    });
    text += `\n💡 Use .play <song name> to download`;

    await sock.sendMessage(from, {
      text: formatSuccess("🔍 MUSIC SEARCH", text),
    });
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `No results for "${fullArgs}": ${e.message}`),
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
        "Usage: .genius <song>\nExample: .genius Lose Yourself",
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
  } catch (e) {
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Could not find lyrics on Genius for "${fullArgs}": ${e.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  INTERNAL API HELPERS
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
    return {
      title: t.title,
      artist: t.artist.name,
      album: t.album.title,
      year: t.release_date ? new Date(t.release_date).getFullYear() : null,
    };
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
  if (!artist) {
    const res = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(title)}&limit=1`,
      { timeout: 5_000 },
    );
    artist = res.data?.data?.[0]?.artist?.name || "unknown";
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
    { timeout: 8_000 },
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
    timeout: 10_000,
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

  if (!lyrics) throw new Error("Genius lyrics not parseable");
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

  // Truncate if too long. — AYOCODES
  if (clean.length > 4000) {
    const cut = clean.lastIndexOf("\n", 3800);
    clean =
      clean.substring(0, cut > 3000 ? cut : 3800) +
      `\n\n... _[Lyrics truncated${url ? `. Full lyrics: ${url}` : ""}]_`;
  }

  await sock.sendMessage(from, {
    text:
      `🎵 *${title}*${artist ? ` by *${artist}*` : ""}\n` +
      `${source ? `📡 _Source: ${source}${fromCache ? " (cached)" : ""}_\n` : ""}` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      clean +
      `\n\n━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ _AYOBOT v1 by AYOCODES_`,
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
        `🎵 *.play <song>* — Download & send audio\n` +
        `📝 *.lyrics <song>* — Get lyrics\n` +
        `📝 *.lyrics <song> - <artist>* — Lyrics with artist\n` +
        `📈 *.trending* — Top 10 trending songs\n` +
        `🎲 *.random* — Random song info\n` +
        `🔍 *.search <query>* — Search songs\n` +
        `👤 *.artist <name>* — Artist info\n` +
        `💿 *.album <name>* — Album + tracklist\n` +
        `🎤 *.genius <song>* — Genius lyrics\n\n` +
        `*Examples:*\n` +
        `• .play wildflower billie eilish\n` +
        `• .lyrics Perfect - Ed Sheeran\n` +
        `• .search Drake God's Plan\n` +
        `• .artist Burna Boy\n\n` +
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
