import { ENV, deletedMessages } from "../index.js";

export async function handleAntiDelete(messageUpdate, sock) {
  try {
    if (!ENV.ANTI_DELETE_ENABLED) return;

    const { key, update } = messageUpdate;

    if (update?.messageStubType === 0) {
      const chatJid = key.remoteJid;
      const senderJid = key.participant || key.remoteJid;
      const isGroup = chatJid.endsWith("@g.us");

      const deletedData = deletedMessages.get(key.id);
      const timestamp = new Date().toLocaleString();
      const sender = senderJid.split("@")[0];

      let report = `╔══════════════════════════╗
║   🗑️ *MESSAGE DELETED*   ║
╚══════════════════════════╝\n\n`;

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
          report += `\n📝 *Deleted Text:*\n\`\`\`${deletedData}\`\`\`\n`;
        } else if (deletedData.type) {
          report += `\n📎 *Deleted Media:* ${deletedData.type}\n`;
          if (deletedData.caption)
            report += `📝 *Caption:* ${deletedData.caption}\n`;
        }
      } else {
        report += `\n⚠️ *Note:* Message content expired from cache.\n`;
      }

      report += `\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *AYOBOT Anti-Delete* | 👑 AYOCODES`;

      const adminJids = [
        `${ENV.ADMIN}@s.whatsapp.net`,
        `${ENV.CO_DEVELOPER}@s.whatsapp.net`,
      ];

      for (const adminJid of adminJids) {
        try {
          await sock.sendMessage(adminJid, {
            text: report,
            mentions: [senderJid],
          });
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error("Anti-delete error:", error);
  }
}
