// ─── Settings Panel Component ───────────────────────────────────────────────

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  getCategories,
  getSettingsByCategory,
  type SettingDefinition,
} from '../settings/settingsSchema.js';
import { getSettingsManager } from '../settings/settingsManager.js';

interface SettingsPanelProps {
  onSave?: () => void;
  onCancel?: () => void;
}

type EditMode = {
  key: string;
  value: string;
} | null;

/**
 * Full-featured settings UI component
 */
export function SettingsPanel({ onSave, onCancel }: SettingsPanelProps) {
  const settingsManager = getSettingsManager();
  const categories = getCategories();

  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [settings, setSettings] = useState(settingsManager.getAll());
  const [statusMessage, setStatusMessage] = useState('');

  const currentCategory = categories[selectedCategoryIndex];
  const categorySettings = searchMode
    ? filterSettings(searchQuery)
    : getSettingsByCategory(currentCategory);

  // Handle keyboard input
  useInput((input, key) => {
    // If in edit mode, let TextInput handle it
    if (editMode) {
      return;
    }

    // If in search mode
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery('');
        setSelectedSettingIndex(0);
      }
      return;
    }

    // Global shortcuts
    if (input === 'q' || key.escape) {
      if (settingsManager.hasUnsavedChanges()) {
        setStatusMessage('Unsaved changes! Press "s" to save or "Q" to quit without saving.');
      } else {
        onCancel?.();
      }
      return;
    }

    if (input === 'Q') {
      // Force quit without saving
      onCancel?.();
      return;
    }

    // Save
    if (input === 's') {
      const success = settingsManager.save(settings);
      if (success) {
        setStatusMessage('Settings saved successfully!');
        onSave?.();
      } else {
        setStatusMessage('Failed to save settings. Check validation errors.');
      }
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    // Reset all to defaults
    if (input === 'R') {
      settingsManager.reset();
      setSettings(settingsManager.getAll());
      setStatusMessage('All settings reset to defaults (not saved)');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    // Reset current setting to default
    if (input === 'r') {
      const setting = categorySettings[selectedSettingIndex];
      if (setting) {
        settingsManager.resetKey(setting.key);
        setSettings(settingsManager.getAll());
        setStatusMessage(`Reset "${setting.label}" to default (not saved)`);
        setTimeout(() => setStatusMessage(''), 3000);
      }
      return;
    }

    // Search mode
    if (input === '/') {
      setSearchMode(true);
      return;
    }

    // Edit mode
    if (input === 'e' || key.return) {
      const setting = categorySettings[selectedSettingIndex];
      if (setting) {
        const currentValue = settings[setting.key];
        setEditMode({
          key: setting.key,
          value: String(currentValue),
        });
      }
      return;
    }

    // Navigation - Category tabs
    if (input === 'h' || key.leftArrow) {
      setSelectedCategoryIndex((prev) => Math.max(0, prev - 1));
      setSelectedSettingIndex(0);
      return;
    }
    if (input === 'l' || key.rightArrow) {
      setSelectedCategoryIndex((prev) => Math.min(categories.length - 1, prev + 1));
      setSelectedSettingIndex(0);
      return;
    }

    // Navigation - Settings list
    if (input === 'j' || key.downArrow) {
      setSelectedSettingIndex((prev) => Math.min(categorySettings.length - 1, prev + 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setSelectedSettingIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    // Toggle boolean settings with space
    if (input === ' ') {
      const setting = categorySettings[selectedSettingIndex];
      if (setting && setting.type === 'boolean') {
        const newValue = !settings[setting.key];
        settingsManager.set(setting.key, newValue);
        setSettings(settingsManager.getAll());
      }
      return;
    }
  });

  // Handle edit mode submission
  const handleEditSubmit = (value: string) => {
    if (!editMode) return;

    const setting = categorySettings.find((s) => s.key === editMode.key);
    if (!setting) {
      setEditMode(null);
      return;
    }

    let parsedValue: any = value;

    // Parse value based on type
    if (setting.type === 'number') {
      parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) {
        setStatusMessage('Invalid number');
        setTimeout(() => setStatusMessage(''), 3000);
        setEditMode(null);
        return;
      }
    } else if (setting.type === 'boolean') {
      parsedValue = value.toLowerCase() === 'true';
    }

    // Update setting
    const success = settingsManager.set(setting.key, parsedValue);
    if (success) {
      setSettings(settingsManager.getAll());
      setStatusMessage(`Updated "${setting.label}" (not saved)`);
    } else {
      setStatusMessage(`Failed to update "${setting.label}". Check validation.`);
    }

    setTimeout(() => setStatusMessage(''), 3000);
    setEditMode(null);
  };

  // Filter settings by search query
  function filterSettings(query: string): SettingDefinition[] {
    const lowerQuery = query.toLowerCase();
    const allSettings: SettingDefinition[] = [];
    categories.forEach((cat) => {
      allSettings.push(...getSettingsByCategory(cat));
    });
    return allSettings.filter(
      (s) =>
        s.label.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.key.toLowerCase().includes(lowerQuery)
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Title */}
      <Box paddingX={1} paddingY={1} borderStyle="bold" borderColor="cyan">
        <Text bold color="cyan">
          ⚙ Settings
        </Text>
        {settingsManager.hasUnsavedChanges() && (
          <>
            <Text dimColor> │ </Text>
            <Text color="yellow">● Unsaved changes</Text>
          </>
        )}
      </Box>

      {/* Search bar */}
      <Box paddingX={1} paddingY={1} borderStyle="single" borderColor="gray">
        {searchMode ? (
          <Box>
            <Text dimColor>Search: </Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => setSearchMode(false)}
            />
          </Box>
        ) : (
          <Text dimColor>Press "/" to search, "e" to edit, "s" to save, "q" to quit</Text>
        )}
      </Box>

      {/* Category tabs (if not in search mode) */}
      {!searchMode && (
        <Box paddingX={1} borderStyle="single" borderColor="gray">
          {categories.map((cat, idx) => {
            const isSelected = idx === selectedCategoryIndex;
            return (
              <Box key={cat} marginRight={1}>
                <Text
                  bold={isSelected}
                  color={isSelected ? 'cyan' : 'gray'}
                  underline={isSelected}
                >
                  {cat}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Settings list */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {categorySettings.length === 0 ? (
          <Text dimColor>No settings found</Text>
        ) : (
          categorySettings.map((setting, idx) => {
            const isSelected = idx === selectedSettingIndex;
            const currentValue = settings[setting.key];
            const isEditing = editMode?.key === setting.key;

            return (
              <Box
                key={setting.key}
                flexDirection="column"
                marginBottom={idx < categorySettings.length - 1 ? 1 : 0}
              >
                {/* Setting name */}
                <Box>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}</Text>
                  <Text bold={isSelected} color={isSelected ? 'white' : 'gray'}>
                    {setting.label}
                  </Text>
                  {searchMode && (
                    <>
                      <Text dimColor> │ </Text>
                      <Text dimColor>{setting.category}</Text>
                    </>
                  )}
                </Box>

                {/* Description */}
                <Box marginLeft={3}>
                  <Text dimColor>{setting.description}</Text>
                </Box>

                {/* Current value or edit input */}
                <Box marginLeft={3}>
                  {isEditing ? (
                    <Box>
                      <Text color="yellow">Value: </Text>
                      <TextInput
                        value={editMode.value}
                        onChange={(val) => setEditMode({ ...editMode, value: val })}
                        onSubmit={handleEditSubmit}
                      />
                    </Box>
                  ) : (
                    <Box>
                      <Text dimColor>Value: </Text>
                      <Text color={getValueColor(setting.type, currentValue)}>
                        {formatValue(setting, currentValue)}
                      </Text>
                      {setting.type === 'select' && setting.options && (
                        <>
                          <Text dimColor> │ Options: </Text>
                          <Text dimColor>{setting.options.join(', ')}</Text>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Status message */}
      {statusMessage && (
        <Box paddingX={1} paddingY={1} borderStyle="single" borderColor="yellow">
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}

      {/* Footer with keybindings */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text dimColor>
          [↑↓/jk] Navigate │ [←→/hl] Category │ [e/Enter] Edit │ [Space] Toggle │ [r] Reset │ [s] Save │ [q] Quit
        </Text>
      </Box>
    </Box>
  );
}

function getValueColor(type: string, value: any): string {
  if (type === 'boolean') {
    return value ? 'green' : 'red';
  }
  if (type === 'number') {
    return 'cyan';
  }
  return 'white';
}

function formatValue(setting: SettingDefinition, value: any): string {
  if (setting.type === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (setting.type === 'number') {
    return String(value);
  }
  if (setting.type === 'select') {
    return String(value);
  }
  return String(value);
}
