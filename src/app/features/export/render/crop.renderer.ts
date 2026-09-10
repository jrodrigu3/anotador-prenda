import { Box, NormPoint, Pt, Size } from '../../../core/models/geometry.model';
import { ACCENT, CROP, markStyle } from '../../../core/render/marker-style';
import { clamp } from '../../../core/util/math.util';
import {
  anchorPx,
  Ctx,
  drawBadge,
  drawLeader,
  drawPlateText,
  drawReticle,
  drawShape,
} from './draw-common';
import { cropBoxPx } from './crop-box';
import { RenderAnnotation, RenderedCrop } from './render.types';

/**
 * El RECORTE: la lupa. Se corta del bitmap ORIGINAL a resolución nativa, así que recupera
 * todo el detalle que la compuesta pierde al bajar a 1568 px.
 *
 * Lleva dos añadidos baratos con enorme retorno:
 *  - MINI-MAPA localizador en una esquina, con un recuadro rojo sobre la miniatura de la
 *    vista completa. Elimina el fallo "el recorte es un primer plano de tela y el modelo no
 *    sabe de dónde salió".
 *  - Franja de subtítulo `#3 · punta de cuello · FRENTE · zoom 3.1×`.
 */
export async function renderCrop(
  source: ImageBitmap,
  natural: Size,
  a: RenderAnnotation,
  overview: ImageBitmap,
  viewShort: string,
): Promise<RenderedCrop> {
  const box = cropBoxPx(a.geometry, natural);
  const scale = Math.min(CROP.out / box.w, CROP.maxUpscale);
  const out = Math.max(1, Math.round(box.w * scale));
  const capH = Math.round(out * 0.085);

  const canvas = new OffscreenCanvas(out, out + capH);
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx;
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, out, out + capH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, out, out);

  // El estilo se recalcula PARA EL RECORTE: la proporción correcta en su propio lienzo.
  const accent = ACCENT[a.geometry.kind];
  const s = markStyle(out, out, accent);

  const toCrop = (p: NormPoint): Pt => ({
    x: (p.x * natural.w - box.x) * scale,
    y: (p.y * natural.h - box.y) * scale,
  });

  drawShape(ctx, a.geometry, toCrop, s);

  const anchorNat = anchorPx(a.geometry, natural);
  const anchor: Pt = {
    x: (anchorNat.x - box.x) * scale,
    y: (anchorNat.y - box.y) * scale,
  };
  const badgeCenter: Pt = {
    x: clamp(anchor.x + s.r * 3.2, s.r * 1.6, out - s.r * 1.6),
    y: clamp(anchor.y - s.r * 3.2, s.r * 1.6, out - s.r * 1.6),
  };
  drawLeader(ctx, anchor, badgeCenter, s);
  drawReticle(ctx, anchor, s);
  drawBadge(ctx, badgeCenter, String(a.number), s);

  drawLocatorInset(ctx, overview, box, natural, out);
  drawCaption(
    ctx,
    `#${a.number} · ${a.partLabel} · ${viewShort} · zoom ${scale.toFixed(1)}×`,
    out,
    capH,
  );

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  canvas.width = 0;
  canvas.height = 0;

  return { id: a.id, number: a.number, blob, box, zoom: scale, outSize: out };
}

function drawLocatorInset(
  ctx: Ctx,
  overview: ImageBitmap,
  box: Box,
  natural: Size,
  out: number,
): void {
  const iw = Math.round(out * 0.22);
  const ih = Math.max(1, Math.round(iw * (natural.h / natural.w)));
  const x = out - iw - Math.round(out * 0.02);
  const y = Math.round(out * 0.02);

  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 4, iw + 8, ih + 8);
  ctx.drawImage(overview, x, y, iw, ih);
  ctx.globalAlpha = 1;

  const rx = x + (box.x / natural.w) * iw;
  const ry = y + (box.y / natural.h) * ih;
  const rw = Math.max(3, (box.w / natural.w) * iw);
  const rh = Math.max(3, (box.h / natural.h) * ih);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ff1e56';
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(x - 4, y - 4, iw + 8, ih + 8);
  ctx.restore();
}

function drawCaption(ctx: Ctx, text: string, out: number, capH: number): void {
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, out, out, capH);
  drawPlateText(
    ctx,
    text,
    Math.round(out * 0.02),
    out + capH / 2,
    `600 ${Math.round(capH * 0.42)}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
    Math.round(capH * 0.16),
    'left',
  );
}

/** Miniatura de la vista completa, reutilizada como mini-mapa en todos sus recortes. */
export async function makeOverview(source: ImageBitmap, natural: Size): Promise<ImageBitmap> {
  const w = 320;
  const h = Math.max(1, Math.round((natural.h / natural.w) * w));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return bitmap;
}
