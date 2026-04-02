/* eslint-disable @typescript-eslint/no-require-imports */
import { AppConfig, hasRemoteConfig } from "@/constants/Config";
import type { AnalysisService, AppReadinessService, RemoteSearchService } from "@src/domain/contracts";
import type { AppReadinessReport, CollectibleItem, PriceSource, ScanResult, TemporaryScanSession } from "@src/domain/models";

function requireLegacyFirebaseAuth(): { ensureAnonymousSession: () => Promise<{ uid: string }> } {
  return require("@/lib/firebase/auth") as { ensureAnonymousSession: () => Promise<{ uid: string }> };
}

function requireLegacyFirestore(): {
  addToCollection: (
    userID: string,
    payload: {
      scanResultId: string;
      title: string;
      imageUrl: string;
      priceEstimate: { low: number | null; high: number | null; currency: string; confidence: number };
      customNotes: string;
      addedAt: string;
    }
  ) => Promise<void>;
} {
  return require("@/lib/firebase/firestore") as {
    addToCollection: (
      userID: string,
      payload: {
        scanResultId: string;
        title: string;
        imageUrl: string;
        priceEstimate: { low: number | null; high: number | null; currency: string; confidence: number };
        customNotes: string;
        addedAt: string;
      }
    ) => Promise<void>;
  };
}

function requireLegacySearch(): { AntiqueSearchEngine: new () => { getTopDeals: (category?: string, limit?: number) => Promise<unknown[]> } } {
  return require("@/lib/firebase/search") as {
    AntiqueSearchEngine: new () => { getTopDeals: (category?: string, limit?: number) => Promise<unknown[]> };
  };
}

function requireLegacyScanPipeline(): {
  ScanPipeline: new () => {
    executeScan: (images: string[], category: string, appraisalMode?: "standard" | "mystery") => Promise<{
      id: string;
      images: string[];
      scannedAt: string;
      comparableAuctions: {
        id: string;
        title: string;
        priceRealized?: number | null;
        estimateHigh?: number | null;
        estimateLow?: number | null;
        saleDate?: string | null;
        imageUrl?: string | null;
        source?: string | null;
      }[];
      identification: {
        category: string;
        name: string;
        year?: number | null;
        origin?: string | null;
        objectType?: string | null;
        material?: string | null;
        makerOrBrand?: string | null;
        condition: string;
        conditionRange: [string, string];
        historySummary: string;
        confidence: number;
        requiresMeasurements?: boolean;
        requiresMorePhotos?: boolean;
        isLikelyMassProduced?: boolean;
        isLikelyReproduction?: boolean;
        valuationWarnings?: string[];
        marketTier?: "junk" | "decor" | "secondary" | "collector" | "premium_antique";
        pricingEvidenceStrength?: "weak" | "moderate" | "strong";
        likelyRetailContext?: "flea_market" | "thrift" | "estate_sale" | "auction";
        likelyValueCeiling?: number | null;
        valuationConfidence?: number;
        descriptionTone?: "skeptical" | "neutral" | "collector";
      };
      priceEstimate: {
        low?: number | null;
        high?: number | null;
        currency: string;
        source?: "database" | "aiFallback";
        sourceLabel?: string | null;
        confidence?: number;
        valuationConfidence?: number;
        valuationMode?: "standard" | "mystery";
        evidenceStrength?: "weak" | "moderate" | "strong";
        appliedValueCeiling?: number | null;
        sourceBreakdown?: { ebay: number; liveauctioneers: number; heritage: number };
        matchedSources?: string[];
        comparableCount?: number;
        needsReview?: boolean;
        valuationWarnings?: string[];
      };
    }>;
  };
} {
  return require("@/lib/scan/pipeline") as {
    ScanPipeline: new () => {
    executeScan: (images: string[], category: string, appraisalMode?: "standard" | "mystery") => Promise<{
        id: string;
        images: string[];
        scannedAt: string;
        comparableAuctions: {
          id: string;
          title: string;
          priceRealized?: number | null;
          estimateHigh?: number | null;
          estimateLow?: number | null;
          saleDate?: string | null;
          imageUrl?: string | null;
          source?: string | null;
        }[];
        identification: {
          category: string;
          name: string;
          year?: number | null;
          origin?: string | null;
          objectType?: string | null;
          material?: string | null;
          makerOrBrand?: string | null;
          condition: string;
          conditionRange: [string, string];
          historySummary: string;
          confidence: number;
          requiresMeasurements?: boolean;
          requiresMorePhotos?: boolean;
          isLikelyMassProduced?: boolean;
          isLikelyReproduction?: boolean;
          valuationWarnings?: string[];
          marketTier?: "junk" | "decor" | "secondary" | "collector" | "premium_antique";
          pricingEvidenceStrength?: "weak" | "moderate" | "strong";
          likelyRetailContext?: "flea_market" | "thrift" | "estate_sale" | "auction";
          likelyValueCeiling?: number | null;
          valuationConfidence?: number;
          descriptionTone?: "skeptical" | "neutral" | "collector";
        };
        priceEstimate: {
          low?: number | null;
          high?: number | null;
          currency: string;
          source?: "database" | "aiFallback";
          sourceLabel?: string | null;
          confidence?: number;
          valuationConfidence?: number;
          valuationMode?: "standard" | "mystery";
          evidenceStrength?: "weak" | "moderate" | "strong";
          appliedValueCeiling?: number | null;
          sourceBreakdown?: { ebay: number; liveauctioneers: number; heritage: number };
          matchedSources?: string[];
          comparableCount?: number;
          needsReview?: boolean;
          valuationWarnings?: string[];
        };
      }>;
    };
  };
}

type LegacyScanPipelineInstance = InstanceType<ReturnType<typeof requireLegacyScanPipeline>["ScanPipeline"]>;

function mapCondition(raw: string): number {
  switch (raw) {
    case "mint":
      return 8;
    case "near_mint":
      return 7;
    case "fine":
      return 4;
    case "very_good":
      return 3;
    case "good":
      return 2;
    default:
      return 1;
  }
}

function mapRemoteCategory(input: string): ScanResult["category"] {
  const normalized = input.trim().toLowerCase();

  if (normalized.includes("vinyl") || normalized.includes("record")) {
    return "vinyl";
  }
  if (normalized.includes("card")) {
    return "card";
  }
  if (
    normalized.includes("antique") ||
    normalized.includes("ceramic") ||
    normalized.includes("pottery") ||
    normalized.includes("porcelain") ||
    normalized.includes("vase") ||
    normalized.includes("jar") ||
    normalized.includes("stoneware") ||
    normalized.includes("furniture") ||
    normalized.includes("jewelry") ||
    normalized.includes("art")
  ) {
    return "antique";
  }
  if (normalized.includes("coin")) {
    return "coin";
  }

  return "antique";
}

function mapRemotePriceSource(
  remoteSource: "database" | "aiFallback" | undefined,
  comparableSource: string | null | undefined,
): PriceSource {
  if (remoteSource === "aiFallback") {
    return "aiEstimate";
  }

  const normalized = comparableSource?.trim().toLowerCase() ?? "";
  if (normalized.includes("pcgs")) {
    return "pcgs";
  }
  if (normalized.includes("discogs")) {
    return "discogs";
  }
  if (normalized.includes("ebay")) {
    return "ebay";
  }

  return "antiqueDB";
}

export class LegacyRemoteAnalysisService implements AnalysisService {
  async isConfigured(): Promise<boolean> {
    return hasRemoteConfig();
  }

  async runAnalysis(session: TemporaryScanSession): Promise<ScanResult> {
    const { ScanPipeline } = requireLegacyScanPipeline();
    const pipeline = new ScanPipeline() as LegacyScanPipelineInstance;
    const remote = await pipeline.executeScan(
      session.capturedImages.map((image) => image.uri),
      "general",
      session.mode,
    );
    const low = remote.priceEstimate.low ?? null;
    const high = remote.priceEstimate.high ?? null;
    const hasPrice = typeof low === "number" || typeof high === "number";
    const mappedSource = mapRemotePriceSource(remote.priceEstimate.source, remote.comparableAuctions[0]?.source);
    const mid =
      typeof low === "number" && typeof high === "number"
        ? (low + high) / 2
        : high ?? low ?? 0;
    const matchedSources = remote.priceEstimate.matchedSources ?? [];
    const valuationWarnings = remote.priceEstimate.valuationWarnings ?? [];
    const sourceLabelBase =
      remote.priceEstimate.sourceLabel ??
      (remote.priceEstimate.source === "aiFallback"
        ? "AI approximation used because no reliable market matches were found."
        : "Mapped from legacy Gemini + auction search pipeline");
    const sourceLabel = [
      sourceLabelBase,
      matchedSources.length ? `Sources: ${matchedSources.join(", ")}.` : "",
      valuationWarnings.length ? `Checks: ${valuationWarnings.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      id: remote.id,
      category: mapRemoteCategory(remote.identification.category),
      name: remote.identification.name,
      year: remote.identification.year,
      origin: remote.identification.origin,
      condition: mapCondition(remote.identification.condition),
      conditionRangeLow: mapCondition(remote.identification.conditionRange[0]),
      conditionRangeHigh: mapCondition(remote.identification.conditionRange[1]),
      historySummary: remote.identification.historySummary,
      confidence: remote.identification.confidence,
      priceData: hasPrice
        ? {
            low: low ?? high ?? 0,
            mid,
            high: high ?? low ?? 0,
            currency: remote.priceEstimate.currency,
            source: mappedSource,
            sourceLabel,
            fetchedAt: remote.scannedAt,
            valuationConfidence: remote.priceEstimate.valuationConfidence ?? remote.priceEstimate.confidence ?? null,
            valuationMode: remote.priceEstimate.valuationMode ?? session.mode,
            evidenceStrength: remote.priceEstimate.evidenceStrength ?? null,
            appliedValueCeiling: remote.priceEstimate.appliedValueCeiling ?? null,
            sourceBreakdown: remote.priceEstimate.sourceBreakdown ?? null,
            matchedSources,
            comparableCount: remote.priceEstimate.comparableCount ?? remote.comparableAuctions.length,
            needsReview: remote.priceEstimate.needsReview ?? false,
            valuationWarnings,
            comparables: remote.comparableAuctions.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.title,
              price: item.priceRealized ?? item.estimateHigh ?? item.estimateLow ?? 0,
              soldAt: item.saleDate ?? remote.scannedAt,
              source: item.source ?? null,
              sourceURL: null
            }))
          }
        : null,
      rawAIResponse: JSON.stringify(remote.identification),
      scannedAt: remote.scannedAt,
      inputImageHashes: remote.images
    };
  }
}

export class LegacyRemoteSearchService implements RemoteSearchService {
  async isConfigured(): Promise<boolean> {
    return hasRemoteConfig();
  }

  async isDataReady(): Promise<boolean> {
    if (!hasRemoteConfig()) {
      return false;
    }

    try {
      const { ensureAnonymousSession } = requireLegacyFirebaseAuth();
      const { AntiqueSearchEngine } = requireLegacySearch();
      await ensureAnonymousSession();
      const engine = new AntiqueSearchEngine();
      const results = await engine.getTopDeals(undefined, 1);
      return Array.isArray(results);
    } catch {
      return false;
    }
  }
}

export class LegacyRemoteCollectionMirrorService {
  async mirrorItem(item: CollectibleItem): Promise<boolean> {
    if (!hasRemoteConfig()) {
      return false;
    }

    try {
      const { ensureAnonymousSession } = requireLegacyFirebaseAuth();
      const { addToCollection } = requireLegacyFirestore();
      const user = await ensureAnonymousSession();
      await addToCollection(user.uid, {
        scanResultId: item.id,
        title: item.name,
        imageUrl: item.photoUris[0] ?? "",
        priceEstimate: {
          low: item.priceLow ?? null,
          high: item.priceHigh ?? item.priceMid ?? item.priceLow ?? null,
          currency: "USD",
          confidence: item.valuationConfidence ?? item.confidence ?? 0.5
        },
        customNotes: item.historySummary,
        addedAt: item.addedAt
      });
      return true;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Remote collection mirror failed", error);
      }
      return false;
    }
  }
}

export class LegacyReadinessService implements AppReadinessService {
  constructor(
    private readonly searchService: RemoteSearchService,
    private readonly analysisService: AnalysisService
  ) {}

  async check(): Promise<AppReadinessReport> {
    const firebaseConfigured = hasRemoteConfig();
    const projectReady = firebaseConfigured && AppConfig.firebase.projectId !== "your-firebase-project-id";
    const searchIndexReady = await this.searchService.isDataReady().catch(() => false);
    const remoteAnalysisReady = await this.analysisService.isConfigured().catch(() => false);
    const remoteConfiguredButUnverified = firebaseConfigured && (!searchIndexReady || !remoteAnalysisReady);

    return {
      firebaseConfigured,
      firebaseProjectReady: projectReady,
      functionsConfigured: projectReady,
      searchIndexReady,
      geminiConfigured: Boolean(AppConfig.geminiApiKey),
      remoteAnalysisReady,
      messages: [
        firebaseConfigured
          ? projectReady
            ? "Firebase config detected"
            : "Firebase env detected, but the project binding is still placeholder or not verified"
          : "Firebase config missing",
        searchIndexReady
          ? "Auction search returned results"
          : remoteConfiguredButUnverified
            ? "Auction search is configured but not verified"
            : "Auction search could not be verified",
        remoteAnalysisReady
          ? searchIndexReady
            ? "Remote analysis service configured"
            : "Remote analysis service is configured but not verified"
          : "Remote analysis service not ready"
      ]
    };
  }
}
