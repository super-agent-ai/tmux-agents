// ─── Events Hook ────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import type { DaemonEvent, IDaemonClient } from '../types.js';

interface UseEventsResult {
  events: DaemonEvent[];
  lastEvent: DaemonEvent | null;
  clearEvents: () => void;
}

/**
 * Hook to subscribe to daemon events via WebSocket
 * Maintains a history of recent events (max 100)
 */
export function useEvents(client: IDaemonClient | null, maxEvents = 100): UseEventsResult {
  const [events, setEvents] = useState<DaemonEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<DaemonEvent | null>(null);

  const clearEvents = () => {
    setEvents([]);
    setLastEvent(null);
  };

  useEffect(() => {
    if (!client) {
      return;
    }

    const unsubscribe = client.subscribe((event: string, data: any) => {
      const daemonEvent: DaemonEvent = {
        type: event,
        data,
        timestamp: Date.now(),
      };

      setLastEvent(daemonEvent);
      setEvents((prev) => {
        const updated = [...prev, daemonEvent];
        // Keep only the most recent events
        if (updated.length > maxEvents) {
          return updated.slice(-maxEvents);
        }
        return updated;
      });
    });

    return unsubscribe;
  }, [client, maxEvents]);

  return { events, lastEvent, clearEvents };
}
