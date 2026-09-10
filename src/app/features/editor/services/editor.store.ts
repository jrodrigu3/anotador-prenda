import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import { Annotation, SCHEMA_VERSION } from '../../../core/models/annotation.model';
import { Box, Geometry } from '../../../core/models/geometry.model';
import {
  emptyProject,
  GarmentView,
  globalNumbers,
  ImageRef,
  Project,
  ViewId,
  viewOf,
} from '../../../core/models/project.model';
import { ImageImportService } from '../../../core/media/image-import.service';
import { ImageRepository } from '../../../core/repositories/image.repository';
import { ProjectRepository } from '../../../core/repositories/project.repository';
import { GarmentPartId } from '../../../core/taxonomy/garment-parts';
import { anchorOf, bboxOf, roundGeometry } from '../../../core/util/geometry.util';
import { newId } from '../../../core/util/id.util';
import { UndoStack } from './undo-stack';

interface ViewSnapshot {
  readonly annotations: readonly Annotation[];
}

const AUTOSAVE_MS = 500;

/**
 * ÚNICO escritor del estado de anotaciones. Ni los componentes ni `InteractionService`
 * mutan señales por su cuenta: llaman a métodos de aquí.
 */
@Service({ autoProvided: false })
export class EditorStore {
  private readonly projects = inject(ProjectRepository);
  private readonly images = inject(ImageRepository);
  private readonly importer = inject(ImageImportService);

  private readonly projectSignal = signal<Project | null>(null);
  readonly project = this.projectSignal.asReadonly();

  readonly viewId = signal<ViewId>('frente');
  readonly selectedId = signal<string | null>(null);
  readonly focusedId = signal<string | null>(null);
  readonly status = signal<'cargando' | 'listo' | 'guardando' | 'error'>('cargando');
  readonly errorMessage = signal<string | null>(null);
  readonly liveMessage = signal('');
  /** Pide a la UI que enfoque el editor de notas de la marca recién creada. */
  readonly noteFocusRequest = signal(0);

  /**
   * Geometría en vuelo durante un arrastre. Vive FUERA del proyecto a propósito: así el
   * historial recibe una sola entrada por arrastre en vez de doscientas, y el autoguardado
   * no se dispara en cada `pointermove`.
   */
  private readonly transient = signal<ReadonlyMap<string, Geometry>>(new Map());

  private readonly history = new Map<ViewId, UndoStack<ViewSnapshot>>([
    ['frente', new UndoStack<ViewSnapshot>()],
    ['espalda', new UndoStack<ViewSnapshot>()],
  ]);

  readonly currentView = computed<GarmentView | null>(() => {
    const p = this.projectSignal();
    return p ? viewOf(p, this.viewId()) : null;
  });

  /** Numeración global 1..N sobre [frente, espalda]. Derivada, nunca persistida. */
  readonly numbers = computed<ReadonlyMap<string, number>>(() => {
    const p = this.projectSignal();
    return p ? globalNumbers(p) : new Map();
  });

  /** Las anotaciones de la vista actual con la geometría en vuelo ya superpuesta. */
  readonly annotations = computed<readonly Annotation[]>(() => {
    const view = this.currentView();
    if (!view) return [];
    const overlay = this.transient();
    const list = [...view.annotations].sort((a, b) => a.order - b.order);
    if (overlay.size === 0) return list;
    return list.map((a) => {
      const g = overlay.get(a.id);
      return g ? ({ ...a, ...g } as Annotation) : a;
    });
  });

  readonly selected = computed<Annotation | null>(() => {
    const id = this.selectedId();
    return id ? (this.annotations().find((a) => a.id === id) ?? null) : null;
  });

  readonly image = computed<ImageRef | null>(() => this.currentView()?.image ?? null);

  readonly canUndo = computed(() => this.stack().canUndo());
  readonly canRedo = computed(() => this.stack().canRedo());
  readonly undoLabel = computed(() => this.stack().undoLabel());

  readonly blankCount = computed(() => {
    const p = this.projectSignal();
    if (!p) return 0;
    return p.views.reduce(
      (n, v) => n + v.annotations.filter((a) => a.note.trim().length === 0).length,
      0,
    );
  });

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor() {
    effect(() => {
      const p = this.projectSignal();
      if (!p || !this.dirty) return;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => untracked(() => void this.persist()), AUTOSAVE_MS);
    });

    const destroyRef = inject(DestroyRef);
    const flush = (): void => {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      if (this.dirty) void this.persist();
    };
    window.addEventListener('pagehide', flush);
    destroyRef.onDestroy(() => {
      window.removeEventListener('pagehide', flush);
      flush();
    });
  }

  /* ───────────────────────── carga y guardado ───────────────────────── */

  async load(projectId: string): Promise<void> {
    this.status.set('cargando');
    try {
      const found = await this.projects.get(projectId);
      if (!found) {
        this.errorMessage.set('No se encontró el proyecto.');
        this.status.set('error');
        return;
      }
      this.projectSignal.set(found);
      this.status.set('listo');
    } catch (err) {
      this.errorMessage.set(`No se pudo abrir el proyecto: ${String(err)}`);
      this.status.set('error');
    }
  }

  async createAndLoad(name: string): Promise<string> {
    const project = emptyProject(newId(), name.trim() || 'Proyecto sin título');
    await this.projects.save(project);
    this.projectSignal.set(project);
    this.status.set('listo');
    return project.id;
  }

  private async persist(): Promise<void> {
    const p = this.projectSignal();
    if (!p) return;
    this.dirty = false;
    this.status.set('guardando');
    try {
      await this.projects.save(p);
      this.status.set('listo');
    } catch (err) {
      this.errorMessage.set(`No se pudo guardar: ${String(err)}`);
      this.status.set('error');
    }
  }

  /* ───────────────────────── mutaciones ───────────────────────── */

  private stack(): UndoStack<ViewSnapshot> {
    return this.history.get(this.viewId())!;
  }

  private snapshot(): ViewSnapshot {
    return { annotations: this.currentView()?.annotations ?? [] };
  }

  /** Reemplaza la vista actual. Siempre por copia: bajo zoneless un `push` no re-renderiza. */
  private writeView(annotations: readonly Annotation[]): void {
    const p = this.projectSignal();
    if (!p) return;
    const id = this.viewId();
    const views = p.views.map((v) =>
      v.id === id ? { ...v, annotations } : v,
    ) as unknown as Project['views'];
    this.dirty = true;
    this.projectSignal.set({ ...p, views, updatedAt: Date.now(), schemaVersion: SCHEMA_VERSION });
  }

  private commit(annotations: readonly Annotation[], label: string, key?: string): void {
    this.stack().push(this.snapshot(), label, key);
    this.writeView(annotations);
  }

  create(geometry: Geometry, label: string): string {
    const view = this.currentView();
    if (!view) return '';
    const now = Date.now();
    const annotation: Annotation = {
      id: newId(),
      order: view.annotations.length,
      note: '',
      part: null,
      partFreeText: '',
      status: 'borrador',
      createdAt: now,
      updatedAt: now,
      ...roundGeometry(geometry),
    };
    this.commit([...view.annotations, annotation], label);
    this.selectedId.set(annotation.id);
    this.focusedId.set(annotation.id);
    this.announce(`Marca ${this.numbers().get(annotation.id) ?? '?'} creada.`);
    return annotation.id;
  }

  remove(id: string): void {
    const view = this.currentView();
    if (!view) return;
    const number = this.numbers().get(id);
    const rest = view.annotations.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i }));
    this.commit(rest, 'Eliminar anotación');
    if (this.selectedId() === id) this.selectedId.set(null);
    if (this.focusedId() === id) this.focusedId.set(rest.at(-1)?.id ?? null);
    this.announce(`Marca ${number ?? ''} eliminada. Ctrl+Z para deshacer.`);
  }

  setNote(id: string, note: string): void {
    const view = this.currentView();
    if (!view) return;
    const next = view.annotations.map((a) =>
      a.id === id
        ? {
            ...a,
            note,
            status: note.trim() ? ('confirmada' as const) : ('borrador' as const),
            updatedAt: Date.now(),
          }
        : a,
    );
    this.commit(next, 'Editar nota', `note:${id}`);
  }

  setPart(id: string, part: GarmentPartId | null, freeText = ''): void {
    const view = this.currentView();
    if (!view) return;
    const next = view.annotations.map((a) =>
      a.id === id ? { ...a, part, partFreeText: freeText, updatedAt: Date.now() } : a,
    );
    this.commit(next, 'Cambiar pieza');
  }

  setPartFreeText(id: string, freeText: string): void {
    const view = this.currentView();
    if (!view) return;
    const next = view.annotations.map((a) =>
      a.id === id ? { ...a, partFreeText: freeText, updatedAt: Date.now() } : a,
    );
    this.commit(next, 'Describir pieza', `partText:${id}`);
  }

  /** Nudge con teclado: una sola entrada de historial por ráfaga de flechas. */
  nudge(id: string, geometry: Geometry): void {
    const view = this.currentView();
    if (!view) return;
    const next = view.annotations.map((a) =>
      a.id === id ? ({ ...a, ...roundGeometry(geometry), updatedAt: Date.now() } as Annotation) : a,
    );
    this.commit(next, 'Mover anotación', `nudge:${id}`);
  }

  /* ───────────────────────── geometría en vuelo ───────────────────────── */

  setGeometryTransient(id: string, geometry: Geometry): void {
    const map = new Map(this.transient());
    map.set(id, geometry);
    this.transient.set(map);
  }

  commitTransient(id: string, label: string): void {
    const geometry = this.transient().get(id);
    this.discardTransient(id);
    if (!geometry) return;
    const view = this.currentView();
    if (!view) return;
    const next = view.annotations.map((a) =>
      a.id === id ? ({ ...a, ...roundGeometry(geometry), updatedAt: Date.now() } as Annotation) : a,
    );
    this.commit(next, label);
  }

  discardTransient(id: string): void {
    if (!this.transient().has(id)) return;
    const map = new Map(this.transient());
    map.delete(id);
    this.transient.set(map);
  }

  geometryOf(id: string): Geometry | null {
    const a = this.annotations().find((x) => x.id === id);
    if (!a) return null;
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

  /* ───────────────────────── deshacer ───────────────────────── */

  undo(): void {
    const restored = this.stack().undo(this.snapshot());
    if (!restored) return;
    this.writeView(restored.annotations);
    this.ensureSelectionValid();
    this.announce('Deshecho.');
  }

  redo(): void {
    const restored = this.stack().redo(this.snapshot());
    if (!restored) return;
    this.writeView(restored.annotations);
    this.ensureSelectionValid();
    this.announce('Rehecho.');
  }

  private ensureSelectionValid(): void {
    const ids = new Set(this.annotations().map((a) => a.id));
    if (this.selectedId() && !ids.has(this.selectedId()!)) this.selectedId.set(null);
    if (this.focusedId() && !ids.has(this.focusedId()!)) this.focusedId.set(null);
  }

  /* ───────────────────────── selección y vistas ───────────────────────── */

  select(id: string | null): void {
    this.selectedId.set(id);
    if (id) this.focusedId.set(id);
  }

  switchView(id: ViewId): void {
    if (this.viewId() === id) return;
    this.viewId.set(id);
    this.selectedId.set(null);
    this.focusedId.set(null);
  }

  requestNoteFocus(): void {
    this.noteFocusRequest.update((n) => n + 1);
  }

  announce(message: string): void {
    this.liveMessage.set(message);
  }

  /** Caja envolvente de una anotación en espacio de contenido, para encuadrarla. */
  contentBoxOf(id: string): Box | null {
    const a = this.annotations().find((x) => x.id === id);
    const img = this.image();
    if (!a || !img) return null;
    const n = { w: img.naturalWidth, h: img.naturalHeight };
    const g = this.geometryOf(id)!;
    const b = a.kind === 'pin' ? { ...bboxOf(g), w: 0, h: 0 } : bboxOf(g);
    const anchor = anchorOf(g);
    return {
      x: (b.w === 0 ? anchor.x : b.x) * n.w,
      y: (b.h === 0 ? anchor.y : b.y) * n.h,
      w: b.w * n.w,
      h: b.h * n.h,
    };
  }

  /* ───────────────────────── imágenes ───────────────────────── */

  /**
   * Asigna una foto a una vista concreta. Si no se dice cuál, va a la vista activa.
   */
  async setImage(file: File, viewId: ViewId = this.viewId()): Promise<void> {
    await this.setImages([{ file, viewId }]);
  }

  /**
   * Sube frente y espalda en una sola pasada, que es como llegan de verdad: el diseñador
   * fotografía la prenda por delante y por detrás y arrastra las dos a la vez.
   *
   * Se procesan en serie: decodificar y recodificar dos bitmaps a la vez dispara el pico
   * de memoria del canvas justo donde Safari se rinde.
   */
  async setImages(items: readonly { file: File; viewId: ViewId }[]): Promise<void> {
    const project = this.projectSignal();
    if (!project || items.length === 0) return;

    this.status.set('guardando');
    const replaced: string[] = [];
    let current = project;

    try {
      for (const { file, viewId } of items) {
        const ref = await this.importer.import(file, current.id);
        const previous = viewOf(current, viewId).image;
        if (previous) replaced.push(previous.imageId);
        const views = current.views.map((v) =>
          v.id === viewId ? { ...v, image: ref } : v,
        ) as unknown as Project['views'];
        current = { ...current, views, updatedAt: Date.now() };
        this.dirty = true;
        this.projectSignal.set(current);
      }
      await this.persist();
      for (const id of replaced) await this.images.delete(id);
      this.announce(
        items.length > 1 ? 'Fotos cargadas.' : `Foto de la ${items[0].viewId} cargada.`,
      );
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : String(err));
      this.status.set('error');
    }
  }

  /** Vistas que todavía no tienen foto, en orden frente → espalda. */
  readonly missingViews = computed<readonly ViewId[]>(
    () =>
      this.projectSignal()
        ?.views.filter((v) => v.image === null)
        .map((v) => v.id) ?? [],
  );

  setName(name: string): void {
    const p = this.projectSignal();
    if (!p) return;
    this.dirty = true;
    this.projectSignal.set({ ...p, name, updatedAt: Date.now() });
  }

  setReference(reference: string): void {
    const p = this.projectSignal();
    if (!p) return;
    this.dirty = true;
    this.projectSignal.set({ ...p, reference, updatedAt: Date.now() });
  }

  setGarmentType(garmentType: string): void {
    const p = this.projectSignal();
    if (!p) return;
    this.dirty = true;
    this.projectSignal.set({ ...p, garmentType, updatedAt: Date.now() });
  }

  setGeneralNotes(generalNotes: string): void {
    const p = this.projectSignal();
    if (!p) return;
    this.dirty = true;
    this.projectSignal.set({ ...p, generalNotes, updatedAt: Date.now() });
  }
}
