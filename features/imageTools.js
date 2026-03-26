// features/imageTools.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Image Tools Module — FULLY OPTIMIZED & COMPLETE
//  Author  : AYOCODES
//
//  LATEST FIXES:
//    • .tovideo — FRAME LIMIT (max 30 frames) prevents timeout
//    • .tovideo — SINGLE PROGRESS MESSAGE (no spam)
//    • .tovideo — TIMEOUT PROTECTION (30s max)
//    • .tovideo — FALLBACK to static image if conversion fails
//    • .sticker — PROPER EXIF METADATA with "AYOBOT" pack name
//    • .sticker — Pack name appears in sticker info like "Sticker.ly * AYOBOT"
//    • All functions optimized for performance
// ════════════════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { execFile, spawn } from "child_process";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import util from "util";
import { ENV } from "../index.js";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

const execFilePromise = util.promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Auto-clean temp files older than 1 hour
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(TEMP_DIR, f);
      try {
        if (now - fs.statSync(fp).mtimeMs > 3_600_000) fs.unlinkSync(fp);
      } catch (_) {}
    }
  } catch (_) {}
}, 3_600_000);

// ─── ffmpeg availability ──────────────────────────────────────────────────────
let ffmpegAvailable = null;
let ffmpegChecked = false;

async function checkFfmpeg() {
  if (ffmpegChecked) return ffmpegAvailable;
  try {
    await execFilePromise("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
    console.log("✅ ffmpeg detected");
  } catch (_) {
    ffmpegAvailable = false;
    console.log("⚠️ ffmpeg NOT found");
  }
  ffmpegChecked = true;
  return ffmpegAvailable;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function downloadMedia(msg, type) {
  try {
    const stream = await downloadContentFromMessage(msg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    if (!buffer.length) throw new Error("Empty media buffer");
    return buffer;
  } catch (e) {
    throw new Error(`Failed to download media: ${e.message}`);
  }
}

function safeUnlink(...files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
}

async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execFilePromise("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    return parseFloat(stdout);
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  STICKER EXIF METADATA — AYOBOT BRANDING
//
//  This creates the sticker metadata that appears when users view sticker info:
//  • Pack name: "AYOBOT" (appears under the sticker like "Sticker.ly * AYOBOT")
//  • Publisher: "AYOCODES" (appears as the creator)
//  • Includes emojis for better visibility
// ─────────────────────────────────────────────────────────────────────────────
function buildStickerExif(packName = "AYOBOT", publisher = "AYOCODES") {
  // Format exactly like WhatsApp expects for sticker pack metadata
  const json = JSON.stringify({
    "sticker-pack-id": "ayobot.v1.ayocodes.2024",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "https://github.com/Officialay12/Ayobot v1",
    "ios-app-store-link": "https://github.com/Officialay12/Ayobot v1",
    "emojis": ["🤖", "⚡", "👑", "🎭"],
    "is-ai-sticker": true,
    "sticker-pack-version": "1.0.0"
  });

  const jsonBuf = Buffer.from(json, "utf-8");
  // EXIF header required for WebP stickers
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  return Buffer.concat([Buffer.from("Exif\x00\x00"), header, jsonBuf]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATED WEBP FRAME EXTRACTOR (OPTIMIZED)
//
//  WhatsApp stickers are ANIM/ANMF format WebP files. ffmpeg's built-in
//  webp decoder silently skips ANIM/ANMF chunks, leaving "image data not
//  found" and an empty stream. The fix is to use sharp (which calls libwebp
//  directly and handles ANIM/ANMF correctly) to extract every frame as a
//  PNG buffer, then send those frames to ffmpeg via image2pipe (stdin).
//
//  OPTIMIZATIONS:
//    • Max frames limited to 30 to prevent timeout
//    • Early return for static stickers
//    • Efficient frame extraction
// ─────────────────────────────────────────────────────────────────────────────
async function extractAnimatedWebpFrames(webpBuffer, maxFrames = 30) {
  // sharp handles animated WebP via libwebp — reads ANIM/ANMF correctly
  const sharpObj = sharp(webpBuffer, { animated: true, pages: -1 });
  const metadata = await sharpObj.metadata();

  const totalPages = metadata.pages || 1;
  const pageCount = Math.min(totalPages, maxFrames);
  const fps = metadata.delay
    ? Math.round(1000 / (metadata.delay[0] || 100))
    : 10;
  const width = metadata.width || 512;
  const height = metadata.pageHeight || metadata.height || 512;

  if (pageCount <= 1 || totalPages === 1) {
    // Static sticker — just return the single frame
    const single = await sharp(webpBuffer).png().toBuffer();
    return {
      frames: [single],
      fps: 10,
      width,
      height,
      isStatic: true,
      originalFrames: totalPages,
      truncated: false
    };
  }

  // Extract each page (frame) individually, limited to maxFrames
  const frames = [];
  for (let i = 0; i < pageCount; i++) {
    try {
      const framePng = await sharp(webpBuffer, { page: i }).png().toBuffer();
      frames.push(framePng);
    } catch (_) {
      // If a frame fails, skip it — don't abort everything
      console.warn(`Failed to extract frame ${i}`);
    }
  }

  if (!frames.length) {
    // Last resort: try extracting the whole animated webp as a flat PNG
    const flat = await sharp(webpBuffer).png().toBuffer();
    return {
      frames: [flat],
      fps: 10,
      width,
      height,
      isStatic: true,
      originalFrames: totalPages,
      truncated: true
    };
  }

  return {
    frames,
    fps: Math.max(1, Math.min(fps, 30)),
    width,
    height,
    isStatic: false,
    originalFrames: totalPages,
    truncated: totalPages > maxFrames
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PIPE FRAMES TO FFMPEG (image2pipe) with timeout
//
//  Instead of writing frames to disk, we open an ffmpeg child process
//  with -f image2pipe -i pipe:0 and write PNG frames to stdin.
//  This avoids the ANIM/ANMF issue entirely — ffmpeg never sees the WebP.
// ─────────────────────────────────────────────────────────────────────────────
function pipeFramesToFfmpeg(frames, fps, outputPath, extraArgs = [], timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      ...extraArgs,
      "-y",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });

    let stderr = "";
    let timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`FFmpeg processing timeout (${timeoutMs/1000}s)`));
    }, timeoutMs);

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });

    // Write all frames then end stdin
    (async () => {
      for (const frame of frames) {
        const canWrite = proc.stdin.write(frame);
        if (!canWrite) {
          await new Promise((r) => proc.stdin.once("drain", r));
        }
      }
      proc.stdin.end();
    })().catch((err) => {
      clearTimeout(timeoutId);
      proc.kill();
      reject(err);
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER — Creates sticker with AYOBOT branding
//
//  When users view sticker info, they will see:
//  • Pack name: "AYOBOT"
//  • Publisher: "AYOCODES"
//  • Emojis: 🤖⚡👑🎭
// ════════════════════════════════════════════════════════════════════════════
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 STICKER",
          `Reply to an image or video with .sticker\n\n✨ *AYOBOT* will appear as the sticker pack name!`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });

    const isVideo = !!quoted.videoMessage;
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;
    const mediaBuf = await downloadMedia(mediaMsg, isVideo ? "video" : "image");
    const exif = buildStickerExif("AYOBOT", "AYOCODES");

    if (!isVideo) {
      // Image sticker — sharp handles this perfectly
      const stickerBuf = await sharp(mediaBuf)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      await sock.sendMessage(from, {
        sticker: stickerBuf,
        mimetype: "image/webp",
        exif,
      });

      await sock.sendMessage(from, {
        text: " ",
      });
    } else {
      // Video sticker
      const hasFfmpeg = await checkFfmpeg();
      if (!hasFfmpeg) {
        const fallback = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
        await sock.sendMessage(from, {
          sticker: fallback,
          mimetype: "image/webp",
          exif,
        });
        await sock.sendMessage(from, {
          text: "⚠️ ffmpeg not installed — created static sticker instead.\n\n📦 *Pack:* AYOBOT\n👑 *Creator:* AYOCODES",
        });
        return;
      }

      const inputPath = path.join(TEMP_DIR, `sticker_in_${Date.now()}.mp4`);
      const outputPath = path.join(TEMP_DIR, `sticker_out_${Date.now()}.webp`);
      fs.writeFileSync(inputPath, mediaBuf);

      try {
        await execFilePromise("ffmpeg", [
          "-i",
          inputPath,
          "-vcodec",
          "libwebp",
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease,fps=10,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
          "-lossless",
          "0",
          "-q:v",
          "70",
          "-preset",
          "default",
          "-loop",
          "0",
          "-an",
          "-vsync",
          "0",
          "-t",
          "5",
          "-y",
          outputPath,
        ]);

        const stickerBuf = fs.readFileSync(outputPath);
        await sock.sendMessage(from, {
          sticker: stickerBuf,
          mimetype: "image/webp",
          exif,
        });

        await sock.sendMessage(from, {
          text: "✅ *Animated sticker created!*\n\n📦 *Pack:* AYOBOT\n👑 *Creator:* AYOCODES",
        });
      } catch (ffErr) {
        console.error("ffmpeg sticker error:", ffErr.message);
        const fallback = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
        await sock.sendMessage(from, {
          sticker: fallback,
          mimetype: "image/webp",
          exif,
        });
        await sock.sendMessage(from, {
          text: `⚠️ Could not create animated sticker: ${ffErr.message}\nCreated static sticker instead.\n\n📦 *Pack:* AYOBOT\n👑 *Creator:* AYOCODES`,
        });
      } finally {
        safeUnlink(inputPath, outputPath);
      }
    }
  } catch (e) {
    console.error("Sticker error:", e);
    await sock.sendMessage(from, {
      text: formatError("STICKER ERROR", e.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO IMAGE — sticker → PNG
// ════════════════════════════════════════════════════════════════════════════
export async function toImage({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🖼️ STICKER → IMAGE",
          `Reply to a sticker with .toimage`,
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to image...*",
    });

    const stickerBuf = await downloadMedia(quoted.stickerMessage, "image");
    const pngBuf = await sharp(stickerBuf).png({ quality: 100 }).toBuffer();

    await sock.sendMessage(from, {
      image: pngBuf,
      caption: `🖼️ *Sticker → Image*\n📦 ${(pngBuf.length / 1024).toFixed(1)} KB\n👑 AYOCODES`,
    });
  } catch (e) {
    console.error("ToImage error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Failed to convert: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO VIDEO — animated sticker → MP4 (OPTIMIZED)
//
//  FIXES APPLIED:
//    • Frame limit (max 30 frames) to prevent timeout
//    • Single progress message during conversion (no spam)
//    • Better timeout handling (30s max)
//    • Progress tracking via single status update
//    • Fallback to static image if conversion fails
//    • Truncation warning for large stickers
// ════════════════════════════════════════════════════════════════════════════
export async function toVideo({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎬 STICKER → VIDEO",
          `Reply to an animated sticker with .tovideo`,
        ),
      });
    }

    // Single progress message - user knows to wait
    await sock.sendMessage(from, {
      text: "🎬 *Converting sticker to video...*\n⏳ _This may take 15-30 seconds_",
    });

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      return sock.sendMessage(from, {
        text: formatError(
          "FFMPEG MISSING",
          "ffmpeg is not installed on this server.",
        ),
      });
    }

    const stickerBuf = await downloadMedia(quoted.stickerMessage, "image");

    // ── Extract frames using sharp (handles ANIM/ANMF correctly) ──
    let frameData;
    try {
      frameData = await extractAnimatedWebpFrames(stickerBuf, 30);
    } catch (sharpErr) {
      return sock.sendMessage(from, {
        text: formatError(
          "FRAME EXTRACTION FAILED",
          `Could not read sticker: ${sharpErr.message}`,
        ),
      });
    }

    const { frames, fps, width, height, isStatic, originalFrames, truncated } = frameData;

    // Handle static stickers
    if (isStatic || frames.length === 1) {
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `🖼️ *This is a static sticker — converted to image*\n👑 AYOCODES`,
      });
      await sock.sendMessage(from, { text: "✅ *Conversion complete!*" });
      return;
    }

    // Warn if frames were truncated
    if (truncated) {
      await sock.sendMessage(from, {
        text: `⚠️ *Sticker has ${originalFrames} frames* — limiting to first 30 frames for performance.`,
      });
    }

    // Update status with frame info (only one update)
    await sock.sendMessage(from, {
      text: `🎬 *Processing ${frames.length} frames at ${fps}fps...*\n⏳ _This may take another 10-20 seconds_`,
    });

    // ── Pipe PNG frames to ffmpeg via stdin with timeout ────────────────
    const outputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);

    try {
      await pipeFramesToFfmpeg(frames, fps, outputPath, [
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        "-movflags",
        "+faststart",
        "-t",
        "5", // Max 5 seconds output
      ], 30000); // 30 second timeout

      const videoBuf = fs.readFileSync(outputPath);
      const videoSizeMB = (videoBuf.length / 1024 / 1024).toFixed(2);

      await sock.sendMessage(from, {
        video: videoBuf,
        caption:
          `🎬 *Sticker → Video*\n` +
          `🖼️ *Frames:* ${frames.length}${truncated ? `/${originalFrames}` : ""}\n` +
          `🎞️ *FPS:* ${fps}\n` +
          `📦 *Size:* ${videoSizeMB} MB\n`,
      });

      await sock.sendMessage(from, { text: "✅ *Conversion complete!*" });
      safeUnlink(outputPath);

    } catch (ffErr) {
      safeUnlink(outputPath);
      console.error("ToVideo ffmpeg error:", ffErr.message);

      // Fallback: send first frame as image instead
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `⚠️ *Video conversion failed*\n\nCould not create video from this sticker.\n📸 *First frame saved as image instead.*\n\nError: ${ffErr.message.slice(0, 100)}`,
      });
    }
  } catch (e) {
    console.error("ToVideo error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Conversion failed: ${e.message.slice(0, 200)}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO GIF — video → GIF playback
// ════════════════════════════════════════════════════════════════════════════
export async function toGif({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.videoMessage) {
      return sock.sendMessage(from, {
        text: formatInfo("🎞️ VIDEO → GIF", `Reply to a video with .togif`),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Converting to GIF...*" });

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      return sock.sendMessage(from, {
        text: formatError(
          "FFMPEG MISSING",
          "ffmpeg is not installed on this server.",
        ),
      });
    }

    const videoBuffer = await downloadMedia(quoted.videoMessage, "video");

    if (videoBuffer.length > 50 * 1024 * 1024) {
      return sock.sendMessage(from, {
        text: formatError("TOO LARGE", "Video too large (max 50MB)."),
      });
    }

    const inputPath = path.join(TEMP_DIR, `gif_in_${Date.now()}.mp4`);
    const outputPath = path.join(TEMP_DIR, `gif_out_${Date.now()}.mp4`);
    fs.writeFileSync(inputPath, videoBuffer);

    const duration = await getVideoDuration(inputPath);
    if (duration && duration > 30) {
      await sock.sendMessage(from, {
        text: `⚠️ Video is ${Math.round(duration)}s long. Truncating to 30s.`,
      });
    }

    await execFilePromise("ffmpeg", [
      "-i",
      inputPath,
      "-vf",
      "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      "-loop",
      "0",
      "-t",
      "30",
      "-y",
      outputPath,
    ]);

    const gifBuffer = fs.readFileSync(outputPath);

    await sock.sendMessage(from, {
      video: gifBuffer,
      gifPlayback: true,
      caption: `🎞️ *Video → GIF*\n📦 ${(gifBuffer.length / 1024).toFixed(1)} KB\n👑 AYOCODES`,
    });

    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("ToGif error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `GIF conversion failed: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO AUDIO — video → MP3
// ════════════════════════════════════════════════════════════════════════════
export async function toAudio({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.videoMessage && !quoted.audioMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo("🔊 VIDEO → AUDIO", `Reply to a video with .toaudio`),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Extracting audio...*" });

    if (quoted.audioMessage) {
      const audioBuf = await downloadMedia(quoted.audioMessage, "audio");
      return sock.sendMessage(from, {
        audio: audioBuf,
        mimetype: "audio/mp4",
        ptt: false,
      });
    }

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      return sock.sendMessage(from, {
        text: formatError(
          "FFMPEG MISSING",
          "ffmpeg is not installed on this server.",
        ),
      });
    }

    const videoBuffer = await downloadMedia(quoted.videoMessage, "video");

    if (videoBuffer.length > 100 * 1024 * 1024) {
      return sock.sendMessage(from, {
        text: formatError("TOO LARGE", "Video too large (max 100MB)."),
      });
    }

    const inputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);
    const outputPath = path.join(TEMP_DIR, `aud_${Date.now()}.mp3`);
    fs.writeFileSync(inputPath, videoBuffer);

    await execFilePromise("ffmpeg", [
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ab",
      "128k",
      "-ar",
      "44100",
      "-y",
      outputPath,
    ]);

    const audioBuf = fs.readFileSync(outputPath);

    await sock.sendMessage(from, {
      audio: audioBuf,
      mimetype: "audio/mpeg",
      ptt: false,
    });
    await sock.sendMessage(from, {
      text: formatSuccess(
        "AUDIO EXTRACTED",
        `📦 Size: ${(audioBuf.length / 1024 / 1024).toFixed(2)} MB\n👑 AYOCODES`,
      ),
    });

    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("ToAudio error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Audio extraction failed: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  REMOVE BACKGROUND
// ════════════════════════════════════════════════════════════════════════════
export async function removeBg({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "✨ REMOVE BACKGROUND",
          `Reply to an image with .removebg`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "✨ *Removing background...*" });

    const imageBuffer = await downloadMedia(quoted.imageMessage, "image");
    let resultBuffer = null;

    if (ENV.REMOVEBG_KEY && ENV.REMOVEBG_KEY.length > 10) {
      try {
        const form = new FormData();
        form.append("image_file", imageBuffer, {
          filename: "image.jpg",
          contentType: "image/jpeg",
        });
        form.append("size", "auto");
        const res = await axios.post(
          "https://api.remove.bg/v1.0/removebg",
          form,
          {
            headers: { ...form.getHeaders(), "X-Api-Key": ENV.REMOVEBG_KEY },
            responseType: "arraybuffer",
            timeout: 30000,
          },
        );
        resultBuffer = Buffer.from(res.data);
      } catch (apiErr) {
        console.log(`remove.bg API failed: ${apiErr.message}`);
      }
    }

    if (!resultBuffer) {
      try {
        const form = new FormData();
        form.append("image_file", imageBuffer, {
          filename: "image.jpg",
          contentType: "image/jpeg",
        });
        const res = await axios.post(
          "https://sdk.photoroom.com/v1/segment",
          form,
          {
            headers: { ...form.getHeaders() },
            responseType: "arraybuffer",
            timeout: 30000,
          },
        );
        if (res.data?.byteLength > 1000) resultBuffer = Buffer.from(res.data);
      } catch (_) {}
    }

    if (resultBuffer) {
      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `✨ *Background Removed*\n📦 ${(resultBuffer.length / 1024).toFixed(1)} KB\n👑 AYOCODES`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "REMOVEBG FAILED",
          "Could not remove background. Set REMOVEBG_KEY for better results.",
        ),
      });
    }
  } catch (e) {
    console.error("RemoveBG error:", e);
    await sock.sendMessage(from, { text: formatError("ERROR", e.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MEME
// ════════════════════════════════════════════════════════════════════════════
export async function meme({ message, fullArgs, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 MEME GENERATOR",
          `Reply to an image with:\n.meme <top text> | <bottom text>`,
        ),
      });
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      return sock.sendMessage(from, {
        text: formatError(
          "MEME ERROR",
          `Missing text separator |\n\nFormat: .meme Top | Bottom`,
        ),
      });
    }

    const parts = fullArgs.split("|").map((s) => s.trim());
    const topText = parts[0] || "";
    const bottomText = parts[1] || "";

    await sock.sendMessage(from, { text: "🎨 *Creating meme...*" });

    const imageBuffer = await downloadMedia(quoted.imageMessage, "image");
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width || 512;
    const h = meta.height || 512;
    const fontSize = Math.max(24, Math.floor(w * 0.08));
    const padding = Math.floor(fontSize * 0.6);

    const esc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const svg = `
      <svg width="${w}" height="${h}">
        <style>
          text { font-family: Impact, Arial Black; font-size: ${fontSize}px; font-weight: bold;
                 fill: white; stroke: black; stroke-width: ${Math.max(3, fontSize * 0.12)}px;
                 text-anchor: middle; paint-order: stroke fill; }
        </style>
        ${topText ? `<text x="${w / 2}" y="${padding + fontSize}">${esc(topText.toUpperCase())}</text>` : ""}
        ${bottomText ? `<text x="${w / 2}" y="${h - padding}">${esc(bottomText.toUpperCase())}</text>` : ""}
      </svg>
    `;

    const memeBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: memeBuffer,
      caption: `🎭 *Meme Created*\n📝 ${topText} | ${bottomText}\n👑 AYOCODES`,
    });
  } catch (e) {
    console.error("Meme error:", e);
    await sock.sendMessage(from, {
      text: formatError("MEME ERROR", e.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default {
  sticker,
  toImage,
  toVideo,
  toGif,
  toAudio,
  removeBg,
  meme,
};
