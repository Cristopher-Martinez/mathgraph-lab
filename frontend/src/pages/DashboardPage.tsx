import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Latex from "../components/Latex";
import TopicCard from "../components/TopicCard";
import { api } from "../services/api";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState<any>(null);
  const [dueReviews, setDueReviews] = useState<any[]>([]);

  useEffect(() => {
    api.getTopics().then(setTopics).catch(() => {});
    api.getProgress().then(setProgress).catch(() => {});
    api.getFormulas().then(setFormulas).catch(() => {});
    api.getReviewStats().then(setReviewStats).catch(() => {});
    api.getDueReviews().then((r) => setDueReviews(r.slice(0, 5))).catch(() => {});
  }, []);

  const completedCount = progress.filter((p) => p.completed).length;
  const totalTopics = topics.length;
  const pct =
    totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Panel Principal
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Bienvenido a MathGraph Lab
        </p>
      </div>

      {/* Resumen de Progreso */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-semibold">Resumen de Progreso</h2>
        <div className="mt-4 flex items-center gap-6">
          <div className="text-4xl font-bold">{pct}%</div>
          <div className="flex-1">
            <div className="w-full bg-white/30 rounded-full h-3">
              <div
                className="bg-white h-3 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-indigo-100">
              {completedCount} de {totalTopics} temas completados
            </p>
          </div>
        </div>
      </div>

      {/* Repaso Pendiente (Spaced Repetition) */}
      {reviewStats && reviewStats.dueToday > 0 && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                🔁 Repasos Pendientes
              </h2>
              <p className="text-amber-100 text-sm mt-1">
                {reviewStats.dueToday} ejercicio(s) para repasar hoy •{" "}
                {reviewStats.mastered} dominado(s)
              </p>
            </div>
            <button
              onClick={() => navigate("/practice")}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
              Repasar ahora
            </button>
          </div>
          {dueReviews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {dueReviews.map((r: any) => (
                <span
                  key={r.exerciseId}
                  className="text-xs bg-white/15 rounded-full px-3 py-1">
                  {r.exercise?.topic?.name || "Tema"} — Intervalo {r.interval}d
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid de Temas */}
      <div>
        <h2 className="text-xl font-semibold mb-4 dark:text-gray-100">Temas</h2>
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

      {/* Fórmulas Destacadas */}
      <div>
        <h2 className="text-xl font-semibold mb-4 dark:text-gray-100">
          Fórmulas Clave
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {formulas.slice(0, 6).map((f: any) => (
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
    </div>
  );
}
