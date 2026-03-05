import crypto from "crypto";
import { ENV } from "../index.js";
import {
  formatSuccess,
  formatError,
  formatInfo,
  formatData,
} from "../utils/formatters.js";

// ========== ENCRYPT TEXT ==========
export async function encrypt({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "ENCRYPT",
        "Usage: .encrypt <text>\nExample: .encrypt My secret message",
      ),
    });
    return;
  }

  try {
    const key = crypto
      .createHash("sha256")
      .update(ENV.BOT_NAME + "secret")
      .digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(fullArgs, "utf8", "hex");
    encrypted += cipher.final("hex");

    const result = iv.toString("hex") + ":" + encrypted;

    await sock.sendMessage(from, {
      text: formatSuccess(
        "ENCRYPTED",
        `🔐 *Encrypted:*\n||${result}||\n\n📝 *Keep this safe!*\nUse .decrypt to recover.`,
      ),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not encrypt text."),
    });
  }
}

// ========== DECRYPT TEXT ==========
export async function decrypt({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "DECRYPT",
        "Usage: .decrypt <encrypted_text>\nExample: .decrypt iv:encrypteddata",
      ),
    });
    return;
  }

  try {
    const [ivHex, encrypted] = fullArgs.split(":");
    if (!ivHex || !encrypted) throw new Error("Invalid format");

    const key = crypto
      .createHash("sha256")
      .update(ENV.BOT_NAME + "secret")
      .digest();
    const iv = Buffer.from(ivHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    await sock.sendMessage(from, {
      text: formatSuccess("DECRYPTED", `📝 *Original Text:*\n${decrypted}`),
    });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("ERROR", "Could not decrypt. Invalid format or key."),
    });
  }
}

// ========== HASH TEXT ==========
export async function hash({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "HASH",
        "Usage: .hash <text>\nExample: .hash Hello World",
      ),
    });
    return;
  }

  const hashData = {
    "📝 MD5": crypto.createHash("md5").update(fullArgs).digest("hex"),
    "🔐 SHA-1": crypto.createHash("sha1").update(fullArgs).digest("hex"),
    "🔒 SHA-256": crypto.createHash("sha256").update(fullArgs).digest("hex"),
    "🔑 SHA-512": crypto.createHash("sha512").update(fullArgs).digest("hex"),
  };

  await sock.sendMessage(from, {
    text: formatData("CRYPTOGRAPHIC HASHES", hashData),
  });
}

// ========== PASSWORD GENERATOR ==========
export async function password({ args, from, sock }) {
  let length = 12;
  let includeSymbols = true;

  if (args.length > 0) {
    const num = parseInt(args[0]);
    if (!isNaN(num) && num >= 4 && num <= 50) length = num;
  }

  if (args.includes("nosymbols")) includeSymbols = false;

  const chars = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  };

  let allowed = chars.uppercase + chars.lowercase + chars.numbers;
  if (includeSymbols) allowed += chars.symbols;

  let password = "";
  for (let i = 0; i < length; i++) {
    password += allowed[Math.floor(Math.random() * allowed.length)];
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  let strength = "Weak";
  const complexity = [hasUpper, hasLower, hasNumber, hasSymbol].filter(
    Boolean,
  ).length;
  if (length >= 12 && complexity >= 3) strength = "Strong";
  else if (length >= 8 && complexity >= 2) strength = "Medium";

  const passwordData = {
    "🔑 Password": `||${password}||`,
    "📏 Length": length,
    "⚡ Strength": strength,
    "⬆️ Uppercase": hasUpper ? "✓" : "✗",
    "⬇️ Lowercase": hasLower ? "✓" : "✗",
    "🔢 Numbers": hasNumber ? "✓" : "✗",
    "🔣 Symbols": hasSymbol ? "✓" : "✗",
  };

  await sock.sendMessage(from, {
    text:
      formatData("GENERATED PASSWORD", passwordData) + "\n\n⚠️ *Tap to reveal*",
  });
}
