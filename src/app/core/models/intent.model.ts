/**
 * QUÉ hay que hacer en la marca, como dato y no como prosa.
 *
 * Una nota libre («que este borde sea redondeado») obliga al modelo a interpretar; una
 * acción estructurada le llega ya resuelta y, sobre todo, llega igual al taller. La nota
 * libre no desaparece: sigue viajando literal como matiz.
 */

export type IntentKind =
  | 'color'
  | 'medida'
  | 'mover'
  | 'forma'
  | 'costura'
  | 'material'
  | 'acabado'
  | 'anadir'
  | 'quitar'
  | 'libre';

/** Sobre qué se aplica el color: no es lo mismo teñir el tejido que cambiar el hilo. */
export type ColorTarget = 'tejido' | 'hilo' | 'boton' | 'ribete' | 'estampado' | 'cremallera';

export type MeasureOp = 'aumentar' | 'reducir' | 'fijar';
export type MeasureUnit = 'cm' | 'mm' | 'in';
export type Dimension = 'largo' | 'ancho' | 'alto' | 'contorno' | 'profundidad' | 'separacion';
export type Direction = 'arriba' | 'abajo' | 'izquierda' | 'derecha' | 'centrar';

export interface ColorIntent {
  readonly kind: 'color';
  readonly target: ColorTarget;
  /** Muestra visible. Siempre presente: es lo que se ve. */
  readonly hex: string;
  /** Nombre del color en la ficha («Celeste 1»). */
  readonly name: string;
  /** Código de industria (TCX, Pantone, interno). Viaja literal al taller. */
  readonly code: string;
}

export interface MeasureIntent {
  readonly kind: 'medida';
  readonly dimension: Dimension;
  readonly op: MeasureOp;
  readonly value: number;
  readonly unit: MeasureUnit;
}

export interface MoveIntent {
  readonly kind: 'mover';
  readonly direction: Direction;
  readonly value: number;
  readonly unit: MeasureUnit;
}

export interface ChoiceIntent {
  readonly kind: 'forma' | 'costura';
  readonly value: string;
}

export interface TextIntent {
  readonly kind: 'material' | 'acabado' | 'anadir' | 'quitar';
  readonly value: string;
}

export interface FreeIntent {
  readonly kind: 'libre';
}

export type AnnotationIntent =
  ColorIntent | MeasureIntent | MoveIntent | ChoiceIntent | TextIntent | FreeIntent;

export const FREE_INTENT: FreeIntent = { kind: 'libre' };

export const INTENT_LABELS: Readonly<Record<IntentKind, string>> = {
  libre: 'Solo indicación',
  color: 'Cambiar color',
  medida: 'Cambiar medida',
  mover: 'Mover / reposicionar',
  forma: 'Cambiar forma o borde',
  costura: 'Cambiar costura',
  material: 'Cambiar material',
  acabado: 'Acabado',
  anadir: 'Añadir',
  quitar: 'Quitar',
};

export const INTENT_ORDER: readonly IntentKind[] = [
  'libre',
  'color',
  'medida',
  'mover',
  'forma',
  'costura',
  'material',
  'acabado',
  'anadir',
  'quitar',
];

export const COLOR_TARGETS: readonly { id: ColorTarget; label: string }[] = [
  { id: 'tejido', label: 'tejido' },
  { id: 'hilo', label: 'hilo' },
  { id: 'boton', label: 'botón' },
  { id: 'ribete', label: 'ribete' },
  { id: 'estampado', label: 'estampado' },
  { id: 'cremallera', label: 'cremallera' },
];

export const SHAPES: readonly string[] = [
  'redondeado',
  'recto',
  'en punta',
  'curvo',
  'biselado',
  'asimétrico',
  'más abierto',
  'más cerrado',
];

export const STITCHES: readonly string[] = [
  'pespunte simple',
  'pespunte doble',
  'recubierta',
  'overlock',
  'costura francesa',
  'ribeteada',
  'invisible',
  'a mano',
];

export const DIMENSIONS: readonly Dimension[] = [
  'largo',
  'ancho',
  'alto',
  'contorno',
  'profundidad',
  'separacion',
];

export const DIRECTIONS: readonly Direction[] = [
  'arriba',
  'abajo',
  'izquierda',
  'derecha',
  'centrar',
];

export const UNITS: readonly MeasureUnit[] = ['cm', 'mm', 'in'];

/** Intención por defecto de cada tipo, para que cambiar de acción no deje campos vacíos. */
export function defaultIntent(kind: IntentKind): AnnotationIntent {
  switch (kind) {
    case 'color':
      return { kind: 'color', target: 'tejido', hex: '#c3d3e8', name: '', code: '' };
    case 'medida':
      return { kind: 'medida', dimension: 'largo', op: 'aumentar', value: 1, unit: 'cm' };
    case 'mover':
      return { kind: 'mover', direction: 'abajo', value: 1, unit: 'cm' };
    case 'forma':
      return { kind: 'forma', value: SHAPES[0] };
    case 'costura':
      return { kind: 'costura', value: STITCHES[0] };
    case 'material':
    case 'acabado':
    case 'anadir':
    case 'quitar':
      return { kind, value: '' };
    case 'libre':
      return FREE_INTENT;
  }
}

/**
 * La frase canónica de la acción. Es lo que viaja en la tabla del prompt y lo que lee el
 * taller: una orden inequívoca, sin adjetivos.
 */
export function intentSummary(intent: AnnotationIntent): string {
  switch (intent.kind) {
    case 'libre':
      return '';
    case 'color': {
      const target = COLOR_TARGETS.find((t) => t.id === intent.target)?.label ?? intent.target;
      const parts = [intent.name.trim(), intent.code.trim()].filter(Boolean);
      const id = parts.length > 0 ? `${parts.join(' · ')} (${intent.hex})` : intent.hex;
      return `Cambiar el color del ${target} a ${id}`;
    }
    case 'medida': {
      const verb =
        intent.op === 'aumentar' ? 'Aumentar' : intent.op === 'reducir' ? 'Reducir' : 'Fijar';
      const prep = intent.op === 'fijar' ? 'en' : 'en';
      return `${verb} el ${intent.dimension} ${prep} ${format(intent.value)} ${intent.unit}`;
    }
    case 'mover':
      return intent.direction === 'centrar'
        ? 'Centrar'
        : `Mover hacia ${intent.direction} ${format(intent.value)} ${intent.unit}`;
    case 'forma':
      return `Cambiar la forma o el borde a ${intent.value}`;
    case 'costura':
      return `Cambiar la costura a ${intent.value}`;
    case 'material':
      return `Cambiar el material a ${intent.value}`;
    case 'acabado':
      return `Acabado: ${intent.value}`;
    case 'anadir':
      return `Añadir ${intent.value}`;
    case 'quitar':
      return `Quitar ${intent.value}`;
  }
}

/** Una acción a medio rellenar es peor que ninguna: se avisa antes de exportar. */
export function intentIncomplete(intent: AnnotationIntent): string | null {
  switch (intent.kind) {
    case 'color':
      return intent.name.trim() || intent.code.trim()
        ? null
        : 'falta el nombre o el código del color';
    case 'medida':
    case 'mover':
      return intent.kind === 'mover' && intent.direction === 'centrar'
        ? null
        : intent.value > 0
          ? null
          : 'falta la cantidad';
    case 'material':
    case 'acabado':
    case 'anadir':
    case 'quitar':
      return intent.value.trim() ? null : 'falta describir qué';
    default:
      return null;
  }
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}
