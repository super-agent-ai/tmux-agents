// ─── Crash Recovery & Reconciliation ─────────────────────────────────────────

import { Database } from '../core/database';
import { AgentOrchestrator } from '../core/orchestrator';
import { AgentInstance, AgentState, AIProvider } from '../core/types';
import { Logger } from './log';
import * as cp from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(cp.exec);

export interface ReconciliationResult {
	total: number;
	reconnected: number;
	lost: number;
	errors: string[];
}

/**
 * Reconciler - Reconnects to agents that survived daemon restart
 */
export class Reconciler {
	constructor(
		private db: Database,
		private orchestrator: AgentOrchestrator,
		private logger: Logger
	) {}

	/**
	 * Reconcile agents on daemon startup
	 * - Load active agents from DB
	 * - Check if their runtime targets still exist
	 * - Reconnect if alive, mark as lost if dead
	 */
	async reconcile(): Promise<ReconciliationResult> {
		this.logger.info('reconciler', 'Starting agent reconciliation');

		const result: ReconciliationResult = {
			total: 0,
			reconnected: 0,
			lost: 0,
			errors: [],
		};

		try {
			// Load all agents that were not terminated
			const agents = await this.db.getAllAgents();
			const activeAgents = agents.filter(
				a => a.state !== AgentState.TERMINATED && a.state !== AgentState.ERROR
			);

			result.total = activeAgents.length;
			this.logger.info('reconciler', `Found ${result.total} active agents to reconcile`);

			// Check each agent
			for (const agent of activeAgents) {
				try {
					const isAlive = await this.checkAgentAlive(agent);

					if (isAlive) {
						// Reconnect agent
						await this.reconnectAgent(agent);
						result.reconnected++;
						this.logger.info('reconciler', `Reconnected agent ${agent.id}`, {
							agentId: agent.id,
							role: agent.role,
						});
					} else {
						// Mark as lost
						await this.markAgentLost(agent);
						result.lost++;
						this.logger.warn('reconciler', `Agent ${agent.id} lost (runtime target dead)`, {
							agentId: agent.id,
							role: agent.role,
						});
					}
				} catch (error) {
					result.errors.push(`Agent ${agent.id}: ${error}`);
					this.logger.error('reconciler', `Failed to reconcile agent ${agent.id}`, {
						agentId: agent.id,
						error: String(error),
					});
				}
			}

			this.logger.info('reconciler', 'Reconciliation complete', result);
		} catch (error) {
			this.logger.error('reconciler', 'Reconciliation failed', { error: String(error) });
			result.errors.push(`Reconciliation error: ${error}`);
		}

		return result;
	}

	/**
	 * Check if agent's runtime target still exists
	 */
	private async checkAgentAlive(agent: AgentInstance): Promise<boolean> {
		try {
			// For now, we check tmux sessions (local-tmux runtime)
			// In the future, we'll check Docker containers, K8s pods, etc.
			const sessionExists = await this.checkTmuxSession(
				agent.serverId,
				agent.sessionName
			);
			return sessionExists;
		} catch (error) {
			this.logger.error('reconciler', 'Failed to check agent alive', {
				agentId: agent.id,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Check if tmux session exists
	 */
	private async checkTmuxSession(serverId: string, sessionName: string): Promise<boolean> {
		try {
			if (serverId === 'local') {
				// Local tmux
				const { stdout } = await execAsync(
					`tmux has-session -t '${sessionName}' 2>/dev/null && echo exists || echo missing`
				);
				return stdout.trim() === 'exists';
			} else {
				// Remote tmux (SSH)
				// Extract host from serverId (format: "remote:<label>")
				// For now, skip remote sessions (would need SSH config)
				this.logger.debug('reconciler', `Skipping remote session check: ${serverId}`);
				return false;
			}
		} catch (error) {
			return false;
		}
	}

	/**
	 * Reconnect to a live agent
	 */
	private async reconnectAgent(agent: AgentInstance): Promise<void> {
		// Re-register with orchestrator
		this.orchestrator.registerAgent(agent);

		// Update last activity timestamp
		agent.lastActivityAt = Date.now();
		this.db.saveAgent(agent);
	}

	/**
	 * Mark agent as lost in database
	 */
	private async markAgentLost(agent: AgentInstance): Promise<void> {
		agent.state = AgentState.ERROR;
		agent.errorMessage = 'Agent lost after daemon restart (runtime target dead)';
		this.db.saveAgent(agent);
	}
}
