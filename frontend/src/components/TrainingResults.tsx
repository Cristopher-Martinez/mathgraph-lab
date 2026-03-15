import MarkdownLatex from "./MarkdownLatex";

interface TrainingMetrics {
  totalExercises: number;
  correctCount: number;
  accuracy: number;
  avgTimePerExercise: number;
  errorsByTopic: Record<string, number>;
  errorsByDifficulty: Record<string, number>;
  hintsUsed: number;
  socraticScore: number;
  difficultyProgression: string[];
  timeouts: number;
}

interface Props {
  session: any;
  onRestart: () => void;
}

export default function TrainingResults({ session, onRestart }: Props) {
  const metrics: TrainingMetrics = session.metrics || {
    totalExercises: 0,
    correctCount: 0,
    accuracy: 0,
    avgTimePerExercise: 0,
    errorsByTopic: {},
    errorsByDifficulty: {},
    hintsUsed: 0,
    socraticScore: 0,
    difficultyProgression: [],
    timeouts: 0,
  };
  const results: Array<{
    correct: boolean;
    question: string;
    timeout?: boolean;
  }> = session.results || [];
  const topics: Array<{ id: number; name: string }> = session.topics || [];

  const correctCount = metrics.correctCount;
  const total = metrics.totalExercises || results.length || 1;
  const pct = Math.round((correctCount / total) * 100);

  // Per-topic accuracy
  const topicStats = topics
    .map((t) => {
      const topicResults = results.filter((r) => {
        const ex = (session.exercises || []).find(
          (e: any) => (e.latex || e.pregunta) === r.question,
        );
        return ex?.topicId === t.id || ex?.topic?.name === t.name;
      });
      const topicCorrect = topicResults.filter((r) => r.correct).length;
      const topicTotal = topicResults.length;
      return {
        name: t.name,
        correct: topicCorrect,
        total: topicTotal,
        pct: topicTotal > 0 ? Math.round((topicCorrect / topicTotal) * 100) : 0,
      };
    })
    .filter((s) => s.total > 0);

  // Final difficulty
  const diffProg = metrics.difficultyProgression || [];
  const finalDifficulty =
    diffProg.length > 0 ? diffProg[diffProg.length - 1] : "facil";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">
        ¡Entrenamiento Completado!
      </h1>

      {/* Score */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700 text-center">
        {session.config?.socratic && (metrics.socraticScore || session.socraticTotalScore) ? (
          <>
            <div className="text-6xl font-bold text-purple-600 dark:text-purple-400">
              {metrics.socraticScore || session.socraticTotalScore || 0}
            </div>
            <p className="text-2xl font-semibold mt-1 dark:text-gray-300">puntos</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {correctCount}/{total} ejercicios completados ({pct}%)
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {(metrics.socraticScore || session.socraticTotalScore || 0) >= total * 80
                ? "🏆 ¡Rendimiento excepcional!"
                : (metrics.socraticScore || session.socraticTotalScore || 0) >= total * 50
                  ? "🌟 ¡Muy buen trabajo!"
                  : "💪 Sigue practicando — ¡mejorarás!"}
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">
              {correctCount}/{total}
            </div>
            <p className="text-2xl font-semibold mt-1 dark:text-gray-300">{pct}%</p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {pct === 100
                ? "¡Puntuación perfecta!"
                : pct >= 80
                  ? "¡Excelente trabajo!"
                  : pct >= 50
                    ? "¡Buen trabajo! Sigue practicando."
                    : "Sigue estudiando — ¡tú puedes!"}
            </p>
          </>
        )}
      </div>

      {/* Per-topic accuracy */}
      {topicStats.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold dark:text-gray-200">
            Rendimiento por tema
          </h2>
          {topicStats.map((ts) => (
            <div key={ts.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="dark:text-gray-300">{ts.name}</span>
                <span className="dark:text-gray-400">
                  {ts.correct}/{ts.total} ({ts.pct}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    ts.pct >= 80
                      ? "bg-green-500"
                      : ts.pct >= 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${ts.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Tiempo promedio"
          value={
            metrics.avgTimePerExercise > 0
              ? `${Math.round(metrics.avgTimePerExercise / 1000)}s`
              : "-"
          }
        />
        <StatCard label="Pistas usadas" value={String(metrics.hintsUsed)} />
        {session.config?.socratic && (
          <StatCard label="Puntaje socrático" value={`${metrics.socraticScore || session.socraticTotalScore || 0} pts`} />
        )}
        <StatCard label="Timeouts" value={String(metrics.timeouts)} />
        <StatCard
          label="Dificultad final"
          value={
            finalDifficulty === "facil"
              ? "★ Fácil"
              : finalDifficulty === "medio"
                ? "★★ Medio"
                : "★★★ Difícil"
          }
        />
      </div>

      {/* Exercise results list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 space-y-2">
        <h2 className="font-semibold dark:text-gray-200 mb-3">
          Detalle por ejercicio
        </h2>
        {results.map((r, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border flex items-start gap-2 ${
              r.correct
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
            }`}>
            <span className="mt-0.5">
              {r.timeout ? "⏱" : r.correct ? "✓" : "✗"}
            </span>
            <span className="font-mono text-sm flex-1 dark:text-gray-300">
              <MarkdownLatex content={r.question} />
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRestart}
          className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
          Entrenar de nuevo
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold dark:text-gray-200 mt-1">{value}</p>
    </div>
  );
}
