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
exports.OrganizationManager = void 0;
const vscode = __importStar(require("vscode"));
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
class OrganizationManager {
    constructor() {
        this.orgUnits = new Map();
        this._onOrgChanged = new vscode.EventEmitter();
        this.onOrgChanged = this._onOrgChanged.event;
    }
    // ─── CRUD ──────────────────────────────────────────────────────────────
    createOrgUnit(name, type, parentId) {
        const unit = {
            id: generateId(), name, type, memberIds: [],
        };
        if (parentId) {
            unit.parentId = parentId;
        }
        this.orgUnits.set(unit.id, unit);
        this._onOrgChanged.fire(unit);
        return unit;
    }
    updateOrgUnit(id, updates) {
        const existing = this.orgUnits.get(id);
        if (!existing) {
            throw new Error(`Org unit not found: ${id}`);
        }
        const updated = { ...existing, ...updates, id: existing.id };
        this.orgUnits.set(id, updated);
        this._onOrgChanged.fire(updated);
    }
    deleteOrgUnit(id) {
        const unit = this.orgUnits.get(id);
        if (unit) {
            // Reparent children to parent
            for (const child of this.getChildren(id)) {
                child.parentId = unit.parentId;
                this.orgUnits.set(child.id, child);
            }
            this.orgUnits.delete(id);
            this._onOrgChanged.fire(unit);
        }
    }
    getOrgUnit(id) {
        return this.orgUnits.get(id);
    }
    getAllOrgUnits() {
        return Array.from(this.orgUnits.values());
    }
    // ─── Hierarchy Traversal ───────────────────────────────────────────────
    getRoots() {
        return this.getAllOrgUnits().filter(u => !u.parentId);
    }
    getChildren(parentId) {
        return this.getAllOrgUnits().filter(u => u.parentId === parentId);
    }
    getAncestors(id) {
        const ancestors = [];
        let current = this.orgUnits.get(id);
        while (current?.parentId) {
            const parent = this.orgUnits.get(current.parentId);
            if (!parent) {
                break;
            }
            ancestors.push(parent);
            current = parent;
        }
        return ancestors;
    }
    getDescendants(id) {
        const descendants = [];
        const stack = this.getChildren(id);
        while (stack.length > 0) {
            const unit = stack.pop();
            descendants.push(unit);
            stack.push(...this.getChildren(unit.id));
        }
        return descendants;
    }
    // ─── Member Management ─────────────────────────────────────────────────
    addMember(orgUnitId, agentId) {
        const unit = this.orgUnits.get(orgUnitId);
        if (!unit) {
            throw new Error(`Org unit not found: ${orgUnitId}`);
        }
        if (!unit.memberIds.includes(agentId)) {
            unit.memberIds.push(agentId);
            this._onOrgChanged.fire(unit);
        }
    }
    removeMember(orgUnitId, agentId) {
        const unit = this.orgUnits.get(orgUnitId);
        if (!unit) {
            return;
        }
        const idx = unit.memberIds.indexOf(agentId);
        if (idx !== -1) {
            unit.memberIds.splice(idx, 1);
            if (unit.leadAgentId === agentId) {
                unit.leadAgentId = undefined;
            }
            this._onOrgChanged.fire(unit);
        }
    }
    setLead(orgUnitId, agentId) {
        const unit = this.orgUnits.get(orgUnitId);
        if (!unit) {
            throw new Error(`Org unit not found: ${orgUnitId}`);
        }
        unit.leadAgentId = agentId;
        if (!unit.memberIds.includes(agentId)) {
            unit.memberIds.push(agentId);
        }
        this._onOrgChanged.fire(unit);
    }
    findOrgUnitsForAgent(agentId) {
        return this.getAllOrgUnits().filter(u => u.memberIds.includes(agentId));
    }
    // ─── Context Instructions ──────────────────────────────────────────────
    /** Get merged context instructions from all ancestors + this unit */
    getMergedContextInstructions(orgUnitId) {
        const unit = this.orgUnits.get(orgUnitId);
        if (!unit) {
            return '';
        }
        const parts = [];
        const ancestors = this.getAncestors(orgUnitId).reverse();
        for (const a of ancestors) {
            if (a.contextInstructions) {
                parts.push(a.contextInstructions);
            }
        }
        if (unit.contextInstructions) {
            parts.push(unit.contextInstructions);
        }
        return parts.join('\n');
    }
    // ─── Bulk Load ─────────────────────────────────────────────────────────
    loadOrgUnits(units) {
        for (const unit of units) {
            this.orgUnits.set(unit.id, unit);
        }
    }
    // ─── Disposal ──────────────────────────────────────────────────────────
    dispose() {
        this._onOrgChanged.dispose();
    }
}
exports.OrganizationManager = OrganizationManager;
//# sourceMappingURL=organizationManager.js.map