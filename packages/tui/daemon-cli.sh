#!/bin/bash
# Wrapper script to run daemon CLI with proper Node.js settings

# Get the directory where this script is located
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the daemon supervisor with NODE_OPTIONS to disable ESM
NODE_NO_WARNINGS=1 node --input-type=commonjs "$DIR/dist/daemon/daemon/supervisor.js" "$@"
