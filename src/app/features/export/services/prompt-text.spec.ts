import {
  AnnotationsBundleJson,
  BUNDLE_FORMAT_VERSION,
  BUNDLE_README,
  COORDINATE_SYSTEM,
  MARKER_LEGEND,
} from './bundle.model';
import { buildPromptMarkdown } from './prompt-text';

function ann(
  number: number,
  partId: 'cuello' | null,
  label: string,
): AnnotationsBundleJson['annotations'][number] {
  return {
    id: `a${number}`,
    number,
    view: 'frente',
    type: 'pin',
    geometry: { type: 'pin', point: { x: 0.8, y: 0.3 }, pointPx: { x: 1440, y: 405 } },
    anchorPoint: { normalized: { x: 0.8, y: 0.3 }, absolutePx: { x: 1440, y: 405 } },
    badgeCenter: { normalized: { x: 0.85, y: 0.25 }, absolutePx: { x: 1530, y: 337 } },
    garmentPart: { id: partId, label },
    spatialDescriptor: {
      text: 'Tercio superior, mitad derecha…',
      verticalThird: 'superior',
      horizontalBand: 'derecha',
      wearerSide: 'izquierda',
      gridCell: 'E2',
      percentFromLeft: 80,
      percentFromTop: 30,
    },
    note: number === 1 ? 'Redondear la punta' : 'Bajar 2 cm',
    cropFile: `recortes/0${number}_frente.jpg`,
    cropRegionPx: { x: 1000, y: 100, w: 400, h: 400 },
    cropZoom: 3.2,
  };
}

function bundle(overrides: Partial<AnnotationsBundleJson> = {}): AnnotationsBundleJson {
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleId: 'K7QP-2H4M',
    createdAt: '2026-09-08T10:22:03.118Z',
    generator: { name: 'Anotador de Prenda', version: '1.0.0' },
    language: 'es',
    garment: { type: 'camisa', reference: 'SS26-CM-014', notes: '' },
    readme: BUNDLE_README,
    coordinateSystem: COORDINATE_SYSTEM,
    markerLegend: MARKER_LEGEND,
    views: [
      {
        view: 'frente',
        label: 'Vista frontal',
        sourceImage: { file: 'originales/frente.jpg', naturalWidth: 1800, naturalHeight: 1350 },
        compositeFile: 'frente_compuesta.jpg',
        compositeSize: { width: 1568, height: 1176 },
        compositeCanvasSize: { width: 1568, height: 1290 },
        compositeScale: 0.871,
        annotationNumbers: [1, 2],
      },
    ],
    annotations: [ann(1, 'cuello', 'punta de cuello'), ann(2, null, 'sin especificar')],
    annotationCount: 2,
    ...overrides,
  };
}

describe('buildPromptMarkdown', () => {
  const md = buildPromptMarkdown({
    bundle: bundle(),
    taskText: 'Haz una ficha.',
    cropCount: 2,
    structure: 'por_marca',
  });

  /** El texto va envuelto a 100 columnas: se compara sin saltos de línea. */
  const flat = md.replace(/\s+/g, ' ');

  it('declara el contrato de unión por número', () => {
    expect(flat).toContain('El número es la clave de unión');
    expect(flat).toContain('marcador `N` en la imagen = recorte `NN_…` = fila `N`');
  });

  /** Sin esto, el modelo puede tomar el globo por el punto señalado. */
  it('explica que el globo NO señala nada y que la mirilla sí', () => {
    expect(flat).toContain('su centro **es** el punto del que habla la nota');
    expect(flat).toContain('desplazado a propósito y no señala nada');
  });

  /**
   * La pasada de verificación es lo que convierte un fallo silencioso en uno declarado:
   * obliga a hacer OCR de todas las insignias antes de razonar.
   */
  it('exige el inventario previo y contrastarlo con la lista esperada', () => {
    expect(flat).toContain('Antes de responder (obligatorio)');
    expect(flat).toContain('**Inventario.**');
    expect(md).toContain('DISCREPANCIA');
  });

  it('advierte de izquierda-imagen frente a izquierda-portador', () => {
    expect(flat).toContain('usa **siempre** el lado de quien viste la prenda');
    expect(md).toContain('lado portador');
  });

  /** La tabla sustituye al JSON incrustado: es donde está el ahorro. */
  it('lleva una fila por marca con los tres canales', () => {
    expect(md).toContain('| # | vista | tipo | pieza | zona (imagen) | lado portador |');
    expect(md).toContain('| 1 | frente | pin | punta de cuello |');
    expect(md).toContain('«Redondear la punta»');
    expect(md).toContain('superior · derecha · E2');
  });

  it('NO incrusta el annotations.json: repetía cada dato tres veces', () => {
    expect(md).not.toContain('```json');
    expect(md).not.toContain('anchorPoint');
    expect(md).not.toContain('formatVersion');
  });

  it('nombra los números esperados para que el inventario sea comprobable', () => {
    expect(md).toContain('**1, 2** (2)');
  });

  it('prohíbe inventar medidas y manda las notas ilegibles a Dudas', () => {
    expect(md).toContain('No inventes medidas');
    expect(md).toContain('texto de relleno');
  });

  it('marca las indicaciones vacías en la propia tabla', () => {
    const vacia = buildPromptMarkdown({
      bundle: bundle({
        annotations: [{ ...ann(1, 'cuello', 'cuello'), note: '   ' }],
        annotationCount: 1,
      }),
      taskText: 'x',
      cropCount: 0,
      structure: 'por_marca',
    });
    expect(vacia).toContain('vacía');
  });

  it('dice cuántos recortes acompañan al material', () => {
    expect(md).toContain('`recortes/NN_*.jpg` (2)');
  });

  it('inserta la tarea elegida', () => {
    expect(md).toContain('Haz una ficha.');
  });

  it('incluye las notas generales solo cuando existen', () => {
    const conNotas = buildPromptMarkdown({
      bundle: bundle({ garment: { type: 'camisa', reference: '', notes: 'Popelín 120 hilos.' } }),
      taskText: 'x',
      cropCount: 0,
      structure: 'por_marca',
    });
    expect(conNotas).toContain('Popelín 120 hilos.');
    expect(md).not.toContain('Notas generales del diseñador');
  });

  it('no deja la tarea vacía si el usuario no escribió ninguna', () => {
    const sinTarea = buildPromptMarkdown({
      bundle: bundle(),
      taskText: '   ',
      cropCount: 0,
      structure: 'por_marca',
    });
    expect(sinTarea).toContain('Interpreta las anotaciones');
  });
});

describe('autodescripción del JSON', () => {
  /**
   * Redundante con prompt.md a propósito: si el usuario pega solo el JSON y olvida el
   * prompt, el material debe seguir siendo interpretable.
   */
  it('el readme explica mirilla, globo y clave de unión sin necesitar el prompt', () => {
    expect(BUNDLE_README).toContain('MIRILLA');
    expect(BUNDLE_README).toContain('MARCADORES NUMERADOS');
    expect(BUNDLE_README).toContain('no tapar el detalle');
  });

  it('el sistema de coordenadas avisa del lado del portador', () => {
    expect(COORDINATE_SYSTEM.note).toContain('wearerSide');
  });

  it('la leyenda cubre los cuatro tipos de marca', () => {
    expect(Object.keys(MARKER_LEGEND.shapes).sort()).toEqual(['arrow', 'pin', 'polygon', 'rect']);
    expect(MARKER_LEGEND.shapes.arrow).toContain('PUNTA');
  });
});

describe('buildPromptMarkdown · organización por pieza (despiece)', () => {
  const md = buildPromptMarkdown({
    bundle: bundle(),
    taskText: 'Ficha de taller.',
    cropCount: 2,
    structure: 'por_pieza',
  });

  it('agrupa las marcas por componente de la prenda', () => {
    expect(md).toContain('## Despiece');
    expect(md).toContain('### Punta de cuello (#1)');
  });

  /** Colar una marca sin etiquetar dentro de un grupo sería inventarse la pieza. */
  it('aparta las marcas sin pieza y pide a la IA que las deduzca', () => {
    expect(md).toContain('### Sin pieza asignada (#2)');
    expect(md).toContain('deduce tú la pieza');
  });

  it('pide una sección por pieza y resolver juntas sus marcas', () => {
    expect(md).toContain('una sección por pieza');
    expect(md).toContain('CONFLICTO entre');
    expect(md).not.toContain('### #N — <pieza>');
  });

  it('la organización por marca no habla de despiece', () => {
    const porMarca = buildPromptMarkdown({
      bundle: bundle(),
      taskText: 'x',
      cropCount: 0,
      structure: 'por_marca',
    });
    expect(porMarca).not.toContain('Despiece');
    expect(porMarca).toContain('## Marcas');
  });

  it('es más corto que el prompt que incrustaba el JSON', () => {
    // El prompt completo con dos anotaciones cabe holgadamente por debajo de lo que ocupaba
    // solo el JSON incrustado (~4400 caracteres).
    expect(md.length).toBeLessThan(4400);
  });
});
