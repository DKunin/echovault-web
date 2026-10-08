#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"

cd "$project_dir"

if [[ ! -d .git ]]; then
  echo "Not a Git checkout: $project_dir" >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Production checkout must be on the main branch." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Production checkout has tracked changes; refusing to overwrite them." >&2
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm use --silent
fi

for command_name in git npm pm2 curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done

git fetch --prune origin main
git merge --ff-only origin/main
npm ci
npm run validate
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

curl --fail --silent --show-error \
  --header "X-Auth-User: deploy-check" \
  --header "X-Auth-User-Id: deploy-check" \
  http://127.0.0.1:3338/api/session >/dev/null

echo "EchoVault Web updated to $(git rev-parse --short HEAD) and verified."
