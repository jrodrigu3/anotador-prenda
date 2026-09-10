import { NormPoint } from '../models/geometry.model';
import { ViewId } from '../models/project.model';

/**
 * Descriptor espacial en palabras. Es el canal que sigue funcionando cuando la insignia
 * numérica sale ilegible sobre un estampado.
 *
 * EL ESCOLLO DE DOMINIO MÁS CARO DEL PROYECTO: en confección, "manga izquierda" es la del
 * PORTADOR, no la de la imagen. Si el JSON dice solo "izquierda", el taller (y el modelo)
 * cosen la prenda espejada. Por eso se emiten SIEMPRE las dos lecturas.
 */
export interface SpatialDescriptor {
  /** Frase completa en español, lista para que el modelo la lea tal cual. */
  readonly text: string;
  readonly verticalThird: 'superior' | 'medio' | 'inferior';
  /** Referido a la IMAGEN tal como se ve. */
  readonly horizontalBand: 'izquierda' | 'centro' | 'derecha';
  /** Referido a QUIEN VISTE la prenda. En la vista frontal es el contrario. */
  readonly wearerSide: 'izquierda' | 'derecha' | 'centro';
  /** Celda de una rejilla 5x5, tipo 'C2'. */
  readonly gridCell: string;
  readonly percentFromLeft: number;
  readonly percentFromTop: number;
}

const COLS = 'ABCDE';

const WEARER_SIDE_MASC = {
  izquierda: 'IZQUIERDO',
  derecha: 'DERECHO',
} as const;

export function deriveSpatial(p: NormPoint, view: ViewId): SpatialDescriptor {
  const verticalThird = p.y < 1 / 3 ? 'superior' : p.y < 2 / 3 ? 'medio' : 'inferior';
  // Franja central estrecha (45-55 %) a propósito: la prenda se fotografía centrada, así
  // que casi todo lo que no está sobre la botonadura pertenece claramente a un lado. Con
  // una banda ancha, un bolsillo de pecho salía descrito como "central" y se perdía el
  // canal de palabras justo en el caso de los elementos duplicados.
  const horizontalBand = p.x < 0.45 ? 'izquierda' : p.x < 0.55 ? 'centro' : 'derecha';

  // De frente, la izquierda de la imagen es la DERECHA del portador. De espaldas coinciden.
  const wearerSide =
    horizontalBand === 'centro'
      ? ('centro' as const)
      : view === 'frente'
        ? horizontalBand === 'izquierda'
          ? ('derecha' as const)
          : ('izquierda' as const)
        : horizontalBand;

  const col = COLS[Math.min(4, Math.max(0, Math.floor(p.x * 5)))];
  const row = 1 + Math.min(4, Math.max(0, Math.floor(p.y * 5)));
  const gridCell = `${col}${row}`;

  const percentFromLeft = Math.round(p.x * 100);
  const percentFromTop = Math.round(p.y * 100);

  const bandText = horizontalBand === 'centro' ? 'franja central' : `mitad ${horizontalBand}`;
  // 'lado' es masculino: «lado IZQUIERDO», no «lado IZQUIERDA». La frase la lee la IA y la
  // copia en su respuesta, así que la concordancia importa.
  const sideText =
    wearerSide === 'centro'
      ? ''
      : `, que corresponde al lado ${WEARER_SIDE_MASC[wearerSide]} de quien viste la prenda`;

  const text =
    `Tercio ${verticalThird}, ${bandText} de la imagen${sideText}. ` +
    `Celda ${gridCell} de una rejilla 5×5. ` +
    `A ${percentFromLeft}% del ancho y ${percentFromTop}% del alto, ` +
    `medidos desde la esquina superior izquierda.`;

  return {
    text,
    verticalThird,
    horizontalBand,
    wearerSide,
    gridCell,
    percentFromLeft,
    percentFromTop,
  };
}

/** Versión corta para `aria-label` y para la lista lateral. */
export function shortPosition(p: NormPoint): string {
  const v = p.y < 1 / 3 ? 'zona superior' : p.y < 2 / 3 ? 'zona media' : 'zona inferior';
  const h = p.x < 0.38 ? 'izquierda' : p.x < 0.62 ? 'centro' : 'derecha';
  return `${v} ${h}`;
}
