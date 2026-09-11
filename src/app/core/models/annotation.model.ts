import { Geometry } from './geometry.model';
import { AnnotationIntent } from './intent.model';
import { GarmentPartId } from '../taxonomy/garment-parts';

/**
 * Versión del DOCUMENTO de proyecto. No confundir con la versión del layout de IndexedDB.
 * v2 añade `intent` (la acción estructurada) y el contorno de la prenda en `ImageRef`.
 */
export const SCHEMA_VERSION = 2;

/**
 * Una marca borrador (sin nota) se puede dibujar y se ve en gris, pero el exportador
 * avisa antes de mandarla a la IA: una marca sin texto no le dice nada al modelo.
 */
export type AnnotationStatus = 'borrador' | 'confirmada';

export interface AnnotationMeta {
  /** Identidad estable. NO es el número que ve la IA. */
  readonly id: string;
  /** Orden dentro de su vista. Determina el número visible 1..N. */
  readonly order: number;
  /** El texto del diseñador, literal, en español. */
  readonly note: string;
  /** Pieza de la prenda. Es uno de los tres canales que desambiguan para la IA. */
  readonly part: GarmentPartId | null;
  /** QUÉ hay que hacer aquí, como dato. La nota libre lo matiza, no lo sustituye. */
  readonly intent: AnnotationIntent;
  /** Solo cuando `part === 'otro'`. */
  readonly partFreeText: string;
  readonly status: AnnotationStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * La geometría se aplana dentro de la anotación (en vez de anidarla bajo `geometry`) para
 * que un solo `switch (a.kind)` estreche a la vez la forma y los metadatos. Es lo que
 * quieren tanto las plantillas como el renderizador de exportación.
 */
export type Annotation = AnnotationMeta & Geometry;

export function isBlank(a: Annotation): boolean {
  return a.note.trim().length === 0;
}
