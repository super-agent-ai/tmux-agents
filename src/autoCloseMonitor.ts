import * as vscode from 'vscode';
import { TmuxServiceManager } from './serviceManager';
import { TmuxSessionProvider } from './treeProvider';
import { AgentOrchestrator } from './orchestrator';
import { Database } from './database';
import { OrchestratorTask } from './types';

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

    const keyLines: string[] = [];
    const errorLines: string[] = [];
    const resultLines: string[] = [];

    for (const line of lines) {
        const lower = line.toLowerCase();
        // Capture errors, failures, warnings
        if (/\b(error|err!|fail(ed|ure)?|exception|panic|abort|fatal|warn(ing)?)\b/i.test(line)) {
            errorLines.push(line.trim());
        }
        // Capture result/success indicators
        if (/\b(pass(ed)?|success(ful)?|complete[d]?|done|finish(ed)?|built|created|merged|deployed)\b/i.test(line)) {
            resultLines.push(line.trim());
        }
        // Capture commands that were run (typical shell prompt patterns)
        if (/^\$\s+|^>\s+|^#\s+/.test(line) || lower.startsWith('running ') || lower.startsWith('executing ')) {
            keyLines.push(line.trim());
        }
    }

    const sections: string[] = [];

    if (keyLines.length > 0) {
        const capped = keyLines.slice(-10);
        sections.push('**Commands/Actions:**\n' + capped.map(l => `- ${l}`).join('\n'));
    }
    if (resultLines.length > 0) {
        const capped = resultLines.slice(-5);
        sections.push('**Outcomes:**\n' + capped.map(l => `- ${l}`).join('\n'));
    }
    if (errorLines.length > 0) {
        const capped = errorLines.slice(-5);
        sections.push('**Errors/Warnings:**\n' + capped.map(l => `- ${l}`).join('\n'));
    }

    if (sections.length === 0) {
        // Fallback: just grab the last few meaningful lines
        const tail = lines.slice(-8);
        sections.push('**Session tail:**\n' + tail.map(l => `- ${l}`).join('\n'));
    }

    return sections.join('\n\n');
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

    // 3. Append summary to the task description
    const separator = task.description ? '\n\n---\n' : '';
    task.description = (task.description || '') + separator + '**Auto-close session summary:**\n' + summary;

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
