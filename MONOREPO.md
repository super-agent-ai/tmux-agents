# Tmux Agents Monorepo Guide

**Last Updated:** 2026-02-13

---

## Overview

Tmux Agents is now a **true monorepo** - all code lives in the `main` branch, but each package can be built and released independently.

### Structure

```
tmux-agents/                    # Root (VS Code extension + daemon)
├── src/                        # Main daemon + extension code
├── packages/                   # Independent publishable packages
│   ├── cli/                    # @tmux-agents/cli
│   ├── tui/                    # @tmux-agents/tui
│   ├── mcp/                    # @tmux-agents/mcp
│   └── k8s-runtime/            # @tmux-agents/k8s-runtime
├── package.json                # Root workspace config
└── README.md
```

---

## Published Packages

| Package | Name | Description | Version |
|---------|------|-------------|---------|
| **CLI** | `@tmux-agents/cli` | Command-line interface | 0.1.19 |
| **TUI** | `@tmux-agents/tui` | Terminal UI (React + Ink) | 0.1.19 |
| **MCP** | `@tmux-agents/mcp` | MCP server for Claude Desktop | 0.1.19 |
| **K8s** | `@tmux-agents/k8s-runtime` | Kubernetes runtime support | 0.1.19 |
| **Root** | `tmux-agents` | VS Code extension + daemon | 0.1.19 |

---

## Building

### Build All Packages

```bash
npm run build:all
```

This compiles:
- Root (daemon + VS Code extension)
- All packages in `packages/*`

### Build Individual Packages

```bash
# CLI
npm run build:cli

# TUI
npm run build:tui

# MCP
npm run build:mcp

# K8s Runtime
npm run build:k8s

# Main (daemon + extension)
npm run compile
```

### Build with Workspace Commands

```bash
# Build specific package
npm run build -w packages/cli

# Run tests in specific package
npm run test -w packages/tui

# Install dependencies for all workspaces
npm install
```

---

## Testing

### Test All

```bash
# Test root + all packages
npm run test:all
```

### Test Individual Packages

```bash
# Main repo tests (653/661)
npm test

# CLI tests (544/544)
npm test -w packages/cli

# TUI tests (560/560)
npm test -w packages/tui

# MCP tests (55/55)
npm test -w packages/mcp
```

**Current Coverage: 1,812/1,820 tests (99.6%)**

---

## Publishing

### Publish Individual Packages

Each package can be published independently to npm:

```bash
# Publish CLI
npm publish -w packages/cli

# Publish TUI
npm publish -w packages/tui

# Publish MCP
npm publish -w packages/mcp

# Publish K8s Runtime
npm publish -w packages/k8s-runtime
```

### Publish Root Package

The root package (VS Code extension) is published to the VS Code Marketplace:

```bash
# Build VSIX
vsce package

# Publish to marketplace
vsce publish
```

---

## Development Workflow

### 1. Make Changes

Work in any package directory:

```bash
cd packages/cli
# Edit files
npm run build
npm test
```

### 2. Test Locally

```bash
# Test individual package
npm test -w packages/cli

# Test everything
npm run test:all
```

### 3. Commit to Main

All changes go to the `main` branch:

```bash
git add .
git commit -m "feat: add new CLI command"
git push origin main
```

### 4. Release

Release packages independently based on what changed:

```bash
# If CLI changed
cd packages/cli
npm version patch
npm publish

# If TUI changed
cd packages/tui
npm version minor
npm publish
```

---

## Package Dependencies

### Internal Dependencies

Packages can depend on each other:

```json
{
  "dependencies": {
    "@tmux-agents/cli": "workspace:*"
  }
}
```

### Shared Code

Common code lives in the root `src/core/` directory. Packages reference it:

```typescript
import { Database } from '../../src/core/database';
```

---

## Migration from Worktrees

**Before:** Git worktrees (separate directories)
```
/Users/chelsea/dev/tmux-agents      (main)
/Users/chelsea/dev/tmux-agents-cli  (refactor/cli)
/Users/chelsea/dev/tmux-agents-tui  (refactor/tui)
/Users/chelsea/dev/tmux-agents-k8s  (refactor/k8s-runtime)
```

**After:** Monorepo (all in main)
```
/Users/chelsea/dev/tmux-agents/
├── src/              (main code)
└── packages/
    ├── cli/
    ├── tui/
    └── k8s-runtime/
```

**Worktrees Status:**
- ✅ Code copied to `packages/`
- ✅ All committed to `main`
- ⚠️ Worktree directories can be deleted (no longer needed)

---

## CI/CD Pipeline

### Recommended GitHub Actions

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run test:all

  publish-cli:
    if: startsWith(github.ref, 'refs/tags/cli-v')
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm publish -w packages/cli

  # Similar jobs for tui, mcp, k8s-runtime...
```

---

## Versioning Strategy

### Independent Versioning

Each package has its own version:

```json
// packages/cli/package.json
{ "version": "0.2.0" }

// packages/tui/package.json
{ "version": "0.1.5" }
```

### Semantic Versioning

Follow semver for each package:

- **Patch (0.1.1)**: Bug fixes
- **Minor (0.2.0)**: New features (backward compatible)
- **Major (1.0.0)**: Breaking changes

### Release Example

```bash
# CLI got new feature
cd packages/cli
npm version minor  # 0.1.19 → 0.2.0
npm publish

# TUI got bug fix
cd packages/tui
npm version patch  # 0.1.19 → 0.1.20
npm publish

# Root version stays same
```

---

## Benefits of This Monorepo

✅ **Single Source of Truth** - All code in `main` branch
✅ **Independent Releases** - Publish packages separately
✅ **Shared Dependencies** - No duplication
✅ **Atomic Changes** - Cross-package refactors in one commit
✅ **Easier Testing** - Test everything together
✅ **Better Discoverability** - All code in one repo
✅ **Simplified CI/CD** - One pipeline for all packages

---

## FAQs

### Can I still use worktrees?

Yes, but it's no longer necessary. All code is in `main` now.

### How do I work on multiple packages at once?

Just edit files directly in `packages/` and commit to `main`.

### Do packages share node_modules?

Yes! npm workspaces hoists shared dependencies to the root.

### Can packages have different versions?

Yes! Each package in `packages/` has its own `package.json` with independent versioning.

### How do I add a new package?

```bash
mkdir packages/my-new-package
cd packages/my-new-package
npm init
# Edit package.json name to "@tmux-agents/my-new-package"
```

Then add build script to root `package.json`:

```json
{
  "scripts": {
    "build:my-new-package": "npm run build -w packages/my-new-package"
  }
}
```

---

## Commands Cheat Sheet

```bash
# Install dependencies
npm install

# Build everything
npm run build:all

# Build specific package
npm run build:cli
npm run build:tui
npm run build:mcp
npm run build:k8s

# Test everything
npm run test:all

# Test specific package
npm test -w packages/cli

# Publish specific package
npm publish -w packages/cli

# Run command in specific workspace
npm run <script> -w packages/<name>
```

---

## Next Steps

1. ✅ Monorepo structure created
2. ✅ All code merged to `main`
3. ✅ Build scripts configured
4. ⏭️ Set up CI/CD for independent releases
5. ⏭️ Configure changesets for automatic versioning
6. ⏭️ Delete old worktree directories (optional)

---

**Maintained by:** super-agent.ai
**Questions?** Open an issue on GitHub
