import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { EditorStore } from '../../services/editor.store';
import { isEditableTarget } from '../../services/hit-test.util';
import { InteractionService } from '../../services/interaction.service';
import { TOOL_KEYS } from '../../services/interaction.model';
import { ViewportService } from '../../services/viewport.service';
import { AnnotationCanvasComponent } from '../../components/annotation-canvas/annotation-canvas.component';
import { AnnotationCardsComponent } from '../../components/annotation-cards/annotation-cards.component';
import { GarmentUploadComponent } from '../../components/garment-upload/garment-upload.component';
import { ToolBarComponent } from '../../components/tool-bar/tool-bar.component';
import { ViewSwitcherComponent } from '../../components/view-switcher/view-switcher.component';
import { ZoomControlsComponent } from '../../components/zoom-controls/zoom-controls.component';

@Component({
  selector: 'app-editor-page',
  imports: [
    AnnotationCanvasComponent,
    AnnotationCardsComponent,
    GarmentUploadComponent,
    ToolBarComponent,
    ViewSwitcherComponent,
    ZoomControlsComponent,
  ],
  // Provistos a nivel de RUTA, no en `root`: al salir del editor el estado se destruye
  // limpiamente, con su historial de deshacer y sus Blob URLs.
  providers: [EditorStore, ViewportService, InteractionService],
  templateUrl: './editor-page.component.html',
  styleUrl: './editor-page.component.scss',
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
  },
})
export class EditorPageComponent {
  readonly store = inject(EditorStore);
  private readonly interaction = inject(InteractionService);
  private readonly viewport = inject(ViewportService);
  private readonly router = inject(Router);

  readonly projectId = input.required<string>();

  readonly project = this.store.project;
  readonly status = this.store.status;
  readonly liveMessage = this.store.liveMessage;
  readonly hasImage = computed(() => this.store.image() !== null);

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'cargando':
        return 'Cargando…';
      case 'guardando':
        return 'Guardando…';
      case 'error':
        return this.store.errorMessage() ?? 'Error';
      default:
        return 'Guardado';
    }
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.store.load(id));
    });
  }

  onName(ev: Event): void {
    this.store.setName((ev.target as HTMLInputElement).value);
  }

  onReference(ev: Event): void {
    this.store.setReference((ev.target as HTMLInputElement).value);
  }

  /** El alto real es lo que convierte «a 40 % del alto» en «a 29 cm del hombro». */
  onHeight(ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value.trim();
    const value = raw === '' ? null : Number(raw);
    this.store.setGarmentHeightCm(
      value !== null && Number.isFinite(value) && value > 0 ? value : null,
    );
  }

  onGeneralNotes(ev: Event): void {
    this.store.setGeneralNotes((ev.target as HTMLTextAreaElement).value);
  }

  goToExport(): void {
    void this.router.navigate(['/proyecto', this.projectId(), 'exportar']);
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }

  /**
   * Atajos globales. La guarda `isEditableTarget` es la que impide que escribir
   * "quiero que este borde sea redondeado" cambie de herramienta en la "r". Sin ella el bug
   * aparece el primer día.
   */
  onKeyDown(ev: KeyboardEvent): void {
    const editing = isEditableTarget(ev.target);
    const mod = ev.metaKey || ev.ctrlKey;

    if (mod && ev.key.toLowerCase() === 'z') {
      // Dentro de un campo de texto manda el deshacer nativo del navegador.
      if (editing) return;
      ev.preventDefault();
      if (ev.shiftKey) this.store.redo();
      else this.store.undo();
      return;
    }
    if (mod && ev.key.toLowerCase() === 'y') {
      if (editing) return;
      ev.preventDefault();
      this.store.redo();
      return;
    }
    if (mod) return;

    if (ev.key === 'Escape') {
      this.interaction.cancel();
      return;
    }
    if (editing) return;

    if (ev.key === ' ' && !ev.repeat) {
      this.interaction.spaceHeld.set(true);
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const id = this.store.selectedId();
      if (id) {
        ev.preventDefault();
        this.store.remove(id);
      }
      return;
    }
    if (ev.key === 'c' || ev.key === 'C') {
      if (this.interaction.isDrawingPolygon()) {
        ev.preventDefault();
        this.interaction.closePolygon();
        return;
      }
    }
    if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault();
      this.viewport.zoomCenter(1.25);
      return;
    }
    if (ev.key === '-') {
      ev.preventDefault();
      this.viewport.zoomCenter(1 / 1.25);
      return;
    }
    if (ev.key === '0') {
      ev.preventDefault();
      this.viewport.fit();
      return;
    }

    const tool = TOOL_KEYS[ev.key.toLowerCase()];
    if (tool) {
      ev.preventDefault();
      this.interaction.setTool(tool);
    }
  }

  onKeyUp(ev: KeyboardEvent): void {
    if (ev.key === ' ') this.interaction.spaceHeld.set(false);
  }
}
