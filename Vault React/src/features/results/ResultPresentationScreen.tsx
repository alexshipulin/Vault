import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ResultPresentationModel } from "@src/features/results/resultPresentation";
import { Screen } from "@src/shared/design-system/primitives";
import {
  getVaultTabBarHeight,
  TAB_BAR_BOTTOM_PADDING,
  TAB_BAR_HEIGHT,
  TAB_BAR_HORIZONTAL_PADDING,
  TAB_BAR_TOP_PADDING,
} from "@src/shared/navigation/VaultTabBar";
import { borders, colors, iconSize, spacing, textStyles } from "@src/shared/design-system/tokens";

const dividerColor = "#1A1A1A";
const mutedLabel = "#333333";
const mutedBody = "#666666";
const faintBody = "#444444";
const secondaryActionFill = "#0A0A0A";
export interface ResultPresentationAction {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  testID?: string;
}

export interface ResultPresentationTestIDs {
  screen?: string;
  headerTitle?: string;
  backButton?: string;
  headerShareButton?: string;
  image?: string;
  title?: string;
  subtitle?: string;
  confidence?: string;
  valueRange?: string;
  diagnostics?: string;
  summary?: string;
  disclaimer?: string;
  footerSecondaryAction?: string;
}

export interface ResultPresentationFooterAction {
  title: string;
  onPress: () => void;
  testID?: string;
}

function ResultMetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ActionTile({
  icon,
  title,
  onPress,
  selected = false,
  disabled = false,
  testID,
}: ResultPresentationAction) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.actionTile,
        selected ? styles.actionTileSelected : styles.actionTileSecondary,
        (pressed || disabled) && styles.actionTilePressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSize.sm}
        color={selected ? colors.inverseForeground : colors.foreground}
      />
      <Text style={[styles.actionTileText, selected && styles.actionTileTextSelected]}>{title}</Text>
    </Pressable>
  );
}

export function ResultPresentationScreen({
  headerTitle,
  model,
  onBack,
  onHeaderShare,
  actions,
  footerSecondaryAction,
  testIDs,
  emptyStateText = "Item unavailable.",
}: {
  headerTitle: string;
  model: ResultPresentationModel | null;
  onBack: () => void;
  onHeaderShare?: () => void;
  actions: ResultPresentationAction[];
  footerSecondaryAction?: ResultPresentationFooterAction;
  testIDs?: ResultPresentationTestIDs;
  emptyStateText?: string;
}) {
  const insets = useSafeAreaInsets();

  if (!model) {
    return (
      <Screen testID={testIDs?.screen}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{emptyStateText}</Text>
        </View>
      </Screen>
    );
  }

  const showConfidence = typeof model.confidence === "number";
  const showDiagnostics = model.diagnostics.length > 0;
  const footerPaddingBottom = Math.max(TAB_BAR_BOTTOM_PADDING, insets.bottom);
  const footerReservedHeight = getVaultTabBarHeight(insets.bottom);

  return (
    <Screen edges={["top", "left", "right"]} testID={testIDs?.screen}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xl + footerReservedHeight }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={onBack} style={styles.headerAction} testID={testIDs?.backButton}>
              <Ionicons color={colors.foreground} name="chevron-back" size={iconSize.lg} />
            </Pressable>
            <Text style={styles.headerTitle} testID={testIDs?.headerTitle}>
              {headerTitle}
            </Text>
            {onHeaderShare ? (
              <Pressable
                onPress={onHeaderShare}
                style={[styles.headerAction, styles.headerActionRight]}
                testID={testIDs?.headerShareButton}
              >
                <Ionicons color={colors.foreground} name="share-outline" size={iconSize.md} />
              </Pressable>
            ) : (
              <View style={[styles.headerAction, styles.headerActionRight]} />
            )}
          </View>

          <View style={styles.hero} testID={testIDs?.image}>
            {model.imageUri ? (
              <Image source={{ uri: model.imageUri }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroFallbackText}>{model.fallbackText}</Text>
              </View>
            )}
          </View>

          <View style={styles.contentSection}>
            <Text style={styles.itemTitle} testID={testIDs?.title}>
              {model.title}
            </Text>
            <Text style={styles.itemSubtitle} testID={testIDs?.subtitle}>
              {model.subtitle}
            </Text>

            <View style={styles.metaRow}>
              <ResultMetaItem label="ORIGIN" value={model.originText} />
              <ResultMetaItem label="ERA" value={model.eraText} />
              <ResultMetaItem label="CONDITION" value={model.conditionText} />
            </View>
          </View>

          <View style={styles.divider} />

          {showConfidence ? (
            <>
              <View style={styles.confidenceRow}>
                <Text style={styles.blockLabel}>{model.confidenceLabel ?? "CONFIDENCE"}</Text>
                <View style={styles.confidenceRight}>
                  <View style={styles.confidenceTrack}>
                    <View
                      style={[
                        styles.confidenceFill,
                        { width: `${Math.max(0, Math.min((model.confidence ?? 0) * 100, 100))}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.confidenceValue} testID={testIDs?.confidence}>
                    {Math.round((model.confidence ?? 0) * 100)}%
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />
            </>
          ) : null}

          <View style={styles.valueBlock}>
            <View style={styles.valueLeft}>
              <Text style={styles.blockLabel}>ESTIMATED VALUE</Text>
              <Text style={styles.valueRange} testID={testIDs?.valueRange}>
                {model.valueText}
              </Text>
            </View>
            <View style={styles.valueRight}>
              <Text style={styles.valueSource}>{model.sourceText}</Text>
              <Text style={styles.valueUpdated}>{model.updatedText}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {showDiagnostics ? (
            <>
              <View style={styles.diagnosticBlock} testID={testIDs?.diagnostics}>
                <Text style={styles.blockLabel}>VALUATION CHECKS</Text>
                {model.diagnostics.map((item, index) => (
                  <Text key={`${index}-${item}`} style={styles.diagnosticText}>
                    {item}
                  </Text>
                ))}
              </View>

              <View style={styles.divider} />
            </>
          ) : null}

          <View style={styles.summaryBlock}>
            <Text style={styles.blockLabel}>AI SUMMARY</Text>
            <Text style={styles.summaryText} testID={testIDs?.summary}>
              {model.summaryText}
            </Text>
          </View>

          {footerSecondaryAction ? (
            <View style={styles.scrollSecondaryActionWrap}>
              <Pressable
                onPress={footerSecondaryAction.onPress}
                style={({ pressed }) => [styles.footerSecondaryAction, pressed && styles.footerSecondaryActionPressed]}
                testID={footerSecondaryAction.testID ?? testIDs?.footerSecondaryAction}
              >
                <Text style={styles.footerSecondaryActionText}>{footerSecondaryAction.title}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              height: footerReservedHeight,
              paddingBottom: footerPaddingBottom,
            },
          ]}
        >
          <View style={styles.actionsPill}>
            {actions.map((action, index) => (
              <ActionTile key={`${action.title}-${index}`} {...action} />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    backgroundColor: colors.background,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  emptyStateText: {
    ...textStyles.body,
    color: colors.foregroundMuted,
  },
  headerRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerAction: {
    width: 24,
    height: 24,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerActionRight: {
    alignItems: "flex-end",
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
  },
  hero: {
    width: "100%",
    height: 220,
    backgroundColor: colors.surface,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
  },
  heroFallbackText: {
    color: colors.foreground,
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  contentSection: {
    minHeight: 116,
    paddingTop: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
  },
  itemTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
  },
  itemSubtitle: {
    marginTop: 4,
    color: mutedBody,
    fontSize: 12,
    fontWeight: "400",
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  metaItem: {
    flexShrink: 1,
    gap: 4,
  },
  metaLabel: {
    color: mutedLabel,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    lineHeight: 8,
  },
  metaValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 12,
  },
  divider: {
    height: borders.hairline,
    backgroundColor: dividerColor,
  },
  confidenceRow: {
    height: 44,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockLabel: {
    color: mutedLabel,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  confidenceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confidenceTrack: {
    width: 80,
    height: 2,
    backgroundColor: dividerColor,
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: colors.foreground,
  },
  confidenceValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "500",
  },
  valueBlock: {
    height: 72,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueLeft: {
    gap: 4,
    flexShrink: 1,
  },
  valueRange: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "300",
  },
  valueRight: {
    alignItems: "flex-end",
    gap: 4,
    paddingLeft: spacing.md,
  },
  valueSource: {
    color: faintBody,
    fontSize: 9,
    fontWeight: "400",
  },
  valueUpdated: {
    color: mutedLabel,
    fontSize: 9,
    fontWeight: "400",
  },
  summaryBlock: {
    paddingTop: 20,
    paddingHorizontal: spacing.lg,
  },
  diagnosticBlock: {
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  diagnosticText: {
    color: "#777777",
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 18,
  },
  summaryText: {
    marginTop: 10,
    color: "#888888",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 20,
  },
  scrollSecondaryActionWrap: {
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  actionsPill: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#0A0A0A",
    borderWidth: borders.hairline,
    borderColor: "#222222",
    padding: 4,
  },
  actionTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  actionTileSelected: {
    backgroundColor: colors.foreground,
  },
  actionTileSecondary: {
    backgroundColor: secondaryActionFill,
  },
  actionTilePressed: {
    opacity: 0.88,
  },
  actionTileText: {
    color: colors.foreground,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  actionTileTextSelected: {
    color: colors.inverseForeground,
  },
  disclaimerWrap: {
    paddingTop: 16,
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
  disclaimer: {
    color: "#2A2A2A",
    fontSize: 10,
    fontWeight: "400",
    lineHeight: 16,
  },
  footerSecondaryAction: {
    alignSelf: "center",
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  footerSecondaryActionPressed: {
    opacity: 0.6,
  },
  footerSecondaryActionText: {
    color: "#6A6A6A",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  footer: {
    justifyContent: "flex-end",
    backgroundColor: colors.background,
    paddingTop: TAB_BAR_TOP_PADDING,
    paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
    paddingBottom: TAB_BAR_BOTTOM_PADDING,
  },
});
