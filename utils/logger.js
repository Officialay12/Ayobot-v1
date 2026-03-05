// utils/logger.js - Enhanced Logger Utility
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';
import DailyRotateFile from 'winston-daily-rotate-file';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment-based configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_TO_FILE = process.env.LOG_TO_FILE !== 'false';
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== 'false';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS) || 7;

// Create logs directory
const LOGS_DIR = path.join(__dirname, '../logs');
try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
} catch (error) {
    // Directory already exists or permission issue
}

// Custom formats
const consoleFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, module, user, group, command, ...meta }) => {
        let logMessage = `[${timestamp}]`;

        if (module) logMessage += ` [${module}]`;
        if (level.includes('error')) logMessage += ` 🔴`;
        else if (level.includes('warn')) logMessage += ` 🟡`;
        else if (level.includes('info')) logMessage += ` 🔵`;
        else logMessage += ` ⚪`;

        logMessage += ` ${level}:`;

        if (user) logMessage += ` 👤${user.substring(0, 8)}`;
        if (group) logMessage += ` 👥${group.substring(0, 8)}`;
        if (command) logMessage += ` ⌨️${command}`;

        logMessage += ` ${message}`;

        // Add metadata if present
        const metaKeys = Object.keys(meta).filter(key => !['timestamp', 'level', 'message', 'module', 'user', 'group', 'command'].includes(key));
        if (metaKeys.length > 0) {
            logMessage += ` | ${JSON.stringify(Object.fromEntries(metaKeys.map(key => [key, meta[key]])))}`;
        }

        return logMessage;
    })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Create transports array
const transports = [];

// Console transport (development only or when enabled)
if (LOG_TO_CONSOLE || NODE_ENV !== 'production') {
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: LOG_LEVEL
        })
    );
}

// File transports (when enabled)
if (LOG_TO_FILE) {
    // Daily rotated files
    transports.push(
        new DailyRotateFile({
            filename: path.join(LOGS_DIR, 'ayobot-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: `${LOG_RETENTION_DAYS}d`,
            format: fileFormat,
            level: LOG_LEVEL
        })
    );

    // Error-only log
    transports.push(
        new DailyRotateFile({
            filename: path.join(LOGS_DIR, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '10m',
            maxFiles: `${LOG_RETENTION_DAYS}d`,
            format: fileFormat,
            level: 'error'
        })
    );

    // Audit log for important actions
    transports.push(
        new DailyRotateFile({
            name: 'audit',
            filename: path.join(LOGS_DIR, 'audit-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '10m',
            maxFiles: `${LOG_RETENTION_DAYS * 2}d`, // Keep audit logs longer
            format: fileFormat,
            level: 'info'
        })
    );
}

// Create main logger
export const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: fileFormat,
    defaultMeta: {
        service: 'ayobot',
        pid: process.pid,
        hostname: os.hostname(),
        environment: NODE_ENV,
        version: process.env.VERSION || '1.0.0'
    },
    transports: transports,
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'exceptions.log')
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'rejections.log')
        })
    ],
    exitOnError: false // Don't exit on handled exceptions
});

// Enhanced logger factory with context
export function createLogger(moduleName, options = {}) {
    const childLogger = logger.child({
        module: moduleName,
        ...options.context
    });

    // Add custom methods
    childLogger.withContext = function(context) {
        return this.child(context);
    };

    childLogger.user = function(userId, message, meta = {}) {
        return this.info(message, { user: userId, ...meta });
    };

    childLogger.group = function(groupId, message, meta = {}) {
        return this.info(message, { group: groupId, ...meta });
    };

    childLogger.command = function(command, userId, message, meta = {}) {
        return this.info(message, { command, user: userId, ...meta });
    };

    childLogger.audit = function(action, userId, details = {}) {
        const auditLogger = logger.child({
            logType: 'audit',
            action,
            user: userId,
            timestamp: new Date().toISOString()
        });
        auditLogger.info(`AUDIT: ${action}`, details);
    };

    childLogger.metric = function(name, value, tags = {}) {
        const metricLogger = logger.child({
            logType: 'metric',
            metric: name,
            value: value,
            ...tags
        });
        metricLogger.info(`METRIC: ${name} = ${value}`);
    };

    childLogger.performance = function(operation, durationMs, meta = {}) {
        const perfLogger = logger.child({
            logType: 'performance',
            operation,
            duration: durationMs,
            ...meta
        });

        let level = 'info';
        if (durationMs > 1000) level = 'warn';
        if (durationMs > 5000) level = 'error';

        perfLogger[level](`PERFORMANCE: ${operation} took ${durationMs}ms`);
    };

    return childLogger;
}

// Request/Response logger middleware
export function createRequestLogger() {
    return function(req, res, next) {
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substring(7);

        const reqLogger = logger.child({
            requestId,
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Log request
    reqLogger.info('Request received');

        // Capture response
        const originalSend = res.send;
        res.send = function(body) {
            const duration = Date.now() - startTime;

            reqLogger.info('Response sent', {
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                contentLength: body?.length || 0
            });

            originalSend.call(this, body);
        };

        // Attach logger to request
        req.logger = reqLogger;
        next();
    };
}

// Logging utilities
export class LogManager {
    constructor() {
        this.loggers = new Map();
        this.metrics = new Map();
        this.lastCleanup = Date.now();
    }

    getLogger(moduleName) {
        if (!this.loggers.has(moduleName)) {
            this.loggers.set(moduleName, createLogger(moduleName));
        }
        return this.loggers.get(moduleName);
    }

    trackMetric(name, value, tags = {}) {
        const key = `${name}_${JSON.stringify(tags)}`;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                name,
                tags,
                values: [],
                count: 0,
                sum: 0,
                min: Infinity,
                max: -Infinity
            });
        }

        const metric = this.metrics.get(key);
        metric.values.push(value);
        metric.count++;
        metric.sum += value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);

        // Keep last 1000 values
        if (metric.values.length > 1000) {
            metric.values = metric.values.slice(-1000);
        }

        // Auto-log every 100th value
        if (metric.count % 100 === 0) {
            this.getLogger('metrics').metric(name, value, {
                ...tags,
                count: metric.count,
                avg: (metric.sum / metric.count).toFixed(2),
                min: metric.min,
                max: metric.max
            });
        }

        return metric;
    }

    getMetricsSummary() {
        const summary = {};

        for (const [key, metric] of this.metrics.entries()) {
            summary[key] = {
                name: metric.name,
                tags: metric.tags,
                count: metric.count,
                avg: metric.count > 0 ? (metric.sum / metric.count).toFixed(2) : 0,
                min: metric.min === Infinity ? 0 : metric.min,
                max: metric.max === -Infinity ? 0 : metric.max,
                latest: metric.values[metric.values.length - 1] || 0
            };
        }

        return summary;
    }

    cleanup() {
        const now = Date.now();
        // Cleanup every hour
        if (now - this.lastCleanup > 3600000) {
            // Remove old metrics that haven't been updated in 24 hours
            // (This would need timestamps in the metric objects)
            this.lastCleanup = now;
        }
    }
}

// Singleton LogManager instance
export const logManager = new LogManager();

// Convenience exports
export const botLogger = createLogger('bot');
export const dbLogger = createLogger('database');
export const apiLogger = createLogger('api');
export const errorLogger = createLogger('error');
export const auditLogger = createLogger('audit');

// Helper functions
export function logError(error, context = {}) {
    const errorContext = {
        ...context,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };

    if (error.code) errorContext.errorCode = error.code;
    if (error.status) errorContext.statusCode = error.status;
    if (error.response) errorContext.response = error.response.data;

    errorLogger.error(`Error: ${error.message}`, errorContext);
    return errorContext;
}

export function logRequest(requestType, data, context = {}) {
    const requestLogger = logger.child({
        logType: 'request',
        requestType,
        ...context
    });

    requestLogger.info(`REQUEST: ${requestType}`, {
        data: typeof data === 'object' ? JSON.stringify(data).substring(0, 500) : data,
        timestamp: new Date().toISOString()
    });
}

export function logResponse(responseType, data, context = {}) {
    const responseLogger = logger.child({
        logType: 'response',
        responseType,
        ...context
    });

    responseLogger.info(`RESPONSE: ${responseType}`, {
        data: typeof data === 'object' ? JSON.stringify(data).substring(0, 500) : data,
        timestamp: new Date().toISOString()
    });
}

export function logSecurityEvent(event, user, details = {}) {
    const securityLogger = logger.child({
        logType: 'security',
        event,
        user,
        severity: details.severity || 'medium',
        timestamp: new Date().toISOString()
    });

    const level = details.severity === 'high' ? 'error' :
                 details.severity === 'medium' ? 'warn' : 'info';

    securityLogger[level](`SECURITY: ${event}`, details);
}

// Performance monitoring
export function withPerformanceLog(operationName, fn) {
    return async function(...args) {
        const startTime = performance.now();
        const logger = createLogger('performance');

        try {
            logger.debug(`Starting: ${operationName}`);
            const result = await fn(...args);
            const duration = performance.now() - startTime;

            logger.performance(operationName, duration, {
                success: true,
                args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg)
            });

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;

            logger.performance(operationName, duration, {
                success: false,
                error: error.message,
                args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg)
            });

            throw error;
        }
    };
}

// Log rotation cleanup (run on startup)
export async function cleanupOldLogs() {
    try {
        const files = await fs.readdir(LOGS_DIR);
        const now = Date.now();
        const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            const filePath = path.join(LOGS_DIR, file);
            const stats = await fs.stat(filePath);

            if (now - stats.mtimeMs > maxAge) {
                await fs.unlink(filePath);
                logger.info(`Deleted old log file: ${file}`);
            }
        }
    } catch (error) {
        logger.error('Failed to cleanup old logs:', error);
    }
}

// Initialize cleanup on startup if in production
if (NODE_ENV === 'production') {
    cleanupOldLogs().catch(error => {
        logger.error('Failed to cleanup logs on startup:', error);
    });
}

// Default export
export default logger;
