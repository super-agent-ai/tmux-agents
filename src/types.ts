// ─── SSH & Server Configuration ──────────────────────────────────────────────

export interface SshServerConfig {
    /** Display name shown in the tree view */
    label: string;
    /** SSH hostname or IP address */
    host: string;
    /** SSH port (defaults to 22) */
    port?: number;
    /** SSH username */
    user?: string;
    /** Absolute path to SSH private key file */
    identityFile?: string;
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

// ─── Process Tracking ────────────────────────────────────────────────────────

export enum ProcessCategory {
    BUILDING = 'building',
    TESTING = 'testing',
    INSTALLING = 'installing',
    RUNNING = 'running',
    IDLE = 'idle'
}

/** Map process category → ThemeColor name */
export const PROCESS_CATEGORY_COLORS: Record<ProcessCategory, string> = {
    [ProcessCategory.BUILDING]: 'terminal.ansiYellow',
    [ProcessCategory.TESTING]: 'terminal.ansiCyan',
    [ProcessCategory.INSTALLING]: 'terminal.ansiMagenta',
    [ProcessCategory.RUNNING]: 'terminal.ansiGreen',
    [ProcessCategory.IDLE]: 'foreground'
};

/** Map process category → ThemeIcon codicon name */
export const PROCESS_CATEGORY_ICONS: Record<ProcessCategory, string> = {
    [ProcessCategory.BUILDING]: 'tools',
    [ProcessCategory.TESTING]: 'beaker',
    [ProcessCategory.INSTALLING]: 'package',
    [ProcessCategory.RUNNING]: 'play',
    [ProcessCategory.IDLE]: 'terminal'
};

// ─── AI Assistant ────────────────────────────────────────────────────────────

export enum AIProvider {
    CLAUDE = 'claude',
    GEMINI = 'gemini',
    CODEX = 'codex'
}

export enum AIStatus {
    WORKING = 'working',
    WAITING = 'waiting',
    IDLE = 'idle'
}

/** Map AI status → ThemeColor name */
export const AI_STATUS_COLORS: Record<AIStatus, string> = {
    [AIStatus.WORKING]: 'terminal.ansiGreen',
    [AIStatus.WAITING]: 'terminal.ansiYellow',
    [AIStatus.IDLE]: 'foreground'
};

/** Map AI status → ThemeIcon codicon name */
export const AI_STATUS_ICONS: Record<AIStatus, string> = {
    [AIStatus.WORKING]: 'loading~spin',
    [AIStatus.WAITING]: 'bell',
    [AIStatus.IDLE]: 'hubot'
};

export interface AISessionInfo {
    provider: AIProvider;
    status: AIStatus;
    /** Raw command that launched the AI */
    launchCommand: string;
}

// ─── Activity Rollup ─────────────────────────────────────────────────────────

/**
 * Priority order for activity rollup display (highest first).
 * AI working > AI waiting > building > testing > installing > running > idle
 */
export enum ActivityPriority {
    AI_WORKING = 0,
    AI_WAITING = 1,
    BUILDING = 2,
    TESTING = 3,
    INSTALLING = 4,
    RUNNING = 5,
    IDLE = 6
}

export interface ActivityCount {
    category: string;      // "working", "waiting", "building", "testing", etc.
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

// ─── Hotkey System ───────────────────────────────────────────────────────────

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

// ─── Smart Attachment ────────────────────────────────────────────────────────

export enum AttachmentStrategy {
    /** Reuse existing terminal with same name */
    REUSE_EXISTING = 'reuse_existing',
    /** Create new terminal in editor area */
    CREATE_IN_EDITOR = 'create_in_editor',
    /** Replace current terminal content */
    REPLACE_CURRENT = 'replace_current',
    /** Deduplicate: find terminal already attached to same session */
    DEDUPLICATE = 'deduplicate'
}

export interface AttachmentResult {
    strategy: AttachmentStrategy;
    terminalName: string;
    isNew: boolean;
}

// ─── Core Tmux Data Models ───────────────────────────────────────────────────

export interface TmuxPane {
    serverId: string;
    sessionName: string;
    windowIndex: string;
    index: string;
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

// ─── Daemon Refresh ──────────────────────────────────────────────────────────

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

// ─── CRUD Operations ─────────────────────────────────────────────────────────

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

// ─── Pane content capture config ─────────────────────────────────────────────

export interface PaneCaptureConfig {
    /** Number of lines to capture from pane (default 50) */
    lines: number;
    /** Whether to capture pane content for AI detection */
    enabled: boolean;
}

// ─── Agent Orchestration ─────────────────────────────────────────────────────

export enum AgentRole {
    CODER = 'coder',
    REVIEWER = 'reviewer',
    TESTER = 'tester',
    DEVOPS = 'devops',
    RESEARCHER = 'researcher',
    CUSTOM = 'custom'
}

export enum AgentState {
    SPAWNING = 'spawning',
    IDLE = 'idle',
    WORKING = 'working',
    ERROR = 'error',
    COMPLETED = 'completed',
    TERMINATED = 'terminated'
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
}

// ─── Team Management ─────────────────────────────────────────────────────────

export interface AgentTeam {
    id: string;
    name: string;
    description?: string;
    agents: string[];  // agent instance IDs
    pipelineId?: string;
    createdAt: number;
}

// ─── Task Routing ────────────────────────────────────────────────────────────

export enum TaskStatus {
    PENDING = 'pending',
    ASSIGNED = 'assigned',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
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
}

// ─── Kanban Swim Lane ────────────────────────────────────────────────────────

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
}

// ─── Pipeline Engine ─────────────────────────────────────────────────────────

export enum PipelineStatus {
    DRAFT = 'draft',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

export enum StageType {
    SEQUENTIAL = 'sequential',
    PARALLEL = 'parallel',
    CONDITIONAL = 'conditional',
    FAN_OUT = 'fan_out'
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardAgentView {
    agent: AgentInstance;
    recentOutput: string;
}

export interface DashboardState {
    agents: DashboardAgentView[];
    activePipelines: PipelineRun[];
    taskQueue: OrchestratorTask[];
    teams: AgentTeam[];
    lastUpdated: number;
}
