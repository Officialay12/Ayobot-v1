// features/sticker.js - AYOBOT V1 | ENHANCED STICKER MAKER
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ══════════════════════════════════════════════
//              CONFIGURATION
// ══════════════════════════════════════════════
const STICKER_CONFIG = {
  CREATOR: {
    NAME: "AYOBOT V1",
    CONTACT: "2349159180375",
    VERSION: "Ultimate Edition",
    WATERMARK: "AYOBOT V1",
  },
  LIMITS: {
    MAX_SIZE: 1 * 1024 * 1024, // 1MB WhatsApp limit
    MAX_DIMENSION: 512,
    MIN_DIMENSION: 96,
    DEFAULT_QUALITY: 90,
  },
  WATERMARK: {
    TEXT: "AYOBOT V1",
    COLOR: "#FFFFFF",
    STROKE: "#000000",
    GLOW: "#00FFFF",
    POSITION: "bottom-right", // bottom-left | bottom-right | top-left | top-right | center
    OPACITY: 0.92,
    STYLE: "badge", // badge | plain | glow | shadow
  },
  SUPPORTED_FORMATS: ["jpg", "jpeg", "png", "webp", "gif"],
  TEMP_DIR: path.join(__dirname, "../temp/stickers"),
};

// Ensure temp directory exists
await fs.mkdir(STICKER_CONFIG.TEMP_DIR, { recursive: true }).catch(() => {});

// ══════════════════════════════════════════════
//              STICKER CREATOR CLASS
// ══════════════════════════════════════════════
export class StickerCreator {
  constructor() {
    console.log("🎭 AYOBOT V1 Sticker Creator Initialized");
    this.emojiList = [
      "😀",
      "😄",
      "😊",
      "🤗",
      "🤩",
      "🎉",
      "✨",
      "🌟",
      "💫",
      "🔥",
      "💖",
      "👍",
      "👑",
      "⚡",
      "🎯",
      "🦾",
      "🧠",
      "🚀",
      "💎",
      "🎭",
    ];
  }

  // ──────────────────────────────────────────
  //  WATERMARK GENERATOR
  // ──────────────────────────────────────────

  /**
   * Generates the AYOBOT V1 watermark SVG overlay
   * Supports multiple styles: badge, plain, glow, shadow
   */
  createWatermarkSVG(
    size,
    style = STICKER_CONFIG.WATERMARK.STYLE,
    position = STICKER_CONFIG.WATERMARK.POSITION,
  ) {
    const text = STICKER_CONFIG.WATERMARK.TEXT;
    const fontSize = Math.max(18, Math.floor(size * 0.075));
    const padding = Math.floor(fontSize * 0.5);
    const textWidth = text.length * fontSize * 0.6;
    const badgeW = textWidth + padding * 2;
    const badgeH = fontSize + padding * 1.2;

    // Position logic
    let x, y, anchor;
    const margin = Math.floor(size * 0.03);

    switch (position) {
      case "bottom-right":
        x = size - margin;
        y = size - margin;
        anchor = "end";
        break;
      case "bottom-left":
        x = margin;
        y = size - margin;
        anchor = "start";
        break;
      case "top-right":
        x = size - margin;
        y = margin + fontSize;
        anchor = "end";
        break;
      case "top-left":
        x = margin;
        y = margin + fontSize;
        anchor = "start";
        break;
      case "center":
        x = size / 2;
        y = size / 2;
        anchor = "middle";
        break;
      default:
        x = size - margin;
        y = size - margin;
        anchor = "end";
    }

    // Badge background position
    let bgX =
      anchor === "end" ? x - badgeW : anchor === "start" ? x : x - badgeW / 2;
    let bgY = y - fontSize - padding * 0.4;

    switch (style) {
      case "badge":
        return `
                <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:0.92"/>
                            <stop offset="100%" style="stop-color:#16213e;stop-opacity:0.88"/>
                        </linearGradient>
                        <filter id="badgeShadow">
                            <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
                        </filter>
                    </defs>
                    <rect
                        x="${bgX}" y="${bgY}"
                        width="${badgeW}" height="${badgeH}"
                        rx="${Math.floor(badgeH * 0.35)}"
                        ry="${Math.floor(badgeH * 0.35)}"
                        fill="url(#badgeGrad)"
                        filter="url(#badgeShadow)"
                    />
                    <rect
                        x="${bgX}" y="${bgY}"
                        width="${badgeW}" height="${badgeH}"
                        rx="${Math.floor(badgeH * 0.35)}"
                        ry="${Math.floor(badgeH * 0.35)}"
                        fill="none"
                        stroke="#00FFFF"
                        stroke-width="1"
                        stroke-opacity="0.6"
                    />
                    <text
                        x="${x}" y="${y - padding * 0.1}"
                        font-family="Arial Black, Impact, sans-serif"
                        font-size="${fontSize}px"
                        font-weight="900"
                        fill="#00FFFF"
                        text-anchor="${anchor}"
                        dominant-baseline="auto"
                        letter-spacing="1"
                    >${text}</text>
                </svg>`;

      case "glow":
        return `
                <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <filter id="glowFilter">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <text
                        x="${x}" y="${y}"
                        font-family="Arial Black, Impact, sans-serif"
                        font-size="${fontSize}px"
                        font-weight="900"
                        fill="#FF00FF"
                        text-anchor="${anchor}"
                        dominant-baseline="auto"
                        filter="url(#glowFilter)"
                        letter-spacing="1"
                    >${text}</text>
                </svg>`;

      case "shadow":
        return `
                <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                    <text
                        x="${x + 2}" y="${y + 2}"
                        font-family="Arial Black, Impact, sans-serif"
                        font-size="${fontSize}px"
                        font-weight="900"
                        fill="rgba(0,0,0,0.8)"
                        text-anchor="${anchor}"
                        dominant-baseline="auto"
                    >${text}</text>
                    <text
                        x="${x}" y="${y}"
                        font-family="Arial Black, Impact, sans-serif"
                        font-size="${fontSize}px"
                        font-weight="900"
                        fill="#FFFFFF"
                        stroke="#000000"
                        stroke-width="${Math.floor(fontSize * 0.08)}px"
                        paint-order="stroke fill"
                        text-anchor="${anchor}"
                        dominant-baseline="auto"
                        letter-spacing="1"
                    >${text}</text>
                </svg>`;

      case "plain":
      default:
        return `
                <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                    <text
                        x="${x}" y="${y}"
                        font-family="Arial Black, Impact, sans-serif"
                        font-size="${fontSize}px"
                        font-weight="900"
                        fill="#FFFFFF"
                        stroke="#000000"
                        stroke-width="${Math.floor(fontSize * 0.1)}px"
                        paint-order="stroke fill"
                        text-anchor="${anchor}"
                        dominant-baseline="auto"
                        letter-spacing="1"
                    >${text}</text>
                </svg>`;
    }
  }

  // ──────────────────────────────────────────
  //  CORE STICKER CREATION
  // ──────────────────────────────────────────

  /**
   * MAIN FUNCTION: Create sticker from image buffer
   * Always stamps AYOBOT V1 watermark
   */
  async createSticker(imageBuffer, options = {}) {
    try {
      console.log("🖼️ Creating sticker...");

      if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
        throw new Error("Invalid image buffer");
      }

      const settings = {
        size: options.size || STICKER_CONFIG.LIMITS.MAX_DIMENSION,
        quality: Math.min(
          100,
          Math.max(1, options.quality || STICKER_CONFIG.LIMITS.DEFAULT_QUALITY),
        ),
        crop: options.crop || "contain",
        background: options.background || { r: 0, g: 0, b: 0, alpha: 0 },
        customText: options.customText || null,
        textColor: options.textColor || "#FFFFFF",
        textStroke: options.textStroke || "#000000",
        effect: options.effect || null,
        roundCorners:
          options.roundCorners !== undefined ? options.roundCorners : false,
        border: options.border || false,
        borderColor: options.borderColor || "#00FFFF",
        borderWidth: options.borderWidth || 0.015,
        emoji: options.emoji || this.getRandomEmoji(),
        watermarkStyle:
          options.watermarkStyle || STICKER_CONFIG.WATERMARK.STYLE,
        watermarkPosition:
          options.watermarkPosition || STICKER_CONFIG.WATERMARK.POSITION,
        noWatermark: options.noWatermark || false, // override for special cases
      };

      // Build processing pipeline
      let pipeline = sharp(imageBuffer);

      // Get metadata
      const meta = await sharp(imageBuffer).metadata();

      // Apply pre-resize effects
      pipeline = this.applyEffects(pipeline, settings.effect);

      // Resize
      pipeline = pipeline.resize(settings.size, settings.size, {
        fit: settings.crop,
        background: settings.background,
      });

      // Rounded corners
      if (settings.roundCorners) {
        const radius = Math.round(settings.size * 0.15);
        pipeline = pipeline.composite([
          {
            input: Buffer.from(
              `<svg><rect x="0" y="0" width="${settings.size}" height="${settings.size}"
                         rx="${radius}" ry="${radius}" fill="white"/></svg>`,
            ),
            blend: "dest-in",
          },
        ]);
      }

      // Collect composite layers
      const composites = [];

      // Custom text overlay (user-defined caption)
      if (settings.customText) {
        const textBuffer = await this.createTextOverlay(
          settings.customText,
          settings.size,
          settings.textColor,
          settings.textStroke,
        );
        composites.push({ input: textBuffer });
      }

      // ✅ AYOBOT V1 WATERMARK — always applied
      if (!settings.noWatermark) {
        const watermarkSVG = this.createWatermarkSVG(
          settings.size,
          settings.watermarkStyle,
          settings.watermarkPosition,
        );
        composites.push({ input: Buffer.from(watermarkSVG) });
      }

      if (composites.length > 0) {
        pipeline = pipeline.composite(composites);
      }

      // Border
      if (settings.border) {
        const bw = Math.round(settings.size * settings.borderWidth);
        pipeline = pipeline.extend({
          top: bw,
          bottom: bw,
          left: bw,
          right: bw,
          background: settings.borderColor,
        });
      }

      // Convert to WebP
      let stickerBuffer = await pipeline
        .webp({
          quality: settings.quality,
          lossless: false,
          nearLossless: true,
          alphaQuality: 100,
          effort: 6,
        })
        .toBuffer();

      // Auto-compress if too large
      if (stickerBuffer.length > STICKER_CONFIG.LIMITS.MAX_SIZE) {
        stickerBuffer = await this.compressToLimit(imageBuffer, settings);
      }

      console.log(
        `✅ Sticker created: ${(stickerBuffer.length / 1024).toFixed(2)}KB`,
      );

      return {
        success: true,
        buffer: stickerBuffer,
        size: stickerBuffer.length,
        format: "webp",
        emoji: settings.emoji,
        dimensions: { width: settings.size, height: settings.size },
        quality: settings.quality,
        creator: STICKER_CONFIG.CREATOR,
      };
    } catch (error) {
      console.error("❌ Sticker creation failed:", error.message);
      throw error;
    }
  }

  /**
   * Auto-compress sticker to stay within 1MB
   */
  async compressToLimit(imageBuffer, settings, attempt = 1) {
    const qualities = [75, 60, 50, 40];
    const quality = qualities[Math.min(attempt - 1, qualities.length - 1)];
    console.log(
      `🔄 Compressing sticker (attempt ${attempt}, quality: ${quality})...`,
    );

    const buf = await sharp(imageBuffer)
      .resize(settings.size, settings.size, {
        fit: settings.crop,
        background: settings.background,
      })
      .composite([
        {
          input: Buffer.from(
            this.createWatermarkSVG(
              settings.size,
              settings.watermarkStyle,
              settings.watermarkPosition,
            ),
          ),
        },
      ])
      .webp({ quality, lossless: false, effort: 6 })
      .toBuffer();

    if (buf.length <= STICKER_CONFIG.LIMITS.MAX_SIZE || attempt >= 4)
      return buf;
    return this.compressToLimit(imageBuffer, settings, attempt + 1);
  }

  // ──────────────────────────────────────────
  //  SOURCE HANDLERS
  // ──────────────────────────────────────────

  /**
   * Download image from URL and create sticker
   */
  async createStickerFromUrl(imageUrl, options = {}) {
    try {
      console.log(`📥 Downloading image from URL...`);

      const response = await axios({
        url: imageUrl,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.data || response.data.length < 512) {
        throw new Error("Invalid or empty image received");
      }

      const imageBuffer = Buffer.from(response.data);
      return await this.createSticker(imageBuffer, options);
    } catch (error) {
      console.error("❌ URL sticker failed:", error.message);
      throw new Error(`Failed to create sticker from URL: ${error.message}`);
    }
  }

  /**
   * Create sticker from WhatsApp media message
   */
  async createStickerFromMessage(message, sock, options = {}) {
    try {
      console.log("📱 Creating sticker from WhatsApp message...");

      let imageBuffer;
      let msgType = null;

      // Direct image message
      if (message.imageMessage) {
        msgType = "image";
        const stream = await downloadContentFromMessage(
          message.imageMessage,
          "image",
        );
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        imageBuffer = Buffer.concat(chunks);

        // Quoted image message
      } else if (
        message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
      ) {
        msgType = "quoted-image";
        const quoted =
          message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
        const stream = await downloadContentFromMessage(quoted, "image");
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        imageBuffer = Buffer.concat(chunks);

        // Sticker to sticker convert
      } else if (message.stickerMessage) {
        msgType = "sticker";
        const stream = await downloadContentFromMessage(
          message.stickerMessage,
          "sticker",
        );
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        imageBuffer = Buffer.concat(chunks);
      } else {
        throw new Error("No supported media found in message");
      }

      console.log(
        `📦 Media type: ${msgType} | Buffer: ${(imageBuffer.length / 1024).toFixed(1)}KB`,
      );

      return await this.createSticker(imageBuffer, {
        emoji: "🎭",
        ...options,
      });
    } catch (error) {
      console.error("❌ Message sticker failed:", error.message);
      throw error;
    }
  }

  // ──────────────────────────────────────────
  //  SPECIAL STICKER TYPES
  // ──────────────────────────────────────────

  /**
   * Circular (profile-picture style) sticker with AYOBOT V1 watermark
   */
  async createCircularSticker(imageBuffer, options = {}) {
    try {
      console.log("⭕ Creating circular sticker...");
      const size = STICKER_CONFIG.LIMITS.MAX_DIMENSION;

      const circleMask = Buffer.from(
        `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
      );

      const watermarkSVG = this.createWatermarkSVG(
        size,
        options.watermarkStyle || "badge",
        "bottom-right",
      );

      const stickerBuffer = await sharp(imageBuffer)
        .resize(size, size, { fit: "cover" })
        .composite([
          { input: circleMask, blend: "dest-in" },
          { input: Buffer.from(watermarkSVG) },
        ])
        .webp({ quality: options.quality || 95 })
        .toBuffer();

      return {
        success: true,
        buffer: stickerBuffer,
        format: "webp",
        shape: "circle",
        emoji: "⭕",
      };
    } catch (error) {
      console.error("❌ Circular sticker failed:", error.message);
      throw error;
    }
  }

  /**
   * Sticker pack - splits image into a grid of stickers
   */
  async createStickerPack(imageBuffer, packSize = 2) {
    try {
      const clamped = Math.min(4, Math.max(2, packSize));
      console.log(`📦 Creating ${clamped}x${clamped} sticker pack...`);

      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;
      const cropW = Math.floor(width / clamped);
      const cropH = Math.floor(height / clamped);
      const stickers = [];
      const maxDim = STICKER_CONFIG.LIMITS.MAX_DIMENSION;
      const watermarkSVG = this.createWatermarkSVG(
        maxDim,
        "badge",
        "bottom-right",
      );

      for (let row = 0; row < clamped; row++) {
        for (let col = 0; col < clamped; col++) {
          const left = col * cropW;
          const top = row * cropH;

          const buf = await sharp(imageBuffer)
            .extract({ left, top, width: cropW, height: cropH })
            .resize(maxDim, maxDim, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .composite([{ input: Buffer.from(watermarkSVG) }])
            .webp({ quality: 85 })
            .toBuffer();

          stickers.push({
            buffer: buf,
            position: { row: row + 1, col: col + 1 },
            emoji: this.getRandomEmoji(),
          });
        }
      }

      return {
        success: true,
        stickers,
        packSize: clamped,
        total: stickers.length,
      };
    } catch (error) {
      console.error("❌ Sticker pack failed:", error.message);
      throw error;
    }
  }

  /**
   * Fancy sticker with advanced visual effects + AYOBOT V1 watermark
   */
  async createFancySticker(imageBuffer, effectType, options = {}) {
    try {
      console.log(`✨ Applying "${effectType}" effect...`);
      let pipeline = sharp(imageBuffer);
      const size = STICKER_CONFIG.LIMITS.MAX_DIMENSION;

      switch (effectType.toLowerCase()) {
        case "grayscale":
          pipeline = pipeline.grayscale();
          break;
        case "sepia":
          pipeline = pipeline.tint({ r: 112, g: 66, b: 20 });
          break;
        case "invert":
          pipeline = pipeline.negate();
          break;
        case "blur":
          pipeline = pipeline.blur(options.blurAmount || 8);
          break;
        case "pixelate":
          pipeline = pipeline
            .resize(48, 48, { fit: "fill", kernel: "nearest" })
            .resize(size, size, { fit: "fill", kernel: "nearest" });
          break;
        case "vintage":
          pipeline = pipeline
            .tint({ r: 210, g: 170, b: 100 })
            .modulate({ brightness: 0.88, saturation: 0.75 });
          break;
        case "glitch": {
          const base = await pipeline
            .resize(size, size, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .toBuffer();
          pipeline = sharp(base).composite([
            {
              input: await sharp(base).tint({ r: 255, g: 0, b: 0 }).toBuffer(),
              blend: "screen",
              left: 8,
              top: 0,
            },
            {
              input: await sharp(base)
                .tint({ r: 0, g: 255, b: 255 })
                .toBuffer(),
              blend: "screen",
              left: -8,
              top: 0,
            },
          ]);
          break;
        }
        case "neon": {
          const neonBase = await pipeline
            .resize(size, size, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .toBuffer();
          pipeline = sharp(neonBase)
            .modulate({ brightness: 1.4, saturation: 2.5 })
            .sharpen(3);
          break;
        }
        case "sketch": {
          pipeline = pipeline
            .grayscale()
            .sharpen(5)
            .modulate({ brightness: 1.2, saturation: 0 });
          break;
        }
        case "mirror": {
          const flipped = await pipeline.flop().toBuffer();
          const original = await sharp(imageBuffer)
            .resize(Math.floor(size / 2), size, { fit: "fill" })
            .toBuffer();
          const mirrorHalf = await sharp(flipped)
            .resize(Math.floor(size / 2), size, { fit: "fill" })
            .toBuffer();
          pipeline = sharp({
            create: {
              width: size,
              height: size,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          }).composite([
            { input: original, left: 0, top: 0 },
            { input: mirrorHalf, left: Math.floor(size / 2), top: 0 },
          ]);
          break;
        }
        case "pop":
          pipeline = pipeline
            .modulate({ brightness: 1.15, saturation: 2.0 })
            .sharpen();
          break;
        case "dark":
          pipeline = pipeline
            .modulate({ brightness: 0.6, saturation: 1.3 })
            .tint({ r: 80, g: 50, b: 200 });
          break;
        case "fire":
          pipeline = pipeline
            .tint({ r: 255, g: 80, b: 20 })
            .modulate({ brightness: 1.1, saturation: 1.8 });
          break;
        case "ice":
          pipeline = pipeline
            .tint({ r: 100, g: 200, b: 255 })
            .modulate({ brightness: 1.05, saturation: 1.4 });
          break;
        default:
          break;
      }

      // Apply watermark after effect
      const effectedBuffer = await pipeline.toBuffer();
      return await this.createSticker(effectedBuffer, {
        emoji: this.getEffectEmoji(effectType),
        watermarkStyle: options.watermarkStyle || "badge",
        ...options,
      });
    } catch (error) {
      console.error("❌ Fancy sticker failed:", error.message);
      throw error;
    }
  }

  /**
   * Meme sticker — top + bottom text (Impact font style)
   */
  async createMemeSticker(imageBuffer, topText, bottomText, options = {}) {
    try {
      console.log(`🃏 Creating meme sticker: "${topText}" / "${bottomText}"`);
      const size = STICKER_CONFIG.LIMITS.MAX_DIMENSION;
      const fontSize = Math.floor(size * 0.1);
      const strokeWidth = Math.floor(fontSize * 0.12);
      const pad = Math.floor(size * 0.04);

      const escape = (t) =>
        t
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

      const memeSVG = `
            <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .meme {
                        font-family: Impact, Arial Black, sans-serif;
                        font-size: ${fontSize}px;
                        font-weight: 900;
                        fill: #FFFFFF;
                        stroke: #000000;
                        stroke-width: ${strokeWidth}px;
                        paint-order: stroke fill;
                        text-anchor: middle;
                        dominant-baseline: auto;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                </style>
                ${topText ? `<text x="50%" y="${pad + fontSize}" class="meme">${escape(topText.toUpperCase())}</text>` : ""}
                ${bottomText ? `<text x="50%" y="${size - pad}" class="meme">${escape(bottomText.toUpperCase())}</text>` : ""}
            </svg>`;

      const watermarkSVG = this.createWatermarkSVG(
        size,
        "badge",
        "bottom-right",
      );

      const stickerBuffer = await sharp(imageBuffer)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .composite([
          { input: Buffer.from(memeSVG) },
          { input: Buffer.from(watermarkSVG) },
        ])
        .webp({ quality: options.quality || 90 })
        .toBuffer();

      return {
        success: true,
        buffer: stickerBuffer,
        format: "webp",
        emoji: "🃏",
      };
    } catch (error) {
      console.error("❌ Meme sticker failed:", error.message);
      throw error;
    }
  }

  // ──────────────────────────────────────────
  //  HELPER FUNCTIONS
  // ──────────────────────────────────────────

  applyEffects(pipeline, effect) {
    if (!effect) return pipeline;
    switch (effect.toLowerCase()) {
      case "brightness":
        return pipeline.modulate({ brightness: 1.25 });
      case "contrast":
        return pipeline.linear(1.3, -(0.3 * 128));
      case "saturation":
        return pipeline.modulate({ saturation: 1.5 });
      case "sharpen":
        return pipeline.sharpen(2);
      case "gamma":
        return pipeline.gamma(2.2);
      case "flip":
        return pipeline.flip();
      case "flop":
        return pipeline.flop();
      default:
        return pipeline;
    }
  }

  async createTextOverlay(text, size, color = "#FFFFFF", stroke = "#000000") {
    try {
      const textLength = text.length;
      let fontSize = Math.floor(size * 0.08);
      if (textLength > 10) fontSize = Math.floor(size * 0.065);
      if (textLength > 20) fontSize = Math.floor(size * 0.05);

      const svgText = `
            <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                <text
                    x="50%" y="82%"
                    font-family="Arial Black, Impact, sans-serif"
                    font-size="${fontSize}px"
                    font-weight="900"
                    fill="${color}"
                    stroke="${stroke}"
                    stroke-width="${Math.floor(fontSize * 0.1)}px"
                    paint-order="stroke fill"
                    text-anchor="middle"
                    dominant-baseline="middle"
                >${this.escapeHtml(text)}</text>
            </svg>`;

      return Buffer.from(svgText);
    } catch {
      return Buffer.from(`<svg width="${size}" height="${size}"></svg>`);
    }
  }

  validateSticker(buffer) {
    const max = STICKER_CONFIG.LIMITS.MAX_SIZE;
    return buffer.length <= max
      ? {
          valid: true,
          size: buffer.length,
          message: `✅ ${(buffer.length / 1024).toFixed(1)}KB`,
        }
      : {
          valid: false,
          size: buffer.length,
          maxSize: max,
          message: `❌ Too large: ${(buffer.length / 1024).toFixed(1)}KB`,
        };
  }

  getRandomEmoji() {
    return this.emojiList[Math.floor(Math.random() * this.emojiList.length)];
  }

  getEffectEmoji(effect) {
    const map = {
      grayscale: "⚫",
      sepia: "🟤",
      invert: "⚪",
      blur: "💨",
      pixelate: "🧊",
      vintage: "🕰️",
      glitch: "💥",
      neon: "🌈",
      sketch: "✏️",
      mirror: "🪞",
      pop: "🎨",
      dark: "🌑",
      fire: "🔥",
      ice: "❄️",
      brightness: "☀️",
      contrast: "🎭",
      saturation: "🌈",
      sharpen: "🔪",
    };
    return map[effect?.toLowerCase()] || "✨";
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ──────────────────────────────────────────
  //  STICKER INFO
  // ──────────────────────────────────────────

  async getStickerInfo(stickerBuffer) {
    try {
      const meta = await sharp(stickerBuffer).metadata();
      return {
        format: meta.format,
        width: meta.width,
        height: meta.height,
        size: stickerBuffer.length,
        sizeKB: (stickerBuffer.length / 1024).toFixed(2),
        channels: meta.channels,
        hasAlpha: meta.hasAlpha,
        isValid: stickerBuffer.length <= STICKER_CONFIG.LIMITS.MAX_SIZE,
      };
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────
  //  COMMAND HANDLER
  // ──────────────────────────────────────────

  async handleStickerCommand(command, args, message, sock) {
    const from = message.key.remoteJid;

    const sendSticker = async (result) => {
      await sock.sendMessage(
        from,
        {
          sticker: result.buffer,
          mimetype: "image/webp",
        },
        { quoted: message },
      );
    };

    const sendText = async (text) => {
      await sock.sendMessage(from, { text }, { quoted: message });
    };

    const getImageBuffer = async () => {
      let msg =
        message.imageMessage ||
        message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
        message.stickerMessage ||
        null;

      if (!msg) throw new Error("❌ Please send or reply to an image.");

      const type = message.imageMessage
        ? "image"
        : message.stickerMessage
          ? "sticker"
          : "image";

      const stream = await downloadContentFromMessage(msg, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    };

    try {
      switch (command.toLowerCase()) {
        // ── .sticker (basic / default)
        case "sticker":
        case "create":
        case "s": {
          const imageBuffer = await getImageBuffer();
          const result = await this.createSticker(imageBuffer, { emoji: "🎭" });
          await sendSticker(result);
          return {
            success: true,
            message: `✅ Sticker created | ${result.emoji}`,
          };
        }

        // ── .sticker url <url>
        case "url": {
          const url = args[0];
          if (!url || !url.startsWith("http"))
            return {
              success: false,
              message: "❌ Provide a valid URL: .sticker url [image-url]",
            };
          const result = await this.createStickerFromUrl(url);
          await sendSticker(result);
          return { success: true, message: "✅ Sticker from URL created" };
        }

        // ── .sticker pack [2-4]
        case "pack": {
          const imageBuffer = await getImageBuffer();
          const size = Math.min(4, Math.max(2, parseInt(args[0]) || 2));
          const result = await this.createStickerPack(imageBuffer, size);
          for (const s of result.stickers) {
            await sock.sendMessage(
              from,
              { sticker: s.buffer, mimetype: "image/webp" },
              { quoted: message },
            );
          }
          return {
            success: true,
            message: `📦 Sent ${result.total} stickers (${size}x${size} pack)`,
          };
        }

        // ── .sticker effect <name>
        case "effect":
        case "fx": {
          const effect = args[0]?.toLowerCase();
          const effects = [
            "grayscale",
            "sepia",
            "invert",
            "blur",
            "pixelate",
            "vintage",
            "glitch",
            "neon",
            "sketch",
            "mirror",
            "pop",
            "dark",
            "fire",
            "ice",
          ];
          if (!effect || !effects.includes(effect)) {
            return {
              success: false,
              message: `❌ Valid effects:\n${effects.join(", ")}\n\nUsage: .sticker effect [name] + image`,
            };
          }
          const imageBuffer = await getImageBuffer();
          const result = await this.createFancySticker(imageBuffer, effect);
          await sendSticker(result);
          return { success: true, message: `✨ ${effect} effect applied` };
        }

        // ── .sticker circle
        case "circle":
        case "round": {
          const imageBuffer = await getImageBuffer();
          const result = await this.createCircularSticker(imageBuffer);
          await sendSticker(result);
          return { success: true, message: "⭕ Circular sticker created" };
        }

        // ── .sticker meme <top> | <bottom>
        case "meme": {
          const imageBuffer = await getImageBuffer();
          const fullText = args.join(" ");
          const parts = fullText.split("|");
          const topText = parts[0]?.trim() || "";
          const bottomText = parts[1]?.trim() || "";
          if (!topText && !bottomText) {
            return {
              success: false,
              message: "❌ Usage: .sticker meme TOP TEXT | BOTTOM TEXT + image",
            };
          }
          const result = await this.createMemeSticker(
            imageBuffer,
            topText,
            bottomText,
          );
          await sendSticker(result);
          return { success: true, message: "🃏 Meme sticker created" };
        }

        // ── .sticker crop <cover|contain|fill>
        case "crop": {
          const imageBuffer = await getImageBuffer();
          const mode = ["cover", "contain", "fill"].includes(args[0])
            ? args[0]
            : "contain";
          const result = await this.createSticker(imageBuffer, { crop: mode });
          await sendSticker(result);
          return { success: true, message: `✅ Sticker cropped (${mode})` };
        }

        // ── .sticker flip
        case "flip": {
          const imageBuffer = await getImageBuffer();
          const result = await this.createSticker(imageBuffer, {
            effect: "flip",
          });
          await sendSticker(result);
          return { success: true, message: "🔃 Flipped sticker created" };
        }

        // ── .sticker mirror
        case "mirror": {
          const imageBuffer = await getImageBuffer();
          const result = await this.createFancySticker(imageBuffer, "mirror");
          await sendSticker(result);
          return { success: true, message: "🪞 Mirror sticker created" };
        }

        // ── .sticker info
        case "info": {
          const imageBuffer = await getImageBuffer();
          const info = await this.getStickerInfo(imageBuffer);
          if (!info)
            return { success: false, message: "❌ Could not read image info" };
          const infoText =
            `📊 *Image Info*\n` +
            `Format: ${info.format}\n` +
            `Size: ${info.width}x${info.height}px\n` +
            `File size: ${info.sizeKB}KB\n` +
            `Channels: ${info.channels}\n` +
            `Alpha: ${info.hasAlpha ? "Yes" : "No"}\n` +
            `WhatsApp valid: ${info.isValid ? "✅" : "❌"}`;
          await sendText(infoText);
          return { success: true, message: "Info sent" };
        }

        // ── .sticker help
        case "help":
        default: {
          const helpText =
            `🎭 *AYOBOT V1 — STICKER MAKER*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `*Basic Commands*\n` +
            `• *.sticker* — Create sticker from image\n` +
            `• *.sticker url* [url] — From image URL\n\n` +
            `*Style Commands*\n` +
            `• *.sticker circle* — Circular sticker\n` +
            `• *.sticker crop* [cover/contain/fill]\n` +
            `• *.sticker flip* — Flip vertically\n` +
            `• *.sticker mirror* — Mirror horizontally\n\n` +
            `*Effect Commands*\n` +
            `• *.sticker effect* [name]\n` +
            `  grayscale, sepia, invert, blur\n` +
            `  pixelate, vintage, glitch, neon\n` +
            `  sketch, pop, dark, fire, ice\n\n` +
            `*Advanced Commands*\n` +
            `• *.sticker meme* TOP | BOTTOM\n` +
            `• *.sticker pack* [2-4] — Sticker grid\n` +
            `• *.sticker info* — Image metadata\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👑 *AYOBOT V1 — Ultimate Edition*\n` +
            `📞 wa.me/${STICKER_CONFIG.CREATOR.CONTACT}`;

          await sendText(helpText);
          return { success: true, message: "Help sent" };
        }
      }
    } catch (error) {
      console.error("❌ Command error:", error);
      await sendText(
        `❌ *Sticker Failed*\n${error.message}\n\n` +
          `Contact: wa.me/${STICKER_CONFIG.CREATOR.CONTACT}`,
      );
      return { success: false, error: error.message };
    }
  }
}

// ══════════════════════════════════════════════
//              EXPORTS
// ══════════════════════════════════════════════
export const stickerCreator = new StickerCreator();

export async function createSticker(imageBuffer, options = {}) {
  return await stickerCreator.createSticker(imageBuffer, options);
}

export async function createStickerFromUrl(imageUrl, options = {}) {
  return await stickerCreator.createStickerFromUrl(imageUrl, options);
}

export async function handleStickerCommand(command, args, message, sock) {
  return await stickerCreator.handleStickerCommand(
    command,
    args,
    message,
    sock,
  );
}

export async function quickSticker(imageBuffer) {
  return await stickerCreator.createSticker(imageBuffer, {
    emoji: "🎭",
    quality: 90,
    size: 512,
    // AYOBOT V1 watermark applied by default
  });
}

export default stickerCreator;
