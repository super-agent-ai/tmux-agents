import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { resolveTaskId } from '../util/resolve';
import { formatTable, truncate } from '../formatters/table';
import { formatKanbanBoard } from '../formatters/kanban';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerTaskCommands(program: Command, client: DaemonClient): void {
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
                await ensureDaemon(client);

                const filters: any = {};
                if (options.column) filters.column = options.column;
                if (options.lane) filters.lane = options.lane;

                const tasks = await client.call('task.list', filters);

                if (options.json) {
                    output(tasks, { json: true });
                } else {
                    if (tasks.length === 0) {
                        console.log(colorize('No tasks', colors.dim));
                        return;
                    }

                    output(formatTable(tasks, [
                        {
                            key: 'id',
                            title: 'ID',
                            width: 10,
                            formatter: (v) => truncate(v, 10)
                        },
                        {
                            key: 'column',
                            title: 'Column',
                            width: 12,
                            formatter: (v) => `${statusIcon(v)} ${v}`
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
                            formatter: (v) => truncate(v, 50)
                        }
                    ]));
                }
            } catch (err: any) {
                error(err.message);
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
                await ensureDaemon(client);

                const params: any = { description };
                if (options.priority) params.priority = options.priority;
                if (options.role) params.role = options.role;
                if (options.lane) params.lane = options.lane;

                const result = await client.call('task.submit', params);

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Task submitted: ${colorize(result.id, colors.green)}`);
                    console.log(`Column: ${result.column}`);
                    if (result.assignedAgent) {
                        console.log(`Assigned to: ${result.assignedAgent}`);
                    }
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    task
        .command('move')
        .description('Move task to different column')
        .argument('<id>', 'Task ID or prefix')
        .argument('<column>', 'Target column')
        .action(async (id, column) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveTaskId(client, id);

                await client.call('task.move', { id: fullId, column });
                console.log(`${statusIcon('success')} Task moved to ${column}`);
            } catch (err: any) {
                error(err.message);
            }
        });

    task
        .command('show')
        .description('Show task details')
        .argument('<id>', 'Task ID or prefix')
        .option('--json', 'Output JSON')
        .action(async (id, options) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveTaskId(client, id);
                const taskInfo = await client.call('task.get', { id: fullId });

                if (options.json) {
                    output(taskInfo, { json: true });
                } else {
                    console.log(colorize(taskInfo.id, colors.bold));
                    console.log(`Column:      ${statusIcon(taskInfo.column)} ${taskInfo.column}`);
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
            } catch (err: any) {
                error(err.message);
            }
        });

    task
        .command('cancel')
        .description('Cancel a task')
        .argument('<id>', 'Task ID or prefix')
        .action(async (id) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveTaskId(client, id);
                await client.call('task.cancel', { id: fullId });
                console.log(`${statusIcon('success')} Task cancelled`);
            } catch (err: any) {
                error(err.message);
            }
        });

    task
        .command('board')
        .description('Show ASCII kanban board')
        .option('-l, --lane <lane>', 'Filter by swim lane')
        .action(async (options) => {
            try {
                await ensureDaemon(client);

                const params: any = {};
                if (options.lane) params.lane = options.lane;

                const board = await client.call('kanban.getBoard', params);

                console.log(formatKanbanBoard(board));
            } catch (err: any) {
                error(err.message);
            }
        });

    task
        .command('pick')
        .description('Interactive task picker (fzf)')
        .action(async () => {
            try {
                // TODO: Implement fzf integration
                error('Task picker not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });
}
