import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import RedisStore from "rate-limit-redis";
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
import { getRedis } from "./services/redisClient";
import { initWebSocket } from "./services/websocket";
import "./services/jobQueue"; // Start BullMQ worker
import { authMiddleware } from "./middleware/auth";

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

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve frontend static files in production (AFTER API routes)
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../frontend/dist");

  // Serve static assets (but not catch-all yet)
  app.use(express.static(frontendPath));

  // SPA catch-all route - MUST be last
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`MathGraph Lab API running on http://localhost:${PORT}`);
});

export default app;
