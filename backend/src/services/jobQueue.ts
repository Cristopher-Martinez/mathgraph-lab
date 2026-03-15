import { Queue, Worker } from "bullmq";
import { propagateClassChanges } from "./autoPropagation";
import { failGeneration } from "./generationStatus";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const connection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || "6379"),
};

let queue: Queue | null = null;
let ready = false;

// Try to initialize BullMQ (requires Redis 5+)
try {
  queue = new Queue("class-propagation", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  const worker = new Worker(
    "class-propagation",
    async (job) => {
      const { classId } = job.data;
      console.log(
        `[JobQueue] Processing propagation for class ${classId} (attempt ${job.attemptsMade + 1})`,
      );
      await propagateClassChanges(classId);
      console.log(`[JobQueue] Completed propagation for class ${classId}`);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    if (job) {
      console.error(
        `[JobQueue] Job ${job.id} failed for class ${job.data.classId}: ${err.message}`,
      );
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await failGeneration(
          job.data.classId,
          `Error tras ${job.attemptsMade} intentos: ${err.message}`,
        );
      }
    }
  });

  worker.on("ready", () => {
    ready = true;
    console.log("[JobQueue] Worker ready");
  });

  worker.on("error", (err) => {
    if (err.message.includes("Redis version")) {
      console.warn(
        "[JobQueue] Redis version too old for BullMQ, using fallback",
      );
      ready = false;
    } else {
      console.error("[JobQueue] Worker error:", err.message);
    }
  });

  console.log("[JobQueue] Worker initialized");
} catch (err: any) {
  console.warn("[JobQueue] BullMQ init failed, using fallback:", err.message);
}

/**
 * Enqueue a class propagation job.
 * Falls back to direct execution if BullMQ is unavailable.
 */
export async function enqueuePropagation(classId: number): Promise<void> {
  if (queue && ready) {
    // Prevent duplicate jobs for the same classId
    await queue.add("propagate", { classId }, {
      jobId: `propagate-${classId}`,
    });
    console.log(`[JobQueue] Enqueued propagation for class ${classId}`);
  } else {
    // Fallback: direct fire-and-forget
    console.log(`[JobQueue] Fallback: direct propagation for class ${classId}`);
    propagateClassChanges(classId).catch((err) => {
      console.error("[JobQueue] Fallback propagation error:", err);
      failGeneration(classId, err.message || "Error en propagación");
    });
  }
}
