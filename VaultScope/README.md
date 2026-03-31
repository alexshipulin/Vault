# VaultScope Firebase Setup

This directory now includes the Firebase backend scaffolding for VaultScope, an AI collectibles appraisal app.

## Included Files

- `firebase.json` to wire Firestore, Storage, and Cloud Functions together.
- `firestore.rules` to protect user-owned data while keeping auction reference data public.
- `storage.rules` to limit scan uploads to each user's folder and enforce image-only uploads up to 10 MB.
- `firestore.indexes.json` for the main auction-search and user-collection queries.
- `functions/` with a TypeScript Cloud Functions boilerplate pinned to the `us-central1` region.

## Expected Firestore Collections

These rules and indexes assume the following top-level collections:

- `scan_results/{scanId}` for AI analysis output tied to a user.
- `antique_auctions/{auctionId}` for public reference data gathered from auction sources.
- `users/{userId}` for profile-level metadata.
- `user_collections/{userId}/items/{itemId}` for saved items in a user's collection.

Documents in `scan_results` should include a `userId` field. Documents in `user_collections/{userId}/items` should include an `addedAt` timestamp for efficient pagination and should store a denormalized price snapshot.

## Firebase Services to Enable

1. Create a Firebase project in the Firebase console.
2. Enable Firestore Database in Native mode.
3. Enable Firebase Storage and create the default bucket.
4. Enable Firebase Authentication and turn on the providers you plan to support in VaultScope.

## Local Setup

1. Install the Firebase CLI:

   ```bash
   npm install -g firebase-tools
   ```

2. Log in to Firebase:

   ```bash
   firebase login
   ```

3. Replace the placeholder project ID in `.firebaserc`:

   ```json
   {
     "projects": {
       "default": "your-real-firebase-project-id"
     }
   }
   ```

4. Install Cloud Functions dependencies:

   ```bash
   cd functions
   npm install
   cd ..
   ```

## Deploy

Run all Firebase resources from the VaultScope root:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

## Optional Local Emulators

To test backend resources locally:

```bash
firebase emulators:start --only firestore,storage,functions
```

## Notes

- Cloud Functions region is configured in `functions/src/index.ts` via `setGlobalOptions({ region: "us-central1" })`.
- Storage uploads are limited to `scans/{userId}/...`.
- Only `image/jpeg` and `image/png` files up to 10 MB are accepted by Storage rules.
- `antique_auctions` is public read-only under the current Firestore rules.
