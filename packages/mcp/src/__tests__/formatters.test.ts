import { describe, it, expect } from 'vitest';
import {
    formatAgent,
    formatAgentList,
    formatTask,
    formatTaskList,
    formatTeam,
    formatPipeline,
    formatPipelineRun,
    formatBoard,
    formatDashboard,
    formatAgentOutput,
    formatHealthReport,
    formatRuntimeList,
    formatSuccess,
    formatError
} from '../formatters';

describe('Formatters', () => {
    describe('formatAgent', () => {
        it('formats a complete agent', () => {
            const agent = {
                id: 'a123',
                role: 'coder',
                status: 'active',
                provider: 'claude',
                runtime: 'docker',
                task: 'Fix bug',
                team: 'backend',
                workdir: '/app'
            };

            const result = formatAgent(agent);
            expect(result).toContain('Agent: a123');
            expect(result).toContain('Role: coder');
            expect(result).toContain('Status: active');
            expect(result).toContain('Provider: claude');
            expect(result).toContain('Runtime: docker');
            expect(result).toContain('Task: Fix bug');
        });

        it('formats a minimal agent', () => {
            const agent = { id: 'a456' };
            const result = formatAgent(agent);
            expect(result).toContain('Agent: a456');
            expect(result).toContain('Role: unknown');
        });
    });

    describe('formatAgentList', () => {
        it('formats empty list', () => {
            const result = formatAgentList([]);
            expect(result).toBe('No agents found.');
        });

        it('formats multiple agents', () => {
            const agents = [
                { id: 'a1', role: 'coder', status: 'active' },
                { id: 'a2', role: 'reviewer', status: 'idle' }
            ];
            const result = formatAgentList(agents);
            expect(result).toContain('Agent: a1');
            expect(result).toContain('Agent: a2');
        });
    });

    describe('formatTask', () => {
        it('formats a complete task', () => {
            const task = {
                id: 't123',
                description: 'Implement feature',
                status: 'doing',
                priority: 'high',
                role: 'coder',
                lane: 'backend'
            };

            const result = formatTask(task);
            expect(result).toContain('Task: t123');
            expect(result).toContain('Description: Implement feature');
            expect(result).toContain('Status: doing');
            expect(result).toContain('Priority: high');
        });
    });

    describe('formatTaskList', () => {
        it('formats empty list', () => {
            const result = formatTaskList([]);
            expect(result).toBe('No tasks found.');
        });
    });

    describe('formatTeam', () => {
        it('formats a team with agents', () => {
            const team = {
                id: 'team1',
                name: 'Backend Team',
                workdir: '/app',
                runtime: 'docker',
                agents: ['a1', 'a2', 'a3']
            };

            const result = formatTeam(team);
            expect(result).toContain('Team: Backend Team');
            expect(result).toContain('Agents (3)');
        });
    });

    describe('formatDashboard', () => {
        it('formats complete dashboard', () => {
            const dashboard = {
                agents: [
                    { id: 'a1', status: 'active' },
                    { id: 'a2', status: 'active' },
                    { id: 'a3', status: 'idle' }
                ],
                tasks: [
                    { id: 't1', column: 'doing' },
                    { id: 't2', column: 'done' }
                ],
                pipelines: [
                    { id: 'p1', name: 'Deploy', status: 'running' }
                ],
                runtimes: [
                    { type: 'docker', ok: true }
                ]
            };

            const result = formatDashboard(dashboard);
            expect(result).toContain('System Dashboard');
            expect(result).toContain('Agents (3)');
            expect(result).toContain('Tasks (2)');
        });
    });

    describe('formatAgentOutput', () => {
        it('handles empty output', () => {
            const result = formatAgentOutput('');
            expect(result).toBe('(no output)');
        });

        it('truncates long output', () => {
            const lines = Array(100).fill('test line').join('\n');
            const result = formatAgentOutput(lines, 10);
            expect(result).toContain('showing last 10 lines');
        });
    });

    describe('formatHealthReport', () => {
        it('formats health report', () => {
            const health = {
                ok: true,
                uptime: 3661,
                version: '0.1.19',
                runtimes: [{ type: 'docker', ok: true }],
                database: { ok: true, path: '/data/db.sqlite' }
            };

            const result = formatHealthReport(health);
            expect(result).toContain('System Health');
            expect(result).toContain('Status: OK');
            expect(result).toContain('1h 1m 1s');
        });
    });

    describe('formatSuccess and formatError', () => {
        it('formats success message', () => {
            const result = formatSuccess('Operation completed');
            expect(result).toContain('✓ Operation completed');
        });

        it('formats error message', () => {
            const result = formatError('Operation failed', 'Error details');
            expect(result).toContain('✗ Operation failed');
            expect(result).toContain('Error details');
        });
    });
});
