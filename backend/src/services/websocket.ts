import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { getAllGenerationStatuses } from "./redisClient";

let io: SocketServer | null = null;

export function initWebSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.on("connection", async (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    try {
      const active = await getAllGenerationStatuses();
      if (active.length > 0) {
        socket.emit("generation:active", active);
      }
    } catch (err) {
      console.error("[WS] Error sending active generations:", err);
    }

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  console.log("[WS] WebSocket server initialized");
  return io;
}

export function getIO(): SocketServer | null {
  return io;
}

export function broadcastGenerationUpdate(status: any): void {
  if (io) {
    io.emit("generation:update", status);
  }
}

export function broadcastAnalysisProgress(
  classId: number,
  phase: "vectorizing" | "preview" | "truth" | "complete",
): void {
  const messages: Record<string, string> = {
    vectorizing: "Indexando transcripción...",
    preview: "Generando resumen preliminar...",
    truth: "Análisis completo en progreso...",
    complete: "Análisis completado",
  };

  if (io) {
    io.emit("analysis-progress", {
      type: "analysis-progress",
      classId,
      phase,
      message: messages[phase],
    });
  }
}
