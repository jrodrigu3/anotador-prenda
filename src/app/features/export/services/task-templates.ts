export type TaskTemplateId = 'ficha_taller' | 'critica_diseno' | 'lista_cambios' | 'libre';

export interface TaskTemplate {
  readonly id: TaskTemplateId;
  readonly label: string;
  readonly description: string;
  readonly text: string;
}

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  {
    id: 'ficha_taller',
    label: 'Ficha de taller',
    description: 'Convierte cada indicación en instrucción técnica de confección.',
    text:
      'Convierte estas indicaciones en una **ficha de taller**: para cada anotación, qué hay que ' +
      'cambiar, cómo se ejecuta técnicamente, qué implica de patrón y de costura, y qué riesgo o ' +
      'consideración de producción tiene.',
  },
  {
    id: 'critica_diseno',
    label: 'Crítica de diseño',
    description: 'Valora cada cambio desde proporción, caída y coherencia de la prenda.',
    text:
      'Actúa como director de diseño. Para cada anotación, valora el cambio propuesto en términos ' +
      'de proporción, caída, coherencia con el resto de la prenda y adecuación al tipo de tejido ' +
      'que se aprecia. Señala conflictos entre anotaciones si los hay.',
  },
  {
    id: 'lista_cambios',
    label: 'Lista de cambios',
    description: 'Resume en una lista accionable y priorizada.',
    text:
      'Resume las anotaciones en una lista de cambios accionable, ordenada por impacto en el ' +
      'patrón (primero lo que obliga a rehacer piezas, después lo que solo afecta al acabado). ' +
      'Una línea por cambio, sin florituras.',
  },
  {
    id: 'libre',
    label: 'Instrucción libre',
    description: 'Escribe tú la tarea.',
    text: '',
  },
];

export function templateById(id: TaskTemplateId): TaskTemplate {
  return TASK_TEMPLATES.find((t) => t.id === id) ?? TASK_TEMPLATES[0];
}
