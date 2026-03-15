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

  // Exercise tips state
  const [exerciseTips, setExerciseTips] = useState<any>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [notesPage, setNotesPage] = useState(0);
  const NOTES_PER_PAGE = 3;

  // Topic documentation state
  const [topicDocs, setTopicDocs] = useState<any>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsTab, setDocsTab] = useState<
    "conceptos" | "ejemplos" | "casos" | "curiosidades"
  >("conceptos");
  const [ejemploIndex, setEjemploIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<number | null>(0);
  const [generatingExercise, setGeneratingExercise] = useState(false);

  useEffect(() => {
    if (id) {
      api
        .getTopic(parseInt(id))
        .then((data) => {
          setTopic(data);
          setDetailView("overview");
          setSelectedDifficulty(null);
          setPage(1);
          // Load topic documentation
          setDocsTab("conceptos");
          if (data.doc) {
            // Docs already in DB — use them directly (no AI call)
            setTopicDocs({
              conceptos: data.doc.conceptos,
              ejemplos: JSON.parse(data.doc.ejemplos),
              casosDeUso: JSON.parse(data.doc.casosDeUso),
              curiosidades: JSON.parse(data.doc.curiosidades),
            });
            setDocsLoading(false);
          } else {
            // No docs yet — generate on-demand
            setDocsLoading(true);
            setTopicDocs(null);
            api
              .getTopicDocs(data.name)
              .then(setTopicDocs)
              .catch(() => {})
              .finally(() => setDocsLoading(false));
          }
        })
        .catch(() => {
          setTopic(null);
        });
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
    // Load tips
    const ex = filteredExercises[exerciseIndex];
    if (ex?.id) {
      setTipsLoading(true);
      setExerciseTips(null);
      setNotesPage(0);
      api
        .getExerciseTips(ex.id)
        .then(setExerciseTips)
        .catch(() => {})
        .finally(() => setTipsLoading(false));
    }
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

        {/* Consejos del ejercicio */}
        {(tipsLoading || exerciseTips) && (
          <details className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-cyan-800 dark:text-cyan-200 select-none flex items-center gap-2">
              <span>💡</span> Consejos para resolver{" "}
              {exerciseTips && (
                <span className="text-xs text-cyan-500">
                  ({exerciseTips.tips.length})
                </span>
              )}{" "}
              {tipsLoading && (
                <span className="ml-1 text-xs text-cyan-500">cargando...</span>
              )}
            </summary>
            {exerciseTips && (
              <div className="px-4 pb-4 space-y-2 border-t border-cyan-200 dark:border-cyan-800 pt-3">
                {exerciseTips.tips.map((tip: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        tip.source === "clase"
                          ? "bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200"
                          : "bg-cyan-200 dark:bg-cyan-800 text-cyan-800 dark:text-cyan-200"
                      }`}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {tip.text}
                      </p>
                      {tip.source === "clase" && (
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                          📝 Basado en tus clases
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {exerciseTips.classContext.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs font-medium text-purple-700 dark:text-purple-300 cursor-pointer select-none">
                      📚 Notas del profesor ({exerciseTips.classContext.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {exerciseTips.classContext
                        .slice(
                          notesPage * NOTES_PER_PAGE,
                          (notesPage + 1) * NOTES_PER_PAGE,
                        )
                        .map((note: any, i: number) => (
                          <div
                            key={i}
                            className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                              {note.titulo}
                            </p>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              <MarkdownLatex content={note.contenido} />
                            </div>
                          </div>
                        ))}
                      {exerciseTips.classContext.length > NOTES_PER_PAGE && (
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() =>
                              setNotesPage((p) => Math.max(0, p - 1))
                            }
                            disabled={notesPage === 0}
                            className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 disabled:opacity-40 hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors">
                            ← Anterior
                          </button>
                          <span className="text-xs text-purple-500 dark:text-purple-400">
                            {notesPage + 1} /{" "}
                            {Math.ceil(
                              exerciseTips.classContext.length / NOTES_PER_PAGE,
                            )}
                          </span>
                          <button
                            onClick={() =>
                              setNotesPage((p) =>
                                Math.min(
                                  Math.ceil(
                                    exerciseTips.classContext.length /
                                      NOTES_PER_PAGE,
                                  ) - 1,
                                  p + 1,
                                ),
                              )
                            }
                            disabled={
                              notesPage >=
                              Math.ceil(
                                exerciseTips.classContext.length /
                                  NOTES_PER_PAGE,
                              ) -
                                1
                            }
                            className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 disabled:opacity-40 hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors">
                            Siguiente →
                          </button>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}
          </details>
        )}

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
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Puntaje: {score}
            </span>
            <button
              onClick={async () => {
                setGeneratingExercise(true);
                try {
                  const newEx = await api.generateOneExercise(
                    topic.id,
                    selectedDifficulty!,
                  );
                  setTopic((prev: any) => ({
                    ...prev,
                    exercises: [...(prev.exercises || []), newEx],
                  }));
                } catch {
                  // silently fail
                }
                setGeneratingExercise(false);
              }}
              disabled={generatingExercise}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
              {generatingExercise ? (
                <>
                  <span className="animate-spin w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                  Generando...
                </>
              ) : (
                <>✨ Generar ejercicio</>
              )}
            </button>
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
  if (id && !topic) {
    return (
      <div className="text-center py-20">
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-4">
          Este tema ya no existe.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
          Es posible que la clase asociada haya sido eliminada.
        </p>
        <Link
          to="/topics"
          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          ← Volver a Temas
        </Link>
      </div>
    );
  }

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

        {/* Documentación del tema */}
        <div>
          <h2 className="text-xl font-semibold mb-3 dark:text-gray-100">
            📚 Documentación
          </h2>

          {docsLoading ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">
                Generando documentación con IA...
              </p>
            </div>
          ) : topicDocs ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {[
                  { key: "conceptos" as const, label: "📖 Conceptos" },
                  { key: "ejemplos" as const, label: "✏️ Ejemplos" },
                  { key: "casos" as const, label: "🌍 Casos de Uso" },
                  { key: "curiosidades" as const, label: "💡 Curiosidades" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDocsTab(tab.key)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      docsTab === tab.key
                        ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {docsTab === "conceptos" && (() => {
                  // Split conceptos into sections by double newline or markdown headings
                  const raw = topicDocs.conceptos || "";
                  const sections = raw
                    .split(/\n(?=#{1,3}\s)|(?:\n\s*\n)/)
                    .map((s: string) => s.trim())
                    .filter((s: string) => s.length > 0);

                  const toggleSection = (idx: number) => {
                    setExpandedSections((prev) =>
                      prev === idx ? null : idx,
                    );
                  };

                  if (sections.length <= 1) {
                    return (
                      <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed">
                        <MarkdownLatex content={raw} />
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {sections.map((section: string, idx: number) => {
                        const isExpanded = expandedSections === idx;
                        const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
                        const title = headingMatch
                          ? headingMatch[2]
                          : section.length > 80
                            ? section.slice(0, 80) + "..."
                            : section.split("\n")[0];
                        const content = headingMatch
                          ? section.replace(/^#{1,3}\s+.+\n?/, "").trim()
                          : section;

                        return (
                          <div
                            key={idx}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleSection(idx)}
                              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                                {title}
                              </span>
                              <span
                                className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                ▼
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 text-sm leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-3">
                                <MarkdownLatex content={content || section} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {docsTab === "ejemplos" && (() => {
                  const ejemplos = topicDocs.ejemplos || [];
                  if (ejemplos.length === 0) {
                    return (
                      <p className="text-gray-400 dark:text-gray-500 text-sm">
                        No hay ejemplos disponibles.
                      </p>
                    );
                  }
                  const safeIndex = Math.min(ejemploIndex, ejemplos.length - 1);
                  const ej = ejemplos[safeIndex];

                  return (
                    <div>
                      {/* Carousel controls */}
                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={() => setEjemploIndex((i) => Math.max(0, i - 1))}
                          disabled={safeIndex === 0}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">
                          ←
                        </button>
                        <div className="flex items-center gap-1.5">
                          {ejemplos.map((_: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => setEjemploIndex(i)}
                              aria-label={`Ejemplo ${i + 1}`}
                              className={`w-2 h-2 rounded-full transition-all ${
                                i === safeIndex
                                  ? "bg-indigo-500 scale-125"
                                  : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
                              }`}
                            />
                          ))}
                          <span className="ml-1.5 text-xs text-gray-400">
                            {safeIndex + 1}/{ejemplos.length}
                          </span>
                        </div>
                        <button
                          onClick={() => setEjemploIndex((i) => Math.min(ejemplos.length - 1, i + 1))}
                          disabled={safeIndex === ejemplos.length - 1}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">
                          →
                        </button>
                      </div>

                      {/* Card */}
                      <div
                        className="border border-indigo-200 dark:border-indigo-800/40 rounded-xl overflow-hidden shadow-sm"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft") setEjemploIndex((i) => Math.max(0, i - 1));
                          if (e.key === "ArrowRight") setEjemploIndex((i) => Math.min(ejemplos.length - 1, i + 1));
                        }}>
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 flex items-center gap-2">
                          <span className="bg-indigo-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {safeIndex + 1}
                          </span>
                          <span className="font-medium text-sm text-indigo-800 dark:text-indigo-300">
                            {ej.titulo}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <span className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
                              Problema
                            </span>
                            <div className="mt-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/30 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                              <MarkdownLatex content={ej.problema} />
                            </div>
                          </div>
                          <details className="group">
                            <summary className="text-xs font-semibold uppercase text-indigo-500 dark:text-indigo-400 cursor-pointer hover:underline select-none">
                              Ver solución
                            </summary>
                            <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-2">
                              <MarkdownLatex content={ej.solucion} />
                            </div>
                          </details>
                        </div>
                      </div>

                      {/* Keyboard hint */}
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
                        ← → para navegar
                      </p>
                    </div>
                  );
                })()}

                {docsTab === "casos" && (
                  <div className="space-y-3">
                    {topicDocs.casosDeUso.map((caso: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center text-sm font-bold">
                          {i + 1}
                        </span>
                        <p className="text-gray-700 dark:text-gray-300 text-sm pt-1">
                          {caso}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {docsTab === "curiosidades" && (
                  <div className="space-y-3">
                    {topicDocs.curiosidades.map((cur: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/40">
                        <span className="text-xl flex-shrink-0">💡</span>
                        <p className="text-gray-700 dark:text-gray-300 text-sm pt-0.5">
                          {cur}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

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
