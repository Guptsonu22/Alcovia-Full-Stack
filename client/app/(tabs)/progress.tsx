import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useAppStore } from "../../src/store/useAppStore";

export default function ProgressScreen() {
  const tasks = useAppStore((s) => s.tasks);
  const subjects = useAppStore((s) => s.subjects);
  const chapters = useAppStore((s) => s.chapters);
  const rewards = useAppStore((s) => s.rewards);
  const sessions = useAppStore((s) => s.sessions);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const pendingOps = useAppStore((s) => s.pendingOps);

  const stats = useMemo(() => {
    const successSessions = sessions.filter((s) => s.status === "SUCCESS");
    const failSessions = sessions.filter((s) => s.status === "FAILED");
    const totalFocusMin = Math.floor(
      successSessions.reduce((acc, s) => acc + s.elapsedSeconds, 0) / 60
    );

    return { successSessions, failSessions, totalFocusMin };
  }, [sessions]);

  const subjectProgress = useMemo(() => {
    return subjects.map((sub) => {
      const subChapters = chapters.filter((c) => c.subjectId === sub.id);
      const subTasks = tasks.filter((t) => t.subjectId === sub.id && !t.deleted);
      const done = subTasks.filter((t) => t.status === "DONE").length;
      const total = subTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      const chapData = subChapters.map((ch) => {
        const chTasks = tasks.filter((t) => t.chapterId === ch.id && !t.deleted);
        const chDone = chTasks.filter((t) => t.status === "DONE").length;
        const chTotal = chTasks.length;
        const chPct = chTotal > 0 ? Math.round((chDone / chTotal) * 100) : 0;
        return { ...ch, done: chDone, total: chTotal, pct: chPct };
      });

      return { ...sub, chapters: chapData, done, total, pct };
    });
  }, [tasks, subjects, chapters]);

  const overallDone = tasks.filter((t) => !t.deleted && t.status === "DONE").length;
  const overallTotal = tasks.filter((t) => !t.deleted).length;
  const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  const formattedTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString()
    : "Never";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>📊 Progress Dashboard</Text>

      {/* ── Sync Stats card ──────────────────────────────────────────────── */}
      <View style={styles.syncCard}>
        <View style={styles.syncRow}>
          <Text style={styles.syncLabel}>Last Sync Time</Text>
          <Text style={styles.syncValue}>{formattedTime}</Text>
        </View>
        <View style={styles.syncDivider} />
        <View style={styles.syncRow}>
          <Text style={styles.syncLabel}>Sync Queue Status</Text>
          <Text style={[styles.syncValue, pendingOps.length > 0 && styles.pendingAlert]}>
            {pendingOps.length > 0 ? `⚠️ ${pendingOps.length} changes pending` : "✓ Fully synced"}
          </Text>
        </View>
      </View>

      {/* ── Rewards card ─────────────────────────────────────────────────── */}
      <View style={styles.rewardsCard}>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardEmoji}>🪙</Text>
          <Text style={styles.rewardValue}>{rewards.coins}</Text>
          <Text style={styles.rewardLabel}>Coins</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.rewardItem}>
          <Text style={styles.rewardEmoji}>🔥</Text>
          <Text style={styles.rewardValue}>{rewards.streak}</Text>
          <Text style={styles.rewardLabel}>Streak</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.rewardItem}>
          <Text style={styles.rewardEmoji}>⏱️</Text>
          <Text style={styles.rewardValue}>{rewards.todayFocusMinutes}</Text>
          <Text style={styles.rewardLabel}>Today (min)</Text>
        </View>
      </View>

      {/* ── Session stats ─────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.successSessions.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.failSessions.length}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalFocusMin}</Text>
          <Text style={styles.statLabel}>Total Focus Min</Text>
        </View>
      </View>

      {/* ── Overall progress ──────────────────────────────────────────────── */}
      <View style={styles.overallCard}>
        <View style={styles.overallHeader}>
          <Text style={styles.overallLabel}>Overall Syllabus Progress</Text>
          <Text style={styles.overallPct}>{overallPct}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${overallPct}%` as `${number}%`, backgroundColor: "#818cf8" }]} />
        </View>
        <Text style={styles.overallDetail}>{overallDone} / {overallTotal} tasks done</Text>
      </View>

      {/* ── Per-subject breakdown ─────────────────────────────────────────── */}
      {subjectProgress.map((sub) => (
        <View key={sub.id} style={styles.subjectCard}>
          <View style={styles.subjectHeader}>
            <Text style={styles.subjectName}>{sub.name}</Text>
            <Text style={styles.subjectPct}>{sub.pct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${sub.pct}%` as `${number}%` }]} />
          </View>

          {sub.chapters.map((ch) => (
            <View key={ch.id} style={styles.chapterRow}>
              <Text style={styles.chapterName}>{ch.name}</Text>
              <View style={styles.chapterRight}>
                <View style={styles.miniBar}>
                  <View style={[styles.miniBarFill, { width: `${ch.pct}%` as `${number}%` }]} />
                </View>
                <Text style={styles.chapterPct}>{ch.pct}%</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: "800", color: "#e2e8f0", marginBottom: 16 },

  syncCard: {
    backgroundColor: "#13132a", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#1e1e3a", marginBottom: 12,
  },
  syncRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  syncLabel: {
    fontSize: 12, color: "#64748b", fontWeight: "600",
  },
  syncValue: {
    fontSize: 13, color: "#cbd5e1", fontWeight: "700",
  },
  pendingAlert: {
    color: "#fbbf24",
  },
  syncDivider: {
    height: 1, backgroundColor: "#1e1e3a", marginVertical: 8,
  },

  rewardsCard: {
    backgroundColor: "#13132a", borderRadius: 16, padding: 24,
    flexDirection: "row", justifyContent: "space-around",
    borderWidth: 1, borderColor: "#312e81", marginBottom: 12,
  },
  rewardItem: { alignItems: "center", flex: 1 },
  rewardEmoji: { fontSize: 24, marginBottom: 4 },
  rewardValue: { fontSize: 28, fontWeight: "900", color: "#c7d2fe" },
  rewardLabel: { fontSize: 11, color: "#64748b", marginTop: 2, textTransform: "uppercase" },
  divider: { width: 1, backgroundColor: "#1e1e3a" },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: "#13132a", borderRadius: 12, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: "#1e1e3a",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: "#e2e8f0" },
  statLabel: { fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 4, textTransform: "uppercase" },

  overallCard: {
    backgroundColor: "#13132a", borderRadius: 12, padding: 24,
    marginBottom: 16, borderWidth: 1, borderColor: "#1e1e3a",
  },
  overallHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  overallLabel: { fontSize: 15, fontWeight: "600", color: "#94a3b8" },
  overallPct: { fontSize: 15, fontWeight: "700", color: "#818cf8" },
  overallDetail: { fontSize: 12, color: "#4a5568", marginTop: 6 },

  progressBar: { height: 10, backgroundColor: "#1e1e3a", borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 10, backgroundColor: "#38bdf8", borderRadius: 999 },

  subjectCard: {
    backgroundColor: "#13132a", borderRadius: 12, padding: 24,
    marginBottom: 12, borderWidth: 1, borderColor: "#1e1e3a",
  },
  subjectHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  subjectName: { fontSize: 16, fontWeight: "700", color: "#c7d2fe" },
  subjectPct: { fontSize: 16, fontWeight: "700", color: "#818cf8" },

  chapterRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1e2040",
  },
  chapterName: { fontSize: 13, color: "#64748b", flex: 1 },
  chapterRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniBar: { width: 60, height: 6, backgroundColor: "#1e2040", borderRadius: 999, overflow: "hidden" },
  miniBarFill: { height: 6, backgroundColor: "#38bdf8", borderRadius: 999 },
  chapterPct: { fontSize: 12, color: "#64748b", width: 32, textAlign: "right" },
});
