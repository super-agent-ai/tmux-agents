import * as vscode from 'vscode';
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
export class GuildManager {
    constructor() {
        this.guilds = new Map();
        this._onGuildChanged = new vscode.EventEmitter();
        this.onGuildChanged = this._onGuildChanged.event;
    }
    // ─── CRUD ──────────────────────────────────────────────────────────────
    createGuild(name, expertiseArea) {
        const guild = {
            id: generateId(), name, expertiseArea,
            memberIds: [], knowledgeBase: [], contextInstructions: '',
        };
        this.guilds.set(guild.id, guild);
        this._onGuildChanged.fire(guild);
        return guild;
    }
    updateGuild(id, updates) {
        const existing = this.guilds.get(id);
        if (!existing) {
            throw new Error(`Guild not found: ${id}`);
        }
        const updated = { ...existing, ...updates, id: existing.id };
        this.guilds.set(id, updated);
        this._onGuildChanged.fire(updated);
    }
    deleteGuild(id) {
        const guild = this.guilds.get(id);
        if (guild) {
            this.guilds.delete(id);
            this._onGuildChanged.fire(guild);
        }
    }
    getGuild(id) {
        return this.guilds.get(id);
    }
    getAllGuilds() {
        return Array.from(this.guilds.values());
    }
    // ─── Member Management ─────────────────────────────────────────────────
    addMember(guildId, agentId) {
        const guild = this.guilds.get(guildId);
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`);
        }
        if (!guild.memberIds.includes(agentId)) {
            guild.memberIds.push(agentId);
            this._onGuildChanged.fire(guild);
        }
    }
    removeMember(guildId, agentId) {
        const guild = this.guilds.get(guildId);
        if (!guild) {
            return;
        }
        const idx = guild.memberIds.indexOf(agentId);
        if (idx !== -1) {
            guild.memberIds.splice(idx, 1);
            this._onGuildChanged.fire(guild);
        }
    }
    findGuildsForAgent(agentId) {
        return this.getAllGuilds().filter(g => g.memberIds.includes(agentId));
    }
    // ─── Knowledge Base ────────────────────────────────────────────────────
    addKnowledge(guildId, summary, sourceTaskId) {
        const guild = this.guilds.get(guildId);
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`);
        }
        const knowledge = {
            id: generateId(), summary, sourceTaskId, createdAt: Date.now(),
        };
        guild.knowledgeBase.unshift(knowledge);
        // Keep last 100 entries
        if (guild.knowledgeBase.length > 100) {
            guild.knowledgeBase = guild.knowledgeBase.slice(0, 100);
        }
        this._onGuildChanged.fire(guild);
        return knowledge;
    }
    getRecentKnowledge(guildId, limit = 10) {
        const guild = this.guilds.get(guildId);
        if (!guild) {
            return [];
        }
        return guild.knowledgeBase.slice(0, limit);
    }
    /** Get merged context for an agent based on all their guild memberships */
    getGuildContextForAgent(agentId, knowledgeLimit = 5) {
        const guilds = this.findGuildsForAgent(agentId);
        if (guilds.length === 0) {
            return '';
        }
        const parts = ['## Guild Knowledge'];
        for (const guild of guilds) {
            parts.push(`\n### ${guild.name} Guild (${guild.expertiseArea})`);
            if (guild.contextInstructions) {
                parts.push(guild.contextInstructions);
            }
            const recent = guild.knowledgeBase.slice(0, knowledgeLimit);
            if (recent.length > 0) {
                parts.push('Recent learnings:');
                for (const k of recent) {
                    parts.push(`- ${k.summary}`);
                }
            }
        }
        return parts.join('\n');
    }
    // ─── Bulk Load ─────────────────────────────────────────────────────────
    loadGuilds(guilds) {
        for (const guild of guilds) {
            this.guilds.set(guild.id, guild);
        }
    }
    // ─── Disposal ──────────────────────────────────────────────────────────
    dispose() {
        this._onGuildChanged.dispose();
    }
}
//# sourceMappingURL=guildManager.js.map