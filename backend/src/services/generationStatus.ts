/**
 * Generation status tracker using Redis + WebSocket.
 * Persists status in Redis and broadcasts updates via socket.io.
 */
import {
  GenerationStatus,
  GenerationStep,
  getGenerationStatus as redisGet,
  getAllGenerationStatuses as redisGetAll,
  setGenerationStatus as redisSet,
} from "./redisClient";
import { broadcastGenerationUpdate } from "./websocket";

export type { GenerationStatus, GenerationStep };

async function updateAndBroadcast(status: GenerationStatus): Promise<void> {
  await redisSet(status);
  broadcastGenerationUpdate(status);
}

export async function startGeneration(
  classId: number,
  topicNames: string[],
  type: "class" | "notes" = "class",
): Promise<void> {
  const steps: GenerationStep[] = [];
  if (type === "class") {
    steps.push({ label: "Creando temas", status: "pending" });
    for (const name of topicNames) {
      steps.push({ label: `Ejercicios: ${name}`, status: "pending" });
    }
    for (const name of topicNames) {
      steps.push({ label: `Documentación: ${name}`, status: "pending" });
    }
    steps.push({ label: "Reconstruyendo DAG", status: "pending" });
    steps.push({ label: "Auditando DAG", status: "pending" });
    steps.push({ label: "Generando apuntes", status: "pending" });
  } else {
    steps.push({ label: "Generando apuntes", status: "pending" });
  }

  await updateAndBroadcast({
    classId,
    type,
    status: "running",
    steps,
    startedAt: Date.now(),
  });
}

export async function updateStep(
  classId: number,
  label: string,
  stepStatus: GenerationStep["status"],
  detail?: string,
  type: "class" | "notes" = "class",
): Promise<void> {
  const gen = await redisGet(classId, type);
  if (!gen) return;
  const step = gen.steps.find((s) => s.label === label);
  if (step) {
    step.status = stepStatus;
    if (detail) step.detail = detail;
  }
  await updateAndBroadcast(gen);
}

export async function completeGeneration(
  classId: number,
  type: "class" | "notes" = "class",
): Promise<void> {
  const gen = await redisGet(classId, type);
  if (!gen) return;
  gen.status = "done";
  gen.completedAt = Date.now();
  for (const step of gen.steps) {
    if (step.status === "pending" || step.status === "running") {
      step.status = "done";
    }
  }
  await updateAndBroadcast(gen);
}

export async function failGeneration(
  classId: number,
  error: string,
  type: "class" | "notes" = "class",
): Promise<void> {
  const gen = await redisGet(classId, type);
  if (!gen) {
    await updateAndBroadcast({
      classId,
      type,
      status: "error",
      steps: [],
      startedAt: Date.now(),
      completedAt: Date.now(),
      error,
    });
    return;
  }
  gen.status = "error";
  gen.error = error;
  gen.completedAt = Date.now();
  await updateAndBroadcast(gen);
}

export async function getGenerationStatusById(
  classId: number,
  type: "class" | "notes" = "class",
): Promise<GenerationStatus | null> {
  return redisGet(classId, type);
}

export async function getActiveGenerations(): Promise<GenerationStatus[]> {
  const all = await redisGetAll();
  return all.filter((g) => g.status === "running");
}

export async function getAllRecentStatuses(): Promise<GenerationStatus[]> {
  return redisGetAll();
}
