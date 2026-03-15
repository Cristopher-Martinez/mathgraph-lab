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

        const prompt = `Eres un tutor matemático amigable validando la respuesta de un estudiante.

Pregunta: ${exercisePrompt || "(no proporcionada)"}
Respuesta esperada: ${expectedAnswer}
Respuesta del estudiante: ${userAnswer}

Reglas de validación:
- Ignora diferencias de formato, espacios, mayúsculas/minúsculas.
- "entero" y "Enteros" y "Z" son equivalentes. "natural" y "Naturales" y "N" son equivalentes. Igual para Q, R, C.
- Acepta variaciones válidas: "x = 5" vs "5", "-4 es entero" vs "Enteros", etc.
- Si el resultado numérico es correcto pero la clasificación o conjunto es incorrecto, marca como incorrecto.
- Sé flexible con la forma pero estricto con el contenido matemático.

Reglas de feedback:
- Si es CORRECTO: Felicita brevemente al estudiante (ej: "¡Excelente!", "¡Muy bien!", "¡Correcto!").
- Si es INCORRECTO: 
  * NO reveles la respuesta correcta
  * NO menciones la respuesta esperada directamente
  * Sé motivador: "No es correcto, pero sigue intentando", "Revisa tu razonamiento", "Vas por buen camino, pero verifica..."
  * Da una pequeña PISTA sobre qué revisar (sin dar la solución)
  * Máximo 2 oraciones

Responde SOLO en este formato JSON (sin markdown, sin backticks):
{"correct": true/false, "feedback": "mensaje breve y motivador para el estudiante"}`;

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
          feedback: correct ? "¡Correcto!" : "No es correcto. Revisa tu razonamiento e intenta nuevamente.",
        });
      }
    } else {
      // Sin API key: comparación simple
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
      const correct = norm(userAnswer) === norm(expectedAnswer);
      res.json({
        correct,
        feedback: correct ? "¡Correcto!" : "No es correcto. Revisa tu razonamiento e intenta nuevamente.",
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Validation failed" });
  }
});

// Generate topic documentation (concepts, examples, use cases, curiosities)
router.post("/topic-docs", async (req: Request, res: Response) => {
  try {
    const { topicName } = req.body;
    if (!topicName || typeof topicName !== "string") {
      res.status(400).json({ error: "topicName is required" });
      return;
    }

    const redis = getRedis();
    const cacheKey = `topicDocs:${topicName.toLowerCase().trim()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallback = getFallbackDocs(topicName);
      res.json(fallback);
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Eres un profesor de matemáticas experto. Genera documentación educativa completa sobre el tema: "${topicName}".

Responde SOLO en formato JSON válido (sin markdown, sin backticks). La estructura debe ser:
{
  "conceptos": "Explicación clara de los conceptos fundamentales del tema. Usa notación matemática cuando sea necesario. Mínimo 3-4 párrafos bien desarrollados.",
  "ejemplos": [
    {"titulo": "título corto del ejemplo", "problema": "planteamiento del problema", "solucion": "resolución paso a paso detallada"},
    {"titulo": "título corto", "problema": "...", "solucion": "..."}
  ],
  "casosDeUso": ["aplicación práctica 1 en la vida real", "aplicación práctica 2", "aplicación práctica 3"],
  "curiosidades": ["dato curioso o histórico 1", "dato curioso 2", "dato curioso 3"]
}

Reglas:
- Los conceptos deben ser claros y pedagógicos, apropiados para un estudiante universitario
- Incluye al menos 3 ejemplos resueltos paso a paso
- Los casos de uso deben ser aplicaciones reales y relevantes
- Las curiosidades deben ser datos interesantes, históricos o sorprendentes
- Usa notación matemática legible (fracciones como a/b, raíces como √, exponentes como x², etc.)
- Todo en español`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const docs = {
        conceptos: parsed.conceptos || "",
        ejemplos: Array.isArray(parsed.ejemplos) ? parsed.ejemplos : [],
        casosDeUso: Array.isArray(parsed.casosDeUso) ? parsed.casosDeUso : [],
        curiosidades: Array.isArray(parsed.curiosidades) ? parsed.curiosidades : [],
      };
      // Cache for 7 days
      await redis.setex(cacheKey, 604800, JSON.stringify(docs));
      res.json(docs);
    } else {
      res.json(getFallbackDocs(topicName));
    }
  } catch (err) {
    console.error("Topic docs generation error:", err);
    res.json(getFallbackDocs(req.body.topicName || ""));
  }
});

function getFallbackDocs(topicName: string) {
  return {
    conceptos: `Documentación para "${topicName}" no disponible sin conexión a IA. Consulta tus apuntes de clase o materiales de referencia.`,
    ejemplos: [],
    casosDeUso: ["Consulta tus apuntes de clase para ver aplicaciones prácticas."],
    curiosidades: ["Activa la conexión a la IA para ver curiosidades sobre este tema."],
  };
}

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
