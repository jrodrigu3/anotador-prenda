# Anotador de Prenda

Arrastra las dos fotos de una prenda —**frontal** y **trasera**, las dos a la vez—, señala puntos
concretos y escribe una indicación para cada uno. La app genera un material que **una IA de visión puede leer sabiendo
exactamente a qué punto físico se refiere cada nota**.

Angular 22 · sin backend · todo se guarda en el navegador (IndexedDB).

## Requisitos

Angular 22 exige Node `^22.22.3 || ^24.15.0 || >=26`. El proyecto trae `.nvmrc`:

```bash
nvm use && npm install && npm start
```

## El problema que resuelve

Un modelo de visión **no es fiable leyendo coordenadas**: convertir `{"x":0.63,"y":0.19}` en
"la punta derecha del cuello" es justo la tarea de anclaje espacial en la que falla, y empeora
cuando hay varias instancias de la misma pieza (dos puños, dos bolsillos, dos puntas de cuello),
que es el caso normal en una camisa.

Sí es casi perfecto **leyendo un dígito grande dibujado sobre la foto**. Por eso la exportación
emite **tres canales redundantes que fallan de forma independiente**:

| Canal | Qué es | Qué resuelve |
|---|---|---|
| **Píxeles** | La foto con marcadores numerados **quemados encima** | "cuál de los dos bolsillos" |
| **Palabras** | Pieza de la prenda + descriptor espacial en prosa | una insignia ilegible sobre estampado |
| **Números** | Coordenadas normalizadas y absolutas | respaldo programático |

Una anotación solo queda ambigua si fallan los tres a la vez. Y como son contrastables entre sí,
el `prompt.md` exige a la IA una pasada de verificación previa: un fallo pasa de silencioso a
**declarado**.

### Las cinco decisiones de las que depende todo

1. **La compuesta se renderiza directamente a 1568 px** de lado largo, que es el tamaño al que los
   proveedores reescalan. Dibujar sobre 4000 px y confiar en que los marcadores sobrevivan a ese
   reescalado es el error que arruina la técnica — y no se ve en el editor.
2. **Mirilla abierta + insignia desplazada.** El punto exacto lleva un círculo abierto con cruz de
   brazos separados: el centro queda virgen y se ve el detalle. El número va en un globo desplazado
   ≥3 radios, unido por línea guía.
3. **Triple trazo** (negro ancho → blanco medio → acento fino): legible sobre tela clara, oscura o
   estampada.
4. **Un recorte por anotación**, cortado del original a resolución nativa, con mini-mapa localizador
   y franja de subtítulo. La compuesta es el mapa; el recorte, la lupa.
5. **Numeración global 1..N** entre las dos vistas, regenerada en cada exportación: nunca hay huecos
   ni números repetidos.

Y una trampa de dominio: en confección, "manga izquierda" es la del **portador**, no la de la
imagen. Cada anotación emite las dos lecturas (`horizontalBand` y `wearerSide`) y el prompt exige
que la respuesta use el criterio del portador y lo declare.

## El bundle

```
anotaciones_<referencia>_<bundleId>/
├─ prompt.md              contrato → inventario → verificación obligatoria → tarea → formato
├─ annotations.json       completo y autodescriptivo, para consumo programático
├─ frente_compuesta.jpg   1568 px, marcadores quemados
├─ espalda_compuesta.jpg
└─ recortes/01_frente_punta_de_cuello.jpg, 02_…
```

Se puede descargar como ZIP, copiar el prompt al portapapeles o copiar la compuesta como imagen.

### El prompt no incrusta el JSON

`prompt.md` lleva una **tabla**: una fila por marca con lo único que el modelo necesita para
responder (número, vista, tipo, pieza, zona, lado del portador, recorte e indicación literal).
Incrustar `annotations.json` era pagar tres o cuatro veces por el mismo dato —el punto aparece en
`geometry.point`, en `anchorPoint.normalized` y en `anchorPoint.absolutePx`— y sus bloques
`readme`/`coordinateSystem`/`markerLegend` duplicaban literalmente las secciones del prompt. El JSON
sigue completo en el ZIP para quien lo consuma con código.

Lo que **no** se recorta es el procedimiento obligatorio, que es lo que produce buenas respuestas:
inventariar los números legibles y cotejarlos con la lista exacta que se le da, decir qué señala
cada mirilla mirando primero el recorte, y contrastarlo con las columnas «pieza» y «zona»
declarando **DISCREPANCIA** si no cuadran. Más tres reglas duras: no inventar marcas, **no inventar
medidas ni materiales**, y mandar a «Dudas» toda indicación ilegible o de relleno en vez de
interpretarla.

### Qué hacer, como dato

Cada marca lleva una **acción estructurada** además de la nota libre: cambiar color, cambiar
medida, mover, cambiar forma o borde, cambiar costura, material, acabado, añadir, quitar. Según la
que elijas aparecen sus campos —el color pide muestra, nombre y **código de industria** (14-4112
TCX) y sobre qué se aplica (tejido, hilo, botón, ribete…); la medida pide operación, dimensión,
cantidad y unidad—. De ahí sale una **frase canónica** («Cambiar el color del tejido a Celeste 1 ·
14-4112 TCX (#7ec8e3)») que viaja a la IA y al taller sin margen de interpretación.

La nota libre no desaparece: viaja como **matiz** («solo este bolsillo, el otro se queda»). El
prompt le dice al modelo que la acción es la orden, el matiz la acota, y que si se contradicen lo
declare en vez de elegir en silencio. Una acción a medio rellenar se avisa en la tarjeta y antes de
exportar.

### Dónde cae la marca

La posición se mide contra el **contorno de la prenda**, no contra el encuadre de la foto. El
contorno se detecta al importar (fondo liso, que es como se fotografían los planos) y, si la
detección no es plausible, se cae a la foto entera **diciéndolo** en vez de acertar por casualidad.

Eso convierte «tercio medio · celda C2 de una rejilla 5×5» —que se desplaza en cuanto la prenda no
llena el encuadre, y que además no significa nada en un taller— en «pecho · entre el centro
delantero y el costado · 29 % alto / 30 % del eje». Y si declaras el **alto real de la prenda**, en
«≈ 20,9 cm del borde superior», que ya es una medida que alguien puede ejecutar.

### Dos organizaciones del encargo

| | Cuándo |
|---|---|
| **Por marca** | Una sección por marcador, en orden numérico. Lo más fiel al anclaje visual y lo único seguro si las piezas no están etiquetadas. |
| **Por pieza (despiece)** | Las marcas agrupadas por componente —cuello, manga, puño—. Es como lo ejecuta el taller, y obliga al modelo a resolver JUNTAS las indicaciones que caen sobre la misma pieza, que es donde salen las contradicciones. Las marcas sin etiquetar van a un grupo aparte para que las deduzca, en vez de colarlas en el grupo equivocado. |

La banda de leyenda de la compuesta viene **desactivada** por defecto: repetía número → pieza, que
ya va en la tabla, a cambio de un 14 % más de píxeles en cada imagen.

### «Ver en consola cómo lo leerá la IA»

El botón de la página de exportación vuelca en la consola del navegador el paquete entero y, sobre
todo, **el razonamiento que el material le fuerza al modelo**: el árbol de archivos, las imágenes
previsualizadas ahí mismo, una tabla con los tres canales por anotación, el `prompt.md` completo y
una traza paso a paso por cada número (busca el globo N → sigue la guía → abre el recorte →
contrasta con las palabras → responde con el lado del portador → aplica la indicación). Es la
herramienta de diagnóstico: si algo va a salir ambiguo, se ve ahí antes de gastar un solo token.

## Estructura

```
src/app/
├─ core/            modelos, IndexedDB, importación de imágenes, geometría, taxonomía de confección
├─ features/editor/ el lienzo SVG, la máquina de estados de puntero, el store y el deshacer
├─ features/export/ renderizado en worker, JSON, prompt, ZIP y el panel "Lo que ve la IA"
└─ features/projects/
```

Notas de arquitectura que conviene no deshacer:

- El editor es **un solo `<svg>` con la foto dentro** como `<image>`. Así `viewBox` +
  `getScreenCTM()` son la única fuente de verdad del mapeo imagen↔pantalla y desaparece la
  matemática del letterboxing de `object-fit: contain`.
- Tres espacios de coordenadas: normalizado (**solo** almacenamiento), contenido (píxeles naturales,
  **toda** la matemática) y cliente. El espacio normalizado es anisótropo: hacer trigonometría en él
  gira mal las puntas de flecha.
- La geometría en vuelo durante un arrastre vive **fuera** del store: una entrada de deshacer por
  arrastre, y ningún autoguardado en cada `pointermove`.

## Enchufar una IA de verdad

Hoy no hay backend. La costura ya está puesta: el ZIP y una llamada a la API son dos
serializaciones del mismo `PromptBlock[]`. En `app.config.ts`:

```ts
{ provide: AnnotationReviewPort, useClass: ExportOnlyReviewAdapter }  // hoy
{ provide: AnnotationReviewPort, useClass: BffReviewAdapter }         // mañana
```

La UI consulta `AnnotationReviewPort.kind` para decidir si muestra "Analizar con IA". Ningún
componente sabe si hay backend.

## Interfaz

Lenguaje de ficha técnica: fondo gris muy claro y el contenido en **tarjetas blancas** de esquinas
redondeadas, pestañas en píldora con contador (`Frente 2 · Espalda 0`) y un único acento azul para
lo activo y lo seleccionado. Los únicos otros colores son los de los marcadores, porque ahí sí
significan algo (tipo de anotación) y se queman en la imagen que lee la IA.

**Las anotaciones se editan en su propia tarjeta**, en la columna a la derecha de la imagen: número,
nota, pieza y situación. Antes había dos paneles —un editor para la marca seleccionada y una lista
aparte— repitiendo la misma información; una sola columna dice lo mismo con la mitad de interfaz.
Cada tarjeta lleva siempre visible la doble lectura del lado (`derecha en la imagen · lado izquierdo
de quien la viste`), que es el dato que evita coser la prenda espejada.

La subida sigue el mismo criterio: en el lienzo vacío solo hay una pastilla **＋ Añadir fotos**; al
pulsarla se despliega en `Frente · Espalda · Las dos`. Soltar archivos funciona sobre todo el
lienzo, esté desplegada o no.

Lo único que NO encoge son las zonas de impacto (mínimo táctil de WCAG 2.2) y los marcadores de la
imagen exportada, que se dimensionan contra el lienzo de 1568 px y son ajenos a la escala de la
interfaz.

## Comandos

```bash
npm start        # servidor de desarrollo
npm test         # vitest
npm run build    # producción
npm run format   # prettier
```

## Verificar que la IA acierta

Fotografía una camisa con **duplicados deliberados** y anótala con trampas: dos bolsillos idénticos
anotando solo uno; las dos puntas del cuello con notas distintas; un polígono que cubre media manga.
Después, en chats **nuevos**:

| Prueba | Entrada | Criterio |
|---|---|---|
| Legibilidad | solo las compuestas: «enumera los números que ves» | 8/8. **Llevarla al 100 %** |
| Solo píxeles | compuestas + recortes, sin JSON | acierta la pieza de cada mirilla |
| Solo palabras | solo el JSON | un patronista sabría situarla |
| Unión | bundle completo | cada nota en su parte; no fusiona marcas vecinas |
| Adversaria | cambia a mano un `garmentPart` del JSON | la IA **declara DISCREPANCIA** |
| Degradación | compuestas forzadas a 800 px | fija el margen del tamaño de insignia |

Las dos primeras y la de degradación se repiten en **cada cambio del renderizador**: son las que
detectan una regresión de legibilidad.
