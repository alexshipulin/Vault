import React, { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

import { getRemoteReadinessStatus } from "@/constants/Config";
import { useAppState } from "@src/core/app/AppProvider";
import type { AppReadinessReport } from "@src/domain/models";
import { Divider, Panel, SecondaryButton, SectionLabel, SettingsRow } from "@src/shared/design-system/primitives";
import { colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

export function DebugPanel() {
  const { container } = useAppState();
  const [isTesting, setIsTesting] = useState(false);
  const [lastReport, setLastReport] = useState<AppReadinessReport | null>(null);
  const remoteStatus = useMemo(() => getRemoteReadinessStatus(), []);
  const readinessDetail = useMemo(() => {
    if (!lastReport) {
      return remoteStatus.isReady
        ? t("profile.debug.readiness.ready")
        : t("profile.debug.readiness.incomplete");
    }

    const criticalChecksPassed = lastReport.checks
      .filter((check) => ["firebase", "firestore", "gemini", "persistence"].includes(check.key))
      .every((check) => check.status === "verified");

    return lastReport.remoteAnalysisReady && criticalChecksPassed
      ? t("profile.debug.readiness.ready")
      : t("profile.debug.readiness.incomplete");
  }, [lastReport, remoteStatus.isReady]);

  const testConnection = async () => {
    setIsTesting(true);

    try {
      const report = await container.readinessService.check();
      setLastReport(report);
      const lines = [
        `${t("profile.debug.readiness")}: ${
          report.remoteAnalysisReady && report.searchIndexReady
            ? t("profile.debug.readiness.ready")
            : t("profile.debug.readiness.incomplete")
        }`,
        ...report.checks.map((check) => `${check.label}: ${check.status.toUpperCase()} · ${check.message}`)
      ];

      Alert.alert(t("profile.debug.connection.testing"), lines.join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("profile.debug.connection.failure");
      Alert.alert(t("profile.debug.connection.testing"), message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Panel testID="profile.debugPanel">
      <SectionLabel>{t("profile.debug.section")}</SectionLabel>
      <SettingsRow
        title={t("profile.debug.mode")}
        detail={
          container.runtimeConfig.flags.remoteBackend
            ? t("profile.debug.mode.remote")
            : t("profile.debug.mode.local")
        }
      />
      <Divider />
      <SettingsRow
        title={t("profile.debug.environment")}
        detail={
          container.runtimeConfig.environment === "production"
            ? t("profile.debug.environment.production")
            : t("profile.debug.environment.mock")
        }
      />
      <Divider />
      <SettingsRow
        title={t("profile.debug.fallback_policy")}
        detail={
          container.runtimeConfig.flags.remoteBackend
            ? t("profile.debug.fallback.disabled")
            : t("profile.debug.fallback.local_only")
        }
      />
      <Divider />
      <SettingsRow
        title={t("profile.debug.readiness")}
        detail={readinessDetail}
      />
      {!remoteStatus.isReady ? (
        <>
          <Divider />
          <View style={{ gap: spacing.xs }}>
            <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
              {t("profile.debug.missing")}
            </Text>
            {remoteStatus.missingConfig.map((item) => (
              <Text key={item} style={[textStyles.body, { color: colors.foregroundMuted }]}>
                - {item}
              </Text>
            ))}
          </View>
        </>
      ) : null}
      <Divider />
      <SettingsRow
        title={t("profile.debug.fast_processing")}
        detail={
          container.runtimeConfig.flags.fastProcessing
            ? t("profile.debug.flag.on")
            : t("profile.debug.flag.off")
        }
      />
      <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
        {t("profile.debug.fast_processing.env")}
      </Text>
      {lastReport?.checks?.length ? (
        <>
          <Divider />
          <View style={{ gap: spacing.xs }}>
            {lastReport.checks.map((check) => (
              <Text
                key={check.key}
                style={[
                  textStyles.body,
                  {
                    color:
                      check.status === "verified"
                        ? colors.foreground
                        : check.status === "missing"
                          ? colors.foregroundMuted
                          : colors.foregroundSubtle,
                  },
                ]}
              >
                {check.label}: {check.status.toUpperCase()} · {check.message}
              </Text>
            ))}
          </View>
        </>
      ) : null}
      <SecondaryButton
        title={isTesting ? t("common.loading") : t("profile.debug.test_connection")}
        onPress={() => {
          void testConnection();
        }}
        disabled={isTesting}
        testID="profile.debug.testConnectionButton"
      />
    </Panel>
  );
}
