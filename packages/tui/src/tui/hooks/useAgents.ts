// ─── Agents Hook ────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import type { AgentInfo, IDaemonClient } from '../types.js';

interface UseAgentsResult {
  agents: AgentInfo[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage agent list
 * Auto-refreshes every 2 seconds and responds to daemon events
 */
export function useAgents(
  client: IDaemonClient | null,
  autoRefresh = true,
  refreshInterval = 2000
): UseAgentsResult {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = async () => {
    if (!client) {
      return;
    }

    try {
      setLoading(true);
      const result = await client.call('agent.list');
      setAgents(result || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    let mounted = true;
    let intervalId: NodeJS.Timeout | undefined;

    if (client && mounted) {
      refresh();

      if (autoRefresh) {
        intervalId = setInterval(() => {
          if (mounted) {
            refresh();
          }
        }, refreshInterval);
      }
    }

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [client, autoRefresh, refreshInterval]);

  // Subscribe to agent events
  useEffect(() => {
    if (!client) {
      return;
    }

    const unsubscribe = client.subscribe((event: string, _data: any) => {
      if (event === 'agent.created' || event === 'agent.updated' || event === 'agent.deleted') {
        refresh();
      }
    });

    return unsubscribe;
  }, [client]);

  return { agents, loading, error, refresh };
}
