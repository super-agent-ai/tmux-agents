// AI-Readable Output Formatters
// ─── Agent Formatters ──────────────────────────────────────────────────────
export function formatAgent(agent) {
    const lines = [
        `Agent: ${agent.id}`,
        `  Role: ${agent.role || 'unknown'}`,
        `  Status: ${agent.status || 'unknown'}`,
    ];
    if (agent.provider) {
        lines.push(`  Provider: ${agent.provider}`);
    }
    if (agent.runtime) {
        lines.push(`  Runtime: ${agent.runtime}`);
    }
    if (agent.task) {
        lines.push(`  Task: ${agent.task}`);
    }
    if (agent.team) {
        lines.push(`  Team: ${agent.team}`);
    }
    if (agent.workdir) {
        lines.push(`  Workdir: ${agent.workdir}`);
    }
    return lines.join('\n');
}
export function formatAgentList(agents) {
    if (agents.length === 0) {
        return 'No agents found.';
    }
    return agents.map(agent => formatAgent(agent)).join('\n\n');
}
// ─── Task Formatters ───────────────────────────────────────────────────────
export function formatTask(task) {
    const lines = [
        `Task: ${task.id}`,
        `  Description: ${task.description || 'No description'}`,
        `  Status: ${task.status || task.column || 'unknown'}`,
    ];
    if (task.priority) {
        lines.push(`  Priority: ${task.priority}`);
    }
    if (task.role) {
        lines.push(`  Role: ${task.role}`);
    }
    if (task.lane) {
        lines.push(`  Lane: ${task.lane}`);
    }
    if (task.assignedTo) {
        lines.push(`  Assigned To: ${task.assignedTo}`);
    }
    return lines.join('\n');
}
export function formatTaskList(tasks) {
    if (tasks.length === 0) {
        return 'No tasks found.';
    }
    return tasks.map(task => formatTask(task)).join('\n\n');
}
// ─── Team Formatters ───────────────────────────────────────────────────────
export function formatTeam(team) {
    const lines = [
        `Team: ${team.name}`,
        `  ID: ${team.id}`,
    ];
    if (team.workdir) {
        lines.push(`  Workdir: ${team.workdir}`);
    }
    if (team.runtime) {
        lines.push(`  Runtime: ${team.runtime}`);
    }
    if (team.agents && team.agents.length > 0) {
        lines.push(`  Agents (${team.agents.length}):`);
        team.agents.forEach((agentId) => {
            lines.push(`    - ${agentId}`);
        });
    }
    return lines.join('\n');
}
// ─── Pipeline Formatters ───────────────────────────────────────────────────
export function formatPipeline(pipeline) {
    const lines = [
        `Pipeline: ${pipeline.name || pipeline.id}`,
        `  ID: ${pipeline.id}`,
    ];
    if (pipeline.stages && pipeline.stages.length > 0) {
        lines.push(`  Stages (${pipeline.stages.length}):`);
        pipeline.stages.forEach((stage, index) => {
            lines.push(`    ${index + 1}. ${stage.name || stage.id}`);
            if (stage.role) {
                lines.push(`       Role: ${stage.role}`);
            }
        });
    }
    return lines.join('\n');
}
export function formatPipelineRun(run) {
    const lines = [
        `Pipeline Run: ${run.id}`,
        `  Pipeline: ${run.pipelineId || run.name || 'unknown'}`,
        `  Status: ${run.status || 'unknown'}`,
    ];
    if (run.currentStage !== undefined) {
        lines.push(`  Current Stage: ${run.currentStage}`);
    }
    if (run.progress !== undefined) {
        lines.push(`  Progress: ${run.progress}%`);
    }
    return lines.join('\n');
}
// ─── Board Formatters ──────────────────────────────────────────────────────
export function formatBoard(board) {
    const lines = ['Kanban Board:'];
    const columns = ['backlog', 'todo', 'doing', 'review', 'done'];
    columns.forEach(column => {
        const tasks = board.lanes?.flatMap((lane) => (lane.tasks || []).filter((t) => t.column === column)) || [];
        lines.push(`\n  ${column.toUpperCase()} (${tasks.length}):`);
        if (tasks.length === 0) {
            lines.push('    (empty)');
        }
        else {
            tasks.forEach((task) => {
                lines.push(`    - ${task.id}: ${task.description}`);
            });
        }
    });
    return lines.join('\n');
}
// ─── Dashboard Formatters ──────────────────────────────────────────────────
export function formatDashboard(dashboard) {
    const lines = ['System Dashboard:\n'];
    // Agents
    lines.push(`Agents (${dashboard.agents?.length || 0}):`);
    if (dashboard.agents && dashboard.agents.length > 0) {
        const byStatus = dashboard.agents.reduce((acc, agent) => {
            const status = agent.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        Object.entries(byStatus).forEach(([status, count]) => {
            lines.push(`  ${status}: ${count}`);
        });
    }
    else {
        lines.push('  (none)');
    }
    // Tasks
    lines.push(`\nTasks (${dashboard.tasks?.length || 0}):`);
    if (dashboard.tasks && dashboard.tasks.length > 0) {
        const byColumn = dashboard.tasks.reduce((acc, task) => {
            const column = task.column || task.status || 'unknown';
            acc[column] = (acc[column] || 0) + 1;
            return acc;
        }, {});
        Object.entries(byColumn).forEach(([column, count]) => {
            lines.push(`  ${column}: ${count}`);
        });
    }
    else {
        lines.push('  (none)');
    }
    // Pipelines
    lines.push(`\nPipelines (${dashboard.pipelines?.length || 0}):`);
    if (dashboard.pipelines && dashboard.pipelines.length > 0) {
        dashboard.pipelines.forEach((pipeline) => {
            lines.push(`  - ${pipeline.name || pipeline.id}: ${pipeline.status || 'unknown'}`);
        });
    }
    else {
        lines.push('  (none)');
    }
    // Runtimes
    if (dashboard.runtimes && dashboard.runtimes.length > 0) {
        lines.push(`\nRuntimes (${dashboard.runtimes.length}):`);
        dashboard.runtimes.forEach((runtime) => {
            lines.push(`  - ${runtime.type}: ${runtime.ok ? 'OK' : 'ERROR'}`);
        });
    }
    return lines.join('\n');
}
// ─── Output Formatters ─────────────────────────────────────────────────────
export function formatAgentOutput(output, lines) {
    if (!output) {
        return '(no output)';
    }
    const outputLines = output.split('\n');
    if (lines && outputLines.length > lines) {
        const truncated = outputLines.slice(-lines);
        return `... (showing last ${lines} lines)\n${truncated.join('\n')}`;
    }
    return output;
}
// ─── Health Formatters ─────────────────────────────────────────────────────
export function formatHealthReport(health) {
    const lines = [
        'System Health:',
        `  Status: ${health.ok ? 'OK' : 'ERROR'}`,
        `  Uptime: ${formatUptime(health.uptime || 0)}`,
        `  Version: ${health.version || 'unknown'}`,
    ];
    if (health.runtimes && health.runtimes.length > 0) {
        lines.push('\n  Runtimes:');
        health.runtimes.forEach((runtime) => {
            const status = runtime.ok ? 'OK' : 'ERROR';
            const latency = runtime.latency ? ` (${runtime.latency}ms)` : '';
            lines.push(`    ${runtime.type}: ${status}${latency}`);
        });
    }
    if (health.database) {
        lines.push('\n  Database:');
        lines.push(`    Status: ${health.database.ok ? 'OK' : 'ERROR'}`);
        lines.push(`    Path: ${health.database.path}`);
    }
    return lines.join('\n');
}
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (days > 0)
        parts.push(`${days}d`);
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0)
        parts.push(`${secs}s`);
    return parts.join(' ');
}
// ─── Runtime Formatters ────────────────────────────────────────────────────
export function formatRuntimeList(runtimes) {
    if (runtimes.length === 0) {
        return 'No runtimes available.';
    }
    const lines = ['Available Runtimes:'];
    runtimes.forEach(runtime => {
        const status = runtime.ok ? 'OK' : 'ERROR';
        lines.push(`  ${runtime.type}: ${status}`);
        if (runtime.id) {
            lines.push(`    ID: ${runtime.id}`);
        }
    });
    return lines.join('\n');
}
// ─── Result Formatters ─────────────────────────────────────────────────────
export function formatSuccess(message, data) {
    let result = `✓ ${message}`;
    if (data) {
        result += '\n\n' + JSON.stringify(data, null, 2);
    }
    return result;
}
export function formatError(message, error) {
    let result = `✗ ${message}`;
    if (error) {
        if (typeof error === 'string') {
            result += `\n\n${error}`;
        }
        else if (error.message) {
            result += `\n\n${error.message}`;
        }
        else {
            result += '\n\n' + JSON.stringify(error, null, 2);
        }
    }
    return result;
}
//# sourceMappingURL=formatters.js.map