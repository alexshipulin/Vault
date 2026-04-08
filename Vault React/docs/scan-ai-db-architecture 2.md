# Vault React: Current Scan, Database, and AI Architecture

This document is the current source-of-truth reference for how object scanning, matching against databases, and AI-related flows are wired in `Vault React` as of the latest stabilization pass.

It is intentionally strict about what is actually live today versus what exists only as a prepared legacy bridge.

## 1. Executive Summary

There are currently **two scan/analysis paths** in the codebase:

1. **Active local app path**
   - This is what the React Native app actually uses at runtime right now.
   - Camera preview/capture is local.
   - Processing is fake and deterministic.
   - Result generation is local and fixture-driven.
   - Save is local-first.
   - AI chat is local and mocked.
   - No real object recognition, OCR pipeline, remote valuation, or live database matching happens in the active UI flow.

2. **Prepared legacy remote path**
   - This is bridged from the older Expo/Firebase/Gemini stack.
   - It contains a real pipeline for image upload, OCR/barcodes, Gemini identification, Firestore search, and result persistence.
   - It is currently **not wired into the active scan UI flow**.
   - It is only exposed through service adapters and readiness checks.
   - The only runtime use of the remote path today is optional **collection mirroring after save**, gated by config.

If you remember only one thing, it should be this:

> **The current app always generates scan results locally through the fake pipeline.**
> The legacy remote analysis pipeline exists, but the current UI does not call it.

## 2. Where the Active Scan Flow Is Wired

### App container

File: `src/core/app/container.ts`

This file is the central dependency composition point. It determines which scan services are actually used.

```ts
const mockScanResultFactory = new LocalMockScanResultFactory();
const scanProcessingPipeline = new FakeScanProcessingPipeline(
  mockScanResultFactory,
  runtimeConfig.flags.fastProcessing ? 60 : 550,
  runtimeConfig.flags.fastProcessing ? 30 : 250
);
const mockCaptureService = new MockCaptureService();
const analysisService = new LegacyRemoteAnalysisService();
const remoteSearchService = new LegacyRemoteSearchService();
const remoteCollectionMirror = new LegacyRemoteCollectionMirrorService();
```

Important:

- `scanProcessingPipeline` is the active pipeline used by the UI.
- `analysisService` exists in the container, but the active scan screens do not call it.
- `remoteSearchService` is used for readiness checks, not for the live result flow.
- `remoteCollectionMirror` may run after save if the remote flag is enabled.

## 3. Runtime Configuration and Gating

File: `constants/Config.ts`

Environment and flags are read from Expo config:

```ts
export const AppConfig = {
  firebase: {
    apiKey: optionalEnv(getExtraConfig().firebaseApiKey),
    projectId: optionalEnv(getExtraConfig().firebaseProjectId),
    authDomain: optionalEnv(getExtraConfig().firebaseAuthDomain),
    storageBucket: optionalEnv(getExtraConfig().firebaseStorageBucket),
    appId: optionalEnv(getExtraConfig().firebaseAppId),
    messagingSenderId: optionalEnv(getExtraConfig().firebaseMessagingSenderId)
  },
  geminiApiKey: optionalEnv(getExtraConfig().geminiApiKey),
  vaultEnvironment: getExtraConfig().vaultEnvironment === "production" ? "production" : "mock",
  flags: {
    seedData: asBool(getExtraConfig().vaultSeedData),
    fastProcessing: asBool(getExtraConfig().vaultFastProcessing),
    clearData: asBool(getExtraConfig().vaultClearData),
    skipOnboarding: asBool(getExtraConfig().vaultSkipOnboarding, true),
    remoteBackend: asBool(getExtraConfig().vaultRemoteBackend),
    forceMockCamera: asBool(getExtraConfig().vaultForceMockCamera)
  }
} as const;
```

Remote readiness is gated by `hasRemoteConfig()`:

```ts
export function hasRemoteConfig(): boolean {
  return Boolean(
    AppConfig.firebase.apiKey &&
      AppConfig.firebase.projectId &&
      AppConfig.firebase.authDomain &&
      AppConfig.firebase.storageBucket &&
      AppConfig.firebase.appId &&
      AppConfig.firebase.messagingSenderId &&
      AppConfig.geminiApiKey
  );
}
```

And then filtered again in runtime:

File: `src/core/app/runtime.ts`

```ts
export function currentRuntimeConfig(): RuntimeConfig {
  return {
    environment: AppConfig.vaultEnvironment,
    flags: {
      ...AppConfig.flags,
      remoteBackend: AppConfig.flags.remoteBackend && hasRemoteConfig()
    }
  };
}
```

Meaning:

- `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true` alone is not enough.
- Firebase and Gemini config must also be present.
- Even then, the active scan screen still does not switch to remote analysis by itself.

## 4. Active Scan Flow: Step by Step

### 4.1 Camera screen

File: `src/features/scan/CameraScanScreen.tsx`

The camera screen does three things:

1. Requests camera permission through `expo-camera`
2. Captures a real image if a camera is available
3. Falls back to a mock capture when camera access is unavailable or forced

Core capture logic:

```ts
if (isFallbackMode || !cameraRef.current) {
  image = await container.mockCaptureService.capture(preferredScanMode);
} else {
  const captured = await cameraRef.current.takePictureAsync({
    base64: true,
    quality: 0.85
  });
  image = {
    id: createID("image"),
    uri: captured?.uri ?? "file:///mock/capture.jpg",
    mimeType: "image/jpeg",
    base64: captured?.base64
  };
}
```

After capture it creates a temporary session:

```ts
await setCurrentSession({
  id: createID("session"),
  mode: preferredScanMode,
  capturedImages: [image],
  createdAt: new Date().toISOString()
});
router.push("/processing");
```

### 4.2 Temporary session model

Defined in `src/domain/models.ts`

```ts
export interface TemporaryScanSession {
  id: string;
  mode: ScanMode;
  capturedImages: ScanImage[];
  createdAt: string;
}
```

This is stored locally via `AsyncStorageTemporaryScanSessionStore`.

### 4.3 Processing screen

File: `src/features/scan/ProcessingScreen.tsx`

The processing screen always consumes the current temporary session and runs:

```ts
for await (const update of container.scanProcessingPipeline.process(currentSession)) {
  ...
  if (update.completedResult) {
    setLatestResult(update.completedResult);
    ...
    router.replace({
      pathname: "/result/[resultId]",
      params: { resultId: update.completedResult.id }
    });
  }
}
```

The important part is `container.scanProcessingPipeline`.

That pipeline is fake.

### 4.4 Fake processing pipeline

File: `src/features/scan/FakeScanProcessingPipeline.ts`

The pipeline emits staged progress updates:

```ts
const STAGES: ProcessingStageKind[] = [
  "objectRecognition",
  "conditionAssessment",
  "priceLookup",
  "historicalRecords"
];
```

It also rotates a fake “searching in” source line:

```ts
const STANDARD_SOURCES = ["eBay", "PCGS", "WorthPoint", "Library Archives"];
const MYSTERY_SOURCES = ["eBay", "Christie's", "Sotheby's", "WorthPoint"];
```

And finally produces a result locally:

```ts
yield { completedResult: this.resultFactory.buildResult(session) };
```

There is no call to:

- Gemini
- Firestore search
- Cloud Functions
- Scrapers
- OCR service

inside the active processing path.

### 4.5 Local mock result generation

File: `src/features/scan/MockScanResultFactory.ts`

Results are built from fixed templates, chosen by a checksum over captured image strings:

```ts
function checksum(session: TemporaryScanSession): number {
  return session.capturedImages.reduce((running, image) => running + image.uri.length + (image.base64?.length ?? 0), 0);
}
...
const template = templates[checksum(session) % templates.length];
```

This returns a `ScanResult` with:

- item category
- title
- origin
- year
- condition and range
- confidence
- fake price range
- history summary
- empty comparables

There is no live similarity search or price lookup here.

## 5. What Happens When the User Saves a Result

File: `src/features/scan/ScanResultScreen.tsx`

The `Save` action is local-first:

```ts
const photoUris = await container.imagePersistenceService.persistImages(currentSession?.capturedImages ?? []);
const savedItem: CollectibleItem = {
  id: result.id,
  name: result.name,
  category: result.category,
  conditionRaw: result.condition,
  ...
  photoUris,
  priceLow: result.priceData?.low ?? null,
  priceMid: result.priceData?.mid ?? null,
  priceHigh: result.priceData?.high ?? null,
  ...
};

await container.collectionRepository.save(savedItem);
```

Optional remote mirror:

```ts
if (container.runtimeConfig.flags.remoteBackend) {
  void container.remoteCollectionMirror.mirrorItem(savedItem);
}
```

Important:

- Save never depends on remote availability.
- Local persistence is the source of truth.
- Remote collection mirror is best-effort and non-blocking.

## 6. Local Persistence Used by Scan Flow

File: `src/data/local/storage.ts`

The current local source-of-truth keys are:

```ts
export const STORAGE_KEYS = {
  collection: "vault-react.collection.v1",
  temporarySession: "vault-react.temporary-session.v1",
  scanMode: "vault-react.scan-mode.v1",
  preferences: "vault-react.preferences.v1",
  chatSessions: "vault-react.chat-sessions.v1"
} as const;
```

For scan-related behavior, the important stores are:

- collection
- temporarySession
- scanMode
- chatSessions

## 7. What the Legacy Remote Analysis Path Actually Does

This is the path prepared for future real analysis.

### 7.1 Remote service adapter

File: `src/data/remote/LegacyRemoteServices.ts`

The adapter entry point is:

```ts
export class LegacyRemoteAnalysisService implements AnalysisService {
  async runAnalysis(session: TemporaryScanSession): Promise<ScanResult> {
    const { ScanPipeline } = requireLegacyScanPipeline();
    const pipeline = new ScanPipeline();
    const remote = await pipeline.executeScan(
      session.capturedImages.map((image) => image.uri),
      "general"
    );
    ...
  }
}
```

This does invoke the old real pipeline.

But again:

> The current React Native processing screen does not call `container.analysisService.runAnalysis(...)`.

It only exists as a bridge.

### 7.2 Real legacy scan pipeline

File: `lib/scan/pipeline.ts`

This is the old “real” end-to-end path.

Sequence:

1. Verify Firebase auth session
2. Process images through vision layer
3. Upload images to Firebase Storage
4. Send optimized/base64 images to Gemini
5. Build marketplace search query
6. Search Firestore-backed auction data
7. Derive a price range
8. Save scan result to Firestore

The core flow:

```ts
const visionResults = await Promise.all(images.map((imageUri) => this.visionProcessor.processImage(imageUri)));
const uploadedImageUrls = await Promise.all(
  visionResults.map((result) =>
    uploadScanImage(currentUser.uid, `data:image/jpeg;base64,${result.base64}`),
  ),
);
const identification = await this.geminiClient.identifyItem(
  visionResults.map((result) => `data:image/jpeg;base64,${result.base64}`),
  category,
  extractCombinedText(visionResults),
);
const comparableAuctions = await this.searchEngine.searchByKeywords(
  buildSearchQuery(identification, visionResults),
  { category: searchCategory },
  12,
);
const priceEstimate = derivePriceEstimate(comparableAuctions);
const scanResultId = await saveScanResult({ ... });
```

This is the actual real analysis path that would need to be reconnected into the live RN processing screen if you want true scanning.

## 8. Vision / OCR / Barcode Layer in the Legacy Pipeline

File: `lib/vision/processor.ts`

The legacy vision layer does:

1. crop image
2. run OCR through `@react-native-ml-kit/text-recognition` if available
3. run barcode detection through `expo-camera` URL scanning if available
4. optimize image for upload
5. convert optimized image to base64

Core method:

```ts
async processImage(imageUri: string): Promise<VisionResult> {
  const croppedUri = await this.cropToObject(imageUri);
  const text = await this.extractText(croppedUri);
  const barcodes = await this.detectBarcode(croppedUri);
  const optimizedUri = await this.optimizeForUpload(croppedUri);
  const base64 = await this.optimizer.convertToBase64(optimizedUri);

  return {
    originalUri: imageUri,
    croppedUri,
    optimizedUri,
    base64,
    text,
    barcodes,
  };
}
```

Important:

- This code exists.
- It is not active in the current visible RN scan flow.

## 9. Gemini / AI Identification Logic

### 9.1 Prompt building

File: `lib/gemini/prompts.ts`

The identification prompt is category-aware and structured:

```ts
export function buildIdentificationPrompt(category: string, ocrText?: string): string {
  ...
  return [
    "Identify the collectible item shown in the attached images.",
    `User-selected category: "${category}".`,
    getCategoryGuidance(category),
    ocrSection,
    SHARED_JSON_RULES,
    `Return a JSON object with this shape: ${JSON_SCHEMA_DESCRIPTION}`,
  ].join("\n\n");
}
```

The schema expects:

- category
- name
- year
- origin
- condition
- conditionRange
- historySummary
- confidence
- searchKeywords
- distinguishingFeatures

### 9.2 Gemini client

File: `lib/gemini/client.ts`

The main real AI call:

```ts
const response = await this.postJson<GeminiGenerateContentResponse>(
  `/models/${IDENTIFY_MODEL}:generateContent`,
  {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: IDENTIFY_RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 700,
    },
  },
);
```

Model and behavior:

- Base URL: `https://generativelanguage.googleapis.com/v1beta`
- Identify model: `gemini-2.5-flash`
- Retries: `3`
- Timeout: `15s`
- Caching is used through `getCachedIdentification` / `setCachedIdentification`
- Rate limiting is applied through `GeminiRateLimiter`

### 9.3 What the AI result is used for

In the legacy real pipeline, Gemini output drives:

- identification name/category/origin/year
- condition range
- history summary
- confidence
- search keywords for auction/database search

Those `searchKeywords` are then fed into Firestore search.

## 10. Database Matching / Comparable Search

### 10.1 Search engine class

File: `lib/firebase/search.ts`

The active legacy search class is `AntiqueSearchEngine`.

For free-text matching:

```ts
async searchByKeywords(
  queryText: string,
  filters: SearchFilters = {},
  limit = this.defaultLimit,
): Promise<SearchResult> {
  const keywords = extractSearchKeywords(queryText);
  ...
  return this.executeSearch(
    searchKey,
    buildFirestoreQuery(keywords, filters),
    normalizedLimit,
  );
}
```

### 10.2 Firestore query builder

File: `lib/firebase/utils.ts`

Actual Firestore matching is built like this:

```ts
export function buildFirestoreQuery(
  keywords: string[],
  filters: SearchFilters = {},
): Query<DocumentData> {
  const constraints: QueryConstraint[] = [];

  if (keywords.length > 0) {
    constraints.push(where("keywords", "array-contains-any", keywords.slice(0, 10)));
  }

  if (filters.category) {
    constraints.push(where("category", "==", filters.category.trim().toLowerCase()));
  }

  if (typeof filters.priceMin === "number") {
    constraints.push(where("priceRealized", ">=", filters.priceMin));
  }

  if (typeof filters.priceMax === "number") {
    constraints.push(where("priceRealized", "<=", filters.priceMax));
  }

  constraints.push(orderBy("priceRealized", "desc"));

  return query(collection(getVaultScopeDb(), "antique_auctions"), ...constraints);
}
```

Meaning:

- Matching is keyword-driven, not embedding-driven.
- Search happens against Firestore collection `antique_auctions`.
- Results are filtered by category and optional price/date filters.
- Ordering is by `priceRealized DESC`.

### 10.3 Price estimate derivation

File: `lib/scan/pipeline.ts`

Price range is derived statistically from the comparable auctions:

```ts
function derivePriceEstimate(results: ScanResult["comparableAuctions"]): PriceEstimate {
  const prices = results
    .map((item) => item.priceRealized)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price))
    .sort((left, right) => left - right);
  ...
}
```

This is not currently used by the active RN processing path.

## 11. Firebase Collections Involved

Based on the current code, the important Firestore locations are:

### `antique_auctions`

Used for search and comparable lookups.

Seen in:

- `lib/firebase/search.ts`
- `lib/firebase/utils.ts`
- `VaultScope/functions/src/index.ts`

Likely document fields used:

- `title`
- `description`
- `priceRealized`
- `estimateLow`
- `estimateHigh`
- `auctionHouse`
- `saleDate`
- `category`
- `period`
- `material`
- `originCountry`
- `imageUrl`
- `source`
- `keywords`
- `createdAt`
- `updatedAt`

### `scan_results`

Used to store remote/legacy scan outputs.

Seen in:

- `lib/firebase/firestore.ts`

Saved fields:

- `userId`
- `category`
- `images`
- `identification`
- `priceEstimate`
- `scannedAt`
- `updatedAt`

### `user_collections/{userId}/items`

Used for saved collection items on the Firebase side.

Seen in:

- `lib/firebase/firestore.ts`
- `lib/firebase/search.ts`
- `src/data/remote/LegacyRemoteServices.ts`

### `users`

Used for profile data.

### `stats`

Used by Cloud Functions for system/daily stats.

## 12. Cloud Functions and Scraper Pipeline

### 12.1 Scrapers

Folder: `VaultScope/scrapers/`

Current scrapers:

- `scraper_ebay.py`
- `scraper_heritage.py`
- `scraper_liveauctioneers.py`

Orchestrator:

File: `VaultScope/scrapers/run_all.py`

```py
def main() -> None:
    runs = [
        ("liveauctioneers", run_liveauctioneers),
        ("heritage", run_heritage),
        ("ebay", run_ebay),
    ]
```

Utilities:

File: `VaultScope/scrapers/utils.py`

This layer is responsible for:

- HTTP fetching
- user-agent rotation
- delays/retries
- text normalization
- price extraction
- category keyword mapping
- raw JSON output assembly

### 12.2 Cloud Functions

File: `VaultScope/functions/src/index.ts`

Main responsibilities:

- receive scraped data
- normalize it
- upsert into `antique_auctions`
- run scheduled scraping jobs
- cleanup old data
- generate daily stats

Key exported jobs/endpoints:

- `processScrapedData`
- `weeklyScrapingJob`
- `cleanupOldData`
- `generateDailyStats`

So the real database matching story is:

1. Python scrapers collect auction data
2. Cloud Functions normalize/upsert it into Firestore
3. `AntiqueSearchEngine` queries `antique_auctions`
4. `ScanPipeline` uses those results as comparables for pricing

## 13. What Is Actually Wired in the Current App UI

### Live today

- Camera preview via `expo-camera`
- Local temporary scan session
- Fake staged processing
- Local mock result generation
- Local save to AsyncStorage-backed collection
- Optional remote collection mirror after save
- Local mocked AI chat per item

### Exists, but not wired into the visible scan flow

- Vision processor with crop/OCR/barcode
- Firebase Storage image upload
- Gemini identification
- Firestore auction search
- Price derivation from comparables
- Saving remote scan results into `scan_results`

### Critical current truth

The current active scan path is:

`CameraScanScreen -> TemporaryScanSession -> FakeScanProcessingPipeline -> LocalMockScanResultFactory -> ScanResultScreen -> local save`

It is **not**:

`CameraScanScreen -> Vision -> Gemini -> Firestore search -> remote valuation -> real scan result`

## 14. Save / Mirror / Home / Vault Synchronization

When a result is saved:

1. images are persisted locally
2. `collectionRepository.save(...)` writes the item locally
3. `bumpCollectionVersion()` causes Home and Vault reloads
4. if remote backend is enabled and configured, a background mirror attempt runs

This is why:

- Home recent scans
- Home estimated total
- Vault grid
- Item Details
- scans this month

all stay in sync off the same local source of truth.

## 15. AI Chat: Current State

The item chat is not powered by Gemini in the active app flow.

File: `src/features/chat/LocalMockChatResponseGenerator.ts`

It generates deterministic contextual responses using:

- item category
- title
- subtitle
- price text
- condition text
- prompt keywords such as authenticity / sell / rare / grade / storage / maker

This is item-aware, but it is not an LLM call.

## 16. Current Backend Readiness Status

The strict readiness check is implemented in:

File: `scripts/readiness-check.mjs`

At the time of writing, local app flow is ready, but remote readiness depends on:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_GEMINI_API_KEY`
- non-placeholder Firebase project binding in `VaultScope/.firebaserc`

So:

- local mock scan flow is ready
- remote real analysis path is not production-ready yet unless env and Firebase project config are filled in

## 17. If You Want to Turn On Real Analysis Next

The minimum architecture change is:

1. Keep `CameraScanScreen` as-is for capture
2. In `ProcessingScreen`, branch between:
   - fake pipeline
   - remote analysis pipeline
3. Use `container.runtimeConfig.flags.remoteBackend` and readiness state to choose the path
4. Convert `LegacyRemoteAnalysisService.runAnalysis(session)` into the result source instead of `FakeScanProcessingPipeline`
5. Decide whether:
   - the remote pipeline should also drive staged progress, or
   - processing UI should become a wrapper around remote progress states

The most important current limitation is that `LegacyRemoteAnalysisService` returns only a final `ScanResult`, while `FakeScanProcessingPipeline` emits progressive UI updates.

That means the next real-analysis integration step is not just “call the remote service”.
You also need a progress model for the remote path.

## 18. Recommended Next Refactor

If you continue this work, the cleanest next step is:

1. Introduce a unified `ScanOrchestrator`
2. Give it two implementations:
   - `LocalMockScanOrchestrator`
   - `RemoteScanOrchestrator`
3. Make both emit the same progress/update contract
4. Keep `ProcessingScreen` dumb and progress-driven

That will let you swap from mock to real analysis without rewriting the UI again.

## 19. File Map

### Active local scan flow

- `src/features/scan/CameraScanScreen.tsx`
- `src/features/scan/ProcessingScreen.tsx`
- `src/features/scan/FakeScanProcessingPipeline.ts`
- `src/features/scan/MockScanResultFactory.ts`
- `src/features/scan/ScanResultScreen.tsx`
- `src/core/app/container.ts`
- `src/data/local/MockCaptureService.ts`
- `src/data/local/LocalImagePersistenceService.ts`
- `src/data/local/storage.ts`

### Remote legacy bridge

- `src/data/remote/LegacyRemoteServices.ts`
- `lib/scan/pipeline.ts`
- `lib/scan/types.ts`
- `lib/vision/processor.ts`
- `lib/vision/optimizer.ts`
- `lib/gemini/client.ts`
- `lib/gemini/prompts.ts`
- `lib/firebase/search.ts`
- `lib/firebase/utils.ts`
- `lib/firebase/firestore.ts`
- `lib/firebase/storage.ts`
- `lib/firebase/auth.ts`
- `lib/firebase/config.ts`

### Backend source

- `VaultScope/functions/src/index.ts`
- `VaultScope/functions/src/lib/firestore-queries.ts`
- `VaultScope/scrapers/run_all.py`
- `VaultScope/scrapers/utils.py`

## 20. Final Reality Check

Right now:

- the app **looks** like it scans and analyzes objects
- the UI flow is complete and coherent
- the local persistence is stable
- the remote architecture is partially bridged

But the actual object-to-database-to-AI matching path is still a prepared backend path, not the live default app path.

That is the most important implementation truth to preserve while you continue development.
