import { AnnotationKind, NormPoint } from '../../../core/models/geometry.model';
import { ViewId } from '../../../core/models/project.model';
import { GarmentPartId } from '../../../core/taxonomy/garment-parts';
import { SpatialDescriptor } from '../../../core/taxonomy/spatial-descriptor';

export const BUNDLE_FORMAT_VERSION = '1.0.0' as const;

export interface Px {
  readonly x: number;
  readonly y: number;
}

export interface GarmentPartRef {
  readonly id: GarmentPartId | null;
  readonly label: string;
  readonly freeText?: string;
}

export type GeometryJson =
  | { readonly type: 'pin'; readonly point: NormPoint; readonly pointPx: Px }
  | {
      readonly type: 'arrow';
      readonly from: NormPoint;
      readonly to: NormPoint;
      readonly fromPx: Px;
      readonly toPx: Px;
    }
  | {
      readonly type: 'rect';
      readonly rect: { x: number; y: number; w: number; h: number };
      readonly rectPx: { x: number; y: number; w: number; h: number };
    }
  | {
      readonly type: 'polygon';
      readonly points: readonly NormPoint[];
      readonly pointsPx: readonly Px[];
    };

export interface AnnotationJson {
  /** uuid estable entre exportaciones. */
  readonly id: string;
  /** LA CLAVE DE UNIÓN: global 1..N, la misma en la imagen, en el recorte y aquí. */
  readonly number: number;
  readonly view: ViewId;
  readonly type: AnnotationKind;
  readonly geometry: GeometryJson;
  /**
   * El punto. Toda anotación se reduce a un punto canónico: el centro de la mirilla.
   * Se materializa aunque la geometría lo determine, para que el modelo no tenga que
   * calcular el centroide de un polígono. Un campo, cero razonamiento.
   */
  readonly anchorPoint: { readonly normalized: NormPoint; readonly absolutePx: Px };
  /**
   * Dónde quedó dibujado el globo. Permite al modelo reconciliar globo -> mirilla cuando
   * hay marcas juntas; sin esto, "el 4 está cerca del 5" es irresoluble.
   */
  readonly badgeCenter: { readonly normalized: NormPoint; readonly absolutePx: Px };
  readonly garmentPart: GarmentPartRef;
  readonly spatialDescriptor: SpatialDescriptor;
  /** El texto del diseñador, literal. */
  readonly note: string;
  readonly cropFile: string | null;
  readonly cropRegionPx: { x: number; y: number; w: number; h: number } | null;
  readonly cropZoom: number | null;
}

export interface ViewJson {
  readonly view: ViewId;
  readonly label: string;
  readonly sourceImage: {
    readonly file: string;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
  };
  readonly compositeFile: string;
  /**
   * Área de IMAGEN de la compuesta: es contra esto contra lo que se desnormalizan las
   * coordenadas. No incluye la banda de leyenda.
   */
  readonly compositeSize: { readonly width: number; readonly height: number };
  /** Lienzo completo del archivo, banda de leyenda incluida. */
  readonly compositeCanvasSize: { readonly width: number; readonly height: number };
  readonly compositeScale: number;
  readonly annotationNumbers: readonly number[];
}

export interface AnnotationsBundleJson {
  readonly formatVersion: typeof BUNDLE_FORMAT_VERSION;
  readonly bundleId: string;
  readonly createdAt: string;
  readonly generator: { readonly name: string; readonly version: string };
  readonly language: 'es';
  readonly garment: { readonly type: string; readonly reference: string; readonly notes: string };
  /**
   * Autodescripción DENTRO del JSON, redundante con `prompt.md` a propósito: si el usuario
   * pega solo el JSON y olvida el prompt, el material sigue siendo interpretable. Cuesta
   * unos cientos de tokens y el modo de fallo que evita es total.
   */
  readonly readme: string;
  readonly coordinateSystem: {
    readonly origin: string;
    readonly xAxis: string;
    readonly yAxis: string;
    readonly note: string;
  };
  readonly markerLegend: {
    readonly badge: string;
    readonly reticle: string;
    readonly leaderLine: string;
    readonly shapes: Readonly<Record<AnnotationKind, string>>;
  };
  readonly views: readonly ViewJson[];
  /** Plana y ordenada por número: el modelo recorre 1..N sin navegar dos niveles. */
  readonly annotations: readonly AnnotationJson[];
  /** El modelo puede autocomprobarse contra este número. */
  readonly annotationCount: number;
}

export const BUNDLE_README =
  'Este archivo acompaña a unas imágenes con MARCADORES NUMERADOS dibujados encima. Cada ' +
  "entrada de 'annotations' tiene un campo 'number'. Ese número aparece dibujado dentro de un " +
  'globo blanco en la imagen compuesta de su vista, y encabeza el nombre del archivo de su ' +
  "recorte. El punto físico al que se refiere la nota es 'anchorPoint', que en la imagen está " +
  'señalado por una MIRILLA (círculo abierto con una cruz de brazos separados del centro), NO ' +
  'por el globo: el globo se desplaza a propósito para no tapar el detalle, y se une a la ' +
  'mirilla con una línea. Lee siempre el recorte antes de opinar sobre un detalle fino.';

export const COORDINATE_SYSTEM = {
  origin: 'esquina superior izquierda de la imagen',
  xAxis: 'de izquierda a derecha, 0..1 del ancho',
  yAxis: 'de arriba abajo, 0..1 del alto',
  note:
    "'izquierda' y 'derecha' en horizontalBand se refieren SIEMPRE a la imagen tal como se ve. " +
    "El campo 'wearerSide' da el lado desde el punto de vista de quien viste la prenda, que en " +
    'la vista frontal es el contrario.',
} as const;

export const MARKER_LEGEND = {
  badge: 'Globo blanco con borde negro y aro de color, con el número en negro.',
  reticle: 'Círculo abierto con cruz de cuatro brazos; su centro es el punto exacto.',
  leaderLine: 'Línea que une el globo con su mirilla.',
  shapes: {
    pin: 'Solo mirilla: un punto concreto.',
    arrow: 'Flecha; la PUNTA es el punto de interés, la cola solo indica la dirección de lectura.',
    rect: 'Rectángulo: toda la zona encerrada es el objeto de la nota.',
    polygon:
      'Contorno cerrado con relleno translúcido: la región encerrada es el objeto de la nota.',
  },
} as const;
