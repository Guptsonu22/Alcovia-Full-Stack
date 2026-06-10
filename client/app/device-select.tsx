import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ActivityIndicator
} from "react-native";
import { useRouter } from "expo-router";
import { useAppStore } from "../src/store/useAppStore";

const DEVICES = [
  { id: "device-a", name: "Device A", icon: "📱", desc: "Simulates student's phone. Primary study device." },
  { id: "device-b", name: "Device B", icon: "💻", desc: "Simulates student's laptop. Secondary study device." },
  { id: "device-c", name: "Device C", icon: "🖥️", desc: "Backup study monitor. Desktop simulation." },
];

export default function DeviceSelectScreen() {
  const setDeviceId = useAppStore((s) => s.setDeviceId);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const router = useRouter();

  const handleSelect = async (id: string) => {
    await setDeviceId(id);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ALCOVIA</Text>
        <Text style={styles.subtitle}>Offline-First Study Companion</Text>
      </View>

      <Text style={styles.prompt}>Select your simulation device to start</Text>

      <View style={styles.cardContainer}>
        {DEVICES.map((dev) => (
          <TouchableOpacity
            key={dev.id}
            style={styles.card}
            onPress={() => handleSelect(dev.id)}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>{dev.icon}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{dev.name}</Text>
              <Text style={styles.cardDesc}>{dev.desc}</Text>
            </View>
            <View style={styles.arrowContainer}>
              <Text style={styles.arrow}>➔</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Each device has its own isolated SQLite/AsyncStorage sandbox.
        </Text>
        <Text style={styles.footerText}>
          You can toggle online/offline modes to simulate sync and conflict resolution.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080710",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 40,
    fontWeight: "900",
    color: "#e2e8f0",
    letterSpacing: 4,
    textShadowColor: "rgba(129, 140, 248, 0.4)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 15,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366f1",
    marginTop: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  prompt: {
    fontSize: 16,
    color: "#94a3b8",
    marginBottom: 32,
    fontWeight: "500",
  },
  cardContainer: {
    width: "100%",
    maxWidth: 500,
    gap: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111022",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1e1b4b",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#1e1b4b",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    borderWidth: 1,
    borderColor: "#312e81",
  },
  icon: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#c7d2fe",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
  },
  arrowContainer: {
    paddingLeft: 8,
  },
  arrow: {
    fontSize: 18,
    color: "#4f46e5",
    fontWeight: "bold",
  },
  footer: {
    marginTop: 48,
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
    maxWidth: 350,
    lineHeight: 15,
  },
});
