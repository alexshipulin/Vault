# VaultScope Mobile

Expo Router mobile client for VaultScope. This app lives under `mobile/` so it can coexist with the existing native Swift app in the repo.

## Requirements

- Node.js 20+
- Expo SDK 55 compatible tooling
- Node.js 20.19+
- A Firebase project with Firestore, Storage, and Anonymous Auth enabled
- A Gemini API key

## Setup

1. Copy `.env.local.example` to `.env.local`.
2. Fill in your Firebase and Gemini environment variables.
3. Install dependencies:

```bash
npm install
```

4. Start the Expo dev server:

```bash
npm run start
```

5. Open on iOS with:

```bash
npm run ios
```

## Notes

- Runtime config is read from `Constants.expoConfig.extra`, which is populated via `app.config.ts`.
- Firebase initialization is centralized in `lib/firebase/config.ts`.
- Anonymous auth is bootstrapped in `app/_layout.tsx`.
- Gemini integration, caching, and rate limiting live in `lib/gemini/`.
- Expo SDK 55 uses React 19.2 and React Native 0.83, so dependencies are pinned to that stack.
- Reanimated 4 on Expo 55 is paired with `react-native-worklets`.
