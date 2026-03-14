import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

interface SocraticStep {
  question: string;
  expected: string;
  hints?: string[];
}

interface SocraticTutorProps {
  exercise: {
    id: number;
    latex: string;
    difficulty: string;
    socratic?: SocraticStep[];
  };
  onComplete: (summary: {
    stepsSolved: number;
    hintsUsed: number;
    stepsRevealed: number;
    score: number;
  }) => void;
  onBack: () => void;
}

export default function SocraticTutor({
  exercise,
  onComplete,
  onBack,
}: SocraticTutorProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [messages, setMessages] = useState<
    Array<{
      role: "tutor" | "student";
      text: string;
      type?: "correct" | "incorrect" | "partial" | "hint" | "info";
    }>
  >([
    {
      role: "tutor",
      text: `Vamos a resolver paso a paso: **${exercise.latex}**`,
      type: "info",
    },
  ]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [stepsRevealed, setStepsRevealed] = useState(0);
  const [partialAnswers, setPartialAnswers] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [previousHints, setPreviousHints] = useState<string[]>([]);
  const [studentAttempts, setStudentAttempts] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<"answer" | "question">("answer");
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");
  const [started, setStarted] = useState(false);
  const [socraticSteps, setSocraticSteps] = useState<SocraticStep[]>(
    exercise.socratic || [],
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  const totalSteps = socraticSteps.length;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const calculateScore = () => {
    let score = 100;
    // Primeras 3 pistas: -10 cada una, después -5 cada una
    const hintPenalty =
      hintsUsed <= 3 ? hintsUsed * 10 : 30 + (hintsUsed - 3) * 5;
    score -= hintPenalty;
    score -= stepsRevealed * 40;
    score -= partialAnswers * 15; // Respuestas parciales restan menos que revelar (-40)
    return Math.max(score, 0);
  };

  const startSession = async () => {
    setLoading(true);
    try {
      const result = await api.tutorStart(exercise.id);
      // Si el backend devuelve los pasos generados, actualizar estado
      if (result.socratic && Array.isArray(result.socratic)) {
        setSocraticSteps(result.socratic);
      }
      setTutorQuestion(result.tutorQuestion);
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: result.tutorQuestion },
      ]);
      setStarted(true);
    } catch {
      // Fallback: usar datos locales si existen
      if (socraticSteps.length > 0) {
        const firstStep = socraticSteps[0];
        setTutorQuestion(firstStep.question);
        setMessages((prev) => [
          ...prev,
          { role: "tutor", text: firstStep.question },
        ]);
        setStarted(true);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: "No se pudieron generar los pasos para este ejercicio. Intenta con otro.",
            type: "incorrect",
          },
        ]);
      }
    }
    setLoading(false);
  };

  const handleAskQuestion = async () => {
    if (!studentAnswer.trim() || loading) return;
    setLoading(true);

    const question = studentAnswer.trim();
    setMessages((prev) => [
      ...prev,
      { role: "student", text: `❓ ${question}` },
    ]);
    setStudentAnswer("");

    try {
      const result = await api.tutorAsk(exercise.id, currentStep, question);

      if (result.isActuallyAnswer) {
        // La IA detectó que es una respuesta
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: result.answer,
            type: "hint",
          },
        ]);
      } else {
        // Es una pregunta válida
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: result.answer,
            type: "info",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: "Hubo un error al procesar tu pregunta. Intenta reformularla.",
          type: "incorrect",
        },
      ]);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!studentAnswer.trim() || loading) return;

    // Delegar según el modo
    if (inputMode === "question") {
      await handleAskQuestion();
      return;
    }

    // Modo respuesta (original)
    setLoading(true);

    const answer = studentAnswer.trim();
    setMessages((prev) => [...prev, { role: "student", text: answer }]);
    setStudentAnswer("");
    setHintLevel(0);

    try {
      const response = await api.tutorAnswerStream(
        exercise.id,
        currentStep,
        answer,
      );

      if (!response.ok || !response.body) throw new Error("Stream failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let resultData: any = null;
      let feedbackText = "";
      let buffer = "";
      let lastEventType = "";

      // Show thinking indicator
      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: "", type: "info" },
      ]);

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
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    type: resultData.correct
                      ? "correct"
                      : resultData.partial
                        ? "partial"
                        : "incorrect",
                  };
                  return updated;
                });
              } else if (
                lastEventType === "chunk" &&
                parsed.text !== undefined
              ) {
                feedbackText += parsed.text;
                const currentText = feedbackText;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    text: currentText,
                  };
                  return updated;
                });
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      }

      setStreaming(false);

      // Process result after stream ends
      if (resultData?.correct || resultData?.partial) {
        // Incrementar contador de parciales si aplica
        if (resultData.partial) {
          setPartialAnswers((p) => p + 1);
        }

        if (resultData.completed) {
          setIsComplete(true);
          const summary = {
            stepsSolved: totalSteps,
            hintsUsed,
            stepsRevealed,
            score: calculateScore(),
          };
          setMessages((prev) => [
            ...prev,
            {
              role: "tutor",
              text: `🎉 ¡Excelente! Has completado todos los pasos.`,
              type: "info",
            },
          ]);
          onComplete(summary);
        } else {
          setCurrentStep(resultData.nextStep);
          setTutorQuestion(resultData.tutorQuestion);
          setHintLevel(0);
          setPreviousHints([]);
          setStudentAttempts([]);
          setMessages((prev) => [
            ...prev,
            { role: "tutor", text: resultData.tutorQuestion },
          ]);
        }
      }
    } catch {
      setStreaming(false);
      // Fallback: validación semántica con IA
      const step = socraticSteps[currentStep];
      let isCorrect = false;
      try {
        const validation = await api.validateAnswer({
          userAnswer: answer,
          expectedAnswer: step.expected,
        });
        isCorrect = validation.correct;
      } catch {
        const normalize = (s: string) =>
          s.trim().toLowerCase().replace(/\s+/g, "");
        isCorrect = normalize(answer) === normalize(step.expected);
      }

      if (isCorrect) {
        const isLast = currentStep >= totalSteps - 1;
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: "¡Correcto! Continuemos.",
            type: "correct",
          },
        ]);

        if (isLast) {
          setIsComplete(true);
          const summary = {
            stepsSolved: totalSteps,
            hintsUsed,
            stepsRevealed,
            score: calculateScore(),
          };
          setMessages((prev) => [
            ...prev,
            {
              role: "tutor",
              text: `🎉 ¡Completado!`,
              type: "info",
            },
          ]);
          onComplete(summary);
        } else {
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          setHintLevel(0);
          setPreviousHints([]);
          setStudentAttempts([]);
          const nextQ = socraticSteps[nextStep].question;
          setTutorQuestion(nextQ);
          setMessages((prev) => [...prev, { role: "tutor", text: nextQ }]);
        }
      } else {
        setStudentAttempts((prev) => [...prev, answer]);
        setMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: "No es del todo correcto. Piensa en el concepto e inténtalo de nuevo.",
            type: "incorrect",
          },
        ]);
      }
    }
    setLoading(false);
  };

  const handleHint = async () => {
    if (loading) return;
    setLoading(true);

    const newLevel = hintLevel + 1;
    setHintLevel(newLevel);

    try {
      const result = await api.tutorHint(
        exercise.id,
        currentStep,
        newLevel,
        previousHints,
        studentAttempts,
      );

      setPreviousHints((prev) => [...prev, result.hint]);
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: `💡 Pista ${newLevel}: ${result.hint}`,
          type: "hint",
        },
      ]);

      setHintsUsed((h) => h + 1);
    } catch {
      // Fallback: pistas locales
      const step = socraticSteps[currentStep];
      const hints = step.hints || [];
      const idx = Math.min(newLevel - 1, hints.length - 1);
      let hint: string;

      if (hints.length > 0) {
        hint = hints[idx];
      } else {
        hint =
          newLevel <= 2
            ? "Piensa en las propiedades matemáticas que se aplican."
            : `Pista directa: la respuesta es "${step.expected}".`;
      }

      setPreviousHints((prev) => [...prev, hint]);
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          text: `💡 Pista ${newLevel}: ${hint}`,
          type: "hint",
        },
      ]);

      setHintsUsed((h) => h + 1);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          ← Volver
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Paso {currentStep + 1} de {totalSteps}
          </span>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Puntaje estimado: {calculateScore()}
          </span>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{
            width: `${isComplete ? 100 : (currentStep / totalSteps) * 100}%`,
          }}
        />
      </div>

      {/* Ejercicio */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-medium">
            🧠 Modo Socrático
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium">
            {exercise.difficulty === "easy"
              ? "★"
              : exercise.difficulty === "medium"
                ? "★★"
                : "★★★"}
          </span>
        </div>
        <div className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {exercise.latex}
        </div>
      </div>

      {/* Conversación */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "student"
                  ? "bg-indigo-600 text-white"
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
              {msg.text || (
                <span className="inline-flex items-center gap-1 py-1">
                  <span
                    className="w-2 h-2 bg-current rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-current rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-current rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Controles */}
      {!started ? (
        <button
          onClick={startSession}
          disabled={loading}
          className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50">
          {loading ? "Iniciando..." : "🧠 Comenzar Tutoría Socrática"}
        </button>
      ) : !isComplete ? (
        <div className="space-y-3">
          {/* Toggle Modo Pregunta/Respuesta */}
          <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            <button
              onClick={() => setInputMode("answer")}
              disabled={loading}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                inputMode === "answer"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}>
              ✏️ Respuesta
            </button>
            <button
              onClick={() => setInputMode("question")}
              disabled={loading}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                inputMode === "question"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}>
              ❓ Pregunta
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={
                inputMode === "answer"
                  ? "Escribe tu respuesta..."
                  : "Haz una pregunta al tutor"
              }
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !studentAnswer.trim()}
              className={`w-full sm:w-auto px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors ${
                inputMode === "answer"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}>
              {inputMode === "answer" ? "Enviar" : "Preguntar"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleHint}
              disabled={loading}
              className="px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/70 text-sm font-medium transition-colors disabled:opacity-50">
              💡 Pista {hintLevel > 0 ? `(${hintLevel})` : ""}
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <span>Pistas: -10pts c/u</span>
              <span>•</span>
              <span>Pide tantas como necesites</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
          <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {calculateScore()} pts
          </div>
          <div className="text-sm text-emerald-700 dark:text-emerald-300">
            Pasos resueltos: {totalSteps} • Pistas usadas: {hintsUsed} • Pasos
            revelados: {stepsRevealed}
          </div>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors">
            Volver a Práctica
          </button>
        </div>
      )}
    </div>
  );
}
