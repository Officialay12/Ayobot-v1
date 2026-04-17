// features/music.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE MUSIC MODULE — All commands working
//  Fixed: Status code 410 error, multiple download fallbacks
//  Credit: AYOCODES — github.com/Officialay12
// ════════════════════════════════════════════════════════════════════════════

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ytdl from "ytdl-core";
import yts from "yt-search";
import axios from "axios";
import { randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAG = `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

const TEMP_DIR = path.join(process.cwd(), "temp");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const DOWNLOAD_TIMEOUT = 120000; // 2 min

let _tempDirReady = false;
async function ensureTempDir() {
  if (_tempDirReady) return;
  await fs.mkdir(TEMP_DIR, { recursive: true });
  _tempDirReady = true;
}

// ══════════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "N/A";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "Unknown";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function cleanFilename(name) {
  return name
    .replace(/[^\w\s-]/gi, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

// ══════════════════════════════════════════════════════════════════════════
//  METHOD 1: ytdl-core with agent and retry logic
// ══════════════════════════════════════════════════════════════════════════

async function downloadWithYtdl(videoId) {
  return new Promise(async (resolve, reject) => {
    const tempFile = path.join(TEMP_DIR, `${randomBytes(16).toString("hex")}.mp3`);

    try {
      // Get video info with retry
      let info;
      let retries = 3;
      while (retries > 0) {
        try {
          info = await ytdl.getInfo(videoId, {
            requestOptions: {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "en-US,en;q=0.9",
              },
            },
          });
          break;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
      const bestAudio = audioFormats.reduce((best, cur) =>
        (parseInt(cur.bitrate) || 0) > (parseInt(best.bitrate) || 0) ? cur : best
      );

      const audioStream = ytdl(videoId, {
        format: bestAudio,
        quality: "lowestaudio",
        filter: "audioonly",
        requestOptions: {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
      });

      const ffmpeg = spawn("ffmpeg", [
        "-i",
        "pipe:0",
        "-acodec",
        "libmp3lame",
        "-ab",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-f",
        "mp3",
        "-y",
        tempFile,
      ]);

      audioStream.pipe(ffmpeg.stdin);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Download timeout")),
          DOWNLOAD_TIMEOUT
        );
        ffmpeg.on("close", (code) => {
          clearTimeout(timer);
          code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`));
        });
        ffmpeg.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        audioStream.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const stats = await fs.stat(tempFile);
      if (stats.size < 10240) throw new Error("File too small");
      if (stats.size > MAX_FILE_SIZE) throw new Error("File too large");

      const audioBuffer = await fs.readFile(tempFile);
      await fs.unlink(tempFile).catch(() => {});

      resolve({
        buffer: audioBuffer,
        title: info.videoDetails.title,
        artist: info.videoDetails.author.name,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: info.videoDetails.thumbnails?.pop()?.url || info.videoDetails.thumbnail,
        size: stats.size,
        videoUrl: info.videoDetails.video_url,
        videoId: videoId,
      });
    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      reject(error);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  METHOD 2: YouTube Music API fallback (using invidious/ytdl alternative)
// ══════════════════════════════════════════════════════════════════════════

async function downloadWithInvidious(videoId) {
  const invidiousInstances = [
    "https://inv.vern.cc",
    "https://yewtu.be",
    "https://invidious.snopyta.org",
    "https://inv.riverside.rocks",
  ];

  for (const instance of invidiousInstances) {
    try {
      const infoRes = await axios.get(`${instance}/api/v1/videos/${videoId}`, {
        timeout: 10000,
      });
      const video = infoRes.data;

      const audioFormat = video.formatStreams?.find(
        (f) => f.type?.startsWith("audio") && f.encoding === "mp4a"
      );
      if (!audioFormat?.url) continue;

      const audioRes = await axios.get(audioFormat.url, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: { Range: "bytes=0-" },
      });

      const tempFile = path.join(TEMP_DIR, `${randomBytes(16).toString("hex")}.mp3`);

      const ffmpeg = spawn("ffmpeg", [
        "-i",
        "pipe:0",
        "-acodec",
        "libmp3lame",
        "-ab",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-f",
        "mp3",
        "-y",
        tempFile,
      ]);

      ffmpeg.stdin.write(Buffer.from(audioRes.data));
      ffmpeg.stdin.end();

      await new Promise((resolve, reject) => {
        ffmpeg.on("close", (code) => {
          code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`));
        });
        ffmpeg.on("error", reject);
      });

      const stats = await fs.stat(tempFile);
      const audioBuffer = await fs.readFile(tempFile);
      await fs.unlink(tempFile).catch(() => {});

      return {
        buffer: audioBuffer,
        title: video.title,
        artist: video.author,
        duration: video.lengthSeconds,
        thumbnail: video.videoThumbnails?.[4]?.url || video.videoThumbnails?.[0]?.url,
        size: stats.size,
        videoUrl: `https://youtube.com/watch?v=${videoId}`,
        videoId: videoId,
      };
    } catch (err) {
      continue;
    }
  }
  throw new Error("All invidious instances failed");
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN DOWNLOAD FUNCTION WITH FALLBACKS
// ══════════════════════════════════════════════════════════════════════════

async function downloadYouTubeAudio(searchQuery) {
  await ensureTempDir();

  const searchResults = await yts(searchQuery);
  if (!searchResults?.videos?.length) {
    throw new Error("No videos found for this query");
  }

  let video = searchResults.videos[0];
  const officialKeywords = [
    "official",
    "audio",
    "music video",
    "lyrics",
    "official audio",
    "official music video",
  ];

  for (const v of searchResults.videos.slice(0, 7)) {
    const titleLower = v.title.toLowerCase();
    if (officialKeywords.some((kw) => titleLower.includes(kw))) {
      video = v;
      break;
    }
  }

  let lastError = null;
  const methods = [
    { name: "ytdl-core", fn: () => downloadWithYtdl(video.videoId) },
    { name: "Invidious", fn: () => downloadWithInvidious(video.videoId) },
  ];

  for (const method of methods) {
    try {
      console.log(`[Music] Trying ${method.name} for ${video.videoId}`);
      const result = await method.fn();
      if (result && result.buffer && result.buffer.length > 10000) {
        console.log(`[Music] Success with ${method.name}`);
        return result;
      }
    } catch (err) {
      console.log(`[Music] ${method.name} failed:`, err.message);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All download methods failed");
}

// ══════════════════════════════════════════════════════════════════════════
//  QUERY PARSER
// ══════════════════════════════════════════════════════════════════════════

function parseSongQuery(input) {
  if (!input) return { searchQuery: "", title: "", artist: "" };
  const query = input.trim();

  const byMatch = query.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch)
    return {
      searchQuery: `${byMatch[1].trim()} ${byMatch[2].trim()} official audio`,
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };

  const dashMatch = query.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch)
    return {
      searchQuery: `${dashMatch[1].trim()} ${dashMatch[2].trim()} official audio`,
      title: dashMatch[1].trim(),
      artist: dashMatch[2].trim(),
    };

  const parenMatch = query.match(/^(.+?)\s*[\(\[{](.+?)[\)\]}]$/);
  if (parenMatch)
    return {
      searchQuery: `${parenMatch[1].trim()} ${parenMatch[2].trim()} audio`,
      title: parenMatch[1].trim(),
      artist: parenMatch[2].trim(),
    };

  return { searchQuery: `${query} official audio`, title: query, artist: "" };
}

// ══════════════════════════════════════════════════════════════════════════
//  .play COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicDownload({ fullArgs, from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text:
        `🎵 *AYOBOT MUSIC DOWNLOADER*\n\n` +
        `*Usage:* ${PREFIX}play <song name>\n\n` +
        `*Examples:*\n` +
        `• ${PREFIX}play Wildflower by Billie Eilish\n` +
        `• ${PREFIX}play Lose Yourself - Eminem\n` +
        `• ${PREFIX}play Shape of You Ed Sheeran\n\n` +
        TAG,
    });
  }

  const rawQuery = fullArgs.trim();
  const parsed = parseSongQuery(rawQuery);

  await sock.sendMessage(from, {
    text:
      `🔍 *Searching for:* "${rawQuery}"\n` +
      `⏳ _Downloading audio — this may take 30-60 seconds…_\n\n` +
      `_Using multiple download methods…_`,
  });

  try {
    const audio = await downloadYouTubeAudio(parsed.searchQuery);
    if (!audio?.buffer || audio.buffer.length < 10000) {
      throw new Error("Download failed — file too small");
    }

    const durationStr = formatDuration(audio.duration);
    const sizeStr = formatSize(audio.size);
    const caption =
      `🎵 *${audio.title.substring(0, 60)}*\n` +
      `👤 *Artist:* ${audio.artist.substring(0, 40)}\n` +
      `⏱️ *Duration:* ${durationStr}\n` +
      `📦 *Size:* ${sizeStr}\n\n` +
      TAG;

    if (audio.thumbnail) {
      try {
        await sock.sendMessage(from, { image: { url: audio.thumbnail }, caption });
      } catch (_) {
        await sock.sendMessage(from, { text: caption });
      }
    } else {
      await sock.sendMessage(from, { text: caption });
    }

    await sock.sendMessage(from, {
      audio: audio.buffer,
      mimetype: "audio/mpeg",
      ptt: false,
      fileName: `${cleanFilename(audio.title)}.mp3`,
    });
  } catch (error) {
    let errorMessage = "";

    if (
      error.message.includes("410") ||
      error.message.includes("Status code 410")
    ) {
      errorMessage =
        `❌ *YouTube Stream Unavailable (Error 410)*\n\n` +
        `"${rawQuery}"\n\n` +
        `*Possible fixes:*\n` +
        `• Try a different song name\n` +
        `• Add "official audio" to your query\n` +
        `• Try: ${PREFIX}play ${rawQuery} official audio\n` +
        `• The video may be age-restricted or deleted\n\n` +
        `*Alternative:* Use ${PREFIX}musicsearch ${rawQuery} to find a working version\n\n` +
        TAG;
    } else if (error.message.includes("ffmpeg")) {
      errorMessage =
        `❌ *FFmpeg Not Found*\n\n` +
        `Install FFmpeg:\n` +
        `• Ubuntu: \\`sudo apt install ffmpeg\\`\n` +
        `• macOS:  \\`brew install ffmpeg\\`\n` +
        `• Termux: \\`pkg install ffmpeg\\`\n\n` +
        TAG;
    } else if (error.message.includes("timeout")) {
      errorMessage =
        `❌ *Download Timeout*\n\n` +
        `"${rawQuery}"\n\n` +
        `Try a shorter or more popular song.\n\n` +
        TAG;
    } else {
      errorMessage =
        `❌ *Failed to download:* "${rawQuery}"\n\n` +
        `*Error:* ${error.message}\n\n` +
        `*Tips:*\n` +
        `• Try adding "official audio" to your query\n` +
        `• Use ${PREFIX}musicsearch to find working links\n` +
        `• Try a different song\n\n` +
        TAG;
    }

    await sock.sendMessage(from, { text: errorMessage });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  .lyrics COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicLyrics({ fullArgs, from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text:
        `📝 *LYRICS SEARCHER*\n\n` +
        `*Usage:* ${PREFIX}lyrics <song name>\n\n` +
        `*Example:* ${PREFIX}lyrics Lose Yourself Eminem\n\n` +
        TAG,
    });
  }

  const query = fullArgs.trim();
  await sock.sendMessage(from, {
    text: `🔍 *Searching lyrics for:* "${query}"\n⏳ _Please wait…_`,
  });

  let lyrics = null;
  let songTitle = query;

  // Source 1 — lyrics.ovh
  try {
    const words = query.split(" ");
    for (let split = 1; split <= Math.min(words.length, 4); split++) {
      const artist = words.slice(0, split).join(" ");
      const title = words.slice(split).join(" ");
      if (!title) continue;
      const res = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { timeout: 10000 }
      );
      if (res.data?.lyrics && !res.data.lyrics.includes("No lyrics found")) {
        lyrics = res.data.lyrics;
        songTitle = `${title} - ${artist}`;
        break;
      }
    }
  } catch (_) {}

  // Source 2 — LRCLIB
  if (!lyrics) {
    try {
      const res = await axios.get(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        { timeout: 10000 }
      );
      const result = res.data?.[0];
      if (result?.plainLyrics) {
        lyrics = result.plainLyrics;
        songTitle = `${result.trackName} - ${result.artistName}`;
      }
    } catch (_) {}
  }

  if (!lyrics) {
    return sock.sendMessage(from, {
      text:
        `❌ *LYRICS NOT FOUND*\n\n` +
        `Could not find lyrics for *"${query}"*\n\n` +
        `Tip: try with artist — ${PREFIX}lyrics Eminem Lose Yourself\n\n` +
        TAG,
    });
  }

  lyrics = lyrics.replace(/\r\n/g, "\n").replace(/\n\s*\n\s*\n/g, "\n\n").trim();
  if (lyrics.length > 4000) lyrics = lyrics.substring(0, 3900) + "\n\n_(truncated)_";

  await sock.sendMessage(from, {
    text: `🎵 *${songTitle}*\n\n${lyrics}\n\n${TAG}`,
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  .trending COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicTrending({ from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";
  await sock.sendMessage(from, { text: `🔍 *Fetching trending songs…*` });

  try {
    const res = await axios.get("https://api.deezer.com/chart/0/tracks?limit=10", {
      timeout: 10000,
    });
    const tracks = res.data?.data ?? [];
    if (!tracks.length) throw new Error("No data");

    let message = `🔥 *TRENDING SONGS*\n\n`;
    tracks.forEach((t, i) => {
      message += `${i + 1}. *${t.title}*\n   👤 ${t.artist?.name}\n   💿 ${t.album?.title || "Single"}\n\n`;
    });
    message += `💡 Use *${PREFIX}play <song>* to download!\n\n${TAG}`;
    return sock.sendMessage(from, { text: message });
  } catch (_) {}

  // Fallback
  const fallback = [
    "Wildflower — Billie Eilish",
    "Lose Yourself — Eminem",
    "Shape of You — Ed Sheeran",
    "Blinding Lights — The Weeknd",
    "Someone You Loved — Lewis Capaldi",
  ];
  let message = `🔥 *POPULAR SONGS*\n\n`;
  fallback.forEach((s, i) => {
    message += `${i + 1}. *${s}*\n\n`;
  });
  message += `💡 Use *${PREFIX}play <song>* to download!\n\n${TAG}`;
  await sock.sendMessage(from, { text: message });
}

// ══════════════════════════════════════════════════════════════════════════
//  .musicsearch COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicSearch({ fullArgs, from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";

  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text:
        `🔍 *MUSIC SEARCHER*\n\n` +
        `Usage: ${PREFIX}musicsearch <song name>\n\n` +
        `Example: ${PREFIX}musicsearch Wildflower Billie Eilish\n\n` +
        TAG,
    });
  }

  const query = fullArgs.trim();
  await sock.sendMessage(from, {
    text: `🔍 *Searching YouTube for:* "${query}"\n⏳ _Please wait…_`,
  });

  try {
    const searchResults = await yts(query);
    if (!searchResults?.videos?.length) throw new Error("No results");

    let message = `🔍 *RESULTS FOR:* "${query}"\n\n`;
    searchResults.videos.slice(0, 5).forEach((v, i) => {
      message += `${i + 1}. *${v.title.substring(0, 50)}*\n   👤 ${v.author.name}\n   ⏱️ ${formatDuration(v.duration.seconds)} • 👁️ ${v.views}\n\n`;
    });
    message += `💡 *To download:* ${PREFIX}play ${query}\n\n${TAG}`;
    await sock.sendMessage(from, { text: message });
  } catch (_) {
    await sock.sendMessage(from, {
      text: `❌ *SEARCH FAILED*\n\nNo results for *"${query}"*\n\n${TAG}`,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  .random COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicRandom({ from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";
  const songs = [
    "Wildflower by Billie Eilish",
    "Lose Yourself by Eminem",
    "Shape of You by Ed Sheeran",
    "Blinding Lights by The Weeknd",
    "Bohemian Rhapsody by Queen",
    "Imagine by John Lennon",
    "Rolling in the Deep by Adele",
    "Uptown Funk by Mark Ronson",
    "Hello by Adele",
    "Despacito by Luis Fonsi",
  ];
  const song = songs[Math.floor(Math.random() * songs.length)];
  await sock.sendMessage(from, {
    text: `🎲 *RANDOM SONG*\n\n🎵 *${song}*\n\nUse *${PREFIX}play ${song}* to download!\n\n${TAG}`,
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  .album COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicAlbum({ fullArgs, from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: `💿 *ALBUM INFO*\n\nUsage: ${PREFIX}album <album name>\n\nExample: ${PREFIX}album Happier Than Ever\n\n${TAG}`,
    });
  }
  const query = fullArgs.trim();
  await sock.sendMessage(from, { text: `🔍 *Searching album:* "${query}"` });

  try {
    const results = await yts(`${query} full album`);
    if (!results?.videos?.length) throw new Error("Not found");

    let msg = `💿 *ALBUM: ${query.toUpperCase()}*\n\n`;
    results.videos.slice(0, 8).forEach((v, i) => {
      msg += `${i + 1}. *${v.title.substring(0, 50)}*\n   👤 ${v.author.name} | ⏱️ ${formatDuration(v.duration.seconds)}\n\n`;
    });
    msg += `💡 Use *${PREFIX}play <song>* to download!\n\n${TAG}`;
    await sock.sendMessage(from, { text: msg });
  } catch (_) {
    await sock.sendMessage(from, {
      text: `❌ *ALBUM NOT FOUND:* "${query}"\n\n${TAG}`,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  .artist COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function musicArtist({ fullArgs, from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";
  if (!fullArgs?.trim()) {
    return sock.sendMessage(from, {
      text: `🎤 *ARTIST INFO*\n\nUsage: ${PREFIX}artist <artist name>\n\nExample: ${PREFIX}artist Billie Eilish\n\n${TAG}`,
    });
  }
  const query = fullArgs.trim();
  await sock.sendMessage(from, { text: `🔍 *Searching artist:* "${query}"` });

  try {
    const results = await yts(`${query} top songs`);
    if (!results?.videos?.length) throw new Error("Not found");

    let msg = `🎤 *ARTIST: ${query.toUpperCase()}*\n\n🎵 *Top Songs:*\n\n`;
    results.videos.slice(0, 8).forEach((v, i) => {
      msg += `${i + 1}. *${v.title.substring(0, 50)}*\n   ⏱️ ${formatDuration(v.duration.seconds)} • 👁️ ${v.views}\n\n`;
    });
    msg += `💡 Use *${PREFIX}play <song>* to download!\n\n${TAG}`;
    await sock.sendMessage(from, { text: msg });
  } catch (_) {
    await sock.sendMessage(from, {
      text: `❌ *ARTIST NOT FOUND:* "${query}"\n\n${TAG}`,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  .music (menu) COMMAND
// ══════════════════════════════════════════════════════════════════════════

export async function music({ from, sock, ENV }) {
  const PREFIX = ENV?.PREFIX ?? ".";
  await sock.sendMessage(from, {
    text:
      `🎵 *AYOBOT MUSIC HUB*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎵 *${PREFIX}play <song>*       — Download full song\n` +
      `📝 *${PREFIX}lyrics <song>*     — Get song lyrics\n` +
      `🔥 *${PREFIX}trending*          — View trending songs\n` +
      `🔍 *${PREFIX}musicsearch <song>*— Search for songs\n` +
      `🎲 *${PREFIX}random*            — Random song suggestion\n` +
      `🎤 *${PREFIX}artist <name>*     — Artist information\n` +
      `💿 *${PREFIX}album <name>*      — Album information\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Examples:*\n` +
      `• ${PREFIX}play Wildflower by Billie Eilish\n` +
      `• ${PREFIX}lyrics Lose Yourself\n` +
      `• ${PREFIX}artist Eminem\n\n` +
      TAG,
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════════════════

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
