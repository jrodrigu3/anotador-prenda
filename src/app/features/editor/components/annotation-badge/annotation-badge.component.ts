import { Component, computed, input } from '@angular/core';
import { Geometry, Size } from '../../../../core/models/geometry.model';
import { SCREEN } from '../../../../core/render/marker-style';
import { anchorOf, fromNorm } from '../../../../core/util/geometry.util';

/**
 * Mirilla + línea guía + insignia numérica. Vive en la capa superior para que ningún número
 * quede debajo de otra marca.
 *
 * La MIRILLA es un círculo abierto con una cruz cuyos brazos no llegan al centro: el punto
 * exacto queda a la vista. La INSIGNIA se desplaza a propósito y se une con una guía, de
 * modo que el número nunca tapa el detalle del que habla la nota. Es la misma convención
 * que se quema en la imagen exportada, para que el diseñador vea en el editor exactamente
 * lo que va a leer la IA.
 */
@Component({
  selector: '[appAnnotationBadge]',
  templateUrl: './annotation-badge.component.html',
  styleUrl: './annotation-badge.component.scss',
  host: {
    '[class]': '"badge-group badge-group--" + kind()',
    '[class.is-selected]': 'selected()',
    '[class.is-draft]': 'draft()',
    '[class.is-preview]': 'preview()',
  },
})
export class AnnotationBadgeComponent {
  readonly geometry = input.required<Geometry>();
  readonly natural = input.required<Size>();
  readonly upp = input.required<number>();
  readonly annId = input<string | null>(null);
  readonly markNumber = input<number | null>(null);
  readonly selected = input(false);
  readonly focusable = input(false);
  readonly draft = input(false);
  readonly preview = input(false);
  readonly ariaText = input('');

  readonly screen = SCREEN;
  readonly kind = computed(() => this.geometry().kind);
  readonly anchorPx = computed(() => fromNorm(anchorOf(this.geometry()), this.natural()));

  readonly anchorTransform = computed(() => {
    const p = this.anchorPx();
    return `translate(${p.x},${p.y}) scale(${this.upp()})`;
  });

  readonly badgePx = computed(() => {
    const p = this.anchorPx();
    const u = this.upp();
    return { x: p.x + 26 * u, y: p.y - 26 * u };
  });

  readonly badgeTransform = computed(() => {
    const p = this.badgePx();
    return `translate(${p.x},${p.y}) scale(${this.upp()})`;
  });

  /** Píldora, no círculo: el dígito no encoge al pasar de 9 a 10. */
  readonly badgeWidth = computed(() => {
    const digits = String(this.markNumber() ?? 1).length;
    return Math.max(SCREEN.pinRadius * 2, 11 + digits * 8);
  });

  readonly reticlePath = buildReticle();
}

function buildReticle(): string {
  const r = SCREEN.reticleRadius;
  const gap = SCREEN.reticleGap;
  const arm = SCREEN.reticleArm;
  return (
    `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 ` +
    `M ${gap} 0 L ${arm} 0 M ${-gap} 0 L ${-arm} 0 ` +
    `M 0 ${gap} L 0 ${arm} M 0 ${-gap} L 0 ${-arm}`
  );
}
