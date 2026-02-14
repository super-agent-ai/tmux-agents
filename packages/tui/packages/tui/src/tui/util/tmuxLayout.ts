// ─── Tmux Layout Management ────────────────────────────────────────────────

import { execSync } from 'child_process';
import type { TmuxPaneInfo } from '../types.js';

const TUI_SESSION_NAME = 'tmux-agents-tui';

export interface TmuxLayoutConfig {
  dashboardWidth: number; // percentage (e.g., 60)
  previewWidth: number; // percentage (e.g., 40)
  statusBarHeight: number; // lines (e.g., 3)
}

const DEFAULT_LAYOUT: TmuxLayoutConfig = {
  dashboardWidth: 60,
  previewWidth: 40,
  statusBarHeight: 3,
};

/**
 * Creates a tmux session with split panes for the TUI
 * Layout:
 * ┌─────────────────┬──────────────┐
 * │                 │              │
 * │   Dashboard     │   Preview    │
 * │   (Ink TUI)     │   Pane       │
 * │                 │              │
 * │                 ├──────────────┤
 * │                 │ Status Bar   │
 * └─────────────────┴──────────────┘
 */
export function createTUISession(
  dashboardCommand: string,
  layout: TmuxLayoutConfig = DEFAULT_LAYOUT
): TmuxPaneInfo[] {
  try {
    // Check if session already exists
    const sessions = execSync('tmux list-sessions -F "#{session_name}"', {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    if (sessions.includes(TUI_SESSION_NAME)) {
      console.log(`Session ${TUI_SESSION_NAME} already exists, attaching...`);
      return getSessionPanes(TUI_SESSION_NAME);
    }

    // Create new session with dashboard command
    execSync(`tmux new-session -d -s ${TUI_SESSION_NAME} "${dashboardCommand}"`, {
      encoding: 'utf-8',
    });

    // Split horizontally for preview pane (right side)
    execSync(`tmux split-window -h -t ${TUI_SESSION_NAME}:0 -p ${layout.previewWidth}`, {
      encoding: 'utf-8',
    });

    // Split preview pane vertically for status bar (bottom)
    execSync(
      `tmux split-window -v -t ${TUI_SESSION_NAME}:0.1 -l ${layout.statusBarHeight}`,
      {
        encoding: 'utf-8',
      }
    );

    // Set status bar to show resource usage
    execSync(
      `tmux send-keys -t ${TUI_SESSION_NAME}:0.2 "echo 'Resource Monitor - Press q in dashboard to exit'" C-m`,
      {
        encoding: 'utf-8',
      }
    );

    // Set preview pane to show welcome message
    execSync(
      `tmux send-keys -t ${TUI_SESSION_NAME}:0.1 "echo 'Select an agent and press Enter to preview'" C-m`,
      {
        encoding: 'utf-8',
      }
    );

    return getSessionPanes(TUI_SESSION_NAME);
  } catch (error) {
    throw new Error(`Failed to create TUI session: ${error}`);
  }
}

/**
 * Gets pane information for the TUI session
 */
export function getSessionPanes(sessionName: string): TmuxPaneInfo[] {
  try {
    const output = execSync(
      `tmux list-panes -t ${sessionName}:0 -F "#{pane_id}:#{pane_index}"`,
      {
        encoding: 'utf-8',
      }
    );

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [paneId, indexStr] = line.split(':');
        return {
          sessionId: sessionName,
          paneId,
          index: parseInt(indexStr, 10),
        };
      });
  } catch (error) {
    throw new Error(`Failed to get session panes: ${error}`);
  }
}

/**
 * Attaches to the TUI session
 */
export function attachToTUISession(): void {
  try {
    execSync(`tmux attach-session -t ${TUI_SESSION_NAME}`, {
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(`Failed to attach to TUI session: ${error}`);
  }
}

/**
 * Kills the TUI session
 */
export function killTUISession(): void {
  try {
    execSync(`tmux kill-session -t ${TUI_SESSION_NAME}`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    // Ignore error if session doesn't exist
    const errorStr = String(error);
    if (!errorStr.includes('no such session')) {
      throw new Error(`Failed to kill TUI session: ${errorStr}`);
    }
  }
}

/**
 * Checks if tmux is available
 */
export function hasTmux(): boolean {
  try {
    execSync('command -v tmux', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the preview pane ID (pane 1)
 */
export function getPreviewPaneId(): string | undefined {
  try {
    const panes = getSessionPanes(TUI_SESSION_NAME);
    const previewPane = panes.find((p) => p.index === 1);
    return previewPane?.paneId;
  } catch {
    return undefined;
  }
}
