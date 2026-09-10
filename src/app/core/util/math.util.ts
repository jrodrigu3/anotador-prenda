export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distancia angular mínima entre dos ángulos en radianes, en [0, PI]. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
