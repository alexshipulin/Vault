import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import type { CollectionItem, ScanResult } from "@/lib/types";

type ResultCardData = Pick<CollectionItem, "title" | "imageUrl" | "priceEstimate"> &
  Partial<Pick<CollectionItem, "customNotes">> &
  Partial<Pick<ScanResult, "category">>;

type ResultCardProps = {
  item: ResultCardData;
  onPress?: () => void;
};

function formatPrice(low: number | null, high: number | null): string {
  if (low === null && high === null) {
    return "Estimate pending";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const lowLabel = low === null ? "?" : formatter.format(low);
  const highLabel = high === null ? "?" : formatter.format(high);

  return `${lowLabel} - ${highLabel}`;
}

function ResultCardComponent({ item, onPress }: ResultCardProps) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.shadow}>
      <Pressable onPress={onPress} style={styles.card}>
        <View style={styles.thumb}>
          <Text style={styles.thumbText}>{item.title.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.category ? <Text style={styles.badge}>{item.category}</Text> : null}
          </View>
          <Text style={styles.price}>
            {formatPrice(item.priceEstimate.low, item.priceEstimate.high)}
          </Text>
          {item.customNotes ? (
            <Text style={styles.notes} numberOfLines={2}>
              {item.customNotes}
            </Text>
          ) : (
            <Text style={styles.notes} numberOfLines={2}>
              {item.imageUrl ? "Reference image attached" : "Awaiting more notes"}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const ResultCard = memo(ResultCardComponent);

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#201A12",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  card: {
    flexDirection: "row",
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#FCFAF4",
    borderWidth: 1,
    borderColor: "#ECE3D3",
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#D7C6A4",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: {
    fontSize: 26,
    fontWeight: "700",
    color: "#4A3E2A",
  },
  content: {
    flex: 1,
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1A16",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#EFE6D6",
    color: "#705C38",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  price: {
    fontSize: 15,
    fontWeight: "600",
    color: "#23433D",
  },
  notes: {
    fontSize: 13,
    lineHeight: 18,
    color: "#655B49",
  },
});
