export const ITEMS_PER_PAGE = 10;
export const NOTES_PER_PAGE = 3;

export const DIFF_CONFIG = [
  {
    level: "easy",
    label: "Fácil",
    color: "emerald",
    icon: "🟢",
    stars: "★☆☆",
  },
  {
    level: "medium",
    label: "Intermedio",
    color: "amber",
    icon: "🟡",
    stars: "★★☆",
  },
  {
    level: "hard",
    label: "Difícil",
    color: "red",
    icon: "🔴",
    stars: "★★★",
  },
] as const;

export const DIFFICULTY_COLOR_CLASSES: Record<string, string> = {
  emerald:
    "border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
  amber:
    "border-amber-300 dark:border-amber-700 hover:border-amber-500 dark:hover:border-amber-500 bg-amber-50 dark:bg-amber-900/20",
  red: "border-red-300 dark:border-red-700 hover:border-red-500 dark:hover:border-red-500 bg-red-50 dark:bg-red-900/20",
};

export function buildSolveParams(
  exercise: any,
): { type: string; params: any } | null {
  const text = exercise.latex || exercise.question || "";
  const coords = [
    ...text.matchAll(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g),
  ];
  if (coords.length >= 2) {
    const lower = text.toLowerCase();
    let type = "distance";
    if (lower.includes("punto medio") || lower.includes("midpoint"))
      type = "midpoint";
    else if (lower.includes("pendiente") || lower.includes("slope"))
      type = "slope";
    else if (lower.includes("ecuación") || lower.includes("recta que pasa"))
      type = "line_equation";
    return {
      type,
      params: {
        pointA: { x: parseFloat(coords[0][1]), y: parseFloat(coords[0][2]) },
        pointB: { x: parseFloat(coords[1][1]), y: parseFloat(coords[1][2]) },
      },
    };
  }
  return null;
}
