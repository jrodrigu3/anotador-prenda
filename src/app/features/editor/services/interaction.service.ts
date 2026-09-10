import { computed, inject, Service, signal } from '@angular/core';
import { Geometry, NormPoint, Pt, Size } from '../../../core/models/geometry.model';
import {
  clampNorm,
  clientToContent,
  moveVertex,
  normRect,
  toNorm,
  translateGeometry,
} from '../../../core/util/geometry.util';
import { dist } from '../../../core/util/math.util';
import { EditorStore } from './editor.store';
import { resolveHit } from './hit-test.util';
import { Interaction, Tool } from './interaction.model';
import { ViewportService } from './viewport.service';

/** Umbral por debajo del cual un arrastre se considera un clic accidental (px CSS). */
const MIN_DRAG_PX = 6;
const POLY_CLOSE_PX = 12;

/**
 * Máquina de estados de puntero. No sabe nada de IndexedDB ni de renderizado: traduce
 * eventos a llamadas al store.
 */
@Service({ autoProvided: false })
export class InteractionService {
  private readonly store = inject(EditorStore);
  private readonly viewport = inject(ViewportService);

  readonly tool = signal<Tool>('select');
  readonly interaction = signal<Interaction>({ s: 'idle' });
  readonly spaceHeld = signal(false);
  /** Con Alt la herramienta no vuelve a "seleccionar" tras crear: sirve para encadenar. */
  readonly stickyTool = signal(false);

  readonly isPanning = computed(
    () => this.interaction().s === 'panning' || this.spaceHeld() || this.tool() === 'pan',
  );

  readonly isDrawingPolygon = computed(() => this.interaction().s === 'drawing-polygon');

  /** Fantasma de la forma en curso. No está en el store ni en el historial. */
  readonly preview = computed<Geometry | null>(() => {
    const i = this.interaction();
    const n = this.natural();
    if (!n) return null;
    switch (i.s) {
      case 'placing-pin':
        return { kind: 'pin', point: toNorm(i.at, n) };
      case 'drawing-arrow':
        return { kind: 'arrow', tail: toNorm(i.tail, n), head: toNorm(i.head, n) };
      case 'drawing-rect': {
        const r = normRect(i.origin, i.current);
        return { kind: 'rect', x: r.x / n.w, y: r.y / n.h, w: r.w / n.w, h: r.h / n.h };
      }
      case 'drawing-polygon':
        return {
          kind: 'polygon',
          points: [...i.points, i.cursor].map((p) => toNorm(p, n)),
        };
      default:
        return null;
    }
  });

  private natural(): Size | null {
    const img = this.store.image();
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  }

  setTool(tool: Tool): void {
    if (this.interaction().s === 'drawing-polygon') this.closePolygon();
    this.tool.set(tool);
    if (tool !== 'select') this.store.select(null);
  }

  /* ───────────────────────── pointerdown ───────────────────────── */

  onPointerDown(ev: PointerEvent, svg: SVGSVGElement): void {
    if (ev.button === 2) return; // el menú contextual pasa
    const p = clientToContent(svg, ev.clientX, ev.clientY);
    if (!p) return;

    if (ev.button === 1 || this.spaceHeld() || this.tool() === 'pan') {
      svg.setPointerCapture(ev.pointerId);
      this.interaction.set({
        s: 'panning',
        pid: ev.pointerId,
        startClient: { x: ev.clientX, y: ev.clientY },
        startVb: this.viewport.viewBox(),
      });
      ev.preventDefault();
      return;
    }

    if (this.tool() === 'polygon') {
      this.polygonClick(p, ev);
      ev.preventDefault();
      return;
    }

    const hit = resolveHit(ev.target);
    if (this.tool() === 'select') {
      if (!hit) {
        this.store.select(null);
        return;
      }
      const base = this.store.geometryOf(hit.id);
      if (!base) return;
      // Captura en el SVG RAÍZ: un marcador re-renderizado por @for pierde la captura.
      svg.setPointerCapture(ev.pointerId);
      this.store.select(hit.id);
      this.interaction.set(
        hit.role === 'vertex' && hit.vertex
          ? { s: 'dragging-vertex', pid: ev.pointerId, id: hit.id, ref: hit.vertex, base }
          : { s: 'dragging-shape', pid: ev.pointerId, id: hit.id, grab: p, base, moved: false },
      );
      ev.preventDefault();
      return;
    }

    svg.setPointerCapture(ev.pointerId);
    switch (this.tool()) {
      case 'pin':
        this.interaction.set({ s: 'placing-pin', pid: ev.pointerId, at: p });
        break;
      case 'arrow':
        this.interaction.set({ s: 'drawing-arrow', pid: ev.pointerId, tail: p, head: p });
        break;
      case 'rect':
        this.interaction.set({ s: 'drawing-rect', pid: ev.pointerId, origin: p, current: p });
        break;
      default:
        break;
    }
    ev.preventDefault();
  }

  /* ───────────────────────── pointermove ───────────────────────── */

  onPointerMove(ev: PointerEvent, svg: SVGSVGElement): void {
    const i = this.interaction();
    if (i.s === 'idle') return;
    if ('pid' in i && i.pid !== ev.pointerId) return;

    if (i.s === 'panning') {
      // El paneo se calcula en espacio de CLIENTE contra el viewBox inicial: el viewBox se
      // está moviendo debajo, así que acumular en contenido derivaría.
      const upp = this.viewport.upp();
      this.viewport.setViewBoxRaw({
        ...i.startVb,
        x: i.startVb.x - (ev.clientX - i.startClient.x) * upp,
        y: i.startVb.y - (ev.clientY - i.startClient.y) * upp,
      });
      return;
    }

    const raw = clientToContent(svg, ev.clientX, ev.clientY);
    if (!raw) return;
    const n = this.natural();
    if (!n) return;
    const p = ev.shiftKey ? this.applyConstraint(i, raw) : raw;

    switch (i.s) {
      case 'placing-pin':
        this.interaction.set({ ...i, at: p });
        break;
      case 'drawing-arrow':
        this.interaction.set({ ...i, head: p });
        break;
      case 'drawing-rect':
        this.interaction.set({ ...i, current: p });
        break;
      case 'drawing-polygon':
        this.interaction.set({ ...i, cursor: p });
        break;
      case 'dragging-shape': {
        const dx = (p.x - i.grab.x) / n.w;
        const dy = (p.y - i.grab.y) / n.h;
        this.store.setGeometryTransient(i.id, translateGeometry(i.base, dx, dy));
        if (!i.moved && dist(p, i.grab) > MIN_DRAG_PX * this.viewport.upp()) {
          this.interaction.set({ ...i, moved: true });
        }
        break;
      }
      case 'dragging-vertex':
        this.store.setGeometryTransient(i.id, moveVertex(i.base, i.ref, this.norm(p, n)));
        break;
    }
  }

  /* ───────────────────────── pointerup ───────────────────────── */

  onPointerUp(ev: PointerEvent, svg: SVGSVGElement): void {
    const i = this.interaction();
    if (i.s === 'idle' || i.s === 'drawing-polygon') return;
    if ('pid' in i && i.pid !== ev.pointerId) return;
    if (svg.hasPointerCapture(ev.pointerId)) svg.releasePointerCapture(ev.pointerId);

    const n = this.natural();
    const minPx = MIN_DRAG_PX * this.viewport.upp();

    switch (i.s) {
      case 'panning':
        break;

      case 'placing-pin':
        if (n) {
          this.store.create({ kind: 'pin', point: this.norm(i.at, n) }, 'Añadir alfiler');
          this.afterCreate();
        }
        break;

      case 'drawing-arrow':
        if (n && dist(i.tail, i.head) >= minPx) {
          this.store.create(
            { kind: 'arrow', tail: this.norm(i.tail, n), head: this.norm(i.head, n) },
            'Añadir flecha',
          );
          this.afterCreate();
        }
        break;

      case 'drawing-rect': {
        const r = normRect(i.origin, i.current);
        if (n && r.w >= minPx && r.h >= minPx) {
          const tl = this.norm({ x: r.x, y: r.y }, n);
          const br = this.norm({ x: r.x + r.w, y: r.y + r.h }, n);
          this.store.create(
            { kind: 'rect', x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y },
            'Añadir rectángulo',
          );
          this.afterCreate();
        }
        break;
      }

      case 'dragging-shape':
        // Una sola entrada de historial por arrastre, y solo si de verdad se movió.
        if (i.moved) this.store.commitTransient(i.id, 'Mover anotación');
        else this.store.discardTransient(i.id);
        break;

      case 'dragging-vertex':
        this.store.commitTransient(i.id, 'Editar forma');
        break;
    }
    this.interaction.set({ s: 'idle' });
  }

  /**
   * `pointercancel` y `lostpointercapture` van al MISMO reset. Sin esto, un gesto del
   * sistema, un clic derecho o un cambio de pestaña dejan el arrastre pegado para siempre
   * y cada `pointermove` posterior deforma la marca.
   */
  onPointerCancel(): void {
    const i = this.interaction();
    if (i.s === 'dragging-shape' || i.s === 'dragging-vertex') this.store.discardTransient(i.id);
    if (i.s !== 'drawing-polygon') this.interaction.set({ s: 'idle' });
  }

  /* ───────────────────────── creación con teclado ───────────────────────── */

  /**
   * El teclado usa la MISMA máquina de estados que el puntero, con `pid: -1`. Así no hay
   * dos caminos de creación que puedan divergir, y la vista previa fantasma funciona igual.
   * `p` viene de la cruz virtual del lienzo, en espacio de contenido.
   */
  keyboardMove(p: Pt): void {
    const i = this.interaction();
    switch (i.s) {
      case 'drawing-arrow':
        this.interaction.set({ ...i, head: p });
        break;
      case 'drawing-rect':
        this.interaction.set({ ...i, current: p });
        break;
      case 'drawing-polygon':
        this.interaction.set({ ...i, cursor: p });
        break;
      default:
        break;
    }
  }

  /** Enter: coloca / ancla / completa, según la herramienta y el estado. */
  keyboardCommit(p: Pt): void {
    const n = this.natural();
    if (!n) return;
    const i = this.interaction();

    switch (this.tool()) {
      case 'pin':
        this.store.create({ kind: 'pin', point: this.norm(p, n) }, 'Añadir alfiler');
        this.afterCreate();
        return;

      case 'arrow':
        if (i.s !== 'drawing-arrow') {
          this.interaction.set({ s: 'drawing-arrow', pid: -1, tail: p, head: p });
          this.store.announce('Cola de la flecha anclada. Mueve con las flechas y pulsa Enter.');
          return;
        }
        this.store.create(
          { kind: 'arrow', tail: this.norm(i.tail, n), head: this.norm(p, n) },
          'Añadir flecha',
        );
        this.afterCreate();
        return;

      case 'rect':
        if (i.s !== 'drawing-rect') {
          this.interaction.set({ s: 'drawing-rect', pid: -1, origin: p, current: p });
          this.store.announce('Esquina anclada. Mueve con las flechas y pulsa Enter.');
          return;
        }
        {
          const r = normRect(i.origin, p);
          const tl = this.norm({ x: r.x, y: r.y }, n);
          const br = this.norm({ x: r.x + r.w, y: r.y + r.h }, n);
          this.store.create(
            { kind: 'rect', x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y },
            'Añadir rectángulo',
          );
          this.afterCreate();
        }
        return;

      case 'polygon':
        if (i.s !== 'drawing-polygon') {
          this.interaction.set({ s: 'drawing-polygon', points: [p], cursor: p });
          this.store.announce('Primer vértice. Enter añade otro, C cierra el polígono.');
          return;
        }
        this.interaction.set({ ...i, points: [...i.points, p], cursor: p });
        this.store.announce(`${i.points.length + 1} vértices. C cierra el polígono.`);
        return;

      default:
        return;
    }
  }

  /* ───────────────────────── polígono (multiclic) ───────────────────────── */

  private polygonClick(p: Pt, ev: PointerEvent): void {
    const i = this.interaction();
    const closeRadius = POLY_CLOSE_PX * this.viewport.upp();

    if (i.s !== 'drawing-polygon') {
      this.interaction.set({ s: 'drawing-polygon', points: [p], cursor: p });
      return;
    }
    const first = i.points[0];
    const closing = ev.detail >= 2 || (i.points.length >= 3 && dist(p, first) < closeRadius);
    if (closing) {
      this.closePolygon();
      return;
    }
    // El doble clic de cierre emite DOS pointerdown: sin esta guarda se duplica el último
    // vértice antes de cerrar.
    const last = i.points.at(-1);
    if (last && dist(p, last) < closeRadius * 0.5) return;
    this.interaction.set({ ...i, points: [...i.points, p], cursor: p });
  }

  closePolygon(): void {
    const i = this.interaction();
    if (i.s !== 'drawing-polygon') return;
    const n = this.natural();
    if (n && i.points.length >= 3) {
      this.store.create(
        { kind: 'polygon', points: i.points.map((p) => this.norm(p, n)) },
        'Añadir polígono',
      );
      this.afterCreate();
      return;
    }
    this.interaction.set({ s: 'idle' });
  }

  /** Escape: quita el último vértice; si ya no quedan, cancela. */
  cancel(): void {
    const i = this.interaction();
    if (i.s === 'drawing-polygon' && i.points.length > 1) {
      this.interaction.set({ ...i, points: i.points.slice(0, -1) });
      return;
    }
    if (i.s === 'drawing-polygon') {
      this.interaction.set({ s: 'idle' });
      return;
    }
    this.onPointerCancel();
    this.store.select(null);
  }

  private afterCreate(): void {
    this.interaction.set({ s: 'idle' });
    if (!this.stickyTool()) this.tool.set('select');
    this.store.requestNoteFocus();
  }

  private norm(p: Pt, n: Size): NormPoint {
    return clampNorm(toNorm(p, n));
  }

  /** Shift: 45° para flechas, cuadrado para rectángulos, ejes para el lazo. */
  private applyConstraint(i: Interaction, p: Pt): Pt {
    switch (i.s) {
      case 'drawing-arrow':
        return snapAngle(i.tail, p);
      case 'drawing-rect': {
        const dx = p.x - i.origin.x;
        const dy = p.y - i.origin.y;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: i.origin.x + Math.sign(dx) * side, y: i.origin.y + Math.sign(dy) * side };
      }
      case 'drawing-polygon': {
        const last = i.points.at(-1);
        return last ? snapAngle(last, p) : p;
      }
      default:
        return p;
    }
  }
}

/** Ajuste a múltiplos de 45°, en espacio de contenido (isótropo: aquí sí vale trigonometría). */
function snapAngle(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const r = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
}
