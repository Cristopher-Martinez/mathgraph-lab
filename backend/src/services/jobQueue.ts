import { Queue, Worker } from "bullmq";
import { propagateClassChanges } from "./autoPropagation";
import { failGeneration } from "./generationStatus";
import { getRedis } from "./redisClient";

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
      // Check cancellation before starting
      const cancelled = await getRedis().get(`generation:cancel:${job.data.classId}`);
      if (cancelled) {
        console.log(`[JobQueue] Job cancelled for class ${job.data.classId}`);
        return;
      }

      if (job.name === "analyze-and-propagate") {
        const { classId, transcript, images } = job.data;
        console.log(
          `[JobQueue] Full analysis for class ${classId} (attempt ${job.attemptsMade + 1})`,
        );
        const { analyzeAndPropagate } = await import("./autoPropagation");
        await analyzeAndPropagate(classId, transcript, images);
      } else {
        const { classId } = job.data;
        console.log(
          `[JobQueue] Processing propagation for class ${classId} (attempt ${job.attemptsMade + 1})`,
        );
        await propagateClassChanges(classId);
      }
      console.log(`[JobQueue] Completed job for class ${job.data.classId}`);
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

/**
 * Enqueue full analysis + propagation (transcript analysis in background).
 */
export async function enqueueFullAnalysis(
  classId: number,
  transcript: string,
  images?: any[],
): Promise<void> {
  if (queue && ready) {
    await queue.add("analyze-and-propagate", { classId, transcript, images }, {
      jobId: `analyze-${classId}`,
    });
    console.log(`[JobQueue] Enqueued full analysis for class ${classId}`);
  } else {
    // Fallback: direct fire-and-forget
    console.log(`[JobQueue] Fallback: direct full analysis for class ${classId}`);
    import("./autoPropagation").then(({ analyzeAndPropagate }) => {
      analyzeAndPropagate(classId, transcript, images).catch((err) => {
        console.error("[JobQueue] Fallback analysis error:", err);
        failGeneration(classId, err.message || "Error en análisis");
      });
    });
  }
}

/**
 * Cancel a generation in progress.
 */
export async function cancelGeneration(classId: number): Promise<void> {
  await getRedis().set(`generation:cancel:${classId}`, "1", "EX", 600);
  console.log(`[JobQueue] Cancelled generation for class ${classId}`);
}
