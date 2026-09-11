import {
  AnnotationIntent,
  defaultIntent,
  intentIncomplete,
  INTENT_ORDER,
  intentSummary,
} from './intent.model';

/**
 * La frase canónica es lo que viaja a la IA y al taller. Tiene que ser una orden, no una
 * descripción: sin adjetivos, con la unidad puesta y con el código de color literal.
 */
describe('intentSummary', () => {
  it('el color lleva nombre, código y muestra, y sobre qué se aplica', () => {
    const i: AnnotationIntent = {
      kind: 'color',
      target: 'hilo',
      hex: '#7ec8e3',
      name: 'Celeste 1',
      code: '14-4112 TCX',
    };
    expect(intentSummary(i)).toBe('Cambiar el color del hilo a Celeste 1 · 14-4112 TCX (#7ec8e3)');
  });

  it('si el color no tiene nombre ni código, al menos va la muestra', () => {
    const i: AnnotationIntent = {
      kind: 'color',
      target: 'tejido',
      hex: '#112233',
      name: '',
      code: '',
    };
    expect(intentSummary(i)).toBe('Cambiar el color del tejido a #112233');
  });

  it('la medida lleva verbo, dimensión, cantidad y unidad', () => {
    expect(
      intentSummary({ kind: 'medida', dimension: 'largo', op: 'aumentar', value: 3, unit: 'cm' }),
    ).toBe('Aumentar el largo en 3 cm');
    expect(
      intentSummary({ kind: 'medida', dimension: 'ancho', op: 'reducir', value: 1.5, unit: 'cm' }),
    ).toBe('Reducir el ancho en 1,5 cm');
  });

  it('centrar no pide distancia', () => {
    expect(intentSummary({ kind: 'mover', direction: 'centrar', value: 0, unit: 'cm' })).toBe(
      'Centrar',
    );
    expect(intentSummary({ kind: 'mover', direction: 'abajo', value: 2, unit: 'cm' })).toBe(
      'Mover hacia abajo 2 cm',
    );
  });

  it('la acción libre no dice nada: manda la nota del diseñador', () => {
    expect(intentSummary({ kind: 'libre' })).toBe('');
  });

  it('toda acción del catálogo produce una frase, salvo la libre', () => {
    for (const kind of INTENT_ORDER) {
      const summary = intentSummary(defaultIntent(kind));
      if (kind === 'libre') expect(summary).toBe('');
      else expect(summary.length).toBeGreaterThan(0);
    }
  });
});

/** Una acción a medio rellenar es peor que ninguna: se avisa antes de exportar. */
describe('intentIncomplete', () => {
  it('el color necesita nombre o código, no basta la muestra', () => {
    const base = { kind: 'color', target: 'tejido', hex: '#fff' } as const;
    expect(intentIncomplete({ ...base, name: '', code: '' })).toContain('nombre');
    expect(intentIncomplete({ ...base, name: 'Celeste 1', code: '' })).toBeNull();
    expect(intentIncomplete({ ...base, name: '', code: '14-4112 TCX' })).toBeNull();
  });

  it('una medida sin cantidad está incompleta', () => {
    expect(
      intentIncomplete({
        kind: 'medida',
        dimension: 'largo',
        op: 'aumentar',
        value: 0,
        unit: 'cm',
      }),
    ).toContain('cantidad');
  });

  it('centrar está completo sin cantidad', () => {
    expect(
      intentIncomplete({ kind: 'mover', direction: 'centrar', value: 0, unit: 'cm' }),
    ).toBeNull();
  });

  it('los campos de texto necesitan texto', () => {
    expect(intentIncomplete({ kind: 'material', value: '  ' })).toContain('describir');
    expect(intentIncomplete({ kind: 'material', value: 'popelín 120 hilos' })).toBeNull();
  });

  it('la acción libre nunca está incompleta', () => {
    expect(intentIncomplete({ kind: 'libre' })).toBeNull();
  });
});

describe('defaultIntent', () => {
  it('cambiar de acción no deja campos sin valor', () => {
    for (const kind of INTENT_ORDER) {
      expect(defaultIntent(kind).kind).toBe(kind);
    }
  });

  it('el color arranca con una muestra válida', () => {
    const i = defaultIntent('color');
    expect(i.kind).toBe('color');
    if (i.kind === 'color') expect(i.hex).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
