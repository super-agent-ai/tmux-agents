#!/usr/bin/env node
// ─── TUI Entry Point ────────────────────────────────────────────────────────

import { render } from 'ink';
import { App } from './components/App.js';
import { createElement } from 'react';

// Parse command line arguments
const args = process.argv.slice(2);
let socketPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--socket' && i + 1 < args.length) {
    socketPath = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
tmux-agents TUI

Usage:
  tmux-agents tui [options]

Options:
  --socket <path>   Path to daemon Unix socket
  --help, -h        Show this help message

Keyboard Shortcuts:
  F1, F2, F3        Switch tabs (Agents, Tasks, Pipelines)
  j/k, ↓/↑          Navigate list
  Enter             Preview selected agent
  a                 Attach to agent (interactive)
  s                 Send prompt to agent
  n                 Spawn new agent
  t                 Create new task
  x                 Kill selected agent
  r                 Force refresh
  q                 Quit
  Ctrl+A            Agent picker (fzf)
  Ctrl+T            Task picker (fzf)
    `);
    process.exit(0);
  }
}

// Render the app
render(createElement(App, { socketPath }));
