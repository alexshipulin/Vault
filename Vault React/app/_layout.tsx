import "react-native-reanimated";

import { Stack } from "expo-router";

import { AppProvider } from "@src/app/AppProvider";

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="processing" />
        <Stack.Screen name="result/[resultId]" />
        <Stack.Screen name="item/[itemId]" />
        <Stack.Screen name="chat/[itemId]" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AppProvider>
  );
}
