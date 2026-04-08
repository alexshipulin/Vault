import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootLayout from "@/app/_layout";
import TabsLayout from "@/app/(tabs)/_layout";
import { createAppContainer } from "@src/core/app/container";
import { seededItems } from "@src/data/seeds/seededItems";
import { clearVaultReactStorage, STORAGE_KEYS, writeJSON } from "@src/data/local/storage";

jest.mock("@src/core/app/AppProvider", () => ({
  AppProvider: ({ children }: React.PropsWithChildren) => <>{children}</>
}));

describe("app bootstrap and router smoke", () => {
  beforeEach(async () => {
    await clearVaultReactStorage();
    jest.resetModules();
  });

  it("renders the root and tabs layouts without crashing", () => {
    expect(() => render(<RootLayout />)).not.toThrow();
    expect(() =>
      render(
        <SafeAreaProvider>
          <TabsLayout />
        </SafeAreaProvider>
      ),
    ).not.toThrow();
  });

  it("seeds the collection only when the storage key is missing", async () => {
    const container = createAppContainer({
      environment: "mock",
      flags: {
        seedData: true,
        fastProcessing: false,
        clearData: false,
        skipOnboarding: true,
        remoteBackend: false,
        forceMockCamera: false
      }
    });

    await container.bootstrap();
    const seeded = await container.collectionRepository.fetchAll();

    expect(seeded).toHaveLength(seededItems.length);
  });

  it("does not reseed when the collection exists but is intentionally empty", async () => {
    await writeJSON(STORAGE_KEYS.collection, []);

    const container = createAppContainer({
      environment: "mock",
      flags: {
        seedData: true,
        fastProcessing: false,
        clearData: false,
        skipOnboarding: true,
        remoteBackend: false,
        forceMockCamera: false
      }
    });

    await container.bootstrap();
    const items = await container.collectionRepository.fetchAll();

    expect(items).toEqual([]);
  });

  it("defaults seedData to false and keeps remote disabled without full config", () => {
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            vaultRemoteBackend: "true"
          }
        }
      }
    }));

    const { currentRuntimeConfig } = require("@src/core/app/runtime") as typeof import("@src/core/app/runtime");
    const runtime = currentRuntimeConfig();

    expect(runtime.flags.seedData).toBe(false);
    expect(runtime.flags.remoteBackend).toBe(false);
  });

  it("builds the remote orchestrator without a local mock fallback when remote mode is ready", () => {
    jest.resetModules();
    jest.doMock("@/constants/Config", () => ({
      AppConfig: {
        flags: {
          remoteBackend: false,
        },
      },
      getRemoteReadinessStatus: () => ({
        isReady: true,
        missingConfig: [],
      }),
    }));

    let isolatedCreateAppContainer: typeof createAppContainer;
    jest.isolateModules(() => {
      ({ createAppContainer: isolatedCreateAppContainer } = require("@src/core/app/container") as typeof import("@src/core/app/container"));
    });

    const container = isolatedCreateAppContainer({
      environment: "production",
      flags: {
        seedData: false,
        fastProcessing: false,
        clearData: false,
        skipOnboarding: true,
        remoteBackend: true,
        forceMockCamera: false,
      },
    });

    expect(container.scanOrchestrator.constructor.name).toBe("RemoteScanOrchestrator");
  });
});
