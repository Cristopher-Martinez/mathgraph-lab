import { useEffect, useState } from "react";
import { api } from "../services/api";
import { DIFF_CONFIG, NOTES_PER_PAGE, buildSolveParams } from "../utils/exerciseConstants";
import IntervalVisualizer from "./IntervalVisualizer";
import MarkdownLatex from "./MarkdownLatex";
import MathAnswerInput from "./MathAnswerInput";

interface ExerciseSolvingViewProps {
  exercise: any;
  exercises: any[];
  currentIndex: number;
  topicName: string;
  score: number;
  onScoreChange: (delta: number) => void;
  onNextExercise: () => void;
  onStartSocratic: (index: number) => void;
  onBack: () => void;
}

export function ExerciseSolvingView({
  exercise,
  exercises,
  currentIndex,
  topicName,
  score,
  onScoreChange,
  onNextExercise,
  onStartSocratic,
  onBack,
}: ExerciseSolvingViewProps) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<any>(null);
  const [solverResult, setSolverResult] = useState<any>(null);
  const [exerciseTips, setExerciseTips] = useState<any>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [notesPage, setNotesPage] = useState(0);

  const diffConfig = DIFF_CONFIG.find(
    (d) => d.level === exercise?.difficulty,
  );
  const topicFormulas = exercise?.topic?.formulas || [];

  // Reset state and load tips when exercise changes
  useEffect(() => {
    setAnswer("");
    setFeedback(null);
    setSolverResult(null);
    setExerciseTips(null);
    setNotesPage(0);
    if (exercise?.id) {
      setTipsLoading(true);
      api
        .getExerciseTips(exercise.id)
        .then(setExerciseTips)
        .catch(() => {})
        .finally(() => setTipsLoading(false));
    }
  }, [exercise?.id]);

  const handleSubmit = async () => {
    if (!exercise) return;
    setFeedback(null);
    setSolverResult(null);

    try {
      const solveParams = buildSolveParams(exercise);
      if (solveParams) {
        const result = await api.solveExercise(solveParams);
        setSolverResult(result);
      }
      const validation = await api.validateAnswer({
        userAnswer: answer.trim(),
        expectedAnswer: (exercise.steps || "").trim(),
        exercisePrompt: exercise.latex || exercise.prompt || "",
      });
      setFeedback({
        correct: validation.correct,
        expected: exercise.steps,
        aiFeedback: validation.feedback,
      });
      if (validation.correct) onScoreChange(1);
    } catch {
      setFeedback({ correct: false, error: "Error al verificar respuesta" });
    }
  };

  const handleShowSolution = async () => {
    if (!exercise) return;
    const solveParams = buildSolveParams(exercise);
    if (solveParams) {
      try {
        const result = await api.solveExercise(solveParams);
        setSolverResult(result);
      } catch {
        /* ignore */
      }
    }
    setFeedback({ correct: false, expected: exercise.steps, revealed: true });
  };

  const handleNext = () => {
    onNextExercise();
  };

  if (!exercise) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
        ← Volver a la lista
      </button>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {topicName}
        </h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Ejercicio {currentIndex + 1} de {exercises.length} • Puntaje: {score}
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all"
          style={{
            width: `${((currentIndex + 1) / exercises.length) * 100}%`,
          }}
        />
      </div>

      {/* Fórmulas del tema */}
      {topicFormulas.length > 0 && (
        <details className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-purple-800 dark:text-purple-200 select-none flex items-center gap-2">
            <span>📐</span> Fórmulas disponibles ({topicFormulas.length})
          </summary>
          <div className="px-4 pb-4 space-y-2 border-t border-purple-200 dark:border-purple-800 pt-3">
            {topicFormulas.map((f: any) => (
              <div
                key={f.id}
                className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-100 dark:border-purple-900">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  <MarkdownLatex content={f.latex} />
                </div>
                {f.explanation && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {f.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

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
                    📚 Notas del profesor (
                    {exerciseTips.classContext.length})
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
                              exerciseTips.classContext.length / NOTES_PER_PAGE,
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
            {exercise.topic?.name || topicName}
          </span>
          {diffConfig && (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium">
              {diffConfig.icon} {diffConfig.label}
            </span>
          )}
        </div>
        <div className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">
          <MarkdownLatex content={exercise.latex || exercise.question} />
        </div>

        <div className="flex gap-2">
          <MathAnswerInput
            value={answer}
            onChange={setAnswer}
            onSubmit={handleSubmit}
            expectedAnswer={exercise.steps}
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
          onClick={() => onStartSocratic(currentIndex)}
          className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/70 font-medium transition-colors flex items-center gap-1.5">
          🧠 Modo Socrático
        </button>
        {currentIndex < exercises.length - 1 && (
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors">
            Siguiente Ejercicio →
          </button>
        )}
      </div>
    </div>
  );
}
