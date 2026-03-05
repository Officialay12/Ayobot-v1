/**
 * Language Translation System for AYOBOT v1
 * Supports multiple languages for bot responses
 */

export const Languages = {
    ENGLISH: {
        code: 'en',
        name: 'English',
        native: 'English',
        emoji: '🇺🇸',

        // System messages
        greetings: {
            morning: 'Good morning! ☀️',
            afternoon: 'Good afternoon! 🌞',
            evening: 'Good evening! 🌙',
            night: 'Good night! 🌌',
            general: 'Hello! 👋'
        },

        errors: {
            commandNotFound: 'Command not found.',
            permissionDenied: 'Permission denied.',
            invalidArgs: 'Invalid arguments.',
            notInGroup: 'This command can only be used in groups.',
            notImplemented: 'Feature not implemented yet.',
            genericError: 'An error occurred. Please try again.'
        },

        help: {
            title: 'AYOBOT v1 Ultimate - Help',
            categories: 'Categories',
            commands: 'Commands',
            usage: 'Usage',
            example: 'Example',
            description: 'Description',
            aliases: 'Aliases'
        },

        commands: {
            help: 'Show help information',
            ping: 'Check bot responsiveness',
            status: 'Get bot status',
            weather: 'Get weather information',
            ai: 'Chat with AI',
            sticker: 'Create sticker from image'
        }
    },

    SPANISH: {
        code: 'es',
        name: 'Spanish',
        native: 'Español',
        emoji: '🇪🇸',

        greetings: {
            morning: '¡Buenos días! ☀️',
            afternoon: '¡Buenas tardes! 🌞',
            evening: '¡Buenas noches! 🌙',
            night: '¡Buenas noches! 🌌',
            general: '¡Hola! 👋'
        },

        errors: {
            commandNotFound: 'Comando no encontrado.',
            permissionDenied: 'Permiso denegado.',
            invalidArgs: 'Argumentos inválidos.',
            notInGroup: 'Este comando solo se puede usar en grupos.',
            notImplemented: 'Característica aún no implementada.',
            genericError: 'Ocurrió un error. Por favor, inténtalo de nuevo.'
        },

        help: {
            title: 'AYOBOT v1 Ultimate - Ayuda',
            categories: 'Categorías',
            commands: 'Comandos',
            usage: 'Uso',
            example: 'Ejemplo',
            description: 'Descripción',
            aliases: 'Alias'
        },

        commands: {
            help: 'Mostrar información de ayuda',
            ping: 'Verificar la capacidad de respuesta del bot',
            status: 'Obtener estado del bot',
            weather: 'Obtener información del clima',
            ai: 'Chatear con IA',
            sticker: 'Crear sticker desde imagen'
        }
    },

    FRENCH: {
        code: 'fr',
        name: 'French',
        native: 'Français',
        emoji: '🇫🇷',

        greetings: {
            morning: 'Bonjour! ☀️',
            afternoon: 'Bon après-midi! 🌞',
            evening: 'Bonsoir! 🌙',
            night: 'Bonne nuit! 🌌',
            general: 'Salut! 👋'
        },

        errors: {
            commandNotFound: 'Commande non trouvée.',
            permissionDenied: 'Permission refusée.',
            invalidArgs: 'Arguments invalides.',
            notInGroup: 'Cette commande ne peut être utilisée que dans les groupes.',
            notImplemented: 'Fonctionnalité pas encore implémentée.',
            genericError: 'Une erreur est survenue. Veuillez réessayer.'
        },

        help: {
            title: 'AYOBOT v1 Ultimate - Aide',
            categories: 'Catégories',
            commands: 'Commandes',
            usage: 'Utilisation',
            example: 'Exemple',
            description: 'Description',
            aliases: 'Alias'
        },

        commands: {
            help: 'Afficher les informations d\'aide',
            ping: 'Vérifier la réactivité du bot',
            status: 'Obtenir l\'état du bot',
            weather: 'Obtenir les informations météo',
            ai: 'Discuter avec l\'IA',
            sticker: 'Créer un autocollant à partir d\'une image'
        }
    },

    PORTUGUESE: {
        code: 'pt',
        name: 'Portuguese',
        native: 'Português',
        emoji: '🇵🇹',

        greetings: {
            morning: 'Bom dia! ☀️',
            afternoon: 'Boa tarde! 🌞',
            evening: 'Boa noite! 🌙',
            night: 'Boa noite! 🌌',
            general: 'Olá! 👋'
        },

        errors: {
            commandNotFound: 'Comando não encontrado.',
            permissionDenied: 'Permissão negada.',
            invalidArgs: 'Argumentos inválidos.',
            notInGroup: 'Este comando só pode ser usado em grupos.',
            notImplemented: 'Recurso ainda não implementado.',
            genericError: 'Ocorreu um erro. Por favor, tente novamente.'
        },

        help: {
            title: 'AYOBOT v1 Ultimate - Ajuda',
            categories: 'Categorias',
            commands: 'Comandos',
            usage: 'Uso',
            example: 'Exemplo',
            description: 'Descrição',
            aliases: 'Apelidos'
        },

        commands: {
            help: 'Mostrar informações de ajuda',
            ping: 'Verificar a capacidade de resposta do bot',
            status: 'Obter status do bot',
            weather: 'Obter informações meteorológicas',
            ai: 'Conversar com IA',
            sticker: 'Criar adesivo a partir de imagem'
        }
    },

    ARABIC: {
        code: 'ar',
        name: 'Arabic',
        native: 'العربية',
        emoji: '🇸🇦',
        rtl: true,

        greetings: {
            morning: 'صباح الخير! ☀️',
            afternoon: 'مساء الخير! 🌞',
            evening: 'مساء الخير! 🌙',
            night: 'تصبح على خير! 🌌',
            general: 'مرحباً! 👋'
        },

        errors: {
            commandNotFound: 'الأمر غير موجود.',
            permissionDenied: 'تم رفض الإذن.',
            invalidArgs: 'وسائط غير صالحة.',
            notInGroup: 'هذا الأمر يمكن استخدامه في المجموعات فقط.',
            notImplemented: 'الميزة غير مطبقة بعد.',
            genericError: 'حدث خطأ. يرجى المحاولة مرة أخرى.'
        },

        help: {
            title: 'AYOBOT v1 Ultimate - المساعدة',
            categories: 'الفئات',
            commands: 'الأوامر',
            usage: 'طريقة الاستخدام',
            example: 'مثال',
            description: 'الوصف',
            aliases: 'الأسماء المستعارة'
        },

        commands: {
            help: 'عرض معلومات المساعدة',
            ping: 'التحقق من استجابة البوت',
            status: 'الحصول على حالة البوت',
            weather: 'الحصول على معلومات الطقس',
            ai: 'الدردشة مع الذكاء الاصطناعي',
            sticker: 'إنشاء ملصق من صورة'
        }
    }
};

// Language Manager
export class LanguageManager {
    constructor(defaultLanguage = 'en') {
        this.defaultLanguage = defaultLanguage;
        this.userLanguages = new Map(); // Store user language preferences
        this.availableLanguages = Object.keys(Languages).map(key => Languages[key]);
    }

    // Set user language preference
    setUserLanguage(userId, languageCode) {
        const lang = this.getLanguage(languageCode);
        if (lang) {
            this.userLanguages.set(userId, lang.code);
            return true;
        }
        return false;
    }

    // Get user language
    getUserLanguage(userId) {
        const userLang = this.userLanguages.get(userId);
        return userLang ? this.getLanguage(userLang) : this.getLanguage(this.defaultLanguage);
    }

    // Get language by code
    getLanguage(languageCode) {
        return this.availableLanguages.find(lang => lang.code === languageCode) ||
               this.availableLanguages.find(lang => lang.code === this.defaultLanguage);
    }

    // Translate key
    translate(key, userId = null, variables = {}) {
        const language = userId ? this.getUserLanguage(userId) : this.getLanguage(this.defaultLanguage);

        // Navigate through nested keys (e.g., "greetings.morning")
        const keys = key.split('.');
        let value = language;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to English if key not found
                const english = this.getLanguage('en');
                let fallbackValue = english;
                for (const k2 of keys) {
                    if (fallbackValue && typeof fallbackValue === 'object' && k2 in fallbackValue) {
                        fallbackValue = fallbackValue[k2];
                    } else {
                        return `[${key}]`; // Key not found
                    }
                }
                value = fallbackValue;
                break;
            }
        }

        // Replace variables if value is a string
        if (typeof value === 'string' && Object.keys(variables).length > 0) {
            for (const [varKey, varValue] of Object.entries(variables)) {
                value = value.replace(new RegExp(`{{${varKey}}}`, 'g'), varValue);
            }
        }

        return value;
    }

    // Get all available languages
    getAvailableLanguages() {
        return this.availableLanguages.map(lang => ({
            code: lang.code,
            name: lang.name,
            native: lang.native,
            emoji: lang.emoji
        }));
    }

    // Format language list for display
    formatLanguageList() {
        const languages = this.getAvailableLanguages();
        let text = '🌍 *Available Languages*\n\n';

        languages.forEach(lang => {
            text += `${lang.emoji} *${lang.name}* (${lang.native})\n`;
            text += `   Code: \`${lang.code}\`\n\n`;
        });

        text += 'To change your language, use: `.language set [code]`\n';
        text += 'Example: `.language set es` for Spanish';

        return text;
    }

    // Auto-detect language from text
    detectLanguage(text) {
        const commonWords = {
            en: ['the', 'and', 'you', 'that', 'have', 'for', 'not', 'with', 'this'],
            es: ['el', 'la', 'que', 'y', 'en', 'los', 'se', 'del', 'las'],
            fr: ['le', 'la', 'et', 'les', 'des', 'en', 'un', 'une', 'qui'],
            pt: ['o', 'a', 'e', 'do', 'da', 'em', 'um', 'uma', 'que'],
            ar: ['في', 'من', 'على', 'أن', 'هو', 'هي', 'إلى', 'كان', 'لم']
        };

        const textLower = text.toLowerCase();
        let bestMatch = 'en';
        let bestScore = 0;

        for (const [lang, words] of Object.entries(commonWords)) {
            let score = 0;
            words.forEach(word => {
                if (textLower.includes(word)) score++;
            });

            if (score > bestScore) {
                bestScore = score;
                bestMatch = lang;
            }
        }

        return bestMatch;
    }
}

// Singleton instance
export const languageManager = new LanguageManager('en');

// Convenience functions
export function t(key, userId = null, variables = {}) {
    return languageManager.translate(key, userId, variables);
}

export function setLanguage(userId, languageCode) {
    return languageManager.setUserLanguage(userId, languageCode);
}

export function getLangList() {
    return languageManager.formatLanguageList();
}

// Command responses in different languages
export const CommandResponses = {
    PING: {
        en: '🏓 Pong!',
        es: '🏓 ¡Pong!',
        fr: '🏓 Pong !',
        pt: '🏓 Pong!',
        ar: '🏓 بونغ!'
    },

    STATUS: {
        en: '📊 *Bot Status*\n\n',
        es: '📊 *Estado del Bot*\n\n',
        fr: '📊 *Statut du Bot*\n\n',
        pt: '📊 *Status do Bot*\n\n',
        ar: '📊 *حالة البوت*\n\n'
    },

    HELP: {
        en: '👑 *AYOBOT v1 Ultimate Help*\n\n',
        es: '👑 *AYOBOT v1 Ultimate Ayuda*\n\n',
        fr: '👑 *AYOBOT v1 Ultimate Aide*\n\n',
        pt: '👑 *AYOBOT v1 Ultimate Ajuda*\n\n',
        ar: '👑 *AYOBOT v1 Ultimate المساعدة*\n\n'
    }
};

// Export default
export default {
    Languages,
    LanguageManager,
    languageManager,
    t,
    setLanguage,
    getLangList
};
