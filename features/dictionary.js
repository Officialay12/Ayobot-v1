import axios from "axios";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

export async function dict({ fullArgs, from, sock }) {
  // ── No input guard ──────────────────────────────────────────
  if (!fullArgs?.trim()) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "📚 DICTIONARY",
        "Usage: .dict <word>\nExample: .dict ephemeral\n\nLook up any English word — definitions, examples, phonetics, all of it.",
      ),
    });
    return;
  }

  const word = fullArgs.trim().toLowerCase();

  await sock.sendMessage(from, {
    text: `🔍 Looking up *"${word}"*...`,
  });

  try {
    const res = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { timeout: 8000 },
    );

    // ── Safety check — API sometimes returns non-array ──────────
    const entries = Array.isArray(res.data) ? res.data : [res.data];
    const data = entries[0];

    if (!data || !data.meanings?.length) {
      await sock.sendMessage(from, {
        text: formatError(
          "NOT FOUND",
          `No definitions found for "${word}". Check the spelling and try again.`,
        ),
      });
      return;
    }

    // ── Phonetic ─────────────────────────────────────────────────
    const phonetic =
      data.phonetics?.find((p) => p.text)?.text || data.phonetic || "";

    // ── Meanings builder ─────────────────────────────────────────
    let definitions = "";
    const maxMeanings = Math.min(data.meanings.length, 4); // cap at 4 parts of speech

    for (let i = 0; i < maxMeanings; i++) {
      const meaning = data.meanings[i];
      definitions += `\n✦ *${meaning.partOfSpeech.toUpperCase()}*\n`;

      const defsToShow = meaning.definitions.slice(0, 2);
      defsToShow.forEach((def, j) => {
        definitions += `  ${j + 1}. ${def.definition}\n`;
        if (def.example) {
          definitions += `     💬 "${def.example}"\n`;
        }
        if (def.synonyms?.length) {
          definitions += `     🔗 Synonyms: ${def.synonyms.slice(0, 3).join(", ")}\n`;
        }
      });

      // ── Antonyms from the meaning level ──────────────────────
      if (meaning.antonyms?.length) {
        definitions += `  ↔️ Antonyms: ${meaning.antonyms.slice(0, 3).join(", ")}\n`;
      }
    }

    // ── Audio note if available ──────────────────────────────────
    const audioUrl = data.phonetics?.find((p) => p.audio)?.audio || "";
    const audioNote = audioUrl ? `\n🔊 Pronunciation audio available` : "";

    // ── Source ───────────────────────────────────────────────────
    const source = data.sourceUrls?.[0]
      ? `\n📖 Source: ${data.sourceUrls[0]}`
      : "";

    await sock.sendMessage(from, {
      text: formatSuccess(
        `📚 ${data.word}${phonetic ? `  ${phonetic}` : ""}`,
        `${definitions}${audioNote}${source}`,
      ),
    });
  } catch (err) {
    // ── Granular error handling ───────────────────────────────────
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      await sock.sendMessage(from, {
        text: formatError(
          "TIMEOUT",
          "Dictionary API took too long to respond. Try again in a sec ⏱️",
        ),
      });
      return;
    }

    if (err.response?.status === 404) {
      await sock.sendMessage(from, {
        text: formatError(
          "NOT FOUND",
          `"${word}" isn't in the dictionary. Could be a typo or a very niche word 🤷`,
        ),
      });
      return;
    }

    if (err.response?.status === 429) {
      await sock.sendMessage(from, {
        text: formatError(
          "RATE LIMITED",
          "We're hitting the dictionary too fast. Chill for a moment and try again 😅",
        ),
      });
      return;
    }

    // ── Fallback ──────────────────────────────────────────────────
    await sock.sendMessage(from, {
      text: formatError(
        "ERROR",
        `Couldn't fetch "${word}". Check your connection or try again later.`,
      ),
    });
  }
}
