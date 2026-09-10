import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Project, totalAnnotations } from '../../../../core/models/project.model';
import { ProjectRepository } from '../../../../core/repositories/project.repository';
import { SOFT_MARK_LIMIT_PER_VIEW } from '../../../../core/render/marker-style';
import { newBundleId } from '../../../../core/util/id.util';
import { AiPreviewComponent } from '../../components/ai-preview/ai-preview.component';
import { AnnotationReviewPort } from '../../services/annotation-review.port';
import { ClipboardService } from '../../services/clipboard.service';
import { ConsoleReportService } from '../../services/console-report.service';
import { DownloadService } from '../../services/download.service';
import { PromptPayload } from '../../services/prompt-payload.model';
import { PromptPayloadBuilder } from '../../services/prompt-payload.builder';
import { PromptStructure } from '../../services/prompt-text';
import { TASK_TEMPLATES, TaskTemplateId, templateById } from '../../services/task-templates';
import { ZipBundleExporter } from '../../services/zip-bundle.exporter';

@Component({
  selector: 'app-export-page',
  imports: [AiPreviewComponent],
  templateUrl: './export-page.component.html',
  styleUrl: './export-page.component.scss',
})
export class ExportPageComponent {
  private readonly projects = inject(ProjectRepository);
  private readonly builder = inject(PromptPayloadBuilder);
  private readonly zipper = inject(ZipBundleExporter);
  private readonly downloads = inject(DownloadService);
  private readonly clipboard = inject(ClipboardService);
  private readonly consoleReport = inject(ConsoleReportService);
  private readonly reviewPort = inject(AnnotationReviewPort);
  private readonly router = inject(Router);

  /** Enlazado desde la ruta con `withComponentInputBinding()`. */
  readonly projectId = input.required<string>();

  readonly templates = TASK_TEMPLATES;
  readonly project = signal<Project | null>(null);
  readonly payload = signal<PromptPayload | null>(null);
  readonly building = signal(false);
  readonly progress = signal('');
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  readonly templateId = signal<TaskTemplateId>('ficha_taller');
  readonly customTask = signal('');
  readonly includeCrops = signal(true);
  /**
   * Por defecto NO: la banda repite número → pieza, que ya va en la tabla del prompt, y
   * añade un 14 % de píxeles a cada compuesta. Pagar tokens por decir dos veces lo mismo.
   */
  readonly legendBand = signal(false);
  readonly structure = signal<PromptStructure>('por_marca');
  readonly onlyWithNote = signal(true);
  readonly includeOriginals = signal(false);

  readonly hasRemoteAi = computed(() => this.reviewPort.kind === 'remote');

  readonly taskText = computed(() => {
    const id = this.templateId();
    return id === 'libre' ? this.customTask() : templateById(id).text;
  });

  readonly markCount = computed(() => {
    const p = this.project();
    return p ? totalAnnotations(p) : 0;
  });

  readonly crowdedViews = computed(() => {
    const p = this.project();
    if (!p) return [];
    return p.views.filter((v) => v.annotations.length > SOFT_MARK_LIMIT_PER_VIEW).map((v) => v.id);
  });

  readonly blankCount = computed(() => {
    const p = this.project();
    if (!p) return 0;
    return p.views.reduce((n, v) => n + v.annotations.filter((a) => !a.note.trim()).length, 0);
  });

  readonly costLabel = computed(() => {
    const t = this.payload()?.estimatedInputTokens ?? 0;
    if (t === 0) return '';
    return `≈ ${t.toLocaleString('es-ES')} tokens de entrada`;
  });

  constructor() {
    // Un `input.required()` NO está disponible en el constructor: se enlaza después de
    // construir. Leerlo aquí lanza NG0950 y la página se queda sin proyecto, sin más
    // síntoma que un botón deshabilitado.
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const found = await this.projects.get(id);
    if (!found) {
      this.error.set('No se encontró el proyecto.');
      return;
    }
    this.project.set(found);
  }

  back(): void {
    void this.router.navigate(['/proyecto', this.projectId()]);
  }

  readonly structures = [
    {
      id: 'por_marca' as const,
      label: 'Por marca',
      hint: 'Una sección por marcador. Lo más fiel al anclaje visual.',
    },
    {
      id: 'por_pieza' as const,
      label: 'Por pieza (despiece)',
      hint: 'Agrupa las marcas por componente. Resuelve juntas las de la misma pieza.',
    },
  ];

  readonly structureHint = computed(
    () => this.structures.find((s) => s.id === this.structure())?.hint ?? '',
  );

  /** El despiece pierde sentido si casi nada está etiquetado. */
  readonly unlabelled = computed(() => {
    const p = this.project();
    if (!p) return 0;
    return p.views.reduce((n, v) => n + v.annotations.filter((a) => a.part === null).length, 0);
  });

  onTemplate(ev: Event): void {
    this.templateId.set((ev.target as HTMLSelectElement).value as TaskTemplateId);
  }

  onStructure(ev: Event): void {
    this.structure.set((ev.target as HTMLSelectElement).value as PromptStructure);
    this.payload.set(null); // el material anterior deja de ser válido
  }

  onCustomTask(ev: Event): void {
    this.customTask.set((ev.target as HTMLTextAreaElement).value);
  }

  toggle(which: 'crops' | 'legend' | 'onlyNote' | 'originals', ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const map = {
      crops: this.includeCrops,
      legend: this.legendBand,
      onlyNote: this.onlyWithNote,
      originals: this.includeOriginals,
    } as const;
    map[which].set(checked);
    this.payload.set(null); // el material anterior deja de ser válido
  }

  async generate(): Promise<void> {
    const project = this.project();
    if (!project || this.building()) return;
    this.building.set(true);
    this.error.set(null);
    this.payload.set(null);
    try {
      const result = await this.builder.build(project, {
        bundleId: newBundleId(),
        taskText: this.taskText(),
        includeCrops: this.includeCrops(),
        legendBand: this.legendBand(),
        onlyWithNote: this.onlyWithNote(),
        structure: this.structure(),
        onProgress: (m) => this.progress.set(m),
      });
      this.payload.set(result);
      this.progress.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.building.set(false);
    }
  }

  async downloadZip(): Promise<void> {
    const payload = this.payload();
    const project = this.project();
    if (!payload || !project) return;
    try {
      const blob = await this.zipper.toZip(payload, project, this.includeOriginals());
      this.downloads.save(blob, `${payload.folderName}.zip`);
      this.notify('ZIP descargado.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  async downloadLoose(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;
    const files: { blob: Blob; filename: string }[] = [
      { blob: new Blob([payload.system], { type: 'text/markdown' }), filename: 'prompt.md' },
      {
        blob: new Blob([JSON.stringify(payload.annotations, null, 2)], {
          type: 'application/json',
        }),
        filename: 'annotations.json',
      },
      ...payload.blocks
        .filter((b) => b.kind === 'image')
        .map((b) => ({ blob: b.blob, filename: b.filename.replace('recortes/', '') })),
    ];
    await this.downloads.saveMany(files);
    this.notify(`${files.length} archivos descargados.`);
  }

  async copyPrompt(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;
    const ok = await this.clipboard.copyText(payload.system);
    this.notify(
      ok ? 'Prompt y JSON copiados. Ahora arrastra las imágenes al chat.' : 'No se pudo copiar.',
    );
  }

  /**
   * El `ClipboardItem` se construye con una PROMESA dentro del mismo gesto de usuario: si se
   * hiciera `await` antes, Safari consideraría perdido el gesto y rechazaría la escritura.
   */
  copyComposite(index: number): void {
    const payload = this.payload();
    if (!payload) return;
    const images = payload.blocks.filter((b) => b.kind === 'image');
    const target = images.filter((b) => !b.filename.startsWith('recortes/'))[index];
    if (!target) return;
    void this.clipboard
      .copyImage(this.clipboard.toPng(target.blob))
      .then((ok) =>
        this.notify(
          ok ? 'Imagen copiada al portapapeles.' : 'Tu navegador no permite copiar imágenes.',
        ),
      );
  }

  readonly compositeNames = computed(
    () =>
      this.payload()
        ?.blocks.filter((b) => b.kind === 'image' && !b.filename.startsWith('recortes/'))
        .map((b) => (b.kind === 'image' ? b.filename : '')) ?? [],
  );

  /** Vuelca en la consola el paquete completo y cómo lo leerá la IA, canal por canal. */
  async printToConsole(): Promise<void> {
    const payload = this.payload();
    if (!payload) return;
    await this.consoleReport.print(payload);
    this.notify('Volcado en la consola del navegador (F12 → Console).');
  }

  private notify(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 4000);
  }
}
