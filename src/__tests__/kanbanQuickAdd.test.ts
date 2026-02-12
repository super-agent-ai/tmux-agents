import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask, KanbanSwimLane } from '../types';
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

const makeLane = (id: string, name: string): KanbanSwimLane => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
});

describe('Kanban Per-Swimlane Quick Add Button', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── CSS Styles ──────────────────────────────────────────────────────

    describe('quick-add CSS styles', () => {
        it('includes swim-lane-quick-add button styles', () => {
            expect(html).toContain('.swim-lane-quick-add');
        });

        it('includes swim-lane-quick-add hover styles', () => {
            expect(html).toContain('.swim-lane-quick-add:hover');
        });

        it('includes quick-add-form styles', () => {
            expect(html).toContain('.quick-add-form');
        });

        it('includes quick-add-form input styles', () => {
            expect(html).toContain('.quick-add-form input');
        });

        it('includes quick-add-submit button styles', () => {
            expect(html).toContain('.quick-add-submit');
        });

        it('includes quick-add-cancel button styles', () => {
            expect(html).toContain('.quick-add-cancel');
        });

        it('uses teal accent on hover for quick-add button', () => {
            expect(html).toMatch(/\.swim-lane-quick-add:hover\s*\{[^}]*color:\s*#4ec9b0/);
        });
    });

    // ─── Rendering Logic ─────────────────────────────────────────────────

    describe('quick-add button rendering', () => {
        it('includes quick-add button in the buildSwimLane template', () => {
            expect(html).toContain('data-act="quick-add"');
        });

        it('renders quick-add button with "+" text', () => {
            expect(html).toContain('class="swim-lane-quick-add"');
        });

        it('includes aria-label for accessibility on named lanes', () => {
            expect(html).toContain('aria-label="Add task to');
        });

        it('includes tooltip data attribute', () => {
            expect(html).toContain('data-tip="Quick add task"');
        });

        it('renders quick-add button for the default lane', () => {
            expect(html).toContain('aria-label="Add task to Default Lane"');
        });

        it('places quick-add button inside swim-lane-actions', () => {
            // The quick-add button should appear within swim-lane-actions
            const actionsIdx = html.indexOf('swim-lane-actions">');
            expect(actionsIdx).toBeGreaterThan(-1);
            // Find the next swim-lane-quick-add after swim-lane-actions
            const quickAddIdx = html.indexOf('swim-lane-quick-add', actionsIdx);
            expect(quickAddIdx).toBeGreaterThan(actionsIdx);
            // Ensure the quick-add is before the next closing div (i.e. inside actions)
            const closingDiv = html.indexOf('</div>', actionsIdx);
            expect(quickAddIdx).toBeLessThan(closingDiv);
        });
    });

    // ─── JavaScript Logic ────────────────────────────────────────────────

    describe('quick-add form JavaScript', () => {
        it('includes showQuickAddForm function', () => {
            expect(html).toContain('function showQuickAddForm');
        });

        it('includes closeQuickAddForm function', () => {
            expect(html).toContain('function closeQuickAddForm');
        });

        it('creates a quick-add-form element', () => {
            expect(html).toContain("form.className = 'quick-add-form'");
        });

        it('creates an input with placeholder', () => {
            expect(html).toContain("input.placeholder = 'Task title...'");
        });

        it('sends createTask message with correct type', () => {
            expect(html).toContain("type: 'createTask'");
        });

        it('sets kanbanColumn to backlog for quick-add tasks', () => {
            // Quick add defaults to backlog column
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain("kanbanColumn: 'backlog'");
        });

        it('passes swimLaneId from the button data attribute', () => {
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain('swimLaneId: laneId');
        });

        it('handles Enter key to submit the form', () => {
            expect(html).toContain("if (e.key === 'Enter')");
        });

        it('handles Escape key to cancel the form', () => {
            expect(html).toContain("if (e.key === 'Escape')");
        });

        it('focuses the input after showing the form', () => {
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain('input.focus()');
        });

        it('handles quick-add button click before collapse toggle', () => {
            // The quick-add handler should be before the header collapse handler
            const quickAddHandler = html.indexOf("e.target.closest('.swim-lane-quick-add')");
            const headerHandler = html.indexOf("// Swim lane header collapse toggle");
            expect(quickAddHandler).toBeGreaterThan(-1);
            expect(headerHandler).toBeGreaterThan(-1);
            expect(quickAddHandler).toBeLessThan(headerHandler);
        });

        it('converts __default lane ID to empty string', () => {
            expect(html).toContain("if (laneId === '__default') laneId = ''");
        });

        it('stops click propagation inside the form', () => {
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain('e.stopPropagation()');
        });

        it('closes existing form before showing a new one', () => {
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain('closeQuickAddForm()');
        });

        it('sets aria-label on the input for accessibility', () => {
            expect(html).toContain("input.setAttribute('aria-label', 'New task title')");
        });

        it('inserts form after the header element', () => {
            const quickAddSection = html.substring(
                html.indexOf('function showQuickAddForm'),
                html.indexOf('function closeQuickAddForm')
            );
            expect(quickAddSection).toContain("swimLaneEl.insertBefore(form, header.nextSibling)");
        });
    });
});
