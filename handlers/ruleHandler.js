// handlers/ruleHandler.js - FIXED IMPORTS
import { ENV, groupWarnings } from "../index.js";
import { extractText } from "../utils/validators.js";

export async function handleRuleViolation(
  type,
  groupJid,
  userJid,
  sock,
  message,
) {
  // Don't punish admins
  if (userJid === `${ENV.ADMIN}@s.whatsapp.net`) return;

  const warnings = {
    link: {
      title: "🔗 LINKS NOT ALLOWED",
      message: "No promotional links or URLs allowed in this group.",
    },
    spam: {
      title: "🚫 SPAM DETECTED",
      message: "Please do not spam messages. Slow down your sending rate.",
    },
  };

  const warning = warnings[type] || {
    title: "⚠️ RULE VIOLATION",
    message: "Please follow the group rules.",
  };

  try {
    // DELETE THE VIOLATING MESSAGE
    try {
      await sock.sendMessage(groupJid, { delete: message.key });
    } catch (e) {}

    // Get or create warning record
    const key = `${groupJid}_${userJid}`;
    const warns = groupWarnings.get(key) || {
      count: 0,
      reasons: [],
      firstOffense: Date.now(),
      lastOffense: Date.now(),
    };

    warns.count++;
    warns.reasons.push({
      reason: type,
      time: Date.now(),
      message: extractText(message).substring(0, 100),
    });
    warns.lastOffense = Date.now();
    groupWarnings.set(key, warns);

    // Calculate warning level
    const warningsLeft = ENV.MAX_WARNINGS - warns.count;
    const warningLevel =
      warns.count === 1
        ? "FIRST"
        : warns.count === 2
          ? "SECOND"
          : warns.count >= ENV.MAX_WARNINGS - 1
            ? "FINAL"
            : "WARNING";

    // Send warning to group
    const warningMsg = `╔══════════════════════════╗
║   ⚠️ *${warningLevel} WARNING* ⚠️   ║
╚══════════════════════════╝

${warning.title}
━━━━━━━━━━━━━━━━━━━━━
${warning.message}

━━━━━━━━━━━━━━━━━━━━━
👤 *Offender:* @${userJid.split("@")[0]}
📊 *Violation:* ${type.toUpperCase()}
⚠️ *Warnings:* ${warns.count}/${ENV.MAX_WARNINGS}
⏳ *Left:* ${warningsLeft}

━━━━━━━━━━━━━━━━━━━━━
⚡ *AYOBOT Security* | 👑 AYOCODES`;

    await sock.sendMessage(groupJid, {
      text: warningMsg,
      mentions: [userJid],
    });

    // AUTO-KICK ON MAX WARNINGS
    if (warns.count >= ENV.MAX_WARNINGS) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");
        groupWarnings.delete(key);
      } catch (kickError) {
        console.error("Auto-kick failed:", kickError);
      }
    }
  } catch (error) {
    console.error("Rule violation handling failed:", error);
  }
}
