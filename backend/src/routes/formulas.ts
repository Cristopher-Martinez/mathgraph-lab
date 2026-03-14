import { Router, Request, Response } from "express";
import prisma from "../prismaClient";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const formulas = await prisma.formula.findMany({
      include: { topic: true },
    });
    res.json(formulas);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch formulas" });
  }
});

export default router;
