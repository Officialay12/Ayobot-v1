#!/usr/bin/env node
// run with: node patch_refresh.js
// Place this file in the same folder as index.js and run it once.
// It will update index.js in-place with 60s refresh timers. — AYOCODES

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "index.js");
let code = fs.readFileSync(filePath, "utf8");

let changeCount = 0;

function replace(find, replacement, label) {
  if (code.includes(find)) {
    code = code.replace(find, replacement);
    console.log(`✅ Patched: ${label}`);
    changeCount++;
  } else {
    console.warn(`⚠️  Not found (already patched?): ${label}`);
  }
}

// ── CHANGE 1 & 2: Connect page visible countdown + JS timer ──────────────────
replace(
  `<span id="rc">10</span>s`,
  `<span id="rc">60</span>s`,
  "Connect page countdown label (10 → 60)",
);

replace(
  `let rc=10;\n  setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);`,
  `let rc=60;\n  setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);`,
  "Connect page JS timer (10 → 60)",
);

// ── CHANGE 3: Connection poll interval 3s → 60s ───────────────────────────────
replace(
  `  setInterval(()=>{
    fetch('/api/status').then(r=>r.json()).then(d=>{
      if(d.connected)location.reload();
    }).catch(()=>{});
  },3000);`,
  `  setInterval(()=>{
    fetch('/api/status').then(r=>r.json()).then(d=>{
      if(d.connected)location.reload();
    }).catch(()=>{});
  },60000);`,
  "Status poll interval (3000ms → 60000ms)",
);

// ── CHANGE 4: Starting/spinner page countdown 3s → 60s ───────────────────────
replace(
  `<script>let rc=3;setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);</script>`,
  `<script>let rc=60;setInterval(()=>{rc--;const e=document.getElementById('rc');if(e)e.textContent=rc;if(rc<=0)location.reload();},1000);</script>`,
  "Starting page countdown (3 → 60)",
);

// ── Write back ────────────────────────────────────────────────────────────────
fs.writeFileSync(filePath, code, "utf8");
console.log(`\n✨ Done — ${changeCount}/4 changes applied to index.js`);
console.log("Restart your bot for changes to take effect.");
