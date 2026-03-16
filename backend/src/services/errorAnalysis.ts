import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";

const ERROR_TYPES = [
  "signo",
  "operacion",
  "conceptual",
  "calculo",
  "notacion",
  "otro",
] as const;

/**
 * Clasifica un error del estudiante usando IA y lo guarda en DB
 */
export async function classifyAndRecordError(params: {
  exerciseId?: number;
  topicId?: number;
  studentAnswer: string;
  expectedAnswer?: string;
  exerciseLatex?: string;
}): Promise<{ errorType: string; description: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
    });

    const prompt = `Clasifica el tipo de error matemático del estudiante.

Ejercicio: ${params.exerciseLatex || "(no disponible)"}
Respuesta esperada: ${params.expectedAnswer || "(no disponible)"}
Respuesta del estudiante: ${params.studentAnswer}

Categorías: signo, operacion, conceptual, calculo, notacion, otro

Responde SOLO con JSON:
{"type": "categoría", "desc": "descripción breve del error en español (1 oración)"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const errorType = ERROR_TYPES.includes(parsed.type) ? parsed.type : "otro";
    const description = parsed.desc || "Error no clasificado";

    await prisma.errorPattern.create({
      data: {
        exerciseId: params.exerciseId,
        topicId: params.topicId,
        errorType,
        description,
        studentAnswer: params.studentAnswer,
        expectedAnswer: params.expectedAnswer,
      },
    });

    return { errorType, description };
  } catch {
    return null;
  }
}

/**
 * Obtiene un resumen de patrones de error del estudiante
 */
export async function getErrorPatterns() {
  const [byType, recent, byTopic] = await Promise.all([
    // Conteo por tipo de error
    prisma.errorPattern.groupBy({
      by: ["errorType"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    // Últimos 10 errores
    prisma.errorPattern.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        errorType: true,
        description: true,
        studentAnswer: true,
        createdAt: true,
        topicId: true,
      },
    }),
    // Errores por tema
    prisma.errorPattern.groupBy({
      by: ["topicId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      where: { topicId: { not: null } },
      take: 5,
    }),
  ]);

  // Obtener nombres de temas
  const topicIds = byTopic
    .map((t) => t.topicId)
    .filter((id): id is number => id !== null);
  const topics =
    topicIds.length > 0
      ? await prisma.topic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true, name: true },
        })
      : [];
  const topicMap = new Map(topics.map((t) => [t.id, t.name]));

  return {
    byType: byType.map((t) => ({ type: t.errorType, count: t._count.id })),
    recent,
    weakTopics: byTopic.map((t) => ({
      topicId: t.topicId,
      topicName: topicMap.get(t.topicId!) || `Tema #${t.topicId}`,
      errorCount: t._count.id,
    })),
  };
}
