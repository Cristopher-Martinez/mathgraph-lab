/**
 * In-memory tracker for background generation status.
 * Tracks the progress of class propagation (topics, exercises, DAG).
 */

export interface GenerationStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface GenerationStatus {
  classId: number;
  status: "running" | "done" | "error";
  steps: GenerationStep[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// Store status for each class (keep last 20)
const statusMap = new Map<number, GenerationStatus>();
const MAX_ENTRIES = 20;

function pruneOld() {
  if (statusMap.size > MAX_ENTRIES) {
    const oldest = [...statusMap.entries()]
      .sort((a, b) => a[1].startedAt - b[1].startedAt)
      .slice(0, statusMap.size - MAX_ENTRIES);
    for (const [key] of oldest) statusMap.delete(key);
  }
}

export function startGeneration(classId: number, topicNames: string[]): void {
  const steps: GenerationStep[] = [
    { label: "Creando temas", status: "pending" },
  ];
  for (const name of topicNames) {
    steps.push({ label: `Ejercicios: ${name}`, status: "pending" });
  }
  steps.push({ label: "Reconstruyendo DAG", status: "pending" });
  steps.push({ label: "Auditando DAG", status: "pending" });

  statusMap.set(classId, {
    classId,
    status: "running",
    steps,
    startedAt: Date.now(),
  });
  pruneOld();
}

export function updateStep(
  classId: number,
  label: string,
  status: GenerationStep["status"],
  detail?: string,
): void {
  const gen = statusMap.get(classId);
  if (!gen) return;
  const step = gen.steps.find((s) => s.label === label);
  if (step) {
    step.status = status;
    if (detail) step.detail = detail;
  }
}

export function completeGeneration(classId: number): void {
  const gen = statusMap.get(classId);
  if (!gen) return;
  gen.status = "done";
  gen.completedAt = Date.now();
  // Mark any remaining pending as done
  for (const step of gen.steps) {
    if (step.status === "pending" || step.status === "running") {
      step.status = "done";
    }
  }
}

export function failGeneration(classId: number, error: string): void {
  const gen = statusMap.get(classId);
  if (!gen) return;
  gen.status = "error";
  gen.error = error;
  gen.completedAt = Date.now();
}

export function getGenerationStatus(classId: number): GenerationStatus | null {
  return statusMap.get(classId) || null;
}

export function getActiveGenerations(): GenerationStatus[] {
  return [...statusMap.values()].filter((g) => g.status === "running");
}

export function getAllRecentStatuses(): GenerationStatus[] {
  return [...statusMap.values()].sort((a, b) => b.startedAt - a.startedAt);
}
