import { inject, Service } from '@angular/core';
import { ImageRecord } from '../db/db.schema';
import { ImageRef } from '../models/project.model';
import { ImageRepository } from '../repositories/image.repository';
import { newId } from '../util/id.util';
import { detectGarmentBox } from './garment-box';

/**
 * Tope de lado largo al importar. Dos motivos:
 *  - iOS Safari limita el área de canvas a ~16,7 Mpx y, al superarlo, devuelve un canvas
 *    EN BLANCO sin lanzar error: el fallo más difícil de diagnosticar del proyecto.
 *  - 4000 px de lado largo sobran para recortes de detalle a resolución nativa.
 */
export const MAX_LONG_EDGE = 4000;

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
];

export class ImageImportError extends Error {}

@Service()
export class ImageImportService {
  private readonly images = inject(ImageRepository);

  /**
   * `File` -> bitmap normalizado y guardado.
   *
   * Aquí, y SOLO aquí, existe EXIF. Una foto de móvil con `Orientation=6` se dibuja tumbada
   * en canvas y dejaría todas las coordenadas normalizadas giradas 90 grados. Se decodifica
   * con la orientación aplicada, se recodifica con ella ya horneada y a partir de este punto
   * la orientación EXIF deja de existir en toda la aplicación.
   */
  async import(file: File, projectId: string): Promise<ImageRef> {
    if (file.type && !ACCEPTED.includes(file.type)) {
      throw new ImageImportError(`Formato no admitido: ${file.type}`);
    }

    let source: ImageBitmap;
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (cause) {
      throw new ImageImportError('No se pudo leer la imagen. ¿Está corrupta?', { cause });
    }

    const k = Math.min(1, MAX_LONG_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * k));
    const height = Math.max(1, Math.round(source.height * k));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) throw new ImageImportError('El navegador no permite crear un lienzo 2D.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawDownscaled(ctx, source, width, height);
    source.close();

    assertNotBlank(ctx, width, height);

    // Se detecta una sola vez, aquí: a partir de ahora toda posición se mide contra la
    // prenda y no contra el encuadre de la foto.
    const garmentBox = detectGarmentBox(ctx, width, height);

    // PNG solo si la imagen es un plano/flat vectorial: pocos colores, líneas duras. Para
    // una foto, PNG multiplica el peso por diez sin ganar nada.
    const mimeType: 'image/jpeg' | 'image/png' = looksLikeFlat(ctx, width, height)
      ? 'image/png'
      : 'image/jpeg';
    const blob = await canvas.convertToBlob(
      mimeType === 'image/jpeg' ? { type: 'image/jpeg', quality: 0.95 } : { type: 'image/png' },
    );
    canvas.width = 0;
    canvas.height = 0;

    const record: ImageRecord = {
      id: newId(),
      projectId,
      blob,
      mimeType,
      naturalWidth: width,
      naturalHeight: height,
      byteSize: blob.size,
      createdAt: Date.now(),
    };
    await this.images.put(record);

    return {
      imageId: record.id,
      fileName: file.name || 'imagen',
      mimeType,
      byteSize: blob.size,
      naturalWidth: width,
      naturalHeight: height,
      garmentBox,
    };
  }
}

/**
 * `drawImage` con un factor menor que 0,5 en un solo paso se salta píxeles y aliasea justo
 * lo que importa aquí: costuras finas y estampados. Se reduce a mitades sucesivas.
 */
export function drawDownscaled(
  ctx: OffscreenCanvasRenderingContext2D,
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

/** El canvas silenciosamente vacío de iOS: comprobarlo cuesta un píxel. */
function assertNotBlank(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): void {
  const samples = [
    [1, 1],
    [Math.floor(w / 2), Math.floor(h / 2)],
    [w - 2, h - 2],
  ] as const;
  const allWhite = samples.every(([x, y]) => {
    const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data;
    return d[0] === 255 && d[1] === 255 && d[2] === 255;
  });
  if (allWhite) {
    throw new ImageImportError(
      'La imagen se decodificó en blanco. Suele pasar con fotos enormes en Safari: prueba con una versión más pequeña.',
    );
  }
}

/** Heurística barata: si hay menos de 512 colores distintos en la muestra, es un plano. */
function looksLikeFlat(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): boolean {
  const side = Math.min(100, w, h);
  const data = ctx.getImageData(
    Math.floor((w - side) / 2),
    Math.floor((h - side) / 2),
    side,
    side,
  ).data;
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4 * 3) {
    seen.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
    if (seen.size >= 512) return false;
  }
  return true;
}
