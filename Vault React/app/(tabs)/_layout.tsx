import { Tabs } from "expo-router";
import React from "react";

import { VaultTabBar } from "@src/shared/navigation/VaultTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <VaultTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="scan" options={{ title: "Scan" }} />
      <Tabs.Screen name="vault" options={{ title: "Vault" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
