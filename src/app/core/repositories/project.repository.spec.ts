import { SCHEMA_VERSION } from '../models/annotation.model';
import { Project } from '../models/project.model';
import { migrateProjectDocument } from './project.repository';

/**
 * Esta función toca datos que YA existen en el navegador de alguien. Si se rompe, se pierde
 * trabajo ajeno: de ahí que sea el único trozo del repositorio con pruebas propias.
 */
function v1Document(): Project {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: 'Camisa antigua',
    garmentType: 'camisa',
    reference: 'SS25-01',
    generalNotes: '',
    views: [
      {
        id: 'frente',
        image: {
          imageId: 'img1',
          fileName: 'frente.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1000,
          naturalWidth: 800,
          naturalHeight: 600,
        },
        annotations: [
          {
            id: 'a1',
            order: 0,
            note: 'Bajar el bolsillo',
            part: 'bolsillo',
            partFreeText: '',
            status: 'confirmada',
            createdAt: 1,
            updatedAt: 1,
            kind: 'pin',
            point: { x: 0.5, y: 0.5 },
          },
        ],
      },
      { id: 'espalda', image: null, annotations: [] },
    ],
    createdAt: 1,
    updatedAt: 1,
    // Campos de v2 ausentes a propósito.
  } as unknown as Project;
}

describe('migrateProjectDocument · v1 → v2', () => {
  it('deja el documento en la versión actual', () => {
    expect(migrateProjectDocument(v1Document()).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('da a cada anotación una acción libre en vez de dejarla sin definir', () => {
    const migrated = migrateProjectDocument(v1Document());
    expect(migrated.views[0].annotations[0].intent).toEqual({ kind: 'libre' });
  });

  it('conserva intacto lo que el diseñador había escrito', () => {
    const migrated = migrateProjectDocument(v1Document());
    const a = migrated.views[0].annotations[0];
    expect(a.note).toBe('Bajar el bolsillo');
    expect(a.part).toBe('bolsillo');
    expect(migrated.reference).toBe('SS25-01');
  });

  it('marca el contorno como no detectado en vez de inventarlo', () => {
    const migrated = migrateProjectDocument(v1Document());
    expect(migrated.views[0].image?.garmentBox).toBeNull();
    expect(migrated.garmentHeightCm).toBeNull();
  });

  it('no toca un documento que ya está al día', () => {
    const current = migrateProjectDocument(v1Document());
    expect(migrateProjectDocument(current)).toEqual(current);
  });

  it('aguanta un documento con vistas sin imagen y sin marcas', () => {
    const doc = v1Document();
    const empty = { ...doc, views: [doc.views[1], doc.views[1]] } as unknown as Project;
    expect(() => migrateProjectDocument(empty)).not.toThrow();
  });
});
