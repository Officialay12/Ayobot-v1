// features/antilink.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  COMPLETE ANTI-LINK SYSTEM
//  Author: AYOCODES
//
//  FEATURES:
//  • Detects ALL forms of links (http, https, www, shorteners, etc.)
//  • Immediate message deletion
//  • Warning system (3 strikes → auto-kick)
//  • Admin exemption
//  • Allowed domains exemption
// ════════════════════════════════════════════════════════════════════════════

import { groupSettings, groupWarnings } from '../index.js';

// ============================================================================
//  COMPREHENSIVE LINK DETECTION PATTERNS
//  Catches EVERY possible link format
// ============================================================================
const LINK_PATTERNS = [
  // Standard URLs
  /https?:\/\/[^\s]+/gi,
  /www\.[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+/gi,

  // URL shorteners and common services
  /bit\.ly\/[a-zA-Z0-9_]+/gi,
  /tinyurl\.com\/[a-zA-Z0-9_]+/gi,
  /ow\.ly\/[a-zA-Z0-9_]+/gi,
  /is\.gd\/[a-zA-Z0-9_]+/gi,
  /buff\.ly\/[a-zA-Z0-9_]+/gi,
  /adf\.ly\/[a-zA-Z0-9_]+/gi,
  /shorte\.st\/[a-zA-Z0-9_]+/gi,
  /goo\.gl\/[a-zA-Z0-9_]+/gi,
  /tiny\.cc\/[a-zA-Z0-9_]+/gi,
  /cli\.gs\/[a-zA-Z0-9_]+/gi,
  /ur1\.ca\/[a-zA-Z0-9_]+/gi,
  /cur\.lv\/[a-zA-Z0-9_]+/gi,
  /qr\.ae\/[a-zA-Z0-9_]+/gi,
  /v\.gd\/[a-zA-Z0-9_]+/gi,
  /t\.co\/[a-zA-Z0-9_]+/gi,
  /lnkd\.in\/[a-zA-Z0-9_]+/gi,
  /db\.tt\/[a-zA-Z0-9_]+/gi,
  /youtu\.be\/[a-zA-Z0-9_-]+/gi,
  /instagram\.com\/p\/[a-zA-Z0-9_-]+/gi,
  /twitter\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /x\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /facebook\.com\/[a-zA-Z0-9_.-]+\/posts\/[0-9]+/gi,
  /tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/[0-9]+/gi,
  /spotify\.com\/track\/[a-zA-Z0-9]+/gi,
  /deezer\.page\.link\/[a-zA-Z0-9]+/gi,
  /soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/gi,

  // WhatsApp and Telegram
  /wa\.me\/[0-9]+/gi,
  /chat\.whatsapp\.com\/[a-zA-Z0-9_]+/gi,
  /t\.me\/[a-zA-Z0-9_]+/gi,
  /telegram\.me\/[a-zA-Z0-9_]+/gi,

  // IP addresses as links
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(:\d+)?(\/[^\s]*)?/gi,

  // Domains without protocol (catch-all)
  /\b[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+\b(\/[^\s]*)?/gi,

  // Subdomains
  /\b[a-zA-Z0-9-]+\.([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b(\/[^\s]*)?/gi,

  // Punycode/IDN domains
  /xn--[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+/gi,

  // File sharing links
  /drive\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
  /docs\.google\.com\/[a-zA-Z0-9?=&_\/-]+/gi,
  /1drv\.ms\/[a-zA-Z0-9_]+/gi,
  /dropbox\.com\/s\/[a-zA-Z0-9_-]+/gi,
  /mega\.nz\/[#!][a-zA-Z0-9_-]+/gi,
  /mediafire\.com\/file\/[a-zA-Z0-9_-]+/gi,
  /wetransfer\.com\/downloads\/[a-zA-Z0-9_-]+/gi,

  // URL encoded links
  /%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/gi,

  // Markdown/HTML links
  /\[.*?\]\(.*?\)/gi,
  /<a\s+href=.*?>/gi,

  // Suspicious patterns (potential link obfuscation)
  /(?:https?|ftp|file):\/\//gi,
  /(?:http|https|ftp|file):\/\/(?:[^\s]+)/gi
];

// Allowed domains (never delete)
const ALLOWED_DOMAINS = [
  // Educational
  'wikipedia.org',
  'edu',
  'khanacademy.org',
  'coursera.org',
  'udemy.com',

  // Official/Trusted
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'npmjs.com',
  'docker.com',

  // Social media (optional - you can remove these if you want to block all)
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'tiktok.com',

  // Music
  'spotify.com',
  'deezer.com',
  'soundcloud.com',
  'apple.com',

  // Creator's domains
  'ayocodes.com',
  'officialay12.github.io'
];

const MAX_WARNINGS = 3;

// ============================================================================
//  LINK DETECTION FUNCTION
// ============================================================================
export function containsLink(text) {
  if (!text || typeof text !== 'string') return false;

  // Check each pattern
  for (const pattern of LINK_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Additional check for suspicious strings that might be links
  const words = text.split(/\s+/);
  for (const word of words) {
    // Check if word contains a dot and no spaces (potential domain)
    if (word.includes('.') && !word.includes(' ')) {
      // Exclude common non-link patterns
      if (!word.match(/^[0-9]+$/)) { // Not just numbers
        if (word.length > 4 && word.length < 50) { // Reasonable domain length
          return true;
        }
      }
    }
  }

  return false;
}

// ============================================================================
//  CHECK IF DOMAIN IS ALLOWED
// ============================================================================
export function isAllowedDomain(url) {
  try {
    let domain = url.toLowerCase();

    // Remove protocol
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

    // Get main domain (before first slash or end)
    domain = domain.split('/')[0];

    // Check against allowed domains
    for (const allowed of ALLOWED_DOMAINS) {
      if (domain === allowed || domain.endsWith('.' + allowed)) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

// ============================================================================
//  CHECK IF USER IS ADMIN
// ============================================================================
async function isUserAdmin(sock, groupJid, userJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants.some(
      p => p.id === userJid && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch {
    return false;
  }
}

// ============================================================================
//  MAIN ANTI-LINK HANDLER
// ============================================================================
export async function handleAntiLink(message, from, sock) {
  try {
    // Only process in groups
    if (!from.endsWith('@g.us')) return false;

    // Check if anti-link is enabled for this group
    const settings = groupSettings.get(from) || {};
    if (!settings.antilink) return false;

    // Get message text from all possible sources
    const msgObj = message.message || {};
    const text =
      msgObj.conversation ||
      msgObj.extendedTextMessage?.text ||
      msgObj.imageMessage?.caption ||
      msgObj.videoMessage?.caption ||
      msgObj.documentMessage?.caption ||
      '';

    if (!text) return false;

    // Check if message contains links
    if (!containsLink(text)) return false;

    // Get sender info
    const senderJid = message.key?.participant || from;
    const senderNumber = senderJid.split('@')[0];

    // Check if sender is admin (admins exempt)
    const admin = await isUserAdmin(sock, from, senderJid);
    if (admin) return false;

    // Check if domain is allowed
    if (isAllowedDomain(text)) return false;

    // ======================================================================
    //  LINK DETECTED - TAKE ACTION
    // ======================================================================

    // Try to delete the message
    let deleted = false;
    try {
      await sock.sendMessage(from, { delete: message.key });
      deleted = true;
      console.log(`🚫 Deleted link message from ${senderNumber} in ${from}`);
    } catch (deleteError) {
      console.log(`⚠️ Could not delete message: ${deleteError.message}`);
    }

    // Track warnings
    const userWarnings = groupWarnings.get(`${from}:${senderJid}`) || 0;
    const newWarnings = userWarnings + 1;
    groupWarnings.set(`${from}:${senderJid}`, newWarnings);

    // Send warning/action message
    if (newWarnings >= MAX_WARNINGS) {
      // Auto-kick after max warnings
      try {
        await sock.groupParticipantsUpdate(from, [senderJid], 'remove');
        await sock.sendMessage(from, {
          text: `🚫 *@${senderNumber} has been removed for posting links after ${MAX_WARNINGS} warnings.*\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ Links are strictly prohibited in this group.`,
          mentions: [senderJid]
        });
        groupWarnings.delete(`${from}:${senderJid}`); // Reset warnings after kick
      } catch (kickError) {
        await sock.sendMessage(from, {
          text: `⚠️ *WARNING ${newWarnings}/${MAX_WARNINGS}* - @${senderNumber} No links allowed!\n❌ Failed to kick (bot not admin)`,
          mentions: [senderJid]
        });
      }
    } else {
      const warningsLeft = MAX_WARNINGS - newWarnings;
      await sock.sendMessage(from, {
        text: `🚫 *NO LINKS ALLOWED!*\n━━━━━━━━━━━━━━━━━━━━━\n👤 *User:* @${senderNumber}\n⚠️ *Warning:* ${newWarnings}/${MAX_WARNINGS}\n💢 *Action:* Message deleted${deleted ? ' ✅' : ' ❌'}\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ ${warningsLeft} more warning(s) and you'll be removed.`,
        mentions: [senderJid]
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Anti-link error:', error.message);
    return false;
  }
}

// ============================================================================
//  TOGGLE ANTILINK (if needed, but you have this in basic.js)
// ============================================================================
export async function toggleAntiLink({ args, from, sock, isAdmin }) {
  if (!from.endsWith('@g.us')) {
    return sock.sendMessage(from, {
      text: '❌ This command only works in groups.'
    });
  }

  if (!isAdmin) {
    return sock.sendMessage(from, {
      text: '⛔ Only group admins can use this command.'
    });
  }

  const sub = args[0]?.toLowerCase();
  const settings = groupSettings.get(from) || {};

  if (!sub || !['on', 'off', 'status'].includes(sub)) {
    const status = settings.antilink ? 'ON ✅' : 'OFF ❌';
    return sock.sendMessage(from, {
      text: `🔗 *ANTI-LINK SETTINGS*\n\nCurrent Status: *${status}*\n\n• .antilink on — Enable protection\n• .antilink off — Disable protection\n• .antilink status — Check status\n\n⚠️ When enabled, ALL links will be deleted and users warned. After ${MAX_WARNINGS} warnings, auto-kick.`
    });
  }

  if (sub === 'on') {
    settings.antilink = true;
    groupSettings.set(from, settings);
    return sock.sendMessage(from, {
      text: `✅ *ANTI-LINK ENABLED*\n━━━━━━━━━━━━━━━━━━━━━\n🔗 All links will now be:\n• Automatically deleted\n• Users warned\n• Auto-kick after ${MAX_WARNINGS} warnings\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_`
    });
  }

  if (sub === 'off') {
    settings.antilink = false;
    groupSettings.set(from, settings);
    return sock.sendMessage(from, {
      text: `🔴 *ANTI-LINK DISABLED*\n\nLinks are now allowed.`
    });
  }

  const status = settings.antilink ? 'ENABLED ✅' : 'DISABLED ❌';
  await sock.sendMessage(from, {
    text: `🔗 *Anti-Link Status:* ${status}`
  });
}

export default {
  handleAntiLink,
  toggleAntiLink,
  containsLink,
  isAllowedDomain
};
