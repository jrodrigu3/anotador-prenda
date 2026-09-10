import { Service } from '@angular/core';

@Service()
export class ClipboardService {
  async copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copiar una imagen al portapapeles tiene dos trampas:
   *  - Solo `image/png` está garantizado: Safari y Firefox rechazan `image/jpeg` en un
   *    `ClipboardItem`. Por eso se genera una variante PNG solo para copiar, aunque el ZIP
   *    lleve JPEG.
   *  - Safari exige que el `ClipboardItem` se construya con una PROMESA de blob dentro del
   *    mismo gesto de usuario, no con un blob ya resuelto tras un `await`.
   */
  async copyImage(pngPromise: Promise<Blob>): Promise<boolean> {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
      return true;
    } catch {
      return false;
    }
  }

  /** Reconvierte un JPEG a PNG, que es el único tipo que el portapapeles acepta siempre. */
  async toPng(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = 0;
    canvas.height = 0;
    return png;
  }
}
