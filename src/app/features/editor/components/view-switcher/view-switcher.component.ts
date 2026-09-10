import { Component, computed, inject } from '@angular/core';
import { ViewId, VIEW_LABELS } from '../../../../core/models/project.model';
import { EditorStore } from '../../services/editor.store';

@Component({
  selector: 'app-view-switcher',
  templateUrl: './view-switcher.component.html',
  styleUrl: './view-switcher.component.scss',
})
export class ViewSwitcherComponent {
  private readonly store = inject(EditorStore);

  readonly current = this.store.viewId;

  readonly views = computed(() => {
    const project = this.store.project();
    const numbers = this.store.numbers();
    return (['frente', 'espalda'] as const).map((id) => {
      const view = project?.views.find((v) => v.id === id);
      const count = view?.annotations.length ?? 0;
      const first = view?.annotations.map((a) => numbers.get(a.id) ?? 0).sort((a, b) => a - b)[0];
      return {
        id: id as ViewId,
        label: VIEW_LABELS[id],
        short: id === 'frente' ? 'Frente' : 'Espalda',
        count,
        hasImage: !!view?.image,
        firstNumber: first ?? null,
      };
    });
  });

  switchTo(id: ViewId): void {
    this.store.switchView(id);
  }
}
