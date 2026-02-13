"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRouter = void 0;
const cp = __importStar(require("child_process"));
const util = __importStar(require("util"));
const types_1 = require("./types");
const execAsync = util.promisify(cp.exec);
function spawnWithStdin(command, args, input, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const cmdStr = [command, ...args].join(' ');
        const proc = cp.exec(cmdStr, { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error && error.killed) {
                reject(new Error('Command timed out'));
                return;
            }
            if (error) {
                reject(new Error(stderr || stdout || error.message));
                return;
            }
            resolve(stdout);
        });
        proc.stdin.on('error', () => { });
        process.nextTick(() => {
            if (proc.stdin && proc.stdin.writable && !proc.killed) {
                proc.stdin.write(input);
                proc.stdin.end();
            }
        });
    });
}
class TaskRouter {
    /**
     * Route a natural language input to a specific agent role using Claude CLI.
     * Analyzes the input and determines the best role, a refined task description,
     * and a priority level.
     */
    async routeTask(naturalLanguageInput, availableRoles) {
        const roleDescriptions = availableRoles.map(role => {
            switch (role) {
                case types_1.AgentRole.CODER:
                    return `- ${role}: Writes and modifies code`;
                case types_1.AgentRole.REVIEWER:
                    return `- ${role}: Reviews code for bugs and improvements`;
                case types_1.AgentRole.TESTER:
                    return `- ${role}: Writes and runs tests`;
                case types_1.AgentRole.DEVOPS:
                    return `- ${role}: Handles deployment, CI/CD, infrastructure`;
                case types_1.AgentRole.RESEARCHER:
                    return `- ${role}: Researches topics and gathers information`;
                case types_1.AgentRole.CUSTOM:
                    return `- ${role}: Custom agent with user-defined behavior`;
            }
        }).join('\n');
        const prompt = `You are a task router for an AI agent orchestration system. Given a user's request, determine the best agent role, write a clear task description, and assign a priority.

## Available Roles
${roleDescriptions}

## Role Selection Guide
- **coder**: Implement features, fix bugs, refactor code, write scripts, modify configuration files
- **reviewer**: PR review, security audit, architecture review, code quality assessment
- **tester**: Write unit/integration/e2e tests, create test fixtures, improve test coverage
- **devops**: CI/CD pipelines, Docker/K8s config, deployment scripts, infrastructure setup
- **researcher**: Investigate options, compare libraries, analyze logs, gather information, write documentation

Select the most specialized role — e.g., choose devops for CI/CD tasks even if a coder could do it.

## Priority Rubric
- 1-3: Low priority, nice-to-have, minor improvements
- 4-6: Normal development work, standard feature or bug fix
- 7-8: Urgent, blocks other work or affects users
- 9-10: Critical, production-down, data loss risk, security vulnerability

## Output
Respond in JSON: {"role": "...", "description": "...", "priority": N}

The "description" should be a clear imperative instruction for the agent (e.g., "Implement a retry mechanism for failed API calls in src/api.ts with exponential backoff"), not a restatement of the user's words.

User request: ${naturalLanguageInput}`;
        try {
            const stdout = await spawnWithStdin('claude', ['--print', '-'], prompt, 30000);
            const parsed = this.parseRouteResponse(stdout, availableRoles);
            return parsed;
        }
        catch (error) {
            console.warn('TaskRouter: Claude CLI call failed, using default routing:', error);
            return {
                role: availableRoles.includes(types_1.AgentRole.CODER) ? types_1.AgentRole.CODER : availableRoles[0],
                taskDescription: naturalLanguageInput,
                priority: 5,
            };
        }
    }
    /**
     * Parse the JSON response from Claude CLI and validate against available roles.
     */
    parseRouteResponse(stdout, availableRoles) {
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
        }
        catch (error) {
            console.warn('TaskRouter: Failed to parse Claude response:', error);
            return {
                role: availableRoles.includes(types_1.AgentRole.CODER) ? types_1.AgentRole.CODER : availableRoles[0],
                taskDescription: stdout.trim() || 'Unable to parse task',
                priority: 5,
            };
        }
    }
    /**
     * Resolve a role string from the LLM response to a valid AgentRole enum value.
     */
    resolveRole(roleStr, availableRoles) {
        if (!roleStr) {
            return availableRoles.includes(types_1.AgentRole.CODER) ? types_1.AgentRole.CODER : availableRoles[0];
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
        return availableRoles.includes(types_1.AgentRole.CODER) ? types_1.AgentRole.CODER : availableRoles[0];
    }
    /**
     * Create a full OrchestratorTask from a natural language input.
     * Uses routeTask to determine the role and priority.
     */
    async parseTaskFromNaturalLanguage(input) {
        const allRoles = [
            types_1.AgentRole.CODER,
            types_1.AgentRole.REVIEWER,
            types_1.AgentRole.TESTER,
            types_1.AgentRole.DEVOPS,
            types_1.AgentRole.RESEARCHER,
        ];
        const { role, taskDescription, priority } = await this.routeTask(input, allRoles);
        const task = {
            id: this.generateTaskId(),
            description: taskDescription,
            targetRole: role,
            status: types_1.TaskStatus.PENDING,
            priority,
            input,
            createdAt: Date.now(),
        };
        return task;
    }
    /**
     * Generate a short unique task ID.
     */
    generateTaskId() {
        const random = Math.random().toString(36).substring(2, 8);
        return `task-${Date.now()}-${random}`;
    }
}
exports.TaskRouter = TaskRouter;
//# sourceMappingURL=taskRouter.js.map