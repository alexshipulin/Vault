import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1E3A34",
        tabBarInactiveTintColor: "#8D867A",
        tabBarStyle: {
          height: 84,
          paddingTop: 10,
          paddingBottom: 12,
          backgroundColor: "#FBF7EF",
          borderTopColor: "#E2D8C8",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scanner",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="scan-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "Collection",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="albums-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="stats-chart-outline" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons color={color} name="options-outline" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
