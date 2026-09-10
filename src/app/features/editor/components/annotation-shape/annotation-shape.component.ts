import { Component, computed, input } from '@angular/core';
import { Geometry, Size } from '../../../../core/models/geometry.model';
import { SCREEN } from '../../../../core/render/marker-style';
import { arrowGeom, pathOf } from '../../../../core/util/geometry.util';

/**
 * La FORMA de una anotación (rectángulo, polígono, asta de flecha). Se separa de la
 * insignia para poder pintar todas las formas en una capa y todas las insignias encima:
 * un número no debe quedar nunca debajo de otra marca.
 *
 * Es "tonto": sin salidas. Los eventos se delegan en el `<svg>` raíz y se resuelven leyendo
 * los `data-*`.
 */
@Component({
  selector: '[appAnnotationShape]',
  templateUrl: './annotation-shape.component.html',
  styleUrl: './annotation-shape.component.scss',
  host: {
    '[class]': '"mark mark--" + kind()',
    '[class.is-selected]': 'selected()',
    '[class.is-draft]': 'draft()',
    '[class.is-preview]': 'preview()',
  },
})
export class AnnotationShapeComponent {
  readonly geometry = input.required<Geometry>();
  readonly natural = input.required<Size>();
  /** Unidades de contenido por píxel CSS: mantiene la punta de flecha constante. */
  readonly upp = input.required<number>();
  readonly annId = input<string | null>(null);
  readonly selected = input(false);
  readonly draft = input(false);
  readonly preview = input(false);

  readonly screen = SCREEN;
  readonly kind = computed(() => this.geometry().kind);
  readonly shapePath = computed(() => pathOf(this.geometry(), this.natural()));

  /**
   * La punta se dibuja a mano en un grupo con `scale(upp)`. Con `<marker>` y
   * `markerUnits="strokeWidth"` la punta crecería con el zoom mientras el asta, con
   * `non-scaling-stroke`, se queda quieta: el fallo clásico.
   */
  readonly arrowHeadTransform = computed(() => {
    const g = this.geometry();
    if (g.kind !== 'arrow') return '';
    const { head, angleDeg } = arrowGeom(g, this.natural());
    return `translate(${head.x},${head.y}) rotate(${angleDeg}) scale(${this.upp()})`;
  });

  readonly arrowHeadPath =
    `M 0 0 L ${-SCREEN.arrowHead} ${-SCREEN.arrowHead * 0.54} ` +
    `L ${-SCREEN.arrowHead * 0.7} 0 L ${-SCREEN.arrowHead} ${SCREEN.arrowHead * 0.54} Z`;
}
