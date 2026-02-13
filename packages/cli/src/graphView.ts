import * as vscode from 'vscode';
import { Pipeline, PipelineRun } from './core/types';

export class GraphViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private currentPipeline: Pipeline | undefined;
    private currentRun: PipelineRun | undefined;
    private _onAction = new vscode.EventEmitter<{action: string, payload: any}>();
    public readonly onAction = this._onAction.event;

    constructor(private readonly extensionUri: vscode.Uri) {}

    show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'tmux-agents-graph',
            'Pipeline Graph',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtml(this.panel.webview);

        this.panel.webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
                case 'runPipeline':
                    this._onAction.fire({ action: 'runPipeline', payload: { pipelineId: msg.pipelineId } });
                    break;
                case 'savePipeline':
                    this._onAction.fire({ action: 'savePipeline', payload: { pipeline: msg.pipeline } });
                    break;
                case 'addStage':
                    this._onAction.fire({ action: 'addStage', payload: { pipelineId: msg.pipelineId } });
                    break;
                case 'updateStage':
                    this._onAction.fire({ action: 'updateStage', payload: { pipelineId: msg.pipelineId, stage: msg.stage } });
                    break;
                case 'removeStage':
                    this._onAction.fire({ action: 'removeStage', payload: { pipelineId: msg.pipelineId, stageId: msg.stageId } });
                    break;
                case 'selectPipeline':
                    this._onAction.fire({ action: 'selectPipeline', payload: {} });
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // If we already have pipeline data, send it
        if (this.currentPipeline) {
            this.setPipeline(this.currentPipeline, this.currentRun);
        }
    }

    setPipeline(pipeline: Pipeline, run?: PipelineRun): void {
        this.currentPipeline = pipeline;
        this.currentRun = run;
        this.panel?.webview.postMessage({ type: 'setPipeline', pipeline, run });
    }

    updateRun(run: PipelineRun): void {
        this.currentRun = run;
        this.panel?.webview.postMessage({ type: 'updateRun', run });
    }

    dispose(): void {
        this._onAction.dispose();
        this.panel?.dispose();
    }

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
/* ── Reset & Base ────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    width: 100%; height: 100%; overflow: hidden;
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
}
button {
    font-family: inherit; font-size: inherit; cursor: pointer;
    border: none; outline: none;
}
input, textarea, select {
    font-family: inherit; font-size: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px; padding: 4px 8px; outline: none;
}
input:focus, textarea:focus, select:focus { border-color: var(--vscode-focusBorder); }
textarea { resize: vertical; }

/* ── Layout ──────────────────────────────────────────────────────────── */
#app { display: flex; flex-direction: column; height: 100vh; }

/* ── Toolbar ─────────────────────────────────────────────────────────── */
#toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-titleBar-activeBackground));
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0; min-height: 44px;
    z-index: 100;
}
#toolbar .pipeline-name {
    font-size: 15px; font-weight: 600;
    cursor: text; padding: 2px 6px; border-radius: 3px;
    transition: background 0.15s;
    max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#toolbar .pipeline-name:hover { background: var(--vscode-input-background); }
#toolbar .pipeline-name input {
    font-size: 15px; font-weight: 600; width: 240px;
}
#toolbar .pipeline-desc {
    font-size: 12px; opacity: 0.6; flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.toolbar-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 12px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
}
.toolbar-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}
.toolbar-btn.primary:hover { background: var(--vscode-button-hoverBackground); }
.toolbar-btn.secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}
.toolbar-btn.secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15));
}
.toolbar-btn.danger { color: var(--vscode-errorForeground); background: transparent; }
.toolbar-btn.danger:hover { background: rgba(255,80,80,0.12); }
.toolbar-sep { width: 1px; height: 20px; background: var(--vscode-panel-border); margin: 0 4px; }

.status-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.status-badge.draft { background: rgba(150,150,150,0.2); color: #999; }
.status-badge.running { background: rgba(59,130,246,0.2); color: #60a5fa; }
.status-badge.paused { background: rgba(250,204,21,0.2); color: #fbbf24; }
.status-badge.completed { background: rgba(34,197,94,0.2); color: #4ade80; }
.status-badge.failed { background: rgba(239,68,68,0.2); color: #f87171; }

@keyframes pulse-badge { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.status-badge.running { animation: pulse-badge 2s ease-in-out infinite; }

/* ── Main Container ──────────────────────────────────────────────────── */
#main { display: flex; flex: 1; min-height: 0; position: relative; }

/* ── Canvas Area ─────────────────────────────────────────────────────── */
#canvas-container {
    flex: 1; overflow: hidden; position: relative; cursor: grab;
}
#canvas-container.dragging { cursor: grabbing; }
#canvas-container.no-pipeline {
    display: flex; align-items: center; justify-content: center;
    cursor: default;
}

/* Blueprint grid background */
#canvas-container::before {
    content: ''; position: absolute; inset: 0;
    background-image:
        linear-gradient(rgba(100,150,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100,150,255,0.04) 1px, transparent 1px),
        linear-gradient(rgba(100,150,255,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(100,150,255,0.08) 1px, transparent 1px);
    background-size: 20px 20px, 20px 20px, 100px 100px, 100px 100px;
    pointer-events: none; z-index: 0;
}

#canvas-transform {
    position: absolute; top: 0; left: 0;
    transform-origin: 0 0;
    will-change: transform;
}

/* ── Empty State ─────────────────────────────────────────────────────── */
.empty-state {
    text-align: center; padding: 40px; max-width: 400px;
}
.empty-state svg { margin-bottom: 16px; opacity: 0.3; }
.empty-state h2 {
    font-size: 18px; font-weight: 600; margin-bottom: 8px;
    opacity: 0.8;
}
.empty-state p { font-size: 13px; opacity: 0.5; margin-bottom: 20px; line-height: 1.5; }

/* ── SVG Edges ───────────────────────────────────────────────────────── */
#edge-svg {
    position: absolute; top: 0; left: 0;
    pointer-events: none; overflow: visible;
    z-index: 1;
}
.edge-path {
    fill: none; stroke-width: 2; stroke-linecap: round;
    transition: stroke 0.4s, stroke-dasharray 0.4s;
}
.edge-path.pending { stroke: var(--vscode-editorWidget-border, #555); opacity: 0.4; }
.edge-path.in_progress {
    stroke: #3b82f6; stroke-dasharray: 8 4; opacity: 0.9;
}
.edge-path.completed { stroke: #22c55e; opacity: 0.8; }
.edge-path.failed { stroke: #ef4444; opacity: 0.7; }

@keyframes dash-flow { to { stroke-dashoffset: -24; } }
.edge-path.in_progress { animation: dash-flow 1s linear infinite; }

.edge-arrow {
    fill: var(--vscode-editorWidget-border, #555); opacity: 0.5;
    transition: fill 0.4s, opacity 0.4s;
}
.edge-arrow.completed { fill: #22c55e; opacity: 0.8; }
.edge-arrow.in_progress { fill: #3b82f6; opacity: 0.9; }
.edge-arrow.failed { fill: #ef4444; opacity: 0.7; }

/* ── Graph Nodes ─────────────────────────────────────────────────────── */
.graph-node {
    position: absolute; z-index: 10;
    width: 180px; min-height: 80px;
    background: var(--vscode-editor-background);
    border: 2px solid var(--vscode-editorWidget-border, #444);
    border-radius: 10px; padding: 12px 14px;
    cursor: pointer; user-select: none;
    transition: border-color 0.3s, box-shadow 0.3s, transform 0.15s, opacity 0.3s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.graph-node:hover {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    transform: translateY(-1px);
}
.graph-node.selected {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 0 0 2px var(--vscode-focusBorder), 0 4px 20px rgba(0,0,0,0.3);
}

/* Node status states */
.graph-node.status-pending { opacity: 0.55; border-color: #666; }
.graph-node.status-in_progress {
    border-color: #3b82f6; opacity: 1;
    box-shadow: 0 0 12px rgba(59,130,246,0.35), 0 2px 8px rgba(0,0,0,0.25);
}
@keyframes node-pulse {
    0%, 100% { box-shadow: 0 0 12px rgba(59,130,246,0.35), 0 2px 8px rgba(0,0,0,0.25); }
    50% { box-shadow: 0 0 24px rgba(59,130,246,0.55), 0 2px 8px rgba(0,0,0,0.25); }
}
.graph-node.status-in_progress { animation: node-pulse 2s ease-in-out infinite; }
.graph-node.status-completed {
    border-color: #22c55e; opacity: 1;
    box-shadow: 0 0 8px rgba(34,197,94,0.2), 0 2px 8px rgba(0,0,0,0.25);
}
.graph-node.status-failed {
    border-color: #ef4444; opacity: 1;
    box-shadow: 0 0 8px rgba(239,68,68,0.25), 0 2px 8px rgba(0,0,0,0.25);
}
@keyframes node-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-3px); }
    40% { transform: translateX(3px); }
    60% { transform: translateX(-2px); }
    80% { transform: translateX(2px); }
}
.graph-node.shake { animation: node-shake 0.4s ease-in-out; }

.node-header {
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.node-name {
    font-size: 13px; font-weight: 600; flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.node-status-icon {
    width: 18px; height: 18px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; border-radius: 50%;
}
.node-status-icon.completed { background: rgba(34,197,94,0.2); color: #4ade80; }
.node-status-icon.failed { background: rgba(239,68,68,0.2); color: #f87171; }
.node-status-icon.in_progress { background: rgba(59,130,246,0.2); color: #60a5fa; }

@keyframes spin-icon { to { transform: rotate(360deg); } }
.node-status-icon.in_progress svg { animation: spin-icon 1.5s linear infinite; }

.node-meta {
    display: flex; align-items: center; gap: 6px;
    flex-wrap: wrap;
}
.role-badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 7px; border-radius: 8px; font-size: 10px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
}
.role-badge.coder { background: rgba(75,156,211,0.2); color: #4B9CD3; }
.role-badge.reviewer { background: rgba(155,89,182,0.2); color: #9B59B6; }
.role-badge.tester { background: rgba(46,204,113,0.2); color: #2ECC71; }
.role-badge.devops { background: rgba(230,126,34,0.2); color: #E67E22; }
.role-badge.researcher { background: rgba(26,188,156,0.2); color: #1ABC9C; }
.role-badge.custom { background: rgba(149,165,166,0.2); color: #95A5A6; }

.type-icon {
    display: inline-flex; align-items: center;
    opacity: 0.6; flex-shrink: 0;
}

/* ── Detail Panel ────────────────────────────────────────────────────── */
#detail-panel {
    width: 0; overflow: hidden;
    border-left: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    transition: width 0.25s ease;
    flex-shrink: 0; display: flex; flex-direction: column;
}
#detail-panel.open { width: 320px; }

.detail-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
.detail-header h3 { font-size: 14px; font-weight: 600; }
.detail-close {
    background: transparent; color: var(--vscode-foreground); opacity: 0.6;
    font-size: 18px; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 3px;
}
.detail-close:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

.detail-body {
    flex: 1; overflow-y: auto; padding: 16px;
}

.field-group { margin-bottom: 14px; }
.field-group label {
    display: block; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    opacity: 0.6; margin-bottom: 4px;
}
.field-group input,
.field-group textarea,
.field-group select {
    width: 100%;
}
.field-group textarea { min-height: 80px; }

.deps-list { display: flex; flex-direction: column; gap: 4px; }
.dep-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; padding: 3px 0;
}
.dep-item input[type="checkbox"] {
    width: 14px; height: 14px; cursor: pointer;
    accent-color: var(--vscode-focusBorder);
}
.dep-item label { cursor: pointer; }

.detail-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}

/* ── Minimap ─────────────────────────────────────────────────────────── */
#minimap {
    position: absolute; bottom: 12px; right: 12px;
    width: 160px; height: 100px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; opacity: 0.75;
    z-index: 50; overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
#minimap:hover { opacity: 1; }
#minimap canvas { width: 100%; height: 100%; }

/* ── Zoom Controls ───────────────────────────────────────────────────── */
#zoom-controls {
    position: absolute; bottom: 12px; left: 12px;
    display: flex; gap: 4px; z-index: 50;
}
.zoom-btn {
    width: 30px; height: 30px; border-radius: 6px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 600;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    transition: background 0.15s;
}
.zoom-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
#zoom-level {
    padding: 0 8px; height: 30px; border-radius: 6px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    min-width: 48px;
}
</style>
</head>
<body>

<div id="app">
    <div id="toolbar">
        <span class="pipeline-name" id="pipeline-name">No Pipeline</span>
        <span class="pipeline-desc" id="pipeline-desc"></span>
        <div id="run-status-badge" class="status-badge draft" style="display:none;"></div>
        <div class="toolbar-sep"></div>
        <button class="toolbar-btn secondary" id="btn-select" title="Select a pipeline">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4l7 7 7-7H1z"/></svg>
            Select
        </button>
        <button class="toolbar-btn secondary" id="btn-add-stage" title="Add a new stage" disabled>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            Stage
        </button>
        <button class="toolbar-btn secondary" id="btn-save" title="Save pipeline" disabled>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.35 2H2.65A.65.65 0 002 2.65v10.7c0 .36.29.65.65.65h10.7c.36 0 .65-.29.65-.65V2.65a.65.65 0 00-.65-.65zM5 3h6v3H5V3zm7 10H4V9h8v4z"/></svg>
            Save
        </button>
        <button class="toolbar-btn primary" id="btn-run" title="Run pipeline" disabled>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
            Run
        </button>
        <button class="toolbar-btn danger" id="btn-delete" title="Delete pipeline" disabled style="margin-left:4px;">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 1h5a.5.5 0 01.5.5V3h3.5a.5.5 0 010 1H13v9.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13.5V4H1.5a.5.5 0 010-1H5V1.5a.5.5 0 01.5-.5zM6 2v1h4V2H6zM4 4v9.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V4H4z"/></svg>
        </button>
    </div>

    <div id="main">
        <div id="canvas-container" class="no-pipeline">
            <div class="empty-state" id="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <rect x="2" y="3" width="7" height="5" rx="1.5"/>
                    <rect x="15" y="3" width="7" height="5" rx="1.5"/>
                    <rect x="8.5" y="16" width="7" height="5" rx="1.5"/>
                    <path d="M5.5 8v3a2 2 0 002 2h9a2 2 0 002-2V8" stroke-dasharray="3 2"/>
                    <path d="M12 13v3"/>
                </svg>
                <h2>Pipeline Graph</h2>
                <p>Select a pipeline to visualize its stages as an interactive node graph, or create a new one.</p>
                <button class="toolbar-btn primary" id="btn-empty-select">Select Pipeline</button>
            </div>

            <svg id="edge-svg"></svg>
            <div id="canvas-transform"></div>
        </div>

        <div id="detail-panel">
            <div class="detail-header">
                <h3>Stage Details</h3>
                <button class="detail-close" id="detail-close">&times;</button>
            </div>
            <div class="detail-body" id="detail-body"></div>
            <div class="detail-footer">
                <button class="toolbar-btn danger" id="btn-remove-stage" style="width:100%;justify-content:center;">
                    Remove Stage
                </button>
            </div>
        </div>

        <div id="zoom-controls">
            <button class="zoom-btn" id="zoom-out" title="Zoom out">&minus;</button>
            <div id="zoom-level">100%</div>
            <button class="zoom-btn" id="zoom-in" title="Zoom in">+</button>
            <button class="zoom-btn" id="zoom-fit" title="Fit to view" style="font-size:12px;">&#x2922;</button>
        </div>

        <div id="minimap">
            <canvas id="minimap-canvas"></canvas>
        </div>
    </div>
</div>

<script>
(function() {
    const vscode = acquireVsCodeApi();

    // ── State ───────────────────────────────────────────────────────────
    let pipeline = null;
    let run = null;
    let selectedStageId = null;
    let nodePositions = {};   // stageId -> { x, y }
    let transform = { x: 60, y: 60, scale: 1 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panTransformStart = { x: 0, y: 0 };

    // ── Constants ───────────────────────────────────────────────────────
    const NODE_W = 180;
    const NODE_H = 84;
    const LAYER_GAP_X = 220;
    const LAYER_GAP_Y = 110;
    const CANVAS_PADDING = 80;

    const ROLE_COLORS = {
        coder: '#4B9CD3',
        reviewer: '#9B59B6',
        tester: '#2ECC71',
        devops: '#E67E22',
        researcher: '#1ABC9C',
        custom: '#95A5A6'
    };

    const TYPE_LABELS = {
        sequential: 'Seq',
        parallel: 'Par',
        conditional: 'Cond',
        fan_out: 'Fan'
    };

    // ── DOM refs ────────────────────────────────────────────────────────
    const canvasContainer = document.getElementById('canvas-container');
    const canvasTransform = document.getElementById('canvas-transform');
    const edgeSvg = document.getElementById('edge-svg');
    const emptyState = document.getElementById('empty-state');
    const detailPanel = document.getElementById('detail-panel');
    const detailBody = document.getElementById('detail-body');
    const zoomLevel = document.getElementById('zoom-level');
    const pipelineName = document.getElementById('pipeline-name');
    const pipelineDesc = document.getElementById('pipeline-desc');
    const runStatusBadge = document.getElementById('run-status-badge');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');

    // ── Toolbar buttons ─────────────────────────────────────────────────
    document.getElementById('btn-select').addEventListener('click', () => {
        vscode.postMessage({ type: 'selectPipeline' });
    });
    document.getElementById('btn-empty-select').addEventListener('click', () => {
        vscode.postMessage({ type: 'selectPipeline' });
    });
    document.getElementById('btn-run').addEventListener('click', () => {
        if (pipeline) { vscode.postMessage({ type: 'runPipeline', pipelineId: pipeline.id }); }
    });
    document.getElementById('btn-save').addEventListener('click', () => {
        if (pipeline) { vscode.postMessage({ type: 'savePipeline', pipeline: pipeline }); }
    });
    document.getElementById('btn-add-stage').addEventListener('click', () => {
        if (pipeline) { vscode.postMessage({ type: 'addStage', pipelineId: pipeline.id }); }
    });
    document.getElementById('btn-delete').addEventListener('click', () => {
        if (pipeline) { vscode.postMessage({ type: 'deletePipeline', pipelineId: pipeline.id }); }
    });
    document.getElementById('detail-close').addEventListener('click', () => {
        closeDetailPanel();
    });
    document.getElementById('btn-remove-stage').addEventListener('click', () => {
        if (pipeline && selectedStageId) {
            vscode.postMessage({ type: 'removeStage', pipelineId: pipeline.id, stageId: selectedStageId });
        }
    });

    // Pipeline name editing
    pipelineName.addEventListener('click', () => {
        if (!pipeline) { return; }
        const currentName = pipeline.name;
        pipelineName.innerHTML = '';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = currentName;
        inp.addEventListener('blur', () => { finishNameEdit(inp.value); });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { inp.blur(); }
            if (e.key === 'Escape') { inp.value = currentName; inp.blur(); }
        });
        pipelineName.appendChild(inp);
        inp.focus();
        inp.select();
    });

    function finishNameEdit(newName) {
        newName = newName.trim();
        if (pipeline && newName && newName !== pipeline.name) {
            pipeline.name = newName;
            vscode.postMessage({ type: 'savePipeline', pipeline: pipeline });
        }
        pipelineName.textContent = pipeline ? pipeline.name : 'No Pipeline';
    }

    // ── Zoom controls ───────────────────────────────────────────────────
    document.getElementById('zoom-in').addEventListener('click', () => { applyZoom(0.15); });
    document.getElementById('zoom-out').addEventListener('click', () => { applyZoom(-0.15); });
    document.getElementById('zoom-fit').addEventListener('click', () => { fitToView(); });

    function applyZoom(delta) {
        const rect = canvasContainer.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        zoomAtPoint(cx, cy, delta);
    }

    function zoomAtPoint(cx, cy, delta) {
        const oldScale = transform.scale;
        const newScale = Math.max(0.15, Math.min(3, oldScale + delta));
        const ratio = newScale / oldScale;
        transform.x = cx - (cx - transform.x) * ratio;
        transform.y = cy - (cy - transform.y) * ratio;
        transform.scale = newScale;
        applyTransform();
    }

    function fitToView() {
        if (!pipeline || pipeline.stages.length === 0) { return; }
        const rect = canvasContainer.getBoundingClientRect();
        const positions = Object.values(nodePositions);
        if (positions.length === 0) { return; }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of positions) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + NODE_W);
            maxY = Math.max(maxY, p.y + NODE_H);
        }

        const graphW = maxX - minX + CANVAS_PADDING * 2;
        const graphH = maxY - minY + CANVAS_PADDING * 2;
        const scaleX = rect.width / graphW;
        const scaleY = rect.height / graphH;
        const scale = Math.max(0.2, Math.min(1.5, Math.min(scaleX, scaleY)));

        transform.scale = scale;
        transform.x = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
        transform.y = (rect.height - (maxY - minY) * scale) / 2 - minY * scale;
        applyTransform();
    }

    function applyTransform() {
        canvasTransform.style.transform =
            'translate(' + transform.x + 'px, ' + transform.y + 'px) scale(' + transform.scale + ')';
        edgeSvg.style.transform =
            'translate(' + transform.x + 'px, ' + transform.y + 'px) scale(' + transform.scale + ')';
        zoomLevel.textContent = Math.round(transform.scale * 100) + '%';
        drawMinimap();
    }

    // ── Pan / Zoom with mouse ───────────────────────────────────────────
    canvasContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.graph-node') || e.target.closest('#zoom-controls') || e.target.closest('#minimap')) { return; }
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        panTransformStart = { x: transform.x, y: transform.y };
        canvasContainer.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) { return; }
        transform.x = panTransformStart.x + (e.clientX - panStart.x);
        transform.y = panTransformStart.y + (e.clientY - panStart.y);
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            canvasContainer.classList.remove('dragging');
        }
    });

    canvasContainer.addEventListener('wheel', (e) => {
        if (e.target.closest('#zoom-controls') || e.target.closest('#minimap')) { return; }
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const rect = canvasContainer.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        zoomAtPoint(cx, cy, delta);
    }, { passive: false });

    // ── Message handling ────────────────────────────────────────────────
    window.addEventListener('message', (e) => {
        const msg = e.data;
        if (msg.type === 'setPipeline') {
            pipeline = msg.pipeline;
            run = msg.run || null;
            selectedStageId = null;
            closeDetailPanel();
            renderPipeline();
        } else if (msg.type === 'updateRun') {
            run = msg.run;
            updateRunOverlay();
        }
    });

    // ── DAG Layout ──────────────────────────────────────────────────────

    function computeLayout(stages) {
        if (!stages || stages.length === 0) { return {}; }

        const stageMap = {};
        for (const s of stages) { stageMap[s.id] = s; }

        // Build adjacency info
        const inDegree = {};
        const adj = {};
        for (const s of stages) {
            inDegree[s.id] = 0;
            adj[s.id] = [];
        }
        for (const s of stages) {
            for (const dep of (s.dependsOn || [])) {
                if (adj[dep]) {
                    adj[dep].push(s.id);
                    inDegree[s.id]++;
                }
            }
        }

        // Topological sort (Kahn's algorithm)
        const queue = [];
        for (const s of stages) {
            if (inDegree[s.id] === 0) { queue.push(s.id); }
        }
        const topoOrder = [];
        const visited = new Set();
        while (queue.length > 0) {
            const id = queue.shift();
            if (visited.has(id)) { continue; }
            visited.add(id);
            topoOrder.push(id);
            for (const next of (adj[id] || [])) {
                inDegree[next]--;
                if (inDegree[next] <= 0 && !visited.has(next)) {
                    queue.push(next);
                }
            }
        }
        // Add any unvisited nodes (cycles or orphans)
        for (const s of stages) {
            if (!visited.has(s.id)) { topoOrder.push(s.id); }
        }

        // Assign layers: layer = max(dependency layers) + 1
        const layers = {};
        for (const id of topoOrder) {
            const deps = (stageMap[id].dependsOn || []).filter(d => stageMap[d]);
            if (deps.length === 0) {
                layers[id] = 0;
            } else {
                let maxLayer = 0;
                for (const d of deps) {
                    maxLayer = Math.max(maxLayer, (layers[d] || 0) + 1);
                }
                layers[id] = maxLayer;
            }
        }

        // Group by layer
        const layerGroups = {};
        let maxLayer = 0;
        for (const id of topoOrder) {
            const l = layers[id];
            if (!layerGroups[l]) { layerGroups[l] = []; }
            layerGroups[l].push(id);
            maxLayer = Math.max(maxLayer, l);
        }

        // Position nodes
        const positions = {};
        for (let l = 0; l <= maxLayer; l++) {
            const group = layerGroups[l] || [];
            const totalHeight = group.length * NODE_H + (group.length - 1) * (LAYER_GAP_Y - NODE_H);
            const startY = -totalHeight / 2;
            for (let i = 0; i < group.length; i++) {
                positions[group[i]] = {
                    x: l * LAYER_GAP_X,
                    y: startY + i * LAYER_GAP_Y
                };
            }
        }

        // Center vertically: shift so min Y is at CANVAS_PADDING
        let minY = Infinity;
        for (const p of Object.values(positions)) {
            minY = Math.min(minY, p.y);
        }
        const offsetY = CANVAS_PADDING - minY;
        for (const p of Object.values(positions)) {
            p.y += offsetY;
        }

        return positions;
    }

    // ── SVG Helpers ─────────────────────────────────────────────────────

    function getStageStatus(stageId) {
        if (!run || !run.stageResults || !run.stageResults[stageId]) {
            return run ? 'pending' : null;
        }
        return run.stageResults[stageId].status || 'pending';
    }

    function getEdgeStatus(fromId, toId) {
        const fromStatus = getStageStatus(fromId);
        const toStatus = getStageStatus(toId);
        if (toStatus === 'in_progress') { return 'in_progress'; }
        if (fromStatus === 'completed' && (toStatus === 'completed' || toStatus === 'in_progress')) { return 'completed'; }
        if (fromStatus === 'failed' || toStatus === 'failed') { return 'failed'; }
        return 'pending';
    }

    function renderEdges(stages) {
        edgeSvg.innerHTML = '';
        if (!stages || stages.length === 0) { return; }

        // Compute SVG viewbox bounds
        let maxX = 0, maxY = 0;
        for (const p of Object.values(nodePositions)) {
            maxX = Math.max(maxX, p.x + NODE_W + 100);
            maxY = Math.max(maxY, p.y + NODE_H + 100);
        }
        edgeSvg.setAttribute('width', maxX);
        edgeSvg.setAttribute('height', maxY);
        edgeSvg.style.width = maxX + 'px';
        edgeSvg.style.height = maxY + 'px';

        // Arrow marker defs
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const markerStatuses = ['pending', 'in_progress', 'completed', 'failed'];
        const markerColors = { pending: '#666', in_progress: '#3b82f6', completed: '#22c55e', failed: '#ef4444' };
        for (const s of markerStatuses) {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'arrow-' + s);
            marker.setAttribute('viewBox', '0 0 10 7');
            marker.setAttribute('refX', '10');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('markerWidth', '8');
            marker.setAttribute('markerHeight', '6');
            marker.setAttribute('orient', 'auto');
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
            polygon.setAttribute('fill', markerColors[s]);
            polygon.classList.add('edge-arrow', s);
            marker.appendChild(polygon);
            defs.appendChild(marker);
        }
        edgeSvg.appendChild(defs);

        for (const stage of stages) {
            for (const depId of (stage.dependsOn || [])) {
                if (!nodePositions[depId] || !nodePositions[stage.id]) { continue; }

                const from = nodePositions[depId];
                const to = nodePositions[stage.id];
                const startX = from.x + NODE_W;
                const startY = from.y + NODE_H / 2;
                const endX = to.x;
                const endY = to.y + NODE_H / 2;

                const dx = endX - startX;
                const cpOffset = Math.max(40, Math.abs(dx) * 0.4);

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const d = 'M ' + startX + ',' + startY +
                          ' C ' + (startX + cpOffset) + ',' + startY +
                          ' ' + (endX - cpOffset) + ',' + endY +
                          ' ' + endX + ',' + endY;
                path.setAttribute('d', d);

                const status = run ? getEdgeStatus(depId, stage.id) : 'pending';
                path.classList.add('edge-path', status);
                path.setAttribute('marker-end', 'url(#arrow-' + status + ')');
                edgeSvg.appendChild(path);
            }
        }
    }

    // ── Type Icons ──────────────────────────────────────────────────────

    function typeIconSvg(type) {
        switch (type) {
            case 'sequential':
                return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8h8M8 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            case 'parallel':
                return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3v10M8 3v10M12 3v10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
            case 'fan_out':
                return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 8h4M7 8l4-4M7 8l4 0M7 8l4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            case 'conditional':
                return '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l5 6-5 6-5-6z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>';
            default:
                return '';
        }
    }

    function statusIconSvg(status) {
        switch (status) {
            case 'completed':
                return '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 8l3.5 3.5L13 5" stroke="#4ade80" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            case 'failed':
                return '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4l8 8M12 4l-8 8" stroke="#f87171" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
            case 'in_progress':
                return '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="#60a5fa" stroke-width="2" stroke-dasharray="10 6" stroke-linecap="round"/></svg>';
            default:
                return '';
        }
    }

    // ── Node Rendering ──────────────────────────────────────────────────

    function renderNodes(stages) {
        // Clear existing nodes
        const existing = canvasTransform.querySelectorAll('.graph-node');
        existing.forEach(n => n.remove());

        if (!stages || stages.length === 0) { return; }

        for (const stage of stages) {
            const pos = nodePositions[stage.id];
            if (!pos) { continue; }

            const node = document.createElement('div');
            node.className = 'graph-node';
            node.dataset.stageId = stage.id;
            node.style.left = pos.x + 'px';
            node.style.top = pos.y + 'px';

            const status = getStageStatus(stage.id);
            if (status) {
                node.classList.add('status-' + status);
            }
            if (stage.id === selectedStageId) {
                node.classList.add('selected');
            }

            // Color accent on left border from role
            const roleColor = ROLE_COLORS[stage.agentRole] || ROLE_COLORS.custom;
            node.style.borderLeftColor = roleColor;
            node.style.borderLeftWidth = '4px';

            // Header: name + status icon
            let headerHtml = '<div class="node-header">';
            headerHtml += '<span class="node-name">' + escapeHtml(stage.name) + '</span>';
            if (status && status !== 'pending') {
                headerHtml += '<span class="node-status-icon ' + status + '">' + statusIconSvg(status) + '</span>';
            }
            headerHtml += '</div>';

            // Meta: role badge + type icon
            let metaHtml = '<div class="node-meta">';
            metaHtml += '<span class="role-badge ' + stage.agentRole + '">' + stage.agentRole + '</span>';
            metaHtml += '<span class="type-icon" title="' + (TYPE_LABELS[stage.type] || stage.type) + '">' + typeIconSvg(stage.type) + '</span>';
            if (stage.type === 'fan_out' && stage.fanOutCount) {
                metaHtml += '<span style="font-size:10px;opacity:0.5;">x' + stage.fanOutCount + '</span>';
            }
            metaHtml += '</div>';

            node.innerHTML = headerHtml + metaHtml;

            node.addEventListener('click', (e) => {
                e.stopPropagation();
                selectStage(stage.id);
            });

            canvasTransform.appendChild(node);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── Stage Selection ─────────────────────────────────────────────────

    function selectStage(stageId) {
        selectedStageId = stageId;

        // Update node highlights
        const allNodes = canvasTransform.querySelectorAll('.graph-node');
        allNodes.forEach(n => {
            n.classList.toggle('selected', n.dataset.stageId === stageId);
        });

        openDetailPanel(stageId);
    }

    function openDetailPanel(stageId) {
        if (!pipeline) { return; }
        const stage = pipeline.stages.find(s => s.id === stageId);
        if (!stage) { return; }

        detailPanel.classList.add('open');

        let html = '';

        // Name field
        html += '<div class="field-group">';
        html += '<label>Stage Name</label>';
        html += '<input type="text" id="detail-name" value="' + escapeAttr(stage.name) + '"/>';
        html += '</div>';

        // Role selector
        html += '<div class="field-group">';
        html += '<label>Agent Role</label>';
        html += '<select id="detail-role">';
        const roles = ['coder', 'reviewer', 'tester', 'devops', 'researcher', 'custom'];
        for (const r of roles) {
            html += '<option value="' + r + '"' + (stage.agentRole === r ? ' selected' : '') + '>' + r + '</option>';
        }
        html += '</select>';
        html += '</div>';

        // Type selector
        html += '<div class="field-group">';
        html += '<label>Stage Type</label>';
        html += '<select id="detail-type">';
        const types = ['sequential', 'parallel', 'conditional', 'fan_out'];
        for (const t of types) {
            html += '<option value="' + t + '"' + (stage.type === t ? ' selected' : '') + '>' + TYPE_LABELS[t] + ' (' + t + ')</option>';
        }
        html += '</select>';
        html += '</div>';

        // Fan-out count (conditionally shown)
        html += '<div class="field-group" id="fanout-group" style="' + (stage.type === 'fan_out' ? '' : 'display:none;') + '">';
        html += '<label>Fan-Out Count</label>';
        html += '<input type="number" id="detail-fanout" min="1" max="50" value="' + (stage.fanOutCount || 2) + '"/>';
        html += '</div>';

        // Task description
        html += '<div class="field-group">';
        html += '<label>Task Description</label>';
        html += '<textarea id="detail-task">' + escapeHtml(stage.taskDescription || '') + '</textarea>';
        html += '</div>';

        // Condition (for conditional stages)
        html += '<div class="field-group" id="condition-group" style="' + (stage.type === 'conditional' ? '' : 'display:none;') + '">';
        html += '<label>Condition Expression</label>';
        html += '<input type="text" id="detail-condition" value="' + escapeAttr(stage.condition || '') + '"/>';
        html += '</div>';

        // Timeout
        html += '<div class="field-group">';
        html += '<label>Timeout (seconds)</label>';
        html += '<input type="number" id="detail-timeout" min="0" value="' + (stage.timeout || 0) + '" placeholder="0 = no limit"/>';
        html += '</div>';

        // Dependencies checklist
        html += '<div class="field-group">';
        html += '<label>Dependencies</label>';
        html += '<div class="deps-list">';
        const otherStages = pipeline.stages.filter(s => s.id !== stageId);
        if (otherStages.length === 0) {
            html += '<span style="font-size:11px;opacity:0.5;">No other stages to depend on</span>';
        } else {
            for (const other of otherStages) {
                const checked = (stage.dependsOn || []).includes(other.id);
                html += '<div class="dep-item">';
                html += '<input type="checkbox" id="dep-' + other.id + '" data-dep-id="' + other.id + '"' + (checked ? ' checked' : '') + '/>';
                html += '<label for="dep-' + other.id + '">' + escapeHtml(other.name) + '</label>';
                html += '</div>';
            }
        }
        html += '</div></div>';

        // Run result info if available
        if (run && run.stageResults && run.stageResults[stageId]) {
            const result = run.stageResults[stageId];
            html += '<div class="field-group" style="border-top:1px solid var(--vscode-panel-border);padding-top:12px;margin-top:8px;">';
            html += '<label>Run Status</label>';
            html += '<div style="font-size:12px;">';
            html += '<div style="margin-bottom:4px;"><strong>Status:</strong> ' + (result.status || 'pending') + '</div>';
            if (result.agentId) { html += '<div style="margin-bottom:4px;"><strong>Agent:</strong> ' + escapeHtml(result.agentId) + '</div>'; }
            if (result.startedAt) { html += '<div style="margin-bottom:4px;"><strong>Started:</strong> ' + new Date(result.startedAt).toLocaleTimeString() + '</div>'; }
            if (result.completedAt) { html += '<div style="margin-bottom:4px;"><strong>Completed:</strong> ' + new Date(result.completedAt).toLocaleTimeString() + '</div>'; }
            if (result.output) { html += '<div style="margin-bottom:4px;"><strong>Output:</strong><pre style="margin-top:4px;padding:6px;background:var(--vscode-textCodeBlock-background);border-radius:3px;font-size:11px;white-space:pre-wrap;max-height:120px;overflow-y:auto;">' + escapeHtml(result.output) + '</pre></div>'; }
            if (result.errorMessage) { html += '<div style="color:var(--vscode-errorForeground);"><strong>Error:</strong> ' + escapeHtml(result.errorMessage) + '</div>'; }
            html += '</div></div>';
        }

        detailBody.innerHTML = html;

        // Bind detail panel change events
        bindDetailEvents(stageId);
    }

    function escapeAttr(text) {
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function bindDetailEvents(stageId) {
        const debounceTimer = {};
        function debounceUpdate(field, fn) {
            clearTimeout(debounceTimer[field]);
            debounceTimer[field] = setTimeout(fn, 400);
        }

        const nameInput = document.getElementById('detail-name');
        const roleSelect = document.getElementById('detail-role');
        const typeSelect = document.getElementById('detail-type');
        const fanoutInput = document.getElementById('detail-fanout');
        const taskTextarea = document.getElementById('detail-task');
        const conditionInput = document.getElementById('detail-condition');
        const timeoutInput = document.getElementById('detail-timeout');
        const fanoutGroup = document.getElementById('fanout-group');
        const conditionGroup = document.getElementById('condition-group');

        function getUpdatedStage() {
            if (!pipeline) { return null; }
            const stage = pipeline.stages.find(s => s.id === stageId);
            if (!stage) { return null; }
            return Object.assign({}, stage);
        }

        function sendUpdate() {
            const stage = getUpdatedStage();
            if (!stage || !pipeline) { return; }

            stage.name = nameInput.value.trim() || stage.name;
            stage.agentRole = roleSelect.value;
            stage.type = typeSelect.value;
            stage.taskDescription = taskTextarea.value;
            stage.condition = conditionInput ? conditionInput.value : stage.condition;
            stage.timeout = parseInt(timeoutInput.value, 10) || undefined;
            stage.fanOutCount = stage.type === 'fan_out' ? (parseInt(fanoutInput.value, 10) || 2) : undefined;

            // Gather dependencies
            const depChecks = detailBody.querySelectorAll('input[data-dep-id]');
            const deps = [];
            depChecks.forEach(cb => { if (cb.checked) { deps.push(cb.dataset.depId); } });
            stage.dependsOn = deps;

            // Update local pipeline
            const idx = pipeline.stages.findIndex(s => s.id === stageId);
            if (idx >= 0) { pipeline.stages[idx] = stage; }

            vscode.postMessage({ type: 'updateStage', pipelineId: pipeline.id, stage: stage });

            // Re-render
            renderPipeline();
            // Re-select to keep panel in sync
            if (selectedStageId === stageId) {
                const allNodes = canvasTransform.querySelectorAll('.graph-node');
                allNodes.forEach(n => { n.classList.toggle('selected', n.dataset.stageId === stageId); });
            }
        }

        if (nameInput) { nameInput.addEventListener('input', () => { debounceUpdate('name', sendUpdate); }); }
        if (roleSelect) { roleSelect.addEventListener('change', sendUpdate); }
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                fanoutGroup.style.display = typeSelect.value === 'fan_out' ? '' : 'none';
                conditionGroup.style.display = typeSelect.value === 'conditional' ? '' : 'none';
                sendUpdate();
            });
        }
        if (fanoutInput) { fanoutInput.addEventListener('input', () => { debounceUpdate('fanout', sendUpdate); }); }
        if (taskTextarea) { taskTextarea.addEventListener('input', () => { debounceUpdate('task', sendUpdate); }); }
        if (conditionInput) { conditionInput.addEventListener('input', () => { debounceUpdate('condition', sendUpdate); }); }
        if (timeoutInput) { timeoutInput.addEventListener('input', () => { debounceUpdate('timeout', sendUpdate); }); }

        const depChecks = detailBody.querySelectorAll('input[data-dep-id]');
        depChecks.forEach(cb => { cb.addEventListener('change', sendUpdate); });
    }

    function closeDetailPanel() {
        detailPanel.classList.remove('open');
        selectedStageId = null;
        const allNodes = canvasTransform.querySelectorAll('.graph-node');
        allNodes.forEach(n => n.classList.remove('selected'));
    }

    // Click on canvas background to deselect
    canvasContainer.addEventListener('click', (e) => {
        if (!e.target.closest('.graph-node') && !e.target.closest('#zoom-controls') && !e.target.closest('#minimap')) {
            closeDetailPanel();
        }
    });

    // ── Pipeline Rendering ──────────────────────────────────────────────

    function renderPipeline() {
        const hasData = pipeline && pipeline.stages && pipeline.stages.length > 0;

        // Toggle empty state
        emptyState.style.display = hasData ? 'none' : '';
        canvasContainer.classList.toggle('no-pipeline', !hasData);

        // Update toolbar
        pipelineName.textContent = pipeline ? pipeline.name : 'No Pipeline';
        pipelineDesc.textContent = pipeline ? (pipeline.description || '') : '';

        const hasAnyPipeline = !!pipeline;
        document.getElementById('btn-run').disabled = !hasAnyPipeline;
        document.getElementById('btn-save').disabled = !hasAnyPipeline;
        document.getElementById('btn-add-stage').disabled = !hasAnyPipeline;
        document.getElementById('btn-delete').disabled = !hasAnyPipeline;

        // Update run status badge
        updateRunBadge();

        if (!hasData) {
            canvasTransform.innerHTML = '';
            edgeSvg.innerHTML = '';
            drawMinimap();
            return;
        }

        // Compute layout
        nodePositions = computeLayout(pipeline.stages);

        // Render
        renderEdges(pipeline.stages);
        renderNodes(pipeline.stages);
        drawMinimap();

        // Fit to view on first render
        if (Object.keys(nodePositions).length > 0) {
            requestAnimationFrame(() => { fitToView(); });
        }
    }

    function updateRunBadge() {
        if (!run) {
            runStatusBadge.style.display = 'none';
            return;
        }
        runStatusBadge.style.display = '';
        runStatusBadge.textContent = run.status;
        runStatusBadge.className = 'status-badge ' + run.status;
    }

    function updateRunOverlay() {
        if (!pipeline) { return; }

        updateRunBadge();

        // Update node statuses
        const allNodes = canvasTransform.querySelectorAll('.graph-node');
        allNodes.forEach(node => {
            const stageId = node.dataset.stageId;
            const status = getStageStatus(stageId);

            // Remove old status classes
            node.classList.remove('status-pending', 'status-in_progress', 'status-completed', 'status-failed');
            if (status) {
                node.classList.add('status-' + status);
            }

            // Update status icon
            const iconEl = node.querySelector('.node-status-icon');
            if (status && status !== 'pending') {
                if (iconEl) {
                    iconEl.className = 'node-status-icon ' + status;
                    iconEl.innerHTML = statusIconSvg(status);
                } else {
                    const header = node.querySelector('.node-header');
                    if (header) {
                        const newIcon = document.createElement('span');
                        newIcon.className = 'node-status-icon ' + status;
                        newIcon.innerHTML = statusIconSvg(status);
                        header.appendChild(newIcon);
                    }
                }
            } else if (iconEl) {
                iconEl.remove();
            }

            // Trigger shake animation on newly failed nodes
            if (status === 'failed' && !node.classList.contains('shake')) {
                node.classList.add('shake');
                setTimeout(() => { node.classList.remove('shake'); }, 500);
            }
        });

        // Update edge statuses
        renderEdges(pipeline.stages);

        // Update detail panel if open
        if (selectedStageId) {
            openDetailPanel(selectedStageId);
        }

        drawMinimap();
    }

    // ── Minimap ─────────────────────────────────────────────────────────

    function drawMinimap() {
        const canvas = minimapCanvas;
        const dpr = window.devicePixelRatio || 1;
        const w = 160;
        const h = 100;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        minimapCtx.clearRect(0, 0, w, h);

        if (!pipeline || pipeline.stages.length === 0) { return; }

        const positions = Object.values(nodePositions);
        if (positions.length === 0) { return; }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of positions) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + NODE_W);
            maxY = Math.max(maxY, p.y + NODE_H);
        }

        const graphW = maxX - minX + 40;
        const graphH = maxY - minY + 40;
        const scale = Math.min((w - 10) / graphW, (h - 10) / graphH);
        const offX = (w - graphW * scale) / 2 - minX * scale + 5;
        const offY = (h - graphH * scale) / 2 - minY * scale + 5;

        // Draw edges
        minimapCtx.strokeStyle = 'rgba(100,150,255,0.3)';
        minimapCtx.lineWidth = 1;
        if (pipeline.stages) {
            for (const stage of pipeline.stages) {
                for (const depId of (stage.dependsOn || [])) {
                    const from = nodePositions[depId];
                    const to = nodePositions[stage.id];
                    if (!from || !to) { continue; }
                    minimapCtx.beginPath();
                    minimapCtx.moveTo(offX + (from.x + NODE_W) * scale, offY + (from.y + NODE_H / 2) * scale);
                    minimapCtx.lineTo(offX + to.x * scale, offY + (to.y + NODE_H / 2) * scale);
                    minimapCtx.stroke();
                }
            }
        }

        // Draw nodes
        for (const stage of pipeline.stages) {
            const pos = nodePositions[stage.id];
            if (!pos) { continue; }
            const nx = offX + pos.x * scale;
            const ny = offY + pos.y * scale;
            const nw = NODE_W * scale;
            const nh = NODE_H * scale;

            const status = getStageStatus(stage.id);
            const roleColor = ROLE_COLORS[stage.agentRole] || ROLE_COLORS.custom;

            minimapCtx.fillStyle = status === 'completed' ? 'rgba(34,197,94,0.5)' :
                                   status === 'in_progress' ? 'rgba(59,130,246,0.5)' :
                                   status === 'failed' ? 'rgba(239,68,68,0.5)' :
                                   roleColor + '40';
            minimapCtx.fillRect(nx, ny, nw, nh);
        }

        // Draw viewport rectangle
        const containerRect = canvasContainer.getBoundingClientRect();
        const vx = (-transform.x / transform.scale);
        const vy = (-transform.y / transform.scale);
        const vw = containerRect.width / transform.scale;
        const vh = containerRect.height / transform.scale;

        minimapCtx.strokeStyle = 'rgba(255,255,255,0.4)';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(
            offX + vx * scale,
            offY + vy * scale,
            vw * scale,
            vh * scale
        );
    }

    // ── Initial state ───────────────────────────────────────────────────
    applyTransform();
    drawMinimap();

})();
</script>
</body>
</html>`;
    }
}
