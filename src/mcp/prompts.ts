import { z } from 'zod';
import { DaemonClient } from '../client/daemonClient';
import { formatAgentList, formatTaskList, formatRuntimeList, formatAgentOutput } from './formatters';

// ─── Prompt Schemas ────────────────────────────────────────────────────────

const OrchestrateSchema = z.object({
    project: z.string().describe('Project name or description')
});

const ReviewProgressSchema = z.object({});

const DebugStuckAgentSchema = z.object({
    agent_id: z.string().describe('Agent ID to debug')
});

// ─── Prompt Definitions ────────────────────────────────────────────────────

export const prompts = [
    {
        name: 'orchestrate',
        description: 'Guide user through setting up an agent team for a project. Pre-fetches available runtimes and current agents.',
        arguments: [
            {
                name: 'project',
                description: 'Project name or description',
                required: true
            }
        ]
    },
    {
        name: 'review_progress',
        description: 'Review current progress across all agents and tasks. Pre-fetches agent outputs and task status.',
        arguments: []
    },
    {
        name: 'debug_stuck_agent',
        description: 'Debug an agent that appears stuck or unresponsive. Pre-fetches agent info and full output.',
        arguments: [
            {
                name: 'agent_id',
                description: 'ID of the agent to debug',
                required: true
            }
        ]
    }
];

// ─── Prompt Handlers ───────────────────────────────────────────────────────

export async function handlePrompt(
    name: string,
    args: any,
    client: DaemonClient
): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    switch (name) {
        case 'orchestrate':
            return await handleOrchestratePrompt(args, client);
        case 'review_progress':
            return await handleReviewProgressPrompt(args, client);
        case 'debug_stuck_agent':
            return await handleDebugStuckAgentPrompt(args, client);
        default:
            throw new Error(`Unknown prompt: ${name}`);
    }
}

async function handleOrchestratePrompt(
    args: any,
    client: DaemonClient
): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    // Pre-fetch context
    const runtimes = await client.call('runtime.list', {}).catch(() => []);
    const agents = await client.call('agent.list', {}).catch(() => []);

    const context = [
        '# Agent Orchestration Setup',
        '',
        `Project: ${args.project}`,
        '',
        '## Available Runtimes',
        formatRuntimeList(runtimes),
        '',
        '## Current Agents',
        agents.length > 0 ? formatAgentList(agents) : 'No agents currently running.',
        '',
        '## Your Task',
        'Help the user set up an appropriate agent team for this project. Consider:',
        '- What roles are needed (coder, reviewer, tester, researcher, devops, architect)?',
        '- Which runtime is most appropriate (tmux, docker, k8s)?',
        '- What AI providers to use (claude, gemini, codex, etc.)?',
        '- Whether to reuse existing agents or spawn new ones',
        '- How to organize tasks and assign them to agents',
        '',
        'Guide the user through creating the team and submitting initial tasks.'
    ].join('\n');

    return {
        description: `Set up agent team for project: ${args.project}`,
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: context
                }
            }
        ]
    };
}

async function handleReviewProgressPrompt(
    args: any,
    client: DaemonClient
): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    // Pre-fetch context
    const agents = await client.call('agent.list', {}).catch(() => []);
    const tasks = await client.call('task.list', {}).catch(() => []);

    // Limit to first 5 agents to avoid overwhelming the context
    const agentsToShow = agents.slice(0, 5);

    // Get output for each agent (last 20 lines)
    const agentDetails = await Promise.all(
        agentsToShow.map(async (agent: any) => {
            try {
                const output = await client.call('agent.getOutput', { id: agent.id, lines: 20 });
                return {
                    agent,
                    output: formatAgentOutput(output, 20)
                };
            } catch (e) {
                return {
                    agent,
                    output: '(failed to fetch output)'
                };
            }
        })
    );

    const context = [
        '# Progress Review',
        '',
        '## Agents',
        ...agentDetails.map(({ agent, output }) => [
            `### Agent ${agent.id}`,
            `Role: ${agent.role || 'unknown'}`,
            `Status: ${agent.status || 'unknown'}`,
            `Task: ${agent.task || 'No task assigned'}`,
            '',
            'Recent Output:',
            '```',
            output,
            '```',
            ''
        ].join('\n')),
        '',
        '## Tasks',
        formatTaskList(tasks),
        '',
        '## Your Task',
        'Review the current state of all agents and tasks. Identify:',
        '- Agents that may be stuck or need intervention',
        '- Tasks that are blocked or need attention',
        '- Overall progress towards goals',
        '- Recommendations for next steps',
        '',
        'Provide a summary and actionable recommendations.'
    ].join('\n');

    return {
        description: 'Review current progress across all agents and tasks',
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: context
                }
            }
        ]
    };
}

async function handleDebugStuckAgentPrompt(
    args: any,
    client: DaemonClient
): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    // Pre-fetch context
    const agents = await client.call('agent.list', {}).catch(() => []);
    const agent = agents.find((a: any) => a.id === args.agent_id);

    if (!agent) {
        throw new Error(`Agent ${args.agent_id} not found`);
    }

    const output = await client.call('agent.getOutput', { id: args.agent_id, lines: 100 }).catch(() => '(failed to fetch output)');

    const context = [
        '# Debug Stuck Agent',
        '',
        `## Agent ${agent.id}`,
        `Role: ${agent.role || 'unknown'}`,
        `Status: ${agent.status || 'unknown'}`,
        `Provider: ${agent.provider || 'unknown'}`,
        `Runtime: ${agent.runtime || 'unknown'}`,
        `Task: ${agent.task || 'No task assigned'}`,
        '',
        '## Full Output (last 100 lines)',
        '```',
        formatAgentOutput(output, 100),
        '```',
        '',
        '## Your Task',
        'Analyze why this agent appears stuck or unresponsive. Look for:',
        '- Error messages or stack traces',
        '- Prompts waiting for user input',
        '- Infinite loops or repetitive patterns',
        '- Resource exhaustion or timeouts',
        '- Configuration issues',
        '',
        'Provide specific recommendations to unstuck the agent, including:',
        '- Prompts to send to the agent',
        '- Configuration changes needed',
        '- Whether to restart or kill the agent',
        '- Root cause analysis'
    ].join('\n');

    return {
        description: `Debug stuck agent: ${args.agent_id}`,
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: context
                }
            }
        ]
    };
}
