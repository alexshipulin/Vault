# VaultScope Remote Backend Manual Setup

## 1. Prepare environment variables

From `Vault React/`:

```bash
cp .env.local.example .env.local
```

Fill in:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GEMINI_API_KEY`

## 2. Bind Firebase project

Update:

```text
VaultScope/.firebaserc
```

Replace the placeholder with your real Firebase project id.

## 3. Deploy backend resources

From `VaultScope/`:

```bash
firebase deploy --only firestore:indexes
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

## 4. Seed antique auction data

From `VaultScope/`:

```bash
./scripts/seed-initial-data.sh
```

## 5. Verify database

From `Vault React/`:

```bash
npx tsx ../VaultScope/scripts/verify-database.ts
```

## 6. Enable remote mode

Set in `.env.local`:

```bash
EXPO_PUBLIC_VAULT_ENVIRONMENT=production
EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true
EXPO_PUBLIC_VAULT_FAST_PROCESSING=false
EXPO_PUBLIC_VAULT_SEED_DATA=false
```

For deterministic mock/demo mode instead:

```bash
EXPO_PUBLIC_VAULT_ENVIRONMENT=mock
EXPO_PUBLIC_VAULT_REMOTE_BACKEND=false
EXPO_PUBLIC_VAULT_FAST_PROCESSING=true
EXPO_PUBLIC_VAULT_SEED_DATA=true
```

## 7. Restart Expo

```bash
npm start
```
