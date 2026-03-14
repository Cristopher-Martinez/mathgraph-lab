import { Request, Response, Router } from "express";
import prisma from "../prismaClient";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { classId } = req.query;
    const where: any = {};
    if (classId) where.createdByClassId = parseInt(classId as string, 10);

    const topics = await prisma.topic.findMany({
      where,
      include: { exercises: true, formulas: true },
    });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid topic ID" });
      return;
    }
    const topic = await prisma.topic.findUnique({
      where: { id },
      include: { exercises: true, formulas: true },
    });
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch topic" });
  }
});

export default router;
