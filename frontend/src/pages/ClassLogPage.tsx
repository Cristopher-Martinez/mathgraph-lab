import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MarkdownLatex from "../components/MarkdownLatex";
import { api } from "../services/api";

interface ClassLogEntry {
  id: number;
  date: string;
  summary: string;
  temas: string[];
  formulas: string[];
  cantidadImagenes: number;
  createdAt: string;
}

interface WeekTimeline {
  semana: string;
  clases: any[];
  totalTemas: number;
}

// Tamaño máximo de imagen en bytes (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 20;
const CLASSES_PER_PAGE = 5;
const EXERCISES_PER_PAGE = 6;
const COOLDOWN_SECONDS = 10;

export default function ClassLogPage() {
  const [clases, setClases] = useState<ClassLogEntry[]>([]);
  const [timeline, setTimeline] = useState<WeekTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"lista" | "timeline">("lista");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [claseSeleccionada, setClaseSeleccionada] = useState<any>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Estados para edición
  const [mostrarModalEdicion, setMostrarModalEdicion] = useState(false);
  const [claseEditando, setClaseEditando] = useState<any>(null);
  const [tituloEdicion, setTituloEdicion] = useState("");
  const [summaryEdicion, setSummaryEdicion] = useState("");
  const [topicsEdicion, setTopicsEdicion] = useState("");
  const [formulasEdicion, setFormulasEdicion] = useState("");
  const [fechaEdicion, setFechaEdicion] = useState("");
  const [imagenesEdicion, setImagenesEdicion] = useState<
    {
      base64: string;
      mimeType: string;
      preview: string;
      nombre: string;
      tamano: number;
    }[]
  >([]);

  // Formulario
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [transcripcion, setTranscripcion] = useState("");
  const [imagenes, setImagenes] = useState<
    {
      base64: string;
      mimeType: string;
      preview: string;
      nombre: string;
      tamano: number;
    }[]
  >([]);
  const [enviando, setEnviando] = useState(false);
  const [progresoTexto, setProgresoTexto] = useState("");
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error" | "advertencia";
    texto: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const [classPage, setClassPage] = useState(1);
  const [generandoEjercicios, setGenerandoEjercicios] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    cargarClases();
  }, []);

  async function cargarClases() {
    setLoading(true);
    try {
      const [clasesData, timelineData] = await Promise.all([
        api.getClassLogs(),
        api.getWeeklyTimeline(),
      ]);
      setClases(clasesData);
      setTimeline(timelineData);
    } catch (err) {
      console.error("Error al cargar clases:", err);
    } finally {
      setLoading(false);
    }
  }

  async function eliminarClase(id: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (
      !confirm(
        "¿Estás seguro de eliminar esta clase?\n\nSe eliminarán también todos los temas, ejercicios, fórmulas y progreso generados por esta clase.\n\nEsta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    try {
      await api.deleteClassLog(id);
      setMensaje({
        tipo: "exito",
        texto: "Clase eliminada junto con sus temas y ejercicios relacionados",
      });
      // Limpiar selección si la clase eliminada estaba siendo vista
      if (claseSeleccionada && claseSeleccionada.id === id) {
        setClaseSeleccionada(null);
      }
      await cargarClases();
    } catch (err) {
      console.error("Error al eliminar clase:", err);
      setMensaje({ tipo: "error", texto: "Error al eliminar la clase" });
    }
  }

  function abrirEdicion(clase: any, e: React.MouseEvent) {
    e.stopPropagation();
    setClaseEditando(clase);
    setTituloEdicion(clase.title || "");
    setSummaryEdicion(clase.summary || "");
    setTopicsEdicion(clase.topics || "");
    setFormulasEdicion(clase.formulas || "");
    setFechaEdicion(new Date(clase.date).toISOString().split("T")[0]);
    setImagenesEdicion([]);
    setMostrarModalEdicion(true);
  }

  async function guardarEdicion() {
    if (!claseEditando) return;

    setEnviando(true);
    try {
      const updateData: any = {};
      if (fechaEdicion) updateData.date = fechaEdicion;
      updateData.title = tituloEdicion || null;
      if (summaryEdicion !== undefined)
        updateData.summary = summaryEdicion || null;
      if (topicsEdicion !== undefined)
        updateData.topics = topicsEdicion || null;
      if (formulasEdicion !== undefined)
        updateData.formulas = formulasEdicion || null;
      if (imagenesEdicion.length > 0) {
        updateData.images = imagenesEdicion.map((img) => ({
          base64: img.base64,
          mimeType: img.mimeType,
        }));
      }

      await api.updateClassLog(claseEditando.id, updateData);
      setMensaje({ tipo: "exito", texto: "Clase actualizada exitosamente" });
      setMostrarModalEdicion(false);
      setClaseEditando(null);
      cargarClases();
    } catch (err) {
      console.error("Error al actualizar clase:", err);
      setMensaje({ tipo: "error", texto: "Error al actualizar la clase" });
    } finally {
      setEnviando(false);
    }
  }

  async function verDetalle(id: number) {
    setCargandoDetalle(true);
    try {
      const detalle = await api.getClassLog(id);
      setClaseSeleccionada(detalle);
    } catch (err) {
      console.error("Error al cargar detalle:", err);
    } finally {
      setCargandoDetalle(false);
    }
  }

  async function enviarClase() {
    const tieneTranscripcion = transcripcion.trim().length > 0;
    const tieneImagenes = imagenes.length > 0;

    if (!tieneTranscripcion && !tieneImagenes) {
      setMensaje({
        tipo: "error",
        texto: "Se requiere al menos una transcripción o imagen",
      });
      return;
    }

    setEnviando(true);
    setMensaje(null);
    abortRef.current = new AbortController();

    // Estimar tiempo según tamaño
    const charCount = transcripcion.length;
    const imgCount = imagenes.length;
    const estimatedSteps: string[] = [];
    if (tieneImagenes) estimatedSteps.push(`analizando ${imgCount} imagen(es)`);
    if (tieneTranscripcion) {
      if (charCount > 30000) {
        estimatedSteps.push(
          `procesando transcripción larga (${Math.ceil(charCount / 25000)} partes)`,
        );
      } else {
        estimatedSteps.push("analizando transcripción");
      }
    }
    estimatedSteps.push("generando ejercicios");
    setProgresoTexto(
      `Paso 1/${estimatedSteps.length}: ${estimatedSteps[0]}...`,
    );

    try {
      const data = {
        date: fecha,
        transcript: transcripcion,
        images: imagenes.map((img) => ({
          base64: img.base64,
          mimeType: img.mimeType,
        })),
      };

      const result = await api.createClassLog(data);

      // Construir mensaje de éxito con stats
      let textoExito = "¡Clase registrada y analizada correctamente!";
      if (result.stats) {
        const s = result.stats;
        const partes: string[] = [];
        if (s.temasDetectados > 0) partes.push(`${s.temasDetectados} temas`);
        if (s.formulasExtraidas > 0)
          partes.push(`${s.formulasExtraidas} fórmulas`);
        if (s.ejerciciosGenerados > 0)
          partes.push(`${s.ejerciciosGenerados} ejercicios`);
        if (s.imagenesProcesadas > 0)
          partes.push(`${s.imagenesProcesadas} imágenes`);
        if (partes.length > 0) textoExito += ` (${partes.join(", ")})`;
      }

      // Mostrar advertencias si hubo errores parciales
      if (result.advertencias && result.advertencias.length > 0) {
        setMensaje({
          tipo: "advertencia",
          texto: `${textoExito}\n⚠️ Algunas imágenes tuvieron problemas: ${result.advertencias.join("; ")}`,
        });
      } else {
        setMensaje({ tipo: "exito", texto: textoExito });
      }

      setTitulo("");
      setTranscripcion("");
      setImagenes([]);
      setMostrarFormulario(false);
      cargarClases();
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMensaje({ tipo: "error", texto: "Operación cancelada" });
      } else {
        setMensaje({
          tipo: "error",
          texto: err.message || "Error al registrar la clase",
        });
      }
    } finally {
      setEnviando(false);
      setProgresoTexto("");
      abortRef.current = null;
    }
  }

  function cancelarEnvio() {
    abortRef.current?.abort();
  }

  function manejarSubidaImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files);

    // Validar cantidad total
    if (imagenes.length + fileArray.length > MAX_IMAGES) {
      setMensaje({
        tipo: "error",
        texto: `Máximo ${MAX_IMAGES} imágenes. Ya tienes ${imagenes.length}, intentas agregar ${fileArray.length}.`,
      });
      return;
    }

    const erroresArchivo: string[] = [];

    fileArray.forEach((file) => {
      // Validar tamaño
      if (file.size > MAX_IMAGE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        erroresArchivo.push(
          `${file.name} (${sizeMB}MB) excede el límite de 10MB`,
        );
        return;
      }

      // Validar tipo
      const tiposPermitidos = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/heic",
        "image/heif",
      ];
      if (!tiposPermitidos.includes(file.type)) {
        erroresArchivo.push(`${file.name}: tipo no soportado (${file.type})`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        setImagenes((prev) => [
          ...prev,
          {
            base64,
            mimeType: file.type || "image/jpeg",
            preview: result,
            nombre: file.name,
            tamano: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (erroresArchivo.length > 0) {
      setMensaje({
        tipo: "error",
        texto: `Archivos rechazados: ${erroresArchivo.join("; ")}`,
      });
    }
  }

  const generarMasEjercicios = useCallback(
    async (id: number) => {
      if (generandoEjercicios || cooldown > 0) return;
      setGenerandoEjercicios(true);
      try {
        const result = await api.generateClassExercises(id);
        if (claseSeleccionada && claseSeleccionada.id === id) {
          setClaseSeleccionada({
            ...claseSeleccionada,
            ejercicios: [
              ...(claseSeleccionada.ejercicios || []),
              ...result.ejercicios,
            ],
          });
        }
        // Start cooldown
        setCooldown(COOLDOWN_SECONDS);
        const interval = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (err) {
        console.error("Error al generar ejercicios:", err);
      } finally {
        setGenerandoEjercicios(false);
      }
    },
    [generandoEjercicios, cooldown, claseSeleccionada],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Vista de detalle de clase
  if (claseSeleccionada) {
    return (
      <DetalleClase
        clase={claseSeleccionada}
        onVolver={() => setClaseSeleccionada(null)}
        onGenerarEjercicios={() => generarMasEjercicios(claseSeleccionada.id)}
        generando={generandoEjercicios}
        cooldown={cooldown}
        navigate={navigate}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            📝 Registro de Clases
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sube transcripciones y fotos para generar material
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm">
            {mostrarFormulario ? "Cancelar" : "+ Nueva Clase"}
          </button>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div
          className={`p-4 rounded-lg whitespace-pre-line ${
            mensaje.tipo === "exito"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
              : mensaje.tipo === "advertencia"
                ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800"
                : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
          }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario de nueva clase */}
      {mostrarFormulario && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Registrar Nueva Clase
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha de la Clase
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Título (opcional)
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Pendiente y ecuación de la recta"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transcripción de la Clase {!imagenes.length && "*"}
            </label>
            <textarea
              value={transcripcion}
              onChange={(e) => setTranscripcion(e.target.value)}
              rows={10}
              placeholder="Pega aquí la transcripción o apuntes de la clase. Puede ser voz-a-texto sin editar, apuntes largos, etc..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y"
            />
            <div className="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
              <span>
                {transcripcion.length > 30000
                  ? `⚡ Transcripción larga — se procesará en ${Math.ceil(transcripcion.length / 25000)} partes automáticamente`
                  : imagenes.length > 0 && !transcripcion.trim()
                    ? "💡 Sin transcripción — se extraerá contenido de las imágenes"
                    : "Soporta transcripciones de varias horas de clase"}
              </span>
              <span
                className={
                  transcripcion.length > 30000 ? "text-amber-500" : ""
                }>
                {transcripcion.length.toLocaleString()} caracteres
              </span>
            </div>
          </div>

          {/* Subida de imágenes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fotos del Pizarrón / Cuaderno (opcional — máx. {MAX_IMAGES})
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
              multiple
              onChange={manejarSubidaImagen}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            {imagenes.length > 0 && (
              <>
                <div className="flex gap-3 mt-3 flex-wrap">
                  {imagenes.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img.preview}
                        alt={`Imagen ${i + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                      />
                      <button
                        onClick={() =>
                          setImagenes((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">
                        ×
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center rounded-b-lg px-1 truncate opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {(img.tamano / 1024 / 1024).toFixed(1)}MB
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {imagenes.length} imagen(es) ·{" "}
                  {(
                    imagenes.reduce((acc, img) => acc + img.tamano, 0) /
                    1024 /
                    1024
                  ).toFixed(1)}
                  MB total
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={enviarClase}
              disabled={
                enviando || (!transcripcion.trim() && imagenes.length === 0)
              }
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
              {enviando
                ? "🔄 Procesando clase con IA..."
                : "🚀 Registrar y Analizar Clase"}
            </button>
            {enviando && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
                  <span className="text-sm text-indigo-700 dark:text-indigo-400">
                    {progresoTexto || "Procesando..."}
                  </span>
                </div>
                <button
                  onClick={cancelarEnvio}
                  className="w-full px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs de vista */}
      <div className="flex gap-2">
        <button
          onClick={() => setVista("lista")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "lista"
              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}>
          📋 Lista de Clases
        </button>
        <button
          onClick={() => setVista("timeline")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            vista === "timeline"
              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}>
          📅 Línea Temporal
        </button>
      </div>

      {/* Vista de lista */}
      {vista === "lista" && (
        <div className="space-y-3">
          {clases.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                No hay clases registradas aún
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                Haz clic en "+ Nueva Clase" para comenzar
              </p>
            </div>
          ) : (
            <>
              {clases
                .slice(
                  (classPage - 1) * CLASSES_PER_PAGE,
                  classPage * CLASSES_PER_PAGE,
                )
                .map((clase) => (
                  <div
                    key={clase.id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5 hover:border-indigo-300 dark:hover:border-indigo-600 cursor-pointer transition-colors relative group">
                    {/* Botones de acción */}
                    <div className="absolute top-3 right-3 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => abrirEdicion(clase, e)}
                        className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/70 text-xs font-medium transition-colors">
                        ✏️ Editar
                      </button>
                      <button
                        onClick={(e) => eliminarClase(clase.id, e)}
                        className="px-3 py-1.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 text-xs font-medium transition-colors">
                        🗑️ Borrar
                      </button>
                    </div>

                    <div
                      onClick={() => verDetalle(clase.id)}
                      className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {`Clase #${clase.id}`}
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                            {new Date(clase.date).toLocaleDateString("es-ES", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            })}
                          </span>
                        </div>
                        {clase.summary && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {clase.summary}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {clase.temas.map((tema, i) => (
                            <span
                              key={i}
                              className="text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                              {tema}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-3 text-sm text-gray-500 dark:text-gray-400">
                        {clase.formulas.length > 0 && (
                          <span>📐 {clase.formulas.length}</span>
                        )}
                        {clase.cantidadImagenes > 0 && (
                          <span>🖼️ {clase.cantidadImagenes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              {/* Pagination controls */}
              {Math.ceil(clases.length / CLASSES_PER_PAGE) > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setClassPage((p) => Math.max(1, p - 1))}
                    disabled={classPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    ←
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {classPage} / {Math.ceil(clases.length / CLASSES_PER_PAGE)}
                  </span>
                  <button
                    onClick={() =>
                      setClassPage((p) =>
                        Math.min(
                          Math.ceil(clases.length / CLASSES_PER_PAGE),
                          p + 1,
                        ),
                      )
                    }
                    disabled={
                      classPage >= Math.ceil(clases.length / CLASSES_PER_PAGE)
                    }
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Vista de timeline */}
      {vista === "timeline" && (
        <div className="space-y-6">
          {timeline.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">
                No hay datos suficientes para la línea temporal
              </p>
            </div>
          ) : (
            timeline.map((semana, idx) => (
              <div key={idx} className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                    <span className="text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                      S{idx + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Semana del{" "}
                      {new Date(semana.semana).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      })}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {semana.clases.length} clase(s) · {semana.totalTemas}{" "}
                      temas
                    </p>
                  </div>
                </div>
                <div className="ml-5 pl-8 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-3">
                  {semana.clases.map((clase: any) => (
                    <div
                      key={clase.id}
                      onClick={() => verDetalle(clase.id)}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 cursor-pointer transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(clase.date).toLocaleDateString("es-ES", {
                            timeZone: "UTC",
                          })}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {`Clase #${clase.id}`}
                        </span>
                      </div>
                      {clase.temas?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {clase.temas.map((t: string, i: number) => (
                            <span
                              key={i}
                              className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {cargandoDetalle && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            <span className="text-gray-700 dark:text-gray-300">
              Cargando detalle...
            </span>
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      {mostrarModalEdicion && claseEditando && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Editar Clase #{claseEditando.id}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                La transcripción no se puede modificar
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={fechaEdicion}
                  onChange={(e) => setFechaEdicion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Título */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Título
                </label>
                <input
                  type="text"
                  value={tituloEdicion}
                  onChange={(e) => setTituloEdicion(e.target.value)}
                  placeholder="Ej: Clase sobre ecuaciones cuadráticas"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Resumen */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Resumen
                </label>
                <textarea
                  value={summaryEdicion}
                  onChange={(e) => setSummaryEdicion(e.target.value)}
                  rows={3}
                  placeholder="Resumen de la clase..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Temas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temas
                </label>
                <textarea
                  value={topicsEdicion}
                  onChange={(e) => setTopicsEdicion(e.target.value)}
                  rows={2}
                  placeholder="Temas tratados en la clase..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Fórmulas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fórmulas
                </label>
                <textarea
                  value={formulasEdicion}
                  onChange={(e) => setFormulasEdicion(e.target.value)}
                  rows={2}
                  placeholder="Fórmulas y ecuaciones relevantes..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {/* Imágenes actuales */}
              {claseEditando.imagenes && claseEditando.imagenes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Imágenes actuales ({claseEditando.imagenes.length})
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Las imágenes actuales se mantendrán. Si agregas nuevas, se
                    reemplazarán todas.
                  </p>
                </div>
              )}

              {/* Botón para agregar nuevas imágenes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nuevas imágenes (opcional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((file) => {
                      if (file.size > MAX_IMAGE_SIZE) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setImagenesEdicion((prev) => [
                          ...prev,
                          {
                            base64: reader.result as string,
                            mimeType: file.type,
                            preview: reader.result as string,
                            nombre: file.name,
                            tamano: file.size,
                          },
                        ]);
                      };
                      reader.readAsDataURL(file);
                    });
                  }}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/20 file:text-indigo-700 dark:file:text-indigo-400 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/30"
                />
                {imagenesEdicion.length > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    {imagenesEdicion.length} nueva(s) imagen(es) seleccionada(s)
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setMostrarModalEdicion(false);
                  setClaseEditando(null);
                  setImagenesEdicion([]);
                }}
                disabled={enviando}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={enviando}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {enviando ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente de detalle de clase
function DetalleClase({
  clase,
  onVolver,
  onGenerarEjercicios,
  generando,
  cooldown,
  navigate,
}: {
  clase: any;
  onVolver: () => void;
  onGenerarEjercicios: () => void;
  generando: boolean;
  cooldown: number;
  navigate: any;
}) {
  const [exPage, setExPage] = useState(1);
  const [diffFilter, setDiffFilter] = useState<string>("all");

  const ejercicios = clase.ejercicios || [];
  const filteredExercicios =
    diffFilter === "all"
      ? ejercicios
      : ejercicios.filter((ej: any) => {
          const d = ej.dificultad || ej.difficulty || "";
          if (diffFilter === "facil") return d === "facil" || d === "easy";
          if (diffFilter === "medio") return d === "medio" || d === "medium";
          return d === "dificil" || d === "hard";
        });

  const totalExPages = Math.ceil(
    filteredExercicios.length / EXERCISES_PER_PAGE,
  );
  const pagedExercicios = filteredExercicios.slice(
    (exPage - 1) * EXERCISES_PER_PAGE,
    exPage * EXERCISES_PER_PAGE,
  );

  const [detailTab, setDetailTab] = useState<
    "resumen" | "formulas" | "ejercicios" | "transcripcion" | "imagenes"
  >("resumen");

  // Build available tabs dynamically
  const tabs: { key: typeof detailTab; label: string }[] = [
    { key: "resumen", label: "📋 Resumen" },
  ];
  if (clase.formulas?.length > 0)
    tabs.push({ key: "formulas", label: `📐 Fórmulas (${clase.formulas.length})` });
  tabs.push({ key: "ejercicios", label: `✏️ Ejercicios (${ejercicios.length})` });
  if (clase.transcript)
    tabs.push({ key: "transcripcion", label: "📝 Transcripción" });
  if (clase.imagenes?.length > 0)
    tabs.push({ key: "imagenes", label: `🖼️ Imágenes (${clase.imagenes.length})` });

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center gap-4">
        <button
          onClick={onVolver}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          ← Volver
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {`Clase #${clase.id}`}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(clase.date).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>
      </div>

      {/* Tab card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDetailTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                detailTab === tab.key
                  ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {/* Resumen tab */}
          {detailTab === "resumen" && (
            <div className="space-y-4">
              {clase.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Resumen
                  </h3>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {clase.summary}
                  </p>
                </div>
              )}
              {clase.temas?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Temas Detectados
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {clase.temas.map((tema: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-medium">
                        {tema}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!clase.summary && (!clase.temas || clase.temas.length === 0) && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No hay resumen disponible
                </p>
              )}
            </div>
          )}

          {/* Fórmulas tab */}
          {detailTab === "formulas" && (
            <div className="space-y-2">
              {clase.formulas.map((formula: string, i: number) => (
                <div
                  key={i}
                  className="px-4 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-200">
                  <MarkdownLatex content={`$${formula}$`} />
                </div>
              ))}
            </div>
          )}

          {/* Ejercicios tab */}
          {detailTab === "ejercicios" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                {/* Difficulty filter */}
                <div className="flex gap-1.5">
                  {([
                    ["all", "Todos"],
                    ["facil", "🟢 Fácil"],
                    ["medio", "🟡 Medio"],
                    ["dificil", "🔴 Difícil"],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setDiffFilter(key); setExPage(1); }}
                      className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                        diffFilter === key
                          ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={onGenerarEjercicios}
                  disabled={generando || cooldown > 0}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {generando
                    ? "⏳ Generando..."
                    : cooldown > 0
                      ? `⏱️ ${cooldown}s`
                      : "+ Generar"}
                </button>
              </div>

              {pagedExercicios.length > 0 ? (
                <div className="space-y-3">
                  {pagedExercicios.map((ej: any, i: number) => (
                    <div
                      key={ej.id || i}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              ej.dificultad === "facil" || ej.difficulty === "easy"
                                ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                                : ej.dificultad === "medio" || ej.difficulty === "medium"
                                  ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                                  : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                            }`}>
                            {ej.dificultad || ej.difficulty || "medio"}
                          </span>
                          {ej.tipo && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {ej.tipo}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            navigate("/practice", {
                              state: {
                                exercise: {
                                  id: ej.id,
                                  latex: ej.pregunta || ej.question || ej.latex,
                                  question: ej.pregunta || ej.question,
                                  steps: ej.solucion || ej.steps,
                                  difficulty: ej.dificultad || ej.difficulty || "medium",
                                  topic: ej.topic || clase.temas?.[0] || "General",
                                  socratic: ej.socratic,
                                },
                                startSocratic: true,
                              },
                            })
                          }
                          title="Practicar en modo Socrático"
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors flex items-center gap-1.5 flex-shrink-0">
                          🧠 Socrático
                        </button>
                      </div>
                      <p className="text-gray-800 dark:text-gray-200 text-sm">
                        {ej.pregunta || ej.question || ej.latex}
                      </p>
                      <details className="mt-2">
                        <summary className="text-xs text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">
                          Ver solución
                        </summary>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 pl-4">
                          {ej.solucion || ej.steps}
                        </p>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {diffFilter !== "all"
                    ? "No hay ejercicios con esa dificultad"
                    : "No se han generado ejercicios aún"}
                </p>
              )}
              {/* Exercise pagination */}
              {totalExPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <button
                    onClick={() => setExPage((p) => Math.max(1, p - 1))}
                    disabled={exPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    ←
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {exPage} / {totalExPages}
                  </span>
                  <button
                    onClick={() => setExPage((p) => Math.min(totalExPages, p + 1))}
                    disabled={exPage >= totalExPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Transcripción tab */}
          {detailTab === "transcripcion" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {clase.transcript?.split(/\s+/).filter(Boolean).length.toLocaleString()} palabras · {clase.transcript?.length.toLocaleString()} caracteres
                </span>
              </div>
              <div className="max-h-[500px] overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-3">
                {(clase.transcript || "")
                  .split(/\n\s*\n/)
                  .filter((p: string) => p.trim())
                  .map((paragraph: string, i: number) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {paragraph.trim()}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {/* Imágenes tab */}
          {detailTab === "imagenes" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {clase.imagenes.map((img: any, i: number) => (
                <div
                  key={i}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Imagen {i + 1}
                  </p>
                  {img.caption && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {img.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
