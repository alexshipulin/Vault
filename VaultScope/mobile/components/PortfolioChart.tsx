import { StyleSheet, Text, View } from "react-native";

type PortfolioDatum = {
  label: string;
  value: number;
  accentColor?: string;
};

type PortfolioChartProps = {
  data: PortfolioDatum[];
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Portfolio Mix</Text>
      <View style={styles.chart}>
        {data.map((item) => {
          const width = `${Math.max(16, (item.value / maxValue) * 100)}%` as const;

          return (
            <View key={item.label} style={styles.row}>
              <Text style={styles.label}>{item.label}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    { width, backgroundColor: item.accentColor ?? "#23433D" },
                  ]}
                />
              </View>
              <Text style={styles.value}>{item.value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#101B1A",
    gap: 18,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F3EDE2",
  },
  chart: {
    gap: 14,
  },
  row: {
    gap: 8,
  },
  label: {
    color: "#D8D0C3",
    fontSize: 13,
    fontWeight: "600",
  },
  track: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "#273433",
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 999,
  },
  value: {
    color: "#B8B0A1",
    fontSize: 12,
  },
});
