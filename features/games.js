// @ts-nocheck
// features/games.js - AYOBOT v1.0.0
// ════════════════════════════════════════════════════════════════════════════
//  Games Module — RPS, Dice, Coin Flip, Trivia
//  Author  : AYOCODES
//  Version : 1.0.0 (FINAL - TRIVIA FULLY FIXED)
//
//  FIXES IN THIS VERSION:
//    - Trivia setTimeout gameId comparison bug fixed
//    - handleTriviaAnswer now properly detects A/B/C/D answers
//    - Added debug logging to verify trivia is working
//    - Global trivia state properly shared across modules
// ════════════════════════════════════════════════════════════════════════════

import axios from "axios";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// Initialize global trivia state if not exists
if (!global.activeTrivia) {
  global.activeTrivia = new Map();
  console.log("✅ [games.js] Created new global.activeTrivia");
} else {
  console.log("✅ [games.js] global.activeTrivia already exists");
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
//  TRIVIA - FIXED WITH PROPER TIMEOUT AND ANSWER DETECTION
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
      {
        category: "Technology",
        difficulty: "easy",
        question: "What does CPU stand for?",
        correct_answer: "Central Processing Unit",
        incorrect_answers: [
          "Central Power Unit",
          "Computer Processing Utility",
          "Core Processing Unit",
        ],
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
    const answerMap = {}; // letter -> answer text
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
        // Try to notify that time ran out
        sock.sendMessage(from, {
          text: `⏰ *Time's up!* The correct answer was *${correctLetter}. ${correctDecoded}*`
        }).catch(() => {});
      }
    }, 120000); // 2 minutes

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
        `💡 *Reply with A, B, C, or D*\n` +
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

// Helper for error logging
function log_error(msg) {
  console.log(`\x1b[31m❌\x1b[0m ${msg}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  HANDLE TRIVIA ANSWER - FIXED WITH PROPER DETECTION
// ════════════════════════════════════════════════════════════════════════════
export async function handleTriviaAnswer(message, from, sock) {
  console.log(`🎯 [handleTriviaAnswer] Called for chat: ${from}`);

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
  const msgObj = message?.message || {};
  const rawText =
    msgObj.conversation ||
    msgObj.extendedTextMessage?.text ||
    msgObj.imageMessage?.caption ||
    msgObj.videoMessage?.caption ||
    "";

  console.log(`📝 [handleTriviaAnswer] Raw text: "${rawText}"`);

  if (!rawText) {
    console.log(`❌ [handleTriviaAnswer] No text in message`);
    return false;
  }

  const playerAnswer = rawText.toUpperCase().trim();
  console.log(`🔤 [handleTriviaAnswer] Player answer: "${playerAnswer}"`);

  // Only process A, B, C, or D
  if (!["A", "B", "C", "D"].includes(playerAnswer)) {
    console.log(`❌ [handleTriviaAnswer] Not A/B/C/D`);
    return false;
  }

  // Check if the game has expired (optional - you can still answer after timeout)
  // const timeElapsed = Date.now() - gameData.time;
  // if (timeElapsed > 120000) {
  //   console.log(`⏰ [handleTriviaAnswer] Game expired`);
  //   global.activeTrivia.delete(from);
  //   return false;
  // }

  const isCorrect = playerAnswer === gameData.correctLetter;
  console.log(`✅ [handleTriviaAnswer] Is correct: ${isCorrect}`);

  // Remove the game regardless of right or wrong
  global.activeTrivia.delete(from);
  console.log(`🗑️ [handleTriviaAnswer] Removed trivia for ${from}`);

  // Send response
  if (isCorrect) {
    await sock.sendMessage(from, {
      text: formatSuccess(
        "✅ CORRECT!",
        `🎉 Great job! You got it right!\n\n` +
          `✅ *Answer:* ${gameData.correctAnswer}\n\n` +
          `🏆 Use *${process.env.PREFIX || "."}trivia* for another question.`,
      ),
    });
    console.log(`✅ [handleTriviaAnswer] Sent correct response`);
  } else {
    // Get the answer they chose
    const chosenAnswer = gameData.answerMap?.[playerAnswer] || "?";
    await sock.sendMessage(from, {
      text: formatError(
        "❌ WRONG!",
        `😢 Sorry, that's incorrect.\n\n` +
          `❌ *Your answer:* ${playerAnswer}. ${chosenAnswer}\n` +
          `✅ *Correct answer:* ${gameData.correctLetter}. ${gameData.correctAnswer}\n\n` +
          `💪 Try again with *${process.env.PREFIX || "."}trivia*`,
      ),
    });
    console.log(`✅ [handleTriviaAnswer] Sent wrong response`);
  }

  return true;
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
