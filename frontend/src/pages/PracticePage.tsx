import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ExerciseListView } from "../components/ExerciseListView";
import { ExerciseSolvingView } from "../components/ExerciseSolvingView";
import SocraticTutor from "../components/SocraticTutor";
import { api } from "../services/api";
import {
  DIFF_CONFIG,
  DIFFICULTY_COLOR_CLASSES,
} from "../utils/exerciseConstants";

type ViewMode =
  | "categories"
  | "difficulty"
  | "exercises"
  | "solving"
  | "socratic";
type PracticeMode = "standard" | "socratic";

interface CategoryFilter {
  topicName?: string;
  difficulty?: string;
}

export default function PracticePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [allExercises, setAllExercises] = useState<any[]>([]);
  const [classLogs, setClassLogs] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("categories");
  const [filter, setFilter] = useState<CategoryFilter>({});
  const [page, setPage] = useState(1);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("standard");
  const [socraticSummary, setSocraticSummary] = useState<any>(null);

  // Solving state
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [score, setScore] = useState(0);

  // Detectar ejercicio directo desde ClassLog
  useEffect(() => {
    const state = location.state as any;
    if (state?.exercise && state?.startSocratic) {
      // Agregar el ejercicio a la lista si no existe
      setAllExercises([state.exercise]);
      setCurrentExIndex(0);
      setView("socratic");
      // Limpiar el state para que no se repita en navegaciones futuras
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    api
      .getClassLogs()
      .then(setClassLogs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const topicId = searchParams.get("topicId");
    api
      .getExercises({
        topicId: topicId ? parseInt(topicId) : undefined,
        classId: selectedClassId ?? undefined,
      })
      .then((data) => {
        setAllExercises(data);
      })
      .catch(() => {});
  }, [searchParams, selectedClassId]);

  // Computed data
  const categories = groupBy(allExercises, (ex) => ex.topic?.name || "General");
  const filteredExercises = allExercises.filter((ex) => {
    if (filter.topicName && (ex.topic?.name || "General") !== filter.topicName)
      return false;
    if (filter.difficulty && ex.difficulty !== filter.difficulty) return false;
    return true;
  });

  const handleSelectCategory = (topicName: string) => {
    setFilter({ topicName });
    setView("difficulty");
    setPage(1);
  };

  const handleSelectDifficulty = (difficulty: string) => {
    setFilter((prev) => ({ ...prev, difficulty }));
    setView("exercises");
    setPage(1);
  };

  const handleStartExercise = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    if (practiceMode === "socratic") {
      setView("socratic");
      setSocraticSummary(null);
    } else {
      setView("solving");
    }
  };

  const handleStartSocratic = (exerciseIndex: number) => {
    setCurrentExIndex(exerciseIndex);
    setView("socratic");
    setSocraticSummary(null);
  };

  const handleBack = () => {
    if (view === "solving" || view === "socratic") {
      setView("exercises");
      setSocraticSummary(null);
    } else if (view === "exercises") {
      setFilter((prev) => ({ topicName: prev.topicName }));
      setView("difficulty");
    } else if (view === "difficulty") {
      setFilter({});
      setView("categories");
    }
  };

  const currentEx = filteredExercises[currentExIndex];

  const [searchPractice, setSearchPractice] = useState("");

  // ─── RENDER: Categories View ─────────────────────
  if (view === "categories") {
    const filteredCategories = searchPractice.trim()
      ? Object.fromEntries(
          Object.entries(categories).filter(([topicName]) =>
            topicName.toLowerCase().includes(searchPractice.trim().toLowerCase()),
          ),
        )
      : categories;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Práctica
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Selecciona una categoría para comenzar a practicar.
          </p>
        </div>

        {/* Filtro por clase */}
        {classLogs.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filtrar por clase:
            </label>
            <select
              value={selectedClassId ?? ""}
              onChange={(e) => {
                setSelectedClassId(
                  e.target.value ? parseInt(e.target.value) : null,
                );
                setFilter({});
                setView("categories");
              }}
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
                onClick={() => {
                  setSelectedClassId(null);
                  setFilter({});
                  setView("categories");
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                Limpiar filtro
              </button>
            )}
          </div>
        )}

        {/* Selector de modo */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
          <button
            onClick={() => setPracticeMode("standard")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              practiceMode === "standard"
                ? "bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            ✏️ Estándar
          </button>
          <button
            onClick={() => setPracticeMode("socratic")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              practiceMode === "socratic"
                ? "bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            🧠 Tutor Socrático
          </button>
        </div>

        {practiceMode === "socratic" && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <strong>Modo Tutor Socrático:</strong> El tutor te guiará con
            preguntas conceptuales paso a paso. No verás la solución
            directamente — aprenderás el razonamiento detrás de cada problema.
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <span className="text-base">💡</span>
          También puedes activar el modo socrático en cualquier ejercicio usando
          el badge{" "}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
            🧠 Socrático
          </span>{" "}
          en la lista o el botón en la vista de resolución.
        </div>

        {/* Búsqueda de categoría */}
        <div className="relative">
          <input
            type="text"
            value={searchPractice}
            onChange={(e) => setSearchPractice(e.target.value)}
            placeholder="Buscar tema..."
            className="w-full sm:w-80 px-4 py-2 pl-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(filteredCategories).map(([topicName, exercises]) => {
            const easy = exercises.filter(
              (e: any) => e.difficulty === "easy",
            ).length;
            const medium = exercises.filter(
              (e: any) => e.difficulty === "medium",
            ).length;
            const hard = exercises.filter(
              (e: any) => e.difficulty === "hard",
            ).length;

            return (
              <button
                key={topicName}
                onClick={() => handleSelectCategory(topicName)}
                className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-lg transition-all text-left group">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">📚</span>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {topicName}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {exercises.length} ejercicios disponibles
                </p>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
                    🟢 {easy}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                    🟡 {medium}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
                    🔴 {hard}
                  </span>
                </div>
              </button>
            );
          })}
          {Object.keys(filteredCategories).length === 0 && searchPractice.trim() && (
            <p className="text-gray-500 dark:text-gray-400 col-span-full text-center py-8">
              No se encontraron categorías para "{searchPractice}"
            </p>
          )}
        </div>

        {allExercises.length > 0 && (
          <div className="text-center text-sm text-gray-400 dark:text-gray-500 pt-4">
            Total: {allExercises.length} ejercicios • Puntaje acumulado: {score}
          </div>
        )}
      </div>
    );
  }

  // ─── RENDER: Difficulty Selection ────────────────
  if (view === "difficulty") {
    const typeExercises = allExercises.filter(
      (e) => (e.topic?.name || "General") === filter.topicName,
    );

    return (
      <div className="space-y-6">
        <button
          onClick={handleBack}
          className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
          ← Volver a categorías
        </button>

        <div className="flex items-center gap-3">
          <span className="text-3xl">📚</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {filter.topicName}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {typeExercises.length} ejercicios disponibles
            </p>
          </div>
        </div>

        <p className="text-gray-600 dark:text-gray-400">
          Selecciona el nivel de dificultad:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DIFF_CONFIG.map(({ level, label, color, icon, stars }) => {
            const count = typeExercises.filter(
              (e) => e.difficulty === level,
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
      </div>
    );
  }

  // ─── RENDER: Exercises List (Paginated) ──────────
  if (view === "exercises") {
    const diffConfig = DIFF_CONFIG.find((d) => d.level === filter.difficulty)!;
    const topicId =
      filteredExercises[0]?.topicId || filteredExercises[0]?.topic?.id;

    return (
      <ExerciseListView
        exercises={filteredExercises}
        topicId={topicId}
        topicName={filter.topicName || "General"}
        difficulty={filter.difficulty || "easy"}
        diffLabel={diffConfig.label}
        diffIcon={diffConfig.icon}
        score={score}
        page={page}
        onPageChange={setPage}
        onStartExercise={handleStartExercise}
        onStartSocratic={handleStartSocratic}
        onExerciseAdded={(newEx) => {
          setAllExercises((prev) => [...prev, newEx]);
        }}
        onBack={handleBack}
      />
    );
  }

  // ─── RENDER: Socratic Tutor View ──────────────────
  if (view === "socratic" && currentEx) {
    const socraticSteps =
      typeof currentEx.socratic === "string"
        ? (() => {
            try {
              return JSON.parse(currentEx.socratic);
            } catch {
              return [];
            }
          })()
        : currentEx.socratic || [];

    return (
      <SocraticTutor
        exercise={{ ...currentEx, socratic: socraticSteps }}
        onComplete={(summary) => {
          setSocraticSummary(summary);
          setScore((s) => s + Math.round(summary.score / 10));
        }}
        onBack={handleBack}
      />
    );
  }

  // ─── RENDER: Solving View ────────────────────────
  if (view === "solving" && currentEx) {
    return (
      <ExerciseSolvingView
        exercise={currentEx}
        exercises={filteredExercises}
        currentIndex={currentExIndex}
        topicName={filter.topicName || currentEx.topic?.name || "General"}
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

  // Fallback
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold dark:text-gray-100">Práctica</h1>
      <p className="text-gray-500 dark:text-gray-400">Cargando ejercicios...</p>
    </div>
  );
}

function groupBy(
  arr: any[],
  keyFn: (item: any) => string,
): Record<string, any[]> {
  return arr.reduce(
    (acc, item) => {
      const val = keyFn(item);
      if (!acc[val]) acc[val] = [];
      acc[val].push(item);
      return acc;
    },
    {} as Record<string, any[]>,
  );
}
