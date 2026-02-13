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
exports.checkAutoCompletions = checkAutoCompletions;
exports.checkAutoPilot = checkAutoPilot;
const vscode = __importStar(require("vscode"));
const types_1 = require("./core/types");
async function checkAutoCompletions(ctx) {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const autoTasks = allTasks.filter(t => {
        const lane = t.swimLaneId ? ctx.swimLanes.find(l => l.id === t.swimLaneId) : undefined;
        return (0, types_1.resolveToggle)(t, 'autoClose', lane) && t.kanbanColumn === 'in_progress' &&
            t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId;
    });
    if (autoTasks.length === 0) {
        return;
    }
    for (const task of autoTasks) {
        const service = ctx.serviceManager.getService(task.tmuxServerId);
        if (!service) {
            continue;
        }
        try {
            const content = await service.capturePaneContent(task.tmuxSessionName, task.tmuxWindowIndex, task.tmuxPaneIndex, 100);
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
                try {
                    await service.killWindow(task.tmuxSessionName, task.tmuxWindowIndex);
                }
                catch { }
                // Clean up worktree if one was created
                if (task.worktreePath) {
                    try {
                        await service.execCommand(`git worktree remove ${JSON.stringify(task.worktreePath)} --force`);
                    }
                    catch (err) {
                        console.warn('[AutoMonitor] Failed to remove worktree:', err);
                    }
                    task.worktreePath = undefined;
                }
                task.kanbanColumn = 'done';
                task.status = types_1.TaskStatus.COMPLETED;
                task.completedAt = Date.now();
                task.tmuxSessionName = undefined;
                task.tmuxWindowIndex = undefined;
                task.tmuxPaneIndex = undefined;
                task.tmuxServerId = undefined;
                ctx.database.saveTask(task);
                if (task.subtaskIds) {
                    for (const subId of task.subtaskIds) {
                        const sub = ctx.orchestrator.getTask(subId);
                        if (sub && sub.status !== types_1.TaskStatus.COMPLETED) {
                            sub.kanbanColumn = 'done';
                            sub.status = types_1.TaskStatus.COMPLETED;
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
        }
        catch (err) {
            console.warn(`[AutoMode] Error checking task ${task.id}:`, err);
        }
    }
}
async function checkAutoPilot(ctx) {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const pilotTasks = allTasks.filter(t => t.autoPilot && t.kanbanColumn === 'in_progress' &&
        t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxPaneIndex && t.tmuxServerId);
    if (pilotTasks.length === 0) {
        return;
    }
    for (const task of pilotTasks) {
        const service = ctx.serviceManager.getService(task.tmuxServerId);
        if (!service) {
            continue;
        }
        try {
            const content = await service.capturePaneContent(task.tmuxSessionName, task.tmuxWindowIndex, task.tmuxPaneIndex, 30);
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const lastLines = lines.slice(-5).join('\n').toLowerCase();
            const needsApproval = lastLines.includes('do you want to proceed') ||
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
                await service.sendKeys(task.tmuxSessionName, task.tmuxWindowIndex, task.tmuxPaneIndex, 'yes');
                await service.sendKeys(task.tmuxSessionName, task.tmuxWindowIndex, task.tmuxPaneIndex, '');
            }
        }
        catch (err) {
            console.warn(`[AutoPilot] Error checking task ${task.id}:`, err);
        }
    }
}
async function triggerAutoMonitorDependents(ctx, completedTaskId) {
    const allTasks = ctx.orchestrator.getTaskQueue();
    for (const task of allTasks) {
        if (!task.dependsOn || !task.dependsOn.includes(completedTaskId)) {
            continue;
        }
        const allMet = task.dependsOn.every(depId => {
            const dep = ctx.orchestrator.getTask(depId);
            return dep && dep.status === types_1.TaskStatus.COMPLETED;
        });
        const lane = task.swimLaneId ? ctx.swimLanes.find(l => l.id === task.swimLaneId) : undefined;
        const effectiveAutoStart = (0, types_1.resolveToggle)(task, 'autoStart', lane);
        if (allMet && effectiveAutoStart && (task.kanbanColumn === 'todo' || task.kanbanColumn === 'backlog') && task.swimLaneId) {
            task.kanbanColumn = 'todo';
            ctx.database.saveTask(task);
            await ctx.startTaskFlow(task);
        }
    }
}
//# sourceMappingURL=autoMonitor.js.map