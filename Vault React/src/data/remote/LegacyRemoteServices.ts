/* eslint-disable @typescript-eslint/no-require-imports */
import { AppConfig, hasRemoteConfig } from "@/constants/Config";
import type { AnalysisService, AppReadinessService, RemoteSearchService } from "@src/domain/contracts";
import type { AppReadinessReport, CollectibleItem, ScanResult, TemporaryScanSession } from "@src/domain/models";

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
    executeScan: (images: string[], category: string) => Promise<{
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
      }[];
      identification: {
        category: string;
        name: string;
        year?: number | null;
        origin?: string | null;
        condition: string;
        conditionRange: [string, string];
        historySummary: string;
        confidence: number;
      };
      priceEstimate: {
        low?: number | null;
        high?: number | null;
        currency: string;
      };
    }>;
  };
} {
  return require("@/lib/scan/pipeline") as {
    ScanPipeline: new () => {
      executeScan: (images: string[], category: string) => Promise<{
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
        }[];
        identification: {
          category: string;
          name: string;
          year?: number | null;
          origin?: string | null;
          condition: string;
          conditionRange: [string, string];
          historySummary: string;
          confidence: number;
        };
        priceEstimate: {
          low?: number | null;
          high?: number | null;
          currency: string;
        };
      }>;
    };
  };
}

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
  if (input.includes("vinyl") || input.includes("record")) {
    return "vinyl";
  }
  if (input.includes("card")) {
    return "card";
  }
  if (input.includes("antique")) {
    return "antique";
  }

  return "coin";
}

export class LegacyRemoteAnalysisService implements AnalysisService {
  async isConfigured(): Promise<boolean> {
    return hasRemoteConfig();
  }

  async runAnalysis(session: TemporaryScanSession): Promise<ScanResult> {
    const { ScanPipeline } = requireLegacyScanPipeline();
    const pipeline = new ScanPipeline();
    const remote = await pipeline.executeScan(
      session.capturedImages.map((image) => image.uri),
      session.mode === "mystery" ? "general" : "coin"
    );

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
      priceData: {
        low: remote.priceEstimate.low ?? 0,
        mid:
          typeof remote.priceEstimate.low === "number" && typeof remote.priceEstimate.high === "number"
            ? (remote.priceEstimate.low + remote.priceEstimate.high) / 2
            : remote.priceEstimate.high ?? remote.priceEstimate.low ?? 0,
        high: remote.priceEstimate.high ?? remote.priceEstimate.low ?? 0,
        currency: remote.priceEstimate.currency,
        source: "aiEstimate",
        sourceLabel: "Mapped from legacy Gemini + auction search pipeline",
        fetchedAt: remote.scannedAt,
        comparables: remote.comparableAuctions.slice(0, 5).map((item) => ({
          id: item.id,
          title: item.title,
          price: item.priceRealized ?? item.estimateHigh ?? item.estimateLow ?? 0,
          soldAt: item.saleDate ?? remote.scannedAt,
          sourceURL: item.imageUrl
        }))
      },
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
          confidence: 0.5
        },
        customNotes: item.historySummary,
        addedAt: item.addedAt
      });
      return true;
    } catch {
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

    return {
      firebaseConfigured,
      firebaseProjectReady: projectReady,
      functionsConfigured: projectReady,
      searchIndexReady,
      geminiConfigured: Boolean(AppConfig.geminiApiKey),
      remoteAnalysisReady,
      messages: [
        firebaseConfigured ? "Firebase config detected" : "Firebase config missing",
        searchIndexReady ? "Auction search returned results" : "Auction search could not be verified",
        remoteAnalysisReady ? "Remote analysis service configured" : "Remote analysis service not ready"
      ]
    };
  }
}
