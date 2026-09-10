/**
 * Geometría de una anotación.
 *
 * REGLA CENTRAL DEL PROYECTO: todas las coordenadas persistidas están normalizadas a
 * `[0..1]` contra el tamaño NATURAL de la imagen. Pero la matemática NUNCA se hace en
 * ese espacio: es anisótropo (`x/W`, `y/H` con `W != H`), así que las distancias mienten,
 * los ángulos giran mal y los círculos salen elipses. Se convierte a espacio de contenido
 * (píxeles naturales, isótropo) en la frontera y se calcula allí.
 */

/** Punto normalizado [0..1] respecto del tamaño natural de la imagen. */
export interface NormPoint {
  readonly x: number;
  readonly y: number;
}

/** Punto en píxeles: espacio de contenido (píxeles naturales) o de cliente (CSS px). */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Un punto concreto de la prenda. */
export interface PinGeometry {
  readonly kind: 'pin';
  readonly point: NormPoint;
}

/**
 * Flecha. La COLA (`tail`) solo indica desde dónde se mira; el ancla semántica —el punto
 * del que habla la nota— es la PUNTA (`head`).
 */
export interface ArrowGeometry {
  readonly kind: 'arrow';
  readonly tail: NormPoint;
  readonly head: NormPoint;
}

/** Rectángulo alineado a los ejes. `x`,`y` es la esquina superior izquierda. */
export interface RectGeometry {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Contorno cerrado implícitamente. Mínimo 3 vértices. El sentido de giro es irrelevante. */
export interface PolygonGeometry {
  readonly kind: 'polygon';
  readonly points: readonly NormPoint[];
}

export type Geometry = PinGeometry | ArrowGeometry | RectGeometry | PolygonGeometry;
export type AnnotationKind = Geometry['kind'];

export const ANNOTATION_KINDS: readonly AnnotationKind[] = ['pin', 'arrow', 'rect', 'polygon'];

export const KIND_LABELS: Readonly<Record<AnnotationKind, string>> = {
  pin: 'alfiler',
  arrow: 'flecha',
  rect: 'rectángulo',
  polygon: 'polígono',
};
