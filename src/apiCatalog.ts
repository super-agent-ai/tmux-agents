import * as vscode from 'vscode';
import { TmuxServiceManager } from './serviceManager';
import { TmuxService } from './tmuxService';
import { AgentOrchestrator } from './orchestrator';
import { TeamManager } from './teamManager';
import { PipelineEngine } from './pipelineEngine';
import { AgentTemplateManager } from './agentTemplate';
import { TaskRouter } from './taskRouter';
import { AIAssistantManager } from './aiAssistant';
import {
    AIProvider, AIStatus, AgentRole, AgentState, AgentInstance,
    StageType, TaskStatus, PipelineStatus, OrchestratorTask, KanbanSwimLane,
    applySwimLaneDefaults, resolveToggle
} from './types';
import { markDoneTimestamp } from './autoCloseMonitor';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ApiParamDef {
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description: string;
    enum?: string[];
    defaultValue?: any;
}

export interface ApiActionResult {
    success: boolean;
    message: string;
    data?: any;
}

export interface ApiActionCall {
    action: string;
    params: Record<string, any>;
}

export type NextExecutor = 'tool' | 'assistant' | 'user';

export interface ParsedAIResponse {
    actions: ApiActionCall[];
    next: NextExecutor;
}

interface ApiAction {
    name: string;
    category: string;
    description: string;
    params: ApiParamDef[];
    returnsData: boolean;
    execute: (params: Record<string, any>) => Promise<ApiActionResult>;
}

export interface ApiCatalogDeps {
    serviceManager: TmuxServiceManager;
    orchestrator: AgentOrchestrator;
    teamManager: TeamManager;
    pipelineEngine: PipelineEngine;
    templateManager: AgentTemplateManager;
    taskRouter: TaskRouter;
    aiManager: AIAssistantManager;
    refreshTree: () => void;
    getSwimLanes?: () => KanbanSwimLane[];
    addSwimLane?: (lane: KanbanSwimLane) => void;
    deleteSwimLane?: (id: string) => void;
    saveSwimLane?: (lane: KanbanSwimLane) => void;
    updateKanban?: () => void;
    getKanbanTasks?: () => OrchestratorTask[];
    saveTask?: (task: OrchestratorTask) => void;
    deleteTask?: (taskId: string) => void;
    startTaskFlow?: (task: OrchestratorTask) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveService(deps: ApiCatalogDeps, serverId: string): TmuxService {
    const service = deps.serviceManager.getService(serverId);
    if (!service) {
        const available = deps.serviceManager.getAllServices().map(s => s.serverId).join(', ');
        throw new Error(`Unknown server "${serverId}". Available: ${available}`);
    }
    return service;
}

function ok(message: string, data?: any): ApiActionResult {
    return { success: true, message, data };
}

function err(message: string): ApiActionResult {
    return { success: false, message };
}

// ─── API Catalog ─────────────────────────────────────────────────────────────

export class ApiCatalog {
    private actions = new Map<string, ApiAction>();

    constructor(private deps: ApiCatalogDeps) {
        this.registerServerActions();
        this.registerSessionActions();
        this.registerWindowActions();
        this.registerPaneActions();
        this.registerAISessionActions();
        this.registerAIUtilityActions();
        this.registerAgentActions();
        this.registerAgentQueryActions();
        this.registerTeamActions();
        this.registerTeamQueryActions();
        this.registerPipelineActions();
        this.registerPipelineQueryActions();
        this.registerTemplateActions();
        this.registerTemplateQueryActions();
        this.registerTaskActions();
        this.registerTaskQueryActions();
        this.registerVSCodeActions();
        this.registerKanbanActions();
        this.registerQuickActions();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    getAction(name: string): ApiAction | undefined {
        return this.actions.get(name);
    }

    async executeActions(calls: ApiActionCall[]): Promise<ApiActionResult[]> {
        const results: ApiActionResult[] = [];
        for (const call of calls) {
            const action = this.actions.get(call.action);
            if (!action) {
                results.push(err(`Unknown action: "${call.action}"`));
                continue;
            }
            // Validate required params
            const missing = action.params
                .filter(p => p.required && (call.params[p.name] === undefined || call.params[p.name] === null))
                .map(p => p.name);
            if (missing.length > 0) {
                results.push(err(`Missing required params for ${call.action}: ${missing.join(', ')}`));
                continue;
            }
            // Validate enum constraints
            let enumError = false;
            for (const paramDef of action.params) {
                if (paramDef.enum && call.params[paramDef.name] !== undefined) {
                    if (!paramDef.enum.includes(call.params[paramDef.name])) {
                        results.push(err(`Invalid value "${call.params[paramDef.name]}" for ${paramDef.name} in ${call.action}. Must be: ${paramDef.enum.join(', ')}`));
                        enumError = true;
                        break;
                    }
                }
            }
            if (enumError) { continue; }
            try {
                const result = await action.execute(call.params);
                results.push(result);
            } catch (error) {
                const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
                results.push(err(`${call.action}: ${msg}`));
            }
        }
        return results;
    }

    getCatalogText(): string {
        const grouped = new Map<string, ApiAction[]>();
        for (const action of this.actions.values()) {
            const list = grouped.get(action.category) || [];
            list.push(action);
            grouped.set(action.category, list);
        }

        const sections: string[] = [];
        sections.push('Respond with a JSON array inside a ```json code block. Each element: { "action": "<name>", "params": { ... } }\n');

        for (const [category, actions] of grouped) {
            const lines: string[] = [`### ${category}\n`];
            for (const action of actions) {
                const returnsTag = action.returnsData ? ' [returns data]' : '';
                lines.push(`- **${action.name}**: ${action.description}${returnsTag}`);
                if (action.params.length > 0) {
                    const paramStr = action.params.map(p => {
                        const req = p.required ? '' : '?';
                        const enumStr = p.enum ? ` (${p.enum.join('|')})` : '';
                        return `${p.name}${req}: ${p.type}${enumStr}`;
                    }).join(', ');
                    lines.push(`  params: { ${paramStr} }`);
                } else {
                    lines.push(`  params: {}`);
                }
                lines.push('');
            }
            sections.push(lines.join('\n'));
        }

        return sections.join('\n');
    }

    // ── Parsing ──────────────────────────────────────────────────────────────

    parseResponse(aiResponse: string): ParsedAIResponse {
        // Try ```json block first
        const jsonBlockMatch = aiResponse.match(/```json\s*\n?([\s\S]*?)```/);
        if (jsonBlockMatch) {
            const parsed = this.tryParseJson(jsonBlockMatch[1].trim());
            if (parsed) { return parsed; }
        }
        // Try bare JSON object or array
        const bareObjMatch = aiResponse.match(/\{\s*"actions"\s*:/);
        if (bareObjMatch) {
            // Find the full object by searching from the match position
            const startIdx = aiResponse.indexOf(bareObjMatch[0]);
            const parsed = this.tryParseJson(aiResponse.substring(startIdx));
            if (parsed) { return parsed; }
        }
        const bareArrMatch = aiResponse.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (bareArrMatch) {
            const parsed = this.tryParseJson(bareArrMatch[0]);
            if (parsed) { return parsed; }
        }
        return { actions: [], next: 'user' };
    }

    /** @deprecated Use parseResponse() instead */
    parseActionCalls(aiResponse: string): ApiActionCall[] {
        return this.parseResponse(aiResponse).actions;
    }

    private tryParseJson(text: string): ParsedAIResponse | null {
        try {
            const parsed = JSON.parse(text);

            // New object format: { actions: [...], next: "tool"|"user"|"assistant" }
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.actions)) {
                const actions = this.extractActions(parsed.actions);
                // Default to "tool" when actions are present (continue loop),
                // "user" when no actions (stop and wait). The AI must explicitly
                // set "user" to stop after executing actions.
                const explicitNext: NextExecutor | null = ['tool', 'assistant', 'user'].includes(parsed.next) ? parsed.next : null;
                const next: NextExecutor = explicitNext ?? (actions.length > 0 ? 'tool' : 'user');
                return actions.length > 0 || next !== 'user' ? { actions, next } : null;
            }

            // Legacy array format: [{ action: "...", params: {...} }]
            if (Array.isArray(parsed)) {
                const actions = this.extractActions(parsed);
                // Default to "tool" so the loop continues after actions execute
                return actions.length > 0 ? { actions, next: 'tool' } : null;
            }

            return null;
        } catch {
            return null;
        }
    }

    private extractActions(arr: any[]): ApiActionCall[] {
        const calls: ApiActionCall[] = [];
        for (const item of arr) {
            if (item && typeof item === 'object' && typeof item.action === 'string') {
                calls.push({
                    action: item.action,
                    params: item.params && typeof item.params === 'object' ? item.params : {}
                });
            }
        }
        return calls;
    }

    // ── Registration helper ──────────────────────────────────────────────────

    private register(action: ApiAction): void {
        this.actions.set(action.name, action);
    }

    private serverParam(): ApiParamDef {
        return { name: 'server', type: 'string', required: true, description: 'Server ID (e.g. "local" or "remote:mac-mini")' };
    }

    // ── Server Management ────────────────────────────────────────────────────

    private registerServerActions(): void {
        const d = this.deps;
        const cat = 'Server Management';

        this.register({
            name: 'server.list', category: cat,
            description: 'List all configured tmux servers with connection status',
            params: [],
            returnsData: true,
            execute: async () => {
                const services = d.serviceManager.getAllServices();
                if (services.length === 0) { return ok('No servers configured', []); }
                const summary = services.map(s => {
                    const identity = s.serverIdentity;
                    const type = identity.isLocal ? 'local' : `ssh:${identity.sshConfig?.host || 'unknown'}`;
                    return `"${identity.label}" [${identity.id}] (${type})`;
                });
                return ok(`${services.length} server(s):\n${summary.join('\n')}`, services.map(s => {
                    const id = s.serverIdentity;
                    return { id: id.id, label: id.label, isLocal: id.isLocal, sshHost: id.sshConfig?.host };
                }));
            }
        });

        this.register({
            name: 'server.testConnection', category: cat,
            description: 'Test connectivity to a server by listing sessions',
            params: [this.serverParam()],
            returnsData: true,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                try {
                    const sessions = await svc.getSessions();
                    return ok(`Connection OK — ${sessions.length} session(s) on ${p.server}`, { connected: true, sessionCount: sessions.length });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return ok(`Connection FAILED to ${p.server}: ${msg}`, { connected: false, error: msg });
                }
            }
        });

        this.register({
            name: 'server.getTree', category: cat,
            description: 'Get full tmux hierarchy (sessions → windows → panes) for a server',
            params: [this.serverParam()],
            returnsData: true,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const tree = await svc.getTmuxTreeFresh();
                const summary = tree.map(s => {
                    const wins = s.windows.map(w => `  Window ${w.index}: "${w.name}" (${w.panes.length} pane(s))`);
                    return `Session "${s.name}" (${s.windows.length} window(s))\n${wins.join('\n')}`;
                });
                return ok(summary.join('\n') || '(no sessions)', tree.map(s => ({
                    name: s.name, isAttached: s.isAttached,
                    windows: s.windows.map(w => ({
                        index: w.index, name: w.name,
                        panes: w.panes.map(p => ({ index: p.index, command: p.command, currentPath: p.currentPath }))
                    }))
                })));
            }
        });
    }

    // ── Session Management ───────────────────────────────────────────────────

    private registerSessionActions(): void {
        const d = this.deps;
        const cat = 'Session Management';

        this.register({
            name: 'session.create', category: cat,
            description: 'Create a new detached tmux session',
            params: [
                this.serverParam(),
                { name: 'name', type: 'string', required: true, description: 'Session name' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.newSession(p.name);
                d.refreshTree();
                return ok(`Created session "${p.name}" on ${p.server}`);
            }
        });

        this.register({
            name: 'session.delete', category: cat,
            description: 'Delete (kill) a tmux session',
            params: [
                this.serverParam(),
                { name: 'name', type: 'string', required: true, description: 'Session name' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.deleteSession(p.name);
                d.refreshTree();
                return ok(`Deleted session "${p.name}" on ${p.server}`);
            }
        });

        this.register({
            name: 'session.rename', category: cat,
            description: 'Rename an existing session',
            params: [
                this.serverParam(),
                { name: 'oldName', type: 'string', required: true, description: 'Current session name' },
                { name: 'newName', type: 'string', required: true, description: 'New session name' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.renameSession(p.oldName, p.newName);
                d.refreshTree();
                return ok(`Renamed session "${p.oldName}" to "${p.newName}" on ${p.server}`);
            }
        });

        this.register({
            name: 'session.list', category: cat,
            description: 'List all session names on a server',
            params: [this.serverParam()],
            returnsData: true,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const sessions = await svc.getSessions();
                return ok(`Sessions on ${p.server}: ${sessions.join(', ') || '(none)'}`, sessions);
            }
        });
    }

    // ── Window Management ────────────────────────────────────────────────────

    private registerWindowActions(): void {
        const d = this.deps;
        const cat = 'Window Management';

        this.register({
            name: 'window.create', category: cat,
            description: 'Create a new window in an existing session',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'name', type: 'string', required: false, description: 'Window name (optional)' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.newWindow(p.session, p.name || undefined);
                d.refreshTree();
                return ok(`Created window${p.name ? ` "${p.name}"` : ''} in session "${p.session}" on ${p.server}`);
            }
        });

        this.register({
            name: 'window.kill', category: cat,
            description: 'Kill (close) a window',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.killWindow(p.session, p.window);
                d.refreshTree();
                return ok(`Killed window ${p.session}:${p.window} on ${p.server}`);
            }
        });

        this.register({
            name: 'window.rename', category: cat,
            description: 'Rename a window',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'name', type: 'string', required: true, description: 'New window name' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.renameWindow(p.session, p.window, p.name);
                d.refreshTree();
                return ok(`Renamed window ${p.session}:${p.window} to "${p.name}" on ${p.server}`);
            }
        });

        this.register({
            name: 'window.select', category: cat,
            description: 'Focus/select a window',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.selectWindow(p.session, p.window);
                return ok(`Selected window ${p.session}:${p.window} on ${p.server}`);
            }
        });
    }

    // ── Pane Management ──────────────────────────────────────────────────────

    private registerPaneActions(): void {
        const d = this.deps;
        const cat = 'Pane Management';

        this.register({
            name: 'pane.split', category: cat,
            description: 'Split a pane horizontally (h=side-by-side) or vertically (v=top/bottom)',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
                { name: 'direction', type: 'string', required: true, description: 'Split direction', enum: ['h', 'v'] },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const target = `${p.session}:${p.window}.${p.pane}`;
                await svc.splitPane(target, p.direction);
                d.refreshTree();
                return ok(`Split pane ${target} ${p.direction === 'h' ? 'horizontally' : 'vertically'} on ${p.server}`);
            }
        });

        this.register({
            name: 'pane.kill', category: cat,
            description: 'Kill (close) a pane',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.killPane(p.session, p.window, p.pane);
                d.refreshTree();
                return ok(`Killed pane ${p.session}:${p.window}.${p.pane} on ${p.server}`);
            }
        });

        this.register({
            name: 'pane.select', category: cat,
            description: 'Focus/select a pane',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.selectPane(p.session, p.window, p.pane);
                return ok(`Selected pane ${p.session}:${p.window}.${p.pane} on ${p.server}`);
            }
        });

        this.register({
            name: 'pane.sendKeys', category: cat,
            description: 'Send keystrokes (including commands) to a pane. A trailing Enter is appended automatically',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
                { name: 'keys', type: 'string', required: true, description: 'Keystrokes or command to send' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                await svc.sendKeys(p.session, p.window, p.pane, p.keys);
                return ok(`Sent keys to ${p.session}:${p.window}.${p.pane} on ${p.server}`);
            }
        });

        this.register({
            name: 'pane.capture', category: cat,
            description: 'Capture the last N lines of terminal output from a pane',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
                { name: 'lines', type: 'number', required: false, description: 'Number of lines (default 50)' },
            ],
            returnsData: true,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const content = await svc.capturePaneContent(p.session, p.window, p.pane, p.lines ?? 50);
                return ok(`Captured ${content.length} chars from ${p.session}:${p.window}.${p.pane}`, content);
            }
        });
    }

    // ── AI Session Management ────────────────────────────────────────────────

    private registerAISessionActions(): void {
        const d = this.deps;
        const cat = 'AI Session Management';

        this.register({
            name: 'ai.createSession', category: cat,
            description: 'Create a new tmux session with an AI CLI (claude/gemini/codex) running inside',
            params: [
                this.serverParam(),
                { name: 'provider', type: 'string', required: true, description: 'AI provider', enum: ['claude', 'gemini', 'codex'] },
                { name: 'name', type: 'string', required: true, description: 'Session name' },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const provider = p.provider as AIProvider;
                await svc.newSession(p.name);
                const launchCmd = d.aiManager.getLaunchCommand(provider);
                await svc.sendKeysToSession(p.name, launchCmd);
                d.refreshTree();
                return ok(`Created AI session "${p.name}" with ${p.provider} on ${p.server}`);
            }
        });

        this.register({
            name: 'ai.forkSession', category: cat,
            description: 'Fork/continue an AI session by creating a new session with the same context',
            params: [
                this.serverParam(),
                { name: 'provider', type: 'string', required: true, description: 'AI provider', enum: ['claude', 'gemini', 'codex'] },
                { name: 'sourceSession', type: 'string', required: true, description: 'Source session to fork from' },
                { name: 'name', type: 'string', required: false, description: 'New session name (auto-generated if omitted)' },
                { name: 'sessionId', type: 'string', required: false, description: 'AI session ID (e.g. from @cc_session_id) for targeted resume' },
            ],
            returnsData: true,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const provider = p.provider as AIProvider;
                const sessions = await svc.getSessions();
                let forkName = p.name || `${p.sourceSession}-fork`;
                let counter = 2;
                while (sessions.includes(forkName)) {
                    forkName = `${p.sourceSession}-fork-${counter}`;
                    counter++;
                }
                await svc.newSession(forkName);
                const forkCmd = d.aiManager.getForkCommand(provider, p.sourceSession, p.sessionId);
                await svc.sendKeysToSession(forkName, forkCmd);
                d.refreshTree();
                return ok(`Forked "${p.sourceSession}" as "${forkName}" with ${p.provider}`, { sessionName: forkName });
            }
        });

        this.register({
            name: 'ai.launchInPane', category: cat,
            description: 'Launch an AI CLI in an existing pane',
            params: [
                this.serverParam(),
                { name: 'session', type: 'string', required: true, description: 'Session name' },
                { name: 'window', type: 'string', required: true, description: 'Window index' },
                { name: 'pane', type: 'string', required: true, description: 'Pane index' },
                { name: 'provider', type: 'string', required: true, description: 'AI provider', enum: ['claude', 'gemini', 'codex'] },
            ],
            returnsData: false,
            execute: async (p) => {
                const svc = resolveService(d, p.server);
                const launchCmd = d.aiManager.getLaunchCommand(p.provider as AIProvider);
                await svc.sendKeys(p.session, p.window, p.pane, launchCmd);
                return ok(`Launched ${p.provider} in ${p.session}:${p.window}.${p.pane} on ${p.server}`);
            }
        });
    }

    // ── AI Utilities ────────────────────────────────────────────────────────

    private registerAIUtilityActions(): void {
        const d = this.deps;
        const cat = 'AI Utilities';

        this.register({
            name: 'ai.detectProvider', category: cat,
            description: 'Detect which AI provider a command corresponds to (claude/gemini/codex)',
            params: [
                { name: 'command', type: 'string', required: true, description: 'Command string to analyze' },
            ],
            returnsData: true,
            execute: async (p) => {
                const provider = d.aiManager.detectAIProvider(p.command);
                return provider
                    ? ok(`Detected provider: ${provider}`, { provider })
                    : ok('No AI provider detected', { provider: null });
            }
        });

        this.register({
            name: 'ai.detectStatus', category: cat,
            description: 'Detect AI session status from captured pane output',
            params: [
                { name: 'provider', type: 'string', required: true, description: 'AI provider', enum: ['claude', 'gemini', 'codex'] },
                { name: 'content', type: 'string', required: true, description: 'Captured pane content to analyze' },
            ],
            returnsData: true,
            execute: async (p) => {
                const status = d.aiManager.detectAIStatus(p.provider as AIProvider, p.content);
                return ok(`Status: ${status}`, { status });
            }
        });

        this.register({
            name: 'ai.getProviders', category: cat,
            description: 'List all supported AI providers and their launch commands',
            params: [],
            returnsData: true,
            execute: async () => {
                const providers = Object.values(AIProvider).map(p => ({
                    provider: p,
                    launchCommand: d.aiManager.getLaunchCommand(p),
                    forkCommand: d.aiManager.getForkCommand(p, 'example'),
                    resumeCommand: d.aiManager.getForkCommand(p, 'example', '<session_id>')
                }));
                return ok(`${providers.length} providers: ${providers.map(p => p.provider).join(', ')}`, providers);
            }
        });
    }

    // ── Agent Orchestration ──────────────────────────────────────────────────

    private registerAgentActions(): void {
        const d = this.deps;
        const cat = 'Agent Orchestration';

        this.register({
            name: 'agent.spawn', category: cat,
            description: 'Spawn a new AI agent from a template. Creates session, launches AI CLI, and registers the agent',
            params: [
                { name: 'templateId', type: 'string', required: true, description: 'Template ID to use (see Templates in state)' },
                this.serverParam(),
                { name: 'teamId', type: 'string', required: false, description: 'Team ID to assign the agent to' },
            ],
            returnsData: true,
            execute: async (p) => {
                const template = d.templateManager.getTemplate(p.templateId);
                if (!template) { return err(`Template not found: "${p.templateId}"`); }
                const svc = resolveService(d, p.server);

                // Generate unique session name
                const sessions = await svc.getSessions();
                const baseName = `agent-${template.role}-${template.aiProvider}`;
                let name = baseName;
                let counter = 0;
                while (sessions.includes(name)) { counter++; name = `${baseName}-${counter}`; }

                // Create session and launch AI
                await svc.newSession(name);
                const launchCmd = d.aiManager.getLaunchCommand(template.aiProvider);
                await svc.sendKeysToSession(name, launchCmd);

                // Discover window/pane indices
                const freshSessions = await svc.getTmuxTreeFresh();
                const session = freshSessions.find(s => s.name === name);
                const windowIndex = session?.windows[0]?.index || '0';
                const paneIndex = session?.windows[0]?.panes[0]?.index || '0';

                // Register agent
                const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const agent: AgentInstance = {
                    id: agentId, templateId: template.id, name,
                    role: template.role, aiProvider: template.aiProvider,
                    state: AgentState.SPAWNING, serverId: svc.serverId,
                    sessionName: name, windowIndex, paneIndex,
                    teamId: p.teamId, createdAt: Date.now(), lastActivityAt: Date.now()
                };
                d.orchestrator.registerAgent(agent);

                if (p.teamId) { d.teamManager.addAgentToTeam(p.teamId, agentId); }

                // Transition to IDLE after brief delay
                setTimeout(() => d.orchestrator.updateAgentState(agentId, AgentState.IDLE), 3000);

                d.refreshTree();
                return ok(`Spawned agent "${name}" [${agentId}]`, { agentId, name, sessionName: name });
            }
        });

        this.register({
            name: 'agent.kill', category: cat,
            description: 'Terminate an agent and delete its tmux session',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const agent = d.orchestrator.getAgent(p.agentId);
                if (!agent) { return err(`Agent not found: "${p.agentId}"`); }
                d.orchestrator.removeAgent(p.agentId);
                const svc = d.serviceManager.getService(agent.serverId);
                if (svc) {
                    try { await svc.deleteSession(agent.sessionName); } catch { /* session may already be gone */ }
                }
                d.refreshTree();
                return ok(`Terminated agent "${agent.name}" [${p.agentId}]`);
            }
        });

        this.register({
            name: 'agent.sendPrompt', category: cat,
            description: 'Send a prompt/command to a running agent',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
                { name: 'prompt', type: 'string', required: true, description: 'Prompt text to send' },
            ],
            returnsData: false,
            execute: async (p) => {
                const agent = d.orchestrator.getAgent(p.agentId);
                if (!agent) { return err(`Agent not found: "${p.agentId}"`); }
                await d.orchestrator.sendPromptToAgent(p.agentId, p.prompt);
                return ok(`Sent prompt to agent "${agent.name}"`);
            }
        });

        this.register({
            name: 'agent.getOutput', category: cat,
            description: 'Capture recent terminal output from an agent\'s pane',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
                { name: 'lines', type: 'number', required: false, description: 'Number of lines (default 50)' },
            ],
            returnsData: true,
            execute: async (p) => {
                const agent = d.orchestrator.getAgent(p.agentId);
                if (!agent) { return err(`Agent not found: "${p.agentId}"`); }
                const svc = d.serviceManager.getService(agent.serverId);
                if (!svc) { return err(`Server not found: "${agent.serverId}"`); }
                const content = await svc.capturePaneContent(agent.sessionName, agent.windowIndex, agent.paneIndex, p.lines ?? 50);
                return ok(`Captured ${content.length} chars from agent "${agent.name}"`, content);
            }
        });

        this.register({
            name: 'agent.list', category: cat,
            description: 'List all registered agents with their states',
            params: [],
            returnsData: true,
            execute: async () => {
                const agents = d.orchestrator.getAllAgents();
                if (agents.length === 0) { return ok('No agents registered', []); }
                const summary = agents.map(a => `${a.name} [${a.id}] role=${a.role} provider=${a.aiProvider} state=${a.state} server=${a.serverId}`);
                return ok(`${agents.length} agent(s):\n${summary.join('\n')}`, agents.map(a => ({
                    id: a.id, name: a.name, role: a.role, state: a.state, serverId: a.serverId
                })));
            }
        });
    }

    // ── Agent Queries ────────────────────────────────────────────────────────

    private registerAgentQueryActions(): void {
        const d = this.deps;
        const cat = 'Agent Queries';

        this.register({
            name: 'agent.query', category: cat,
            description: 'Get detailed information about a specific agent',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const agent = d.orchestrator.getAgent(p.agentId);
                if (!agent) { return err(`Agent not found: "${p.agentId}"`); }
                return ok(`Agent "${agent.name}": role=${agent.role} state=${agent.state} provider=${agent.aiProvider}`, {
                    id: agent.id, name: agent.name, role: agent.role, state: agent.state,
                    aiProvider: agent.aiProvider, serverId: agent.serverId, teamId: agent.teamId,
                    currentTaskId: agent.currentTaskId, sessionName: agent.sessionName,
                    windowIndex: agent.windowIndex, paneIndex: agent.paneIndex,
                    createdAt: agent.createdAt, lastActivityAt: agent.lastActivityAt, errorMessage: agent.errorMessage
                });
            }
        });

        this.register({
            name: 'agent.getIdle', category: cat,
            description: 'List all idle agents, optionally filtered by role',
            params: [
                { name: 'role', type: 'string', required: false, description: 'Filter by role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
            ],
            returnsData: true,
            execute: async (p) => {
                const role = p.role ? p.role as AgentRole : undefined;
                const agents = d.orchestrator.getIdleAgents(role);
                if (agents.length === 0) { return ok('No idle agents', []); }
                const summary = agents.map(a => `"${a.name}" [${a.id}] role=${a.role} provider=${a.aiProvider}`);
                return ok(`${agents.length} idle agent(s):\n${summary.join('\n')}`, agents.map(a => ({
                    id: a.id, name: a.name, role: a.role, aiProvider: a.aiProvider, serverId: a.serverId
                })));
            }
        });

        this.register({
            name: 'agent.getByRole', category: cat,
            description: 'List all agents with a specific role',
            params: [
                { name: 'role', type: 'string', required: true, description: 'Agent role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
            ],
            returnsData: true,
            execute: async (p) => {
                const agents = d.orchestrator.getAgentsByRole(p.role as AgentRole);
                if (agents.length === 0) { return ok(`No agents with role "${p.role}"`, []); }
                const summary = agents.map(a => `"${a.name}" [${a.id}] state=${a.state} provider=${a.aiProvider}`);
                return ok(`${agents.length} ${p.role} agent(s):\n${summary.join('\n')}`, agents.map(a => ({
                    id: a.id, name: a.name, role: a.role, state: a.state, aiProvider: a.aiProvider, serverId: a.serverId
                })));
            }
        });

        this.register({
            name: 'agent.getByTeam', category: cat,
            description: 'List all agents in a specific team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const agents = d.orchestrator.getAgentsByTeam(p.teamId);
                if (agents.length === 0) { return ok(`No agents in team "${p.teamId}"`, []); }
                const summary = agents.map(a => `"${a.name}" [${a.id}] role=${a.role} state=${a.state}`);
                return ok(`${agents.length} agent(s) in team:\n${summary.join('\n')}`, agents.map(a => ({
                    id: a.id, name: a.name, role: a.role, state: a.state, aiProvider: a.aiProvider
                })));
            }
        });

        this.register({
            name: 'agent.updateState', category: cat,
            description: 'Manually update an agent\'s state',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
                { name: 'state', type: 'string', required: true, description: 'New state', enum: ['idle', 'working', 'error', 'completed'] },
                { name: 'error', type: 'string', required: false, description: 'Error message (for error state)' },
            ],
            returnsData: false,
            execute: async (p) => {
                const agent = d.orchestrator.getAgent(p.agentId);
                if (!agent) { return err(`Agent not found: "${p.agentId}"`); }
                d.orchestrator.updateAgentState(p.agentId, p.state as AgentState, p.error);
                return ok(`Updated agent "${agent.name}" state to ${p.state}`);
            }
        });
    }

    // ── Team Management ──────────────────────────────────────────────────────

    private registerTeamActions(): void {
        const d = this.deps;
        const cat = 'Team Management';

        this.register({
            name: 'team.create', category: cat,
            description: 'Create a new agent team',
            params: [
                { name: 'name', type: 'string', required: true, description: 'Team name' },
                { name: 'description', type: 'string', required: false, description: 'Team description' },
            ],
            returnsData: true,
            execute: async (p) => {
                const team = d.teamManager.createTeam(p.name, p.description);
                return ok(`Created team "${p.name}" [${team.id}]`, { teamId: team.id });
            }
        });

        this.register({
            name: 'team.delete', category: cat,
            description: 'Delete a team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const team = d.teamManager.getTeam(p.teamId);
                if (!team) { return err(`Team not found: "${p.teamId}"`); }
                d.teamManager.deleteTeam(p.teamId);
                return ok(`Deleted team "${team.name}"`);
            }
        });

        this.register({
            name: 'team.addAgent', category: cat,
            description: 'Add an agent to a team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.teamManager.addAgentToTeam(p.teamId, p.agentId);
                return ok(`Added agent ${p.agentId} to team ${p.teamId}`);
            }
        });

        this.register({
            name: 'team.removeAgent', category: cat,
            description: 'Remove an agent from a team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.teamManager.removeAgentFromTeam(p.teamId, p.agentId);
                return ok(`Removed agent ${p.agentId} from team ${p.teamId}`);
            }
        });

        this.register({
            name: 'team.list', category: cat,
            description: 'List all teams',
            params: [],
            returnsData: true,
            execute: async () => {
                const teams = d.teamManager.getAllTeams();
                if (teams.length === 0) { return ok('No teams', []); }
                const summary = teams.map(t => `"${t.name}" [${t.id}] agents: ${t.agents.length}`);
                return ok(`${teams.length} team(s):\n${summary.join('\n')}`, teams.map(t => ({
                    id: t.id, name: t.name, agentCount: t.agents.length, agents: t.agents
                })));
            }
        });
    }

    // ── Team Queries ─────────────────────────────────────────────────────────

    private registerTeamQueryActions(): void {
        const d = this.deps;
        const cat = 'Team Queries';

        this.register({
            name: 'team.query', category: cat,
            description: 'Get detailed information about a specific team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const team = d.teamManager.getTeam(p.teamId);
                if (!team) { return err(`Team not found: "${p.teamId}"`); }
                return ok(`Team "${team.name}": ${team.agents.length} agent(s)`, {
                    id: team.id, name: team.name, description: team.description,
                    agents: team.agents, pipelineId: team.pipelineId, createdAt: team.createdAt
                });
            }
        });

        this.register({
            name: 'team.getAgents', category: cat,
            description: 'List agent IDs belonging to a team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const agents = d.teamManager.getTeamAgents(p.teamId);
                return ok(`${agents.length} agent(s) in team`, agents);
            }
        });

        this.register({
            name: 'team.setPipeline', category: cat,
            description: 'Assign a pipeline to a team',
            params: [
                { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.teamManager.setPipelineForTeam(p.teamId, p.pipelineId);
                return ok(`Assigned pipeline ${p.pipelineId} to team ${p.teamId}`);
            }
        });

        this.register({
            name: 'team.findByAgent', category: cat,
            description: 'Find which team an agent belongs to',
            params: [
                { name: 'agentId', type: 'string', required: true, description: 'Agent ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const team = d.teamManager.findTeamForAgent(p.agentId);
                if (!team) { return ok(`Agent ${p.agentId} is not in any team`, { teamId: null }); }
                return ok(`Agent ${p.agentId} is in team "${team.name}" [${team.id}]`, {
                    teamId: team.id, teamName: team.name
                });
            }
        });
    }

    // ── Pipeline Management ──────────────────────────────────────────────────

    private registerPipelineActions(): void {
        const d = this.deps;
        const cat = 'Pipeline Management';

        this.register({
            name: 'pipeline.create', category: cat,
            description: 'Create a new pipeline',
            params: [
                { name: 'name', type: 'string', required: true, description: 'Pipeline name' },
                { name: 'description', type: 'string', required: false, description: 'Pipeline description' },
            ],
            returnsData: true,
            execute: async (p) => {
                const pipeline = d.pipelineEngine.createPipeline(p.name, p.description);
                return ok(`Created pipeline "${p.name}" [${pipeline.id}]`, { pipelineId: pipeline.id });
            }
        });

        this.register({
            name: 'pipeline.delete', category: cat,
            description: 'Delete a pipeline',
            params: [
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.deletePipeline(p.pipelineId);
                return ok(`Deleted pipeline ${p.pipelineId}`);
            }
        });

        this.register({
            name: 'pipeline.addStage', category: cat,
            description: 'Add a stage to a pipeline',
            params: [
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
                { name: 'name', type: 'string', required: true, description: 'Stage name' },
                { name: 'type', type: 'string', required: true, description: 'Stage type', enum: ['sequential', 'parallel', 'conditional', 'fan_out'] },
                { name: 'agentRole', type: 'string', required: true, description: 'Agent role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
                { name: 'taskDescription', type: 'string', required: true, description: 'What this stage does' },
                { name: 'dependsOn', type: 'string', required: false, description: 'Comma-separated stage IDs this depends on' },
            ],
            returnsData: true,
            execute: async (p) => {
                const deps = (p.dependsOn && typeof p.dependsOn === 'string')
                    ? p.dependsOn.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : [];
                const stage = d.pipelineEngine.addStage(p.pipelineId, {
                    name: p.name,
                    type: p.type as StageType,
                    agentRole: p.agentRole as AgentRole,
                    taskDescription: p.taskDescription,
                    dependsOn: deps,
                });
                return ok(`Added stage "${p.name}" [${stage.id}] to pipeline ${p.pipelineId}`, { stageId: stage.id });
            }
        });

        this.register({
            name: 'pipeline.removeStage', category: cat,
            description: 'Remove a stage from a pipeline',
            params: [
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
                { name: 'stageId', type: 'string', required: true, description: 'Stage ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.removeStage(p.pipelineId, p.stageId);
                return ok(`Removed stage ${p.stageId} from pipeline ${p.pipelineId}`);
            }
        });

        this.register({
            name: 'pipeline.startRun', category: cat,
            description: 'Start a pipeline run',
            params: [
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const run = d.pipelineEngine.startRun(p.pipelineId);
                return ok(`Started pipeline run [${run.id}]`, { runId: run.id });
            }
        });

        this.register({
            name: 'pipeline.pauseRun', category: cat,
            description: 'Pause a running pipeline',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.pauseRun(p.runId);
                return ok(`Paused pipeline run ${p.runId}`);
            }
        });

        this.register({
            name: 'pipeline.resumeRun', category: cat,
            description: 'Resume a paused pipeline',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.resumeRun(p.runId);
                return ok(`Resumed pipeline run ${p.runId}`);
            }
        });

        this.register({
            name: 'pipeline.createFromDescription', category: cat,
            description: 'Create a pipeline from a natural language description using AI',
            params: [
                { name: 'description', type: 'string', required: true, description: 'Natural language description of the pipeline' },
            ],
            returnsData: true,
            execute: async (p) => {
                const pipeline = await d.pipelineEngine.createPipelineFromDescription(p.description);
                return ok('Created pipeline "' + pipeline.name + '"', { pipelineId: pipeline.id, stageCount: pipeline.stages.length });
            }
        });

        this.register({
            name: 'pipeline.list', category: cat,
            description: 'List all pipelines',
            params: [],
            returnsData: true,
            execute: async () => {
                const pipelines = d.pipelineEngine.getAllPipelines();
                if (pipelines.length === 0) { return ok('No pipelines', []); }
                const summary = pipelines.map(p => `"${p.name}" [${p.id}] stages: ${p.stages.length}`);
                return ok(`${pipelines.length} pipeline(s):\n${summary.join('\n')}`, pipelines.map(p => ({
                    id: p.id, name: p.name, stageCount: p.stages.length
                })));
            }
        });
    }

    // ── Pipeline Queries ──────────────────────────────────────────────────────

    private registerPipelineQueryActions(): void {
        const d = this.deps;
        const cat = 'Pipeline Queries';

        this.register({
            name: 'pipeline.query', category: cat,
            description: 'Get detailed information about a specific pipeline including stages',
            params: [
                { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const pipeline = d.pipelineEngine.getPipeline(p.pipelineId);
                if (!pipeline) { return err(`Pipeline not found: "${p.pipelineId}"`); }
                const stageSummary = pipeline.stages.map(s =>
                    `  "${s.name}" [${s.id}] type=${s.type} role=${s.agentRole}${s.dependsOn.length ? ` depends=[${s.dependsOn.join(',')}]` : ''}`
                );
                return ok(`Pipeline "${pipeline.name}" — ${pipeline.stages.length} stage(s):\n${stageSummary.join('\n')}`, {
                    id: pipeline.id, name: pipeline.name, description: pipeline.description,
                    stages: pipeline.stages, createdAt: pipeline.createdAt, updatedAt: pipeline.updatedAt
                });
            }
        });

        this.register({
            name: 'pipeline.getActiveRuns', category: cat,
            description: 'List all active pipeline runs',
            params: [],
            returnsData: true,
            execute: async () => {
                const runs = d.pipelineEngine.getActiveRuns();
                if (runs.length === 0) { return ok('No active pipeline runs', []); }
                const summary = runs.map(r => `[${r.id}] pipeline=${r.pipelineId} status=${r.status} stages=${Object.keys(r.stageResults).length}`);
                return ok(`${runs.length} active run(s):\n${summary.join('\n')}`, runs.map(r => ({
                    id: r.id, pipelineId: r.pipelineId, status: r.status,
                    stageResultCount: Object.keys(r.stageResults).length, startedAt: r.startedAt
                })));
            }
        });

        this.register({
            name: 'pipeline.getRun', category: cat,
            description: 'Get detailed information about a pipeline run including stage results',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const run = d.pipelineEngine.getRun(p.runId);
                if (!run) { return err(`Run not found: "${p.runId}"`); }
                const pipeline = d.pipelineEngine.getPipeline(run.pipelineId);
                const stageNames = pipeline ? Object.fromEntries(pipeline.stages.map(s => [s.id, s.name])) : {};
                const resultSummary = Object.entries(run.stageResults).map(([sid, r]) =>
                    `  "${stageNames[sid] || sid}": ${r.status}${r.agentId ? ` (agent: ${r.agentId})` : ''}${r.errorMessage ? ` ERROR: ${r.errorMessage}` : ''}`
                );
                return ok(`Run [${run.id}] status=${run.status}\n${resultSummary.join('\n')}`, {
                    id: run.id, pipelineId: run.pipelineId, status: run.status,
                    stageResults: run.stageResults, startedAt: run.startedAt, completedAt: run.completedAt
                });
            }
        });

        this.register({
            name: 'pipeline.markStageCompleted', category: cat,
            description: 'Manually mark a pipeline stage as completed',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
                { name: 'stageId', type: 'string', required: true, description: 'Stage ID' },
                { name: 'output', type: 'string', required: false, description: 'Stage output' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.markStageCompleted(p.runId, p.stageId, p.output);
                return ok(`Marked stage ${p.stageId} as completed in run ${p.runId}`);
            }
        });

        this.register({
            name: 'pipeline.markStageFailed', category: cat,
            description: 'Manually mark a pipeline stage as failed',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
                { name: 'stageId', type: 'string', required: true, description: 'Stage ID' },
                { name: 'error', type: 'string', required: true, description: 'Error message' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.pipelineEngine.markStageFailed(p.runId, p.stageId, p.error);
                return ok(`Marked stage ${p.stageId} as failed in run ${p.runId}`);
            }
        });

        this.register({
            name: 'pipeline.getBuiltIn', category: cat,
            description: 'List built-in pipeline templates',
            params: [],
            returnsData: true,
            execute: async () => {
                const pipelines = d.pipelineEngine.getBuiltInPipelines();
                const summary = pipelines.map(p => `"${p.name}" [${p.id}] — ${p.stages.length} stages: ${p.description || ''}`);
                return ok(`${pipelines.length} built-in pipeline(s):\n${summary.join('\n')}`, pipelines.map(p => ({
                    id: p.id, name: p.name, description: p.description, stageCount: p.stages.length
                })));
            }
        });

        this.register({
            name: 'pipeline.getReadyStages', category: cat,
            description: 'Get stages that are ready to execute in a run (all dependencies met)',
            params: [
                { name: 'runId', type: 'string', required: true, description: 'Run ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const run = d.pipelineEngine.getRun(p.runId);
                if (!run) { return err(`Run not found: "${p.runId}"`); }
                const stages = d.pipelineEngine.getReadyStages(run);
                if (stages.length === 0) { return ok('No stages ready to execute', []); }
                const summary = stages.map(s => `"${s.name}" [${s.id}] role=${s.agentRole} type=${s.type}`);
                return ok(`${stages.length} ready stage(s):\n${summary.join('\n')}`, stages.map(s => ({
                    id: s.id, name: s.name, type: s.type, agentRole: s.agentRole, taskDescription: s.taskDescription
                })));
            }
        });
    }

    // ── Template Management ──────────────────────────────────────────────────

    private registerTemplateActions(): void {
        const d = this.deps;
        const cat = 'Template Management';

        this.register({
            name: 'template.list', category: cat,
            description: 'List all available agent templates',
            params: [],
            returnsData: true,
            execute: async () => {
                const templates = d.templateManager.getAllTemplates();
                const summary = templates.map(t => `"${t.name}" [${t.id}] role=${t.role} provider=${t.aiProvider}`);
                return ok(`${templates.length} template(s):\n${summary.join('\n')}`, templates.map(t => ({
                    id: t.id, name: t.name, role: t.role, aiProvider: t.aiProvider
                })));
            }
        });

        this.register({
            name: 'template.create', category: cat,
            description: 'Create a new agent template',
            params: [
                { name: 'name', type: 'string', required: true, description: 'Template name' },
                { name: 'role', type: 'string', required: true, description: 'Agent role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
                { name: 'aiProvider', type: 'string', required: true, description: 'AI provider', enum: ['claude', 'gemini', 'codex'] },
                { name: 'description', type: 'string', required: false, description: 'Template description' },
            ],
            returnsData: true,
            execute: async (p) => {
                const template = d.templateManager.createTemplate({
                    name: p.name,
                    role: p.role as AgentRole,
                    aiProvider: p.aiProvider as AIProvider,
                    description: p.description || `Custom ${p.role} agent with ${p.aiProvider}`,
                });
                await d.templateManager.saveToSettings();
                return ok(`Created template "${p.name}" [${template.id}]`, { templateId: template.id });
            }
        });

        this.register({
            name: 'template.delete', category: cat,
            description: 'Delete a custom agent template (built-in templates cannot be deleted)',
            params: [
                { name: 'templateId', type: 'string', required: true, description: 'Template ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                if (d.templateManager.isBuiltIn(p.templateId)) {
                    return err(`Cannot delete built-in template "${p.templateId}"`);
                }
                const deleted = d.templateManager.deleteTemplate(p.templateId);
                if (!deleted) { return err(`Template not found: "${p.templateId}"`); }
                await d.templateManager.saveToSettings();
                return ok(`Deleted template ${p.templateId}`);
            }
        });
    }

    // ── Template Queries ─────────────────────────────────────────────────────

    private registerTemplateQueryActions(): void {
        const d = this.deps;
        const cat = 'Template Queries';

        this.register({
            name: 'template.query', category: cat,
            description: 'Get detailed information about a specific agent template',
            params: [
                { name: 'templateId', type: 'string', required: true, description: 'Template ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const template = d.templateManager.getTemplate(p.templateId);
                if (!template) { return err(`Template not found: "${p.templateId}"`); }
                return ok(`Template "${template.name}" [${template.id}]`, {
                    id: template.id, name: template.name, role: template.role,
                    aiProvider: template.aiProvider, description: template.description,
                    systemPrompt: template.systemPrompt, isBuiltIn: d.templateManager.isBuiltIn(template.id)
                });
            }
        });

        this.register({
            name: 'template.getByRole', category: cat,
            description: 'List templates filtered by agent role',
            params: [
                { name: 'role', type: 'string', required: true, description: 'Agent role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
            ],
            returnsData: true,
            execute: async (p) => {
                const templates = d.templateManager.getTemplatesByRole(p.role as AgentRole);
                if (templates.length === 0) { return ok(`No templates for role "${p.role}"`, []); }
                const summary = templates.map(t => `"${t.name}" [${t.id}] provider=${t.aiProvider}`);
                return ok(`${templates.length} template(s) for ${p.role}:\n${summary.join('\n')}`, templates.map(t => ({
                    id: t.id, name: t.name, role: t.role, aiProvider: t.aiProvider
                })));
            }
        });

        this.register({
            name: 'template.update', category: cat,
            description: 'Update properties of an existing custom template',
            params: [
                { name: 'templateId', type: 'string', required: true, description: 'Template ID' },
                { name: 'name', type: 'string', required: false, description: 'New name' },
                { name: 'description', type: 'string', required: false, description: 'New description' },
                { name: 'systemPrompt', type: 'string', required: false, description: 'New system prompt' },
            ],
            returnsData: false,
            execute: async (p) => {
                if (d.templateManager.isBuiltIn(p.templateId)) {
                    return err(`Cannot update built-in template "${p.templateId}"`);
                }
                const updates: Record<string, any> = {};
                if (p.name !== undefined) { updates.name = p.name; }
                if (p.description !== undefined) { updates.description = p.description; }
                if (p.systemPrompt !== undefined) { updates.systemPrompt = p.systemPrompt; }
                d.templateManager.updateTemplate(p.templateId, updates);
                await d.templateManager.saveToSettings();
                return ok(`Updated template ${p.templateId}`);
            }
        });

        this.register({
            name: 'template.getBuiltIn', category: cat,
            description: 'List built-in agent templates',
            params: [],
            returnsData: true,
            execute: async () => {
                const templates = d.templateManager.getBuiltInTemplates();
                const summary = templates.map(t => `"${t.name}" [${t.id}] role=${t.role} provider=${t.aiProvider}`);
                return ok(`${templates.length} built-in template(s):\n${summary.join('\n')}`, templates.map(t => ({
                    id: t.id, name: t.name, role: t.role, aiProvider: t.aiProvider, description: t.description
                })));
            }
        });
    }

    // ── Task Management ──────────────────────────────────────────────────────

    private registerTaskActions(): void {
        const d = this.deps;
        const cat = 'Task Management';

        this.register({
            name: 'task.submit', category: cat,
            description: 'Submit a task described in natural language. AI routes it to the best agent role',
            params: [
                { name: 'description', type: 'string', required: true, description: 'Task description in natural language' },
            ],
            returnsData: true,
            execute: async (p) => {
                try {
                    const task = await d.taskRouter.parseTaskFromNaturalLanguage(p.description);
                    d.orchestrator.submitTask(task);
                    return ok(`Task submitted [${task.id}] → ${task.targetRole} (priority ${task.priority})`, {
                        taskId: task.id, targetRole: task.targetRole, priority: task.priority
                    });
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    return err(`Failed to route task: ${msg}`);
                }
            }
        });

        this.register({
            name: 'task.cancel', category: cat,
            description: 'Cancel a pending task',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.orchestrator.cancelTask(p.taskId);
                return ok(`Cancelled task ${p.taskId}`);
            }
        });

        this.register({
            name: 'task.list', category: cat,
            description: 'List all tasks in the queue',
            params: [],
            returnsData: true,
            execute: async () => {
                const tasks = d.orchestrator.getTaskQueue();
                if (tasks.length === 0) { return ok('No tasks in queue', []); }
                const summary = tasks.map(t => `[${t.id}] "${t.description}" status=${t.status} priority=${t.priority} role=${t.targetRole || 'any'}`);
                return ok(`${tasks.length} task(s):\n${summary.join('\n')}`, tasks.map(t => ({
                    id: t.id, description: t.description, status: t.status, priority: t.priority
                })));
            }
        });
    }

    // ── Task Queries ─────────────────────────────────────────────────────────

    private registerTaskQueryActions(): void {
        const d = this.deps;
        const cat = 'Task Queries';

        this.register({
            name: 'task.query', category: cat,
            description: 'Get detailed information about a specific task',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: "${p.taskId}"`); }
                return ok(`Task "${task.description}" — status=${task.status} priority=${task.priority}`, {
                    id: task.id, description: task.description, status: task.status, priority: task.priority,
                    targetRole: task.targetRole, assignedAgentId: task.assignedAgentId,
                    kanbanColumn: task.kanbanColumn, swimLaneId: task.swimLaneId,
                    input: task.input, output: task.output,
                    createdAt: task.createdAt, startedAt: task.startedAt, completedAt: task.completedAt,
                    errorMessage: task.errorMessage, parentTaskId: task.parentTaskId, subtaskIds: task.subtaskIds,
                    verificationStatus: task.verificationStatus
                });
            }
        });

        this.register({
            name: 'task.delete', category: cat,
            description: 'Delete a task from the queue',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: "${p.taskId}"`); }
                d.orchestrator.cancelTask(p.taskId);
                d.updateKanban?.();
                return ok(`Deleted task "${task.description}" [${p.taskId}]`);
            }
        });

        this.register({
            name: 'task.updateStatus', category: cat,
            description: 'Update the status of a task',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
                { name: 'status', type: 'string', required: true, description: 'New status', enum: ['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'] },
                { name: 'output', type: 'string', required: false, description: 'Task output/result' },
                { name: 'error', type: 'string', required: false, description: 'Error message (for failed status)' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: "${p.taskId}"`); }
                task.status = p.status as TaskStatus;
                if (p.output) { task.output = p.output; }
                if (p.error) { task.errorMessage = p.error; }
                if (p.status === 'completed') { task.completedAt = Date.now(); task.kanbanColumn = 'done'; markDoneTimestamp(task); }
                if (p.status === 'in_progress') { task.startedAt = task.startedAt || Date.now(); task.kanbanColumn = 'in_progress'; }
                if (p.status === 'failed') { task.completedAt = Date.now(); }
                d.updateKanban?.();
                return ok(`Updated task ${p.taskId} status to ${p.status}`);
            }
        });

        this.register({
            name: 'task.getFanOutResults', category: cat,
            description: 'Get completed fan-out task results for a pipeline stage',
            params: [
                { name: 'stageId', type: 'string', required: true, description: 'Pipeline stage ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const results = d.orchestrator.getFanOutResults(p.stageId);
                if (results.length === 0) { return ok(`No completed results for stage ${p.stageId}`, []); }
                const summary = results.map(t => `[${t.id}] "${t.description}" output=${t.output?.slice(0, 100) || '(none)'}`);
                return ok(`${results.length} result(s):\n${summary.join('\n')}`, results.map(t => ({
                    id: t.id, description: t.description, output: t.output, completedAt: t.completedAt
                })));
            }
        });

        this.register({
            name: 'task.dispatchNext', category: cat,
            description: 'Manually trigger dispatch of the next pending task to an idle agent',
            params: [],
            returnsData: false,
            execute: async () => {
                await d.orchestrator.dispatchNextTask();
                return ok('Dispatched next task (if any pending task and idle agent were available)');
            }
        });
    }

    // ── VS Code Integration ──────────────────────────────────────────────────

    private registerVSCodeActions(): void {
        const cat = 'VS Code Integration';

        this.register({
            name: 'vscode.openDashboard', category: cat,
            description: 'Open the Agent Dashboard panel in VS Code',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openDashboard');
                return ok('Opened Agent Dashboard');
            }
        });

        this.register({
            name: 'vscode.openPipelineGraph', category: cat,
            description: 'Open the Pipeline Graph view in VS Code',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openGraph');
                return ok('Opened Pipeline Graph');
            }
        });

        this.register({
            name: 'vscode.refreshTree', category: cat,
            description: 'Refresh the tmux tree view',
            params: [],
            returnsData: false,
            execute: async () => {
                this.deps.refreshTree();
                return ok('Refreshed tree view');
            }
        });

        this.register({
            name: 'vscode.openKanban', category: cat,
            description: 'Open the Kanban board panel',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok('Opened Kanban board');
            }
        });

        this.register({
            name: 'vscode.spawnAgent', category: cat,
            description: 'Open the interactive Spawn Agent dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.spawnAgent');
                return ok('Opened Spawn Agent dialog');
            }
        });

        this.register({
            name: 'vscode.submitTask', category: cat,
            description: 'Open the interactive Submit Task dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.submitTask');
                return ok('Opened Submit Task dialog');
            }
        });

        this.register({
            name: 'vscode.manageTemplates', category: cat,
            description: 'Open the Manage Templates dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.manageTemplates');
                return ok('Opened Manage Templates dialog');
            }
        });

        this.register({
            name: 'vscode.fanOut', category: cat,
            description: 'Open the Fan-Out Task dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.fanOut');
                return ok('Opened Fan-Out dialog');
            }
        });
    }

    // ── Kanban Board ────────────────────────────────────────────────────────

    private registerKanbanActions(): void {
        const d = this.deps;
        const cat = 'Kanban Board';

        this.register({
            name: 'kanban.open', category: cat,
            description: 'Open the Kanban task board',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok('Opened Kanban board');
            }
        });

        this.register({
            name: 'kanban.listSwimLanes', category: cat,
            description: 'List all kanban swim lanes',
            params: [],
            returnsData: true,
            execute: async () => {
                const lanes = d.getSwimLanes?.() || [];
                if (lanes.length === 0) { return ok('No swim lanes', []); }
                const summary = lanes.map(l => `"${l.name}" [${l.id}] server=${l.serverId} dir=${l.workingDirectory} session=${l.sessionName} active=${l.sessionActive}`);
                return ok(`${lanes.length} swim lane(s):\n${summary.join('\n')}`, lanes.map(l => ({
                    id: l.id, name: l.name, serverId: l.serverId, workingDirectory: l.workingDirectory,
                    sessionName: l.sessionName, sessionActive: l.sessionActive
                })));
            }
        });

        this.register({
            name: 'kanban.createSwimLane', category: cat,
            description: 'Create a new kanban swim lane',
            params: [
                { name: 'name', type: 'string', required: true, description: 'Swim lane name' },
                { name: 'server', type: 'string', required: true, description: 'Server ID' },
                { name: 'workingDirectory', type: 'string', required: false, description: 'Working directory (default ~/)' },
            ],
            returnsData: true,
            execute: async (p) => {
                const laneId = 'lane-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                const sessionName = (p.name || 'lane').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) + '-lane';
                const lane: KanbanSwimLane = {
                    id: laneId, name: p.name, serverId: p.server,
                    workingDirectory: p.workingDirectory || '~/',
                    sessionName, createdAt: Date.now(), sessionActive: false
                };
                d.addSwimLane?.(lane);
                d.updateKanban?.();
                return ok(`Created swim lane "${p.name}" [${laneId}]`, { laneId, sessionName });
            }
        });

        this.register({
            name: 'kanban.deleteSwimLane', category: cat,
            description: 'Delete a kanban swim lane',
            params: [
                { name: 'laneId', type: 'string', required: true, description: 'Swim lane ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                d.deleteSwimLane?.(p.laneId);
                d.updateKanban?.();
                return ok(`Deleted swim lane ${p.laneId}`);
            }
        });

        this.register({
            name: 'kanban.createTask', category: cat,
            description: 'Create a task on the kanban board',
            params: [
                { name: 'description', type: 'string', required: true, description: 'Task title/description' },
                { name: 'column', type: 'string', required: false, description: 'Kanban column', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'] },
                { name: 'swimLaneId', type: 'string', required: false, description: 'Swim lane ID' },
                { name: 'priority', type: 'number', required: false, description: 'Priority 1-10 (default 5)' },
                { name: 'role', type: 'string', required: false, description: 'Target role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
                { name: 'details', type: 'string', required: false, description: 'Additional task details' },
                { name: 'autoStart', type: 'boolean', required: false, description: 'Auto-start: automatically launch implementation (default false)' },
                { name: 'autoPilot', type: 'boolean', required: false, description: 'Auto-pilot: automatically answer questions (default false)' },
                { name: 'autoClose', type: 'boolean', required: false, description: 'Auto-close: close tmux and move to done when finished (default false)' },
                { name: 'useWorktree', type: 'boolean', required: false, description: 'Use git worktree: run task in a dedicated git worktree (default false)' },
                { name: 'dependsOn', type: 'string', required: false, description: 'Comma-separated task IDs this task depends on (must complete before this task starts)' },
                { name: 'aiProvider', type: 'string', required: false, description: 'AI provider override (default: use swim lane or global default)', enum: ['claude','gemini','codex','opencode','cursor','copilot','aider','amp','cline','kiro'] },
                { name: 'aiModel', type: 'string', required: false, description: 'AI model override (default: use swim lane or global default)' },
            ],
            returnsData: true,
            execute: async (p) => {
                const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const task: OrchestratorTask = {
                    id: taskId, description: p.description,
                    status: TaskStatus.PENDING, priority: p.priority || 5,
                    createdAt: Date.now(),
                    kanbanColumn: p.column || 'todo',
                    swimLaneId: p.swimLaneId || undefined,
                    targetRole: p.role || undefined,
                    input: p.details || undefined,
                    autoStart: p.autoStart !== undefined ? !!p.autoStart : undefined,
                    autoPilot: p.autoPilot !== undefined ? !!p.autoPilot : undefined,
                    autoClose: p.autoClose !== undefined ? !!p.autoClose : undefined,
                    useWorktree: p.useWorktree !== undefined ? !!p.useWorktree : undefined,
                    dependsOn: p.dependsOn ? String(p.dependsOn).split(',').map((s: string) => s.trim()).filter((s: string) => s) : undefined,
                    aiProvider: p.aiProvider || undefined,
                    aiModel: p.aiModel || undefined,
                };
                // Inherit swim lane defaults for any toggles not explicitly set
                if (task.swimLaneId) {
                    const lanes = d.getSwimLanes?.() || [];
                    const lane = lanes.find(l => l.id === task.swimLaneId);
                    applySwimLaneDefaults(task, lane);
                }
                d.orchestrator.submitTask(task);
                d.saveTask?.(task);
                // Auto-cascade: when autoStart + dependencies, force deps to auto-start/pilot/close
                if (task.autoStart && task.dependsOn && task.dependsOn.length > 0) {
                    for (const depId of task.dependsOn) {
                        const dep = d.orchestrator.getTask(depId);
                        if (dep) {
                            dep.autoStart = true;
                            dep.autoPilot = true;
                            dep.autoClose = true;
                            d.saveTask?.(dep);
                            if ((dep.kanbanColumn === 'todo' || dep.kanbanColumn === 'backlog') && dep.swimLaneId) {
                                await d.startTaskFlow?.(dep);
                            }
                        }
                    }
                } else if (task.autoStart && task.kanbanColumn === 'todo' && task.swimLaneId) {
                    // Auto-start if enabled, no deps, in todo with a swim lane
                    await d.startTaskFlow?.(task);
                }
                d.updateKanban?.();
                const autoFlags = [task.autoStart && 'S', task.autoPilot && 'P', task.autoClose && 'C', task.useWorktree && 'W'].filter(Boolean);
                return ok(`Created task "${p.description}" [${taskId}]${autoFlags.length ? ' (auto:' + autoFlags.join('') + ')' : ''}`, { taskId });
            }
        });

        this.register({
            name: 'kanban.moveTask', category: cat,
            description: 'Move a task to a different kanban column',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
                { name: 'column', type: 'string', required: true, description: 'Target column', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'] },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                task.kanbanColumn = p.column;
                if (p.column === 'done') {
                    task.status = TaskStatus.COMPLETED;
                    task.completedAt = Date.now();
                    d.saveTask?.(task);
                    // Trigger dependents
                    const allTasks = d.orchestrator.getTaskQueue();
                    for (const t of allTasks) {
                        if (!t.dependsOn || !t.dependsOn.includes(p.taskId)) { continue; }
                        const allMet = t.dependsOn.every(depId => {
                            const dep = d.orchestrator.getTask(depId);
                            return dep && dep.status === TaskStatus.COMPLETED;
                        });
                        if (allMet && t.autoStart && (t.kanbanColumn === 'todo' || t.kanbanColumn === 'backlog') && t.swimLaneId) {
                            t.kanbanColumn = 'todo';
                            d.saveTask?.(t);
                            await d.startTaskFlow?.(t);
                        }
                    }
                }
                if (p.column === 'in_progress') { task.status = TaskStatus.IN_PROGRESS; task.startedAt = task.startedAt || Date.now(); }
                d.updateKanban?.();
                return ok(`Moved task ${p.taskId} to ${p.column}`);
            }
        });

        this.register({
            name: 'kanban.listTasks', category: cat,
            description: 'List all kanban tasks, optionally filtered by swim lane or column',
            params: [
                { name: 'swimLaneId', type: 'string', required: false, description: 'Filter by swim lane ID' },
                { name: 'column', type: 'string', required: false, description: 'Filter by column', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'] },
            ],
            returnsData: true,
            execute: async (p) => {
                let tasks = d.getKanbanTasks?.() || d.orchestrator.getTaskQueue();
                if (p.swimLaneId) { tasks = tasks.filter(t => t.swimLaneId === p.swimLaneId); }
                if (p.column) { tasks = tasks.filter(t => t.kanbanColumn === p.column); }
                if (tasks.length === 0) { return ok('No tasks found', []); }
                const summary = tasks.map(t => {
                    let line = `[${t.id.slice(0,8)}] "${t.description}" col=${t.kanbanColumn || 'auto'} p=${t.priority} lane=${t.swimLaneId || 'default'}`;
                    const af = [t.autoStart && 'S', t.autoPilot && 'P', t.autoClose && 'C', t.useWorktree && 'W'].filter(Boolean);
                    if (af.length) { line += ` [auto:${af.join('')}]`; }
                    if (t.output) { line += ` summary="${t.output.slice(0, 60)}..."`; }
                    return line;
                });
                return ok(`${tasks.length} task(s):\n${summary.join('\n')}`, tasks.map(t => ({
                    id: t.id, description: t.description, column: t.kanbanColumn, priority: t.priority,
                    status: t.status, swimLaneId: t.swimLaneId, assignedAgentId: t.assignedAgentId,
                    autoStart: t.autoStart || false, autoPilot: t.autoPilot || false, autoClose: t.autoClose || false, useWorktree: t.useWorktree || false, output: t.output || null,
                })));
            }
        });

        this.register({
            name: 'kanban.importFromTmux', category: cat,
            description: 'Import existing tmux sessions as kanban swim lanes with tasks',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok('Opened Kanban board — use the Import from Tmux button to scan and import sessions');
            }
        });

        this.register({
            name: 'kanban.setAutoMode', category: cat,
            description: 'Set auto flags on a kanban task. autoStart: launch automatically, autoPilot: answer questions, autoClose: close tmux when done, useWorktree: run in dedicated git worktree.',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
                { name: 'autoStart', type: 'boolean', required: false, description: 'Auto-start: automatically launch implementation' },
                { name: 'autoPilot', type: 'boolean', required: false, description: 'Auto-pilot: automatically answer questions' },
                { name: 'autoClose', type: 'boolean', required: false, description: 'Auto-close: close tmux and move to done when finished' },
                { name: 'useWorktree', type: 'boolean', required: false, description: 'Use git worktree: run task in a dedicated git worktree' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (p.autoStart !== undefined) { task.autoStart = !!p.autoStart; }
                if (p.autoPilot !== undefined) { task.autoPilot = !!p.autoPilot; }
                if (p.autoClose !== undefined) { task.autoClose = !!p.autoClose; }
                if (p.useWorktree !== undefined) { task.useWorktree = !!p.useWorktree; }
                d.saveTask?.(task);
                // Auto-start if toggled on while in todo with a swim lane
                if (task.autoStart && task.kanbanColumn === 'todo' && task.swimLaneId) {
                    d.startTaskFlow?.(task);
                }
                d.updateKanban?.();
                const flags = [task.autoStart && 'start', task.autoPilot && 'pilot', task.autoClose && 'close', task.useWorktree && 'worktree'].filter(Boolean);
                return ok(`Auto flags for task ${p.taskId}: ${flags.length ? flags.join(', ') : 'none'}`);
            }
        });

        this.register({
            name: 'kanban.startTask', category: cat,
            description: 'Start a kanban task: creates a tmux window in the swim lane and launches AI with the task prompt',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (!task.swimLaneId) { return err('Task has no swim lane assigned. Assign a swim lane first.'); }
                if (task.kanbanColumn === 'in_progress' && task.tmuxSessionName) {
                    return err('Task is already running.');
                }
                try {
                    await d.startTaskFlow?.(task);
                    d.updateKanban?.();
                    return ok(`Started task ${p.taskId} in tmux`);
                } catch (e: any) {
                    return err(`Failed to start task: ${e.message}`);
                }
            }
        });

        this.register({
            name: 'kanban.editTask', category: cat,
            description: 'Edit a kanban task description, details, priority, role, swim lane, or auto flags',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
                { name: 'description', type: 'string', required: false, description: 'New task title/description' },
                { name: 'details', type: 'string', required: false, description: 'New task details' },
                { name: 'priority', type: 'number', required: false, description: 'New priority 1-10' },
                { name: 'role', type: 'string', required: false, description: 'New target role', enum: ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'] },
                { name: 'swimLaneId', type: 'string', required: false, description: 'New swim lane ID' },
                { name: 'autoStart', type: 'boolean', required: false, description: 'Auto-start: automatically launch implementation' },
                { name: 'autoPilot', type: 'boolean', required: false, description: 'Auto-pilot: automatically answer questions' },
                { name: 'autoClose', type: 'boolean', required: false, description: 'Auto-close: close tmux and move to done when finished' },
                { name: 'useWorktree', type: 'boolean', required: false, description: 'Use git worktree: run task in a dedicated git worktree' },
                { name: 'dependsOn', type: 'string', required: false, description: 'Comma-separated task IDs this task depends on (empty string to clear)' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (p.description !== undefined) { task.description = p.description; }
                if (p.details !== undefined) { task.input = p.details; }
                if (p.priority !== undefined) { task.priority = p.priority; }
                if (p.role !== undefined) { task.targetRole = p.role; }
                if (p.swimLaneId !== undefined) { task.swimLaneId = p.swimLaneId || undefined; }
                if (p.autoStart !== undefined) { task.autoStart = !!p.autoStart; }
                if (p.autoPilot !== undefined) { task.autoPilot = !!p.autoPilot; }
                if (p.autoClose !== undefined) { task.autoClose = !!p.autoClose; }
                if (p.useWorktree !== undefined) { task.useWorktree = !!p.useWorktree; }
                if (p.dependsOn !== undefined) {
                    const parsed = String(p.dependsOn).split(',').map((s: string) => s.trim()).filter((s: string) => s);
                    task.dependsOn = parsed.length > 0 ? parsed : undefined;
                }
                d.saveTask?.(task);
                d.updateKanban?.();
                return ok(`Updated task ${p.taskId}`);
            }
        });

        this.register({
            name: 'kanban.deleteTask', category: cat,
            description: 'Delete a kanban task permanently',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                d.deleteTask?.(p.taskId);
                d.updateKanban?.();
                return ok(`Deleted task ${p.taskId}`);
            }
        });

        this.register({
            name: 'kanban.getTaskSummary', category: cat,
            description: 'Get the completion summary/output of a finished task',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (!task.output) { return ok('No completion summary available for this task.', { taskId: p.taskId, output: null }); }
                return ok(`Summary for task ${p.taskId}:\n${task.output}`, { taskId: p.taskId, output: task.output });
            }
        });

        this.register({
            name: 'kanban.getTask', category: cat,
            description: 'Get full details of a single kanban task by ID',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                const lanes = d.getSwimLanes?.() || [];
                const taskLane = task.swimLaneId ? lanes.find(l => l.id === task.swimLaneId) : undefined;
                return ok(`Task ${p.taskId}: "${task.description}"`, {
                    id: task.id, description: task.description, status: task.status,
                    priority: task.priority, column: task.kanbanColumn, swimLaneId: task.swimLaneId,
                    targetRole: task.targetRole, input: task.input || null, output: task.output || null,
                    autoStart: resolveToggle(task, 'autoStart', taskLane),
                    autoPilot: resolveToggle(task, 'autoPilot', taskLane),
                    autoClose: resolveToggle(task, 'autoClose', taskLane),
                    useWorktree: resolveToggle(task, 'useWorktree', taskLane),
                    parentTaskId: task.parentTaskId || null, subtaskIds: task.subtaskIds || [],
                    tmuxSessionName: task.tmuxSessionName || null, tmuxWindowIndex: task.tmuxWindowIndex || null,
                    tmuxServerId: task.tmuxServerId || null,
                });
            }
        });

        this.register({
            name: 'kanban.editSwimLane', category: cat,
            description: 'Edit a kanban swim lane (name, working directory, AI provider, context instructions, or server)',
            params: [
                { name: 'laneId', type: 'string', required: true, description: 'Swim lane ID' },
                { name: 'name', type: 'string', required: false, description: 'New swim lane name' },
                { name: 'workingDirectory', type: 'string', required: false, description: 'New working directory' },
                { name: 'aiProvider', type: 'string', required: false, description: 'AI provider override' },
                { name: 'contextInstructions', type: 'string', required: false, description: 'Context instructions for AI' },
                { name: 'serverId', type: 'string', required: false, description: 'New server ID (migrates session)' },
            ],
            returnsData: false,
            execute: async (p) => {
                const lanes = d.getSwimLanes?.() || [];
                const lane = lanes.find(l => l.id === p.laneId);
                if (!lane) { return err(`Swim lane not found: ${p.laneId}`); }
                if (p.name !== undefined) { lane.name = p.name; }
                if (p.workingDirectory !== undefined) { lane.workingDirectory = p.workingDirectory; }
                if (p.aiProvider !== undefined) { lane.aiProvider = p.aiProvider || undefined; }
                if (p.contextInstructions !== undefined) { lane.contextInstructions = p.contextInstructions || undefined; }
                if (p.serverId && p.serverId !== lane.serverId) {
                    if (lane.sessionActive) {
                        const oldSvc = d.serviceManager.getService(lane.serverId);
                        if (oldSvc) { try { await oldSvc.deleteSession(lane.sessionName); } catch {} }
                    }
                    lane.serverId = p.serverId;
                    lane.sessionActive = false;
                    d.refreshTree();
                }
                d.saveSwimLane?.(lane);
                d.updateKanban?.();
                return ok(`Updated swim lane "${lane.name}" [${p.laneId}]`);
            }
        });

        this.register({
            name: 'kanban.killLaneSession', category: cat,
            description: 'Kill the tmux session for a swim lane',
            params: [
                { name: 'laneId', type: 'string', required: true, description: 'Swim lane ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const lanes = d.getSwimLanes?.() || [];
                const lane = lanes.find(l => l.id === p.laneId);
                if (!lane) { return err(`Swim lane not found: ${p.laneId}`); }
                if (!lane.sessionActive) { return ok('Session is already inactive'); }
                const service = d.serviceManager.getService(lane.serverId);
                if (service) {
                    try { await service.deleteSession(lane.sessionName); } catch {}
                }
                lane.sessionActive = false;
                d.saveSwimLane?.(lane);
                d.refreshTree();
                d.updateKanban?.();
                return ok(`Killed session for swim lane "${lane.name}"`);
            }
        });

        this.register({
            name: 'kanban.stopTask', category: cat,
            description: 'Stop a running task by killing its tmux window and resetting status to pending',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
                    const svc = d.serviceManager.getService(task.tmuxServerId);
                    if (svc) {
                        try { await svc.killWindow(task.tmuxSessionName, task.tmuxWindowIndex); } catch {}
                    }
                    task.tmuxSessionName = undefined;
                    task.tmuxWindowIndex = undefined;
                    task.tmuxPaneIndex = undefined;
                    task.tmuxServerId = undefined;
                }
                task.kanbanColumn = 'todo';
                task.status = TaskStatus.PENDING;
                d.saveTask?.(task);
                d.refreshTree();
                d.updateKanban?.();
                return ok(`Stopped task ${p.taskId} and reset to todo`);
            }
        });

        this.register({
            name: 'kanban.restartTask', category: cat,
            description: 'Restart a task: kills old tmux window and relaunches via startTaskFlow',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (!task.swimLaneId) { return err('Task has no swim lane — cannot restart'); }
                if (task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
                    const oldSvc = d.serviceManager.getService(task.tmuxServerId);
                    if (oldSvc) { try { await oldSvc.killWindow(task.tmuxSessionName, task.tmuxWindowIndex); } catch {} }
                }
                try {
                    await d.startTaskFlow?.(task);
                    d.updateKanban?.();
                    return ok(`Restarted task ${p.taskId}`);
                } catch (e: any) {
                    return err(`Failed to restart task: ${e.message}`);
                }
            }
        });

        this.register({
            name: 'kanban.attachTask', category: cat,
            description: 'Attach to a running task\'s tmux window in the VS Code terminal',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: false,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (!task.tmuxSessionName || !task.tmuxServerId) {
                    return err('Task has no active tmux session to attach to');
                }
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok(`Task ${p.taskId} is running in tmux session "${task.tmuxSessionName}" window ${task.tmuxWindowIndex || '0'} — use the Kanban board to attach`);
            }
        });

        this.register({
            name: 'kanban.summarizeTask', category: cat,
            description: 'Capture the terminal output of a running task for summarization',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task ID' },
            ],
            returnsData: true,
            execute: async (p) => {
                const task = d.orchestrator.getTask(p.taskId);
                if (!task) { return err(`Task not found: ${p.taskId}`); }
                if (!task.tmuxSessionName || !task.tmuxWindowIndex || !task.tmuxPaneIndex || !task.tmuxServerId) {
                    return err('Task has no active tmux session');
                }
                const svc = d.serviceManager.getService(task.tmuxServerId);
                if (!svc) { return err(`Server "${task.tmuxServerId}" not found`); }
                try {
                    const content = await svc.capturePaneContent(task.tmuxSessionName, task.tmuxWindowIndex, task.tmuxPaneIndex, 50);
                    return ok(`Captured terminal output for task ${p.taskId}`, {
                        taskId: p.taskId, description: task.description, terminalContent: content.slice(-3000)
                    });
                } catch (e: any) {
                    return err(`Failed to capture output: ${e.message}`);
                }
            }
        });

        this.register({
            name: 'kanban.mergeTasks', category: cat,
            description: 'Merge multiple tasks into a single task box with subtasks',
            params: [
                { name: 'taskIds', type: 'string', required: true, description: 'Comma-separated task IDs to merge' },
            ],
            returnsData: true,
            execute: async (p) => {
                const ids: string[] = (p.taskIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
                const tasks = ids.map(id => d.orchestrator.getTask(id)).filter((t): t is OrchestratorTask => !!t);
                if (tasks.length < 2) { return err('Need at least 2 valid tasks to merge'); }

                const descriptions = tasks.map(t => t.description).join(' + ');
                const maxPri = Math.max(...tasks.map(t => t.priority));
                const parentTask: OrchestratorTask = {
                    id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    description: descriptions.length > 80 ? descriptions.slice(0, 77) + '...' : descriptions,
                    targetRole: tasks[0].targetRole,
                    status: TaskStatus.PENDING,
                    priority: maxPri,
                    kanbanColumn: tasks[0].kanbanColumn || 'todo',
                    swimLaneId: tasks[0].swimLaneId,
                    subtaskIds: tasks.map(t => t.id),
                    createdAt: Date.now()
                };

                for (const t of tasks) {
                    t.parentTaskId = parentTask.id;
                    d.saveTask?.(t);
                }
                d.orchestrator.submitTask(parentTask);
                d.saveTask?.(parentTask);
                d.updateKanban?.();
                return ok(`Merged ${tasks.length} tasks into task box [${parentTask.id}]`, { parentTaskId: parentTask.id });
            }
        });

        this.register({
            name: 'kanban.splitTaskBox', category: cat,
            description: 'Split a task box into individual independent tasks',
            params: [
                { name: 'taskId', type: 'string', required: true, description: 'Task box ID to split' },
            ],
            returnsData: false,
            execute: async (p) => {
                const parentTask = d.orchestrator.getTask(p.taskId);
                if (!parentTask) { return err(`Task not found: ${p.taskId}`); }
                if (!parentTask.subtaskIds || parentTask.subtaskIds.length === 0) {
                    return err('Task has no subtasks to split');
                }

                const col = parentTask.kanbanColumn || 'todo';
                const laneId = parentTask.swimLaneId;
                let created = 0;
                for (const subId of parentTask.subtaskIds) {
                    const sub = d.orchestrator.getTask(subId);
                    if (!sub) { continue; }
                    const newTask: OrchestratorTask = {
                        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        description: sub.description,
                        status: TaskStatus.PENDING,
                        priority: sub.priority,
                        createdAt: Date.now(),
                        targetRole: sub.targetRole,
                        input: sub.input,
                        kanbanColumn: col === 'in_progress' ? 'todo' : col,
                        swimLaneId: laneId,
                    };
                    d.orchestrator.submitTask(newTask);
                    d.saveTask?.(newTask);
                    d.orchestrator.cancelTask(subId);
                    d.deleteTask?.(subId);
                    created++;
                }

                d.orchestrator.cancelTask(parentTask.id);
                d.deleteTask?.(parentTask.id);
                d.updateKanban?.();
                return ok(`Split task box into ${created} individual tasks`);
            }
        });

        this.register({
            name: 'kanban.addSubtask', category: cat,
            description: 'Add a task as a subtask of another task (creating a task box)',
            params: [
                { name: 'parentTaskId', type: 'string', required: true, description: 'Parent task ID' },
                { name: 'childTaskId', type: 'string', required: true, description: 'Child task ID to add as subtask' },
            ],
            returnsData: false,
            execute: async (p) => {
                const parentTask = d.orchestrator.getTask(p.parentTaskId);
                const childTask = d.orchestrator.getTask(p.childTaskId);
                if (!parentTask) { return err(`Parent task not found: ${p.parentTaskId}`); }
                if (!childTask) { return err(`Child task not found: ${p.childTaskId}`); }
                if (!parentTask.subtaskIds) { parentTask.subtaskIds = []; }

                if (childTask.subtaskIds && childTask.subtaskIds.length > 0) {
                    for (const subId of childTask.subtaskIds) {
                        const sub = d.orchestrator.getTask(subId);
                        if (sub) {
                            sub.parentTaskId = parentTask.id;
                            if (!parentTask.subtaskIds.includes(subId)) {
                                parentTask.subtaskIds.push(subId);
                            }
                            d.saveTask?.(sub);
                        }
                    }
                    d.orchestrator.cancelTask(childTask.id);
                } else {
                    childTask.parentTaskId = parentTask.id;
                    if (!parentTask.subtaskIds.includes(childTask.id)) {
                        parentTask.subtaskIds.push(childTask.id);
                    }
                }

                let maxPri = parentTask.priority;
                for (const sid of parentTask.subtaskIds) {
                    const s = d.orchestrator.getTask(sid);
                    if (s && s.priority > maxPri) { maxPri = s.priority; }
                }
                parentTask.priority = maxPri;

                d.saveTask?.(parentTask);
                d.saveTask?.(childTask);
                d.updateKanban?.();
                return ok(`Added subtask — task box now has ${parentTask.subtaskIds.length} subtask(s)`);
            }
        });

        this.register({
            name: 'dashboard.getState', category: cat,
            description: 'Get current agent dashboard state: agents, tasks, teams',
            params: [],
            returnsData: true,
            execute: async () => {
                const agents = d.orchestrator.getAllAgents();
                const tasks = d.orchestrator.getTaskQueue();
                const teams = d.teamManager.getAllTeams();
                return ok(`Dashboard: ${agents.length} agents, ${tasks.length} tasks, ${teams.length} teams`, {
                    agents: agents.map(a => ({ id: a.id, name: a.name, role: a.role, state: a.state, serverId: a.serverId, teamId: a.teamId })),
                    tasks: tasks.map(t => ({ id: t.id, description: t.description, status: t.status, priority: t.priority, kanbanColumn: t.kanbanColumn, assignedAgentId: t.assignedAgentId })),
                    teams: teams.map(t => ({ id: t.id, name: t.name, agentCount: t.agents.length })),
                });
            }
        });
    }

    // ── Quick Actions ───────────────────────────────────────────────────────

    private registerQuickActions(): void {
        const cat = 'Quick Actions';

        this.register({
            name: 'team.quickCoding', category: cat,
            description: 'Spawn a pre-configured coding team (coder + reviewer + tester)',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.quickTeamCoding');
                return ok('Started coding team');
            }
        });

        this.register({
            name: 'team.quickResearch', category: cat,
            description: 'Spawn a pre-configured research team (2 researchers + 1 coder)',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.quickTeamResearch');
                return ok('Started research team');
            }
        });
    }
}
