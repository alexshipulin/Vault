import type {
  CollectibleCategory,
  PriceData,
  PriceSource,
  ScanMode,
  ScanResult,
  TemporaryScanSession
} from "@src/domain/models";
import { mockCapturedImage } from "@src/data/seeds/mockCapturedImage";
import { createID } from "@src/shared/utils/id";

export function seededTemporarySession(mode: ScanMode = "standard"): TemporaryScanSession {
  return {
    id: createID("session"),
    mode,
    capturedImages: [
      {
        id: createID("image"),
        uri: "file:///mock/capture.jpg",
        mimeType: "image/jpeg",
        base64: "bW9jay1jYXB0dXJl"
      }
    ],
    createdAt: new Date().toISOString()
  };
}

export function seededPriceData(source: PriceSource = "pcgs"): PriceData {
  return {
    low: 950,
    mid: 1100,
    high: 1250,
    currency: "USD",
    source,
    sourceLabel: "Based on recent reference sales and collector market activity.",
    fetchedAt: new Date().toISOString(),
    comparables: []
  };
}

export function seededScanResult(
  category: CollectibleCategory = "coin",
  mode: ScanMode = "standard"
): ScanResult {
  const name =
    mode === "mystery"
      ? category === "antique"
        ? "Victorian Silver Tea Caddy"
        : "Blue Note First Press LP"
      : category === "card"
        ? "1986 Fleer Michael Jordan Rookie"
        : "1909-S VDB Lincoln Cent";

  return {
    id: createID("result"),
    category,
    name,
    year: category === "antique" ? 1885 : category === "vinyl" ? 1958 : category === "card" ? 1986 : 1909,
    origin: category === "antique" ? "England" : "United States",
    condition: mode === "mystery" ? 4 : 7,
    conditionRangeLow: mode === "mystery" ? 3 : 6,
    conditionRangeHigh: mode === "mystery" ? 5 : 8,
    historySummary:
      category === "antique"
        ? "Victorian tea caddies were decorative and functional objects in upper-middle-class households."
        : "This collectible remains heavily tracked by collectors because scarcity and condition drive value sharply.",
    confidence: mode === "mystery" ? 0.87 : 0.94,
    priceData: seededPriceData(category === "vinyl" ? "discogs" : category === "antique" ? "antiqueDB" : "pcgs"),
    rawAIResponse: JSON.stringify({ mock: true, mode, category }),
    scannedAt: new Date().toISOString(),
    inputImageHashes: [`${category}-${mode}-hash`]
  };
}

export { mockCapturedImage };
