import { inject, Service } from '@angular/core';
import { ImageRef, Project } from '../../../core/models/project.model';
import { ImageRepository } from '../../../core/repositories/image.repository';
import { blobToBytes, buildZip, Bytes, textToBytes, ZipEntry } from '../../../core/util/zip.util';
import { PromptPayload } from './prompt-payload.model';

@Service()
export class ZipBundleExporter {
  private readonly images = inject(ImageRepository);

  /** Los archivos del bundle, en el orden en que aparecen en el ZIP. */
  async files(
    payload: PromptPayload,
    project: Project,
    includeOriginals: boolean,
  ): Promise<readonly ZipEntry[]> {
    const entries: ZipEntry[] = [
      { path: 'prompt.md', data: textToBytes(payload.system) },
      {
        path: 'annotations.json',
        data: textToBytes(JSON.stringify(payload.annotations, null, 2)),
      },
    ];

    for (const block of payload.blocks) {
      if (block.kind === 'image') {
        entries.push({ path: block.filename, data: await blobToBytes(block.blob) });
      }
    }

    if (includeOriginals) {
      for (const view of project.views) {
        if (!view.image) continue;
        const bytes = await this.originalBytes(view.image);
        if (!bytes) continue;
        const ext = view.image.mimeType === 'image/png' ? 'png' : 'jpg';
        entries.push({ path: `originales/${view.id}.${ext}`, data: bytes });
      }
    }

    return entries;
  }

  async toZip(payload: PromptPayload, project: Project, includeOriginals: boolean): Promise<Blob> {
    return buildZip(await this.files(payload, project, includeOriginals));
  }

  private async originalBytes(ref: ImageRef): Promise<Bytes | null> {
    const record = await this.images.get(ref.imageId);
    return record ? blobToBytes(record.blob) : null;
  }
}
