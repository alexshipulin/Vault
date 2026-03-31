# Firestore ETL Loader

This script loads raw auction JSON files from `data/raw/` into the `antique_auctions` collection in Firestore.

## Files

- `load_to_firebase.py` reads every JSON file in `data/raw/`
- `requirements.txt` contains the Python dependency for the loader

## Prerequisites

1. Place your Firebase Admin service account at the project root:

   ```text
   serviceAccountKey.json
   ```

2. Set your Firebase project ID in the environment:

   ```bash
   export FIREBASE_PROJECT_ID=your-firebase-project-id
   ```

   You can also create a local `.env` file from `.env.example`.

3. Install dependencies:

   ```bash
   pip install -r scripts/requirements.txt
   ```

## Run

From the `VaultScope` root:

```bash
python3 scripts/load_to_firebase.py
```

## What It Does

- Initializes Firebase Admin SDK with `serviceAccountKey.json`
- Reads all raw JSON files from `data/raw/`
- Normalizes auction items into the Firestore schema
- Generates deterministic document IDs using a hash of `source + title`
- Upserts documents into `antique_auctions` with `merge=True`
- Commits writes in batches of 100
- Logs progress, invalid items, and a final summary
