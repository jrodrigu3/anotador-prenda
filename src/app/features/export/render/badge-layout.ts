import { Box, Pt, Size } from '../../../core/models/geometry.model';
import { MarkStyle } from '../../../core/render/marker-style';
import { angularDistance, clamp, dist } from '../../../core/util/math.util';
import { anchorPx, badgeBox } from './draw-common';
import { RenderAnnotation } from './render.types';

const DIRS = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);
const RINGS = [3.0, 4.4, 6.2, 8.5];

export interface BadgePlacement {
  readonly byId: ReadonlyMap<string, Pt>;
  /** Marcas cuyo globo no cupo limpiamente. Se avisan en la UI, no se ocultan. */
  readonly crowded: readonly number[];
}

/**
 * Colocación de insignias con evitación de colisiones.
 *
 * Codicioso, en orden de número, 16 direcciones por 4 anillos, con función de puntuación.
 * El sesgo clave es empujar RADIALMENTE HACIA FUERA desde el centro de la imagen: en una
 * foto de prenda el fondo suele estar en la periferia, así que ahí el globo cae sobre fondo
 * liso en vez de sobre la tela, donde estorbaría y sería menos legible.
 *
 * Si tras los cuatro anillos no encuentra hueco limpio, lo REPORTA. Un solape silencioso es
 * una ambigüedad, y quien tiene que verla es el diseñador.
 */
export function placeBadges(
  annotations: readonly RenderAnnotation[],
  canvas: Size,
  natural: Size,
  s: MarkStyle,
  measure: (t: string) => number,
): BadgePlacement {
  const scale = { w: canvas.w / natural.w, h: canvas.h / natural.h };
  const cx = canvas.w / 2;
  const cy = canvas.h / 2;

  const anchors = annotations.map((a) => {
    const p = anchorPx(a.geometry, natural);
    return { x: p.x * scale.w, y: p.y * scale.h };
  });

  const placed: Box[] = [];
  const byId = new Map<string, Pt>();
  const crowded: number[] = [];

  annotations.forEach((a, i) => {
    const anchor = anchors[i];
    const outward = Math.atan2(anchor.y - cy, anchor.x - cx);
    const label = String(a.number);

    let best: Pt | null = null;
    let bestScore = -Infinity;

    for (const ring of RINGS) {
      for (const dir of DIRS) {
        const c = {
          x: anchor.x + Math.cos(dir) * s.r * ring,
          y: anchor.y + Math.sin(dir) * s.r * ring,
        };
        const box = badgeBox(c, label, s, measure);
        if (!fitsInside(box, canvas, s.r * 0.5)) continue;

        let score = -ring * 2 - angularDistance(dir, outward) * 3.5;

        for (const other of placed) {
          const overlap = overlapArea(inflate(box, s.r * 0.2), other);
          if (overlap > 0) score -= 200 + overlap / (s.r * s.r);
        }
        for (let j = 0; j < anchors.length; j++) {
          if (j === i) continue;
          if (dist(c, anchors[j]) < s.r * 2.4) score -= 90; // no sentarse sobre otro punto
        }
        // Una guía que atraviesa el globo de otra marca es exactamente la ambigüedad que
        // se quiere evitar: "¿el 4 sale de esta mirilla o de aquella?".
        if (segmentCrossesAny(anchor, c, placed)) score -= 40;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (bestScore > -50) break; // solución limpia en este anillo: no ampliar más
    }

    if (bestScore <= -50) crowded.push(a.number);

    const c = best ?? {
      x: clamp(anchor.x, s.r, canvas.w - s.r),
      y: clamp(anchor.y - s.r * 3, s.r, canvas.h - s.r),
    };
    byId.set(a.id, c);
    placed.push(badgeBox(c, label, s, measure));
  });

  return { byId, crowded };
}

function fitsInside(b: Box, canvas: Size, margin: number): boolean {
  return (
    b.x >= margin &&
    b.y >= margin &&
    b.x + b.w <= canvas.w - margin &&
    b.y + b.h <= canvas.h - margin
  );
}

function inflate(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 };
}

/** ¿El segmento a->b atraviesa alguna de las cajas ya colocadas? */
function segmentCrossesAny(a: Pt, b: Pt, boxes: readonly Box[]): boolean {
  return boxes.some((box) => segmentIntersectsBox(a, b, box));
}

/** Cohen–Sutherland: recorte de segmento contra rectángulo. */
function segmentIntersectsBox(a: Pt, b: Pt, box: Box): boolean {
  const xMin = box.x;
  const yMin = box.y;
  const xMax = box.x + box.w;
  const yMax = box.y + box.h;

  const code = (p: Pt): number =>
    (p.x < xMin ? 1 : 0) | (p.x > xMax ? 2 : 0) | (p.y < yMin ? 4 : 0) | (p.y > yMax ? 8 : 0);

  let [x0, y0, x1, y1] = [a.x, a.y, b.x, b.y];
  let c0 = code({ x: x0, y: y0 });
  let c1 = code({ x: x1, y: y1 });

  for (let guard = 0; guard < 8; guard++) {
    if (!(c0 | c1)) return true; // el segmento entra en la caja
    if (c0 & c1) return false; // ambos extremos fuera del mismo lado
    const out = c0 || c1;
    let x = 0;
    let y = 0;
    if (out & 8) {
      x = x0 + ((x1 - x0) * (yMax - y0)) / (y1 - y0);
      y = yMax;
    } else if (out & 4) {
      x = x0 + ((x1 - x0) * (yMin - y0)) / (y1 - y0);
      y = yMin;
    } else if (out & 2) {
      y = y0 + ((y1 - y0) * (xMax - x0)) / (x1 - x0);
      x = xMax;
    } else {
      y = y0 + ((y1 - y0) * (xMin - x0)) / (x1 - x0);
      x = xMin;
    }
    if (out === c0) {
      [x0, y0] = [x, y];
      c0 = code({ x: x0, y: y0 });
    } else {
      [x1, y1] = [x, y];
      c1 = code({ x: x1, y: y1 });
    }
  }
  return false;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
