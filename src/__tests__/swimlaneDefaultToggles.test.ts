import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask, KanbanSwimLane, SwimLaneDefaultToggles } from '../types';
import { KanbanViewProvider } from '../kanbanView';
import * as vscode from 'vscode';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeLane = (id: string, name: string, overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});

describe('Swimlane Default Toggles', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── Types ────────────────────────────────────────────────────────────

    describe('type definitions', () => {
        it('SwimLaneDefaultToggles supports all four toggle flags', () => {
            const toggles: SwimLaneDefaultToggles = {
                autoStart: true,
                autoPilot: false,
                autoClose: true,
                useWorktree: false,
            };
            expect(toggles.autoStart).toBe(true);
            expect(toggles.autoPilot).toBe(false);
            expect(toggles.autoClose).toBe(true);
            expect(toggles.useWorktree).toBe(false);
        });

        it('KanbanSwimLane accepts optional defaultToggles', () => {
            const lane = makeLane('l1', 'Test', {
                defaultToggles: { autoStart: true, autoPilot: true },
            });
            expect(lane.defaultToggles).toBeDefined();
            expect(lane.defaultToggles!.autoStart).toBe(true);
            expect(lane.defaultToggles!.autoPilot).toBe(true);
        });

        it('KanbanSwimLane works without defaultToggles', () => {
            const lane = makeLane('l2', 'NoToggles');
            expect(lane.defaultToggles).toBeUndefined();
        });
    });

    // ─── CSS Styles ───────────────────────────────────────────────────────

    describe('default toggles CSS', () => {
        it('includes default-toggles-section styles', () => {
            expect(html).toContain('.default-toggles-section');
        });

        it('includes section-label styles', () => {
            expect(html).toContain('.section-label');
        });

        it('includes section-hint styles', () => {
            expect(html).toContain('.section-hint');
        });

        it('includes toggle-row styles', () => {
            expect(html).toContain('.toggle-row');
        });

        it('includes toggle-chip styles', () => {
            expect(html).toContain('.toggle-chip');
        });

        it('includes toggle-chip active state styles', () => {
            expect(html).toContain('.toggle-chip.active');
        });

        it('includes default-toggles-badge styles', () => {
            expect(html).toContain('.default-toggles-badge');
        });
    });

    // ─── Edit Lane Modal HTML ─────────────────────────────────────────────

    describe('edit lane modal HTML', () => {
        it('includes Default Task Toggles section label', () => {
            expect(html).toContain('Default Task Toggles');
        });

        it('includes hint text for default toggles', () => {
            expect(html).toContain('New tasks in this lane will inherit these toggles');
        });

        it('includes Start toggle chip', () => {
            expect(html).toContain('id="el-dt-start"');
            expect(html).toContain('data-toggle="autoStart"');
        });

        it('includes Pilot toggle chip', () => {
            expect(html).toContain('id="el-dt-pilot"');
            expect(html).toContain('data-toggle="autoPilot"');
        });

        it('includes Close toggle chip', () => {
            expect(html).toContain('id="el-dt-close"');
            expect(html).toContain('data-toggle="autoClose"');
        });

        it('includes Worktree toggle chip', () => {
            expect(html).toContain('id="el-dt-worktree"');
            expect(html).toContain('data-toggle="useWorktree"');
        });
    });

    // ─── JavaScript Logic ─────────────────────────────────────────────────

    describe('edit lane modal JavaScript', () => {
        it('references toggle chip DOM elements', () => {
            expect(html).toContain("document.getElementById('el-dt-start')");
            expect(html).toContain("document.getElementById('el-dt-pilot')");
            expect(html).toContain("document.getElementById('el-dt-close')");
            expect(html).toContain("document.getElementById('el-dt-worktree')");
        });

        it('toggles active class on chip click', () => {
            expect(html).toContain("chip.classList.toggle('active')");
        });

        it('populates toggle states in openEditLaneModal', () => {
            const openFn = html.substring(
                html.indexOf('function openEditLaneModal'),
                html.indexOf('function closeEditLaneModal')
            );
            expect(openFn).toContain('lane.defaultToggles');
            expect(openFn).toContain("elDtStart.classList.toggle('active'");
            expect(openFn).toContain("elDtPilot.classList.toggle('active'");
            expect(openFn).toContain("elDtClose.classList.toggle('active'");
            expect(openFn).toContain("elDtWorktree.classList.toggle('active'");
        });

        it('builds defaultToggles object in save handler', () => {
            expect(html).toContain("elDtStart.classList.contains('active')");
            expect(html).toContain("elDtPilot.classList.contains('active')");
            expect(html).toContain("elDtClose.classList.contains('active')");
            expect(html).toContain("elDtWorktree.classList.contains('active')");
        });

        it('sends defaultToggles in editSwimLane message', () => {
            const submitSection = html.substring(
                html.indexOf("document.getElementById('el-submit').addEventListener"),
                html.indexOf("document.getElementById('el-browse')")
            );
            expect(submitSection).toContain('defaultToggles:');
        });

        it('updates local swimLane state with defaultToggles', () => {
            const submitSection = html.substring(
                html.indexOf("document.getElementById('el-submit').addEventListener"),
                html.indexOf("document.getElementById('el-browse')")
            );
            expect(submitSection).toContain('swimLanes[i].defaultToggles');
        });
    });

    // ─── Swimlane Header Badge ────────────────────────────────────────────

    describe('swimlane header default toggles badge', () => {
        it('renders badge logic with toggle flags', () => {
            const buildFn = html.substring(
                html.indexOf('function buildSwimLane'),
                html.indexOf('function buildDefaultLane')
            );
            expect(buildFn).toContain('dt.autoStart');
            expect(buildFn).toContain('dt.autoPilot');
            expect(buildFn).toContain('dt.autoClose');
            expect(buildFn).toContain('dt.useWorktree');
        });

        it('uses default-toggles-badge class for the badge', () => {
            expect(html).toContain('default-toggles-badge');
        });

        it('shows gear icon in the badge', () => {
            const buildFn = html.substring(
                html.indexOf('function buildSwimLane'),
                html.indexOf('function buildDefaultLane')
            );
            expect(buildFn).toContain('&#x2699;');
        });
    });
});
