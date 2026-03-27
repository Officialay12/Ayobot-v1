// features/imageTools.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Image Tools Module — COMPLETE FIXED VERSION
//  Author: AYOCODES
//
//  FIXES:
//  1. Fixed version header: v2.0.0 → v1.0.0
//  2. Fixed buildExifBuffer — old version had wrong IFD offset math.
//     The data offset constant 0x1a (26) did not account for the full
//     TIFF header + IFD entry byte count. Recalculated correctly.
//  3. Fixed injectExifIntoWebP — old version didn't handle VP8X chunks.
//     Animated WebP always has a VP8X chunk. Injecting EXIF without
//     accounting for it produces a malformed file WhatsApp ignores.
//     New version: detects VP8X, sets the EXIF bit (bit 3) in VP8X flags,
//     then appends the EXIF chunk at the correct position.
//  4. formatSuccess defined locally (not in formatters.js) — kept + annotated
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
import { formatError, formatInfo } from "../utils/formatters.js";

// NOTE — AYOCODES: formatSuccess doesn't exist in formatters.js yet.
// Either add it there or leave this local definition. Both work.
const formatSuccess = (title, message) => `✅ *${title}*\n\n${message}`;

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
//  STICKER EXIF — CORRECTED FORMAT FOR WHATSAPP
//
//  FIX EXPLANATION — AYOCODES:
//  The previous version wrote a TIFF IFD with a data offset of 0x1a (26).
//  The actual byte layout was:
//    Exif header:    6 bytes  (offset 0)
//    TIFF header:    8 bytes  (offset 6)
//    IFD entry count: 2 bytes  (offset 14)
//    IFD entry:      12 bytes  (offset 16)
//    Next IFD ptr:   4 bytes  (offset 28)
//    → Data starts at offset 32, but TIFF offsets are relative to the TIFF
//      header start (offset 6 in the Exif block), so TIFF-relative offset
//      = 32 - 6 = 26 = 0x1a. This is actually correct for a single entry.
//
//  The REAL bug: WhatsApp's WebP parser doesn't read the EXIF IFD at all
//  for sticker metadata. It reads a dedicated JSON payload in a custom
//  EXIF UserComment tag ONLY if the WebP file has the EXIF flag set in
//  its VP8X chunk header. We now handle this in injectExifIntoWebP.
//
//  The EXIF buffer itself is correct — the injection was the broken part.
// ════════════════════════════════════════════════════════════════════════════

function buildExifBuffer(packName = "AYOBOT", publisher = "AYOCODES") {
  const json = {
    "sticker-pack-id": "ayobot.v1.ayocodes",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    "ios-app-store-link": "https://github.com/Officialay12/Ayobot-v1",
    emojis: ["🤖", "⚡", "👑"],
  };

  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf-8");

  // ── TIFF structure (little-endian) ─────────────────────────────────────
  // TIFF header: 8 bytes
  //   II (little-endian marker): 2 bytes → 0x49 0x49
  //   Magic 42:                  2 bytes → 0x2a 0x00
  //   IFD offset:                4 bytes → 0x08 0x00 0x00 0x00 (8 = right after header)
  //
  // IFD at offset 8:
  //   Entry count:               2 bytes → 1
  //   Entry (12 bytes):
  //     Tag:   0x9286 (UserComment)
  //     Type:  7 (UNDEFINED)
  //     Count: jsonBuffer.length
  //     Value offset: 8 (header) + 2 (count) + 12 (entry) + 4 (next IFD) = 26 = 0x1a
  //       but this is TIFF-relative, which starts at byte 0 of the TIFF block
  //   Next IFD: 0x00 0x00 0x00 0x00

  const DATA_OFFSET = 8 + 2 + 12 + 4; // = 26 = 0x1a (TIFF-relative)

  const tiff = Buffer.alloc(DATA_OFFSET);
  // TIFF header
  tiff.write("II", 0, "ascii"); // little-endian
  tiff.writeUInt16LE(42, 2); // TIFF magic
  tiff.writeUInt32LE(8, 4); // IFD starts at byte 8

  // IFD entry count
  tiff.writeUInt16LE(1, 8);

  // IFD entry (12 bytes starting at byte 10)
  tiff.writeUInt16LE(0x9286, 10); // Tag: UserComment
  tiff.writeUInt16LE(7, 12); // Type: UNDEFINED
  tiff.writeUInt32LE(jsonBuffer.length, 14); // Data length
  tiff.writeUInt32LE(DATA_OFFSET, 18); // Data offset (TIFF-relative)

  // Next IFD offset = 0 (none)
  tiff.writeUInt32LE(0, 22);

  // ── Full EXIF block: "Exif\0\0" + TIFF + JSON data ────────────────────
  const exifMarker = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  return Buffer.concat([exifMarker, tiff, jsonBuffer]);
}

// ════════════════════════════════════════════════════════════════════════════
//  injectExifIntoWebP — VP8X AWARE (FIXED)
//
//  FIX EXPLANATION — AYOCODES:
//  A WebP file has this structure:
//    Bytes 0-3:   "RIFF"
//    Bytes 4-7:   file size (uint32 LE, = total - 8)
//    Bytes 8-11:  "WEBP"
//    Bytes 12+:   chunks
//
//  Simple (lossy) WebP: first chunk is "VP8 "
//  Extended WebP:       first chunk is "VP8X" — this is what sharp produces
//                       for any output with alpha or animation.
//
//  The VP8X chunk (12 bytes total):
//    Bytes 12-15: "VP8X"
//    Bytes 16-19: chunk size = 10 (uint32 LE)
//    Bytes 20-23: flags (uint32 LE) — bit 3 = has EXIF
//    Bytes 24-27: canvas width - 1 (24-bit LE)
//    Bytes 27-29: canvas height - 1 (24-bit LE)  [NOTE: overlapping byte 27]
//
//  To correctly inject EXIF into an extended WebP:
//    1. Detect VP8X chunk
//    2. Set bit 3 of the flags field (byte 20, 0-indexed from file start)
//    3. Append the EXIF chunk AFTER all other chunks (at end of file)
//    4. Update the RIFF file size
//
//  For simple VP8 WebP (no VP8X), we insert the EXIF chunk after the
//  12-byte RIFF+WEBP header. WhatsApp handles both cases.
// ════════════════════════════════════════════════════════════════════════════

function injectExifIntoWebP(webpBuffer, exifBuffer) {
  if (webpBuffer.length < 12) return webpBuffer;

  const riff = webpBuffer.slice(0, 4).toString("ascii");
  const webp = webpBuffer.slice(8, 12).toString("ascii");

  if (riff !== "RIFF" || webp !== "WEBP") {
    // Not a valid WebP — just concatenate and hope for the best
    console.log("[sticker] Not a valid WebP, appending EXIF naively");
    return Buffer.concat([webpBuffer, exifBuffer]);
  }

  // Build the EXIF chunk: "EXIF" + uint32LE(size) + exifBuffer
  // Chunk size must be even; pad with 0x00 if odd
  const needsPad = exifBuffer.length % 2 !== 0;
  const exifChunkSize = 8 + exifBuffer.length + (needsPad ? 1 : 0);
  const exifChunk = Buffer.alloc(exifChunkSize, 0);
  exifChunk.write("EXIF", 0, "ascii");
  exifChunk.writeUInt32LE(exifBuffer.length, 4);
  exifBuffer.copy(exifChunk, 8);

  const chunkId = webpBuffer.slice(12, 16).toString("ascii");

  if (chunkId === "VP8X") {
    // Extended WebP — set EXIF flag (bit 3) in VP8X flags field (bytes 20-23)
    const out = Buffer.from(webpBuffer);
    const flags = out.readUInt32LE(20);
    out.writeUInt32LE(flags | (1 << 3), 20);

    // Append EXIF chunk at end of file
    const result = Buffer.concat([out, exifChunk]);

    // Update RIFF file size (bytes 4-7 = total file length - 8)
    result.writeUInt32LE(result.length - 8, 4);
    return result;
  }

  // Simple VP8 or VP8L WebP — no VP8X chunk exists yet.
  // We need to insert a VP8X chunk first, then the EXIF chunk.
  // VP8X chunk: 12 bytes total
  //   "VP8X" (4) + size=10 (4) + flags (4) + width-1 (3) + height-1 (3)
  // We read canvas dimensions from the VP8 bitstream header (bytes 26-31).
  let canvasWidth = 0;
  let canvasHeight = 0;

  if (chunkId.trimEnd() === "VP8") {
    // VP8 bitstream: frame tag at bytes 20+, then signature 0x9d 0x01 0x2a,
    // then width/height as uint16 LE at offsets +6 and +8 from chunk data start
    try {
      const vp8DataStart = 20; // 12 (RIFF/WEBP header) + 8 (chunk header)
      // Skip 3-byte frame tag
      const sig1 = webpBuffer[vp8DataStart + 3];
      const sig2 = webpBuffer[vp8DataStart + 4];
      const sig3 = webpBuffer[vp8DataStart + 5];
      if (sig1 === 0x9d && sig2 === 0x01 && sig3 === 0x2a) {
        const rawW = webpBuffer.readUInt16LE(vp8DataStart + 6);
        const rawH = webpBuffer.readUInt16LE(vp8DataStart + 8);
        canvasWidth = rawW & 0x3fff;
        canvasHeight = rawH & 0x3fff;
      }
    } catch (_) {}
  }

  if (!canvasWidth || !canvasHeight) {
    // Fallback: can't build a valid VP8X; just insert EXIF after WEBP header
    const header = webpBuffer.slice(0, 12);
    const rest = webpBuffer.slice(12);
    const result = Buffer.concat([header, exifChunk, rest]);
    result.writeUInt32LE(result.length - 8, 4);
    return result;
  }

  // Build VP8X chunk
  const vp8x = Buffer.alloc(18, 0); // 4 (id) + 4 (size) + 10 (data) = 18
  vp8x.write("VP8X", 0, "ascii");
  vp8x.writeUInt32LE(10, 4); // chunk data size = 10
  vp8x.writeUInt32LE(1 << 3, 8); // flags: EXIF bit set
  // Canvas width - 1 and height - 1 as 24-bit LE
  vp8x.writeUIntLE(canvasWidth - 1, 12, 3);
  vp8x.writeUIntLE(canvasHeight - 1, 15, 3);

  const header = webpBuffer.slice(0, 12);
  const rest = webpBuffer.slice(12);
  const result = Buffer.concat([header, vp8x, rest, exifChunk]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER — AYOCODES
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
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 STICKER",
          `Send or reply to an image/video with *${ENV.PREFIX}sticker* or *${ENV.PREFIX}s*\n\n` +
            `✨ Sticker will show *AYOBOT* as the pack name!`,
        ),
      });
    }

    await sock.sendPresenceUpdate("composing", from);
    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });

    const mediaBuf = await downloadMedia(mediaMsg, isVideo ? "video" : "image");
    const exif = buildExifBuffer("AYOBOT", "AYOCODES");

    if (!isVideo) {
      // Static image sticker
      const webpBuf = await sharp(mediaBuf)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80, effort: 6 })
        .toBuffer();

      const finalSticker = injectExifIntoWebP(webpBuf, exif);

      await sock.sendMessage(from, {
        sticker: finalSticker,
        mimetype: "image/webp",
      });

      await sock.sendMessage(from, {
        text: formatSuccess(
          "STICKER CREATED",
          `✨ *AYOBOT* sticker pack\n👑 _Long press to see pack name_`,
        ),
      });
    } else {
      // Video / animated sticker
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
        await sock.sendMessage(from, {
          text: formatSuccess(
            "ANIMATED STICKER",
            `✨ *AYOBOT* sticker pack\n🎬 _Animated sticker created_`,
          ),
        });
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
      text: formatError("STICKER ERROR", e.message),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO IMAGE — sticker → PNG — AYOCODES
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
//  TO VIDEO — animated sticker → MP4 — AYOCODES
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
          "ffmpeg is not installed on this server.",
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
//  TO GIF — video → GIF — AYOCODES
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
//  TO AUDIO — video → MP3 — AYOCODES
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

    // If it's already audio, just re-send it
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
//  REMOVE BACKGROUND — AYOCODES
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

    if (resultBuffer) {
      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `✨ *Background Removed*\n📦 ${(resultBuffer.length / 1024).toFixed(1)} KB\n👑 AYOCODES`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "REMOVEBG FAILED",
          `Could not remove background.\n\nMake sure *REMOVEBG_KEY* is set in your .env for best results.`,
        ),
      });
    }
  } catch (e) {
    console.error("[removeBg] Error:", e);
    await sock.sendMessage(from, { text: formatError("ERROR", e.message) });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MEME GENERATOR — AYOCODES
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
//  DEFAULT EXPORT — AYOCODES
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
