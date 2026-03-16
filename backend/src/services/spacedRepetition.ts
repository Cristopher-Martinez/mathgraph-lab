import prisma from "../prismaClient";

/**
 * SM-2 Algorithm para repetición espaciada.
 * Calcula el siguiente intervalo de repaso basándose en la calidad de la respuesta.
 *
 * @param quality 0-5 donde: 0=blackout, 1=muy mal, 2=mal, 3=difícil, 4=bien, 5=perfecto
 * @param prevEase Factor de facilidad previo (default 2.5)
 * @param prevInterval Intervalo previo en días
 * @param prevRepetitions Repeticiones exitosas consecutivas
 */
export function sm2(
  quality: number,
  prevEase: number = 2.5,
  prevInterval: number = 0,
  prevRepetitions: number = 0,
): { ease: number; interval: number; repetitions: number } {
  const q = Math.min(5, Math.max(0, Math.round(quality)));

  let ease = prevEase;
  let interval: number;
  let repetitions: number;

  if (q >= 3) {
    // Respuesta aceptable
    repetitions = prevRepetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(prevInterval * ease);
    }
    // Actualizar ease factor
    ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  } else {
    // Respuesta incorrecta — resetear
    repetitions = 0;
    interval = 1;
  }

  // Ease mínimo 1.3
  ease = Math.max(1.3, ease);
  // Intervalo mínimo 1 día
  interval = Math.max(1, interval);

  return { ease, interval, repetitions };
}

/**
 * Convierte un score de ejercicio (0-100) a escala SM-2 (0-5)
 */
export function scoreToQuality(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

/**
 * Registra una revisión de ejercicio y calcula el próximo repaso
 */
export async function recordReview(
  exerciseId: number,
  score: number,
): Promise<{ nextReview: Date; interval: number; ease: number }> {
  const now = new Date();
  const quality = scoreToQuality(score);

  // Buscar review existente
  const existing = await prisma.exerciseReview.findUnique({
    where: { exerciseId },
  });

  const prev = existing || { ease: 2.5, interval: 0, repetitions: 0 };
  const result = sm2(quality, prev.ease, prev.interval, prev.repetitions);

  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + result.interval);

  await prisma.exerciseReview.upsert({
    where: { exerciseId },
    create: {
      exerciseId,
      ease: result.ease,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview,
      lastReview: now,
      lastScore: score,
    },
    update: {
      ease: result.ease,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview,
      lastReview: now,
      lastScore: score,
    },
  });

  return { nextReview, interval: result.interval, ease: result.ease };
}

/**
 * Obtiene ejercicios pendientes de repaso (vencidos o para hoy)
 */
export async function getDueReviews(limit: number = 20) {
  const now = new Date();

  const reviews = await prisma.exerciseReview.findMany({
    where: {
      nextReview: { lte: now },
    },
    include: {
      exercise: {
        include: {
          topic: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { nextReview: "asc" },
    take: limit,
  });

  return reviews;
}

/**
 * Obtiene estadísticas de repaso
 */
export async function getReviewStats() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [dueToday, dueThisWeek, totalReviewed, masteredCount] = await Promise.all([
    prisma.exerciseReview.count({
      where: { nextReview: { lte: tomorrow } },
    }),
    prisma.exerciseReview.count({
      where: { nextReview: { lte: nextWeek } },
    }),
    prisma.exerciseReview.count(),
    prisma.exerciseReview.count({
      where: { repetitions: { gte: 5 }, ease: { gte: 2.0 } },
    }),
  ]);

  return { dueToday, dueThisWeek, totalReviewed, mastered: masteredCount };
}
