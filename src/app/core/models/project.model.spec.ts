import { Annotation } from './annotation.model';
import { emptyProject, globalNumbers, Project, totalAnnotations, viewOf } from './project.model';

function mark(id: string, order: number): Annotation {
  return {
    id,
    order,
    note: '',
    part: null,
    partFreeText: '',
    intent: { kind: 'libre' },
    status: 'borrador',
    createdAt: 0,
    updatedAt: 0,
    kind: 'pin',
    point: { x: 0.5, y: 0.5 },
  };
}

function withMarks(frente: string[], espalda: string[]): Project {
  const base = emptyProject('p1', 'Camisa', 0);
  return {
    ...base,
    views: [
      { ...base.views[0], annotations: frente.map((id, i) => mark(id, i)) },
      { ...base.views[1], annotations: espalda.map((id, i) => mark(id, i)) },
    ],
  };
}

/**
 * La numeración es la CLAVE DE UNIÓN entre la imagen, el recorte y el JSON. Un hueco o un
 * número repetido entre las dos vistas rompe todo el material que ve la IA.
 */
describe('numeración global', () => {
  it('es continua 1..N y cruza las dos vistas sin reiniciar', () => {
    const p = withMarks(['a', 'b'], ['c', 'd']);
    const n = globalNumbers(p);
    expect([n.get('a'), n.get('b'), n.get('c'), n.get('d')]).toEqual([1, 2, 3, 4]);
  });

  it('no deja huecos tras borrar una marca intermedia', () => {
    const p = withMarks(['a', 'c'], ['d']); // se borró 'b'
    const n = globalNumbers(p);
    expect([...n.values()].sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it('nunca repite un número entre frente y espalda', () => {
    const p = withMarks(['a', 'b', 'c'], ['d', 'e']);
    const values = [...globalNumbers(p).values()];
    expect(new Set(values).size).toBe(values.length);
  });

  it('respeta el campo order, no el orden del array', () => {
    const base = emptyProject('p1', 'Camisa', 0);
    const p: Project = {
      ...base,
      views: [
        { ...base.views[0], annotations: [mark('segundo', 1), mark('primero', 0)] },
        base.views[1],
      ],
    };
    const n = globalNumbers(p);
    expect(n.get('primero')).toBe(1);
    expect(n.get('segundo')).toBe(2);
  });
});

describe('estructura del proyecto', () => {
  it('nace con exactamente frente y espalda, sin imagen', () => {
    const p = emptyProject('id', 'Camisa Oxford', 1000);
    expect(p.views.map((v) => v.id)).toEqual(['frente', 'espalda']);
    expect(p.views.every((v) => v.image === null)).toBe(true);
    expect(totalAnnotations(p)).toBe(0);
  });

  it('viewOf devuelve la vista pedida', () => {
    const p = withMarks(['a'], ['b', 'c']);
    expect(viewOf(p, 'espalda').annotations).toHaveLength(2);
  });
});
