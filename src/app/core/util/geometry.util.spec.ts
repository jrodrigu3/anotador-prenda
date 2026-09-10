import { Geometry, Size } from '../models/geometry.model';
import {
  anchorOf,
  bboxOf,
  clampNorm,
  fromNorm,
  moveVertex,
  normRect,
  polygonCentroid,
  removePolygonVertex,
  roundNorm,
  toNorm,
  translateGeometry,
  verticesOf,
} from './geometry.util';

// Imagen deliberadamente NO cuadrada: es donde se destapan los errores de anisotropía.
const N: Size = { w: 4000, h: 3000 };

describe('conversión normalizado <-> contenido', () => {
  it('ida y vuelta sin pérdida apreciable', () => {
    const p = { x: 1234.5, y: 987.25 };
    const back = fromNorm(toNorm(p, N), N);
    expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9);
    expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9);
  });

  it('usa ejes independientes, no un factor único', () => {
    const n = toNorm({ x: 2000, y: 1500 }, N);
    expect(n.x).toBeCloseTo(0.5, 10);
    expect(n.y).toBeCloseTo(0.5, 10);
  });

  it('clampNorm mantiene la marca dentro de la imagen', () => {
    expect(clampNorm({ x: -0.3, y: 1.8 })).toEqual({ x: 0, y: 1 });
  });

  it('roundNorm deja un error muy por debajo del píxel en 4000 px', () => {
    const p = { x: 0.1234567891, y: 0.9876543219 };
    const r = roundNorm(p);
    expect(Math.abs(r.x - p.x) * N.w).toBeLessThan(0.05);
    expect(Math.abs(r.y - p.y) * N.h).toBeLessThan(0.05);
  });
});

describe('anchorOf: el punto canónico de cada forma', () => {
  it('el alfiler es su propio punto', () => {
    expect(anchorOf({ kind: 'pin', point: { x: 0.3, y: 0.4 } })).toEqual({ x: 0.3, y: 0.4 });
  });

  it('en la flecha manda la PUNTA, no la cola', () => {
    const g: Geometry = {
      kind: 'arrow',
      tail: { x: 0.1, y: 0.1 },
      head: { x: 0.8, y: 0.7 },
    };
    expect(anchorOf(g)).toEqual({ x: 0.8, y: 0.7 });
  });

  it('el rectángulo ancla en su centro', () => {
    const g: Geometry = { kind: 'rect', x: 0.2, y: 0.4, w: 0.2, h: 0.2 };
    const a = anchorOf(g);
    expect(a.x).toBeCloseTo(0.3, 10);
    expect(a.y).toBeCloseTo(0.5, 10);
  });

  it('el polígono ancla en su centroide de área', () => {
    const square = [
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.6, y: 0.6 },
      { x: 0.2, y: 0.6 },
    ];
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(0.4, 10);
    expect(c.y).toBeCloseTo(0.4, 10);
  });

  it('un polígono degenerado (vértices colineales) no devuelve NaN', () => {
    const line = [
      { x: 0.1, y: 0.5 },
      { x: 0.3, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    const c = polygonCentroid(line);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(c.x).toBeCloseTo(0.3, 10);
  });
});

describe('translateGeometry', () => {
  it('mueve todos los vértices por igual', () => {
    const g: Geometry = {
      kind: 'polygon',
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
    };
    const moved = translateGeometry(g, 0.1, 0.05);
    expect(moved.kind).toBe('polygon');
    const points = moved.kind === 'polygon' ? moved.points : [];
    const expected = [
      { x: 0.3, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.4, y: 0.45 },
    ];
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 10);
      expect(p.y).toBeCloseTo(expected[i].y, 10);
    });
  });

  it('recorta contra el borde SIN deformar la figura', () => {
    const g: Geometry = { kind: 'rect', x: 0.8, y: 0.1, w: 0.15, h: 0.2 };
    const moved = translateGeometry(g, 0.9, 0);
    const b = bboxOf(moved);
    expect(b.w).toBeCloseTo(0.15, 10); // el ancho no cambia
    expect(b.x + b.w).toBeCloseTo(1, 10); // queda pegado al borde
  });
});

describe('moveVertex', () => {
  it('la esquina opuesta del rectángulo queda fija', () => {
    const g: Geometry = { kind: 'rect', x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const moved = moveVertex(g, { kind: 'rect', corner: 'nw' }, { x: 0.3, y: 0.35 });
    expect(moved.kind).toBe('rect');
    if (moved.kind !== 'rect') return;
    // La esquina SE se queda donde estaba: (0.6, 0.6).
    expect(moved.x).toBeCloseTo(0.3, 10);
    expect(moved.y).toBeCloseTo(0.35, 10);
    expect(moved.x + moved.w).toBeCloseTo(0.6, 10);
    expect(moved.y + moved.h).toBeCloseTo(0.6, 10);
  });

  it('arrastrar una esquina más allá de la opuesta no produce anchos negativos', () => {
    const g: Geometry = { kind: 'rect', x: 0.2, y: 0.2, w: 0.2, h: 0.2 };
    const moved = moveVertex(g, { kind: 'rect', corner: 'nw' }, { x: 0.7, y: 0.8 });
    expect(moved.kind).toBe('rect');
    if (moved.kind === 'rect') {
      expect(moved.w).toBeGreaterThan(0);
      expect(moved.h).toBeGreaterThan(0);
    }
  });

  it('mueve solo el extremo indicado de la flecha', () => {
    const g: Geometry = { kind: 'arrow', tail: { x: 0.1, y: 0.1 }, head: { x: 0.5, y: 0.5 } };
    const moved = moveVertex(g, { kind: 'arrow', end: 'head' }, { x: 0.9, y: 0.2 });
    expect(moved).toEqual({ kind: 'arrow', tail: { x: 0.1, y: 0.1 }, head: { x: 0.9, y: 0.2 } });
  });

  it('expone un tirador por vértice del polígono', () => {
    const g: Geometry = {
      kind: 'polygon',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ],
    };
    expect(verticesOf(g)).toHaveLength(3);
  });

  it('no deja borrar por debajo de 3 vértices', () => {
    const g = {
      kind: 'polygon' as const,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ],
    };
    expect(removePolygonVertex(g, 0)).toBe(g);
  });
});

describe('normRect', () => {
  it('funciona arrastrando en cualquier dirección', () => {
    expect(normRect({ x: 300, y: 400 }, { x: 100, y: 200 })).toEqual({
      x: 100,
      y: 200,
      w: 200,
      h: 200,
    });
  });
});
