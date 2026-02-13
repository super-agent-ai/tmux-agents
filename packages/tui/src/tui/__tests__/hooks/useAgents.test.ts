// ─── useAgents Hook Tests ───────────────────────────────────────────────────

/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgents } from '../../hooks/useAgents.js';
import type { IDaemonClient, AgentInfo } from '../../types.js';

describe('useAgents', () => {
  let mockClient: IDaemonClient;
  let subscribers: Array<(event: string, data: any) => void>;

  beforeEach(() => {
    subscribers = [];
    mockClient = {
      connect: vi.fn(),
      call: vi.fn(),
      subscribe: vi.fn((handler) => {
        subscribers.push(handler);
        return () => {
          subscribers = subscribers.filter((h) => h !== handler);
        };
      }),
      isRunning: vi.fn(),
      disconnect: vi.fn(),
    };
  });

  it('fetches agents on mount', async () => {
    const mockAgents: AgentInfo[] = [
      {
        id: '1',
        status: 'idle',
        role: 'developer',
        runtime: 'tmux',
        createdAt: Date.now(),
      },
    ];

    (mockClient.call as any).mockResolvedValue(mockAgents);

    const { result } = renderHook(() => useAgents(mockClient, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual(mockAgents);
    expect(result.current.error).toBeNull();
    expect(mockClient.call).toHaveBeenCalledWith('agent.list');
  });

  it('handles fetch errors', async () => {
    const error = new Error('Failed to fetch agents');
    (mockClient.call as any).mockRejectedValue(error);

    const { result } = renderHook(() => useAgents(mockClient, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toEqual(error);
  });

  it('refreshes on agent.created event', async () => {
    const initialAgents: AgentInfo[] = [];
    const updatedAgents: AgentInfo[] = [
      {
        id: '1',
        status: 'idle',
        role: 'developer',
        runtime: 'tmux',
        createdAt: Date.now(),
      },
    ];

    (mockClient.call as any)
      .mockResolvedValueOnce(initialAgents)
      .mockResolvedValueOnce(updatedAgents);

    const { result } = renderHook(() => useAgents(mockClient, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual(initialAgents);

    // Trigger agent.created event
    subscribers[0]('agent.created', { id: '1' });

    await waitFor(() => {
      expect(result.current.agents).toEqual(updatedAgents);
    });
  });

  it('returns null when client is not provided', () => {
    const { result } = renderHook(() => useAgents(null, false));

    expect(result.current.agents).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
