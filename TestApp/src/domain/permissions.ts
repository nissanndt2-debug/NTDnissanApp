import {
  ArrowLeftRight,
  ArrowUpDown,
  CheckCheck,
  FilePlus2,
  LayoutDashboard,
  LayoutGrid,
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
  | 'operaciones';

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
};

/** Pestanas visibles por rol. Maximo 4 para que la barra siga siendo legible. */
export const TABS_BY_ROLE: Record<RoleId, ScreenName[]> = {
  [ROLE_IDS.WWS]: ['index', 'reportar', 'gestion'],
  [ROLE_IDS.SCM]: ['index', 'prioridad'],
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
  gestion: 'Gestion',
  recibir: 'Recibir',
  reparar: 'Reparar',
  prioridad: 'Prioridad',
  validar: 'Validar',
  aceptar: 'Aceptar',
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
};

/** Descripcion corta para el hub del admin. */
export const SCREEN_HINTS: Record<ScreenName, string> = {
  index: 'Resumen del flujo del dia',
  operaciones: '',
  reportar: 'Registrar una unidad con dano',
  gestion: 'Nivelar defectos, entregar a Body y liberar',
  recibir: 'Confirmar recepcion en Body Shop',
  reparar: 'Iniciar y liberar reparaciones',
  prioridad: 'Ordenar la cola de reparacion',
  validar: 'Aprobar o rechazar unidades en garantia',
  aceptar: 'Aceptar o rechazar unidades liberadas',
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
      screen !== 'index' && screen !== 'operaciones' && canAccess(screen, roleId)
  );
}
