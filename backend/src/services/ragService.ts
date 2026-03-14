import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-embedding-001",
  });

  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Genera embeddings para múltiples textos en batch.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-embedding-001",
  });

  // Procesar en batches de 5 para no sobrecargar la API
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 5) {
    const batch = texts.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (text) => {
        const result = await model.embedContent(text);
        return result.embedding.values;
      }),
    );
    results.push(...batchResults);
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
  // Incluir el resumen como primer chunk de contexto
  const fullText = summary
    ? `Resumen de la clase: ${summary}\n\n${transcript}`
    : transcript;

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
  const prompt = `Eres un asistente de estudio inteligente que ayuda a un estudiante de matemáticas a entender sus clases.
Tienes acceso a fragmentos de transcripciones de clases reales del estudiante.

REGLAS:
- Responde basándote ÚNICAMENTE en la información de los fragmentos proporcionados.
- Si la información no está en los fragmentos, dilo honestamente: "No encuentro esa información en tus clases registradas."
- Cita la clase de donde obtienes la información cuando sea relevante (ej: "En tu clase del 5 de marzo...").
- Usa LaTeX para fórmulas matemáticas cuando sea necesario (con $...$ para inline o $$...$$ para block).
- Sé conciso y directo. No inventes información.
- Responde en español.

FRAGMENTOS DE CLASES:
${context || "No hay fragmentos relevantes para esta consulta."}

${historyText ? `CONVERSACIÓN PREVIA:\n${historyText}\n` : ""}
PREGUNTA DEL ESTUDIANTE: ${question}`;

  // 6. Generar respuesta con streaming
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContentStream(prompt);

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
