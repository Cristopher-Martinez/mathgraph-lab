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

  // Socratic state
  const [socraticData, setSocraticData] = useState<any>(null);
  const [socraticStep, setSocraticStep] = useState(0);
  const [socraticFeedback, setSocraticFeedback] = useState<string | null>(null);
  const [socraticFeedbackStreaming, setSocraticFeedbackStreaming] =
    useState(false);
  const [socraticCompleted, setSocraticCompleted] = useState(false);
  const [socraticHintsUsed, setSocraticHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [loadingSocratic, setLoadingSocratic] = useState(!!initialSession?.config?.socratic);

  const current = session.current || 0;
  const exercises = session.exercises || [];
  const ex = exercises[current];
  const config = session.config || {};
  const totalExpected = session.totalExpected || exercises.length;
  const isSocratic = !!config.socratic;

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

  // Initialize socratic mode for current exercise
  useEffect(() => {
    if (!isSocratic || !ex?.id) return;
    setSocraticData(null);
    setSocraticStep(0);
    setSocraticFeedback(null);
    setSocraticFeedbackStreaming(false);
    setSocraticCompleted(false);
    setSocraticHintsUsed(0);
    setCurrentHint(null);
    setHintLevel(0);
    setLoadingSocratic(true);

    api
      .tutorStart(ex.id)
      .then((data) => {
        setSocraticData(data);
        setSocraticStep(0);
      })
      .catch(() => {
        // If socratic generation fails, fallback to normal mode for this exercise
        setSocraticData(null);
      })
      .finally(() => setLoadingSocratic(false));
  }, [current, isSocratic, ex?.id]);

  const handleSocraticSubmit = async () => {
    if (!ex || !socraticData || submitting) return;
    setSubmitting(true);
    setSocraticFeedback(null);
    setSocraticFeedbackStreaming(true);
    setCurrentHint(null);

    try {
      const response = await api.tutorAnswerStream(
        ex.id,
        socraticStep,
        answer.trim(),
      );

      if (!response.ok || !response.body) {
        // Fallback to non-streaming
        const result = await api.tutorAnswer(ex.id, socraticStep, answer.trim());
        setSocraticFeedbackStreaming(false);
        setSocraticFeedback(result.feedback);
        if (result.correct) {
          if (result.completed) {
            setSocraticCompleted(true);
          } else if (result.nextStep !== undefined) {
            setSocraticStep(result.nextStep);
            if (result.tutorQuestion) {
              setSocraticData((prev: any) => ({
                ...prev,
                tutorQuestion: result.tutorQuestion,
              }));
            }
            setAnswer("");
            setHintLevel(0);
            setCurrentHint(null);
          }
        }
        setSubmitting(false);
        return;
      }

      // SSE streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullFeedback = "";
      let resultData: any = null;

      const processStream = async () => {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: result")) {
              continue;
            }
            if (line.startsWith("data: ") && !resultData) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.correct !== undefined) {
                  resultData = parsed;
                  continue;
                }
              } catch {
                // Not a result event, it's feedback text
              }
            }
            if (line.startsWith("event: feedback")) {
              continue;
            }
            if (line.startsWith("data: ")) {
              const raw = line.slice(6);
              if (raw !== "[DONE]" && raw !== "{}") {
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed.text) {
                    fullFeedback += parsed.text;
                  } else {
                    fullFeedback += raw;
                  }
                } catch {
                  fullFeedback += raw;
                }
                setSocraticFeedback(fullFeedback);
              }
            }
          }
        }
      };

      await processStream();
      setSocraticFeedbackStreaming(false);

      if (resultData) {
        if (resultData.correct || resultData.partial) {
          if (resultData.completed) {
            setSocraticCompleted(true);
          } else if (resultData.nextStep !== undefined) {
            // Delay step advance so user can read feedback
            setTimeout(() => {
              setSocraticStep(resultData.nextStep);
              if (resultData.tutorQuestion) {
                setSocraticData((prev: any) => ({
                  ...prev,
                  tutorQuestion: resultData.tutorQuestion,
                }));
              }
              setAnswer("");
              setSocraticFeedback(null);
              setHintLevel(0);
              setCurrentHint(null);
            }, 2000);
          }
        }
        // If incorrect, student retries same step (stays on current step)
      }
    } catch {
      setSocraticFeedbackStreaming(false);
      setSocraticFeedback("Error al procesar la respuesta. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocraticHint = async () => {
    if (!ex || !socraticData) return;
    const nextLevel = hintLevel;
    try {
      const result = await api.tutorHint(ex.id, socraticStep, nextLevel);
      setCurrentHint(result.hint);
      setHintLevel(nextLevel + 1);
      setSocraticHintsUsed((h) => h + 1);
    } catch {
      setCurrentHint("No se pudo obtener la pista.");
    }
  };

  const handleSocraticExerciseComplete = async (completed: boolean) => {
    // Record the exercise result in the training session
    const timeMs = Date.now() - exerciseStartRef.current;
    try {
      const result = await api.answerTraining({
        sessionId: session.sessionId,
        correct: completed,
        timeout: false,
        timeMs,
        hintsUsed: socraticHintsUsed,
      });

      setSession((prev: any) => ({
        ...prev,
        current: result.current,
        exercisesCompleted: result.exercisesCompleted,
        currentDifficulty: result.currentDifficulty,
        metrics: result.metrics,
      }));

      if (result.finished) {
        setTimeout(
          () => onFinish({ ...session, metrics: result.metrics }),
          1500,
        );
      }
    } catch {
      // Advance locally if backend fails
    }

    // Reset socratic state for next exercise
    setAnswer("");
    setFeedback(null);
    setSocraticCompleted(false);
    setSocraticFeedback(null);
    setCurrentHint(null);
    setHintLevel(0);
    setSocraticHintsUsed(0);
  };

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
          {isSocratic && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
              Socrático
            </span>
          )}
        </div>
        <div className="text-lg font-medium mb-4 dark:text-gray-200">
          <MarkdownLatex
            content={ex.latex || ex.question || ex.pregunta || ""}
          />
        </div>

        {/* Socratic Flow */}
        {isSocratic ? (
          <div className="space-y-4">
            {loadingSocratic && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
                Preparando guía socrática...
              </div>
            )}

            {socraticData && !socraticCompleted && (
              <>
                {/* Step indicator */}
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {Array.from({
                      length: socraticData.totalSteps || socraticData.socratic?.length || 3,
                    }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-6 h-1.5 rounded-full ${
                          i < socraticStep
                            ? "bg-green-500"
                            : i === socraticStep
                              ? "bg-indigo-500"
                              : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Paso {socraticStep + 1}/
                    {socraticData.totalSteps || socraticData.socratic?.length || "?"}
                  </span>
                </div>

                {/* Tutor question */}
                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                    Pregunta del tutor:
                  </p>
                  <div className="dark:text-gray-200">
                    <MarkdownLatex
                      content={
                        socraticData.tutorQuestion ||
                        socraticData.socratic?.[socraticStep]?.question ||
                        ""
                      }
                    />
                  </div>
                </div>

                {/* Hint */}
                {currentHint && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      <span className="font-medium">Pista:</span>{" "}
                      <MarkdownLatex content={currentHint} />
                    </p>
                  </div>
                )}

                {/* Answer input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !submitting &&
                      !socraticFeedbackStreaming &&
                      handleSocraticSubmit()
                    }
                    placeholder="Tu respuesta al paso..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    disabled={submitting || socraticFeedbackStreaming}
                  />
                  <button
                    onClick={handleSocraticSubmit}
                    disabled={submitting || socraticFeedbackStreaming || !answer.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    {submitting ? "..." : "Enviar"}
                  </button>
                  <button
                    onClick={handleSocraticHint}
                    disabled={submitting || socraticFeedbackStreaming}
                    className="px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 text-sm font-medium"
                    title="Pedir pista">
                    💡
                  </button>
                </div>

                {/* Socratic feedback */}
                {socraticFeedback && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <p className="text-sm dark:text-gray-300">
                      <MarkdownLatex content={socraticFeedback} />
                      {socraticFeedbackStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5" />
                      )}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Socratic completed */}
            {socraticCompleted && (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    ✓ ¡Ejercicio completado paso a paso!
                  </p>
                  {socraticHintsUsed > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      Pistas utilizadas: {socraticHintsUsed}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleSocraticExerciseComplete(true)}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                  Siguiente ejercicio →
                </button>
              </div>
            )}

            {/* Fallback: no socratic data, show normal input */}
            {!socraticData && !loadingSocratic && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se pudo generar guía socrática. Responde directamente:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !feedback &&
                      !submitting &&
                      handleSubmit()
                    }
                    placeholder="Tu respuesta..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    disabled={!!feedback || submitting}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {submitting ? "..." : "Enviar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Normal (non-socratic) answer input */
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
        )}
      </div>

      {/* Feedback (non-socratic mode) */}
      {!isSocratic && feedback && (
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
