import { TestBed } from '@angular/core/testing';
import { ConsoleReportService } from './console-report.service';
import {
  AnnotationsBundleJson,
  BUNDLE_FORMAT_VERSION,
  BUNDLE_README,
  COORDINATE_SYSTEM,
  MARKER_LEGEND,
} from './bundle.model';
import { PromptPayload } from './prompt-payload.model';

function payload(): PromptPayload {
  const bundle: AnnotationsBundleJson = {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleId: 'K7QP-2H4M',
    createdAt: '2026-09-09T10:00:00.000Z',
    generator: { name: 'Anotador de Prenda', version: '1.0.0' },
    language: 'es',
    garment: { type: 'camisa', reference: '', notes: '', heightCm: null },
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
        garmentBox: null,
        annotationNumbers: [1],
      },
    ],
    annotations: [
      {
        id: 'a1',
        number: 1,
        view: 'frente',
        type: 'pin',
        geometry: { type: 'pin', point: { x: 0.8, y: 0.3 }, pointPx: { x: 1440, y: 405 } },
        anchorPoint: { normalized: { x: 0.8, y: 0.3 }, absolutePx: { x: 1440, y: 405 } },
        badgeCenter: { normalized: { x: 0.85, y: 0.25 }, absolutePx: { x: 1530, y: 337 } },
        garmentPart: { id: 'bolsillo', label: 'bolsillo' },
        spatialDescriptor: {
          text: 'Zona: pecho…',
          zone: 'pecho',
          landmark: 'costado',
          fromTopPct: 30,
          fromCenterPct: 60,
          imageSide: 'derecha',
          wearerSide: 'izquierda',
          approxFromTopCm: null,
          approxFromCenterCm: null,
          photoPctFromLeft: 80,
          photoPctFromTop: 30,
          measuredOnPhoto: true,
        },
        action: 'Bajar el bolsillo',
        intent: { kind: 'libre' },
        note: 'Bajar 2 cm',
        cropFile: 'recortes/01_frente_bolsillo.jpg',
        cropRegionPx: { x: 1000, y: 100, w: 400, h: 400 },
        cropZoom: 3.2,
      },
    ],
    annotationCount: 1,
  };

  return {
    bundleId: bundle.bundleId,
    folderName: 'anotaciones_camisa_K7QP-2H4M',
    system: '# prompt',
    blocks: [
      {
        kind: 'image',
        mediaType: 'image/jpeg',
        blob: new Blob(['x'], { type: 'image/jpeg' }),
        filename: 'frente_compuesta.jpg',
        caption: 'Vista FRENTE con marcadores',
      },
      {
        kind: 'image',
        mediaType: 'image/jpeg',
        blob: new Blob(['y'], { type: 'image/jpeg' }),
        filename: 'recortes/01_frente_bolsillo.jpg',
        caption: 'Recorte del marcador 1 — bolsillo',
      },
    ],
    annotations: bundle,
    warnings: [],
    estimatedInputTokens: 4321,
  };
}

describe('ConsoleReportService', () => {
  let lines: string[];
  let service: ConsoleReportService;

  beforeEach(() => {
    lines = [];
    const capture = (...args: unknown[]): void => {
      lines.push(args.filter((a) => typeof a === 'string' && !a.startsWith('font')).join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'group').mockImplementation(capture);
    vi.spyOn(console, 'groupCollapsed').mockImplementation(capture);
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
    vi.spyOn(console, 'table').mockImplementation(() => undefined);
    service = TestBed.inject(ConsoleReportService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('separa los tres canales en secciones', async () => {
    await service.print(payload());
    const all = lines.join('\n');
    expect(all).toContain('1 · LO QUE LA IA VE');
    expect(all).toContain('2 · LO QUE LA IA LEE');
    expect(all).toContain('3 · CÓMO SE LE PIDE QUE LO INTERPRETE');
    expect(all).toContain('4 · TRAZA DE LECTURA, MARCA POR MARCA');
  });

  it('dibuja el árbol de archivos del paquete', async () => {
    await service.print(payload());
    const all = lines.join('\n');
    expect(all).toContain('anotaciones_camisa_K7QP-2H4M/');
    expect(all).toContain('recortes/');
    expect(all).toContain('01_frente_bolsillo.jpg');
  });

  /** La traza es la razón de ser del volcado: explicar el razonamiento que se le fuerza. */
  it('la traza encadena imagen → recorte → palabras → lado del portador → nota', async () => {
    await service.print(payload());
    const all = lines.join('\n');
    expect(all).toContain('Busca el globo «1» en frente_compuesta.jpg');
    expect(all).toContain('recortes/01_frente_bolsillo.jpg');
    expect(all).toContain('usa el lado del PORTADOR: IZQUIERDO');
    expect(all).toContain('Bajar 2 cm');
  });

  it('concuerda el singular', async () => {
    await service.print(payload());
    expect(lines.join('\n')).toContain('1 marca · 1 compuesta · 1 recorte');
  });

  it('marca en rojo las anotaciones sin indicación', async () => {
    const p = payload();
    const sinNota = { ...p.annotations.annotations[0], note: '' };
    await service.print({
      ...p,
      annotations: { ...p.annotations, annotations: [sinNota] },
    });
    expect(lines.join('\n')).toContain('sin indicación');
  });

  it('destaca los avisos del renderizador', async () => {
    await service.print({ ...payload(), warnings: ['Las marcas 6 y 7 están demasiado juntas'] });
    expect(lines.join('\n')).toContain('Las marcas 6 y 7 están demasiado juntas');
  });
});
