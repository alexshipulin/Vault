import type { MockScanResultFactory } from "@src/domain/contracts";
import type {
  CollectibleCategory,
  PriceSource,
  ScanResult,
  TemporaryScanSession
} from "@src/domain/models";
import { createID } from "@src/shared/utils/id";

type ResultTemplate = {
  category: CollectibleCategory;
  name: string;
  year: number;
  origin: string;
  condition: number;
  conditionRangeLow: number;
  conditionRangeHigh: number;
  confidence: number;
  source: PriceSource;
  sourceLabel: string;
  low: number;
  mid: number;
  high: number;
  historySummary: string;
};

const STANDARD_TEMPLATES: ResultTemplate[] = [
  {
    category: "coin",
    name: "1909-S VDB Lincoln Cent",
    year: 1909,
    origin: "United States",
    condition: 7,
    conditionRangeLow: 6,
    conditionRangeHigh: 8,
    confidence: 0.94,
    source: "pcgs",
    sourceLabel: "Based on recent PCGS guide references and collector market activity.",
    low: 950,
    mid: 1100,
    high: 1250,
    historySummary:
      "The 1909-S VDB Lincoln cent is one of the key dates in the Lincoln series. Its low original mintage and iconic reverse initials keep collector demand elevated."
  },
  {
    category: "card",
    name: "1986 Fleer Michael Jordan Rookie",
    year: 1986,
    origin: "United States",
    condition: 5,
    conditionRangeLow: 4,
    conditionRangeHigh: 7,
    confidence: 0.91,
    source: "ebay",
    sourceLabel: "Based on recent marketplace sales and collector pricing references.",
    low: 4200,
    mid: 5600,
    high: 7100,
    historySummary:
      "The 1986 Fleer Michael Jordan rookie remains one of the most recognizable basketball cards in the hobby. Demand stays strongest when centering and surface quality support grading."
  }
];

const MYSTERY_TEMPLATES: ResultTemplate[] = [
  {
    category: "antique",
    name: "Victorian Silver Tea Caddy",
    year: 1885,
    origin: "England",
    condition: 4,
    conditionRangeLow: 3,
    conditionRangeHigh: 5,
    confidence: 0.86,
    source: "antiqueDB",
    sourceLabel: "Based on dealer references and estate sale archives.",
    low: 700,
    mid: 980,
    high: 1280,
    historySummary:
      "Victorian tea caddies were both decorative and functional objects in upper-middle-class households. Surviving examples with intact metalwork remain attractive to collectors of British domestic antiques."
  },
  {
    category: "vinyl",
    name: "Blue Note First Press LP",
    year: 1958,
    origin: "United States",
    condition: 3,
    conditionRangeLow: 2,
    conditionRangeHigh: 4,
    confidence: 0.88,
    source: "discogs",
    sourceLabel: "Based on Discogs sale history and collector marketplace comps.",
    low: 180,
    mid: 260,
    high: 390,
    historySummary:
      "Blue Note first pressings are closely tracked for label variation, ear marks, and sleeve condition. Even partial identifiers can place a record within a collectible pressing window."
  }
];

function checksum(session: TemporaryScanSession): number {
  return session.capturedImages.reduce((running, image) => running + image.uri.length + (image.base64?.length ?? 0), 0);
}

export class LocalMockScanResultFactory implements MockScanResultFactory {
  buildResult(session: TemporaryScanSession): ScanResult {
    const templates = session.mode === "mystery" ? MYSTERY_TEMPLATES : STANDARD_TEMPLATES;
    const template = templates[checksum(session) % templates.length];

    return {
      id: createID("result"),
      category: template.category,
      name: template.name,
      year: template.year,
      origin: template.origin,
      condition: template.condition,
      conditionRangeLow: template.conditionRangeLow,
      conditionRangeHigh: template.conditionRangeHigh,
      historySummary: template.historySummary,
      confidence: template.confidence,
      priceData: {
        low: template.low,
        mid: template.mid,
        high: template.high,
        currency: "USD",
        source: template.source,
        sourceLabel: template.sourceLabel,
        fetchedAt: session.createdAt,
        comparables: []
      },
      rawAIResponse: JSON.stringify({ mock: true, mode: session.mode, checksum: checksum(session) }),
      scannedAt: session.createdAt,
      inputImageHashes: session.capturedImages.map((image, index) => `scan-${index}-${checksum(session)}-${image.uri.length}`)
    };
  }
}
