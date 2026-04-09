import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, borders, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_TOP_PADDING = 12;
export const TAB_BAR_HORIZONTAL_PADDING = 21;
export const TAB_BAR_BOTTOM_PADDING = 21;

export function getVaultTabBarHeight(bottomInset: number) {
  return TAB_BAR_TOP_PADDING + TAB_BAR_HEIGHT + Math.max(TAB_BAR_BOTTOM_PADDING, bottomInset);
}

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: t("tab.home"), icon: "home-outline" },
  scan: { label: t("tab.scan"), icon: "scan-outline" },
  vault: { label: t("tab.vault"), icon: "grid-outline" },
  profile: { label: t("tab.profile"), icon: "person-outline" }
};

export function VaultTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(TAB_BAR_BOTTOM_PADDING, insets.bottom);
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;
  const flattenedTabBarStyle = StyleSheet.flatten(
    focusedOptions?.tabBarStyle as object | object[] | undefined
  ) as { display?: string } | undefined;

  if (flattenedTabBarStyle?.display === "none") {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: bottomPadding,
          height: getVaultTabBarHeight(insets.bottom),
        }
      ]}
    >
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] ?? TAB_META.index;

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={[styles.item, focused && styles.itemFocused]}
              testID={`tab.${route.name === "index" ? "home" : route.name}`}
            >
              <Ionicons
                color={focused ? colors.inverseForeground : colors.foregroundSubtle}
                name={meta.icon}
                size={18}
              />
              <Text style={[styles.label, focused && styles.labelFocused]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
    paddingTop: TAB_BAR_TOP_PADDING,
    justifyContent: "flex-end",
    backgroundColor: colors.background,
  },
  pill: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    backgroundColor: "#0A0A0A",
    borderWidth: borders.hairline,
    borderColor: "#222222",
    padding: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  itemFocused: {
    backgroundColor: colors.fillSelected,
  },
  label: {
    ...textStyles.tabLabel,
    color: "#555555"
  },
  labelFocused: {
    color: colors.inverseForeground
  }
});
