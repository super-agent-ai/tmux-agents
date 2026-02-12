import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../types';
import type { OrchestratorTask } from '../types';
import {
    groupByTags,
    groupByDependencies,
    groupByCreatedDate,
    groupByStartedDate,
    computeSwimlaneGroups,
    collectAllTags,
    defaultFilterState,
    classifyDateBucket,
    classifyDependency,
    type SwimlaneFilterState,
    type SwimlaneGroup,
} from '../swimlaneGrouping';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
    return {
        id,
        description: `Task ${id}`,
        status: TaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        ...overrides,
    };
}

// Fixed timestamp for deterministic date tests: 2026-02-11 12:00 UTC (Wednesday)
const NOW = new Date('2026-02-11T12:00:00Z').getTime();
const ONE_DAY = 86400000;
const ONE_HOUR = 3600000;

// ─── groupByTags ────────────────────────────────────────────────────────────

describe('groupByTags', () => {
    it('groups tasks by their tags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['feature', 'bug'] }),
            makeTask('4', { tags: [] }),
        ];

        const groups = groupByTags(tasks, []);

        expect(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['2', '3']);
        expect(groups.find(g => g.label === 'feature')?.taskIds).toEqual(['1', '3']);
        expect(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['4']);
    });

    it('places tasks with no tags array into Untagged', () => {
        const tasks = [
            makeTask('1'),
            makeTask('2', { tags: undefined }),
        ];

        const groups = groupByTags(tasks, []);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Untagged');
        expect(groups[0].taskIds).toEqual(['1', '2']);
    });

    it('places tasks with empty tags array into Untagged', () => {
        const tasks = [makeTask('1', { tags: [] })];
        const groups = groupByTags(tasks, []);
        expect(groups[0].label).toBe('Untagged');
        expect(groups[0].taskIds).toEqual(['1']);
    });

    it('task with multiple tags appears in each relevant group', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug', 'urgent'] }),
        ];
        const groups = groupByTags(tasks, []);

        const featureGroup = groups.find(g => g.label === 'feature');
        const bugGroup = groups.find(g => g.label === 'bug');
        const urgentGroup = groups.find(g => g.label === 'urgent');

        expect(featureGroup?.taskIds).toContain('1');
        expect(bugGroup?.taskIds).toContain('1');
        expect(urgentGroup?.taskIds).toContain('1');
    });

    it('filters by selectedTags when provided', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['docs'] }),
        ];

        const groups = groupByTags(tasks, ['bug']);

        // Only 'bug' group + untagged should appear
        expect(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['1', '2']);
        expect(groups.find(g => g.label === 'feature')).toBeUndefined();
        // Task 3 (docs only, not in selectedTags) → untagged
        expect(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['3']);
    });

    it('multi-select tags filter shows all matching tags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['docs'] }),
        ];

        const groups = groupByTags(tasks, ['feature', 'bug']);

        expect(groups.find(g => g.label === 'feature')?.taskIds).toEqual(['1']);
        expect(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['2']);
        expect(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['3']);
    });

    it('returns empty groups for no tasks', () => {
        const groups = groupByTags([], []);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Untagged');
        expect(groups[0].taskIds).toEqual([]);
    });

    it('sorts tag groups alphabetically when no selectedTags', () => {
        const tasks = [
            makeTask('1', { tags: ['zebra'] }),
            makeTask('2', { tags: ['apple'] }),
            makeTask('3', { tags: ['mango'] }),
        ];

        const groups = groupByTags(tasks, []);
        const labels = groups.map(g => g.label);
        expect(labels).toEqual(['apple', 'mango', 'zebra', 'Untagged']);
    });

    it('preserves selectedTags order', () => {
        const tasks = [
            makeTask('1', { tags: ['bug', 'feature'] }),
        ];

        const groups = groupByTags(tasks, ['feature', 'bug']);
        expect(groups[0].label).toBe('feature');
        expect(groups[1].label).toBe('bug');
    });
});

// ─── groupByDependencies ────────────────────────────────────────────────────

describe('groupByDependencies', () => {
    it('classifies tasks into blocked, unblocked, and no dependencies', () => {
        const tasks = [
            makeTask('1', { status: TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { dependsOn: ['1'] }), // unblocked (dep completed)
            makeTask('3', { dependsOn: ['99'] }), // blocked (dep not found)
            makeTask('4'), // no dependencies
        ];

        const groups = groupByDependencies(tasks);

        expect(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['3']);
        expect(groups.find(g => g.label === 'Unblocked')?.taskIds).toEqual(['2']);
        expect(groups.find(g => g.label === 'No Dependencies')?.taskIds).toContain('1');
        expect(groups.find(g => g.label === 'No Dependencies')?.taskIds).toContain('4');
    });

    it('task with all deps completed is unblocked', () => {
        const tasks = [
            makeTask('1', { status: TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { status: TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('3', { dependsOn: ['1', '2'] }),
        ];

        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Unblocked')?.taskIds).toEqual(['3']);
    });

    it('task with partial deps completed is blocked', () => {
        const tasks = [
            makeTask('1', { status: TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { status: TaskStatus.IN_PROGRESS }),
            makeTask('3', { dependsOn: ['1', '2'] }),
        ];

        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['3']);
    });

    it('handles circular dependencies safely (does not stack overflow)', () => {
        // Circular: A depends on B, B depends on A
        const tasks = [
            makeTask('A', { dependsOn: ['B'] }),
            makeTask('B', { dependsOn: ['A'] }),
        ];

        // Should not throw and should classify both as blocked
        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['A', 'B']);
    });

    it('handles empty task list', () => {
        const groups = groupByDependencies([]);
        expect(groups).toHaveLength(3);
        expect(groups.every(g => g.taskIds.length === 0)).toBe(true);
    });

    it('task with empty dependsOn array has no dependencies', () => {
        const tasks = [makeTask('1', { dependsOn: [] })];
        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'No Dependencies')?.taskIds).toEqual(['1']);
    });
});

// ─── classifyDependency ─────────────────────────────────────────────────────

describe('classifyDependency', () => {
    it('returns noDependencies for task with no dependsOn', () => {
        const task = makeTask('1');
        expect(classifyDependency(task, new Set())).toBe('noDependencies');
    });

    it('returns blocked when deps are not in completed set', () => {
        const task = makeTask('1', { dependsOn: ['2'] });
        expect(classifyDependency(task, new Set())).toBe('blocked');
    });

    it('returns unblocked when all deps are in completed set', () => {
        const task = makeTask('1', { dependsOn: ['2', '3'] });
        expect(classifyDependency(task, new Set(['2', '3']))).toBe('unblocked');
    });
});

// ─── classifyDateBucket ─────────────────────────────────────────────────────

describe('classifyDateBucket', () => {
    it('classifies undefined timestamp as noDate', () => {
        expect(classifyDateBucket(undefined, NOW)).toBe('noDate');
    });

    it('classifies timestamp from today as today', () => {
        expect(classifyDateBucket(NOW - ONE_HOUR, NOW)).toBe('today');
    });

    it('classifies timestamp from earlier this week as thisWeek', () => {
        // NOW is Wednesday; Monday would be 2 days ago
        const monday = NOW - 2 * ONE_DAY;
        expect(classifyDateBucket(monday, NOW)).toBe('thisWeek');
    });

    it('classifies timestamp from earlier this month as thisMonth', () => {
        // Feb 2, 2026 (9 days ago from Feb 11)
        const earlyMonth = new Date('2026-02-02T12:00:00Z').getTime();
        expect(classifyDateBucket(earlyMonth, NOW)).toBe('thisMonth');
    });

    it('classifies timestamp from last month as older', () => {
        const lastMonth = new Date('2026-01-15T12:00:00Z').getTime();
        expect(classifyDateBucket(lastMonth, NOW)).toBe('older');
    });

    it('classifies zero timestamp as noDate (falsy)', () => {
        // 0 is falsy in JS, so treated as missing
        expect(classifyDateBucket(0, NOW)).toBe('noDate');
    });
});

// ─── groupByCreatedDate ─────────────────────────────────────────────────────

describe('groupByCreatedDate', () => {
    it('groups tasks into date buckets based on createdAt', () => {
        const tasks = [
            makeTask('1', { createdAt: NOW - ONE_HOUR }), // today
            makeTask('2', { createdAt: NOW - 2 * ONE_DAY }), // this week (Wed - 2 = Mon)
            makeTask('3', { createdAt: new Date('2026-02-02T12:00:00Z').getTime() }), // this month
            makeTask('4', { createdAt: new Date('2025-12-01T12:00:00Z').getTime() }), // older
            makeTask('5', { createdAt: 1 }), // epoch → older
        ];

        const groups = groupByCreatedDate(tasks, NOW);

        expect(groups.find(g => g.label === 'Today')?.taskIds).toEqual(['1']);
        expect(groups.find(g => g.label === 'This Week')?.taskIds).toEqual(['2']);
        expect(groups.find(g => g.label === 'This Month')?.taskIds).toEqual(['3']);
        expect(groups.find(g => g.label === 'Older')?.taskIds).toContain('4');
    });

    it('returns all five buckets', () => {
        const groups = groupByCreatedDate([], NOW);
        expect(groups).toHaveLength(5);
        expect(groups.map(g => g.label)).toEqual([
            'Today', 'This Week', 'This Month', 'Older', 'No Date'
        ]);
    });

    it('handles empty task list', () => {
        const groups = groupByCreatedDate([], NOW);
        expect(groups.every(g => g.taskIds.length === 0)).toBe(true);
    });
});

// ─── groupByStartedDate ─────────────────────────────────────────────────────

describe('groupByStartedDate', () => {
    it('groups tasks by startedAt timestamp', () => {
        const tasks = [
            makeTask('1', { startedAt: NOW - ONE_HOUR }), // today
            makeTask('2', { startedAt: NOW - 2 * ONE_DAY }), // this week
            makeTask('3'), // not started (no startedAt)
        ];

        const groups = groupByStartedDate(tasks, NOW);

        expect(groups.find(g => g.label === 'Today')?.taskIds).toEqual(['1']);
        expect(groups.find(g => g.label === 'This Week')?.taskIds).toEqual(['2']);
        expect(groups.find(g => g.label === 'Not Started')?.taskIds).toEqual(['3']);
    });

    it('labels the noDate bucket as "Not Started"', () => {
        const groups = groupByStartedDate([], NOW);
        const noDateGroup = groups.find(g => g.key === 'started:noDate');
        expect(noDateGroup?.label).toBe('Not Started');
    });

    it('handles tasks with startedAt = undefined', () => {
        const tasks = [
            makeTask('1', { startedAt: undefined }),
            makeTask('2'),
        ];

        const groups = groupByStartedDate(tasks, NOW);
        expect(groups.find(g => g.label === 'Not Started')?.taskIds).toEqual(['1', '2']);
    });
});

// ─── computeSwimlaneGroups ──────────────────────────────────────────────────

describe('computeSwimlaneGroups', () => {
    it('returns empty array for criterion "none"', () => {
        const tasks = [makeTask('1')];
        const filter = defaultFilterState();
        expect(computeSwimlaneGroups(tasks, filter)).toEqual([]);
    });

    it('dispatches to groupByTags for criterion "tags"', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
        ];
        const filter: SwimlaneFilterState = {
            criterion: 'tags',
            selectedTags: [],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter);
        expect(groups.length).toBeGreaterThan(0);
        expect(groups.some(g => g.label === 'bug')).toBe(true);
        expect(groups.some(g => g.label === 'feature')).toBe(true);
    });

    it('dispatches to groupByDependencies for criterion "dependencies"', () => {
        const tasks = [
            makeTask('1', { dependsOn: ['99'] }),
            makeTask('2'),
        ];
        const filter: SwimlaneFilterState = {
            criterion: 'dependencies',
            selectedTags: [],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter);
        expect(groups.some(g => g.label === 'Blocked')).toBe(true);
    });

    it('dispatches to groupByCreatedDate for criterion "createdDate"', () => {
        const tasks = [makeTask('1', { createdAt: NOW - ONE_HOUR })];
        const filter: SwimlaneFilterState = {
            criterion: 'createdDate',
            selectedTags: [],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter, NOW);
        expect(groups.some(g => g.label === 'Today')).toBe(true);
    });

    it('dispatches to groupByStartedDate for criterion "startedDate"', () => {
        const tasks = [makeTask('1', { startedAt: NOW - ONE_HOUR })];
        const filter: SwimlaneFilterState = {
            criterion: 'startedDate',
            selectedTags: [],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter, NOW);
        expect(groups.some(g => g.label === 'Today')).toBe(true);
    });

    it('filters out empty groups when showEmpty is false', () => {
        const tasks = [makeTask('1', { tags: ['feature'] })];
        const filter: SwimlaneFilterState = {
            criterion: 'tags',
            selectedTags: [],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter);
        // Should not have empty groups
        expect(groups.every(g => g.taskIds.length > 0)).toBe(true);
    });

    it('keeps empty groups when showEmpty is true', () => {
        // Use dependency grouping since it always produces 3 groups
        // and at least one will be empty with a single task
        const tasks = [makeTask('1')]; // no dependencies → only "No Dependencies" has content
        const filter: SwimlaneFilterState = {
            criterion: 'dependencies',
            selectedTags: [],
            showEmpty: true,
        };

        const groups = computeSwimlaneGroups(tasks, filter);
        // All 3 dependency groups should be present
        expect(groups).toHaveLength(3);
        const blockedGroup = groups.find(g => g.label === 'Blocked');
        expect(blockedGroup).toBeDefined();
        expect(blockedGroup!.taskIds).toEqual([]);
    });

    it('passes selectedTags to groupByTags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['docs'] }),
        ];
        const filter: SwimlaneFilterState = {
            criterion: 'tags',
            selectedTags: ['bug'],
            showEmpty: false,
        };

        const groups = computeSwimlaneGroups(tasks, filter);
        expect(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['1']);
        expect(groups.find(g => g.label === 'feature')).toBeUndefined();
    });
});

// ─── collectAllTags ─────────────────────────────────────────────────────────

describe('collectAllTags', () => {
    it('collects unique tags sorted alphabetically', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['bug', 'urgent'] }),
            makeTask('3'),
        ];

        expect(collectAllTags(tasks)).toEqual(['bug', 'feature', 'urgent']);
    });

    it('returns empty array for no tasks', () => {
        expect(collectAllTags([])).toEqual([]);
    });

    it('returns empty array when no tasks have tags', () => {
        const tasks = [makeTask('1'), makeTask('2')];
        expect(collectAllTags(tasks)).toEqual([]);
    });
});

// ─── defaultFilterState ─────────────────────────────────────────────────────

describe('defaultFilterState', () => {
    it('returns criterion "none" with empty selectedTags and showEmpty false', () => {
        const state = defaultFilterState();
        expect(state.criterion).toBe('none');
        expect(state.selectedTags).toEqual([]);
        expect(state.showEmpty).toBe(false);
    });
});

// ─── Performance ────────────────────────────────────────────────────────────

describe('performance', () => {
    it('handles 200+ tasks efficiently for tag grouping', () => {
        const tags = ['feature', 'bug', 'urgent', 'refactor', 'test', 'docs'];
        const tasks: OrchestratorTask[] = [];
        for (let i = 0; i < 250; i++) {
            const taskTags = [tags[i % tags.length]];
            if (i % 3 === 0) { taskTags.push(tags[(i + 1) % tags.length]); }
            tasks.push(makeTask(`task-${i}`, { tags: taskTags }));
        }

        const start = performance.now();
        const groups = groupByTags(tasks, []);
        const elapsed = performance.now() - start;

        expect(groups.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(100); // should be well under 100ms
    });

    it('handles 200+ tasks efficiently for dependency grouping', () => {
        const tasks: OrchestratorTask[] = [];
        for (let i = 0; i < 250; i++) {
            const overrides: Partial<OrchestratorTask> = {};
            if (i > 0 && i % 5 === 0) {
                overrides.dependsOn = [`task-${i - 1}`];
            }
            if (i % 10 === 0) {
                overrides.status = TaskStatus.COMPLETED;
                overrides.kanbanColumn = 'done';
            }
            tasks.push(makeTask(`task-${i}`, overrides));
        }

        const start = performance.now();
        const groups = groupByDependencies(tasks);
        const elapsed = performance.now() - start;

        expect(groups.length).toBe(3);
        expect(elapsed).toBeLessThan(100);
    });

    it('handles 200+ tasks efficiently for date grouping', () => {
        const tasks: OrchestratorTask[] = [];
        for (let i = 0; i < 250; i++) {
            tasks.push(makeTask(`task-${i}`, {
                createdAt: NOW - (i * ONE_HOUR),
            }));
        }

        const start = performance.now();
        const groups = groupByCreatedDate(tasks, NOW);
        const elapsed = performance.now() - start;

        expect(groups.length).toBe(5);
        expect(elapsed).toBeLessThan(100);
    });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
    it('handles task with undefined status in dependency grouping', () => {
        const tasks = [
            makeTask('1', { status: undefined as any }),
            makeTask('2', { dependsOn: ['1'] }),
        ];
        // Task 1 is not completed, so task 2 should be blocked
        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Blocked')?.taskIds).toContain('2');
    });

    it('handles self-referencing dependency', () => {
        const tasks = [
            makeTask('1', { dependsOn: ['1'] }),
        ];
        // Task depends on itself — not completed so it should be blocked
        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['1']);
    });

    it('handles very large dependency chain without stack overflow', () => {
        const tasks: OrchestratorTask[] = [];
        for (let i = 0; i < 100; i++) {
            tasks.push(makeTask(`task-${i}`, {
                dependsOn: i > 0 ? [`task-${i - 1}`] : undefined,
            }));
        }

        // Should not throw
        const groups = groupByDependencies(tasks);
        expect(groups.find(g => g.label === 'Blocked')?.taskIds.length).toBeGreaterThan(0);
    });

    it('groups tasks with duplicate tags correctly', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'feature', 'bug'] }),
        ];

        const groups = groupByTags(tasks, []);
        const featureGroup = groups.find(g => g.label === 'feature');
        // Task appears once per tag occurrence — this matches the real data model
        expect(featureGroup?.taskIds.filter(id => id === '1').length).toBeGreaterThanOrEqual(1);
    });
});
