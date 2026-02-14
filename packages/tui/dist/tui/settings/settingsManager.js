// ─── Settings Manager ───────────────────────────────────────────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { settingsSchema, getSettingByKey } from './settingsSchema.js';
const SETTINGS_DIR = path.join(os.homedir(), '.tmux-agents');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'tui-settings.json');
export class SettingsManager {
    constructor() {
        this.settings = {};
        this.isDirty = false;
        this.load();
    }
    /**
     * Load settings from file or use defaults
     */
    load() {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
                const loaded = JSON.parse(data);
                // Merge with defaults to ensure all settings exist
                this.settings = this.mergeWithDefaults(loaded);
            }
            else {
                // Use defaults
                this.settings = this.getDefaults();
            }
        }
        catch (error) {
            console.error('Failed to load settings, using defaults:', error);
            this.settings = this.getDefaults();
        }
        this.isDirty = false;
        return this.settings;
    }
    /**
     * Save settings to file
     */
    save(settings) {
        if (settings) {
            this.settings = settings;
        }
        try {
            // Ensure directory exists
            if (!fs.existsSync(SETTINGS_DIR)) {
                fs.mkdirSync(SETTINGS_DIR, { recursive: true });
            }
            // Validate all settings before saving
            for (const [key, value] of Object.entries(this.settings)) {
                const definition = getSettingByKey(key);
                if (definition && definition.validation) {
                    if (!definition.validation(value)) {
                        console.error(`Validation failed for setting ${key}`);
                        return false;
                    }
                }
            }
            // Write to file
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
            this.isDirty = false;
            return true;
        }
        catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }
    /**
     * Get a setting value
     */
    get(key) {
        return this.settings[key];
    }
    /**
     * Set a setting value
     */
    set(key, value) {
        const definition = getSettingByKey(key);
        if (!definition) {
            console.error(`Unknown setting key: ${key}`);
            return false;
        }
        // Validate
        if (definition.validation && !definition.validation(value)) {
            console.error(`Validation failed for setting ${key}`);
            return false;
        }
        // Type checking
        if (definition.type === 'number' && typeof value !== 'number') {
            console.error(`Expected number for setting ${key}`);
            return false;
        }
        if (definition.type === 'boolean' && typeof value !== 'boolean') {
            console.error(`Expected boolean for setting ${key}`);
            return false;
        }
        if (definition.type === 'string' && typeof value !== 'string') {
            console.error(`Expected string for setting ${key}`);
            return false;
        }
        if (definition.type === 'select' && definition.options && !definition.options.includes(value)) {
            console.error(`Invalid option for setting ${key}. Must be one of: ${definition.options.join(', ')}`);
            return false;
        }
        this.settings[key] = value;
        this.isDirty = true;
        return true;
    }
    /**
     * Reset all settings to defaults
     */
    reset() {
        this.settings = this.getDefaults();
        this.isDirty = true;
    }
    /**
     * Reset a specific setting to default
     */
    resetKey(key) {
        const definition = getSettingByKey(key);
        if (!definition) {
            return false;
        }
        this.settings[key] = definition.default;
        this.isDirty = true;
        return true;
    }
    /**
     * Check if settings have unsaved changes
     */
    hasUnsavedChanges() {
        return this.isDirty;
    }
    /**
     * Get all settings
     */
    getAll() {
        return { ...this.settings };
    }
    /**
     * Get default settings
     */
    getDefaults() {
        const defaults = {};
        for (const def of settingsSchema) {
            defaults[def.key] = def.default;
        }
        return defaults;
    }
    /**
     * Merge loaded settings with defaults
     */
    mergeWithDefaults(loaded) {
        const defaults = this.getDefaults();
        return { ...defaults, ...loaded };
    }
    /**
     * Export settings to JSON string
     */
    export() {
        return JSON.stringify(this.settings, null, 2);
    }
    /**
     * Import settings from JSON string
     */
    import(json) {
        try {
            const imported = JSON.parse(json);
            this.settings = this.mergeWithDefaults(imported);
            this.isDirty = true;
            return true;
        }
        catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }
    /**
     * Get settings file path
     */
    getSettingsFilePath() {
        return SETTINGS_FILE;
    }
}
// Singleton instance
let settingsManager = null;
export function getSettingsManager() {
    if (!settingsManager) {
        settingsManager = new SettingsManager();
    }
    return settingsManager;
}
//# sourceMappingURL=settingsManager.js.map