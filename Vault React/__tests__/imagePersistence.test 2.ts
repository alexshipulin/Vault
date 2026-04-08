const mockCopyAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn(() => Promise.resolve());

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///documents/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  copyAsync: mockCopyAsync,
  writeAsStringAsync: mockWriteAsStringAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  default: {
    documentDirectory: "file:///documents/",
    cacheDirectory: "file:///cache/",
    EncodingType: { Base64: "base64" },
    copyAsync: mockCopyAsync,
    writeAsStringAsync: mockWriteAsStringAsync,
    makeDirectoryAsync: mockMakeDirectoryAsync
  }
}));

import { LocalImagePersistenceService } from "@src/data/local/LocalImagePersistenceService";

describe("LocalImagePersistenceService", () => {
  beforeEach(() => {
    mockCopyAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockMakeDirectoryAsync.mockClear();
    jest.restoreAllMocks();
  });

  it("returns the original uri when file copy fails", async () => {
    mockCopyAsync.mockRejectedValueOnce(new Error("copy failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new LocalImagePersistenceService();

    const [persistedUri] = await service.persistImages([
      { id: "capture-1", uri: "file:///tmp/original.jpg", mimeType: "image/jpeg" }
    ]);

    expect(persistedUri).toBe("file:///tmp/original.jpg");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns the original uri when base64 write fails", async () => {
    mockWriteAsStringAsync.mockRejectedValueOnce(new Error("write failed"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new LocalImagePersistenceService();

    const [persistedUri] = await service.persistImages([
      {
        id: "capture-2",
        uri: "mock://capture.jpg",
        mimeType: "image/jpeg",
        base64: "ZmFrZQ=="
      }
    ]);

    expect(persistedUri).toBe("mock://capture.jpg");
    expect(warnSpy).toHaveBeenCalled();
  });
});
