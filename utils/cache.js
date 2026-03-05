const apiCache = new Map();
const aiCache = new Map();
const userCache = new Map();
const mediaCache = new Map();

export function set(key, data, cacheType = 'api') {
    const cache = getCache(cacheType);
    cache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

export function get(key, cacheType = 'api') {
    const cache = getCache(cacheType);
    const cached = cache.get(key);

    if (!cached) return null;

    // Check if cache is expired (default 5 minutes for api, 30 minutes for others)
    const expiry = cacheType === 'api' ? 300000 : 1800000;
    if (Date.now() - cached.timestamp > expiry) {
        cache.delete(key);
        return null;
    }

    return cached.data;
}

export function has(key, cacheType = 'api') {
    const cache = getCache(cacheType);
    return cache.has(key);
}

export function deleteKey(key, cacheType = 'api') {
    const cache = getCache(cacheType);
    cache.delete(key);
}

export function clear(cacheType = 'all') {
    if (cacheType === 'all') {
        apiCache.clear();
        aiCache.clear();
        userCache.clear();
        mediaCache.clear();
    } else {
        const cache = getCache(cacheType);
        cache.clear();
    }
}

export function getStats() {
    return {
        api: apiCache.size,
        ai: aiCache.size,
        user: userCache.size,
        media: mediaCache.size,
        total: apiCache.size + aiCache.size + userCache.size + mediaCache.size
    };
}

export function cleanup() {
    const now = Date.now();

    // Clean api cache (5 minutes)
    for (const [key, value] of apiCache.entries()) {
        if (now - value.timestamp > 300000) {
            apiCache.delete(key);
        }
    }

    // Clean ai cache (30 minutes)
    for (const [key, value] of aiCache.entries()) {
        if (now - value.timestamp > 1800000) {
            aiCache.delete(key);
        }
    }

    // Clean user cache (1 hour)
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > 3600000) {
            userCache.delete(key);
        }
    }

    // Clean media cache (10 minutes)
    for (const [key, value] of mediaCache.entries()) {
        if (now - value.timestamp > 600000) {
            mediaCache.delete(key);
        }
    }
}

function getCache(cacheType) {
    switch(cacheType) {
        case 'ai': return aiCache;
        case 'user': return userCache;
        case 'media': return mediaCache;
        default: return apiCache;
    }
}

// Auto cleanup every 5 minutes
setInterval(cleanup, 300000);
