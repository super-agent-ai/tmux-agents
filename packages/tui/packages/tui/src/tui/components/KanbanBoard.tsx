// ─── Kanban Board Component ────────────────────────────────────────────────
// Four-level view:
//   Level 1 = Swimlane List
//   Level 2 = Task Board (5-column per lane)
//   Level 3 = Task Detail (full field editor)
//   Level 4 = Swimlane Settings (full field editor)

import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import * as os from 'os';
import { useSwimLanes } from '../hooks/useSwimLanes.js';
import { useTasks } from '../hooks/useTasks.js';
import { attachToAgent, attachToSession, createTerminalSession, createDebugSession, createAiChatSession } from '../util/preview.js';
import { getPreviewPaneId } from '../util/tmuxLayout.js';
import type { IDaemonClient, SwimLaneInfo, TaskInfo, RoleInfo } from '../types.js';

/** Shorten home directory to ~ */
function shortPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

/** Group tasks into buckets by swimlane ID. Returns an entry per lane plus an optional 'Unassigned' bucket. */
export function groupTasksByLane(
  tasks: TaskInfo[],
  lanes: SwimLaneInfo[]
): { laneId: string; laneName: string; tasks: TaskInfo[] }[] {
  const laneIds = new Set(lanes.map(l => l.id));
  const groups = new Map<string, TaskInfo[]>();
  for (const lane of lanes) groups.set(lane.id, []);
  const unassigned: TaskInfo[] = [];
  for (const task of tasks) {
    if (task.swimLaneId && laneIds.has(task.swimLaneId)) {
      groups.get(task.swimLaneId)!.push(task);
    } else {
      unassigned.push(task);
    }
  }
  const result = lanes.map(l => ({ laneId: l.id, laneName: l.name, tasks: groups.get(l.id) || [] }));
  if (unassigned.length > 0) {
    result.push({ laneId: '__unassigned__', laneName: 'Unassigned', tasks: unassigned });
  }
  return result;
}

interface KanbanBoardProps {
  client: IDaemonClient | null;
}

type InputMode =
  | { type: 'none' }
  | { type: 'create-lane-name' }
  | { type: 'create-lane-dir'; name: string }
  | { type: 'edit-lane-name'; lane: SwimLaneInfo }
  | { type: 'create-task'; column: string }
  | { type: 'edit-task'; task: TaskInfo }
  | { type: 'confirm-delete-lane'; lane: SwimLaneInfo }
  | { type: 'confirm-delete-task'; task: TaskInfo }
  | { type: 'detail-edit'; fieldKey: string }
  | { type: 'lane-detail-edit'; fieldKey: string }
  | { type: 'ai-generate' }
  | { type: 'ai-generate-detail'; taskId: string };

type AiStatus =
  | { type: 'idle' }
  | { type: 'generating'; startTime: number }
  | { type: 'done'; message: string; timestamp: number }
  | { type: 'error'; message: string; timestamp: number };

const COLUMNS: { key: TaskInfo['status']; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: 'white' },
  { key: 'todo', label: 'To Do', color: 'blue' },
  { key: 'in_progress', label: 'In Progress', color: 'yellow' },
  { key: 'in_review', label: 'In Review', color: 'cyan' },
  { key: 'done', label: 'Done', color: 'green' },
];

/** Filter tasks by Kanban column status (groups blocked with in_progress, failed with done) */
function filterByColumn(taskList: TaskInfo[], status: TaskInfo['status']): TaskInfo[] {
  if (status === 'in_progress') return taskList.filter(t => t.status === 'in_progress' || t.status === 'blocked');
  if (status === 'done') return taskList.filter(t => t.status === 'done' || t.status === 'failed');
  return taskList.filter(t => t.status === status);
}

// ─── Task Detail Field Definitions ──────────────────────────────────────────

type FieldType = 'text' | 'cycle' | 'toggle' | 'readonly';

interface DetailField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  rawKey?: string; // daemon field name if different from key
}

const DEFAULT_ROLES = ['', 'coder', 'reviewer', 'tester', 'devops', 'researcher'];
const PROVIDERS = ['', 'claude', 'gemini', 'codex', 'opencode', 'cursor', 'copilot', 'aider', 'amp', 'cline', 'kiro'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const KANBAN_COLS = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

// Fields rendered one-per-line (targetRole options are overridden at runtime with dynamic roles)
function buildDetailFieldsMain(roles: string[]): DetailField[] {
  return [
    { key: 'title', label: 'Title', type: 'text', rawKey: 'description' },
    { key: 'input', label: 'Description', type: 'text' },
    { key: 'priority', label: 'Priority', type: 'cycle', options: PRIORITIES },
    { key: 'column', label: 'Column', type: 'cycle', options: KANBAN_COLS, rawKey: 'kanbanColumn' },
    { key: 'targetRole', label: 'Target Role', type: 'cycle', options: roles },
    { key: 'aiProvider', label: 'AI Provider', type: 'cycle', options: PROVIDERS },
    { key: 'aiModel', label: 'AI Model', type: 'text' },
    { key: 'workingDirectoryOverride', label: 'Work Dir', type: 'text' },
  ];
}

// Toggle fields rendered inline on one row (or wrapped)
const DETAIL_TOGGLE_FIELDS: DetailField[] = [
  { key: 'autoStart', label: 'Start', type: 'toggle' },
  { key: 'autoPilot', label: 'Pilot', type: 'toggle' },
  { key: 'autoClose', label: 'Close', type: 'toggle' },
  { key: 'useWorktree', label: 'Worktree', type: 'toggle' },
];

// Readonly fields at the bottom
const DETAIL_FIELDS_TAIL: DetailField[] = [
  { key: 'assignedTo', label: 'Assigned To', type: 'readonly' },
  { key: 'id', label: 'Task ID', type: 'readonly' },
];

// Note: DETAIL_FIELDS, TOGGLE_START_IDX, TOGGLE_END_IDX are computed inside
// the component to support dynamic roles fetched from the daemon.

// ─── Swimlane Settings Field Definitions ─────────────────────────────────────

const SERVERS = ['', 'local'];

const LANE_FIELDS_MAIN: DetailField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'serverId', label: 'Server', type: 'cycle', options: SERVERS },
  { key: 'sessionName', label: 'Session', type: 'text' },
  { key: 'workingDirectory', label: 'Work Dir', type: 'text' },
  { key: 'aiProvider', label: 'AI Provider', type: 'cycle', options: PROVIDERS },
  { key: 'aiModel', label: 'AI Model', type: 'text' },
  { key: 'contextInstructions', label: 'Context', type: 'text' },
];

const LANE_TOGGLE_FIELDS: DetailField[] = [
  { key: 'defaultAutoStart', label: 'Start', type: 'toggle', rawKey: 'defaultToggles.autoStart' },
  { key: 'defaultAutoPilot', label: 'Pilot', type: 'toggle', rawKey: 'defaultToggles.autoPilot' },
  { key: 'defaultAutoClose', label: 'Close', type: 'toggle', rawKey: 'defaultToggles.autoClose' },
  { key: 'defaultUseWorktree', label: 'Worktree', type: 'toggle', rawKey: 'defaultToggles.useWorktree' },
  { key: 'defaultUseMemory', label: 'Memory', type: 'toggle', rawKey: 'defaultToggles.useMemory' },
];

const LANE_FIELDS_TAIL: DetailField[] = [
  { key: 'memoryPath', label: 'Memory Path', type: 'text' },
  { key: 'sessionActive', label: 'Session Active', type: 'readonly' },
  { key: 'id', label: 'Lane ID', type: 'readonly' },
];

const LANE_FIELDS: DetailField[] = [...LANE_FIELDS_MAIN, ...LANE_TOGGLE_FIELDS, ...LANE_FIELDS_TAIL];
const LANE_TOGGLE_START = LANE_FIELDS_MAIN.length;
const LANE_TOGGLE_END = LANE_TOGGLE_START + LANE_TOGGLE_FIELDS.length - 1;

function getLaneFieldValue(lane: SwimLaneInfo, field: DetailField): string {
  const val = (lane as any)[field.key];
  if (field.type === 'toggle') return val ? 'on' : 'off';
  if (field.key === 'sessionActive') return val ? 'Active' : 'Inactive';
  if (val === undefined || val === null || val === '') return '';
  return String(val);
}

function formatLaneFieldDisplay(lane: SwimLaneInfo, field: DetailField): string {
  const val = getLaneFieldValue(lane, field);
  if (field.type === 'toggle') return val === 'on' ? '[x]' : '[ ]';
  if (field.type === 'cycle') {
    if (!val) return '(none)';
    return val;
  }
  if (field.key === 'sessionActive') return val || 'Inactive';
  return val || '(empty)';
}

function priorityToNumber(p: string): number {
  switch (p) {
    case 'low': return 2;
    case 'medium': return 5;
    case 'high': return 8;
    case 'urgent': return 10;
    default: return 5;
  }
}

function getFieldValue(task: TaskInfo, field: DetailField): string {
  const val = (task as any)[field.key];
  if (field.key === 'column') return task.status;
  if (field.type === 'toggle') return val ? 'on' : 'off';
  if (val === undefined || val === null || val === '') return '';
  return String(val);
}

function formatFieldDisplay(task: TaskInfo, field: DetailField): string {
  const val = getFieldValue(task, field);
  if (field.type === 'toggle') return val === 'on' ? '[x]' : '[ ]';
  if (field.type === 'cycle') {
    if (!val) return '(none)';
    return val;
  }
  return val || '(empty)';
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function KanbanBoard({ client }: KanbanBoardProps) {
  const { exit } = useApp();

  // Data hooks
  const {
    lanes, loading: lanesLoading, refresh: refreshLanes,
    createLane, editLane, deleteLane, saveLaneField,
  } = useSwimLanes(client);
  const {
    tasks, loading: _tasksLoading, refresh: refreshTasks,
    getTasksByLane, createTask, updateTask, deleteTask, moveTask, saveTaskField,
    aiGenerateAndCreate, aiGenerateAndUpdate, aiChat,
  } = useTasks(client);

  // Navigation state
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(1);
  const [selectedLaneIndex, setSelectedLaneIndex] = useState(0);
  const [selectedColIndex, setSelectedColIndex] = useState(0);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailFieldIndex, setDetailFieldIndex] = useState(0);
  const [laneFieldIndex, setLaneFieldIndex] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>({ type: 'none' });
  const [inputValue, setInputValue] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus>({ type: 'idle' });
  const [aiElapsed, setAiElapsed] = useState(0);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const [dynamicRoles, setDynamicRoles] = useState<string[]>(DEFAULT_ROLES);

  // Fetch available roles from daemon
  useEffect(() => {
    if (!client) return;
    client.call('role.list', {}).then((roles: RoleInfo[]) => {
      if (Array.isArray(roles) && roles.length > 0) {
        const names = ['', ...roles.map((r: RoleInfo) => r.name)];
        setDynamicRoles(names);
      }
    }).catch(() => { /* use defaults */ });
  }, [client]);

  // Build field arrays with dynamic roles
  const DETAIL_FIELDS_MAIN = buildDetailFieldsMain(dynamicRoles);
  const DETAIL_FIELDS: DetailField[] = [...DETAIL_FIELDS_MAIN, ...DETAIL_TOGGLE_FIELDS, ...DETAIL_FIELDS_TAIL];
  const TOGGLE_START_IDX = DETAIL_FIELDS_MAIN.length;
  const TOGGLE_END_IDX = TOGGLE_START_IDX + DETAIL_TOGGLE_FIELDS.length - 1;

  // Elapsed time timer during AI generation
  useEffect(() => {
    if (aiStatus.type !== 'generating') {
      setAiElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setAiElapsed(Math.floor((Date.now() - aiStatus.startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [aiStatus]);

  // Auto-dismiss done/error after 5 seconds
  useEffect(() => {
    if (aiStatus.type !== 'done' && aiStatus.type !== 'error') return;
    const id = setTimeout(() => setAiStatus({ type: 'idle' }), 5000);
    return () => clearTimeout(id);
  }, [aiStatus]);

  // Listen for ai.generate.completed events from daemon
  useEffect(() => {
    if (!client) return;
    const unsub = client.subscribe((event: string, data: any) => {
      if (event === 'ai.generate.completed') {
        if (data?.success) {
          setAiStatus({ type: 'done', message: 'AI task generation complete', timestamp: Date.now() });
          refreshTasks();
        } else {
          const msg = (data?.error || 'AI generation failed').replace(/^RPC Error:\s*/i, '');
          setAiStatus({ type: 'error', message: msg, timestamp: Date.now() });
        }
      }
    });
    return unsub;
  }, [client, refreshTasks]);

  // Current lane
  const currentLane = lanes[selectedLaneIndex];

  // Unassigned tasks and navigation bounds for swimlane sections
  const unassignedTasks = tasks.filter(t => !t.swimLaneId || !lanes.some(l => l.id === t.swimLaneId));
  const hasUnassigned = unassignedTasks.length > 0;
  const totalEntries = lanes.length + (hasUnassigned ? 1 : 0);
  const isOnUnassigned = hasUnassigned && selectedLaneIndex >= lanes.length;

  // Lane tasks (supports both named lanes and Unassigned view)
  const laneTasks = isOnUnassigned ? unassignedTasks : (currentLane ? getTasksByLane(currentLane.id) : []);

  // Clamp selectedLaneIndex when totalEntries changes
  useEffect(() => {
    if (totalEntries > 0 && selectedLaneIndex >= totalEntries) {
      setSelectedLaneIndex(totalEntries - 1);
    }
  }, [totalEntries]);

  // Group tasks into columns
  const getColumnTasks = useCallback((status: TaskInfo['status']): TaskInfo[] => {
    if (status === 'in_progress') {
      return laneTasks.filter((t) => t.status === 'in_progress' || t.status === 'blocked');
    }
    if (status === 'done') {
      return laneTasks.filter((t) => t.status === 'done' || t.status === 'failed');
    }
    return laneTasks.filter((t) => t.status === status);
  }, [laneTasks]);

  // Get selected task in Level 2
  const currentColTasks = COLUMNS[selectedColIndex] ? getColumnTasks(COLUMNS[selectedColIndex].key) : [];
  const selectedTask = currentColTasks[selectedRowIndex];

  // Get detail task for Level 3
  const detailTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : null;
  const currentField = DETAIL_FIELDS[detailFieldIndex];

  // ─── Detail Save Helpers ───────────────────────────────────────────────────

  const saveField = useCallback(async (task: TaskInfo, field: DetailField, value: any) => {
    const rawKey = field.rawKey || field.key;
    let saveValue = value;
    // Convert priority string back to number for daemon
    if (rawKey === 'priority' || field.key === 'priority') {
      saveValue = priorityToNumber(value);
    }
    await saveTaskField(task.id, rawKey, saveValue);
  }, [saveTaskField]);

  const cycleFieldValue = useCallback(async (task: TaskInfo, field: DetailField, direction: 1 | -1) => {
    if (!field.options) return;
    const current = getFieldValue(task, field);
    const idx = field.options.indexOf(current);
    const next = (idx + direction + field.options.length) % field.options.length;
    await saveField(task, field, field.options[next]);
  }, [saveField]);

  const toggleFieldValue = useCallback(async (task: TaskInfo, field: DetailField) => {
    const current = (task as any)[field.key];
    await saveField(task, field, !current);
  }, [saveField]);

  // Current lane field for Level 4
  const currentLaneField = LANE_FIELDS[laneFieldIndex];

  // ─── Lane Field Save Helpers ────────────────────────────────────────────────

  const saveLaneFieldValue = useCallback(async (lane: SwimLaneInfo, field: DetailField, value: any) => {
    const rawKey = field.rawKey || field.key;
    await saveLaneField(lane.id, rawKey, value);
  }, [saveLaneField]);

  const cycleLaneFieldValue = useCallback(async (lane: SwimLaneInfo, field: DetailField, direction: 1 | -1) => {
    if (!field.options) return;
    const current = getLaneFieldValue(lane, field);
    const idx = field.options.indexOf(current);
    const next = (idx + direction + field.options.length) % field.options.length;
    await saveLaneFieldValue(lane, field, field.options[next]);
  }, [saveLaneFieldValue]);

  const toggleLaneFieldValue = useCallback(async (lane: SwimLaneInfo, field: DetailField) => {
    const current = (lane as any)[field.key];
    await saveLaneFieldValue(lane, field, !current);
  }, [saveLaneFieldValue]);

  // ─── Attach Helper ──────────────────────────────────────────────────────────

  const doAttach = useCallback((agentId: string) => {
    const paneId = getPreviewPaneId();
    if (paneId) {
      attachToAgent({ id: agentId } as any, paneId);
    }
  }, []);

  const doAttachSession = useCallback((sessionName: string) => {
    if (!sessionName) return;
    const paneId = getPreviewPaneId();
    if (paneId) {
      try {
        attachToSession(sessionName, paneId);
      } catch {
        // Session may not exist yet
      }
    }
  }, []);

  const doCreateTerminal = useCallback((lane: SwimLaneInfo) => {
    const paneId = getPreviewPaneId();
    if (!paneId || !lane.workingDirectory) return;
    const name = (lane.sessionName || lane.name || 'lane') + '-term';
    try {
      createTerminalSession(name, lane.workingDirectory, paneId);
    } catch { /* ignore */ }
  }, []);

  const doCreateDebug = useCallback((lane: SwimLaneInfo) => {
    const paneId = getPreviewPaneId();
    if (!paneId || !lane.workingDirectory) return;
    const name = (lane.sessionName || lane.name || 'lane') + '-debug';
    try {
      createDebugSession(name, lane.workingDirectory, lane.aiProvider, paneId);
    } catch { /* ignore */ }
  }, []);

  const doAiChat = useCallback(async (lane: SwimLaneInfo) => {
    const paneId = getPreviewPaneId();
    if (!paneId) return;
    try {
      const result = await aiChat(lane.id);
      if (result?.command) {
        const name = (lane.sessionName || lane.name || 'lane') + '-ai';
        createAiChatSession(name, result.cwd || lane.workingDirectory || '.', result.command, paneId);
      }
    } catch { /* ignore */ }
  }, [aiChat]);

  // ─── Input Handling ────────────────────────────────────────────────────────

  useInput((input, key) => {
    // Handle text input modes — let TextInput handle everything
    if (inputMode.type === 'create-lane-name' || inputMode.type === 'create-lane-dir'
        || inputMode.type === 'edit-lane-name' || inputMode.type === 'create-task'
        || inputMode.type === 'edit-task' || inputMode.type === 'detail-edit'
        || inputMode.type === 'lane-detail-edit' || inputMode.type === 'ai-generate'
        || inputMode.type === 'ai-generate-detail') {
      if (key.escape) {
        setInputMode({ type: 'none' });
        setInputValue('');
      }
      return;
    }

    // Handle confirm-delete
    if (inputMode.type === 'confirm-delete-lane') {
      if (input === 'y' || input === 'Y') {
        deleteLane(inputMode.lane.id).catch(() => {});
        setInputMode({ type: 'none' });
        setSelectedLaneIndex((prev) => Math.max(0, prev - 1));
      } else {
        setInputMode({ type: 'none' });
      }
      return;
    }
    if (inputMode.type === 'confirm-delete-task') {
      if (input === 'y' || input === 'Y') {
        deleteTask(inputMode.task.id).catch(() => {});
        setInputMode({ type: 'none' });
        if (level === 3) {
          setLevel(2);
          setDetailTaskId(null);
        }
        setSelectedRowIndex((prev) => Math.max(0, prev - 1));
      } else {
        setInputMode({ type: 'none' });
      }
      return;
    }

    // ─── Level 1: Swimlane List ──────────────────────────────────────────

    if (level === 1) {
      if (input === 'q' || key.escape) {
        exit();
        setTimeout(() => process.exit(0), 100);
        return;
      } else if (input === 'j' || key.downArrow) {
        setSelectedLaneIndex((prev) => Math.min(prev + 1, totalEntries - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedLaneIndex((prev) => Math.max(prev - 1, 0));
      } else if (key.return && (currentLane || isOnUnassigned)) {
        setLevel(2);
        setSelectedColIndex(0);
        setSelectedRowIndex(0);
      } else if (input === ' ') {
        const laneId = isOnUnassigned ? '__unassigned__' : currentLane?.id;
        if (laneId) {
          setCollapsedLanes(prev => {
            const next = new Set(prev);
            if (next.has(laneId)) next.delete(laneId);
            else next.add(laneId);
            return next;
          });
        }
      } else if (input === 'n') {
        setInputMode({ type: 'create-lane-name' });
        setInputValue('');
      } else if (input === 'e' && currentLane) {
        setInputMode({ type: 'edit-lane-name', lane: currentLane });
        setInputValue(currentLane.name);
      } else if ((input === 'd' || input === 'x') && currentLane) {
        setInputMode({ type: 'confirm-delete-lane', lane: currentLane });
      } else if (input === 's' && currentLane) {
        setLaneFieldIndex(0);
        setLevel(4);
      } else if (input === 'a' && currentLane?.sessionName) {
        doAttachSession(currentLane.sessionName);
      } else if (input === 't' && currentLane) {
        doCreateTerminal(currentLane);
      } else if (input === 'b' && currentLane) {
        doCreateDebug(currentLane);
      } else if (input === 'c' && currentLane) {
        doAiChat(currentLane);
      } else if (input === 'r') {
        refreshLanes();
        refreshTasks();
      }
      return;
    }

    // ─── Level 2: Task Board ─────────────────────────────────────────────

    if (level === 2) {
      if (key.escape || key.backspace || key.delete || input === 'q') {
        setLevel(1);
        return;
      }
      if (input === 'h' || key.leftArrow) {
        setSelectedColIndex((prev) => Math.max(prev - 1, 0));
        setSelectedRowIndex(0);
      } else if (input === 'l' || key.rightArrow) {
        setSelectedColIndex((prev) => Math.min(prev + 1, COLUMNS.length - 1));
        setSelectedRowIndex(0);
      } else if (input === 'j' || key.downArrow) {
        setSelectedRowIndex((prev) => Math.min(prev + 1, currentColTasks.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
      }
      // Enter — open task detail (Level 3)
      else if (key.return && selectedTask) {
        setDetailTaskId(selectedTask.id);
        setDetailFieldIndex(0);
        setLevel(3);
      }
      // Move task left/right
      else if (input === 'H' && selectedTask) {
        const prevCol = selectedColIndex > 0 ? COLUMNS[selectedColIndex - 1] : null;
        if (prevCol) {
          moveTask(selectedTask.id, prevCol.key).catch(() => {});
          setSelectedColIndex((prev) => prev - 1);
          setSelectedRowIndex(0);
        }
      } else if (input === 'L' && selectedTask) {
        const nextCol = selectedColIndex < COLUMNS.length - 1 ? COLUMNS[selectedColIndex + 1] : null;
        if (nextCol) {
          moveTask(selectedTask.id, nextCol.key).catch(() => {});
          setSelectedColIndex((prev) => prev + 1);
          setSelectedRowIndex(0);
        }
      } else if (input === 'n') {
        const col = COLUMNS[selectedColIndex]?.key || 'backlog';
        setInputMode({ type: 'create-task', column: col });
        setInputValue('');
      } else if (input === 'e' && selectedTask) {
        setInputMode({ type: 'edit-task', task: selectedTask });
        setInputValue(selectedTask.title);
      } else if ((input === 'd' || input === 'x') && selectedTask) {
        setInputMode({ type: 'confirm-delete-task', task: selectedTask });
      } else if (input === 'g') {
        setInputMode({ type: 'ai-generate' });
        setInputValue('');
      } else if (input === 'a' && selectedTask?.assignedTo) {
        doAttach(selectedTask.assignedTo);
      } else if (input === 'c' && currentLane) {
        doAiChat(currentLane);
      } else if (input === 'r') {
        refreshTasks();
        refreshLanes();
      }
      return;
    }

    // ─── Level 3: Task Detail ────────────────────────────────────────────

    if (level === 3 && detailTask) {
      // Back to board
      if (key.escape || key.backspace || key.delete || input === 'q') {
        setLevel(2);
        setDetailTaskId(null);
        return;
      }

      // Navigate fields — j/k treats toggle row as one unit
      if (input === 'j' || key.downArrow) {
        setDetailFieldIndex((prev) => {
          if (prev >= TOGGLE_START_IDX && prev <= TOGGLE_END_IDX) {
            return Math.min(TOGGLE_END_IDX + 1, DETAIL_FIELDS.length - 1);
          }
          return Math.min(prev + 1, DETAIL_FIELDS.length - 1);
        });
      } else if (input === 'k' || key.upArrow) {
        setDetailFieldIndex((prev) => {
          if (prev >= TOGGLE_START_IDX && prev <= TOGGLE_END_IDX) {
            return Math.max(TOGGLE_START_IDX - 1, 0);
          }
          if (prev === TOGGLE_END_IDX + 1) return TOGGLE_START_IDX;
          return Math.max(prev - 1, 0);
        });
      }
      // Field actions based on type
      else if (currentField) {
        if (currentField.type === 'text' && (key.return || input === 'e')) {
          const val = getFieldValue(detailTask, currentField);
          setInputValue(val);
          setInputMode({ type: 'detail-edit', fieldKey: currentField.key });
        } else if (currentField.type === 'cycle') {
          if (input === 'e') {
            // Allow free-text editing on cycle fields (e.g. custom role names)
            const val = getFieldValue(detailTask, currentField);
            setInputValue(val);
            setInputMode({ type: 'detail-edit', fieldKey: currentField.key });
          } else if (input === 'l' || key.rightArrow || key.return) {
            cycleFieldValue(detailTask, currentField, 1).catch(() => {});
          } else if (input === 'h' || key.leftArrow) {
            cycleFieldValue(detailTask, currentField, -1).catch(() => {});
          }
        } else if (currentField.type === 'toggle') {
          if (input === ' ' || key.return) {
            toggleFieldValue(detailTask, currentField).catch(() => {});
          } else if (input === 'h' || key.leftArrow) {
            setDetailFieldIndex((prev) => Math.max(prev - 1, TOGGLE_START_IDX));
          } else if (input === 'l' || key.rightArrow) {
            setDetailFieldIndex((prev) => Math.min(prev + 1, TOGGLE_END_IDX));
          }
        }
      }
      // Attach to assigned agent
      if (input === 'a' && detailTask.assignedTo) {
        doAttach(detailTask.assignedTo);
      }
      // Delete task (D uppercase to avoid conflict with cycle fields)
      if (input === 'D') {
        setInputMode({ type: 'confirm-delete-task', task: detailTask });
      }
      // AI generate for this task
      if (input === 'g') {
        setInputMode({ type: 'ai-generate-detail', taskId: detailTask.id });
        setInputValue('');
      }
      // Refresh
      if (input === 'r') {
        refreshTasks();
      }
    }

    // ─── Level 4: Swimlane Settings ─────────────────────────────────────

    if (level === 4 && currentLane) {
      // Back to swimlane list
      if (key.escape || key.backspace || key.delete || input === 'q') {
        setLevel(1);
        return;
      }

      // Navigate fields — j/k treats toggle row as one unit
      if (input === 'j' || key.downArrow) {
        setLaneFieldIndex((prev) => {
          if (prev >= LANE_TOGGLE_START && prev <= LANE_TOGGLE_END) {
            return Math.min(LANE_TOGGLE_END + 1, LANE_FIELDS.length - 1);
          }
          return Math.min(prev + 1, LANE_FIELDS.length - 1);
        });
      } else if (input === 'k' || key.upArrow) {
        setLaneFieldIndex((prev) => {
          if (prev >= LANE_TOGGLE_START && prev <= LANE_TOGGLE_END) {
            return Math.max(LANE_TOGGLE_START - 1, 0);
          }
          if (prev === LANE_TOGGLE_END + 1) return LANE_TOGGLE_START;
          return Math.max(prev - 1, 0);
        });
      }
      // Field actions based on type
      else if (currentLaneField) {
        if (currentLaneField.type === 'text' && (key.return || input === 'e')) {
          const val = getLaneFieldValue(currentLane, currentLaneField);
          setInputValue(val);
          setInputMode({ type: 'lane-detail-edit', fieldKey: currentLaneField.key });
        } else if (currentLaneField.type === 'cycle') {
          if (input === 'l' || key.rightArrow || key.return) {
            cycleLaneFieldValue(currentLane, currentLaneField, 1).catch(() => {});
          } else if (input === 'h' || key.leftArrow) {
            cycleLaneFieldValue(currentLane, currentLaneField, -1).catch(() => {});
          }
        } else if (currentLaneField.type === 'toggle') {
          if (input === ' ' || key.return) {
            toggleLaneFieldValue(currentLane, currentLaneField).catch(() => {});
          } else if (input === 'h' || key.leftArrow) {
            setLaneFieldIndex((prev) => Math.max(prev - 1, LANE_TOGGLE_START));
          } else if (input === 'l' || key.rightArrow) {
            setLaneFieldIndex((prev) => Math.min(prev + 1, LANE_TOGGLE_END));
          }
        }
      }
      // Attach to lane session
      if (input === 'a' && currentLane.sessionName) {
        doAttachSession(currentLane.sessionName);
      }
      // Refresh
      if (input === 'r') {
        refreshLanes();
      }
    }
  });

  // ─── Input Submission Handlers ─────────────────────────────────────────────

  const handleInputSubmit = useCallback((value: string) => {
    const trimmed = value.trim();

    if (inputMode.type === 'detail-edit' && detailTask) {
      // Save the field even if empty (user may want to clear it)
      const field = DETAIL_FIELDS.find((f) => f.key === inputMode.fieldKey);
      if (field) {
        saveField(detailTask, field, trimmed).catch(() => {});
      }
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }

    if (inputMode.type === 'lane-detail-edit' && currentLane) {
      const field = LANE_FIELDS.find((f) => f.key === inputMode.fieldKey);
      if (field) {
        saveLaneFieldValue(currentLane, field, trimmed).catch(() => {});
      }
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }

    if (!trimmed) {
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }

    if (inputMode.type === 'create-lane-name') {
      setInputMode({ type: 'create-lane-dir', name: trimmed });
      setInputValue('');
      return;
    }

    if (inputMode.type === 'create-lane-dir') {
      createLane({ name: inputMode.name, workingDirectory: trimmed }).catch(() => {});
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }

    if (inputMode.type === 'edit-lane-name') {
      editLane({ id: inputMode.lane.id, name: trimmed }).catch(() => {});
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }

    if (inputMode.type === 'ai-generate') {
      const col = COLUMNS[selectedColIndex]?.key || 'backlog';
      setInputMode({ type: 'none' });
      setInputValue('');
      setAiStatus({ type: 'generating', startTime: Date.now() });
      // RPC returns immediately; completion arrives via ai.generate.completed event
      aiGenerateAndCreate(trimmed, currentLane?.id, col)
        .catch((err: any) => {
          const msg = (err?.message || 'AI generation failed').replace(/^RPC Error:\s*/i, '');
          setAiStatus({ type: 'error', message: msg, timestamp: Date.now() });
        });
      return;
    }

    if (inputMode.type === 'ai-generate-detail') {
      const taskIdToUpdate = inputMode.taskId;
      setInputMode({ type: 'none' });
      setInputValue('');
      setAiStatus({ type: 'generating', startTime: Date.now() });
      aiGenerateAndUpdate(trimmed, taskIdToUpdate, currentLane?.id)
        .catch((err: any) => {
          const msg = (err?.message || 'AI generation failed').replace(/^RPC Error:\s*/i, '');
          setAiStatus({ type: 'error', message: msg, timestamp: Date.now() });
        });
      return;
    }

    if (inputMode.type === 'create-task') {
      const col = inputMode.column;
      setInputMode({ type: 'none' });
      setInputValue('');
      createTask({ description: trimmed, swimLaneId: currentLane?.id, column: col })
        .then((newId) => {
          if (newId) {
            setDetailTaskId(newId);
            setDetailFieldIndex(0);
            setLevel(3);
          }
        })
        .catch(() => {});
      return;
    }

    if (inputMode.type === 'edit-task') {
      updateTask(inputMode.task.id, { title: trimmed }).catch(() => {});
      setInputMode({ type: 'none' });
      setInputValue('');
      return;
    }
  }, [inputMode, currentLane, detailTask, tasks, selectedColIndex, createLane, editLane, createTask, updateTask, saveField, saveLaneFieldValue, aiGenerateAndCreate, aiGenerateAndUpdate]);

  // ─── Render: Level 1 — Swimlane List ───────────────────────────────────────

  if (level === 1) {
    return (
      <Box flexDirection="column" height="100%">
        <Box>
          <Text bold color="cyan">Kanban</Text>
          <Text dimColor> {lanes.length} lane{lanes.length !== 1 ? 's' : ''}</Text>
        </Box>

        {lanesLoading && lanes.length === 0 ? (
          <Text dimColor>Loading...</Text>
        ) : totalEntries === 0 ? (
          <Text dimColor>No swimlanes. Press n to create one.</Text>
        ) : (
          <Box flexDirection="column" flexGrow={1} marginTop={1}>
            {lanes.map((lane, idx) => {
              const sel = idx === selectedLaneIndex;
              const laneTaskList = getTasksByLane(lane.id);
              const count = laneTaskList.length;
              const dir = shortPath(lane.workingDirectory || '');
              const active = lane.sessionActive;
              const isExpanded = !collapsedLanes.has(lane.id);
              return (
                <Box key={lane.id} flexDirection="column">
                  <Box>
                    <Text color={sel ? 'cyan' : 'white'}>{sel ? '▶ ' : '  '}</Text>
                    <Text color={sel ? 'cyan' : 'gray'}>{isExpanded ? '▼' : '▷'} </Text>
                    <Text bold={sel} color={sel ? 'cyan' : 'white'}>{lane.name}</Text>
                    <Text dimColor>  {dir}</Text>
                    <Text dimColor>  {count}t</Text>
                    {lane.aiProvider ? <Text color="magenta">  {lane.aiProvider}</Text> : null}
                    {active ? <Text color="green">  ●</Text> : <Text dimColor>  ○</Text>}
                  </Box>
                  {isExpanded && count > 0 && (
                    <Box flexDirection="column" marginLeft={5}>
                      {COLUMNS.map(col => {
                        const colTasks = filterByColumn(laneTaskList, col.key);
                        if (colTasks.length === 0) return null;
                        return (
                          <Box key={col.key}>
                            <Box width={14}>
                              <Text color={col.color}>{col.label}</Text>
                            </Box>
                            <Text dimColor wrap="truncate">
                              {colTasks.slice(0, 5).map(t => t.title).join(', ')}
                              {colTasks.length > 5 ? ` +${colTasks.length - 5} more` : ''}
                            </Text>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              );
            })}
            {hasUnassigned && (
              <Box flexDirection="column">
                <Box>
                  <Text color={isOnUnassigned ? 'cyan' : 'white'}>{isOnUnassigned ? '▶ ' : '  '}</Text>
                  <Text color={isOnUnassigned ? 'cyan' : 'gray'}>{!collapsedLanes.has('__unassigned__') ? '▼' : '▷'} </Text>
                  <Text bold={isOnUnassigned} color={isOnUnassigned ? 'cyan' : 'yellow'}>Unassigned</Text>
                  <Text dimColor>  {unassignedTasks.length}t</Text>
                </Box>
                {!collapsedLanes.has('__unassigned__') && (
                  <Box flexDirection="column" marginLeft={5}>
                    {COLUMNS.map(col => {
                      const colTasks = filterByColumn(unassignedTasks, col.key);
                      if (colTasks.length === 0) return null;
                      return (
                        <Box key={col.key}>
                          <Box width={14}>
                            <Text color={col.color}>{col.label}</Text>
                          </Box>
                          <Text dimColor wrap="truncate">
                            {colTasks.slice(0, 5).map(t => t.title).join(', ')}
                            {colTasks.length > 5 ? ` +${colTasks.length - 5} more` : ''}
                          </Text>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {inputMode.type === 'create-lane-name' && (
          <Box><Text color="green">Name: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {inputMode.type === 'create-lane-dir' && (
          <Box><Text color="green">Dir: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {inputMode.type === 'edit-lane-name' && (
          <Box><Text color="yellow">Rename: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {inputMode.type === 'confirm-delete-lane' && (
          <Text color="red">Delete &quot;{inputMode.lane.name}&quot;? y/n</Text>
        )}

        {inputMode.type === 'none' && (
          <Box marginTop={1}>
            <Text dimColor wrap="truncate">j/k Nav  ␣ Toggle  Enter Tasks  s Settings  a Attach  c Chat  t Term  b Debug  n New  e Edit  d Del  q Quit</Text>
          </Box>
        )}
      </Box>
    );
  }

  // ─── Render: Level 2 — Task Board ──────────────────────────────────────────

  if (level === 2) {
    const laneLabel = isOnUnassigned ? 'Unassigned' : (currentLane?.name || 'Unknown');
    const laneDir = currentLane?.workingDirectory ? shortPath(currentLane.workingDirectory) : '';

    return (
      <Box flexDirection="column" height="100%">
        <Box>
          <Text color="cyan" bold>{'← '}{laneLabel}</Text>
          <Text dimColor>  {laneDir}  {laneTasks.length}t</Text>
        </Box>

        <Box flexDirection="row" flexGrow={1} marginTop={1}>
          {COLUMNS.map((col, colIdx) => {
            const colTasks = getColumnTasks(col.key);
            const isActiveCol = colIdx === selectedColIndex;

            return (
              <Box
                key={col.key}
                flexDirection="column"
                borderStyle="single"
                borderColor={isActiveCol ? col.color : 'gray'}
                paddingX={1}
                width="20%"
                marginRight={colIdx < COLUMNS.length - 1 ? 1 : 0}
              >
                <Text bold color={col.color}>{col.label} ({colTasks.length})</Text>
                <Box flexDirection="column" marginTop={1}>
                  {colTasks.length === 0 ? (
                    <Text dimColor>-</Text>
                  ) : (
                    colTasks.slice(0, 15).map((task, rowIdx) => {
                      const isSelected = isActiveCol && rowIdx === selectedRowIndex;
                      const pChar = task.priority === 'urgent' ? '!' : task.priority === 'high' ? '▲' : task.priority === 'medium' ? '─' : '▽';
                      const pColor = task.priority === 'urgent' || task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'yellow' : 'gray';
                      return (
                        <Box key={task.id}>
                          <Text color={isSelected ? 'cyan' : pColor}>{isSelected ? '▶' : pChar}</Text>
                          <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'} wrap="truncate"> {task.title}</Text>
                        </Box>
                      );
                    })
                  )}
                  {colTasks.length > 15 && <Text dimColor>+{colTasks.length - 15} more</Text>}
                </Box>
              </Box>
            );
          })}
        </Box>

        {inputMode.type === 'create-task' && (
          <Box><Text color="green">New ({inputMode.column}): </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {inputMode.type === 'edit-task' && (
          <Box><Text color="yellow">Edit: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {inputMode.type === 'confirm-delete-task' && (
          <Text color="red">Delete &quot;{inputMode.task.title}&quot;? y/n</Text>
        )}
        {inputMode.type === 'ai-generate' && (
          <Box><Text color="magenta">AI: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {aiStatus.type === 'generating' && <Text color="magenta">AI generating... ({aiElapsed}s)</Text>}
        {aiStatus.type === 'done' && <Text color="green">{aiStatus.message}</Text>}
        {aiStatus.type === 'error' && <Text color="red">Error: {aiStatus.message}</Text>}

        {inputMode.type === 'none' && aiStatus.type !== 'generating' && (
          <Box marginTop={1}>
            <Text dimColor wrap="truncate">j/k Nav  h/l Col  H/L Move  Enter Detail  n New  g AI  c Chat  a Attach  d Del  q Back</Text>
          </Box>
        )}
      </Box>
    );
  }

  // ─── Render: Level 3 — Task Detail ─────────────────────────────────────────

  if (level === 3 && detailTask) {
    const editingField = inputMode.type === 'detail-edit' ? inputMode.fieldKey : null;
    const isToggleSelected = detailFieldIndex >= TOGGLE_START_IDX && detailFieldIndex <= TOGGLE_END_IDX;

    return (
      <Box flexDirection="column" height="100%">
        <Box>
          <Text color="cyan" bold>{'← '}{detailTask.title}</Text>
          <Text dimColor>  {formatTimestamp(detailTask.createdAt)}</Text>
        </Box>

        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {/* Main fields (one per line) */}
          {DETAIL_FIELDS_MAIN.map((field, idx) => {
            const isSelected = idx === detailFieldIndex;
            const isEditing = editingField === field.key;
            const display = formatFieldDisplay(detailTask, field);
            const hint = field.type === 'text' ? 'e' : field.type === 'cycle' ? 'h/l e' : '';

            return (
              <Box key={field.key}>
                <Box width={14}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}{field.label}</Text>
                </Box>
                <Box flexGrow={1}>
                  {isEditing ? (
                    <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} />
                  ) : (
                    <Text bold={isSelected} color={isSelected ? 'white' : undefined}>{display}</Text>
                  )}
                </Box>
                {isSelected && hint ? <Text dimColor> [{hint}]</Text> : null}
              </Box>
            );
          })}

          {/* Toggle fields (inline on one row) */}
          <Box>
            <Box width={14}>
              <Text color={isToggleSelected ? 'cyan' : 'gray'}>{isToggleSelected ? '▶ ' : '  '}Toggles</Text>
            </Box>
            {DETAIL_TOGGLE_FIELDS.map((field, tIdx) => {
              const globalIdx = TOGGLE_START_IDX + tIdx;
              const isSel = detailFieldIndex === globalIdx;
              const on = !!(detailTask as any)[field.key];
              return (
                <Box key={field.key} marginRight={2}>
                  <Text bold={isSel} color={isSel ? 'cyan' : on ? 'green' : 'gray'}>
                    {on ? '[x]' : '[ ]'} {field.label}
                  </Text>
                </Box>
              );
            })}
            {isToggleSelected ? <Text dimColor> [␣]</Text> : null}
          </Box>

          {/* Tail fields (readonly) */}
          {DETAIL_FIELDS_TAIL.map((field, tIdx) => {
            const globalIdx = TOGGLE_START_IDX + DETAIL_TOGGLE_FIELDS.length + tIdx;
            const isSelected = detailFieldIndex === globalIdx;
            const display = formatFieldDisplay(detailTask, field);

            return (
              <Box key={field.key}>
                <Box width={14}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}{field.label}</Text>
                </Box>
                <Text color="gray">{display}</Text>
              </Box>
            );
          })}
        </Box>

        {/* AI generate input */}
        {inputMode.type === 'ai-generate-detail' && (
          <Box><Text color="magenta">AI: </Text><TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} /></Box>
        )}
        {/* Delete confirmation */}
        {inputMode.type === 'confirm-delete-task' && (
          <Text color="red">Delete &quot;{inputMode.task.title}&quot;? y/n</Text>
        )}
        {aiStatus.type === 'generating' && <Text color="magenta">AI generating... ({aiElapsed}s)</Text>}
        {aiStatus.type === 'done' && <Text color="green">{aiStatus.message}</Text>}
        {aiStatus.type === 'error' && <Text color="red">Error: {aiStatus.message}</Text>}

        <Box marginTop={1}>
          <Text dimColor wrap="truncate">{
            inputMode.type === 'detail-edit' ? 'Enter Save  Esc Cancel' :
            inputMode.type === 'ai-generate-detail' ? 'Enter Generate  Esc Cancel' :
            'j/k Nav  e Edit  h/l Cycle  ␣ Toggle  g AI  D Del  a Attach  q Back'
          }</Text>
        </Box>
      </Box>
    );
  }

  // ─── Render: Level 4 — Swimlane Settings ───────────────────────────────────

  if (level === 4 && currentLane) {
    const editingLaneField = inputMode.type === 'lane-detail-edit' ? inputMode.fieldKey : null;
    const isLaneToggleSelected = laneFieldIndex >= LANE_TOGGLE_START && laneFieldIndex <= LANE_TOGGLE_END;

    return (
      <Box flexDirection="column" height="100%">
        <Box>
          <Text color="cyan" bold>{'← '}{currentLane.name} Settings</Text>
          <Text dimColor>  {formatTimestamp(currentLane.createdAt)}</Text>
          {currentLane.sessionActive ? <Text color="green">  ● Active</Text> : null}
        </Box>

        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {/* Main fields (one per line) */}
          {LANE_FIELDS_MAIN.map((field, idx) => {
            const isSelected = idx === laneFieldIndex;
            const isEditing = editingLaneField === field.key;
            const display = formatLaneFieldDisplay(currentLane, field);
            const hint = field.type === 'text' ? 'e' : field.type === 'cycle' ? 'h/l e' : '';

            return (
              <Box key={field.key}>
                <Box width={16}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}{field.label}</Text>
                </Box>
                <Box flexGrow={1}>
                  {isEditing ? (
                    <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} />
                  ) : (
                    <Text bold={isSelected} color={isSelected ? 'white' : undefined}>{display}</Text>
                  )}
                </Box>
                {isSelected && hint ? <Text dimColor> [{hint}]</Text> : null}
              </Box>
            );
          })}

          {/* Toggle fields (inline on one row) */}
          <Box>
            <Box width={16}>
              <Text color={isLaneToggleSelected ? 'cyan' : 'gray'}>{isLaneToggleSelected ? '▶ ' : '  '}Defaults</Text>
            </Box>
            {LANE_TOGGLE_FIELDS.map((field, tIdx) => {
              const globalIdx = LANE_TOGGLE_START + tIdx;
              const isSel = laneFieldIndex === globalIdx;
              const on = !!(currentLane as any)[field.key];
              return (
                <Box key={field.key} marginRight={2}>
                  <Text bold={isSel} color={isSel ? 'cyan' : on ? 'green' : 'gray'}>
                    {on ? '[x]' : '[ ]'} {field.label}
                  </Text>
                </Box>
              );
            })}
            {isLaneToggleSelected ? <Text dimColor> [␣]</Text> : null}
          </Box>

          {/* Tail fields (readonly + text) */}
          {LANE_FIELDS_TAIL.map((field, tIdx) => {
            const globalIdx = LANE_TOGGLE_START + LANE_TOGGLE_FIELDS.length + tIdx;
            const isSelected = laneFieldIndex === globalIdx;
            const isEditing = editingLaneField === field.key;
            const display = formatLaneFieldDisplay(currentLane, field);
            const hint = field.type === 'text' ? 'e' : '';

            return (
              <Box key={field.key}>
                <Box width={16}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶ ' : '  '}{field.label}</Text>
                </Box>
                <Box flexGrow={1}>
                  {isEditing ? (
                    <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleInputSubmit} />
                  ) : (
                    <Text bold={isSelected} color={field.type === 'readonly' ? 'gray' : isSelected ? 'white' : undefined}>{display}</Text>
                  )}
                </Box>
                {isSelected && hint ? <Text dimColor> [{hint}]</Text> : null}
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          <Text dimColor wrap="truncate">{inputMode.type === 'lane-detail-edit' ? 'Enter Save  Esc Cancel' : 'j/k Nav  e Edit  h/l Cycle  ␣ Toggle  a Attach  q Back'}</Text>
        </Box>
      </Box>
    );
  }

  // Fallback (shouldn't reach here, but just in case detailTask is stale)
  if (level === 3 && !detailTask) {
    setLevel(2);
    setDetailTaskId(null);
  }

  return (
    <Box>
      <Text dimColor>Loading...</Text>
    </Box>
  );
}
