// keepalive.js
import https from 'https';

const URL = process.env.RENDER_EXTERNAL_URL || 'https://ayobot-v1-wo21.onrender.com';
const INTERVAL = 4 * 60 * 1000; // 4 minutes

function ping() {
  https.get(`${URL}/health`, (res) => {
    console.log(`[KeepAlive] ${res.statusCode} - ${new Date().toISOString()}`);
  }).on('error', (err) => {
    console.error(`[KeepAlive] Error: ${err.message}`);
  });
}

// Ping immediately on start
ping();

// Then ping every 4 minutes
setInterval(ping, INTERVAL);
