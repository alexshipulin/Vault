// Detox scaffold for the remote scan flow.
// This spec is intentionally not part of the current Jest/Expo test run.
// It becomes executable once Detox is installed and configured for Vault React.

import { by, device, element, expect, waitFor } from "detox";

describe("Remote Scan Flow", () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: {
        EXPO_PUBLIC_VAULT_REMOTE_BACKEND: "true",
        EXPO_PUBLIC_VAULT_FAST_PROCESSING: "true",
        EXPO_PUBLIC_VAULT_FORCE_MOCK_CAMERA: "true"
      }
    });
  });

  it("should complete scan with remote analysis", async () => {
    await expect(element(by.id("home.screen"))).toBeVisible();

    await element(by.id("home.startScanButton")).tap();
    await waitFor(element(by.id("scan.screen"))).toBeVisible().withTimeout(4000);

    await element(by.id("scan.captureButton")).tap();

    await waitFor(element(by.id("processing.screen"))).toBeVisible().withTimeout(2000);
    await expect(element(by.id("processing.step.objectRecognition"))).toBeVisible();
    await expect(element(by.id("processing.step.priceLookup"))).toBeVisible();
    await expect(element(by.id("processing.sourcesLine"))).toBeVisible();

    await waitFor(element(by.id("result.screen"))).toBeVisible().withTimeout(15000);
    await expect(element(by.id("result.title"))).toBeVisible();
    await expect(element(by.id("result.valueRange"))).toBeVisible();
  });
});
