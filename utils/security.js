// utils/security.js - COMPLETE SECURITY MODULE
import crypto from 'crypto';
import {
    HASH_ALGORITHMS,
    CIPHER_ALGORITHMS,
    HMAC_ALGORITHMS,
    SECURITY_CONSTANTS,
    DEFAULT_KEYS,
    SECURITY_LEVELS
} from '../config/constants.js';

export class SecurityManager {
    constructor() {
        console.log('🔐 Security Manager Initialized');
    }

    /**
     * Hash generation with multiple algorithms
     */
    generateHash(text, algorithm = 'sha256', encoding = 'hex') {
        try {
            const algo = algorithm.toLowerCase();

            if (!HASH_ALGORITHMS.includes(algo)) {
                throw new Error(`Unsupported algorithm. Supported: ${HASH_ALGORITHMS.join(', ')}`);
            }

            const hash = crypto.createHash(algo).update(text).digest(encoding);

            return {
                algorithm: algo.toUpperCase(),
                hash: hash,
                length: hash.length,
                inputLength: text.length,
                encoding: encoding,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Hash generation error:', error.message);
            throw error;
        }
    }

    /**
     * Compare hash (secure comparison)
     */
    compareHash(text, hash, algorithm = 'sha256') {
        try {
            const generated = this.generateHash(text, algorithm);
            return crypto.timingSafeEqual(
                Buffer.from(generated.hash),
                Buffer.from(hash)
            );
        } catch (error) {
            console.error('❌ Hash comparison error:', error.message);
            return false;
        }
    }

    /**
     * Advanced encryption with different algorithms
     */
    encrypt(text, options = {}) {
        try {
            const {
                algorithm = 'aes-256-cbc',
                key = DEFAULT_KEYS.ENCRYPTION,
                encoding = 'hex',
                securityLevel = 'HIGH'
            } = options;

            if (!CIPHER_ALGORITHMS.includes(algorithm.toLowerCase())) {
                throw new Error(`Unsupported cipher. Supported: ${CIPHER_ALGORITHMS.join(', ')}`);
            }

            const levelConfig = SECURITY_LEVELS[securityLevel.toUpperCase()] || SECURITY_LEVELS.HIGH;
            const iv = crypto.randomBytes(SECURITY_CONSTANTS.IV_LENGTH);

            // Generate key from secret
            const derivedKey = crypto.pbkdf2Sync(
                key,
                'ayobot-salt',
                levelConfig.iterations,
                levelConfig.keyLength,
                'sha512'
            );

            const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);

            let encrypted = cipher.update(text, 'utf8', encoding);
            encrypted += cipher.final(encoding);

            // For GCM algorithms, also get auth tag
            let authTag = null;
            if (algorithm.includes('gcm')) {
                authTag = cipher.getAuthTag().toString(encoding);
            }

            return {
                encrypted: encrypted,
                iv: iv.toString(encoding),
                authTag: authTag,
                algorithm: algorithm.toUpperCase(),
                securityLevel: securityLevel,
                format: authTag ?
                    `${iv.toString(encoding)}:${authTag}:${encrypted}` :
                    `${iv.toString(encoding)}:${encrypted}`,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Encryption error:', error.message);
            throw error;
        }
    }

    /**
     * Decryption with algorithm detection
     */
    decrypt(encryptedData, options = {}) {
        try {
            const {
                algorithm = 'aes-256-cbc',
                key = DEFAULT_KEYS.ENCRYPTION,
                encoding = 'hex',
                securityLevel = 'HIGH'
            } = options;

            const parts = encryptedData.split(':');
            if (parts.length < 2) {
                throw new Error('Invalid encrypted format');
            }

            const iv = Buffer.from(parts[0], encoding);
            let encrypted, authTag;

            if (algorithm.includes('gcm') && parts.length === 3) {
                authTag = Buffer.from(parts[1], encoding);
                encrypted = parts[2];
            } else {
                encrypted = parts[1];
            }

            const levelConfig = SECURITY_LEVELS[securityLevel.toUpperCase()] || SECURITY_LEVELS.HIGH;
            const derivedKey = crypto.pbkdf2Sync(
                key,
                'ayobot-salt',
                levelConfig.iterations,
                levelConfig.keyLength,
                'sha512'
            );

            const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);

            if (authTag) {
                decipher.setAuthTag(authTag);
            }

            let decrypted = decipher.update(encrypted, encoding, 'utf8');
            decrypted += decipher.final('utf8');

            return {
                decrypted: decrypted,
                algorithm: algorithm.toUpperCase(),
                success: true,
                securityLevel: securityLevel,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Decryption error:', error.message);
            throw error;
        }
    }

    /**
     * HMAC generation and verification
     */
    generateHMAC(message, options = {}) {
        try {
            const {
                algorithm = 'sha256',
                secret = DEFAULT_KEYS.HMAC,
                encoding = 'hex'
            } = options;

            if (!HMAC_ALGORITHMS.includes(algorithm.toLowerCase())) {
                throw new Error(`Unsupported HMAC algorithm. Supported: ${HMAC_ALGORITHMS.join(', ')}`);
            }

            const hmac = crypto.createHmac(algorithm, secret);
            hmac.update(message);
            const signature = hmac.digest(encoding);

            return {
                signature: signature,
                algorithm: `HMAC-${algorithm.toUpperCase()}`,
                messageLength: message.length,
                encoding: encoding,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ HMAC error:', error.message);
            throw error;
        }
    }

    verifyHMAC(message, signature, options = {}) {
        try {
            const generated = this.generateHMAC(message, options);
            return crypto.timingSafeEqual(
                Buffer.from(generated.signature),
                Buffer.from(signature)
            );
        } catch (error) {
            console.error('❌ HMAC verification error:', error.message);
            return false;
        }
    }

    /**
     * Password hashing with salt (PBKDF2)
     */
    hashPassword(password, options = {}) {
        try {
            const {
                saltLength = 32,
                iterations = 10000,
                keyLength = 64,
                algorithm = 'sha512'
            } = options;

            const salt = crypto.randomBytes(saltLength).toString('hex');
            const hash = crypto.pbkdf2Sync(
                password,
                salt,
                iterations,
                keyLength,
                algorithm
            ).toString('hex');

            return {
                hash: hash,
                salt: salt,
                algorithm: `PBKDF2-${algorithm.toUpperCase()}`,
                iterations: iterations,
                keyLength: keyLength,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Password hashing error:', error.message);
            throw error;
        }
    }

    verifyPassword(password, storedHash, storedSalt, options = {}) {
        try {
            const {
                iterations = 10000,
                keyLength = 64,
                algorithm = 'sha512'
            } = options;

            const hash = crypto.pbkdf2Sync(
                password,
                storedSalt,
                iterations,
                keyLength,
                algorithm
            ).toString('hex');

            return crypto.timingSafeEqual(
                Buffer.from(hash),
                Buffer.from(storedHash)
            );
        } catch (error) {
            console.error('❌ Password verification error:', error.message);
            return false;
        }
    }

    /**
     * Generate secure tokens
     */
    generateToken(length = SECURITY_CONSTANTS.TOKEN_LENGTH) {
        try {
            return crypto.randomBytes(length).toString('hex');
        } catch (error) {
            console.error('❌ Token generation error:', error.message);
            throw error;
        }
    }

    generateSessionToken(userId, timestamp = Date.now()) {
        try {
            const data = `${userId}:${timestamp}:${crypto.randomBytes(16).toString('hex')}`;
            const hash = this.generateHash(data, 'sha256');
            return hash.hash;
        } catch (error) {
            console.error('❌ Session token error:', error.message);
            throw error;
        }
    }

    /**
     * Generate cryptographic keys
     */
    generateKeyPair(type = 'rsa') {
        try {
            let keyPair;

            switch (type.toLowerCase()) {
                case 'rsa':
                    keyPair = crypto.generateKeyPairSync('rsa', {
                        modulusLength: 2048,
                        publicKeyEncoding: {
                            type: 'spki',
                            format: 'pem'
                        },
                        privateKeyEncoding: {
                            type: 'pkcs8',
                            format: 'pem'
                        }
                    });
                    break;

                case 'ec':
                    keyPair = crypto.generateKeyPairSync('ec', {
                        namedCurve: 'secp256k1',
                        publicKeyEncoding: {
                            type: 'spki',
                            format: 'pem'
                        },
                        privateKeyEncoding: {
                            type: 'pkcs8',
                            format: 'pem'
                        }
                    });
                    break;

                default:
                    throw new Error(`Unsupported key type: ${type}`);
            }

            return {
                type: type.toUpperCase(),
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Key pair generation error:', error.message);
            throw error;
        }
    }

    /**
     * Digital signature
     */
    sign(data, privateKey, algorithm = 'RSA-SHA256') {
        try {
            const sign = crypto.createSign(algorithm);
            sign.update(data);
            sign.end();

            const signature = sign.sign(privateKey, 'hex');

            return {
                signature: signature,
                algorithm: algorithm,
                dataLength: data.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Signing error:', error.message);
            throw error;
        }
    }

    verifySignature(data, signature, publicKey, algorithm = 'RSA-SHA256') {
        try {
            const verify = crypto.createVerify(algorithm);
            verify.update(data);
            verify.end();

            return verify.verify(publicKey, signature, 'hex');
        } catch (error) {
            console.error('❌ Signature verification error:', error.message);
            return false;
        }
    }

    /**
     * Password strength checker
     */
    checkPasswordStrength(password) {
        try {
            const checks = {
                length: password.length >= SECURITY_CONSTANTS.PASSWORD_MIN_LENGTH,
                uppercase: /[A-Z]/.test(password),
                lowercase: /[a-z]/.test(password),
                numbers: /\d/.test(password),
                symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
                noSpaces: !/\s/.test(password),
                notCommon: !this.isCommonPassword(password)
            };

            const passed = Object.values(checks).filter(Boolean).length;
            const total = Object.keys(checks).length;
            const score = Math.round((passed / total) * 100);

            let strength;
            if (score >= 90) strength = 'Very Strong';
            else if (score >= 70) strength = 'Strong';
            else if (score >= 50) strength = 'Moderate';
            else if (score >= 30) strength = 'Weak';
            else strength = 'Very Weak';

            return {
                score: score,
                strength: strength,
                checks: checks,
                passed: passed,
                total: total,
                recommendations: this.getPasswordRecommendations(checks)
            };

        } catch (error) {
            console.error('❌ Password strength check error:', error.message);
            throw error;
        }
    }

    isCommonPassword(password) {
        const commonPasswords = [
            'password', '123456', '12345678', '1234', 'qwerty',
            'admin', 'welcome', 'monkey', 'letmein', 'password1'
        ];
        return commonPasswords.includes(password.toLowerCase());
    }

    getPasswordRecommendations(checks) {
        const recommendations = [];

        if (!checks.length) {
            recommendations.push(`Password should be at least ${SECURITY_CONSTANTS.PASSWORD_MIN_LENGTH} characters`);
        }
        if (!checks.uppercase) {
            recommendations.push('Add uppercase letters (A-Z)');
        }
        if (!checks.lowercase) {
            recommendations.push('Add lowercase letters (a-z)');
        }
        if (!checks.numbers) {
            recommendations.push('Add numbers (0-9)');
        }
        if (!checks.symbols) {
            recommendations.push('Add symbols (!@#$% etc.)');
        }
        if (!checks.noSpaces) {
            recommendations.push('Remove spaces from password');
        }
        if (checks.notCommon) {
            recommendations.push('Avoid common passwords');
        }

        return recommendations;
    }

    /**
     * Generate random data
     */
    generateRandomBytes(length = 32, encoding = 'hex') {
        try {
            const bytes = crypto.randomBytes(length);
            return bytes.toString(encoding);
        } catch (error) {
            console.error('❌ Random bytes error:', error.message);
            throw error;
        }
    }

    generateUUID(version = 4) {
        try {
            switch (version) {
                case 1:
                    // Timestamp-based UUID (simplified)
                    const timestamp = Date.now();
                    const random = crypto.randomBytes(8).toString('hex');
                    return `${timestamp.toString(16)}-${random.substring(0, 4)}-1${random.substring(4, 7)}-${random.substring(7, 10)}-${random.substring(10)}`;

                case 4:
                    // Random UUID
                    return crypto.randomUUID();

                default:
                    throw new Error('Unsupported UUID version');
            }
        } catch (error) {
            console.error('❌ UUID generation error:', error.message);
            throw error;
        }
    }

    /**
     * Base64 encoding/decoding
     */
    base64Encode(data) {
        try {
            const buffer = Buffer.from(data, 'utf8');
            return buffer.toString('base64');
        } catch (error) {
            console.error('❌ Base64 encoding error:', error.message);
            throw error;
        }
    }

    base64Decode(data) {
        try {
            const buffer = Buffer.from(data, 'base64');
            return buffer.toString('utf8');
        } catch (error) {
            console.error('❌ Base64 decoding error:', error.message);
            throw error;
        }
    }

    /**
     * Security utilities
     */
    calculateEntropy(text) {
        try {
            const charSet = new Set(text);
            const charsetSize = charSet.size || 1;
            const length = text.length;

            // Calculate bits of entropy
            const entropy = length * Math.log2(charsetSize);

            return {
                entropy: entropy,
                bits: Math.round(entropy),
                charsetSize: charsetSize,
                length: length,
                strength: entropy > 100 ? 'High' : entropy > 60 ? 'Medium' : 'Low'
            };
        } catch (error) {
            console.error('❌ Entropy calculation error:', error.message);
            throw error;
        }
    }

    /**
     * Security test/benchmark
     */
    benchmarkSecurity() {
        try {
            const startTime = Date.now();
            const testResults = [];

            // Test hash functions
            for (const algo of ['md5', 'sha1', 'sha256', 'sha512']) {
                const start = Date.now();
                this.generateHash('test', algo);
                const time = Date.now() - start;
                testResults.push({ algorithm: algo, time: time, type: 'hash' });
            }

            // Test encryption
            for (const algo of ['aes-128-cbc', 'aes-256-cbc']) {
                const start = Date.now();
                this.encrypt('test', { algorithm: algo });
                const time = Date.now() - start;
                testResults.push({ algorithm: algo, time: time, type: 'encrypt' });
            }

            const totalTime = Date.now() - startTime;

            return {
                testResults: testResults,
                totalTime: totalTime,
                fastest: testResults.reduce((a, b) => a.time < b.time ? a : b),
                slowest: testResults.reduce((a, b) => a.time > b.time ? a : b),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Benchmark error:', error.message);
            throw error;
        }
    }
}

// Singleton instance
export const securityManager = new SecurityManager();

// Legacy functions for backward compatibility
export function generateHash(text, algorithm = 'sha256') {
    return securityManager.generateHash(text, algorithm);
}

export function encryptText(text, key = DEFAULT_KEYS.ENCRYPTION) {
    const result = securityManager.encrypt(text, { key });
    return {
        encrypted: result.encrypted,
        iv: result.iv,
        algorithm: result.algorithm,
        format: result.format
    };
}

export function decryptText(encryptedText, key = DEFAULT_KEYS.ENCRYPTION) {
    const result = securityManager.decrypt(encryptedText, { key });
    return {
        decrypted: result.decrypted,
        algorithm: result.algorithm,
        success: result.success
    };
}

export function generateHMAC(message, secret = DEFAULT_KEYS.HMAC) {
    return securityManager.generateHMAC(message, { secret });
}

export function generateRandomKey(length = 32) {
    return securityManager.generateRandomBytes(length);
}

export function generatePasswordHash(password, salt = null) {
    const result = securityManager.hashPassword(password, {
        salt: salt ? salt.length : 32
    });
    return {
        hash: result.hash,
        salt: result.salt,
        algorithm: result.algorithm,
        iterations: result.iterations
    };
}

// Export default
export default securityManager;
