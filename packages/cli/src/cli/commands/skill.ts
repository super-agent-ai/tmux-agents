import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { output, error } from '../util/output';
import { statusIcon, colorize, colors } from '../formatters/icons';

const SKILL_DIR_NAME = 'tmux-agents';
const INSTALL_BASE = path.join(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.claude',
    'skills',
    SKILL_DIR_NAME
);

function getBundledSkillDir(): string {
    // Check env var first (set by unified install package bin launcher)
    if (process.env.TMUX_AGENTS_SKILL_DIR) {
        return process.env.TMUX_AGENTS_SKILL_DIR;
    }
    // __dirname at runtime is dist/cli/cli/commands/
    // Bundled skill is at dist/skill/
    return path.join(__dirname, '..', '..', 'skill');
}

function getPackageVersion(): string {
    // Try bundled version file in skill dir first
    const bundled = getBundledSkillDir();
    const versionFile = path.join(bundled, '.version');
    try {
        const v = fs.readFileSync(versionFile, 'utf8').trim();
        if (v) return v;
    } catch { /* ignore */ }
    // Fallback: read from package.json up the tree
    for (const rel of ['../../../package.json', '../../../../package.json', '../../../../../package.json']) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
            if (pkg.version) return pkg.version;
        } catch { /* ignore */ }
    }
    return 'unknown';
}

function readInstalledVersion(installDir: string): string | null {
    try {
        return fs.readFileSync(path.join(installDir, '.version'), 'utf8').trim() || null;
    } catch {
        return null;
    }
}

function writeVersion(installDir: string, version: string): void {
    fs.writeFileSync(path.join(installDir, '.version'), version + '\n');
}

function copyRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function removeRecursive(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            removeRecursive(p);
        } else {
            fs.unlinkSync(p);
        }
    }
    fs.rmdirSync(dir);
}

export function registerSkillCommands(program: Command): void {
    const skill = program
        .command('skill')
        .description('Manage tmux-agents Claude Code skill');

    skill
        .command('install')
        .description('Install tmux-agents skill to ~/.claude/skills/')
        .option('-f, --force', 'Overwrite existing installation')
        .option('-p, --path <path>', 'Custom install location (default: ~/.claude/skills/tmux-agents)')
        .action(async (options) => {
            try {
                const installDir = options.path
                    ? path.resolve(options.path)
                    : INSTALL_BASE;

                const bundled = getBundledSkillDir();
                if (!fs.existsSync(path.join(bundled, 'SKILL.md'))) {
                    error('Bundled skill files not found. Reinstall @tmux-agents/cli.');
                }

                if (fs.existsSync(path.join(installDir, 'SKILL.md')) && !options.force) {
                    error(`Skill already installed at ${installDir}. Use --force to overwrite.`);
                }

                copyRecursive(bundled, installDir);
                const version = getPackageVersion();
                writeVersion(installDir, version);
                console.log(colorize(`Skill v${version} installed`, colors.green) + ` to ${installDir}`);
            } catch (err: any) {
                error(err.message);
            }
        });

    skill
        .command('uninstall')
        .description('Remove tmux-agents skill from ~/.claude/skills/')
        .option('-p, --path <path>', 'Custom skill location to uninstall')
        .action(async (options) => {
            try {
                const installDir = options.path
                    ? path.resolve(options.path)
                    : INSTALL_BASE;

                if (!fs.existsSync(path.join(installDir, 'SKILL.md'))) {
                    error(`Skill not installed at ${installDir}.`);
                }

                removeRecursive(installDir);
                console.log(colorize('Skill uninstalled', colors.green) + ` from ${installDir}`);
            } catch (err: any) {
                error(err.message);
            }
        });

    skill
        .command('list')
        .description('Show installed skill status')
        .option('--json', 'Output JSON')
        .option('-p, --path <path>', 'Custom skill location to check')
        .action(async (options) => {
            try {
                const installDir = options.path
                    ? path.resolve(options.path)
                    : INSTALL_BASE;
                const installed = fs.existsSync(path.join(installDir, 'SKILL.md'));
                const installedVersion = installed ? readInstalledVersion(installDir) : null;
                const bundledVersion = getPackageVersion();
                const needsUpdate = installed && installedVersion && bundledVersion !== 'unknown'
                    && installedVersion !== bundledVersion;

                if (options.json) {
                    output({
                        name: SKILL_DIR_NAME,
                        installed,
                        version: installedVersion,
                        bundledVersion,
                        needsUpdate: !!needsUpdate,
                        path: installed ? installDir : null
                    }, { json: true });
                } else {
                    const icon = installed ? statusIcon('ok') : statusIcon('error');
                    const versionStr = installedVersion ? ` v${installedVersion}` : '';
                    const status = installed
                        ? colorize(`installed${versionStr}`, colors.green)
                        : colorize('not installed', colors.dim);
                    console.log(`${icon} tmux-agents  ${status}`);
                    if (installed) {
                        console.log(`  ${colorize('path:', colors.dim)} ${installDir}`);
                    }
                    if (needsUpdate) {
                        console.log(`  ${colorize(`update available: v${installedVersion} -> v${bundledVersion}`, colors.yellow)}`);
                        console.log(`  ${colorize('run:', colors.dim)} tmux-agents skill install --force`);
                    }
                }
            } catch (err: any) {
                error(err.message);
            }
        });
}
