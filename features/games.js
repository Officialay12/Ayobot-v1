// @ts-nocheck
// features/games.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Games Module — RPS, Dice, Coin Flip, Trivia
//  Author  : AYOCODES
//  Version : 1.0.0 (FULLY FIXED - TRIVIA ANSWER DETECTION)
//
//  FIXES IN THIS VERSION:
//    - Fixed message extraction from all message formats
//    - Added better debugging for trivia answers
//    - Fixed compatibility with command handler's context object
//    - Added support for both direct message and quoted reply answers
//    - Fixed global trivia state initialization
//    - Fixed answer detection when message is in group context
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// Initialize global trivia state if not exists
if (!global.activeTrivia) {
  global.activeTrivia = new Map();
  console.log("✅ [games.js] Created new global.activeTrivia");
} else {
  console.log("✅ [games.js] global.activeTrivia already exists with size:", global.activeTrivia.size);
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPER FUNCTION: Extract message text from various formats
// ════════════════════════════════════════════════════════════════════════════
function extractMessageText(messageObj) {
  if (!messageObj) return null;

  // If it's a string
  if (typeof messageObj === 'string') {
    return messageObj.trim();
  }

  // If it's the context object from command handler
  if (messageObj.message) {
    const m = messageObj.message;
    const text =
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      null;
    if (text) return text.trim();
  }

  // If it has a text property directly
  if (messageObj.text) {
    return messageObj.text.trim();
  }

  // If it has a conversation property
  if (messageObj.conversation) {
    return messageObj.conversation.trim();
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  ROCK PAPER SCISSORS
// ════════════════════════════════════════════════════════════════════════════
export async function rps({ fullArgs, from, sock }) {
  if (!fullArgs) {
    return void (await sock.sendMessage(from, {
      text: formatInfo(
        "RPS",
        "Usage: .rps <rock/paper/scissors>\nExample: .rps rock",
      ),
    }));
  }

  const choices = ["rock", "paper", "scissors"];
  const playerChoice = fullArgs.toLowerCase().trim();

  if (!choices.includes(playerChoice)) {
    return await sock.sendMessage(from, {
      text: "❌ Please choose: *rock*, *paper*, or *scissors*",
    });
  }

  const botChoice = choices[Math.floor(Math.random() * 3)];

  let result;
  if (playerChoice === botChoice) {
    result = "🤝 *IT'S A TIE!*";
  } else if (
    (playerChoice === "rock" && botChoice === "scissors") ||
    (playerChoice === "paper" && botChoice === "rock") ||
    (playerChoice === "scissors" && botChoice === "paper")
  ) {
    result = "🎉 *YOU WIN!*";
  } else {
    result = "🤖 *BOT WINS!*";
  }

  const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║        ✂️ *RPS GAME*       ║\n` +
      `╚══════════════════════════╝\n\n` +
      `👤 You: ${emojis[playerChoice]} ${playerChoice.toUpperCase()}\n` +
      `🤖 Bot: ${emojis[botChoice]} ${botChoice.toUpperCase()}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `        ${result}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ *AYOBOT v1* | 👑 Created by AYOCODES`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  DICE ROLL
// ════════════════════════════════════════════════════════════════════════════
export async function dice({ from, sock }) {
  const roll = Math.floor(Math.random() * 6) + 1;
  const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║        🎲 *DICE ROLL*      ║\n` +
      `╚══════════════════════════╝\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `        ${diceEmojis[roll - 1]}  *${roll}*  ${diceEmojis[roll - 1]}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ *AYOBOT v1* | 👑 Created by AYOCODES`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  COIN FLIP
// ════════════════════════════════════════════════════════════════════════════
export async function coinFlip({ from, sock }) {
  const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
  const emoji = result === "HEADS" ? "👑" : "🪙";

  await sock.sendMessage(from, {
    text:
      `╔══════════════════════════╗\n` +
      `║        🪙 *COIN FLIP*      ║\n` +
      `╚══════════════════════════╝\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `   ${emoji}  *${result}*  ${emoji}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ *AYOBOT v1* | 👑 Created by AYOCODES`,
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  TRIVIA - FIXED WITH PROPER ANSWER DETECTION
// ════════════════════════════════════════════════════════════════════════════
export async function trivia({ from, sock }) {
  console.log(`🎮 [trivia] Starting trivia in chat ${from}`);

  await sock.sendMessage(from, { text: "❓ *Loading trivia question...*" });

  let questionData = null;
  let fetchSource = "";

  // Try live APIs first
  const apiAttempts = [
    async () => {
      const res = await axios.get("https://opentdb.com/api.php?amount=1", {
        timeout: 8000,
      });
      if (res.data.response_code === 0 && res.data.results?.length > 0) {
        return res.data.results[0];
      }
      throw new Error("No results from OpenTDB");
    },
    async () => {
      const res = await axios.get(
        "https://the-trivia-api.com/api/questions?limit=1",
        { timeout: 8000 },
      );
      if (res.data?.length > 0) {
        const q = res.data[0];
        return {
          category: q.category,
          difficulty: q.difficulty,
          question: q.question,
          correct_answer: q.correctAnswer,
          incorrect_answers: q.incorrectAnswers,
        };
      }
      throw new Error("No results from Trivia API");
    },
  ];

  for (const attempt of apiAttempts) {
    try {
      questionData = await attempt();
      fetchSource = "API";
      console.log(`✅ [trivia] Got question from API`);
      break;
    } catch (_) {}
  }

  // Local fallback questions
  if (!questionData) {
    const fallbackQuestions = [
      {
        category: "Geography",
        difficulty: "easy",
        question: "What is the capital of France?",
        correct_answer: "Paris",
        incorrect_answers: ["London", "Berlin", "Madrid"],
      },
      {
        category: "Science",
        difficulty: "medium",
        question: "What is the chemical symbol for gold?",
        correct_answer: "Au",
        incorrect_answers: ["Ag", "Fe", "Pb"],
      },
      {
        category: "History",
        difficulty: "hard",
        question: "In which year did World War II end?",
        correct_answer: "1945",
        incorrect_answers: ["1944", "1946", "1943"],
      },
      {
        category: "Science & Nature",
        difficulty: "medium",
        question: "Approximately what percentage of Earth's atmosphere is Oxygen?",
        correct_answer: "21%",
        incorrect_answers: ["7%", "54%", "78%"],
      },
      {
        category: "Entertainment",
        difficulty: "easy",
        question: "Which movie features Simba the lion?",
        correct_answer: "The Lion King",
        incorrect_answers: ["Finding Nemo", "Aladdin", "Tarzan"],
      },
      {
        category: "Sports",
        difficulty: "medium",
        question: "How many players are on a basketball team on court?",
        correct_answer: "5",
        incorrect_answers: ["6", "4", "7"],
      },
    ];
    questionData =
      fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    fetchSource = "Local";
    console.log(`✅ [trivia] Using local fallback question`);
  }

  // Helper to decode HTML entities
  const decode = (str) =>
    String(str || "")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&eacute;/g, "é")
      .replace(/&agrave;/g, "à")
      .replace(/&egrave;/g, "è")
      .replace(/&ouml;/g, "ö")
      .replace(/&uuml;/g, "ü")
      .replace(/&auml;/g, "ä")
      .replace(/&ntilde;/g, "ñ")
      .replace(/&ccedil;/g, "ç")
      .trim();

  try {
    const correctDecoded = decode(questionData.correct_answer);
    const questionDecoded = decode(questionData.question);

    // Build shuffled answer pool
    let answerPool = [
      questionData.correct_answer,
      ...(questionData.incorrect_answers || []),
    ]
      .filter((a) => a && String(a).trim())
      .map(decode);

    // Deduplicate
    answerPool = [...new Set(answerPool)];

    // Pad to 4 if needed
    while (answerPool.length < 4) {
      answerPool.push("None of the above");
    }

    // Fisher-Yates shuffle
    for (let i = answerPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answerPool[i], answerPool[j]] = [answerPool[j], answerPool[i]];
    }

    // Take only first 4
    const finalAnswers = answerPool.slice(0, 4);
    const letterKeys = ["A", "B", "C", "D"];
    const answerMap = {};
    let correctLetter = "A";
    let answersText = "";

    finalAnswers.forEach((answer, idx) => {
      const letter = letterKeys[idx];
      answersText += `${letter}. ${answer}\n`;
      answerMap[letter] = answer;
      if (answer === correctDecoded) {
        correctLetter = letter;
      }
    });

    // Create unique game ID for this trivia session
    const gameId = `${from}_${Date.now()}`;

    // Store trivia data in global map
    global.activeTrivia.set(from, {
      correctLetter,
      correctAnswer: correctDecoded,
      question: questionDecoded,
      time: Date.now(),
      gameId,
      answerMap,
      from, // Store the group/chat ID
    });

    console.log(`✅ [trivia] Stored trivia for ${from} with gameId: ${gameId}`);
    console.log(`📊 [trivia] Correct answer: ${correctLetter}. ${correctDecoded}`);
    console.log(`📊 [trivia] Current active trivia count: ${global.activeTrivia.size}`);

    // Set timeout to expire the question after 2 minutes
    setTimeout(() => {
      const current = global.activeTrivia.get(from);
      if (current?.gameId === gameId) {
        global.activeTrivia.delete(from);
        console.log(`⏰ [trivia] Trivia expired for ${from}`);
        sock.sendMessage(from, {
          text: `⏰ *Time's up!* The correct answer was *${correctLetter}. ${correctDecoded}*`
        }).catch(() => {});
      }
    }, 120000);

    // Send the question
    await sock.sendMessage(from, {
      text:
        `╔══════════════════════════╗\n` +
        `║        ❓ *TRIVIA*        ║\n` +
        `╚══════════════════════════╝\n\n` +
        `📚 *Category:* ${decode(questionData.category)}\n` +
        `🎯 *Difficulty:* ${(questionData.difficulty || "mixed").toUpperCase()}\n` +
        `🌐 *Source:* ${fetchSource}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `❓ *Question:*\n${questionDecoded}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${answersText}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👍 *Reply with A, B, C, or D*\n` +
        `⏳ *Time limit: 2 minutes*\n\n` +
        `⚡ *AYOBOT v1* | 👑 Built by AYOCODES`,
    });

    console.log(`✅ [trivia] Question sent to ${from}`);

  } catch (err) {
    console.error(`❌ [trivia] Error: ${err.message}`);
    await sock.sendMessage(from, {
      text: formatError(
        "TRIVIA ERROR",
        "Could not load trivia question. Please try again.",
      ),
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  HANDLE TRIVIA ANSWER - COMPLETELY FIXED
// ════════════════════════════════════════════════════════════════════════════
export async function handleTriviaAnswer(message, from, sock) {
  console.log(`🎯 [handleTriviaAnswer] Called for chat: ${from}`);
  console.log(`📊 [handleTriviaAnswer] Message type: ${typeof message}`);

  // Check if global trivia store exists
  if (!global.activeTrivia) {
    console.log(`❌ [handleTriviaAnswer] global.activeTrivia is null`);
    return false;
  }

  // Check if there's an active trivia for this chat
  const gameData = global.activeTrivia.get(from);
  console.log(`📊 [handleTriviaAnswer] Game data exists: ${!!gameData}`);

  if (!gameData) {
    console.log(`❌ [handleTriviaAnswer] No active trivia for ${from}`);
    return false;
  }

  // Extract the answer text from the message
  let rawText = '';

  try {
    // Try to get text from message object
    if (message.message) {
      const m = message.message;
      rawText = m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                m.videoMessage?.caption ||
                '';
    }

    // If message is the context object with text directly
    if (!rawText && message.text) {
      rawText = message.text;
    }

    // If message is a string
    if (!rawText && typeof message === 'string') {
      rawText = message;
    }

    console.log(`📝 [handleTriviaAnswer] Raw text: "${rawText}"`);

    if (!rawText) {
      console.log(`❌ [handleTriviaAnswer] No text in message`);
      return false;
    }

    // Get the first character (A, B, C, or D)
    const cleanedText = rawText.trim().toUpperCase();
    let playerAnswer = cleanedText.charAt(0);

    // Also check if the entire message is just a single letter
    if (cleanedText.length === 1 && ["A", "B", "C", "D"].includes(cleanedText)) {
      playerAnswer = cleanedText;
    }

    console.log(`🔤 [handleTriviaAnswer] Player answer: "${playerAnswer}"`);

    // Only process A, B, C, or D
    if (!["A", "B", "C", "D"].includes(playerAnswer)) {
      console.log(`❌ [handleTriviaAnswer] Not A/B/C/D, got "${playerAnswer}"`);
      return false;
    }

    // Check if the game has expired
    const timeElapsed = Date.now() - gameData.time;
    if (timeElapsed > 120000) {
      console.log(`⏰ [handleTriviaAnswer] Game expired (${timeElapsed}ms)`);
      global.activeTrivia.delete(from);
      await sock.sendMessage(from, {
        text: `⏰ *Time's up!* The correct answer was *${gameData.correctLetter}. ${gameData.correctAnswer}*`
      });
      return true;
    }

    const isCorrect = playerAnswer === gameData.correctLetter;
    console.log(`✅ [handleTriviaAnswer] Is correct: ${isCorrect}`);

    // Remove the game regardless of right or wrong
    global.activeTrivia.delete(from);
    console.log(`🗑️ [handleTriviaAnswer] Removed trivia for ${from}`);

    // Send response
    if (isCorrect) {
      const chosenAnswer = gameData.answerMap?.[playerAnswer] || "?";
      await sock.sendMessage(from, {
        text: formatSuccess(
          "✅ CORRECT!",
          `🎉 Great job! You got it right!\n\n` +
          `✅ *Answer:* ${gameData.correctAnswer}\n\n` +
          `🏆 Use *.trivia* for another question.`
        ),
      });
      console.log(`✅ [handleTriviaAnswer] Sent correct response`);
    } else {
      const chosenAnswer = gameData.answerMap?.[playerAnswer] || "?";
      await sock.sendMessage(from, {
        text: formatError(
          "❌ WRONG!",
          `😢 Sorry, that's incorrect.\n\n` +
          `❌ *Your answer:* ${playerAnswer}. ${chosenAnswer}\n` +
          `✅ *Correct answer:* ${gameData.correctLetter}. ${gameData.correctAnswer}\n\n` +
          `💪 Try again with *.trivia*`
        ),
      });
      console.log(`✅ [handleTriviaAnswer] Sent wrong response`);
    }

    return true;

  } catch (error) {
    console.error(`❌ [handleTriviaAnswer] Error: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DEFAULT EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default {
  rps,
  dice,
  coinFlip,
  trivia,
  handleTriviaAnswer,
};
