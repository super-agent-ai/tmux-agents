"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptRegistry = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ─── PromptRegistry ─────────────────────────────────────────────────────────
class PromptRegistry {
    constructor(extensionPath) {
        this.extensionPath = extensionPath;
        this.templates = new Map();
        this.loaded = false;
    }
    // ─── Loading ─────────────────────────────────────────────────────────────
    /**
     * Load default prompt templates from the bundled JSON config.
     * Idempotent — safe to call multiple times.
     */
    load(extensionPath) {
        if (extensionPath) {
            this.extensionPath = extensionPath;
        }
        this.templates.clear();
        const templates = this.loadFromFile();
        for (const template of templates) {
            this.templates.set(template.slug, template);
        }
        this.loaded = true;
    }
    loadFromFile() {
        // Try compiled output directory first (production), then source (development)
        const candidates = this.extensionPath
            ? [
                path.join(this.extensionPath, 'out', 'prompts', 'defaults.json'),
                path.join(this.extensionPath, 'src', 'prompts', 'defaults.json'),
            ]
            : [];
        // Also try relative to this module (works for both compiled and source)
        candidates.push(path.join(__dirname, 'prompts', 'defaults.json'));
        candidates.push(path.join(__dirname, '..', 'src', 'prompts', 'defaults.json'));
        for (const filePath of candidates) {
            try {
                if (fs.existsSync(filePath)) {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                }
            }
            catch {
                // Try next candidate
            }
        }
        // Fallback: return embedded defaults
        return this.getEmbeddedDefaults();
    }
    /**
     * Hard-coded fallback in case the JSON file cannot be loaded.
     */
    getEmbeddedDefaults() {
        return [
            {
                slug: 'create-test-plans',
                name: 'Create Test Plans',
                description: 'Generates structured test plans from requirements or user stories.',
                category: 'testing',
                version: '1.0.0',
                inputs: [
                    { name: 'requirements', type: 'string', required: true, description: 'Requirements or user stories to generate test plans for.' },
                    { name: 'format', type: 'string', required: false, description: 'Output format: markdown or json.', default: 'markdown' },
                ],
                prompt: 'You are a senior QA engineer. Analyze the following requirements and produce a structured test plan with test cases, steps, and expected results.\n\n## Requirements\n{{requirements}}\n\nOutput format: {{format}}',
            },
            {
                slug: 'auto-pass-tests',
                name: 'Automatically Pass All Tests',
                description: 'Analyzes failing tests and applies fixes to make them pass.',
                category: 'testing',
                version: '1.0.0',
                inputs: [
                    { name: 'testSuite', type: 'string', required: true, description: 'Test suite identifier or file path.' },
                    { name: 'testCommand', type: 'string', required: false, description: 'Command to run tests.', default: 'npm test' },
                ],
                prompt: 'You are a senior engineer. Run the test suite, analyze failures, and fix them.\n\n## Test Suite\n{{testSuite}}\n\n## Test Command\n{{testCommand}}',
            },
            {
                slug: 'install-plugins',
                name: 'Install Plugins',
                description: 'Automates plugin discovery, download, and installation.',
                category: 'devops',
                version: '1.0.0',
                inputs: [
                    { name: 'plugins', type: 'string', required: true, description: 'Plugin name or comma-separated list.' },
                    { name: 'registry', type: 'string', required: false, description: 'Registry source.', default: 'npm' },
                ],
                prompt: 'You are a DevOps engineer. Install the following plugins.\n\n## Plugins\n{{plugins}}\n\n## Registry\n{{registry}}',
            },
        ];
    }
    // ─── Read Operations ─────────────────────────────────────────────────────
    /**
     * Get all registered default prompt templates.
     */
    getAllTemplates() {
        this.ensureLoaded();
        return Array.from(this.templates.values());
    }
    /**
     * Get a prompt template by slug.
     */
    getTemplate(slug) {
        this.ensureLoaded();
        return this.templates.get(slug);
    }
    /**
     * Get templates filtered by category.
     */
    getTemplatesByCategory(category) {
        this.ensureLoaded();
        return Array.from(this.templates.values()).filter(t => t.category === category);
    }
    /**
     * Check if a slug exists in the registry.
     */
    has(slug) {
        this.ensureLoaded();
        return this.templates.has(slug);
    }
    /**
     * Get all unique categories.
     */
    getCategories() {
        this.ensureLoaded();
        const cats = new Set();
        for (const t of this.templates.values()) {
            cats.add(t.category);
        }
        return Array.from(cats).sort();
    }
    // ─── Validation ──────────────────────────────────────────────────────────
    /**
     * Validate inputs for a given prompt template.
     * Returns an array of validation errors (empty if valid).
     */
    validateInputs(slug, inputs) {
        const template = this.getTemplate(slug);
        if (!template) {
            return [{ field: 'slug', message: `Unknown prompt template: ${slug}` }];
        }
        const errors = [];
        for (const inputDef of template.inputs) {
            const value = inputs[inputDef.name];
            if (inputDef.required && (!value || value.trim().length === 0)) {
                errors.push({
                    field: inputDef.name,
                    message: `Required input '${inputDef.name}' is missing or empty. ${inputDef.description}`,
                });
            }
        }
        return errors;
    }
    // ─── Execution ───────────────────────────────────────────────────────────
    /**
     * Resolve a prompt template with the provided inputs.
     * Replaces {{placeholder}} tokens with input values.
     */
    resolvePrompt(slug, inputs) {
        const template = this.getTemplate(slug);
        if (!template) {
            return {
                success: false,
                slug,
                resolvedPrompt: '',
                error: `Unknown prompt template: ${slug}`,
            };
        }
        const validationErrors = this.validateInputs(slug, inputs);
        if (validationErrors.length > 0) {
            return {
                success: false,
                slug,
                resolvedPrompt: '',
                error: validationErrors.map(e => `${e.field}: ${e.message}`).join('; '),
            };
        }
        // Build resolved inputs with defaults applied
        const resolvedInputs = {};
        for (const inputDef of template.inputs) {
            resolvedInputs[inputDef.name] = inputs[inputDef.name] || inputDef.default || '';
        }
        // Replace template placeholders
        let resolvedPrompt = template.prompt;
        for (const [key, value] of Object.entries(resolvedInputs)) {
            resolvedPrompt = resolvedPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        return {
            success: true,
            slug,
            resolvedPrompt,
        };
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    ensureLoaded() {
        if (!this.loaded) {
            this.load();
        }
    }
    dispose() {
        this.templates.clear();
    }
}
exports.PromptRegistry = PromptRegistry;
//# sourceMappingURL=promptRegistry.js.map