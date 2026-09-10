import { Box, Geometry, NormPoint, Size } from '../../../core/models/geometry.model';
import { ViewId } from '../../../core/models/project.model';

/** Lo que el worker necesita saber de una anotación. Sin clases, sin señales: clonable. */
export interface RenderAnnotation {
  readonly id: string;
  readonly number: number;
  readonly geometry: Geometry;
  /** Etiqueta ya resuelta de la pieza, para la leyenda y el subtítulo del recorte. */
  readonly partLabel: string;
  readonly note: string;
}

export interface RenderRequest {
  readonly view: ViewId;
  /** 'FRENTE' | 'ESPALDA', quemado en la esquina. */
  readonly viewShort: string;
  readonly bundleId: string;
  readonly dateLabel: string;
  readonly imageBlob: Blob;
  readonly natural: Size;
  readonly annotations: readonly RenderAnnotation[];
  readonly legendBand: boolean;
  readonly withCrops: boolean;
}

export interface RenderedCrop {
  readonly id: string;
  readonly number: number;
  readonly blob: Blob;
  /** Región recortada, en píxeles de la imagen original. */
  readonly box: Box;
  readonly zoom: number;
  readonly outSize: number;
}

export interface RenderResult {
  readonly view: ViewId;
  readonly composite: Blob;
  /** Área de imagen, sin la banda de leyenda: es el marco de las coordenadas. */
  readonly compositeSize: Size;
  /** Lienzo completo del archivo, banda incluida. */
  readonly compositeCanvasSize: Size;
  /** Factor compuesta -> original. El modelo no lo necesita; un consumidor programático sí. */
  readonly compositeScale: number;
  readonly badgeCenters: readonly {
    readonly id: string;
    readonly normalized: NormPoint;
    readonly absolutePx: { x: number; y: number };
  }[];
  readonly crops: readonly RenderedCrop[];
  /** Solapes que el colocador no pudo resolver. Se avisan; no se ocultan. */
  readonly warnings: readonly string[];
}
