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

describe('Kanban AI Add (Green +) Button', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── CSS Styles ──────────────────────────────────────────────────────

    describe('ai-add CSS styles', () => {
        it('includes swim-lane-ai-add button styles', () => {
            expect(html).toContain('.swim-lane-ai-add');
        });

        it('uses green color (#22c55e) for the button', () => {
            expect(html).toMatch(/\.swim-lane-ai-add\s*\{[^}]*color:\s*#22c55e/);
        });

        it('uses green background tint', () => {
            expect(html).toMatch(/\.swim-lane-ai-add\s*\{[^}]*background:\s*rgba\(34,197,94/);
        });

        it('includes hover styles with green color', () => {
            expect(html).toMatch(/\.swim-lane-ai-add:hover\s*\{[^}]*color:\s*#22c55e/);
        });

        it('includes green background tint on hover', () => {
            expect(html).toMatch(/\.swim-lane-ai-add:hover\s*\{[^}]*background:\s*rgba\(34,197,94/);
        });

        it('includes focus-visible outline for accessibility', () => {
            expect(html).toContain('.swim-lane-ai-add:focus-visible');
        });

        it('includes creating (disabled) state', () => {
            expect(html).toContain('.swim-lane-ai-add.creating');
        });

        it('disables pointer events during creating state', () => {
            expect(html).toMatch(/\.swim-lane-ai-add\.creating\s*\{[^}]*pointer-events:\s*none/);
        });

        it('includes spinner styles for loading state', () => {
            expect(html).toContain('.swim-lane-ai-add .ai-add-spinner');
        });

        it('includes spin animation keyframes', () => {
            expect(html).toContain('@keyframes ai-add-spin');
        });
    });

    // ─── Rendering Logic ─────────────────────────────────────────────────

    describe('ai-add button rendering', () => {
        it('includes ai-add button in the buildSwimLane template', () => {
            expect(html).toContain('data-act="ai-add"');
        });

        it('renders ai-add button with swim-lane-ai-add class', () => {
            expect(html).toContain('class="swim-lane-ai-add"');
        });

        it('includes aria-label for accessibility on named lanes', () => {
            expect(html).toContain('aria-label="AI generate task in');
        });

        it('includes tooltip data attribute', () => {
            expect(html).toContain('data-tip="AI generate task"');
        });

        it('renders ai-add button for the default lane', () => {
            expect(html).toContain('aria-label="AI generate task in Default Lane"');
        });

        it('places ai-add button inside swim-lane-actions', () => {
            const actionsIdx = html.indexOf('swim-lane-actions">');
            expect(actionsIdx).toBeGreaterThan(-1);
            const aiAddIdx = html.indexOf('swim-lane-ai-add', actionsIdx);
            expect(aiAddIdx).toBeGreaterThan(actionsIdx);
        });

        it('places ai-add button after the auto-add button', () => {
            const autoAddIdx = html.indexOf('swim-lane-auto-add');
            const aiAddIdx = html.indexOf('swim-lane-ai-add');
            expect(autoAddIdx).toBeGreaterThan(-1);
            expect(aiAddIdx).toBeGreaterThan(autoAddIdx);
        });
    });

    // ─── JavaScript Logic ────────────────────────────────────────────────

    describe('ai-add click handler JavaScript', () => {
        it('includes ai-add button click handler', () => {
            expect(html).toContain("e.target.closest('.swim-lane-ai-add')");
        });

        it('handles ai-add button click before auto-add handler', () => {
            const aiAddHandler = html.indexOf("e.target.closest('.swim-lane-ai-add')");
            const autoAddHandler = html.indexOf("e.target.closest('.swim-lane-auto-add')");
            expect(aiAddHandler).toBeGreaterThan(-1);
            expect(autoAddHandler).toBeGreaterThan(-1);
            expect(aiAddHandler).toBeLessThan(autoAddHandler);
        });

        it('converts __default lane ID to empty string', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain("if (laneId === '__default') laneId = ''");
        });

        it('sends aiCreateTask message', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain("type: 'aiCreateTask'");
        });

        it('passes swimLaneId in the message', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain('swimLaneId: laneId');
        });

        it('adds creating class to disable button during creation', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain("aiAddBtn.classList.add('creating')");
        });

        it('shows spinner during creation', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain('ai-add-spinner');
        });

        it('stops click propagation', () => {
            const aiAddStart = html.indexOf("// AI-add button");
            const aiAddEnd = html.indexOf("// Auto-add button");
            const aiAddSection = html.substring(aiAddStart, aiAddEnd);
            expect(aiAddSection).toContain('e.stopPropagation()');
        });
    });

    // ─── Response Handling ───────────────────────────────────────────────

    describe('aiTaskCreated response handler', () => {
        it('handles aiTaskCreated message type', () => {
            expect(html).toContain("msg.type === 'aiTaskCreated'");
        });

        it('resets ai-add buttons after response', () => {
            expect(html).toContain("swim-lane-ai-add");
            // Checks that creating class is removed
            const resetStart = html.indexOf("msg.type === 'aiTaskCreated'");
            const resetSection = html.substring(resetStart, resetStart + 500);
            expect(resetSection).toContain("classList.remove('creating')");
        });

        it('sets pendingOpenTaskId from the response', () => {
            const resetStart = html.indexOf("msg.type === 'aiTaskCreated'");
            const resetSection = html.substring(resetStart, resetStart + 500);
            expect(resetSection).toContain('pendingOpenTaskId = msg.taskId');
        });

        it('restores button text to plus sign', () => {
            const resetStart = html.indexOf("msg.type === 'aiTaskCreated'");
            const resetSection = html.substring(resetStart, resetStart + 500);
            expect(resetSection).toContain("innerHTML = '+'");
        });
    });

    // ─── Pending Task Modal Open ─────────────────────────────────────────

    describe('pending task modal opening', () => {
        it('declares pendingOpenTaskId variable', () => {
            expect(html).toContain('var pendingOpenTaskId = null');
        });

        it('opens task modal after state update when pendingOpenTaskId is set', () => {
            const updateStateStart = html.indexOf("msg.type === 'updateState'");
            const updateStateEnd = html.indexOf("msg.type === 'tmuxScanResult'");
            const updateSection = html.substring(updateStateStart, updateStateEnd);
            expect(updateSection).toContain('pendingOpenTaskId');
            expect(updateSection).toContain('openTaskModal');
        });

        it('clears pendingOpenTaskId after opening modal', () => {
            const updateStateStart = html.indexOf("msg.type === 'updateState'");
            const updateStateEnd = html.indexOf("msg.type === 'tmuxScanResult'");
            const updateSection = html.substring(updateStateStart, updateStateEnd);
            expect(updateSection).toContain('pendingOpenTaskId = null');
        });

        it('uses findTask to locate the task before opening modal', () => {
            const updateStateStart = html.indexOf("msg.type === 'updateState'");
            const updateStateEnd = html.indexOf("msg.type === 'tmuxScanResult'");
            const updateSection = html.substring(updateStateStart, updateStateEnd);
            expect(updateSection).toContain('findTask(pendingOpenTaskId)');
        });
    });
});
