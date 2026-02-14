#!/usr/bin/env node
/**
 * TUI Launcher - Launches the tmux-agents Terminal UI
 * This script launches the TUI from the main extension
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let socketPath;
let httpUrl;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--socket' && i + 1 < args.length) {
    socketPath = args[i + 1];
    i++;
  } else if (args[i] === '--ip' && i + 1 < args.length) {
    // Parse --ip flag: supports formats like "host:port" or just "host"
    const ipArg = args[i + 1];
    httpUrl = ipArg.includes('://') ? ipArg : `http://${ipArg}`;
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
tmux-agents TUI

Usage:
  tmux-agents tui [options]

Options:
  --socket <path>      Path to daemon Unix socket
  --ip <host:port>     Daemon HTTP address (e.g. localhost:3456 or 192.168.1.10:3456)
  --help, -h           Show this help message

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

// Find the TUI index script from the packages/tui/dist directory
const tuiScript = path.join(__dirname, 'dist/tui/index.js');

const tuiArgs = [];
if (socketPath) {
  tuiArgs.push('--socket', socketPath);
}
if (httpUrl) {
  tuiArgs.push('--http-url', httpUrl);
}

// Launch the TUI
const child = spawn('node', [tuiScript, ...tuiArgs], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error(`Failed to launch TUI: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
