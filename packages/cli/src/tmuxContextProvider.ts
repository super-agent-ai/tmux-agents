import { TmuxServiceManager } from './serviceManager';
import { TmuxService } from './core/tmuxService';
import { AgentOrchestrator } from './core/orchestrator';
import { TeamManager } from './teamManager';
import { PipelineEngine } from './core/pipelineEngine';
import { AgentTemplateManager } from './agentTemplate';
import {
    TmuxSession, TmuxWindow, TmuxPane,
    AgentInstance, AgentTeam, Pipeline, PipelineRun,
    AgentTemplate, OrchestratorTask
} from './core/types';

// ─── Rich Context Types ──────────────────────────────────────────────────────

export interface TmuxContextServer {
    id: string;
    label: string;
    isLocal: boolean;
    sshHost?: string;
    sessions: TmuxContextSession[];
}

export interface TmuxContextSession {
    name: string;
    isAttached: boolean;
    windows: TmuxContextWindow[];
}

export interface TmuxContextWindow {
    index: string;
    name: string;
    isActive: boolean;
    panes: TmuxContextPane[];
}

export interface TmuxContextPane {
    index: string;
    command: string;
    currentPath: string;
    isActive: boolean;
    aiInfo?: { provider: string; status: string };
    processCategory?: string;
}

export interface TmuxContext {
    servers: TmuxContextServer[];
}

// ─── Full Extension Context ──────────────────────────────────────────────────

export interface FullExtensionContext {
    servers: TmuxContextServer[];
    agents: AgentInstance[];
    teams: AgentTeam[];
    pipelines: Pipeline[];
    activeRuns: PipelineRun[];
    templates: AgentTemplate[];
    taskQueue: OrchestratorTask[];
}

export interface ContextGatheringDeps {
    orchestrator: AgentOrchestrator;
    teamManager: TeamManager;
    pipelineEngine: PipelineEngine;
    templateManager: AgentTemplateManager;
}

// ─── Context Provider ────────────────────────────────────────────────────────

export async function gatherFullContext(serviceManager: TmuxServiceManager): Promise<TmuxContext> {
    const servers: TmuxContextServer[] = [];

    for (const service of serviceManager.getAllServices()) {
        const server = await gatherServerContext(service);
        servers.push(server);
    }

    return { servers };
}

export async function gatherFullExtensionContext(
    serviceManager: TmuxServiceManager,
    deps: ContextGatheringDeps
): Promise<FullExtensionContext> {
    const tmuxContext = await gatherFullContext(serviceManager);

    return {
        servers: tmuxContext.servers,
        agents: deps.orchestrator.getAllAgents(),
        teams: deps.teamManager.getAllTeams(),
        pipelines: deps.pipelineEngine.getAllPipelines(),
        activeRuns: deps.pipelineEngine.getActiveRuns(),
        templates: deps.templateManager.getAllTemplates(),
        taskQueue: deps.orchestrator.getTaskQueue(),
    };
}

async function gatherServerContext(service: TmuxService): Promise<TmuxContextServer> {
    const identity = service.serverIdentity;
    const sshHost = identity.sshConfig
        ? (identity.sshConfig.user
            ? `${identity.sshConfig.user}@${identity.sshConfig.host}`
            : identity.sshConfig.host)
        : undefined;

    let sessions: TmuxContextSession[] = [];
    try {
        const tree = await service.getTmuxTree();
        sessions = tree.map(mapSession);
    } catch {
        // Connection error — return empty sessions
    }

    return {
        id: identity.id,
        label: identity.label,
        isLocal: identity.isLocal,
        sshHost,
        sessions,
    };
}

function mapSession(session: TmuxSession): TmuxContextSession {
    return {
        name: session.name,
        isAttached: session.isAttached,
        windows: session.windows.map(mapWindow),
    };
}

function mapWindow(window: TmuxWindow): TmuxContextWindow {
    return {
        index: window.index,
        name: window.name,
        isActive: window.isActive,
        panes: window.panes.map(mapPane),
    };
}

function mapPane(pane: TmuxPane): TmuxContextPane {
    const result: TmuxContextPane = {
        index: pane.index,
        command: pane.command,
        currentPath: pane.currentPath,
        isActive: pane.isActive,
    };
    if (pane.aiInfo) {
        result.aiInfo = {
            provider: pane.aiInfo.provider,
            status: pane.aiInfo.status,
        };
    }
    if (pane.processCategory) {
        result.processCategory = pane.processCategory;
    }
    return result;
}

// ─── Format for Prompt ───────────────────────────────────────────────────────

export function formatFullContextForPrompt(context: FullExtensionContext): string {
    const parts: string[] = [];

    // ── Tmux Servers ─────────────────────────────────────────────────────
    parts.push('### Tmux Servers\n');
    if (context.servers.length === 0) {
        parts.push('No tmux servers configured.\n');
    } else {
        for (const server of context.servers) {
            const serverType = server.isLocal
                ? 'Local'
                : `Remote (SSH: ${server.sshHost || 'unknown'})`;
            parts.push(`Server: "${server.label}" [id: ${server.id}] — ${serverType}`);

            if (server.sessions.length === 0) {
                parts.push('  (no sessions)');
                continue;
            }

            for (const session of server.sessions) {
                const attached = session.isAttached ? 'attached' : 'detached';
                parts.push(`  Session "${session.name}" (${attached})`);

                for (const window of session.windows) {
                    const active = window.isActive ? ', active' : '';
                    parts.push(`    Window ${window.index}: "${window.name}"${active}`);

                    for (const pane of window.panes) {
                        const paneActive = pane.isActive ? ' *' : '';
                        let extra = '';
                        if (pane.aiInfo) {
                            extra = ` [AI: ${pane.aiInfo.provider} — ${pane.aiInfo.status}]`;
                        } else if (pane.processCategory) {
                            extra = ` [${pane.processCategory}]`;
                        }
                        parts.push(`      Pane ${pane.index}: ${pane.command} @ ${pane.currentPath}${paneActive}${extra}`);
                    }
                }
            }
        }
    }

    // ── Agents ───────────────────────────────────────────────────────────
    if (context.agents.length > 0) {
        parts.push(`\n### Agents (${context.agents.length})\n`);
        for (const a of context.agents) {
            const task = a.currentTaskId ? ` task=${a.currentTaskId}` : '';
            const team = a.teamId ? ` team=${a.teamId}` : '';
            parts.push(`- "${a.name}" [id: ${a.id}] role=${a.role} provider=${a.aiProvider} state=${a.state} server=${a.serverId}${task}${team}`);
        }
    }

    // ── Teams ────────────────────────────────────────────────────────────
    if (context.teams.length > 0) {
        parts.push(`\n### Teams (${context.teams.length})\n`);
        for (const t of context.teams) {
            parts.push(`- "${t.name}" [id: ${t.id}] agents: [${t.agents.join(', ') || 'none'}]`);
        }
    }

    // ── Pipelines ────────────────────────────────────────────────────────
    if (context.pipelines.length > 0) {
        parts.push(`\n### Pipelines (${context.pipelines.length})\n`);
        for (const p of context.pipelines) {
            parts.push(`Pipeline "${p.name}" [id: ${p.id}] — ${p.stages.length} stage(s)`);
            for (const stage of p.stages) {
                const deps = stage.dependsOn.length > 0 ? ` depends on: ${stage.dependsOn.join(', ')}` : '';
                parts.push(`  Stage "${stage.name}" [id: ${stage.id}] type=${stage.type} role=${stage.agentRole}${deps}`);
            }

            // Show active runs for this pipeline
            const runs = context.activeRuns.filter(r => r.pipelineId === p.id);
            for (const run of runs) {
                parts.push(`  Active Run [id: ${run.id}] status=${run.status}`);
                for (const [stageId, result] of Object.entries(run.stageResults)) {
                    const stageName = p.stages.find(s => s.id === stageId)?.name || stageId;
                    const r = result as any;
                    parts.push(`    "${stageName}": ${r.status}${r.agentId ? ` (agent: ${r.agentId})` : ''}`);
                }
            }
        }
    }

    // ── Templates ────────────────────────────────────────────────────────
    if (context.templates.length > 0) {
        parts.push(`\n### Templates (${context.templates.length})\n`);
        for (const t of context.templates) {
            parts.push(`- "${t.name}" [id: ${t.id}] role=${t.role} provider=${t.aiProvider}`);
        }
    }

    // ── Task Queue ───────────────────────────────────────────────────────
    if (context.taskQueue.length > 0) {
        parts.push(`\n### Task Queue (${context.taskQueue.length})\n`);
        for (const t of context.taskQueue) {
            const agent = t.assignedAgentId ? ` agent=${t.assignedAgentId}` : '';
            parts.push(`- [${t.id}] "${t.description}" status=${t.status} priority=${t.priority} role=${t.targetRole || 'any'}${agent}`);
        }
    }

    return parts.join('\n');
}

// Keep the old formatter for backward compatibility
export function formatContextForPrompt(context: TmuxContext): string {
    if (context.servers.length === 0) {
        return 'No tmux servers configured.';
    }

    const parts: string[] = [];

    for (const server of context.servers) {
        const serverType = server.isLocal
            ? 'Local'
            : `Remote (SSH: ${server.sshHost || 'unknown'})`;
        parts.push(`Server: "${server.label}" [id: ${server.id}] — ${serverType}`);

        if (server.sessions.length === 0) {
            parts.push('  (no sessions)');
            continue;
        }

        for (const session of server.sessions) {
            const attached = session.isAttached ? 'attached' : 'detached';
            parts.push(`  Session "${session.name}" (${attached})`);

            for (const window of session.windows) {
                const active = window.isActive ? ', active' : '';
                parts.push(`    Window ${window.index}: "${window.name}"${active}`);

                for (const pane of window.panes) {
                    const paneActive = pane.isActive ? ' *' : '';
                    let extra = '';
                    if (pane.aiInfo) {
                        extra = ` [AI: ${pane.aiInfo.provider} — ${pane.aiInfo.status}]`;
                    } else if (pane.processCategory) {
                        extra = ` [${pane.processCategory}]`;
                    }
                    parts.push(`      Pane ${pane.index}: ${pane.command} @ ${pane.currentPath}${paneActive}${extra}`);
                }
            }
        }
    }

    return parts.join('\n');
}
