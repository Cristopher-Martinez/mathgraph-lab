import { useEffect, useState } from "react";
import {
  useGeneration,
  type GenerationStatus,
} from "../context/GenerationContext";

export default function GenerationStatusPanel() {
  const { generations } = useGeneration();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [autoDismiss, setAutoDismiss] = useState<Set<string>>(new Set());

  // Mostrar las generaciones activas o recién terminadas (no dismisseadas)
  const visible = Array.from(generations.values()).filter(
    (g) => !dismissed.has(`${g.type}:${g.classId}`),
  );

  // Auto-dismiss tras 8s cuando completa
  useEffect(() => {
    for (const g of visible) {
      const key = `${g.type}:${g.classId}`;
      if (
        (g.status === "done" || g.status === "error") &&
        !autoDismiss.has(key)
      ) {
        setAutoDismiss((prev) => new Set(prev).add(key));
        setTimeout(() => {
          setDismissed((prev) => new Set(prev).add(key));
        }, 8000);
      }
    }
  }, [visible, autoDismiss]);

  if (visible.length === 0) return null;

  // Mostrar la primera generación activa como principal
  const primary: GenerationStatus =
    visible.find((g) => g.status === "running") || visible[0];

  const steps = primary.steps || [];
  const isRunning = primary.status === "running";
  const isDone = primary.status === "done";
  const isError = primary.status === "error";
  const completedSteps = steps.filter((s) => s.status === "done").length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const currentStep = steps.find((s) => s.status === "running");
  const typeLabel = primary.type === "notes" ? "apuntes" : "clase";

  return (
    <div
      className={`border-t transition-all duration-300 ${
        isError
          ? "bg-red-50 dark:bg-red-950/80 border-red-300 dark:border-red-800"
          : isDone
            ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800"
            : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-800"
      }`}>
      {/* Progress bar */}
      {isRunning && (
        <div className="h-0.5 bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-indigo-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Main footer bar */}
      <div className="flex items-center gap-3 px-5 py-2">
        {/* Status icon */}
        {isRunning && (
          <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
          </div>
        )}
        {isDone && (
          <span className="text-emerald-500 text-sm flex-shrink-0">✓</span>
        )}
        {isError && (
          <span className="text-red-500 text-sm flex-shrink-0">✗</span>
        )}

        {/* Status text */}
        <span
          className={`text-xs font-medium truncate ${
            isError
              ? "text-red-700 dark:text-red-300"
              : isDone
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-gray-700 dark:text-gray-200"
          }`}>
          {isRunning
            ? currentStep
              ? `[${typeLabel}] ${currentStep.label}`
              : `Generando ${typeLabel}...`
            : isDone
              ? `Generación de ${typeLabel} completada`
              : `Error en generación de ${typeLabel}`}
        </span>

        {/* Active count */}
        {visible.filter((g) => g.status === "running").length > 1 && (
          <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex-shrink-0">
            +{visible.filter((g) => g.status === "running").length - 1} más
          </span>
        )}

        {/* Step counter */}
        {totalSteps > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
            {completedSteps}/{totalSteps}
          </span>
        )}

        <div className="flex-1" />

        {/* Error detail */}
        {isError && primary.error && (
          <span className="text-[11px] text-red-500 dark:text-red-400 truncate max-w-[200px]">
            {primary.error}
          </span>
        )}

        {/* Expand/collapse */}
        {steps.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5"
            aria-label={expanded ? "Colapsar" : "Expandir"}>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={() =>
            setDismissed(
              (prev) =>
                new Set(
                  [...prev].concat(
                    visible.map((g) => `${g.type}:${g.classId}`),
                  ),
                ),
            )
          }
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5"
          aria-label="Cerrar">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Expandable steps detail */}
      {expanded && steps.length > 0 && (
        <div className="px-5 pb-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span className="flex-shrink-0">
                {step.status === "done" && (
                  <span className="text-emerald-500">✓</span>
                )}
                {step.status === "running" && (
                  <span className="inline-block animate-spin text-indigo-500">
                    ⟳
                  </span>
                )}
                {step.status === "pending" && (
                  <span className="text-gray-300 dark:text-gray-600">○</span>
                )}
                {step.status === "error" && (
                  <span className="text-red-500">✗</span>
                )}
              </span>
              <span
                className={`${
                  step.status === "done"
                    ? "text-gray-500 dark:text-gray-400"
                    : step.status === "running"
                      ? "text-gray-800 dark:text-gray-100 font-medium"
                      : step.status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-400 dark:text-gray-500"
                }`}>
                {step.label}
              </span>
              {step.detail && step.status === "done" && (
                <span className="text-gray-400 dark:text-gray-500">
                  {step.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
