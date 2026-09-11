import { Box } from '../models/geometry.model';
import { deriveSpatial, shortPosition } from './spatial-descriptor';

/** Prenda descentrada y con margen: el caso que rompía la versión anterior. */
const BOX: Box = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };

describe('deriveSpatial · lado de la imagen frente a lado del portador', () => {
  it('en la vista FRONTAL el lado se invierte', () => {
    const izquierdaDeLaImagen = deriveSpatial({ x: 0.3, y: 0.4 }, 'frente', { garmentBox: BOX });
    expect(izquierdaDeLaImagen.imageSide).toBe('izquierda');
    expect(izquierdaDeLaImagen.wearerSide).toBe('derecha');

    const derechaDeLaImagen = deriveSpatial({ x: 0.7, y: 0.4 }, 'frente', { garmentBox: BOX });
    expect(derechaDeLaImagen.imageSide).toBe('derecha');
    expect(derechaDeLaImagen.wearerSide).toBe('izquierda');
  });

  it('en la vista TRASERA el lado coincide', () => {
    const d = deriveSpatial({ x: 0.3, y: 0.4 }, 'espalda', { garmentBox: BOX });
    expect(d.imageSide).toBe('izquierda');
    expect(d.wearerSide).toBe('izquierda');
  });

  it('el eje central no tiene lado en ninguna vista', () => {
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente', { garmentBox: BOX }).wearerSide).toBe(
      'centro',
    );
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'espalda', { garmentBox: BOX }).wearerSide).toBe(
      'centro',
    );
  });

  it('la prosa declara el lado del portador con la concordancia correcta', () => {
    const d = deriveSpatial({ x: 0.75, y: 0.3 }, 'frente', { garmentBox: BOX });
    expect(d.text).toContain('lado IZQUIERDO de quien viste la prenda');
    expect(d.text).not.toContain('lado IZQUIERDA');
  });
});

/**
 * El motivo del rediseño: medir contra la FOTO desplaza la descripción en cuanto la prenda
 * no llena el encuadre.
 */
describe('deriveSpatial · se mide contra la prenda, no contra la foto', () => {
  it('el borde superior de la prenda es 0 %, aunque en la foto esté al 10 %', () => {
    const d = deriveSpatial({ x: 0.5, y: 0.1 }, 'frente', { garmentBox: BOX });
    expect(d.fromTopPct).toBe(0);
    expect(d.photoPctFromTop).toBe(10);
  });

  it('el bajo de la prenda es 100 %, aunque en la foto esté al 90 %', () => {
    const d = deriveSpatial({ x: 0.5, y: 0.9 }, 'frente', { garmentBox: BOX });
    expect(d.fromTopPct).toBe(100);
    expect(d.zone).toBe('bajo');
  });

  it('el mismo punto cambia de zona según dónde esté la prenda en la foto', () => {
    const punto = { x: 0.5, y: 0.3 };
    const conContorno = deriveSpatial(punto, 'frente', { garmentBox: BOX });
    const sinContorno = deriveSpatial(punto, 'frente');
    expect(conContorno.fromTopPct).toBe(25); // (0.30 - 0.10) / 0.80
    expect(sinContorno.fromTopPct).toBe(30);
    expect(conContorno.zone).not.toBe(sinContorno.zone);
  });

  it('avisa cuando no hay contorno y se ha medido sobre la foto', () => {
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente').measuredOnPhoto).toBe(true);
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente').text).toContain('AVISO');
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente', { garmentBox: BOX }).text).not.toContain(
      'AVISO',
    );
  });

  it('una marca fuera del contorno detectado no revienta ni sale del 0..100', () => {
    const d = deriveSpatial({ x: 0.05, y: 0.98 }, 'frente', { garmentBox: BOX });
    expect(d.fromTopPct).toBe(100);
    expect(d.fromCenterPct).toBeLessThanOrEqual(100);
    expect(Number.isFinite(d.fromCenterPct)).toBe(true);
  });
});

describe('deriveSpatial · zonas y referencias de patronaje', () => {
  const at = (gy: number, gx = 0.5) =>
    deriveSpatial({ x: BOX.x + gx * BOX.w, y: BOX.y + gy * BOX.h }, 'frente', { garmentBox: BOX });

  it('nombra la zona anatómica en vez de un tercio', () => {
    expect(at(0.05).zone).toBe('escote y hombros');
    expect(at(0.35).zone).toBe('pecho');
    expect(at(0.55).zone).toBe('cintura');
    expect(at(0.95).zone).toBe('bajo');
  });

  it('da la referencia de patronaje más cercana', () => {
    expect(at(0.05, 0.5).landmark).toBe('escote');
    expect(at(0.05, 0.95).landmark).toBe('hombro');
    expect(at(0.5, 0.5).landmark).toBe('centro delantero');
    expect(at(0.5, 0.98).landmark).toBe('costado');
  });

  it('en la espalda el eje se llama centro espalda', () => {
    const d = deriveSpatial({ x: 0.5, y: 0.5 }, 'espalda', { garmentBox: BOX });
    expect(d.landmark).toBe('centro espalda');
  });
});

/** Es lo que convierte una posición vaga en una ejecutable. */
describe('deriveSpatial · centímetros cuando se declara el alto real', () => {
  it('convierte el % de alto en cm', () => {
    const d = deriveSpatial({ x: 0.5, y: BOX.y + 0.5 * BOX.h }, 'frente', {
      garmentBox: BOX,
      heightCm: 72,
    });
    expect(d.approxFromTopCm).toBe(36);
    expect(d.text).toContain('36 cm por debajo del borde superior');
  });

  it('sin alto declarado no inventa centímetros', () => {
    const d = deriveSpatial({ x: 0.5, y: 0.5 }, 'frente', { garmentBox: BOX });
    expect(d.approxFromTopCm).toBeNull();
    expect(d.approxFromCenterCm).toBeNull();
    expect(d.text).not.toContain('cm');
  });
});

describe('shortPosition', () => {
  it('resume zona y las dos lecturas del lado', () => {
    const d = deriveSpatial({ x: 0.75, y: 0.3 }, 'frente', { garmentBox: BOX });
    expect(shortPosition(d)).toContain('derecha en la imagen');
    expect(shortPosition(d)).toContain('lado izquierdo de quien la viste');
  });
});
