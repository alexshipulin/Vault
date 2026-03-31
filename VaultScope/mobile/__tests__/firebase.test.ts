const mockCollection = jest.fn((...args) => ({ type: "collection", args }));
const mockDoc = jest.fn((...args) => ({ id: "generated-id", type: "doc", args }));
const mockWhere = jest.fn((...args) => ({ type: "where", args }));
const mockOrderBy = jest.fn((...args) => ({ type: "orderBy", args }));
const mockQuery = jest.fn((...args) => ({ type: "query", args }));
const mockSetDoc = jest.fn();
const mockServerTimestamp = jest.fn(() => "server-timestamp");
const mockRef = jest.fn((...args) => ({ type: "storageRef", args }));
const mockUploadString = jest.fn();
const mockGetDownloadURL = jest.fn();

jest.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
}));

jest.mock("firebase/storage", () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  uploadString: (...args: unknown[]) => mockUploadString(...args),
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeDb: jest.fn(() => "db"),
  getVaultScopeStorage: jest.fn(() => "storage"),
}));

import { saveScanResult } from "@/lib/firebase/firestore";
import { uploadScanImage } from "@/lib/firebase/storage";
import { buildFirestoreQuery } from "@/lib/firebase/utils";

describe("Firebase helpers", () => {
  beforeEach(() => {
    mockSetDoc.mockResolvedValue(undefined);
    mockUploadString.mockResolvedValue(undefined);
    mockGetDownloadURL.mockResolvedValue("https://cdn.vaultscope.test/scans/item.jpg");
  });

  it("builds Firestore keyword queries with filters", () => {
    buildFirestoreQuery(["victorian", "chair"], {
      category: "furniture",
      priceMin: 100,
      priceMax: 900,
      period: "Victorian",
    });

    expect(mockWhere).toHaveBeenCalledWith("keywords", "array-contains-any", [
      "victorian",
      "chair",
    ]);
    expect(mockWhere).toHaveBeenCalledWith("category", "==", "furniture");
    expect(mockWhere).toHaveBeenCalledWith("priceRealized", ">=", 100);
    expect(mockWhere).toHaveBeenCalledWith("priceRealized", "<=", 900);
    expect(mockWhere).toHaveBeenCalledWith("period", "==", "Victorian");
    expect(mockOrderBy).toHaveBeenCalledWith("priceRealized", "desc");
    expect(mockQuery).toHaveBeenCalled();
  });

  it("saves scan results with merge semantics", async () => {
    await saveScanResult({
      userId: "user-123",
      category: "antique",
      images: ["https://cdn.vaultscope.test/a.jpg"],
      identification: {
        category: "antique",
        name: "Victorian chair",
        year: 1880,
        origin: "England",
        condition: "very_good",
        conditionRange: ["good", "fine"],
        historySummary: "Late Victorian side chair.",
        confidence: 0.84,
        searchKeywords: ["victorian chair"],
        distinguishingFeatures: ["turned legs"],
      },
      priceEstimate: {
        low: 480,
        high: 780,
        currency: "USD",
        confidence: 0.74,
      },
      scannedAt: "2026-03-31T00:00:00.000Z",
    });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: "generated-id" }),
      expect.objectContaining({
        userId: "user-123",
        category: "antique",
        images: ["https://cdn.vaultscope.test/a.jpg"],
        scannedAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "server-timestamp",
      }),
      { merge: true },
    );
  });

  it("uploads base64 images and returns a download URL", async () => {
    const url = await uploadScanImage("user-123", "data:image/png;base64,abc123");

    expect(mockRef).toHaveBeenCalledWith("storage", expect.stringContaining("scans/user-123/"));
    expect(mockUploadString).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storageRef" }),
      "abc123",
      "base64",
      { contentType: "image/png" },
    );
    expect(url).toBe("https://cdn.vaultscope.test/scans/item.jpg");
  });
});
