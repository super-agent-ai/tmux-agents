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
exports.AgentTemplateManager = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./core/types");
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
const BUILT_IN_PREFIX = 'builtin-';
class AgentTemplateManager {
    constructor() {
        this.templates = new Map();
        for (const template of this.getBuiltInTemplates()) {
            this.templates.set(template.id, template);
        }
    }
    // ─── Read Operations ─────────────────────────────────────────────────────
    getTemplate(id) {
        return this.templates.get(id);
    }
    getAllTemplates() {
        return Array.from(this.templates.values());
    }
    getTemplatesByRole(role) {
        return Array.from(this.templates.values()).filter(t => t.role === role);
    }
    isBuiltIn(id) {
        return id.startsWith(BUILT_IN_PREFIX);
    }
    // ─── Write Operations ────────────────────────────────────────────────────
    createTemplate(template) {
        const fullTemplate = {
            ...template,
            id: generateId()
        };
        this.templates.set(fullTemplate.id, fullTemplate);
        return fullTemplate;
    }
    updateTemplate(id, updates) {
        const existing = this.templates.get(id);
        if (!existing) {
            throw new Error(`Template not found: ${id}`);
        }
        const updated = {
            ...existing,
            ...updates,
            id: existing.id // Prevent ID overwrite
        };
        this.templates.set(id, updated);
    }
    deleteTemplate(id) {
        if (this.isBuiltIn(id)) {
            return false;
        }
        return this.templates.delete(id);
    }
    // ─── Persistence ─────────────────────────────────────────────────────────
    async saveToSettings() {
        const customTemplates = Array.from(this.templates.values())
            .filter(t => !this.isBuiltIn(t.id));
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        await config.update('agentTemplates', customTemplates, vscode.ConfigurationTarget.Global);
    }
    async loadFromSettings() {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const saved = config.get('agentTemplates', []);
        for (const template of saved) {
            if (template.id && !this.isBuiltIn(template.id)) {
                this.templates.set(template.id, template);
            }
        }
    }
    // ─── Built-in Templates ──────────────────────────────────────────────────
    getBuiltInTemplates() {
        return [
            {
                id: 'builtin-coder-claude',
                name: 'Claude Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.CLAUDE,
                description: 'Code writing and modification with Claude',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'methodical',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'JavaScript', 'Node.js'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'C',
                }
            },
            {
                id: 'builtin-reviewer-gemini',
                name: 'Gemini Reviewer',
                role: types_1.AgentRole.REVIEWER,
                aiProvider: types_1.AIProvider.GEMINI,
                description: 'Code review and quality analysis with Gemini',
                systemPrompt: 'You are a code reviewer. Focus on correctness, security vulnerabilities, performance issues, and adherence to project conventions. Provide specific line-level feedback. Rate each finding as info (suggestion), warning (should fix), or error (must fix). Summarize with an overall assessment.',
                persona: {
                    personality: 'analytical',
                    communicationStyle: 'detailed',
                    expertiseAreas: ['Code Review', 'Security', 'Performance'],
                    skillLevel: 'senior',
                    riskTolerance: 'conservative',
                    avatar: 'R',
                }
            },
            {
                id: 'builtin-tester-codex',
                name: 'Codex Tester',
                role: types_1.AgentRole.TESTER,
                aiProvider: types_1.AIProvider.CODEX,
                description: 'Test writing and execution with Codex',
                systemPrompt: 'You are a test engineer. Write comprehensive tests covering happy path, edge cases, and error conditions. Use the project\'s existing test framework and patterns. Aim for high code coverage. Structure tests with clear arrange/act/assert sections and descriptive test names.',
                persona: {
                    personality: 'methodical',
                    communicationStyle: 'detailed',
                    expertiseAreas: ['Testing', 'QA', 'CI/CD'],
                    skillLevel: 'mid',
                    riskTolerance: 'conservative',
                    avatar: 'T',
                }
            },
            {
                id: 'builtin-coder-gemini',
                name: 'Gemini Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.GEMINI,
                description: 'Code writing with Gemini',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'creative',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Python', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'G',
                }
            },
            {
                id: 'builtin-reviewer-claude',
                name: 'Claude Reviewer',
                role: types_1.AgentRole.REVIEWER,
                aiProvider: types_1.AIProvider.CLAUDE,
                description: 'Code review with Claude',
                systemPrompt: 'You are a code reviewer. Focus on correctness, security vulnerabilities, performance issues, and adherence to project conventions. Provide specific line-level feedback. Rate each finding as info (suggestion), warning (should fix), or error (must fix). Summarize with an overall assessment.',
                persona: {
                    personality: 'analytical',
                    communicationStyle: 'detailed',
                    expertiseAreas: ['Code Review', 'Architecture', 'Best Practices'],
                    skillLevel: 'principal',
                    riskTolerance: 'conservative',
                    avatar: 'R',
                }
            },
            {
                id: 'builtin-researcher-claude',
                name: 'Claude Researcher',
                role: types_1.AgentRole.RESEARCHER,
                aiProvider: types_1.AIProvider.CLAUDE,
                description: 'Research and information gathering with Claude',
                systemPrompt: 'You are a research agent. Gather information thoroughly and provide structured findings with clear sections. Cite sources when possible. Compare alternatives with pros/cons when relevant. Highlight key takeaways and actionable recommendations at the end.',
                persona: {
                    personality: 'analytical',
                    communicationStyle: 'detailed',
                    expertiseAreas: ['Research', 'Analysis', 'Documentation'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'S',
                }
            },
            {
                id: 'builtin-coder-opencode',
                name: 'OpenCode Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.OPENCODE,
                description: 'Code writing with OpenCode (multi-provider)',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'pragmatic',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Go', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'O',
                }
            },
            {
                id: 'builtin-coder-cursor',
                name: 'Cursor Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.CURSOR,
                description: 'Code writing with Cursor Agent CLI',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'pragmatic',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'React', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'U',
                }
            },
            {
                id: 'builtin-coder-copilot',
                name: 'Copilot Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.COPILOT,
                description: 'Code writing with GitHub Copilot CLI',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'pragmatic',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Python', 'GitHub'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'P',
                }
            },
            {
                id: 'builtin-coder-aider',
                name: 'Aider Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.AIDER,
                description: 'AI pair programming with Aider (multi-model)',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'methodical',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Python', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'A',
                }
            },
            {
                id: 'builtin-coder-amp',
                name: 'Amp Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.AMP,
                description: 'Code writing with Sourcegraph Amp CLI',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'creative',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Go', 'Search'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'M',
                }
            },
            {
                id: 'builtin-coder-cline',
                name: 'Cline Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.CLINE,
                description: 'Autonomous coding agent with Cline CLI (multi-provider)',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'pragmatic',
                    communicationStyle: 'concise',
                    expertiseAreas: ['TypeScript', 'Python', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'moderate',
                    avatar: 'L',
                }
            },
            {
                id: 'builtin-coder-kiro',
                name: 'Kiro Coder',
                role: types_1.AgentRole.CODER,
                aiProvider: types_1.AIProvider.KIRO,
                description: 'Spec-driven coding with Kiro CLI (AWS)',
                systemPrompt: 'You are a coding agent. Follow existing code conventions and patterns in the project. Read existing code before modifying it. Prefer editing existing files over creating new ones. Write unit tests for new functionality. Use descriptive commit messages that explain why, not just what.',
                persona: {
                    personality: 'methodical',
                    communicationStyle: 'detailed',
                    expertiseAreas: ['TypeScript', 'AWS', 'Full-Stack'],
                    skillLevel: 'senior',
                    riskTolerance: 'conservative',
                    avatar: 'K',
                }
            }
        ];
    }
    // ─── Team Templates ─────────────────────────────────────────────────────
    getBuiltInTeamTemplates() {
        return [
            {
                id: 'team-fullstack',
                name: 'Full-Stack Team',
                description: '2 coders + 1 reviewer + 1 tester for comprehensive feature development',
                slots: [
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Lead Coder' },
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-gemini', label: 'Support Coder' },
                    { role: types_1.AgentRole.REVIEWER, templateId: 'builtin-reviewer-claude', label: 'Code Reviewer' },
                    { role: types_1.AgentRole.TESTER, templateId: 'builtin-tester-codex', label: 'Test Engineer' },
                ],
            },
            {
                id: 'team-rapid-mvp',
                name: 'Rapid MVP',
                description: '3 coders + 1 devops for fast prototyping and deployment',
                slots: [
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Backend Coder' },
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-gemini', label: 'Frontend Coder' },
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'API Coder' },
                    { role: types_1.AgentRole.DEVOPS, label: 'DevOps Engineer' },
                ],
            },
            {
                id: 'team-research',
                name: 'Research Squad',
                description: '2 researchers + 1 coder for deep investigation and prototyping',
                slots: [
                    { role: types_1.AgentRole.RESEARCHER, templateId: 'builtin-researcher-claude', label: 'Lead Researcher' },
                    { role: types_1.AgentRole.RESEARCHER, label: 'Support Researcher' },
                    { role: types_1.AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Prototype Coder' },
                ],
            },
            {
                id: 'team-review',
                name: 'Code Review Team',
                description: '2 reviewers + 1 tester for thorough code quality assessment',
                slots: [
                    { role: types_1.AgentRole.REVIEWER, templateId: 'builtin-reviewer-claude', label: 'Security Reviewer' },
                    { role: types_1.AgentRole.REVIEWER, templateId: 'builtin-reviewer-gemini', label: 'Quality Reviewer' },
                    { role: types_1.AgentRole.TESTER, templateId: 'builtin-tester-codex', label: 'Integration Tester' },
                ],
            },
        ];
    }
}
exports.AgentTemplateManager = AgentTemplateManager;
//# sourceMappingURL=agentTemplate.js.map