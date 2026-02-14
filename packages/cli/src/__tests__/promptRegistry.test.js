"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const promptRegistry_1 = require("../core/promptRegistry");
(0, vitest_1.describe)('PromptRegistry', () => {
    let registry;
    (0, vitest_1.beforeEach)(() => {
        registry = new promptRegistry_1.PromptRegistry();
        registry.load();
    });
    // ─── Loading ─────────────────────────────────────────────────────────────
    (0, vitest_1.describe)('load', () => {
        (0, vitest_1.it)('loads all default prompt templates', () => {
            const templates = registry.getAllTemplates();
            (0, vitest_1.expect)(templates.length).toBeGreaterThanOrEqual(3);
        });
        (0, vitest_1.it)('loads templates with required fields', () => {
            for (const template of registry.getAllTemplates()) {
                (0, vitest_1.expect)(template.slug).toBeTruthy();
                (0, vitest_1.expect)(template.name).toBeTruthy();
                (0, vitest_1.expect)(template.description).toBeTruthy();
                (0, vitest_1.expect)(template.category).toBeTruthy();
                (0, vitest_1.expect)(template.version).toBeTruthy();
                (0, vitest_1.expect)(template.prompt).toBeTruthy();
                (0, vitest_1.expect)(Array.isArray(template.inputs)).toBe(true);
            }
        });
        (0, vitest_1.it)('is idempotent — multiple loads produce same result', () => {
            registry.load();
            registry.load();
            const templates = registry.getAllTemplates();
            (0, vitest_1.expect)(templates.length).toBeGreaterThanOrEqual(3);
        });
    });
    // ─── Read Operations ─────────────────────────────────────────────────────
    (0, vitest_1.describe)('getTemplate', () => {
        (0, vitest_1.it)('returns template by slug', () => {
            const template = registry.getTemplate('create-test-plans');
            (0, vitest_1.expect)(template).toBeDefined();
            (0, vitest_1.expect)(template.slug).toBe('create-test-plans');
            (0, vitest_1.expect)(template.name).toBe('Create Test Plans');
        });
        (0, vitest_1.it)('returns undefined for unknown slug', () => {
            (0, vitest_1.expect)(registry.getTemplate('nonexistent')).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('has', () => {
        (0, vitest_1.it)('returns true for known slugs', () => {
            (0, vitest_1.expect)(registry.has('create-test-plans')).toBe(true);
            (0, vitest_1.expect)(registry.has('auto-pass-tests')).toBe(true);
            (0, vitest_1.expect)(registry.has('install-plugins')).toBe(true);
        });
        (0, vitest_1.it)('returns false for unknown slugs', () => {
            (0, vitest_1.expect)(registry.has('nonexistent')).toBe(false);
        });
    });
    (0, vitest_1.describe)('getTemplatesByCategory', () => {
        (0, vitest_1.it)('filters templates by category', () => {
            const testingTemplates = registry.getTemplatesByCategory('testing');
            (0, vitest_1.expect)(testingTemplates.length).toBeGreaterThanOrEqual(2);
            for (const t of testingTemplates) {
                (0, vitest_1.expect)(t.category).toBe('testing');
            }
        });
        (0, vitest_1.it)('returns empty for unknown category', () => {
            (0, vitest_1.expect)(registry.getTemplatesByCategory('nonexistent')).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('getCategories', () => {
        (0, vitest_1.it)('returns unique categories sorted', () => {
            const categories = registry.getCategories();
            (0, vitest_1.expect)(categories).toContain('testing');
            (0, vitest_1.expect)(categories).toContain('devops');
            // Verify sorted
            const sorted = [...categories].sort();
            (0, vitest_1.expect)(categories).toEqual(sorted);
        });
    });
    // ─── Specific Templates ──────────────────────────────────────────────────
    (0, vitest_1.describe)('create-test-plans template', () => {
        (0, vitest_1.it)('has requirements as required input', () => {
            const template = registry.getTemplate('create-test-plans');
            const reqInput = template.inputs.find(i => i.name === 'requirements');
            (0, vitest_1.expect)(reqInput).toBeDefined();
            (0, vitest_1.expect)(reqInput.required).toBe(true);
        });
        (0, vitest_1.it)('has format as optional input with default', () => {
            const template = registry.getTemplate('create-test-plans');
            const fmtInput = template.inputs.find(i => i.name === 'format');
            (0, vitest_1.expect)(fmtInput).toBeDefined();
            (0, vitest_1.expect)(fmtInput.required).toBe(false);
            (0, vitest_1.expect)(fmtInput.default).toBe('markdown');
        });
    });
    (0, vitest_1.describe)('auto-pass-tests template', () => {
        (0, vitest_1.it)('has testSuite as required input', () => {
            const template = registry.getTemplate('auto-pass-tests');
            const input = template.inputs.find(i => i.name === 'testSuite');
            (0, vitest_1.expect)(input).toBeDefined();
            (0, vitest_1.expect)(input.required).toBe(true);
        });
        (0, vitest_1.it)('has testCommand as optional input', () => {
            const template = registry.getTemplate('auto-pass-tests');
            const input = template.inputs.find(i => i.name === 'testCommand');
            (0, vitest_1.expect)(input).toBeDefined();
            (0, vitest_1.expect)(input.required).toBe(false);
            (0, vitest_1.expect)(input.default).toBe('npm test');
        });
    });
    (0, vitest_1.describe)('install-plugins template', () => {
        (0, vitest_1.it)('has plugins as required input', () => {
            const template = registry.getTemplate('install-plugins');
            const input = template.inputs.find(i => i.name === 'plugins');
            (0, vitest_1.expect)(input).toBeDefined();
            (0, vitest_1.expect)(input.required).toBe(true);
        });
        (0, vitest_1.it)('has registry as optional input', () => {
            const template = registry.getTemplate('install-plugins');
            const input = template.inputs.find(i => i.name === 'registry');
            (0, vitest_1.expect)(input).toBeDefined();
            (0, vitest_1.expect)(input.required).toBe(false);
            (0, vitest_1.expect)(input.default).toBe('npm');
        });
    });
    // ─── Validation ──────────────────────────────────────────────────────────
    (0, vitest_1.describe)('validateInputs', () => {
        (0, vitest_1.it)('returns empty array for valid inputs', () => {
            const errors = registry.validateInputs('create-test-plans', {
                requirements: 'User can log in with email and password',
            });
            (0, vitest_1.expect)(errors).toHaveLength(0);
        });
        (0, vitest_1.it)('returns error for missing required input', () => {
            const errors = registry.validateInputs('create-test-plans', {});
            (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(errors[0].field).toBe('requirements');
        });
        (0, vitest_1.it)('returns error for empty required input', () => {
            const errors = registry.validateInputs('create-test-plans', {
                requirements: '   ',
            });
            (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(errors[0].field).toBe('requirements');
        });
        (0, vitest_1.it)('returns error for unknown slug', () => {
            const errors = registry.validateInputs('nonexistent', {});
            (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(errors[0].field).toBe('slug');
        });
        (0, vitest_1.it)('does not require optional inputs', () => {
            const errors = registry.validateInputs('auto-pass-tests', {
                testSuite: 'src/__tests__/*.test.ts',
            });
            (0, vitest_1.expect)(errors).toHaveLength(0);
        });
        (0, vitest_1.it)('validates auto-pass-tests missing testSuite', () => {
            const errors = registry.validateInputs('auto-pass-tests', {});
            (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(errors[0].field).toBe('testSuite');
        });
        (0, vitest_1.it)('validates install-plugins missing plugins', () => {
            const errors = registry.validateInputs('install-plugins', {});
            (0, vitest_1.expect)(errors.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(errors[0].field).toBe('plugins');
        });
    });
    // ─── Prompt Resolution ───────────────────────────────────────────────────
    (0, vitest_1.describe)('resolvePrompt', () => {
        (0, vitest_1.it)('resolves create-test-plans prompt with inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {
                requirements: 'Users can register with email',
                format: 'json',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('Users can register with email');
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('json');
            (0, vitest_1.expect)(result.resolvedPrompt).not.toContain('{{requirements}}');
            (0, vitest_1.expect)(result.resolvedPrompt).not.toContain('{{format}}');
        });
        (0, vitest_1.it)('resolves with default values for optional inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {
                requirements: 'Some requirements',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('markdown');
        });
        (0, vitest_1.it)('resolves auto-pass-tests prompt', () => {
            const result = registry.resolvePrompt('auto-pass-tests', {
                testSuite: 'src/__tests__/*.test.ts',
                testCommand: 'npx vitest run',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('src/__tests__/*.test.ts');
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('npx vitest run');
        });
        (0, vitest_1.it)('resolves install-plugins prompt', () => {
            const result = registry.resolvePrompt('install-plugins', {
                plugins: 'lodash, express, cors',
                registry: 'npm',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('lodash, express, cors');
            (0, vitest_1.expect)(result.resolvedPrompt).toContain('npm');
        });
        (0, vitest_1.it)('fails for unknown slug', () => {
            const result = registry.resolvePrompt('nonexistent', {});
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('Unknown prompt template');
        });
        (0, vitest_1.it)('fails for missing required inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {});
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.error).toContain('requirements');
        });
        (0, vitest_1.it)('replaces all placeholder occurrences', () => {
            const result = registry.resolvePrompt('auto-pass-tests', {
                testSuite: 'my-tests',
            });
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.resolvedPrompt).not.toContain('{{testSuite}}');
            (0, vitest_1.expect)(result.resolvedPrompt).not.toContain('{{testCommand}}');
        });
    });
    // ─── Dispose ─────────────────────────────────────────────────────────────
    (0, vitest_1.describe)('dispose', () => {
        (0, vitest_1.it)('clears all templates', () => {
            registry.dispose();
            // After dispose, re-load should work
            registry.load();
            (0, vitest_1.expect)(registry.getAllTemplates().length).toBeGreaterThanOrEqual(3);
        });
    });
});
//# sourceMappingURL=promptRegistry.test.js.map