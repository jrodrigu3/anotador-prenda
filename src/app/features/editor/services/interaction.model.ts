import { Geometry, Pt, ViewBox } from '../../../core/models/geometry.model';
import { VertexRef } from '../../../core/util/geometry.util';

export type Tool = 'select' | 'pin' | 'arrow' | 'rect' | 'polygon' | 'pan';

export const TOOL_LABELS: Readonly<Record<Tool, string>> = {
  select: 'Seleccionar',
  pin: 'Alfiler',
  arrow: 'Flecha',
  rect: 'Rectángulo',
  polygon: 'Lazo',
  pan: 'Mano',
};

export const TOOL_KEYS: Readonly<Record<string, Tool>> = {
  v: 'select',
  p: 'pin',
  f: 'arrow',
  r: 'rect',
  l: 'polygon',
  h: 'pan',
};

/** Todos los `Pt` de aquí están en espacio de CONTENIDO (píxeles naturales). */
export type Interaction =
  | { readonly s: 'idle' }
  | {
      readonly s: 'panning';
      readonly pid: number;
      readonly startClient: Pt;
      readonly startVb: ViewBox;
    }
  | { readonly s: 'placing-pin'; readonly pid: number; readonly at: Pt }
  | { readonly s: 'drawing-arrow'; readonly pid: number; readonly tail: Pt; readonly head: Pt }
  | { readonly s: 'drawing-rect'; readonly pid: number; readonly origin: Pt; readonly current: Pt }
  | { readonly s: 'drawing-polygon'; readonly points: readonly Pt[]; readonly cursor: Pt }
  | {
      readonly s: 'dragging-shape';
      readonly pid: number;
      readonly id: string;
      readonly grab: Pt;
      readonly base: Geometry;
      readonly moved: boolean;
    }
  | {
      readonly s: 'dragging-vertex';
      readonly pid: number;
      readonly id: string;
      readonly ref: VertexRef;
      readonly base: Geometry;
    };
