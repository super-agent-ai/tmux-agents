// ─── Settings Schema ────────────────────────────────────────────────────────

export interface SettingDefinition {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array';
  category: string;
  label: string;
  description: string;
  default: any;
  options?: string[]; // For select type
  validation?: (value: any) => boolean;
  min?: number; // For number type
  max?: number; // For number type
}

export const settingsSchema: SettingDefinition[] = [
  // ─── Daemon Settings ────────────────────────────────────────────────────
  {
    key: 'daemon.host',
    type: 'string',
    category: 'Daemon',
    label: 'Daemon Host',
    description: 'Host address for daemon connection',
    default: 'localhost',
    validation: (value: string) => value.length > 0,
  },
  {
    key: 'daemon.port',
    type: 'number',
    category: 'Daemon',
    label: 'Daemon Port',
    description: 'Port for daemon HTTP API',
    default: 7331,
    min: 1024,
    max: 65535,
    validation: (value: number) => value >= 1024 && value <= 65535,
  },
  {
    key: 'daemon.socketPath',
    type: 'string',
    category: 'Daemon',
    label: 'Socket Path',
    description: 'Unix socket path for daemon',
    default: '~/.tmux-agents/daemon.sock',
  },
  {
    key: 'daemon.autoConnect',
    type: 'boolean',
    category: 'Daemon',
    label: 'Auto Connect',
    description: 'Automatically connect to daemon on TUI startup',
    default: true,
  },

  // ─── Display Settings ───────────────────────────────────────────────────
  {
    key: 'display.theme',
    type: 'select',
    category: 'Display',
    label: 'Color Theme',
    description: 'TUI color theme',
    default: 'dark',
    options: ['dark', 'light', 'high-contrast', 'solarized'],
  },
  {
    key: 'display.showLineNumbers',
    type: 'boolean',
    category: 'Display',
    label: 'Show Line Numbers',
    description: 'Display line numbers in output views',
    default: true,
  },
  {
    key: 'display.fontSize',
    type: 'number',
    category: 'Display',
    label: 'Font Size',
    description: 'Terminal font size scale (1=smallest, 5=largest)',
    default: 3,
    min: 1,
    max: 5,
    validation: (value: number) => value >= 1 && value <= 5,
  },
  {
    key: 'display.compactMode',
    type: 'boolean',
    category: 'Display',
    label: 'Compact Mode',
    description: 'Use compact spacing to fit more items on screen',
    default: false,
  },
  {
    key: 'display.showTimestamps',
    type: 'boolean',
    category: 'Display',
    label: 'Show Timestamps',
    description: 'Display timestamps for agent activity',
    default: true,
  },

  // ─── Agent Settings ─────────────────────────────────────────────────────
  {
    key: 'agents.defaultProvider',
    type: 'select',
    category: 'Agents',
    label: 'Default AI Provider',
    description: 'Default provider for new agents',
    default: 'claude',
    options: ['claude', 'gemini', 'codex', 'opencode', 'cursor', 'copilot', 'aider'],
  },
  {
    key: 'agents.maxConcurrent',
    type: 'number',
    category: 'Agents',
    label: 'Max Concurrent Agents',
    description: 'Maximum number of concurrent agents',
    default: 10,
    min: 1,
    max: 50,
    validation: (value: number) => value >= 1 && value <= 50,
  },
  {
    key: 'agents.autoReconnect',
    type: 'boolean',
    category: 'Agents',
    label: 'Auto Reconnect',
    description: 'Automatically reconnect to agents after daemon restart',
    default: true,
  },
  {
    key: 'agents.showInactive',
    type: 'boolean',
    category: 'Agents',
    label: 'Show Inactive Agents',
    description: 'Display agents that are stopped or idle',
    default: true,
  },

  // ─── Task Settings ──────────────────────────────────────────────────────
  {
    key: 'tasks.defaultLane',
    type: 'string',
    category: 'Tasks',
    label: 'Default Swim Lane',
    description: 'Default swim lane for new tasks',
    default: 'default',
  },
  {
    key: 'tasks.autoAssign',
    type: 'boolean',
    category: 'Tasks',
    label: 'Auto Assign Tasks',
    description: 'Automatically assign tasks to idle agents',
    default: false,
  },
  {
    key: 'tasks.groupBy',
    type: 'select',
    category: 'Tasks',
    label: 'Group Tasks By',
    description: 'How to group tasks in the task board',
    default: 'status',
    options: ['status', 'priority', 'assignee', 'lane', 'date'],
  },
  {
    key: 'tasks.defaultPriority',
    type: 'select',
    category: 'Tasks',
    label: 'Default Priority',
    description: 'Default priority for new tasks',
    default: 'medium',
    options: ['low', 'medium', 'high', 'urgent'],
  },

  // ─── Keyboard Settings ──────────────────────────────────────────────────
  {
    key: 'keyboard.vimMode',
    type: 'boolean',
    category: 'Keyboard',
    label: 'Vim Mode',
    description: 'Enable vim-style keybindings (hjkl navigation)',
    default: true,
  },
  {
    key: 'keyboard.confirmQuit',
    type: 'boolean',
    category: 'Keyboard',
    label: 'Confirm Quit',
    description: 'Require confirmation before quitting',
    default: false,
  },

  // ─── Advanced Settings ──────────────────────────────────────────────────
  {
    key: 'advanced.pollInterval',
    type: 'number',
    category: 'Advanced',
    label: 'Poll Interval (ms)',
    description: 'WebSocket reconnection poll interval in milliseconds',
    default: 5000,
    min: 1000,
    max: 60000,
    validation: (value: number) => value >= 1000 && value <= 60000,
  },
  {
    key: 'advanced.logLevel',
    type: 'select',
    category: 'Advanced',
    label: 'Log Level',
    description: 'Logging verbosity level',
    default: 'info',
    options: ['debug', 'info', 'warn', 'error'],
  },
  {
    key: 'advanced.cacheTimeout',
    type: 'number',
    category: 'Advanced',
    label: 'Cache Timeout (s)',
    description: 'How long to cache data before refreshing',
    default: 30,
    min: 5,
    max: 300,
    validation: (value: number) => value >= 5 && value <= 300,
  },
  {
    key: 'advanced.debugMode',
    type: 'boolean',
    category: 'Advanced',
    label: 'Debug Mode',
    description: 'Enable debug output and verbose logging',
    default: false,
  },
];

// Helper to get all categories
export function getCategories(): string[] {
  const categories = new Set<string>();
  settingsSchema.forEach((setting) => categories.add(setting.category));
  return Array.from(categories);
}

// Helper to get settings by category
export function getSettingsByCategory(category: string): SettingDefinition[] {
  return settingsSchema.filter((setting) => setting.category === category);
}

// Helper to get setting by key
export function getSettingByKey(key: string): SettingDefinition | undefined {
  return settingsSchema.find((setting) => setting.key === key);
}
