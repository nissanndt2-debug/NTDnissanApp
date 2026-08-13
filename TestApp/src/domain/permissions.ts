import {
  ArrowLeftRight,
  ArrowUpDown,
  CheckCheck,
  FilePlus2,
  LayoutDashboard,
  LayoutGrid,
  History,
  Settings2,
  ShieldAlert,
  PackageCheck,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { ROLE_IDS, type RoleId } from './constants';

/**
 * Matriz de acceso. Espejo ampliado de body-app/lib/permissions.ts.
 *
 * Dos conceptos distintos que conviene no confundir:
 *  - `SCREEN_ROLES`: quien PUEDE entrar a una pantalla (por navegacion directa)
 *  - `TABS_BY_ROLE` : que aparece en la barra inferior de cada rol
 *
 * ADMIN puede entrar a todo en movil, pero sus pestanas son reducidas: en vez
 * de 8 pestanas ilegibles ve un hub "Operaciones" que lista todo. Su dashboard
 * completo vive solo en web (ver `app/dashboard.tsx`).
 */

export type ScreenName =
  | 'index'
  | 'reportar'
  | 'gestion'
  | 'recibir'
  | 'reparar'
  | 'prioridad'
  | 'validar'
  | 'aceptar'
  | 'operaciones'
  | 'historial'
  | 'control'
  | 'perfil';

const ALL_ROLES: RoleId[] = [
  ROLE_IDS.WWS,
  ROLE_IDS.SCM,
  ROLE_IDS.BODY,
  ROLE_IDS.CARRIER,
  ROLE_IDS.ADMIN,
  ROLE_IDS.WTY,
  ROLE_IDS.SCM_QUALITY,
];

export const SCREEN_ROLES: Record<ScreenName, RoleId[]> = {
  index: ALL_ROLES,
  operaciones: [ROLE_IDS.ADMIN],
  reportar: [ROLE_IDS.CARRIER, ROLE_IDS.WWS, ROLE_IDS.ADMIN],
  gestion: [ROLE_IDS.WWS, ROLE_IDS.ADMIN],
  recibir: [ROLE_IDS.BODY, ROLE_IDS.ADMIN],
  reparar: [ROLE_IDS.BODY, ROLE_IDS.ADMIN],
  prioridad: [ROLE_IDS.SCM, ROLE_IDS.ADMIN],
  validar: [ROLE_IDS.WTY, ROLE_IDS.SCM_QUALITY, ROLE_IDS.ADMIN],
  aceptar: [ROLE_IDS.CARRIER, ROLE_IDS.ADMIN],
  historial: ALL_ROLES,
  control: [ROLE_IDS.SCM, ROLE_IDS.ADMIN],
  perfil: ALL_ROLES,
};

/** Pestanas visibles por rol. Maximo 4 para que la barra siga siendo legible. */
export const TABS_BY_ROLE: Record<RoleId, ScreenName[]> = {
  [ROLE_IDS.WWS]: ['index', 'reportar', 'gestion'],
  [ROLE_IDS.SCM]: ['index', 'prioridad', 'control'],
  [ROLE_IDS.BODY]: ['index', 'recibir', 'reparar'],
  [ROLE_IDS.CARRIER]: ['index', 'reportar', 'aceptar'],
  [ROLE_IDS.WTY]: ['index', 'validar'],
  [ROLE_IDS.SCM_QUALITY]: ['index', 'validar'],
  [ROLE_IDS.ADMIN]: ['index', 'operaciones'],
};

export const SCREEN_TITLES: Record<ScreenName, string> = {
  index: 'Panel',
  operaciones: 'Operaciones',
  reportar: 'Reportar',
  gestion: 'Gestión',
  recibir: 'Recibir',
  reparar: 'Reparar',
  prioridad: 'Prioridad',
  validar: 'Validar',
  aceptar: 'Aceptar',
  historial: 'Historial',
  control: 'Control SCM',
  perfil: 'Perfil',
};

/**
 * Iconografia vectorial (Lucide), no glifos de texto. Un solo lugar donde
 * cambiar el set de iconos de toda la app: pestanas, hub del admin, panel.
 */
export const SCREEN_ICONS: Record<ScreenName, LucideIcon> = {
  index: LayoutDashboard,
  operaciones: LayoutGrid,
  reportar: FilePlus2,
  gestion: ArrowLeftRight,
  recibir: PackageCheck,
  reparar: Wrench,
  prioridad: ArrowUpDown,
  validar: ShieldCheck,
  aceptar: CheckCheck,
  historial: History,
  control: ShieldAlert,
  perfil: Settings2,
};

/** Descripcion corta para el hub del admin. */
export const SCREEN_HINTS: Record<ScreenName, string> = {
  index: 'Resumen del flujo del día',
  operaciones: '',
  reportar: 'Registrar una unidad con daño',
  gestion: 'Nivelar defectos, entregar a Body y liberar',
  recibir: 'Confirmar recepción en Body Shop',
  reparar: 'Iniciar y liberar reparaciones',
  prioridad: 'Ordenar la cola de reparación',
  validar: 'Aprobar o rechazar unidades en garantía',
  aceptar: 'Aceptar o rechazar unidades liberadas',
  historial: 'Consultar el historial y exportar a Excel',
  control: 'Resolver excepciones y solicitudes de borrado',
  perfil: 'Seguridad y administración de catálogos',
};

export function canAccess(screen: ScreenName, roleId?: RoleId | null): boolean {
  if (!roleId) return false;
  return SCREEN_ROLES[screen]?.includes(roleId) ?? false;
}

export function tabsForRole(roleId?: RoleId | null): ScreenName[] {
  if (!roleId) return ['index'];
  return TABS_BY_ROLE[roleId] ?? ['index'];
}

/** Pantallas operativas que un rol puede abrir, sin contar panel ni el hub. */
export function operationalScreens(roleId?: RoleId | null): ScreenName[] {
  if (!roleId) return [];
  return (Object.keys(SCREEN_ROLES) as ScreenName[]).filter(
    (screen) =>
      screen !== 'index' &&
      screen !== 'operaciones' &&
      screen !== 'perfil' &&
      canAccess(screen, roleId)
  );
}
