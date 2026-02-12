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

describe('AI Generate Toggle Support', () => {
    let provider: KanbanViewProvider;
    let html: string;

    beforeEach(() => {
        const extUri = { fsPath: '/test' } as vscode.Uri;
        provider = new KanbanViewProvider(extUri);
        html = (provider as any).getHtml() as string;
    });

    // ─── AI Generate sends toggle state ──────────────────────────────────

    describe('AI Generate sends current toggle state', () => {
        it('sends autoStart in aiExpandTask message', () => {
            expect(html).toContain("autoStart: tmAutoStart.classList.contains('active')");
        });

        it('sends autoPilot in aiExpandTask message', () => {
            expect(html).toContain("autoPilot: tmAutoPilot.classList.contains('active')");
        });

        it('sends autoClose in aiExpandTask message', () => {
            expect(html).toContain("autoClose: tmAutoClose.classList.contains('active')");
        });

        it('sends useWorktree in aiExpandTask message', () => {
            expect(html).toContain("useWorktree: tmWorktree.classList.contains('active')");
        });

        it('includes all four toggle states in the aiExpandTask postMessage', () => {
            // Find the aiExpandTask message block
            const msgStart = html.indexOf("type: 'aiExpandTask'");
            expect(msgStart).toBeGreaterThan(-1);
            // Get a chunk after the type field to verify all toggles are in the same message
            const msgBlock = html.substring(msgStart, msgStart + 500);
            expect(msgBlock).toContain('autoStart:');
            expect(msgBlock).toContain('autoPilot:');
            expect(msgBlock).toContain('autoClose:');
            expect(msgBlock).toContain('useWorktree:');
        });
    });

    // ─── AI Generate receives and applies toggle values ──────────────────

    describe('AI Generate result applies toggle values', () => {
        it('checks for msg.toggles in aiExpandResult handler', () => {
            expect(html).toContain('msg.toggles');
        });

        it('applies autoStart toggle from AI response', () => {
            expect(html).toContain("msg.toggles.autoStart");
            // Verify it adds/removes 'active' class on tmAutoStart
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 800
            );
            expect(toggleSection).toContain("tmAutoStart.classList.add('active')");
            expect(toggleSection).toContain("tmAutoStart.classList.remove('active')");
        });

        it('applies autoPilot toggle from AI response', () => {
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 800
            );
            expect(toggleSection).toContain("tmAutoPilot.classList.add('active')");
            expect(toggleSection).toContain("tmAutoPilot.classList.remove('active')");
        });

        it('applies autoClose toggle from AI response', () => {
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 800
            );
            expect(toggleSection).toContain("tmAutoClose.classList.add('active')");
            expect(toggleSection).toContain("tmAutoClose.classList.remove('active')");
        });

        it('applies useWorktree toggle from AI response', () => {
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 1200
            );
            expect(toggleSection).toContain("tmWorktree.classList.add('active')");
            expect(toggleSection).toContain("tmWorktree.classList.remove('active')");
        });

        it('only applies toggles when value is explicitly boolean', () => {
            // Each toggle check uses typeof === 'boolean' guard
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 800
            );
            expect(toggleSection).toMatch(/typeof msg\.toggles\.autoStart === 'boolean'/);
            expect(toggleSection).toMatch(/typeof msg\.toggles\.autoPilot === 'boolean'/);
            expect(toggleSection).toMatch(/typeof msg\.toggles\.autoClose === 'boolean'/);
            expect(toggleSection).toMatch(/typeof msg\.toggles\.useWorktree === 'boolean'/);
        });
    });

    // ─── Toggles unchanged when AI omits them ────────────────────────────

    describe('toggles unchanged when AI does not set them', () => {
        it('toggle application is conditional on msg.toggles existing', () => {
            // The toggle application block is guarded by if (msg.toggles)
            const aiResultHandler = html.substring(
                html.indexOf("if (msg.type === 'aiExpandResult')"),
                html.indexOf("if (msg.type === 'aiExpandResult')") + 1500
            );
            expect(aiResultHandler).toContain('if (msg.toggles)');
        });

        it('each toggle is individually guarded by typeof check', () => {
            const toggleSection = html.substring(
                html.indexOf('if (msg.toggles)'),
                html.indexOf('if (msg.toggles)') + 800
            );
            // Count the number of typeof boolean checks — should be exactly 4
            const checks = toggleSection.match(/typeof msg\.toggles\.\w+ === 'boolean'/g) || [];
            expect(checks.length).toBe(4);
        });
    });

    // ─── Manual toggle control is preserved ──────────────────────────────

    describe('manual toggle control is not disrupted', () => {
        it('preserves click toggle handler via setupToggle', () => {
            expect(html).toContain('function setupToggle');
            expect(html).toContain('setupToggle(tmAutoStart)');
            expect(html).toContain('setupToggle(tmAutoPilot)');
            expect(html).toContain('setupToggle(tmAutoClose)');
            expect(html).toContain('setupToggle(tmWorktree)');
        });

        it('setupToggle adds click listener that toggles active class', () => {
            const setupSection = html.substring(
                html.indexOf('function setupToggle'),
                html.indexOf('function setupToggle') + 300
            );
            expect(setupSection).toContain("el.classList.toggle('active')");
        });

        it('preserves keyboard toggle handler (Enter/Space)', () => {
            const setupSection = html.substring(
                html.indexOf('function setupToggle'),
                html.indexOf('function setupToggle') + 300
            );
            expect(setupSection).toContain("e.key === ' '");
            expect(setupSection).toContain("e.key === 'Enter'");
        });

        it('preserves toggle state read for task save (createTask)', () => {
            expect(html).toContain("var autoStart = tmAutoStart.classList.contains('active')");
            expect(html).toContain("var autoPilot = tmAutoPilot.classList.contains('active')");
            expect(html).toContain("var autoClose = tmAutoClose.classList.contains('active')");
            expect(html).toContain("var useWorktree = tmWorktree.classList.contains('active')");
        });

        it('preserves toggle population when editing existing tasks', () => {
            expect(html).toContain("resolveTaskToggle(task, 'autoStart')) ? tmAutoStart.classList.add('active') : tmAutoStart.classList.remove('active')");
            expect(html).toContain("resolveTaskToggle(task, 'autoPilot')) ? tmAutoPilot.classList.add('active') : tmAutoPilot.classList.remove('active')");
            expect(html).toContain("resolveTaskToggle(task, 'autoClose')) ? tmAutoClose.classList.add('active') : tmAutoClose.classList.remove('active')");
            expect(html).toContain("resolveTaskToggle(task, 'useWorktree')) ? tmWorktree.classList.add('active') : tmWorktree.classList.remove('active')");
        });
    });

    // ─── Toggle HTML structure is intact ─────────────────────────────────

    describe('toggle HTML structure', () => {
        it('includes all four toggle elements with correct IDs', () => {
            expect(html).toContain('id="tm-auto-start"');
            expect(html).toContain('id="tm-auto-pilot"');
            expect(html).toContain('id="tm-auto-close"');
            expect(html).toContain('id="tm-worktree"');
        });

        it('includes toggle labels', () => {
            expect(html).toContain('class="modal-toggle-label">Start</span>');
            expect(html).toContain('class="modal-toggle-label">Pilot</span>');
            expect(html).toContain('class="modal-toggle-label">Close</span>');
            expect(html).toContain('class="modal-toggle-label">Worktree</span>');
        });

        it('includes auto-toggles-row container', () => {
            expect(html).toContain('class="auto-toggles-row"');
        });
    });

    // ─── AI Generate UI elements ─────────────────────────────────────────

    describe('AI Generate UI elements', () => {
        it('includes AI Generate input field', () => {
            expect(html).toContain('id="tm-ai-input"');
        });

        it('includes AI Generate button', () => {
            expect(html).toContain('id="tma-ai-gen"');
        });

        it('includes AI overlay for loading state', () => {
            expect(html).toContain('ai-gen-overlay');
        });
    });
});
