import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import MarkdownLatex from "./MarkdownLatex";
import MathAnswerInput from "./MathAnswerInput";

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

  // Socratic state — chat-based like SocraticTutor
  const [socraticData, setSocraticData] = useState<any>(null);
  const [socraticSteps, setSocraticSteps] = useState<any[]>([]);
  const [socraticStep, setSocraticStep] = useState(0);
  const [socraticCompleted, setSocraticCompleted] = useState(false);
  const [socraticHintsUsed, setSocraticHintsUsed] = useState(0);
  const [socraticPartials, setSocraticPartials] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [previousHints, setPreviousHints] = useState<string[]>([]);
  const [studentAttempts, setStudentAttempts] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<"answer" | "question">("answer");
  const [loadingSocratic, setLoadingSocratic] = useState(!!initialSession?.config?.socratic);
  const [streaming, setStreaming] = useState(false);
  const [socraticScore, setSocraticScore] = useState(0);
  const [socraticTotalScore, setSocraticTotalScore] = useState(0);
  const [messages, setMessages] = useState<
    Array<{
      role: "tutor" | "student";
      text: string;
      type?: "correct" | "incorrect" | "partial" | "hint" | "info";
    }>
  >([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Calculate score for current exercise
  const calculateExerciseScore = () => {
    let score = 100;
    const hintPenalty = socraticHintsUsed <= 3 ? socraticHintsUsed * 10 : 30 + (socraticHintsUsed - 3) * 5;
    score -= hintPenalty;
    score -= socraticPartials * 15;
    return Math.max(score, 0);
  };

  // Initialize socratic mode for current exercise
  useEffect(() => {
    if (!isSocratic || !ex?.id) return;
    setSocraticData(null);
    setSocraticSteps([]);
    setSocraticStep(0);
    setSocraticCompleted(false);
    setSocraticHintsUsed(0);
    setSocraticPartials(0);
    setHintLevel(0);
    setPreviousHints([]);
    setStudentAttempts([]);
    setInputMode("answer");
    setStreaming(false);
    setLoadingSocratic(true);
    setMessages([{
      role: "tutor",
      text: `Vamos a resolver paso a paso: **${ex.latex || ex.pregunta || ""}**`,
      type: "info",
    }]);

    api
      .tutorStart(ex.id)
      .then((data) => {
        setSocraticData(data);
        const steps = data.socratic || [];
        setSocraticSteps(steps);
        setSocraticStep(0);
        const firstQuestion = data.tutorQuestion || steps[0]?.question || "";
        setMessages(prev => [...prev, { role: "tutor", text: firstQuestion }]);
      })
      .catch(() => {
        setSocraticData(null);
      })
      .finally(() => setLoadingSocratic(false));
  }, [current, isSocratic, ex?.id]);

  const handleSocraticAskQuestion = async () => {
    if (!answer.trim() || submitting || !ex) return;
    setSubmitting(true);
    const question = answer.trim();
    setMessages(prev => [...prev, { role: "student", text: `❓ ${question}` }]);
    setAnswer("");

    try {
      const result = await api.tutorAsk(ex.id, socraticStep, question);
      setMessages(prev => [...prev, {
        role: "tutor",
        text: result.answer,
        type: result.isActuallyAnswer ? "hint" : "info",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "tutor",
        text: "Hubo un error al procesar tu pregunta. Intenta reformularla.",
        type: "incorrect",
      }]);
    }
    setSubmitting(false);
  };

  const handleSocraticSubmit = async () => {
    if (!ex || !socraticData || submitting) return;
    if (inputMode === "question") {
      await handleSocraticAskQuestion();
      return;
    }

    setSubmitting(true);
    const studentAnswer = answer.trim();
    setMessages(prev => [...prev, { role: "student", text: studentAnswer }]);
    setAnswer("");
    setHintLevel(0);

    try {
      const response = await api.tutorAnswerStream(ex.id, socraticStep, studentAnswer);

      if (!response.ok || !response.body) {
        // Fallback to non-streaming
        const result = await api.tutorAnswer(ex.id, socraticStep, studentAnswer);
        const msgType = result.correct ? "correct" : result.partial ? "partial" : "incorrect";
        setMessages(prev => [...prev, { role: "tutor", text: result.feedback, type: msgType }]);

        if (result.partial) setSocraticPartials(p => p + 1);

        if (result.correct || result.partial) {
          if (result.completed) {
            setSocraticCompleted(true);
            setSocraticScore(calculateExerciseScore());
            setMessages(prev => [...prev, { role: "tutor", text: "🎉 ¡Excelente! Has completado todos los pasos.", type: "info" }]);
          } else if (result.nextStep !== undefined) {
            setSocraticStep(result.nextStep);
            setPreviousHints([]);
            setStudentAttempts([]);
            if (result.tutorQuestion) {
              setMessages(prev => [...prev, { role: "tutor", text: result.tutorQuestion }]);
            }
          }
        } else {
          setStudentAttempts(prev => [...prev, studentAnswer]);
        }
        setSubmitting(false);
        return;
      }

      // SSE streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let resultData: any = null;
      let feedbackText = "";
      let buffer = "";
      let lastEventType = "";

      setStreaming(true);
      setMessages(prev => [...prev, { role: "tutor", text: "", type: "info" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            lastEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (lastEventType === "result") {
                resultData = parsed;
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    type: resultData.correct ? "correct" : resultData.partial ? "partial" : "incorrect",
                  };
                  return updated;
                });
              } else if (lastEventType === "chunk" && parsed.text !== undefined) {
                feedbackText += parsed.text;
                const currentText = feedbackText;
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = { ...updated[lastIdx], text: currentText };
                  return updated;
                });
              }
            } catch { /* skip malformed */ }
          }
        }
      }

      setStreaming(false);

      if (resultData) {
        if (resultData.partial) setSocraticPartials(p => p + 1);

        if (resultData.correct || resultData.partial) {
          if (resultData.completed) {
            setSocraticCompleted(true);
            setSocraticScore(calculateExerciseScore());
            setMessages(prev => [...prev, { role: "tutor", text: "🎉 ¡Excelente! Has completado todos los pasos.", type: "info" }]);
          } else if (resultData.nextStep !== undefined) {
            setSocraticStep(resultData.nextStep);
            setPreviousHints([]);
            setStudentAttempts([]);
            if (resultData.tutorQuestion) {
              setMessages(prev => [...prev, { role: "tutor", text: resultData.tutorQuestion }]);
            }
          }
        } else {
          setStudentAttempts(prev => [...prev, studentAnswer]);
        }
      }
    } catch {
      setStreaming(false);
      setMessages(prev => [...prev, {
        role: "tutor",
        text: "Error al procesar la respuesta. Intenta de nuevo.",
        type: "incorrect",
      }]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocraticHint = async () => {
    if (!ex || !socraticData || submitting) return;
    setSubmitting(true);
    const newLevel = hintLevel + 1;
    setHintLevel(newLevel);

    try {
      const result = await api.tutorHint(ex.id, socraticStep, newLevel, previousHints, studentAttempts);
      setPreviousHints(prev => [...prev, result.hint]);
      setMessages(prev => [...prev, {
        role: "tutor",
        text: `💡 Pista ${newLevel}: ${result.hint}`,
        type: "hint",
      }]);
      setSocraticHintsUsed(h => h + 1);
    } catch {
      // Fallback: local hints
      const step = socraticSteps[socraticStep];
      const hints = step?.hints || [];
      const idx = Math.min(newLevel - 1, hints.length - 1);
      const hint = hints.length > 0
        ? hints[idx]
        : newLevel <= 2
          ? "Piensa en las propiedades matemáticas que se aplican."
          : `Pista directa: la respuesta es "${step?.expected || ""}".`;
      setPreviousHints(prev => [...prev, hint]);
      setMessages(prev => [...prev, {
        role: "tutor",
        text: `💡 Pista ${newLevel}: ${hint}`,
        type: "hint",
      }]);
      setSocraticHintsUsed(h => h + 1);
    }
    setSubmitting(false);
  };

  const handleSocraticExerciseComplete = async (completed: boolean) => {
    const timeMs = Date.now() - exerciseStartRef.current;
    const exerciseScore = calculateExerciseScore();
    setSocraticTotalScore(prev => prev + exerciseScore);

    try {
      const result = await api.answerTraining({
        sessionId: session.sessionId,
        correct: completed,
        timeout: false,
        timeMs,
        hintsUsed: socraticHintsUsed,
        score: exerciseScore,
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
          () => onFinish({ ...session, metrics: result.metrics, socraticTotalScore: socraticTotalScore + exerciseScore }),
          1500,
        );
      }
    } catch {
      // Advance locally if backend fails
    }

    // Reset for next exercise
    setAnswer("");
    setFeedback(null);
    setSocraticCompleted(false);
    setMessages([]);
    setSocraticHintsUsed(0);
    setSocraticPartials(0);
    setHintLevel(0);
    setPreviousHints([]);
    setStudentAttempts([]);
    setInputMode("answer");
    setSocraticScore(0);
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
          {isSocratic && (
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              ⭐ {socraticTotalScore} pts
            </span>
          )}
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
              🧠 Socrático
            </span>
          )}
        </div>
        <div className="text-lg font-medium mb-4 dark:text-gray-200">
          <MarkdownLatex
            content={ex.latex || ex.question || ex.pregunta || ""}
          />
        </div>

        {/* Socratic Flow — Chat-based */}
        {isSocratic ? (
          <div className="space-y-4">
            {loadingSocratic && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full" />
                Preparando guía socrática...
              </div>
            )}

            {socraticData && !socraticCompleted && (
              <>
                {/* Step indicator + Score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {Array.from({ length: socraticSteps.length || socraticData.totalSteps || 3 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-6 h-1.5 rounded-full ${
                            i < socraticStep
                              ? "bg-green-500"
                              : i === socraticStep
                                ? "bg-purple-500"
                                : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Paso {socraticStep + 1}/{socraticSteps.length || socraticData.totalSteps || "?"}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                    ⭐ {calculateExerciseScore()} pts
                  </span>
                </div>

                {/* Chat conversation */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                        msg.role === "student"
                          ? "bg-purple-600 text-white"
                          : msg.type === "correct"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                            : msg.type === "partial"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800"
                              : msg.type === "incorrect"
                                ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
                                : msg.type === "hint"
                                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                                  : msg.type === "info"
                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800"
                                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                      }`}>
                        <div className="font-medium text-xs mb-1 opacity-70">
                          {msg.role === "student" ? "Tú" : "🎓 Tutor"}
                        </div>
                        {msg.text ? (
                          <MarkdownLatex content={msg.text} />
                        ) : (
                          <span className="inline-flex items-center gap-1 py-1">
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Toggle Answer/Question */}
                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
                  <button
                    onClick={() => setInputMode("answer")}
                    disabled={submitting || streaming}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                      inputMode === "answer"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}>
                    ✏️ Respuesta
                  </button>
                  <button
                    onClick={() => setInputMode("question")}
                    disabled={submitting || streaming}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                      inputMode === "question"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}>
                    ❓ Pregunta
                  </button>
                </div>

                {/* Input + buttons */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !submitting && !streaming && handleSocraticSubmit()}
                    placeholder={inputMode === "answer" ? "Escribe tu respuesta..." : "Haz una pregunta al tutor"}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    disabled={submitting || streaming}
                  />
                  <button
                    onClick={handleSocraticSubmit}
                    disabled={submitting || streaming || !answer.trim()}
                    className={`w-full sm:w-auto px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors ${
                      inputMode === "answer" ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}>
                    {submitting ? "..." : inputMode === "answer" ? "Enviar" : "Preguntar"}
                  </button>
                </div>

                {/* Hint button + penalty info */}
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={handleSocraticHint}
                    disabled={submitting || streaming}
                    className="px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/70 text-sm font-medium transition-colors disabled:opacity-50">
                    💡 Pista {socraticHintsUsed > 0 ? `(${socraticHintsUsed})` : ""}
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Pistas: -10pts c/u • Parciales: -15pts
                  </span>
                </div>
              </>
            )}

            {/* Socratic completed — show score */}
            {socraticCompleted && (
              <div className="space-y-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800 text-center space-y-2">
                  <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                    {socraticScore} pts
                  </div>
                  <div className="text-sm text-emerald-700 dark:text-emerald-300">
                    Pistas: {socraticHintsUsed} • Parciales: {socraticPartials}
                  </div>
                  {socraticTotalScore > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Puntaje acumulado: {socraticTotalScore + socraticScore} pts
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleSocraticExerciseComplete(true)}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                  Siguiente ejercicio →
                </button>
              </div>
            )}

            {/* Fallback: no socratic data */}
            {!socraticData && !loadingSocratic && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se pudo generar guía socrática. Responde directamente:
                </p>
                <div className="flex gap-2">
                  <MathAnswerInput
                    value={answer}
                    onChange={setAnswer}
                    onSubmit={handleSubmit}
                    disabled={!!feedback || submitting}
                    expectedAnswer={ex?.steps}
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
            <MathAnswerInput
              value={answer}
              onChange={setAnswer}
              onSubmit={handleSubmit}
              disabled={!!feedback || submitting}
              expectedAnswer={ex?.steps}
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
