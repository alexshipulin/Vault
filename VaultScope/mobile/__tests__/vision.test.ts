const mockManipulateAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockScanFromURLAsync = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: {
    JPEG: "jpeg",
  },
}));

jest.mock("expo-file-system", () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: {
    Base64: "base64",
  },
}));

jest.mock("expo-camera", () => ({
  Camera: {
    scanFromURLAsync: (...args: unknown[]) => mockScanFromURLAsync(...args),
  },
}));

import { VisionProcessor } from "@/lib/vision/processor";
import { ImageOptimizer } from "@/lib/vision/optimizer";

describe("Vision pipeline", () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
    mockGetInfoAsync.mockReset();
    mockReadAsStringAsync.mockReset();
    mockScanFromURLAsync.mockReset();
  });

  it("compresses images until they fit under the target size", async () => {
    const optimizer = new ImageOptimizer();
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 3 * 1024 * 1024 })
      .mockResolvedValueOnce({ exists: true, size: 1.5 * 1024 * 1024 });
    mockManipulateAsync.mockResolvedValue({
      uri: "file://compressed.jpg",
      width: 1200,
      height: 900,
    });

    const result = await optimizer.compressImage("file://large.jpg", 2);

    expect(result).toBe("file://compressed.jpg");
    expect(mockManipulateAsync).toHaveBeenCalled();
  });

  it("converts optimized images to base64", async () => {
    const optimizer = new ImageOptimizer();
    mockReadAsStringAsync.mockResolvedValue("ZmFrZS1iYXNlNjQ=");

    const result = await optimizer.convertToBase64("file://optimized.jpg");

    expect(result).toBe("ZmFrZS1iYXNlNjQ=");
  });

  it("processes an image through crop, OCR, barcode, and optimization stages", async () => {
    const optimizer = {
      convertToBase64: jest.fn().mockResolvedValue("base64-image"),
    } as unknown as ImageOptimizer;
    const processor = new VisionProcessor(optimizer);

    jest.spyOn(processor, "cropToObject").mockResolvedValue("file://cropped.jpg");
    jest.spyOn(processor, "extractText").mockResolvedValue("STERLING");
    jest.spyOn(processor, "detectBarcode").mockResolvedValue([
      { type: "ean13", data: "1234567890123" },
    ]);
    jest.spyOn(processor, "optimizeForUpload").mockResolvedValue("file://optimized.jpg");

    const result = await processor.processImage("file://original.jpg");

    expect(result).toEqual({
      originalUri: "file://original.jpg",
      croppedUri: "file://cropped.jpg",
      optimizedUri: "file://optimized.jpg",
      base64: "base64-image",
      text: "STERLING",
      barcodes: [{ type: "ean13", data: "1234567890123" }],
    });
  });
});
