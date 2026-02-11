import * as vscode from 'vscode';
import { TmuxServiceManager } from './serviceManager';
import { TmuxSessionProvider } from './treeProvider';
import { AgentOrchestrator } from './orchestrator';
import { Database } from './database';
import { TaskStatus, OrchestratorTask, KanbanSwimLane } from './types';

export interface AutoMonitorContext {
    serviceManager: TmuxServiceManager;
    tmuxSessionProvider: TmuxSessionProvider;
    orchestrator: AgentOrchestrator;
    database: Database;
    updateKanban: () => void;
    updateDashboard: () => Promise<void>;
    startTaskFlow: (task: OrchestratorTask) => Promise<void>;
    swimLanes: KanbanSwimLane[];
}

export async function checkAutoCompletions(ctx: AutoMonitorContext): Promise<void> {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const autoTasks = allTasks.filter(t =>
        t.autoClose && t.kanbanColumn === 'in_progress' &&
        t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId
    );
    if (autoTasks.length === 0) { return; }

    for (const task of autoTasks) {
        const service = ctx.serviceManager.getService(task.tmuxServerId!);
        if (!service) { continue; }
        try {
            const content = await service.capturePaneContent(
                task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, 100
            );
            const signalId = task.id.slice(-8);
            if (content.includes(`<promise>${signalId}-DONE</promise>`)) {
                const summaryStart = content.indexOf(`<promise-summary>${signalId}`);
                const summaryEnd = content.indexOf('</promise-summary>');
                if (summaryStart !== -1 && summaryEnd !== -1) {
                    const raw = content.substring(summaryStart, summaryEnd);
                    const lines = raw.split('\n').slice(1);
                    task.output = lines.join('\n').trim();
                }
                if (task.output) {
                    const separator = task.input ? '\n\n---\n' : '';
                    task.input = (task.input || '') + separator + '**Completion Summary:**\n' + task.output;
                }
                try { await service.killWindow(task.tmuxSessionName!, task.tmuxWindowIndex!); } catch {}
                task.kanbanColumn = 'done';
                task.status = TaskStatus.COMPLETED;
                task.completedAt = Date.now();
                task.tmuxSessionName = undefined;
                task.tmuxWindowIndex = undefined;
                task.tmuxPaneIndex = undefined;
                task.tmuxServerId = undefined;
                ctx.database.saveTask(task);
                if (task.subtaskIds) {
                    for (const subId of task.subtaskIds) {
                        const sub = ctx.orchestrator.getTask(subId);
                        if (sub && sub.status !== TaskStatus.COMPLETED) {
                            sub.kanbanColumn = 'done';
                            sub.status = TaskStatus.COMPLETED;
                            sub.completedAt = Date.now();
                            sub.tmuxSessionName = undefined;
                            sub.tmuxWindowIndex = undefined;
                            sub.tmuxPaneIndex = undefined;
                            sub.tmuxServerId = undefined;
                            ctx.database.saveTask(sub);
                        }
                    }
                }
                ctx.tmuxSessionProvider.refresh();
                // Trigger dependents: start tasks waiting on this one
                await triggerAutoMonitorDependents(ctx, task.id);
                ctx.updateKanban();
                await ctx.updateDashboard();
                vscode.window.showInformationMessage(`Auto task completed: ${task.description.slice(0, 50)}`);
            }
        } catch (err) {
            console.warn(`[AutoMode] Error checking task ${task.id}:`, err);
        }
    }
}

export async function checkAutoPilot(ctx: AutoMonitorContext): Promise<void> {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const pilotTasks = allTasks.filter(t =>
        t.autoPilot && t.kanbanColumn === 'in_progress' &&
        t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId
    );
    if (pilotTasks.length === 0) { return; }

    for (const task of pilotTasks) {
        const service = ctx.serviceManager.getService(task.tmuxServerId!);
        if (!service) { continue; }
        try {
            const content = await service.capturePaneContent(
                task.tmuxSessionName!, task.tmuxWindowIndex!, task.tmuxPaneIndex!, 30
            );
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const lastLines = lines.slice(-5).join('\n').toLowerCase();

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

async function triggerAutoMonitorDependents(ctx: AutoMonitorContext, completedTaskId: string): Promise<void> {
    const allTasks = ctx.orchestrator.getTaskQueue();
    for (const task of allTasks) {
        if (!task.dependsOn || !task.dependsOn.includes(completedTaskId)) { continue; }
        const allMet = task.dependsOn.every(depId => {
            const dep = ctx.orchestrator.getTask(depId);
            return dep && dep.status === TaskStatus.COMPLETED;
        });
        if (allMet && task.autoStart && (task.kanbanColumn === 'todo' || task.kanbanColumn === 'backlog') && task.swimLaneId) {
            task.kanbanColumn = 'todo';
            ctx.database.saveTask(task);
            await ctx.startTaskFlow(task);
        }
    }
}
