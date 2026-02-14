"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../core/types");
const kanbanView_1 = require("../kanbanView");
// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeTask = (id, overrides = {}) => ({
    id,
    description: `Task ${id}`,
    status: types_1.TaskStatus.PENDING,
    priority: 5,
    createdAt: Date.now(),
    verificationStatus: 'none',
    ...overrides,
});
(0, vitest_1.describe)('Kanban Worktree Indicator', () => {
    let provider;
    let html;
    (0, vitest_1.beforeEach)(() => {
        const extUri = { fsPath: '/test' };
        provider = new kanbanView_1.KanbanViewProvider(extUri);
        html = provider.getHtml();
    });
    // ─── CSS Styles ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('worktree badge CSS', () => {
        (0, vitest_1.it)('includes worktree-badge class in the HTML output', () => {
            (0, vitest_1.expect)(html).toContain('.worktree-badge');
        });
        (0, vitest_1.it)('includes worktree-badge active variant in CSS', () => {
            (0, vitest_1.expect)(html).toContain('.worktree-badge.active');
        });
        (0, vitest_1.it)('uses blue color for pending worktree badge', () => {
            (0, vitest_1.expect)(html).toContain('color: #569cd6');
        });
        (0, vitest_1.it)('uses teal color for active worktree badge', () => {
            (0, vitest_1.expect)(html).toMatch(/\.worktree-badge\.active\s*\{[^}]*color:\s*#4ec9b0/);
        });
    });
    // ─── Rendering Logic ─────────────────────────────────────────────────
    (0, vitest_1.describe)('worktree badge rendering logic in buildCard', () => {
        (0, vitest_1.it)('conditionally renders badge based on resolved useWorktree toggle', () => {
            (0, vitest_1.expect)(html).toContain('rUseWorktree');
        });
        (0, vitest_1.it)('renders tree icon and WT label', () => {
            (0, vitest_1.expect)(html).toContain('&#x1F333; WT');
        });
        (0, vitest_1.it)('applies active class when worktreePath is set', () => {
            (0, vitest_1.expect)(html).toContain("task.worktreePath ? 'worktree-badge active' : 'worktree-badge'");
        });
        (0, vitest_1.it)('shows worktree path in tooltip when available', () => {
            (0, vitest_1.expect)(html).toContain("'Worktree: ' + task.worktreePath");
        });
        (0, vitest_1.it)('shows pending tooltip when path not yet set', () => {
            (0, vitest_1.expect)(html).toContain("'Worktree (pending)'");
        });
    });
    // ─── Task Data Structure ─────────────────────────────────────────────
    (0, vitest_1.describe)('worktree task data', () => {
        (0, vitest_1.it)('task with useWorktree=true has correct flag', () => {
            const task = makeTask('wt-1', { useWorktree: true });
            (0, vitest_1.expect)(task.useWorktree).toBe(true);
            (0, vitest_1.expect)(task.worktreePath).toBeUndefined();
        });
        (0, vitest_1.it)('task with worktreePath set has both fields', () => {
            const task = makeTask('wt-2', {
                useWorktree: true,
                worktreePath: '/repo/.worktrees/task-wt2',
            });
            (0, vitest_1.expect)(task.useWorktree).toBe(true);
            (0, vitest_1.expect)(task.worktreePath).toBe('/repo/.worktrees/task-wt2');
        });
        (0, vitest_1.it)('task without useWorktree has no indicator fields', () => {
            const task = makeTask('no-wt');
            (0, vitest_1.expect)(task.useWorktree).toBeUndefined();
            (0, vitest_1.expect)(task.worktreePath).toBeUndefined();
        });
        (0, vitest_1.it)('task with useWorktree=false shows no indicator', () => {
            const task = makeTask('no-wt-2', { useWorktree: false });
            (0, vitest_1.expect)(task.useWorktree).toBe(false);
        });
        (0, vitest_1.it)('worktree indicator is placed after auto-badge and before dep-badge', () => {
            // Verify ordering in the buildCard HTML: auto-badge → worktree-badge → dep-badge
            const autoBadgeIdx = html.indexOf('auto-badge');
            const worktreeBadgeIdx = html.indexOf('worktree-badge', autoBadgeIdx);
            const depBadgeIdx = html.indexOf('dep-badge', worktreeBadgeIdx);
            (0, vitest_1.expect)(autoBadgeIdx).toBeGreaterThan(-1);
            (0, vitest_1.expect)(worktreeBadgeIdx).toBeGreaterThan(autoBadgeIdx);
            (0, vitest_1.expect)(depBadgeIdx).toBeGreaterThan(worktreeBadgeIdx);
        });
    });
});
//# sourceMappingURL=kanbanWorktreeIndicator.test.js.map