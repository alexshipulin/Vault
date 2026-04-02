import type { CollectibleItem } from "@src/domain/models";

function isoDate(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

export const seededItems: CollectibleItem[] = [
  {
    id: "coin-1909-vdb",
    name: "1909-S VDB Lincoln Cent",
    category: "coin",
    conditionRaw: 7,
    year: 1909,
    origin: "United States",
    notes: "",
    photoUris: [],
    priceLow: 950,
    priceMid: 1100,
    priceHigh: 1250,
    priceSource: "pcgs",
    priceFetchedAt: isoDate(1),
    historySummary:
      "The 1909-S VDB Lincoln cent is one of the most collected key dates in the Lincoln series.",
    addedAt: isoDate(2),
    updatedAt: isoDate(1),
    isSyncedToCloud: false
  },
  {
    id: "blue-note-first-press",
    name: "Blue Note First Press LP",
    category: "vinyl",
    conditionRaw: 3,
    year: 1958,
    origin: "United States",
    notes: "",
    photoUris: [],
    priceLow: 180,
    priceMid: 260,
    priceHigh: 390,
    priceSource: "discogs",
    priceFetchedAt: isoDate(3),
    historySummary:
      "Blue Note first pressings remain highly collectible because label variation and runout markings can signal scarce early issues.",
    addedAt: isoDate(5),
    updatedAt: isoDate(3),
    isSyncedToCloud: false
  }
];
