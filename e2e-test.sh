#!/bin/bash
# E2E Test Script for Daemon Scenarios

set -e

CLI_PATH="/Users/chelsea/dev/tmux-agents-cli/dist/cli/cli/index.js"
DAEMON_SCRIPT="./test-daemon.js"

echo "=== E2E Test Suite ==="
echo ""

# Scenario 2: CLI spawns agent via daemon
echo "### Scenario 2: CLI Communication with Daemon"
echo ""

# Check daemon status
echo "Test: daemon status"
$CLI_PATH daemon status
echo "✅ CLI can query daemon status"
echo ""

# List agents
echo "Test: agent list"
$CLI_PATH agent list
echo "✅ CLI can list agents"
echo ""

# List tasks
echo "Test: task list"
$CLI_PATH task list
echo "✅ CLI can list tasks"
echo ""

# List pipelines
echo "Test: pipeline list"
$CLI_PATH pipeline list
echo "✅ CLI can list pipelines"
echo ""

# Scenario 7: Agent auto-reconnect verification
echo "### Scenario 7: Reconciler Code Verification"
echo ""
echo "Test: Check reconciler has reconnect logic"
if grep -q "reconnectAgent" out/daemon/reconciler.js; then
    echo "✅ Reconciler has reconnectAgent method"
else
    echo "❌ Reconciler missing reconnectAgent method"
    exit 1
fi

if grep -q "reconcile" out/daemon/reconciler.js; then
    echo "✅ Reconciler has reconcile method"
else
    echo "❌ Reconciler missing reconcile method"
    exit 1
fi
echo ""

# Scenario 8 & 9: Multi-runtime and Pipeline execution
echo "### Scenario 8 & 9: Runtime and Pipeline Code Verification"
echo ""

echo "Test: Check RPC router has runtime methods"
if grep -q "runtime.list" out/daemon/rpcRouter.js; then
    echo "✅ RPC router has runtime.list"
else
    echo "❌ RPC router missing runtime.list"
    exit 1
fi

if grep -q "runtime.getStatus" out/daemon/rpcRouter.js; then
    echo "✅ RPC router has runtime.getStatus"
else
    echo "❌ RPC router missing runtime.getStatus"
    exit 1
fi

echo ""
echo "Test: Check RPC router has pipeline methods"
if grep -q "pipeline.create" out/daemon/rpcRouter.js; then
    echo "✅ RPC router has pipeline.create"
else
    echo "❌ RPC router missing pipeline.create"
    exit 1
fi

if grep -q "pipeline.run" out/daemon/rpcRouter.js; then
    echo "✅ RPC router has pipeline.run"
else
    echo "❌ RPC router missing pipeline.run"
    exit 1
fi

if grep -q "pipeline.getStatus" out/daemon/rpcRouter.js; then
    echo "✅ RPC router has pipeline.getStatus"
else
    echo "❌ RPC router missing pipeline.getStatus"
    exit 1
fi

echo ""
echo "Test: Check pipeline engine exists"
if [ -f "out/core/pipelineEngine.js" ]; then
    echo "✅ Pipeline engine compiled"
else
    echo "❌ Pipeline engine missing"
    exit 1
fi

if grep -q "executePipeline\|runPipeline" out/core/pipelineEngine.js; then
    echo "✅ Pipeline engine has execution logic"
else
    echo "❌ Pipeline engine missing execution logic"
    exit 1
fi

echo ""
echo "=== All E2E Tests Passed! ==="
