import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>This screen wandered off.</Text>
      <Text style={styles.body}>
        The route does not exist yet, but the app shell is ready for it.
      </Text>
      <Link href="/(tabs)" style={styles.link}>
        Return to home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F4EFE4",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1C1A16",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#625744",
    textAlign: "center",
  },
  link: {
    color: "#1E3A34",
    fontSize: 16,
    fontWeight: "700",
  },
});
