export interface SshServerConfig {
    /** Display name shown in the tree view */
    label: string;
    /** SSH hostname or IP address */
    host: string;
    /** SSH port (defaults to 22) */
    port?: number;
    /** SSH username */
    user?: string;
    /** Absolute path to a custom SSH config file (e.g., '~/.ssh/config_custom') */
    configFile?: string;
    /** Whether this server is enabled (defaults to true) */
    enabled?: boolean;
}
export interface ServerIdentity {
    /** Unique ID: "local" or "remote:<label>" */
    id: string;
    /** Display label for the tree view */
    label: string;
    /** Whether this is the local machine */
    isLocal: boolean;
    /** SSH config (undefined for local) */
    sshConfig?: SshServerConfig;
}
export declare enum ProcessCategory {
    BUILDING = "building",
    TESTING = "testing",
    INSTALLING = "installing",
    RUNNING = "running",
    IDLE = "idle"
}
/** Map process category → ThemeColor name */
export declare const PROCESS_CATEGORY_COLORS: Record<ProcessCategory, string>;
/** Map process category → ThemeIcon codicon name */
export declare const PROCESS_CATEGORY_ICONS: Record<ProcessCategory, string>;
export declare enum AIProvider {
    CLAUDE = "claude",
    GEMINI = "gemini",
    CODEX = "codex",
    OPENCODE = "opencode",
    CURSOR = "cursor",
    COPILOT = "copilot",
    AIDER = "aider",
    AMP = "amp",
    CLINE = "cline",
    KIRO = "kiro"
}
export declare enum AIStatus {
    WORKING = "working",
    WAITING = "waiting",
    IDLE = "idle"
}
/** Map AI status → ThemeColor name */
export declare const AI_STATUS_COLORS: Record<AIStatus, string>;
/** Map AI status → ThemeIcon codicon name */
export declare const AI_STATUS_ICONS: Record<AIStatus, string>;
export interface AISessionInfo {
    provider: AIProvider;
    status: AIStatus;
    /** Raw command that launched the AI */
    launchCommand: string;
    /** Rich metadata from @cc_* pane options (when hooks are installed) */
    metadata?: CcPaneMetadata;
}
export interface CcPaneMetadata {
    model?: string;
    sessionId?: string;
    cwd?: string;
    contextPct?: number;
    cost?: number;
    tokensIn?: number;
    tokensOut?: number;
    linesAdded?: number;
    linesRemoved?: number;
    lastTool?: string;
    agent?: string;
    version?: string;
    gitBranch?: string;
    outputStyle?: string;
    burnRate?: number;
    tokensRate?: number;
    elapsed?: string;
}
/**
 * Priority order for activity rollup display (highest first).
 * AI working > AI waiting > building > testing > installing > running > idle
 */
export declare enum ActivityPriority {
    AI_WORKING = 0,
    AI_WAITING = 1,
    BUILDING = 2,
    TESTING = 3,
    INSTALLING = 4,
    RUNNING = 5,
    IDLE = 6
}
export interface ActivityCount {
    category: string;
    count: number;
    priority: ActivityPriority;
}
export interface ActivitySummary {
    /** Sorted by priority (highest first), filtered to non-zero counts */
    counts: ActivityCount[];
    /** Formatted string like "2 working, 1 building" */
    description: string;
    /** The highest-priority activity for icon coloring */
    dominantPriority: ActivityPriority;
}
export interface HotkeyAssignment {
    /** The hotkey label, e.g. "a", "b1", "c2" */
    key: string;
    /** Target type */
    type: 'session' | 'window' | 'pane';
    /** Server ID */
    serverId: string;
    /** Session name */
    sessionName: string;
    /** Window index (for window/pane) */
    windowIndex?: string;
    /** Pane index (for pane) */
    paneIndex?: string;
}
export declare enum AttachmentStrategy {
    /** Reuse existing terminal with same name */
    REUSE_EXISTING = "reuse_existing",
    /** Create new terminal in editor area */
    CREATE_IN_EDITOR = "create_in_editor",
    /** Replace current terminal content */
    REPLACE_CURRENT = "replace_current",
    /** Deduplicate: find terminal already attached to same session */
    DEDUPLICATE = "deduplicate"
}
export interface AttachmentResult {
    strategy: AttachmentStrategy;
    terminalName: string;
    isNew: boolean;
}
export interface TmuxPane {
    serverId: string;
    sessionName: string;
    windowIndex: string;
    index: string;
    /** The tmux pane identifier (e.g. "%0", "%5") */
    paneId?: string;
    command: string;
    currentPath: string;
    isActive: boolean;
    pid: number;
    /** Categorized process type */
    processCategory?: ProcessCategory;
    /** Human-readable command description (e.g. "make install") */
    processDescription?: string;
    /** AI session info if this pane runs an AI tool */
    aiInfo?: AISessionInfo;
    /** Assigned hotkey label */
    hotkey?: string;
    /** Captured pane content (last N lines) for AI status detection */
    capturedContent?: string;
}
export interface TmuxWindow {
    serverId: string;
    sessionName: string;
    index: string;
    name: string;
    isActive: boolean;
    panes: TmuxPane[];
    /** Aggregated activity summary from child panes */
    activitySummary?: ActivitySummary;
    /** Assigned hotkey label */
    hotkey?: string;
}
export interface TmuxSession {
    serverId: string;
    name: string;
    isAttached: boolean;
    created: string;
    lastActivity: string;
    windows: TmuxWindow[];
    /** Aggregated activity summary from all descendant panes */
    activitySummary?: ActivitySummary;
    /** Assigned hotkey label */
    hotkey?: string;
}
export interface DaemonRefreshConfig {
    /** Light refresh interval in ms (default 10000) */
    lightIntervalMs: number;
    /** Full refresh interval in ms (default 60000) */
    fullIntervalMs: number;
    /** Whether daemon refresh is enabled */
    enabled: boolean;
}
/** Snapshot hash for change detection */
export interface TreeSnapshot {
    /** Hash of the serialized tree data */
    hash: string;
    /** Timestamp of the snapshot */
    timestamp: number;
    /** Number of sessions */
    sessionCount: number;
}
export interface CreateSessionOptions {
    name: string;
    serverId: string;
    /** AI provider to launch in the session */
    aiProvider?: AIProvider;
    /** Working directory */
    cwd?: string;
    /** Auto-attach after creation */
    autoAttach?: boolean;
}
export interface CreateWindowOptions {
    sessionName: string;
    serverId: string;
    name?: string;
    /** AI provider to launch in the window */
    aiProvider?: AIProvider;
}
export interface SplitPaneOptions {
    sessionName: string;
    windowIndex: string;
    paneIndex: string;
    serverId: string;
    direction: 'h' | 'v';
    /** AI provider to launch in the new pane */
    aiProvider?: AIProvider;
}
export interface RenameOptions {
    /** Use AI to generate name based on pane content */
    useAI?: boolean;
    /** Manual name override */
    name?: string;
}
export interface PaneCaptureConfig {
    /** Number of lines to capture from pane (default 50) */
    lines: number;
    /** Whether to capture pane content for AI detection */
    enabled: boolean;
}
export declare enum AgentRole {
    CODER = "coder",
    REVIEWER = "reviewer",
    TESTER = "tester",
    DEVOPS = "devops",
    RESEARCHER = "researcher",
    CUSTOM = "custom"
}
export declare enum AgentState {
    SPAWNING = "spawning",
    IDLE = "idle",
    WORKING = "working",
    ERROR = "error",
    COMPLETED = "completed",
    TERMINATED = "terminated"
}
export interface AgentTemplate {
    id: string;
    name: string;
    role: AgentRole;
    aiProvider: AIProvider;
    description?: string;
    systemPrompt?: string;
    workingDirectory?: string;
    preferredServer?: string;
    environmentVars?: Record<string, string>;
    autoStart?: boolean;
    persona?: AgentPersona;
}
export interface AgentInstance {
    id: string;
    templateId: string;
    name: string;
    role: AgentRole;
    aiProvider: AIProvider;
    state: AgentState;
    serverId: string;
    sessionName: string;
    windowIndex: string;
    paneIndex: string;
    teamId?: string;
    currentTaskId?: string;
    createdAt: number;
    lastActivityAt: number;
    errorMessage?: string;
    persona?: AgentPersona;
    orgUnitId?: string;
    guildIds?: string[];
}
export interface AgentTeam {
    id: string;
    name: string;
    description?: string;
    agents: string[];
    pipelineId?: string;
    createdAt: number;
}
export declare enum TaskStatus {
    PENDING = "pending",
    ASSIGNED = "assigned",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export interface OrchestratorTask {
    id: string;
    description: string;
    targetRole?: AgentRole;
    assignedAgentId?: string;
    status: TaskStatus;
    priority: number;
    input?: string;
    output?: string;
    pipelineStageId?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    errorMessage?: string;
    /** Kanban column override for board display */
    kanbanColumn?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
    /** Swim lane this task belongs to */
    swimLaneId?: string;
    /** Parent task ID (this task is a subtask) */
    parentTaskId?: string;
    /** Child subtask IDs */
    subtaskIds?: string[];
    /** Task IDs this task depends on (must complete before this task starts) */
    dependsOn?: string[];
    /** Whether verification is pending for this parent task */
    verificationStatus?: 'none' | 'pending' | 'passed' | 'failed';
    /** Tmux window info for attaching to running tasks */
    tmuxSessionName?: string;
    tmuxWindowIndex?: string;
    tmuxPaneIndex?: string;
    tmuxServerId?: string;
    /** Auto-start: automatically launch implementation */
    autoStart?: boolean;
    /** Auto-pilot: automatically answer questions during implementation */
    autoPilot?: boolean;
    /** Auto-close: when done, close tmux session and move to done */
    autoClose?: boolean;
    /** Timestamp (ms) when the task entered the 'done' kanban column — used by auto-close timer */
    doneAt?: number;
    /** Launch in a dedicated git worktree for isolation */
    useWorktree?: boolean;
    /** Path to the created git worktree (for cleanup) */
    worktreePath?: string;
    /** Use long-term memory file for cross-task context */
    useMemory?: boolean;
    /** AI provider override for this task (uses swim lane → global fallback when unset) */
    aiProvider?: AIProvider;
    /** AI model override for this task (uses swim lane → global fallback when unset) */
    aiModel?: string;
    /** Server override for this task (uses swim lane server when unset) */
    serverOverride?: string;
    /** Working directory override for this task (uses swim lane directory when unset) */
    workingDirectoryOverride?: string;
    /** Status change history entries */
    statusHistory?: TaskStatusHistoryEntry[];
    /** Comments on this task */
    comments?: TaskComment[];
    /** Tags for categorization */
    tags?: string[];
}
export interface TaskStatusHistoryEntry {
    id: string;
    taskId: string;
    fromStatus: string;
    toStatus: string;
    fromColumn: string;
    toColumn: string;
    changedAt: number;
}
export interface TaskComment {
    id: string;
    taskId: string;
    text: string;
    createdAt: number;
}
export interface FavouriteFolder {
    id: string;
    name: string;
    serverId: string;
    workingDirectory: string;
}
export interface SwimLaneDefaultToggles {
    autoStart?: boolean;
    autoPilot?: boolean;
    autoClose?: boolean;
    useWorktree?: boolean;
    useMemory?: boolean;
}
/** Toggle key names shared between tasks and swim lane defaults */
export type ToggleKey = keyof SwimLaneDefaultToggles;
/** All toggle keys for iteration */
export declare const TOGGLE_KEYS: readonly ToggleKey[];
/**
 * Resolve a single toggle value following the priority chain:
 *   explicit task value → swim lane default → false
 *
 * A task value of `undefined` means "not explicitly set" and falls through
 * to the swim lane default. A task value of `true` or `false` is treated
 * as an explicit override and returned as-is.
 */
export declare function resolveToggle(task: Pick<OrchestratorTask, ToggleKey>, key: ToggleKey, lane?: Pick<KanbanSwimLane, 'defaultToggles'>): boolean;
/**
 * Resolve all four toggles at once.
 * Returns an object with definite boolean values for each toggle.
 */
export declare function resolveAllToggles(task: Pick<OrchestratorTask, ToggleKey>, lane?: Pick<KanbanSwimLane, 'defaultToggles'>): Required<SwimLaneDefaultToggles>;
/**
 * Apply swim lane default toggles to a task, only setting values that the
 * task does not already have explicitly defined. This stamps inherited
 * defaults onto the task object so they persist in the database.
 */
export declare function applySwimLaneDefaults(task: OrchestratorTask, lane?: Pick<KanbanSwimLane, 'defaultToggles'>): void;
export interface KanbanSwimLane {
    id: string;
    name: string;
    serverId: string;
    workingDirectory: string;
    sessionName: string;
    createdAt: number;
    /** Whether the tmux session has been created */
    sessionActive?: boolean;
    /** Additional context/instructions injected into every task prompt in this lane */
    contextInstructions?: string;
    /** AI provider override for this lane (uses default setting when unset) */
    aiProvider?: AIProvider;
    /** AI model default for this lane (uses CLI default when unset) */
    aiModel?: string;
    /** Default toggle statuses applied to newly created tasks in this lane */
    defaultToggles?: SwimLaneDefaultToggles;
    /** Unique ID for the memory file (used as filename: {memoryFileId}.md) */
    memoryFileId?: string;
    /** Custom path for memory file directory (defaults to {workingDirectory}/memory) */
    memoryPath?: string;
}
export declare enum PipelineStatus {
    DRAFT = "draft",
    RUNNING = "running",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed"
}
export declare enum StageType {
    SEQUENTIAL = "sequential",
    PARALLEL = "parallel",
    CONDITIONAL = "conditional",
    FAN_OUT = "fan_out"
}
export interface PipelineStage {
    id: string;
    name: string;
    type: StageType;
    agentRole: AgentRole;
    taskDescription: string;
    dependsOn: string[];
    condition?: string;
    fanOutCount?: number;
    timeout?: number;
}
export interface Pipeline {
    id: string;
    name: string;
    description?: string;
    stages: PipelineStage[];
    createdAt: number;
    updatedAt: number;
}
export interface StageResult {
    status: TaskStatus;
    agentId?: string;
    output?: string;
    startedAt?: number;
    completedAt?: number;
    errorMessage?: string;
}
export interface PipelineRun {
    id: string;
    pipelineId: string;
    status: PipelineStatus;
    stageResults: Record<string, StageResult>;
    startedAt: number;
    completedAt?: number;
}
export type PersonalityType = 'methodical' | 'creative' | 'pragmatic' | 'analytical';
export type CommunicationStyle = 'concise' | 'detailed' | 'socratic';
export type SkillLevel = 'junior' | 'mid' | 'senior' | 'principal';
export type RiskTolerance = 'conservative' | 'moderate' | 'experimental';
export interface AgentPersona {
    personality: PersonalityType;
    communicationStyle: CommunicationStyle;
    expertiseAreas: string[];
    skillLevel: SkillLevel;
    background?: string;
    avatar?: string;
    riskTolerance: RiskTolerance;
}
export type OrgUnitType = 'department' | 'squad' | 'team';
export interface OrganizationUnit {
    id: string;
    name: string;
    type: OrgUnitType;
    parentId?: string;
    leadAgentId?: string;
    memberIds: string[];
    mission?: string;
    contextInstructions?: string;
}
export interface GuildKnowledge {
    id: string;
    summary: string;
    sourceTaskId: string;
    createdAt: number;
}
export interface Guild {
    id: string;
    name: string;
    expertiseArea: string;
    memberIds: string[];
    knowledgeBase: GuildKnowledge[];
    contextInstructions: string;
}
export interface AgentMessage {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    timestamp: number;
    read: boolean;
}
export interface TeamTemplateSlot {
    role: AgentRole;
    templateId?: string;
    label: string;
}
export interface TeamTemplate {
    id: string;
    name: string;
    description: string;
    slots: TeamTemplateSlot[];
}
export interface AgentProfileStats {
    agentId: string;
    agentName: string;
    role: AgentRole;
    aiProvider: AIProvider;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    successRate: number;
    avgCompletionMs: number;
    badges: string[];
}
export interface ConversationEntry {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: number;
}
export type ConversationStatus = 'idle' | 'streaming' | 'error';
export interface ChatConversation {
    id: string;
    title: string;
    createdAt: number;
    lastMessageAt: number;
    messages: ConversationEntry[];
    aiProvider: string;
    model: string;
    status: ConversationStatus;
    isCollapsed: boolean;
    lastPreview: string;
}
export interface DashboardAgentView {
    agent: AgentInstance;
    recentOutput: string;
}
export interface DashboardState {
    agents: DashboardAgentView[];
    activePipelines: PipelineRun[];
    taskQueue: OrchestratorTask[];
    teams: AgentTeam[];
    orgUnits: OrganizationUnit[];
    guilds: Guild[];
    agentMessages: AgentMessage[];
    agentProfiles: AgentProfileStats[];
    teamTemplates: TeamTemplate[];
    lastUpdated: number;
}
//# sourceMappingURL=types.d.ts.map