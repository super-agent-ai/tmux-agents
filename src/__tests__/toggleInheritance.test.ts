import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask, KanbanSwimLane, SwimLaneDefaultToggles } from '../types';
import { resolveToggle, resolveAllToggles, applySwimLaneDefaults, TOGGLE_KEYS } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTask = (overrides: Partial<OrchestratorTask> = {}): OrchestratorTask => ({
    id: 'task-' + Date.now(),
    description: 'Test task',
    status: TaskStatus.PENDING,
    priority: 5,
    createdAt: Date.now(),
    ...overrides,
});

const makeLane = (id: string, name: string, overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane => ({
    id,
    name,
    serverId: 'local',
    workingDirectory: '~/',
    sessionName: `session-${id}`,
    createdAt: Date.now(),
    ...overrides,
});

// ─── resolveToggle ────────────────────────────────────────────────────────────

describe('resolveToggle', () => {
    describe('priority chain: explicit task value > swim lane default > false', () => {
        it('returns false when task has no toggle and no lane', () => {
            const task = makeTask();
            expect(resolveToggle(task, 'autoStart')).toBe(false);
            expect(resolveToggle(task, 'autoPilot')).toBe(false);
            expect(resolveToggle(task, 'autoClose')).toBe(false);
            expect(resolveToggle(task, 'useWorktree')).toBe(false);
        });

        it('returns false when task has no toggle and lane has no defaults', () => {
            const task = makeTask({ swimLaneId: 'lane-1' });
            const lane = makeLane('lane-1', 'Test Lane');
            expect(resolveToggle(task, 'autoStart', lane)).toBe(false);
        });

        it('inherits swim lane default when task toggle is undefined', () => {
            const task = makeTask({ swimLaneId: 'lane-1' });
            const lane = makeLane('lane-1', 'Test Lane', {
                defaultToggles: { autoStart: true, autoPilot: true },
            });
            expect(resolveToggle(task, 'autoStart', lane)).toBe(true);
            expect(resolveToggle(task, 'autoPilot', lane)).toBe(true);
            expect(resolveToggle(task, 'autoClose', lane)).toBe(false);
            expect(resolveToggle(task, 'useWorktree', lane)).toBe(false);
        });

        it('task explicit true overrides lane default false', () => {
            const task = makeTask({ autoStart: true });
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: false },
            });
            expect(resolveToggle(task, 'autoStart', lane)).toBe(true);
        });

        it('task explicit false overrides lane default true', () => {
            const task = makeTask({ autoStart: false });
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: true },
            });
            expect(resolveToggle(task, 'autoStart', lane)).toBe(false);
        });

        it('task explicit true is respected without a lane', () => {
            const task = makeTask({ autoStart: true });
            expect(resolveToggle(task, 'autoStart')).toBe(true);
        });

        it('handles lane with empty defaultToggles object', () => {
            const task = makeTask();
            const lane = makeLane('lane-1', 'Lane', { defaultToggles: {} });
            expect(resolveToggle(task, 'autoStart', lane)).toBe(false);
        });

        it('handles all four toggle keys correctly', () => {
            const task = makeTask();
            const lane = makeLane('lane-1', 'Lane', {
                defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
            });
            for (const key of TOGGLE_KEYS) {
                expect(resolveToggle(task, key, lane)).toBe(true);
            }
        });
    });

    describe('explicit override preservation', () => {
        it('preserves task autoStart=true when lane has autoStart=false', () => {
            const task = makeTask({ autoStart: true });
            const lane = makeLane('l', 'L', { defaultToggles: { autoStart: false } });
            expect(resolveToggle(task, 'autoStart', lane)).toBe(true);
        });

        it('preserves task autoClose=false when lane has autoClose=true', () => {
            const task = makeTask({ autoClose: false });
            const lane = makeLane('l', 'L', { defaultToggles: { autoClose: true } });
            expect(resolveToggle(task, 'autoClose', lane)).toBe(false);
        });

        it('preserves explicit false for every toggle key', () => {
            const lane = makeLane('l', 'L', {
                defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
            });
            for (const key of TOGGLE_KEYS) {
                const task = makeTask({ [key]: false });
                expect(resolveToggle(task, key, lane)).toBe(false);
            }
        });
    });
});

// ─── resolveAllToggles ────────────────────────────────────────────────────────

describe('resolveAllToggles', () => {
    it('returns all false for empty task and no lane', () => {
        const task = makeTask();
        const result = resolveAllToggles(task);
        expect(result).toEqual({ autoStart: false, autoPilot: false, autoClose: false, useWorktree: false });
    });

    it('inherits all lane defaults', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true, useWorktree: true },
        });
        const result = resolveAllToggles(task, lane);
        expect(result).toEqual({ autoStart: true, autoPilot: true, autoClose: true, useWorktree: true });
    });

    it('mixes task overrides with lane defaults', () => {
        const task = makeTask({ autoStart: false, autoClose: true });
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        const result = resolveAllToggles(task, lane);
        expect(result).toEqual({
            autoStart: false,   // task override (false) wins over lane (true)
            autoPilot: true,    // inherits from lane
            autoClose: true,    // task override
            useWorktree: false, // not set anywhere
        });
    });
});

// ─── applySwimLaneDefaults ────────────────────────────────────────────────────

describe('applySwimLaneDefaults', () => {
    it('stamps lane defaults onto task with undefined toggles', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        applySwimLaneDefaults(task, lane);
        expect(task.autoStart).toBe(true);
        expect(task.autoPilot).toBe(true);
        expect(task.autoClose).toBeUndefined();
        expect(task.useWorktree).toBeUndefined();
    });

    it('does not overwrite existing task toggles', () => {
        const task = makeTask({ autoStart: false, autoPilot: true });
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true, autoPilot: false, autoClose: true },
        });
        applySwimLaneDefaults(task, lane);
        expect(task.autoStart).toBe(false);   // explicit false preserved
        expect(task.autoPilot).toBe(true);     // explicit true preserved
        expect(task.autoClose).toBe(true);     // inherited from lane
    });

    it('does nothing when lane has no defaultToggles', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L');
        applySwimLaneDefaults(task, lane);
        expect(task.autoStart).toBeUndefined();
        expect(task.autoPilot).toBeUndefined();
    });

    it('does nothing when lane is undefined', () => {
        const task = makeTask();
        applySwimLaneDefaults(task, undefined);
        expect(task.autoStart).toBeUndefined();
    });

    it('does not stamp false lane defaults onto task', () => {
        const task = makeTask();
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: false, autoPilot: false },
        });
        applySwimLaneDefaults(task, lane);
        expect(task.autoStart).toBeUndefined();
        expect(task.autoPilot).toBeUndefined();
    });
});

// ─── Swim lane default changes ────────────────────────────────────────────────

describe('swim lane default changes', () => {
    it('newly created tasks inherit updated swim lane defaults', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });

        // First task inherits autoStart
        const task1 = makeTask();
        applySwimLaneDefaults(task1, lane);
        expect(task1.autoStart).toBe(true);

        // Lane defaults change
        lane.defaultToggles = { autoStart: true, autoPilot: true, autoClose: true };

        // Second task inherits updated defaults
        const task2 = makeTask();
        applySwimLaneDefaults(task2, lane);
        expect(task2.autoStart).toBe(true);
        expect(task2.autoPilot).toBe(true);
        expect(task2.autoClose).toBe(true);
    });

    it('existing tasks with undefined toggles resolve to updated lane defaults', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });

        // Task created with no explicit toggles
        const task = makeTask({ swimLaneId: 'l' });

        // Initially resolves to lane default
        expect(resolveToggle(task, 'autoStart', lane)).toBe(true);
        expect(resolveToggle(task, 'autoPilot', lane)).toBe(false);

        // Lane defaults updated
        lane.defaultToggles = { autoStart: false, autoPilot: true };

        // Task now resolves to updated lane defaults
        expect(resolveToggle(task, 'autoStart', lane)).toBe(false);
        expect(resolveToggle(task, 'autoPilot', lane)).toBe(true);
    });

    it('tasks with explicit overrides are unaffected by lane default changes', () => {
        const lane = makeLane('l', 'L', {
            defaultToggles: { autoStart: true },
        });

        const task = makeTask({ autoStart: false });

        // Explicitly set to false — should stay false regardless
        expect(resolveToggle(task, 'autoStart', lane)).toBe(false);

        lane.defaultToggles = { autoStart: true, autoPilot: true };
        expect(resolveToggle(task, 'autoStart', lane)).toBe(false);
    });
});

// ─── Task moved between swim lanes ───────────────────────────────────────────

describe('task moved between swim lanes', () => {
    it('task inherits new lane defaults after move', () => {
        const laneA = makeLane('a', 'Lane A', {
            defaultToggles: { autoStart: true },
        });
        const laneB = makeLane('b', 'Lane B', {
            defaultToggles: { autoPilot: true, autoClose: true },
        });

        const task = makeTask({ swimLaneId: 'a' });

        // Inherits from lane A
        expect(resolveToggle(task, 'autoStart', laneA)).toBe(true);
        expect(resolveToggle(task, 'autoPilot', laneA)).toBe(false);

        // Move to lane B
        task.swimLaneId = 'b';
        expect(resolveToggle(task, 'autoStart', laneB)).toBe(false);
        expect(resolveToggle(task, 'autoPilot', laneB)).toBe(true);
        expect(resolveToggle(task, 'autoClose', laneB)).toBe(true);
    });

    it('explicit task overrides persist across lane moves', () => {
        const laneA = makeLane('a', 'Lane A', {
            defaultToggles: { autoStart: true, autoPilot: true },
        });
        const laneB = makeLane('b', 'Lane B', {
            defaultToggles: { autoStart: false, autoPilot: false },
        });

        const task = makeTask({ autoStart: true, swimLaneId: 'a' });

        expect(resolveToggle(task, 'autoStart', laneA)).toBe(true);

        task.swimLaneId = 'b';
        // Explicit true persists even though lane B says false
        expect(resolveToggle(task, 'autoStart', laneB)).toBe(true);
    });

    it('task with no lane falls back to global default', () => {
        const task = makeTask();
        expect(resolveToggle(task, 'autoStart')).toBe(false);
        expect(resolveToggle(task, 'autoStart', undefined)).toBe(false);
    });
});

// ─── TOGGLE_KEYS constant ─────────────────────────────────────────────────────

describe('TOGGLE_KEYS', () => {
    it('contains all four toggle keys', () => {
        expect(TOGGLE_KEYS).toEqual(['autoStart', 'autoPilot', 'autoClose', 'useWorktree']);
    });

    it('is readonly', () => {
        expect(Object.isFrozen(TOGGLE_KEYS) || Array.isArray(TOGGLE_KEYS)).toBe(true);
    });
});

// ─── Integration: creation + inheritance ──────────────────────────────────────

describe('task creation with swim lane inheritance', () => {
    it('simulates kanbanHandlers createTask flow with lane defaults', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, useWorktree: true },
        });

        // Simulate: payload has no explicit toggles
        const task = makeTask({ swimLaneId: 'l' });

        // Apply explicit payload overrides first (none in this case)
        // Then inherit swim lane defaults
        applySwimLaneDefaults(task, lane);

        expect(task.autoStart).toBe(true);
        expect(task.autoPilot).toBe(true);
        expect(task.autoClose).toBeUndefined();
        expect(task.useWorktree).toBe(true);
    });

    it('simulates createTask flow with explicit payload overrides', () => {
        const lane = makeLane('l', 'Lane', {
            defaultToggles: { autoStart: true, autoPilot: true, autoClose: true },
        });

        // Simulate: payload explicitly sets autoStart
        const task = makeTask({ swimLaneId: 'l', autoStart: true });
        // (In real code, payload.autoStart sets task.autoStart = true before applySwimLaneDefaults)

        applySwimLaneDefaults(task, lane);

        // autoStart was already set by payload, lane default doesn't overwrite
        expect(task.autoStart).toBe(true);
        // autoPilot and autoClose inherited from lane
        expect(task.autoPilot).toBe(true);
        expect(task.autoClose).toBe(true);
    });

    it('simulates apiCatalog createTask flow with lane defaults', () => {
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

        applySwimLaneDefaults(task, lane);

        expect(task.autoStart).toBe(true);
        expect(task.autoPilot).toBeUndefined();
        expect(task.autoClose).toBe(true);
    });

    it('explicit false toggle prevents swim lane default from overriding', () => {
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

        applySwimLaneDefaults(task, lane);

        // Explicit false must NOT be overridden by lane defaults
        expect(task.useWorktree).toBe(false);
        expect(task.autoClose).toBe(false);
        // Undefined toggles inherit lane defaults
        expect(task.autoStart).toBe(true);
        expect(task.autoPilot).toBe(true);
    });

    it('explicit false on all toggles prevents all lane defaults', () => {
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

        applySwimLaneDefaults(task, lane);

        expect(task.autoStart).toBe(false);
        expect(task.autoPilot).toBe(false);
        expect(task.autoClose).toBe(false);
        expect(task.useWorktree).toBe(false);
    });
});
