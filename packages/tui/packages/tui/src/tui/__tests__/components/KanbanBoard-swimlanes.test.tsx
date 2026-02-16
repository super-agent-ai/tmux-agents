// ─── KanbanBoard Swimlane Grouping & Expand/Collapse Tests ─────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { createElement } from 'react';
import type { TaskInfo, SwimLaneInfo } from '../../types.js';
import { groupTasksByLane } from '../../components/KanbanBoard.js';

// ─── groupTasksByLane Unit Tests ──────────────────────────────────────────────

describe('groupTasksByLane', () => {
  const lanes: SwimLaneInfo[] = [
    {
      id: 'lane-1', name: 'Backend', serverId: '', workingDirectory: '/dev/api',
      sessionName: '', taskCount: 0, createdAt: Date.now(),
    },
    {
      id: 'lane-2', name: 'Frontend', serverId: '', workingDirectory: '/dev/web',
      sessionName: '', taskCount: 0, createdAt: Date.now(),
    },
  ];

  function makeTask(overrides: Partial<TaskInfo> & { id: string }): TaskInfo {
    return {
      title: `Task ${overrides.id}`,
      status: 'backlog',
      priority: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  it('groups tasks by swimLaneId', () => {
    const tasks = [
      makeTask({ id: '1', swimLaneId: 'lane-1' }),
      makeTask({ id: '2', swimLaneId: 'lane-1' }),
      makeTask({ id: '3', swimLaneId: 'lane-2' }),
    ];
    const result = groupTasksByLane(tasks, lanes);
    expect(result).toHaveLength(2);
    expect(result[0].laneId).toBe('lane-1');
    expect(result[0].tasks).toHaveLength(2);
    expect(result[1].laneId).toBe('lane-2');
    expect(result[1].tasks).toHaveLength(1);
  });

  it('puts unassigned tasks in __unassigned__ bucket', () => {
    const tasks = [
      makeTask({ id: '1', swimLaneId: 'lane-1' }),
      makeTask({ id: '2' }), // no swimLaneId
      makeTask({ id: '3', swimLaneId: undefined }),
    ];
    const result = groupTasksByLane(tasks, lanes);
    expect(result).toHaveLength(3); // lane-1, lane-2, __unassigned__
    const unassigned = result.find(r => r.laneId === '__unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned!.laneName).toBe('Unassigned');
    expect(unassigned!.tasks).toHaveLength(2);
  });

  it('puts tasks with unknown swimLaneId in __unassigned__', () => {
    const tasks = [
      makeTask({ id: '1', swimLaneId: 'nonexistent-lane' }),
    ];
    const result = groupTasksByLane(tasks, lanes);
    const unassigned = result.find(r => r.laneId === '__unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned!.tasks).toHaveLength(1);
  });

  it('does not include __unassigned__ when all tasks belong to lanes', () => {
    const tasks = [
      makeTask({ id: '1', swimLaneId: 'lane-1' }),
      makeTask({ id: '2', swimLaneId: 'lane-2' }),
    ];
    const result = groupTasksByLane(tasks, lanes);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.laneId === '__unassigned__')).toBeUndefined();
  });

  it('returns empty tasks array for lanes with no tasks', () => {
    const tasks = [
      makeTask({ id: '1', swimLaneId: 'lane-1' }),
    ];
    const result = groupTasksByLane(tasks, lanes);
    expect(result[1].laneId).toBe('lane-2');
    expect(result[1].tasks).toHaveLength(0);
  });

  it('handles empty tasks array', () => {
    const result = groupTasksByLane([], lanes);
    expect(result).toHaveLength(2);
    expect(result[0].tasks).toHaveLength(0);
    expect(result[1].tasks).toHaveLength(0);
  });

  it('handles empty lanes array', () => {
    const tasks = [
      makeTask({ id: '1' }),
      makeTask({ id: '2' }),
    ];
    const result = groupTasksByLane(tasks, []);
    expect(result).toHaveLength(1);
    expect(result[0].laneId).toBe('__unassigned__');
    expect(result[0].tasks).toHaveLength(2);
  });

  it('handles both empty', () => {
    const result = groupTasksByLane([], []);
    expect(result).toHaveLength(0);
  });

  it('preserves lane order', () => {
    const result = groupTasksByLane([], lanes);
    expect(result[0].laneId).toBe('lane-1');
    expect(result[0].laneName).toBe('Backend');
    expect(result[1].laneId).toBe('lane-2');
    expect(result[1].laneName).toBe('Frontend');
  });
});

// ─── KanbanBoard Component Swimlane Tests ─────────────────────────────────────

// Mock data
const mockLanes: SwimLaneInfo[] = [
  {
    id: 'lane-1', name: 'Backend API', serverId: 'srv-1',
    workingDirectory: '~/dev/api', sessionName: 'backend',
    aiProvider: 'claude', taskCount: 3, createdAt: Date.now(),
  },
  {
    id: 'lane-2', name: 'Frontend App', serverId: 'srv-2',
    workingDirectory: '~/dev/web', sessionName: 'frontend',
    aiProvider: 'gemini', taskCount: 1, createdAt: Date.now(),
  },
];

function makeTask(overrides: Partial<TaskInfo> & { id: string; swimLaneId?: string }): TaskInfo & { swimLaneId?: string } {
  return {
    title: `Task ${overrides.id}`,
    status: 'backlog',
    priority: 'medium',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const defaultTasks = [
  makeTask({ id: '1', title: 'Fix auth', status: 'backlog', swimLaneId: 'lane-1' }),
  makeTask({ id: '2', title: 'Add tests', status: 'todo', swimLaneId: 'lane-1' }),
  makeTask({ id: '3', title: 'Impl cache', status: 'in_progress', swimLaneId: 'lane-1' }),
  makeTask({ id: '4', title: 'Style button', status: 'backlog', swimLaneId: 'lane-2' }),
];

let mockLanesState = [...mockLanes];
let mockTasksState = [...defaultTasks];

vi.mock('../../hooks/useSwimLanes.js', () => ({
  useSwimLanes: () => ({
    lanes: mockLanesState,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createLane: vi.fn(),
    editLane: vi.fn(),
    deleteLane: vi.fn(),
    saveLaneField: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTasks.js', () => ({
  useTasks: () => ({
    tasks: mockTasksState,
    loading: false,
    error: null,
    refresh: vi.fn(),
    getTasksByStatus: (status: string) => mockTasksState.filter((t: any) => t.status === status),
    getTasksByLane: (laneId: string) => mockTasksState.filter((t: any) => t.swimLaneId === laneId),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    moveTask: vi.fn(),
    saveTaskField: vi.fn(),
    aiGenerateAndCreate: vi.fn(),
    aiGenerateAndUpdate: vi.fn(),
    aiChat: vi.fn(),
  }),
}));

const { KanbanBoard } = await import('../../components/KanbanBoard.js');

describe('KanbanBoard swimlane expand/collapse', () => {
  beforeEach(() => {
    mockLanesState = [...mockLanes];
    mockTasksState = [...defaultTasks];
  });

  it('shows expand/collapse indicators for each lane', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    // Default state is expanded, so should show ▼
    expect(output).toContain('▼');
    expect(output).toContain('Backend API');
    expect(output).toContain('Frontend App');
  });

  it('shows task previews when lanes are expanded', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    // Tasks should be visible under expanded lanes
    expect(output).toContain('Fix auth');
    expect(output).toContain('Add tests');
    expect(output).toContain('Impl cache');
    expect(output).toContain('Style button');
  });

  it('shows column labels in expanded lane task preview', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Backlog');
    expect(output).toContain('To Do');
    expect(output).toContain('In Progress');
  });

  it('shows task count per lane', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('3t'); // lane-1 has 3 tasks
    expect(output).toContain('1t'); // lane-2 has 1 task
  });

  it('shows toggle hint in keybindings', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Toggle');
  });

  it('toggles lane collapse on space key', async () => {
    const { lastFrame, stdin } = render(createElement(KanbanBoard, { client: null }));

    // Initially expanded — task titles should be visible under lane headers
    let output = lastFrame() || '';
    expect(output).toContain('▼'); // expanded indicator
    expect(output).toContain('Fix auth'); // task visible

    // Press space to collapse the selected lane (Backend API)
    stdin.write(' ');
    await new Promise(resolve => setTimeout(resolve, 100));
    output = lastFrame() || '';

    // After collapse, the collapsed indicator ▷ should appear for lane-1
    // Note: Frontend App lane (lane-2) should still be expanded
    expect(output).toContain('▷'); // collapsed indicator for lane-1
    expect(output).toContain('Style button'); // lane-2 tasks still visible
  });

  it('re-expands lane on second space press', async () => {
    const { lastFrame, stdin } = render(createElement(KanbanBoard, { client: null }));

    // Collapse
    stdin.write(' ');
    await new Promise(resolve => setTimeout(resolve, 100));
    let output = lastFrame() || '';
    expect(output).toContain('▷');

    // Re-expand
    stdin.write(' ');
    await new Promise(resolve => setTimeout(resolve, 100));
    output = lastFrame() || '';
    // Both lanes should be expanded again, task visible
    expect(output).toContain('Fix auth');
  });

  it('shows Unassigned section for tasks without swimLaneId', () => {
    mockTasksState = [
      ...defaultTasks,
      makeTask({ id: '5', title: 'Orphan task', status: 'backlog' }), // no swimLaneId
    ];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Unassigned');
    expect(output).toContain('Orphan task');
    expect(output).toContain('1t'); // 1 unassigned task
  });

  it('does not show Unassigned when all tasks belong to lanes', () => {
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).not.toContain('Unassigned');
  });

  it('renders flat when no swimlanes exist but tasks are present', () => {
    mockLanesState = [];
    mockTasksState = [
      makeTask({ id: '1', title: 'Orphan 1', status: 'backlog' }),
      makeTask({ id: '2', title: 'Orphan 2', status: 'todo' }),
    ];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Unassigned');
    expect(output).toContain('Orphan 1');
    expect(output).toContain('Orphan 2');
  });

  it('shows no swimlanes message when both lanes and tasks are empty', () => {
    mockLanesState = [];
    mockTasksState = [];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('No swimlanes');
  });

  it('shows empty lane with 0 count and no task rows', () => {
    mockTasksState = []; // No tasks
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Backend API');
    expect(output).toContain('0t');
  });

  // ─── Backlog Visibility Tests ──────────────────────────────────────────

  it('shows Backlog column label in expanded lane preview', () => {
    // Ensure at least one backlog task exists
    mockTasksState = [
      makeTask({ id: '1', title: 'Backlog item', status: 'backlog', swimLaneId: 'lane-1' }),
    ];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Backlog');
    expect(output).toContain('Backlog item');
  });

  it('shows backlog tasks alongside other column tasks in preview', () => {
    mockTasksState = [
      makeTask({ id: '1', title: 'In backlog', status: 'backlog', swimLaneId: 'lane-1' }),
      makeTask({ id: '2', title: 'In todo', status: 'todo', swimLaneId: 'lane-1' }),
      makeTask({ id: '3', title: 'In progress', status: 'in_progress', swimLaneId: 'lane-1' }),
    ];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Backlog');
    expect(output).toContain('In backlog');
    expect(output).toContain('To Do');
    expect(output).toContain('In todo');
    expect(output).toContain('In Progress');
    expect(output).toContain('In progress');
  });

  // ─── Unassigned Level 2 Navigation Tests ──────────────────────────────

  it('can enter task board from Unassigned section', async () => {
    mockLanesState = [];
    mockTasksState = [
      makeTask({ id: '1', title: 'Orphan backlog', status: 'backlog' }),
      makeTask({ id: '2', title: 'Orphan todo', status: 'todo' }),
    ];
    const { lastFrame, stdin } = render(createElement(KanbanBoard, { client: null }));

    // Level 1: Unassigned should be visible
    let output = lastFrame() || '';
    expect(output).toContain('Unassigned');

    // Press Enter to enter Level 2 (task board)
    stdin.write('\r');
    await new Promise(resolve => setTimeout(resolve, 100));
    output = lastFrame() || '';

    // Should now show task board with column headers and Unassigned label
    expect(output).toContain('Unassigned');
    expect(output).toContain('Backlog');
    expect(output).toContain('To Do');
  });

  it('can enter task board for Unassigned with named lanes present', async () => {
    mockTasksState = [
      ...defaultTasks,
      makeTask({ id: '5', title: 'Unassigned task', status: 'backlog' }),
    ];
    const { lastFrame, stdin } = render(createElement(KanbanBoard, { client: null }));

    // Navigate down past lanes to Unassigned (2 lanes + 1 unassigned = 3 entries)
    stdin.write('j'); // move to lane-2
    await new Promise(resolve => setTimeout(resolve, 50));
    stdin.write('j'); // move to Unassigned
    await new Promise(resolve => setTimeout(resolve, 50));

    let output = lastFrame() || '';
    expect(output).toContain('Unassigned');

    // Press Enter to enter Level 2
    stdin.write('\r');
    await new Promise(resolve => setTimeout(resolve, 100));
    output = lastFrame() || '';

    // Should show task board with Unassigned header and the unassigned backlog task
    expect(output).toContain('Unassigned');
    expect(output).toContain('Backlog');
  });

  it('shows multiple backlog tasks in expanded lane preview', () => {
    mockTasksState = [
      makeTask({ id: '1', title: 'Backlog A', status: 'backlog', swimLaneId: 'lane-1' }),
      makeTask({ id: '2', title: 'Backlog B', status: 'backlog', swimLaneId: 'lane-1' }),
      makeTask({ id: '3', title: 'Backlog C', status: 'backlog', swimLaneId: 'lane-1' }),
    ];
    const { lastFrame } = render(createElement(KanbanBoard, { client: null }));
    const output = lastFrame() || '';
    expect(output).toContain('Backlog');
    expect(output).toContain('Backlog A');
    expect(output).toContain('Backlog B');
    expect(output).toContain('Backlog C');
  });
});
