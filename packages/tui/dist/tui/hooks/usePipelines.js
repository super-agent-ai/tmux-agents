// ─── Pipelines Hook ─────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
/**
 * Hook to fetch and manage pipeline list
 * Auto-refreshes every 2 seconds and responds to daemon events
 */
export function usePipelines(client, autoRefresh = true, refreshInterval = 2000) {
    const [pipelines, setPipelines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refresh = async () => {
        if (!client) {
            return;
        }
        try {
            setLoading(true);
            const result = await client.call('pipeline.list');
            setPipelines(result || []);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    };
    const activePipelines = pipelines.filter((p) => p.status === 'running' || p.status === 'pending');
    // Initial fetch and auto-refresh
    useEffect(() => {
        let mounted = true;
        let intervalId;
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
        const unsubscribe = client.subscribe((event, _data) => {
            if (event === 'pipeline.created' ||
                event === 'pipeline.updated' ||
                event === 'pipeline.completed' ||
                event === 'pipeline.failed') {
                refresh();
            }
        });
        return unsubscribe;
    }, [client]);
    return { pipelines, loading, error, refresh, activePipelines };
}
//# sourceMappingURL=usePipelines.js.map