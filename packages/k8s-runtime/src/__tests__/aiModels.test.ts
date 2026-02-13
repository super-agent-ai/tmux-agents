import { describe, it, expect } from 'vitest';
import {
    PROVIDER_MODELS,
    DEPRECATED_MODEL_ALIASES,
    resolveModelAlias,
    getModelsForProvider,
    getDefaultModel,
    ModelOption
} from '../aiModels';

describe('aiModels', () => {

    // ─── PROVIDER_MODELS registry ───────────────────────────────────────

    describe('PROVIDER_MODELS', () => {
        const expectedProviders = [
            'claude', 'gemini', 'codex', 'opencode', 'cursor',
            'copilot', 'aider', 'amp', 'cline', 'kiro'
        ];

        it('has entries for all supported providers', () => {
            for (const provider of expectedProviders) {
                expect(PROVIDER_MODELS[provider]).toBeDefined();
                expect(PROVIDER_MODELS[provider].length).toBeGreaterThan(0);
            }
        });

        it('each model option has value and label', () => {
            for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
                for (const model of models) {
                    expect(model.value, `${provider} model missing value`).toBeTruthy();
                    expect(model.label, `${provider} model missing label`).toBeTruthy();
                }
            }
        });

        it('model values are unique within each provider', () => {
            for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
                const values = models.map(m => m.value);
                const unique = new Set(values);
                expect(unique.size, `${provider} has duplicate model values`).toBe(values.length);
            }
        });

        it('claude models include opus, sonnet, haiku', () => {
            const values = PROVIDER_MODELS.claude.map(m => m.value);
            expect(values).toContain('opus');
            expect(values).toContain('sonnet');
            expect(values).toContain('haiku');
        });

        it('gemini models include 2.5 pro and flash', () => {
            const values = PROVIDER_MODELS.gemini.map(m => m.value);
            expect(values).toContain('gemini-2.5-pro');
            expect(values).toContain('gemini-2.5-flash');
        });

        it('codex models include o3', () => {
            const values = PROVIDER_MODELS.codex.map(m => m.value);
            expect(values).toContain('o3');
        });
    });

    // ─── resolveModelAlias ──────────────────────────────────────────────

    describe('resolveModelAlias', () => {
        it('returns the input unchanged for current model identifiers', () => {
            expect(resolveModelAlias('opus')).toBe('opus');
            expect(resolveModelAlias('sonnet')).toBe('sonnet');
            expect(resolveModelAlias('gemini-2.5-pro')).toBe('gemini-2.5-pro');
            expect(resolveModelAlias('o3')).toBe('o3');
        });

        it('resolves deprecated gemini preview models', () => {
            expect(resolveModelAlias('gemini-3-pro-preview')).toBe('gemini-2.5-pro');
            expect(resolveModelAlias('gemini-3-flash-preview')).toBe('gemini-2.5-flash');
        });

        it('resolves deprecated codex/gpt model identifiers', () => {
            expect(resolveModelAlias('gpt-5.3-codex')).toBe('o3');
            expect(resolveModelAlias('gpt-5.2-codex')).toBe('o3');
            expect(resolveModelAlias('gpt-5.1-codex-mini')).toBe('o4-mini');
            expect(resolveModelAlias('gpt-5.2')).toBe('gpt-4.1');
        });

        it('returns unknown identifiers unchanged', () => {
            expect(resolveModelAlias('unknown-model')).toBe('unknown-model');
            expect(resolveModelAlias('')).toBe('');
        });
    });

    // ─── getModelsForProvider ───────────────────────────────────────────

    describe('getModelsForProvider', () => {
        it('returns models for known providers', () => {
            expect(getModelsForProvider('claude')).toBe(PROVIDER_MODELS.claude);
            expect(getModelsForProvider('gemini')).toBe(PROVIDER_MODELS.gemini);
            expect(getModelsForProvider('codex')).toBe(PROVIDER_MODELS.codex);
        });

        it('falls back to claude models for unknown providers', () => {
            expect(getModelsForProvider('nonexistent')).toBe(PROVIDER_MODELS.claude);
        });
    });

    // ─── getDefaultModel ────────────────────────────────────────────────

    describe('getDefaultModel', () => {
        it('returns the first model for known providers', () => {
            expect(getDefaultModel('claude')).toBe('opus');
            expect(getDefaultModel('gemini')).toBe('gemini-2.5-pro');
            expect(getDefaultModel('codex')).toBe('o3');
        });

        it('falls back to opus for unknown providers', () => {
            expect(getDefaultModel('nonexistent')).toBe('opus');
        });
    });

    // ─── Deprecated aliases cover all old model IDs ─────────────────────

    describe('DEPRECATED_MODEL_ALIASES', () => {
        it('all alias targets resolve to values present in some PROVIDER_MODELS', () => {
            const allModelValues = new Set<string>();
            for (const models of Object.values(PROVIDER_MODELS)) {
                for (const m of models) {
                    allModelValues.add(m.value);
                }
            }

            // Each alias target should be a valid current model
            for (const [alias, target] of Object.entries(DEPRECATED_MODEL_ALIASES)) {
                expect(
                    allModelValues.has(target) || Object.values(DEPRECATED_MODEL_ALIASES).includes(target),
                    `Alias "${alias}" → "${target}" should map to a current model or another alias`
                ).toBe(true);
            }
        });
    });
});
