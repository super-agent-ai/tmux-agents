// ─── Pipeline View Component ────────────────────────────────────────────────

import { Box, Text } from 'ink';
import type { PipelineInfo, PipelineStage } from '../types.js';

interface PipelineViewProps {
  pipelines: PipelineInfo[];
  selectedIndex: number;
  loading?: boolean;
}

/**
 * Displays active pipelines with stage progress
 */
export function PipelineView({ pipelines, selectedIndex, loading = false }: PipelineViewProps) {
  const getStatusIcon = (status: PipelineStage['status']): string => {
    switch (status) {
      case 'pending':
        return '○';
      case 'running':
        return '◉';
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'skipped':
        return '⊘';
      default:
        return '?';
    }
  };

  const getStatusColor = (status: PipelineStage['status']): string => {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'running':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'skipped':
        return 'gray';
      default:
        return 'white';
    }
  };

  const getPipelineStatusColor = (status: PipelineInfo['status']): string => {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'running':
        return 'yellow';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'white';
    }
  };

  const renderProgressBar = (progress: number, width = 20): string => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Loading pipelines...</Text>
      </Box>
    );
  }

  if (pipelines.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No pipelines running</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text bold>Pipelines ({pipelines.length})</Text>
      </Box>

      {/* Pipeline list */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {pipelines.map((pipeline, index) => {
          const isSelected = index === selectedIndex;
          const statusColor = getPipelineStatusColor(pipeline.status);

          return (
            <Box
              key={pipeline.id}
              flexDirection="column"
              marginBottom={index < pipelines.length - 1 ? 2 : 0}
              borderStyle={isSelected ? 'bold' : 'round'}
              borderColor={isSelected ? 'cyan' : 'gray'}
              paddingX={1}
              paddingY={1}
            >
              {/* Pipeline header */}
              <Box>
                <Text color={isSelected ? 'cyan' : 'white'} bold>
                  {pipeline.name}
                </Text>
                <Text dimColor> │ </Text>
                <Text color={statusColor}>{pipeline.status}</Text>
                <Text dimColor> │ </Text>
                <Text>{Math.round(pipeline.progress)}%</Text>
              </Box>

              {/* Progress bar */}
              <Box marginTop={1}>
                <Text color="cyan">{renderProgressBar(pipeline.progress)}</Text>
              </Box>

              {/* Stages */}
              <Box flexDirection="column" marginTop={1}>
                {pipeline.stages.map((stage, stageIndex) => {
                  const stageColor = getStatusColor(stage.status);

                  return (
                    <Box key={stageIndex} marginTop={stageIndex > 0 ? 1 : 0}>
                      {/* Stage connector */}
                      {stageIndex > 0 && (
                        <Box marginLeft={2}>
                          <Text dimColor>│</Text>
                        </Box>
                      )}

                      {/* Stage info */}
                      <Box marginLeft={2}>
                        <Text color={stageColor}>{getStatusIcon(stage.status)} </Text>
                        <Text color={stageColor}>{stage.name}</Text>
                        <Text dimColor> ({stage.tasks.length} tasks)</Text>

                        {stage.status === 'running' && (
                          <>
                            <Text dimColor> │ </Text>
                            <Text>{Math.round(stage.progress)}%</Text>
                          </>
                        )}
                      </Box>

                      {/* Stage progress bar if running */}
                      {stage.status === 'running' && (
                        <Box marginLeft={4} marginTop={0}>
                          <Text color="yellow">{renderProgressBar(stage.progress, 15)}</Text>
                        </Box>
                      )}

                      {/* Task list if selected */}
                      {isSelected && stage.tasks.length > 0 && (
                        <Box flexDirection="column" marginLeft={4} marginTop={1}>
                          {stage.tasks.slice(0, 3).map((taskId, taskIndex) => (
                            <Text key={taskIndex} dimColor>
                              • {taskId.slice(0, 12)}...
                            </Text>
                          ))}
                          {stage.tasks.length > 3 && (
                            <Text dimColor>
                              ...and {stage.tasks.length - 3} more
                            </Text>
                          )}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
