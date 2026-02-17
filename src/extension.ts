import * as vscode from 'vscode';
import { TmuxSessionProvider, TmuxSessionTreeItem, TmuxWindowTreeItem, TmuxPaneTreeItem, ShortcutsProvider } from './treeProvider';
import { TmuxService } from './tmuxService';
import { TmuxServiceManager } from './serviceManager';
import { SmartAttachmentService } from './smartAttachment';
import { AIAssistantManager } from './core/aiAssistant';
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
import { DaemonBridge } from './daemonBridge';
import { AIProvider, AgentRole, TaskStatus, OrchestratorTask, KanbanSwimLane, FavouriteFolder, StageType } from './types';
import { handleKanbanMessage, triggerDependents } from './commands/kanbanHandlers';
import { registerSessionCommands } from './commands/sessionCommands';
import { registerAgentCommands } from './commands/agentCommands';
import { buildTaskWindowName } from './core/taskLauncher';
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

    // ── VS Code Local toggle ─────────────────────────────────────────────────
    // Restore persisted state
    const savedShowLocal = context.globalState.get<boolean>('tmuxAgents.showVscodeLocal', false);
    serviceManager.setShowVscodeLocal(savedShowLocal);
    vscode.commands.executeCommand('setContext', 'tmuxAgents.showVscodeLocal', savedShowLocal);

    const toggleVscodeLocalCmd = vscode.commands.registerCommand('tmux-agents.toggleVscodeLocal', () => {
        const next = !serviceManager.showVscodeLocal;
        serviceManager.setShowVscodeLocal(next);
        context.globalState.update('tmuxAgents.showVscodeLocal', next);
        vscode.commands.executeCommand('setContext', 'tmuxAgents.showVscodeLocal', next);
    });

    // Refresh tree whenever services change (daemon runtimes fetched, toggle, etc.)
    serviceManager.onServicesChanged(() => {
        tmuxSessionProvider.refresh();
    });

    // ── Orchestration System ─────────────────────────────────────────────────

    const orchestrator = new AgentOrchestrator();
    orchestrator.setServiceManager(serviceManager);

    const taskRouter = new TaskRouter();
    const pipelineEngine = new PipelineEngine();
    const templateManager = new AgentTemplateManager();
    const teamManager = new TeamManager();
    const organizationManager = new OrganizationManager();
    const guildManager = new GuildManager();

    // ── Database (via Daemon Bridge) ────────────────────────────────────────
    // DaemonBridge extends Database: when the daemon is running, tasks and
    // swim lanes are proxied through the daemon so the TUI sees the same data.
    // When the daemon is not running, everything falls back to local DB.
    const dataDir = (() => {
        const raw = vscode.workspace.getConfiguration('tmuxAgents').get<string>('dataDir') || '~/.tmux-agents';
        return raw.replace(/^~(?=\/|$)/, require('os').homedir());
    })();
    const dbPath = require('path').join(dataDir, 'data.db');
    const daemonUrl = vscode.workspace.getConfiguration('tmuxAgents').get<string>('daemonUrl', '');
    const daemonClient = daemonUrl
        ? (() => {
            const { DaemonClient } = require('./client/daemonClient');
            const host = daemonUrl.includes('://') ? daemonUrl : `http://${daemonUrl}`;
            const url = new URL(host);
            const httpEndpoint = url.toString().replace(/\/$/, '');
            const wsPort = (parseInt(url.port || '3456') + 1).toString();
            const wsEndpoint = `ws://${url.hostname}:${wsPort}`;
            console.log(`[TmuxAgents] Remote daemon: HTTP=${httpEndpoint}  WS=${wsEndpoint}`);
            return new DaemonClient({
                httpUrl: httpEndpoint,
                wsUrl: wsEndpoint,
                preferUnixSocket: false,
            });
        })()
        : undefined;
    const database = new DaemonBridge(dbPath, daemonClient);

    // ── Fetch runtimes from daemon ─────────────────────────────────────────
    // Pull the daemon's runtime list and populate VS Code services from it.
    // Server aliases map daemon runtime IDs to VS Code SSH config aliases,
    // so VS Code can reach the same machines through its own SSH config.
    async function fetchDaemonRuntimes(): Promise<void> {
        try {
            const runtimes = await database.rpcClient.call('runtime.list', {});
            const aliases = vscode.workspace.getConfiguration('tmuxAgents').get<Record<string, string>>('serverAliases') || {};
            serviceManager.updateFromDaemonRuntimes(runtimes, aliases);
        } catch (err: any) {
            console.warn('[Extension] Failed to fetch runtimes from daemon:', err.message);
        }
    }

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
            log(`Connecting to ${daemonUrl ? `remote daemon at ${daemonUrl}` : 'local daemon'}...`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dataDir));
            await database.initialize();
            log(database.isDaemonConnected
                ? `Connected to daemon (all data via ${daemonUrl || 'unix socket'})`
                : `Daemon unreachable, using local DB fallback: ${dbPath}`);

            // Populate services from daemon's runtime list
            await fetchDaemonRuntimes();

            // Migrate from old VS Code globalStorage location if new DB is empty
            const oldDbPath = require('path').join(context.globalStorageUri.fsPath, 'tmux-agents.db');
            if (database.getAllSwimLanes().length === 0 && database.getAllTasks().length === 0) {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(oldDbPath) && oldDbPath !== dbPath) {
                        const oldDb = new Database(oldDbPath);
                        await oldDb.initialize();
                        const oldLanes = oldDb.getAllSwimLanes();
                        const oldTasks = oldDb.getAllTasks();
                        const oldFavs = oldDb.getAllFavouriteFolders();
                        if (oldLanes.length > 0 || oldTasks.length > 0) {
                            for (const lane of oldLanes) { database.saveSwimLane(lane); }
                            for (const task of oldTasks) { database.saveTask(task); }
                            for (const fav of oldFavs) { database.saveFavouriteFolder(fav); }
                            console.log(`Migrated ${oldLanes.length} lanes, ${oldTasks.length} tasks from old database`);
                        }
                        oldDb.close();
                    }
                } catch (err) {
                    console.warn('Migration from old database location failed:', err);
                }
            }

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

            updateKanban();
            updateDashboard();
            const mode = database.isDaemonConnected ? 'daemon (shared)' : 'local DB (standalone)';
            console.log(`tmux-agents: Database loaded successfully [${mode}]`);
            if (!database.isDaemonConnected) {
                const hint = daemonUrl
                    ? `Check that the daemon is running on ${daemonUrl} and the port is open.`
                    : 'Start the daemon with: tmux-agents daemon start';
                vscode.window.showWarningMessage(
                    `tmux-agents: Daemon not reachable (${daemonUrl || 'local socket'}). ${hint}`,
                    'Dismiss'
                );
            }

            // Register warning callback so connection issues surface in VS Code
            database.onWarning((message) => {
                vscode.window.showWarningMessage(`tmux-agents: ${message}`, 'Dismiss');
            });

            // Register sync callback so external changes (from TUI) refresh the UI
            database.onSync(() => {
                // Refresh swim lanes
                swimLanes.length = 0;
                for (const lane of database.getAllSwimLanes()) {
                    swimLanes.push(lane);
                }
                // Refresh favourite folders
                favouriteFolders.length = 0;
                for (const fav of database.getAllFavouriteFolders()) {
                    favouriteFolders.push(fav);
                }
                // Refresh tasks in orchestrator from DB
                const dbTasks = database.getAllTasks();
                const existingIds = new Set(orchestrator.getTaskQueue().map(t => t.id));
                const dbIds = new Set(dbTasks.map(t => t.id));
                for (const task of dbTasks) {
                    if (existingIds.has(task.id)) {
                        const existing = orchestrator.getTask(task.id);
                        if (existing) { Object.assign(existing, task); }
                    } else {
                        orchestrator.submitTask(task);
                    }
                }
                for (const id of existingIds) {
                    if (!dbIds.has(id)) { orchestrator.cancelTask(id); }
                }
                updateKanban();
                updateDashboard();
            });
        } catch (error) {
            log(`[ERROR] Failed to load database: ${error}`);
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
        // Daemon handles verification and dependent launching
        updateKanban();
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
            case 'detachFromTask': {
                const task = orchestrator.getTask(payload.taskId);
                if (!task?.tmuxSessionName) {
                    break;
                }
                const baseName = `tmux: ${task.tmuxSessionName}`;
                for (const t of vscode.window.terminals) {
                    if (t.name === baseName || t.name.startsWith(baseName)) {
                        t.dispose();
                    }
                }
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

    // ── startTaskFlow: launch a task via daemon RPC ────────────────────────
    async function startTaskFlow(
        t: OrchestratorTask,
        options?: { additionalInstructions?: string; askForContext?: boolean }
    ): Promise<void> {
        const client = database.getClient();
        if (client) {
            await client.call('kanban.startTask', {
                taskId: t.id,
                additionalInstructions: options?.additionalInstructions,
                askForContext: options?.askForContext,
            });
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
        // Exclude vscode-local from kanban servers — it's for tree view browsing only,
        // the daemon doesn't know about it and can't run tasks on it.
        const servers = serviceManager.getAllServices()
            .filter(s => s.serverId !== 'vscode-local')
            .map(s => ({ id: s.serverId, label: s.serverLabel }));
        kanbanView.updateState(orchestrator.getTaskQueue(), swimLanes, servers, favouriteFolders);
    }

    // Subscribe to daemon events for UI notifications
    function subscribeToDaemonEvents(): void {
        const client = database.getClient();
        if (!client) { return; }
        client.subscribe((event: string, data?: any) => {
            if (event === 'task.completed') {
                const desc = data?.description?.slice(0, 50) || data?.taskId || 'unknown';
                vscode.window.showInformationMessage(`Task completed: ${desc}`);
                updateKanban();
                updateDashboard();
            }
            if (event === 'task.moved') {
                updateKanban();
                updateDashboard();
            }
            if (event === 'task.updated') {
                updateKanban();
            }
            if (event === 'task.autoclose.completed') {
                updateKanban();
            }
            if (event === 'task.verification.started') {
                updateKanban();
            }
        });
    }

    // Subscribe to daemon events
    subscribeToDaemonEvents();

    // ── Daemon Connection Status Bar ──────────────────────────────────────
    const daemonStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    daemonStatusBar.command = 'tmux-agents.reconnectDaemon';

    function updateDaemonStatusBar(connected: boolean): void {
        if (connected) {
            daemonStatusBar.text = '$(plug) Daemon Connected';
            daemonStatusBar.backgroundColor = undefined;
            daemonStatusBar.tooltip = 'tmux-agents daemon is connected. Click to reconnect.';
        } else {
            daemonStatusBar.text = '$(warning) Daemon Disconnected';
            daemonStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            daemonStatusBar.tooltip = 'tmux-agents daemon is disconnected. Click to reconnect.';
        }
        daemonStatusBar.show();
    }

    updateDaemonStatusBar(database.isDaemonConnected);

    const reconnectCmd = vscode.commands.registerCommand('tmux-agents.reconnectDaemon', async () => {
        daemonStatusBar.text = '$(sync~spin) Reconnecting...';
        const success = await database.reconnect();
        if (success) {
            vscode.window.showInformationMessage('tmux-agents: Reconnected to daemon');
        } else {
            vscode.window.showWarningMessage('tmux-agents: Failed to reconnect — daemon may not be running');
        }
        updateDaemonStatusBar(database.isDaemonConnected);
    });

    // Handle connection state changes
    database.onConnectionChange((connected) => {
        if (connected) {
            subscribeToDaemonEvents();
            fetchDaemonRuntimes(); // Re-fetch runtimes on reconnect
        }
        updateDaemonStatusBar(connected);
    });

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
        // VS Code local toggle + Daemon status bar + reconnect command
        toggleVscodeLocalCmd,
        reconnectCmd,
        daemonStatusBar,
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
        // (daemon handles all monitoring)
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
        kanbanView,
    );

    log('Tmux Agents activated successfully');
}

export function deactivate() {}
