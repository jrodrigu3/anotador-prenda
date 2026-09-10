/**
 * Slug ASCII estricto. Los nombres de archivo son un cuarto canal gratis: en los clientes
 * de chat el nombre llega al modelo como texto. Y `canesú` en un ZIP se rompe en Windows.
 */
export function slugify(input: string, fallback = 'sin-nombre'): string {
  const ascii = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
