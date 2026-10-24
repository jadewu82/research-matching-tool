#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export PORT="${PORT:-3000}"
runtime_dir="${CANDLELIT_RUNTIME_DIR:-/tmp/candlelit-${UID}}"
mkdir -p "$runtime_dir"
log_file="$runtime_dir/server.log"
pid_file="$runtime_dir/server.pid"
health_file="$runtime_dir/health.json"

ready() {
  curl --noproxy '*' --fail --silent --max-time 2 "http://127.0.0.1:${PORT}/api/health" -o "$health_file" || return 1
  node -e 'try {const h=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(h.status==="ok" && h.app==="CandleLit" ? 0 : 1);}catch {process.exit(1);}' "$health_file" || return 1
  curl --noproxy '*' --fail --silent --max-time 2 "http://127.0.0.1:${PORT}/" -o "$runtime_dir/index.html" || return 1
  grep -q '<title>CandleLit</title>' "$runtime_dir/index.html"
}

if ! command -v node >/dev/null; then
  echo 'CandleLit needs Node.js 24+. Rebuild the Codespace container, or install Node.js 24 before starting it.' >&2
  exit 1
fi
if ! node --use-env-proxy -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' >/dev/null 2>&1; then
  echo "CandleLit cannot start with $(node --version). It needs Node.js 24+ with proxy support." >&2
  echo 'In this terminal, run: nvm install 24 && nvm use 24' >&2
  exit 1
fi
if ready; then
  echo "CandleLit is already responding on port ${PORT}. Open that port in the Ports panel with protocol HTTP."
  exit 0
fi

: > "$log_file"
echo "Starting CandleLit with $(node --version) on port ${PORT}..."
if [ ! -d node_modules ]; then
  echo 'Installing dependencies...'
  if ! npm ci >> "$log_file" 2>&1; then cat "$log_file"; exit 1; fi
fi
echo 'Building the website...'
if ! npm run build >> "$log_file" 2>&1; then
  cat "$log_file"
  echo 'Build failed. Run npm ci in this terminal, then rerun this startup command.' >&2
  exit 1
fi

# A separate session keeps the server alive when the lifecycle terminal closes.
if command -v setsid >/dev/null; then
  nohup setsid node --use-env-proxy "$PWD/server.js" >> "$log_file" 2>&1 < /dev/null &
else
  nohup node --use-env-proxy "$PWD/server.js" >> "$log_file" 2>&1 < /dev/null &
fi
server_pid=$!
printf '%s\n' "$server_pid" > "$pid_file"
for attempt in {1..30}; do
  if ready; then
    echo "CandleLit is ready on port ${PORT}. Open Ports → ${PORT} → Open in Browser (protocol HTTP)."
    echo "Server log: ${log_file}"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep 1
done
cat "$log_file"
echo "CandleLit did not become ready. Paste this terminal output so the startup failure can be diagnosed. Log: ${log_file}" >&2
exit 1
