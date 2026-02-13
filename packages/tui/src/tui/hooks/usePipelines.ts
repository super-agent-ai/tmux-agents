// ─── Pipelines Hook ─────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import type { PipelineInfo, IDaemonClient } from '../types.js';

interface UsePipelinesResult {
  pipelines: PipelineInfo[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  activePipelines: PipelineInfo[];
}

/**
 * Hook to fetch and manage pipeline list
 * Auto-refreshes every 2 seconds and responds to daemon events
 */
export function usePipelines(
  client: IDaemonClient | null,
  autoRefresh = true,
  refreshInterval = 2000
): UsePipelinesResult {
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = async () => {
    if (!client) {
      return;
    }

    try {
      setLoading(true);
      const result = await client.call('pipeline.list');
      setPipelines(result || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  const activePipelines = pipelines.filter(
    (p) => p.status === 'running' || p.status === 'pending'
  );

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

  // Subscribe to pipeline events
  useEffect(() => {
    if (!client) {
      return;
    }

    const unsubscribe = client.subscribe((event: string, _data: any) => {
      if (
        event === 'pipeline.created' ||
        event === 'pipeline.updated' ||
        event === 'pipeline.completed' ||
        event === 'pipeline.failed'
      ) {
        refresh();
      }
    });

    return unsubscribe;
  }, [client]);

  return { pipelines, loading, error, refresh, activePipelines };
}
