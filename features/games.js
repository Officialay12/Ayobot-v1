import axios from "axios";
import { formatError, formatInfo, formatSuccess } from "../utils/formatters.js";

// Track active trivia games
global.activeTrivia = global.activeTrivia || new Map();

// ========== ROCK PAPER SCISSORS ==========
export async function rps({ fullArgs, from, sock }) {
  if (!fullArgs) {
    await sock.sendMessage(from, {
      text: formatInfo(
        "RPS",
        "Usage: .rps <rock/paper/scissors>\nExample: .rps rock",
      ),
    });
    return;
  }

  const choices = ["rock", "paper", "scissors"];
  const userChoice = fullArgs.toLowerCase();

  if (!choices.includes(userChoice)) {
    return await sock.sendMessage(from, {
      text: "❌ Please choose: rock, paper, or scissors",
    });
  }

  const botChoice = choices[Math.floor(Math.random() * 3)];

  let result;
  if (userChoice === botChoice) {
    result = "🤝 *IT'S A TIE!*";
  } else if (
    (userChoice === "rock" && botChoice === "scissors") ||
    (userChoice === "paper" && botChoice === "rock") ||
    (userChoice === "scissors" && botChoice === "paper")
  ) {
    result = "🎉 *YOU WIN!*";
  } else {
    result = "🤖 *BOT WINS!*";
  }

  const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };

  const rpsText = `╔══════════════════════════╗
║        ✂️ *RPS GAME*       ║
╚══════════════════════════╝

👤 You: ${emojis[userChoice]} ${userChoice.toUpperCase()}
🤖 Bot: ${emojis[botChoice]} ${botChoice.toUpperCase()}

━━━━━━━━━━━━━━━━━━━━━
        ${result}
━━━━━━━━━━━━━━━━━━━━━

⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: rpsText });
}

// ========== DICE ROLL ==========
export async function dice({ from, sock }) {
  const result = Math.floor(Math.random() * 6) + 1;
  const diceEmojis = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  const diceText = `╔══════════════════════════╗
║        🎲 *DICE ROLL*      ║
╚══════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━
        ${diceEmojis[result - 1]}  *${result}*  ${diceEmojis[result - 1]}
━━━━━━━━━━━━━━━━━━━━━

⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: diceText });
}

// ========== COIN FLIP ==========
export async function coinFlip({ from, sock }) {
  const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
  const emoji = result === "HEADS" ? "👑" : "🪙";

  const flipText = `╔══════════════════════════╗
║        🪙 *COIN FLIP*      ║
╚══════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━
   ${emoji}  *${result}*  ${emoji}
━━━━━━━━━━━━━━━━━━━━━

⚡ *AYOBOT v1* | 👑 Created by AYOCODES`;

  await sock.sendMessage(from, { text: flipText });
}

// ========== TRIVIA ==========
export async function trivia({ from, sock }) {
  await sock.sendMessage(from, { text: "❓ *Loading trivia question...*" });

  let trivia = null;
  let usedApi = "";

  const apis = [
    async () => {
      const res = await axios.get("https://opentdb.com/api.php?amount=1");
      if (res.data.response_code === 0 && res.data.results?.length > 0) {
        return res.data.results[0];
      }
      throw new Error("No results");
    },
    async () => {
      const res = await axios.get(
        "https://the-trivia-api.com/api/questions?limit=1",
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
      throw new Error("No results");
    },
  ];

  for (const api of apis) {
    try {
      trivia = await api();
      usedApi = "API";
      break;
    } catch (e) {}
  }

  // Fallback questions
  if (!trivia) {
    const fallback = [
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
    ];
    trivia = fallback[Math.floor(Math.random() * fallback.length)];
    usedApi = "Fallback";
  }

  try {
    const decodeHTML = (text) => {
      return text
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&eacute;/g, "é")
        .replace(/&agrave;/g, "à")
        .replace(/&egrave;/g, "è");
    };

    let answers = [trivia.correct_answer, ...(trivia.incorrect_answers || [])];
    answers = answers.filter((a) => a && a.trim());
    while (answers.length < 4) answers.push("Not sure");

    // Shuffle
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    const options = ["A", "B", "C", "D"];
    let answerList = "";
    const answerMap = {};

    answers.slice(0, 4).forEach((ans, i) => {
      const letter = options[i];
      answerList += `${letter}. ${decodeHTML(ans)}\n`;
      answerMap[letter] = decodeHTML(ans);
    });

    let correctLetter = "A";
    for (const [letter, ans] of Object.entries(answerMap)) {
      if (ans === decodeHTML(trivia.correct_answer)) {
        correctLetter = letter;
        break;
      }
    }

    const gameId = `${from}_${Date.now()}`;
    global.activeTrivia.set(from, {
      correctLetter,
      correctAnswer: decodeHTML(trivia.correct_answer),
      question: decodeHTML(trivia.question),
      time: Date.now(),
      gameId,
    });

    setTimeout(() => {
      if (global.activeTrivia.get(from)?.gameId === gameId) {
        global.activeTrivia.delete(from);
      }
    }, 120000);

    const triviaText = `╔══════════════════════════╗
║        ❓ *TRIVIA*        ║
╚══════════════════════════╝

📚 *Category:* ${decodeHTML(trivia.category)}
🎯 *Difficulty:* ${trivia.difficulty?.toUpperCase() || "MIXED"}
🌐 *Source:* ${usedApi}

━━━━━━━━━━━━━━━━━━━━━
❓ *Question:*
${decodeHTML(trivia.question)}

━━━━━━━━━━━━━━━━━━━━━
${answerList}
━━━━━━━━━━━━━━━━━━━━━
💡 *Reply with A, B, C, or D*
⏳ *Time limit: 2 minutes*

⚡ *AYOBOT v1* | 👑 Built by AYOCODES`;

    await sock.sendMessage(from, { text: triviaText });
  } catch (error) {
    await sock.sendMessage(from, {
      text: formatError("TRIVIA ERROR", "Could not load trivia question."),
    });
  }
}

// Handle trivia answers (call this from your message handler)
export async function handleTriviaAnswer(message, from, sock) {
  if (!global.activeTrivia) return false;

  const activeGame = global.activeTrivia.get(from);
  if (!activeGame) return false;

  const answer = message.message?.conversation?.toUpperCase().trim();
  if (!answer || !["A", "B", "C", "D"].includes(answer)) return false;

  const isCorrect = answer === activeGame.correctLetter;
  global.activeTrivia.delete(from);

  if (isCorrect) {
    await sock.sendMessage(from, {
      text: formatSuccess(
        "✅ CORRECT!",
        `🎉 Dope You got it right!\n\n✅ *Answer:* ${activeGame.correctAnswer}`,
      ),
    });
  } else {
    await sock.sendMessage(from, {
      text: formatError(
        "❌ WRONG!",
        `😢 Sorry man, that's incorrect.\n\n✅ *Correct answer:* ${activeGame.correctLetter}. ${activeGame.correctAnswer}`,
      ),
    });
  }

  return true;
}
