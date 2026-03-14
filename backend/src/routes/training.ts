import { Router, Request, Response } from "express";
import prisma from "../prismaClient";

const router = Router();

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

    const session = {
      mode: mode || "guided",
      exercises: selected,
      startedAt: new Date().toISOString(),
      timeLimit: mode === "timed" ? 600 : mode === "exam" ? 1800 : null,
    };

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Failed to start training session" });
  }
});

export default router;
