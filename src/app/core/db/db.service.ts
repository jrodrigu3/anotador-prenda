import { Service, signal } from '@angular/core';
import { IDBPDatabase, openDB } from 'idb';
import { AnotadorDB, DB_NAME, DB_VERSION } from './db.schema';

@Service()
export class DbService {
  /** Mensaje para la UI cuando otra pestaña bloquea una actualización de esquema. */
  readonly blockedMessage = signal<string | null>(null);
  private persistRequested = false;

  private readonly dbPromise: Promise<IDBPDatabase<AnotadorDB>> = openDB<AnotadorDB>(
    DB_NAME,
    DB_VERSION,
    {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('by-updatedAt', 'updatedAt');
          const images = db.createObjectStore('images', { keyPath: 'id' });
          images.createIndex('by-project', 'projectId');
          db.createObjectStore('meta');
        }
      },
      blocked: () => {
        this.blockedMessage.set(
          'Hay otra pestaña con una versión anterior abierta. Ciérrala para poder actualizar.',
        );
      },
      blocking: () => {
        this.blockedMessage.set(
          'Otra pestaña necesita actualizar el almacenamiento. Recarga esta página.',
        );
      },
      terminated: () => {
        this.blockedMessage.set('El navegador cerró la conexión con el almacenamiento. Recarga.');
      },
    },
  );

  db(): Promise<IDBPDatabase<AnotadorDB>> {
    return this.dbPromise;
  }

  /**
   * Sin almacenamiento persistente, Chrome puede desalojar el origen entero bajo presión de
   * disco y el diseñador pierde su trabajo. Se pide una sola vez, al primer guardado.
   */
  async requestPersistence(): Promise<void> {
    if (this.persistRequested) return;
    this.persistRequested = true;
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* no soportado: seguimos igualmente */
    }
  }

  async estimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      const e = await navigator.storage?.estimate?.();
      if (!e) return null;
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    } catch {
      return null;
    }
  }
}
