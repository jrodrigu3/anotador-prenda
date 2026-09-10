import { Size, ViewBox } from '../models/geometry.model';

/**
 * Con `preserveAspectRatio="xMidYMid meet"`, si la relación de aspecto del viewBox no
 * coincide con la del elemento, el navegador añade bandas y la región VISIBLE es mayor que
 * el viewBox. Eso rompe el recorte del paneo y el "ajustar a pantalla".
 *
 * Expandiendo el viewBox a la relación del elemento tras cada resize y cada zoom,
 * región visible ≡ viewBox y `escala = anchoElemento / vb.w` exactamente.
 */
export function syncAspect(vb: ViewBox, elW: number, elH: number): ViewBox {
  if (elW <= 0 || elH <= 0) return vb;
  const elAR = elW / elH;
  const vbAR = vb.w / vb.h;
  if (Math.abs(elAR - vbAR) < 1e-9) return vb;
  if (vbAR < elAR) {
    const w = vb.h * elAR; // demasiado estrecho -> ensanchar
    return { x: vb.x - (w - vb.w) / 2, y: vb.y, w, h: vb.h };
  }
  const h = vb.w / elAR; // demasiado ancho -> crecer en alto
  return { x: vb.x, y: vb.y - (h - vb.h) / 2, w: vb.w, h };
}

export function fitToScreen(nat: Size, elW: number, elH: number, padPct = 0.04): ViewBox {
  const pad = Math.max(nat.w, nat.h) * padPct;
  return syncAspect({ x: -pad, y: -pad, w: nat.w + 2 * pad, h: nat.h + 2 * pad }, elW, elH);
}

/** Encuadra una caja de contenido con margen; se usa al saltar a una marca desde la lista. */
export function frameBox(
  box: { x: number; y: number; w: number; h: number },
  elW: number,
  elH: number,
  padFactor = 2.2,
  minSide = 1,
): ViewBox {
  const side = Math.max(box.w, box.h, minSide) * padFactor;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return syncAspect({ x: cx - side / 2, y: cy - side / 2, w: side, h: side }, elW, elH);
}
