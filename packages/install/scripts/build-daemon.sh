#!/usr/bin/env bash
set -euo pipefail

# Build script for the tmux-agents unified install package.
# Copies the daemon and its dependency tree from out/ into dist/,
# plus CLI, TUI, and MCP compiled outputs so the tarball is fully
# self-contained (no @tmux-agents/* npm dependencies).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"

OUT_DIR="$REPO_ROOT/out"
DIST_DIR="$PKG_DIR/dist"

# Verify out/ exists
if [ ! -d "$OUT_DIR/daemon" ]; then
  echo "Error: $OUT_DIR/daemon not found. Run 'npm run compile' from repo root first." >&2
  exit 1
fi

# Verify workspace packages are built
for pkg in cli tui mcp; do
  if [ ! -d "$REPO_ROOT/packages/$pkg/dist" ]; then
    echo "Error: packages/$pkg/dist not found. Run 'npm run build -w packages/$pkg' first." >&2
    exit 1
  fi
done

VERSION=$(node -p "require('$PKG_DIR/package.json').version")

echo "Building tmux-agents v$VERSION install package..."
echo "  Source: $OUT_DIR"
echo "  Target: $DIST_DIR"

# Clean previous build
rm -rf "$DIST_DIR"

# ── daemon/ ─────────────────────────────────────────────
mkdir -p "$DIST_DIR/daemon"
cp "$OUT_DIR"/daemon/*.js "$DIST_DIR/daemon/"

# ── core/ ───────────────────────────────────────────────
mkdir -p "$DIST_DIR/core"
cp "$OUT_DIR"/core/*.js "$DIST_DIR/core/"
# sql-wasm runtime (WASM binary + JS loader)
if [ -f "$OUT_DIR/core/sql-wasm.wasm" ]; then
  cp "$OUT_DIR/core/sql-wasm.wasm" "$DIST_DIR/core/"
fi
if [ -f "$OUT_DIR/core/sql-wasm.js" ]; then
  cp "$OUT_DIR/core/sql-wasm.js" "$DIST_DIR/core/"
fi

# ── backends/ ───────────────────────────────────────────
mkdir -p "$DIST_DIR/backends"
cp "$OUT_DIR"/backends/*.js "$DIST_DIR/backends/"

# ── sync/ ───────────────────────────────────────────────
mkdir -p "$DIST_DIR/sync"
cp "$OUT_DIR"/sync/*.js "$DIST_DIR/sync/"

# ── types.js (shared types, required by backends/exampleBackend.js) ──
if [ -f "$OUT_DIR/types.js" ]; then
  cp "$OUT_DIR/types.js" "$DIST_DIR/"
fi

# ── skill/ (Claude Code skill files) ───────────────────
SKILL_SRC="$REPO_ROOT/packages/cli/skill"
if [ -d "$SKILL_SRC" ]; then
  mkdir -p "$DIST_DIR/skill/references"
  cp "$SKILL_SRC/SKILL.md" "$DIST_DIR/skill/"
  if [ -d "$SKILL_SRC/references" ]; then
    cp -r "$SKILL_SRC/references/"* "$DIST_DIR/skill/references/"
  fi
  # Write version file for postinstall upgrade detection
  echo "$VERSION" > "$DIST_DIR/skill/.version"
else
  echo "Warning: Skill source not found at $SKILL_SRC" >&2
fi

# ═══════════════════════════════════════════════════════════
# Bundle workspace packages (self-contained install)
# ═══════════════════════════════════════════════════════════

CLI_DIST="$REPO_ROOT/packages/cli/dist/cli"
TUI_DIST="$REPO_ROOT/packages/tui/dist"
MCP_DIST="$REPO_ROOT/packages/mcp/dist"

# ── CLI (packages/cli/dist/cli → dist/cli/) ────────────
# Copies: cli/ (commands, formatters, completion, util, index.js),
#          client/ (daemonClient), core/ (shared modules), web/ (web UI)
echo "  Copying CLI..."
mkdir -p "$DIST_DIR/cli"
cp -r "$CLI_DIST/cli" "$DIST_DIR/cli/"
cp -r "$CLI_DIST/client" "$DIST_DIR/cli/"
if [ -d "$CLI_DIST/core" ]; then
  cp -r "$CLI_DIST/core" "$DIST_DIR/cli/"
fi
if [ -d "$CLI_DIST/web" ]; then
  cp -r "$CLI_DIST/web" "$DIST_DIR/cli/"
fi

# ── TUI (packages/tui/dist → dist/tui/) ────────────────
echo "  Copying TUI..."
mkdir -p "$DIST_DIR/tui"
cp -r "$TUI_DIST/tui" "$DIST_DIR/tui/"
cp -r "$TUI_DIST/client" "$DIST_DIR/tui/"
if [ -d "$TUI_DIST/core" ]; then
  cp -r "$TUI_DIST/core" "$DIST_DIR/tui/"
fi

# TUI is ESM — needs a package.json with "type": "module"
cat > "$DIST_DIR/tui/package.json" << 'TUIPKG'
{"type":"module"}
TUIPKG

# ── MCP (packages/mcp/dist → dist/mcp/) ────────────────
echo "  Copying MCP..."
mkdir -p "$DIST_DIR/mcp"
cp -r "$MCP_DIST/"* "$DIST_DIR/mcp/"

# MCP is ESM — needs a package.json with "type": "module"
cat > "$DIST_DIR/mcp/package.json" << 'MCPPKG'
{"type":"module"}
MCPPKG

# ── TUI launcher (CJS wrapper for ESM TUI) ─────────────
echo "  Generating tui-launcher.cjs..."
cat > "$DIST_DIR/tui-launcher.cjs" << 'LAUNCHER'
#!/usr/bin/env node
/**
 * TUI Launcher - Launches the tmux-agents Terminal UI
 * Adapted for the unified install package (all code in dist/).
 */

const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let socketPath;
let httpUrl;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--socket' && i + 1 < args.length) {
    socketPath = args[i + 1];
    i++;
  } else if (args[i] === '--ip' && i + 1 < args.length) {
    // Parse --ip flag: supports formats like "host:port" or just "host"
    const ipArg = args[i + 1];
    httpUrl = ipArg.includes('://') ? ipArg : `http://${ipArg}`;
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
tmux-agents TUI

Usage:
  tmux-agents tui [options]

Options:
  --socket <path>      Path to daemon Unix socket
  --ip <host:port>     Daemon HTTP address (e.g. localhost:3456 or 192.168.1.10:3456)
  --help, -h           Show this help message

Keyboard Shortcuts:
  F1, F2, F3        Switch tabs (Agents, Tasks, Pipelines)
  j/k, ↓/↑          Navigate list
  Enter             Preview selected agent
  a                 Attach to agent (interactive)
  s                 Send prompt to agent
  n                 Spawn new agent
  t                 Create new task
  x                 Kill selected agent
  r                 Force refresh
  q                 Quit
  Ctrl+A            Agent picker (fzf)
  Ctrl+T            Task picker (fzf)
    `);
    process.exit(0);
  }
}

// Point to the bundled TUI index inside dist/tui/tui/
const tuiScript = path.join(__dirname, 'tui', 'tui', 'index.js');

const tuiArgs = [];
if (socketPath) {
  tuiArgs.push('--socket', socketPath);
}
if (httpUrl) {
  tuiArgs.push('--http-url', httpUrl);
}

// Launch the TUI
const child = spawn('node', [tuiScript, ...tuiArgs], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error(`Failed to launch TUI: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
LAUNCHER

# ── Version package.json (for CLI --version resolution) ─
cat > "$DIST_DIR/package.json" << VERPKG
{"name":"tmux-agents","version":"$VERSION"}
VERPKG

# ═══════════════════════════════════════════════════════════
# Verify critical files exist
# ═══════════════════════════════════════════════════════════
ERRORS=0
for f in \
  "$DIST_DIR/daemon/supervisor.js" \
  "$DIST_DIR/core/database.js" \
  "$DIST_DIR/cli/cli/index.js" \
  "$DIST_DIR/skill/SKILL.md" \
  "$DIST_DIR/skill/references/commands.md" \
  "$DIST_DIR/skill/references/workflows.md" \
  "$DIST_DIR/skill/.version" \
  "$DIST_DIR/tui/tui/index.js" \
  "$DIST_DIR/mcp/server.js" \
  "$DIST_DIR/package.json" \
  "$DIST_DIR/tui-launcher.cjs"; do
  if [ ! -f "$f" ]; then
    echo "MISSING: ${f#$DIST_DIR/}" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo "Build verification FAILED: $ERRORS missing files" >&2
  exit 1
fi

FILE_COUNT=$(find "$DIST_DIR" -type f | wc -l | tr -d ' ')
echo ""
echo "Build complete (v$VERSION): $FILE_COUNT files"
echo ""
echo "Key components:"
echo "  daemon/    $(find "$DIST_DIR/daemon" -type f | wc -l | tr -d ' ') files"
echo "  core/      $(find "$DIST_DIR/core" -type f | wc -l | tr -d ' ') files"
echo "  cli/       $(find "$DIST_DIR/cli" -type f | wc -l | tr -d ' ') files"
echo "  tui/       $(find "$DIST_DIR/tui" -type f | wc -l | tr -d ' ') files"
echo "  mcp/       $(find "$DIST_DIR/mcp" -type f | wc -l | tr -d ' ') files"
echo "  skill/     $(find "$DIST_DIR/skill" -type f | wc -l | tr -d ' ') files"
