import axios from "axios";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

export async function scan({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "SECURITY SCAN",
        "🛡️ *Scan URL for threats*\n\nUsage: .scan <url>\nExample: .scan https://example.com",
      ),
    });
    return;
  }

  let url = fullArgs;
  if (!url.startsWith("http")) url = "https://" + url;

  await sock.sendMessage(from, { text: "🛡️ *Scanning URL for threats...*" });

  try {
    // Using VirusTotal API (free tier)
    const response = await axios.post(
      "https://www.virustotal.com/api/v3/urls",
      new URLSearchParams({ url: url }),
      {
        headers: {
          "x-apikey": "YOUR_VIRUSTOTAL_API_KEY",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const scanId = response.data.data.id;

    // Wait a bit for scan to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const reportRes = await axios.get(
      `https://www.virustotal.com/api/v3/analyses/${scanId}`,
      {
        headers: { "x-apikey": "YOUR_VIRUSTOTAL_API_KEY" },
      },
    );

    const stats = reportRes.data.data.attributes.stats;
    const total =
      stats.malicious + stats.suspicious + stats.harmless + stats.undetected;
    const safe = stats.harmless + stats.undetected;
    const safePercent = Math.round((safe / total) * 100);

    let verdict = "✅ SAFE";
    let color = "🟢";

    if (stats.malicious > 0) {
      verdict = "❌ MALICIOUS";
      color = "🔴";
    } else if (stats.suspicious > 0) {
      verdict = "⚠️ SUSPICIOUS";
      color = "🟡";
    }

    const scanResult = `╔══════════════════════════╗
║     🛡️ *SCAN RESULT*     ║
╚══════════════════════════╝

🔗 *URL:* ${url}
${color} *Verdict:* ${verdict}

━━━━━━━━━━━━━━━━━━━━━
📊 *Statistics:*
• Malicious: ${stats.malicious}
• Suspicious: ${stats.suspicious}
• Harmless: ${stats.harmless}
• Undetected: ${stats.undetected}
━━━━━━━━━━━━━━━━━━━━━
✅ Safe: ${safePercent}%

⚡ *AYOBOT Security* | 👑 AYOCODES`;

    await sock.sendMessage(from, { text: scanResult });
  } catch (error) {
    // Fallback to Google Safe Browsing
    try {
      const apiKey = "YOUR_GOOGLE_SAFE_BROWSING_API_KEY";
      const response = await axios.post(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
        {
          client: { clientId: "AYOBOT", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url: url }],
          },
        },
      );

      if (response.data.matches?.length > 0) {
        await sock.sendMessage(from, {
          text: formatError(
            "❌ UNSAFE",
            `URL flagged as: ${response.data.matches[0].threatType}`,
          ),
        });
      } else {
        await sock.sendMessage(from, {
          text: formatSuccess(
            "✅ SAFE",
            "No threats detected by Google Safe Browsing.",
          ),
        });
      }
    } catch {
      await sock.sendMessage(from, {
        text: formatError(
          "ERROR",
          "Could not scan URL. Security services unavailable.",
        ),
      });
    }
  }
}
