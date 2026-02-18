#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Post-install script for the tmux-agents unified package.
 * Copies the bundled skill files to ~/.claude/skills/tmux-agents/
 * so Claude Code can discover them automatically.
 *
 * Upgrade behaviour:
 *  - Tracks installed version in .version file inside the skill directory.
 *  - On fresh install: copies all files.
 *  - On upgrade (version changed): overwrites all files to keep skill in sync.
 *  - On same version reinstall: skips (no-op).
 *  - Never touches ~/.tmux-agents/ (data.db, config, daemon.pid, etc.)
 *  - Non-fatal — skill install errors should never block npm install.
 */

/**
 * Recursively copy all files from src to dest, overwriting existing files.
 */
function copyAll(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyAll(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Read the installed skill version from the .version file.
 * Returns null if not installed or file missing.
 */
function readInstalledVersion(installDir) {
  const versionFile = path.join(installDir, '.version');
  try {
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Write the current version to the .version file in the skill directory.
 */
function writeVersion(installDir, version) {
  fs.writeFileSync(path.join(installDir, '.version'), version + '\n');
}

function main() {
  const skillSrc = path.join(__dirname, '..', 'dist', 'skill');
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  if (!homeDir) {
    // Can't determine home directory — skip silently
    return;
  }

  // Allow custom install path via env var
  const installDir = process.env.TMUX_AGENTS_SKILL_PATH
    || path.join(homeDir, '.claude', 'skills', 'tmux-agents');

  // Check that bundled skill files exist
  if (!fs.existsSync(path.join(skillSrc, 'SKILL.md'))) {
    // Skill files not bundled (e.g. dev install) — skip silently
    return;
  }

  // Read the package version being installed
  let currentVersion;
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
    );
    currentVersion = pkgJson.version;
  } catch {
    currentVersion = 'unknown';
  }

  const installedVersion = readInstalledVersion(installDir);
  const isInstalled = fs.existsSync(path.join(installDir, 'SKILL.md'));

  if (isInstalled && installedVersion === currentVersion) {
    // Same version — no update needed
    console.log('');
    console.log('  tmux-agents skill v' + currentVersion + ' already up to date');
  } else if (isInstalled && installedVersion) {
    // Version upgrade — overwrite to keep in sync
    try {
      copyAll(skillSrc, installDir);
      writeVersion(installDir, currentVersion);
      console.log('');
      console.log('  tmux-agents skill updated: v' + installedVersion + ' -> v' + currentVersion);
    } catch (err) {
      console.log('  (Could not update skill: ' + err.message + ')');
      console.log('  To update manually: tmux-agents skill install --force');
    }
  } else {
    // Fresh install (or no version file from pre-versioning era)
    try {
      copyAll(skillSrc, installDir);
      writeVersion(installDir, currentVersion);
      console.log('');
      console.log('  tmux-agents skill v' + currentVersion + ' installed to ' + installDir);
    } catch (err) {
      console.log('  (Could not auto-install skill: ' + err.message + ')');
    }
  }

  // Print post-install instructions
  console.log('');
  console.log('  \x1b[1mtmux-agents v' + currentVersion + '\x1b[0m installed successfully!');
  console.log('');
  console.log('  Get started:');
  console.log('    tmux-agents daemon start     # Start the daemon');
  console.log('    tmux-agents health            # Check daemon health');
  console.log('    tmux-agents agent list        # List running agents');
  console.log('    tmux-agents tui               # Launch terminal UI');
  console.log('    tmux-agents --help            # Full command reference');
  console.log('');
  console.log('  Skill docs: ' + installDir);
  console.log('  Manual update: tmux-agents skill install --force');
  console.log('');
}

try {
  main();
} catch (err) {
  // Absolutely non-fatal — never block npm install
}
