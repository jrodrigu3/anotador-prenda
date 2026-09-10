import { Geometry, Size } from '../../../core/models/geometry.model';
import { markStyle } from '../../../core/render/marker-style';
import { placeBadges } from './badge-layout';
import { RenderAnnotation } from './render.types';

const NATURAL: Size = { w: 4000, h: 3000 };
const CANVAS: Size = { w: 1568, h: 1176 };
const STYLE = markStyle(CANVAS.w, CANVAS.h);
/** Medida determinista: no hay canvas en el entorno de test. */
const measure = (t: string): number => t.length * STYLE.r * 0.6;

function ann(number: number, geometry: Geometry): RenderAnnotation {
  return { id: `a${number}`, number, geometry, partLabel: 'cuello', note: 'x' };
}

function pin(number: number, x: number, y: number): RenderAnnotation {
  return ann(number, { kind: 'pin', point: { x, y } });
}

describe('placeBadges', () => {
  it('coloca una insignia por anotación', () => {
    const anns = [pin(1, 0.3, 0.3), pin(2, 0.7, 0.6)];
    const { byId } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    expect(byId.size).toBe(2);
  });

  it('la insignia nunca se sienta sobre su propio punto', () => {
    const anns = [pin(1, 0.5, 0.5)];
    const { byId } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    const c = byId.get('a1')!;
    const anchor = { x: 0.5 * CANVAS.w, y: 0.5 * CANVAS.h };
    expect(Math.hypot(c.x - anchor.x, c.y - anchor.y)).toBeGreaterThan(STYLE.r * 2.5);
  });

  it('mantiene las insignias dentro del lienzo', () => {
    const anns = [pin(1, 0.01, 0.01), pin(2, 0.99, 0.99), pin(3, 0.99, 0.01)];
    const { byId } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    for (const c of byId.values()) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.y).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(CANVAS.w);
      expect(c.y).toBeLessThan(CANVAS.h);
    }
  });

  it('separa insignias de marcas contiguas', () => {
    const anns = [pin(1, 0.5, 0.5), pin(2, 0.51, 0.5), pin(3, 0.52, 0.5)];
    const { byId } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    const centers = [...byId.values()];
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
        expect(d).toBeGreaterThan(STYLE.r);
      }
    }
  });

  it('resuelve una docena de marcas próximas sin declarar cúmulo', () => {
    const anns = Array.from({ length: 12 }, (_, i) => pin(i + 1, 0.45 + i * 0.008, 0.5));
    const { crowded, byId } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    expect(byId.size).toBe(12);
    expect(crowded).toEqual([]);
  });

  /** Un solape es una ambigüedad: hay que reportarlo, no resolverlo en silencio. */
  it('reporta el cúmulo cuando ya no queda hueco limpio', () => {
    const anns = Array.from({ length: 45 }, (_, i) => pin(i + 1, 0.5 + i * 0.0004, 0.5));
    const { crowded } = placeBadges(anns, CANVAS, NATURAL, STYLE, measure);
    expect(crowded.length).toBeGreaterThan(0);
  });

  it('es determinista: dos llamadas dan el mismo resultado', () => {
    const anns = [pin(1, 0.3, 0.3), pin(2, 0.7, 0.6), pin(3, 0.5, 0.8)];
    const a = placeBadges(anns, CANVAS, NATURAL, STYLE, measure).byId;
    const b = placeBadges(anns, CANVAS, NATURAL, STYLE, measure).byId;
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });

  it('ancla la flecha en su punta', () => {
    const arrow = ann(1, {
      kind: 'arrow',
      tail: { x: 0.1, y: 0.1 },
      head: { x: 0.8, y: 0.8 },
    });
    const { byId } = placeBadges([arrow], CANVAS, NATURAL, STYLE, measure);
    const c = byId.get('a1')!;
    const head = { x: 0.8 * CANVAS.w, y: 0.8 * CANVAS.h };
    const tail = { x: 0.1 * CANVAS.w, y: 0.1 * CANVAS.h };
    expect(Math.hypot(c.x - head.x, c.y - head.y)).toBeLessThan(
      Math.hypot(c.x - tail.x, c.y - tail.y),
    );
  });
});
