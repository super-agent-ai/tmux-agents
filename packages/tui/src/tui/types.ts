// ─── TUI Types ──────────────────────────────────────────────────────────────

// Placeholder types for client library integration (Phase 2b)
// These will be replaced with actual imports from src/client/ when available

export interface AgentInfo {
  id: string;
  status: 'idle' | 'busy' | 'building' | 'testing' | 'error' | 'stopped';
  role: string;
  runtime: 'tmux' | 'docker' | 'k8s';
  task?: string;
  output?: string;
  createdAt: number;
  lastActivity?: number;
}

export interface TaskInfo {
  id: string;
  title: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'failed';
  assignedTo?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: number;
  updatedAt: number;
  description?: string;
  dependencies?: string[];
}

export interface PipelineInfo {
  id: string;
  name: string;
  stages: PipelineStage[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: number;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  tasks: string[];
  progress: number;
}

export interface DaemonEvent {
  type: string;
  data: any;
  timestamp: number;
}

// Daemon client interface matching the real DaemonClient from src/client/
export interface IDaemonClient {
  connect(): Promise<void>;
  call(method: string, params?: any): Promise<any>;
  subscribe(handler: (event: string, data: any) => void): () => void;
  isRunning(): Promise<boolean>;
  disconnect(): void;
}

// TUI-specific types
export type TabView = 'agents' | 'tasks' | 'pipelines' | 'settings';

export interface TUIState {
  currentTab: TabView;
  selectedAgentIndex: number;
  selectedTaskIndex: number;
  selectedPipelineIndex: number;
  agents: AgentInfo[];
  tasks: TaskInfo[];
  pipelines: PipelineInfo[];
  previewPaneId?: string;
  previewingAgent?: string;
}

export interface KeyBinding {
  key: string;
  description: string;
  action: () => void;
}

export interface TmuxPaneInfo {
  sessionId: string;
  paneId: string;
  index: number;
}
