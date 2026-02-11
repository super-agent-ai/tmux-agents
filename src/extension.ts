import * as vscode from 'vscode';
import { TmuxSessionProvider, TmuxSessionTreeItem, TmuxWindowTreeItem, TmuxPaneTreeItem, ShortcutsProvider } from './treeProvider';
import { ChatViewProvider } from './chatView';
import { ApiCatalog } from './apiCatalog';
import { TmuxService } from './tmuxService';
import { TmuxServiceManager } from './serviceManager';
import { SmartAttachmentService } from './smartAttachment';
import { AIAssistantManager } from './aiAssistant';
import { HotkeyManager } from './hotkeyManager';
import { AgentOrchestrator } from './orchestrator';
import { TaskRouter } from './taskRouter';
import { PipelineEngine } from './pipelineEngine';
import { AgentTemplateManager } from './agentTemplate';
import { TeamManager } from './teamManager';
import { DashboardViewProvider } from './dashboardView';
import { GraphViewProvider } from './graphView';
import { KanbanViewProvider } from './kanbanView';
import { Database } from './database';
import { AIProvider, AgentRole, TaskStatus, OrchestratorTask, KanbanSwimLane, FavouriteFolder, StageType } from './types';
import { handleKanbanMessage, triggerDependents } from './commands/kanbanHandlers';
import { registerSessionCommands } from './commands/sessionCommands';
import { registerAgentCommands } from './commands/agentCommands';
import { checkAutoCompletions, checkAutoPilot } from './autoMonitor';
import { buildSingleTaskPrompt, buildTaskBoxPrompt, appendPromptTail, buildPersonaContext } from './promptBuilder';
import { OrganizationManager } from './organizationManager';
import { GuildManager } from './guildManager';

function getServiceForItem(
    serviceManager: TmuxServiceManager,
    item: TmuxSessionTreeItem | TmuxWindowTreeItem | TmuxPaneTreeItem
): TmuxService | undefined {
    let serverId: string;
    if (item instanceof TmuxSessionTreeItem) {
        serverId = item.session.serverId;
    } else if (item instanceof TmuxWindowTreeItem) {
        serverId = item.window.serverId;
    } else if (item instanceof TmuxPaneTreeItem) {
        serverId = item.pane.serverId;
    } else {
        return undefined;
    }
    return serviceManager.getService(serverId);
}

async function pickService(serviceManager: TmuxServiceManager): Promise<TmuxService | undefined> {
    const services = serviceManager.getAllServices();
    if (services.length === 0) { return undefined; }
    if (services.length === 1) { return services[0]; }
    const choice = await vscode.window.showQuickPick(
        services.map(s => ({ label: s.serverLabel, description: s.serverId, service: s })),
        { placeHolder: 'Select server' }
    );
    return choice?.service;
}

function buildTaskWindowName(task: OrchestratorTask): string {
    const words = (task.description || '').trim().split(/\s+/).slice(0, 2).join('-')
        .toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 20);
    const shortId = task.id.slice(0, 15);
    const uuid = Math.random().toString(36).slice(2, 8);
    const name = `${words}-${shortId}-${uuid}-task`;
    return name.slice(0, 60);
}

// ── Global Output Channel ────────────────────────────────────────────────────
const outputChannel = vscode.window.createOutputChannel('Tmux Agents');

function log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    outputChannel.appendLine(`[${ts}] ${msg}`);
}

// Redirect console.log/warn/error to the output channel
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
console.log = (...args: any[]) => { log(args.map(String).join(' ')); _origLog(...args); };
console.warn = (...args: any[]) => { log('[WARN] ' + args.map(String).join(' ')); _origWarn(...args); };
console.error = (...args: any[]) => { log('[ERROR] ' + args.map(String).join(' ')); _origError(...args); };

export function activate(context: vscode.ExtensionContext) {
    // Prevent VS Code's SIGPIPE handler from crashing the extension host
    // when a child process exits before we finish writing to its stdin.
    process.removeAllListeners('SIGPIPE');
    process.on('SIGPIPE', () => { /* intentionally ignored */ });

    log('Tmux Agents activating...');
    const serviceManager = new TmuxServiceManager();
    const tmuxSessionProvider = new TmuxSessionProvider(serviceManager, context.extensionPath);
    const smartAttachment = new SmartAttachmentService();
    const aiManager = new AIAssistantManager();
    const hotkeyManager = new HotkeyManager();

    vscode.window.registerTreeDataProvider('tmux-agents', tmuxSessionProvider);

    const shortcutsProvider = new ShortcutsProvider();
    vscode.window.registerTreeDataProvider('tmux-agents-shortcuts', shortcutsProvider);

    // ── Orchestration System ─────────────────────────────────────────────────

    const orchestrator = new AgentOrchestrator();
    orchestrator.setServiceManager(serviceManager);

    const taskRouter = new TaskRouter();
    const pipelineEngine = new PipelineEngine();
    const templateManager = new AgentTemplateManager();
    const teamManager = new TeamManager();
    const organizationManager = new OrganizationManager();
    const guildManager = new GuildManager();

    // ── Database ──────────────────────────────────────────────────────────────
    const dbDir = context.globalStorageUri.fsPath;
    const dbPath = require('path').join(dbDir, 'tmux-agents.db');
    const database = new Database(dbPath);

    // ── API Catalog & Chat View ──────────────────────────────────────────────

    const apiCatalog = new ApiCatalog({
        serviceManager, orchestrator, teamManager,
        pipelineEngine, templateManager, taskRouter, aiManager,
        refreshTree: () => tmuxSessionProvider.refresh(),
        getSwimLanes: () => swimLanes,
        addSwimLane: (lane) => { swimLanes.push(lane); database.saveSwimLane(lane); },
        deleteSwimLane: (id) => {
            const idx = swimLanes.findIndex(l => l.id === id);
            if (idx !== -1) { swimLanes.splice(idx, 1); database.deleteSwimLane(id); }
        },
        saveSwimLane: (lane) => database.saveSwimLane(lane),
        updateKanban: () => updateKanban(),
        getKanbanTasks: () => orchestrator.getTaskQueue(),
        saveTask: (task) => database.saveTask(task),
        deleteTask: (taskId) => { orchestrator.cancelTask(taskId); database.deleteTask(taskId); },
        startTaskFlow: (task) => startTaskFlow(task),
    });

    const chatViewProvider = new ChatViewProvider(
        serviceManager, context.extensionUri, apiCatalog,
        { orchestrator, teamManager, pipelineEngine, templateManager },
        aiManager
    );
    chatViewProvider.setRefreshCallback(() => tmuxSessionProvider.refresh());
    vscode.window.registerWebviewViewProvider('tmux-agents-chat', chatViewProvider);
    const dashboardView = new DashboardViewProvider(context.extensionUri);
    const graphView = new GraphViewProvider(context.extensionUri);
    const kanbanView = new KanbanViewProvider(context.extensionUri);
    const swimLanes: KanbanSwimLane[] = [];
    const favouriteFolders: FavouriteFolder[] = [];

    // Load saved templates and built-in pipelines
    templateManager.loadFromSettings();
    for (const pipeline of pipelineEngine.getBuiltInPipelines()) {
        pipelineEngine.savePipeline(pipeline);
    }

    // Initialize database and load persisted data
    (async () => {
        try {
            await vscode.workspace.fs.createDirectory(context.globalStorageUri);
            await database.initialize();

            for (const lane of database.getAllSwimLanes()) {
                swimLanes.push(lane);
            }

            for (const fav of database.getAllFavouriteFolders()) {
                favouriteFolders.push(fav);
            }

            for (const task of database.getAllTasks()) {
                orchestrator.submitTask(task);
            }

            for (const pipeline of database.getAllPipelines()) {
                if (!pipelineEngine.getPipeline(pipeline.id)) {
                    pipelineEngine.savePipeline(pipeline);
                }
            }

            // Load org units and guilds
            organizationManager.loadOrgUnits(database.getAllOrgUnits());
            guildManager.loadGuilds(database.getAllGuilds());

            // Load conversations into chat view
            chatViewProvider.loadConversations(database.getAllConversations());

            updateKanban();
            updateDashboard();
            console.log('tmux-agents: Database loaded successfully');
        } catch (error) {
            console.warn('tmux-agents: Failed to load database:', error);
        }
    })();

    // Start orchestrator polling (5s interval)
    const orchestratorConfig = vscode.workspace.getConfiguration('tmuxAgents');
    const orchCfg = orchestratorConfig.get<any>('orchestrator') || {};
    const pollingInterval = orchCfg.pollingInterval ?? 5000;
    if (orchCfg.enabled ?? true) {
        orchestrator.startPolling(serviceManager, pollingInterval);
    }

    // Wire up orchestrator events to dashboard
    const agentStateChangedDisposable = orchestrator.onAgentStateChanged(agent => {
        database.saveAgent(agent);
        updateDashboard();
    });
    const taskCompletedDisposable = orchestrator.onTaskCompleted(async task => {
        if (task.assignedAgentId) {
            const output = await orchestrator.captureAgentOutput(task.assignedAgentId, 50);
            if (output) { task.output = output; }
            database.saveTask(task);
        }
        if (task.parentTaskId) {
            const parent = orchestrator.getTask(task.parentTaskId);
            if (parent && parent.subtaskIds) {
                const allDone = parent.subtaskIds.every(sid => {
                    const sub = orchestrator.getTask(sid);
                    return sub && sub.status === TaskStatus.COMPLETED;
                });
                if (allDone) {
                    const lane = parent.swimLaneId ? swimLanes.find(l => l.id === parent.swimLaneId) : undefined;
                    if (lane && lane.sessionActive) {
                        const service = serviceManager.getService(lane.serverId);
                        if (service) {
                            try {
                                const verifyWindowName = `verify-${parent.id.slice(0, 20)}`;
                                await service.newWindow(lane.sessionName, verifyWindowName);

                                const sessions = await service.getTmuxTreeFresh();
                                const session = sessions.find(s => s.name === lane.sessionName);
                                const win = session?.windows.find(w => w.name === verifyWindowName);
                                const winIndex = win?.index || '0';
                                const paneIndex = win?.panes[0]?.index || '0';

                                if (lane.workingDirectory) {
                                    await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                                }

                                let verifyPrompt = `You are a verification reviewer. Check whether the following subtasks completed successfully.\n\nParent task: ${parent.description}\n`;
                                for (const sid of parent.subtaskIds) {
                                    const sub = orchestrator.getTask(sid);
                                    if (sub) {
                                        verifyPrompt += `\n--- Subtask ${sub.id.slice(0, 8)}: ${sub.description} ---\n`;
                                        verifyPrompt += sub.output ? sub.output.slice(-500) : '(no output captured)';
                                        verifyPrompt += '\n';
                                    }
                                }
                                verifyPrompt += `\nReview all subtask outputs. Check for:
1. **Correctness**: Does each subtask's output indicate it completed successfully? Are there errors, test failures, or stack traces?
2. **Completeness**: Did each subtask produce meaningful output, or did any appear to stop prematurely or produce no output?
3. **Integration**: Do the subtasks produce changes that conflict with each other (e.g., modifying the same file in incompatible ways)?

Keep your review concise — this is a sanity check on outputs, not a full code re-review.

End with a verdict on a new line, exactly in this format:
VERDICT: PASS
or
VERDICT: FAIL — [brief reason]

If any subtask output shows errors, test failures, or incomplete work, the verdict should be FAIL.`;

                                const verifyProvider = aiManager.resolveProvider(undefined, lane.aiProvider);
                                const launchCmd = aiManager.getLaunchCommand(verifyProvider);
                                await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);

                                const capturedPrompt = verifyPrompt;
                                const capturedSession = lane.sessionName;
                                const capturedWin = winIndex;
                                const capturedPane = paneIndex;
                                setTimeout(async () => {
                                    try {
                                        await service.sendKeys(capturedSession, capturedWin, capturedPane, '');
                                        await service.sendKeys(capturedSession, capturedWin, capturedPane, capturedPrompt);
                                        await service.sendKeys(capturedSession, capturedWin, capturedPane, '');
                                    } catch (err) {
                                        console.warn('Failed to send verification prompt:', err);
                                    }
                                }, 3000);

                                parent.verificationStatus = 'pending';
                                parent.kanbanColumn = 'in_review';
                                database.saveTask(parent);
                            } catch (error) {
                                console.warn('Failed to launch verification:', error);
                                parent.verificationStatus = 'passed';
                                parent.kanbanColumn = 'done';
                                parent.status = TaskStatus.COMPLETED;
                                parent.completedAt = Date.now();
                                database.saveTask(parent);
                            }
                        }
                    } else {
                        parent.verificationStatus = 'passed';
                        parent.kanbanColumn = 'done';
                        parent.status = TaskStatus.COMPLETED;
                        parent.completedAt = Date.now();
                        database.saveTask(parent);
                    }
                    updateKanban();
                }
            }
        }
        // Trigger dependents for the completed task
        await triggerDependentsInline(task.id);
        if (task.pipelineStageId) {
            for (const run of pipelineEngine.getActiveRuns()) {
                const pipeline = pipelineEngine.getPipeline(run.pipelineId);
                if (!pipeline) { continue; }
                const stage = pipeline.stages.find(s => s.id === task.pipelineStageId);
                if (stage) {
                    pipelineEngine.markStageCompleted(run.id, stage.id, task.output);
                    await advancePipeline(run.id);
                }
            }
        }
        updateDashboard();
        updateKanban();
    });

    // Wire up org/guild/message persistence
    const orgChangedDisposable = organizationManager.onOrgChanged(unit => {
        database.saveOrgUnit(unit);
        updateDashboard();
    });
    const guildChangedDisposable = guildManager.onGuildChanged(guild => {
        database.saveGuild(guild);
        updateDashboard();
    });
    const agentMessageDisposable = orchestrator.onAgentMessage(msg => {
        database.saveAgentMessage(msg);
        updateDashboard();
    });

    // Wire up conversation persistence from chat view
    chatViewProvider.onConversationChanged((conv) => {
        database.saveConversation(conv);
    });
    chatViewProvider.onConversationMessageAdded(({ conversationId, entry }) => {
        database.saveConversationMessage(conversationId, entry);
    });
    chatViewProvider.onConversationDeleted((convId) => {
        database.deleteConversation(convId);
    });

    // Wire up dashboard actions
    const dashboardActionDisposable = dashboardView.onAction(async ({ action, payload }) => {
        switch (action) {
            case 'sendPrompt':
                orchestrator.sendPromptToAgent(payload.agentId, payload.prompt).catch(console.error);
                break;
            case 'killAgent':
                orchestrator.removeAgent(payload.agentId);
                updateDashboard();
                break;
            case 'attachToTask': {
                const task = orchestrator.getTask(payload.taskId);
                if (!task?.tmuxSessionName || !task.tmuxServerId) {
                    vscode.window.showWarningMessage('No tmux session info for this task');
                    break;
                }
                const svc = serviceManager.getService(task.tmuxServerId);
                if (!svc) {
                    vscode.window.showWarningMessage(`Server not found: ${task.tmuxServerId}`);
                    break;
                }
                const terminal = await smartAttachment.attachToSession(svc, task.tmuxSessionName, {
                    windowIndex: task.tmuxWindowIndex,
                    paneIndex: task.tmuxPaneIndex
                });
                terminal.show();
                break;
            }
            case 'pausePipeline':
                pipelineEngine.pauseRun(payload.runId);
                updateDashboard();
                break;
            case 'resumePipeline':
                pipelineEngine.resumeRun(payload.runId);
                advancePipeline(payload.runId);
                updateDashboard();
                break;
            case 'submitTask':
                taskRouter.parseTaskFromNaturalLanguage(payload.description).then(task => {
                    orchestrator.submitTask(task);
                    database.saveTask(task);
                    updateDashboard();
                }).catch(console.error);
                break;
            case 'viewFanOutResults': {
                const results = orchestrator.getFanOutResults(payload.stageId);
                const outputText = results.map((t, i) => `--- Agent ${i+1} (${t.assignedAgentId || 'unknown'}) ---\n${t.output || '(no output)'}`).join('\n\n');
                const doc = await vscode.workspace.openTextDocument({ content: outputText, language: 'markdown' });
                vscode.window.showTextDocument(doc);
                break;
            }
            case 'openChat':
                vscode.commands.executeCommand('tmux-agents-chat.focus');
                break;
            case 'sendAgentMessage': {
                const msg = orchestrator.sendMessage(payload.fromAgentId, payload.toAgentId, payload.content);
                database.saveAgentMessage(msg);
                updateDashboard();
                break;
            }
            case 'deployTeamTemplate': {
                const template = templateManager.getBuiltInTeamTemplates().find(t => t.id === payload.templateId);
                if (!template) { break; }
                const teamName = template.name + '-' + Date.now().toString(36).slice(-4);
                const team = teamManager.createTeam(teamName, template.description);
                database.saveTeam(team);
                vscode.window.showInformationMessage(`Team "${teamName}" created with ${template.slots.length} slots. Use "Spawn Agent" to fill slots.`);
                updateDashboard();
                break;
            }
            case 'refresh':
                updateDashboard();
                break;
        }
    });

    // Wire up graph actions
    const graphActionDisposable = graphView.onAction(({ action, payload }) => {
        switch (action) {
            case 'runPipeline':
                const run = pipelineEngine.startRun(payload.pipelineId);
                advancePipeline(run.id);
                graphView.updateRun(run);
                updateDashboard();
                break;
            case 'savePipeline':
                pipelineEngine.savePipeline(payload.pipeline);
                break;
            case 'addStage':
                const pipeline = pipelineEngine.getPipeline(payload.pipelineId);
                if (pipeline) {
                    pipelineEngine.addStage(payload.pipelineId, {
                        name: 'New Stage',
                        type: StageType.SEQUENTIAL,
                        agentRole: AgentRole.CODER,
                        taskDescription: 'Describe the task...',
                        dependsOn: []
                    });
                    graphView.setPipeline(pipelineEngine.getPipeline(payload.pipelineId)!);
                }
                break;
            case 'removeStage':
                pipelineEngine.removeStage(payload.pipelineId, payload.stageId);
                const updatedPipeline = pipelineEngine.getPipeline(payload.pipelineId);
                if (updatedPipeline) { graphView.setPipeline(updatedPipeline); }
                break;
        }
    });

    // ── startTaskFlow: reusable function to launch a task in tmux ──────────
    async function startTaskFlow(
        t: OrchestratorTask,
        options?: { additionalInstructions?: string; askForContext?: boolean }
    ): Promise<void> {
        const lane = t.swimLaneId ? swimLanes.find(l => l.id === t.swimLaneId) : undefined;
        if (lane) {
            const ready = await ensureLaneSession(lane);
            if (!ready) return;

            const service = serviceManager.getService(lane.serverId);
            if (!service) return;

            try {
                const windowName = buildTaskWindowName(t);
                await service.newWindow(lane.sessionName, windowName);
                await cleanupInitWindow(service, lane.sessionName);

                const sessions = await service.getTmuxTreeFresh();
                const session = sessions.find(s => s.name === lane.sessionName);
                const win = session?.windows.find(w => w.name === windowName);
                const winIndex = win?.index || '0';
                const paneIndex = win?.panes[0]?.index || '0';

                if (lane.workingDirectory) {
                    await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                }

                let prompt = '';
                if (t.subtaskIds && t.subtaskIds.length > 0) {
                    const subtasks = t.subtaskIds.map(id => orchestrator.getTask(id)).filter((s): s is OrchestratorTask => !!s);
                    prompt = buildTaskBoxPrompt(t, subtasks, lane);
                    for (const sub of subtasks) {
                        sub.kanbanColumn = 'in_progress';
                        sub.status = TaskStatus.IN_PROGRESS;
                        sub.startedAt = Date.now();
                        sub.tmuxSessionName = lane.sessionName;
                        sub.tmuxWindowIndex = winIndex;
                        sub.tmuxPaneIndex = paneIndex;
                        sub.tmuxServerId = lane.serverId;
                        database.saveTask(sub);
                    }
                } else {
                    prompt = buildSingleTaskPrompt(t, lane);
                }

                // Build persona/guild context if the task is assigned to an agent
                let personaContext: string | undefined;
                let guildContext: string | undefined;
                if (t.assignedAgentId) {
                    const agent = orchestrator.getAgent(t.assignedAgentId);
                    if (agent?.persona) {
                        personaContext = buildPersonaContext(agent.persona);
                    }
                    if (agent) {
                        guildContext = guildManager.getGuildContextForAgent(agent.id) || undefined;
                    }
                }

                prompt = appendPromptTail(prompt, {
                    additionalInstructions: options?.additionalInstructions,
                    askForContext: options?.askForContext,
                    autoClose: t.autoClose,
                    signalId: t.autoClose ? t.id.slice(-8) : undefined,
                    personaContext,
                    guildContext,
                });

                const resolvedProvider = aiManager.resolveProvider(t.aiProvider, lane?.aiProvider);
                const resolvedModel = aiManager.resolveModel(t.aiModel, lane?.aiModel);
                const launchCmd = aiManager.getInteractiveLaunchCommand(resolvedProvider, resolvedModel);
                await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);

                setTimeout(async () => {
                    try {
                        const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, escaped);
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                    } catch (err) {
                        console.warn('Failed to send prompt:', err);
                    }
                }, 3000);

                t.tmuxSessionName = lane.sessionName;
                t.tmuxWindowIndex = winIndex;
                t.tmuxPaneIndex = paneIndex;
                t.tmuxServerId = lane.serverId;
                t.kanbanColumn = 'in_progress';
                t.status = TaskStatus.IN_PROGRESS;
                t.startedAt = Date.now();
                database.saveTask(t);
                tmuxSessionProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start task: ${error}`);
            }
        } else {
            t.kanbanColumn = 'in_progress';
            t.status = TaskStatus.IN_PROGRESS;
            t.startedAt = Date.now();
            database.saveTask(t);
        }
        updateKanban();
        updateDashboard();
    }

    // Wire up kanban actions
    const kanbanActionDisposable = kanbanView.onAction(async ({ action, payload }) => {
        await handleKanbanMessage(action, payload, {
            serviceManager,
            tmuxSessionProvider,
            smartAttachment,
            aiManager,
            orchestrator,
            teamManager,
            kanbanView,
            database,
            swimLanes,
            favouriteFolders,
            updateKanban,
            updateDashboard,
            ensureLaneSession,
            startTaskFlow,
            buildTaskWindowName,
            cleanupInitWindow: async (serverId: string, sessionName: string) => {
                const svc = serviceManager.getService(serverId);
                if (svc) { await cleanupInitWindow(svc, sessionName); }
            },
        });
    });

    async function updateDashboard(): Promise<void> {
        const agents = orchestrator.getAllAgents();
        const agentViews = await Promise.all(agents.map(async a => ({
            agent: a,
            recentOutput: await orchestrator.captureAgentOutput(a.id, 10)
        })));
        dashboardView.updateState({
            agents: agentViews,
            activePipelines: pipelineEngine.getActiveRuns(),
            taskQueue: orchestrator.getTaskQueue(),
            teams: teamManager.getAllTeams(),
            orgUnits: organizationManager.getAllOrgUnits(),
            guilds: guildManager.getAllGuilds(),
            agentMessages: orchestrator.getAllMessages().slice(0, 100),
            agentProfiles: database.getAllAgentProfileStats(),
            teamTemplates: templateManager.getBuiltInTeamTemplates(),
            lastUpdated: Date.now()
        });
    }

    function updateKanban(): void {
        const servers = serviceManager.getAllServices().map(s => ({ id: s.serverId, label: s.serverLabel }));
        kanbanView.updateState(orchestrator.getTaskQueue(), swimLanes, servers, favouriteFolders);
    }

    async function triggerDependentsInline(completedTaskId: string): Promise<void> {
        const allTasks = orchestrator.getTaskQueue();
        for (const t of allTasks) {
            if (!t.dependsOn || !t.dependsOn.includes(completedTaskId)) { continue; }
            const allMet = t.dependsOn.every(depId => {
                const dep = orchestrator.getTask(depId);
                return dep && dep.status === TaskStatus.COMPLETED;
            });
            if (allMet && t.autoStart && (t.kanbanColumn === 'todo' || t.kanbanColumn === 'backlog') && t.swimLaneId) {
                t.kanbanColumn = 'todo';
                database.saveTask(t);
                await startTaskFlow(t);
            }
        }
    }

    // ── Auto-Close / Auto-Pilot Monitor ──────────────────────────────────────
    const autoMonitorCtx = {
        serviceManager,
        tmuxSessionProvider,
        orchestrator,
        database,
        updateKanban,
        updateDashboard,
        startTaskFlow,
        swimLanes,
    };

    const autoMonitorTimer = setInterval(async () => {
        await checkAutoCompletions(autoMonitorCtx);
        await checkAutoPilot(autoMonitorCtx);
    }, 15000);

    async function ensureLaneSession(lane: KanbanSwimLane): Promise<boolean> {
        const service = serviceManager.getService(lane.serverId);
        if (!service) {
            vscode.window.showErrorMessage(`Server not found: ${lane.serverId}`);
            return false;
        }
        try {
            const existing = await service.getSessions();
            if (!existing.includes(lane.sessionName)) {
                // Session doesn't exist — (re)create it
                if (lane.sessionActive) {
                    lane.sessionActive = false;
                }
                await service.newSession(lane.sessionName, {
                    cwd: lane.workingDirectory || undefined,
                    windowName: '__lane_init__',
                });
                // Prevent tmux from auto-renaming the init window to the shell (e.g. "zsh")
                // so cleanupInitWindow can find and remove it by name
                await service.execCommand(`tmux set-window-option -t "${lane.sessionName}" automatic-rename off`).catch(() => {});
            }
            lane.sessionActive = true;
            database.saveSwimLane(lane);
            tmuxSessionProvider.refresh();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create session for lane "${lane.name}": ${error}`);
            return false;
        }
    }

    /** Kill the placeholder __lane_init__ window after a real task window has been created. */
    async function cleanupInitWindow(service: import('./tmuxService').TmuxService, sessionName: string): Promise<void> {
        try {
            const sessions = await service.getTmuxTreeFresh();
            const session = sessions.find(s => s.name === sessionName);
            const initWin = session?.windows.find(w => w.name === '__lane_init__');
            if (initWin && session && session.windows.length > 1) {
                await service.killWindow(sessionName, initWin.index);
            }
        } catch {
            // Non-critical — init window may already be gone
        }
    }

    async function advancePipeline(runId: string): Promise<void> {
        const run = pipelineEngine.getRun(runId);
        if (!run || run.status !== 'running') { return; }
        const pipeline = pipelineEngine.getPipeline(run.pipelineId);
        if (!pipeline) { return; }

        const previousOutputs: Record<string, string> = {};
        for (const [stageId, result] of Object.entries(run.stageResults)) {
            if (result.status === TaskStatus.COMPLETED && result.output) {
                previousOutputs[stageId] = result.output;
            }
        }

        const readyStages = pipelineEngine.getReadyStages(run);
        for (const stage of readyStages) {
            const tasks = pipelineEngine.generateTasksForStage(pipeline, stage, previousOutputs);
            for (const task of tasks) {
                orchestrator.submitTask(task);
            }
        }
        graphView.updateRun(run);
    }

    // ── Register Session Commands ────────────────────────────────────────────
    const sessionDisposables = registerSessionCommands(context, {
        serviceManager,
        tmuxSessionProvider,
        smartAttachment,
        aiManager,
        hotkeyManager,
        getServiceForItem: (item) => getServiceForItem(serviceManager, item),
        pickService: () => pickService(serviceManager),
    });

    // ── Register Agent / Orchestration Commands ──────────────────────────────
    const agentDisposables = registerAgentCommands(context, {
        serviceManager,
        tmuxSessionProvider,
        aiManager,
        orchestrator,
        taskRouter,
        pipelineEngine,
        templateManager,
        teamManager,
        dashboardView,
        graphView,
        kanbanView,
        database,
        updateDashboard,
        updateKanban,
        advancePipeline,
        pickService: () => pickService(serviceManager),
    });

    // ── Register All ──────────────────────────────────────────────────────────

    context.subscriptions.push(
        ...sessionDisposables,
        ...agentDisposables,
        // Event subscriptions
        agentStateChangedDisposable,
        taskCompletedDisposable,
        orgChangedDisposable,
        guildChangedDisposable,
        agentMessageDisposable,
        dashboardActionDisposable,
        graphActionDisposable,
        kanbanActionDisposable,
        // Disposables
        { dispose: () => clearInterval(autoMonitorTimer) },
        { dispose: () => database.close() },
        outputChannel,
        serviceManager,
        tmuxSessionProvider,
        orchestrator,
        pipelineEngine,
        teamManager,
        organizationManager,
        guildManager,
        dashboardView,
        graphView,
        kanbanView
    );

    log('Tmux Agents activated successfully');
}

export function deactivate() {}
