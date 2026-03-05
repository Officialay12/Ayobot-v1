import axios from "axios";
import { formatSuccess, formatError, formatInfo } from "../utils/formatters.js";

export async function dict({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "DICTIONARY",
        "Usage: .dict <word>\nExample: .dict hello",
      ),
    });
    return;
  }

  await sock.sendMessage(from, { text: "📚 *Looking up definition...*" });

  try {
    const res = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(fullArgs)}`,
    );
    const data = res.data[0];

    let definitions = "";
    data.meanings.forEach((meaning, i) => {
      definitions += `\n${i + 1}. *${meaning.partOfSpeech}*\n`;
      meaning.definitions.slice(0, 2).forEach((def) => {
        definitions += `   ▰ ${def.definition}\n`;
        if (def.example) definitions += `   📝 "${def.example}"\n`;
      });
    });

    const phonetic = data.phonetics.find((p) => p.text)?.text || "";

    await sock.sendMessage(from, {
      text: formatSuccess(`📚 ${data.word} ${phonetic}`, definitions),
    });
  } catch {
    await sock.sendMessage(from, {
      text: formatError("ERROR", `Word "${fullArgs}" not found.`),
    });
  }
}
