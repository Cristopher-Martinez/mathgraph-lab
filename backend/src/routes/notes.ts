import { GoogleGenerativeAI } from "@google/generative-ai";
import { Router } from "express";
import prisma from "../prismaClient";

const router = Router();

/** Helper: parsear JSON de respuesta Gemini (limpia code blocks y escapes LaTeX) */
function parseGeminiJSON(text: string): any {
  const cleaned = text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  // Primer intento: parse directo
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {}

  // Segundo intento: reparar escapes LaTeX dentro de strings JSON
  // Recorrer el JSON y solo dentro de strings (entre comillas), escapar backslashes inválidos
  let raw = jsonMatch[0];
  let result = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && (i === 0 || raw[i - 1] !== "\\")) {
      inString = !inString;
      result += ch;
    } else if (inString && ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      // Escapes JSON válidos: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
      if ('"\\\/bfnrtu'.includes(next)) {
        result += ch;
      } else {
        // Escape inválido (LaTeX como \frac, \cdot, etc.) → duplicar backslash
        result += "\\\\";
      }
    } else {
      result += ch;
    }
  }

  try {
    return JSON.parse(result);
  } catch (e) {
    // Último intento: regex simple
    const fixed = jsonMatch[0].replace(/\\([^"\\/bfnrtu])/g, "\\\\$1");
    return JSON.parse(fixed);
  }
}

/** Helper: generar apuntes con Gemini para una clase */
export async function generateNotesForClass(
  classId: number,
  chunks: { text: string }[],
  apiKey: string,
): Promise<Array<{ titulo: string; contenido: string; categoria: string }>> {
  const context = chunks.map((c) => c.text).join("\n\n---\n\n");
  if (!context.trim()) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
  });

  const prompt = `Analiza los siguientes fragmentos de una transcripción de clase de matemáticas y extrae ÚNICAMENTE apuntes útiles para el estudiante.

INCLUIR:
- Consejos y recomendaciones del profesor
- Consideraciones importantes para resolver problemas
- Aclaraciones conceptuales y observaciones
- Errores comunes mencionados y cómo evitarlos
- Trucos o atajos matemáticos explicados
- Notas sobre cuándo aplicar ciertos métodos
- Definiciones y propiedades importantes mencionadas

EXCLUIR:
- Enunciados de ejercicios o actividades
- Soluciones paso a paso de problemas específicos
- Instrucciones administrativas (tareas, fechas de entrega)
- Saludos, despedidas, comentarios irrelevantes

Responde en formato JSON con esta estructura exacta:
{
  "apuntes": [
    {
      "titulo": "Título corto del apunte",
      "contenido": "Contenido del apunte con detalle. Usa LaTeX ($...$) para fórmulas.",
      "categoria": "consejo" | "concepto" | "error_comun" | "metodo" | "observacion"
    }
  ]
}

Si no hay apuntes relevantes, responde: {"apuntes": []}

FRAGMENTOS:
${context}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJSON(result.response.text());
  if (!parsed || !Array.isArray(parsed.apuntes)) return [];
  return parsed.apuntes;
}

/** Helper: formatear metadata de clase */
function formatClassMeta(cls: {
  id: number;
  date: Date;
  title: string | null;
  summary: string | null;
  topics: string | null;
}) {
  const dateStr = new Date(cls.date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  let temas: string[] = [];
  if (cls.topics) {
    try {
      temas = JSON.parse(cls.topics);
    } catch {}
  }
  return {
    classId: cls.id,
    date: cls.date,
    dateFormatted: dateStr,
    title: cls.title || `Clase del ${dateStr}`,
    summary: cls.summary,
    temas,
  };
}

/**
 * GET /notes
 * Devuelve apuntes guardados. Si una clase indexada no tiene apuntes, los genera.
 * Query params: ?classId=4 para filtrar por clase
 */
router.get("/", async (req, res) => {
  try {
    const filterClassId = req.query.classId
      ? parseInt(req.query.classId as string)
      : undefined;

    // Buscar clases indexadas
    const classes = await prisma.classLog.findMany({
      where: {
        chunks: { some: {} },
        ...(filterClassId ? { id: filterClassId } : {}),
      },
      select: {
        id: true,
        date: true,
        title: true,
        summary: true,
        topics: true,
        notes: {
          select: { id: true, titulo: true, contenido: true, categoria: true },
          orderBy: { id: "asc" },
        },
        chunks: {
          select: { text: true },
          orderBy: { index: "asc" },
        },
      },
      orderBy: { date: "desc" },
    });

    if (classes.length === 0) {
      return res.json({ notes: [], message: "No hay clases indexadas aún." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const notesPerClass = await Promise.all(
      classes.map(async (cls) => {
        const meta = formatClassMeta(cls);

        // Si ya tiene apuntes guardados, devolverlos
        if (cls.notes.length > 0) {
          return { ...meta, apuntes: cls.notes };
        }

        // Si no tiene apuntes, generarlos y guardarlos
        if (!apiKey) return null;

        try {
          const apuntes = await generateNotesForClass(
            cls.id,
            cls.chunks,
            apiKey,
          );
          if (apuntes.length === 0) return null;

          // Guardar en BD
          await prisma.classNote.createMany({
            data: apuntes.map((a) => ({
              classId: cls.id,
              titulo: a.titulo,
              contenido: a.contenido,
              categoria: a.categoria,
            })),
          });

          // Recuperar con IDs
          const saved = await prisma.classNote.findMany({
            where: { classId: cls.id },
            select: {
              id: true,
              titulo: true,
              contenido: true,
              categoria: true,
            },
            orderBy: { id: "asc" },
          });

          return { ...meta, apuntes: saved };
        } catch (err) {
          console.error(`Error generando apuntes clase ${cls.id}:`, err);
          return null;
        }
      }),
    );

    res.json({ notes: notesPerClass.filter(Boolean) });
  } catch (error: any) {
    console.error("Error obteniendo apuntes:", error);
    res.status(500).json({ error: "Error al obtener apuntes" });
  }
});

/**
 * POST /notes/:classId/regenerate
 * Regenera los apuntes de una clase (borra los anteriores).
 */
router.post("/:classId/regenerate", async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ error: "classId inválido" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY no configurada" });
    }

    const cls = await prisma.classLog.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        title: true,
        summary: true,
        topics: true,
        chunks: { select: { text: true }, orderBy: { index: "asc" } },
      },
    });

    if (!cls) return res.status(404).json({ error: "Clase no encontrada" });
    if (cls.chunks.length === 0) {
      return res.json({ apuntes: [], message: "Clase sin indexar" });
    }

    // Borrar apuntes anteriores
    await prisma.classNote.deleteMany({ where: { classId } });

    // Generar nuevos
    const apuntes = await generateNotesForClass(classId, cls.chunks, apiKey);

    if (apuntes.length > 0) {
      await prisma.classNote.createMany({
        data: apuntes.map((a) => ({
          classId,
          titulo: a.titulo,
          contenido: a.contenido,
          categoria: a.categoria,
        })),
      });
    }

    const saved = await prisma.classNote.findMany({
      where: { classId },
      select: { id: true, titulo: true, contenido: true, categoria: true },
      orderBy: { id: "asc" },
    });

    const meta = formatClassMeta(cls);
    res.json({ ...meta, apuntes: saved });
  } catch (error: any) {
    console.error("Error regenerando apuntes:", error);
    res.status(500).json({ error: "Error al regenerar apuntes" });
  }
});

/**
 * GET /notes/classes
 * Lista las clases indexadas con conteo de apuntes (para el selector/filtro).
 */
router.get("/classes", async (_req, res) => {
  try {
    const classes = await prisma.classLog.findMany({
      where: { chunks: { some: {} } },
      select: {
        id: true,
        date: true,
        title: true,
        topics: true,
        _count: { select: { notes: true } },
      },
      orderBy: { date: "desc" },
    });

    res.json(
      classes.map((c) => {
        const dateStr = new Date(c.date).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        let temas: string[] = [];
        if (c.topics) {
          try {
            temas = JSON.parse(c.topics);
          } catch {}
        }
        return {
          classId: c.id,
          date: c.date,
          dateFormatted: dateStr,
          title: c.title || `Clase del ${dateStr}`,
          temas,
          notesCount: c._count.notes,
        };
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: "Error listando clases" });
  }
});

export default router;
