#!/usr/bin/env bash
set -euo pipefail
GORDON_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GORDON_APP="${1:?Expected web or agent}"
shift
case "$GORDON_APP" in web|agent) ;; *) exit 2 ;; esac
GORDON_NODE_BIN="$HOME/.cache/gordon-on-call/node-v24.22.0-darwin-arm64/bin"
if [ "$(node -p 'process.versions.node.split(".")[0]')" = "24" ]; then
  exec pnpm --dir "$GORDON_ROOT/apps/$GORDON_APP" "$@"
elif [ -x "$GORDON_NODE_BIN/node" ]; then
  exec env PATH="$GORDON_NODE_BIN:$PATH" pnpm --dir "$GORDON_ROOT/apps/$GORDON_APP" "$@"
else
  echo "Node 24 is required. Install the version in .node-version and retry." >&2
  exit 1
fi
