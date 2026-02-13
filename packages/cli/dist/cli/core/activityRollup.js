"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityRollupService = void 0;
const types_1 = require("./types");
class ActivityRollupService {
    computePaneActivity(pane) {
        if (pane.aiInfo) {
            if (pane.aiInfo.status === types_1.AIStatus.WORKING) {
                return { category: 'working', priority: types_1.ActivityPriority.AI_WORKING };
            }
            if (pane.aiInfo.status === types_1.AIStatus.WAITING) {
                return { category: 'waiting', priority: types_1.ActivityPriority.AI_WAITING };
            }
        }
        if (pane.processCategory === types_1.ProcessCategory.BUILDING) {
            return { category: 'building', priority: types_1.ActivityPriority.BUILDING };
        }
        if (pane.processCategory === types_1.ProcessCategory.TESTING) {
            return { category: 'testing', priority: types_1.ActivityPriority.TESTING };
        }
        if (pane.processCategory === types_1.ProcessCategory.INSTALLING) {
            return { category: 'installing', priority: types_1.ActivityPriority.INSTALLING };
        }
        if (pane.processCategory === types_1.ProcessCategory.RUNNING) {
            return { category: 'running', priority: types_1.ActivityPriority.RUNNING };
        }
        return { category: 'idle', priority: types_1.ActivityPriority.IDLE };
    }
    buildSummary(activities) {
        const countMap = new Map();
        for (const activity of activities) {
            const existing = countMap.get(activity.category);
            if (existing) {
                existing.count++;
            }
            else {
                countMap.set(activity.category, { count: 1, priority: activity.priority });
            }
        }
        let counts = Array.from(countMap.entries()).map(([category, { count, priority }]) => ({
            category,
            count,
            priority
        }));
        // Sort by priority (lowest number = highest priority)
        counts.sort((a, b) => a.priority - b.priority);
        // Filter out zero counts and IDLE if there are non-idle activities
        const hasNonIdle = counts.some(c => c.priority !== types_1.ActivityPriority.IDLE && c.count > 0);
        counts = counts.filter(c => {
            if (c.count === 0) {
                return false;
            }
            if (hasNonIdle && c.priority === types_1.ActivityPriority.IDLE) {
                return false;
            }
            return true;
        });
        const description = counts.map(c => `${c.count} ${c.category}`).join(', ');
        const dominantPriority = counts.length > 0 ? counts[0].priority : types_1.ActivityPriority.IDLE;
        return { counts, description, dominantPriority };
    }
    computeWindowSummary(window) {
        const activities = window.panes.map(pane => this.computePaneActivity(pane));
        return this.buildSummary(activities);
    }
    computeSessionSummary(session) {
        const activities = [];
        for (const window of session.windows) {
            for (const pane of window.panes) {
                activities.push(this.computePaneActivity(pane));
            }
        }
        return this.buildSummary(activities);
    }
    enrichTree(sessions) {
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
exports.ActivityRollupService = ActivityRollupService;
//# sourceMappingURL=activityRollup.js.map