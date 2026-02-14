// ─── Tasks Hook ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
/**
 * Hook to fetch and manage task list
 * Auto-refreshes every 3 seconds and responds to daemon events
 */
export function useTasks(client, autoRefresh = true, refreshInterval = 3000) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refresh = async () => {
        if (!client) {
            return;
        }
        try {
            setLoading(true);
            const result = await client.call('task.list');
            setTasks(result || []);
            setError(null);
        }
        catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
        finally {
            setLoading(false);
        }
    };
    const getTasksByStatus = (status) => {
        return tasks.filter((task) => task.status === status);
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
    // Subscribe to task events
    useEffect(() => {
        if (!client) {
            return;
        }
        const unsubscribe = client.subscribe((event, _data) => {
            if (event === 'task.created' || event === 'task.updated' || event === 'task.deleted') {
                refresh();
            }
        });
        return unsubscribe;
    }, [client]);
    return { tasks, loading, error, refresh, getTasksByStatus };
}
//# sourceMappingURL=useTasks.js.map