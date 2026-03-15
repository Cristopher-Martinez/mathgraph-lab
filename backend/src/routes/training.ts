import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import prisma from "../prismaClient";
import { getRedis } from "../services/redisClient";

const router = Router();
const SESSION_TTL = 24 * 3600; // 24h

// Generate a random training session
router.post("/start", async (req: Request, res: Response) => {
  try {
    const { mode, topicId, count } = req.body;
    const exerciseCount = count || 5;

    const where: any = {};
    if (topicId) where.topicId = topicId;

    const exercises = await prisma.exercise.findMany({
      where,
      orderBy: { id: "asc" },
    });

    if (exercises.length === 0) {
      res.status(404).json({ error: "No exercises found" });
      return;
    }

    // Shuffle and pick
    const shuffled = exercises.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(
      0,
      Math.min(exerciseCount, shuffled.length),
    );

    const sessionId = randomUUID();
    const session = {
      sessionId,
      mode: mode || "guided",
      exercises: selected,
      startedAt: new Date().toISOString(),
      timeLimit: mode === "timed" ? 600 : mode === "exam" ? 1800 : null,
      current: 0,
      answers: [] as any[],
      results: [] as any[],
    };

    // Save to Redis
    const redis = getRedis();
    await redis.setex(
      `training:${sessionId}`,
      SESSION_TTL,
      JSON.stringify(session),
    );

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Failed to start training session" });
  }
});

// Save current session state
router.post("/save", async (req: Request, res: Response) => {
  try {
    const { sessionId, current, answers, results, timeLeft } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const redis = getRedis();
    const raw = await redis.get(`training:${sessionId}`);
    if (!raw) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }

    const session = JSON.parse(raw);
    session.current = current ?? session.current;
    session.answers = answers ?? session.answers;
    session.results = results ?? session.results;
    if (timeLeft !== undefined) session.timeLeft = timeLeft;
    session.lastSavedAt = Date.now();

    await redis.setex(`training:${sessionId}`, SESSION_TTL, JSON.stringify(session));
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save session" });
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

// Finish session and clean up
router.post("/finish", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    const redis = getRedis();
    await redis.del(`training:${sessionId}`);
    res.json({ finished: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to finish session" });
  }
});

export default router;
