// features/sticker.js - COMPLETE STICKER MAKER WITH ALL FEATURES
import sharp from 'sharp';
import axios from 'axios';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const STICKER_CONFIG = {
    CREATOR: {
        NAME: "AYOBOT v1",
        CONTACT: "2349159180375",
        VERSION: "Ultimate Edition"
    },
    LIMITS: {
        MAX_SIZE: 1 * 1024 * 1024, // 1MB WhatsApp limit
        MAX_DIMENSION: 512,
        MIN_DIMENSION: 96,
        DEFAULT_QUALITY: 90
    },
    SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    TEMP_DIR: path.join(__dirname, '../temp/stickers')
};

// Ensure temp directory exists
await fs.mkdir(STICKER_CONFIG.TEMP_DIR, { recursive: true }).catch(() => {});

export class StickerCreator {
    constructor() {
        console.log('🎭 Sticker Creator Initialized');
        this.emojiList = ['😀', '😄', '😊', '🤗', '🤩', '🎉', '✨', '🌟', '💫', '🔥', '💖', '👍', '👑', '⚡', '🎯'];
    }

    /**
     * MAIN FUNCTION: Create sticker from image buffer
     */
    async createSticker(imageBuffer, options = {}) {
        try {
            console.log('🖼️ Creating sticker...');

            // Validate input
            if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
                throw new Error('Invalid image buffer');
            }

            // Default options
            const settings = {
                size: options.size || STICKER_CONFIG.LIMITS.MAX_DIMENSION,
                quality: Math.min(100, Math.max(1, options.quality || STICKER_CONFIG.LIMITS.DEFAULT_QUALITY)),
                crop: options.crop || 'contain',
                background: options.background || { r: 0, g: 0, b: 0, alpha: 0 },
                addText: options.text || null,
                textColor: options.textColor || '#FFFFFF',
                textStroke: options.textStroke || '#000000',
                effect: options.effect || null,
                roundCorners: options.roundCorners || false,
                border: options.border || false,
                borderColor: options.borderColor || '#FFFFFF',
                emoji: options.emoji || this.getRandomEmoji()
            };

            // Create processing pipeline
            let pipeline = sharp(imageBuffer);

            // Apply effects if specified
            pipeline = this.applyEffects(pipeline, settings.effect);

            // Resize with specified crop mode
            pipeline = pipeline.resize(settings.size, settings.size, {
                fit: settings.crop,
                background: settings.background
            });

            // Add rounded corners if requested
            if (settings.roundCorners) {
                const radius = Math.round(settings.size * 0.15); // 15% of size
                pipeline = pipeline.composite([{
                    input: Buffer.from(
                        `<svg><rect x="0" y="0" width="${settings.size}" height="${settings.size}"
                         rx="${radius}" ry="${radius}" fill="white"/></svg>`
                    ),
                    blend: 'dest-in'
                }]);
            }

            // Add text if specified
            if (settings.addText) {
                const textBuffer = await this.createTextOverlay(
                    settings.addText,
                    settings.size,
                    settings.textColor,
                    settings.textStroke
                );
                pipeline = pipeline.composite([{ input: textBuffer }]);
            }

            // Add border if requested
            if (settings.border) {
                const borderSize = Math.round(settings.size * 0.02); // 2% border
                pipeline = pipeline.extend({
                    top: borderSize,
                    bottom: borderSize,
                    left: borderSize,
                    right: borderSize,
                    background: settings.borderColor
                });
            }

            // Convert to WebP (WhatsApp sticker format)
            const stickerBuffer = await pipeline
                .webp({
                    quality: settings.quality,
                    lossless: false,
                    nearLossless: true,
                    alphaQuality: 100,
                    effort: 6
                })
                .toBuffer();

            // Validate size
            const validation = this.validateSticker(stickerBuffer);
            if (!validation.valid) {
                // Try with lower quality if too large
                return await this.createSticker(imageBuffer, {
                    ...options,
                    quality: Math.max(50, settings.quality - 20)
                });
            }

            console.log(`✅ Sticker created: ${(stickerBuffer.length / 1024).toFixed(2)}KB`);

            return {
                success: true,
                buffer: stickerBuffer,
                size: stickerBuffer.length,
                format: 'webp',
                emoji: settings.emoji,
                dimensions: { width: settings.size, height: settings.size },
                quality: settings.quality,
                creator: STICKER_CONFIG.CREATOR
            };

        } catch (error) {
            console.error('❌ Sticker creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Download image from URL and create sticker
     */
    async createStickerFromUrl(imageUrl, options = {}) {
        try {
            console.log(`📥 Downloading image: ${imageUrl.substring(0, 50)}...`);

            const response = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.data || response.data.length < 1024) {
                throw new Error('Invalid or empty image');
            }

            const imageBuffer = Buffer.from(response.data);
            return await this.createSticker(imageBuffer, options);

        } catch (error) {
            console.error('❌ URL sticker creation failed:', error.message);
            throw new Error(`Failed to create sticker from URL: ${error.message}`);
        }
    }

    /**
     * Create sticker from WhatsApp media message
     */
    async createStickerFromMessage(message, sock) {
        try {
            console.log('📱 Creating sticker from WhatsApp message...');

            let imageBuffer;

            if (message.imageMessage) {
                // Download image message
                const stream = await downloadContentFromMessage(message.imageMessage, 'image');
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                imageBuffer = Buffer.concat(chunks);
            } else if (message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                // Quoted image message
                const quoted = message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                const stream = await downloadContentFromMessage(quoted, 'image');
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunks);
                }
                imageBuffer = Buffer.concat(chunks);
            } else {
                throw new Error('No image found in message');
            }

            // Add text from caption if available
            const caption = message.imageMessage?.caption ||
                           message.extendedTextMessage?.text ||
                           'AYOBOT STICKER';

            return await this.createSticker(imageBuffer, {
                text: caption.substring(0, 20),
                emoji: '🎭'
            });

        } catch (error) {
            console.error('❌ Message sticker creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Create multi-pack stickers (crop image into multiple stickers)
     */
    async createStickerPack(imageBuffer, packSize = 3) {
        try {
            console.log(`📦 Creating ${packSize}x${packSize} sticker pack...`);

            // Get image metadata
            const metadata = await sharp(imageBuffer).metadata();
            const { width, height } = metadata;

            const cropWidth = Math.floor(width / packSize);
            const cropHeight = Math.floor(height / packSize);

            const stickers = [];

            for (let row = 0; row < packSize; row++) {
                for (let col = 0; col < packSize; col++) {
                    const left = col * cropWidth;
                    const top = row * cropHeight;

                    const stickerBuffer = await sharp(imageBuffer)
                        .extract({ left, top, width: cropWidth, height: cropHeight })
                        .resize(STICKER_CONFIG.LIMITS.MAX_DIMENSION, STICKER_CONFIG.LIMITS.MAX_DIMENSION, {
                            fit: 'contain',
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        })
                        .webp({ quality: 85 })
                        .toBuffer();

                    stickers.push({
                        buffer: stickerBuffer,
                        position: { row: row + 1, col: col + 1 },
                        emoji: this.getRandomEmoji()
                    });
                }
            }

            return {
                success: true,
                stickers,
                packSize,
                total: stickers.length
            };

        } catch (error) {
            console.error('❌ Sticker pack creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Create sticker with fancy effects
     */
    async createFancySticker(imageBuffer, effectType) {
        try {
            console.log(`✨ Creating ${effectType} effect sticker...`);

            let pipeline = sharp(imageBuffer);

            switch (effectType.toLowerCase()) {
                case 'grayscale':
                    pipeline = pipeline.grayscale();
                    break;
                case 'sepia':
                    pipeline = pipeline.tint({ r: 112, g: 66, b: 20 });
                    break;
                case 'invert':
                    pipeline = pipeline.negate();
                    break;
                case 'blur':
                    pipeline = pipeline.blur(10);
                    break;
                case 'pixelate':
                    pipeline = pipeline.resize(64, 64, { fit: 'fill' })
                                       .resize(512, 512, { kernel: 'nearest' });
                    break;
                case 'vintage':
                    pipeline = pipeline
                        .tint({ r: 200, g: 170, b: 120 })
                        .modulate({ brightness: 0.9, saturation: 0.8 });
                    break;
                case 'glitch':
                    // Random offset effect
                    const glitchBuffer = await pipeline.toBuffer();
                    const glitch1 = await sharp(glitchBuffer)
                        .extract({ left: 10, top: 0, width: 502, height: 512 })
                        .toBuffer();
                    const glitch2 = await sharp(glitchBuffer)
                        .extract({ left: 0, top: 10, width: 512, height: 502 })
                        .toBuffer();

                    pipeline = sharp(glitchBuffer)
                        .composite([
                            { input: glitch1, blend: 'screen', left: -5, top: 0 },
                            { input: glitch2, blend: 'multiply', left: 0, top: -5 }
                        ]);
                    break;
                default:
                    // No effect
                    break;
            }

            return await this.createSticker(await pipeline.toBuffer(), {
                effect: effectType,
                emoji: this.getEffectEmoji(effectType)
            });

        } catch (error) {
            console.error('❌ Fancy sticker creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Create circular sticker (profile picture style)
     */
    async createCircularSticker(imageBuffer) {
        try {
            console.log('⭕ Creating circular sticker...');

            const size = STICKER_CONFIG.LIMITS.MAX_DIMENSION;
            const circleSvg = Buffer.from(
                `<svg><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`
            );

            const stickerBuffer = await sharp(imageBuffer)
                .resize(size, size, { fit: 'cover' })
                .composite([{ input: circleSvg, blend: 'dest-in' }])
                .webp({ quality: 95 })
                .toBuffer();

            return {
                success: true,
                buffer: stickerBuffer,
                format: 'webp',
                shape: 'circle',
                emoji: '⭕'
            };

        } catch (error) {
            console.error('❌ Circular sticker creation failed:', error.message);
            throw error;
        }
    }

    /**
     * HELPER FUNCTIONS
     */

    // Apply visual effects
    applyEffects(pipeline, effect) {
        if (!effect) return pipeline;

        switch (effect.toLowerCase()) {
            case 'brightness':
                return pipeline.modulate({ brightness: 1.2 });
            case 'contrast':
                return pipeline.linear(1.2, -(0.2 * 128));
            case 'saturation':
                return pipeline.modulate({ saturation: 1.3 });
            case 'sharpen':
                return pipeline.sharpen();
            case 'gamma':
                return pipeline.gamma(2.0);
            default:
                return pipeline;
        }
    }

    // Create text overlay
    async createTextOverlay(text, size, color = '#FFFFFF', stroke = '#000000') {
        try {
            // Calculate font size based on text length
            const textLength = text.length;
            let fontSize = Math.floor(size * 0.08); // 8% of image size

            if (textLength > 10) fontSize = Math.floor(size * 0.06);
            if (textLength > 20) fontSize = Math.floor(size * 0.04);

            const svgText = `
                <svg width="${size}" height="${size}">
                    <style>
                        .sticker-text {
                            font-family: Arial Black, Impact, sans-serif;
                            font-size: ${fontSize}px;
                            font-weight: 900;
                            fill: ${color};
                            stroke: ${stroke};
                            stroke-width: ${Math.floor(fontSize * 0.1)}px;
                            paint-order: stroke fill;
                            text-anchor: middle;
                            dominant-baseline: middle;
                        }
                    </style>
                    <text x="50%" y="85%" class="sticker-text">${this.escapeHtml(text)}</text>
                </svg>`;

            return Buffer.from(svgText);
        } catch (error) {
            // Return empty buffer on error
            return Buffer.from(`<svg width="${size}" height="${size}"></svg>`);
        }
    }

    // Validate sticker size
    validateSticker(buffer) {
        const maxSize = STICKER_CONFIG.LIMITS.MAX_SIZE;
        const size = buffer.length;

        if (size > maxSize) {
            return {
                valid: false,
                size: size,
                maxSize: maxSize,
                message: `Sticker too large (${(size / 1024).toFixed(2)}KB > ${(maxSize / 1024).toFixed(2)}KB)`
            };
        }

        return {
            valid: true,
            size: size,
            message: `Valid size (${(size / 1024).toFixed(2)}KB)`
        };
    }

    // Get random emoji
    getRandomEmoji() {
        return this.emojiList[Math.floor(Math.random() * this.emojiList.length)];
    }

    // Get emoji for effect
    getEffectEmoji(effect) {
        const emojiMap = {
            'grayscale': '⚫',
            'sepia': '🟤',
            'invert': '⚪',
            'blur': '💨',
            'pixelate': '🧊',
            'vintage': '🕰️',
            'glitch': '💥',
            'brightness': '☀️',
            'contrast': '🎨',
            'saturation': '🌈',
            'sharpen': '🔪'
        };
        return emojiMap[effect.toLowerCase()] || '✨';
    }

    // Escape HTML for text overlay
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * STICKER COMMAND HANDLER
     */
    async handleStickerCommand(command, args, message, sock) {
        const from = message.key.remoteJid;
        const user = message.key.participant || from;

        try {
            switch (command.toLowerCase()) {
                case 'create':
                    if (message.imageMessage) {
                        const result = await this.createStickerFromMessage(message, sock);

                        await sock.sendMessage(from, {
                            sticker: result.buffer,
                            mimetype: 'image/webp'
                        }, { quoted: message });

                        return {
                            success: true,
                            message: `✅ Sticker created with emoji: ${result.emoji}`
                        };
                    } else {
                        return {
                            success: false,
                            message: '❌ Please send an image with the command'
                        };
                    }

                case 'url':
                    if (args[0]) {
                        const url = args[0];
                        const result = await this.createStickerFromUrl(url);

                        await sock.sendMessage(from, {
                            sticker: result.buffer,
                            mimetype: 'image/webp'
                        }, { quoted: message });

                        return {
                            success: true,
                            message: `✅ Sticker created from URL`
                        };
                    } else {
                        return {
                            success: false,
                            message: '❌ Please provide a URL: .sticker url [image-url]'
                        };
                    }

                case 'pack':
                    if (message.imageMessage) {
                        const packSize = parseInt(args[0]) || 2;
                        const stream = await downloadContentFromMessage(message.imageMessage, 'image');
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        const imageBuffer = Buffer.concat(chunks);

                        const result = await this.createStickerPack(imageBuffer, packSize);

                        // Send first sticker as example
                        if (result.stickers.length > 0) {
                            await sock.sendMessage(from, {
                                sticker: result.stickers[0].buffer,
                                mimetype: 'image/webp'
                            }, { quoted: message });
                        }

                        return {
                            success: true,
                            message: `📦 Created ${result.total} stickers in ${packSize}x${packSize} pack`
                        };
                    } else {
                        return {
                            success: false,
                            message: '❌ Please send an image to create a sticker pack'
                        };
                    }

                case 'effect':
                    if (message.imageMessage && args[0]) {
                        const effect = args[0];
                        const stream = await downloadContentFromMessage(message.imageMessage, 'image');
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        const imageBuffer = Buffer.concat(chunks);

                        const result = await this.createFancySticker(imageBuffer, effect);

                        await sock.sendMessage(from, {
                            sticker: result.buffer,
                            mimetype: 'image/webp'
                        }, { quoted: message });

                        return {
                            success: true,
                            message: `✨ Created ${effect} effect sticker`
                        };
                    } else {
                        return {
                            success: false,
                            message: '❌ Usage: .sticker effect [effect-name] + image\nEffects: grayscale, sepia, invert, blur, pixelate, vintage, glitch'
                        };
                    }

                case 'circle':
                    if (message.imageMessage) {
                        const stream = await downloadContentFromMessage(message.imageMessage, 'image');
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        const imageBuffer = Buffer.concat(chunks);

                        const result = await this.createCircularSticker(imageBuffer);

                        await sock.sendMessage(from, {
                            sticker: result.buffer,
                            mimetype: 'image/webp'
                        }, { quoted: message });

                        return {
                            success: true,
                            message: '⭕ Circular sticker created'
                        };
                    } else {
                        return {
                            success: false,
                            message: '❌ Please send an image to create circular sticker'
                        };
                    }

                case 'help':
                default:
                    const helpText = `🎭 *STICKER MAKER COMMANDS*\n\n` +
                        `• .sticker create + image\n` +
                        `   Create sticker from image\n\n` +
                        `• .sticker url [image-url]\n` +
                        `   Create sticker from URL\n\n` +
                        `• .sticker pack [2-4] + image\n` +
                        `   Create sticker pack (2x2, 3x3, etc)\n\n` +
                        `• .sticker effect [name] + image\n` +
                        `   Effects: grayscale, sepia, invert, blur,\n` +
                        `   pixelate, vintage, glitch\n\n` +
                        `• .sticker circle + image\n` +
                        `   Create circular sticker\n\n` +
                        `• .sticker help\n` +
                        `   Show this help\n\n` +
                        `👑 *AYOBOT v${STICKER_CONFIG.CREATOR.VERSION}*\n` +
                        `Creator: ${STICKER_CONFIG.CREATOR.CONTACT}`;

                    await sock.sendMessage(from, { text: helpText }, { quoted: message });
                    return { success: true, message: 'Help sent' };
            }

        } catch (error) {
            console.error('❌ Sticker command error:', error);

            await sock.sendMessage(from, {
                text: `❌ Sticker creation failed:\n${error.message}\n\nContact: ${STICKER_CONFIG.CREATOR.CONTACT}`
            }, { quoted: message });

            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Singleton instance
export const stickerCreator = new StickerCreator();

// Export functions
export async function createSticker(imageBuffer, options = {}) {
    return await stickerCreator.createSticker(imageBuffer, options);
}

export async function createStickerFromUrl(imageUrl, options = {}) {
    return await stickerCreator.createStickerFromUrl(imageUrl, options);
}

export async function handleStickerCommand(command, args, message, sock) {
    return await stickerCreator.handleStickerCommand(command, args, message, sock);
}

// Quick create function
export async function quickSticker(imageBuffer) {
    return await stickerCreator.createSticker(imageBuffer, {
        emoji: '🎭',
        quality: 90,
        size: 512
    });
}

export default stickerCreator;
