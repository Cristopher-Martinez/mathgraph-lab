import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";
import { cacheKey, getCached, setCached, TTL } from "./geminiCache";

// ─── Sanitización de transcripciones ──────────────────

// Muletillas y rellenos comunes en español (speech-to-text)
const FILLER_WORDS = /\b(eh+|um+|mm+|hmm+|ah+|este|pues nada|o sea|digamos|bueno bueno|a ver a ver)\b/gi;

/**
 * Sanitiza una transcripción de voz-a-texto con limpieza basada en regex.
 * Elimina repeticiones, muletillas, normaliza espacios y párrafos.
 */
export function sanitizeTranscript(raw: string): string {
  let text = raw;

  // 1. Normalizar saltos de línea
  text = text.replace(/\r\n/g, "\n");

  // 2. Eliminar palabras consecutivas repetidas (ej: "el el el" → "el")
  text = text.replace(/\b(\w+)(?:\s+\1){1,}\b/gi, "$1");

  // 3. Eliminar muletillas comunes
  text = text.replace(FILLER_WORDS, "");

  // 4. Normalizar espacios múltiples → uno solo
  text = text.replace(/[ \t]{2,}/g, " ");

  // 5. Normalizar saltos de línea excesivos (3+ → 2)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 6. Eliminar líneas que son solo espacios
  text = text.replace(/^\s+$/gm, "");

  // 7. Limpiar puntuación redundante (... ... → ...)
  text = text.replace(/\.{4,}/g, "...");
  text = text.replace(/,{2,}/g, ",");

  // 8. Trim por línea
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // 9. Trim final
  text = text.trim();

  return text;
}

/**
 * Sanitización profunda usando Gemini: reescribe la transcripción
 * como texto coherente preservando todo el contenido matemático.
 */
export async function sanitizeTranscriptAI(
  raw: string,
  summary?: string | null,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  // Primero limpieza regex
  const cleaned = sanitizeTranscript(raw);

  // Si es corto, no vale la pena pasar por AI
  if (cleaned.length < 500) return cleaned;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });

  const SANITIZE_PROMPT = `Eres un editor académico. Tu tarea es limpiar y reestructurar una transcripción de voz-a-texto de una clase de matemáticas.

REGLAS:
- PRESERVA todo el contenido académico: definiciones, fórmulas, ejemplos, explicaciones
- ELIMINA muletillas, repeticiones, falsos inicios, ruido del speech-to-text
- REORGANIZA en párrafos coherentes por tema/concepto
- MANTÉN un tono formal pero accesible
- NO inventes contenido que no esté en la transcripción original
- NO resumas: mantén el detalle completo de las explicaciones
${summary ? `\nContexto: ${summary}` : ""}

Transcripción a limpiar:
${cleaned.slice(0, 30000)}`;

  try {
    const cKey = cacheKey("sanitize", cleaned.slice(0, 200) + cleaned.length);
    const cached = await getCached<string>(cKey);
    if (cached) return cached;

    const result = await model.generateContent(SANITIZE_PROMPT);
    const sanitized = result.response.text().trim();

    if (sanitized.length > 100) {
      await setCached(cKey, sanitized, TTL.TRANSCRIPT);
      console.log(
        `[RAG] Transcripción sanitizada por AI: ${cleaned.length} → ${sanitized.length} chars`,
      );
      return sanitized;
    }
  } catch (err) {
    console.error("[RAG] Error en sanitización AI, usando limpieza regex:", err);
  }

  return cleaned;
}

// ─── Chunking ─────────────────────────────────────────

const CHUNK_SIZE = 800; // ~800 tokens por chunk
const CHUNK_OVERLAP = 150; // Overlap para mantener contexto entre chunks

/**
 * Divide un texto en chunks semánticos con overlap.
 * Respeta límites de párrafos/oraciones cuando es posible.
 */
export function chunkText(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  const cleaned = text.trim();
  if (cleaned.length <= CHUNK_SIZE) return [cleaned];

  const chunks: string[] = [];
  const paragraphs = cleaned.split(/\n\s*\n/);
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= CHUNK_SIZE) {
      current += (current ? "\n\n" : "") + trimmed;
    } else {
      if (current) {
        chunks.push(current);
        // Overlap: tomar las últimas ~CHUNK_OVERLAP chars del chunk anterior
        const overlapStart = Math.max(0, current.length - CHUNK_OVERLAP);
        current = current.slice(overlapStart) + "\n\n" + trimmed;
      } else {
        current = trimmed;
      }

      // Si el chunk actual es demasiado largo, dividir por oraciones
      while (current.length > CHUNK_SIZE) {
        const cutPoint = findBestCut(current, CHUNK_SIZE);
        chunks.push(current.slice(0, cutPoint).trim());
        const overlapStart = Math.max(0, cutPoint - CHUNK_OVERLAP);
        current = current.slice(overlapStart).trim();
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 30); // Eliminar chunks muy cortos
}

function findBestCut(text: string, maxLen: number): number {
  // Buscar el mejor punto de corte: fin de oración, luego nueva línea, luego espacio
  const segment = text.slice(0, maxLen);
  const sentenceEnd = Math.max(
    segment.lastIndexOf(". "),
    segment.lastIndexOf(".\n"),
    segment.lastIndexOf("? "),
    segment.lastIndexOf("! "),
  );
  if (sentenceEnd > maxLen * 0.5) return sentenceEnd + 1;

  const newline = segment.lastIndexOf("\n");
  if (newline > maxLen * 0.3) return newline;

  const space = segment.lastIndexOf(" ");
  if (space > maxLen * 0.3) return space;

  return maxLen;
}

// ─── Embeddings ───────────────────────────────────────

/**
 * Genera embeddings usando Gemini text-embedding-004.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const key = cacheKey("emb", text);
  const cached = await getCached<number[]>(key);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-embedding-001",
  });

  const result = await model.embedContent(text);
  const values = result.embedding.values;
  await setCached(key, values, TTL.EMBEDDING);
  return values;
}

/**
 * Genera embeddings para múltiples textos en batch.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Check cache for each text individually
  const results: number[][] = new Array(texts.length);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < texts.length; i++) {
    const key = cacheKey("emb", texts[i]);
    const cached = await getCached<number[]>(key);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) return results;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-embedding-001",
  });

  // Procesar solo los no cacheados en batches de 5
  for (let i = 0; i < uncachedIndices.length; i += 5) {
    const batchIndices = uncachedIndices.slice(i, i + 5);
    const batchResults = await Promise.all(
      batchIndices.map(async (idx) => {
        const result = await model.embedContent(texts[idx]);
        return { idx, values: result.embedding.values };
      }),
    );
    for (const { idx, values } of batchResults) {
      results[idx] = values;
      await setCached(cacheKey("emb", texts[idx]), values, TTL.EMBEDDING);
    }
  }

  return results;
}

// ─── Almacenamiento ───────────────────────────────────

/**
 * Procesa una transcripción: la divide en chunks, genera embeddings
 * y los almacena en la BD.
 */
export async function indexClassTranscript(
  classId: number,
  transcript: string,
  summary?: string | null,
): Promise<{ chunksCreated: number }> {
  // Sanitizar transcripción antes de indexar
  let cleanText: string;
  try {
    cleanText = await sanitizeTranscriptAI(transcript, summary);
  } catch {
    cleanText = sanitizeTranscript(transcript);
  }

  // Incluir el resumen como primer chunk de contexto
  const fullText = summary
    ? `Resumen de la clase: ${summary}\n\n${cleanText}`
    : cleanText;

  const chunks = chunkText(fullText);
  if (chunks.length === 0) return { chunksCreated: 0 };

  console.log(
    `[RAG] Generando embeddings para clase #${classId}: ${chunks.length} chunks`,
  );

  // Eliminar chunks anteriores si los hay (re-indexación)
  await prisma.classChunk.deleteMany({ where: { classId } });

  // Generar embeddings
  const embeddings = await generateEmbeddings(chunks);

  // Almacenar en BD
  await prisma.classChunk.createMany({
    data: chunks.map((text, i) => ({
      classId,
      text,
      embedding: JSON.stringify(embeddings[i]),
      index: i,
    })),
  });

  console.log(`[RAG] Indexados ${chunks.length} chunks para clase #${classId}`);
  return { chunksCreated: chunks.length };
}

// ─── Búsqueda ─────────────────────────────────────────

/**
 * Similitud coseno entre dos vectores.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Busca los chunks más relevantes para una consulta.
 */
export async function searchChunks(
  query: string,
  options?: {
    classId?: number; // Filtrar por clase específica
    dateFrom?: string; // Fecha desde (ISO)
    dateTo?: string; // Fecha hasta (ISO)
    topK?: number; // Número de resultados (default: 5)
    minScore?: number; // Similitud mínima (default: 0.3)
  },
): Promise<
  Array<{
    text: string;
    classId: number;
    score: number;
    index: number;
  }>
> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.3;

  // Generar embedding de la consulta
  const queryEmbedding = await generateEmbedding(query);

  // Construir filtro where
  const where: any = {};

  if (options?.classId) {
    where.classId = options.classId;
  }

  // Filtrar por rango de fechas
  if (options?.dateFrom || options?.dateTo) {
    const dateFilter: any = {};
    if (options.dateFrom) {
      dateFilter.gte = new Date(options.dateFrom);
    }
    if (options.dateTo) {
      // Incluir todo el último día
      const endDate = new Date(options.dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }
    where.classLog = {
      date: dateFilter,
    };
  }

  const allChunks = await prisma.classChunk.findMany({
    where,
    select: {
      id: true,
      classId: true,
      text: true,
      embedding: true,
      index: true,
    },
  });

  // Calcular similitud para cada chunk
  const scored = allChunks.map(
    (chunk: {
      text: string;
      classId: number;
      embedding: string;
      index: number;
    }) => {
      const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        text: chunk.text,
        classId: chunk.classId,
        index: chunk.index,
        score,
      };
    },
  );

  // Filtrar y ordenar
  return scored
    .filter((s: { score: number }) => s.score >= minScore)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, topK);
}

// ─── Chat RAG ─────────────────────────────────────────

/**
 * Responde una pregunta usando RAG sobre las transcripciones.
 * Retorna un ReadableStream para streaming SSE.
 */
export async function chatWithClasses(
  question: string,
  options?: {
    classId?: number;
    dateFrom?: string;
    dateTo?: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
    images?: Array<{ base64: string; mimeType: string }>;
  },
): Promise<{
  stream: AsyncIterable<string>;
  sources: Array<{ classId: number; text: string; score: number }>;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  // 1. Buscar chunks relevantes
  const chunks = await searchChunks(question, {
    classId: options?.classId,
    dateFrom: options?.dateFrom,
    dateTo: options?.dateTo,
    topK: 6,
    minScore: 0.25,
  });

  // 2. Obtener metadata de las clases referenciadas
  const classIds = [...new Set(chunks.map((c) => c.classId))];
  const classes = await prisma.classLog.findMany({
    where: { id: { in: classIds } },
    select: { id: true, date: true, title: true, summary: true },
  });
  const classMap = new Map(classes.map((c) => [c.id, c] as const));

  // 3. Construir contexto
  const context = chunks
    .map((chunk, i) => {
      const cls = classMap.get(chunk.classId) as any;
      const dateStr = cls
        ? new Date(cls.date).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "desconocida";
      const title = cls?.title || `Clase #${chunk.classId}`;
      return `[Fragmento ${i + 1} — ${title} (${dateStr})]:\n${chunk.text}`;
    })
    .join("\n\n---\n\n");

  // 4. Construir historial de conversación
  const historyText = options?.history?.length
    ? options.history
        .slice(-6) // Últimos 6 mensajes
        .map(
          (msg) =>
            `${msg.role === "user" ? "Estudiante" : "Asistente"}: ${msg.text}`,
        )
        .join("\n")
    : "";

  // 5. Prompt del sistema
  const hasContext = context && context.trim().length > 0;
  const hasImages = options?.images && options.images.length > 0;

  const prompt = hasContext
    ? `Eres un asistente de estudio inteligente y tutor de matemáticas.
Tienes acceso a fragmentos de transcripciones de clases reales del estudiante.

REGLAS:
- Si la pregunta se relaciona con los fragmentos de clase, responde basándote en ellos y cita la clase.
- Si la pregunta es sobre matemáticas en general (resolver un problema, explicar un concepto), respóndela como tutor experto paso a paso, aunque no esté en los fragmentos.
- Usa LaTeX para fórmulas matemáticas cuando sea necesario (con $...$ para inline o $$...$$ para block).
- Sé conciso y directo.
- Responde en español.
${hasImages ? "- Si el estudiante envía imágenes, analízalas y responde basándote en su contenido." : ""}

FRAGMENTOS DE CLASES:
${context}

${historyText ? `CONVERSACIÓN PREVIA:\n${historyText}\n` : ""}
PREGUNTA DEL ESTUDIANTE: ${question}`
    : `Eres un tutor de matemáticas experto especializado en álgebra y geometría analítica.
Ayudas a estudiantes a entender conceptos y resolver problemas paso a paso.

REGLAS:
- Explica paso a paso cómo resolver el problema o concepto.
- Nunca omitas pasos algebraicos.
- Guía al estudiante a través de cada transformación.
- Usa $...$ para matemáticas en línea y $$...$$ para ecuaciones destacadas.
- Usa **texto** para resaltar conceptos importantes.
- Sé conciso y directo.
- Responde en español.
${hasImages ? "- Si el estudiante envía imágenes, analízalas y responde basándote en su contenido." : ""}

${historyText ? `CONVERSACIÓN PREVIA:\n${historyText}\n` : ""}
PREGUNTA DEL ESTUDIANTE: ${question}`;

  // 6. Construir partes del contenido (texto + imágenes opcionales)
  const contentParts: any[] = [prompt];

  if (hasImages) {
    for (const img of options!.images!) {
      contentParts.push({
        inlineData: {
          data: img.base64,
          mimeType: img.mimeType,
        },
      });
    }
  }

  // 7. Generar respuesta con streaming
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContentStream(contentParts);

  const sources = chunks.map((c) => ({
    classId: c.classId,
    text: c.text.slice(0, 150) + (c.text.length > 150 ? "..." : ""),
    score: c.score,
  }));

  return { stream: streamToAsyncIterable(result.stream), sources };
}

async function* streamToAsyncIterable(
  stream: AsyncIterable<any>,
): AsyncIterable<string> {
  for await (const chunk of stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

/**
 * Obtener estadísticas de indexación RAG.
 */
export async function getRAGStats(): Promise<{
  totalChunks: number;
  indexedClasses: number;
  totalClasses: number;
}> {
  const [totalChunks, indexedClassIds, totalClasses] = await Promise.all([
    prisma.classChunk.count(),
    prisma.classChunk.groupBy({ by: ["classId"] }),
    prisma.classLog.count(),
  ]);

  return {
    totalChunks,
    indexedClasses: indexedClassIds.length,
    totalClasses,
  };
}
