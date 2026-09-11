import { Box } from '../models/geometry.model';

/**
 * Contorno de la prenda dentro de la foto, normalizado.
 *
 * Por qué hace falta: sin él la posición se mide contra la FOTO. Si la prenda no está
 * centrada, o sobra fondo por arriba, «tercio medio» cae en un sitio distinto del que el
 * patronista tiene en la cabeza. Midiendo contra la prenda, «a 40 % de su alto desde el
 * hombro» significa lo mismo con cualquier encuadre.
 *
 * La detección es deliberadamente tonta —fondo liso, que es como se fotografían los planos
 * y los productos— y **prefiere rendirse a acertar por casualidad**: si el resultado no es
 * plausible devuelve `null` y todo el sistema cae a la foto entera, diciéndolo.
 */
const WORK_EDGE = 200;
/** Un píxel se considera prenda si se aleja del fondo más que esto (0..255 por canal). */
const DIFF_THRESHOLD = 26;
/** Una fila o columna cuenta si al menos este tanto por uno de sus píxeles es prenda. */
const LINE_COVERAGE = 0.02;

export function detectGarmentBox(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): Box | null {
  const scale = Math.min(1, WORK_EDGE / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));

  const small = new OffscreenCanvas(w, h);
  const sctx = small.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sctx) return null;
  sctx.imageSmoothingQuality = 'low';
  sctx.drawImage(ctx.canvas, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = sctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // lienzo contaminado: no es un fallo del que haya que quejarse
  } finally {
    small.width = 0;
    small.height = 0;
  }

  const bg = borderMedian(data, w, h);

  const rowHits = new Uint16Array(h);
  const colHits = new Uint16Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const diff =
        Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (diff > DIFF_THRESHOLD * 3) {
        rowHits[y]++;
        colHits[x]++;
      }
    }
  }

  const top = firstIndex(rowHits, w * LINE_COVERAGE, false);
  const bottom = firstIndex(rowHits, w * LINE_COVERAGE, true);
  const left = firstIndex(colHits, h * LINE_COVERAGE, false);
  const right = firstIndex(colHits, h * LINE_COVERAGE, true);
  if (top < 0 || bottom < 0 || left < 0 || right < 0 || bottom <= top || right <= left) {
    return null;
  }

  const box: Box = {
    x: left / w,
    y: top / h,
    w: (right - left + 1) / w,
    h: (bottom - top + 1) / h,
  };

  // Ni una mota de polvo ni «toda la foto»: en ambos casos la detección no aporta nada.
  const area = box.w * box.h;
  if (area < 0.08 || area > 0.985) return null;
  return box;
}

/** Mediana por canal de los píxeles del borde: la estimación de fondo más barata que aguanta. */
function borderMedian(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const channels: number[][] = [[], [], []];
  const push = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    channels[0].push(data[i]);
    channels[1].push(data[i + 1]);
    channels[2].push(data[i + 2]);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  return [median(channels[0]), median(channels[1]), median(channels[2])];
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function firstIndex(hits: Uint16Array, threshold: number, fromEnd: boolean): number {
  if (fromEnd) {
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i] >= threshold) return i;
    return -1;
  }
  for (let i = 0; i < hits.length; i++) if (hits[i] >= threshold) return i;
  return -1;
}
