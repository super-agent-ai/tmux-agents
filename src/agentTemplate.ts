import * as vscode from 'vscode';
import { AgentTemplate, AgentRole, AIProvider } from './types';

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
                systemPrompt: 'You are a coding assistant. Write clean, well-tested code.'
            },
            {
                id: 'builtin-reviewer-gemini',
                name: 'Gemini Reviewer',
                role: AgentRole.REVIEWER,
                aiProvider: AIProvider.GEMINI,
                description: 'Code review and quality analysis with Gemini'
            },
            {
                id: 'builtin-tester-codex',
                name: 'Codex Tester',
                role: AgentRole.TESTER,
                aiProvider: AIProvider.CODEX,
                description: 'Test writing and execution with Codex'
            },
            {
                id: 'builtin-coder-gemini',
                name: 'Gemini Coder',
                role: AgentRole.CODER,
                aiProvider: AIProvider.GEMINI,
                description: 'Code writing with Gemini'
            },
            {
                id: 'builtin-reviewer-claude',
                name: 'Claude Reviewer',
                role: AgentRole.REVIEWER,
                aiProvider: AIProvider.CLAUDE,
                description: 'Code review with Claude'
            },
            {
                id: 'builtin-researcher-claude',
                name: 'Claude Researcher',
                role: AgentRole.RESEARCHER,
                aiProvider: AIProvider.CLAUDE,
                description: 'Research and information gathering with Claude'
            }
        ];
    }
}
