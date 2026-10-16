// Archimedes, Measurement of a Circle, Prop. 3: start from the hexagon, the
// one polygon whose perimeter is known exactly, and double the sides four
// times. 96 sides gives 3 10/71 < π < 3 1/7. Shared by the canvas and the
// static (no-JS) drawing so the two can't drift apart.
export const STAGES = [6, 12, 24, 48, 96] as const;
// Inner vertices sit at THETA0 + 2πk/n. THETA0 = 30° puts a vertical flat side
// of the hexagon toward the text column.
export const THETA0 = Math.PI / 6;

export const innerPoint = (n: number, k: number) => {
  const a = THETA0 + (2 * Math.PI * k) / n;
  return [Math.cos(a), Math.sin(a)] as const; // unit circle, y up
};
export const outerPoint = (n: number, k: number) => {
  const a = THETA0 + (2 * Math.PI * k) / n + Math.PI / n;
  const r = 1 / Math.cos(Math.PI / n);
  return [r * Math.cos(a), r * Math.sin(a)] as const;
};
