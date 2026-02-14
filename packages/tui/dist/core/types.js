// ─── SSH & Server Configuration ──────────────────────────────────────────────
// ─── Process Tracking ────────────────────────────────────────────────────────
export var ProcessCategory;
(function (ProcessCategory) {
    ProcessCategory["BUILDING"] = "building";
    ProcessCategory["TESTING"] = "testing";
    ProcessCategory["INSTALLING"] = "installing";
    ProcessCategory["RUNNING"] = "running";
    ProcessCategory["IDLE"] = "idle";
})(ProcessCategory || (ProcessCategory = {}));
/** Map process category → ThemeColor name */
export const PROCESS_CATEGORY_COLORS = {
    [ProcessCategory.BUILDING]: 'terminal.ansiYellow',
    [ProcessCategory.TESTING]: 'terminal.ansiCyan',
    [ProcessCategory.INSTALLING]: 'terminal.ansiMagenta',
    [ProcessCategory.RUNNING]: 'terminal.ansiGreen',
    [ProcessCategory.IDLE]: 'foreground'
};
/** Map process category → ThemeIcon codicon name */
export const PROCESS_CATEGORY_ICONS = {
    [ProcessCategory.BUILDING]: 'tools',
    [ProcessCategory.TESTING]: 'beaker',
    [ProcessCategory.INSTALLING]: 'package',
    [ProcessCategory.RUNNING]: 'play',
    [ProcessCategory.IDLE]: 'terminal'
};
// ─── AI Assistant ────────────────────────────────────────────────────────────
export var AIProvider;
(function (AIProvider) {
    AIProvider["CLAUDE"] = "claude";
    AIProvider["GEMINI"] = "gemini";
    AIProvider["CODEX"] = "codex";
    AIProvider["OPENCODE"] = "opencode";
    AIProvider["CURSOR"] = "cursor";
    AIProvider["COPILOT"] = "copilot";
    AIProvider["AIDER"] = "aider";
    AIProvider["AMP"] = "amp";
    AIProvider["CLINE"] = "cline";
    AIProvider["KIRO"] = "kiro";
})(AIProvider || (AIProvider = {}));
export var AIStatus;
(function (AIStatus) {
    AIStatus["WORKING"] = "working";
    AIStatus["WAITING"] = "waiting";
    AIStatus["IDLE"] = "idle";
})(AIStatus || (AIStatus = {}));
/** Map AI status → ThemeColor name */
export const AI_STATUS_COLORS = {
    [AIStatus.WORKING]: 'terminal.ansiGreen',
    [AIStatus.WAITING]: 'terminal.ansiYellow',
    [AIStatus.IDLE]: 'foreground'
};
/** Map AI status → ThemeIcon codicon name */
export const AI_STATUS_ICONS = {
    [AIStatus.WORKING]: 'loading~spin',
    [AIStatus.WAITING]: 'bell',
    [AIStatus.IDLE]: 'hubot'
};
// ─── Activity Rollup ─────────────────────────────────────────────────────────
/**
 * Priority order for activity rollup display (highest first).
 * AI working > AI waiting > building > testing > installing > running > idle
 */
export var ActivityPriority;
(function (ActivityPriority) {
    ActivityPriority[ActivityPriority["AI_WORKING"] = 0] = "AI_WORKING";
    ActivityPriority[ActivityPriority["AI_WAITING"] = 1] = "AI_WAITING";
    ActivityPriority[ActivityPriority["BUILDING"] = 2] = "BUILDING";
    ActivityPriority[ActivityPriority["TESTING"] = 3] = "TESTING";
    ActivityPriority[ActivityPriority["INSTALLING"] = 4] = "INSTALLING";
    ActivityPriority[ActivityPriority["RUNNING"] = 5] = "RUNNING";
    ActivityPriority[ActivityPriority["IDLE"] = 6] = "IDLE";
})(ActivityPriority || (ActivityPriority = {}));
// ─── Smart Attachment ────────────────────────────────────────────────────────
export var AttachmentStrategy;
(function (AttachmentStrategy) {
    /** Reuse existing terminal with same name */
    AttachmentStrategy["REUSE_EXISTING"] = "reuse_existing";
    /** Create new terminal in editor area */
    AttachmentStrategy["CREATE_IN_EDITOR"] = "create_in_editor";
    /** Replace current terminal content */
    AttachmentStrategy["REPLACE_CURRENT"] = "replace_current";
    /** Deduplicate: find terminal already attached to same session */
    AttachmentStrategy["DEDUPLICATE"] = "deduplicate";
})(AttachmentStrategy || (AttachmentStrategy = {}));
// ─── Agent Orchestration ─────────────────────────────────────────────────────
export var AgentRole;
(function (AgentRole) {
    AgentRole["CODER"] = "coder";
    AgentRole["REVIEWER"] = "reviewer";
    AgentRole["TESTER"] = "tester";
    AgentRole["DEVOPS"] = "devops";
    AgentRole["RESEARCHER"] = "researcher";
    AgentRole["CUSTOM"] = "custom";
})(AgentRole || (AgentRole = {}));
export var AgentState;
(function (AgentState) {
    AgentState["SPAWNING"] = "spawning";
    AgentState["IDLE"] = "idle";
    AgentState["WORKING"] = "working";
    AgentState["ERROR"] = "error";
    AgentState["COMPLETED"] = "completed";
    AgentState["TERMINATED"] = "terminated";
})(AgentState || (AgentState = {}));
// ─── Task Routing ────────────────────────────────────────────────────────────
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["ASSIGNED"] = "assigned";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["CANCELLED"] = "cancelled";
})(TaskStatus || (TaskStatus = {}));
/** All toggle keys for iteration */
export const TOGGLE_KEYS = ['autoStart', 'autoPilot', 'autoClose', 'useWorktree', 'useMemory'];
/**
 * Resolve a single toggle value following the priority chain:
 *   explicit task value → swim lane default → false
 *
 * A task value of `undefined` means "not explicitly set" and falls through
 * to the swim lane default. A task value of `true` or `false` is treated
 * as an explicit override and returned as-is.
 */
export function resolveToggle(task, key, lane) {
    const taskValue = task[key];
    if (taskValue !== undefined) {
        return taskValue;
    }
    if (lane?.defaultToggles?.[key] !== undefined) {
        return !!lane.defaultToggles[key];
    }
    return false;
}
/**
 * Resolve all four toggles at once.
 * Returns an object with definite boolean values for each toggle.
 */
export function resolveAllToggles(task, lane) {
    return {
        autoStart: resolveToggle(task, 'autoStart', lane),
        autoPilot: resolveToggle(task, 'autoPilot', lane),
        autoClose: resolveToggle(task, 'autoClose', lane),
        useWorktree: resolveToggle(task, 'useWorktree', lane),
        useMemory: resolveToggle(task, 'useMemory', lane),
    };
}
/**
 * Apply swim lane default toggles to a task, only setting values that the
 * task does not already have explicitly defined. This stamps inherited
 * defaults onto the task object so they persist in the database.
 */
export function applySwimLaneDefaults(task, lane) {
    if (!lane?.defaultToggles) {
        return;
    }
    for (const key of TOGGLE_KEYS) {
        if (task[key] === undefined && lane.defaultToggles[key]) {
            task[key] = true;
        }
    }
}
// ─── Pipeline Engine ─────────────────────────────────────────────────────────
export var PipelineStatus;
(function (PipelineStatus) {
    PipelineStatus["DRAFT"] = "draft";
    PipelineStatus["RUNNING"] = "running";
    PipelineStatus["PAUSED"] = "paused";
    PipelineStatus["COMPLETED"] = "completed";
    PipelineStatus["FAILED"] = "failed";
})(PipelineStatus || (PipelineStatus = {}));
export var StageType;
(function (StageType) {
    StageType["SEQUENTIAL"] = "sequential";
    StageType["PARALLEL"] = "parallel";
    StageType["CONDITIONAL"] = "conditional";
    StageType["FAN_OUT"] = "fan_out";
})(StageType || (StageType = {}));
//# sourceMappingURL=types.js.map