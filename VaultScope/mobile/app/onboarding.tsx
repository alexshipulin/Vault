import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ScanButton } from "@/components/ScanButton";

const ONBOARDING_KEY = "vaultscope:onboarding-complete";

export default function OnboardingScreen() {
  const handleContinue = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>VaultScope</Text>
        <Text style={styles.title}>Turn a quick photo into a collector-grade read.</Text>
        <Text style={styles.body}>
          Scan antiques, coins, vinyl, and collectibles. VaultScope pairs image analysis,
          market references, and your own collection history in one place.
        </Text>
      </View>

      <View style={styles.highlights}>
        <Text style={styles.highlight}>Camera-first identification</Text>
        <Text style={styles.highlight}>Price ranges with confidence bands</Text>
        <Text style={styles.highlight}>Saved portfolio and collection tracking</Text>
      </View>

      <ScanButton
        title="Start Scanning"
        onPress={() => void handleContinue()}
        testID="onboarding-start"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: "#F3EBDD",
  },
  hero: {
    gap: 14,
  },
  kicker: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E0D1B7",
    color: "#6E5B3C",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    color: "#1B1A15",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#564C3B",
  },
  highlights: {
    gap: 12,
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#FEFBF4",
    borderWidth: 1,
    borderColor: "#E6DACA",
  },
  highlight: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2B322E",
  },
});
