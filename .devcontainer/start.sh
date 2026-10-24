#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

port="${PORT:-3000}"

# Lifecycle commands run again when a stopped Codespace resumes.
if curl --fail --silent --max-time 2 "http://127.0.0.1:${port}/" | grep -q 'Research Matching Tool'; then
  exit 0
fi

if [ ! -f dist/index.html ]; then
  npm run build
fi

nohup npm start > /tmp/research-matching-tool.log 2>&1 < /dev/null &
for attempt in {1..30}; do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:${port}/" | grep -q 'Research Matching Tool'; then
    echo "Research Matching Tool is ready on forwarded port ${port}."
    exit 0
  fi
  sleep 1
done
cat /tmp/research-matching-tool.log
exit 1
