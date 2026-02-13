import { describe, it, expect } from 'vitest';
import { ActivityRollupService } from '../activityRollup';
import { ActivityPriority, AIStatus, ProcessCategory, TmuxPane, TmuxWindow, TmuxSession } from '../types';

describe('ActivityRollupService', () => {
    const service = new ActivityRollupService();

    function makePane(overrides: Partial<TmuxPane> = {}): TmuxPane {
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

    describe('computePaneActivity', () => {
        it('returns AI_WORKING for AI pane with WORKING status', () => {
            const pane = makePane({ aiInfo: { provider: 'claude' as any, status: AIStatus.WORKING, launchCommand: 'claude' } });
            const result = service.computePaneActivity(pane);
            expect(result.category).toBe('working');
            expect(result.priority).toBe(ActivityPriority.AI_WORKING);
        });

        it('returns AI_WAITING for AI pane with WAITING status', () => {
            const pane = makePane({ aiInfo: { provider: 'claude' as any, status: AIStatus.WAITING, launchCommand: 'claude' } });
            const result = service.computePaneActivity(pane);
            expect(result.category).toBe('waiting');
            expect(result.priority).toBe(ActivityPriority.AI_WAITING);
        });

        it('returns BUILDING for pane with building process', () => {
            const pane = makePane({ processCategory: ProcessCategory.BUILDING });
            const result = service.computePaneActivity(pane);
            expect(result.category).toBe('building');
            expect(result.priority).toBe(ActivityPriority.BUILDING);
        });

        it('returns TESTING for pane with testing process', () => {
            const pane = makePane({ processCategory: ProcessCategory.TESTING });
            const result = service.computePaneActivity(pane);
            expect(result.category).toBe('testing');
            expect(result.priority).toBe(ActivityPriority.TESTING);
        });

        it('returns IDLE for plain pane', () => {
            const pane = makePane();
            const result = service.computePaneActivity(pane);
            expect(result.category).toBe('idle');
            expect(result.priority).toBe(ActivityPriority.IDLE);
        });
    });

    // ─── buildSummary ────────────────────────────────────────────────────

    describe('buildSummary', () => {
        it('returns correct description for multiple activities', () => {
            const activities = [
                { category: 'working', priority: ActivityPriority.AI_WORKING },
                { category: 'building', priority: ActivityPriority.BUILDING },
                { category: 'building', priority: ActivityPriority.BUILDING },
            ];
            const summary = service.buildSummary(activities);
            expect(summary.description).toBe('1 working, 2 building');
            expect(summary.dominantPriority).toBe(ActivityPriority.AI_WORKING);
        });

        it('filters out idle when non-idle activities exist', () => {
            const activities = [
                { category: 'working', priority: ActivityPriority.AI_WORKING },
                { category: 'idle', priority: ActivityPriority.IDLE },
            ];
            const summary = service.buildSummary(activities);
            expect(summary.description).toBe('1 working');
            expect(summary.counts).toHaveLength(1);
        });

        it('shows idle when it is the only activity', () => {
            const activities = [
                { category: 'idle', priority: ActivityPriority.IDLE },
                { category: 'idle', priority: ActivityPriority.IDLE },
            ];
            const summary = service.buildSummary(activities);
            expect(summary.description).toBe('2 idle');
            expect(summary.dominantPriority).toBe(ActivityPriority.IDLE);
        });

        it('returns empty description for no activities', () => {
            const summary = service.buildSummary([]);
            expect(summary.description).toBe('');
            expect(summary.dominantPriority).toBe(ActivityPriority.IDLE);
            expect(summary.counts).toHaveLength(0);
        });
    });

    // ─── computeWindowSummary / computeSessionSummary ────────────────────

    describe('computeWindowSummary', () => {
        it('aggregates pane activities for a window', () => {
            const window: TmuxWindow = {
                serverId: 'local',
                sessionName: 'test',
                index: '0',
                name: 'main',
                isActive: true,
                panes: [
                    makePane({ processCategory: ProcessCategory.BUILDING }),
                    makePane({ processCategory: ProcessCategory.TESTING }),
                ],
            };
            const summary = service.computeWindowSummary(window);
            expect(summary.counts).toHaveLength(2);
            expect(summary.dominantPriority).toBe(ActivityPriority.BUILDING);
        });
    });

    describe('computeSessionSummary', () => {
        it('aggregates activities across all windows and panes', () => {
            const session: TmuxSession = {
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
                        panes: [makePane({ processCategory: ProcessCategory.BUILDING })],
                    },
                    {
                        serverId: 'local',
                        sessionName: 'dev',
                        index: '1',
                        name: 'w2',
                        isActive: false,
                        panes: [makePane({ processCategory: ProcessCategory.BUILDING })],
                    },
                ],
            };
            const summary = service.computeSessionSummary(session);
            expect(summary.description).toBe('2 building');
            expect(summary.dominantPriority).toBe(ActivityPriority.BUILDING);
        });
    });
});
