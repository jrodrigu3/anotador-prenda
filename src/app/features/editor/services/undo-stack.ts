import { computed, signal, Signal } from '@angular/core';

export interface HistoryEntry<T> {
  readonly state: T;
  readonly label: string;
  readonly key?: string;
}

/**
 * Historial por INSTANTÁNEAS inmutables, no pila de comandos.
 *
 * La carga es minúscula (40 anotaciones ≈ 8 KB) y con estructuras compartidas una marca no
 * tocada es literalmente el mismo objeto entre instantáneas. Una pila de comandos exigiría
 * escribir y probar la inversa de cada operación —crear, borrar, mover, redimensionar,
 * editar nota, reetiquetar—, unas diez veces más código y la fuente clásica del bug
 * "deshacer dejó la app en un estado raro". Las instantáneas son correctas por construcción.
 */
export class UndoStack<T> {
  private readonly past = signal<readonly HistoryEntry<T>[]>([]);
  private readonly future = signal<readonly HistoryEntry<T>[]>([]);
  private lastPushAt = 0;

  readonly canUndo: Signal<boolean> = computed(() => this.past().length > 0);
  readonly canRedo: Signal<boolean> = computed(() => this.future().length > 0);
  readonly undoLabel: Signal<string | null> = computed(() => this.past().at(-1)?.label ?? null);
  readonly redoLabel: Signal<string | null> = computed(() => this.future().at(-1)?.label ?? null);

  constructor(
    private readonly limit = 60,
    private readonly coalesceMs = 700,
  ) {}

  /**
   * Se llama con el estado ANTERIOR a la mutación. `key` fusiona pulsaciones seguidas: al
   * escribir una nota se genera una entrada por pausa, no una por tecla.
   */
  push(prev: T, label: string, key?: string): void {
    const now = Date.now();
    const top = this.past().at(-1);
    const coalesce =
      key !== undefined && top?.key === key && now - this.lastPushAt < this.coalesceMs;
    this.lastPushAt = now;
    if (!coalesce) {
      this.past.update((p) => [...p, { state: prev, label, key }].slice(-this.limit));
    }
    this.future.set([]);
  }

  undo(current: T): T | null {
    const p = this.past();
    const top = p.at(-1);
    if (!top) return null;
    this.past.set(p.slice(0, -1));
    this.future.update((f) => [...f, { state: current, label: top.label, key: top.key }]);
    return top.state;
  }

  redo(current: T): T | null {
    const f = this.future();
    const top = f.at(-1);
    if (!top) return null;
    this.future.set(f.slice(0, -1));
    this.past.update((p) => [...p, { state: current, label: top.label, key: top.key }]);
    return top.state;
  }

  clear(): void {
    this.past.set([]);
    this.future.set([]);
    this.lastPushAt = 0;
  }
}
