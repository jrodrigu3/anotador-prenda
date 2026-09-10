import { Component, computed, inject, signal } from '@angular/core';
import { ViewId } from '../../../../core/models/project.model';
import { EditorStore } from '../../services/editor.store';

interface Slot {
  readonly id: ViewId;
  readonly label: string;
  readonly filled: boolean;
}

/**
 * Subida de las dos vistas.
 *
 * Colapsado es solo una pastilla: la interfaz no debe competir con la prenda. Al pulsarla se
 * despliega para elegir vista. Soltar archivos funciona siempre, esté desplegado o no —
 * el área de arrastre es todo el lienzo, aunque lo visible sea diminuto.
 *
 * Dos archivos se reparten frente → espalda por orden; uno va al primer hueco libre.
 */
@Component({
  selector: 'app-garment-upload',
  templateUrl: './garment-upload.component.html',
  styleUrl: './garment-upload.component.scss',
  host: {
    '[class.is-dragging]': 'dragging()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave()',
    '(drop)': 'onDrop($event)',
  },
})
export class GarmentUploadComponent {
  private readonly store = inject(EditorStore);

  readonly dragging = signal(false);
  readonly busy = signal(false);
  readonly open = signal(false);

  readonly slots = computed<readonly Slot[]>(
    () =>
      this.store.project()?.views.map((v) => ({
        id: v.id,
        label: v.id === 'frente' ? 'Frente' : 'Espalda',
        filled: v.image !== null,
      })) ?? [],
  );

  private readonly missing = this.store.missingViews;
  readonly complete = computed(() => this.missing().length === 0);

  toggle(): void {
    this.open.update((v) => !v);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  async onDrop(ev: DragEvent): Promise<void> {
    ev.preventDefault();
    this.dragging.set(false);
    await this.accept([...(ev.dataTransfer?.files ?? [])]);
  }

  async onPickSlot(ev: Event, viewId: ViewId): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    this.busy.set(true);
    try {
      await this.store.setImage(file, viewId);
      this.open.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async onPickBoth(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await this.accept(files);
  }

  /** Los archivos se reparten en los huecos libres, en orden frente → espalda. */
  private async accept(files: readonly File[]): Promise<void> {
    if (files.length === 0) return;
    const targets = this.missing().length > 0 ? this.missing() : (['frente'] as const);
    const items = files.slice(0, targets.length).map((file, i) => ({ file, viewId: targets[i] }));
    this.busy.set(true);
    try {
      await this.store.setImages(items);
      this.open.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
