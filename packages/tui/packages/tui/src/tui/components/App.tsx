// ─── App Component ──────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { useDaemon } from '../hooks/useDaemon.js';
import { useAgents } from '../hooks/useAgents.js';
import { useTasks } from '../hooks/useTasks.js';
import { usePipelines } from '../hooks/usePipelines.js';
import { AgentList } from './AgentList.js';
import { TaskBoard } from './TaskBoard.js';
import { PipelineView } from './PipelineView.js';
import { SettingsPanel } from './SettingsPanel.js';
import { StatusBar } from './StatusBar.js';
import { PreviewHint } from './PreviewHint.js';
import { previewAgent, attachToAgent } from '../util/preview.js';
import { getPreviewPaneId } from '../util/tmuxLayout.js';
import {
  openSendPromptPopup,
  openSpawnAgentPopup,
  openSubmitTaskPopup,
} from '../util/keybindings.js';
import type { TabView } from '../types.js';

interface AppProps {
  socketPath?: string;
  httpUrl?: string;
}

/**
 * Main TUI application component
 */
export function App({ socketPath, httpUrl }: AppProps) {
  const { exit } = useApp();
  const [currentTab, setCurrentTab] = useState<TabView>('agents');
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [selectedPipelineIndex, setSelectedPipelineIndex] = useState(0);
  const [previewingAgent, setPreviewingAgent] = useState<string | undefined>();

  // Daemon connection
  const { client, connected, error: daemonError } = useDaemon(socketPath, httpUrl);

  // Data hooks
  const { agents, loading: loadingAgents, error: agentsError, refresh: refreshAgents } = useAgents(client);
  const { tasks, loading: loadingTasks, error: tasksError, refresh: refreshTasks } = useTasks(client);
  const {
    pipelines,
    loading: loadingPipelines,
    error: pipelinesError,
    refresh: refreshPipelines,
  } = usePipelines(client);

  // Reset selected index when switching tabs
  useEffect(() => {
    setSelectedAgentIndex(0);
    setSelectedTaskIndex(0);
    setSelectedPipelineIndex(0);
  }, [currentTab]);

  // Keyboard input handling
  useInput((input, key) => {
    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Tab switching (F1-F12 keys are passed as strings in key.meta)
    if (input === '' && key.meta && key.shift === false) {
      // Check for function keys via escape sequences
      return;
    }
    // Fallback: use number keys 1-4 for tabs
    if (input === '1') {
      setCurrentTab('agents');
      return;
    }
    if (input === '2') {
      setCurrentTab('tasks');
      return;
    }
    if (input === '3') {
      setCurrentTab('pipelines');
      return;
    }
    if (input === '4') {
      setCurrentTab('settings');
      return;
    }

    // Navigation based on current tab
    if (currentTab === 'agents') {
      handleAgentInput(input, key);
    } else if (currentTab === 'tasks') {
      handleTaskInput(input, key);
    } else if (currentTab === 'pipelines') {
      handlePipelineInput(input, key);
    }
    // Settings tab handles its own input
  });

  const handleAgentInput = (input: string, key: any) => {
    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedAgentIndex((prev) => Math.min(prev + 1, agents.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelectedAgentIndex((prev) => Math.max(prev - 1, 0));
    }
    // Preview agent
    else if (key.return) {
      const agent = agents[selectedAgentIndex];
      if (agent) {
        const paneId = getPreviewPaneId();
        if (paneId) {
          previewAgent(agent, paneId);
          setPreviewingAgent(agent.id);
        }
      }
    }
    // Attach to agent
    else if (input === 'a') {
      const agent = agents[selectedAgentIndex];
      if (agent) {
        const paneId = getPreviewPaneId();
        if (paneId) {
          attachToAgent(agent, paneId);
          setPreviewingAgent(agent.id);
        }
      }
    }
    // Send prompt
    else if (input === 's') {
      const agent = agents[selectedAgentIndex];
      if (agent) {
        openSendPromptPopup(agent.id);
      }
    }
    // Spawn new agent
    else if (input === 'n') {
      openSpawnAgentPopup();
    }
    // Refresh
    else if (input === 'r') {
      refreshAgents();
    }
  };

  const handleTaskInput = (input: string, key: any) => {
    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedTaskIndex((prev) => Math.min(prev + 1, tasks.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelectedTaskIndex((prev) => Math.max(prev - 1, 0));
    }
    // Create new task
    else if (input === 't' || input === 'n') {
      openSubmitTaskPopup();
    }
    // Refresh
    else if (input === 'r') {
      refreshTasks();
    }
  };

  const handlePipelineInput = (input: string, key: any) => {
    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedPipelineIndex((prev) => Math.min(prev + 1, pipelines.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setSelectedPipelineIndex((prev) => Math.max(prev - 1, 0));
    }
    // Refresh
    else if (input === 'r') {
      refreshPipelines();
    }
  };

  // Error display
  if (daemonError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Failed to connect to daemon
        </Text>
        <Text color="red">{daemonError.message}</Text>
        <Box marginTop={1}>
          <Text dimColor>
            Make sure the daemon is running: tmux-agents daemon start
          </Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (!connected) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>Connecting to daemon...</Text>
      </Box>
    );
  }

  // Get the currently previewing agent info
  const previewedAgent = agents.find((a) => a.id === previewingAgent);

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box paddingX={1} paddingY={1} borderStyle="bold" borderColor="cyan">
        <Text bold color="cyan">
          ⚡ tmux-agents TUI
        </Text>
        <Text dimColor> │ </Text>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? '● Connected' : '○ Disconnected'}
        </Text>
      </Box>

      {/* Preview hint */}
      {previewedAgent && (
        <PreviewHint previewingAgent={previewedAgent.id} agentRole={previewedAgent.role} />
      )}

      {/* Main content area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {currentTab === 'agents' && (
          <AgentList
            agents={agents}
            selectedIndex={selectedAgentIndex}
            loading={loadingAgents}
          />
        )}

        {currentTab === 'tasks' && (
          <TaskBoard tasks={tasks} selectedIndex={selectedTaskIndex} loading={loadingTasks} />
        )}

        {currentTab === 'pipelines' && (
          <PipelineView
            pipelines={pipelines}
            selectedIndex={selectedPipelineIndex}
            loading={loadingPipelines}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsPanel
            onSave={() => {
              // Could trigger a refresh or show a notification
            }}
            onCancel={() => {
              // Return to agents tab
              setCurrentTab('agents');
            }}
          />
        )}

        {/* Error messages */}
        {(agentsError || tasksError || pipelinesError) && (
          <Box marginTop={1} paddingX={1} borderStyle="round" borderColor="red">
            <Text color="red">
              Error: {(agentsError || tasksError || pipelinesError)?.message}
            </Text>
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <StatusBar agents={agents} currentTab={currentTab} />
    </Box>
  );
}
