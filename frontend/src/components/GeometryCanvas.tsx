import { useEffect, useRef, useState } from "react";
import { Arrow, Circle, Group, Layer, Line, Stage, Text } from "react-konva";
import {
  distance,
  lineEquation,
  midpoint,
  Point,
  slope,
} from "../services/solverClient";
import { useTheme } from "../context/ThemeContext";

interface CanvasPoint {
  id: string;
  x: number;
  y: number;
  label: string;
}

export default function GeometryCanvas() {
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 500 });
  const [points, setPoints] = useState<CanvasPoint[]>([]);
  const [result, setResult] = useState<string>("");
  const [tool, setTool] = useState<"point" | "select">("point");
  const [selected, setSelected] = useState<string[]>([]);
  const [labelInterval, setLabelInterval] = useState(5); // Intervalo de marcas numéricas
  const labelCounter = useRef(0);

  // Colores adaptativos según el tema
  const colors = {
    grid: isDark ? "#334155" : "#e2e8f0",
    axis: isDark ? "#64748b" : "#94a3b8",
    axisText: isDark ? "#94a3b8" : "#64748b",
    pointLabel: isDark ? "#e2e8f0" : "#1e293b",
    selectedLine: isDark ? "#818cf8" : "#6366f1",
  };

  useEffect(() => {
    if (containerRef.current) {
      setDims({
        w: containerRef.current.clientWidth,
        h: 500,
      });
    }
  }, []);

  const ORIGIN_X = dims.w / 2;
  const ORIGIN_Y = dims.h / 2;
  const SCALE = 30;

  const toCanvas = (p: Point) => ({
    x: ORIGIN_X + p.x * SCALE,
    y: ORIGIN_Y - p.y * SCALE,
  });

  const toMath = (cx: number, cy: number): Point => ({
    x: Math.round(((cx - ORIGIN_X) / SCALE) * 10) / 10,
    y: Math.round(((ORIGIN_Y - cy) / SCALE) * 10) / 10,
  });

  const handleStageClick = (e: any) => {
    if (tool !== "point") return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const math = toMath(pos.x, pos.y);
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const label = labels[labelCounter.current % 26];
    labelCounter.current++;
    setPoints((prev) => [
      ...prev,
      { id: crypto.randomUUID(), x: math.x, y: math.y, label },
    ]);
  };

  const handlePointClick = (id: string) => {
    if (tool === "select") {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((s) => s !== id);
        if (prev.length >= 2) return [prev[1], id];
        return [...prev, id];
      });
    }
  };

  const compute = (fn: string) => {
    if (selected.length < 2) {
      setResult("Selecciona 2 puntos primero");
      return;
    }
    const p1 = points.find((p) => p.id === selected[0])!;
    const p2 = points.find((p) => p.id === selected[1])!;
    const a: Point = { x: p1.x, y: p1.y };
    const b: Point = { x: p2.x, y: p2.y };

    switch (fn) {
      case "distance":
        setResult(
          `Distancia(${p1.label},${p2.label}) = ${distance(a, b).toFixed(4)}`,
        );
        break;
      case "midpoint": {
        const m = midpoint(a, b);
        setResult(`Punto Medio(${p1.label},${p2.label}) = (${m.x}, ${m.y})`);
        break;
      }
      case "slope": {
        const s = slope(a, b);
        setResult(
          s === null
            ? `Pendiente(${p1.label},${p2.label}) = indefinida (línea vertical)`
            : `Pendiente(${p1.label},${p2.label}) = ${s.toFixed(4)}`,
        );
        break;
      }
      case "line":
        setResult(`Recta(${p1.label},${p2.label}): ${lineEquation(a, b)}`);
        break;
    }
  };

  // Líneas de cuadrícula
  const gridLines: JSX.Element[] = [];
  for (let i = -20; i <= 20; i++) {
    const cx = ORIGIN_X + i * SCALE;
    const cy = ORIGIN_Y - i * SCALE;
    if (cx > 0 && cx < dims.w) {
      gridLines.push(
        <Line
          key={`vg${i}`}
          points={[cx, 0, cx, dims.h]}
          stroke={colors.grid}
          strokeWidth={1}
        />,
      );
    }
    if (cy > 0 && cy < dims.h) {
      gridLines.push(
        <Line
          key={`hg${i}`}
          points={[0, cy, dims.w, cy]}
          stroke={colors.grid}
          strokeWidth={1}
        />,
      );
    }
  }

  // Marcas numéricas en los ejes (cada N unidades según configuración)
  const axisLabels: JSX.Element[] = [];
  
  for (let i = -20; i <= 20; i++) {
    if (i === 0 || i % labelInterval !== 0) continue;
    
    // Marcas en el eje X
    const cx = ORIGIN_X + i * SCALE;
    if (cx > 30 && cx < dims.w - 30) {
      // Línea de marca
      axisLabels.push(
        <Line
          key={`tickX${i}`}
          points={[cx, ORIGIN_Y - 5, cx, ORIGIN_Y + 5]}
          stroke={colors.axis}
          strokeWidth={2}
        />
      );
      // Número
      axisLabels.push(
        <Text
          key={`labelX${i}`}
          text={i.toString()}
          x={cx - 8}
          y={ORIGIN_Y + 10}
          fill={colors.axisText}
          fontSize={11}
        />
      );
    }
    
    // Marcas en el eje Y
    const cy = ORIGIN_Y - i * SCALE;
    if (cy > 30 && cy < dims.h - 30) {
      // Línea de marca
      axisLabels.push(
        <Line
          key={`tickY${i}`}
          points={[ORIGIN_X - 5, cy, ORIGIN_X + 5, cy]}
          stroke={colors.axis}
          strokeWidth={2}
        />
      );
      // Número
      axisLabels.push(
        <Text
          key={`labelY${i}`}
          text={i.toString()}
          x={ORIGIN_X - 25}
          y={cy - 6}
          fill={colors.axisText}
          fontSize={11}
        />
      );
    }
  }

  return (
    <div ref={containerRef}>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTool("point")}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tool === "point" ? "bg-indigo-600 text-white" : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"}`}>
          Colocar Punto
        </button>
        <button
          onClick={() => setTool("select")}
          className={`px-3 py-1.5 rounded text-sm font-medium ${tool === "select" ? "bg-indigo-600 text-white" : "bg-gray-200 dark:bg-gray-700 dark:text-gray-300"}`}>
          Seleccionar Puntos
        </button>
        <span className="border-l mx-2"></span>
        <button
          onClick={() => compute("distance")}
          className="px-3 py-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
          Distancia
        </button>
        <button
          onClick={() => compute("midpoint")}
          className="px-3 py-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
          Punto Medio
        </button>
        <button
          onClick={() => compute("slope")}
          className="px-3 py-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
          Pendiente
        </button>
        <button
          onClick={() => compute("line")}
          className="px-3 py-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50">
          Ecuación de Recta
        </button>
        <span className="border-l mx-2"></span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">
            Intervalo:
          </label>
          <select
            value={labelInterval}
            onChange={(e) => setLabelInterval(Number(e.target.value))}
            title="Intervalo de marcas numéricas"
            className="px-2 py-1 rounded text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <button
          onClick={() => {
            setPoints([]);
            setSelected([]);
            setResult("");
            labelCounter.current = 0;
          }}
          className="px-3 py-1.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 ml-auto">
          Limpiar Todo
        </button>
      </div>

      {result && (
        <div className="mb-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-mono text-sm border border-indigo-200 dark:border-indigo-700">
          {result}
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
        <Stage width={dims.w} height={dims.h} onClick={handleStageClick}>
          <Layer>
            {/* Cuadrícula */}
            {gridLines}

            {/* Ejes */}
            <Arrow
              points={[0, ORIGIN_Y, dims.w, ORIGIN_Y]}
              stroke={colors.axis}
              strokeWidth={2}
              pointerLength={8}
              pointerWidth={6}
            />
            <Arrow
              points={[ORIGIN_X, dims.h, ORIGIN_X, 0]}
              stroke={colors.axis}
              strokeWidth={2}
              pointerLength={8}
              pointerWidth={6}
            />
            <Text
              text="x"
              x={dims.w - 20}
              y={ORIGIN_Y + 8}
              fill={colors.axisText}
              fontSize={14}
            />
            <Text
              text="y"
              x={ORIGIN_X + 8}
              y={8}
              fill={colors.axisText}
              fontSize={14}
            />

            {/* Marcas numéricas en los ejes */}
            {axisLabels}

            {/* Línea entre puntos seleccionados */}
            {selected.length === 2 &&
              (() => {
                const p1 = points.find((p) => p.id === selected[0]);
                const p2 = points.find((p) => p.id === selected[1]);
                if (!p1 || !p2) return null;
                const c1 = toCanvas({ x: p1.x, y: p1.y });
                const c2 = toCanvas({ x: p2.x, y: p2.y });
                return (
                  <Line
                    points={[c1.x, c1.y, c2.x, c2.y]}
                    stroke={colors.selectedLine}
                    strokeWidth={2}
                    dash={[6, 3]}
                  />
                );
              })()}

            {/* Puntos */}
            {points.map((p) => {
              const cp = toCanvas({ x: p.x, y: p.y });
              const isSelected = selected.includes(p.id);
              return (
                <Group key={p.id}>
                  <Circle
                    x={cp.x}
                    y={cp.y}
                    radius={isSelected ? 7 : 5}
                    fill={isSelected ? "#6366f1" : "#ef4444"}
                    stroke={isSelected ? "#4338ca" : "#dc2626"}
                    strokeWidth={2}
                    onClick={() => handlePointClick(p.id)}
                  />
                  <Text
                    text={`${p.label}(${p.x},${p.y})`}
                    x={cp.x + 10}
                    y={cp.y - 18}
                    fill={colors.pointLabel}
                    fontSize={12}
                    fontStyle="bold"
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        {tool === "point"
          ? "Haz clic en el canvas para colocar puntos."
          : "Haz clic en los puntos para seleccionarlos, luego usa las herramientas de arriba."}
      </p>
    </div>
  );
}
