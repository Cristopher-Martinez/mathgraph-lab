/**
 * Client-side solver — mirrors backend for instant feedback
 */

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

export function slope(p1: Point, p2: Point): number | null {
  const dx = p2.x - p1.x;
  if (dx === 0) return null;
  return (p2.y - p1.y) / dx;
}

export function lineEquation(p1: Point, p2: Point): string {
  const m = slope(p1, p2);
  if (m === null) return `x = ${p1.x}`;
  const b = p1.y - m * p1.x;
  const bStr = b >= 0 ? `+ ${fmt(b)}` : `- ${fmt(Math.abs(b))}`;
  return `y = ${fmt(m)}x ${bStr}`;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(4)).toString();
}
