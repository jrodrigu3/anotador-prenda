import { inject, Service } from '@angular/core';
import { Annotation } from '../../../core/models/annotation.model';
import { Geometry, NormPoint, Size } from '../../../core/models/geometry.model';
import {
  globalNumbers,
  ImageRef,
  Project,
  VIEW_LABELS,
  VIEW_SHORT,
} from '../../../core/models/project.model';
import { ImageRepository } from '../../../core/repositories/image.repository';
import { partLabel } from '../../../core/taxonomy/garment-parts';
import { deriveSpatial } from '../../../core/taxonomy/spatial-descriptor';
import { intentSummary } from '../../../core/models/intent.model';
import { anchorOf } from '../../../core/util/geometry.util';
import { pad2, slugify } from '../../../core/util/slug.util';
import { RenderAnnotation, RenderedCrop, RenderResult } from '../render/render.types';
import {
  AnnotationJson,
  AnnotationsBundleJson,
  BUNDLE_FORMAT_VERSION,
  BUNDLE_README,
  COORDINATE_SYSTEM,
  GeometryJson,
  MARKER_LEGEND,
  Px,
  ViewJson,
} from './bundle.model';
import { buildPromptMarkdown, PromptStructure } from './prompt-text';
import { PromptBlock, PromptPayload } from './prompt-payload.model';
import { RenderService } from './render.service';

export const GENERATOR = { name: 'Anotador de Prenda', version: '1.0.0' } as const;

export interface BuildOptions {
  readonly bundleId: string;
  readonly taskText: string;
  readonly includeCrops: boolean;
  readonly legendBand: boolean;
  readonly onlyWithNote: boolean;
  readonly structure: PromptStructure;
  readonly onProgress?: (message: string) => void;
}

@Service()
export class PromptPayloadBuilder {
  private readonly images = inject(ImageRepository);
  private readonly renderer = inject(RenderService);

  /**
   * Construye el bundle completo: compuestas, recortes, JSON y prompt.
   *
   * La numeración se REGENERA aquí, 1..N global sobre [frente, espalda]. Nunca se persiste:
   * así borrar una marca no deja huecos ni repetidos, y cada número es una clave única en
   * todo el material que ve el modelo.
   */
  async build(project: Project, opts: BuildOptions): Promise<PromptPayload> {
    const numbers = globalNumbers(project);
    const createdAt = new Date();
    const dateLabel = createdAt.toISOString().slice(0, 10);

    const views: ViewJson[] = [];
    const annotationsJson: AnnotationJson[] = [];
    const blocks: PromptBlock[] = [];
    const warnings: string[] = [];
    let estimatedInputTokens = 0;

    for (const view of project.views) {
      if (!view.image) {
        if (view.annotations.length > 0) {
          warnings.push(`La ${VIEW_LABELS[view.id].toLowerCase()} tiene marcas pero no imagen.`);
        }
        continue;
      }

      const usable = view.annotations
        .filter((a) => !opts.onlyWithNote || a.note.trim().length > 0)
        .sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));

      const natural: Size = {
        w: view.image.naturalWidth,
        h: view.image.naturalHeight,
      };
      const renderAnnotations: RenderAnnotation[] = usable.map((a) => ({
        id: a.id,
        number: numbers.get(a.id) ?? 0,
        geometry: geometryOf(a),
        partLabel: partLabel(a.part, a.partFreeText),
        note: a.note,
      }));

      opts.onProgress?.(`Renderizando ${VIEW_LABELS[view.id].toLowerCase()}…`);
      const blob = await this.imageBlob(view.image);
      const result: RenderResult = await this.renderer.render({
        view: view.id,
        viewShort: VIEW_SHORT[view.id],
        bundleId: opts.bundleId,
        dateLabel,
        imageBlob: blob,
        natural,
        annotations: renderAnnotations,
        legendBand: opts.legendBand,
        withCrops: opts.includeCrops,
      });
      warnings.push(...result.warnings);

      const compositeFile = `${view.id}_compuesta.jpg`;
      views.push({
        view: view.id,
        label: VIEW_LABELS[view.id],
        sourceImage: {
          file: `originales/${view.id}.${view.image.mimeType === 'image/png' ? 'png' : 'jpg'}`,
          naturalWidth: natural.w,
          naturalHeight: natural.h,
        },
        compositeFile,
        compositeSize: { width: result.compositeSize.w, height: result.compositeSize.h },
        compositeCanvasSize: {
          width: result.compositeCanvasSize.w,
          height: result.compositeCanvasSize.h,
        },
        compositeScale: round(result.compositeScale, 5),
        garmentBox: view.image.garmentBox,
        annotationNumbers: renderAnnotations.map((a) => a.number),
      });

      blocks.push({
        kind: 'text',
        text: `Imagen — Vista ${VIEW_SHORT[view.id]}, compuesta con los marcadores numerados:`,
      });
      blocks.push({
        kind: 'image',
        mediaType: 'image/jpeg',
        blob: result.composite,
        filename: compositeFile,
        caption: `Vista ${VIEW_SHORT[view.id]} con marcadores`,
      });
      estimatedInputTokens += tokenCost(result.compositeCanvasSize);

      const cropById = new Map<string, RenderedCrop>(result.crops.map((c) => [c.id, c]));
      const badgeById = new Map(result.badgeCenters.map((b) => [b.id, b]));

      for (const a of usable) {
        const number = numbers.get(a.id) ?? 0;
        const geometry = geometryOf(a);
        const anchor = anchorOf(geometry);
        const crop = cropById.get(a.id) ?? null;
        const badge = badgeById.get(a.id);
        const label = partLabel(a.part, a.partFreeText);
        const cropFile = crop
          ? `recortes/${pad2(number)}_${view.id}_${slugify(label, 'marca')}.jpg`
          : null;

        annotationsJson.push({
          id: a.id,
          number,
          view: view.id,
          type: a.kind,
          geometry: geometryJson(geometry, natural),
          anchorPoint: { normalized: round2(anchor), absolutePx: px(anchor, natural) },
          badgeCenter: {
            normalized: badge ? round2(badge.normalized) : round2(anchor),
            absolutePx: badge ? badge.absolutePx : px(anchor, natural),
          },
          garmentPart: {
            id: a.part,
            label,
            ...(a.part === 'otro' ? { freeText: a.partFreeText } : {}),
          },
          spatialDescriptor: deriveSpatial(anchor, view.id, {
            garmentBox: view.image.garmentBox,
            heightCm: project.garmentHeightCm,
          }),
          action: intentSummary(a.intent),
          intent: a.intent,
          note: a.note,
          cropFile,
          cropRegionPx: crop ? crop.box : null,
          cropZoom: crop ? round(crop.zoom, 2) : null,
        });

        if (crop && cropFile) {
          blocks.push({
            kind: 'text',
            text: `Imagen — Recorte del marcador ${number} (${label}, ${VIEW_SHORT[view.id]}):`,
          });
          blocks.push({
            kind: 'image',
            mediaType: 'image/jpeg',
            blob: crop.blob,
            filename: cropFile,
            caption: `Recorte del marcador ${number} — ${label}`,
          });
          estimatedInputTokens += tokenCost({ w: crop.outSize, h: crop.outSize * 1.085 });
        }
      }
    }

    annotationsJson.sort((a, b) => a.number - b.number);

    const bundle: AnnotationsBundleJson = {
      formatVersion: BUNDLE_FORMAT_VERSION,
      bundleId: opts.bundleId,
      createdAt: createdAt.toISOString(),
      generator: GENERATOR,
      language: 'es',
      garment: {
        type: project.garmentType || 'prenda',
        reference: project.reference,
        notes: project.generalNotes,
        heightCm: project.garmentHeightCm,
      },
      readme: BUNDLE_README,
      coordinateSystem: COORDINATE_SYSTEM,
      markerLegend: MARKER_LEGEND,
      views,
      annotations: annotationsJson,
      annotationCount: annotationsJson.length,
    };

    const cropCount = annotationsJson.filter((a) => a.cropFile).length;
    const system = buildPromptMarkdown({
      bundle,
      taskText: opts.taskText,
      cropCount,
      structure: opts.structure,
    });

    // El JSON completo NO viaja en la conversación: el prompt lleva una tabla con lo único
    // que el modelo necesita, y el JSON repetía cada dato tres o cuatro veces. Sigue en el
    // ZIP para quien lo consuma con código.
    estimatedInputTokens += Math.ceil(system.length / 3.5);

    if (annotationsJson.length === 0) {
      warnings.push('No hay ninguna anotación exportable. Añade marcas con su indicación.');
    }

    const folderName = `anotaciones_${slugify(project.reference || project.name, 'prenda')}_${opts.bundleId}`;

    return {
      bundleId: opts.bundleId,
      folderName,
      system,
      blocks,
      annotations: bundle,
      warnings,
      estimatedInputTokens,
    };
  }

  private async imageBlob(ref: ImageRef): Promise<Blob> {
    const record = await this.images.get(ref.imageId);
    if (!record) throw new Error('No se encontró el bitmap de una de las vistas.');
    return record.blob;
  }
}

function geometryOf(a: Annotation): Geometry {
  switch (a.kind) {
    case 'pin':
      return { kind: 'pin', point: a.point };
    case 'arrow':
      return { kind: 'arrow', tail: a.tail, head: a.head };
    case 'rect':
      return { kind: 'rect', x: a.x, y: a.y, w: a.w, h: a.h };
    case 'polygon':
      return { kind: 'polygon', points: a.points };
  }
}

function geometryJson(g: Geometry, n: Size): GeometryJson {
  switch (g.kind) {
    case 'pin':
      return { type: 'pin', point: round2(g.point), pointPx: px(g.point, n) };
    case 'arrow':
      return {
        type: 'arrow',
        from: round2(g.tail),
        to: round2(g.head),
        fromPx: px(g.tail, n),
        toPx: px(g.head, n),
      };
    case 'rect':
      return {
        type: 'rect',
        rect: { x: round(g.x, 4), y: round(g.y, 4), w: round(g.w, 4), h: round(g.h, 4) },
        rectPx: {
          x: Math.round(g.x * n.w),
          y: Math.round(g.y * n.h),
          w: Math.round(g.w * n.w),
          h: Math.round(g.h * n.h),
        },
      };
    case 'polygon':
      return {
        type: 'polygon',
        points: g.points.map(round2),
        pointsPx: g.points.map((p) => px(p, n)),
      };
  }
}

function px(p: NormPoint, n: Size): Px {
  return { x: Math.round(p.x * n.w), y: Math.round(p.y * n.h) };
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function round2(p: NormPoint): NormPoint {
  return { x: round(p.x, 4), y: round(p.y, 4) };
}

/** Los modelos de visión facturan aproximadamente ancho*alto/750 tokens por imagen. */
function tokenCost(size: Size): number {
  return Math.ceil((size.w * size.h) / 750);
}
