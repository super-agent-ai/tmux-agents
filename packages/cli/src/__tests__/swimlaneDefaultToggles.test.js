"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const kanbanView_1 = require("../kanbanView");
// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeLane = (id, name, overrides = {}) => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});
(0, vitest_1.describe)('Swimlane Default Toggles', () => {
    let provider;
    let html;
    (0, vitest_1.beforeEach)(() => {
        const extUri = { fsPath: '/test' };
        provider = new kanbanView_1.KanbanViewProvider(extUri);
        html = provider.getHtml();
    });
    // ─── Types ────────────────────────────────────────────────────────────
    (0, vitest_1.describe)('type definitions', () => {
        (0, vitest_1.it)('SwimLaneDefaultToggles supports all five toggle flags', () => {
            const toggles = {
                autoStart: true,
                autoPilot: false,
                autoClose: true,
                useWorktree: false,
                useMemory: true,
            };
            (0, vitest_1.expect)(toggles.autoStart).toBe(true);
            (0, vitest_1.expect)(toggles.autoPilot).toBe(false);
            (0, vitest_1.expect)(toggles.autoClose).toBe(true);
            (0, vitest_1.expect)(toggles.useWorktree).toBe(false);
            (0, vitest_1.expect)(toggles.useMemory).toBe(true);
        });
        (0, vitest_1.it)('KanbanSwimLane accepts optional defaultToggles', () => {
            const lane = makeLane('l1', 'Test', {
                defaultToggles: { autoStart: true, autoPilot: true },
            });
            (0, vitest_1.expect)(lane.defaultToggles).toBeDefined();
            (0, vitest_1.expect)(lane.defaultToggles.autoStart).toBe(true);
            (0, vitest_1.expect)(lane.defaultToggles.autoPilot).toBe(true);
        });
        (0, vitest_1.it)('KanbanSwimLane works without defaultToggles', () => {
            const lane = makeLane('l2', 'NoToggles');
            (0, vitest_1.expect)(lane.defaultToggles).toBeUndefined();
        });
    });
    // ─── CSS Styles ───────────────────────────────────────────────────────
    (0, vitest_1.describe)('default toggles CSS', () => {
        (0, vitest_1.it)('includes default-toggles-section styles', () => {
            (0, vitest_1.expect)(html).toContain('.default-toggles-section');
        });
        (0, vitest_1.it)('includes section-label styles', () => {
            (0, vitest_1.expect)(html).toContain('.section-label');
        });
        (0, vitest_1.it)('includes section-hint styles', () => {
            (0, vitest_1.expect)(html).toContain('.section-hint');
        });
        (0, vitest_1.it)('includes toggle-row styles', () => {
            (0, vitest_1.expect)(html).toContain('.toggle-row');
        });
        (0, vitest_1.it)('includes toggle-chip styles', () => {
            (0, vitest_1.expect)(html).toContain('.toggle-chip');
        });
        (0, vitest_1.it)('includes toggle-chip active state styles', () => {
            (0, vitest_1.expect)(html).toContain('.toggle-chip.active');
        });
        (0, vitest_1.it)('includes default-toggles-badge styles', () => {
            (0, vitest_1.expect)(html).toContain('.default-toggles-badge');
        });
    });
    // ─── Edit Lane Modal HTML ─────────────────────────────────────────────
    (0, vitest_1.describe)('edit lane modal HTML', () => {
        (0, vitest_1.it)('includes Default Task Toggles section label', () => {
            (0, vitest_1.expect)(html).toContain('Default Task Toggles');
        });
        (0, vitest_1.it)('includes hint text for default toggles', () => {
            (0, vitest_1.expect)(html).toContain('New tasks in this lane will inherit these toggles');
        });
        (0, vitest_1.it)('includes Start toggle chip', () => {
            (0, vitest_1.expect)(html).toContain('id="el-dt-start"');
            (0, vitest_1.expect)(html).toContain('data-toggle="autoStart"');
        });
        (0, vitest_1.it)('includes Pilot toggle chip', () => {
            (0, vitest_1.expect)(html).toContain('id="el-dt-pilot"');
            (0, vitest_1.expect)(html).toContain('data-toggle="autoPilot"');
        });
        (0, vitest_1.it)('includes Close toggle chip', () => {
            (0, vitest_1.expect)(html).toContain('id="el-dt-close"');
            (0, vitest_1.expect)(html).toContain('data-toggle="autoClose"');
        });
        (0, vitest_1.it)('includes Worktree toggle chip', () => {
            (0, vitest_1.expect)(html).toContain('id="el-dt-worktree"');
            (0, vitest_1.expect)(html).toContain('data-toggle="useWorktree"');
        });
        (0, vitest_1.it)('includes Memory toggle chip', () => {
            (0, vitest_1.expect)(html).toContain('id="el-dt-memory"');
            (0, vitest_1.expect)(html).toContain('data-toggle="useMemory"');
        });
        (0, vitest_1.it)('includes memory path input field', () => {
            (0, vitest_1.expect)(html).toContain('id="el-memory-path"');
            (0, vitest_1.expect)(html).toContain('id="el-memory-path-field"');
        });
    });
    // ─── JavaScript Logic ─────────────────────────────────────────────────
    (0, vitest_1.describe)('edit lane modal JavaScript', () => {
        (0, vitest_1.it)('references toggle chip DOM elements', () => {
            (0, vitest_1.expect)(html).toContain("document.getElementById('el-dt-start')");
            (0, vitest_1.expect)(html).toContain("document.getElementById('el-dt-pilot')");
            (0, vitest_1.expect)(html).toContain("document.getElementById('el-dt-close')");
            (0, vitest_1.expect)(html).toContain("document.getElementById('el-dt-worktree')");
            (0, vitest_1.expect)(html).toContain("document.getElementById('el-dt-memory')");
        });
        (0, vitest_1.it)('toggles active class on chip click', () => {
            (0, vitest_1.expect)(html).toContain("chip.classList.toggle('active')");
        });
        (0, vitest_1.it)('populates toggle states in openEditLaneModal', () => {
            const openFn = html.substring(html.indexOf('function openEditLaneModal'), html.indexOf('function closeEditLaneModal'));
            (0, vitest_1.expect)(openFn).toContain('lane.defaultToggles');
            (0, vitest_1.expect)(openFn).toContain("elDtStart.classList.toggle('active'");
            (0, vitest_1.expect)(openFn).toContain("elDtPilot.classList.toggle('active'");
            (0, vitest_1.expect)(openFn).toContain("elDtClose.classList.toggle('active'");
            (0, vitest_1.expect)(openFn).toContain("elDtWorktree.classList.toggle('active'");
            (0, vitest_1.expect)(openFn).toContain("elDtMemory.classList.toggle('active'");
        });
        (0, vitest_1.it)('builds defaultToggles object in save handler', () => {
            (0, vitest_1.expect)(html).toContain("elDtStart.classList.contains('active')");
            (0, vitest_1.expect)(html).toContain("elDtPilot.classList.contains('active')");
            (0, vitest_1.expect)(html).toContain("elDtClose.classList.contains('active')");
            (0, vitest_1.expect)(html).toContain("elDtWorktree.classList.contains('active')");
            (0, vitest_1.expect)(html).toContain("elDtMemory.classList.contains('active')");
        });
        (0, vitest_1.it)('sends defaultToggles in editSwimLane message', () => {
            const submitSection = html.substring(html.indexOf("document.getElementById('el-submit').addEventListener"), html.indexOf("document.getElementById('el-browse')"));
            (0, vitest_1.expect)(submitSection).toContain('defaultToggles:');
        });
        (0, vitest_1.it)('updates local swimLane state with defaultToggles', () => {
            const submitSection = html.substring(html.indexOf("document.getElementById('el-submit').addEventListener"), html.indexOf("document.getElementById('el-browse')"));
            (0, vitest_1.expect)(submitSection).toContain('swimLanes[i].defaultToggles');
        });
    });
    // ─── Swimlane Header Badge ────────────────────────────────────────────
    (0, vitest_1.describe)('swimlane header default toggles badge', () => {
        (0, vitest_1.it)('renders badge logic with toggle flags', () => {
            const buildFn = html.substring(html.indexOf('function buildSwimLane'), html.indexOf('function buildDefaultLane'));
            (0, vitest_1.expect)(buildFn).toContain('dt.autoStart');
            (0, vitest_1.expect)(buildFn).toContain('dt.autoPilot');
            (0, vitest_1.expect)(buildFn).toContain('dt.autoClose');
            (0, vitest_1.expect)(buildFn).toContain('dt.useWorktree');
            (0, vitest_1.expect)(buildFn).toContain('dt.useMemory');
        });
        (0, vitest_1.it)('uses default-toggles-badge class for the badge', () => {
            (0, vitest_1.expect)(html).toContain('default-toggles-badge');
        });
        (0, vitest_1.it)('shows gear icon in the badge', () => {
            const buildFn = html.substring(html.indexOf('function buildSwimLane'), html.indexOf('function buildDefaultLane'));
            (0, vitest_1.expect)(buildFn).toContain('&#x2699;');
        });
    });
    // ─── Toggle Inheritance in Webview JS ────────────────────────────────
    (0, vitest_1.describe)('webview toggle inheritance JavaScript', () => {
        (0, vitest_1.it)('defines resolveTaskToggle helper function', () => {
            (0, vitest_1.expect)(html).toContain('function resolveTaskToggle(task, key)');
        });
        (0, vitest_1.it)('resolveTaskToggle checks task value first', () => {
            const fn = html.substring(html.indexOf('function resolveTaskToggle'), html.indexOf('function getServerLabel'));
            (0, vitest_1.expect)(fn).toContain('task[key]');
        });
        (0, vitest_1.it)('resolveTaskToggle falls back to swim lane defaultToggles', () => {
            const fn = html.substring(html.indexOf('function resolveTaskToggle'), html.indexOf('function getServerLabel'));
            (0, vitest_1.expect)(fn).toContain('lane.defaultToggles');
        });
        (0, vitest_1.it)('defines findSwimLane helper function', () => {
            (0, vitest_1.expect)(html).toContain('function findSwimLane(laneId)');
        });
        (0, vitest_1.it)('card builder uses resolveTaskToggle for auto badges', () => {
            (0, vitest_1.expect)(html).toContain("resolveTaskToggle(task, 'autoStart')");
            (0, vitest_1.expect)(html).toContain("resolveTaskToggle(task, 'autoPilot')");
            (0, vitest_1.expect)(html).toContain("resolveTaskToggle(task, 'autoClose')");
            (0, vitest_1.expect)(html).toContain("resolveTaskToggle(task, 'useWorktree')");
        });
        (0, vitest_1.it)('task modal uses resolveTaskToggle for toggle chip states', () => {
            const modalSection = html.substring(html.indexOf('function openTaskModal'), html.indexOf('function closeTaskModal') !== -1 ? html.indexOf('function closeTaskModal') : html.indexOf('function submitTask'));
            (0, vitest_1.expect)(modalSection).toContain('resolveTaskToggle(task');
        });
    });
});
//# sourceMappingURL=swimlaneDefaultToggles.test.js.map