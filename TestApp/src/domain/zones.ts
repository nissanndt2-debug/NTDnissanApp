import type { Grade } from './constants';

/**
 * Catalogo de zonas de la carroceria y de los hallazgos que se pueden
 * reportar en cada una.
 *
 * Nace de la hoja de inspeccion de planta (17 areas + clasificacion de que
 * incidentes obligan reparacion fisica). En vez de convertir esas 17 areas en
 * 17 pasos de un checklist, aqui son el menu CONTEXTUAL que aparece al tocar
 * una zona del esquema: el operador solo interactua cuando encuentra algo,
 * nunca recorre nada que este bien. Gestion por excepcion, no inspeccion
 * exhaustiva — es la decision de diseno de la que cuelga todo este archivo.
 *
 * Sistema de coordenadas del esquema: viewBox 0 0 320 640, vista superior del
 * vehiculo con el frente arriba.
 */

export interface Zone {
  id: string;
  /** Codigo corto impreso dentro del panel en el esquema. */
  code: string;
  label: string;
  /** Rectangulo del panel en coordenadas del viewBox. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Panel de carroceria vs. rueda: se dibujan distinto. */
  kind: 'panel' | 'wheel';
}

export const ZONES: Zone[] = [
  // Frente
  { id: 'def_del', code: 'DEF', label: 'Defensa delantera', x: 54, y: 36, w: 212, h: 44, kind: 'panel' },
  { id: 'salp_izq', code: 'SI', label: 'Salpicadera izq.', x: 54, y: 86, w: 56, h: 96, kind: 'panel' },
  { id: 'cofre', code: 'COFRE', label: 'Cofre', x: 116, y: 86, w: 88, h: 96, kind: 'panel' },
  { id: 'salp_der', code: 'SD', label: 'Salpicadera der.', x: 210, y: 86, w: 56, h: 96, kind: 'panel' },

  // Cabina
  { id: 'parabrisas', code: 'PARABRISAS', label: 'Parabrisas', x: 54, y: 188, w: 212, h: 46, kind: 'panel' },
  { id: 'pta_del_izq', code: 'PDI', label: 'Puerta del. izq.', x: 54, y: 240, w: 56, h: 86, kind: 'panel' },
  { id: 'toldo', code: 'TOLDO', label: 'Toldo', x: 116, y: 240, w: 88, h: 176, kind: 'panel' },
  { id: 'pta_del_der', code: 'PDD', label: 'Puerta del. der.', x: 210, y: 240, w: 56, h: 86, kind: 'panel' },
  { id: 'pta_tra_izq', code: 'PTI', label: 'Puerta tras. izq.', x: 54, y: 332, w: 56, h: 84, kind: 'panel' },
  { id: 'pta_tra_der', code: 'PTD', label: 'Puerta tras. der.', x: 210, y: 332, w: 56, h: 84, kind: 'panel' },

  // Cola
  { id: 'medallon', code: 'MEDALLON', label: 'Medallon', x: 54, y: 422, w: 212, h: 46, kind: 'panel' },
  { id: 'cost_izq', code: 'CI', label: 'Costado tras. izq.', x: 54, y: 474, w: 56, h: 74, kind: 'panel' },
  { id: 'cajuela', code: 'CAJUELA', label: 'Cajuela', x: 116, y: 474, w: 88, h: 74, kind: 'panel' },
  { id: 'cost_der', code: 'CD', label: 'Costado tras. der.', x: 210, y: 474, w: 56, h: 74, kind: 'panel' },
  { id: 'def_tra', code: 'DEF', label: 'Defensa trasera', x: 54, y: 554, w: 212, h: 44, kind: 'panel' },

  // Ruedas
  { id: 'rueda_di', code: '', label: 'Rueda del. izq.', x: 24, y: 150, w: 24, h: 62, kind: 'wheel' },
  { id: 'rueda_dd', code: '', label: 'Rueda del. der.', x: 272, y: 150, w: 24, h: 62, kind: 'wheel' },
  { id: 'rueda_ti', code: '', label: 'Rueda tras. izq.', x: 24, y: 460, w: 24, h: 62, kind: 'wheel' },
  { id: 'rueda_td', code: '', label: 'Rueda tras. der.', x: 272, y: 460, w: 24, h: 62, kind: 'wheel' },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((zone) => [zone.id, zone])) as Record<
  string,
  Zone
>;

export interface OffDiagramZone {
  id: string;
  code: string;
  label: string;
}

/**
 * Zonas que no se ven en una vista superior. Van como chips debajo del
 * esquema en vez de forzar una segunda vista del vehiculo.
 *
 * "Motor" y "Electrico" de la version anterior desaparecieron: su contenido
 * (fugas, bateria, testigos de advertencia — areas 2 y 17 de la hoja) ahora
 * vive dentro de la zona Cofre, que ya es tocable en el esquema. Tener el
 * mismo hallazgo alcanzable por dos caminos solo genera duda sobre cual usar.
 */
export const OFF_DIAGRAM_ZONES: OffDiagramZone[] = [
  { id: 'interior_delantero', code: 'INT-DEL', label: 'Interior delantero' },
  { id: 'interior_trasero', code: 'INT-TRA', label: 'Interior trasero' },
  { id: 'bajos', code: 'BAJ', label: 'Bajos' },
  { id: 'documentacion', code: 'DOC', label: 'Documentacion' },
];

export function zoneLabel(id: string): string {
  return ZONE_BY_ID[id]?.label ?? OFF_DIAGRAM_ZONES.find((z) => z.id === id)?.label ?? id;
}

/**
 * Identificador estable para guardar en `defect.zone`. Antes se guardaba solo
 * la etiqueta ("Puerta del. izq."): sirve para mostrar pero no para agrupar
 * con confianza (acentos, texto que cambia). El codigo es la llave real; la
 * etiqueta va detras para que el campo se pueda seguir leyendo a simple vista
 * en la base de datos sin tener que hacer un JOIN mental con este archivo.
 */
export function zoneCode(id: string): string {
  const zone = ZONE_BY_ID[id];
  if (zone) return zone.code ? `${zone.code} - ${zone.label}` : zone.label;
  const off = OFF_DIAGRAM_ZONES.find((z) => z.id === id);
  return off ? `${off.code} - ${off.label}` : id;
}

/**
 * Recorta el prefijo de codigo de un valor guardado ("PN-AB - Abolladura" o
 * "PDI - Puerta del. izq.") para mostrarlo limpio en pantalla. El codigo es
 * para la base de datos; el operador y el supervisor solo necesitan leer el
 * texto.
 */
export function displayLabel(stored: string): string {
  const idx = stored.indexOf(' - ');
  return idx === -1 ? stored : stored.slice(idx + 3);
}

/* ------------------------------------------------------------------ */
/* Catalogo de hallazgos                                                */
/* ------------------------------------------------------------------ */

export type FindingCategory =
  | 'panel'
  | 'operation'
  | 'seal'
  | 'electrical'
  | 'tire'
  | 'cleaning'
  | 'equipment'
  | 'documentation';

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  panel: 'Carroceria',
  operation: 'Operacion',
  seal: 'Fuga o sellado',
  electrical: 'Electrico',
  tire: 'Neumatico',
  cleaning: 'Limpieza',
  equipment: 'Equipo',
  documentation: 'Documentacion',
};

/**
 * Categorias que representan horas reales de Body Shop. Las demas se
 * reportan igual — el hallazgo no se pierde — pero no inflan la cola de
 * reparacion: un gato faltante no le cuesta horas de carroceria a nadie, y
 * contarlo como si las costara desordena el tablero del admin y el orden de
 * la cola de SCM.
 */
export const HOUR_BEARING_CATEGORIES: readonly FindingCategory[] = ['panel', 'operation', 'electrical'];

export function isHourBearing(category: FindingCategory): boolean {
  return HOUR_BEARING_CATEGORIES.includes(category);
}

/** Severidad con la que arranca cada categoria cuando SI se pregunta. */
const CATEGORY_DEFAULT_GRADE: Partial<Record<FindingCategory, Grade>> = {
  panel: 'V2',
  operation: 'V2',
  electrical: 'V3',
};

/**
 * Grado interno para categorias donde la severidad no aplica (la columna es
 * NOT NULL en el esquema). No se le pregunta al operador por algo que no
 * significa nada para el.
 */
const PLACEHOLDER_GRADE: Grade = 'V3';

export interface FindingType {
  id: string;
  label: string;
  category: FindingCategory;
  /**
   * Reparacion fisica obligatoria segun la hoja de inspeccion (corrosion,
   * deformacion, abolladura, protuberancia, parte faltante, o cualquier fuga
   * / falla que impida usar la funcion). La severidad se fija sola en V1: no
   * hay nada que decidir, preguntarla solo anadiria un toque que no cambia
   * el resultado.
   */
  mandatoryRepair: boolean;
  requiresPhoto: 'always' | 'optional' | 'never';
}

export const FINDING_TYPES: FindingType[] = [
  // Carroceria — cosmeticos, severidad editable, foto siempre (es la evidencia)
  { id: 'PN-RY', label: 'Rayon', category: 'panel', mandatoryRepair: false, requiresPhoto: 'always' },
  { id: 'PN-PN', label: 'Pintura', category: 'panel', mandatoryRepair: false, requiresPhoto: 'always' },
  { id: 'PN-GL', label: 'Golpe', category: 'panel', mandatoryRepair: false, requiresPhoto: 'always' },
  { id: 'PN-FS', label: 'Fisura', category: 'panel', mandatoryRepair: false, requiresPhoto: 'always' },
  // Carroceria — reparacion obligatoria segun la hoja
  { id: 'PN-AB', label: 'Abolladura', category: 'panel', mandatoryRepair: true, requiresPhoto: 'always' },
  { id: 'PN-OX', label: 'Corrosion', category: 'panel', mandatoryRepair: true, requiresPhoto: 'always' },
  { id: 'PN-DF', label: 'Deformacion', category: 'panel', mandatoryRepair: true, requiresPhoto: 'always' },
  { id: 'PN-PR', label: 'Protuberancia', category: 'panel', mandatoryRepair: true, requiresPhoto: 'always' },
  { id: 'PN-PF', label: 'Parte faltante', category: 'panel', mandatoryRepair: true, requiresPhoto: 'always' },

  // Operacion — puertas y mecanismos
  { id: 'OP-RU', label: 'Ruido o dificil de operar', category: 'operation', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'OP-NC', label: 'No cierra o no abre', category: 'operation', mandatoryRepair: true, requiresPhoto: 'never' },

  // Fuga / sellado — siempre obligatorio, foto opcional (si hay mancha visible)
  { id: 'SL-AC', label: 'Fuga de aceite', category: 'seal', mandatoryRepair: true, requiresPhoto: 'optional' },
  { id: 'SL-AG', label: 'Filtracion de agua o sellado', category: 'seal', mandatoryRepair: true, requiresPhoto: 'optional' },

  // Electrico
  { id: 'EL-LZ', label: 'Luz fundida', category: 'electrical', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'EL-TE', label: 'Testigo de advertencia encendido', category: 'electrical', mandatoryRepair: false, requiresPhoto: 'never' },

  // Neumatico — no cuenta como horas de carroceria
  { id: 'TI-TP', label: 'Tapon de valvula ausente', category: 'tire', mandatoryRepair: false, requiresPhoto: 'optional' },
  { id: 'TI-PR', label: 'Presion baja', category: 'tire', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'TI-RI', label: 'Rin danado', category: 'tire', mandatoryRepair: false, requiresPhoto: 'always' },

  // Limpieza
  { id: 'CL-IN', label: 'Vestiduras o alfombras sucias', category: 'cleaning', mandatoryRepair: false, requiresPhoto: 'never' },

  // Equipo faltante
  { id: 'EQ-TP', label: 'Tapon faltante', category: 'equipment', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'EQ-RE', label: 'Rueda de emergencia ausente', category: 'equipment', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'EQ-GA', label: 'Gato faltante', category: 'equipment', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'EQ-KP', label: 'Kit de primeros auxilios faltante', category: 'equipment', mandatoryRepair: false, requiresPhoto: 'never' },

  // Documentacion
  { id: 'DOC-CH', label: 'Numero de chasis no coincide', category: 'documentation', mandatoryRepair: false, requiresPhoto: 'never' },
  { id: 'DOC-EQ', label: 'Hoja de equipo incompleta', category: 'documentation', mandatoryRepair: false, requiresPhoto: 'never' },
];

export const FINDING_BY_ID = Object.fromEntries(
  FINDING_TYPES.map((finding) => [finding.id, finding])
) as Record<string, FindingType>;

export function findingLabel(id: string): string {
  return FINDING_BY_ID[id]?.label ?? id;
}

export function defaultGradeFor(finding: FindingType): Grade {
  if (finding.mandatoryRepair) return 'V1';
  return CATEGORY_DEFAULT_GRADE[finding.category] ?? PLACEHOLDER_GRADE;
}

/**
 * Categoria de un `defect.type` ya guardado ("PN-AB - Abolladura" -> panel).
 * Si el prefijo no se reconoce (datos capturados antes de este catalogo) se
 * devuelve undefined y quien llama decide el comportamiento por defecto.
 */
export function categoryOfStoredType(storedType: string): FindingCategory | undefined {
  const prefix = storedType.split('-')[0];
  const finding = FINDING_TYPES.find((f) => f.id.startsWith(`${prefix}-`));
  return finding?.category;
}

/* ------------------------------------------------------------------ */
/* Menu contextual por zona                                            */
/* ------------------------------------------------------------------ */

const PANEL_PRIMARY = ['PN-RY', 'PN-AB', 'PN-GL', 'PN-PN'];
const PANEL_SECONDARY = ['PN-FS', 'PN-OX', 'PN-DF', 'PN-PR', 'PN-PF'];
const DOOR_PRIMARY_EXTRA = ['OP-NC'];
const DOOR_SECONDARY_EXTRA = ['OP-RU'];
const COFRE_EXTRA = ['SL-AC', 'SL-AG', 'EL-TE', 'EQ-TP'];
const CAJUELA_EXTRA = ['EQ-RE', 'EQ-GA', 'EQ-KP'];
const TIRE_TYPES = ['TI-TP', 'TI-PR', 'TI-RI'];
const INTERIOR_DEL_TYPES = ['CL-IN', 'EQ-KP'];
const INTERIOR_TRA_TYPES = ['CL-IN'];
const BAJOS_TYPES = ['SL-AC', 'SL-AG'];
const DOC_TYPES = ['DOC-CH', 'DOC-EQ'];

const DOOR_IDS = new Set(['pta_del_izq', 'pta_del_der', 'pta_tra_izq', 'pta_tra_der']);

interface ZoneMenuIds {
  primary: string[];
  secondary: string[];
}

function menuFor(zoneId: string): ZoneMenuIds {
  if (zoneId === 'cofre') {
    return { primary: PANEL_PRIMARY, secondary: [...PANEL_SECONDARY, ...COFRE_EXTRA] };
  }
  if (zoneId === 'cajuela') {
    return { primary: PANEL_PRIMARY, secondary: [...PANEL_SECONDARY, ...CAJUELA_EXTRA] };
  }
  if (DOOR_IDS.has(zoneId)) {
    return {
      primary: [...PANEL_PRIMARY, ...DOOR_PRIMARY_EXTRA],
      secondary: [...PANEL_SECONDARY, ...DOOR_SECONDARY_EXTRA],
    };
  }
  return { primary: PANEL_PRIMARY, secondary: PANEL_SECONDARY };
}

const OFF_DIAGRAM_MENU: Record<string, ZoneMenuIds> = {
  interior_delantero: { primary: INTERIOR_DEL_TYPES, secondary: [] },
  interior_trasero: { primary: INTERIOR_TRA_TYPES, secondary: [] },
  bajos: { primary: BAJOS_TYPES, secondary: [] },
  documentacion: { primary: DOC_TYPES, secondary: [] },
};

export interface ZoneMenu {
  primary: FindingType[];
  secondary: FindingType[];
}

/**
 * Menu contextual de una zona: primero los hallazgos mas frecuentes (caben
 * sin scroll), el resto detras de "Mas...". Las llantas y los chips fuera
 * del diagrama no comparten el set de carroceria — no tiene sentido ofrecer
 * "pintura" para una llanta.
 */
export function findingsForZone(zoneId: string): ZoneMenu {
  const zone = ZONE_BY_ID[zoneId];
  const ids: ZoneMenuIds =
    zone?.kind === 'wheel'
      ? { primary: TIRE_TYPES, secondary: [] }
      : OFF_DIAGRAM_MENU[zoneId] ?? menuFor(zoneId);

  return {
    primary: ids.primary.map((id) => FINDING_BY_ID[id]).filter((f): f is FindingType => !!f),
    secondary: ids.secondary.map((id) => FINDING_BY_ID[id]).filter((f): f is FindingType => !!f),
  };
}
