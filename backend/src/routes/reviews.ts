import { Request, Response, Router } from "express";
import {
  getDueReviews,
  getReviewStats,
  recordReview,
} from "../services/spacedRepetition";

const router = Router();

/**
 * GET /reviews/due
 * Ejercicios pendientes de repaso
 */
router.get("/due", async (_req: Request, res: Response) => {
  try {
    const reviews = await getDueReviews(20);
    const exercises = reviews.map((r) => ({
      reviewId: r.id,
      exerciseId: r.exerciseId,
      exercise: r.exercise,
      ease: r.ease,
      interval: r.interval,
      repetitions: r.repetitions,
      lastScore: r.lastScore,
      nextReview: r.nextReview,
    }));
    res.json(exercises);
  } catch (err: any) {
    console.error("[Reviews] Error:", err);
    res.status(500).json({ error: "Error al obtener repasos pendientes" });
  }
});

/**
 * GET /reviews/stats
 * Estadísticas de repaso
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getReviewStats();
    res.json(stats);
  } catch (err: any) {
    console.error("[Reviews] Error stats:", err);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * POST /reviews/record
 * Registrar resultado de un repaso
 * Body: { exerciseId: number, score: number }
 */
router.post("/record", async (req: Request, res: Response) => {
  try {
    const { exerciseId, score } = req.body;

    if (!exerciseId || typeof exerciseId !== "number") {
      res.status(400).json({ error: "exerciseId es requerido" });
      return;
    }
    if (score == null || typeof score !== "number" || score < 0 || score > 100) {
      res.status(400).json({ error: "score debe ser un número entre 0 y 100" });
      return;
    }

    const result = await recordReview(exerciseId, score);
    res.json({
      success: true,
      nextReview: result.nextReview,
      interval: result.interval,
      ease: result.ease,
    });
  } catch (err: any) {
    console.error("[Reviews] Error recording:", err);
    res.status(500).json({ error: "Error al registrar repaso" });
  }
});

export default router;
