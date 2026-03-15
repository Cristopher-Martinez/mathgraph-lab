import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";

export interface GeneratedExercise {
  pregunta: string;
  solucion: string;
  dificultad: string;
  tipo: string;
  pistas?: string[];
}

export interface ExerciseGenerationResult {
  ejercicios: GeneratedExercise[];
  stats?: {
    intentos: number;
    exitosos: number;
    fallidos: number;
    tiempoMs: number;
  };
}

// ─── Estrategia 1: Retry con backoff exponencial ───
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRateLimit =
        err.message?.includes("429") ||
        err.message?.includes("RESOURCE_EXHAUSTED");
      const delay =
        BASE_DELAY_MS * Math.pow(2, attempt - 1) * (isRateLimit ? 2 : 1);
      console.warn(
        `[ExerciseGen] ${label} intento ${attempt}/${MAX_RETRIES} falló: ${err.message}. Reintentando en ${delay}ms...`,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(delay);
      }
    }
  }
  throw (
    lastError || new Error(`${label} falló después de ${MAX_RETRIES} intentos`)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Estrategia 2: Validación de ejercicios generados ───
const DIFICULTADES_VALIDAS = ["facil", "medio", "dificil"];

function validarEjercicio(e: any): e is GeneratedExercise {
  return (
    typeof e.pregunta === "string" &&
    e.pregunta.trim().length >= 5 &&
    typeof e.solucion === "string" &&
    e.solucion.trim().length > 0 &&
    typeof e.dificultad === "string" &&
    DIFICULTADES_VALIDAS.includes(e.dificultad)
  );
}

// ─── Estrategia 3: Generación por lotes (1 tema, 1 dificultad por llamada) ───
async function generarLote(
  model: any,
  tema: string,
  dificultad: string,
  cantidad: number,
): Promise<GeneratedExercise[]> {
  const dificultadLabel =
    dificultad === "facil"
      ? "fáciles"
      : dificultad === "medio"
        ? "intermedios"
        : "difíciles";

  const prompt = `Genera exactamente ${cantidad} ejercicios de matemáticas de nivel ${dificultadLabel} sobre: ${tema}.

Cada ejercicio debe tener:
- pregunta: enunciado claro y específico con datos numéricos concretos
- solucion: resolución paso a paso
- dificultad: "${dificultad}"
- tipo: categoría del ejercicio
- pistas: array con 2-3 pistas progresivas

Responde SOLO con JSON válido:
{
  "ejercicios": [
    {
      "pregunta": "Calcula la pendiente entre (1,2) y (3,6)",
      "solucion": "m = (6-2)/(3-1) = 4/2 = 2",
      "dificultad": "${dificultad}",
      "tipo": "${tema}",
      "pistas": ["Usa la fórmula m = (y2-y1)/(x2-x1)", "Sustituye los valores"]
    }
  ]
}

IMPORTANTE: Responde ÚNICAMENTE el JSON, sin texto adicional ni bloques de código.`;

  const result = await model.generateContent(prompt);
  const texto = result.response.text();
  return parseExercisesFromText(texto);
}

// ─── Parser robusto de JSON ───
function parseExercisesFromText(texto: string): GeneratedExercise[] {
  // Buscar JSON en la respuesta
  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  if (!jsonStr) {
    console.log(
      "[ExerciseGen] No se encontró JSON en:",
      texto.substring(0, 300),
    );
    return [];
  }

  // Intento 1: Parse directo
  try {
    const parsed = parseGeminiJSON(jsonStr);
    const ejercicios = (parsed.ejercicios || [])
      .map((e: any) => ({
        pregunta: e.pregunta || "",
        solucion: e.solucion || "",
        dificultad: e.dificultad || "facil",
        tipo: e.tipo || "general",
        pistas: e.pistas || [],
      }))
      .filter(validarEjercicio);
    return ejercicios;
  } catch (err: any) {
    console.warn(
      "[ExerciseGen] JSON parse falló, intentando rescate:",
      err.message,
    );
  }

  // Intento 2: Rescate de ejercicios parciales de JSON truncado
  try {
    const ejerciciosRegex =
      /\{[^{}]*"pregunta"\s*:\s*"[^"]+?"[^{}]*"solucion"\s*:\s*"[^"]*?"[^{}]*"dificultad"\s*:\s*"[^"]*?"[^{}]*\}/g;
    const matches = jsonStr.match(ejerciciosRegex) || [];
    const rescatados: GeneratedExercise[] = [];
    for (const m of matches) {
      try {
        const e = parseGeminiJSON(m);
        const ej: GeneratedExercise = {
          pregunta: e.pregunta || "",
          solucion: e.solucion || "",
          dificultad: e.dificultad || "facil",
          tipo: e.tipo || "general",
          pistas: e.pistas || [],
        };
        if (validarEjercicio(ej)) rescatados.push(ej);
      } catch {
        // skip malformed
      }
    }
    return rescatados;
  } catch {
    return [];
  }
}

/**
 * Genera ejercicios con estrategias de resiliencia:
 *  1. Dividir llamadas: 1 llamada por (tema × dificultad) en vez de 1 llamada masiva
 *  2. Retry con backoff exponencial: hasta 3 intentos por lote con delays crecientes
 *  3. Rate-limit delay: pausa entre llamadas para no saturar la API
 *  4. Validación: descarta ejercicios mal formados antes de guardar
 *  5. Tolerancia parcial: si 1 lote falla, los demás siguen generándose
 */
export async function generarEjercicios(
  temas: string[],
  cantidadPorDificultad: number = 10,
): Promise<ExerciseGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada");
  }

  const startTime = Date.now();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      topP: 0.8,
    },
  });

  const temasLimitados = temas.slice(0, 5);
  const dificultades = ["facil", "medio", "dificil"];
  const todosEjercicios: GeneratedExercise[] = [];
  let exitosos = 0;
  let fallidos = 0;
  const totalLotes = temasLimitados.length * dificultades.length;

  console.log(
    `[ExerciseGen] Generando ${totalLotes} lotes (${temasLimitados.length} temas × 3 dificultades × ${cantidadPorDificultad} ejercicios)`,
  );

  // Estrategia 3: Procesar secuencialmente con delay entre llamadas
  for (const tema of temasLimitados) {
    for (const dificultad of dificultades) {
      const label = `[${tema}/${dificultad}]`;
      try {
        // Estrategia 1: Retry con backoff
        const ejercicios = await withRetry(
          () => generarLote(model, tema, dificultad, cantidadPorDificultad),
          label,
        );

        if (ejercicios.length > 0) {
          todosEjercicios.push(...ejercicios);
          exitosos++;
          console.log(
            `[ExerciseGen] ${label} ✓ ${ejercicios.length} ejercicios`,
          );
        } else {
          fallidos++;
          console.warn(
            `[ExerciseGen] ${label} ✗ 0 ejercicios válidos generados`,
          );
        }
      } catch (err: any) {
        // Estrategia 5: Tolerancia parcial — un lote fallido no detiene los demás
        fallidos++;
        console.error(
          `[ExerciseGen] ${label} ✗ Error definitivo: ${err.message}`,
        );
      }

      // Rate-limit: pausa entre llamadas para no saturar la API
      if (temasLimitados.length > 1 || dificultades.indexOf(dificultad) < 2) {
        await sleep(500);
      }
    }
  }

  const tiempoMs = Date.now() - startTime;
  console.log(
    `[ExerciseGen] Completado: ${todosEjercicios.length} ejercicios en ${tiempoMs}ms (${exitosos} lotes OK, ${fallidos} fallidos de ${totalLotes})`,
  );

  return {
    ejercicios: todosEjercicios,
    stats: {
      intentos: totalLotes,
      exitosos,
      fallidos,
      tiempoMs,
    },
  };
}
