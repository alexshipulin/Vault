import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

type ScanButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

export function ScanButton({ title, onPress, disabled = false, testID }: ScanButtonProps) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 1 : pulse.value }],
    opacity: disabled ? 0.55 : 1,
  }));

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <Pressable disabled={disabled} onPress={onPress} style={styles.button} testID={testID}>
        <View style={styles.ring} />
        <Text style={styles.label}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "center",
  },
  button: {
    minWidth: 220,
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 999,
    backgroundColor: "#1E3A34",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    margin: 4,
  },
  label: {
    color: "#F8F4EA",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
