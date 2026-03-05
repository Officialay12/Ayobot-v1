import { ENV } from "../index.js";

export const PREFIX = ENV.PREFIX;
export const BOT_NAME = ENV.BOT_NAME;
export const BOT_VERSION = ENV.BOT_VERSION;

export const CONV_STATE = {
  IDLE: "idle",
  ACTIVE: "active",
  AWAITING_REPLY: "awaiting_reply",
};

export const RATE_LIMIT_WINDOW = 2000;
export const MAX_COMMANDS_PER_WINDOW = 1;
export const SPAM_TIME_WINDOW = 4000;
export const MAX_SPAM_MESSAGES = 3;
export const MAX_SIMILAR_MESSAGES = 2;

export const RATE_LIMIT_MESSAGES = [
  "⏳ *CHILL BRO!* Take a breath!",
  "🧘 *ONE AT A TIME!* Slow down!",
  "⚡ *EASY DOES IT!* Wait a moment!",
  "🎯 *PATIENCE!* Commands need spacing!",
  "🌟 *BREATHE!* You're going too fast!",
];

export const TTS_VOICES = {
  joanna: { code: "en-US-Joanna", name: "Joanna", accent: "American" },
  matthew: { code: "en-US-Matthew", name: "Matthew", accent: "American" },
  emma: { code: "en-GB-Emma", name: "Emma", accent: "British" },
  brian: { code: "en-GB-Brian", name: "Brian", accent: "British" },
  nicole: { code: "en-AU-Nicole", name: "Nicole", accent: "Australian" },
  en: { code: "en", name: "English", accent: "American" },
  us: { code: "en-us", name: "US English", accent: "American" },
  uk: { code: "en-gb", name: "UK English", accent: "British" },
};

export const LOCAL_SONGS = {
  "shape of you": "JGwWNGJdvx8",
  perfect: "2Vv-BfVoq4g",
  "love yourself": "oyEuk8j8imI",
  sorry: "fRh_vgS2dFE",
  "blinding lights": "fHI8X4OXluQ",
  "save your tears": "XXYlFuWEuKI",
  "lose yourself": "xFYQQQQl1qY",
  hello: "YQHsXMglC9A",
  "someone like you": "hLQl3WQQoQ0",
  despacito: "kJQP7kiw5Fk",
  "see you again": "RgKAFK5djSk",
};

export const LOCAL_MOVIES = {
  inception: {
    title: "Inception",
    year: "2010",
    rating: "8.8",
    runtime: "148 min",
    genre: "Action, Adventure, Sci-Fi",
    overview:
      "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    director: "Christopher Nolan",
    cast: "Leonardo DiCaprio, Joseph Gordon-Levitt, Ellen Page",
    poster: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
  },
  "dark knight": {
    title: "The Dark Knight",
    year: "2008",
    rating: "9.0",
    runtime: "152 min",
    genre: "Action, Crime, Drama",
    overview:
      "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
    director: "Christopher Nolan",
    cast: "Christian Bale, Heath Ledger, Aaron Eckhart",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  },
  avatar: {
    title: "Avatar",
    year: "2009",
    rating: "7.8",
    runtime: "162 min",
    genre: "Action, Adventure, Fantasy",
    overview:
      "A paraplegic Marine dispatched to the moon Pandora on a unique mission becomes torn between following his orders and protecting the world he feels is his home.",
    director: "James Cameron",
    cast: "Sam Worthington, Zoe Saldana, Sigourney Weaver",
    poster: "https://image.tmdb.org/t/p/w500/kyeqWdyUXW608IyY3s436kTtiDf.jpg",
  },
};

export const COMMON_MISTAKES = {
  teh: "the",
  recieve: "receive",
  wierd: "weird",
  seperate: "separate",
  definately: "definitely",
  goverment: "government",
  occured: "occurred",
  alot: "a lot",
  cant: "can't",
  dont: "don't",
  wont: "won't",
  didnt: "didn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  doesnt: "doesn't",
  "i'm": "I'm",
  "i've": "I've",
  "i'll": "I'll",
  "i'd": "I'd",
};

export { ENV };
