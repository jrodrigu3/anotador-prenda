import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { isBlank } from '../../../../core/models/annotation.model';
import { KIND_LABELS } from '../../../../core/models/geometry.model';
import { VIEW_LABELS } from '../../../../core/models/project.model';
import { GarmentPartId, partGroups, partLabel } from '../../../../core/taxonomy/garment-parts';
import { deriveSpatial } from '../../../../core/taxonomy/spatial-descriptor';
import { anchorOf } from '../../../../core/util/geometry.util';
import { EditorStore } from '../../services/editor.store';
import { ViewportService } from '../../services/viewport.service';

interface CardView {
  readonly id: string;
  readonly number: number;
  readonly kind: string;
  readonly note: string;
  readonly part: GarmentPartId | null;
  readonly partFreeText: string;
  readonly partLabel: string;
  readonly place: string;
  readonly draft: boolean;
}

/**
 * Una tarjeta por anotación, editable en el sitio.
 *
 * Antes había dos paneles —un editor para la marca seleccionada y una lista aparte— con la
 * misma información repetida. Una sola columna de tarjetas dice lo mismo con la mitad de
 * interfaz, y es también la superficie accesible primaria: hay un camino completo sin ratón
 * para leer, editar, encuadrar y borrar cualquier marca.
 */
@Component({
  selector: 'app-annotation-cards',
  templateUrl: './annotation-cards.component.html',
  styleUrl: './annotation-cards.component.scss',
})
export class AnnotationCardsComponent {
  private readonly store = inject(EditorStore);
  private readonly viewport = inject(ViewportService);
  private readonly notes = viewChildren<ElementRef<HTMLTextAreaElement>>('note');

  readonly groups = partGroups();
  readonly selectedId = this.store.selectedId;
  readonly viewLabel = computed(() => VIEW_LABELS[this.store.viewId()]);

  readonly cards = computed<readonly CardView[]>(() => {
    const numbers = this.store.numbers();
    const view = this.store.viewId();
    return this.store.annotations().map((a) => {
      const g = this.store.geometryOf(a.id);
      const spatial = g ? deriveSpatial(anchorOf(g), view) : null;
      return {
        id: a.id,
        number: numbers.get(a.id) ?? 0,
        kind: KIND_LABELS[a.kind],
        note: a.note,
        part: a.part,
        partFreeText: a.partFreeText,
        partLabel: a.part ? partLabel(a.part, a.partFreeText) : 'Sin pieza',
        place: spatial ? placeLine(spatial) : '',
        draft: isBlank(a),
      };
    });
  });

  readonly draftCount = computed(() => this.cards().filter((c) => c.draft).length);

  private readonly lastFocusRequest = signal(0);

  constructor() {
    effect(() => {
      const request = this.store.noteFocusRequest();
      if (request !== this.lastFocusRequest()) this.lastFocusRequest.set(request);
    });

    // Al crear una marca el foco salta a su nota: una marca sin texto no le dice nada a la IA.
    afterRenderEffect(() => {
      if (this.lastFocusRequest() === 0) return;
      const id = untracked(() => this.store.selectedId());
      const index = untracked(() => this.cards().findIndex((c) => c.id === id));
      if (index < 0) return;
      untracked(() => this.notes()[index]?.nativeElement.focus());
    });
  }

  select(id: string): void {
    this.store.select(id);
  }

  /** Saltar a la marca: seleccionarla y encuadrarla en el lienzo. */
  goTo(id: string): void {
    this.store.select(id);
    const box = this.store.contentBoxOf(id);
    if (box) this.viewport.frame(box);
  }

  onNote(id: string, ev: Event): void {
    this.store.setNote(id, (ev.target as HTMLTextAreaElement).value);
  }

  onPart(card: CardView, ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value;
    this.store.setPart(card.id, value ? (value as GarmentPartId) : null, card.partFreeText);
  }

  onFreeText(id: string, ev: Event): void {
    this.store.setPartFreeText(id, (ev.target as HTMLInputElement).value);
  }

  remove(id: string): void {
    this.store.remove(id);
  }
}

/**
 * Una sola línea con las dos lecturas del lado. En confección «manga izquierda» es la del
 * PORTADOR, no la de la imagen; verlo aquí es lo que evita coser la prenda espejada.
 */
function placeLine(s: ReturnType<typeof deriveSpatial>): string {
  const zone = `tercio ${s.verticalThird}`;
  if (s.wearerSide === 'centro') return `${zone} · centro`;
  const worn = s.wearerSide === 'izquierda' ? 'izquierdo' : 'derecho';
  return `${zone} · ${s.horizontalBand} en la imagen · lado ${worn} de quien la viste`;
}
