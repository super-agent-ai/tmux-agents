// ─── Agents Hook ────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
/**
 * Hook to fetch and manage agent list
 * Auto-refreshes every 2 seconds and responds to daemon events
 */
export function useAgents(client, autoRefresh = true, refreshInterval = 2000) {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refresh = async () => {
        if (!client) {
            return;
        }
        try {
            setLoading(true);
            const result = await client.call('agent.list');
            setAgents(result || []);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    };
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
    // Subscribe to agent events
    useEffect(() => {
        if (!client) {
            return;
        }
        const unsubscribe = client.subscribe((event, _data) => {
            if (event === 'agent.created' || event === 'agent.updated' || event === 'agent.deleted') {
                refresh();
            }
        });
        return unsubscribe;
    }, [client]);
    return { agents, loading, error, refresh };
}
//# sourceMappingURL=useAgents.js.map