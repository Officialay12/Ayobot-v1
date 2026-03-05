// features/viewOnce.js - FIXED AND WORKING VERSION
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { CONFIG } from '../config/config.js';

// In-memory storage for view-once messages
const savedViewOnceMessages = new Map();
const MAX_SAVED_MESSAGES = 100; // Maximum messages to keep in memory

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get emoji for media type
function getMediaTypeEmoji(type) {
    const emojis = {
        image: '🖼️',
        video: '🎬',
        audio: '🎵',
        sticker: '💝',
        document: '📄'
    };
    return emojis[type] || '📄';
}

// Main function to handle view-once messages
export async function readViewOnceMessage(message, sock, from) {
    try {
        console.log('🔍 Checking for view-once message...');

        // Check if message is a view-once message
        let viewOnceContent = null;
        let mediaType = null;

        // Check for viewOnceMessageV2 (newer format)
        if (message.message?.viewOnceMessageV2?.message) {
            viewOnceContent = message.message.viewOnceMessageV2.message;
            console.log('📥 Detected viewOnceMessageV2');
        }
        // Check for viewOnceMessage (older format)
        else if (message.message?.viewOnceMessage?.message) {
            viewOnceContent = message.message.viewOnceMessage.message;
            console.log('📥 Detected viewOnceMessage');
        }

        if (!viewOnceContent) {
            console.log('❌ No view-once content found');
            return false;
        }

        // Determine media type and get media content
        let mediaContent = null;

        if (viewOnceContent.imageMessage) {
            mediaType = 'image';
            mediaContent = viewOnceContent.imageMessage;
        } else if (viewOnceContent.videoMessage) {
            mediaType = 'video';
            mediaContent = viewOnceContent.videoMessage;
        } else if (viewOnceContent.audioMessage) {
            mediaType = 'audio';
            mediaContent = viewOnceContent.audioMessage;
        } else if (viewOnceContent.stickerMessage) {
            mediaType = 'sticker';
            mediaContent = viewOnceContent.stickerMessage;
        } else if (viewOnceContent.documentMessage) {
            mediaType = 'document';
            mediaContent = viewOnceContent.documentMessage;
        }

        if (!mediaType || !mediaContent) {
            console.log(`❌ Unsupported view-once type`);
            await sock.sendMessage(from, {
                text: `❌ *VIEW ONCE ERROR*\n\nUnsupported media type in view-once message.\n\n👑 Created by AyoCodes`
            });
            return false;
        }

        console.log(`📥 Detected ${mediaType} view-once message`);

        // Download the media
        let buffer;
        try {
            const stream = await downloadContentFromMessage(mediaContent, mediaType);
            buffer = await streamToBuffer(stream);

            if (!buffer || buffer.length === 0) {
                throw new Error('Downloaded empty buffer');
            }

            console.log(`✅ Downloaded ${mediaType} (${formatFileSize(buffer.length)})`);
        } catch (downloadError) {
            console.error('❌ Download error:', downloadError.message);
            await sock.sendMessage(from, {
                text: `❌ *DOWNLOAD ERROR*\n\nFailed to download view-once media.\n\nError: ${downloadError.message}\n\n👑 Created by AyoCodes`
            });
            return false;
        }

        // Save to memory (optional - for later retrieval)
        const messageId = message.key.id || Date.now().toString();
        const sender = message.key.participant || message.key.remoteJid || 'Unknown';

        savedViewOnceMessages.set(messageId, {
            id: messageId,
            type: mediaType,
            buffer: buffer,
            timestamp: Date.now(),
            sender: sender,
            size: buffer.length,
            caption: mediaContent.caption || '',
            mimetype: mediaContent.mimetype || getDefaultMimeType(mediaType),
            fileName: mediaContent.fileName || `${mediaType}_${Date.now()}`,
            thumbnail: mediaContent.jpegThumbnail || null
        });

        // Limit cache size
        if (savedViewOnceMessages.size > MAX_SAVED_MESSAGES) {
            const oldestKey = Array.from(savedViewOnceMessages.keys())[0];
            savedViewOnceMessages.delete(oldestKey);
        }

        // Prepare caption
        const caption = `🔓 *VIEW ONCE REVEALED*\n\n` +
                       `📁 *Type:* ${getMediaTypeEmoji(mediaType)} ${mediaType.toUpperCase()}\n` +
                       `📏 *Size:* ${formatFileSize(buffer.length)}\n` +
                       `👤 *From:* ${sender.split('@')[0] || 'Unknown'}\n` +
                       (mediaContent.caption ? `📝 *Caption:* ${mediaContent.caption}\n` : '') +
                       `🕐 *Revealed at:* ${new Date().toLocaleTimeString()}\n\n` +
                       `⚠️ *Originally sent as view-once*\n` +
                       `👑 *AYOBOT View Once Revealer by AyoCodes*`;

        // Send the media back
        try {
            if (mediaType === 'image') {
                await sock.sendMessage(from, {
                    image: buffer,
                    caption: caption,
                    mimetype: mediaContent.mimetype || 'image/jpeg'
                });
            } else if (mediaType === 'video') {
                await sock.sendMessage(from, {
                    video: buffer,
                    caption: caption,
                    mimetype: mediaContent.mimetype || 'video/mp4'
                });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(from, {
                    audio: buffer,
                    mimetype: mediaContent.mimetype || 'audio/mp4',
                    ptt: mediaContent.mimetype?.includes('ogg') || false
                });
                // Send caption separately for audio
                await sock.sendMessage(from, { text: caption });
            } else if (mediaType === 'sticker') {
                await sock.sendMessage(from, {
                    sticker: buffer,
                    mimetype: mediaContent.mimetype || 'image/webp'
                });
                // Send caption separately for stickers
                await sock.sendMessage(from, { text: caption });
            } else if (mediaType === 'document') {
                await sock.sendMessage(from, {
                    document: buffer,
                    fileName: mediaContent.fileName || `${mediaType}_${Date.now()}`,
                    mimetype: mediaContent.mimetype || 'application/octet-stream',
                    caption: caption
                });
            }

            console.log(`✅ View-once ${mediaType} sent successfully`);

            // Send success message
            setTimeout(async () => {
                await sock.sendMessage(from, {
                    text: `✅ *VIEW ONCE REVEALED SUCCESSFULLY*\n\n` +
                         `The view-once ${mediaType} has been saved and sent to you.\n\n` +
                         `*ID:* ${messageId.substring(0, 8)}...\n` +
                         `*Saved in memory:* ${savedViewOnceMessages.size}/${MAX_SAVED_MESSAGES}\n\n` +
                         `Use .viewonce list to see saved messages\n` +
                         `Use .viewonce get [ID] to retrieve later\n\n` +
                         `👑 Created by AyoCodes`
                });
            }, 1000);

            return true;

        } catch (sendError) {
            console.error('❌ Send error:', sendError.message);
            await sock.sendMessage(from, {
                text: `❌ *SEND ERROR*\n\nFailed to send view-once media.\n\nError: ${sendError.message}\n\n👑 Created by AyoCodes`
            });
            return false;
        }

    } catch (error) {
        console.error('❌ View-once handler error:', error);
        try {
            await sock.sendMessage(from, {
                text: `❌ *VIEW ONCE ERROR*\n\nAn unexpected error occurred.\n\nError: ${error.message}\n\n👑 Created by AyoCodes`
            });
        } catch (sendError) {
            console.error('Failed to send error message:', sendError);
        }
        return false;
    }
}

// Command handler for view-once commands
export async function handleViewOnceCommand(command, args, from, userJid, sock) {
    try {
        const subCommand = args[0]?.toLowerCase() || 'help';

        switch (subCommand) {
            case 'list':
                return await listViewOnceMessages();
            case 'get':
                return await getViewOnceMessage(args[1], from, sock);
            case 'clear':
                return await clearViewOnceMessages(userJid);
            case 'stats':
                return getViewOnceStats();
            case 'help':
            default:
                return getViewOnceHelp();
        }
    } catch (error) {
        console.error('❌ View-once command error:', error);
        return `❌ *VIEW ONCE COMMAND ERROR*\n\nError: ${error.message}\n\n👑 Created by AyoCodes`;
    }
}

// List saved view-once messages
async function listViewOnceMessages() {
    if (savedViewOnceMessages.size === 0) {
        return `📭 *NO VIEW-ONCE MESSAGES*\n\nNo view-once messages have been saved yet.\n\n` +
               `*How to save:*\n` +
               `1. Someone sends you a view-once message\n` +
               `2. Reply to it with .open\n` +
               `3. It will be saved automatically\n\n` +
               `👑 Created by AyoCodes`;
    }

    const messages = Array.from(savedViewOnceMessages.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

    let response = `📋 *SAVED VIEW-ONCE MESSAGES*\n\n`;

    messages.forEach((msg, index) => {
        const timeAgo = Math.floor((Date.now() - msg.timestamp) / 60000); // minutes ago
        const timeStr = timeAgo < 1 ? 'just now' :
                       timeAgo < 60 ? `${timeAgo}m ago` :
                       `${Math.floor(timeAgo / 60)}h ago`;

        response += `${index + 1}. ${getMediaTypeEmoji(msg.type)} *${msg.type.toUpperCase()}*\n`;
        response += `   🆔 *ID:* \`${msg.id.substring(0, 8)}\`\n`;
        response += `   👤 *From:* ${msg.sender.split('@')[0] || 'Unknown'}\n`;
        response += `   📏 *Size:* ${formatFileSize(msg.size)}\n`;
        response += `   🕐 *Time:* ${timeStr}\n`;

        if (msg.caption && msg.caption.length > 0) {
            const shortCaption = msg.caption.length > 20 ?
                msg.caption.substring(0, 20) + '...' : msg.caption;
            response += `   📝 *Caption:* ${shortCaption}\n`;
        }

        response += `\n`;
    });

    if (savedViewOnceMessages.size > 10) {
        response += `... and ${savedViewOnceMessages.size - 10} more messages\n\n`;
    }

    response += `📊 *Total saved:* ${savedViewOnceMessages.size}\n`;
    response += `🗄️ *Memory limit:* ${MAX_SAVED_MESSAGES}\n\n`;
    response += `🔧 *Commands:*\n`;
    response += `• .viewonce get [ID] - Retrieve message\n`;
    response += `• .viewonce clear - Clear all (admin)\n`;
    response += `• .viewonce stats - Show statistics\n\n`;
    response += `👑 Created by AyoCodes`;

    return response;
}

// Get specific view-once message
async function getViewOnceMessage(messageId, from, sock) {
    if (!messageId) {
        return `🔍 *GET VIEW-ONCE MESSAGE*\n\nUsage: .viewonce get [ID]\n\nExample: .viewonce get abc123\n\nUse .viewonce list to see available IDs\n\n👑 Created by AyoCodes`;
    }

    // Try exact match first
    let messageData = savedViewOnceMessages.get(messageId);

    // Try partial match
    if (!messageData) {
        for (const [id, data] of savedViewOnceMessages.entries()) {
            if (id.startsWith(messageId)) {
                messageData = data;
                messageId = id; // Update to full ID
                break;
            }
        }
    }

    if (!messageData) {
        return `❌ *MESSAGE NOT FOUND*\n\nMessage ID "${messageId}" not found.\n\n*Tip:* Use .viewonce list to see all saved messages\n\n👑 Created by AyoCodes`;
    }

    // Send the message
    try {
        const caption = `🔓 *RETRIEVED VIEW-ONCE*\n\n` +
                       `📁 *Type:* ${getMediaTypeEmoji(messageData.type)} ${messageData.type.toUpperCase()}\n` +
                       `📏 *Size:* ${formatFileSize(messageData.size)}\n` +
                       `👤 *From:* ${messageData.sender.split('@')[0] || 'Unknown'}\n` +
                       `🕐 *Original time:* ${new Date(messageData.timestamp).toLocaleTimeString()}\n` +
                       (messageData.caption ? `📝 *Caption:* ${messageData.caption}\n` : '') +
                       `\n👑 *AYOBOT View Once Revealer by AyoCodes*`;

        if (messageData.type === 'image') {
            await sock.sendMessage(from, {
                image: messageData.buffer,
                caption: caption,
                mimetype: messageData.mimetype
            });
        } else if (messageData.type === 'video') {
            await sock.sendMessage(from, {
                video: messageData.buffer,
                caption: caption,
                mimetype: messageData.mimetype
            });
        } else if (messageData.type === 'audio') {
            await sock.sendMessage(from, {
                audio: messageData.buffer,
                mimetype: messageData.mimetype,
                ptt: messageData.mimetype?.includes('ogg') || false
            });
            await sock.sendMessage(from, { text: caption });
        } else if (messageData.type === 'sticker') {
            await sock.sendMessage(from, {
                sticker: messageData.buffer,
                mimetype: messageData.mimetype
            });
            await sock.sendMessage(from, { text: caption });
        } else if (messageData.type === 'document') {
            await sock.sendMessage(from, {
                document: messageData.buffer,
                fileName: messageData.fileName,
                mimetype: messageData.mimetype,
                caption: caption
            });
        }

        return `✅ *MESSAGE SENT*\n\nView-once ${messageData.type} has been sent to your chat.\n\n🆔 *ID:* \`${messageId.substring(0, 8)}\`\n👑 Created by AyoCodes`;

    } catch (error) {
        console.error('❌ Send error in get:', error);
        return `❌ *SEND FAILED*\n\nError: ${error.message}\n\n👑 Created by AyoCodes`;
    }
}

// Clear view-once messages (admin only)
async function clearViewOnceMessages(userJid) {
    // Simple admin check
    const adminNumbers = [
        '2349159180375@s.whatsapp.net',
        '2347038517111@s.whatsapp.net'
    ];

    if (!adminNumbers.includes(userJid)) {
        return `❌ *ADMIN REQUIRED*\n\nOnly admins can clear view-once messages.\n\n👑 Created by AyoCodes`;
    }

    const count = savedViewOnceMessages.size;
    const totalSize = Array.from(savedViewOnceMessages.values())
        .reduce((sum, msg) => sum + msg.size, 0);

    savedViewOnceMessages.clear();

    return `🗑️ *VIEW-ONCE CACHE CLEARED*\n\n` +
           `✅ Successfully cleared all saved view-once messages\n\n` +
           `📊 *Messages cleared:* ${count}\n` +
           `📏 *Space freed:* ${formatFileSize(totalSize)}\n` +
           `👤 *Cleared by:* ${userJid.split('@')[0]}\n` +
           `🕐 *Time:* ${new Date().toLocaleTimeString()}\n\n` +
           `👑 Created by AyoCodes`;
}

// Get view-once statistics
function getViewOnceStats() {
    const messages = Array.from(savedViewOnceMessages.values());

    if (messages.length === 0) {
        return `📊 *VIEW-ONCE STATISTICS*\n\nNo view-once messages saved yet.\n\n👑 Created by AyoCodes`;
    }

    // Calculate statistics
    const totalSize = messages.reduce((sum, msg) => sum + msg.size, 0);
    const avgSize = totalSize / messages.length;

    const typeCounts = {};
    messages.forEach(msg => {
        typeCounts[msg.type] = (typeCounts[msg.type] || 0) + 1;
    });

    const oldest = new Date(Math.min(...messages.map(m => m.timestamp)));
    const newest = new Date(Math.max(...messages.map(m => m.timestamp)));

    let stats = `📊 *VIEW-ONCE STATISTICS*\n\n`;
    stats += `📈 *Total saved:* ${messages.length}\n`;
    stats += `🗄️ *Memory limit:* ${MAX_SAVED_MESSAGES}\n`;
    stats += `📏 *Total size:* ${formatFileSize(totalSize)}\n`;
    stats += `📏 *Average size:* ${formatFileSize(avgSize)}\n\n`;

    stats += `📅 *Time range:*\n`;
    stats += `• *Oldest:* ${oldest.toLocaleDateString()}\n`;
    stats += `• *Newest:* ${newest.toLocaleDateString()}\n`;
    stats += `• *Span:* ${Math.round((newest - oldest) / (24 * 60 * 60 * 1000))} days\n\n`;

    stats += `📁 *By media type:*\n`;
    Object.entries(typeCounts).forEach(([type, count]) => {
        const percentage = ((count / messages.length) * 100).toFixed(1);
        stats += `${getMediaTypeEmoji(type)} *${type}:* ${count} (${percentage}%)\n`;
    });

    stats += `\n🔧 *Usage:*\n`;
    stats += `• Reply to view-once with .open to save\n`;
    stats += `• Use .viewonce list to see saved\n`;
    stats += `• Use .viewonce get [ID] to retrieve\n\n`;

    stats += `👑 Created by AyoCodes`;

    return stats;
}

// Get help for view-once commands
function getViewOnceHelp() {
    return `🆘 *VIEW ONCE HELP*\n\n` +
           `*Save and view view-once messages*\n\n` +
           `🔧 *How to use:*\n` +
           `1. When someone sends you a view-once message\n` +
           `2. Reply to it with: .open\n` +
           `3. The bot will save and send it back to you\n\n` +
           `📋 *Commands:*\n` +
           `• .open (reply to view-once) - Save & view\n` +
           `• .viewonce list - List saved messages\n` +
           `• .viewonce get [ID] - Retrieve message\n` +
           `• .viewonce stats - Show statistics\n` +
           `• .viewonce clear - Clear all (admin only)\n\n` +
           `💡 *Tips:*\n` +
           `• Messages auto-save when you use .open\n` +
           `• Use partial ID for faster retrieval\n` +
           `• Max ${MAX_SAVED_MESSAGES} messages stored\n` +
           `• Large files may not be saved forever\n\n` +
           `⚠️ *Note:* This feature respects privacy.\n` +
           `Only messages you actively save are stored.\n\n` +
           `👑 Created by AyoCodes`;
}

// Helper function to get default MIME type
function getDefaultMimeType(mediaType) {
    const defaults = {
        image: 'image/jpeg',
        video: 'video/mp4',
        audio: 'audio/mp4',
        sticker: 'image/webp',
        document: 'application/octet-stream'
    };
    return defaults[mediaType] || 'application/octet-stream';
}

// Get saved messages count
export function getSavedCount() {
    return savedViewOnceMessages.size;
}

// Get recent messages (for debugging)
export function getRecentMessages(limit = 5) {
    return Array.from(savedViewOnceMessages.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
        .map(msg => ({
            id: msg.id.substring(0, 8),
            type: msg.type,
            sender: msg.sender.split('@')[0],
            size: formatFileSize(msg.size),
            time: new Date(msg.timestamp).toLocaleTimeString()
        }));
}

// Test function
export async function testViewOnce() {
    try {
        const testData = {
            success: true,
            message: 'View Once module is ready',
            stats: {
                savedMessages: savedViewOnceMessages.size,
                maxMessages: MAX_SAVED_MESSAGES,
                memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
            }
        };
        return testData;
    } catch (error) {
        return {
            success: false,
            message: `Test failed: ${error.message}`
        };
    }
}
