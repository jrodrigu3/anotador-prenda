import { Service } from '@angular/core';

/**
 * Blob URLs con conteo de referencias.
 *
 * Revocar demasiado pronto deja el lienzo en blanco al cambiar de vista (el `<image>` aún
 * estaba decodificando); no revocar nunca fuga decenas de MB por proyecto abierto. Además,
 * una exportación en curso puede seguir leyendo la URL mientras la UI ya cambió de vista.
 */
@Service()
export class ObjectUrlService {
  private readonly entries = new Map<string, { url: string; refs: number }>();

  acquire(key: string, blob: Blob): string {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.url;
    }
    const url = URL.createObjectURL(blob);
    this.entries.set(key, { url, refs: 1 });
    return url;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.entries.delete(key);
    // Diferido: el <image> puede seguir decodificando el fotograma anterior.
    setTimeout(() => URL.revokeObjectURL(entry.url), 0);
  }
}
