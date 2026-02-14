"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const activityRollup_1 = require("../core/activityRollup");
const types_1 = require("../core/types");
(0, vitest_1.describe)('ActivityRollupService', () => {
    const service = new activityRollup_1.ActivityRollupService();
    function makePane(overrides = {}) {
        return {
            serverId: 'local',
            sessionName: 'test',
            windowIndex: '0',
            index: '0',
            command: 'bash',
            currentPath: '/tmp',
            isActive: true,
            pid: 1,
            ...overrides,
        };
    }
    // ─── computePaneActivity ─────────────────────────────────────────────
    (0, vitest_1.describe)('computePaneActivity', () => {
        (0, vitest_1.it)('returns AI_WORKING for AI pane with WORKING status', () => {
            const pane = makePane({ aiInfo: { provider: 'claude', status: types_1.AIStatus.WORKING, launchCommand: 'claude' } });
            const result = service.computePaneActivity(pane);
            (0, vitest_1.expect)(result.category).toBe('working');
            (0, vitest_1.expect)(result.priority).toBe(types_1.ActivityPriority.AI_WORKING);
        });
        (0, vitest_1.it)('returns AI_WAITING for AI pane with WAITING status', () => {
            const pane = makePane({ aiInfo: { provider: 'claude', status: types_1.AIStatus.WAITING, launchCommand: 'claude' } });
            const result = service.computePaneActivity(pane);
            (0, vitest_1.expect)(result.category).toBe('waiting');
            (0, vitest_1.expect)(result.priority).toBe(types_1.ActivityPriority.AI_WAITING);
        });
        (0, vitest_1.it)('returns BUILDING for pane with building process', () => {
            const pane = makePane({ processCategory: types_1.ProcessCategory.BUILDING });
            const result = service.computePaneActivity(pane);
            (0, vitest_1.expect)(result.category).toBe('building');
            (0, vitest_1.expect)(result.priority).toBe(types_1.ActivityPriority.BUILDING);
        });
        (0, vitest_1.it)('returns TESTING for pane with testing process', () => {
            const pane = makePane({ processCategory: types_1.ProcessCategory.TESTING });
            const result = service.computePaneActivity(pane);
            (0, vitest_1.expect)(result.category).toBe('testing');
            (0, vitest_1.expect)(result.priority).toBe(types_1.ActivityPriority.TESTING);
        });
        (0, vitest_1.it)('returns IDLE for plain pane', () => {
            const pane = makePane();
            const result = service.computePaneActivity(pane);
            (0, vitest_1.expect)(result.category).toBe('idle');
            (0, vitest_1.expect)(result.priority).toBe(types_1.ActivityPriority.IDLE);
        });
    });
    // ─── buildSummary ────────────────────────────────────────────────────
    (0, vitest_1.describe)('buildSummary', () => {
        (0, vitest_1.it)('returns correct description for multiple activities', () => {
            const activities = [
                { category: 'working', priority: types_1.ActivityPriority.AI_WORKING },
                { category: 'building', priority: types_1.ActivityPriority.BUILDING },
                { category: 'building', priority: types_1.ActivityPriority.BUILDING },
            ];
            const summary = service.buildSummary(activities);
            (0, vitest_1.expect)(summary.description).toBe('1 working, 2 building');
            (0, vitest_1.expect)(summary.dominantPriority).toBe(types_1.ActivityPriority.AI_WORKING);
        });
        (0, vitest_1.it)('filters out idle when non-idle activities exist', () => {
            const activities = [
                { category: 'working', priority: types_1.ActivityPriority.AI_WORKING },
                { category: 'idle', priority: types_1.ActivityPriority.IDLE },
            ];
            const summary = service.buildSummary(activities);
            (0, vitest_1.expect)(summary.description).toBe('1 working');
            (0, vitest_1.expect)(summary.counts).toHaveLength(1);
        });
        (0, vitest_1.it)('shows idle when it is the only activity', () => {
            const activities = [
                { category: 'idle', priority: types_1.ActivityPriority.IDLE },
                { category: 'idle', priority: types_1.ActivityPriority.IDLE },
            ];
            const summary = service.buildSummary(activities);
            (0, vitest_1.expect)(summary.description).toBe('2 idle');
            (0, vitest_1.expect)(summary.dominantPriority).toBe(types_1.ActivityPriority.IDLE);
        });
        (0, vitest_1.it)('returns empty description for no activities', () => {
            const summary = service.buildSummary([]);
            (0, vitest_1.expect)(summary.description).toBe('');
            (0, vitest_1.expect)(summary.dominantPriority).toBe(types_1.ActivityPriority.IDLE);
            (0, vitest_1.expect)(summary.counts).toHaveLength(0);
        });
    });
    // ─── computeWindowSummary / computeSessionSummary ────────────────────
    (0, vitest_1.describe)('computeWindowSummary', () => {
        (0, vitest_1.it)('aggregates pane activities for a window', () => {
            const window = {
                serverId: 'local',
                sessionName: 'test',
                index: '0',
                name: 'main',
                isActive: true,
                panes: [
                    makePane({ processCategory: types_1.ProcessCategory.BUILDING }),
                    makePane({ processCategory: types_1.ProcessCategory.TESTING }),
                ],
            };
            const summary = service.computeWindowSummary(window);
            (0, vitest_1.expect)(summary.counts).toHaveLength(2);
            (0, vitest_1.expect)(summary.dominantPriority).toBe(types_1.ActivityPriority.BUILDING);
        });
    });
    (0, vitest_1.describe)('computeSessionSummary', () => {
        (0, vitest_1.it)('aggregates activities across all windows and panes', () => {
            const session = {
                serverId: 'local',
                name: 'dev',
                isAttached: true,
                created: '100',
                lastActivity: '200',
                windows: [
                    {
                        serverId: 'local',
                        sessionName: 'dev',
                        index: '0',
                        name: 'w1',
                        isActive: true,
                        panes: [makePane({ processCategory: types_1.ProcessCategory.BUILDING })],
                    },
                    {
                        serverId: 'local',
                        sessionName: 'dev',
                        index: '1',
                        name: 'w2',
                        isActive: false,
                        panes: [makePane({ processCategory: types_1.ProcessCategory.BUILDING })],
                    },
                ],
            };
            const summary = service.computeSessionSummary(session);
            (0, vitest_1.expect)(summary.description).toBe('2 building');
            (0, vitest_1.expect)(summary.dominantPriority).toBe(types_1.ActivityPriority.BUILDING);
        });
    });
});
//# sourceMappingURL=activityRollup.test.js.map