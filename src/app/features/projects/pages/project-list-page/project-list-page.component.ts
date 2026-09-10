import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DbService } from '../../../../core/db/db.service';
import { emptyProject, Project, totalAnnotations } from '../../../../core/models/project.model';
import { ProjectRepository } from '../../../../core/repositories/project.repository';
import { newId } from '../../../../core/util/id.util';

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly reference: string;
  readonly marks: number;
  readonly updated: string;
}

@Component({
  selector: 'app-project-list-page',
  templateUrl: './project-list-page.component.html',
  styleUrl: './project-list-page.component.scss',
})
export class ProjectListPageComponent {
  private readonly projects = inject(ProjectRepository);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);

  readonly rows = signal<readonly ProjectRow[]>([]);
  readonly loading = signal(true);
  readonly newName = signal('');
  readonly storageWarning = this.db.blockedMessage;

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    const all = await this.projects.list();
    this.rows.set(all.map(toRow));
    this.loading.set(false);
  }

  onName(ev: Event): void {
    this.newName.set((ev.target as HTMLInputElement).value);
  }

  async create(): Promise<void> {
    const project: Project = emptyProject(newId(), this.newName().trim() || 'Camisa sin título');
    await this.projects.save(project);
    void this.router.navigate(['/proyecto', project.id]);
  }

  open(id: string): void {
    void this.router.navigate(['/proyecto', id]);
  }

  async remove(row: ProjectRow): Promise<void> {
    const ok = confirm(`¿Eliminar «${row.name}» y sus imágenes? No se puede deshacer.`);
    if (!ok) return;
    await this.projects.delete(row.id);
    await this.refresh();
  }
}

function toRow(p: Project): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    reference: p.reference,
    marks: totalAnnotations(p),
    updated: new Date(p.updatedAt).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  };
}
