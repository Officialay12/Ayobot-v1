// handlers/antiDelete.js - AYOBOT v1 | Created by AYOCODES
import { ENV, deletedMessages, getBotOwner, groupSettings } from "../index.js";
import { formatInfo } from "../utils/formatters.js";

// ========== ANTI-DELETE HANDLER ==========
// FIX: Uses getBotOwner() instead of hardcoded ENV.ADMIN so the dynamic
// owner system works correctly. ENV.ADMIN may be undefined if not set in .env.
export async function handleAntiDelete(messageUpdate, sock) {
  try {
    if (!ENV.ANTI_DELETE_ENABLED) return;

    const { key, update } = messageUpdate;

    // messageStubType 0 = message deleted
    if (update?.messageStubType !== 0) return;

    const chatJid = key.remoteJid;
    if (!chatJid) return;

    const senderJid = key.participant || key.remoteJid;
    const isGroup = chatJid.endsWith("@g.us");
    const sender = senderJid.split("@")[0];

    // Check if anti-delete is disabled for this specific group
    if (isGroup) {
      const settings = groupSettings.get(chatJid) || {};
      if (settings.antidelete === false) return;
    }

    const deletedData = deletedMessages.get(key.id);
    const timestamp = new Date().toLocaleString();

    let report =
      `╔══════════════════════════╗\n` +
      `║   🗑️ *MESSAGE DELETED*   ║\n` +
      `╚══════════════════════════╝\n\n`;

    report += `📍 *Location:* ${isGroup ? "👥 Group" : "💬 Private"}\n`;
    report += `👤 *Sender:* @${sender}\n`;

    if (isGroup) {
      try {
        const groupMetadata = await sock.groupMetadata(chatJid);
        report += `📛 *Group:* ${groupMetadata.subject}\n`;
      } catch (e) {
        report += `📛 *Group:* ${chatJid.split("@")[0]}\n`;
      }
    }

    report += `⏰ *Time:* ${timestamp}\n`;

    if (deletedData) {
      if (typeof deletedData === "string") {
        const preview = deletedData.substring(0, 500);
        report += `\n📝 *Deleted Text:*\n\`\`\`${preview}${deletedData.length > 500 ? "..." : ""}\`\`\`\n`;
      } else if (deletedData.type) {
        report += `\n📎 *Deleted Media:* ${deletedData.type}\n`;
        if (deletedData.caption)
          report += `📝 *Caption:* ${deletedData.caption}\n`;
      }
    } else {
      report += `\n⚠️ *Note:* Message content expired from cache.\n`;
    }

    report +=
      `\n━━━━━━━━━━━━━━━━━━━━━\n` + `⚡ *AYOBOT Anti-Delete* | 👑 AYOCODES`;

    // FIX: Use dynamic bot owner from getBotOwner() instead of only ENV.ADMIN.
    // Build a deduplicated list of JIDs to notify.
    const owner = getBotOwner();
    const notifyJids = new Set();

    if (owner?.jid) notifyJids.add(owner.jid);
    if (owner?.phone) notifyJids.add(`${owner.phone}@s.whatsapp.net`);

    // Also notify ENV.ADMIN and ENV.CO_DEVELOPER if set (legacy support)
    if (ENV.ADMIN) notifyJids.add(`${ENV.ADMIN}@s.whatsapp.net`);
    if (ENV.CO_DEVELOPER && ENV.CO_DEVELOPER !== ENV.ADMIN)
      notifyJids.add(`${ENV.CO_DEVELOPER}@s.whatsapp.net`);

    for (const jid of notifyJids) {
      try {
        await sock.sendMessage(jid, {
          text: report,
          mentions: [senderJid],
        });
      } catch (e) {
        // Silently skip — recipient may not exist or be reachable
      }
    }
  } catch (error) {
    // Only log non-trivial errors
    if (!error.message?.includes("Bad MAC")) {
      console.error("Anti-delete error:", error.message);
    }
  }
}
