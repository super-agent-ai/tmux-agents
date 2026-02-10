import * as vscode from 'vscode';
import { OrchestratorTask, TaskStatus, AgentRole, KanbanSwimLane, FavouriteFolder } from './types';

export type KanbanColumn = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

interface ServerOption {
    id: string;
    label: string;
}

export class KanbanViewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private tasks: OrchestratorTask[] = [];
    private swimLanes: KanbanSwimLane[] = [];
    private servers: ServerOption[] = [];
    private favouriteFolders: FavouriteFolder[] = [];

    private readonly _onAction = new vscode.EventEmitter<{action: string; payload: any}>();
    public readonly onAction = this._onAction.event;

    constructor(private readonly extensionUri: vscode.Uri) {}

    show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'tmux-agents-kanban',
            'Kanban Board',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml();

        this.panel.webview.onDidReceiveMessage(msg => {
            this._onAction.fire({ action: msg.type, payload: msg });
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        setTimeout(() => this.sendState(), 100);
    }

    updateState(tasks: OrchestratorTask[], swimLanes: KanbanSwimLane[], servers: ServerOption[], favouriteFolders?: FavouriteFolder[]): void {
        this.tasks = tasks;
        this.swimLanes = swimLanes;
        this.servers = servers;
        if (favouriteFolders) { this.favouriteFolders = favouriteFolders; }
        this.sendState();
    }

    dispose(): void {
        this._onAction.dispose();
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }

    sendMessage(msg: any): void {
        this.panel?.webview.postMessage(msg);
    }

    private sendState(): void {
        this.panel?.webview.postMessage({
            type: 'updateState',
            tasks: this.tasks,
            swimLanes: this.swimLanes,
            servers: this.servers,
            favouriteFolders: this.favouriteFolders
        });
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    height: 100%;
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden;
}
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }

#app { display: flex; flex-direction: column; height: 100vh; }

/* ── Header ─────────────────────────────────────────────────────────────── */
.header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
.header-title { font-size: 15px; font-weight: 600; }
.header-right { display: flex; gap: 8px; align-items: center; }

/* ── Buttons ────────────────────────────────────────────────────────────── */
.btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px; font-size: 12px; font-family: inherit; cursor: pointer;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    transition: background 0.15s;
}
.btn:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1)); }
.btn-primary {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; padding: 5px 14px; border-radius: 4px; font-size: 12px;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
}
.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.btn-icon {
    width: 24px; height: 24px; padding: 0; border: none; border-radius: 4px;
    background: transparent; color: var(--vscode-foreground); cursor: pointer;
    font-size: 14px; display: inline-flex; align-items: center; justify-content: center;
    opacity: 0.6; transition: opacity 0.15s, background 0.15s;
}
.btn-icon:hover { opacity: 1; background: rgba(255,255,255,0.08); }
.btn-icon.danger:hover { color: #f44747; background: rgba(244,71,71,0.12); }

/* ── Board container (vertical scroll for swim lanes) ───────────────────── */
.board {
    flex: 1; overflow-y: auto; padding: 0 0 16px;
    min-height: 0;
}

/* ── Favourites Bar ────────────────────────────────────────────────────── */
.fav-bar {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
.fav-bar-label { font-size: 11px; opacity: 0.6; margin-right: 2px; white-space: nowrap; }
.fav-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 12px; font-size: 11px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-panel-border); transition: background 0.15s;
    max-width: 240px;
}
.fav-chip:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1)); }
.fav-chip .fav-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fav-chip .fav-server { opacity: 0.5; font-size: 10px; white-space: nowrap; }
.fav-chip .fav-del {
    margin-left: 2px; opacity: 0.4; cursor: pointer; font-size: 12px; line-height: 1;
}
.fav-chip .fav-del:hover { opacity: 1; color: #f44747; }
.fav-add-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%; border: 1px dashed var(--vscode-panel-border);
    background: transparent; color: var(--vscode-foreground); cursor: pointer;
    font-size: 14px; opacity: 0.5; transition: opacity 0.15s;
}
.fav-add-btn:hover { opacity: 1; background: rgba(255,255,255,0.06); }

/* ── Swim Lane ──────────────────────────────────────────────────────────── */
.swim-lane {
    border-bottom: 1px solid var(--vscode-panel-border);
}
.swim-lane:last-child { border-bottom: none; }

.swim-lane-header {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px;
    background: var(--vscode-sideBar-background, rgba(255,255,255,0.02));
    border-bottom: 1px solid var(--vscode-panel-border);
    cursor: pointer; user-select: none;
    transition: background 0.15s;
}
.swim-lane-header:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
}
.swim-lane-collapse {
    font-size: 11px; opacity: 0.6; transition: transform 0.2s;
    flex-shrink: 0; width: 16px; text-align: center;
}
.swim-lane-collapse.collapsed { transform: rotate(-90deg); }
.swim-lane-name {
    font-size: 13px; font-weight: 600; white-space: nowrap;
}
.swim-lane-meta {
    display: flex; align-items: center; gap: 12px;
    font-size: 11px; opacity: 0.55; flex: 1; min-width: 0;
    overflow: hidden;
}
.swim-lane-meta span {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.swim-lane-actions {
    display: flex; gap: 4px; flex-shrink: 0;
}

.swim-lane-body {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0; padding: 0;
    overflow-x: auto; min-height: 0;
}
.swim-lane-body.collapsed { display: none; }

/* ── Column ─────────────────────────────────────────────────────────────── */
.column {
    display: flex; flex-direction: column;
    border-right: 1px solid var(--vscode-panel-border);
    min-width: 180px; min-height: 200px;
}
.column:last-child { border-right: none; }
.column-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px 6px;
    flex-shrink: 0;
    background: var(--vscode-sideBar-background, rgba(255,255,255,0.015));
    border-bottom: 1px solid var(--vscode-panel-border);
}
.column-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; opacity: 0.6;
}
.column-count {
    font-size: 9px; padding: 1px 5px; border-radius: 8px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    margin-left: 5px;
}
.column-add {
    width: 20px; height: 20px; border: none; border-radius: 4px;
    background: transparent; color: var(--vscode-foreground); cursor: pointer;
    font-size: 14px; display: flex; align-items: center; justify-content: center;
    opacity: 0.4; transition: opacity 0.15s, background 0.15s;
}
.column-add:hover { opacity: 1; background: rgba(255,255,255,0.08); }
.column-body {
    flex: 1; overflow-y: auto; padding: 10px 10px 20px;
    display: flex; flex-direction: column; gap: 6px;
    transition: background 0.2s, box-shadow 0.2s;
    min-height: 80px;
}
.column-body.drag-over {
    background: var(--vscode-list-hoverBackground, rgba(90,160,255,0.06));
    box-shadow: inset 0 0 0 2px var(--vscode-focusBorder);
    border-radius: 4px;
}

/* ── Card ───────────────────────────────────────────────────────────────── */
.card {
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; padding: 8px 10px 7px;
    cursor: grab; user-select: none;
    transition: border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.15s;
    position: relative;
}
.card:hover {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    transform: translateY(-1px);
}
.card.dragging { opacity: 0.4; transform: scale(0.97); }
.card-top-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 3px;
}
.card-id {
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace);
    font-size: 10px; opacity: 0.45;
    white-space: nowrap;
}
.card-actions {
    display: none; gap: 3px; flex-shrink: 0;
}
.card:hover .card-actions { display: flex; }
.card-action-btn {
    width: 26px; height: 26px; border: none; border-radius: 4px;
    background: transparent; color: var(--vscode-foreground); cursor: pointer;
    font-size: 15px; display: flex; align-items: center; justify-content: center;
    opacity: 0.45; transition: opacity 0.15s, background 0.15s;
    position: relative; flex-shrink: 0;
}
.card-action-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
.card-action-btn.danger:hover { color: #f44747; background: rgba(244,71,71,0.12); }
/* Tooltip is rendered via JS into #tooltip element */
#tooltip {
    position: fixed; pointer-events: none; z-index: 99999;
    padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: 600;
    background: var(--vscode-editorWidget-background, #252526);
    color: var(--vscode-foreground);
    box-shadow: 0 3px 12px rgba(0,0,0,0.4);
    border: 1px solid var(--vscode-panel-border);
    white-space: nowrap; opacity: 0;
    transition: opacity 0.12s;
}
#tooltip.show { opacity: 1; }
.card-title {
    font-size: 12px; font-weight: 600; margin-bottom: 3px;
    word-break: break-word; line-height: 1.35;
}
.card-desc {
    font-size: 11px; opacity: 0.55; margin-bottom: 5px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; line-height: 1.35;
}
.card-summary {
    font-size: 10px; margin: 4px 0 2px; padding: 4px 6px;
    background: rgba(78,201,176,0.08); border-left: 2px solid #4ec9b0;
    border-radius: 2px; line-height: 1.4; color: rgba(255,255,255,0.7);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
}
.modal-output {
    font-size: 12px; padding: 8px 10px;
    background: rgba(78,201,176,0.08); border-left: 3px solid #4ec9b0;
    border-radius: 3px; line-height: 1.5; color: rgba(255,255,255,0.8);
    white-space: pre-wrap; max-height: 120px; overflow-y: auto;
}
.card-meta {
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
}
.priority-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 4px;
    font-size: 10px; font-weight: 700;
}
.priority-badge.high { background: rgba(244,71,71,0.2); color: #f44747; }
.priority-badge.medium { background: rgba(220,220,170,0.2); color: #dcdcaa; }
.priority-badge.low { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.role-badge {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
}
.role-badge.coder { background: rgba(86,156,214,0.2); color: #569cd6; }
.role-badge.reviewer { background: rgba(197,134,192,0.2); color: #c586c0; }
.role-badge.tester { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.role-badge.devops { background: rgba(206,145,120,0.2); color: #ce9178; }
.role-badge.researcher { background: rgba(79,193,255,0.2); color: #4fc1ff; }
.role-badge.custom { background: rgba(212,212,212,0.15); color: #d4d4d4; }
.agent-name {
    font-size: 10px; opacity: 0.5; margin-left: auto;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;
}

.empty-col {
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; opacity: 0.25; padding: 40px 0; font-style: italic;
    flex: 1;
}

.drop-indicator {
    height: 3px; border-radius: 2px; margin: 2px 0;
    background: var(--vscode-focusBorder); opacity: 0;
    transition: opacity 0.15s;
}
.drop-indicator.visible { opacity: 1; }

/* ── Modal ──────────────────────────────────────────────────────────────── */
.modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.45); z-index: 1000;
    align-items: center; justify-content: center;
}
.modal-overlay.active { display: flex; }
.modal {
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px; padding: 20px;
    width: 400px; max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.modal-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.field { margin-bottom: 10px; }
.field label {
    display: block; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.6; margin-bottom: 3px;
}
.field input, .field textarea, .field select {
    width: 100%; padding: 5px 8px; border-radius: 3px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: inherit; font-size: 12px; outline: none;
}
.field input:focus, .field textarea:focus, .field select:focus {
    border-color: var(--vscode-focusBorder);
}
.field textarea { min-height: 50px; resize: vertical; }
.priority-slider-wrap {
    display: flex; align-items: center; gap: 8px;
}
.priority-slider-wrap input[type=range] {
    flex: 1; accent-color: var(--vscode-focusBorder);
    padding: 0; border: none; background: transparent;
}
.priority-slider-val {
    width: 28px; text-align: center; font-weight: 700; font-size: 13px;
}
.dir-field-row { display: flex; gap: 4px; align-items: center; }
.dir-field-row input { flex: 1; }
.browse-btn {
    padding: 5px 8px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px; cursor: pointer; font-size: 11px; font-family: inherit;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    white-space: nowrap; flex-shrink: 0;
}
.browse-btn:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1)); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.modal-task-actions {
    display: none; gap: 6px; flex-wrap: wrap; margin-top: 12px;
    padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);
}
.modal-task-actions.active { display: flex; }
.mta-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border: 1px solid var(--vscode-panel-border);
    border-radius: 4px; font-size: 11px; font-family: inherit; cursor: pointer;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    transition: background 0.15s, border-color 0.15s;
}
.mta-btn:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1)); border-color: var(--vscode-focusBorder); }
.mta-btn.danger { color: #f44747; }
.mta-btn.danger:hover { background: rgba(244,71,71,0.12); border-color: #f44747; }
.ai-gen-row {
    display: flex; gap: 6px; align-items: center;
}
.ai-gen-row input {
    flex: 1;
}
.ai-gen-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 12px; border: 1px solid rgba(78,201,176,0.4);
    border-radius: 3px; font-size: 11px; font-family: inherit; cursor: pointer;
    background: rgba(78,201,176,0.08); color: #4ec9b0;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap; flex-shrink: 0;
}
.ai-gen-btn:hover { background: rgba(78,201,176,0.18); border-color: #4ec9b0; }
.ai-gen-btn:disabled { opacity: 0.4; cursor: default; }
.ai-gen-btn .spinner-sm {
    display: inline-block; width: 10px; height: 10px;
    border: 1.5px solid rgba(78,201,176,0.3); border-top-color: #4ec9b0;
    border-radius: 50%; animation: spin 0.8s linear infinite;
}
.ai-gen-overlay {
    display: none; position: absolute; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(2px);
    flex-direction: column; align-items: center; justify-content: center;
    border-radius: 6px; gap: 12px;
}
.ai-gen-overlay.active { display: flex; }
.ai-gen-overlay .spinner-lg {
    width: 28px; height: 28px;
    border: 2.5px solid rgba(78,201,176,0.25); border-top-color: #4ec9b0;
    border-radius: 50%; animation: spin 0.8s linear infinite;
}
.ai-gen-overlay .label { color: #4ec9b0; font-size: 12px; }
.ai-gen-overlay .cancel-btn {
    padding: 4px 14px; border: 1px solid rgba(255,255,255,0.25);
    border-radius: 3px; font-size: 11px; font-family: inherit; cursor: pointer;
    background: rgba(255,255,255,0.08); color: var(--vscode-foreground);
    margin-top: 4px;
}
.ai-gen-overlay .cancel-btn:hover { background: rgba(255,255,255,0.15); }
.ai-gen-overlay .error-msg {
    color: #f44747; font-size: 11px; max-width: 80%; text-align: center;
    word-break: break-word; padding: 0 8px;
}

/* Attach / Close icons in card top row are handled by card-action-btn styles */

/* ── Auto-mode toggle ─────────────────────────────────────────────────── */
.auto-toggle {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; cursor: pointer; user-select: none;
    opacity: 0.6; transition: opacity 0.15s;
}
.auto-toggle:hover { opacity: 1; }
.auto-toggle-switch {
    width: 28px; height: 14px; border-radius: 7px;
    background: rgba(255,255,255,0.12);
    position: relative; transition: background 0.2s;
    flex-shrink: 0;
}
.auto-toggle-switch::after {
    content: ''; position: absolute;
    width: 10px; height: 10px; border-radius: 50%;
    top: 2px; left: 2px;
    background: rgba(255,255,255,0.4);
    transition: transform 0.2s, background 0.2s;
}
.auto-toggle.active .auto-toggle-switch {
    background: rgba(78,201,176,0.4);
}
.auto-toggle.active .auto-toggle-switch::after {
    transform: translateX(14px);
    background: #4ec9b0;
}
.auto-toggle-label {
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
}
.auto-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    background: rgba(78,201,176,0.15); color: #4ec9b0;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
}

/* ── Modal toggle switch (pill style) ────────────────────────────────── */
.auto-toggles-row {
    display: flex; align-items: center; gap: 16px; padding: 6px 0;
}
.auto-toggle-item {
    display: flex; align-items: center; gap: 6px;
}
.auto-toggle-item .modal-toggle-label {
    font-size: 11px; color: var(--vscode-foreground); user-select: none;
    opacity: 0.7; text-transform: none; letter-spacing: 0; margin: 0;
}
.auto-toggle-item:has(.modal-toggle.active) .modal-toggle-label {
    opacity: 1; font-weight: 600;
}
.field label.modal-toggle {
    display: inline-flex !important; align-items: center; cursor: pointer;
    outline: none; text-transform: none !important; opacity: 1 !important;
    font-size: inherit !important; letter-spacing: 0 !important; margin-bottom: 0 !important;
}
.modal-toggle-track {
    width: 32px; height: 18px; border-radius: 9px;
    background: rgba(255,255,255,0.18);
    position: relative; transition: background 0.25s;
    flex-shrink: 0;
}
.modal-toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: rgba(255,255,255,0.55);
    transition: transform 0.25s, background 0.25s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.modal-toggle.active .modal-toggle-track {
    background: #4ec9b0;
}
.modal-toggle.active .modal-toggle-thumb {
    transform: translateX(14px);
    background: #fff;
}

/* ── Swim lane session status ──────────────────────────────────────────── */

/* ── Task Box (parent card with bundled subtasks) ────────────────────── */
.card.parent-card {
    border-left: 3px solid var(--vscode-focusBorder);
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-focusBorder);
    border-left: 3px solid var(--vscode-focusBorder);
}
.card.parent-card .task-box-label {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 1px 6px; border-radius: 3px;
    background: rgba(86,156,214,0.15); color: var(--vscode-focusBorder);
    margin-bottom: 4px;
}
.card.subtask-card { opacity: 0.7; border-left: 3px solid rgba(255,255,255,0.1); margin-left: 8px; }
.task-box-actions {
    display: flex; gap: 3px; margin-top: 8px;
    padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);
}
.task-box-actions .tba-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
    padding: 5px 4px; border: none; border-radius: 5px;
    font-size: 10px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background 0.15s, transform 0.1s;
    letter-spacing: 0.2px;
}
.task-box-actions .tba-btn:active { transform: scale(0.97); }
.task-box-actions .tba-btn .tba-icon {
    font-size: 12px; line-height: 1; flex-shrink: 0;
}
.tba-btn.tba-split {
    background: rgba(255,255,255,0.04); color: var(--vscode-foreground); opacity: 0.55;
}
.tba-btn.tba-split:hover { background: rgba(255,255,255,0.1); opacity: 0.85; }
.subtask-list {
    margin-top: 6px; padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.06);
}
.subtask-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; padding: 3px 0;
}
.subtask-item .subtask-id {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9px; opacity: 0.45;
}
.subtask-item .subtask-status {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.subtask-item .subtask-status.pending { background: #dcdcaa; }
.subtask-item .subtask-status.in_progress { background: #569cd6; }
.subtask-item .subtask-status.completed { background: #4ec9b0; }
.subtask-item .subtask-status.failed { background: #f44747; }
.subtask-item .subtask-desc {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.subtask-progress {
    display: flex; align-items: center; gap: 6px; margin-top: 4px;
    font-size: 10px; opacity: 0.6;
}
.subtask-progress-bar {
    flex: 1; height: 3px; border-radius: 2px;
    background: rgba(255,255,255,0.08);
    overflow: hidden;
}
.subtask-progress-fill {
    height: 100%; border-radius: 2px;
    background: #4ec9b0;
    transition: width 0.3s;
}
.verification-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-left: auto;
}
.verification-badge.pending { background: rgba(220,220,170,0.15); color: #dcdcaa; }
.verification-badge.passed { background: rgba(78,201,176,0.2); color: #4ec9b0; }
.verification-badge.failed { background: rgba(244,71,71,0.2); color: #f44747; }
.card.merge-target {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 2px rgba(86,156,214,0.3);
    transform: scale(1.02);
}

/* ── Import modal ─────────────────────────────────────────────────────── */
.import-sessions-list {
    max-height: 350px; overflow-y: auto;
    border: 1px solid var(--vscode-panel-border); border-radius: 4px;
    margin-bottom: 10px;
}
.import-session-item {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: background 0.15s;
}
.import-session-item:last-child { border-bottom: none; }
.import-session-item:hover { background: rgba(255,255,255,0.03); }
.import-session-item input[type=checkbox] {
    margin-top: 3px; accent-color: var(--vscode-focusBorder); flex-shrink: 0;
}
.import-session-info { flex: 1; min-width: 0; }
.import-session-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
.import-session-meta {
    font-size: 10px; opacity: 0.55; margin-bottom: 4px;
    display: flex; gap: 10px; flex-wrap: wrap;
}
.import-session-summary {
    font-size: 11px; opacity: 0.7; line-height: 1.4;
    white-space: pre-wrap; max-height: 60px; overflow: hidden;
    background: rgba(0,0,0,0.15); padding: 4px 6px; border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
}
.import-window-list {
    margin: 4px 0 0 24px;
    border-left: 1px solid rgba(255,255,255,0.08);
    padding-left: 0;
}
.import-window-item {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 8px;
    font-size: 11px;
    opacity: 0.85;
}
.import-window-item:hover { background: rgba(255,255,255,0.03); }
.import-window-item input[type=checkbox] {
    accent-color: var(--vscode-focusBorder); flex-shrink: 0;
}
.import-window-item.imported-dim {
    opacity: 0.4;
}
.import-window-name { font-weight: 500; }
.import-window-meta { opacity: 0.55; font-size: 10px; margin-left: auto; }
.import-already-tag {
    display: inline-block; font-size: 9px; padding: 1px 5px;
    background: rgba(255,255,255,0.08); border-radius: 3px;
    opacity: 0.6; margin-left: 6px; vertical-align: middle;
}
.import-loading {
    display: flex; align-items: center; justify-content: center;
    padding: 30px; font-size: 12px; opacity: 0.6;
}
.import-loading .spinner {
    width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.2);
    border-top-color: var(--vscode-focusBorder); border-radius: 50%;
    animation: spin 0.8s linear infinite; margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

</style>
</head>
<body>
<div id="tooltip"></div>
<div id="app" style="position:relative">
    <div class="header">
        <span class="header-title">Kanban Board</span>
        <div class="header-right">
            <button class="btn" id="btn-import-tmux">&#x2B07; Import from Tmux</button>
            <button class="btn" id="btn-new-lane">+ New Swim Lane</button>
            <button class="btn" id="btn-refresh">&#x21BB; Refresh</button>
        </div>
    </div>
    <div class="fav-bar" id="fav-bar"></div>
    <div class="board" id="board"></div>
</div>

<!-- Add Favourite Modal -->
<div class="modal-overlay" id="fav-modal-overlay">
    <div class="modal">
        <div class="modal-title">Add Favourite Folder</div>
        <div class="field">
            <label>Name</label>
            <input type="text" id="fav-name" placeholder="e.g. My Project" />
        </div>
        <div class="field">
            <label>Server</label>
            <select id="fav-server"></select>
        </div>
        <div class="field">
            <label>Working Directory</label>
            <div class="dir-field-row">
                <input type="text" id="fav-dir" placeholder="~/" value="~/" />
                <button class="browse-btn" id="fav-browse">Browse</button>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn" id="fav-cancel">Cancel</button>
            <button class="btn-primary" id="fav-submit">Add</button>
        </div>
    </div>
</div>

<!-- Swim Lane Modal -->
<div class="modal-overlay" id="lane-modal-overlay">
    <div class="modal">
        <div class="modal-title">New Swim Lane</div>
        <div class="field">
            <label>Name</label>
            <input type="text" id="sl-name" placeholder="e.g. Feature Auth" />
        </div>
        <div class="field">
            <label>Server</label>
            <select id="sl-server"></select>
        </div>
        <div class="field">
            <label>Working Directory</label>
            <div class="dir-field-row">
                <input type="text" id="sl-dir" placeholder="~/" value="~/" />
                <button class="browse-btn" id="sl-browse">Browse</button>
            </div>
        </div>
        <div class="field">
            <label>AI Provider</label>
            <select id="sl-provider">
                <option value="">(Use default)</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="codex">Codex</option>
            </select>
        </div>
        <div class="field">
            <label>Context / Instructions</label>
            <textarea id="sl-context" placeholder="Additional context or instructions injected into every task prompt in this lane..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn" id="sl-cancel">Cancel</button>
            <button class="btn-primary" id="sl-submit">Create</button>
        </div>
    </div>
</div>

<!-- Task Modal -->
<div class="modal-overlay" id="task-modal-overlay">
    <div class="modal" style="position:relative;">
        <div class="ai-gen-overlay" id="ai-gen-overlay">
            <div class="spinner-lg"></div>
            <div class="label">Generating with AI...</div>
            <div class="error-msg" id="ai-gen-error" style="display:none;"></div>
            <button class="cancel-btn" id="ai-gen-cancel">Cancel</button>
        </div>
        <div class="modal-title" id="tm-title">New Task</div>
        <div class="field" id="tm-ai-field">
            <label>AI Generate</label>
            <div class="ai-gen-row">
                <input type="text" id="tm-ai-input" placeholder="Describe what you want in plain English..." />
                <button class="ai-gen-btn" id="tma-ai-gen">&#x2728; Generate</button>
            </div>
        </div>
        <div class="field">
            <label>Title</label>
            <input type="text" id="tm-desc" placeholder="Task title" />
        </div>
        <div class="field">
            <label>Description</label>
            <textarea id="tm-input" placeholder="Details..."></textarea>
        </div>
        <div class="field">
            <label>Target Role</label>
            <select id="tm-role">
                <option value="">Any</option>
                <option value="coder">Coder</option>
                <option value="reviewer">Reviewer</option>
                <option value="tester">Tester</option>
                <option value="devops">DevOps</option>
                <option value="researcher">Researcher</option>
                <option value="custom">Custom</option>
            </select>
        </div>
        <div class="field">
            <label>Priority</label>
            <div class="priority-slider-wrap">
                <input type="range" id="tm-priority" min="1" max="10" value="5" />
                <span class="priority-slider-val" id="tm-priority-val">5</span>
            </div>
        </div>
        <div class="field">
            <label>Swim Lane</label>
            <select id="tm-lane"></select>
        </div>
        <div class="field">
            <div class="auto-toggles-row">
                <div class="auto-toggle-item">
                    <label class="modal-toggle" id="tm-auto-start" tabindex="0">
                        <span class="modal-toggle-track"><span class="modal-toggle-thumb"></span></span>
                    </label>
                    <span class="modal-toggle-label">Start</span>
                </div>
                <div class="auto-toggle-item">
                    <label class="modal-toggle" id="tm-auto-pilot" tabindex="0">
                        <span class="modal-toggle-track"><span class="modal-toggle-thumb"></span></span>
                    </label>
                    <span class="modal-toggle-label">Pilot</span>
                </div>
                <div class="auto-toggle-item">
                    <label class="modal-toggle" id="tm-auto-close" tabindex="0">
                        <span class="modal-toggle-track"><span class="modal-toggle-thumb"></span></span>
                    </label>
                    <span class="modal-toggle-label">Close</span>
                </div>
            </div>
        </div>
        <div class="field" id="tm-output-field" style="display:none">
            <label>Completion Summary</label>
            <div id="tm-output" class="modal-output"></div>
        </div>
        <div class="modal-task-actions" id="tm-task-actions">
            <button class="mta-btn" id="tma-start" title="Start this task">&#x25B6; Start</button>
            <button class="mta-btn" id="tma-attach" title="Attach to tmux window">&#x1F4CE; Attach</button>
            <button class="mta-btn" id="tma-restart" title="Restart this task">&#x21BB; Restart</button>
            <button class="mta-btn" id="tma-summarize" title="Capture output summary">&#x1F4DD; Summarize</button>
            <button class="mta-btn" id="tma-close-window" title="Close tmux window">&#x23FB; Close Window</button>
            <button class="mta-btn danger" id="tma-delete" title="Delete this task">&#x2716; Delete</button>
        </div>
        <div class="modal-actions">
            <button class="btn" id="tm-cancel">Cancel</button>
            <button class="btn-primary" id="tm-submit">Create</button>
        </div>
    </div>
</div>

<!-- Edit Swim Lane Modal -->
<div class="modal-overlay" id="edit-lane-modal-overlay">
    <div class="modal">
        <div class="modal-title">Edit Swim Lane</div>
        <div class="field">
            <label>Name</label>
            <input type="text" id="el-name" />
        </div>
        <div class="field">
            <label>Session Name</label>
            <input type="text" id="el-session" />
        </div>
        <div class="field">
            <label>Working Directory</label>
            <div class="dir-field-row">
                <input type="text" id="el-dir" />
                <button class="browse-btn" id="el-browse">Browse</button>
            </div>
        </div>
        <div class="field">
            <label>AI Provider</label>
            <select id="el-provider">
                <option value="">(Use default)</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="codex">Codex</option>
            </select>
        </div>
        <div class="field">
            <label>Context / Instructions</label>
            <textarea id="el-context" placeholder="Additional context or instructions injected into every task prompt..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn" id="el-cancel">Cancel</button>
            <button class="btn-primary" id="el-submit">Save</button>
        </div>
    </div>
</div>

<!-- Import from Tmux Modal -->
<div class="modal-overlay" id="import-modal-overlay">
    <div class="modal" style="width:520px">
        <div class="modal-title">Import from Tmux Sessions</div>
        <div id="import-content">
            <div class="import-loading"><div class="spinner"></div>Scanning tmux sessions...</div>
        </div>
        <div class="modal-actions">
            <button class="btn" id="import-cancel">Cancel</button>
            <button class="btn-primary" id="import-submit" disabled>Import Selected</button>
        </div>
    </div>
</div>

<script>
(function() {
    var vscode = acquireVsCodeApi();

    /* ── Tooltip ────────────────────────────────────────────────────────── */
    var tooltipEl = document.getElementById('tooltip');
    var tooltipTimer = null;
    function showTooltip(target) {
        var tip = target.getAttribute('data-tip');
        if (!tip) return;
        tooltipEl.textContent = tip;
        var rect = target.getBoundingClientRect();
        tooltipEl.style.left = (rect.left + rect.width / 2) + 'px';
        tooltipEl.style.top = (rect.top - 8) + 'px';
        tooltipEl.style.transform = 'translate(-50%, -100%)';
        tooltipEl.classList.add('show');
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(function() { tooltipEl.classList.remove('show'); }, 1000);
    }
    function hideTooltip() {
        clearTimeout(tooltipTimer);
        tooltipEl.classList.remove('show');
    }
    document.addEventListener('mouseover', function(e) {
        var btn = e.target.closest('[data-tip]');
        if (btn) { showTooltip(btn); }
    });
    document.addEventListener('mouseout', function(e) {
        var btn = e.target.closest('[data-tip]');
        if (btn) { hideTooltip(); }
    });

    var COLUMNS = [
        { id: 'backlog', label: 'Backlog' },
        { id: 'todo', label: 'Todo' },
        { id: 'in_progress', label: 'In Progress' },
        { id: 'in_review', label: 'In Review' },
        { id: 'done', label: 'Done' }
    ];

    var tasks = [];
    var swimLanes = [];
    var servers = [];
    var favouriteFolders = [];
    var collapsedLanes = {};

    // Task modal state
    var editingTaskId = null;
    var modalColumn = 'backlog';
    var modalSwimLaneId = '';

    // Drag state
    var draggedTaskId = null;
    var dragSourceCol = null;
    var dragSourceLane = null;


    // DOM refs
    var board = document.getElementById('board');

    // Lane modal refs
    var laneOverlay = document.getElementById('lane-modal-overlay');
    var slName = document.getElementById('sl-name');
    var slServer = document.getElementById('sl-server');
    var slDir = document.getElementById('sl-dir');
    var slProvider = document.getElementById('sl-provider');
    var slContext = document.getElementById('sl-context');

    // Favourite modal refs
    var favOverlay = document.getElementById('fav-modal-overlay');
    var favName = document.getElementById('fav-name');
    var favServer = document.getElementById('fav-server');
    var favDir = document.getElementById('fav-dir');
    var favBar = document.getElementById('fav-bar');

    // Task modal refs
    var taskOverlay = document.getElementById('task-modal-overlay');
    var tmTitle = document.getElementById('tm-title');
    var tmDesc = document.getElementById('tm-desc');
    var tmInput = document.getElementById('tm-input');
    var tmRole = document.getElementById('tm-role');
    var tmPriority = document.getElementById('tm-priority');
    var tmPriorityVal = document.getElementById('tm-priority-val');
    var tmLane = document.getElementById('tm-lane');
    var tmAutoStart = document.getElementById('tm-auto-start');
    var tmAutoPilot = document.getElementById('tm-auto-pilot');
    var tmAutoClose = document.getElementById('tm-auto-close');
    function setupToggle(el) {
        el.addEventListener('click', function() { el.classList.toggle('active'); });
        el.addEventListener('keydown', function(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.classList.toggle('active'); } });
    }
    setupToggle(tmAutoStart);
    setupToggle(tmAutoPilot);
    setupToggle(tmAutoClose);
    var tmOutputField = document.getElementById('tm-output-field');
    var tmOutput = document.getElementById('tm-output');
    var tmSubmit = document.getElementById('tm-submit');
    var tmTaskActions = document.getElementById('tm-task-actions');
    var tmaStart = document.getElementById('tma-start');
    var tmaAttach = document.getElementById('tma-attach');
    var tmaRestart = document.getElementById('tma-restart');
    var tmaSummarize = document.getElementById('tma-summarize');
    var tmaCloseWindow = document.getElementById('tma-close-window');
    var tmaDelete = document.getElementById('tma-delete');
    var tmAiInput = document.getElementById('tm-ai-input');
    var tmAiField = document.getElementById('tm-ai-field');
    var tmaAiGen = document.getElementById('tma-ai-gen');
    var aiGenOverlay = document.getElementById('ai-gen-overlay');
    var aiGenError = document.getElementById('ai-gen-error');
    var aiGenCancel = document.getElementById('ai-gen-cancel');
    var aiGenAborted = false;

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function shortId(id) {
        if (!id) return '';
        // Use last 6 chars (the random suffix) to avoid all IDs showing the same timestamp prefix
        return '#' + id.slice(-6);
    }

    function getCol(task) {
        if (task.kanbanColumn) return task.kanbanColumn;
        var s = task.status;
        if (s === 'completed') return 'done';
        if (s === 'assigned' || s === 'in_progress') return 'in_progress';
        if (s === 'pending') {
            return (task.priority || 0) <= 3 ? 'backlog' : 'todo';
        }
        return 'backlog';
    }

    function priClass(p) {
        if (p >= 8) return 'high';
        if (p >= 4) return 'medium';
        return 'low';
    }

    function priColor(p) {
        if (p >= 8) return '#f44747';
        if (p >= 4) return '#dcdcaa';
        return '#4ec9b0';
    }

    function tasksForLaneAndColumn(laneId, colId) {
        var result = [];
        for (var i = 0; i < tasks.length; i++) {
            var t = tasks[i];
            if (t.parentTaskId) continue;  // subtasks shown inside parent
            var tLane = t.swimLaneId || '';
            if (tLane === laneId && getCol(t) === colId) {
                result.push(t);
            }
        }
        result.sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); });
        return result;
    }

    function findTask(taskId) {
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === taskId) return tasks[i];
        }
        return null;
    }

    function getServerLabel(serverId) {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].id === serverId) return servers[i].label;
        }
        return serverId || 'unknown';
    }

    /* ── Card builder ────────────────────────────────────────────────────── */

    function buildCard(task) {
        var card = document.createElement('div');
        card.className = 'card';
        card.dataset.taskId = task.id;
        card.dataset.laneId = task.swimLaneId || '';
        card.draggable = true;

        var colId = getCol(task);
        if (colId === 'todo') card.classList.add('in-todo');

        var pc = priClass(task.priority || 1);
        var role = task.targetRole || '';
        var agent = task.assignedAgentId || '';
        var title = task.description || 'Untitled';
        var desc = task.input || '';

        var html = '';
        html += '<div class="card-top-row">';
        html += '<span class="card-id">' + esc(shortId(task.id)) + '</span>';
        html += '<div class="card-actions">';
        // Restart icon for tasks with a swim lane (in_progress, in_review, done)
        if (task.swimLaneId && (colId === 'in_progress' || colId === 'in_review' || colId === 'done')) {
            html += '<button class="card-action-btn" data-act="restart" data-tid="' + esc(task.id) + '" data-tip="Restart" style="color:#dcdcaa">&#x21BB;</button>';
        }
        // Attach icon for tasks with tmux window (in_progress, in_review, done)
        if (task.tmuxSessionName && (colId === 'in_progress' || colId === 'in_review' || colId === 'done')) {
            html += '<button class="card-action-btn" data-act="attach" data-tid="' + esc(task.id) + '" data-tip="Attach" style="color:#4ec9b0">&#x25B6;</button>';
        }
        // Close window icon for done tasks
        if (task.tmuxSessionName && colId === 'done') {
            html += '<button class="card-action-btn danger" data-act="close-window" data-tid="' + esc(task.id) + '" data-tip="Close">&#x23FB;</button>';
        }
        html += '<button class="card-action-btn" data-act="edit" data-tid="' + esc(task.id) + '" data-tip="Edit">&#x270E;</button>';
        html += '<button class="card-action-btn danger" data-act="delete" data-tid="' + esc(task.id) + '" data-tip="Delete">&#x2716;</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="card-title">' + esc(title) + '</div>';
        if (desc) html += '<div class="card-desc">' + esc(desc) + '</div>';
        if (task.output && (colId === 'done' || colId === 'in_review')) {
            html += '<div class="card-summary">' + esc(task.output) + '</div>';
        }
        html += '<div class="card-meta">';
        html += '<span class="priority-badge ' + pc + '">' + (task.priority || 1) + '</span>';
        if (role) html += '<span class="role-badge ' + esc(role) + '">' + esc(role) + '</span>';
        if (agent) html += '<span class="agent-name" title="' + esc(agent) + '">' + esc(agent) + '</span>';
        var autoFlags = [];
        if (task.autoStart) autoFlags.push('S');
        if (task.autoPilot) autoFlags.push('P');
        if (task.autoClose) autoFlags.push('C');
        if (autoFlags.length > 0) {
            html += '<span class="auto-badge" title="Auto: ' + (task.autoStart ? 'Start ' : '') + (task.autoPilot ? 'Pilot ' : '') + (task.autoClose ? 'Close' : '') + '">&#x26A1; ' + autoFlags.join('') + '</span>';
        }
        html += '</div>';

        // Task Box — parent card with bundled subtasks
        if (task.subtaskIds && task.subtaskIds.length > 0) {
            card.classList.add('parent-card');
            html += '<span class="task-box-label">&#x1F4E6; Task Box &middot; ' + task.subtaskIds.length + ' tasks</span>';
            html += '<div class="subtask-list">';
            var completedCount = 0;
            for (var si = 0; si < task.subtaskIds.length; si++) {
                var sub = findTask(task.subtaskIds[si]);
                if (!sub) continue;
                var subStatus = sub.status || 'pending';
                if (subStatus === 'completed') completedCount++;
                html += '<div class="subtask-item">';
                html += '<span class="subtask-status ' + esc(subStatus) + '"></span>';
                html += '<span class="subtask-id">' + esc(shortId(sub.id)) + '</span>';
                html += '<span class="subtask-desc">' + esc(sub.description || 'Untitled') + '</span>';
                // Attach button for running subtasks
                if (sub.tmuxSessionName && (subStatus === 'in_progress' || subStatus === 'assigned')) {
                    html += '<button class="card-action-btn" data-act="attach" data-tid="' + esc(sub.id) + '" data-tip="Attach" style="color:#4ec9b0">&#x25B6;</button>';
                }
                html += '</div>';
            }
            // Progress bar
            var pct = task.subtaskIds.length > 0 ? Math.round((completedCount / task.subtaskIds.length) * 100) : 0;
            html += '<div class="subtask-progress">';
            html += '<div class="subtask-progress-bar"><div class="subtask-progress-fill" style="width:' + pct + '%"></div></div>';
            html += '<span>' + completedCount + '/' + task.subtaskIds.length + '</span>';
            html += '</div>';
            // Verification badge
            if (task.verificationStatus && task.verificationStatus !== 'none') {
                html += '<span class="verification-badge ' + esc(task.verificationStatus) + '">';
                html += task.verificationStatus === 'pending' ? '&#x23F3; Verifying' : task.verificationStatus === 'passed' ? '&#x2714; Verified' : '&#x2716; Failed';
                html += '</span>';
            }
            html += '</div>';  // closes subtask-list
            // Action buttons row
            html += '<div class="task-box-actions">';
            html += '<button class="tba-btn tba-split" data-act="split-box" data-tid="' + esc(task.id) + '"><span class="tba-icon">&#x2702;</span>Split</button>';
            html += '</div>';
        }

        // Hide subtask cards (they're shown inside parent)
        if (task.parentTaskId) {
            card.classList.add('subtask-card');
            card.style.display = 'none';
        }


        card.innerHTML = html;

        card.addEventListener('dragstart', function(e) {
            draggedTaskId = task.id;
            dragSourceCol = getCol(task);
            dragSourceLane = task.swimLaneId || '';
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'all';
            e.dataTransfer.setData('text/plain', task.id);
        });
        card.addEventListener('dragend', function() {
            card.classList.remove('dragging');
            draggedTaskId = null;
            dragSourceCol = null;
            dragSourceLane = null;
            clearDropIndicators();
        });

        // Card-to-card drop for merge
        card.addEventListener('dragover', function(e) {
            if (!draggedTaskId || draggedTaskId === task.id) return;
            // Don't merge subtasks or if different lanes
            if (task.parentTaskId || (task.swimLaneId || '') !== dragSourceLane) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'link';
            card.classList.add('merge-target');
        });
        card.addEventListener('dragleave', function(e) {
            card.classList.remove('merge-target');
        });
        card.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('merge-target');
            var droppedId = e.dataTransfer.getData('text/plain');
            if (!droppedId || droppedId === task.id) return;
            var droppedTask = findTask(droppedId);
            if (!droppedTask) return;
            // Don't merge subtasks
            if (droppedTask.parentTaskId) return;

            if (task.subtaskIds && task.subtaskIds.length > 0) {
                // Dropping onto existing parent — add as subtask
                vscode.postMessage({ type: 'addSubtask', parentTaskId: task.id, childTaskId: droppedId });
            } else {
                // Dropping onto regular task — merge into new parent
                vscode.postMessage({ type: 'mergeTasks', taskId1: task.id, taskId2: droppedId });
            }
        });

        return card;
    }

    function clearDropIndicators() {
        var bodies = board.querySelectorAll('.column-body');
        for (var i = 0; i < bodies.length; i++) {
            bodies[i].classList.remove('drag-over');
        }
        var mergeTargets = board.querySelectorAll('.merge-target');
        for (var j = 0; j < mergeTargets.length; j++) {
            mergeTargets[j].classList.remove('merge-target');
        }
    }

    /* ── Drop zone setup ─────────────────────────────────────────────────── */

    function setupDropZone(bodyEl, colId, laneId) {
        bodyEl.addEventListener('dragover', function(e) {
            if (dragSourceLane !== laneId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            bodyEl.classList.add('drag-over');
        });
        bodyEl.addEventListener('dragleave', function(e) {
            if (!bodyEl.contains(e.relatedTarget)) {
                bodyEl.classList.remove('drag-over');
            }
        });
        bodyEl.addEventListener('drop', function(e) {
            e.preventDefault();
            bodyEl.classList.remove('drag-over');
            if (dragSourceLane !== laneId) return;
            var taskId = e.dataTransfer.getData('text/plain');
            if (!taskId) return;
            if (dragSourceCol === colId) return;
            vscode.postMessage({ type: 'moveTask', taskId: taskId, kanbanColumn: colId });
            var t = findTask(taskId);
            if (t) t.kanbanColumn = colId;
            render();
        });
    }


    /* ── Build columns for a lane ────────────────────────────────────────── */

    function buildLaneColumns(laneId) {
        var container = document.createElement('div');
        container.className = 'swim-lane-body';
        if (collapsedLanes[laneId]) container.classList.add('collapsed');
        container.dataset.laneId = laneId;

        for (var c = 0; c < COLUMNS.length; c++) {
            var col = COLUMNS[c];
            var colTasks = tasksForLaneAndColumn(laneId, col.id);

            var colEl = document.createElement('div');
            colEl.className = 'column';

            var headerHtml = '<div class="column-header">';
            headerHtml += '<span><span class="column-title">' + esc(col.label) + '</span>';
            headerHtml += '<span class="column-count">' + colTasks.length + '</span></span>';
            headerHtml += '<span style="display:flex;align-items:center;gap:2px">';
            headerHtml += '<button class="column-add" data-col="' + col.id + '" data-lane="' + esc(laneId) + '" title="Add task">+</button>';
            headerHtml += '</span>';
            headerHtml += '</div>';

            var bodyEl = document.createElement('div');
            bodyEl.className = 'column-body';
            bodyEl.dataset.colId = col.id;
            bodyEl.dataset.laneId = laneId;

            if (colTasks.length === 0) {
                bodyEl.innerHTML = '<div class="empty-col">No tasks</div>';
            } else {
                for (var t = 0; t < colTasks.length; t++) {
                    bodyEl.appendChild(buildCard(colTasks[t]));
                }
            }

            setupDropZone(bodyEl, col.id, laneId);

            colEl.innerHTML = headerHtml;
            colEl.appendChild(bodyEl);
            container.appendChild(colEl);
        }

        return container;
    }

    /* ── Build a swim lane section ───────────────────────────────────────── */

    function buildSwimLane(lane) {
        var laneEl = document.createElement('div');
        laneEl.className = 'swim-lane';
        laneEl.dataset.laneId = lane.id;

        var isCollapsed = !!collapsedLanes[lane.id];
        var chevron = isCollapsed ? '&#x25B6;' : '&#x25BC;';

        var headerEl = document.createElement('div');
        headerEl.className = 'swim-lane-header';
        headerEl.dataset.laneId = lane.id;

        var headerHtml = '';
        headerHtml += '<span class="swim-lane-collapse' + (isCollapsed ? ' collapsed' : '') + '">' + chevron + '</span>';
        headerHtml += '<span class="swim-lane-name">' + esc(lane.name) + '</span>';
        headerHtml += '<div class="swim-lane-meta">';
        headerHtml += '<span>server: ' + esc(getServerLabel(lane.serverId)) + '</span>';
        headerHtml += '<span>dir: ' + esc(lane.workingDirectory) + '</span>';
        headerHtml += '<span>session: ' + esc(lane.sessionName) + '</span>';
        if (lane.aiProvider) {
            headerHtml += '<span class="role-badge custom">' + esc(lane.aiProvider) + '</span>';
        }
        headerHtml += '</div>';
        headerHtml += '<div class="swim-lane-actions">';
        headerHtml += '<button class="btn-icon" data-act="open-terminal" data-lane-id="' + esc(lane.id) + '" data-tip="Open terminal attached to session">&#x2328;</button>';
        headerHtml += '<button class="btn-icon" data-act="debug-window" data-lane-id="' + esc(lane.id) + '" data-tip="Open debug shell window">&#x1F41B;</button>';
        headerHtml += '<button class="btn-icon" data-act="restart-debug" data-lane-id="' + esc(lane.id) + '" data-tip="Kill &amp; restart debug window">&#x1F504;</button>';
        if (lane.sessionActive) {
            headerHtml += '<button class="btn-icon danger" data-act="kill-session" data-lane-id="' + esc(lane.id) + '" data-tip="Kill tmux session">&#x23FB;</button>';
        }
        headerHtml += '<button class="btn-icon" data-act="edit-lane" data-lane-id="' + esc(lane.id) + '" data-tip="Edit swim lane">&#x270E;</button>';
        headerHtml += '<button class="btn-icon danger" data-act="delete-lane" data-lane-id="' + esc(lane.id) + '" data-tip="Delete swim lane & session">&#x2716;</button>';
        headerHtml += '</div>';

        headerEl.innerHTML = headerHtml;
        laneEl.appendChild(headerEl);

        laneEl.appendChild(buildLaneColumns(lane.id));

        return laneEl;
    }

    function buildDefaultLane() {
        var laneEl = document.createElement('div');
        laneEl.className = 'swim-lane';
        laneEl.dataset.laneId = '__default';

        var isCollapsed = !!collapsedLanes[''];
        var chevron = isCollapsed ? '&#x25B6;' : '&#x25BC;';

        var headerEl = document.createElement('div');
        headerEl.className = 'swim-lane-header';
        headerEl.dataset.laneId = '__default';

        var headerHtml = '';
        headerHtml += '<span class="swim-lane-collapse' + (isCollapsed ? ' collapsed' : '') + '">' + chevron + '</span>';
        headerHtml += '<span class="swim-lane-name">Default Lane</span>';
        headerHtml += '<div class="swim-lane-meta">';
        headerHtml += '<span style="opacity:0.4">Tasks without a swim lane</span>';
        headerHtml += '</div>';
        headerHtml += '<div class="swim-lane-actions"></div>';

        headerEl.innerHTML = headerHtml;
        laneEl.appendChild(headerEl);

        laneEl.appendChild(buildLaneColumns(''));

        return laneEl;
    }

    /* ── Render ──────────────────────────────────────────────────────────── */

    function hasTasksForLane(laneId) {
        for (var i = 0; i < tasks.length; i++) {
            if ((tasks[i].swimLaneId || '') === laneId) return true;
        }
        return false;
    }

    function render() {
        board.innerHTML = '';

        // Named swim lanes
        for (var l = 0; l < swimLanes.length; l++) {
            board.appendChild(buildSwimLane(swimLanes[l]));
        }

        // Default lane (always shown if there are unassigned tasks or no swim lanes)
        if (hasTasksForLane('') || swimLanes.length === 0) {
            board.appendChild(buildDefaultLane());
        }
    }

    /* ── Event delegation on board ───────────────────────────────────────── */

    board.addEventListener('click', function(e) {
        // Swim lane header collapse toggle
        var header = e.target.closest('.swim-lane-header');
        if (header) {
            // Don't toggle if clicking action buttons
            if (e.target.closest('.btn-icon')) {
                var editBtn = e.target.closest('[data-act="edit-lane"]');
                if (editBtn) {
                    var laneId = editBtn.dataset.laneId;
                    var lane = null;
                    for (var li = 0; li < swimLanes.length; li++) {
                        if (swimLanes[li].id === laneId) { lane = swimLanes[li]; break; }
                    }
                    if (lane) openEditLaneModal(lane);
                    return;
                }
                var termBtn = e.target.closest('[data-act="open-terminal"]');
                if (termBtn) {
                    var laneId = termBtn.dataset.laneId;
                    vscode.postMessage({ type: 'openLaneTerminal', swimLaneId: laneId });
                    return;
                }
                var debugBtn = e.target.closest('[data-act="debug-window"]');
                if (debugBtn) {
                    var laneId = debugBtn.dataset.laneId;
                    vscode.postMessage({ type: 'createDebugWindow', swimLaneId: laneId });
                    return;
                }
                var restartDebugBtn = e.target.closest('[data-act="restart-debug"]');
                if (restartDebugBtn) {
                    var laneId = restartDebugBtn.dataset.laneId;
                    vscode.postMessage({ type: 'restartDebugWindow', swimLaneId: laneId });
                    return;
                }
                var killBtn = e.target.closest('[data-act="kill-session"]');
                if (killBtn) {
                    var laneId = killBtn.dataset.laneId;
                    vscode.postMessage({ type: 'killLaneSession', swimLaneId: laneId });
                    for (var ki = 0; ki < swimLanes.length; ki++) {
                        if (swimLanes[ki].id === laneId) { swimLanes[ki].sessionActive = false; break; }
                    }
                    render();
                    return;
                }
                var delBtn = e.target.closest('[data-act="delete-lane"]');
                if (delBtn) {
                    var laneId = delBtn.dataset.laneId;
                    vscode.postMessage({ type: 'deleteSwimLane', swimLaneId: laneId });
                    swimLanes = swimLanes.filter(function(l) { return l.id !== laneId; });
                    render();
                }
                return;
            }
            var targetLaneId = header.dataset.laneId;
            var storeKey = targetLaneId === '__default' ? '' : targetLaneId;
            collapsedLanes[storeKey] = !collapsedLanes[storeKey];
            render();
            return;
        }

        // Restart button
        var restartBtn = e.target.closest('[data-act="restart"]');
        if (restartBtn) {
            e.stopPropagation();
            var tid = restartBtn.dataset.tid;
            vscode.postMessage({ type: 'restartTask', taskId: tid });
            return;
        }

        // Attach button
        var attachBtn = e.target.closest('[data-act="attach"]');
        if (attachBtn) {
            e.stopPropagation();
            var tid = attachBtn.dataset.tid;
            vscode.postMessage({ type: 'attachTask', taskId: tid });
            return;
        }

        // Close window button
        var closeBtn = e.target.closest('[data-act="close-window"]');
        if (closeBtn) {
            e.stopPropagation();
            var tid = closeBtn.dataset.tid;
            vscode.postMessage({ type: 'closeTaskWindow', taskId: tid });
            return;
        }

        // Split task box
        var splitBtn = e.target.closest('[data-act="split-box"]');
        if (splitBtn) {
            e.stopPropagation();
            var tid = splitBtn.dataset.tid;
            vscode.postMessage({ type: 'splitTaskBox', taskId: tid });
            return;
        }

        // Column add button
        var addBtn = e.target.closest('.column-add');
        if (addBtn) {
            openTaskModal(addBtn.dataset.col, addBtn.dataset.lane, null);
            return;
        }

        // Card action buttons
        var actBtn = e.target.closest('.card-action-btn');
        if (actBtn) {
            var act = actBtn.dataset.act;
            var tid = actBtn.dataset.tid;
            if (act === 'delete') {
                vscode.postMessage({ type: 'deleteTask', taskId: tid });
                tasks = tasks.filter(function(t) { return t.id !== tid; });
                render();
            } else if (act === 'edit') {
                var task = findTask(tid);
                if (task) openTaskModal(getCol(task), task.swimLaneId || '', task);
            }
            return;
        }

        // Click on card to edit
        var card = e.target.closest('.card');
        if (card && card.dataset.taskId) {
            var t2 = findTask(card.dataset.taskId);
            if (t2) openTaskModal(getCol(t2), t2.swimLaneId || '', t2);
        }
    });

    /* ── Swim Lane Modal ─────────────────────────────────────────────────── */

    function buildServerOptionsHtml() {
        var html = '';
        for (var i = 0; i < servers.length; i++) {
            html += '<option value="' + esc(servers[i].id) + '">' + esc(servers[i].label) + '</option>';
        }
        if (servers.length === 0) {
            html = '<option value="local">Local</option>';
        }
        return html;
    }

    function populateServerDropdown() {
        var html = buildServerOptionsHtml();
        slServer.innerHTML = html;
        favServer.innerHTML = html;
    }

    function openLaneModal(prefill) {
        populateServerDropdown();
        slName.value = (prefill && prefill.name) || '';
        slDir.value = (prefill && prefill.workingDirectory) || '~/';
        slProvider.value = (prefill && prefill.aiProvider) || '';
        if (prefill && prefill.serverId) { slServer.value = prefill.serverId; }
        laneOverlay.classList.add('active');
        slName.focus();
    }

    function closeLaneModal() {
        laneOverlay.classList.remove('active');
    }

    document.getElementById('btn-new-lane').addEventListener('click', openLaneModal);
    document.getElementById('sl-cancel').addEventListener('click', closeLaneModal);
    laneOverlay.addEventListener('click', function(e) {
        if (e.target === laneOverlay) closeLaneModal();
    });

    document.getElementById('sl-submit').addEventListener('click', function() {
        var name = slName.value.trim();
        if (!name) return;
        var serverId = slServer.value;
        var dir = slDir.value.trim() || '~/';
        var context = slContext.value.trim() || undefined;
        var provider = slProvider.value || undefined;
        vscode.postMessage({
            type: 'createSwimLane',
            name: name,
            serverId: serverId,
            workingDirectory: dir,
            contextInstructions: context,
            aiProvider: provider
        });
        closeLaneModal();
    });

    document.getElementById('sl-browse').addEventListener('click', function() {
        vscode.postMessage({ type: 'browseDir', target: 'sl-dir', serverId: slServer.value, currentPath: slDir.value || '~/' });
    });

    /* ── Favourite Folders ───────────────────────────────────────────────── */

    function getServerLabel(serverId) {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].id === serverId) return servers[i].label;
        }
        return serverId;
    }

    function renderFavBar() {
        var html = '<span class="fav-bar-label">Favourites:</span>';
        for (var i = 0; i < favouriteFolders.length; i++) {
            var f = favouriteFolders[i];
            html += '<span class="fav-chip" data-fav-id="' + esc(f.id) + '" title="' + esc(f.workingDirectory) + ' (' + esc(getServerLabel(f.serverId)) + ')">';
            html += '<span class="fav-name">' + esc(f.name) + '</span>';
            html += '<span class="fav-server">[' + esc(getServerLabel(f.serverId)) + ']</span>';
            html += '<span class="fav-del" data-fav-del="' + esc(f.id) + '">&times;</span>';
            html += '</span>';
        }
        html += '<button class="fav-add-btn" id="fav-add-btn" title="Add favourite folder">+</button>';
        favBar.innerHTML = html;

        // Wire add button
        document.getElementById('fav-add-btn').addEventListener('click', openFavModal);

        // Wire chip clicks
        var chips = favBar.querySelectorAll('.fav-chip');
        for (var c = 0; c < chips.length; c++) {
            chips[c].addEventListener('click', function(e) {
                // Ignore if clicking delete button
                if (e.target.classList.contains('fav-del')) return;
                var fid = this.dataset.favId;
                var fav = null;
                for (var j = 0; j < favouriteFolders.length; j++) {
                    if (favouriteFolders[j].id === fid) { fav = favouriteFolders[j]; break; }
                }
                if (fav) openLaneModal({ name: '', serverId: fav.serverId, workingDirectory: fav.workingDirectory });
            });
        }

        // Wire delete buttons
        var dels = favBar.querySelectorAll('.fav-del');
        for (var d = 0; d < dels.length; d++) {
            dels[d].addEventListener('click', function(e) {
                e.stopPropagation();
                vscode.postMessage({ type: 'deleteFavouriteFolder', id: this.dataset.favDel });
            });
        }
    }

    function openFavModal() {
        populateServerDropdown();
        favName.value = '';
        favDir.value = '~/';
        favOverlay.classList.add('active');
        favName.focus();
    }

    function closeFavModal() {
        favOverlay.classList.remove('active');
    }

    document.getElementById('fav-cancel').addEventListener('click', closeFavModal);
    favOverlay.addEventListener('click', function(e) {
        if (e.target === favOverlay) closeFavModal();
    });

    document.getElementById('fav-submit').addEventListener('click', function() {
        var name = favName.value.trim();
        if (!name) return;
        vscode.postMessage({
            type: 'addFavouriteFolder',
            name: name,
            serverId: favServer.value,
            workingDirectory: favDir.value.trim() || '~/'
        });
        closeFavModal();
    });

    document.getElementById('fav-browse').addEventListener('click', function() {
        vscode.postMessage({ type: 'browseDir', target: 'fav-dir', serverId: favServer.value, currentPath: favDir.value || '~/' });
    });

    /* ── Edit Swim Lane Modal ────────────────────────────────────────────── */

    var editLaneOverlay = document.getElementById('edit-lane-modal-overlay');
    var elName = document.getElementById('el-name');
    var elSession = document.getElementById('el-session');
    var elDir = document.getElementById('el-dir');
    var elProvider = document.getElementById('el-provider');
    var elContext = document.getElementById('el-context');
    var editingLaneId = null;
    var editingLaneServerId = null;

    function openEditLaneModal(lane) {
        editingLaneId = lane.id;
        editingLaneServerId = lane.serverId || 'local';
        elName.value = lane.name || '';
        elSession.value = lane.sessionName || '';
        elDir.value = lane.workingDirectory || '~/';
        elProvider.value = lane.aiProvider || '';
        elContext.value = lane.contextInstructions || '';
        editLaneOverlay.classList.add('active');
        elName.focus();
    }

    function closeEditLaneModal() {
        editLaneOverlay.classList.remove('active');
        editingLaneId = null;
    }

    document.getElementById('el-cancel').addEventListener('click', closeEditLaneModal);
    editLaneOverlay.addEventListener('click', function(e) {
        if (e.target === editLaneOverlay) closeEditLaneModal();
    });

    document.getElementById('el-submit').addEventListener('click', function() {
        if (!editingLaneId) return;
        var name = elName.value.trim();
        var session = elSession.value.trim();
        var dir = elDir.value.trim();
        if (!name) return;
        var provider = elProvider.value || undefined;
        var context = elContext.value.trim() || undefined;
        vscode.postMessage({
            type: 'editSwimLane',
            swimLaneId: editingLaneId,
            name: name,
            sessionName: session,
            workingDirectory: dir,
            aiProvider: provider,
            contextInstructions: context
        });
        // Update local state
        for (var i = 0; i < swimLanes.length; i++) {
            if (swimLanes[i].id === editingLaneId) {
                swimLanes[i].name = name;
                if (session) swimLanes[i].sessionName = session;
                if (dir) swimLanes[i].workingDirectory = dir;
                swimLanes[i].aiProvider = provider;
                swimLanes[i].contextInstructions = context;
                break;
            }
        }
        closeEditLaneModal();
        render();
    });

    document.getElementById('el-browse').addEventListener('click', function() {
        vscode.postMessage({ type: 'browseDir', target: 'el-dir', serverId: editingLaneServerId || 'local', currentPath: elDir.value || '~/' });
    });

    /* ── Task Modal ──────────────────────────────────────────────────────── */

    function populateLaneDropdown(selectedLaneId) {
        var html = '<option value="">Default Lane</option>';
        for (var i = 0; i < swimLanes.length; i++) {
            var sel = swimLanes[i].id === selectedLaneId ? ' selected' : '';
            html += '<option value="' + esc(swimLanes[i].id) + '"' + sel + '>' + esc(swimLanes[i].name) + '</option>';
        }
        tmLane.innerHTML = html;
        if (!selectedLaneId) tmLane.value = '';
    }

    function openTaskModal(column, laneId, task) {
        modalColumn = column;
        modalSwimLaneId = laneId || '';
        editingTaskId = task ? task.id : null;
        tmTitle.textContent = task ? 'Edit Task' : 'New Task';
        tmSubmit.textContent = task ? 'Save' : 'Create';
        // Reset AI generate field and overlay
        tmAiInput.value = '';
        tmaAiGen.disabled = false;
        tmaAiGen.innerHTML = '&#x2728; Generate';
        hideAiOverlay();
        var ovSpn = aiGenOverlay.querySelector('.spinner-lg');
        if (ovSpn) ovSpn.style.display = '';
        var ovLbl = aiGenOverlay.querySelector('.label');
        if (ovLbl) ovLbl.textContent = 'Generating with AI...';
        tmDesc.value = task ? (task.description || '') : '';
        tmInput.value = task ? (task.input || '') : '';
        tmRole.value = task ? (task.targetRole || '') : '';
        tmPriority.value = task ? (task.priority || 5) : 5;
        tmPriorityVal.textContent = tmPriority.value;
        updatePriorityColor();
        populateLaneDropdown(task ? (task.swimLaneId || '') : (laneId || ''));
        task && task.autoStart ? tmAutoStart.classList.add('active') : tmAutoStart.classList.remove('active');
        task && task.autoPilot ? tmAutoPilot.classList.add('active') : tmAutoPilot.classList.remove('active');
        task && task.autoClose ? tmAutoClose.classList.add('active') : tmAutoClose.classList.remove('active');
        if (task && task.output) {
            tmOutput.textContent = task.output;
            tmOutputField.style.display = '';
        } else {
            tmOutput.textContent = '';
            tmOutputField.style.display = 'none';
        }

        // Show/hide action buttons based on edit vs create
        if (task) {
            tmTaskActions.classList.add('active');
            var col = getCol(task);
            var hasTmux = !!task.tmuxSessionName;
            var hasLane = !!task.swimLaneId;
            // Start: show for backlog/todo tasks with a lane
            tmaStart.style.display = (hasLane && (col === 'backlog' || col === 'todo')) ? '' : 'none';
            // Attach: show for tasks with a tmux window
            tmaAttach.style.display = hasTmux ? '' : 'none';
            // Restart: show for in_progress/in_review/done tasks with a lane
            tmaRestart.style.display = (hasLane && (col === 'in_progress' || col === 'in_review' || col === 'done')) ? '' : 'none';
            // Summarize: show for tasks with a tmux window (typically done tasks still running)
            tmaSummarize.style.display = hasTmux ? '' : 'none';
            // Close Window: show for done tasks with a tmux window
            tmaCloseWindow.style.display = (hasTmux && col === 'done') ? '' : 'none';
            // Delete: always show in edit mode
            tmaDelete.style.display = '';
        } else {
            tmTaskActions.classList.remove('active');
        }

        taskOverlay.classList.add('active');
        tmDesc.focus();
    }

    function closeTaskModal() {
        taskOverlay.classList.remove('active');
        editingTaskId = null;
    }

    function updatePriorityColor() {
        var v = parseInt(tmPriority.value, 10);
        tmPriorityVal.style.color = priColor(v);
    }

    tmPriority.addEventListener('input', function() {
        tmPriorityVal.textContent = tmPriority.value;
        updatePriorityColor();
    });

    document.getElementById('tm-cancel').addEventListener('click', closeTaskModal);
    taskOverlay.addEventListener('click', function(e) {
        if (e.target === taskOverlay) closeTaskModal();
    });

    tmSubmit.addEventListener('click', function() {
        var title = tmDesc.value.trim();
        if (!title) return;
        var pri = parseInt(tmPriority.value, 10) || 5;
        var role = tmRole.value || undefined;
        var desc = tmInput.value.trim() || undefined;
        var laneId = tmLane.value || '';

        var autoStart = tmAutoStart.classList.contains('active');
        var autoPilot = tmAutoPilot.classList.contains('active');
        var autoClose = tmAutoClose.classList.contains('active');

        if (editingTaskId) {
            vscode.postMessage({
                type: 'editTask',
                taskId: editingTaskId,
                updates: {
                    description: title,
                    input: desc,
                    targetRole: role,
                    priority: pri,
                    swimLaneId: laneId || undefined,
                    autoStart: autoStart,
                    autoPilot: autoPilot,
                    autoClose: autoClose
                }
            });
            var t = findTask(editingTaskId);
            if (t) {
                t.description = title;
                t.input = desc;
                t.targetRole = role;
                t.priority = pri;
                t.swimLaneId = laneId || undefined;
                t.autoStart = autoStart;
                t.autoPilot = autoPilot;
                t.autoClose = autoClose;
            }
        } else {
            vscode.postMessage({
                type: 'createTask',
                description: title,
                input: desc,
                targetRole: role,
                priority: pri,
                kanbanColumn: modalColumn,
                swimLaneId: laneId,
                autoStart: autoStart,
                autoPilot: autoPilot,
                autoClose: autoClose
            });
        }
        closeTaskModal();
        render();
    });

    /* ── Task Edit Action Buttons ──────────────────────────────────────── */
    tmaStart.addEventListener('click', function() {
        if (!editingTaskId) return;
        vscode.postMessage({ type: 'startTask', taskId: editingTaskId });
        closeTaskModal();
        render();
    });
    tmaAttach.addEventListener('click', function() {
        if (!editingTaskId) return;
        vscode.postMessage({ type: 'attachTask', taskId: editingTaskId });
        closeTaskModal();
    });
    tmaRestart.addEventListener('click', function() {
        if (!editingTaskId) return;
        vscode.postMessage({ type: 'restartTask', taskId: editingTaskId });
        closeTaskModal();
        render();
    });
    tmaSummarize.addEventListener('click', function() {
        if (!editingTaskId) return;
        tmaSummarize.disabled = true;
        tmaSummarize.innerHTML = '<span class="spinner-sm"></span> Summarizing...';
        vscode.postMessage({ type: 'summarizeTask', taskId: editingTaskId });
    });
    tmaCloseWindow.addEventListener('click', function() {
        if (!editingTaskId) return;
        vscode.postMessage({ type: 'closeTaskWindow', taskId: editingTaskId });
        closeTaskModal();
        render();
    });
    tmaDelete.addEventListener('click', function() {
        if (!editingTaskId) return;
        vscode.postMessage({ type: 'deleteTask', taskId: editingTaskId });
        closeTaskModal();
        render();
    });

    /* ── AI Generate ───────────────────────────────────────────────────── */
    function showAiOverlay() {
        aiGenAborted = false;
        aiGenError.style.display = 'none';
        aiGenError.textContent = '';
        aiGenOverlay.classList.add('active');
    }
    function hideAiOverlay() {
        aiGenOverlay.classList.remove('active');
    }

    tmaAiGen.addEventListener('click', function() {
        var text = tmAiInput.value.trim();
        if (!text) return;

        tmaAiGen.disabled = true;
        tmaAiGen.innerHTML = '<span class="spinner-sm"></span> Generating...';
        showAiOverlay();

        vscode.postMessage({
            type: 'aiExpandTask',
            text: text,
            currentTitle: tmDesc.value.trim(),
            currentInput: tmInput.value.trim()
        });
    });

    aiGenCancel.addEventListener('click', function() {
        aiGenAborted = true;
        hideAiOverlay();
        tmaAiGen.disabled = false;
        tmaAiGen.innerHTML = '&#x2728; Generate';
    });

    /* ── Keyboard shortcuts ──────────────────────────────────────────────── */

    document.addEventListener('keydown', function(e) {
        var laneActive = laneOverlay.classList.contains('active');
        var taskActive = taskOverlay.classList.contains('active');
        var editLaneActive = editLaneOverlay.classList.contains('active');
        if (!laneActive && !taskActive && !editLaneActive) return;

        if (e.key === 'Escape') {
            if (laneActive) closeLaneModal();
            if (taskActive) closeTaskModal();
            if (editLaneActive) closeEditLaneModal();
        }

        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (laneActive) document.getElementById('sl-submit').click();
            if (taskActive) tmSubmit.click();
            if (editLaneActive) document.getElementById('el-submit').click();
        }
    });

    /* ── Refresh ─────────────────────────────────────────────────────────── */

    document.getElementById('btn-refresh').addEventListener('click', function() {
        vscode.postMessage({ type: 'refresh' });
    });

    /* ── Import from Tmux ────────────────────────────────────────────────── */

    var importOverlay = document.getElementById('import-modal-overlay');
    var importContent = document.getElementById('import-content');
    var importSubmit = document.getElementById('import-submit');
    var importSessions = [];  // populated by extension response

    document.getElementById('btn-import-tmux').addEventListener('click', function() {
        importContent.innerHTML = '<div class="import-loading"><div class="spinner"></div>Scanning tmux sessions...</div>';
        importSubmit.disabled = true;
        importSessions = [];
        importOverlay.classList.add('active');
        vscode.postMessage({ type: 'scanTmuxSessions' });
    });

    document.getElementById('import-cancel').addEventListener('click', function() {
        importOverlay.classList.remove('active');
    });
    importOverlay.addEventListener('click', function(e) {
        if (e.target === importOverlay) importOverlay.classList.remove('active');
    });

    function renderImportList() {
        if (importSessions.length === 0) {
            importContent.innerHTML = '<div class="import-loading" style="opacity:0.5">No tmux sessions found</div>';
            importSubmit.disabled = true;
            return;
        }
        var html = '<div class="import-sessions-list">';
        for (var i = 0; i < importSessions.length; i++) {
            var s = importSessions[i];
            var allImported = s.windows.every(function(w) { return w.alreadyImported; });
            var hasNewWindows = s.windows.some(function(w) { return !w.alreadyImported; });
            html += '<div class="import-session-item" style="flex-direction:column">';
            html += '<div style="display:flex;align-items:flex-start;gap:8px;width:100%">';
            html += '<input type="checkbox" class="import-session-check" data-idx="' + i + '"' + (hasNewWindows && !allImported ? ' checked' : '') + (allImported ? ' disabled' : '') + ' />';
            html += '<div class="import-session-info">';
            html += '<div class="import-session-name">' + esc(s.sessionName);
            if (s.existingLaneId) html += '<span class="import-already-tag">imported</span>';
            html += '</div>';
            html += '<div class="import-session-meta">';
            html += '<span>server: ' + esc(s.serverLabel) + '</span>';
            html += '<span>' + s.windowCount + ' windows</span>';
            if (s.workingDir) html += '<span>dir: ' + esc(s.workingDir) + '</span>';
            html += '</div>';
            if (s.summary) html += '<div class="import-session-summary">' + esc(s.summary) + '</div>';
            html += '</div></div>';
            // Window list
            html += '<div class="import-window-list">';
            for (var j = 0; j < s.windows.length; j++) {
                var w = s.windows[j];
                html += '<div class="import-window-item' + (w.alreadyImported ? ' imported-dim' : '') + '">';
                html += '<input type="checkbox" class="import-window-check" data-sidx="' + i + '" data-widx="' + j + '"';
                if (w.alreadyImported) {
                    html += ' checked disabled';
                } else if (hasNewWindows) {
                    html += ' checked';
                }
                html += ' />';
                html += '<span class="import-window-name">' + esc(w.name || 'Window ' + w.index) + '</span>';
                if (w.alreadyImported) html += '<span class="import-already-tag">already imported</span>';
                html += '<span class="import-window-meta">' + esc(w.command || 'shell');
                if (w.paneCount > 1) html += ' &middot; ' + w.paneCount + ' panes';
                html += '</span>';
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';
        importContent.innerHTML = html;
        updateImportSubmitState();
    }

    function updateImportSubmitState() {
        var anySelected = false;
        var windowChecks = importContent.querySelectorAll('.import-window-check:not([disabled])');
        for (var k = 0; k < windowChecks.length; k++) {
            if (windowChecks[k].checked) { anySelected = true; break; }
        }
        importSubmit.disabled = !anySelected;
    }

    importContent.addEventListener('change', function(e) {
        var sessionCb = e.target.closest('.import-session-check');
        if (sessionCb) {
            var idx = parseInt(sessionCb.dataset.idx, 10);
            var checked = sessionCb.checked;
            // Toggle all non-imported window checkboxes in this session
            var windowCbs = importContent.querySelectorAll('.import-window-check[data-sidx="' + idx + '"]:not([disabled])');
            for (var k = 0; k < windowCbs.length; k++) { windowCbs[k].checked = checked; }
            updateImportSubmitState();
            return;
        }
        var windowCb = e.target.closest('.import-window-check');
        if (windowCb) {
            var sidx = parseInt(windowCb.dataset.sidx, 10);
            // Sync session checkbox: checked if any non-disabled window is checked
            var sessionCheck = importContent.querySelector('.import-session-check[data-idx="' + sidx + '"]');
            if (sessionCheck && !sessionCheck.disabled) {
                var winCbs = importContent.querySelectorAll('.import-window-check[data-sidx="' + sidx + '"]:not([disabled])');
                var anyChecked = false;
                for (var k = 0; k < winCbs.length; k++) { if (winCbs[k].checked) { anyChecked = true; break; } }
                sessionCheck.checked = anyChecked;
            }
            updateImportSubmitState();
        }
    });

    importSubmit.addEventListener('click', function() {
        // Build payload with selectedWindows per session
        var sessionsPayload = [];
        for (var i = 0; i < importSessions.length; i++) {
            var s = importSessions[i];
            var selectedWindows = [];
            for (var j = 0; j < s.windows.length; j++) {
                var w = s.windows[j];
                if (w.alreadyImported) continue;
                var cb = importContent.querySelector('.import-window-check[data-sidx="' + i + '"][data-widx="' + j + '"]');
                if (cb && cb.checked) {
                    selectedWindows.push(w);
                }
            }
            if (selectedWindows.length > 0) {
                sessionsPayload.push({
                    serverId: s.serverId,
                    serverLabel: s.serverLabel,
                    sessionName: s.sessionName,
                    workingDir: s.workingDir,
                    existingLaneId: s.existingLaneId || null,
                    selectedWindows: selectedWindows
                });
            }
        }
        if (sessionsPayload.length === 0) return;
        vscode.postMessage({ type: 'importTmuxSessions', sessions: sessionsPayload });
        importOverlay.classList.remove('active');
    });

    /* ── Messages from extension ─────────────────────────────────────────── */

    window.addEventListener('message', function(e) {
        var msg = e.data;
        if (msg.type === 'updateState') {
            tasks = msg.tasks || [];
            swimLanes = msg.swimLanes || [];
            servers = msg.servers || [];
            favouriteFolders = msg.favouriteFolders || [];
            renderFavBar();
            render();
        }
        if (msg.type === 'tmuxScanResult') {
            importSessions = (msg.sessions || []).map(function(s) { s.selected = true; return s; });
            renderImportList();
        }
        if (msg.type === 'browseDirResult' && msg.target && msg.path) {
            var targetEl = document.getElementById(msg.target);
            if (targetEl) targetEl.value = msg.path;
        }
        if (msg.type === 'summarizeResult') {
            tmaSummarize.disabled = false;
            tmaSummarize.innerHTML = '&#x1F4DD; Summarize';
            if (msg.success) {
                // Refresh the modal input with updated description
                var t = findTask(msg.taskId);
                if (t) { tmInput.value = t.input || ''; }
            }
        }
        if (msg.type === 'aiExpandResult') {
            tmaAiGen.disabled = false;
            tmaAiGen.innerHTML = '&#x2728; Generate';
            if (aiGenAborted) return; // user cancelled, ignore result
            if (msg.error) {
                // Show error in overlay instead of hiding it
                aiGenError.textContent = msg.error;
                aiGenError.style.display = 'block';
                // Change overlay label
                var lbl = aiGenOverlay.querySelector('.label');
                if (lbl) lbl.textContent = 'Generation failed';
                var spn = aiGenOverlay.querySelector('.spinner-lg');
                if (spn) spn.style.display = 'none';
                return;
            }
            hideAiOverlay();
            if (msg.title) tmDesc.value = msg.title;
            if (msg.description) tmInput.value = msg.description;
            if (msg.role) tmRole.value = msg.role;
        }
    });

    /* ── Initial render ──────────────────────────────────────────────────── */
    render();
})();
</script>
</body>
</html>`;
    }
}
