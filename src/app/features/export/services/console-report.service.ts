import { Service } from '@angular/core';
import { VIEW_SHORT } from '../../../core/models/project.model';
import { AnnotationJson } from './bundle.model';
import { PromptImageBlock, PromptPayload } from './prompt-payload.model';

const STYLE = {
  title:
    'font: 700 15px/1.5 system-ui; color:#111; background:#ffe8ee; padding:6px 12px; border-radius:6px',
  section:
    'font: 700 12px/1.6 system-ui; color:#fff; background:#1a1a1a; padding:3px 10px; border-radius:4px',
  sub: 'font: 600 11px/1.6 system-ui; color:#6b665e',
  strong: 'font: 600 12px/1.6 system-ui; color:#111',
  note: 'font: 400 12px/1.6 system-ui; color:#c1121f',
  tree: 'font: 400 12px/1.5 ui-monospace, Menlo, monospace; color:#333',
  md: 'font: 400 11px/1.55 ui-monospace, Menlo, monospace; color:#222',
} as const;

function plural(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

/** Diez minutos: tiempo de sobra para mirar la consola sin fugar memoria para siempre. */
const PREVIEW_TTL_MS = 10 * 60 * 1000;

/**
 * Vuelca en la consola el paquete completo y —lo que de verdad importa— **cómo lo va a
 * leer la IA**: los tres canales por separado y la traza de unión marca por marca.
 *
 * Es la herramienta de diagnóstico del producto: si algo va a salir ambiguo, se ve aquí
 * antes de gastar tokens.
 */
@Service()
export class ConsoleReportService {
  async print(payload: PromptPayload): Promise<void> {
    const images = payload.blocks.filter((b): b is PromptImageBlock => b.kind === 'image');
    const composites = images.filter((b) => !b.filename.startsWith('recortes/'));
    const crops = images.filter((b) => b.filename.startsWith('recortes/'));
    const bundle = payload.annotations;

    console.log(`%c Anotador de Prenda · así va a leer la IA este encargo `, STYLE.title);
    console.log(
      `%cbundle ${bundle.bundleId} · ${bundle.garment.type}${bundle.garment.reference ? ` ${bundle.garment.reference}` : ''} · ` +
        `${plural(bundle.annotationCount, 'marca')} · ${plural(composites.length, 'compuesta')} · ` +
        `${plural(crops.length, 'recorte')} · ` +
        `≈ ${payload.estimatedInputTokens.toLocaleString('es-ES')} tokens de entrada`,
      STYLE.sub,
    );

    if (payload.warnings.length > 0) {
      console.group('%c⚠️  Avisos', STYLE.section);
      for (const w of payload.warnings) console.log(`%c${w}`, STYLE.note);
      console.groupEnd();
    }

    this.printTree(payload, composites, crops);
    // Se espera: las vistas previas son asíncronas y sin `await` acabarían fuera de su
    // grupo, al final de todo el volcado.
    await this.printPixels(composites, crops);
    this.printData(bundle.annotations);
    this.printPrompt(payload.system);
    this.printTrace(bundle.annotations, payload);

    console.group('%c5 · Objeto crudo (desplegable)', STYLE.section);
    console.log('annotations.json →', bundle);
    console.log('payload →', payload);
    console.groupEnd();
  }

  private printTree(
    payload: PromptPayload,
    composites: readonly PromptImageBlock[],
    crops: readonly PromptImageBlock[],
  ): void {
    const lines = [
      `${payload.folderName}/`,
      '├─ prompt.md',
      '├─ annotations.json',
      ...composites.map((c) => `├─ ${c.filename}`),
      '└─ recortes/',
      ...crops.map(
        (c, i) =>
          `   ${i === crops.length - 1 ? '└─' : '├─'} ${c.filename.replace('recortes/', '')}`,
      ),
    ];
    console.groupCollapsed('%c📁 Cómo queda el paquete', STYLE.section);
    console.log(`%c${lines.join('\n')}`, STYLE.tree);
    console.groupEnd();
  }

  private async printPixels(
    composites: readonly PromptImageBlock[],
    crops: readonly PromptImageBlock[],
  ): Promise<void> {
    console.group('%c1 · LO QUE LA IA VE  (píxeles — el canal fuerte)', STYLE.section);
    console.log(
      '%cEl número está QUEMADO en la foto: el modelo no estima coordenadas, hace OCR de un dígito.\n' +
        'La mirilla marca el punto exacto; el globo va desplazado para no taparlo.',
      STYLE.sub,
    );
    for (const c of composites) {
      console.log(`%c${c.filename} — ${c.caption}`, STYLE.strong);
      await this.preview(c.blob, 460);
    }
    console.groupCollapsed(
      `%cRecortes (${crops.length}) — el mismo marcador a resolución nativa`,
      STYLE.sub,
    );
    for (const c of crops) {
      console.log(`%c${c.filename}`, STYLE.strong);
      await this.preview(c.blob, 260);
    }
    console.groupEnd();
    console.groupEnd();
  }

  private printData(annotations: readonly AnnotationJson[]): void {
    console.group('%c2 · LO QUE LA IA LEE  (palabras y números)', STYLE.section);
    console.log(
      '%cLos otros dos canales. Fallan de forma independiente del primero: una anotación solo\n' +
        'queda ambigua si fallan los tres a la vez.',
      STYLE.sub,
    );
    console.table(
      annotations.map((a) => ({
        nº: a.number,
        vista: VIEW_SHORT[a.view],
        tipo: a.type,
        pieza: a.garmentPart.label,
        'dónde (imagen)': `${a.spatialDescriptor.verticalThird} / ${a.spatialDescriptor.horizontalBand}`,
        'lado del portador': a.spatialDescriptor.wearerSide,
        'punto (px)': `${a.anchorPoint.absolutePx.x}, ${a.anchorPoint.absolutePx.y}`,
        recorte: a.cropFile?.replace('recortes/', '') ?? '—',
        nota: a.note || '⚠️ sin indicación',
      })),
    );
    console.groupEnd();
  }

  private printPrompt(system: string): void {
    console.groupCollapsed('%c3 · CÓMO SE LE PIDE QUE LO INTERPRETE  (prompt.md)', STYLE.section);
    console.log(
      '%cLo importante es la sección 4: obliga a inventariar los números ANTES de razonar, y a\n' +
        'declarar DISCREPANCIA si los píxeles no cuadran con las palabras. Un fallo silencioso\n' +
        'se convierte en un fallo declarado.',
      STYLE.sub,
    );
    console.log(`%c${system}`, STYLE.md);
    console.groupEnd();
  }

  private printTrace(annotations: readonly AnnotationJson[], payload: PromptPayload): void {
    console.group('%c4 · TRAZA DE LECTURA, MARCA POR MARCA', STYLE.section);
    console.log('%cEste es el razonamiento que el material fuerza para cada número.', STYLE.sub);

    for (const a of annotations) {
      const view = payload.annotations.views.find((v) => v.view === a.view);
      const shape = {
        pin: 'el centro de la mirilla',
        arrow: 'la PUNTA de la flecha',
        rect: 'toda la zona del rectángulo',
        polygon: 'la región encerrada por el contorno',
      }[a.type];
      const side =
        a.spatialDescriptor.wearerSide === 'centro'
          ? 'centro'
          : a.spatialDescriptor.wearerSide === 'izquierda'
            ? 'IZQUIERDO'
            : 'DERECHO';

      console.groupCollapsed(
        `%c#${a.number}  ${a.garmentPart.label}  ·  ${VIEW_SHORT[a.view]}${a.note ? '' : '  ⚠️ sin indicación'}`,
        a.note ? STYLE.strong : STYLE.note,
      );
      console.log(`%c1. Busca el globo «${a.number}» en ${view?.compositeFile ?? '—'}`, STYLE.md);
      console.log(
        `%c2. Sigue la guía hasta su mirilla → el objeto de la nota es ${shape}`,
        STYLE.md,
      );
      console.log(
        `%c3. Abre ${a.cropFile ?? '(sin recorte)'} para el detalle a resolución nativa` +
          (a.cropZoom ? ` (zoom ${a.cropZoom}×)` : ''),
        STYLE.md,
      );
      console.log(
        `%c4. Contrasta con las palabras: «${a.garmentPart.label}», ${a.spatialDescriptor.text}`,
        STYLE.md,
      );
      console.log(
        `%c5. Al responder, usa el lado del PORTADOR: ${side}` +
          (side !== 'centro'
            ? ` (en la imagen se ve a la ${a.spatialDescriptor.horizontalBand})`
            : ''),
        STYLE.md,
      );
      console.log(`%c6. Aplica la indicación: «${a.note || '—'}»`, STYLE.strong);
      console.groupEnd();
    }
    console.groupEnd();
  }

  /** Vista previa de la imagen en la propia consola (Chromium y derivados). */
  private async preview(blob: Blob, maxWidth: number): Promise<void> {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxWidth / bitmap.width);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      bitmap.close();
      const url = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(url), PREVIEW_TTL_MS);
      console.log(
        '%c ',
        `font-size:1px; padding:${Math.floor(h / 2)}px ${Math.floor(w / 2)}px;` +
          `background:url(${url}) no-repeat; background-size:${w}px ${h}px;`,
      );
      console.log(`%c   ↳ ábrela a tamaño real: ${url}`, STYLE.sub);
    } catch {
      console.log('%c   (esta consola no admite vistas previas de imagen)', STYLE.sub);
    }
  }
}
