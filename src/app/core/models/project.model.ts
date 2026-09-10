import { Annotation, SCHEMA_VERSION } from './annotation.model';

export type ViewId = 'frente' | 'espalda';

export const VIEW_LABELS: Readonly<Record<ViewId, string>> = {
  frente: 'Vista frontal',
  espalda: 'Vista trasera',
};

/** Etiqueta corta, la que se quema en la esquina de la imagen compuesta. */
export const VIEW_SHORT: Readonly<Record<ViewId, string>> = {
  frente: 'FRENTE',
  espalda: 'ESPALDA',
};

/**
 * Referencia a un bitmap guardado en el almacén `images`. El Blob NUNCA vive dentro del
 * documento de proyecto: leer un proyecto para cambiar una nota deserializaría 8 MB.
 */
export interface ImageRef {
  readonly imageId: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png';
  readonly byteSize: number;
  /** Tamaño ya con la orientación EXIF aplicada. Es la única verdad sobre las dimensiones. */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface GarmentView {
  readonly id: ViewId;
  readonly image: ImageRef | null;
  readonly annotations: readonly Annotation[];
}

export interface Project {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly garmentType: string;
  readonly reference: string;
  /** Notas que no cuelgan de ninguna marca concreta. */
  readonly generalNotes: string;
  /** Exactamente frente y espalda, en ese orden. */
  readonly views: readonly [GarmentView, GarmentView];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function emptyProject(id: string, name: string, now = Date.now()): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    garmentType: 'camisa',
    reference: '',
    generalNotes: '',
    views: [
      { id: 'frente', image: null, annotations: [] },
      { id: 'espalda', image: null, annotations: [] },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function viewOf(project: Project, id: ViewId): GarmentView {
  return project.views[id === 'frente' ? 0 : 1];
}

/**
 * Numeración GLOBAL y contigua 1..N sobre [frente, espalda].
 *
 * El número no se persiste a propósito: se deriva. Así borrar una marca nunca deja huecos
 * ni duplicados en el material que ve la IA, que es donde un "5" repetido entre las dos
 * vistas rompería la clave de unión entre imagen, recorte y JSON.
 */
export function globalNumbers(project: Project): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  for (const view of project.views) {
    for (const a of [...view.annotations].sort((x, y) => x.order - y.order)) {
      map.set(a.id, n++);
    }
  }
  return map;
}

export function totalAnnotations(project: Project): number {
  return project.views[0].annotations.length + project.views[1].annotations.length;
}
