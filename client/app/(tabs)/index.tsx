import React, { useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from "react-native";
import { useAppStore } from "../../src/store/useAppStore";
import { Task, TaskStatus } from "../../src/types";

const STATUS_ORDER: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE"];

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "⚪ Not started",
  IN_PROGRESS: "🟡 In progress",
  DONE: "🟢 Done",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  NOT_STARTED: "#4a5568",
  IN_PROGRESS: "#d69e2e",
  DONE: "#48bb78",
};

function nextStatus(current: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

function TaskItem({ task }: { task: Task }) {
  const changeTaskStatus = useAppStore((s) => s.changeTaskStatus);

  if (task.deleted) return null;

  const next = nextStatus(task.status);

  return (
    <View style={styles.taskRow}>
      <TouchableOpacity
        style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[task.status] + "22", borderColor: STATUS_COLOR[task.status] }]}
        onPress={() => changeTaskStatus(task.id, next)}
        accessibilityLabel={`Task ${task.title}, status ${STATUS_LABEL[task.status]}. Tap to mark ${STATUS_LABEL[next]}`}
      >
        <Text style={styles.statusText}>
          {task.status === "DONE" ? "🟢" : task.status === "IN_PROGRESS" ? "🟡" : "⚪"}
        </Text>
      </TouchableOpacity>
      <View style={styles.taskInfo}>
        <Text style={[styles.taskTitle, task.status === "DONE" && styles.taskDone]}>
          {task.title}
        </Text>
        <Text style={styles.taskMeta}>
          {STATUS_LABEL[task.status]} · L={task.lamport}
        </Text>
      </View>
    </View>
  );
}

function ChapterSection({
  chapterId, chapterName, tasks,
}: { chapterId: string; chapterName: string; tasks: Task[] }) {
  const chapterTasks = tasks.filter((t) => t.chapterId === chapterId && !t.deleted);
  const done = chapterTasks.filter((t) => t.status === "DONE").length;
  const total = chapterTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (chapterTasks.length === 0) return null;

  return (
    <View style={styles.chapterSection}>
      <View style={styles.chapterHeader}>
        <Text style={styles.chapterName}>{chapterName}</Text>
        <Text style={styles.chapterProgress}>{done}/{total} · {pct}%</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      {chapterTasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </View>
  );
}

export default function TasksScreen() {
  const tasks = useAppStore((s) => s.tasks);
  const subjects = useAppStore((s) => s.subjects);
  const chapters = useAppStore((s) => s.chapters);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);

  const subjectData = useMemo(() => {
    return subjects.map((sub) => {
      const subChapters = chapters.filter((c) => c.subjectId === sub.id);
      const subTasks = tasks.filter((t) => t.subjectId === sub.id && !t.deleted);
      const done = subTasks.filter((t) => t.status === "DONE").length;
      const total = subTasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { ...sub, chapters: subChapters, done, total, pct };
    });
  }, [tasks, subjects, chapters]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📚 Syllabus</Text>
        <View style={styles.syncStatus}>
          {isSyncing && <ActivityIndicator size="small" color="#818cf8" />}
          {!isSyncing && lastSyncAt && (
            <Text style={styles.syncTime}>
              Synced {new Date(lastSyncAt).toLocaleTimeString()}
            </Text>
          )}
        </View>
      </View>

      {subjectData.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Loading subjects...</Text>
          <Text style={styles.emptyHint}>Make sure the server is running</Text>
        </View>
      )}

      {subjectData.map((sub) => (
        <View key={sub.id} style={styles.subjectCard}>
          <View style={styles.subjectHeader}>
            <Text style={styles.subjectName}>{sub.name}</Text>
            <View style={styles.subjectBadge}>
              <Text style={styles.subjectPct}>{sub.pct}%</Text>
            </View>
          </View>
          <View style={styles.subjectProgressBar}>
            <View style={[styles.subjectProgressFill, { width: `${sub.pct}%` as `${number}%` }]} />
          </View>
          {sub.chapters.map((ch) => (
            <ChapterSection
              key={ch.id}
              chapterId={ch.id}
              chapterName={ch.name}
              tasks={tasks}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#e2e8f0" },
  syncStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  syncTime: { fontSize: 11, color: "#4a5568" },

  subjectCard: {
    backgroundColor: "#13132a",
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1e1e3a",
  },
  subjectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  subjectName: { fontSize: 18, fontWeight: "700", color: "#c7d2fe" },
  subjectBadge: { backgroundColor: "#312e81", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  subjectPct: { fontSize: 13, fontWeight: "700", color: "#818cf8" },
  subjectProgressBar: { height: 10, backgroundColor: "#1e1e3a", borderRadius: 999, marginBottom: 12 },
  subjectProgressFill: { height: 10, backgroundColor: "#818cf8", borderRadius: 999 },

  chapterSection: { marginTop: 8 },
  chapterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  chapterName: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  chapterProgress: { fontSize: 12, color: "#64748b" },
  progressBar: { height: 8, backgroundColor: "#1e2d40", borderRadius: 999, marginBottom: 8 },
  progressFill: { height: 8, backgroundColor: "#38bdf8", borderRadius: 999 },

  taskRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  statusBadge: {
    width: 32, height: 32, borderRadius: 8, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  statusText: { fontSize: 14, fontWeight: "700" },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, color: "#e2e8f0", fontWeight: "500" },
  taskDone: { color: "#4a5568", textDecorationLine: "line-through" },
  taskMeta: { fontSize: 11, color: "#4a5568", marginTop: 2 },

  empty: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 18, color: "#4a5568", marginBottom: 8 },
  emptyHint: { fontSize: 13, color: "#2d3748" },
});
