#!/usr/bin/env node
/**
 * Web UI Server - Serves a dashboard for tmux-agents daemon
 */

import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

export function startWebServer(port: number = 3000, host: string = '0.0.0.0'): http.Server {
  const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Serve dashboard HTML
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getDashboardHTML());
      return;
    }

    // Serve Kanban board
    if (req.url === '/kanban') {
      const kanbanPath = path.join(__dirname, 'kanban.html');
      if (fs.existsSync(kanbanPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(kanbanPath, 'utf-8'));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Kanban board not found');
      }
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'web-ui' }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, host, () => {
    console.log(`\n🚀 tmux-agents Web UI`);
    console.log(`───────────────────────────────────────`);
    console.log(`  URL:      http://${host}:${port}`);
    console.log(`  Daemon:   http://localhost:3456`);
    console.log(`  WebSocket: ws://localhost:3457`);
    console.log(`───────────────────────────────────────\n`);
    console.log(`Press Ctrl+C to stop\n`);
  });

  return server;
}

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tmux-agents Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
    }
    header {
      background: #2d2d2d;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { color: #4a9eff; margin-bottom: 10px; }
    .status { display: inline-block; padding: 5px 10px; border-radius: 4px; font-size: 14px; }
    .status.healthy { background: #2d5f2f; color: #7fdf85; }
    .status.unhealthy { background: #5f2d2d; color: #ff7f7f; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: #2d2d2d;
      padding: 20px;
      border-radius: 8px;
      border-left: 3px solid #4a9eff;
    }
    .card h2 { color: #4a9eff; margin-bottom: 15px; font-size: 18px; }
    .list { list-style: none; }
    .list li {
      padding: 10px;
      background: #1a1a1a;
      margin-bottom: 8px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.running { background: #2d5f2f; color: #7fdf85; }
    .badge.pending { background: #5f4f2d; color: #ffc966; }
    .badge.completed { background: #2d4f5f; color: #66c2ff; }
    .empty { color: #666; font-style: italic; }
    .refresh {
      background: #4a9eff;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .refresh:hover { background: #3a8eef; }
    .loading { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🚀 tmux-agents Dashboard</h1>
      <span id="daemonStatus" class="status">Connecting...</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button class="refresh" onclick="window.location.href='/kanban'">📋 Kanban</button>
      <button class="refresh" onclick="refresh()">↻ Refresh</button>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <h2>Active Agents</h2>
      <ul id="agentsList" class="list">
        <li class="loading">Loading agents...</li>
      </ul>
    </div>

    <div class="card">
      <h2>Tasks</h2>
      <ul id="tasksList" class="list">
        <li class="loading">Loading tasks...</li>
      </ul>
    </div>

    <div class="card">
      <h2>Pipelines</h2>
      <ul id="pipelinesList" class="list">
        <li class="loading">Loading pipelines...</li>
      </ul>
    </div>

    <div class="card">
      <h2>System Health</h2>
      <ul id="healthList" class="list">
        <li class="loading">Checking health...</li>
      </ul>
    </div>
  </div>

  <script>
    const DAEMON_API = 'http://localhost:3456';
    const WS_URL = 'ws://localhost:3457';

    let ws = null;

    async function callDaemon(method, params = {}) {
      const response = await fetch(\`\${DAEMON_API}/rpc\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }

    async function refresh() {
      try {
        // Check daemon health
        const health = await fetch(\`\${DAEMON_API}/health\`).then(r => r.json());
        document.getElementById('daemonStatus').className = 'status healthy';
        document.getElementById('daemonStatus').textContent = '● Connected';

        // Load agents
        const agents = await callDaemon('agent.list');
        const agentsList = document.getElementById('agentsList');
        if (agents.length === 0) {
          agentsList.innerHTML = '<li class="empty">No active agents</li>';
        } else {
          agentsList.innerHTML = agents.map(a => \`
            <li>
              <span>\${a.role || 'agent'} #\${a.id}</span>
              <span class="badge running">\${a.status || 'running'}</span>
            </li>
          \`).join('');
        }

        // Load tasks
        const tasks = await callDaemon('task.list');
        const tasksList = document.getElementById('tasksList');
        if (tasks.length === 0) {
          tasksList.innerHTML = '<li class="empty">No tasks</li>';
        } else {
          tasksList.innerHTML = tasks.map(t => \`
            <li>
              <span>\${t.title || t.description || 'Task #' + t.id}</span>
              <span class="badge \${t.status}">\${t.status || 'pending'}</span>
            </li>
          \`).join('');
        }

        // Load pipelines
        const pipelines = await callDaemon('pipeline.list');
        const pipelinesList = document.getElementById('pipelinesList');
        if (pipelines.length === 0) {
          pipelinesList.innerHTML = '<li class="empty">No active pipelines</li>';
        } else {
          pipelinesList.innerHTML = pipelines.map(p => \`
            <li>
              <span>\${p.name || 'Pipeline #' + p.id}</span>
              <span class="badge \${p.status}">\${p.status || 'running'}</span>
            </li>
          \`).join('');
        }

        // Display health
        const healthList = document.getElementById('healthList');
        healthList.innerHTML = health.components.map(c => \`
          <li>
            <span>\${c.name}</span>
            <span class="badge \${c.status === 'healthy' ? 'running' : 'unhealthy'}">\${c.status}</span>
          </li>
        \`).join('');

      } catch (error) {
        console.error('Error refreshing:', error);
        document.getElementById('daemonStatus').className = 'status unhealthy';
        document.getElementById('daemonStatus').textContent = '● Disconnected';
        document.getElementById('agentsList').innerHTML =
          \`<li class="empty">Error: \${error.message}</li>\`;
      }
    }

    function connectWebSocket() {
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => console.log('WebSocket connected');
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'agent.update' || data.type === 'task.update') {
            refresh();
          }
        };
        ws.onclose = () => {
          console.log('WebSocket disconnected, reconnecting...');
          setTimeout(connectWebSocket, 5000);
        };
      } catch (error) {
        console.error('WebSocket error:', error);
      }
    }

    // Initial load
    refresh();
    // connectWebSocket(); // Uncomment when WebSocket endpoint is ready

    // Auto-refresh every 5 seconds
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}
