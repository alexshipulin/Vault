import type { GeminiIdentifyResponse } from "@/lib/gemini/types";
import type { PriceEstimate } from "@/lib/types";

import type { VinylPriceResult } from "./DiscogsClient";
import { discogsClient } from "./DiscogsClient";
import type { BullionEstimate } from "./MetalsClient";
import { metalsClient } from "./MetalsClient";
import type { PCGSCoinPrice } from "./PCGSClient";
import { pcgsClient } from "./PCGSClient";

export interface PriceResult {
  low: number | null;
  high: number | null;
  mid: number | null;
  source: "pcgs" | "discogs" | "metals" | "firestore" | "ai_estimate";
  confidenceLevel: "high" | "medium" | "low";
  sourceLabel: string;
  fetchedAt: string;
}

export interface PriceRouterProgressEvent {
  sourceKey: "pcgs" | "discogs" | "metals" | "firestore" | "ai_estimate";
  sourceLabel: string;
  message: string;
}

export interface PriceRouterLogEvent {
  kind: "request" | "response" | "decision" | "warning";
  title: string;
  message: string;
  details?: string[];
}

type AIEstimateInput = {
  low: number | null;
  high: number | null;
  confidence: number;
};

type PricingRouterContext = {
  firestoreEstimate?: PriceEstimate | null;
  onProgress?: (event: PriceRouterProgressEvent) => void;
  onLog?: (event: PriceRouterLogEvent) => void;
};

const SOURCE_LOOKUP_RETRY_DELAY_MS = 250;

function normalizeRange(low: number | null, high: number | null): { low: number | null; high: number | null } {
  if (typeof low === "number" && typeof high === "number") {
    return {
      low: Math.min(low, high),
      high: Math.max(low, high),
    };
  }

  return {
    low: low ?? high,
    high: high ?? low,
  };
}

function hasNumericRange(low: number | null, high: number | null): boolean {
  return typeof low === "number" || typeof high === "number";
}

function getMid(low: number | null, high: number | null): number | null {
  if (typeof low === "number" && typeof high === "number") {
    return Math.round((low + high) / 2);
  }

  return low ?? high ?? null;
}

function confidenceLevelFromScore(confidence: number): PriceResult["confidenceLevel"] {
  if (confidence >= 0.75) {
    return "high";
  }

  if (confidence >= 0.45) {
    return "medium";
  }

  return "low";
}

function estimateConfidence(estimate?: Pick<PriceEstimate, "confidence" | "valuationConfidence"> | null): number {
  if (!estimate) {
    return 0;
  }

  return typeof estimate.valuationConfidence === "number"
    ? estimate.valuationConfidence
    : estimate.confidence;
}

function buildAiResult(aiEstimate: AIEstimateInput): PriceResult {
  const normalized = normalizeRange(aiEstimate.low, aiEstimate.high);
  const confidence = Math.max(0, Math.min(1, aiEstimate.confidence));

  return {
    low: normalized.low,
    high: normalized.high,
    mid: getMid(normalized.low, normalized.high),
    source: "ai_estimate",
    confidenceLevel: confidenceLevelFromScore(confidence),
    sourceLabel: "AI Estimate",
    fetchedAt: new Date().toISOString(),
  };
}

function buildFirestoreResult(estimate: PriceEstimate): PriceResult {
  const normalized = normalizeRange(estimate.low, estimate.high);
  const confidence = estimateConfidence(estimate);

  return {
    low: normalized.low,
    high: normalized.high,
    mid: getMid(normalized.low, normalized.high),
    source: "firestore",
    confidenceLevel: confidenceLevelFromScore(confidence),
    sourceLabel: estimate.sourceLabel?.trim() || "Firestore Market Comparables",
    fetchedAt: new Date().toISOString(),
  };
}

function buildPcgsResult(coinPrice: PCGSCoinPrice): PriceResult {
  const values = Object.values(coinPrice.priceGuideValues).filter((value) => Number.isFinite(value));
  const sortedValues = [...values].sort((left, right) => left - right);
  const normalized = normalizeRange(
    coinPrice.averageCirculatedValue ??
      (sortedValues.length > 0 ? sortedValues[0] : null),
    coinPrice.averageUncirculatedValue ??
      (sortedValues.length > 0 ? sortedValues[sortedValues.length - 1] : null),
  );

  return {
    low: normalized.low,
    high: normalized.high,
    mid: getMid(normalized.low, normalized.high),
    source: "pcgs",
    confidenceLevel: "high",
    sourceLabel: "PCGS Price Guide",
    fetchedAt: coinPrice.fetchedAt,
  };
}

function buildBullionResult(bullionEstimate: BullionEstimate): PriceResult {
  return {
    low: bullionEstimate.estimatedLow,
    high: bullionEstimate.estimatedHigh,
    mid: getMid(bullionEstimate.estimatedLow, bullionEstimate.estimatedHigh),
    source: "metals",
    confidenceLevel: "medium",
    sourceLabel: `Based on ${bullionEstimate.metalContent.metal} spot price ($${bullionEstimate.spotPrice}/oz)`,
    fetchedAt: new Date().toISOString(),
  };
}

function buildDiscogsResult(vinylPrice: VinylPriceResult): PriceResult {
  return {
    low: vinylPrice.recommendedLow,
    high: vinylPrice.recommendedHigh,
    mid: getMid(vinylPrice.recommendedLow, vinylPrice.recommendedHigh),
    source: "discogs",
    confidenceLevel: vinylPrice.confidenceLevel,
    sourceLabel: `Discogs Marketplace · ${vinylPrice.release.artist ? `${vinylPrice.release.artist} - ` : ""}${vinylPrice.release.title}`,
    fetchedAt: vinylPrice.pricing.fetchedAt,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retryNullableLookup<T>(
  task: () => Promise<T | null>,
  attempts = 2,
): Promise<{ result: T | null; attemptsUsed: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await task();
      if (result != null || attempt === attempts) {
        return { result, attemptsUsed: attempt };
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }
    }

    if (attempt < attempts) {
      await delay(SOURCE_LOOKUP_RETRY_DELAY_MS);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { result: null, attemptsUsed: attempts };
}

function isCoinIdentification(identification: GeminiIdentifyResponse): boolean {
  const normalized = [
    identification.category,
    identification.objectType,
    identification.name,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return normalized.includes("coin") || normalized.includes("dollar") || normalized.includes("cent");
}

function prefersFirestoreEstimate(estimate?: PriceEstimate | null): boolean {
  if (!estimate) {
    return false;
  }

  return hasNumericRange(estimate.low, estimate.high) && estimateConfidence(estimate) >= 0.5;
}

export async function getPricingForItem(
  identification: GeminiIdentifyResponse,
  aiEstimate: AIEstimateInput,
  context: PricingRouterContext = {},
): Promise<PriceResult> {
  const firestoreEstimate = context.firestoreEstimate ?? null;
  const aiResult = buildAiResult(aiEstimate);

  if (identification.category === "coin" && identification.year != null && isCoinIdentification(identification)) {
    context.onLog?.({
      kind: "request",
      title: "PCGS lookup",
      message: "Requested a PCGS coin guide lookup.",
      details: [
        `year=${identification.year}`,
        `name=${identification.name}`,
        `mint mark=${identification.mintMark ?? "none"}`,
      ],
    });
    context.onProgress?.({
      sourceKey: "pcgs",
      sourceLabel: "PCGS Price Guide",
      message: "Checking PCGS price guide",
    });
    const { result: pcgsPrice, attemptsUsed: pcgsAttempts } = await retryNullableLookup(
      () => pcgsClient.safeLookup(identification),
      3,
    ).catch((error: unknown) => {
      context.onLog?.({
        kind: "warning",
        title: "PCGS lookup",
        message: "PCGS lookup failed, so the scan continued without PCGS pricing.",
        details: [error instanceof Error ? error.message : "Unknown PCGS failure"],
      });
      return { result: null, attemptsUsed: 3 };
    });
    context.onLog?.({
      kind: "response",
      title: "PCGS lookup",
      message: pcgsPrice ? "Received a PCGS price guide match." : "PCGS returned no direct match.",
      details: pcgsPrice
        ? [
            pcgsPrice.coinName,
            `pcgs no=${pcgsPrice.pcgsNo}`,
            `circulated=${pcgsPrice.averageCirculatedValue ?? "n/a"}`,
            `uncirculated=${pcgsPrice.averageUncirculatedValue ?? "n/a"}`,
            `attempts=${pcgsAttempts}`,
          ]
        : [`attempts=${pcgsAttempts}`],
    });
    const bullionEstimate =
      identification.isBullion === true
        ? (context.onLog?.({
            kind: "request",
            title: "Metals spot lookup",
            message: "Requested live spot prices for bullion valuation.",
            details: [`name=${identification.name}`],
          }),
          context.onProgress?.({
            sourceKey: "metals",
            sourceLabel: "Live metals spot prices",
            message: "Checking live metals spot prices",
          }),
          (await retryNullableLookup(() => metalsClient.estimateBullionValue(identification), 3).catch((error: unknown) => {
            context.onLog?.({
              kind: "warning",
              title: "Metals spot lookup",
              message: "Live metals pricing was unavailable, so bullion pricing was skipped.",
              details: [error instanceof Error ? error.message : "Unknown metals pricing failure"],
            });
            return { result: null, attemptsUsed: 3 };
          })).result)
        : null;

    if (bullionEstimate) {
      context.onLog?.({
        kind: "response",
        title: "Metals spot lookup",
        message: "Received a bullion melt-value estimate.",
        details: [
          `${bullionEstimate.metalContent.metal} ${bullionEstimate.metalContent.troyOz} oz`,
          `spot=${bullionEstimate.spotPrice}`,
          `range=${bullionEstimate.estimatedLow}-${bullionEstimate.estimatedHigh}`,
        ],
      });
    }

    if (bullionEstimate) {
      const bullionResult = buildBullionResult(bullionEstimate);
      const bullionHigh = bullionResult.high ?? bullionResult.low ?? 0;
      const pcgsHigh =
        pcgsPrice?.averageUncirculatedValue ??
        pcgsPrice?.averageCirculatedValue ??
        Math.max(...Object.values(pcgsPrice?.priceGuideValues ?? {}), 0);

      if (pcgsPrice && pcgsHigh > bullionHigh) {
        context.onLog?.({
          kind: "decision",
          title: "Pricing decision",
          message: "Used PCGS pricing because collector premium exceeded bullion value.",
          details: [`pcgs high=${pcgsHigh}`, `bullion high=${bullionHigh}`],
        });
        return buildPcgsResult(pcgsPrice);
      }

      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Used bullion pricing because no stronger collector premium was confirmed.",
        details: [`range=${bullionResult.low}-${bullionResult.high}`],
      });
      return bullionResult;
    }

    if (pcgsPrice) {
      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Used PCGS price guide as the primary source.",
        details: [`range=${pcgsPrice.averageCirculatedValue ?? "n/a"}-${pcgsPrice.averageUncirculatedValue ?? "n/a"}`],
      });
      return buildPcgsResult(pcgsPrice);
    }

    if (hasNumericRange(aiResult.low, aiResult.high)) {
      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Fell back to the AI estimate because no stronger coin pricing source matched.",
      });
      return aiResult;
    }

    if (firestoreEstimate && hasNumericRange(firestoreEstimate.low, firestoreEstimate.high)) {
      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Fell back to Firestore comparables because AI estimate was unavailable.",
      });
      return buildFirestoreResult(firestoreEstimate);
    }

    context.onLog?.({
      kind: "decision",
      title: "Pricing decision",
      message: "Returned the AI estimate as the final fallback.",
    });
    return aiResult;
  }

  if (identification.category === "vinyl") {
    context.onLog?.({
      kind: "request",
      title: "Discogs lookup",
      message: "Requested Discogs marketplace pricing for a vinyl release.",
      details: [
        `name=${identification.name}`,
        `catalog number=${identification.catalogNumber ?? "none"}`,
      ],
    });
    context.onProgress?.({
      sourceKey: "discogs",
      sourceLabel: "Discogs Marketplace",
      message: "Checking Discogs marketplace history",
    });
    const { result: discogsPrice, attemptsUsed: discogsAttempts } = await retryNullableLookup(
      () => discogsClient.lookupVinyl(identification),
      3,
    ).catch((error: unknown) => {
      context.onLog?.({
        kind: "warning",
        title: "Discogs lookup",
        message: "Discogs pricing was unavailable, so the scan continued without Discogs pricing.",
        details: [error instanceof Error ? error.message : "Unknown Discogs failure"],
      });
      return { result: null, attemptsUsed: 3 };
    });
    context.onLog?.({
      kind: "response",
      title: "Discogs lookup",
      message: discogsPrice ? "Received a Discogs release match." : "Discogs returned no direct release match.",
      details: discogsPrice
        ? [
            `${discogsPrice.release.artist} - ${discogsPrice.release.title}`,
            `catno=${discogsPrice.release.catno || "n/a"}`,
            `range=${discogsPrice.recommendedLow}-${discogsPrice.recommendedHigh}`,
            `attempts=${discogsAttempts}`,
          ]
        : [`attempts=${discogsAttempts}`],
    });
    if (discogsPrice) {
      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Used Discogs marketplace pricing as the primary source.",
      });
      return buildDiscogsResult(discogsPrice);
    }

    if (!hasNumericRange(aiResult.low, aiResult.high) && firestoreEstimate) {
      context.onLog?.({
        kind: "decision",
        title: "Pricing decision",
        message: "Used Firestore comparables because Discogs and AI pricing were unavailable.",
      });
      return buildFirestoreResult(firestoreEstimate);
    }
    context.onLog?.({
      kind: "decision",
      title: "Pricing decision",
      message: "Used the AI estimate because Discogs did not return a usable price.",
    });
    return aiResult;
  }

  if (
    (identification.category === "antique" || identification.category === "general") &&
    firestoreEstimate &&
    prefersFirestoreEstimate(firestoreEstimate)
  ) {
    context.onLog?.({
      kind: "decision",
      title: "Pricing decision",
      message: "Used Firestore comparables because they were strong enough for this category.",
    });
    return buildFirestoreResult(firestoreEstimate);
  }

  if (hasNumericRange(aiResult.low, aiResult.high)) {
    context.onLog?.({
      kind: "decision",
      title: "Pricing decision",
      message: "Used the AI estimate as the primary fallback.",
    });
    return aiResult;
  }

  if (firestoreEstimate) {
    context.onLog?.({
      kind: "decision",
      title: "Pricing decision",
      message: "Used Firestore comparables because the AI estimate was unavailable.",
    });
    return buildFirestoreResult(firestoreEstimate);
  }

  context.onLog?.({
    kind: "decision",
    title: "Pricing decision",
    message: "Returned the AI estimate as the last available source.",
  });
  return aiResult;
}
