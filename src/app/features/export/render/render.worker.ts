/// <reference lib="webworker" />
import { renderComposite } from './composite.renderer';
import { makeOverview, renderCrop } from './crop.renderer';
import { RenderedCrop, RenderRequest, RenderResult } from './render.types';

/**
 * Todo el rasterizado ocurre aquí, fuera del hilo principal: no bloquea la UI y no compite
 * por su memoria.
 *
 * Los recortes se generan SECUENCIALMENTE, nunca con `Promise.all`. Veinte lienzos de
 * 1280 px vivos a la vez son ~130 MB de backing store y Safari los mata.
 */
addEventListener('message', async (event: MessageEvent<RenderRequest>) => {
  const req = event.data;
  try {
    const source = await createImageBitmap(req.imageBlob);

    const composite = await renderComposite(source, req.natural, req.annotations, {
      viewShort: req.viewShort,
      bundleId: req.bundleId,
      dateLabel: req.dateLabel,
      legendBand: req.legendBand,
    });

    const crops: RenderedCrop[] = [];
    if (req.withCrops && req.annotations.length > 0) {
      const overview = await makeOverview(source, req.natural);
      for (const a of req.annotations) {
        crops.push(await renderCrop(source, req.natural, a, overview, req.viewShort));
      }
      overview.close();
    }
    source.close();

    const result: RenderResult = {
      view: req.view,
      composite: composite.blob,
      compositeSize: composite.size,
      compositeCanvasSize: composite.canvasSize,
      compositeScale: composite.scale,
      badgeCenters: composite.badgeCenters,
      crops,
      warnings: composite.warnings,
    };
    postMessage({ ok: true, result });
  } catch (error) {
    postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
