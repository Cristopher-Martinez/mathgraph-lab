import { useState } from "react";
import MarkdownLatex from "../components/MarkdownLatex";
import { api } from "../services/api";

export default function AITutorPage() {
  const [problem, setProblem] = useState("");
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<
    Array<{ problem: string; explanation: string }>
  >([]);

  const handleExplain = async () => {
    if (!problem.trim()) return;
    setLoading(true);
    setExplanation("");
    try {
      const res = await api.explain(problem.trim());
      setExplanation(res.explanation);
      setHistory((h) => [
        { problem: problem.trim(), explanation: res.explanation },
        ...h,
      ]);
    } catch (err: any) {
      setExplanation(
        "Error: " + (err.message || "No se pudo obtener la explicación."),
      );
    } finally {
      setLoading(false);
    }
  };

  const quickProblems = [
    "|x - 5| ≤ 3",
    "x² - 5x + 6 ≤ 0",
    "Encuentra la distancia entre (1,2) y (4,6)",
    "Encuentra la pendiente de la recta que pasa por (-1,4) y (3,8)",
    "Encuentra la ecuación de la recta que pasa por (2,3) y (6,5)",
  ];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Tutor IA</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Pide al tutor IA que explique cualquier problema paso a paso.
        </p>
      </div>

      {/* Problemas rápidos */}
      <div className="flex flex-wrap gap-2">
        {quickProblems.map((qp, i) => (
          <button
            key={i}
            onClick={() => setProblem(qp)}
            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition">
            {qp}
          </button>
        ))}
      </div>

      {/* Entrada */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleExplain()}
          placeholder="Escribe un problema matemático..."
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={handleExplain}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
          {loading ? "Pensando..." : "Explicar"}
        </button>
      </div>

      {/* Explicación actual */}
      {explanation && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-lg mb-3 dark:text-gray-100">
            Explicación
          </h2>
          <div className="text-gray-700 dark:text-gray-300">
            <MarkdownLatex content={explanation} />
          </div>
        </div>
      )}

      {/* Historial */}
      {history.length > 1 && (
        <div>
          <h2 className="font-semibold text-lg mb-3 dark:text-gray-100">
            Preguntas Anteriores
          </h2>
          <div className="space-y-3">
            {history.slice(1).map((h, i) => (
              <details
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                  {h.problem}
                </summary>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  <MarkdownLatex content={h.explanation} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
