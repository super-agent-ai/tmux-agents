"use strict";
// ─── Shared AI Provider Model Definitions ────────────────────────────────────
//
// Central registry of model identifiers for each AI provider.
// Used by chatView, kanbanView, and anywhere else that needs provider-model lists.
//
// When upstream providers add/remove/rename models, update ONLY this file.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPRECATED_MODEL_ALIASES = exports.PROVIDER_MODELS = void 0;
exports.resolveModelAlias = resolveModelAlias;
exports.getModelsForProvider = getModelsForProvider;
exports.getDefaultModel = getDefaultModel;
/**
 * Canonical model options for every supported AI provider.
 *
 * Ordering convention: most capable / recommended model first.
 */
exports.PROVIDER_MODELS = {
    claude: [
        { value: 'opus', label: 'Opus 4.6' },
        { value: 'sonnet', label: 'Sonnet 4.5' },
        { value: 'haiku', label: 'Haiku 4.5' },
        { value: 'opusplan', label: 'Opus Plan' },
    ],
    gemini: [
        { value: 'gemini-2.5-pro', label: '2.5 Pro' },
        { value: 'gemini-2.5-flash', label: '2.5 Flash' },
        { value: 'gemini-2.5-flash-lite', label: '2.5 Flash Lite' },
    ],
    codex: [
        { value: 'o3', label: 'o3' },
        { value: 'o4-mini', label: 'o4-mini' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    opencode: [
        { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
        { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
        { value: 'openai/o3', label: 'o3' },
        { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    cursor: [
        { value: 'auto', label: 'Auto' },
        { value: 'claude-4.6-opus', label: 'Claude 4.6 Opus' },
        { value: 'claude-4.5-sonnet', label: 'Claude 4.5 Sonnet' },
        { value: 'gpt-5.2', label: 'GPT-5.2' },
        { value: 'gpt-5', label: 'GPT-5' },
        { value: 'gemini-3-pro', label: 'Gemini 3 Pro' },
        { value: 'composer-1.5', label: 'Composer 1.5' },
    ],
    copilot: [
        { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
        { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'o3-mini', label: 'o3-mini' },
    ],
    aider: [
        { value: 'sonnet', label: 'Claude Sonnet' },
        { value: 'opus', label: 'Claude Opus' },
        { value: 'gemini/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'o3', label: 'o3' },
        { value: 'deepseek', label: 'DeepSeek' },
    ],
    amp: [
        { value: 'smart', label: 'Smart (Opus 4.6)' },
        { value: 'rush', label: 'Rush (Haiku 4.5)' },
        { value: 'auto', label: 'Auto' },
    ],
    cline: [
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
        { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    kiro: [
        { value: 'auto', label: 'Auto' },
        { value: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
        { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
        { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
        { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    ],
};
// ─── Deprecated Model Alias Map ──────────────────────────────────────────────
//
// Maps old/deprecated model identifiers to their current replacements.
// Used to provide graceful fallback when a user's config or saved conversation
// references a model ID that has been superseded.
exports.DEPRECATED_MODEL_ALIASES = {
    // Gemini preview → stable
    'gemini-3-pro-preview': 'gemini-2.5-pro',
    'gemini-3-flash-preview': 'gemini-2.5-flash',
    // Codex/GPT renames
    'gpt-5.3-codex': 'o3',
    'gpt-5.2-codex': 'o3',
    'gpt-5.1-codex-mini': 'o4-mini',
    'gpt-5.2': 'gpt-4.1',
    'gpt-5': 'gpt-4o',
    // Cursor renames
    'claude-4-opus': 'claude-4.6-opus',
    'claude-3.5-sonnet': 'claude-4.5-sonnet',
    'gpt-4o': 'gpt-5',
    'sonnet-4': 'claude-4.6-opus',
    'opus-4.1': 'claude-4.6-opus',
    'composer': 'composer-1.5',
    // Copilot renames
    'claude-sonnet-4.5': 'claude-sonnet-4',
    'claude-haiku-4.5': 'claude-3.5-sonnet',
    // OpenCode renames
    'openai/gpt-5.2': 'openai/o3',
    // Aider renames
    'o3-pro': 'o3',
    // Amp renames
    'deep': 'auto',
    // Cline renames
    'kimi-k2.5': 'gemini-2.5-pro',
    // Kiro renames
    'claude-opus-4.5': 'claude-opus-4.6',
};
/**
 * Resolve a model identifier, mapping deprecated aliases to their current value.
 * Returns the input unchanged if no alias is found.
 */
function resolveModelAlias(model) {
    return exports.DEPRECATED_MODEL_ALIASES[model] || model;
}
/**
 * Return the model options for a given provider, falling back to claude models.
 */
function getModelsForProvider(provider) {
    return exports.PROVIDER_MODELS[provider] || exports.PROVIDER_MODELS.claude;
}
/**
 * Return the default (first) model value for a given provider.
 */
function getDefaultModel(provider) {
    const models = getModelsForProvider(provider);
    return models[0]?.value || 'opus';
}
//# sourceMappingURL=aiModels.js.map