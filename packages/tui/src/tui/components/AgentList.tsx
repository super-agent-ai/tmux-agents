// ─── Agent List Component ───────────────────────────────────────────────────

import { Box, Text } from 'ink';
import type { AgentInfo } from '../types.js';

interface AgentListProps {
  agents: AgentInfo[];
  selectedIndex: number;
  loading?: boolean;
}

/**
 * Displays a list of agents with status indicators
 */
export function AgentList({ agents, selectedIndex, loading = false }: AgentListProps) {
  const getStatusIcon = (status: AgentInfo['status']): string => {
    switch (status) {
      case 'idle':
        return '●';
      case 'busy':
        return '◉';
      case 'building':
        return '⚙';
      case 'testing':
        return '✓';
      case 'error':
        return '✗';
      case 'stopped':
        return '○';
      default:
        return '?';
    }
  };

  const getStatusColor = (status: AgentInfo['status']): string => {
    switch (status) {
      case 'idle':
        return 'green';
      case 'busy':
        return 'yellow';
      case 'building':
        return 'blue';
      case 'testing':
        return 'cyan';
      case 'error':
        return 'red';
      case 'stopped':
        return 'gray';
      default:
        return 'white';
    }
  };

  const getRuntimeBadge = (runtime: AgentInfo['runtime']): string => {
    switch (runtime) {
      case 'tmux':
        return '[T]';
      case 'docker':
        return '[D]';
      case 'k8s':
        return '[K]';
      default:
        return '[?]';
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading agents...</Text>
      </Box>
    );
  }

  if (agents.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No agents running</Text>
        <Text dimColor>Press 'n' to spawn a new agent</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold>Agents ({agents.length})</Text>
      </Box>

      {/* Agent list */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {agents.map((agent, index) => {
          const isSelected = index === selectedIndex;
          const statusColor = getStatusColor(agent.status);

          return (
            <Box key={agent.id} marginBottom={index < agents.length - 1 ? 1 : 0}>
              {/* Selection indicator */}
              <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}</Text>

              {/* Status icon */}
              <Text color={statusColor}>{getStatusIcon(agent.status)} </Text>

              {/* Agent info */}
              <Box flexDirection="column" flexGrow={1}>
                <Box>
                  <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                    {agent.role}
                  </Text>
                  <Text dimColor> │ </Text>
                  <Text color="gray">{getRuntimeBadge(agent.runtime)}</Text>
                  <Text dimColor> │ </Text>
                  <Text color="gray" dimColor>
                    {agent.id.slice(0, 8)}
                  </Text>
                </Box>

                {agent.task && (
                  <Box marginLeft={2}>
                    <Text dimColor>Task: </Text>
                    <Text color="yellow">{agent.task}</Text>
                  </Box>
                )}

                {agent.lastActivity && (
                  <Box marginLeft={2}>
                    <Text dimColor>
                      Last activity: {formatTimestamp(agent.lastActivity)}
                    </Text>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return `${seconds}s ago`;
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else {
    return `${hours}h ago`;
  }
}
