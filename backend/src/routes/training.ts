import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash, randomUUID } from "crypto";
import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import { getRedis } from "../services/redisClient";

const router = Router();
const SESSION_TTL = 24 * 3600; // 24h
const METRICS_TTL = 30 * 24 * 3600; // 30 days

// ─── Types ───

interface TrainingConfig {
  topicSelection: "manual" | "dag" | "recent";
  topicIds?: number[];
  dagRootTopicId?: number;
  recentWindow?: "week" | "month" | "semester";
  pattern?: string;
  difficultyMode: "easy" | "mixed" | "progressive";
  exercisesPerTopic: number;
  timed: boolean;
  timePerExercise?: number;
  socratic: boolean;
}

interface TrainingMetrics {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgTimePerExercise: number;
  errorsByTopic: Record<string, number>;
  errorsByDifficulty: Record<string, number>;
  hintsUsed: number;
  difficultyProgression: string[];
  timeouts: number;
  _totalTimeMs: number;
}

interface SessionState {
  sessionId: string;
  config: TrainingConfig;
  startedAt: string;
  lastSavedAt: number;
  topics: { id: number; name: string }[];
  exercises: any[];
  current: number;
  usedExerciseIds: number[];
  batchesFetched: number;
  batchGenerating: boolean;
  currentDifficulty: "facil" | "medio" | "dificil";
  consecutiveCorrect: number;
  consecutiveWrong: number;
  exercisesCompleted: number;
  results: Array<{ correct: boolean; question: string; timeout?: boolean }>;
  metrics: TrainingMetrics;
  totalExpected: number;
}

// ─── Helpers ───

function upgrade(d: string): "facil" | "medio" | "dificil" {
  if (d === "facil") return "medio";
  return "dificil";
}

function downgrade(d: string): "facil" | "medio" | "dificil" {
  if (d === "dificil") return "medio";
  return "facil";
}

function resolveDifficulty(
  mode: "easy" | "mixed" | "progressive",
  session: SessionState,
): "facil" | "medio" | "dificil" {
  if (session.exercisesCompleted === 0) return "facil";
  switch (mode) {
    case "easy":
      return "facil";
    case "mixed": {
      const r = Math.random();
      if (r < 0.4) return "facil";
      if (r < 0.8) return "medio";
      return "dificil";
    }
    case "progressive":
      return session.currentDifficulty;
  }
}

function sortTopicsByDAGDepth(
  topicIds: number[],
  dependencies: { parentId: number; childId: number }[],
): number[] {
  const depth = new Map<number, number>();

  function getDepth(id: number, visited: Set<number>): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const parents = dependencies
      .filter((d) => d.childId === id)
      .map((d) => d.parentId)
      .filter((pid) => topicIds.includes(pid));
    const d =
      parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map((p) => getDepth(p, visited)));
    depth.set(id, d);
    return d;
  }

  topicIds.forEach((id) => getDepth(id, new Set()));
  return [...topicIds].sort(
    (a, b) => (depth.get(a) || 0) - (depth.get(b) || 0),
  );
}

async function resolveTopicIds(config: TrainingConfig): Promise<number[]> {
  const redis = getRedis();

  if (config.topicSelection === "manual" && config.topicIds?.length) {
    return config.topicIds;
  }

  if (config.topicSelection === "dag" && config.dagRootTopicId) {
    const cacheKey = `topicPrereq:${config.dagRootTopicId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const visited = new Set<number>();
    const queue = [config.dagRootTopicId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const deps = await prisma.topicDependency.findMany({
        where: { childId: current },
        select: { parentId: true },
      });
      for (const d of deps) {
        if (!visited.has(d.parentId)) queue.push(d.parentId);
      }
    }
    const result = Array.from(visited);
    await redis.setex(cacheKey, 86400, JSON.stringify(result));
    return result;
  }

  if (config.topicSelection === "recent" && config.recentWindow) {
    const windowMap: Record<string, number> = {
      week: 7,
      month: 30,
      semester: 180,
    };
    const days = windowMap[config.recentWindow] || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const classes = await prisma.classLog.findMany({
      where: { date: { gte: since } },
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) return [];
    const topics = await prisma.topic.findMany({
      where: { createdByClassId: { in: classIds } },
      select: { id: true },
    });
    return topics.map((t) => t.id);
  }

  // Fallback: all topics
  const all = await prisma.topic.findMany({ select: { id: true } });
  return all.map((t) => t.id);
}

async function fetchFirstBatch(session: SessionState): Promise<any[]> {
  const { config, topics } = session;
  const batchSize = 3;
  const difficulty = resolveDifficulty(config.difficultyMode, session);
  session.currentDifficulty = difficulty;

  const topicIds = topics.map((t) => t.id);
  const where: any = {
    topicId: { in: topicIds },
    difficulty,
  };

  let exercises = await prisma.exercise.findMany({
    where,
    include: { topic: { select: { name: true } } },
    take: batchSize,
  });

  // If not enough from DB, try any difficulty
  if (exercises.length < batchSize) {
    const more = await prisma.exercise.findMany({
      where: {
        topicId: { in: topicIds },
        id: { notIn: exercises.map((e) => e.id) },
      },
      include: { topic: { select: { name: true } } },
      take: batchSize - exercises.length,
    });
    exercises = [...exercises, ...more];
  }

  return exercises;
}

function initMetrics(): TrainingMetrics {
  return {
    totalExercises: 0,
    correctCount: 0,
    accuracy: 0,
    avgTimePerExercise: 0,
    errorsByTopic: {},
    errorsByDifficulty: {},
    hintsUsed: 0,
    difficultyProgression: [],
    timeouts: 0,
    _totalTimeMs: 0,
  };
}

// ─── IA Generation ───

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, topP: 0.8 },
  });
}

async function generateBatchIA(
  topicName: string,
  difficulty: string,
  count: number,
  pattern?: string,
): Promise<any[]> {
  const model = getGeminiModel();
  const dificultadLabel =
    difficulty === "facil"
      ? "fáciles"
      : difficulty === "medio"
        ? "intermedios"
        : "difíciles";

  const patternLine = pattern
    ? `\nRESTRICCIÓN: Todos los ejercicios DEBEN requerir el uso de: ${pattern}`
    : "";

  const prompt = `Genera exactamente ${count} ejercicios de matemáticas de nivel ${dificultadLabel} sobre: ${topicName}.${patternLine}

Cada ejercicio debe tener:
- pregunta: enunciado claro y específico con datos numéricos concretos
- solucion: resolución paso a paso
- dificultad: "${difficulty}"
- tipo: categoría del ejercicio
- pistas: array con 2-3 pistas progresivas

Responde SOLO con JSON válido:
{
  "ejercicios": [
    {
      "pregunta": "...",
      "solucion": "...",
      "dificultad": "${difficulty}",
      "tipo": "${topicName}",
      "pistas": ["pista1", "pista2"]
    }
  ]
}

IMPORTANTE: Responde ÚNICAMENTE el JSON, sin texto adicional ni bloques de código.`;

  const result = await model.generateContent(prompt);
  const texto = result.response.text();

  // Parse JSON from response
  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
  }
  if (!jsonStr) return [];

  try {
    const parsed = JSON.parse(jsonStr);
    return (parsed.ejercicios || []).filter(
      (e: any) =>
        typeof e.pregunta === "string" &&
        e.pregunta.trim().length >= 5 &&
        typeof e.solucion === "string" &&
        e.solucion.trim().length > 0,
    );
  } catch {
    return [];
  }
}

// ─── Routes ───

// Start a new training session with full config
router.post("/start", async (req: Request, res: Response) => {
  try {
    const config: TrainingConfig = {
      topicSelection: req.body.topicSelection || "manual",
      topicIds: req.body.topicIds,
      dagRootTopicId: req.body.dagRootTopicId,
      recentWindow: req.body.recentWindow,
      pattern: req.body.pattern || null,
      difficultyMode: req.body.difficultyMode || "mixed",
      exercisesPerTopic: Math.min(
        10,
        Math.max(3, req.body.exercisesPerTopic || 5),
      ),
      timed: !!req.body.timed,
      timePerExercise: req.body.timed
        ? Math.min(300, Math.max(60, req.body.timePerExercise || 90))
        : undefined,
      socratic: !!req.body.socratic,
    };

    // Resolve topic IDs
    let topicIds = await resolveTopicIds(config);
    if (topicIds.length === 0) {
      res.status(404).json({ error: "No topics found for this configuration" });
      return;
    }

    // Sort by DAG depth
    const dependencies = await prisma.topicDependency.findMany({
      where: {
        OR: [{ parentId: { in: topicIds } }, { childId: { in: topicIds } }],
      },
      select: { parentId: true, childId: true },
    });
    topicIds = sortTopicsByDAGDepth(topicIds, dependencies);

    // Fetch topic names
    const topicRecords = await prisma.topic.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, name: true },
    });
    const topicMap = new Map(topicRecords.map((t) => [t.id, t.name]));
    const topics = topicIds
      .map((id) => ({ id, name: topicMap.get(id) || `Topic ${id}` }))
      .filter((t) => topicMap.has(t.id));

    const sessionId = randomUUID();
    const session: SessionState = {
      sessionId,
      config,
      startedAt: new Date().toISOString(),
      lastSavedAt: Date.now(),
      topics,
      exercises: [],
      current: 0,
      usedExerciseIds: [],
      batchesFetched: 0,
      batchGenerating: false,
      currentDifficulty: "facil",
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      exercisesCompleted: 0,
      results: [],
      metrics: initMetrics(),
      totalExpected: topics.length * config.exercisesPerTopic,
    };

    // Fetch first batch of exercises
    const firstBatch = await fetchFirstBatch(session);
    session.exercises = firstBatch;
    session.usedExerciseIds = firstBatch.map((e: any) => e.id);
    session.batchesFetched = 1;

    const redis = getRedis();
    await redis.setex(
      `training:${sessionId}`,
      SESSION_TTL,
      JSON.stringify(session),
    );

    res.json(session);
  } catch (err: any) {
    console.error("[Training] Start error:", err.message);
    res.status(500).json({ error: "Failed to start training session" });
  }
});

// Unified answer endpoint — records response, adapts difficulty, accumulates metrics
router.post("/answer", async (req: Request, res: Response) => {
  try {
    const { sessionId, correct, timeMs, timeout, hintsUsed: reqHints } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const redis = getRedis();
    const raw = await redis.get(`training:${sessionId}`);
    if (!raw) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session: SessionState = JSON.parse(raw);
    const isCorrect = correct && !timeout;

    // 1. Update streaks
    if (isCorrect) {
      session.consecutiveCorrect++;
      session.consecutiveWrong = 0;
    } else {
      session.consecutiveWrong++;
      session.consecutiveCorrect = 0;
    }
    session.exercisesCompleted++;

    // 2. Accumulate metrics
    session.metrics.totalExercises++;
    if (isCorrect) session.metrics.correctCount++;
    if (timeout) session.metrics.timeouts++;
    if (reqHints) session.metrics.hintsUsed += reqHints;
    session.metrics.accuracy =
      session.metrics.correctCount / session.metrics.totalExercises;
    session.metrics.difficultyProgression.push(session.currentDifficulty);
    session.metrics._totalTimeMs =
      (session.metrics._totalTimeMs || 0) + (timeMs || 0);
    session.metrics.avgTimePerExercise =
      session.metrics._totalTimeMs / session.metrics.totalExercises;

    // Errors by topic/difficulty
    if (!isCorrect) {
      const ex = session.exercises[session.current];
      const topicName = ex?.topic?.name || "general";
      session.metrics.errorsByTopic[topicName] =
        (session.metrics.errorsByTopic[topicName] || 0) + 1;
      session.metrics.errorsByDifficulty[session.currentDifficulty] =
        (session.metrics.errorsByDifficulty[session.currentDifficulty] || 0) +
        1;
    }

    // 3. Record result
    const ex = session.exercises[session.current];
    session.results.push({
      correct: isCorrect,
      question: ex?.latex || ex?.pregunta || "",
      timeout: !!timeout,
    });

    // 4. Advance current
    session.current++;

    // 5. Adapt difficulty (progressive mode only)
    if (session.config.difficultyMode === "progressive") {
      if (session.consecutiveCorrect >= 3) {
        session.currentDifficulty = upgrade(session.currentDifficulty);
        session.consecutiveCorrect = 0;
      }
      if (session.consecutiveWrong >= 2) {
        session.currentDifficulty = downgrade(session.currentDifficulty);
        session.consecutiveWrong = 0;
      }
    }

    // 6. Check if session is complete
    const isFinished = session.exercisesCompleted >= session.totalExpected;

    // 7. Save atomically
    session.lastSavedAt = Date.now();
    await redis.setex(
      `training:${sessionId}`,
      SESSION_TTL,
      JSON.stringify(session),
    );

    res.json({
      currentDifficulty: session.currentDifficulty,
      exercisesCompleted: session.exercisesCompleted,
      current: session.current,
      metrics: session.metrics,
      finished: isFinished,
    });
  } catch (err: any) {
    console.error("[Training] Answer error:", err.message);
    res.status(500).json({ error: "Failed to record answer" });
  }
});

// Next batch — hybrid DB + IA generation with lock
router.post("/next-batch", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const redis = getRedis();
    const raw = await redis.get(`training:${sessionId}`);
    if (!raw) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session: SessionState = JSON.parse(raw);

    // Lock guard
    if (session.batchGenerating) {
      res.json({ exercises: [], pending: true });
      return;
    }

    // Check if we already have enough
    if (session.exercisesCompleted >= session.totalExpected) {
      res.json({ exercises: [], finished: true });
      return;
    }

    session.batchGenerating = true;
    await redis.setex(
      `training:${sessionId}`,
      SESSION_TTL,
      JSON.stringify(session),
    );

    try {
      const { config, topics } = session;
      const batchSize = 3;

      // Cycle through topics
      const nextTopicIndex = (session.batchesFetched || 0) % topics.length;
      const topic = topics[nextTopicIndex];
      const difficulty = resolveDifficulty(config.difficultyMode, session);

      // 1. Try DB first (unused exercises)
      let exercises = await prisma.exercise.findMany({
        where: {
          topicId: topic.id,
          difficulty,
          id: { notIn: session.usedExerciseIds || [] },
        },
        include: { topic: { select: { name: true } } },
        take: batchSize,
      });

      // 2. If not enough, check generation cache
      if (exercises.length < batchSize) {
        const needed = batchSize - exercises.length;
        const cacheKey = `genCache:${topic.id}:${difficulty}:${config.pattern || "any"}`;
        const cachedGen = await redis.get(cacheKey);

        let generated: any[] = [];
        if (cachedGen) {
          const pool = JSON.parse(cachedGen);
          const unused = pool.filter(
            (e: any) => !session.usedExerciseIds.includes(e.id),
          );
          generated = unused.slice(0, needed);
        }

        // 3. If still not enough, generate with IA
        if (generated.length < needed) {
          const stillNeeded = needed - generated.length;
          try {
            const aiExercises = await generateBatchIA(
              topic.name,
              difficulty,
              stillNeeded,
              config.pattern || undefined,
            );

            // Deduplicate and persist
            for (const ex of aiExercises) {
              const hash = createHash("sha256")
                .update(ex.pregunta)
                .digest("hex")
                .slice(0, 16);

              // Check if similar exercise already exists
              const existing = await prisma.exercise.findFirst({
                where: { topicId: topic.id, latex: ex.pregunta },
              });

              if (!existing) {
                const saved = await prisma.exercise.create({
                  data: {
                    topicId: topic.id,
                    latex: ex.pregunta,
                    difficulty,
                    hints: JSON.stringify(ex.pistas || []),
                    steps: ex.solucion,
                  },
                });
                generated.push({
                  ...saved,
                  topic: { name: topic.name },
                });
              }
            }

            // Update generation cache
            const allForCache = [
              ...(cachedGen ? JSON.parse(cachedGen) : []),
              ...generated,
            ];
            await redis.setex(cacheKey, 43200, JSON.stringify(allForCache));
          } catch (iaErr: any) {
            console.error("[Training] IA generation failed:", iaErr.message);
          }
        }

        exercises = [...exercises, ...generated];
      }

      // Update session
      session.exercises.push(...exercises);
      session.usedExerciseIds = [
        ...(session.usedExerciseIds || []),
        ...exercises.map((e: any) => e.id).filter(Boolean),
      ];
      session.batchesFetched = (session.batchesFetched || 0) + 1;
      session.batchGenerating = false;
      session.lastSavedAt = Date.now();

      await redis.setex(
        `training:${sessionId}`,
        SESSION_TTL,
        JSON.stringify(session),
      );
      res.json({ exercises, difficulty });
    } catch (err) {
      // Release lock on error
      session.batchGenerating = false;
      await redis.setex(
        `training:${sessionId}`,
        SESSION_TTL,
        JSON.stringify(session),
      );
      throw err;
    }
  } catch (err: any) {
    console.error("[Training] Next-batch error:", err.message);
    res.status(500).json({ error: "Failed to generate batch" });
  }
});

// Resume a session
router.get("/resume/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const redis = getRedis();
    const raw = await redis.get(`training:${sessionId}`);

    if (!raw) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: "Failed to resume session" });
  }
});

// Finish session — persist metrics, update progress, clean up
router.post("/finish", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const redis = getRedis();
    const raw = await redis.get(`training:${sessionId}`);

    let metrics: TrainingMetrics | null = null;
    if (raw) {
      const session: SessionState = JSON.parse(raw);
      metrics = session.metrics;

      // Save metrics to history (TTL 30 days)
      await redis.setex(
        `metrics:${sessionId}`,
        METRICS_TTL,
        JSON.stringify({
          ...(metrics as TrainingMetrics),
          config: session.config,
          topics: session.topics,
          startedAt: session.startedAt,
          finishedAt: new Date().toISOString(),
        }),
      );

      // Update Progress table for each topic trained
      for (const topic of session.topics) {
        const topicErrors = session.metrics.errorsByTopic[topic.name] || 0;
        const topicTotal = session.results.filter((r) => {
          const ex = session.exercises.find(
            (e: any) => (e.latex || e.pregunta) === r.question,
          );
          return ex?.topicId === topic.id || ex?.topic?.name === topic.name;
        }).length;

        const score =
          topicTotal > 0
            ? ((topicTotal - topicErrors) / topicTotal) * 100
            : null;

        if (score !== null) {
          const existing = await prisma.progress.findFirst({
            where: { topicId: topic.id },
          });
          if (existing) {
            await prisma.progress.update({
              where: { id: existing.id },
              data: {
                score: Math.max(existing.score || 0, score),
                completed: score >= 80,
              },
            });
          } else {
            await prisma.progress.create({
              data: {
                topicId: topic.id,
                score,
                completed: score >= 80,
              },
            });
          }
        }
      }

      // Clean up active session
      await redis.del(`training:${sessionId}`);
    }

    res.json({ finished: true, metrics });
  } catch (err: any) {
    console.error("[Training] Finish error:", err.message);
    res.status(500).json({ error: "Failed to finish session" });
  }
});

export default router;
