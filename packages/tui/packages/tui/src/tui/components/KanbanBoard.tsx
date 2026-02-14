// ─── Kanban Board Component ────────────────────────────────────────────────

import { Box, Text } from 'ink';
import type { TaskInfo } from '../types.js';

interface KanbanBoardProps {
  tasks: TaskInfo[];
}

/**
 * Kanban board showing tasks in columns by status
 */
export function KanbanBoard({ tasks }: KanbanBoardProps) {
  // Group tasks by status/column
  const columns = {
    backlog: tasks.filter((t) => t.status === 'backlog'),
    todo: tasks.filter((t) => t.status === 'todo'),
    inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked' || t.status === 'review'),
    done: tasks.filter((t) => t.status === 'done' || t.status === 'failed'),
  };

  const renderColumn = (title: string, columnTasks: TaskInfo[], color: string) => (
    <Box
      key={title}
      flexDirection="column"
      borderStyle="single"
      borderColor={color}
      paddingX={1}
      width="25%"
      marginRight={1}
    >
      <Text bold color={color}>
        {title} ({columnTasks.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {columnTasks.length === 0 ? (
          <Text dimColor italic>
            No tasks
          </Text>
        ) : (
          columnTasks.slice(0, 10).map((task) => (
            <Box
              key={task.id}
              flexDirection="column"
              borderStyle="round"
              borderColor="gray"
              paddingX={1}
              marginBottom={1}
            >
              <Text bold>{task.title || task.description || `Task ${task.id.slice(0, 8)}`}</Text>
              {task.assignedTo && (
                <Text dimColor>👤 {task.assignedTo}</Text>
              )}
              {task.priority && (
                <Text color={task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'gray'}>
                  ● {task.priority}
                </Text>
              )}
              {task.status === 'failed' && <Text color="red">✗ Failed</Text>}
              {task.status === 'blocked' && <Text color="yellow">⚠ Blocked</Text>}
              {task.status === 'review' && <Text color="cyan">👁 In Review</Text>}
            </Box>
          ))
        )}
        {columnTasks.length > 10 && (
          <Text dimColor italic>
            ...and {columnTasks.length - 10} more
          </Text>
        )}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" height="100%">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📋 Kanban Board
        </Text>
        <Text dimColor> - {tasks.length} total tasks</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        {renderColumn('📥 Backlog', columns.backlog, 'gray')}
        {renderColumn('📝 To Do', columns.todo, 'blue')}
        {renderColumn('🔨 In Progress', columns.inProgress, 'yellow')}
        {renderColumn('✅ Done', columns.done, 'green')}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Use Tab/1-4 to switch views │ j/k: Navigate │ r: Refresh │ q: Quit
        </Text>
      </Box>
    </Box>
  );
}
