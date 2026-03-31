import { ScrollView, StyleSheet, Text, View } from "react-native";

import { PortfolioChart } from "@/components/PortfolioChart";
import { PriceRangeView } from "@/components/PriceRangeView";

export default function PortfolioScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title} testID="portfolio-title">Portfolio</Text>
        <Text style={styles.body}>
          Snapshot cards and category mix live here. This is a good home for future valuation
          deltas, alerts, and weekly scraping summaries.
        </Text>
      </View>

      <PortfolioChart
        data={[
          { label: "Furniture", value: 42, accentColor: "#C58D44" },
          { label: "Jewelry", value: 31, accentColor: "#4B7C8A" },
          { label: "Art", value: 24, accentColor: "#7D5C96" },
          { label: "Ceramics", value: 18, accentColor: "#4C8D72" },
        ]}
      />

      <PriceRangeView
        estimate={{
          low: 9400,
          high: 13800,
          currency: "USD",
          confidence: 0.78,
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 18,
    backgroundColor: "#F4EFE4",
  },
  hero: {
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
});
