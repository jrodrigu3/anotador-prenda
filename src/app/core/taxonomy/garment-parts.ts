/**
 * Taxonomía de confección. Es uno de los tres canales que hacen inequívoca una anotación
 * para la IA: los píxeles dicen *cuál*, las palabras dicen *cómo se llama*, los números
 * son el respaldo. Etiquetar la pieza cuesta un clic y salva el caso de "la insignia salió
 * ilegible sobre el estampado".
 */

export type GarmentPartId =
  | 'cuello'
  | 'pie_de_cuello'
  | 'punta_de_cuello'
  | 'canesu'
  | 'hombro'
  | 'costura_de_hombro'
  | 'sisa'
  | 'manga'
  | 'codo'
  | 'puno'
  | 'abertura_de_puno'
  | 'botonadura'
  | 'tapeta'
  | 'ojal'
  | 'boton'
  | 'bolsillo'
  | 'tapa_de_bolsillo'
  | 'pinza'
  | 'costado'
  | 'costura_lateral'
  | 'dobladillo'
  | 'faldon'
  | 'espalda'
  | 'delantero'
  | 'pliegue'
  | 'fuelle'
  | 'etiqueta'
  | 'presilla'
  | 'vista'
  | 'refuerzo'
  | 'costura'
  | 'pespunte'
  | 'abertura_lateral'
  | 'otro';

export interface GarmentPart {
  readonly id: GarmentPartId;
  readonly label: string;
  readonly group: string;
}

export const GARMENT_PARTS: readonly GarmentPart[] = [
  { id: 'cuello', label: 'cuello', group: 'Cuello' },
  { id: 'pie_de_cuello', label: 'pie de cuello', group: 'Cuello' },
  { id: 'punta_de_cuello', label: 'punta de cuello', group: 'Cuello' },
  { id: 'canesu', label: 'canesú', group: 'Torso' },
  { id: 'hombro', label: 'hombro', group: 'Torso' },
  { id: 'costura_de_hombro', label: 'costura de hombro', group: 'Torso' },
  { id: 'sisa', label: 'sisa', group: 'Manga' },
  { id: 'manga', label: 'manga', group: 'Manga' },
  { id: 'codo', label: 'codo', group: 'Manga' },
  { id: 'puno', label: 'puño', group: 'Manga' },
  { id: 'abertura_de_puno', label: 'abertura de puño', group: 'Manga' },
  { id: 'botonadura', label: 'botonadura', group: 'Cierre' },
  { id: 'tapeta', label: 'tapeta', group: 'Cierre' },
  { id: 'ojal', label: 'ojal', group: 'Cierre' },
  { id: 'boton', label: 'botón', group: 'Cierre' },
  { id: 'bolsillo', label: 'bolsillo', group: 'Detalles' },
  { id: 'tapa_de_bolsillo', label: 'tapa de bolsillo', group: 'Detalles' },
  { id: 'pinza', label: 'pinza', group: 'Torso' },
  { id: 'costado', label: 'costado', group: 'Torso' },
  { id: 'costura_lateral', label: 'costura lateral', group: 'Costuras' },
  { id: 'dobladillo', label: 'dobladillo', group: 'Bajos' },
  { id: 'faldon', label: 'faldón', group: 'Bajos' },
  { id: 'abertura_lateral', label: 'abertura lateral', group: 'Bajos' },
  { id: 'espalda', label: 'espalda', group: 'Torso' },
  { id: 'delantero', label: 'delantero', group: 'Torso' },
  { id: 'pliegue', label: 'pliegue', group: 'Detalles' },
  { id: 'fuelle', label: 'fuelle', group: 'Detalles' },
  { id: 'etiqueta', label: 'etiqueta', group: 'Detalles' },
  { id: 'presilla', label: 'presilla', group: 'Detalles' },
  { id: 'vista', label: 'vista (forro de borde)', group: 'Detalles' },
  { id: 'refuerzo', label: 'refuerzo', group: 'Detalles' },
  { id: 'costura', label: 'costura', group: 'Costuras' },
  { id: 'pespunte', label: 'pespunte', group: 'Costuras' },
  { id: 'otro', label: 'otro (especificar)', group: 'Otro' },
];

const BY_ID = new Map<GarmentPartId, GarmentPart>(GARMENT_PARTS.map((p) => [p.id, p]));

export function partLabel(id: GarmentPartId | null, freeText = ''): string {
  if (id === null) return 'sin especificar';
  if (id === 'otro') return freeText.trim() || 'otro';
  return BY_ID.get(id)?.label ?? String(id);
}

/** Grupos en orden de aparición, para el `<optgroup>` del selector. */
export function partGroups(): readonly { group: string; parts: readonly GarmentPart[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, GarmentPart[]>();
  for (const p of GARMENT_PARTS) {
    if (!buckets.has(p.group)) {
      buckets.set(p.group, []);
      order.push(p.group);
    }
    buckets.get(p.group)!.push(p);
  }
  return order.map((group) => ({ group, parts: buckets.get(group)! }));
}
