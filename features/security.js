import axios from "axios";
import { ENV } from "../index.js";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function safePercent(stats) {
  const total =
    stats.malicious + stats.suspicious + stats.harmless + stats.undetected;
  if (!total) return 0;
  return Math.round(((stats.harmless + stats.undetected) / total) * 100);
}

function getVerdict(stats) {
  if (stats.malicious > 0)
    return { icon: "🔴", label: "MALICIOUS", emoji: "❌" };
  if (stats.suspicious > 0)
    return { icon: "🟡", label: "SUSPICIOUS", emoji: "⚠️" };
  return { icon: "🟢", label: "CLEAN", emoji: "✅" };
}

function buildVTMessage(url, stats) {
  const verdict = getVerdict(stats);
  const pct = safePercent(stats);
  const total =
    stats.malicious + stats.suspicious + stats.harmless + stats.undetected;

  return (
    `🛡️ *SECURITY SCAN RESULT*\n` +
    `${"─".repeat(30)}\n\n` +
    `🔗 *URL:*\n${url}\n\n` +
    `${verdict.emoji} *Verdict: ${verdict.label}*\n\n` +
    `📊 *Scanner Results (${total} engines):*\n` +
    `  ${stats.malicious > 0 ? "🔴" : "⚪"} Malicious:   ${stats.malicious}\n` +
    `  ${stats.suspicious > 0 ? "🟡" : "⚪"} Suspicious:  ${stats.suspicious}\n` +
    `  🟢 Harmless:    ${stats.harmless}\n` +
    `  ⚫ Undetected:  ${stats.undetected}\n\n` +
    `${"─".repeat(30)}\n` +
    `✅ Safety score: *${pct}%*\n` +
    `⚡ AYOBOT Security • AYOCODES 👑`
  );
}

// ── VirusTotal scanner ────────────────────────────────────────────────────

async function scanWithVirusTotal(url) {
  const apiKey = ENV.VIRUSTOTAL_KEY;
  if (!apiKey) throw new Error("VIRUSTOTAL_KEY not set in .env");

  // Step 1 — submit URL for scanning
  const submitRes = await axios.post(
    "https://www.virustotal.com/api/v3/urls",
    new URLSearchParams({ url }),
    {
      headers: {
        "x-apikey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    },
  );

  const analysisId = submitRes.data?.data?.id;
  if (!analysisId) throw new Error("No analysis ID returned from VirusTotal");

  // Step 2 — poll until scan completes (max 30s)
  const MAX_POLLS = 6;
  const POLL_DELAY = 5000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_DELAY));

    const reportRes = await axios.get(
      `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
      {
        headers: { "x-apikey": apiKey },
        timeout: 10000,
      },
    );

    const attrs = reportRes.data?.data?.attributes;
    const status = attrs?.status;

    if (status === "completed") {
      return attrs.stats;
    }

    // Still queued or running — keep polling
    if (status !== "queued" && status !== "in-progress") {
      throw new Error(`Unexpected VT status: ${status}`);
    }
  }

  throw new Error("VirusTotal scan timed out after 30 seconds");
}

// ── Google Safe Browsing scanner ──────────────────────────────────────────

async function scanWithGoogleSafeBrowsing(url) {
  const apiKey = ENV.GOOGLE_SAFE_BROWSING_KEY;
  if (!apiKey) throw new Error("GOOGLE_SAFE_BROWSING_KEY not set in .env");

  const res = await axios.post(
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
        threatEntries: [{ url }],
      },
    },
    { timeout: 8000 },
  );

  return res.data?.matches || [];
}

// ── URLScan.io scanner (free, no key required for basic use) ──────────────

async function scanWithURLScan(url) {
  // Submit scan
  const headers = { "Content-Type": "application/json" };
  if (ENV.URLSCAN_KEY) headers["API-Key"] = ENV.URLSCAN_KEY;

  const submitRes = await axios.post(
    "https://urlscan.io/api/v1/scan/",
    { url, visibility: "public" },
    { headers, timeout: 10000 },
  );

  const uuid = submitRes.data?.uuid;
  if (!uuid) throw new Error("No UUID from URLScan");

  // Poll for result (max 30s)
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const resultRes = await axios.get(
        `https://urlscan.io/api/v1/result/${uuid}/`,
        { timeout: 8000 },
      );
      const verdict = resultRes.data?.verdicts?.overall;
      return {
        malicious: verdict?.malicious ? 1 : 0,
        score: verdict?.score || 0,
        tags: verdict?.tags || [],
        link: `https://urlscan.io/result/${uuid}/`,
      };
    } catch (e) {
      // 404 = not ready yet, keep polling
      if (e.response?.status !== 404) throw e;
    }
  }

  throw new Error("URLScan timed out");
}

// ── Main handler ──────────────────────────────────────────────────────────

export async function scan({ fullArgs, from, sock }) {
  // ── No input guard ───────────────────────────────────────
  if (!fullArgs?.trim()) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "🛡️ SECURITY SCAN",
        "Scan any URL for malware, phishing & threats 🔍\n\n" +
          "*Usage:* .scan <url>\n\n" +
          "*Examples:*\n" +
          "  .scan https://example.com\n" +
          "  .scan bit.ly/suspiciouslink\n\n" +
          "*Powered by:* VirusTotal → Google Safe Browsing → URLScan.io",
      ),
    });
    return;
  }

  const url = normalizeUrl(fullArgs);

  if (!isValidUrl(url)) {
    await sock.sendMessage(from, {
      text: formatError(
        "INVALID URL",
        `*"${fullArgs}"* doesn't look like a valid URL fam 🤔\n\nTry: .scan https://example.com`,
      ),
    });
    return;
  }

  await sock.sendMessage(from, {
    text: `🔍 Scanning *${url}*...\n\nRunning through multiple security engines. Give me a sec ⏳`,
  });

  // ── Provider 1: VirusTotal ───────────────────────────────
  if (ENV.VIRUSTOTAL_KEY) {
    try {
      console.log("[scan] Trying VirusTotal...");
      const stats = await scanWithVirusTotal(url);
      await sock.sendMessage(from, { text: buildVTMessage(url, stats) });
      return;
    } catch (err) {
      const reason =
        err.response?.status === 401
          ? "Invalid API key"
          : err.response?.status === 429
            ? "Rate limited"
            : err.response?.status === 400
              ? "Bad request"
              : err.message;
      console.warn(`[scan] VirusTotal failed — ${reason}`);
    }
  } else {
    console.log("[scan] VIRUSTOTAL_KEY not set — skipping");
  }

  // ── Provider 2: Google Safe Browsing ─────────────────────
  if (ENV.GOOGLE_SAFE_BROWSING_KEY) {
    try {
      console.log("[scan] Trying Google Safe Browsing...");
      const matches = await scanWithGoogleSafeBrowsing(url);

      if (matches.length > 0) {
        const threat = matches[0].threatType;
        const threats = [...new Set(matches.map((m) => m.threatType))].join(
          ", ",
        );
        await sock.sendMessage(from, {
          text:
            `🛡️ *SECURITY SCAN RESULT*\n` +
            `${"─".repeat(30)}\n\n` +
            `🔗 *URL:* ${url}\n\n` +
            `❌ *Verdict: UNSAFE*\n\n` +
            `🔴 *Threats detected:*\n  ${threats}\n\n` +
            `${"─".repeat(30)}\n` +
            `⚠️ Do NOT visit this URL fam. Seriously.\n` +
            `⚡ AYOBOT Security • AYOCODES 👑`,
        });
      } else {
        await sock.sendMessage(from, {
          text:
            `🛡️ *SECURITY SCAN RESULT*\n` +
            `${"─".repeat(30)}\n\n` +
            `🔗 *URL:* ${url}\n\n` +
            `✅ *Verdict: CLEAN*\n\n` +
            `🟢 Google Safe Browsing found no threats.\n\n` +
            `${"─".repeat(30)}\n` +
            `⚡ AYOBOT Security • AYOCODES 👑`,
        });
      }
      return;
    } catch (err) {
      console.warn(`[scan] Google Safe Browsing failed — ${err.message}`);
    }
  } else {
    console.log("[scan] GOOGLE_SAFE_BROWSING_KEY not set — skipping");
  }

  // ── Provider 3: URLScan.io ───────────────────────────────
  try {
    console.log("[scan] Trying URLScan.io...");
    const result = await scanWithURLScan(url);

    const verdict = result.malicious ? "❌ MALICIOUS" : "✅ CLEAN";
    const icon = result.malicious ? "🔴" : "🟢";
    const tagsLine = result.tags.length
      ? `\n🏷️ Tags: ${result.tags.join(", ")}`
      : "";

    await sock.sendMessage(from, {
      text:
        `🛡️ *SECURITY SCAN RESULT*\n` +
        `${"─".repeat(30)}\n\n` +
        `🔗 *URL:* ${url}\n\n` +
        `${icon} *Verdict: ${result.malicious ? "MALICIOUS" : "CLEAN"}*\n` +
        `📊 Risk score: *${result.score}/100*` +
        `${tagsLine}\n\n` +
        `${"─".repeat(30)}\n` +
        `🔍 Full report: ${result.link}\n` +
        `⚡ AYOBOT Security • AYOCODES 👑`,
    });
    return;
  } catch (err) {
    console.warn(`[scan] URLScan.io failed — ${err.message}`);
  }

  // ── All providers failed ─────────────────────────────────
  await sock.sendMessage(from, {
    text: formatError(
      "SCAN UNAVAILABLE",
      `Couldn't scan *${url}* right now 😕\n\n` +
        `All security providers failed or no API keys set.\n\n` +
        `Add these to your *.env* to fix:\n` +
        `  • VIRUSTOTAL_KEY\n` +
        `  • GOOGLE_SAFE_BROWSING_KEY\n` +
        `  • URLSCAN_KEY (optional — works without one)`,
    ),
  });
}
