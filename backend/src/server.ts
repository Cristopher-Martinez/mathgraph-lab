import cors from "cors";
import "dotenv/config";
import express from "express";
import path from "path";
import aiRouter from "./routes/ai";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import classlogRouter from "./routes/classlog";
import exercisesRouter from "./routes/exercises";
import formulasRouter from "./routes/formulas";
import progressRouter from "./routes/progress";
import topicsRouter from "./routes/topics";
import trainingRouter from "./routes/training";
import tutorRouter from "./routes/tutor";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Routes (direct and /api prefixed for production)
app.use("/auth", authRouter);
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

// /api prefix routes (for production without Vite proxy)
app.use("/api/auth", authRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/exercises", exercisesRouter);
app.use("/api/exercise", exercisesRouter);
app.use("/api/formulas", formulasRouter);
app.use("/api/ai", aiRouter);
app.use("/api/progress", progressRouter);
app.use("/api/training", trainingRouter);
app.use("/api/tutor", tutorRouter);
app.use("/api/class-log", classlogRouter);

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

app.listen(PORT, () => {
  console.log(`MathGraph Lab API running on http://localhost:${PORT}`);
});

export default app;
