describe("VaultScope mobile shell", () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
  });

  it("opens the scanner screen by default", async () => {
    await element(by.id("onboarding-start")).tap();
    await expect(element(by.id("scanner-title"))).toBeVisible();
  });

  it("navigates to the portfolio screen", async () => {
    await element(by.text("Portfolio")).tap();
    await expect(element(by.id("portfolio-title"))).toBeVisible();
  });

  it("navigates to the collection screen", async () => {
    await element(by.text("Collection")).tap();
    await expect(element(by.id("collection-title"))).toBeVisible();
  });

  it.skip("completes the full scan flow", async () => {
    await element(by.text("Scanner")).tap();
    await element(by.id("capture-button")).tap();
    await element(by.id("run-scan-button")).tap();
    await expect(element(by.text("Processing image..."))).toBeVisible();
  });

  it.skip("adds a scan to the collection", async () => {
    await element(by.id("run-scan-button")).tap();
    await expect(element(by.id("collection-list"))).toBeVisible();
  });

  it.skip("searches antique references from the collection flow", async () => {
    await element(by.text("Collection")).tap();
    await expect(element(by.id("collection-list"))).toBeVisible();
  });
});
