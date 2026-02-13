"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
CREATE TABLE IF NOT EXISTS task_dependencies (
    taskId TEXT NOT NULL, dependsOnTaskId TEXT NOT NULL,
    PRIMARY KEY (taskId, dependsOnTaskId),
    FOREIGN KEY (taskId) REFERENCES tasks(id),
    FOREIGN KEY (dependsOnTaskId) REFERENCES tasks(id));
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
CREATE TABLE IF NOT EXISTS org_units (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    parentId TEXT, leadAgentId TEXT, mission TEXT, contextInstructions TEXT,
    FOREIGN KEY (parentId) REFERENCES org_units(id));
CREATE TABLE IF NOT EXISTS org_unit_members (
    orgUnitId TEXT NOT NULL, agentId TEXT NOT NULL,
    PRIMARY KEY (orgUnitId, agentId),
    FOREIGN KEY (orgUnitId) REFERENCES org_units(id));
CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, expertiseArea TEXT NOT NULL,
    contextInstructions TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS guild_members (
    guildId TEXT NOT NULL, agentId TEXT NOT NULL,
    PRIMARY KEY (guildId, agentId),
    FOREIGN KEY (guildId) REFERENCES guilds(id));
CREATE TABLE IF NOT EXISTS guild_knowledge (
    id TEXT PRIMARY KEY, guildId TEXT NOT NULL, summary TEXT NOT NULL,
    sourceTaskId TEXT, createdAt INTEGER NOT NULL,
    FOREIGN KEY (guildId) REFERENCES guilds(id));
CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY, fromAgentId TEXT NOT NULL, toAgentId TEXT NOT NULL,
    content TEXT NOT NULL, timestamp INTEGER NOT NULL, read INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt INTEGER NOT NULL,
    lastMessageAt INTEGER NOT NULL, aiProvider TEXT NOT NULL, model TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY, conversationId TEXT NOT NULL, role TEXT NOT NULL,
    content TEXT NOT NULL, timestamp INTEGER NOT NULL,
    FOREIGN KEY (conversationId) REFERENCES conversations(id));
CREATE TABLE IF NOT EXISTS task_status_history (
    id TEXT PRIMARY KEY, taskId TEXT NOT NULL, fromStatus TEXT NOT NULL,
    toStatus TEXT NOT NULL, fromColumn TEXT NOT NULL, toColumn TEXT NOT NULL,
    changedAt INTEGER NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY, taskId TEXT NOT NULL, text TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tasks(id));
CREATE TABLE IF NOT EXISTS task_tags (
    taskId TEXT NOT NULL, tag TEXT NOT NULL,
    PRIMARY KEY (taskId, tag),
    FOREIGN KEY (taskId) REFERENCES tasks(id));
`;
class Database {
    constructor(dbPath) {
        this.db = null;
        this.saveTimer = null;
        this.rowToSwimLane = (r) => {
            let defaultToggles;
            if (r.defaultToggles) {
                try {
                    defaultToggles = JSON.parse(r.defaultToggles);
                }
                catch { /* malformed */ }
            }
            return {
                id: r.id, name: r.name, serverId: r.serverId,
                workingDirectory: r.workingDirectory, sessionName: r.sessionName,
                createdAt: r.createdAt, sessionActive: r.sessionActive === 1,
                aiProvider: r.aiProvider || undefined,
                contextInstructions: r.contextInstructions || undefined,
                aiModel: r.aiModel || undefined,
                defaultToggles,
                memoryFileId: r.memoryFileId || undefined,
                memoryPath: r.memoryPath || undefined,
            };
        };
        this.rowToFavouriteFolder = (r) => ({
            id: r.id, name: r.name, serverId: r.serverId, workingDirectory: r.workingDirectory
        });
        this.rowToAgent = (r) => {
            const a = {
                id: r.id, templateId: r.templateId, name: r.name,
                role: r.role, aiProvider: r.aiProvider,
                state: r.state, serverId: r.serverId,
                sessionName: r.sessionName, windowIndex: r.windowIndex,
                paneIndex: r.paneIndex, createdAt: r.createdAt,
                lastActivityAt: r.lastActivityAt
            };
            if (r.teamId != null) {
                a.teamId = r.teamId;
            }
            if (r.currentTaskId != null) {
                a.currentTaskId = r.currentTaskId;
            }
            if (r.errorMessage != null) {
                a.errorMessage = r.errorMessage;
            }
            return a;
        };
        this.rowToPipeline = (r) => {
            let stages = [];
            try {
                stages = JSON.parse(r.stagesJson);
            }
            catch { /* malformed */ }
            return {
                id: r.id, name: r.name,
                description: r.description != null ? r.description : undefined,
                stages, createdAt: r.createdAt, updatedAt: r.updatedAt
            };
        };
        this.rowToPipelineRun = (r) => {
            let stageResults = {};
            try {
                stageResults = JSON.parse(r.stageResultsJson);
            }
            catch { /* malformed */ }
            const run = {
                id: r.id, pipelineId: r.pipelineId,
                status: r.status,
                stageResults, startedAt: r.startedAt
            };
            if (r.completedAt != null) {
                run.completedAt = r.completedAt;
            }
            return run;
        };
        this.rowToAgentMessage = (r) => ({
            id: r.id, fromAgentId: r.fromAgentId, toAgentId: r.toAgentId,
            content: r.content, timestamp: r.timestamp, read: r.read === 1,
        });
        this.dbPath = dbPath;
    }
    async initialize() {
        const initSqlJs = require(path.join(__dirname, 'sql-wasm.js'));
        const SQL = await initSqlJs({
            locateFile: (file) => path.join(__dirname, file)
        });
        try {
            this.db = fs.existsSync(this.dbPath)
                ? new SQL.Database(fs.readFileSync(this.dbPath))
                : new SQL.Database();
            this.db.run('PRAGMA foreign_keys = ON;');
            this.db.run(SCHEMA);
            this.migrate();
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] Failed to initialize:', err);
            this.db = new SQL.Database();
            this.db.run('PRAGMA foreign_keys = ON;');
            this.db.run(SCHEMA);
            this.migrate();
        }
    }
    saveToDisk() {
        if (!this.db) {
            return;
        }
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
        }
        catch (err) {
            console.error('[Database] Save failed:', err);
        }
    }
    scheduleSave() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => this.saveToDisk(), 500);
    }
    migrate() {
        if (!this.db) {
            return;
        }
        // Add tmux columns to tasks table if missing
        const cols = ['tmuxSessionName', 'tmuxWindowIndex', 'tmuxPaneIndex', 'tmuxServerId', 'autoMode', 'autoStart', 'autoPilot', 'autoClose', 'aiProvider', 'aiModel', 'useWorktree', 'worktreePath', 'doneAt', 'useMemory', 'serverOverride', 'workingDirectoryOverride'];
        for (const col of cols) {
            try {
                this.db.run(`ALTER TABLE tasks ADD COLUMN ${col} TEXT`);
            }
            catch { /* column already exists */ }
        }
        // Add aiProvider and contextInstructions columns to swim_lanes if missing
        for (const col of ['aiProvider', 'contextInstructions', 'aiModel', 'defaultToggles', 'memoryFileId', 'memoryPath']) {
            try {
                this.db.run(`ALTER TABLE swim_lanes ADD COLUMN ${col} TEXT`);
            }
            catch { /* column already exists */ }
        }
        // Migrate: move auto-close summary from description to input
        this.migrateAutoCloseSummary();
    }
    /** Move old **Auto-close session summary:** from task description to input. */
    migrateAutoCloseSummary() {
        if (!this.db) {
            return;
        }
        const marker = '**Auto-close session summary:**';
        try {
            const res = this.db.exec(`SELECT id, description, input FROM tasks WHERE description LIKE '%${marker}%'`);
            if (res.length === 0) {
                return;
            }
            const { columns, values } = res[0];
            for (const vals of values) {
                const row = {};
                columns.forEach((c, i) => { row[c] = vals[i]; });
                const desc = row.description || '';
                const idx = desc.indexOf('\n\n---\n' + marker);
                if (idx === -1) {
                    continue;
                }
                const cleanDesc = desc.slice(0, idx);
                const summaryBlock = desc.slice(idx + '\n\n---\n'.length);
                // Re-label header and append to input
                const relabelled = summaryBlock.replace(marker, '**Session Summary**');
                const existingInput = row.input || '';
                const sep = existingInput ? '\n\n---\n' : '';
                const newInput = existingInput + sep + relabelled;
                this.db.run('UPDATE tasks SET description=?, input=? WHERE id=?', [cleanDesc, newInput, row.id]);
            }
            this.scheduleSave();
        }
        catch (err) {
            console.warn('[Database] migrateAutoCloseSummary:', err);
        }
    }
    // ─── Helpers ────────────────────────────────────────────────────────────
    mapRows(result, mapper) {
        const { columns, values } = result;
        return values.map(vals => {
            const row = {};
            columns.forEach((c, i) => { row[c] = vals[i]; });
            return mapper(row);
        });
    }
    queryAll(sql, mapper, params) {
        if (!this.db) {
            return [];
        }
        try {
            const res = params ? this.db.exec(sql, params) : this.db.exec(sql);
            return res.length === 0 ? [] : this.mapRows(res[0], mapper);
        }
        catch (err) {
            console.error('[Database] query error:', err);
            return [];
        }
    }
    queryOne(sql, params, mapper) {
        if (!this.db) {
            return undefined;
        }
        try {
            const stmt = this.db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return mapper(row);
            }
            stmt.free();
            return undefined;
        }
        catch (err) {
            console.error('[Database] query error:', err);
            return undefined;
        }
    }
    run(sql, params) {
        if (!this.db) {
            return;
        }
        this.db.run(sql, params);
    }
    // ─── Swim Lanes ─────────────────────────────────────────────────────────
    saveSwimLane(lane) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO swim_lanes (id,name,serverId,workingDirectory,sessionName,createdAt,sessionActive,aiProvider,contextInstructions,aiModel,defaultToggles,memoryFileId,memoryPath)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [lane.id, lane.name, lane.serverId, lane.workingDirectory,
                lane.sessionName, lane.createdAt, lane.sessionActive ? 1 : 0,
                lane.aiProvider || null, lane.contextInstructions || null,
                lane.aiModel || null,
                lane.defaultToggles ? JSON.stringify(lane.defaultToggles) : null,
                lane.memoryFileId || null, lane.memoryPath || null]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveSwimLane:', err);
        }
    }
    deleteSwimLane(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM swim_lanes WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteSwimLane:', err);
        }
    }
    getAllSwimLanes() {
        return this.queryAll('SELECT * FROM swim_lanes', this.rowToSwimLane);
    }
    getSwimLane(id) {
        return this.queryOne('SELECT * FROM swim_lanes WHERE id=?', [id], this.rowToSwimLane);
    }
    // ─── Favourite Folders ─────────────────────────────────────────────────
    saveFavouriteFolder(f) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO favourite_folders (id,name,serverId,workingDirectory) VALUES (?,?,?,?)`, [f.id, f.name, f.serverId, f.workingDirectory]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveFavouriteFolder:', err);
        }
    }
    deleteFavouriteFolder(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM favourite_folders WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteFavouriteFolder:', err);
        }
    }
    getAllFavouriteFolders() {
        return this.queryAll('SELECT * FROM favourite_folders', this.rowToFavouriteFolder);
    }
    // ─── Tasks ──────────────────────────────────────────────────────────────
    saveTask(task) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO tasks
                 (id,description,targetRole,assignedAgentId,status,priority,input,output,
                  pipelineStageId,createdAt,startedAt,completedAt,errorMessage,kanbanColumn,
                  swimLaneId,parentTaskId,verificationStatus,
                  tmuxSessionName,tmuxWindowIndex,tmuxPaneIndex,tmuxServerId,autoStart,autoPilot,autoClose,
                  aiProvider,aiModel,useWorktree,worktreePath,doneAt,serverOverride,workingDirectoryOverride)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [task.id, task.description, task.targetRole ?? null,
                task.assignedAgentId ?? null, task.status, task.priority,
                task.input ?? null, task.output ?? null,
                task.pipelineStageId ?? null, task.createdAt,
                task.startedAt ?? null, task.completedAt ?? null,
                task.errorMessage ?? null, task.kanbanColumn ?? null,
                task.swimLaneId ?? null, task.parentTaskId ?? null,
                task.verificationStatus ?? 'none',
                task.tmuxSessionName ?? null, task.tmuxWindowIndex ?? null,
                task.tmuxPaneIndex ?? null, task.tmuxServerId ?? null,
                task.autoStart === undefined ? null : task.autoStart ? 1 : 0,
                task.autoPilot === undefined ? null : task.autoPilot ? 1 : 0,
                task.autoClose === undefined ? null : task.autoClose ? 1 : 0,
                task.aiProvider ?? null, task.aiModel ?? null,
                task.useWorktree === undefined ? null : task.useWorktree ? 1 : 0,
                task.worktreePath ?? null,
                task.doneAt ?? null,
                task.serverOverride ?? null,
                task.workingDirectoryOverride ?? null]);
            // Rebuild subtask relations
            this.run('DELETE FROM subtask_relations WHERE parentId=?', [task.id]);
            if (task.subtaskIds && task.subtaskIds.length > 0) {
                const stmt = this.db.prepare('INSERT OR REPLACE INTO subtask_relations (parentId,childId) VALUES (?,?)');
                for (const cid of task.subtaskIds) {
                    stmt.run([task.id, cid]);
                }
                stmt.free();
            }
            // Rebuild dependency relations
            this.run('DELETE FROM task_dependencies WHERE taskId=?', [task.id]);
            if (task.dependsOn && task.dependsOn.length > 0) {
                const depStmt = this.db.prepare('INSERT OR REPLACE INTO task_dependencies (taskId,dependsOnTaskId) VALUES (?,?)');
                for (const depId of task.dependsOn) {
                    depStmt.run([task.id, depId]);
                }
                depStmt.free();
            }
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveTask:', err);
        }
    }
    deleteTask(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM task_status_history WHERE taskId=?', [id]);
            this.run('DELETE FROM task_comments WHERE taskId=?', [id]);
            this.run('DELETE FROM task_tags WHERE taskId=?', [id]);
            this.run('DELETE FROM subtask_relations WHERE parentId=? OR childId=?', [id, id]);
            this.run('DELETE FROM task_dependencies WHERE taskId=? OR dependsOnTaskId=?', [id, id]);
            this.run('DELETE FROM tasks WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteTask:', err);
        }
    }
    getAllTasks() {
        return this.queryAll('SELECT * FROM tasks', r => this.rowToTask(r));
    }
    getTask(id) {
        return this.queryOne('SELECT * FROM tasks WHERE id=?', [id], r => this.rowToTask(r));
    }
    getTasksBySwimLane(swimLaneId) {
        return this.queryAll('SELECT * FROM tasks WHERE swimLaneId=?', r => this.rowToTask(r), [swimLaneId]);
    }
    getSubtasks(parentId) {
        return this.queryAll(`SELECT t.* FROM tasks t INNER JOIN subtask_relations sr ON sr.childId=t.id
             WHERE sr.parentId=?`, r => this.rowToTask(r), [parentId]);
    }
    getSubtaskIds(parentId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT childId FROM subtask_relations WHERE parentId=?', [parentId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    getDependsOnIds(taskId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT dependsOnTaskId FROM task_dependencies WHERE taskId=?', [taskId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    rowToTask(r) {
        const t = {
            id: r.id, description: r.description,
            status: r.status, priority: r.priority,
            createdAt: r.createdAt,
            verificationStatus: r.verificationStatus ?? 'none'
        };
        if (r.targetRole != null) {
            t.targetRole = r.targetRole;
        }
        if (r.assignedAgentId != null) {
            t.assignedAgentId = r.assignedAgentId;
        }
        if (r.input != null) {
            t.input = r.input;
        }
        if (r.output != null) {
            t.output = r.output;
        }
        if (r.pipelineStageId != null) {
            t.pipelineStageId = r.pipelineStageId;
        }
        if (r.startedAt != null) {
            t.startedAt = r.startedAt;
        }
        if (r.completedAt != null) {
            t.completedAt = r.completedAt;
        }
        if (r.errorMessage != null) {
            t.errorMessage = r.errorMessage;
        }
        if (r.kanbanColumn != null) {
            t.kanbanColumn = r.kanbanColumn;
        }
        if (r.swimLaneId != null) {
            t.swimLaneId = r.swimLaneId;
        }
        if (r.parentTaskId != null) {
            t.parentTaskId = r.parentTaskId;
        }
        if (r.tmuxSessionName != null) {
            t.tmuxSessionName = r.tmuxSessionName;
        }
        if (r.tmuxWindowIndex != null) {
            t.tmuxWindowIndex = r.tmuxWindowIndex;
        }
        if (r.tmuxPaneIndex != null) {
            t.tmuxPaneIndex = r.tmuxPaneIndex;
        }
        if (r.tmuxServerId != null) {
            t.tmuxServerId = r.tmuxServerId;
        }
        if (r.autoMode != null) {
            t.autoStart = r.autoMode === 1 || r.autoMode === '1';
            t.autoClose = t.autoStart;
        }
        if (r.autoStart != null) {
            t.autoStart = r.autoStart === 1 || r.autoStart === '1';
        }
        if (r.autoPilot != null) {
            t.autoPilot = r.autoPilot === 1 || r.autoPilot === '1';
        }
        if (r.autoClose != null) {
            t.autoClose = r.autoClose === 1 || r.autoClose === '1';
        }
        if (r.aiProvider != null) {
            t.aiProvider = r.aiProvider;
        }
        if (r.aiModel != null) {
            t.aiModel = r.aiModel;
        }
        if (r.useWorktree != null) {
            t.useWorktree = r.useWorktree === 1 || r.useWorktree === '1';
        }
        if (r.worktreePath != null) {
            t.worktreePath = r.worktreePath;
        }
        if (r.doneAt != null) {
            t.doneAt = r.doneAt;
        }
        if (r.serverOverride != null) {
            t.serverOverride = r.serverOverride;
        }
        if (r.workingDirectoryOverride != null) {
            t.workingDirectoryOverride = r.workingDirectoryOverride;
        }
        const subs = this.getSubtaskIds(t.id);
        if (subs.length > 0) {
            t.subtaskIds = subs;
        }
        const deps = this.getDependsOnIds(t.id);
        if (deps.length > 0) {
            t.dependsOn = deps;
        }
        const tags = this.getTags(t.id);
        if (tags.length > 0) {
            t.tags = tags;
        }
        const comments = this.getComments(t.id);
        if (comments.length > 0) {
            t.comments = comments;
        }
        const history = this.getStatusHistory(t.id);
        if (history.length > 0) {
            t.statusHistory = history;
        }
        return t;
    }
    // ─── Task Status History ────────────────────────────────────────────────
    addStatusHistory(entry) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT INTO task_status_history (id,taskId,fromStatus,toStatus,fromColumn,toColumn,changedAt)
                 VALUES (?,?,?,?,?,?,?)`, [entry.id, entry.taskId, entry.fromStatus, entry.toStatus,
                entry.fromColumn, entry.toColumn, entry.changedAt]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] addStatusHistory:', err);
        }
    }
    getStatusHistory(taskId) {
        return this.queryAll('SELECT * FROM task_status_history WHERE taskId=? ORDER BY changedAt ASC', r => ({ id: r.id, taskId: r.taskId, fromStatus: r.fromStatus, toStatus: r.toStatus, fromColumn: r.fromColumn, toColumn: r.toColumn, changedAt: r.changedAt }), [taskId]);
    }
    // ─── Task Comments ───────────────────────────────────────────────────
    addComment(comment) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT INTO task_comments (id,taskId,text,createdAt) VALUES (?,?,?,?)`, [comment.id, comment.taskId, comment.text, comment.createdAt]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] addComment:', err);
        }
    }
    deleteComment(commentId) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM task_comments WHERE id=?', [commentId]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteComment:', err);
        }
    }
    getComments(taskId) {
        return this.queryAll('SELECT * FROM task_comments WHERE taskId=? ORDER BY createdAt ASC', r => ({ id: r.id, taskId: r.taskId, text: r.text, createdAt: r.createdAt }), [taskId]);
    }
    // ─── Task Tags ───────────────────────────────────────────────────────
    saveTags(taskId, tags) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM task_tags WHERE taskId=?', [taskId]);
            if (tags.length > 0) {
                const stmt = this.db.prepare('INSERT OR REPLACE INTO task_tags (taskId,tag) VALUES (?,?)');
                for (const tag of tags) {
                    stmt.run([taskId, tag]);
                }
                stmt.free();
            }
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveTags:', err);
        }
    }
    getTags(taskId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT tag FROM task_tags WHERE taskId=?', [taskId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    // ─── Agents ─────────────────────────────────────────────────────────────
    saveAgent(agent) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO agents
                 (id,templateId,name,role,aiProvider,state,serverId,sessionName,
                  windowIndex,paneIndex,teamId,currentTaskId,createdAt,lastActivityAt,errorMessage)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [agent.id, agent.templateId, agent.name, agent.role,
                agent.aiProvider, agent.state, agent.serverId, agent.sessionName,
                agent.windowIndex, agent.paneIndex, agent.teamId ?? null,
                agent.currentTaskId ?? null, agent.createdAt, agent.lastActivityAt,
                agent.errorMessage ?? null]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveAgent:', err);
        }
    }
    deleteAgent(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM team_agents WHERE agentId=?', [id]);
            this.run('DELETE FROM agents WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteAgent:', err);
        }
    }
    getAllAgents() {
        return this.queryAll('SELECT * FROM agents', this.rowToAgent);
    }
    getAgent(id) {
        return this.queryOne('SELECT * FROM agents WHERE id=?', [id], this.rowToAgent);
    }
    // ─── Teams ──────────────────────────────────────────────────────────────
    saveTeam(team) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO teams (id,name,description,pipelineId,createdAt)
                 VALUES (?,?,?,?,?)`, [team.id, team.name, team.description ?? null,
                team.pipelineId ?? null, team.createdAt]);
            this.run('DELETE FROM team_agents WHERE teamId=?', [team.id]);
            if (team.agents.length > 0) {
                const stmt = this.db.prepare('INSERT OR REPLACE INTO team_agents (teamId,agentId) VALUES (?,?)');
                for (const aid of team.agents) {
                    stmt.run([team.id, aid]);
                }
                stmt.free();
            }
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveTeam:', err);
        }
    }
    deleteTeam(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM team_agents WHERE teamId=?', [id]);
            this.run('DELETE FROM teams WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteTeam:', err);
        }
    }
    getAllTeams() {
        return this.queryAll('SELECT * FROM teams', r => this.rowToTeam(r));
    }
    getTeam(id) {
        return this.queryOne('SELECT * FROM teams WHERE id=?', [id], r => this.rowToTeam(r));
    }
    getTeamAgentIds(teamId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT agentId FROM team_agents WHERE teamId=?', [teamId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    rowToTeam(r) {
        const t = {
            id: r.id, name: r.name,
            agents: this.getTeamAgentIds(r.id),
            createdAt: r.createdAt
        };
        if (r.description != null) {
            t.description = r.description;
        }
        if (r.pipelineId != null) {
            t.pipelineId = r.pipelineId;
        }
        return t;
    }
    // ─── Pipelines ──────────────────────────────────────────────────────────
    savePipeline(pipeline) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO pipelines (id,name,description,stagesJson,createdAt,updatedAt)
                 VALUES (?,?,?,?,?,?)`, [pipeline.id, pipeline.name, pipeline.description ?? null,
                JSON.stringify(pipeline.stages), pipeline.createdAt, pipeline.updatedAt]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] savePipeline:', err);
        }
    }
    deletePipeline(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM pipelines WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deletePipeline:', err);
        }
    }
    getAllPipelines() {
        return this.queryAll('SELECT * FROM pipelines', this.rowToPipeline);
    }
    getPipeline(id) {
        return this.queryOne('SELECT * FROM pipelines WHERE id=?', [id], this.rowToPipeline);
    }
    // ─── Pipeline Runs ──────────────────────────────────────────────────────
    savePipelineRun(run) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO pipeline_runs (id,pipelineId,status,stageResultsJson,startedAt,completedAt)
                 VALUES (?,?,?,?,?,?)`, [run.id, run.pipelineId, run.status,
                JSON.stringify(run.stageResults), run.startedAt, run.completedAt ?? null]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] savePipelineRun:', err);
        }
    }
    deletePipelineRun(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM pipeline_runs WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deletePipelineRun:', err);
        }
    }
    getAllPipelineRuns() {
        return this.queryAll('SELECT * FROM pipeline_runs', this.rowToPipelineRun);
    }
    getPipelineRun(id) {
        return this.queryOne('SELECT * FROM pipeline_runs WHERE id=?', [id], this.rowToPipelineRun);
    }
    // ─── Organization Units ────────────────────────────────────────────────
    saveOrgUnit(unit) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO org_units (id,name,type,parentId,leadAgentId,mission,contextInstructions)
                 VALUES (?,?,?,?,?,?,?)`, [unit.id, unit.name, unit.type, unit.parentId ?? null,
                unit.leadAgentId ?? null, unit.mission ?? null, unit.contextInstructions ?? null]);
            this.run('DELETE FROM org_unit_members WHERE orgUnitId=?', [unit.id]);
            if (unit.memberIds.length > 0) {
                const stmt = this.db.prepare('INSERT OR REPLACE INTO org_unit_members (orgUnitId,agentId) VALUES (?,?)');
                for (const mid of unit.memberIds) {
                    stmt.run([unit.id, mid]);
                }
                stmt.free();
            }
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveOrgUnit:', err);
        }
    }
    deleteOrgUnit(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM org_unit_members WHERE orgUnitId=?', [id]);
            this.run('DELETE FROM org_units WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteOrgUnit:', err);
        }
    }
    getAllOrgUnits() {
        return this.queryAll('SELECT * FROM org_units', r => this.rowToOrgUnit(r));
    }
    getOrgUnit(id) {
        return this.queryOne('SELECT * FROM org_units WHERE id=?', [id], r => this.rowToOrgUnit(r));
    }
    getOrgUnitMemberIds(orgUnitId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT agentId FROM org_unit_members WHERE orgUnitId=?', [orgUnitId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    rowToOrgUnit(r) {
        const unit = {
            id: r.id, name: r.name, type: r.type,
            memberIds: this.getOrgUnitMemberIds(r.id),
        };
        if (r.parentId != null) {
            unit.parentId = r.parentId;
        }
        if (r.leadAgentId != null) {
            unit.leadAgentId = r.leadAgentId;
        }
        if (r.mission != null) {
            unit.mission = r.mission;
        }
        if (r.contextInstructions != null) {
            unit.contextInstructions = r.contextInstructions;
        }
        return unit;
    }
    // ─── Guilds ────────────────────────────────────────────────────────────
    saveGuild(guild) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO guilds (id,name,expertiseArea,contextInstructions)
                 VALUES (?,?,?,?)`, [guild.id, guild.name, guild.expertiseArea, guild.contextInstructions || '']);
            this.run('DELETE FROM guild_members WHERE guildId=?', [guild.id]);
            if (guild.memberIds.length > 0) {
                const stmt = this.db.prepare('INSERT OR REPLACE INTO guild_members (guildId,agentId) VALUES (?,?)');
                for (const mid of guild.memberIds) {
                    stmt.run([guild.id, mid]);
                }
                stmt.free();
            }
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveGuild:', err);
        }
    }
    deleteGuild(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM guild_knowledge WHERE guildId=?', [id]);
            this.run('DELETE FROM guild_members WHERE guildId=?', [id]);
            this.run('DELETE FROM guilds WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteGuild:', err);
        }
    }
    getAllGuilds() {
        return this.queryAll('SELECT * FROM guilds', r => this.rowToGuild(r));
    }
    getGuild(id) {
        return this.queryOne('SELECT * FROM guilds WHERE id=?', [id], r => this.rowToGuild(r));
    }
    addGuildKnowledge(guildId, knowledge) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO guild_knowledge (id,guildId,summary,sourceTaskId,createdAt)
                 VALUES (?,?,?,?,?)`, [knowledge.id, guildId, knowledge.summary, knowledge.sourceTaskId, knowledge.createdAt]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] addGuildKnowledge:', err);
        }
    }
    getGuildMemberIds(guildId) {
        if (!this.db) {
            return [];
        }
        try {
            const res = this.db.exec('SELECT agentId FROM guild_members WHERE guildId=?', [guildId]);
            return res.length === 0 ? [] : res[0].values.map((v) => v[0]);
        }
        catch {
            return [];
        }
    }
    getGuildKnowledge(guildId) {
        return this.queryAll('SELECT * FROM guild_knowledge WHERE guildId=? ORDER BY createdAt DESC LIMIT 50', r => ({ id: r.id, summary: r.summary, sourceTaskId: r.sourceTaskId, createdAt: r.createdAt }), [guildId]);
    }
    rowToGuild(r) {
        return {
            id: r.id, name: r.name, expertiseArea: r.expertiseArea,
            memberIds: this.getGuildMemberIds(r.id),
            knowledgeBase: this.getGuildKnowledge(r.id),
            contextInstructions: r.contextInstructions || '',
        };
    }
    // ─── Agent Messages ────────────────────────────────────────────────────
    saveAgentMessage(msg) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO agent_messages (id,fromAgentId,toAgentId,content,timestamp,read)
                 VALUES (?,?,?,?,?,?)`, [msg.id, msg.fromAgentId, msg.toAgentId, msg.content, msg.timestamp, msg.read ? 1 : 0]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveAgentMessage:', err);
        }
    }
    getAgentMessages(agentId, limit = 50) {
        return this.queryAll(`SELECT * FROM agent_messages WHERE fromAgentId=? OR toAgentId=? ORDER BY timestamp DESC LIMIT ?`, this.rowToAgentMessage, [agentId, agentId, limit]);
    }
    getAllAgentMessages(limit = 100) {
        return this.queryAll('SELECT * FROM agent_messages ORDER BY timestamp DESC LIMIT ?', this.rowToAgentMessage, [limit]);
    }
    markMessageRead(messageId) {
        if (!this.db) {
            return;
        }
        try {
            this.run('UPDATE agent_messages SET read=1 WHERE id=?', [messageId]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] markMessageRead:', err);
        }
    }
    // ─── Conversations ─────────────────────────────────────────────────────
    saveConversation(conv) {
        if (!this.db) {
            return;
        }
        try {
            this.run(`INSERT OR REPLACE INTO conversations (id,title,createdAt,lastMessageAt,aiProvider,model)
                 VALUES (?,?,?,?,?,?)`, [conv.id, conv.title, conv.createdAt, conv.lastMessageAt, conv.aiProvider, conv.model]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveConversation:', err);
        }
    }
    deleteConversation(id) {
        if (!this.db) {
            return;
        }
        try {
            this.run('DELETE FROM conversation_messages WHERE conversationId=?', [id]);
            this.run('DELETE FROM conversations WHERE id=?', [id]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] deleteConversation:', err);
        }
    }
    getAllConversations() {
        return this.queryAll('SELECT * FROM conversations ORDER BY lastMessageAt DESC', r => this.rowToConversation(r));
    }
    saveConversationMessage(conversationId, entry) {
        if (!this.db) {
            return;
        }
        const id = crypto.randomUUID?.() || 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        try {
            this.run(`INSERT INTO conversation_messages (id,conversationId,role,content,timestamp)
                 VALUES (?,?,?,?,?)`, [id, conversationId, entry.role, entry.content, entry.timestamp]);
            this.run('UPDATE conversations SET lastMessageAt=? WHERE id=?', [entry.timestamp, conversationId]);
            this.scheduleSave();
        }
        catch (err) {
            console.error('[Database] saveConversationMessage:', err);
        }
    }
    getConversationMessages(conversationId) {
        return this.queryAll('SELECT * FROM conversation_messages WHERE conversationId=? ORDER BY timestamp ASC', r => ({ role: r.role, content: r.content, timestamp: r.timestamp }), [conversationId]);
    }
    rowToConversation(r) {
        return {
            id: r.id, title: r.title, createdAt: r.createdAt,
            lastMessageAt: r.lastMessageAt, aiProvider: r.aiProvider,
            model: r.model, messages: this.getConversationMessages(r.id),
            status: 'idle', isCollapsed: true,
            lastPreview: '',
        };
    }
    // ─── Agent Profile Stats ───────────────────────────────────────────────
    getAgentProfileStats(agentId) {
        if (!this.db) {
            return undefined;
        }
        const agent = this.getAgent(agentId);
        if (!agent) {
            return undefined;
        }
        try {
            const total = this.db.exec('SELECT COUNT(*) FROM tasks WHERE assignedAgentId=?', [agentId]);
            const completed = this.db.exec("SELECT COUNT(*) FROM tasks WHERE assignedAgentId=? AND status='completed'", [agentId]);
            const failed = this.db.exec("SELECT COUNT(*) FROM tasks WHERE assignedAgentId=? AND status='failed'", [agentId]);
            const avgTime = this.db.exec("SELECT AVG(completedAt - startedAt) FROM tasks WHERE assignedAgentId=? AND status='completed' AND completedAt IS NOT NULL AND startedAt IS NOT NULL", [agentId]);
            const totalCount = total.length > 0 ? total[0].values[0][0] : 0;
            const completedCount = completed.length > 0 ? completed[0].values[0][0] : 0;
            const failedCount = failed.length > 0 ? failed[0].values[0][0] : 0;
            const avgMs = avgTime.length > 0 && avgTime[0].values[0][0] != null ? avgTime[0].values[0][0] : 0;
            const successRate = totalCount > 0 ? completedCount / totalCount : 0;
            const badges = [];
            if (successRate >= 0.9 && completedCount >= 5) {
                badges.push('Perfectionist');
            }
            if (avgMs > 0 && avgMs < 120000 && completedCount >= 5) {
                badges.push('Speed Demon');
            }
            if (completedCount >= 20) {
                badges.push('Workhorse');
            }
            if (completedCount >= 10 && failedCount === 0) {
                badges.push('Flawless');
            }
            return {
                agentId, agentName: agent.name, role: agent.role,
                aiProvider: agent.aiProvider, totalTasks: totalCount,
                completedTasks: completedCount, failedTasks: failedCount,
                successRate, avgCompletionMs: avgMs, badges,
            };
        }
        catch (err) {
            console.error('[Database] getAgentProfileStats:', err);
            return undefined;
        }
    }
    getAllAgentProfileStats() {
        const agents = this.getAllAgents();
        const stats = [];
        for (const agent of agents) {
            const s = this.getAgentProfileStats(agent.id);
            if (s) {
                stats.push(s);
            }
        }
        return stats;
    }
    // ─── Disposal ───────────────────────────────────────────────────────────
    close() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        this.saveToDisk();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
exports.Database = Database;
//# sourceMappingURL=database.js.map