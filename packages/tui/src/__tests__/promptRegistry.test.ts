import { describe, it, expect, beforeEach } from 'vitest';
import { PromptRegistry } from '../promptRegistry';

describe('PromptRegistry', () => {
    let registry: PromptRegistry;

    beforeEach(() => {
        registry = new PromptRegistry();
        registry.load();
    });

    // ─── Loading ─────────────────────────────────────────────────────────────

    describe('load', () => {
        it('loads all default prompt templates', () => {
            const templates = registry.getAllTemplates();
            expect(templates.length).toBeGreaterThanOrEqual(3);
        });

        it('loads templates with required fields', () => {
            for (const template of registry.getAllTemplates()) {
                expect(template.slug).toBeTruthy();
                expect(template.name).toBeTruthy();
                expect(template.description).toBeTruthy();
                expect(template.category).toBeTruthy();
                expect(template.version).toBeTruthy();
                expect(template.prompt).toBeTruthy();
                expect(Array.isArray(template.inputs)).toBe(true);
            }
        });

        it('is idempotent — multiple loads produce same result', () => {
            registry.load();
            registry.load();
            const templates = registry.getAllTemplates();
            expect(templates.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ─── Read Operations ─────────────────────────────────────────────────────

    describe('getTemplate', () => {
        it('returns template by slug', () => {
            const template = registry.getTemplate('create-test-plans');
            expect(template).toBeDefined();
            expect(template!.slug).toBe('create-test-plans');
            expect(template!.name).toBe('Create Test Plans');
        });

        it('returns undefined for unknown slug', () => {
            expect(registry.getTemplate('nonexistent')).toBeUndefined();
        });
    });

    describe('has', () => {
        it('returns true for known slugs', () => {
            expect(registry.has('create-test-plans')).toBe(true);
            expect(registry.has('auto-pass-tests')).toBe(true);
            expect(registry.has('install-plugins')).toBe(true);
        });

        it('returns false for unknown slugs', () => {
            expect(registry.has('nonexistent')).toBe(false);
        });
    });

    describe('getTemplatesByCategory', () => {
        it('filters templates by category', () => {
            const testingTemplates = registry.getTemplatesByCategory('testing');
            expect(testingTemplates.length).toBeGreaterThanOrEqual(2);
            for (const t of testingTemplates) {
                expect(t.category).toBe('testing');
            }
        });

        it('returns empty for unknown category', () => {
            expect(registry.getTemplatesByCategory('nonexistent')).toHaveLength(0);
        });
    });

    describe('getCategories', () => {
        it('returns unique categories sorted', () => {
            const categories = registry.getCategories();
            expect(categories).toContain('testing');
            expect(categories).toContain('devops');
            // Verify sorted
            const sorted = [...categories].sort();
            expect(categories).toEqual(sorted);
        });
    });

    // ─── Specific Templates ──────────────────────────────────────────────────

    describe('create-test-plans template', () => {
        it('has requirements as required input', () => {
            const template = registry.getTemplate('create-test-plans')!;
            const reqInput = template.inputs.find(i => i.name === 'requirements');
            expect(reqInput).toBeDefined();
            expect(reqInput!.required).toBe(true);
        });

        it('has format as optional input with default', () => {
            const template = registry.getTemplate('create-test-plans')!;
            const fmtInput = template.inputs.find(i => i.name === 'format');
            expect(fmtInput).toBeDefined();
            expect(fmtInput!.required).toBe(false);
            expect(fmtInput!.default).toBe('markdown');
        });
    });

    describe('auto-pass-tests template', () => {
        it('has testSuite as required input', () => {
            const template = registry.getTemplate('auto-pass-tests')!;
            const input = template.inputs.find(i => i.name === 'testSuite');
            expect(input).toBeDefined();
            expect(input!.required).toBe(true);
        });

        it('has testCommand as optional input', () => {
            const template = registry.getTemplate('auto-pass-tests')!;
            const input = template.inputs.find(i => i.name === 'testCommand');
            expect(input).toBeDefined();
            expect(input!.required).toBe(false);
            expect(input!.default).toBe('npm test');
        });
    });

    describe('install-plugins template', () => {
        it('has plugins as required input', () => {
            const template = registry.getTemplate('install-plugins')!;
            const input = template.inputs.find(i => i.name === 'plugins');
            expect(input).toBeDefined();
            expect(input!.required).toBe(true);
        });

        it('has registry as optional input', () => {
            const template = registry.getTemplate('install-plugins')!;
            const input = template.inputs.find(i => i.name === 'registry');
            expect(input).toBeDefined();
            expect(input!.required).toBe(false);
            expect(input!.default).toBe('npm');
        });
    });

    // ─── Validation ──────────────────────────────────────────────────────────

    describe('validateInputs', () => {
        it('returns empty array for valid inputs', () => {
            const errors = registry.validateInputs('create-test-plans', {
                requirements: 'User can log in with email and password',
            });
            expect(errors).toHaveLength(0);
        });

        it('returns error for missing required input', () => {
            const errors = registry.validateInputs('create-test-plans', {});
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('requirements');
        });

        it('returns error for empty required input', () => {
            const errors = registry.validateInputs('create-test-plans', {
                requirements: '   ',
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('requirements');
        });

        it('returns error for unknown slug', () => {
            const errors = registry.validateInputs('nonexistent', {});
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('slug');
        });

        it('does not require optional inputs', () => {
            const errors = registry.validateInputs('auto-pass-tests', {
                testSuite: 'src/__tests__/*.test.ts',
            });
            expect(errors).toHaveLength(0);
        });

        it('validates auto-pass-tests missing testSuite', () => {
            const errors = registry.validateInputs('auto-pass-tests', {});
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('testSuite');
        });

        it('validates install-plugins missing plugins', () => {
            const errors = registry.validateInputs('install-plugins', {});
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('plugins');
        });
    });

    // ─── Prompt Resolution ───────────────────────────────────────────────────

    describe('resolvePrompt', () => {
        it('resolves create-test-plans prompt with inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {
                requirements: 'Users can register with email',
                format: 'json',
            });
            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('Users can register with email');
            expect(result.resolvedPrompt).toContain('json');
            expect(result.resolvedPrompt).not.toContain('{{requirements}}');
            expect(result.resolvedPrompt).not.toContain('{{format}}');
        });

        it('resolves with default values for optional inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {
                requirements: 'Some requirements',
            });
            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('markdown');
        });

        it('resolves auto-pass-tests prompt', () => {
            const result = registry.resolvePrompt('auto-pass-tests', {
                testSuite: 'src/__tests__/*.test.ts',
                testCommand: 'npx vitest run',
            });
            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('src/__tests__/*.test.ts');
            expect(result.resolvedPrompt).toContain('npx vitest run');
        });

        it('resolves install-plugins prompt', () => {
            const result = registry.resolvePrompt('install-plugins', {
                plugins: 'lodash, express, cors',
                registry: 'npm',
            });
            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).toContain('lodash, express, cors');
            expect(result.resolvedPrompt).toContain('npm');
        });

        it('fails for unknown slug', () => {
            const result = registry.resolvePrompt('nonexistent', {});
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown prompt template');
        });

        it('fails for missing required inputs', () => {
            const result = registry.resolvePrompt('create-test-plans', {});
            expect(result.success).toBe(false);
            expect(result.error).toContain('requirements');
        });

        it('replaces all placeholder occurrences', () => {
            const result = registry.resolvePrompt('auto-pass-tests', {
                testSuite: 'my-tests',
            });
            expect(result.success).toBe(true);
            expect(result.resolvedPrompt).not.toContain('{{testSuite}}');
            expect(result.resolvedPrompt).not.toContain('{{testCommand}}');
        });
    });

    // ─── Dispose ─────────────────────────────────────────────────────────────

    describe('dispose', () => {
        it('clears all templates', () => {
            registry.dispose();
            // After dispose, re-load should work
            registry.load();
            expect(registry.getAllTemplates().length).toBeGreaterThanOrEqual(3);
        });
    });
});
