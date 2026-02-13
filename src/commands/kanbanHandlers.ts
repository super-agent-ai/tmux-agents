import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import { TmuxServiceManager } from '../serviceManager';
import { TmuxSessionProvider } from '../treeProvider';
import { SmartAttachmentService } from '../smartAttachment';
import { AIAssistantManager } from '../aiAssistant';
import { AgentOrchestrator } from '../orchestrator';
import { TeamManager } from '../teamManager';
import { KanbanViewProvider } from '../kanbanView';
import { Database } from '../database';
import { OrchestratorTask, TaskStatus, KanbanSwimLane, FavouriteFolder, TaskStatusHistoryEntry, TaskComment, applySwimLaneDefaults, resolveToggle } from '../types';
import { markDoneTimestamp, cancelAutoClose } from '../autoCloseMonitor';
import { buildBundleTaskPrompt, buildDebugPrompt, appendPromptTail } from '../promptBuilder';

export interface KanbanHandlerContext {
    serviceManager: TmuxServiceManager;
    tmuxSessionProvider: TmuxSessionProvider;
    smartAttachment: SmartAttachmentService;
    aiManager: AIAssistantManager;
    orchestrator: AgentOrchestrator;
    teamManager: TeamManager;
    kanbanView: KanbanViewProvider;
    database: Database;
    swimLanes: KanbanSwimLane[];
    favouriteFolders: FavouriteFolder[];
    updateKanban: () => void;
    updateDashboard: () => Promise<void>;
    ensureLaneSession: (lane: KanbanSwimLane) => Promise<boolean>;
    startTaskFlow: (task: OrchestratorTask, options?: { additionalInstructions?: string; askForContext?: boolean }) => Promise<void>;
    buildTaskWindowName: (task: OrchestratorTask) => string;
    cleanupInitWindow: (serverId: string, sessionName: string) => Promise<void>;
}

function safeCwd(dir?: string): string | undefined {
    if (!dir) { return undefined; }
    try { return fs.existsSync(dir) ? dir : undefined; } catch { return undefined; }
}

export async function triggerDependents(ctx: KanbanHandlerContext, completedTaskId: string): Promise<void> {
    const allTasks = ctx.orchestrator.getTaskQueue();
    for (const task of allTasks) {
        if (!task.dependsOn || !task.dependsOn.includes(completedTaskId)) { continue; }
        const allMet = task.dependsOn.every(depId => {
            const dep = ctx.orchestrator.getTask(depId);
            return dep && dep.status === TaskStatus.COMPLETED;
        });
        const lane = task.swimLaneId ? ctx.swimLanes.find(l => l.id === task.swimLaneId) : undefined;
        const effectiveAutoStart = resolveToggle(task, 'autoStart', lane);
        if (allMet && effectiveAutoStart && (task.kanbanColumn === 'todo' || task.kanbanColumn === 'backlog') && task.swimLaneId) {
            task.kanbanColumn = 'todo';
            ctx.database.saveTask(task);
            await ctx.startTaskFlow(task);
        }
    }
    ctx.updateKanban();
}

export async function handleKanbanMessage(
    action: string,
    payload: any,
    ctx: KanbanHandlerContext
): Promise<void> {
    switch (action) {
        case 'browseDir': {
            const browseServerId = payload.serverId || 'local';
            const browseService = ctx.serviceManager.getService(browseServerId);
            const startPath = payload.currentPath || '~/';

            if (!browseService || browseService.serverIdentity.isLocal) {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    canSelectFiles: false,
                    canSelectFolders: true,
                    openLabel: 'Select Directory',
                });
                if (uris && uris.length > 0) {
                    ctx.kanbanView.sendMessage({ type: 'browseDirResult', target: payload.target, path: uris[0].fsPath });
                }
            } else {
                let currentPath = startPath;
                while (true) {
                    let dirs: string[];
                    try {
                        const raw = await browseService.execCommand(
                            `cd ${currentPath.replace(/"/g, '\\"')} 2>/dev/null && pwd && find . -maxdepth 1 -type d ! -name . -printf '%f\\n' 2>/dev/null | sort || ls -1p | grep '/$' | sed 's/\\/$//'`
                        );
                        const lines = raw.trim().split('\n').filter(l => l.length > 0);
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

                    if (!pick) { break; }

                    if (pick.label.startsWith('$(check)')) {
                        ctx.kanbanView.sendMessage({ type: 'browseDirResult', target: payload.target, path: currentPath });
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
            const sessionName = (payload.name || 'lane').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) + '-lane';
            const memoryFileId = crypto.randomUUID?.() || 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const lane: KanbanSwimLane = {
                id: laneId,
                name: payload.name,
                serverId: payload.serverId,
                workingDirectory: payload.workingDirectory || '~/',
                sessionName,
                createdAt: Date.now(),
                sessionActive: false,
                contextInstructions: payload.contextInstructions || undefined,
                aiProvider: payload.aiProvider || undefined,
                memoryFileId,
            };
            ctx.swimLanes.push(lane);
            ctx.database.saveSwimLane(lane);
            ctx.updateKanban();
            break;
        }
        case 'addFavouriteFolder': {
            const fav: FavouriteFolder = {
                id: 'fav-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                name: payload.name,
                serverId: payload.serverId,
                workingDirectory: payload.workingDirectory || '~/',
            };
            ctx.favouriteFolders.push(fav);
            ctx.database.saveFavouriteFolder(fav);
            ctx.updateKanban();
            break;
        }
        case 'deleteFavouriteFolder': {
            const favIdx = ctx.favouriteFolders.findIndex(f => f.id === payload.id);
            if (favIdx !== -1) {
                ctx.favouriteFolders.splice(favIdx, 1);
                ctx.database.deleteFavouriteFolder(payload.id);
            }
            ctx.updateKanban();
            break;
        }
        case 'openLaneTerminal': {
            const lane = ctx.swimLanes.find(l => l.id === payload.swimLaneId);
            if (!lane) break;
            const ready = await ctx.ensureLaneSession(lane);
            if (!ready) break;
            const service = ctx.serviceManager.getService(lane.serverId);
            if (!service) break;
            try {
                // Check for existing "terminal" window in the session
                const sessions = await service.getTmuxTreeFresh();
                const session = sessions.find(s => s.name === lane.sessionName);
                let win = session?.windows.find(w => w.name === 'terminal');

                if (!win) {
                    // No existing terminal window — create one
                    await service.newWindow(lane.sessionName, 'terminal');
                    await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                    const freshSessions = await service.getTmuxTreeFresh();
                    const freshSession = freshSessions.find(s => s.name === lane.sessionName);
                    win = freshSession?.windows.find(w => w.name === 'terminal');

                    // cd to working directory in new terminal window
                    if (win && lane.workingDirectory) {
                        const pIdx = win.panes[0]?.index || '0';
                        await service.sendKeys(lane.sessionName, win.index, pIdx, `cd ${lane.workingDirectory}`);
                    }
                }

                const winIndex = win?.index || '0';
                const paneIndex = win?.panes[0]?.index || '0';

                const terminal = await ctx.smartAttachment.attachToSession(service, lane.sessionName, {
                    windowIndex: winIndex,
                    paneIndex: paneIndex
                });
                terminal.show();
                ctx.tmuxSessionProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open terminal: ${error}`);
            }
            break;
        }
        case 'createDebugWindow': {
            const lane = ctx.swimLanes.find(l => l.id === payload.swimLaneId);
            if (!lane) break;
            const ready = await ctx.ensureLaneSession(lane);
            if (!ready) break;
            const service = ctx.serviceManager.getService(lane.serverId);
            if (!service) break;
            try {
                // Check for existing debug window in the session
                const sessions = await service.getTmuxTreeFresh();
                const session = sessions.find(s => s.name === lane.sessionName);
                let win = session?.windows.find(w => w.name === 'debug');

                if (!win) {
                    // No existing debug window — create one
                    await service.newWindow(lane.sessionName, 'debug');
                    await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                    const freshSessions = await service.getTmuxTreeFresh();
                    const freshSession = freshSessions.find(s => s.name === lane.sessionName);
                    win = freshSession?.windows.find(w => w.name === 'debug');

                    // cd to working directory and launch claude in new window
                    if (win) {
                        const pIdx = win.panes[0]?.index || '0';
                        if (lane.workingDirectory) {
                            await service.sendKeys(lane.sessionName, win.index, pIdx, `cd ${lane.workingDirectory}`);
                        }
                        const debugProvider = ctx.aiManager.resolveProvider(undefined, lane.aiProvider);
                        const debugModel = ctx.aiManager.resolveModel(undefined, lane.aiModel);
                        const launchCmd = ctx.aiManager.getInteractiveLaunchCommand(debugProvider, debugModel);

                        // Auto-insert swim lane instructions after CLI is ready
                        const debugPrompt = buildDebugPrompt(lane);
                        const capturedSession = lane.sessionName;
                        const capturedWin = win.index;
                        const capturedPane = pIdx;
                        const debugDelay = vscode.workspace.getConfiguration('tmuxAgents').get<number>('cliLaunchDelayMs', 3000);
                        setTimeout(async () => {
                            try {
                                await service.sendKeys(capturedSession, capturedWin, capturedPane, launchCmd);
                                await new Promise(resolve => setTimeout(resolve, debugDelay));
                                await service.pasteText(capturedSession, capturedWin, capturedPane, debugPrompt);
                                await new Promise(resolve => setTimeout(resolve, 500));
                                await service.sendRawKeys(capturedSession, capturedWin, capturedPane, 'Enter');
                            } catch (err) {
                                console.warn('Failed to send debug instructions:', err);
                            }
                        }, debugDelay);
                    }
                }

                const winIndex = win?.index || '0';
                const paneIndex = win?.panes[0]?.index || '0';

                const terminal = await ctx.smartAttachment.attachToSession(service, lane.sessionName, {
                    windowIndex: winIndex,
                    paneIndex: paneIndex
                });
                terminal.show();
                ctx.tmuxSessionProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create debug window: ${error}`);
            }
            ctx.updateKanban();
            break;
        }
        case 'restartDebugWindow': {
            const lane = ctx.swimLanes.find(l => l.id === payload.swimLaneId);
            if (!lane) break;
            const ready = await ctx.ensureLaneSession(lane);
            if (!ready) break;
            const service = ctx.serviceManager.getService(lane.serverId);
            if (!service) break;
            try {
                // Kill existing debug window if present
                const sessions = await service.getTmuxTreeFresh();
                const session = sessions.find(s => s.name === lane.sessionName);
                const existingDebug = session?.windows.find(w => w.name === 'debug');
                if (existingDebug) {
                    await service.killWindow(lane.sessionName, existingDebug.index);
                }

                // Create a fresh debug window
                await service.newWindow(lane.sessionName, 'debug');
                await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                const freshSessions = await service.getTmuxTreeFresh();
                const freshSession = freshSessions.find(s => s.name === lane.sessionName);
                const win = freshSession?.windows.find(w => w.name === 'debug');

                if (win) {
                    const pIdx = win.panes[0]?.index || '0';
                    if (lane.workingDirectory) {
                        await service.sendKeys(lane.sessionName, win.index, pIdx, `cd ${lane.workingDirectory}`);
                    }
                    const restartProvider = ctx.aiManager.resolveProvider(undefined, lane.aiProvider);
                    const restartModel = ctx.aiManager.resolveModel(undefined, lane.aiModel);
                    const launchCmd = ctx.aiManager.getInteractiveLaunchCommand(restartProvider, restartModel);

                    // Auto-insert swim lane instructions after CLI is ready
                    const restartDebugPrompt = buildDebugPrompt(lane);
                    const rCapturedSession = lane.sessionName;
                    const rCapturedWin = win.index;
                    const rCapturedPane = pIdx;
                    const restartDelay = vscode.workspace.getConfiguration('tmuxAgents').get<number>('cliLaunchDelayMs', 3000);
                    setTimeout(async () => {
                        try {
                            await service.sendKeys(rCapturedSession, rCapturedWin, rCapturedPane, launchCmd);
                            await new Promise(resolve => setTimeout(resolve, restartDelay));
                            await service.pasteText(rCapturedSession, rCapturedWin, rCapturedPane, restartDebugPrompt);
                            await new Promise(resolve => setTimeout(resolve, 500));
                            await service.sendRawKeys(rCapturedSession, rCapturedWin, rCapturedPane, 'Enter');
                        } catch (err) {
                            console.warn('Failed to send debug instructions:', err);
                        }
                    }, restartDelay);

                    const terminal = await ctx.smartAttachment.attachToSession(service, lane.sessionName, {
                        windowIndex: win.index,
                        paneIndex: pIdx
                    });
                    terminal.show();
                }
                ctx.tmuxSessionProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to restart debug window: ${error}`);
            }
            ctx.updateKanban();
            break;
        }
        case 'deleteSwimLane': {
            const laneIndex = ctx.swimLanes.findIndex(l => l.id === payload.swimLaneId);
            if (laneIndex !== -1) {
                const lane = ctx.swimLanes[laneIndex];
                const service = ctx.serviceManager.getService(lane.serverId);
                if (service) {
                    try {
                        await service.deleteSession(lane.sessionName);
                    } catch {
                        // Session might already be gone
                    }
                }
                ctx.swimLanes.splice(laneIndex, 1);
                ctx.database.deleteSwimLane(lane.id);
                ctx.tmuxSessionProvider.refresh();
            }
            ctx.updateKanban();
            break;
        }
        case 'killLaneSession': {
            const lane = ctx.swimLanes.find(l => l.id === payload.swimLaneId);
            if (lane && lane.sessionActive) {
                const service = ctx.serviceManager.getService(lane.serverId);
                if (service) {
                    try {
                        await service.deleteSession(lane.sessionName);
                    } catch {
                        // Session might already be gone
                    }
                }
                lane.sessionActive = false;
                ctx.database.saveSwimLane(lane);
                ctx.tmuxSessionProvider.refresh();
            }
            ctx.updateKanban();
            break;
        }
        case 'createTask': {
            const task: OrchestratorTask = {
                id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                description: payload.description,
                input: payload.input || undefined,
                targetRole: payload.targetRole || undefined,
                status: TaskStatus.PENDING,
                priority: payload.priority || 5,
                kanbanColumn: payload.kanbanColumn || 'todo',
                swimLaneId: payload.swimLaneId || undefined,
                createdAt: Date.now(),
                aiProvider: payload.aiProvider || undefined,
                aiModel: payload.aiModel || undefined,
            };
            // Apply explicit payload overrides first (so they take priority)
            if (payload.autoStart !== undefined) { task.autoStart = !!payload.autoStart; }
            if (payload.autoPilot !== undefined) { task.autoPilot = !!payload.autoPilot; }
            if (payload.autoClose !== undefined) { task.autoClose = !!payload.autoClose; }
            if (payload.useWorktree !== undefined) { task.useWorktree = !!payload.useWorktree; }
            // Then inherit swim lane defaults for any toggles not explicitly set
            if (task.swimLaneId) {
                const lane = ctx.swimLanes.find(l => l.id === task.swimLaneId);
                applySwimLaneDefaults(task, lane);
            }
            if (payload.dependsOn && payload.dependsOn.length > 0) { task.dependsOn = payload.dependsOn; }
            ctx.orchestrator.submitTask(task);
            ctx.database.saveTask(task);
            if (payload.tags && payload.tags.length > 0) {
                ctx.database.saveTags(task.id, payload.tags);
            }
            // Auto-cascade: when autoStart + dependencies, force deps to auto-start/pilot/close
            if (task.autoStart && task.dependsOn && task.dependsOn.length > 0) {
                for (const depId of task.dependsOn) {
                    const dep = ctx.orchestrator.getTask(depId);
                    if (dep) {
                        dep.autoStart = true;
                        dep.autoPilot = true;
                        dep.autoClose = true;
                        ctx.database.saveTask(dep);
                        // Start dependency if it's ready to go
                        if ((dep.kanbanColumn === 'todo' || dep.kanbanColumn === 'backlog') && dep.swimLaneId) {
                            await ctx.startTaskFlow(dep);
                        }
                    }
                }
                // Don't start the task itself — it waits for dependencies
            } else if (task.autoStart && task.kanbanColumn === 'todo' && task.swimLaneId) {
                await ctx.startTaskFlow(task);
            } else if (task.swimLaneId) {
                // Auto-create session and window for the task even without autoStart
                const lane = ctx.swimLanes.find(l => l.id === task.swimLaneId);
                if (lane) {
                    const ready = await ctx.ensureLaneSession(lane);
                    if (ready) {
                        const service = ctx.serviceManager.getService(lane.serverId);
                        if (service) {
                            try {
                                const windowName = ctx.buildTaskWindowName(task);
                                await service.newWindow(lane.sessionName, windowName);
                                await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                                const sessions = await service.getTmuxTreeFresh();
                                const session = sessions.find(s => s.name === lane.sessionName);
                                const win = session?.windows.find(w => w.name === windowName);
                                const winIndex = win?.index || '0';
                                const paneIndex = win?.panes[0]?.index || '0';

                                task.tmuxSessionName = lane.sessionName;
                                task.tmuxWindowIndex = winIndex;
                                task.tmuxPaneIndex = paneIndex;
                                task.tmuxServerId = lane.serverId;
                                ctx.database.saveTask(task);
                                ctx.tmuxSessionProvider.refresh();
                            } catch (error) {
                                console.warn('Failed to create window for new task:', error);
                            }
                        }
                    }
                }
            }
            ctx.updateKanban();
            break;
        }
        case 'moveTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (t) {
                const oldColumn = t.kanbanColumn || 'backlog';
                const oldStatus = t.status;
                t.kanbanColumn = payload.kanbanColumn;
                // Cancel pending auto-close timer when a task is moved out of 'done'
                if (oldColumn === 'done' && payload.kanbanColumn !== 'done') {
                    cancelAutoClose(t);
                }
                if (payload.kanbanColumn === 'done') {
                    t.status = TaskStatus.COMPLETED;
                    t.completedAt = Date.now();
                    markDoneTimestamp(t);
                    // Clean up worktree if one was created
                    if (t.worktreePath && t.tmuxServerId) {
                        const svc = ctx.serviceManager.getService(t.tmuxServerId);
                        if (svc) {
                            try {
                                await svc.execCommand(`git worktree remove ${JSON.stringify(t.worktreePath)} --force`);
                            } catch (err) { console.warn('[Kanban] Failed to remove worktree:', err); }
                        }
                        t.worktreePath = undefined;
                    }
                    ctx.database.saveTask(t);
                    await triggerDependents(ctx, t.id);
                }
                if (payload.kanbanColumn === 'in_progress' && t.swimLaneId) {
                    const lane = ctx.swimLanes.find(l => l.id === t.swimLaneId);
                    if (lane) {
                        const ready = await ctx.ensureLaneSession(lane);
                        if (ready) {
                            const service = ctx.serviceManager.getService(lane.serverId);
                            if (service) {
                                try {
                                    const windowName = ctx.buildTaskWindowName(t);
                                    await service.newWindow(lane.sessionName, windowName);
                                    await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);
                                    t.status = TaskStatus.IN_PROGRESS;
                                    t.startedAt = Date.now();
                                    ctx.tmuxSessionProvider.refresh();
                                } catch (error) {
                                    console.warn('Failed to create window for task:', error);
                                }
                            }
                        }
                    }
                }
                if (t) { ctx.database.saveTask(t); }
                if (oldColumn !== payload.kanbanColumn) {
                    ctx.database.addStatusHistory({
                        id: 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                        taskId: t.id,
                        fromStatus: oldStatus,
                        toStatus: t.status,
                        fromColumn: oldColumn,
                        toColumn: payload.kanbanColumn,
                        changedAt: Date.now()
                    });
                }
                if (t && payload.kanbanColumn === 'todo' && t.swimLaneId) {
                    const moveLane = ctx.swimLanes.find(l => l.id === t.swimLaneId);
                    if (resolveToggle(t, 'autoStart', moveLane)) {
                        await ctx.startTaskFlow(t);
                    }
                }
            }
            ctx.updateKanban();
            break;
        }
        case 'editTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (t && payload.updates) {
                if (payload.updates.description !== undefined) t.description = payload.updates.description;
                if (payload.updates.input !== undefined) t.input = payload.updates.input;
                if (payload.updates.targetRole !== undefined) t.targetRole = payload.updates.targetRole;
                if (payload.updates.priority !== undefined) t.priority = payload.updates.priority;
                if (payload.updates.autoStart !== undefined) t.autoStart = !!payload.updates.autoStart;
                if (payload.updates.autoPilot !== undefined) t.autoPilot = !!payload.updates.autoPilot;
                if (payload.updates.autoClose !== undefined) t.autoClose = !!payload.updates.autoClose;
                if (payload.updates.useWorktree !== undefined) t.useWorktree = !!payload.updates.useWorktree;
                if (payload.updates.aiProvider !== undefined) t.aiProvider = payload.updates.aiProvider || undefined;
                if (payload.updates.aiModel !== undefined) t.aiModel = payload.updates.aiModel || undefined;
                if (payload.updates.dependsOn !== undefined) t.dependsOn = payload.updates.dependsOn;
            }
            if (t) { ctx.database.saveTask(t); }
            ctx.updateKanban();
            break;
        }
        case 'toggleAutoMode': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (t) {
                t.autoStart = !!payload.autoStart;
                t.autoPilot = !!payload.autoPilot;
                t.autoClose = !!payload.autoClose;
                ctx.database.saveTask(t);
                if (t.autoStart && t.kanbanColumn === 'todo' && t.swimLaneId) {
                    await ctx.startTaskFlow(t);
                }
            }
            ctx.updateKanban();
            break;
        }
        case 'startTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (!t) break;
            // Apply toggle values from the modal (sent inline to avoid race conditions)
            if (payload.toggles) {
                if (payload.toggles.autoStart !== undefined) t.autoStart = !!payload.toggles.autoStart;
                if (payload.toggles.autoPilot !== undefined) t.autoPilot = !!payload.toggles.autoPilot;
                if (payload.toggles.autoClose !== undefined) t.autoClose = !!payload.toggles.autoClose;
                if (payload.toggles.useWorktree !== undefined) t.useWorktree = !!payload.toggles.useWorktree;
                ctx.database.saveTask(t);
            }
            await ctx.startTaskFlow(t, {
                additionalInstructions: payload.additionalInstructions,
                askForContext: payload.askForContext
            });
            break;
        }
        case 'attachTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (!t || !t.tmuxServerId) {
                vscode.window.showWarningMessage('No tmux window info for this task');
                break;
            }
            const service = ctx.serviceManager.getService(t.tmuxServerId);
            if (!service) {
                vscode.window.showErrorMessage(`Server "${t.tmuxServerId}" not found`);
                break;
            }

            // Verify session still exists; recreate if killed externally
            const lane = t.swimLaneId ? ctx.swimLanes.find(l => l.id === t.swimLaneId) : undefined;
            if (t.tmuxSessionName) {
                const existing = await service.getSessions();
                if (!existing.includes(t.tmuxSessionName)) {
                    // Session was killed — recreate it and a window for this task
                    if (lane) {
                        const ready = await ctx.ensureLaneSession(lane);
                        if (!ready) break;
                        try {
                            const windowName = ctx.buildTaskWindowName(t);
                            await service.newWindow(lane.sessionName, windowName);
                            await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                            const sessions = await service.getTmuxTreeFresh();
                            const session = sessions.find(s => s.name === lane.sessionName);
                            const win = session?.windows.find(w => w.name === windowName);
                            t.tmuxSessionName = lane.sessionName;
                            t.tmuxWindowIndex = win?.index || '0';
                            t.tmuxPaneIndex = win?.panes[0]?.index || '0';
                            ctx.database.saveTask(t);
                            ctx.tmuxSessionProvider.refresh();
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to recreate session for task: ${error}`);
                            break;
                        }
                    } else {
                        vscode.window.showWarningMessage('Tmux session no longer exists and task has no swim lane to recreate it');
                        break;
                    }
                }
            } else if (lane) {
                // No session info stored — create from lane
                const ready = await ctx.ensureLaneSession(lane);
                if (!ready) break;
                try {
                    const windowName = ctx.buildTaskWindowName(t);
                    await service.newWindow(lane.sessionName, windowName);
                    await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                    const sessions = await service.getTmuxTreeFresh();
                    const session = sessions.find(s => s.name === lane.sessionName);
                    const win = session?.windows.find(w => w.name === windowName);
                    t.tmuxSessionName = lane.sessionName;
                    t.tmuxWindowIndex = win?.index || '0';
                    t.tmuxPaneIndex = win?.panes[0]?.index || '0';
                    t.tmuxServerId = lane.serverId;
                    ctx.database.saveTask(t);
                    ctx.tmuxSessionProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create session for task: ${error}`);
                    break;
                }
            } else {
                vscode.window.showWarningMessage('No tmux session info for this task');
                break;
            }

            const terminal = await ctx.smartAttachment.attachToSession(service, t.tmuxSessionName!, {
                windowIndex: t.tmuxWindowIndex,
                paneIndex: t.tmuxPaneIndex
            });
            terminal.show();
            break;
        }
        case 'closeTaskWindow': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (!t || !t.tmuxSessionName || !t.tmuxWindowIndex || !t.tmuxServerId) break;
            const svc = ctx.serviceManager.getService(t.tmuxServerId);
            if (!svc) break;
            try {
                await svc.killWindow(t.tmuxSessionName, t.tmuxWindowIndex);
                t.tmuxSessionName = undefined;
                t.tmuxWindowIndex = undefined;
                t.tmuxPaneIndex = undefined;
                t.tmuxServerId = undefined;
                ctx.database.saveTask(t);
                ctx.tmuxSessionProvider.refresh();
                ctx.updateKanban();
            } catch (err) {
                vscode.window.showWarningMessage(`Failed to close window: ${err}`);
            }
            break;
        }
        case 'restartTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (!t) break;
            // Apply toggle values from the modal (sent inline to avoid race conditions)
            if (payload.toggles) {
                if (payload.toggles.autoStart !== undefined) t.autoStart = !!payload.toggles.autoStart;
                if (payload.toggles.autoPilot !== undefined) t.autoPilot = !!payload.toggles.autoPilot;
                if (payload.toggles.autoClose !== undefined) t.autoClose = !!payload.toggles.autoClose;
                if (payload.toggles.useWorktree !== undefined) t.useWorktree = !!payload.toggles.useWorktree;
                ctx.database.saveTask(t);
            }
            const lane = t.swimLaneId ? ctx.swimLanes.find(l => l.id === t.swimLaneId) : undefined;
            if (!lane) {
                vscode.window.showWarningMessage('Task has no swim lane — cannot restart');
                break;
            }

            // Kill old window if it still exists (session may have been deleted)
            if (t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxServerId) {
                const oldService = ctx.serviceManager.getService(t.tmuxServerId);
                if (oldService) {
                    try {
                        await oldService.killWindow(t.tmuxSessionName, t.tmuxWindowIndex);
                    } catch {
                        // Window or session may already be gone
                    }
                }
            }

            // Delegate to startTaskFlow — it handles session (re)creation via
            // ensureLaneSession, window setup, prompt building, AI launch,
            // and status updates.  This avoids duplicating that logic and
            // ensures the swim-lane session is recreated when it no longer exists.
            await ctx.startTaskFlow(t);
            break;
        }
        case 'startBundle': {
            const taskIds: string[] = payload.taskIds || [];
            const bundleTasks = taskIds.map(id => ctx.orchestrator.getTask(id)).filter((t): t is OrchestratorTask => !!t);
            if (bundleTasks.length === 0) break;

            const firstTask = bundleTasks[0];
            const lane = firstTask.swimLaneId ? ctx.swimLanes.find(l => l.id === firstTask.swimLaneId) : undefined;

            if (lane) {
                const ready = await ctx.ensureLaneSession(lane);
                if (!ready) break;

                const service = ctx.serviceManager.getService(lane.serverId);
                if (!service) break;

                for (const t of bundleTasks) {
                    try {
                        const windowName = ctx.buildTaskWindowName(t);
                        await service.newWindow(lane.sessionName, windowName);
                        await ctx.cleanupInitWindow(lane.serverId, lane.sessionName);

                        const sessions = await service.getTmuxTreeFresh();
                        const session = sessions.find(s => s.name === lane.sessionName);
                        const win = session?.windows.find(w => w.name === windowName);
                        const winIndex = win?.index || '0';
                        const paneIndex = win?.panes[0]?.index || '0';

                        if (lane.workingDirectory) {
                            await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${lane.workingDirectory}`);
                        }

                        const otherTasks = bundleTasks.filter(bt => bt.id !== t.id);
                        let prompt = buildBundleTaskPrompt(t, otherTasks, lane);

                        prompt = appendPromptTail(prompt, {
                            additionalInstructions: payload.additionalInstructions,
                            askForContext: payload.askForContext,
                            autoClose: t.autoClose,
                            signalId: t.autoClose ? t.id.slice(-8) : undefined,
                        });

                        const bundleProvider = ctx.aiManager.resolveProvider(t.aiProvider, lane.aiProvider);
                        const bundleModel = ctx.aiManager.resolveModel(t.aiModel, lane?.aiModel);
                        const isAutoPilot = resolveToggle(t, 'autoPilot', lane);
                        const launchCmd = ctx.aiManager.getInteractiveLaunchCommand(bundleProvider, bundleModel, isAutoPilot);

                        const capturedPrompt = prompt;
                        const capturedSession = lane.sessionName;
                        const capturedWin = winIndex;
                        const capturedPane = paneIndex;
                        const bundleDelay = vscode.workspace.getConfiguration('tmuxAgents').get<number>('cliLaunchDelayMs', 3000);
                        setTimeout(async () => {
                            try {
                                await service.sendKeys(capturedSession, capturedWin, capturedPane, launchCmd);
                                await new Promise(resolve => setTimeout(resolve, bundleDelay));
                                await service.pasteText(capturedSession, capturedWin, capturedPane, capturedPrompt);
                                await new Promise(resolve => setTimeout(resolve, 500));
                                await service.sendRawKeys(capturedSession, capturedWin, capturedPane, 'Enter');
                            } catch (err) {
                                console.warn('Failed to send bundle prompt:', err);
                            }
                        }, bundleDelay);

                        t.tmuxSessionName = lane.sessionName;
                        t.tmuxWindowIndex = winIndex;
                        t.tmuxPaneIndex = paneIndex;
                        t.tmuxServerId = lane.serverId;

                        t.kanbanColumn = 'in_progress';
                        t.status = TaskStatus.IN_PROGRESS;
                        t.startedAt = Date.now();
                        ctx.database.saveTask(t);
                    } catch (error) {
                        console.warn(`Failed to start bundle task ${t.id}:`, error);
                    }
                }

                if (bundleTasks.length > 1) {
                    const team = ctx.teamManager.createTeam(`Bundle ${new Date().toLocaleTimeString()}`);
                    vscode.window.showInformationMessage(`Started bundle of ${bundleTasks.length} tasks in lane "${lane.name}"`);
                }

                const parentIds = new Set<string>();
                for (const t of bundleTasks) {
                    if (t.parentTaskId) { parentIds.add(t.parentTaskId); }
                }
                for (const pid of parentIds) {
                    const parent = ctx.orchestrator.getTask(pid);
                    if (parent) {
                        parent.verificationStatus = 'pending';
                        parent.kanbanColumn = 'in_progress';
                        parent.status = TaskStatus.IN_PROGRESS;
                        parent.startedAt = Date.now();
                        ctx.database.saveTask(parent);
                    }
                }

                ctx.tmuxSessionProvider.refresh();
            } else {
                for (const t of bundleTasks) {
                    t.kanbanColumn = 'in_progress';
                    t.status = TaskStatus.IN_PROGRESS;
                    t.startedAt = Date.now();
                    ctx.database.saveTask(t);
                }
            }
            ctx.updateKanban();
            await ctx.updateDashboard();
            break;
        }
        case 'mergeTasks': {
            const task1 = ctx.orchestrator.getTask(payload.taskId1);
            const task2 = ctx.orchestrator.getTask(payload.taskId2);
            if (!task1 || !task2) break;

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

            task1.parentTaskId = parentTask.id;
            task2.parentTaskId = parentTask.id;

            ctx.orchestrator.submitTask(parentTask);
            ctx.database.saveTask(parentTask);
            ctx.database.saveTask(task1);
            ctx.database.saveTask(task2);
            ctx.updateKanban();
            vscode.window.showInformationMessage(`Merged into parent task with 2 subtasks`);
            break;
        }
        case 'mergeSelectedTasks': {
            const taskIds: string[] = payload.taskIds || [];
            const mergeTasks = taskIds.map(id => ctx.orchestrator.getTask(id)).filter((t): t is OrchestratorTask => !!t);
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
                ctx.database.saveTask(t);
            }

            ctx.orchestrator.submitTask(parentTask);
            ctx.database.saveTask(parentTask);
            ctx.updateKanban();
            vscode.window.showInformationMessage(`Merged ${mergeTasks.length} tasks into a Task Box`);
            break;
        }
        case 'addSubtask': {
            const parentTask = ctx.orchestrator.getTask(payload.parentTaskId);
            const childTask = ctx.orchestrator.getTask(payload.childTaskId);
            if (!parentTask || !childTask) break;
            if (!parentTask.subtaskIds) { parentTask.subtaskIds = []; }

            if (childTask.subtaskIds && childTask.subtaskIds.length > 0) {
                for (const subId of childTask.subtaskIds) {
                    const sub = ctx.orchestrator.getTask(subId);
                    if (sub) {
                        sub.parentTaskId = parentTask.id;
                        if (!parentTask.subtaskIds.includes(subId)) {
                            parentTask.subtaskIds.push(subId);
                        }
                        ctx.database.saveTask(sub);
                    }
                }
                ctx.orchestrator.cancelTask(childTask.id);
            } else {
                childTask.parentTaskId = parentTask.id;
                if (!parentTask.subtaskIds.includes(childTask.id)) {
                    parentTask.subtaskIds.push(childTask.id);
                }
            }

            let maxPri = parentTask.priority;
            for (const sid of parentTask.subtaskIds) {
                const s = ctx.orchestrator.getTask(sid);
                if (s && s.priority > maxPri) { maxPri = s.priority; }
            }
            parentTask.priority = maxPri;

            ctx.database.saveTask(parentTask);
            if (childTask) { ctx.database.saveTask(childTask); }
            ctx.updateKanban();
            vscode.window.showInformationMessage(`Added subtask (${parentTask.subtaskIds.length} total)`);
            break;
        }
        case 'splitTaskBox': {
            const parentTask = ctx.orchestrator.getTask(payload.taskId);
            if (!parentTask || !parentTask.subtaskIds || parentTask.subtaskIds.length === 0) break;

            const col = parentTask.kanbanColumn || 'todo';
            const laneId = parentTask.swimLaneId;
            for (const subId of parentTask.subtaskIds) {
                const sub = ctx.orchestrator.getTask(subId);
                if (!sub) continue;
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
                ctx.orchestrator.submitTask(newTask);
                ctx.database.saveTask(newTask);
                ctx.orchestrator.cancelTask(subId);
                ctx.database.deleteTask(subId);
            }

            ctx.orchestrator.cancelTask(parentTask.id);
            ctx.database.deleteTask(parentTask.id);
            ctx.updateKanban();
            vscode.window.showInformationMessage(`Split task box into ${parentTask.subtaskIds.length} individual tasks`);
            break;
        }
        case 'editSwimLane': {
            const lane = ctx.swimLanes.find(l => l.id === payload.swimLaneId);
            if (!lane) break;
            const oldSessionName = lane.sessionName;
            if (payload.name) lane.name = payload.name;
            if (payload.workingDirectory) lane.workingDirectory = payload.workingDirectory;
            lane.aiProvider = payload.aiProvider || undefined;
            lane.aiModel = payload.aiModel || undefined;
            lane.contextInstructions = payload.contextInstructions || undefined;
            if (payload.defaultToggles !== undefined) {
                lane.defaultToggles = payload.defaultToggles || undefined;
            }
            // Handle memory path
            lane.memoryPath = payload.memoryPath || undefined;
            // Generate memoryFileId if useMemory toggled ON and no ID exists (legacy lane)
            if (lane.defaultToggles?.useMemory && !lane.memoryFileId) {
                lane.memoryFileId = crypto.randomUUID?.() || 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            }

            // Handle server change — kill old session first
            if (payload.serverId && payload.serverId !== lane.serverId) {
                if (lane.sessionActive) {
                    const oldSvc = ctx.serviceManager.getService(lane.serverId);
                    if (oldSvc) {
                        try {
                            await oldSvc.deleteSession(lane.sessionName);
                        } catch {
                            // Session might already be gone
                        }
                    }
                }
                lane.serverId = payload.serverId;
                lane.sessionActive = false;
                ctx.tmuxSessionProvider.refresh();
            }

            if (payload.sessionName && payload.sessionName !== oldSessionName) {
                if (lane.sessionActive) {
                    const svc = ctx.serviceManager.getService(lane.serverId);
                    if (svc) {
                        try {
                            await svc.renameSession(oldSessionName, payload.sessionName);
                            ctx.tmuxSessionProvider.refresh();
                        } catch (err) {
                            vscode.window.showWarningMessage(`Failed to rename session: ${err}`);
                        }
                    }
                }
                lane.sessionName = payload.sessionName;
            }
            ctx.database.saveSwimLane(lane);
            ctx.updateKanban();
            break;
        }
        case 'deleteTask':
            ctx.orchestrator.cancelTask(payload.taskId);
            ctx.database.deleteTask(payload.taskId);
            ctx.updateKanban();
            break;
        case 'summarizeTask': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (!t || !t.tmuxSessionName || !t.tmuxWindowIndex || !t.tmuxPaneIndex || !t.tmuxServerId) {
                ctx.kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: 'No live session' });
                break;
            }
            const svc = ctx.serviceManager.getService(t.tmuxServerId);
            if (!svc) {
                ctx.kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: 'Server not found' });
                break;
            }
            try {
                const content = await svc.capturePaneContent(t.tmuxSessionName, t.tmuxWindowIndex, t.tmuxPaneIndex, 50);
                const summary = await new Promise<string>((resolve) => {
                    const prompt = `Summarize this terminal session concisely for a kanban task card. Use this structure:
1. What tool/command was run (e.g., "Ran vitest", "Built with tsc", "Claude agent session")
2. What was accomplished — mention concrete artifacts: files created/modified, tests passed/failed, errors encountered
3. Final outcome: success, failure, or still in-progress. Note if the process exited cleanly or if errors remain.

Keep it technical but brief (3-5 sentences). Do not speculate beyond what the output shows.

Terminal output:
${content.slice(-3000)}`;
                    const spawnCfg = ctx.aiManager.getSpawnConfig(ctx.aiManager.getDefaultProvider());
                    const cmdStr = [spawnCfg.command, ...spawnCfg.args].join(' ');
                    const proc = cp.exec(cmdStr, { env: { ...process.env, ...spawnCfg.env }, cwd: safeCwd(spawnCfg.cwd), maxBuffer: 10 * 1024 * 1024, timeout: 20000 }, (error, stdout) => {
                        resolve(error ? '' : stdout.trim());
                    });
                    proc.stdin!.on('error', () => {});
                    process.nextTick(() => { if (proc.stdin && proc.stdin.writable && !proc.killed) { proc.stdin.write(prompt); proc.stdin.end(); } });
                });
                if (summary) {
                    const separator = t.input ? '\n\n---\n' : '';
                    t.input = (t.input || '') + separator + '**Output Summary:**\n' + summary;
                    t.output = summary;
                    ctx.database.saveTask(t);
                    ctx.updateKanban();
                }
                ctx.kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, success: !!summary });
            } catch (err) {
                ctx.kanbanView.sendMessage({ type: 'summarizeResult', taskId: payload.taskId, error: String(err) });
            }
            break;
        }
        case 'generatePlan': {
            const planLaneId = payload.swimLaneId || '';
            const planLane = planLaneId ? ctx.swimLanes.find(l => l.id === planLaneId) : undefined;
            const planText = payload.text || '';
            if (!planText) { break; }

            const planProvider = planLane?.aiProvider || ctx.aiManager.getDefaultProvider();
            const planSpawnCfg = ctx.aiManager.getSpawnConfig(planProvider);
            console.log(`[generatePlan] Spawning: ${planSpawnCfg.command} ${planSpawnCfg.args.join(' ')}`);

            try {
                const planResult = await new Promise<string>((resolve) => {
                    let prompt = `You are a task planner for a software development team. Given a high-level goal, break it down into a dependency-aware set of tasks.

Respond ONLY with valid JSON (no markdown, no code fences) — a JSON array of task objects:
[{"title": "Short title", "description": "Details", "role": "coder", "dependsOn": []}]

## Rules
- Each task has: title (string, under 60 chars, starts with action verb), description (string), role (string), dependsOn (array of 0-based indices referencing earlier tasks in the array)
- dependsOn indices must reference tasks earlier in the array (lower index). A task cannot depend on itself or on later tasks.
- Order tasks so dependencies come first. Tasks with no dependencies should come first.
- Role options: coder, reviewer, tester, devops, researcher (or empty string)
- Generate 2-10 tasks depending on complexity
- Tasks should be specific, actionable, and completable by an AI coding agent in a single session
- Description should include what to do and acceptance criteria`;

                    if (planLane) {
                        prompt += `\n\n## Context\n- Swim lane: ${planLane.name}\n- Working directory: ${planLane.workingDirectory}`;
                        if (planLane.contextInstructions) { prompt += `\n- Lane instructions: ${planLane.contextInstructions}`; }
                    }

                    // Include conversation history for iterative refinement
                    const convHistory = payload.conversation || [];
                    if (convHistory.length > 1) {
                        prompt += `\n\n## Conversation History`;
                        for (const entry of convHistory) {
                            if (entry.role === 'user') { prompt += `\n\nUser: ${entry.text}`; }
                            if (entry.role === 'assistant') { prompt += `\n\nPrevious plan: ${entry.text}`; }
                        }
                        prompt += `\n\nThe user wants to refine the plan. Consider their latest message and update the plan accordingly.`;
                    }

                    prompt += `\n\nUser's goal: ${planText}`;

                    const cmdStr = [planSpawnCfg.command, ...planSpawnCfg.args].join(' ');
                    const proc = cp.exec(cmdStr, {
                        env: { ...process.env, ...planSpawnCfg.env },
                        cwd: safeCwd(planSpawnCfg.cwd),
                        maxBuffer: 10 * 1024 * 1024,
                        timeout: 60000
                    }, (error, stdout, stderr) => {
                        if (error) {
                            console.warn(`[generatePlan] Error: ${error.message}. stderr: ${(stderr || '').slice(0, 500)}`);
                        }
                        resolve(error ? '' : stdout.trim());
                    });
                    proc.stdin!.on('error', () => {});
                    process.nextTick(() => { if (proc.stdin && proc.stdin.writable && !proc.killed) { proc.stdin.write(prompt); proc.stdin.end(); } });
                });

                if (planResult) {
                    let json = planResult;
                    const fenceMatch = planResult.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (fenceMatch) { json = fenceMatch[1].trim(); }
                    try {
                        const parsed = JSON.parse(json);
                        const tasks = Array.isArray(parsed) ? parsed : [];
                        // Validate and sanitize dependsOn
                        for (let i = 0; i < tasks.length; i++) {
                            if (!tasks[i].dependsOn) { tasks[i].dependsOn = []; }
                            tasks[i].dependsOn = tasks[i].dependsOn.filter(
                                (d: number) => typeof d === 'number' && d >= 0 && d < i
                            );
                        }
                        ctx.kanbanView.sendMessage({ type: 'generatePlanResult', tasks });
                    } catch {
                        ctx.kanbanView.sendMessage({ type: 'generatePlanResult', error: 'Failed to parse AI response as a task plan. Try again with a clearer description.' });
                    }
                } else {
                    ctx.kanbanView.sendMessage({ type: 'generatePlanResult', error: `AI command failed. Check Output panel "Tmux Agents" for details. Command: ${planSpawnCfg.command}` });
                }
            } catch (err) {
                console.error(`[generatePlan] Unexpected error: ${err}`);
                ctx.kanbanView.sendMessage({ type: 'generatePlanResult', error: String(err) });
            }
            break;
        }
        case 'approvePlan': {
            const approveLaneId = payload.swimLaneId || '';
            const approveLane = approveLaneId ? ctx.swimLanes.find(l => l.id === approveLaneId) : undefined;
            const planTasks: Array<{title: string; description: string; role: string; dependsOn: number[]}> = payload.tasks || [];

            try {
                // Phase 1: Create all tasks, collect IDs
                const idMap: string[] = [];
                const createdTasks: OrchestratorTask[] = [];
                for (let i = 0; i < planTasks.length; i++) {
                    const pt = planTasks[i];
                    const task: OrchestratorTask = {
                        id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + i,
                        description: pt.title || `Plan task ${i + 1}`,
                        input: pt.description || undefined,
                        targetRole: (pt.role || undefined) as OrchestratorTask['targetRole'],
                        status: TaskStatus.PENDING,
                        priority: 5,
                        kanbanColumn: 'todo',
                        swimLaneId: approveLaneId || undefined,
                        createdAt: Date.now() + i,
                    };
                    if (approveLane) { applySwimLaneDefaults(task, approveLane); }
                    idMap.push(task.id);
                    createdTasks.push(task);
                }

                // Phase 2: Map index-based dependsOn to actual task IDs
                for (let i = 0; i < planTasks.length; i++) {
                    const deps = planTasks[i].dependsOn || [];
                    if (deps.length > 0) {
                        createdTasks[i].dependsOn = deps
                            .filter((d: number) => d >= 0 && d < idMap.length && d !== i)
                            .map((d: number) => idMap[d]);
                    }
                }

                // Phase 3: Submit and save all tasks
                for (const task of createdTasks) {
                    ctx.orchestrator.submitTask(task);
                    ctx.database.saveTask(task);
                }

                // Phase 4: Auto-start cascade — if task has autoStart + deps, force deps to autoStart/autoPilot/autoClose
                for (const task of createdTasks) {
                    if (task.autoStart && task.dependsOn && task.dependsOn.length > 0) {
                        for (const depId of task.dependsOn) {
                            const dep = ctx.orchestrator.getTask(depId);
                            if (dep) {
                                dep.autoStart = true;
                                dep.autoPilot = true;
                                dep.autoClose = true;
                                ctx.database.saveTask(dep);
                            }
                        }
                    }
                }

                // Phase 5: Start Wave 1 tasks (no deps, autoStart on, in todo, has lane)
                for (const task of createdTasks) {
                    const effectiveAutoStart = resolveToggle(task, 'autoStart', approveLane);
                    if (effectiveAutoStart && (!task.dependsOn || task.dependsOn.length === 0) && task.kanbanColumn === 'todo' && task.swimLaneId) {
                        await ctx.startTaskFlow(task);
                    }
                }

                ctx.updateKanban();
                ctx.kanbanView.sendMessage({ type: 'approvePlanResult', success: true });
            } catch (err) {
                console.error(`[approvePlan] Unexpected error: ${err}`);
                ctx.kanbanView.sendMessage({ type: 'approvePlanResult', success: false, error: String(err) });
            }
            break;
        }
        case 'scanTmuxSessions': {
            const scanResults: any[] = [];
            const allServices = ctx.serviceManager.getAllServices();
            const allTasks = ctx.orchestrator.getTaskQueue();

            for (const svc of allServices) {
                try {
                    const sessions = await svc.getTmuxTreeFresh();
                    for (const session of sessions) {
                        const matchingLane = ctx.swimLanes.find(l => l.sessionName === session.name);

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

                        let summary = '';
                        if (paneContents.length > 0) {
                            const combinedContent = paneContents.join('\n---\n').slice(0, 3000);
                            try {
                                summary = await new Promise<string>((resolve, reject) => {
                                    const prompt = `Summarize this tmux session in exactly 3 short lines:
Line 1: Project/repo name and primary language (e.g., "myapp — TypeScript/React")
Line 2: What is actively running — build, test suite, dev server, AI agent (name it: Claude, Gemini, Codex), or idle shell
Line 3: Current status — building, passing, failing, waiting for input, error, or complete

If a shell is idle with no running process, say "Idle shell" on Line 2.

${combinedContent}`;
                                    const spawnCfg = ctx.aiManager.getSpawnConfig(ctx.aiManager.getDefaultProvider());
                                    const cmdStr3 = [spawnCfg.command, ...spawnCfg.args].join(' ');
                                    const proc = cp.exec(cmdStr3, { env: { ...process.env, ...spawnCfg.env }, cwd: safeCwd(spawnCfg.cwd), maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (error, stdout) => {
                                        resolve(error ? '' : stdout.trim());
                                    });
                                    proc.stdin!.on('error', () => {});
                                    process.nextTick(() => { if (proc.stdin && proc.stdin.writable && !proc.killed) { proc.stdin.write(prompt); proc.stdin.end(); } });
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

            ctx.kanbanView.sendMessage({ type: 'tmuxScanResult', sessions: scanResults });
            break;
        }
        case 'importTmuxSessions': {
            const sessionsToImport: any[] = payload.sessions || [];
            let importedWindows = 0;

            for (const s of sessionsToImport) {
                const windowsToImport = (s.selectedWindows || s.windows || []).filter(
                    (w: any) => !w.alreadyImported
                );
                if (windowsToImport.length === 0) continue;

                let laneId = s.existingLaneId || null;
                if (laneId && ctx.swimLanes.some(l => l.id === laneId)) {
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
                        sessionActive: true
                    };
                    ctx.swimLanes.push(lane);
                    ctx.database.saveSwimLane(lane);
                }

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
                    ctx.orchestrator.submitTask(task);
                    ctx.database.saveTask(task);
                    importedWindows++;
                }
            }

            ctx.updateKanban();
            ctx.tmuxSessionProvider.refresh();
            vscode.window.showInformationMessage(`Imported ${importedWindows} window(s) as tasks`);
            break;
        }
        case 'addComment': {
            const comment: TaskComment = {
                id: 'comment-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                taskId: payload.taskId,
                text: payload.text,
                createdAt: Date.now()
            };
            ctx.database.addComment(comment);
            ctx.updateKanban();
            break;
        }
        case 'deleteComment': {
            ctx.database.deleteComment(payload.commentId);
            ctx.updateKanban();
            break;
        }
        case 'addTag': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (t) {
                const currentTags = ctx.database.getTags(t.id);
                if (!currentTags.includes(payload.tag)) {
                    currentTags.push(payload.tag);
                    ctx.database.saveTags(t.id, currentTags);
                }
            }
            ctx.updateKanban();
            break;
        }
        case 'removeTag': {
            const t = ctx.orchestrator.getTask(payload.taskId);
            if (t) {
                const currentTags = ctx.database.getTags(t.id);
                const filtered = currentTags.filter(tag => tag !== payload.tag);
                ctx.database.saveTags(t.id, filtered);
            }
            ctx.updateKanban();
            break;
        }
        case 'refresh':
            ctx.updateKanban();
            break;
    }
}
