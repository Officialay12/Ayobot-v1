// commands/group/automation.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Automation Module - CLEAN VERSION WITH WORKING ANTILINK
//  Author: AYOCODES
//
//  FEATURES:
//  • ✅ ULTIMATE ANTILINK - Detects ALL link formats
//  • ✅ Immediate message deletion
//  • ✅ Warning system (3 strikes → auto-kick)
//  • ✅ Welcome messages on join
//  • ✅ Goodbye messages on leave
//  • ✅ Anti-spam detection
// ════════════════════════════════════════════════════════════════════════════

import { ENV, groupSettings, bannedUsers, groupWarnings, saveGroupSettings, saveWarnings } from '../../index.js';
import { getGroupMetadataCached } from '../../utils/validators.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '../../temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Lazy load gTTS
let _gtts = null;
async function getGtts() {
  if (!_gtts) {
    try {
      const mod = await import('gtts');
      _gtts = mod.default || mod;
    } catch (_) {}
  }
  return _gtts;
}

// Helper to safely extract JID
function safeJid(jid) {
  if (!jid) return '';
  if (typeof jid === 'string') return jid;
  if (typeof jid === 'object' && (jid.id || jid.jid || jid.participant)) {
    return jid.id || jid.jid || jid.participant || String(jid);
  }
  return String(jid);
}

// Helper to safely extract phone number
function safePhone(jid) {
  const jidStr = jid ? (typeof jid === 'string' ? jid : (typeof jid === 'object' && (jid.id || jid.jid || jid.participant) ? (jid.id || jid.jid || jid.participant) : String(jid))) : '';
  return jidStr.split('@')[0].split(':')[0] || jidStr;
}

// ============================================================================
//  ULTIMATE LINK DETECTION - DETECTS EVERY LINK FORMAT
// ============================================================================
const LINK_PATTERNS = [
  // Standard URLs
  /https?:\/\/[^\s<>"']+/gi,
  /www\.[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+(:[0-9]+)?(\/[^\s<>"']*)?/gi,

  // URL shorteners (comprehensive list)
  /bit\.ly\/[a-zA-Z0-9_-]+/gi,
  /tinyurl\.com\/[a-zA-Z0-9_-]+/gi,
  /ow\.ly\/[a-zA-Z0-9_-]+/gi,
  /is\.gd\/[a-zA-Z0-9_-]+/gi,
  /buff\.ly\/[a-zA-Z0-9_-]+/gi,
  /adf\.ly\/[a-zA-Z0-9_-]+/gi,
  /shorte\.st\/[a-zA-Z0-9_-]+/gi,
  /goo\.gl\/[a-zA-Z0-9_-]+/gi,
  /tiny\.cc\/[a-zA-Z0-9_-]+/gi,
  /cli\.gs\/[a-zA-Z0-9_-]+/gi,
  /ur1\.ca\/[a-zA-Z0-9_-]+/gi,
  /cur\.lv\/[a-zA-Z0-9_-]+/gi,
  /qr\.ae\/[a-zA-Z0-9_-]+/gi,
  /v\.gd\/[a-zA-Z0-9_-]+/gi,
  /t\.co\/[a-zA-Z0-9_-]+/gi,
  /lnkd\.in\/[a-zA-Z0-9_-]+/gi,
  /db\.tt\/[a-zA-Z0-9_-]+/gi,
  /cutt\.ly\/[a-zA-Z0-9_-]+/gi,
  /rebrand\.ly\/[a-zA-Z0-9_-]+/gi,
  /short\.link\/[a-zA-Z0-9_-]+/gi,
  /s\.id\/[a-zA-Z0-9_-]+/gi,
  /rb\.gy\/[a-zA-Z0-9_-]+/gi,
  /shorturl\.at\/[a-zA-Z0-9_-]+/gi,
  /aka\.ms\/[a-zA-Z0-9_-]+/gi,

  // Social media links
  /youtu\.be\/[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/shorts\/[a-zA-Z0-9_-]+/gi,
  /youtube\.com\/embed\/[a-zA-Z0-9_-]+/gi,
  /instagram\.com\/p\/[a-zA-Z0-9_-]+\/?/gi,
  /instagram\.com\/reel\/[a-zA-Z0-9_-]+\/?/gi,
  /instagram\.com\/stories\/[a-zA-Z0-9_-]+\/[0-9]+\/?/gi,
  /twitter\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /x\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/gi,
  /tiktok\.com\/@[a-zA-Z0-9_.-]+\/video\/[0-9]+/gi,
  /tiktok\.com\/@[a-zA-Z0-9_.-]+/gi,
  /facebook\.com\/[a-zA-Z0-9_.-]+\/posts\/[0-9]+/gi,
  /facebook\.com\/[a-zA-Z0-9_.-]+\/videos\/[0-9]+/gi,
  /fb\.watch\/[a-zA-Z0-9_-]+/gi,
  /snapchat\.com\/add\/[a-zA-Z0-9_-]+/gi,
  /t\.me\/[a-zA-Z0-9_]+/gi,
  /telegram\.me\/[a-zA-Z0-9_]+/gi,
  /whatsapp\.com\/channel\/[0-9A-Za-z_-]+/gi,

  // Messaging apps
  /wa\.me\/[0-9]+/gi,
  /chat\.whatsapp\.com\/[a-zA-Z0-9_]+/gi,
  /signal\.org\/[a-zA-Z0-9_]+/gi,
  /discord\.gg\/[a-zA-Z0-9_]+/gi,
  /discord\.com\/invite\/[a-zA-Z0-9_]+/gi,

  // IP addresses as links
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(:\d+)?(\/[^\s<>"']*)?/gi,

  // Domains without protocol (catch-all)
  /\b[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+\b(\/[^\s<>"']*)?/gi,

  // Subdomains
  /\b[a-zA-Z0-9-]+\.([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b(\/[^\s<>"']*)?/gi,

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
  /pixeldrain\.com\/u\/[a-zA-Z0-9_-]+/gi,

  // Music/Streaming
  /spotify\.com\/track\/[a-zA-Z0-9]+/gi,
  /spotify\.com\/playlist\/[a-zA-Z0-9]+/gi,
  /deezer\.page\.link\/[a-zA-Z0-9]+/gi,
  /soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/gi,
  /apple\.com\/[a-zA-Z0-9\/_-]+/gi,

  // URL encoded links
  /%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/gi,

  // Markdown/HTML links
  /\[.*?\]\(.*?\)/gi,
  /<a\s+href=.*?>/gi,

  // Suspicious patterns (potential link obfuscation)
  /(?:https?|ftp|file):\/\//gi,

  // Common TLDs without protocol
  /\b[a-zA-Z0-9-]+\.(com|org|net|edu|gov|mil|int|io|co|uk|de|fr|es|it|ru|jp|cn|br|au|ca|in|nl|se|no|dk|fi|pl|cz|hu|at|ch|be|pt|gr|tr|il|za|kr|sg|hk|tw|th|vn|my|ph|id|pk|bd|ng|ke|eg|ma|tn|dz|sa|ae|qa|kw|jo|lb|ps|cy|is|lt|lv|ee|by|ua|md|ge|am|az|kz|uz|tm|mn|np|bd|lk|mm|la|kh|bn|mo|kp|vn|ph|my|id|tl|pg|fj|vu|sb|nc|pf|wf|tk|to|ws|nu|ck|nu|tv|as|gu|mp|pr|vi|um|fm|mh|pw|nr|ki|tv|sb|vu|fj|nc|pf|wf|tk|to|ws|nu|ck|nu|tv|as|gu|mp|pr|vi|um|fm|mh|pw|nr|ki)\b(\/[^\s<>"']*)?/gi
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

  // Social media (optional - remove if you want to block all)
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
    pattern.lastIndex = 0; // Reset regex state
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
          // Check if it has a valid TLD pattern
          if (word.match(/\.[a-zA-Z]{2,}([\/\?]|$)/)) {
            return true;
          }
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

    // Extract just the domain name (remove port, etc.)
    domain = domain.split(':')[0];

    // Check against allowed domains
    for (const allowed of ALLOWED_DOMAINS) {
      if (domain === allowed || domain.endsWith('.' + allowed)) {
        return true;
      }

      // Check if it's a subdomain of an allowed domain
      if (domain.includes('.') && domain.endsWith('.' + allowed)) {
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
//  MAIN ANTILINK HANDLER - CALL THIS FOR EVERY MESSAGE
// ============================================================================
export async function handleAntiLink(message, groupJid, sock) {
  try {
    // Only process in groups
    if (!groupJid.endsWith('@g.us')) return false;

    // Check if anti-link is enabled for this group
    const settings = groupSettings.get(groupJid) || {};
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
    const senderJid = message.key?.participant || groupJid;
    const senderNumber = senderJid.split('@')[0];

    // Check if sender is admin (admins exempt)
    const admin = await isUserAdmin(sock, groupJid, senderJid);
    if (admin) {
      console.log(`👑 Admin ${senderNumber} posted link - allowed`);
      return false;
    }

    // Check if domain is allowed
    if (isAllowedDomain(text)) {
      console.log(`✅ Allowed domain posted by ${senderNumber}`);
      return false;
    }

    // ======================================================================
    //  LINK DETECTED - TAKE ACTION
    // ======================================================================
    console.log(`🚫 Link detected from ${senderNumber} in ${groupJid}`);

    // Try to delete the message
    let deleted = false;
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
      deleted = true;
      console.log(`✅ Message deleted successfully`);
    } catch (deleteError) {
      console.log(`⚠️ Could not delete message: ${deleteError.message}`);
    }

    // Track warnings
    const warnKey = `${groupJid}:${senderJid}`;
    const userWarnings = groupWarnings.get(warnKey) || 0;
    const newWarnings = userWarnings + 1;
    groupWarnings.set(warnKey, newWarnings);
    saveWarnings();

    const warningsLeft = MAX_WARNINGS - newWarnings;

    // Send warning message
    if (newWarnings >= MAX_WARNINGS) {
      // Auto-kick after max warnings
      try {
        await sock.groupParticipantsUpdate(groupJid, [senderJid], 'remove');
        await sock.sendMessage(groupJid, {
          text: `🚫 *@${senderNumber} has been removed for posting links after ${MAX_WARNINGS} warnings.*\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ Links are strictly prohibited in this group.`,
          mentions: [senderJid]
        });
        groupWarnings.delete(warnKey); // Reset warnings after kick
        saveWarnings();
        console.log(`👢 User ${senderNumber} kicked after ${MAX_WARNINGS} warnings`);
      } catch (kickError) {
        await sock.sendMessage(groupJid, {
          text: `⚠️ *WARNING ${newWarnings}/${MAX_WARNINGS}* - @${senderNumber} No links allowed!\n❌ Failed to kick (bot not admin)`,
          mentions: [senderJid]
        });
      }
    } else {
      await sock.sendMessage(groupJid, {
        text:
          `╔══════════════════════════╗\n` +
          `║   🚫 *NO LINKS ALLOWED*  ║\n` +
          `╚══════════════════════════╝\n\n` +
          `👤 *User:* @${senderNumber}\n` +
          `⚠️ *Warning:* ${newWarnings}/${MAX_WARNINGS}\n` +
          `💢 *Action:* Message deleted ${deleted ? '✅' : '❌'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ ${warningsLeft} more warning(s) and you'll be removed.\n\n` +
          `⚡ *AYOBOT Security* | 👑 AYOCODES`,
        mentions: [senderJid]
      });
      console.log(`⚠️ Warning ${newWarnings}/${MAX_WARNINGS} sent to ${senderNumber}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Anti-link error:', error.message);
    return false;
  }
}

// ============================================================================
//  MAIN GROUP PARTICIPANT HANDLER
// ============================================================================
export async function handleGroupParticipant(update, sock) {
  const { id: groupJid, participants, action } = update;

  if (!groupJid || !participants || !Array.isArray(participants)) return;

  for (const participant of participants) {
    try {
      const participantJid = safeJid(participant);
      if (!participantJid) continue;

      if (action === 'add') {
        await handleGroupJoin(groupJid, participantJid, sock);
      } else if (action === 'remove') {
        await handleGroupLeave(groupJid, participantJid, sock);
      }
    } catch (err) {
      console.error("❌ Participant update error:", err.message);
    }
  }
}

// ============================================================================
//  HANDLE GROUP JOIN
// ============================================================================
async function handleGroupJoin(groupJid, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    const banKey = groupJid + '_' + participantJid;

    // Check if user is banned from this group
    if (bannedUsers.has(banKey)) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
        console.log("🚫 Auto-kicked banned user ", participantJid);
      } catch (_) {}
      return;
    }

    // Send welcome message if enabled
    if (settings.welcome) {
      await sendWelcomeMessage(groupJid, participantJid, sock, settings);
    }

    // Send voice welcome if enabled (optional)
    if (settings.voiceWelcome) {
      await sendVoiceWelcome(groupJid, participantJid, sock, settings);
    }
  } catch (err) {
    console.error("❌ Join handler error:", err.message);
  }
}

// ============================================================================
//  SEND WELCOME MESSAGE
// ============================================================================
async function sendWelcomeMessage(groupJid, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupJid, sock);
    } catch (_) {}

    const groupName = metadata?.subject || 'the group';
    const userPhone = safePhone(participantJid);
    const memberCount = metadata?.participants?.length || 0;

    let welcomeText = settings.welcomeMessage ||
      "Welcome to *" + groupName + "*! 🎉\n\nHey @" + userPhone + "! Welcome to the group! You are member #" + memberCount + ".";

    // Replace variables
    welcomeText = welcomeText
      .replace(/@user/gi, '@' + userPhone)
      .replace(/@group/gi, groupName)
      .replace(/@count/gi, memberCount.toString())
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption = "👋 *Welcome to " + groupName + "* 👋\n\n" + welcomeText + "\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_";

    // Try to send with image
    try {
      await sock.sendMessage(groupJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: caption,
        mentions: [participantJid]
      });
    } catch (_) {
      // Fallback to text only
      await sock.sendMessage(groupJid, {
        text: caption,
        mentions: [participantJid]
      });
    }

    console.log("👋 Welcome sent to " + userPhone + " in " + groupJid);
  } catch (err) {
    console.error("❌ Welcome message error:", err.message);
  }
}

// ============================================================================
//  SEND VOICE WELCOME (optional)
// ============================================================================
async function sendVoiceWelcome(groupJid, participantJid, sock, settings) {
  try {
    const gtts = await getGtts();
    if (!gtts) return;

    const userPhone = safePhone(participantJid);
    const speech = new gtts("Welcome to the group, " + userPhone + "! We are happy to have you here.", 'en');
    const filePath = path.join(TEMP_DIR, 'welcome_' + Date.now() + '.mp3');

    await new Promise((resolve, reject) => {
      speech.save(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const audioBuffer = fs.readFileSync(filePath);
    await sock.sendMessage(groupJid, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      ptt: true,
      mentions: [participantJid]
    });

    // Cleanup
    try { fs.unlinkSync(filePath); } catch (_) {}
  } catch (err) {
    console.error("❌ Voice welcome error:", err.message);
  }
}

// ============================================================================
//  HANDLE GROUP LEAVE
// ============================================================================
async function handleGroupLeave(groupJid, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupJid) || {};

    if (settings.goodbye) {
      await sendGoodbyeMessage(groupJid, participantJid, sock, settings);
    }
  } catch (err) {
    console.error("❌ Leave handler error:", err.message);
  }
}

// ============================================================================
//  SEND GOODBYE MESSAGE
// ============================================================================
async function sendGoodbyeMessage(groupJid, participantJid, sock, settings) {
  try {
    let metadata = null;
    try {
      metadata = await getGroupMetadataCached(groupJid, sock);
    } catch (_) {}

    const groupName = metadata?.subject || 'the group';
    const userPhone = safePhone(participantJid);

    let goodbyeText = settings.goodbyeMessage ||
      "Goodbye, @" + userPhone + "! 👋\nWe'll miss you in *" + groupName + "*. ";

    // Replace variables
    goodbyeText = goodbyeText
      .replace(/@user/gi, '@' + userPhone)
      .replace(/@group/gi, groupName)
      .replace(/@time/gi, new Date().toLocaleTimeString())
      .replace(/@date/gi, new Date().toLocaleDateString());

    const caption = "👋 *Goodbye from " + groupName + "* 👋\n\n" + goodbyeText + "\n\n━━━━━━━━━━━━━━━━━━━━━\n⚡ _AYOBOT v1_ | 👑 _AYOCODES_";

    // Try to send with image
    try {
      await sock.sendMessage(groupJid, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: caption,
        mentions: [participantJid]
      });
    } catch (_) {
      // Fallback to text only
      await sock.sendMessage(groupJid, {
        text: caption,
        mentions: [participantJid]
      });
    }

    console.log("👋 Goodbye sent for " + userPhone + " in " + groupJid);
  } catch (err) {
    console.error("❌ Goodbye message error:", err.message);
  }
}

// ============================================================================
//  CHECK MESSAGE FOR VIOLATIONS (for backward compatibility)
// ============================================================================
export async function checkMessageViolation(message, groupJid, senderJid, sock) {
  // This is now handled by handleAntiLink directly
  return false;
}

// ============================================================================
//  HANDLE RULE VIOLATION (for backward compatibility)
// ============================================================================
export async function handleRuleViolation(type, groupJid, senderJid, sock, message) {
  if (type === 'link') {
    return handleAntiLink(message, groupJid, sock);
  }
  return false;
}

// ============================================================================
//  SETTINGS HELPERS
// ============================================================================
export async function setWelcome(groupJid, enabled, message = null) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.welcome = enabled;
    if (message) {
      settings.welcomeMessage = message;
    }
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (err) {
    return false;
  }
}

export async function setGoodbye(groupJid, enabled, message = null) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.goodbye = enabled;
    if (message) {
      settings.goodbyeMessage = message;
    }
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (err) {
    return false;
  }
}

export async function setAntiLink(groupJid, enabled) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.antilink = enabled;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (err) {
    return false;
  }
}

export async function setAntiSpam(groupJid, enabled) {
  try {
    const settings = groupSettings.get(groupJid) || {};
    settings.antispam = enabled;
    groupSettings.set(groupJid, settings);
    saveGroupSettings();
    return true;
  } catch (err) {
    return false;
  }
}

export function getGroupSettings(groupJid) {
  return groupSettings.get(groupJid) || {};
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  handleGroupParticipant,
  handleAntiLink,
  checkMessageViolation,
  handleRuleViolation,
  setWelcome,
  setGoodbye,
  setAntiLink,
  setAntiSpam,
  getGroupSettings
};
