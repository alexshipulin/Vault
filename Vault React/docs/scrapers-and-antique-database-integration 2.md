# Vault React: Scrapers and Antique Database Integration

This document explains how the antique data ingestion layer is currently organized across:

- the React Native app in `Vault React/`
- the Firebase backend in `VaultScope/functions/`
- the Python scraper layer in `VaultScope/scrapers/`

It also clarifies what is actually active today in the app and what exists only as a prepared backend path.

## 1. Naming clarification

The old backend folder is:

- `VaultScope/scrapers/`

Not `scrabber`, even though that name was used informally before.

## 2. Executive Summary

The antique database flow is split into three layers:

1. **Python scrapers**
   - collect raw auction data from external sites
   - save raw results locally

2. **Firebase Functions**
   - normalize scraped items
   - classify them into categories
   - extract keywords
   - upsert them into Firestore collection `antique_auctions`

3. **React Native app**
   - contains a legacy Firestore search adapter and a legacy remote analysis pipeline
   - can query `antique_auctions` through `AntiqueSearchEngine`
   - but the current active scan UI still uses the local fake processing path by default

So the current reality is:

> The antique database infrastructure exists and is partially bridged into the React Native app, but the active visible scan flow is still local/mock-first.

## 3. High-Level Data Flow

The intended backend-driven antique analysis path looks like this:

```text
Python scrapers
  -> raw auction items
  -> Firebase Function processScrapedData
  -> Firestore collection antique_auctions
  -> React Native AntiqueSearchEngine
  -> ScanPipeline comparable search
  -> derived price estimate and comparable auctions
```

The currently active UI flow in `Vault React` is:

```text
CameraScanScreen
  -> TemporaryScanSession
  -> FakeScanProcessingPipeline
  -> LocalMockScanResultFactory
  -> ScanResultScreen
  -> local save
```

Those are not the same thing.

## 4. Scraper Layer

Folder:

- `VaultScope/scrapers/`

Main files:

- `run_all.py`
- `scraper_ebay.py`
- `scraper_heritage.py`
- `scraper_liveauctioneers.py`
- `utils.py`

### 4.1 Orchestrator

File: `VaultScope/scrapers/run_all.py`

```py
def main() -> None:
    runs = [
        ("liveauctioneers", run_liveauctioneers),
        ("heritage", run_heritage),
        ("ebay", run_ebay),
    ]
```

This script runs the three scrapers sequentially and logs how many items each source produced.

### 4.2 Supported auction/data sources

Current scrapers cover:

- eBay sold/completed listings
- Heritage Auctions search results
- LiveAuctioneers search results

### 4.3 eBay scraper

File: `VaultScope/scrapers/scraper_ebay.py`

Current search queries:

```py
QUERIES = [
    "antique",
    "vintage collectible",
    "estate jewelry",
    "antique furniture",
]
```

For each card/listing it extracts:

- `title`
- `price`
- `date`
- `source`
- `imageUrl`
- `scrapedAt`
- `url`
- `condition`
- `query`
- `category`
- `keywords`

Example parser payload shape:

```py
item = {
    "title": title,
    "price": extract_price(price_text),
    "date": normalize_date_text(date_text),
    "source": SOURCE,
    "imageUrl": absolute_url(BASE_URL, image_url),
    "scrapedAt": now_iso(),
    "url": absolute_url(BASE_URL, url_node.get("href") if url_node else None),
    "condition": condition,
    "query": query,
    "category": detect_category(title),
    "keywords": extract_keywords(title),
}
```

### 4.4 Heritage scraper

File: `VaultScope/scrapers/scraper_heritage.py`

Search queries:

```py
QUERIES = [
    "antique furniture",
    "antique ceramics",
    "antique jewelry",
    "antique art",
    "vintage collectibles",
]
```

It extracts richer pricing data, including:

- visible sale price
- estimate low/high
- sale date
- category
- keywords

It is designed for auction-style results, not just marketplace listings.

### 4.5 LiveAuctioneers scraper

File: `VaultScope/scrapers/scraper_liveauctioneers.py`

Categories searched:

```py
CATEGORIES = [
    "antique furniture",
    "antique ceramics",
    "antique jewelry",
    "antique art",
    "vintage collectibles",
]
```

Typical extracted fields:

- `title`
- `price`
- `date`
- `source`
- `imageUrl`
- `scrapedAt`
- `url`
- `lotUrl`
- `auctionHouse`
- `estimateLow`
- `estimateHigh`
- `query`
- `category`
- `keywords`

### 4.6 Shared scraper utilities

File: `VaultScope/scrapers/utils.py`

This is the normalization backbone for the scraper layer.

It currently handles:

- request session creation
- user-agent rotation
- retrying failed requests
- delays between requests
- HTML parsing with BeautifulSoup
- text cleanup
- price extraction
- category keyword heuristics
- keyword extraction
- deduplication
- result saving

Important constants:

- `RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"`
- `CATEGORY_KEYWORDS`
- `STOP_WORDS`

So the scraper layer is built to produce normalized raw data files before that data is pushed deeper into Firebase.

## 5. Firebase Functions Layer

Folder:

- `VaultScope/functions/`

Main entry:

- `VaultScope/functions/src/index.ts`

Main helper files:

- `src/lib/firestore-converters.ts`
- `src/lib/firestore-queries.ts`
- `src/lib/validation.ts`
- `src/utils/categories.ts`
- `src/utils/keywords.ts`

### 5.1 What Functions do

The functions layer is responsible for:

- receiving scraped auction payloads
- validating and normalizing items
- extracting keywords and categories
- writing items into Firestore
- scheduled scraping orchestration
- cleanup jobs
- daily aggregate stats

### 5.2 Main exported jobs/endpoints

From `VaultScope/functions/src/index.ts`:

- `processScrapedData`
- `weeklyScrapingJob`
- `cleanupOldData`
- `generateDailyStats`

### 5.3 Target Firestore collection for antique data

The main collection is:

- `antique_auctions`

In the functions code:

```ts
const auctionsCollection = db.collection("antique_auctions");
```

### 5.4 Scraped item normalization

The function layer turns raw scraper output into normalized auction documents.

Key transformations in `index.ts`:

- normalize text
- parse price values
- parse dates
- detect category
- merge extracted and incoming keywords
- upsert by deterministic document id

Deterministic document id:

```ts
function buildAuctionDocId(source: string, title: string): string {
  return createHash("sha1")
    .update(`${source.toLowerCase()}::${title.toLowerCase()}`)
    .digest("hex");
}
```

This means multiple scraper runs merge into stable document IDs instead of creating uncontrolled duplicates.

### 5.5 Batch writing into Firestore

The function uses batched writes to upsert auction items:

```ts
batch.set(
  auctionsCollection.doc(docId),
  {
    ...item,
    updatedAt: item.updatedAt ?? FieldValue.serverTimestamp(),
  },
  { merge: true },
);
```

So the database model is merge-friendly and update-oriented.

## 6. Firestore Collection Model

### 6.1 Antique auctions

Converter file:

- `VaultScope/functions/src/lib/firestore-converters.ts`

Collection helper:

```ts
export function antiqueAuctionsCollection() {
  return getFirestore()
    .collection("antique_auctions")
    .withConverter(antiqueAuctionConverter);
}
```

Likely stored fields:

- `title`
- `description`
- `priceRealized`
- `estimateLow`
- `estimateHigh`
- `auctionHouse`
- `saleDate`
- `category`
- `imageUrl`
- `source`
- `keywords`
- `createdAt`
- `updatedAt`

### 6.2 Scan results

Separate collection:

- `scan_results`

This is not the antique database itself. It stores analysis outcomes per user scan.

### 6.3 User collection

Separate location:

- `user_collections/{userId}/items`

This stores user-saved items, not the global auction database.

## 7. Firestore Querying for Antique Matching

The app-side database matching logic is in:

- `Vault React/lib/firebase/search.ts`
- `Vault React/lib/firebase/utils.ts`

### 7.1 Search engine class

File: `Vault React/lib/firebase/search.ts`

Main class:

```ts
export class AntiqueSearchEngine {
  async searchByKeywords(queryText: string, filters: SearchFilters = {}, limit = this.defaultLimit): Promise<SearchResult>
  async searchByCategory(category: string, limit = this.defaultLimit): Promise<SearchResult>
  async searchByPriceRange(min: number, max: number, category?: string): Promise<SearchResult>
  async getTopDeals(category?: string, limit = this.defaultLimit): Promise<SearchResult>
}
```

### 7.2 How keyword matching works

File: `Vault React/lib/firebase/utils.ts`

Keywords are normalized and filtered:

```ts
export function extractSearchKeywords(queryText: string): string[] {
  return Array.from(
    new Set(
      normalized
        .split(/[^a-z0-9]+/i)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 2)
        .filter((keyword) => !STOP_WORDS.has(keyword)),
    ),
  ).slice(0, 10);
}
```

Then Firestore query constraints are built:

```ts
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
```

So matching is currently:

- keyword-based
- Firestore-driven
- category-filtered
- optionally price/date filtered

It is **not** embedding-based nearest-neighbor search right now.

## 8. How This Is Connected to Analysis

### 8.1 Legacy real analysis path

File: `Vault React/lib/scan/pipeline.ts`

This is the real backend-aware scan pipeline prepared in the codebase.

It does:

1. authenticate with Firebase
2. run vision preprocessing
3. upload images to Firebase Storage
4. identify item with Gemini
5. build search query from Gemini output + OCR/barcodes
6. query Firestore antique auction data
7. derive price estimate
8. save scan result back to Firestore

Core calls:

```ts
const visionResults = await Promise.all(images.map((imageUri) => this.visionProcessor.processImage(imageUri)));
const uploadedImageUrls = await Promise.all(
  visionResults.map((result) =>
    uploadScanImage(currentUser.uid, `data:image/jpeg;base64,${result.base64}`),
  ),
);
const identification = await this.geminiClient.identifyItem(...);
const comparableAuctions = await this.searchEngine.searchByKeywords(...);
const priceEstimate = derivePriceEstimate(comparableAuctions);
const scanResultId = await saveScanResult(...);
```

### 8.2 Legacy bridge into the new app

File: `Vault React/src/data/remote/LegacyRemoteServices.ts`

The new RN app wraps that older pipeline in:

```ts
export class LegacyRemoteAnalysisService implements AnalysisService {
  async runAnalysis(session: TemporaryScanSession): Promise<ScanResult> {
    const { ScanPipeline } = requireLegacyScanPipeline();
    const pipeline = new ScanPipeline();
    const remote = await pipeline.executeScan(...);
    ...
  }
}
```

Important:

> This remote analysis service exists, but the current visible scan flow does not call it yet.

The active UI currently still uses:

- `FakeScanProcessingPipeline`
- `LocalMockScanResultFactory`

instead of the real remote pipeline.

## 9. Gemini / AI Side in the Antique Pipeline

Files:

- `Vault React/lib/gemini/client.ts`
- `Vault React/lib/gemini/prompts.ts`

Gemini is used for item identification, not for the chat UI in the current active app flow.

What Gemini returns:

- category
- item name
- year
- origin
- condition
- condition range
- history summary
- confidence
- search keywords
- distinguishing features

Those `searchKeywords` are used as the search query into Firestore auction data.

So the intended real matching chain is:

```text
photo
 -> Gemini identification
 -> searchKeywords
 -> Firestore antique_auctions query
 -> comparable auctions
 -> price estimate
```

## 10. Firebase Config and Rules

### 10.1 Firebase project config

File: `VaultScope/firebase.json`

Configured services:

- Firestore rules
- Firestore indexes
- Storage rules
- Functions build/deploy

### 10.2 Firestore rules

File: `VaultScope/firestore.rules`

Relevant rule for antique database:

```txt
match /antique_auctions/{auctionId} {
  allow read: if true;
}
```

This means:

- global antique auction data is readable by clients
- users do not need ownership to read those auction docs

Other important rules:

- `scan_results` are user-owned
- `users/{userId}` is user-owned
- `user_collections/{userId}/items` is user-owned

### 10.3 Storage rules

File: `VaultScope/storage.rules`

Scan image uploads are restricted to signed-in owners:

```txt
match /scans/{userId}/{filePath=**} {
  allow read: if isOwner(userId);
  allow create, update: if isOwner(userId) && isAllowedImageUpload();
  allow delete: if isOwner(userId);
}
```

### 10.4 Current Firebase binding status

File: `VaultScope/.firebaserc`

Current content still shows a placeholder:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

So from a real backend-readiness perspective:

- the structure exists
- the rules exist
- the collections/functions design exists
- but the actual project binding is still not production-ready until this is replaced

## 11. How the App Uses Antique Database Data Today

### Active today in app UI

- The app can use `AntiqueSearchEngine` through the legacy bridge
- The app can check readiness of search/analysis services
- The app can mirror saved items to remote collection if remote backend is enabled

### Not active in default scan UX today

- direct Firestore antique search during the visible processing flow
- Gemini-powered real analysis during live scanning
- real comparable auctions powering the result screen

That means the antique database connection is **implemented in the codebase**, but **not yet the live default path in the rewritten RN app**.

## 12. What Is Needed for the Real Antique Database Analysis Path to Work End-to-End

For the real backend path to become active, all of the following need to be true:

1. Expo env variables must be present:
   - `EXPO_PUBLIC_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC_FIREBASE_APP_ID`
   - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `EXPO_PUBLIC_GEMINI_API_KEY`

2. `VaultScope/.firebaserc` must point to a real Firebase project

3. Firestore data in `antique_auctions` must actually be populated

4. The app must switch `ProcessingScreen` from:
   - `FakeScanProcessingPipeline`
   to:
   - `LegacyRemoteAnalysisService` or a unified real orchestrator

5. A proper progress/reporting bridge must be added, because the current fake processing flow emits staged updates but the remote service currently returns only a final result

## 13. Current Status in Plain Language

Right now:

- the scraper layer exists
- the Firebase ingestion layer exists
- Firestore antique database query logic exists
- Gemini identification logic exists
- the new app contains a bridge to all of that

But:

- the current visible scan UX in `Vault React` still uses the local fake processing pipeline
- the antique database integration is prepared, not the active default runtime path

## 14. File Map

### Python scraper layer

- `VaultScope/scrapers/run_all.py`
- `VaultScope/scrapers/scraper_ebay.py`
- `VaultScope/scrapers/scraper_heritage.py`
- `VaultScope/scrapers/scraper_liveauctioneers.py`
- `VaultScope/scrapers/utils.py`

### Firebase ingestion / query layer

- `VaultScope/functions/src/index.ts`
- `VaultScope/functions/src/lib/firestore-converters.ts`
- `VaultScope/functions/src/lib/firestore-queries.ts`
- `VaultScope/firebase.json`
- `VaultScope/firestore.rules`
- `VaultScope/storage.rules`
- `VaultScope/.firebaserc`

### App-side legacy bridge and query path

- `Vault React/src/data/remote/LegacyRemoteServices.ts`
- `Vault React/lib/firebase/search.ts`
- `Vault React/lib/firebase/utils.ts`
- `Vault React/lib/firebase/firestore.ts`
- `Vault React/lib/firebase/storage.ts`
- `Vault React/lib/firebase/auth.ts`
- `Vault React/lib/firebase/config.ts`
- `Vault React/lib/scan/pipeline.ts`
- `Vault React/lib/gemini/client.ts`
- `Vault React/lib/gemini/prompts.ts`

## 15. Final Reality Check

If your next goal is “make the app really search antique databases during analysis”, this is the truth you should work from:

- the search and backend infrastructure already exists
- the antique DB is Firestore collection `antique_auctions`
- that collection is intended to be fed by Python scrapers and Firebase Functions
- the RN app already has a legacy search/analysis bridge
- but the active scan flow still needs to be switched from fake/local to real/remote

That is the current implementation state.
