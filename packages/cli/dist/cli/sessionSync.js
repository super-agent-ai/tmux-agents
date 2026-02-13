"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncTaskListAttachments = syncTaskListAttachments;
const types_1 = require("./core/types");
/**
 * Set of swim-lane IDs currently being processed to prevent overlapping
 * sync runs from causing duplicate attachments.
 */
const syncingLanes = new Set();
/**
 * Synchronises task list attachments with the actual tmux session state.
 *
 * For each swim lane:
 * 1. Query the real tmux session tree for the lane's session.
 * 2. If the session exists and is attached ("maximized"), iterate over
 *    in-progress tasks in the lane that lack tmux window bindings.
 * 3. Try to match each unbound task to a window whose name contains the
 *    task's ID fragment (the same naming convention used by
 *    `buildTaskWindowName`).
 * 4. If a match is found, bind the task to that window.
 * 5. Also verify already-bound tasks still reference valid windows; if the
 *    window is gone, clear the stale binding.
 * 6. Sync the lane's `sessionActive` flag with reality.
 *
 * This function is safe to call repeatedly — it guards against concurrent
 * runs per lane and avoids duplicate writes when no changes occur.
 */
async function syncTaskListAttachments(ctx) {
    for (const lane of ctx.swimLanes) {
        if (syncingLanes.has(lane.id)) {
            continue;
        }
        syncingLanes.add(lane.id);
        try {
            await syncLane(ctx, lane);
        }
        catch (err) {
            console.warn(`[SessionSync] Error syncing lane "${lane.name}":`, err);
        }
        finally {
            syncingLanes.delete(lane.id);
        }
    }
}
async function syncLane(ctx, lane) {
    const service = ctx.serviceManager.getService(lane.serverId);
    if (!service) {
        return;
    }
    let sessions;
    try {
        sessions = await service.getTmuxTree();
    }
    catch {
        return; // Cannot reach server — skip silently
    }
    const session = sessions.find(s => s.name === lane.sessionName);
    // ── Session does not exist ────────────────────────────────────────────
    if (!session) {
        if (lane.sessionActive) {
            lane.sessionActive = false;
            ctx.database.saveSwimLane(lane);
        }
        // Mark orphaned active tasks as failed — their tmux session is gone
        markOrphanedTasksFailed(ctx, lane);
        return;
    }
    // ── Update sessionActive flag to match reality ────────────────────────
    if (!lane.sessionActive) {
        lane.sessionActive = true;
        ctx.database.saveSwimLane(lane);
    }
    // ── Only auto-attach when the session is "maximized" (attached) ──────
    if (!session.isAttached) {
        return;
    }
    // Build a lookup of window names → window data for fast matching
    const windowsByName = new Map(session.windows.map(w => [w.name, w]));
    const allTasks = ctx.orchestrator.getTaskQueue();
    const laneTasks = allTasks.filter(t => t.swimLaneId === lane.id);
    let changed = false;
    for (const task of laneTasks) {
        // ── Handle already-bound tasks: verify the window still exists ────
        if (task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
            if (task.tmuxSessionName === lane.sessionName) {
                const windowStillExists = session.windows.some(w => w.index === task.tmuxWindowIndex);
                if (!windowStillExists) {
                    // Window was killed externally — try to rebind to a matching window
                    const rebound = tryBindTaskToWindow(task, lane, session, windowsByName);
                    if (rebound) {
                        ctx.database.saveTask(task);
                        changed = true;
                    }
                }
            }
            continue; // Already bound to a valid (or different-server) window
        }
        // ── Unbound in-progress / in-review tasks: try to attach ─────────
        if (task.kanbanColumn !== 'in_progress' && task.kanbanColumn !== 'in_review') {
            continue;
        }
        const bound = tryBindTaskToWindow(task, lane, session, windowsByName);
        if (bound) {
            ctx.database.saveTask(task);
            changed = true;
        }
    }
    if (changed) {
        ctx.tmuxSessionProvider.refresh();
        ctx.updateKanban();
    }
}
// ─── Dead Session Cleanup ────────────────────────────────────────────────
/**
 * Finds tasks that are bound to a swim lane's tmux session and are in an
 * active kanban column (`in_progress` or `in_review`).  Since the session
 * no longer exists, these tasks are orphaned — their status is set to
 * `FAILED`, tmux references are cleared, and an error message is recorded.
 */
function markOrphanedTasksFailed(ctx, lane) {
    const allTasks = ctx.orchestrator.getTaskQueue();
    const orphaned = allTasks.filter(t => t.tmuxSessionName === lane.sessionName &&
        t.tmuxServerId === lane.serverId &&
        (t.kanbanColumn === 'in_progress' || t.kanbanColumn === 'in_review'));
    if (orphaned.length === 0) {
        return;
    }
    for (const task of orphaned) {
        task.status = types_1.TaskStatus.FAILED;
        task.errorMessage = 'Tmux session no longer exists';
        task.tmuxSessionName = undefined;
        task.tmuxWindowIndex = undefined;
        task.tmuxPaneIndex = undefined;
        task.tmuxServerId = undefined;
        ctx.database.saveTask(task);
    }
    ctx.tmuxSessionProvider.refresh();
    ctx.updateKanban();
}
/**
 * Attempts to match a task to a window in the session by checking if the
 * window name contains the task's short ID (first 15 chars), which is the
 * naming convention used by `buildTaskWindowName`.
 *
 * Returns `true` if the task was successfully bound.
 */
function tryBindTaskToWindow(task, lane, session, windowsByName) {
    const shortId = task.id.slice(0, 15);
    for (const [winName, win] of windowsByName) {
        if (winName.includes(shortId)) {
            task.tmuxSessionName = lane.sessionName;
            task.tmuxWindowIndex = win.index;
            task.tmuxPaneIndex = win.panes[0]?.index || '0';
            task.tmuxServerId = lane.serverId;
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=sessionSync.js.map