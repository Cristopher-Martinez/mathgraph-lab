import { useEffect, useRef, useState } from "react";
import MarkdownLatex from "../components/MarkdownLatex";
import { api } from "../services/api";

type TrainingMode = "guided" | "timed" | "exam";

export default function TrainingPage() {
  const [mode, setMode] = useState<TrainingMode | null>(null);
  const [session, setSession] = useState<any>(null);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<
    Array<{ correct: boolean; question: string }>
  >([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finished, setFinished] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<any>(null);

  // Check for existing session on mount
  useEffect(() => {
    const savedId = localStorage.getItem("training_session_id");
    if (savedId) {
      api.resumeTraining(savedId).then((data) => {
        setResumePrompt(data);
      }).catch(() => {
        localStorage.removeItem("training_session_id");
      });
    }
  }, []);

  // Auto-save after each answer
  const autoSave = (newResults: any[], newCurrent: number) => {
    const sessionId = session?.sessionId;
    if (!sessionId) return;
    api.saveTraining({
      sessionId,
      current: newCurrent,
      answers: [],
      results: newResults,
      timeLeft,
    }).catch(() => {});
  };

  const startSession = async (selectedMode: TrainingMode) => {
    setMode(selectedMode);
    setResults([]);
    setCurrent(0);
    setFinished(false);
    setFeedback(null);
    setResumePrompt(null);
    try {
      const data = await api.startTraining({
        mode: selectedMode,
        count: selectedMode === "exam" ? 10 : 5,
      });
      setSession(data);
      localStorage.setItem("training_session_id", data.sessionId);
      if (data.timeLimit) {
        setTimeLeft(data.timeLimit);
      }
    } catch {
      setSession(null);
    }
  };

  const resumeSession = () => {
    if (!resumePrompt) return;
    setSession(resumePrompt);
    setMode(resumePrompt.mode);
    setCurrent(resumePrompt.current || 0);
    setResults(resumePrompt.results || []);
    if (resumePrompt.timeLeft !== undefined) {
      setTimeLeft(resumePrompt.timeLeft);
    } else if (resumePrompt.timeLimit) {
      setTimeLeft(resumePrompt.timeLimit);
    }
    setResumePrompt(null);
    setFinished(false);
    setFeedback(null);
  };

  const dismissResume = () => {
    const savedId = localStorage.getItem("training_session_id");
    if (savedId) {
      api.finishTraining(savedId).catch(() => {});
      localStorage.removeItem("training_session_id");
    }
    setResumePrompt(null);
  };

  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0 && !finished) {
      timerRef.current = setTimeout(
        () => setTimeLeft((t) => (t !== null ? t - 1 : null)),
        1000,
      );
    } else if (timeLeft === 0 && !finished) {
      setFinished(true);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, finished]);

  const handleSubmit = async () => {
    if (!session) return;
    const ex = session.exercises[current];

    try {
      const validation = await api.validateAnswer({
        userAnswer: answer.trim(),
        expectedAnswer: (ex.steps || "").trim(),
        exercisePrompt: ex.latex || ex.prompt || "",
      });
      setFeedback({
        correct: validation.correct,
        expected: ex.steps,
        aiFeedback: validation.feedback,
      });
      const newResults = [
        ...results,
        { correct: validation.correct, question: ex.latex },
      ];
      setResults(newResults);
      autoSave(newResults, current);
    } catch {
      const userAnswer = answer.trim().toLowerCase();
      const expected = (ex.steps || "").trim().toLowerCase();
      const correct =
        userAnswer === expected ||
        userAnswer.replace(/\s/g, "") === expected.replace(/\s/g, "");
      setFeedback({ correct, expected: ex.steps });
      const newResults = [...results, { correct, question: ex.latex }];
      setResults(newResults);
      autoSave(newResults, current);
    }
  };

  const handleNext = () => {
    if (current + 1 >= session.exercises.length) {
      setFinished(true);
      // Clean up session
      if (session?.sessionId) {
        api.finishTraining(session.sessionId).catch(() => {});
        localStorage.removeItem("training_session_id");
      }
    } else {
      setCurrent((c) => c + 1);
      setAnswer("");
      setFeedback(null);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Selección de modo
  if (!mode) {
    return (
      <div className="space-y-6">
        {/* Resume prompt */}
        {resumePrompt && (
          <div className="bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-indigo-800 dark:text-indigo-300">
                Tienes una sesión en progreso
              </p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400">
                Modo: {resumePrompt.mode} &middot; Ejercicio{" "}
                {(resumePrompt.current || 0) + 1}/
                {resumePrompt.exercises?.length || "?"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resumeSession}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                Continuar
              </button>
              <button
                onClick={dismissResume}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">
                Nueva sesión
              </button>
            </div>
          </div>
        )}
        <h1 className="text-3xl font-bold dark:text-gray-100">
          Modo de Entrenamiento
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Elige un modo de entrenamiento para mejorar tus habilidades.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ModeCard
            title="Práctica Guiada"
            description="Resolución paso a paso con pistas y retroalimentación después de cada ejercicio."
            color="indigo"
            onClick={() => startSession("guided")}
          />
          <ModeCard
            title="Práctica Cronometrada"
            description="10 minutos para resolver tantos ejercicios como sea posible. ¡Compite contra el reloj!"
            color="amber"
            onClick={() => startSession("timed")}
          />
          <ModeCard
            title="Simulador de Examen"
            description="Simula un examen real con 10 ejercicios y 30 minutos."
            color="rose"
            onClick={() => startSession("exam")}
          />
        </div>
      </div>
    );
  }

  // Finalizado
  if (finished) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">
          ¡Entrenamiento Completado!
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
          <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">
            {correctCount}/{results.length}
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {correctCount === results.length
              ? "¡Puntuación perfecta! 🎉"
              : correctCount >= results.length / 2
                ? "¡Buen trabajo! Sigue practicando."
                : "Sigue estudiando — ¡tú puedes!"}
          </p>
        </div>
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border ${r.correct ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"}`}>
              <span className="font-mono text-sm dark:text-gray-300">
                <MarkdownLatex content={r.question} />
              </span>
              <span className="ml-2">{r.correct ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setMode(null)}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Intentar de Nuevo
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-gray-500 dark:text-gray-400">Cargando sesión...</div>
    );
  }

  const ex = session.exercises[current];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-xl sm:text-2xl font-bold capitalize dark:text-gray-100">
          {mode === "guided"
            ? "Práctica Guiada"
            : mode === "timed"
              ? "Práctica Cronometrada"
              : "Simulador de Examen"}
        </h1>
        <div className="flex items-center gap-4">
          {timeLeft !== null && (
            <span
              className={`font-mono text-lg font-bold ${timeLeft < 60 ? "text-red-600 dark:text-red-400 animate-pulse" : "text-gray-700 dark:text-gray-300"}`}>
              {formatTime(timeLeft)}
            </span>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {current + 1}/{session.exercises.length}
          </span>
        </div>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all"
          style={{
            width: `${((current + 1) / session.exercises.length) * 100}%`,
          }}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 mb-3">
          <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded">
            {ex.topic?.name || "General"}
          </span>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
            {ex.difficulty === "easy"
              ? "★"
              : ex.difficulty === "medium"
                ? "★★"
                : "★★★"}
          </span>
        </div>
        <div className="text-lg font-medium mb-4 dark:text-gray-200">
          <MarkdownLatex content={ex.latex || ex.question} />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !feedback && handleSubmit()}
            placeholder="Tu respuesta..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={!!feedback}
          />
          {!feedback ? (
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Enviar
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

      {feedback && (
        <div
          className={`p-4 rounded-lg border ${feedback.correct ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"}`}>
          <span className="font-semibold dark:text-gray-200">
            {feedback.correct ? "✓ ¡Correcto!" : "✗ Incorrecto"}
          </span>
          {feedback.aiFeedback && (
            <span className="ml-2 text-sm dark:text-gray-300">
              {feedback.aiFeedback}
            </span>
          )}
          {!feedback.correct && feedback.expected && (
            <div className="mt-1 text-sm dark:text-gray-400">
              Esperado: <code className="font-mono">{feedback.expected}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeCard({
  title,
  description,
  color,
  onClick,
}: {
  title: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    indigo:
      "from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700",
    amber:
      "from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700",
    rose: "from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700",
  };

  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-br ${colors[color]} text-white rounded-xl p-6 text-left transition-all hover:scale-[1.02] hover:shadow-lg`}>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-white/80">{description}</p>
    </button>
  );
}
