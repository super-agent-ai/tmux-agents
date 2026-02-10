import * as fs from 'fs';
import * as path from 'path';
import {
    KanbanSwimLane, OrchestratorTask, AgentInstance, AgentTeam,
    Pipeline, PipelineRun, TaskStatus, AgentState, AgentRole,
    AIProvider, PipelineStatus, StageResult, PipelineStage,
    FavouriteFolder
} from './types';

// sql.js types (loaded dynamically to avoid node_modules dependency in packaged extension)
type SqlJsDatabase = any;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS swim_lanes (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, serverId TEXT NOT NULL,
    workingDirectory TEXT NOT NULL, sessionName TEXT NOT NULL,
    createdAt INTEGER NOT NULL, sessionActive INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, description TEXT NOT NULL, targetRole TEXT,
    assignedAgentId TEXT, status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 5, input TEXT, output TEXT,
    pipelineStageId TEXT, createdAt INTEGER NOT NULL, startedAt INTEGER,
    completedAt INTEGER, errorMessage TEXT, kanbanColumn TEXT,
    swimLaneId TEXT, parentTaskId TEXT, verificationStatus TEXT DEFAULT 'none',
    tmuxSessionName TEXT, tmuxWindowIndex TEXT, tmuxPaneIndex TEXT, tmuxServerId TEXT,
    FOREIGN KEY (swimLaneId) REFERENCES swim_lanes(id),
    FOREIGN KEY (parentTaskId) REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS subtask_relations (
    parentId TEXT NOT NULL, childId TEXT NOT NULL,
    PRIMARY KEY (parentId, childId),
    FOREIGN KEY (parentId) REFERENCES tasks(id),
    FOREIGN KEY (childId) REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, templateId TEXT NOT NULL, name TEXT NOT NULL,
    role TEXT NOT NULL, aiProvider TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'idle', serverId TEXT NOT NULL,
    sessionName TEXT NOT NULL, windowIndex TEXT NOT NULL,
    paneIndex TEXT NOT NULL, teamId TEXT, currentTaskId TEXT,
    createdAt INTEGER NOT NULL, lastActivityAt INTEGER NOT NULL,
    errorMessage TEXT);
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    pipelineId TEXT, createdAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS team_agents (
    teamId TEXT NOT NULL, agentId TEXT NOT NULL,
    PRIMARY KEY (teamId, agentId),
    FOREIGN KEY (teamId) REFERENCES teams(id),
    FOREIGN KEY (agentId) REFERENCES agents(id));
CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    stagesJson TEXT NOT NULL, createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY, pipelineId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    stageResultsJson TEXT NOT NULL DEFAULT '{}',
    startedAt INTEGER NOT NULL, completedAt INTEGER,
    FOREIGN KEY (pipelineId) REFERENCES pipelines(id));
CREATE TABLE IF NOT EXISTS favourite_folders (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    serverId TEXT NOT NULL, workingDirectory TEXT NOT NULL);
`;

export class Database {
    private db: SqlJsDatabase | null = null;
    private dbPath: string;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(dbPath: string) { this.dbPath = dbPath; }

    async initialize(): Promise<void> {
        const initSqlJs = require(path.join(__dirname, 'sql-wasm.js'));
        const SQL = await initSqlJs({
            locateFile: (file: string) => path.join(__dirname, file)
        });
        try {
            this.db = fs.existsSync(this.dbPath)
                ? new SQL.Database(fs.readFileSync(this.dbPath))
                : new SQL.Database();
            this.db.run('PRAGMA foreign_keys = ON;');
            this.db.run(SCHEMA);
            this.migrate();
            this.scheduleSave();
        } catch (err) {
            console.error('[Database] Failed to initialize:', err);
            this.db = new SQL.Database();
            this.db.run('PRAGMA foreign_keys = ON;');
            this.db.run(SCHEMA);
            this.migrate();
        }
    }

    private saveToDisk(): void {
        if (!this.db) { return; }
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
        } catch (err) { console.error('[Database] Save failed:', err); }
    }

    private scheduleSave(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); }
        this.saveTimer = setTimeout(() => this.saveToDisk(), 500);
    }

    private migrate(): void {
        if (!this.db) { return; }
        // Add tmux columns to tasks table if missing
        const cols = ['tmuxSessionName', 'tmuxWindowIndex', 'tmuxPaneIndex', 'tmuxServerId', 'autoMode', 'autoStart', 'autoPilot', 'autoClose'];
        for (const col of cols) {
            try {
                this.db.run(`ALTER TABLE tasks ADD COLUMN ${col} TEXT`);
            } catch { /* column already exists */ }
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private mapRows<T>(
        result: { columns: string[]; values: any[][] },
        mapper: (row: Record<string, any>) => T
    ): T[] {
        const { columns, values } = result;
        return values.map(vals => {
            const row: Record<string, any> = {};
            columns.forEach((c, i) => { row[c] = vals[i]; });
            return mapper(row);
        });
    }

    private queryAll<T>(sql: string, mapper: (r: Record<string, any>) => T, params?: any[]): T[] {
        if (!this.db) { return []; }
        try {
            const res = params ? this.db.exec(sql, params) : this.db.exec(sql);
            return res.length === 0 ? [] : this.mapRows(res[0], mapper);
        } catch (err) { console.error('[Database] query error:', err); return []; }
    }

    private queryOne<T>(sql: string, params: any[], mapper: (r: Record<string, any>) => T): T | undefined {
        if (!this.db) { return undefined; }
        try {
            const stmt = this.db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) { const row = stmt.getAsObject(); stmt.free(); return mapper(row); }
            stmt.free();
            return undefined;
        } catch (err) { console.error('[Database] query error:', err); return undefined; }
    }

    private run(sql: string, params?: any[]): void {
        if (!this.db) { return; }
        this.db.run(sql, params);
    }

    // ─── Swim Lanes ─────────────────────────────────────────────────────────

    saveSwimLane(lane: KanbanSwimLane): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO swim_lanes (id,name,serverId,workingDirectory,sessionName,createdAt,sessionActive)
                 VALUES (?,?,?,?,?,?,?)`,
                [lane.id, lane.name, lane.serverId, lane.workingDirectory,
                 lane.sessionName, lane.createdAt, lane.sessionActive ? 1 : 0]
            );
            this.scheduleSave();
        } catch (err) { console.error('[Database] saveSwimLane:', err); }
    }

    deleteSwimLane(id: string): void {
        if (!this.db) { return; }
        try { this.run('DELETE FROM swim_lanes WHERE id=?', [id]); this.scheduleSave(); }
        catch (err) { console.error('[Database] deleteSwimLane:', err); }
    }

    getAllSwimLanes(): KanbanSwimLane[] {
        return this.queryAll('SELECT * FROM swim_lanes', this.rowToSwimLane);
    }

    getSwimLane(id: string): KanbanSwimLane | undefined {
        return this.queryOne('SELECT * FROM swim_lanes WHERE id=?', [id], this.rowToSwimLane);
    }

    private rowToSwimLane = (r: Record<string, any>): KanbanSwimLane => ({
        id: r.id, name: r.name, serverId: r.serverId,
        workingDirectory: r.workingDirectory, sessionName: r.sessionName,
        createdAt: r.createdAt, sessionActive: r.sessionActive === 1
    });

    // ─── Favourite Folders ─────────────────────────────────────────────────

    saveFavouriteFolder(f: FavouriteFolder): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO favourite_folders (id,name,serverId,workingDirectory) VALUES (?,?,?,?)`,
                [f.id, f.name, f.serverId, f.workingDirectory]
            );
            this.scheduleSave();
        } catch (err) { console.error('[Database] saveFavouriteFolder:', err); }
    }

    deleteFavouriteFolder(id: string): void {
        if (!this.db) { return; }
        try { this.run('DELETE FROM favourite_folders WHERE id=?', [id]); this.scheduleSave(); }
        catch (err) { console.error('[Database] deleteFavouriteFolder:', err); }
    }

    getAllFavouriteFolders(): FavouriteFolder[] {
        return this.queryAll('SELECT * FROM favourite_folders', this.rowToFavouriteFolder);
    }

    private rowToFavouriteFolder = (r: Record<string, any>): FavouriteFolder => ({
        id: r.id, name: r.name, serverId: r.serverId, workingDirectory: r.workingDirectory
    });

    // ─── Tasks ──────────────────────────────────────────────────────────────

    saveTask(task: OrchestratorTask): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO tasks
                 (id,description,targetRole,assignedAgentId,status,priority,input,output,
                  pipelineStageId,createdAt,startedAt,completedAt,errorMessage,kanbanColumn,
                  swimLaneId,parentTaskId,verificationStatus,
                  tmuxSessionName,tmuxWindowIndex,tmuxPaneIndex,tmuxServerId,autoStart,autoPilot,autoClose)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [task.id, task.description, task.targetRole ?? null,
                 task.assignedAgentId ?? null, task.status, task.priority,
                 task.input ?? null, task.output ?? null,
                 task.pipelineStageId ?? null, task.createdAt,
                 task.startedAt ?? null, task.completedAt ?? null,
                 task.errorMessage ?? null, task.kanbanColumn ?? null,
                 task.swimLaneId ?? null, task.parentTaskId ?? null,
                 task.verificationStatus ?? 'none',
                 task.tmuxSessionName ?? null, task.tmuxWindowIndex ?? null,
                 task.tmuxPaneIndex ?? null, task.tmuxServerId ?? null,
                 task.autoStart ? 1 : 0, task.autoPilot ? 1 : 0, task.autoClose ? 1 : 0]
            );
            // Rebuild subtask relations
            this.run('DELETE FROM subtask_relations WHERE parentId=?', [task.id]);
            if (task.subtaskIds && task.subtaskIds.length > 0) {
                const stmt = this.db.prepare(
                    'INSERT OR REPLACE INTO subtask_relations (parentId,childId) VALUES (?,?)'
                );
                for (const cid of task.subtaskIds) { stmt.run([task.id, cid]); }
                stmt.free();
            }
            this.scheduleSave();
        } catch (err) { console.error('[Database] saveTask:', err); }
    }

    deleteTask(id: string): void {
        if (!this.db) { return; }
        try {
            this.run('DELETE FROM subtask_relations WHERE parentId=? OR childId=?', [id, id]);
            this.run('DELETE FROM tasks WHERE id=?', [id]);
            this.scheduleSave();
        } catch (err) { console.error('[Database] deleteTask:', err); }
    }

    getAllTasks(): OrchestratorTask[] {
        return this.queryAll('SELECT * FROM tasks', r => this.rowToTask(r));
    }

    getTask(id: string): OrchestratorTask | undefined {
        return this.queryOne('SELECT * FROM tasks WHERE id=?', [id], r => this.rowToTask(r));
    }

    getTasksBySwimLane(swimLaneId: string): OrchestratorTask[] {
        return this.queryAll('SELECT * FROM tasks WHERE swimLaneId=?', r => this.rowToTask(r), [swimLaneId]);
    }

    getSubtasks(parentId: string): OrchestratorTask[] {
        return this.queryAll(
            `SELECT t.* FROM tasks t INNER JOIN subtask_relations sr ON sr.childId=t.id
             WHERE sr.parentId=?`,
            r => this.rowToTask(r), [parentId]
        );
    }

    private getSubtaskIds(parentId: string): string[] {
        if (!this.db) { return []; }
        try {
            const res = this.db.exec('SELECT childId FROM subtask_relations WHERE parentId=?', [parentId]);
            return res.length === 0 ? [] : res[0].values.map((v: any[]) => v[0] as string);
        } catch { return []; }
    }

    private rowToTask(r: Record<string, any>): OrchestratorTask {
        const t: OrchestratorTask = {
            id: r.id, description: r.description,
            status: r.status as TaskStatus, priority: r.priority,
            createdAt: r.createdAt,
            verificationStatus: (r.verificationStatus as OrchestratorTask['verificationStatus']) ?? 'none'
        };
        if (r.targetRole != null) { t.targetRole = r.targetRole as AgentRole; }
        if (r.assignedAgentId != null) { t.assignedAgentId = r.assignedAgentId; }
        if (r.input != null) { t.input = r.input; }
        if (r.output != null) { t.output = r.output; }
        if (r.pipelineStageId != null) { t.pipelineStageId = r.pipelineStageId; }
        if (r.startedAt != null) { t.startedAt = r.startedAt; }
        if (r.completedAt != null) { t.completedAt = r.completedAt; }
        if (r.errorMessage != null) { t.errorMessage = r.errorMessage; }
        if (r.kanbanColumn != null) { t.kanbanColumn = r.kanbanColumn; }
        if (r.swimLaneId != null) { t.swimLaneId = r.swimLaneId; }
        if (r.parentTaskId != null) { t.parentTaskId = r.parentTaskId; }
        if (r.tmuxSessionName != null) { t.tmuxSessionName = r.tmuxSessionName; }
        if (r.tmuxWindowIndex != null) { t.tmuxWindowIndex = r.tmuxWindowIndex; }
        if (r.tmuxPaneIndex != null) { t.tmuxPaneIndex = r.tmuxPaneIndex; }
        if (r.tmuxServerId != null) { t.tmuxServerId = r.tmuxServerId; }
        if (r.autoMode != null) { t.autoStart = r.autoMode === 1 || r.autoMode === '1'; t.autoClose = t.autoStart; }
        if (r.autoStart != null) { t.autoStart = r.autoStart === 1 || r.autoStart === '1'; }
        if (r.autoPilot != null) { t.autoPilot = r.autoPilot === 1 || r.autoPilot === '1'; }
        if (r.autoClose != null) { t.autoClose = r.autoClose === 1 || r.autoClose === '1'; }
        const subs = this.getSubtaskIds(t.id);
        if (subs.length > 0) { t.subtaskIds = subs; }
        return t;
    }

    // ─── Agents ─────────────────────────────────────────────────────────────

    saveAgent(agent: AgentInstance): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO agents
                 (id,templateId,name,role,aiProvider,state,serverId,sessionName,
                  windowIndex,paneIndex,teamId,currentTaskId,createdAt,lastActivityAt,errorMessage)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [agent.id, agent.templateId, agent.name, agent.role,
                 agent.aiProvider, agent.state, agent.serverId, agent.sessionName,
                 agent.windowIndex, agent.paneIndex, agent.teamId ?? null,
                 agent.currentTaskId ?? null, agent.createdAt, agent.lastActivityAt,
                 agent.errorMessage ?? null]
            );
            this.scheduleSave();
        } catch (err) { console.error('[Database] saveAgent:', err); }
    }

    deleteAgent(id: string): void {
        if (!this.db) { return; }
        try {
            this.run('DELETE FROM team_agents WHERE agentId=?', [id]);
            this.run('DELETE FROM agents WHERE id=?', [id]);
            this.scheduleSave();
        } catch (err) { console.error('[Database] deleteAgent:', err); }
    }

    getAllAgents(): AgentInstance[] {
        return this.queryAll('SELECT * FROM agents', this.rowToAgent);
    }

    getAgent(id: string): AgentInstance | undefined {
        return this.queryOne('SELECT * FROM agents WHERE id=?', [id], this.rowToAgent);
    }

    private rowToAgent = (r: Record<string, any>): AgentInstance => {
        const a: AgentInstance = {
            id: r.id, templateId: r.templateId, name: r.name,
            role: r.role as AgentRole, aiProvider: r.aiProvider as AIProvider,
            state: r.state as AgentState, serverId: r.serverId,
            sessionName: r.sessionName, windowIndex: r.windowIndex,
            paneIndex: r.paneIndex, createdAt: r.createdAt,
            lastActivityAt: r.lastActivityAt
        };
        if (r.teamId != null) { a.teamId = r.teamId; }
        if (r.currentTaskId != null) { a.currentTaskId = r.currentTaskId; }
        if (r.errorMessage != null) { a.errorMessage = r.errorMessage; }
        return a;
    };

    // ─── Teams ──────────────────────────────────────────────────────────────

    saveTeam(team: AgentTeam): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO teams (id,name,description,pipelineId,createdAt)
                 VALUES (?,?,?,?,?)`,
                [team.id, team.name, team.description ?? null,
                 team.pipelineId ?? null, team.createdAt]
            );
            this.run('DELETE FROM team_agents WHERE teamId=?', [team.id]);
            if (team.agents.length > 0) {
                const stmt = this.db.prepare(
                    'INSERT OR REPLACE INTO team_agents (teamId,agentId) VALUES (?,?)'
                );
                for (const aid of team.agents) { stmt.run([team.id, aid]); }
                stmt.free();
            }
            this.scheduleSave();
        } catch (err) { console.error('[Database] saveTeam:', err); }
    }

    deleteTeam(id: string): void {
        if (!this.db) { return; }
        try {
            this.run('DELETE FROM team_agents WHERE teamId=?', [id]);
            this.run('DELETE FROM teams WHERE id=?', [id]);
            this.scheduleSave();
        } catch (err) { console.error('[Database] deleteTeam:', err); }
    }

    getAllTeams(): AgentTeam[] {
        return this.queryAll('SELECT * FROM teams', r => this.rowToTeam(r));
    }

    getTeam(id: string): AgentTeam | undefined {
        return this.queryOne('SELECT * FROM teams WHERE id=?', [id], r => this.rowToTeam(r));
    }

    private getTeamAgentIds(teamId: string): string[] {
        if (!this.db) { return []; }
        try {
            const res = this.db.exec('SELECT agentId FROM team_agents WHERE teamId=?', [teamId]);
            return res.length === 0 ? [] : res[0].values.map((v: any[]) => v[0] as string);
        } catch { return []; }
    }

    private rowToTeam(r: Record<string, any>): AgentTeam {
        const t: AgentTeam = {
            id: r.id, name: r.name,
            agents: this.getTeamAgentIds(r.id),
            createdAt: r.createdAt
        };
        if (r.description != null) { t.description = r.description; }
        if (r.pipelineId != null) { t.pipelineId = r.pipelineId; }
        return t;
    }

    // ─── Pipelines ──────────────────────────────────────────────────────────

    savePipeline(pipeline: Pipeline): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO pipelines (id,name,description,stagesJson,createdAt,updatedAt)
                 VALUES (?,?,?,?,?,?)`,
                [pipeline.id, pipeline.name, pipeline.description ?? null,
                 JSON.stringify(pipeline.stages), pipeline.createdAt, pipeline.updatedAt]
            );
            this.scheduleSave();
        } catch (err) { console.error('[Database] savePipeline:', err); }
    }

    deletePipeline(id: string): void {
        if (!this.db) { return; }
        try { this.run('DELETE FROM pipelines WHERE id=?', [id]); this.scheduleSave(); }
        catch (err) { console.error('[Database] deletePipeline:', err); }
    }

    getAllPipelines(): Pipeline[] {
        return this.queryAll('SELECT * FROM pipelines', this.rowToPipeline);
    }

    getPipeline(id: string): Pipeline | undefined {
        return this.queryOne('SELECT * FROM pipelines WHERE id=?', [id], this.rowToPipeline);
    }

    private rowToPipeline = (r: Record<string, any>): Pipeline => {
        let stages: PipelineStage[] = [];
        try { stages = JSON.parse(r.stagesJson); } catch { /* malformed */ }
        return {
            id: r.id, name: r.name,
            description: r.description != null ? r.description : undefined,
            stages, createdAt: r.createdAt, updatedAt: r.updatedAt
        };
    };

    // ─── Pipeline Runs ──────────────────────────────────────────────────────

    savePipelineRun(run: PipelineRun): void {
        if (!this.db) { return; }
        try {
            this.run(
                `INSERT OR REPLACE INTO pipeline_runs (id,pipelineId,status,stageResultsJson,startedAt,completedAt)
                 VALUES (?,?,?,?,?,?)`,
                [run.id, run.pipelineId, run.status,
                 JSON.stringify(run.stageResults), run.startedAt, run.completedAt ?? null]
            );
            this.scheduleSave();
        } catch (err) { console.error('[Database] savePipelineRun:', err); }
    }

    deletePipelineRun(id: string): void {
        if (!this.db) { return; }
        try { this.run('DELETE FROM pipeline_runs WHERE id=?', [id]); this.scheduleSave(); }
        catch (err) { console.error('[Database] deletePipelineRun:', err); }
    }

    getAllPipelineRuns(): PipelineRun[] {
        return this.queryAll('SELECT * FROM pipeline_runs', this.rowToPipelineRun);
    }

    getPipelineRun(id: string): PipelineRun | undefined {
        return this.queryOne('SELECT * FROM pipeline_runs WHERE id=?', [id], this.rowToPipelineRun);
    }

    private rowToPipelineRun = (r: Record<string, any>): PipelineRun => {
        let stageResults: Record<string, StageResult> = {};
        try { stageResults = JSON.parse(r.stageResultsJson); } catch { /* malformed */ }
        const run: PipelineRun = {
            id: r.id, pipelineId: r.pipelineId,
            status: r.status as PipelineStatus,
            stageResults, startedAt: r.startedAt
        };
        if (r.completedAt != null) { run.completedAt = r.completedAt; }
        return run;
    };

    // ─── Disposal ───────────────────────────────────────────────────────────

    close(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        this.saveToDisk();
        if (this.db) { this.db.close(); this.db = null; }
    }
}
