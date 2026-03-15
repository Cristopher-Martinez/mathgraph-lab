import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import MarkdownLatex from "./MarkdownLatex";

interface Props {
  session: any;
  onFinish: (session: any) => void;
}

export default function TrainingSession({
  session: initialSession,
  onFinish,
}: Props) {
  const [session, setSession] = useState<any>(initialSession);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<any>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exerciseTimeLeft, setExerciseTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exerciseStartRef = useRef<number>(Date.now());

  const current = session.current || 0;
  const exercises = session.exercises || [];
  const ex = exercises[current];
  const config = session.config || {};
  const totalExpected = session.totalExpected || exercises.length;

  // Init per-exercise timer
  useEffect(() => {
    if (config.timed && config.timePerExercise) {
      setExerciseTimeLeft(config.timePerExercise);
    }
    exerciseStartRef.current = Date.now();
  }, [current]);

  // Countdown
  useEffect(() => {
    if (exerciseTimeLeft === null || exerciseTimeLeft <= 0 || feedback) return;
    timerRef.current = setInterval(() => {
      setExerciseTimeLeft((t) => {
        if (t === null) return null;
        if (t <= 1) return 0;
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [exerciseTimeLeft, feedback]);

  // Auto-submit on timeout
  useEffect(() => {
    if (exerciseTimeLeft === 0 && !feedback) {
      handleTimeout();
    }
  }, [exerciseTimeLeft]);

  // Prefetch next batch when 2 exercises remaining
  useEffect(() => {
    const remaining = exercises.length - current;
    const completed = session.exercisesCompleted || 0;
    if (
      remaining <= 2 &&
      !loadingBatch &&
      completed < totalExpected &&
      !feedback
    ) {
      setLoadingBatch(true);
      api
        .nextTrainingBatch(session.sessionId)
        .then((data: any) => {
          if (data.pending) {
            setTimeout(() => setLoadingBatch(false), 2000);
            return;
          }
          if (data.exercises?.length > 0) {
            setSession((prev: any) => ({
              ...prev,
              exercises: [...prev.exercises, ...data.exercises],
            }));
          }
          setLoadingBatch(false);
        })
        .catch(() => setLoadingBatch(false));
    }
  }, [current, feedback]);

  const handleTimeout = async () => {
    const timeMs = (config.timePerExercise || 0) * 1000;
    try {
      const result = await api.answerTraining({
        sessionId: session.sessionId,
        correct: false,
        timeout: true,
        timeMs,
      });
      setSession((prev: any) => ({
        ...prev,
        current: result.current,
        exercisesCompleted: result.exercisesCompleted,
        currentDifficulty: result.currentDifficulty,
        metrics: result.metrics,
      }));
      setFeedback({
        correct: false,
        expected: ex?.steps,
        timeout: true,
      });

      if (result.finished) {
        setTimeout(
          () => onFinish({ ...session, metrics: result.metrics }),
          1500,
        );
      }
    } catch {
      setFeedback({ correct: false, expected: ex?.steps, timeout: true });
    }
  };

  const handleSubmit = async () => {
    if (!ex || submitting || feedback) return;
    setSubmitting(true);

    const timeMs = Date.now() - exerciseStartRef.current;

    try {
      // Validate answer
      const validation = await api.validateAnswer({
        userAnswer: answer.trim(),
        expectedAnswer: (ex.steps || "").trim(),
        exercisePrompt: ex.latex || ex.prompt || "",
      });

      // Record in backend
      const result = await api.answerTraining({
        sessionId: session.sessionId,
        correct: validation.correct,
        timeout: false,
        timeMs,
      });

      setSession((prev: any) => ({
        ...prev,
        current: result.current,
        exercisesCompleted: result.exercisesCompleted,
        currentDifficulty: result.currentDifficulty,
        metrics: result.metrics,
      }));

      setFeedback({
        correct: validation.correct,
        expected: ex.steps,
        aiFeedback: validation.feedback,
      });

      if (result.finished) {
        setTimeout(
          () => onFinish({ ...session, metrics: result.metrics }),
          2000,
        );
      }
    } catch {
      // Fallback offline validation
      const userAnswer = answer.trim().toLowerCase();
      const expected = (ex.steps || "").trim().toLowerCase();
      const correct =
        userAnswer === expected ||
        userAnswer.replace(/\s/g, "") === expected.replace(/\s/g, "");
      setFeedback({ correct, expected: ex.steps });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    setAnswer("");
    setFeedback(null);
    // current was already advanced by the /answer endpoint
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const completed = session.exercisesCompleted || 0;
  const progressPct = Math.min(100, (completed / totalExpected) * 100);

  if (!ex) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          {loadingBatch ? "Generando ejercicios..." : "Cargando..."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold dark:text-gray-100">
            Entrenamiento
          </h1>
          <div className="flex gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              {config.difficultyMode === "easy"
                ? "Fácil"
                : config.difficultyMode === "mixed"
                  ? "Mixto"
                  : "Progresivo"}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                session.currentDifficulty === "facil"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : session.currentDifficulty === "medio"
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
              }`}>
              {session.currentDifficulty === "facil"
                ? "★ Fácil"
                : session.currentDifficulty === "medio"
                  ? "★★ Medio"
                  : "★★★ Difícil"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {config.timed && exerciseTimeLeft !== null && (
            <span
              className={`font-mono text-lg font-bold ${
                exerciseTimeLeft < 15
                  ? "text-red-600 dark:text-red-400 animate-pulse"
                  : "text-gray-700 dark:text-gray-300"
              }`}>
              {formatTime(exerciseTimeLeft)}
            </span>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {completed + 1}/{totalExpected}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Timer bar (if timed) */}
      {config.timed && config.timePerExercise && exerciseTimeLeft !== null && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-1000 ${
              exerciseTimeLeft < 15 ? "bg-red-500" : "bg-emerald-500"
            }`}
            style={{
              width: `${(exerciseTimeLeft / config.timePerExercise) * 100}%`,
            }}
          />
        </div>
      )}

      {/* Exercise card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 mb-3">
          <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded">
            {ex.topic?.name || "General"}
          </span>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
            {ex.difficulty === "facil"
              ? "★"
              : ex.difficulty === "medio"
                ? "★★"
                : "★★★"}
          </span>
        </div>
        <div className="text-lg font-medium mb-4 dark:text-gray-200">
          <MarkdownLatex
            content={ex.latex || ex.question || ex.pregunta || ""}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !feedback && !submitting && handleSubmit()
            }
            placeholder="Tu respuesta..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={!!feedback || submitting}
          />
          {!feedback ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "..." : "Enviar"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors">
              Siguiente →
            </button>
          )}
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-lg border ${
            feedback.correct
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
          }`}>
          <span className="font-semibold dark:text-gray-200">
            {feedback.timeout
              ? "⏱ ¡Tiempo agotado!"
              : feedback.correct
                ? "✓ ¡Correcto!"
                : "✗ Incorrecto"}
          </span>
          {feedback.aiFeedback && (
            <span className="ml-2 text-sm dark:text-gray-300">
              {feedback.aiFeedback}
            </span>
          )}
          {!feedback.correct && feedback.expected && (
            <div className="mt-1 text-sm dark:text-gray-400">
              Solución:{" "}
              <span className="font-mono">
                <MarkdownLatex content={feedback.expected} />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
