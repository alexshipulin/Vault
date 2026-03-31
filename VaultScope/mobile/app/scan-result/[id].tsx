import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PriceRangeView } from "@/components/PriceRangeView";

const mockResult = {
  category: "antique",
  name: "English Victorian mahogany side chair",
  year: 1880,
  origin: "England",
  condition: "very_good",
  conditionRange: ["good", "fine"] as const,
  historySummary:
    "Late Victorian side chairs like this often appear in dining suites and parlor sets, with value driven by carving quality, upholstery originality, and maker attribution.",
  confidence: 0.83,
  searchKeywords: ["victorian chair", "mahogany side chair", "english antique furniture"],
  distinguishingFeatures: [
    "Balloon back silhouette",
    "Turned front legs",
    "Floral carving on crest rail",
    "Later upholstery with visible wear",
  ],
};

export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.label}>Scan Result</Text>
        <Text style={styles.title}>{mockResult.name}</Text>
        <Text style={styles.meta}>
          {mockResult.origin} • {mockResult.year ?? "Unknown year"} • Confidence{" "}
          {Math.round(mockResult.confidence * 100)}%
        </Text>
        <Text style={styles.scanId}>Reference ID: {id}</Text>
      </View>

      <PriceRangeView
        estimate={{
          low: 480,
          high: 780,
          currency: "USD",
          confidence: 0.74,
        }}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historical context</Text>
        <Text style={styles.sectionBody}>{mockResult.historySummary}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Distinguishing features</Text>
        {mockResult.distinguishingFeatures.map((feature) => (
          <Text key={feature} style={styles.bullet}>
            • {feature}
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested search keywords</Text>
        <View style={styles.keywordWrap}>
          {mockResult.searchKeywords.map((keyword) => (
            <View key={keyword} style={styles.keywordChip}>
              <Text style={styles.keywordText}>{keyword}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 18,
    backgroundColor: "#F4EFE4",
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: "#13211F",
    gap: 10,
  },
  label: {
    color: "#C2B8A5",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#F6F1E8",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  meta: {
    color: "#D7CFC1",
    fontSize: 14,
  },
  scanId: {
    color: "#A79D8C",
    fontSize: 13,
  },
  section: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#FFFCF7",
    borderWidth: 1,
    borderColor: "#E8DDCB",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D1A15",
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#554A38",
  },
  bullet: {
    fontSize: 15,
    color: "#554A38",
    lineHeight: 22,
  },
  keywordWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keywordChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EFE4D1",
  },
  keywordText: {
    color: "#6F5737",
    fontSize: 13,
    fontWeight: "600",
  },
});
