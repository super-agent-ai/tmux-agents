import { formatHealthReport } from './formatters.js';
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
export async function handleResource(uri, client) {
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
async function handleHealthResource(client) {
    const health = await client.call('daemon.health');
    return {
        contents: formatHealthReport(health),
        mimeType: 'text/plain'
    };
}
async function handleAgentsResource(client) {
    const agents = await client.call('agent.list', {});
    return {
        contents: JSON.stringify(agents, null, 2),
        mimeType: 'application/json'
    };
}
async function handleBoardResource(client) {
    const board = await client.call('board.get', {});
    return {
        contents: JSON.stringify(board, null, 2),
        mimeType: 'application/json'
    };
}
async function handlePipelinesResource(client) {
    const pipelines = await client.call('pipeline.listActive', {});
    return {
        contents: JSON.stringify(pipelines, null, 2),
        mimeType: 'application/json'
    };
}
//# sourceMappingURL=resources.js.map