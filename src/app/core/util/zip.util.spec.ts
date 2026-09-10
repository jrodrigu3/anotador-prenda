import { buildZip, textToBytes } from './zip.util';

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('buildZip', () => {
  it('emite las firmas de un ZIP válido', async () => {
    const zip = buildZip([{ path: 'a.txt', data: textToBytes('hola') }]);
    const b = await bytesOf(zip);
    const view = new DataView(b.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(view.getUint32(b.length - 22, true)).toBe(0x06054b50); // end of central directory
  });

  it('declara los nombres como UTF-8 (bit 11), o los acentos se rompen en Windows', async () => {
    const zip = buildZip([{ path: 'recortes/canesú.jpg', data: textToBytes('x') }]);
    const b = await bytesOf(zip);
    expect(new DataView(b.buffer).getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('usa método STORE: los bytes van sin comprimir', async () => {
    const payload = 'contenido reconocible';
    const zip = buildZip([{ path: 'x.txt', data: textToBytes(payload) }]);
    const text = new TextDecoder().decode(await bytesOf(zip));
    expect(text).toContain(payload);
    expect(new DataView((await bytesOf(zip)).buffer).getUint16(8, true)).toBe(0);
  });

  it('registra tantas entradas en el directorio central como archivos', async () => {
    const zip = buildZip([
      { path: 'prompt.md', data: textToBytes('# hola') },
      { path: 'annotations.json', data: textToBytes('{}') },
      { path: 'recortes/01.jpg', data: textToBytes('jpg') },
    ]);
    const b = await bytesOf(zip);
    expect(new DataView(b.buffer).getUint16(b.length - 22 + 10, true)).toBe(3);
  });

  it('es reproducible: la misma entrada produce los mismos bytes', async () => {
    const make = (): Blob => buildZip([{ path: 'a.txt', data: textToBytes('hola') }]);
    expect(await bytesOf(make())).toEqual(await bytesOf(make()));
  });

  it('acepta un ZIP vacío sin romperse', async () => {
    const b = await bytesOf(buildZip([]));
    expect(b.length).toBe(22);
  });
});
