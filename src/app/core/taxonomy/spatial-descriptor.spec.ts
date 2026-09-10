import { deriveSpatial } from './spatial-descriptor';

/**
 * El escollo de dominio más caro del proyecto: en confección "manga izquierda" es la del
 * PORTADOR, no la de la imagen. Equivocarlo produce prendas espejadas en producción.
 */
describe('deriveSpatial: lado de la imagen vs lado del portador', () => {
  it('en la vista FRONTAL el lado se invierte', () => {
    const izquierdaDeLaImagen = deriveSpatial({ x: 0.2, y: 0.3 }, 'frente');
    expect(izquierdaDeLaImagen.horizontalBand).toBe('izquierda');
    expect(izquierdaDeLaImagen.wearerSide).toBe('derecha');

    const derechaDeLaImagen = deriveSpatial({ x: 0.8, y: 0.3 }, 'frente');
    expect(derechaDeLaImagen.horizontalBand).toBe('derecha');
    expect(derechaDeLaImagen.wearerSide).toBe('izquierda');
  });

  it('en la vista TRASERA el lado coincide', () => {
    const d = deriveSpatial({ x: 0.2, y: 0.3 }, 'espalda');
    expect(d.horizontalBand).toBe('izquierda');
    expect(d.wearerSide).toBe('izquierda');
  });

  it('el centro no tiene lado en ninguna vista', () => {
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente').wearerSide).toBe('centro');
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'espalda').wearerSide).toBe('centro');
  });

  /**
   * La prenda se fotografía centrada: un bolsillo de pecho al 40 % está claramente en un
   * lado. Describirlo como "central" perdería el canal de palabras justo donde más falta
   * hace, que es cuando hay dos bolsillos iguales.
   */
  it('la franja central es estrecha: un bolsillo de pecho SÍ tiene lado', () => {
    const bolsilloIzquierdoDeLaImagen = deriveSpatial({ x: 0.4, y: 0.41 }, 'frente');
    expect(bolsilloIzquierdoDeLaImagen.horizontalBand).toBe('izquierda');
    expect(bolsilloIzquierdoDeLaImagen.wearerSide).toBe('derecha');

    // La botonadura, en cambio, sigue siendo centro.
    expect(deriveSpatial({ x: 0.5, y: 0.6 }, 'frente').horizontalBand).toBe('centro');
  });

  it('la frase en prosa declara explícitamente el lado del portador', () => {
    const d = deriveSpatial({ x: 0.85, y: 0.15 }, 'frente');
    expect(d.text).toContain('mitad derecha de la imagen');
    expect(d.text).toContain('lado IZQUIERDO de quien viste la prenda');
    // 'lado' es masculino: la frase la copia la IA en su respuesta.
    expect(d.text).not.toContain('lado IZQUIERDA');
  });
});

describe('deriveSpatial: rejilla y tercios', () => {
  it('parte la imagen en tercios verticales', () => {
    expect(deriveSpatial({ x: 0.5, y: 0.1 }, 'frente').verticalThird).toBe('superior');
    expect(deriveSpatial({ x: 0.5, y: 0.5 }, 'frente').verticalThird).toBe('medio');
    expect(deriveSpatial({ x: 0.5, y: 0.9 }, 'frente').verticalThird).toBe('inferior');
  });

  it('la celda usa una rejilla 5x5 con columnas A..E', () => {
    expect(deriveSpatial({ x: 0.05, y: 0.05 }, 'frente').gridCell).toBe('A1');
    expect(deriveSpatial({ x: 0.95, y: 0.95 }, 'frente').gridCell).toBe('E5');
  });

  it('el borde exacto x=1 no se sale de la rejilla', () => {
    expect(deriveSpatial({ x: 1, y: 1 }, 'frente').gridCell).toBe('E5');
  });

  it('los porcentajes se redondean a entero', () => {
    const d = deriveSpatial({ x: 0.6312, y: 0.1874 }, 'frente');
    expect(d.percentFromLeft).toBe(63);
    expect(d.percentFromTop).toBe(19);
  });
});
