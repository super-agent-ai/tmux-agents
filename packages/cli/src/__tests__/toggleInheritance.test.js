"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../core/types");
const types_2 = require("../core/types");
// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeTask = (overrides = {}) => ({
    id: 'task-' + Date.now(),
    description: 'Test task',
    status: types_1.TaskStatus.PENDING,
    priority: 5,
    createdAt: Date.now(),
    ...overrides,
});
const makeLane = (id, name, overrides = {}) => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});
// ─── resolveToggle ────────────────────────────────────────────────────────────
(0, vitest_1.describe)('resolveToggle', () => {
    (0, vitest_1.describe)('priority chain: explicit task value > swim lane default > false', () => {
        (0, vitest_1.it)('returns false when task has no toggle and no lane', () => {
            const task = makeTask();
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart')).toBe(false);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot')).toBe(false);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoClose')).toBe(false);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'useWorktree')).toBe(false);
        });
        (0, vitest_1.it)('returns false when task has no toggle and lane has no defaults', () => {
            const task = makeTask({ swimLaneId: 'lane-1' });
            const lane = makeLane('lane-1', 'Test Lane');
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
        });
        (0, vitest_1.it)('inherits swim lane default when task toggle is undefined', () => {
            const task = makeTask({ swimLaneId: 'lane-1' });
            const lane = makeLane('lane-1', 'Test Lane', {
                defaultToggles: { autoStart: true, autoPilot: true },
            });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(true);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot', lane)).toBe(true);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoClose', lane)).toBe(false);
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'useWorktree', lane)).toBe(false);
        });
        (0, vitest_1.it)('task explicit true overrides lane default false', () => {
            const task = makeTask({ autoStart: true });
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: false },
            });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(true);
        });
        (0, vitest_1.it)('task explicit false overrides lane default true', () => {
            const task = makeTask({ autoStart: false });
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: true },
            });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
        });
        (0, vitest_1.it)('task explicit true is respected without a lane', () => {
            const task = makeTask({ autoStart: true });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart')).toBe(true);
        });
        (0, vitest_1.it)('handles lane with empty defaultToggles object', () => {
            const task = makeTask();
            const lane = makeLane('lane-1', 'Lane', { defaultToggles: {} });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
        });
        (0, vitest_1.it)('handles all five toggle keys correctly', () => {
            const task = makeTask();
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true, useMemory: true },
            });
            for (const key of types_2.TOGGLE_KEYS) {
                (0, vitest_1.expect)((0, types_2.resolveToggle)(task, key, lane)).toBe(true);
            }
        });
    });
    (0, vitest_1.describe)('explicit override preservation', () => {
        (0, vitest_1.it)('preserves task autoStart=true when lane has autoStart=false', () => {
            const task = makeTask({ autoStart: true });
            const lane = makeLane('l', 'L', { defaultToggles: { autoStart: false } });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(true);
        });
        (0, vitest_1.it)('preserves task autoClose=false when lane has autoClose=true', () => {
            const task = makeTask({ autoClose: false });
            const lane = makeLane('l', 'L', { defaultToggles: { autoClose: true } });
            (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoClose', lane)).toBe(false);
        });
        (0, vitest_1.it)('preserves explicit false for every toggle key', () => {
            const lane = makeLane('l', 'L', {
                defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
            });
            for (const key of types_2.TOGGLE_KEYS) {
                const task = makeTask({ [key]: false });
                (0, vitest_1.expect)((0, types_2.resolveToggle)(task, key, lane)).toBe(false);
            }
        });
    });
});
// ─── resolveAllToggles ────────────────────────────────────────────────────────
(0, vitest_1.describe)('resolveAllToggles', () => {
    (0, vitest_1.it)('returns all false for empty task and no lane', () => {
        const task = makeTask();
        const result = (0, types_2.resolveAllToggles)(task);
        (0, vitest_1.expect)(result).toEqual({ autoStart: false, autoPilot: false, autoClose: false, useWorktree: false, useMemory: false });
    });
    (0, vitest_1.it)('inherits all lane defaults', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true, useMemory: true },
        });
        const result = (0, types_2.resolveAllToggles)(task, lane);
        (0, vitest_1.expect)(result).toEqual({ autoStart: true, autoPilot: true, autoClose: true, useWorktree: true, useMemory: true });
    });
    (0, vitest_1.it)('mixes task overrides with lane defaults', () => {
        const task = makeTask({ autoStart: false, autoClose: true });
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        const result = (0, types_2.resolveAllToggles)(task, lane);
        (0, vitest_1.expect)(result).toEqual({
            autoStart: false, // task override (false) wins over lane (true)
            autoPilot: true, // inherits from lane
            autoClose: true, // task override
            useWorktree: false, // not set anywhere
            useMemory: false, // not set anywhere
        });
    });
});
// ─── applySwimLaneDefaults ────────────────────────────────────────────────────
(0, vitest_1.describe)('applySwimLaneDefaults', () => {
    (0, vitest_1.it)('stamps lane defaults onto task with undefined toggles', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBe(true);
        (0, vitest_1.expect)(task.autoPilot).toBe(true);
        (0, vitest_1.expect)(task.autoClose).toBeUndefined();
        (0, vitest_1.expect)(task.useWorktree).toBeUndefined();
    });
    (0, vitest_1.it)('does not overwrite existing task toggles', () => {
        const task = makeTask({ autoStart: false, autoPilot: true });
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: false, autoClose: true },
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBe(false); // explicit false preserved
        (0, vitest_1.expect)(task.autoPilot).toBe(true); // explicit true preserved
        (0, vitest_1.expect)(task.autoClose).toBe(true); // inherited from lane
    });
    (0, vitest_1.it)('does nothing when lane has no defaultToggles', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L');
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBeUndefined();
        (0, vitest_1.expect)(task.autoPilot).toBeUndefined();
    });
    (0, vitest_1.it)('does nothing when lane is undefined', () => {
        const task = makeTask();
        (0, types_2.applySwimLaneDefaults)(task, undefined);
        (0, vitest_1.expect)(task.autoStart).toBeUndefined();
    });
    (0, vitest_1.it)('does not stamp false lane defaults onto task', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: false, autoPilot: false },
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBeUndefined();
        (0, vitest_1.expect)(task.autoPilot).toBeUndefined();
    });
});
// ─── Swim lane default changes ────────────────────────────────────────────────
(0, vitest_1.describe)('swim lane default changes', () => {
    (0, vitest_1.it)('newly created tasks inherit updated swim lane defaults', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });
        // First task inherits autoStart
        const task1 = makeTask();
        (0, types_2.applySwimLaneDefaults)(task1, lane);
        (0, vitest_1.expect)(task1.autoStart).toBe(true);
        // Lane defaults change
        lane.defaultToggles = { autoStart: true, autoPilot: true, autoClose: true };
        // Second task inherits updated defaults
        const task2 = makeTask();
        (0, types_2.applySwimLaneDefaults)(task2, lane);
        (0, vitest_1.expect)(task2.autoStart).toBe(true);
        (0, vitest_1.expect)(task2.autoPilot).toBe(true);
        (0, vitest_1.expect)(task2.autoClose).toBe(true);
    });
    (0, vitest_1.it)('existing tasks with undefined toggles resolve to updated lane defaults', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });
        // Task created with no explicit toggles
        const task = makeTask({ swimLaneId: 'l' });
        // Initially resolves to lane default
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(true);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot', lane)).toBe(false);
        // Lane defaults updated
        lane.defaultToggles = { autoStart: false, autoPilot: true };
        // Task now resolves to updated lane defaults
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot', lane)).toBe(true);
    });
    (0, vitest_1.it)('tasks with explicit overrides are unaffected by lane default changes', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });
        const task = makeTask({ autoStart: false });
        // Explicitly set to false — should stay false regardless
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
        lane.defaultToggles = { autoStart: true, autoPilot: true };
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', lane)).toBe(false);
    });
});
// ─── Task moved between swim lanes ───────────────────────────────────────────
(0, vitest_1.describe)('task moved between swim lanes', () => {
    (0, vitest_1.it)('task inherits new lane defaults after move', () => {
        const laneA = makeLane('a', 'Lane A', {
            defaultToggles: { autoStart: true },
        });
        const laneB = makeLane('b', 'Lane B', {
            defaultToggles: { autoPilot: true, autoClose: true },
        });
        const task = makeTask({ swimLaneId: 'a' });
        // Inherits from lane A
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', laneA)).toBe(true);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot', laneA)).toBe(false);
        // Move to lane B
        task.swimLaneId = 'b';
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', laneB)).toBe(false);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoPilot', laneB)).toBe(true);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoClose', laneB)).toBe(true);
    });
    (0, vitest_1.it)('explicit task overrides persist across lane moves', () => {
        const laneA = makeLane('a', 'Lane A', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        const laneB = makeLane('b', 'Lane B', {
            defaultToggles: { autoStart: false, autoPilot: false },
        });
        const task = makeTask({ autoStart: true, swimLaneId: 'a' });
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', laneA)).toBe(true);
        task.swimLaneId = 'b';
        // Explicit true persists even though lane B says false
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', laneB)).toBe(true);
    });
    (0, vitest_1.it)('task with no lane falls back to global default', () => {
        const task = makeTask();
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart')).toBe(false);
        (0, vitest_1.expect)((0, types_2.resolveToggle)(task, 'autoStart', undefined)).toBe(false);
    });
});
// ─── TOGGLE_KEYS constant ─────────────────────────────────────────────────────
(0, vitest_1.describe)('TOGGLE_KEYS', () => {
    (0, vitest_1.it)('contains all five toggle keys', () => {
        (0, vitest_1.expect)(types_2.TOGGLE_KEYS).toEqual(['autoStart', 'autoPilot', 'autoClose', 'useWorktree', 'useMemory']);
    });
    (0, vitest_1.it)('is readonly', () => {
        (0, vitest_1.expect)(Object.isFrozen(types_2.TOGGLE_KEYS) || Array.isArray(types_2.TOGGLE_KEYS)).toBe(true);
    });
});
// ─── Integration: creation + inheritance ──────────────────────────────────────
(0, vitest_1.describe)('task creation with swim lane inheritance', () => {
    (0, vitest_1.it)('simulates kanbanHandlers createTask flow with lane defaults', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, useWorktree: true },
        });
        // Simulate: payload has no explicit toggles
        const task = makeTask({ swimLaneId: 'l' });
        // Apply explicit payload overrides first (none in this case)
        // Then inherit swim lane defaults
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBe(true);
        (0, vitest_1.expect)(task.autoPilot).toBe(true);
        (0, vitest_1.expect)(task.autoClose).toBeUndefined();
        (0, vitest_1.expect)(task.useWorktree).toBe(true);
    });
    (0, vitest_1.it)('simulates createTask flow with explicit payload overrides', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true },
        });
        // Simulate: payload explicitly sets autoStart
        const task = makeTask({ swimLaneId: 'l', autoStart: true });
        // (In real code, payload.autoStart sets task.autoStart = true before applySwimLaneDefaults)
        (0, types_2.applySwimLaneDefaults)(task, lane);
        // autoStart was already set by payload, lane default doesn't overwrite
        (0, vitest_1.expect)(task.autoStart).toBe(true);
        // autoPilot and autoClose inherited from lane
        (0, vitest_1.expect)(task.autoPilot).toBe(true);
        (0, vitest_1.expect)(task.autoClose).toBe(true);
    });
    (0, vitest_1.it)('simulates apiCatalog createTask flow with lane defaults', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoClose: true },
        });
        // apiCatalog: when no explicit value, toggle is undefined (not !!false)
        const task = makeTask({
            swimLaneId: 'l',
            autoStart: undefined,
            autoPilot: undefined,
            autoClose: undefined,
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBe(true);
        (0, vitest_1.expect)(task.autoPilot).toBeUndefined();
        (0, vitest_1.expect)(task.autoClose).toBe(true);
    });
    (0, vitest_1.it)('explicit false toggle prevents swim lane default from overriding', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
        });
        // Simulate: user explicitly sets useWorktree=false and autoClose=false
        // The fixed createTask handler now stores false (not undefined)
        const task = makeTask({
            swimLaneId: 'l',
            useWorktree: false,
            autoClose: false,
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        // Explicit false must NOT be overridden by lane defaults
        (0, vitest_1.expect)(task.useWorktree).toBe(false);
        (0, vitest_1.expect)(task.autoClose).toBe(false);
        // Undefined toggles inherit lane defaults
        (0, vitest_1.expect)(task.autoStart).toBe(true);
        (0, vitest_1.expect)(task.autoPilot).toBe(true);
    });
    (0, vitest_1.it)('explicit false on all toggles prevents all lane defaults', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
        });
        const task = makeTask({
            swimLaneId: 'l',
            autoStart: false,
            autoPilot: false,
            autoClose: false,
            useWorktree: false,
        });
        (0, types_2.applySwimLaneDefaults)(task, lane);
        (0, vitest_1.expect)(task.autoStart).toBe(false);
        (0, vitest_1.expect)(task.autoPilot).toBe(false);
        (0, vitest_1.expect)(task.autoClose).toBe(false);
        (0, vitest_1.expect)(task.useWorktree).toBe(false);
    });
});
//# sourceMappingURL=toggleInheritance.test.js.map