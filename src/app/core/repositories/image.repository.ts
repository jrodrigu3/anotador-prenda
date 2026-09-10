import { inject, Service } from '@angular/core';
import { DbService } from '../db/db.service';
import { ImageRecord } from '../db/db.schema';

@Service()
export class ImageRepository {
  private readonly dbService = inject(DbService);

  async get(id: string): Promise<ImageRecord | undefined> {
    return (await this.dbService.db()).get('images', id);
  }

  async put(record: ImageRecord): Promise<void> {
    const db = await this.dbService.db();
    await db.put('images', record);
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbService.db();
    await db.delete('images', id);
  }

  async deleteByProject(projectId: string): Promise<void> {
    const db = await this.dbService.db();
    const tx = db.transaction('images', 'readwrite');
    const keys = await tx.store.index('by-project').getAllKeys(projectId);
    await Promise.all(keys.map((k) => tx.store.delete(k)));
    await tx.done;
  }

  /**
   * Borra los bitmaps de un proyecto que ya no referencia ninguna vista (pasa al sustituir
   * una foto). Sin esto el almacenamiento crece sin techo.
   */
  async collectOrphans(projectId: string, keep: readonly string[]): Promise<number> {
    const db = await this.dbService.db();
    const tx = db.transaction('images', 'readwrite');
    const keys = await tx.store.index('by-project').getAllKeys(projectId);
    const alive = new Set(keep);
    const dead = keys.filter((k) => !alive.has(String(k)));
    await Promise.all(dead.map((k) => tx.store.delete(k)));
    await tx.done;
    return dead.length;
  }
}
