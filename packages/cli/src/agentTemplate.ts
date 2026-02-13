import * as vscode from 'vscode';
import { AgentTemplate, AgentRole, AIProvider, TeamTemplate } from './core/types';

function generateId(): string {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

const BUILT_IN_PREFIX = 'builtin-';

export class AgentTemplateManager {

    private templates: Map<string, AgentTemplate> = new Map();

    constructor() {
        for (const template of this.getBuiltInTemplates()) {
            this.templates.set(template.id, template);
        }
    }

    // ─── Read Operations ─────────────────────────────────────────────────────

    getTemplate(id: string): AgentTemplate | undefined {
        return this.templates.get(id);
    }

    getAllTemplates(): AgentTemplate[] {
        return Array.from(this.templates.values());
    }

    getTemplatesByRole(role: AgentRole): AgentTemplate[] {
        return Array.from(this.templates.values()).filter(t => t.role === role);
    }

    isBuiltIn(id: string): boolean {
        return id.startsWith(BUILT_IN_PREFIX);
    }

    // ─── Write Operations ────────────────────────────────────────────────────

    createTemplate(template: Omit<AgentTemplate, 'id'>): AgentTemplate {
        const fullTemplate: AgentTemplate = {
            ...template,
            id: generateId()
        };
        this.templates.set(fullTemplate.id, fullTemplate);
        return fullTemplate;
    }

    updateTemplate(id: string, updates: Partial<AgentTemplate>): void {
        const existing = this.templates.get(id);
        if (!existing) {
            throw new Error(`Template not found: ${id}`);
        }

        const updated: AgentTemplate = {
            ...existing,
            ...updates,
            id: existing.id   // Prevent ID overwrite
        };
        this.templates.set(id, updated);
    }

    deleteTemplate(id: string): boolean {
        if (this.isBuiltIn(id)) {
            return false;
        }
        return this.templates.delete(id);
    }

    // ─── Persistence ─────────────────────────────────────────────────────────

    async saveToSettings(): Promise<void> {
        const customTemplates = Array.from(this.templates.values())
            .filter(t => !this.isBuiltIn(t.id));

        const config = vscode.workspace.getConfiguration('tmuxAgents');
        await config.update('agentTemplates', customTemplates, vscode.ConfigurationTarget.Global);
    }

    async loadFromSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const saved = config.get<AgentTemplate[]>('agentTemplates', []);

        for (const template of saved) {
            if (template.id && !this.isBuiltIn(template.id)) {
                this.templates.set(template.id, template);
            }
        }
    }

    // ─── Built-in Templates ──────────────────────────────────────────────────

    getBuiltInTemplates(): AgentTemplate[] {
        return [
            {
                id: 'builtin-coder-claude',
                name: 'Claude Coder',
                role: AgentRole.CODER,
                aiProvider: AIProvider.CLAUDE,
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
                role: AgentRole.REVIEWER,
                aiProvider: AIProvider.GEMINI,
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
                role: AgentRole.TESTER,
                aiProvider: AIProvider.CODEX,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.GEMINI,
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
                role: AgentRole.REVIEWER,
                aiProvider: AIProvider.CLAUDE,
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
                role: AgentRole.RESEARCHER,
                aiProvider: AIProvider.CLAUDE,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.OPENCODE,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.CURSOR,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.COPILOT,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.AIDER,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.AMP,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.CLINE,
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
                role: AgentRole.CODER,
                aiProvider: AIProvider.KIRO,
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

    getBuiltInTeamTemplates(): TeamTemplate[] {
        return [
            {
                id: 'team-fullstack',
                name: 'Full-Stack Team',
                description: '2 coders + 1 reviewer + 1 tester for comprehensive feature development',
                slots: [
                    { role: AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Lead Coder' },
                    { role: AgentRole.CODER, templateId: 'builtin-coder-gemini', label: 'Support Coder' },
                    { role: AgentRole.REVIEWER, templateId: 'builtin-reviewer-claude', label: 'Code Reviewer' },
                    { role: AgentRole.TESTER, templateId: 'builtin-tester-codex', label: 'Test Engineer' },
                ],
            },
            {
                id: 'team-rapid-mvp',
                name: 'Rapid MVP',
                description: '3 coders + 1 devops for fast prototyping and deployment',
                slots: [
                    { role: AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Backend Coder' },
                    { role: AgentRole.CODER, templateId: 'builtin-coder-gemini', label: 'Frontend Coder' },
                    { role: AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'API Coder' },
                    { role: AgentRole.DEVOPS, label: 'DevOps Engineer' },
                ],
            },
            {
                id: 'team-research',
                name: 'Research Squad',
                description: '2 researchers + 1 coder for deep investigation and prototyping',
                slots: [
                    { role: AgentRole.RESEARCHER, templateId: 'builtin-researcher-claude', label: 'Lead Researcher' },
                    { role: AgentRole.RESEARCHER, label: 'Support Researcher' },
                    { role: AgentRole.CODER, templateId: 'builtin-coder-claude', label: 'Prototype Coder' },
                ],
            },
            {
                id: 'team-review',
                name: 'Code Review Team',
                description: '2 reviewers + 1 tester for thorough code quality assessment',
                slots: [
                    { role: AgentRole.REVIEWER, templateId: 'builtin-reviewer-claude', label: 'Security Reviewer' },
                    { role: AgentRole.REVIEWER, templateId: 'builtin-reviewer-gemini', label: 'Quality Reviewer' },
                    { role: AgentRole.TESTER, templateId: 'builtin-tester-codex', label: 'Integration Tester' },
                ],
            },
        ];
    }
}
