// ─── Logging ─────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	level: LogLevel;
	component: string;
	message: string;
	data?: any;
	timestamp: string;
}

/**
 * Logger - Simple structured logging
 */
export class Logger {
	private level: LogLevel;
	private readonly levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(level: LogLevel = 'info') {
		this.level = level;
	}

	/**
	 * Set log level
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Check if level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return this.levels[level] >= this.levels[this.level];
	}

	/**
	 * Format and write log entry
	 */
	private log(level: LogLevel, component: string, message: string, data?: any): void {
		if (!this.shouldLog(level)) {
			return;
		}

		const entry: LogEntry = {
			level,
			component,
			message,
			data,
			timestamp: new Date().toISOString(),
		};

		const output = this.formatEntry(entry);

		// Write to stderr for warn/error, stdout for others
		if (level === 'warn' || level === 'error') {
			console.error(output);
		} else {
			console.log(output);
		}
	}

	/**
	 * Format log entry as JSON
	 */
	private formatEntry(entry: LogEntry): string {
		return JSON.stringify(entry);
	}

	/**
	 * Log methods
	 */
	debug(component: string, message: string, data?: any): void {
		this.log('debug', component, message, data);
	}

	info(component: string, message: string, data?: any): void {
		this.log('info', component, message, data);
	}

	warn(component: string, message: string, data?: any): void {
		this.log('warn', component, message, data);
	}

	error(component: string, message: string, data?: any): void {
		this.log('error', component, message, data);
	}
}
