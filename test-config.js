import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode-terminal";
import pino from "pino";
import { Boom } from "@hapi/boom";

async function connect() {
  console.log("🚀 Testing with working configuration...");

  // Delete old session
  const fs = await import("fs");
  if (fs.existsSync("auth_info_working")) {
    fs.rmSync("auth_info_working", { recursive: true, force: true });
    console.log("✅ Deleted old session");
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth_info_working");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "error" }),
    browser: ["Windows", "Chrome", "120.0.0"], // Different fingerprint
    syncFullHistory: false,
    version: [2, 2412, 1], // Try older version
  });
  let qrShown = true;

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && !qrShown) {
      qrShown = true;
      console.log("\n" + "=".repeat(50));
      console.log("📱 SCAN THIS QR CODE");
      console.log("=".repeat(50));
      console.log(`⏰ ${new Date().toLocaleTimeString()}\n`);

      // QR will be printed automatically by printQRInTerminal: true
      console.log("⏳ Waiting for scan...\n");
    }

    if (connection === "open") {
      console.log("\n✅✅✅ CONNECTED! ✅✅✅\n");
      console.log(`📱 Logged in as: ${sock.user?.id}`);
      process.exit(0);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const error = lastDisconnect?.error?.message || "Unknown error";

      console.log(
        `\n❌ Connection closed - Code: ${statusCode}, Error: ${error}`,
      );

      // Check if logged out
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Logged out, clearing session...");
        fs.rmSync("auth_info_working", { recursive: true, force: true });
        process.exit(1);
      }

      // Try reconnecting with different parameters
      console.log("🔄 Will retry with different settings...");
      setTimeout(() => {
        connect();
      }, 5000);
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Set a timeout
  setTimeout(() => {
    console.log(
      "\n⏰ Still waiting for QR... Make sure you're using the correct WhatsApp version",
    );
  }, 30000);
}

connect().catch(console.error);
