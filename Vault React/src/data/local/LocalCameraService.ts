import type { CameraService } from "@src/domain/contracts";
import type { ScanImage, ScanMode } from "@src/domain/models";
import { mockCapturedImage } from "@src/test/fixtures/mockData";

export class LocalCameraService implements CameraService {
  constructor(private readonly forceMockCamera = false) {}

  async requestPermission(): Promise<boolean> {
    return true;
  }

  async captureMockImage(mode: ScanMode): Promise<ScanImage> {
    if (this.forceMockCamera) {
      return mockCapturedImage(mode);
    }

    return mockCapturedImage(mode);
  }
}
