import * as cp from 'child_process';
import * as util from 'util';
import {
    AgentRole,
    OrchestratorTask,
    TaskStatus,
} from './types';

const execAsync = util.promisify(cp.exec);

function spawnWithStdin(command: string, args: string[], input: string, timeoutMs: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const cmdStr = [command, ...args].join(' ');
        const proc = cp.exec(cmdStr, { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error && error.killed) { reject(new Error('Command timed out')); return; }
            if (error) { reject(new Error(stderr || stdout || error.message)); return; }
            resolve(stdout);
        });
        proc.stdin!.on('error', () => {});
        proc.stdin!.write(input);
        proc.stdin!.end();
    });
}

export class TaskRouter {

    /**
     * Route a natural language input to a specific agent role using Claude CLI.
     * Analyzes the input and determines the best role, a refined task description,
     * and a priority level.
     */
    public async routeTask(
        naturalLanguageInput: string,
        availableRoles: AgentRole[]
    ): Promise<{ role: AgentRole; taskDescription: string; priority: number }> {
        const roleDescriptions = availableRoles.map(role => {
            switch (role) {
                case AgentRole.CODER:
                    return `- ${role}: Writes and modifies code`;
                case AgentRole.REVIEWER:
                    return `- ${role}: Reviews code for bugs and improvements`;
                case AgentRole.TESTER:
                    return `- ${role}: Writes and runs tests`;
                case AgentRole.DEVOPS:
                    return `- ${role}: Handles deployment, CI/CD, infrastructure`;
                case AgentRole.RESEARCHER:
                    return `- ${role}: Researches topics and gathers information`;
                case AgentRole.CUSTOM:
                    return `- ${role}: Custom agent with user-defined behavior`;
            }
        }).join('\n');

        const prompt = `You are a task router for an AI agent orchestration system. Given a user's natural language request, determine:
1. Which agent role should handle this task
2. A clear, actionable task description for the agent
3. Priority (1=lowest, 10=highest)

Available roles:
${roleDescriptions}

Respond in JSON: {"role": "...", "description": "...", "priority": N}

User request: ${naturalLanguageInput}`;

        try {
            const stdout = await spawnWithStdin('claude', ['--print', '-'], prompt, 30000);

            const parsed = this.parseRouteResponse(stdout, availableRoles);
            return parsed;
        } catch (error) {
            console.warn('TaskRouter: Claude CLI call failed, using default routing:', error);
            return {
                role: availableRoles.includes(AgentRole.CODER) ? AgentRole.CODER : availableRoles[0],
                taskDescription: naturalLanguageInput,
                priority: 5,
            };
        }
    }

    /**
     * Parse the JSON response from Claude CLI and validate against available roles.
     */
    private parseRouteResponse(
        stdout: string,
        availableRoles: AgentRole[]
    ): { role: AgentRole; taskDescription: string; priority: number } {
        try {
            // Extract JSON from the response (handle potential text around the JSON)
            const jsonMatch = stdout.match(/\{[\s\S]*?\}/);
            if (!jsonMatch) {
                throw new Error('No JSON object found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and map the role
            const role = this.resolveRole(parsed.role, availableRoles);
            const taskDescription = typeof parsed.description === 'string'
                ? parsed.description
                : String(parsed.description || '');
            const priority = typeof parsed.priority === 'number'
                ? Math.max(1, Math.min(10, Math.round(parsed.priority)))
                : 5;

            return { role, taskDescription, priority };
        } catch (error) {
            console.warn('TaskRouter: Failed to parse Claude response:', error);
            return {
                role: availableRoles.includes(AgentRole.CODER) ? AgentRole.CODER : availableRoles[0],
                taskDescription: stdout.trim() || 'Unable to parse task',
                priority: 5,
            };
        }
    }

    /**
     * Resolve a role string from the LLM response to a valid AgentRole enum value.
     */
    private resolveRole(roleStr: string, availableRoles: AgentRole[]): AgentRole {
        if (!roleStr) {
            return availableRoles.includes(AgentRole.CODER) ? AgentRole.CODER : availableRoles[0];
        }

        const normalized = roleStr.toLowerCase().trim();

        // Direct match
        const directMatch = availableRoles.find(r => r === normalized);
        if (directMatch) {
            return directMatch;
        }

        // Partial/fuzzy match
        const fuzzyMatch = availableRoles.find(r => normalized.includes(r) || r.includes(normalized));
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        // Default to CODER if available, otherwise first available role
        return availableRoles.includes(AgentRole.CODER) ? AgentRole.CODER : availableRoles[0];
    }

    /**
     * Create a full OrchestratorTask from a natural language input.
     * Uses routeTask to determine the role and priority.
     */
    public async parseTaskFromNaturalLanguage(input: string): Promise<OrchestratorTask> {
        const allRoles: AgentRole[] = [
            AgentRole.CODER,
            AgentRole.REVIEWER,
            AgentRole.TESTER,
            AgentRole.DEVOPS,
            AgentRole.RESEARCHER,
        ];

        const { role, taskDescription, priority } = await this.routeTask(input, allRoles);

        const task: OrchestratorTask = {
            id: this.generateTaskId(),
            description: taskDescription,
            targetRole: role,
            status: TaskStatus.PENDING,
            priority,
            input,
            createdAt: Date.now(),
        };

        return task;
    }

    /**
     * Generate a short unique task ID.
     */
    public generateTaskId(): string {
        const random = Math.random().toString(36).substring(2, 8);
        return `task-${Date.now()}-${random}`;
    }
}
