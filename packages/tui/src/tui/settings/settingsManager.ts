// ─── Settings Manager ───────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { settingsSchema, getSettingByKey } from './settingsSchema.js';

const SETTINGS_DIR = path.join(os.homedir(), '.tmux-agents');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'tui-settings.json');

export class SettingsManager {
  private settings: Record<string, any> = {};
  private isDirty = false;

  constructor() {
    this.load();
  }

  /**
   * Load settings from file or use defaults
   */
  load(): Record<string, any> {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const loaded = JSON.parse(data);

        // Merge with defaults to ensure all settings exist
        this.settings = this.mergeWithDefaults(loaded);
      } else {
        // Use defaults
        this.settings = this.getDefaults();
      }
    } catch (error) {
      console.error('Failed to load settings, using defaults:', error);
      this.settings = this.getDefaults();
    }

    this.isDirty = false;
    return this.settings;
  }

  /**
   * Save settings to file
   */
  save(settings?: Record<string, any>): boolean {
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
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  /**
   * Get a setting value
   */
  get(key: string): any {
    return this.settings[key];
  }

  /**
   * Set a setting value
   */
  set(key: string, value: any): boolean {
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
  reset(): void {
    this.settings = this.getDefaults();
    this.isDirty = true;
  }

  /**
   * Reset a specific setting to default
   */
  resetKey(key: string): boolean {
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
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  /**
   * Get all settings
   */
  getAll(): Record<string, any> {
    return { ...this.settings };
  }

  /**
   * Get default settings
   */
  private getDefaults(): Record<string, any> {
    const defaults: Record<string, any> = {};
    for (const def of settingsSchema) {
      defaults[def.key] = def.default;
    }
    return defaults;
  }

  /**
   * Merge loaded settings with defaults
   */
  private mergeWithDefaults(loaded: Record<string, any>): Record<string, any> {
    const defaults = this.getDefaults();
    return { ...defaults, ...loaded };
  }

  /**
   * Export settings to JSON string
   */
  export(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * Import settings from JSON string
   */
  import(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      this.settings = this.mergeWithDefaults(imported);
      this.isDirty = true;
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  /**
   * Get settings file path
   */
  getSettingsFilePath(): string {
    return SETTINGS_FILE;
  }
}

// Singleton instance
let settingsManager: SettingsManager | null = null;

export function getSettingsManager(): SettingsManager {
  if (!settingsManager) {
    settingsManager = new SettingsManager();
  }
  return settingsManager;
}
