import * as vscode from 'vscode';
export class DashboardViewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.state = {
            agents: [],
            activePipelines: [],
            taskQueue: [],
            teams: [],
            orgUnits: [],
            guilds: [],
            agentMessages: [],
            agentProfiles: [],
            teamTemplates: [],
            lastUpdated: Date.now()
        };
        this._onAction = new vscode.EventEmitter();
        this.onAction = this._onAction.event;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('tmux-agents-dashboard', 'Agent Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.getHtml(this.panel.webview);
        this.panel.webview.onDidReceiveMessage(msg => {
            this._onAction.fire({ action: msg.type, payload: msg });
        });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.stopAutoRefresh();
        });
        // Send current state after panel is ready
        setTimeout(() => {
            this.sendState();
        }, 100);
    }
    updateState(state) {
        this.state = state;
        this.sendState();
    }
    updateAgent(agent, recentOutput) {
        this.panel?.webview.postMessage({
            type: 'updateAgent',
            agentId: agent.id,
            agent,
            recentOutput
        });
    }
    startAutoRefresh(intervalMs) {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            this._onAction.fire({ action: 'refresh', payload: { type: 'refresh' } });
        }, intervalMs);
    }
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }
    dispose() {
        this.stopAutoRefresh();
        this._onAction.dispose();
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
    sendState() {
        this.panel?.webview.postMessage({
            type: 'updateState',
            state: this.state
        });
    }
    getHtml(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
/* ── Reset & Base ─────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    height: 100%;
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow-x: hidden;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground);
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
#app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

/* ── Header Bar ───────────────────────────────────────────────────────────── */
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
    gap: 16px;
    flex-wrap: wrap;
}
.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}
.header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
}
.header-title .icon-robot {
    font-size: 20px;
    opacity: 0.85;
}
.header-stats {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
}
.stat-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    white-space: nowrap;
}
.stat-chip .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
.stat-chip .dot.total { background: var(--vscode-foreground); opacity: 0.5; }
.stat-chip .dot.active { background: #4ec9b0; }
.stat-chip .dot.idle { background: #808080; }
.stat-chip .dot.error { background: #f44747; }
.header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
}
.btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1));
}
.btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}
.btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
}
.btn:disabled {
    opacity: 0.4;
    cursor: default;
}
.auto-refresh-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
    padding: 4px 8px;
    border-radius: 4px;
}
.auto-refresh-toggle:hover {
    background: rgba(255,255,255,0.05);
}
.toggle-track {
    width: 28px;
    height: 14px;
    border-radius: 7px;
    background: rgba(255,255,255,0.15);
    position: relative;
    transition: background 0.2s;
}
.toggle-track.on {
    background: var(--vscode-button-background);
}
.toggle-knob {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--vscode-foreground);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 0.2s;
}
.toggle-track.on .toggle-knob {
    left: 16px;
}

/* ── Main Content ─────────────────────────────────────────────────────────── */
.main-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

/* ── Section Headers ──────────────────────────────────────────────────────── */
section {
    margin-bottom: 8px;
}
.section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: default;
}
.section-header.collapsible {
    cursor: pointer;
    user-select: none;
}
.section-header.collapsible:hover {
    opacity: 0.85;
}
.section-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
}
.section-count {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
}
.collapse-icon {
    font-size: 10px;
    opacity: 0.5;
    transition: transform 0.2s;
}
.collapse-icon.collapsed {
    transform: rotate(-90deg);
}
.section-body.collapsed {
    display: none;
}

/* ── Agent Grid ───────────────────────────────────────────────────────────── */
.agent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
}
.agent-card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s, box-shadow 0.2s;
    position: relative;
    overflow: hidden;
}
.agent-card:hover {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.agent-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 8px 8px 0 0;
}
.agent-card[data-role="coder"]::before { background: #569cd6; }
.agent-card[data-role="reviewer"]::before { background: #c586c0; }
.agent-card[data-role="tester"]::before { background: #4ec9b0; }
.agent-card[data-role="devops"]::before { background: #ce9178; }
.agent-card[data-role="researcher"]::before { background: #4fc1ff; }
.agent-card[data-role="custom"]::before { background: #d4d4d4; }

.agent-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.agent-name-area {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
}
.agent-state-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
}
.agent-state-dot.working {
    background: #4ec9b0;
    animation: pulse-green 1.5s ease-in-out infinite;
}
.agent-state-dot.idle {
    background: #808080;
}
.agent-state-dot.error {
    background: #f44747;
    animation: pulse-red 1s ease-in-out infinite;
}
.agent-state-dot.spawning {
    background: #dcdcaa;
    animation: pulse-yellow 1.2s ease-in-out infinite;
}
.agent-state-dot.completed {
    background: #4ec9b0;
}
.agent-state-dot.terminated {
    background: #555;
}
@keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 0 0 rgba(78,201,176,0.5); }
    50% { box-shadow: 0 0 0 5px rgba(78,201,176,0); }
}
@keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(244,71,71,0.5); }
    50% { box-shadow: 0 0 0 5px rgba(244,71,71,0); }
}
@keyframes pulse-yellow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(220,220,170,0.4); }
    50% { box-shadow: 0 0 0 5px rgba(220,220,170,0); }
}

.agent-name {
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.role-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
    flex-shrink: 0;
}
.role-badge.coder { background: rgba(86,156,214,0.2); color: #569cd6; }
.role-badge.reviewer { background: rgba(197,134,192,0.2); color: #c586c0; }
.role-badge.tester { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.role-badge.devops { background: rgba(206,145,120,0.2); color: #ce9178; }
.role-badge.researcher { background: rgba(79,193,255,0.2); color: #4fc1ff; }
.role-badge.custom { background: rgba(212,212,212,0.15); color: #d4d4d4; }

.provider-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 500;
    background: rgba(255,255,255,0.06);
    white-space: nowrap;
    flex-shrink: 0;
}
.provider-badge.claude { color: #d4a574; }
.provider-badge.gemini { color: #8ab4f8; }
.provider-badge.codex { color: #4ec9b0; }

.agent-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    opacity: 0.65;
    flex-wrap: wrap;
}
.agent-meta-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
}
.team-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    background: rgba(86,156,214,0.15);
    color: var(--vscode-foreground);
    opacity: 0.7;
    white-space: nowrap;
}

.agent-task {
    font-size: 11px;
    color: var(--vscode-foreground);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 0;
    border-top: 1px solid var(--vscode-panel-border);
}
.agent-task .task-label {
    opacity: 0.5;
    margin-right: 4px;
}

.agent-output {
    background: var(--vscode-terminal-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
    font-size: 11px;
    line-height: 1.45;
    max-height: 60px;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--vscode-terminal-foreground, var(--vscode-foreground));
    opacity: 0.8;
}
.agent-output:empty::after {
    content: 'No output yet';
    opacity: 0.35;
    font-style: italic;
}

.agent-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
}
.agent-actions .btn {
    padding: 3px 8px;
    font-size: 11px;
}
.btn.danger {
    color: #f44747;
}
.btn.danger:hover {
    background: rgba(244,71,71,0.12);
}

/* ── Inline Prompt Input ──────────────────────────────────────────────────── */
.inline-prompt {
    display: none;
    gap: 4px;
    align-items: center;
    width: 100%;
}
.inline-prompt.active {
    display: flex;
}
.inline-prompt input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-size: 11px;
    font-family: inherit;
    outline: none;
    min-width: 0;
}
.inline-prompt input:focus {
    border-color: var(--vscode-focusBorder);
}
.inline-prompt .btn {
    padding: 3px 8px;
    font-size: 11px;
}

/* ── Pipeline Section ─────────────────────────────────────────────────────── */
.pipeline-card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 10px;
}
.pipeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
}
.pipeline-name {
    font-weight: 600;
    font-size: 13px;
}
.status-badge {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}
.status-badge.running { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.status-badge.paused { background: rgba(220,220,170,0.2); color: #dcdcaa; }
.status-badge.completed { background: rgba(78,201,176,0.15); color: #4ec9b0; }
.status-badge.failed { background: rgba(244,71,71,0.2); color: #f44747; }
.status-badge.draft { background: rgba(128,128,128,0.2); color: #808080; }
.status-badge.pending { background: rgba(128,128,128,0.15); color: #999; }
.status-badge.assigned { background: rgba(86,156,214,0.2); color: #569cd6; }
.status-badge.in_progress { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.status-badge.cancelled { background: rgba(128,128,128,0.2); color: #808080; }

.pipeline-stages {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 8px 0;
    overflow-x: auto;
}
.pipeline-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 80px;
}
.stage-dot-area {
    display: flex;
    align-items: center;
}
.stage-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    position: relative;
    z-index: 1;
    transition: background 0.3s, border-color 0.3s;
}
.stage-dot.pending {
    background: transparent;
    border-color: #555;
    color: #555;
}
.stage-dot.in_progress, .stage-dot.assigned {
    background: rgba(86,156,214,0.3);
    border-color: #569cd6;
    color: #569cd6;
    animation: pulse-stage 1.5s ease-in-out infinite;
}
@keyframes pulse-stage {
    0%, 100% { box-shadow: 0 0 0 0 rgba(86,156,214,0.4); }
    50% { box-shadow: 0 0 0 4px rgba(86,156,214,0); }
}
.stage-dot.completed {
    background: rgba(78,201,176,0.3);
    border-color: #4ec9b0;
    color: #4ec9b0;
}
.stage-dot.failed {
    background: rgba(244,71,71,0.3);
    border-color: #f44747;
    color: #f44747;
}
.stage-connector {
    width: 40px;
    height: 2px;
    background: #555;
    flex-shrink: 0;
    transition: background 0.3s;
}
.stage-connector.completed {
    background: #4ec9b0;
}
.stage-connector.in_progress {
    background: linear-gradient(90deg, #4ec9b0, #569cd6);
}
.stage-label {
    font-size: 10px;
    opacity: 0.6;
    text-align: center;
    max-width: 90px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pipeline-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
}

/* ── Task Queue Table ─────────────────────────────────────────────────────── */
.task-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
.task-table th {
    text-align: left;
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    opacity: 0.5;
    border-bottom: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
}
.task-table td {
    padding: 7px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    vertical-align: middle;
}
.task-table tr:last-child td {
    border-bottom: none;
}
.task-table tr:hover td {
    background: rgba(255,255,255,0.03);
}
.btn-attach, .btn-detach {
    background: none;
    border: 1px solid var(--vscode-button-secondaryBackground, #333);
    color: var(--vscode-button-secondaryForeground, #ccc);
    padding: 4px 6px;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
}
.btn-attach:hover, .btn-detach:hover {
    background: var(--vscode-button-secondaryHoverBackground, #444);
}
.btn-detach {
    border-color: var(--vscode-statusBarItem-errorBackground, #c33);
    color: var(--vscode-statusBarItem-errorBackground, #c33);
}
.btn-attach .attach-icon, .btn-detach .detach-icon {
    width: 12px;
    height: 12px;
    vertical-align: middle;
}
.task-desc {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.priority-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
}
.priority-indicator.high { background: rgba(244,71,71,0.2); color: #f44747; }
.priority-indicator.medium { background: rgba(220,220,170,0.2); color: #dcdcaa; }
.priority-indicator.low { background: rgba(128,128,128,0.15); color: #999; }

/* ── Teams Section ────────────────────────────────────────────────────────── */
.team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
}
.team-card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.2s;
}
.team-card:hover {
    border-color: var(--vscode-focusBorder);
}
.team-card-name {
    font-weight: 600;
    font-size: 13px;
}
.team-card-desc {
    font-size: 11px;
    opacity: 0.6;
}
.team-card-meta {
    font-size: 11px;
    opacity: 0.5;
    display: flex;
    gap: 12px;
}

/* ── Empty State ──────────────────────────────────────────────────────────── */
.empty-state {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 12px 12px;
    text-align: center;
    opacity: 0.4;
    gap: 8px;
}
.empty-state .icon {
    font-size: 18px;
}
.empty-state .title {
    font-size: 12px;
    font-weight: 600;
}
.empty-state .desc {
    font-size: 11px;
    display: none;
}

/* ── Spinner (for spawning state) ─────────────────────────────────────────── */
@keyframes spin {
    to { transform: rotate(360deg); }
}
.spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid rgba(220,220,170,0.3);
    border-top-color: #dcdcaa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
}

/* ── Timestamp ────────────────────────────────────────────────────────────── */
.last-updated {
    font-size: 10px;
    opacity: 0.35;
    text-align: right;
    padding: 4px 0;
    flex-shrink: 0;
}

/* ── Agent Persona Display ───────────────────────────────────────────── */
.persona-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
.persona-tag {
    display: inline-block; padding: 1px 6px; border-radius: 10px;
    font-size: 9px; font-weight: 500;
    background: rgba(255,255,255,0.06); color: var(--vscode-foreground); opacity: 0.7;
}
.persona-tag.skill-junior { border-left: 2px solid #808080; }
.persona-tag.skill-mid { border-left: 2px solid #4ec9b0; }
.persona-tag.skill-senior { border-left: 2px solid #569cd6; }
.persona-tag.skill-principal { border-left: 2px solid #c586c0; }
.agent-avatar {
    width: 28px; height: 28px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 13px;
    font-weight: 700; flex-shrink: 0;
    background: rgba(86,156,214,0.2); color: #569cd6;
}

/* ── Org Chart ───────────────────────────────────────────────────────── */
.org-tree { padding: 8px 0; }
.org-node {
    margin-left: 20px; padding: 6px 10px; border-left: 2px solid var(--vscode-panel-border);
    margin-bottom: 4px;
}
.org-node.root { margin-left: 0; border-left: 3px solid #569cd6; }
.org-node.department { border-left-color: #c586c0; }
.org-node.squad { border-left-color: #4ec9b0; }
.org-node-header {
    display: flex; align-items: center; gap: 8px; cursor: pointer;
}
.org-node-name { font-weight: 600; font-size: 12px; }
.org-node-type {
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    background: rgba(255,255,255,0.06); text-transform: uppercase;
    letter-spacing: 0.3px; opacity: 0.6;
}
.org-node-meta { font-size: 11px; opacity: 0.5; margin-top: 2px; }
.org-node-members { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.org-member-chip {
    display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px;
    border-radius: 3px; font-size: 10px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
}
.org-member-chip.lead { border: 1px solid #dcdcaa; }
.org-lead-icon { font-size: 10px; }

/* ── Guild Cards ─────────────────────────────────────────────────────── */
.guild-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;
}
.guild-card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-panel-border); border-radius: 8px;
    padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
    transition: border-color 0.2s;
}
.guild-card:hover { border-color: var(--vscode-focusBorder); }
.guild-card-header { display: flex; align-items: center; justify-content: space-between; }
.guild-card-name { font-weight: 600; font-size: 13px; }
.guild-expertise {
    font-size: 10px; padding: 1px 7px; border-radius: 10px;
    background: rgba(78,201,176,0.15); color: #4ec9b0;
}
.guild-card-stats { font-size: 11px; opacity: 0.5; display: flex; gap: 12px; }
.guild-knowledge-list { font-size: 11px; max-height: 60px; overflow: hidden; }
.guild-knowledge-item { padding: 1px 0; opacity: 0.7; }
.guild-knowledge-item::before { content: '\\2022 '; opacity: 0.4; }

/* ── Agent Profiles & Leaderboard ────────────────────────────────────── */
.leaderboard-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.leaderboard-table th {
    text-align: left; padding: 6px 10px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.5;
    border-bottom: 1px solid var(--vscode-panel-border); white-space: nowrap;
}
.leaderboard-table td {
    padding: 7px 10px; border-bottom: 1px solid var(--vscode-panel-border);
    vertical-align: middle;
}
.leaderboard-table tr:hover td { background: rgba(255,255,255,0.03); }
.leaderboard-rank {
    width: 28px; height: 28px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 12px;
    font-weight: 700; background: rgba(255,255,255,0.06);
}
.leaderboard-rank.gold { background: rgba(255,215,0,0.2); color: #ffd700; }
.leaderboard-rank.silver { background: rgba(192,192,192,0.2); color: #c0c0c0; }
.leaderboard-rank.bronze { background: rgba(205,127,50,0.2); color: #cd7f32; }
.success-bar {
    height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06);
    overflow: hidden; width: 80px;
}
.success-bar-fill { height: 100%; border-radius: 3px; background: #4ec9b0; }
.badge-chip {
    display: inline-block; padding: 1px 6px; border-radius: 10px;
    font-size: 9px; font-weight: 500; margin-right: 3px;
    background: rgba(220,220,170,0.15); color: #dcdcaa;
}

/* ── Team Composer ───────────────────────────────────────────────────── */
.team-template-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;
}
.team-template-card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-panel-border); border-radius: 8px;
    padding: 12px 14px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s;
}
.team-template-card:hover {
    border-color: var(--vscode-focusBorder); box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.team-template-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.team-template-desc { font-size: 11px; opacity: 0.6; margin-bottom: 8px; }
.team-template-slots { display: flex; gap: 4px; flex-wrap: wrap; }
.slot-chip {
    display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px;
    border-radius: 3px; font-size: 10px; font-weight: 500;
    background: rgba(255,255,255,0.06);
}

/* ── Agent Messages ──────────────────────────────────────────────────── */
.message-feed { max-height: 300px; overflow-y: auto; }
.msg-item {
    display: flex; gap: 8px; padding: 6px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.msg-item:last-child { border-bottom: none; }
.msg-avatar {
    width: 24px; height: 24px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 10px;
    font-weight: 700; flex-shrink: 0;
    background: rgba(86,156,214,0.2); color: #569cd6;
}
.msg-body { flex: 1; min-width: 0; }
.msg-header { display: flex; align-items: baseline; gap: 6px; font-size: 11px; }
.msg-sender { font-weight: 600; }
.msg-arrow { opacity: 0.4; }
.msg-recipient { opacity: 0.7; }
.msg-time { opacity: 0.4; font-size: 10px; margin-left: auto; }
.msg-content { font-size: 12px; opacity: 0.85; margin-top: 2px; word-break: break-word; }
.msg-unread { background: rgba(86,156,214,0.05); border-radius: 4px; padding: 4px 6px; }

/* ── Send Message Panel ──────────────────────────────────────────────── */
.send-msg-panel {
    display: flex; gap: 6px; padding: 8px 0; align-items: center;
}
.send-msg-panel select {
    padding: 4px 6px; border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; font-size: 11px;
}
.send-msg-panel input {
    flex: 1; padding: 4px 8px; border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; font-size: 11px; font-family: inherit; outline: none;
}
.send-msg-panel input:focus { border-color: var(--vscode-focusBorder); }
</style>
</head>
<body>
<div id="app">
    <!-- Header -->
    <div class="header">
        <div class="header-left">
            <div class="header-title">
                <span class="icon-robot">&#x1F916;</span>
                <span>Agent Dashboard</span>
            </div>
            <div class="header-stats" id="header-stats">
                <span class="stat-chip"><span class="dot total"></span><span id="stat-total">0</span> Total</span>
                <span class="stat-chip"><span class="dot active"></span><span id="stat-active">0</span> Active</span>
                <span class="stat-chip"><span class="dot idle"></span><span id="stat-idle">0</span> Idle</span>
                <span class="stat-chip"><span class="dot error"></span><span id="stat-error">0</span> Error</span>
            </div>
        </div>
        <div class="header-right">
            <label class="auto-refresh-toggle" id="auto-refresh-toggle" title="Auto-refresh every 3 seconds">
                <div class="toggle-track" id="toggle-track">
                    <div class="toggle-knob"></div>
                </div>
                <span>Auto-refresh</span>
            </label>
            <button class="btn" id="btn-chat" title="Open AI Chat">&#x1F4AC; AI Chat</button>
            <button class="btn" id="btn-refresh" title="Refresh now">&#x21BB; Refresh</button>
            <button class="btn primary" id="btn-new-agent">+ Agent</button>
            <button class="btn primary" id="btn-new-team">+ Team</button>
        </div>
    </div>

    <!-- Main Scrollable Content -->
    <div class="main-content" id="main-content">

        <!-- Agent Grid Section -->
        <section id="section-agents">
            <div class="section-header">
                <span class="section-title">Agents</span>
                <span class="section-count" id="agent-count">0</span>
            </div>
            <div class="agent-grid" id="agent-grid">
                <div class="empty-state" id="agents-empty">
                    <div class="icon">&#x1F916;</div>
                    <div class="title">No Agents Running</div>
                    <div class="desc">Click "+ Agent" to spawn your first agent</div>
                </div>
            </div>
        </section>

        <!-- Pipeline Section -->
        <section id="section-pipelines">
            <div class="section-header">
                <span class="section-title">Pipelines</span>
                <span class="section-count" id="pipeline-count">0</span>
            </div>
            <div id="pipeline-list"></div>
        </section>

        <!-- Task Queue Section (Collapsible) -->
        <section id="section-tasks">
            <div class="section-header collapsible" id="tasks-header">
                <span class="collapse-icon" id="tasks-collapse-icon">&#x25BC;</span>
                <span class="section-title">Task Queue</span>
                <span class="section-count" id="task-count">0</span>
            </div>
            <div class="section-body" id="tasks-body">
                <div id="task-table-container"></div>
            </div>
        </section>

        <!-- Teams Section (Collapsible) -->
        <section id="section-teams">
            <div class="section-header collapsible" id="teams-header">
                <span class="collapse-icon" id="teams-collapse-icon">&#x25BC;</span>
                <span class="section-title">Teams</span>
                <span class="section-count" id="team-count">0</span>
            </div>
            <div class="section-body" id="teams-body">
                <div class="team-grid" id="team-grid"></div>
            </div>
        </section>

        <!-- Org Chart Section (Collapsible) -->
        <section id="section-org">
            <div class="section-header collapsible" id="org-header">
                <span class="collapse-icon" id="org-collapse-icon">&#x25BC;</span>
                <span class="section-title">Organization</span>
                <span class="section-count" id="org-count">0</span>
            </div>
            <div class="section-body" id="org-body">
                <div class="org-tree" id="org-tree"></div>
            </div>
        </section>

        <!-- Guilds Section (Collapsible) -->
        <section id="section-guilds">
            <div class="section-header collapsible" id="guilds-header">
                <span class="collapse-icon" id="guilds-collapse-icon">&#x25BC;</span>
                <span class="section-title">Guilds</span>
                <span class="section-count" id="guild-count">0</span>
            </div>
            <div class="section-body" id="guilds-body">
                <div class="guild-grid" id="guild-grid"></div>
            </div>
        </section>

        <!-- Leaderboard Section (Collapsible) -->
        <section id="section-leaderboard">
            <div class="section-header collapsible" id="leaderboard-header">
                <span class="collapse-icon" id="leaderboard-collapse-icon">&#x25BC;</span>
                <span class="section-title">Agent Leaderboard</span>
                <span class="section-count" id="leaderboard-count">0</span>
            </div>
            <div class="section-body" id="leaderboard-body">
                <div id="leaderboard-container"></div>
            </div>
        </section>

        <!-- Team Composer Section (Collapsible) -->
        <section id="section-composer">
            <div class="section-header collapsible" id="composer-header">
                <span class="collapse-icon" id="composer-collapse-icon">&#x25BC;</span>
                <span class="section-title">Team Composer</span>
            </div>
            <div class="section-body" id="composer-body">
                <div class="team-template-grid" id="team-template-grid"></div>
            </div>
        </section>

        <!-- Agent Messages Section (Collapsible) -->
        <section id="section-messages">
            <div class="section-header collapsible" id="messages-header">
                <span class="collapse-icon" id="messages-collapse-icon">&#x25BC;</span>
                <span class="section-title">Agent Messages</span>
                <span class="section-count" id="messages-count">0</span>
            </div>
            <div class="section-body" id="messages-body">
                <div class="send-msg-panel" id="send-msg-panel">
                    <select id="msg-from-select" title="From agent"></select>
                    <span style="opacity:0.4">&#x2192;</span>
                    <select id="msg-to-select" title="To agent"></select>
                    <input type="text" id="msg-input" placeholder="Type a message..." />
                    <button class="btn primary" id="btn-send-msg">Send</button>
                </div>
                <div class="message-feed" id="message-feed"></div>
            </div>
        </section>

        <!-- Last Updated -->
        <div class="last-updated" id="last-updated"></div>
    </div>
</div>

<script>
(function() {
    const vscode = acquireVsCodeApi();

    // ── State ────────────────────────────────────────────────────────────────
    let currentState = null;
    let autoRefreshOn = false;
    var attachedTasks = {};

    // ── DOM Refs ─────────────────────────────────────────────────────────────
    const agentGrid = document.getElementById('agent-grid');
    const agentsEmpty = document.getElementById('agents-empty');
    const agentCountEl = document.getElementById('agent-count');
    const pipelineList = document.getElementById('pipeline-list');
    const pipelineCountEl = document.getElementById('pipeline-count');
    const taskTableContainer = document.getElementById('task-table-container');
    const taskCountEl = document.getElementById('task-count');
    const teamGrid = document.getElementById('team-grid');
    const teamCountEl = document.getElementById('team-count');
    const lastUpdatedEl = document.getElementById('last-updated');
    const statTotal = document.getElementById('stat-total');
    const statActive = document.getElementById('stat-active');
    const statIdle = document.getElementById('stat-idle');
    const statError = document.getElementById('stat-error');
    const toggleTrack = document.getElementById('toggle-track');

    // New DOM refs
    var orgTree = document.getElementById('org-tree');
    var orgCountEl = document.getElementById('org-count');
    var guildGrid = document.getElementById('guild-grid');
    var guildCountEl = document.getElementById('guild-count');
    var leaderboardContainer = document.getElementById('leaderboard-container');
    var leaderboardCountEl = document.getElementById('leaderboard-count');
    var teamTemplateGrid = document.getElementById('team-template-grid');
    var messageFeed = document.getElementById('message-feed');
    var messagesCountEl = document.getElementById('messages-count');
    var msgFromSelect = document.getElementById('msg-from-select');
    var msgToSelect = document.getElementById('msg-to-select');
    var msgInput = document.getElementById('msg-input');

    // ── Utility ──────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '...' : str;
    }

    function timeAgo(ts) {
        if (!ts) return '';
        var delta = Math.floor((Date.now() - ts) / 1000);
        if (delta < 5) return 'just now';
        if (delta < 60) return delta + 's ago';
        if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
        return Math.floor(delta / 3600) + 'h ago';
    }

    function last3Lines(text) {
        if (!text) return '';
        var lines = text.split('\\n').filter(function(l) { return l.trim() !== ''; });
        return lines.slice(-3).join('\\n');
    }

    function getProviderLabel(provider) {
        switch (provider) {
            case 'claude': return '&#x2728; Claude';
            case 'gemini': return '&#x1F48E; Gemini';
            case 'codex': return '&#x1F4BB; Codex';
            default: return provider || 'Unknown';
        }
    }

    function getPriorityClass(priority) {
        if (priority >= 8) return 'high';
        if (priority >= 4) return 'medium';
        return 'low';
    }

    function getTeamNameById(teamId) {
        if (!currentState || !currentState.teams || !teamId) return null;
        for (var i = 0; i < currentState.teams.length; i++) {
            if (currentState.teams[i].id === teamId) return currentState.teams[i].name;
        }
        return null;
    }

    function getTaskDescById(taskId) {
        if (!currentState || !currentState.taskQueue || !taskId) return null;
        for (var i = 0; i < currentState.taskQueue.length; i++) {
            if (currentState.taskQueue[i].id === taskId) return currentState.taskQueue[i].description;
        }
        return null;
    }

    // ── Header Stats ─────────────────────────────────────────────────────────
    function updateStats(agents) {
        var total = agents.length;
        var active = 0, idle = 0, error = 0;
        for (var i = 0; i < agents.length; i++) {
            var st = agents[i].agent.state;
            if (st === 'working' || st === 'spawning') active++;
            else if (st === 'idle' || st === 'completed') idle++;
            else if (st === 'error') error++;
        }
        statTotal.textContent = total;
        statActive.textContent = active;
        statIdle.textContent = idle;
        statError.textContent = error;
    }

    // ── Agent Card Rendering ─────────────────────────────────────────────────
    function buildAgentCard(agentView) {
        var agent = agentView.agent;
        var output = agentView.recentOutput || '';
        var stateClass = agent.state || 'idle';
        var teamName = getTeamNameById(agent.teamId);
        var taskDesc = getTaskDescById(agent.currentTaskId);

        var card = document.createElement('div');
        card.className = 'agent-card';
        card.dataset.agentId = agent.id;
        card.dataset.role = agent.role || 'custom';

        // State indicator: use spinner for spawning, dot otherwise
        var stateIndicator;
        if (stateClass === 'spawning') {
            stateIndicator = '<div class="spinner"></div>';
        } else {
            stateIndicator = '<div class="agent-state-dot ' + escapeHtml(stateClass) + '"></div>';
        }

        var html = '';
        // Header row
        html += '<div class="agent-card-header">';
        html += '  <div class="agent-name-area">';
        html += '    ' + stateIndicator;
        html += '    <span class="agent-name">' + escapeHtml(agent.name) + '</span>';
        html += '    <span class="role-badge ' + escapeHtml(agent.role || 'custom') + '">' + escapeHtml(agent.role || 'custom') + '</span>';
        html += '  </div>';
        html += '  <span class="provider-badge ' + escapeHtml(agent.aiProvider || '') + '">' + getProviderLabel(agent.aiProvider) + '</span>';
        html += '</div>';

        // Meta row
        html += '<div class="agent-meta">';
        html += '  <span class="agent-meta-item" title="Server">&#x1F5A5; ' + escapeHtml(agent.serverId || 'local') + '</span>';
        html += '  <span class="agent-meta-item" title="Session">' + escapeHtml(agent.sessionName || '') + ':' + escapeHtml(agent.windowIndex || '') + '.' + escapeHtml(agent.paneIndex || '') + '</span>';
        html += '  <span class="agent-meta-item" title="Last activity">' + timeAgo(agent.lastActivityAt) + '</span>';
        if (teamName) {
            html += '  <span class="team-badge" title="Team">' + escapeHtml(teamName) + '</span>';
        }
        html += '</div>';

        // Persona tags
        html += buildPersonaTags(agent);

        // Task
        if (taskDesc) {
            html += '<div class="agent-task"><span class="task-label">Task:</span>' + escapeHtml(truncate(taskDesc, 80)) + '</div>';
        }

        // Error message
        if (agent.state === 'error' && agent.errorMessage) {
            html += '<div class="agent-task" style="color: #f44747; opacity: 1;"><span class="task-label">Error:</span>' + escapeHtml(truncate(agent.errorMessage, 100)) + '</div>';
        }

        // Output preview
        html += '<div class="agent-output" id="output-' + escapeHtml(agent.id) + '">' + escapeHtml(last3Lines(output)) + '</div>';

        // Actions
        html += '<div class="agent-actions">';
        html += '  <button class="btn" data-action="prompt" data-agent-id="' + escapeHtml(agent.id) + '">&#x1F4AC; Send Prompt</button>';
        if (agent.state === 'working') {
            html += '  <button class="btn" data-action="pause" data-agent-id="' + escapeHtml(agent.id) + '">&#x23F8; Pause</button>';
        }
        html += '  <button class="btn danger" data-action="kill" data-agent-id="' + escapeHtml(agent.id) + '">&#x2716; Kill</button>';
        html += '</div>';

        // Inline prompt
        html += '<div class="inline-prompt" id="prompt-area-' + escapeHtml(agent.id) + '">';
        html += '  <input type="text" placeholder="Enter prompt..." id="prompt-input-' + escapeHtml(agent.id) + '" />';
        html += '  <button class="btn primary" data-action="send-prompt" data-agent-id="' + escapeHtml(agent.id) + '">Send</button>';
        html += '  <button class="btn" data-action="cancel-prompt" data-agent-id="' + escapeHtml(agent.id) + '">Cancel</button>';
        html += '</div>';

        card.innerHTML = html;
        return card;
    }

    function renderAgentGrid(agents) {
        agentCountEl.textContent = agents.length;

        if (agents.length === 0) {
            agentGrid.innerHTML = '';
            agentGrid.appendChild(agentsEmpty.cloneNode ? createEmptyState('agents') : agentsEmpty);
            return;
        }

        // Build new content
        var fragment = document.createDocumentFragment();
        for (var i = 0; i < agents.length; i++) {
            fragment.appendChild(buildAgentCard(agents[i]));
        }
        agentGrid.innerHTML = '';
        agentGrid.appendChild(fragment);
    }

    function createEmptyState(section) {
        var div = document.createElement('div');
        div.className = 'empty-state';
        if (section === 'agents') {
            div.innerHTML = '<div class="icon">&#x1F916;</div><div class="title">No Agents Running</div><div class="desc">Click "+ Agent" to spawn your first agent</div>';
        }
        return div;
    }

    // Update a single agent card in-place
    function updateSingleAgent(agentId, agent, recentOutput) {
        if (!currentState) return;

        // Update state
        var found = false;
        for (var i = 0; i < currentState.agents.length; i++) {
            if (currentState.agents[i].agent.id === agentId) {
                currentState.agents[i].agent = agent;
                currentState.agents[i].recentOutput = recentOutput;
                found = true;
                break;
            }
        }
        if (!found) {
            currentState.agents.push({ agent: agent, recentOutput: recentOutput });
        }

        // Try to update DOM in-place
        var existing = agentGrid.querySelector('[data-agent-id="' + agentId + '"]');
        if (existing) {
            var newCard = buildAgentCard({ agent: agent, recentOutput: recentOutput });
            existing.replaceWith(newCard);
        } else {
            // Full re-render
            renderAgentGrid(currentState.agents);
        }

        updateStats(currentState.agents);
    }

    // ── Pipeline Rendering ───────────────────────────────────────────────────
    function renderPipelines(pipelines) {
        pipelineCountEl.textContent = pipelines.length;

        if (pipelines.length === 0) {
            pipelineList.innerHTML = '<div class="empty-state"><div class="icon">&#x1F504;</div><div class="title">No Active Pipelines</div><div class="desc">Pipelines will appear here when running</div></div>';
            return;
        }

        var html = '';
        for (var p = 0; p < pipelines.length; p++) {
            var run = pipelines[p];
            var statusClass = (run.status || 'draft').toLowerCase();

            html += '<div class="pipeline-card" data-run-id="' + escapeHtml(run.id) + '">';
            html += '  <div class="pipeline-header">';
            html += '    <span class="pipeline-name">Pipeline: ' + escapeHtml(run.pipelineId || run.id) + '</span>';
            html += '    <span class="status-badge ' + statusClass + '">' + escapeHtml(run.status || 'draft') + '</span>';
            html += '  </div>';

            // Stages visualization
            var stageIds = run.stageResults ? Object.keys(run.stageResults) : [];
            if (stageIds.length > 0) {
                html += '  <div class="pipeline-stages">';
                for (var s = 0; s < stageIds.length; s++) {
                    var stageId = stageIds[s];
                    var result = run.stageResults[stageId];
                    var stageStatus = (result.status || 'pending').toLowerCase();
                    // Connector before (except first)
                    if (s > 0) {
                        var connClass = '';
                        var prevResult = run.stageResults[stageIds[s - 1]];
                        var prevStatus = (prevResult.status || 'pending').toLowerCase();
                        if (prevStatus === 'completed') connClass = 'completed';
                        else if (stageStatus === 'in_progress' || stageStatus === 'assigned') connClass = 'in_progress';
                        html += '<div class="stage-connector ' + connClass + '"></div>';
                    }
                    html += '<div class="pipeline-stage">';
                    html += '  <div class="stage-dot-area">';
                    var dotIcon = '';
                    if (stageStatus === 'completed') dotIcon = '&#x2713;';
                    else if (stageStatus === 'failed') dotIcon = '&#x2717;';
                    else if (stageStatus === 'in_progress' || stageStatus === 'assigned') dotIcon = '&#x25CF;';
                    html += '    <div class="stage-dot ' + stageStatus + '">' + dotIcon + '</div>';
                    html += '  </div>';
                    html += '  <span class="stage-label">' + escapeHtml(stageId) + '</span>';
                    html += '</div>';
                }
                html += '  </div>';
            }

            // Pipeline actions
            html += '  <div class="pipeline-actions">';
            if (run.status === 'running') {
                html += '    <button class="btn" data-action="pause-pipeline" data-run-id="' + escapeHtml(run.id) + '">&#x23F8; Pause</button>';
            } else if (run.status === 'paused') {
                html += '    <button class="btn primary" data-action="resume-pipeline" data-run-id="' + escapeHtml(run.id) + '">&#x25B6; Resume</button>';
            }
            html += '  </div>';
            html += '</div>';
        }

        pipelineList.innerHTML = html;
    }

    // ── Task Queue Rendering ─────────────────────────────────────────────────
    function renderTaskQueue(tasks) {
        taskCountEl.textContent = tasks.length;

        if (tasks.length === 0) {
            taskTableContainer.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4CB;</div><div class="title">Task Queue Empty</div><div class="desc">Submit tasks to be distributed to agents</div></div>';
            return;
        }

        var html = '<table class="task-table">';
        html += '<thead><tr>';
        html += '<th>Priority</th><th>Description</th><th>Role</th><th>Status</th><th>Assigned</th><th></th>';
        html += '</tr></thead><tbody>';

        // Sort by priority descending
        var sorted = tasks.slice().sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); });

        for (var t = 0; t < sorted.length; t++) {
            var task = sorted[t];
            var priClass = getPriorityClass(task.priority || 0);
            var statusClass = (task.status || 'pending').toLowerCase();
            var agentName = '';
            if (task.assignedAgentId && currentState) {
                for (var a = 0; a < currentState.agents.length; a++) {
                    if (currentState.agents[a].agent.id === task.assignedAgentId) {
                        agentName = currentState.agents[a].agent.name;
                        break;
                    }
                }
            }

            var hasTmux = task.tmuxSessionName && task.tmuxServerId;
            var isAttached = attachedTasks[task.id] || false;
            var attachBtn = '';
            if (hasTmux) {
                var tmuxTarget = escapeHtml(task.tmuxSessionName + ':' + (task.tmuxWindowIndex || '0') + '.' + (task.tmuxPaneIndex || '0'));
                if (isAttached) {
                    attachBtn = '<button class="btn-detach" data-detach-task="' + escapeHtml(task.id) + '" title="Detach from ' + tmuxTarget + '"><svg class="detach-icon" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button>';
                } else {
                    attachBtn = '<button class="btn-attach" data-attach-task="' + escapeHtml(task.id) + '" title="Attach to ' + tmuxTarget + '"><svg class="attach-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2 L4 14 L13 8 Z"/></svg></button>';
                }
            }

            html += '<tr>';
            html += '<td><span class="priority-indicator ' + priClass + '">' + (task.priority || 0) + '</span></td>';
            html += '<td><span class="task-desc">' + escapeHtml(truncate(task.description, 50)) + '</span></td>';
            html += '<td>' + (task.targetRole ? '<span class="role-badge ' + escapeHtml(task.targetRole) + '">' + escapeHtml(task.targetRole) + '</span>' : '<span style="opacity:0.4">Any</span>') + '</td>';
            html += '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(task.status || 'pending') + '</span></td>';
            html += '<td>' + (agentName ? escapeHtml(agentName) : '<span style="opacity:0.4">--</span>') + '</td>';
            html += '<td>' + attachBtn + '</td>';
            html += '</tr>';
        }

        html += '</tbody></table>';
        taskTableContainer.innerHTML = html;
    }

    // ── Teams Rendering ──────────────────────────────────────────────────────
    function renderTeams(teams) {
        teamCountEl.textContent = teams.length;

        if (teams.length === 0) {
            teamGrid.innerHTML = '<div class="empty-state"><div class="icon">&#x1F465;</div><div class="title">No Teams</div><div class="desc">Click "+ Team" to create a team</div></div>';
            return;
        }

        var html = '';
        for (var i = 0; i < teams.length; i++) {
            var team = teams[i];
            html += '<div class="team-card">';
            html += '  <div class="team-card-name">' + escapeHtml(team.name) + '</div>';
            if (team.description) {
                html += '  <div class="team-card-desc">' + escapeHtml(team.description) + '</div>';
            }
            html += '  <div class="team-card-meta">';
            html += '    <span>&#x1F464; ' + (team.agents ? team.agents.length : 0) + ' members</span>';
            if (team.pipelineId) {
                html += '    <span>&#x1F504; Pipeline: ' + escapeHtml(team.pipelineId) + '</span>';
            }
            html += '  </div>';
            html += '</div>';
        }

        teamGrid.innerHTML = html;
    }

    // ── Persona Tags for Agent Cards ─────────────────────────────────────
    function buildPersonaTags(agent) {
        if (!agent.persona) return '';
        var p = agent.persona;
        var html = '<div class="persona-tags">';
        if (p.skillLevel) {
            html += '<span class="persona-tag skill-' + p.skillLevel + '">' + escapeHtml(p.skillLevel) + '</span>';
        }
        if (p.expertiseAreas && p.expertiseAreas.length > 0) {
            for (var i = 0; i < Math.min(p.expertiseAreas.length, 3); i++) {
                html += '<span class="persona-tag">' + escapeHtml(p.expertiseAreas[i]) + '</span>';
            }
        }
        if (p.personality) {
            html += '<span class="persona-tag">' + escapeHtml(p.personality) + '</span>';
        }
        html += '</div>';
        return html;
    }

    // ── Org Chart Rendering ──────────────────────────────────────────────
    function renderOrgChart(orgUnits) {
        orgCountEl.textContent = orgUnits.length;
        if (orgUnits.length === 0) {
            orgTree.innerHTML = '<div class="empty-state"><div class="icon">&#x1F3E2;</div><div class="title">No Organization Structure</div><div class="desc">Create departments, squads, and teams to organize agents</div></div>';
            return;
        }
        // Build tree: find roots, then render recursively
        var rootUnits = orgUnits.filter(function(u) { return !u.parentId; });
        var html = '';
        for (var i = 0; i < rootUnits.length; i++) {
            html += renderOrgNode(rootUnits[i], orgUnits, 0);
        }
        orgTree.innerHTML = html;
    }

    function renderOrgNode(unit, allUnits, depth) {
        var typeClass = unit.type === 'department' ? 'department' : unit.type === 'squad' ? 'squad' : '';
        var rootClass = depth === 0 ? ' root' : '';
        var html = '<div class="org-node ' + typeClass + rootClass + '">';
        html += '<div class="org-node-header">';
        html += '<span class="org-node-name">' + escapeHtml(unit.name) + '</span>';
        html += '<span class="org-node-type">' + escapeHtml(unit.type) + '</span>';
        html += '</div>';
        if (unit.mission) {
            html += '<div class="org-node-meta">' + escapeHtml(unit.mission) + '</div>';
        }
        if (unit.memberIds && unit.memberIds.length > 0) {
            html += '<div class="org-node-members">';
            for (var m = 0; m < unit.memberIds.length; m++) {
                var isLead = unit.leadAgentId === unit.memberIds[m];
                var agentName = getAgentNameById(unit.memberIds[m]);
                html += '<span class="org-member-chip' + (isLead ? ' lead' : '') + '">';
                if (isLead) { html += '<span class="org-lead-icon">&#x2B50;</span> '; }
                html += escapeHtml(agentName || unit.memberIds[m].slice(0, 8));
                html += '</span>';
            }
            html += '</div>';
        }
        // Render children
        var children = allUnits.filter(function(u) { return u.parentId === unit.id; });
        for (var c = 0; c < children.length; c++) {
            html += renderOrgNode(children[c], allUnits, depth + 1);
        }
        html += '</div>';
        return html;
    }

    function getAgentNameById(agentId) {
        if (!currentState || !currentState.agents) return null;
        for (var i = 0; i < currentState.agents.length; i++) {
            if (currentState.agents[i].agent.id === agentId) return currentState.agents[i].agent.name;
        }
        return null;
    }

    // ── Guild Rendering ──────────────────────────────────────────────────
    function renderGuilds(guilds) {
        guildCountEl.textContent = guilds.length;
        if (guilds.length === 0) {
            guildGrid.innerHTML = '<div class="empty-state"><div class="icon">&#x1F3DB;</div><div class="title">No Guilds</div><div class="desc">Create guilds to share knowledge between agents with similar expertise</div></div>';
            return;
        }
        var html = '';
        for (var i = 0; i < guilds.length; i++) {
            var g = guilds[i];
            html += '<div class="guild-card">';
            html += '<div class="guild-card-header">';
            html += '<span class="guild-card-name">' + escapeHtml(g.name) + '</span>';
            html += '<span class="guild-expertise">' + escapeHtml(g.expertiseArea) + '</span>';
            html += '</div>';
            html += '<div class="guild-card-stats">';
            html += '<span>&#x1F464; ' + (g.memberIds ? g.memberIds.length : 0) + ' members</span>';
            html += '<span>&#x1F4DA; ' + (g.knowledgeBase ? g.knowledgeBase.length : 0) + ' learnings</span>';
            html += '</div>';
            if (g.knowledgeBase && g.knowledgeBase.length > 0) {
                html += '<div class="guild-knowledge-list">';
                var limit = Math.min(g.knowledgeBase.length, 3);
                for (var k = 0; k < limit; k++) {
                    html += '<div class="guild-knowledge-item">' + escapeHtml(truncate(g.knowledgeBase[k].summary, 80)) + '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
        }
        guildGrid.innerHTML = html;
    }

    // ── Leaderboard Rendering ────────────────────────────────────────────
    function renderLeaderboard(profiles) {
        leaderboardCountEl.textContent = profiles.length;
        if (profiles.length === 0) {
            leaderboardContainer.innerHTML = '<div class="empty-state"><div class="icon">&#x1F3C6;</div><div class="title">No Agent Profiles</div><div class="desc">Agent performance stats will appear once tasks are completed</div></div>';
            return;
        }
        // Sort by completed tasks descending
        var sorted = profiles.slice().sort(function(a, b) { return b.completedTasks - a.completedTasks; });
        var html = '<table class="leaderboard-table">';
        html += '<thead><tr><th>#</th><th>Agent</th><th>Role</th><th>Completed</th><th>Success</th><th>Avg Time</th><th>Badges</th></tr></thead><tbody>';
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            var successPct = Math.round(p.successRate * 100);
            var avgTimeSec = p.avgCompletionMs > 0 ? Math.round(p.avgCompletionMs / 1000) : 0;
            var avgTimeStr = avgTimeSec > 0 ? (avgTimeSec > 60 ? Math.round(avgTimeSec / 60) + 'm' : avgTimeSec + 's') : '--';
            html += '<tr>';
            html += '<td><div class="leaderboard-rank ' + rankClass + '">' + (i + 1) + '</div></td>';
            html += '<td><strong>' + escapeHtml(p.agentName) + '</strong></td>';
            html += '<td><span class="role-badge ' + escapeHtml(p.role) + '">' + escapeHtml(p.role) + '</span></td>';
            html += '<td>' + p.completedTasks + '/' + p.totalTasks + '</td>';
            html += '<td><div class="success-bar"><div class="success-bar-fill" style="width:' + successPct + '%"></div></div> ' + successPct + '%</td>';
            html += '<td>' + avgTimeStr + '</td>';
            html += '<td>';
            if (p.badges && p.badges.length > 0) {
                for (var b = 0; b < p.badges.length; b++) {
                    html += '<span class="badge-chip">' + escapeHtml(p.badges[b]) + '</span>';
                }
            }
            html += '</td></tr>';
        }
        html += '</tbody></table>';
        leaderboardContainer.innerHTML = html;
    }

    // ── Team Composer Rendering ──────────────────────────────────────────
    function renderTeamTemplates(templates) {
        if (!templates || templates.length === 0) {
            teamTemplateGrid.innerHTML = '<div class="empty-state"><div class="icon">&#x1F528;</div><div class="title">No Team Templates</div><div class="desc">Team templates allow quick team assembly</div></div>';
            return;
        }
        var html = '';
        for (var i = 0; i < templates.length; i++) {
            var t = templates[i];
            html += '<div class="team-template-card" data-action="deploy-team" data-template-id="' + escapeHtml(t.id) + '">';
            html += '<div class="team-template-name">' + escapeHtml(t.name) + '</div>';
            html += '<div class="team-template-desc">' + escapeHtml(t.description) + '</div>';
            html += '<div class="team-template-slots">';
            if (t.slots) {
                for (var s = 0; s < t.slots.length; s++) {
                    var slot = t.slots[s];
                    html += '<span class="slot-chip"><span class="role-badge ' + escapeHtml(slot.role) + '">' + escapeHtml(slot.role) + '</span> ' + escapeHtml(slot.label) + '</span>';
                }
            }
            html += '</div>';
            html += '</div>';
        }
        teamTemplateGrid.innerHTML = html;
    }

    // ── Agent Messages Rendering ─────────────────────────────────────────
    function renderAgentMessages(messages) {
        messagesCountEl.textContent = messages.length;

        // Update agent selects for send panel
        if (currentState && currentState.agents) {
            var options = '<option value="">Select...</option>';
            for (var a = 0; a < currentState.agents.length; a++) {
                var ag = currentState.agents[a].agent;
                options += '<option value="' + escapeHtml(ag.id) + '">' + escapeHtml(ag.name) + '</option>';
            }
            msgFromSelect.innerHTML = options;
            msgToSelect.innerHTML = options;
        }

        if (messages.length === 0) {
            messageFeed.innerHTML = '<div class="empty-state"><div class="icon">&#x1F4AC;</div><div class="title">No Messages</div><div class="desc">Agents can send messages to each other for coordination</div></div>';
            return;
        }
        var html = '';
        var limit = Math.min(messages.length, 50);
        for (var i = 0; i < limit; i++) {
            var m = messages[i];
            var fromName = getAgentNameById(m.fromAgentId) || m.fromAgentId.slice(0, 8);
            var toName = getAgentNameById(m.toAgentId) || m.toAgentId.slice(0, 8);
            var unreadClass = m.read ? '' : ' msg-unread';
            html += '<div class="msg-item' + unreadClass + '">';
            html += '<div class="msg-avatar">' + escapeHtml(fromName.charAt(0).toUpperCase()) + '</div>';
            html += '<div class="msg-body">';
            html += '<div class="msg-header">';
            html += '<span class="msg-sender">' + escapeHtml(fromName) + '</span>';
            html += '<span class="msg-arrow">&#x2192;</span>';
            html += '<span class="msg-recipient">' + escapeHtml(toName) + '</span>';
            html += '<span class="msg-time">' + timeAgo(m.timestamp) + '</span>';
            html += '</div>';
            html += '<div class="msg-content">' + escapeHtml(m.content) + '</div>';
            html += '</div></div>';
        }
        messageFeed.innerHTML = html;
    }

    // ── Full State Render ────────────────────────────────────────────────────
    function renderAll(state) {
        if (!state) return;
        currentState = state;

        updateStats(state.agents || []);
        renderAgentGrid(state.agents || []);
        renderPipelines(state.activePipelines || []);
        renderTaskQueue(state.taskQueue || []);
        renderTeams(state.teams || []);
        renderOrgChart(state.orgUnits || []);
        renderGuilds(state.guilds || []);
        renderLeaderboard(state.agentProfiles || []);
        renderTeamTemplates(state.teamTemplates || []);
        renderAgentMessages(state.agentMessages || []);

        if (state.lastUpdated) {
            lastUpdatedEl.textContent = 'Last updated: ' + new Date(state.lastUpdated).toLocaleTimeString();
        }
    }

    // ── Message Handling ─────────────────────────────────────────────────────
    window.addEventListener('message', function(e) {
        var msg = e.data;
        if (msg.type === 'updateState') {
            renderAll(msg.state);
        } else if (msg.type === 'updateAgent') {
            updateSingleAgent(msg.agentId, msg.agent, msg.recentOutput);
        }
    });

    // ── Event Delegation ─────────────────────────────────────────────────────
    document.getElementById('app').addEventListener('click', function(e) {
        // Handle detach-from-task buttons
        var detachBtn = e.target.closest('[data-detach-task]');
        if (detachBtn) {
            var taskId = detachBtn.dataset.detachTask;
            vscode.postMessage({ type: 'detachFromTask', taskId: taskId });
            attachedTasks[taskId] = false;
            renderTaskQueue(currentState.taskQueue || []);
            return;
        }

        // Handle attach-to-task buttons
        var attachBtn = e.target.closest('[data-attach-task]');
        if (attachBtn) {
            var taskId = attachBtn.dataset.attachTask;
            vscode.postMessage({ type: 'attachToTask', taskId: taskId });
            attachedTasks[taskId] = true;
            renderTaskQueue(currentState.taskQueue || []);
            return;
        }

        var target = e.target.closest('[data-action]');
        if (!target) return;

        var action = target.dataset.action;
        var agentId = target.dataset.agentId;
        var runId = target.dataset.runId;

        switch (action) {
            case 'prompt':
                // Show inline prompt input
                var promptArea = document.getElementById('prompt-area-' + agentId);
                if (promptArea) {
                    promptArea.classList.add('active');
                    var input = document.getElementById('prompt-input-' + agentId);
                    if (input) input.focus();
                }
                break;

            case 'send-prompt':
                var inputEl = document.getElementById('prompt-input-' + agentId);
                if (inputEl && inputEl.value.trim()) {
                    vscode.postMessage({ type: 'sendPrompt', agentId: agentId, prompt: inputEl.value.trim() });
                    inputEl.value = '';
                    var area = document.getElementById('prompt-area-' + agentId);
                    if (area) area.classList.remove('active');
                }
                break;

            case 'cancel-prompt':
                var cancelArea = document.getElementById('prompt-area-' + agentId);
                if (cancelArea) cancelArea.classList.remove('active');
                break;

            case 'kill':
                vscode.postMessage({ type: 'killAgent', agentId: agentId });
                break;

            case 'pause':
                // Pause could be agent-level or pipeline-level; for agents it could trigger a command
                vscode.postMessage({ type: 'killAgent', agentId: agentId });
                break;

            case 'pause-pipeline':
                vscode.postMessage({ type: 'pausePipeline', runId: runId });
                break;

            case 'resume-pipeline':
                vscode.postMessage({ type: 'resumePipeline', runId: runId });
                break;

            case 'deploy-team':
                vscode.postMessage({ type: 'deployTeamTemplate', templateId: target.dataset.templateId });
                break;
        }
    });

    // Handle Enter key on inline prompt inputs (event delegation)
    document.getElementById('app').addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        var target = e.target;
        if (!target || !target.id || !target.id.startsWith('prompt-input-')) return;
        e.preventDefault();
        var agentId = target.id.replace('prompt-input-', '');
        if (target.value.trim()) {
            vscode.postMessage({ type: 'sendPrompt', agentId: agentId, prompt: target.value.trim() });
            target.value = '';
            var area = document.getElementById('prompt-area-' + agentId);
            if (area) area.classList.remove('active');
        }
    });

    // Header buttons
    document.getElementById('btn-chat').addEventListener('click', function() {
        vscode.postMessage({ type: 'openChat' });
    });
    document.getElementById('btn-refresh').addEventListener('click', function() {
        vscode.postMessage({ type: 'refresh' });
    });
    document.getElementById('btn-new-agent').addEventListener('click', function() {
        vscode.postMessage({ type: 'newAgent' });
    });
    document.getElementById('btn-new-team').addEventListener('click', function() {
        vscode.postMessage({ type: 'newTeam' });
    });

    // Auto-refresh toggle
    document.getElementById('auto-refresh-toggle').addEventListener('click', function() {
        autoRefreshOn = !autoRefreshOn;
        if (autoRefreshOn) {
            toggleTrack.classList.add('on');
            vscode.postMessage({ type: 'autoRefreshOn' });
        } else {
            toggleTrack.classList.remove('on');
            vscode.postMessage({ type: 'autoRefreshOff' });
        }
    });

    // Collapsible sections
    document.getElementById('tasks-header').addEventListener('click', function() {
        var body = document.getElementById('tasks-body');
        var icon = document.getElementById('tasks-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('teams-header').addEventListener('click', function() {
        var body = document.getElementById('teams-body');
        var icon = document.getElementById('teams-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('org-header').addEventListener('click', function() {
        var body = document.getElementById('org-body');
        var icon = document.getElementById('org-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('guilds-header').addEventListener('click', function() {
        var body = document.getElementById('guilds-body');
        var icon = document.getElementById('guilds-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('leaderboard-header').addEventListener('click', function() {
        var body = document.getElementById('leaderboard-body');
        var icon = document.getElementById('leaderboard-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('composer-header').addEventListener('click', function() {
        var body = document.getElementById('composer-body');
        var icon = document.getElementById('composer-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });
    document.getElementById('messages-header').addEventListener('click', function() {
        var body = document.getElementById('messages-body');
        var icon = document.getElementById('messages-collapse-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    });

    // Send agent message
    document.getElementById('btn-send-msg').addEventListener('click', function() {
        var from = msgFromSelect.value;
        var to = msgToSelect.value;
        var content = msgInput.value.trim();
        if (from && to && content && from !== to) {
            vscode.postMessage({ type: 'sendAgentMessage', fromAgentId: from, toAgentId: to, content: content });
            msgInput.value = '';
        }
    });
    msgInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('btn-send-msg').click();
        }
    });

})();
</script>
</body>
</html>`;
    }
}
//# sourceMappingURL=dashboardView.js.map