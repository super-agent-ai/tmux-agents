# tmux-agents TUI

Terminal User Interface for tmux-agents, built with Ink (React for CLI).

## Features

- **Agent List**: View all agents with status indicators, runtime badges, and live updates
- **Task Board**: Kanban-style task view with columns for different statuses
- **Pipeline View**: Monitor active pipelines with stage progress
- **Settings UI**: Comprehensive configuration interface (VS Code-style)
- **Preview Pane**: View agent output in real-time (tmux split pane)
- **Interactive Attach**: Attach to agents interactively (works for tmux, Docker, K8s)
- **Keyboard Shortcuts**: Vim-style navigation and quick actions
- **Live Updates**: WebSocket events for real-time data refresh

## Usage

```bash
# Launch TUI (with tmux split panes)
tmux-agents tui

# Launch with custom daemon socket
tmux-agents tui --socket /path/to/daemon.sock

# Help
tmux-agents tui --help
```

## Keyboard Shortcuts

### Navigation
- `j` / `k` or `↓` / `↑`: Navigate list
- `1` / `2` / `3` / `4`: Switch tabs (Agents / Tasks / Pipelines / Settings)
- `h` / `l` or `←` / `→`: Navigate categories (Settings tab only)

### Actions
- `Enter`: Preview selected agent in right pane / Edit setting (Settings tab)
- `a`: Attach to agent (interactive mode)
- `s`: Send prompt to agent / Save settings (Settings tab)
- `n`: Spawn new agent
- `t`: Create new task
- `x`: Kill selected agent
- `r`: Force refresh / Reset setting to default (Settings tab)
- `R`: Reset all settings to defaults (Settings tab)
- `e`: Edit setting (Settings tab)
- `/`: Search settings (Settings tab)
- `Space`: Toggle boolean setting (Settings tab)
- `q`: Quit TUI
- `Ctrl+A`: Agent picker (fzf)
- `Ctrl+T`: Task picker (fzf)

## Layout

```
┌─────────────────────────────┬──────────────────────────┐
│                             │                          │
│    TUI Dashboard            │    Preview Pane          │
│    (Agents/Tasks/Pipelines) │    (Agent Output)        │
│                             │                          │
│                             ├──────────────────────────┤
│                             │    Status Bar            │
└─────────────────────────────┴──────────────────────────┘
```

## Modes

### Tmux Hybrid Mode (Recommended)
When tmux is available, the TUI launches in hybrid mode with:
- Left pane: Ink dashboard (60%)
- Right pane: Preview pane (40%)
- Bottom: Status bar (3 lines)

### Pure Ink Mode (Fallback)
When tmux is not available, the TUI launches in pure Ink mode with embedded output instead of a preview pane.

## Architecture

- **Components**: React components for UI (`components/`)
- **Hooks**: React hooks for data management (`hooks/`)
- **Utils**: Utility functions for tmux, preview, keybindings (`util/`)

### Data Flow

1. `useDaemon`: Connects to daemon via Unix socket or HTTP
2. `useAgents/useTasks/usePipelines`: Fetch data from daemon, auto-refresh, subscribe to events
3. `useEvents`: Subscribe to WebSocket events for real-time updates
4. Components render data and handle user input

## Dependencies

- **ink**: React for CLI
- **react**: React 19
- **chalk**: Terminal colors
- **ws**: WebSocket client
- **command-exists**: Check for tmux availability

## Development

```bash
# Install dependencies
npm install

# Build TUI
npm run compile:tui

# Watch mode
npm run watch:tui

# Run in dev mode (with tsx)
npm run dev:tui

# Run tests
npm test -- src/tui
```

## Integration with Client Library

Once `src/client/daemonClient.ts` is available (Phase 2b), replace the mock client in `hooks/useDaemon.ts` with the real implementation:

```typescript
import { DaemonClient } from '../../client/daemonClient.js';

export function useDaemon(socketPath?: string): UseDaemonResult {
  const [client, setClient] = useState<IDaemonClient | null>(null);
  // ... use real DaemonClient
}
```

## Testing

- **Unit Tests**: Component and hook tests with vitest and ink-testing-library
- **Integration Tests**: Launch TUI, interact with daemon, verify behavior
- **Visual Tests**: Screenshot tests for different states

Run tests:
```bash
npm test -- src/tui
```

## Settings

The TUI includes a comprehensive settings interface accessible as the 4th tab. Settings are persisted to `~/.tmux-agents/tui-settings.json`.

### Settings Categories

#### Daemon
- **Daemon Host**: Host address for daemon connection (default: `localhost`)
- **Daemon Port**: Port for daemon HTTP API (default: `7331`)
- **Socket Path**: Unix socket path for daemon (default: `~/.tmux-agents/daemon.sock`)
- **Auto Connect**: Automatically connect to daemon on TUI startup (default: `true`)

#### Display
- **Color Theme**: TUI color theme - `dark`, `light`, `high-contrast`, `solarized` (default: `dark`)
- **Show Line Numbers**: Display line numbers in output views (default: `true`)
- **Font Size**: Terminal font size scale 1-5 (default: `3`)
- **Compact Mode**: Use compact spacing to fit more items on screen (default: `false`)
- **Show Timestamps**: Display timestamps for agent activity (default: `true`)

#### Agents
- **Default AI Provider**: Default provider for new agents - `claude`, `gemini`, `codex`, `opencode`, `cursor`, `copilot`, `aider` (default: `claude`)
- **Max Concurrent Agents**: Maximum number of concurrent agents 1-50 (default: `10`)
- **Auto Reconnect**: Automatically reconnect to agents after daemon restart (default: `true`)
- **Show Inactive Agents**: Display agents that are stopped or idle (default: `true`)

#### Tasks
- **Default Swim Lane**: Default swim lane for new tasks (default: `default`)
- **Auto Assign Tasks**: Automatically assign tasks to idle agents (default: `false`)
- **Group Tasks By**: How to group tasks - `status`, `priority`, `assignee`, `lane`, `date` (default: `status`)
- **Default Priority**: Default priority for new tasks - `low`, `medium`, `high`, `urgent` (default: `medium`)

#### Keyboard
- **Vim Mode**: Enable vim-style keybindings (hjkl navigation) (default: `true`)
- **Confirm Quit**: Require confirmation before quitting (default: `false`)

#### Advanced
- **Poll Interval**: WebSocket reconnection poll interval in milliseconds 1000-60000 (default: `5000`)
- **Log Level**: Logging verbosity level - `debug`, `info`, `warn`, `error` (default: `info`)
- **Cache Timeout**: How long to cache data before refreshing in seconds 5-300 (default: `30`)
- **Debug Mode**: Enable debug output and verbose logging (default: `false`)

### Settings UI Shortcuts

- `↑↓` / `jk`: Navigate settings list
- `←→` / `hl`: Navigate category tabs
- `Enter` / `e`: Edit selected setting
- `Space`: Toggle boolean setting
- `/`: Search settings
- `s`: Save settings
- `r`: Reset selected setting to default
- `R`: Reset all settings to defaults
- `q`: Quit settings (warns if unsaved changes)
- `Q`: Force quit without saving

### Example Settings File

See `examples/tui-settings.json` for a complete example settings file:

```json
{
  "daemon.host": "localhost",
  "daemon.port": 7331,
  "display.theme": "dark",
  "agents.defaultProvider": "claude",
  "agents.maxConcurrent": 10,
  "tasks.autoAssign": false
}
```

### Settings Validation

All settings are validated before saving:
- **Type checking**: Ensures correct types (string, number, boolean, select)
- **Range validation**: Numbers must be within defined min/max ranges
- **Option validation**: Select values must match allowed options
- **Custom validation**: Additional rules per setting (e.g., valid hostnames, ports)

### Programmatic Access

To access settings from code:

```typescript
import { getSettingsManager } from './settings/settingsManager.js';

const settings = getSettingsManager();

// Get a setting
const theme = settings.get('display.theme');

// Set a setting
settings.set('display.theme', 'light');

// Save to file
settings.save();

// Reset to defaults
settings.reset();
```
