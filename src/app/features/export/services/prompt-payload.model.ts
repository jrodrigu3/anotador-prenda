import { AnnotationsBundleJson } from './bundle.model';

export interface PromptTextBlock {
  readonly kind: 'text';
  readonly text: string;
}

export interface PromptImageBlock {
  readonly kind: 'image';
  readonly mediaType: 'image/jpeg' | 'image/png';
  readonly blob: Blob;
  readonly filename: string;
  /** Rótulo que va justo ANTES de la imagen: es lo que permite decir "la Imagen 3". */
  readonly caption: string;
}

export type PromptBlock = PromptTextBlock | PromptImageBlock;

/**
 * La carga, neutral respecto del destino.
 *
 * La clave del diseño: el ZIP y una futura llamada a la API son **dos serializaciones del
 * mismo `PromptBlock[]`**. Se construye una sola vez; luego, o se escribe en archivos, o se
 * manda por HTTP. Ningún componente sabe cuál de las dos cosas ocurre.
 */
export interface PromptPayload {
  readonly bundleId: string;
  readonly folderName: string;
  /** El contenido de `prompt.md`. En una llamada a la API iría como `system`. */
  readonly system: string;
  readonly blocks: readonly PromptBlock[];
  readonly annotations: AnnotationsBundleJson;
  readonly warnings: readonly string[];
  /** Coste aproximado en tokens de entrada, para avisar antes de exportar. */
  readonly estimatedInputTokens: number;
}
