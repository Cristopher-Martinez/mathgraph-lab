import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import {
  checkExercise,
  distance,
  lineFromTwoPoints,
  midpoint,
  slope,
  solveAbsoluteValueInequality,
  solveLinearInequality,
  solveQuadraticInequality,
} from "../solver/algebraSolver";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { topicId, difficulty, classId } = req.query;
    const where: any = {};
    if (topicId) where.topicId = parseInt(topicId as string, 10);
    if (difficulty) where.difficulty = difficulty as string;
    if (classId) where.generatedByClassId = parseInt(classId as string, 10);

    const exercises = await prisma.exercise.findMany({
      where,
      include: {
        topic: {
          include: {
            formulas: { select: { id: true, latex: true, explanation: true } },
          },
        },
      },
    });
    res.json(exercises);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch exercises" });
  }
});

router.post("/check", async (req: Request, res: Response) => {
  try {
    const { type, params, answer } = req.body;
    if (!type || !params) {
      res.status(400).json({ error: "type and params are required" });
      return;
    }
    const result = checkExercise(type, params, answer);
    res.json(result);
  } catch (err: any) {
    res.status(422).json({ error: err.message || "Failed to check exercise" });
  }
});

router.post("/solve", async (req: Request, res: Response) => {
  try {
    const { type, params } = req.body;
    if (!type || !params) {
      res.status(400).json({ error: "type and params are required" });
      return;
    }

    let result: any;
    switch (type) {
      case "distance":
        result = { value: distance(params.pointA, params.pointB) };
        break;
      case "midpoint":
        result = midpoint(params.pointA, params.pointB);
        break;
      case "slope":
        result = slope(params.pointA, params.pointB);
        break;
      case "line_equation":
        result = lineFromTwoPoints(params.pointA, params.pointB);
        break;
      case "linear_inequality":
        result = solveLinearInequality(params.a, params.b, params.operator);
        break;
      case "absolute_inequality":
        result = solveAbsoluteValueInequality(
          params.a,
          params.b,
          params.c,
          params.operator,
        );
        break;
      case "quadratic_inequality":
        result = solveQuadraticInequality(
          params.a,
          params.b,
          params.c,
          params.operator,
        );
        break;
      default:
        res.status(400).json({ error: `Unknown type: ${type}` });
        return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(422).json({ error: err.message || "Solver error" });
  }
});

export default router;
