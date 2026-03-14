import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DAGGraph from "../components/DAGGraph";
import { api } from "../services/api";

export default function DAGPage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetPositions, setResetPositions] = useState(false);
  const [extending, setExtending] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [extendResult, setExtendResult] = useState<any>(null);
  const [auditResult, setAuditResult] = useState<any>(null);

  const handleExtend = async () => {
    setExtending(true);
    setExtendResult(null);
    setAuditResult(null);
    setResetPositions(true);
    try {
      const result = await api.extendDAG();
      setExtendResult(result);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setExtendResult({ error: err.message || "Error al extender el DAG" });
    } finally {
      setExtending(false);
      setTimeout(() => setResetPositions(false), 100);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    setAuditResult(null);
    setExtendResult(null);
    setResetPositions(true);
    try {
      const result = await api.auditDAG();
      setAuditResult(result);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setAuditResult({ error: err.message || "Error al auditar el DAG" });
    } finally {
      setAuditing(false);
      setTimeout(() => setResetPositions(false), 100);
    }
  };

  const handleOrganize = () => {
    setExtendResult(null);
    setAuditResult(null);
    setResetPositions(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setResetPositions(false), 100);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">
            DAG de Aprendizaje
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Visualiza las dependencias entre temas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOrganize}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors flex items-center gap-1.5 text-sm">
            📐 Organizar
          </button>
          <button
            onClick={handleAudit}
            disabled={auditing || extending}
            className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-1.5 text-sm">
            {auditing ? (
              <>
                <span className="animate-spin">⚙️</span> Auditando...
              </>
            ) : (
              <>🔍 Auditar</>
            )}
          </button>
          <button
            onClick={handleExtend}
            disabled={extending || auditing}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-1.5 text-sm">
            {extending ? (
              <>
                <span className="animate-spin">⚙️</span> Analizando...
              </>
            ) : (
              <>🧩 Complementar</>
            )}
          </button>
        </div>
      </div>

      {extendResult && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            extendResult.error
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
              : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
          }`}>
          {extendResult.error ? (
            <span>Error: {extendResult.error}</span>
          ) : (
            <div>
              <strong>DAG extendido exitosamente:</strong>
              <ul className="mt-1 list-disc list-inside">
                <li>
                  {extendResult.newTopics?.length || 0} temas prerrequisito
                  agregados
                  {extendResult.newTopics?.length > 0 && (
                    <span className="text-xs ml-1">
                      (
                      {extendResult.newTopics
                        .map((t: any) => t.name)
                        .join(", ")}
                      )
                    </span>
                  )}
                </li>
                <li>{extendResult.newDependencies || 0} nuevas dependencias</li>
                <li>
                  {extendResult.newExercises || 0} ejercicios generados para los
                  nuevos temas
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {auditResult && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            auditResult.error
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
              : auditResult.orphanCount > 0
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
          }`}>
          {auditResult.error ? (
            <span>Error: {auditResult.error}</span>
          ) : (
            <div>
              <strong>
                {auditResult.orphanCount === 0 ? "✓ " : "⚠ "}
                {auditResult.message}
              </strong>
              {auditResult.orphanCount > 0 &&
                auditResult.orphans?.length > 0 && (
                  <p className="mt-1 text-xs">
                    Huérfanos restantes: {auditResult.orphans.join(", ")}
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      <DAGGraph
        onNodeClick={(id) => navigate(`/topics/${id}`)}
        refreshKey={refreshKey}
        resetPositions={resetPositions}
      />

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
        <span className="text-base">💡</span>
        <span>
          <strong>Organizar</strong> reorganiza el DAG por jerarquía minimizando
          cruces de conexiones. <strong>Auditar DAG</strong> detecta y conecta
          temas huérfanos. <strong>Complementar DAG</strong> encuentra
          prerrequisitos más profundos y genera ejercicios nuevos. Los nodos con
          borde rojo punteado son huérfanos sin conexión.
        </span>
      </div>
    </div>
  );
}
