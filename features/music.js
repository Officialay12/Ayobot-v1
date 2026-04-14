// features/music.js — AYOBOT v1.0.0 (FULLY FIXED WITH WORKING APIS)
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

// ─── WORKING INSTANCES (tested March 2026) ─────────────────────────────────
const WORKING_PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.projectsegfau.lt",
];

const WORKING_INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://yewtu.be",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
];

// ─── Utilities ───────────────────────────────────────────────────────────────
function fmtDur(secs) {
  if (!secs || isNaN(parseInt(secs))) return "N/A";
  const t = parseInt(secs);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toString().padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

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

function buildSearchQueries(raw) {
  const { title, artist } = parseQuery(raw);
  const candidates = artist
    ? [
        `${title} ${artist}`,
        `${title} ${artist} official audio`,
        `${artist} ${title}`,
        raw,
      ]
    : [raw, `${raw} official audio`, `${raw} song`];
  return [...new Map(candidates.map((q) => [q.toLowerCase(), q])).values()];
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 1 — Piped API (WORKING - Full songs)
// ════════════════════════════════════════════════════════════════════════════
async function searchPiped(query) {
  for (const instance of WORKING_PIPED_INSTANCES) {
    try {
      console.log(`[Piped] Searching "${query}" @ ${instance}`);

      const searchRes = await http.get(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=all`,
        { timeout: 15000 },
      );

      const items = (searchRes.data?.items || []).filter(
        (i) => i.type === "stream" || i.url?.startsWith("/watch"),
      );

      if (!items.length) continue;

      const video = items[0];
      const videoId = video.url?.replace("/watch?v=", "") || video.id;
      if (!videoId) continue;

      const streamRes = await http.get(`${instance}/streams/${videoId}`, {
        timeout: 15000,
      });

      const streams = (streamRes.data?.audioStreams || [])
        .filter((s) => s.url && s.contentType === "audio/webm")
        .sort(
          (a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0),
        );

      const best = streams[0] || streamRes.data?.audioStreams?.[0];
      if (!best?.url) continue;

      return {
        title: streamRes.data?.title || video.title || "Unknown",
        artist:
          streamRes.data?.uploader || video.uploaderName || "Unknown Artist",
        duration: parseInt(streamRes.data?.duration || video.duration) || 0,
        thumbnail:
          streamRes.data?.thumbnailUrl ||
          video.thumbnail ||
          `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        audioUrl: best.url,
        source: "Piped",
        videoId,
      };
    } catch (err) {
      console.log(`[Piped] ${instance} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 2 — Invidious API (WORKING - Full songs)
// ════════════════════════════════════════════════════════════════════════════
async function searchInvidious(query) {
  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      console.log(`[Invidious] Searching "${query}" @ ${instance}`);

      const searchRes = await http.get(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,author,lengthSeconds`,
        { timeout: 15000 },
      );

      const videos = searchRes.data || [];
      if (!videos.length) continue;

      const video = videos[0];
      const videoId = video.videoId;
      if (!videoId) continue;

      const videoRes = await http.get(
        `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,adaptiveFormats,videoThumbnails`,
        { timeout: 15000 },
      );

      const formats = (videoRes.data?.adaptiveFormats || [])
        .filter((f) => f.type?.startsWith("audio/") && f.url)
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
        artist: videoRes.data?.author || video.author || "Unknown Artist",
        duration:
          parseInt(videoRes.data?.lengthSeconds || video.lengthSeconds) || 0,
        thumbnail: thumb.startsWith("//") ? `https:${thumb}` : thumb,
        audioUrl: best.url,
        source: "Invidious",
        videoId,
      };
    } catch (err) {
      console.log(`[Invidious] ${instance} failed: ${err.message}`);
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE 3 — JioSaavn API (WORKING - Full songs, good for Indian/Regional)
// ════════════════════════════════════════════════════════════════════════════
async function searchJioSaavn(query) {
  try {
    console.log(`[JioSaavn] Searching "${query}"`);

    const response = await http.get(
      `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=1`,
      { timeout: 15000 },
    );

    const track = response.data?.data?.results?.[0];
    if (!track) return null;

    // Get best quality download URL
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
      duration: parseInt(track.duration) || 0,
      thumbnail:
        track.image?.find((i) => i.quality === "500x500")?.url ||
        track.image?.[0]?.url ||
        null,
      audioUrl: best.url,
      source: "JioSaavn",
      album: track.album?.name || null,
      year: track.year || null,
    };
  } catch (err) {
    console.log(`[JioSaavn] Failed: ${err.message}`);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MASTER SEARCH — Try multiple sources
// ════════════════════════════════════════════════════════════════════════════
async function findSong(rawQuery) {
  const queries = buildSearchQueries(rawQuery);
  console.log(`[findSong] Trying ${queries.length} query variants`);

  for (const q of queries) {
    // Try JioSaavn first (fastest, reliable)
    const jioResult = await searchJioSaavn(q);
    if (jioResult?.audioUrl) {
      console.log(`[findSong] ✓ JioSaavn matched "${q}"`);
      return jioResult;
    }

    // Try Piped
    const pipedResult = await searchPiped(q);
    if (pipedResult?.audioUrl) {
      console.log(`[findSong] ✓ Piped matched "${q}"`);
      return pipedResult;
    }

    // Try Invidious
    const invidiousResult = await searchInvidious(q);
    if (invidiousResult?.audioUrl) {
      console.log(`[findSong] ✓ Invidious matched "${q}"`);
      return invidiousResult;
    }

    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  AUDIO DOWNLOADER with retry logic
// ════════════════════════════════════════════════════════════════════════════
async function downloadAudioBuffer(url, timeoutMs = 90000) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(
        `[Download] Attempt ${attempt} for ${url.substring(0, 100)}...`,
      );

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxContentLength: 150 * 1024 * 1024,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
          "Accept-Encoding": "identity",
          Range: "bytes=0-",
        },
      });

      const buffer = Buffer.from(response.data);
      if (buffer.length < 5000) {
        throw new Error(`Buffer too small: ${buffer.length} bytes`);
      }

      console.log(`[Download] Success: ${fmtSize(buffer.length)}`);
      return buffer;
    } catch (err) {
      lastError = err;
      console.log(`[Download] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }

  throw lastError;
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
          `• Try a different song`,
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
    `\n⬇️ _Downloading full audio..._`;

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

  const audioBuffer = await downloadAudioBuffer(songInfo.audioUrl);

  if (!audioBuffer || audioBuffer.length < 5000) {
    return sock.sendMessage(from, {
      text: formatError(
        "DOWNLOAD FAILED",
        `Found *${songInfo.title}* but could not download the audio.\n\n` +
          `Please try again in a moment.`,
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
//  .lyrics COMMAND — WORKING API
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
          `• ${ENV.PREFIX}lyrics Eminem Lose Yourself`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching lyrics for:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  const query = fullArgs.trim();
  let lyrics = null;
  let songTitle = query;

  // Source 1: lyrics.ovh API
  const words = query.split(" ");
  for (let split = 1; split <= Math.min(words.length, 4); split++) {
    const artist = words.slice(0, split).join(" ");
    const title = words.slice(split).join(" ");
    try {
      const response = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { timeout: 10000 },
      );
      if (response.data?.lyrics) {
        lyrics = response.data.lyrics;
        songTitle = `${title} - ${artist}`;
        break;
      }
    } catch (_) {}
  }

  // Source 2: lrclib.net
  if (!lyrics) {
    try {
      const response = await axios.get(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        { timeout: 10000 },
      );
      const result = response.data?.[0];
      if (result?.plainLyrics) {
        lyrics = result.plainLyrics;
        songTitle = `${result.trackName} - ${result.artistName}`;
      }
    } catch (_) {}
  }

  if (!lyrics) {
    return sock.sendMessage(from, {
      text: formatError(
        "LYRICS NOT FOUND",
        `Could not find lyrics for *"${fullArgs.trim()}"*\n\n` +
          `💡 *Tips:*\n` +
          `• Try with artist name: *${ENV.PREFIX}lyrics Eminem Lose Yourself*\n` +
          `• Check spelling\n` +
          `• Try a different song`,
      ),
    });
  }

  if (lyrics.length > 4000) {
    lyrics = lyrics.substring(0, 3900) + "\n\n_(truncated)_";
  }

  await sock.sendMessage(from, {
    text: `🎵 *${songTitle}*\n\n${lyrics}\n\n${TAG}`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  .trending COMMAND — WORKING
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
    if (!tracks.length) throw new Error("No trending songs found");

    let message = "🔥 *TRENDING SONGS*\n\n";
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   🎵 ${track.album?.title || "Single"}\n\n`;
    });
    message += `💡 Use *${ENV.PREFIX}play <song>* to download!\n\n${TAG}`;

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

  const randomId = Math.floor(Math.random() * 2000000) + 1;

  try {
    const response = await axios.get(
      `https://api.deezer.com/track/${randomId}`,
      { timeout: 10000 },
    );

    const track = response.data;
    if (track?.title) {
      const message =
        `🎲 *RANDOM SONG*\n\n` +
        `🎵 *${track.title}*\n` +
        `👤 *Artist:* ${track.artist?.name || "Unknown"}\n` +
        `💿 *Album:* ${track.album?.title || "Single"}\n` +
        `⏱️ *Duration:* ${fmtDur(track.duration)}\n\n` +
        `💡 Use *${ENV.PREFIX}play ${track.title} ${track.artist?.name || ""}* to download!\n\n` +
        `${TAG}`;
      return sock.sendMessage(from, { text: message });
    }
  } catch (_) {}

  const popularSongs = [
    "Shape of You Ed Sheeran",
    "Blinding Lights The Weeknd",
    "Dance Monkey Tones and I",
    "Someone You Loved Lewis Capaldi",
    "Bad Guy Billie Eilish",
    "Lose Yourself Eminem",
    "Happier Marshmello",
  ];
  const randomSong =
    popularSongs[Math.floor(Math.random() * popularSongs.length)];

  return sock.sendMessage(from, {
    text: formatInfo(
      "🎲 RANDOM SONG",
      `*Try this:*\n\n*${randomSong}*\n\nUse *${ENV.PREFIX}play ${randomSong}* to download it!\n\n${TAG}`,
    ),
  });
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
          `• ${ENV.PREFIX}artist Billie Eilish`,
      ),
    });
  }

  await sock.sendMessage(from, {
    text: `🔍 *Searching for artist:* "${fullArgs.trim()}"\n⏳ _Please wait..._`,
  });

  try {
    const query = encodeURIComponent(fullArgs.trim());
    const searchRes = await axios.get(
      `https://api.deezer.com/search/artist?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const artist = searchRes.data?.data?.[0];
    if (!artist?.id) throw new Error("Artist not found");

    const [detailsRes, topRes] = await Promise.all([
      axios.get(`https://api.deezer.com/artist/${artist.id}`, {
        timeout: 10000,
      }),
      axios.get(`https://api.deezer.com/artist/${artist.id}/top?limit=5`, {
        timeout: 10000,
      }),
    ]);

    const details = detailsRes.data;
    let topTracksList = "";
    if (topRes.data?.data?.length) {
      topTracksList = "\n🎵 *Top Tracks:*\n";
      topRes.data.data.forEach((track, i) => {
        topTracksList += `${i + 1}. ${track.title} (${fmtDur(track.duration)})\n`;
      });
    }

    const message =
      `🎤 *ARTIST: ${details.name}*\n\n` +
      (details.nb_fan
        ? `👥 *Fans:* ${Number(details.nb_fan).toLocaleString()}\n`
        : "") +
      (details.nb_album ? `💿 *Albums:* ${details.nb_album}\n` : "") +
      topTracksList +
      `\n💡 Use *${ENV.PREFIX}play <song>* to download tracks!\n\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ARTIST NOT FOUND",
        `Could not find artist *"${fullArgs.trim()}"*\n\n` +
          `💡 Check spelling or use *${ENV.PREFIX}play* to search their songs.`,
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
    const searchRes = await axios.get(
      `https://api.deezer.com/search/album?q=${query}&limit=1`,
      { timeout: 10000 },
    );

    const album = searchRes.data?.data?.[0];
    if (!album?.id) throw new Error("Album not found");

    const detailsRes = await axios.get(
      `https://api.deezer.com/album/${album.id}`,
      { timeout: 10000 },
    );

    const details = detailsRes.data;
    let tracksList = "";
    if (details.tracks?.data?.length) {
      const shown = details.tracks.data.slice(0, 10);
      tracksList = "\n🎵 *Tracklist:*\n";
      shown.forEach((track, i) => {
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
      tracksList +
      `\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "ALBUM NOT FOUND",
        `Could not find album *"${fullArgs.trim()}"*\n\n` +
          `💡 Try with artist name: *${ENV.PREFIX}album Eminem Show*`,
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
    if (!tracks.length) throw new Error("No results found");

    let message = `🔍 *SEARCH RESULTS FOR:* "${fullArgs.trim()}"\n\n`;
    tracks.forEach((track, i) => {
      message += `${i + 1}. *${track.title}*\n`;
      message += `   👤 ${track.artist?.name}\n`;
      message += `   💿 ${track.album?.title || "Single"}\n`;
      message += `   ⏱️ ${fmtDur(track.duration)}\n\n`;
    });
    message += `💡 *To download:* ${ENV.PREFIX}play ${fullArgs.trim()}\n\n${TAG}`;

    await sock.sendMessage(from, { text: message });
  } catch (error) {
    return sock.sendMessage(from, {
      text: formatError(
        "SEARCH FAILED",
        `Could not find songs matching *"${fullArgs.trim()}"*\n\n` +
          `💡 Check spelling or use *${ENV.PREFIX}play* to search and download directly.`,
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
    `🎵 *${ENV.PREFIX}play <song>* - Download full song\n` +
    `📝 *${ENV.PREFIX}lyrics <song>* - Get song lyrics\n` +
    `🔥 *${ENV.PREFIX}trending* - View trending songs\n` +
    `🎲 *${ENV.PREFIX}random* - Random song suggestion\n` +
    `🎤 *${ENV.PREFIX}artist <name>* - Artist information\n` +
    `💿 *${ENV.PREFIX}album <name>* - Album information\n` +
    `🔍 *${ENV.PREFIX}musicsearch <song>* - Search for songs\n\n` +
    `💡 *Examples:*\n` +
    `• ${ENV.PREFIX}play Lose Yourself Eminem\n` +
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
};
