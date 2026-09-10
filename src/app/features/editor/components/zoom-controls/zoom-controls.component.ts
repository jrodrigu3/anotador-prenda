import { Component, inject } from '@angular/core';
import { ViewportService } from '../../services/viewport.service';

@Component({
  selector: 'app-zoom-controls',
  templateUrl: './zoom-controls.component.html',
  styleUrl: './zoom-controls.component.scss',
})
export class ZoomControlsComponent {
  readonly viewport = inject(ViewportService);

  zoomIn(): void {
    this.viewport.zoomCenter(1.25);
  }

  zoomOut(): void {
    this.viewport.zoomCenter(1 / 1.25);
  }

  fit(): void {
    this.viewport.fit();
  }
}
