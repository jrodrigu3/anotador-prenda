/**
 * Escritor de ZIP en método STORE (sin compresión), a mano.
 *
 * Sin dependencia a propósito: el 99 % de los bytes del bundle son JPEG ya comprimidos, y
 * DEFLATE sobre eso gana ~0 % y solo malgasta CPU. El JSON y el Markdown son unos pocos kB.
 *
 * Detalles que hay que acertar: el **bit 11 (0x0800)** marca los nombres como UTF-8 —sin él
 * los acentos se rompen al abrir el ZIP en Windows— y la fecha fija hace la exportación
 * reproducible byte a byte.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Bytes): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * TypeScript 6 distingue `Uint8Array<ArrayBuffer>` de `Uint8Array<ArrayBufferLike>` (que
 * podría respaldarse en un `SharedArrayBuffer`) y `BlobPart` solo admite el primero.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipEntry {
  readonly path: string;
  readonly data: Bytes;
}

export class ZipTooLargeError extends Error {
  constructor() {
    super('El bundle supera los 4 GB: haría falta Zip64. Exporta menos anotaciones.');
  }
}

export function buildZip(entries: readonly ZipEntry[]): Blob {
  const parts: BlobPart[] = [];
  const central: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textToBytes(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    if (offset > 0xffffffff - size) throw new ZipTooLargeError();

    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true);
    lfh.setUint16(4, 20, true); // versión necesaria
    lfh.setUint16(6, 0x0800, true); // bit 11: nombre en UTF-8 — imprescindible
    lfh.setUint16(8, 0, true); // método 0 = STORE
    lfh.setUint16(10, 0, true); // hora MS-DOS
    lfh.setUint16(12, 0x0021, true); // fecha MS-DOS fija: exportación determinista
    lfh.setUint32(14, crc, true);
    lfh.setUint32(18, size, true);
    lfh.setUint32(22, size, true);
    lfh.setUint16(26, name.length, true);
    lfh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lfh.buffer), name, entry.data);

    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(4, 20, true);
    cdh.setUint16(6, 20, true);
    cdh.setUint16(8, 0x0800, true);
    cdh.setUint16(10, 0, true);
    cdh.setUint16(12, 0, true);
    cdh.setUint16(14, 0x0021, true);
    cdh.setUint32(16, crc, true);
    cdh.setUint32(20, size, true);
    cdh.setUint32(24, size, true);
    cdh.setUint16(28, name.length, true);
    cdh.setUint32(42, offset, true);
    const cd = new Uint8Array(46 + name.length);
    cd.set(new Uint8Array(cdh.buffer), 0);
    cd.set(name, 46);
    central.push(cd);

    offset += 30 + name.length + size;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], {
    type: 'application/zip',
  });
}

export async function blobToBytes(blob: Blob): Promise<Bytes> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function textToBytes(text: string): Bytes {
  const encoded = new TextEncoder().encode(text);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}
