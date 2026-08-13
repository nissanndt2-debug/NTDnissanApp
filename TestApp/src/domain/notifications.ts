/**
 * Catalogo de tipos de notificacion. Espejo de
 * `backend_python/app/services/notification_service.py` — un tipo nuevo ahi
 * necesita una entrada aqui para tener etiqueta e icono en el cliente.
 */

export type NotificationType =
  | 'UNIT_REPORTED'
  | 'UNIT_RELEASED'
  | 'UNIT_DELIVERED'
  | 'UNIT_WWS_RELEASED'
  | 'UNIT_ACCEPTED'
  | 'WTY_PENDING'
  | 'WTY_RELEASED'
  | 'UNIT_REJECTED'
  | 'UNIT_RETURNED_TO_SENT'
  | 'UNIT_ARCHIVED'
  | 'UNIT_DELETION_REQUESTED'
  | 'UNIT_DELETION_APPROVED'
  | 'UNIT_DELETION_REJECTED';

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  UNIT_REPORTED: 'Nueva unidad reportada',
  UNIT_RELEASED: 'Unidad liberada por Body',
  UNIT_DELIVERED: 'Unidad entregada a Body',
  UNIT_WWS_RELEASED: 'Unidad liberada por WWS',
  UNIT_ACCEPTED: 'Unidad aceptada',
  WTY_PENDING: 'Enviada a validacion de garantia',
  WTY_RELEASED: 'Aprobada por garantia',
  UNIT_REJECTED: 'Unidad rechazada',
  UNIT_RETURNED_TO_SENT: 'Regresada a nivelacion',
  UNIT_ARCHIVED: 'Unidad archivada',
  UNIT_DELETION_REQUESTED: 'Solicitud de borrado',
  UNIT_DELETION_APPROVED: 'Borrado aprobado',
  UNIT_DELETION_REJECTED: 'Borrado rechazado',
};

/** Pantalla a la que conviene mandar al operador al tocar cada tipo. */
export const NOTIFICATION_SCREEN: Partial<Record<NotificationType, string>> = {
  UNIT_REPORTED: 'gestion',
  UNIT_DELIVERED: 'recibir',
  UNIT_RELEASED: 'gestion',
  UNIT_WWS_RELEASED: 'aceptar',
  UNIT_ACCEPTED: 'index',
  WTY_PENDING: 'validar',
  WTY_RELEASED: 'gestion',
  UNIT_REJECTED: 'gestion',
  UNIT_RETURNED_TO_SENT: 'gestion',
};

export function notificationLabel(type: string): string {
  return NOTIFICATION_LABEL[type as NotificationType] ?? type;
}

export interface AppNotification {
  id: number;
  userId: number;
  unitId: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
