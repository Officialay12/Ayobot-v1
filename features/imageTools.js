// features/imageTools.js — AYOBOT v1.0.0 (COMPLETE WORKING VERSION)
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE IMAGE TOOLS MODULE — WORKING EXIF
//  Author: AYOCODES
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

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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
  } catch (_) {
    ffmpegAvailable = false;
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
//  STICKER EXIF BUILDER — WORKING VERSION
//  Creates proper TIFF EXIF data that WhatsApp can read
// ════════════════════════════════════════════════════════════════════════════
function buildExifBuffer(packName = "AYOBOT", publisher = "AYOCODES") {
  // Create the metadata object
  const metadata = {
    "sticker-pack-id": `com.ayobot.stickers.${Date.now()}`,
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    "ios-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    "sticker-pack-version": "1.0.0",
    emojis: ["🤖", "⚡", "👑", "🎨", "✨"],
  };

  const jsonString = JSON.stringify(metadata);
  const jsonBuffer = Buffer.from(jsonString, "utf-8");

  // Build TIFF structure
  // Header: II (Intel byte order) + 42 (magic) + offset to IFD (8)
  const tiffHeader = Buffer.alloc(8);
  tiffHeader.write("II", 0, 2); // Byte order: little-endian
  tiffHeader.writeUInt16LE(42, 2); // TIFF magic number
  tiffHeader.writeUInt32LE(8, 4); // Offset to first IFD

  // IFD (Image File Directory)
  // Entry count (1) + entry data + next IFD offset (0)
  const ifdEntry = Buffer.alloc(18);
  ifdEntry.writeUInt16LE(1, 0); // One IFD entry

  // IFD Entry for UserComment (tag 0x9286)
  ifdEntry.writeUInt16LE(0x9286, 2); // Tag: UserComment
  ifdEntry.writeUInt16LE(7, 4); // Type: UNDEFINED
  ifdEntry.writeUInt32LE(jsonBuffer.length, 6); // Length of comment
  ifdEntry.writeUInt32LE(26, 10); // Offset to comment data

  // Next IFD pointer (0 = end)
  ifdEntry.writeUInt32LE(0, 14);

  // Combine everything
  const exifBuffer = Buffer.concat([tiffHeader, ifdEntry, jsonBuffer]);

  console.log(
    `[EXIF] Created EXIF data: pack="${packName}", publisher="${publisher}", size=${exifBuffer.length} bytes`,
  );
  return exifBuffer;
}

// ════════════════════════════════════════════════════════════════════════════
//  INJECT EXIF INTO WEBP — WORKING VERSION
//  Properly adds EXIF chunk to WebP files
// ════════════════════════════════════════════════════════════════════════════
function injectExifIntoWebP(webpBuffer, exifBuffer) {
  if (!webpBuffer || webpBuffer.length < 12) {
    console.log("[EXIF] Invalid WebP buffer");
    return webpBuffer;
  }

  // Check WebP header
  const riffHeader = webpBuffer.slice(0, 4).toString("ascii");
  const webpHeader = webpBuffer.slice(8, 12).toString("ascii");

  if (riffHeader !== "RIFF" || webpHeader !== "WEBP") {
    console.log("[EXIF] Not a valid WebP file");
    return webpBuffer;
  }

  // Create EXIF chunk (4CC + size + data, padded to even length)
  const exifChunkSize = exifBuffer.length;
  const paddedSize = exifChunkSize + (exifChunkSize % 2);
  const exifChunk = Buffer.alloc(8 + paddedSize);

  exifChunk.write("EXIF", 0, 4); // Chunk FourCC
  exifChunk.writeUInt32LE(exifChunkSize, 4); // Chunk size
  exifBuffer.copy(exifChunk, 8); // Copy EXIF data

  // If the chunk needs padding, it's already zeroed

  // Check if WebP already has EXIF or is extended
  let hasExif = false;
  let isExtended = false;
  let offset = 12; // Start after RIFF header

  while (offset + 8 <= webpBuffer.length) {
    const chunkId = webpBuffer.slice(offset, offset + 4).toString("ascii");
    const chunkSize = webpBuffer.readUInt32LE(offset + 4);

    if (chunkId === "EXIF") {
      hasExif = true;
      break;
    }
    if (chunkId === "VP8X") {
      isExtended = true;
    }
    if (chunkId === "VP8 " || chunkId === "VP8L") {
      break; // Reached image data
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (hasExif) {
    console.log("[EXIF] WebP already has EXIF chunk, replacing...");
    // Remove existing EXIF chunk and rebuild
    return injectExifIntoWebP(removeExifChunk(webpBuffer), exifBuffer);
  }

  if (!isExtended) {
    console.log("[EXIF] Converting to extended WebP format...");
    // Promote to VP8X format first
    const promoted = promoteToExtendedWebP(webpBuffer);
    return injectExifIntoWebP(promoted, exifBuffer);
  }

  // Insert EXIF chunk after VP8X or at appropriate position
  let insertPos = 12;
  let currentOffset = 12;

  while (currentOffset + 8 <= webpBuffer.length) {
    const chunkId = webpBuffer
      .slice(currentOffset, currentOffset + 4)
      .toString("ascii");
    const chunkSize = webpBuffer.readUInt32LE(currentOffset + 4);

    if (chunkId === "VP8X") {
      // Insert EXIF right after VP8X
      insertPos = currentOffset + 8 + chunkSize + (chunkSize % 2);

      // Update VP8X flags to indicate EXIF presence
      if (webpBuffer.length > currentOffset + 8 + 4) {
        const flagsOffset = currentOffset + 8;
        const flags = webpBuffer.readUInt32LE(flagsOffset);
        webpBuffer.writeUInt32LE(flags | (1 << 3), flagsOffset); // Set EXIF bit
      }
      break;
    }
    currentOffset += 8 + chunkSize + (chunkSize % 2);
  }

  // Insert EXIF chunk
  const before = webpBuffer.slice(0, insertPos);
  const after = webpBuffer.slice(insertPos);
  const result = Buffer.concat([before, exifChunk, after]);

  // Update RIFF file size
  const newSize = result.length - 8;
  result.writeUInt32LE(newSize, 4);

  console.log(
    `[EXIF] Successfully injected EXIF, final size: ${result.length} bytes`,
  );
  return result;
}

function removeExifChunk(webpBuffer) {
  let offset = 12;
  const chunks = [];

  while (offset + 8 <= webpBuffer.length) {
    const chunkId = webpBuffer.slice(offset, offset + 4).toString("ascii");
    const chunkSize = webpBuffer.readUInt32LE(offset + 4);

    if (chunkId !== "EXIF") {
      chunks.push(
        webpBuffer.slice(offset, offset + 8 + chunkSize + (chunkSize % 2)),
      );
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const result = Buffer.concat([webpBuffer.slice(0, 12), ...chunks]);

  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

function promoteToExtendedWebP(webpBuffer) {
  // Extract dimensions from VP8/VP8L
  let width = 512;
  let height = 512;

  const chunkId = webpBuffer.slice(12, 16).toString("ascii");

  if (chunkId === "VP8 ") {
    // Parse VP8 dimensions
    const vp8Data = webpBuffer.slice(20);
    if (
      vp8Data.length >= 10 &&
      vp8Data[3] === 0x9d &&
      vp8Data[4] === 0x01 &&
      vp8Data[5] === 0x2a
    ) {
      width = vp8Data.readUInt16LE(6) & 0x3fff;
      height = vp8Data.readUInt16LE(8) & 0x3fff;
    }
  } else if (chunkId === "VP8L") {
    // Parse VP8L dimensions
    const vp8lData = webpBuffer.slice(21);
    if (vp8lData.length >= 4) {
      const bits = vp8lData.readUInt32LE(0);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
  }

  // Create VP8X chunk
  const vp8xData = Buffer.alloc(10);
  vp8xData.writeUInt32LE(0, 0); // Flags (will be updated when EXIF is added)
  vp8xData.writeUIntLE(width - 1, 4, 3);
  vp8xData.writeUIntLE(height - 1, 7, 3);

  const vp8xChunk = Buffer.alloc(12 + 10);
  vp8xChunk.write("VP8X", 0, 4);
  vp8xChunk.writeUInt32LE(10, 4);
  vp8xData.copy(vp8xChunk, 8);

  // Combine: RIFF header + VP8X + original chunks
  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0, 4);
  riffHeader.write("WEBP", 8, 4);

  const originalChunks = webpBuffer.slice(12);
  const result = Buffer.concat([riffHeader, vp8xChunk, originalChunks]);
  result.writeUInt32LE(result.length - 8, 4);

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER — MAIN COMMAND
// ════════════════════════════════════════════════════════════════════════════
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasDirectMedia =
      message.message?.imageMessage || message.message?.videoMessage;

    let mediaMsg = null;
    let isVideo = false;

    if (quoted && (quoted.imageMessage || quoted.videoMessage)) {
      mediaMsg = quoted.imageMessage || quoted.videoMessage;
      isVideo = !!quoted.videoMessage;
    } else if (hasDirectMedia) {
      mediaMsg = message.message.imageMessage || message.message.videoMessage;
      isVideo = !!message.message.videoMessage;
    }

    if (!mediaMsg) {
      await sock.sendMessage(from, {
        text: `🎭 *STICKER MAKER*\n\nSend or reply to an image/video with:\n*${ENV.PREFIX}sticker* or *${ENV.PREFIX}s*\n\n✨ Tap the sticker to see *AYOBOT* pack name!`,
      });
      return;
    }

    const mediaBuf = await downloadMedia(mediaMsg, isVideo ? "video" : "image");
    const exif = buildExifBuffer("AYOBOT", "AYOCODES");

    if (!isVideo) {
      // Process image to sticker
      const webpBuf = await sharp(mediaBuf)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 85, effort: 6 })
        .toBuffer();

      const finalSticker = injectExifIntoWebP(webpBuf, exif);

      await sock.sendMessage(from, {
        sticker: finalSticker,
        mimetype: "image/webp",
      });

      console.log("[STICKER] Sent sticker with EXIF data");
    } else {
      // Process video to animated sticker
      const hasFfmpeg = await checkFfmpeg();

      if (!hasFfmpeg) {
        // Fallback to first frame as static sticker
        const webpBuf = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 85 })
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
          "scale=512:512:force_original_aspect_ratio=decrease,fps=10,format=rgba," +
            "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
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

        console.log("[STICKER] Sent animated sticker with EXIF data");
      } catch (ffErr) {
        console.error("[sticker] ffmpeg error:", ffErr.message);
        // Fallback to static sticker
        const webpBuf = await sharp(mediaBuf)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 85 })
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
      text: `❌ *STICKER ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER TO IMAGE
// ════════════════════════════════════════════════════════════════════════════
export async function toImage({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      await sock.sendMessage(from, {
        text: `🖼️ *STICKER → IMAGE*\n\nReply to a sticker with:\n*${ENV.PREFIX}toimage*`,
      });
      return;
    }

    const stickerBuf = await downloadMedia(quoted.stickerMessage, "image");
    const pngBuf = await sharp(stickerBuf).png({ quality: 100 }).toBuffer();

    await sock.sendMessage(from, {
      image: pngBuf,
      caption: `🖼️ *Sticker Converted to Image*\n📦 ${(pngBuf.length / 1024).toFixed(1)} KB\n👑 AYOBOT`,
    });
  } catch (e) {
    console.error("[toImage] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *CONVERSION ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ANIMATED STICKER TO VIDEO
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
      await sock.sendMessage(from, {
        text: `🎬 *ANIMATED STICKER → VIDEO*\n\nReply to an animated sticker with:\n*${ENV.PREFIX}tovideo*`,
      });
      return;
    }

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      await sock.sendMessage(from, {
        text: `❌ *FFMPEG MISSING*\n\nffmpeg is not installed.`,
      });
      return;
    }

    const stickerBuf = await downloadMedia(quoted.stickerMessage, "image");
    const frameData = await extractAnimatedWebpFrames(stickerBuf, 30);
    const { frames, fps, width, height, isStatic } = frameData;

    if (isStatic || frames.length === 1) {
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `🖼️ *Static Sticker — Converted to Image*\n👑 AYOBOT`,
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
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
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
        caption: `🎬 *Animated Sticker → Video*\n🖼️ ${frames.length} frames | 🎞️ ${fps} fps\n👑 AYOBOT`,
      });
      safeUnlink(outputPath);
    } catch (ffErr) {
      safeUnlink(outputPath);
      await sock.sendMessage(from, {
        image: frames[0],
        caption: `⚠️ *Video conversion failed — sending first frame*\n👑 AYOBOT`,
      });
    }
  } catch (e) {
    console.error("[toVideo] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *CONVERSION ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  VIDEO TO GIF
// ════════════════════════════════════════════════════════════════════════════
export async function toGif({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.videoMessage) {
      await sock.sendMessage(from, {
        text: `🎞️ *VIDEO → GIF*\n\nReply to a video with:\n*${ENV.PREFIX}togif*`,
      });
      return;
    }

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      await sock.sendMessage(from, { text: `❌ *FFMPEG MISSING*` });
      return;
    }

    const videoBuffer = await downloadMedia(quoted.videoMessage, "video");
    if (videoBuffer.length > 50 * 1024 * 1024) {
      await sock.sendMessage(from, {
        text: `❌ *TOO LARGE*\n\nVideo must be under 50MB.`,
      });
      return;
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
      caption: `🎞️ *Video → GIF*\n📦 ${(gifBuffer.length / 1024).toFixed(1)} KB\n👑 AYOBOT`,
    });
    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("[toGif] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *GIF ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  VIDEO TO AUDIO
// ════════════════════════════════════════════════════════════════════════════
export async function toAudio({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.videoMessage && !quoted.audioMessage)) {
      await sock.sendMessage(from, {
        text: `🔊 *VIDEO → AUDIO*\n\nReply to a video with:\n*${ENV.PREFIX}toaudio*`,
      });
      return;
    }

    if (quoted.audioMessage) {
      const audioBuf = await downloadMedia(quoted.audioMessage, "audio");
      await sock.sendMessage(from, {
        audio: audioBuf,
        mimetype: "audio/mp4",
        ptt: false,
      });
      return;
    }

    const hasFfmpeg = await checkFfmpeg();
    if (!hasFfmpeg) {
      await sock.sendMessage(from, { text: `❌ *FFMPEG MISSING*` });
      return;
    }

    const videoBuffer = await downloadMedia(quoted.videoMessage, "video");
    if (videoBuffer.length > 100 * 1024 * 1024) {
      await sock.sendMessage(from, {
        text: `❌ *TOO LARGE*\n\nVideo must be under 100MB.`,
      });
      return;
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
    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("[toAudio] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *AUDIO ERROR*\n\n${e.message.slice(0, 200)}`,
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
      await sock.sendMessage(from, {
        text: `✨ *REMOVE BACKGROUND*\n\nReply to an image with:\n*${ENV.PREFIX}removebg*`,
      });
      return;
    }

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
        console.log(`[removeBg] remove.bg failed: ${apiErr.message}`);
      }
    }

    if (resultBuffer) {
      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `✨ *Background Removed*\n📦 ${(resultBuffer.length / 1024).toFixed(1)} KB\n👑 AYOBOT`,
      });
    } else {
      await sock.sendMessage(from, {
        text: `❌ *REMOVEBG FAILED*\n\nPlease set REMOVEBG_KEY in .env.\n\nGet one at: https://www.remove.bg/`,
      });
    }
  } catch (e) {
    console.error("[removeBg] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *ERROR*\n\n${e.message.slice(0, 200)}`,
    });
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
      await sock.sendMessage(from, {
        text: `🎭 *MEME GENERATOR*\n\nReply to an image with:\n*${ENV.PREFIX}meme Top Text | Bottom Text*\n\nExample:\n*${ENV.PREFIX}meme When it works | on the first try*`,
      });
      return;
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      await sock.sendMessage(from, {
        text: `❌ *MEME FORMAT*\n\nMissing the *|* separator\n\nFormat: *${ENV.PREFIX}meme Top Text | Bottom Text*`,
      });
      return;
    }

    const parts = fullArgs.split("|").map((s) => s.trim());
    const topText = parts[0] || "";
    const bottomText = parts[1] || "";

    const imageBuffer = await downloadMedia(quoted.imageMessage, "image");
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width || 512;
    const h = meta.height || 512;
    const fontSize = Math.max(28, Math.floor(w * 0.08));
    const padding = Math.floor(fontSize * 0.6);
    const strokeWidth = Math.max(4, Math.floor(fontSize * 0.1));

    const esc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const svg = `<svg width="${w}" height="${h}">
      <style>
        text {
          font-family: Impact, Arial Black, sans-serif;
          font-size: ${fontSize}px;
          font-weight: bold;
          fill: white;
          stroke: black;
          stroke-width: ${strokeWidth}px;
          text-anchor: middle;
          paint-order: stroke fill;
        }
      </style>
      ${topText ? `<text x="${w / 2}" y="${padding + fontSize}">${esc(topText.toUpperCase())}</text>` : ""}
      ${bottomText ? `<text x="${w / 2}" y="${h - padding}">${esc(bottomText.toUpperCase())}</text>` : ""}
    </svg>`;

    const memeBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: memeBuffer,
      caption: `🎭 *Meme Created*\n📝 ${topText} | ${bottomText}\n👑 AYOBOT`,
    });
  } catch (e) {
    console.error("[meme] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *MEME ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  IMAGE SEARCH
// ════════════════════════════════════════════════════════════════════════════
export async function imageSearch({ fullArgs, from, sock }) {
  try {
    if (!fullArgs) {
      await sock.sendMessage(from, {
        text: `🖼️ *IMAGE SEARCH*\n\nSearch for images with:\n*${ENV.PREFIX}img <query>*\n\nExample:\n*${ENV.PREFIX}img cute cats*`,
      });
      return;
    }

    await sock.sendMessage(from, {
      text: `🔍 *Searching for "${fullArgs}"...*`,
    });

    const PIXABAY_KEY = ENV.PIXABAY_KEY;
    if (!PIXABAY_KEY) throw new Error("PIXABAY_KEY not configured");

    const response = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: fullArgs,
        image_type: "photo",
        per_page: 5,
        safesearch: true,
      },
      timeout: 10000,
    });

    const images = response.data.hits;
    if (!images || images.length === 0) {
      await sock.sendMessage(from, {
        text: `❌ *No images found* for "${fullArgs}"`,
      });
      return;
    }

    for (let i = 0; i < Math.min(images.length, 3); i++) {
      const img = images[i];
      const imgRes = await axios.get(img.webformatURL, {
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(imgRes.data);
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: `🖼️ *${img.tags || fullArgs}*\n📊 ${img.likes} likes | 👁️ ${img.views} views\n👑 AYOBOT`,
      });
    }
  } catch (e) {
    console.error("[imageSearch] Error:", e);
    await sock.sendMessage(from, {
      text: `❌ *IMAGE SEARCH ERROR*\n\n${e.message.slice(0, 200)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default {
  sticker,
  toImage,
  toVideo,
  toGif,
  toAudio,
  removeBg,
  meme,
  imageSearch,
};
