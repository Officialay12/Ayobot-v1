// utils/baileys-logger.js - DEDICATED LOGGER FOR BAILEYS
import pino from 'pino';

// Create a REAL Pino logger instance
const pinoLogger = pino({
    level: 'silent',
    transport: undefined
});

// Create a logger that has EVERYTHING Baileys needs
const baileysLogger = {
    // Level property
    level: 'silent',

    // All logging methods that return 'this' for chaining
    trace: function(...args) {
        // Silently ignore - Baileys logs too much
        return this;
    },

    debug: function(...args) {
        return this;
    },

    info: function(...args) {
        return this;
    },

    warn: function(...args) {
        return this;
    },

    error: function(...args) {
        return this;
    },

    fatal: function(...args) {
        return this;
    },

    // THE CRITICAL METHOD - Must return a logger with the same methods
    child: function(bindings = {}) {
        // Return a NEW logger with all the same methods
        const childLogger = {
            level: 'silent',
            trace: () => childLogger,
            debug: () => childLogger,
            info: () => childLogger,
            warn: () => childLogger,
            error: () => childLogger,
            fatal: () => childLogger,
            child: () => childLogger,
            bindings: () => bindings
        };
        return childLogger;
    },

    bindings: function() {
        return {};
    }
};

export default baileysLogger;
