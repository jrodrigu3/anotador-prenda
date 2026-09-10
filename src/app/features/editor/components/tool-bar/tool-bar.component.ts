import { Component, computed, inject } from '@angular/core';
import { EditorStore } from '../../services/editor.store';
import { InteractionService } from '../../services/interaction.service';
import { Tool, TOOL_LABELS } from '../../services/interaction.model';

interface ToolButton {
  readonly tool: Tool;
  readonly label: string;
  readonly key: string;
  readonly hint: string;
  readonly icon: string;
}

const BUTTONS: readonly ToolButton[] = [
  {
    tool: 'select',
    label: TOOL_LABELS.select,
    key: 'V',
    hint: 'Mover y editar marcas',
    icon: 'cursor',
  },
  { tool: 'pin', label: TOOL_LABELS.pin, key: 'P', hint: 'Señalar un punto exacto', icon: 'pin' },
  {
    tool: 'arrow',
    label: TOOL_LABELS.arrow,
    key: 'F',
    hint: 'Apuntar a un borde desde fuera',
    icon: 'arrow',
  },
  {
    tool: 'rect',
    label: TOOL_LABELS.rect,
    key: 'R',
    hint: 'Acotar una zona rectangular',
    icon: 'rect',
  },
  {
    tool: 'polygon',
    label: TOOL_LABELS.polygon,
    key: 'L',
    hint: 'Contornear una región irregular',
    icon: 'poly',
  },
  { tool: 'pan', label: TOOL_LABELS.pan, key: 'H', hint: 'Desplazar la imagen', icon: 'hand' },
];

@Component({
  selector: 'app-tool-bar',
  templateUrl: './tool-bar.component.html',
  styleUrl: './tool-bar.component.scss',
})
export class ToolBarComponent {
  private readonly interaction = inject(InteractionService);
  private readonly store = inject(EditorStore);

  readonly buttons = BUTTONS;
  readonly tool = this.interaction.tool;
  readonly sticky = this.interaction.stickyTool;
  readonly canUndo = this.store.canUndo;
  readonly canRedo = this.store.canRedo;
  readonly undoTitle = computed(() => {
    const label = this.store.undoLabel();
    return label ? `Deshacer: ${label.toLowerCase()}` : 'Deshacer';
  });
  readonly drawingPolygon = this.interaction.isDrawingPolygon;

  select(tool: Tool): void {
    this.interaction.setTool(tool);
  }

  toggleSticky(): void {
    this.sticky.update((v) => !v);
  }

  closePolygon(): void {
    this.interaction.closePolygon();
  }

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }
}
