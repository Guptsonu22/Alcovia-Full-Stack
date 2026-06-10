import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, AppState,
  AppStateStatus, ScrollView,
} from "react-native";
import { useAppStore } from "../../src/store/useAppStore";
import { FocusSession } from "../../src/types";

const DURATIONS = [25, 45, 60, 90, 120];
const APP_SWITCH_GRACE_SECONDS = 5;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ProgressRing({ pct }: { pct: number }) {
  const color = pct >= 1 ? "#48bb78" : pct >= 0.7 ? "#818cf8" : "#38bdf8";
  return (
    <View style={ring.container}>
      <View style={[ring.outer, { borderColor: color + "33" }]}>
        <View style={[ring.inner, { borderColor: color }]}>
          <Text style={[ring.pctText, { color }]}>{Math.round(pct * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

const ring = StyleSheet.create({
  container: { alignItems: "center", marginVertical: 12 },
  outer: { width: 150, height: 150, borderRadius: 75, borderWidth: 10, alignItems: "center", justifyContent: "center" },
  inner: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  pctText: { fontSize: 24, fontWeight: "800" },
});

export default function FocusScreen() {
  const startSession = useAppStore((s) => s.startSession);
  const succeedSession = useAppStore((s) => s.succeedSession);
  const failSession = useAppStore((s) => s.failSession);
  const activeSession = useAppStore((s) => s.activeSession);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const sessions = useAppStore((s) => s.sessions);
  const rewards = useAppStore((s) => s.rewards);
  const isOnline = useAppStore((s) => s.isOnline);
  const deviceId = useAppStore((s) => s.deviceId);

  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [elapsed, setElapsed] = useState(0);
  const [appSwitchTimer, setAppSwitchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<FocusSession | null>(null);
  const appStateRef = useRef<AppStateStatus>("active");

  const targetSeconds = (activeSession?.targetMinutes ?? selectedMinutes) * 60;
  const pct = activeSession ? Math.min(elapsed / targetSeconds, 1) : 0;

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeSession && activeSession.status === "RUNNING") {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          // Update elapsed in the session store
          setActiveSession({ ...activeSession, elapsedSeconds: next });

          if (next >= targetSeconds) {
            // Auto-succeed
            clearInterval(timerRef.current!);
            succeedSession(activeSession.id, next);
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession?.id]);

  // ── Dev: Allow skipping to end ─────────────────────────────────────────────
  const skipToEnd = () => {
    if (!activeSession) return;
    if (timerRef.current) clearInterval(timerRef.current);
    succeedSession(activeSession.id, targetSeconds);
    setElapsed(0);
  };

  // ── AppState (background detection) ───────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (!activeSession || activeSession.status !== "RUNNING") {
        appStateRef.current = nextState;
        return;
      }

      if (appStateRef.current === "active" && nextState !== "active") {
        // App left foreground — start grace period
        const timer = setTimeout(() => {
          if (sessionRef.current && sessionRef.current.status === "RUNNING") {
            failSession(sessionRef.current.id, "app_switch");
            setElapsed(0);
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }, APP_SWITCH_GRACE_SECONDS * 1000);
        setAppSwitchTimer(timer);
      } else if (nextState === "active" && appStateRef.current !== "active") {
        // Returned within grace period — cancel timer
        if (appSwitchTimer) clearTimeout(appSwitchTimer);
      }

      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [activeSession, appSwitchTimer]);

  useEffect(() => {
    sessionRef.current = activeSession;
  }, [activeSession]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setElapsed(0);
    await startSession(selectedMinutes);
  };

  const handleGiveUp = () => {
    if (!activeSession) return;
    if (timerRef.current) clearInterval(timerRef.current);
    failSession(activeSession.id, "give_up");
    setElapsed(0);
  };

  const recentSessions = sessions.slice(0, 5);

  // ── Stats Row ──────────────────────────────────────────────────────────────
  const renderStatsRow = () => (
    <View style={styles.miniStatsRow}>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatVal}>🔥 {rewards.streak}</Text>
        <Text style={styles.miniStatLabel}>Streak</Text>
      </View>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatVal}>🪙 {rewards.coins}</Text>
        <Text style={styles.miniStatLabel}>Coins</Text>
      </View>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatVal}>⏱️ {rewards.todayFocusMinutes}m</Text>
        <Text style={styles.miniStatLabel}>Today</Text>
      </View>
    </View>
  );

  // ── No active session — picker UI ──────────────────────────────────────────
  if (!activeSession || activeSession.status !== "RUNNING") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>⏱️ Focus Session</Text>
        <Text style={styles.subheading}>Choose a duration and stay focused.</Text>

        {renderStatsRow()}

        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.durationBtn, selectedMinutes === d && styles.durationBtnActive]}
              onPress={() => setSelectedMinutes(d)}
            >
              <Text style={[styles.durationText, selectedMinutes === d && styles.durationTextActive]}>
                {d}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.8}>
          <Text style={styles.startBtnText}>▶  Start Focus Session</Text>
          <Text style={styles.startBtnSubtext}>Duration: {selectedMinutes} Minutes</Text>
        </TouchableOpacity>

        {recentSessions.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.historyTitle}>Recent sessions</Text>
            {recentSessions.map((s) => (
              <View key={s.id} style={styles.historyRow}>
                <Text style={[styles.historyStatus,
                  s.status === "SUCCESS" ? styles.successText :
                  s.status === "FAILED" ? styles.failText : styles.runningText
                ]}>
                  {s.status === "SUCCESS" ? "✓" : s.status === "FAILED" ? "✗" : "…"}
                </Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyLabel}>
                    {s.targetMinutes}min session
                    {s.failReason ? ` — ${s.failReason}` : ""}
                  </Text>
                  <Text style={styles.historyTime}>
                    {new Date(s.startedAt).toLocaleTimeString()}
                    {s.rewarded ? " · 🪙 Rewarded" : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Active session UI ──────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.activeContent}>
      <Text style={styles.heading}>🚀 Focus Active!</Text>
      <Text style={styles.subheading}>{activeSession.targetMinutes}-minute study session</Text>

      {renderStatsRow()}

      <ProgressRing pct={pct} />

      <Text style={styles.timerDisplay}>{formatTime(elapsed)}</Text>
      <Text style={styles.timerRemaining}>
        {formatTime(Math.max(0, targetSeconds - elapsed))} remaining
      </Text>

      {/* ── Active Session Details Card ─────────────────────────────────── */}
      <View style={styles.activeDetailsCard}>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Status</Text>
          <View style={[styles.detailsBadge, { backgroundColor: "#fbbf2422", borderColor: "#fbbf24" }]}>
            <Text style={[styles.detailsBadgeText, { color: "#fbbf24" }]}>RUNNING</Text>
          </View>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Device</Text>
          <Text style={styles.detailsValue}>
            {deviceId === "device-a" ? "📱 " : deviceId === "device-b" ? "💻 " : "🖥️ "}
            {deviceId}
          </Text>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Offline</Text>
          <Text style={[styles.detailsValue, { color: !isOnline ? "#ef4444" : "#10b981", fontWeight: "700" }]}>
            {!isOnline ? "YES 🔴" : "NO 🟢"}
          </Text>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Pending Reward</Text>
          <Text style={[styles.detailsValue, { color: !isOnline ? "#fbbf24" : "#10b981", fontWeight: "700" }]}>
            {!isOnline ? "Awaiting Sync ⏳" : "Auto-Award 🪙"}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.giveUpBtn} onPress={handleGiveUp} activeOpacity={0.8}>
          <Text style={styles.giveUpText}>Give Up</Text>
        </TouchableOpacity>

        {/* Dev-only: skip to end */}
        <TouchableOpacity style={styles.devSkipBtn} onPress={skipToEnd} activeOpacity={0.8}>
          <Text style={styles.devSkipText}>⏩ Skip (dev)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.graceNote}>
        Leaving the app for {APP_SWITCH_GRACE_SECONDS}s+ will end the session.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  content: { padding: 24, paddingBottom: 40 },
  activeContent: { padding: 24, alignItems: "center", justifyContent: "center", paddingBottom: 40 },

  heading: { fontSize: 24, fontWeight: "800", color: "#e2e8f0", textAlign: "center", marginBottom: 4 },
  subheading: { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 24 },

  miniStatsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
    justifyContent: "space-between",
    width: "100%",
  },
  miniStat: {
    flex: 1,
    backgroundColor: "#13132a",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e1e3a",
  },
  miniStatVal: {
    fontSize: 16,
    fontWeight: "800",
    color: "#cbd5e1",
  },
  miniStatLabel: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },

  durationRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 32, flexWrap: "wrap" },
  durationBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    backgroundColor: "#13132a", borderWidth: 1, borderColor: "#1e1e3a",
  },
  durationBtnActive: { backgroundColor: "#312e81", borderColor: "#818cf8" },
  durationText: { fontSize: 16, fontWeight: "600", color: "#64748b" },
  durationTextActive: { color: "#c7d2fe" },

  startBtn: {
    backgroundColor: "#4f46e5", borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 32, alignItems: "center", borderWidth: 1, borderColor: "#818cf8",
    shadowColor: "#4f46e5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  startBtnText: { fontSize: 18, fontWeight: "800", color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  startBtnSubtext: { fontSize: 13, fontWeight: "600", color: "#c7d2fe", marginTop: 4 },

  timerDisplay: { fontSize: 48, fontWeight: "900", color: "#e2e8f0", letterSpacing: 2, marginBottom: 4 },
  timerRemaining: { fontSize: 13, color: "#64748b", marginBottom: 24 },

  activeDetailsCard: {
    backgroundColor: "#13132a",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "#1e1e3a",
    marginBottom: 24,
    gap: 12,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailsLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailsValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#cbd5e1",
  },
  detailsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  detailsBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  actionRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  giveUpBtn: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#991b1b33", borderWidth: 1, borderColor: "#991b1b",
  },
  giveUpText: { fontSize: 15, fontWeight: "700", color: "#f87171" },
  devSkipBtn: {
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#1e2d4033", borderWidth: 1, borderColor: "#334155",
  },
  devSkipText: { fontSize: 14, color: "#64748b" },

  graceNote: { fontSize: 11, color: "#374151", textAlign: "center" },

  history: { marginTop: 32 },
  historyTitle: { fontSize: 14, fontWeight: "700", color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1e1e3a" },
  historyStatus: { fontSize: 20, width: 24, textAlign: "center" },
  historyInfo: { flex: 1 },
  historyLabel: { fontSize: 14, color: "#cbd5e1", fontWeight: "500" },
  historyTime: { fontSize: 12, color: "#4a5568", marginTop: 2 },
  successText: { color: "#48bb78" },
  failText: { color: "#f87171" },
  runningText: { color: "#fbbf24" },
});
