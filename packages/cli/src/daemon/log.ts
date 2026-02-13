// ─── Structured Logging ──────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	ts: string;
	level: LogLevel;
	component: string;
	msg: string;
	data?: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Logger - Structured JSON logging with rotation
 *
 * Features:
 * - JSON-structured log lines
 * - Log rotation (max 50MB per file, keep 5 files)
 * - Output to file + stdout (if foreground mode)
 */
export class Logger {
	private level: LogLevel;
	private logFile?: string;
	private foreground: boolean;
	private maxFileSizeBytes: number = 50 * 1024 * 1024; // 50MB
	private maxBackups: number = 5;

	constructor(options: {
		level?: LogLevel;
		logFile?: string;
		foreground?: boolean;
	}) {
		this.level = options.level || 'info';
		this.logFile = options.logFile;
		this.foreground = options.foreground ?? false;

		// Ensure log directory exists
		if (this.logFile) {
			const dir = path.dirname(this.logFile);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
		}
	}

	/**
	 * Log a message at the specified level
	 */
	log(level: LogLevel, component: string, msg: string, data?: any): void {
		if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
			return;
		}

		const entry: LogEntry = {
			ts: new Date().toISOString(),
			level,
			component,
			msg,
		};

		if (data !== undefined) {
			entry.data = data;
		}

		const line = JSON.stringify(entry);

		// Output to stdout if foreground
		if (this.foreground) {
			console.log(line);
		}

		// Output to file if configured
		if (this.logFile) {
			this.writeToFile(line);
		}
	}

	debug(component: string, msg: string, data?: any): void {
		this.log('debug', component, msg, data);
	}

	info(component: string, msg: string, data?: any): void {
		this.log('info', component, msg, data);
	}

	warn(component: string, msg: string, data?: any): void {
		this.log('warn', component, msg, data);
	}

	error(component: string, msg: string, data?: any): void {
		this.log('error', component, msg, data);
	}

	/**
	 * Write log line to file with rotation
	 */
	private writeToFile(line: string): void {
		if (!this.logFile) {
			return;
		}

		try {
			// Check file size and rotate if needed
			if (fs.existsSync(this.logFile)) {
				const stats = fs.statSync(this.logFile);
				if (stats.size >= this.maxFileSizeBytes) {
					this.rotateLog();
				}
			}

			// Append to log file
			fs.appendFileSync(this.logFile, line + '\n', 'utf-8');
		} catch (error) {
			// Fallback to console if file write fails
			console.error('Failed to write to log file:', error);
			console.log(line);
		}
	}

	/**
	 * Rotate log files (daemon.log → daemon.log.1 → daemon.log.2 → ...)
	 */
	private rotateLog(): void {
		if (!this.logFile) {
			return;
		}

		try {
			// Remove oldest backup
			const oldestBackup = `${this.logFile}.${this.maxBackups}`;
			if (fs.existsSync(oldestBackup)) {
				fs.unlinkSync(oldestBackup);
			}

			// Shift existing backups
			for (let i = this.maxBackups - 1; i >= 1; i--) {
				const oldPath = `${this.logFile}.${i}`;
				const newPath = `${this.logFile}.${i + 1}`;
				if (fs.existsSync(oldPath)) {
					fs.renameSync(oldPath, newPath);
				}
			}

			// Rotate current log to .1
			if (fs.existsSync(this.logFile)) {
				fs.renameSync(this.logFile, `${this.logFile}.1`);
			}
		} catch (error) {
			console.error('Failed to rotate log file:', error);
		}
	}

	/**
	 * Change log level at runtime
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
		this.info('logger', `Log level changed to ${level}`);
	}
}
