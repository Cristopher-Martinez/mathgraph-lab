interface IntervalVisualizerProps {
  intervals: Array<{
    from: number | null;
    to: number | null;
    fromInclusive: boolean;
    toInclusive: boolean;
  }>;
}

export default function IntervalVisualizer({
  intervals,
}: IntervalVisualizerProps) {
  if (!intervals || intervals.length === 0) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-center border border-red-200 dark:border-red-700 font-medium">
        Sin solución (∅)
      </div>
    );
  }

  // Encontrar rango para visualización
  const allPoints: number[] = [];
  intervals.forEach((iv) => {
    if (iv.from !== null) allPoints.push(iv.from);
    if (iv.to !== null) allPoints.push(iv.to);
  });

  const minVal = allPoints.length > 0 ? Math.min(...allPoints) : 0;
  const maxVal = allPoints.length > 0 ? Math.max(...allPoints) : 10;
  const padding = Math.max(2, (maxVal - minVal) * 0.3);
  const viewMin = minVal - padding;
  const viewMax = maxVal + padding;
  const width = 500;
  const height = 60;
  const lineY = 30;

  const toX = (val: number) => ((val - viewMin) / (viewMax - viewMin)) * width;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxWidth: 500 }}>
        {/* Recta numérica */}
        <line
          x1={0}
          y1={lineY}
          x2={width}
          y2={lineY}
          stroke="currentColor"
          className="text-gray-400 dark:text-gray-500"
          strokeWidth={2}
        />

        {/* Puntas de flecha */}
        <polygon
          points={`0,${lineY - 4} 8,${lineY} 0,${lineY + 4}`}
          fill="currentColor"
          className="text-gray-400 dark:text-gray-500"
        />
        <polygon
          points={`${width},${lineY - 4} ${width - 8},${lineY} ${width},${lineY + 4}`}
          fill="currentColor"
          className="text-gray-400 dark:text-gray-500"
        />

        {/* Marcas de graduación para puntos clave */}
        {allPoints.map((p, i) => (
          <g key={i}>
            <line
              x1={toX(p)}
              y1={lineY - 6}
              x2={toX(p)}
              y2={lineY + 6}
              stroke="currentColor"
              className="text-gray-500 dark:text-gray-400"
              strokeWidth={1.5}
            />
            <text
              x={toX(p)}
              y={lineY + 20}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              className="text-gray-700 dark:text-gray-300 font-medium">
              {Number.isInteger(p) ? p : p.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Intervalos */}
        {intervals.map((iv, i) => {
          const x1 = iv.from !== null ? toX(iv.from) : 0;
          const x2 = iv.to !== null ? toX(iv.to) : width;

          return (
            <g key={i}>
              <line
                x1={x1}
                y1={lineY}
                x2={x2}
                y2={lineY}
                stroke="#6366f1"
                strokeWidth={4}
                strokeLinecap="round"
              />
              {/* Extremo inicial */}
              {iv.from !== null && (
                <circle
                  cx={toX(iv.from)}
                  cy={lineY}
                  r={5}
                  fill={iv.fromInclusive ? "#6366f1" : "#1f2937"}
                  stroke="#6366f1"
                  strokeWidth={2}
                  className={iv.fromInclusive ? "" : "dark:fill-gray-800"}
                />
              )}
              {/* Extremo final */}
              {iv.to !== null && (
                <circle
                  cx={toX(iv.to)}
                  cy={lineY}
                  r={5}
                  fill={iv.toInclusive ? "#6366f1" : "#1f2937"}
                  stroke="#6366f1"
                  strokeWidth={2}
                  className={iv.toInclusive ? "" : "dark:fill-gray-800"}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
