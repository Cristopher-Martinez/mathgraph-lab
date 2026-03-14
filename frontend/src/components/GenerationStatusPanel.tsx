import { useEffect, useState } from "react";
import { api } from "../services/api";

interface GenerationStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

interface GenerationStatus {
  classId: number;
  status: "running" | "done" | "error" | "none";
  steps?: GenerationStep[];
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export default function GenerationStatusPanel({
  classId,
  onDone,
}: {
  classId: number | null;
  onDone?: () => void;
}) {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!classId) return;
    setDismissed(false);
    setVisible(true);
    setExpanded(false);

    const poll = setInterval(async () => {
      try {
        const data = await api.getGenerationStatus(classId);
        if (data.status === "none") return;
        setStatus(data);

        if (data.status === "done" || data.status === "error") {
          clearInterval(poll);
          if (data.status === "done") {
            onDone?.();
            setTimeout(() => setVisible(false), 6000);
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 1500);

    return () => clearInterval(poll);
  }, [classId]);

  if (!visible || dismissed || !classId) return null;

  const steps = status?.steps || [];
  const isRunning = status?.status === "running";
  const isDone = status?.status === "done";
  const isError = status?.status === "error";
  const completedSteps = steps.filter((s) => s.status === "done").length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const currentStep = steps.find((s) => s.status === "running");

  return (
    <div
      className={`border-t transition-all duration-300 ${
        isError
          ? "bg-red-50 dark:bg-red-950/80 border-red-300 dark:border-red-800"
          : isDone
            ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800"
            : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-800"
      }`}>
      {/* Progress bar - always on top */}
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
              ? currentStep.label
              : "Generando contenido..."
            : isDone
              ? "Generación completada — ejercicios disponibles"
              : "Error en generación"}
        </span>

        {/* Step counter */}
        {totalSteps > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
            {completedSteps}/{totalSteps}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Error detail */}
        {isError && status?.error && (
          <span className="text-[11px] text-red-500 dark:text-red-400 truncate max-w-[200px]">
            {status.error}
          </span>
        )}

        {/* Expand/collapse button */}
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

        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
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
        <div className="px-5 pb-2.5 pt-0 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200/50 dark:border-gray-700/50 pt-2">
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
