import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import {
  auditDAG,
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

    // Validar imágenes antes de crear el registro
    const imagenesData: { url: string; caption: string }[] = [];
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
        imagenesData.push({
          url: img.base64.substring(0, 100) + "...",
          caption: img.caption || "",
        });
      }
    }

    const textoTranscripcion = tieneTranscripcion ? transcript.trim() : "";

    // Dedup: check for duplicate transcript hash (last 24h)
    let transcriptHash: string | null = null;
    if (textoTranscripcion.length > 0) {
      transcriptHash = createHash("sha256").update(textoTranscripcion).digest("hex");
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
      `[ClassLog] Creando clase (async): transcripción=${tieneTranscripcion ? `${textoTranscripcion.length} chars` : "no"}, imágenes=${imagenesData.length}`,
    );

    // Create minimal record immediately — analysis happens in background
    const classLog = await prisma.classLog.create({
      data: {
        date: new Date(date + "T12:00:00"),
        transcript: textoTranscripcion,
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
    enqueueFullAnalysis(
      classLog.id,
      textoTranscripcion,
      tieneImagenes ? images.filter((img: any) => img.base64) : undefined,
    ).catch((err) => {
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
        longitudTranscripcion: textoTranscripcion.length,
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

    // Guardar imágenes en BD
    for (let i = 0; i < batchResult.resultados.length; i++) {
      const resultado = batchResult.resultados[i];
      await prisma.classImage.create({
        data: {
          classId: id,
          url: imagenesInput[i].base64.substring(0, 100) + "...",
          caption: resultado.textoDetectado.substring(0, 500),
        },
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

    // Enqueue new analysis
    enqueueFullAnalysis(id);

    res.json({ status: "reanalysis_queued", classId: id });
  } catch (error: any) {
    console.error("Error al re-analizar clase:", error);
    res.status(500).json({ error: "Error al re-analizar: " + error.message });
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
