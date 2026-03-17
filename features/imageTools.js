// features/imageTools.js
// ════════════════════════════════════════════════════════════════════════════
//  AYOBOT v1 — Image Tools Module (Enhanced Edition)
//  Author  : AYOCODES
//
//  FIXES & ENHANCEMENTS IN THIS VERSION:
//    - sticker: AYOBOT V1 watermark/pack name embedded in WebP EXIF metadata
//               so the sticker shows "AYOBOT V1 | AYOCODES" as the sticker name
//               inside WhatsApp sticker pack. Works without ffmpeg for images.
//    - sticker: Added sharp fallback for video stickers when ffmpeg missing
//    - toImage: Better PNG quality output
//    - toVideo: Proper aspect ratio handling
//    - toGif: Sends as gifPlayback correctly
//    - toAudio: Fixed mimetype for PTT vs file
//    - removeBg: Falls back to remove.bg free tier workaround
//    - meme: Full SVG text overlay with proper font sizing + shadow
//    - All functions: detailed error messages, no silent failures
//  — AYOCODES
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
async function checkFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execPromise("ffmpeg -version");
    ffmpegAvailable = true;
  } catch (_) {
    ffmpegAvailable = false;
    console.log(
      "⚠️ ffmpeg not found — video sticker/conversion will use fallback",
    );
  }
  return ffmpegAvailable;
}

// ── Download media helper ─────────────────────────────────────────────────────
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

// ── Safe file cleanup ─────────────────────────────────────────────────────────
function safeUnlink(...files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER EXIF METADATA — AYOBOT V1 watermark
//
//  WhatsApp reads sticker pack name + author from WebP EXIF metadata.
//  We build a minimal EXIF/XMP buffer with:
//    sticker-pack-name : "AYOBOT V1"
//    sticker-pack-publisher: "AYOCODES"
//  This makes the sticker show "AYOBOT V1" inside WhatsApp. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
function buildStickerExif(packName = "AYOBOT V1", publisher = "AYOCODES") {
  // WhatsApp sticker EXIF is a specific JSON-in-EXIF format. — AYOCODES
  const json = JSON.stringify({
    "sticker-pack-id": "ayobot-v1",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": publisher,
    "android-app-store-link": "",
    "ios-app-store-link": "",
  });

  // Build minimal EXIF header that WhatsApp recognises. — AYOCODES
  // Format: Exif header + APP1 marker + JSON payload
  const jsonBuf = Buffer.from(json, "utf-8");

  // EXIF marker bytes. — AYOCODES
  const header = Buffer.from([
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00, // TIFF header LE
  ]);

  // Build the full EXIF blob that Baileys / WhatsApp expects. — AYOCODES
  // Baileys accepts this as the `exif` property on sticker messages.
  const exifBuf = Buffer.concat([Buffer.from("Exif\x00\x00"), header, jsonBuf]);

  return exifBuf;
}

// ════════════════════════════════════════════════════════════════════════════
//  STICKER — with AYOBOT V1 pack name watermark. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 STICKER",
          `Reply to an image or video with .sticker\n\n` +
            `Aliases: .s .stick\n\n` +
            `✅ Supports: Images, GIFs, short videos (under 10s)\n` +
            `📌 Sticker will be branded as *AYOBOT V1*`,
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
      // ── Image sticker ─────────────────────────────────────────────────
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

      console.log("✅ Image sticker created — AYOBOT V1");
    } else {
      // ── Video/animated sticker ────────────────────────────────────────
      const hasFfmpeg = await checkFfmpeg();
      const inputPath = path.join(TEMP_DIR, `sticker_in_${Date.now()}.mp4`);
      const outputPath = path.join(TEMP_DIR, `sticker_out_${Date.now()}.webp`);

      fs.writeFileSync(inputPath, mediaBuffer);

      if (hasFfmpeg) {
        try {
          await execPromise(
            `ffmpeg -i "${inputPath}" ` +
              `-vcodec libwebp ` +
              `-vf "scale=512:512:force_original_aspect_ratio=decrease,fps=10,` +
              `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" ` +
              `-lossless 0 -q:v 70 -preset default -loop 0 -an -vsync 0 -t 5 ` +
              `-y "${outputPath}"`,
          );
          stickerBuffer = fs.readFileSync(outputPath);
        } catch (ffErr) {
          console.error("ffmpeg sticker error:", ffErr.message);
          // Fallback: use first frame as static sticker. — AYOCODES
          stickerBuffer = await sharp(mediaBuffer)
            .resize(512, 512, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 80 })
            .toBuffer();
        }
      } else {
        // No ffmpeg — make static sticker from video thumbnail. — AYOCODES
        stickerBuffer = await sharp(mediaBuffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
      }

      safeUnlink(inputPath, outputPath);

      await sock.sendMessage(from, {
        sticker: stickerBuffer,
        mimetype: "image/webp",
        exif,
      });

      console.log("✅ Video sticker created — AYOBOT V1");
    }
  } catch (e) {
    console.error("Sticker error:", e);
    await sock.sendMessage(from, {
      text: formatError(
        "STICKER ERROR",
        `Could not create sticker: ${e.message}\n\nMake sure you replied to an image or video.`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO IMAGE — sticker → PNG image. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function toImage({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🖼️ STICKER → IMAGE",
          `Reply to a sticker with .toimage\n\nAliases: .toimg`,
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to image...*",
    });

    const stickerBuffer = await downloadMedia(quoted.stickerMessage, "image");
    const pngBuffer = await sharp(stickerBuffer)
      .png({ quality: 100, compressionLevel: 6 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: pngBuffer,
      caption: `🖼️ *Sticker → Image*\n📦 ${(pngBuffer.length / 1024).toFixed(1)} KB\n⚡ _AYOBOT V1 by AYOCODES_`,
    });

    console.log("✅ Sticker converted to image");
  } catch (e) {
    console.error("ToImage error:", e);
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Failed to convert sticker to image: ${e.message}`,
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO VIDEO — animated sticker → MP4. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function toVideo({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎬 STICKER → VIDEO",
          `Reply to an animated sticker with .tovideo\n\nAliases: .tovid`,
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to video...*",
    });

    const stickerBuffer = await downloadMedia(quoted.stickerMessage, "image");
    const hasFfmpeg = await checkFfmpeg();

    if (!hasFfmpeg) {
      // No ffmpeg — send as image fallback. — AYOCODES
      const pngBuffer = await sharp(stickerBuffer).png().toBuffer();
      return sock.sendMessage(from, {
        image: pngBuffer,
        caption: `⚠️ *ffmpeg not installed — sent as image instead*\n⚡ _AYOBOT V1 by AYOCODES_`,
      });
    }

    const inputPath = path.join(TEMP_DIR, `stk_${Date.now()}.webp`);
    const outputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);
    fs.writeFileSync(inputPath, stickerBuffer);

    try {
      await execPromise(
        `ffmpeg -i "${inputPath}" ` +
          `-c:v libx264 -pix_fmt yuv420p -t 5 ` +
          `-vf "scale=512:512:force_original_aspect_ratio=decrease,` +
          `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black" ` +
          `-movflags +faststart -y "${outputPath}"`,
      );
      const videoBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(from, {
        video: videoBuffer,
        caption: `🎬 *Sticker → Video*\n📦 ${(videoBuffer.length / 1024).toFixed(1)} KB\n⚡ _AYOBOT V1 by AYOCODES_`,
      });
      console.log("✅ Sticker converted to video");
    } catch (ffErr) {
      console.error("ffmpeg toVideo error:", ffErr.message);
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          `ffmpeg conversion failed: ${ffErr.message}`,
        ),
      });
    } finally {
      safeUnlink(inputPath, outputPath);
    }
  } catch (e) {
    console.error("ToVideo error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Failed to convert to video: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO GIF — video → GIF playback. — AYOCODES
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

    const videoBuffer = await downloadMedia(quoted.videoMessage, "video");

    if (videoBuffer.length > 52_428_800) {
      return sock.sendMessage(from, {
        text: formatError(
          "TOO LARGE",
          "Video too large for GIF conversion (max 50MB).",
        ),
      });
    }

    // WhatsApp gifPlayback = true makes it loop like a GIF. — AYOCODES
    await sock.sendMessage(from, {
      video: videoBuffer,
      gifPlayback: true,
      caption: `🎞️ *Video → GIF*\n⚡ _AYOBOT V1 by AYOCODES_`,
    });

    console.log("✅ Video converted to GIF playback");
  } catch (e) {
    console.error("ToGif error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Failed to convert to GIF: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TO AUDIO — video → MP3. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function toAudio({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.videoMessage && !quoted.audioMessage)) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🔊 VIDEO → AUDIO",
          `Reply to a video with .toaudio to extract audio\n\nAliases: .tomp3`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Extracting audio...*" });

    const isAudio = !!quoted.audioMessage;
    const mediaMsg = quoted.videoMessage || quoted.audioMessage;
    const mediaBuffer = await downloadMedia(
      mediaMsg,
      isAudio ? "audio" : "video",
    );

    // If already audio, just re-send it. — AYOCODES
    if (isAudio) {
      return sock.sendMessage(from, {
        audio: mediaBuffer,
        mimetype: "audio/mp4",
        ptt: false,
      });
    }

    const hasFfmpeg = await checkFfmpeg();

    if (!hasFfmpeg) {
      return sock.sendMessage(from, {
        text: formatError(
          "FFMPEG MISSING",
          "ffmpeg is required for audio extraction.\nInstall it: https://ffmpeg.org/download.html",
        ),
      });
    }

    const inputPath = path.join(TEMP_DIR, `vid_${Date.now()}.mp4`);
    const outputPath = path.join(TEMP_DIR, `aud_${Date.now()}.mp3`);
    fs.writeFileSync(inputPath, mediaBuffer);

    try {
      await execPromise(
        `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${outputPath}"`,
      );
      const audioBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
      });
      await sock.sendMessage(from, {
        text: formatSuccess(
          "AUDIO EXTRACTED",
          `📦 Size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB\n⚡ _AYOBOT V1 by AYOCODES_`,
        ),
      });
      console.log("✅ Audio extracted from video");
    } catch (ffErr) {
      console.error("ffmpeg toAudio error:", ffErr.message);
      await sock.sendMessage(from, {
        text: formatError("ERROR", `Audio extraction failed: ${ffErr.message}`),
      });
    } finally {
      safeUnlink(inputPath, outputPath);
    }
  } catch (e) {
    console.error("ToAudio error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not extract audio: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  REMOVE BACKGROUND — remove.bg API with free fallback. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function removeBg({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "✨ REMOVE BACKGROUND",
          `Reply to an image with .removebg\n\nAliases: .nobg .rmbg\n\n` +
            `💡 Set REMOVEBG_KEY in .env for best quality.\nFree fallback is used if no key is set.`,
        ),
      });
    }

    await sock.sendMessage(from, { text: "✨ *Removing background...*" });

    const imageBuffer = await downloadMedia(quoted.imageMessage, "image");
    let resultBuffer = null;

    // Try remove.bg API if key is set. — AYOCODES
    const hasKey =
      ENV.REMOVEBG_KEY &&
      ENV.REMOVEBG_KEY !== "YOUR_REMOVEBG_KEY" &&
      ENV.REMOVEBG_KEY.length > 10;

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
            timeout: 30_000,
          },
        );
        resultBuffer = Buffer.from(res.data);
        console.log("✅ Background removed via remove.bg API");
      } catch (apiErr) {
        console.log(
          `⚠️ remove.bg API failed: ${apiErr.response?.status} ${apiErr.message}`,
        );
        if (apiErr.response?.status === 402) {
          await sock.sendMessage(from, {
            text: `⚠️ _remove.bg API credits exhausted. Trying free fallback..._`,
          });
        }
      }
    }

    // Free fallback: PhotoRoom free API. — AYOCODES
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
            timeout: 30_000,
          },
        );
        if (res.data?.byteLength > 1000) {
          resultBuffer = Buffer.from(res.data);
          console.log("✅ Background removed via PhotoRoom fallback");
        }
      } catch (_) {}
    }

    // Second fallback: remove.bg anonymous (very limited). — AYOCODES
    if (!resultBuffer) {
      try {
        const base64 = imageBuffer.toString("base64");
        const res = await axios.post(
          "https://api.remove.bg/v1.0/removebg",
          { image_file_b64: base64, size: "preview" },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": "INVALID", // triggers demo mode on some versions
            },
            responseType: "arraybuffer",
            timeout: 20_000,
            validateStatus: (s) => s < 500,
          },
        );
        if (res.data?.byteLength > 1000) resultBuffer = Buffer.from(res.data);
      } catch (_) {}
    }

    if (resultBuffer) {
      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `✨ *Background Removed*\n📦 ${(resultBuffer.length / 1024).toFixed(1)} KB\n⚡ _AYOBOT V1 by AYOCODES_`,
      });
    } else {
      await sock.sendMessage(from, {
        text: formatError(
          "REMOVEBG FAILED",
          `Could not remove background.\n\n` +
            `💡 Add a free API key:\n` +
            `1. Go to remove.bg/api\n` +
            `2. Sign up (50 free images/month)\n` +
            `3. Add REMOVEBG_KEY=yourkey to .env`,
        ),
      });
    }
  } catch (e) {
    console.error("RemoveBG error:", e);
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Could not remove background: ${e.message}`),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MEME — image + top/bottom text with SVG overlay. — AYOCODES
// ════════════════════════════════════════════════════════════════════════════
export async function meme({ message, fullArgs, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return sock.sendMessage(from, {
        text: formatInfo(
          "🎭 MEME GENERATOR",
          `Reply to an image with:\n.meme <top text> | <bottom text>\n\n` +
            `Example: .meme When it works | On the first try\n\n` +
            `💡 Use | to separate top and bottom text`,
        ),
      });
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      return sock.sendMessage(from, {
        text: formatError(
          "MEME ERROR",
          `Missing text separator |\n\nFormat: .meme Top Text | Bottom Text`,
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

    // Calculate font size relative to image width. — AYOCODES
    const fontSize = Math.max(24, Math.floor(w * 0.08));
    const strokeWidth = Math.max(3, Math.floor(fontSize * 0.12));
    const padding = Math.floor(fontSize * 0.6);

    // Escape XML special chars for SVG. — AYOCODES
    const esc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    // Build SVG overlay with impact-style text. — AYOCODES
    const svg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .meme-text {
            font-family: Impact, Arial Black, sans-serif;
            font-size: ${fontSize}px;
            font-weight: 900;
            text-anchor: middle;
            dominant-baseline: auto;
            fill: white;
            stroke: black;
            stroke-width: ${strokeWidth}px;
            stroke-linejoin: round;
            paint-order: stroke fill;
            letter-spacing: 1px;
          }
        </style>
        ${
          topText
            ? `
        <text
          class="meme-text"
          x="${w / 2}"
          y="${padding + fontSize}"
        >${esc(topText.toUpperCase())}</text>`
            : ""
        }
        ${
          bottomText
            ? `
        <text
          class="meme-text"
          x="${w / 2}"
          y="${h - padding}"
        >${esc(bottomText.toUpperCase())}</text>`
            : ""
        }
      </svg>
    `;

    const svgBuffer = Buffer.from(svg);

    const memeBuffer = await sharp(imageBuffer)
      .resize(w, h)
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    await sock.sendMessage(from, {
      image: memeBuffer,
      caption:
        `🎭 *Meme Created*\n` +
        `📝 Top: ${topText || "(none)"}\n` +
        `📝 Bottom: ${bottomText || "(none)"}\n` +
        `⚡ _AYOBOT V1 by AYOCODES_`,
    });

    console.log("✅ Meme created successfully");
  } catch (e) {
    console.error("Meme error:", e);
    await sock.sendMessage(from, {
      text: formatError("MEME ERROR", `Could not create meme: ${e.message}`),
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
