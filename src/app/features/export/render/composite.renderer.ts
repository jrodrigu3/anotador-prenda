import { NormPoint, Pt, Size } from '../../../core/models/geometry.model';
import { ACCENT, COMPOSITE_LONG_EDGE, markStyle } from '../../../core/render/marker-style';
import { placeBadges } from './badge-layout';
import {
  anchorPx,
  Ctx,
  drawBadge,
  drawDownscaled,
  drawLeader,
  drawPlateText,
  drawReticle,
  drawShape,
} from './draw-common';
import { RenderAnnotation } from './render.types';

export interface CompositeResult {
  readonly blob: Blob;
  /** Área de imagen (sin banda de leyenda): el marco de las coordenadas normalizadas. */
  readonly size: Size;
  /** Lienzo completo del archivo. */
  readonly canvasSize: Size;
  readonly scale: number;
  readonly badgeCenters: readonly {
    id: string;
    normalized: NormPoint;
    absolutePx: Pt;
  }[];
  readonly warnings: readonly string[];
}

/**
 * La imagen COMPUESTA: el mapa. Muestra dónde cae cada marca respecto de la prenda entera.
 *
 * Se renderiza directamente a 1568 px de lado largo, que es el tamaño al que los modelos de
 * visión reescalan de todos modos. Dibujar sobre 4000 px y confiar en que los marcadores
 * sobrevivan a ese reescalado es lo que arruina la técnica — y no se ve en el editor.
 * Dibujando al tamaño final, el tamaño de insignia es exacto y no hay resampleado sobre los
 * trazos. El detalle perdido se recupera con los recortes.
 */
export async function renderComposite(
  source: ImageBitmap,
  natural: Size,
  annotations: readonly RenderAnnotation[],
  opts: {
    viewShort: string;
    bundleId: string;
    dateLabel: string;
    legendBand: boolean;
    longEdge?: number;
  },
): Promise<CompositeResult> {
  const longEdge = opts.longEdge ?? COMPOSITE_LONG_EDGE;
  const k = Math.min(1, longEdge / Math.max(natural.w, natural.h));
  const W = Math.max(1, Math.round(natural.w * k));
  const H = Math.max(1, Math.round(natural.h * k));

  const s = markStyle(W, H);
  const legendRows = opts.legendBand ? Math.ceil(annotations.length / 2) : 0;
  const bandH = legendRows > 0 ? Math.round(s.r * 1.4 * legendRows + s.r * 2.2) : 0;

  const canvas = new OffscreenCanvas(W, H + bandH);
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H + bandH);
  drawDownscaled(ctx, source, W, H);

  const placement = placeBadges(annotations, { w: W, h: H }, natural, s, (t) => {
    ctx.font = s.font;
    return ctx.measureText(t).width;
  });

  const scaled = (p: NormPoint): Pt => ({ x: p.x * W, y: p.y * H });
  const anchorFor = (a: RenderAnnotation): Pt => {
    const p = anchorPx(a.geometry, natural);
    return { x: p.x * (W / natural.w), y: p.y * (H / natural.h) };
  };

  // Orden de pintado: guía -> forma -> mirilla -> insignia. La placa opaca de la insignia
  // recorta el extremo de su propia guía, que es justo lo que se quiere.
  for (const a of annotations) {
    const c = placement.byId.get(a.id);
    if (c) drawLeader(ctx, anchorFor(a), c, s);
  }
  for (const a of annotations) {
    drawShape(ctx, a.geometry, scaled, { ...s, accent: ACCENT[a.geometry.kind] });
  }
  for (const a of annotations) {
    drawReticle(ctx, anchorFor(a), { ...s, accent: ACCENT[a.geometry.kind] });
  }
  for (const a of annotations) {
    const c = placement.byId.get(a.id);
    if (c) drawBadge(ctx, c, String(a.number), { ...s, accent: ACCENT[a.geometry.kind] });
  }

  drawPlateText(ctx, opts.viewShort, s.r * 0.7, s.r * 1.4, s.font, s.r * 0.34, 'left');
  drawPlateText(
    ctx,
    `${opts.bundleId} · ${opts.dateLabel}`,
    W - s.r * 0.7,
    H + bandH - s.r * 0.8,
    s.smallFont,
    s.r * 0.24,
    'right',
  );

  if (bandH > 0) drawLegend(ctx, annotations, W, H, bandH, s.smallFont, s.r);

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  canvas.width = 0;
  canvas.height = 0;

  const badgeCenters = annotations.map((a) => {
    const c = placement.byId.get(a.id) ?? anchorFor(a);
    return {
      id: a.id,
      normalized: { x: c.x / W, y: c.y / H },
      absolutePx: { x: Math.round((c.x / W) * natural.w), y: Math.round((c.y / H) * natural.h) },
    };
  });

  const warnings = placement.crowded.length
    ? [
        `Las marcas ${placement.crowded.join(', ')} quedaron demasiado juntas: sus globos pueden ` +
          `solaparse. Sepáralas o divídelas en dos vistas.`,
      ]
    : [];

  return {
    blob,
    size: { w: W, h: H },
    canvasSize: { w: W, h: H + bandH },
    scale: k,
    badgeCenters,
    warnings,
  };
}

/** Solo número y pieza. La nota completa vive en el JSON: el texto pequeño se pierde. */
function drawLegend(
  ctx: Ctx,
  annotations: readonly RenderAnnotation[],
  W: number,
  H: number,
  bandH: number,
  font: string,
  r: number,
): void {
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, H, W, bandH);
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H + 1);
  ctx.lineTo(W, H + 1);
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const rowH = r * 1.4;
  const colW = W / 2;
  annotations.forEach((a, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = r * 0.8 + col * colW;
    const y = H + r * 1.2 + row * rowH;
    ctx.fillText(`${a.number} — ${a.partLabel}`, x, y);
  });
}
