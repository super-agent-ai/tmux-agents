// ─── Preview Pane Management (Runtime-Agnostic) ────────────────────────────

import { execSync } from 'child_process';
import type { AgentInfo } from '../types.js';

/**
 * Preview agent output in the preview pane
 * This is runtime-agnostic - the daemon/CLI handles the runtime-specific command
 */
export function previewAgent(agent: AgentInfo, previewPaneId: string): void {
  try {
    // Use the CLI command which will delegate to the daemon
    // The daemon knows how to handle each runtime (tmux, docker, k8s)
    const cmd = `tmux-agents agent output ${agent.id} -f`;

    // Respawn the preview pane with the output command
    execSync(`tmux respawn-pane -k -t ${previewPaneId} "${cmd}"`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to preview agent ${agent.id}: ${error}`);
  }
}

/**
 * Attach to an agent interactively
 * This works for all runtimes: tmux attach, docker exec -it, kubectl exec -it
 */
export function attachToAgent(agent: AgentInfo, previewPaneId: string): void {
  try {
    // Use the CLI attach command which handles runtime-specific attachment
    const cmd = `tmux-agents agent attach ${agent.id}`;

    // Respawn the preview pane in interactive mode
    execSync(`tmux respawn-pane -k -t ${previewPaneId} "${cmd}"`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to attach to agent ${agent.id}: ${error}`);
  }
}

/**
 * Send a command to the preview pane
 */
export function sendToPreviewPane(previewPaneId: string, text: string): void {
  try {
    execSync(`tmux send-keys -t ${previewPaneId} "${text}" C-m`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to send keys to preview pane: ${error}`);
  }
}

/**
 * Clear the preview pane
 */
export function clearPreviewPane(previewPaneId: string): void {
  try {
    execSync(`tmux send-keys -t ${previewPaneId} C-l`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to clear preview pane: ${error}`);
  }
}

/**
 * Show a message in the preview pane
 */
export function showPreviewMessage(previewPaneId: string, message: string): void {
  try {
    execSync(`tmux respawn-pane -k -t ${previewPaneId} "echo '${message}'"`, {
      encoding: 'utf-8',
    });
  } catch (error) {
    throw new Error(`Failed to show preview message: ${error}`);
  }
}
