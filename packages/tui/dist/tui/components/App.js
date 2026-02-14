import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { openSendPromptPopup, openSpawnAgentPopup, openSubmitTaskPopup, } from '../util/keybindings.js';
/**
 * Main TUI application component
 */
export function App({ socketPath, httpUrl }) {
    const { exit } = useApp();
    const [currentTab, setCurrentTab] = useState('agents');
    const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
    const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
    const [selectedPipelineIndex, setSelectedPipelineIndex] = useState(0);
    const [previewingAgent, setPreviewingAgent] = useState();
    // Daemon connection
    const { client, connected, error: daemonError } = useDaemon(socketPath, httpUrl);
    // Data hooks
    const { agents, loading: loadingAgents, error: agentsError, refresh: refreshAgents } = useAgents(client);
    const { tasks, loading: loadingTasks, error: tasksError, refresh: refreshTasks } = useTasks(client);
    const { pipelines, loading: loadingPipelines, error: pipelinesError, refresh: refreshPipelines, } = usePipelines(client);
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
        }
        else if (currentTab === 'tasks') {
            handleTaskInput(input, key);
        }
        else if (currentTab === 'pipelines') {
            handlePipelineInput(input, key);
        }
        // Settings tab handles its own input
    });
    const handleAgentInput = (input, key) => {
        // Navigation
        if (input === 'j' || key.downArrow) {
            setSelectedAgentIndex((prev) => Math.min(prev + 1, agents.length - 1));
        }
        else if (input === 'k' || key.upArrow) {
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
    const handleTaskInput = (input, key) => {
        // Navigation
        if (input === 'j' || key.downArrow) {
            setSelectedTaskIndex((prev) => Math.min(prev + 1, tasks.length - 1));
        }
        else if (input === 'k' || key.upArrow) {
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
    const handlePipelineInput = (input, key) => {
        // Navigation
        if (input === 'j' || key.downArrow) {
            setSelectedPipelineIndex((prev) => Math.min(prev + 1, pipelines.length - 1));
        }
        else if (input === 'k' || key.upArrow) {
            setSelectedPipelineIndex((prev) => Math.max(prev - 1, 0));
        }
        // Refresh
        else if (input === 'r') {
            refreshPipelines();
        }
    };
    // Error display
    if (daemonError) {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Text, { color: "red", bold: true, children: "Failed to connect to daemon" }), _jsx(Text, { color: "red", children: daemonError.message }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Make sure the daemon is running: tmux-agents daemon start" }) })] }));
    }
    // Loading state
    if (!connected) {
        return (_jsx(Box, { flexDirection: "column", padding: 1, children: _jsx(Text, { dimColor: true, children: "Connecting to daemon..." }) }));
    }
    // Get the currently previewing agent info
    const previewedAgent = agents.find((a) => a.id === previewingAgent);
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsxs(Box, { paddingX: 1, paddingY: 1, borderStyle: "bold", borderColor: "cyan", children: [_jsx(Text, { bold: true, color: "cyan", children: "\u26A1 tmux-agents TUI" }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { color: connected ? 'green' : 'red', children: connected ? '● Connected' : '○ Disconnected' })] }), previewedAgent && (_jsx(PreviewHint, { previewingAgent: previewedAgent.id, agentRole: previewedAgent.role })), _jsxs(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, children: [currentTab === 'agents' && (_jsx(AgentList, { agents: agents, selectedIndex: selectedAgentIndex, loading: loadingAgents })), currentTab === 'tasks' && (_jsx(TaskBoard, { tasks: tasks, selectedIndex: selectedTaskIndex, loading: loadingTasks })), currentTab === 'pipelines' && (_jsx(PipelineView, { pipelines: pipelines, selectedIndex: selectedPipelineIndex, loading: loadingPipelines })), currentTab === 'settings' && (_jsx(SettingsPanel, { onSave: () => {
                            // Could trigger a refresh or show a notification
                        }, onCancel: () => {
                            // Return to agents tab
                            setCurrentTab('agents');
                        } })), (agentsError || tasksError || pipelinesError) && (_jsx(Box, { marginTop: 1, paddingX: 1, borderStyle: "round", borderColor: "red", children: _jsxs(Text, { color: "red", children: ["Error: ", (agentsError || tasksError || pipelinesError)?.message] }) }))] }), _jsx(StatusBar, { agents: agents, currentTab: currentTab })] }));
}
//# sourceMappingURL=App.js.map