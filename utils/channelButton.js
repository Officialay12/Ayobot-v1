// utils/channelButton.js — AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Thin wrapper around sock.sendMessage used by downloader.js.
//  Previously missing from the codebase, causing a crash on import.
// ════════════════════════════════════════════════════════════════════════════

export async function sendMsg(sock, jid, content, options = {}) {
  try {
    if (!sock || !jid) return null;

    // Normalise content into a Baileys-compatible payload
    let payload;
    if (typeof content === "string") {
      payload = { text: content };
    } else if (Buffer.isBuffer(content)) {
      payload = { document: content };
    } else {
      payload = { ...content };
    }

    return await sock.sendMessage(jid, { ...payload, ...options });
  } catch (err) {
    console.error(`[channelButton] sendMsg error to ${jid}: ${err.message}`);
    return null;
  }
}

export default { sendMsg };
