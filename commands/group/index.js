// Explicit exports instead of export *
import * as automationModule from "./automation.js";
import * as basicModule from "./basic.js";
import * as coreModule from "./core.js";
import * as moderationModule from "./moderation.js";
import * as settingsModule from "./settings.js";

export const core = coreModule;
export const moderation = moderationModule;
export const settings = settingsModule;
export const automation = automationModule;
export const basic = basicModule;
