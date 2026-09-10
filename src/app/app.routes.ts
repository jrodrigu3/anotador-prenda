import { Routes } from '@angular/router';

/** Todo perezoso a nivel de página: el editor y el exportador no se cargan hasta usarse. */
export const routes: Routes = [
  {
    path: '',
    title: 'Anotador de Prenda',
    loadComponent: () =>
      import('./features/projects/pages/project-list-page/project-list-page.component').then(
        (m) => m.ProjectListPageComponent,
      ),
  },
  {
    path: 'proyecto/:projectId',
    title: 'Editor · Anotador de Prenda',
    loadComponent: () =>
      import('./features/editor/pages/editor-page/editor-page.component').then(
        (m) => m.EditorPageComponent,
      ),
  },
  {
    path: 'proyecto/:projectId/exportar',
    title: 'Material para la IA · Anotador de Prenda',
    loadComponent: () =>
      import('./features/export/pages/export-page/export-page.component').then(
        (m) => m.ExportPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
