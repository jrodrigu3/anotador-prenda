import { Box, Geometry, NormPoint, Pt, Size } from '../../../core/models/geometry.model';
import { MarkStyle } from '../../../core/render/marker-style';
import { anchorOf, fromNorm } from '../../../core/util/geometry.util';

export type Ctx = OffscreenCanvasRenderingContext2D;

/**
 * Triple trazo: negro ancho -> blanco medio -> acento fino.
 *
 * Es lo que hace que la marca se lea sobre cualquier color de tela: sobre tela clara manda
 * el negro, sobre tela oscura manda el blanco, y el acento solo aporta identidad visual.
 * Con dos trazos ya funciona; el tercero es estética.
 */
export function strokeTriple(ctx: Ctx, path: Path2D, s: MarkStyle, accent = s.accent): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = s.lw + s.halo * 2;
  ctx.stroke(path);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s.lw + s.halo;
  ctx.stroke(path);
  ctx.strokeStyle = accent;
  ctx.lineWidth = s.lw;
  ctx.stroke(path);
}

/**
 * MIRILLA ABIERTA: círculo más cuatro brazos que NO llegan al centro.
 *
 * Es la pieza que impide tapar el detalle. El centro geométrico —el punto exacto del que
 * habla la nota— queda virgen, así que el modelo puede ver la costura o el borde que hay
 * debajo. Un marcador relleno destruiría justo la información que se quiere transmitir.
 */
export function drawReticle(ctx: Ctx, p: Pt, s: MarkStyle): void {
  const gap = s.r * 0.45;
  const path = new Path2D();
  path.arc(p.x, p.y, s.r * 0.85, 0, Math.PI * 2);
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    path.moveTo(p.x + dx * gap, p.y + dy * gap);
    path.lineTo(p.x + dx * s.r * 1.65, p.y + dy * s.r * 1.65);
  }
  strokeTriple(ctx, path, s);

  // Punto mínimo en el centro exacto: marca sin ocultar.
  const dot = new Path2D();
  dot.arc(p.x, p.y, s.lw * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill(dot);
}

export function badgeBox(c: Pt, label: string, s: MarkStyle, measure: (t: string) => number): Box {
  const tw = measure(label);
  // Píldora, no círculo: así el dígito no encoge al pasar de 9 a 10.
  const w = Math.max(2 * s.r, tw + s.r * 1.15);
  const h = 2 * s.r;
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/**
 * Insignia: placa BLANCA con dígitos NEGROS. Es el par de máximo contraste local y el que
 * más se parece a la distribución de dígitos impresos con la que se entrenaron los modelos,
 * que es exactamente lo que se quiere: convertir la localización en una tarea de OCR.
 */
export function drawBadge(ctx: Ctx, c: Pt, label: string, s: MarkStyle): void {
  ctx.font = s.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const b = badgeBox(c, label, s, (t) => ctx.measureText(t).width);

  const path = new Path2D();
  path.roundRect(b.x, b.y, b.w, b.h, b.h / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fill(path);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = s.lw * 2;
  ctx.stroke(path);
  ctx.strokeStyle = s.accent;
  ctx.lineWidth = s.lw * 0.9;
  ctx.stroke(path);

  ctx.fillStyle = '#000000';
  ctx.fillText(label, c.x, c.y + s.r * 0.05); // corrección óptica de la línea base
}

/**
 * Línea guía globo -> mirilla. Se dibuja ANTES que la insignia: la placa blanca opaca
 * recorta su extremo sola. Del lado del ancla se deja un hueco explícito.
 */
export function drawLeader(ctx: Ctx, anchor: Pt, badgeCenter: Pt, s: MarkStyle): void {
  const a = Math.atan2(badgeCenter.y - anchor.y, badgeCenter.x - anchor.x);
  const start = {
    x: anchor.x + Math.cos(a) * s.r * 1.75,
    y: anchor.y + Math.sin(a) * s.r * 1.75,
  };
  const path = new Path2D();
  path.moveTo(start.x, start.y);
  path.lineTo(badgeCenter.x, badgeCenter.y);
  strokeTriple(ctx, path, { ...s, lw: s.lw * 0.85, halo: s.halo * 0.8 });
}

/** Dibuja la forma (no la mirilla ni la insignia) en el sistema de coordenadas dado. */
export function drawShape(
  ctx: Ctx,
  g: Geometry,
  project: (p: NormPoint) => Pt,
  s: MarkStyle,
): void {
  switch (g.kind) {
    case 'pin':
      return; // solo mirilla

    case 'arrow': {
      const tail = project(g.tail);
      const head = project(g.head);
      const path = new Path2D();
      path.moveTo(tail.x, tail.y);
      path.lineTo(head.x, head.y);
      strokeTriple(ctx, path, s);
      drawArrowHead(ctx, tail, head, s);
      return;
    }

    case 'rect': {
      const a = project({ x: g.x, y: g.y });
      const b = project({ x: g.x + g.w, y: g.y + g.h });
      const path = new Path2D();
      path.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      strokeTriple(ctx, path, s);
      return;
    }

    case 'polygon': {
      if (g.points.length < 2) return;
      const pts = g.points.map(project);
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) path.lineTo(p.x, p.y);
      path.closePath();
      // Relleno al 10 %: suficiente para leer la región, insuficiente para ocultar la tela.
      ctx.fillStyle = withAlpha(s.accent, 0.1);
      ctx.fill(path);
      strokeTriple(ctx, path, s);
      return;
    }
  }
}

function drawArrowHead(ctx: Ctx, tail: Pt, head: Pt, s: MarkStyle): void {
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  const len = s.r * 1.5;
  const path = new Path2D();
  path.moveTo(head.x, head.y);
  path.lineTo(head.x - Math.cos(angle - 0.44) * len, head.y - Math.sin(angle - 0.44) * len);
  path.lineTo(head.x - Math.cos(angle) * len * 0.66, head.y - Math.sin(angle) * len * 0.66);
  path.lineTo(head.x - Math.cos(angle + 0.44) * len, head.y - Math.sin(angle + 0.44) * len);
  path.closePath();
  ctx.fillStyle = '#000000';
  ctx.lineWidth = s.halo;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(path);
  ctx.fill(path);
  ctx.fillStyle = s.accent;
  ctx.fill(path);
}

export function anchorPx(g: Geometry, n: Size): Pt {
  return fromNorm(anchorOf(g), n);
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

/**
 * `drawImage` con factor < 0,5 en un paso se salta píxeles: costuras finas y estampados se
 * aliasean justo donde importa. Se reduce a mitades sucesivas.
 */
export function drawDownscaled(
  ctx: Ctx,
  src: ImageBitmap | OffscreenCanvas,
  w: number,
  h: number,
): void {
  let cur: ImageBitmap | OffscreenCanvas = src;
  let cw = src.width;
  let ch = src.height;
  while (cw > w * 2 && ch > h * 2) {
    const nw = Math.max(w, Math.round(cw / 2));
    const nh = Math.max(h, Math.round(ch / 2));
    const tmp = new OffscreenCanvas(nw, nh);
    const tctx = tmp.getContext('2d', { alpha: false })!;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(cur, 0, 0, nw, nh);
    if (cur !== src) (cur as OffscreenCanvas).width = 0;
    cur = tmp;
    cw = nw;
    ch = nh;
  }
  ctx.drawImage(cur, 0, 0, w, h);
  if (cur !== src) (cur as OffscreenCanvas).width = 0;
}

/** Placa blanca con texto negro: para etiquetas de vista y pies de recorte. */
export function drawPlateText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  font: string,
  padding: number,
  align: 'left' | 'right' = 'left',
): void {
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const m = ctx.measureText(text);
  const h = padding * 2 + (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || padding * 2);
  const w = m.width + padding * 2;
  const px = align === 'left' ? x : x - w;
  const plate = new Path2D();
  plate.roundRect(px, y - h / 2, w, h, h * 0.28);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill(plate);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1.5, padding * 0.22);
  ctx.stroke(plate);
  ctx.fillStyle = '#000000';
  ctx.fillText(text, px + padding, y);
}
