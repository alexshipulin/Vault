import { StyleSheet } from "react-native";

export const colors = {
  background: "#000000",
  surface: "#000000",
  surfaceElevated: "rgba(255,255,255,0.04)",
  foreground: "#FFFFFF",
  foregroundMuted: "rgba(255,255,255,0.72)",
  foregroundSubtle: "rgba(255,255,255,0.56)",
  foregroundFaint: "rgba(255,255,255,0.38)",
  inverseForeground: "#000000",
  borderStrong: "#FFFFFF",
  borderDefault: "rgba(255,255,255,0.24)",
  borderMuted: "rgba(255,255,255,0.14)",
  divider: "rgba(255,255,255,0.12)",
  fillSelected: "#FFFFFF",
  fillPressed: "rgba(255,255,255,0.86)"
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32
} as const;

export const borders = {
  hairline: StyleSheet.hairlineWidth,
  emphasis: 1.5
} as const;

export const iconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24
} as const;

export const textStyles = StyleSheet.create({
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2
  },
  body: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20
  },
  bodyStrong: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20
  },
  micro: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.8
  },
  button: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.8
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8
  }
});
