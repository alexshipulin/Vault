import { router } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { ResultCard } from "@/components/ResultCard";
import type { CollectionItem } from "@/lib/types";

const sampleItems: CollectionItem[] = [
  {
    id: "1",
    scanResultId: "scan-1",
    title: "Victorian mahogany side chair",
    imageUrl: "",
    priceEstimate: { low: 480, high: 780, currency: "USD", confidence: 0.74 },
    addedAt: new Date().toISOString(),
    customNotes: "Original carving looks strong. Upholstery likely replaced.",
  },
  {
    id: "2",
    scanResultId: "scan-2",
    title: "Art nouveau sterling brooch",
    imageUrl: "",
    priceEstimate: { low: 220, high: 410, currency: "USD", confidence: 0.7 },
    addedAt: new Date().toISOString(),
    customNotes: "Need a clearer hallmark photo for final attribution.",
  },
];

export default function CollectionScreen() {
  const renderItem = useCallback(
    ({ item }: { item: CollectionItem }) => (
      <ResultCard
        item={{ ...item, category: "collection" }}
        onPress={() => router.push(`/scan-result/${item.scanResultId}`)}
      />
    ),
    [],
  );

  return (
    <FlatList
      data={sampleItems}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title} testID="collection-title">Your Collection</Text>
          <Text style={styles.body}>
            Saved pieces store a price snapshot so your portfolio remains stable even when market
            comps shift later.
          </Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={renderItem}
      removeClippedSubviews
      windowSize={5}
      initialNumToRender={4}
      maxToRenderPerBatch={6}
      testID="collection-list"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 18,
    backgroundColor: "#F4EFE4",
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1A1813",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5B5142",
  },
  separator: {
    height: 14,
  },
});
