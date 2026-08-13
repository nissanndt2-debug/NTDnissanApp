import { apiRequest } from './client';
import type { AuthSession, Unit } from '@/domain/types';
import type { UnitStatus } from '@/domain/constants';
import type { AppNotification } from '@/domain/notifications';

/**
 * Mapa de endpoints del backend FastAPI (backend_python/app/routes/*).
 * Todo lo que la app consume pasa por aqui: un solo lugar que actualizar
 * si el contrato del servidor cambia.
 */

export const auth = {
  login: (email: string, password: string) =>
    apiRequest<AuthSession>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  refresh: (refreshToken: string) =>
    apiRequest<{ token: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  me: (token: string) => apiRequest<AuthSession['user']>('/auth/me', { token }),
};

export const units = {
  /**
   * OJO: el backend actual aplica LIMIT sobre filas ya unidas con defectos,
   * no sobre unidades — pedir 100 puede devolver ~30 unidades reales.
   * Ver ARQUITECTURA.md, seccion "Deuda heredada del backend".
   */
  listByStatus: (status: UnitStatus, token: string, limit = 100) =>
    apiRequest<Unit[]>(`/units/?status=${status}&limit=${limit}`, { token }),

  byId: (id: number, token: string) => apiRequest<Unit>(`/units/${id}`, { token }),

  create: (
    body: { vin: string; market: string; lane: string; registeredById: number; providerId?: number },
    token: string
  ) => apiRequest<Unit>('/units/', { method: 'POST', body, token }),

  addDefect: (
    unitId: number,
    body: {
      defectType: string;
      zone: string;
      grade: string;
      registeredById: number;
      description?: string;
      photoUrls?: string[];
    },
    token: string
  ) => apiRequest<Unit>(`/units/${unitId}/defects`, { method: 'POST', body, token }),

  updateStatus: (
    unitId: number,
    body: { newStatus: UnitStatus; changedById: number; note?: string; estimatedRepairHours?: number },
    token: string
  ) => apiRequest<Unit>(`/units/${unitId}/status`, { method: 'PUT', body, token }),

  updatePriority: (
    unitId: number,
    body: { note?: string; rank?: number; assignedById: number },
    token: string
  ) => apiRequest<Unit>(`/units/${unitId}/priority`, { method: 'PUT', body, token }),

  updateEstimatedTime: (
    unitId: number,
    body: { estimatedRepairHours: number; changedById: number },
    token: string
  ) => apiRequest<Unit>(`/units/${unitId}/estimated-time`, { method: 'PUT', body, token }),

  /**
   * OJO con el nombre de la llave: el backend lee `grade`, no `newGrade`
   * (unit_controller.update_defect_grade). Mandar la llave equivocada devuelve
   * 400 "Invalid grade", que el motor trata como no reintentable y descarta —
   * es decir, la nivelacion se perderia en silencio.
   */
  updateDefectGrade: (
    unitId: number,
    defectId: number,
    body: { grade: string; updatedById: number },
    token: string
  ) =>
    apiRequest<Unit>(`/units/${unitId}/defects/${defectId}`, {
      method: 'PUT',
      body,
      token,
    }),

  /** Reordena toda la cola de prioridad de una vez (drag & drop de SCM). */
  reorderPriority: (body: { unitIds: number[]; assignedById: number }, token: string) =>
    apiRequest<Unit[]>('/units/priority/order', { method: 'PUT', body, token }),
};

export const notifications = {
  list: (token: string, limit = 50) =>
    apiRequest<AppNotification[]>(`/notifications/?limit=${limit}`, { token }),

  markRead: (id: number, token: string) =>
    apiRequest<AppNotification>(`/notifications/${id}/read`, { method: 'PUT', token }),

  markAllRead: (token: string) =>
    apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST', token }),
};

export const pushTokens = {
  register: (deviceToken: string, token: string) =>
    apiRequest<{ ok: boolean }>('/push-tokens/', {
      method: 'POST',
      body: { token: deviceToken },
      token,
    }),

  unregister: (deviceToken: string, token: string) =>
    apiRequest<{ ok: boolean }>('/push-tokens/', {
      method: 'DELETE',
      body: { token: deviceToken },
      token,
    }),
};

export const providers = {
  // Con barra final: sin ella FastAPI responde 307 y algunos clientes pierden
  // cabeceras o cuerpo al seguir el redirect.
  list: (token: string) =>
    apiRequest<{ id: number; name: string; code?: string }[]>('/providers/', { token }),
};
