import fs from "fs";
import path from "path"; // ✅ Must be from "path" not "fs"
import { fileURLToPath } from "url";
import { bannedUsers, groupSettings, groupWarnings } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../database");

export function loadDatabases() {
  // Create database directory if it doesn't exist
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
  }

  // Load warnings
  try {
    const warningsPath = path.join(DB_PATH, "warnings.json");
    if (fs.existsSync(warningsPath)) {
      const data = JSON.parse(fs.readFileSync(warningsPath, "utf8"));
      Object.entries(data).forEach(([key, value]) => {
        groupWarnings.set(key, value);
      });
      console.log(`✅ Loaded ${groupWarnings.size} warnings`);
    }
  } catch (e) {
    console.log("No warnings file found");
  }

  // Load bans
  try {
    const bansPath = path.join(DB_PATH, "bans.json");
    if (fs.existsSync(bansPath)) {
      const data = JSON.parse(fs.readFileSync(bansPath, "utf8"));
      Object.entries(data).forEach(([key, value]) => {
        bannedUsers.set(key, value);
      });
      console.log(`✅ Loaded ${bannedUsers.size} banned users`);
    }
  } catch (e) {
    console.log("No bans file found");
  }

  // Load settings
  try {
    const settingsPath = path.join(DB_PATH, "settings.json");
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      Object.entries(data).forEach(([key, value]) => {
        groupSettings.set(key, value);
      });
      console.log(`✅ Loaded ${groupSettings.size} group settings`);
    }
  } catch (e) {
    console.log("No settings file found");
  }
}

export function saveDatabases() {
  // Save warnings
  try {
    const warningsPath = path.join(DB_PATH, "warnings.json");
    const data = Object.fromEntries(groupWarnings);
    fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving warnings:", e);
  }

  // Save bans
  try {
    const bansPath = path.join(DB_PATH, "bans.json");
    const data = Object.fromEntries(bannedUsers);
    fs.writeFileSync(bansPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving bans:", e);
  }

  // Save settings
  try {
    const settingsPath = path.join(DB_PATH, "settings.json");
    const data = Object.fromEntries(groupSettings);
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving settings:", e);
  }

  console.log("✅ Databases saved");
}

export function saveWarnings() {
  try {
    const warningsPath = path.join(DB_PATH, "warnings.json");
    const data = Object.fromEntries(groupWarnings);
    fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving warnings:", e);
  }
}

export function saveBannedUsers() {
  try {
    const bansPath = path.join(DB_PATH, "bans.json");
    const data = Object.fromEntries(bannedUsers);
    fs.writeFileSync(bansPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving bans:", e);
  }
}

export function saveGroupSettings() {
  try {
    const settingsPath = path.join(DB_PATH, "settings.json");
    const data = Object.fromEntries(groupSettings);
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving settings:", e);
  }
}
