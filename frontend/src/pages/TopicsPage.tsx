import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExerciseListView } from "../components/ExerciseListView";
import { ExerciseSolvingView } from "../components/ExerciseSolvingView";
import Latex from "../components/Latex";
import MarkdownLatex from "../components/MarkdownLatex";
import SocraticTutor from "../components/SocraticTutor";
import TopicCard from "../components/TopicCard";
import { api } from "../services/api";
import {
  DIFF_CONFIG,
  DIFFICULTY_COLOR_CLASSES,
} from "../utils/exerciseConstants";

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
  const [score, setScore] = useState(0);

  // Topic documentation state
  const [topicDocs, setTopicDocs] = useState<any>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsTab, setDocsTab] = useState<
    "conceptos" | "ejemplos" | "casos" | "curiosidades"
  >("conceptos");
  const [ejemploIndex, setEjemploIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<number | null>(0);

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

  const handleSelectDifficulty = (level: string) => {
    setSelectedDifficulty(level);
    setDetailView("exercises");
    setPage(1);
  };

  const handleStartExercise = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    setDetailView("solving");
  };

  const handleStartSocratic = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    setDetailView("socratic");
  };

  const handleBack = () => {
    if (detailView === "solving" || detailView === "socratic") {
      setDetailView("exercises");
    } else if (detailView === "exercises") {
      setSelectedDifficulty(null);
      setDetailView("overview");
    }
  };

  const currentEx = filteredExercises[currentExIndex];

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
    return (
      <ExerciseSolvingView
        exercise={currentEx}
        exercises={filteredExercises}
        currentIndex={currentExIndex}
        topicName={topic.name}
        score={score}
        onScoreChange={(delta) => setScore((s) => s + delta)}
        onNextExercise={() => {
          if (currentExIndex < filteredExercises.length - 1) {
            setCurrentExIndex((i) => i + 1);
          }
        }}
        onStartSocratic={handleStartSocratic}
        onBack={handleBack}
      />
    );
  }

  // ─── Topic Detail: Exercises List (Paginated) ────
  if (id && topic && detailView === "exercises" && selectedDifficulty) {
    const diffConfig = DIFF_CONFIG.find((d) => d.level === selectedDifficulty)!;

    return (
      <ExerciseListView
        exercises={filteredExercises}
        topicId={topic.id}
        topicName={topic.name}
        difficulty={selectedDifficulty}
        diffLabel={diffConfig.label}
        diffIcon={diffConfig.icon}
        score={score}
        page={page}
        onPageChange={setPage}
        onStartExercise={handleStartExercise}
        onStartSocratic={handleStartSocratic}
        onExerciseAdded={(newEx) => {
          setTopic((prev: any) => ({
            ...prev,
            exercises: [...(prev.exercises || []), newEx],
          }));
        }}
        onBack={handleBack}
      />
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
                {docsTab === "conceptos" &&
                  (() => {
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
                          const headingMatch =
                            section.match(/^(#{1,3})\s+(.+)/);
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

                {docsTab === "ejemplos" &&
                  (() => {
                    const ejemplos = topicDocs.ejemplos || [];
                    if (ejemplos.length === 0) {
                      return (
                        <p className="text-gray-400 dark:text-gray-500 text-sm">
                          No hay ejemplos disponibles.
                        </p>
                      );
                    }
                    const safeIndex = Math.min(
                      ejemploIndex,
                      ejemplos.length - 1,
                    );
                    const ej = ejemplos[safeIndex];

                    return (
                      <div>
                        {/* Carousel controls */}
                        <div className="flex items-center justify-between mb-3">
                          <button
                            onClick={() =>
                              setEjemploIndex((i) => Math.max(0, i - 1))
                            }
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
                            onClick={() =>
                              setEjemploIndex((i) =>
                                Math.min(ejemplos.length - 1, i + 1),
                              )
                            }
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
                            if (e.key === "ArrowLeft")
                              setEjemploIndex((i) => Math.max(0, i - 1));
                            if (e.key === "ArrowRight")
                              setEjemploIndex((i) =>
                                Math.min(ejemplos.length - 1, i + 1),
                              );
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

                return (
                  <button
                    key={level}
                    onClick={() => handleSelectDifficulty(level)}
                    className={`rounded-xl p-6 border-2 ${DIFFICULTY_COLOR_CLASSES[color]} hover:shadow-lg transition-all text-center`}>
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
  const [searchTopic, setSearchTopic] = useState("");
  const filteredTopics = searchTopic.trim()
    ? topics.filter((t) =>
        t.name.toLowerCase().includes(searchTopic.trim().toLowerCase()),
      )
    : topics;

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

      {/* Búsqueda de temas */}
      <div className="relative">
        <input
          type="text"
          value={searchTopic}
          onChange={(e) => setSearchTopic(e.target.value)}
          placeholder="Buscar tema..."
          className="w-full sm:w-80 px-4 py-2 pl-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
        />
        <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTopics.map((t) => (
          <TopicCard
            key={t.id}
            id={t.id}
            name={t.name}
            exerciseCount={t.exercises?.length || 0}
          />
        ))}
        {filteredTopics.length === 0 && searchTopic.trim() && (
          <p className="text-gray-500 dark:text-gray-400 col-span-full text-center py-8">
            No se encontraron temas para "{searchTopic}"
          </p>
        )}
      </div>
    </div>
  );
}
