// commands/group/core.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Group Core Commands - CLEAN WORKING VERSION
//  Author: AYOCODES
//
//  COMMANDS:
//  • kick - Remove member from group
//  • add - Add member to group
//  • promote - Make someone admin
//  • demote - Remove admin
//  • tagall - Tag all members
//  • hidetag - Silently tag all members
//  • admins - List all admins
//  • link - Get group invite link
// ════════════════════════════════════════════════════════════════════════════

import { isBotGroupAdminCached, getGroupMetadataCached, normalizeNum } from '../../utils/validators.js';
import { formatError, formatSuccess, formatInfo } from '../../utils/formatters.js';

// Helper to format numbers
function phone(jid) {
  return jid?.split('@')[0] || '';
}

// Helper to check if user is admin
async function isUserAdmin(sock, groupJid, userJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    return metadata.participants.some(
      p => p.id === userJid && (p.admin === 'admin' || p.admin === 'superadmin')
    );
  } catch {
    return false;
  }
}

// ============================================================================
//  KICK MEMBER
// ============================================================================
export async function kick({ args, message, from, userJid, sock }) {
  try {
    // Check if in group
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    // Check if user is admin
    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    // Check if bot is admin
    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: '❌ I need to be a *group admin* to kick members.\nPlease promote me first!'
      });
    }

    // Get target user from reply or mention
    let targetJid = null;

    // Check if replying to a message
    const quoted = message.message?.extendedTextMessage?.contextInfo;
    if (quoted?.participant) {
      targetJid = quoted.participant;
    }

    // Check if mentioned
    if (!targetJid && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    // Check if provided as argument
    if (!targetJid && args.length > 0) {
      const phone = args[0].replace(/[^0-9]/g, '');
      if (phone && phone.length >= 10) {
        targetJid = `${phone}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo('KICK',
          '📌 *Usage:* .kick @user\n' +
          '📌 Or reply to a user\'s message with .kick\n\n' +
          'Example: .kick @1234567890'
        )
      });
    }

    // Cannot kick self
    if (targetJid === userJid) {
      return sock.sendMessage(from, {
        text: '❌ You cannot kick yourself.'
      });
    }

    // Cannot kick bot
    if (targetJid === sock.user?.id) {
      return sock.sendMessage(from, {
        text: '❌ You cannot kick me!'
      });
    }

    // Perform kick
    await sock.groupParticipantsUpdate(from, [targetJid], 'remove');

    await sock.sendMessage(from, {
      text: `✅ *User kicked*\n👤 @${phone(targetJid)}\n👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid]
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('KICK FAILED', error.message)
    });
  }
}

// ============================================================================
//  ADD MEMBER
// ============================================================================
export async function add({ args, from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    if (!args.length) {
      return sock.sendMessage(from, {
        text: formatInfo('ADD',
          '📌 *Usage:* .add <phone>\n' +
          'Example: .add 2348123456789'
        )
      });
    }

    const phone = args[0].replace(/[^0-9]/g, '');
    if (!phone || phone.length < 10) {
      return sock.sendMessage(from, {
        text: '❌ Please provide a valid phone number.'
      });
    }

    const targetJid = `${phone}@s.whatsapp.net`;

    await sock.groupParticipantsUpdate(from, [targetJid], 'add');

    await sock.sendMessage(from, {
      text: `✅ *User added*\n👤 @${phone}\n👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid]
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('ADD FAILED', error.message)
    });
  }
}

// ============================================================================
//  PROMOTE TO ADMIN
// ============================================================================
export async function promote({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: '❌ I need to be a *group admin* to promote members.\nPlease promote me first!'
      });
    }

    // Get target user
    let targetJid = null;

    const quoted = message.message?.extendedTextMessage?.contextInfo;
    if (quoted?.participant) {
      targetJid = quoted.participant;
    }

    if (!targetJid && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    if (!targetJid && args.length > 0) {
      const phone = args[0].replace(/[^0-9]/g, '');
      if (phone && phone.length >= 10) {
        targetJid = `${phone}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo('PROMOTE',
          '📌 *Usage:* .promote @user\n' +
          '📌 Or reply to a user\'s message with .promote'
        )
      });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], 'promote');

    await sock.sendMessage(from, {
      text: `⭐ *User promoted to admin*\n👤 @${phone(targetJid)}\n👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid]
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('PROMOTE FAILED', error.message)
    });
  }
}

// ============================================================================
//  DEMOTE FROM ADMIN
// ============================================================================
export async function demote({ args, message, from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (!botAdmin) {
      return sock.sendMessage(from, {
        text: '❌ I need to be a *group admin* to demote members.\nPlease promote me first!'
      });
    }

    // Get target user
    let targetJid = null;

    const quoted = message.message?.extendedTextMessage?.contextInfo;
    if (quoted?.participant) {
      targetJid = quoted.participant;
    }

    if (!targetJid && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    if (!targetJid && args.length > 0) {
      const phone = args[0].replace(/[^0-9]/g, '');
      if (phone && phone.length >= 10) {
        targetJid = `${phone}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      return sock.sendMessage(from, {
        text: formatInfo('DEMOTE',
          '📌 *Usage:* .demote @user\n' +
          '📌 Or reply to a user\'s message with .demote'
        )
      });
    }

    await sock.groupParticipantsUpdate(from, [targetJid], 'demote');

    await sock.sendMessage(from, {
      text: `⬇️ *User demoted from admin*\n👤 @${phone(targetJid)}\n👑 By: @${phone(userJid)}`,
      mentions: [targetJid, userJid]
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('DEMOTE FAILED', error.message)
    });
  }
}

// ============================================================================
//  LIST ADMINS
// ============================================================================
export async function admins({ from, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: '❌ Could not fetch group info.'
      });
    }

    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

    if (admins.length === 0) {
      return sock.sendMessage(from, {
        text: '👑 *No admins found* (this is unusual)'
      });
    }

    let text = `╔══════════════════════════╗\n`;
    text += `║   👑 *GROUP ADMINS*      ║\n`;
    text += `╚══════════════════════════╝\n\n`;

    admins.forEach((admin, i) => {
      const role = admin.admin === 'superadmin' ? '👑 Owner' : '⭐ Admin';
      text += `${i + 1}. @${phone(admin.id)} - ${role}\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👥 *Total:* ${admins.length} admins\n`;
    text += `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text: text,
      mentions: admins.map(a => a.id)
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('ERROR', error.message)
    });
  }
}

// ============================================================================
//  TAG ALL MEMBERS
// ============================================================================
export async function tagall({ args, fullArgs, message, from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: '❌ Could not fetch group members.'
      });
    }

    const participants = metadata.participants;
    let mentions = [];
    let mentionText = '';

    const sub = args[0]?.toLowerCase();

    if (sub === 'admins') {
      mentions = participants.filter(p => p.admin).map(p => p.id);
      mentionText = `👑 *Admins tagged:* ${mentions.length}`;
    } else if (sub === 'members') {
      mentions = participants.filter(p => !p.admin).map(p => p.id);
      mentionText = `👥 *Members tagged:* ${mentions.length}`;
    } else {
      mentions = participants.map(p => p.id);
      mentionText = `👥 *Everyone tagged:* ${mentions.length}`;
    }

    if (mentions.length === 0) {
      return sock.sendMessage(from, {
        text: '❌ No matching members found.'
      });
    }

    const messageText = sub ? args.slice(1).join(' ') : fullArgs;

    // Handle quoted message
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
      key: {
        remoteJid: from,
        fromMe: false,
        id: message.message.extendedTextMessage.contextInfo.stanzaId,
        participant: message.message.extendedTextMessage.contextInfo.participant
      },
      message: message.message.extendedTextMessage.contextInfo.quotedMessage
    } : null;

    if (quotedMsg) {
      try {
        await sock.sendMessage(from, { forward: quotedMsg, mentions });
      } catch (e) {}
    }

    const output =
      `📢 *Announcement*\n\n${messageText ? messageText + '\n\n' : ''}` +
      `${mentionText}\n` +
      `📣 By: @${phone(userJid)}\n` +
      `⚡ _AYOBOT v1_ | 👑 _AYOCODES_`;

    await sock.sendMessage(from, {
      text: output,
      mentions
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('ERROR', 'Could not tag members.')
    });
  }
}

// ============================================================================
//  HIDE TAG (silent tag all)
// ============================================================================
export async function hidetag({ fullArgs, message, from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    const metadata = await getGroupMetadataCached(from, sock);
    if (!metadata) {
      return sock.sendMessage(from, {
        text: '❌ Could not fetch group members.'
      });
    }

    const mentions = metadata.participants.map(p => p.id);

    // Handle quoted message
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ? {
      key: {
        remoteJid: from,
        fromMe: false,
        id: message.message.extendedTextMessage.contextInfo.stanzaId,
        participant: message.message.extendedTextMessage.contextInfo.participant
      },
      message: message.message.extendedTextMessage.contextInfo.quotedMessage
    } : null;

    if (quotedMsg) {
      try {
        await sock.sendMessage(from, { forward: quotedMsg, mentions });
      } catch (e) {}
    }

    await sock.sendMessage(from, {
      text: fullArgs || '​', // Zero-width space if no text
      mentions
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('ERROR', 'Could not send hidden tag.')
    });
  }
}

// ============================================================================
//  GET GROUP LINK
// ============================================================================
export async function link({ from, userJid, sock }) {
  try {
    if (!from.endsWith('@g.us')) {
      return sock.sendMessage(from, {
        text: '❌ This command only works in groups.'
      });
    }

    const isAdmin = await isUserAdmin(sock, from, userJid);
    if (!isAdmin) {
      return sock.sendMessage(from, {
        text: '⛔ Only group admins can use this command.'
      });
    }

    let inviteCode = null;

    // Try to get fresh link if bot is admin
    const botAdmin = await isBotGroupAdminCached(from, sock);
    if (botAdmin) {
      try {
        const code = await sock.groupInviteCode(from);
        if (code) inviteCode = `https://chat.whatsapp.com/${code}`;
      } catch (e) {}
    }

    // Fallback to cached metadata
    if (!inviteCode) {
      const metadata = await getGroupMetadataCached(from, sock);
      if (metadata?.inviteCode) {
        inviteCode = `https://chat.whatsapp.com/${metadata.inviteCode}`;
      }
    }

    if (!inviteCode) {
      return sock.sendMessage(from, {
        text: '❌ Could not get group link.\nMake sure I am an admin.'
      });
    }

    await sock.sendMessage(from, {
      text: `🔗 *Group Link*\n\n${inviteCode}\n\n📣 By: @${phone(userJid)}`,
      mentions: [userJid]
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError('ERROR', 'Could not get group link.')
    });
  }
}

// ============================================================================
//  DEFAULT EXPORT
// ============================================================================
export default {
  kick,
  add,
  promote,
  demote,
  admins,
  tagall,
  hidetag,
  link
};
