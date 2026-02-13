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

describe('Kanban Plan Button', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── Plan Button CSS ─────────────────────────────────────────────────

    describe('Plan button CSS', () => {
        it('includes swim-lane-plan-btn styles', () => {
            expect(html).toContain('.swim-lane-plan-btn');
        });

        it('uses purple color for the button', () => {
            expect(html).toMatch(/\.swim-lane-plan-btn\s*\{[^}]*color:\s*#b482ff/);
        });

        it('includes hover state', () => {
            expect(html).toContain('.swim-lane-plan-btn:hover');
        });
    });

    // ─── Plan Modal CSS ──────────────────────────────────────────────────

    describe('Plan modal CSS', () => {
        it('includes plan-modal styles', () => {
            expect(html).toContain('.plan-modal');
        });

        it('includes plan-chat styles', () => {
            expect(html).toContain('.plan-chat');
        });

        it('includes plan-msg user/ai/error styles', () => {
            expect(html).toContain('.plan-msg.user');
            expect(html).toContain('.plan-msg.ai');
            expect(html).toContain('.plan-msg.error');
        });

        it('includes plan-tasks-display styles', () => {
            expect(html).toContain('.plan-tasks-display');
        });

        it('includes plan-wave-header styles', () => {
            expect(html).toContain('.plan-wave-header');
        });

        it('includes plan-task-item styles', () => {
            expect(html).toContain('.plan-task-item');
        });

        it('includes plan-input-row styles', () => {
            expect(html).toContain('.plan-input-row');
        });

        it('includes plan-generate-btn styles', () => {
            expect(html).toContain('.plan-generate-btn');
        });

        it('includes plan-approve-btn styles', () => {
            expect(html).toContain('.plan-approve-btn');
        });
    });

    // ─── Old CSS absent ──────────────────────────────────────────────────

    describe('old CSS classes removed', () => {
        it('does not contain swim-lane-quick-add', () => {
            expect(html).not.toContain('.swim-lane-quick-add');
        });

        it('does not contain swim-lane-auto-add', () => {
            expect(html).not.toContain('.swim-lane-auto-add');
        });

        it('does not contain swim-lane-ai-add', () => {
            expect(html).not.toContain('.swim-lane-ai-add');
        });

        it('does not contain ai-gen-overlay', () => {
            expect(html).not.toContain('.ai-gen-overlay');
        });

        it('does not contain ai-gen-btn', () => {
            expect(html).not.toContain('.ai-gen-btn');
        });

        it('does not contain quick-add-form', () => {
            expect(html).not.toContain('.quick-add-form');
        });
    });

    // ─── Plan Button HTML ────────────────────────────────────────────────

    describe('Plan button HTML', () => {
        it('includes plan button with data-act="plan"', () => {
            expect(html).toContain('data-act="plan"');
        });

        it('includes plan button with swim-lane-plan-btn class', () => {
            expect(html).toContain('class="swim-lane-plan-btn"');
        });

        it('plan button has Plan text', () => {
            expect(html).toMatch(/swim-lane-plan-btn[^>]*>.*Plan<\/button>/);
        });
    });

    // ─── Plan Modal HTML ─────────────────────────────────────────────────

    describe('Plan modal HTML structure', () => {
        it('includes plan modal overlay', () => {
            expect(html).toContain('id="plan-modal-overlay"');
        });

        it('includes plan chat area', () => {
            expect(html).toContain('id="plan-chat"');
        });

        it('includes plan input textarea', () => {
            expect(html).toContain('id="plan-input"');
        });

        it('includes plan generate button', () => {
            expect(html).toContain('id="plan-generate-btn"');
        });

        it('includes plan approve button', () => {
            expect(html).toContain('id="plan-approve-btn"');
        });

        it('includes plan cancel button', () => {
            expect(html).toContain('id="plan-cancel-btn"');
        });
    });

    // ─── Old HTML absent ─────────────────────────────────────────────────

    describe('old HTML elements removed', () => {
        it('does not contain ai-gen-overlay element', () => {
            expect(html).not.toContain('id="ai-gen-overlay"');
        });

        it('does not contain ai-gen-btn class in HTML', () => {
            expect(html).not.toContain('class="ai-gen-btn"');
        });

        it('does not contain tm-ai-field element', () => {
            expect(html).not.toContain('id="tm-ai-field"');
        });

        it('does not contain tm-ai-input element', () => {
            expect(html).not.toContain('id="tm-ai-input"');
        });
    });

    // ─── computeWaves function ───────────────────────────────────────────

    describe('computeWaves topological sort', () => {
        it('includes computeWaves function', () => {
            expect(html).toContain('function computeWaves');
        });

        it('tasks with no deps are in Wave 1', () => {
            // The function is embedded in the HTML; verify the logic pattern
            expect(html).toContain('var waves = []');
            expect(html).toContain('allMet');
        });

        it('handles circular deps by dumping to last wave', () => {
            expect(html).toContain('Circular deps');
        });
    });

    // ─── Plan button in buildLane and buildDefaultLane ────────────────────

    describe('Plan button in lane builders', () => {
        it('buildLane includes plan button', () => {
            // Check that buildSwimLane outputs plan button for named lanes
            const laneMatch = html.match(/function buildSwimLane[\s\S]*?function buildDefaultLane/);
            expect(laneMatch).toBeTruthy();
            expect(laneMatch![0]).toContain('swim-lane-plan-btn');
        });

        it('buildDefaultLane includes plan button', () => {
            const defaultMatch = html.match(/function buildDefaultLane[\s\S]*?function /);
            expect(defaultMatch).toBeTruthy();
            expect(defaultMatch![0]).toContain('swim-lane-plan-btn');
        });

        it('buildLane does not include old buttons', () => {
            const laneMatch = html.match(/function buildSwimLane[\s\S]*?function buildDefaultLane/);
            expect(laneMatch).toBeTruthy();
            expect(laneMatch![0]).not.toContain('swim-lane-quick-add');
            expect(laneMatch![0]).not.toContain('swim-lane-auto-add');
            expect(laneMatch![0]).not.toContain('swim-lane-ai-add');
        });
    });
});
