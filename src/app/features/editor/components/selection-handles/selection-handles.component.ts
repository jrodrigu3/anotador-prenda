import { Component, computed, input } from '@angular/core';
import { Geometry, Size } from '../../../../core/models/geometry.model';
import { SCREEN } from '../../../../core/render/marker-style';
import { fromNorm, VertexRef, verticesOf } from '../../../../core/util/geometry.util';

interface HandleView {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly transform: string;
  readonly vkind: VertexRef['kind'];
  readonly vindex: number | null;
  readonly vcorner: string | null;
  readonly vend: string | null;
  readonly label: string;
}

/** Tiradores de la anotación seleccionada. 22 px CSS de zona de impacto (WCAG 2.2). */
@Component({
  selector: '[appSelectionHandles]',
  templateUrl: './selection-handles.component.html',
  styleUrl: './selection-handles.component.scss',
})
export class SelectionHandlesComponent {
  readonly geometry = input.required<Geometry>();
  readonly natural = input.required<Size>();
  readonly upp = input.required<number>();
  readonly annId = input.required<string>();

  readonly screen = SCREEN;

  readonly handles = computed<readonly HandleView[]>(() => {
    const n = this.natural();
    const u = this.upp();
    return verticesOf(this.geometry()).map((v, i) => {
      const p = fromNorm(v.at, n);
      return {
        key: `${v.ref.kind}-${i}`,
        x: p.x,
        y: p.y,
        transform: `translate(${p.x},${p.y}) scale(${u})`,
        vkind: v.ref.kind,
        vindex: v.ref.kind === 'poly' ? v.ref.index : null,
        vcorner: v.ref.kind === 'rect' ? v.ref.corner : null,
        vend: v.ref.kind === 'arrow' ? v.ref.end : null,
        label: labelFor(v.ref, i),
      };
    });
  });
}

function labelFor(ref: VertexRef, i: number): string {
  switch (ref.kind) {
    case 'pin':
      return 'Mover el punto';
    case 'arrow':
      return ref.end === 'head' ? 'Mover la punta de la flecha' : 'Mover la cola de la flecha';
    case 'rect':
      return `Mover la esquina ${ref.corner}`;
    case 'poly':
      return `Mover el vértice ${i + 1}`;
  }
}
