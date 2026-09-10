import { Geometry, Size } from '../../../core/models/geometry.model';
import { CROP } from '../../../core/render/marker-style';
import { cropBoxPx } from './crop-box';

const N: Size = { w: 4000, h: 3000 };

describe('cropBoxPx', () => {
  it('el recorte siempre es cuadrado', () => {
    const g: Geometry = { kind: 'rect', x: 0.2, y: 0.3, w: 0.3, h: 0.1 };
    const box = cropBoxPx(g, N);
    expect(box.w).toBe(box.h);
  });

  it('nunca se sale de la imagen', () => {
    const g: Geometry = { kind: 'pin', point: { x: 0.99, y: 0.01 } };
    const box = cropBoxPx(g, N);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(N.w);
    expect(box.y + box.h).toBeLessThanOrEqual(N.h);
  });

  /**
   * El detalle que importa: al chocar con el borde la caja se DESPLAZA, no encoge. Si
   * encogiera, una marca pegada al borde saldría con un zoom distinto al del resto y el
   * modelo no podría comparar recortes entre sí.
   */
  it('en el borde se desplaza en vez de encoger', () => {
    const centro = cropBoxPx({ kind: 'pin', point: { x: 0.5, y: 0.5 } }, N);
    const borde = cropBoxPx({ kind: 'pin', point: { x: 0.005, y: 0.5 } }, N);
    expect(borde.w).toBe(centro.w);
    expect(borde.x).toBe(0);
  });

  it('respeta el lado mínimo, para que un pin no salga microscópico', () => {
    const box = cropBoxPx({ kind: 'pin', point: { x: 0.5, y: 0.5 } }, N);
    expect(box.w).toBeGreaterThanOrEqual(
      Math.max(CROP.minSidePx, Math.max(N.w, N.h) * CROP.minSideFrac),
    );
  });

  it('un polígono grande produce un recorte mayor que un alfiler', () => {
    const pin = cropBoxPx({ kind: 'pin', point: { x: 0.5, y: 0.5 } }, N);
    const poly = cropBoxPx(
      {
        kind: 'polygon',
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.8, y: 0.7 },
          { x: 0.2, y: 0.7 },
        ],
      },
      N,
    );
    expect(poly.w).toBeGreaterThan(pin.w);
  });

  it('la flecha incluye cola y punta con holgura', () => {
    const g: Geometry = {
      kind: 'arrow',
      tail: { x: 0.3, y: 0.3 },
      head: { x: 0.5, y: 0.45 },
    };
    const box = cropBoxPx(g, N);
    expect(box.x).toBeLessThanOrEqual(0.3 * N.w);
    expect(box.x + box.w).toBeGreaterThanOrEqual(0.5 * N.w);
  });

  it('nunca supera el lado corto de la imagen', () => {
    const g: Geometry = {
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    const box = cropBoxPx(g, N);
    expect(box.w).toBeLessThanOrEqual(Math.min(N.w, N.h));
  });
});
