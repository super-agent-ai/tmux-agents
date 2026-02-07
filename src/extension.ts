import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { TmuxSessionProvider, TmuxSessionTreeItem, TmuxWindowTreeItem, TmuxPaneTreeItem, TmuxServerTreeItem, ShortcutsProvider } from './treeProvider';
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
import { AIProvider, TmuxSession, AgentInstance, AgentState, AgentRole, AgentTemplate, StageType, TaskStatus, OrchestratorTask, KanbanSwimLane, Pipeline, PipelineRun, AgentTeam } from './types';

const execAsync = util.promisify(cp.exec);

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

/**
 * Build a descriptive tmux window name from a task: first 2 words of description + task id + short uuid.
 */
function buildTaskWindowName(task: OrchestratorTask): string {
    const words = (task.description || '').trim().split(/\s+/).slice(0, 2).join('-')
        .toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 20);
    const shortId = task.id.slice(0, 15);
    const uuid = Math.random().toString(36).slice(2, 8);
    const name = `${words}-${shortId}-${uuid}`;
    return name.slice(0, 60);
}

async function createAISessionCommand(
    provider: AIProvider,
    serviceManager: TmuxServiceManager,
    aiManager: AIAssistantManager,
    smartAttachment: SmartAttachmentService,
    tmuxSessionProvider: TmuxSessionProvider
): Promise<void> {
    const service = await pickService(serviceManager);
    if (!service) { return; }

    const sessions = await service.getSessions();

    const prefix = provider === AIProvider.CLAUDE ? 'claude'
        : provider === AIProvider.GEMINI ? 'gemini'
        : 'codex';

    let nextId = 0;
    while (sessions.includes(`${prefix}-${nextId}`)) {
        nextId++;
    }
    const defaultName = `${prefix}-${nextId}`;

    const name = await vscode.window.showInputBox({
        prompt: `Enter name for new ${prefix} AI session`,
        value: defaultName,
        validateInput: value => {
            if (!value) { return 'Session name cannot be empty.'; }
            if (sessions.includes(value)) { return `Session "${value}" already exists.`; }
            return null;
        }
    });

    if (!name) { return; }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    try {
        await aiManager.createAISession(provider, service, name, workspacePath);
        tmuxSessionProvider.refresh();

        const terminal = await smartAttachment.attachToSession(service, name);
        terminal.show();
    } catch (error) {
        // Error already shown by the service
    }
}

export function activate(context: vscode.ExtensionContext) {
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
        updateKanban: () => updateKanban(),
        getKanbanTasks: () => orchestrator.getTaskQueue(),
        saveTask: (task) => database.saveTask(task),
        deleteTask: (taskId) => { orchestrator.cancelTask(taskId); database.deleteTask(taskId); },
        startTaskFlow: (task) => startTaskFlow(task),
    });

    const chatViewProvider = new ChatViewProvider(
        serviceManager, context.extensionUri, apiCatalog,
        { orchestrator, teamManager, pipelineEngine, templateManager }
    );
    chatViewProvider.setRefreshCallback(() => tmuxSessionProvider.refresh());
    vscode.window.registerWebviewViewProvider('tmux-agents-chat', chatViewProvider);
    const dashboardView = new DashboardViewProvider(context.extensionUri);
    const graphView = new GraphViewProvider(context.extensionUri);
    const kanbanView = new KanbanViewProvider(context.extensionUri);
    const swimLanes: KanbanSwimLane[] = [];

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

            // Load swim lanes from DB
            for (const lane of database.getAllSwimLanes()) {
                swimLanes.push(lane);
            }

            // Load tasks from DB into orchestrator
            for (const task of database.getAllTasks()) {
                orchestrator.submitTask(task);
            }

            // Load custom pipelines (skip built-ins already loaded)
            for (const pipeline of database.getAllPipelines()) {
                if (!pipelineEngine.getPipeline(pipeline.id)) {
                    pipelineEngine.savePipeline(pipeline);
                }
            }

            updateKanban();
            updateDashboard();
            console.log('tmux-agents: Database loaded successfully');
        } catch (error) {
            console.warn('tmux-agents: Failed to load database:', error);
        }
    })();

    // Start orchestrator polling (5s interval)
    const orchestratorConfig = vscode.workspace.getConfiguration('tmuxAgents');
    const pollingInterval = orchestratorConfig.get<number>('orchestrator.pollingInterval', 5000);
    if (orchestratorConfig.get<boolean>('orchestrator.enabled', true)) {
        orchestrator.startPolling(serviceManager, pollingInterval);
    }

    // Wire up orchestrator events to dashboard
    const agentStateChangedDisposable = orchestrator.onAgentStateChanged(agent => {
        database.saveAgent(agent);
        updateDashboard();
    });
    const taskCompletedDisposable = orchestrator.onTaskCompleted(async task => {
        // Capture pane output and store as task output
        if (task.assignedAgentId) {
            const output = await orchestrator.captureAgentOutput(task.assignedAgentId, 50);
            if (output) { task.output = output; }
            database.saveTask(task);
        }
        // Check if this subtask's parent is now fully complete
        if (task.parentTaskId) {
            const parent = orchestrator.getTask(task.parentTaskId);
            if (parent && parent.subtaskIds) {
                const allDone = parent.subtaskIds.every(sid => {
                    const sub = orchestrator.getTask(sid);
                    return sub && sub.status === TaskStatus.COMPLETED;
                });
                if (allDone) {
                    // Launch verification agent
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

                                // cd to swimlane working directory first
                                if (lane.workingDirectory) {
                                    await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                                }

                                // Build verification prompt with all subtask outputs
                                let verifyPrompt = `You are a code reviewer. Verify the following completed subtasks:\n\nParent task: ${parent.description}\n`;
                                for (const sid of parent.subtaskIds) {
                                    const sub = orchestrator.getTask(sid);
                                    if (sub) {
                                        verifyPrompt += `\n--- Subtask ${sub.id.slice(0, 8)}: ${sub.description} ---\n`;
                                        verifyPrompt += sub.output ? sub.output.slice(-500) : '(no output captured)';
                                        verifyPrompt += '\n';
                                    }
                                }
                                verifyPrompt += `\nReview all subtask outputs. Check for:\n1. Correctness and completeness\n2. Consistency between subtasks\n3. Any errors or issues\n\nProvide a verification summary.`;

                                const launchCmd = aiManager.getLaunchCommand(AIProvider.CLAUDE);
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
                        // No lane session — just mark as done
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
        // Check if task belongs to a pipeline and advance it
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
                    prompt = `Implement the following ${subtasks.length} tasks together:\n`;
                    for (let i = 0; i < subtasks.length; i++) {
                        const sub = subtasks[i];
                        prompt += `\n--- Task ${i + 1} ---\nTask ID: ${sub.id}\nDescription: ${sub.description}`;
                        if (sub.input) { prompt += `\nDetails: ${sub.input}`; }
                        if (sub.targetRole) { prompt += `\nRole: ${sub.targetRole}`; }
                    }
                    prompt += `\n\nAll tasks should be completed together in this session. Coordinate the work across all tasks.`;
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
                    prompt = `Implement the following task:\n\nTask ID: ${t.id}\nDescription: ${t.description}`;
                    if (t.input) { prompt += `\nDetails: ${t.input}`; }
                    if (t.targetRole) { prompt += `\nRole: ${t.targetRole}`; }
                }

                // Inject swim lane context instructions
                if (lane.contextInstructions) { prompt += `\n\nContext / Instructions:\n${lane.contextInstructions}`; }

                if (options?.additionalInstructions) { prompt += `\n\nAdditional instructions: ${options.additionalInstructions}`; }
                if (options?.askForContext) {
                    prompt += `\n\nBefore starting, ask the user if they have any additional context or requirements for this task.`;
                } else {
                    prompt += `\n\nStart implementing immediately without asking for confirmation.`;
                }

                // Auto-close: append completion signal instruction
                if (t.autoClose) {
                    const signalId = t.id.slice(-8);
                    prompt += `\n\nIMPORTANT: When you have completed ALL the work for this task, output a brief summary of what you did followed by the completion signal, exactly in this format:\n<promise-summary>${signalId}\nYour summary of what was accomplished (2-5 sentences)\n</promise-summary>\n<promise>${signalId}-DONE</promise>\nThese signals will be detected automatically. Only output them when you are fully done.`;
                }

                const launchCmd = aiManager.getLaunchCommand(AIProvider.CLAUDE);
                await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);

                setTimeout(async () => {
                    try {
                        const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, escaped);
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                    } catch (err) {
                        console.warn('Failed to send prompt to Claude:', err);
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
        switch (action) {
            case 'browseDir': {
                const browseServerId = payload.serverId || 'local';
                const browseService = serviceManager.getService(browseServerId);
                const startPath = payload.currentPath || '~/';

                if (!browseService || browseService.serverIdentity.isLocal) {
                    // Local server — use native folder picker
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        canSelectFiles: false,
                        canSelectFolders: true,
                        openLabel: 'Select Directory',
                    });
                    if (uris && uris.length > 0) {
                        kanbanView.sendMessage({ type: 'browseDirResult', target: payload.target, path: uris[0].fsPath });
                    }
                } else {
                    // Remote server — QuickPick directory navigator
                    let currentPath = startPath;
                    while (true) {
                        let dirs: string[];
                        try {
                            // Resolve ~ and list directories
                            const raw = await browseService.execCommand(
                                `cd ${currentPath.replace(/"/g, '\\"')} 2>/dev/null && pwd && find . -maxdepth 1 -type d ! -name . -printf '%f\\n' 2>/dev/null | sort || ls -1p | grep '/$' | sed 's/\\/$//'`
                            );
                            const lines = raw.trim().split('\n').filter(l => l.length > 0);
                            // First line is the resolved absolute path
                            currentPath = lines[0] || currentPath;
                            dirs = lines.slice(1).filter(d => !d.startsWith('.'));
                        } catch {
                            vscode.window.showWarningMessage(`Cannot list directories on ${browseService.serverLabel}: ${currentPath}`);
                            break;
                        }

                        const items: vscode.QuickPickItem[] = [
                            { label: '$(check) Select this directory', description: currentPath },
                            { label: '$(arrow-up) ..', description: 'Parent directory' },
                            ...dirs.map(d => ({ label: '$(folder) ' + d, description: '' }))
                        ];

                        const pick = await vscode.window.showQuickPick(items, {
                            title: `Browse: ${browseService.serverLabel}`,
                            placeHolder: currentPath,
                        });

                        if (!pick) { break; } // cancelled

                        if (pick.label.startsWith('$(check)')) {
                            kanbanView.sendMessage({ type: 'browseDirResult', target: payload.target, path: currentPath });
                            break;
                        } else if (pick.label.startsWith('$(arrow-up)')) {
                            currentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
                        } else {
                            const dirName = pick.label.replace('$(folder) ', '');
                            currentPath = currentPath.replace(/\/$/, '') + '/' + dirName;
                        }
                    }
                }
                break;
            }
            case 'createSwimLane': {
                const laneId = 'lane-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                const sessionName = 'kanban-' + (payload.name || 'lane').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
                const lane: KanbanSwimLane = {
                    id: laneId,
                    name: payload.name,
                    serverId: payload.serverId,
                    workingDirectory: payload.workingDirectory || '~/',
                    sessionName,
                    createdAt: Date.now(),
                    sessionActive: false,
                    contextInstructions: payload.contextInstructions || undefined
                };
                swimLanes.push(lane);
                database.saveSwimLane(lane);
                updateKanban();
                break;
            }
            case 'deleteSwimLane': {
                const laneIndex = swimLanes.findIndex(l => l.id === payload.swimLaneId);
                if (laneIndex !== -1) {
                    const lane = swimLanes[laneIndex];
                    // Always attempt to kill the tmux session regardless of sessionActive flag
                    const service = serviceManager.getService(lane.serverId);
                    if (service) {
                        try {
                            await service.deleteSession(lane.sessionName);
                        } catch {
                            // Session might already be gone
                        }
                    }
                    swimLanes.splice(laneIndex, 1);
                    database.deleteSwimLane(lane.id);
                    tmuxSessionProvider.refresh();
                }
                updateKanban();
                break;
            }
            case 'killLaneSession': {
                const lane = swimLanes.find(l => l.id === payload.swimLaneId);
                if (lane && lane.sessionActive) {
                    const service = serviceManager.getService(lane.serverId);
                    if (service) {
                        try {
                            await service.deleteSession(lane.sessionName);
                        } catch {
                            // Session might already be gone
                        }
                    }
                    lane.sessionActive = false;
                    database.saveSwimLane(lane);
                    tmuxSessionProvider.refresh();
                }
                updateKanban();
                break;
            }
            case 'createTask': {
                const task: OrchestratorTask = {
                    id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    description: payload.description,
                    targetRole: payload.targetRole || undefined,
                    status: TaskStatus.PENDING,
                    priority: payload.priority || 5,
                    kanbanColumn: payload.kanbanColumn || 'todo',
                    swimLaneId: payload.swimLaneId || undefined,
                    createdAt: Date.now()
                };
                if (payload.autoStart) { task.autoStart = true; }
                if (payload.autoPilot) { task.autoPilot = true; }
                if (payload.autoClose) { task.autoClose = true; }
                orchestrator.submitTask(task);
                database.saveTask(task);
                // Auto-start if enabled + todo + has swim lane
                if (task.autoStart && task.kanbanColumn === 'todo' && task.swimLaneId) {
                    await startTaskFlow(task);
                }
                updateKanban();
                break;
            }
            case 'moveTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (t) {
                    t.kanbanColumn = payload.kanbanColumn;
                    if (payload.kanbanColumn === 'done') {
                        t.status = TaskStatus.COMPLETED;
                        t.completedAt = Date.now();
                    }
                    if (payload.kanbanColumn === 'in_progress' && t.swimLaneId) {
                        const lane = swimLanes.find(l => l.id === t.swimLaneId);
                        if (lane) {
                            const ready = await ensureLaneSession(lane);
                            if (ready) {
                                const service = serviceManager.getService(lane.serverId);
                                if (service) {
                                    try {
                                        const windowName = buildTaskWindowName(t);
                                        await service.newWindow(lane.sessionName, windowName);
                                        t.status = TaskStatus.IN_PROGRESS;
                                        t.startedAt = Date.now();
                                        tmuxSessionProvider.refresh();
                                    } catch (error) {
                                        console.warn('Failed to create window for task:', error);
                                    }
                                }
                            }
                        }
                    }
                    if (t) { database.saveTask(t); }
                    // Auto-start: if task has autoStart and was moved to todo with a swim lane
                    if (t && t.autoStart && payload.kanbanColumn === 'todo' && t.swimLaneId) {
                        await startTaskFlow(t);
                    }
                }
                updateKanban();
                break;
            }
            case 'editTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (t && payload.updates) {
                    if (payload.updates.description !== undefined) t.description = payload.updates.description;
                    if (payload.updates.input !== undefined) t.input = payload.updates.input;
                    if (payload.updates.targetRole !== undefined) t.targetRole = payload.updates.targetRole;
                    if (payload.updates.priority !== undefined) t.priority = payload.updates.priority;
                    if (payload.updates.autoStart !== undefined) t.autoStart = !!payload.updates.autoStart;
                    if (payload.updates.autoPilot !== undefined) t.autoPilot = !!payload.updates.autoPilot;
                    if (payload.updates.autoClose !== undefined) t.autoClose = !!payload.updates.autoClose;
                }
                if (t) { database.saveTask(t); }
                updateKanban();
                break;
            }
            case 'toggleAutoMode': {
                const t = orchestrator.getTask(payload.taskId);
                if (t) {
                    t.autoStart = !!payload.autoStart;
                    t.autoPilot = !!payload.autoPilot;
                    t.autoClose = !!payload.autoClose;
                    database.saveTask(t);
                    if (t.autoStart && t.kanbanColumn === 'todo' && t.swimLaneId) {
                        await startTaskFlow(t);
                    }
                }
                updateKanban();
                break;
            }
            case 'startTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (!t) break;
                await startTaskFlow(t, {
                    additionalInstructions: payload.additionalInstructions,
                    askForContext: payload.askForContext
                });
                break;
            }
            case 'attachTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (!t || !t.tmuxSessionName || !t.tmuxServerId) {
                    vscode.window.showWarningMessage('No tmux window info for this task');
                    break;
                }
                const service = serviceManager.getService(t.tmuxServerId);
                if (!service) {
                    vscode.window.showErrorMessage(`Server "${t.tmuxServerId}" not found`);
                    break;
                }
                const terminal = await smartAttachment.attachToSession(service, t.tmuxSessionName, {
                    windowIndex: t.tmuxWindowIndex,
                    paneIndex: t.tmuxPaneIndex
                });
                terminal.show();
                break;
            }
            case 'closeTaskWindow': {
                const t = orchestrator.getTask(payload.taskId);
                if (!t || !t.tmuxSessionName || !t.tmuxWindowIndex || !t.tmuxServerId) break;
                const svc = serviceManager.getService(t.tmuxServerId);
                if (!svc) break;
                try {
                    await svc.killWindow(t.tmuxSessionName, t.tmuxWindowIndex);
                    t.tmuxSessionName = undefined;
                    t.tmuxWindowIndex = undefined;
                    t.tmuxPaneIndex = undefined;
                    t.tmuxServerId = undefined;
                    database.saveTask(t);
                    tmuxSessionProvider.refresh();
                    updateKanban();
                } catch (err) {
                    vscode.window.showWarningMessage(`Failed to close window: ${err}`);
                }
                break;
            }
            case 'restartTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (!t) break;
                const lane = t.swimLaneId ? swimLanes.find(l => l.id === t.swimLaneId) : undefined;
                if (!lane) {
                    vscode.window.showWarningMessage('Task has no swim lane — cannot restart');
                    break;
                }

                const ready = await ensureLaneSession(lane);
                if (!ready) break;

                const service = serviceManager.getService(lane.serverId);
                if (!service) break;

                try {
                    // Kill old window if it exists
                    if (t.tmuxSessionName && t.tmuxWindowIndex) {
                        try {
                            await service.killWindow(t.tmuxSessionName, t.tmuxWindowIndex);
                        } catch {
                            // Window may already be gone
                        }
                    }

                    // Create a brand new window with a descriptive name
                    const windowName = buildTaskWindowName(t);
                    await service.newWindow(lane.sessionName, windowName);

                    // Discover the new window's index
                    const sessions = await service.getTmuxTreeFresh();
                    const session = sessions.find(s => s.name === lane.sessionName);
                    const win = session?.windows.find(w => w.name === windowName);
                    const winIndex = win?.index || '0';
                    const paneIndex = win?.panes[0]?.index || '0';

                    // cd to swimlane working directory first
                    if (lane.workingDirectory) {
                        await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                    }

                    // Build the same prompt as startTask
                    let prompt = '';
                    if (t.subtaskIds && t.subtaskIds.length > 0) {
                        const subtasks = t.subtaskIds.map(id => orchestrator.getTask(id)).filter((s): s is OrchestratorTask => !!s);
                        prompt = `Implement the following ${subtasks.length} tasks together:\n`;
                        for (let i = 0; i < subtasks.length; i++) {
                            const sub = subtasks[i];
                            prompt += `\n--- Task ${i + 1} ---\nTask ID: ${sub.id}\nDescription: ${sub.description}`;
                            if (sub.input) { prompt += `\nDetails: ${sub.input}`; }
                            if (sub.targetRole) { prompt += `\nRole: ${sub.targetRole}`; }
                        }
                        prompt += `\n\nAll tasks should be completed together in this session. Coordinate the work across all tasks.`;
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
                        prompt = `Implement the following task:\n\nTask ID: ${t.id}\nDescription: ${t.description}`;
                        if (t.input) { prompt += `\nDetails: ${t.input}`; }
                        if (t.targetRole) { prompt += `\nRole: ${t.targetRole}`; }
                    }
                    // Inject swim lane context instructions
                    if (lane.contextInstructions) { prompt += `\n\nContext / Instructions:\n${lane.contextInstructions}`; }

                    prompt += `\n\nStart implementing immediately without asking for confirmation.`;

                    // Auto-close prompt injection
                    if (t.autoClose) {
                        const signalId = t.id.slice(-8);
                        prompt += `\n\nIMPORTANT: When you have completed ALL the work for this task, output a brief summary of what you did followed by the completion signal, exactly in this format:\n<promise-summary>${signalId}\nYour summary of what was accomplished (2-5 sentences)\n</promise-summary>\n<promise>${signalId}-DONE</promise>\nThese signals will be detected automatically. Only output them when you are fully done.`;
                    }

                    // Launch AI in the new window
                    const launchCmd = aiManager.getLaunchCommand(AIProvider.CLAUDE);
                    await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);

                    // Send prompt after Claude starts
                    setTimeout(async () => {
                        try {
                            const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                            await service.sendKeys(lane.sessionName, winIndex, paneIndex, escaped);
                            await service.sendKeys(lane.sessionName, winIndex, paneIndex, '');
                        } catch (err) {
                            console.warn('Failed to send prompt to Claude:', err);
                        }
                    }, 3000);

                    // Update task with new window info
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
                    vscode.window.showErrorMessage(`Failed to restart task: ${error}`);
                }
                updateKanban();
                updateDashboard();
                break;
            }
            case 'startBundle': {
                const taskIds: string[] = payload.taskIds || [];
                const bundleTasks = taskIds.map(id => orchestrator.getTask(id)).filter((t): t is OrchestratorTask => !!t);
                if (bundleTasks.length === 0) break;

                // Determine the swim lane from the first task
                const firstTask = bundleTasks[0];
                const lane = firstTask.swimLaneId ? swimLanes.find(l => l.id === firstTask.swimLaneId) : undefined;

                if (lane) {
                    const ready = await ensureLaneSession(lane);
                    if (!ready) break;

                    const service = serviceManager.getService(lane.serverId);
                    if (!service) break;

                    // Create a window for each task and spawn AI
                    for (const t of bundleTasks) {
                        try {
                            const windowName = buildTaskWindowName(t);
                            await service.newWindow(lane.sessionName, windowName);

                            const sessions = await service.getTmuxTreeFresh();
                            const session = sessions.find(s => s.name === lane.sessionName);
                            const win = session?.windows.find(w => w.name === windowName);
                            const winIndex = win?.index || '0';
                            const paneIndex = win?.panes[0]?.index || '0';

                            // cd to swimlane working directory first
                            if (lane.workingDirectory) {
                                await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                            }

                            // Build context prompt
                            let prompt = `Implement the following task:\n\nTask ID: ${t.id}\nDescription: ${t.description}`;
                            if (t.input) { prompt += `\nDetails: ${t.input}`; }
                            if (t.targetRole) { prompt += `\nRole: ${t.targetRole}`; }

                            // Add bundle context
                            const otherTasks = bundleTasks.filter(bt => bt.id !== t.id);
                            if (otherTasks.length > 0) {
                                prompt += `\n\nThis task is part of a bundle with ${otherTasks.length} other tasks:`;
                                for (const ot of otherTasks) {
                                    prompt += `\n- ${ot.id.slice(0, 8)}: ${ot.description}`;
                                }
                                prompt += `\nCoordinate with the other tasks if relevant.`;
                            }

                            // Inject swim lane context instructions
                            if (lane.contextInstructions) { prompt += `\n\nContext / Instructions:\n${lane.contextInstructions}`; }

                            if (payload.additionalInstructions) {
                                prompt += `\n\nAdditional instructions: ${payload.additionalInstructions}`;
                            }
                            if (payload.askForContext) {
                                prompt += `\n\nBefore starting, ask the user if they have any additional context.`;
                            } else {
                                prompt += `\n\nStart implementing immediately.`;
                            }

                            // Auto-close prompt injection
                            if (t.autoClose) {
                                const signalId = t.id.slice(-8);
                                prompt += `\n\nIMPORTANT: When you have completed ALL the work for this task, output a brief summary of what you did followed by the completion signal, exactly in this format:\n<promise-summary>${signalId}\nYour summary of what was accomplished (2-5 sentences)\n</promise-summary>\n<promise>${signalId}-DONE</promise>\nThese signals will be detected automatically. Only output them when you are fully done.`;
                            }

                            // Launch Claude
                            const launchCmd = aiManager.getLaunchCommand(AIProvider.CLAUDE);
                            await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);

                            // Delay-send the prompt
                            const capturedPrompt = prompt;
                            const capturedSession = lane.sessionName;
                            const capturedWin = winIndex;
                            const capturedPane = paneIndex;
                            setTimeout(async () => {
                                try {
                                    const escaped = capturedPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                                    await service.sendKeys(capturedSession, capturedWin, capturedPane, '');
                                    await service.sendKeys(capturedSession, capturedWin, capturedPane, escaped);
                                    await service.sendKeys(capturedSession, capturedWin, capturedPane, '');
                                } catch (err) {
                                    console.warn('Failed to send bundle prompt:', err);
                                }
                            }, 3000);

                            // Store tmux window info for attach
                            t.tmuxSessionName = lane.sessionName;
                            t.tmuxWindowIndex = winIndex;
                            t.tmuxPaneIndex = paneIndex;
                            t.tmuxServerId = lane.serverId;

                            // Update task
                            t.kanbanColumn = 'in_progress';
                            t.status = TaskStatus.IN_PROGRESS;
                            t.startedAt = Date.now();
                            database.saveTask(t);
                        } catch (error) {
                            console.warn(`Failed to start bundle task ${t.id}:`, error);
                        }
                    }

                    // Create a team for the bundle
                    if (bundleTasks.length > 1) {
                        const team = teamManager.createTeam(`Bundle ${new Date().toLocaleTimeString()}`);
                        vscode.window.showInformationMessage(`Started bundle of ${bundleTasks.length} tasks in lane "${lane.name}"`);
                    }

                    // If these are subtasks of a parent, mark parent for verification
                    const parentIds = new Set<string>();
                    for (const t of bundleTasks) {
                        if (t.parentTaskId) { parentIds.add(t.parentTaskId); }
                    }
                    for (const pid of parentIds) {
                        const parent = orchestrator.getTask(pid);
                        if (parent) {
                            parent.verificationStatus = 'pending';
                            parent.kanbanColumn = 'in_progress';
                            parent.status = TaskStatus.IN_PROGRESS;
                            parent.startedAt = Date.now();
                        }
                    }

                    tmuxSessionProvider.refresh();
                } else {
                    // No swim lane — just move all to in_progress
                    for (const t of bundleTasks) {
                        t.kanbanColumn = 'in_progress';
                        t.status = TaskStatus.IN_PROGRESS;
                        t.startedAt = Date.now();
                        database.saveTask(t);
                    }
                }
                updateKanban();
                updateDashboard();
                break;
            }
            case 'mergeTasks': {
                const task1 = orchestrator.getTask(payload.taskId1);
                const task2 = orchestrator.getTask(payload.taskId2);
                if (!task1 || !task2) break;

                // Create a new parent task combining both
                const parentTask: OrchestratorTask = {
                    id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    description: `${task1.description} + ${task2.description}`,
                    targetRole: task1.targetRole || task2.targetRole,
                    status: TaskStatus.PENDING,
                    priority: Math.max(task1.priority, task2.priority),
                    kanbanColumn: task1.kanbanColumn || task2.kanbanColumn || 'todo',
                    swimLaneId: task1.swimLaneId || task2.swimLaneId,
                    subtaskIds: [task1.id, task2.id],
                    verificationStatus: 'none',
                    createdAt: Date.now()
                };

                // Mark originals as subtasks
                task1.parentTaskId = parentTask.id;
                task2.parentTaskId = parentTask.id;

                orchestrator.submitTask(parentTask);
                database.saveTask(parentTask);
                database.saveTask(task1);
                database.saveTask(task2);
                updateKanban();
                vscode.window.showInformationMessage(`Merged into parent task with 2 subtasks`);
                break;
            }
            case 'mergeSelectedTasks': {
                const taskIds: string[] = payload.taskIds || [];
                const mergeTasks = taskIds.map(id => orchestrator.getTask(id)).filter((t): t is OrchestratorTask => !!t);
                if (mergeTasks.length < 2) break;

                const descriptions = mergeTasks.map(t => t.description).join(' + ');
                const maxPri = Math.max(...mergeTasks.map(t => t.priority));
                const parentTask: OrchestratorTask = {
                    id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    description: descriptions.length > 80 ? descriptions.slice(0, 77) + '...' : descriptions,
                    targetRole: mergeTasks[0].targetRole,
                    status: TaskStatus.PENDING,
                    priority: maxPri,
                    kanbanColumn: mergeTasks[0].kanbanColumn || 'todo',
                    swimLaneId: mergeTasks[0].swimLaneId,
                    subtaskIds: mergeTasks.map(t => t.id),
                    verificationStatus: 'none',
                    createdAt: Date.now()
                };

                for (const t of mergeTasks) {
                    t.parentTaskId = parentTask.id;
                    database.saveTask(t);
                }

                orchestrator.submitTask(parentTask);
                database.saveTask(parentTask);
                updateKanban();
                vscode.window.showInformationMessage(`Merged ${mergeTasks.length} tasks into a Task Box`);
                break;
            }
            case 'addSubtask': {
                const parentTask = orchestrator.getTask(payload.parentTaskId);
                const childTask = orchestrator.getTask(payload.childTaskId);
                if (!parentTask || !childTask) break;
                if (!parentTask.subtaskIds) { parentTask.subtaskIds = []; }

                // If the child is itself a parent, absorb its subtasks
                if (childTask.subtaskIds && childTask.subtaskIds.length > 0) {
                    for (const subId of childTask.subtaskIds) {
                        const sub = orchestrator.getTask(subId);
                        if (sub) {
                            sub.parentTaskId = parentTask.id;
                            if (!parentTask.subtaskIds.includes(subId)) {
                                parentTask.subtaskIds.push(subId);
                            }
                        }
                    }
                    // Remove the absorbed parent from the queue
                    orchestrator.cancelTask(childTask.id);
                } else {
                    childTask.parentTaskId = parentTask.id;
                    if (!parentTask.subtaskIds.includes(childTask.id)) {
                        parentTask.subtaskIds.push(childTask.id);
                    }
                }

                // Update parent priority to max of children
                let maxPri = parentTask.priority;
                for (const sid of parentTask.subtaskIds) {
                    const s = orchestrator.getTask(sid);
                    if (s && s.priority > maxPri) { maxPri = s.priority; }
                }
                parentTask.priority = maxPri;

                database.saveTask(parentTask);
                if (childTask) { database.saveTask(childTask); }
                updateKanban();
                vscode.window.showInformationMessage(`Added subtask (${parentTask.subtaskIds.length} total)`);
                break;
            }
            case 'splitTaskBox': {
                const parentTask = orchestrator.getTask(payload.taskId);
                if (!parentTask || !parentTask.subtaskIds || parentTask.subtaskIds.length === 0) break;

                // Detach each subtask: give them new IDs, clear parentTaskId, and place in same column
                const col = parentTask.kanbanColumn || 'todo';
                const laneId = parentTask.swimLaneId;
                for (const subId of parentTask.subtaskIds) {
                    const sub = orchestrator.getTask(subId);
                    if (!sub) continue;
                    // Create a new independent task from this subtask
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
                    orchestrator.submitTask(newTask);
                    database.saveTask(newTask);
                    // Delete old subtask
                    orchestrator.cancelTask(subId);
                    database.deleteTask(subId);
                }

                // Delete the parent task
                orchestrator.cancelTask(parentTask.id);
                database.deleteTask(parentTask.id);
                updateKanban();
                vscode.window.showInformationMessage(`Split task box into ${parentTask.subtaskIds.length} individual tasks`);
                break;
            }
            case 'editSwimLane': {
                const lane = swimLanes.find(l => l.id === payload.swimLaneId);
                if (!lane) break;
                const oldSessionName = lane.sessionName;
                if (payload.name) lane.name = payload.name;
                if (payload.workingDirectory) lane.workingDirectory = payload.workingDirectory;
                lane.contextInstructions = payload.contextInstructions || undefined;
                if (payload.sessionName && payload.sessionName !== oldSessionName) {
                    // Rename the tmux session if it's active
                    if (lane.sessionActive) {
                        const svc = serviceManager.getService(lane.serverId);
                        if (svc) {
                            try {
                                await svc.renameSession(oldSessionName, payload.sessionName);
                                tmuxSessionProvider.refresh();
                            } catch (err) {
                                vscode.window.showWarningMessage(`Failed to rename session: ${err}`);
                            }
                        }
                    }
                    lane.sessionName = payload.sessionName;
                }
                database.saveSwimLane(lane);
                updateKanban();
                break;
            }
            case 'deleteTask':
                orchestrator.cancelTask(payload.taskId);
                database.deleteTask(payload.taskId);
                updateKanban();
                break;
            case 'summarizeTask': {
                const t = orchestrator.getTask(payload.taskId);
                if (!t || !t.tmuxSessionName || !t.tmuxWindowIndex || !t.tmuxPaneIndex || !t.tmuxServerId) {
                    kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: 'No live session' });
                    break;
                }
                const svc = serviceManager.getService(t.tmuxServerId);
                if (!svc) {
                    kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: 'Server not found' });
                    break;
                }
                try {
                    const content = await svc.capturePaneContent(t.tmuxSessionName, t.tmuxWindowIndex, t.tmuxPaneIndex, 50);
                    // Summarize with Claude
                    const summary = await new Promise<string>((resolve) => {
                        const prompt = `Summarize what was accomplished in this terminal session in 3-5 sentences. Focus on what was done, key changes made, and the outcome.\n\n${content.slice(-3000)}`;
                        const proc = cp.spawn('claude', ['--print', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
                        let stdout = '';
                        const timer = setTimeout(() => { proc.kill(); resolve(''); }, 20000);
                        proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
                        proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? stdout.trim() : ''); });
                        proc.on('error', () => { clearTimeout(timer); resolve(''); });
                        proc.stdin!.write(prompt);
                        proc.stdin!.end();
                    });
                    if (summary) {
                        const separator = t.input ? '\n\n---\n' : '';
                        t.input = (t.input || '') + separator + '**Output Summary:**\n' + summary;
                        t.output = summary;
                        database.saveTask(t);
                        updateKanban();
                    }
                    kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, success: !!summary });
                } catch (err) {
                    kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: String(err) });
                }
                break;
            }
            case 'aiExpandTask': {
                const text = payload.text || '';
                if (!text) break;
                try {
                    const result = await new Promise<string>((resolve, reject) => {
                        const prompt = `You are a task planner for a software development team. Given a rough description, generate a detailed task specification.

Respond ONLY with valid JSON (no markdown, no code fences), in this exact format:
{"title": "Short task title (under 60 chars)", "description": "Detailed description with context, acceptance criteria, and implementation notes. Be specific and actionable.", "role": "coder"}

The "role" field should be one of: coder, reviewer, tester, devops, researcher, or empty string if unclear.

User's input: ${text}`;
                        const proc = cp.spawn('claude', ['--print', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
                        let stdout = '';
                        const timer = setTimeout(() => { proc.kill(); resolve(''); }, 20000);
                        proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
                        proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? stdout.trim() : ''); });
                        proc.on('error', () => { clearTimeout(timer); resolve(''); });
                        proc.stdin!.write(prompt);
                        proc.stdin!.end();
                    });
                    if (result) {
                        // Try to parse JSON from response (handle markdown fences)
                        let json = result;
                        const fenceMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
                        if (fenceMatch) { json = fenceMatch[1].trim(); }
                        try {
                            const parsed = JSON.parse(json);
                            kanbanView.sendMessage({
                                type: 'aiExpandResult',
                                title: parsed.title || '',
                                description: parsed.description || '',
                                role: parsed.role || ''
                            });
                        } catch {
                            // If JSON parse fails, use raw text as description
                            kanbanView.sendMessage({
                                type: 'aiExpandResult',
                                title: payload.currentTitle || '',
                                description: result,
                                role: ''
                            });
                        }
                    } else {
                        kanbanView.sendMessage({ type: 'aiExpandResult' });
                    }
                } catch {
                    kanbanView.sendMessage({ type: 'aiExpandResult' });
                }
                break;
            }
            case 'scanTmuxSessions': {
                // Scan all servers and sessions, capture content, summarize
                const scanResults: any[] = [];
                const allServices = serviceManager.getAllServices();
                const allTasks = orchestrator.getTaskQueue();

                for (const svc of allServices) {
                    try {
                        const sessions = await svc.getTmuxTreeFresh();
                        for (const session of sessions) {
                            // Check if a swim lane already exists for this session
                            const matchingLane = swimLanes.find(l => l.sessionName === session.name);

                            // Capture content from active panes (first pane per window, up to 30 lines)
                            const paneContents: string[] = [];
                            let primaryDir = '';
                            for (const win of session.windows) {
                                if (win.panes.length > 0) {
                                    const pane = win.panes[0];
                                    if (!primaryDir && pane.currentPath) { primaryDir = pane.currentPath; }
                                    try {
                                        const content = await svc.capturePaneContent(session.name, win.index, pane.index, 20);
                                        if (content.trim()) {
                                            paneContents.push(`[Window "${win.name}"] ${pane.command || 'shell'}\n${content.trim()}`);
                                        }
                                    } catch { /* pane may be dead */ }
                                }
                            }

                            // Summarize with Claude if there's content
                            let summary = '';
                            if (paneContents.length > 0) {
                                const combinedContent = paneContents.join('\n---\n').slice(0, 3000);
                                try {
                                    summary = await new Promise<string>((resolve, reject) => {
                                        const prompt = `Summarize what is happening in this tmux session in 2-3 short lines. Focus on: what project/task, what tools/commands are running, current status.\n\n${combinedContent}`;
                                        const proc = cp.spawn('claude', ['--print', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
                                        let stdout = '';
                                        const timer = setTimeout(() => { proc.kill(); resolve(''); }, 15000);
                                        proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
                                        proc.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? stdout.trim() : ''); });
                                        proc.on('error', () => { clearTimeout(timer); resolve(''); });
                                        proc.stdin!.write(prompt);
                                        proc.stdin!.end();
                                    });
                                } catch { /* summarization failed, not critical */ }
                            }

                            scanResults.push({
                                serverId: svc.serverId,
                                serverLabel: svc.serverLabel,
                                sessionName: session.name,
                                windowCount: session.windows.length,
                                workingDir: primaryDir,
                                summary: summary || paneContents.map(p => p.split('\n')[0]).join('; ').slice(0, 200),
                                existingLaneId: matchingLane?.id || null,
                                windows: session.windows.map(w => ({
                                    name: w.name,
                                    index: w.index,
                                    command: w.panes[0]?.command || 'shell',
                                    currentPath: w.panes[0]?.currentPath || '',
                                    paneCount: w.panes.length,
                                    alreadyImported: allTasks.some(t => t.tmuxSessionName === session.name && t.tmuxWindowIndex === String(w.index))
                                }))
                            });
                        }
                    } catch (err) {
                        console.warn(`Failed to scan server ${svc.serverId}:`, err);
                    }
                }

                // Send results back to webview
                kanbanView.sendMessage({ type: 'tmuxScanResult', sessions: scanResults });
                break;
            }
            case 'importTmuxSessions': {
                const sessionsToImport: any[] = payload.sessions || [];
                let importedWindows = 0;

                for (const s of sessionsToImport) {
                    // Determine which windows to import (only selected, non-already-imported)
                    const windowsToImport = (s.selectedWindows || s.windows || []).filter(
                        (w: any) => !w.alreadyImported
                    );
                    if (windowsToImport.length === 0) continue;

                    // Reuse existing lane or create a new one
                    let laneId = s.existingLaneId || null;
                    if (laneId && swimLanes.some(l => l.id === laneId)) {
                        // Lane already exists, reuse it
                    } else {
                        laneId = 'lane-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
                        const lane: KanbanSwimLane = {
                            id: laneId,
                            name: s.sessionName,
                            serverId: s.serverId,
                            workingDirectory: s.workingDir || '~/',
                            sessionName: s.sessionName,
                            createdAt: Date.now(),
                            sessionActive: true  // session already exists
                        };
                        swimLanes.push(lane);
                        database.saveSwimLane(lane);
                    }

                    // Create tasks from selected windows
                    for (const win of windowsToImport) {
                        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        const task: OrchestratorTask = {
                            id: taskId,
                            description: win.name || `Window ${win.index}`,
                            status: TaskStatus.IN_PROGRESS,
                            priority: 5,
                            createdAt: Date.now(),
                            startedAt: Date.now(),
                            kanbanColumn: 'in_progress',
                            swimLaneId: laneId,
                            input: win.command !== 'shell' ? `Running: ${win.command}` : (win.currentPath ? `Working in: ${win.currentPath}` : undefined),
                            tmuxSessionName: s.sessionName,
                            tmuxWindowIndex: win.index,
                            tmuxPaneIndex: '0',
                            tmuxServerId: s.serverId,
                        };
                        orchestrator.submitTask(task);
                        database.saveTask(task);
                        importedWindows++;
                    }
                }

                updateKanban();
                tmuxSessionProvider.refresh();
                vscode.window.showInformationMessage(`Imported ${importedWindows} window(s) as tasks`);
                break;
            }
            case 'refresh':
                updateKanban();
                break;
        }
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
            lastUpdated: Date.now()
        });
    }

    function updateKanban(): void {
        const servers = serviceManager.getAllServices().map(s => ({ id: s.serverId, label: s.serverLabel }));
        kanbanView.updateState(orchestrator.getTaskQueue(), swimLanes, servers);
    }

    // ── Auto-Close Completion Monitor ─────────────────────────────────────────
    async function checkAutoCompletions(): Promise<void> {
        const allTasks = orchestrator.getTaskQueue();
        const autoTasks = allTasks.filter(t =>
            t.autoClose && t.kanbanColumn === 'in_progress' &&
            t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId
        );
        if (autoTasks.length === 0) { return; }

        for (const task of autoTasks) {
            const service = serviceManager.getService(task.tmuxServerId!);
            if (!service) { continue; }
            try {
                const content = await service.capturePaneContent(
                    task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, 100
                );
                const signalId = task.id.slice(-8);
                if (content.includes(`<promise>${signalId}-DONE</promise>`)) {
                    // Extract summary if present
                    const summaryStart = content.indexOf(`<promise-summary>${signalId}`);
                    const summaryEnd = content.indexOf('</promise-summary>');
                    if (summaryStart !== -1 && summaryEnd !== -1) {
                        const raw = content.substring(summaryStart, summaryEnd);
                        // Remove the tag + signalId line, keep the summary text
                        const lines = raw.split('\n').slice(1); // skip "<promise-summary>SIGNALID"
                        task.output = lines.join('\n').trim();
                    }
                    // Append summary to task description for records
                    if (task.output) {
                        const separator = task.input ? '\n\n---\n' : '';
                        task.input = (task.input || '') + separator + '**Completion Summary:**\n' + task.output;
                    }
                    // Kill tmux window
                    try { await service.killWindow(task.tmuxSessionName!, task.tmuxWindowIndex!); } catch {}
                    // Move to done
                    task.kanbanColumn = 'done';
                    task.status = TaskStatus.COMPLETED;
                    task.completedAt = Date.now();
                    task.tmuxSessionName = undefined;
                    task.tmuxWindowIndex = undefined;
                    task.tmuxPaneIndex = undefined;
                    task.tmuxServerId = undefined;
                    database.saveTask(task);
                    // Complete subtasks if parent
                    if (task.subtaskIds) {
                        for (const subId of task.subtaskIds) {
                            const sub = orchestrator.getTask(subId);
                            if (sub && sub.status !== TaskStatus.COMPLETED) {
                                sub.kanbanColumn = 'done';
                                sub.status = TaskStatus.COMPLETED;
                                sub.completedAt = Date.now();
                                sub.tmuxSessionName = undefined;
                                sub.tmuxWindowIndex = undefined;
                                sub.tmuxPaneIndex = undefined;
                                sub.tmuxServerId = undefined;
                                database.saveTask(sub);
                            }
                        }
                    }
                    tmuxSessionProvider.refresh();
                    updateKanban();
                    await updateDashboard();
                    vscode.window.showInformationMessage(`Auto task completed: ${task.description.slice(0, 50)}`);
                }
            } catch (err) {
                console.warn(`[AutoMode] Error checking task ${task.id}:`, err);
            }
        }
    }

    // ── Auto-Pilot Monitor ─────────────────────────────────────────────────────
    async function checkAutoPilot(): Promise<void> {
        const allTasks = orchestrator.getTaskQueue();
        const pilotTasks = allTasks.filter(t =>
            t.autoPilot && t.kanbanColumn === 'in_progress' &&
            t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId
        );
        if (pilotTasks.length === 0) { return; }

        for (const task of pilotTasks) {
            const service = serviceManager.getService(task.tmuxServerId!);
            if (!service) { continue; }
            try {
                const content = await service.capturePaneContent(
                    task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, 30
                );
                const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const lastLines = lines.slice(-5).join('\n').toLowerCase();

                // Detect permission/confirmation prompts from Claude and auto-approve
                const needsApproval =
                    lastLines.includes('do you want to proceed') ||
                    lastLines.includes('allow this action') ||
                    lastLines.includes('(y/n)') ||
                    lastLines.includes('press enter to') ||
                    lastLines.includes('approve this') ||
                    lastLines.includes('want me to') ||
                    lastLines.includes('shall i') ||
                    lastLines.includes('should i') ||
                    lastLines.includes('may i') ||
                    /\?\s*$/.test(lines[lines.length - 1] || '');

                if (needsApproval) {
                    await service.sendKeys(task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, 'yes');
                    await service.sendKeys(task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, '');
                }
            } catch (err) {
                console.warn(`[AutoPilot] Error checking task ${task.id}:`, err);
            }
        }
    }

    const autoMonitorTimer = setInterval(async () => {
        await checkAutoCompletions();
        await checkAutoPilot();
    }, 15000);

    async function ensureLaneSession(lane: KanbanSwimLane): Promise<boolean> {
        if (lane.sessionActive) { return true; }
        const service = serviceManager.getService(lane.serverId);
        if (!service) {
            vscode.window.showErrorMessage(`Server not found: ${lane.serverId}`);
            return false;
        }
        try {
            // Check if session already exists before creating
            const existing = await service.getSessions();
            if (!existing.includes(lane.sessionName)) {
                await service.newSession(lane.sessionName);
                if (lane.workingDirectory) {
                    await service.sendKeysToSession(lane.sessionName, `cd ${lane.workingDirectory}`);
                }
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

    async function advancePipeline(runId: string): Promise<void> {
        const run = pipelineEngine.getRun(runId);
        if (!run || run.status !== 'running') { return; }
        const pipeline = pipelineEngine.getPipeline(run.pipelineId);
        if (!pipeline) { return; }

        // Collect completed stage outputs for artifact passing
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

    async function spawnAgentFromTemplate(template: AgentTemplate, teamId?: string): Promise<AgentInstance | undefined> {
        const service = await pickService(serviceManager);
        if (!service) { return undefined; }

        const sessions = await service.getSessions();
        const baseName = `agent-${template.role}-${template.aiProvider}`;
        let name = baseName;
        let counter = 0;
        while (sessions.includes(name)) {
            counter++;
            name = `${baseName}-${counter}`;
        }

        try {
            await service.newSession(name);
            const launchCmd = aiManager.getLaunchCommand(template.aiProvider);
            await service.sendKeysToSession(name, launchCmd);

            // Get the session info
            const freshSessions = await service.getTmuxTreeFresh();
            const session = freshSessions.find(s => s.name === name);
            const windowIndex = session?.windows[0]?.index || '0';
            const paneIndex = session?.windows[0]?.panes[0]?.index || '0';

            const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const agent: AgentInstance = {
                id: agentId,
                templateId: template.id,
                name: name,
                role: template.role,
                aiProvider: template.aiProvider,
                state: AgentState.SPAWNING,
                serverId: service.serverId,
                sessionName: name,
                windowIndex,
                paneIndex,
                teamId,
                createdAt: Date.now(),
                lastActivityAt: Date.now()
            };

            orchestrator.registerAgent(agent);
            tmuxSessionProvider.refresh();
            updateDashboard();

            // Transition to IDLE after a brief delay
            setTimeout(() => {
                orchestrator.updateAgentState(agentId, AgentState.IDLE);
            }, 3000);

            return agent;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to spawn agent: ${error}`);
            return undefined;
        }
    }

    // ── Orchestration Commands ────────────────────────────────────────────────

    const openDashboardCommand = vscode.commands.registerCommand('tmux-agents.openDashboard', () => {
        dashboardView.show();
        updateDashboard();
    });

    const openGraphCommand = vscode.commands.registerCommand('tmux-agents.openGraph', async () => {
        const pipelines = pipelineEngine.getAllPipelines();
        if (pipelines.length === 0) {
            vscode.window.showInformationMessage('No pipelines defined. Create one first.');
            return;
        }
        const pick = await vscode.window.showQuickPick(
            pipelines.map(p => ({ label: p.name, description: p.description, pipeline: p })),
            { placeHolder: 'Select pipeline to view' }
        );
        if (pick) {
            graphView.show();
            const activeRun = pipelineEngine.getActiveRuns().find(r => r.pipelineId === pick.pipeline.id);
            graphView.setPipeline(pick.pipeline, activeRun);
        }
    });

    const submitTaskCommand = vscode.commands.registerCommand('tmux-agents.submitTask', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Describe the task (AI will route to the right agent)',
            placeHolder: 'e.g., "Review the auth module for security issues"'
        });
        if (!input) { return; }

        vscode.window.showInformationMessage('Routing task...');
        try {
            const task = await taskRouter.parseTaskFromNaturalLanguage(input);
            orchestrator.submitTask(task);
            vscode.window.showInformationMessage(`Task routed to ${task.targetRole} (priority ${task.priority})`);
            updateDashboard();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to route task: ${error}`);
        }
    });

    const spawnAgentCommand = vscode.commands.registerCommand('tmux-agents.spawnAgent', async () => {
        const templates = templateManager.getAllTemplates();
        const pick = await vscode.window.showQuickPick(
            templates.map(t => ({
                label: t.name,
                description: `${t.role} | ${t.aiProvider}`,
                detail: t.description,
                template: t
            })),
            { placeHolder: 'Select agent template' }
        );
        if (!pick) { return; }

        await spawnAgentFromTemplate(pick.template);
    });

    const killAgentCommand = vscode.commands.registerCommand('tmux-agents.killAgent', async () => {
        const agents = orchestrator.getAllAgents();
        if (agents.length === 0) {
            vscode.window.showInformationMessage('No active agents.');
            return;
        }
        const pick = await vscode.window.showQuickPick(
            agents.map(a => ({
                label: a.name,
                description: `${a.role} | ${a.state} | ${a.serverId}`,
                agent: a
            })),
            { placeHolder: 'Select agent to terminate' }
        );
        if (!pick) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Terminate agent "${pick.agent.name}"?`, { modal: true }, 'Terminate'
        );
        if (confirm === 'Terminate') {
            orchestrator.removeAgent(pick.agent.id);
            // Kill the underlying tmux session
            const service = serviceManager.getService(pick.agent.serverId);
            if (service) {
                await service.deleteSession(pick.agent.sessionName);
            }
            tmuxSessionProvider.refresh();
            updateDashboard();
        }
    });

    const createTeamCommand = vscode.commands.registerCommand('tmux-agents.createTeam', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Team name',
            placeHolder: 'e.g., "feature-auth-team"'
        });
        if (!name) { return; }

        const templates = templateManager.getAllTemplates();
        const picks = await vscode.window.showQuickPick(
            templates.map(t => ({
                label: t.name,
                description: `${t.role} | ${t.aiProvider}`,
                template: t,
                picked: false
            })),
            { placeHolder: 'Select agent templates for this team (multi-select)', canPickMany: true }
        );
        if (!picks || picks.length === 0) { return; }

        const team = teamManager.createTeam(name);
        vscode.window.showInformationMessage(`Creating team "${name}" with ${picks.length} agents...`);

        for (const pick of picks) {
            const agent = await spawnAgentFromTemplate(pick.template, team.id);
            if (agent) {
                teamManager.addAgentToTeam(team.id, agent.id);
            }
        }

        updateDashboard();
        vscode.window.showInformationMessage(`Team "${name}" created with ${picks.length} agents.`);
    });

    const createPipelineCommand = vscode.commands.registerCommand('tmux-agents.createPipeline', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Pipeline name',
            placeHolder: 'e.g., "My Development Pipeline"'
        });
        if (!name) { return; }

        const pipeline = pipelineEngine.createPipeline(name);
        graphView.show();
        graphView.setPipeline(pipeline);
        vscode.window.showInformationMessage(`Pipeline "${name}" created. Add stages in the graph view.`);
    });

    const runPipelineCommand = vscode.commands.registerCommand('tmux-agents.runPipeline', async () => {
        const pipelines = pipelineEngine.getAllPipelines();
        if (pipelines.length === 0) {
            vscode.window.showInformationMessage('No pipelines available.');
            return;
        }
        const pick = await vscode.window.showQuickPick(
            pipelines.map(p => ({
                label: p.name,
                description: `${p.stages.length} stages`,
                pipeline: p
            })),
            { placeHolder: 'Select pipeline to run' }
        );
        if (!pick) { return; }

        const run = pipelineEngine.startRun(pick.pipeline.id);
        await advancePipeline(run.id);
        updateDashboard();
        vscode.window.showInformationMessage(`Pipeline "${pick.pipeline.name}" started.`);
    });

    const sendToAgentCommand = vscode.commands.registerCommand('tmux-agents.sendToAgent', async () => {
        const agents = orchestrator.getAllAgents().filter(a => a.state !== AgentState.TERMINATED);
        if (agents.length === 0) {
            vscode.window.showInformationMessage('No active agents.');
            return;
        }
        const agentPick = await vscode.window.showQuickPick(
            agents.map(a => ({ label: a.name, description: `${a.role} | ${a.state}`, agent: a })),
            { placeHolder: 'Select agent' }
        );
        if (!agentPick) { return; }

        const prompt = await vscode.window.showInputBox({
            prompt: `Send prompt to ${agentPick.agent.name}`,
            placeHolder: 'Enter your prompt...'
        });
        if (!prompt) { return; }

        try {
            await orchestrator.sendPromptToAgent(agentPick.agent.id, prompt);
            vscode.window.showInformationMessage(`Prompt sent to ${agentPick.agent.name}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to send prompt: ${error}`);
        }
    });

    const fanOutCommand = vscode.commands.registerCommand('tmux-agents.fanOut', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Task to fan out to multiple agents',
            placeHolder: 'e.g., "Solve this problem and compare approaches"'
        });
        if (!input) { return; }

        const countStr = await vscode.window.showInputBox({
            prompt: 'Number of parallel agents',
            value: '3',
            validateInput: v => /^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) <= 10 ? null : 'Enter 1-10'
        });
        if (!countStr) { return; }

        const count = parseInt(countStr);
        const templates = templateManager.getTemplatesByRole(AgentRole.CODER);
        const template = templates[0];
        if (!template) {
            vscode.window.showErrorMessage('No coder templates available');
            return;
        }

        vscode.window.showInformationMessage(`Spawning ${count} agents for fan-out...`);
        for (let i = 0; i < count; i++) {
            const agent = await spawnAgentFromTemplate(template);
            if (agent) {
                // Wait briefly then send the task
                setTimeout(() => {
                    orchestrator.sendPromptToAgent(agent.id, input).catch(console.error);
                }, 5000);
            }
        }
        updateDashboard();
    });

    const manageTemplatesCommand = vscode.commands.registerCommand('tmux-agents.manageTemplates', async () => {
        const action = await vscode.window.showQuickPick(
            [
                { label: 'View Templates', description: 'List all available templates' },
                { label: 'Create Template', description: 'Create a new agent template' },
                { label: 'Delete Template', description: 'Remove a custom template' }
            ],
            { placeHolder: 'Template management' }
        );
        if (!action) { return; }

        if (action.label === 'View Templates') {
            const templates = templateManager.getAllTemplates();
            const items = templates.map(t => ({
                label: `${templateManager.isBuiltIn(t.id) ? '[Built-in]' : '[Custom]'} ${t.name}`,
                description: `${t.role} | ${t.aiProvider}`,
                detail: t.description
            }));
            await vscode.window.showQuickPick(items, { placeHolder: 'Agent templates' });
        } else if (action.label === 'Create Template') {
            const name = await vscode.window.showInputBox({ prompt: 'Template name' });
            if (!name) { return; }
            const rolePick = await vscode.window.showQuickPick(
                Object.values(AgentRole).map(r => ({ label: r })),
                { placeHolder: 'Agent role' }
            );
            if (!rolePick) { return; }
            const providerPick = await vscode.window.showQuickPick(
                Object.values(AIProvider).map(p => ({ label: p })),
                { placeHolder: 'AI provider' }
            );
            if (!providerPick) { return; }

            templateManager.createTemplate({
                name,
                role: rolePick.label as AgentRole,
                aiProvider: providerPick.label as AIProvider,
                description: `Custom ${rolePick.label} agent with ${providerPick.label}`
            });
            await templateManager.saveToSettings();
            vscode.window.showInformationMessage(`Template "${name}" created.`);
        } else if (action.label === 'Delete Template') {
            const customTemplates = templateManager.getAllTemplates().filter(t => !templateManager.isBuiltIn(t.id));
            if (customTemplates.length === 0) {
                vscode.window.showInformationMessage('No custom templates to delete.');
                return;
            }
            const pick = await vscode.window.showQuickPick(
                customTemplates.map(t => ({ label: t.name, description: t.description, template: t })),
                { placeHolder: 'Select template to delete' }
            );
            if (pick) {
                templateManager.deleteTemplate(pick.template.id);
                await templateManager.saveToSettings();
                vscode.window.showInformationMessage(`Template "${pick.label}" deleted.`);
            }
        }
    });

    const quickTeamCodingCommand = vscode.commands.registerCommand('tmux-agents.quickTeamCoding', async () => {
        const coderTemplate = templateManager.getTemplatesByRole(AgentRole.CODER)[0];
        const reviewerTemplate = templateManager.getTemplatesByRole(AgentRole.REVIEWER)[0];
        const testerTemplate = templateManager.getTemplatesByRole(AgentRole.TESTER)[0];
        if (!coderTemplate || !reviewerTemplate || !testerTemplate) {
            vscode.window.showErrorMessage('Missing required templates (coder, reviewer, tester)');
            return;
        }
        const team = teamManager.createTeam('Coding Team');
        vscode.window.showInformationMessage('Spawning coding team (coder + reviewer + tester)...');
        for (const tmpl of [coderTemplate, reviewerTemplate, testerTemplate]) {
            const agent = await spawnAgentFromTemplate(tmpl, team.id);
            if (agent) { teamManager.addAgentToTeam(team.id, agent.id); }
        }
        const crPipeline = pipelineEngine.getAllPipelines().find(p => p.name === 'Code Review Pipeline');
        if (crPipeline) { teamManager.setPipelineForTeam(team.id, crPipeline.id); }
        updateDashboard();
        vscode.window.showInformationMessage('Coding team ready!');
    });

    const quickTeamResearchCommand = vscode.commands.registerCommand('tmux-agents.quickTeamResearch', async () => {
        const researcherTemplate = templateManager.getTemplatesByRole(AgentRole.RESEARCHER)[0];
        const coderTemplate = templateManager.getTemplatesByRole(AgentRole.CODER)[0];
        if (!researcherTemplate || !coderTemplate) {
            vscode.window.showErrorMessage('Missing required templates (researcher, coder)');
            return;
        }
        const team = teamManager.createTeam('Research Team');
        vscode.window.showInformationMessage('Spawning research team (2 researchers + 1 coder)...');
        for (const tmpl of [researcherTemplate, researcherTemplate, coderTemplate]) {
            const agent = await spawnAgentFromTemplate(tmpl, team.id);
            if (agent) { teamManager.addAgentToTeam(team.id, agent.id); }
        }
        const riPipeline = pipelineEngine.getAllPipelines().find(p => p.name === 'Research & Implement');
        if (riPipeline) { teamManager.setPipelineForTeam(team.id, riPipeline.id); }
        updateDashboard();
        vscode.window.showInformationMessage('Research team ready!');
    });

    const createPipelineNLCommand = vscode.commands.registerCommand('tmux-agents.createPipelineNL', async () => {
        const description = await vscode.window.showInputBox({
            prompt: 'Describe what the pipeline should do',
            placeHolder: 'e.g., "Write code, review it, then test it"'
        });
        if (!description) { return; }
        vscode.window.showInformationMessage('Creating pipeline from description...');
        try {
            const pipeline = await pipelineEngine.createPipelineFromDescription(description);
            graphView.show();
            graphView.setPipeline(pipeline);
            vscode.window.showInformationMessage(`Pipeline "${pipeline.name}" created with ${pipeline.stages.length} stages.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create pipeline: ${error}`);
        }
    });

    const openKanbanCommand = vscode.commands.registerCommand('tmux-agents.openKanban', () => {
        kanbanView.show();
        updateKanban();
    });

    // ── Attach ────────────────────────────────────────────────────────────────

    const attachCommand = vscode.commands.registerCommand('tmux-agents.attach', async (item: TmuxSessionTreeItem | TmuxWindowTreeItem | TmuxPaneTreeItem) => {
        if (!item) {
            vscode.window.showErrorMessage('No item selected for attach');
            return;
        }

        let sessionName: string;
        let itemType: 'session' | 'window' | 'pane' = 'session';
        let service: TmuxService | undefined;

        if (item instanceof TmuxSessionTreeItem) {
            if (!item.session || !item.session.name) {
                vscode.window.showErrorMessage('Invalid session data');
                return;
            }
            sessionName = item.session.name;
            itemType = 'session';
            service = getServiceForItem(serviceManager, item);
        } else if (item instanceof TmuxWindowTreeItem) {
            if (!item.window || !item.window.sessionName) {
                vscode.window.showErrorMessage('Invalid window data');
                return;
            }
            sessionName = item.window.sessionName;
            itemType = 'window';
            service = getServiceForItem(serviceManager, item);
        } else if (item instanceof TmuxPaneTreeItem) {
            if (!item.pane || !item.pane.sessionName) {
                vscode.window.showErrorMessage('Invalid pane data');
                return;
            }
            sessionName = item.pane.sessionName;
            itemType = 'pane';
            service = getServiceForItem(serviceManager, item);
        } else {
            const fallbackItem = item as any;
            if (fallbackItem && typeof fallbackItem.label === 'string') {
                sessionName = fallbackItem.label;
                service = serviceManager.getService('local');
            } else {
                vscode.window.showErrorMessage('Unknown item type for attach operation');
                return;
            }
        }

        if (!service) {
            vscode.window.showErrorMessage('Could not find server for this item');
            return;
        }

        const terminal = await smartAttachment.attachToSession(service, sessionName, {
            windowIndex: itemType === 'window' ? (item as TmuxWindowTreeItem).window.index :
                         itemType === 'pane' ? (item as TmuxPaneTreeItem).pane.windowIndex : undefined,
            paneIndex: itemType === 'pane' ? (item as TmuxPaneTreeItem).pane.index : undefined
        });
        terminal.show();
    });

    // ── Refresh & Toggle ──────────────────────────────────────────────────────

    const refreshCommand = vscode.commands.registerCommand('tmux-agents.refresh', async () => {
        for (const service of serviceManager.getAllServices()) {
            service.clearCache();
        }
        tmuxSessionProvider.refresh();
    });

    const toggleAutoRefreshCommand = vscode.commands.registerCommand('tmux-agents.toggleAutoRefresh', () => {
        tmuxSessionProvider.toggleAutoRefresh();
    });

    // ── Rename ────────────────────────────────────────────────────────────────

    const renameCommand = vscode.commands.registerCommand('tmux-agents.rename', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for rename operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const oldName = item.session.name;

        const newName = await vscode.window.showInputBox({
            prompt: `Rename tmux session "${oldName}"`,
            value: oldName,
            validateInput: value => value ? null : 'Session name cannot be empty.'
        });

        if (newName && newName !== oldName) {
            await service.renameSession(oldName, newName);
            tmuxSessionProvider.refresh();
        }
    });

    const renameWindowCommand = vscode.commands.registerCommand('tmux-agents.renameWindow', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window || !item.window.sessionName || !item.window.index) {
            vscode.window.showErrorMessage('Invalid window data for rename operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, index, name } = item.window;
        const oldName = name;

        const newName = await vscode.window.showInputBox({
            prompt: `Rename window "${index}:${oldName}" in session "${sessionName}"`,
            value: oldName,
            validateInput: value => {
                if (!value || value.trim() === '') {
                    return 'Window name cannot be empty.';
                }
                return null;
            }
        });

        if (newName && newName !== oldName) {
            try {
                await service.renameWindow(sessionName, index, newName);
                tmuxSessionProvider.refresh();
            } catch (error) {
                // Error is already shown by the service
            }
        }
    });

    // ── New Session ───────────────────────────────────────────────────────────

    const newCommand = vscode.commands.registerCommand('tmux-agents.new', async (item?: TmuxServerTreeItem) => {
        let service: TmuxService | undefined;

        if (item instanceof TmuxServerTreeItem) {
            service = serviceManager.getService(item.server.id);
        } else {
            service = await pickService(serviceManager);
        }

        if (!service) { return; }

        const sessions = await service.getSessions();
        let nextId = 0;
        while (sessions.includes(String(nextId))) {
            nextId++;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new session name',
            value: String(nextId),
            validateInput: value => {
                if (!value) return 'Session name cannot be empty.';
                if (sessions.includes(value)) return `Session name "${value}" already exists.`;
                return null;
            }
        });

        if (newName) {
            try {
                await service.newSession(newName);
                tmuxSessionProvider.refresh();
                const terminal = await smartAttachment.attachToSession(service, newName);
                terminal.show();
            } catch (error) {
                // Error is already shown by the service
            }
        }
    });

    // ── Delete Session ────────────────────────────────────────────────────────

    const deleteCommand = vscode.commands.registerCommand('tmux-agents.delete', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for delete operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const sessionName = item.session.name;

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the tmux session "${sessionName}"?`,
            { modal: true },
            'Delete'
        );

        if (confirmation === 'Delete') {
            await service.deleteSession(sessionName);
            tmuxSessionProvider.refresh();
        }
    });

    // ── Kill Window ───────────────────────────────────────────────────────────

    const killWindowCommand = vscode.commands.registerCommand('tmux-agents.kill-window', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window) {
            vscode.window.showErrorMessage('Invalid window data for kill operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, index, name } = item.window;

        if (!sessionName || !index) {
            vscode.window.showErrorMessage('Missing window information');
            return;
        }
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to kill window "${index}:${name}"?`,
            { modal: true },
            'Kill Window'
        );

        if (confirmation === 'Kill Window') {
            await service.killWindow(sessionName, index);
            tmuxSessionProvider.refresh();
        }
    });

    // ── Kill Pane ─────────────────────────────────────────────────────────────

    const killPaneCommand = vscode.commands.registerCommand('tmux-agents.kill-pane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for kill operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, windowIndex, index, command } = item.pane;

        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information');
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to kill pane "${index}: ${command || 'unknown'}"?`,
            { modal: true },
            'Kill Pane'
        );

        if (confirmation === 'Kill Pane') {
            await service.killPane(sessionName, windowIndex, index);
            tmuxSessionProvider.refresh();
        }
    });

    // ── New Window ────────────────────────────────────────────────────────────

    const newWindowCommand = vscode.commands.registerCommand('tmux-agents.newWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for new window operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const sessionName = item.session.name;
        const windowName = await vscode.window.showInputBox({
            prompt: `Enter name for new window in session "${sessionName}"`,
            placeHolder: 'Leave empty for default name',
            validateInput: () => null
        });

        if (windowName === undefined) {
            return;
        }

        try {
            const finalWindowName = windowName.trim() || undefined;
            await service.newWindow(sessionName, finalWindowName);
            tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── Split Pane ────────────────────────────────────────────────────────────

    const splitPaneRightCommand = vscode.commands.registerCommand('tmux-agents.splitPaneRight', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const targetPane = `${sessionName}:${windowIndex}.${index}`;
        await service.splitPane(targetPane, 'h');
        tmuxSessionProvider.refresh();
    });

    const splitPaneDownCommand = vscode.commands.registerCommand('tmux-agents.splitPaneDown', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const targetPane = `${sessionName}:${windowIndex}.${index}`;
        await service.splitPane(targetPane, 'v');
        tmuxSessionProvider.refresh();
    });

    // ── Inline New Window ─────────────────────────────────────────────────────

    const inlineNewWindowCommand = vscode.commands.registerCommand('tmux-agents.inline.newWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for new window operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const sessionName = item.session.name;
        const windowName = await vscode.window.showInputBox({
            prompt: `Enter name for new window in session "${sessionName}"`,
            placeHolder: 'Leave empty for default name',
            validateInput: () => null
        });

        if (windowName === undefined) {
            return;
        }

        try {
            const finalWindowName = windowName.trim() || undefined;
            await service.newWindow(sessionName, finalWindowName);
            tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── Inline Split Pane ─────────────────────────────────────────────────────

    const inlineSplitPaneCommand = vscode.commands.registerCommand('tmux-agents.inline.splitPane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const choice = await vscode.window.showQuickPick(['Split Right', 'Split Down'], {
            placeHolder: 'Select split direction'
        });

        if (choice) {
            const direction = choice === 'Split Right' ? 'h' : 'v';
            const targetPane = `${sessionName}:${windowIndex}.${index}`;
            await service.splitPane(targetPane, direction);
            tmuxSessionProvider.refresh();
        }
    });

    // ── Rename Pane ────────────────────────────────────────────────────────────

    const renamePaneCommand = vscode.commands.registerCommand('tmux-agents.renamePane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for rename operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, windowIndex, index, command } = item.pane;

        const newTitle = await vscode.window.showInputBox({
            prompt: `Rename pane ${index} (${command})`,
            value: command,
            validateInput: value => value ? null : 'Pane title cannot be empty.'
        });

        if (newTitle && newTitle !== command) {
            try {
                const escaped = newTitle.replace(/"/g, '\\"');
                await service.sendKeys(sessionName, windowIndex, index, '');
                // Use select-pane -T to set pane title
                const target = `${sessionName}:${windowIndex}.${index}`;
                const cmd = `tmux select-pane -t "${target}" -T "${escaped}"`;
                await execAsync(cmd, { timeout: 5000 });
                tmuxSessionProvider.refresh();
                vscode.window.showInformationMessage(`Pane ${index} renamed to "${newTitle}"`);
            } catch {
                vscode.window.showErrorMessage(`Failed to rename pane ${index}`);
            }
        }
    });

    // ── Add Pane to Window ───────────────────────────────────────────────────

    const addPaneToWindowCommand = vscode.commands.registerCommand('tmux-agents.addPaneToWindow', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window) {
            vscode.window.showErrorMessage('Invalid window data for add pane operation');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const { sessionName, index: windowIndex, panes } = item.window;
        if (!sessionName || !windowIndex) {
            vscode.window.showErrorMessage('Missing window information');
            return;
        }

        const choice = await vscode.window.showQuickPick(['Split Right', 'Split Down'], {
            placeHolder: 'Select split direction for new pane'
        });

        if (choice) {
            // Split the active pane in this window (last active or first)
            const activePaneIndex = panes.find(p => p.isActive)?.index || panes[0]?.index || '0';
            const direction = choice === 'Split Right' ? 'h' : 'v';
            const targetPane = `${sessionName}:${windowIndex}.${activePaneIndex}`;
            await service.splitPane(targetPane, direction);
            tmuxSessionProvider.refresh();
        }
    });

    // ── Test Connection ───────────────────────────────────────────────────────

    const testConnectionCommand = vscode.commands.registerCommand('tmux-agents.testConnection', async (item: TmuxServerTreeItem) => {
        if (!item || item.server.isLocal) {
            vscode.window.showInformationMessage('Local server is always available.');
            return;
        }
        const service = serviceManager.getService(item.server.id);
        if (service) {
            service.resetConnectionState();
            try {
                await service.getTmuxTreeFresh();
                vscode.window.showInformationMessage(`Connected to ${item.server.label} successfully.`);
            } catch {
                // Error message already shown by service
            }
            tmuxSessionProvider.refresh();
        }
    });

    // ── Open Server Terminal ────────────────────────────────────────────────────

    const openServerTerminalCommand = vscode.commands.registerCommand('tmux-agents.openServerTerminal', async (item: TmuxServerTreeItem) => {
        if (!item) { return; }

        const service = serviceManager.getService(item.server.id);
        if (!service) { return; }

        const terminalName = `tmux-mgr:${item.server.label}`;

        // Kill existing terminal with same name
        for (const t of vscode.window.terminals) {
            if (t.name === terminalName) {
                t.dispose();
            }
        }

        if (item.server.isLocal) {
            // Local: open a plain terminal in the editor area
            const terminal = vscode.window.createTerminal({
                name: terminalName,
                location: vscode.TerminalLocation.Editor
            });
            terminal.show();
        } else {
            // Remote: SSH into the server
            const sshCommand = service.buildSshCommand();
            if (sshCommand) {
                const terminal = vscode.window.createTerminal({
                    name: terminalName,
                    location: vscode.TerminalLocation.Editor,
                    shellPath: '/usr/bin/env',
                    shellArgs: ['bash', '--norc', '--noprofile', '-c', sshCommand]
                });
                terminal.show();
            }
        }
    });

    // ── Configure Servers ─────────────────────────────────────────────────────

    const configureServersCommand = vscode.commands.registerCommand('tmux-agents.configureServers', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'tmuxAgents.sshServers');
    });

    // ── AI Session Commands ───────────────────────────────────────────────────

    const newClaudeSessionCommand = vscode.commands.registerCommand('tmux-agents.newClaudeSession', async () => {
        await createAISessionCommand(AIProvider.CLAUDE, serviceManager, aiManager, smartAttachment, tmuxSessionProvider);
    });

    const newGeminiSessionCommand = vscode.commands.registerCommand('tmux-agents.newGeminiSession', async () => {
        await createAISessionCommand(AIProvider.GEMINI, serviceManager, aiManager, smartAttachment, tmuxSessionProvider);
    });

    const newCodexSessionCommand = vscode.commands.registerCommand('tmux-agents.newCodexSession', async () => {
        await createAISessionCommand(AIProvider.CODEX, serviceManager, aiManager, smartAttachment, tmuxSessionProvider);
    });

    // ── New AI Window (on session) ────────────────────────────────────────────

    const newAIWindowCommand = vscode.commands.registerCommand('tmux-agents.newAIWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for AI window');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const providerChoice = await vscode.window.showQuickPick(
            [
                { label: 'Claude', provider: AIProvider.CLAUDE },
                { label: 'Gemini', provider: AIProvider.GEMINI },
                { label: 'Codex', provider: AIProvider.CODEX }
            ],
            { placeHolder: 'Select AI provider' }
        );
        if (!providerChoice) { return; }

        const sessionName = item.session.name;
        const windowName = `${providerChoice.label.toLowerCase()}-ai`;

        try {
            await service.newWindow(sessionName, windowName);
            service.clearCache();

            // Get the newly created window to find its index
            const sessions = await service.getTmuxTreeFresh();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
                const newWindow = session.windows.find(w => w.name === windowName);
                if (newWindow) {
                    const launchCmd = aiManager.getLaunchCommand(providerChoice.provider);
                    await service.sendKeys(sessionName, newWindow.index, '0', launchCmd);
                }
            }

            tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── New AI Pane (on pane) ─────────────────────────────────────────────────

    const newAIPaneCommand = vscode.commands.registerCommand('tmux-agents.newAIPane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for AI pane');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const providerChoice = await vscode.window.showQuickPick(
            [
                { label: 'Claude', provider: AIProvider.CLAUDE },
                { label: 'Gemini', provider: AIProvider.GEMINI },
                { label: 'Codex', provider: AIProvider.CODEX }
            ],
            { placeHolder: 'Select AI provider' }
        );
        if (!providerChoice) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        const targetPane = `${sessionName}:${windowIndex}.${index}`;

        try {
            await service.splitPane(targetPane, 'h');
            service.clearCache();

            // Get fresh tree to find the newly created pane
            const sessions = await service.getTmuxTreeFresh();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
                const win = session.windows.find(w => w.index === windowIndex);
                if (win && win.panes.length > 0) {
                    // The new pane is typically the last one
                    const newPane = win.panes[win.panes.length - 1];
                    const launchCmd = aiManager.getLaunchCommand(providerChoice.provider);
                    await service.sendKeys(sessionName, windowIndex, newPane.index, launchCmd);
                }
            }

            tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── Fork AI Session ───────────────────────────────────────────────────────

    const forkAISessionCommand = vscode.commands.registerCommand('tmux-agents.forkAISession', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for fork');
            return;
        }

        const service = getServiceForItem(serviceManager, item);
        if (!service) { return; }

        const sessionName = item.session.name;

        // Detect the AI provider from the first pane's command
        let provider: AIProvider | null = null;
        if (item.session.windows.length > 0 && item.session.windows[0].panes.length > 0) {
            provider = aiManager.detectAIProvider(item.session.windows[0].panes[0].command);
        }

        if (!provider) {
            const providerChoice = await vscode.window.showQuickPick(
                [
                    { label: 'Claude', provider: AIProvider.CLAUDE },
                    { label: 'Gemini', provider: AIProvider.GEMINI },
                    { label: 'Codex', provider: AIProvider.CODEX }
                ],
                { placeHolder: 'Select AI provider for fork' }
            );
            if (!providerChoice) { return; }
            provider = providerChoice.provider;
        }

        const forkName = `${sessionName}-fork`;
        const sessions = await service.getSessions();

        // Find a unique fork name
        let finalForkName = forkName;
        let counter = 2;
        while (sessions.includes(finalForkName)) {
            finalForkName = `${forkName}-${counter}`;
            counter++;
        }

        try {
            await service.newSession(finalForkName);

            const forkCmd = aiManager.getForkCommand(provider, sessionName);
            await service.sendKeysToSession(finalForkName, forkCmd);

            tmuxSessionProvider.refresh();

            const terminal = await smartAttachment.attachToSession(service, finalForkName);
            terminal.show();
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── Hotkey Jump ───────────────────────────────────────────────────────────

    const hotkeyJumpCommand = vscode.commands.registerCommand('tmux-agents.hotkeyJump', async () => {
        // Gather all sessions from all services
        const allSessions: TmuxSession[] = [];
        for (const service of serviceManager.getAllServices()) {
            try {
                const sessions = await service.getTmuxTree();
                allSessions.push(...sessions);
            } catch {
                // Skip services with errors
            }
        }

        if (allSessions.length === 0) {
            vscode.window.showInformationMessage('No tmux sessions found.');
            return;
        }

        const assignedSessions = hotkeyManager.assignHotkeys(allSessions);
        const assignments = hotkeyManager.getAllAssignments(assignedSessions);

        const items = assignments.map(a => {
            let label: string;
            if (a.type === 'session') {
                label = `[${a.key}] session: ${a.sessionName}`;
            } else if (a.type === 'window') {
                label = `[${a.key}] window: ${a.windowIndex}`;
            } else {
                label = `[${a.key}] pane: ${a.windowIndex}:${a.paneIndex}`;
            }
            return {
                label,
                description: a.type === 'session' ? '' : `in ${a.sessionName}`,
                assignment: a
            };
        });

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Jump to session/window/pane (hotkey)'
        });

        if (!pick) { return; }

        const a = pick.assignment;
        const service = serviceManager.getService(a.serverId);
        if (!service) {
            vscode.window.showErrorMessage('Could not find server for this item');
            return;
        }

        const terminal = await smartAttachment.attachToSession(service, a.sessionName, {
            windowIndex: a.windowIndex,
            paneIndex: a.paneIndex
        });
        terminal.show();
    });

    // ── Rename AI (AI-assisted rename) ────────────────────────────────────────

    const renameAICommand = vscode.commands.registerCommand('tmux-agents.renameAI', async (item: TmuxSessionTreeItem | TmuxWindowTreeItem) => {
        if (!item) {
            vscode.window.showErrorMessage('No item selected for AI rename');
            return;
        }

        let service: TmuxService | undefined;
        let sessionName: string;
        let windowIndex: string;
        let paneIndex: string;
        let isSession: boolean;
        let oldName: string;

        if (item instanceof TmuxSessionTreeItem) {
            if (!item.session || !item.session.name) {
                vscode.window.showErrorMessage('Invalid session data');
                return;
            }
            service = getServiceForItem(serviceManager, item);
            sessionName = item.session.name;
            oldName = sessionName;
            isSession = true;
            // Use first window, first pane
            windowIndex = item.session.windows[0]?.index || '0';
            paneIndex = item.session.windows[0]?.panes[0]?.index || '0';
        } else if (item instanceof TmuxWindowTreeItem) {
            if (!item.window || !item.window.sessionName) {
                vscode.window.showErrorMessage('Invalid window data');
                return;
            }
            service = getServiceForItem(serviceManager, item);
            sessionName = item.window.sessionName;
            oldName = item.window.name;
            isSession = false;
            windowIndex = item.window.index;
            paneIndex = item.window.panes[0]?.index || '0';
        } else {
            vscode.window.showErrorMessage('AI rename only works on sessions and windows');
            return;
        }

        if (!service) { return; }

        // Capture last N lines from pane
        const captureConfig = serviceManager.getPaneCaptureConfig();
        const lines = captureConfig.lines || 50;
        const content = await service.capturePaneContent(sessionName, windowIndex, paneIndex, lines);
        const lastLines = content.trim().split('\n').slice(-lines).join('\n').slice(0, 500);

        let suggestedName = oldName;

        if (lastLines.length > 0) {
            vscode.window.showInformationMessage('Generating AI name...');

            try {
                const escaped = lastLines.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                const { stdout } = await execAsync(
                    `claude --print "Based on this terminal output, generate a short name (3 words or less, no quotes, no explanation, just the name):\\n${escaped}"`,
                    { timeout: 15000 }
                );
                const aiName = stdout.trim().split('\n')[0].trim();
                if (aiName && aiName.length > 0 && aiName.length < 50) {
                    suggestedName = aiName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                }
            } catch {
                // Claude CLI not available or failed, fall back to regular rename
            }
        }

        if (!suggestedName || suggestedName === oldName) {
            vscode.window.showWarningMessage('AI could not generate a new name');
            return;
        }

        try {
            if (isSession) {
                await service.renameSession(oldName, suggestedName);
            } else {
                await service.renameWindow(sessionName, windowIndex, suggestedName);
            }
            tmuxSessionProvider.refresh();
            vscode.window.showInformationMessage(`Renamed "${oldName}" → "${suggestedName}"`);
        } catch (error) {
            // Error is already shown by the service
        }
    });

    // ── Register All ──────────────────────────────────────────────────────────

    context.subscriptions.push(
        // Existing commands
        attachCommand,
        refreshCommand,
        toggleAutoRefreshCommand,
        renameCommand,
        renameWindowCommand,
        newCommand,
        deleteCommand,
        killWindowCommand,
        killPaneCommand,
        newWindowCommand,
        splitPaneRightCommand,
        splitPaneDownCommand,
        inlineNewWindowCommand,
        inlineSplitPaneCommand,
        testConnectionCommand,
        openServerTerminalCommand,
        configureServersCommand,
        newClaudeSessionCommand,
        newGeminiSessionCommand,
        newCodexSessionCommand,
        newAIWindowCommand,
        newAIPaneCommand,
        forkAISessionCommand,
        hotkeyJumpCommand,
        renameAICommand,
        renamePaneCommand,
        addPaneToWindowCommand,
        // Orchestration commands
        openDashboardCommand,
        openGraphCommand,
        submitTaskCommand,
        spawnAgentCommand,
        killAgentCommand,
        createTeamCommand,
        createPipelineCommand,
        runPipelineCommand,
        sendToAgentCommand,
        fanOutCommand,
        manageTemplatesCommand,
        quickTeamCodingCommand,
        quickTeamResearchCommand,
        createPipelineNLCommand,
        openKanbanCommand,
        // Event subscriptions
        agentStateChangedDisposable,
        taskCompletedDisposable,
        dashboardActionDisposable,
        graphActionDisposable,
        kanbanActionDisposable,
        // Disposables
        { dispose: () => clearInterval(autoMonitorTimer) },
        { dispose: () => database.close() },
        serviceManager,
        tmuxSessionProvider,
        orchestrator,
        pipelineEngine,
        teamManager,
        dashboardView,
        graphView,
        kanbanView
    );
}

export function deactivate() {}
