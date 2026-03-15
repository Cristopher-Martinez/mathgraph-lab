import { useEffect, useState } from "react";
import { api } from "../services/api";

interface TrainingConfig {
  topicSelection: "manual" | "dag" | "recent";
  topicIds?: number[];
  dagRootTopicId?: number;
  recentWindow?: "week" | "month" | "semester";
  pattern?: string;
  difficultyMode: "easy" | "mixed" | "progressive";
  exercisesPerTopic: number;
  timed: boolean;
  timePerExercise?: number;
  socratic: boolean;
}

interface Props {
  onStart: (config: TrainingConfig) => void;
  resumePrompt: any;
  onResume: () => void;
  onDismissResume: () => void;
}

const PATTERNS = [
  { value: "", label: "Cualquiera" },
  { value: "factorizacion", label: "Factorización" },
  { value: "despeje", label: "Despeje" },
  { value: "sustitucion", label: "Sustitución" },
  { value: "valor_absoluto", label: "Valor absoluto" },
  { value: "completar_cuadrado", label: "Completar cuadrado" },
  { value: "producto_notable", label: "Producto notable" },
  { value: "racionalizacion", label: "Racionalización" },
  { value: "cambio_de_variable", label: "Cambio de variable" },
];

export default function TrainingConfig({
  onStart,
  resumePrompt,
  onResume,
  onDismissResume,
}: Props) {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Config state
  const [topicSelection, setTopicSelection] = useState<
    "manual" | "dag" | "recent"
  >("manual");
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [dagRootTopicId, setDagRootTopicId] = useState<number | null>(null);
  const [dagPrereqs, setDagPrereqs] = useState<any>(null);
  const [recentWindow, setRecentWindow] = useState<
    "week" | "month" | "semester"
  >("week");
  const [recentTopics, setRecentTopics] = useState<any[]>([]);
  const [pattern, setPattern] = useState("");
  const [difficultyMode, setDifficultyMode] = useState<
    "easy" | "mixed" | "progressive"
  >("mixed");
  const [exercisesPerTopic, setExercisesPerTopic] = useState(5);
  const [timed, setTimed] = useState(false);
  const [timePerExercise, setTimePerExercise] = useState(90);
  const [socratic, setSocratic] = useState(false);

  useEffect(() => {
    api
      .getTopics()
      .then(setTopics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch DAG prerequisites when root topic changes
  useEffect(() => {
    if (topicSelection === "dag" && dagRootTopicId) {
      api
        .getPrerequisites(dagRootTopicId)
        .then(setDagPrereqs)
        .catch(() => setDagPrereqs(null));
    }
  }, [dagRootTopicId, topicSelection]);

  // Fetch recent topics when window changes
  useEffect(() => {
    if (topicSelection === "recent") {
      api
        .getTopicsByWindow(recentWindow)
        .then(setRecentTopics)
        .catch(() => setRecentTopics([]));
    }
  }, [recentWindow, topicSelection]);

  const toggleTopic = (id: number) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const canStart = () => {
    if (topicSelection === "manual") return selectedTopicIds.length > 0;
    if (topicSelection === "dag") return !!dagRootTopicId;
    if (topicSelection === "recent") return recentTopics.length > 0;
    return false;
  };

  const handleStart = () => {
    const config: TrainingConfig = {
      topicSelection,
      difficultyMode,
      exercisesPerTopic,
      timed: timed && !socratic,
      pattern: pattern || undefined,
      timePerExercise: timed && !socratic ? timePerExercise : undefined,
      socratic,
    };
    if (topicSelection === "manual") config.topicIds = selectedTopicIds;
    if (topicSelection === "dag") config.dagRootTopicId = dagRootTopicId!;
    if (topicSelection === "recent") config.recentWindow = recentWindow;
    onStart(config);
  };

  if (loading) {
    return (
      <div className="text-gray-500 dark:text-gray-400">Cargando temas...</div>
    );
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* Resume prompt */}
      {resumePrompt && (
        <div className="bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="font-medium text-indigo-800 dark:text-indigo-300">
              Tienes una sesión en progreso
            </p>
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              {resumePrompt.exercisesCompleted || 0} ejercicios completados
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onResume}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
              Continuar
            </button>
            <button
              onClick={onDismissResume}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">
              Nueva sesión
            </button>
          </div>
        </div>
      )}

      <h1 className="text-xl font-bold dark:text-gray-100">
        Configurar Entrenamiento
      </h1>

      {/* Topic Selection */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Temas</h2>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["manual", "Selección manual"],
              ["dag", "Desde el DAG"],
              ["recent", "Clases recientes"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTopicSelection(val)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                topicSelection === val
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Manual selection */}
        {topicSelection === "manual" && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {topics.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTopic(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedTopicIds.includes(t.id)
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-400"
                    : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300"
                }`}>
                {t.name}
              </button>
            ))}
            {topics.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay temas disponibles. Registra una clase primero.
              </p>
            )}
          </div>
        )}

        {/* DAG selection */}
        {topicSelection === "dag" && (
          <div className="space-y-2 pt-1">
            <select
              value={dagRootTopicId || ""}
              onChange={(e) =>
                setDagRootTopicId(
                  e.target.value ? parseInt(e.target.value) : null,
                )
              }
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
              <option value="">Seleccionar tema objetivo...</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {dagPrereqs && (
              <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300 mb-2">
                  Temas incluidos ({dagPrereqs.allTopicIds.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dagPrereqs.prerequisites.map((p: any) => (
                    <span
                      key={p.id}
                      className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded">
                      {p.name}
                    </span>
                  ))}
                  {dagPrereqs.target && (
                    <span className="text-xs px-2 py-1 bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 rounded font-medium">
                      {dagPrereqs.target.name} (objetivo)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent classes */}
        {topicSelection === "recent" && (
          <div className="space-y-2 pt-1">
            <div className="flex gap-1.5">
              {(
                [
                  ["week", "Última semana"],
                  ["month", "Último mes"],
                  ["semester", "Semestre"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRecentWindow(val)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    recentWindow === val
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {recentTopics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recentTopics.map((t) => (
                  <span
                    key={t.id}
                    className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                    {t.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay clases registradas en este periodo.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Pattern */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Patrón de resolución{" "}
          <span className="text-xs font-normal">(opcional)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {PATTERNS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPattern(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pattern === p.value
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Difficulty */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dificultad</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(
            [
              [
                "easy",
                "Fácil",
                "Todos los ejercicios en dificultad baja",
                "text-green-600 dark:text-green-400",
              ],
              [
                "mixed",
                "Mixto",
                "40% fácil, 40% medio, 20% difícil",
                "text-amber-600 dark:text-amber-400",
              ],
              [
                "progressive",
                "Progresivo",
                "Sube con aciertos, baja con errores",
                "text-rose-600 dark:text-rose-400",
              ],
            ] as const
          ).map(([val, label, desc, color]) => (
            <button
              key={val}
              onClick={() => setDifficultyMode(val)}
              className={`p-3 rounded-lg text-left transition-all border-2 ${
                difficultyMode === val
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
              }`}>
              <p className={`text-sm font-semibold ${color}`}>{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {desc}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Exercises per topic + timer + socratic */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <section className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Ejercicios/tema
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="3"
              max="10"
              value={exercisesPerTopic}
              onChange={(e) => setExercisesPerTopic(parseInt(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 w-6 text-center">
              {exercisesPerTopic}
            </span>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Contrarreloj
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={timed}
                onChange={(e) => {
                  setTimed(e.target.checked);
                  if (e.target.checked) setSocratic(false);
                }}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm dark:text-gray-300">Activar</span>
            </label>
            {timed && (
              <select
                value={timePerExercise}
                onChange={(e) => setTimePerExercise(parseInt(e.target.value))}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm dark:text-gray-100">
                <option value="60">60s</option>
                <option value="90">90s</option>
                <option value="120">120s</option>
                <option value="180">180s</option>
                <option value="300">300s</option>
              </select>
            )}
          </div>
        </section>

        <section
          className={`bg-white dark:bg-gray-800 rounded-lg p-3 border space-y-2 transition-all ${
            socratic
              ? "border-purple-400 dark:border-purple-600 ring-1 ring-purple-300 dark:ring-purple-700"
              : "border-gray-200 dark:border-gray-700"
          }`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Socrático
          </h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={socratic}
              onChange={(e) => {
                setSocratic(e.target.checked);
                if (e.target.checked) setTimed(false);
              }}
              className="w-4 h-4 accent-purple-600"
            />
            <span className="text-sm dark:text-gray-300">Activar</span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            El tutor te guía paso a paso con preguntas y pistas.
          </p>
        </section>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart()}
        className={`w-full py-3 rounded-lg text-base font-bold transition-all ${
          canStart()
            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg"
            : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed"
        }`}>
        Iniciar Entrenamiento
      </button>
    </div>
  );
}
