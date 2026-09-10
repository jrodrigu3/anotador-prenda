import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ObjectUrlService } from '../../../../core/media/object-url.service';
import { PromptPayload } from '../../services/prompt-payload.model';

interface PreviewImage {
  readonly key: string;
  readonly url: string;
  readonly caption: string;
  readonly filename: string;
  readonly isComposite: boolean;
}

/**
 * Panel «Lo que ve la IA».
 *
 * Muestra las imágenes exportadas a TAMAÑO REAL (1568 px de lado largo), no escaladas al
 * ancho del panel. Es la salvaguarda contra el único fallo que arruina la técnica entera y
 * que no se ve en el editor: una insignia ilegible tras el reescalado del proveedor. Si el
 * diseñador no lee el número aquí, la IA tampoco.
 */
@Component({
  selector: 'app-ai-preview',
  templateUrl: './ai-preview.component.html',
  styleUrl: './ai-preview.component.scss',
})
export class AiPreviewComponent {
  private readonly urls = inject(ObjectUrlService);

  readonly payload = input.required<PromptPayload>();
  readonly actualSize = signal(true);

  private readonly held = new Set<string>();

  readonly images = computed<readonly PreviewImage[]>(() => {
    const blocks = this.payload().blocks;
    return blocks
      .filter((b) => b.kind === 'image')
      .map((b, i) => {
        const key = `${this.payload().bundleId}:${b.filename}:${i}`;
        this.held.add(key);
        return {
          key,
          url: this.urls.acquire(key, b.blob),
          caption: b.caption,
          filename: b.filename,
          isComposite: !b.filename.startsWith('recortes/'),
        };
      });
  });

  readonly composites = computed(() => this.images().filter((i) => i.isComposite));
  readonly crops = computed(() => this.images().filter((i) => !i.isComposite));

  constructor() {
    // Un `effect` fuerza la evaluación del `computed` y con ella la reserva de las URLs;
    // se liberan todas al destruir el panel.
    effect(() => void this.images());
    inject(DestroyRef).onDestroy(() => {
      for (const key of this.held) this.urls.release(key);
      this.held.clear();
    });
  }

  toggleSize(): void {
    this.actualSize.update((v) => !v);
  }
}
