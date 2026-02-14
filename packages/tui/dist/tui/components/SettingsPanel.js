import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// ─── Settings Panel Component ───────────────────────────────────────────────
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getCategories, getSettingsByCategory, } from '../settings/settingsSchema.js';
import { getSettingsManager } from '../settings/settingsManager.js';
/**
 * Full-featured settings UI component
 */
export function SettingsPanel({ onSave, onCancel }) {
    const settingsManager = getSettingsManager();
    const categories = getCategories();
    const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
    const [selectedSettingIndex, setSelectedSettingIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState(false);
    const [editMode, setEditMode] = useState(null);
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
            }
            else {
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
            }
            else {
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
    const handleEditSubmit = (value) => {
        if (!editMode)
            return;
        const setting = categorySettings.find((s) => s.key === editMode.key);
        if (!setting) {
            setEditMode(null);
            return;
        }
        let parsedValue = value;
        // Parse value based on type
        if (setting.type === 'number') {
            parsedValue = parseFloat(value);
            if (isNaN(parsedValue)) {
                setStatusMessage('Invalid number');
                setTimeout(() => setStatusMessage(''), 3000);
                setEditMode(null);
                return;
            }
        }
        else if (setting.type === 'boolean') {
            parsedValue = value.toLowerCase() === 'true';
        }
        // Update setting
        const success = settingsManager.set(setting.key, parsedValue);
        if (success) {
            setSettings(settingsManager.getAll());
            setStatusMessage(`Updated "${setting.label}" (not saved)`);
        }
        else {
            setStatusMessage(`Failed to update "${setting.label}". Check validation.`);
        }
        setTimeout(() => setStatusMessage(''), 3000);
        setEditMode(null);
    };
    // Filter settings by search query
    function filterSettings(query) {
        const lowerQuery = query.toLowerCase();
        const allSettings = [];
        categories.forEach((cat) => {
            allSettings.push(...getSettingsByCategory(cat));
        });
        return allSettings.filter((s) => s.label.toLowerCase().includes(lowerQuery) ||
            s.description.toLowerCase().includes(lowerQuery) ||
            s.key.toLowerCase().includes(lowerQuery));
    }
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsxs(Box, { paddingX: 1, paddingY: 1, borderStyle: "bold", borderColor: "cyan", children: [_jsx(Text, { bold: true, color: "cyan", children: "\u2699 Settings" }), settingsManager.hasUnsavedChanges() && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { color: "yellow", children: "\u25CF Unsaved changes" })] }))] }), _jsx(Box, { paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "gray", children: searchMode ? (_jsxs(Box, { children: [_jsx(Text, { dimColor: true, children: "Search: " }), _jsx(TextInput, { value: searchQuery, onChange: setSearchQuery, onSubmit: () => setSearchMode(false) })] })) : (_jsx(Text, { dimColor: true, children: "Press \"/\" to search, \"e\" to edit, \"s\" to save, \"q\" to quit" })) }), !searchMode && (_jsx(Box, { paddingX: 1, borderStyle: "single", borderColor: "gray", children: categories.map((cat, idx) => {
                    const isSelected = idx === selectedCategoryIndex;
                    return (_jsx(Box, { marginRight: 1, children: _jsx(Text, { bold: isSelected, color: isSelected ? 'cyan' : 'gray', underline: isSelected, children: cat }) }, cat));
                }) })), _jsx(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, paddingY: 1, children: categorySettings.length === 0 ? (_jsx(Text, { dimColor: true, children: "No settings found" })) : (categorySettings.map((setting, idx) => {
                    const isSelected = idx === selectedSettingIndex;
                    const currentValue = settings[setting.key];
                    const isEditing = editMode?.key === setting.key;
                    return (_jsxs(Box, { flexDirection: "column", marginBottom: idx < categorySettings.length - 1 ? 1 : 0, children: [_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? 'cyan' : 'gray', children: isSelected ? '▶ ' : '  ' }), _jsx(Text, { bold: isSelected, color: isSelected ? 'white' : 'gray', children: setting.label }), searchMode && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { dimColor: true, children: setting.category })] }))] }), _jsx(Box, { marginLeft: 3, children: _jsx(Text, { dimColor: true, children: setting.description }) }), _jsx(Box, { marginLeft: 3, children: isEditing ? (_jsxs(Box, { children: [_jsx(Text, { color: "yellow", children: "Value: " }), _jsx(TextInput, { value: editMode.value, onChange: (val) => setEditMode({ ...editMode, value: val }), onSubmit: handleEditSubmit })] })) : (_jsxs(Box, { children: [_jsx(Text, { dimColor: true, children: "Value: " }), _jsx(Text, { color: getValueColor(setting.type, currentValue), children: formatValue(setting, currentValue) }), setting.type === 'select' && setting.options && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: " \u2502 Options: " }), _jsx(Text, { dimColor: true, children: setting.options.join(', ') })] }))] })) })] }, setting.key));
                })) }), statusMessage && (_jsx(Box, { paddingX: 1, paddingY: 1, borderStyle: "single", borderColor: "yellow", children: _jsx(Text, { color: "yellow", children: statusMessage }) })), _jsx(Box, { paddingX: 1, borderStyle: "single", borderColor: "gray", children: _jsx(Text, { dimColor: true, children: "[\u2191\u2193/jk] Navigate \u2502 [\u2190\u2192/hl] Category \u2502 [e/Enter] Edit \u2502 [Space] Toggle \u2502 [r] Reset \u2502 [s] Save \u2502 [q] Quit" }) })] }));
}
function getValueColor(type, value) {
    if (type === 'boolean') {
        return value ? 'green' : 'red';
    }
    if (type === 'number') {
        return 'cyan';
    }
    return 'white';
}
function formatValue(setting, value) {
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
//# sourceMappingURL=SettingsPanel.js.map