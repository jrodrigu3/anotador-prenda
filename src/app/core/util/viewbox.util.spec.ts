import { fitToScreen, syncAspect } from './viewbox.util';

describe('syncAspect', () => {
  it('iguala la relación de aspecto del viewBox a la del elemento', () => {
    const vb = syncAspect({ x: 0, y: 0, w: 100, h: 100 }, 800, 400);
    expect(vb.w / vb.h).toBeCloseTo(2, 10);
  });

  it('expande manteniendo el centro', () => {
    const vb = syncAspect({ x: 0, y: 0, w: 100, h: 100 }, 800, 400);
    expect(vb.x + vb.w / 2).toBeCloseTo(50, 10);
    expect(vb.y + vb.h / 2).toBeCloseTo(50, 10);
  });

  it('crece en alto cuando el viewBox es demasiado ancho', () => {
    const vb = syncAspect({ x: 0, y: 0, w: 200, h: 100 }, 400, 400);
    expect(vb.w / vb.h).toBeCloseTo(1, 10);
    expect(vb.h).toBeCloseTo(200, 10);
  });

  it('es idempotente', () => {
    const once = syncAspect({ x: 0, y: 0, w: 100, h: 100 }, 800, 400);
    expect(syncAspect(once, 800, 400)).toEqual(once);
  });
});

describe('fitToScreen', () => {
  it('encuadra la imagen entera con margen', () => {
    const vb = fitToScreen({ w: 4000, h: 3000 }, 800, 600);
    expect(vb.x).toBeLessThan(0);
    expect(vb.x + vb.w).toBeGreaterThan(4000);
    expect(vb.w / vb.h).toBeCloseTo(800 / 600, 10);
  });

  it('la escala resultante es coherente: región visible == viewBox', () => {
    const elW = 900;
    const vb = fitToScreen({ w: 4000, h: 3000 }, elW, 600);
    const scale = elW / vb.w;
    expect(4000 * scale).toBeLessThanOrEqual(elW);
  });
});
