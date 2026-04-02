# Vault React

VaultScope React Native + Expo migration target.

Detailed architecture notes live in:

- `docs/scan-ai-db-architecture.md`
- `docs/scrapers-and-antique-database-integration.md`

This project lives in `Vault React/` so it can coexist with:
- the SwiftUI iOS app in `VaultScope/`
- the legacy Expo client in `VaultScope/mobile/`
- backend functions in `VaultScope/functions/`
- auction scrapers in `VaultScope/scrapers/`

## VaultScope Setup Guide

### Environment Setup

1. Copy `.env.local.example` to `.env.local`
2. Fill in your Firebase project credentials
3. Add your Gemini API key
4. Set `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true` to enable real analysis

Install dependencies:

```bash
npm install --legacy-peer-deps
```

## Development Modes

### Local Mock Mode

- Fast development iteration
- No API costs
- Deterministic results
- Set:
  - `EXPO_PUBLIC_VAULT_ENVIRONMENT=mock`
  - `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=false`
  - `EXPO_PUBLIC_VAULT_FAST_PROCESSING=true`
  - `EXPO_PUBLIC_VAULT_SEED_DATA=true`

### Remote Live Mode

- Real AI analysis
- Actual database search
- Live pricing data
- Requires: Firebase + Gemini config
- Set:
  - `EXPO_PUBLIC_VAULT_ENVIRONMENT=production`
  - `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true`
  - `EXPO_PUBLIC_VAULT_FAST_PROCESSING=false`
  - `EXPO_PUBLIC_VAULT_SEED_DATA=false`

If remote mode is requested without complete config, the app logs a warning and falls back to local mock mode.
If remote mode is enabled and the live analysis fails, the app now keeps the scan session and shows a real error instead of substituting a mock result.

## Run with Expo Go

```bash
npx expo start
```

This is the recommended daily workflow.

## Testing Remote Connection

Run:

```bash
npm run check-readiness
```

This validates all required environment variables and the remote readiness bridge.

## Remote Backend Setup

### Quick Start

1. Verify prerequisites:

```bash
npm run setup:verify
```

2. Enable remote backend:

```bash
npm run setup:remote
```

3. Restart app:

```bash
npm start
```

### Manual Setup

See `MANUAL_SETUP.md` for step-by-step instructions.

## Device Runtime Errors In Terminal

To receive device/runtime errors in your terminal without screenshots:

```bash
npm run start:debug
```

This starts a local debug sink on port `8797` and then runs Expo with a cleared cache.

If Expo is already running in another terminal, run only the sink:

```bash
npm run logs:device-errors
```

The phone and Mac should be on the same Wi-Fi network. In development, captured runtime errors will be forwarded from the app to this terminal sink automatically.

## Available Scripts

```bash
npm run typecheck
npm run lint
npm test
npm run check:design
npm run check:readiness
npm run check-readiness
npm run logs:device-errors
npm run start:debug
```

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
- Unified scan orchestrator with local mock and remote-ready implementations

## What is still mocked

- Real image analysis in the default mode
- OCR / recognition in the default mode
- Real valuation in the default mode
- External search/network calls in the default local flow
- Real LLM chat in the default local flow

Remote integrations from the legacy Expo app are bridged behind adapters, but they are only considered ready when Firebase and Gemini env/config are present.

## Native folders

This project is intentionally kept in an Expo CNG-first shape.

- `app.config.ts` and `app.json` are the source of truth
- `ios/` is not committed as an active source of truth
- if you ever need a native folder temporarily, regenerate it with Expo prebuild instead of editing stale generated files

## Design audit

`npm run check:design` compares the RN screen structure against:
- `untitled.pen`
- required screen file presence
- required test IDs / action markers
- monochrome token expectations

This is a structural parity check, not a pixel-perfect screenshot diff.

## Remote backend note

The new RN app is ready for local mocked development now.

For real Firebase / Gemini integration, you still need:
- real Expo Firebase env values in `.env.local`
- a non-placeholder Firebase project id in `VaultScope/.firebaserc`
- working backend configuration for the legacy functions/search pipeline
