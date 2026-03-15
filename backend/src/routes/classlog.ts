import { Request, Response, Router } from "express";
import prisma from "../prismaClient";
import {
  auditDAG,
  extendDAG,
  propagateClassChanges,
  rollbackClass,
} from "../services/autoPropagation";
import { reconstruirCurriculo } from "../services/curriculumReconstruction";
import { generarEjercicios } from "../services/exerciseGeneration";
import {
  failGeneration,
  getActiveGenerations,
  getGenerationStatusById,
} from "../services/generationStatus";
import {
  procesarImagenesBatch,
  validarImagen,
} from "../services/imageAnalysis";
import { indexClassTranscript } from "../services/ragService";
import {
  analizarTranscripcion,
  ImagenContexto,
} from "../services/transcriptAnalysis";

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
  // Extender timeout para operaciones largas
  req.setTimeout(LONG_OPERATION_TIMEOUT);
  res.setTimeout(LONG_OPERATION_TIMEOUT);

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

    console.log(
      `[ClassLog] Creando clase: transcripción=${tieneTranscripcion ? `${transcript.length} chars` : "no"}, imágenes=${tieneImagenes ? images.length : 0}`,
    );

    // 1. Validar imágenes y prepararlas como contexto visual
    const imagenesContexto: ImagenContexto[] = [];
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
        imagenesContexto.push({
          base64: img.base64,
          mimeType: img.mimeType || "image/jpeg",
        });
        imagenesData.push({
          url: img.base64.substring(0, 100) + "...",
          caption: img.caption || "",
        });
      }

      if (erroresValidacion.length > 0) {
        console.warn(
          `[ClassLog] ${erroresValidacion.length} imágenes rechazadas:`,
          erroresValidacion,
        );
      }
    }

    // 2. Analizar transcripción + imágenes como contexto visual unificado.
    // Las imágenes se envían directamente a Gemini junto con el texto
    // para que el modelo las interprete como parte de la misma clase.
    const textoTranscripcion = tieneTranscripcion ? transcript.trim() : "";

    let analisisTranscripcion;
    if (textoTranscripcion.length > 0 || imagenesContexto.length > 0) {
      // Si solo hay imágenes sin texto, crear un prompt mínimo
      const textoFinal =
        textoTranscripcion ||
        "[Sin transcripción de voz. Analiza únicamente las imágenes adjuntas de la clase.]";
      analisisTranscripcion = await analizarTranscripcion(
        textoFinal,
        imagenesContexto.length > 0 ? imagenesContexto : undefined,
      );
    } else {
      analisisTranscripcion = {
        temas: [],
        formulas: [],
        tiposEjercicio: [],
        resumen: "Clase registrada sin contenido analizable.",
        conceptosClave: [],
      };
    }

    // 3. Crear registro en BD
    const classLog = await prisma.classLog.create({
      data: {
        date: new Date(date + "T12:00:00"),
        transcript: textoTranscripcion,
        summary: analisisTranscripcion.resumen,
        topics: JSON.stringify(analisisTranscripcion.temas),
        formulas: JSON.stringify(analisisTranscripcion.formulas),
        images: {
          create: imagenesData.map((img) => ({
            url: img.url,
            caption: img.caption,
          })),
        },
      },
      include: { images: true },
    });

    // 4. Propagar cambios automáticamente (topics, exercises, DAG)
    // Fire-and-forget: no bloquear la respuesta al usuario
    propagateClassChanges(classLog.id).catch((err) => {
      console.error(
        "[ClassLog] Error en auto-propagación (no bloqueante):",
        err,
      );
      failGeneration(classLog.id, err.message || "Error en propagación");
    });

    // 5. Indexar transcripción para RAG (fire-and-forget)
    if (textoTranscripcion.length > 0) {
      indexClassTranscript(
        classLog.id,
        textoTranscripcion,
        analisisTranscripcion.resumen,
      ).catch((err) => {
        console.error(
          "[ClassLog] Error al indexar para RAG (no bloqueante):",
          err,
        );
      });
    }

    // 5. Responder con datos completos
    const respuesta: any = {
      id: classLog.id,
      date: classLog.date,
      summary: analisisTranscripcion.resumen,
      temas: analisisTranscripcion.temas,
      formulas: analisisTranscripcion.formulas,
      conceptosClave: analisisTranscripcion.conceptosClave,
      tiposEjercicio: analisisTranscripcion.tiposEjercicio,
      imagenes: classLog.images.length,
      stats: {
        longitudTranscripcion: textoTranscripcion.length,
        imagenesRecibidas: tieneImagenes ? images.length : 0,
        imagenesUsadasComoContexto: imagenesContexto.length,
        imagenesRechazadas: erroresValidacion.length,
        temasDetectados: analisisTranscripcion.temas.length,
        formulasExtraidas: analisisTranscripcion.formulas.length,
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
 * GET /class-log/generation-status/:classId
 * Consultar el estado de generación en background para una clase
 */
router.get("/generation-status/:classId", async (req: Request, res: Response) => {
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
});

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
      imagenes: clase.images,
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

    const cantidad = Math.min(req.body.cantidad || 5, 10);
    const resultado = await generarEjercicios(temas, cantidad);

    // Resolver topics de la BD para asignar correctamente los ejercicios
    const topicMap = new Map<string, number>();
    for (const tema of temas) {
      const topic = await prisma.topic.findFirst({
        where: { name: tema },
      });
      if (!topic) {
        // Buscar case-insensitive manualmente (SQLite no soporta mode)
        const allTopics = await prisma.topic.findMany();
        const found = allTopics.find(
          (t) => t.name.toLowerCase() === tema.toLowerCase(),
        );
        if (found) topicMap.set(tema.toLowerCase(), found.id);
      }
      if (topic) topicMap.set(tema.toLowerCase(), topic.id);
    }
    // Fallback: primer topic de la clase
    const fallbackTopicId = topicMap.values().next().value || 1;

    // Guardar ejercicios generados en BD
    const diffMap: Record<string, string> = {
      facil: "easy",
      medio: "medium",
      dificil: "hard",
    };
    const ejerciciosGuardados: any[] = [];
    for (const ej of resultado.ejercicios) {
      // Asignar al topic correcto basado en el tipo del ejercicio
      const tipoNorm = (ej.tipo || "").toLowerCase();
      const topicId = topicMap.get(tipoNorm) || fallbackTopicId;

      const saved = await prisma.exercise.create({
        data: {
          topicId,
          latex: ej.pregunta,
          difficulty: diffMap[ej.dificultad] || ej.dificultad,
          steps: ej.solucion || null,
          hints: ej.pistas ? JSON.stringify(ej.pistas) : null,
          generatedByClassId: id,
        },
      });
      ejerciciosGuardados.push({ ...ej, id: saved.id });
    }

    res.json({
      ejercicios: ejerciciosGuardados,
      total: ejerciciosGuardados.length,
      guardadosEnBD: true,
      stats: resultado.stats || null,
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
