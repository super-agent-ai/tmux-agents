import { z } from 'zod';
import { DaemonClient } from '../client/daemonClient';
import {
    formatAgent,
    formatAgentList,
    formatTask,
    formatTaskList,
    formatTeam,
    formatPipelineRun,
    formatDashboard,
    formatAgentOutput,
    formatSuccess,
    formatError
} from './formatters.js';

// ─── Zod Schemas ───────────────────────────────────────────────────────────

const ListAgentsSchema = z.object({
    status: z.enum(['active', 'idle', 'error', 'completed']).optional(),
    role: z.string().optional(),
    team: z.string().optional(),
    runtime: z.enum(['tmux', 'docker', 'k8s']).optional()
});

const SpawnAgentSchema = z.object({
    role: z.enum(['coder', 'reviewer', 'tester', 'researcher', 'devops', 'architect']),
    task: z.string(),
    provider: z.string().optional(),
    runtime: z.enum(['tmux', 'docker', 'k8s']).optional(),
    workdir: z.string().optional(),
    image: z.string().optional(),
    memory: z.string().optional(),
    cpus: z.number().optional(),
    team: z.string().optional()
});

const SendPromptSchema = z.object({
    id: z.string(),
    prompt: z.string(),
    wait: z.boolean().optional()
});

const GetAgentOutputSchema = z.object({
    id: z.string(),
    lines: z.number().optional()
});

const KillAgentSchema = z.object({
    id: z.string()
});

const SubmitTaskSchema = z.object({
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    role: z.string().optional(),
    lane: z.string().optional()
});

const ListTasksSchema = z.object({
    column: z.enum(['backlog', 'todo', 'doing', 'review', 'done']).optional(),
    lane: z.string().optional()
});

const MoveTaskSchema = z.object({
    id: z.string(),
    column: z.enum(['backlog', 'todo', 'doing', 'review', 'done'])
});

const CreateTeamSchema = z.object({
    name: z.string(),
    agents: z.array(z.string()).optional(),
    workdir: z.string().optional(),
    runtime: z.enum(['tmux', 'docker', 'k8s']).optional()
});

const RunPipelineSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    stages: z.array(z.object({
        name: z.string(),
        role: z.string(),
        prompt: z.string(),
        dependencies: z.array(z.string()).optional()
    })).optional()
});

const FanOutSchema = z.object({
    prompt: z.string(),
    count: z.number().optional(),
    provider: z.string().optional(),
    runtime: z.enum(['tmux', 'docker', 'k8s']).optional()
});

const GetDashboardSchema = z.object({});

// ─── Tool Definitions ──────────────────────────────────────────────────────

export const tools = [
    {
        name: 'list_agents',
        description: 'List all agents with optional filters (status, role, team, runtime). Returns formatted agent list.',
        inputSchema: ListAgentsSchema
    },
    {
        name: 'spawn_agent',
        description: 'Create and spawn a new agent with specified role and task. Optionally specify provider, runtime, workdir, docker image, resources, and team.',
        inputSchema: SpawnAgentSchema
    },
    {
        name: 'send_prompt',
        description: 'Send a prompt to a specific agent. Set wait=true to wait for response.',
        inputSchema: SendPromptSchema
    },
    {
        name: 'get_agent_output',
        description: 'Get terminal output from an agent. Optionally specify number of lines (default 50).',
        inputSchema: GetAgentOutputSchema
    },
    {
        name: 'kill_agent',
        description: 'Terminate an agent by ID.',
        inputSchema: KillAgentSchema
    },
    {
        name: 'submit_task',
        description: 'Submit a new task to the kanban board. Optionally specify priority, role, and lane.',
        inputSchema: SubmitTaskSchema
    },
    {
        name: 'list_tasks',
        description: 'List tasks from kanban board with optional filters (column, lane).',
        inputSchema: ListTasksSchema
    },
    {
        name: 'move_task',
        description: 'Move a task to a different column (backlog, todo, doing, review, done).',
        inputSchema: MoveTaskSchema
    },
    {
        name: 'create_team',
        description: 'Create an agent team with specified name. Optionally add agents, set workdir and runtime.',
        inputSchema: CreateTeamSchema
    },
    {
        name: 'run_pipeline',
        description: 'Run an existing pipeline by ID, or create and run a new pipeline from stages array.',
        inputSchema: RunPipelineSchema
    },
    {
        name: 'fan_out',
        description: 'Execute the same prompt across N agents in parallel. Returns array of results.',
        inputSchema: FanOutSchema
    },
    {
        name: 'get_dashboard',
        description: 'Get full system overview including agents, tasks, pipelines, and runtimes.',
        inputSchema: GetDashboardSchema
    }
];

// ─── Tool Handlers ─────────────────────────────────────────────────────────

export async function handleTool(
    name: string,
    args: any,
    client: DaemonClient
): Promise<string> {
    try {
        switch (name) {
            case 'list_agents':
                return await handleListAgents(args, client);
            case 'spawn_agent':
                return await handleSpawnAgent(args, client);
            case 'send_prompt':
                return await handleSendPrompt(args, client);
            case 'get_agent_output':
                return await handleGetAgentOutput(args, client);
            case 'kill_agent':
                return await handleKillAgent(args, client);
            case 'submit_task':
                return await handleSubmitTask(args, client);
            case 'list_tasks':
                return await handleListTasks(args, client);
            case 'move_task':
                return await handleMoveTask(args, client);
            case 'create_team':
                return await handleCreateTeam(args, client);
            case 'run_pipeline':
                return await handleRunPipeline(args, client);
            case 'fan_out':
                return await handleFanOut(args, client);
            case 'get_dashboard':
                return await handleGetDashboard(args, client);
            default:
                return formatError(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        return formatError(`Tool ${name} failed`, error);
    }
}

async function handleListAgents(args: any, client: DaemonClient): Promise<string> {
    const agents = await client.call('agent.list', args);
    return formatAgentList(agents);
}

async function handleSpawnAgent(args: any, client: DaemonClient): Promise<string> {
    const agent = await client.call('agent.spawn', args);
    return formatSuccess('Agent spawned', agent);
}

async function handleSendPrompt(args: any, client: DaemonClient): Promise<string> {
    const result = await client.call('agent.sendPrompt', args);

    if (args.wait) {
        return formatSuccess('Prompt sent and response received', result);
    } else {
        return formatSuccess('Prompt sent to agent');
    }
}

async function handleGetAgentOutput(args: any, client: DaemonClient): Promise<string> {
    const output = await client.call('agent.getOutput', args);
    return formatAgentOutput(output, args.lines || 50);
}

async function handleKillAgent(args: any, client: DaemonClient): Promise<string> {
    await client.call('agent.kill', args);
    return formatSuccess(`Agent ${args.id} terminated`);
}

async function handleSubmitTask(args: any, client: DaemonClient): Promise<string> {
    const task = await client.call('task.submit', args);
    return formatSuccess('Task submitted', task);
}

async function handleListTasks(args: any, client: DaemonClient): Promise<string> {
    const tasks = await client.call('task.list', args);
    return formatTaskList(tasks);
}

async function handleMoveTask(args: any, client: DaemonClient): Promise<string> {
    await client.call('task.move', args);
    return formatSuccess(`Task ${args.id} moved to ${args.column}`);
}

async function handleCreateTeam(args: any, client: DaemonClient): Promise<string> {
    const team = await client.call('team.create', args);
    return formatSuccess('Team created', team);
}

async function handleRunPipeline(args: any, client: DaemonClient): Promise<string> {
    const run = await client.call('pipeline.run', args);
    return formatSuccess('Pipeline started', run);
}

async function handleFanOut(args: any, client: DaemonClient): Promise<string> {
    const results = await client.call('agent.fanOut', args);
    return formatSuccess(`Fan-out completed across ${results.length} agents`, results);
}

async function handleGetDashboard(args: any, client: DaemonClient): Promise<string> {
    const dashboard = await client.call('dashboard.get', args);
    return formatDashboard(dashboard);
}
