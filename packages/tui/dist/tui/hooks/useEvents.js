// ─── Events Hook ────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
/**
 * Hook to subscribe to daemon events via WebSocket
 * Maintains a history of recent events (max 100)
 */
export function useEvents(client, maxEvents = 100) {
    const [events, setEvents] = useState([]);
    const [lastEvent, setLastEvent] = useState(null);
    const clearEvents = () => {
        setEvents([]);
        setLastEvent(null);
    };
    useEffect(() => {
        if (!client) {
            return;
        }
        const unsubscribe = client.subscribe((event, data) => {
            const daemonEvent = {
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
//# sourceMappingURL=useEvents.js.map