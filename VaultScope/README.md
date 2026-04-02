# VaultScope Firebase Setup

This directory contains the Firebase backend, Firestore schema, Cloud Functions, and scraper ingestion tooling for VaultScope.

## Backend Components

- `firebase.json` wires Firestore, Storage, and Cloud Functions together.
- `firestore.rules` protects user-owned data while keeping auction reference data public.
- `storage.rules` limits scan uploads to each user's folder and enforces image-only uploads up to 10 MB.
- `firestore.indexes.json` contains the composite indexes needed for auction search and filtering.
- `functions/` contains the TypeScript Cloud Functions code for ingestion and maintenance.
- `scrapers/` contains Python scrapers for:
  - eBay
  - Heritage Auctions
  - LiveAuctioneers
- `scripts/load_to_firebase.py` loads normalized raw scraper output into Firestore.
- `scripts/seed-initial-data.sh` runs the end-to-end initial ingestion flow.
- `scripts/verify-database.ts` validates that Firestore data and key query paths work.
- `scripts/monitor-database.ts` prints collection size, freshness, category distribution, and price-band distribution.

## Expected Firestore Collections

- `scan_results/{scanId}` for AI analysis output tied to a user.
- `antique_auctions/{auctionId}` for public reference data gathered from auction sources.
- `users/{userId}` for profile-level metadata.
- `user_collections/{userId}/items/{itemId}` for saved items in a user's collection.
- `stats/daily/snapshots/{date}` for daily summary documents produced by maintenance jobs.

Documents in `scan_results` should include a `userId` field. Documents in `user_collections/{userId}/items` should include an `addedAt` timestamp and a denormalized price snapshot.

## Firebase Services to Enable

1. Create a Firebase project in the Firebase console.
2. Enable Firestore Database in Native mode.
3. Enable Firebase Storage and create the default bucket.
4. Enable Firebase Authentication and enable the providers you plan to support.
5. Set the real Firebase project ID in `.firebaserc`.
6. Configure required Functions params and secrets:
   - `SCRAPER_RUNNER_URL`
   - `NOTIFICATION_WEBHOOK_URL`
   - `PROCESS_SCRAPED_DATA_API_KEY`
   - `SCRAPER_RUNNER_API_KEY`
   - `NOTIFICATION_WEBHOOK_API_KEY`

## Local Setup

1. Install the Firebase CLI:

   ```bash
   npm install -g firebase-tools
   ```

2. Log in:

   ```bash
   firebase login
   ```

3. Update `.firebaserc` with the real project ID.

4. Install Cloud Functions dependencies:

   ```bash
   cd functions
   npm install
   cd ..
   ```

5. Place your Firebase Admin service account at:

   ```text
   VaultScope/serviceAccountKey.json
   ```

## Deploy Firestore Indexes

From `VaultScope/`:

```bash
firebase deploy --only firestore:indexes
```

This deploys the composite indexes needed for:
- keyword search
- category filtering
- price range sorting/filtering

## Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

This deploys:
- `processScrapedData` (HTTP endpoint)
- `weeklyScrapingJob` (scheduled)
- `cleanupOldData` (scheduled)
- `generateDailyStats` (scheduled)

## Initial Data Seeding

Run the end-to-end seed flow:

```bash
./scripts/seed-initial-data.sh
```

What it does:
- creates a Python virtual environment for the scrapers
- installs scraper and loader dependencies
- runs all scrapers
- loads the resulting raw JSON into Firestore

## Verify Firestore Data

Run:

```bash
npx tsx scripts/verify-database.ts
```

This checks:
- sample documents exist in `antique_auctions`
- category filtering works
- keyword search works
- price range filtering works
- collection size is non-trivial

## Monitor Database Health

Run:

```bash
npx tsx scripts/monitor-database.ts
```

This reports:
- total collection size
- latest update time
- category distribution
- price-band distribution

## Scheduled Scraping

`weeklyScrapingJob` is already defined in `functions/src/index.ts`.

- Schedule: every Sunday at 2 AM UTC
- Region: `us-central1`

To test the job manually after deployment:

```bash
curl -X POST https://us-central1-YOUR-PROJECT.cloudfunctions.net/weeklyScrapingJob
```

## Validation Checklist

- [ ] `.firebaserc` points to a real Firebase project
- [ ] Firestore indexes deployed
- [ ] Cloud Functions deployed
- [ ] `antique_auctions` contains production data
- [ ] Keyword search works
- [ ] Category filtering works
- [ ] Price range filtering works

## Important Note

This repository currently contains the ingestion tooling and deployment assets, but production deployment still depends on choosing and binding the correct Firebase project ID. Do not deploy to an unrelated Firebase project just to satisfy the tooling.
