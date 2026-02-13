# Quick Fixes Required - 1 Hour Total

## Issue 1: SQL Wasm Files Location (2 minutes)

**File:** `/Users/chelsea/dev/tmux-agents/package.json`

**Current compile script:**
```json
"compile": "tsc -p ./ && cp node_modules/sql.js/dist/sql-wasm.wasm out/ && cp node_modules/sql.js/dist/sql-wasm.js out/ && mkdir -p out/prompts && cp src/prompts/defaults.json out/prompts/"
```

**Fixed compile script:**
```json
"compile": "tsc -p ./ && mkdir -p out/core && cp node_modules/sql.js/dist/sql-wasm.wasm out/ out/core/ && cp node_modules/sql.js/dist/sql-wasm.js out/ out/core/ && mkdir -p out/prompts && cp src/prompts/defaults.json out/prompts/"
```

**Verification:**
```bash
npm run compile
ls -la out/core/sql-wasm.*
# Should show both files in out/core/
```

---

## Issue 2: TUI Import Paths (30 minutes)

**Problem:** Imports expect `/dist/client/` but files are in `/dist/tui/client/`

**Files to fix:** All files in `/Users/chelsea/dev/tmux-agents-tui/src/tui/` that import from client

**Example fix in `/Users/chelsea/dev/tmux-agents-tui/src/tui/hooks/useDaemon.ts`:**

**Before:**
```typescript
import { DaemonClient } from '../../client/daemonClient.js';
```

**After:**
```typescript
import { DaemonClient } from '../client/daemonClient.js';
```

**Alternative Fix (tsconfig.tui.json):**
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/tui/**/*", "src/client/**/*"]
}
```

**Verification:**
```bash
cd /Users/chelsea/dev/tmux-agents-tui
npm run compile:tui
node dist/tui/index.js --help
# Should not error
```

---

## Issue 3: MCP Import Paths (20 minutes)

**Problem:** ES module imports missing `.js` extensions

**Files to fix:** All files in `/Users/chelsea/dev/tmux-agents/src/mcp/`

**Example fix in `/Users/chelsea/dev/tmux-agents/src/mcp/client/daemonClient.ts`:**

**Before:**
```typescript
import { WsClient } from './wsClient';
```

**After:**
```typescript
import { WsClient } from './wsClient.js';
```

**Pattern to find all imports:**
```bash
cd /Users/chelsea/dev/tmux-agents/src/mcp
grep -r "from '\./[^']*'" --include="*.ts" | grep -v "\.js'"
```

**Verification:**
```bash
cd /Users/chelsea/dev/tmux-agents
npm run compile
node out/mcp/mcp/server.js --help
# Should not error
```

---

## Issue 4: VS Code Test Mocks (10 minutes)

**File:** `/Users/chelsea/dev/tmux-agents/src/__tests__/__mocks__/vscode.ts`

**Current:**
```typescript
export const workspace = {
  getConfiguration: vi.fn(),
  // ... other mocks
};
```

**Fixed:**
```typescript
export const workspace = {
  getConfiguration: vi.fn(),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: () => {} })),
  // ... other mocks
};
```

**Verification:**
```bash
cd /Users/chelsea/dev/tmux-agents
npx vitest run --no-coverage
# Should show 631/631 tests passing
```

---

## Checklist

- [ ] Issue 1: SQL wasm files (2 min)
- [ ] Issue 2: TUI imports (30 min)
- [ ] Issue 3: MCP imports (20 min)
- [ ] Issue 4: VS Code mocks (10 min)

**Total Time:** ~1 hour
**Result:** 95% ready for merge

---

## Verification Commands

After all fixes:

```bash
# 1. Compile all projects
npm run compile
cd /Users/chelsea/dev/tmux-agents-cli && npm run build:cli
cd /Users/chelsea/dev/tmux-agents-tui && npm run compile:tui
cd /Users/chelsea/dev/tmux-agents-k8s && npm run compile

# 2. Test daemon
cd /Users/chelsea/dev/tmux-agents
DAEMON_WORKER=1 node out/daemon/worker.js &
sleep 3
kill %1

# 3. Test CLI
/Users/chelsea/dev/tmux-agents-cli/dist/cli/cli/index.js --help

# 4. Test TUI
node /Users/chelsea/dev/tmux-agents-tui/dist/tui/index.js --help

# 5. Test MCP
node /Users/chelsea/dev/tmux-agents/out/mcp/mcp/server.js --help

# 6. Run tests
cd /Users/chelsea/dev/tmux-agents
npx vitest run --no-coverage
```

**Expected Results:** All commands succeed, 631/631 tests pass

---

## Next Steps After Fixes

1. Merge branches: cli → tui → docker → k8s → main
2. Run E2E integration tests
3. Performance testing
4. Update README
5. Security audit
6. Tag release v0.2.0

