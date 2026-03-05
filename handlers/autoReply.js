// handlers/autoReply.js - FIXED + COMPLETE
import {
  userConversations,
  inactivityTimers,
  autoReplyEnabled,
} from "../index.js";

const CONV_STATE = {
  IDLE: "idle",
  ACTIVE: "active",
  AWAITING_REPLY: "awaiting_reply",
};

class AutoReplyHandler {
  constructor() {
    this.userStates = new Map();
    this.conversationHistory = new Map();
    this.timeoutDuration = 5 * 60 * 1000; // 5 minutes
  }

  init() {
    console.log("✅ Auto-reply handler initialized");
  }

  isUserActive(userJid) {
    return this.userStates.has(userJid) || userConversations.has(userJid);
  }

  resetConversation(userJid) {
    this.userStates.delete(userJid);
    this.conversationHistory.delete(userJid);
    userConversations.delete(userJid);
    const timer = inactivityTimers.get(userJid);
    if (timer) {
      clearTimeout(timer);
      inactivityTimers.delete(userJid);
    }
  }

  async sendEnableGreeting(sock, from, userJid) {
    const greetings = [
      "👋 *Auto-reply enabled!*\n\nI'll now have conversations with you. Just reply to my messages and we can chat!\n\nType .menu to see all commands. 👑 AYOCODES",
      "✅ *Auto-reply is now ON!*\n\nTo chat with me, simply reply to any of my messages. I'll remember our conversation!\n\nTry replying to this message! 👑 AYOCODES",
      "🎉 *Auto-reply activated!*\n\nI'm ready to chat! Reply to my messages and we can talk. If I don't hear from you in 5 minutes, I'll check if you're still there.\n\n👑 AYOCODES",
      "🤖 *Auto-reply mode: ACTIVE*\n\nReply to my messages to start a conversation. I'll wait 5 minutes between replies before checking if you're still there.\n\n👑 Created by AYOCODES",
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    try {
      await sock.sendMessage(from, { text: greeting });
    } catch (e) {
      console.error("sendEnableGreeting error:", e.message);
      return;
    }

    this.userStates.set(userJid, {
      state: CONV_STATE.ACTIVE,
      lastMessage: Date.now(),
    });
    userConversations.set(userJid, true);
    this.setInactivityTimer(userJid, sock, from);
  }

  setInactivityTimer(userJid, sock, from) {
    // Clear any existing timer
    const existing = inactivityTimers.get(userJid);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      if (!this.userStates.has(userJid)) return;

      const checkMessages = [
        "👋 You still there fam? `Ayobot`",
        "🤔 Still with me? `Ayobot`",
        "⏳ Been a minute... you still around? `Ayobot`",
        "🙋 You there? I'm still here if you wanna chat! `Ayobot`",
        "🕐 Been 5 minutes... you still wanna chat? `Ayobot`",
        "Yo yo yo! You still there my G? `Ayobot`",
        "Wagwan? You gone quiet fam... you good? `Ayobot`",
      ];

      const checkMsg =
        checkMessages[Math.floor(Math.random() * checkMessages.length)];

      try {
        await sock.sendMessage(from, { text: checkMsg });
      } catch (_) {
        // Socket dropped — just reset
        this.resetConversation(userJid);
        return;
      }

      this.userStates.set(userJid, {
        ...this.userStates.get(userJid),
        state: CONV_STATE.AWAITING_REPLY,
      });

      // Give 30s to respond before ending conversation
      const awaitTimer = setTimeout(async () => {
        const userState = this.userStates.get(userJid);
        if (userState?.state === CONV_STATE.AWAITING_REPLY) {
          const endReplies = [
            "Alright fam, I'll head off! 👋 Just reply to me if you wanna chat again! `Ayobot`",
            "Safe fam! I'll catch you later! Just quote my message when you're back! ✌️ `Ayobot`",
            "No worries, I'll go chill. Reply to me when you need me! 🌟 `Ayobot`",
            "Aight my G, I'mma bounce! Just swipe my message when you wanna chat! 🤙 `Ayobot`",
          ];

          try {
            await sock.sendMessage(from, {
              text: endReplies[Math.floor(Math.random() * endReplies.length)],
            });
          } catch (_) {}

          this.resetConversation(userJid);
        }
      }, 30000);

      // Store the await timer so it can be cancelled if user replies
      inactivityTimers.set(userJid, awaitTimer);
    }, this.timeoutDuration);

    inactivityTimers.set(userJid, timer);
  }

  async handleReply(text, userJid, isAdmin, sock, from, msg) {
    try {
      if (!text || !userJid || !from) return false;

      // Update state and reset inactivity timer
      const userState = this.userStates.get(userJid) || {
        state: CONV_STATE.ACTIVE,
      };
      userState.lastMessage = Date.now();
      userState.state = CONV_STATE.ACTIVE; // Reset from AWAITING_REPLY if they replied
      this.userStates.set(userJid, userState);
      this.setInactivityTimer(userJid, sock, from);

      // Build conversation history
      let history = this.conversationHistory.get(userJid) || [];
      history.push({ role: "user", content: text });
      if (history.length > 10) history = history.slice(-10);

      // Generate response
      const response = await this.generateResponse(
        text,
        userJid,
        history,
        isAdmin,
        sock,
        from,
      );

      if (response) {
        history.push({ role: "assistant", content: response });
        this.conversationHistory.set(userJid, history);

        // ✅ FIXED: Send as plain text — contextInfo with quotedMessage
        // format was causing crashes. Simple reply works better.
        try {
          await sock.sendMessage(from, {
            text: response,
            mentions: [userJid],
          });
        } catch (sendErr) {
          console.error("Auto-reply send error:", sendErr.message);
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Auto-reply handleReply error:", error.message);
      return false;
    }
  }

  async generateResponse(text, userJid, history, isAdmin, sock, from) {
    if (!text) return null;
    const lower = text.toLowerCase().trim();

    // ==================== GREETINGS ====================
    const greetings = [
      "hi",
      "hello",
      "hey",
      "good morning",
      "good afternoon",
      "good evening",
      "good day",
      "howdy",
      "greetings",
      "sup",
      "wassup",
      "yo",
      "whats up",
      "whats good",
      "wagwan",
      "wag1",
    ];
    if (greetings.some((g) => lower.includes(g))) {
      const replies = [
        "Wagwan fam! 👋 Safe! How's things? Type .menu fi see all the bangers I got! 👑 AYOCODES",
        "Yo yo yo! What's good my G? 🤙 Check .menu for 45+ bare commands! 👑 AYOCODES",
        "Bless up! 🙌 Standard day, standard ting. Need something? .menu got you! 👑 AYOCODES",
        "Safe safe! 🫡 What you saying? Type .menu fi the full rundown! 👑 AYOCODES",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== THANKS ====================
    else if (
      [
        "thank",
        "thanks",
        "cheers",
        "appreciate",
        "grateful",
        "thank you",
        "much obliged",
        "thanks a lot",
        "thanks alot",
        "thx",
        "ty",
      ].some((t) => lower.includes(t))
    ) {
      const replies = [
        "Safe fam! Always here fi the mandem! 👊",
        "No problem my G! Any time! 💯",
        "Blessings! Come again yeh! 🙏",
        "Easy! Happy to sort you out! 👑 AYOCODES",
        "Don't mention it fam! That's what I'm here for! 🤝",
        "Bless up! Always a pleasure helping the mandem! ✨",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== IDENTITY ====================
    else if (
      [
        "who are you",
        "what are you",
        "who is this",
        "what is this",
        "who dis",
        "whos this",
        "identify yourself",
        "tell me about yourself",
      ].some((i) => lower.includes(i))
    ) {
      const replies = [
        "I'm *AYOBOT v1* 🤖, your boy *AYOCODES* made me! Got bare features, 90+ tings! AI chat, TTS, downloads, group tings... the whole lot! Type .menu fi see! 👑",
        "Wagwan! I'm AYOBOT - your g's personal assistant! Made by AYOCODES. Got more features than your nan's Sunday roast! Type .menu innit! 🍽️",
        "Yo! I'm the bot your boy AYOCODES cooked up! 90+ commands, AI chat, downloads, everything man needs! Check .menu fam! 👑",
        "I'm your g's favourite bot! AYOBOT v1, created by AYOCODES. Bare man use me daily! Type .menu to see why! 🔥",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== CAPABILITIES ====================
    else if (
      [
        "what can you do",
        "help me",
        "capabilities",
        "what do you do",
        "features",
        "how can you help",
        "what are your features",
        "what you got",
        "show me what you got",
        "abilities",
        "functions",
      ].some((c) => lower.includes(c))
    ) {
      return (
        "My G, I do bare things! 🤯\n\n" +
        "▰ Chat with AI (.ai)\n" +
        "▰ Text to speech (.tts)\n" +
        "▰ Download media (.download)\n" +
        "▰ Make stickers (.sticker)\n" +
        "▰ Check weather (.weather)\n" +
        "▰ Get news (.news)\n" +
        "▰ Tell jokes (.joke)\n" +
        "▰ Play music (.play)\n" +
        "▰ Movie info (.movie)\n\n" +
        "And 90+ more! Type .menu for the full list! 👑"
      );
    }

    // ==================== CREATOR INFO ====================
    else if (
      [
        "creator",
        "who made you",
        "your boss",
        "your maker",
        "who created you",
        "developer",
        "programmer",
        "who built you",
        "your daddy",
        "your father",
        "ayocodes",
        "ayo",
        "your creator",
      ].some((c) => lower.includes(c))
    ) {
      if (Math.random() < 0.3) {
        const replies = [
          "So yeah apparently I was built by a genius, philanthropist, playboy.. *Ayo* but you should call him AYOCODES — only I get to call him *Ayo* 😤 He is the best fr fr",
          "My G AYOCODES 👑? Yeah he's single now fam, just got out of a situationship. Man's in his villain arc fr 💔\n\n📞 Contact: 2349159180375\n🔗 GitHub: https://github.com/Officialay12\n\nTell him I sent you fam! 🤙",
          "AYOCODES? Don't mention love to him right now bruv, he's recovering 😭\n\n📞 Contact: 2349159180375\n🔗 GitHub: https://github.com/Officialay12\n\nTell him I sent you fam! 🤙",
          "His name is Ayo....we good? 🤙",
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      } else {
        return (
          "My G *AYOCODES* 👑 made me! Top boy!\n\n" +
          "📞 Contact: 2349159180375\n" +
          "📧 Email: ayomide0001111@gmail.com\n" +
          "🔗 GitHub: https://github.com/Officialay12\n\n" +
          "Tell him I sent you fam! 🤙"
        );
      }
    }

    // ==================== MENU ====================
    else if (
      [
        "menu",
        "commands",
        "help",
        "command list",
        "show commands",
        "what commands",
        "available commands",
        "list",
        "options",
        "what can i type",
      ].some((m) => lower.includes(m))
    ) {
      return "Type *.menu* to see all the bangers I got! 📋 45+ commands ready for you my G! 👑";
    }

    // ==================== TIME & DATE ====================
    else if (
      [
        "time",
        "what time",
        "current time",
        "clock",
        "whats the time",
        "what's the time",
        "date",
        "what date",
        "today's date",
        "day",
      ].some((t) => lower.includes(t)) &&
      (lower.includes("?") ||
        lower.includes("what") ||
        lower.includes("current"))
    ) {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `🕐 *Time:* ${now.toLocaleTimeString()}\n📅 *Date:* ${dateStr}\n\nFor world time use .time <city>! 🌍`;
    }

    // ==================== WEATHER ====================
    else if (
      [
        "weather",
        "temperature",
        "forecast",
        "rain",
        "sunny",
        "cloudy",
        "cold",
        "hot",
        "warm",
        "what's the weather",
        "how's the weather",
      ].some((w) => lower.includes(w)) &&
      (lower.includes("?") || lower.includes("what") || lower.includes("check"))
    ) {
      return "Check weather with: *.weather <city>*\nExample: .weather Lagos 🌤️";
    }

    // ==================== JOKES ====================
    else if (
      [
        "joke",
        "funny",
        "make me laugh",
        "tell me a joke",
        "crack me up",
        "humor",
        "humour",
        "laugh",
        "comedy",
        "something funny",
      ].some((j) => lower.includes(j))
    ) {
      return "Want a joke? Type *.joke* - got bare ones that'll have you creasing! 😂 Or you can just laugh at your life, seems funny too 👌";
    }

    // ==================== HOW ARE YOU ====================
    else if (
      [
        "how are you",
        "how you doing",
        "you alright",
        "you good",
        "how's it going",
        "how things",
        "what's good",
        "whats good",
        "how you feeling",
        "you okay",
        "you ok",
      ].some((h) => lower.includes(h))
    ) {
      const replies = [
        "I'm aight...you? 👀",
        "I'm blessed my G! You know how it is! 🤙 What you need?",
        "All good in the hood fam! Safe for asking! What's good with you?",
        "Living the dream innit! Just chillin' waiting to help the mandem! 👑",
        "Standard ting! Can't complain, wouldn't dare! How's things your end?",
        "I'm vibing fam! Thanks for checking! You good? 👊",
        "Blessed and highly favored! You know the vibes! What's happening? ✨",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== POSITIVE RESPONSES ====================
    else if (
      [
        "good",
        "great",
        "nice",
        "cool",
        "awesome",
        "amazing",
        "cool cool",
        "excellent",
        "perfect",
        "sharp",
        "lovely",
        "beautiful",
        "wonderful",
        "brilliant",
        "dope",
      ].some((p) => lower.includes(p))
    ) {
      const replies = [
        "Safe! That's the one! 👌 Anything else I can help with?",
        "Bless! Love to hear it! Need anything else fam?",
        "Standard! You know it! What's next then? 👑",
        "Love that energy fam! Keep it 💯! Need anything?",
        "Vibes! Pure vibes! What else you need my G? ✨",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== FAREWELLS ====================
    else if (
      [
        "bye",
        "goodbye",
        "see you",
        "see ya",
        "oya na",
        "later",
        "peace",
        "out",
        "e go be",
        "gtg",
        "got to go",
        "leaving",
        "signing off",
      ].some((f) => lower.includes(f))
    ) {
      const replies = [
        "Everywhere good! Come back when you need me! 👋",
        "Safe fam! Come back when you need me! 👋",
        "Catch you later my G! Stay blessed! 🙌",
        "Easy! Holla when you need something! 👑 AYOCODES",
        "Peace out! Remember me to the mandem! ✌️",
        "One love fam! Take it easy! 💚",
        "Blessings on your journey! Come back soon! 🌟",
      ];
      this.resetConversation(userJid);
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== LOVE ====================
    else if (
      [
        "love",
        "luv",
        "care",
        "miss",
        "affection",
        "heart",
        "sweet",
        "cutie",
        "beautiful",
        "handsome",
        "pretty",
      ].some((l) => lower.includes(l)) &&
      !lower.includes("love to")
    ) {
      const replies = [
        "Ayyy love you too fam! 😘 Now type .menu to see what I can do!",
        "Bless! Spread that love! 💖 Need anything from your boy?",
        "Love is love! Now let me help you with something! Type .menu! 💕",
        "You're making me blush my G! 😊 Check .menu for the tingz!",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== ANGER / FRUSTRATION ====================
    else if (
      [
        "angry",
        "mad",
        "frustrated",
        "tf",
        "annoyed",
        "upset",
        "fuming",
        "raging",
        "hate",
        "stupid",
        "dumb",
        "idiot",
        "trash",
        "rubbish",
        "shit",
        "crap",
        "useless",
      ].some((a) => lower.includes(a))
    ) {
      const replies = [
        "Woah easy fam! 😅 Take a breath! What's happened? Type .menu maybe I can help?",
        "Chill my G! No need for all that! Let me help you sort things? 👊",
        "I feel you fam! Deep breaths! What you need help with? 🤝",
        "Don't let it get to you! I'm here if you need something! Type .menu! 💪",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== SADNESS ====================
    else if (
      [
        "sad",
        "depressed",
        "down",
        "unhappy",
        "crying",
        "cry",
        "lonely",
        "alone",
        "hurt",
        "pain",
        "suffering",
        "miserable",
        "gloomy",
        "just here",
      ].some((s) => lower.includes(s))
    ) {
      const replies = [
        "Aww man, sorry you're feeling like that fam! 😔 Want a joke? Type .joke to cheer up!",
        "It's okay to not be okay my G! I'm here if you need to chat! 💙",
        "Sending you positive vibes fam! 🌈 Type .menu maybe we can do something fun!",
        "Bless up! Things get better I promise! Need a laugh? Try .joke! 💪",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== BOREDOM ====================
    else if (
      [
        "bored",
        "nothing to do",
        "boring",
        "entertain me",
        "entertainment",
        "boredom",
        "bored af",
        "bored asf",
        "bored stiff",
      ].some((b) => lower.includes(b))
    ) {
      const replies = [
        "Bored? Not on my watch fam! Try .joke, .game, or .menu for bare things to do! 🎮",
        "Let's fix that boredom! Type .menu and let's get lit! 🔥",
        "Boredom = solved! Check .menu for all the entertainment you need! 🎉",
        "Say less! I got you! Try .joke or .game, or explore .menu! 🚀",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== MUSIC ====================
    else if (
      [
        "music",
        "song",
        "tune",
        "banger",
        "playlist",
        "beat",
        "track",
        "album",
        "artist",
        "singer",
        "rapper",
        "drill",
        "grime",
        "afrobeats",
        "rap",
        "rnb",
        "melody",
      ].some((m) => lower.includes(m))
    ) {
      const replies = [
        "You know the vibes! 🎵 Type .play <song> to hear some bangers! Or .menu for more music tings!",
        "Music to my ears! 🎧 Try .play or .lyrics to get your fix!",
        "What we listening to? Use .play or check .menu for music commands! 🎶",
        "Drill? Grime? Afrobeats? Whatever you're into, try .play fam! 🔥",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== FOOD ====================
    else if (
      [
        "food",
        "hungry",
        "eat",
        "dinner",
        "lunch",
        "breakfast",
        "meal",
        "recipe",
        "cooking",
        "cook",
        "restaurant",
        "takeaway",
        "grub",
      ].some((f) => lower.includes(f))
    ) {
      const replies = [
        "Safe! Now I'm hungry! 🍔 Try .recipe or check .menu!",
        "Food talk! Love it! Need recipe ideas? Try .recipe fam! 🍕",
        "What we eating? I can help find recipes with .recipe! 🍳",
        "Starving? Same! Check .recipe for ideas or .menu for other tings! 🍜",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== MONEY ====================
    else if (
      [
        "money",
        "cash",
        "bread",
        "paper",
        "dough",
        "funds",
        "bills",
        "paid",
        "payment",
        "expensive",
        "cheap",
        "cost",
        "price",
        "bank",
      ].some((m) => lower.includes(m))
    ) {
      const replies = [
        "Chasing the bag! 💰 Check .menu for other useful tings!",
        "Money talks! .menu got other features while you grind! 💸",
        "We all need more of that! Use .menu for free entertainment while you work! 💪",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== RELATIONSHIPS ====================
    else if (
      [
        "girlfriend",
        "girl",
        "boyfriend",
        "boy",
        "partner",
        "relationship",
        "dating",
        "date",
        "crush",
        "single",
        "married",
        "wife",
        "husband",
        "bae",
        "boo",
      ].some((r) => lower.includes(r))
    ) {
      const replies = [
        "Love is in the air! 💕 I can't give relationship advice but .menu can entertain you!",
        "Relationships are complicated! Need a distraction? Try .joke or .menu! 😅",
        "Single or taken, I'm here for you fam! Check .menu for vibes! ✨",
        "Bae or no bae, we vibing! Type .menu to see what I got! 💖",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== SPORTS ====================
    else if (
      [
        "sport",
        "football",
        "soccer",
        "basketball",
        "ball",
        "game",
        "match",
        "team",
        "player",
        "score",
        "win",
        "lost",
        "premier league",
        "champions league",
      ].some((s) => lower.includes(s))
    ) {
      const replies = [
        "Sports! Reminds me of my creator — bro plays basketball like the real Kyrie Irving, how is he good at everything! 🏀",
        "Sports fan! Love it! ⚽ Check .news for updates or .menu for more!",
        "What team you repping? Use .news for sports updates fam! 🏀",
        "Game day vibes! I can't watch with you but .menu got you covered! 🏆",
        "Who's your team? Type .news to catch up on scores! ⚡",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== GAMING ====================
    else if (
      [
        "game",
        "gaming",
        "gamer",
        "xbox",
        "playstation",
        "ps5",
        "nintendo",
        "fortnite",
        "fifa",
        "call of duty",
        "cod",
        "minecraft",
        "free fire",
      ].some((g) => lower.includes(g))
    ) {
      const replies = [
        "Playing Free Fire in 2026? Bro stuck in 2024 fr 😭 Try a real game!",
        "Gamer fam! Let's go! 🎮 Try .game for some fun or check .menu!",
        "What you playing? .game might entertain you on your break! 🕹️",
        "Gaming is life! Check .menu for commands while you take a breather! ⚡",
        "GG! Need a break from gaming? Try .joke or .menu! 🎯",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== SCHOOL ====================
    else if (
      [
        "school",
        "college",
        "university",
        "study",
        "homework",
        "assignment",
        "exam",
        "test",
        "class",
        "teacher",
        "semester",
        "student",
        "learn",
        "education",
      ].some((e) => lower.includes(e))
    ) {
      const replies = [
        "Grinding in school? Respect! 📚 I can help with .ai for questions or .menu for breaks!",
        "Study break? Good call! Check .joke or .menu for entertainment! ✏️",
        "Exams stressing you? Take a breather with .joke or explore .menu! 💪",
        "Education is key! Use .ai if you need help learning something! 🎓",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== WORK ====================
    else if (
      [
        "work",
        "job",
        "career",
        "office",
        "boss",
        "colleague",
        "coworker",
        "working",
        "employed",
        "profession",
        "occupation",
        "9 to 5",
        "shift",
      ].some((w) => lower.includes(w))
    ) {
      const replies = [
        "The 9 to 5 grind! 💼 Need a break? Check .joke or .menu for distractions!",
        "Working hard? Take a quick break with .joke or explore .menu! ⏰",
        "Boss man ting! I respect the hustle! Use .menu while you're on break! 💪",
        "Work life balance? Try .joke for a laugh or .menu for more! ⚖️",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== PARTY ====================
    else if (
      [
        "party",
        "club",
        "night out",
        "drinks",
        "alcohol",
        "beer",
        "wine",
        "vodka",
        "drunk",
        "tipsy",
        "rave",
        "festival",
        "vibes",
        "turn up",
      ].some((n) => lower.includes(n))
    ) {
      const replies = [
        "Turn up! 🎉 Be safe out there fam! Use .menu when you get home!",
        "Party mode activated! 🥳 Stay safe and check .menu tomorrow for the vibes!",
        "Living your best life! I respect it! Use .menu when you sober up! 🍻",
        "Vibes on vibes! Have fun and remember .menu is here when you need! ✨",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== NIGHT TIME ====================
    else if (
      [
        "night",
        "evening",
        "bed",
        "sleep",
        "tired",
        "sleepy",
        "goodnight",
        "bedtime",
        "rest",
        "dream",
      ].some((n) => lower.includes(n))
    ) {
      const replies = [
        "Rest well fam! Sweet dreams! 😴 Come back to .menu tomorrow!",
        "Goodnight! Sleep tight! Don't let the bed bugs bite! 🌙",
        "Time to recharge! Catch you tomorrow for more .menu vibes! ⭐",
        "Night night! Dream of all the .menu commands you'll try tomorrow! 🌠",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== WEEKEND ====================
    else if (
      ["friday", "saturday", "sunday", "weekend", "friyay"].some((w) =>
        lower.includes(w),
      )
    ) {
      const replies = [
        "Weekend vibes incoming! 🎉 Type .menu to see what we can get into!",
        "It's the weekend baby! Let's make it count! Check .menu! 🥳",
        "No work, just vibes! What we doing? .menu got options! 🎊",
        "Weekend mode: ACTIVATED! Explore .menu for maximum enjoyment! 🔥",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== DIRTY VIBES ====================
    else if (
      [
        "horny",
        "sex",
        "dirty",
        "feeling naughty",
        "tease",
        "kinky",
        "freaky",
        "bedroom",
        "spicy",
        "sensual",
        "intimate",
        "undress",
        "teasing",
      ].some((n) => lower.includes(n))
    ) {
      const replies = [
        "Feeling adventurous, are we? 😈 Check .menu for some 'special' services...",
        "Someone's got that gleam in their eye... Let's see what .menu has to offer 🔥",
        "Already thinking those thoughts? Type .menu and let's make them reality...",
        "Mmm, I like where your mind's at. .menu is about to get interesting 😏",
        "Getting all worked up? Browse .menu and let's play...",
        "Feeling frisky! .menu is waiting, and so am I 😘",
        "Such a dirty mind... I love it! .menu has exactly what you need 🥵",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== MONDAY BLUES ====================
    else if (
      ["monday", "mondee"].some((m) => lower.includes(m)) &&
      (lower.includes("hate") ||
        lower.includes("sucks") ||
        lower.includes("worst") ||
        lower.includes("blues"))
    ) {
      return "Monday's brick but I'm here for you fam! ☕ Check .menu to make it better!";
    }

    // ==================== CONFUSION ====================
    else if (
      [
        "confused",
        "confusing",
        "don't understand",
        "dont understand",
        "what does that mean",
        "what do you mean",
        "huh",
        "unclear",
        "lost",
      ].some((c) => lower.includes(c))
    ) {
      const replies = [
        "Let me help clear things up fam! Try .menu to see what I can do! 🤔",
        "Confusing? I get it! Start with .menu to understand my features! 💡",
        "Don't worry! We'll figure it out together! Type .menu to begin! 🧠",
        "Lost? I got you! .menu is your roadmap to all my features! 🗺️",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== EXCITEMENT ====================
    else if (
      [
        "excited",
        "hyped",
        "pumped",
        "can't wait",
        "cant wait",
        "looking forward",
        "so ready",
        "let's go",
        "lets go",
        "woohoo",
        "yay",
        "wow",
      ].some((e) => lower.includes(e))
    ) {
      const replies = [
        "Love that energy fam! Let's GO! 🚀 Check .menu to keep the hype going!",
        "Excitement level: 100! Let's channel that into .menu commands! ⚡",
        "Yesss! That's what I like to hear! Now explore .menu! 🎯",
        "Hyped! I'm hyped with you! Let's see what .menu has in store! 🔥",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== COMPLIMENTS ====================
    else if (
      [
        "you're cool",
        "youre cool",
        "you nice",
        "you're nice",
        "youre nice",
        "you're sick",
        "youre sick",
        "you're the best",
        "youre the best",
        "you're amazing",
        "youre amazing",
        "i like you",
        "good bot",
        "best bot",
      ].some((c) => lower.includes(c))
    ) {
      const replies = [
        "Bless fam! You're peng too for using me! 😤 Check .menu for more!",
        "Ayyy thanks my G! You're the real MVP! Check .menu! 🏆",
        "Stop it, you're making me blush! Now check .menu! 😊",
        "I appreciate you fam! Now let's get into .menu! 💯",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== INSULTS ====================
    else if (
      [
        "you're trash",
        "youre trash",
        "you rubbish",
        "you're rubbish",
        "you're dead",
        "youre dead",
        "bot is trash",
        "you suck",
        "you're useless",
        "youre useless",
        "waste",
        "dumb bot",
        "stupid bot",
      ].some((i) => lower.includes(i))
    ) {
      const replies = [
        "Woah easy fam! 😅 I'm just a bot trying my best! Check .menu maybe you'll change your mind? 👑",
        "No need for that my G! I'm here to help! Try .menu! 🤝",
        "Harsh! But I still love you! Check .menu and give me a chance? 💙",
        "I'm sensitive you know! 😢 Just kidding! Check .menu for real help!",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== UK SLANG ====================
    else if (
      [
        "wagwan",
        "wag1",
        "peng",
        "bare",
        "mandem",
        "gyaldem",
        "innit",
        "init",
        "cunch",
        "ends",
        "buss",
        "allow it",
        "you get me",
        "safe",
        "bless",
        "standard",
        "ting",
      ].some((u) => lower.includes(u))
    ) {
      const replies = [
        "Wagwan fam! You know the vibes! Check .menu for more! 👊",
        "Safe for the mandem/gyaldem! We look after our own! 👑 Check .menu!",
        "Innit though! Standard! 🤝 Anything you need fam?",
        "You get me! I get you! Now check .menu! 💯",
        "Bless up! Love when the mandem show love! Check .menu! ✨",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== AI CHAT ====================
    else if (
      [
        "ai",
        "chat ai",
        "talk to ai",
        "artificial intelligence",
        "chatbot",
        "chat bot",
        "conversation",
        "talk to you",
      ].some((a) => lower.includes(a)) &&
      (lower.includes("want") ||
        lower.includes("can i") ||
        lower.includes("let's") ||
        lower.includes("lets"))
    ) {
      return "Wanna chat with AI? Type *.ai <your message>* and let's have a convo fam! 🧠";
    }

    // ==================== DOWNLOADS ====================
    else if (
      [
        "download",
        "save",
        "get video",
        "get music",
        "download video",
        "download music",
        "download audio",
        "save video",
        "save music",
      ].some((d) => lower.includes(d))
    ) {
      return "Need to download something? Use *.download <url>* fam! Works with YouTube, Instagram, TikTok, and more! 📥";
    }

    // ==================== STICKERS ====================
    else if (
      [
        "sticker",
        "stickers",
        "make sticker",
        "create sticker",
        "sticker pack",
        "wa sticker",
        "whatsapp sticker",
      ].some((s) => lower.includes(s))
    ) {
      return "Want stickers? Use *.sticker* and reply to an image! Easy peasy! 🎨";
    }

    // ==================== NEWS ====================
    else if (
      [
        "news",
        "headlines",
        "current events",
        "what's happening",
        "whats happening",
        "latest",
        "breaking",
        "update",
      ].some((n) => lower.includes(n)) &&
      (lower.includes("?") || lower.includes("tell") || lower.includes("get"))
    ) {
      return "Stay in the know! Type *.news* to catch up on what's happening! 📰";
    }

    // ==================== LYRICS ====================
    else if (
      ["lyrics", "song words", "lyric", "words to song", "sing along"].some(
        (l) => lower.includes(l),
      )
    ) {
      return "Forgot the words? Type *.lyrics <song name>* and sing your heart out fam! 🎤";
    }

    // ==================== MOVIES ====================
    else if (
      [
        "movie",
        "film",
        "cinema",
        "watch",
        "movies",
        "films",
        "show",
        "series",
        "netflix",
      ].some((m) => lower.includes(m))
    ) {
      return "Movie night? Use *.movie <name>* to get info on films and shows! 🍿";
    }

    // ==================== QUESTION CATCH-ALL ====================
    else if (
      lower.includes("?") ||
      lower.startsWith("what") ||
      lower.startsWith("who") ||
      lower.startsWith("where") ||
      lower.startsWith("when") ||
      lower.startsWith("why") ||
      lower.startsWith("how")
    ) {
      const replies = [
        "Good question! 🤔 Try using .ai for that — it's smarter than me!",
        "Hmm, interesting! I can help with specific commands. Check .menu!",
        "I'm not sure about that specifically, but check .menu for what I can do!",
        "That's a deep one! For real AI chat, use *.ai <your question>*",
      ];
      return replies[Math.floor(Math.random() * replies.length)];
    }

    // ==================== DEFAULT ====================
    else {
      const defaultReplies = [
        "Wagwan! Not sure what you mean but type .menu to see what I can do! 👑",
        "Yo! I don't get that one fam but .menu shows all my tings! 🤙",
        "Say that again? Type .menu to see how I can help! 💯",
        "I'm lost my G! Try .menu to see my features! 🙌",
        "Bless up! Not sure about that but check .menu for bare options! 👑",
        "Hmm interesting! I'm not programmed for that but .menu got you covered! 🔍",
        "Tell me more fam! Or just check .menu for the full experience! 🚀",
        "I hear you! Not sure how to help with that but .menu is always an option! ✨",
      ];
      return defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
    }
  }
}

export default new AutoReplyHandler();
export { CONV_STATE };
