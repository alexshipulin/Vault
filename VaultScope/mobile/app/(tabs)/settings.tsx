import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AppConfig } from "@/constants/Config";
import { refreshAnonymousSession } from "@/lib/firebase/auth";

export default function SettingsScreen() {
  const handleRefreshSession = async () => {
    await refreshAnonymousSession();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>
          MVP auth is anonymous by default. When you are ready, this screen can grow into account,
          subscription, and export controls.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Environment</Text>
        <Text style={styles.meta}>Firebase project: {AppConfig.firebase.projectId}</Text>
        <Text style={styles.meta}>Gemini configured: yes</Text>
      </View>

      <TouchableOpacity onPress={() => void handleRefreshSession()} style={styles.button}>
        <Text style={styles.buttonText}>Refresh Anonymous Session</Text>
      </TouchableOpacity>
    </ScrollView>
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
  card: {
    borderRadius: 24,
    padding: 20,
    gap: 10,
    backgroundColor: "#FFFCF7",
    borderWidth: 1,
    borderColor: "#E7DCCB",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D1A15",
  },
  meta: {
    fontSize: 14,
    color: "#5C5240",
  },
  button: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: "#1E3A34",
    alignItems: "center",
  },
  buttonText: {
    color: "#F8F4EA",
    fontSize: 15,
    fontWeight: "700",
  },
});
