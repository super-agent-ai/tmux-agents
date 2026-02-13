import * as vscode from 'vscode';
import { AgentTeam } from './core/types';

function generateId(): string {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export class TeamManager implements vscode.Disposable {

    private teams: Map<string, AgentTeam> = new Map();

    private _onTeamChanged = new vscode.EventEmitter<AgentTeam>();
    public readonly onTeamChanged: vscode.Event<AgentTeam> = this._onTeamChanged.event;

    // ─── Team CRUD ───────────────────────────────────────────────────────────

    createTeam(name: string, description?: string): AgentTeam {
        const team: AgentTeam = {
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

    deleteTeam(teamId: string): void {
        const team = this.teams.get(teamId);
        if (team) {
            this.teams.delete(teamId);
            this._onTeamChanged.fire(team);
        }
    }

    getTeam(teamId: string): AgentTeam | undefined {
        return this.teams.get(teamId);
    }

    getAllTeams(): AgentTeam[] {
        return Array.from(this.teams.values());
    }

    // ─── Agent Membership ────────────────────────────────────────────────────

    addAgentToTeam(teamId: string, agentId: string): void {
        const team = this.teams.get(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }

        if (!team.agents.includes(agentId)) {
            team.agents.push(agentId);
            this._onTeamChanged.fire(team);
        }
    }

    removeAgentFromTeam(teamId: string, agentId: string): void {
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

    getTeamAgents(teamId: string): string[] {
        const team = this.teams.get(teamId);
        return team ? [...team.agents] : [];
    }

    // ─── Pipeline Assignment ─────────────────────────────────────────────────

    setPipelineForTeam(teamId: string, pipelineId: string): void {
        const team = this.teams.get(teamId);
        if (!team) {
            throw new Error(`Team not found: ${teamId}`);
        }

        team.pipelineId = pipelineId;
        this._onTeamChanged.fire(team);
    }

    // ─── Lookups ─────────────────────────────────────────────────────────────

    findTeamForAgent(agentId: string): AgentTeam | undefined {
        const allTeams = Array.from(this.teams.values());
        for (const team of allTeams) {
            if (team.agents.includes(agentId)) {
                return team;
            }
        }
        return undefined;
    }

    // ─── Template-based Creation ─────────────────────────────────────────────

    createTeamFromTemplate(name: string, agentTemplateIds: string[]): AgentTeam {
        const team: AgentTeam = {
            id: generateId(),
            name,
            description: `Team created from templates: ${agentTemplateIds.join(', ')}`,
            agents: [],  // Actual agent spawning is done by the orchestrator
            createdAt: Date.now()
        };
        this.teams.set(team.id, team);
        this._onTeamChanged.fire(team);
        return team;
    }

    // ─── Disposal ────────────────────────────────────────────────────────────

    dispose(): void {
        this._onTeamChanged.dispose();
    }
}
