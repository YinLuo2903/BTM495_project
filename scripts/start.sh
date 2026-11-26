#!/usr/bin/env bash
set -e
# Developer setup: build the frontend and run the site from source (the repository root).
cd "$(dirname "$0")/.."

if [ -x ".venv/bin/python" ]; then
    echo "Environment already exists, skipping setup."
else
    echo "Creating environment in .venv ..."
    python3 -m venv .venv || { echo "Could not create the environment. Install Python 3.10 or newer first."; exit 1; }
fi

command -v npm >/dev/null 2>&1 || { echo "npm was not found. Install Node.js 20 or newer first."; exit 1; }

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies ..."
    (cd frontend && npm ci)
fi

echo "Building the frontend ..."
(cd frontend && npm run build)

echo "Starting the local website (default http://localhost:8765/). Press Ctrl+C to stop."
exec .venv/bin/python run_local_website.py "$@"
