// ─── Preview Utility Tests ──────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import { previewAgent, attachToAgent, showPreviewMessage } from '../../util/preview.js';
import type { AgentInfo } from '../../types.js';

// Mock child_process
vi.mock('child_process');

describe('preview utilities', () => {
  const mockAgent: AgentInfo = {
    id: 'agent-123',
    status: 'idle',
    role: 'developer',
    runtime: 'tmux',
    createdAt: Date.now(),
  };

  const previewPaneId = '%1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('previewAgent', () => {
    it('spawns preview command with correct arguments', () => {
      const execSyncMock = vi.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from(''));

      previewAgent(mockAgent, previewPaneId);

      expect(execSyncMock).toHaveBeenCalledWith(
        `tmux respawn-pane -k -t ${previewPaneId} "tmux-agents agent output ${mockAgent.id} -f"`,
        { encoding: 'utf-8' }
      );
    });

    it('throws error on failure', () => {
      vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('tmux not found');
      });

      expect(() => previewAgent(mockAgent, previewPaneId)).toThrow(
        `Failed to preview agent ${mockAgent.id}`
      );
    });
  });

  describe('attachToAgent', () => {
    it('spawns attach command with correct arguments', () => {
      const execSyncMock = vi.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from(''));

      attachToAgent(mockAgent, previewPaneId);

      expect(execSyncMock).toHaveBeenCalledWith(
        `tmux respawn-pane -k -t ${previewPaneId} "tmux-agents agent attach ${mockAgent.id}"`,
        { encoding: 'utf-8' }
      );
    });

    it('throws error on failure', () => {
      vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('tmux not found');
      });

      expect(() => attachToAgent(mockAgent, previewPaneId)).toThrow(
        `Failed to attach to agent ${mockAgent.id}`
      );
    });
  });

  describe('showPreviewMessage', () => {
    it('displays message in preview pane', () => {
      const execSyncMock = vi.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from(''));

      const message = 'Select an agent';
      showPreviewMessage(previewPaneId, message);

      expect(execSyncMock).toHaveBeenCalledWith(
        `tmux respawn-pane -k -t ${previewPaneId} "echo '${message}'"`,
        { encoding: 'utf-8' }
      );
    });
  });
});
