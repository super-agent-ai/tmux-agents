"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../core/types");
const swimlaneGrouping_1 = require("../core/swimlaneGrouping");
// ─── Helpers ────────────────────────────────────────────────────────────────
function makeTask(id, overrides = {}) {
    return {
        id,
        description: `Task ${id}`,
        status: types_1.TaskStatus.PENDING,
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
(0, vitest_1.describe)('groupByTags', () => {
    (0, vitest_1.it)('groups tasks by their tags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['feature', 'bug'] }),
            makeTask('4', { tags: [] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        (0, vitest_1.expect)(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['2', '3']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'feature')?.taskIds).toEqual(['1', '3']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['4']);
    });
    (0, vitest_1.it)('places tasks with no tags array into Untagged', () => {
        const tasks = [
            makeTask('1'),
            makeTask('2', { tags: undefined }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        (0, vitest_1.expect)(groups).toHaveLength(1);
        (0, vitest_1.expect)(groups[0].label).toBe('Untagged');
        (0, vitest_1.expect)(groups[0].taskIds).toEqual(['1', '2']);
    });
    (0, vitest_1.it)('places tasks with empty tags array into Untagged', () => {
        const tasks = [makeTask('1', { tags: [] })];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        (0, vitest_1.expect)(groups[0].label).toBe('Untagged');
        (0, vitest_1.expect)(groups[0].taskIds).toEqual(['1']);
    });
    (0, vitest_1.it)('task with multiple tags appears in each relevant group', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug', 'urgent'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        const featureGroup = groups.find(g => g.label === 'feature');
        const bugGroup = groups.find(g => g.label === 'bug');
        const urgentGroup = groups.find(g => g.label === 'urgent');
        (0, vitest_1.expect)(featureGroup?.taskIds).toContain('1');
        (0, vitest_1.expect)(bugGroup?.taskIds).toContain('1');
        (0, vitest_1.expect)(urgentGroup?.taskIds).toContain('1');
    });
    (0, vitest_1.it)('filters by selectedTags when provided', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['docs'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, ['bug']);
        // Only 'bug' group + untagged should appear
        (0, vitest_1.expect)(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['1', '2']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'feature')).toBeUndefined();
        // Task 3 (docs only, not in selectedTags) → untagged
        (0, vitest_1.expect)(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['3']);
    });
    (0, vitest_1.it)('multi-select tags filter shows all matching tags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
            makeTask('3', { tags: ['docs'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, ['feature', 'bug']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'feature')?.taskIds).toEqual(['1']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['2']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Untagged')?.taskIds).toEqual(['3']);
    });
    (0, vitest_1.it)('returns empty groups for no tasks', () => {
        const groups = (0, swimlaneGrouping_1.groupByTags)([], []);
        (0, vitest_1.expect)(groups).toHaveLength(1);
        (0, vitest_1.expect)(groups[0].label).toBe('Untagged');
        (0, vitest_1.expect)(groups[0].taskIds).toEqual([]);
    });
    (0, vitest_1.it)('sorts tag groups alphabetically when no selectedTags', () => {
        const tasks = [
            makeTask('1', { tags: ['zebra'] }),
            makeTask('2', { tags: ['apple'] }),
            makeTask('3', { tags: ['mango'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        const labels = groups.map(g => g.label);
        (0, vitest_1.expect)(labels).toEqual(['apple', 'mango', 'zebra', 'Untagged']);
    });
    (0, vitest_1.it)('preserves selectedTags order', () => {
        const tasks = [
            makeTask('1', { tags: ['bug', 'feature'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, ['feature', 'bug']);
        (0, vitest_1.expect)(groups[0].label).toBe('feature');
        (0, vitest_1.expect)(groups[1].label).toBe('bug');
    });
});
// ─── groupByDependencies ────────────────────────────────────────────────────
(0, vitest_1.describe)('groupByDependencies', () => {
    (0, vitest_1.it)('classifies tasks into blocked, unblocked, and no dependencies', () => {
        const tasks = [
            makeTask('1', { status: types_1.TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { dependsOn: ['1'] }), // unblocked (dep completed)
            makeTask('3', { dependsOn: ['99'] }), // blocked (dep not found)
            makeTask('4'), // no dependencies
        ];
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['3']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Unblocked')?.taskIds).toEqual(['2']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'No Dependencies')?.taskIds).toContain('1');
        (0, vitest_1.expect)(groups.find(g => g.label === 'No Dependencies')?.taskIds).toContain('4');
    });
    (0, vitest_1.it)('task with all deps completed is unblocked', () => {
        const tasks = [
            makeTask('1', { status: types_1.TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { status: types_1.TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('3', { dependsOn: ['1', '2'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Unblocked')?.taskIds).toEqual(['3']);
    });
    (0, vitest_1.it)('task with partial deps completed is blocked', () => {
        const tasks = [
            makeTask('1', { status: types_1.TaskStatus.COMPLETED, kanbanColumn: 'done' }),
            makeTask('2', { status: types_1.TaskStatus.IN_PROGRESS }),
            makeTask('3', { dependsOn: ['1', '2'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['3']);
    });
    (0, vitest_1.it)('handles circular dependencies safely (does not stack overflow)', () => {
        // Circular: A depends on B, B depends on A
        const tasks = [
            makeTask('A', { dependsOn: ['B'] }),
            makeTask('B', { dependsOn: ['A'] }),
        ];
        // Should not throw and should classify both as blocked
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['A', 'B']);
    });
    (0, vitest_1.it)('handles empty task list', () => {
        const groups = (0, swimlaneGrouping_1.groupByDependencies)([]);
        (0, vitest_1.expect)(groups).toHaveLength(3);
        (0, vitest_1.expect)(groups.every(g => g.taskIds.length === 0)).toBe(true);
    });
    (0, vitest_1.it)('task with empty dependsOn array has no dependencies', () => {
        const tasks = [makeTask('1', { dependsOn: [] })];
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'No Dependencies')?.taskIds).toEqual(['1']);
    });
});
// ─── classifyDependency ─────────────────────────────────────────────────────
(0, vitest_1.describe)('classifyDependency', () => {
    (0, vitest_1.it)('returns noDependencies for task with no dependsOn', () => {
        const task = makeTask('1');
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDependency)(task, new Set())).toBe('noDependencies');
    });
    (0, vitest_1.it)('returns blocked when deps are not in completed set', () => {
        const task = makeTask('1', { dependsOn: ['2'] });
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDependency)(task, new Set())).toBe('blocked');
    });
    (0, vitest_1.it)('returns unblocked when all deps are in completed set', () => {
        const task = makeTask('1', { dependsOn: ['2', '3'] });
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDependency)(task, new Set(['2', '3']))).toBe('unblocked');
    });
});
// ─── classifyDateBucket ─────────────────────────────────────────────────────
(0, vitest_1.describe)('classifyDateBucket', () => {
    (0, vitest_1.it)('classifies undefined timestamp as noDate', () => {
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(undefined, NOW)).toBe('noDate');
    });
    (0, vitest_1.it)('classifies timestamp from today as today', () => {
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(NOW - ONE_HOUR, NOW)).toBe('today');
    });
    (0, vitest_1.it)('classifies timestamp from earlier this week as thisWeek', () => {
        // NOW is Wednesday; Monday would be 2 days ago
        const monday = NOW - 2 * ONE_DAY;
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(monday, NOW)).toBe('thisWeek');
    });
    (0, vitest_1.it)('classifies timestamp from earlier this month as thisMonth', () => {
        // Feb 2, 2026 (9 days ago from Feb 11)
        const earlyMonth = new Date('2026-02-02T12:00:00Z').getTime();
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(earlyMonth, NOW)).toBe('thisMonth');
    });
    (0, vitest_1.it)('classifies timestamp from last month as older', () => {
        const lastMonth = new Date('2026-01-15T12:00:00Z').getTime();
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(lastMonth, NOW)).toBe('older');
    });
    (0, vitest_1.it)('classifies zero timestamp as noDate (falsy)', () => {
        // 0 is falsy in JS, so treated as missing
        (0, vitest_1.expect)((0, swimlaneGrouping_1.classifyDateBucket)(0, NOW)).toBe('noDate');
    });
});
// ─── groupByCreatedDate ─────────────────────────────────────────────────────
(0, vitest_1.describe)('groupByCreatedDate', () => {
    (0, vitest_1.it)('groups tasks into date buckets based on createdAt', () => {
        const tasks = [
            makeTask('1', { createdAt: NOW - ONE_HOUR }), // today
            makeTask('2', { createdAt: NOW - 2 * ONE_DAY }), // this week (Wed - 2 = Mon)
            makeTask('3', { createdAt: new Date('2026-02-02T12:00:00Z').getTime() }), // this month
            makeTask('4', { createdAt: new Date('2025-12-01T12:00:00Z').getTime() }), // older
            makeTask('5', { createdAt: 1 }), // epoch → older
        ];
        const groups = (0, swimlaneGrouping_1.groupByCreatedDate)(tasks, NOW);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Today')?.taskIds).toEqual(['1']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'This Week')?.taskIds).toEqual(['2']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'This Month')?.taskIds).toEqual(['3']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Older')?.taskIds).toContain('4');
    });
    (0, vitest_1.it)('returns all five buckets', () => {
        const groups = (0, swimlaneGrouping_1.groupByCreatedDate)([], NOW);
        (0, vitest_1.expect)(groups).toHaveLength(5);
        (0, vitest_1.expect)(groups.map(g => g.label)).toEqual([
            'Today', 'This Week', 'This Month', 'Older', 'No Date'
        ]);
    });
    (0, vitest_1.it)('handles empty task list', () => {
        const groups = (0, swimlaneGrouping_1.groupByCreatedDate)([], NOW);
        (0, vitest_1.expect)(groups.every(g => g.taskIds.length === 0)).toBe(true);
    });
});
// ─── groupByStartedDate ─────────────────────────────────────────────────────
(0, vitest_1.describe)('groupByStartedDate', () => {
    (0, vitest_1.it)('groups tasks by startedAt timestamp', () => {
        const tasks = [
            makeTask('1', { startedAt: NOW - ONE_HOUR }), // today
            makeTask('2', { startedAt: NOW - 2 * ONE_DAY }), // this week
            makeTask('3'), // not started (no startedAt)
        ];
        const groups = (0, swimlaneGrouping_1.groupByStartedDate)(tasks, NOW);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Today')?.taskIds).toEqual(['1']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'This Week')?.taskIds).toEqual(['2']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Not Started')?.taskIds).toEqual(['3']);
    });
    (0, vitest_1.it)('labels the noDate bucket as "Not Started"', () => {
        const groups = (0, swimlaneGrouping_1.groupByStartedDate)([], NOW);
        const noDateGroup = groups.find(g => g.key === 'started:noDate');
        (0, vitest_1.expect)(noDateGroup?.label).toBe('Not Started');
    });
    (0, vitest_1.it)('handles tasks with startedAt = undefined', () => {
        const tasks = [
            makeTask('1', { startedAt: undefined }),
            makeTask('2'),
        ];
        const groups = (0, swimlaneGrouping_1.groupByStartedDate)(tasks, NOW);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Not Started')?.taskIds).toEqual(['1', '2']);
    });
});
// ─── computeSwimlaneGroups ──────────────────────────────────────────────────
(0, vitest_1.describe)('computeSwimlaneGroups', () => {
    (0, vitest_1.it)('returns empty array for criterion "none"', () => {
        const tasks = [makeTask('1')];
        const filter = (0, swimlaneGrouping_1.defaultFilterState)();
        (0, vitest_1.expect)((0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter)).toEqual([]);
    });
    (0, vitest_1.it)('dispatches to groupByTags for criterion "tags"', () => {
        const tasks = [
            makeTask('1', { tags: ['feature'] }),
            makeTask('2', { tags: ['bug'] }),
        ];
        const filter = {
            criterion: 'tags',
            selectedTags: [],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter);
        (0, vitest_1.expect)(groups.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(groups.some(g => g.label === 'bug')).toBe(true);
        (0, vitest_1.expect)(groups.some(g => g.label === 'feature')).toBe(true);
    });
    (0, vitest_1.it)('dispatches to groupByDependencies for criterion "dependencies"', () => {
        const tasks = [
            makeTask('1', { dependsOn: ['99'] }),
            makeTask('2'),
        ];
        const filter = {
            criterion: 'dependencies',
            selectedTags: [],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter);
        (0, vitest_1.expect)(groups.some(g => g.label === 'Blocked')).toBe(true);
    });
    (0, vitest_1.it)('dispatches to groupByCreatedDate for criterion "createdDate"', () => {
        const tasks = [makeTask('1', { createdAt: NOW - ONE_HOUR })];
        const filter = {
            criterion: 'createdDate',
            selectedTags: [],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter, NOW);
        (0, vitest_1.expect)(groups.some(g => g.label === 'Today')).toBe(true);
    });
    (0, vitest_1.it)('dispatches to groupByStartedDate for criterion "startedDate"', () => {
        const tasks = [makeTask('1', { startedAt: NOW - ONE_HOUR })];
        const filter = {
            criterion: 'startedDate',
            selectedTags: [],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter, NOW);
        (0, vitest_1.expect)(groups.some(g => g.label === 'Today')).toBe(true);
    });
    (0, vitest_1.it)('filters out empty groups when showEmpty is false', () => {
        const tasks = [makeTask('1', { tags: ['feature'] })];
        const filter = {
            criterion: 'tags',
            selectedTags: [],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter);
        // Should not have empty groups
        (0, vitest_1.expect)(groups.every(g => g.taskIds.length > 0)).toBe(true);
    });
    (0, vitest_1.it)('keeps empty groups when showEmpty is true', () => {
        // Use dependency grouping since it always produces 3 groups
        // and at least one will be empty with a single task
        const tasks = [makeTask('1')]; // no dependencies → only "No Dependencies" has content
        const filter = {
            criterion: 'dependencies',
            selectedTags: [],
            showEmpty: true,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter);
        // All 3 dependency groups should be present
        (0, vitest_1.expect)(groups).toHaveLength(3);
        const blockedGroup = groups.find(g => g.label === 'Blocked');
        (0, vitest_1.expect)(blockedGroup).toBeDefined();
        (0, vitest_1.expect)(blockedGroup.taskIds).toEqual([]);
    });
    (0, vitest_1.it)('passes selectedTags to groupByTags', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['docs'] }),
        ];
        const filter = {
            criterion: 'tags',
            selectedTags: ['bug'],
            showEmpty: false,
        };
        const groups = (0, swimlaneGrouping_1.computeSwimlaneGroups)(tasks, filter);
        (0, vitest_1.expect)(groups.find(g => g.label === 'bug')?.taskIds).toEqual(['1']);
        (0, vitest_1.expect)(groups.find(g => g.label === 'feature')).toBeUndefined();
    });
});
// ─── collectAllTags ─────────────────────────────────────────────────────────
(0, vitest_1.describe)('collectAllTags', () => {
    (0, vitest_1.it)('collects unique tags sorted alphabetically', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'bug'] }),
            makeTask('2', { tags: ['bug', 'urgent'] }),
            makeTask('3'),
        ];
        (0, vitest_1.expect)((0, swimlaneGrouping_1.collectAllTags)(tasks)).toEqual(['bug', 'feature', 'urgent']);
    });
    (0, vitest_1.it)('returns empty array for no tasks', () => {
        (0, vitest_1.expect)((0, swimlaneGrouping_1.collectAllTags)([])).toEqual([]);
    });
    (0, vitest_1.it)('returns empty array when no tasks have tags', () => {
        const tasks = [makeTask('1'), makeTask('2')];
        (0, vitest_1.expect)((0, swimlaneGrouping_1.collectAllTags)(tasks)).toEqual([]);
    });
});
// ─── defaultFilterState ─────────────────────────────────────────────────────
(0, vitest_1.describe)('defaultFilterState', () => {
    (0, vitest_1.it)('returns criterion "none" with empty selectedTags and showEmpty false', () => {
        const state = (0, swimlaneGrouping_1.defaultFilterState)();
        (0, vitest_1.expect)(state.criterion).toBe('none');
        (0, vitest_1.expect)(state.selectedTags).toEqual([]);
        (0, vitest_1.expect)(state.showEmpty).toBe(false);
    });
});
// ─── Performance ────────────────────────────────────────────────────────────
(0, vitest_1.describe)('performance', () => {
    (0, vitest_1.it)('handles 200+ tasks efficiently for tag grouping', () => {
        const tags = ['feature', 'bug', 'urgent', 'refactor', 'test', 'docs'];
        const tasks = [];
        for (let i = 0; i < 250; i++) {
            const taskTags = [tags[i % tags.length]];
            if (i % 3 === 0) {
                taskTags.push(tags[(i + 1) % tags.length]);
            }
            tasks.push(makeTask(`task-${i}`, { tags: taskTags }));
        }
        const start = performance.now();
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        const elapsed = performance.now() - start;
        (0, vitest_1.expect)(groups.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(elapsed).toBeLessThan(100); // should be well under 100ms
    });
    (0, vitest_1.it)('handles 200+ tasks efficiently for dependency grouping', () => {
        const tasks = [];
        for (let i = 0; i < 250; i++) {
            const overrides = {};
            if (i > 0 && i % 5 === 0) {
                overrides.dependsOn = [`task-${i - 1}`];
            }
            if (i % 10 === 0) {
                overrides.status = types_1.TaskStatus.COMPLETED;
                overrides.kanbanColumn = 'done';
            }
            tasks.push(makeTask(`task-${i}`, overrides));
        }
        const start = performance.now();
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        const elapsed = performance.now() - start;
        (0, vitest_1.expect)(groups.length).toBe(3);
        (0, vitest_1.expect)(elapsed).toBeLessThan(100);
    });
    (0, vitest_1.it)('handles 200+ tasks efficiently for date grouping', () => {
        const tasks = [];
        for (let i = 0; i < 250; i++) {
            tasks.push(makeTask(`task-${i}`, {
                createdAt: NOW - (i * ONE_HOUR),
            }));
        }
        const start = performance.now();
        const groups = (0, swimlaneGrouping_1.groupByCreatedDate)(tasks, NOW);
        const elapsed = performance.now() - start;
        (0, vitest_1.expect)(groups.length).toBe(5);
        (0, vitest_1.expect)(elapsed).toBeLessThan(100);
    });
});
// ─── Edge Cases ─────────────────────────────────────────────────────────────
(0, vitest_1.describe)('edge cases', () => {
    (0, vitest_1.it)('handles task with undefined status in dependency grouping', () => {
        const tasks = [
            makeTask('1', { status: undefined }),
            makeTask('2', { dependsOn: ['1'] }),
        ];
        // Task 1 is not completed, so task 2 should be blocked
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds).toContain('2');
    });
    (0, vitest_1.it)('handles self-referencing dependency', () => {
        const tasks = [
            makeTask('1', { dependsOn: ['1'] }),
        ];
        // Task depends on itself — not completed so it should be blocked
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds).toEqual(['1']);
    });
    (0, vitest_1.it)('handles very large dependency chain without stack overflow', () => {
        const tasks = [];
        for (let i = 0; i < 100; i++) {
            tasks.push(makeTask(`task-${i}`, {
                dependsOn: i > 0 ? [`task-${i - 1}`] : undefined,
            }));
        }
        // Should not throw
        const groups = (0, swimlaneGrouping_1.groupByDependencies)(tasks);
        (0, vitest_1.expect)(groups.find(g => g.label === 'Blocked')?.taskIds.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('groups tasks with duplicate tags correctly', () => {
        const tasks = [
            makeTask('1', { tags: ['feature', 'feature', 'bug'] }),
        ];
        const groups = (0, swimlaneGrouping_1.groupByTags)(tasks, []);
        const featureGroup = groups.find(g => g.label === 'feature');
        // Task appears once per tag occurrence — this matches the real data model
        (0, vitest_1.expect)(featureGroup?.taskIds.filter(id => id === '1').length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=swimlaneGrouping.test.js.map