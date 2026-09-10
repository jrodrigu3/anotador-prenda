import { Box, Geometry, Size } from '../../../core/models/geometry.model';
import { CROP } from '../../../core/render/marker-style';
import { bboxOf, fromNorm } from '../../../core/util/geometry.util';
import { clamp } from '../../../core/util/math.util';

/**
 * Caja de recorte por tipo de anotación, en píxeles de la imagen ORIGINAL.
 *
 * Un `pin` no tiene extensión: todo su valor está en el contexto, así que se le da una
 * fracción fija de la imagen en vez de un cuadradito minúsculo. Las formas ya acotan solas,
 * así que solo necesitan relleno para situarse.
 *
 * Detalle que importa: al llegar al borde de la imagen la caja se DESPLAZA, no encoge. Así
 * una marca pegada al borde conserva el nivel de zoom pedido en vez de salir gigante.
 *
 * Función pura: se prueba sin canvas.
 */
export function cropBoxPx(g: Geometry, natural: Size): Box {
  const D = Math.max(natural.w, natural.h);
  let base: Box;

  switch (g.kind) {
    case 'pin': {
      const side = D * 0.2;
      const p = fromNorm(g.point, natural);
      base = { x: p.x - side / 2, y: p.y - side / 2, w: side, h: side };
      break;
    }
    case 'arrow': {
      const b = pxBox(bboxOf(g), natural);
      base = expand(b, Math.max(0.6 * Math.hypot(b.w, b.h), D * 0.05));
      break;
    }
    case 'rect':
    case 'polygon': {
      const b = pxBox(bboxOf(g), natural);
      base = expand(b, Math.max(0.35 * Math.max(b.w, b.h), D * 0.04));
      break;
    }
  }

  const minSide = Math.max(CROP.minSidePx, D * CROP.minSideFrac);
  const side = Math.min(Math.max(base.w, base.h, minSide), Math.min(natural.w, natural.h));
  const cx = base.x + base.w / 2;
  const cy = base.y + base.h / 2;

  return {
    x: Math.round(clamp(cx - side / 2, 0, natural.w - side)),
    y: Math.round(clamp(cy - side / 2, 0, natural.h - side)),
    w: Math.round(side),
    h: Math.round(side),
  };
}

function pxBox(b: Box, n: Size): Box {
  return { x: b.x * n.w, y: b.y * n.h, w: b.w * n.w, h: b.h * n.h };
}

function expand(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 };
}
