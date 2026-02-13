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
exports.TeamManager = void 0;
const vscode = __importStar(require("vscode"));
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
class TeamManager {
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
exports.TeamManager = TeamManager;
//# sourceMappingURL=teamManager.js.map