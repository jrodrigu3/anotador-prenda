import { AnnotationKind } from '../models/geometry.model';
import { clamp } from '../util/math.util';

/**
 * Tabla ÚNICA de constantes de marcador, consumida por los dos renderizadores.
 *
 * Y son dos reglas distintas, que es justo lo que se desincroniza si se duplican:
 *  - En PANTALLA el marcador es de tamaño constante en píxeles CSS a cualquier zoom.
 *  - En la EXPORTACIÓN es relativo a la resolución del lienzo de destino, porque el
 *    resultado tiene que ser determinista: la misma exportación con cualquier zoom.
 */

/** Píxeles CSS. Dentro de un grupo con `scale(upp)` estas cifras se leen tal cual. */
export const SCREEN = {
  pinRadius: 9,
  pinHalo: 12,
  /* Las zonas de impacto NO encogen con el dibujo: seguirían cumpliendo el mínimo táctil
     de WCAG 2.2 aunque la marca visible se afine. */
  pinHit: 20,
  pinFont: 11,
  strokeWidth: 2.5,
  haloWidth: 6,
  hitStroke: 18,
  handleSize: 8,
  handleHit: 22,
  arrowHead: 11,
  reticleRadius: 8,
  reticleArm: 15,
  reticleGap: 4,
} as const;

/** Color de acento por tipo de forma. La forma ya distingue; el color solo ayuda. */
export const ACCENT: Readonly<Record<AnnotationKind, string>> = {
  pin: '#ff1e56',
  arrow: '#ff8a00',
  rect: '#00b3a4',
  polygon: '#7c4dff',
};

export const ACCENT_DEFAULT = '#ff1e56';

/**
 * Lado largo del lienzo de la imagen compuesta.
 *
 * Es el tamaño al que los proveedores de visión reescalan de todos modos. Dibujar los
 * marcadores sobre 4000 px y confiar en que sobrevivan a ese reescalado es el error que
 * arruina la técnica entera — y no se ve en el editor. Renderizando directamente aquí, el
 * tamaño de insignia es exacto y no hay resampleado sobre los trazos.
 */
export const COMPOSITE_LONG_EDGE = 1568;

export interface MarkStyle {
  /** Radio de la insignia. */
  readonly r: number;
  readonly lw: number;
  readonly halo: number;
  readonly font: string;
  readonly smallFont: string;
  readonly accent: string;
}

/**
 * Estilo del marcador para un lienzo de exportación de W x H.
 *
 * `0.017 * D` da ~27 px de radio a 1568 px: diámetro del 3,4 % del lado largo y altura de
 * dígito ~31 px, muy por encima del umbral de OCR de cualquier modelo de visión.
 */
export function markStyle(W: number, H: number, accent: string = ACCENT_DEFAULT): MarkStyle {
  const D = Math.max(W, H);
  const r = clamp(0.017 * D, 16, 72);
  const family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  return {
    r,
    lw: Math.max(2, r * 0.16),
    halo: Math.max(3, r * 0.26),
    font: `700 ${Math.round(r * 1.15)}px ${family}`,
    smallFont: `600 ${Math.round(r * 0.72)}px ${family}`,
    accent,
  };
}

/** Reglas de recorte por anotación. Compuesta = mapa; recorte = lupa. */
export const CROP = {
  /** Resolución de salida objetivo del recorte. */
  out: 1280,
  /** Tope de ampliación: por encima solo se interpola papilla. */
  maxUpscale: 4,
  minSideFrac: 0.1,
  minSidePx: 192,
} as const;

/** Por encima de esto, las insignias empiezan a estorbarse entre sí. */
export const SOFT_MARK_LIMIT_PER_VIEW = 15;
