import { useEffect, useState } from "react";
import ClassChatPanel from "../components/ClassChatPanel";
import { api } from "../services/api";

type ScopeType = "all" | "class" | "dateRange" | "preset";

interface ClassLogEntry {
  id: number;
  date: string;
  title?: string;
  summary: string;
}

export default function ChatPage() {
  const [scopeType, setScopeType] = useState<ScopeType>("all");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState<string>("");
  const [clases, setClases] = useState<ClassLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarClases();
  }, []);

  async function cargarClases() {
    try {
      const data = await api.getClassLogs();
      setClases(data);
    } catch (err) {
      console.error("Error al cargar clases:", err);
    } finally {
      setLoading(false);
    }
  }

  // Calcular fechas según preset
  useEffect(() => {
    if (preset && scopeType === "preset") {
      const now = new Date();
      let from = new Date();

      switch (preset) {
        case "week":
          from.setDate(now.getDate() - 7);
          break;
        case "month":
          from.setMonth(now.getMonth() - 1);
          break;
        case "semester":
          from.setMonth(now.getMonth() - 6);
          break;
        case "year":
          from.setFullYear(now.getFullYear() - 1);
          break;
      }

      setDateFrom(from.toISOString().split("T")[0]);
      setDateTo(now.toISOString().split("T")[0]);
    }
  }, [preset, scopeType]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterProps = {
    classId: scopeType === "class" ? selectedClassId : null,
    dateFrom:
      scopeType === "dateRange" || scopeType === "preset"
        ? dateFrom
        : undefined,
    dateTo:
      scopeType === "dateRange" || scopeType === "preset" ? dateTo : undefined,
  };

  // Label del filtro activo
  const filterLabel =
    scopeType === "all"
      ? "Todas las clases"
      : scopeType === "class" && selectedClassId
        ? `Clase #${selectedClassId}`
        : (scopeType === "preset" || scopeType === "dateRange") &&
            dateFrom &&
            dateTo
          ? `${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}`
          : "Todas las clases";

  return (
    <div className="mx-auto max-w-6xl h-[calc(100vh-5rem)] lg:h-[calc(100vh-2rem)] flex flex-col">
      {/* Barra superior de filtros en móvil */}
      <div className="lg:hidden mb-3 flex items-center gap-2">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex-1 flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            🎯 {filterLabel}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Panel de filtros en móvil (desplegable) */}
      {filtersOpen && (
        <div className="lg:hidden mb-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Alcance
            </label>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as ScopeType)}
              title="Alcance del chat"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="all">📚 Todas las clases</option>
              <option value="class">📖 Clase específica</option>
              <option value="preset">⏰ Por período</option>
              <option value="dateRange">📅 Rango personalizado</option>
            </select>
          </div>

          {scopeType === "class" && !loading && (
            <select
              value={selectedClassId || ""}
              onChange={(e) =>
                setSelectedClassId(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              title="Seleccionar clase"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">-- Selecciona --</option>
              {clases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.summary.slice(0, 40)} (
                  {new Date(c.date).toLocaleDateString()})
                </option>
              ))}
            </select>
          )}

          {scopeType === "preset" && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "week", label: "Semana" },
                { value: "month", label: "Mes" },
                { value: "semester", label: "Semestre" },
                { value: "year", label: "Año" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setPreset(p.value);
                    setFiltersOpen(false);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm text-center ${
                    preset === p.value
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {scopeType === "dateRange" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Panel de filtros DESKTOP */}
        <div className="hidden lg:block w-72 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 overflow-y-auto">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">
            🎯 Filtrar Conversación
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Alcance del Chat
              </label>
              <select
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as ScopeType)}
                title="Alcance del chat"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                <option value="all">📚 Todas las clases</option>
                <option value="class">📖 Clase específica</option>
                <option value="preset">⏰ Por período</option>
                <option value="dateRange">📅 Rango personalizado</option>
              </select>
            </div>

            {scopeType === "class" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Seleccionar Clase
                </label>
                {loading ? (
                  <p className="text-sm text-gray-500">Cargando...</p>
                ) : (
                  <select
                    value={selectedClassId || ""}
                    onChange={(e) =>
                      setSelectedClassId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    title="Seleccionar clase"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                    <option value="">-- Selecciona --</option>
                    {clases.map((clase) => (
                      <option key={clase.id} value={clase.id}>
                        {clase.title || clase.summary.slice(0, 50)} (
                        {new Date(clase.date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {scopeType === "preset" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Período
                </label>
                <div className="space-y-2">
                  {[
                    { value: "week", label: "Última semana" },
                    { value: "month", label: "Último mes" },
                    { value: "semester", label: "Último semestre" },
                    { value: "year", label: "Último año" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPreset(p.value)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        preset === p.value
                          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scopeType === "dateRange" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {filterLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg flex flex-col min-w-0">
          <ClassChatPanel {...filterProps} />
        </div>
      </div>
    </div>
  );
}
