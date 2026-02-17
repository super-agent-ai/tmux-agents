// ─── Daemon Bridge ──────────────────────────────────────────────────────────
//
// Extends Database for type compatibility, but does NOT use a local in-memory
// SQLite database when the daemon is running. The daemon is the single source
// of truth — no duplicate in-memory DB that can diverge.
//
// Connected mode (daemon running):
//   Reads  → from local JS cache, refreshed from daemon via db.snapshot RPC
//   Writes → RPC to daemon + immediate cache update for read consistency
//   Sync   → WS events trigger cache refresh; polling fallback every 3s
//
// Disconnected mode (no daemon):
//   Falls back to parent Database (in-memory SQLite from disk file).
//   Reads  → super.*() (from parent Database)
//   Writes → super.*() + scheduleSave to disk
//   Sync   → reloadFromDisk() every 3s picks up external changes.

import { DaemonClient } from './client/daemonClient';
import { Database } from './database';
import {
    KanbanSwimLane, OrchestratorTask, AgentInstance, AgentTeam,
    Pipeline, PipelineRun, FavouriteFolder, OrganizationUnit, Guild,
    GuildKnowledge, AgentMessage,
    TaskStatusHistoryEntry, TaskComment, AgentProfileStats
} from './types';
import type { SyncError, BackendConfig } from './backends/types.js';

type SyncCallback = () => void;
type WarningCallback = (message: string) => void;

interface CacheSnapshot {
    tasks: OrchestratorTask[];
    swimLanes: KanbanSwimLane[];
    agents: AgentInstance[];
    teams: AgentTeam[];
    pipelines: Pipeline[];
    pipelineRuns: PipelineRun[];
    favouriteFolders: FavouriteFolder[];
    orgUnits: OrganizationUnit[];
    guilds: Guild[];
    agentMessages: AgentMessage[];
    agentProfileStats: AgentProfileStats[];
}

export class DaemonBridge extends Database {
    private client: DaemonClient;
    private _connected = false;
    private _fallbackInitialized = false;
    private syncTimer?: ReturnType<typeof setInterval>;
    private healthTimer?: ReturnType<typeof setInterval>;
    private syncCallbacks: SyncCallback[] = [];
    private warningCallbacks: WarningCallback[] = [];
    private wsUnsubscribe?: () => void;
    private _consecutiveFailures = 0;
    private _lastWarningTime = 0;
    private _connectionChangeCallbacks: ((connected: boolean) => void)[] = [];

    // Plain JS cache — used when daemon is connected (no local SQLite)
    private cache: CacheSnapshot = {
        tasks: [], swimLanes: [], agents: [], teams: [],
        pipelines: [], pipelineRuns: [], favouriteFolders: [],
        orgUnits: [], guilds: [], agentMessages: [],
        agentProfileStats: [],
    };
    private _cacheFingerprint = '';

    constructor(dbPath: string, client?: DaemonClient) {
        super(dbPath);
        this.client = client || new DaemonClient();
    }

    async initialize(): Promise<void> {
        // Try connecting to daemon first
        await this.tryConnectDaemon();

        if (this._connected) {
            // Daemon is up — fetch all data into cache. No local SQLite needed.
            await this.refreshCacheFromDaemon();
        } else {
            // Daemon down — fall back to local SQLite (parent Database)
            await this.initFallback();
        }

        // Polling every 3s keeps cache/fallback in sync
        this.syncTimer = setInterval(() => this.pollSync(), 3_000);
        // Health check every 15s to detect daemon going down or coming back
        this.healthTimer = setInterval(() => this.checkDaemonHealth(), 15_000);
    }

    // ─── Connection Management ───────────────────────────────────────────────

    private async tryConnectDaemon(): Promise<void> {
        try {
            await this.client.connect();
            this._connected = true;
            this._consecutiveFailures = 0;
            this.subscribeWsEvents();
            const info = this.client.getConnectionInfo();
            console.log(`[DaemonBridge] Connected to daemon via ${info.type} (ws=${info.wsConnected})`);
        } catch (err) {
            this._connected = false;
            this.emitWarning(`Daemon not reachable, using direct file mode. TUI/CLI will not see changes until daemon starts. Error: ${err}`);
        }
    }

    private subscribeWsEvents(): void {
        try {
            if (this.wsUnsubscribe) { this.wsUnsubscribe(); }
            this.wsUnsubscribe = this.client.subscribe((event: string) => {
                if (event === 'db.changed'
                    || event.startsWith('task.')
                    || event.startsWith('kanban.')
                    || event.startsWith('agent.')
                    || event.startsWith('team.')
                    || event.startsWith('pipeline.')
                    || event.startsWith('sync.')) {
                    this.refreshCacheFromDaemon().then(changed => {
                        if (changed) { this.fireSyncCallbacks(); }
                    }).catch(() => { /* handled in refreshCacheFromDaemon */ });
                }
            });
        } catch {
            this.emitWarning('WebSocket connection failed. Real-time sync disabled, using 3s polling fallback.');
        }
    }

    /** Initialize the parent Database as fallback (only when daemon is unavailable). */
    private async initFallback(): Promise<void> {
        if (!this._fallbackInitialized) {
            await super.initialize();
            this._fallbackInitialized = true;
        }
    }

    /** Periodically verify daemon is still reachable and handle reconnection. */
    private async checkDaemonHealth(): Promise<void> {
        if (!this._connected) {
            // Try to reconnect
            try {
                await this.client.connect();
                this._connected = true;
                this._consecutiveFailures = 0;
                // Switch from fallback to daemon mode
                await this.refreshCacheFromDaemon();
                this.subscribeWsEvents();
                this.fireSyncCallbacks();
                this.fireConnectionChange(true);
                console.log('[DaemonBridge] Reconnected to daemon');
            } catch {
                // Still disconnected — stay in fallback mode
            }
            return;
        }

        // Verify connection is still alive
        try {
            await this.client.call('daemon.health', {});
            this._consecutiveFailures = 0;
        } catch {
            this._consecutiveFailures++;
            if (this._consecutiveFailures >= 2) {
                this._connected = false;
                this.emitWarning('Lost connection to daemon. Falling back to direct file mode.');
                this.fireConnectionChange(false);
                // Initialize fallback if not already done
                this.initFallback().then(() => {
                    this.fireSyncCallbacks();
                }).catch(err => {
                    console.error('[DaemonBridge] Failed to initialize fallback:', err);
                });
            }
        }
    }

    // ─── Cache Refresh ───────────────────────────────────────────────────────

    /** Fetch all data from daemon in one RPC call. Returns true if data changed. */
    private async refreshCacheFromDaemon(): Promise<boolean> {
        try {
            const snapshot = await this.client.call('db.snapshot', {}) as CacheSnapshot;
            const fp = this.computeFingerprint(snapshot);
            if (fp === this._cacheFingerprint) { return false; }
            this.cache = snapshot;
            this._cacheFingerprint = fp;
            this._consecutiveFailures = 0;
            return true;
        } catch (err) {
            this._consecutiveFailures++;
            if (this._consecutiveFailures >= 3) {
                this._connected = false;
                this.emitWarning(`Cache refresh failed ${this._consecutiveFailures} times. Falling back to direct file mode.`);
                await this.initFallback();
            }
            return false;
        }
    }

    /** Fast fingerprint to detect cache changes without deep comparison. */
    private computeFingerprint(snap: CacheSnapshot): string {
        // Use counts + IDs of first/last items for a fast change-detection heuristic
        const parts = [
            snap.tasks.length, snap.tasks[0]?.id, snap.tasks[snap.tasks.length - 1]?.id,
            snap.swimLanes.length,
            snap.agents.length,
            snap.teams.length,
            snap.pipelines.length,
            snap.pipelineRuns.length,
            snap.favouriteFolders.length,
            snap.orgUnits.length,
            snap.guilds.length,
            snap.agentMessages.length,
        ];
        // Also check task statuses for status-change detection
        for (const t of snap.tasks) { parts.push(t.status, t.kanbanColumn ?? ''); }
        for (const l of snap.swimLanes) { parts.push(l.name, l.sessionActive ? '1' : '0'); }
        return parts.join('|');
    }

    // ─── Sync helpers ───────────────────────────────────────────────────────

    /** Polling — runs every 3s to keep data in sync. */
    private pollSync(): void {
        if (this._connected) {
            this.refreshCacheFromDaemon().then(changed => {
                if (changed) { this.fireSyncCallbacks(); }
            }).catch(() => { /* handled inside */ });
        } else {
            // Fallback: reload from disk
            const changed = this.reloadFromDisk();
            if (changed) { this.fireSyncCallbacks(); }
        }
    }

    /** Register a callback invoked when external data changes are detected. */
    onSync(callback: SyncCallback): void {
        this.syncCallbacks.push(callback);
    }

    /** Register a callback invoked when a connection issue is detected. */
    onWarning(callback: WarningCallback): void {
        this.warningCallbacks.push(callback);
    }

    private fireSyncCallbacks(): void {
        for (const cb of this.syncCallbacks) {
            try { cb(); } catch (err) { console.warn('[DaemonBridge] sync callback error:', err); }
        }
    }

    private fireConnectionChange(connected: boolean): void {
        for (const cb of this._connectionChangeCallbacks) {
            try { cb(connected); } catch (err) { console.warn('[DaemonBridge] connection change callback error:', err); }
        }
    }

    /** Emit a warning to all registered callbacks. Rate-limited to 1 per 30s. */
    private emitWarning(message: string): void {
        const now = Date.now();
        console.warn(`[DaemonBridge] ${message}`);
        if (now - this._lastWarningTime < 30_000) { return; }
        this._lastWarningTime = now;
        for (const cb of this.warningCallbacks) {
            try { cb(message); } catch (err) { console.warn('[DaemonBridge] warning callback error:', err); }
        }
    }

    get isDaemonConnected(): boolean { return this._connected; }

    /** Force a reconnection attempt to the daemon. Returns true if connection succeeded. */
    async reconnect(): Promise<boolean> {
        await this.tryConnectDaemon();
        if (this._connected) {
            await this.refreshCacheFromDaemon();
            this.subscribeWsEvents();
            this.fireSyncCallbacks();
            this.fireConnectionChange(true);
        }
        return this._connected;
    }

    /** Get the DaemonClient for direct RPC calls (only when connected). */
    getClient(): DaemonClient | undefined {
        return this._connected ? this.client : undefined;
    }

    /** Get the DaemonClient for direct RPC calls. */
    get rpcClient(): DaemonClient {
        return this.client;
    }

    /** Register a callback invoked when daemon connection state changes. */
    onConnectionChange(callback: (connected: boolean) => void): void {
        this._connectionChangeCallbacks.push(callback);
    }

    // ─── Write helpers ───────────────────────────────────────────────────────

    /**
     * Proxy a write: when connected, send RPC to daemon (fire-and-forget with
     * error handling). When disconnected, write to fallback Database.
     * Cache is updated synchronously for immediate read consistency.
     */
    private proxyWrite(method: string, args: any[], superCall: () => void, cacheUpdate?: () => void): void {
        if (this._connected) {
            if (cacheUpdate) { cacheUpdate(); }
            this.client.call('db.call', { method, args }).catch(err => {
                this._handleRpcFailure(method, err);
            });
        } else {
            superCall();
        }
    }

    /**
     * Like proxyWrite but uses a specific RPC method (for tasks/lanes which
     * have daemon-side orchestrator side-effects).
     */
    private proxyWriteRpc(rpcMethod: string, rpcParams: any, superCall: () => void, cacheUpdate?: () => void): void {
        if (this._connected) {
            if (cacheUpdate) { cacheUpdate(); }
            this.client.call(rpcMethod, rpcParams).catch(err => {
                this._handleRpcFailure(rpcMethod, err);
            });
        } else {
            superCall();
        }
    }

    /** Handle an RPC failure: track consecutive failures, warn, maybe fall back. */
    private _handleRpcFailure(method: string, err: any): void {
        this._consecutiveFailures++;
        const errMsg = err?.message || String(err);
        if (this._consecutiveFailures >= 3) {
            this._connected = false;
            this.emitWarning(
                `Daemon connection lost after ${this._consecutiveFailures} consecutive failures ` +
                `(last: ${method}). Falling back to direct file mode. Error: ${errMsg}`
            );
            this.fireConnectionChange(false);
            this.initFallback().catch(e => console.error('[DaemonBridge] Fallback init failed:', e));
        } else {
            this.emitWarning(
                `Daemon write failed for ${method}. ` +
                `TUI/CLI may be temporarily out of sync. Error: ${errMsg}`
            );
        }
    }

    // ─── Read Overrides (cache when connected, super when disconnected) ──────

    getAllSwimLanes(): KanbanSwimLane[] {
        return this._connected ? this.cache.swimLanes : super.getAllSwimLanes();
    }

    getSwimLane(id: string): KanbanSwimLane | undefined {
        if (this._connected) { return this.cache.swimLanes.find(l => l.id === id); }
        return super.getSwimLane(id);
    }

    getAllFavouriteFolders(): FavouriteFolder[] {
        return this._connected ? this.cache.favouriteFolders : super.getAllFavouriteFolders();
    }

    getAllTasks(): OrchestratorTask[] {
        return this._connected ? this.cache.tasks : super.getAllTasks();
    }

    getTask(id: string): OrchestratorTask | undefined {
        if (this._connected) { return this.cache.tasks.find(t => t.id === id); }
        return super.getTask(id);
    }

    getTasksBySwimLane(swimLaneId: string): OrchestratorTask[] {
        if (this._connected) { return this.cache.tasks.filter(t => t.swimLaneId === swimLaneId); }
        return super.getTasksBySwimLane(swimLaneId);
    }

    getSubtasks(parentId: string): OrchestratorTask[] {
        if (this._connected) {
            const parent = this.cache.tasks.find(t => t.id === parentId);
            if (!parent?.subtaskIds) { return []; }
            return this.cache.tasks.filter(t => parent.subtaskIds!.includes(t.id));
        }
        return super.getSubtasks(parentId);
    }

    getAllAgents(): AgentInstance[] {
        return this._connected ? this.cache.agents : super.getAllAgents();
    }

    getAgent(id: string): AgentInstance | undefined {
        if (this._connected) { return this.cache.agents.find(a => a.id === id); }
        return super.getAgent(id);
    }

    getAllTeams(): AgentTeam[] {
        return this._connected ? this.cache.teams : super.getAllTeams();
    }

    getTeam(id: string): AgentTeam | undefined {
        if (this._connected) { return this.cache.teams.find(t => t.id === id); }
        return super.getTeam(id);
    }

    getAllPipelines(): Pipeline[] {
        return this._connected ? this.cache.pipelines : super.getAllPipelines();
    }

    getPipeline(id: string): Pipeline | undefined {
        if (this._connected) { return this.cache.pipelines.find(p => p.id === id); }
        return super.getPipeline(id);
    }

    getAllPipelineRuns(): PipelineRun[] {
        return this._connected ? this.cache.pipelineRuns : super.getAllPipelineRuns();
    }

    getPipelineRun(id: string): PipelineRun | undefined {
        if (this._connected) { return this.cache.pipelineRuns.find(r => r.id === id); }
        return super.getPipelineRun(id);
    }

    getAllOrgUnits(): OrganizationUnit[] {
        return this._connected ? this.cache.orgUnits : super.getAllOrgUnits();
    }

    getOrgUnit(id: string): OrganizationUnit | undefined {
        if (this._connected) { return this.cache.orgUnits.find(u => u.id === id); }
        return super.getOrgUnit(id);
    }

    getAllGuilds(): Guild[] {
        return this._connected ? this.cache.guilds : super.getAllGuilds();
    }

    getGuild(id: string): Guild | undefined {
        if (this._connected) { return this.cache.guilds.find(g => g.id === id); }
        return super.getGuild(id);
    }

    getAllAgentMessages(limit: number = 100): AgentMessage[] {
        if (this._connected) { return this.cache.agentMessages.slice(0, limit); }
        return super.getAllAgentMessages(limit);
    }

    getAgentMessages(agentId: string, limit: number = 50): AgentMessage[] {
        if (this._connected) {
            return this.cache.agentMessages
                .filter(m => m.fromAgentId === agentId || m.toAgentId === agentId)
                .slice(0, limit);
        }
        return super.getAgentMessages(agentId, limit);
    }

    getAllAgentProfileStats(): AgentProfileStats[] {
        return this._connected ? this.cache.agentProfileStats : super.getAllAgentProfileStats();
    }

    getAgentProfileStats(agentId: string): AgentProfileStats | undefined {
        if (this._connected) { return this.cache.agentProfileStats.find(s => s.agentId === agentId); }
        return super.getAgentProfileStats(agentId);
    }

    getTags(taskId: string): string[] {
        if (this._connected) {
            const task = this.cache.tasks.find(t => t.id === taskId);
            return task?.tags || [];
        }
        return super.getTags(taskId);
    }

    getComments(taskId: string): TaskComment[] {
        if (this._connected) {
            const task = this.cache.tasks.find(t => t.id === taskId);
            return task?.comments || [];
        }
        return super.getComments(taskId);
    }

    getStatusHistory(taskId: string): TaskStatusHistoryEntry[] {
        if (this._connected) {
            const task = this.cache.tasks.find(t => t.id === taskId);
            return task?.statusHistory || [];
        }
        return super.getStatusHistory(taskId);
    }

    // ─── Write Overrides ────────────────────────────────────────────────────

    // Tasks (use specific RPC for orchestrator side-effects)
    saveTask(task: OrchestratorTask): void {
        this.proxyWriteRpc('task.save', task, () => super.saveTask(task), () => {
            const idx = this.cache.tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) { this.cache.tasks[idx] = task; } else { this.cache.tasks.push(task); }
        });
    }

    deleteTask(id: string): void {
        this.proxyWriteRpc('task.delete', { id }, () => super.deleteTask(id), () => {
            this.cache.tasks = this.cache.tasks.filter(t => t.id !== id);
        });
    }

    // Swim Lanes (use specific RPC for daemon side-effects)
    saveSwimLane(lane: KanbanSwimLane): void {
        this.proxyWriteRpc('kanban.saveLane', lane, () => super.saveSwimLane(lane), () => {
            const idx = this.cache.swimLanes.findIndex(l => l.id === lane.id);
            if (idx >= 0) { this.cache.swimLanes[idx] = lane; } else { this.cache.swimLanes.push(lane); }
        });
    }

    deleteSwimLane(id: string): void {
        this.proxyWriteRpc('kanban.deleteLane', { id }, () => super.deleteSwimLane(id), () => {
            this.cache.swimLanes = this.cache.swimLanes.filter(l => l.id !== id);
        });
    }

    // Favourite Folders
    saveFavouriteFolder(f: FavouriteFolder): void {
        this.proxyWrite('saveFavouriteFolder', [f], () => super.saveFavouriteFolder(f), () => {
            const idx = this.cache.favouriteFolders.findIndex(x => x.id === f.id);
            if (idx >= 0) { this.cache.favouriteFolders[idx] = f; } else { this.cache.favouriteFolders.push(f); }
        });
    }

    deleteFavouriteFolder(id: string): void {
        this.proxyWrite('deleteFavouriteFolder', [id], () => super.deleteFavouriteFolder(id), () => {
            this.cache.favouriteFolders = this.cache.favouriteFolders.filter(x => x.id !== id);
        });
    }

    // Agents
    saveAgent(agent: AgentInstance): void {
        this.proxyWrite('saveAgent', [agent], () => super.saveAgent(agent), () => {
            const idx = this.cache.agents.findIndex(a => a.id === agent.id);
            if (idx >= 0) { this.cache.agents[idx] = agent; } else { this.cache.agents.push(agent); }
        });
    }

    deleteAgent(id: string): void {
        this.proxyWrite('deleteAgent', [id], () => super.deleteAgent(id), () => {
            this.cache.agents = this.cache.agents.filter(a => a.id !== id);
        });
    }

    // Teams
    saveTeam(team: AgentTeam): void {
        this.proxyWrite('saveTeam', [team], () => super.saveTeam(team), () => {
            const idx = this.cache.teams.findIndex(t => t.id === team.id);
            if (idx >= 0) { this.cache.teams[idx] = team; } else { this.cache.teams.push(team); }
        });
    }

    deleteTeam(id: string): void {
        this.proxyWrite('deleteTeam', [id], () => super.deleteTeam(id), () => {
            this.cache.teams = this.cache.teams.filter(t => t.id !== id);
        });
    }

    // Pipelines
    savePipeline(pipeline: Pipeline): void {
        this.proxyWrite('savePipeline', [pipeline], () => super.savePipeline(pipeline), () => {
            const idx = this.cache.pipelines.findIndex(p => p.id === pipeline.id);
            if (idx >= 0) { this.cache.pipelines[idx] = pipeline; } else { this.cache.pipelines.push(pipeline); }
        });
    }

    deletePipeline(id: string): void {
        this.proxyWrite('deletePipeline', [id], () => super.deletePipeline(id), () => {
            this.cache.pipelines = this.cache.pipelines.filter(p => p.id !== id);
        });
    }

    // Pipeline Runs
    savePipelineRun(run: PipelineRun): void {
        this.proxyWrite('savePipelineRun', [run], () => super.savePipelineRun(run), () => {
            const idx = this.cache.pipelineRuns.findIndex(r => r.id === run.id);
            if (idx >= 0) { this.cache.pipelineRuns[idx] = run; } else { this.cache.pipelineRuns.push(run); }
        });
    }

    deletePipelineRun(id: string): void {
        this.proxyWrite('deletePipelineRun', [id], () => super.deletePipelineRun(id), () => {
            this.cache.pipelineRuns = this.cache.pipelineRuns.filter(r => r.id !== id);
        });
    }

    // Org Units
    saveOrgUnit(unit: OrganizationUnit): void {
        this.proxyWrite('saveOrgUnit', [unit], () => super.saveOrgUnit(unit), () => {
            const idx = this.cache.orgUnits.findIndex(u => u.id === unit.id);
            if (idx >= 0) { this.cache.orgUnits[idx] = unit; } else { this.cache.orgUnits.push(unit); }
        });
    }

    deleteOrgUnit(id: string): void {
        this.proxyWrite('deleteOrgUnit', [id], () => super.deleteOrgUnit(id), () => {
            this.cache.orgUnits = this.cache.orgUnits.filter(u => u.id !== id);
        });
    }

    // Guilds
    saveGuild(guild: Guild): void {
        this.proxyWrite('saveGuild', [guild], () => super.saveGuild(guild), () => {
            const idx = this.cache.guilds.findIndex(g => g.id === guild.id);
            if (idx >= 0) { this.cache.guilds[idx] = guild; } else { this.cache.guilds.push(guild); }
        });
    }

    deleteGuild(id: string): void {
        this.proxyWrite('deleteGuild', [id], () => super.deleteGuild(id), () => {
            this.cache.guilds = this.cache.guilds.filter(g => g.id !== id);
        });
    }

    addGuildKnowledge(guildId: string, knowledge: GuildKnowledge): void {
        this.proxyWrite('addGuildKnowledge', [guildId, knowledge], () => super.addGuildKnowledge(guildId, knowledge), () => {
            const guild = this.cache.guilds.find(g => g.id === guildId);
            if (guild) { guild.knowledgeBase.push(knowledge); }
        });
    }

    // Agent Messages
    saveAgentMessage(msg: AgentMessage): void {
        this.proxyWrite('saveAgentMessage', [msg], () => super.saveAgentMessage(msg), () => {
            this.cache.agentMessages.unshift(msg);
            if (this.cache.agentMessages.length > 100) { this.cache.agentMessages.length = 100; }
        });
    }

    markMessageRead(messageId: string): void {
        this.proxyWrite('markMessageRead', [messageId], () => super.markMessageRead(messageId), () => {
            const msg = this.cache.agentMessages.find(m => m.id === messageId);
            if (msg) { msg.read = true; }
        });
    }

    // Status History
    addStatusHistory(entry: TaskStatusHistoryEntry): void {
        this.proxyWrite('addStatusHistory', [entry], () => super.addStatusHistory(entry), () => {
            const task = this.cache.tasks.find(t => t.id === entry.taskId);
            if (task) {
                if (!task.statusHistory) { task.statusHistory = []; }
                task.statusHistory.push(entry);
            }
        });
    }

    // Comments
    addComment(comment: TaskComment): void {
        this.proxyWrite('addComment', [comment], () => super.addComment(comment), () => {
            const task = this.cache.tasks.find(t => t.id === comment.taskId);
            if (task) {
                if (!task.comments) { task.comments = []; }
                task.comments.push(comment);
            }
        });
    }

    deleteComment(commentId: string): void {
        this.proxyWrite('deleteComment', [commentId], () => super.deleteComment(commentId), () => {
            for (const task of this.cache.tasks) {
                if (task.comments) {
                    task.comments = task.comments.filter(c => c.id !== commentId);
                }
            }
        });
    }

    // Tags
    saveTags(taskId: string, tags: string[]): void {
        this.proxyWrite('saveTags', [taskId, tags], () => super.saveTags(taskId, tags), () => {
            const task = this.cache.tasks.find(t => t.id === taskId);
            if (task) { task.tags = tags; }
        });
    }

    // Backend Mappings
    saveBackendMapping(localId: string, backend: string, externalId: string, status: 'synced' | 'pending' | 'error' = 'synced'): void {
        this.proxyWrite('saveBackendMapping', [localId, backend, externalId, status],
            () => super.saveBackendMapping(localId, backend, externalId, status));
    }

    deleteBackendMapping(localId: string, backend: string): void {
        this.proxyWrite('deleteBackendMapping', [localId, backend],
            () => super.deleteBackendMapping(localId, backend));
    }

    // Sync Errors
    logSyncError(error: SyncError): void {
        this.proxyWrite('logSyncError', [error], () => super.logSyncError(error));
    }

    clearSyncError(errorId: string): void {
        this.proxyWrite('clearSyncError', [errorId], () => super.clearSyncError(errorId));
    }

    // Backend Configs
    saveBackendConfig(config: BackendConfig): void {
        this.proxyWrite('saveBackendConfig', [config], () => super.saveBackendConfig(config));
    }

    deleteBackendConfig(name: string): void {
        this.proxyWrite('deleteBackendConfig', [name], () => super.deleteBackendConfig(name));
    }

    updateBackendConfig(name: string, updates: Partial<BackendConfig>): void {
        this.proxyWrite('updateBackendConfig', [name, updates], () => super.updateBackendConfig(name, updates));
    }

    // ─── Disposal ───────────────────────────────────────────────────────────

    close(): void {
        if (this.syncTimer) { clearInterval(this.syncTimer); }
        if (this.healthTimer) { clearInterval(this.healthTimer); }
        if (this.wsUnsubscribe) { this.wsUnsubscribe(); }
        try { this.client.disconnect(); } catch { /* ignore */ }
        if (this._fallbackInitialized) { super.close(); }
    }
}
