import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { cacheKey, getCached, setCached, TTL } from "./geminiCache";

// Imagen de contexto para el análisis
export interface ImagenContexto {
  base64: string;
  mimeType: string;
}

// Resultado del análisis de transcripción
export interface TranscriptAnalysisResult {
  temas: string[];
  formulas: string[];
  tiposEjercicio: string[];
  resumen: string;
  conceptosClave: string[];
}

// Umbral de caracteres para activar chunking (~30k chars ≈ 7500 tokens)
const CHUNK_THRESHOLD = 30_000;
// Tamaño máximo por chunk con overlap
const CHUNK_SIZE = 25_000;
const CHUNK_OVERLAP = 2_000;

const PROMPT_TRANSCRIPCION = `Analiza la siguiente transcripción de una clase de matemáticas.

Extrae lo siguiente:
- Temas cubiertos en la clase
- Fórmulas mencionadas o explicadas
- Tipos de ejercicios que se resolvieron o mencionaron
- Un resumen conciso de la clase
- Conceptos clave explicados

IMPORTANTE:
- La transcripción puede ser de voz-a-texto, con errores gramaticales, repeticiones o fragmentos incompletos. Interpreta el contenido de forma flexible.
- Si se adjuntan imágenes, son fotos del pizarrón, cuaderno o material de la misma clase. Úsalas como CONTEXTO ADICIONAL de la transcripción: las fórmulas, diagramas y anotaciones en las imágenes complementan lo que el profesor explica verbalmente. Integra su contenido en tu análisis.
- SOLO incluye temas ACADÉMICOS/MATEMÁTICOS relevantes a la materia. NO incluyas temas administrativos, organizacionales o de logística de la clase como: reglas del curso, uso de celulares, políticas de asistencia, sistema de evaluación, presentación del profesor, introducción al curso, materiales necesarios, horarios, etc. Solo extrae contenido matemático que pueda generar ejercicios.

Responde SOLO con JSON válido en este formato exacto:
{
  "temas": ["lista de temas cubiertos"],
  "formulas": ["fórmulas mencionadas en formato legible"],
  "tiposEjercicio": ["tipos de ejercicio identificados"],
  "resumen": "resumen conciso de la clase en 2-3 oraciones",
  "conceptosClave": ["conceptos clave explicados"]
}`;

const PROMPT_CHUNK = `Analiza este FRAGMENTO de una transcripción de clase de matemáticas (parte {partNum} de {totalParts}).

Extrae lo siguiente de ESTE fragmento solamente:
- Temas que se mencionan
- Fórmulas mencionadas o explicadas
- Tipos de ejercicios
- Resumen de este fragmento
- Conceptos clave

IMPORTANTE:
- La transcripción puede ser de voz-a-texto, con errores gramaticales, repeticiones o fragmentos incompletos. Interpreta el contenido de forma flexible.
- Si se adjuntan imágenes, son fotos del pizarrón/cuaderno de la misma clase. Úsalas como contexto visual que complementa la transcripción.
- SOLO incluye temas ACADÉMICOS/MATEMÁTICOS. NO incluyas temas administrativos o de logística (reglas, asistencia, celulares, evaluación, introducción al curso, etc.).

Responde SOLO con JSON válido:
{
  "temas": ["temas en este fragmento"],
  "formulas": ["fórmulas encontradas"],
  "tiposEjercicio": ["tipos de ejercicio"],
  "resumen": "resumen de este fragmento",
  "conceptosClave": ["conceptos clave"]
}`;

const PROMPT_MERGE = `Tienes los análisis parciales de una transcripción de clase de matemáticas que fue dividida en fragmentos.

Fusiona los resultados eliminando duplicados e inconsistencias.

Análisis parciales:
{analyses}

Genera UN resultado unificado con:
- Temas (sin duplicados, normalizados). EXCLUYE temas administrativos/organizacionales (reglas, asistencia, celulares, introducción al curso, evaluación). Solo temas matemáticos/académicos.
- Fórmulas (sin duplicados)
- Tipos de ejercicio (sin duplicados)
- UN resumen general de toda la clase (2-3 oraciones)
- Conceptos clave (sin duplicados)

Responde SOLO con JSON válido:
{
  "temas": ["lista unificada de temas"],
  "formulas": ["fórmulas únicas"],
  "tiposEjercicio": ["tipos de ejercicio únicos"],
  "resumen": "resumen completo de la clase",
  "conceptosClave": ["conceptos clave únicos"]
}`;

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      topP: 0.8,
    },
  });
}

/**
 * Divide texto en chunks con overlap para no perder contexto en los bordes.
 * Intenta cortar en saltos de línea o puntos para no partir oraciones.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // Si no es el último chunk, buscar un punto de corte natural
    if (end < text.length) {
      const searchArea = text.substring(end - 500, end);
      // Buscar último salto de párrafo, punto o salto de línea
      const lastBreak = Math.max(
        searchArea.lastIndexOf("\n\n"),
        searchArea.lastIndexOf(". "),
        searchArea.lastIndexOf(".\n"),
      );
      if (lastBreak > 0) {
        end = end - 500 + lastBreak + 1;
      }
    }

    chunks.push(text.substring(start, end));
    start = end - CHUNK_OVERLAP; // Overlap para continuidad
    if (start >= text.length) break;
  }

  console.log(
    `[TranscriptAnalysis] Texto de ${text.length} chars dividido en ${chunks.length} chunks`,
  );
  return chunks;
}

/**
 * Extrae JSON de una respuesta de Gemini que puede venir en code blocks
 */
function extractJson(texto: string): string {
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return "";
}

function parseAnalysis(jsonStr: string): TranscriptAnalysisResult | null {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      temas: parsed.temas || [],
      formulas: parsed.formulas || [],
      tiposEjercicio: parsed.tiposEjercicio || [],
      resumen: parsed.resumen || "",
      conceptosClave: parsed.conceptosClave || [],
    };
  } catch {
    return null;
  }
}

const EMPTY_RESULT: TranscriptAnalysisResult = {
  temas: [],
  formulas: [],
  tiposEjercicio: [],
  resumen: "No se pudo analizar la transcripción.",
  conceptosClave: [],
};

/**
 * Construye las partes multimodales de imágenes para enviar a Gemini
 */
function buildImageParts(imagenes: ImagenContexto[]): Part[] {
  return imagenes.map((img) => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType,
    },
  }));
}

/**
 * Analiza un solo chunk de transcripción, opcionalmente con imágenes de contexto
 */
async function analizarChunk(
  chunk: string,
  partNum: number,
  totalParts: number,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  const imgsHash = imagenes
    ? imagenes.map((i) => i.base64.slice(0, 64)).join(",")
    : "";
  const key = cacheKey(
    "chunk",
    `${chunk}|${partNum}|${totalParts}|${imgsHash}`,
  );
  const cached = await getCached<TranscriptAnalysisResult>(key);
  if (cached) return cached;

  const model = getModel();
  const prompt =
    PROMPT_CHUNK.replace("{partNum}", String(partNum)).replace(
      "{totalParts}",
      String(totalParts),
    ) + `\n\nFragmento:\n${chunk}`;

  // Enviar imágenes como contexto visual junto al texto
  const parts: Part[] = [{ text: prompt }];
  if (imagenes && imagenes.length > 0) {
    parts.push(...buildImageParts(imagenes));
  }

  const result = await model.generateContent(parts);
  const texto = result.response.text();
  const parsed = parseAnalysis(extractJson(texto)) || EMPTY_RESULT;
  await setCached(key, parsed, TTL.TRANSCRIPT);
  return parsed;
}

/**
 * Fusiona múltiples análisis parciales en uno solo usando Gemini
 */
async function fusionarAnalisis(
  parciales: TranscriptAnalysisResult[],
): Promise<TranscriptAnalysisResult> {
  // Si solo hay 2-3 parciales, fusión local es suficiente
  if (parciales.length <= 3) {
    return fusionLocal(parciales);
  }

  // Para muchos chunks, usar Gemini para deduplicar y normalizar
  const model = getModel();
  const analysesStr = parciales
    .map((p, i) => `--- Fragmento ${i + 1} ---\n${JSON.stringify(p, null, 2)}`)
    .join("\n\n");

  const prompt = PROMPT_MERGE.replace("{analyses}", analysesStr);

  try {
    const result = await model.generateContent(prompt);
    const texto = result.response.text();
    const merged = parseAnalysis(extractJson(texto));
    if (merged && merged.temas.length > 0) return merged;
  } catch (err) {
    console.warn(
      "[TranscriptAnalysis] Fusión con IA falló, usando fusión local:",
      err,
    );
  }

  return fusionLocal(parciales);
}

/**
 * Fusión local sin IA: concatena y deduplica por similitud
 */
function fusionLocal(
  parciales: TranscriptAnalysisResult[],
): TranscriptAnalysisResult {
  const temasSet = new Set<string>();
  const formulasSet = new Set<string>();
  const tiposSet = new Set<string>();
  const conceptosSet = new Set<string>();
  const resumenes: string[] = [];

  for (const p of parciales) {
    p.temas.forEach((t) => temasSet.add(t.trim()));
    p.formulas.forEach((f) => formulasSet.add(f.trim()));
    p.tiposEjercicio.forEach((t) => tiposSet.add(t.trim()));
    p.conceptosClave.forEach((c) => conceptosSet.add(c.trim()));
    if (p.resumen) resumenes.push(p.resumen);
  }

  return {
    temas: deduplicateSimilar([...temasSet]),
    formulas: [...formulasSet],
    tiposEjercicio: deduplicateSimilar([...tiposSet]),
    resumen: resumenes.join(" "),
    conceptosClave: deduplicateSimilar([...conceptosSet]),
  };
}

/**
 * Elimina items muy similares (distancia de edición simple)
 */
function deduplicateSimilar(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    const isDupe = result.some((existing) => {
      const existLower = existing.toLowerCase();
      return (
        existLower === lower ||
        existLower.includes(lower) ||
        lower.includes(existLower)
      );
    });
    if (!isDupe) result.push(item);
  }
  return result;
}

/**
 * Analiza una transcripción de clase usando Gemini 2.5 Pro.
 * Las imágenes se envían como contexto visual multimodal (fotos de pizarrón/cuaderno).
 * Para transcripciones largas (>30k chars), las divide en chunks,
 * analiza cada uno (con las imágenes como contexto) y fusiona los resultados.
 */
export async function analizarTranscripcion(
  transcripcion: string,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  if (!transcripcion || transcripcion.trim().length === 0) {
    return EMPTY_RESULT;
  }

  const textoLimpio = transcripcion.trim();
  const chunks = splitIntoChunks(textoLimpio);

  const numImgs = imagenes?.length || 0;
  console.log(
    `[TranscriptAnalysis] Procesando transcripción: ${textoLimpio.length} chars, ${chunks.length} chunk(s), ${numImgs} imagen(es) de contexto`,
  );

  // Caso simple: cabe en un solo chunk
  if (chunks.length === 1) {
    return analizarChunkUnico(chunks[0], imagenes);
  }

  // Para chunks múltiples: las imágenes se envían solo con el primer chunk
  // para no duplicar el costo de tokens de imagen en cada llamada.
  // El primer chunk tiene el contexto visual completo.
  const resultados: TranscriptAnalysisResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `[TranscriptAnalysis] Procesando chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)${i === 0 && numImgs > 0 ? ` + ${numImgs} imágenes` : ""}`,
    );
    try {
      // Imágenes solo en el primer chunk
      const imgsParaChunk = i === 0 ? imagenes : undefined;
      const resultado = await analizarChunk(
        chunks[i],
        i + 1,
        chunks.length,
        imgsParaChunk,
      );
      resultados.push(resultado);
    } catch (err) {
      console.error(`[TranscriptAnalysis] Error en chunk ${i + 1}:`, err);
      // Continuar con los chunks restantes
    }
  }

  if (resultados.length === 0) {
    return EMPTY_RESULT;
  }

  // Fusionar resultados
  console.log(
    `[TranscriptAnalysis] Fusionando ${resultados.length} análisis parciales`,
  );
  return fusionarAnalisis(resultados);
}

/**
 * Análisis directo para transcripciones que caben en un solo chunk,
 * opcionalmente con imágenes de contexto visual (pizarrón, cuaderno).
 */
async function analizarChunkUnico(
  transcripcion: string,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  const imgsHash = imagenes
    ? imagenes.map((i) => i.base64.slice(0, 64)).join(",")
    : "";
  const key = cacheKey("transcript", `${transcripcion}|${imgsHash}`);
  const cached = await getCached<TranscriptAnalysisResult>(key);
  if (cached) return cached;

  const model = getModel();
  const prompt = `${PROMPT_TRANSCRIPCION}\n\nTranscripción:\n${transcripcion}`;

  // Construir request multimodal: texto + imágenes como contexto
  const parts: Part[] = [{ text: prompt }];
  if (imagenes && imagenes.length > 0) {
    parts.push(...buildImageParts(imagenes));
    console.log(
      `[TranscriptAnalysis] Enviando ${imagenes.length} imagen(es) como contexto visual`,
    );
  }

  const result = await model.generateContent(parts);
  const texto = result.response.text();
  const parsed = parseAnalysis(extractJson(texto)) || EMPTY_RESULT;
  await setCached(key, parsed, TTL.TRANSCRIPT);
  return parsed;
}
