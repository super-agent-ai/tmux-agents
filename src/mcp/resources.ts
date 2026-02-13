import { DaemonClient } from '../client/daemonClient';
import { formatHealthReport } from './formatters';

// ─── Resource Definitions ──────────────────────────────────────────────────

export const resources = [
    {
        uri: 'tmux-agents://health',
        name: 'System Health',
        description: 'Current system health report including daemon status, uptime, runtimes, and database',
        mimeType: 'text/plain'
    },
    {
        uri: 'tmux-agents://agents',
        name: 'All Agents',
        description: 'List of all active agents with full details',
        mimeType: 'application/json'
    },
    {
        uri: 'tmux-agents://board',
        name: 'Kanban Board',
        description: 'Complete kanban board state with all swim lanes and tasks',
        mimeType: 'application/json'
    },
    {
        uri: 'tmux-agents://pipelines/active',
        name: 'Active Pipelines',
        description: 'All currently running pipeline executions',
        mimeType: 'application/json'
    }
];

// ─── Resource Handlers ─────────────────────────────────────────────────────

export async function handleResource(
    uri: string,
    client: DaemonClient
): Promise<{ contents: string; mimeType: string }> {
    switch (uri) {
        case 'tmux-agents://health':
            return await handleHealthResource(client);
        case 'tmux-agents://agents':
            return await handleAgentsResource(client);
        case 'tmux-agents://board':
            return await handleBoardResource(client);
        case 'tmux-agents://pipelines/active':
            return await handlePipelinesResource(client);
        default:
            throw new Error(`Unknown resource: ${uri}`);
    }
}

async function handleHealthResource(client: DaemonClient): Promise<{ contents: string; mimeType: string }> {
    const health = await client.call('daemon.health');
    return {
        contents: formatHealthReport(health),
        mimeType: 'text/plain'
    };
}

async function handleAgentsResource(client: DaemonClient): Promise<{ contents: string; mimeType: string }> {
    const agents = await client.call('agent.list', {});
    return {
        contents: JSON.stringify(agents, null, 2),
        mimeType: 'application/json'
    };
}

async function handleBoardResource(client: DaemonClient): Promise<{ contents: string; mimeType: string }> {
    const board = await client.call('board.get', {});
    return {
        contents: JSON.stringify(board, null, 2),
        mimeType: 'application/json'
    };
}

async function handlePipelinesResource(client: DaemonClient): Promise<{ contents: string; mimeType: string }> {
    const pipelines = await client.call('pipeline.listActive', {});
    return {
        contents: JSON.stringify(pipelines, null, 2),
        mimeType: 'application/json'
    };
}
