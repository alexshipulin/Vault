import { StyleSheet, Text, View } from "react-native";

import type { PriceEstimate } from "@/lib/types";

type PriceRangeViewProps = {
  estimate: PriceEstimate;
};

function formatCurrency(value: number | null, currency: string): string {
  if (value === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PriceRangeView({ estimate }: PriceRangeViewProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Market Range</Text>
      <View style={styles.row}>
        <View style={styles.valueBlock}>
          <Text style={styles.caption}>Low</Text>
          <Text style={styles.value}>{formatCurrency(estimate.low, estimate.currency)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.valueBlock}>
          <Text style={styles.caption}>High</Text>
          <Text style={styles.value}>{formatCurrency(estimate.high, estimate.currency)}</Text>
        </View>
      </View>
      <Text style={styles.confidence}>
        Confidence {Math.round(estimate.confidence * 100)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#F6EFE1",
    borderWidth: 1,
    borderColor: "#E5DAC5",
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#816A45",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  valueBlock: {
    flex: 1,
    gap: 6,
  },
  caption: {
    fontSize: 12,
    color: "#8B7A5E",
  },
  value: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1A16",
  },
  divider: {
    width: 1,
    backgroundColor: "#DBCDB2",
    marginHorizontal: 16,
  },
  confidence: {
    fontSize: 13,
    color: "#5D533F",
  },
});
