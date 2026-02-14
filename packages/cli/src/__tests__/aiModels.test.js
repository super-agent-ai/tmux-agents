"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const aiModels_1 = require("../core/aiModels");
(0, vitest_1.describe)('aiModels', () => {
    // ─── PROVIDER_MODELS registry ───────────────────────────────────────
    (0, vitest_1.describe)('PROVIDER_MODELS', () => {
        const expectedProviders = [
            'claude', 'gemini', 'codex', 'opencode', 'cursor',
            'copilot', 'aider', 'amp', 'cline', 'kiro'
        ];
        (0, vitest_1.it)('has entries for all supported providers', () => {
            for (const provider of expectedProviders) {
                (0, vitest_1.expect)(aiModels_1.PROVIDER_MODELS[provider]).toBeDefined();
                (0, vitest_1.expect)(aiModels_1.PROVIDER_MODELS[provider].length).toBeGreaterThan(0);
            }
        });
        (0, vitest_1.it)('each model option has value and label', () => {
            for (const [provider, models] of Object.entries(aiModels_1.PROVIDER_MODELS)) {
                for (const model of models) {
                    (0, vitest_1.expect)(model.value, `${provider} model missing value`).toBeTruthy();
                    (0, vitest_1.expect)(model.label, `${provider} model missing label`).toBeTruthy();
                }
            }
        });
        (0, vitest_1.it)('model values are unique within each provider', () => {
            for (const [provider, models] of Object.entries(aiModels_1.PROVIDER_MODELS)) {
                const values = models.map(m => m.value);
                const unique = new Set(values);
                (0, vitest_1.expect)(unique.size, `${provider} has duplicate model values`).toBe(values.length);
            }
        });
        (0, vitest_1.it)('claude models include opus, sonnet, haiku', () => {
            const values = aiModels_1.PROVIDER_MODELS.claude.map(m => m.value);
            (0, vitest_1.expect)(values).toContain('opus');
            (0, vitest_1.expect)(values).toContain('sonnet');
            (0, vitest_1.expect)(values).toContain('haiku');
        });
        (0, vitest_1.it)('gemini models include 2.5 pro and flash', () => {
            const values = aiModels_1.PROVIDER_MODELS.gemini.map(m => m.value);
            (0, vitest_1.expect)(values).toContain('gemini-2.5-pro');
            (0, vitest_1.expect)(values).toContain('gemini-2.5-flash');
        });
        (0, vitest_1.it)('codex models include o3', () => {
            const values = aiModels_1.PROVIDER_MODELS.codex.map(m => m.value);
            (0, vitest_1.expect)(values).toContain('o3');
        });
    });
    // ─── resolveModelAlias ──────────────────────────────────────────────
    (0, vitest_1.describe)('resolveModelAlias', () => {
        (0, vitest_1.it)('returns the input unchanged for current model identifiers', () => {
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('opus')).toBe('opus');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('sonnet')).toBe('sonnet');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gemini-2.5-pro')).toBe('gemini-2.5-pro');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('o3')).toBe('o3');
        });
        (0, vitest_1.it)('resolves deprecated gemini preview models', () => {
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gemini-3-pro-preview')).toBe('gemini-2.5-pro');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gemini-3-flash-preview')).toBe('gemini-2.5-flash');
        });
        (0, vitest_1.it)('resolves deprecated codex/gpt model identifiers', () => {
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gpt-5.3-codex')).toBe('o3');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gpt-5.2-codex')).toBe('o3');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gpt-5.1-codex-mini')).toBe('o4-mini');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('gpt-5.2')).toBe('gpt-4.1');
        });
        (0, vitest_1.it)('returns unknown identifiers unchanged', () => {
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('unknown-model')).toBe('unknown-model');
            (0, vitest_1.expect)((0, aiModels_1.resolveModelAlias)('')).toBe('');
        });
    });
    // ─── getModelsForProvider ───────────────────────────────────────────
    (0, vitest_1.describe)('getModelsForProvider', () => {
        (0, vitest_1.it)('returns models for known providers', () => {
            (0, vitest_1.expect)((0, aiModels_1.getModelsForProvider)('claude')).toBe(aiModels_1.PROVIDER_MODELS.claude);
            (0, vitest_1.expect)((0, aiModels_1.getModelsForProvider)('gemini')).toBe(aiModels_1.PROVIDER_MODELS.gemini);
            (0, vitest_1.expect)((0, aiModels_1.getModelsForProvider)('codex')).toBe(aiModels_1.PROVIDER_MODELS.codex);
        });
        (0, vitest_1.it)('falls back to claude models for unknown providers', () => {
            (0, vitest_1.expect)((0, aiModels_1.getModelsForProvider)('nonexistent')).toBe(aiModels_1.PROVIDER_MODELS.claude);
        });
    });
    // ─── getDefaultModel ────────────────────────────────────────────────
    (0, vitest_1.describe)('getDefaultModel', () => {
        (0, vitest_1.it)('returns the first model for known providers', () => {
            (0, vitest_1.expect)((0, aiModels_1.getDefaultModel)('claude')).toBe('opus');
            (0, vitest_1.expect)((0, aiModels_1.getDefaultModel)('gemini')).toBe('gemini-2.5-pro');
            (0, vitest_1.expect)((0, aiModels_1.getDefaultModel)('codex')).toBe('o3');
        });
        (0, vitest_1.it)('falls back to opus for unknown providers', () => {
            (0, vitest_1.expect)((0, aiModels_1.getDefaultModel)('nonexistent')).toBe('opus');
        });
    });
    // ─── Deprecated aliases cover all old model IDs ─────────────────────
    (0, vitest_1.describe)('DEPRECATED_MODEL_ALIASES', () => {
        (0, vitest_1.it)('all alias targets resolve to values present in some PROVIDER_MODELS', () => {
            const allModelValues = new Set();
            for (const models of Object.values(aiModels_1.PROVIDER_MODELS)) {
                for (const m of models) {
                    allModelValues.add(m.value);
                }
            }
            // Each alias target should be a valid current model
            for (const [alias, target] of Object.entries(aiModels_1.DEPRECATED_MODEL_ALIASES)) {
                (0, vitest_1.expect)(allModelValues.has(target) || Object.values(aiModels_1.DEPRECATED_MODEL_ALIASES).includes(target), `Alias "${alias}" → "${target}" should map to a current model or another alias`).toBe(true);
            }
        });
    });
});
//# sourceMappingURL=aiModels.test.js.map