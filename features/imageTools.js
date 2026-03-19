// features/imageTools.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Image Tools Module (ULTIMATE WORKING EDITION)
//  Author  : AYOCODES
//
//  🚀 FIXED: Actually sends results after processing
//  • Removes progress updates (they're annoying)
//  • Shows clear success/failure messages
//  • Actually sends the converted files
// ════════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import { exec } from "child_process";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import util from "util";
import { ENV } from "../index.js";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

// ── Ensure temp dir exists ────────────────────────────────────────────────────
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Auto-clean temp files older than 1 hour ───────────────────────────────────
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(TEMP_DIR, f);
      if (now - fs.statSync(fp).mtimeMs > 3_600_000) fs.unlinkSync(fp);
    }
  } catch (_) {}
}, 3_600_000);

// ── Check if ffmpeg is available ─────────────────────────────────────────────
let ffmpegAvailable = null;
let ffmpegChecked = false;

async function checkFfmpeg() {
  if (ffmpegChecked) return ffmpegAvailable;

  try {
    await execPromise("ffmpeg -version");
    ffmpegAvailable = true;
    console.log("✅ ffmpeg detected");
  } catch (_) {
    ffmpegAvailable = false;
    console.log("⚠️ ffmpeg NOT found");
  }
  ffmpegChecked = true;
  return ffmpegAvailable;
}

// ── Download media helper (silent, no progress updates) ───────────────────
async function downloadMedia(msg, type) {
  try {
    const stream = await downloadContentFromMessage(msg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    if (!buffer.length) throw new Error("Empty media buffer");
    return buffer;
  } catch (e) {
    throw new Error(`Failed to download media: ${e.message}`);
  }
}

// ── Safe file cleanup ─────────────────────────────────────────────────────────
function safeUnlink(...files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
}

// ── Get video duration ────────────────────────────────────────
async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    );
    return parseFloat(stdout);
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER EXIF METADATA
// ════════════════════════════════════════════════════════════════════════════
function buildStickerExif(packName = "AYOBOT V1", publisher = "AYOCODES") {
  const json = JSON.stringify({
    "sticker-pack-id": "ayobot-v1",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "",
    "ios-app-store-link": "",
  });

  const jsonBuf = Buffer.from(json, "utf-8");
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);

  const exifBuf = Buffer.concat([Buffer.from("Exif\x00\x00"), header, jsonBuf]);
  return exifBuf;
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER
// ════════════════════════════════════════════════════════════════════════════
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 STICKER",
          `Reply to an image or video with .sticker`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });

    const isVideo = !!quoted.videoMessage;
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;
    const mediaBuffer = await downloadMedia(
      mediaMsg,
      isVideo ? "video" : "image",
    );

    const exif = buildStickerExif("AYOBOT V1", "AYOCODES");
    let stickerBuffer;

    if (!isVideo) {
      // Image sticker
      stickerBuffer = await sharp(mediaBuffer)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      await sock.sendMessage(from, {
        sticker: stickerBuffer,
        mimetype: "image/webp",
        exif,
      });
    } else {
      // Video sticker
      const hasFfmpeg = await checkFfmpeg();

      if (!hasFfmpeg) {
        // Static fallback
        stickerBuffer = await sharp(mediaBuffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();

        await sock.sendMessage(from, {
          sticker: stickerBuffer,
          mimetype: "image/webp",
          exif,
        });

        await sock.sendMessage(from, {
          text: "⚠️ ffmpeg not installed - created static sticker instead.",
        });
        return;
      }

      const inputPath = path.join(TEMP_DIR, `sticker_in_${Date.now()}.mp4`);
      const outputPath = path.join(TEMP_DIR, `sticker_out_${Date.now()}.webp`);

      fs.writeFileSync(inputPath, mediaBuffer);

      try {
        await execPromise(
          `ffmpeg -i "${inputPath}" ` +
            `-vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=10,"` +
            `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" ` +
            `-lossless 0 -q:v 70 -preset default -loop 0 -an -vsync 0 -t 5 ` +
            `-y "${outputPath}"`,
        );

        stickerBuffer = fs.readFileSync(outputPath);

        await sock.sendMessage(from, {
          sticker: stickerBuffer,
          mimetype: "image/webp",
          exif,
        });
      } catch (ffErr) {
        console.error("ffmpeg error:", ffErr.message);

        // Fallback to static
        stickerBuffer = await sharp(mediaBuffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();

        await sock.sendMessage(from, {
          sticker: stickerBuffer,
          mimetype: "image/webp",
          exif,
        });
      } finally {
        safeUnlink(inputPath, outputPath);
      }
    }

    await sock.sendMessage(from, { text: "✅ *Sticker created!*" });
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

    const stickerBuffer = await downloadMedia(quoted.stickerMessage, "image");

    const pngBuffer = await sharp(stickerBuffer)
      .png({ quality: 100 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: pngBuffer,
      caption: `🖼️ *Sticker → Image*\n📦 ${(pngBuffer.length / 1024).toFixed(1)} KB`,
    });
  } catch (e) {
    console.error("ToImage error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Failed to convert: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO VIDEO — animated sticker → MP4
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

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to video...*",
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

    const stickerBuffer = await downloadMedia(quoted.stickerMessage, "image");

    const inputPath = path.join(TEMP_DIR, `stk_${Date.now()}.webp`);
    const outputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);

    fs.writeFileSync(inputPath, stickerBuffer);

    await execPromise(
      `ffmpeg -i "${inputPath}" ` +
        `-c:v libx264 -pix_fmt yuv420p -t 5 ` +
        `-vf "scale=512:512:force_original_aspect_ratio=decrease,"` +
        `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black" ` +
        `-movflags +faststart -y "${outputPath}"`,
    );

    const videoBuffer = fs.readFileSync(outputPath);

    await sock.sendMessage(from, {
      video: videoBuffer,
      caption: `🎬 *Sticker → Video*\n📦 ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`,
    });

    safeUnlink(inputPath, outputPath);
  } catch (e) {
    console.error("ToVideo error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Conversion failed: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO GIF — video → GIF playback (FIXED TO ACTUALLY SEND)
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

    // Check file size
    if (videoBuffer.length > 50 * 1024 * 1024) {
      return sock.sendMessage(from, {
        text: formatError("TOO LARGE", "Video too large (max 50MB)."),
      });
    }

    const inputPath = path.join(TEMP_DIR, `gif_in_${Date.now()}.mp4`);
    const outputPath = path.join(TEMP_DIR, `gif_out_${Date.now()}.mp4`);

    fs.writeFileSync(inputPath, videoBuffer);

    // Check video duration
    const duration = await getVideoDuration(inputPath);
    if (duration && duration > 30) {
      await sock.sendMessage(from, {
        text: `⚠️ Video is ${Math.round(duration)}s long. Truncating to 30s.`,
      });
    }

    // Convert to GIF-optimized MP4
    await execPromise(
      `ffmpeg -i "${inputPath}" ` +
        `-vf "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" ` +
        `-loop 0 -t 30 -y "${outputPath}"`,
    );

    const gifBuffer = fs.readFileSync(outputPath);

    // ✅ ACTUALLY SEND THE RESULT
    await sock.sendMessage(from, {
      video: gifBuffer,
      gifPlayback: true,
      caption: `🎞️ *Video → GIF*\n📦 ${(gifBuffer.length / 1024).toFixed(1)} KB`,
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
//  TO AUDIO — video → MP3 (FIXED TO ACTUALLY SEND)
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

    const isAudio = !!quoted.audioMessage;

    // If it's already audio, just re-send it
    if (isAudio) {
      const audioBuffer = await downloadMedia(quoted.audioMessage, "audio");
      return sock.sendMessage(from, {
        audio: audioBuffer,
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

    // Check file size
    if (videoBuffer.length > 100 * 1024 * 1024) {
      return sock.sendMessage(from, {
        text: formatError("TOO LARGE", "Video too large (max 100MB)."),
      });
    }

    const inputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);
    const outputPath = path.join(TEMP_DIR, `aud_${Date.now()}.mp3`);

    fs.writeFileSync(inputPath, videoBuffer);

    await execPromise(
      `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${outputPath}"`,
    );

    const audioBuffer = fs.readFileSync(outputPath);

    // ✅ ACTUALLY SEND THE RESULT
    await sock.sendMessage(from, {
      audio: audioBuffer,
      mimetype: "audio/mpeg",
      ptt: false,
    });

    await sock.sendMessage(from, {
      text: formatSuccess(
        "AUDIO EXTRACTED",
        `📦 Size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`,
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

    // Try remove.bg API if key is set
    const hasKey = ENV.REMOVEBG_KEY && ENV.REMOVEBG_KEY.length > 10;

    if (hasKey) {
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
            headers: {
              ...form.getHeaders(),
              "X-Api-Key": ENV.REMOVEBG_KEY,
            },
            responseType: "arraybuffer",
            timeout: 30000,
          },
        );

        resultBuffer = Buffer.from(res.data);
      } catch (apiErr) {
        console.log(`remove.bg API failed: ${apiErr.message}`);
      }
    }

    // Free fallback
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

        if (res.data?.byteLength > 1000) {
          resultBuffer = Buffer.from(res.data);
        }
      } catch (_) {}
    }

    if (resultBuffer) {
      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `✨ *Background Removed*\n📦 ${(resultBuffer.length / 1024).toFixed(1)} KB`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError("REMOVEBG FAILED", "Could not remove background."),
      });
    }
  } catch (e) {
    console.error("RemoveBG error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", e.message),
    });
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
      caption: `🎭 *Meme Created*\n📝 ${topText} | ${bottomText}`,
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
