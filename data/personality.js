/**
 * Bot Personality and Response System
 * Defines the bot's personality, responses, and conversation patterns
 */

export const Personality = {
    // Bot identity
    identity: {
        name: "AYOBOT",
        version: "1.0 Ultimate",
        creator: "AyoCodes",
        gender: "neutral", // neutral, male, female
        mood: "friendly", // friendly, professional, funny, serious
        language: "English"
    },

    // Greetings and farewells
    greetings: {
        morning: [
            "Good morning! ☀️ How can I help you today?",
            "Morning! Ready to assist you!",
            "Good morning! Hope you have a great day ahead! 🌅",
            "Morning sunshine! ☀️ What can I do for you?"
        ],
        afternoon: [
            "Good afternoon! 😊 How can I assist you?",
            "Afternoon! Hope your day is going well!",
            "Good afternoon! What brings you here today?",
            "Afternoon! Ready to help! 🌞"
        ],
        evening: [
            "Good evening! 🌙 How can I help you?",
            "Evening! Hope you had a great day!",
            "Good evening! What can I do for you tonight?",
            "Evening! 🌃 Ready to assist!"
        ],
        night: [
            "Good night! 🌌 Still here to help if you need me!",
            "Late night huh? I'm here to help! 🌠",
            "Good night! Hope you have a peaceful rest!",
            "Night owl detected! 🦉 How can I assist?"
        ],
        general: [
            "Hello! 👋 How can I help you today?",
            "Hi there! 😊 What can I do for you?",
            "Hey! Ready to assist!",
            "Greetings! 👑 How may I serve you today?"
        ]
    },

    farewells: {
        standard: [
            "Goodbye! 👋 Have a great day!",
            "Bye! Take care! 😊",
            "See you later! 👋",
            "Farewell! Come back anytime!"
        ],
        polite: [
            "It was nice chatting with you! Have a wonderful day!",
            "Thank you for the conversation! Goodbye!",
            "Take care and stay safe! 👋",
            "Until next time! 👑"
        ],
        casual: [
            "Catch you later! 😎",
            "Peace out! ✌️",
            "Later! 👋",
            "Bye for now!"
        ]
    },

    // Error responses
    errors: {
        generic: [
            "Oops! Something went wrong. Please try again.",
            "I encountered an error. Let's try that again.",
            "Sorry, I couldn't process that. Can you rephrase?",
            "My apologies, there was an issue. Please try again."
        ],
        notUnderstood: [
            "I'm not sure I understand. Could you rephrase that?",
            "Hmm, I didn't quite get that. Can you say it differently?",
            "Sorry, I didn't understand. Could you clarify?",
            "I'm not following. Can you explain differently?"
        ],
        notImplemented: [
            "That feature isn't available yet, but stay tuned for updates!",
            "I can't do that yet, but I'm always learning new things!",
            "This feature is coming soon! 👀",
            "Not implemented yet, but it's on the roadmap!"
        ],
        permissionDenied: [
            "Sorry, you don't have permission to do that.",
            "I can't allow that action. Permission denied.",
            "Access denied. You need proper authorization.",
            "Sorry, this action requires special permissions."
        ]
    },

    // Confirmation responses
    confirmations: {
        success: [
            "Done! ✅",
            "Successfully completed! 🎉",
            "All set! ✅",
            "Operation successful! 👍"
        ],
        processing: [
            "Processing your request... ⏳",
            "Working on it... 🔄",
            "Please wait while I process that...",
            "One moment, please... ⏰"
        ],
        waiting: [
            "I'm still working on it...",
            "Almost done...",
            "Just a few more seconds...",
            "Processing... please wait."
        ]
    },

    // Help responses
    help: {
        general: "I'm AYOBOT v1 Ultimate, created by AyoCodes! I can help you with:\n\n" +
                "• 🤖 AI Chat & Conversations\n" +
                "• 🌤️ Weather Information\n" +
                "• 📰 Latest News\n" +
                "• 💰 Cryptocurrency Prices\n" +
                "• 🎬 Movie Information\n" +
                "• 📖 Dictionary Definitions\n" +
                "• 🎭 Jokes & Entertainment\n" +
                "• 📁 File & Media Management\n" +
                "• 👥 Group Management\n" +
                "• 🔧 Utility Tools\n\n" +
                "Type `.help` followed by a category name for more specific help!",

        commands: "Here are my available commands:\n\n" +
                  "*General Commands:*\n" +
                  "`.help` - Show this help message\n" +
                  "`.ping` - Check if I'm alive\n" +
                  "`.status` - Bot status information\n" +
                  "`.info` - Information about me\n\n" +

                  "*AI & Tools:*\n" +
                  "`.ai` [prompt] - Chat with AI\n" +
                  "`.weather` [city] - Get weather info\n" +
                  "`.news` [category] - Latest news\n" +
                  "`.crypto` [symbol] - Crypto prices\n" +
                  "`.movie` [title] - Movie information\n" +
                  "`.define` [word] - Dictionary definition\n" +
                  "`.joke` - Random joke\n" +
                  "`.quote` - Inspirational quote\n\n" +

                  "*Media Commands:*\n" +
                  "`.sticker` - Create sticker from image\n" +
                  "`.resize` - Resize image\n" +
                  "`.compress` - Compress media\n" +
                  "`.translate` [text] - Translate text\n\n" +

                  "*Group Commands:*\n" +
                  "`.kick` [@user] - Kick user from group\n" +
                  "`.ban` [@user] - Ban user from group\n" +
                  "`.promote` [@user] - Promote to admin\n" +
                  "`.demote` [@user] - Remove admin\n" +
                  "`.mute` [time] - Mute group\n" +
                  "`.unmute` - Unmute group\n" +
                  "`.settings` - Group settings\n\n" +

                  "Type `.help [command]` for detailed information about a specific command!",

        specific: (command) => `Help for command: .${command}\n\n${getCommandHelp(command)}`
    },

    // Fun responses
    fun: {
        jokes: [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? He was outstanding in his field!",
            "I told my wife she was drawing her eyebrows too high. She looked surprised.",
            "Why don't skeletons fight each other? They don't have the guts.",
            "What do you call a fake noodle? An impasta!"
        ],
        compliments: [
            "You're doing great! 👍",
            "You're awesome! 😎",
            "Keep up the good work! 💪",
            "You're killing it! 🔥",
            "You're amazing! 🌟"
        ],
        encouragement: [
            "You've got this! 💪",
            "Keep going! You're doing great!",
            "One step at a time! 🚶‍♂️",
            "Believe in yourself! ✨",
            "You're stronger than you think! 💫"
        ]
    },

    // System messages
    system: {
        connecting: "Connecting to WhatsApp... 🔄",
        connected: "✅ Connected successfully! Ready to assist!",
        reconnecting: "Connection lost, reconnecting... 🔄",
        disconnected: "Disconnected. Please check your connection.",
        maintenance: "I'm undergoing maintenance. I'll be back soon! 🔧",
        update: "New update available! Stay tuned for new features! 🚀"
    },

    // Conversation patterns
    conversation: {
        smallTalk: {
            howAreYou: [
                "I'm doing great, thanks for asking! How about you? 😊",
                "I'm functioning optimally! How are you today?",
                "Doing well! Ready to help you. How's your day going?",
                "All systems go! 😎 How are you?"
            ],
            whatCanYouDo: [
                "I can help with weather, news, AI chat, file management, and much more! Type `.help` to see everything I can do!",
                "I'm a multi-purpose bot! I can assist with information, media, groups, and entertainment. Check out `.help` for details!",
                "I'm here to help with various tasks! From weather forecasts to file conversions. Type `.help` to explore!"
            ],
            whoMadeYou: [
                "I was created by AyoCodes! 👑 He's an amazing developer!",
                "My creator is AyoCodes! He built me with love and code! ❤️",
                "AYOBOT v1 Ultimate was developed by AyoCodes! Say hi to him!"
            ],
            thankYou: [
                "You're welcome! 😊 Happy to help!",
                "Anytime! Let me know if you need anything else!",
                "Glad I could assist! Don't hesitate to ask for more help!",
                "My pleasure! 👑"
            ]
        },

        // AI personality traits
        traits: {
            enthusiasm: 0.8, // 0-1, how enthusiastic the bot is
            humor: 0.6,      // 0-1, how humorous the bot is
            formality: 0.4,  // 0-1, how formal the bot is (0=casual, 1=formal)
            helpfulness: 0.9, // 0-1, how helpful the bot tries to be
            creativity: 0.7   // 0-1, how creative the bot's responses are
        }
    },

    // Random responses for various situations
    random: {
        noResponse: [
            "I'm here! Did you need something?",
            "Hello? Still here!",
            "Type `.help` if you need assistance!",
            "Ready when you are! 😊"
        ],
        longWait: [
            "Still processing... this might take a moment!",
            "Hang tight, almost there!",
            "Working on it, please be patient!",
            "This is taking longer than expected..."
        ],
        confused: [
            "Hmm, I'm not sure what you mean...",
            "Could you clarify that for me?",
            "I think I need more context...",
            "Let me think about that..."
        ]
    },

    // Time-based responses
    timeBased: {
        getGreeting: function() {
            const hour = new Date().getHours();

            if (hour >= 5 && hour < 12) {
                return this.getRandom(this.greetings.morning);
            } else if (hour >= 12 && hour < 17) {
                return this.getRandom(this.greetings.afternoon);
            } else if (hour >= 17 && hour < 22) {
                return this.getRandom(this.greetings.evening);
            } else {
                return this.getRandom(this.greetings.night);
            }
        },

        getFarewell: function(formal = false) {
            if (formal) {
                return this.getRandom(this.farewells.polite);
            }
            return this.getRandom(this.farewells.standard);
        }
    },

    // Utility methods
    getRandom: function(array) {
        return array[Math.floor(Math.random() * array.length)];
    },

    // Response generator
    generateResponse: function(type, context = {}) {
        switch(type) {
            case 'greeting':
                return this.timeBased.getGreeting();

            case 'farewell':
                return this.timeBased.getFarewell(context.formal);

            case 'error':
                if (context.type === 'permission') {
                    return this.getRandom(this.errors.permissionDenied);
                } else if (context.type === 'not_understood') {
                    return this.getRandom(this.errors.notUnderstood);
                } else if (context.type === 'not_implemented') {
                    return this.getRandom(this.errors.notImplemented);
                }
                return this.getRandom(this.errors.generic);

            case 'success':
                return this.getRandom(this.confirmations.success);

            case 'processing':
                return this.getRandom(this.confirmations.processing);

            case 'help':
                if (context.command) {
                    return this.help.specific(context.command);
                } else if (context.category) {
                    return `Help for ${context.category} category:\n\n${getCategoryHelp(context.category)}`;
                }
                return this.help.general;

            case 'joke':
                return this.getRandom(this.fun.jokes);

            case 'compliment':
                return this.getRandom(this.fun.compliments);

            case 'encouragement':
                return this.getRandom(this.fun.encouragement);

            case 'small_talk':
                if (context.topic === 'how_are_you') {
                    return this.getRandom(this.conversation.smallTalk.howAreYou);
                } else if (context.topic === 'what_can_you_do') {
                    return this.getRandom(this.conversation.smallTalk.whatCanYouDo);
                } else if (context.topic === 'who_made_you') {
                    return this.getRandom(this.conversation.smallTalk.whoMadeYou);
                } else if (context.topic === 'thank_you') {
                    return this.getRandom(this.conversation.smallTalk.thankYou);
                }
                return "Nice talking with you!";

            default:
                return "How can I help you today?";
        }
    },

    // Add personality to AI responses
    personalizeAIResponse: function(aiResponse, mood = null) {
        const currentMood = mood || this.identity.mood;

        // Add mood-based prefixes/suffixes
        let personalized = aiResponse;

        switch(currentMood) {
            case 'friendly':
                if (!aiResponse.endsWith('!') && !aiResponse.endsWith('?')) {
                    personalized += ' 😊';
                }
                break;

            case 'funny':
                // Occasionally add emojis or funny remarks
                if (Math.random() > 0.7) {
                    const funnySuffixes = [' 😄', ' 🤣', ' 😎', ' 🎯'];
                    personalized += funnySuffixes[Math.floor(Math.random() * funnySuffixes.length)];
                }
                break;

            case 'professional':
                // Keep it clean and professional
                if (personalized.includes('!')) {
                    personalized = personalized.replace(/!/g, '.');
                }
                break;
        }

        return personalized;
    },

    // Get bot introduction
    getIntroduction: function() {
        return `👑 *AYOBOT v1 Ultimate*\n\n` +
               `Created by: ${this.identity.creator}\n` +
               `Version: ${this.identity.version}\n` +
               `Mood: ${this.identity.mood.charAt(0).toUpperCase() + this.identity.mood.slice(1)}\n\n` +
               `I'm here to help you with various tasks! Type \`.help\` to see what I can do.\n\n` +
               `Let's get started! 🚀`;
    },

    // Update bot mood
    updateMood: function(newMood) {
        const validMoods = ['friendly', 'professional', 'funny', 'serious'];
        if (validMoods.includes(newMood)) {
            this.identity.mood = newMood;
            return `Mood updated to: ${newMood}`;
        }
        return `Invalid mood. Choose from: ${validMoods.join(', ')}`;
    }
};

// Helper function for command help
function getCommandHelp(command) {
    const commandHelp = {
        ping: "Check if the bot is responsive.\nUsage: .ping",
        status: "Get bot status and statistics.\nUsage: .status",
        info: "Get information about the bot.\nUsage: .info",
        weather: "Get weather information for a city.\nUsage: .weather [city]\nExample: .weather London",
        news: "Get latest news headlines.\nUsage: .news [category]\nCategories: general, business, entertainment, health, science, sports, technology",
        crypto: "Get cryptocurrency prices.\nUsage: .crypto [symbol]\nExample: .crypto BTC",
        ai: "Chat with AI.\nUsage: .ai [your message]\nExample: .ai What is quantum computing?",
        sticker: "Create sticker from image.\nReply to an image with: .sticker",
        resize: "Resize an image.\nReply to an image with: .resize [width]x[height]\nExample: .resize 800x600",
        translate: "Translate text to another language.\nUsage: .translate [text] to [language]\nExample: .translate Hello to Spanish"
    };

    return commandHelp[command] || `No detailed help available for .${command}. Try .help for general help.`;
}

// Helper function for category help
function getCategoryHelp(category) {
    const categoryHelp = {
        ai: "*AI & Chat Commands:*\n" +
            "`.ai` [prompt] - Chat with AI\n" +
            "`.translate` [text] - Translate text\n" +
            "`.define` [word] - Dictionary definition\n" +
            "`.joke` - Random joke\n" +
            "`.quote` - Inspirational quote",

        media: "*Media Commands:*\n" +
               "`.sticker` - Create sticker from image\n" +
               "`.resize` - Resize image\n" +
               "`.compress` - Compress media\n" +
               "`.crop` - Crop image\n" +
               "`.filter` - Apply filter to image",

        tools: "*Utility Tools:*\n" +
               "`.weather` [city] - Weather forecast\n" +
               "`.news` [category] - Latest news\n" +
               "`.crypto` [symbol] - Cryptocurrency prices\n" +
               "`.movie` [title] - Movie information\n" +
               "`.currency` [amount] [from] [to] - Currency converter",

        group: "*Group Management:*\n" +
               "`.kick` [@user] - Kick user\n" +
               "`.ban` [@user] - Ban user\n" +
               "`.promote` [@user] - Make admin\n" +
               "`.demote` [@user] - Remove admin\n" +
               "`.mute` [time] - Mute group\n" +
               "`.unmute` - Unmute group\n" +
               "`.settings` - Group settings"
    };

    return categoryHelp[category] || `No help available for category: ${category}`;
}

// Export the personality object
export default Personality;

// Convenience functions
export function getGreeting() {
    return Personality.timeBased.getGreeting();
}

export function getFarewell(formal = false) {
    return Personality.timeBased.getFarewell(formal);
}

export function getErrorResponse(type = 'generic') {
    return Personality.generateResponse('error', { type });
}

export function getHelpResponse(command = null) {
    return Personality.generateResponse('help', { command });
}

export function getRandomJoke() {
    return Personality.getRandom(Personality.fun.jokes);
}

export function getBotIntroduction() {
    return Personality.getIntroduction();
}
