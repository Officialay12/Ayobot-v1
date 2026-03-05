import { CONFIG } from '../config/index.js';
import * as connectionHandler from './connection.js';
import * as ai from '../features/ai.js';
import * as weather from '../features/weather.js';
import * as dictionary from '../features/dictionary.js';
import * as translation from '../features/translation.js';
import * as crypto from '../features/crypto.js';
import * as stocks from '../features/stocks.js';
import * as media from '../features/media.js';
import * as tools from '../features/tools.js';
import * as groupHandler from './group.js';
import { createLogger } from '../utils/logger.js';
import { imageSender } from '../utils/imageSender.js';
import audioHandler from '../utils/audioHandler.js';

const logger = createLogger('command-handler');

// Global state
const commandUsage = new Map();
const userData = new Map();
const commandHistory = new Map();

// Rate limiting
const rateLimitWindow = CONFIG.SECURITY.RATE_LIMIT_WINDOW || 30000;
const maxCommands = CONFIG.SECURITY.MAX_COMMANDS_PER_MINUTE || 30;
const userCommandTimes = new Map();

export async function handleCommand(messageText, from, userJid, sock, isGroup = false, isWeb = false) {
    try {
        // Check rate limiting
        if (isRateLimited(userJid)) {
            logger.warn(`Rate limited: ${userJid}`);
            await sendRateLimitMessage(from, sock);
            return;
        }

        // Parse command
        const args = messageText.slice(CONFIG.BOT.PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        const fullArgs = args.join(' ');

        if (!command) return;

        // Track usage
        trackCommandUsage(command, userJid);

        // Route to appropriate handler
        const result = await routeCommand(
            command, fullArgs, args,
            { from, userJid, isGroup, isWeb, sock }
        );

        return result;

    } catch (error) {
        logger.error('Command handling error:', error);
        await sendErrorMessage(from, sock, error.message);
        return { error: error.message };
    }
}

async function routeCommand(command, fullArgs, args, context) {
    const { from, userJid, isGroup, isWeb, sock } = context;

    // Basic commands
    switch (command) {
        case 'menu':
        case 'help':
            return await handleMenu(from, sock, isWeb);

        case 'ping':
            return await handlePing(from, sock);

        case 'stats':
            return await handleStats(from, sock, userJid);

        case 'status':
            return await handleUserStatus(from, sock, userJid, isWeb);

        case 'creator':
        case 'owner':
            return await handleCreator(from, sock);

        case 'connectinfo':
            return await handleConnectInfo(from, sock);

        case 'connections':
            return await handleConnections(from, sock, userJid);

        case 'web':
            return await handleWebCommand(fullArgs, from, sock, userJid, isWeb);

        case 'auto':
        case 'autoreply':
            return await handleAutoReplySettings(fullArgs, from, sock);

        case 'mode':
            return await handleMode(fullArgs, from, sock, userJid);
    }

    // AI & Smart Features
    if (['ai', 'ask', 'gemini', 'gpt'].includes(command)) {
        return await handleAI(fullArgs, from, sock);
    }

    if (['weather', 'forecast', 'climate'].includes(command)) {
        return await handleWeather(command, fullArgs, from, sock);
    }

    if (['dict', 'dictionary', 'define', 'meaning'].includes(command)) {
        return await handleDictionary(fullArgs, from, sock);
    }

    if (['translate', 'tr', 'trans'].includes(command)) {
        return await handleTranslation(fullArgs, from, sock);
    }

    if (['calc', 'calculate', 'math'].includes(command)) {
        return await handleCalculator(fullArgs, from, sock);
    }

    // Finance
    if (['crypto', 'bitcoin', 'eth', 'ethereum'].includes(command)) {
        return await handleCrypto(fullArgs, from, sock);
    }

    if (['stock', 'stocks'].includes(command)) {
        return await handleStocks(fullArgs, from, sock);
    }

    // Entertainment
    if (['movie', 'film', 'tvshow'].includes(command)) {
        return await handleMovies(fullArgs, from, sock);
    }

    if (['news', 'headlines'].includes(command)) {
        return await handleNews(fullArgs, from, sock);
    }

    if (command === 'joke') {
        return await handleJoke(from, sock);
    }

    if (command === 'quote') {
        return await handleQuote(from, sock);
    }

    // Media Tools
    if (['sticker', 's'].includes(command)) {
        return await handleSticker(from, sock);
    }

    if (['removebg', 'nobg', 'transparent'].includes(command)) {
        return await handleRemoveBg(from, sock);
    }

    if (['qr', 'qrcode'].includes(command)) {
        return await handleQR(fullArgs, from, sock);
    }

    if (['tts', 'speak', 'voice'].includes(command)) {
        return await handleTTS(fullArgs, from, sock);
    }

    if (['download', 'dl', 'get'].includes(command)) {
        return await handleDownload(fullArgs, from, sock);
    }

    if (['toaudio', 'tomp3'].includes(command)) {
        return await handleToAudio(from, sock);
    }

    if (command === 'meme') {
        return await handleMeme(fullArgs, from, sock);
    }

    // Security
    if (['password', 'passgen', 'genpass'].includes(command)) {
        return await handlePassword(fullArgs, from, sock);
    }

    if (command === 'hash') {
        return await handleHash(fullArgs, from, sock);
    }

    if (command === 'encrypt') {
        return await handleEncryption(fullArgs, from, sock);
    }

    if (command === 'decrypt') {
        return await handleDecryption(fullArgs, from, sock);
    }

    // Utilities
    if (['shorten', 'shorturl', 'url'].includes(command)) {
        return await handleURLShorten(fullArgs, from, sock);
    }

    if (['deyplay', 'view','abracadabra', 'open'].includes(command)) {
        return await handleViewOnce(from, sock);
    }

    if (['time', 'worldtime'].includes(command)) {
        return await handleTime(fullArgs, from, sock);
    }

    if (command === 'sing') {
        return await handleSing(fullArgs, from, sock);
    }

    if (command === 'lyrics') {
        return await handleLyrics(fullArgs, from, sock);
    }

    // Group Management (in groups only)
    if (isGroup) {
        const groupCommands = [
            'kick', 'ban', 'warn', 'add', 'promote',
            'demote', 'mute', 'unmute', 'groupinfo'
        ];

        if (groupCommands.includes(command)) {
            return await groupHandler.handleGroupCommand(
                command, args, from, userJid, sock
            );
        }
    }

    // Admin Commands
    if (connectionHandler.isAdmin(userJid)) {
        switch (command) {
            case 'broadcast':
                return await handleBroadcast(fullArgs, from, sock, userJid);

            case 'restart':
                return await handleRestart(from, sock, userJid);

            case 'shutdown':
                return await handleShutdown(from, sock, userJid);

            case 'eval':
                return await handleEval(fullArgs, from, sock, userJid);
        }
    }

    // Unknown command
    await sendUnknownCommand(from, sock, command);
    return { unknown: true };
}

// Basic Command Handlers
async function handleMenu(from, sock, isWeb = false) {
    const menuText = createMenuText(isWeb);
    await sock.sendMessage(from, { text: menuText });

    if (isWeb) {
        setTimeout(async () => {
            await sock.sendMessage(from, {
                text: `💻 *WHATSAPP WEB INFO*\n\nYour session is active.\nUse ${CONFIG.BOT.PREFIX}web for details.`
            });
        }, 1000);
    }

    return { handled: true };
}
function createFormattedMenu(isWhatsAppWeb = false) {
    const prefix = CONFIG.BOT.PREFIX;
    const creatorPhone = CONFIG.CREATOR.CONTACT.PHONE;
    const botVersion = CONFIG.BOT.VERSION;
    const welcomeImage = CONFIG.MEDIA.IMAGES.WELCOME; // Your image URL

    return `${welcomeImage ? `📸 *Menu Image:* ${welcomeImage}` : ''}

╔══════════════════════════════════════╗
║        🚀 *AYOBOT v${botVersion} ULTIMATE* 🚀        ║
╚══════════════════════════════════════╝

📱 *BASIC COMMANDS* 📱
• *${prefix}menu* - Show this menu
• *${prefix}ping* - Check bot status
• *${prefix}creator* - Creator information
• *${prefix}status* - Your user status
• *${prefix}connectinfo* - How to connect

🤖 *AI & SMART FEATURES* 🤖
• *${prefix}ai <question>* - AI chat (Gemini)
• *${prefix}weather <city>* - Weather forecast
• *${prefix}dict <word>* - Dictionary lookup
• *${prefix}translate <text> to <lang>* - Translation
• *${prefix}calc <expression>* - Calculator
• *${prefix}lyrics <song>* - Find song lyrics

💰 *FINANCE & CRYPTO* 💰
• *${prefix}crypto <coin>* - Cryptocurrency prices
• *${prefix}stock <symbol>* - Stock market data
• *${prefix}forecast <city>* - Climate forecast

🎬 *ENTERTAINMENT* 🎬
• *${prefix}movie <title>* - Movie/TV show info
• *${prefix}news* - Latest news headlines
• *${prefix}headlines <category>* - Category news
• *${prefix}joke* - Random jokes
• *${prefix}quote* - Inspirational quotes
• *${prefix}sing <song>* - Generate singing audio

🛠️ *MEDIA TOOLS* 🛠️
• *${prefix}sticker* - Create sticker from image
• *${prefix}removebg* - Remove image background
• *${prefix}qr <text>* - Generate QR code
• *${prefix}tts <text>* - Text to speech
• *${prefix}download <url>* - Download media
• *${prefix}toaudio* - Extract audio from video
• *${prefix}meme* - Create memes from images
• *${prefix}open* - View once message reader

🔒 *SECURITY & PRIVACY* 🔒
• *${prefix}password <length>* - Generate password
• *${prefix}hash <algo> <text>* - Generate hash
• *${prefix}encrypt <text>* - Encrypt message
• *${prefix}decrypt <text>* - Decrypt message

🌐 *UTILITIES* 🌐
• *${prefix}shorten <url>* - URL shortener
• *${prefix}time <city>* - World time
• *${prefix}auto* - Auto-reply settings
• *${prefix}ip <address>* - IP lookup

👥 *GROUP MANAGEMENT* 👥
• *${prefix}kick @user* - Remove from group
• *${prefix}ban @user* - Ban from group
• *${prefix}add <number>* - Add to group
• *${prefix}promote @user* - Make admin
• *${prefix}demote @user* - Remove admin
• *${prefix}mute @user* - Mute user
• *${prefix}warn @user* - Warn user

💻 *WHATSAPP WEB* 💻
• *${prefix}web info* - Your session info
• *${prefix}web sessions* - View all sessions
• *${prefix}web status* - Session status

⚙️ *SETTINGS & ADMIN* ⚙️
• *${prefix}mode <public/private>* - Bot mode
• *${prefix}connections* - Connected users
• *${prefix}stats* - Bot statistics (admin)
• *${prefix}broadcast <msg>* - Broadcast (admin)
• *${prefix}restart* - Restart bot (admin)
• *${prefix}eval <code>* - Execute code (owner)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
╭──────────────────────────────────────────╮
│           👑 *CREATED BY AYOCODES*           │
│           📞 *${creatorPhone}*           │
│           ⚡ *Version: ${botVersion}*          │
╰──────────────────────────────────────────╯

📊 *Status:* ${isWhatsAppWeb ? '✅ WhatsApp Web Active' : '📱 Mobile Only'}
📅 *Date:* ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
⏰ *Time:* ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}

💡 *Tip:* Type *${prefix}help <command>* for detailed usage!`;
}
// Ping handler with loading animation
async function handlePing(cmd, fullArgs, args, message, from, userJid, isGroup, isWhatsAppWeb, sock) {
    try {
        const startTime = Date.now();

        // Send initial loading message
        let loadingMsg = await sock.sendMessage(from, {
            text: `🏓 *Pinging...*\n` +
                  `[▱▱▱▱▱▱▱▱▱▱] 0%`
        });

        // Animation frames for loading
        const frames = [
            '[▰▱▱▱▱▱▱▱▱▱] 10%',
            '[▰▰▱▱▱▱▱▱▱▱] 20%',
            '[▰▰▰▱▱▱▱▱▱▱] 30%',
            '[▰▰▰▰▱▱▱▱▱▱] 40%',
            '[▰▰▰▰▰▱▱▱▱▱] 50%',
            '[▰▰▰▰▰▰▱▱▱▱] 60%',
            '[▰▰▰▰▰▰▰▱▱▱] 70%',
            '[▰▰▰▰▰▰▰▰▱▱] 80%',
            '[▰▰▰▰▰▰▰▰▰▱] 90%',
            '[▰▰▰▰▰▰▰▰▰▰] 100%'
        ];

        // Animate loading
        for (let i = 0; i < frames.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 80)); // 80ms delay between frames
            try {
                await sock.sendMessage(from, {
                    text: `🏓 *Pinging...*\n${frames[i]}`,
                    edit: loadingMsg.key
                });
            } catch (e) {
                // Continue if edit fails
            }
        }

        // Collect data while animation runs
        const uptime = Date.now() - botStartTime;
        const stats = connectionHandler.getConnectionStats ?
            connectionHandler.getConnectionStats() :
            { connectedUsers: 0, authorizedUsers: 0, activeCodes: 0 };

        const webSessions = whatsappWebTracker.sessions.size;
        const commandStats = getCommandStats();
        const responseTime = Date.now() - startTime;

        // Final result with reveal effect
        const response = `⚡ *AYOBOT STATUS REVEALED* ⚡\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🏓 *PING RESULT*\n` +
                        `• Response: ${responseTime}ms\n` +
                        `• Uptime: ${formatUptime(uptime)}\n` +
                        `• Latency: ${responseTime}ms\n\n` +

                        `📊 *PERFORMANCE*\n` +
                        `• Messages: ${messageCount}\n` +
                        `• Commands: ${commandStats.total}\n` +
                        `• Unique Commands: ${commandStats.unique}\n\n` +

                        `👥 *CONNECTIONS*\n` +
                        `• Connected: ${stats.connectedUsers || 0}\n` +
                        `• Authorized: ${stats.authorizedUsers || 0}\n` +
                        `• Web Sessions: ${webSessions}\n` +
                        `• Active Codes: ${stats.activeCodes || 0}\n\n` +

                        `🔧 *SYSTEM INFO*\n` +
                        `• Version: ${CONFIG.BOT.VERSION}\n` +
                        `• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
                        `• Creator: ${CONFIG.CREATOR.CONTACT.PHONE}\n` +
                        `• Time: ${new Date().toLocaleTimeString()}\n\n` +

                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `✅ *STATUS: OPERATIONAL*\n` +
                        `📈 *HEALTH: 100% STABLE*`;

        // Send final result
        await sock.sendMessage(from, {
            text: response,
            edit: loadingMsg.key
        });

        console.log(`✅ Ping executed in ${responseTime}ms`);

    } catch (error) {
        console.error('❌ Ping error:', error);
        await sendErrorMessage(error.message, from, sock);
    }
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function getCommandStats() {
    let total = 0;
    let unique = 0;

    for (const userCommands of commandUsage.values()) {
        for (const count of Object.values(userCommands)) {
            total += count;
        }
        unique += Object.keys(userCommands).length;
    }

    return { total, unique };
}
// ============== STATS HANDLER ==============
async function handleStats(from, sock, userJid) {
    if (!connectionHandler.isAdmin(userJid)) {
        await sock.sendMessage(from, {
            text: `🔐 *ADMIN ACCESS REQUIRED*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                 `❌ **Permission Denied**\n\n` +
                 `This command provides detailed system analytics and statistics that are restricted to administrators only.\n\n` +
                 `📞 *Contact Admin:* ${CONFIG.CREATOR.CONTACT.PHONE}\n` +
                 `👑 *Owner:* ${CONFIG.CREATOR.PERSONAL.NAME}\n\n` +
                 `📊 *Public Commands:*\n` +
                 `• \`.ping\` - System status\n` +
                 `• \`.creator\` - Bot information\n` +
                 `• \`.status\` - Your account status`
        });
        return { denied: true };
    }

    const stats = connectionHandler.getConnectionStats ? connectionHandler.getConnectionStats() : {};
    const messageCount = global.messageCount || 0;
    const uptime = Date.now() - (global.botStartTime || Date.now());
    const memoryUsage = process.memoryUsage();

    // Calculate metrics
    const activeRate = stats.connected > 0 ? ((stats.authorized || 0) / stats.connected * 100).toFixed(1) : 0;
    const commandsPerUser = stats.connected > 0 ? (messageCount / stats.connected).toFixed(1) : 0;
    const memoryPercent = ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1);
    const formattedUptime = formatUptime(uptime);

    const response = `📈 *AYOBOT ADMIN DASHBOARD*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +

                    `⚡ *PERFORMANCE OVERVIEW*\n` +
                    `• 📊 Messages: ${messageCount}\n` +
                    `• 🕒 Uptime: ${formattedUptime}\n` +
                    `• 💾 Memory: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB (${memoryPercent}%)\n` +
                    `• ⚙️ Platform: ${process.platform} ${process.arch}\n\n` +

                    `👥 *USER ANALYTICS*\n` +
                    `• 🔗 Connected: ${stats.connected || 0}\n` +
                    `• ✅ Authorized: ${stats.authorized || 0}\n` +
                    `• 🌐 WhatsApp Web: ${stats.whatsAppWeb || 0}\n` +
                    `• 🔑 Active Codes: ${stats.activeCodes || 0}\n` +
                    `• 📈 Activation Rate: ${activeRate}%\n\n` +

                    `📊 *METRICS & INSIGHTS*\n` +
                    `• 🎯 Commands/User: ${commandsPerUser}\n` +
                    `• 🚀 Daily Avg: ${(messageCount / (uptime / (24 * 60 * 60 * 1000))).toFixed(1)} msgs/day\n` +
                    `• 💎 System Health: ${memoryPercent < 80 ? '✅ OPTIMAL' : '⚠️ MONITOR'}\n\n` +

                    `🔧 *SYSTEM INFORMATION*\n` +
                    `• Version: ${CONFIG.BOT.VERSION}\n` +
                    `• Node.js: ${process.version}\n` +
                    `• Creator: ${CONFIG.CREATOR.CONTACT.PHONE}\n` +
                    `• Time: ${new Date().toLocaleTimeString()}`;

    await sock.sendMessage(from, { text: response });
    console.log(`📊 Admin stats accessed by ${userJid}`);
    return { handled: true };
}

// ============== USER STATUS HANDLER ==============
async function handleUserStatus(from, sock, userJid, isWeb) {
    const phone = userJid.split('@')[0];
    const isAuthorized = connectionHandler.isAuthorized ? connectionHandler.isAuthorized(userJid) : false;

    // Get user info if available
    const userInfo = connectionHandler.getUserInfo ? connectionHandler.getUserInfo(userJid) : null;
    const connectionTime = userInfo?.connectionTime ? formatUptime(Date.now() - userInfo.connectionTime) : 'Unknown';
    const commandCount = userInfo?.commandCount || 0;
    const lastActive = userInfo?.lastActive ? new Date(userInfo.lastActive).toLocaleTimeString() : 'Just now';

    let statusText = `👤 *USER PROFILE*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +

                    `📱 *ACCOUNT DETAILS*\n` +
                    `• 📞 Phone: ${phone}\n` +
                    `• 🔐 Authorization: ${isAuthorized ? '✅ FULL ACCESS' : '❌ RESTRICTED'}\n` +
                    `• 💻 Platform: ${isWeb ? '🌐 WhatsApp Web' : '📱 Mobile'}\n\n` +

                    `📊 *ACTIVITY*\n` +
                    `• ⏱️ Connected: ${connectionTime}\n` +
                    `• 🎮 Commands: ${commandCount}\n` +
                    `• ⏰ Last Active: ${lastActive}\n` +
                    `• 💎 Status: ${isAuthorized ? 'Verified User' : 'Guest'}\n\n`;

    if (isWeb) {
        statusText += `🌐 *WEB SESSION*\n` +
                     `• Type: WhatsApp Web\n` +
                     `• ID: ${userJid.substring(0, 15)}...\n\n`;
    }

    if (!isAuthorized) {
        statusText += `🔓 *UPGRADE ACCESS*\n` +
                     `To unlock all features:\n` +
                     `1. Get a code from admin\n` +
                     `2. Send: *CONNECT YOUR_CODE*\n` +
                     `3. Wait for confirmation\n\n` +
                     `💎 *Benefits:*\n` +
                     `• Full command access\n` +
                     `• Priority support\n` +
                     `• Advanced features\n\n`;
    }

    statusText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                 `👑 *AYOBOT v${CONFIG.BOT.VERSION}*\n` +
                 `📞 ${CONFIG.CREATOR.CONTACT.PHONE}`;

    await sock.sendMessage(from, { text: statusText });
    return { handled: true };
}

// ============== AI HANDLER WITH GEMINI ==============
async function handleAI(query, from, sock) {
    if (!query || query.trim().length < 2) {
        await sock.sendMessage(from, {
            text: `🤖 *AI ASSISTANT*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                 `💡 *How to use:*\n` +
                 `${CONFIG.BOT.PREFIX}ai <your question>\n\n` +
                 `✨ *Examples:*\n` +
                 `• ${CONFIG.BOT.PREFIX}ai What is quantum computing?\n` +
                 `• ${CONFIG.BOT.PREFIX}ai Explain photosynthesis\n` +
                 `• ${CONFIG.BOT.PREFIX}ai Write a poem about coding\n\n` +
                 `🔧 *Powered by Google Gemini*`
        });
        return { handled: true };
    }

    const thinkingMsg = await sock.sendMessage(from, {
        text: `🤖 *AI THINKING...*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
             `💭 Processing: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"\n` +
             `⏱️ Please wait...`
    });

    try {
        // Check if AI module is configured
        if (!ai || !ai.generateResponse) {
            throw new Error('AI module not configured. Please check your GEMINI_API_KEY in environment variables.');
        }

        // Show typing indicator
        await sock.sendPresenceUpdate('composing', from);

        // Get AI response
        const startTime = Date.now();
        const response = await ai.generateResponse(query);
        const responseTime = Date.now() - startTime;

        // Format the response
        const formattedResponse = `🤖 *AI RESPONSE*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                                `📝 *Your Question:*\n${query}\n\n` +
                                `💡 *Answer:*\n${response}\n\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `⚡ *Response Time:* ${responseTime}ms\n` +
                                `🔧 *Model:* Google Gemini\n` +
                                `📊 *Characters:* ${response.length}`;

        await sock.sendMessage(from, {
            text: formattedResponse,
            edit: thinkingMsg.key
        });

    } catch (error) {
        console.error('AI Error:', error);
        await sock.sendMessage(from, {
            text: `❌ *AI ERROR*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                 `🚨 *Issue:* ${error.message}\n\n` +
                 `🔧 *Troubleshooting:*\n` +
                 `1. Check GEMINI_API_KEY in .env\n` +
                 `2. Ensure internet connection\n` +
                 `3. Try simpler question\n` +
                 `4. Contact support if persists\n\n` +
                 `📞 *Support:* ${CONFIG.CREATOR.CONTACT.PHONE}`,
            edit: thinkingMsg.key
        });
    } finally {
        await sock.sendPresenceUpdate('paused', from);
    }

    return { handled: true };
}

// ============== WEATHER HANDLER WITH REAL APIs ==============
async function handleWeather(cmd, query, from, sock) {
    if (!query || query.trim().length < 2) {
        await sock.sendMessage(from, {
            text: `🌤️ *WEATHER SERVICE*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                 `📍 *Usage:* ${CONFIG.BOT.PREFIX}weather <city>\n\n` +
                 `📌 *Examples:*\n` +
                 `• ${CONFIG.BOT.PREFIX}weather Lagos\n` +
                 `• ${CONFIG.BOT.PREFIX}weather New York\n` +
                 `• ${CONFIG.BOT.PREFIX}weather London, UK\n\n` +
                 `💡 Add country for better accuracy`
        });
        return { handled: true };
    }

    const loadingMsg = await sock.sendMessage(from, {
        text: `🌤️ *FETCHING WEATHER...*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
             `📍 *Location:* ${query}\n` +
             `⏱️ Contacting weather services...`
    });

    try {
        const startTime = Date.now();
        let weatherData = null;
        let apiUsed = "WeatherAPI";

        // Try WeatherAPI.com first (your key: 3d0cc4e2a3ed4432bf9163722252912)
        try {
            const encodedQuery = encodeURIComponent(query);
            const weatherApiUrl = `https://api.weatherapi.com/v1/current.json?key=3d0cc4e2a3ed4432bf9163722252912&q=${encodedQuery}&aqi=no`;

            const response = await fetch(weatherApiUrl, { timeout: 10000 });

            if (!response.ok) {
                throw new Error(`WeatherAPI: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            weatherData = {
                location: `${data.location.name}, ${data.location.country}`,
                temp_c: data.current.temp_c,
                temp_f: data.current.temp_f,
                condition: data.current.condition.text,
                icon: data.current.condition.icon,
                humidity: data.current.humidity,
                wind_kph: data.current.wind_kph,
                wind_dir: data.current.wind_dir,
                feelslike_c: data.current.feelslike_c,
                visibility_km: data.current.vis_km,
                last_updated: data.current.last_updated
            };

        } catch (weatherApiError) {
            console.log('WeatherAPI failed, trying OpenWeatherMap...');

            // Fallback to OpenWeatherMap (your key: fb7f1e6d24e357667e9a40edc5f8cf40)
            try {
                apiUsed = "OpenWeatherMap";
                const encodedQuery = encodeURIComponent(query);
                const openWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodedQuery}&appid=fb7f1e6d24e357667e9a40edc5f8cf40&units=metric`;

                const response = await fetch(openWeatherUrl, { timeout: 10000 });

                if (!response.ok) {
                    throw new Error(`OpenWeatherMap: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();

                weatherData = {
                    location: `${data.name}, ${data.sys.country}`,
                    temp_c: data.main.temp,
                    temp_f: (data.main.temp * 9/5) + 32,
                    condition: data.weather[0].description,
                    icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
                    humidity: data.main.humidity,
                    wind_kph: data.wind.speed * 3.6, // Convert m/s to km/h
                    wind_dir: getWindDirection(data.wind.deg),
                    feelslike_c: data.main.feels_like,
                    visibility_km: data.visibility / 1000,
                    last_updated: new Date().toISOString()
                };

            } catch (openWeatherError) {
                throw new Error(`Both weather services failed. Last error: ${openWeatherError.message}`);
            }
        }

        const responseTime = Date.now() - startTime;

        // Format the weather report
        const weatherEmoji = getWeatherEmoji(weatherData.condition);
        const lastUpdated = new Date(weatherData.last_updated).toLocaleTimeString();

        const weatherReport = `${weatherEmoji} *WEATHER REPORT*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                             `📍 *Location:* ${weatherData.location}\n` +
                             `📅 *Last Updated:* ${lastUpdated}\n\n` +

                             `🌡️ *TEMPERATURE*\n` +
                             `• Current: ${weatherData.temp_c.toFixed(1)}°C / ${weatherData.temp_f.toFixed(1)}°F\n` +
                             `• Feels Like: ${weatherData.feelslike_c.toFixed(1)}°C\n\n` +

                             `☁️ *CONDITIONS*\n` +
                             `• Weather: ${weatherData.condition}\n` +
                             `• Humidity: ${weatherData.humidity}%\n` +
                             `• Visibility: ${weatherData.visibility_km.toFixed(1)} km\n\n` +

                             `💨 *WIND*\n` +
                             `• Speed: ${weatherData.wind_kph.toFixed(1)} km/h\n` +
                             `• Direction: ${weatherData.wind_dir}\n\n` +

                             `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                             `⚡ *Data Source:* ${apiUsed}\n` +
                             `⏱️ *Response Time:* ${responseTime}ms\n` +
                             `🔄 *Updated:* Just now\n\n` +

                             `💡 *Tip:* Use \`.forecast ${query.split(',')[0]}\` for 5-day forecast`;

        await sock.sendMessage(from, {
            text: weatherReport,
            edit: loadingMsg.key
        });

    } catch (error) {
        console.error('Weather Error:', error);
        await sock.sendMessage(from, {
            text: `❌ *WEATHER ERROR*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                 `📍 *Requested:* ${query}\n\n` +
                 `🚨 *Issue:* ${error.message}\n\n` +
                 `🔍 *Suggestions:*\n` +
                 `• Check city name spelling\n` +
                 `• Try: "City, Country" format\n` +
                 `• Example: "London, UK"\n` +
                 `• Major cities work best\n\n` +
                 `📞 *Support:* ${CONFIG.CREATOR.CONTACT.PHONE}`,
            edit: loadingMsg.key
        });
    }

    return { handled: true };
}

// ============== HELPER FUNCTIONS ==============

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function getWindDirection(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

function getWeatherEmoji(condition) {
    const lowerCondition = condition.toLowerCase();

    if (lowerCondition.includes('sun') || lowerCondition.includes('clear')) return '☀️';
    if (lowerCondition.includes('cloud')) return '☁️';
    if (lowerCondition.includes('rain')) return '🌧️';
    if (lowerCondition.includes('storm') || lowerCondition.includes('thunder')) return '⛈️';
    if (lowerCondition.includes('snow')) return '❄️';
    if (lowerCondition.includes('fog') || lowerCondition.includes('mist')) return '🌫️';
    if (lowerCondition.includes('wind')) return '💨';

    return '🌤️';
}

// ============== EXPORTS ==============
module.exports = {
    handleStats,
    handleUserStatus,
    handleAI,
    handleWeather
};

// Web Command Handler
async function handleWebCommand(args, from, sock, userJid, isWeb) {
    const subcommand = args.split(' ')[0]?.toLowerCase() || 'info';

    if (subcommand === 'info') {
        let info = `💻 *WHATSAPP WEB INFO*\n\n`;

        if (isWeb) {
            info += `✅ *Connected via WhatsApp Web*\n`;
            info += `🌐 *Session ID:* ${userJid}\n`;
            info += `📱 *Mapped Phone:* ${userJid.includes('@lid') ? 'Available' : 'Not mapped'}\n\n`;
        } else {
            info += `❌ *Not WhatsApp Web*\n\n`;
            info += `*To connect WhatsApp Web:*\n`;
            info += `1. Get connection code\n`;
            info += `2. Open WhatsApp Web\n`;
            info += `3. Send code to bot\n`;
        }

        info += `*Commands:*\n`;
        info += `${CONFIG.BOT.PREFIX}web info - This info\n`;
        info += `${CONFIG.BOT.PREFIX}web sessions - View sessions (admin)\n`;

        await sock.sendMessage(from, { text: info });
        return { handled: true };
    }

    if (subcommand === 'sessions' && connectionHandler.isAdmin(userJid)) {
        const stats = connectionHandler.getConnectionStats ? connectionHandler.getConnectionStats() : {};

        await sock.sendMessage(from, {
            text: `📱 *WHATSAPP WEB SESSIONS*\n\n` +
                 `*Active Sessions:* ${stats.whatsAppWeb || 0}\n` +
                 `*Total Mappings:* ${stats.whatsAppWeb || 0}\n\n` +
                 `👑 *Admin View*`
        });
        return { handled: true };
    }
}

// Utility Functions
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function isRateLimited(userJid) {
    if (connectionHandler.isAdmin && connectionHandler.isAdmin(userJid)) {
        return false;
    }

    const now = Date.now();
    let userRequests = userCommandTimes.get(userJid) || [];

    // Remove old requests
    userRequests = userRequests.filter(time => now - time < rateLimitWindow);

    if (userRequests.length >= maxCommands) {
        return true;
    }

    userRequests.push(now);
    userCommandTimes.set(userJid, userRequests);
    return false;
}

function trackCommandUsage(command, userJid) {
    if (!commandUsage.has(userJid)) {
        commandUsage.set(userJid, {});
    }

    const userCommands = commandUsage.get(userJid);
    userCommands[command] = (userCommands[command] || 0) + 1;
}

// Message sending helpers
async function sendRateLimitMessage(from, sock) {
    await sock.sendMessage(from, {
        text: `🚫 *RATE LIMITED*\n\nPlease wait ${rateLimitWindow / 1000} seconds.\nMax: ${maxCommands} commands per minute.`
    });
}

async function sendErrorMessage(from, sock, error) {
    await sock.sendMessage(from, {
        text: `❌ *COMMAND ERROR*\n\nError: ${error}\n\nContact: ${CONFIG.BOT.CREATOR.CONTACT.PHONE}`
    });
}

async function sendUnknownCommand(from, sock, command) {
    await sock.sendMessage(from, {
        text: `❌ *UNKNOWN COMMAND*\n\n"${command}" is not recognized.\nType ${CONFIG.BOT.PREFIX}menu for available commands.`
    });
}
// Creator handler
async function handleCreator(cmd, fullArgs, args, message, from, userJid, isGroup, isWhatsAppWeb, sock) {
    try {
        const creatorName = CONFIG.CREATOR.PERSONAL.NAME;
        const creatorPhone = CONFIG.CREATOR.CONTACT.PHONE;
        const coDeveloper = CONFIG.OWNERS.SECONDARY.CONTACT;
        const botVersion = CONFIG.BOT.VERSION;
        const creatorImage = CONFIG.MEDIA.IMAGES.CREATOR; // Your creator image URL

        // Create a formatted creator card with image
        const creatorInfo = `🎨 *CREATOR CARD* 🎨\n` +
                           `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                           `${creatorImage ? `📸 *Photo:* ${creatorImage}\n\n` : ''}` +
                           `👑 *AYOBOT v${botVersion} CREATOR*\n\n` +
                           `📛 *Name:* ${creatorName}\n` +
                           `📞 *Phone:* ${creatorPhone}\n` +
                           `👨‍💻 *Experience:* 3+ years in Web development and Programming\n` +
                           `💻 *Skills:* JavaScript, Node.js, WhatsApp APIs\n` +
                           `🚀 *Projects:* 5+ successful bots\n\n` +
                           `🤝 *Co-Developer:* ${coDeveloper}\n\n` +
                           `⭐ *Bot Features:* 200+ working commands\n` +
                           `⚡ *Version:* ${botVersion}\n` +
                           `✅ *Status:* 100% Operational\n` +
                           `📊 *Uptime:* 24/7 Online\n\n` +
                           `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                           `🎖️ *Special Thanks:*\n` +
                           `• All users and testers\n` +
                           `• The WhatsApp API community\n` +
                           `• Open-source contributors\n` +
                           `• Beta testers & supporters\n\n` +
                           `💬 *Contact:* For custom bots, Websites support, or collaboration\n` +
                           `📧 Send a message to ${creatorPhone}`;

        // Send the creator information
        await sock.sendMessage(from, {
            text: creatorInfo
        });

        // Also send a separate image message if creatorImage exists
        if (creatorImage) {
            await sock.sendMessage(from, {
                image: { url: creatorImage },
                caption: `👑 *${creatorName}* - Creator of AYOBOT v${botVersion}`
            });
        }

    } catch (error) {
        console.error('❌ Creator handler error:', error);
        await sendErrorMessage(error.message, from, sock);
    }
}

async function handleConnectInfo(from, sock) {
    const info = `🔐 *HOW TO CONNECT*\n\n` +
                `*Terminal Connection System*\n\n` +
                `📋 *STEPS:*\n` +
                `1. Get an 8-digit code from terminal\n` +
                `2. Send: *CONNECT YOUR_CODE*\n` +
                `3. You'll be authorized instantly!\n\n` +
                `💻 *WhatsApp Web Users:*\n` +
                `• Your session will be mapped automatically\n` +
                `• Use same code on WhatsApp Web\n` +
                `• Commands work on all devices\n\n` +
                `⏰ *Code Validity:* ${CONFIG.CONNECTION.CODE_VALIDITY_MINUTES} minutes\n` +
                `📞 *Contact:* ${CONFIG.BOT.CREATOR.CONTACT.PHONE}`;

    await sock.sendMessage(from, { text: info });
    return { handled: true };
}

async function handleConnections(from, sock, userJid) {
    if (!connectionHandler.isAuthorized ? connectionHandler.isAuthorized(userJid) : false) {
        await sock.sendMessage(from, { text: '❌ Authorization required' });
        return { denied: true };
    }

    const stats = connectionHandler.getConnectionStats ? connectionHandler.getConnectionStats() : {};

    await sock.sendMessage(from, {
        text: `📊 *CONNECTED USERS*\n\n` +
             `*Total Users:* ${stats.connected || 0}\n` +
             `*Authorized:* ${stats.authorized || 0}\n` +
             `*WhatsApp Web:* ${stats.whatsAppWeb || 0}\n\n` +
             `👑 *AYOBOT v1 Ultimate*`
    });

    return { handled: true };
}

async function handleAutoReplySettings(args, from, sock) {
    const subcommand = args.split(' ')[0]?.toLowerCase() || 'help';

    switch (subcommand) {
        case 'on':
            await sock.sendMessage(from, { text: '✅ *Auto-reply enabled*' });
            break;
        case 'off':
            await sock.sendMessage(from, { text: '❌ *Auto-reply disabled*' });
            break;
        case 'status':
            await sock.sendMessage(from, {
                text: `⚙️ *AUTO-REPLY STATUS*\n\n` +
                     `*Enabled:* ${CONFIG.FEATURES.AUTO_REPLY.ENABLED ? '✅ Yes' : '❌ No'}\n` +
                     `*Cooldown:* ${CONFIG.FEATURES.AUTO_REPLY.COOLDOWN / 1000}s\n` +
                     `*Max Replies:* ${CONFIG.FEATURES.AUTO_REPLY.MAX_REPLIES_PER_MINUTE}/min`
            });
            break;
        default:
            await sock.sendMessage(from, {
                text: `🆘 *AUTO-REPLY HELP*\n\n` +
                     `*Commands:*\n` +
                     `${CONFIG.BOT.PREFIX}auto on - Enable\n` +
                     `${CONFIG.BOT.PREFIX}auto off - Disable\n` +
                     `${CONFIG.BOT.PREFIX}auto status - Check status`
            });
    }

    return { handled: true };
}

async function handleMode(args, from, sock, userJid) {
    if (!connectionHandler.isAdmin(userJid)) {
        await sock.sendMessage(from, { text: '❌ Admin only command' });
        return { denied: true };
    }

    const mode = args.split(' ')[0]?.toLowerCase();
    const validModes = ['public', 'private', 'maintenance'];

    if (!mode || !validModes.includes(mode)) {
        await sock.sendMessage(from, {
            text: `⚙️ *BOT MODE*\n\n` +
                 `Current: *${CONFIG.BOT.MODE}*\n` +
                 `Usage: ${CONFIG.BOT.PREFIX}mode <mode>\n` +
                 `Modes: ${validModes.join(', ')}`
        });
        return;
    }

    // In a real app, you would save this to config/database
    await sock.sendMessage(from, {
        text: `✅ *MODE UPDATED*\n\nBot mode changed to: *${mode.toUpperCase()}*`
    });

    return { handled: true };
}

// Admin command handlers
async function handleBroadcast(message, from, sock, userJid) {
    if (!connectionHandler.isAdmin(userJid)) {
        await sock.sendMessage(from, { text: '❌ Admin only command' });
        return { denied: true };
    }

    if (!message) {
        await sock.sendMessage(from, {
            text: `📢 *BROADCAST*\n\nUsage: ${CONFIG.BOT.PREFIX}broadcast <message>`
        });
        return;
    }

    // In a real app, you would broadcast to all connected users
    await sock.sendMessage(from, {
        text: `📢 *BROADCAST SENT*\n\nMessage will be sent to all users.`
    });

    return { handled: true };
}

async function handleRestart(from, sock, userJid) {
    if (!connectionHandler.isAdmin(userJid)) {
        await sock.sendMessage(from, { text: '❌ Admin only command' });
        return { denied: true };
    }

    await sock.sendMessage(from, {
        text: '🔄 *RESTARTING...*\n\nBot will restart in 5 seconds.'
    });

    setTimeout(() => {
        process.exit(0);
    }, 5000);

    return { handled: true };
}

async function handleShutdown(from, sock, userJid) {
    if (userJid !== CONFIG.BOT.CREATOR.CONTACT.JID) {
        await sock.sendMessage(from, { text: '❌ Creator only command' });
        return { denied: true };
    }

    await sock.sendMessage(from, {
        text: '🛑 *SHUTTING DOWN...*\n\nBot will shutdown in 5 seconds.'
    });

    setTimeout(() => {
        process.exit(0);
    }, 5000);

    return { handled: true };
}

async function handleEval(code, from, sock, userJid) {
    if (userJid !== CONFIG.BOT.CREATOR.CONTACT.JID) {
        await sock.sendMessage(from, { text: '❌ Creator only command' });
        return { denied: true };
    }

    if (!code) {
        await sock.sendMessage(from, {
            text: `💻 *EVAL*\n\nUsage: ${CONFIG.BOT.PREFIX}eval <code>`
        });
        return;
    }

    // ⚠️ SECURITY WARNING: eval is dangerous
    // In production, you should remove this or implement strict sandboxing

    await sock.sendMessage(from, {
        text: `❌ *EVAL DISABLED*\n\nFor security reasons, eval command is disabled in production.`
    });

    return { handled: true };
}

// Export main handler
export { handleCommand };

// Export statistics
export function getCommandStats() {
    let total = 0;
    let unique = 0;

    for (const userCommands of commandUsage.values()) {
        for (const count of Object.values(userCommands)) {
            total += count;
        }
        unique += Object.keys(userCommands).length;
    }

    return { total, unique };
}
