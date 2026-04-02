import { router } from "expo-router";
import React from "react";

import { EmptyState, Screen } from "@src/shared/design-system/primitives";

export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState
        title="Route not found"
        message="This route is not part of the migrated Vault React flow."
        actionTitle="Go Home"
        onAction={() => router.replace("/")}
      />
    </Screen>
  );
}
