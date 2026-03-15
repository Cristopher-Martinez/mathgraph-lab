import { GoogleGenerativeAI } from "@google/generative-ai";
import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";

const router = Router();

/**
 * Construye el prompt para el feedback del tutor.
 */
function buildFeedbackPrompt(
  exercise: { latex: string },
  currentQuestion: string,
  expectedAnswer: string,
  studentAnswer: string,
  isCorrect: boolean,
  isPartial?: boolean,
): string {
  if (isCorrect) {
    return `Eres un tutor de matemáticas natural y directo. El estudiante resolvió correctamente un paso.

Ejercicio: ${exercise.latex}
Pregunta del paso: ${currentQuestion}
Respuesta esperada: ${expectedAnswer}
Respuesta del estudiante: ${studentAnswer}

Felicítalo brevemente (1 oración simple) y anímalo a continuar. 
- PROHIBIDO: "Excelente", "Muy bien", "Perfecto", frases genéricas
- PERMITIDO: "Correcto, continuemos", "Así es, sigamos", "Exacto, siguiente paso"
Responde en español sin emojis.`;
  } else if (isPartial) {
    return `Eres un tutor de matemáticas directo y motivador. El estudiante respondió parcialmente correcto.

Ejercicio: ${exercise.latex}
Pregunta del paso: ${currentQuestion}
Respuesta esperada: ${expectedAnswer}
Respuesta del estudiante: ${studentAnswer}

Da retroalimentación constructiva (2-3 oraciones):
- Reconoce lo que hizo bien brevemente
- Señala qué le falta o qué puede mejorar sin revelar la respuesta completa
- Da una pista para completar el razonamiento
- PROHIBIDO: frases genéricas como "Casi", "Buen intento"
- PERMITIDO: "Vas bien, pero...", "Correcto hasta aquí, falta...", "Tienes la idea, considera también..."

Responde en español sin emojis.`;
  } else {
    return `Eres un tutor de matemáticas directo y útil. El estudiante respondió incorrectamente.

Ejercicio: ${exercise.latex}
Pregunta del paso: ${currentQuestion}
Respuesta esperada: ${expectedAnswer}
Respuesta del estudiante: ${studentAnswer}

Da retroalimentación directa (2-3 oraciones):
- Indica brevemente el error sin revelar la respuesta
- Da una pista conceptual específica
- Sé empático pero directo
- PROHIBIDO: frases genéricas como "Buen intento", "Casi lo logras"
- PERMITIDO: "Te falta considerar...", "Recuerda que...", "Fíjate en..."

Responde en español sin emojis.`;
  }
}

/**
 * Genera feedback con IA (no-streaming, fallback).
 */
async function generateAIFeedback(
  exercise: { latex: string },
  currentQuestion: string,
  expectedAnswer: string,
  studentAnswer: string,
  isCorrect: boolean,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = buildFeedbackPrompt(
      exercise,
      currentQuestion,
      expectedAnswer,
      studentAnswer,
      isCorrect,
    );
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return null;
  }
}

/**
 * Normaliza una respuesta matemática para comparación.
 * Elimina espacios, convierte a minúsculas, normaliza símbolos.
 */
function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/−/g, "-")
    .replace(/\.0+$/g, "")
    .replace(/,/g, ".");
}

/**
 * Calcula similitud entre dos cadenas (Dice coefficient).
 */
function similarity(a: string, b: string): number {
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  if (na === nb) return 1;

  // Verificar formas equivalentes (e.g., "x > 3" y "3 < x")
  if (areEquivalentInequalities(na, nb)) return 1;

  const bigramsA = bigrams(na);
  const bigramsB = bigrams(nb);
  if (bigramsA.size === 0 && bigramsB.size === 0) return na === nb ? 1 : 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function bigrams(str: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    set.add(str.slice(i, i + 2));
  }
  return set;
}

/**
 * Verifica si dos desigualdades son equivalentes (e.g., "x>3" y "3<x").
 */
function areEquivalentInequalities(a: string, b: string): boolean {
  const flipOps: Record<string, string> = {
    ">": "<",
    "<": ">",
    ">=": "<=",
    "<=": ">=",
  };

  for (const [op, flipped] of Object.entries(flipOps)) {
    const partsA = a.split(op);
    const partsB = b.split(flipped);
    if (
      partsA.length === 2 &&
      partsB.length === 2 &&
      partsA[0].trim() === partsB[1].trim() &&
      partsA[1].trim() === partsB[0].trim()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Verifica la respuesta del estudiante contra la esperada.
 * Retorna objeto con: correct, partial, confidence
 */
function checkAnswer(
  userAnswer: string,
  expectedAnswer: string,
): {
  correct: boolean;
  partial: boolean;
  confidence: number;
} {
  const confidence = similarity(userAnswer, expectedAnswer);
  return {
    correct: confidence >= 0.75,
    partial: confidence >= 0.5 && confidence < 0.75,
    confidence,
  };
}

/**
 * Calcula la puntuación basada en pistas usadas.
 */
function calculateScore(hintsUsed: number, stepsRevealed: number): number {
  let score = 100;
  score -= hintsUsed * 20;
  score -= stepsRevealed * 40;
  return Math.max(score, 0);
}

/**
 * Genera pasos socráticos con IA para un ejercicio que no los tiene.
 */
async function generateSocraticSteps(exercise: {
  id: number;
  latex: string;
}): Promise<any[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Eres un tutor de matemáticas socrático. Genera pasos de razonamiento guiado para resolver este ejercicio.

Ejercicio: ${exercise.latex}

Genera un JSON array con 3-4 pasos. Cada paso tiene:
- "question": pregunta conceptual para guiar al estudiante (en español)
- "expected": la respuesta esperada breve
- "hints": array de 3 strings con pistas escaladas (conceptual, algebraica, revelar respuesta) en español

IMPORTANTE: Responde SOLO con el JSON array válido, sin markdown, sin backticks, sin explicación adicional.

Ejemplo de formato:
[{"question":"¿Cuál es el primer paso?","expected":"Aislar x","hints":["Piensa en las operaciones inversas","Mueve los términos constantes al otro lado","Aislar x"]}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extraer JSON del texto (puede venir envuelto en backticks)
    const steps = parseGeminiJSON(text);
    if (!Array.isArray(steps) || steps.length === 0) return null;

    // Validar estructura
    for (const step of steps) {
      if (!step.question || !step.expected) return null;
      if (!step.hints)
        step.hints = [
          "Piensa en las propiedades matemáticas.",
          "Intenta descomponer el problema.",
          step.expected,
        ];
    }

    // Guardar en BD para no regenerar
    await prisma.exercise.update({
      where: { id: exercise.id },
      data: { socratic: JSON.stringify(steps) },
    });

    return steps;
  } catch {
    return null;
  }
}

// POST /tutor/start — Iniciar sesión socrática
router.post("/start", async (req: Request, res: Response) => {
  try {
    const { exerciseId } = req.body;
    if (!exerciseId || typeof exerciseId !== "number") {
      res
        .status(400)
        .json({ error: "exerciseId es requerido y debe ser un número" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      res.status(404).json({ error: "Ejercicio no encontrado" });
      return;
    }

    // Intentar obtener pasos socráticos existentes
    let socratic: any[] | null = null;
    const socraticRaw = exercise.socratic;
    if (socraticRaw) {
      try {
        socratic =
          typeof socraticRaw === "string"
            ? JSON.parse(socraticRaw)
            : (socraticRaw as unknown as any[]);
        if (!Array.isArray(socratic) || socratic.length === 0) socratic = null;
      } catch {
        socratic = null;
      }
    }

    // Si no hay pasos, generarlos con IA
    if (!socratic) {
      socratic = await generateSocraticSteps(exercise);
    }

    if (!socratic || socratic.length === 0) {
      res.status(400).json({
        error: "No se pudieron generar pasos socráticos para este ejercicio",
      });
      return;
    }

    res.json({
      exerciseId: exercise.id,
      question: exercise.latex,
      totalSteps: socratic.length,
      step: 0,
      tutorQuestion: socratic[0].question,
      socratic,
    });
  } catch (err) {
    res.status(500).json({ error: "Error al iniciar sesión socrática" });
  }
});

// POST /tutor/answer — Enviar respuesta a un paso socrático
router.post("/answer", async (req: Request, res: Response) => {
  try {
    const { exerciseId, step, answer } = req.body;
    if (!exerciseId || typeof step !== "number" || !answer) {
      res
        .status(400)
        .json({ error: "exerciseId, step y answer son requeridos" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      res.status(404).json({ error: "Ejercicio no encontrado" });
      return;
    }

    const socraticRaw = exercise.socratic;
    let socratic: any[];
    try {
      socratic =
        typeof socraticRaw === "string"
          ? JSON.parse(socraticRaw)
          : (socraticRaw as unknown as any[]);
    } catch {
      res.status(400).json({ error: "Datos socráticos inválidos" });
      return;
    }
    if (!socratic || !Array.isArray(socratic)) {
      res.status(400).json({ error: "Ejercicio sin pasos socráticos" });
      return;
    }

    if (step < 0 || step >= socratic.length) {
      res.status(400).json({ error: "Paso fuera de rango" });
      return;
    }

    const currentStep = socratic[step];
    const isCorrect = checkAnswer(answer, currentStep.expected);
    const isLastStep = step >= socratic.length - 1;

    if (isCorrect) {
      const aiFeedback = await generateAIFeedback(
        exercise,
        currentStep.question,
        currentStep.expected,
        answer,
        true,
      );
      if (isLastStep) {
        res.json({
          correct: true,
          feedback:
            aiFeedback ||
            "¡Excelente! Has completado todos los pasos de razonamiento.",
          completed: true,
        });
      } else {
        res.json({
          correct: true,
          feedback:
            aiFeedback || "¡Correcto! Continuemos con el siguiente paso.",
          nextStep: step + 1,
          tutorQuestion: socratic[step + 1].question,
        });
      }
    } else {
      const aiFeedback = await generateAIFeedback(
        exercise,
        currentStep.question,
        currentStep.expected,
        answer,
        false,
      );
      res.json({
        correct: false,
        feedback:
          aiFeedback ||
          "No es del todo correcto. Piensa en el concepto involucrado e inténtalo de nuevo.",
        step,
        tutorQuestion: currentStep.question,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Error al procesar respuesta" });
  }
});

// POST /tutor/answer-stream — Enviar respuesta con feedback en streaming SSE
router.post("/answer-stream", async (req: Request, res: Response) => {
  try {
    const { exerciseId, step, answer } = req.body;
    if (!exerciseId || typeof step !== "number" || !answer) {
      res
        .status(400)
        .json({ error: "exerciseId, step y answer son requeridos" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) {
      res.status(404).json({ error: "Ejercicio no encontrado" });
      return;
    }

    const socraticRaw = exercise.socratic;
    let socratic: any[];
    try {
      socratic =
        typeof socraticRaw === "string"
          ? JSON.parse(socraticRaw)
          : (socraticRaw as unknown as any[]);
    } catch {
      res.status(400).json({ error: "Datos socráticos inválidos" });
      return;
    }
    if (!socratic || !Array.isArray(socratic)) {
      res.status(400).json({ error: "Sin pasos socráticos" });
      return;
    }
    if (step < 0 || step >= socratic.length) {
      res.status(400).json({ error: "Paso fuera de rango" });
      return;
    }

    const currentStepData = socratic[step];
    const answerCheck = checkAnswer(answer, currentStepData.expected);
    const isCorrect = answerCheck.correct;
    const isPartial = answerCheck.partial;
    const confidence = answerCheck.confidence;
    const isLastStep = step >= socratic.length - 1;

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send result event immediately
    const resultPayload: any = {
      correct: isCorrect,
      partial: isPartial,
      confidence: confidence,
    };
    if (isCorrect && isLastStep) {
      resultPayload.completed = true;
    } else if (isCorrect || isPartial) {
      // Tanto respuestas correctas como parciales avanzan al siguiente paso
      resultPayload.nextStep = step + 1;
      resultPayload.tutorQuestion = isLastStep
        ? ""
        : socratic[step + 1].question;
      if (isPartial && isLastStep) {
        resultPayload.completed = true;
      }
    } else {
      resultPayload.step = step;
      resultPayload.tutorQuestion = currentStepData.question;
    }
    res.write(`event: result\ndata: ${JSON.stringify(resultPayload)}\n\n`);

    // Try streaming AI feedback
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = buildFeedbackPrompt(
          exercise,
          currentStepData.question,
          currentStepData.expected,
          answer,
          isCorrect,
          isPartial,
        );
        const streamResult = await model.generateContentStream(prompt);

        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text) {
            res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
          }
        }
      } catch {
        // AI failed, send static fallback as single chunk
        const fallback = isCorrect
          ? "¡Correcto! Continuemos con el siguiente paso."
          : isPartial
            ? `Vas por buen camino (${Math.round(confidence * 100)}% correcto), pero puedes mejorar tu respuesta. Piensa con más detalle en el concepto.`
            : "No es del todo correcto. Piensa en el concepto involucrado e inténtalo de nuevo.";
        res.write(
          `event: chunk\ndata: ${JSON.stringify({ text: fallback })}\n\n`,
        );
      }
    } else {
      const fallback = isCorrect
        ? "¡Correcto! Continuemos con el siguiente paso."
        : isPartial
          ? `Vas por buen camino (${Math.round(confidence * 100)}% correcto), pero puedes mejorar tu respuesta. Piensa con más detalle en el concepto.`
          : "No es del todo correcto. Piensa en el concepto involucrado e inténtalo de nuevo.";
      res.write(
        `event: chunk\ndata: ${JSON.stringify({ text: fallback })}\n\n`,
      );
    }

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al procesar respuesta" });
    } else {
      res.end();
    }
  }
});

// POST /tutor/hint — Generar pista incremental con IA
router.post("/hint", async (req: Request, res: Response) => {
  try {
    const { exerciseId, step, hintLevel, previousHints, studentAttempts } =
      req.body;
    if (!exerciseId || typeof step !== "number") {
      res.status(400).json({ error: "exerciseId y step son requeridos" });
      return;
    }

    const level = typeof hintLevel === "number" ? hintLevel : 1;

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      res.status(404).json({ error: "Ejercicio no encontrado" });
      return;
    }

    const socraticRaw = exercise.socratic;
    let socratic: any[];
    try {
      socratic =
        typeof socraticRaw === "string"
          ? JSON.parse(socraticRaw)
          : (socraticRaw as unknown as any[]);
    } catch {
      res.status(400).json({ error: "Datos socráticos inválidos" });
      return;
    }
    if (!socratic || !Array.isArray(socratic)) {
      res.status(400).json({ error: "Ejercicio sin pasos socráticos" });
      return;
    }

    if (step < 0 || step >= socratic.length) {
      res.status(400).json({ error: "Paso fuera de rango" });
      return;
    }

    const currentStep = socratic[step];
    const apiKey = process.env.GEMINI_API_KEY;
    let hint: string;

    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash-lite",
        });

        const prevHintsText =
          Array.isArray(previousHints) && previousHints.length > 0
            ? `\nPistas anteriores que ya se dieron (NO repitas estas):\n${previousHints.map((h: string, i: number) => `${i + 1}. ${h}`).join("\n")}`
            : "";

        const attemptsText =
          Array.isArray(studentAttempts) && studentAttempts.length > 0
            ? `\nIntentos del estudiante (respuestas incorrectas previas):\n${studentAttempts.map((a: string, i: number) => `- Intento ${i + 1}: "${a}"`).join("\n")}`
            : "";

        const prompt = `Eres un tutor de matemáticas socrático. Genera UNA pista para ayudar al estudiante.

Ejercicio: ${exercise.latex}
Pregunta actual: ${currentStep.question}
Respuesta esperada: ${currentStep.expected}
Nivel de pista: ${level} (mayor = más reveladora)${prevHintsText}${attemptsText}

Reglas:
- Nivel 1-2: Pista conceptual, menciona qué propiedad o fórmula aplicar sin dar números.
- Nivel 3-4: Pista más directa, indica los pasos algebraicos específicos.
- Nivel 5+: Muy directa, casi revela la respuesta pero deja que el estudiante haga el último paso.
- NUNCA repitas una pista anterior. Cada pista debe añadir información nueva.
- Considera los intentos fallidos del estudiante para orientar mejor la pista.
- Responde SOLO con el texto de la pista en español, sin formato especial, 1-2 oraciones máximo.`;

        const result = await model.generateContent(prompt);
        hint = result.response.text().trim();
      } catch {
        // Fallback si IA falla
        const staticHints = currentStep.hints as string[] | undefined;
        if (staticHints && staticHints.length > 0) {
          hint = staticHints[Math.min(level - 1, staticHints.length - 1)];
        } else {
          hint =
            level <= 2
              ? "Piensa en las propiedades matemáticas que se aplican a este tipo de problema."
              : `Pista directa: la respuesta esperada es "${currentStep.expected}".`;
        }
      }
    } else {
      // Sin API key: pistas estáticas
      const staticHints = currentStep.hints as string[] | undefined;
      if (staticHints && staticHints.length > 0) {
        hint = staticHints[Math.min(level - 1, staticHints.length - 1)];
      } else {
        hint =
          level <= 2
            ? "Piensa en las propiedades matemáticas que se aplican a este tipo de problema."
            : `La respuesta esperada es: ${currentStep.expected}`;
      }
    }

    // Penalización gradual: 10pts por las primeras 3, luego 5pts extra por cada una
    const scorePenalty = level <= 3 ? level * 10 : 30 + (level - 3) * 5;

    res.json({
      hint,
      level,
      revealed: false,
      scorePenalty,
    });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener pista" });
  }
});

// POST /tutor/summary — Obtener resumen de la sesión socrática
router.post("/summary", async (req: Request, res: Response) => {
  try {
    const { exerciseId, stepsSolved, hintsUsed, stepsRevealed } = req.body;
    if (!exerciseId || typeof stepsSolved !== "number") {
      res
        .status(400)
        .json({ error: "exerciseId y stepsSolved son requeridos" });
      return;
    }

    const hints = typeof hintsUsed === "number" ? hintsUsed : 0;
    const revealed = typeof stepsRevealed === "number" ? stepsRevealed : 0;
    const score = calculateScore(hints, revealed);

    res.json({
      exerciseId,
      stepsSolved,
      hintsUsed: hints,
      stepsRevealed: revealed,
      score,
    });
  } catch (err) {
    res.status(500).json({ error: "Error al generar resumen" });
  }
});

// POST /tutor/ask — Hacer una pregunta al tutor sobre el paso actual
router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { exerciseId, step, question } = req.body;
    if (!exerciseId || typeof step !== "number" || !question) {
      res
        .status(400)
        .json({ error: "exerciseId, step y question son requeridos" });
      return;
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      res.status(404).json({ error: "Ejercicio no encontrado" });
      return;
    }

    const socraticRaw = exercise.socratic;
    let socratic: any[];
    try {
      socratic =
        typeof socraticRaw === "string"
          ? JSON.parse(socraticRaw)
          : (socraticRaw as unknown as any[]);
    } catch {
      res.status(400).json({ error: "Datos socráticos inválidos" });
      return;
    }
    if (!socratic || !Array.isArray(socratic)) {
      res.status(400).json({ error: "Ejercicio sin pasos socráticos" });
      return;
    }

    if (step < 0 || step >= socratic.length) {
      res.status(400).json({ error: "Paso fuera de rango" });
      return;
    }

    const currentStep = socratic[step];
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.json({
        answer:
          "No tengo acceso a IA en este momento. Intenta usar el botón de pista.",
        isActuallyAnswer: false,
      });
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });

      const prompt = `Eres un tutor de matemáticas socrático natural y directo. El estudiante te hace una pregunta sobre el paso actual.

Ejercicio: ${exercise.latex}
Pregunta del paso: ${currentStep.question}
Respuesta esperada: ${currentStep.expected}
Pregunta del estudiante: "${question}"

**Instrucciones:**
1. Detecta si el estudiante está intentando RESPONDER en lugar de PREGUNTAR:
   - Si parece una respuesta (ej: "x=5", "Enteros", "la respuesta es...", un número/fórmula sin contexto)
   - Responde: {"isActuallyAnswer": true, "answer": "Parece que estás intentando responder. Cambia al modo Respuesta para verificar tu solución."}

2. Si es una pregunta válida sobre el ejercicio:
   - Responde de forma DIRECTA y CONVERSACIONAL, sin frases genéricas
   - PROHIBIDO usar: "Excelente pregunta", "Buena pregunta", "Gran pregunta", etc.
   - Ve directo al punto: menciona la fórmula, propiedad o concepto que necesita
   - Puedes dar ejemplos similares si los pide
   - NO reveles la respuesta exacta
   - Sé breve (máximo 2-3 oraciones)
   
   Ejemplos de respuestas naturales:
   - "Para este tipo de problemas usa la fórmula de distancia: d = √[(x₂-x₁)² + (y₂-y₁)²]"
   - "Sí, esa fórmula funciona aquí. Sustituye los valores de los puntos."
   - "Piensa en cómo se comporta el valor absoluto: |x| > a significa x > a o x < -a"

3. Si la pregunta es irrelevante:
   - Redirige: "Enfoquémonos en: ${currentStep.question}"

Responde SOLO con JSON válido (sin markdown, sin backticks):
{"isActuallyAnswer": false, "answer": "tu respuesta directa aquí"}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Extraer JSON
      const parsed = parseGeminiJSON(text);
      if (parsed) {
        res.json({
          answer: parsed.answer || "No pude procesar tu pregunta.",
          isActuallyAnswer: !!parsed.isActuallyAnswer,
        });
      } else {
        res.json({
          answer:
            "Puedo ayudarte con preguntas conceptuales. ¿Qué quieres saber sobre este paso?",
          isActuallyAnswer: false,
        });
      }
    } catch (err) {
      console.error("Error generating tutor answer:", err);
      res.json({
        answer:
          "Hubo un error al procesar tu pregunta. Intenta reformularla o usa el botón de pista.",
        isActuallyAnswer: false,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Error al procesar pregunta" });
  }
});

export default router;
