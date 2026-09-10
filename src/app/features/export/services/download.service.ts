import { Service } from '@angular/core';

@Service()
export class DownloadService {
  /** Descarga un Blob. La URL se revoca con retraso: revocar al instante aborta la descarga. */
  save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /**
   * Varias descargas seguidas: Chrome pide permiso de "descargar varios archivos" y Safari
   * estrangula las ráfagas, así que se secuencian.
   */
  async saveMany(files: readonly { blob: Blob; filename: string }[]): Promise<void> {
    for (const f of files) {
      this.save(f.blob, f.filename);
      await new Promise((r) => setTimeout(r, 180));
    }
  }
}
