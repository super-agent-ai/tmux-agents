import { describe, it, expect } from 'vitest';
import { tools } from '../tools';

describe('MCP Tools', () => {
    it('defines exactly 12 tools', () => {
        expect(tools).toHaveLength(12);
    });

    it('all tools have required fields', () => {
        tools.forEach(tool => {
            expect(tool).toHaveProperty('name');
            expect(tool).toHaveProperty('description');
            expect(tool).toHaveProperty('inputSchema');
            expect(typeof tool.name).toBe('string');
            expect(typeof tool.description).toBe('string');
            expect(tool.description.length).toBeGreaterThan(10);
        });
    });

    it('all tool names are unique', () => {
        const names = tools.map(t => t.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(tools.length);
    });

    describe('list_agents', () => {
        const tool = tools.find(t => t.name === 'list_agents');

        it('exists', () => {
            expect(tool).toBeDefined();
        });

        it('has correct optional fields', () => {
            expect(tool?.description).toContain('List all agents');
        });
    });

    describe('spawn_agent', () => {
        const tool = tools.find(t => t.name === 'spawn_agent');

        it('exists', () => {
            expect(tool).toBeDefined();
        });

        it('requires role and task', () => {
            expect(tool?.description).toContain('spawn');
        });
    });

    describe('send_prompt', () => {
        const tool = tools.find(t => t.name === 'send_prompt');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('get_agent_output', () => {
        const tool = tools.find(t => t.name === 'get_agent_output');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('kill_agent', () => {
        const tool = tools.find(t => t.name === 'kill_agent');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('submit_task', () => {
        const tool = tools.find(t => t.name === 'submit_task');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('list_tasks', () => {
        const tool = tools.find(t => t.name === 'list_tasks');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('move_task', () => {
        const tool = tools.find(t => t.name === 'move_task');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('create_team', () => {
        const tool = tools.find(t => t.name === 'create_team');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('run_pipeline', () => {
        const tool = tools.find(t => t.name === 'run_pipeline');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('fan_out', () => {
        const tool = tools.find(t => t.name === 'fan_out');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });

    describe('get_dashboard', () => {
        const tool = tools.find(t => t.name === 'get_dashboard');

        it('exists', () => {
            expect(tool).toBeDefined();
        });
    });
});
