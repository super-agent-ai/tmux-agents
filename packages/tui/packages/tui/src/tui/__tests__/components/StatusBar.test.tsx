// ─── StatusBar Component Tests ──────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../components/StatusBar.js';
import type { AgentInfo } from '../../types.js';
import { createElement } from 'react';

describe('StatusBar', () => {
  it('displays agent counts correctly', () => {
    const agents: AgentInfo[] = [
      {
        id: '1',
        status: 'idle',
        role: 'developer',
        runtime: 'tmux',
        createdAt: Date.now(),
      },
      {
        id: '2',
        status: 'busy',
        role: 'tester',
        runtime: 'docker',
        createdAt: Date.now(),
      },
      {
        id: '3',
        status: 'building',
        role: 'builder',
        runtime: 'k8s',
        createdAt: Date.now(),
      },
      {
        id: '4',
        status: 'error',
        role: 'debugger',
        runtime: 'tmux',
        createdAt: Date.now(),
      },
    ];

    const { lastFrame } = render(
      createElement(StatusBar, { agents, currentTab: 'agents' })
    );

    const output = lastFrame() || '';

    // Check agent counts
    expect(output).toContain('1 idle');
    expect(output).toContain('1 busy');
    expect(output).toContain('1 building');
    expect(output).toContain('1 error');
  });

  it('highlights current tab', () => {
    const agents: AgentInfo[] = [];

    const { lastFrame } = render(
      createElement(StatusBar, { agents, currentTab: 'tasks' })
    );

    const output = lastFrame() || '';

    // F2 Tasks should be highlighted (current tab)
    expect(output).toContain('F2 Tasks');
  });

  it('shows keyboard shortcuts', () => {
    const agents: AgentInfo[] = [];

    const { lastFrame } = render(
      createElement(StatusBar, { agents, currentTab: 'agents' })
    );

    const output = lastFrame() || '';

    expect(output).toContain('Enter: Preview');
    expect(output).toContain('a: Attach');
    expect(output).toContain('q: Quit');
  });
});
