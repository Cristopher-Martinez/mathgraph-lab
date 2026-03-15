import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";
import { cacheKey, getCached, setCached, TTL } from "./geminiCache";

export interface CurriculumWeek {
  semana: number;
  fechaInicio: string;
  temas: string[];
}

export interface DependencyEdge {
  padre: string;
  hijo: string;
}

export interface CurriculumResult {
  semanas: CurriculumWeek[];
  dependencias: DependencyEdge[];
}

/**
 * Reconstruye el currículo a partir de las clases registradas
 * Usa Gemini 1.5 Pro por su capacidad de razonamiento
 */
export async function reconstruirCurriculo(): Promise<CurriculumResult> {
  const clases = await prisma.classLog.findMany({
    orderBy: { date: "asc" },
    select: { id: true, date: true, topics: true, summary: true },
  });

  if (clases.length === 0) {
    return { semanas: [], dependencias: [] };
  }

  // Extraer temas de cada clase
  const clasesConTemas = clases.map((c) => ({
    id: c.id,
    fecha: c.date.toISOString().split("T")[0],
    titulo: c.summary?.substring(0, 100) || `Clase ${c.id}`,
    temas: safeParseJson(c.topics),
  }));

  // Check cache
  const cInput = clasesConTemas
    .map((c) => `${c.id}:${c.fecha}:${c.temas.join(",")}`)
    .join("|");
  const key = cacheKey("curriculum", cInput);
  const cached = await getCached<CurriculumResult>(key);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Reconstrucción básica sin IA
    return reconstruccionBasica(clasesConTemas);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000,
      topP: 0.8,
    },
  });

  const prompt = `Analiza la siguiente secuencia de clases de matemáticas y reconstruye el currículo del curso.

Clases registradas:
${clasesConTemas.map((c) => `- ${c.fecha}: ${c.titulo} | Temas: ${JSON.stringify(c.temas)}`).join("\n")}

Tareas:
1. Agrupa los temas por semana
2. Normaliza los nombres de los temas (unifica sinónimos)
3. Infiere las dependencias entre temas (qué tema se necesita antes de otro)

Regla de dependencia: Si el tema A aparece antes que el tema B en múltiples clases, crea la dependencia A → B.

Responde SOLO con JSON válido:
{
  "semanas": [
    { "semana": 1, "fechaInicio": "2026-01-15", "temas": ["Distancia entre puntos", "Punto medio"] }
  ],
  "dependencias": [
    { "padre": "Distancia entre puntos", "hijo": "Pendiente" }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const texto = result.response.text();

    let jsonStr = "";
    const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const jsonMatch = texto.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
    }

    if (!jsonStr) {
      return reconstruccionBasica(clasesConTemas);
    }

    const parsed = JSON.parse(jsonStr);

    // Actualizar tabla de dependencias
    await actualizarDependencias(parsed.dependencias || []);

    const resultado: CurriculumResult = {
      semanas: parsed.semanas || [],
      dependencias: parsed.dependencias || [],
    };
    await setCached(key, resultado, TTL.CURRICULUM);
    return resultado;
  } catch (error) {
    console.error("Error en reconstrucción curricular:", error);
    return reconstruccionBasica(clasesConTemas);
  }
}

/**
 * Actualiza la tabla TopicDependency con las dependencias inferidas
 */
async function actualizarDependencias(
  dependencias: DependencyEdge[],
): Promise<void> {
  for (const dep of dependencias) {
    // Buscar o crear temas
    const padre = await prisma.topic.findFirst({
      where: { name: { contains: dep.padre } },
    });
    const hijo = await prisma.topic.findFirst({
      where: { name: { contains: dep.hijo } },
    });

    if (padre && hijo) {
      // Verificar si ya existe la dependencia
      const existente = await prisma.topicDependency.findFirst({
        where: { parentId: padre.id, childId: hijo.id },
      });

      if (!existente) {
        await prisma.topicDependency.create({
          data: { parentId: padre.id, childId: hijo.id },
        });
      }
    }
  }
}

/**
 * Reconstrucción básica sin IA (fallback)
 */
function reconstruccionBasica(
  clases: { id: number; fecha: string; titulo: string; temas: string[] }[],
): CurriculumResult {
  const semanas: CurriculumWeek[] = [];
  let semanaActual = 1;
  let ultimaFecha = "";

  for (const clase of clases) {
    const fechaClase = clase.fecha;
    if (
      ultimaFecha &&
      diasEntre(new Date(ultimaFecha), new Date(fechaClase)) >= 5
    ) {
      semanaActual++;
    }

    const semanaExistente = semanas.find((s) => s.semana === semanaActual);
    if (semanaExistente) {
      semanaExistente.temas.push(...clase.temas);
    } else {
      semanas.push({
        semana: semanaActual,
        fechaInicio: fechaClase,
        temas: [...clase.temas],
      });
    }

    ultimaFecha = fechaClase;
  }

  // Inferir dependencias simples por orden de aparición
  const dependencias: DependencyEdge[] = [];
  const temasVistos: string[] = [];

  for (const clase of clases) {
    for (const tema of clase.temas) {
      if (temasVistos.length > 0 && !temasVistos.includes(tema)) {
        const ultimo = temasVistos[temasVistos.length - 1];
        dependencias.push({ padre: ultimo, hijo: tema });
      }
      if (!temasVistos.includes(tema)) {
        temasVistos.push(tema);
      }
    }
  }

  return { semanas, dependencias };
}

function diasEntre(a: Date, b: Date): number {
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function safeParseJson(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
