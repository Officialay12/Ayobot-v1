// features/imageTools.js - COMPLETE FIXED VERSION
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import util from "util";
import { ENV } from "../index.js";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Clean temp files older than 1 hour
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) {
        // 1 hour
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) {}
}, 3600000);

// ========== DOWNLOAD MEDIA FUNCTION ==========
async function downloadMedia(quotedMessage, mediaType) {
  try {
    const stream = await downloadContentFromMessage(quotedMessage, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  } catch (error) {
    console.error("Download media error:", error);
    throw new Error("Failed to download media");
  }
}

// ========== CREATE STICKER ==========
export async function sticker({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "STICKER",
          "Reply to an image or video with .sticker to create a sticker.\n\nExample: Reply to image with .sticker or .s",
        ),
      });
      return;
    }

    await sock.sendMessage(from, { text: "🎨 *Creating sticker...*" });

    const mediaType = quoted.imageMessage ? "image" : "video";
    const mediaMsg = quoted.imageMessage || quoted.videoMessage;

    const buffer = await downloadMedia(mediaMsg, mediaType);

    let stickerBuffer;
    const tempInput = path.join(
      TEMP_DIR,
      `sticker_input_${Date.now()}.${mediaType === "image" ? "jpg" : "mp4"}`,
    );
    const tempOutput = path.join(TEMP_DIR, `sticker_output_${Date.now()}.webp`);

    fs.writeFileSync(tempInput, buffer);

    if (mediaType === "image") {
      // Image to sticker
      stickerBuffer = await sharp(buffer)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      // Video to sticker (using ffmpeg)
      try {
        await execPromise(
          `ffmpeg -i "${tempInput}" -vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=10,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -lossless 1 -q:v 70 -preset default -loop 0 -an -vsync 0 -t 5 "${tempOutput}"`,
        );
        stickerBuffer = fs.readFileSync(tempOutput);
      } catch (ffmpegError) {
        console.error("FFmpeg error:", ffmpegError);
        // Fallback to first frame as image sticker
        const frameBuffer = await sharp(buffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
        stickerBuffer = frameBuffer;
      }
    }

    // Cleanup temp files
    try {
      fs.unlinkSync(tempInput);
    } catch (e) {}
    try {
      fs.unlinkSync(tempOutput);
    } catch (e) {}

    await sock.sendMessage(from, {
      sticker: stickerBuffer,
      mimetype: "image/webp",
    });

    console.log("✅ Sticker created successfully");
  } catch (error) {
    console.error("Sticker error:", error);
    await sock.sendMessage(from, {
      text: formatError(
        "STICKER ERROR",
        "Could not create sticker. Make sure the media is supported.",
      ),
    });
  }
}

// ========== STICKER TO IMAGE ==========
export async function toImage({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return await sock.sendMessage(from, {
        text: formatInfo(
          "TOIMAGE",
          "Reply to a sticker with .toimage to convert to image.\n\nExample: Reply to sticker with .toimage or .toimg",
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to image...*",
    });

    const buffer = await downloadMedia(quoted.stickerMessage, "image");

    // Convert webp to png
    const pngBuffer = await sharp(buffer).png().toBuffer();

    await sock.sendMessage(from, {
      image: pngBuffer,
      caption: "🖼️ *Sticker converted to image*\n👑 AYOCODES",
    });

    console.log("✅ Sticker converted to image");
  } catch (error) {
    console.error("ToImage error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Failed to convert sticker."),
    });
  }
}

// ========== STICKER TO VIDEO ==========
export async function toVideo({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.stickerMessage) {
      return await sock.sendMessage(from, {
        text: formatInfo(
          "TOVIDEO",
          "Reply to an animated sticker with .tovideo to convert to video.\n\nExample: Reply to animated sticker with .tovideo or .tovid",
        ),
      });
    }

    await sock.sendMessage(from, {
      text: "🔄 *Converting sticker to video...*",
    });

    const buffer = await downloadMedia(quoted.stickerMessage, "image");

    const tempInput = path.join(TEMP_DIR, `sticker_${Date.now()}.webp`);
    const tempOutput = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);

    fs.writeFileSync(tempInput, buffer);

    try {
      await execPromise(
        `ffmpeg -i "${tempInput}" -c:v libx264 -pix_fmt yuv420p -t 5 -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2" -y "${tempOutput}"`,
      );

      const videoBuffer = fs.readFileSync(tempOutput);

      await sock.sendMessage(from, {
        video: videoBuffer,
        caption: "🎬 *Sticker converted to video*\n👑 AYOCODES",
      });
    } catch (ffmpegError) {
      console.error("FFmpeg error:", ffmpegError);
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "Failed to convert to video. The sticker may not be animated.",
        ),
      });
    }

    // Cleanup
    try {
      fs.unlinkSync(tempInput);
    } catch (e) {}
    try {
      fs.unlinkSync(tempOutput);
    } catch (e) {}

    console.log("✅ Sticker converted to video");
  } catch (error) {
    console.error("ToVideo error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Failed to convert to video."),
    });
  }
}

// ========== VIDEO TO GIF ==========
export async function toGif({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.videoMessage) {
      return await sock.sendMessage(from, {
        text: formatInfo(
          "TOGIF",
          "Reply to a video with .togif to convert to GIF.\n\nExample: Reply to video with .togif",
        ),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Converting to GIF...*" });

    const buffer = await downloadMedia(quoted.videoMessage, "video");

    if (buffer.length > 50 * 1024 * 1024) {
      return await sock.sendMessage(from, {
        text: formatError(
          "TOO LARGE",
          "Video too large for GIF conversion (max 50MB).",
        ),
      });
    }

    await sock.sendMessage(from, {
      video: buffer,
      gifPlayback: true,
      caption: "🎞️ *Converted to GIF*\n👑 AYOCODES",
    });

    console.log("✅ Video converted to GIF");
  } catch (error) {
    console.error("ToGif error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Failed to convert to GIF."),
    });
  }
}

// ========== VIDEO TO AUDIO ==========
export async function toAudio({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || (!quoted.videoMessage && !quoted.audioMessage)) {
      return await sock.sendMessage(from, {
        text: formatInfo(
          "TOAUDIO",
          "Reply to a video with .toaudio to extract audio.\n\nExample: Reply to video with .toaudio",
        ),
      });
    }

    await sock.sendMessage(from, { text: "🔄 *Extracting audio...*" });

    const mediaType = quoted.videoMessage ? "video" : "audio";
    const mediaMsg = quoted.videoMessage || quoted.audioMessage;

    const buffer = await downloadMedia(mediaMsg, mediaType);

    if (mediaType === "audio") {
      // Already audio, just forward
      await sock.sendMessage(from, {
        audio: buffer,
        mimetype: "audio/mp4",
        ptt: true,
        caption: "🔊 *Audio*\n👑 AYOCODES",
      });
      return;
    }

    // Video to audio conversion
    const tempVideo = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    const tempAudio = path.join(TEMP_DIR, `audio_${Date.now()}.mp3`);

    fs.writeFileSync(tempVideo, buffer);

    try {
      await execPromise(
        `ffmpeg -i "${tempVideo}" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "${tempAudio}"`,
      );

      const audioBuffer = fs.readFileSync(tempAudio);

      await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: false,
        caption: `🔊 *Audio Extracted*\n📦 ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB\n👑 AYOCODES`,
      });
    } catch (ffmpegError) {
      console.error("FFmpeg error:", ffmpegError);
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "Failed to extract audio. Make sure ffmpeg is installed.",
        ),
      });
    }

    // Cleanup
    try {
      fs.unlinkSync(tempVideo);
    } catch (e) {}
    try {
      fs.unlinkSync(tempAudio);
    } catch (e) {}

    console.log("✅ Audio extracted from video");
  } catch (error) {
    console.error("ToAudio error:", error);
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not extract audio."),
    });
  }
}

// ========== REMOVE BACKGROUND ==========
export async function removeBg({ message, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      return await sock.sendMessage(from, {
        text: formatInfo(
          "REMOVEBG",
          "Reply to an image with .removebg to remove background.\n\nExample: Reply to image with .removebg or .nobg",
        ),
      });
    }

    if (!ENV.REMOVEBG_KEY || ENV.REMOVEBG_KEY === "MGs7M47Vgm2fEsudjkoPzTYj") {
      return await sock.sendMessage(from, {
        text: formatError(
          "API KEY MISSING",
          "Remove.bg API key not configured. Please set REMOVEBG_KEY in .env file.",
        ),
      });
    }

    await sock.sendMessage(from, { text: "✨ *Removing background...*" });

    const buffer = await downloadMedia(quoted.imageMessage, "image");

    const form = new FormData();
    form.append("image_file", buffer, {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });
    form.append("size", "auto");

    const response = await axios.post(
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

    await sock.sendMessage(from, {
      image: response.data,
      caption: "✨ *Background Removed*\n👑 AYOCODES",
    });

    console.log("✅ Background removed successfully");
  } catch (error) {
    console.error(
      "RemoveBG error:",
      error.response?.data?.toString() || error.message,
    );

    let errorMsg = "Could not remove background.";
    if (error.response?.status === 402) {
      errorMsg = "Remove.bg API limit reached. Please try again later.";
    } else if (error.code === "ECONNABORTED") {
      errorMsg = "Request timeout. Please try again.";
    }

    await sock.sendMessage(from, {
      text: formatError("ERROR", errorMsg),
    });
  }
}

// ========== CREATE MEME ==========
export async function meme({ message, fullArgs, from, sock }) {
  try {
    const quoted =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted || !quoted.imageMessage) {
      await sock.sendMessage(from, {
        text: formatInfo(
          "MEME",
          "Reply to an image with .meme top text | bottom text\n\nExample: .meme Hello | World",
        ),
      });
      return;
    }

    if (!fullArgs || !fullArgs.includes("|")) {
      return await sock.sendMessage(from, {
        text: formatError(
          "MEME ERROR",
          "Please provide top and bottom text separated by |\nExample: .meme Top Text | Bottom Text",
        ),
      });
    }

    const parts = fullArgs.split("|").map((t) => t.trim());
    const topText = parts[0] || " ";
    const bottomText = parts[1] || " ";

    await sock.sendMessage(from, { text: "🎨 *Creating meme...*" });

    const buffer = await downloadMedia(quoted.imageMessage, "image");

    // Try to use meme API first
    try {
      const base64Image = buffer.toString("base64");
      const memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(topText || "_")}/${encodeURIComponent(bottomText || "_")}.png?background=data:image/jpeg;base64,${base64Image}`;

      await sock.sendMessage(from, {
        image: { url: memeUrl },
        caption: `🎭 *Meme Created*\n📝 Top: ${topText}\n📝 Bottom: ${bottomText}\n👑 AYOCODES`,
      });
    } catch (apiError) {
      console.error("Meme API error:", apiError);

      // Fallback - add text to image using sharp
      try {
        // Simple text overlay using sharp (basic)
        const image = sharp(buffer);
        const metadata = await image.metadata();

        // Create a simple text overlay (limited functionality)
        const svgText = `
          <svg width="${metadata.width}" height="${metadata.height}">
            <style>
              .title { fill: white; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 4px black; }
              .bottom { fill: white; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 4px black; }
            </style>
            <text x="50%" y="50" text-anchor="middle" class="title">${topText}</text>
            <text x="50%" y="${metadata.height - 50}" text-anchor="middle" class="bottom">${bottomText}</text>
          </svg>
        `;

        const svgBuffer = Buffer.from(svgText);
        const memeBuffer = await image
          .composite([{ input: svgBuffer, top: 0, left: 0 }])
          .toBuffer();

        await sock.sendMessage(from, {
          image: memeBuffer,
          caption: `🎭 *Meme Created*\n📝 Top: ${topText}\n📝 Bottom: ${bottomText}\n👑 AYOCODES`,
        });
      } catch (sharpError) {
        // Ultimate fallback - send image with caption
        await sock.sendMessage(from, {
          image: buffer,
          caption: `🎭 *Meme Text*\n📝 Top: ${topText}\n📝 Bottom: ${bottomText}\n👑 AYOCODES`,
        });
      }
    }

    console.log("✅ Meme created successfully");
  } catch (error) {
    console.error("Meme error:", error);
    await sock.sendMessage(from, {
      text: formatError("MEME ERROR", "Could not create meme."),
    });
  }
}

// Export all functions
export default {
  sticker,
  toImage,
  toVideo,
  toGif,
  toAudio,
  removeBg,
  meme,
};
