import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import RedisStore from "rate-limit-redis";
import { authMiddleware } from "./middleware/auth";
import aiRouter from "./routes/ai";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import classlogRouter from "./routes/classlog";
import exercisesRouter from "./routes/exercises";
import formulasRouter from "./routes/formulas";
import notesRouter from "./routes/notes";
import progressRouter from "./routes/progress";
import topicsRouter from "./routes/topics";
import trainingRouter from "./routes/training";
import tutorRouter from "./routes/tutor";
import "./services/jobQueue"; // Start BullMQ worker
import { getRedis } from "./services/redisClient";
import { initWebSocket } from "./services/websocket";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize WebSocket
initWebSocket(server);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Global rate limiter: 100 req/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
  }),
});
app.use(globalLimiter);

// Auth rate limiter: 5 attempts/min (anti-brute-force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Demasiados intentos. Espera un momento." },
  store: new RedisStore({
    sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
    prefix: "rl:auth:",
  }),
});

// Routes (direct and /api prefixed for production)
app.use("/auth", authLimiter, authRouter);
app.use("/api/auth", authLimiter, authRouter);

// Health check (public)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve frontend static files in production (BEFORE auth — login page must load)
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendPath));
}

// Protected routes — require valid session
app.use(authMiddleware as any);
app.use("/topics", topicsRouter);
app.use("/exercises", exercisesRouter);
app.use("/exercise", exercisesRouter);
app.use("/formulas", formulasRouter);
app.use("/ai", aiRouter);
app.use("/progress", progressRouter);
app.use("/training", trainingRouter);
app.use("/tutor", tutorRouter);
app.use("/chat", chatRouter);
app.use("/class-log", classlogRouter);
app.use("/notes", notesRouter);

// /api prefix routes (for production without Vite proxy)
app.use("/api/topics", topicsRouter);
app.use("/api/exercises", exercisesRouter);
app.use("/api/exercise", exercisesRouter);
app.use("/api/formulas", formulasRouter);
app.use("/api/ai", aiRouter);
app.use("/api/progress", progressRouter);
app.use("/api/training", trainingRouter);
app.use("/api/tutor", tutorRouter);
app.use("/api/class-log", classlogRouter);
app.use("/api/notes", notesRouter);

// SPA catch-all route - MUST be last (after API routes, serves index.html for client routing)
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../frontend/dist");
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

server.listen(PORT, async () => {
  console.log(`\x1b[32m✓ API running on http://localhost:${PORT}\x1b[0m`);

  // Startup health check
  try {
    const redis = getRedis();
    await redis.ping();
    console.log("\x1b[32m✓ Redis connected\x1b[0m");
  } catch {
    console.warn("\x1b[33m⚠ Redis not reachable — some features may be limited\x1b[0m");
  }

  try {
    const { default: prisma } = await import("./prismaClient");
    await prisma.$queryRaw`SELECT 1`;
    console.log("\x1b[32m✓ PostgreSQL connected\x1b[0m");
  } catch {
    console.warn("\x1b[33m⚠ PostgreSQL not reachable — check DATABASE_URL\x1b[0m");
  }
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`\n\x1b[36m[${signal}] Shutting down gracefully...\x1b[0m`);
  server.close(async () => {
    try {
      const { default: prisma } = await import("./prismaClient");
      await prisma.$disconnect();
    } catch {}
    try {
      const redis = getRedis();
      redis.disconnect();
    } catch {}
    console.log("\x1b[32m✓ Cleanup complete\x1b[0m");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default app;
