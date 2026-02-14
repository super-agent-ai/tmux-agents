"use strict";
// ─── Swimlane Grouping Strategies ────────────────────────────────────────────
//
// Pure utility module for grouping tasks into swimlanes by various criteria.
// Each strategy function takes a list of tasks and returns named groups.
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDateBucket = classifyDateBucket;
exports.classifyDependency = classifyDependency;
exports.groupByTags = groupByTags;
exports.groupByDependencies = groupByDependencies;
exports.groupByCreatedDate = groupByCreatedDate;
exports.groupByStartedDate = groupByStartedDate;
exports.computeSwimlaneGroups = computeSwimlaneGroups;
exports.collectAllTags = collectAllTags;
exports.defaultFilterState = defaultFilterState;
// ─── Date Bucketing Helpers ─────────────────────────────────────────────────
/**
 * Returns the start-of-day timestamp for a given date.
 */
function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
/**
 * Returns the start-of-week (Monday) timestamp for a given date.
 */
function startOfWeek(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0
    d.setDate(d.getDate() - diff);
    return d.getTime();
}
/**
 * Returns the start-of-month timestamp for a given date.
 */
function startOfMonth(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d.getTime();
}
/**
 * Classify a timestamp into a date bucket relative to `now`.
 */
function classifyDateBucket(ts, now) {
    if (!ts) {
        return 'noDate';
    }
    const todayStart = startOfDay(now);
    if (ts >= todayStart) {
        return 'today';
    }
    const weekStart = startOfWeek(now);
    if (ts >= weekStart) {
        return 'thisWeek';
    }
    const monthStart = startOfMonth(now);
    if (ts >= monthStart) {
        return 'thisMonth';
    }
    return 'older';
}
const DATE_BUCKET_LABELS = {
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    older: 'Older',
    noDate: 'No Date'
};
const DATE_BUCKET_ORDER = ['today', 'thisWeek', 'thisMonth', 'older', 'noDate'];
/**
 * Classify a task's dependency status.
 * - `noDependencies`: task has no `dependsOn` entries
 * - `blocked`: task has unmet dependencies (at least one dep is not completed)
 * - `unblocked`: task has dependencies but all are completed
 *
 * Uses a Set of completed task IDs for O(1) lookups.
 * Guards against circular dependencies by only checking status, not traversing the graph.
 */
function classifyDependency(task, completedTaskIds) {
    if (!task.dependsOn || task.dependsOn.length === 0) {
        return 'noDependencies';
    }
    const allMet = task.dependsOn.every(depId => completedTaskIds.has(depId));
    return allMet ? 'unblocked' : 'blocked';
}
const DEPENDENCY_LABELS = {
    blocked: 'Blocked',
    unblocked: 'Unblocked',
    noDependencies: 'No Dependencies'
};
const DEPENDENCY_ORDER = ['blocked', 'unblocked', 'noDependencies'];
// ─── Group-by Strategies ────────────────────────────────────────────────────
/**
 * Group tasks by their tags. A task with multiple tags appears in each
 * matching group. Tasks with no tags go into an "Untagged" group.
 *
 * @param selectedTags If non-empty, only these tags produce groups and only
 *   tasks matching at least one selected tag are included (plus untagged).
 */
function groupByTags(tasks, selectedTags) {
    const tagMap = new Map();
    const untagged = [];
    for (const task of tasks) {
        if (!task.tags || task.tags.length === 0) {
            untagged.push(task.id);
            continue;
        }
        const relevantTags = selectedTags.length > 0
            ? task.tags.filter(t => selectedTags.includes(t))
            : task.tags;
        if (relevantTags.length === 0) {
            // Task has tags but none match the selected filter
            untagged.push(task.id);
            continue;
        }
        for (const tag of relevantTags) {
            const existing = tagMap.get(tag);
            if (existing) {
                existing.push(task.id);
            }
            else {
                tagMap.set(tag, [task.id]);
            }
        }
    }
    // Build result: sorted tag groups + untagged
    const groups = [];
    // If selectedTags specified, use that order; otherwise sort alphabetically
    const tagKeys = selectedTags.length > 0
        ? selectedTags.filter(t => tagMap.has(t))
        : Array.from(tagMap.keys()).sort();
    for (const tag of tagKeys) {
        const ids = tagMap.get(tag);
        if (ids) {
            groups.push({ key: `tag:${tag}`, label: tag, taskIds: ids });
        }
    }
    // Always include untagged group (may be empty)
    groups.push({ key: 'tag:__untagged', label: 'Untagged', taskIds: untagged });
    return groups;
}
/**
 * Group tasks by dependency status: blocked, unblocked, no dependencies.
 */
function groupByDependencies(tasks) {
    // Build set of completed task IDs for dependency resolution
    const completedIds = new Set();
    for (const task of tasks) {
        if (task.status === 'completed' || task.kanbanColumn === 'done') {
            completedIds.add(task.id);
        }
    }
    const groups = {
        blocked: [],
        unblocked: [],
        noDependencies: []
    };
    for (const task of tasks) {
        const cls = classifyDependency(task, completedIds);
        groups[cls].push(task.id);
    }
    return DEPENDENCY_ORDER.map(cls => ({
        key: `dep:${cls}`,
        label: DEPENDENCY_LABELS[cls],
        taskIds: groups[cls]
    }));
}
/**
 * Group tasks by creation date bucket: today, this week, this month, older, no date.
 */
function groupByCreatedDate(tasks, now) {
    const currentTime = now ?? Date.now();
    const groups = {
        today: [],
        thisWeek: [],
        thisMonth: [],
        older: [],
        noDate: []
    };
    for (const task of tasks) {
        const bucket = classifyDateBucket(task.createdAt, currentTime);
        groups[bucket].push(task.id);
    }
    return DATE_BUCKET_ORDER.map(bucket => ({
        key: `created:${bucket}`,
        label: DATE_BUCKET_LABELS[bucket],
        taskIds: groups[bucket]
    }));
}
/**
 * Group tasks by started date (in-process date) bucket.
 * Tasks that haven't started yet go into "Not Started".
 */
function groupByStartedDate(tasks, now) {
    const currentTime = now ?? Date.now();
    const groups = {
        today: [],
        thisWeek: [],
        thisMonth: [],
        older: [],
        noDate: []
    };
    for (const task of tasks) {
        const bucket = classifyDateBucket(task.startedAt, currentTime);
        groups[bucket].push(task.id);
    }
    // Rename 'noDate' label to 'Not Started' for started date context
    return DATE_BUCKET_ORDER.map(bucket => ({
        key: `started:${bucket}`,
        label: bucket === 'noDate' ? 'Not Started' : DATE_BUCKET_LABELS[bucket],
        taskIds: groups[bucket]
    }));
}
// ─── Main Dispatcher ────────────────────────────────────────────────────────
/**
 * Apply the selected grouping criterion to a list of tasks.
 * Returns groups (which may be empty if `showEmpty` is false).
 */
function computeSwimlaneGroups(tasks, filter, now) {
    let groups;
    switch (filter.criterion) {
        case 'tags':
            groups = groupByTags(tasks, filter.selectedTags);
            break;
        case 'dependencies':
            groups = groupByDependencies(tasks);
            break;
        case 'createdDate':
            groups = groupByCreatedDate(tasks, now);
            break;
        case 'startedDate':
            groups = groupByStartedDate(tasks, now);
            break;
        case 'none':
        default:
            return [];
    }
    if (!filter.showEmpty) {
        groups = groups.filter(g => g.taskIds.length > 0);
    }
    return groups;
}
/**
 * Collect all unique tags from a list of tasks (sorted).
 */
function collectAllTags(tasks) {
    const tagSet = new Set();
    for (const task of tasks) {
        if (task.tags) {
            for (const tag of task.tags) {
                tagSet.add(tag);
            }
        }
    }
    return Array.from(tagSet).sort();
}
/**
 * Default filter state (no grouping active).
 */
function defaultFilterState() {
    return {
        criterion: 'none',
        selectedTags: [],
        showEmpty: false
    };
}
//# sourceMappingURL=swimlaneGrouping.js.map