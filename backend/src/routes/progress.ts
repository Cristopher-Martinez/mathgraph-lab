import { Router, Request, Response } from "express";
import prisma from "../prismaClient";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const progress = await prisma.progress.findMany({
      include: { topic: true },
    });
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { topicId, completed, score } = req.body;
    if (!topicId) {
      res.status(400).json({ error: "topicId is required" });
      return;
    }

    const existing = await prisma.progress.findFirst({ where: { topicId } });
    let progress;
    if (existing) {
      progress = await prisma.progress.update({
        where: { id: existing.id },
        data: {
          completed: completed ?? existing.completed,
          score: score ?? existing.score,
        },
      });
    } else {
      progress = await prisma.progress.create({
        data: { topicId, completed: completed ?? false, score: score ?? null },
      });
    }
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to update progress" });
  }
});

export default router;
