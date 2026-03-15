import { GoogleGenerativeAI } from "@google/generative-ai";
import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import prisma from "../prismaClient";
import { getRedis } from "../services/redisClient";

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many AI requests. Please wait." },
  store: new RedisStore({
    sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
  }),
});

router.use(aiLimiter);

router.post("/explain", async (req: Request, res: Response) => {
  try {
    const { problem } = req.body;
    if (!problem || typeof problem !== "string") {
      res
        .status(400)
        .json({ error: "problem is required and must be a string" });
      return;
    }

    // Check if GEMINI_API_KEY is available
    const apiKey = process.env.GEMINI_API_KEY;
    let response: string;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `Eres un tutor de matemáticas especializado en álgebra y geometría analítica.
Explica paso a paso cómo resolver el siguiente problema.
Nunca omitas pasos algebraicos.
Evita dar la respuesta final inmediatamente — guía al estudiante a través de cada transformación.

**Instrucciones de formato:**
- Usa $...$ para matemáticas en línea (ejemplo: $x + 5 = 10$)
- Usa $$...$$ para ecuaciones destacadas en línea separada
- Usa **texto** para resaltar conceptos importantes
- Usa ## para títulos de sección si es necesario
- Usa listas con * o - para enumerar pasos
- Estructura tu respuesta de forma clara y organizada

Problema: ${problem}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        response = text || "No se pudo generar una respuesta.";
        console.log(
          "Gemini response received:",
          response.substring(0, 100) + "...",
        );
      } catch (err) {
        console.error("Gemini error:", err);
        response = getFallbackExplanation(problem);
      }
    } else {
      console.log("No API key found");
      response = getFallbackExplanation(problem);
    }

    await prisma.aIInteraction.create({
      data: { prompt: problem, response },
    });

    res.json({ explanation: response });
  } catch (err) {
    res.status(500).json({ error: "AI explanation failed" });
  }
});

router.post("/validate", async (req: Request, res: Response) => {
  try {
    const { userAnswer, expectedAnswer, exercisePrompt } = req.body;
    if (!userAnswer || !expectedAnswer) {
      res
        .status(400)
        .json({ error: "userAnswer and expectedAnswer are required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash-lite",
        });

        const prompt = `Eres un validador de respuestas matemáticas. Compara la respuesta del estudiante con la respuesta esperada y determina si son semánticamente equivalentes.

Pregunta: ${exercisePrompt || "(no proporcionada)"}
Respuesta esperada: ${expectedAnswer}
Respuesta del estudiante: ${userAnswer}

Reglas:
- Ignora diferencias de formato, espacios, mayúsculas/minúsculas.
- "entero" y "Enteros" y "Z" son equivalentes. "natural" y "Naturales" y "N" son equivalentes. Igual para Q, R, C.
- Acepta variaciones válidas: "x = 5" vs "5", "-4 es entero" vs "Enteros", etc.
- Si el resultado numérico es correcto pero la clasificación o conjunto es incorrecto, marca como incorrecto.
- Sé flexible con la forma pero estricto con el contenido matemático.

Responde SOLO en este formato JSON (sin markdown, sin backticks):
{"correct": true/false, "feedback": "explicación breve en español de por qué es correcto o incorrecto"}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          res.json({
            correct: !!parsed.correct,
            feedback: parsed.feedback || "",
          });
        } else {
          res.json({
            correct: false,
            feedback: "No se pudo validar la respuesta.",
          });
        }
      } catch (err) {
        console.error("Gemini validate error:", err);
        // Fallback: comparación simple
        const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
        const correct = norm(userAnswer) === norm(expectedAnswer);
        res.json({
          correct,
          feedback: correct ? "¡Correcto!" : `Esperado: ${expectedAnswer}`,
        });
      }
    } else {
      // Sin API key: comparación simple
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
      const correct = norm(userAnswer) === norm(expectedAnswer);
      res.json({
        correct,
        feedback: correct ? "¡Correcto!" : `Esperado: ${expectedAnswer}`,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Validation failed" });
  }
});

function getFallbackExplanation(problem: string): string {
  return `## Tutor IA (modo sin conexión)

**Problema:** ${problem}

Para resolver este problema, sigue estos pasos:

* Identifica el tipo de problema (desigualdad, distancia, pendiente, ecuación de recta, etc.)
* Escribe la fórmula relevante
* Sustituye los valores dados
* Simplifica paso a paso
* Verifica tu respuesta

**Consejo:** ¡Usa la herramienta de resolución para verificar tu trabajo!`;
}

export default router;
