import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import axios from "axios";
import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Query,
} from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";

import { detectCategory, normalizeCategory } from "./utils/categories";
import { buildAuctionKeywords } from "./utils/keywords";
import type {
  AuctionCategory,
  CleanupSummary,
  DailyStatsDocument,
  NormalizedScrapedItem,
  PriceRangeBucketStats,
  ProcessScrapedDataResponse,
  ScrapedItemInput,
  ScraperRunnerPayload,
  ScraperRunnerResponse,
} from "./types";

initializeApp();

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const auctionsCollection = db.collection("antique_auctions");
const statsCollection = db.collection("stats");
const STARTER_SCRAPER_PAYLOAD_PATH = path.resolve(__dirname, "../data/starter-seed.json");

const SCRAPER_RUNNER_URL = defineString("SCRAPER_RUNNER_URL");
const NOTIFICATION_WEBHOOK_URL = defineString("NOTIFICATION_WEBHOOK_URL");
const PROCESS_SCRAPED_DATA_API_KEY = defineSecret("PROCESS_SCRAPED_DATA_API_KEY");
const SCRAPER_RUNNER_API_KEY = defineSecret("SCRAPER_RUNNER_API_KEY");
const NOTIFICATION_WEBHOOK_API_KEY = defineSecret("NOTIFICATION_WEBHOOK_API_KEY");

const HTTP_BATCH_SIZE = 500;
const MAINTENANCE_BATCH_SIZE = 500;
const HTTP_RATE_LIMIT_REQUESTS = 20;
const HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const MIN_ITEMS_TO_KEEP = 100_000;
const DAILY_STATS_PATH_ASSUMPTION = "stats/daily/snapshots/{date}";
const AUCTION_CATEGORIES: AuctionCategory[] = [
  "furniture",
  "ceramics",
  "art",
  "jewelry",
  "general",
];
const PRICE_BUCKETS: PriceRangeBucketStats[] = [
  { label: "under_100", min: null, max: 100, count: 0 },
  { label: "100_to_500", min: 100, max: 500, count: 0 },
  { label: "500_to_1000", min: 500, max: 1_000, count: 0 },
  { label: "1000_to_5000", min: 1_000, max: 5_000, count: 0 },
  { label: "above_5000", min: 5_000, max: null, count: 0 },
];
const DAILY_STATS_SNAPSHOT_COLLECTION = "snapshots";
const SCHEDULE_TIME_ZONE = "Etc/UTC";
const SCRAPER_RETRY_COUNT = 3;

const scrapedItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  price: z.union([z.number(), z.string()]).optional().nullable(),
  priceRealized: z.union([z.number(), z.string()]).optional().nullable(),
  auctionHouse: z.string().trim().optional().nullable(),
  saleDate: z.string().trim().optional().nullable(),
  date: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  source: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).optional(),
  scrapedAt: z.string().trim().optional().nullable(),
}).passthrough();

const scrapedItemsPayloadSchema = z.union([
  z.array(scrapedItemSchema).min(1),
  z.object({
    items: z.array(scrapedItemSchema).min(1),
  }),
]);

const rateLimitState = new Map<string, number[]>();

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const match =
    text.match(/(?:US\s*)?(?:\$|£|€|EUR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i) ??
    text.match(/([0-9][0-9,]*(?:\.\d{1,2})?)/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const text = value.trim();
  const isoCandidate = text.replace("Z", "+00:00");
  const directParse = new Date(isoCandidate);
  if (!Number.isNaN(directParse.getTime())) {
    return directParse;
  }

  const normalizedMatch = text.match(
    /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i,
  );

  if (normalizedMatch) {
    const candidate = normalizedMatch[0].replace("Sept", "Sep");
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function buildAuctionDocId(source: string, title: string): string {
  return createHash("sha1")
    .update(`${source.toLowerCase()}::${title.toLowerCase()}`)
    .digest("hex");
}

function coercePayloadItems(payload: unknown): ScrapedItemInput[] {
  const parsed = scrapedItemsPayloadSchema.parse(payload);
  return Array.isArray(parsed) ? parsed : parsed.items;
}

function normalizeIncomingKeywords(item: ScrapedItemInput): string[] {
  if (!Array.isArray(item.keywords)) {
    return [];
  }

  return item.keywords
    .map((keyword) => normalizeText(keyword).toLowerCase())
    .filter((keyword): keyword is string => Boolean(keyword));
}

function prepareAuctionDocument(item: ScrapedItemInput): NormalizedScrapedItem {
  const title = normalizeText(item.title);
  const description = normalizeText(item.description);
  const source = normalizeText(item.source);

  if (!title) {
    throw new Error("Item title is required");
  }

  if (!source) {
    throw new Error("Item source is required");
  }

  const extracted = buildAuctionKeywords({
    title,
    description,
    category: item.category ?? null,
    rawKeywords: normalizeIncomingKeywords(item),
  });
  const incoming = normalizeIncomingKeywords(item);
  const keywords = Array.from(new Set([...extracted, ...incoming])).slice(0, 25);

  const detectedCategory = detectCategory(title);
  const fallbackCategory = normalizeCategory(item.category);
  const category = detectedCategory === "general" ? fallbackCategory : detectedCategory;

  return {
    title,
    description,
    priceRealized: parsePrice(item.priceRealized ?? item.price),
    auctionHouse: normalizeText(item.auctionHouse) || null,
    saleDate: parseDate(item.saleDate ?? item.date),
    category,
    imageUrl: normalizeText(item.imageUrl) || null,
    source,
    keywords,
    createdAt: parseDate(item.scrapedAt) ?? new Date(),
    updatedAt: new Date(),
  };
}

async function batchWrite(items: NormalizedScrapedItem[], batchSize: number): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    const slice = items.slice(index, index + batchSize);
    const batch = db.batch();

    for (const item of slice) {
      const docId = buildAuctionDocId(item.source, item.title);
      batch.set(
        auctionsCollection.doc(docId),
        {
          ...item,
          updatedAt: item.updatedAt ?? FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    await batch.commit();
    logger.info("Committed antique auction batch", {
      batchSize: slice.length,
      committed: Math.min(index + slice.length, items.length),
      total: items.length,
    });
  }
}

async function ingestScrapedItems(
  items: ScrapedItemInput[],
  context: string,
): Promise<{ writtenCount: number; skippedCount: number }> {
  const normalizedItems: NormalizedScrapedItem[] = [];
  let skippedCount = 0;

  for (const [index, item] of items.entries()) {
    try {
      const validated = scrapedItemSchema.parse(item);
      normalizedItems.push(prepareAuctionDocument(validated));
    } catch (error) {
      skippedCount += 1;
      logger.warn("Skipping invalid scraped item", {
        context,
        index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (normalizedItems.length > 0) {
    await batchWrite(normalizedItems, HTTP_BATCH_SIZE);
  }

  return {
    writtenCount: normalizedItems.length,
    skippedCount,
  };
}

function getClientIdentifier(req: { headers: Record<string, unknown>; ip?: string }): string {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]);
  }

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || forwardedFor.trim();
  }

  return req.ip || "unknown";
}

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitState.get(clientId) || []).filter(
    (timestamp) => now - timestamp < HTTP_RATE_LIMIT_WINDOW_MS,
  );

  if (timestamps.length >= HTTP_RATE_LIMIT_REQUESTS) {
    rateLimitState.set(clientId, timestamps);
    return true;
  }

  timestamps.push(now);
  rateLimitState.set(clientId, timestamps);
  return false;
}

function extractApiKey(headers: Record<string, unknown>): string {
  const apiKeyHeader = headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authorizationHeader = headers.authorization;
  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length).trim();
  }

  return "";
}

function getDailyStatsRef(dateKey: string) {
  return statsCollection
    .doc("daily")
    .collection(DAILY_STATS_SNAPSHOT_COLLECTION)
    .doc(dateKey);
}

async function getCount(query: Query): Promise<number> {
  const snapshot = await query.count().get();
  return Number(snapshot.data().count ?? 0);
}

async function sendCompletionNotification(payload: Record<string, unknown>): Promise<void> {
  const webhookUrl = NOTIFICATION_WEBHOOK_URL.value();
  const webhookApiKey = NOTIFICATION_WEBHOOK_API_KEY.value();

  if (
    !webhookUrl ||
    webhookUrl.startsWith("disabled://") ||
    webhookUrl.includes("example.invalid")
  ) {
    logger.info("Skipping completion notification because webhook is disabled", {
      configuredWebhook: webhookUrl,
    });
    return;
  }

  try {
    await axios.post(webhookUrl, payload, {
      headers: webhookApiKey
        ? {
            Authorization: `Bearer ${webhookApiKey}`,
          }
        : undefined,
      timeout: 15_000,
    });
  } catch (error) {
    logger.error("Failed to send completion notification", error);
  }
}

async function requestScraperRunnerPayload(): Promise<ScraperRunnerResponse> {
  const url = SCRAPER_RUNNER_URL.value();
  const apiKey = SCRAPER_RUNNER_API_KEY.value();
  const payload: ScraperRunnerPayload = {
    job: "weeklyScraping",
    sources: ["liveauctioneers", "heritage", "ebay"],
  };

  for (let attempt = 1; attempt <= SCRAPER_RETRY_COUNT; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: 120_000,
      });

      const responseData = response.data as unknown;

      if (Array.isArray(responseData)) {
        return {
          success: true,
          items: responseData as ScrapedItemInput[],
          count: responseData.length,
        };
      }

      if (
        responseData &&
        typeof responseData === "object" &&
        Array.isArray((responseData as { items?: unknown[] }).items)
      ) {
        const items = (responseData as { items: ScrapedItemInput[] }).items;
        return {
          success: true,
          items,
          count: items.length,
        };
      }

      throw new Error("Scraper runner returned an unsupported payload shape");
    } catch (error) {
      logger.error("Scraper runner request failed", {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt >= SCRAPER_RETRY_COUNT) {
        throw error;
      }
    }
  }

  throw new Error("Scraper runner request exhausted retries");
}

function loadStarterScraperItems(): ScrapedItemInput[] {
  const raw = readFileSync(STARTER_SCRAPER_PAYLOAD_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return coercePayloadItems(parsed);
}

async function writeMaintenanceSummary(summary: CleanupSummary): Promise<void> {
  await statsCollection.doc("system").set(
    {
      lastCleanupAt: summary.executedAt,
      cleanup: summary,
      dailyStatsPathAssumption: DAILY_STATS_PATH_ASSUMPTION,
    },
    { merge: true },
  );
}

export const processScrapedData = onRequest(
  {
    cors: true,
    timeoutSeconds: 3600,
    secrets: [PROCESS_SCRAPED_DATA_API_KEY],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    const clientId = getClientIdentifier(req);
    if (isRateLimited(clientId)) {
      res.status(429).json({ success: false, error: "Rate limit exceeded" });
      return;
    }

    const providedApiKey = extractApiKey(req.headers as Record<string, unknown>);
    if (providedApiKey !== PROCESS_SCRAPED_DATA_API_KEY.value()) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    try {
      const items = coercePayloadItems(req.body);
      const { writtenCount, skippedCount } = await ingestScrapedItems(
        items,
        "processScrapedData",
      );

      logger.info("Processed scraped data request", {
        totalReceived: items.length,
        writtenCount,
        skippedCount,
      });

      const response: ProcessScrapedDataResponse = {
        success: true,
        count: writtenCount,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error("processScrapedData failed", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid payload",
      });
    }
  },
);

export const scraperRunnerStub = onRequest(
  {
    cors: true,
    timeoutSeconds: 300,
    secrets: [SCRAPER_RUNNER_API_KEY],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    const providedApiKey = extractApiKey(req.headers as Record<string, unknown>);
    if (providedApiKey !== SCRAPER_RUNNER_API_KEY.value()) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    try {
      const items = loadStarterScraperItems();
      const response: ScraperRunnerResponse = {
        success: true,
        items,
        count: items.length,
      };
      res.status(200).json(response);
    } catch (error) {
      logger.error("scraperRunnerStub failed", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to load starter scraper payload",
      });
    }
  },
);

export const weeklyScrapingJob = onSchedule(
  {
    schedule: "0 2 * * 0",
    timeZone: SCHEDULE_TIME_ZONE,
    retryCount: 3,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 3600,
    timeoutSeconds: 1800,
    secrets: [SCRAPER_RUNNER_API_KEY, NOTIFICATION_WEBHOOK_API_KEY],
  },
  async () => {
    const startedAt = Date.now();

    try {
      const scraperPayload = await requestScraperRunnerPayload();
      const { writtenCount, skippedCount } = await ingestScrapedItems(
        scraperPayload.items,
        "weeklyScrapingJob",
      );

      const durationMs = Date.now() - startedAt;
      const notificationPayload = {
        job: "weeklyScrapingJob",
        success: true,
        receivedCount: scraperPayload.count,
        writtenCount,
        skippedCount,
        durationMs,
      };

      await statsCollection.doc("system").set(
        {
          lastWeeklyScrapingRunAt: FieldValue.serverTimestamp(),
          lastWeeklyScrapingSummary: notificationPayload,
        },
        { merge: true },
      );

      await sendCompletionNotification(notificationPayload);
      logger.info("weeklyScrapingJob completed", notificationPayload);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const notificationPayload = {
        job: "weeklyScrapingJob",
        success: false,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      };

      await sendCompletionNotification(notificationPayload);
      logger.error("weeklyScrapingJob failed", error);
      throw error;
    }
  },
);

export const cleanupOldData = onSchedule(
  {
    schedule: "0 3 1 * *",
    timeZone: SCHEDULE_TIME_ZONE,
    retryCount: 2,
    minBackoffSeconds: 300,
    maxBackoffSeconds: 3600,
    timeoutSeconds: 1800,
  },
  async () => {
    const executedAt = new Date();
    const cutoffDate = new Date(executedAt);
    cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 2);

    const totalBefore = await getCount(auctionsCollection);
    const deletableBudget = Math.max(0, totalBefore - MIN_ITEMS_TO_KEEP);
    let deletedCount = 0;

    if (deletableBudget > 0) {
      while (deletedCount < deletableBudget) {
        const snapshot = await auctionsCollection
          .where("saleDate", "<", cutoffDate)
          .orderBy("saleDate", "asc")
          .limit(Math.min(MAINTENANCE_BATCH_SIZE, deletableBudget - deletedCount))
          .get();

        if (snapshot.empty) {
          break;
        }

        const batch = db.batch();
        snapshot.docs.forEach((document) => batch.delete(document.ref));
        await batch.commit();

        deletedCount += snapshot.size;
        logger.info("cleanupOldData deleted batch", {
          batchSize: snapshot.size,
          deletedCount,
          deletableBudget,
        });

        if (snapshot.size < MAINTENANCE_BATCH_SIZE) {
          break;
        }
      }
    }

    const totalAfter = totalBefore - deletedCount;
    const summary: CleanupSummary = {
      executedAt,
      cutoffDate,
      totalBefore,
      totalAfter,
      deletedCount,
      retainedMinimum: MIN_ITEMS_TO_KEEP,
    };

    await writeMaintenanceSummary(summary);
    logger.info("cleanupOldData completed", summary);
  },
);

export const generateDailyStats = onSchedule(
  {
    schedule: "0 1 * * *",
    timeZone: SCHEDULE_TIME_ZONE,
    retryCount: 2,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 1800,
    timeoutSeconds: 1800,
  },
  async () => {
    const generatedAt = new Date();
    const dateKey = generatedAt.toISOString().slice(0, 10);

    const [
      totalItems,
      furnitureCount,
      ceramicsCount,
      artCount,
      jewelryCount,
      generalCount,
      under100,
      between100And500,
      between500And1000,
      between1000And5000,
      above5000,
    ] = await Promise.all([
      getCount(auctionsCollection),
      getCount(auctionsCollection.where("category", "==", "furniture")),
      getCount(auctionsCollection.where("category", "==", "ceramics")),
      getCount(auctionsCollection.where("category", "==", "art")),
      getCount(auctionsCollection.where("category", "==", "jewelry")),
      getCount(auctionsCollection.where("category", "==", "general")),
      getCount(auctionsCollection.where("priceRealized", "<", 100)),
      getCount(
        auctionsCollection.where("priceRealized", ">=", 100).where("priceRealized", "<", 500),
      ),
      getCount(
        auctionsCollection.where("priceRealized", ">=", 500).where("priceRealized", "<", 1000),
      ),
      getCount(
        auctionsCollection.where("priceRealized", ">=", 1000).where("priceRealized", "<", 5000),
      ),
      getCount(auctionsCollection.where("priceRealized", ">=", 5000)),
    ]);

    const statsDocument: DailyStatsDocument = {
      date: dateKey,
      generatedAt,
      totalItems,
      itemsByCategory: {
        furniture: furnitureCount,
        ceramics: ceramicsCount,
        art: artCount,
        jewelry: jewelryCount,
        general: generalCount,
      },
      priceRanges: [
        { label: "under_100", min: null, max: 100, count: under100 },
        { label: "100_to_500", min: 100, max: 500, count: between100And500 },
        { label: "500_to_1000", min: 500, max: 1000, count: between500And1000 },
        { label: "1000_to_5000", min: 1000, max: 5000, count: between1000And5000 },
        { label: "above_5000", min: 5000, max: null, count: above5000 },
      ],
      notes: `Stored under ${DAILY_STATS_PATH_ASSUMPTION} because '/stats/daily/{date}' is not a valid Firestore document path.`,
    };

    await getDailyStatsRef(dateKey).set(statsDocument, { merge: true });
    await statsCollection.doc("system").set(
      {
        lastDailyStatsRunAt: FieldValue.serverTimestamp(),
        lastDailyStatsDate: dateKey,
      },
      { merge: true },
    );

    logger.info("generateDailyStats completed", {
      dateKey,
      totalItems,
      categories: AUCTION_CATEGORIES,
      priceBuckets: PRICE_BUCKETS.map((bucket) => bucket.label),
    });
  },
);
