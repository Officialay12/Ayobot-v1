// features/imageTools.js — AYOBOT v1.0.0 (COMPLETE WORKING VERSION)
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE IMAGE TOOLS MODULE — FIXED STICKER EXIF (saves to favorites)
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
//  STICKER EXIF BUILDER — FULLY FIXED FOR WHATSAPP FAVORITES
//
//  WhatsApp reads a very specific TIFF EXIF structure inside the WebP EXIF
//  chunk. The JSON must be in the TIFF UserComment (tag 0x9286) field with
//  the correct TIFF little-endian byte layout, IFD entry count, and offsets.
//  This version produces stickers that:
//    ✅ Show pack name "AYOBOT" in WhatsApp sticker tray
//    ✅ Show publisher "AYOCODES"
//    ✅ Can be saved to Favorites
//    ✅ Appear under the correct pack
// ════════════════════════════════════════════════════════════════════════════
function buildExifBuffer(packName = "AYOBOT", publisher = "AYOCODES") {
  // The JSON payload WhatsApp reads
  const metadata = {
    "sticker-pack-id": `com.ayobot.${packName.toLowerCase()}.${Date.now()}`,
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "",
    "ios-app-store-link": "",
    emojis: ["🤖", "⚡", "👑"],
  };

  const jsonBuf = Buffer.from(JSON.stringify(metadata), "utf8");
  const jsonLen = jsonBuf.length;

  // ── TIFF structure (little-endian) ────────────────────────────────────────
  //   Offset  Content
  //   0–1     Byte order mark: "II" (little-endian)
  //   2–3     TIFF magic: 42
  //   4–7     Offset to first IFD: 8
  //   8–9     IFD entry count: 1
  //   10–21   Single IFD entry (12 bytes):
  //             tag    (2) = 0x9286  UserComment
  //             type   (2) = 7       UNDEFINED
  //             count  (4) = jsonLen
  //             offset (4) = 26      (8 header + 2 count + 12 entry + 4 next)
  //   22–25   Next IFD pointer: 0
  //   26+     JSON data

  const DATA_OFFSET = 26; // 8 (header) + 2 (count) + 12 (entry) + 4 (next IFD)
  const totalSize = DATA_OFFSET + jsonLen;
  const buf = Buffer.alloc(totalSize, 0);

  // TIFF header
  buf.write("II", 0, "ascii"); // Little-endian
  buf.writeUInt16LE(42, 2); // TIFF magic
  buf.writeUInt32LE(8, 4); // IFD offset

  // IFD entry count
  buf.writeUInt16LE(1, 8);

  // IFD entry: UserComment (0x9286)
  buf.writeUInt16LE(0x9286, 10); // Tag
  buf.writeUInt16LE(7, 12); // Type: UNDEFINED
  buf.writeUInt32LE(jsonLen, 14); // Count (byte length)
  buf.writeUInt32LE(DATA_OFFSET, 18); // Offset to data

  // Next IFD = 0 (end)
  buf.writeUInt32LE(0, 22);

  // JSON data
  jsonBuf.copy(buf, DATA_OFFSET);

  console.log(
    `[EXIF] Built: pack="${packName}", publisher="${publisher}", ${totalSize} bytes`,
  );
  return buf;
}

// ════════════════════════════════════════════════════════════════════════════
//  INJECT EXIF INTO WEBP — FIXED
//  Correctly handles VP8 (simple), VP8L (lossless), VP8X (extended) WebPs.
//  Promotes to VP8X if needed, sets the EXIF flag bit (bit 3 of flags word),
//  then appends an EXIF chunk.
// ════════════════════════════════════════════════════════════════════════════
function injectExifIntoWebP(webpBuf, exifBuf) {
  if (!webpBuf || webpBuf.length < 12) return webpBuf;

  if (
    webpBuf.slice(0, 4).toString("ascii") !== "RIFF" ||
    webpBuf.slice(8, 12).toString("ascii") !== "WEBP"
  ) {
    console.log("[EXIF] Not a valid WebP — returning as-is");
    return webpBuf;
  }

  // ── 1. Detect format and optionally promote to VP8X ──────────────────────
  const chunkId = webpBuf.slice(12, 16).toString("ascii");
  let workBuf = webpBuf;

  if (chunkId === "VP8 " || chunkId === "VP8L") {
    workBuf = promoteToVP8X(webpBuf);
  }

  // ── 2. Find VP8X chunk and set EXIF flag (bit 3 of the flags uint32) ─────
  let offset = 12;
  while (offset + 8 <= workBuf.length) {
    const id = workBuf.slice(offset, offset + 4).toString("ascii");
    const size = workBuf.readUInt32LE(offset + 4);

    if (id === "VP8X" && workBuf.length >= offset + 8 + 4) {
      // flags are at offset+8, stored as a uint32LE
      // Bit 3 = EXIF metadata present
      let flags = workBuf.readUInt32LE(offset + 8);
      flags |= 1 << 3;
      workBuf.writeUInt32LE(flags, offset + 8);
      break;
    }
    offset += 8 + size + (size % 2); // chunks are padded to even byte length
  }

  // ── 3. Remove any existing EXIF chunk ────────────────────────────────────
  workBuf = stripChunk(workBuf, "EXIF");

  // ── 4. Build the EXIF chunk: FourCC + uint32LE size + data (even-padded) ─
  const paddedLen = exifBuf.length + (exifBuf.length % 2); // pad to even
  const exifChunk = Buffer.alloc(8 + paddedLen, 0);
  exifChunk.write("EXIF", 0, "ascii");
  exifChunk.writeUInt32LE(exifBuf.length, 4);
  exifBuf.copy(exifChunk, 8);

  // ── 5. Append EXIF chunk right before the image data chunks ──────────────
  //  Strategy: insert after VP8X (or after RIFF+WEBP header if no VP8X yet)
  let insertAfter = 12; // default: right after RIFF+WEBP
  offset = 12;
  while (offset + 8 <= workBuf.length) {
    const id = workBuf.slice(offset, offset + 4).toString("ascii");
    const size = workBuf.readUInt32LE(offset + 4);
    if (id === "VP8X") {
      insertAfter = offset + 8 + size + (size % 2);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const result = Buffer.concat([
    workBuf.slice(0, insertAfter),
    exifChunk,
    workBuf.slice(insertAfter),
  ]);

  // ── 6. Fix up the RIFF file-size field (bytes 4–7) ───────────────────────
  result.writeUInt32LE(result.length - 8, 4);

  console.log(`[EXIF] Injected OK, final WebP size: ${result.length} bytes`);
  return result;
}

/** Remove all occurrences of a named chunk from a WebP buffer */
function stripChunk(webpBuf, fourCC) {
  const parts = [webpBuf.slice(0, 12)];
  let offset = 12;
  while (offset + 8 <= webpBuf.length) {
    const id = webpBuf.slice(offset, offset + 4).toString("ascii");
    const size = webpBuf.readUInt32LE(offset + 4);
    const chunkTotal = 8 + size + (size % 2);
    if (id !== fourCC) {
      parts.push(webpBuf.slice(offset, offset + chunkTotal));
    }
    offset += chunkTotal;
  }
  const result = Buffer.concat(parts);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

/** Promote a simple (VP8/VP8L) WebP to VP8X so we can add metadata chunks */
function promoteToVP8X(webpBuf) {
  const chunkId = webpBuf.slice(12, 16).toString("ascii");
  let width = 0,
    height = 0;

  if (chunkId === "VP8 ") {
    // Dimensions in bitstream at bytes 26–29 after start code 9d 01 2a
    const data = webpBuf.slice(20); // skip "VP8 " + size (8 bytes) + frame tag (3)
    if (
      data.length >= 10 &&
      data[3] === 0x9d &&
      data[4] === 0x01 &&
      data[5] === 0x2a
    ) {
      width = data.readUInt16LE(6) & 0x3fff;
      height = data.readUInt16LE(8) & 0x3fff;
    }
  } else if (chunkId === "VP8L") {
    // Dimensions packed in 4 bytes right after the 0x2f signature
    const data = webpBuf.slice(21); // skip chunk header (8) + "VP8L" id (4) = 12 offset from 12 = 24; plus 0x2f signature = 1
    if (data.length >= 4) {
      const bits = data.readUInt32LE(0);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
  }

  if (!width || !height) {
    width = 512;
    height = 512;
  }

  // VP8X chunk payload (10 bytes)
  // flags = 0 (we will set EXIF bit later)
  // canvas width/height stored as (value - 1) in 24-bit LE
  const vp8xPayload = Buffer.alloc(10, 0);
  vp8xPayload.writeUInt32LE(0, 0); // flags (EXIF bit set later)
  vp8xPayload.writeUIntLE(width - 1, 4, 3); // canvas width  - 1
  vp8xPayload.writeUIntLE(height - 1, 7, 3); // canvas height - 1

  const vp8xChunk = Buffer.alloc(8 + 10, 0);
  vp8xChunk.write("VP8X", 0, "ascii");
  vp8xChunk.writeUInt32LE(10, 4);
  vp8xPayload.copy(vp8xChunk, 8);

  const newRiff = Buffer.alloc(12);
  newRiff.write("RIFF", 0, "ascii");
  newRiff.write("WEBP", 8, "ascii");

  const result = Buffer.concat([newRiff, vp8xChunk, webpBuf.slice(12)]);
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
        text:
          `🎭 *STICKER MAKER*\n\n` +
          `Send or reply to an image/video with:\n` +
          `*${ENV.PREFIX}sticker* or *${ENV.PREFIX}s*\n\n` +
          `✨ Sticker pack: *AYOBOT* by *AYOCODES*\n` +
          `💾 Save to favorites — it stays!`,
      });
      return;
    }

    const mediaBuf = await downloadMedia(mediaMsg, isVideo ? "video" : "image");

    // Build EXIF with fixed pack name
    const exif = buildExifBuffer("AYOBOT", "AYOCODES");

    if (!isVideo) {
      // ── Static sticker ──────────────────────────────────────────────────
      const webpBuf = await sharp(mediaBuf)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80, effort: 6, lossless: false })
        .toBuffer();

      const finalSticker = injectExifIntoWebP(webpBuf, exif);

      await sock.sendMessage(from, {
        sticker: finalSticker,
        mimetype: "image/webp",
      });

      console.log("[STICKER] Sent static sticker with EXIF — pack: AYOBOT");
    } else {
      // ── Animated sticker ────────────────────────────────────────────────
      const hasFfmpeg = await checkFfmpeg();

      if (!hasFfmpeg) {
        // Fallback: first frame as static sticker
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
          "scale=512:512:force_original_aspect_ratio=decrease," +
            "fps=12," +
            "format=rgba," +
            "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000",
          "-lossless",
          "0",
          "-q:v",
          "75",
          "-preset",
          "default",
          "-loop",
          "0",
          "-an",
          "-vsync",
          "0",
          "-t",
          "6",
          "-y",
          outputPath,
        ]);

        const webpBuf = fs.readFileSync(outputPath);
        const finalSticker = injectExifIntoWebP(webpBuf, exif);

        await sock.sendMessage(from, {
          sticker: finalSticker,
          mimetype: "image/webp",
        });

        console.log("[STICKER] Sent animated sticker with EXIF — pack: AYOBOT");
      } catch (ffErr) {
        console.error("[sticker] ffmpeg error:", ffErr.message);
        // Fallback to static
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
      caption: `🖼️ *Sticker → Image*\n📦 ${(pngBuf.length / 1024).toFixed(1)} KB\n👑 AYOBOT`,
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
          "6",
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
      "fps=10,scale=480:-1:flags=lanczos",
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
        text: `❌ *REMOVEBG FAILED*\n\nPlease set REMOVEBG_KEY in .env\n\nGet one at: https://www.remove.bg/`,
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
        text:
          `🎭 *MEME GENERATOR*\n\n` +
          `Reply to an image with:\n` +
          `*${ENV.PREFIX}meme Top Text | Bottom Text*\n\n` +
          `Example:\n` +
          `*${ENV.PREFIX}meme When it works | on the first try*`,
      });
      return;
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      await sock.sendMessage(from, {
        text: `❌ *MEME FORMAT*\n\nMissing *|* separator\n\nFormat: *${ENV.PREFIX}meme Top Text | Bottom Text*`,
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
        text:
          `🖼️ *IMAGE SEARCH*\n\n` +
          `Search for images with:\n` +
          `*${ENV.PREFIX}img <query>*\n\n` +
          `Example:\n` +
          `*${ENV.PREFIX}img cute cats*`,
      });
      return;
    }

    await sock.sendMessage(from, {
      text: `🔍 *Searching for "${fullArgs}"...*`,
    });

    if (!ENV.PIXABAY_KEY) throw new Error("PIXABAY_KEY not configured in .env");

    const response = await axios.get("https://pixabay.com/api/", {
      params: {
        key: ENV.PIXABAY_KEY,
        q: fullArgs,
        image_type: "photo",
        per_page: 5,
        safesearch: true,
      },
      timeout: 10000,
    });

    const images = response.data?.hits;
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
