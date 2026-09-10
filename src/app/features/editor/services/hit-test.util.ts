import { RectCorner, VertexRef } from '../../../core/util/geometry.util';

export type HitRole = 'shape' | 'badge' | 'vertex';

export interface Hit {
  readonly id: string;
  readonly role: HitRole;
  readonly vertex: VertexRef | null;
}

/**
 * El hit-testing es gratis porque el editor es SVG: cada marca es un nodo real del DOM.
 * Los listeners viven solo en el `<svg>` raíz (delegación), así que el número de handlers
 * es constante aunque haya cuarenta marcas.
 */
export function resolveHit(target: EventTarget | null): Hit | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<SVGElement>('[data-ann-id]');
  if (!el) return null;
  const id = el.dataset['annId'];
  const role = el.dataset['role'] as HitRole | undefined;
  if (!id || !role) return null;
  return { id, role, vertex: role === 'vertex' ? parseVertex(el) : null };
}

function parseVertex(el: SVGElement): VertexRef | null {
  const kind = el.dataset['vkind'];
  switch (kind) {
    case 'pin':
      return { kind: 'pin' };
    case 'poly':
      return { kind: 'poly', index: Number(el.dataset['vindex'] ?? 0) };
    case 'rect':
      return { kind: 'rect', corner: (el.dataset['vcorner'] ?? 'nw') as RectCorner };
    case 'arrow':
      return { kind: 'arrow', end: el.dataset['vend'] === 'head' ? 'head' : 'tail' };
    default:
      return null;
  }
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Sin esta guarda, escribir "quiero que este borde sea redondeado" en el campo de nota
 * cambia de herramienta en la "r". Va a pasar el primer día si se olvida.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable;
}
