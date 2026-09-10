import { DBSchema } from 'idb';
import { Project } from '../models/project.model';

export const DB_NAME = 'anotador-prenda';
/** Versión del LAYOUT de la base. No confundir con `SCHEMA_VERSION` del documento. */
export const DB_VERSION = 1;

export interface ImageRecord {
  readonly id: string;
  readonly projectId: string;
  /** Los Blob son estructurables, IndexedDB los guarda nativamente. */
  readonly blob: Blob;
  readonly mimeType: 'image/jpeg' | 'image/png';
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly byteSize: number;
  readonly createdAt: number;
}

export interface AnotadorDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updatedAt': number };
  };
  images: {
    key: string;
    value: ImageRecord;
    indexes: { 'by-project': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}
