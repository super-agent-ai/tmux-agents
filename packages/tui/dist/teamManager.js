import * as vscode from 'vscode';
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
export class TeamManager {
    constructor() {
        this.teams = new Map();
        this._onTeamChanged = new vscode.EventEmitter();
        this.onTeamChanged = this._onTeamChanged.event;
    }
    // ─── Team CRUD ───────────────────────────────────────────────────────────
    createTeam(name, description) {
        const team = {
            id: generateId(),
            name,
            description,
            agents: [],
            createdAt: Date.now()
        };
        this.teams.set(team.id, team);
        this._onTeamChanged.fire(team);
        return team;
    }
    deleteTeam(teamId) {
        const team = this.teams.get(teamId);
        if (team) {
            this.teams.delete(teamId);
            this._onTeamChanged.fire(team);
        }
    }
    getTeam(teamId) {
        return this.teams.get(teamId);
    }
    getAllTeams() {
        return Array.from(this.teams.values());
    }
    // ─── Agent Membership ────────────────────────────────────────────────────
    addAgentToTeam(teamId, agentId) {
        const team = this.teams.get(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }
        if (!team.agents.includes(agentId)) {
            team.agents.push(agentId);
            this._onTeamChanged.fire(team);
        }
    }
    removeAgentFromTeam(teamId, agentId) {
        const team = this.teams.get(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }
        const index = team.agents.indexOf(agentId);
        if (index !== -1) {
            team.agents.splice(index, 1);
            this._onTeamChanged.fire(team);
        }
    }
    getTeamAgents(teamId) {
        const team = this.teams.get(teamId);
        return team ? [...team.agents] : [];
    }
    // ─── Pipeline Assignment ─────────────────────────────────────────────────
    setPipelineForTeam(teamId, pipelineId) {
        const team = this.teams.get(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }
        team.pipelineId = pipelineId;
        this._onTeamChanged.fire(team);
    }
    // ─── Lookups ─────────────────────────────────────────────────────────────
    findTeamForAgent(agentId) {
        const allTeams = Array.from(this.teams.values());
        for (const team of allTeams) {
            if (team.agents.includes(agentId)) {
                return team;
            }
        }
        return undefined;
    }
    // ─── Template-based Creation ─────────────────────────────────────────────
    createTeamFromTemplate(name, agentTemplateIds) {
        const team = {
            id: generateId(),
            name,
            description: `Team created from templates: ${agentTemplateIds.join(', ')}`,
            agents: [], // Actual agent spawning is done by the orchestrator
            createdAt: Date.now()
        };
        this.teams.set(team.id, team);
        this._onTeamChanged.fire(team);
        return team;
    }
    // ─── Disposal ────────────────────────────────────────────────────────────
    dispose() {
        this._onTeamChanged.dispose();
    }
}
//# sourceMappingURL=teamManager.js.map