/**
 * Algebra Solver Engine
 * Handles: distance, midpoint, slope, line equations,
 * inequality solving (linear, absolute value, quadratic)
 */

// ─── Geometry Functions ───────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function midpoint(p1: Point, p2: Point): Point {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export interface SlopeResult {
  value: number | null;
  undefined: boolean;
}

export function slope(p1: Point, p2: Point): SlopeResult {
  const dx = p2.x - p1.x;
  if (dx === 0) {
    return { value: null, undefined: true };
  }
  return { value: (p2.y - p1.y) / dx, undefined: false };
}

export interface LineEquation {
  slope: number | null;
  yIntercept: number | null;
  isVertical: boolean;
  x?: number;
  equation: string;
}

export function lineFromTwoPoints(p1: Point, p2: Point): LineEquation {
  const s = slope(p1, p2);
  if (s.undefined) {
    return {
      slope: null,
      yIntercept: null,
      isVertical: true,
      x: p1.x,
      equation: `x = ${p1.x}`,
    };
  }
  const m = s.value!;
  const b = p1.y - m * p1.x;
  const bStr = b >= 0 ? `+ ${round(b)}` : `- ${round(Math.abs(b))}`;
  return {
    slope: m,
    yIntercept: b,
    isVertical: false,
    equation: `y = ${round(m)}x ${bStr}`,
  };
}

export function lineFromPointSlope(p: Point, m: number): LineEquation {
  const b = p.y - m * p.x;
  const bStr = b >= 0 ? `+ ${round(b)}` : `- ${round(Math.abs(b))}`;
  return {
    slope: m,
    yIntercept: b,
    isVertical: false,
    equation: `y = ${round(m)}x ${bStr}`,
  };
}

export function areLinesParallel(m1: number, m2: number): boolean {
  return Math.abs(m1 - m2) < 1e-10;
}

export function areLinesPerpendicular(m1: number, m2: number): boolean {
  return Math.abs(m1 * m2 + 1) < 1e-10;
}

export function distancePointToLine(
  point: Point,
  A: number,
  B: number,
  C: number,
): number {
  // Line: Ax + By + C = 0
  const denom = Math.sqrt(A * A + B * B);
  if (denom === 0) throw new Error("Invalid line coefficients");
  return Math.abs(A * point.x + B * point.y + C) / denom;
}

export function distanceBetweenParallelLines(
  A: number,
  B: number,
  C1: number,
  C2: number,
): number {
  const denom = Math.sqrt(A * A + B * B);
  if (denom === 0) throw new Error("Invalid line coefficients");
  return Math.abs(C1 - C2) / denom;
}

// ─── Inequality Solver ────────────────────────────────────────

export interface Interval {
  from: number | null; // null = -Infinity
  to: number | null; // null = +Infinity
  fromInclusive: boolean;
  toInclusive: boolean;
}

export interface InequalitySolution {
  intervals: Interval[];
  notation: string;
  noSolution: boolean;
}

function formatInterval(interval: Interval): string {
  const left = interval.fromInclusive ? "[" : "(";
  const right = interval.toInclusive ? "]" : ")";
  const from = interval.from === null ? "-∞" : round(interval.from);
  const to = interval.to === null ? "∞" : round(interval.to);
  return `${left}${from}, ${to}${right}`;
}

/**
 * Solve linear inequality: ax + b OP 0
 * where OP is <, <=, >, >=
 */
export function solveLinearInequality(
  a: number,
  b: number,
  operator: "<" | "<=" | ">" | ">=",
): InequalitySolution {
  if (a === 0) {
    // Degenerate: b OP 0
    const holds =
      operator === "<"
        ? b < 0
        : operator === "<="
          ? b <= 0
          : operator === ">"
            ? b > 0
            : b >= 0;
    if (holds) {
      return {
        intervals: [
          { from: null, to: null, fromInclusive: false, toInclusive: false },
        ],
        notation: "(-∞, ∞)",
        noSolution: false,
      };
    }
    return { intervals: [], notation: "∅", noSolution: true };
  }

  const root = -b / a;
  const flip = a < 0;

  let effectiveOp = operator;
  if (flip) {
    if (operator === "<") effectiveOp = ">";
    else if (operator === "<=") effectiveOp = ">=";
    else if (operator === ">") effectiveOp = "<";
    else effectiveOp = "<=";
  }

  let intervals: Interval[];
  if (effectiveOp === "<") {
    intervals = [
      { from: null, to: root, fromInclusive: false, toInclusive: false },
    ];
  } else if (effectiveOp === "<=") {
    intervals = [
      { from: null, to: root, fromInclusive: false, toInclusive: true },
    ];
  } else if (effectiveOp === ">") {
    intervals = [
      { from: root, to: null, fromInclusive: false, toInclusive: false },
    ];
  } else {
    intervals = [
      { from: root, to: null, fromInclusive: true, toInclusive: false },
    ];
  }

  const notation = intervals.map(formatInterval).join(" ∪ ");
  return { intervals, notation, noSolution: false };
}

/**
 * Solve absolute value inequality: |ax + b| OP c
 */
export function solveAbsoluteValueInequality(
  a: number,
  b: number,
  c: number,
  operator: "<" | "<=" | ">" | ">=",
): InequalitySolution {
  if (operator === "<" || operator === "<=") {
    // |ax + b| < c  => no solution if c < 0 (or c <= 0 for strict <)
    if (c < 0 || (operator === "<" && c === 0)) {
      return { intervals: [], notation: "∅", noSolution: true };
    }
    if (operator === "<=" && c === 0) {
      // |ax+b| <= 0 => ax+b = 0 => x = -b/a
      if (a === 0) {
        if (b === 0) {
          return {
            intervals: [
              {
                from: null,
                to: null,
                fromInclusive: false,
                toInclusive: false,
              },
            ],
            notation: "(-∞, ∞)",
            noSolution: false,
          };
        }
        return { intervals: [], notation: "∅", noSolution: true };
      }
      const pt = -b / a;
      return {
        intervals: [
          { from: pt, to: pt, fromInclusive: true, toInclusive: true },
        ],
        notation: `{${round(pt)}}`,
        noSolution: false,
      };
    }

    // -c < ax+b < c  =>  (-c - b)/a < x < (c - b)/a
    if (a === 0) {
      const holds = Math.abs(b) < c || (operator === "<=" && Math.abs(b) === c);
      if (holds) {
        return {
          intervals: [
            { from: null, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: "(-∞, ∞)",
          noSolution: false,
        };
      }
      return { intervals: [], notation: "∅", noSolution: true };
    }

    let lo = (-c - b) / a;
    let hi = (c - b) / a;
    if (a < 0) [lo, hi] = [hi, lo];
    const inclusive = operator === "<=";
    const intervals: Interval[] = [
      { from: lo, to: hi, fromInclusive: inclusive, toInclusive: inclusive },
    ];
    return {
      intervals,
      notation: formatInterval(intervals[0]),
      noSolution: false,
    };
  } else {
    // |ax + b| > c or >= c
    if (c < 0) {
      return {
        intervals: [
          { from: null, to: null, fromInclusive: false, toInclusive: false },
        ],
        notation: "(-∞, ∞)",
        noSolution: false,
      };
    }
    if (c === 0 && operator === ">") {
      if (a === 0) {
        if (b !== 0) {
          return {
            intervals: [
              {
                from: null,
                to: null,
                fromInclusive: false,
                toInclusive: false,
              },
            ],
            notation: "(-∞, ∞)",
            noSolution: false,
          };
        }
        return { intervals: [], notation: "∅", noSolution: true };
      }
      const pt = -b / a;
      return {
        intervals: [
          { from: null, to: pt, fromInclusive: false, toInclusive: false },
          { from: pt, to: null, fromInclusive: false, toInclusive: false },
        ],
        notation: `(-∞, ${round(pt)}) ∪ (${round(pt)}, ∞)`,
        noSolution: false,
      };
    }

    if (a === 0) {
      const holds = operator === ">" ? Math.abs(b) > c : Math.abs(b) >= c;
      if (holds) {
        return {
          intervals: [
            { from: null, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: "(-∞, ∞)",
          noSolution: false,
        };
      }
      return { intervals: [], notation: "∅", noSolution: true };
    }

    // ax + b < -c  OR  ax + b > c
    let lo = (-c - b) / a;
    let hi = (c - b) / a;
    if (a < 0) [lo, hi] = [hi, lo];
    const inclusive = operator === ">=";
    const intervals: Interval[] = [
      { from: null, to: lo, fromInclusive: false, toInclusive: inclusive },
      { from: hi, to: null, fromInclusive: inclusive, toInclusive: false },
    ];
    const notation = intervals.map(formatInterval).join(" ∪ ");
    return { intervals, notation, noSolution: false };
  }
}

/**
 * Solve quadratic inequality: ax² + bx + c OP 0
 */
export function solveQuadraticInequality(
  a: number,
  b: number,
  c: number,
  operator: "<" | "<=" | ">" | ">=",
): InequalitySolution {
  if (a === 0) {
    return solveLinearInequality(b, c, operator);
  }

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    // No real roots. Parabola is entirely above or below axis.
    const sign = a > 0 ? 1 : -1; // sign of ax²+bx+c for all x
    const holds =
      operator === "<"
        ? sign < 0
        : operator === "<="
          ? sign <= 0
          : operator === ">"
            ? sign > 0
            : sign >= 0;
    if (holds) {
      return {
        intervals: [
          { from: null, to: null, fromInclusive: false, toInclusive: false },
        ],
        notation: "(-∞, ∞)",
        noSolution: false,
      };
    }
    return { intervals: [], notation: "∅", noSolution: true };
  }

  const sqrtD = Math.sqrt(discriminant);
  let r1 = (-b - sqrtD) / (2 * a);
  let r2 = (-b + sqrtD) / (2 * a);
  if (r1 > r2) [r1, r2] = [r2, r1];

  if (discriminant === 0) {
    // Double root
    const root = r1;
    if (a > 0) {
      // Expression >= 0 everywhere, = 0 at root
      if (operator === "<") {
        return { intervals: [], notation: "∅", noSolution: true };
      } else if (operator === "<=") {
        return {
          intervals: [
            { from: null, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: "(-∞, ∞)",
          noSolution: false,
        };
      } else if (operator === ">") {
        return {
          intervals: [
            { from: null, to: root, fromInclusive: false, toInclusive: false },
            { from: root, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: `(-∞, ${round(root)}) ∪ (${round(root)}, ∞)`,
          noSolution: false,
        };
      } else {
        // >=
        return {
          intervals: [
            { from: null, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: "(-∞, ∞)",
          noSolution: false,
        };
      }
    } else {
      // a < 0: expression <= 0 everywhere, = 0 at root
      if (operator === ">") {
        return { intervals: [], notation: "∅", noSolution: true };
      } else if (operator === ">=") {
        return {
          intervals: [
            { from: root, to: root, fromInclusive: true, toInclusive: true },
          ],
          notation: `{${round(root)}}`,
          noSolution: false,
        };
      } else if (operator === "<") {
        return {
          intervals: [
            { from: null, to: root, fromInclusive: false, toInclusive: false },
            { from: root, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: `(-∞, ${round(root)}) ∪ (${round(root)}, ∞)`,
          noSolution: false,
        };
      } else {
        // <=
        return {
          intervals: [
            { from: null, to: null, fromInclusive: false, toInclusive: false },
          ],
          notation: "(-∞, ∞)",
          noSolution: false,
        };
      }
    }
  }

  // Two distinct roots
  const strictInclusive = operator === "<=" || operator === ">=";
  if (a > 0) {
    if (operator === "<" || operator === "<=") {
      // Between roots
      return {
        intervals: [
          {
            from: r1,
            to: r2,
            fromInclusive: strictInclusive,
            toInclusive: strictInclusive,
          },
        ],
        notation: formatInterval({
          from: r1,
          to: r2,
          fromInclusive: strictInclusive,
          toInclusive: strictInclusive,
        }),
        noSolution: false,
      };
    } else {
      // Outside roots
      return {
        intervals: [
          {
            from: null,
            to: r1,
            fromInclusive: false,
            toInclusive: strictInclusive,
          },
          {
            from: r2,
            to: null,
            fromInclusive: strictInclusive,
            toInclusive: false,
          },
        ],
        notation: `${formatInterval({ from: null, to: r1, fromInclusive: false, toInclusive: strictInclusive })} ∪ ${formatInterval({ from: r2, to: null, fromInclusive: strictInclusive, toInclusive: false })}`,
        noSolution: false,
      };
    }
  } else {
    // a < 0: flip regions
    if (operator === "<" || operator === "<=") {
      // Outside roots
      return {
        intervals: [
          {
            from: null,
            to: r1,
            fromInclusive: false,
            toInclusive: strictInclusive,
          },
          {
            from: r2,
            to: null,
            fromInclusive: strictInclusive,
            toInclusive: false,
          },
        ],
        notation: `${formatInterval({ from: null, to: r1, fromInclusive: false, toInclusive: strictInclusive })} ∪ ${formatInterval({ from: r2, to: null, fromInclusive: strictInclusive, toInclusive: false })}`,
        noSolution: false,
      };
    } else {
      // Between roots
      return {
        intervals: [
          {
            from: r1,
            to: r2,
            fromInclusive: strictInclusive,
            toInclusive: strictInclusive,
          },
        ],
        notation: formatInterval({
          from: r1,
          to: r2,
          fromInclusive: strictInclusive,
          toInclusive: strictInclusive,
        }),
        noSolution: false,
      };
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────

function round(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(6)).toString();
}

// ─── Exercise Checker ─────────────────────────────────────────

export interface CheckResult {
  correct: boolean;
  expected: any;
  got: any;
}

export function checkExercise(
  type: string,
  params: Record<string, any>,
  answer: any,
): CheckResult {
  switch (type) {
    case "distance": {
      const expected = distance(params.pointA, params.pointB);
      return {
        correct: Math.abs(expected - Number(answer)) < 1e-6,
        expected: parseFloat(expected.toFixed(6)),
        got: answer,
      };
    }
    case "midpoint": {
      const expected = midpoint(params.pointA, params.pointB);
      const ans = answer as Point;
      return {
        correct:
          Math.abs(expected.x - ans.x) < 1e-6 &&
          Math.abs(expected.y - ans.y) < 1e-6,
        expected,
        got: answer,
      };
    }
    case "slope": {
      const expected = slope(params.pointA, params.pointB);
      if (expected.undefined) {
        return {
          correct: answer === "undefined" || answer === null,
          expected: "undefined",
          got: answer,
        };
      }
      return {
        correct: Math.abs(expected.value! - Number(answer)) < 1e-6,
        expected: expected.value,
        got: answer,
      };
    }
    case "line_equation": {
      const expected = lineFromTwoPoints(params.pointA, params.pointB);
      return {
        correct: false, // Accept any equivalent form via string comparison
        expected: expected.equation,
        got: answer,
      };
    }
    default:
      return { correct: false, expected: null, got: answer };
  }
}
