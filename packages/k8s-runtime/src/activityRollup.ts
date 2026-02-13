import {
    TmuxPane,
    TmuxWindow,
    TmuxSession,
    ActivityPriority,
    ActivityCount,
    ActivitySummary,
    AIStatus,
    ProcessCategory
} from './types';

export class ActivityRollupService {

    computePaneActivity(pane: TmuxPane): { category: string; priority: ActivityPriority } {
        if (pane.aiInfo) {
            if (pane.aiInfo.status === AIStatus.WORKING) {
                return { category: 'working', priority: ActivityPriority.AI_WORKING };
            }
            if (pane.aiInfo.status === AIStatus.WAITING) {
                return { category: 'waiting', priority: ActivityPriority.AI_WAITING };
            }
        }

        if (pane.processCategory === ProcessCategory.BUILDING) {
            return { category: 'building', priority: ActivityPriority.BUILDING };
        }
        if (pane.processCategory === ProcessCategory.TESTING) {
            return { category: 'testing', priority: ActivityPriority.TESTING };
        }
        if (pane.processCategory === ProcessCategory.INSTALLING) {
            return { category: 'installing', priority: ActivityPriority.INSTALLING };
        }
        if (pane.processCategory === ProcessCategory.RUNNING) {
            return { category: 'running', priority: ActivityPriority.RUNNING };
        }

        return { category: 'idle', priority: ActivityPriority.IDLE };
    }

    buildSummary(activities: Array<{ category: string; priority: ActivityPriority }>): ActivitySummary {
        const countMap = new Map<string, { count: number; priority: ActivityPriority }>();

        for (const activity of activities) {
            const existing = countMap.get(activity.category);
            if (existing) {
                existing.count++;
            } else {
                countMap.set(activity.category, { count: 1, priority: activity.priority });
            }
        }

        let counts: ActivityCount[] = Array.from(countMap.entries()).map(([category, { count, priority }]) => ({
            category,
            count,
            priority
        }));

        // Sort by priority (lowest number = highest priority)
        counts.sort((a, b) => a.priority - b.priority);

        // Filter out zero counts and IDLE if there are non-idle activities
        const hasNonIdle = counts.some(c => c.priority !== ActivityPriority.IDLE && c.count > 0);
        counts = counts.filter(c => {
            if (c.count === 0) { return false; }
            if (hasNonIdle && c.priority === ActivityPriority.IDLE) { return false; }
            return true;
        });

        const description = counts.map(c => `${c.count} ${c.category}`).join(', ');
        const dominantPriority = counts.length > 0 ? counts[0].priority : ActivityPriority.IDLE;

        return { counts, description, dominantPriority };
    }

    computeWindowSummary(window: TmuxWindow): ActivitySummary {
        const activities = window.panes.map(pane => this.computePaneActivity(pane));
        return this.buildSummary(activities);
    }

    computeSessionSummary(session: TmuxSession): ActivitySummary {
        const activities: Array<{ category: string; priority: ActivityPriority }> = [];
        for (const window of session.windows) {
            for (const pane of window.panes) {
                activities.push(this.computePaneActivity(pane));
            }
        }
        return this.buildSummary(activities);
    }

    enrichTree(sessions: TmuxSession[]): TmuxSession[] {
        return sessions.map(session => {
            const enrichedWindows = session.windows.map(window => ({
                ...window,
                activitySummary: this.computeWindowSummary(window)
            }));

            // Compute session summary from the original data (not enriched, to avoid extra copies)
            const sessionSummary = this.computeSessionSummary(session);

            return {
                ...session,
                windows: enrichedWindows,
                activitySummary: sessionSummary
            };
        });
    }
}
