/**
 * Espejo de backend_python/app/constants/index.py y del seed de
 * Docs/database-schema-postgresql.sql. Si el backend cambia, este archivo
 * es el unico punto que hay que tocar en el cliente.
 */

export const ROLE_IDS = {
  WWS: 1,
  SCM: 2,
  BODY: 3,
  CARRIER: 4,
  ADMIN: 5,
  WTY: 6,
  SCM_QUALITY: 7,
} as const;

export type RoleName = keyof typeof ROLE_IDS;
export type RoleId = (typeof ROLE_IDS)[RoleName];

export const ROLE_NAME_BY_ID = Object.fromEntries(
  Object.entries(ROLE_IDS).map(([name, id]) => [id, name])
) as Record<RoleId, RoleName>;

export const UNIT_STATUS = [
  'REPORTED',
  'SENT',
  'DELIVERED',
  'RECEIVED',
  'IN_REPAIR',
  'RELEASED',
  'WTY_PENDING',
  'WTY_RELEASED',
  'WWS_RELEASED',
  'ACCEPTED',
  'REJECTED',
  'UNAVAILABLE',
  'ARCHIVED',
] as const;

export type UnitStatus = (typeof UNIT_STATUS)[number];

export const GRADES = ['V1', 'V2', 'V3'] as const;
export type Grade = (typeof GRADES)[number];

/** Horas estimadas por severidad. Permite calcular el tiempo sin pedir red. */
export const GRADE_HOURS: Record<Grade, number> = {
  V1: 8,
  V2: 4,
  V3: 2,
};

export const PLANTS = ['A1', 'A2'] as const;
export type Plant = (typeof PLANTS)[number];

export const SCM_DECISIONS = [
  'LOAD_WITHOUT',
  'WAIT',
  'REORGANIZE',
  'NEW_TRIP',
] as const;
export type ScmDecision = (typeof SCM_DECISIONS)[number];

/**
 * Maquina de estados. El backend actual NO la valida (cualquier usuario
 * autenticado puede mover una unidad a cualquier estado), asi que el cliente
 * la aplica para evitar transiciones imposibles que despues se corrigen a mano.
 */
export const ALLOWED_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  REPORTED: ['SENT', 'WTY_PENDING'],
  SENT: ['DELIVERED'],
  DELIVERED: ['RECEIVED'],
  RECEIVED: ['IN_REPAIR', 'UNAVAILABLE'],
  IN_REPAIR: ['RELEASED', 'UNAVAILABLE'],
  RELEASED: ['WWS_RELEASED'],
  WTY_PENDING: ['WTY_RELEASED', 'SENT'],
  WTY_RELEASED: ['WWS_RELEASED'],
  WWS_RELEASED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: ['SENT'],
  UNAVAILABLE: ['IN_REPAIR', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition(from: UnitStatus, to: UnitStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export const VIN_LENGTH = 17;
export const VIN_REGEX = /^[A-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, VIN_LENGTH);
}
