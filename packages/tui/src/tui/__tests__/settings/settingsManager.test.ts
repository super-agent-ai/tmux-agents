// ─── Settings Manager Tests ────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SettingsManager } from '../../settings/settingsManager.js';

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;
  const settingsDir = path.join(os.homedir(), '.tmux-agents');
  const settingsFile = path.join(settingsDir, 'tui-settings.json');
  const backupFile = settingsFile + '.backup';

  beforeEach(() => {
    // Backup existing settings if they exist
    if (fs.existsSync(settingsFile)) {
      fs.copyFileSync(settingsFile, backupFile);
    }

    // Remove settings file to start fresh
    if (fs.existsSync(settingsFile)) {
      fs.unlinkSync(settingsFile);
    }

    settingsManager = new SettingsManager();
  });

  afterEach(() => {
    // Restore backup if it exists
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, settingsFile);
      fs.unlinkSync(backupFile);
    }
  });

  describe('load', () => {
    it('should load default settings when no file exists', () => {
      const settings = settingsManager.load();
      expect(settings['daemon.host']).toBe('localhost');
      expect(settings['daemon.port']).toBe(7331);
      expect(settings['display.theme']).toBe('dark');
    });

    it('should load existing settings from file', () => {
      // Create a settings file
      const testSettings = {
        'daemon.host': 'custom-host',
        'daemon.port': 8080,
      };

      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }
      fs.writeFileSync(settingsFile, JSON.stringify(testSettings));

      settingsManager = new SettingsManager();
      const settings = settingsManager.load();

      expect(settings['daemon.host']).toBe('custom-host');
      expect(settings['daemon.port']).toBe(8080);
    });

    it('should merge loaded settings with defaults', () => {
      // Create partial settings file
      const partialSettings = {
        'daemon.host': 'custom-host',
      };

      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }
      fs.writeFileSync(settingsFile, JSON.stringify(partialSettings));

      settingsManager = new SettingsManager();
      const settings = settingsManager.load();

      // Custom setting
      expect(settings['daemon.host']).toBe('custom-host');
      // Default settings still present
      expect(settings['daemon.port']).toBe(7331);
      expect(settings['display.theme']).toBe('dark');
    });
  });

  describe('save', () => {
    it('should save settings to file', () => {
      settingsManager.set('daemon.host', 'test-host');
      const success = settingsManager.save();

      expect(success).toBe(true);
      expect(fs.existsSync(settingsFile)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      expect(saved['daemon.host']).toBe('test-host');
    });

    it('should create directory if it does not exist', () => {
      if (fs.existsSync(settingsDir)) {
        fs.rmSync(settingsDir, { recursive: true });
      }

      settingsManager.set('daemon.host', 'test-host');
      const success = settingsManager.save();

      expect(success).toBe(true);
      expect(fs.existsSync(settingsDir)).toBe(true);
      expect(fs.existsSync(settingsFile)).toBe(true);
    });

    it('should validate settings before saving', () => {
      // Try to set invalid port
      const success = settingsManager.set('daemon.port', 99999);
      expect(success).toBe(false);
    });
  });

  describe('get/set', () => {
    it('should get a setting value', () => {
      const value = settingsManager.get('daemon.host');
      expect(value).toBe('localhost');
    });

    it('should set a valid setting value', () => {
      const success = settingsManager.set('daemon.host', 'new-host');
      expect(success).toBe(true);
      expect(settingsManager.get('daemon.host')).toBe('new-host');
    });

    it('should reject invalid setting key', () => {
      const success = settingsManager.set('invalid.key', 'value');
      expect(success).toBe(false);
    });

    it('should validate number types', () => {
      const success = settingsManager.set('daemon.port', 8080);
      expect(success).toBe(true);

      const invalid = settingsManager.set('daemon.port', 'not-a-number' as any);
      expect(invalid).toBe(false);
    });

    it('should validate boolean types', () => {
      const success = settingsManager.set('daemon.autoConnect', false);
      expect(success).toBe(true);

      const invalid = settingsManager.set('daemon.autoConnect', 'not-a-boolean' as any);
      expect(invalid).toBe(false);
    });

    it('should validate select options', () => {
      const success = settingsManager.set('display.theme', 'light');
      expect(success).toBe(true);

      const invalid = settingsManager.set('display.theme', 'invalid-theme');
      expect(invalid).toBe(false);
    });

    it('should validate number ranges', () => {
      // Valid range
      const success = settingsManager.set('daemon.port', 8080);
      expect(success).toBe(true);

      // Below minimum
      const tooLow = settingsManager.set('daemon.port', 500);
      expect(tooLow).toBe(false);

      // Above maximum
      const tooHigh = settingsManager.set('daemon.port', 100000);
      expect(tooHigh).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all settings to defaults', () => {
      settingsManager.set('daemon.host', 'custom-host');
      settingsManager.set('daemon.port', 8080);

      settingsManager.reset();

      expect(settingsManager.get('daemon.host')).toBe('localhost');
      expect(settingsManager.get('daemon.port')).toBe(7331);
    });

    it('should reset a specific setting to default', () => {
      settingsManager.set('daemon.host', 'custom-host');
      settingsManager.set('daemon.port', 8080);

      const success = settingsManager.resetKey('daemon.host');
      expect(success).toBe(true);

      expect(settingsManager.get('daemon.host')).toBe('localhost');
      expect(settingsManager.get('daemon.port')).toBe(8080);
    });
  });

  describe('hasUnsavedChanges', () => {
    it('should track unsaved changes', () => {
      expect(settingsManager.hasUnsavedChanges()).toBe(false);

      settingsManager.set('daemon.host', 'new-host');
      expect(settingsManager.hasUnsavedChanges()).toBe(true);

      settingsManager.save();
      expect(settingsManager.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('export/import', () => {
    it('should export settings as JSON', () => {
      settingsManager.set('daemon.host', 'export-test');
      const json = settingsManager.export();

      expect(json).toContain('export-test');
      const parsed = JSON.parse(json);
      expect(parsed['daemon.host']).toBe('export-test');
    });

    it('should import settings from JSON', () => {
      const importData = {
        'daemon.host': 'import-test',
        'daemon.port': 9000,
      };

      const success = settingsManager.import(JSON.stringify(importData));
      expect(success).toBe(true);

      expect(settingsManager.get('daemon.host')).toBe('import-test');
      expect(settingsManager.get('daemon.port')).toBe(9000);
    });

    it('should handle invalid JSON on import', () => {
      const success = settingsManager.import('invalid json');
      expect(success).toBe(false);
    });
  });
});
