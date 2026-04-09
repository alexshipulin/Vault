/* eslint-disable @typescript-eslint/no-require-imports */
import { AppConfig, hasRemoteConfig } from "@/constants/Config";
import type { AnalysisLogDocument } from "@/lib/analysis/logs";
import type { ScanProgressState } from "@/lib/scan/types";
import type { AnalysisService, AppReadinessService, RemoteSearchService } from "@src/domain/contracts";
import type { AppReadinessCheck, AppReadinessReport, CollectibleItem, PriceSource, ScanResult, TemporaryScanSession } from "@src/domain/models";

function requireLegacyFirebaseAuth(): { ensureAnonymousSession: () => Promise<{ uid: string } | null> } {
  return require("@/lib/firebase/auth") as { ensureAnonymousSession: () => Promise<{ uid: string } | null> };
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

function requireLegacyFirestoreDebug(): {
  getScanResult: (scanId: string) => Promise<unknown>;
  saveFailedScanLog: (payload: {
    id: string;
    userId: string;
    category: string;
    images: string[];
    analysisLog: AnalysisLogDocument;
    scannedAt: string;
    errorSummary: string;
    failedStep: string;
  }) => Promise<string>;
} {
  return require("@/lib/firebase/firestore") as {
    getScanResult: (scanId: string) => Promise<unknown>;
    saveFailedScanLog: (payload: {
      id: string;
      userId: string;
      category: string;
      images: string[];
      analysisLog: AnalysisLogDocument;
      scannedAt: string;
      errorSummary: string;
      failedStep: string;
    }) => Promise<string>;
  };
}

function requireLegacySearch(): { AntiqueSearchEngine: new () => { getTopDeals: (category?: string, limit?: number) => Promise<unknown[]> } } {
  return require("@/lib/firebase/search") as {
    AntiqueSearchEngine: new () => { getTopDeals: (category?: string, limit?: number) => Promise<unknown[]> };
  };
}

function requireLegacyScanPipeline(): {
  ScanPipeline: new (options?: { onProgress?: (progress: ScanProgressState) => void }) => {
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
        pricingBasis?: string | null;
        pricingConfidence?: number | null;
        isBullion?: boolean | null;
      };
      priceEstimate: {
        low?: number | null;
        high?: number | null;
        currency: string;
        source?: "database" | "ai_estimate" | "aiFallback" | "pcgs" | "discogs" | "ebay" | "metals";
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
      analysisLog?: AnalysisLogDocument | null;
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
          pricingBasis?: string | null;
          pricingConfidence?: number | null;
          isBullion?: boolean | null;
        };
        priceEstimate: {
          low?: number | null;
          high?: number | null;
          currency: string;
          source?: "database" | "ai_estimate" | "aiFallback" | "pcgs" | "discogs" | "ebay" | "metals";
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
        analysisLog?: AnalysisLogDocument | null;
      }>;
    };
  };
}

function requireLegacyGeminiClient(): {
  GeminiClient: new () => {
    generateEmbedding: (text: string) => Promise<{ embedding: number[] }>;
  };
} {
  return require("@/lib/gemini/client") as {
    GeminiClient: new () => {
      generateEmbedding: (text: string) => Promise<{ embedding: number[] }>;
    };
  };
}

function requireLegacyPricingClients(): {
  pcgsClient: {
    lookupCoin: (params: {
      certNo?: string;
      barcode?: string;
      gradingService?: "PCGS" | "NGC";
      pcgsNo?: string | number;
      gradeNo?: number;
      plusGrade?: boolean;
    }) => Promise<unknown>;
  };
  discogsClient: {
    lookupVinyl: (identification: {
      category: string;
      name: string;
      catalogNumber?: string | null;
      year?: number | null;
      historySummary: string;
      searchKeywords: string[];
      distinguishingFeatures: string[];
    }) => Promise<unknown>;
  };
  metalsClient: { getSpotPrices: () => Promise<unknown> };
} {
  return {
    ...(require("@/src/services/pricing/PCGSClient") as {
      pcgsClient: {
        lookupCoin: (params: {
          certNo?: string;
          barcode?: string;
          gradingService?: "PCGS" | "NGC";
          pcgsNo?: string | number;
          gradeNo?: number;
          plusGrade?: boolean;
        }) => Promise<unknown>;
      };
    }),
    ...(require("@/src/services/pricing/DiscogsClient") as {
      discogsClient: {
        lookupVinyl: (identification: {
          category: string;
          name: string;
          catalogNumber?: string | null;
          year?: number | null;
          historySummary: string;
          searchKeywords: string[];
          distinguishingFeatures: string[];
        }) => Promise<unknown>;
      };
    }),
    ...(require("@/src/services/pricing/MetalsClient") as {
      metalsClient: { getSpotPrices: () => Promise<unknown> };
    }),
  };
}

function requireLegacyEBayClient(): {
  getEBayClient: (clientId: string, clientSecret: string, campaignId?: string) => {
    searchItems: (params: { keywords: string; category?: string; limit?: number }) => Promise<unknown[]>;
    consumeLastFailureReason?: () => string | null;
  };
  ebayClient: {
    searchItems: (params: { keywords: string; category?: string; limit?: number }) => Promise<unknown[]>;
    consumeLastFailureReason?: () => string | null;
  } | null;
} {
  return require("@/src/services/pricing/EBayClient") as {
    getEBayClient: (clientId: string, clientSecret: string, campaignId?: string) => {
      searchItems: (params: { keywords: string; category?: string; limit?: number }) => Promise<unknown[]>;
      consumeLastFailureReason?: () => string | null;
    };
    ebayClient: {
      searchItems: (params: { keywords: string; category?: string; limit?: number }) => Promise<unknown[]>;
      consumeLastFailureReason?: () => string | null;
    } | null;
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

function mapRemoteCategory(input: string | null | undefined): ScanResult["category"] {
  const normalized = input?.trim().toLowerCase() ?? "";

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
  remoteSource: "database" | "ai_estimate" | "aiFallback" | "pcgs" | "discogs" | "ebay" | "metals" | undefined,
  comparableSource: string | null | undefined,
): PriceSource {
  if (remoteSource === "metals") {
    return "metals";
  }

  if (remoteSource === "pcgs") {
    return "pcgs";
  }

  if (remoteSource === "discogs") {
    return "discogs";
  }

  if (remoteSource === "ebay") {
    return "ebay";
  }

  if (remoteSource === "ai_estimate" || remoteSource === "aiFallback") {
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

  async runAnalysis(
    session: TemporaryScanSession,
    onProgress?: (progress: ScanProgressState) => void,
  ): Promise<ScanResult> {
    const { ScanPipeline } = requireLegacyScanPipeline();
    const pipeline = new ScanPipeline({
      onProgress,
    }) as LegacyScanPipelineInstance;
    const categoryHint = "general";
    const remote = await pipeline.executeScan(
      session.capturedImages.map((image) => image.uri),
      categoryHint,
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
      (remote.priceEstimate.source === "ai_estimate" || remote.priceEstimate.source === "aiFallback"
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
      inputImageHashes: remote.images,
      analysisLog: remote.analysisLog ?? null,
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
      const user = await ensureAnonymousSession();
      if (!user) {
        return false;
      }
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
      if (!user) {
        return false;
      }
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
    const checks: AppReadinessCheck[] = [];
    const verifiedAt = new Date().toISOString();

    const addCheck = (
      key: AppReadinessCheck["key"],
      label: AppReadinessCheck["label"],
      status: AppReadinessCheck["status"],
      message: string,
    ) => {
      checks.push({ key, label, status, message });
    };

    const formatError = (error: unknown) =>
      error instanceof Error && error.message ? error.message : "Unknown error";

    if (!firebaseConfigured) {
      addCheck("firebase", "Firebase config", "missing", "Firebase environment variables are missing.");
    } else if (!projectReady) {
      addCheck("firebase", "Firebase config", "configured", "Firebase env is present, but the project binding is still placeholder or not verified.");
    } else {
      addCheck("firebase", "Firebase config", "verified", "Firebase config is present for the bound project.");
    }

    const searchIndexReady =
      firebaseConfigured && projectReady ? await this.searchService.isDataReady().catch(() => false) : false;
    addCheck(
      "firestore",
      "Firestore comparables",
      !firebaseConfigured
        ? "missing"
        : searchIndexReady
          ? "verified"
          : "failed",
      !firebaseConfigured
        ? "Firestore search cannot run until Firebase is configured."
        : searchIndexReady
          ? "Marketplace comparable lookup returned results."
          : "Marketplace comparable lookup did not return a verified live result.",
    );

    const geminiConfigured = Boolean(AppConfig.geminiApiKey);
    let geminiVerified = false;
    if (!geminiConfigured) {
      addCheck("gemini", "Gemini AI", "missing", "Gemini API key is missing.");
    } else {
      try {
        const { GeminiClient } = requireLegacyGeminiClient();
        const client = new GeminiClient();
        const response = await client.generateEmbedding("vaultscope readiness probe");
        geminiVerified = Array.isArray(response.embedding) && response.embedding.length > 0;
        addCheck(
          "gemini",
          "Gemini AI",
          geminiVerified ? "verified" : "failed",
          geminiVerified ? "Gemini live probe succeeded." : "Gemini probe returned an empty embedding.",
        );
      } catch (error) {
        addCheck("gemini", "Gemini AI", "failed", `Gemini live probe failed: ${formatError(error)}`);
      }
    }

    const { pcgsClient, discogsClient, metalsClient } = requireLegacyPricingClients();

    const hasPcgsAuth = Boolean(
      AppConfig.pcgs.apiKey ||
        (AppConfig.pcgs.email && AppConfig.pcgs.password) ||
        (AppConfig.pcgs.username && AppConfig.pcgs.password),
    );
    if (!hasPcgsAuth) {
      addCheck("pcgs", "PCGS", "missing", "PCGS API key is missing.");
    } else {
      try {
        const pcgsProbe = await pcgsClient.lookupCoin({
          pcgsNo: "7296",
          gradeNo: 12,
          plusGrade: false,
        });
        addCheck(
          "pcgs",
          "PCGS",
          pcgsProbe ? "verified" : "failed",
          pcgsProbe
            ? "PCGS bearer auth succeeded and returned a live grade probe."
            : "PCGS auth is configured, but the live grade probe did not return a coin match.",
        );
      } catch (error) {
        addCheck("pcgs", "PCGS", "failed", `PCGS live probe failed: ${formatError(error)}`);
      }
    }

    if (!AppConfig.discogsToken) {
      addCheck("discogs", "Discogs", "missing", "Discogs token is missing.");
    } else {
      try {
        const discogsProbe = await discogsClient.lookupVinyl({
          category: "vinyl",
          name: "Miles Davis - Kind of Blue",
          catalogNumber: "CL 1355",
          year: 1959,
          historySummary: "Readiness probe",
          searchKeywords: ["miles", "davis", "kind", "blue", "cl", "1355"],
          distinguishingFeatures: [],
        });
        addCheck(
          "discogs",
          "Discogs",
          discogsProbe ? "verified" : "failed",
          discogsProbe
            ? "Discogs returned a live vinyl pricing match."
            : "Discogs is configured, but no verified pricing match was returned for the live probe.",
        );
      } catch (error) {
        addCheck("discogs", "Discogs", "failed", `Discogs live probe failed: ${formatError(error)}`);
      }
    }

    if (!AppConfig.metalsApiKey) {
      addCheck("metals", "Metals API", "missing", "Metals API key is missing.");
    } else {
      try {
        const metalsProbe = await metalsClient.getSpotPrices();
        addCheck(
          "metals",
          "Metals API",
          metalsProbe ? "verified" : "failed",
          metalsProbe
            ? "Metals API returned current spot prices."
            : "Metals API is configured, but no spot prices were returned.",
        );
      } catch (error) {
        addCheck("metals", "Metals API", "failed", `Metals live probe failed: ${formatError(error)}`);
      }
    }

    if (!AppConfig.ebay.clientId || !AppConfig.ebay.clientSecret) {
      addCheck("ebay", "eBay", "missing", "eBay client credentials are missing.");
    } else {
      try {
        const { getEBayClient, ebayClient } = requireLegacyEBayClient();
        const client =
          ebayClient ??
          getEBayClient(
            AppConfig.ebay.clientId,
            AppConfig.ebay.clientSecret,
            AppConfig.ebay.campaignId,
          );
        const listings = await client.searchItems({
          keywords: "dragon carving box",
          category: "antique",
          limit: 3,
        });
        const failureReason = client.consumeLastFailureReason?.();
        if (failureReason) {
          const normalizedReason = failureReason.toLowerCase();
          const remediation = normalizedReason.includes("invalid_client")
            ? " Verify that EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are active production credentials for the same eBay app."
            : "";
          addCheck("ebay", "eBay", "failed", `eBay live probe failed: ${failureReason}.${remediation}`);
        } else {
          addCheck(
            "ebay",
            "eBay",
            "verified",
            listings.length > 0
              ? `eBay browse lookup returned ${listings.length} listing(s).`
              : "eBay browse lookup completed successfully (0 listings for probe query).",
          );
        }
      } catch (error) {
        addCheck("ebay", "eBay", "failed", `eBay live probe failed: ${formatError(error)}`);
      }
    }

    if (!firebaseConfigured || !projectReady) {
      addCheck(
        "persistence",
        "Firebase save/logs",
        "missing",
        "Firebase auth and scan-result persistence cannot be checked until Firebase is configured.",
      );
    } else {
      try {
        const { ensureAnonymousSession } = requireLegacyFirebaseAuth();
        const { getScanResult, saveFailedScanLog } = requireLegacyFirestoreDebug();
        const user = await ensureAnonymousSession();
        if (!user) {
          addCheck(
            "persistence",
            "Firebase save/logs",
            "failed",
            "Firebase anonymous auth is unavailable for the configured project.",
          );
          return {
            firebaseConfigured,
            firebaseProjectReady: projectReady,
            functionsConfigured: projectReady,
            searchIndexReady,
            geminiConfigured,
            remoteAnalysisReady: geminiVerified && searchIndexReady,
            verifiedAt,
            checks,
            messages: checks.map((check) => `${check.label}: ${check.message}`),
          };
        }
        const probeId = `probe-${Date.now()}`;
        const scannedAt = new Date().toISOString();
        const analysisLog: AnalysisLogDocument = {
          version: 1,
          createdAt: scannedAt,
          scanId: probeId,
          appraisalMode: "standard",
          categoryHint: "general",
          detectedCategory: null,
          itemName: "Readiness probe",
          finalSource: null,
          entries: [
            {
              at: scannedAt,
              elapsedMs: 0,
              kind: "save",
              title: "Readiness probe",
              message: "Verified Firebase auth, save, and readback paths.",
            },
          ],
          copyText: "VaultScope readiness probe",
        };
        await saveFailedScanLog({
          id: probeId,
          userId: user.uid,
          category: "general",
          images: [],
          analysisLog,
          scannedAt,
          errorSummary: "Readiness probe",
          failedStep: "saving",
        });
        const persistedProbe = await getScanResult(probeId);
        addCheck(
          "persistence",
          "Firebase save/logs",
          persistedProbe ? "verified" : "failed",
          persistedProbe
            ? "Anonymous auth, scan-result save, and log readback all succeeded."
            : "Firebase save succeeded, but readback could not be verified.",
        );
      } catch (error) {
        addCheck("persistence", "Firebase save/logs", "failed", `Firebase auth/save probe failed: ${formatError(error)}`);
      }
    }

    const remoteAnalysisReady = geminiVerified && searchIndexReady;

    return {
      firebaseConfigured,
      firebaseProjectReady: projectReady,
      functionsConfigured: projectReady,
      searchIndexReady,
      geminiConfigured,
      remoteAnalysisReady,
      verifiedAt,
      checks,
      messages: checks.map((check) => `${check.label}: ${check.message}`),
    };
  }
}
