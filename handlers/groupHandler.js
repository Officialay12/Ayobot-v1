// handlers/groupHandler.js - COMPLETE FIXED VERSION WITH PROFESSIONAL FORMATTING
import { CONFIG } from '../config/config.js';
import * as connectionHandler from './connectionHandler.js';
import { createLogger } from '../utils/logger.js';
import * as db from '../utils/database.js';

const logger = createLogger('group-handler');

// In-memory caches
const groupWarnings = new Map();
const groupSettings = new Map();
const commandCooldowns = new Map();
const userActivity = new Map();
const mutedGroups = new Map();
const bannedUsers = new Map();

// ========== FORMATTERS (matching commandHandler style) ==========
function formatSuccess(title, content) {
    return `╭━━━━━━━━━━━━━━━━━━╮
┃  ✅ *${title}*  ┃
╰━━━━━━━━━━━━━━━━━━╯

${content}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Group Management`;
}

function formatError(title, content) {
    return `╭━━━━━━━━━━━━━━━━━━╮
┃  ❌ *${title}*  ┃
╰━━━━━━━━━━━━━━━━━━╯

${content}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Group Management`;
}

function formatInfo(title, content) {
    return `╭━━━━━━━━━━━━━━━━━━╮
┃  📌 *${title}*  ┃
╰━━━━━━━━━━━━━━━━━━╯

${content}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT v1* | 👑 Group Management`;
}

function formatData(title, data) {
    let formatted = `╭━━━━━━━━━━━━━━━━━━╮
┃  📊 *${title}*  ┃
╰━━━━━━━━━━━━━━━━━━╯\n\n`;

    for (const [key, value] of Object.entries(data)) {
        formatted += `▰ ${key}: ${value}\n`;
    }

    formatted += `\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *AYOBOT v1* | 👑 Group Management`;
    return formatted;
}

// ========== INITIALIZATION ==========
export async function initializeGroupHandler() {
    try {
        // Load group settings from database
        const settings = await db.getAllGroupSettings();
        if (Array.isArray(settings)) {
            for (const setting of settings) {
                if (setting && setting.groupJid) {
                    groupSettings.set(setting.groupJid, setting);
                }
            }
        }

        // Load warnings from database
        const warnings = await db.getAllWarnings();
        if (Array.isArray(warnings)) {
            for (const warning of warnings) {
                if (warning && warning.groupJid && warning.userJid) {
                    const key = `${warning.groupJid}_${warning.userJid}`;
                    groupWarnings.set(key, warning);
                }
            }
        }

        logger.info(`Group handler initialized: ${groupSettings.size} groups, ${groupWarnings.size} warnings`);
    } catch (error) {
        logger.error('Failed to initialize group handler:', error);
    }
}

// ========== CRITICAL FIX: isGroupAdmin FUNCTION ==========
export async function isGroupAdmin(groupJid, userJid, sock) {
    try {
        // Admin bypass - bot admins are considered group admins
        if (connectionHandler.isAdmin && connectionHandler.isAdmin(userJid)) {
            return true;
        }

        // Get group metadata
        const metadata = await sock.groupMetadata(groupJid);

        // Check if user is in group and is admin
        const participant = metadata.participants.find(p => p.id === userJid);
        return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch (error) {
        logger.error(`Error checking group admin status for ${userJid} in ${groupJid}:`, error);
        return false;
    }
}

// ========== MAIN COMMAND HANDLER ==========
export async function handleGroupCommand(command, args, message, from, userJid, sock) {
    try {
        // Check command cooldown
        if (isOnCooldown(userJid, command, 3)) {
            const remaining = getCooldownRemaining(userJid, command);
            return formatInfo('COMMAND ON COOLDOWN', `Please wait ${remaining} seconds.`);
        }

        // Track user activity
        trackUserActivity(from, userJid);

        // Check permissions
        const isBotAdmin = connectionHandler.isAdmin ? connectionHandler.isAdmin(userJid) : false;
        const isGroupAdminStatus = await isGroupAdmin(from, userJid, sock);

        if (!isBotAdmin && !isGroupAdminStatus) {
            logger.warn(`Permission denied for ${userJid} in ${from}`);
            return formatError('PERMISSION DENIED', 'Only group admins or bot admins can use group commands.');
        }

        // Set cooldown
        setCooldown(userJid, command);

        // Route to appropriate handler
        switch (command.toLowerCase()) {
            case 'kick':
                return await handleKick(args, from, userJid, sock);
            case 'ban':
                return await handleBan(args, from, userJid, sock);
            case 'unban':
                return await handleUnban(args, from, userJid, sock);
            case 'warn':
                return await handleWarn(args, from, userJid, sock);
            case 'warnings':
                return await handleViewWarnings(args, from, userJid);
            case 'clearwarns':
                return await handleClearWarnings(args, from, userJid);
            case 'add':
                return await handleAdd(args, from, userJid, sock);
            case 'promote':
                return await handlePromote(args, from, userJid, sock);
            case 'demote':
                return await handleDemote(args, from, userJid, sock);
            case 'mute':
                return await handleMute(args, from, userJid, sock);
            case 'unmute':
                return await handleUnmute(from, sock);
            case 'tagall':
                return await handleTagall(args, from, userJid, sock);
            case 'hidetag':
                return await handleHidetag(args, from, userJid, sock);
            case 'link':
                return await handleLink(from, userJid, sock);
            case 'revoke':
                return await handleRevoke(from, userJid, sock);
            case 'settings':
                return await handleGroupSettings(args, from, userJid);
            case 'info':
                return await handleGroupInfo(from, sock);
            case 'antilink':
                return await handleAntiLink(args, from, userJid);
            case 'antispam':
                return await handleAntiSpam(args, from, userJid);
            case 'rules':
                return await handleGroupRules(from);
            case 'setrules':
                return await handleSetRules(args, from, userJid);
            case 'report':
                return await handleReport(args, from, userJid, sock);
            case 'modlog':
                return await handleModLog(args, from, userJid);
            default:
                return formatError('UNKNOWN COMMAND', `Command "${command}" not recognized.`);
        }
    } catch (error) {
        logger.error(`Group command error: ${command}`, error);
        return formatError('COMMAND FAILED', error.message);
    }
}

// ========== COMMAND IMPLEMENTATIONS ==========

// KICK COMMAND
async function handleKick(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('KICK USER', 'Usage: .kick @user\nExample: .kick @username');
    }

    try {
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await sock.groupParticipantsUpdate(from, [target], 'remove');

        logger.info(`User kicked: ${target} from ${from} by ${userJid}`);
        return formatSuccess('USER KICKED', `👤 User: @${target.split('@')[0]}\n📝 Reason: ${reason}`);
    } catch (error) {
        logger.error(`Kick failed:`, error);
        return formatError('KICK FAILED', error.message);
    }
}

// BAN COMMAND
async function handleBan(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('BAN USER', 'Usage: .ban @user\nExample: .ban @username');
    }

    try {
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await sock.groupParticipantsUpdate(from, [target], 'remove');

        // Store in ban list
        bannedUsers.set(`${from}_${target}`, {
            by: userJid,
            reason: reason,
            time: Date.now()
        });

        logger.info(`User banned: ${target} from ${from} by ${userJid}`);
        return formatSuccess('USER BANNED', `👤 User: @${target.split('@')[0]}\n📝 Reason: ${reason}`);
    } catch (error) {
        logger.error(`Ban failed:`, error);
        return formatError('BAN FAILED', error.message);
    }
}

// UNBAN COMMAND
async function handleUnban(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('UNBAN USER', 'Usage: .unban @user\nExample: .unban @username');
    }

    try {
        const unbanned = bannedUsers.delete(`${from}_${target}`);
        if (!unbanned) {
            return formatInfo('NOT BANNED', `@${target.split('@')[0]} is not currently banned.`);
        }

        logger.info(`User unbanned: ${target} from ${from} by ${userJid}`);
        return formatSuccess('USER UNBANNED', `@${target.split('@')[0]} has been removed from the ban list.`);
    } catch (error) {
        logger.error(`Unban failed:`, error);
        return formatError('UNBAN FAILED', error.message);
    }
}

// WARN COMMAND
async function handleWarn(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('WARN USER', 'Usage: .warn @user [reason]\nExample: .warn @user Spamming');
    }

    try {
        const warningsKey = `${from}_${target}`;
        const warnings = groupWarnings.get(warningsKey) || {
            count: 0,
            reasons: [],
            firstWarning: Date.now()
        };

        warnings.count++;
        const reason = args.slice(1).join(' ') || 'No reason provided';
        warnings.reasons.push({
            reason,
            time: Date.now(),
            by: userJid,
            warningNumber: warnings.count
        });

        groupWarnings.set(warningsKey, warnings);

        const maxWarnings = CONFIG.GROUP_MAX_WARNINGS || 3;
        let response = `👤 User: @${target.split('@')[0]}\n`;
        response += `📊 Warning: ${warnings.count}/${maxWarnings}\n`;
        response += `📝 Reason: ${reason}\n`;
        response += `👮 By: @${userJid.split('@')[0]}`;

        // Auto-kick on max warnings
        if (warnings.count >= maxWarnings) {
            await sock.groupParticipantsUpdate(from, [target], 'remove');
            response += `\n\n🚫 User has been kicked for reaching max warnings.`;
            groupWarnings.delete(warningsKey);
        }

        return formatSuccess('WARNING ISSUED', response);
    } catch (error) {
        logger.error(`Warn failed:`, error);
        return formatError('WARNING FAILED', error.message);
    }
}

// VIEW WARNINGS
async function handleViewWarnings(args, from, userJid) {
    const target = getTargetUser(args) || userJid;
    const warnings = getGroupWarnings(from, target);

    let response = `👤 User: @${target.split('@')[0]}\n`;
    response += `📊 Total: ${warnings.count}\n\n`;

    if (warnings.reasons && warnings.reasons.length > 0) {
        response += `📋 *History:*\n`;
        warnings.reasons.forEach((warn, i) => {
            response += `${i + 1}. ${warn.reason}\n`;
            response += `   By: @${warn.by.split('@')[0]} | ${new Date(warn.time).toLocaleDateString()}\n`;
        });
    } else {
        response += `✅ No warnings recorded.`;
    }

    return formatInfo(`WARNINGS`, response);
}

// CLEAR WARNINGS
async function handleClearWarnings(args, from, userJid) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('CLEAR WARNINGS', 'Usage: .clearwarns @user');
    }

    clearGroupWarnings(from, target);
    return formatSuccess('WARNINGS CLEARED', `All warnings for @${target.split('@')[0]} have been removed.`);
}

// ADD USER
async function handleAdd(args, from, userJid, sock) {
    const phoneNumber = args[0];
    if (!phoneNumber || phoneNumber.length < 10) {
        return formatInfo('ADD USER', 'Usage: .add 2348123456789\nExample: .add 2348123456789');
    }

    try {
        const targetJid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(from, [targetJid], 'add');
        return formatSuccess('USER ADDED', `Successfully added ${targetJid.split('@')[0]} to the group.`);
    } catch (error) {
        logger.error(`Add failed:`, error);
        return formatError('ADD FAILED', error.message);
    }
}

// PROMOTE USER
async function handlePromote(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('PROMOTE USER', 'Usage: .promote @user');
    }

    try {
        await sock.groupParticipantsUpdate(from, [target], 'promote');
        return formatSuccess('USER PROMOTED', `@${target.split('@')[0]} is now a group admin.`);
    } catch (error) {
        logger.error(`Promote failed:`, error);
        return formatError('PROMOTION FAILED', error.message);
    }
}

// DEMOTE USER
async function handleDemote(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target) {
        return formatInfo('DEMOTE USER', 'Usage: .demote @user');
    }

    try {
        await sock.groupParticipantsUpdate(from, [target], 'demote');
        return formatSuccess('USER DEMOTED', `@${target.split('@')[0]} is no longer a group admin.`);
    } catch (error) {
        logger.error(`Demote failed:`, error);
        return formatError('DEMOTION FAILED', error.message);
    }
}

// MUTE GROUP
async function handleMute(args, from, userJid, sock) {
    try {
        await sock.groupSettingUpdate(from, 'announcement');

        mutedGroups.set(from, {
            mutedAt: Date.now(),
            mutedBy: userJid
        });

        return formatSuccess('GROUP MUTED', 'Only admins can send messages now.');
    } catch (error) {
        logger.error(`Mute failed:`, error);
        return formatError('MUTE FAILED', error.message);
    }
}

// UNMUTE GROUP
async function handleUnmute(from, sock) {
    try {
        await sock.groupSettingUpdate(from, 'not_announcement');
        mutedGroups.delete(from);
        return formatSuccess('GROUP UNMUTED', 'All members can send messages now.');
    } catch (error) {
        logger.error(`Unmute failed:`, error);
        return formatError('UNMUTE FAILED', error.message);
    }
}

// TAGALL - Mention all members
async function handleTagall(args, from, userJid, sock) {
    try {
        const metadata = await sock.groupMetadata(from);
        const mentions = metadata.participants.map(p => p.id);
        const text = args.join(' ') || '📢 Attention everyone!';

        await sock.sendMessage(from, { text, mentions });
        return null; // Message already sent
    } catch (error) {
        logger.error(`Tagall failed:`, error);
        return formatError('TAGALL FAILED', error.message);
    }
}

// HIDETAG - Silent mention
async function handleHidetag(args, from, userJid, sock) {
    try {
        const metadata = await sock.groupMetadata(from);
        const mentions = metadata.participants.map(p => p.id);
        const text = args.join(' ') || '.';

        await sock.sendMessage(from, { text, mentions });
        return null; // Message already sent
    } catch (error) {
        logger.error(`Hidetag failed:`, error);
        return formatError('HIDETAG FAILED', error.message);
    }
}

// LINK - Get group invite link
async function handleLink(from, userJid, sock) {
    try {
        const code = await sock.groupInviteCode(from);
        return formatSuccess('GROUP LINK', `https://chat.whatsapp.com/${code}`);
    } catch (error) {
        logger.error(`Link failed:`, error);
        return formatError('LINK FAILED', error.message);
    }
}

// REVOKE - Revoke group link
async function handleRevoke(from, userJid, sock) {
    try {
        await sock.groupRevokeInvite(from);
        return formatSuccess('LINK REVOKED', 'Group link has been reset. New link can be generated with .link');
    } catch (error) {
        logger.error(`Revoke failed:`, error);
        return formatError('REVOKE FAILED', error.message);
    }
}

// GROUP SETTINGS
async function handleGroupSettings(args, from, userJid) {
    const setting = args[0];

    if (!setting) {
        return showGroupSettings(from);
    }

    switch (setting.toLowerCase()) {
        case 'welcome':
            return await toggleGroupWelcome(from, args[1], userJid);
        case 'antilink':
            return await toggleAntiLink(from, args[1], userJid);
        case 'antispam':
            return await toggleAntiSpam(from, args[1], userJid);
        case 'view':
            return showGroupSettings(from);
        default:
            return formatError('UNKNOWN SETTING', `Setting "${setting}" not recognized.`);
    }
}

// GROUP INFO
async function handleGroupInfo(from, sock) {
    try {
        const metadata = await sock.groupMetadata(from);
        const settings = await getGroupSettings(from);

        const info = {
            '👥 Name': metadata.subject,
            '🆔 ID': metadata.id.split('@')[0],
            '👑 Owner': `@${metadata.owner?.split('@')[0] || 'Unknown'}`,
            '👥 Members': metadata.participants.length,
            '👮 Admins': metadata.participants.filter(p => p.admin).length,
            '🔒 Restricted': metadata.restrict ? 'Yes' : 'No',
            '🔇 Announcement': metadata.announce ? 'Yes' : 'No',
            '🎉 Welcome': settings.welcome ? 'ON' : 'OFF',
            '🔗 Anti-link': settings.antilink ? 'ON' : 'OFF',
            '🚫 Anti-spam': settings.antispam ? 'ON' : 'OFF'
        };

        return formatData('GROUP INFORMATION', info);
    } catch (error) {
        logger.error(`Group info failed:`, error);
        return formatError('ERROR', error.message);
    }
}

// ANTI-LINK SETTINGS
async function handleAntiLink(args, from, userJid) {
    const action = args[0];

    if (!action || (action.toLowerCase() !== 'on' && action.toLowerCase() !== 'off')) {
        const current = await getGroupSetting(from, 'antilink') ? 'ON' : 'OFF';
        return formatInfo('ANTI-LINK', `Current: ${current}\n\nUsage: .antilink on/off`);
    }

    const enabled = action.toLowerCase() === 'on';
    await setGroupSetting(from, 'antilink', enabled);
    return formatSuccess('ANTI-LINK', `${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// ANTI-SPAM SETTINGS
async function handleAntiSpam(args, from, userJid) {
    const action = args[0];

    if (!action || (action.toLowerCase() !== 'on' && action.toLowerCase() !== 'off')) {
        const current = await getGroupSetting(from, 'antispam') ? 'ON' : 'OFF';
        return formatInfo('ANTI-SPAM', `Current: ${current}\n\nUsage: .antispam on/off`);
    }

    const enabled = action.toLowerCase() === 'on';
    await setGroupSetting(from, 'antispam', enabled);
    return formatSuccess('ANTI-SPAM', `${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// GROUP RULES
async function handleGroupRules(from) {
    const rules = await getGroupSetting(from, 'rules') ||
                  '1. Be respectful\n2. No spam\n3. No advertising\n4. Follow admin instructions';

    return formatInfo('GROUP RULES', rules);
}

// SET RULES
async function handleSetRules(args, from, userJid) {
    const rules = args.join(' ');
    if (!rules) {
        return formatInfo('SET RULES', 'Usage: .setrules <rules>\nExample: .setrules 1. Be nice 2. No spam');
    }

    await setGroupSetting(from, 'rules', rules);
    return formatSuccess('RULES UPDATED', 'Group rules have been updated.');
}

// REPORT USER
async function handleReport(args, from, userJid, sock) {
    const target = getTargetUser(args);
    if (!target || args.length < 2) {
        return formatInfo('REPORT USER', 'Usage: .report @user [reason]\nExample: .report @user Spamming');
    }

    const reason = args.slice(1).join(' ');

    try {
        // Get group admins
        const metadata = await sock.groupMetadata(from);
        const admins = metadata.participants.filter(p => p.admin).map(p => p.id);

        // Send report to admins
        const reportMsg = `🚨 *REPORT*\n\nGroup: ${from.split('@')[0]}\nReported: @${target.split('@')[0]}\nBy: @${userJid.split('@')[0]}\nReason: ${reason}`;

        for (const admin of admins) {
            try {
                await sock.sendMessage(admin, { text: reportMsg, mentions: [target, userJid] });
            } catch (e) {
                // Ignore send errors
            }
        }

        return formatSuccess('REPORT SENT', 'Your report has been sent to group admins.');
    } catch (error) {
        logger.error(`Report failed:`, error);
        return formatError('REPORT FAILED', error.message);
    }
}

// MODERATION LOGS
async function handleModLog(args, from, userJid) {
    const count = parseInt(args[0]) || 10;

    try {
        // Get from database (implement as needed)
        return formatInfo('MODERATION LOGS', 'Feature coming soon.');
    } catch (error) {
        logger.error(`Modlog failed:`, error);
        return formatError('ERROR', error.message);
    }
}

// ========== HELPER FUNCTIONS ==========

function getTargetUser(args) {
    if (!args || args.length === 0) return null;

    // Check for mention
    if (args[0].includes('@')) {
        return args[0];
    }

    // Check for phone number
    const phoneNumber = args[0].replace(/[^0-9]/g, '');
    if (phoneNumber && phoneNumber.length >= 10) {
        return `${phoneNumber}@s.whatsapp.net`;
    }

    return null;
}

// Group settings management
async function getGroupSettings(groupJid) {
    let settings = groupSettings.get(groupJid);

    if (!settings) {
        try {
            settings = await db.getGroupSettings(groupJid) || getDefaultGroupSettings();
            groupSettings.set(groupJid, settings);
        } catch (error) {
            logger.error(`Failed to get settings for ${groupJid}:`, error);
            settings = getDefaultGroupSettings();
        }
    }

    return settings;
}

async function getGroupSetting(groupJid, setting) {
    const settings = await getGroupSettings(groupJid);
    return settings[setting] !== undefined ? settings[setting] : getDefaultGroupSetting(setting);
}

async function setGroupSetting(groupJid, setting, value) {
    const settings = await getGroupSettings(groupJid);
    settings[setting] = value;
    groupSettings.set(groupJid, settings);

    try {
        await db.saveGroupSettings(groupJid, settings);
    } catch (error) {
        logger.error(`Failed to save settings for ${groupJid}:`, error);
    }
}

function getDefaultGroupSettings() {
    return {
        welcome: true,
        antilink: false,
        antispam: false,
        rules: '',
        welcomeMessage: ''
    };
}

function getDefaultGroupSetting(setting) {
    const defaults = getDefaultGroupSettings();
    return defaults[setting] || false;
}

function showGroupSettings(groupJid) {
    const settings = getGroupSettings(groupJid);

    return formatData('GROUP SETTINGS', {
        '🎉 Welcome': settings.welcome ? 'ON' : 'OFF',
        '🔗 Anti-link': settings.antilink ? 'ON' : 'OFF',
        '🚫 Anti-spam': settings.antispam ? 'ON' : 'OFF',
        '📜 Rules': settings.rules ? 'SET' : 'NOT SET'
    });
}

async function toggleGroupWelcome(groupJid, action, userJid) {
    const enabled = action?.toLowerCase() === 'on';
    await setGroupSetting(groupJid, 'welcome', enabled);
    return formatSuccess('WELCOME', `${enabled ? 'ENABLED' : 'DISABLED'}`);
}

async function toggleAntiLink(groupJid, action, userJid) {
    const enabled = action?.toLowerCase() === 'on';
    await setGroupSetting(groupJid, 'antilink', enabled);
    return formatSuccess('ANTI-LINK', `${enabled ? 'ENABLED' : 'DISABLED'}`);
}

async function toggleAntiSpam(groupJid, action, userJid) {
    const enabled = action?.toLowerCase() === 'on';
    await setGroupSetting(groupJid, 'antispam', enabled);
    return formatSuccess('ANTI-SPAM', `${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// Warning management
export function getGroupWarnings(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    return groupWarnings.get(key) || { count: 0, reasons: [] };
}

export function clearGroupWarnings(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    groupWarnings.delete(key);
}

// Welcome handler for new members
export async function handleGroupWelcome(participant, groupJid, sock) {
    try {
        const settings = await getGroupSettings(groupJid);

        if (!settings.welcome) return;

        const welcomeMsg = settings.welcomeMessage ||
            `🎉 *WELCOME!*\n\n👋 Hello @${participant.split('@')[0]}!\nWelcome to the group!\n\nPlease read the rules and enjoy your stay.`;

        await sock.sendMessage(groupJid, {
            text: welcomeMsg,
            mentions: [participant]
        });

        logger.info(`Welcome sent to ${participant} in ${groupJid}`);
    } catch (error) {
        logger.error(`Welcome error:`, error);
    }
}

// Rule checking for messages
export async function checkGroupRules(message, from, userJid, sock) {
    if (!from.endsWith('@g.us')) return false;

    const settings = await getGroupSettings(from);

    // Anti-link check
    if (settings.antilink && containsLink(message)) {
        await handleRuleViolation('link', from, userJid, sock, message);
        return true;
    }

    // Anti-spam check
    if (settings.antispam && await isSpam(from, userJid, message)) {
        await handleRuleViolation('spam', from, userJid, sock, message);
        return true;
    }

    return false;
}

function containsLink(text) {
    if (!text) return false;
    const linkRegex = /(https?:\/\/[^\s]+)/gi;
    return linkRegex.test(text);
}

async function isSpam(groupJid, userJid, message) {
    const key = `${groupJid}_${userJid}`;
    const now = Date.now();
    const timeWindow = 10000; // 10 seconds
    const maxMessages = 5;

    let activity = userActivity.get(key) || { messages: [], lastActive: now };
    activity.messages = activity.messages.filter(t => now - t < timeWindow);
    activity.messages.push(now);
    userActivity.set(key, activity);

    return activity.messages.length > maxMessages;
}

async function handleRuleViolation(type, groupJid, userJid, sock, message) {
    const warning = type === 'link' ?
        '🔗 *LINKS ARE NOT ALLOWED*' :
        '🚫 *PLEASE DO NOT SPAM*';

    try {
        // Delete message
        await sock.sendMessage(groupJid, { delete: message.key });

        // Send warning
        await sock.sendMessage(groupJid, {
            text: `${warning}\n\n👤 @${userJid.split('@')[0]}`,
            mentions: [userJid]
        });

        // Add warning
        const warnings = getGroupWarnings(groupJid, userJid);
        warnings.count++;
        warnings.reasons.push({
            reason: `${type} violation`,
            time: Date.now(),
            by: 'SYSTEM'
        });

        const key = `${groupJid}_${userJid}`;
        groupWarnings.set(key, warnings);

    } catch (error) {
        logger.error(`Rule violation handling failed:`, error);
    }
}

// Cooldown management
function isOnCooldown(userJid, command, seconds) {
    const key = `${userJid}_${command}`;
    const lastUsed = commandCooldowns.get(key);
    if (!lastUsed) return false;
    return (Date.now() - lastUsed) < (seconds * 1000);
}

function getCooldownRemaining(userJid, command) {
    const key = `${userJid}_${command}`;
    const lastUsed = commandCooldowns.get(key);
    if (!lastUsed) return 0;
    const remaining = Math.max(0, 3000 - (Date.now() - lastUsed));
    return Math.ceil(remaining / 1000);
}

function setCooldown(userJid, command) {
    const key = `${userJid}_${command}`;
    commandCooldowns.set(key, Date.now());
    setTimeout(() => commandCooldowns.delete(key), 60000);
}

// User activity tracking
function trackUserActivity(groupJid, userJid) {
    const key = `${groupJid}_${userJid}`;
    const now = Date.now();
    let activity = userActivity.get(key) || { messages: [], commands: [], lastActive: now };
    activity.lastActive = now;
    activity.commands.push(now);
    userActivity.set(key, activity);
}

// ========== EXPORTS ==========
export default {
    initializeGroupHandler,
    handleGroupCommand,
    handleGroupWelcome,
    checkGroupRules,
    isGroupAdmin,
    getGroupWarnings,
    clearGroupWarnings
};
