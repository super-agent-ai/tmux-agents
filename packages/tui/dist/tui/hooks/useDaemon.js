// ─── Daemon Client Hook ─────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { DaemonClient } from '../../client/daemonClient.js';
/**
 * Hook to manage daemon client connection
 */
export function useDaemon(socketPath) {
    const [client, setClient] = useState(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let mounted = true;
        const daemonClient = new DaemonClient({
            socketPath,
            autoReconnect: true,
            maxReconnectAttempts: 10,
            reconnectDelay: 1000,
        });
        async function connect() {
            try {
                await daemonClient.connect();
                if (mounted) {
                    setClient(daemonClient);
                    setConnected(true);
                    setError(null);
                }
            }
            catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setConnected(false);
                }
            }
        }
        connect();
        return () => {
            mounted = false;
            if (daemonClient) {
                daemonClient.disconnect();
            }
        };
    }, [socketPath]);
    return { client, connected, error };
}
//# sourceMappingURL=useDaemon.js.map