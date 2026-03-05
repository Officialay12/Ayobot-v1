export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours%24}h ${minutes%60}m`;
    if (hours > 0) return `${hours}h ${minutes%60}m ${seconds%60}s`;
    if (minutes > 0) return `${minutes}m ${seconds%60}s`;
    return `${seconds}s`;
}

export function normalizeToJid(identifier) {
    if (!identifier) return '';
    if (identifier.includes('@')) {
        return identifier;
    }
    return `${identifier}@s.whatsapp.net`;
}

export function getRandomEmoji(emojis = ['✨', '🔥', '🚀', '💫', '🎯', '⚡', '🌟', '🎨', '💎']) {
    return emojis[Math.floor(Math.random() * emojis.length)];
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

export function truncateText(text, length = 100) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

export function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function getCurrentDate() {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function parseTime(timeString) {
    const time = timeString.toLowerCase().trim();
    const match = time.match(/(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|day|days?)/);

    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch(unit.charAt(0)) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}
// utils/helpers.js - Time helper functions

export function formatDuration(ms) {
    if (ms < 0) return 'Overdue';
    if (ms === 0) return 'Now';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
}
