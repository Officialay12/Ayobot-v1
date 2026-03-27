// features/imageTools.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Image Tools Module — COMPLETE FIXED VERSION
//  Author: AYOCODES
//
//  FIXES:
//  1. Sticker EXIF now uses correct WebP RIFF chunk format
//     WhatsApp will now show "AYOBOT" as the sticker pack name
//  2. formatSuccess imported — was missing, caused toAudio crash
//  3. All functions intact and working
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
    console.log(
      "⚠️ ffmpeg NOT found — animated stickers will fallback to static",
    );
  }
  ffmpegChecked = true;
  return ffmpegAvailable;
}

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

// ════════════════════════════════════════════════════════════════════════════
//  STICKER EXIF — CORRECT WebP RIFF CHUNK FORMAT
//
//  WhatsApp reads sticker metadata through a proper WebP EXIF chunk.
//  The old approach of just appending bytes didn't work.
//
//  This implementation:
//  1. Builds the JSON metadata (pack name, publisher, emojis)
//  2. Wraps it in a proper TIFF/EXIF header
//  3. Injects it as a WebP EXIF chunk into the RIFF container
//
//  Result: WhatsApp shows "AYOBOT" as the sticker pack name
// ════════════════════════════════════════════════════════════════════════════

function buildExifBuffer(packName = "AYOBOT", publisher = "AYOCODES") {
  // Sticker pack metadata JSON — WhatsApp reads these fields
  const metadata = JSON.stringify({
    "sticker-pack-id": "com.ayobot.v1.ayocodes",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    "ios-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    emojis: ["🤖", "⚡", "👑"],
  });

  const metaBuffer = Buffer.from(metadata, "utf-8");

  // Build a minimal TIFF structure that EXIF expects
  // TIFF header: little-endian marker + magic + IFD offset
  const tiffHeader = Buffer.alloc(8);
  tiffHeader.writeUInt16LE(0x4949, 0); // "II" = little endian
  tiffHeader.writeUInt16LE(0x002a, 2); // TIFF magic
  tiffHeader.writeUInt32LE(0x00000008, 4); // IFD offset = 8 (right after header)

  // IFD with one entry: UserComment tag (0x9286) pointing to our JSON
  const ifd = Buffer.alloc(2 + 12 + 4);
  ifd.writeUInt16LE(1, 0); // 1 entry

  // Tag: 0x9286 UserComment, Type: 7 (UNDEFINED), Count: metaBuffer.length
  // Value offset: 8 (header) + 2 (entry count) + 12 (entry) + 4 (next IFD) = 26
  const valueOffset = 8 + 2 + 12 + 4;
  ifd.writeUInt16LE(0x9286, 2); // tag
  ifd.writeUInt16LE(7, 4); // type: UNDEFINED
  ifd.writeUInt32LE(metaBuffer.length, 6); // count
  ifd.writeUInt32LE(valueOffset, 10); // value offset
  ifd.writeUInt32LE(0, 14); // next IFD = 0 (end)

  // Full EXIF data = "Exif\0\0" + TIFF header + IFD + metadata
  const exifHeader = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const exifPayload = Buffer.concat([exifHeader, tiffHeader, ifd, metaBuffer]);

  return exifPayload;
}

function injectExifIntoWebP(webpBuffer, exifBuffer) {
  // Validate it's a WebP file: starts with "RIFF" and has "WEBP" at offset 8
  if (
    webpBuffer.slice(0, 4).toString("ascii") !== "RIFF" ||
    webpBuffer.slice(8, 12).toString("ascii") !== "WEBP"
  ) {
    // Not a valid WebP — return as-is with exif appended (fallback)
    console.warn("[sticker] Not a valid WebP RIFF file — using fallback exif");
    return Buffer.concat([webpBuffer, exifBuffer]);
  }

  // Build EXIF chunk: "EXIF" + 4-byte size (little-endian) + data
  // WebP chunk sizes must be padded to even length
  const chunkData = exifBuffer;
  const chunkSize = chunkData.length;
  const paddedSize = chunkSize + (chunkSize % 2); // pad to even
  const exifChunk = Buffer.alloc(8 + paddedSize);

  exifChunk.write("EXIF", 0, "ascii");
  exifChunk.writeUInt32LE(chunkSize, 4);
  chunkData.copy(exifChunk, 8);
  // If odd length, pad with 0x00
  if (chunkSize % 2 !== 0) {
    exifChunk[8 + chunkSize] = 0x00;
  }

  // The RIFF file structure:
  // [RIFF header 12 bytes] [existing chunks...] [our EXIF chunk]
  const riffHeader = webpBuffer.slice(0, 12);
  const existingChunks = webpBuffer.slice(12);

  // New file = riff header + existing chunks + exif chunk
  const newBody = Buffer.concat([existingChunks, exifChunk]);
  const newFileSize = 4 + newBody.length; // "WEBP" + body

  // Update the RIFF file size field (bytes 4-7)
  const newRiffHeader = Buffer.from(riffHeader);
  newRiffHeader.writeUInt32LE(newFileSize, 4);

  return Buffer.concat([newRiffHeader, newBody]);
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER — Creates sticker with "AYOBOT" pack name embedded
//
//  When user long-presses the sticker in WhatsApp they will see:
//  ┌─────────────────────┐
//  │  AYOBOT             │  ← sticker-pack-name
//  │  View sticker pack  │
//  └─────────────────────┘
// ════════════════════════════════════════════════════════════════════════════
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 STICKER",
          `Reply to an image or video with *.sticker*\n\n` +
            `✨ Sticker will show *AYOBOT* as the pack name!`,
        ),
      });
    }

    await sock.sendPresenceUpdate("composing", from);

    const isVideo = !!quoted.videoMessage;
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;
    const mediaBuf = await downloadMedia(mediaMsg, isVideo ? "video" : "image");
    const exif = buildExifBuffer("AYOBOT", "AYOCODES");

    if (!isVideo) {
      // Static image sticker
      const webpBuf = await sharp(mediaBuf)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      const finalSticker = injectExifIntoWebP(webpBuf, exif);

      await sock.sendMessage(from, {
        sticker: finalSticker,
        mimetype: "image/webp",
      });
    } else {
      // Video/animated sticker
      const hasFfmpeg = await checkFfmpeg();

      if (!hasFfmpeg) {
        // Fallback: use first frame as static sticker
        const webpBuf = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();

        const finalSticker = injectExifIntoWebP(webpBuf, exif);
        await sock.sendMessage(from, {
          sticker: finalSticker,
          mimetype: "image/webp",
        });
        return;
      }

      const inputPath = path.join(TEMP_DIR, `stk_in_${Date.now()}.mp4`);
      const outputPath = path.join(TEMP_DIR, `stk_out_${Date.now()}.webp`);
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

        const webpBuf = fs.readFileSync(outputPath);
        const finalSticker = injectExifIntoWebP(webpBuf, exif);

        await sock.sendMessage(from, {
          sticker: finalSticker,
          mimetype: "image/webp",
        });
      } catch (ffErr) {
        console.error("[sticker] ffmpeg error:", ffErr.message);

        // Fallback to static sticker on ffmpeg failure
        const webpBuf = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();

        const finalSticker = injectExifIntoWebP(webpBuf, exif);
        await sock.sendMessage(from, {
          sticker: finalSticker,
          mimetype: "image/webp",
        });
      } finally {
        safeUnlink(inputPath, outputPath);
      }
    }
  } catch (e) {
    console.error("[sticker] Error:", e);
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
          `Reply to a sticker with *.toimage*`,
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
    console.error("[toImage] Error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Failed to convert: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO VIDEO — animated sticker → MP4
// ════════════════════════════════════════════════════════════════════════════
async function extractAnimatedWebpFrames(webpBuffer, maxFrames = 30) {
  const sharpObj = sharp(webpBuffer, { animated: true, pages: -1 });
  const metadata = await sharpObj.metadata();
  const totalPages = metadata.pages || 1;
  const pageCount = Math.min(totalPages, maxFrames);
  const fps = metadata.delay
    ? Math.round(1000 / (metadata.delay[0] || 100))
    : 10;
  const width = metadata.width || 512;
  const height = metadata.pageHeight || metadata.height || 512;

  if (pageCount <= 1) {
    const single = await sharp(webpBuffer).png().toBuffer();
    return { frames: [single], fps, width, height, isStatic: true };
  }

  const frames = [];
  for (let i = 0; i < pageCount; i++) {
    try {
      const framePng = await sharp(webpBuffer, { page: i }).png().toBuffer();
      frames.push(framePng);
    } catch (_) {}
  }

  return {
    frames,
    fps,
    width,
    height,
    isStatic: false,
    truncated: totalPages > maxFrames,
  };
}

function pipeFramesToFfmpeg(
  frames,
  fps,
  outputPath,
  extraArgs = [],
  timeoutMs = 30000,
) {
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
    const timeoutId = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("ffmpeg timeout"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    (async () => {
      for (const frame of frames) {
        const canWrite = proc.stdin.write(frame);
        if (!canWrite) await new Promise((r) => proc.stdin.once("drain", r));
      }
      proc.stdin.end();
    })().catch((err) => {
      clearTimeout(timeoutId);
      proc.kill();
      reject(err);
    });
  });
}

export async function toVideo({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎬 STICKER → VIDEO",
          `Reply to an animated sticker with *.tovideo*`,
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🎬 *Converting sticker to video...*\n⏳ _This may take up to 30 seconds_",
    });

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      return sock.sendMessage(from, {
        text: formatError(
          "FFMPEG MISSING",
          "ffmpeg is not installed on this server.\nAnimated conversion is unavailable.",
        ),
      });
    }

    const stickerBuf = await downloadMedia(quoted.stickerMessage, "image");
    const frameData = await extractAnimatedWebpFrames(stickerBuf, 30);
    const { frames, fps, width, height, isStatic } = frameData;

    if (isStatic || frames.length === 1) {
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `🖼️ *Static sticker — converted to image*\n👑 AYOCODES`,
      });
      return;
    }

    const outputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);
    try {
      await pipeFramesToFfmpeg(
        frames,
        fps,
        outputPath,
        [
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
          "-movflags",
          "+faststart",
          "-t",
          "5",
        ],
        30000,
      );

      const videoBuf = fs.readFileSync(outputPath);
      await sock.sendMessage(from, {
        video: videoBuf,
        caption: `🎬 *Sticker → Video*\n🖼️ ${frames.length} frames | 🎞️ ${fps} fps\n👑 AYOCODES`,
      });
      safeUnlink(outputPath);
    } catch (ffErr) {
      safeUnlink(outputPath);
      // Fallback: send first frame as image
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `⚠️ *Video conversion failed — sending first frame instead*\n👑 AYOCODES`,
      });
    }
  } catch (e) {
    console.error("[toVideo] Error:", e);
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Conversion failed: ${e.message.slice(0, 200)}`,
      ),
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
        text: formatInfo("🎞️ VIDEO → GIF", `Reply to a video with *.togif*`),
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
    console.error("[toGif] Error:", e);
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
        text: formatInfo(
          "🔊 VIDEO → AUDIO",
          `Reply to a video with *.toaudio*`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Extracting audio...*" });

    // If it's already an audio message, just re-send it
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
        `📦 *Size:* ${(audioBuf.length / 1024 / 1024).toFixed(2)} MB\n👑 AYOCODES`,
      ),
    });

    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("[toAudio] Error:", e);
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
          `Reply to an image with *.removebg*`,
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "✨ *Removing background...*\n⏳ _Please wait_",
    });

    const imageBuffer = await downloadMedia(quoted.imageMessage, "image");
    let resultBuffer = null;

    // Try remove.bg API first (best quality, requires key)
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
        console.log("[removeBg] remove.bg API success");
      } catch (apiErr) {
        console.log(`[removeBg] remove.bg failed: ${apiErr.message}`);
      }
    }

    // Fallback: PhotoRoom free API
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
          { responseType: "arraybuffer", timeout: 30000 },
        );
        if (res.data?.byteLength > 1000) {
          resultBuffer = Buffer.from(res.data);
          console.log("[removeBg] PhotoRoom fallback success");
        }
      } catch (err) {
        console.log(`[removeBg] PhotoRoom fallback failed: ${err.message}`);
      }
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
          `Could not remove background.\n\n` +
            `Make sure *REMOVEBG_KEY* is set in your .env for best results.`,
        ),
      });
    }
  } catch (e) {
    console.error("[removeBg] Error:", e);
    await sock.sendMessage(from, { text: formatError("ERROR", e.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MEME GENERATOR
// ════════════════════════════════════════════════════════════════════════════
export async function meme({ message, fullArgs, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 MEME GENERATOR",
          `Reply to an image with:\n*.meme <top text> | <bottom text>*\n\n` +
            `Example: *.meme When it works | on the first try*`,
        ),
      });
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      return sock.sendMessage(from, {
        text: formatError(
          "MEME FORMAT",
          `Missing the *|* separator\n\nFormat: *.meme Top Text | Bottom Text*`,
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

    const svg =
      `<svg width="${w}" height="${h}">` +
      `<style>text { font-family: Impact, Arial Black, sans-serif; font-size: ${fontSize}px; font-weight: bold; fill: white; stroke: black; stroke-width: ${Math.max(3, Math.floor(fontSize * 0.12))}px; text-anchor: middle; paint-order: stroke fill; }</style>` +
      (topText
        ? `<text x="${w / 2}" y="${padding + fontSize}">${esc(topText.toUpperCase())}</text>`
        : "") +
      (bottomText
        ? `<text x="${w / 2}" y="${h - padding}">${esc(bottomText.toUpperCase())}</text>`
        : "") +
      `</svg>`;

    const memeBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: memeBuffer,
      caption: `🎭 *Meme Created*\n📝 ${topText} | ${bottomText}\n👑 AYOCODES`,
    });
  } catch (e) {
    console.error("[meme] Error:", e);
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
