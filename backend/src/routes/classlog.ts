import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import {
  auditDAG,
  cleanArtifactsForReanalysis,
  extendDAG,
  rollbackClass,
} from "../services/autoPropagation";
import { reconstruirCurriculo } from "../services/curriculumReconstruction";
import {
  getActiveGenerations,
  getGenerationStatusById,
} from "../services/generationStatus";
import {
  procesarImagenesBatch,
  validarImagen,
} from "../services/imageAnalysis";
import { enqueueFullAnalysis, cancelGeneration } from "../services/jobQueue";
import { deleteGenerationStatus } from "../services/redisClient";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";

const router = Router();

// Máximo de imágenes por envío
const MAX_IMAGES_PER_REQUEST = 20;
// Timeout para operaciones largas (5 minutos)
const LONG_OPERATION_TIMEOUT = 5 * 60 * 1000;

/**
 * POST /class-log
 * Crear un nuevo registro de clase con transcripción e imágenes.
 *
 * Soporta edge cases:
 * - Transcripciones muy largas (horas de clase, se procesan por chunks)
 * - Muchas imágenes simultáneas (procesamiento paralelo con concurrencia 3)
 * - Solo transcripción sin imágenes
 * - Solo imágenes sin transcripción (extrae texto de imágenes como transcripción)
 * - Fallos parciales en imágenes (las que fallan no impiden las demás)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { date, title, transcript, images } = req.body;

    if (!date) {
      res.status(400).json({ error: "date es requerido" });
      return;
    }

    const tieneTranscripcion =
      transcript &&
      typeof transcript === "string" &&
      transcript.trim().length > 0;
    const tieneImagenes = images && Array.isArray(images) && images.length > 0;

    if (!tieneTranscripcion && !tieneImagenes) {
      res.status(400).json({
        error: "Se requiere al menos una transcripción o imagen",
      });
      return;
    }

    // Validar cantidad de imágenes
    if (tieneImagenes && images.length > MAX_IMAGES_PER_REQUEST) {
      res.status(400).json({
        error: `Máximo ${MAX_IMAGES_PER_REQUEST} imágenes por envío. Enviaste ${images.length}.`,
      });
      return;
    }

    // Validar y preparar imágenes
    const imagenesValidas: { base64: string; mimeType: string; caption?: string }[] = [];
    const erroresValidacion: string[] = [];

    if (tieneImagenes) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.base64 || typeof img.base64 !== "string") {
          erroresValidacion.push(`Imagen ${i + 1}: sin datos base64`);
          continue;
        }
        const validacion = validarImagen(
          img.base64,
          img.mimeType || "image/jpeg",
        );
        if (!validacion.valida) {
          erroresValidacion.push(`Imagen ${i + 1}: ${validacion.error}`);
          continue;
        }
        imagenesValidas.push({
          base64: img.base64,
          mimeType: img.mimeType || "image/jpeg",
          caption: img.caption || "",
        });
      }
    }

    // ═══════════════════════════════════════════════
    // PROCESAR IMÁGENES: extraer texto y fórmulas
    // Las imágenes son anotaciones del profesor o actividades de clase.
    // Su contenido refuerza/complementa la transcripción.
    // ═══════════════════════════════════════════════
    let textoImagenes = "";
    let imagenesData: { url: string; caption: string }[] = [];

    if (imagenesValidas.length > 0) {
      try {
        console.log(`[ClassLog] Procesando ${imagenesValidas.length} imágenes para extracción de contenido...`);
        const batchResult = await procesarImagenesBatch(imagenesValidas);

        // Construir texto extraído de imágenes para enriquecer la transcripción
        const textosExtraidos: string[] = [];
        for (let i = 0; i < batchResult.resultados.length; i++) {
          const r = batchResult.resultados[i];
          const partes: string[] = [];
          if (r.textoDetectado) partes.push(r.textoDetectado);
          if (r.formulas.length > 0) partes.push(`Fórmulas: ${r.formulas.join(", ")}`);
          if (r.ecuaciones.length > 0) partes.push(`Ecuaciones: ${r.ecuaciones.join(", ")}`);
          if (r.diagramas.length > 0) partes.push(`Diagramas: ${r.diagramas.join(", ")}`);
          if (r.desigualdades.length > 0) partes.push(`Desigualdades: ${r.desigualdades.join(", ")}`);
          if (partes.length > 0) textosExtraidos.push(partes.join("\n"));
        }

        if (textosExtraidos.length > 0) {
          textoImagenes = "\n\n[CONTENIDO EXTRAÍDO DE IMÁGENES]\n" + textosExtraidos.join("\n---\n");
        }

        // Guardar metadata de imágenes con captions extraídos (no base64 completo)
        imagenesData = batchResult.resultados.map((r, i) => ({
          url: `[imagen-${i + 1}]`,
          caption: (r.textoDetectado || "").substring(0, 500) || imagenesValidas[i]?.caption || "",
        }));

        for (const err of batchResult.errores) {
          erroresValidacion.push(`Imagen ${err.indice + 1}: error en análisis — ${err.error}`);
        }

        console.log(`[ClassLog] Imágenes procesadas: ${batchResult.resultados.length} OK, ${batchResult.errores.length} errores, texto extraído: ${textoImagenes.length} chars`);
      } catch (err: any) {
        console.warn("[ClassLog] Error procesando imágenes batch (fallback sin análisis):", err.message);
        imagenesData = imagenesValidas.map((img, i) => ({
          url: `[imagen-${i + 1}]`,
          caption: img.caption || "",
        }));
      }
    }

    const textoTranscripcion = tieneTranscripcion ? transcript.trim() : "";
    const textoCompleto = (textoTranscripcion + textoImagenes).trim();

    // ═══════════════════════════════════════════════
    // FUSIÓN POR FECHA: si ya existe una clase en esta fecha,
    // se fusiona como si fuera la misma clase (dedup por día).
    // ═══════════════════════════════════════════════
    const fechaClase = new Date(date + "T00:00:00");
    const fechaSiguiente = new Date(fechaClase);
    fechaSiguiente.setDate(fechaSiguiente.getDate() + 1);

    const claseExistente = await prisma.classLog.findFirst({
      where: {
        date: {
          gte: fechaClase,
          lt: fechaSiguiente,
        },
      },
      include: { images: true },
    });

    if (claseExistente) {
      // ─── FUSIÓN: misma fecha = misma clase ───
      console.log(`[ClassLog] Fusionando con clase existente #${claseExistente.id} (fecha: ${date})`);

      // Limpiar artifacts del análisis previo (ejercicios, topics, notas, dependencias)
      // para evitar duplicados cuando el pipeline re-analice el contenido combinado
      await cleanArtifactsForReanalysis(claseExistente.id);

      // Combinar transcripción existente + nuevo contenido
      const transcripcionMerged = claseExistente.transcript
        ? claseExistente.transcript + "\n\n--- [Contenido adicional] ---\n\n" + textoCompleto
        : textoCompleto;

      // Agregar nuevas imágenes a la clase existente
      if (imagenesData.length > 0) {
        await prisma.classImage.createMany({
          data: imagenesData.map((img) => ({
            classId: claseExistente.id,
            url: img.url,
            caption: img.caption,
          })),
        });
      }

      // Limpiar chunks para re-vectorización limpia
      await prisma.classChunk.deleteMany({
        where: { classId: claseExistente.id },
      });

      // Actualizar transcripción, título y reset de flags de análisis
      // Título: se mantiene el más reciente (el de la nueva subida si se envía)
      const newHash = createHash("sha256").update(transcripcionMerged).digest("hex");
      await prisma.classLog.update({
        where: { id: claseExistente.id },
        data: {
          transcript: transcripcionMerged,
          transcriptHash: newHash,
          title: title || claseExistente.title || null,
          summary: "Procesando (fusión)...",
          topics: "[]",
          formulas: "[]",
          activities: "[]",
          vectorized: false,
          analyzed: false,
          deepAnalyzed: false,
          analysisModel: null,
        },
      });

      // Limpiar estado Redis para evitar bloqueos
      const { getRedis } = await import("../services/redisClient");
      const redis = getRedis();
      await redis.del(`generation:cancel:${claseExistente.id}`);
      await redis.del(`propagation:lock:${claseExistente.id}`);
      await deleteGenerationStatus(claseExistente.id, "class");

      // Re-encolar análisis completo de 3 fases con contenido combinado
      enqueueFullAnalysis(claseExistente.id, undefined, undefined, true).catch((err) => {
        console.error("[ClassLog] Error encolando re-análisis (fusión):", err);
      });

      const totalImagenes = claseExistente.images.length + imagenesData.length;

      const respuesta: any = {
        id: claseExistente.id,
        date: claseExistente.date,
        summary: "Procesando (fusión)...",
        merged: true,
        processing: true,
        stats: {
          longitudTranscripcion: transcripcionMerged.length,
          imagenesRecibidas: tieneImagenes ? images.length : 0,
          imagenesRechazadas: erroresValidacion.length,
          imagenesTotal: totalImagenes,
        },
      };

      if (erroresValidacion.length > 0) {
        respuesta.advertencias = erroresValidacion;
      }

      res.status(200).json(respuesta);
      return;
    }

    // ═══════════════════════════════════════════════
    // NUEVA CLASE (no existe para esta fecha)
    // ═══════════════════════════════════════════════

    // Dedup: check for duplicate transcript hash (last 24h)
    let transcriptHash: string | null = null;
    if (textoCompleto.length > 0) {
      transcriptHash = createHash("sha256").update(textoCompleto).digest("hex");
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await prisma.classLog.findFirst({
        where: {
          transcriptHash,
          createdAt: { gte: oneDayAgo },
        },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        res.status(409).json({
          error: "Esta transcripción ya fue registrada",
          detail: `Clase #${existing.id} creada ${Math.round((Date.now() - existing.createdAt.getTime()) / 1000 / 60)} minutos atrás`,
        });
        return;
      }
    }

    console.log(
      `[ClassLog] Creando clase nueva: transcripción=${textoCompleto.length} chars, imágenes=${imagenesData.length}`,
    );

    // Create minimal record — analysis happens in background
    const classLog = await prisma.classLog.create({
      data: {
        date: new Date(date + "T12:00:00"),
        transcript: textoCompleto,
        transcriptHash,
        summary: "Procesando...",
        topics: "[]",
        formulas: "[]",
        activities: "[]",
        images: {
          create: imagenesData.map((img) => ({
            url: img.url,
            caption: img.caption,
          })),
        },
      },
      include: { images: true },
    });

    // Enqueue full analysis + propagation in background
    enqueueFullAnalysis(classLog.id).catch((err) => {
      console.error("[ClassLog] Error encolando análisis:", err);
    });

    // Respond immediately — frontend tracks progress via WebSocket
    const respuesta: any = {
      id: classLog.id,
      date: classLog.date,
      summary: "Procesando...",
      temas: [],
      formulas: [],
      actividades: [],
      imagenes: classLog.images.length,
      processing: true,
      stats: {
        longitudTranscripcion: textoCompleto.length,
        imagenesRecibidas: tieneImagenes ? images.length : 0,
        imagenesRechazadas: erroresValidacion.length,
      },
    };

    if (erroresValidacion.length > 0) {
      respuesta.advertencias = erroresValidacion;
    }

    res.status(201).json(respuesta);
  } catch (error: any) {
    console.error("Error al crear ClassLog:", error);
    res
      .status(500)
      .json({ error: "Error al procesar la clase: " + error.message });
  }
});

/**
 * DELETE /class-log/:id/generation
 * Cancel an in-progress generation
 */
router.delete("/:id/generation", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  await cancelGeneration(id);
  res.json({ message: "Generación cancelada" });
});

/**
 * GET /class-log/generation-status/:classId
 * Consultar el estado de generación en background para una clase
 */
router.get(
  "/generation-status/:classId",
  async (req: Request, res: Response) => {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      res.status(400).json({ error: "classId inválido" });
      return;
    }
    const status = await getGenerationStatusById(classId);
    if (!status) {
      res.json({ status: "none" });
      return;
    }
    res.json(status);
  },
);

/**
 * GET /class-log/generation-status
 * Consultar todas las generaciones activas
 */
router.get("/generation-status", async (_req: Request, res: Response) => {
  res.json(await getActiveGenerations());
});

/**
 * GET /class-log
 * Listar todas las clases registradas
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const clases = await prisma.classLog.findMany({
      orderBy: { date: "desc" },
      include: { images: true },
    });

    const resultado = clases.map((c) => ({
      id: c.id,
      date: c.date,
      summary: c.summary,
      temas: safeParseJson(c.topics),
      formulas: safeParseJson(c.formulas),
      actividades: safeParseJson(c.activities),
      cantidadImagenes: c.images.length,
      createdAt: c.createdAt,
    }));

    res.json(resultado);
  } catch (error: any) {
    console.error("Error al listar clases:", error);
    res.status(500).json({ error: "Error al obtener las clases" });
  }
});

/**
 * GET /class-log/curriculum/reconstruct
 * Reconstruir el currículo a partir de todas las clases registradas
 * NOTA: Rutas estáticas DEBEN ir antes de /:id
 */
router.get("/curriculum/reconstruct", async (_req: Request, res: Response) => {
  try {
    const curriculo = await reconstruirCurriculo();
    res.json(curriculo);
  } catch (error: any) {
    console.error("Error en reconstrucción curricular:", error);
    res.status(500).json({ error: "Error al reconstruir el currículo" });
  }
});

/**
 * GET /class-log/dag
 * Obtener el DAG completo: topics + dependencias + ejercicios count
 */
router.get("/dag", async (_req: Request, res: Response) => {
  try {
    const topics = await prisma.topic.findMany({
      include: {
        exercises: { select: { id: true } },
        progress: { select: { completed: true, score: true } },
      },
    });
    const dependencies = await prisma.topicDependency.findMany();

    // Detectar huérfanos para mostrar en UI
    const connectedIds = new Set<number>();
    for (const d of dependencies) {
      connectedIds.add(d.parentId);
      connectedIds.add(d.childId);
    }

    const nodes = topics.map((t) => ({
      id: t.id,
      name: t.name,
      exerciseCount: t.exercises.length,
      completed: t.progress.some((p) => p.completed),
      score: t.progress[0]?.score ?? null,
      orphan: !connectedIds.has(t.id),
    }));

    const edges = dependencies.map((d) => ({
      parentId: d.parentId,
      childId: d.childId,
    }));

    res.json({ nodes, edges });
  } catch (error: any) {
    console.error("Error al obtener DAG:", error);
    res.status(500).json({ error: "Error al obtener el DAG" });
  }
});

/**
 * POST /class-log/dag/extend
 * Extender el DAG con prerrequisitos inferidos por IA
 */
router.post("/dag/extend", async (_req: Request, res: Response) => {
  try {
    const result = await extendDAG();
    res.json({
      message: `DAG extendido: ${result.newTopics.length} temas nuevos, ${result.newDependencies} dependencias, ${result.newExercises} ejercicios`,
      ...result,
    });
  } catch (error: any) {
    console.error("Error al extender DAG:", error);
    res
      .status(500)
      .json({ error: error.message || "Error al extender el DAG" });
  }
});

/**
 * POST /class-log/dag/audit
 * Auditar y corregir nodos huérfanos en el DAG
 */
router.post("/dag/audit", async (_req: Request, res: Response) => {
  try {
    await auditDAG();

    // Devolver el estado actual post-auditoría
    const topics = await prisma.topic.findMany({
      select: { id: true, name: true },
    });
    const deps = await prisma.topicDependency.findMany();
    const connectedIds = new Set<number>();
    for (const d of deps) {
      connectedIds.add(d.parentId);
      connectedIds.add(d.childId);
    }
    const orphans = topics.filter((t) => !connectedIds.has(t.id));

    res.json({
      message:
        orphans.length === 0
          ? `DAG auditado: ${topics.length} temas, todos conectados, ${deps.length} dependencias`
          : `DAG auditado: ${orphans.length} huérfanos restantes de ${topics.length} temas`,
      totalTopics: topics.length,
      totalDependencies: deps.length,
      orphanCount: orphans.length,
      orphans: orphans.map((o) => o.name),
    });
  } catch (error: any) {
    console.error("Error al auditar DAG:", error);
    res.status(500).json({ error: error.message || "Error al auditar el DAG" });
  }
});

/**
 * GET /class-log/timeline/weekly
 * Vista de línea temporal semanal
 */
router.get("/timeline/weekly", async (_req: Request, res: Response) => {
  try {
    const clases = await prisma.classLog.findMany({
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        topics: true,
        summary: true,
      },
    });

    // Agrupar por semana
    const semanas: Record<string, any[]> = {};
    for (const clase of clases) {
      const fecha = new Date(clase.date);
      const inicioSemana = new Date(fecha);
      inicioSemana.setDate(fecha.getDate() - fecha.getDay());
      const claveSemana = inicioSemana.toISOString().split("T")[0];

      if (!semanas[claveSemana]) {
        semanas[claveSemana] = [];
      }
      semanas[claveSemana].push({
        id: clase.id,
        date: clase.date,
        temas: safeParseJson(clase.topics),
        summary: clase.summary,
      });
    }

    const timeline = Object.entries(semanas).map(([semana, clases]) => ({
      semana,
      clases,
      totalTemas: clases.reduce((acc, c) => acc + (c.temas?.length || 0), 0),
    }));

    res.json(timeline);
  } catch (error: any) {
    console.error("Error al obtener timeline:", error);
    res.status(500).json({ error: "Error al obtener la línea temporal" });
  }
});

/**
 * GET /class-log/:id
 * Detalle de una clase específica
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const clase = await prisma.classLog.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!clase) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    // Obtener ejercicios generados para esta clase
    const ejerciciosGenerados = await prisma.exercise.findMany({
      where: { generatedByClassId: id },
      include: { topic: true },
    });

    res.json({
      id: clase.id,
      date: clase.date,
      transcript: clase.transcript,
      summary: clase.summary,
      temas: safeParseJson(clase.topics),
      formulas: safeParseJson(clase.formulas),
      actividades: safeParseJson(clase.activities),
      imagenes: clase.images,
      vectorized: clase.vectorized,
      analyzed: clase.analyzed,
      deepAnalyzed: clase.deepAnalyzed,
      analysisModel: clase.analysisModel,
      ejercicios: ejerciciosGenerados.map((ej) => ({
        id: ej.id,
        pregunta: ej.latex,
        solucion: ej.steps || "",
        dificultad:
          ej.difficulty === "easy"
            ? "facil"
            : ej.difficulty === "medium"
              ? "medio"
              : "dificil",
        tipo: ej.topic?.name || "",
        pistas: ej.hints ? JSON.parse(ej.hints) : [],
      })),
      createdAt: clase.createdAt,
    });
  } catch (error: any) {
    console.error("Error al obtener clase:", error);
    res.status(500).json({ error: "Error al obtener la clase" });
  }
});

/**
 * POST /class-log/:id/generate-exercises
 * Generar ejercicios adicionales para una clase
 */
router.post("/:id/generate-exercises", async (req: Request, res: Response) => {
  req.setTimeout(LONG_OPERATION_TIMEOUT);
  res.setTimeout(LONG_OPERATION_TIMEOUT);

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const clase = await prisma.classLog.findUnique({ where: { id } });
    if (!clase) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    const temas = safeParseJson(clase.topics);
    if (temas.length === 0) {
      res.status(400).json({
        error: "La clase no tiene temas detectados para generar ejercicios",
      });
      return;
    }

    // Resolver topics de la BD
    const allDbTopics = await prisma.topic.findMany();
    const topicMap = new Map<string, number>();
    for (const tema of temas) {
      const found = allDbTopics.find(
        (t) => t.name.toLowerCase() === tema.toLowerCase(),
      );
      if (found) topicMap.set(tema.toLowerCase(), found.id);
    }
    const fallbackTopicId = topicMap.values().next().value || 1;

    // Generar 1 ejercicio por tema con dificultad aleatoria
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY no configurada" });
      return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.8 },
    });

    const diffLabels = ["fácil", "intermedio", "difícil"];
    const diffKeys = ["easy", "medium", "hard"];
    const diffEsp = ["facil", "medio", "dificil"];
    const ejerciciosGuardados: any[] = [];

    for (const tema of temas.slice(0, 10)) {
      const diffIdx = Math.floor(Math.random() * 3);
      const topicId = topicMap.get(tema.toLowerCase()) || fallbackTopicId;

      const existing = await prisma.exercise.findMany({
        where: { topicId },
        select: { latex: true },
        take: 20,
      });
      const avoidSection =
        existing.length > 0
          ? `\n\nNO repitas estos ejercicios ya existentes:\n${existing.map((e, i) => `${i + 1}. ${e.latex}`).join("\n")}`
          : "";

      const prompt = `Genera exactamente 1 ejercicio de matemáticas de nivel ${diffLabels[diffIdx]} sobre: ${tema}.\n\nResponde SOLO con JSON válido (sin markdown, sin backticks):\n{\n  "pregunta": "enunciado claro con datos numéricos concretos",\n  "solucion": "resolución paso a paso",\n  "pistas": ["pista 1", "pista 2"]\n}\n\nEl ejercicio debe ser ORIGINAL y DIFERENTE a los existentes.${avoidSection}`;

      try {
        const result = await model.generateContent(prompt);
        const parsed = parseGeminiJSON(result.response.text().trim());

        if (parsed?.pregunta && parsed.pregunta.trim().length >= 5) {
          const saved = await prisma.exercise.create({
            data: {
              topicId,
              latex: parsed.pregunta,
              difficulty: diffKeys[diffIdx],
              steps: parsed.solucion || null,
              hints: parsed.pistas ? JSON.stringify(parsed.pistas) : null,
              generatedByClassId: id,
            },
          });
          ejerciciosGuardados.push({
            id: saved.id,
            pregunta: parsed.pregunta,
            solucion: parsed.solucion || "",
            dificultad: diffEsp[diffIdx],
            tipo: tema,
            pistas: parsed.pistas || [],
          });
        }
      } catch (err: any) {
        console.warn(
          `[ClassLog] Error generando ejercicio para "${tema}":`,
          err.message,
        );
      }
    }

    res.json({
      ejercicios: ejerciciosGuardados,
      total: ejerciciosGuardados.length,
      guardadosEnBD: true,
    });
  } catch (error: any) {
    console.error("Error al generar ejercicios:", error);
    res.status(500).json({ error: "Error al generar ejercicios" });
  }
});

/**
 * POST /class-log/:id/analyze-image
 * Analizar imagen(es) adicional(es) para una clase existente.
 * Acepta una imagen o un array de imágenes.
 */
router.post("/:id/analyze-image", async (req: Request, res: Response) => {
  req.setTimeout(LONG_OPERATION_TIMEOUT);
  res.setTimeout(LONG_OPERATION_TIMEOUT);

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const clase = await prisma.classLog.findUnique({ where: { id } });
    if (!clase) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    // Soportar formato single y array
    let imagenesInput: { base64: string; mimeType?: string }[] = [];
    if (req.body.base64 && typeof req.body.base64 === "string") {
      imagenesInput = [
        { base64: req.body.base64, mimeType: req.body.mimeType },
      ];
    } else if (Array.isArray(req.body.images)) {
      imagenesInput = req.body.images.filter(
        (img: any) => img.base64 && typeof img.base64 === "string",
      );
    }

    if (imagenesInput.length === 0) {
      res
        .status(400)
        .json({ error: "Se requiere al menos una imagen (base64 o images[])" });
      return;
    }

    if (imagenesInput.length > MAX_IMAGES_PER_REQUEST) {
      res.status(400).json({
        error: `Máximo ${MAX_IMAGES_PER_REQUEST} imágenes por envío`,
      });
      return;
    }

    const batchResult = await procesarImagenesBatch(
      imagenesInput.map((img) => ({
        base64: img.base64,
        mimeType: img.mimeType || "image/jpeg",
      })),
    );

    // Guardar imágenes en BD con captions extraídos
    for (let i = 0; i < batchResult.resultados.length; i++) {
      const resultado = batchResult.resultados[i];
      await prisma.classImage.create({
        data: {
          classId: id,
          url: `[imagen-analizada-${i + 1}]`,
          caption: (resultado.textoDetectado || "").substring(0, 500),
        },
      });
    }

    // Enriquecer la transcripción con el contenido extraído de imágenes
    const textosExtraidos: string[] = [];
    for (const r of batchResult.resultados) {
      const partes: string[] = [];
      if (r.textoDetectado) partes.push(r.textoDetectado);
      if (r.formulas.length > 0) partes.push(`Fórmulas: ${r.formulas.join(", ")}`);
      if (r.ecuaciones.length > 0) partes.push(`Ecuaciones: ${r.ecuaciones.join(", ")}`);
      if (r.diagramas.length > 0) partes.push(`Diagramas: ${r.diagramas.join(", ")}`);
      if (partes.length > 0) textosExtraidos.push(partes.join("\n"));
    }
    if (textosExtraidos.length > 0) {
      const textoImagenes = "\n\n[CONTENIDO EXTRAÍDO DE IMÁGENES]\n" + textosExtraidos.join("\n---\n");
      await prisma.classLog.update({
        where: { id },
        data: { transcript: clase.transcript + textoImagenes },
      });
    }

    // Actualizar fórmulas de la clase
    if (batchResult.formulasConsolidadas.length > 0) {
      const formulasExistentes = safeParseJson(clase.formulas);
      const formulasSet = new Set([
        ...formulasExistentes,
        ...batchResult.formulasConsolidadas,
      ]);
      await prisma.classLog.update({
        where: { id },
        data: { formulas: JSON.stringify([...formulasSet]) },
      });
    }

    res.json({
      procesadas: batchResult.resultados.length,
      errores: batchResult.errores,
      formulasNuevas: batchResult.formulasConsolidadas,
      resultados: batchResult.resultados,
    });
  } catch (error: any) {
    console.error("Error al analizar imagen:", error);
    res.status(500).json({ error: "Error al analizar la imagen" });
  }
});

/**
 * POST /class-log/:id/reanalyze
 * Re-analizar una clase con el pipeline de 3 fases
 */
router.post("/:id/reanalyze", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const classLog = await prisma.classLog.findUnique({ where: { id } });
    if (!classLog) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    // Reset analysis flags
    await prisma.classLog.update({
      where: { id },
      data: {
        vectorized: false,
        analyzed: false,
        deepAnalyzed: false,
        analysisModel: null,
      },
    });

    // Limpiar artifacts del análisis previo para evitar duplicados
    await cleanArtifactsForReanalysis(id);

    // Limpiar chunks para re-vectorización limpia
    await prisma.classChunk.deleteMany({ where: { classId: id } });

    // Clear stale Redis state so pipeline guards don't block
    await deleteGenerationStatus(id, "class");
    const { getRedis } = await import("../services/redisClient");
    const redis = getRedis();
    await redis.del(`generation:cancel:${id}`);
    await redis.del(`propagation:lock:${id}`);

    // Enqueue new analysis (force=true removes old completed BullMQ job)
    await enqueueFullAnalysis(id, undefined, undefined, true);

    res.json({ status: "reanalysis_queued", classId: id });
  } catch (error: any) {
    console.error("Error al re-analizar clase:", error);
    res.status(500).json({ error: "Error al re-analizar: " + error.message });
  }
});

/**
 * POST /class-log/:id/merge
 * Fusionar manualmente todas las clases del mismo día en esta clase.
 * Útil cuando se edita la fecha de una clase y queda duplicada.
 */
router.post("/:id/merge", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const target = await prisma.classLog.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!target) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    // Buscar otras clases del mismo día
    const fechaTarget = new Date(target.date);
    const fechaInicio = new Date(fechaTarget);
    fechaInicio.setHours(0, 0, 0, 0);
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + 1);

    const clasesDelDia = await prisma.classLog.findMany({
      where: {
        id: { not: id },
        date: { gte: fechaInicio, lt: fechaFin },
      },
      include: { images: true },
    });

    if (clasesDelDia.length === 0) {
      res.status(400).json({ error: "No hay otras clases del mismo día para fusionar" });
      return;
    }

    console.log(`[ClassLog] Fusión manual: clase #${id} absorbe ${clasesDelDia.length} clase(s) del mismo día`);

    // Combinar transcripciones de todas las fuentes en la clase target
    let transcripcionCombinada = target.transcript || "";
    for (const fuente of clasesDelDia) {
      if (fuente.transcript && fuente.transcript.trim().length > 0) {
        transcripcionCombinada += "\n\n--- [Contenido fusionado de clase #" + fuente.id + "] ---\n\n" + fuente.transcript;
      }
    }

    // Limpiar artifacts de TODAS las clases involucradas
    await cleanArtifactsForReanalysis(id);
    for (const fuente of clasesDelDia) {
      await cleanArtifactsForReanalysis(fuente.id);
    }

    // Migrar imágenes de las fuentes al target
    for (const fuente of clasesDelDia) {
      if (fuente.images.length > 0) {
        for (const img of fuente.images) {
          await prisma.classImage.create({
            data: { classId: id, url: img.url, caption: img.caption },
          });
        }
      }
    }

    // Borrar chunks de todas las clases (la target se re-vectoriza, las fuente se eliminan)
    await prisma.classChunk.deleteMany({ where: { classId: id } });

    // Eliminar las clases fuente (con sus imágenes, chunks, notas)
    for (const fuente of clasesDelDia) {
      await prisma.classImage.deleteMany({ where: { classId: fuente.id } });
      await prisma.classChunk.deleteMany({ where: { classId: fuente.id } });
      await prisma.classNote.deleteMany({ where: { classId: fuente.id } });
      await prisma.classLog.delete({ where: { id: fuente.id } });
    }

    // Actualizar la clase target con todo el contenido combinado
    const newHash = createHash("sha256").update(transcripcionCombinada).digest("hex");
    await prisma.classLog.update({
      where: { id },
      data: {
        transcript: transcripcionCombinada,
        transcriptHash: newHash,
        summary: "Procesando (fusión manual)...",
        topics: "[]",
        formulas: "[]",
        activities: "[]",
        vectorized: false,
        analyzed: false,
        deepAnalyzed: false,
        analysisModel: null,
      },
    });

    // Limpiar estado Redis
    const { getRedis } = await import("../services/redisClient");
    const redis = getRedis();
    await redis.del(`generation:cancel:${id}`);
    await redis.del(`propagation:lock:${id}`);
    await deleteGenerationStatus(id, "class");

    // Re-encolar análisis completo
    await enqueueFullAnalysis(id, undefined, undefined, true);

    res.json({
      status: "merged",
      classId: id,
      mergedCount: clasesDelDia.length,
      mergedIds: clasesDelDia.map((c) => c.id),
      transcriptLength: transcripcionCombinada.length,
    });
  } catch (error: any) {
    console.error("Error al fusionar clases:", error);
    res.status(500).json({ error: "Error al fusionar: " + error.message });
  }
});

/**
 * DELETE /class-log/:id
 * Eliminar una clase y hacer rollback de todos los artifacts generados
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    await rollbackClass(id);

    res.json({ message: "Clase eliminada y rollback completado" });
  } catch (error: any) {
    console.error("Error al eliminar clase:", error);
    res
      .status(500)
      .json({ error: "Error al eliminar la clase: " + error.message });
  }
});

/**
 * PATCH /class-log/:id
 * Actualizar registro de clase (todo excepto transcripción)
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    const { date, title, summary, topics, formulas, images } = req.body;

    // Verificar que la clase existe
    const classLog = await prisma.classLog.findUnique({
      where: { id },
    });

    if (!classLog) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    // Preparar datos de actualización (sin incluir transcript)
    const updateData: any = {};

    if (date) {
      updateData.date = new Date(date);
    }

    if (title !== undefined) {
      updateData.title = title;
    }

    if (summary !== undefined) {
      updateData.summary = summary;
    }

    if (topics !== undefined) {
      updateData.topics = Array.isArray(topics)
        ? JSON.stringify(topics)
        : topics;
    }

    if (formulas !== undefined) {
      updateData.formulas = Array.isArray(formulas)
        ? JSON.stringify(formulas)
        : formulas;
    }

    // Si se envían imágenes, validarlas y actualizarlas
    if (images && Array.isArray(images)) {
      if (images.length > MAX_IMAGES_PER_REQUEST) {
        res.status(400).json({
          error: `Máximo ${MAX_IMAGES_PER_REQUEST} imágenes. Enviaste ${images.length}.`,
        });
        return;
      }

      const imagenesData: { url: string; caption: string }[] = [];
      const erroresValidacion: string[] = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.base64 || typeof img.base64 !== "string") {
          erroresValidacion.push(`Imagen ${i + 1}: sin datos base64`);
          continue;
        }
        const validacion = validarImagen(
          img.base64,
          img.mimeType || "image/jpeg",
        );
        if (!validacion.valida) {
          erroresValidacion.push(`Imagen ${i + 1}: ${validacion.error}`);
          continue;
        }
        imagenesData.push({
          url: img.base64,
          caption: img.caption || "",
        });
      }

      if (erroresValidacion.length > 0) {
        console.warn(
          "[ClassLog Update] Errores en imágenes:",
          erroresValidacion,
        );
      }

      if (imagenesData.length > 0) {
        // Eliminar imágenes existentes y crear nuevas
        updateData.images = {
          deleteMany: {},
          create: imagenesData,
        };
      }
    }

    // Actualizar clase
    const updated = await prisma.classLog.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error: any) {
    console.error("Error al actualizar clase:", error);
    res
      .status(500)
      .json({ error: "Error al actualizar la clase: " + error.message });
  }
});

function safeParseJson(value: string | null): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default router;
