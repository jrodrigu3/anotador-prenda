import { Service } from '@angular/core';
import { PromptPayload } from './prompt-payload.model';

export interface ReviewUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export class UnsupportedReviewError extends Error {
  constructor() {
    super('Esta versión no llama a ninguna IA: exporta el bundle y pégalo en tu chat.');
  }
}

/**
 * El puerto que deja enchufar un backend mañana sin tocar la UI.
 *
 * Hoy la única implementación es `ExportOnlyReviewAdapter`. Cuando exista un BFF que llame a
 * la API de Claude, se cambia UNA línea de `providers` y aparece el botón "Analizar con IA":
 * los componentes solo consultan `kind`.
 */
@Service({ autoProvided: false })
export abstract class AnnotationReviewPort {
  abstract readonly kind: 'export-only' | 'remote';
  abstract review(payload: PromptPayload, signal?: AbortSignal): AsyncIterable<string>;
}

@Service({ autoProvided: false })
export class ExportOnlyReviewAdapter extends AnnotationReviewPort {
  readonly kind = 'export-only' as const;

  // eslint-disable-next-line require-yield
  async *review(): AsyncIterable<string> {
    throw new UnsupportedReviewError();
  }
}
