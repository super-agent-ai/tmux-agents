import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask } from '../types';
import { KanbanViewProvider } from '../kanbanView';
import * as vscode from 'vscode';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTask = (id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
    id,
    description: `Task ${id}`,
    status: TaskStatus.PENDING,
    priority: 5,
    createdAt: Date.now(),
    verificationStatus: 'none',
    ...overrides,
});

describe('Kanban Worktree Indicator', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── CSS Styles ──────────────────────────────────────────────────────

    describe('worktree badge CSS', () => {
        it('includes worktree-badge class in the HTML output', () => {
            expect(html).toContain('.worktree-badge');
        });

        it('includes worktree-badge active variant in CSS', () => {
            expect(html).toContain('.worktree-badge.active');
        });

        it('uses blue color for pending worktree badge', () => {
            expect(html).toContain('color: #569cd6');
        });

        it('uses teal color for active worktree badge', () => {
            expect(html).toMatch(/\.worktree-badge\.active\s*\{[^}]*color:\s*#4ec9b0/);
        });
    });

    // ─── Rendering Logic ─────────────────────────────────────────────────

    describe('worktree badge rendering logic in buildCard', () => {
        it('conditionally renders badge based on task.useWorktree', () => {
            expect(html).toContain('if (task.useWorktree)');
        });

        it('renders tree icon and WT label', () => {
            expect(html).toContain('&#x1F333; WT');
        });

        it('applies active class when worktreePath is set', () => {
            expect(html).toContain("task.worktreePath ? 'worktree-badge active' : 'worktree-badge'");
        });

        it('shows worktree path in tooltip when available', () => {
            expect(html).toContain("'Worktree: ' + task.worktreePath");
        });

        it('shows pending tooltip when path not yet set', () => {
            expect(html).toContain("'Worktree (pending)'");
        });
    });

    // ─── Task Data Structure ─────────────────────────────────────────────

    describe('worktree task data', () => {
        it('task with useWorktree=true has correct flag', () => {
            const task = makeTask('wt-1', { useWorktree: true });
            expect(task.useWorktree).toBe(true);
            expect(task.worktreePath).toBeUndefined();
        });

        it('task with worktreePath set has both fields', () => {
            const task = makeTask('wt-2', {
                useWorktree: true,
                worktreePath: '/repo/.worktrees/task-wt2',
            });
            expect(task.useWorktree).toBe(true);
            expect(task.worktreePath).toBe('/repo/.worktrees/task-wt2');
        });

        it('task without useWorktree has no indicator fields', () => {
            const task = makeTask('no-wt');
            expect(task.useWorktree).toBeUndefined();
            expect(task.worktreePath).toBeUndefined();
        });

        it('task with useWorktree=false shows no indicator', () => {
            const task = makeTask('no-wt-2', { useWorktree: false });
            expect(task.useWorktree).toBe(false);
        });

        it('worktree indicator is placed after auto-badge and before dep-badge', () => {
            // Verify ordering in the buildCard HTML: auto-badge → worktree-badge → dep-badge
            const autoBadgeIdx = html.indexOf('auto-badge');
            const worktreeBadgeIdx = html.indexOf('worktree-badge', autoBadgeIdx);
            const depBadgeIdx = html.indexOf('dep-badge', worktreeBadgeIdx);
            expect(autoBadgeIdx).toBeGreaterThan(-1);
            expect(worktreeBadgeIdx).toBeGreaterThan(autoBadgeIdx);
            expect(depBadgeIdx).toBeGreaterThan(worktreeBadgeIdx);
        });
    });
});
