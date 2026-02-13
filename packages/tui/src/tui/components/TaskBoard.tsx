// ─── Task Board Component ───────────────────────────────────────────────────

import { Box, Text } from 'ink';
import type { TaskInfo } from '../types.js';

interface TaskBoardProps {
  tasks: TaskInfo[];
  selectedIndex: number;
  loading?: boolean;
}

const COLUMNS: Array<{ status: TaskInfo['status']; label: string; color: string }> = [
  { status: 'backlog', label: 'Backlog', color: 'gray' },
  { status: 'todo', label: 'To Do', color: 'white' },
  { status: 'in_progress', label: 'In Progress', color: 'yellow' },
  { status: 'blocked', label: 'Blocked', color: 'red' },
  { status: 'review', label: 'Review', color: 'cyan' },
  { status: 'done', label: 'Done', color: 'green' },
  { status: 'failed', label: 'Failed', color: 'red' },
];

/**
 * Kanban board view of tasks
 */
export function TaskBoard({ tasks, selectedIndex, loading = false }: TaskBoardProps) {
  const getTasksByStatus = (status: TaskInfo['status']): TaskInfo[] => {
    return tasks.filter((t) => t.status === status);
  };

  const getPriorityIcon = (priority: TaskInfo['priority']): string => {
    switch (priority) {
      case 'urgent':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading tasks...</Text>
      </Box>
    );
  }

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No tasks found</Text>
        <Text dimColor>Press 't' to create a new task</Text>
      </Box>
    );
  }

  // Get all tasks as a flat list for selection
  const flatTasks: Array<{ task: TaskInfo; columnIndex: number }> = [];
  COLUMNS.forEach((column, columnIndex) => {
    const columnTasks = getTasksByStatus(column.status);
    columnTasks.forEach((task) => {
      flatTasks.push({ task, columnIndex });
    });
  });

  const selectedTask = flatTasks[selectedIndex]?.task;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold>Task Board ({tasks.length} tasks)</Text>
      </Box>

      {/* Columns */}
      <Box flexDirection="row" paddingX={1} paddingY={1}>
        {COLUMNS.map((column, columnIndex) => {
          const columnTasks = getTasksByStatus(column.status);

          return (
            <Box
              key={column.status}
              flexDirection="column"
              width="14%"
              marginRight={columnIndex < COLUMNS.length - 1 ? 1 : 0}
              borderStyle="round"
              borderColor={column.color}
            >
              {/* Column header */}
              <Box paddingX={1} paddingBottom={1}>
                <Text bold color={column.color}>
                  {column.label}
                </Text>
                <Text dimColor> ({columnTasks.length})</Text>
              </Box>

              {/* Tasks in column */}
              <Box flexDirection="column" paddingX={1}>
                {columnTasks.length === 0 ? (
                  <Text dimColor>—</Text>
                ) : (
                  columnTasks.map((task) => {
                    const isSelected = selectedTask?.id === task.id;

                    return (
                      <Box
                        key={task.id}
                        flexDirection="column"
                        marginBottom={1}
                        paddingX={1}
                        paddingY={1}
                        borderStyle={isSelected ? 'bold' : 'round'}
                        borderColor={isSelected ? 'cyan' : 'gray'}
                      >
                        <Box>
                          <Text>{getPriorityIcon(task.priority)} </Text>
                          <Text
                            color={isSelected ? 'cyan' : 'white'}
                            bold={isSelected}
                            wrap="truncate"
                          >
                            {task.title.slice(0, 20)}
                          </Text>
                        </Box>

                        {task.assignedTo && (
                          <Text dimColor>
                            @{task.assignedTo}
                          </Text>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Selected task details */}
      {selectedTask && (
        <Box
          flexDirection="column"
          paddingX={1}
          marginTop={1}
          borderStyle="single"
          borderColor="cyan"
        >
          <Text bold color="cyan">
            Selected Task
          </Text>
          <Box marginTop={1}>
            <Text>
              {getPriorityIcon(selectedTask.priority)} {selectedTask.title}
            </Text>
          </Box>
          {selectedTask.description && (
            <Box marginTop={1}>
              <Text dimColor>{selectedTask.description}</Text>
            </Box>
          )}
          {selectedTask.assignedTo && (
            <Box marginTop={1}>
              <Text dimColor>Assigned to: </Text>
              <Text>{selectedTask.assignedTo}</Text>
            </Box>
          )}
          {selectedTask.dependencies && selectedTask.dependencies.length > 0 && (
            <Box marginTop={1}>
              <Text dimColor>Depends on: </Text>
              <Text>{selectedTask.dependencies.join(', ')}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
