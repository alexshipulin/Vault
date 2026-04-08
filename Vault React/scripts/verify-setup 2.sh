#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ROOT="$(cd "${APP_ROOT}/../VaultScope" && pwd)"
ENV_FILE="${APP_ROOT}/.env.local"
FIREBASERC_FILE="${BACKEND_ROOT}/.firebaserc"

echo "🔍 Verifying VaultScope Setup..."
echo ""

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ .env.local missing"
  exit 1
fi

if ! grep -q "EXPO_PUBLIC_FIREBASE_API_KEY=AIza" "${ENV_FILE}"; then
  echo "❌ Firebase API key not set"
  exit 1
fi

if ! grep -q "EXPO_PUBLIC_GEMINI_API_KEY=AIza" "${ENV_FILE}"; then
  echo "❌ Gemini API key not set"
  exit 1
fi

if grep -Eq "your-firebase-project-id|your-actual-firebase-project-id" "${FIREBASERC_FILE}"; then
  echo "❌ Firebase project not configured"
  exit 1
fi

echo "✅ All checks passed"
echo "Run: ./scripts/enable-remote-backend.sh"
