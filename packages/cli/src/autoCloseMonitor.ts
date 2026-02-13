import * as vscode from 'vscode';
import { TmuxServiceManager } from './serviceManager';
import { TmuxSessionProvider } from './treeProvider';
import { AgentOrchestrator } from './core/orchestrator';
import { Database } from './core/database';
import { OrchestratorTask } from './core/types';

// ─── Auto-Close Monitor ────────────────────────────────────────────────
// Monitors tasks in the 'done' column that still have an associated tmux
// window.  After a configurable delay (default 10 minutes), the pane
// buffer is captured and summarised, the summary is appended to the
// task description, and the window is closed gracefully.

export interface AutoCloseMonitorContext {
    serviceManager: TmuxServiceManager;
    tmuxSessionProvider: TmuxSessionProvider;
    orchestrator: AgentOrchestrator;
    database: Database;
    updateKanban: () => void;
    updateDashboard: () => Promise<void>;
}

/** Default time in ms a task must remain in 'done' before its window is auto-closed. */
const DEFAULT_DONE_DELAY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Set of task IDs currently being processed by `closeTaskWindow` to
 * prevent double-execution from overlapping poll cycles.
 */
const processingTasks = new Set<string>();

// ─── Pane Buffer Summarisation ─────────────────────────────────────────

/**
 * Condenses raw terminal output into a short summary of key actions,
 * outcomes, and errors.  Uses a heuristic keyword-extraction approach
 * that runs synchronously — no LLM dependency required.
 */
export function summarisePaneOutput(raw: string): string {
    if (!raw || raw.trim().length === 0) {
        return '(no output captured)';
    }

    const lines = raw.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
    if (lines.length === 0) { return '(no output captured)'; }

    const errorLines: string[] = [];
    const resultLines: string[] = [];

    for (const line of lines) {
        // Capture errors, failures, warnings
        if (/\b(error|err!|fail(ed|ure)?|exception|panic|abort|fatal|warn(ing)?)\b/i.test(line)) {
            errorLines.push(line.trim().slice(0, 100));
        }
        // Capture result/success indicators
        if (/\b(pass(ed)?|success(ful)?|complete[d]?|done|finish(ed)?|built|created|merged|deployed)\b/i.test(line)) {
            resultLines.push(line.trim().slice(0, 100));
        }
    }

    const parts: string[] = [];

    // DoD status — what succeeded
    if (resultLines.length > 0) {
        parts.push(resultLines.slice(-3).map(l => `- ${l}`).join('\n'));
    }

    // Issues — only if present
    if (errorLines.length > 0) {
        parts.push('Issues: ' + errorLines.slice(-2).map(l => l.slice(0, 80)).join('; '));
    }

    if (parts.length === 0) {
        // Fallback: last 3 lines
        const tail = lines.slice(-3);
        parts.push(tail.map(l => `- ${l.slice(0, 100)}`).join('\n'));
    }

    return parts.join('\n');
}

// ─── Core Check ────────────────────────────────────────────────────────

/**
 * Polls tasks in the 'done' column that still have a tmux window
 * attached.  If the task has been in 'done' for longer than `delayMs`,
 * the pane output is captured, summarised, appended to the task
 * description, and the window is closed.
 */
export async function checkAutoCloseTimers(
    ctx: AutoCloseMonitorContext,
    delayMs: number = DEFAULT_DONE_DELAY_MS
): Promise<void> {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const candidates = allTasks.filter(t =>
        t.kanbanColumn === 'done' &&
        t.doneAt &&
        t.tmuxSessionName && t.tmuxWindowIndex && t.tmuxServerId
    );
    if (candidates.length === 0) { return; }

    const now = Date.now();

    for (const task of candidates) {
        // Not yet past the delay threshold
        if (now - task.doneAt! < delayMs) { continue; }

        // Guard against concurrent processing
        if (processingTasks.has(task.id)) { continue; }
        processingTasks.add(task.id);

        try {
            await closeTaskWindow(ctx, task);
        } catch (err) {
            console.warn(`[AutoCloseMonitor] Error closing window for task ${task.id}:`, err);
        } finally {
            processingTasks.delete(task.id);
        }
    }
}

/**
 * Captures the pane buffer, summarises it, appends the summary to the
 * task description, and kills the tmux window.
 */
async function closeTaskWindow(
    ctx: AutoCloseMonitorContext,
    task: OrchestratorTask
): Promise<void> {
    const service = ctx.serviceManager.getService(task.tmuxServerId!);
    if (!service) { return; }

    // Re-check that the task is still in 'done' (may have been moved back)
    if (task.kanbanColumn !== 'done') { return; }

    // 1. Capture pane buffer (large capture for a comprehensive summary)
    let paneContent = '';
    try {
        paneContent = await service.capturePaneContent(
            task.tmuxSessionName!,
            task.tmuxWindowIndex!,
            task.tmuxPaneIndex || '0',
            500
        );
    } catch {
        // Window may already be gone — skip gracefully
    }

    // 2. Summarise the captured output
    const summary = summarisePaneOutput(paneContent);

    // 3. Append summary to the task input (description detail), not the title
    const separator = task.input ? '\n\n---\n' : '';
    task.input = (task.input || '') + separator + '**Session Summary**\n' + summary;

    // 4. Kill the tmux window gracefully
    try {
        await service.killWindow(task.tmuxSessionName!, task.tmuxWindowIndex!);
    } catch {
        // Window may already have been closed manually — that's fine
    }

    // 5. Clear tmux references from the task
    task.tmuxSessionName = undefined;
    task.tmuxWindowIndex = undefined;
    task.tmuxPaneIndex = undefined;
    task.tmuxServerId = undefined;

    // 6. Persist and refresh UI
    ctx.database.saveTask(task);
    ctx.tmuxSessionProvider.refresh();
    ctx.updateKanban();
    await ctx.updateDashboard();

    vscode.window.showInformationMessage(
        `Auto-closed tmux window for completed task: ${task.description.slice(0, 50)}`
    );
}

/**
 * Cancels a pending auto-close by clearing the `doneAt` timestamp.
 * Call this whenever a task is moved *out of* the 'done' column.
 */
export function cancelAutoClose(task: OrchestratorTask): void {
    task.doneAt = undefined;
}

/**
 * Marks the current time as the moment the task entered 'done'.
 * Call this whenever a task is moved *into* the 'done' column.
 * Only sets the timestamp if the task has an associated tmux window.
 */
export function markDoneTimestamp(task: OrchestratorTask): void {
    if (task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
        task.doneAt = Date.now();
    }
}
