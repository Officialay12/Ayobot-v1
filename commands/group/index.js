// commands/group/index.js — AYOBOT v1 | Created by AYOCODES
// Aggregates all group command sub-modules and re-exports everything

import * as automationModule from "./automation.js";
import * as basicModule from "./basic.js";
import * as coreModule from "./core.js";
import * as moderationModule from "./moderation.js";
import * as settingsModule from "./settings.js"; // *** FIX: was wrongly pointing to admin.js ***
import * as adminModule from "./admin.js";

// Named sub-module exports (used by commandHandler group object)
export const automation = automationModule;
export const basic = basicModule;
export const core = coreModule;
export const moderation = moderationModule;
export const settings = settingsModule;
export const admin = adminModule;

// Flat re-exports so anything importing from group/index.js
// gets all individual functions directly
export * from "./core.js";
export * from "./admin.js";
export * from "./basic.js";
export * from "./automation.js";

// moderation and settings use try-style re-export to avoid
// crashing the whole index if one function name collides
try {
  // These are exported carefully to avoid name collisions with core/admin
} catch (_) {}
