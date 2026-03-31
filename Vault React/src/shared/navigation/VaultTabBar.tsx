import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, borders, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: t("tab.home"), icon: "home-outline" },
  scan: { label: t("tab.scan"), icon: "scan-outline" },
  vault: { label: t("tab.vault"), icon: "grid-outline" },
  profile: { label: t("tab.profile"), icon: "person-outline" }
};

export function VaultTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
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
              color={focused ? colors.inverseForeground : colors.foreground}
              name={meta.icon}
              size={18}
            />
            <Text style={[styles.label, focused && styles.labelFocused]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.background
  },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault
  },
  itemFocused: {
    backgroundColor: colors.fillSelected,
    borderColor: colors.borderStrong
  },
  label: {
    ...textStyles.tabLabel,
    color: colors.foreground
  },
  labelFocused: {
    color: colors.inverseForeground
  }
});
