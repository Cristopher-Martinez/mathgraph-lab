import { GoogleGenerativeAI } from "@google/generative-ai";
import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";
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

// Generate a single exercise with AI, different from existing ones
router.post("/generate-one", async (req: Request, res: Response) => {
  try {
    const { topicId, difficulty } = req.body;
    if (!topicId || !difficulty) {
      res.status(400).json({ error: "topicId and difficulty are required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "AI no disponible" });
      return;
    }

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    // Get existing exercises to avoid duplicates
    const existing = await prisma.exercise.findMany({
      where: { topicId, difficulty },
      select: { latex: true },
      take: 20,
    });
    const existingList = existing
      .map((e) => e.latex)
      .filter(Boolean)
      .slice(0, 10);

    const diffLabel =
      difficulty === "easy"
        ? "fácil"
        : difficulty === "medium"
          ? "intermedio"
          : "difícil";

    const avoidSection =
      existingList.length > 0
        ? `\n\nNO repitas estos ejercicios ya existentes:\n${existingList.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
        : "";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.8 },
    });

    const prompt = `Genera exactamente 1 ejercicio de matemáticas de nivel ${diffLabel} sobre: ${topic.name}.

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "pregunta": "enunciado claro con datos numéricos concretos",
  "solucion": "resolución paso a paso",
  "pistas": ["pista 1", "pista 2"]
}

El ejercicio debe ser ORIGINAL y DIFERENTE a los existentes.${avoidSection}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const parsed = parseGeminiJSON(text);

    if (!parsed) {
      res.status(500).json({ error: "No se pudo generar el ejercicio" });
      return;
    }
    if (
      !parsed.pregunta ||
      typeof parsed.pregunta !== "string" ||
      parsed.pregunta.trim().length < 5
    ) {
      res.status(500).json({ error: "Ejercicio generado inválido" });
      return;
    }

    const newExercise = await prisma.exercise.create({
      data: {
        topicId,
        latex: parsed.pregunta,
        difficulty,
        steps: parsed.solucion || null,
        hints: parsed.pistas ? JSON.stringify(parsed.pistas) : null,
      },
      include: { topic: true },
    });

    res.json(newExercise);
  } catch (err: any) {
    console.error("Generate one exercise error:", err);
    res.status(500).json({ error: "Error generando ejercicio" });
  }
});

export default router;
