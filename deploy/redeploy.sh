#!/usr/bin/env bash
# For this server's existing standalone Node setup: API 5000, web 3001.
set -euo pipefail
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_ROOT"
command -v node >/dev/null
command -v npm >/dev/null
command -v ss >/dev/null
command -v curl >/dev/null
command -v flock >/dev/null
mkdir -p .runtime
exec 9>.runtime/deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }

listeners() {
  ss -H -ltnp "sport = :$1" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
}
check_port() {
  local port="$1" pid cwd
  local -a pids=()
  mapfile -t pids < <(listeners "$port")
  if ss -H -ltn "sport = :$port" | grep -q . && ((${#pids[@]} == 0)); then
    echo "Cannot identify the owner of port $port. Run this script as the app owner or root."
    exit 1
  fi
  for pid in "${pids[@]}"; do
    cwd="$(readlink -f "/proc/$pid/cwd" || true)"
    case "$cwd" in
      "$PROJECT_ROOT"|"$PROJECT_ROOT/apps/api"|"$PROJECT_ROOT/apps/web") ;;
      *) echo "Port $port belongs to a different project ($cwd). Nothing was stopped."; exit 1 ;;
    esac
  done
}
stop_port() {
  local port="$1" pid
  check_port "$port"
  while read -r pid; do
    [[ -n "$pid" ]] && kill -TERM "$pid"
  done < <(listeners "$port")
  for ((waited=0; waited<20; waited++)); do
    if ! ss -H -ltn "sport = :$port" | grep -q .; then return; fi
    sleep 1
  done
  echo "Port $port did not stop. Check its process manager; no forced termination was attempted."
  exit 1
}
wait_ready() {
  local url="$1" log="$2"
  for ((waited=0; waited<30; waited++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return; fi
    sleep 1
  done
  echo "Service did not become ready. See $PROJECT_ROOT/$log"
  exit 1
}

check_port 5000
check_port 3001
echo 'Installing dependencies and building the new version…'
npm ci --include=dev
npm run build:server

# Recheck ownership immediately before stopping either listener.
check_port 5000
check_port 3001
stop_port 5000
nohup npm --workspace apps/api run start >.runtime/api.log 2>&1 < /dev/null 9>&- &
wait_ready 'http://127.0.0.1:5000/api/health' '.runtime/api.log'
stop_port 3001
nohup npm --workspace apps/web run start -- -H 127.0.0.1 -p 3001 >.runtime/web.log 2>&1 < /dev/null 9>&- &
wait_ready 'http://127.0.0.1:3001/chat' '.runtime/web.log'
echo 'Deployment complete: API and chat frontend are running with the new build.'
