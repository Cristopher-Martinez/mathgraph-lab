import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import prisma from "../prismaClient";
import {
  chatWithClasses,
  getRAGStats,
  indexClassTranscript,
} from "../services/ragService";
import {
  deleteSession,
  getSessionMessages,
  getOrCreateSession,
  listSessions,
  saveMessage,
} from "../services/chatPersistence";
import { getRedis } from "../services/redisClient";

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: "Demasiadas preguntas. Espera un momento." },
  store: new RedisStore({
    sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
  }),
});

/**
 * POST /chat
 * Enviar un mensaje al chat con streaming SSE.
 * Soporta preguntas generales de matemáticas + RAG con clases + imágenes.
 * Body: { question: string, classId?: number, history?: Array<{role, text}>, images?: Array<{base64, mimeType}> }
 */
router.post("/", chatLimiter, async (req: Request, res: Response) => {
  try {
    const { question, classId, dateFrom, dateTo, history, images, sessionId } = req.body;

    if (!question || typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "question es requerido" });
      return;
    }

    // Validar imágenes si se envían
    const validImages: Array<{ base64: string; mimeType: string }> = [];
    if (images && Array.isArray(images)) {
      for (const img of images.slice(0, 5)) {
        if (img.base64 && typeof img.base64 === "string") {
          validImages.push({
            base64: img.base64,
            mimeType: img.mimeType || "image/jpeg",
          });
        }
      }
    }

    // Persistir sesión y mensaje del usuario
    const session = await getOrCreateSession(sessionId || undefined);
    await saveMessage({
      sessionId: session.id,
      role: "user",
      text: question.trim(),
      images: validImages.length > 0 ? validImages.map(() => "[imagen]") : undefined,
    });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Enviar sessionId al cliente
    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);

    const { stream, sources } = await chatWithClasses(question.trim(), {
      classId: classId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      history: history || [],
      images: validImages.length > 0 ? validImages : undefined,
    });

    // Enviar fuentes primero
    res.write(`event: sources\ndata: ${JSON.stringify({ sources })}\n\n`);

    // Stream de respuesta
    let fullResponse = "";
    for await (const text of stream) {
      fullResponse += text;
      res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
    }

    // Persistir respuesta del asistente
    await saveMessage({
      sessionId: session.id,
      role: "assistant",
      text: fullResponse,
      sources: sources.length > 0 ? sources : undefined,
    });

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[Chat RAG] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al procesar la pregunta" });
    } else {
      res.write(
        `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`,
      );
      res.end();
    }
  }
});

/**
 * GET /chat/stats
 * Obtener estadísticas de indexación RAG.
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getRAGStats();
    res.json(stats);
  } catch (err: any) {
    console.error("[Chat RAG] Error stats:", err);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * POST /chat/index/:classId
 * Indexar (o re-indexar) una clase específica.
 */
router.post("/index/:classId", async (req: Request, res: Response) => {
  try {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      res.status(400).json({ error: "classId inválido" });
      return;
    }

    const classLog = await prisma.classLog.findUnique({
      where: { id: classId },
      select: { transcript: true, summary: true },
    });

    if (!classLog) {
      res.status(404).json({ error: "Clase no encontrada" });
      return;
    }

    if (!classLog.transcript || classLog.transcript.trim().length === 0) {
      res.status(400).json({ error: "La clase no tiene transcripción" });
      return;
    }

    const result = await indexClassTranscript(
      classId,
      classLog.transcript,
      classLog.summary,
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Chat RAG] Error indexing:", err);
    res.status(500).json({ error: "Error al indexar la clase" });
  }
});

/**
 * POST /chat/index-all
 * Indexar todas las clases que no tienen embeddings.
 */
router.post("/index-all", async (_req: Request, res: Response) => {
  try {
    // Obtener clases sin chunks
    const allClasses = await prisma.classLog.findMany({
      select: { id: true, transcript: true, summary: true },
    });

    const indexedClassIds = (
      await prisma.classChunk.groupBy({ by: ["classId"] })
    ).map((g: { classId: number }) => g.classId);

    const unindexed = allClasses.filter(
      (c) =>
        !indexedClassIds.includes(c.id) &&
        c.transcript &&
        c.transcript.trim().length > 0,
    );

    let totalChunks = 0;
    const results: Array<{ classId: number; chunks: number }> = [];

    for (const cls of unindexed) {
      try {
        const result = await indexClassTranscript(
          cls.id,
          cls.transcript,
          cls.summary,
        );
        totalChunks += result.chunksCreated;
        results.push({ classId: cls.id, chunks: result.chunksCreated });
      } catch (err) {
        console.error(`[Chat RAG] Error indexando clase #${cls.id}:`, err);
        results.push({ classId: cls.id, chunks: 0 });
      }
    }

    res.json({
      success: true,
      classesIndexed: results.filter((r) => r.chunks > 0).length,
      totalChunks,
      details: results,
    });
  } catch (err: any) {
    console.error("[Chat RAG] Error index-all:", err);
    res.status(500).json({ error: "Error al indexar las clases" });
  }
});

// ─── Chat Sessions ───

/**
 * GET /chat/sessions
 * Listar sesiones de chat recientes
 */
router.get("/sessions", async (_req: Request, res: Response) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (err: any) {
    console.error("[Chat] Error sessions:", err);
    res.status(500).json({ error: "Error al obtener sesiones" });
  }
});

/**
 * GET /chat/sessions/:id/messages
 * Obtener mensajes de una sesión
 */
router.get("/sessions/:id/messages", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    const messages = await getSessionMessages(id);
    // Parse JSON fields
    const parsed = messages.map((m) => ({
      ...m,
      images: m.images ? JSON.parse(m.images) : undefined,
      sources: m.sources ? JSON.parse(m.sources) : undefined,
    }));
    res.json(parsed);
  } catch (err: any) {
    console.error("[Chat] Error messages:", err);
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
});

/**
 * DELETE /chat/sessions/:id
 * Eliminar una sesión
 */
router.delete("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "id inválido" });
      return;
    }
    await deleteSession(id);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Chat] Error deleting session:", err);
    res.status(500).json({ error: "Error al eliminar sesión" });
  }
});

export default router;
