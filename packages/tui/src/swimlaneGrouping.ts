// ─── Swimlane Grouping Strategies ────────────────────────────────────────────
//
// Pure utility module for grouping tasks into swimlanes by various criteria.
// Each strategy function takes a list of tasks and returns named groups.

import { OrchestratorTask } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SwimlaneGroupCriterion = 'none' | 'tags' | 'dependencies' | 'createdDate' | 'startedDate';

export interface SwimlaneGroup {
    /** Unique key for the group */
    key: string;
    /** Display label */
    label: string;
    /** Tasks belonging to this group */
    taskIds: string[];
}

export interface SwimlaneFilterState {
    /** Active grouping criterion */
    criterion: SwimlaneGroupCriterion;
    /** For tags criterion: which tags are selected (empty = all) */
    selectedTags: string[];
    /** Whether to show empty swimlane groups */
    showEmpty: boolean;
}

// ─── Date Bucketing Helpers ─────────────────────────────────────────────────

/**
 * Returns the start-of-day timestamp for a given date.
 */
function startOfDay(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * Returns the start-of-week (Monday) timestamp for a given date.
 */
function startOfWeek(ts: number): number {
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
function startOfMonth(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d.getTime();
}

export type DateBucket = 'today' | 'thisWeek' | 'thisMonth' | 'older' | 'noDate';

/**
 * Classify a timestamp into a date bucket relative to `now`.
 */
export function classifyDateBucket(ts: number | undefined, now: number): DateBucket {
    if (!ts) { return 'noDate'; }
    const todayStart = startOfDay(now);
    if (ts >= todayStart) { return 'today'; }
    const weekStart = startOfWeek(now);
    if (ts >= weekStart) { return 'thisWeek'; }
    const monthStart = startOfMonth(now);
    if (ts >= monthStart) { return 'thisMonth'; }
    return 'older';
}

const DATE_BUCKET_LABELS: Record<DateBucket, string> = {
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    older: 'Older',
    noDate: 'No Date'
};

const DATE_BUCKET_ORDER: DateBucket[] = ['today', 'thisWeek', 'thisMonth', 'older', 'noDate'];

// ─── Dependency Classification ──────────────────────────────────────────────

export type DependencyClass = 'blocked' | 'unblocked' | 'noDependencies';

/**
 * Classify a task's dependency status.
 * - `noDependencies`: task has no `dependsOn` entries
 * - `blocked`: task has unmet dependencies (at least one dep is not completed)
 * - `unblocked`: task has dependencies but all are completed
 *
 * Uses a Set of completed task IDs for O(1) lookups.
 * Guards against circular dependencies by only checking status, not traversing the graph.
 */
export function classifyDependency(
    task: OrchestratorTask,
    completedTaskIds: Set<string>
): DependencyClass {
    if (!task.dependsOn || task.dependsOn.length === 0) {
        return 'noDependencies';
    }
    const allMet = task.dependsOn.every(depId => completedTaskIds.has(depId));
    return allMet ? 'unblocked' : 'blocked';
}

const DEPENDENCY_LABELS: Record<DependencyClass, string> = {
    blocked: 'Blocked',
    unblocked: 'Unblocked',
    noDependencies: 'No Dependencies'
};

const DEPENDENCY_ORDER: DependencyClass[] = ['blocked', 'unblocked', 'noDependencies'];

// ─── Group-by Strategies ────────────────────────────────────────────────────

/**
 * Group tasks by their tags. A task with multiple tags appears in each
 * matching group. Tasks with no tags go into an "Untagged" group.
 *
 * @param selectedTags If non-empty, only these tags produce groups and only
 *   tasks matching at least one selected tag are included (plus untagged).
 */
export function groupByTags(
    tasks: OrchestratorTask[],
    selectedTags: string[]
): SwimlaneGroup[] {
    const tagMap = new Map<string, string[]>();
    const untagged: string[] = [];

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
            } else {
                tagMap.set(tag, [task.id]);
            }
        }
    }

    // Build result: sorted tag groups + untagged
    const groups: SwimlaneGroup[] = [];

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
export function groupByDependencies(tasks: OrchestratorTask[]): SwimlaneGroup[] {
    // Build set of completed task IDs for dependency resolution
    const completedIds = new Set<string>();
    for (const task of tasks) {
        if (task.status === 'completed' || task.kanbanColumn === 'done') {
            completedIds.add(task.id);
        }
    }

    const groups: Record<DependencyClass, string[]> = {
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
export function groupByCreatedDate(tasks: OrchestratorTask[], now?: number): SwimlaneGroup[] {
    const currentTime = now ?? Date.now();
    const groups: Record<DateBucket, string[]> = {
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
export function groupByStartedDate(tasks: OrchestratorTask[], now?: number): SwimlaneGroup[] {
    const currentTime = now ?? Date.now();
    const groups: Record<DateBucket, string[]> = {
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
export function computeSwimlaneGroups(
    tasks: OrchestratorTask[],
    filter: SwimlaneFilterState,
    now?: number
): SwimlaneGroup[] {
    let groups: SwimlaneGroup[];

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
export function collectAllTags(tasks: OrchestratorTask[]): string[] {
    const tagSet = new Set<string>();
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
export function defaultFilterState(): SwimlaneFilterState {
    return {
        criterion: 'none',
        selectedTags: [],
        showEmpty: false
    };
}
