import {
  ArrowGeometry,
  Box,
  Geometry,
  NormPoint,
  PolygonGeometry,
  Pt,
  RectGeometry,
  Size,
} from '../models/geometry.model';
import { clamp } from './math.util';

/* ────────────────────────── conversión entre espacios ────────────────────────── */

/**
 * Cliente (CSS px) -> contenido (píxeles naturales de la imagen).
 *
 * `getScreenCTM()` resuelve de una sola vez el viewBox, el letterboxing, cualquier
 * transformación CSS de un ancestro, el scroll y el zoom de página. Por eso el bitmap va
 * DENTRO del `<svg>` como `<image>`: así no existe en toda la app la matemática manual de
 * `object-fit: contain`, que es de donde sale el clásico "mi pin cae 40 px desplazado".
 *
 * Devuelve `null` si el SVG no está renderizado (display:none, panel plegado, antes del
 * primer pintado). Los llamantes DEBEN abortar: un fallback silencioso a `{0,0}` crea
 * marcas en la esquina superior izquierda y parece corrupción de datos.
 */
export function clientToContent(svg: SVGSVGElement, cx: number, cy: number): Pt | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Contenido -> cliente, para colocar un popover HTML junto a una marca. */
export function contentToClient(svg: SVGSVGElement, p: Pt): Pt | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const q = new DOMPoint(p.x, p.y).matrixTransform(ctm);
  return { x: q.x, y: q.y };
}

export function toNorm(p: Pt, n: Size): NormPoint {
  return { x: p.x / n.w, y: p.y / n.h };
}

export function fromNorm(p: NormPoint, n: Size): Pt {
  return { x: p.x * n.w, y: p.y * n.h };
}

/** Una marca fuera de la foto no significa nada para la IA. */
export function clampNorm(p: NormPoint): NormPoint {
  return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
}

/**
 * Redondeo SOLO en el momento de persistir, nunca durante un arrastre (redondear en cada
 * `pointermove` hace que la forma dé saltos visibles). 5 decimales ≈ 0,04 px en 4000 px.
 */
export function roundNorm(p: NormPoint): NormPoint {
  return { x: Math.round(p.x * 1e5) / 1e5, y: Math.round(p.y * 1e5) / 1e5 };
}

export function roundGeometry(g: Geometry): Geometry {
  switch (g.kind) {
    case 'pin':
      return { kind: 'pin', point: roundNorm(g.point) };
    case 'arrow':
      return { kind: 'arrow', tail: roundNorm(g.tail), head: roundNorm(g.head) };
    case 'rect': {
      const r = roundNorm({ x: g.x, y: g.y });
      const s = roundNorm({ x: g.w, y: g.h });
      return { kind: 'rect', x: r.x, y: r.y, w: s.x, h: s.y };
    }
    case 'polygon':
      return { kind: 'polygon', points: g.points.map(roundNorm) };
  }
}

/* ────────────────────────── operaciones sobre geometría ────────────────────────── */

/** Rectángulo normalizado a partir de dos esquinas cualesquiera. */
export function normRect(a: Pt, b: Pt): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/**
 * EL punto de la anotación. Toda forma se reduce a un punto canónico —el centro de la
 * mirilla— para que ni la UI ni el modelo tengan que calcular centroides.
 */
export function anchorOf(g: Geometry): NormPoint {
  switch (g.kind) {
    case 'pin':
      return g.point;
    case 'arrow':
      return g.head; // la PUNTA manda; la cola solo indica de dónde se mira
    case 'rect':
      return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    case 'polygon':
      return polygonCentroid(g.points);
  }
}

/**
 * Centroide de área. El centroide es equivariante bajo transformaciones afines de ejes,
 * así que calcularlo en espacio normalizado y luego escalar da el mismo resultado que
 * hacerlo en píxeles: aquí sí es seguro.
 */
export function polygonCentroid(points: readonly NormPoint[]): NormPoint {
  const n = points.length;
  if (n === 0) return { x: 0.5, y: 0.5 };
  if (n < 3) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  // Polígono degenerado (área nula, vértices colineales): media de vértices.
  if (Math.abs(area2) < 1e-12) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  const f = 1 / (3 * area2);
  return { x: cx * f, y: cy * f };
}

export function pointsOf(g: Geometry): readonly NormPoint[] {
  switch (g.kind) {
    case 'pin':
      return [g.point];
    case 'arrow':
      return [g.tail, g.head];
    case 'rect':
      return [
        { x: g.x, y: g.y },
        { x: g.x + g.w, y: g.y + g.h },
      ];
    case 'polygon':
      return g.points;
  }
}

export function bboxOf(g: Geometry): Box {
  const pts = pointsOf(g);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Traslación en espacio normalizado. Es exacta pese a la anisotropía porque una traslación
 * es independiente por eje: el llamante pasa `dx / naturalWidth`, `dy / naturalHeight`.
 * Se recorta para que la forma entera quede dentro de la imagen.
 */
export function translateGeometry(g: Geometry, dx: number, dy: number): Geometry {
  const b = bboxOf(g);
  const ddx = clamp(dx, -b.x, 1 - (b.x + b.w));
  const ddy = clamp(dy, -b.y, 1 - (b.y + b.h));
  const mv = (p: NormPoint): NormPoint => ({ x: p.x + ddx, y: p.y + ddy });
  switch (g.kind) {
    case 'pin':
      return { kind: 'pin', point: mv(g.point) };
    case 'arrow':
      return { kind: 'arrow', tail: mv(g.tail), head: mv(g.head) };
    case 'rect':
      return { kind: 'rect', x: g.x + ddx, y: g.y + ddy, w: g.w, h: g.h };
    case 'polygon':
      return { kind: 'polygon', points: g.points.map(mv) };
  }
}

export type RectCorner = 'nw' | 'ne' | 'se' | 'sw';

export type VertexRef =
  | { readonly kind: 'pin' }
  | { readonly kind: 'poly'; readonly index: number }
  | { readonly kind: 'rect'; readonly corner: RectCorner }
  | { readonly kind: 'arrow'; readonly end: 'tail' | 'head' };

/** Mueve un vértice concreto a `p` (normalizado, ya recortado a la imagen). */
export function moveVertex(g: Geometry, ref: VertexRef, p: NormPoint): Geometry {
  const q = clampNorm(p);
  if (g.kind === 'pin' && ref.kind === 'pin') return { kind: 'pin', point: q };
  if (g.kind === 'arrow' && ref.kind === 'arrow') {
    return ref.end === 'tail'
      ? { kind: 'arrow', tail: q, head: g.head }
      : { kind: 'arrow', tail: g.tail, head: q };
  }
  if (g.kind === 'rect' && ref.kind === 'rect') {
    const fixed: Pt =
      ref.corner === 'nw'
        ? { x: g.x + g.w, y: g.y + g.h }
        : ref.corner === 'ne'
          ? { x: g.x, y: g.y + g.h }
          : ref.corner === 'se'
            ? { x: g.x, y: g.y }
            : { x: g.x + g.w, y: g.y };
    const r = normRect(fixed, q);
    return { kind: 'rect', ...r };
  }
  if (g.kind === 'polygon' && ref.kind === 'poly') {
    const points = g.points.map((v, i) => (i === ref.index ? q : v));
    return { kind: 'polygon', points };
  }
  return g;
}

export function insertPolygonVertex(g: PolygonGeometry, index: number, p: NormPoint): Geometry {
  const points = [...g.points];
  points.splice(index, 0, clampNorm(p));
  return { kind: 'polygon', points };
}

export function removePolygonVertex(g: PolygonGeometry, index: number): Geometry {
  if (g.points.length <= 3) return g; // un polígono necesita 3 vértices
  return { kind: 'polygon', points: g.points.filter((_, i) => i !== index) };
}

/** Vértices arrastrables de una forma, ya en espacio normalizado. */
export function verticesOf(g: Geometry): readonly { ref: VertexRef; at: NormPoint }[] {
  switch (g.kind) {
    case 'pin':
      return [{ ref: { kind: 'pin' }, at: g.point }];
    case 'arrow':
      return [
        { ref: { kind: 'arrow', end: 'tail' }, at: g.tail },
        { ref: { kind: 'arrow', end: 'head' }, at: g.head },
      ];
    case 'rect':
      return [
        { ref: { kind: 'rect', corner: 'nw' }, at: { x: g.x, y: g.y } },
        { ref: { kind: 'rect', corner: 'ne' }, at: { x: g.x + g.w, y: g.y } },
        { ref: { kind: 'rect', corner: 'se' }, at: { x: g.x + g.w, y: g.y + g.h } },
        { ref: { kind: 'rect', corner: 'sw' }, at: { x: g.x, y: g.y + g.h } },
      ];
    case 'polygon':
      return g.points.map((at, index) => ({ ref: { kind: 'poly', index } as VertexRef, at }));
  }
}

/* ────────────────────────── ayudas de dibujo ────────────────────────── */

/** Ruta SVG/Canvas de una forma, en espacio de CONTENIDO. */
export function pathOf(g: Geometry, n: Size): string {
  switch (g.kind) {
    case 'pin': {
      const p = fromNorm(g.point, n);
      return `M ${p.x} ${p.y}`;
    }
    case 'arrow': {
      const a = fromNorm(g.tail, n);
      const b = fromNorm(g.head, n);
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    }
    case 'rect': {
      const p = fromNorm({ x: g.x, y: g.y }, n);
      return `M ${p.x} ${p.y} h ${g.w * n.w} v ${g.h * n.h} h ${-g.w * n.w} Z`;
    }
    case 'polygon': {
      const pts = g.points.map((q) => fromNorm(q, n));
      if (pts.length === 0) return '';
      return `M ${pts.map((q) => `${q.x} ${q.y}`).join(' L ')} Z`;
    }
  }
}

export function arrowGeom(g: ArrowGeometry, n: Size): { tail: Pt; head: Pt; angleDeg: number } {
  const tail = fromNorm(g.tail, n);
  const head = fromNorm(g.head, n);
  // atan2 en espacio de CONTENIDO (isótropo). En normalizado la punta apuntaría torcida
  // en cuanto la imagen no fuese cuadrada.
  const angleDeg = (Math.atan2(head.y - tail.y, head.x - tail.x) * 180) / Math.PI;
  return { tail, head, angleDeg };
}

export function rectPx(g: RectGeometry, n: Size): Box {
  return { x: g.x * n.w, y: g.y * n.h, w: g.w * n.w, h: g.h * n.h };
}

export function boxPx(b: Box, n: Size): Box {
  return { x: b.x * n.w, y: b.y * n.h, w: b.w * n.w, h: b.h * n.h };
}
