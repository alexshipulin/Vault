import type { MockCaptureService as MockCaptureServiceContract } from "@src/domain/contracts";
import type { ScanImage, ScanMode } from "@src/domain/models";
import { mockCapturedImage } from "@src/data/seeds/mockCapturedImage";

export class MockCaptureService implements MockCaptureServiceContract {
  async capture(mode: ScanMode): Promise<ScanImage> {
    return mockCapturedImage(mode);
  }
}
