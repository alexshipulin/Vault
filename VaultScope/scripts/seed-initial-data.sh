#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCRAPERS_DIR="${PROJECT_ROOT}/scrapers"
VENV_DIR="${SCRAPERS_DIR}/venv"
FIREBASERC_PATH="${PROJECT_ROOT}/.firebaserc"

echo "🌱 Seeding initial antique data..."

if [[ ! -d "${SCRAPERS_DIR}" ]]; then
  echo "❌ Scrapers directory not found at ${SCRAPERS_DIR}"
  exit 1
fi

if [[ -z "${FIREBASE_PROJECT_ID:-}" && -f "${FIREBASERC_PATH}" ]]; then
  PROJECT_ID_FROM_RC="$(python3 -c 'import json, sys; data=json.load(open(sys.argv[1], encoding="utf-8")); print((data.get("projects") or {}).get("default", "").strip())' "${FIREBASERC_PATH}")"

  if [[ "${PROJECT_ID_FROM_RC}" != "" && "${PROJECT_ID_FROM_RC}" != "your-firebase-project-id" && "${PROJECT_ID_FROM_RC}" != "your-actual-firebase-project-id" ]]; then
    export FIREBASE_PROJECT_ID="${PROJECT_ID_FROM_RC}"
  fi
fi

if [[ -z "${FIREBASE_PROJECT_ID:-}" ]]; then
  echo "❌ FIREBASE_PROJECT_ID is not set."
  echo "   Set it in your shell or replace the placeholder in VaultScope/.firebaserc."
  exit 1
fi

if [[ ! -f "${PROJECT_ROOT}/serviceAccountKey.json" ]]; then
  echo "❌ serviceAccountKey.json is missing at ${PROJECT_ROOT}/serviceAccountKey.json"
  exit 1
fi

cd "${SCRAPERS_DIR}"
python3 -m venv "${VENV_DIR}"
source "${VENV_DIR}/bin/activate"
pip install -r requirements.txt
pip install -r "${PROJECT_ROOT}/scripts/requirements.txt"

python run_all.py

cd "${PROJECT_ROOT}"
python3 scripts/load_to_firebase.py

echo "✅ Initial data loaded"
echo "   Check Firestore console for antique_auctions collection"
