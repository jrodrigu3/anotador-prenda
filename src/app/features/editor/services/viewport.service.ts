import { computed, Service, signal } from '@angular/core';
import { Box, Pt, Size, ViewBox } from '../../../core/models/geometry.model';
import { clamp } from '../../../core/util/math.util';
import { fitToScreen, frameBox, syncAspect } from '../../../core/util/viewbox.util';

/**
 * Zoom y paneo mutando el `viewBox` del SVG, no con `transform` de CSS.
 *
 * Con una transformación CSS habría dos fuentes de verdad (viewBox y matriz) y cada sesión
 * de depuración se convierte en "¿cuál de las dos está mal?". Además, cambiar el viewBox
 * repinta sin recalcular estilos ni layout, y recortar el paneo contra los límites de la
 * imagen es aritmética trivial sobre un rectángulo.
 *
 * No sabe nada de anotaciones: eso es del store.
 */
@Service({ autoProvided: false })
export class ViewportService {
  readonly natural = signal<Size>({ w: 1, h: 1 });
  /** Tamaño del elemento, alimentado por un ResizeObserver. */
  readonly element = signal<Size>({ w: 1, h: 1 });
  readonly viewBox = signal<ViewBox>({ x: 0, y: 0, w: 1, h: 1 });

  /**
   * Unidades de contenido por píxel CSS. ES el escalar que mantiene los marcadores del
   * mismo tamaño en pantalla: un grupo con `scale(upp)` hace que sus coordenadas internas
   * se lean directamente en píxeles CSS.
   */
  readonly upp = computed(() => this.viewBox().w / Math.max(1, this.element().w));
  readonly zoom = computed(() => 1 / this.upp());
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  readonly viewBoxAttr = computed(() => {
    const v = this.viewBox();
    return `${v.x} ${v.y} ${v.w} ${v.h}`;
  });

  private readonly minVbW = computed(() => Math.max(1, this.natural().w / 32));
  private readonly maxVbW = computed(() => Math.max(2, this.natural().w * 4));

  setNatural(size: Size): void {
    this.natural.set(size);
    this.fit();
  }

  fit(): void {
    const e = this.element();
    this.viewBox.set(fitToScreen(this.natural(), e.w, e.h));
  }

  resize(w: number, h: number): void {
    this.element.set({ w, h });
    this.viewBox.update((vb) => syncAspect(vb, w, h));
  }

  /** `anchor` en espacio de CONTENIDO: el punto bajo el cursor no se mueve. */
  zoomAt(anchor: Pt, factor: number): void {
    const vb = this.viewBox();
    const w = clamp(vb.w / factor, this.minVbW(), this.maxVbW());
    const s = w / vb.w; // ratio realmente aplicado tras el recorte
    const h = vb.h * s;
    this.viewBox.set(
      this.clampPan({
        x: anchor.x - (anchor.x - vb.x) * s,
        y: anchor.y - (anchor.y - vb.y) * s,
        w,
        h,
      }),
    );
  }

  zoomCenter(factor: number): void {
    const vb = this.viewBox();
    this.zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, factor);
  }

  panByContent(dx: number, dy: number): void {
    const vb = this.viewBox();
    this.viewBox.set(this.clampPan({ ...vb, x: vb.x - dx, y: vb.y - dy }));
  }

  /** Durante un arrastre de paneo se recalcula desde el viewBox inicial, no acumulando. */
  setViewBoxRaw(vb: ViewBox): void {
    this.viewBox.set(this.clampPan(vb));
  }

  /** Encuadra una caja de contenido; se usa al saltar a una marca desde la lista lateral. */
  frame(box: Box): void {
    const e = this.element();
    const n = this.natural();
    const vb = frameBox(box, e.w, e.h, 2.4, Math.max(n.w, n.h) * 0.08);
    const w = clamp(vb.w, this.minVbW(), this.maxVbW());
    const s = w / vb.w;
    this.viewBox.set(
      this.clampPan({
        x: vb.x + (vb.w - w) / 2,
        y: vb.y + (vb.h - vb.h * s) / 2,
        w,
        h: vb.h * s,
      }),
    );
  }

  /** Nunca dejar que la imagen salga por completo: siempre queda un 20 % solapando. */
  private clampPan(vb: ViewBox): ViewBox {
    const n = this.natural();
    const m = 0.8;
    return {
      ...vb,
      x: clamp(vb.x, -vb.w * m, n.w - vb.w * (1 - m)),
      y: clamp(vb.y, -vb.h * m, n.h - vb.h * (1 - m)),
    };
  }
}
