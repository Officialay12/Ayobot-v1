// handlers/welcome.js - Complete Group Welcome Handler
import { ENV, groupSettings, groupMetadataCache } from "../index.js";
import { getGroupMetadataCached } from "../utils/validators.js";

// ========== GROUP PARTICIPANT HANDLER ==========
export async function handleGroupParticipant(update, sock) {
  const { id, participants, action } = update;

  for (const participant of participants) {
    try {
      if (action === "add") {
        await handleGroupJoin(id, participant, sock);
      } else if (action === "remove") {
        await handleGroupLeave(id, participant, sock);
      }
    } catch (error) {
      console.error("❌ Participant update error:", error);
    }
  }
}

// ========== HANDLE GROUP JOIN ==========
async function handleGroupJoin(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};
    if (!settings.welcome) return;

    const metadata = await getGroupMetadataCached(groupId, sock);
    if (!metadata) return;

    const groupName = metadata.subject;
    const participant = participantJid.split("@")[0];
    const memberCount = metadata.participants.length;

    let welcomeMsg =
      settings.welcomeMessage || "Welcome @user to the group! 🎉";
    welcomeMsg = welcomeMsg
      .replace(/@user/g, `@${participant}`)
      .replace(/@group/g, groupName)
      .replace(/@count/g, memberCount.toString());

    // Try to send with image first
    try {
      await sock.sendMessage(groupId, {
        image: { url: ENV.WELCOME_IMAGE_URL },
        caption: `╔══════════════════════════╗
║   🎉 *NEW MEMBER* 🎉     ║
╚══════════════════════════╝

${welcomeMsg}

━━━━━━━━━━━━━━━━━━━━━━
👥 *Total Members:* ${memberCount}
📝 *Type .menu for bot commands*
━━━━━━━━━━━━━━━━━━━━━━

*Welcome to the family!* 🌟`,
        mentions: [participantJid],
        contextInfo: {
          forwardedNewsletterMessageInfo: {
            newsletterJid: "0029Vb78B9VDzgTDPktNpn25@newsletter",
            newsletterName: "AyoBot Tech Hub",
          },
          externalAdReply: {
            title: `${ENV.BOT_NAME || "AyoBot"} Group`,
            body: `Welcome ${participant}!`,
            thumbnail: { url: ENV.WELCOME_IMAGE_URL },
            mediaType: 1,
            renderLargerThumbnail: false,
          },
        },
      });
      console.log(`✅ Welcome image sent to @${participant} in ${groupName}`);
    } catch (imgError) {
      // Fallback to text only
      await sock.sendMessage(groupId, {
        text: `╔══════════════════════════╗
║   🎉 *NEW MEMBER* 🎉     ║
╚══════════════════════════╝

👋 ${welcomeMsg}

━━━━━━━━━━━━━━━━━━━━━━
👥 *Total Members:* ${memberCount}
📝 *Type .menu for bot commands*
━━━━━━━━━━━━━━━━━━━━━━

*Welcome to the family!* 🌟`,
        mentions: [participantJid],
      });
      console.log(`✅ Welcome text sent to @${participant} in ${groupName}`);
    }

    // Try to send welcome audio
    try {
      if (ENV.WELCOME_AUDIO_URL) {
        await sock.sendMessage(groupId, {
          audio: { url: ENV.WELCOME_AUDIO_URL },
          mimetype: "audio/mpeg",
          ptt: true, // Send as voice note
          contextInfo: {
            mentionedJid: [participantJid],
          },
        });
      }
    } catch (audioError) {
      // Audio failed, ignore
    }
  } catch (error) {
    console.error("❌ Welcome error:", error);
  }
}

// ========== HANDLE GROUP LEAVE ==========
async function handleGroupLeave(groupId, participantJid, sock) {
  try {
    const settings = groupSettings.get(groupId) || {};
    if (!settings.goodbye) return;

    const metadata = await getGroupMetadataCached(groupId, sock);
    if (!metadata) return;

    const groupName = metadata.subject;
    const participant = participantJid.split("@")[0];
    const memberCount = metadata.participants.length;

    let goodbyeMsg = settings.goodbyeMessage || "Goodbye @user 👋";
    goodbyeMsg = goodbyeMsg
      .replace(/@user/g, `@${participant}`)
      .replace(/@group/g, groupName)
      .replace(/@count/g, memberCount.toString());

    await sock.sendMessage(groupId, {
      text: `╔══════════════════════════╗
║   👋 *MEMBER LEFT*      ║
╚══════════════════════════╝

😢 ${goodbyeMsg}

━━━━━━━━━━━━━━━━━━━━━━
👥 *Remaining Members:* ${memberCount}
━━━━━━━━━━━━━━━━━━━━━━

*We'll miss you!* 💫`,
      mentions: [participantJid],
    });

    console.log(`👋 Goodbye sent for @${participant} in ${groupName}`);
  } catch (error) {
    console.error("❌ Goodbye error:", error);
  }
}

// ========== WELCOME SETTINGS MANAGER ==========
export async function setWelcomeSettings(groupId, sock, settings) {
  try {
    if (!groupSettings.has(groupId)) {
      groupSettings.set(groupId, {});
    }

    const currentSettings = groupSettings.get(groupId);
    groupSettings.set(groupId, {
      ...currentSettings,
      ...settings,
    });

    // Save to file
    try {
      fs.writeFileSync(
        "./group-settings.json",
        JSON.stringify(Object.fromEntries(groupSettings), null, 2),
      );
    } catch (e) {
      console.error("Failed to save group settings:", e);
    }

    return true;
  } catch (error) {
    console.error("❌ Error setting welcome settings:", error);
    return false;
  }
}

// ========== GET WELCOME SETTINGS ==========
export function getWelcomeSettings(groupId) {
  return (
    groupSettings.get(groupId) || {
      welcome: true,
      goodbye: true,
      welcomeMessage: "Welcome @user to the group! 🎉",
      goodbyeMessage: "Goodbye @user 👋",
    }
  );
}

// ========== TOGGLE WELCOME ==========
export async function toggleWelcome(groupId, sock, enabled) {
  return setWelcomeSettings(groupId, sock, { welcome: enabled });
}

// ========== TOGGLE GOODBYE ==========
export async function toggleGoodbye(groupId, sock, enabled) {
  return setWelcomeSettings(groupId, sock, { goodbye: enabled });
}

// ========== SET CUSTOM WELCOME MESSAGE ==========
export async function setWelcomeMessage(groupId, sock, message) {
  return setWelcomeSettings(groupId, sock, { welcomeMessage: message });
}

// ========== SET CUSTOM GOODBYE MESSAGE ==========
export async function setGoodbyeMessage(groupId, sock, message) {
  return setWelcomeSettings(groupId, sock, { goodbyeMessage: message });
}

// ========== TEST WELCOME MESSAGE ==========
export async function testWelcome(groupId, sock, adminJid) {
  try {
    await handleGroupJoin(groupId, adminJid, sock);
    return true;
  } catch (error) {
    console.error("❌ Test welcome error:", error);
    return false;
  }
}

// ========== TEST GOODBYE MESSAGE ==========
export async function testGoodbye(groupId, sock, adminJid) {
  try {
    await handleGroupLeave(groupId, adminJid, sock);
    return true;
  } catch (error) {
    console.error("❌ Test goodbye error:", error);
    return false;
  }
}

// ========== DEFAULT EXPORT ==========
export default {
  handleGroupParticipant,
  handleGroupJoin,
  handleGroupLeave,
  setWelcomeSettings,
  getWelcomeSettings,
  toggleWelcome,
  toggleGoodbye,
  setWelcomeMessage,
  setGoodbyeMessage,
  testWelcome,
  testGoodbye,
};
