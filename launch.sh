#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

HOST="${1:-${HOST:-127.0.0.1}}"
PORT="${2:-${PORT:-8000}}"
PYTHON="${PYTHON:-}"

if [ -z "$PYTHON" ]; then
  if command -v python >/dev/null 2>&1 && python -c "import http.server" >/dev/null 2>&1; then
    PYTHON=python
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import http.server" >/dev/null 2>&1; then
    PYTHON=python3
  else
    echo "Python was not found. Install Python 3 or set PYTHON=/path/to/python." >&2
    exit 1
  fi
elif ! "$PYTHON" -c "import http.server" >/dev/null 2>&1; then
  echo "$PYTHON cannot run Python's http.server module." >&2
  exit 1
fi

while ! "$PYTHON" -c "import socket,sys; s=socket.socket(); s.bind((sys.argv[1], int(sys.argv[2])))" "$HOST" "$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "Serving Z-Babel on http://$HOST:$PORT/"
echo "Bind address: $HOST"
echo "Port: $PORT"
echo
echo "Use './launch.sh 0.0.0.0' to bind on all interfaces."
exec "$PYTHON" -m http.server "$PORT" --bind "$HOST"
