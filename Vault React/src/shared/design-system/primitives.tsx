import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CollectibleListItem, ProcessingStageStatus, ScanMode } from "@src/domain/models";
import { colors, borders, iconSize, spacing, textStyles } from "@src/shared/design-system/tokens";

export function Screen({
  children,
  testID
}: React.PropsWithChildren<{ testID?: string }>) {
  return (
    <SafeAreaView style={styles.screen} testID={testID}>
      {children}
    </SafeAreaView>
  );
}

export function ScrollScreen({
  children,
  testID
}: React.PropsWithChildren<{ testID?: string }>) {
  return (
    <Screen testID={testID}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  testID
}: {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.headerWrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerActionSlot}>{leftAction}</View>
        <View style={styles.headerTitleWrap}>
          <Text style={[textStyles.screenTitle, styles.headerTitle]} testID={testID}>
            {title}
          </Text>
        </View>
        <View style={[styles.headerActionSlot, styles.headerActionRight]}>{rightAction}</View>
      </View>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function HeaderAction({
  icon,
  label,
  onPress,
  testID
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.headerAction} testID={testID}>
      {icon ? (
        <Ionicons color={colors.foreground} name={icon} size={iconSize.sm} />
      ) : (
        <Text style={styles.headerActionLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Panel({ children, testID }: React.PropsWithChildren<{ testID?: string }>) {
  return (
    <View style={styles.panel} testID={testID}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: React.PropsWithChildren) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function SegmentedModeSwitch({
  value,
  onChange,
  testPrefix
}: {
  value: ScanMode;
  onChange: (mode: ScanMode) => void;
  testPrefix: string;
}) {
  return (
    <View style={styles.segmented}>
      {(["standard", "mystery"] as const).map((mode, index) => {
        const selected = value === mode;
        return (
          <React.Fragment key={mode}>
            <Pressable
              onPress={() => onChange(mode)}
              style={[styles.segmentOption, selected && styles.segmentOptionSelected]}
              testID={`${testPrefix}.${mode}`}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {mode.toUpperCase()}
              </Text>
            </Pressable>
            {index === 0 ? <View style={styles.segmentDivider} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  testID
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || disabled) && styles.primaryButtonPressed
      ]}
      testID={testID}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  testID
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        (pressed || disabled) && styles.secondaryButtonPressed
      ]}
      testID={testID}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function InfoRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function RecentScanRow({
  item,
  onPress,
  testID,
  showDivider = true
}: {
  item: CollectibleListItem;
  onPress: () => void;
  testID?: string;
  showDivider?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.rowBlock} testID={testID}>
      <View style={styles.recentRow}>
        <Thumbnail text={item.thumbnailText} photoUri={item.photoUri} />
        <View style={styles.recentTextGroup}>
          <Text style={styles.recentTitle}>{item.title}</Text>
          <Text style={styles.recentSubtitle}>{item.subtitle}</Text>
        </View>
        <Text style={styles.recentValue}>{item.valueText}</Text>
      </View>
      <View style={styles.recentMetaRow}>
        <Text style={styles.recentMeta}>{item.categoryText}</Text>
        <Text style={styles.recentMeta}>{item.timestampText}</Text>
      </View>
      {showDivider ? <Divider /> : null}
    </Pressable>
  );
}

export function GridCard({
  item,
  onPress,
  testID
}: {
  item: CollectibleListItem;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.gridCard} testID={testID}>
      <View style={styles.gridTopRow}>
        <Thumbnail text={item.thumbnailText} photoUri={item.photoUri} />
        <Text style={styles.gridValue}>{item.valueText}</Text>
      </View>
      <Text style={styles.gridEyebrow}>{item.categoryText}</Text>
      <Text style={styles.gridTitle}>{item.title}</Text>
      <Text style={styles.gridSubtitle}>{item.subtitle}</Text>
    </Pressable>
  );
}

export function Thumbnail({
  text,
  photoUri,
  size = 48
}: {
  text: string;
  photoUri?: string;
  size?: number;
}) {
  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={{ width: size, height: size, borderWidth: borders.hairline, borderColor: colors.borderDefault }} />;
  }

  return (
    <View style={[styles.thumbnail, { width: size, height: size }]}>
      <Text style={styles.thumbnailText}>{text}</Text>
    </View>
  );
}

export function ProgressRow({
  title,
  status,
  testID
}: {
  title: string;
  status: ProcessingStageStatus;
  testID?: string;
}) {
  return (
    <View style={styles.progressRow} testID={testID}>
      <Text style={styles.progressTitle}>{title}</Text>
      <Text style={styles.progressStatus}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function StickyActionBar({ children }: React.PropsWithChildren) {
  return <View style={styles.stickyActionBar}>{children}</View>;
}

export function Chip({
  title,
  onPress,
  testID
}: {
  title: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.chip} testID={testID}>
      <Text style={styles.chipText}>{title}</Text>
    </Pressable>
  );
}

export function SettingsRow({
  title,
  detail,
  onPress,
  testID,
  showChevron = false
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  testID?: string;
  showChevron?: boolean;
}) {
  const content = (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsTitle}>{title}</Text>
      <View style={styles.settingsRight}>
        {detail ? <Text style={styles.settingsDetail}>{detail}</Text> : null}
        {showChevron ? <Ionicons color={colors.foregroundSubtle} name="chevron-forward" size={iconSize.sm} /> : null}
      </View>
    </View>
  );

  if (!onPress) {
    return <View testID={testID}>{content}</View>;
  }

  return (
    <Pressable onPress={onPress} testID={testID}>
      {content}
    </Pressable>
  );
}

export function EmptyState({
  title,
  message,
  actionTitle,
  onAction,
  testID
}: {
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <Panel testID={testID}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionTitle && onAction ? (
        <PrimaryButton onPress={onAction} title={actionTitle} />
      ) : null}
    </Panel>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  testID
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID?: string;
}) {
  return (
    <View style={styles.searchField}>
      <Ionicons color={colors.foregroundSubtle} name="search" size={iconSize.sm} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundFaint}
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        testID={testID}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")}>
          <Ionicons color={colors.foregroundSubtle} name="close" size={iconSize.sm} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function MessageBubble({
  content,
  role,
  timestamp,
  testID
}: {
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  testID?: string;
}) {
  const isUser = role === "user";

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]} testID={testID}>
      <View style={[styles.messageBubble, isUser && styles.messageBubbleUser]}>
        <Text style={[styles.messageText, isUser && styles.messageTextUser]}>{content}</Text>
        <Text style={[styles.messageTimestamp, isUser && styles.messageTimestampUser]}>
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: 40,
    gap: spacing.lg
  },
  headerWrapper: {
    gap: spacing.xs
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerActionSlot: {
    width: 56
  },
  headerActionRight: {
    alignItems: "flex-end"
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center"
  },
  headerTitle: {
    color: colors.foreground,
    textAlign: "center"
  },
  headerSubtitle: {
    ...textStyles.body,
    color: colors.foregroundMuted
  },
  headerAction: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault
  },
  headerActionLabel: {
    ...textStyles.micro,
    color: colors.foreground
  },
  panel: {
    gap: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    backgroundColor: colors.surface
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.foregroundSubtle
  },
  divider: {
    height: borders.hairline,
    backgroundColor: colors.divider
  },
  segmented: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault
  },
  segmentOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentOptionSelected: {
    backgroundColor: colors.fillSelected
  },
  segmentDivider: {
    width: borders.hairline,
    backgroundColor: colors.borderMuted
  },
  segmentText: {
    ...textStyles.micro,
    color: colors.foreground
  },
  segmentTextSelected: {
    color: colors.inverseForeground
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fillSelected,
    borderWidth: borders.hairline,
    borderColor: colors.borderStrong
  },
  primaryButtonPressed: {
    opacity: 0.8
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.inverseForeground
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surface
  },
  secondaryButtonPressed: {
    opacity: 0.8
  },
  secondaryButtonText: {
    ...textStyles.button,
    color: colors.foreground
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  infoLabel: {
    ...textStyles.sectionLabel,
    color: colors.foregroundSubtle
  },
  infoValue: {
    ...textStyles.rowValue,
    color: colors.foreground
  },
  rowBlock: {
    gap: spacing.sm
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  recentTextGroup: {
    flex: 1,
    gap: spacing.xxs
  },
  recentTitle: {
    ...textStyles.rowTitle,
    color: colors.foreground
  },
  recentSubtitle: {
    ...textStyles.body,
    color: colors.foregroundMuted
  },
  recentValue: {
    ...textStyles.rowValue,
    color: colors.foreground
  },
  recentMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  recentMeta: {
    ...textStyles.micro,
    color: colors.foregroundSubtle
  },
  thumbnail: {
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    alignItems: "center",
    justifyContent: "center"
  },
  thumbnailText: {
    ...textStyles.micro,
    color: colors.foreground
  },
  gridCard: {
    flex: 1,
    minHeight: 176,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    gap: spacing.md
  },
  gridTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  gridValue: {
    ...textStyles.bodyStrong,
    color: colors.foreground,
    flexShrink: 1,
    textAlign: "right"
  },
  gridEyebrow: {
    ...textStyles.sectionLabel,
    color: colors.foregroundSubtle
  },
  gridTitle: {
    ...textStyles.rowTitle,
    color: colors.foreground
  },
  gridSubtitle: {
    ...textStyles.body,
    color: colors.foregroundMuted
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  progressTitle: {
    ...textStyles.rowValue,
    color: colors.foreground
  },
  progressStatus: {
    ...textStyles.micro,
    color: colors.foregroundSubtle
  },
  stickyActionBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.background
  },
  chip: {
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chipText: {
    ...textStyles.micro,
    color: colors.foreground
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  settingsTitle: {
    ...textStyles.body,
    color: colors.foreground
  },
  settingsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  settingsDetail: {
    ...textStyles.micro,
    color: colors.foregroundSubtle
  },
  emptyTitle: {
    ...textStyles.rowTitle,
    color: colors.foreground
  },
  emptyMessage: {
    ...textStyles.body,
    color: colors.foregroundMuted
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  searchInput: {
    flex: 1,
    color: colors.foreground
  },
  messageRow: {
    alignItems: "flex-start"
  },
  messageRowUser: {
    alignItems: "flex-end"
  },
  messageBubble: {
    maxWidth: "82%",
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs
  },
  messageBubbleUser: {
    backgroundColor: colors.fillSelected,
    borderColor: colors.borderStrong
  },
  messageText: {
    ...textStyles.body,
    color: colors.foreground
  },
  messageTextUser: {
    color: colors.inverseForeground
  },
  messageTimestamp: {
    ...textStyles.micro,
    color: colors.foregroundFaint
  },
  messageTimestampUser: {
    color: "rgba(0,0,0,0.72)"
  }
});
