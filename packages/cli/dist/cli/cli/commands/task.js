"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTaskCommands = registerTaskCommands;
const output_1 = require("../util/output");
const daemon_guard_1 = require("../util/daemon-guard");
const resolve_1 = require("../util/resolve");
const table_1 = require("../formatters/table");
const kanban_1 = require("../formatters/kanban");
const icons_1 = require("../formatters/icons");
function registerTaskCommands(program, client) {
    const task = program
        .command('task')
        .description('Manage tasks');
    task
        .command('list')
        .description('List all tasks')
        .option('-c, --column <column>', 'Filter by column')
        .option('-l, --lane <lane>', 'Filter by swim lane')
        .option('--json', 'Output JSON')
        .action(async (options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const filters = {};
            if (options.column)
                filters.column = options.column;
            if (options.lane)
                filters.lane = options.lane;
            const tasks = await client.call('task.list', filters);
            if (options.json) {
                (0, output_1.output)(tasks, { json: true });
            }
            else {
                if (tasks.length === 0) {
                    console.log((0, icons_1.colorize)('No tasks', icons_1.colors.dim));
                    return;
                }
                (0, output_1.output)((0, table_1.formatTable)(tasks, [
                    {
                        key: 'id',
                        title: 'ID',
                        width: 10,
                        formatter: (v) => (0, table_1.truncate)(v, 10)
                    },
                    {
                        key: 'column',
                        title: 'Column',
                        width: 12,
                        formatter: (v) => `${(0, icons_1.statusIcon)(v)} ${v}`
                    },
                    {
                        key: 'priority',
                        title: 'Pri',
                        width: 3,
                        align: 'right'
                    },
                    {
                        key: 'role',
                        title: 'Role',
                        width: 12
                    },
                    {
                        key: 'description',
                        title: 'Description',
                        width: 50,
                        formatter: (v) => (0, table_1.truncate)(v, 50)
                    }
                ]));
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('submit')
        .description('Submit a new task')
        .argument('<description>', 'Task description')
        .option('-p, --priority <n>', 'Priority (1-10)', parseInt)
        .option('-r, --role <role>', 'Target role')
        .option('-l, --lane <lane>', 'Swim lane')
        .option('--json', 'Output JSON')
        .action(async (description, options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = { description };
            if (options.priority)
                params.priority = options.priority;
            if (options.role)
                params.role = options.role;
            if (options.lane)
                params.lane = options.lane;
            const result = await client.call('task.submit', params);
            if (options.json) {
                (0, output_1.output)(result, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Task submitted: ${(0, icons_1.colorize)(result.id, icons_1.colors.green)}`);
                console.log(`Column: ${result.column}`);
                if (result.assignedAgent) {
                    console.log(`Assigned to: ${result.assignedAgent}`);
                }
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('move')
        .description('Move task to different column')
        .argument('<id>', 'Task ID or prefix')
        .argument('<column>', 'Target column')
        .action(async (id, column) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const fullId = await (0, resolve_1.resolveTaskId)(client, id);
            await client.call('task.move', { id: fullId, column });
            console.log(`${(0, icons_1.statusIcon)('success')} Task moved to ${column}`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('show')
        .description('Show task details')
        .argument('<id>', 'Task ID or prefix')
        .option('--json', 'Output JSON')
        .action(async (id, options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const fullId = await (0, resolve_1.resolveTaskId)(client, id);
            const taskInfo = await client.call('task.get', { id: fullId });
            if (options.json) {
                (0, output_1.output)(taskInfo, { json: true });
            }
            else {
                console.log((0, icons_1.colorize)(taskInfo.id, icons_1.colors.bold));
                console.log(`Column:      ${(0, icons_1.statusIcon)(taskInfo.column)} ${taskInfo.column}`);
                console.log(`Priority:    ${taskInfo.priority || '-'}`);
                console.log(`Role:        ${taskInfo.role || '-'}`);
                console.log(`Description: ${taskInfo.description}`);
                if (taskInfo.assignedAgent) {
                    console.log(`Assigned:    ${taskInfo.assignedAgent}`);
                }
                if (taskInfo.lane) {
                    console.log(`Lane:        ${taskInfo.lane}`);
                }
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('cancel')
        .description('Cancel a task')
        .argument('<id>', 'Task ID or prefix')
        .action(async (id) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const fullId = await (0, resolve_1.resolveTaskId)(client, id);
            await client.call('task.cancel', { id: fullId });
            console.log(`${(0, icons_1.statusIcon)('success')} Task cancelled`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('board')
        .description('Show ASCII kanban board')
        .option('-l, --lane <lane>', 'Filter by swim lane')
        .action(async (options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = {};
            if (options.lane)
                params.lane = options.lane;
            const board = await client.call('kanban.getBoard', params);
            console.log((0, kanban_1.formatKanbanBoard)(board));
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    task
        .command('pick')
        .description('Interactive task picker (fzf)')
        .action(async () => {
        try {
            // TODO: Implement fzf integration
            (0, output_1.error)('Task picker not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=task.js.map