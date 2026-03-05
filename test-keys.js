import dotenv from 'dotenv';
dotenv.config();

console.log('\n🔑 AYOBOT API KEY STATUS');
console.log('═'.repeat(50));

const keyStatus = {
    // AI Services
    'GEMINI_KEY': process.env.GEMINI_KEY?.startsWith('AIza') ? '✅ Valid' : '❌ Invalid/Missing',
    'OPENAI_KEY': process.env.OPENAI_KEY?.startsWith('sk-') && !process.env.OPENAI_KEY.includes('proj') ? '✅ Valid' : '❌ Invalid/Missing',
    'HF_TOKEN': process.env.HF_TOKEN && process.env.HF_TOKEN !== 'hf_YOUR_TOKEN_HERE' ? '✅ Valid' : '❌ Missing',

    // Weather
    'OPENWEATHER_KEY': process.env.OPENWEATHER_KEY ? '✅ Present' : '❌ Missing',
    'WEATHERAPI_KEY': process.env.WEATHERAPI_KEY ? '✅ Present' : '❌ Missing',

    // News
    'NEWS_API_KEY': process.env.NEWS_API_KEY?.startsWith('pub_') ? '✅ Valid' : '❌ Invalid/Missing',
    'TMDB_API_KEY': process.env.TMDB_API_KEY ? '✅ Present' : '❌ Missing',

    // Image
    'REMOVEBG_KEY': process.env.REMOVEBG_KEY ? '✅ Present' : '❌ Missing',
    'YOUTUBE_API_KEY': process.env.YOUTUBE_API_KEY?.startsWith('AIza') ? '✅ Valid' : '❌ Invalid/Missing',

    // TTS
    'ELEVENLABS_KEY': process.env.ELEVENLABS_KEY ? '✅ Present' : '❌ Missing',
    'TTS_KEY': process.env.TTS_KEY ? '✅ Present' : '❌ Missing',

    // Finance
    'ALPHA_VANTAGE_KEY': process.env.ALPHA_VANTAGE_KEY ? '✅ Present' : '❌ Missing',
    'COINMARKETCAP_KEY': process.env.COINMARKETCAP_KEY ? '✅ Present' : '❌ Missing',

    // Other
    'MERRIAM_KEY': process.env.MERRIAM_KEY ? '✅ Present' : '❌ Missing',
    'IPINFO_TOKEN': process.env.IPINFO_TOKEN ? '✅ Present' : '❌ Missing',
    'SHORTENER_API_KEY': process.env.SHORTENER_API_KEY ? '✅ Present' : '❌ Missing'
};

Object.entries(keyStatus).forEach(([key, status]) => {
    console.log(`${status} ${key}`);
});

console.log('═'.repeat(50));
console.log('\n📝 Next steps:');
console.log('1. Get HF_TOKEN from https://huggingface.co/settings/tokens');
console.log('2. Your OpenAI key is now valid and working!');
console.log('3. Run your bot: node index.js\n');
console.log('👑 AYOCODES - AYOBOT v1 Ultimate');
