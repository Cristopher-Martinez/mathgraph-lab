import { useEffect, useState } from "react";
import MarkdownLatex from "../components/MarkdownLatex";
import { api } from "../services/api";

interface Apunte {
  id?: number;
  titulo: string;
  contenido: string;
  categoria: "consejo" | "concepto" | "error_comun" | "metodo" | "observacion";
}

interface ClassNotes {
  classId: number;
  date: string;
  dateFormatted: string;
  title: string;
  summary: string | null;
  temas: string[];
  apuntes: Apunte[];
}

interface ClassOption {
  classId: number;
  date: string;
  dateFormatted: string;
  title: string;
  temas: string[];
  notesCount: number;
}

const CATEGORIA_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; bg: string }
> = {
  consejo: {
    label: "Consejo",
    icon: "💡",
    color: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
  },
  concepto: {
    label: "Concepto",
    icon: "📖",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  },
  error_comun: {
    label: "Error Común",
    icon: "⚠️",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  },
  metodo: {
    label: "Método",
    icon: "🔧",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  },
  observacion: {
    label: "Observación",
    icon: "👁️",
    color: "text-purple-700 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
  },
};

export default function ApuntesPage() {
  const [notes, setNotes] = useState<ClassNotes[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [filterClass, setFilterClass] = useState<number | "todas">("todas");
  const [filterCategoria, setFilterCategoria] = useState<string>("todas");
  const [expandedClass, setExpandedClass] = useState<number | null>(null);
  const [apuntesPage, setApuntesPage] = useState(0);
  const APUNTES_PER_PAGE = 4;

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadNotes();
  }, [filterClass]);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [notesData, classesData] = await Promise.all([
        api.getNotes(),
        api.getNotesClasses(),
      ]);
      setNotes(notesData.notes || []);
      setClasses(classesData || []);
      if (notesData.notes?.length > 0) {
        setExpandedClass(notesData.notes[0].classId);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar apuntes");
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async () => {
    setLoading(true);
    setError("");
    try {
      const classId = filterClass === "todas" ? undefined : filterClass;
      const data = await api.getNotes(classId);
      setNotes(data.notes || []);
      if (data.notes?.length > 0 && !expandedClass) {
        setExpandedClass(data.notes[0].classId);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar apuntes");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (classId: number) => {
    setRegenerating(classId);
    setError("");
    try {
      const result = await api.regenerateNotes(classId);
      // Update notes in place
      setNotes((prev) => {
        const existing = prev.find((n) => n.classId === classId);
        if (existing) {
          return prev.map((n) =>
            n.classId === classId ? { ...n, apuntes: result.apuntes || [] } : n,
          );
        }
        return [...prev, result];
      });
      // Update class count
      setClasses((prev) =>
        prev.map((c) =>
          c.classId === classId
            ? { ...c, notesCount: result.apuntes?.length || 0 }
            : c,
        ),
      );
      setExpandedClass(classId);
    } catch (err: any) {
      setError(err.message || "Error al regenerar apuntes");
    } finally {
      setRegenerating(null);
    }
  };

  // Filter notes by category
  const filteredNotes = notes
    .map((cn) => ({
      ...cn,
      apuntes:
        filterCategoria === "todas"
          ? cn.apuntes
          : cn.apuntes.filter((a) => a.categoria === filterCategoria),
    }))
    .filter((cn) => cn.apuntes.length > 0);

  const totalApuntes = notes.reduce((sum, cn) => sum + cn.apuntes.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            📋 Apuntes de Clase
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Consejos, consideraciones y observaciones extraídas de tus clases
          </p>
        </div>
      </div>

      {/* Class filter */}
      {classes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={filterClass}
            onChange={(e) =>
              setFilterClass(
                e.target.value === "todas" ? "todas" : parseInt(e.target.value),
              )
            }
            title="Filtrar por clase"
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            <option value="todas">Todas las clases ({classes.length})</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.title} — {c.dateFormatted}
                {c.notesCount > 0
                  ? ` (${c.notesCount} apuntes)`
                  : " (sin apuntes)"}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats - inline compact */}
      {!loading && notes.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {totalApuntes} apuntes
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 dark:text-gray-400">
            {notes.length} clases
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-yellow-600 dark:text-yellow-400">
            💡{" "}
            {notes.reduce(
              (s, cn) =>
                s + cn.apuntes.filter((a) => a.categoria === "consejo").length,
              0,
            )}{" "}
            consejos
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-red-600 dark:text-red-400">
            ⚠️{" "}
            {notes.reduce(
              (s, cn) =>
                s +
                cn.apuntes.filter((a) => a.categoria === "error_comun").length,
              0,
            )}{" "}
            errores comunes
          </span>
        </div>
      )}

      {/* Category filters */}
      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategoria("todas")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filterCategoria === "todas"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}>
            Todas ({totalApuntes})
          </button>
          {Object.entries(CATEGORIA_CONFIG).map(([key, config]) => {
            const count = notes.reduce(
              (s, cn) =>
                s + cn.apuntes.filter((a) => a.categoria === key).length,
              0,
            );
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterCategoria(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  filterCategoria === key
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}>
                {config.icon} {config.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            Cargando apuntes...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && notes.length === 0 && (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">📝</span>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No hay apuntes disponibles
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Registra clases en la sección de{" "}
            <span className="font-medium">Registro</span> y asegúrate de que
            estén indexadas para que aparezcan apuntes aquí.
          </p>
        </div>
      )}

      {/* Notes by class */}
      {!loading &&
        filteredNotes.map((cn) => (
          <div
            key={cn.classId}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Class header */}
            <button
              onClick={() => {
                const next = expandedClass === cn.classId ? null : cn.classId;
                setExpandedClass(next);
                setApuntesPage(0);
              }}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
              <div className="text-left">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {cn.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    📅 {cn.dateFormatted}
                  </span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    {cn.apuntes.length} apunte
                    {cn.apuntes.length !== 1 ? "s" : ""}
                  </span>
                  {cn.temas.slice(0, 3).map((t, i) => (
                    <span
                      key={i}
                      className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRegenerate(cn.classId);
                  }}
                  disabled={regenerating === cn.classId}
                  className="text-xs px-2 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition disabled:opacity-50"
                  title="Regenerar apuntes con IA">
                  {regenerating === cn.classId ? (
                    <span className="animate-spin inline-block h-3 w-3 border-2 border-indigo-600 border-t-transparent rounded-full" />
                  ) : (
                    "🔄 Regenerar"
                  )}
                </button>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedClass === cn.classId ? "rotate-180" : ""
                  }`}
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
              </div>
            </button>

            {/* Apuntes list — paginated */}
            {expandedClass === cn.classId && (
              <div className="px-5 pb-5 space-y-2">
                {(() => {
                  const totalApuntesPages = Math.ceil(
                    cn.apuntes.length / APUNTES_PER_PAGE,
                  );
                  const paginatedApuntes = cn.apuntes.slice(
                    apuntesPage * APUNTES_PER_PAGE,
                    (apuntesPage + 1) * APUNTES_PER_PAGE,
                  );

                  return (
                    <>
                      {paginatedApuntes.map((apunte, idx) => {
                        const config =
                          CATEGORIA_CONFIG[apunte.categoria] ||
                          CATEGORIA_CONFIG.observacion;
                        return (
                          <details
                            key={
                              apunte.id ?? apuntesPage * APUNTES_PER_PAGE + idx
                            }
                            className={`rounded-lg border ${config.bg} group`}
                            open={paginatedApuntes.length === 1}>
                            <summary className="px-4 py-2.5 cursor-pointer select-none flex items-center gap-2 hover:opacity-80 transition-opacity">
                              <span className="text-base">{config.icon}</span>
                              <h3
                                className={`font-semibold text-sm flex-1 ${config.color}`}>
                                {apunte.titulo}
                              </h3>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full bg-white/50 dark:bg-black/20 ${config.color}`}>
                                {config.label}
                              </span>
                              <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">
                                ▼
                              </span>
                            </summary>
                            <div className="px-4 pb-3 pt-1 border-t border-inherit">
                              <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                <MarkdownLatex content={apunte.contenido} />
                              </div>
                            </div>
                          </details>
                        );
                      })}

                      {/* Pagination controls */}
                      {totalApuntesPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <button
                            onClick={() =>
                              setApuntesPage((p) => Math.max(0, p - 1))
                            }
                            disabled={apuntesPage === 0}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            ← Anterior
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {apuntesPage + 1} / {totalApuntesPages} •{" "}
                            {cn.apuntes.length} apuntes
                          </span>
                          <button
                            onClick={() =>
                              setApuntesPage((p) =>
                                Math.min(totalApuntesPages - 1, p + 1),
                              )
                            }
                            disabled={apuntesPage >= totalApuntesPages - 1}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            Siguiente →
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
