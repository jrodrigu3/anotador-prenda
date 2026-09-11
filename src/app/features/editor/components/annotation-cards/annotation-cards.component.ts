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
import {
  AnnotationIntent,
  ChoiceIntent,
  ColorIntent,
  COLOR_TARGETS,
  defaultIntent,
  DIMENSIONS,
  DIRECTIONS,
  IntentKind,
  INTENT_LABELS,
  INTENT_ORDER,
  intentIncomplete,
  intentSummary,
  MeasureIntent,
  MoveIntent,
  SHAPES,
  STITCHES,
  TextIntent,
  UNITS,
} from '../../../../core/models/intent.model';
import { VIEW_LABELS } from '../../../../core/models/project.model';
import { GarmentPartId, partGroups, partLabel } from '../../../../core/taxonomy/garment-parts';
import { shortPosition } from '../../../../core/taxonomy/spatial-descriptor';
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
  readonly intent: AnnotationIntent;
  readonly action: string;
  /** Qué le falta a la acción para ser ejecutable, si le falta algo. */
  readonly missing: string | null;
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
  readonly intentKinds = INTENT_ORDER;
  readonly intentLabels = INTENT_LABELS;
  readonly colorTargets = COLOR_TARGETS;
  readonly shapes = SHAPES;
  readonly stitches = STITCHES;
  readonly dimensions = DIMENSIONS;
  readonly directions = DIRECTIONS;
  readonly units = UNITS;
  readonly selectedId = this.store.selectedId;
  readonly viewLabel = computed(() => VIEW_LABELS[this.store.viewId()]);

  readonly cards = computed<readonly CardView[]>(() => {
    const numbers = this.store.numbers();
    return this.store.annotations().map((a) => {
      const spatial = this.store.spatialOf(a.id);
      return {
        id: a.id,
        number: numbers.get(a.id) ?? 0,
        kind: KIND_LABELS[a.kind],
        note: a.note,
        part: a.part,
        partFreeText: a.partFreeText,
        partLabel: a.part ? partLabel(a.part, a.partFreeText) : 'Sin pieza',
        place: spatial ? shortPosition(spatial) : '',
        draft: isBlank(a) && a.intent.kind === 'libre',
        intent: a.intent,
        action: intentSummary(a.intent),
        missing: intentIncomplete(a.intent),
      };
    });
  });

  readonly draftCount = computed(() => this.cards().filter((c) => c.draft).length);

  /* ── Estrechamiento de tipos para la plantilla ───────────────────────────────
     La plantilla no puede estrechar una unión discriminada por sí sola; estos
     ayudantes devuelven el tipo concreto o `null`, y `@if (…; as x)` hace el resto. */

  asColor(i: AnnotationIntent): ColorIntent | null {
    return i.kind === 'color' ? i : null;
  }

  asMeasure(i: AnnotationIntent): MeasureIntent | null {
    return i.kind === 'medida' ? i : null;
  }

  asMove(i: AnnotationIntent): MoveIntent | null {
    return i.kind === 'mover' ? i : null;
  }

  asChoice(i: AnnotationIntent): ChoiceIntent | null {
    return i.kind === 'forma' || i.kind === 'costura' ? i : null;
  }

  asText(i: AnnotationIntent): TextIntent | null {
    return i.kind === 'material' ||
      i.kind === 'acabado' ||
      i.kind === 'anadir' ||
      i.kind === 'quitar'
      ? i
      : null;
  }

  /* ── Edición de la acción ────────────────────────────────────────────────── */

  onIntentKind(id: string, ev: Event): void {
    const kind = (ev.target as HTMLSelectElement).value as IntentKind;
    this.store.setIntent(id, defaultIntent(kind));
  }

  /** Parche sobre la acción actual: cambiar un campo no debe borrar los demás. */
  patch(id: string, intent: AnnotationIntent, change: Partial<AnnotationIntent>): void {
    this.store.setIntent(id, { ...intent, ...change } as AnnotationIntent);
  }

  patchText(id: string, intent: AnnotationIntent, field: string, ev: Event): void {
    const value = (ev.target as HTMLInputElement | HTMLSelectElement).value;
    this.patch(id, intent, { [field]: value } as Partial<AnnotationIntent>);
  }

  patchNumber(id: string, intent: AnnotationIntent, field: string, ev: Event): void {
    const raw = Number((ev.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
    this.patch(id, intent, { [field]: value } as Partial<AnnotationIntent>);
  }

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
