import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import {
  AnnotationReviewPort,
  ExportOnlyReviewAdapter,
} from './features/export/services/annotation-review.port';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Los parámetros de ruta llegan como `input()` a las páginas.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    // La costura del BFF: el día que exista un backend que llame a la API de Claude, se
    // cambia esta línea por `BffReviewAdapter` y aparece el botón "Analizar con IA".
    // Ningún componente sabe si hay backend: solo consultan `AnnotationReviewPort.kind`.
    { provide: AnnotationReviewPort, useClass: ExportOnlyReviewAdapter },
  ],
};
