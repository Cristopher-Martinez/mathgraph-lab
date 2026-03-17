import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";
import { generarEjercicios } from "./exerciseGeneration";
import { parallelWithLimit } from "./geminiSemaphore";
import {
  completeGeneration,
  startGeneration,
  updateStep,
} from "./generationStatus";
import { getGenerationStatus, getRedis } from "./redisClient";

const PROPAGATION_LOCK_TTL = 600; // 10 minutes max lock

/**
 * Check if generation was cancelled via Redis flag.
 */
async function isCancelled(classId: number): Promise<boolean> {
  const val = await getRedis().get(`generation:cancel:${classId}`);
  return val !== null;
}

/**
 * Limpia artifacts generados por análisis previo de una clase.
 * Usado en fusión y re-análisis para evitar duplicados.
 * NO borra la clase ni sus imágenes/chunks — solo los artifacts derivados del análisis.
 */
export async function cleanArtifactsForReanalysis(
  classId: number,
): Promise<void> {
  console.log(
    `[CleanArtifacts] Limpiando artifacts previos de clase ${classId}`,
  );

  await prisma.$transaction(async (tx) => {
    // 1. Eliminar tips y reviews de ejercicios generados por esta clase
    const exercisesOfClass = await tx.exercise.findMany({
      where: { generatedByClassId: classId },
      select: { id: true },
    });
    const exerciseIds = exercisesOfClass.map((e) => e.id);
    if (exerciseIds.length > 0) {
      await tx.exerciseTip.deleteMany({
        where: { exerciseId: { in: exerciseIds } },
      });
      await tx.exerciseReview.deleteMany({
        where: { exerciseId: { in: exerciseIds } },
      });
    }
    const deletedExercises = await tx.exercise.deleteMany({
      where: { generatedByClassId: classId },
    });

    // 2. Eliminar dependencias generadas por esta clase
    const deletedDeps = await tx.topicDependency.deleteMany({
      where: { generatedByClassId: classId },
    });

    // 3. Eliminar apuntes generados para esta clase
    const deletedNotes = await tx.classNote.deleteMany({
      where: { classId },
    });

    // 4. Limpiar topics huérfanos creados exclusivamente por esta clase
    const topicsCreated = await tx.topic.findMany({
      where: { createdByClassId: classId },
    });

    const otrasClases = await tx.classLog.findMany({
      where: { id: { not: classId } },
      select: { topics: true },
    });
    const temasOtrasClases = new Set<string>();
    for (const otra of otrasClases) {
      const temas = otra.topics ? JSON.parse(otra.topics) : [];
      if (Array.isArray(temas)) {
        temas.forEach((t: string) =>
          temasOtrasClases.add(t.trim().toLowerCase().replace(/\s+/g, " ")),
        );
      }
    }

    let topicsEliminados = 0;
    for (const topic of topicsCreated) {
      if (temasOtrasClases.has(topic.name)) {
        await tx.topic.update({
          where: { id: topic.id },
          data: { createdByClassId: null },
        });
      } else {
        // Verificar si quedan ejercicios de CUALQUIER origen (manuales o de otras clases)
        const ejerciciosRestantes = await tx.exercise.count({
          where: { topicId: topic.id },
        });
        if (ejerciciosRestantes > 0) {
          await tx.topic.update({
            where: { id: topic.id },
            data: { createdByClassId: null },
          });
        } else {
          await tx.topicDoc.deleteMany({ where: { topicId: topic.id } });
          await tx.formula.deleteMany({ where: { topicId: topic.id } });
          await tx.progress.deleteMany({ where: { topicId: topic.id } });
          await tx.topicDependency.deleteMany({
            where: { OR: [{ parentId: topic.id }, { childId: topic.id }] },
          });
          await tx.topic.delete({ where: { id: topic.id } });
          topicsEliminados++;
        }
      }
    }

    console.log(
      `[CleanArtifacts] Clase ${classId}: ${deletedExercises.count} ejercicios, ${deletedDeps.count} deps, ${deletedNotes.count} notas, ${topicsEliminados} topics eliminados`,
    );
  });
}

/**
 * Full background pipeline: 3-phase analysis + propagation.
 * Phase 1: Vectorize transcript (embeddings, $0.00)
 * Phase 2: Flash preview (fast, ~$0.005)
 * Phase 3: Pro truth (quality, ~$0.10)
 * Called from jobQueue for async POST /class-log.
 */
export async function analyzeAndPropagate(classId: number): Promise<void> {
  console.log(
    `[AnalyzeAndPropagate] Starting 3-phase pipeline for class ${classId}`,
  );

  const { analizarTranscripcionFlash, analizarTranscripcionPro } =
    await import("./transcriptAnalysis");
  const { indexClassTranscript } = await import("./ragService");
  const { broadcastGenerationUpdate } = await import("./websocket");

  try {
    // Cancel check
    if (await isCancelled(classId)) {
      console.log(`[AnalyzeAndPropagate] Cancelled for class ${classId}`);
      return;
    }

    // Read transcript from DB
    const classRecord = await prisma.classLog.findUnique({
      where: { id: classId },
      select: { transcript: true, images: { select: { url: true } } },
    });
    if (!classRecord) {
      throw new Error(`ClassLog ${classId} not found`);
    }

    const textoTranscripcion = classRecord.transcript?.trim() || "";
    if (!textoTranscripcion) {
      // No transcript — skip to propagation
      await propagateClassChanges(classId, true);
      return;
    }

    // ═══════════════════════════════════════════════
    // FASE 1: Vectorización ($0.00)
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;

    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [{ label: "Vectorizando transcripción", status: "running" }],
      startedAt: Date.now(),
    });

    try {
      await indexClassTranscript(classId, textoTranscripcion, null);
      await prisma.classLog.update({
        where: { id: classId },
        data: { vectorized: true, vectorizedAt: new Date() },
      });
      console.log(
        `[AnalyzeAndPropagate] Fase 1 completada: vectorización para clase ${classId}`,
      );
    } catch (err) {
      // Vectorization failure is non-blocking
      console.error(`[AnalyzeAndPropagate] Fase 1 error (no bloquea):`, err);
    }

    // ═══════════════════════════════════════════════
    // FASE 2: Preview con Flash (~8s, ~$0.005)
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;

    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [
        { label: "Vectorizando transcripción", status: "completed" },
        { label: "Generando preview rápido", status: "running" },
      ],
      startedAt: Date.now(),
    });

    const preview = await analizarTranscripcionFlash(textoTranscripcion);

    await prisma.classLog.update({
      where: { id: classId },
      data: {
        summary: `[PREVIEW] ${preview.resumen}`,
        topics: JSON.stringify(preview.temas),
        formulas: JSON.stringify(preview.formulas),
        activities: JSON.stringify(preview.actividades),
        analyzed: true,
        analyzedAt: new Date(),
        analysisModel: "flash-preview",
      },
    });

    console.log(
      `[AnalyzeAndPropagate] Fase 2 completada: preview Flash para clase ${classId}`,
    );

    // Broadcast preview ready
    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [
        { label: "Vectorizando transcripción", status: "completed" },
        { label: "Generando preview rápido", status: "completed" },
        { label: "Análisis profundo (fuente de verdad)", status: "running" },
      ],
      startedAt: Date.now(),
    });

    // ═══════════════════════════════════════════════
    // FASE 3: Fuente de verdad con Pro (~25s, ~$0.10)
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;

    const truth = await analizarTranscripcionPro(textoTranscripcion);

    await prisma.classLog.update({
      where: { id: classId },
      data: {
        summary: truth.resumen, // Sobrescribe preview
        topics: JSON.stringify(truth.temas),
        formulas: JSON.stringify(truth.formulas),
        activities: JSON.stringify(truth.actividades),
        deepAnalyzed: true,
        deepAnalyzedAt: new Date(),
        analysisModel: "pro",
      },
    });

    console.log(
      `[AnalyzeAndPropagate] Fase 3 completada: verdad Pro para clase ${classId}`,
    );

    // Re-indexar con summary real para mejorar calidad de búsqueda RAG
    try {
      await indexClassTranscript(classId, textoTranscripcion, truth.resumen);
      console.log(
        `[AnalyzeAndPropagate] Re-indexación RAG con summary Pro completada`,
      );
    } catch (err) {
      console.error(
        `[AnalyzeAndPropagate] Re-indexación RAG falló (no bloquea):`,
        err,
      );
    }

    // ═══════════════════════════════════════════════
    // PROPAGACIÓN: Topics, Exercises, DAG
    // ═══════════════════════════════════════════════
    await propagateClassChanges(classId, true);
  } catch (err: any) {
    console.error(`[AnalyzeAndPropagate] Error for class ${classId}:`, err);
    throw err;
  }
}

/**
 * Normaliza el nombre de un tema para consistencia
 */
function normalizeTopicName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Calcula similitud entre dos strings normalizados (coeficiente de Dice con bigramas)
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/** Umbral de similitud para considerar dos temas como el mismo */
const SIMILARITY_THRESHOLD = 0.65;

/**
 * Busca un tema existente en la BD que sea suficientemente similar al nombre dado.
 * Primero intenta coincidencia exacta, luego fuzzy.
 */
async function findExistingTopic(
  normalizedName: string,
): Promise<{ id: number; name: string } | null> {
  // 1. Coincidencia exacta
  const exact = await prisma.topic.findUnique({
    where: { name: normalizedName },
  });
  if (exact) return { id: exact.id, name: exact.name };

  // 2. Búsqueda fuzzy contra todos los topics existentes
  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });
  let bestMatch: { id: number; name: string; score: number } | null = null;

  for (const t of allTopics) {
    const score = similarity(normalizedName, t.name);
    if (
      score >= SIMILARITY_THRESHOLD &&
      (!bestMatch || score > bestMatch.score)
    ) {
      bestMatch = { id: t.id, name: t.name, score };
    }
  }

  if (bestMatch) {
    console.log(
      `[Dedup] "${normalizedName}" → coincide con "${bestMatch.name}" (similitud: ${(bestMatch.score * 100).toFixed(0)}%)`,
    );
    return { id: bestMatch.id, name: bestMatch.name };
  }

  return null;
}

/**
 * Propaga automáticamente los cambios de una clase a Topics, Exercises y DAG.
 *
 * Sistema de deduplicación y refuerzo:
 * - Si un tema ya existe (exacto o similar), NO lo crea de nuevo.
 * - En su lugar, genera ejercicios de REFUERZO para ese tema existente.
 * - Los ejercicios de refuerzo se marcan con generatedByClassId de la nueva clase.
 */
export async function propagateClassChanges(
  classId: number,
  analysisCompleted: boolean = false,
) {
  console.log(`[AutoPropagation] Iniciando propagación para clase ${classId}`);

  // Guard 1: Check if already completed
  const existingStatus = await getGenerationStatus(classId, "class");
  if (existingStatus?.status === "done") {
    console.log(
      `[AutoPropagation] Clase ${classId} ya fue propagada, omitiendo`,
    );
    return;
  }

  // Guard 2: Redis lock to prevent concurrent execution
  const lockKey = `propagation:lock:${classId}`;
  const redis = getRedis();
  const locked = await redis.set(
    lockKey,
    "1",
    "EX",
    PROPAGATION_LOCK_TTL,
    "NX",
  );
  if (!locked) {
    console.log(
      `[AutoPropagation] Clase ${classId} ya está siendo propagada (lock activo)`,
    );
    return;
  }

  try {
    return await _doPropagation(classId, analysisCompleted);
  } finally {
    await redis.del(lockKey);
  }
}

async function _doPropagation(
  classId: number,
  analysisCompleted: boolean = false,
) {
  // Cancel check
  if (await isCancelled(classId)) {
    console.log(
      `[AutoPropagation] Propagación cancelada para clase ${classId}`,
    );
    return;
  }

  const classLog = await prisma.classLog.findUnique({
    where: { id: classId },
  });

  if (!classLog) {
    throw new Error(`Clase ${classId} no encontrada`);
  }

  // Parsear temas detectados
  const temasRaw = classLog.topics ? JSON.parse(classLog.topics) : [];
  if (!Array.isArray(temasRaw) || temasRaw.length === 0) {
    console.log(
      `[AutoPropagation] No hay temas para propagar en clase ${classId}`,
    );
    return;
  }

  const temasNormalizados = temasRaw.map(normalizeTopicName);

  // Filtrar temas no académicos (administrativos, logísticos, organizacionales)
  const NON_ACADEMIC_PATTERNS = [
    /introducci[oó]n al curso/,
    /reglas del curso/,
    /uso de celular/,
    /calculadora/,
    /asistencia/,
    /pol[ií]tica/,
    /evaluaci[oó]n del curso/,
    /sistema de (evaluaci[oó]n|calificaci[oó]n)/,
    /presentaci[oó]n del (profesor|curso|materia)/,
    /materiales? necesarios?/,
    /horarios?( de clase)?$/,
    /programa del curso/,
    /bibliograf[ií]a/,
    /criterios de evaluaci[oó]n/,
  ];

  const temas = temasNormalizados.filter((tema) => {
    const isNonAcademic = NON_ACADEMIC_PATTERNS.some((pat) => pat.test(tema));
    if (isNonAcademic) {
      console.log(`[AutoPropagation] Tema filtrado (no académico): "${tema}"`);
    }
    return !isNonAcademic;
  });

  if (temas.length === 0) {
    console.log(
      `[AutoPropagation] Todos los temas fueron filtrados como no académicos para clase ${classId}`,
    );
    return;
  }

  // Inicializar tracking de estado
  await startGeneration(classId, temas, "class", analysisCompleted);

  // 1. Resolver topics con deduplicación
  await updateStep(classId, "Creando temas", "running");
  const topicResults: {
    id: number;
    name: string;
    isNew: boolean;
    originalName: string;
  }[] = [];

  for (const tema of temas) {
    const existing = await findExistingTopic(tema);

    if (existing) {
      topicResults.push({
        id: existing.id,
        name: existing.name,
        isNew: false,
        originalName: tema,
      });
      console.log(
        `[AutoPropagation] Tema existente: "${tema}" → #${existing.id} "${existing.name}"`,
      );
    } else {
      const newTopic = await prisma.topic.create({
        data: { name: tema, createdByClassId: classId },
      });
      topicResults.push({
        id: newTopic.id,
        name: tema,
        isNew: true,
        originalName: tema,
      });
      console.log(
        `[AutoPropagation] Nuevo tema creado: "${tema}" (id: ${newTopic.id})`,
      );
    }
  }

  const nuevos = topicResults.filter((t) => t.isNew);
  const existentes = topicResults.filter((t) => !t.isNew);
  console.log(
    `[AutoPropagation] Temas: ${nuevos.length} nuevos, ${existentes.length} existentes (refuerzo)`,
  );
  await updateStep(
    classId,
    "Creando temas",
    "done",
    `${nuevos.length} nuevos, ${existentes.length} existentes`,
  );

  // 2. Generar ejercicios — nuevos para topics nuevos, refuerzo para existentes (PARALELO)
  const resultadosGeneracion: {
    topic: string;
    generados: number;
    tipo: "nuevo" | "refuerzo";
    error?: string;
  }[] = [];

  const exerciseTasks = topicResults.map((topicInfo) => async () => {
    // Verificar si ya se generaron ejercicios para este topic desde ESTA clase
    const yaGenerados = await prisma.exercise.count({
      where: { topicId: topicInfo.id, generatedByClassId: classId },
    });
    if (yaGenerados > 0) {
      console.log(
        `[AutoPropagation] Ejercicios ya generados para "${topicInfo.name}" desde clase ${classId}, omitiendo`,
      );
      return {
        topic: topicInfo.name,
        generados: yaGenerados,
        tipo: (topicInfo.isNew ? "nuevo" : "refuerzo") as "nuevo" | "refuerzo",
      };
    }

    // Contar ejercicios existentes del tema para decidir cantidad de refuerzo
    const ejerciciosExistentes = await prisma.exercise.count({
      where: { topicId: topicInfo.id },
    });

    // Refuerzo: generar menos ejercicios si ya hay muchos
    const cantidadPorDificultad = topicInfo.isNew
      ? 5 // Tema nuevo: 5 por dificultad = 15 total
      : Math.max(
          2,
          Math.min(3, Math.ceil(10 / Math.max(1, ejerciciosExistentes / 10))),
        );

    const tipoGeneracion = topicInfo.isNew ? "nuevo" : "refuerzo";
    const stepLabel = `Ejercicios: ${topicInfo.originalName}`;
    await updateStep(classId, stepLabel, "running");

    try {
      console.log(
        `[AutoPropagation] Generando ejercicios de ${tipoGeneracion} para "${topicInfo.name}" ` +
          `(${cantidadPorDificultad}/dificultad, ${ejerciciosExistentes} existentes)`,
      );

      const resultado = await generarEjercicios(
        [topicInfo.name],
        cantidadPorDificultad,
      );
      const ejerciciosValidos = resultado.ejercicios.filter(
        (ej) => ej.pregunta.trim().length >= 5,
      );

      if (ejerciciosValidos.length === 0) {
        console.warn(
          `[AutoPropagation] IA retornó 0 ejercicios válidos para ${topicInfo.name}`,
        );
        await updateStep(classId, stepLabel, "done", "0 válidos");
        return {
          topic: topicInfo.name,
          generados: 0,
          tipo: tipoGeneracion as "nuevo" | "refuerzo",
          error: "0 ejercicios válidos",
        };
      }

      const diffMap: Record<string, string> = {
        facil: "easy",
        medio: "medium",
        dificil: "hard",
      };

      // Content-based dedup: filter exercises too similar to existing ones
      const existingExercises = await prisma.exercise.findMany({
        where: { topicId: topicInfo.id },
        select: { latex: true },
      });
      const existingTexts = existingExercises.map((e) =>
        e.latex.trim().toLowerCase().replace(/\s+/g, " "),
      );

      const uniqueExercises = ejerciciosValidos.filter((ej) => {
        const normalized = ej.pregunta
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        return !existingTexts.some(
          (existing) => similarity(normalized, existing) > 0.8,
        );
      });

      if (uniqueExercises.length < ejerciciosValidos.length) {
        console.log(
          `[AutoPropagation] Dedup: ${ejerciciosValidos.length - uniqueExercises.length} ejercicios duplicados filtrados para "${topicInfo.name}"`,
        );
      }

      if (uniqueExercises.length === 0) {
        await updateStep(classId, stepLabel, "done", "todos duplicados");
        return {
          topic: topicInfo.name,
          generados: 0,
          tipo: tipoGeneracion as "nuevo" | "refuerzo",
        };
      }

      const data = uniqueExercises.map((ej) => ({
        topicId: topicInfo.id,
        latex: ej.pregunta,
        difficulty: diffMap[ej.dificultad] || ej.dificultad,
        steps: ej.solucion || null,
        hints: ej.pistas ? JSON.stringify(ej.pistas) : null,
        generatedByClassId: classId,
      }));

      await prisma.exercise.createMany({ data });

      console.log(
        `[AutoPropagation] ✓ ${tipoGeneracion.toUpperCase()}: ${data.length} ejercicios para "${topicInfo.name}"` +
          (resultado.stats
            ? ` (${resultado.stats.exitosos}/${resultado.stats.intentos} lotes OK, ${resultado.stats.tiempoMs}ms)`
            : ""),
      );
      await updateStep(classId, stepLabel, "done", `${data.length} ejercicios`);
      return {
        topic: topicInfo.name,
        generados: data.length,
        tipo: tipoGeneracion as "nuevo" | "refuerzo",
      };
    } catch (err: any) {
      console.error(
        `[AutoPropagation] ✗ Error generando ejercicios para ${topicInfo.name}: ${err.message}`,
      );
      await updateStep(classId, stepLabel, "error", err.message);
      return {
        topic: topicInfo.name,
        generados: 0,
        tipo: tipoGeneracion as "nuevo" | "refuerzo",
        error: err.message,
      };
    }
  });

  const exerciseResults = await parallelWithLimit(exerciseTasks, 3);
  resultadosGeneracion.push(...exerciseResults);

  // Resumen
  const totalGenerados = resultadosGeneracion.reduce(
    (s, r) => s + r.generados,
    0,
  );
  const totalNuevos = resultadosGeneracion
    .filter((r) => r.tipo === "nuevo")
    .reduce((s, r) => s + r.generados, 0);
  const totalRefuerzo = resultadosGeneracion
    .filter((r) => r.tipo === "refuerzo")
    .reduce((s, r) => s + r.generados, 0);
  const totalFallidos = resultadosGeneracion.filter((r) => r.error).length;
  console.log(
    `[AutoPropagation] Resumen: ${totalGenerados} ejercicios (${totalNuevos} nuevos + ${totalRefuerzo} refuerzo), ` +
      `${totalFallidos} fallidos de ${resultadosGeneracion.length} temas`,
  );

  // 3. Generar documentación de temas (PARALELO)
  const hayNuevosTemas = nuevos.length > 0;
  const apiKey = process.env.GEMINI_API_KEY;

  const docTasks = topicResults.map((topicInfo) => async () => {
    const stepLabel = `Documentación: ${topicInfo.originalName}`;
    await updateStep(classId, stepLabel, "running");

    const existingDoc = await prisma.topicDoc.findUnique({
      where: { topicId: topicInfo.id },
    });
    if (existingDoc) {
      await updateStep(classId, stepLabel, "done", "ya existía");
      return;
    }

    if (!apiKey) {
      await updateStep(classId, stepLabel, "done", "sin API key");
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Eres un profesor de matemáticas experto. Genera documentación educativa completa sobre el tema: "${topicInfo.name}".

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
      const parsed = parseGeminiJSON(text);

      if (parsed) {
        await prisma.topicDoc.upsert({
          where: { topicId: topicInfo.id },
          update: {
            conceptos: parsed.conceptos || "",
            ejemplos: JSON.stringify(
              Array.isArray(parsed.ejemplos) ? parsed.ejemplos : [],
            ),
            casosDeUso: JSON.stringify(
              Array.isArray(parsed.casosDeUso) ? parsed.casosDeUso : [],
            ),
            curiosidades: JSON.stringify(
              Array.isArray(parsed.curiosidades) ? parsed.curiosidades : [],
            ),
          },
          create: {
            topicId: topicInfo.id,
            conceptos: parsed.conceptos || "",
            ejemplos: JSON.stringify(
              Array.isArray(parsed.ejemplos) ? parsed.ejemplos : [],
            ),
            casosDeUso: JSON.stringify(
              Array.isArray(parsed.casosDeUso) ? parsed.casosDeUso : [],
            ),
            curiosidades: JSON.stringify(
              Array.isArray(parsed.curiosidades) ? parsed.curiosidades : [],
            ),
          },
        });
        console.log(
          `[AutoPropagation] ✓ Documentación generada para "${topicInfo.name}"`,
        );
        await updateStep(classId, stepLabel, "done");
      } else {
        console.warn(
          `[AutoPropagation] ✗ No se pudo parsear docs para "${topicInfo.name}"`,
        );
        await updateStep(classId, stepLabel, "error", "JSON inválido");
      }
    } catch (err: any) {
      console.error(
        `[AutoPropagation] ✗ Error generando docs para ${topicInfo.name}: ${err.message}`,
      );
      await updateStep(classId, stepLabel, "error", err.message);
    }
  });

  await parallelWithLimit(docTasks, 3);

  // 4. Actualizar DAG — solo si hay temas nuevos
  if (hayNuevosTemas) {
    await updateStep(classId, "Reconstruyendo DAG", "running");
    await rebuildDAG();
    await updateStep(classId, "Reconstruyendo DAG", "done");
    await updateStep(classId, "Auditando DAG", "done");
  } else {
    console.log(
      `[AutoPropagation] Sin temas nuevos — DAG no necesita reconstrucción`,
    );
    await updateStep(classId, "Reconstruyendo DAG", "done", "sin cambios");
    await updateStep(classId, "Auditando DAG", "done", "sin cambios");
  }

  // 5. Generar apuntes
  await updateStep(classId, "Generando apuntes", "running");
  try {
    const cls = await prisma.classLog.findUnique({
      where: { id: classId },
      select: {
        chunks: { select: { text: true }, orderBy: { index: "asc" } },
        notes: { select: { id: true } },
      },
    });
    const apiKey = process.env.GEMINI_API_KEY;
    if (cls && cls.chunks.length > 0 && cls.notes.length === 0 && apiKey) {
      const { generateNotesForClass } = await import("../routes/notes");
      const apuntes = await generateNotesForClass(classId, cls.chunks, apiKey);
      if (apuntes.length > 0) {
        await prisma.classNote.createMany({
          data: apuntes.map((a: any) => ({
            classId,
            titulo: a.titulo,
            contenido: a.contenido,
            categoria: a.categoria,
          })),
        });
      }
      await updateStep(
        classId,
        "Generando apuntes",
        "done",
        `${apuntes.length} apuntes`,
      );
    } else {
      await updateStep(classId, "Generando apuntes", "done", "omitido");
    }
  } catch (err: any) {
    console.error(`[AutoPropagation] Error generando apuntes: ${err.message}`);
    await updateStep(classId, "Generando apuntes", "error", err.message);
  }

  await completeGeneration(classId);
  console.log(`[AutoPropagation] Propagación completada para clase ${classId}`);
}

/**
 * Reconstruye las dependencias del DAG usando IA para inferir prerrequisitos reales.
 * Si no hay API key, usa heurística de orden cronológico.
 */
async function rebuildDAG() {
  console.log(`[AutoPropagation] Reconstruyendo DAG`);

  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });

  if (allTopics.length < 2) {
    console.log(`[AutoPropagation] Menos de 2 temas, nada que conectar`);
    return;
  }

  // Limpiar dependencias existentes
  await prisma.topicDependency.deleteMany({});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await buildLinearDAG(allTopics);
  } else {
    try {
      const topicNames = allTopics.map((t) => t.name);
      const deps = await inferDependenciesWithAI(topicNames);
      await saveDependencies(deps, allTopics);
    } catch (err: any) {
      console.warn(
        `[AutoPropagation] IA falló para DAG, usando heurística: ${err.message}`,
      );
      await buildLinearDAG(allTopics);
    }
  }

  // Auditar y corregir nodos huérfanos
  await auditDAG();

  console.log(`[AutoPropagation] DAG reconstruido y auditado`);
}

/**
 * Infiere dependencias matemáticas reales entre temas usando Gemini.
 * El prompt fuerza que TODOS los temas estén conectados (la matemática siempre se relaciona).
 */
async function inferDependenciesWithAI(
  topicNames: string[],
): Promise<{ padre: string; hijo: string }[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  });

  const prompt = `Eres un experto en pedagogía matemática. Dados estos temas de un curso de matemáticas, construye un grafo de dependencias COMPLETO y CONECTADO.

Temas del curso:
${topicNames.map((t, i) => `${i + 1}. ${t}`).join("\n")}

REGLAS ESTRICTAS:
- Una dependencia "A → B" significa "para entender B se necesita saber A primero"
- Solo crea dependencias directas (no transitivas)
- Un tema puede tener múltiples prerrequisitos y múltiples dependientes
- SOLO UN tema puede ser raíz (el más fundamental de todos). Los demás DEBEN tener al menos un prerrequisito.
- TODOS los temas deben estar conectados al grafo. NO puede haber temas aislados o huérfanos.
- La matemática siempre se relaciona: si un tema parece no tener conexión directa, busca el concepto matemático subyacente que lo conecta con los demás.
- Piensa en el orden pedagógico: ¿qué necesita saber un estudiante antes de abordar cada tema?
- Usa los nombres EXACTOS de la lista

VERIFICACIÓN: Antes de responder, confirma que cada uno de los ${topicNames.length} temas aparece al menos una vez en tus dependencias (como padre o como hijo).

Responde SOLO con JSON válido:
{
  "raiz": "nombre del tema más fundamental",
  "dependencias": [
    { "padre": "nombre exacto del prerrequisito", "hijo": "nombre exacto del tema que depende" }
  ]
}`;

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

  if (!jsonStr) return [];

  const parsed = parseGeminiJSON(jsonStr);
  return (parsed.dependencias || []).filter(
    (d: any) => typeof d.padre === "string" && typeof d.hijo === "string",
  );
}

/**
 * Guarda las dependencias en la BD, haciendo match fuzzy con los topics existentes.
 */
async function saveDependencies(
  deps: { padre: string; hijo: string }[],
  allTopics: { id: number; name: string }[],
) {
  const nameToId = new Map<string, number>();
  for (const t of allTopics) {
    nameToId.set(t.name, t.id);
  }

  // Match fuzzy helper
  const findTopicId = (name: string): number | null => {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
    // Exact match first
    for (const t of allTopics) {
      if (t.name === normalized) return t.id;
    }
    // Fuzzy match
    let best: { id: number; score: number } | null = null;
    for (const t of allTopics) {
      const score = similarity(normalized, t.name);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { id: t.id, score };
      }
    }
    return best?.id ?? null;
  };

  let created = 0;
  for (const dep of deps) {
    const parentId = findTopicId(dep.padre);
    const childId = findTopicId(dep.hijo);
    if (parentId && childId && parentId !== childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        created++;
      } catch {
        // Silently skip duplicates (unique constraint)
      }
    }
  }
  console.log(`[AutoPropagation] ${created} dependencias creadas por IA`);
}

/**
 * Audita el DAG para detectar y corregir nodos huérfanos (sin ninguna conexión).
 * Si la IA dejó temas sin conectar, los conecta al nodo más relacionado usando similitud.
 * Si no hay API key, conecta huérfanos al nodo raíz o al primer nodo conectado.
 */
export async function auditDAG() {
  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });
  const allDeps = await prisma.topicDependency.findMany();

  // Encontrar nodos conectados (aparecen como padre o hijo)
  const connectedIds = new Set<number>();
  for (const d of allDeps) {
    connectedIds.add(d.parentId);
    connectedIds.add(d.childId);
  }

  // Encontrar huérfanos
  const orphans = allTopics.filter((t) => !connectedIds.has(t.id));

  if (orphans.length === 0) {
    console.log(
      `[AuditDAG] ✓ Todos los ${allTopics.length} temas están conectados`,
    );
    return;
  }

  console.log(
    `[AuditDAG] ⚠ ${orphans.length} tema(s) huérfano(s) detectado(s): ${orphans.map((o) => o.name).join(", ")}`,
  );

  // Encontrar nodos raíz (solo aparecen como padre, nunca como hijo)
  const childIds = new Set(allDeps.map((d) => d.childId));
  const connectedTopics = allTopics.filter((t) => connectedIds.has(t.id));
  const roots = connectedTopics.filter((t) => !childIds.has(t.id));

  // Usar IA si hay API key para conectar los huérfanos de forma inteligente
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && connectedTopics.length > 0) {
    try {
      await connectOrphansWithAI(orphans, connectedTopics, allDeps, allTopics);
      return;
    } catch (err: any) {
      console.warn(
        `[AuditDAG] IA falló para conectar huérfanos: ${err.message}, usando heurística`,
      );
    }
  }

  // Fallback heurístico: conectar huérfanos al nodo más similar entre los conectados
  const anchor = roots[0] || connectedTopics[0];
  if (!anchor) {
    // No hay nodos conectados aún — crear cadena entre todos los huérfanos
    for (let i = 0; i < orphans.length - 1; i++) {
      try {
        await prisma.topicDependency.create({
          data: { parentId: orphans[i].id, childId: orphans[i + 1].id },
        });
      } catch {}
    }
    console.log(`[AuditDAG] ${orphans.length} huérfanos encadenados entre sí`);
    return;
  }

  let connected = 0;
  for (const orphan of orphans) {
    // Buscar el tema conectado más similar por nombre
    let bestMatch = anchor;
    let bestScore = 0;
    for (const ct of connectedTopics) {
      const score = similarity(orphan.name, ct.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ct;
      }
    }

    // Determinar dirección: ¿el huérfano es más básico o más avanzado?
    // Heurística: si el nombre del huérfano contiene palabras como "básico", "fundamento", "introducción"
    // es más probable que sea prerrequisito
    const basicKeywords = [
      "básic",
      "fundament",
      "introduc",
      "nocion",
      "concept",
      "definic",
      "operacion",
      "número",
      "conjunt",
    ];
    const isBasic = basicKeywords.some((kw) => orphan.name.includes(kw));

    try {
      if (isBasic) {
        // Huérfano es prerrequisito del matched
        await prisma.topicDependency.create({
          data: { parentId: orphan.id, childId: bestMatch.id },
        });
      } else {
        // Huérfano depende del matched
        await prisma.topicDependency.create({
          data: { parentId: bestMatch.id, childId: orphan.id },
        });
      }
      connected++;
    } catch {
      /* skip duplicates */
    }
  }
  console.log(`[AuditDAG] ${connected} huérfanos conectados por heurística`);
}

/**
 * Usa IA para conectar temas huérfanos al DAG existente de forma pedagógicamente correcta.
 */
async function connectOrphansWithAI(
  orphans: { id: number; name: string }[],
  connectedTopics: { id: number; name: string }[],
  existingDeps: { parentId: number; childId: number }[],
  allTopics: { id: number; name: string }[],
) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  });

  const depsText = existingDeps
    .slice(0, 50)
    .map((d) => {
      const parent = allTopics.find((t) => t.id === d.parentId)?.name || "?";
      const child = allTopics.find((t) => t.id === d.childId)?.name || "?";
      return `"${parent}" → "${child}"`;
    })
    .join("\n");

  const prompt = `Eres un experto en pedagogía matemática. Hay temas huérfanos (sin conexión) en un DAG de aprendizaje que necesitan conectarse.

TEMAS HUÉRFANOS (necesitan conectarse):
${orphans.map((o) => `- "${o.name}"`).join("\n")}

TEMAS YA CONECTADOS EN EL DAG:
${connectedTopics.map((t) => `- "${t.name}"`).join("\n")}

DEPENDENCIAS ACTUALES:
${depsText}

Para CADA tema huérfano, indica a qué tema(s) del DAG debe conectarse y en qué dirección.
La matemática siempre se relaciona — encuentra la conexión pedagógica real.

Responde SOLO con JSON válido:
{
  "conexiones": [
    { "padre": "nombre del prerrequisito", "hijo": "nombre del tema que depende" }
  ]
}

Reglas:
- Cada huérfano debe aparecer al menos una vez (como padre o hijo)
- Usa los nombres EXACTOS de las listas
- Un prerrequisito "padre" es lo que se debe saber ANTES del "hijo"`;

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

  if (!jsonStr) throw new Error("IA no retornó JSON");

  const parsed = parseGeminiJSON(jsonStr);
  const conexiones: { padre: string; hijo: string }[] = parsed.conexiones || [];

  let connected = 0;
  for (const con of conexiones) {
    const parentId = findTopicIdInList(con.padre, allTopics);
    const childId = findTopicIdInList(con.hijo, allTopics);
    if (parentId && childId && parentId !== childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        connected++;
      } catch {
        /* skip duplicates */
      }
    }
  }
  console.log(`[AuditDAG] ${connected} huérfanos conectados por IA`);
}

/**
 * Fallback: DAG lineal basado en orden cronológico de aparición de temas.
 */
async function buildLinearDAG(allTopics: { id: number; name: string }[]) {
  const classLogs = await prisma.classLog.findMany({
    orderBy: { date: "asc" },
    select: { topics: true },
  });

  const ordered: string[] = [];
  for (const cl of classLogs) {
    const temas = cl.topics ? JSON.parse(cl.topics) : [];
    if (Array.isArray(temas)) {
      for (const t of temas.map(normalizeTopicName)) {
        if (!ordered.includes(t)) ordered.push(t);
      }
    }
  }

  // Agregar topics que no aparecen en clases (del seed)
  for (const t of allTopics) {
    if (!ordered.includes(t.name)) ordered.push(t.name);
  }

  const nameToId = new Map(allTopics.map((t) => [t.name, t.id]));
  let created = 0;

  for (let i = 0; i < ordered.length - 1; i++) {
    const parentId = nameToId.get(ordered[i]);
    const childId = nameToId.get(ordered[i + 1]);
    if (parentId && childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        created++;
      } catch {
        /* skip duplicates */
      }
    }
  }
  console.log(
    `[AutoPropagation] ${created} dependencias lineales creadas (fallback)`,
  );
}

/**
 * Extiende el DAG buscando prerrequisitos más profundos con IA.
 * Crea nuevos topics y genera ejercicios para ellos.
 * Retorna los nuevos topics y dependencias creados.
 */
export async function extendDAG(): Promise<{
  newTopics: { id: number; name: string }[];
  newDependencies: number;
  newExercises: number;
}> {
  console.log(`[ExtendDAG] Iniciando extensión del DAG`);

  const existingTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  if (existingTopics.length === 0) {
    return { newTopics: [], newDependencies: 0, newExercises: 0 };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY necesaria para extender DAG");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  });

  // Obtener dependencias actuales para contexto
  const existingDeps = await prisma.topicDependency.findMany();
  const depsText =
    existingDeps.length > 0
      ? existingDeps
          .map((d) => {
            const parent =
              existingTopics.find((t) => t.id === d.parentId)?.name || "?";
            const child =
              existingTopics.find((t) => t.id === d.childId)?.name || "?";
            return `${parent} → ${child}`;
          })
          .join("\n")
      : "(sin dependencias aún)";

  const prompt = `Eres un experto en pedagogía matemática. Analiza este DAG de aprendizaje y sugiere temas PRERREQUISITOS que faltan.

Temas actuales del curso:
${existingTopics.map((t) => `- ${t.name}`).join("\n")}

Dependencias actuales:
${depsText}

Identifica 3-5 temas PRERREQUISITOS fundamentales que los estudiantes deberían dominar ANTES de estos temas, y que NO están en la lista actual. Piensa en conceptos más básicos que son base de los existentes.

Por ejemplo, si el curso tiene "Ecuación de una Recta", un prerrequisito podría ser "Sistemas de coordenadas" o "Variables y expresiones algebraicas".

Responde SOLO con JSON válido:
{
  "nuevosTemas": [
    {
      "nombre": "nombre del tema prerrequisito",
      "dependesDe": [],
      "esPrerrequistoDe": ["nombre de tema existente que depende de este"]
    }
  ]
}

Reglas:
- Los nombres en "esPrerrequistoDe" deben ser EXACTOS de la lista de temas actuales
- "dependesDe" puede incluir otros temas nuevos que propongas o temas existentes
- Solo propón temas realmente fundamentales que faltan`;

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

  if (!jsonStr) throw new Error("IA no retornó JSON válido");

  const parsed = parseGeminiJSON(jsonStr);
  const nuevosTemas: {
    nombre: string;
    dependesDe: string[];
    esPrerrequistoDe: string[];
  }[] = parsed.nuevosTemas || [];

  if (nuevosTemas.length === 0) {
    console.log(`[ExtendDAG] IA no sugirió temas nuevos`);
    return { newTopics: [], newDependencies: 0, newExercises: 0 };
  }

  // Create new topics
  const createdTopics: { id: number; name: string }[] = [];
  for (const tema of nuevosTemas) {
    const normalized = normalizeTopicName(tema.nombre);
    const exists = await findExistingTopic(normalized);
    if (exists) {
      console.log(`[ExtendDAG] Tema "${normalized}" ya existe, omitiendo`);
      createdTopics.push(exists);
      continue;
    }

    const newTopic = await prisma.topic.create({
      data: { name: normalized },
    });
    createdTopics.push({ id: newTopic.id, name: normalized });
    console.log(
      `[ExtendDAG] Nuevo tema creado: "${normalized}" (id: ${newTopic.id})`,
    );
  }

  // Create dependencies: new topics → existing topics
  let newDeps = 0;
  const allTopicsNow = [...existingTopics, ...createdTopics];

  for (let i = 0; i < nuevosTemas.length; i++) {
    const tema = nuevosTemas[i];
    const topicInfo = createdTopics[i];
    if (!topicInfo) continue;

    // This new topic is prerequisite of existing topics
    for (const childName of tema.esPrerrequistoDe) {
      const childId = findTopicIdInList(childName, allTopicsNow);
      if (childId && childId !== topicInfo.id) {
        try {
          await prisma.topicDependency.create({
            data: { parentId: topicInfo.id, childId },
          });
          newDeps++;
        } catch {
          /* skip duplicates */
        }
      }
    }

    // Dependencies between new topics
    for (const depName of tema.dependesDe) {
      const parentId = findTopicIdInList(depName, allTopicsNow);
      if (parentId && parentId !== topicInfo.id) {
        try {
          await prisma.topicDependency.create({
            data: { parentId, childId: topicInfo.id },
          });
          newDeps++;
        } catch {
          /* skip duplicates */
        }
      }
    }
  }

  // Generate exercises for truly new topics (those not previously existing)
  let totalExercises = 0;
  const newTopicIds = createdTopics.filter(
    (ct) => !existingTopics.some((et) => et.id === ct.id),
  );

  for (const topicInfo of newTopicIds) {
    try {
      const resultado = await generarEjercicios([topicInfo.name], 3);
      const ejerciciosValidos = resultado.ejercicios.filter(
        (ej) => ej.pregunta.trim().length >= 5,
      );

      if (ejerciciosValidos.length > 0) {
        const diffMap: Record<string, string> = {
          facil: "easy",
          medio: "medium",
          dificil: "hard",
        };
        await prisma.exercise.createMany({
          data: ejerciciosValidos.map((ej) => ({
            topicId: topicInfo.id,
            latex: ej.pregunta,
            difficulty: diffMap[ej.dificultad] || ej.dificultad,
            steps: ej.solucion || null,
            hints: ej.pistas ? JSON.stringify(ej.pistas) : null,
          })),
        });
        totalExercises += ejerciciosValidos.length;
        console.log(
          `[ExtendDAG] ✓ ${ejerciciosValidos.length} ejercicios para "${topicInfo.name}"`,
        );
      }
    } catch (err: any) {
      console.error(
        `[ExtendDAG] Error generando ejercicios para "${topicInfo.name}": ${err.message}`,
      );
    }
  }

  console.log(
    `[ExtendDAG] Completado: ${newTopicIds.length} temas nuevos, ${newDeps} dependencias, ${totalExercises} ejercicios`,
  );

  // Auditar para asegurar que los nuevos temas queden conectados
  await auditDAG();

  return {
    newTopics: newTopicIds,
    newDependencies: newDeps,
    newExercises: totalExercises,
  };
}

/**
 * Helper to find topic ID by name in a list (fuzzy match)
 */
function findTopicIdInList(
  name: string,
  topics: { id: number; name: string }[],
): number | null {
  const normalized = normalizeTopicName(name);
  // Exact match
  for (const t of topics) {
    if (t.name === normalized) return t.id;
  }
  // Fuzzy match
  let best: { id: number; score: number } | null = null;
  for (const t of topics) {
    const score = similarity(normalized, t.name);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { id: t.id, score };
    }
  }
  return best?.id ?? null;
}

/**
 * Rollback de una clase: elimina todos los artifacts generados por ella
 */
export async function rollbackClass(classId: number) {
  console.log(`[Rollback] Iniciando rollback para clase ${classId}`);

  // Verificar que la clase existe
  const classLog = await prisma.classLog.findUnique({ where: { id: classId } });
  if (!classLog) {
    throw new Error(`Clase ${classId} no encontrada`);
  }

  // Ejecutar en transacción
  await prisma.$transaction(async (tx) => {
    // 1. Eliminar tips de ejercicios generados por esta clase, luego los ejercicios
    const exercisesOfClass = await tx.exercise.findMany({
      where: { generatedByClassId: classId },
      select: { id: true },
    });
    const exerciseIds = exercisesOfClass.map((e) => e.id);
    if (exerciseIds.length > 0) {
      await tx.exerciseTip.deleteMany({
        where: { exerciseId: { in: exerciseIds } },
      });
    }
    const deletedExercises = await tx.exercise.deleteMany({
      where: { generatedByClassId: classId },
    });
    console.log(
      `[Rollback] Eliminados ${deletedExercises.count} ejercicios y sus tips`,
    );

    // 2. Eliminar dependencias generadas por esta clase
    const deletedDependencies = await tx.topicDependency.deleteMany({
      where: { generatedByClassId: classId },
    });
    console.log(
      `[Rollback] Eliminadas ${deletedDependencies.count} dependencias`,
    );

    // 3. Eliminar topics creados por esta clase, solo si no son referenciados por otras clases
    const topicsCreated = await tx.topic.findMany({
      where: { createdByClassId: classId },
    });

    // Obtener todas las demás clases para verificar si usan estos topics
    const otrasClases = await tx.classLog.findMany({
      where: { id: { not: classId } },
      select: { topics: true },
    });
    const temasOtrasClases = new Set<string>();
    for (const otra of otrasClases) {
      const temas = otra.topics ? JSON.parse(otra.topics) : [];
      if (Array.isArray(temas)) {
        temas.forEach((t: string) =>
          temasOtrasClases.add(t.trim().toLowerCase().replace(/\s+/g, " ")),
        );
      }
    }

    for (const topic of topicsCreated) {
      if (temasOtrasClases.has(topic.name)) {
        // Otra clase también tiene este tema, no borrar
        await tx.topic.update({
          where: { id: topic.id },
          data: { createdByClassId: null },
        });
        console.log(
          `[Rollback] Topic ${topic.name} mantenido (usado por otras clases)`,
        );
      } else {
        // Verificar que no tenga ejercicios manuales (sin generatedByClassId)
        const ejerciciosManuales = await tx.exercise.count({
          where: { topicId: topic.id, generatedByClassId: null },
        });
        if (ejerciciosManuales > 0) {
          await tx.topic.update({
            where: { id: topic.id },
            data: { createdByClassId: null },
          });
          console.log(
            `[Rollback] Topic ${topic.name} mantenido (tiene ejercicios manuales)`,
          );
        } else {
          // Eliminar tips de ejercicios del topic
          const topicExercises = await tx.exercise.findMany({
            where: { topicId: topic.id },
            select: { id: true },
          });
          if (topicExercises.length > 0) {
            await tx.exerciseTip.deleteMany({
              where: { exerciseId: { in: topicExercises.map((e) => e.id) } },
            });
          }
          // Eliminar documentación del topic
          await tx.topicDoc.deleteMany({ where: { topicId: topic.id } });
          // Eliminar TODOS los ejercicios del topic (no solo los de esta clase)
          await tx.exercise.deleteMany({ where: { topicId: topic.id } });
          // Eliminar fórmulas asociadas antes de borrar el topic
          await tx.formula.deleteMany({ where: { topicId: topic.id } });
          // Eliminar progreso asociado
          await tx.progress.deleteMany({ where: { topicId: topic.id } });
          // Eliminar dependencias que referencian este topic
          await tx.topicDependency.deleteMany({
            where: { OR: [{ parentId: topic.id }, { childId: topic.id }] },
          });
          await tx.topic.delete({ where: { id: topic.id } });
          console.log(`[Rollback] Eliminado topic huérfano: ${topic.name}`);
        }
      }
    }

    // 4. Eliminar imágenes asociadas a la clase
    await tx.classImage.deleteMany({ where: { classId } });

    // 5. Eliminar chunks de indexación (RAG)
    await tx.classChunk.deleteMany({ where: { classId } });

    // 6. Eliminar apuntes generados
    await tx.classNote.deleteMany({ where: { classId } });

    // 7. Eliminar la clase
    await tx.classLog.delete({ where: { id: classId } });
    console.log(`[Rollback] Eliminada clase ${classId}`);
  });

  // 8. Reconstruir DAG después del rollback
  await rebuildDAG();

  // 9. Invalidar caches de Redis relacionados a topics borrados
  try {
    const redis = getRedis();
    const topicsCreated = await prisma.topic.findMany({
      where: { createdByClassId: classId },
      select: { id: true },
    });
    // These topics were already deleted in the transaction, but clear any prior cache
    for (const t of topicsCreated) {
      await redis.del(`topicPrereq:${t.id}`).catch(() => {});
    }
    // Clear generation caches for deleted topics (pattern-based)
    const keys = await redis.keys("genCache:*").catch(() => [] as string[]);
    for (const key of keys) {
      await redis.del(key).catch(() => {});
    }
  } catch {
    // Redis may not be available, rollback still succeeded
  }

  console.log(`[Rollback] Rollback completado para clase ${classId}`);
}
