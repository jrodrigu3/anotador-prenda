import { AnnotationJson, AnnotationsBundleJson } from './bundle.model';

/**
 * Cómo se organiza el encargo para la IA.
 *
 * - `por_marca`: una sección por marcador, en orden numérico. Es la más fiel al anclaje
 *   visual y la única segura cuando las piezas no están etiquetadas.
 * - `por_pieza`: despiece — las marcas se agrupan por componente de la prenda (cuello,
 *   manga, puño…). Es como lo ejecuta el taller, y obliga al modelo a resolver JUNTAS las
 *   indicaciones que caen sobre la misma pieza, que es donde aparecen las contradicciones.
 */
export type PromptStructure = 'por_marca' | 'por_pieza';

export interface PromptContext {
  readonly bundle: AnnotationsBundleJson;
  readonly taskText: string;
  readonly cropCount: number;
  readonly structure: PromptStructure;
}

const SIN_PIEZA = 'Sin pieza asignada';

/**
 * El `prompt.md` que viaja en el bundle.
 *
 * Dos decisiones de economía que valen la mitad del texto:
 *
 * 1. **No se incrusta `annotations.json`.** El JSON repetía cada dato tres o cuatro veces
 *    (`geometry.point`, `anchorPoint.normalized`, `anchorPoint.absolutePx`… el mismo punto),
 *    y sus bloques `readme`/`coordinateSystem`/`markerLegend` duplicaban literalmente estas
 *    secciones. Aquí va una TABLA: una fila por marca, con lo único que el modelo necesita
 *    para responder. El JSON completo sigue en el paquete para quien lo consuma con código.
 * 2. **El descriptor espacial se comprime a una celda.** Su versión en prosa repetía por
 *    anotación la misma cantinela ("Celda X de una rejilla 5×5, medidos desde la esquina
 *    superior izquierda"), que con veinte marcas son cientos de tokens diciendo nada.
 *
 * Lo que NO se recorta es el procedimiento obligatorio: la pasada de inventario fuerza al
 * modelo a hacer OCR de todas las insignias ANTES de razonar, y el contraste
 * píxeles-contra-palabras convierte un fallo silencioso en un fallo declarado. Eso es lo que
 * produce buenas respuestas; el resto era relleno.
 */
export function buildPromptMarkdown(ctx: PromptContext): string {
  const b = ctx.bundle;
  const ref = b.garment.reference ? ` ${b.garment.reference}` : '';
  const composites = b.views.map((v) => `\`${v.compositeFile}\``).join(', ');
  const numbers = b.annotations.map((a) => a.number);
  const notes = b.garment.notes.trim();
  const porPieza = ctx.structure === 'por_pieza';

  // `null` = línea que no aplica y se descarta; `''` = línea en blanco deliberada. Filtrar
  // por cadena vacía se llevaba por delante los separadores y dejaba el encabezado pegado a
  // la tabla, que en Markdown estricto ni siquiera la cierra.
  const lines: readonly (string | null)[] = [
    `# Encargo de modificaciones — ${b.garment.type}${ref}`,
    `<!-- Anotador de Prenda v${b.generator.version} · bundle ${b.bundleId} · ${b.createdAt.slice(0, 10)} -->`,
    '',
    'Eres patronista y técnico de confección. Un diseñador ha marcado puntos concretos sobre las',
    'fotos de una prenda. Tu trabajo es interpretar cada marca **sin equivocarte de punto** y',
    'convertirla en instrucción ejecutable.',
    '',
    '## Material',
    '',
    `- ${composites} — las fotos con los **marcadores numerados quemados encima**.`,
    ctx.cropCount > 0
      ? `- \`recortes/NN_*.jpg\` (${ctx.cropCount}) — un primer plano por marca, a resolución nativa, con` +
        '\n  el mismo marcador dentro, un mini-mapa arriba a la derecha que sitúa el recorte en la prenda,' +
        '\n  y un pie `#N · pieza · vista · zoom`.'
      : null,
    porPieza
      ? '- El **despiece** de más abajo: las marcas agrupadas por pieza de la prenda.'
      : '- La **tabla** de más abajo: una fila por marca.',
    '- `annotations.json` (en el paquete) — lo mismo con coordenadas exactas. Úsalo solo si las necesitas.',
    '',
    '## Cómo leer un marcador',
    '',
    '- **Mirilla** (círculo abierto con una cruz de brazos separados del centro): su centro **es** el',
    '  punto del que habla la nota. Está abierta a propósito para que veas el detalle que hay debajo.',
    '- **Globo** (óvalo blanco con el número): está **desplazado a propósito y no señala nada**. Nunca',
    '  interpretes lo que hay debajo del globo.',
    '- **Línea guía**: une cada globo con su mirilla.',
    '- Por tipo: `pin` = ese punto · `arrow` = **la punta** (la cola solo indica desde dónde se mira) ·',
    '  `rect` = toda la zona encerrada · `polygon` = la región del contorno.',
    '',
    '**El número es la clave de unión:** marcador `N` en la imagen = recorte `NN_…` = fila `N` de aquí.',
    '',
    '**Izquierda y derecha:** se dan las dos lecturas. En tu respuesta usa **siempre** el lado de quien',
    'viste la prenda, y dilo explícitamente.',
    '',
    porPieza ? byPart(b.annotations) : byMark(b.annotations),
    '',
    '## Antes de responder (obligatorio)',
    '',
    '1. **Inventario.** Lee los globos de las compuestas y enumera los números que distingues. Deben',
    `   ser exactamente: **${numbers.join(', ')}** (${b.annotationCount}). Si falta alguno, si alguno`,
    '   está ilegible o si dos se solapan, dilo en la primera línea y sigue con los demás.',
    ctx.cropCount > 0
      ? '2. **Anclaje.** Para cada marca, mira **primero su recorte** y luego la compuesta para situarla,\n   y di qué parte física señala la mirilla.'
      : '2. **Anclaje.** Para cada marca, di qué parte física señala la mirilla en la compuesta.',
    '3. **Contraste.** Compáralo con las columnas «pieza» y «zona». Si no cuadran, marca',
    '   **DISCREPANCIA**, di cuál de las dos crees correcta y por qué. Nunca lo resuelvas en silencio.',
    '',
    'Reglas duras:',
    '',
    '- No inventes marcas que no estén en la tabla, ni fusiones dos porque estén cerca.',
    '- **No inventes medidas, tolerancias, hilaturas ni referencias de material** que el diseñador no',
    '  haya dado. Si hacen falta para ejecutar, pídelas.',
    '- Si una indicación está ilegible, es texto de relleno o es demasiado vaga para ejecutarla, **no',
    '  la interpretes**: llévala a «Dudas».',
    '- No repitas este material en tu respuesta.',
    '',
    '## Tarea',
    '',
    ctx.taskText.trim() || 'Interpreta las anotaciones y explica cómo ejecutarlas.',
    notes ? `\n**Notas generales del diseñador:** ${notes}` : null,
    '',
    '## Formato de la respuesta',
    '',
    `Primera línea: \`Inventario: leídos X de ${b.annotationCount}\` y, si las hay, las anomalías.`,
    '',
    porPieza ? OUTPUT_BY_PART : OUTPUT_BY_MARK,
    '',
    'Cierra con **Dudas para el diseñador**: lista de lo que no puedas resolver sin preguntar. Si no',
    'hay ninguna, escribe «Ninguna».',
    '',
  ];

  return lines
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

const OUTPUT_BY_MARK = `Después, una sección por marca, en orden numérico:

\`\`\`
### #N — <pieza> · <vista> · lado <izquierdo/derecho> de quien la viste
**Pide:** «<texto literal del diseñador>»
**Veo:** <qué hay exactamente en la mirilla>
**Coherencia:** OK | DISCREPANCIA — <por qué>
**Ejecución:** <cómo se hace>
**Implica:** <patrón · costura · producción>
\`\`\``;

const OUTPUT_BY_PART = `Después, **una sección por pieza**, no por marca. Dentro de cada pieza resuelve JUNTAS todas sus
marcas: si dos se contradicen o se solapan, dilo ahí y propón cómo conciliarlas.

\`\`\`
## <PIEZA>  (marcas #N, #M)
**Estado actual:** <qué se ve hoy en esa pieza>
**Cambios pedidos:** <una línea por marca, citando «texto literal» y su #N>
**Coherencia:** OK | DISCREPANCIA — <por qué> | CONFLICTO entre #N y #M — <cuál>
**Ejecución:** <secuencia de operaciones sobre la pieza>
**Implica:** <patrón · costura · producción>
\`\`\``;

/** Tabla plana, una fila por marca. */
function byMark(annotations: readonly AnnotationJson[]): string {
  return [
    '## Marcas',
    '',
    '| # | vista | tipo | pieza | zona (imagen) | lado portador | recorte | indicación |',
    '|---|---|---|---|---|---|---|---|',
    ...annotations.map(
      (a) =>
        `| ${a.number} | ${a.view} | ${a.type} | ${partCell(a)} | ${zoneCell(a)} | ` +
        `${sideCell(a)} | ${cropCell(a)} | ${noteCell(a)} |`,
    ),
  ].join('\n');
}

/**
 * Despiece: las marcas agrupadas por componente de la prenda. Las que no tienen pieza van al
 * final, señaladas, para que el modelo las asigne él a partir de los píxeles en vez de
 * colarlas en un grupo equivocado.
 */
function byPart(annotations: readonly AnnotationJson[]): string {
  const groups = new Map<string, AnnotationJson[]>();
  for (const a of annotations) {
    const key = a.garmentPart.id === null ? SIN_PIEZA : a.garmentPart.label;
    const bucket = groups.get(key);
    if (bucket) bucket.push(a);
    else groups.set(key, [a]);
  }

  // Las piezas sin asignar, siempre las últimas.
  const ordered = [...groups.entries()].sort((x, y) =>
    x[0] === SIN_PIEZA ? 1 : y[0] === SIN_PIEZA ? -1 : 0,
  );

  const blocks = ordered.map(([part, list]) => {
    const marks = list.map((a) => `#${a.number}`).join(', ');
    const head =
      part === SIN_PIEZA
        ? `### ${SIN_PIEZA} (${marks})\n\nEl diseñador no las etiquetó: deduce tú la pieza a partir del recorte y **dilo**.\n`
        : `### ${capitalize(part)} (${marks})\n`;
    return [
      head,
      '| # | vista | tipo | zona (imagen) | lado portador | recorte | indicación |',
      '|---|---|---|---|---|---|---|',
      ...list.map(
        (a) =>
          `| ${a.number} | ${a.view} | ${a.type} | ${zoneCell(a)} | ${sideCell(a)} | ` +
          `${cropCell(a)} | ${noteCell(a)} |`,
      ),
    ].join('\n');
  });

  return [
    '## Despiece',
    '',
    'La prenda se descompone en las piezas que el diseñador ha tocado. Cada pieza lleva sus marcas.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

function partCell(a: AnnotationJson): string {
  return a.garmentPart.id === null ? '—' : escape(a.garmentPart.label);
}

/** El descriptor espacial, comprimido: tercio · franja · celda. */
function zoneCell(a: AnnotationJson): string {
  const s = a.spatialDescriptor;
  return `${s.verticalThird} · ${s.horizontalBand} · ${s.gridCell}`;
}

function sideCell(a: AnnotationJson): string {
  const side = a.spatialDescriptor.wearerSide;
  return side === 'centro' ? 'centro' : side === 'izquierda' ? 'izquierdo' : 'derecho';
}

function cropCell(a: AnnotationJson): string {
  return a.cropFile ? escape(a.cropFile.replace('recortes/', '')) : '—';
}

function noteCell(a: AnnotationJson): string {
  const note = a.note.trim();
  return note ? `«${escape(note)}»` : '⚠️ vacía';
}

/** Una celda de tabla no admite ni saltos de línea ni barras verticales sin escapar. */
function escape(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
