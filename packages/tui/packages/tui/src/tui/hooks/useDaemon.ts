// ─── Daemon Client Hook ─────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { DaemonClient } from '../../client/daemonClient.js';
import type { IDaemonClient } from '../types.js';

interface UseDaemonResult {
  client: IDaemonClient | null;
  connected: boolean;
  error: Error | null;
}

/**
 * Hook to manage daemon client connection
 */
export function useDaemon(socketPath?: string): UseDaemonResult {
  const [client, setClient] = useState<IDaemonClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
      } catch (err) {
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
