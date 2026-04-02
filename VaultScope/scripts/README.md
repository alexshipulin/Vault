# Firestore Ingestion Scripts

This folder contains the data-loading and verification helpers for the `antique_auctions` Firestore collection.

## Files

- `load_to_firebase.py` reads raw auction JSON files from `data/raw/` and upserts them into Firestore.
- `seed-initial-data.sh` runs the scraper-to-Firestore ingestion flow.
- `verify-database.ts` checks sample data and key Firestore query paths.
- `monitor-database.ts` reports collection size, freshness, categories, and price-band distribution.
- `firebase-admin-runtime.ts` bootstraps Firebase Admin for the TypeScript verification scripts.
- `requirements.txt` contains the Python dependency for the Firestore loader.

## Prerequisites

1. Put your Firebase Admin service account at the project root:

   ```text
   serviceAccountKey.json
   ```

2. Set the Firebase project ID in one of these ways:

   - `export FIREBASE_PROJECT_ID=your-real-project-id`
   - or replace the placeholder in `VaultScope/.firebaserc`

3. Install Python loader dependencies:

   ```bash
   pip install -r scripts/requirements.txt
   ```

4. Install Cloud Functions dependencies so the TypeScript verification scripts can reuse `firebase-admin`:

   ```bash
   cd functions
   npm install
   cd ..
   ```

## Run the Loader

From the `VaultScope` root:

```bash
python3 scripts/load_to_firebase.py
```

## Run Initial Seeding

From the `VaultScope` root:

```bash
./scripts/seed-initial-data.sh
```

## Verify Firestore Data

```bash
npx tsx scripts/verify-database.ts
```

## Monitor Firestore Health

```bash
npx tsx scripts/monitor-database.ts
```
