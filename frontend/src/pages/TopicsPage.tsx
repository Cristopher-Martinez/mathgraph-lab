import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import IntervalVisualizer from "../components/IntervalVisualizer";
import Latex from "../components/Latex";
import MarkdownLatex from "../components/MarkdownLatex";
import MathAnswerInput from "../components/MathAnswerInput";
import SocraticTutor from "../components/SocraticTutor";
import TopicCard from "../components/TopicCard";
import { api } from "../services/api";

const ITEMS_PER_PAGE = 10;

const DIFF_CONFIG = [
  { level: "easy", label: "Fácil", color: "emerald", icon: "🟢", stars: "★☆☆" },
  {
    level: "medium",
    label: "Intermedio",
    color: "amber",
    icon: "🟡",
    stars: "★★☆",
  },
  { level: "hard", label: "Difícil", color: "red", icon: "🔴", stars: "★★★" },
];

type DetailView = "overview" | "exercises" | "solving" | "socratic";

export default function TopicsPage() {
  const { id } = useParams();
  const [topics, setTopics] = useState<any[]>([]);
  const [topic, setTopic] = useState<any>(null);
  const [classLogs, setClassLogs] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Exercise browsing state
  const [detailView, setDetailView] = useState<DetailView>("overview");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(
    null,
  );
  const [page, setPage] = useState(1);

  // Solving state
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<any>(null);
  const [solverResult, setSolverResult] = useState<any>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (id) {
      api
        .getTopic(parseInt(id))
        .then((data) => {
          setTopic(data);
          setDetailView("overview");
          setSelectedDifficulty(null);
          setPage(1);
        })
        .catch(() => {});
    } else {
      api
        .getClassLogs()
        .then(setClassLogs)
        .catch(() => {});
      api
        .getTopics(selectedClassId ? { classId: selectedClassId } : undefined)
        .then(setTopics)
        .catch(() => {});
    }
  }, [id, selectedClassId]);

  // Computed exercise data
  const topicExercises: any[] = topic?.exercises || [];
  const filteredExercises = selectedDifficulty
    ? topicExercises.filter((e: any) => e.difficulty === selectedDifficulty)
    : topicExercises;
  const totalPages = Math.ceil(filteredExercises.length / ITEMS_PER_PAGE);
  const paginatedExercises = filteredExercises.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const handleSelectDifficulty = (level: string) => {
    setSelectedDifficulty(level);
    setDetailView("exercises");
    setPage(1);
  };

  const handleStartExercise = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    setDetailView("solving");
    setAnswer("");
    setFeedback(null);
    setSolverResult(null);
  };

  const handleStartSocratic = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    setDetailView("socratic");
    setAnswer("");
    setFeedback(null);
    setSolverResult(null);
  };

  const handleBack = () => {
    if (detailView === "solving" || detailView === "socratic") {
      setDetailView("exercises");
      setFeedback(null);
      setSolverResult(null);
      setAnswer("");
    } else if (detailView === "exercises") {
      setSelectedDifficulty(null);
      setDetailView("overview");
    }
  };

  const currentEx = filteredExercises[currentExIndex];

  const handleSubmit = async () => {
    if (!currentEx) return;
    setFeedback(null);
    setSolverResult(null);

    try {
      const solveParams = buildSolveParams(currentEx);
      if (solveParams) {
        const result = await api.solveExercise(solveParams);
        setSolverResult(result);
      }
      const validation = await api.validateAnswer({
        userAnswer: answer.trim(),
        expectedAnswer: (currentEx.steps || "").trim(),
        exercisePrompt: currentEx.latex || currentEx.prompt || "",
      });
      setFeedback({
        correct: validation.correct,
        expected: currentEx.steps,
        aiFeedback: validation.feedback,
      });
      if (validation.correct) setScore((s) => s + 1);
    } catch {
      setFeedback({ correct: false, error: "Error al verificar respuesta" });
    }
  };

  const handleShowSolution = async () => {
    if (!currentEx) return;
    const solveParams = buildSolveParams(currentEx);
    if (solveParams) {
      try {
        const result = await api.solveExercise(solveParams);
        setSolverResult(result);
      } catch {
        /* ignore */
      }
    }
    setFeedback({ correct: false, expected: currentEx.steps, revealed: true });
  };

  const handleNextExercise = () => {
    if (currentExIndex < filteredExercises.length - 1) {
      setCurrentExIndex((i) => i + 1);
      setAnswer("");
      setFeedback(null);
      setSolverResult(null);
    }
  };

  // ─── Topic Detail: Socratic View ──────────────────
  if (id && topic && detailView === "socratic" && currentEx) {
    return (
      <SocraticTutor
        exercise={currentEx}
        onComplete={(summary) => {
          setScore((s) => s + Math.round(summary.score / 10));
        }}
        onBack={handleBack}
      />
    );
  }

  // ─── Topic Detail: Solving View ──────────────────
  if (id && topic && detailView === "solving" && currentEx) {
    const diffConfig = DIFF_CONFIG.find(
      (d) => d.level === currentEx.difficulty,
    )!;

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <button
          onClick={handleBack}
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
          ← Volver a la lista
        </button>

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {topic.name}
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Ejercicio {currentExIndex + 1} de {filteredExercises.length} •
            Puntaje: {score}
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all"
            style={{
              width: `${((currentExIndex + 1) / filteredExercises.length) * 100}%`,
            }}
          />
        </div>

        {/* Ejercicio */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium">
              {topic.name}
            </span>
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium">
              {diffConfig.icon} {diffConfig.label}
            </span>
          </div>
          <div className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">
            <MarkdownLatex content={currentEx.latex || currentEx.question} />
          </div>

          <div className="flex gap-2">
            <MathAnswerInput
              value={answer}
              onChange={setAnswer}
              onSubmit={handleSubmit}
              expectedAnswer={currentEx.steps}
            />
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors self-start">
              Verificar
            </button>
          </div>
        </div>

        {/* Retroalimentación */}
        {feedback && (
          <div
            className={`p-4 rounded-lg border ${
              feedback.correct
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100"
            }`}>
            <div className="font-semibold">
              {feedback.correct
                ? "✓ ¡Correcto!"
                : feedback.revealed
                  ? "💡 Solución:"
                  : "✗ Incorrecto"}
            </div>
            {feedback.aiFeedback && (
              <div className="mt-2 text-sm">{feedback.aiFeedback}</div>
            )}
            {!feedback.correct && feedback.expected && (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Esperado:{" "}
                <span className="font-mono font-semibold">
                  {feedback.expected}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Visualización de Intervalos */}
        {solverResult?.intervals && (
          <div>
            <h3 className="font-semibold mb-2 text-gray-900 dark:text-gray-200">
              Visualización de la Solución
            </h3>
            <IntervalVisualizer intervals={solverResult.intervals} />
            {solverResult.notation && (
              <p className="mt-2 text-sm font-mono text-gray-700 dark:text-gray-300 text-center">
                {solverResult.notation}
              </p>
            )}
          </div>
        )}

        {/* Navegación */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleShowSolution}
            className="px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/70 font-medium transition-colors">
            Mostrar Solución
          </button>
          <button
            onClick={() => handleStartSocratic(currentExIndex)}
            className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/70 font-medium transition-colors flex items-center gap-1.5">
            🧠 Modo Socrático
          </button>
          {currentExIndex < filteredExercises.length - 1 && (
            <button
              onClick={handleNextExercise}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors">
              Siguiente Ejercicio →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Topic Detail: Exercises List (Paginated) ────
  if (id && topic && detailView === "exercises" && selectedDifficulty) {
    const diffConfig = DIFF_CONFIG.find((d) => d.level === selectedDifficulty)!;

    return (
      <div className="space-y-6">
        <button
          onClick={handleBack}
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
          ← Volver a dificultad
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {topic.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {diffConfig.icon} {diffConfig.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                • {filteredExercises.length} ejercicios
              </span>
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Puntaje: {score}
          </div>
        </div>

        {/* Lista de ejercicios */}
        <div className="space-y-2">
          {paginatedExercises.map((ex: any, i: number) => {
            const globalIndex = (page - 1) * ITEMS_PER_PAGE + i;
            return (
              <div
                key={ex.id}
                className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex items-center justify-between group">
                <button
                  onClick={() => handleStartExercise(globalIndex)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-bold">
                    {globalIndex + 1}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200 font-medium truncate">
                    <MarkdownLatex content={ex.latex || ex.question} />
                  </span>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={() => handleStartSocratic(globalIndex)}
                    title="Iniciar en modo Socrático"
                    className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors flex items-center gap-1">
                    🧠 Socrático
                  </button>
                  <span
                    className="text-indigo-500 dark:text-indigo-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-sm cursor-pointer"
                    onClick={() => handleStartExercise(globalIndex)}>
                    Resolver →
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ← Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  p === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}>
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Siguiente →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Topic Detail: Overview (Formulas + Difficulty Cards) ─
  if (id && topic) {
    return (
      <div className="space-y-6">
        <Link
          to="/topics"
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
          ← Volver a Temas
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {topic.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {topicExercises.length} ejercicios disponibles
          </p>
        </div>

        {/* Fórmulas */}
        {topic.formulas?.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-3 dark:text-gray-100">
              Fórmulas
            </h2>
            <div className="space-y-3">
              {topic.formulas.map((f: any) => (
                <div
                  key={f.id}
                  className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-center mb-2">
                    <Latex math={f.latex} display />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    {f.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tarjetas de Dificultad */}
        {topicExercises.length > 0 ? (
          <div>
            <h2 className="text-xl font-semibold mb-3 dark:text-gray-100">
              Ejercicios
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Selecciona el nivel de dificultad:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {DIFF_CONFIG.map(({ level, label, color, icon, stars }) => {
                const count = topicExercises.filter(
                  (e: any) => e.difficulty === level,
                ).length;
                if (count === 0) return null;

                const colorClasses: Record<string, string> = {
                  emerald:
                    "border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
                  amber:
                    "border-amber-300 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-500 bg-amber-50 dark:bg-amber-900/20",
                  red: "border-red-300 dark:border-red-700 hover:border-red-500 dark:hover:border-red-500 bg-red-50 dark:bg-red-900/20",
                };

                return (
                  <button
                    key={level}
                    onClick={() => handleSelectDifficulty(level)}
                    className={`rounded-xl p-6 border-2 ${colorClasses[color]} hover:shadow-lg transition-all text-center`}>
                    <div className="text-4xl mb-3">{icon}</div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                      {label}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {count} ejercicios
                    </p>
                    <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                      {stars}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-center text-sm text-gray-400 dark:text-gray-500 pt-4">
              Total: {topicExercises.length} ejercicios en este tema • Puntaje:{" "}
              {score}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-800 dark:text-amber-200 text-sm">
            Este tema aún no tiene ejercicios disponibles.
          </div>
        )}
      </div>
    );
  }

  // ─── Topics Grid ─────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold dark:text-gray-100">Temas</h1>
      <p className="text-gray-500 dark:text-gray-400">
        Explora temas matemáticos y sus ejercicios.
      </p>

      {/* Filtro por clase */}
      {classLogs.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Filtrar por clase:
          </label>
          <select
            value={selectedClassId ?? ""}
            onChange={(e) =>
              setSelectedClassId(
                e.target.value ? parseInt(e.target.value) : null,
              )
            }
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none">
            <option value="">Todas las clases</option>
            {classLogs.map((cl: any) => (
              <option key={cl.id} value={cl.id}>
                Clase #{cl.id} —{" "}
                {new Date(cl.date).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </option>
            ))}
          </select>
          {selectedClassId && (
            <button
              onClick={() => setSelectedClassId(null)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics.map((t) => (
          <TopicCard
            key={t.id}
            id={t.id}
            name={t.name}
            exerciseCount={t.exercises?.length || 0}
          />
        ))}
      </div>
    </div>
  );
}

function buildSolveParams(ex: any): { type: string; params: any } | null {
  // Detectar tipo de ejercicio por contenido del latex
  const text = ex.latex || "";
  const coords = [
    ...text.matchAll(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g),
  ];
  if (coords.length >= 2) {
    // Determinar tipo por palabras clave
    let type = "distance";
    if (
      text.toLowerCase().includes("punto medio") ||
      text.toLowerCase().includes("midpoint")
    )
      type = "midpoint";
    else if (
      text.toLowerCase().includes("pendiente") ||
      text.toLowerCase().includes("slope")
    )
      type = "slope";
    else if (
      text.toLowerCase().includes("ecuación") ||
      text.toLowerCase().includes("recta que pasa")
    )
      type = "line_equation";
    return {
      type,
      params: {
        pointA: { x: parseFloat(coords[0][1]), y: parseFloat(coords[0][2]) },
        pointB: { x: parseFloat(coords[1][1]), y: parseFloat(coords[1][2]) },
      },
    };
  }
  return null;
}
