import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borders, colors } from "@src/shared/design-system/tokens";
import { getVaultTabBarHeight, VaultTabBar } from "@src/shared/navigation/VaultTabBar";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      tabBar={(props) => <VaultTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: borders.hairline,
          borderTopColor: colors.borderDefault,
          height: getVaultTabBarHeight(insets.bottom),
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarStyle: { display: "none" }
        }}
      />
      <Tabs.Screen name="vault" options={{ title: "Vault" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
