import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import { getRedis } from "../services/redisClient";

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

// Topics filtered by recent class window
router.get("/by-window", async (req: Request, res: Response) => {
  try {
    const window = (req.query.window as string) || "week";
    const windowMap: Record<string, number> = {
      week: 7,
      month: 30,
      semester: 180,
    };
    const days = windowMap[window] || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const classes = await prisma.classLog.findMany({
      where: { date: { gte: since } },
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);

    if (classIds.length === 0) {
      res.json([]);
      return;
    }

    const topics = await prisma.topic.findMany({
      where: { createdByClassId: { in: classIds } },
      include: { exercises: true, formulas: true },
    });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch topics by window" });
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

// Resolve DAG prerequisites for a topic (BFS with Redis cache)
router.get("/:id/prerequisites", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid topic ID" });
      return;
    }

    const redis = getRedis();
    const cacheKey = `topicPrereq:${id}`;
    const cached = await redis.get(cacheKey);

    let allTopicIds: number[];
    if (cached) {
      allTopicIds = JSON.parse(cached);
    } else {
      const visited = new Set<number>();
      const queue = [id];
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
      allTopicIds = Array.from(visited);
      await redis.setex(cacheKey, 86400, JSON.stringify(allTopicIds));
    }

    const target = await prisma.topic.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    const prerequisites = await prisma.topic.findMany({
      where: { id: { in: allTopicIds.filter((tid) => tid !== id) } },
      select: { id: true, name: true },
    });

    res.json({
      target,
      prerequisites,
      allTopicIds,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prerequisites" });
  }
});

export default router;
