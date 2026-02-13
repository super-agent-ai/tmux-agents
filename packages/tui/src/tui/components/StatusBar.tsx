// ─── Status Bar Component ───────────────────────────────────────────────────

import { Box, Text } from 'ink';
import type { AgentInfo, TabView } from '../types.js';

interface StatusBarProps {
  agents: AgentInfo[];
  currentTab: TabView;
}

/**
 * Bottom status bar showing agent counts and keyboard hints
 */
export function StatusBar({ agents, currentTab }: StatusBarProps) {
  // Count agents by status
  const idleCount = agents.filter((a) => a.status === 'idle').length;
  const busyCount = agents.filter((a) => a.status === 'busy').length;
  const buildingCount = agents.filter((a) => a.status === 'building').length;
  const errorCount = agents.filter((a) => a.status === 'error').length;

  // Tab indicators
  const tabIndicator = (tab: TabView, label: string, key: string) => {
    const active = currentTab === tab;
    return (
      <Text
        key={tab}
        color={active ? 'cyan' : 'gray'}
        bold={active}
      >
        {key} {label}
        {' │ '}
      </Text>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      {/* Agent counts */}
      <Box>
        <Text dimColor>Agents: </Text>
        <Text color="green">{idleCount} idle</Text>
        <Text dimColor> │ </Text>
        <Text color="yellow">{busyCount} busy</Text>
        <Text dimColor> │ </Text>
        <Text color="blue">{buildingCount} building</Text>
        <Text dimColor> │ </Text>
        <Text color="red">{errorCount} error</Text>
      </Box>

      {/* Tabs and shortcuts */}
      <Box marginTop={1}>
        {tabIndicator('agents', 'Agents', 'F1')}
        {tabIndicator('tasks', 'Tasks', 'F2')}
        {tabIndicator('pipelines', 'Pipelines', 'F3')}
        <Text dimColor>
          Enter: Preview │ a: Attach │ s: Send │ n: New Agent │ t: New Task │ r: Refresh │ q:
          Quit
        </Text>
      </Box>
    </Box>
  );
}
