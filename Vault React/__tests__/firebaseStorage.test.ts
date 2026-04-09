const mockGetDownloadURL = jest.fn();
const mockRef = jest.fn();
const mockUploadString = jest.fn();
const mockUploadBytes = jest.fn();
const mockGetVaultScopeStorage = jest.fn(() => ({ app: "vaultscope-storage" }));

jest.mock("firebase/storage", () => ({
  getDownloadURL: (...args: unknown[]) => mockGetDownloadURL(...args),
  ref: (...args: unknown[]) => mockRef(...args),
  uploadString: (...args: unknown[]) => mockUploadString(...args),
  uploadBytes: (...args: unknown[]) => mockUploadBytes(...args),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeStorage: () => mockGetVaultScopeStorage(),
}));

describe("uploadScanImage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRef.mockImplementation((_storage: unknown, path: string) => ({ path }));
    mockGetDownloadURL.mockResolvedValue("https://example.com/uploaded.jpg");
    mockUploadString.mockResolvedValue(undefined);
    mockUploadBytes.mockResolvedValue(undefined);
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("uploads base64 directly when uploadString succeeds", async () => {
    const { uploadScanImage } = require("@/lib/firebase/storage") as typeof import("@/lib/firebase/storage");
    const url = await uploadScanImage("user-1", "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==");

    expect(url).toBe("https://example.com/uploaded.jpg");
    expect(mockUploadString).toHaveBeenCalledTimes(1);
    expect(mockUploadString).toHaveBeenCalledWith(
      expect.any(Object),
      "ZmFrZS1pbWFnZQ==",
      "base64",
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
    expect(mockUploadBytes).not.toHaveBeenCalled();
  });

  it("falls back to blob upload when uploadString fails with ArrayBuffer blob error", async () => {
    const unsupportedBlobError = new Error(
      "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported",
    );
    mockUploadString.mockRejectedValueOnce(unsupportedBlobError);
    mockUploadString.mockRejectedValueOnce(unsupportedBlobError);
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue("native-blob"),
    }) as unknown as typeof fetch;

    const { uploadScanImage } = require("@/lib/firebase/storage") as typeof import("@/lib/firebase/storage");
    const url = await uploadScanImage(
      "user-1",
      "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==",
      "file:///tmp/local-image.jpg",
    );

    expect(url).toBe("https://example.com/uploaded.jpg");
    expect(mockUploadString).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith("file:///tmp/local-image.jpg");
    expect(mockUploadBytes).toHaveBeenCalledTimes(1);
    expect(mockUploadBytes).toHaveBeenCalledWith(
      expect.any(Object),
      "native-blob",
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });
});
