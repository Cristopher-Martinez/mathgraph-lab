import { useState } from "react";
import { api } from "../services/api";
import { ITEMS_PER_PAGE } from "../utils/exerciseConstants";
import MarkdownLatex from "./MarkdownLatex";

interface ExerciseListViewProps {
  exercises: any[];
  topicId?: number;
  topicName: string;
  difficulty: string;
  diffLabel: string;
  diffIcon: string;
  score: number;
  page: number;
  onPageChange: (page: number) => void;
  onStartExercise: (index: number) => void;
  onStartSocratic: (index: number) => void;
  onExerciseAdded?: (exercise: any) => void;
  onBack: () => void;
}

export function ExerciseListView({
  exercises,
  topicId,
  topicName,
  difficulty,
  diffLabel,
  diffIcon,
  score,
  page,
  onPageChange,
  onStartExercise,
  onStartSocratic,
  onExerciseAdded,
  onBack,
}: ExerciseListViewProps) {
  const [generating, setGenerating] = useState(false);

  const totalPages = Math.ceil(exercises.length / ITEMS_PER_PAGE);
  const paginated = exercises.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const handleGenerate = async () => {
    if (!topicId || generating) return;
    setGenerating(true);
    try {
      const newEx = await api.generateOneExercise(topicId, difficulty);
      onExerciseAdded?.(newEx);
    } catch {
      // silently fail
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
        ← Volver a dificultad
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {topicName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {diffIcon} {diffLabel}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              • {exercises.length} ejercicios
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Puntaje: {score}
          </span>
          {topicId && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
              {generating ? (
                <>
                  <span className="animate-spin w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full" />
                  Generando...
                </>
              ) : (
                <>✨ Generar ejercicio</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Lista de ejercicios */}
      <div className="space-y-2">
        {paginated.map((ex: any, i: number) => {
          const globalIndex = (page - 1) * ITEMS_PER_PAGE + i;
          return (
            <div
              key={ex.id}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all flex items-center justify-between group">
              <button
                onClick={() => onStartExercise(globalIndex)}
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
                  onClick={() => onStartSocratic(globalIndex)}
                  title="Iniciar en modo Socrático"
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors flex items-center gap-1">
                  🧠 Socrático
                </button>
                <span
                  className="text-indigo-500 dark:text-indigo-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-sm cursor-pointer"
                  onClick={() => onStartExercise(globalIndex)}>
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
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            ← Anterior
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}>
              {p}
            </button>
          ))}
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
