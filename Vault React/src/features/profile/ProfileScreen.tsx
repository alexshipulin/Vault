import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { CollectibleCategory, VaultUserPreferences } from "@src/domain/models";
import {
  Chip,
  Divider,
  Panel,
  ScreenHeader,
  ScrollScreen,
  SectionLabel,
  SettingsRow
} from "@src/shared/design-system/primitives";
import { colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import { scansThisMonth, supportedCurrencies } from "@src/shared/utils/formatters";

const ALL_CATEGORIES: CollectibleCategory[] = ["coin", "vinyl", "antique", "card"];

export function ProfileScreen() {
  const { container, collectionVersion } = useAppState();
  const [preferences, setPreferences] = useState<VaultUserPreferences>({
    categoriesOfInterest: ALL_CATEGORIES,
    preferredCurrency: "usd",
    notificationsEnabled: true
  });
  const [scansCount, setScansCount] = useState(0);
  const [activeModal, setActiveModal] = useState<"categories" | "currency" | null>(null);

  const load = useCallback(async () => {
    const [prefs, items] = await Promise.all([
      container.preferencesStore.load(),
      container.collectionRepository.fetchAll()
    ]);

    setPreferences(prefs);
    setScansCount(scansThisMonth(items));
  }, [container]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [load, collectionVersion])
  );

  const categoriesSummary = useMemo(() => {
    if (preferences.categoriesOfInterest.length === ALL_CATEGORIES.length) {
      return t("profile.preferences.categories.all");
    }

    if (preferences.categoriesOfInterest.length === 0) {
      return t("profile.preferences.categories.none");
    }

    return preferences.categoriesOfInterest.join(", ");
  }, [preferences.categoriesOfInterest]);

  const updatePreferences = async (next: VaultUserPreferences) => {
    setPreferences(next);
    await container.preferencesStore.save(next);
  };

  const exportData = async () => {
    const items = await container.collectionRepository.fetchAll();
    await container.profileDataExporter.exportJSON({
      userName: "Vault Collector",
      planLabel: "FREE",
      preferences,
      items
    });
  };

  return (
    <ScrollScreen testID="profile.screen">
      <ScreenHeader title={t("profile.title")} testID="profile.title" />

      <Panel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderWidth: 1,
              borderColor: colors.borderDefault,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={[textStyles.rowTitle, { color: colors.foreground }]}>VC</Text>
          </View>
          <View style={{ gap: spacing.xxs }}>
            <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>Vault Collector</Text>
            <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>FREE</Text>
          </View>
        </View>
      </Panel>

      <Panel>
        <SectionLabel>{t("profile.subscription.section")}</SectionLabel>
        <SettingsRow title={t("profile.subscription.plan")} detail="Free plan" testID="profile.planRow" />
        <Divider />
        <SettingsRow
          title={t("profile.subscription.scans")}
          detail={`${scansCount}`}
          testID="profile.scansThisMonthRow"
        />
      </Panel>

      <Panel>
        <SectionLabel>{t("profile.preferences.section")}</SectionLabel>
        <SettingsRow
          title={t("profile.preferences.categories")}
          detail={categoriesSummary}
          onPress={() => setActiveModal("categories")}
          showChevron
        />
        <Divider />
        <SettingsRow
          title={t("profile.preferences.currency")}
          detail={preferences.preferredCurrency.toUpperCase()}
          onPress={() => setActiveModal("currency")}
          showChevron
          testID="profile.currencyRow"
        />
        <Divider />
        <SettingsRow
          title={t("profile.preferences.notifications")}
          detail={preferences.notificationsEnabled ? t("profile.preferences.notifications.on") : t("profile.preferences.notifications.off")}
          onPress={() =>
            void updatePreferences({
              ...preferences,
              notificationsEnabled: !preferences.notificationsEnabled
            })
          }
          testID="profile.notificationsRow"
        />
      </Panel>

      <Panel>
        <SectionLabel>{t("profile.account.section")}</SectionLabel>
        <SettingsRow
          title={t("profile.account.export")}
          onPress={() => {
            void exportData();
          }}
          testID="profile.exportDataRow"
        />
        <Divider />
        <SettingsRow
          title={t("profile.account.sign_out")}
          onPress={() => Alert.alert(t("profile.sign_out.title"), t("profile.sign_out.placeholder"))}
          testID="profile.signOutRow"
        />
      </Panel>

      <SelectionModal
        visible={activeModal === "categories"}
        title={t("profile.preferences.categories")}
        onClose={() => setActiveModal(null)}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {ALL_CATEGORIES.map((category) => {
            const selected = preferences.categoriesOfInterest.includes(category);
            return (
              <Chip
                key={category}
                title={category.toUpperCase()}
                onPress={() => {
                  const nextCategories = selected
                    ? preferences.categoriesOfInterest.filter((entry) => entry !== category)
                    : [...preferences.categoriesOfInterest, category].sort();
                  void updatePreferences({ ...preferences, categoriesOfInterest: nextCategories });
                }}
              />
            );
          })}
        </View>
      </SelectionModal>

      <SelectionModal
        visible={activeModal === "currency"}
        title={t("profile.preferences.currency")}
        onClose={() => setActiveModal(null)}
      >
        <View style={{ gap: spacing.sm }}>
          {supportedCurrencies().map((currency) => (
            <SettingsRow
              key={currency}
              title={currency.toUpperCase()}
              detail={preferences.preferredCurrency === currency ? t("profile.preferences.currency.selected") : undefined}
              onPress={() => {
                void updatePreferences({ ...preferences, preferredCurrency: currency });
                setActiveModal(null);
              }}
            />
          ))}
        </View>
      </SelectionModal>
    </ScrollScreen>
  );
}

function SelectionModal({
  visible,
  title,
  onClose,
  children
}: React.PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.72)"
        }}
      >
        <View
          style={{
            maxHeight: "70%",
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.borderDefault,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xl,
            gap: spacing.lg
          }}
        >
          <ScreenHeader title={title} rightAction={<Text onPress={onClose} style={[textStyles.micro, { color: colors.foreground }]}>{t("common.done")}</Text>} />
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
