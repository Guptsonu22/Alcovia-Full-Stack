import { Subject, Chapter, Task } from "../types";

export const INITIAL_SUBJECTS: Subject[] = [
  { id: "sub-math", name: "Mathematics" },
  { id: "sub-sci", name: "Science" },
  { id: "sub-eng", name: "English" },
];

export const INITIAL_CHAPTERS: Chapter[] = [
  { id: "ch-alg", subjectId: "sub-math", name: "Algebra" },
  { id: "ch-geo", subjectId: "sub-math", name: "Geometry" },
  { id: "ch-phy", subjectId: "sub-sci", name: "Physics" },
  { id: "ch-chem", subjectId: "sub-sci", name: "Chemistry" },
  { id: "ch-gram", subjectId: "sub-eng", name: "Grammar" },
  { id: "ch-comp", subjectId: "sub-eng", name: "Comprehension" },
];

export const INITIAL_TASKS: Task[] = [
  { id: "task-001", studentId: "student-001", subjectId: "sub-math", chapterId: "ch-alg", title: "Linear equations", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-002", studentId: "student-001", subjectId: "sub-math", chapterId: "ch-alg", title: "Quadratic equations", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-003", studentId: "student-001", subjectId: "sub-math", chapterId: "ch-alg", title: "Polynomials", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-004", studentId: "student-001", subjectId: "sub-math", chapterId: "ch-geo", title: "Triangles & congruence", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-005", studentId: "student-001", subjectId: "sub-math", chapterId: "ch-geo", title: "Circles & arcs", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-006", studentId: "student-001", subjectId: "sub-sci", chapterId: "ch-phy", title: "Laws of motion", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-007", studentId: "student-001", subjectId: "sub-sci", chapterId: "ch-phy", title: "Work, energy & power", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-008", studentId: "student-001", subjectId: "sub-sci", chapterId: "ch-phy", title: "Waves & sound", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-009", studentId: "student-001", subjectId: "sub-sci", chapterId: "ch-chem", title: "Periodic table", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-010", studentId: "student-001", subjectId: "sub-sci", chapterId: "ch-chem", title: "Chemical bonding", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-011", studentId: "student-001", subjectId: "sub-eng", chapterId: "ch-gram", title: "Tenses", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-012", studentId: "student-001", subjectId: "sub-eng", chapterId: "ch-gram", title: "Clauses & phrases", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-013", studentId: "student-001", subjectId: "sub-eng", chapterId: "ch-comp", title: "Unseen passage 1", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
  { id: "task-014", studentId: "student-001", subjectId: "sub-eng", chapterId: "ch-comp", title: "Unseen passage 2", status: "NOT_STARTED", deleted: false, lamport: 0, deviceId: "" },
];
