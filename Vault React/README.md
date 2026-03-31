# Vault React

React Native + Expo migration target for VaultScope.

This project lives in `Vault React/` so it can coexist with:
- the SwiftUI iOS app in `VaultScope/`
- the legacy Expo client in `VaultScope/mobile/`
- backend functions in `VaultScope/functions/`
- auction scrapers in `VaultScope/scrapers/`

## What is implemented

- Full monochrome app shell matching `untitled.pen`
- Root tabs: `Home`, `Scan`, `Vault`, `Profile`
- Scan flow: `Camera -> Processing -> Result`
- Saved item flow: `Vault -> Item Details -> Ask AI`
- Local persistence for:
  - saved items
  - temporary scan session
  - scan mode
  - user preferences
  - item chat history
- Deterministic fake processing and mock result generation
- Local mocked AI chat tied to the current item

## What is still mocked

- Real image analysis
- OCR / recognition
- Real valuation
- External search/network calls in the default local flow
- Real LLM chat

Remote integrations from the legacy Expo app are bridged behind adapters, but they are only considered ready when Firebase and Gemini env/config are present.

## Requirements

- Node.js 20+
- npm 10+
- Xcode for iOS device/simulator work

## Setup

1. Copy `.env.local.example` to `.env.local`
2. For local-only development, the default mock values are enough
3. Install dependencies:

```bash
npm install --legacy-peer-deps
```

## Run with Expo

```bash
npm run start
```

For iOS native run:

```bash
npm run ios
```

## Recommended local dev flags

`.env.local` supports:

```bash
EXPO_PUBLIC_VAULT_ENVIRONMENT=mock
EXPO_PUBLIC_VAULT_SEED_DATA=true
EXPO_PUBLIC_VAULT_FAST_PROCESSING=true
EXPO_PUBLIC_VAULT_CLEAR_DATA=false
EXPO_PUBLIC_VAULT_SKIP_ONBOARDING=true
EXPO_PUBLIC_VAULT_REMOTE_BACKEND=false
EXPO_PUBLIC_VAULT_FORCE_MOCK_CAMERA=false
```

## Scripts

```bash
npm run typecheck
npm run lint
npm test
npm run check:design
npm run check:readiness
```

## Readiness checks

`npm run check:readiness` verifies:
- local analysis flow scaffolding
- remote search adapter presence
- Firebase env/config readiness
- functions/scrapers presence
- Gemini key readiness

Important: this script is intentionally strict. It fails when remote Firebase / Gemini configuration is incomplete.

## Design audit

`npm run check:design` compares the RN screen structure against:
- `untitled.pen`
- required screen file presence
- required test IDs / action markers
- monochrome token expectations

This is a structural parity check, not a pixel-perfect screenshot diff.

## Tests

Current automated coverage includes:
- collection persistence
- scan mode persistence
- preferences persistence
- temporary scan session persistence
- per-item chat persistence
- collection totals and scan counts
- fake processing pipeline order and cancellation
- mock result generation
- local AI chat response generation

## Remote backend note

The new RN app is ready for local mocked development now.

For real Firebase / Gemini integration, you still need:
- real Expo Firebase env values in `.env.local`
- a non-placeholder Firebase project id in `VaultScope/.firebaserc`
- working backend configuration for the legacy functions/search pipeline
