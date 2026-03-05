import { CONFIG } from '../config/config.js';
import { handleCommand } from './commandHandler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('message-handler');

// State
let isBotReady = false;
let autoReplyModule = null;
const ADMIN_NUMBER = '2349159180375@s.whatsapp.net';

export function setBotReady(ready) {
    isBotReady = ready;
}

export function setAutoReplyModule(module) {
    autoReplyModule = module;
}

// Extract text from message
function extractMessageText(message) {
    if (!message.message) return '';
    return message.message.conversation ||
           message.message.extendedTextMessage?.text ||
           message.message.imageMessage?.caption ||
           message.message.videoMessage?.caption ||
           '';
}

// Check authorization
function isAuthorized(jid, config) {
    if (jid === ADMIN_NUMBER) return true;
    const allowedUsers = config.ALLOWED_USERS || [];
    return allowedUsers.includes(jid);
}

// MAIN HANDLER
export async function handleMessage(message, sock) {
    try {
        // Bot must be ready
        if (!isBotReady) {
            logger.debug('Bot not ready');
            return;
        }

        // Validate message
        if (!message?.key?.remoteJid || !message.message) return;

        const jid = message.key.remoteJid;
        const sender = message.key.participant || jid;
        const isGroup = jid.endsWith('@g.us');
        const text = extractMessageText(message);
        const prefix = CONFIG.BOT?.PREFIX || '.';

        // CRITICAL: Skip status broadcasts
        if (jid === 'status@broadcast') return;

        logger.info(`Processing from ${isGroup ? 'group' : 'user'}: ${jid}`);

        // ADMIN - Always process
        if (sender === ADMIN_NUMBER || jid === ADMIN_NUMBER) {
            if (text.startsWith(prefix)) {
                await handleCommand(message, sock);
            }
            return;
        }

        // GROUPS
        if (isGroup) {
            const allowedGroups = CONFIG.ALLOWED_GROUPS || [];
            if (!allowedGroups.includes(jid)) return;

            if (text.startsWith(prefix)) {
                await handleCommand(message, sock);
            }
            return;
        }

        // PRIVATE CHATS
        if (!isGroup) {
            if (!isAuthorized(sender, CONFIG)) {
                // Send connection required (rate limited)
                await sock.sendMessage(jid, {
                    text: `🔒 *CONNECTION REQUIRED*\n\nContact: ${CONFIG.CREATOR?.CONTACT?.PHONE || '2349159180375'}`
                });
                return;
            }

            if (text.startsWith(prefix)) {
                await handleCommand(message, sock);
            } else if (autoReplyModule && CONFIG.FEATURES?.AUTO_REPLY?.ENABLED) {
                try {
                    await autoReplyModule.handleAutoReply?.(message, sock);
                } catch (error) {
                    logger.error('Auto-reply error:', error);
                }
            }
        }

    } catch (error) {
        logger.error('Message handler error:', error);
        // NEVER send errors to chat
    }
}

// Anti-delete handler
export async function handleAntiDeleteUpdate(update, sock) {
    try {
        logger.debug('Message deleted:', update);
    } catch (error) {
        logger.error('Anti-delete error:', error);
    }
}
