import axios from "axios";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";
import QRCode from "qrcode";

export async function qr({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "QR CODE",
        "Usage: .qr <text or URL>\nExample: .qr https://github.com",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📱 *Generating QR code...*" });

  try {
    // Try online API first
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullArgs)}`;

    await sock.sendMessage(from, {
      image: { url: qrUrl },
      caption: `📱 *QR Code*\n📝 ${fullArgs}\n👑 AYOCODES`,
    });
  } catch {
    // Fallback to local QR generation
    try {
      const qrBuffer = await QRCode.toBuffer(fullArgs, { width: 500 });
      await sock.sendMessage(from, {
        image: qrBuffer,
        caption: `📱 *QR Code*\n📝 ${fullArgs}\n👑 AYOCODES`,
      });
    } catch {
      await sock.sendMessage(from, {
        text: formatError("ERROR", "Could not generate QR code."),
      });
    }
  }
}
