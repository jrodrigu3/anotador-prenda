import { inject, Service } from '@angular/core';
import { DbService } from '../db/db.service';
import { SCHEMA_VERSION } from '../models/annotation.model';
import { Project } from '../models/project.model';
import { ImageRepository } from './image.repository';

/**
 * Migración del DOCUMENTO, separada de la migración del LAYOUT de IndexedDB (que vive en
 * `DbService.upgrade`). Confundir las dos es el error clásico: el layout cambia cuando se
 * añade un almacén; el documento cambia cuando cambia la forma de `Project`.
 */
type Migrator = (doc: Record<string, unknown>) => Record<string, unknown>;

const MIGRATORS: Readonly<Record<number, Migrator>> = {
  // 1 -> 2: cuando haga falta.
};

function migrate(raw: Project): Project {
  let doc = raw as unknown as Record<string, unknown>;
  let version = typeof doc['schemaVersion'] === 'number' ? (doc['schemaVersion'] as number) : 0;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATORS[version];
    if (!step) break;
    doc = step(doc);
    version += 1;
    doc['schemaVersion'] = version;
  }
  return doc as unknown as Project;
}

@Service()
export class ProjectRepository {
  private readonly dbService = inject(DbService);
  private readonly images = inject(ImageRepository);

  async list(): Promise<readonly Project[]> {
    const db = await this.dbService.db();
    const all = await db.getAllFromIndex('projects', 'by-updatedAt');
    return all.map(migrate).reverse(); // más recientes primero
  }

  async get(id: string): Promise<Project | null> {
    const db = await this.dbService.db();
    const raw = await db.get('projects', id);
    if (!raw) return null;
    const migrated = migrate(raw);
    if (migrated.schemaVersion !== raw.schemaVersion) await db.put('projects', migrated);
    return migrated;
  }

  async save(project: Project): Promise<void> {
    await this.dbService.requestPersistence();
    const db = await this.dbService.db();
    await db.put('projects', project);
  }

  /** Proyecto e imágenes en una sola transacción por almacén: si no, quedan huérfanas. */
  async delete(id: string): Promise<void> {
    const db = await this.dbService.db();
    await db.delete('projects', id);
    await this.images.deleteByProject(id);
  }
}
