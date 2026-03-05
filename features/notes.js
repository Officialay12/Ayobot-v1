import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

// Global storage
global.userData = global.userData || new Map();

// ========== SAVE DATA ==========
export async function save({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "SAVE",
        "Usage: .save <key> <value>\nExample: .save mynote Hello World",
      ),
    });
    return;
  }

  const parts = fullArgs.split(" ");
  const key = parts[0];
  const value = parts.slice(1).join(" ") || "true";

  if (!global.userData.has(userJid)) global.userData.set(userJid, {});

  const userData = global.userData.get(userJid);
  userData[key] = value;

  await sock.sendMessage(from, {
    text: formatSuccess("DATA SAVED", `📌 *Key:* ${key}\n📝 *Value:* ${value}`),
  });
}

// ========== GET DATA ==========
export async function get({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo("GET", "Usage: .get <key>\nExample: .get mynote"),
    });
    return;
  }

  if (!global.userData?.has(userJid)) {
    return await sock.sendMessage(from, {
      text: formatError("NOT FOUND", "No saved data found."),
    });
  }

  const userData = global.userData.get(userJid);
  const value = userData[fullArgs];

  if (!value) {
    return await sock.sendMessage(from, {
      text: formatError("NOT FOUND", `Key "${fullArgs}" not found.`),
    });
  }

  await sock.sendMessage(from, {
    text: formatSuccess(
      "RETRIEVED DATA",
      `📌 *Key:* ${fullArgs}\n📝 *Value:* ${value}`,
    ),
  });
}

// ========== LIST DATA ==========
export async function list({ from, userJid, sock, isAdmin }) {
  if (!global.userData?.has(userJid)) {
    return await sock.sendMessage(from, {
      text: formatInfo("NO DATA", "You have no saved data."),
    });
  }

  const userData = global.userData.get(userJid);
  const keys = Object.keys(userData);

  if (keys.length === 0) {
    return await sock.sendMessage(from, {
      text: formatInfo("NO DATA", "You have no saved data."),
    });
  }

  let listText = `╔══════════════════════════╗
║     📋 *SAVED DATA*      ║
╚══════════════════════════╝\n\n`;

  keys.forEach((key, i) => {
    listText += `${i + 1}. *${key}*: ${userData[key].substring(0, 50)}${userData[key].length > 50 ? "..." : ""}\n`;
  });

  listText += `\n━━━━━━━━━━━━━━━━━━━━━\n📊 *Total:* ${keys.length} items\n⚡ *AYOBOT v1* | 👑 AYOCODES`;

  await sock.sendMessage(from, { text: listText });
}

// ========== DELETE KEY ==========
export async function deleteKey({ fullArgs, from, userJid, sock, isAdmin }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "DELETE",
        "Usage: .delkey <key>\nExample: .delkey mynote",
      ),
    });
    return;
  }

  if (!global.userData?.has(userJid)) {
    return await sock.sendMessage(from, {
      text: formatError("NOT FOUND", "No saved data found."),
    });
  }

  const userData = global.userData.get(userJid);
  if (!userData[fullArgs]) {
    return await sock.sendMessage(from, {
      text: formatError("NOT FOUND", `Key "${fullArgs}" not found.`),
    });
  }

  delete userData[fullArgs];

  await sock.sendMessage(from, {
    text: formatSuccess(
      "DATA DELETED",
      `📌 Key "${fullArgs}" has been removed.`,
    ),
  });
}

// ========== CLEAR ALL DATA ==========
export async function clearAll({ from, userJid, sock, isAdmin }) {
  if (!global.userData?.has(userJid)) {
    return await sock.sendMessage(from, {
      text: formatInfo("NO DATA", "You have no saved data to clear."),
    });
  }

  const count = Object.keys(global.userData.get(userJid)).length;
  global.userData.delete(userJid);

  await sock.sendMessage(from, {
    text: formatSuccess("DATA CLEARED", `🗑️ Removed ${count} saved items.`),
  });
}
