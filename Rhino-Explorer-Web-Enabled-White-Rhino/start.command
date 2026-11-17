#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install Node.js, then run this file again."
  read -r -p "Press Enter to close..."
  exit 1
fi
if [ ! -f .env ]; then cp .env.example .env; fi
echo "Starting Rhino Explorer. Open http://localhost:3000 in your browser."
npm start
