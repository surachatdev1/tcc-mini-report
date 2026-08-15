#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ ! -f .env.local ]]; then
  cp .env.firebase.example .env.local
  echo "Created .env.local. Fill in Firebase Web App values, then run this script again."
  exit 2
fi

[[ -d node_modules ]] || npm ci
firebase use tcc-safe-travel
npm run firebase:release

echo "Release and post-deploy smoke test completed."
echo "Site: https://tcc-safe-travel.web.app"
echo "Dashboard: https://tcc-safe-travel.web.app/dashboard"
