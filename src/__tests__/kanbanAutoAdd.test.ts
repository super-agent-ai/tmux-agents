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

describe('Kanban Auto Add (Red +) Button', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── CSS Styles ──────────────────────────────────────────────────────

    describe('auto-add CSS styles', () => {
        it('includes swim-lane-auto-add button styles', () => {
            expect(html).toContain('.swim-lane-auto-add');
        });

        it('includes swim-lane-auto-add hover styles with red color', () => {
            expect(html).toMatch(/\.swim-lane-auto-add:hover\s*\{[^}]*color:\s*#f44747/);
        });

        it('includes red background tint on hover', () => {
            expect(html).toMatch(/\.swim-lane-auto-add:hover\s*\{[^}]*background:\s*rgba\(244,71,71/);
        });

        it('includes focus-visible outline for accessibility', () => {
            expect(html).toContain('.swim-lane-auto-add:focus-visible');
        });

        it('includes creating (disabled) state', () => {
            expect(html).toContain('.swim-lane-auto-add.creating');
        });

        it('disables pointer events during creating state', () => {
            expect(html).toMatch(/\.swim-lane-auto-add\.creating\s*\{[^}]*pointer-events:\s*none/);
        });
    });

    // ─── Rendering Logic ─────────────────────────────────────────────────

    describe('auto-add button rendering', () => {
        it('includes auto-add button in the buildSwimLane template', () => {
            expect(html).toContain('data-act="auto-add"');
        });

        it('renders auto-add button with swim-lane-auto-add class', () => {
            expect(html).toContain('class="swim-lane-auto-add"');
        });

        it('includes aria-label for accessibility on named lanes', () => {
            expect(html).toContain('aria-label="Auto create task in');
        });

        it('includes tooltip data attribute', () => {
            expect(html).toContain('data-tip="Auto create task"');
        });

        it('renders auto-add button for the default lane', () => {
            expect(html).toContain('aria-label="Auto create task in Default Lane"');
        });

        it('places auto-add button inside swim-lane-actions', () => {
            const actionsIdx = html.indexOf('swim-lane-actions">');
            expect(actionsIdx).toBeGreaterThan(-1);
            const autoAddIdx = html.indexOf('swim-lane-auto-add', actionsIdx);
            expect(autoAddIdx).toBeGreaterThan(actionsIdx);
            const closingDiv = html.indexOf('</div>', actionsIdx);
            expect(autoAddIdx).toBeLessThan(closingDiv);
        });

        it('places auto-add button after the quick-add button', () => {
            // In the template, auto-add should come after quick-add
            const quickAddIdx = html.indexOf('swim-lane-quick-add');
            const autoAddIdx = html.indexOf('swim-lane-auto-add');
            expect(quickAddIdx).toBeGreaterThan(-1);
            expect(autoAddIdx).toBeGreaterThan(quickAddIdx);
        });
    });

    // ─── JavaScript Logic ────────────────────────────────────────────────

    describe('auto-add click handler JavaScript', () => {
        it('includes auto-add button click handler', () => {
            expect(html).toContain("e.target.closest('.swim-lane-auto-add')");
        });

        it('handles auto-add button click before quick-add handler', () => {
            const autoAddHandler = html.indexOf("e.target.closest('.swim-lane-auto-add')");
            const quickAddHandler = html.indexOf("e.target.closest('.swim-lane-quick-add')");
            expect(autoAddHandler).toBeGreaterThan(-1);
            expect(quickAddHandler).toBeGreaterThan(-1);
            expect(autoAddHandler).toBeLessThan(quickAddHandler);
        });

        it('converts __default lane ID to empty string', () => {
            // Find the auto-add section specifically
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("if (laneId === '__default') laneId = ''");
        });

        it('sends createTask message', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("type: 'createTask'");
        });

        it('uses default description for auto-created tasks', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("description: 'New task'");
        });

        it('reads lane defaultToggles to determine column', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain('lane.defaultToggles');
        });

        it('sets kanbanColumn to todo when autoStart is enabled', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("dt.autoStart ? 'todo' : 'backlog'");
        });

        it('sets kanbanColumn to backlog when autoStart is disabled', () => {
            // This is the same ternary — autoStart false yields 'backlog'
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("'backlog'");
        });

        it('adds creating class to disable button during creation', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("autoAddBtn.classList.add('creating')");
        });

        it('removes creating class after timeout', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain("autoAddBtn.classList.remove('creating')");
        });

        it('stops click propagation', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain('e.stopPropagation()');
        });

        it('passes swimLaneId from the button data attribute', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain('swimLaneId: laneId');
        });

        it('sets default priority of 5', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain('priority: 5');
        });
    });

    // ─── Autostart Behavior ──────────────────────────────────────────────

    describe('autostart toggle integration', () => {
        it('looks up the lane from swimLanes array', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            expect(autoAddSection).toContain('swimLanes[si].id === laneId');
        });

        it('defaults to empty toggles if lane has no defaultToggles', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            // Should handle missing defaultToggles gracefully
            expect(autoAddSection).toContain('lane.defaultToggles) ? lane.defaultToggles : {}');
        });

        it('handles default lane (no lane found) by using empty toggles', () => {
            const autoAddStart = html.indexOf("// Auto-add button");
            const autoAddEnd = html.indexOf("// Quick-add button");
            const autoAddSection = html.substring(autoAddStart, autoAddEnd);
            // When lane is null, should default to empty toggles
            expect(autoAddSection).toContain('(lane && lane.defaultToggles)');
        });
    });
});
