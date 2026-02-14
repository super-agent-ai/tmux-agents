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
const makeLane = (id, name) => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
});
(0, vitest_1.describe)('Kanban Plan Button', () => {
    let provider;
    let html;
    (0, vitest_1.beforeEach)(() => {
        const extUri = { fsPath: '/test' };
        provider = new kanbanView_1.KanbanViewProvider(extUri);
        html = provider.getHtml();
    });
    // ─── Plan Button CSS ─────────────────────────────────────────────────
    (0, vitest_1.describe)('Plan button CSS', () => {
        (0, vitest_1.it)('includes swim-lane-plan-btn styles', () => {
            (0, vitest_1.expect)(html).toContain('.swim-lane-plan-btn');
        });
        (0, vitest_1.it)('uses purple color for the button', () => {
            (0, vitest_1.expect)(html).toMatch(/\.swim-lane-plan-btn\s*\{[^}]*color:\s*#b482ff/);
        });
        (0, vitest_1.it)('includes hover state', () => {
            (0, vitest_1.expect)(html).toContain('.swim-lane-plan-btn:hover');
        });
    });
    // ─── Plan Modal CSS ──────────────────────────────────────────────────
    (0, vitest_1.describe)('Plan modal CSS', () => {
        (0, vitest_1.it)('includes plan-modal styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-modal');
        });
        (0, vitest_1.it)('includes plan-chat styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-chat');
        });
        (0, vitest_1.it)('includes plan-msg user/ai/error styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-msg.user');
            (0, vitest_1.expect)(html).toContain('.plan-msg.ai');
            (0, vitest_1.expect)(html).toContain('.plan-msg.error');
        });
        (0, vitest_1.it)('includes plan-tasks-display styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-tasks-display');
        });
        (0, vitest_1.it)('includes plan-wave-header styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-wave-header');
        });
        (0, vitest_1.it)('includes plan-task-item styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-task-item');
        });
        (0, vitest_1.it)('includes plan-input-row styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-input-row');
        });
        (0, vitest_1.it)('includes plan-generate-btn styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-generate-btn');
        });
        (0, vitest_1.it)('includes plan-approve-btn styles', () => {
            (0, vitest_1.expect)(html).toContain('.plan-approve-btn');
        });
    });
    // ─── Old CSS absent ──────────────────────────────────────────────────
    (0, vitest_1.describe)('old CSS classes removed', () => {
        (0, vitest_1.it)('does not contain swim-lane-quick-add', () => {
            (0, vitest_1.expect)(html).not.toContain('.swim-lane-quick-add');
        });
        (0, vitest_1.it)('does not contain swim-lane-auto-add', () => {
            (0, vitest_1.expect)(html).not.toContain('.swim-lane-auto-add');
        });
        (0, vitest_1.it)('does not contain swim-lane-ai-add', () => {
            (0, vitest_1.expect)(html).not.toContain('.swim-lane-ai-add');
        });
        (0, vitest_1.it)('does not contain ai-gen-overlay', () => {
            (0, vitest_1.expect)(html).not.toContain('.ai-gen-overlay');
        });
        (0, vitest_1.it)('does not contain ai-gen-btn', () => {
            (0, vitest_1.expect)(html).not.toContain('.ai-gen-btn');
        });
        (0, vitest_1.it)('does not contain quick-add-form', () => {
            (0, vitest_1.expect)(html).not.toContain('.quick-add-form');
        });
    });
    // ─── Plan Button HTML ────────────────────────────────────────────────
    (0, vitest_1.describe)('Plan button HTML', () => {
        (0, vitest_1.it)('includes plan button with data-act="plan"', () => {
            (0, vitest_1.expect)(html).toContain('data-act="plan"');
        });
        (0, vitest_1.it)('includes plan button with swim-lane-plan-btn class', () => {
            (0, vitest_1.expect)(html).toContain('class="swim-lane-plan-btn"');
        });
        (0, vitest_1.it)('plan button has Plan text', () => {
            (0, vitest_1.expect)(html).toMatch(/swim-lane-plan-btn[^>]*>.*Plan<\/button>/);
        });
    });
    // ─── Plan Modal HTML ─────────────────────────────────────────────────
    (0, vitest_1.describe)('Plan modal HTML structure', () => {
        (0, vitest_1.it)('includes plan modal overlay', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-modal-overlay"');
        });
        (0, vitest_1.it)('includes plan chat area', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-chat"');
        });
        (0, vitest_1.it)('includes plan input textarea', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-input"');
        });
        (0, vitest_1.it)('includes plan generate button', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-generate-btn"');
        });
        (0, vitest_1.it)('includes plan approve button', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-approve-btn"');
        });
        (0, vitest_1.it)('includes plan cancel button', () => {
            (0, vitest_1.expect)(html).toContain('id="plan-cancel-btn"');
        });
    });
    // ─── Old HTML absent ─────────────────────────────────────────────────
    (0, vitest_1.describe)('old HTML elements removed', () => {
        (0, vitest_1.it)('does not contain ai-gen-overlay element', () => {
            (0, vitest_1.expect)(html).not.toContain('id="ai-gen-overlay"');
        });
        (0, vitest_1.it)('does not contain ai-gen-btn class in HTML', () => {
            (0, vitest_1.expect)(html).not.toContain('class="ai-gen-btn"');
        });
        (0, vitest_1.it)('does not contain tm-ai-field element', () => {
            (0, vitest_1.expect)(html).not.toContain('id="tm-ai-field"');
        });
        (0, vitest_1.it)('does not contain tm-ai-input element', () => {
            (0, vitest_1.expect)(html).not.toContain('id="tm-ai-input"');
        });
    });
    // ─── computeWaves function ───────────────────────────────────────────
    (0, vitest_1.describe)('computeWaves topological sort', () => {
        (0, vitest_1.it)('includes computeWaves function', () => {
            (0, vitest_1.expect)(html).toContain('function computeWaves');
        });
        (0, vitest_1.it)('tasks with no deps are in Wave 1', () => {
            // The function is embedded in the HTML; verify the logic pattern
            (0, vitest_1.expect)(html).toContain('var waves = []');
            (0, vitest_1.expect)(html).toContain('allMet');
        });
        (0, vitest_1.it)('handles circular deps by dumping to last wave', () => {
            (0, vitest_1.expect)(html).toContain('Circular deps');
        });
    });
    // ─── Plan button in buildLane and buildDefaultLane ────────────────────
    (0, vitest_1.describe)('Plan button in lane builders', () => {
        (0, vitest_1.it)('buildLane includes plan button', () => {
            // Check that buildSwimLane outputs plan button for named lanes
            const laneMatch = html.match(/function buildSwimLane[\s\S]*?function buildDefaultLane/);
            (0, vitest_1.expect)(laneMatch).toBeTruthy();
            (0, vitest_1.expect)(laneMatch[0]).toContain('swim-lane-plan-btn');
        });
        (0, vitest_1.it)('buildDefaultLane includes plan button', () => {
            const defaultMatch = html.match(/function buildDefaultLane[\s\S]*?function /);
            (0, vitest_1.expect)(defaultMatch).toBeTruthy();
            (0, vitest_1.expect)(defaultMatch[0]).toContain('swim-lane-plan-btn');
        });
        (0, vitest_1.it)('buildLane does not include old buttons', () => {
            const laneMatch = html.match(/function buildSwimLane[\s\S]*?function buildDefaultLane/);
            (0, vitest_1.expect)(laneMatch).toBeTruthy();
            (0, vitest_1.expect)(laneMatch[0]).not.toContain('swim-lane-quick-add');
            (0, vitest_1.expect)(laneMatch[0]).not.toContain('swim-lane-auto-add');
            (0, vitest_1.expect)(laneMatch[0]).not.toContain('swim-lane-ai-add');
        });
    });
});
//# sourceMappingURL=kanbanPlanButton.test.js.map