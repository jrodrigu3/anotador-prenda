import { Service } from '@angular/core';
import { RenderRequest, RenderResult } from '../render/render.types';

/**
 * Puente con el worker de rasterizado. Una petición por vista, una instancia de worker por
 * petición: el trabajo es puntual y así no queda un worker vivo consumiendo memoria.
 */
@Service()
export class RenderService {
  render(request: RenderRequest): Promise<RenderResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../render/render.worker', import.meta.url), {
        type: 'module',
      });
      const done = (fn: () => void): void => {
        worker.terminate();
        fn();
      };
      worker.onmessage = (
        ev: MessageEvent<{ ok: boolean; result?: RenderResult; error?: string }>,
      ) => {
        if (ev.data.ok && ev.data.result) done(() => resolve(ev.data.result!));
        else done(() => reject(new Error(ev.data.error ?? 'Fallo al rasterizar la vista.')));
      };
      worker.onerror = (ev) => done(() => reject(new Error(ev.message || 'Error en el worker.')));
      worker.postMessage(request);
    });
  }
}
