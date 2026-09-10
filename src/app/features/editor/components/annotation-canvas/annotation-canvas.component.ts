import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Annotation, isBlank } from '../../../../core/models/annotation.model';
import { Geometry, NormPoint, Pt, Size } from '../../../../core/models/geometry.model';
import { KIND_LABELS } from '../../../../core/models/geometry.model';
import { ObjectUrlService } from '../../../../core/media/object-url.service';
import { ImageRepository } from '../../../../core/repositories/image.repository';
import { partLabel } from '../../../../core/taxonomy/garment-parts';
import { shortPosition } from '../../../../core/taxonomy/spatial-descriptor';
import {
  anchorOf,
  clampNorm,
  clientToContent,
  fromNorm,
  toNorm,
} from '../../../../core/util/geometry.util';
import { EditorStore } from '../../services/editor.store';
import { isEditableTarget } from '../../services/hit-test.util';
import { InteractionService } from '../../services/interaction.service';
import { ViewportService } from '../../services/viewport.service';
import { AnnotationBadgeComponent } from '../annotation-badge/annotation-badge.component';
import { AnnotationShapeComponent } from '../annotation-shape/annotation-shape.component';
import { SelectionHandlesComponent } from '../selection-handles/selection-handles.component';

interface MarkView {
  readonly id: string;
  readonly geometry: Geometry;
  readonly number: number | null;
  readonly draft: boolean;
  readonly aria: string;
}

/**
 * El lienzo. Un único `<svg>` con la foto DENTRO como `<image>`.
 *
 * No es "SVG superpuesto sobre un `<img>`": esa variante obliga a calcular a mano el
 * letterboxing de `object-fit: contain` y produce el clásico "mi marca cae 40 px
 * desplazada". Metiendo el bitmap dentro, `viewBox` + `getScreenCTM()` son la única fuente
 * de verdad del mapeo imagen<->pantalla y esa matemática desaparece del proyecto.
 *
 * El componente posee el DOM y los listeners crudos; la lógica vive en los servicios.
 */
@Component({
  selector: 'app-annotation-canvas',
  imports: [AnnotationShapeComponent, AnnotationBadgeComponent, SelectionHandlesComponent],
  templateUrl: './annotation-canvas.component.html',
  styleUrl: './annotation-canvas.component.scss',
})
export class AnnotationCanvasComponent {
  readonly store = inject(EditorStore);
  private readonly imagesRepo = inject(ImageRepository);
  private readonly urls = inject(ObjectUrlService);
  readonly viewport = inject(ViewportService);
  readonly interaction = inject(InteractionService);

  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('host');
  /**
   * OPCIONAL a propósito: el `<svg>` solo existe cuando hay imagen. Con
   * `viewChild.required` el primer render de un proyecto vacío lanza NG0951 y se lleva por
   * delante el resto del `afterNextRender` — entre otras cosas el ResizeObserver, que es
   * lo que deja el encuadre roto sin ningún error visible en pantalla.
   */
  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('svg');

  readonly helpId = 'canvas-help';

  /** Cruz virtual para crear anotaciones sin ratón. En espacio normalizado. */
  readonly crosshair = signal<NormPoint>({ x: 0.5, y: 0.5 });
  readonly crosshairVisible = signal(false);

  readonly image = this.store.image;
  readonly natural = computed<Size>(() => {
    const img = this.image();
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 };
  });

  private readonly imageResource = resource({
    params: () => ({ id: this.image()?.imageId ?? null }),
    loader: async ({ params, abortSignal }) => {
      if (!params.id) return null;
      const record = await this.imagesRepo.get(params.id);
      if (!record || abortSignal.aborted) return null;
      return { key: params.id, url: this.urls.acquire(params.id, record.blob) };
    },
  });

  readonly imageUrl = computed(() => this.imageResource.value()?.url ?? null);
  readonly imageLoading = computed(() => this.imageResource.isLoading());

  readonly marks = computed<readonly MarkView[]>(() => {
    const numbers = this.store.numbers();
    return this.store.annotations().map((a) => ({
      id: a.id,
      geometry: geometryOf(a),
      number: numbers.get(a.id) ?? null,
      draft: isBlank(a),
      aria: ariaLabel(a, numbers.get(a.id) ?? 0),
    }));
  });

  readonly shapeMarks = computed(() => this.marks().filter((m) => m.geometry.kind !== 'pin'));

  readonly selectedGeometry = computed<Geometry | null>(() => {
    const id = this.store.selectedId();
    return id ? (this.marks().find((m) => m.id === id)?.geometry ?? null) : null;
  });

  readonly crosshairTransform = computed(() => {
    const p = fromNorm(this.crosshair(), this.natural());
    return `translate(${p.x},${p.y}) scale(${this.viewport.upp()})`;
  });

  readonly cursorClass = computed(() => {
    if (this.interaction.isPanning()) return 'is-panning';
    return this.interaction.tool() === 'select' ? 'is-selecting' : 'is-drawing';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Liberar la Blob URL anterior en cada cambio, y al destruir. Nunca revocar de forma
    // síncrona al intercambiar el href: el <image> puede seguir decodificando.
    let previousKey: string | null = null;
    effect(() => {
      const key = this.imageResource.value()?.key ?? null;
      if (previousKey && previousKey !== key) this.urls.release(previousKey);
      previousKey = key;
    });
    destroyRef.onDestroy(() => {
      if (previousKey) this.urls.release(previousKey);
    });

    effect(() => {
      const size = this.natural();
      untracked(() => this.viewport.setNatural(size));
    });

    afterNextRender(() => {
      const host = this.hostRef().nativeElement;
      const ro = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (box && box.width > 0 && box.height > 0) this.viewport.resize(box.width, box.height);
      });
      ro.observe(host);
      const rect = host.getBoundingClientRect();
      if (rect.width > 0) this.viewport.resize(rect.width, rect.height);
      destroyRef.onDestroy(() => ro.disconnect());
    });

    // El `<svg>` aparece y desaparece con la imagen, así que la rueda se enlaza cada vez
    // que cambia el elemento, no una sola vez al construir.
    let wheelTarget: SVGSVGElement | null = null;
    let detachWheel: (() => void) | null = null;
    afterRenderEffect(() => {
      const svg = this.svgRef()?.nativeElement ?? null;
      if (svg === wheelTarget) return;
      detachWheel?.();
      detachWheel = null;
      wheelTarget = svg;
      if (!svg) return;

      // El listener de rueda DEBE registrarse a mano con `passive: false`. Un binding
      // `(wheel)` de plantilla no puede hacer `preventDefault()` de forma fiable: Chrome
      // trata los listeners de rueda cercanos a la raíz como pasivos, y entonces la página
      // hace scroll mientras crees que estás haciendo zoom.
      const onWheel = (ev: WheelEvent): void => {
        ev.preventDefault();
        const p = clientToContent(svg, ev.clientX, ev.clientY);
        if (!p) return;
        if (ev.ctrlKey) {
          this.viewport.zoomAt(p, Math.exp(-ev.deltaY * 0.01)); // pinch del trackpad
        } else if (ev.shiftKey || ev.altKey) {
          this.viewport.zoomAt(p, Math.exp(-ev.deltaY * 0.0015)); // rueda + modificador
        } else {
          const k = ev.deltaMode === 1 ? 16 : 1; // DOM_DELTA_LINE
          const upp = this.viewport.upp();
          this.viewport.panByContent(-ev.deltaX * k * upp, -ev.deltaY * k * upp);
        }
      };
      svg.addEventListener('wheel', onWheel, { passive: false });
      detachWheel = () => svg.removeEventListener('wheel', onWheel);
      untracked(() => this.viewport.fit());
    });
    destroyRef.onDestroy(() => detachWheel?.());

    // Tabindex móvil: exactamente una insignia es un punto de tabulación; las flechas
    // recorren el resto. Con 40 marcas, lo contrario destroza el orden de tabulación.
    afterRenderEffect(() => {
      const id = this.store.focusedId();
      if (!id) return;
      const svg = untracked(() => this.svgRef()?.nativeElement);
      if (!svg) return;
      const el = svg.querySelector<SVGGElement>(`[data-ann-id="${id}"][data-role="badge"]`);
      if (el && document.activeElement !== el && svg.contains(document.activeElement)) {
        el.focus();
      }
    });
  }

  /* ───────────────────────── puntero ───────────────────────── */

  onPointerDown(ev: PointerEvent): void {
    const svg = this.svgRef()?.nativeElement;
    if (!svg) return;
    // La cruz virtual sigue al puntero: así se puede empezar con el ratón y terminar con
    // el teclado sin que el punto de partida salte al centro de la imagen.
    const p = clientToContent(svg, ev.clientX, ev.clientY);
    if (p) this.syncCrosshairTo(p);
    this.crosshairVisible.set(false);
    this.interaction.onPointerDown(ev, svg);
    // `preventDefault()` dentro del manejador bloquea el enfoque por defecto, así que hay
    // que enfocar a mano: si no, tras el primer clic ningún atajo del lienzo responde.
    if (document.activeElement !== svg) svg.focus({ preventScroll: true });
  }

  onPointerMove(ev: PointerEvent): void {
    const svg = this.svgRef()?.nativeElement;
    if (svg) this.interaction.onPointerMove(ev, svg);
  }

  onPointerUp(ev: PointerEvent): void {
    const svg = this.svgRef()?.nativeElement;
    if (svg) this.interaction.onPointerUp(ev, svg);
  }

  onPointerCancel(): void {
    this.interaction.onPointerCancel();
  }

  onContextMenu(ev: MouseEvent): void {
    if (this.interaction.isDrawingPolygon()) {
      ev.preventDefault();
      this.interaction.closePolygon();
    }
  }

  /* ───────────────────────── teclado ───────────────────────── */

  onKeyDown(ev: KeyboardEvent): void {
    if (isEditableTarget(ev.target)) return;

    // El paso se mide en píxeles de PANTALLA, no de imagen: una pulsación mueve lo mismo
    // a la vista que a 800 % de zoom. Con píxeles de imagen, recorrer una foto de 1800 px
    // a golpe de flecha es inservible, y con mucho zoom sería imposible afinar.
    const screenStep = ev.shiftKey ? 10 : ev.altKey ? 0.25 : 1;
    const step = screenStep * this.viewport.upp();
    const n = this.natural();

    switch (ev.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const dx = (ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0) / n.w;
        const dy = (ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0) / n.h;
        ev.preventDefault();
        if (this.interaction.tool() === 'select') this.nudgeSelection(dx, dy);
        else this.moveCrosshair(dx, dy);
        return;
      }

      case 'Enter':
        if (this.interaction.tool() === 'select') return;
        ev.preventDefault();
        this.crosshairVisible.set(true);
        this.interaction.keyboardCommit(fromNorm(this.crosshair(), n));
        return;

      case 'c':
      case 'C':
        if (this.interaction.isDrawingPolygon()) {
          ev.preventDefault();
          this.interaction.closePolygon();
        }
        return;

      case 'Escape':
        ev.preventDefault();
        this.interaction.cancel();
        this.crosshairVisible.set(false);
        return;

      case 'Home':
      case 'End': {
        const list = this.marks();
        if (list.length === 0) return;
        ev.preventDefault();
        this.store.select((ev.key === 'Home' ? list[0] : list[list.length - 1]).id);
        return;
      }

      default:
        return;
    }
  }

  /** Las flechas recorren las marcas cuando el foco está en una insignia. */
  onBadgeKeyDown(ev: KeyboardEvent, id: string): void {
    const list = this.marks();
    const index = list.findIndex((m) => m.id === id);
    if (index < 0) return;

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      ev.stopPropagation();
      this.store.select(list[(index + 1) % list.length].id);
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      ev.stopPropagation();
      this.store.select(list[(index - 1 + list.length) % list.length].id);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ev.stopPropagation();
      this.store.select(id);
      this.store.requestNoteFocus();
    }
  }

  onFocusCanvas(): void {
    if (this.interaction.tool() !== 'select') this.crosshairVisible.set(true);
  }

  private moveCrosshair(dx: number, dy: number): void {
    this.crosshairVisible.set(true);
    const next = clampNorm({ x: this.crosshair().x + dx, y: this.crosshair().y + dy });
    this.crosshair.set(next);
    this.interaction.keyboardMove(fromNorm(next, this.natural()));
    this.store.announce(
      `${Math.round(next.x * 100)} %, ${Math.round(next.y * 100)} % — ${shortPosition(next)}`,
    );
  }

  private nudgeSelection(dx: number, dy: number): void {
    const id = this.store.selectedId();
    const g = id ? this.store.geometryOf(id) : null;
    if (!id || !g) return;
    this.store.nudge(id, translate(g, dx, dy));
  }

  /** Centra la cruz virtual donde el usuario haga clic, para encadenar teclado y ratón. */
  syncCrosshairTo(p: Pt): void {
    this.crosshair.set(clampNorm(toNorm(p, this.natural())));
  }
}

function geometryOf(a: Annotation): Geometry {
  switch (a.kind) {
    case 'pin':
      return { kind: 'pin', point: a.point };
    case 'arrow':
      return { kind: 'arrow', tail: a.tail, head: a.head };
    case 'rect':
      return { kind: 'rect', x: a.x, y: a.y, w: a.w, h: a.h };
    case 'polygon':
      return { kind: 'polygon', points: a.points };
  }
}

function translate(g: Geometry, dx: number, dy: number): Geometry {
  const mv = (p: NormPoint): NormPoint => clampNorm({ x: p.x + dx, y: p.y + dy });
  switch (g.kind) {
    case 'pin':
      return { kind: 'pin', point: mv(g.point) };
    case 'arrow':
      return { kind: 'arrow', tail: mv(g.tail), head: mv(g.head) };
    case 'rect':
      return { kind: 'rect', ...mv({ x: g.x, y: g.y }), w: g.w, h: g.h };
    case 'polygon':
      return { kind: 'polygon', points: g.points.map(mv) };
  }
}

function ariaLabel(a: Annotation, number: number): string {
  const kind = KIND_LABELS[a.kind];
  const pos = shortPosition(anchorOf(geometryOf(a)));
  const part = a.part ? `, ${partLabel(a.part, a.partFreeText)}` : '';
  const note = a.note.trim() || 'sin nota';
  return `Marca ${number}, ${kind}${part}, ${pos}. ${note}`;
}
