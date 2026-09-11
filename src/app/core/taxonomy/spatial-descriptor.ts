import { Box, NormPoint } from '../models/geometry.model';
import { ViewId } from '../models/project.model';

/**
 * Dónde cae la marca, dicho como lo diría un patronista.
 *
 * La versión anterior medía contra la FOTO («tercio medio, celda C2 de una rejilla 5×5»).
 * Eso se desplaza en cuanto la prenda no está centrada o sobra fondo, y una rejilla
 * arbitraria no significa nada en un taller. Ahora se mide contra el **contorno de la
 * prenda**: zona anatómica, distancia al centro y al hombro en porcentaje de la propia
 * prenda y —si se declara su alto real— en centímetros.
 *
 * EL ESCOLLO DE DOMINIO MÁS CARO DEL PROYECTO sigue vigente: en confección «manga
 * izquierda» es la del PORTADOR, no la de la imagen. Se emiten siempre las dos lecturas.
 */
export type WearerSide = 'izquierda' | 'derecha' | 'centro';
export type ImageSide = 'izquierda' | 'derecha' | 'centro';

export interface SpatialDescriptor {
  /** Frase completa en español, lista para que el modelo la lea tal cual. */
  readonly text: string;
  /** Zona anatómica de la prenda. */
  readonly zone: string;
  /** Referencia más cercana: centro delantero, costado, hombro… */
  readonly landmark: string;
  /** % del ALTO DE LA PRENDA desde su borde superior. */
  readonly fromTopPct: number;
  /** % del ANCHO DE LA PRENDA desde su eje central, sin signo. */
  readonly fromCenterPct: number;
  /** Referido a la IMAGEN tal como se ve. */
  readonly imageSide: ImageSide;
  /** Referido a QUIEN VISTE la prenda. En la vista frontal es el contrario. */
  readonly wearerSide: WearerSide;
  /** Centímetros aproximados, solo si se declaró el alto real de la prenda. */
  readonly approxFromTopCm: number | null;
  readonly approxFromCenterCm: number | null;
  /** % sobre la FOTO. Respaldo para que el modelo cruce con los píxeles. */
  readonly photoPctFromLeft: number;
  readonly photoPctFromTop: number;
  /** `true` si no se detectó el contorno y se midió sobre la foto entera. */
  readonly measuredOnPhoto: boolean;
}

export interface SpatialOptions {
  /** Contorno de la prenda, normalizado sobre la foto. `null` = medir sobre la foto. */
  readonly garmentBox?: Box | null;
  /** Alto real de la prenda en cm, si se conoce. */
  readonly heightCm?: number | null;
}

const FULL_FRAME: Box = { x: 0, y: 0, w: 1, h: 1 };

/** Bandas verticales sobre el alto de la PRENDA. */
const ZONES: readonly { max: number; name: string }[] = [
  { max: 0.1, name: 'escote y hombros' },
  { max: 0.25, name: 'pecho alto / canesú' },
  { max: 0.45, name: 'pecho' },
  { max: 0.62, name: 'cintura' },
  { max: 0.8, name: 'cadera' },
  { max: Infinity, name: 'bajo' },
];

export function deriveSpatial(
  p: NormPoint,
  view: ViewId,
  opts: SpatialOptions = {},
): SpatialDescriptor {
  const box = opts.garmentBox ?? FULL_FRAME;
  const measuredOnPhoto = !opts.garmentBox;

  // Coordenadas dentro de la prenda, 0..1. Se recortan: una marca puede caer justo fuera
  // del contorno detectado (una manga extendida, una sombra) y no por eso deja de existir.
  const gx = clamp01((p.x - box.x) / Math.max(box.w, 1e-6));
  const gy = clamp01((p.y - box.y) / Math.max(box.h, 1e-6));

  const zone = ZONES.find((z) => gy < z.max)!.name;

  const dx = gx - 0.5; // negativo = izquierda de la imagen
  const imageSide: ImageSide = Math.abs(dx) < 0.08 ? 'centro' : dx < 0 ? 'izquierda' : 'derecha';

  // De frente, la izquierda de la imagen es la DERECHA del portador. De espaldas coinciden.
  const wearerSide: WearerSide =
    imageSide === 'centro'
      ? 'centro'
      : view === 'frente'
        ? imageSide === 'izquierda'
          ? 'derecha'
          : 'izquierda'
        : imageSide;

  const fromTopPct = Math.round(gy * 100);
  const fromCenterPct = Math.round(Math.abs(dx) * 200); // 100 % = del centro al costado

  const height = opts.heightCm ?? null;
  const approxFromTopCm = height ? round1(gy * height) : null;
  // El ancho se estima con la relación de aspecto del contorno: no es una medida, es un orden
  // de magnitud, y se etiqueta como aproximado en el texto.
  const widthCm = height ? (height * box.w) / Math.max(box.h, 1e-6) : null;
  const approxFromCenterCm = widthCm ? round1(Math.abs(dx) * widthCm) : null;

  const landmark = nearestLandmark(gy, dx, view);

  return {
    text: buildText({
      zone,
      landmark,
      fromTopPct,
      fromCenterPct,
      wearerSide,
      imageSide,
      approxFromTopCm,
      approxFromCenterCm,
      measuredOnPhoto,
    }),
    zone,
    landmark,
    fromTopPct,
    fromCenterPct,
    imageSide,
    wearerSide,
    approxFromTopCm,
    approxFromCenterCm,
    photoPctFromLeft: Math.round(p.x * 100),
    photoPctFromTop: Math.round(p.y * 100),
    measuredOnPhoto,
  };
}

/** La referencia de patronaje más cercana. Es lo que se dice en un taller, no una celda. */
function nearestLandmark(gy: number, dx: number, view: ViewId): string {
  const eje = view === 'frente' ? 'centro delantero' : 'centro espalda';
  const a = Math.abs(dx);
  if (gy < 0.1) return a < 0.12 ? 'escote' : a > 0.3 ? 'hombro' : 'entre escote y hombro';
  if (gy > 0.88) return a < 0.12 ? `bajo, sobre el ${eje}` : 'bajo, hacia el costado';
  if (a < 0.08) return eje;
  if (a > 0.38) return 'costado';
  return `entre el ${eje} y el costado`;
}

function buildText(d: {
  zone: string;
  landmark: string;
  fromTopPct: number;
  fromCenterPct: number;
  wearerSide: WearerSide;
  imageSide: ImageSide;
  approxFromTopCm: number | null;
  approxFromCenterCm: number | null;
  measuredOnPhoto: boolean;
}): string {
  const side =
    d.wearerSide === 'centro'
      ? 'sobre el eje central'
      : `hacia el lado ${d.wearerSide === 'izquierda' ? 'IZQUIERDO' : 'DERECHO'} de quien viste ` +
        `la prenda (a la ${d.imageSide} en la imagen)`;

  const cm =
    d.approxFromTopCm !== null && d.approxFromCenterCm !== null
      ? ` Equivale aproximadamente a ${fmt(d.approxFromTopCm)} cm por debajo del borde superior y ` +
        `${fmt(d.approxFromCenterCm)} cm del eje.`
      : '';

  const caveat = d.measuredOnPhoto
    ? ' AVISO: no se pudo detectar el contorno de la prenda, así que estos porcentajes están ' +
      'medidos sobre la FOTO entera, no sobre la prenda.'
    : '';

  return (
    `Zona: ${d.zone}. Referencia más cercana: ${d.landmark}. ` +
    `A ${d.fromTopPct} % del alto de la prenda desde su borde superior y a ${d.fromCenterPct} % ` +
    `del semiancho desde el eje, ${side}.${cm}${caveat}`
  );
}

/** Versión corta para la interfaz y para `aria-label`. */
export function shortPosition(d: SpatialDescriptor): string {
  const side =
    d.wearerSide === 'centro'
      ? 'centro'
      : `${d.imageSide} en la imagen · lado ${d.wearerSide === 'izquierda' ? 'izquierdo' : 'derecho'} de quien la viste`;
  return `${d.zone} · ${side}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}
