import { Tabs } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "../../src/store/useAppStore";

function TabIcon({ emoji }: { emoji: string; label: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

function GlobalHeader() {
  const insets = useSafeAreaInsets();
  const deviceId = useAppStore((s) => s.deviceId);
  const isOnline = useAppStore((s) => s.isOnline);
  const setOnline = useAppStore((s) => s.setOnline);
  const lamport = useAppStore((s) => s.lamport);
  const pendingOps = useAppStore((s) => s.pendingOps);
  const sync = useAppStore((s) => s.sync);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);

  const formattedTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString()
    : "Never";

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.headerTop}>
        <View style={styles.titleCol}>
          <Text style={styles.headerTitle}>ALCOVIA</Text>
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceBadgeText}>
              {deviceId === "device-a" ? "📱 " : deviceId === "device-b" ? "💻 " : "🖥️ "}
              {deviceId}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.statusToggle, isOnline ? styles.statusToggleOnline : styles.statusToggleOffline]}
          onPress={() => setOnline(!isOnline)}
          activeOpacity={0.8}
        >
          <Text style={styles.statusToggleText}>
            {isOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerBottom}>
        <View style={styles.syncMetrics}>
          <Text style={styles.metricText}>
            Lamport: <Text style={styles.metricVal}>{lamport}</Text>
          </Text>
          <Text style={styles.metricDivider}>|</Text>
          <Text style={styles.metricText}>
            Pending: <Text style={[styles.metricVal, pendingOps.length > 0 && styles.pendingValAlert]}>{pendingOps.length}</Text>
          </Text>
          <Text style={styles.metricDivider}>|</Text>
          <Text style={styles.metricText}>
            Last Sync: <Text style={styles.metricVal}>{formattedTime}</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.syncBtn,
            (!isOnline || isSyncing) && styles.syncBtnDisabled
          ]}
          onPress={sync}
          disabled={!isOnline || isSyncing}
          activeOpacity={0.7}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#c7d2fe" />
          ) : (
            <Text style={styles.syncBtnText}>🔄 Sync Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <GlobalHeader />,
        tabBarStyle: {
          backgroundColor: "#0f0f1a",
          borderTopColor: "#1e1e3a",
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: "#818cf8",
        tabBarInactiveTintColor: "#4a5568",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tasks",
          tabBarIcon: () => <TabIcon emoji="📚" label="Tasks" />,
          tabBarLabel: "Tasks",
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: "Focus",
          tabBarIcon: () => <TabIcon emoji="⏱️" label="Focus" />,
          tabBarLabel: "Focus",
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: () => <TabIcon emoji="📊" label="Progress" />,
          tabBarLabel: "Progress",
        }}
      />
      <Tabs.Screen
        name="dev"
        options={{
          title: "Dev Panel",
          tabBarIcon: () => <TabIcon emoji="🛠️" label="Dev" />,
          tabBarLabel: "Dev",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#13132a",
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e3a",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#e2e8f0",
    letterSpacing: 1.5,
  },
  deviceBadge: {
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#312e81",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deviceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#818cf8",
  },
  statusToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusToggleOnline: {
    backgroundColor: "#065f4622",
    borderColor: "#059669",
  },
  statusToggleOffline: {
    backgroundColor: "#991b1b22",
    borderColor: "#dc2626",
  },
  statusToggleText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#cbd5e1",
  },
  headerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  syncMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricText: {
    fontSize: 11,
    color: "#64748b",
  },
  metricVal: {
    fontWeight: "700",
    color: "#cbd5e1",
  },
  pendingValAlert: {
    color: "#fbbf24",
  },
  metricDivider: {
    color: "#1e1e3a",
    fontSize: 10,
  },
  syncBtn: {
    backgroundColor: "#312e81",
    borderColor: "#4f46e5",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#c7d2fe",
  },
});
