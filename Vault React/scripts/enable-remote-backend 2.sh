#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ROOT="$(cd "${APP_ROOT}/../VaultScope" && pwd)"
ENV_FILE="${APP_ROOT}/.env.local"
ENV_EXAMPLE="${APP_ROOT}/.env.local.example"
FIREBASERC_FILE="${BACKEND_ROOT}/.firebaserc"

echo "🔧 VaultScope Remote Backend Setup"
echo ""

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "❌ Created .env.local - fill in your API keys and run again"
  exit 1
fi

cd "${BACKEND_ROOT}"

if grep -Eq "your-firebase-project-id|your-actual-firebase-project-id" "${FIREBASERC_FILE}"; then
  echo "❌ Update VaultScope/.firebaserc with your Firebase project ID"
  exit 1
fi

echo "📤 Deploying Firebase indexes..."
firebase deploy --only firestore:indexes

echo "📤 Deploying Cloud Functions..."
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions

echo "🌱 Running scrapers and loading data..."
./scripts/seed-initial-data.sh

echo "✅ Verifying database..."
cd "${APP_ROOT}"
npx tsx ../VaultScope/scripts/verify-database.ts

python3 - <<'PY' "${ENV_FILE}"
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
lines = env_path.read_text(encoding="utf-8").splitlines()
updated = []
found = False

for line in lines:
    if line.startswith("EXPO_PUBLIC_VAULT_REMOTE_BACKEND="):
        updated.append("EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true")
        found = True
    else:
        updated.append(line)

if not found:
    updated.append("EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true")

env_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
PY

echo ""
echo "✅ Remote backend enabled!"
echo "Next: npm start"
