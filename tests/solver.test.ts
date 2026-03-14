import {
  areLinesParallel,
  areLinesPerpendicular,
  checkExercise,
  distance,
  distancePointToLine,
  lineFromPointSlope,
  lineFromTwoPoints,
  midpoint,
  slope,
  solveAbsoluteValueInequality,
  solveLinearInequality,
  solveQuadraticInequality,
} from "../backend/src/solver/algebraSolver";

// ─── Geometry Functions ───────────────────────────────────────

describe("distance", () => {
  test("distance((0,0),(3,4)) = 5", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  test("distance between same points = 0", () => {
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  test("distance((1,2),(4,6)) = 5", () => {
    expect(distance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBeCloseTo(5);
  });

  test("distance((-3,5),(2,-1)) = sqrt(61)", () => {
    expect(distance({ x: -3, y: 5 }, { x: 2, y: -1 })).toBeCloseTo(
      Math.sqrt(61),
    );
  });
});

describe("midpoint", () => {
  test("midpoint((0,0),(2,2)) = (1,1)", () => {
    const m = midpoint({ x: 0, y: 0 }, { x: 2, y: 2 });
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(1);
  });

  test("midpoint((1,3),(5,7)) = (3,5)", () => {
    const m = midpoint({ x: 1, y: 3 }, { x: 5, y: 7 });
    expect(m.x).toBeCloseTo(3);
    expect(m.y).toBeCloseTo(5);
  });

  test("midpoint((-2,4),(6,-8)) = (2,-2)", () => {
    const m = midpoint({ x: -2, y: 4 }, { x: 6, y: -8 });
    expect(m.x).toBeCloseTo(2);
    expect(m.y).toBeCloseTo(-2);
  });
});

describe("slope", () => {
  test("slope((2,3),(6,7)) = 1", () => {
    const s = slope({ x: 2, y: 3 }, { x: 6, y: 7 });
    expect(s.undefined).toBe(false);
    expect(s.value).toBeCloseTo(1);
  });

  test("slope((1,1),(1,5)) = undefined (vertical)", () => {
    const s = slope({ x: 1, y: 1 }, { x: 1, y: 5 });
    expect(s.undefined).toBe(true);
    expect(s.value).toBeNull();
  });

  test("slope((-1,4),(3,8)) = 1", () => {
    const s = slope({ x: -1, y: 4 }, { x: 3, y: 8 });
    expect(s.undefined).toBe(false);
    expect(s.value).toBeCloseTo(1);
  });
});

describe("lineFromTwoPoints", () => {
  test("line through (2,3) and (6,5)", () => {
    const line = lineFromTwoPoints({ x: 2, y: 3 }, { x: 6, y: 5 });
    expect(line.isVertical).toBe(false);
    expect(line.slope).toBeCloseTo(0.5);
    expect(line.yIntercept).toBeCloseTo(2);
  });

  test("vertical line through (3,1) and (3,5)", () => {
    const line = lineFromTwoPoints({ x: 3, y: 1 }, { x: 3, y: 5 });
    expect(line.isVertical).toBe(true);
    expect(line.equation).toBe("x = 3");
  });
});

describe("lineFromPointSlope", () => {
  test("line through (1,2) with slope 3", () => {
    const line = lineFromPointSlope({ x: 1, y: 2 }, 3);
    expect(line.slope).toBe(3);
    expect(line.yIntercept).toBeCloseTo(-1);
  });
});

describe("areLinesParallel", () => {
  test("same slope = parallel", () => {
    expect(areLinesParallel(2, 2)).toBe(true);
  });
  test("different slopes ≠ parallel", () => {
    expect(areLinesParallel(2, 3)).toBe(false);
  });
});

describe("areLinesPerpendicular", () => {
  test("m1*m2 = -1 = perpendicular", () => {
    expect(areLinesPerpendicular(2, -0.5)).toBe(true);
  });
  test("m1*m2 ≠ -1 = not perpendicular", () => {
    expect(areLinesPerpendicular(2, 3)).toBe(false);
  });
});

describe("distancePointToLine", () => {
  test("distance from (0,0) to line x+y-1=0", () => {
    const d = distancePointToLine({ x: 0, y: 0 }, 1, 1, -1);
    expect(d).toBeCloseTo(1 / Math.sqrt(2));
  });
});

// ─── Inequalities ─────────────────────────────────────────────

describe("solveLinearInequality", () => {
  test("3x - 4 <= 8 => x <= 4", () => {
    // 3x - 12 <= 0 => a=3, b=-12
    const result = solveLinearInequality(3, -12, "<=");
    expect(result.noSolution).toBe(false);
    expect(result.intervals[0].to).toBeCloseTo(4);
    expect(result.intervals[0].toInclusive).toBe(true);
  });

  test("0x + 5 < 0 => no solution", () => {
    const result = solveLinearInequality(0, 5, "<");
    expect(result.noSolution).toBe(true);
  });
});

describe("solveAbsoluteValueInequality", () => {
  test("|x-5| <= 3 => [2,8]", () => {
    // |1*x + (-5)| <= 3
    const result = solveAbsoluteValueInequality(1, -5, 3, "<=");
    expect(result.noSolution).toBe(false);
    expect(result.intervals[0].from).toBeCloseTo(2);
    expect(result.intervals[0].to).toBeCloseTo(8);
    expect(result.intervals[0].fromInclusive).toBe(true);
    expect(result.intervals[0].toInclusive).toBe(true);
  });

  test("|2x+1| > 7 => (-inf,-4) U (3,inf)", () => {
    const result = solveAbsoluteValueInequality(2, 1, 7, ">");
    expect(result.noSolution).toBe(false);
    expect(result.intervals.length).toBe(2);
    expect(result.intervals[0].to).toBeCloseTo(-4);
    expect(result.intervals[1].from).toBeCloseTo(3);
  });

  test("|A| <= B where B < 0 => no solution", () => {
    const result = solveAbsoluteValueInequality(1, 0, -3, "<=");
    expect(result.noSolution).toBe(true);
  });

  test("|11-x| <= 15 => [-4, 26]", () => {
    // |-1*x + 11| <= 15 => a=-1, b=11
    const result = solveAbsoluteValueInequality(-1, 11, 15, "<=");
    expect(result.noSolution).toBe(false);
    expect(result.intervals[0].from).toBeCloseTo(-4);
    expect(result.intervals[0].to).toBeCloseTo(26);
  });
});

describe("solveQuadraticInequality", () => {
  test("x² - 9 >= 0 => (-inf,-3] U [3,inf)", () => {
    const result = solveQuadraticInequality(1, 0, -9, ">=");
    expect(result.noSolution).toBe(false);
    expect(result.intervals.length).toBe(2);
    expect(result.intervals[0].to).toBeCloseTo(-3);
    expect(result.intervals[1].from).toBeCloseTo(3);
  });

  test("x² - 5x + 6 <= 0 => [2,3]", () => {
    const result = solveQuadraticInequality(1, -5, 6, "<=");
    expect(result.noSolution).toBe(false);
    expect(result.intervals.length).toBe(1);
    expect(result.intervals[0].from).toBeCloseTo(2);
    expect(result.intervals[0].to).toBeCloseTo(3);
  });

  test("2x² - 8 > 0 => (-inf,-2) U (2,inf)", () => {
    const result = solveQuadraticInequality(2, 0, -8, ">");
    expect(result.noSolution).toBe(false);
    expect(result.intervals.length).toBe(2);
    expect(result.intervals[0].to).toBeCloseTo(-2);
    expect(result.intervals[1].from).toBeCloseTo(2);
  });

  test("no real roots with positive a and > => all reals", () => {
    // x² + 1 > 0 => always true
    const result = solveQuadraticInequality(1, 0, 1, ">");
    expect(result.noSolution).toBe(false);
    expect(result.intervals[0].from).toBeNull();
    expect(result.intervals[0].to).toBeNull();
  });
});

// ─── Exercise Checker ─────────────────────────────────────────

describe("checkExercise", () => {
  test("checks distance correctly", () => {
    const result = checkExercise(
      "distance",
      { pointA: { x: 0, y: 0 }, pointB: { x: 3, y: 4 } },
      5,
    );
    expect(result.correct).toBe(true);
  });

  test("checks midpoint correctly", () => {
    const result = checkExercise(
      "midpoint",
      { pointA: { x: 0, y: 0 }, pointB: { x: 2, y: 2 } },
      { x: 1, y: 1 },
    );
    expect(result.correct).toBe(true);
  });

  test("checks slope correctly", () => {
    const result = checkExercise(
      "slope",
      { pointA: { x: 2, y: 3 }, pointB: { x: 6, y: 7 } },
      1,
    );
    expect(result.correct).toBe(true);
  });

  test("checks undefined slope", () => {
    const result = checkExercise(
      "slope",
      { pointA: { x: 1, y: 1 }, pointB: { x: 1, y: 5 } },
      "undefined",
    );
    expect(result.correct).toBe(true);
  });
});
